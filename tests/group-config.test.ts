import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';

vi.mock('@/lib/user-data-server', () => ({ getComprehensiveUserData: vi.fn().mockResolvedValue(null) }));

// The per-group instruction template strings interpolate `new Date()` at
// module load, so freeze the clock BEFORE importing and import dynamically.
let getGroupConfig: typeof import('@/lib/search/group-config').getGroupConfig;

beforeAll(async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-07-05T12:00:00Z'));
  ({ getGroupConfig } = await import('@/lib/search/group-config'));
});

afterAll(() => vi.useRealTimers());

const proUser = { userId: 'u1', email: 'u@example.com', isProUser: true };
const freeUser = { userId: 'u2', email: 'f@example.com', isProUser: false };

describe('getGroupConfig', () => {
  // Snapshots guard the split of group-config.ts into per-group files:
  // identical output before/after proves iso-functionality.
  it.each(['web', 'chat', 'extreme', 'canvas', 'memory', 'x', 'reddit', 'multi-agent'] as const)(
    'returns stable tools+instructions for %s (pro user)',
    async (group) => {
      const config = await getGroupConfig(group, proUser);
      expect(config.tools).toMatchSnapshot(`${group}-tools`);
      expect(config.instructions).toMatchSnapshot(`${group}-instructions`);
    },
  );

  it('downgrades pro-gated groups to web for free users', async () => {
    const [canvas, mcp, connectors, multiAgent, web] = await Promise.all([
      getGroupConfig('canvas', freeUser),
      getGroupConfig('mcp', freeUser),
      getGroupConfig('connectors', freeUser),
      getGroupConfig('multi-agent', freeUser),
      getGroupConfig('web', freeUser),
    ]);
    for (const config of [canvas, mcp, connectors, multiAgent]) {
      expect(config.tools).toEqual(web.tools);
      expect(config.instructions).toBe(web.instructions);
    }
  });

  it('memory stays available to signed-in free users', async () => {
    const memory = await getGroupConfig('memory', freeUser);
    const web = await getGroupConfig('web', freeUser);
    expect(memory.instructions).not.toBe(web.instructions);
  });

  it('anonymous callers fall back to web for gated groups', async () => {
    const config = await getGroupConfig('canvas', null);
    const web = await getGroupConfig('web', proUser);
    expect(config.instructions).toBe(web.instructions);
  });
});
