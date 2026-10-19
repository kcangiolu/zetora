import { rgb, type PDFFont, type PDFImage, type RGB } from 'pdf-lib';

import type { CitationRegistry } from '@/lib/export/citations';

export interface PdfFonts {
  regular: PDFFont;
  bold: PDFFont;
  italic: PDFFont;
  code: PDFFont;
  // Standard Symbol font, for the Greek letters the text fonts lack.
  greek: PDFFont;
}

export interface InlineContext {
  fonts: PdfFonts;
  citations: CitationRegistry;
}

// A run of text drawn in one style, or a formula, or a line break.
export type Seg = {
  text: string;
  font: PDFFont;
  size: number;
  color?: RGB;
  break?: boolean;
  href?: string;
  badge?: boolean;
  center?: boolean;
  superscript?: boolean;
  subscript?: boolean;
  latex?: string;
  // Attached after inline math (LaTeX) is rasterized to a PNG — see prepareInlineMathSegments.
  _img?: PDFImage;
  _drawH?: number;
  _drawW?: number;
};

// Markdown inline tokens as styled runs: bold, italic, code, links as citation numbers,
// and math between \( \) or \[ \].
export function flattenInline(
  tokens: any[] | undefined,
  baseFont: PDFFont,
  baseSize: number,
  ctx: InlineContext,
): Seg[] {
  if (!tokens || !Array.isArray(tokens)) return [];
  const segs: Seg[] = [];
  const sanitize = (s: string) => (s || '').replace(/\r?\n/g, ' ');

  // Helper to accumulate plain text for math buffers
  const appendText = (txt: string, buf: string) => buf + sanitize(txt);

  // Iterate with index to support cross-token math sequences like \( ... \) and \[ ... \]
  for (let idx = 0; idx < tokens.length; idx++) {
    const t: any = tokens[idx];
    const raw = String(t?.raw ?? '');

    // Handle display math start: \[
    if (t?.type === 'escape' && raw.startsWith('\\[')) {
      let content = '';
      let endIdx = idx + 1;
      for (; endIdx < tokens.length; endIdx++) {
        const tt: any = tokens[endIdx];
        const r = String(tt?.raw ?? '');
        if (tt?.type === 'escape' && r.startsWith('\\]')) break;
        // Collect text from intervening tokens
        if (typeof tt?.text === 'string') content = appendText(String(tt.text), content);
        else if (typeof tt?.raw === 'string') content = appendText(String(tt.raw), content);
        else if (tt?.type === 'space') content += ' ';
      }
      // If we found a closing \\], render centered math block
      if (endIdx < tokens.length) {
        const latex = content.trim();
        segs.push({ text: '', font: baseFont, size: baseSize, break: true });
        segs.push({ text: '', font: baseFont, size: baseSize + 2, center: true, latex });
        segs.push({ text: '', font: baseFont, size: baseSize, break: true });
        idx = endIdx; // skip through the closing token
        continue;
      }
      // No closing token: fall back to literal
      segs.push({ text: '(', font: baseFont, size: baseSize });
      continue;
    }

    // Handle inline math start: \(
    if (t?.type === 'escape' && raw.startsWith('\\(')) {
      let content = '';
      let endIdx = idx + 1;
      for (; endIdx < tokens.length; endIdx++) {
        const tt: any = tokens[endIdx];
        const r = String(tt?.raw ?? '');
        if (tt?.type === 'escape' && r.startsWith('\\)')) break;
        if (typeof tt?.text === 'string') content = appendText(String(tt.text), content);
        else if (typeof tt?.raw === 'string') content = appendText(String(tt.raw), content);
        else if (tt?.type === 'space') content += ' ';
      }
      if (endIdx < tokens.length) {
        const latex = content.trim();
        segs.push({ text: '', font: baseFont, size: baseSize, latex });
        idx = endIdx; // skip through the closing token
        continue;
      }
      segs.push({ text: '(', font: baseFont, size: baseSize });
      continue;
    }

    // Default handling for remaining token types
    switch (t.type) {
      case 'text': {
        const txt = sanitize(String(t.text ?? t.raw ?? ''));
        if (txt) {
          const mathSegs = splitMathInline(txt, baseFont, baseSize, ctx.fonts);
          if (mathSegs.length) segs.push(...mathSegs);
          else segs.push({ text: txt, font: baseFont, size: baseSize });
        }
        break;
      }
      case 'escape': {
        // Escaped non-math character; output literal without the backslash
        const txt = String(t.text ?? '').trim();
        const out = txt || raw.replace(/^\\/, '');
        if (out) segs.push({ text: out, font: baseFont, size: baseSize });
        break;
      }
      case 'space': {
        segs.push({ text: ' ', font: baseFont, size: baseSize });
        break;
      }
      case 'strong': {
        const inner = t.tokens ?? [{ type: 'text', text: t.text }];
        segs.push(...flattenInline(inner, ctx.fonts.bold, baseSize, ctx));
        break;
      }
      case 'em': {
        const inner = t.tokens ?? [{ type: 'text', text: t.text }];
        segs.push(...flattenInline(inner, ctx.fonts.italic, baseSize, ctx));
        break;
      }
      case 'codespan': {
        const txt = sanitize(String(t.text ?? ''));
        if (txt) segs.push({ text: txt, font: ctx.fonts.code, size: Math.max(8, baseSize - 1) });
        break;
      }
      case 'link': {
        const display = sanitize(String(t.text ?? t.href ?? t.raw ?? ''));
        const href = String(t.href ?? '');
        if (display || href) {
          const badgeText = String(ctx.citations.cite(href, display));
          segs.push({
            text: badgeText,
            font: baseFont,
            size: baseSize * 0.7,
            href,
            superscript: true,
            color: rgb(0.4, 0.4, 0.4),
          });
        }
        break;
      }
      case 'br': {
        segs.push({ text: '', font: baseFont, size: baseSize, break: true });
        break;
      }
      case 'paragraph': {
        const inner = t.tokens ?? [{ type: 'text', text: t.text }];
        segs.push(...flattenInline(inner, baseFont, baseSize, ctx));
        break;
      }
      default: {
        const txt = sanitize(String(t.text ?? t.raw ?? ''));
        if (txt) segs.push({ text: txt, font: baseFont, size: baseSize });
        break;
      }
    }
  }
  return segs;
}

// Plain text with its $…$ and \(…\) formulas and bare LaTeX macros split out as math
// runs. A $ before an amount ($100 billion) stays text.
export function splitMathInline(input: string, baseFont: PDFFont, baseSize: number, fonts: PdfFonts): Seg[] {
  const segs: Seg[] = [];
  const s = input || '';
  let i = 0;

  // Check if a dollar sign at the given index is part of a monetary amount
  const isMonetaryAmount = (str: string, dollarIdx: number): boolean => {
    if (dollarIdx < 0 || dollarIdx >= str.length) return false;
    // Look ahead to see if it matches monetary pattern
    const afterDollar = str.slice(dollarIdx + 1);
    // Match: digits with optional commas/decimals followed by optional scale words
    const monetaryPattern =
      /^\d+(?:,\d{3})*(?:\.\d+)?(?:[kKmMbBtT]|\s+(?:thousand|million|billion|trillion|k|K|M|B|T))?/;
    return monetaryPattern.test(afterDollar);
  };

  // Route any Greek unicode characters to a Unicode font (Inter)
  const pushPlain = (txt: string) => {
    if (!txt) return;
    let buf = '';
    for (const ch of txt) {
      if (/[αβγθτμΔλ]/.test(ch)) {
        if (buf) segs.push({ text: buf, font: baseFont, size: baseSize });
        segs.push({ text: ch, font: fonts.greek, size: baseSize });
        buf = '';
      } else {
        buf += ch;
      }
    }
    if (buf) segs.push({ text: buf, font: baseFont, size: baseSize });
  };

  const readGroup = (start: number): [string, number] => {
    if (s[start] !== '{') return ['', start];
    let depth = 0;
    let j = start;
    while (j < s.length) {
      const ch = s[j];
      if (ch === '{') depth++;
      else if (ch === '}') {
        depth--;
        if (depth === 0) return [s.slice(start + 1, j), j + 1];
      }
      j++;
    }
    return [s.slice(start + 1), s.length];
  };

  while (i < s.length) {
    const idxDollar = s.indexOf('$', i);
    const idxInline = s.indexOf('\\(', i);
    const idxMacro = s.indexOf('\\', i);
    const cands = [idxDollar, idxInline, idxMacro].filter((n) => n !== -1);
    if (!cands.length) {
      pushPlain(s.slice(i));
      break;
    }
    const next = Math.min(...cands);
    if (next > i) pushPlain(s.slice(i, next));

    if (s[next] === '$') {
      // Check if this is a monetary amount (e.g., $100 billion)
      if (isMonetaryAmount(s, next)) {
        // Extract the monetary amount and treat it as plain text
        const afterDollar = s.slice(next + 1);
        const monetaryMatch = afterDollar.match(
          /^\d+(?:,\d{3})*(?:\.\d+)?(?:[kKmMbBtT]|\s+(?:thousand|million|billion|trillion|k|K|M|B|T))?/,
        );
        if (monetaryMatch) {
          const monetaryText = '$' + monetaryMatch[0];
          pushPlain(monetaryText);
          i = next + monetaryText.length;
          continue;
        }
      }

      // Otherwise, treat as LaTeX
      const end = s.indexOf('$', next + 1);
      if (end === -1) {
        pushPlain(s.slice(next));
        break;
      }
      const content = s.slice(next + 1, end).trim();
      segs.push({ text: '', font: baseFont, size: baseSize, latex: content });
      i = end + 1;
      continue;
    }
    if (s.slice(next, next + 2) === '\\(') {
      const end = s.indexOf('\\)', next + 2);
      if (end === -1) {
        pushPlain(s.slice(next));
        break;
      }
      const content = s.slice(next + 2, end).trim();
      segs.push({ text: '', font: baseFont, size: baseSize, latex: content });
      i = end + 2;
      continue;
    }
    if (s[next] === '\\') {
      let j = next + 1;
      while (j < s.length && /[A-Za-z]+/.test(s[j])) j++;
      const cmd = '\\' + s.slice(next + 1, j);
      if (cmd === '\\sqrt') {
        const [grp, after] = readGroup(j);
        const latex = grp ? `${cmd}{${grp}}` : cmd;
        segs.push({ text: '', font: baseFont, size: baseSize, latex });
        i = after;
        continue;
      }
      if (cmd === '\\frac') {
        const [num, p1] = readGroup(j);
        const [den, p2] = readGroup(p1);
        const latex = `${cmd}{${num}}{${den}}`;
        segs.push({ text: '', font: baseFont, size: baseSize, latex });
        i = p2;
        continue;
      }
      // Simple macros like \alpha, \Delta, etc
      segs.push({ text: '', font: baseFont, size: baseSize, latex: cmd });
      i = j;
      continue;
    }

    // Fallback: emit the single character
    pushPlain(s[next]);
    i = next + 1;
  }

  return segs;
}
