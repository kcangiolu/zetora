import { describe, it, expect } from 'vitest';

import { sanitizeInlineHtml } from '@/lib/canvas/registry';

describe('sanitizeInlineHtml', () => {
  it('keeps a markdown link inside its href attribute', () => {
    const html = sanitizeInlineHtml('[x](https://a"onmouseover="alert(1))');
    expect(html).not.toMatch(/"\s*onmouseover=/);
    expect(html).toContain('href="https://a&quot;onmouseover=&quot;alert(1"');
  });

  it('escapes raw HTML and restores the allowed inline tags only', () => {
    expect(sanitizeInlineHtml('<img src=x onerror=alert(1)> <strong>ok</strong>')).toBe(
      '&lt;img src=x onerror=alert(1)&gt; <strong>ok</strong>',
    );
  });

  it('renders a normal link as an anchor', () => {
    const html = sanitizeInlineHtml('see [docs](https://example.com/page)');
    expect(html).toContain('<a href="https://example.com/page"');
    expect(html).toContain('>docs</a>');
  });
});
