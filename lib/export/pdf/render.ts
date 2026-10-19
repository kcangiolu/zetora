import { readFileSync } from 'node:fs';
import path from 'node:path';
import fontkit from '@pdf-lib/fontkit';
import { Lexer } from 'marked';
import { PDFArray, PDFDocument, PDFFont, PDFName, PDFString, RGB, StandardFonts, rgb } from 'pdf-lib';
import sharp from 'sharp';
import { CitationRegistry } from '@/lib/export/citations';
import type { ExportRequest } from '@/lib/export/export-request';
import { createLogger } from '@/lib/logger';
import { isSupportedByFont, measureTextWidth, sanitizeForFont, textWidth, wrapText } from './layout';
import { drawZetoraLogo } from './logo';
import { cleanMathSvg, renderMathSvg, simplifyLatex } from './math';
import { preprocessMarkdown } from './preprocess';
import {
  flattenInline as flattenInlineTokens,
  splitMathInline as splitInlineMath,
  type InlineContext,
  type Seg,
} from './segments';

const log = createLogger('export-pdf');

const FONTS_DIR = path.join(process.cwd(), 'app/api/export/pdf/fonts');

// The answer as an A4 PDF: a header with the logo, title, model and date, the Markdown
// body (math rendered with MathJax), then the cited links as References.
export async function renderMarkdownPdf({ title, content: rawContent, meta = {} }: ExportRequest): Promise<Uint8Array> {
  const content = preprocessMarkdown(rawContent);

  const pdfDoc = await PDFDocument.create();
  // @pdf-lib/fontkit ships a UMD-style `export as namespace fontkit` .d.ts that doesn't
  // structurally match pdf-lib's unexported `Fontkit` interface — narrow cast via the
  // method's own parameter type instead of reaching for `any`.
  pdfDoc.registerFontkit(fontkit as unknown as Parameters<typeof pdfDoc.registerFontkit>[0]);

  // Load Geist fonts for better Unicode support and modern design
  const embedFont = (file: string) => pdfDoc.embedFont(readFileSync(path.join(FONTS_DIR, file)));
  const font = await embedFont('Geist-Regular.ttf');
  const fontBold = await embedFont('Geist-Bold.ttf');
  const fontItalic = await embedFont('Geist-RegularItalic.ttf');
  const fontCode = await embedFont('GeistMono-Regular.ttf');

  const fontSize = 12;
  const lineGap = 6;
  const margin = 50;
  const pageWidth = 595; // A4 width in points
  const pageHeight = 842; // A4 height in points

  // Check if a character is supported by a font

  // Draw text with font fallback support (tries main font, then symbol fonts)
  const drawTextWithFallback = (text: string, x: number, y: number, size: number, mainFont: PDFFont, color: RGB) => {
    if (!text) return;

    let currentX = x;
    for (const char of Array.from(text)) {
      if (char === '\t') {
        try {
          currentX += mainFont.widthOfTextAtSize('  ', size);
        } catch {
          currentX += size;
        }
        continue;
      }
      if (char === '\n') continue;

      let fontToUse = mainFont;

      // Use main font (Geist has excellent Unicode coverage)
      if (!isSupportedByFont(char, mainFont)) {
        // Log unsupported character for debugging
        const charCode = char.charCodeAt(0).toString(16).toUpperCase().padStart(4, '0');
        log.warn(`Unsupported character: '${char}' (U+${charCode}) in Geist font`);
        continue;
      }

      try {
        page.drawText(char, {
          x: currentX,
          y: y,
          size: size,
          font: fontToUse,
          color: color,
        });
        currentX += fontToUse.widthOfTextAtSize(char, size);
      } catch (err) {
        // Log error but continue rendering
        log.warn(`Failed to draw character '${char}':`, err);
      }
    }
  };

  // spacing constants for consistent vertical rhythm
  const SPACE_BEFORE_HEADING = 10;
  const SPACE_AFTER_HEADING = 8;
  const SPACE_AFTER_PARAGRAPH = 8;
  const SPACE_BEFORE_TABLE = 10;
  const SPACE_AFTER_TABLE = 18;
  const SPACE_AFTER_LIST = 8;
  const SPACE_AFTER_BLOCKQUOTE = 8;
  const SPACE_AFTER_CODE = 24;
  const KEEP_WITH_NEXT_MIN_SPACE_TABLE = 140;
  const KEEP_WITH_NEXT_MIN_SPACE_GENERIC = 60;
  const MATH_SVG_SCALE_FACTOR = 4;
  const MATH_DISPLAY_MAX_WIDTH_RATIO = 0.95;
  const MATH_DISPLAY_MAX_HEIGHT_RATIO = 0.28;
  const MATH_DISPLAY_MIN_HEIGHT_MULTIPLIER = 1.4;
  const MATH_DISPLAY_SPACING_MULTIPLIER = 0.65;
  const MATH_INLINE_HEIGHT_MULTIPLIER = 0.95;
  const MATH_INLINE_MIN_HEIGHT_MULTIPLIER = 0.75;
  const MATH_INLINE_MAX_WIDTH_MULTIPLIER = 3.5;
  const MATH_INLINE_BASELINE_MULTIPLIER = 0.36;

  const addPage = () => pdfDoc.addPage([pageWidth, pageHeight]);
  let page = addPage();
  let y = pageHeight - margin;

  const addLinkAnnotation = (href: string, x: number, yPos: number, width: number, height: number) => {
    try {
      const linkRef = pdfDoc.context.register(
        pdfDoc.context.obj({
          Type: 'Annot',
          Subtype: 'Link',
          Rect: [x, yPos, x + width, yPos + height],
          Border: [0, 0, 0],
          A: { Type: 'Action', S: 'URI', URI: PDFString.of(href) },
        }),
      );
      const existingAnnots = page.node.get(PDFName.of('Annots'));
      if (existingAnnots instanceof PDFArray) existingAnnots.push(linkRef);
      else page.node.set(PDFName.of('Annots'), pdfDoc.context.obj([linkRef]));
    } catch {}
  };

  const svgToPngImage = async (svg: string, scaleFactor: number) => {
    const tempPngBuf = await sharp(Buffer.from(svg)).png().toBuffer();
    const tempPngImg = await pdfDoc.embedPng(tempPngBuf);
    const pngBuf = await sharp(Buffer.from(svg))
      .png({ quality: 100 })
      .resize({
        width: Math.round(tempPngImg.width * scaleFactor),
        height: Math.round(tempPngImg.height * scaleFactor),
        fit: 'contain',
      })
      .toBuffer();
    const pngImg = await pdfDoc.embedPng(pngBuf);
    return { pngImg, tempWidth: tempPngImg.width, tempHeight: tempPngImg.height };
  };

  // Professional header with Zetora branding and chat title
  const drawProfessionalHeader = () => {
    // One-line: logo + app name/title
    const titleSize = 16;
    const logoWidth = 20;
    const logoColor = rgb(0.15, 0.15, 0.15);

    // Align logo top to sit above the text baseline (cap height ~0.7x font size)
    const capHeight = titleSize * 0.7;
    const baselineAdjust = 25; // nudge downward for visual alignment
    const logoTop = y + capHeight + baselineAdjust;
    const logoHeight = drawZetoraLogo(page, margin, logoTop, logoWidth, logoColor);
    const textX = margin + logoWidth + 8;
    const headerText = title ?? 'Zetora AI';
    drawTextWithFallback(headerText, textX, y, titleSize, fontBold, rgb(0, 0, 0));
    y -= Math.max(titleSize, logoHeight) + 12;

    // Metadata — left-aligned, muted
    const info: string[] = [];
    if (meta?.modelLabel) info.push(`Model: ${meta.modelLabel}`);
    if (meta?.createdAt) info.push(`Date: ${new Date(meta.createdAt).toLocaleString()}`);
    if (info.length) {
      const infoText = info.join(' • ');
      const infoSize = 10;
      drawTextWithFallback(infoText, margin, y, infoSize, font, rgb(0.4, 0.4, 0.4));
      y -= infoSize + 16;
    }

    // Separator line full width
    const lineY = y + 8;
    page.drawLine({
      start: { x: margin, y: lineY },
      end: { x: pageWidth - margin, y: lineY },
      thickness: 0.5,
      color: rgb(0.85, 0.85, 0.85),
    });
    y -= 16;
  };

  drawProfessionalHeader();

  const maxLineWidth = pageWidth - margin * 2;

  // Calculate text width with Geist font

  const fontGreek = await pdfDoc.embedFont(StandardFonts.Symbol);
  const citations = new CitationRegistry();
  const inlineContext: InlineContext = {
    fonts: { regular: font, bold: fontBold, italic: fontItalic, code: fontCode, greek: fontGreek },
    citations,
  };
  const flattenInline = (tokens: any[] | undefined, baseFont: PDFFont, baseSize: number) =>
    flattenInlineTokens(tokens, baseFont, baseSize, inlineContext);
  const splitMathInline = (input: string, baseFont: PDFFont, baseSize: number) =>
    splitInlineMath(input, baseFont, baseSize, inlineContext.fonts);

  const drawWrapped = (text: string, opts: { font: PDFFont; size: number; indent?: number }) => {
    const indent = opts.indent ?? 0;
    const wFn = textWidth(opts.font, opts.size);
    const lines = wrapText(text, wFn, maxLineWidth - indent);
    for (const line of lines) {
      if (line === '') {
        y -= opts.size; // extra paragraph space
        if (y <= margin) {
          page = addPage();
          y = pageHeight - margin;
        }
        continue;
      }
      drawTextWithFallback(line, margin + indent, y, opts.size, opts.font, rgb(0, 0, 0));
      y -= opts.size + lineGap;
      if (y <= margin) {
        page = addPage();
        y = pageHeight - margin;
      }
    }
  };

  // Add a variant of inline wrapping that applies a hanging indent to continuation lines
  const drawInlineWrappedHanging = (segments: Seg[], baseSize: number, firstIndent = 0, hangingIndent = 20) => {
    let indent = firstIndent;
    let available = maxLineWidth - indent;
    let line: Seg[] = [];

    const widthOfSeg = (seg: Seg) => measureTextWidth(seg.font, seg.text, seg.size);
    const flushLine = () => {
      let x = margin + indent;
      if (line.length === 1 && line[0].center) {
        const w = widthOfSeg(line[0]);
        x = margin + Math.max(0, (maxLineWidth - w) / 2);
      }
      for (const seg of line) {
        if (!seg.text) continue;
        const segWidth = widthOfSeg(seg);
        let advanceWidth = segWidth;

        // For superscript citations, render smaller and slightly raised with themed color (no circle)
        if (seg.superscript) {
          const yOffset = seg.size * 0.25; // Raise the text slightly
          const themeColor = rgb(0.2, 0.4, 0.8); // approx Shadcn primary
          drawTextWithFallback(seg.text, x, y + yOffset, seg.size, fontBold, themeColor);

          // Add a small gap after the superscript for breathing room
          advanceWidth = segWidth + 1;
        } else {
          drawTextWithFallback(seg.text, x, y, seg.size, seg.font, seg.color ?? rgb(0, 0, 0));
        }

        // Add clickable URI annotation if this segment represents a link
        if (seg.href) addLinkAnnotation(String(seg.href), x, y, advanceWidth, seg.size);

        x += advanceWidth;
      }
      y -= baseSize + lineGap;
      if (y <= margin) {
        page = addPage();
        y = pageHeight - margin;
      }
      line = [];
      indent = hangingIndent; // hanging indent for subsequent lines
      available = maxLineWidth - indent;
    };

    for (const seg of segments ?? []) {
      if (seg.break) {
        if (line.length) flushLine();
        else {
          y -= baseSize + lineGap;
          if (y <= margin) {
            page = addPage();
            y = pageHeight - margin;
          }
        }
        continue;
      }
      let remaining = seg.text;
      while (remaining.length) {
        let w = 0;
        try {
          w = seg.font.widthOfTextAtSize(remaining, seg.size);
        } catch {
          w = remaining.length * seg.size * 0.5;
        }
        if (w <= available) {
          line.push({ ...seg, text: remaining });
          available -= w;
          remaining = '';
        } else {
          // character-based split to fit available space
          let cut = 0;
          for (let i = 1; i <= remaining.length; i++) {
            const candidate = remaining.slice(0, i);
            let cw = 0;
            try {
              cw = seg.font.widthOfTextAtSize(candidate, seg.size);
            } catch {
              cw = candidate.length * seg.size * 0.5;
            }
            if (cw > available) {
              cut = i - 1;
              break;
            }
            cut = i;
          }
          if (cut <= 0) {
            // nothing fits on this line, flush and retry
            if (line.length) flushLine();
            else {
              y -= baseSize + lineGap;
              if (y <= margin) {
                page = addPage();
                y = pageHeight - margin;
              }
            }
            available = maxLineWidth - indent;
            continue;
          }
          const fit = remaining.slice(0, cut);
          const rest = remaining.slice(cut).replace(/^\s+/, '');
          line.push({ ...seg, text: fit });
          remaining = rest;
          try {
            available -= seg.font.widthOfTextAtSize(fit, seg.size);
          } catch {
            available -= fit.length * seg.size * 0.5;
          }
          if (available <= 1) flushLine();
        }
      }
    }
    if (line.length) flushLine();
  };

  const drawMathBlock = async (latex: string, baseSize: number) => {
    try {
      const baseSvg = renderMathSvg(latex, true);
      const cleanSvg = cleanMathSvg(baseSvg, { removeRectElements: true, removeLineElements: true });

      // Parse ex-based height to estimate natural display size
      const heightExMatch = baseSvg.match(/height\s*=\s*"([\d.]+)ex"/) || baseSvg.match(/height:\s*([\d.]+)ex/);
      const heightEx = heightExMatch ? parseFloat(heightExMatch[1]) : NaN;
      const naturalDisplayH = Number.isFinite(heightEx) ? heightEx * baseSize : baseSize * 2;

      // High-resolution conversion
      const scaleFactor = MATH_SVG_SCALE_FACTOR;
      let pngImg;
      try {
        ({ pngImg } = await svgToPngImage(cleanSvg, scaleFactor));
      } catch {
        ({ pngImg } = await svgToPngImage(baseSvg, scaleFactor));
      }

      // Clamp display size: not wider than 75% line, not taller than ~2.0 line heights
      const maxW = maxLineWidth * MATH_DISPLAY_MAX_WIDTH_RATIO;
      const maxH = Math.min(pageHeight * MATH_DISPLAY_MAX_HEIGHT_RATIO, baseSize * 2.75);
      const minH = baseSize * MATH_DISPLAY_MIN_HEIGHT_MULTIPLIER;
      const scaleW = maxW / pngImg.width;
      const scaleH = maxH / pngImg.height;
      const minScale = minH / pngImg.height;
      const scale = Math.min(scaleW, scaleH, Math.max(naturalDisplayH / pngImg.height, minScale));
      const w = pngImg.width * scale;
      const h = pngImg.height * scale;

      // Center horizontally
      const x = margin + (maxLineWidth - w) / 2;

      // Spacing
      const spaceBefore = Math.max(10, baseSize * MATH_DISPLAY_SPACING_MULTIPLIER + lineGap * 0.5);
      const spaceAfter = Math.max(10, baseSize * MATH_DISPLAY_SPACING_MULTIPLIER + lineGap * 0.5);

      y -= spaceBefore;
      if (y - h <= margin) {
        page = addPage();
        y = pageHeight - margin;
      }
      page.drawImage(pngImg, { x, y: y - h, width: w, height: h });
      y -= h + spaceAfter;
      if (y <= margin) {
        page = addPage();
        y = pageHeight - margin;
      }
    } catch (e) {
      log.warn('MathJax display render failed:', e instanceof Error ? e.message : String(e));
    }
  };

  const prepareInlineMathSegments = async (segments: Seg[], baseSize: number) => {
    for (const seg of segments) {
      if (seg.latex && !seg.center) {
        try {
          const baseSvg = renderMathSvg(seg.latex, false);
          const cleanSvg = cleanMathSvg(baseSvg, { removeRectStrokes: true, removeLineStrokes: true });

          const scaleFactor = MATH_SVG_SCALE_FACTOR;
          let pngImg;
          try {
            ({ pngImg } = await svgToPngImage(cleanSvg, scaleFactor));
          } catch {
            ({ pngImg } = await svgToPngImage(baseSvg, scaleFactor));
          }
          seg._img = pngImg;

          const targetH = Math.min(baseSize, baseSize * MATH_INLINE_HEIGHT_MULTIPLIER);
          const aspectRatio = pngImg.width / pngImg.height;
          const targetW = targetH * aspectRatio;

          const maxInlineW = baseSize * MATH_INLINE_MAX_WIDTH_MULTIPLIER;
          const minInlineH = baseSize * MATH_INLINE_MIN_HEIGHT_MULTIPLIER;

          let finalH = Math.max(targetH, minInlineH);
          let finalW = finalH * aspectRatio;

          if (finalW > maxInlineW) {
            finalW = maxInlineW;
            finalH = finalW / aspectRatio;
          }

          seg._drawH = finalH;
          seg._drawW = finalW;
        } catch (e) {
          log.warn('MathJax inline render failed:', e instanceof Error ? e.message : String(e));
          const fb = simplifyLatex(seg.latex || '');
          seg.text = fb;
          delete seg.latex;
        }
      }
    }
  };

  // Standard inline wrapping used in general text rendering
  const drawInlineWrapped = async (segments: Seg[], baseSize: number, indent = 0) => {
    let available = maxLineWidth - indent;
    let line: Seg[] = [];

    await prepareInlineMathSegments(segments, baseSize);

    const widthOfSeg = (seg: Seg) => {
      const w = seg._drawW;
      if (typeof w === 'number') return w;
      return measureTextWidth(seg.font, seg.text, seg.size);
    };
    const flushLine = () => {
      let x = margin + indent;
      // Center the whole line if requested, regardless of segment count
      if (line.length && line[0].center) {
        const totalWidth = line.reduce((sum, s) => sum + widthOfSeg(s), 0);
        x = margin + Math.max(0, (maxLineWidth - totalWidth) / 2);
      }
      for (const seg of line) {
        if (seg.latex && !seg.center && seg._img && seg._drawW != null && seg._drawH != null) {
          const img = seg._img;
          const w = seg._drawW;
          const h = seg._drawH;
          // Move math symbols higher - center around baseline
          const imgY = y - h * MATH_INLINE_BASELINE_MULTIPLIER;
          page.drawImage(img, { x, y: imgY, width: w, height: h });
          x += w;
          continue;
        }
        if (!seg.text) continue;
        const segWidth = widthOfSeg(seg);
        let advanceWidth = segWidth;

        if (seg.superscript) {
          const supSize = Math.max(6, Math.round(seg.size * 0.8));
          const yOffset = supSize * 0.35;
          drawTextWithFallback(seg.text, x, y + yOffset, supSize, seg.font ?? fontItalic, seg.color ?? rgb(0, 0, 0));
          try {
            advanceWidth = (seg.font ?? fontItalic).widthOfTextAtSize(seg.text, supSize) + 0.5;
          } catch {
            advanceWidth = seg.text.length * supSize * 0.5 + 0.5;
          }
        } else if (seg.subscript) {
          const subSize = Math.max(6, Math.round(seg.size * 0.8));
          const yOffset = -subSize * 0.15;
          drawTextWithFallback(seg.text, x, y + yOffset, subSize, seg.font ?? fontItalic, seg.color ?? rgb(0, 0, 0));
          try {
            advanceWidth = (seg.font ?? fontItalic).widthOfTextAtSize(seg.text, subSize) + 0.5;
          } catch {
            advanceWidth = seg.text.length * subSize * 0.5 + 0.5;
          }
        } else {
          drawTextWithFallback(seg.text, x, y, seg.size, seg.font, seg.color ?? rgb(0, 0, 0));
        }

        if (seg.href) {
          addLinkAnnotation(String(seg.href), x, y, advanceWidth, seg.size);
        }

        x += advanceWidth;
      }
      y -= baseSize + lineGap;
      if (y <= margin) {
        page = addPage();
        y = pageHeight - margin;
      }
      line = [];
      available = maxLineWidth - indent;
    };

    for (const seg of segments) {
      if (seg.latex && seg.center) {
        if (line.length) flushLine();
        await drawMathBlock(seg.latex, baseSize);
        available = maxLineWidth - indent;
        continue;
      }
      if (seg.break) {
        if (line.length) flushLine();
        continue;
      }
      if (seg.latex && !seg.center && seg._drawW) {
        const w = seg._drawW as number;
        if (w <= available) {
          line.push(seg);
          available -= w;
        } else {
          if (line.length) flushLine();
          available = maxLineWidth - indent;
          if (w <= available) {
            line.push(seg);
            available -= w;
          } else {
            /* If even a single inline math is wider than a line, reduce height for this segment */
            const img = seg._img;
            if (img) {
              const targetH = Math.max(8, Math.round(baseSize * 0.9));
              seg._drawH = targetH;
              seg._drawW = img.width * (targetH / img.height);
              const nw = seg._drawW as number;
              if (nw <= available) {
                line.push(seg);
                available -= nw;
              } else {
                line.push(seg);
                flushLine();
              }
            } else {
              // fallback: treat as plain text
              seg.text = simplifyLatex(seg.latex || '');
              delete seg.latex;
            }
          }
        }
        continue;
      }
      // Word-aware wrapping: prefer breaking at spaces; only break mid-word if the word itself exceeds a full line.
      const tokens = seg.text.match(/[^\s]+|\s+/g) || [];
      for (let tIdx = 0; tIdx < tokens.length; tIdx++) {
        const token = tokens[tIdx];
        const isSpace = /^\s+$/.test(token);
        let tokWidth = 0;
        try {
          tokWidth = seg.font.widthOfTextAtSize(token, seg.size);
        } catch {
          // Fallback: estimate width based on character count if font can't measure
          tokWidth = token.length * seg.size * 0.5;
        }

        if (tokWidth <= available) {
          // Token fits on current line
          if (!isSpace || line.length) {
            line.push({ ...seg, text: token });
            available -= tokWidth;
          }
          continue;
        }

        // Doesn't fit. If there's already content on this line, flush first.
        if (line.length) {
          flushLine();
          available = maxLineWidth - indent;
        }

        if (tokWidth <= available) {
          line.push({ ...seg, text: token });
          available -= tokWidth;
          continue;
        }

        // Extremely long token (word) that can't fit even on a fresh line: break at character level.
        let start = 0;
        while (start < token.length) {
          let end = start;
          let part = '';
          while (end < token.length) {
            const cand = token.slice(start, end + 1);
            let cw = 0;
            try {
              cw = seg.font.widthOfTextAtSize(cand, seg.size);
            } catch {
              // Fallback: estimate width based on character count
              cw = cand.length * seg.size * 0.5;
            }
            if (cw > available) break;
            part = cand;
            end++;
          }

          if (!part) {
            // If even a single character doesn't fit, flush and retry on next line.
            flushLine();
            available = maxLineWidth - indent;
            continue;
          }

          line.push({ ...seg, text: part });
          try {
            available -= seg.font.widthOfTextAtSize(part, seg.size);
          } catch {
            // Fallback: estimate width reduction based on character count
            available -= part.length * seg.size * 0.5;
          }
          start += part.length;

          if (start < token.length) {
            flushLine();
            available = maxLineWidth - indent;
          }
        }
      }
    }
    if (line.length) flushLine();
  };

  const drawListItem = async (item: any, bullet: string, orderedIndex?: number, baseIndent = 0) => {
    const bulletText = orderedIndex != null ? `${orderedIndex}.` : bullet;
    let bulletWidth = 0;
    try {
      bulletWidth = font.widthOfTextAtSize(bulletText, fontSize);
    } catch {
      bulletWidth = bulletText.length * fontSize * 0.5;
    }
    // Draw bullet at current indent
    drawTextWithFallback(bullet, margin + baseIndent, y, fontSize, font, rgb(0, 0, 0));
    const indent = baseIndent + bulletWidth + 10;

    // Build inline segments from possible block tokens inside list item
    let segs: Seg[] = [];
    const tks = item?.tokens;
    if (Array.isArray(tks) && tks.length) {
      for (const bt of tks) {
        // Handle nested lists inside a list item
        if (bt?.type === 'list') {
          if (segs.length) {
            await drawInlineWrapped(segs, fontSize, indent);
            segs = [];
          }
          let nestedCounter = bt.ordered ? bt.start || 1 : 1;
          for (const nItem of bt.items || []) {
            await drawListItem(nItem, '•', bt.ordered ? nestedCounter : undefined, indent);
            if (bt.ordered) nestedCounter++;
          }
          // Continue accumulating any following inline blocks
          continue;
        }

        if (bt && Array.isArray(bt.tokens)) {
          segs.push(...flattenInline(bt.tokens, font, fontSize));
          // break between blocks within a single list item
          segs.push({ text: '', font, size: fontSize, break: true });
        } else {
          segs.push(...flattenInline([bt], font, fontSize));
        }
      }
      if (segs.length && segs[segs.length - 1].break) segs.pop();
      if (segs.length) {
        await drawInlineWrapped(segs, fontSize, indent);
      }
    } else if (typeof item?.text === 'string') {
      let inlineTokens: any[] | undefined;
      try {
        inlineTokens = Lexer.lexInline(item.text);
      } catch {}
      const built = inlineTokens
        ? flattenInline(inlineTokens, font, fontSize)
        : [{ text: String(item.text), font, size: fontSize }];
      await drawInlineWrapped(built, fontSize, indent);
    } else {
      await drawInlineWrapped([{ text: '', font, size: fontSize }], fontSize, indent);
    }
  };

  // Draw a simple grid table for markdown `table` tokens
  const drawTable = async (tk: any) => {
    const headers = Array.isArray(tk.header) ? tk.header : [];
    const rows = Array.isArray(tk.rows) ? tk.rows : [];
    const nCols = Math.max(headers.length, rows[0]?.length || 0);
    if (!nCols) {
      return;
    }

    const padX = 8;
    const padY = 4; // slightly larger padding for better breathing room
    const headerSize = fontSize;
    const cellSize = Math.max(9, fontSize - 1);
    const colWidth = Math.floor(maxLineWidth / nCols);

    // Build inline segments for a cell, preserving link citations
    const buildTableSegmentsFromText = (text: string, baseFont: PDFFont, baseSize: number): Seg[] => {
      const hasLatexCommand = /\\[A-Za-z]+/.test(text);
      const hasMathDelim = /\$|\\\(|\\\[/.test(text);
      if (hasLatexCommand && !hasMathDelim) {
        return [{ text: '', font: baseFont, size: baseSize, latex: text }];
      }
      return splitMathInline(text, baseFont, baseSize);
    };

    const toSegments = (cell: any, baseFont: PDFFont, baseSize: number): Seg[] => {
      if (Array.isArray(cell?.tokens)) {
        const segs: Seg[] = [];
        for (const tt of cell.tokens) {
          if (tt?.type === 'link') {
            const display = String(tt.text ?? tt.href ?? tt.raw ?? '');
            const href = String(tt.href ?? '');
            segs.push({
              text: String(citations.cite(href, display)),
              font: baseFont,
              size: Math.max(6, Math.round(baseSize * 0.7)),
              href,
              superscript: true,
              color: rgb(0.4, 0.4, 0.4),
            });
          } else {
            const s = String(tt.text ?? tt.raw ?? '');
            if (s) segs.push(...buildTableSegmentsFromText(s, baseFont, baseSize));
          }
        }
        return segs;
      }
      const s = typeof cell === 'string' ? cell : String(cell?.text ?? cell?.raw ?? '');
      return buildTableSegmentsFromText(s, baseFont, baseSize);
    };

    // Wrap segments into lines constrained to cell width
    const wrapSegments = (segments: Seg[], maxWidth: number, fallbackSize: number) => {
      const lines: Seg[][] = [];
      const lineHeights: number[] = [];
      let line: Seg[] = [];
      let available = maxWidth;

      const flush = () => {
        if (line.length) {
          lines.push(line);
          const maxHeight = Math.max(...line.map((seg) => seg._drawH ?? seg.size ?? fallbackSize));
          lineHeights.push(maxHeight);
        }
        line = [];
        available = maxWidth;
      };

      for (const seg of segments ?? []) {
        if (seg.break) {
          flush();
          continue;
        }
        const font = seg.font;
        const size = seg.size;
        let remaining = seg.text || '';
        const inlineW = seg._drawW;
        const isInlineImage = typeof inlineW === 'number' && !remaining.length;
        while (remaining.length || isInlineImage) {
          let w = 0;
          if (isInlineImage) w = inlineW as number;
          else w = measureTextWidth(font, remaining, size);
          if (w <= available) {
            line.push({ ...seg, text: remaining });
            available -= w;
            remaining = '';
            if (isInlineImage) break;
          } else {
            if (isInlineImage && !line.length) {
              line.push({ ...seg, text: remaining });
              flush();
              break;
            }
            const firstLine =
              wrapText(
                remaining,
                (s) => {
                  return measureTextWidth(font, s, size);
                },
                available,
              )[0] ?? '';
            if (!firstLine.length) {
              flush();
              continue;
            }
            line.push({ ...seg, text: firstLine });
            flush();
            remaining = remaining.slice(firstLine.length);
          }
        }
      }
      if (line.length) {
        lines.push(line);
        const maxHeight = Math.max(...line.map((seg) => seg._drawH ?? seg.size ?? fallbackSize));
        lineHeights.push(maxHeight);
      }
      return { lines, lineHeights };
    };

    // Measure row height and pre-wrapped lines for rendering
    const measureRow = (cells: Seg[][], usedFont: PDFFont, usedSize: number) => {
      const wraps: Seg[][][] = [];
      const lineHeights: number[][] = [];
      const lineGapInCell = Math.max(2, Math.round(usedSize * 0.2));
      const cellHeights: number[] = [];
      let rowHeight = 0;
      for (let c = 0; c < nCols; c++) {
        const segs = cells[c] || [];
        const wrapped = wrapSegments(segs, colWidth - 2 * padX, usedSize);
        wraps.push(wrapped.lines);
        lineHeights.push(wrapped.lineHeights);
        const contentH =
          wrapped.lineHeights.reduce((sum, h) => sum + h, 0) +
          Math.max(0, wrapped.lineHeights.length - 1) * lineGapInCell;
        cellHeights.push(contentH);
        rowHeight = Math.max(rowHeight, 2 * padY + contentH);
      }
      return { wraps, lineHeights, cellHeights, rowHeight, lineGapInCell };
    };

    const renderMeasuredRow = (
      measured: {
        wraps: Seg[][][];
        lineHeights: number[][];
        cellHeights: number[];
        rowHeight: number;
        lineGapInCell: number;
      },
      usedFont: PDFFont,
      usedSize: number,
      shaded = false,
    ) => {
      const { wraps, lineHeights, cellHeights, rowHeight, lineGapInCell } = measured;
      // Page break check; repeat header if a break occurs mid-table
      if (y - rowHeight <= margin) {
        page = addPage();
        y = pageHeight - margin;
        if (headers.length) {
          const mh = measureRow(headers, fontBold, headerSize);
          renderMeasuredRow(mh, fontBold, headerSize, true);
        }
      }
      const rowBottom = y - rowHeight;

      // draw background + borders per cell
      for (let c = 0; c < nCols; c++) {
        const x = margin + c * colWidth;
        const fillColor = shaded ? (usedFont === fontBold ? rgb(0.94, 0.94, 0.98) : rgb(0.98, 0.98, 0.995)) : undefined;
        page.drawRectangle({
          x,
          y: rowBottom,
          width: colWidth,
          height: rowHeight,
          color: fillColor,
          borderColor: rgb(0.85, 0.85, 0.88),
          borderWidth: 0.75,
        });
      }

      // subtle accent line under header row for stronger separation
      if (shaded && usedFont === fontBold) {
        page.drawLine({
          start: { x: margin, y: rowBottom },
          end: { x: margin + nCols * colWidth, y: rowBottom },
          thickness: 1.2,
          color: rgb(0.7, 0.7, 0.8),
        });
      }

      // draw content segments (vertically center within each cell)
      for (let c = 0; c < nCols; c++) {
        const startX = margin + c * colWidth + padX;
        const contentH = cellHeights[c];
        const freeSpace = rowHeight - 2 * padY - contentH;
        const vOffset = Math.max(0, Math.floor(freeSpace / 2));
        let ty = y - padY - vOffset;

        for (let lIdx = 0; lIdx < wraps[c].length; lIdx++) {
          const lineSegs = wraps[c][lIdx];
          const lineHeight = lineHeights[c][lIdx] ?? usedSize;
          const baselineY = ty - lineHeight * 0.85;
          let xCursor = startX;
          for (const seg of lineSegs) {
            const segFont = seg.font || usedFont;
            const segSize = seg.size || usedSize;
            const raise = seg.superscript ? Math.round(segSize * 0.35) : 0;
            const drawY = baselineY + raise;
            const text = seg.text || '';
            let advanceWidth = 0;
            const img = seg._img;
            const drawW = seg._drawW;
            const drawH = seg._drawH;
            if (img && typeof drawW === 'number' && typeof drawH === 'number') {
              const imgY = baselineY - drawH * MATH_INLINE_BASELINE_MULTIPLIER;
              page.drawImage(img, { x: xCursor, y: imgY, width: drawW, height: drawH });
              advanceWidth = drawW;
            } else if (text) {
              advanceWidth = measureTextWidth(segFont, text, segSize);
              drawTextWithFallback(seg.text, xCursor, drawY, segSize, segFont, seg.color || rgb(0, 0, 0));
            }

            if (seg.href) {
              addLinkAnnotation(String(seg.href), xCursor, drawY, advanceWidth, segSize);
            }

            xCursor += advanceWidth;
          }
          ty -= lineHeight + lineGapInCell;
        }
      }

      y = rowBottom;
    };

    // Render header (avoid orphan header at page end)
    if (headers.length) {
      const headerSegs = headers.map((cell: any) => toSegments(cell, fontBold, headerSize));
      for (const segs of headerSegs) await prepareInlineMathSegments(segs, headerSize);
      const mh = measureRow(headerSegs, fontBold, headerSize);
      // If there are body rows, ensure header + first row fit; otherwise move to new page first
      if (rows.length) {
        const firstRowSegs = rows[0].map((cell: any) => toSegments(cell, font, cellSize));
        for (const segs of firstRowSegs) await prepareInlineMathSegments(segs, cellSize);
        const firstRowMeasure = measureRow(firstRowSegs, font, cellSize);
        if (y - (mh.rowHeight + firstRowMeasure.rowHeight) <= margin) {
          page = addPage();
          y = pageHeight - margin;
        }
      } else if (y - mh.rowHeight <= margin) {
        page = addPage();
        y = pageHeight - margin;
      }
      renderMeasuredRow(mh, fontBold, headerSize, true);
    }
    // Render body rows with pagination and subtle zebra striping
    for (let rIdx = 0; rIdx < rows.length; rIdx++) {
      const rowSegs = rows[rIdx].map((cell: any) => toSegments(cell, font, cellSize));
      for (const segs of rowSegs) await prepareInlineMathSegments(segs, cellSize);
      const mr = measureRow(rowSegs, font, cellSize);
      const shadedRow = rIdx % 2 === 1; // shade odd rows for subtle zebra
      renderMeasuredRow(mr, font, cellSize, shadedRow);
    }

    // Post-gap handled by caller
  };

  // Parse markdown into tokens
  const tokens: any[] = Lexer.lex(content);
  let orderedCounter = 1;

  for (let idx = 0; idx < tokens.length; idx++) {
    const tk = tokens[idx];
    const nextTk = tokens[idx + 1];
    switch (tk.type) {
      case 'heading': {
        const sizeByLevel = [0, 20, 18, 16, 14, 13, 12];
        const depth = tk.depth ?? tk.level ?? 1;
        const size = sizeByLevel[Math.max(1, Math.min(6, depth))];

        // Keep heading with next block if near page bottom
        const minSpace = nextTk?.type === 'table' ? KEEP_WITH_NEXT_MIN_SPACE_TABLE : KEEP_WITH_NEXT_MIN_SPACE_GENERIC;
        if (y - (SPACE_BEFORE_HEADING + size + minSpace) <= margin) {
          page = addPage();
          y = pageHeight - margin;
        }

        // Consistent pre-gap before heading
        y -= SPACE_BEFORE_HEADING;
        if (y <= margin) {
          page = addPage();
          y = pageHeight - margin;
        }

        if (tk.tokens) {
          const segs = flattenInline(tk.tokens, fontBold, size);
          await drawInlineWrapped(segs, size);
          // normalize post-heading gap to our desired spacing
          if (SPACE_AFTER_HEADING > lineGap) {
            y -= SPACE_AFTER_HEADING - lineGap;
            if (y <= margin) {
              page = addPage();
              y = pageHeight - margin;
            }
          }
        } else {
          drawTextWithFallback(tk.text || '', margin, y, size, fontBold, rgb(0, 0, 0));
          y -= size + SPACE_AFTER_HEADING;
          if (y <= margin) {
            page = addPage();
            y = pageHeight - margin;
          }
        }
        break;
      }
      case 'paragraph': {
        if (tk.tokens) {
          const segs = flattenInline(tk.tokens, font, fontSize);
          await drawInlineWrapped(segs, fontSize);
        } else {
          // Process paragraph text for math blocks before drawing
          const text = tk.text || '';
          const mathSegs = splitMathInline(text, font, fontSize);
          if (mathSegs.length > 1 || (mathSegs.length === 1 && mathSegs[0].center)) {
            // Contains math, use segment rendering
            await drawInlineWrapped(mathSegs, fontSize);
          } else {
            // Plain text, use simple wrapping
            drawWrapped(text, { font, size: fontSize });
          }
        }
        // Consistent gap after paragraph
        y -= SPACE_AFTER_PARAGRAPH;
        break;
      }
      case 'blockquote': {
        drawWrapped(tk.text, { font: fontItalic, size: fontSize, indent: 12 });
        y -= SPACE_AFTER_BLOCKQUOTE;
        break;
      }
      case 'code': {
        // Monospace on a subtle background, without syntax highlighting.
        const padX = 10;
        const padY = 8;
        const codeSize = Math.max(9, fontSize - 1);
        const lineStep = codeSize + 4;
        const contentWidth = maxLineWidth - 2 * padX;

        // Wrap code to contentWidth while preserving characters
        const raw = String(tk.text || '');
        const rawLines = raw.split('\n');
        const wrappedLines: string[] = [];
        for (const ln of rawLines) {
          if (!ln.length) {
            wrappedLines.push('');
            continue;
          }
          let start = 0;
          while (start < ln.length) {
            let end = ln.length;
            while (
              end > start &&
              (() => {
                try {
                  return fontCode.widthOfTextAtSize(ln.slice(start, end), codeSize);
                } catch {
                  return 0;
                }
              })() > contentWidth
            ) {
              end--;
            }
            if (end === start) end = Math.min(start + 1, ln.length);
            wrappedLines.push(ln.slice(start, end));
            start = end;
          }
        }

        // Measure and ensure space (background first)
        const blockHeight = wrappedLines.length * lineStep + 2 * padY;
        if (y - blockHeight <= margin) {
          page = addPage();
          y = pageHeight - margin;
        }
        const rectY = y - blockHeight + padY; // bottom of background
        page.drawRectangle({
          x: margin,
          y: rectY,
          width: maxLineWidth,
          height: blockHeight - padY,
          color: rgb(0.965, 0.97, 0.985),
          borderColor: rgb(0.88, 0.9, 0.94),
          borderWidth: 0.5,
        });

        // Draw wrapped lines - plain text without syntax highlighting for PDF
        let drawY = y - padY - codeSize;
        for (const lineText of wrappedLines) {
          const safeLineText = sanitizeForFont(lineText, fontCode);
          let x = margin + padX;
          const color = rgb(0.2, 0.2, 0.25);

          drawTextWithFallback(safeLineText, x, drawY, codeSize, fontCode, color);
          drawY -= lineStep;
        }

        // Advance past block
        y = rectY - SPACE_AFTER_CODE;
        break;
      }
      case 'list': {
        orderedCounter = tk.ordered ? tk.start || 1 : 1;
        for (const item of tk.items || []) {
          await drawListItem(item, '•', tk.ordered ? orderedCounter : undefined);
          if (tk.ordered) orderedCounter++;
        }
        y -= SPACE_AFTER_LIST;
        break;
      }
      case 'table': {
        // consistent spacing before table
        y -= SPACE_BEFORE_TABLE;
        if (y <= margin) {
          page = addPage();
          y = pageHeight - margin;
        }

        await drawTable(tk);

        // consistent spacing after table
        y -= SPACE_AFTER_TABLE;
        if (y <= margin) {
          page = addPage();
          y = pageHeight - margin;
        }
        break;
      }
      case 'hr': {
        // use a thin rectangle as divider
        const lineY = y - 4;
        page.drawRectangle({ x: margin, y: lineY, width: maxLineWidth, height: 1, color: rgb(0.6, 0.6, 0.6) });
        y = lineY - (fontSize + lineGap);
        if (y <= margin) {
          page = addPage();
          y = pageHeight - margin;
        }
        break;
      }
      default: {
        if (tk.type === 'text') {
          drawWrapped(tk.text, { font, size: fontSize });
        }
        break;
      }
    }
  }

  // The cited links, numbered in citation order.
  const references = citations.references();
  if (references.length > 0) {
    y -= 20;
    // Room for the heading and a first reference.
    if (y <= margin + 100) {
      page = addPage();
      y = pageHeight - margin;
    }

    const refTitleSize = 14;
    drawTextWithFallback('References', margin, y, refTitleSize, fontBold, rgb(0, 0, 0));
    y -= refTitleSize + 16;

    const refSize = fontSize - 1;
    for (const { href, label, num } of references) {
      let hostname = '';
      try {
        hostname = new URL(href).hostname;
      } catch {
        hostname = href.replace(/^https?:\/\/(www\.)?/, '').split('/')[0];
      }
      drawInlineWrappedHanging(
        [
          { text: `[${num}] `, font, size: refSize },
          { text: label, font, size: refSize, href, color: rgb(0.2, 0.4, 0.8) },
          { text: ` (${hostname})`, font, size: refSize - 1, color: rgb(0.3, 0.3, 0.3) },
          { text: '', font, size: refSize, break: true },
        ],
        refSize,
        0,
        20,
      );
    }
  }

  return pdfDoc.save();
}
