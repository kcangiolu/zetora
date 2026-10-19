import { Lexer } from 'marked';
import {
  BorderStyle,
  Document,
  ExternalHyperlink,
  HeadingLevel,
  IStylesOptions,
  Packer,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
  convertInchesToTwip,
} from 'docx';
import { CitationRegistry } from '@/lib/export/citations';
import type { ExportRequest } from '@/lib/export/export-request';
import { flattenInlineTokens, processInlineText } from './inline';
import { preprocessMarkdown } from './preprocess';

// Arial throughout, with the link style the hyperlinks use.
const styles: IStylesOptions = {
  default: {
    document: {
      run: {
        font: 'Arial',
        size: 24, // 12pt
      },
    },
    heading1: {
      run: {
        font: 'Arial',
        size: 32, // 16pt
        bold: true,
      },
      paragraph: {
        spacing: { before: 240, after: 120 },
      },
    },
    heading2: {
      run: {
        font: 'Arial',
        size: 28, // 14pt
        bold: true,
      },
      paragraph: {
        spacing: { before: 200, after: 100 },
      },
    },
    heading3: {
      run: {
        font: 'Arial',
        size: 26, // 13pt
        bold: true,
      },
      paragraph: {
        spacing: { before: 160, after: 80 },
      },
    },
  },
  characterStyles: [
    {
      id: 'Hyperlink',
      name: 'Hyperlink',
      basedOn: 'DefaultParagraphFont',
      run: {
        color: '2563EB',
        underline: { type: 'single' },
      },
    },
  ],
};

// The answer as a Word document: title, model and date, the Markdown body, then the
// cited links as References.
export async function renderMarkdownDocx({
  title,
  content: rawContent,
  meta = {},
}: ExportRequest): Promise<Uint8Array> {
  title = title ?? 'Zetora AI';
  // Preprocess markdown
  const content = preprocessMarkdown(rawContent);

  const citations = new CitationRegistry();

  // Parse markdown into tokens
  const tokens: any[] = Lexer.lex(content);
  const children: (Paragraph | Table)[] = [];

  // Add title
  children.push(
    new Paragraph({
      children: [new TextRun({ text: title, bold: true, size: 32 })], // 16pt
      heading: HeadingLevel.TITLE,
      spacing: { after: 200 },
    }),
  );

  // Add metadata
  const metaLines: string[] = [];
  if (meta.modelLabel) metaLines.push(`Model: ${meta.modelLabel}`);
  if (meta.createdAt) metaLines.push(`Date: ${new Date(meta.createdAt).toLocaleString()}`);

  if (metaLines.length) {
    children.push(
      new Paragraph({
        children: [new TextRun({ text: metaLines.join(' • '), color: '666666', size: 20 })], // 10pt
        spacing: { after: 400 },
      }),
    );
  }

  // Add separator line
  children.push(
    new Paragraph({
      border: {
        bottom: { style: BorderStyle.SINGLE, size: 6, color: 'CCCCCC' },
      },
      spacing: { after: 400 },
    }),
  );

  // Process markdown tokens
  for (const tk of tokens) {
    switch (tk.type) {
      case 'heading': {
        const depth = tk.depth ?? tk.level ?? 1;
        const headingLevels: Record<number, (typeof HeadingLevel)[keyof typeof HeadingLevel]> = {
          1: HeadingLevel.HEADING_1,
          2: HeadingLevel.HEADING_2,
          3: HeadingLevel.HEADING_3,
          4: HeadingLevel.HEADING_4,
          5: HeadingLevel.HEADING_5,
          6: HeadingLevel.HEADING_6,
        };
        const level = headingLevels[Math.max(1, Math.min(6, depth))] || HeadingLevel.HEADING_1;

        const inlineRuns = tk.tokens
          ? flattenInlineTokens(tk.tokens, true)
          : [new TextRun({ text: tk.text || '', bold: true })];

        children.push(
          new Paragraph({
            children: inlineRuns,
            heading: level,
            spacing: { before: 240, after: 120 },
          }),
        );
        break;
      }

      case 'paragraph': {
        const inlineRuns = tk.tokens ? flattenInlineTokens(tk.tokens) : processInlineText(tk.text || '');

        // Extract links for citations
        if (tk.tokens) {
          for (const t of tk.tokens) {
            if (t.type === 'link' && t.href) {
              citations.cite(t.href, t.text ?? '');
            }
          }
        }

        children.push(
          new Paragraph({
            children: inlineRuns,
            spacing: { after: 200 },
          }),
        );
        break;
      }

      case 'blockquote': {
        const text = tk.text || '';
        children.push(
          new Paragraph({
            children: [new TextRun({ text, italics: true, color: '666666' })],
            indent: { left: convertInchesToTwip(0.5) },
            border: {
              left: { style: BorderStyle.SINGLE, size: 24, color: 'CCCCCC' },
            },
            spacing: { after: 200 },
          }),
        );
        break;
      }

      case 'code': {
        const codeText = String(tk.text || '');
        const codeLines = codeText.split('\n');

        for (const line of codeLines) {
          children.push(
            new Paragraph({
              children: [
                new TextRun({
                  text: line || ' ',
                  font: 'Consolas',
                  size: 18, // 9pt
                }),
              ],
              shading: { type: ShadingType.CLEAR, fill: 'F5F5F5' },
              indent: { left: convertInchesToTwip(0.25), right: convertInchesToTwip(0.25) },
              spacing: {
                before: line === codeLines[0] ? 100 : 0,
                after: line === codeLines[codeLines.length - 1] ? 100 : 0,
              },
            }),
          );
        }

        children.push(new Paragraph({ spacing: { after: 200 } }));
        break;
      }

      case 'list': {
        const isOrdered = tk.ordered;
        let counter = tk.start || 1;

        for (const item of tk.items || []) {
          const bulletText = isOrdered ? `${counter}.` : '•';

          // Get inline runs from the list item
          let inlineRuns: (TextRun | ExternalHyperlink)[] = [];

          if (item.tokens && item.tokens.length > 0) {
            // Process each token in the item
            for (const itemToken of item.tokens) {
              if (itemToken.type === 'text') {
                // Parse the text for inline markdown
                const inlineTokens = Lexer.lexInline(itemToken.text || '');
                inlineRuns.push(...flattenInlineTokens(inlineTokens));
              } else if (itemToken.type === 'paragraph' && itemToken.tokens) {
                inlineRuns.push(...flattenInlineTokens(itemToken.tokens));
              } else if (itemToken.tokens) {
                inlineRuns.push(...flattenInlineTokens(itemToken.tokens));
              } else {
                inlineRuns.push(...flattenInlineTokens([itemToken]));
              }
            }
          } else if (item.text) {
            // Fallback: parse the raw text for inline markdown
            const inlineTokens = Lexer.lexInline(item.text);
            inlineRuns.push(...flattenInlineTokens(inlineTokens));
          }

          children.push(
            new Paragraph({
              children: [new TextRun({ text: `${bulletText} ` }), ...inlineRuns],
              indent: { left: convertInchesToTwip(0.5), hanging: convertInchesToTwip(0.25) },
              spacing: { after: 80 },
            }),
          );

          if (isOrdered) counter++;
        }

        children.push(new Paragraph({ spacing: { after: 120 } }));
        break;
      }

      case 'table': {
        const headers = Array.isArray(tk.header) ? tk.header : [];
        const rows = Array.isArray(tk.rows) ? tk.rows : [];
        const nCols = Math.max(headers.length, rows[0]?.length || 0);

        if (nCols === 0) break;

        const colWidth = Math.floor(9360 / nCols); // US Letter content width in DXA
        const columnWidths = Array(nCols).fill(colWidth);

        const border = { style: BorderStyle.SINGLE, size: 1, color: 'CCCCCC' };
        const borders = { top: border, bottom: border, left: border, right: border };

        const tableRows: TableRow[] = [];

        // Header row
        if (headers.length) {
          tableRows.push(
            new TableRow({
              children: headers.map((cell: any, i: number) => {
                const cellText = typeof cell === 'string' ? cell : String(cell?.text ?? cell?.raw ?? '');
                return new TableCell({
                  borders,
                  width: { size: columnWidths[i], type: WidthType.DXA },
                  shading: { fill: 'E8E8F0', type: ShadingType.CLEAR },
                  margins: { top: 80, bottom: 80, left: 120, right: 120 },
                  children: [
                    new Paragraph({
                      children: [new TextRun({ text: cellText, bold: true })],
                    }),
                  ],
                });
              }),
            }),
          );
        }

        // Body rows
        for (const row of rows) {
          tableRows.push(
            new TableRow({
              children: (row as any[]).map((cell: any, i: number) => {
                const cellTokens = cell?.tokens;
                const inlineRuns = cellTokens
                  ? flattenInlineTokens(cellTokens)
                  : processInlineText(typeof cell === 'string' ? cell : String(cell?.text ?? cell?.raw ?? ''));

                return new TableCell({
                  borders,
                  width: { size: columnWidths[i], type: WidthType.DXA },
                  margins: { top: 80, bottom: 80, left: 120, right: 120 },
                  children: [new Paragraph({ children: inlineRuns })],
                });
              }),
            }),
          );
        }

        children.push(
          new Table({
            width: { size: 9360, type: WidthType.DXA },
            columnWidths,
            rows: tableRows,
          }),
        );

        children.push(new Paragraph({ spacing: { after: 300 } }));
        break;
      }

      case 'hr': {
        children.push(
          new Paragraph({
            border: {
              bottom: { style: BorderStyle.SINGLE, size: 6, color: '999999' },
            },
            spacing: { before: 200, after: 200 },
          }),
        );
        break;
      }

      default: {
        if (tk.type === 'text' && tk.text) {
          children.push(
            new Paragraph({
              children: processInlineText(tk.text),
              spacing: { after: 200 },
            }),
          );
        }
        break;
      }
    }
  }

  // Add References section
  const references = citations.references();
  if (references.length > 0) {
    children.push(new Paragraph({ spacing: { after: 400 } }));

    children.push(
      new Paragraph({
        children: [new TextRun({ text: 'References', bold: true, size: 28 })], // 14pt
        heading: HeadingLevel.HEADING_2,
        spacing: { before: 400, after: 200 },
      }),
    );

    for (const { href, label, num } of references) {
      let hostname = '';
      try {
        hostname = new URL(String(href)).hostname;
      } catch {
        hostname = String(href)
          .replace(/^https?:\/\/(www\.)?/, '')
          .split('/')[0];
      }

      children.push(
        new Paragraph({
          children: [
            new TextRun({ text: `[${num}] `, size: 20 }),
            new ExternalHyperlink({
              children: [new TextRun({ text: label, style: 'Hyperlink', size: 20 })],
              link: href,
            }),
            new TextRun({ text: ` (${hostname})`, color: '666666', size: 18 }),
          ],
          spacing: { after: 80 },
        }),
      );
    }
  }

  // Create document
  const doc = new Document({
    styles,
    sections: [
      {
        properties: {
          page: {
            size: {
              width: 12240, // 8.5 inches in DXA
              height: 15840, // 11 inches in DXA
            },
            margin: {
              top: 1440, // 1 inch
              right: 1440,
              bottom: 1440,
              left: 1440,
            },
          },
        },
        children,
      },
    ],
  });

  return new Uint8Array(await Packer.toBuffer(doc));
}
