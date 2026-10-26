import katex from 'katex';

export interface LatexDelimiter {
  left: string;
  right: string;
  display: boolean;
}

// The markdown pipeline extracts each formula with its delimiters, so the
// whole string is one expression. Throws on a formula KaTeX cannot parse:
// the caller shows it as escaped text instead of injecting it as HTML.
export function renderLatexFormula(formula: string, delimiters: readonly LatexDelimiter[]): string {
  const delimiter = delimiters.find(
    ({ left, right }) =>
      formula.length >= left.length + right.length && formula.startsWith(left) && formula.endsWith(right),
  );
  if (!delimiter) {
    throw new Error(`LaTeX formula is not wrapped in any of the expected delimiters: ${formula}`);
  }
  const expression = formula.slice(delimiter.left.length, formula.length - delimiter.right.length);
  return katex.renderToString(expression, { displayMode: delimiter.display, throwOnError: true });
}
