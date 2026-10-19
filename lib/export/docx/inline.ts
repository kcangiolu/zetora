import { ExternalHyperlink, ShadingType, TextRun } from 'docx';
import { latexToText } from './preprocess';

// Process inline text and return TextRun children
export function processInlineText(text: string, bold = false, italic = false): (TextRun | ExternalHyperlink)[] {
  const runs: (TextRun | ExternalHyperlink)[] = [];

  // Process display math blocks \[...\] first
  let processed = text.replace(/\\\[([\s\S]*?)\\\]/g, (_m, latex) => latexToText(latex));

  // Process display math blocks $$...$$
  processed = processed.replace(/\$\$([\s\S]*?)\$\$/g, (_m, latex) => latexToText(latex));

  // Process inline math ($...$)
  processed = processed.replace(/\$([^$]+)\$/g, (_m, latex) => latexToText(latex));

  // Process inline math \(...\)
  processed = processed.replace(/\\\(([^\)]+)\\\)/g, (_m, latex) => latexToText(latex));

  // Process markdown links [text](url)
  const linkRegex = /\[([^\]]+)\]\(([^)]+)\)/g;
  let lastIndex = 0;
  let match;

  while ((match = linkRegex.exec(processed)) !== null) {
    // Add text before the link
    if (match.index > lastIndex) {
      const beforeText = processed.slice(lastIndex, match.index);
      if (beforeText) {
        runs.push(new TextRun({ text: beforeText, bold, italics: italic }));
      }
    }

    // Add the hyperlink
    const linkText = match[1];
    const linkUrl = match[2];
    runs.push(
      new ExternalHyperlink({
        children: [
          new TextRun({
            text: linkText,
            style: 'Hyperlink',
            bold,
            italics: italic,
          }),
        ],
        link: linkUrl,
      }),
    );

    lastIndex = match.index + match[0].length;
  }

  // Add remaining text after last link
  if (lastIndex < processed.length) {
    const remainingText = processed.slice(lastIndex);
    if (remainingText) {
      runs.push(new TextRun({ text: remainingText, bold, italics: italic }));
    }
  }

  // If no links were found, just add the whole text
  if (runs.length === 0 && processed) {
    runs.push(new TextRun({ text: processed, bold, italics: italic }));
  }

  return runs;
}

// Flatten inline tokens to TextRun children
export function flattenInlineTokens(
  tokens: any[] | undefined,
  bold = false,
  italic = false,
): (TextRun | ExternalHyperlink)[] {
  if (!tokens || !Array.isArray(tokens)) return [];
  const runs: (TextRun | ExternalHyperlink)[] = [];

  for (const t of tokens) {
    switch (t.type) {
      case 'text': {
        const txt = String(t.text ?? t.raw ?? '').replace(/\r?\n/g, ' ');
        if (txt) runs.push(...processInlineText(txt, bold, italic));
        break;
      }
      case 'strong': {
        const inner = t.tokens ?? [{ type: 'text', text: t.text }];
        runs.push(...flattenInlineTokens(inner, true, italic));
        break;
      }
      case 'em': {
        const inner = t.tokens ?? [{ type: 'text', text: t.text }];
        runs.push(...flattenInlineTokens(inner, bold, true));
        break;
      }
      case 'codespan': {
        const txt = String(t.text ?? '');
        if (txt) {
          runs.push(
            new TextRun({
              text: txt,
              font: 'Consolas',
              size: 20, // 10pt
              shading: { type: ShadingType.CLEAR, fill: 'F0F0F0' },
            }),
          );
        }
        break;
      }
      case 'link': {
        const linkText = String(t.text ?? t.href ?? t.raw ?? '');
        const href = String(t.href ?? '');
        if (linkText && href) {
          runs.push(
            new ExternalHyperlink({
              children: [
                new TextRun({
                  text: linkText,
                  style: 'Hyperlink',
                  bold,
                  italics: italic,
                }),
              ],
              link: href,
            }),
          );
        }
        break;
      }
      case 'escape': {
        const txt = String(t.text ?? '').trim() || String(t.raw ?? '').replace(/^\\/, '');
        if (txt) runs.push(new TextRun({ text: txt, bold, italics: italic }));
        break;
      }
      case 'space':
      case 'br': {
        runs.push(new TextRun({ text: ' ', bold, italics: italic }));
        break;
      }
      case 'paragraph': {
        // Recursively process paragraph's inner tokens
        const inner = t.tokens ?? [{ type: 'text', text: t.text }];
        runs.push(...flattenInlineTokens(inner, bold, italic));
        break;
      }
      case 'list_item': {
        // Handle list item tokens
        const inner = t.tokens ?? [{ type: 'text', text: t.text }];
        runs.push(...flattenInlineTokens(inner, bold, italic));
        break;
      }
      default: {
        const txt = String(t.text ?? t.raw ?? '').replace(/\r?\n/g, ' ');
        if (txt) runs.push(...processInlineText(txt, bold, italic));
        break;
      }
    }
  }

  return runs;
}
