export interface QdrantFilter {
  must: Array<{ key: string; match: { value: string } }>;
}

// Without this, the hybrid-search Qdrant collection is a single global pool
// shared by every user, so one user's indexed pages can surface as "search
// results" in another user's unrelated conversation.
export function buildUserFilter(userId: string | undefined | null): QdrantFilter | undefined {
  if (!userId) return undefined;
  return { must: [{ key: 'user_id', match: { value: userId } }] };
}
