import { afterEach, describe, it, expect, vi } from 'vitest';

// Each provider is chosen once for the instance, in .env, with no default:
// unset, the feature fails with an error naming what to set.

async function load<T>(path: string, env: Record<string, string>): Promise<T> {
  vi.resetModules();
  for (const [name, value] of Object.entries(env)) vi.stubEnv(name, value);
  return (await import(path)) as T;
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('getSandboxProvider', () => {
  type Module = typeof import('@/lib/sandbox/factory');

  it('fails when SANDBOX_PROVIDER is unset', async () => {
    const { getSandboxProvider } = await load<Module>('@/lib/sandbox/factory', { SANDBOX_PROVIDER: '' });
    expect(() => getSandboxProvider()).toThrow('set SANDBOX_PROVIDER to docker or daytona');
  });

  it('requires the Daytona key when Daytona is chosen', async () => {
    const { getSandboxProvider } = await load<Module>('@/lib/sandbox/factory', {
      SANDBOX_PROVIDER: 'daytona',
      DAYTONA_API_KEY: '',
    });
    expect(() => getSandboxProvider()).toThrow('needs DAYTONA_API_KEY');
  });
});

describe('getLookoutScheduler', () => {
  type Module = typeof import('@/lib/services/bullmq');

  it('fails when LOOKOUT_SCHEDULER is unset', async () => {
    const { getLookoutScheduler } = await load<Module>('@/lib/services/bullmq', { LOOKOUT_SCHEDULER: '' });
    expect(() => getLookoutScheduler()).toThrow('set LOOKOUT_SCHEDULER to bullmq or qstash');
  });

  it('requires the QStash token when QStash is chosen', async () => {
    const { getLookoutScheduler } = await load<Module>('@/lib/services/bullmq', {
      LOOKOUT_SCHEDULER: 'qstash',
      QSTASH_TOKEN: '',
    });
    expect(() => getLookoutScheduler()).toThrow('needs QSTASH_TOKEN');
  });

  it('uses BullMQ when chosen', async () => {
    const { getLookoutScheduler } = await load<Module>('@/lib/services/bullmq', { LOOKOUT_SCHEDULER: 'bullmq' });
    expect(getLookoutScheduler()).toBe('bullmq');
  });
});

describe('email', () => {
  it('reports the missing SMTP settings instead of sending', async () => {
    const { sendVerificationEmail } = await load<typeof import('@/lib/email')>('@/lib/email', {
      SMTP_HOST: 'smtp.example.com',
      SMTP_USER: '',
      SMTP_PASS: '',
      SMTP_FROM: 'Zetora <noreply@example.com>',
    });
    await expect(sendVerificationEmail({ to: 'a@example.com', url: 'https://example.com' })).rejects.toThrow(
      'Email is not configured: set SMTP_USER, SMTP_PASS (see .env.example)',
    );
  });
});
