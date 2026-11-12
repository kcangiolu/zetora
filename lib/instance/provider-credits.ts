import 'server-only';

import { isConfigured } from '@/ai/catalog/env';
import type { ProviderId } from '@/ai/catalog/config';
import { createLogger } from '@/lib/logger';
import { globalCache } from '@/lib/lru-ttl-cache';

const log = createLogger('provider-credits');

export interface ProviderCredit {
  provider: ProviderId;
  // The credit left on the instance's key, or why it could not be read.
  balance: { amount: number; currency: string } | { error: string };
}

type Balance = { amount: number; currency: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

// GET /api/v1/credits: what the account bought, and has spent, in USD.
export function parseOpenRouterCredits(body: unknown): Balance | null {
  const data = isRecord(body) ? body.data : undefined;
  if (!isRecord(data) || typeof data.total_credits !== 'number' || typeof data.total_usage !== 'number') return null;
  return { amount: data.total_credits - data.total_usage, currency: 'USD' };
}

// GET /user/balance: one balance per currency the account holds, as strings.
export function parseDeepSeekBalance(body: unknown): Balance | null {
  const infos = isRecord(body) && Array.isArray(body.balance_infos) ? body.balance_infos.filter(isRecord) : [];
  const info = infos.find((entry) => entry.currency === 'USD') ?? infos[0];
  const amount = Number(info?.total_balance);
  if (!info || typeof info.currency !== 'string' || !Number.isFinite(amount)) return null;
  return { amount, currency: info.currency };
}

// The providers whose API tells a key its credit. OpenAI, Anthropic, Groq and
// Google show it only in their consoles; xAI needs a separate management key.
interface CreditReader {
  provider: ProviderId;
  envKey: string;
  url: string;
  parse: (body: unknown) => Balance | null;
}

const READERS: CreditReader[] = [
  {
    provider: 'openrouter',
    envKey: 'OPENROUTER_API_KEY',
    url: 'https://openrouter.ai/api/v1/credits',
    parse: parseOpenRouterCredits,
  },
  {
    provider: 'deepseek',
    envKey: 'DEEPSEEK_API_KEY',
    url: 'https://api.deepseek.com/user/balance',
    parse: parseDeepSeekBalance,
  },
];

const CACHE_TTL_MS = 5 * 60 * 1000;
// A failure is retried sooner than a balance is refreshed.
const ERROR_CACHE_TTL_MS = 30 * 1000;
const TIMEOUT_MS = 10_000;
const cache = globalCache<ProviderCredit>('__zetoraProviderCredits', 16);

async function readCredit({ provider, url, parse }: CreditReader, key: string): Promise<ProviderCredit['balance']> {
  try {
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!response.ok) return { error: `The provider answered ${response.status}` };
    return parse(await response.json()) ?? { error: 'The provider answered in an unknown format' };
  } catch (error) {
    log.warn(`Could not read the ${provider} credit: ${error instanceof Error ? error.message : error}`);
    return { error: 'The provider could not be reached' };
  }
}

async function creditOf(reader: CreditReader, key: string): Promise<ProviderCredit> {
  const cached = cache.get(reader.provider);
  if (cached) return cached;
  const credit: ProviderCredit = { provider: reader.provider, balance: await readCredit(reader, key) };
  cache.set(reader.provider, credit, 'error' in credit.balance ? ERROR_CACHE_TTL_MS : CACHE_TTL_MS);
  return credit;
}

// The credit left on each configured provider key that can tell it.
export async function getProviderCredits(): Promise<ProviderCredit[]> {
  return Promise.all(
    READERS.flatMap((reader) => {
      const key = process.env[reader.envKey];
      return isConfigured(key) ? [creditOf(reader, key)] : [];
    }),
  );
}
