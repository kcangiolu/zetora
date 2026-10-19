import { describe, it, expect, afterEach, vi } from 'vitest';
import { NextRequest } from 'next/server';

import { secretsEqual } from '@/lib/secure-compare';

describe('secretsEqual', () => {
  it('accepts only the exact secret', () => {
    expect(secretsEqual('s3cret', 's3cret')).toBe(true);
    expect(secretsEqual('s3cre', 's3cret')).toBe(false);
    expect(secretsEqual('s3cret ', 's3cret')).toBe(false);
    expect(secretsEqual('', 's3cret')).toBe(false);
  });

  it('rejects a missing value', () => {
    expect(secretsEqual(null, 's3cret')).toBe(false);
    expect(secretsEqual(undefined, 's3cret')).toBe(false);
  });
});

// serverEnv reads process.env once at import, so each case re-imports the module.
async function loadWithSecret(secret: string | undefined) {
  vi.resetModules();
  if (secret === undefined) delete process.env.HERMES_RELAY_INTERNAL_SECRET;
  else process.env.HERMES_RELAY_INTERNAL_SECRET = secret;
  return import('@/lib/hermes/internal-auth');
}

function requestWith(authorization?: string) {
  return new NextRequest('http://zetora-app/api/internal/hermes/agent-event', {
    method: 'POST',
    headers: authorization ? { Authorization: authorization } : {},
  });
}

describe('assertInternalHermesAuth', () => {
  const original = process.env.HERMES_RELAY_INTERNAL_SECRET;
  afterEach(() => {
    if (original === undefined) delete process.env.HERMES_RELAY_INTERNAL_SECRET;
    else process.env.HERMES_RELAY_INTERNAL_SECRET = original;
  });

  it('disables the endpoints while the secret is unset or the placeholder', async () => {
    for (const secret of [undefined, 'placeholder']) {
      const { assertInternalHermesAuth } = await loadWithSecret(secret);
      expect(assertInternalHermesAuth(requestWith('Bearer placeholder'))?.status).toBe(503);
    }
  });

  it('rejects a missing or wrong bearer', async () => {
    const { assertInternalHermesAuth } = await loadWithSecret('s3cret');
    expect(assertInternalHermesAuth(requestWith())?.status).toBe(401);
    expect(assertInternalHermesAuth(requestWith('Bearer wrong'))?.status).toBe(401);
    expect(assertInternalHermesAuth(requestWith('s3cret'))?.status).toBe(401);
  });

  it('lets the right bearer through', async () => {
    const { assertInternalHermesAuth } = await loadWithSecret('s3cret');
    expect(assertInternalHermesAuth(requestWith('Bearer s3cret'))).toBeNull();
  });
});
