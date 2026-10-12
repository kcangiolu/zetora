import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';

// The per-group instruction template strings interpolate `new Date()` at
// module load, so freeze the clock BEFORE importing and import dynamically.
let getGroupConfig: typeof import('@/lib/search/group-config').getGroupConfig;
let getBaseConfig: typeof import('@/lib/search/group-config').getBaseConfig;

beforeAll(async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-07-05T12:00:00Z'));
  ({ getGroupConfig, getBaseConfig } = await import('@/lib/search/group-config'));
});

afterAll(() => vi.useRealTimers());

describe('getGroupConfig', () => {
  // Snapshots guard the split of group-config.ts into per-group files:
  // identical output before/after proves iso-functionality.
  it.each(['canvas', 'multi-agent'] as const)('returns stable tools+instructions for %s', async (group) => {
    const config = await getGroupConfig(group);
    expect(config.tools).toMatchSnapshot(`${group}-tools`);
    expect(config.instructions).toMatchSnapshot(`${group}-instructions`);
  });

  it('undefined group resolves to the base Sources+Skills config', async () => {
    const config = await getGroupConfig(undefined);
    const base = getBaseConfig();
    expect(config.tools).toEqual(base.tools);
    expect(config.instructions).toBe(base.instructions);
  });

  it('every connected-account-only mode is available — no tier gate left', async () => {
    const base = getBaseConfig();
    const [canvas, mcp, multiAgent] = await Promise.all([
      getGroupConfig('canvas'),
      getGroupConfig('mcp'),
      getGroupConfig('multi-agent'),
    ]);
    for (const config of [canvas, mcp, multiAgent]) {
      expect(config.instructions).not.toBe(base.instructions);
    }
  });

  it('unknown special mode ids fall back to the base config', async () => {
    const config = await getGroupConfig('not-a-real-mode');
    const base = getBaseConfig();
    expect(config.tools).toEqual(base.tools);
    expect(config.instructions).toBe(base.instructions);
  });
});
