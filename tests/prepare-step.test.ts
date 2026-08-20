import { describe, it, expect } from 'vitest';
import { resolvePrepareStepOverride, SYNTHESIS_NUDGE } from '@/lib/search/prepare-step';

const base = {
  group: 'web',
  shouldUseXaiMultiAgent: false,
  isXmlParsedCustomModel: false,
  model: 'zetora-default',
  latestStepHasToolRoundTrip: false,
  latestStepToolNames: [] as string[],
  streamActiveTools: ['web_search', 'retrieve', 'datetime'],
  baseSystem: 'You are a search engine.',
};

describe('resolvePrepareStepOverride', () => {
  it('returns undefined for MCP group (tools stay available)', () => {
    expect(
      resolvePrepareStepOverride({ ...base, group: 'mcp', latestStepHasToolRoundTrip: true }),
    ).toBeUndefined();
  });

  it('pins the xAI tools in multi-agent mode', () => {
    const override = resolvePrepareStepOverride({ ...base, shouldUseXaiMultiAgent: true });
    expect(override).toEqual({
      toolChoice: 'auto',
      activeTools: ['xai_web_search', 'xai_x_search'],
    });
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

  it('keeps tools active for zetora-sarvam-105b even after a tool round', () => {
    const override = resolvePrepareStepOverride({
      ...base,
      model: 'zetora-sarvam-105b',
      latestStepHasToolRoundTrip: true,
    });
    expect(override).toEqual({
      toolChoice: 'auto',
      activeTools: base.streamActiveTools,
    });
  });

  describe('auto mode (keeps tools armed across research steps)', () => {
    const autoBase = { ...base, group: 'auto' };

    it('keeps tools armed with no nudge after a non-image tool round', () => {
      const override = resolvePrepareStepOverride({
        ...autoBase,
        latestStepHasToolRoundTrip: true,
        latestStepToolNames: ['web_search'],
      });
      expect(override).toEqual({
        toolChoice: 'auto',
        activeTools: base.streamActiveTools,
      });
    });

    it('forces synthesis after an image-generation tool round (no spurious follow-up turn)', () => {
      const override = resolvePrepareStepOverride({
        ...autoBase,
        latestStepHasToolRoundTrip: true,
        latestStepToolNames: ['generate_image'],
      });
      expect(override).toEqual({
        toolChoice: 'auto',
        activeTools: [],
      });
    });

    it('forces synthesis after an edit_image tool round', () => {
      const override = resolvePrepareStepOverride({
        ...autoBase,
        latestStepHasToolRoundTrip: true,
        latestStepToolNames: ['edit_image'],
      });
      expect(override).toEqual({
        toolChoice: 'auto',
        activeTools: [],
      });
    });
  });

  describe('XML-parsed custom models', () => {
    const xmlBase = { ...base, model: 'custom-llamacpp:qwen3.6', isXmlParsedCustomModel: true };

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
