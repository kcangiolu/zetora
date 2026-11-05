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

  it('leaves a source title cited before closing punctuation as a bare chip', () => {
    const allCaps = `converts it to acetate [THE SCIENCE OF ALCOHOL INTOLERANCE: TOXINS AND MECHANISMS](${URL}). If`;
    const question = `the threshold is lowered [Migraine and Alcohol-Is It Really That Harmful?](${URL}) :`;
    const longTitle = `Webb stays cold [How Webb Stays Cold Far From Home](${URL}), which`;
    expect(keepInlineLinkText(allCaps)).toBe(allCaps);
    expect(keepInlineLinkText(question)).toBe(question);
    expect(keepInlineLinkText(longTitle)).toBe(longTitle);
  });

  it('leaves a title in a script without case as a bare chip', () => {
    const withSeparator = `on AT-X [目覚めたら最強装備と宇宙船持ちだったので - WEBザテレビジョン](${URL}).`;
    const withoutSpaces = `on AT-X [目覚めたら最強装備と宇宙船持ちだったので、一戸建て目指して傭兵として自由に生きたい](${URL}).`;
    expect(keepInlineLinkText(withSeparator)).toBe(withSeparator);
    expect(keepInlineLinkText(withoutSpaces)).toBe(withoutSpaces);
  });

  it('keeps a short linked name in a script without case', () => {
    expect(keepInlineLinkText(`aired on [東京MX](${URL}).`)).toBe(`aired on 東京MX [東京MX](${URL}).`);
  });

  it('keeps short capitalized words before punctuation', () => {
    expect(keepInlineLinkText(`it launched from [French Guiana](${URL}).`)).toBe(
      `it launched from French Guiana [French Guiana](${URL}).`,
    );
  });

  it('leaves bare-URL links and images alone', () => {
    const bare = `see [${URL}](${URL}) for details`;
    const image = `![sunshield](${URL}) shown here`;
    expect(keepInlineLinkText(bare)).toBe(bare);
    expect(keepInlineLinkText(image)).toBe(image);
  });
});
