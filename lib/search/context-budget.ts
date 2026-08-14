import type { ModelMessage } from 'ai';

const CHARS_PER_TOKEN = 4;
const ESTIMATE_SAFETY_MARGIN = 1.2; // +20% — no real tokenizer, so we over-count on purpose
const BUDGET_UTILIZATION = 0.8; // only target 80% of (contextWindow - outputReserve)

function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value) ?? '';
  } catch {
    return '';
  }
}

// Heuristic token count: chars/4 with a 20% safety margin, no tokenizer
// dependency. Accepts either a message array (JSON-stringified, so text,
// tool calls/results, and reasoning all count) or a raw string (e.g. the
// system prompt).
export function estimateTokenCount(input: ModelMessage[] | string): number {
  const charCount =
    typeof input === 'string' ? input.length : input.reduce((sum, m) => sum + safeStringify(m).length, 0);
  return Math.ceil((charCount / CHARS_PER_TOKEN) * ESTIMATE_SAFETY_MARGIN);
}

export function computeContextBudget(contextWindow: number, outputReserve: number): number {
  return Math.max(0, Math.floor((contextWindow - outputReserve) * BUDGET_UTILIZATION));
}

export interface PruneResult {
  messages: ModelMessage[];
  turnsRemoved: number;
  estimatedTokensBefore: number;
  estimatedTokensAfter: number;
}

// Sliding window: drops the oldest whole turns (a 'user' message plus
// everything that follows it up to the next 'user' message) until the
// estimate fits the budget. Anything before the first 'user' message
// (system prompt turns, if present in the array) is pinned and never
// dropped. The most recent turn is always kept, even if the budget is
// still exceeded afterward — the onError context-length safety net in
// app/api/search/route.ts covers that residual case.
export function pruneToContextBudget(messages: ModelMessage[], budgetTokens: number, reservedTokens = 0): PruneResult {
  const remainingBudget = budgetTokens - reservedTokens;
  const estimatedTokensBefore = estimateTokenCount(messages);

  if (estimatedTokensBefore <= remainingBudget) {
    return { messages, turnsRemoved: 0, estimatedTokensBefore, estimatedTokensAfter: estimatedTokensBefore };
  }

  const firstUserIndex = messages.findIndex((m) => m.role === 'user');
  if (firstUserIndex === -1) {
    // No 'user' message to anchor turns on — nothing safe to drop.
    return { messages, turnsRemoved: 0, estimatedTokensBefore, estimatedTokensAfter: estimatedTokensBefore };
  }

  const pinnedPrefix = messages.slice(0, firstUserIndex);
  const turns: ModelMessage[][] = [];
  for (let i = firstUserIndex; i < messages.length; i++) {
    if (messages[i].role === 'user') {
      turns.push([messages[i]]);
    } else {
      turns[turns.length - 1].push(messages[i]);
    }
  }

  let turnsRemoved = 0;
  while (turns.length > 1 && estimateTokenCount([...pinnedPrefix, ...turns.flat()]) > remainingBudget) {
    turns.shift();
    turnsRemoved++;
  }

  const prunedMessages = [...pinnedPrefix, ...turns.flat()];
  return {
    messages: prunedMessages,
    turnsRemoved,
    estimatedTokensBefore,
    estimatedTokensAfter: estimateTokenCount(prunedMessages),
  };
}

const CONTEXT_LENGTH_ERROR_PATTERNS = [
  /context_length_exceeded/i,
  /maximum context length/i,
  /context window/i,
  /context size/i,
  /exceeds? the available context/i,
  /prompt is too long/i,
  /reduce the length of the messages/i,
  /too many tokens/i,
];

// Detects provider errors caused by exceeding the model's context window,
// across the error shapes seen from OpenAI-compatible APIs (incl.
// llama.cpp/vLLM) and Anthropic — used to give the user a clear message
// instead of the generic stream error fallback.
export function isContextLengthError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  const responseBody =
    error && typeof error === 'object' && 'responseBody' in error
      ? String((error as { responseBody?: unknown }).responseBody ?? '')
      : '';
  return CONTEXT_LENGTH_ERROR_PATTERNS.some((re) => re.test(message) || re.test(responseBody));
}
