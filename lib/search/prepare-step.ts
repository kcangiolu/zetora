// Per-step tool/system overrides for the main search streamText loop.
//
// Local models parsed via the XML tool middleware (@ai-sdk-tool/parser) need
// their tool schemas present on EVERY step: the middleware strips native tools
// into the prompt and relies on the schemas to convert the model's XML back
// into tool calls. Emptying activeTools after the first tool round (the
// standard synthesis-forcing heuristic) therefore leaks raw <web_search> XML.
// Instead, these models keep their tools armed and get a synthesis nudge
// appended to the system prompt — the hard bound is the lowered stepCountIs.
import { SOFT_STEP_BUDGET_FRACTION } from '@/lib/search/context-budget';

export const SYNTHESIS_NUDGE =
  '\n\nIMPORTANT: You have already gathered search results in the previous steps. ' +
  'Do NOT call any more tools. Write the final answer now, in the same language as ' +
  "the user's message, citing the sources already retrieved. Only call a tool again " +
  'if the previous tool call errored or returned zero results.';

export interface PrepareStepInput {
  group: string;
  shouldUseXaiMultiAgent: boolean;
  isXmlParsedCustomModel: boolean;
  latestStepHasToolRoundTrip: boolean;
  streamActiveTools: string[];
  baseSystem: string;
  // Set by the caller for a mode that should behave like the 'auto' branch
  // below instead of draining after one tool round. Currently unset by every
  // caller — reserved for a future mode that needs it.
  keepToolsArmed?: boolean;
  // Cumulative input+output tokens across every step already completed in
  // this turn (sum of step.usage.totalTokens), and the context budget it's
  // measured against (computeContextBudget() from context-budget.ts). Both
  // optional — omitted, the budget safety net below is skipped, matching the
  // pre-existing mode-only behavior (also keeps older call sites/tests valid
  // without passing them).
  cumulativeTokens?: number;
  budgetTokens?: number;
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
  latestStepHasToolRoundTrip,
  streamActiveTools,
  baseSystem,
  keepToolsArmed,
  cumulativeTokens,
  budgetTokens,
}: PrepareStepInput): PrepareStepOverride | undefined {
  // Hard safety net, checked before any mode branch below: once this turn's
  // own tool round-trips have burned through SOFT_STEP_BUDGET_FRACTION of the
  // context budget, force synthesis regardless of group/keepToolsArmed/
  // stepCount. Every mode below that keeps tools armed across steps (mcp,
  // auto, xai multi-agent) otherwise has no check between the one-time
  // pre-turn pruneToContextBudget() call and stepCountIs() running out — a
  // single turn's own fan-out (multiple search tools, each with several
  // sub-queries, across up to 15-50 steps depending on mode) can accumulate
  // far more context than the budget allows before that cap is reached.
  if (
    typeof cumulativeTokens === 'number' &&
    typeof budgetTokens === 'number' &&
    budgetTokens > 0 &&
    cumulativeTokens >= budgetTokens * SOFT_STEP_BUDGET_FRACTION
  ) {
    return isXmlParsedCustomModel
      ? {
          toolChoice: 'auto' as const,
          activeTools: streamActiveTools,
          system: baseSystem + SYNTHESIS_NUDGE,
        }
      : {
          toolChoice: 'auto' as const,
          activeTools: [],
          system: baseSystem + SYNTHESIS_NUDGE,
        };
  }

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
  if (group === 'auto' || keepToolsArmed) {
    return {
      toolChoice: 'auto' as const,
      activeTools: streamActiveTools,
    };
  }

  // Other modes: after the first completed tool round, force synthesis.
  if (latestStepHasToolRoundTrip) {
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
