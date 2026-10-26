import { APICallError } from 'ai';

const MAX_ERROR_LENGTH = 300;

// A search that failed (key refused, quota exhausted, service down) must not
// reach the model or the user as an empty result, which reads as "nothing
// found". Each failed query carries this text instead: the model can say why,
// and the result card shows it.
export function describeSearchError(provider: string, error: unknown): string {
  const status = APICallError.isInstance(error) && error.statusCode ? ` (HTTP ${error.statusCode})` : '';
  const message = error instanceof Error ? error.message : String(error);
  const text = `${provider} failed${status}: ${message}`;
  return text.length > MAX_ERROR_LENGTH ? `${text.slice(0, MAX_ERROR_LENGTH - 1)}…` : text;
}

export function joinSearchErrors(...errors: (string | undefined)[]): string | undefined {
  const present = errors.filter((error): error is string => Boolean(error));
  return present.length > 0 ? present.join('; ') : undefined;
}

function searchErrorOf(search: object | null | undefined): string | undefined {
  return search && 'error' in search && typeof search.error === 'string' && search.error ? search.error : undefined;
}

// The distinct errors of a tool's per-query searches, for the result card.
export function searchErrors(searches: readonly (object | null | undefined)[] | undefined): string[] {
  return [...new Set((searches ?? []).map(searchErrorOf).filter((error): error is string => !!error))];
}

// How a search that partly or fully failed reads to the user, before the provider's
// errors: those alone read as if the reply were broken or made up, when it rests on
// the searches that worked, or says it found nothing.
export function searchFailureSummary(searches: readonly (object | null | undefined)[] | undefined): {
  failed: number;
  total: number;
  title: string;
  explanation: string;
} | null {
  const total = searches?.length ?? 0;
  const failed = (searches ?? []).filter((search) => searchErrorOf(search)).length;
  if (failed === 0) return null;
  if (failed === total) {
    return {
      failed,
      total,
      title: 'Search failed',
      explanation: 'The reply could not use any web results.',
    };
  }
  return {
    failed,
    total,
    title: `${failed} of ${total} searches failed`,
    explanation: 'The reply uses the results of the other searches.',
  };
}

interface QuerySearch {
  results: readonly unknown[];
  error?: string;
}

// Runs the fallback provider on the queries the primary found nothing for, the others
// keeping their results: search engines often fail one query of several, and the reply
// should not lose it while the fallback is configured. A query the fallback also found
// nothing for keeps both errors.
export async function fallBackOnFailedQueries<S extends QuerySearch>(
  searches: S[],
  runFallback: (indices: number[]) => Promise<S[]>,
): Promise<S[]> {
  const failed = searches.flatMap((search, i) => (search.results.length === 0 ? [i] : []));
  if (failed.length === 0) return searches;

  const fallback = await runFallback(failed);
  const merged = [...searches];
  failed.forEach((index, j) => {
    const replacement = fallback[j];
    if (!replacement) return;
    const error =
      replacement.results.length > 0 ? undefined : joinSearchErrors(searches[index].error, replacement.error);
    merged[index] = { ...replacement, error };
  });
  return merged;
}
