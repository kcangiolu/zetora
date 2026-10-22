"""Zetora tool steps, turn ends and memory.

A relay connector only receives the gateway's text tool-progress messages, which carry no
marker telling them apart from a reply. This plugin reports each tool call of a Zetora
session as a structured start/finish event instead, POSTed to the relay service under the
same per-gateway bearer token as the WebSocket upgrade (relay-connector-contract §6.1).
Pair it with ``display.platforms.relay.tool_progress: off`` so the text lane goes quiet.

The relay contract has no end-of-turn frame either: the plugin reports the end of each turn
with its final reply, which Zetora's voice page waits for before listening again.

It is also Hermes's memory provider when ``memory.provider: zetora`` is set (memory.py).
"""

from __future__ import annotations

import logging
import queue
import threading
from collections import OrderedDict
from typing import Any, Optional
from urllib import error as urlerror

from . import relay
from .memory import ZetoraMemoryProvider

logger = logging.getLogger(__name__)

PREVIEW_MAX_CHARS = 2000
REQUEST_TIMEOUT_S = 10
QUEUE_MAX_EVENTS = 512
# One entry per Zetora chat that sent a message since the gateway started.
TRIGGERS_MAX = 1024

_triggers: "OrderedDict[str, str]" = OrderedDict()
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


def _on_admission(platform: Any = None, session_key: Any = None, message_id: Any = None, **_: Any) -> None:
    """Remember which Zetora message started the turn about to run in this chat."""
    if platform != relay.RELAY_PLATFORM or not session_key or not message_id:
        return
    with _triggers_lock:
        _triggers[session_key] = str(message_id)
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
        trigger_message_id = _triggers.get(session_key)
    _enqueue("tool-event", {
        "phase": "started",
        "chatId": chat_id,
        "toolCallId": str(tool_call_id),
        "toolName": tool_name,
        "preview": _preview(args),
        "triggerMessageId": trigger_message_id,
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
    ctx.register_hook("post_llm_call", _on_turn_end)
    ctx.register_memory_provider(ZetoraMemoryProvider())
