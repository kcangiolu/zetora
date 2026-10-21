import { describe, it, expect } from 'vitest';

import { keepInlineLinkText } from '@/lib/markdown-inline-links';

const URL = 'https://science.nasa.gov/webb';

describe('keepInlineLinkText', () => {
  it('keeps the words of a link that continues its sentence', () => {
    expect(keepInlineLinkText(`The [sunshield](${URL}) protects the telescope`)).toBe(
      `The sunshield [sunshield](${URL}) protects the telescope`,
    );
  });

  it('keeps the words of a link followed by punctuation or a number', () => {
    expect(keepInlineLinkText(`reduced by [about 299 °C](${URL}).`)).toBe(
      `reduced by about 299 °C [about 299 °C](${URL}).`,
    );
    expect(keepInlineLinkText(`uses a [cryocooler](${URL}), which`)).toBe(
      `uses a cryocooler [cryocooler](${URL}), which`,
    );
    expect(keepInlineLinkText(`launched in [December](${URL}) 2021`)).toBe(
      `launched in December [December](${URL}) 2021`,
    );
  });

  it('leaves trailing citations as bare chips', () => {
    const atLineEnd = `Webb stays cold [How Webb stays cold](${URL})\nNext line`;
    const beforeNewSentence = `Webb stays cold [How Webb stays cold](${URL}) The layers do not touch`;
    const grouped = `Webb stays cold [NASA](${URL}) [Wikipedia](https://en.wikipedia.org/wiki/JWST) and more`;
    expect(keepInlineLinkText(atLineEnd)).toBe(atLineEnd);
    expect(keepInlineLinkText(beforeNewSentence)).toBe(beforeNewSentence);
    const parenthesized = `from heat the observatory emits ([NASA Science, Webb's Sunshield](${URL})).`;
    expect(keepInlineLinkText(grouped)).toBe(grouped);
    expect(keepInlineLinkText(parenthesized)).toBe(parenthesized);
  });

  it('leaves bare-URL links and images alone', () => {
    const bare = `see [${URL}](${URL}) for details`;
    const image = `![sunshield](${URL}) shown here`;
    expect(keepInlineLinkText(bare)).toBe(bare);
    expect(keepInlineLinkText(image)).toBe(image);
  });
});
