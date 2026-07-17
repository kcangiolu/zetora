import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';

// validateMcpServerUrl does a real DNS lookup to block SSRF to private/internal
// hosts (mirrors app/api/proxy-image/route.ts). Mock it so tests are
// deterministic and don't depend on network access — 'internal.example'
// simulates a hostname that resolves to a private address, everything else
// resolves publicly.
vi.mock('node:dns/promises', () => ({
  lookup: vi.fn(async (hostname: string) => {
    if (hostname === 'internal.example') {
      return [{ address: '10.0.0.5', family: 4 }];
    }
    return [{ address: '93.184.216.34', family: 4 }];
  }),
}));

// server-config pulls in lib/mcp/crypto, whose serverEnv snapshot must see a
// real key before import (same re-import pattern as tests/mcp-crypto.test.ts).
let mod: typeof import('@/lib/mcp/server-config');
const originalKey = process.env.MCP_CREDENTIALS_ENCRYPTION_KEY;

beforeAll(async () => {
  vi.resetModules();
  process.env.MCP_CREDENTIALS_ENCRYPTION_KEY = 'unit-test-key';
  mod = await import('@/lib/mcp/server-config');
});

afterAll(() => {
  if (originalKey === undefined) delete process.env.MCP_CREDENTIALS_ENCRYPTION_KEY;
  else process.env.MCP_CREDENTIALS_ENCRYPTION_KEY = originalKey;
});

describe('validateMcpServerUrl', () => {
  it('accepts https URLs that resolve publicly', async () => {
    await expect(mod.validateMcpServerUrl('https://mcp.example.com/sse')).resolves.toBeUndefined();
  });

  it('rejects garbage', async () => {
    await expect(mod.validateMcpServerUrl('not a url')).rejects.toThrow('Invalid URL');
  });

  it('allows http on localhost outside production', async () => {
    // vitest runs with NODE_ENV !== 'production'
    await expect(mod.validateMcpServerUrl('http://localhost:3000/mcp')).resolves.toBeUndefined();
    await expect(mod.validateMcpServerUrl('http://127.0.0.1:8080/mcp')).resolves.toBeUndefined();
  });

  it('rejects plain http to remote hosts even in development', async () => {
    await expect(mod.validateMcpServerUrl('http://mcp.example.com')).rejects.toThrow(/https/);
  });

  it('rejects literal private/reserved IPs', async () => {
    await expect(mod.validateMcpServerUrl('https://10.0.0.5/mcp')).rejects.toThrow('private address');
    await expect(mod.validateMcpServerUrl('https://169.254.169.254/latest/meta-data')).rejects.toThrow(
      'private address',
    );
  });

  it('rejects hostnames that resolve to a private address', async () => {
    await expect(mod.validateMcpServerUrl('https://internal.example/mcp')).rejects.toThrow('private address');
  });
});

describe('normalizeMcpScopes', () => {
  it('joins comma/whitespace separated scopes with single spaces', () => {
    expect(mod.normalizeMcpScopes('read,write  admin,\nprofile')).toBe('read write admin profile');
  });

  it('returns null for missing or empty input', () => {
    expect(mod.normalizeMcpScopes(undefined)).toBeNull();
    expect(mod.normalizeMcpScopes('  , ,  ')).toBeNull();
  });
});

describe('validateMcpOAuthConfig', () => {
  it('ignores non-oauth auth types', async () => {
    await expect(mod.validateMcpOAuthConfig({ authType: 'bearer' })).resolves.toBeUndefined();
  });

  it('requires both manual endpoints when no issuer is set', async () => {
    await expect(
      mod.validateMcpOAuthConfig({ authType: 'oauth', oauthAuthorizationUrl: 'https://a.example/authorize' }),
    ).rejects.toThrow(/both authorization and token URLs/);
  });

  it('accepts a full manual endpoint pair', async () => {
    await expect(
      mod.validateMcpOAuthConfig({
        authType: 'oauth',
        oauthAuthorizationUrl: 'https://a.example/authorize',
        oauthTokenUrl: 'https://a.example/token',
      }),
    ).resolves.toBeUndefined();
  });

  it('validates each provided URL', async () => {
    await expect(
      mod.validateMcpOAuthConfig({ authType: 'oauth', oauthIssuerUrl: 'http://evil.example' }),
    ).rejects.toThrow(/https/);
  });

  it('validates URL-shaped client ids', async () => {
    await expect(
      mod.validateMcpOAuthConfig({ authType: 'oauth', oauthClientId: 'http://evil.example' }),
    ).rejects.toThrow(/https/);
    await expect(
      mod.validateMcpOAuthConfig({ authType: 'oauth', oauthClientId: 'plain-client-id' }),
    ).resolves.toBeUndefined();
  });
});

describe('credential encryption helpers', () => {
  it('returns null when no credentials are needed', () => {
    expect(
      mod.getEncryptedMcpCredentials({ name: 'x', transportType: 'http', url: 'https://x', authType: 'none' }),
    ).toBeNull();
  });

  it('requires a bearer token for bearer auth', () => {
    expect(() =>
      mod.getEncryptedMcpCredentials({ name: 'x', transportType: 'http', url: 'https://x', authType: 'bearer' }),
    ).toThrow('Bearer token is required');
  });

  it('roundtrips bearer credentials into Authorization headers', () => {
    const encrypted = mod.getEncryptedMcpCredentials({
      name: 'x',
      transportType: 'http',
      url: 'https://x',
      authType: 'bearer',
      bearerToken: '  tok-123  ',
    });
    expect(encrypted).toBeTypeOf('string');
    expect(encrypted).not.toContain('tok-123');

    const headers = mod.getMcpAuthHeaders({ authType: 'bearer', encryptedCredentials: encrypted });
    expect(headers).toEqual({ Authorization: 'Bearer tok-123' });
  });

  it('roundtrips custom header credentials', () => {
    const encrypted = mod.getEncryptedMcpCredentials({
      name: 'x',
      transportType: 'http',
      url: 'https://x',
      authType: 'header',
      headerName: 'X-Api-Key',
      headerValue: 'v-1',
    });
    const headers = mod.getMcpAuthHeaders({ authType: 'header', encryptedCredentials: encrypted });
    expect(headers).toEqual({ 'X-Api-Key': 'v-1' });
  });

  it('throws on missing encrypted credentials for authenticated servers', () => {
    expect(() => mod.getMcpCredentialPayload({ authType: 'bearer', encryptedCredentials: null })).toThrow(
      'Missing encrypted credentials',
    );
  });

  it('oauth servers contribute no static auth headers', () => {
    expect(mod.getMcpAuthHeaders({ authType: 'oauth', encryptedCredentials: null })).toEqual({});
  });

  it('encrypts and decrypts standalone OAuth values, tolerating bad input', () => {
    const encrypted = mod.getEncryptedOAuthValue(' client-secret ');
    expect(encrypted).toBeTypeOf('string');
    expect(mod.decryptOAuthValue(encrypted)).toBe('client-secret');
    expect(mod.getEncryptedOAuthValue('   ')).toBeNull();
    expect(mod.decryptOAuthValue(null)).toBeNull();
    expect(mod.decryptOAuthValue('corrupted-blob')).toBeNull();
  });
});
