import 'server-only';

import { createHmac } from 'node:crypto';
import { serverEnv } from '@/env/server';
import { encryptMcpCredentials, decryptMcpCredentials } from '@/lib/mcp/crypto';
import { upsertPiiAliases, getPiiAliasesByTokens } from '@/lib/db/queries';
import { detectEntities } from './client';

export interface AnonymizeContext {
  userId: string;
  language?: string;
  nerEnabled?: boolean;
  denyTerms?: string[];
  failOpen?: boolean;
}

// Thrown when the anonymization layer is active, detection failed (the
// presidio-service is unreachable/erroring), and fail-open was NOT
// requested — the caller must abort rather than risk sending cleartext.
export class AnonymizationUnavailableError extends Error {}

export const TOKEN_PATTERN = /⟦([A-Z_]+)_([a-f0-9]{10})⟧/g;

function getSecret(): string {
  const key = serverEnv.MCP_CREDENTIALS_ENCRYPTION_KEY;
  if (!key || key === 'placeholder') {
    throw new Error('MCP_CREDENTIALS_ENCRYPTION_KEY must be set to use the anonymization layer.');
  }
  return key;
}

// Deterministic: the same (userId, entityType, original value) always
// produces the same token, so repeated entities stay consistent across
// turns, sessions, and tools without any shared per-request state.
function tokenFor(userId: string, entityType: string, value: string): string {
  const normalized = value.trim().toLowerCase();
  const hash = createHmac('sha256', getSecret()).update(`${userId}:${normalized}`).digest('hex').slice(0, 10);
  const safeType = entityType.replace(/[^A-Z_]/gi, '_').toUpperCase();
  return `⟦${safeType}_${hash}⟧`;
}

export async function anonymizeText(text: string, ctx: AnonymizeContext): Promise<string> {
  if (!text || !text.trim()) return text;

  let entities;
  try {
    entities = await detectEntities(text, ctx.language ?? 'en', ctx.denyTerms ?? [], ctx.nerEnabled ?? true);
  } catch (error) {
    if (ctx.failOpen) {
      console.error('[anonymizer] detection failed, failing open (cleartext will be sent):', error);
      return text;
    }
    throw new AnonymizationUnavailableError('PII detection service unavailable');
  }

  if (entities.length === 0) return text;

  // Presidio computes start/end as Unicode code point offsets (Python string
  // indexing), not UTF-16 code units. Slicing the raw JS string with those
  // offsets directly can land inside a surrogate pair (emoji, astral chars)
  // and leave a lone surrogate in the result, which corrupts the JSON body
  // sent to the model provider. Split into code points first so offsets and
  // slicing stay aligned.
  const codePoints = Array.from(text);

  // Replace from the end so earlier spans' offsets stay valid.
  const sorted = [...entities].sort((a, b) => b.start - a.start);
  const toStore: Array<{ token: string; entityType: string; originalEnc: string }> = [];
  let result = codePoints;

  for (const entity of sorted) {
    const original = codePoints.slice(entity.start, entity.end).join('');
    if (!original) continue;
    const token = tokenFor(ctx.userId, entity.type, original);
    toStore.push({ token, entityType: entity.type, originalEnc: encryptMcpCredentials(original) });
    result = [...result.slice(0, entity.start), token, ...result.slice(entity.end)];
  }

  await upsertPiiAliases(ctx.userId, toStore);
  return result.join('');
}

export async function deanonymizeText(text: string, ctx: Pick<AnonymizeContext, 'userId'>): Promise<string> {
  if (!text || !text.includes('⟦')) return text;

  const tokens = [...new Set([...text.matchAll(TOKEN_PATTERN)].map((m) => m[0]))];
  if (tokens.length === 0) return text;

  const aliases = await getPiiAliasesByTokens(ctx.userId, tokens);
  if (aliases.length === 0) return text;

  let result = text;
  for (const { token, originalEnc } of aliases) {
    result = result.split(token).join(decryptMcpCredentials(originalEnc));
  }
  return result;
}

type TextOp = (text: string) => Promise<string>;

// Recursively applies `op` to every string leaf in an arbitrary JSON value
// (tool call inputs / tool result payloads are not a fixed shape).
async function mapJsonStrings(value: unknown, op: TextOp): Promise<unknown> {
  if (typeof value === 'string') return op(value);
  if (Array.isArray(value)) return Promise.all(value.map((v) => mapJsonStrings(v, op)));
  if (value && typeof value === 'object') {
    const entries = await Promise.all(
      Object.entries(value as Record<string, unknown>).map(async ([key, v]) => [key, await mapJsonStrings(v, op)] as const),
    );
    return Object.fromEntries(entries);
  }
  return value;
}

async function mapContentPart(part: unknown, op: TextOp): Promise<unknown> {
  if (!part || typeof part !== 'object') return part;
  const p = part as Record<string, unknown>;

  switch (p.type) {
    case 'text':
    case 'reasoning':
      return typeof p.text === 'string' ? { ...p, text: await op(p.text) } : p;
    case 'tool-call':
      return { ...p, input: await mapJsonStrings(p.input, op) };
    case 'tool-result': {
      const output = p.output as { type?: string; value?: unknown } | undefined;
      if (output?.type === 'text' && typeof output.value === 'string') {
        return { ...p, output: { ...output, value: await op(output.value) } };
      }
      if (output?.type === 'json') {
        return { ...p, output: { ...output, value: await mapJsonStrings(output.value, op) } };
      }
      return p;
    }
    default:
      return p;
  }
}

async function mapMessage(message: unknown, op: TextOp): Promise<unknown> {
  if (!message || typeof message !== 'object') return message;
  const m = message as Record<string, unknown>;

  if (m.role === 'system' && typeof m.content === 'string') {
    return { ...m, content: await op(m.content) };
  }
  if (Array.isArray(m.content)) {
    const content = await Promise.all(m.content.map((part) => mapContentPart(part, op)));
    return { ...m, content };
  }
  return m;
}

// Anonymizes an entire LanguageModelV3 prompt (system/user/assistant/tool
// messages, including historical tool calls/results) before it leaves this
// process for a cloud provider.
export async function anonymizeModelMessages(prompt: unknown, ctx: AnonymizeContext): Promise<unknown> {
  if (!Array.isArray(prompt)) return prompt;
  // Memoize within a single call so repeated identical strings (system
  // prompt, unchanged history) don't hit the detector redundantly.
  const cache = new Map<string, Promise<string>>();
  const op: TextOp = (text) => {
    let cached = cache.get(text);
    if (!cached) {
      cached = anonymizeText(text, ctx);
      cache.set(text, cached);
    }
    return cached;
  };
  return Promise.all(prompt.map((message) => mapMessage(message, op)));
}

export async function anonymizeToolInput(value: unknown, ctx: AnonymizeContext): Promise<unknown> {
  return mapJsonStrings(value, (text) => anonymizeText(text, ctx));
}
