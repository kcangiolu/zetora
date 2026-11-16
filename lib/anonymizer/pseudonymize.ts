import 'server-only';

import { createHmac } from 'node:crypto';
import pLimit from 'p-limit';
import { serverEnv } from '@/env/server';
import { encryptMcpCredentials, decryptMcpCredentials } from '@/lib/mcp/crypto';
import { upsertPiiAliases, getPiiAliasesByTokens } from '@/lib/db/queries';
import { AnonymizationUnavailableError, EgressBlockedError } from '@/lib/egress/errors';
import { detectEntities } from './client';

import { createLogger } from '@/lib/logger';

const log = createLogger('pseudonymize');

// presidio-api is one shared instance behind a fixed thread pool (see
// _analyze_pool in presidio-service/main.py). Walking a large tool result
// (e.g. dozens of web_search snippets) can fan out into hundreds of /detect
// calls via mapJsonStrings' Promise.all; without a cap here those pile up
// faster than presidio-api can drain them and start blowing the 10s client
// timeout in client.ts even though the service itself is fine. This limit
// is process-wide (module singleton) since the same overload can come from
// multiple concurrent requests/users, not just one big payload.
const detectLimit = pLimit(8);

export interface AnonymizeContext {
  userId: string;
  language?: string;
  nerEnabled?: boolean;
  denyTerms?: string[];
  failOpen?: boolean;
}

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
    entities = await detectLimit(() =>
      detectEntities(text, ctx.language ?? 'en', ctx.denyTerms ?? [], ctx.nerEnabled ?? true),
    );
  } catch (error) {
    if (ctx.failOpen) {
      log.error('[anonymizer] detection failed, failing open (cleartext will be sent):', error);
      return text;
    }
    throw new AnonymizationUnavailableError(
      'Anonymization is on, but the PII detection service is not answering, so nothing was sent. Try again in a moment.',
    );
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
  const resolved = new Map(aliases.map(({ token, originalEnc }) => [token, originalEnc]));

  let result = text;
  for (const token of tokens) {
    const originalEnc = resolved.get(token);
    if (originalEnc !== undefined) {
      result = result.split(token).join(decryptMcpCredentials(originalEnc));
      continue;
    }
    // No vault entry for this token (alias lookup miss, or the model
    // hallucinated/repeated a token from garbled history). Never let the raw
    // ⟦TYPE_hash⟧ marker reach the user or get persisted — once a broken
    // token lands in a saved assistant message, the model echoes it back on
    // every later turn in that chat, permanently propagating the leak even
    // after this account's anonymization setting is turned off.
    log.error(`[anonymizer] No vault entry for token ${token}, masking instead of leaking raw marker`, {
      userId: ctx.userId,
    });
    result = result.split(token).join('[masked]');
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
      Object.entries(value as Record<string, unknown>).map(
        async ([key, v]) => [key, await mapJsonStrings(v, op)] as const,
      ),
    );
    return Object.fromEntries(entries);
  }
  return value;
}

// Images, audio and documents sent as files cannot be pseudonymized, so with
// anonymization on they never reach the provider.
const FILE_REFUSAL =
  'Anonymization is on, so images and files cannot go to a provider that is not local: they cannot be pseudonymized. Turn vision off for this chat or remove the attachment, or pick a model whose provider is marked Local.';

async function mapToolOutputContent(value: unknown, op: TextOp): Promise<unknown> {
  if (!Array.isArray(value)) return value;
  return Promise.all(
    value.map(async (item: unknown) => {
      if (!item || typeof item !== 'object') return item;
      const entry = item as Record<string, unknown>;
      if (entry.type === 'text' && typeof entry.text === 'string') return { ...entry, text: await op(entry.text) };
      // Provider-specific markers carry no content of their own.
      if (entry.type === 'custom') return entry;
      throw new EgressBlockedError(FILE_REFUSAL);
    }),
  );
}

async function mapContentPart(part: unknown, op: TextOp): Promise<unknown> {
  if (!part || typeof part !== 'object') return part;
  const p = part as Record<string, unknown>;

  switch (p.type) {
    case 'text':
    case 'reasoning':
      return typeof p.text === 'string' ? { ...p, text: await op(p.text) } : p;
    case 'file':
      throw new EgressBlockedError(FILE_REFUSAL);
    case 'tool-call':
      return { ...p, input: await mapJsonStrings(p.input, op) };
    case 'tool-result': {
      const output = p.output as { type?: string; value?: unknown; reason?: unknown } | undefined;
      switch (output?.type) {
        case 'text':
        case 'error-text':
          return typeof output.value === 'string' ? { ...p, output: { ...output, value: await op(output.value) } } : p;
        case 'json':
        case 'error-json':
          return { ...p, output: { ...output, value: await mapJsonStrings(output.value, op) } };
        case 'content':
          return { ...p, output: { ...output, value: await mapToolOutputContent(output.value, op) } };
        case 'execution-denied':
          return typeof output.reason === 'string'
            ? { ...p, output: { ...output, reason: await op(output.reason) } }
            : p;
        default:
          return p;
      }
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

// The way back for a model that reads cleartext: pseudonyms a tool echoed
// from its input (a query, a title) return to the real values.
export async function deanonymizeToolOutput(value: unknown, ctx: Pick<AnonymizeContext, 'userId'>): Promise<unknown> {
  return mapJsonStrings(value, (text) => deanonymizeText(text, ctx));
}
