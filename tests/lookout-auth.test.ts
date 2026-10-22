import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// serverEnv reads process.env once at import; re-import per test with a reset
// module registry so CRON_SECRET changes take effect.
async function loadWithSecret(secret: string | undefined) {
  vi.resetModules();
  if (secret === undefined) delete process.env.CRON_SECRET;
  else process.env.CRON_SECRET = secret;
  return import('@/lib/lookout-auth');
}

describe('lookout-auth', () => {
  const original = process.env.CRON_SECRET;
  beforeEach(() => vi.resetModules());
  afterEach(() => {
    if (original === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = original;
  });

  it('treats an unset secret as disabled', async () => {
    const { getLookoutCallbackSecret, verifyLookoutRequest } = await loadWithSecret(undefined);
    expect(getLookoutCallbackSecret()).toBeNull();
    const res = verifyLookoutRequest(new Request('http://x/api/lookout', { method: 'POST' }));
    expect(res).toMatchObject({ ok: false, status: 503 });
  });

  it('treats the placeholder default as disabled', async () => {
    const { getLookoutCallbackSecret } = await loadWithSecret('placeholder');
    expect(getLookoutCallbackSecret()).toBeNull();
  });

  it('rejects a request missing the secret header', async () => {
    const { verifyLookoutRequest } = await loadWithSecret('s3cret');
    const res = verifyLookoutRequest(new Request('http://x/api/lookout', { method: 'POST' }));
    expect(res).toMatchObject({ ok: false, status: 401 });
  });

  it('accepts a request carrying the correct secret header', async () => {
    const { verifyLookoutRequest, LOOKOUT_SECRET_HEADER } = await loadWithSecret('s3cret');
    const req = new Request('http://x/api/lookout', {
      method: 'POST',
      headers: { [LOOKOUT_SECRET_HEADER]: 's3cret' },
    });
    expect(verifyLookoutRequest(req)).toEqual({ ok: true });
  });

  it('emits the QStash-forward header when configured', async () => {
    const { lookoutQstashHeaders, LOOKOUT_SECRET_HEADER } = await loadWithSecret('s3cret');
    expect(lookoutQstashHeaders()).toEqual({ [`Upstash-Forward-${LOOKOUT_SECRET_HEADER}`]: 's3cret' });
  });

  it('emits no headers when the secret is disabled', async () => {
    const { lookoutQstashHeaders } = await loadWithSecret('placeholder');
    expect(lookoutQstashHeaders()).toEqual({});
  });
});
