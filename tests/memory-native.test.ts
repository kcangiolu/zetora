import { describe, it, expect } from 'vitest';
import { selectRelevantEntries, tokenize, trigramSimilarity } from '@/lib/memory/text-match';
import {
  planMemoryMutations,
  cleanEntryText,
  cleanKeywords,
  type MemoryOp,
  type MemoryOrigin,
  type PlannableEntry,
} from '@/lib/memory/ops';
import { planConsolidation, type ConsolidatableEntry } from '@/lib/memory/consolidation-plan';
import {
  buildContextualMemoryBlock,
  buildMemoryQueryText,
  buildMemorySystemBlock,
  capEntries,
  formatTurnForMemory,
} from '@/lib/memory/prompt';

function op(partial: Partial<MemoryOp> & Pick<MemoryOp, 'op'>): MemoryOp {
  return { id: null, text: null, category: null, durability: null, tier: null, keywords: null, ...partial };
}

function entry(partial: Partial<PlannableEntry> & Pick<PlannableEntry, 'id' | 'text'>): PlannableEntry {
  return { status: 'confirmed', userLocked: false, sourceChatId: 'chat-a', sourceSessionId: null, ...partial };
}

const inChat = (chatId: string): MemoryOrigin => ({ chatId, sessionId: null });

const addOp = (text: string) =>
  op({ op: 'add', text, category: 'project', durability: 'months', tier: 'contextual', keywords: ['x'] });

describe('text matching', () => {
  it('tokenizes without accents, short words or stopwords', () => {
    expect(tokenize('Le Serveur est à Lyon, avec Hélène')).toEqual(['serveur', 'lyon', 'helene']);
  });

  it('scores identical texts as fully similar and unrelated ones low', () => {
    expect(trigramSimilarity('Works as a nurse', 'works as a nurse')).toBe(1);
    expect(trigramSimilarity('Works as a nurse', 'Owns a Tesla Model 3')).toBeLessThan(0.2);
  });

  const entries = [
    { id: 'proxy', text: 'Uses Caddy as reverse proxy at home', keywords: ['nginx', 'certificat', 'domaine'] },
    { id: 'diet', text: 'Is vegetarian', keywords: ['viande', 'recette', 'restaurant'] },
    { id: 'car', text: 'Drives an electric car', keywords: ['voiture', 'Tesla'] },
  ];

  it('matches an entry through its keywords, including inflections', () => {
    expect(selectRelevantEntries(entries, 'Mon certificat nginx a expiré', 6).map((e) => e.id)).toEqual(['proxy']);
    expect(selectRelevantEntries(entries, 'Une idée de recettes pour ce soir ?', 6).map((e) => e.id)).toEqual(['diet']);
  });

  it('returns nothing when the message is off-topic', () => {
    expect(selectRelevantEntries(entries, 'Quelle est la capitale du Pérou ?', 6)).toEqual([]);
  });

  it('needs two distinct text words without a keyword hit', () => {
    const textOnly = [{ id: 'a', text: 'Learning Rust programming language', keywords: [] }];
    expect(selectRelevantEntries(textOnly, 'rust', 6)).toEqual([]);
    expect(selectRelevantEntries(textOnly, 'rust programming tips', 6).map((e) => e.id)).toEqual(['a']);
  });

  it('respects the limit', () => {
    const many = Array.from({ length: 10 }, (_, i) => ({ id: `${i}`, text: `fact ${i}`, keywords: ['homelab'] }));
    expect(selectRelevantEntries(many, 'homelab', 6)).toHaveLength(6);
  });
});

describe('cleaning', () => {
  it('rejects empty and over-long texts instead of truncating', () => {
    expect(cleanEntryText('  Works   as a nurse ')).toBe('Works as a nurse');
    expect(cleanEntryText('   ')).toBeNull();
    expect(cleanEntryText('x'.repeat(201))).toBeNull();
  });

  it('dedupes keywords case-insensitively and caps them', () => {
    expect(cleanKeywords(['Docker', 'docker', ' ', 'x'.repeat(41), 'Compose'])).toEqual(['Docker', 'Compose']);
    expect(cleanKeywords(Array.from({ length: 12 }, (_, i) => `k${i}`))).toHaveLength(8);
  });
});

describe('planMemoryMutations', () => {
  it('inserts a new fact', () => {
    expect(planMemoryMutations([addOp('Migrates storage from MinIO to Silo')], [], inChat('chat-a'))).toEqual([
      {
        kind: 'insert',
        values: {
          text: 'Migrates storage from MinIO to Silo',
          category: 'project',
          durability: 'months',
          tier: 'contextual',
          keywords: ['x'],
        },
      },
    ]);
  });

  it('applies at most three operations per turn', () => {
    const ops = ['Fact one about Alpha', 'Fact two about Bravo', 'Fact three about Charlie', 'Fact four about Delta'];
    expect(planMemoryMutations(ops.map(addOp), [], inChat('chat-a'))).toHaveLength(3);
  });

  it('drops an add without category or durability', () => {
    expect(planMemoryMutations([op({ op: 'add', text: 'Something' })], [], inChat('chat-a'))).toEqual([]);
  });

  it('turns a re-stated candidate from another chat into a confirmation', () => {
    const existing = [entry({ id: 'e1', text: 'Is learning Rust', status: 'candidate', sourceChatId: 'chat-a' })];
    expect(planMemoryMutations([addOp('Is learning Rust.')], existing, inChat('chat-b'))).toEqual([
      { kind: 'confirm', id: 'e1' },
    ]);
  });

  it('never confirms a candidate from the chat it came from', () => {
    const existing = [entry({ id: 'e1', text: 'Is learning Rust', status: 'candidate', sourceChatId: 'chat-a' })];
    expect(planMemoryMutations([addOp('Is learning Rust')], existing, inChat('chat-a'))).toEqual([]);
    expect(planMemoryMutations([op({ op: 'confirm', id: 'e1' })], existing, inChat('chat-a'))).toEqual([]);
  });

  it('never confirms a candidate from the Hermes session it came from', () => {
    const existing = [
      entry({ id: 'e1', text: 'Is learning Rust', status: 'candidate', sourceChatId: null, sourceSessionId: 's-1' }),
    ];
    expect(planMemoryMutations([addOp('Is learning Rust')], existing, { chatId: null, sessionId: 's-1' })).toEqual([]);
    expect(planMemoryMutations([addOp('Is learning Rust')], existing, { chatId: null, sessionId: 's-2' })).toEqual([
      { kind: 'confirm', id: 'e1' },
    ]);
  });

  it('confirms from another conversation once the source chat is gone', () => {
    const existing = [entry({ id: 'e1', text: 'Is learning Rust', status: 'candidate', sourceChatId: null })];
    expect(planMemoryMutations([op({ op: 'confirm', id: 'e1' })], existing, inChat('chat-a'))).toEqual([
      { kind: 'confirm', id: 'e1' },
    ]);
  });

  it('does not duplicate an already confirmed fact', () => {
    const existing = [entry({ id: 'e1', text: 'Is learning Rust' })];
    expect(planMemoryMutations([addOp('Is learning Rust')], existing, inChat('chat-b'))).toEqual([]);
  });

  it('does not insert the same fact twice in one turn', () => {
    expect(
      planMemoryMutations([addOp('Is learning Rust'), addOp('Is learning Rust!')], [], inChat('chat-a')),
    ).toHaveLength(1);
  });

  it('ignores operations on user-locked, archived or unknown entries', () => {
    const existing = [
      entry({ id: 'locked', text: 'Lives in Lyon', userLocked: true }),
      entry({ id: 'old', text: 'Uses Graphiti', status: 'archived' }),
    ];
    const ops = [
      op({ op: 'update', id: 'locked', text: 'Lives in Paris' }),
      op({ op: 'archive', id: 'old' }),
      op({ op: 'archive', id: 'missing' }),
    ];
    expect(planMemoryMutations(ops, existing, inChat('chat-b'))).toEqual([]);
  });

  it('updates and archives regular entries, once per entry', () => {
    const existing = [entry({ id: 'e1', text: 'Works on Zetora' }), entry({ id: 'e2', text: 'Uses MinIO' })];
    const ops = [
      op({ op: 'update', id: 'e1', text: 'Works on Zetora and Hermes', tier: 'always' }),
      op({ op: 'archive', id: 'e1' }),
      op({ op: 'archive', id: 'e2' }),
    ];
    expect(planMemoryMutations(ops, existing, inChat('chat-b'))).toEqual([
      { kind: 'update', id: 'e1', values: { text: 'Works on Zetora and Hermes', tier: 'always' } },
      { kind: 'archive', id: 'e2' },
    ]);
  });
});

describe('planConsolidation', () => {
  const base = (id: string, text: string, userLocked = false): ConsolidatableEntry => ({
    id,
    text,
    category: 'work',
    tier: 'contextual',
    keywords: ['k'],
    userLocked,
  });

  it('keeps returned entries, deletes merged ones and never touches locked ones', () => {
    const entries = [base('a', 'Nurse'), base('b', 'Works as a nurse'), base('c', 'Lives in Lyon', true)];
    const plan = planConsolidation(
      {
        entries: [
          { id: 'a', text: 'Works as a nurse', tier: 'always', keywords: ['hospital'] },
          { id: 'c', text: 'Lives in Paris', tier: 'always', keywords: [] },
        ],
        bio: 'A nurse living in Lyon.',
      },
      entries,
    );
    expect(plan.updates).toEqual([{ id: 'a', text: 'Works as a nurse', tier: 'always', keywords: ['hospital'] }]);
    expect(plan.deleteIds).toEqual(['b']);
    expect(plan.bio).toBe('A nurse living in Lyon.');
  });

  it('deletes nothing when the result would drop most of the memory', () => {
    const entries = ['a', 'b', 'c', 'd', 'e'].map((id) => base(id, `Fact ${id}`));
    const plan = planConsolidation(
      { entries: [{ id: 'a', text: 'Fact a', tier: 'contextual', keywords: [] }], bio: '' },
      entries,
    );
    expect(plan.deleteIds).toEqual([]);
    expect(plan.updates[0].keywords).toEqual(['k']);
    expect(plan.bio).toBeNull();
  });
});

describe('prompt building', () => {
  it('builds nothing for an empty memory', () => {
    expect(buildMemorySystemBlock(null, [])).toBe('');
    expect(buildMemorySystemBlock({ userText: ' ', autoText: '' }, [])).toBe('');
    expect(buildContextualMemoryBlock([])).toBe('');
  });

  it('includes both bio zones and the always entries', () => {
    const block = buildMemorySystemBlock({ userText: 'I am a nurse.', autoText: 'Self-hosts a homelab.' }, [
      { id: '1', text: 'Prefers short answers', category: 'preference' },
    ]);
    expect(block).toContain('Written by the user:\nI am a nurse.');
    expect(block).toContain('Learned from past conversations:\nSelf-hosts a homelab.');
    expect(block).toContain('- Prefers short answers');
  });

  it('caps entries by count and characters, in the given order', () => {
    const entries = [{ text: 'aaaa' }, { text: 'bbbb' }, { text: 'cccc' }];
    expect(capEntries(entries, 2, 100)).toEqual([{ text: 'aaaa' }, { text: 'bbbb' }]);
    expect(capEntries(entries, 10, 9)).toEqual([{ text: 'aaaa' }, { text: 'bbbb' }]);
  });

  it('matches memory against the last two user messages', () => {
    const messages = [
      { role: 'user', parts: [{ type: 'text', text: 'first' }] },
      { role: 'assistant', parts: [{ type: 'text', text: 'answer' }] },
      { role: 'user', parts: [{ type: 'text', text: 'second' }] },
      {
        role: 'user',
        parts: [
          { type: 'file', url: 'x' },
          { type: 'text', text: 'third' },
        ],
      },
    ];
    expect(buildMemoryQueryText(messages)).toBe('second\nthird');
  });

  it('formats a turn, cutting the answer before the question', () => {
    expect(formatTurnForMemory('  hi ', ' hello ')).toBe('user: hi\nassistant: hello');
    expect(formatTurnForMemory('', 'hello')).toBe('');
    const turn = formatTurnForMemory('q'.repeat(100), 'a'.repeat(10000));
    expect(turn.length).toBeLessThanOrEqual(8000 + 'user: \nassistant: '.length);
    expect(turn).toContain('q'.repeat(100));
  });
});
