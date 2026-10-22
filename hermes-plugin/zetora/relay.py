"""What this plugin shares: the Zetora chat a session belongs to, and signed calls to the relay.

Calls carry the same per-gateway bearer token as the WebSocket upgrade
(relay-connector-contract §6.1), built from what `hermes gateway enroll` set.
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import json
import os
import time
from typing import Any, Optional
from urllib import request as urlrequest
from urllib.parse import urlsplit, urlunsplit

# Hermes runs a Zetora chat as a session on its generic relay platform.
RELAY_PLATFORM = "relay"
TOKEN_TTL_S = 300
REQUIRED_ENV = ("GATEWAY_RELAY_URL", "GATEWAY_RELAY_ID", "GATEWAY_RELAY_SECRET")


def session_env(name: str) -> str:
    # The gateway binds the current chat to the agent thread; hook payloads carry the Hermes
    # session id but not the chat it belongs to.
    from gateway.session_context import get_session_env

    return get_session_env(name, "")


def zetora_chat() -> Optional[tuple[str, str]]:
    """(chat_id, session_key) of the Zetora chat this session runs, or None elsewhere."""
    if session_env("HERMES_SESSION_PLATFORM") != RELAY_PLATFORM:
        return None
    chat_id = session_env("HERMES_SESSION_CHAT_ID")
    session_key = session_env("HERMES_SESSION_KEY")
    return (chat_id, session_key) if chat_id else None


def is_enrolled() -> bool:
    return all(os.environ.get(name) for name in REQUIRED_ENV)


def _endpoint(path: str) -> str:
    """``wss://host/relay`` -> ``https://host/relay/<path>``."""
    parts = urlsplit(os.environ["GATEWAY_RELAY_URL"])
    scheme = {"wss": "https", "ws": "http"}.get(parts.scheme, parts.scheme)
    return urlunsplit((scheme, parts.netloc, f"{parts.path.rstrip('/')}/{path}", "", ""))


def _bearer_token() -> str:
    gateway_id = os.environ["GATEWAY_RELAY_ID"]
    exp = str(int(time.time()) + TOKEN_TTL_S)
    sig = hmac.new(
        os.environ["GATEWAY_RELAY_SECRET"].encode(), f"{gateway_id}:{exp}".encode(), hashlib.sha256
    ).hexdigest()
    return base64.urlsafe_b64encode(f"{gateway_id}:{exp}:{sig}".encode()).decode().rstrip("=")


def post_json(path: str, payload: dict[str, Any], timeout: float) -> Any:
    """POST ``payload`` to ``/relay/<path>`` and return the decoded reply. Raises on any failure."""
    req = urlrequest.Request(
        _endpoint(path),
        data=json.dumps(payload).encode(),
        headers={"Content-Type": "application/json", "Authorization": f"Bearer {_bearer_token()}"},
        method="POST",
    )
    with urlrequest.urlopen(req, timeout=timeout) as res:
        return json.loads(res.read() or b"null")
