import 'server-only';
import type {
  LanguageModelV3,
  LanguageModelV3CallOptions,
  LanguageModelV3Content,
  LanguageModelV3FinishReason,
  LanguageModelV3GenerateResult,
  LanguageModelV3StreamPart,
  LanguageModelV3StreamResult,
  LanguageModelV3Usage,
  SharedV3Warning,
} from '@ai-sdk/provider';
import { UnsupportedFunctionalityError } from '@ai-sdk/provider';
import {
  combineHeaders,
  createEventSourceResponseHandler,
  createJsonErrorResponseHandler,
  createJsonResponseHandler,
  postJsonToApi,
  type FetchFunction,
  type ParseResult,
} from '@ai-sdk/provider-utils';
import { renderLlamaCppPrompt } from './llamacpp-prompt';
import { llamaCppChunkSchema, llamaCppErrorSchema, llamaCppResponseSchema, type LlamaCppChunk, type LlamaCppResponse } from './types';

export interface LlamaCppModelConfig {
  providerId: string;
  rootURL: string;
  apiKey?: string;
  fetch?: FetchFunction;
}

function mapFinishReason(response: {
  stop?: boolean;
  stopped_limit?: boolean;
  stopped_eos?: boolean;
  stopped_word?: boolean;
}): LanguageModelV3FinishReason {
  if (response.stopped_limit) return { unified: 'length', raw: 'stopped_limit' };
  if (response.stopped_eos) return { unified: 'stop', raw: 'stopped_eos' };
  if (response.stopped_word) return { unified: 'stop', raw: 'stopped_word' };
  return { unified: response.stop ? 'stop' : 'other', raw: undefined };
}

function toUsage(tokensEvaluated: number | undefined, tokensPredicted: number | undefined): LanguageModelV3Usage {
  return {
    inputTokens: { total: tokensEvaluated, noCache: undefined, cacheRead: undefined, cacheWrite: undefined },
    outputTokens: { total: tokensPredicted, text: tokensPredicted, reasoning: undefined },
  };
}

const failedResponseHandler = createJsonErrorResponseHandler({
  errorSchema: llamaCppErrorSchema,
  errorToMessage: (error) => error.error.message,
});

// Talks directly to llama.cpp server's native /completion endpoint instead of
// the OpenAI-compatible /v1/chat/completions shim, to get real assistant
// prefill (see renderLlamaCppPrompt) plus native sampling knobs (grammar,
// mirostat, cache_prompt...) passed through providerOptions[providerId].
// /completion has no tool-calling protocol at all — callers must route tools
// through the XML tool middleware (forced for this backend in
// ai/providers.ts::resolveModel) so `tools` always arrives empty here.
export class LlamaCppNativeLanguageModel implements LanguageModelV3 {
  readonly specificationVersion = 'v3' as const;
  readonly provider: string;
  readonly modelId: string;
  readonly supportedUrls: Record<string, RegExp[]> = {};

  private readonly config: LlamaCppModelConfig;

  constructor(modelId: string, config: LlamaCppModelConfig) {
    this.modelId = modelId;
    this.provider = config.providerId;
    this.config = config;
  }

  private headers(callHeaders?: Record<string, string | undefined>) {
    return combineHeaders(
      { ...(this.config.apiKey ? { Authorization: `Bearer ${this.config.apiKey}` } : {}) },
      callHeaders,
    );
  }

  private async buildRequestBody(
    options: LanguageModelV3CallOptions,
  ): Promise<{ body: Record<string, unknown>; warnings: SharedV3Warning[] }> {
    if (options.tools?.length) {
      throw new UnsupportedFunctionalityError({
        functionality: 'tools (llama.cpp native /completion has no tool-calling protocol)',
      });
    }

    const warnings: SharedV3Warning[] = [];
    if (options.toolChoice != null) {
      warnings.push({ type: 'unsupported', feature: 'toolChoice' });
    }

    const nativeOptions = (options.providerOptions?.[this.config.providerId] ?? {}) as Record<string, unknown>;

    const { promptText, stopSequences } = await renderLlamaCppPrompt(options.prompt, {
      rootURL: this.config.rootURL,
      fetch: this.config.fetch,
      enableThinking: nativeOptions.enable_thinking as boolean | undefined,
    });

    const body: Record<string, unknown> = {
      prompt: promptText,
      temperature: options.temperature,
      top_p: options.topP,
      top_k: options.topK,
      n_predict: options.maxOutputTokens,
      seed: options.seed,
      cache_prompt: true,
      stop: [...stopSequences, ...(options.stopSequences ?? [])],
      ...(options.responseFormat?.type === 'json' && options.responseFormat.schema
        ? { json_schema: options.responseFormat.schema }
        : {}),
      ...nativeOptions,
    };

    return { body, warnings };
  }

  private contentFrom(response: LlamaCppResponse): LanguageModelV3Content[] {
    return response.content.length > 0 ? [{ type: 'text', text: response.content }] : [];
  }

  async doGenerate(options: LanguageModelV3CallOptions): Promise<LanguageModelV3GenerateResult> {
    const { body, warnings } = await this.buildRequestBody(options);

    const {
      responseHeaders,
      value: response,
      rawValue: rawResponse,
    } = await postJsonToApi({
      url: `${this.config.rootURL}/completion`,
      headers: this.headers(options.headers),
      body,
      failedResponseHandler,
      successfulResponseHandler: createJsonResponseHandler(llamaCppResponseSchema),
      abortSignal: options.abortSignal,
      fetch: this.config.fetch,
    });

    return {
      content: this.contentFrom(response),
      finishReason: mapFinishReason(response),
      usage: toUsage(response.tokens_evaluated, response.tokens_predicted),
      warnings,
      request: { body },
      response: { headers: responseHeaders, body: rawResponse },
    };
  }

  async doStream(options: LanguageModelV3CallOptions): Promise<LanguageModelV3StreamResult> {
    const { body, warnings } = await this.buildRequestBody(options);
    const streamBody = { ...body, stream: true };

    const { responseHeaders, value: response } = await postJsonToApi({
      url: `${this.config.rootURL}/completion`,
      headers: this.headers(options.headers),
      body: streamBody,
      failedResponseHandler,
      successfulResponseHandler: createEventSourceResponseHandler(llamaCppChunkSchema),
      abortSignal: options.abortSignal,
      fetch: this.config.fetch,
    });

    let finishReason: LanguageModelV3FinishReason = { unified: 'other', raw: undefined };
    let tokensEvaluated: number | undefined;
    let tokensPredicted: number | undefined;
    let isFirstChunk = true;

    return {
      stream: response.pipeThrough(
        new TransformStream<ParseResult<LlamaCppChunk>, LanguageModelV3StreamPart>({
          start(controller) {
            controller.enqueue({ type: 'stream-start', warnings });
          },

          transform(chunk, controller) {
            if (options.includeRawChunks) {
              controller.enqueue({ type: 'raw', rawValue: chunk.rawValue });
            }

            if (!chunk.success) {
              finishReason = { unified: 'error', raw: undefined };
              controller.enqueue({ type: 'error', error: chunk.error });
              return;
            }

            const value = chunk.value;

            if ('error' in value) {
              finishReason = { unified: 'error', raw: undefined };
              controller.enqueue({ type: 'error', error: value.error });
              return;
            }

            if (isFirstChunk) {
              isFirstChunk = false;
              controller.enqueue({ type: 'text-start', id: 'txt-0' });
            }

            if (value.content.length > 0) {
              controller.enqueue({ type: 'text-delta', id: 'txt-0', delta: value.content });
            }

            if (value.stop) {
              finishReason = mapFinishReason(value);
              tokensEvaluated = value.tokens_evaluated;
              tokensPredicted = value.tokens_predicted;
            }
          },

          flush(controller) {
            if (!isFirstChunk) {
              controller.enqueue({ type: 'text-end', id: 'txt-0' });
            }
            controller.enqueue({
              type: 'finish',
              finishReason,
              usage: toUsage(tokensEvaluated, tokensPredicted),
            });
          },
        }),
      ),
      request: { body: streamBody },
      response: { headers: responseHeaders },
    };
  }
}
