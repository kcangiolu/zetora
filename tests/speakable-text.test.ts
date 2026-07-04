import { describe, it, expect } from 'vitest';
import { extractSpeakableText } from '@/lib/speakable-text';

describe('extractSpeakableText', () => {
  it('strips fenced code blocks', () => {
    const out = extractSpeakableText('Before\n```js\nconst x = 1;\n```\nAfter');
    expect(out).not.toContain('const x');
    expect(out).toContain('Before');
    expect(out).toContain('After');
  });

  it('removes markdown tables', () => {
    const md = '| a | b |\n| --- | --- |\n| 1 | 2 |';
    expect(extractSpeakableText(md)).toBe('');
  });

  it('keeps link text label removed but sentence coherent', () => {
    const out = extractSpeakableText('See [the docs](https://example.com) now');
    expect(out).not.toContain('example.com');
    expect(out).not.toContain('the docs');
    expect(out).toContain('See');
    expect(out).toContain('now');
  });

  it('unwraps bold and italic', () => {
    expect(extractSpeakableText('**bold** and *italic*')).toBe('bold and italic');
  });

  it('converts headings into sentences', () => {
    expect(extractSpeakableText('# Title')).toBe('Title.');
  });

  it('drops orphan reference markers', () => {
    const out = extractSpeakableText('A fact [1] and another [^2].');
    expect(out).not.toMatch(/\[\^?\d+\]/);
  });

  it('expands special characters into spoken French', () => {
    const out = extractSpeakableText('5 € and 10 %');
    expect(out).toContain('euros');
    expect(out).toContain('pourcent');
  });

  it('removes raw URLs', () => {
    const out = extractSpeakableText('Visit https://example.com/path today');
    expect(out).not.toContain('http');
  });

  it('strips residual HTML tags', () => {
    expect(extractSpeakableText('Hello <b>world</b>')).toBe('Hello world');
  });

  it('collapses list items into sentences', () => {
    const out = extractSpeakableText('- one\n- two');
    expect(out).toBe('one. two');
  });

  it('returns an empty string for empty input', () => {
    expect(extractSpeakableText('')).toBe('');
  });
});
