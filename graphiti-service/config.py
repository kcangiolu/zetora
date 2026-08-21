"""Shared LLM/embedding configuration for the Graphiti API and MCP servers.

Configuration is applied through OPENAI_*/EMBEDDING_* environment variables
(read by client.py) and persisted to CONFIG_FILE so both containers pick up
changes made via POST /config.
"""

import json
import logging
import os

from pydantic import BaseModel

logger = logging.getLogger("graphiti")

CONFIG_FILE = os.environ.get("GRAPHITI_CONFIG_PATH", "/data/graphiti_config.json")


class LlmConfig(BaseModel):
    llm_model: str | None = None
    small_llm_model: str | None = None
    llm_api_key: str | None = None
    llm_base_url: str | None = None
    embedding_model: str | None = None
    embedding_api_key: str | None = None
    embedding_base_url: str | None = None


_ENV_BY_FIELD = {
    "llm_api_key": "OPENAI_API_KEY",
    "llm_base_url": "OPENAI_BASE_URL",
    "llm_model": "LLM_MODEL",
    "small_llm_model": "SMALL_LLM_MODEL",
    "embedding_model": "EMBEDDING_MODEL",
    "embedding_api_key": "EMBEDDING_API_KEY",
    "embedding_base_url": "EMBEDDING_BASE_URL",
}


def apply_llm_config(config: LlmConfig) -> None:
    """Project the config's non-null fields onto the environment."""
    for field, env_name in _ENV_BY_FIELD.items():
        value = getattr(config, field)
        if value is not None:
            os.environ[env_name] = value


def load_persisted_config() -> LlmConfig | None:
    try:
        with open(CONFIG_FILE) as f:
            return LlmConfig(**json.load(f))
    except (FileNotFoundError, json.JSONDecodeError, ValueError):
        return None


def save_persisted_config(update: LlmConfig) -> None:
    merged = load_persisted_config() or LlmConfig()
    for field, value in update.model_dump(exclude_none=True).items():
        setattr(merged, field, value)
    os.makedirs(os.path.dirname(CONFIG_FILE), exist_ok=True)
    with open(CONFIG_FILE, "w") as f:
        json.dump(merged.model_dump(), f)


def bootstrap_env() -> None:
    """One-time env normalization at startup: defaults, legacy LLM_* aliases,
    then any persisted config on top."""
    os.environ.setdefault("LLM_MODEL", "gpt-4o-mini")
    os.environ.setdefault("EMBEDDING_MODEL", "text-embedding-3-small")
    if os.environ.get("LLM_API_KEY"):
        os.environ["OPENAI_API_KEY"] = os.environ["LLM_API_KEY"]
    if os.environ.get("LLM_BASE_URL"):
        os.environ["OPENAI_BASE_URL"] = os.environ["LLM_BASE_URL"]

    persisted = load_persisted_config()
    if persisted:
        apply_llm_config(persisted)
        logger.info("Applied persisted config from %s", CONFIG_FILE)
