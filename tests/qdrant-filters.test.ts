import { describe, it, expect } from 'vitest';
import { buildUserFilter } from '@/lib/vector/qdrant-filters';

describe('buildUserFilter', () => {
  it('returns undefined without a userId', () => {
    expect(buildUserFilter(undefined)).toBeUndefined();
    expect(buildUserFilter(null)).toBeUndefined();
    expect(buildUserFilter('')).toBeUndefined();
  });

  it('scopes the filter to the given userId', () => {
    expect(buildUserFilter('user-123')).toEqual({
      must: [{ key: 'user_id', match: { value: 'user-123' } }],
    });
  });
});
