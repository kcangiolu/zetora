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

export const dynamicXmlToolMiddleware: LanguageModelMiddleware = {
  specificationVersion: 'v3',

  transformParams: async (args: TransformParamsArgs) => {
    const params = await morphXmlToolMiddleware.transformParams!(args);
    const toolCallMiddleware = (params.providerOptions?.toolCallMiddleware ?? {}) as Record<string, unknown>;
    return {
      ...params,
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
