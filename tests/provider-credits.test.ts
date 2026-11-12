import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';
import { parseDeepSeekBalance, parseOpenRouterCredits } from '@/lib/instance/provider-credits';

describe('credit parsers', () => {
  it('reads what is left of the OpenRouter credits bought', () => {
    expect(parseOpenRouterCredits({ data: { total_credits: 20, total_usage: 7.5 } })).toEqual({
      amount: 12.5,
      currency: 'USD',
    });
    expect(parseOpenRouterCredits({ data: {} })).toBeNull();
  });

  it('reads the DeepSeek balance, in USD when the account has one', () => {
    const body = {
      is_available: true,
      balance_infos: [
        { currency: 'CNY', total_balance: '30.00', granted_balance: '0.00', topped_up_balance: '30.00' },
        { currency: 'USD', total_balance: '4.20', granted_balance: '0.00', topped_up_balance: '4.20' },
      ],
    };
    expect(parseDeepSeekBalance(body)).toEqual({ amount: 4.2, currency: 'USD' });
    expect(parseDeepSeekBalance({ balance_infos: [body.balance_infos[0]] })).toEqual({ amount: 30, currency: 'CNY' });
    expect(parseDeepSeekBalance({ balance_infos: [] })).toBeNull();
  });
});

describe('getProviderCredits', () => {
  const fetchMock = vi.fn();

  // A fresh module and cache for each test.
  async function getProviderCredits() {
    const credits = await import('@/lib/instance/provider-credits');
    return credits.getProviderCredits();
  }

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
    vi.stubEnv('OPENROUTER_API_KEY', 'test-openrouter-key');
    vi.stubEnv('DEEPSEEK_API_KEY', '');
    Reflect.deleteProperty(globalThis, '__zetoraProviderCredits');
    vi.resetModules();
  });

  afterEach(() => {
    fetchMock.mockReset();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it('asks only the configured providers, and caches the answer', async () => {
    fetchMock.mockResolvedValue(Response.json({ data: { total_credits: 10, total_usage: 4 } }));
    const expected = [{ provider: 'openrouter', balance: { amount: 6, currency: 'USD' } }];
    expect(await getProviderCredits()).toEqual(expected);
    expect(await getProviderCredits()).toEqual(expected);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('says why a credit could not be read', async () => {
    fetchMock.mockResolvedValue(new Response('denied', { status: 401 }));
    expect(await getProviderCredits()).toEqual([
      { provider: 'openrouter', balance: { error: 'The provider answered 401' } },
    ]);
  });
});
