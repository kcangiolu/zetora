// What an answer cost at the provider's list price (models.dev). Pure.
import type { CatalogEntry } from './types';

// The token counts of an answer, as the AI SDK reports them: inputTokens
// includes the cached ones.
export interface TokenUsage {
  inputTokens?: number | null;
  outputTokens?: number | null;
  inputTokenDetails?: { cacheReadTokens?: number; cacheWriteTokens?: number };
}

// USD, or null when the model has no known price or the provider reported no
// tokens. Cached input is charged at its own price when models.dev lists one.
export function answerCost(entry: Pick<CatalogEntry, 'cost'> | undefined, usage: TokenUsage): number | null {
  const price = entry?.cost;
  const input = usage.inputTokens ?? null;
  const output = usage.outputTokens ?? null;
  if (!price || (input === null && output === null)) return null;
  const cacheRead = usage.inputTokenDetails?.cacheReadTokens ?? 0;
  const cacheWrite = usage.inputTokenDetails?.cacheWriteTokens ?? 0;
  const uncached = Math.max(0, (input ?? 0) - cacheRead - cacheWrite);
  const perToken =
    uncached * price.input +
    cacheRead * (price.cacheRead ?? price.input) +
    cacheWrite * (price.cacheWrite ?? price.input) +
    (output ?? 0) * price.output;
  return perToken / 1_000_000;
}
