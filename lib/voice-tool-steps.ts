import type { ModelMessage } from 'ai';
import { searchErrors } from '@/lib/tools/search-errors';

// What the Voice page and the next turns know of the tools a spoken reply called: the
// page shows each step, and the history keeps a compact trace of it, since the s2s-service
// otherwise only remembers the reply's text and the model would believe it never searched.

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

/** The call and its result as the two messages the next turn's history carries. */
export function voiceToolHistory(
  call: VoiceToolCall,
  outcome: { output: unknown } | { error: string },
): ModelMessage[] {
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
