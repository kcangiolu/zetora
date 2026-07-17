import { describe, it, expect } from 'vitest';
import { wrapCodeForFileCapture, parseFileMarker, FILE_MARKER } from '@/lib/sandbox/file-capture';
import { validateFileBuffer } from '@/lib/file-integrity';

describe('wrapCodeForFileCapture', () => {
  it('defines zetora_save_file before the user code and prints the marker after it', () => {
    const wrapped = wrapCodeForFileCapture("print('hello')");
    const defIndex = wrapped.indexOf('def zetora_save_file');
    const codeIndex = wrapped.indexOf("print('hello')");
    const footerIndex = wrapped.indexOf(`print('${FILE_MARKER}'`);

    expect(defIndex).toBeGreaterThanOrEqual(0);
    expect(defIndex).toBeLessThan(codeIndex);
    expect(codeIndex).toBeLessThan(footerIndex);
  });
});

describe('parseFileMarker', () => {
  it('returns stdout unchanged when no marker is present', () => {
    const result = parseFileMarker('just some output\n42');
    expect(result.stdout).toBe('just some output\n42');
    expect(result.files).toBeUndefined();
  });

  it('extracts files and strips the marker from stdout', () => {
    const files = [{ filename: 'report.docx', content: 'UEsDBBQ=' }];
    const stdout = `Building document...\n${FILE_MARKER}${JSON.stringify(files)}`;

    const result = parseFileMarker(stdout);

    expect(result.stdout).toBe('Building document...');
    expect(result.files).toEqual(files);
  });

  it('never hands raw base64 back as something the model must retype', () => {
    // Regression guard for the original bug: the model previously had to
    // copy this base64 blob itself into a separate tool call. Any fix must
    // keep it strictly inside the parsed `files` array.
    const files = [{ filename: 'report.pdf', content: 'JVBERi0xLjQK'.repeat(500) }];
    const stdout = `${FILE_MARKER}${JSON.stringify(files)}`;

    const result = parseFileMarker(stdout);

    expect(result.stdout).toBe('');
    expect(result.files?.[0]?.content).toHaveLength('JVBERi0xLjQK'.repeat(500).length);
  });

  it('falls back gracefully on malformed marker payload', () => {
    const result = parseFileMarker(`done\n${FILE_MARKER}not-json`);
    expect(result.stdout).toBe('done');
    expect(result.files).toBeUndefined();
  });
});

describe('validateFileBuffer', () => {
  it('rejects an empty buffer', () => {
    const error = validateFileBuffer(Buffer.alloc(0), 'report.docx');
    expect(error).toMatch(/empty file/);
  });

  it('rejects a docx/pptx/xlsx/zip buffer missing the ZIP signature', () => {
    const corrupted = Buffer.from('this is not a zip file');
    expect(validateFileBuffer(corrupted, 'report.docx')).toMatch(/does not look like a valid/);
    expect(validateFileBuffer(corrupted, 'slides.pptx')).toMatch(/does not look like a valid/);
    expect(validateFileBuffer(corrupted, 'data.xlsx')).toMatch(/does not look like a valid/);
  });

  it('accepts a buffer with a valid ZIP signature', () => {
    const zipLike = Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), Buffer.from('rest of file')]);
    expect(validateFileBuffer(zipLike, 'report.docx')).toBeNull();
  });

  it('rejects a PDF buffer missing the %PDF header', () => {
    const corrupted = Buffer.from('not a pdf');
    expect(validateFileBuffer(corrupted, 'report.pdf')).toMatch(/does not look like a valid PDF/);
  });

  it('accepts a buffer with a valid PDF header', () => {
    const pdfLike = Buffer.concat([Buffer.from('%PDF-1.4\n'), Buffer.from('rest of file')]);
    expect(validateFileBuffer(pdfLike, 'report.pdf')).toBeNull();
  });

  it('does not magic-byte-check unrelated extensions', () => {
    expect(validateFileBuffer(Buffer.from('id,value\n1,2'), 'data.csv')).toBeNull();
  });
});
