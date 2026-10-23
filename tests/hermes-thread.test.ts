import { describe, it, expect } from 'vitest';
import { buildHermesTurns, formatStepDuration, summarizeHermesSteps } from '@/lib/hermes/thread';
import { upsertHermesToolStep, type HermesToolStepView } from '@/lib/hermes/tool-steps';
import type { ChatMessage } from '@/lib/types';

const message = (id: string, role: 'user' | 'assistant', createdAt?: string): ChatMessage =>
  ({
    id,
    role,
    parts: [{ type: 'text', text: id }],
    ...(createdAt ? { metadata: { createdAt } } : {}),
  }) as ChatMessage;

const step = (
  toolCallId: string,
  startedAt: string,
  overrides: Partial<HermesToolStepView> = {},
): HermesToolStepView => ({
  toolCallId,
  toolName: 'terminal',
  preview: null,
  status: 'ok',
  durationMs: 1000,
  startedAt,
  triggerMessageId: null,
  ...overrides,
});

const shape = (turns: ReturnType<typeof buildHermesTurns>) =>
  turns.map((turn) => ({
    user: turn.userMessage?.id ?? null,
    entries: turn.entries.map((entry) =>
      entry.kind === 'step'
        ? entry.step.toolCallId
        : entry.kind === 'note'
          ? `note:${entry.message.id}`
          : entry.message.id,
    ),
  }));

describe('buildHermesTurns', () => {
  it('opens a turn on each user message and interleaves steps with replies by time', () => {
    const turns = buildHermesTurns(
      [
        message('u1', 'user', '2026-10-20T10:00:00Z'),
        message('a1', 'assistant', '2026-10-20T10:00:05Z'),
        message('a2', 'assistant', '2026-10-20T10:00:30Z'),
        message('u2', 'user', '2026-10-20T10:01:00Z'),
        message('a3', 'assistant', '2026-10-20T10:01:20Z'),
      ],
      [
        step('s2', '2026-10-20T10:00:10Z'),
        step('s1', '2026-10-20T10:00:01Z'),
        step('s3', '2026-10-20T10:01:02Z'),
        step('s4', '2026-10-20T10:01:25Z'),
      ],
    );
    expect(shape(turns)).toEqual([
      { user: 'u1', entries: ['s1', 'note:a1', 's2', 'a2'] },
      { user: 'u2', entries: ['s3', 'note:a3', 's4'] },
    ]);
  });

  it('makes notes of text messages followed by a step, but keeps replies and media sent mid-task', () => {
    const voice = {
      ...message('a2', 'assistant', '2026-10-20T10:00:20Z'),
      parts: [{ type: 'data-hermes_media', data: { mediaKind: 'voice', url: 'https://example.com/a.m4a' } }],
    } as ChatMessage;
    const turns = buildHermesTurns(
      [
        message('u1', 'user', '2026-10-20T10:00:00Z'),
        message('a1', 'assistant', '2026-10-20T10:00:05Z'),
        voice,
        message('a3', 'assistant', '2026-10-20T10:00:40Z'),
      ],
      [step('s1', '2026-10-20T10:00:10Z'), step('s2', '2026-10-20T10:00:30Z')],
    );
    expect(shape(turns)).toEqual([{ user: 'u1', entries: ['note:a1', 's1', 'a2', 's2', 'a3'] }]);
  });

  it('places a step in the turn its trigger names, whatever its time', () => {
    const turns = buildHermesTurns(
      [message('u1', 'user', '2026-10-20T10:00:00Z'), message('u2', 'user', '2026-10-20T10:01:00Z')],
      [step('s1', '2026-10-20T10:02:00Z', { triggerMessageId: 'u1' })],
    );
    expect(shape(turns)).toEqual([
      { user: 'u1', entries: ['s1'] },
      { user: 'u2', entries: [] },
    ]);
  });

  it('treats a message not yet confirmed by the server as the newest', () => {
    const turns = buildHermesTurns(
      [message('u1', 'user', '2026-10-20T10:00:00Z'), message('u2', 'user')],
      [step('s1', '2026-10-20T10:05:00Z')],
    );
    expect(shape(turns)).toEqual([
      { user: 'u1', entries: ['s1'] },
      { user: 'u2', entries: [] },
    ]);
  });

  it('keeps agent messages that came before any user message in their own turn', () => {
    const turns = buildHermesTurns(
      [message('a0', 'assistant', '2026-10-20T09:00:00Z'), message('u1', 'user', '2026-10-20T10:00:00Z')],
      [],
    );
    expect(shape(turns)).toEqual([
      { user: null, entries: ['a0'] },
      { user: 'u1', entries: [] },
    ]);
  });
});

describe('summarizeHermesSteps', () => {
  it('spans from the first start to the last end', () => {
    expect(
      summarizeHermesSteps([
        step('s1', '2026-10-20T10:00:00Z', { durationMs: 2000 }),
        step('s2', '2026-10-20T10:00:30Z', { durationMs: 11000, status: 'error' }),
      ]),
    ).toEqual({ count: 2, failed: 1, running: false, durationMs: 41000 });
  });

  it('has no duration while a step is running', () => {
    expect(summarizeHermesSteps([step('s1', '2026-10-20T10:00:00Z', { status: 'running', durationMs: null })])).toEqual(
      { count: 1, failed: 0, running: true, durationMs: null },
    );
  });
});

describe('upsertHermesToolStep', () => {
  it('replaces the earlier state of a step and keeps the list in start order', () => {
    const running = step('s2', '2026-10-20T10:00:10Z', { status: 'running', durationMs: null });
    const first = step('s1', '2026-10-20T10:00:00Z');
    const steps = upsertHermesToolStep(upsertHermesToolStep([], running), first);
    expect(steps.map((s) => s.toolCallId)).toEqual(['s1', 's2']);
    const finished = upsertHermesToolStep(steps, { ...running, status: 'ok', durationMs: 900 });
    expect(finished).toHaveLength(2);
    expect(finished[1]).toMatchObject({ status: 'ok', durationMs: 900 });
  });
});

describe('formatStepDuration', () => {
  it('keeps a decimal under ten seconds only', () => {
    expect(formatStepDuration(412)).toBe('0.4 s');
    expect(formatStepDuration(9_950)).toBe('9.9 s');
    expect(formatStepDuration(12_400)).toBe('12 s');
  });

  it('switches to minutes past a minute', () => {
    expect(formatStepDuration(65_000)).toBe('1 min 5 s');
    expect(formatStepDuration(120_000)).toBe('2 min');
  });
});
