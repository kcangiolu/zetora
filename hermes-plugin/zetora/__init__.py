"""Zetora tool steps.

A relay connector only receives the gateway's text tool-progress messages, which carry no
marker telling them apart from a reply. This plugin reports each tool call of a Zetora
session as a structured start/finish event instead, POSTed to the relay service under the
same per-gateway bearer token as the WebSocket upgrade (relay-connector-contract §6.1).
Pair it with ``display.platforms.relay.tool_progress: off`` so the text lane goes quiet.
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import json
import logging
import os
import queue
import threading
import time
from collections import OrderedDict
from typing import Any, Optional
from urllib import error as urlerror
from urllib import request as urlrequest
from urllib.parse import urlsplit, urlunsplit

logger = logging.getLogger(__name__)

# Hermes runs a Zetora chat as a session on its generic relay platform.
RELAY_PLATFORM = "relay"
PREVIEW_MAX_CHARS = 2000
TOKEN_TTL_S = 300
REQUEST_TIMEOUT_S = 10
QUEUE_MAX_EVENTS = 512
# One entry per Zetora chat that sent a message since the gateway started.
TRIGGERS_MAX = 1024

_triggers: "OrderedDict[str, str]" = OrderedDict()
_triggers_lock = threading.Lock()
_events: "queue.Queue[dict[str, Any]]" = queue.Queue(maxsize=QUEUE_MAX_EVENTS)
_worker_lock = threading.Lock()
_worker: Optional[threading.Thread] = None


def _session_env(name: str) -> str:
    # The gateway binds the current chat to the agent thread; hook payloads carry the Hermes
    # session id but not the chat it belongs to.
    from gateway.session_context import get_session_env

    return get_session_env(name, "")


def _endpoint() -> str:
    """``wss://host/relay`` -> ``https://host/relay/tool-event``."""
    parts = urlsplit(os.environ["GATEWAY_RELAY_URL"])
    scheme = {"wss": "https", "ws": "http"}.get(parts.scheme, parts.scheme)
    return urlunsplit((scheme, parts.netloc, f"{parts.path.rstrip('/')}/tool-event", "", ""))


def _bearer_token() -> str:
    gateway_id = os.environ["GATEWAY_RELAY_ID"]
    exp = str(int(time.time()) + TOKEN_TTL_S)
    sig = hmac.new(
        os.environ["GATEWAY_RELAY_SECRET"].encode(), f"{gateway_id}:{exp}".encode(), hashlib.sha256
    ).hexdigest()
    return base64.urlsafe_b64encode(f"{gateway_id}:{exp}:{sig}".encode()).decode().rstrip("=")


def _post(event: dict[str, Any]) -> None:
    req = urlrequest.Request(
        _endpoint(),
        data=json.dumps(event).encode(),
        headers={"Content-Type": "application/json", "Authorization": f"Bearer {_bearer_token()}"},
        method="POST",
    )
    with urlrequest.urlopen(req, timeout=REQUEST_TIMEOUT_S) as res:
        res.read()


def _deliver_forever() -> None:
    # One worker keeps a call's start ahead of its finish.
    while True:
        event = _events.get()
        try:
            _post(event)
        except (urlerror.URLError, OSError, KeyError) as exc:
            logger.warning("zetora: could not report tool step %s: %s", event.get("toolCallId"), exc)


def _enqueue(event: dict[str, Any]) -> None:
    global _worker
    with _worker_lock:
        if _worker is None:
            _worker = threading.Thread(target=_deliver_forever, name="zetora-tool-steps", daemon=True)
            _worker.start()
    try:
        _events.put_nowait(event)
    except queue.Full:
        logger.warning("zetora: tool step queue full, dropped %s", event.get("toolCallId"))


def _relay_chat() -> Optional[tuple[str, str]]:
    """(chat_id, session_key) of the Zetora chat running this tool, or None elsewhere."""
    if _session_env("HERMES_SESSION_PLATFORM") != RELAY_PLATFORM:
        return None
    chat_id = _session_env("HERMES_SESSION_CHAT_ID")
    session_key = _session_env("HERMES_SESSION_KEY")
    return (chat_id, session_key) if chat_id else None


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
    if platform != RELAY_PLATFORM or not session_key or not message_id:
        return
    with _triggers_lock:
        _triggers[session_key] = str(message_id)
        _triggers.move_to_end(session_key)
        while len(_triggers) > TRIGGERS_MAX:
            _triggers.popitem(last=False)


def _on_pre_tool_call(tool_name: Any = None, args: Any = None, tool_call_id: Any = None, **_: Any) -> None:
    if not _is_reported(tool_name, tool_call_id):
        return
    chat = _relay_chat()
    if chat is None:
        return
    chat_id, session_key = chat
    with _triggers_lock:
        trigger_message_id = _triggers.get(session_key)
    _enqueue({
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
    chat = _relay_chat()
    if chat is None:
        return
    _enqueue({
        "phase": "finished",
        "chatId": chat[0],
        "toolCallId": str(tool_call_id),
        "status": status,
        "durationMs": duration_ms,
    })


def register(ctx) -> None:
    # Fails the plugin load, visibly in `hermes plugins list`, if the session context moved.
    from gateway.session_context import get_session_env  # noqa: F401

    ctx.register_hook("post_gateway_admission", _on_admission)
    ctx.register_hook("pre_tool_call", _on_pre_tool_call)
    ctx.register_hook("post_tool_call", _on_post_tool_call)
