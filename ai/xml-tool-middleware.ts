import 'server-only';
import type { LanguageModelMiddleware } from 'ai';
import { morphXmlToolMiddleware, qwen3CoderToolMiddleware, hermesToolMiddleware } from '@ai-sdk-tool/parser';

// Models drift between tool-call syntaxes regardless of the format they were
// instructed to use (observed with Qwen3.6 via llama.cpp and DeepSeek via
// OpenRouter). Instead of making the user pick one protocol, instruct with
// Morph XML but parse the output through every known protocol in sequence:
// each layer converts its own format into tool-call chunks and passes
// everything else through to the next.
const parserChain = [morphXmlToolMiddleware, qwen3CoderToolMiddleware, hermesToolMiddleware];

type TransformParamsArgs = Parameters<NonNullable<LanguageModelMiddleware['transformParams']>>[0];
type WrapStreamArgs = Parameters<NonNullable<LanguageModelMiddleware['wrapStream']>>[0];
type WrapGenerateArgs = Parameters<NonNullable<LanguageModelMiddleware['wrapGenerate']>>[0];

type PromptMessage = { role: string; [key: string]: unknown };

// morphXmlToolMiddleware injects its tool-instruction system message at the
// END of the prompt when there is no leading system message. Many local chat
// templates (e.g. Qwen3 via llama.cpp) enforce "system message must be at the
// beginning" and hard-fail otherwise. Consolidate every system message into a
// single one at index 0, preserving order, so the transformed prompt stays
// compatible with those templates.
export function hoistSystemMessagesToFront(prompt: PromptMessage[]): PromptMessage[] {
  const systemMessages = prompt.filter((m) => m.role === 'system');
  if (systemMessages.length === 0) return prompt;

  const alreadyCorrect = systemMessages.length === 1 && prompt[0]?.role === 'system';
  if (alreadyCorrect) return prompt;

  const nonSystem = prompt.filter((m) => m.role !== 'system');
  return [...systemMessages, ...nonSystem];
}

export const dynamicXmlToolMiddleware: LanguageModelMiddleware = {
  specificationVersion: 'v3',

  transformParams: async (args: TransformParamsArgs) => {
    const params = await morphXmlToolMiddleware.transformParams!(args);
    const toolCallMiddleware = (params.providerOptions?.toolCallMiddleware ?? {}) as Record<string, unknown>;
    return {
      ...params,
      prompt: hoistSystemMessagesToFront(params.prompt as unknown as PromptMessage[]) as typeof params.prompt,
      providerOptions: {
        ...params.providerOptions,
        toolCallMiddleware: {
          ...toolCallMiddleware,
          // On parse failure, re-emit the raw text instead of swallowing it so
          // the next parser in the chain gets a chance to recognize the format
          // (qwen3-coder and hermes share the <tool_call> start marker).
          emitRawToolCallTextOnError: true,
        },
      },
    };
  },

  wrapStream: async (args: WrapStreamArgs) => {
    let next = args.doStream;
    for (const middleware of parserChain) {
      const doStream = next;
      next = () =>
        middleware.wrapStream!({ ...args, doStream }) as ReturnType<WrapStreamArgs['doStream']>;
    }
    return next();
  },

  wrapGenerate: async (args: WrapGenerateArgs) => {
    let next = args.doGenerate;
    for (const middleware of parserChain) {
      const doGenerate = next;
      next = () =>
        middleware.wrapGenerate!({ ...args, doGenerate }) as ReturnType<WrapGenerateArgs['doGenerate']>;
    }
    return next();
  },
};
