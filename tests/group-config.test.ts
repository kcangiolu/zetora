import { describe, it, expect } from 'vitest';

import { getGroupConfig, getBaseConfig } from '@/lib/search/group-config';

describe('getGroupConfig', () => {
  // Snapshots guard the split of group-config.ts into per-group files:
  // identical output before/after proves iso-functionality.
  it.each(['canvas'] as const)('returns stable tools+instructions for %s', async (group) => {
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
    const [canvas, mcp] = await Promise.all([getGroupConfig('canvas'), getGroupConfig('mcp')]);
    for (const config of [canvas, mcp]) {
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
