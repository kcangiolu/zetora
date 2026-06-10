import json
import os
from contextlib import asynccontextmanager
from typing import Any
from urllib.parse import urlparse

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

from graphiti_core import Graphiti
from graphiti_core.cross_encoder.openai_reranker_client import OpenAIRerankerClient
from graphiti_core.driver.falkordb_driver import FalkorDriver
from graphiti_core.embedder.openai import OpenAIEmbedder, OpenAIEmbedderConfig
from graphiti_core.llm_client.config import LLMConfig
from graphiti_core.llm_client.openai_generic_client import OpenAIGenericClient
from graphiti_core.utils.maintenance.graph_data_operations import clear_data


graphiti_client: Graphiti | None = None

CONFIG_FILE = os.environ.get("GRAPHITI_CONFIG_PATH", "/data/graphiti_config.json")


class LlmConfig(BaseModel):
    llm_model: str | None = None
    llm_api_key: str | None = None
    llm_base_url: str | None = None
    embedding_model: str | None = None
    embedding_api_key: str | None = None
    embedding_base_url: str | None = None


def apply_llm_config(config: LlmConfig) -> None:
    if config.llm_api_key is not None:
        os.environ["OPENAI_API_KEY"] = config.llm_api_key
    if config.llm_base_url is not None:
        os.environ["OPENAI_BASE_URL"] = config.llm_base_url
    if config.llm_model is not None:
        os.environ["LLM_MODEL"] = config.llm_model
    if config.embedding_model is not None:
        os.environ["EMBEDDING_MODEL"] = config.embedding_model
    if config.embedding_api_key is not None:
        os.environ["EMBEDDING_API_KEY"] = config.embedding_api_key
    if config.embedding_base_url is not None:
        os.environ["EMBEDDING_BASE_URL"] = config.embedding_base_url


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


async def init_graphiti_client() -> None:
    global graphiti_client
    graph_db_url = os.environ.get("GRAPH_DB_URL", "bolt://localhost:6379")
    parsed = urlparse(graph_db_url)
    host = parsed.hostname or "localhost"
    port = parsed.port or 6379
    if graphiti_client:
        try:
            await graphiti_client.close()
        except Exception:
            pass
    driver = FalkorDriver(host=host, port=port)

    llm_config = LLMConfig(
        api_key=os.environ.get("OPENAI_API_KEY") or "not-needed",
        base_url=os.environ.get("OPENAI_BASE_URL"),
        model=os.environ.get("LLM_MODEL", "gpt-4o-mini"),
    )
    llm_client = OpenAIGenericClient(config=llm_config)
    cross_encoder = OpenAIRerankerClient(config=llm_config)
    embedder = OpenAIEmbedder(
        config=OpenAIEmbedderConfig(
            api_key=os.environ.get("EMBEDDING_API_KEY") or os.environ.get("OPENAI_API_KEY") or "not-needed",
            base_url=os.environ.get("EMBEDDING_BASE_URL") or os.environ.get("OPENAI_BASE_URL"),
            embedding_model=os.environ.get("EMBEDDING_MODEL", "text-embedding-3-small"),
        )
    )

    graphiti_client = Graphiti(
        graph_driver=driver,
        llm_client=llm_client,
        embedder=embedder,
        cross_encoder=cross_encoder,
    )
    await graphiti_client.build_indices_and_constraints()


class EpisodeInput(BaseModel):
    name: str
    episode_body: str
    reference_time: str | None = None
    source_description: str = "User conversation"
    group_id: str | None = None
    entity_types: dict[str, Any] | None = None


class SearchInput(BaseModel):
    query: str
    group_id: str | None = None
    num_results: int = 10


class DeleteInput(BaseModel):
    group_id: str


@asynccontextmanager
async def lifespan(app: FastAPI):
    os.environ.setdefault("LLM_MODEL", "gpt-4o-mini")
    os.environ.setdefault("EMBEDDING_MODEL", "text-embedding-3-small")
    if os.environ.get("LLM_API_KEY"):
        os.environ["OPENAI_API_KEY"] = os.environ["LLM_API_KEY"]
    if os.environ.get("LLM_BASE_URL"):
        os.environ["OPENAI_BASE_URL"] = os.environ["LLM_BASE_URL"]

    persisted = load_persisted_config()
    if persisted:
        apply_llm_config(persisted)

    try:
        await init_graphiti_client()
    except Exception as e:
        print(f"[graphiti] Startup warning: {e}")
        print("[graphiti] No credentials configured — use POST /config to initialize.")
    yield
    if graphiti_client:
        await graphiti_client.close()


app = FastAPI(title="Zetora Graphiti Service", lifespan=lifespan)


@app.get("/health")
async def health():
    return {"status": "ok"}


@app.post("/config")
async def configure_llm(config: LlmConfig):
    """Update LLM configuration, persist it to disk, and reinitialize the Graphiti client."""
    apply_llm_config(config)
    try:
        await init_graphiti_client()
    except Exception as e:
        raise HTTPException(500, f"Failed to initialize Graphiti client: {e}")
    save_persisted_config(config)
    return {"success": True}


@app.post("/episodes")
async def add_episode(input: EpisodeInput):
    if not graphiti_client:
        raise HTTPException(500, "Graphiti not initialized")
    try:
        from datetime import datetime
        ref_time = datetime.fromisoformat(input.reference_time) if input.reference_time else datetime.utcnow()
        result = await graphiti_client.add_episode(
            name=input.name,
            episode_body=input.episode_body,
            reference_time=ref_time,
            source_description=input.source_description,
            group_id=input.group_id,
        )
        return {"success": True, "result": result}
    except Exception as e:
        raise HTTPException(500, str(e))


@app.post("/search")
async def search(input: SearchInput):
    if not graphiti_client:
        raise HTTPException(500, "Graphiti not initialized")
    try:
        results = await graphiti_client.search(
            query=input.query,
            group_ids=[input.group_id] if input.group_id else None,
            num_results=input.num_results,
        )
        return {"success": True, "results": results}
    except Exception as e:
        raise HTTPException(500, str(e))


@app.delete("/episodes")
async def delete_group(input: DeleteInput):
    if not graphiti_client:
        raise HTTPException(500, "Graphiti not initialized")
    try:
        await clear_data(graphiti_client.driver, group_ids=[input.group_id])
        return {"success": True}
    except Exception as e:
        raise HTTPException(500, str(e))


@app.get("/episodes")
async def list_episodes(group_id: str, limit: int = 50, offset: int = 0):
    """List episodes for a given group_id, most recent first, with pagination."""
    if not graphiti_client:
        raise HTTPException(500, "Graphiti not initialized")
    try:
        from datetime import datetime
        episodes = await graphiti_client.retrieve_episodes(
            reference_time=datetime.utcnow(),
            last_n=limit + offset,
            group_ids=[group_id],
        )
        episodes = list(reversed(episodes))[offset:offset + limit]
        return {
            "success": True,
            "episodes": episodes,
            "total": len(episodes),
        }
    except Exception as e:
        raise HTTPException(500, str(e))


@app.delete("/episodes/{episode_uuid}")
async def delete_episode(episode_uuid: str):
    """Delete a single episode by its UUID."""
    if not graphiti_client:
        raise HTTPException(500, "Graphiti not initialized")
    try:
        await graphiti_client.remove_episode(episode_uuid)
        return {"success": True}
    except Exception as e:
        raise HTTPException(500, str(e))
