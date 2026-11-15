import { describe, expect, it } from 'vitest';
import type { ModelMessage } from 'ai';

import {
  KEEP_RESEARCHING,
  MAX_TEXT_ANSWERS,
  endedInText,
  runAgentUntilDone,
  type AgentRun,
} from '@/lib/tools/extreme-search/agent-loop';

type Step = { toolCalls: { toolName: string; input: unknown }[] };

const search: Step = { toolCalls: [{ toolName: 'webSearch', input: { q: 'x' } }] };
const done: Step = { toolCalls: [{ toolName: 'done', input: {} }] };
const text: Step = { toolCalls: [] };

// Plays one scripted run per call, and records what each call was given.
function scripted(runs: Step[][]) {
  const calls: { messages: ModelMessage[]; stepBudget: number; earlier: number }[] = [];
  const run = async (messages: ModelMessage[], stepBudget: number, earlierSteps: Step[]): Promise<AgentRun<Step>> => {
    calls.push({ messages, stepBudget, earlier: earlierSteps.length });
    const steps = runs[calls.length - 1] ?? [text];
    return { steps, responseMessages: [{ role: 'assistant', content: `run ${calls.length}` }] };
  };
  return { run, calls };
}

const options = { prompt: 'Compare A and B', maxSteps: 20, isOver: () => false };

describe('runAgentUntilDone', () => {
  it('runs once when the agent ends by calling done', async () => {
    const { run, calls } = scripted([[search, done]]);
    expect(await runAgentUntilDone(run, options)).toEqual([search, done]);
    expect(calls).toHaveLength(1);
    expect(calls[0].messages).toEqual([{ role: 'user', content: 'Compare A and B' }]);
  });

  it('sends an agent that answered in text back to its tools, with the rest of the step budget', async () => {
    const { run, calls } = scripted([
      [search, text],
      [search, done],
    ]);
    expect(await runAgentUntilDone(run, options)).toEqual([search, text, search, done]);
    expect(calls).toHaveLength(2);
    expect(calls[1].stepBudget).toBe(18);
    expect(calls[1].earlier).toBe(2);
    expect(calls[1].messages).toEqual([
      { role: 'user', content: 'Compare A and B' },
      { role: 'assistant', content: 'run 1' },
      { role: 'user', content: KEEP_RESEARCHING },
    ]);
  });

  it(`gives up after ${MAX_TEXT_ANSWERS} text answers`, async () => {
    const { run, calls } = scripted([]);
    const steps = await runAgentUntilDone(run, options);
    expect(calls).toHaveLength(MAX_TEXT_ANSWERS);
    expect(steps).toHaveLength(MAX_TEXT_ANSWERS);
  });

  it('does not send the agent back once the step budget or the deadline is spent', async () => {
    const budget = scripted([[search, search, text]]);
    await runAgentUntilDone(budget.run, { ...options, maxSteps: 3 });
    expect(budget.calls).toHaveLength(1);

    const deadline = scripted([[search, text]]);
    await runAgentUntilDone(deadline.run, { ...options, isOver: () => true });
    expect(deadline.calls).toHaveLength(1);
  });

  it('stops when a run ends on a tool call, as a stop condition does', async () => {
    const { run, calls } = scripted([[search, search]]);
    await runAgentUntilDone(run, options);
    expect(calls).toHaveLength(1);
  });
});

describe('endedInText', () => {
  it('is true only when the last step called no tool', () => {
    expect(endedInText([search, text])).toBe(true);
    expect(endedInText([text, search])).toBe(false);
    expect(endedInText([])).toBe(false);
  });
});
