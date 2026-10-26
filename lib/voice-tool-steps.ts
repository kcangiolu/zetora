import type { ModelMessage } from 'ai';
import { searchErrors } from '@/lib/tools/search-errors';

// What the Voice page, the saved chat and the next turns know of the tools a spoken reply
// called: the page shows each step, the chat keeps it as the same tool part a written
// reply saves, and the history carries a compact trace of it, or the model would believe
// it never searched.

// Small curated toolset for spoken conversations — kept intentionally narrow so the
// prompt stays light and turns stay low-latency.
export const VOICE_TOOL_NAMES = ['web_search', 'retrieve', 'get_weather_data', 'datetime'];

const PREVIEW_MAX_CHARS = 120;
const HISTORY_RESULTS_PER_SEARCH = 5;
const HISTORY_OUTPUT_MAX_CHARS = 1500;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

/** The step's subject for the Voice page: the queries, URL or place it was called with. */
export function voiceToolPreview(input: unknown): string | null {
  if (!isRecord(input)) return null;
  if (Array.isArray(input.queries)) {
    const queries = input.queries.filter((query): query is string => typeof query === 'string' && query !== '');
    return queries.length > 0 ? truncate(queries.join(' · '), PREVIEW_MAX_CHARS) : null;
  }
  for (const key of ['url', 'query', 'location']) {
    const value = input[key];
    if (typeof value === 'string' && value) return truncate(value, PREVIEW_MAX_CHARS);
  }
  return null;
}

/** "ok", or why the tool failed, the same status a Hermes tool step carries. */
export function voiceToolStatus(output: unknown): string {
  const errors = isRecord(output) && Array.isArray(output.searches) ? searchErrors(output.searches) : [];
  return errors.length > 0 ? errors.join('; ') : 'ok';
}

// Titles and links of the first results only: enough for a follow-up question about the
// search, without resending whole pages on every turn.
function compactOutput(output: unknown): string {
  if (isRecord(output) && Array.isArray(output.searches)) {
    const searches = output.searches.filter(isRecord).map((search) => ({
      query: search.query,
      ...(search.error ? { error: search.error } : {}),
      results: (Array.isArray(search.results) ? search.results : [])
        .filter(isRecord)
        .slice(0, HISTORY_RESULTS_PER_SEARCH)
        .map((result) => ({ title: result.title, url: result.url })),
    }));
    return truncate(JSON.stringify({ searches }), HISTORY_OUTPUT_MAX_CHARS);
  }
  return truncate(typeof output === 'string' ? output : (JSON.stringify(output) ?? ''), HISTORY_OUTPUT_MAX_CHARS);
}

export interface VoiceToolCall {
  toolCallId: string;
  toolName: string;
  input: unknown;
}

type VoiceToolOutcome = { output: unknown } | { error: string };

/** The call and its result as the two messages the next turn's history carries. */
export function voiceToolHistory(call: VoiceToolCall, outcome: VoiceToolOutcome): ModelMessage[] {
  return [
    { role: 'assistant', content: [{ type: 'tool-call', ...call }] },
    {
      role: 'tool',
      content: [
        {
          type: 'tool-result',
          toolCallId: call.toolCallId,
          toolName: call.toolName,
          output:
            'error' in outcome
              ? { type: 'error-text', value: outcome.error }
              : { type: 'text', value: compactOutput(outcome.output) },
        },
      ],
    },
  ];
}

/** The finished call as the tool part a written reply saves, so the chat shows its card. */
export interface VoiceToolPart {
  type: string;
  toolCallId: string;
  state: 'output-available' | 'output-error';
  input: unknown;
  output?: unknown;
  errorText?: string;
}

export function voiceToolPart(call: VoiceToolCall, outcome: VoiceToolOutcome): VoiceToolPart {
  const base = { type: `tool-${call.toolName}`, toolCallId: call.toolCallId, input: call.input };
  return 'error' in outcome
    ? { ...base, state: 'output-error', errorText: outcome.error }
    : { ...base, state: 'output-available', output: outcome.output };
}

/** The voice tool steps among a saved message's parts, as history messages. */
export function voiceToolHistoryFromParts(parts: readonly Record<string, unknown>[]): ModelMessage[] {
  return parts.flatMap((part) => {
    const toolName = typeof part.type === 'string' && part.type.startsWith('tool-') ? part.type.slice(5) : '';
    if (!VOICE_TOOL_NAMES.includes(toolName) || typeof part.toolCallId !== 'string') return [];
    const call = { toolCallId: part.toolCallId, toolName, input: part.input };
    if (part.state === 'output-available') return voiceToolHistory(call, { output: part.output });
    if (part.state === 'output-error') {
      return voiceToolHistory(call, { error: typeof part.errorText === 'string' ? part.errorText : 'Tool failed' });
    }
    return [];
  });
}
