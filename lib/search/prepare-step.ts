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

// Image tools are terminal deliverables, not research steps: once one
// resolves, keeping tools armed with no synthesis signal (the normal 'auto'
// behavior) leaves the model re-invoked on the tool result with nothing
// telling it this is a continuation, not a fresh turn — it then writes a
// whole new unprompted reply. Force the same synthesis-forcing path the
// non-auto modes use instead.
const IMAGE_TOOL_NAMES = new Set(['generate_image', 'edit_image']);

export interface PrepareStepInput {
  group: string;
  shouldUseXaiMultiAgent: boolean;
  isXmlParsedCustomModel: boolean;
  model: string;
  latestStepHasToolRoundTrip: boolean;
  latestStepToolNames: string[];
  streamActiveTools: string[];
  baseSystem: string;
  // Set by the caller when `group` is a registered extension mode
  // (lib/search/extension-modes.ts) with keepToolsArmed: true — behaves
  // like the 'auto' branch below instead of draining after one tool round.
  keepToolsArmed?: boolean;
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
  latestStepToolNames,
  streamActiveTools,
  baseSystem,
  keepToolsArmed,
}: PrepareStepInput): PrepareStepOverride | undefined {
  const latestStepHasImageToolRoundTrip =
    latestStepHasToolRoundTrip && latestStepToolNames.some((name) => IMAGE_TOOL_NAMES.has(name));
  // MCP mode and xAI multi-agent mode: keep tools available across steps.
  if (group === 'mcp' || shouldUseXaiMultiAgent) {
    return shouldUseXaiMultiAgent
      ? {
          toolChoice: 'auto' as const,
          activeTools: ['xai_web_search', 'xai_x_search'],
        }
      : undefined;
  }

  // Auto mode (and any extension mode opting into keepToolsArmed): the model
  // loads a skill/tool via a tool call and then keeps researching with it —
  // never drain activeTools mid-run like the single-tool-round-then-
  // synthesize modes below.
  if ((group === 'auto' || keepToolsArmed) && !latestStepHasImageToolRoundTrip) {
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
