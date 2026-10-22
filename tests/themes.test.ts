import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';
import { isDarkTheme } from '@/lib/themes';

const css = readFileSync('app/globals.css', 'utf8');
const darkVariant = css.match(/@custom-variant dark \(&:is\(:is\(([^)]*)\) \*\)\);/);
const darkClasses = darkVariant?.[1].split(',').map((selector) => selector.trim().replace(/^\./, '')) ?? [];

describe('isDarkTheme', () => {
  it('matches the classes of the dark Tailwind variant', () => {
    expect(darkClasses.length).toBeGreaterThan(1);
    for (const theme of darkClasses) expect(isDarkTheme(theme)).toBe(true);
  });

  it('leaves light themes and an unresolved theme light', () => {
    for (const theme of ['light', 'inklight', 'neutrallight', 'system', undefined]) {
      expect(isDarkTheme(theme)).toBe(false);
    }
  });

  it('covers every theme block in globals.css that has a dark background', () => {
    const blocks = [...css.matchAll(/^\.([a-z]+) \{\n[\s\S]*?--background: oklch\(([\d.]+)/gm)];
    expect(blocks.length).toBeGreaterThanOrEqual(10);
    for (const [, theme, lightness] of blocks) {
      expect(isDarkTheme(theme), theme).toBe(Number(lightness) < 0.5);
    }
  });
});
