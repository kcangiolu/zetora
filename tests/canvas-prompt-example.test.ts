import { describe, it, expect } from 'vitest';
import { applySpecPatch, parseSpecStreamLine, type Spec } from '@json-render/core';

import { canvasCatalog } from '@/lib/canvas/catalog';
import { instructions } from '@/lib/search/groups/canvas';

// The model copies the example's shape, so it must build a complete spec.
describe('Canvas instructions example', () => {
  const block = instructions.match(/## SPEC EXAMPLE[\s\S]*?```spec\n([\s\S]*?)```/)?.[1] ?? '';
  const spec: Spec = { root: '', elements: {} };
  for (const line of block.split('\n')) {
    const patch = parseSpecStreamLine(line);
    if (patch) applySpecPatch(spec, patch);
  }

  it('builds a spec whose every child exists', () => {
    expect(block).not.toBe('');
    expect(spec.elements[spec.root]).toBeDefined();
    for (const element of Object.values(spec.elements)) {
      for (const child of element.children ?? []) expect(spec.elements[child]).toBeDefined();
    }
    expect(spec.state?.trend).toHaveLength(3);
  });

  it('uses only catalog components and props', () => {
    const result = canvasCatalog.validate(spec);
    // The spec schema requires `visible` on every element, though the renderer and
    // the catalog's own prompt example leave it out.
    expect((result.error?.issues ?? []).filter((issue) => issue.path.at(-1) !== 'visible')).toEqual([]);
  });
});
