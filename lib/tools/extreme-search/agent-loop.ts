// The research agent is not forced to call a tool at each step: several
// models refuse a forced tool call (Claude Sonnet 5.5, Opus 5.5), directly or
// through OpenRouter. A model that answers in plain text instead of calling
// done is sent back to its tools, a bounded number of times.
import type { ModelMessage } from 'ai';

import type { StepToolCalls } from './loop-guard';

export const MAX_TEXT_ANSWERS = 3;

export const KEEP_RESEARCHING =
  'You replied without calling a tool, which does not end the research. Continue it with your tools, or call done if it is complete.';

export interface AgentRun<S> {
  steps: S[];
  responseMessages: ModelMessage[];
}

// `run` drives the model from `messages` for at most `stepBudget` steps,
// `earlierSteps` being those of the previous runs.
export async function runAgentUntilDone<S extends StepToolCalls>(
  run: (messages: ModelMessage[], stepBudget: number, earlierSteps: S[]) => Promise<AgentRun<S>>,
  { prompt, maxSteps, isOver }: { prompt: string; maxSteps: number; isOver: () => boolean },
): Promise<S[]> {
  const steps: S[] = [];
  let messages: ModelMessage[] = [{ role: 'user', content: prompt }];
  for (let textAnswers = 1; ; textAnswers++) {
    const result = await run(messages, maxSteps - steps.length, steps);
    steps.push(...result.steps);
    if (!endedInText(steps) || textAnswers >= MAX_TEXT_ANSWERS || steps.length >= maxSteps || isOver()) {
      return steps;
    }
    messages = [...messages, ...result.responseMessages, { role: 'user', content: KEEP_RESEARCHING }];
  }
}

export function endedInText(steps: ReadonlyArray<StepToolCalls>): boolean {
  const last = steps.at(-1);
  return last !== undefined && last.toolCalls.length === 0;
}
