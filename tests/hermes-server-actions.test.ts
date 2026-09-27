import { describe, it, expect, vi, beforeEach } from 'vitest';

const { getCurrentUser, getHermesConnectorByUserId } = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  getHermesConnectorByUserId: vi.fn(),
}));

vi.mock('@/app/actions/user', () => ({ getCurrentUser }));
vi.mock('@/lib/db/queries/hermes', () => ({
  getHermesConnectorByUserId,
  createHermesConnector: vi.fn(),
  revokeHermesConnector: vi.fn(),
}));

import { getHermesConnectorStatusAction } from '@/app/actions/hermes';

// The whole point of these: a failure must NOT come back as a resolved value carrying
// `connector: null`. React Query caches a resolved failure as real data — no error state, no
// retry — and every caller reads it as "this user was never enrolled", which is what
// silently kicked live Agent chats out of Agent mode.
describe('getHermesConnectorStatusAction', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('throws when there is no session instead of reporting "no connector"', async () => {
    getCurrentUser.mockResolvedValue(null);
    await expect(getHermesConnectorStatusAction()).rejects.toThrow('Authentication required');
  });

  it('lets a database failure propagate instead of swallowing it', async () => {
    getCurrentUser.mockResolvedValue({ id: 'user-1' });
    getHermesConnectorByUserId.mockRejectedValue(new Error('connection refused'));
    await expect(getHermesConnectorStatusAction()).rejects.toThrow('connection refused');
  });

  it('reports a genuinely unenrolled user as a successful null connector', async () => {
    getCurrentUser.mockResolvedValue({ id: 'user-1' });
    getHermesConnectorByUserId.mockResolvedValue(null);
    await expect(getHermesConnectorStatusAction()).resolves.toEqual({ connector: null });
  });

  it('returns the enrollment fields the UI renders, and nothing else', async () => {
    getCurrentUser.mockResolvedValue({ id: 'user-1' });
    getHermesConnectorByUserId.mockResolvedValue({
      id: 'connector-1',
      userId: 'user-1',
      status: 'enrolled',
      label: 'laptop',
      gatewaySecretPrefix: 'abc123',
      gatewaySecretEncrypted: 'must-not-leak',
      enrollmentTokenHash: 'must-not-leak',
      lastConnectedAt: null,
      lastDisconnectedAt: null,
      lastError: null,
    });

    const result = await getHermesConnectorStatusAction();
    expect(result.connector).toEqual({
      status: 'enrolled',
      label: 'laptop',
      gatewaySecretPrefix: 'abc123',
      lastConnectedAt: null,
      lastDisconnectedAt: null,
      lastError: null,
    });
  });
});
