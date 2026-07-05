"""Graphiti client factory shared by the API server and the MCP server."""

import logging
import os
from urllib.parse import urlparse

from graphiti_core import Graphiti
from graphiti_core.cross_encoder.openai_reranker_client import OpenAIRerankerClient
from graphiti_core.driver.falkordb_driver import FalkorDriver
from graphiti_core.embedder.openai import OpenAIEmbedder, OpenAIEmbedderConfig
from graphiti_core.llm_client.config import LLMConfig
from graphiti_core.llm_client.openai_generic_client import OpenAIGenericClient

logger = logging.getLogger("graphiti")


async def build_graphiti_client() -> Graphiti:
    """Build a Graphiti client from the current environment (see config.py)
    and ensure graph indices exist."""
    graph_db_url = os.environ.get("GRAPH_DB_URL", "bolt://localhost:6379")
    parsed = urlparse(graph_db_url)
    driver = FalkorDriver(host=parsed.hostname or "localhost", port=parsed.port or 6379)

    llm_config = LLMConfig(
        api_key=os.environ.get("OPENAI_API_KEY") or "not-needed",
        base_url=os.environ.get("OPENAI_BASE_URL"),
        model=os.environ.get("LLM_MODEL", "gpt-4o-mini"),
    )
    embedder = OpenAIEmbedder(
        config=OpenAIEmbedderConfig(
            api_key=os.environ.get("EMBEDDING_API_KEY") or os.environ.get("OPENAI_API_KEY") or "not-needed",
            base_url=os.environ.get("EMBEDDING_BASE_URL") or os.environ.get("OPENAI_BASE_URL"),
            embedding_model=os.environ.get("EMBEDDING_MODEL", "text-embedding-3-small"),
        )
    )

    client = Graphiti(
        graph_driver=driver,
        llm_client=OpenAIGenericClient(config=llm_config),
        embedder=embedder,
        cross_encoder=OpenAIRerankerClient(config=llm_config),
    )
    await client.build_indices_and_constraints()
    logger.info("Graphiti client initialized (graph db %s)", graph_db_url)
    return client
