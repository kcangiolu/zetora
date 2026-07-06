// Renamed from 'zetora_search_index' when user-scoped filtering was added —
// old points carry no user_id payload and would otherwise leak across users.
// The old collection is abandoned; its cache is cheap to rebuild.
export const SEARCH_INDEX_COLLECTION = 'zetora_search_index_v2';
