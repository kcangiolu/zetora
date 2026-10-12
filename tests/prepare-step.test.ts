import { describe, it, expect } from 'vitest';
import { resolvePrepareStepOverride, SYNTHESIS_NUDGE } from '@/lib/search/prepare-step';

const base = {
  group: 'web',
  isXmlParsedCustomModel: false,
  latestStepHasToolRoundTrip: false,
  streamActiveTools: ['web_search', 'retrieve', 'datetime'],
  baseSystem: 'You are a search engine.',
};

describe('resolvePrepareStepOverride', () => {
  it('returns undefined for MCP group (tools stay available)', () => {
    expect(
      resolvePrepareStepOverride({ ...base, group: 'mcp', latestStepHasToolRoundTrip: true }),
    ).toBeUndefined();
  });

  describe('budget safety net', () => {
    it('is a no-op when cumulativeTokens/budgetTokens are omitted (backward compatible)', () => {
      const override = resolvePrepareStepOverride({ ...base, group: 'auto' });
      expect(override).toEqual({ toolChoice: 'auto', activeTools: base.streamActiveTools });
    });

    it('is a no-op below SOFT_STEP_BUDGET_FRACTION of the budget', () => {
      const override = resolvePrepareStepOverride({
        ...base,
        group: 'auto',
        cumulativeTokens: 79_000,
        budgetTokens: 100_000,
      });
      expect(override).toEqual({ toolChoice: 'auto', activeTools: base.streamActiveTools });
    });

    it('forces drain + synthesis nudge in auto mode once the budget fraction is crossed', () => {
      const override = resolvePrepareStepOverride({
        ...base,
        group: 'auto',
        cumulativeTokens: 80_000,
        budgetTokens: 100_000,
      });
      expect(override).toEqual({
        toolChoice: 'auto',
        activeTools: [],
        system: base.baseSystem + SYNTHESIS_NUDGE,
      });
    });

    it('overrides MCP mode too (otherwise-unbounded 50-step loop)', () => {
      const override = resolvePrepareStepOverride({
        ...base,
        group: 'mcp',
        cumulativeTokens: 90_000,
        budgetTokens: 100_000,
      });
      expect(override).toEqual({
        toolChoice: 'auto',
        activeTools: [],
        system: base.baseSystem + SYNTHESIS_NUDGE,
      });
    });

    it('overrides MCP mode too', () => {
      const override = resolvePrepareStepOverride({
        ...base,
        group: 'mcp',
        cumulativeTokens: 90_000,
        budgetTokens: 100_000,
      });
      expect(override).toEqual({
        toolChoice: 'auto',
        activeTools: [],
        system: base.baseSystem + SYNTHESIS_NUDGE,
      });
    });

    it('keeps schemas armed (with the nudge) for XML-parsed custom models, same raw-XML leak guard as the post-round-trip case', () => {
      const override = resolvePrepareStepOverride({
        ...base,
        group: 'auto',
        isXmlParsedCustomModel: true,
        cumulativeTokens: 90_000,
        budgetTokens: 100_000,
      });
      expect(override?.activeTools).toEqual(base.streamActiveTools);
      expect(override?.system).toBe(base.baseSystem + SYNTHESIS_NUDGE);
    });

    it('ignores budgetTokens of 0 (context window/budget not resolved yet)', () => {
      const override = resolvePrepareStepOverride({
        ...base,
        group: 'auto',
        cumulativeTokens: 90_000,
        budgetTokens: 0,
      });
      expect(override).toEqual({ toolChoice: 'auto', activeTools: base.streamActiveTools });
    });
  });

  it('leaves MCP mode on its own tool loop', () => {
    expect(resolvePrepareStepOverride({ ...base, group: 'mcp' })).toBeUndefined();
  });

  it('keeps all tools active before the first completed tool round', () => {
    const override = resolvePrepareStepOverride(base);
    expect(override).toEqual({
      toolChoice: 'auto',
      activeTools: base.streamActiveTools,
    });
  });

  it('disables tools after a tool round for standard models', () => {
    const override = resolvePrepareStepOverride({ ...base, latestStepHasToolRoundTrip: true });
    expect(override).toEqual({
      toolChoice: 'auto',
      activeTools: [],
    });
    expect(override?.system).toBeUndefined();
  });

  describe('XML-parsed custom models', () => {
    const xmlBase = { ...base, isXmlParsedCustomModel: true };

    it('keeps schemas armed AND appends the synthesis nudge after a tool round', () => {
      const override = resolvePrepareStepOverride({ ...xmlBase, latestStepHasToolRoundTrip: true });
      expect(override?.activeTools).toEqual(base.streamActiveTools);
      expect(override?.toolChoice).toBe('auto');
      expect(override?.system).toBe(base.baseSystem + SYNTHESIS_NUDGE);
    });

    it('never empties activeTools (raw-XML leak guard)', () => {
      const override = resolvePrepareStepOverride({ ...xmlBase, latestStepHasToolRoundTrip: true });
      expect(override?.activeTools?.length).toBeGreaterThan(0);
    });

    it('does not nudge before the first tool round', () => {
      const override = resolvePrepareStepOverride(xmlBase);
      expect(override).toEqual({
        toolChoice: 'auto',
        activeTools: base.streamActiveTools,
      });
      expect(override?.system).toBeUndefined();
    });

    it('preserves the base system (custom instructions survive the nudge)', () => {
      const baseSystem = 'Instructions.\n\nThe user custom instructions: always answer in French.';
      const override = resolvePrepareStepOverride({
        ...xmlBase,
        latestStepHasToolRoundTrip: true,
        baseSystem,
      });
      expect(override?.system).toContain('always answer in French');
      expect(override?.system?.endsWith(SYNTHESIS_NUDGE)).toBe(true);
    });
  });
});
