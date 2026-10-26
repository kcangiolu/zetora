import { describe, it, expect } from 'vitest';

import { renderLatexFormula, type LatexDelimiter } from '@/lib/markdown-latex';

const inline: LatexDelimiter[] = [
  { left: '$', right: '$', display: false },
  { left: '\\(', right: '\\)', display: false },
];
const block: LatexDelimiter[] = [
  { left: '$$', right: '$$', display: true },
  { left: '\\[', right: '\\]', display: true },
];

describe('renderLatexFormula', () => {
  it('renders an inline formula without its delimiters', () => {
    const html = renderLatexFormula('$E=mc^2$', inline);
    expect(html).toContain('class="katex"');
    expect(html).not.toContain('katex-display');
    expect(html).toContain('<annotation encoding="application/x-tex">E=mc^2</annotation>');
    expect(renderLatexFormula('\\(x\\)', inline)).toContain('<annotation encoding="application/x-tex">x</annotation>');
  });

  it('renders a block formula in display mode', () => {
    expect(renderLatexFormula('$$\\frac{a}{b}$$', block)).toContain('katex-display');
    expect(renderLatexFormula('\\[a+b\\]', block)).toContain('katex-display');
  });

  it('throws on a formula KaTeX cannot parse rather than returning it as HTML', () => {
    expect(() => renderLatexFormula('$\\frac{<img src=x onerror=alert(1)>$', inline)).toThrow();
  });

  it('throws on a formula that is not wrapped in the expected delimiters', () => {
    expect(() => renderLatexFormula('E=mc^2', inline)).toThrow(/delimiters/);
    expect(() => renderLatexFormula('$', inline)).toThrow(/delimiters/);
  });
});
