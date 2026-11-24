import { describe, it, expect, afterEach, vi } from 'vitest';
import type { BetterAuthOptions } from 'better-auth';
import type { SSOOptions } from '@better-auth/sso';

// betterAuth() is replaced by a function that hands back the options it was
// given, so the tests read the configuration the app really builds.
vi.mock('better-auth/minimal', () => ({ betterAuth: (options: BetterAuthOptions) => ({ options }) }));
vi.mock('better-auth/adapters/drizzle', () => ({ drizzleAdapter: () => ({}) }));
vi.mock('@/lib/db', () => ({ maindb: {} }));
vi.mock('@/lib/user-data-server', () => ({ invalidateSessionCacheForToken: vi.fn() }));
const missingEmailSettings = vi.fn((): string[] => []);
vi.mock('@/lib/email', () => ({
  sendVerificationEmail: vi.fn(),
  sendTwoFactorOTPEmail: vi.fn(),
  missingEmailSettings,
}));
const replaceUserGroups = vi.fn(async (_userId: string, _groups: readonly string[]) => {});
vi.mock('@/lib/db/queries/identity', () => ({ replaceUserGroups }));

const touchedEnv = [
  'ALLOW_SIGNUPS',
  'REQUIRE_EMAIL_VERIFICATION',
  'NODE_ENV',
  'NEXT_PUBLIC_APP_URL',
  'BETTER_AUTH_BASE_URL',
  'ALLOWED_ORIGINS',
  'OIDC_ISSUER',
  'OIDC_CLIENT_ID',
  'OIDC_CLIENT_SECRET',
  'OIDC_GROUPS_CLAIM',
  'ZETORA_SSO_ONLY',
  'ZETORA_SESSION_HOURS',
  'GITHUB_CLIENT_ID',
  'GITHUB_CLIENT_SECRET',
];
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

// Runs the auth middleware as Better Auth does before the endpoint at `path`.
function beforeHook(options: BetterAuthOptions) {
  const before = options.hooks?.before;
  if (!before) throw new Error('hooks.before is missing');
  return (path: string) => before({ path } as never);
}

function createUserHook(options: BetterAuthOptions) {
  const before = options.databaseHooks?.user?.create?.before;
  if (!before) throw new Error('user.create.before hook is missing');
  // Better Auth passes the endpoint context, whose path is the route template.
  return (path?: string) => before({} as never, path ? ({ path } as never) : null);
}

const oidcEnv = {
  OIDC_ISSUER: 'https://idp.example.com/application/o/zetora/',
  OIDC_CLIENT_ID: 'client-1',
  OIDC_CLIENT_SECRET: 'client-secret',
};

function ssoPluginOptions(options: BetterAuthOptions): SSOOptions {
  const plugin = options.plugins?.find((candidate) => candidate.id === 'sso');
  if (!plugin?.options) throw new Error('the sso plugin is missing');
  return plugin.options;
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

  it('refuses a sign-up whose verification email cannot be sent', async () => {
    missingEmailSettings.mockReturnValue(['SMTP_USER', 'SMTP_PASS']);
    const { options } = await loadAuth({ REQUIRE_EMAIL_VERIFICATION: '' });
    const runBefore = beforeHook(options);
    expect(options.emailAndPassword?.requireEmailVerification).toBe(true);
    await expect(runBefore('/sign-up/email')).rejects.toMatchObject({
      body: { code: 'EMAIL_NOT_CONFIGURED', message: expect.stringContaining('SMTP_USER, SMTP_PASS') },
    });
    await expect(runBefore('/send-verification-email')).rejects.toMatchObject({
      body: { code: 'EMAIL_NOT_CONFIGURED' },
    });
    await expect(runBefore('/sign-in/email')).resolves.not.toThrow();

    missingEmailSettings.mockReturnValue([]);
    await expect(runBefore('/sign-up/email')).resolves.not.toThrow();
  });

  it('signs new accounts in without an email when verification is off', async () => {
    missingEmailSettings.mockReturnValue(['SMTP_HOST']);
    const { options } = await loadAuth({ REQUIRE_EMAIL_VERIFICATION: 'false' });
    expect(options.emailAndPassword?.requireEmailVerification).toBe(false);
    expect(options.emailVerification?.sendOnSignUp).toBe(false);
    await expect(beforeHook(options)('/sign-up/email')).resolves.not.toThrow();
  });

  it('creates accounts at the first single sign-on even with sign-ups closed', async () => {
    const { options } = await loadAuth({ ...oidcEnv, ALLOW_SIGNUPS: 'false' });
    const createUser = createUserHook(options);
    await expect(createUser('/sso/callback/:providerId')).resolves.toBeUndefined();
    await expect(createUser('/sign-up/email')).rejects.toMatchObject({ body: { code: 'SIGNUPS_DISABLED' } });
  });

  it('sends no verification email for an account created by single sign-on', async () => {
    const { sendVerificationEmail } = await import('@/lib/email');
    const { options } = await loadAuth({ ...oidcEnv });
    const send = options.emailVerification?.sendVerificationEmail;
    if (!send) throw new Error('sendVerificationEmail is missing');
    const user = {
      id: 'user-1',
      email: 'ada@example.com',
      emailVerified: false,
      name: 'Ada',
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    const data = { user, url: 'http://localhost:3000/api/auth/verify-email?token=t', token: 't' };
    vi.mocked(sendVerificationEmail).mockClear();

    await send(data, new Request('http://localhost:3000/api/auth/sso/saml2/sp/acs/saml', { method: 'POST' }));
    await send(data, new Request('http://localhost:3000/api/auth/sso/callback/oidc'));
    expect(sendVerificationEmail).not.toHaveBeenCalled();

    await send(data, new Request('http://localhost:3000/api/auth/callback/github'));
    expect(sendVerificationEmail).toHaveBeenCalledTimes(1);
  });

  it('declares the OpenID Connect provider and trusts its origin', async () => {
    const { options, enabledSsoProviders } = await loadAuth({ ...oidcEnv, ZETORA_SSO_ONLY: '' });
    expect(enabledSsoProviders).toEqual(['oidc']);
    expect(options.trustedOrigins).toContain('https://idp.example.com');
    expect(ssoPluginOptions(options)).toMatchObject({
      providersLimit: 0,
      provisionUserOnEveryLogin: true,
      domainVerification: { enabled: true },
    });
    expect(options.emailAndPassword?.enabled).toBe(true);
    expect(options.session).toBeUndefined();
  });

  it('syncs the groups at each single sign-on, and clears them when the claim is missing', async () => {
    const { options } = await loadAuth({ ...oidcEnv, OIDC_GROUPS_CLAIM: '' });
    const provisionUser = ssoPluginOptions(options).provisionUser;
    if (!provisionUser) throw new Error('provisionUser is missing');
    const provider = { providerId: 'oidc', issuer: oidcEnv.OIDC_ISSUER, userId: 'default', domain: '' };
    const user = {
      id: 'user-1',
      email: 'ada@example.com',
      emailVerified: false,
      name: 'Ada',
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    await provisionUser({ user, userInfo: { groups: ['zetora-admins'] }, provider });
    expect(replaceUserGroups).toHaveBeenLastCalledWith('user-1', ['zetora-admins']);

    await provisionUser({ user, userInfo: {}, provider });
    expect(replaceUserGroups).toHaveBeenLastCalledWith('user-1', []);
  });

  it('closes password and social sign-in under SSO only, with fixed 8-hour sessions', async () => {
    const { options, enabledSocialProviders, passwordSignInEnabled } = await loadAuth({
      ...oidcEnv,
      ZETORA_SSO_ONLY: 'true',
      ZETORA_SESSION_HOURS: '',
      GITHUB_CLIENT_ID: 'github-id',
      GITHUB_CLIENT_SECRET: 'github-secret',
    });
    expect(options.emailAndPassword?.enabled).toBe(false);
    expect(options.socialProviders).toEqual({});
    expect(enabledSocialProviders).toEqual([]);
    expect(passwordSignInEnabled).toBe(false);
    expect(options.session).toEqual({ expiresIn: 8 * 3600, disableSessionRefresh: true });
  });

  it('refuses to start under SSO only without a provider', async () => {
    await expect(
      loadAuth({ OIDC_ISSUER: '', OIDC_CLIENT_ID: '', OIDC_CLIENT_SECRET: '', ZETORA_SSO_ONLY: 'true' }),
    ).rejects.toThrow(/ZETORA_SSO_ONLY=true but no single sign-on is configured/);
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

  // The Drizzle adapter drops fields its table does not declare, so a plugin
  // field missing here turns into an UPDATE with an empty SET at runtime.
  it('declares every column the auth plugins read and write', async () => {
    const { options } = await loadAuth({});
    const { getTableColumns } = await import('drizzle-orm');
    const { user, twoFactor, ssoProvider } = await import('@/lib/db/schema');
    const tables = { user, twoFactor, ssoProvider };

    const missing: string[] = [];
    for (const plugin of options.plugins ?? []) {
      for (const [model, { fields }] of Object.entries(plugin.schema ?? {})) {
        const table = model in tables ? tables[model as keyof typeof tables] : undefined;
        if (!table) {
          missing.push(`${plugin.id}: table for model ${model}`);
          continue;
        }
        const columns = getTableColumns(table);
        for (const field of Object.keys(fields)) {
          if (!(field in columns)) missing.push(`${plugin.id}: ${model}.${field}`);
        }
      }
    }
    expect(missing).toEqual([]);
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
