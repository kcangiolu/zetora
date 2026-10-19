import { describe, it, expect, afterEach, vi } from 'vitest';
import type { BetterAuthOptions } from 'better-auth';

// betterAuth() is replaced by a function that hands back the options it was
// given, so the tests read the configuration the app really builds.
vi.mock('better-auth/minimal', () => ({ betterAuth: (options: BetterAuthOptions) => ({ options }) }));
vi.mock('better-auth/adapters/drizzle', () => ({ drizzleAdapter: () => ({}) }));
vi.mock('@/lib/db', () => ({ maindb: {} }));
vi.mock('@/lib/user-data-server', () => ({ invalidateSessionCacheForToken: vi.fn() }));
vi.mock('@/lib/email', () => ({ sendVerificationEmail: vi.fn(), sendTwoFactorOTPEmail: vi.fn() }));

const touchedEnv = ['ALLOW_SIGNUPS', 'NODE_ENV', 'NEXT_PUBLIC_APP_URL', 'BETTER_AUTH_BASE_URL', 'ALLOWED_ORIGINS'];
const originalEnv = Object.fromEntries(touchedEnv.map((key) => [key, process.env[key]]));

// serverEnv and the origin list are read at import, so each case re-imports lib/auth.
// lib/auth.ts loads .env.local without overriding, so every variable a case relies
// on is set explicitly, an empty string standing for "unset".
async function loadAuth(env: Record<string, string | undefined>) {
  vi.resetModules();
  for (const [key, value] of Object.entries(env)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  const authModule = await import('@/lib/auth');
  return { ...authModule, options: (authModule.auth as unknown as { options: BetterAuthOptions }).options };
}

function createUserHook(options: BetterAuthOptions) {
  const before = options.databaseHooks?.user?.create?.before;
  if (!before) throw new Error('user.create.before hook is missing');
  return () => before({} as never, null);
}

afterEach(() => {
  for (const [key, value] of Object.entries(originalEnv)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

describe('auth configuration', () => {
  it('refuses every new account when sign-ups are closed', async () => {
    const { options } = await loadAuth({ ALLOW_SIGNUPS: 'false' });
    await expect(createUserHook(options)()).rejects.toMatchObject({ body: { code: 'SIGNUPS_DISABLED' } });
  });

  it('lets new accounts through when sign-ups are open', async () => {
    const { options } = await loadAuth({ ALLOW_SIGNUPS: 'true' });
    await expect(createUserHook(options)()).resolves.toBeUndefined();
  });

  it('rate-limits by the IP header the auth route sets', async () => {
    const { options, CLIENT_IP_HEADER } = await loadAuth({});
    expect(options.advanced?.ipAddress?.ipAddressHeaders).toEqual([CLIENT_IP_HEADER]);
  });

  it('trusts localhost only outside production', async () => {
    const env = { NEXT_PUBLIC_APP_URL: 'https://chat.example.org', BETTER_AUTH_BASE_URL: 'https://chat.example.org' };

    const { options: production } = await loadAuth({
      ...env,
      NODE_ENV: 'production',
      ALLOWED_ORIGINS: ' https://a.example.org ',
    });
    expect(production.trustedOrigins).toEqual(['https://chat.example.org', 'https://a.example.org']);

    const { options: development } = await loadAuth({ ...env, NODE_ENV: 'development', ALLOWED_ORIGINS: '' });
    expect(development.trustedOrigins).toEqual(['http://localhost:3000', 'https://chat.example.org']);
  });
});

describe('auth route', () => {
  const originalTrustedProxy = process.env.TRUSTED_PROXY;
  afterEach(() => {
    if (originalTrustedProxy === undefined) delete process.env.TRUSTED_PROXY;
    else process.env.TRUSTED_PROXY = originalTrustedProxy;
  });

  async function loadRoute() {
    vi.resetModules();
    const received: Request[] = [];
    const handle = async (request: Request) => {
      received.push(request);
      return new Response(null, { status: 204 });
    };
    vi.doMock('better-auth/next-js', () => ({ toNextJsHandler: () => ({ GET: handle, POST: handle }) }));
    vi.doMock('@/lib/auth', () => ({
      auth: {},
      CLIENT_IP_HEADER: 'x-zetora-client-ip',
      UNTRUSTED_CLIENT_IP: '0.0.0.0',
    }));
    const route = await import('@/app/api/auth/[...all]/route');
    return { route, received };
  }

  it('replaces a client-sent IP header with the trusted proxy hop', async () => {
    process.env.TRUSTED_PROXY = 'true';
    const { route, received } = await loadRoute();

    await route.POST(
      new Request('http://localhost/api/auth/sign-in/email', {
        method: 'POST',
        headers: { 'x-zetora-client-ip': '1.2.3.4', 'x-forwarded-for': '9.9.9.9, 203.0.113.7' },
        body: JSON.stringify({ email: 'a@example.org', password: 'pw' }),
      }),
    );

    expect(received[0].headers.get('x-zetora-client-ip')).toBe('203.0.113.7');
    expect(await received[0].json()).toEqual({ email: 'a@example.org', password: 'pw' });
  });

  it('puts every client in one bucket without a trusted proxy', async () => {
    delete process.env.TRUSTED_PROXY;
    const { route, received } = await loadRoute();

    await route.GET(
      new Request('http://localhost/api/auth/get-session', {
        headers: { 'x-zetora-client-ip': '1.2.3.4', 'x-forwarded-for': '203.0.113.7' },
      }),
    );

    expect(received[0].headers.get('x-zetora-client-ip')).toBe('0.0.0.0');
  });
});
