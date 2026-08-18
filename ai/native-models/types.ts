import { z } from 'zod';

// llama.cpp's /completion response — same shape for the final non-streaming
// response and each SSE chunk (the last chunk carries `stop: true` plus the
// generation stats). Deliberately narrow: only the fields this provider
// reads, so upstream llama.cpp releases can add fields without breaking us.
export const llamaCppResponseSchema = z.object({
  content: z.string(),
  stop: z.boolean().optional(),
  tokens_predicted: z.number().optional(),
  tokens_evaluated: z.number().optional(),
  truncated: z.boolean().optional(),
  stopped_eos: z.boolean().optional(),
  stopped_word: z.boolean().optional(),
  stopped_limit: z.boolean().optional(),
  stopping_word: z.string().optional(),
});

export type LlamaCppResponse = z.infer<typeof llamaCppResponseSchema>;

export const llamaCppErrorSchema = z.object({
  error: z.object({
    message: z.string(),
    type: z.string().optional(),
    code: z.union([z.number(), z.string()]).optional(),
  }),
});

export type LlamaCppError = z.infer<typeof llamaCppErrorSchema>;

// Streaming chunks can be a normal generation chunk or an inline error —
// llama.cpp emits the latter as a regular `data:` event, not an HTTP failure.
export const llamaCppChunkSchema = z.union([llamaCppResponseSchema, llamaCppErrorSchema]);

export type LlamaCppChunk = z.infer<typeof llamaCppChunkSchema>;

// Ollama /api/chat — same message shape for streaming chunks (accumulated
// piecemeal in `message.content`/`message.thinking`) and the final
// non-streaming response (message holds the full text). `tool_calls` arrive
// whole in a single chunk in every version observed so far — Ollama doesn't
// stream partial function-call JSON the way OpenAI does.
export const ollamaMessageSchema = z.object({
  role: z.string(),
  content: z.string().optional().default(''),
  thinking: z.string().optional(),
  tool_calls: z
    .array(
      z.object({
        function: z.object({
          name: z.string(),
          arguments: z.record(z.string(), z.unknown()),
        }),
      }),
    )
    .optional(),
});

export const ollamaChatChunkSchema = z.object({
  model: z.string().optional(),
  created_at: z.string().optional(),
  message: ollamaMessageSchema.optional(),
  done: z.boolean(),
  done_reason: z.string().optional(),
  prompt_eval_count: z.number().optional(),
  eval_count: z.number().optional(),
});

export type OllamaChatChunk = z.infer<typeof ollamaChatChunkSchema>;

export const ollamaErrorSchema = z.object({ error: z.string() });
export type OllamaError = z.infer<typeof ollamaErrorSchema>;
