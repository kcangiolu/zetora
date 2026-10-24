import { describe, it, expect } from 'vitest';

import { isRepeatingToolCall } from '@/lib/tools/extreme-search/loop-guard';

const call = (toolName: string, input: unknown) => ({ toolCalls: [{ toolName, input }] });
const think = (thought: string) => call('thinking', { thought });

describe('isRepeatingToolCall', () => {
  it('stops on the same call three times, thinking steps in between', () => {
    const code = { title: 'Build', code: 'print(1)' };
    const steps = [
      think('a'),
      call('codeRunner', code),
      think('b'),
      call('codeRunner', code),
      think('c'),
      call('codeRunner', code),
    ];
    expect(isRepeatingToolCall(steps)).toBe(true);
  });

  it('keeps going when the input changes', () => {
    const steps = [
      call('webSearch', { queries: ['a'] }),
      call('webSearch', { queries: ['a'] }),
      call('webSearch', { queries: ['b'] }),
    ];
    expect(isRepeatingToolCall(steps)).toBe(false);
  });

  it('keeps going below the repeat limit', () => {
    const steps = [
      call('browsePage', { urls: ['https://example.com'] }),
      call('browsePage', { urls: ['https://example.com'] }),
    ];
    expect(isRepeatingToolCall(steps)).toBe(false);
  });

  it('ignores repeated thinking calls', () => {
    expect(isRepeatingToolCall([think('same'), think('same'), think('same')])).toBe(false);
  });
});
