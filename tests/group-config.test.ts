import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';

vi.mock('@/lib/user-data-server', () => ({ getComprehensiveUserData: vi.fn().mockResolvedValue(null) }));

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

const proUser = { userId: 'u1', email: 'u@example.com', isProUser: true };
const freeUser = { userId: 'u2', email: 'f@example.com', isProUser: false };

describe('getGroupConfig', () => {
  // Snapshots guard the split of group-config.ts into per-group files:
  // identical output before/after proves iso-functionality.
  it.each(['canvas', 'memory', 'multi-agent'] as const)(
    'returns stable tools+instructions for %s (pro user)',
    async (group) => {
      const config = await getGroupConfig(group, proUser);
      expect(config.tools).toMatchSnapshot(`${group}-tools`);
      expect(config.instructions).toMatchSnapshot(`${group}-instructions`);
    },
  );

  it('undefined group resolves to the base Sources+Skills config', async () => {
    const config = await getGroupConfig(undefined, proUser);
    const base = getBaseConfig();
    expect(config.tools).toEqual(base.tools);
    expect(config.instructions).toBe(base.instructions);
  });

  it('downgrades pro-gated special modes to the base config for free users', async () => {
    const base = getBaseConfig();
    const [canvas, mcp, connectors, multiAgent] = await Promise.all([
      getGroupConfig('canvas', freeUser),
      getGroupConfig('mcp', freeUser),
      getGroupConfig('connectors', freeUser),
      getGroupConfig('multi-agent', freeUser),
    ]);
    for (const config of [canvas, mcp, connectors, multiAgent]) {
      expect(config.tools).toEqual(base.tools);
      expect(config.instructions).toBe(base.instructions);
    }
  });

  it('memory stays available to signed-in free users (auth-only, not pro-gated)', async () => {
    const memory = await getGroupConfig('memory', freeUser);
    const base = getBaseConfig();
    expect(memory.instructions).not.toBe(base.instructions);
  });

  it('anonymous callers fall back to the base config for gated special modes', async () => {
    const config = await getGroupConfig('canvas', null);
    const base = getBaseConfig();
    expect(config.instructions).toBe(base.instructions);
  });
});
