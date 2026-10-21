import { afterEach, describe, expect, it, vi } from 'vitest';

// The daily cap on messages per account, set by ZETORA_DAILY_MESSAGE_LIMIT.

vi.mock('server-only', () => ({}));
vi.mock('@/lib/db/queries', () => ({}));

const messageCount = vi.fn(async () => ({ messageCount: 0 }));
vi.mock('@/lib/search/server-helpers', () => ({ getMessageCountByUserIdAction: messageCount }));

async function checkWith(limit: string, sentToday: number) {
  vi.resetModules();
  vi.stubEnv('ZETORA_DAILY_MESSAGE_LIMIT', limit);
  messageCount.mockResolvedValue({ messageCount: sentToday });
  const { initializeChatAndChecks } = await import('@/lib/search/chat-initialization');
  return initializeChatAndChecks({
    chatQueryPromise: Promise.resolve(null),
    lightweightUser: { userId: 'user-1', email: 'ada@example.com' },
    id: 'chat-1',
    streamId: 'stream-1',
    selectedVisibilityType: 'private',
    messages: [],
    isTemporaryChat: true,
  }).criticalChecksPromise;
}

const LIMIT_REACHED = { type: 'rate_limit', cause: 'Daily message limit reached' };

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('daily message limit', () => {
  it('refuses a message once the configured cap is reached', async () => {
    await expect(checkWith('20', 20)).rejects.toMatchObject(LIMIT_REACHED);
    await expect(checkWith('20', 19)).resolves.toMatchObject({ canProceed: true });
  });

  it('defaults to 500 messages a day', async () => {
    await expect(checkWith('', 499)).resolves.toMatchObject({ canProceed: true });
    await expect(checkWith('', 500)).rejects.toMatchObject(LIMIT_REACHED);
  });

  it('has no cap when set to 0', async () => {
    await expect(checkWith('0', 100_000)).resolves.toMatchObject({ canProceed: true });
  });
});
