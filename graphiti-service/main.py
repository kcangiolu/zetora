import logging
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from typing import Any

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

from graphiti_core import Graphiti
from graphiti_core.utils.maintenance.graph_data_operations import clear_data

from client import build_graphiti_client, scoped_client
from config import LlmConfig, apply_llm_config, bootstrap_env, save_persisted_config
from helpers import paginate_most_recent_first

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(name)s] %(levelname)s %(message)s")
logger = logging.getLogger("graphiti")

graphiti_client: Graphiti | None = None


async def reinit_graphiti_client() -> None:
    global graphiti_client
    if graphiti_client:
        try:
            await graphiti_client.close()
        except Exception:
            logger.warning("Failed to close previous Graphiti client", exc_info=True)
    graphiti_client = await build_graphiti_client()


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
    num_results: int = 5


class DeleteInput(BaseModel):
    group_id: str


@asynccontextmanager
async def lifespan(app: FastAPI):
    bootstrap_env()
    try:
        await reinit_graphiti_client()
    except Exception:
        logger.warning("Startup without Graphiti client — use POST /config to initialize.", exc_info=True)
    yield
    if graphiti_client:
        await graphiti_client.close()


app = FastAPI(title="Zetora Graphiti Service", lifespan=lifespan)


def require_client() -> Graphiti:
    if not graphiti_client:
        raise HTTPException(503, "Graphiti not initialized — POST /config first")
    return graphiti_client


@app.get("/health")
async def health():
    return {"status": "ok", "initialized": graphiti_client is not None}


@app.post("/config")
async def configure_llm(config: LlmConfig):
    """Update LLM configuration, persist it to disk, and reinitialize the Graphiti client."""
    apply_llm_config(config)
    try:
        await reinit_graphiti_client()
    except Exception as e:
        logger.error("Failed to initialize Graphiti client", exc_info=True)
        raise HTTPException(500, f"Failed to initialize Graphiti client: {e}")
    save_persisted_config(config)
    return {"success": True}


@app.post("/episodes")
async def add_episode(input: EpisodeInput):
    client = require_client()
    try:
        ref_time = (
            datetime.fromisoformat(input.reference_time) if input.reference_time else datetime.now(timezone.utc)
        )
        target = scoped_client(client, input.group_id) if input.group_id else client
        result = await target.add_episode(
            name=input.name,
            episode_body=input.episode_body,
            reference_time=ref_time,
            source_description=input.source_description,
            group_id=input.group_id,
        )
        return {"success": True, "result": result}
    except Exception as e:
        logger.error("add_episode failed", exc_info=True)
        raise HTTPException(500, str(e))


@app.post("/search")
async def search(input: SearchInput):
    client = require_client()
    try:
        target = scoped_client(client, input.group_id) if input.group_id else client
        results = await target.search(
            query=input.query,
            group_ids=[input.group_id] if input.group_id else None,
            num_results=input.num_results,
        )
        return {"success": True, "results": results}
    except Exception as e:
        logger.error("search failed", exc_info=True)
        raise HTTPException(500, str(e))


@app.delete("/episodes")
async def delete_group(input: DeleteInput):
    client = require_client()
    try:
        await clear_data(client.driver.clone(database=input.group_id), group_ids=[input.group_id])
        return {"success": True}
    except Exception as e:
        logger.error("delete_group failed", exc_info=True)
        raise HTTPException(500, str(e))


@app.get("/episodes")
async def list_episodes(group_id: str, limit: int = 50, offset: int = 0):
    """List episodes for a given group_id, most recent first, with pagination."""
    client = require_client()
    try:
        target = scoped_client(client, group_id)
        episodes = await target.retrieve_episodes(
            reference_time=datetime.now(timezone.utc),
            last_n=limit + offset,
            group_ids=[group_id],
        )
        page, total_fetched = paginate_most_recent_first(episodes, limit, offset)
        return {
            "success": True,
            "episodes": page,
            "total": total_fetched,
        }
    except Exception as e:
        logger.error("list_episodes failed", exc_info=True)
        raise HTTPException(500, str(e))


@app.delete("/episodes/{episode_uuid}")
async def delete_episode(episode_uuid: str, group_id: str):
    """Delete a single episode by its UUID, scoped to its group's database."""
    client = require_client()
    try:
        target = scoped_client(client, group_id)
        await target.remove_episode(episode_uuid)
        return {"success": True}
    except Exception as e:
        logger.error("delete_episode failed", exc_info=True)
        raise HTTPException(500, str(e))
