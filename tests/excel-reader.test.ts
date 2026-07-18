import { describe, it, expect } from 'vitest';
import ExcelJS from 'exceljs';
import { ExcelReader } from '@/lib/tools/readers/excel-reader';

async function buildWorkbookBytes(rows: (string | number)[][], sheetName = 'Sheet1'): Promise<Uint8Array> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet(sheetName);
  for (const row of rows) sheet.addRow(row);
  const buffer = await workbook.xlsx.writeBuffer();
  return new Uint8Array(buffer);
}

describe('ExcelReader', () => {
  it('concatenates rows into one Document per sheet, using the first row as headers', async () => {
    const bytes = await buildWorkbookBytes([
      ['Name', 'Age'],
      ['Alice', 30],
      ['Bob', 25],
    ]);

    const reader = new ExcelReader({ sheetSpecifier: 0, concatRows: true, fieldSeparator: ',', keyValueSeparator: ':' });
    const docs = await reader.loadDataAsContent(bytes);

    expect(docs).toHaveLength(1);
    expect(docs[0].metadata).toEqual({ sheetName: 'Sheet1' });
    expect(docs[0].text).toBe('Name:Alice,Age:30\nName:Bob,Age:25');
  });

  it('fills missing cells with N/A, matching sheet_to_json({ defval: "N/A" })', async () => {
    const bytes = await buildWorkbookBytes([
      ['Name', 'Age'],
      ['Alice', undefined as unknown as string],
    ]);

    const reader = new ExcelReader({ sheetSpecifier: 0, concatRows: true, fieldSeparator: ',', keyValueSeparator: ':' });
    const docs = await reader.loadDataAsContent(bytes);

    expect(docs[0].text).toBe('Name:Alice,Age:N/A');
  });

  it('emits one Document per row when concatRows is false', async () => {
    const bytes = await buildWorkbookBytes([
      ['Name', 'Age'],
      ['Alice', 30],
      ['Bob', 25],
    ]);

    const reader = new ExcelReader({ sheetSpecifier: 0, concatRows: false, fieldSeparator: ',', keyValueSeparator: ':' });
    const docs = await reader.loadDataAsContent(bytes);

    expect(docs).toHaveLength(2);
    expect(docs[0].text).toBe('Name:Alice,Age:30');
    expect(docs[1].text).toBe('Name:Bob,Age:25');
  });

  it('only reads the sheet selected by numeric sheetSpecifier', async () => {
    const workbook = new ExcelJS.Workbook();
    workbook.addWorksheet('First').addRow(['A']);
    workbook.getWorksheet('First')!.addRow(['1']);
    workbook.addWorksheet('Second').addRow(['B']);
    workbook.getWorksheet('Second')!.addRow(['2']);
    const bytes = new Uint8Array(await workbook.xlsx.writeBuffer());

    const reader = new ExcelReader({ sheetSpecifier: 1, concatRows: true, fieldSeparator: ',', keyValueSeparator: ':' });
    const docs = await reader.loadDataAsContent(bytes);

    expect(docs).toHaveLength(1);
    expect(docs[0].metadata).toEqual({ sheetName: 'Second' });
    expect(docs[0].text).toBe('B:2');
  });
});
