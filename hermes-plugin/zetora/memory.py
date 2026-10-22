"""Zetora memory as Hermes's memory provider.

Hermes reads and grows the same long-term memory as the gateway owner's Zetora chats: the
bio and core facts go into the system prompt, the facts matching each message are recalled
before it is answered, and every finished turn is offered to Zetora to learn from. Zetora
keeps every rule (what is worth remembering, sensitive facts never sent, candidates
confirmed in another conversation); this provider only carries requests.

A turn update runs on the Memory model picked in Zetora's settings, or, when none is
picked, on Hermes's own active model, the way a Zetora chat uses its own model.
"""

from __future__ import annotations

import json
import logging
from typing import Any, Optional
from urllib import error as urlerror

from agent.memory_provider import MemoryProvider

from . import relay

logger = logging.getLogger(__name__)

PLUGIN_ID = "zetora"
REQUEST_TIMEOUT_S = 10
UPDATE_MAX_TOKENS = 2000

# Mirror lib/memory/constants.ts in Zetora, which rejects any other value.
CATEGORIES = ["identity", "work", "preference", "project", "skill", "environment", "people"]
DURABILITIES = ["permanent", "months", "weeks"]
TIERS = ["always", "contextual"]

ADD_MEMORY_SCHEMA = {
    "name": "add_memory",
    "description": (
        "Save a fact about the user to long-term memory. Use it ONLY when the user explicitly asks you "
        'to remember something ("remember that…", "don\'t forget…") — everything else is learned automatically.'
    ),
    "parameters": {
        "type": "object",
        "properties": {
            "memory": {
                "type": "string",
                "description": "The fact, short (under 200 characters), self-contained, in the user's language",
            },
            "category": {"type": "string", "enum": CATEGORIES},
            "durability": {"type": "string", "enum": DURABILITIES},
            "tier": {
                "type": "string",
                "enum": TIERS,
                "description": '"always" for core facts relevant to almost every conversation, otherwise "contextual"',
            },
            "keywords": {
                "type": "array",
                "items": {"type": "string"},
                "description": "3 to 8 words or synonyms someone would use to talk about this",
            },
        },
        "required": ["memory", "category", "durability", "tier", "keywords"],
    },
}

SEARCH_MEMORIES_SCHEMA = {
    "name": "search_memories",
    "description": (
        "Search long-term memory about the user. Use it only when the user refers to something from past "
        "conversations that is not already in your context."
    ),
    "parameters": {
        "type": "object",
        "properties": {"query": {"type": "string", "description": "What to look for, as keywords"}},
        "required": ["query"],
    },
}


def _request(payload: dict[str, Any]) -> Optional[dict[str, Any]]:
    """Zetora's reply, or None when it could not be reached (logged; memory never breaks a turn)."""
    try:
        reply = relay.post_json("memory", payload, REQUEST_TIMEOUT_S)
    except (urlerror.URLError, OSError, ValueError, KeyError) as exc:
        logger.warning("zetora: memory %s request failed: %s", payload.get("action"), exc)
        return None
    if not isinstance(reply, dict):
        logger.warning("zetora: memory %s request got an unexpected reply", payload.get("action"))
        return None
    return reply


class ZetoraMemoryProvider(MemoryProvider):
    def __init__(self) -> None:
        self._session_id = ""
        self._writes = True
        self._llm: Any = None

    @property
    def name(self) -> str:
        return "zetora"

    def is_available(self) -> bool:
        return relay.is_enrolled()

    def unavailable_reason(self) -> str:
        return "this gateway is not enrolled with Zetora: run `hermes gateway enroll`"

    def initialize(self, session_id: str, **kwargs: Any) -> None:
        self._session_id = session_id
        # Subagents, cron runs and flushes read memory but must not learn from their own turns.
        self._writes = kwargs.get("agent_context", "primary") == "primary"

    def system_prompt_block(self) -> str:
        reply = _request({"action": "context"})
        return str(reply.get("systemBlock") or "") if reply else ""

    def prefetch(self, query: str, *, session_id: str = "") -> str:
        reply = _request({"action": "recall", "query": query})
        return str(reply.get("contextualBlock") or "") if reply else ""

    def sync_turn(
        self,
        user_content: str,
        assistant_content: str,
        *,
        session_id: str = "",
        messages: Optional[list[dict[str, Any]]] = None,
    ) -> None:
        if not self._writes:
            return
        origin = self._origin(session_id)
        reply = _request({"action": "turn", **origin, "user": user_content, "assistant": assistant_content})
        if not reply or reply.get("mode") != "agent":
            return
        output = self._complete(str(reply.get("prompt") or ""))
        if output:
            _request({"action": "ops", **origin, "output": output})

    def get_tool_schemas(self) -> list[dict[str, Any]]:
        return [ADD_MEMORY_SCHEMA, SEARCH_MEMORIES_SCHEMA]

    def handle_tool_call(self, tool_name: str, args: dict[str, Any], **kwargs: Any) -> str:
        if tool_name == "add_memory":
            reply = _request({"action": "remember", **self._origin(), **args})
        elif tool_name == "search_memories":
            reply = _request({"action": "search", "query": args.get("query", "")})
        else:
            return super().handle_tool_call(tool_name, args, **kwargs)
        if reply is None:
            return json.dumps({"success": False, "error": "Zetora memory is unreachable."})
        if reply.get("enabled") is False:
            return json.dumps({"success": False, "error": "Memory is turned off in Zetora's settings."})
        return json.dumps(reply)

    def _origin(self, session_id: str = "") -> dict[str, Optional[str]]:
        chat = relay.zetora_chat()
        return {"chatId": chat[0] if chat else None, "sessionId": session_id or self._session_id or None}

    def _complete(self, prompt: str) -> str:
        """Hermes's active model answering ``prompt``, or "" when the call fails (logged)."""
        if self._llm is None:
            from agent.plugin_llm import PluginLlm

            self._llm = PluginLlm(plugin_id=PLUGIN_ID)
        try:
            result = self._llm.complete(
                [{"role": "user", "content": prompt}], max_tokens=UPDATE_MAX_TOKENS, purpose="Zetora memory update"
            )
        except Exception as exc:  # the host raises provider-specific errors; none may break the turn
            logger.warning("zetora: memory update model call failed: %s", exc)
            return ""
        return result.text
