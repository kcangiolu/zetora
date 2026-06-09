import os
from contextlib import asynccontextmanager
from typing import Any

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

from graphiti_core import Graphiti
from graphiti_core.search import SearchConfig


graphiti_client: Graphiti | None = None


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
    global graphiti_client
    graph_db_url = os.environ.get("GRAPH_DB_URL", "bolt://localhost:6379")
    graphiti_client = Graphiti(graph_db_url)

    llm_api_key = os.environ.get("LLM_API_KEY")
    llm_base_url = os.environ.get("LLM_BASE_URL")

    if llm_api_key:
        os.environ["OPENAI_API_KEY"] = llm_api_key
    if llm_base_url:
        os.environ["OPENAI_BASE_URL"] = llm_base_url

    await graphiti_client.build_indices()
    yield
    await graphiti_client.close()


app = FastAPI(title="Zetora Graphiti Service", lifespan=lifespan)


@app.get("/health")
async def health():
    return {"status": "ok"}


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
