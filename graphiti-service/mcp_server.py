import asyncio
import json
import os
from typing import Any

from mcp.server import Server
from mcp.server.sse import SseServerTransport
from starlette.applications import Starlette
from starlette.routing import Mount, Route
import uvicorn

from graphiti_core import Graphiti
from graphiti_core.search import SearchConfig


server = Server("zetora-graphiti-mcp")
graphiti_client: Graphiti | None = None


async def init_graphiti():
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
        config = SearchConfig(limit=arguments.get("limit", 10))
        results = await graphiti_client.search(
            query=arguments["query"],
            group_id=arguments.get("group_id"),
            config=config,
        )
        return [{"type": "text", "text": json.dumps({"success": True, "results": [str(r) for r in results]})}]

    return [{"type": "text", "text": json.dumps({"error": f"Unknown tool: {name}"})}]


sse = SseServerTransport("/messages/")
app = Starlette(
    routes=[
        Route("/sse", endpoint=sse.handle_sse_connection),
        Mount("/messages/", app=sse.handle_post_message),
    ],
)

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8001)
