import type { ModelMessage } from 'ai';

const CHARS_PER_TOKEN = 4;
const ESTIMATE_SAFETY_MARGIN = 1.2; // +20% — no real tokenizer, so we over-count on purpose
const BUDGET_UTILIZATION = 0.8; // only target 80% of (contextWindow - outputReserve)
const MAX_OUTPUT_RESERVE_FRACTION = 0.5; // never let the output reserve alone eat more than half the detected window
// Conservative ballpark for a single mid-resolution image across common
// vision APIs. Images never appear inlined as base64 in these messages —
// they're always a hosted URL (a few dozen chars) — so the char-based
// estimate below sees them as nearly free, which lets image-heavy
// conversations silently blow past a model's real context window (small
// local context windows especially) instead of triggering pruneToContextBudget.
const ESTIMATED_TOKENS_PER_IMAGE = 1100;

// Below this estimated-token floor, running pruneMessages() (strip old
// reasoning/tool-call noise) isn't worth the pass — most conversations never
// get here. Above it, stripping is unconditionally worth doing regardless of
// how many *turns* produced the bulk — a single 'auto'-mode turn's tool-call
// trace (skill/retrieve/web_search/... fan-out) can blow past this before a
// 2nd user message is ever sent, which a turn-count-based gate would miss
// entirely. Deliberately provider-agnostic and fixed rather than a fraction
// of the real per-model budget: at the call site (app/api/search/route.ts,
// before auto-routing resolves the final `model`) the real contextWindow
// isn't known yet.
export const PRUNE_TOKEN_THRESHOLD = 40_000;

// Fraction of the per-turn context budget at which resolvePrepareStepOverride
// (lib/search/prepare-step.ts) forces every keepToolsArmed mode (auto/mcp/
// xai-multi-agent) to drain tools and synthesize, regardless of step count —
// a hard safety net for the gap between the one-time pre-turn
// pruneToContextBudget() call and stepCountIs() running out, during which a
// single turn's own tool round-trips can otherwise accumulate unbounded
// context.
export const SOFT_STEP_BUDGET_FRACTION = 0.8;

// Fraction of the per-turn context budget at which maybeCompactContext()
// (lib/search/context-compaction.ts) summarizes the oldest turns instead of
// letting pruneToContextBudget() drop them outright. Kept as its own named
// constant rather than reusing SOFT_STEP_BUDGET_FRACTION even though both are
// 0.8 today — they measure different things (this one: pre-turn history size
// against the budget; that one: mid-turn cumulative step usage).
export const COMPACTION_TRIGGER_FRACTION = 0.8;

// How many of the most recent turns compaction always leaves raw/verbatim,
// regardless of how far over COMPACTION_TRIGGER_FRACTION the conversation is —
// only turns older than this (and not already covered by an existing summary)
// are eligible to be folded in.
export const COMPACTION_KEEP_RECENT_TURNS = 3;

function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value) ?? '';
  } catch {
    return '';
  }
}

function countImageParts(messages: ModelMessage[]): number {
  let count = 0;
  for (const m of messages as any[]) {
    if (!Array.isArray(m?.content)) continue;
    for (const part of m.content) {
      const mediaType = part?.mimeType || part?.mediaType || '';
      if (part?.type === 'image' || (part?.type === 'file' && mediaType.startsWith('image/'))) count++;
    }
  }
  return count;
}

// Heuristic token count: chars/4 with a 20% safety margin, no tokenizer
// dependency, plus a flat per-image surcharge (see ESTIMATED_TOKENS_PER_IMAGE).
// Accepts either a message array (JSON-stringified, so text, tool
// calls/results, and reasoning all count) or a raw string (e.g. the system
// prompt).
export function estimateTokenCount(input: ModelMessage[] | string): number {
  if (typeof input === 'string') {
    return Math.ceil((input.length / CHARS_PER_TOKEN) * ESTIMATE_SAFETY_MARGIN);
  }
  const charCount = input.reduce((sum, m) => sum + safeStringify(m).length, 0);
  const imageTokens = countImageParts(input) * ESTIMATED_TOKENS_PER_IMAGE;
  return Math.ceil((charCount / CHARS_PER_TOKEN) * ESTIMATE_SAFETY_MARGIN) + imageTokens;
}

export function computeContextBudget(contextWindow: number, outputReserve: number): number {
  const effectiveReserve = Math.min(outputReserve, Math.floor(contextWindow * MAX_OUTPUT_RESERVE_FRACTION));
  return Math.max(0, Math.floor((contextWindow - effectiveReserve) * BUDGET_UTILIZATION));
}

export interface TurnGroups<T> {
  pinnedPrefix: T[];
  turns: T[][];
}

// Groups a message array into whole conversational turns (a 'user' message
// plus everything that follows it up to the next 'user' message). Anything
// before the first 'user' message (e.g. a leading system message) is
// returned separately as pinnedPrefix, never part of a turn — callers that
// drop/replace turns must never touch it. Generic over T so it works both on
// the ModelMessage[] pruneToContextBudget() operates on and the richer
// ChatMessage[] (with id/createdAt) maybeCompactContext()
// (lib/search/context-compaction.ts) needs.
export function groupIntoTurns<T extends { role: string }>(messages: T[]): TurnGroups<T> {
  const firstUserIndex = messages.findIndex((m) => m.role === 'user');
  if (firstUserIndex === -1) {
    return { pinnedPrefix: messages, turns: [] };
  }

  const pinnedPrefix = messages.slice(0, firstUserIndex);
  const turns: T[][] = [];
  for (let i = firstUserIndex; i < messages.length; i++) {
    if (messages[i].role === 'user') {
      turns.push([messages[i]]);
    } else {
      turns[turns.length - 1].push(messages[i]);
    }
  }
  return { pinnedPrefix, turns };
}

export interface PruneResult {
  messages: ModelMessage[];
  turnsRemoved: number;
  estimatedTokensBefore: number;
  estimatedTokensAfter: number;
}

// Sliding window: drops the oldest whole turns until the estimate fits the
// budget. Anything before the first 'user' message (system prompt turns, if
// present) is pinned and never dropped. The most recent turn is always kept,
// even if the budget is still exceeded afterward — the onError
// context-length safety net in app/api/search/route.ts covers that residual
// case.
export function pruneToContextBudget(messages: ModelMessage[], budgetTokens: number, reservedTokens = 0): PruneResult {
  const remainingBudget = budgetTokens - reservedTokens;
  const estimatedTokensBefore = estimateTokenCount(messages);

  if (estimatedTokensBefore <= remainingBudget) {
    return { messages, turnsRemoved: 0, estimatedTokensBefore, estimatedTokensAfter: estimatedTokensBefore };
  }

  const { pinnedPrefix, turns } = groupIntoTurns(messages);
  if (turns.length === 0) {
    // No 'user' message to anchor turns on — nothing safe to drop.
    return { messages, turnsRemoved: 0, estimatedTokensBefore, estimatedTokensAfter: estimatedTokensBefore };
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
