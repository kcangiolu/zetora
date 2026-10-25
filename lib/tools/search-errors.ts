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

export function searchErrorOf(search: object | null | undefined): string | undefined {
  return search && 'error' in search && typeof search.error === 'string' && search.error ? search.error : undefined;
}

// The distinct errors of a tool's per-query searches, for the result card.
export function searchErrors(searches: readonly (object | null | undefined)[] | undefined): string[] {
  return [...new Set((searches ?? []).map(searchErrorOf).filter((error): error is string => !!error))];
}
