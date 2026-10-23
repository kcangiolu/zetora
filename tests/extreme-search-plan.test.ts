import { describe, it, expect, vi } from 'vitest';

vi.mock('@/env/server', () => ({ serverEnv: {} }));

import { normalizeResearchPlan } from '@/lib/tools/extreme-search/prompts';

const topic = (title: string, todos = ['a', 'b', 'c']) => ({ title, todos });

describe('normalizeResearchPlan', () => {
  it('keeps at most 5 topics of at most 5 todos', () => {
    const plan = normalizeResearchPlan(
      Array.from({ length: 8 }, (_, index) => topic(`Topic ${index}`, ['1', '2', '3', '4', '5', '6', '7'])),
    );
    expect(plan).toHaveLength(5);
    expect(plan.every((entry) => entry.todos.length === 5)).toBe(true);
  });

  it('shortens a title past 70 characters and drops topics with nothing to research', () => {
    const plan = normalizeResearchPlan([topic('x'.repeat(90)), topic('Empty', ['  ']), topic('  Short  ')]);
    expect(plan.map((entry) => entry.title)).toEqual([`${'x'.repeat(69)}…`, 'Short']);
  });

  it('fails visibly on an empty plan', () => {
    expect(() => normalizeResearchPlan([topic('Empty', [])])).toThrow('empty plan');
  });
});
