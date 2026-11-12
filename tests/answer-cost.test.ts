import { describe, it, expect } from 'vitest';
import { answerCost } from '@/ai/catalog/cost';
import { formatCost } from '@/lib/format-cost';

const priced = { cost: { input: 2, output: 10 } };

describe('answerCost', () => {
  it('charges input and output tokens at the price per million', () => {
    expect(answerCost(priced, { inputTokens: 1_000_000, outputTokens: 500_000 })).toBeCloseTo(7);
  });

  it('charges cached input at its own price, and at the input price when it has none', () => {
    const cached = { cost: { input: 2, output: 10, cacheRead: 0.2 } };
    const usage = { inputTokens: 1_000_000, outputTokens: 0, inputTokenDetails: { cacheReadTokens: 800_000 } };
    expect(answerCost(cached, usage)).toBeCloseTo(0.2 * 2 + 0.8 * 0.2);
    expect(answerCost(priced, usage)).toBeCloseTo(2);
  });

  it('is null for a model without a price, or when no tokens were reported', () => {
    expect(answerCost({}, { inputTokens: 10, outputTokens: 10 })).toBeNull();
    expect(answerCost(undefined, { inputTokens: 10 })).toBeNull();
    expect(answerCost(priced, { inputTokens: null, outputTokens: null })).toBeNull();
  });
});

describe('formatCost', () => {
  it('keeps two significant digits below a cent, and cents above', () => {
    expect(formatCost(0.000423, 'en-US')).toBe('$0.00042');
    expect(formatCost(1.5, 'en-US')).toBe('$1.50');
    expect(formatCost(0, 'en-US')).toBe('$0.00');
    expect(formatCost(12.3, 'en-US', 'CNY')).toBe('CN¥12.30');
  });
});
