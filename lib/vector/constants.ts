// Versioned: every point here carries a user_id payload for user-scoped filtering.
// Points without one (the unversioned collection) would leak across users.
export const SEARCH_INDEX_COLLECTION = 'zetora_search_index_v2';
