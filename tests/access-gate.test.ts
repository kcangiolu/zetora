import { describe, it, expect } from 'vitest';
import { checkModelAccess } from '@/lib/search/access-gate';

const signedInUser = { userId: 'u1', email: 'u@example.com' };

describe('checkModelAccess', () => {
  it('blocks signed-out callers from making a request', () => {
    const error = checkModelAccess({ lightweightUser: null });
    expect(error?.type).toBe('unauthorized');
    expect(error?.surface).toBe('auth');
  });

  it('lets any connected account proceed — no tier gate left', () => {
    expect(checkModelAccess({ lightweightUser: signedInUser })).toBeNull();
  });
});
