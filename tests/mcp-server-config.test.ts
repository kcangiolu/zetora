import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';

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
  it('accepts https URLs', () => {
    expect(() => mod.validateMcpServerUrl('https://mcp.example.com/sse')).not.toThrow();
  });

  it('rejects garbage', () => {
    expect(() => mod.validateMcpServerUrl('not a url')).toThrow('Invalid URL');
  });

  it('allows http on localhost outside production', () => {
    // vitest runs with NODE_ENV !== 'production'
    expect(() => mod.validateMcpServerUrl('http://localhost:3000/mcp')).not.toThrow();
    expect(() => mod.validateMcpServerUrl('http://127.0.0.1:8080/mcp')).not.toThrow();
  });

  it('rejects plain http to remote hosts even in development', () => {
    expect(() => mod.validateMcpServerUrl('http://mcp.example.com')).toThrow(/https/);
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
  it('ignores non-oauth auth types', () => {
    expect(() => mod.validateMcpOAuthConfig({ authType: 'bearer' })).not.toThrow();
  });

  it('requires both manual endpoints when no issuer is set', () => {
    expect(() =>
      mod.validateMcpOAuthConfig({ authType: 'oauth', oauthAuthorizationUrl: 'https://a.example/authorize' }),
    ).toThrow(/both authorization and token URLs/);
  });

  it('accepts a full manual endpoint pair', () => {
    expect(() =>
      mod.validateMcpOAuthConfig({
        authType: 'oauth',
        oauthAuthorizationUrl: 'https://a.example/authorize',
        oauthTokenUrl: 'https://a.example/token',
      }),
    ).not.toThrow();
  });

  it('validates each provided URL', () => {
    expect(() => mod.validateMcpOAuthConfig({ authType: 'oauth', oauthIssuerUrl: 'http://evil.example' })).toThrow(
      /https/,
    );
  });

  it('validates URL-shaped client ids', () => {
    expect(() => mod.validateMcpOAuthConfig({ authType: 'oauth', oauthClientId: 'http://evil.example' })).toThrow(
      /https/,
    );
    expect(() => mod.validateMcpOAuthConfig({ authType: 'oauth', oauthClientId: 'plain-client-id' })).not.toThrow();
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
