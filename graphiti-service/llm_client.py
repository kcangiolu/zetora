"""OpenAIGenericClient subclass that actually honors LLMConfig.small_model.

graphiti_core requests ModelSize.small on every cheap/binary sub-task inside an
add_episode run (entity-type classification, edge dedup/classification — 7 call
sites across node_operations.py, edge_operations.py and combined_extraction.py).
OpenAIBaseClient (the plain OpenAI client) routes those to config.small_model via
_get_model_for_size(). OpenAIGenericClient — the client used here for OpenAI-
compatible endpoints (Ollama, OpenRouter, llama.cpp) — never inherited that: its
_generate_response always sends self.model, silently ignoring model_size. Every
sub-task ends up paying the latency of the big extraction model.

This overrides _generate_response with the same body, substituting only the
model-selection line, so ModelSize.small calls route to small_model (falling
back to the main model, not graphiti_core's OpenAI-specific default, since none
of the providers used here recognize "gpt-4.1-nano").
"""

import json
import logging
import typing

import openai
from openai.types.chat import ChatCompletionMessageParam
from pydantic import BaseModel

from graphiti_core.llm_client.config import DEFAULT_MAX_TOKENS, ModelSize
from graphiti_core.llm_client.errors import EmptyResponseError, RateLimitError
from graphiti_core.llm_client.openai_generic_client import DEFAULT_MODEL, OpenAIGenericClient
from graphiti_core.prompts.models import Message

logger = logging.getLogger("graphiti")


class SizeAwareOpenAIGenericClient(OpenAIGenericClient):
    def _get_model_for_size(self, model_size: ModelSize) -> str:
        if model_size == ModelSize.small:
            return self.small_model or self.model or DEFAULT_MODEL
        return self.model or DEFAULT_MODEL

    async def _generate_response(
        self,
        messages: list[Message],
        response_model: type[BaseModel] | None = None,
        max_tokens: int = DEFAULT_MAX_TOKENS,
        model_size: ModelSize = ModelSize.medium,
    ) -> dict[str, typing.Any]:
        openai_messages: list[ChatCompletionMessageParam] = []
        for m in messages:
            m.content = self._clean_input(m.content)
            if m.role == "user":
                openai_messages.append({"role": "user", "content": m.content})
            elif m.role == "system":
                openai_messages.append({"role": "system", "content": m.content})
        try:
            response = await self.client.chat.completions.create(
                model=self._get_model_for_size(model_size),
                messages=openai_messages,
                temperature=self.temperature,
                max_tokens=max_tokens,
                response_format=self._build_response_format(response_model),  # type: ignore[arg-type]
            )
            result = response.choices[0].message.content or ""
            if not result:
                raise EmptyResponseError("LLM returned an empty response")
            return json.loads(self._strip_code_fences(result))
        except openai.RateLimitError as e:
            raise RateLimitError from e
        except Exception as e:
            logger.error(f"Error in generating LLM response: {e}")
            raise
