export interface FusedCandidate {
  url: string;
  title: string;
  content: string;
  source: 'searxng' | 'qdrant';
}

export interface ArchiveResult {
  url: string;
  title: string;
  content: string;
  published_date: undefined;
  author: undefined;
}

// Candidates that only exist in the Qdrant index (source: 'qdrant') come from
// pages indexed during OTHER conversations. They must never silently replace
// or blend into the live SearXNG results — that's what let a Tesla search
// from one conversation reappear as "found" results in an unrelated one.
// Instead they're surfaced as a clearly separate, clearly labeled entry.
export function mergeArchiveResults(fused: FusedCandidate[]): ArchiveResult[] {
  return fused
    .filter((candidate) => candidate.source === 'qdrant')
    .map((candidate) => ({
      url: candidate.url,
      title: `[Archive] ${candidate.title}`,
      content: candidate.content,
      published_date: undefined,
      author: undefined,
    }));
}
