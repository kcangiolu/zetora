import 'server-only';
import { EmptyResponseBodyError, UnsupportedFunctionalityError } from '@ai-sdk/provider';
import type {
  LanguageModelV3,
  LanguageModelV3CallOptions,
  LanguageModelV3Content,
  LanguageModelV3FinishReason,
  LanguageModelV3GenerateResult,
  LanguageModelV3Prompt,
  LanguageModelV3StreamPart,
  LanguageModelV3StreamResult,
  LanguageModelV3Usage,
  SharedV3Warning,
} from '@ai-sdk/provider';
import {
  combineHeaders,
  createJsonErrorResponseHandler,
  createJsonResponseHandler,
  generateId,
  postJsonToApi,
  type FetchFunction,
  type ParseResult,
  type ResponseHandler,
} from '@ai-sdk/provider-utils';
import { parseNdjsonStream } from './ndjson-stream';
import { ollamaChatChunkSchema, ollamaErrorSchema, type OllamaChatChunk } from './types';
import { createLogger } from '@/lib/logger';

const log = createLogger('ollama-native-model');

export interface OllamaModelConfig {
  providerId: string;
  rootURL: string;
  apiKey?: string;
  fetch?: FetchFunction;
}

interface OllamaMessage {
  role: string;
  content: string;
  tool_calls?: Array<{ function: { name: string; arguments: Record<string, unknown> } }>;
}

// Text-only for now, same scope cut as the llama.cpp native provider — file
// parts (images) are dropped with a warning rather than half-supported.
function buildOllamaMessages(prompt: LanguageModelV3Prompt): OllamaMessage[] {
  const messages: OllamaMessage[] = [];

  for (const message of prompt) {
    if (message.role === 'system') {
      messages.push({ role: 'system', content: message.content });
      continue;
    }

    if (message.role === 'user') {
      let text = '';
      for (const part of message.content) {
        if (part.type === 'text') text += part.text;
        else if (part.type === 'file') {
          log.warn('dropping non-text file part — images are not supported by the Ollama native provider yet');
        }
      }
      messages.push({ role: 'user', content: text });
      continue;
    }

    if (message.role === 'assistant') {
      let text = '';
      const toolCalls: OllamaMessage['tool_calls'] = [];
      for (const part of message.content) {
        if (part.type === 'text' || part.type === 'reasoning') text += part.text;
        else if (part.type === 'tool-call') {
          toolCalls.push({ function: { name: part.toolName, arguments: part.input as Record<string, unknown> } });
        }
      }
      messages.push({ role: 'assistant', content: text, ...(toolCalls.length > 0 ? { tool_calls: toolCalls } : {}) });
      continue;
    }

    // tool
    for (const toolResponse of message.content) {
      if (toolResponse.type === 'tool-approval-response') continue;
      const output = toolResponse.output;
      let contentValue: string;
      switch (output.type) {
        case 'text':
        case 'error-text':
          contentValue = output.value;
          break;
        case 'execution-denied':
          contentValue = output.reason ?? 'Tool execution denied.';
          break;
        case 'content':
        case 'json':
        case 'error-json':
          contentValue = JSON.stringify(output.value);
          break;
      }
      messages.push({ role: 'tool', content: contentValue });
    }
  }

  return messages;
}

function buildOllamaTools(tools: LanguageModelV3CallOptions['tools']) {
  if (!tools?.length) return undefined;
  return tools.map((tool) => {
    if (tool.type !== 'function') {
      throw new UnsupportedFunctionalityError({ functionality: `provider-executed tool "${tool.name}"` });
    }
    return { type: 'function', function: { name: tool.name, description: tool.description, parameters: tool.inputSchema } };
  });
}

function mapFinishReason(chunk: OllamaChatChunk): LanguageModelV3FinishReason {
  if (chunk.message?.tool_calls?.length) return { unified: 'tool-calls', raw: chunk.done_reason };
  if (chunk.done_reason === 'length') return { unified: 'length', raw: chunk.done_reason };
  return { unified: 'stop', raw: chunk.done_reason };
}

function toUsage(chunk: OllamaChatChunk): LanguageModelV3Usage {
  return {
    inputTokens: { total: chunk.prompt_eval_count, noCache: undefined, cacheRead: undefined, cacheWrite: undefined },
    outputTokens: { total: chunk.eval_count, text: chunk.eval_count, reasoning: undefined },
  };
}

const failedResponseHandler = createJsonErrorResponseHandler({
  errorSchema: ollamaErrorSchema,
  errorToMessage: (error) => error.error,
});

const ndjsonResponseHandler: ResponseHandler<ReadableStream<ParseResult<OllamaChatChunk>>> = async ({ response }) => {
  if (response.body == null) {
    throw new EmptyResponseBodyError({});
  }
  return {
    responseHeaders: Object.fromEntries(response.headers.entries()),
    value: parseNdjsonStream({ stream: response.body, schema: ollamaChatChunkSchema }),
  };
};

// Talks directly to Ollama's native /api/chat endpoint instead of the
// OpenAI-compatible shim: `think` is a real on/off switch for reasoning (see
// lib/reasoning-effort.ts) instead of the regex-based <think> masking used
// elsewhere, and `message.thinking` streams as genuine reasoning-delta parts.
// Ollama supports function calling natively (unlike llama.cpp's raw
// /completion), so tools/toolChoice are forwarded as-is — no XML tool
// middleware needed for this backend.
export class OllamaNativeLanguageModel implements LanguageModelV3 {
  readonly specificationVersion = 'v3' as const;
  readonly provider: string;
  readonly modelId: string;
  readonly supportedUrls: Record<string, RegExp[]> = {};

  private readonly config: OllamaModelConfig;

  constructor(modelId: string, config: OllamaModelConfig) {
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

  private buildRequestBody(options: LanguageModelV3CallOptions): {
    body: Record<string, unknown>;
    warnings: SharedV3Warning[];
  } {
    const warnings: SharedV3Warning[] = [];
    if (options.toolChoice != null && options.toolChoice.type !== 'auto') {
      warnings.push({ type: 'unsupported', feature: 'toolChoice' });
    }

    const nativeOptions = (options.providerOptions?.[this.config.providerId] ?? {}) as Record<string, unknown>;
    const { think, ...restNativeOptions } = nativeOptions;

    const body: Record<string, unknown> = {
      model: this.modelId,
      messages: buildOllamaMessages(options.prompt),
      tools: buildOllamaTools(options.tools),
      ...(think !== undefined ? { think } : {}),
      ...(options.responseFormat?.type === 'json' ? { format: options.responseFormat.schema ?? 'json' } : {}),
      options: {
        temperature: options.temperature,
        top_p: options.topP,
        top_k: options.topK,
        seed: options.seed,
        num_predict: options.maxOutputTokens,
        stop: options.stopSequences,
        ...restNativeOptions,
      },
    };

    return { body, warnings };
  }

  private contentFrom(chunk: OllamaChatChunk): LanguageModelV3Content[] {
    const content: LanguageModelV3Content[] = [];
    if (chunk.message?.content) content.push({ type: 'text', text: chunk.message.content });
    for (const toolCall of chunk.message?.tool_calls ?? []) {
      content.push({
        type: 'tool-call',
        toolCallId: generateId(),
        toolName: toolCall.function.name,
        input: JSON.stringify(toolCall.function.arguments),
      });
    }
    return content;
  }

  async doGenerate(options: LanguageModelV3CallOptions): Promise<LanguageModelV3GenerateResult> {
    const { body, warnings } = this.buildRequestBody(options);

    const {
      responseHeaders,
      value: response,
      rawValue: rawResponse,
    } = await postJsonToApi({
      url: `${this.config.rootURL}/api/chat`,
      headers: this.headers(options.headers),
      body: { ...body, stream: false },
      failedResponseHandler,
      successfulResponseHandler: createJsonResponseHandler(ollamaChatChunkSchema),
      abortSignal: options.abortSignal,
      fetch: this.config.fetch,
    });

    return {
      content: this.contentFrom(response),
      finishReason: mapFinishReason(response),
      usage: toUsage(response),
      warnings,
      request: { body },
      response: { headers: responseHeaders, body: rawResponse },
    };
  }

  async doStream(options: LanguageModelV3CallOptions): Promise<LanguageModelV3StreamResult> {
    const { body, warnings } = this.buildRequestBody(options);
    const streamBody = { ...body, stream: true };

    const { responseHeaders, value: response } = await postJsonToApi({
      url: `${this.config.rootURL}/api/chat`,
      headers: this.headers(options.headers),
      body: streamBody,
      failedResponseHandler,
      successfulResponseHandler: ndjsonResponseHandler,
      abortSignal: options.abortSignal,
      fetch: this.config.fetch,
    });

    let finishReason: LanguageModelV3FinishReason = { unified: 'other', raw: undefined };
    let usageChunk: OllamaChatChunk | null = null;
    let isActiveText = false;
    let isActiveReasoning = false;

    return {
      stream: response.pipeThrough(
        new TransformStream<ParseResult<OllamaChatChunk>, LanguageModelV3StreamPart>({
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
            const message = value.message;

            if (message?.thinking) {
              if (!isActiveReasoning) {
                controller.enqueue({ type: 'reasoning-start', id: 'reasoning-0' });
                isActiveReasoning = true;
              }
              controller.enqueue({ type: 'reasoning-delta', id: 'reasoning-0', delta: message.thinking });
            }

            if (message?.content) {
              if (isActiveReasoning) {
                controller.enqueue({ type: 'reasoning-end', id: 'reasoning-0' });
                isActiveReasoning = false;
              }
              if (!isActiveText) {
                controller.enqueue({ type: 'text-start', id: 'txt-0' });
                isActiveText = true;
              }
              controller.enqueue({ type: 'text-delta', id: 'txt-0', delta: message.content });
            }

            // Every Ollama version observed sends each function call whole in
            // a single chunk rather than incremental argument deltas — emit
            // the full start/delta/end/call sequence back-to-back per call.
            // Reasoning models commonly go straight from `thinking` to
            // `tool_calls` with no `content` chunk in between (confirmed live
            // against gemma4-65k:e4b/Ollama 0.31.1), so reasoning-end can't
            // wait for the content branch above — close it here too, or it
            // stays open until flush() and ends up sequenced after the tool
            // call events instead of before them.
            if ((message?.tool_calls?.length ?? 0) > 0 && isActiveReasoning) {
              controller.enqueue({ type: 'reasoning-end', id: 'reasoning-0' });
              isActiveReasoning = false;
            }
            for (const toolCall of message?.tool_calls ?? []) {
              const id = generateId();
              const argsJson = JSON.stringify(toolCall.function.arguments);
              controller.enqueue({ type: 'tool-input-start', id, toolName: toolCall.function.name });
              controller.enqueue({ type: 'tool-input-delta', id, delta: argsJson });
              controller.enqueue({ type: 'tool-input-end', id });
              controller.enqueue({ type: 'tool-call', toolCallId: id, toolName: toolCall.function.name, input: argsJson });
            }

            if (value.done) {
              finishReason = mapFinishReason(value);
              usageChunk = value;
            }
          },

          flush(controller) {
            if (isActiveReasoning) controller.enqueue({ type: 'reasoning-end', id: 'reasoning-0' });
            if (isActiveText) controller.enqueue({ type: 'text-end', id: 'txt-0' });
            controller.enqueue({
              type: 'finish',
              finishReason,
              usage: usageChunk ? toUsage(usageChunk) : toUsage({ done: true } as OllamaChatChunk),
            });
          },
        }),
      ),
      request: { body: streamBody },
      response: { headers: responseHeaders },
    };
  }
}
