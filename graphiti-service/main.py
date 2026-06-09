import os
from contextlib import asynccontextmanager
from typing import Any

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

from graphiti_core import Graphiti
from graphiti_core.search import SearchConfig


graphiti_client: Graphiti | None = None


class LlmConfig(BaseModel):
    llm_model: str | None = None
    llm_api_key: str | None = None
    llm_base_url: str | None = None
    embedding_model: str | None = None
    embedding_api_key: str | None = None
    embedding_base_url: str | None = None


async def init_graphiti_client() -> None:
    global graphiti_client
    graph_db_url = os.environ.get("GRAPH_DB_URL", "bolt://localhost:6379")
    if graphiti_client:
        try:
            await graphiti_client.close()
        except Exception:
            pass
    graphiti_client = Graphiti(graph_db_url)
    await graphiti_client.build_indices()


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
    search_config: dict[str, Any] | None = None


class DeleteInput(BaseModel):
    group_id: str


@asynccontextmanager
async def lifespan(app: FastAPI):
    llm_api_key = os.environ.get("LLM_API_KEY")
    llm_base_url = os.environ.get("LLM_BASE_URL")
    llm_model = os.environ.get("LLM_MODEL", "gpt-4o-mini")
    embedding_model = os.environ.get("EMBEDDING_MODEL", "text-embedding-3-small")
    embedding_api_key = os.environ.get("EMBEDDING_API_KEY")
    embedding_base_url = os.environ.get("EMBEDDING_BASE_URL")

    if llm_api_key:
        os.environ["OPENAI_API_KEY"] = llm_api_key
    if llm_base_url:
        os.environ["OPENAI_BASE_URL"] = llm_base_url
    os.environ["LLM_MODEL"] = llm_model
    os.environ["EMBEDDING_MODEL"] = embedding_model
    if embedding_api_key:
        os.environ["EMBEDDING_API_KEY"] = embedding_api_key
    if embedding_base_url:
        os.environ["EMBEDDING_BASE_URL"] = embedding_base_url

    await init_graphiti_client()
    yield
    if graphiti_client:
        await graphiti_client.close()


app = FastAPI(title="Zetora Graphiti Service", lifespan=lifespan)


@app.get("/health")
async def health():
    return {"status": "ok"}


@app.post("/config")
async def configure_llm(config: LlmConfig):
    """Update LLM configuration and reinitialize the Graphiti client."""
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
    await init_graphiti_client()
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
        config = SearchConfig(limit=input.num_results)
        if input.search_config:
            for k, v in input.search_config.items():
                if hasattr(config, k):
                    setattr(config, k, v)

        results = await graphiti_client.search(
            query=input.query,
            group_id=input.group_id,
            config=config,
        )
        return {"success": True, "results": results}
    except Exception as e:
        raise HTTPException(500, str(e))


@app.delete("/episodes")
async def delete_group(input: DeleteInput):
    if not graphiti_client:
        raise HTTPException(500, "Graphiti not initialized")
    try:
        await graphiti_client.delete_group(input.group_id)
        return {"success": True}
    except Exception as e:
        raise HTTPException(500, str(e))


@app.get("/episodes")
async def list_episodes(group_id: str, limit: int = 50, offset: int = 0):
    """List all episodes for a given group_id, with pagination."""
    if not graphiti_client:
        raise HTTPException(500, "Graphiti not initialized")
    try:
        episodes = await graphiti_client.get_episodes(
            group_id=group_id,
            limit=limit,
            offset=offset,
        )
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
        await graphiti_client.delete_episode(episode_uuid)
        return {"success": True}
    except Exception as e:
        raise HTTPException(500, str(e))
