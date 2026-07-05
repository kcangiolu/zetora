import json
import logging
import os
from datetime import datetime, timezone
from typing import Any

from mcp.server import Server
from mcp.server.sse import SseServerTransport
from starlette.applications import Starlette
from starlette.requests import Request
from starlette.responses import JSONResponse, Response
from starlette.routing import Mount, Route
import uvicorn

from graphiti_core import Graphiti

from client import build_graphiti_client
from config import bootstrap_env

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(name)s] %(levelname)s %(message)s")
logger = logging.getLogger("graphiti-mcp")

server = Server("zetora-graphiti-mcp")
graphiti_client: Graphiti | None = None


async def init_graphiti() -> None:
    global graphiti_client
    bootstrap_env()
    graphiti_client = await build_graphiti_client()


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

    now = datetime.now(timezone.utc)

    if name == "add_memory":
        result = await graphiti_client.add_episode(
            name=f"memory-{now.isoformat()}",
            episode_body=arguments["content"],
            reference_time=now,
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


async def health(request: Request):
    return JSONResponse({"status": "ok", "initialized": graphiti_client is not None})


app = Starlette(
    routes=[
        Route("/health", endpoint=health),
        Route("/sse", endpoint=handle_sse),
        Mount("/messages/", app=sse.handle_post_message),
    ],
)

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=int(os.environ.get("PORT", "8002")))
