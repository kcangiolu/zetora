// Per-step tool/system overrides for the main search streamText loop.
//
// Local models parsed via the XML tool middleware (@ai-sdk-tool/parser) need
// their tool schemas present on EVERY step: the middleware strips native tools
// into the prompt and relies on the schemas to convert the model's XML back
// into tool calls. Emptying activeTools after the first tool round (the
// standard synthesis-forcing heuristic) therefore leaks raw <web_search> XML.
// Instead, these models keep their tools armed and get a synthesis nudge
// appended to the system prompt — the hard bound is the lowered stepCountIs.

export const SYNTHESIS_NUDGE =
  '\n\nIMPORTANT: You have already gathered search results in the previous steps. ' +
  'Do NOT call any more tools. Write the final answer now, in the same language as ' +
  "the user's message, citing the sources already retrieved. Only call a tool again " +
  'if the previous tool call errored or returned zero results.';

export interface PrepareStepInput {
  group: string;
  shouldUseXaiMultiAgent: boolean;
  isXmlParsedCustomModel: boolean;
  model: string;
  latestStepHasToolRoundTrip: boolean;
  streamActiveTools: string[];
  baseSystem: string;
}

export interface PrepareStepOverride {
  toolChoice: 'auto';
  activeTools: string[];
  system?: string;
}

export function resolvePrepareStepOverride({
  group,
  shouldUseXaiMultiAgent,
  isXmlParsedCustomModel,
  model,
  latestStepHasToolRoundTrip,
  streamActiveTools,
  baseSystem,
}: PrepareStepInput): PrepareStepOverride | undefined {
  // MCP mode and xAI multi-agent mode: keep tools available across steps.
  if (group === 'mcp' || shouldUseXaiMultiAgent) {
    return shouldUseXaiMultiAgent
      ? {
          toolChoice: 'auto' as const,
          activeTools: ['xai_web_search', 'xai_x_search'],
        }
      : undefined;
  }

  // Auto mode: the model loads a skill via a tool call and then keeps
  // researching with it — never drain activeTools mid-run like the
  // single-tool-round-then-synthesize modes below.
  if (group === 'auto') {
    return {
      toolChoice: 'auto' as const,
      activeTools: streamActiveTools,
    };
  }

  // Other modes: after the first completed tool round, force synthesis.
  if (latestStepHasToolRoundTrip && model !== 'zetora-sarvam-105b') {
    if (isXmlParsedCustomModel) {
      // Keep the schemas armed (the XML middleware needs them to parse any
      // further tool call the model emits) and nudge toward synthesis instead.
      return {
        toolChoice: 'auto' as const,
        activeTools: streamActiveTools,
        system: baseSystem + SYNTHESIS_NUDGE,
      };
    }
    return {
      toolChoice: 'auto' as const,
      activeTools: [],
    };
  }

  return {
    toolChoice: 'auto' as const,
    activeTools: streamActiveTools,
  };
}
