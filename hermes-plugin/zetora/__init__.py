"""Zetora tool steps, turn ends and memory.

A relay connector only receives the gateway's text tool-progress messages, which carry no
marker telling them apart from a reply. This plugin reports each tool call of a Zetora
session as a structured start/finish event instead, POSTed to the relay service under the
same per-gateway bearer token as the WebSocket upgrade (relay-connector-contract §6.1).
Pair it with ``display.platforms.relay.tool_progress: off`` so the text lane goes quiet.

The relay contract has no end-of-turn frame either: the plugin reports the end of each turn
with its final reply, which Zetora's voice page waits for before listening again.

A message spoken on Zetora's voice page gets its reply read aloud: the plugin tells the agent
so for that turn, which it would otherwise answer like any typed message.

It is also Hermes's memory provider when ``memory.provider: zetora`` is set (memory.py).
"""

from __future__ import annotations

import logging
import queue
import threading
from collections import OrderedDict
from typing import Any, NamedTuple, Optional
from urllib import error as urlerror

from . import relay
from .memory import ZetoraMemoryProvider

logger = logging.getLogger(__name__)

PREVIEW_MAX_CHARS = 2000
REQUEST_TIMEOUT_S = 10
QUEUE_MAX_EVENTS = 512
# One entry per Zetora chat that sent a message since the gateway started.
TRIGGERS_MAX = 1024
# The chat topic Zetora's voice page sends with every spoken message (lib/hermes/send.ts):
# the only mark of a spoken turn that reaches a plugin. Change both together.
VOICE_CHAT_TOPIC = (
    "Voice conversation: the user speaks through speech-to-text and hears every reply read aloud by text-to-speech."
)
SPOKEN_TURN_CONTEXT = (
    "This message was spoken, and your reply will be read aloud by text-to-speech: answer the way you would talk. "
    "Keep it to a few short sentences of plain prose, the answer first. No markdown, lists, tables, headings or "
    "code, and do not read out file paths, URLs, commands, IDs or IP addresses: say what they are in words. "
    "Ask at most one question at a time. Speech recognition can turn noise into a filler word: a transcript of "
    "one or two words such as \"okay\" or \"mm-hmm\" is not approval to run a tool or take an action, so ask "
    "again before acting on it."
)


class _Turn(NamedTuple):
    """The Zetora message that started the turn about to run in a chat."""

    message_id: str
    spoken: bool


_triggers: "OrderedDict[str, _Turn]" = OrderedDict()
_triggers_lock = threading.Lock()
# (relay path, event) pairs.
_events: "queue.Queue[tuple[str, dict[str, Any]]]" = queue.Queue(maxsize=QUEUE_MAX_EVENTS)
_worker_lock = threading.Lock()
_worker: Optional[threading.Thread] = None


def _deliver_forever() -> None:
    # One worker keeps a call's start ahead of its finish, and both ahead of the turn's end.
    while True:
        path, event = _events.get()
        try:
            relay.post_json(path, event, REQUEST_TIMEOUT_S)
        except (urlerror.URLError, OSError, ValueError, KeyError) as exc:
            logger.warning("zetora: could not report %s for chat %s: %s", path, event.get("chatId"), exc)


def _enqueue(path: str, event: dict[str, Any]) -> None:
    global _worker
    with _worker_lock:
        if _worker is None:
            _worker = threading.Thread(target=_deliver_forever, name="zetora-tool-steps", daemon=True)
            _worker.start()
    try:
        _events.put_nowait((path, event))
    except queue.Full:
        logger.warning("zetora: event queue full, dropped %s for chat %s", path, event.get("chatId"))


def _preview(args: Any) -> Optional[str]:
    """The call's first non-empty string argument: the command, query, URL or path."""
    if not isinstance(args, dict):
        return None
    for value in args.values():
        if isinstance(value, str) and value.strip():
            text = value.strip()
            return text if len(text) <= PREVIEW_MAX_CHARS else f"{text[: PREVIEW_MAX_CHARS - 1]}…"
    return None


def _is_reported(tool_name: Any, tool_call_id: Any) -> bool:
    # Underscore-prefixed tools are Hermes internals, not steps the user asked for.
    return bool(tool_call_id) and isinstance(tool_name, str) and not tool_name.startswith("_")


def _on_admission(
    platform: Any = None, session_key: Any = None, message_id: Any = None, source: Any = None, **_: Any
) -> None:
    """Remember which Zetora message started the turn about to run in this chat."""
    if platform != relay.RELAY_PLATFORM or not session_key or not message_id:
        return
    spoken = isinstance(source, dict) and source.get("chat_topic") == VOICE_CHAT_TOPIC
    with _triggers_lock:
        _triggers[session_key] = _Turn(str(message_id), spoken)
        _triggers.move_to_end(session_key)
        while len(_triggers) > TRIGGERS_MAX:
            _triggers.popitem(last=False)


def _on_pre_tool_call(tool_name: Any = None, args: Any = None, tool_call_id: Any = None, **_: Any) -> None:
    if not _is_reported(tool_name, tool_call_id):
        return
    chat = relay.zetora_chat()
    if chat is None:
        return
    chat_id, session_key = chat
    with _triggers_lock:
        trigger = _triggers.get(session_key)
    _enqueue("tool-event", {
        "phase": "started",
        "chatId": chat_id,
        "toolCallId": str(tool_call_id),
        "toolName": tool_name,
        "preview": _preview(args),
        "triggerMessageId": trigger.message_id if trigger else None,
    })


def _on_post_tool_call(
    tool_name: Any = None, tool_call_id: Any = None, status: Any = None, duration_ms: Any = None, **_: Any
) -> None:
    if not _is_reported(tool_name, tool_call_id):
        return
    chat = relay.zetora_chat()
    if chat is None:
        return
    _enqueue("tool-event", {
        "phase": "finished",
        "chatId": chat[0],
        "toolCallId": str(tool_call_id),
        "status": status,
        "durationMs": duration_ms,
    })


def _on_turn_start(platform: Any = None, **_: Any) -> Optional[dict[str, str]]:
    """Asks for a speakable reply when the turn's message was spoken. Hermes adds the context
    to that message only, so a typed message in the same chat gets the usual reply."""
    # A subagent's reply goes to its parent, not to the user's ears.
    if platform == "subagent":
        return None
    chat = relay.zetora_chat()
    if chat is None:
        return None
    with _triggers_lock:
        trigger = _triggers.get(chat[1])
    return {"context": SPOKEN_TURN_CONTEXT} if trigger and trigger.spoken else None


def _on_turn_end(assistant_response: Any = None, platform: Any = None, **_: Any) -> None:
    # A subagent runs in its parent's chat context; its end is not the turn's.
    if platform == "subagent":
        return
    chat = relay.zetora_chat()
    if chat is None:
        return
    response = assistant_response if isinstance(assistant_response, str) else None
    _enqueue("turn-event", {"chatId": chat[0], "response": response})


def register(ctx) -> None:
    # Fails the plugin load, visibly in `hermes plugins list`, if the session context moved.
    from gateway.session_context import get_session_env  # noqa: F401

    ctx.register_hook("post_gateway_admission", _on_admission)
    ctx.register_hook("pre_tool_call", _on_pre_tool_call)
    ctx.register_hook("post_tool_call", _on_post_tool_call)
    ctx.register_hook("pre_llm_call", _on_turn_start)
    ctx.register_hook("post_llm_call", _on_turn_end)
    ctx.register_memory_provider(ZetoraMemoryProvider())
