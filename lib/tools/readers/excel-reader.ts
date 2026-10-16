import ExcelJS from 'exceljs';
import { FileReader, Document } from '@vectorstores/core';

interface ExcelReaderOptions {
  concatRows?: boolean;
  sheetSpecifier?: number | string;
  fieldSeparator?: string;
  keyValueSeparator?: string;
}

function cellToText(value: ExcelJS.CellValue): string {
  if (value === null || value === undefined) return 'N/A';
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'object') {
    if ('richText' in value && Array.isArray(value.richText)) {
      return value.richText.map((part) => part.text).join('');
    }
    if ('text' in value && typeof value.text === 'string') return value.text;
    if ('result' in value) return cellToText(value.result as ExcelJS.CellValue);
    if ('error' in value) return String(value.error);
  }
  return String(value);
}

// Drop-in replacement for @vectorstores/excel's ExcelReader, which is built
// on the unmaintained `xlsx` package (prototype pollution + ReDoS CVEs with
// no patched npm release). Reads with the actively-maintained `exceljs`
// instead, matching the same output shape: one Document per sheet (or one
// per row when concatRows is false), each row rendered as
// "header<keyValueSeparator>value<fieldSeparator>header<keyValueSeparator>value..."
// with the first row treated as headers and empty cells filled with "N/A" —
// the same defaults @vectorstores/excel got from SheetJS's
// sheet_to_json({ defval: 'N/A' }).
export class ExcelReader extends FileReader {
  private readonly concatRows: boolean;
  private readonly sheetSpecifier?: number | string;
  private readonly fieldSeparator: string;
  private readonly keyValueSeparator: string;

  constructor({
    concatRows = true,
    sheetSpecifier = undefined,
    fieldSeparator = ', ',
    keyValueSeparator = ':',
  }: ExcelReaderOptions = {}) {
    super();
    this.concatRows = concatRows;
    this.sheetSpecifier = sheetSpecifier;
    this.fieldSeparator = fieldSeparator;
    this.keyValueSeparator = keyValueSeparator;
  }

  async loadDataAsContent(fileContent: Uint8Array): Promise<Document[]> {
    const workbook = new ExcelJS.Workbook();
    // exceljs's own .d.ts shadows the global `Buffer` type locally as
    // `interface Buffer extends ArrayBuffer {}` instead of importing Node's
    // real Buffer type, so with the newer resizable-ArrayBuffer members in
    // lib.esnext, a real Buffer (a Uint8Array view, not an ArrayBuffer
    // itself) doesn't satisfy it structurally — an upstream typing bug,
    // not a runtime issue (load() genuinely accepts a Buffer).
    await workbook.xlsx.load(Buffer.from(fileContent) as unknown as Parameters<typeof workbook.xlsx.load>[0]);

    let worksheets = workbook.worksheets;
    if (this.sheetSpecifier !== undefined) {
      const sheet =
        typeof this.sheetSpecifier === 'number'
          ? workbook.worksheets[this.sheetSpecifier]
          : workbook.getWorksheet(this.sheetSpecifier);
      worksheets = sheet ? [sheet] : [];
    }

    const docs: Document[] = [];
    for (const worksheet of worksheets) {
      const headers: string[] = [];
      worksheet.getRow(1).eachCell({ includeEmpty: true }, (cell, colNumber) => {
        headers[colNumber] = cellToText(cell.value);
      });

      const textLines: string[] = [];
      for (let rowNumber = 2; rowNumber <= worksheet.rowCount; rowNumber++) {
        const row = worksheet.getRow(rowNumber);
        if (row.cellCount === 0) continue;

        const parts: string[] = [];
        for (let col = 1; col < headers.length; col++) {
          const header = headers[col];
          if (!header) continue;
          parts.push(`${header}${this.keyValueSeparator}${cellToText(row.getCell(col).value)}`);
        }
        textLines.push(parts.join(this.fieldSeparator));
      }

      if (this.concatRows) {
        docs.push(new Document({ text: textLines.join('\n'), metadata: { sheetName: worksheet.name } }));
      } else {
        for (const text of textLines) {
          docs.push(new Document({ text, metadata: { sheetName: worksheet.name } }));
        }
      }
    }

    return docs;
  }
}
