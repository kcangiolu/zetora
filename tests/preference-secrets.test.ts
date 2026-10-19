import { describe, it, expect, vi, beforeEach } from 'vitest';

// A stand-in for the user_preferences row: what the queries write is kept as
// stored, so the tests can check that no API key reaches it in clear.
const { db, stored } = vi.hoisted(() => {
  const stored: { row: { userId: string; preferences: Record<string, unknown> } | null } = { row: null };
  const selectChain = {
    from: () => selectChain,
    where: () => selectChain,
    for: () => selectChain,
    limit: async () => (stored.row ? [stored.row] : []),
  };
  const tx = {
    select: () => selectChain,
    update: () => ({
      set: (values: { preferences: Record<string, unknown> }) => ({
        where: () => ({
          returning: async () => {
            stored.row = { ...stored.row!, preferences: values.preferences };
            return [stored.row];
          },
        }),
      }),
    }),
    insert: () => ({
      values: (values: { userId: string; preferences: Record<string, unknown> }) => ({
        onConflictDoUpdate: () => ({
          returning: async () => {
            stored.row = values;
            return [stored.row];
          },
        }),
      }),
    }),
  };
  const db = {
    select: () => selectChain,
    transaction: async <T>(run: (t: typeof tx) => Promise<T>) => run(tx),
  };
  return { db, stored };
});

vi.mock('@/lib/db/index', () => ({ maindb: db }));

import { getUserPreferencesByUserId, upsertUserPreferences } from '@/lib/db/queries/preferences';
import { decryptMcpCredentials } from '@/lib/mcp/crypto';
import type { UserPreferenceValues } from '@/lib/db/schema';

const ENCRYPTED = /^[A-Za-z0-9+/=]+:[A-Za-z0-9+/=]+:[A-Za-z0-9+/=]+$/;

function withProviders(providers: Array<Record<string, unknown>>): UserPreferenceValues {
  return { 'zetora-custom-providers': providers } as unknown as UserPreferenceValues;
}

function storedProviders() {
  return stored.row!.preferences['zetora-custom-providers'] as Array<{ apiKey?: string }>;
}

describe('preference secrets', () => {
  beforeEach(() => {
    stored.row = null;
  });

  it('stores custom-provider API keys encrypted and returns them in clear', async () => {
    const result = await upsertUserPreferences({
      userId: 'u1',
      preferences: withProviders([{ id: 'p1', apiKey: 'sk-live-123' }]),
    });

    const [saved] = storedProviders();
    expect(saved.apiKey).toMatch(ENCRYPTED);
    expect(saved.apiKey).not.toContain('sk-live-123');
    expect(decryptMcpCredentials(saved.apiKey!)).toBe('sk-live-123');
    expect(result.preferences['zetora-custom-providers' as keyof UserPreferenceValues]).toEqual([
      { id: 'p1', apiKey: 'sk-live-123' },
    ]);
  });

  it('decrypts the keys on read', async () => {
    await upsertUserPreferences({ userId: 'u1', preferences: withProviders([{ id: 'p1', apiKey: 'sk-live-123' }]) });

    const read = await getUserPreferencesByUserId({ userId: 'u1' });

    expect(read!.preferences['zetora-custom-providers' as keyof UserPreferenceValues]).toEqual([
      { id: 'p1', apiKey: 'sk-live-123' },
    ]);
  });

  it('does not encrypt an already encrypted key a second time', async () => {
    await upsertUserPreferences({ userId: 'u1', preferences: withProviders([{ id: 'p1', apiKey: 'sk-live-123' }]) });
    const [first] = storedProviders();

    await upsertUserPreferences({ userId: 'u1', preferences: withProviders([{ id: 'p1', apiKey: first.apiKey }]) });

    expect(storedProviders()[0].apiKey).toBe(first.apiKey);
  });

  it('leaves providers without a key and other preferences untouched', async () => {
    await upsertUserPreferences({
      userId: 'u1',
      preferences: { ...withProviders([{ id: 'local' }]), 'zetora-search-provider': 'searxng' } as UserPreferenceValues,
    });

    expect(storedProviders()).toEqual([{ id: 'local' }]);
    expect(stored.row!.preferences['zetora-search-provider']).toBe('searxng');
  });

  it('writes nothing when the key cannot be encrypted', async () => {
    vi.resetModules();
    const original = process.env.MCP_CREDENTIALS_ENCRYPTION_KEY;
    process.env.MCP_CREDENTIALS_ENCRYPTION_KEY = 'placeholder';
    try {
      const { upsertUserPreferences: upsertWithoutKey } = await import('@/lib/db/queries/preferences');
      await expect(
        upsertWithoutKey({ userId: 'u1', preferences: withProviders([{ id: 'p1', apiKey: 'sk-live-123' }]) }),
      ).rejects.toThrow();
      expect(stored.row).toBeNull();
    } finally {
      process.env.MCP_CREDENTIALS_ENCRYPTION_KEY = original;
      vi.resetModules();
    }
  });
});
