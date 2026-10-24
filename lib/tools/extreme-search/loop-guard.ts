// A research agent that sends the very same tool call again and again is stuck: the
// repeats return the same result and only burn the step budget. thinking calls are
// skipped because the agent interleaves one between every other call.

type ToolCall = { toolName: string; input: unknown };
// The SDK types a call to an optional tool (fileQuery) as possibly undefined.
type StepToolCalls = { toolCalls: ReadonlyArray<ToolCall | undefined> };

export const MAX_IDENTICAL_TOOL_CALLS = 3;

export function isRepeatingToolCall(steps: ReadonlyArray<StepToolCalls>, maxIdentical = MAX_IDENTICAL_TOOL_CALLS) {
  const calls = steps
    .flatMap((step) => step.toolCalls)
    .filter((call): call is ToolCall => call !== undefined && call.toolName !== 'thinking')
    .slice(-maxIdentical)
    .map((call) => `${call.toolName}:${JSON.stringify(call.input)}`);
  return calls.length === maxIdentical && calls.every((call) => call === calls[0]);
}
