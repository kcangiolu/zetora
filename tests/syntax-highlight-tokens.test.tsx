import { renderToStaticMarkup } from 'react-dom/server';
import { Prism } from 'react-syntax-highlighter';
import { describe, it, expect } from 'vitest';

import { tailwindTokenNames } from '@/lib/syntax-highlight-tokens';

function renderedClassNames(code: string, language: string): Set<string> {
  const html = renderToStaticMarkup(
    <Prism language={language} style={tailwindTokenNames}>
      {code}
    </Prism>,
  );
  return new Set([...html.matchAll(/class="([^"]*)"/g)].flatMap((match) => match[1].split(' ')));
}

describe('tailwindTokenNames', () => {
  it('keeps the table class off a highlighted Markdown table', () => {
    const classNames = renderedClassNames('| A | B |\n|:---|:---|\n| **x** | y |', 'markdown');
    expect(classNames.has('table-data')).toBe(true);
    expect(classNames.has('table')).toBe(false);
  });
});
