import { describe, it, expect, vi, afterEach } from 'vitest';

const { env } = vi.hoisted(() => ({ env: { CUSTOM_AI_PROVIDERS: '' as string | undefined } }));

vi.mock('@/env/server', () => ({ serverEnv: env }));
vi.mock('@/lib/auth-utils', () => ({ getUser: vi.fn() }));
vi.mock('@/lib/user-data-server', () => ({
  getCachedUserPreferencesByUserId: vi.fn(),
  clearUserPreferencesCache: vi.fn(),
}));
vi.mock('@/lib/db/queries', () => ({ upsertUserPreferences: vi.fn() }));

import { customProviderFetch, getCustomProviders } from '@/lib/custom-providers';
import { guardedPublicFetch } from '@/lib/net/public-url';

const ORIGINAL_FLAG = process.env.CUSTOM_PROVIDERS_ALLOW_PRIVATE_NETWORK;

afterEach(() => {
  env.CUSTOM_AI_PROVIDERS = '';
  if (ORIGINAL_FLAG === undefined) delete process.env.CUSTOM_PROVIDERS_ALLOW_PRIVATE_NETWORK;
  else process.env.CUSTOM_PROVIDERS_ALLOW_PRIVATE_NETWORK = ORIGINAL_FLAG;
});

describe('customProviderFetch', () => {
  it("keeps a user's provider on public addresses by default", () => {
    delete process.env.CUSTOM_PROVIDERS_ALLOW_PRIVATE_NETWORK;
    expect(customProviderFetch('http://192.168.1.10:8080/v1/models')).toBe(guardedPublicFetch);
  });

  it("lets the operator's own providers reach the LAN", () => {
    delete process.env.CUSTOM_PROVIDERS_ALLOW_PRIVATE_NETWORK;
    env.CUSTOM_AI_PROVIDERS = JSON.stringify([{ id: 'llama', name: 'llama', baseURL: 'http://192.168.1.10:8080/v1' }]);
    expect(customProviderFetch('http://192.168.1.10:8080/props')).toBe(fetch);
    expect(customProviderFetch('http://192.168.1.11:8080/props')).toBe(guardedPublicFetch);
  });

  it('lets every provider reach the LAN when the operator opts in', () => {
    process.env.CUSTOM_PROVIDERS_ALLOW_PRIVATE_NETWORK = 'true';
    expect(customProviderFetch('http://192.168.1.10:8080/v1/models')).toBe(fetch);
  });
});

describe('getCustomProviders', () => {
  it('fails visibly on a malformed CUSTOM_AI_PROVIDERS', async () => {
    env.CUSTOM_AI_PROVIDERS = '{not json';
    await expect(getCustomProviders('user-1')).rejects.toThrow('CUSTOM_AI_PROVIDERS is not valid JSON');
  });
});
