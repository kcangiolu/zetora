import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// serverEnv reads process.env once at import; re-import per test with a reset
// module registry so MCP_CREDENTIALS_ENCRYPTION_KEY changes take effect
// (same pattern as tests/lookout-auth.test.ts).
async function loadWithKey(key: string | undefined) {
  vi.resetModules();
  if (key === undefined) delete process.env.MCP_CREDENTIALS_ENCRYPTION_KEY;
  else process.env.MCP_CREDENTIALS_ENCRYPTION_KEY = key;
  return import('@/lib/mcp/crypto');
}

describe('mcp credential crypto', () => {
  const original = process.env.MCP_CREDENTIALS_ENCRYPTION_KEY;
  beforeEach(() => vi.resetModules());
  afterEach(() => {
    if (original === undefined) delete process.env.MCP_CREDENTIALS_ENCRYPTION_KEY;
    else process.env.MCP_CREDENTIALS_ENCRYPTION_KEY = original;
  });

  it('roundtrips a payload', async () => {
    const { encryptMcpCredentials, decryptMcpCredentials } = await loadWithKey('unit-test-key');
    const payload = JSON.stringify({ bearerToken: 'secret-token' });
    expect(decryptMcpCredentials(encryptMcpCredentials(payload))).toBe(payload);
  });

  it('produces a fresh IV per encryption and never embeds the plaintext', async () => {
    const { encryptMcpCredentials } = await loadWithKey('unit-test-key');
    const a = encryptMcpCredentials('same-value');
    const b = encryptMcpCredentials('same-value');
    expect(a).not.toBe(b);
    expect(a).not.toContain('same-value');
    expect(a.split(':')).toHaveLength(3);
  });

  it('rejects tampered ciphertext (GCM auth tag)', async () => {
    const { encryptMcpCredentials, decryptMcpCredentials } = await loadWithKey('unit-test-key');
    const [iv, tag, data] = encryptMcpCredentials('payload').split(':');
    const tampered = Buffer.from(data, 'base64');
    tampered[0] ^= 0xff;
    expect(() => decryptMcpCredentials(`${iv}:${tag}:${tampered.toString('base64')}`)).toThrow();
  });

  it('rejects malformed encrypted values', async () => {
    const { decryptMcpCredentials } = await loadWithKey('unit-test-key');
    expect(() => decryptMcpCredentials('not-a-valid-blob')).toThrow('Invalid encrypted credential format');
  });

  it('refuses to encrypt with the placeholder or missing key', async () => {
    const placeholder = await loadWithKey('placeholder');
    expect(() => placeholder.encryptMcpCredentials('x')).toThrow(/not configured/);

    const missing = await loadWithKey(undefined);
    expect(() => missing.encryptMcpCredentials('x')).toThrow(/not configured/);
  });

  it('cannot decrypt with a different key', async () => {
    const first = await loadWithKey('key-one');
    const blob = first.encryptMcpCredentials('payload');
    const second = await loadWithKey('key-two');
    expect(() => second.decryptMcpCredentials(blob)).toThrow();
  });
});
