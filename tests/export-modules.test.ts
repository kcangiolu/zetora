import { describe, it, expect } from 'vitest';
import type { PDFFont } from 'pdf-lib';

import { CitationRegistry } from '@/lib/export/citations';
import { latexToText } from '@/lib/export/docx/preprocess';
import { matricesToText, numberFootnotesAndCitations } from '@/lib/export/markdown';
import { wrapText } from '@/lib/export/pdf/layout';
import { preprocessMarkdown } from '@/lib/export/pdf/preprocess';
import { splitMathInline, type PdfFonts } from '@/lib/export/pdf/segments';

const font = (name: string) => ({ name }) as unknown as PDFFont;
const fonts: PdfFonts = {
  regular: font('regular'),
  bold: font('bold'),
  italic: font('italic'),
  code: font('code'),
  greek: font('greek'),
};

describe('numberFootnotesAndCitations', () => {
  it('numbers footnotes and citations in order of use and lists the notes', () => {
    const md =
      'A[^b] and B[^a], again[^b], see [@knuth] and [@lamport] and [@knuth].\n\n[^a]: First note.\n[^b]: Second note.';
    expect(numberFootnotesAndCitations(md)).toBe(
      'A[1] and B[2], again[1], see [1] and [2] and [1].\n\n\n\n\n## Notes\n- [1] Second note.\n- [2] First note.',
    );
  });

  it('leaves text without footnotes alone', () => {
    expect(numberFootnotesAndCitations('Plain [link](https://a.test).')).toBe('Plain [link](https://a.test).');
  });
});

describe('matricesToText', () => {
  it('writes matrices as rows, keeping the source spacing', () => {
    expect(matricesToText('\\begin{bmatrix} 1 & 2 \\\\ 3 & 4 \\end{bmatrix}')).toBe('[1 , 2 ; 3 , 4]');
    expect(matricesToText('\\begin{pmatrix} a & b \\end{pmatrix}')).toBe('(a , b)');
  });
});

describe('PDF preprocessMarkdown', () => {
  it('turns $$ blocks into \\[ \\]', () => {
    expect(preprocessMarkdown('$$\n x^2 \n$$')).toBe('\\[x^2\\]');
  });
});

describe('wrapText', () => {
  const width = (s: string) => s.length;

  it('wraps on words and keeps paragraphs apart', () => {
    expect(wrapText('one two three four\n\nfive', width, 9)).toEqual(['one two', 'three', 'four', '', 'five']);
  });

  it('breaks a word longer than a line', () => {
    expect(wrapText('abcdefghij', width, 4)).toEqual(['abcd', 'efgh', 'ij']);
  });
});

describe('splitMathInline', () => {
  it('splits formulas out of text and keeps amounts as text', () => {
    const segs = splitMathInline('Costs $100 billion, so $x^2$ and \\(y\\).', fonts.regular, 12, fonts);
    expect(segs.map((s) => s.latex ?? s.text)).toEqual(['Costs ', '$100 billion', ', so ', 'x^2', ' and ', 'y', '.']);
  });

  it('draws Greek letters with the Symbol font', () => {
    const segs = splitMathInline('α = 1', fonts.regular, 12, fonts);
    expect(segs[0]).toMatchObject({ text: 'α', font: fonts.greek });
  });
});

describe('latexToText', () => {
  it('writes common LaTeX as readable text', () => {
    expect(latexToText('\\frac{a}{b} + \\sqrt{x} = \\alpha')).toBe('(a)/(b) + √(x) = α');
  });
});

describe('CitationRegistry', () => {
  it('numbers each link once and lists labelled ones in order', () => {
    const citations = new CitationRegistry();
    expect(citations.cite('https://b.test', 'B')).toBe(1);
    expect(citations.cite('https://a.test', '')).toBe(2);
    expect(citations.cite('https://b.test', 'B again')).toBe(1);
    expect(citations.references()).toEqual([{ href: 'https://b.test', label: 'B again', num: 1 }]);
  });
});
