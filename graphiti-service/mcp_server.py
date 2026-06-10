import json
import os
from typing import Any
from urllib.parse import urlparse

from mcp.server import Server
from mcp.server.sse import SseServerTransport
from starlette.applications import Starlette
from starlette.requests import Request
from starlette.responses import Response
from starlette.routing import Mount, Route
import uvicorn

from graphiti_core import Graphiti
from graphiti_core.cross_encoder.openai_reranker_client import OpenAIRerankerClient
from graphiti_core.driver.falkordb_driver import FalkorDriver
from graphiti_core.embedder.openai import OpenAIEmbedder, OpenAIEmbedderConfig
from graphiti_core.llm_client.config import LLMConfig
from graphiti_core.llm_client.openai_generic_client import OpenAIGenericClient


server = Server("zetora-graphiti-mcp")
graphiti_client: Graphiti | None = None

CONFIG_FILE = os.environ.get("GRAPHITI_CONFIG_PATH", "/data/graphiti_config.json")


def apply_persisted_config() -> None:
    try:
        with open(CONFIG_FILE) as f:
            config = json.load(f)
    except (FileNotFoundError, json.JSONDecodeError):
        return
    if config.get("llm_api_key"):
        os.environ["OPENAI_API_KEY"] = config["llm_api_key"]
    if config.get("llm_base_url"):
        os.environ["OPENAI_BASE_URL"] = config["llm_base_url"]
    if config.get("llm_model"):
        os.environ["LLM_MODEL"] = config["llm_model"]
    if config.get("embedding_model"):
        os.environ["EMBEDDING_MODEL"] = config["embedding_model"]
    if config.get("embedding_api_key"):
        os.environ["EMBEDDING_API_KEY"] = config["embedding_api_key"]
    if config.get("embedding_base_url"):
        os.environ["EMBEDDING_BASE_URL"] = config["embedding_base_url"]


async def init_graphiti():
    global graphiti_client

    llm_api_key = os.environ.get("LLM_API_KEY")
    llm_base_url = os.environ.get("LLM_BASE_URL")
    if llm_api_key:
        os.environ["OPENAI_API_KEY"] = llm_api_key
    if llm_base_url:
        os.environ["OPENAI_BASE_URL"] = llm_base_url

    apply_persisted_config()

    graph_db_url = os.environ.get("GRAPH_DB_URL", "bolt://localhost:6379")
    parsed = urlparse(graph_db_url)
    host = parsed.hostname or "localhost"
    port = parsed.port or 6379
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


@server.list_tools()
async def list_tools():
    return [
        {
            "name": "add_memory",
            "description": "Save a memory episode to the knowledge graph. Use this to remember facts, events, preferences, and relationships about the user.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "content": {"type": "string", "description": "The memory content to save"},
                    "group_id": {"type": "string", "description": "Group ID (typically the user ID)"},
                    "source": {"type": "string", "description": "Source description", "default": "Claude Code"},
                },
                "required": ["content", "group_id"],
            },
        },
        {
            "name": "search_memory",
            "description": "Search the knowledge graph for memories relevant to a query. Returns entities, relationships, and facts.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "query": {"type": "string", "description": "The search query"},
                    "group_id": {"type": "string", "description": "Group ID (typically the user ID)"},
                    "limit": {"type": "integer", "description": "Max results", "default": 10},
                },
                "required": ["query", "group_id"],
            },
        },
    ]


@server.call_tool()
async def call_tool(name: str, arguments: dict[str, Any]):
    if not graphiti_client:
        await init_graphiti()

    from datetime import datetime

    if name == "add_memory":
        result = await graphiti_client.add_episode(
            name=f"memory-{datetime.utcnow().isoformat()}",
            episode_body=arguments["content"],
            reference_time=datetime.utcnow(),
            source_description=arguments.get("source", "Claude Code"),
            group_id=arguments.get("group_id"),
        )
        return [{"type": "text", "text": json.dumps({"success": True, "episode_id": str(result)})}]

    elif name == "search_memory":
        group_id = arguments.get("group_id")
        results = await graphiti_client.search(
            query=arguments["query"],
            group_ids=[group_id] if group_id else None,
            num_results=arguments.get("limit", 10),
        )
        return [{"type": "text", "text": json.dumps({"success": True, "results": [str(r) for r in results]})}]

    return [{"type": "text", "text": json.dumps({"error": f"Unknown tool: {name}"})}]


sse = SseServerTransport("/messages/")


async def handle_sse(request: Request):
    async with sse.connect_sse(request.scope, request.receive, request._send) as streams:
        await server.run(streams[0], streams[1], server.create_initialization_options())
    return Response()


app = Starlette(
    routes=[
        Route("/sse", endpoint=handle_sse),
        Mount("/messages/", app=sse.handle_post_message),
    ],
)

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8001)
