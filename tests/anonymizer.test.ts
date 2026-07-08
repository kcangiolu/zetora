import { describe, it, expect, vi, beforeEach } from 'vitest';

const { detectEntities } = vi.hoisted(() => ({ detectEntities: vi.fn() }));

vi.mock('@/lib/anonymizer/client', () => ({ detectEntities }));

// Fake vault backed by a plain Map, standing in for the pii_alias table.
const vault = new Map<string, { entityType: string; originalEnc: string }>();

vi.mock('@/lib/db/queries', () => ({
  upsertPiiAliases: vi.fn(async (_userId: string, entries: Array<{ token: string; entityType: string; originalEnc: string }>) => {
    for (const entry of entries) {
      if (!vault.has(entry.token)) vault.set(entry.token, entry);
    }
  }),
  getPiiAliasesByTokens: vi.fn(async (_userId: string, tokens: string[]) =>
    tokens.filter((t) => vault.has(t)).map((token) => ({ token, originalEnc: vault.get(token)!.originalEnc })),
  ),
}));

import {
  anonymizeText,
  deanonymizeText,
  anonymizeModelMessages,
  anonymizeToolInput,
  AnonymizationUnavailableError,
} from '@/lib/anonymizer/pseudonymize';

const ctx = { userId: 'user-1' };

describe('anonymizeText / deanonymizeText', () => {
  beforeEach(() => {
    vault.clear();
    detectEntities.mockReset();
  });

  it('replaces detected entities with tokens and round-trips back to the original', async () => {
    detectEntities.mockResolvedValue([{ start: 11, end: 19, type: 'PERSON', score: 0.9, text: 'Jane Doe' }]);

    const masked = await anonymizeText('My client Jane Doe called today', ctx);
    expect(masked).not.toContain('Jane Doe');
    expect(masked).toMatch(/⟦PERSON_[a-f0-9]{10}⟧/);

    const restored = await deanonymizeText(masked, ctx);
    expect(restored).toBe('My client Jane Doe called today');
  });

  it('is deterministic: the same value always maps to the same token', async () => {
    detectEntities.mockResolvedValue([{ start: 0, end: 8, type: 'PERSON', score: 0.9, text: 'Jane Doe' }]);

    const first = await anonymizeText('Jane Doe called', ctx);
    const second = await anonymizeText('Jane Doe emailed', ctx);

    const tokenFrom = (s: string) => s.match(/⟦PERSON_[a-f0-9]{10}⟧/)?.[0];
    expect(tokenFrom(first)).toBeDefined();
    expect(tokenFrom(first)).toBe(tokenFrom(second));
  });

  it('scopes tokens per user (different users never share a token)', async () => {
    detectEntities.mockResolvedValue([{ start: 0, end: 8, type: 'PERSON', score: 0.9, text: 'Jane Doe' }]);

    const a = await anonymizeText('Jane Doe', { userId: 'user-a' });
    const b = await anonymizeText('Jane Doe', { userId: 'user-b' });
    expect(a).not.toBe(b);
  });

  it('leaves text untouched when no entities are detected', async () => {
    detectEntities.mockResolvedValue([]);
    const text = 'nothing sensitive here';
    expect(await anonymizeText(text, ctx)).toBe(text);
  });

  it('is fail-closed by default: throws when detection is unavailable', async () => {
    detectEntities.mockRejectedValue(new Error('service down'));
    await expect(anonymizeText('some text', ctx)).rejects.toThrow(AnonymizationUnavailableError);
  });

  it('fails open when configured to, returning cleartext instead of blocking', async () => {
    detectEntities.mockRejectedValue(new Error('service down'));
    const text = 'some text';
    expect(await anonymizeText(text, { ...ctx, failOpen: true })).toBe(text);
  });

  it('deanonymizeText is a no-op for text with no tokens', async () => {
    const text = 'plain text with no tokens';
    expect(await deanonymizeText(text, ctx)).toBe(text);
  });

  it('forwards language and nerEnabled from the context to detectEntities', async () => {
    detectEntities.mockResolvedValue([]);
    await anonymizeText('un texte en français', { ...ctx, language: 'fr', nerEnabled: false });
    expect(detectEntities).toHaveBeenCalledWith('un texte en français', 'fr', [], false);
  });

  it('defaults to English with NER on when the context omits them', async () => {
    detectEntities.mockResolvedValue([]);
    await anonymizeText('some text', ctx);
    expect(detectEntities).toHaveBeenCalledWith('some text', 'en', [], true);
  });
});

describe('anonymizeModelMessages', () => {
  beforeEach(() => {
    vault.clear();
    detectEntities.mockReset();
  });

  it('masks system string content and user/assistant text parts', async () => {
    detectEntities.mockImplementation(async (text: string) => {
      const idx = text.indexOf('Acme Corp');
      return idx === -1 ? [] : [{ start: idx, end: idx + 'Acme Corp'.length, type: 'ORG', score: 0.9, text: 'Acme Corp' }];
    });

    const prompt = [
      { role: 'system', content: 'You help with Acme Corp support tickets.' },
      { role: 'user', content: [{ type: 'text', text: 'What did Acme Corp ask for?' }] },
    ];

    const result = (await anonymizeModelMessages(prompt, ctx)) as any[];

    expect(result[0].content).not.toContain('Acme Corp');
    expect(result[0].content).toMatch(/⟦ORG_[a-f0-9]{10}⟧/);
    expect(result[1].content[0].text).not.toContain('Acme Corp');
  });
});

describe('anonymizeToolInput', () => {
  beforeEach(() => {
    vault.clear();
    detectEntities.mockReset();
  });

  it('recursively masks string leaves in nested objects/arrays', async () => {
    detectEntities.mockImplementation(async (text: string) => {
      const idx = text.indexOf('Jane Doe');
      return idx === -1 ? [] : [{ start: idx, end: idx + 'Jane Doe'.length, type: 'PERSON', score: 0.9, text: 'Jane Doe' }];
    });

    const input = { query: 'Find news about Jane Doe', filters: ['Jane Doe', { nested: 'Jane Doe' }] };
    const masked = (await anonymizeToolInput(input, ctx)) as typeof input;

    expect(masked.query).not.toContain('Jane Doe');
    expect((masked.filters[0] as string)).not.toContain('Jane Doe');
    expect((masked.filters[1] as any).nested).not.toContain('Jane Doe');
  });
});
