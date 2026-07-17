// Cheap sanity check on binary output the model asked us to persist and
// hand back a download link for — catches truncated/corrupted base64
// (dropped chars, inserted whitespace) before we tell the model the upload
// succeeded. Not a full format validator, just magic-byte + size checks.
const ZIP_MAGIC = Buffer.from([0x50, 0x4b]); // .docx/.pptx/.xlsx/.zip are ZIP containers
const PDF_MAGIC = Buffer.from('%PDF');

const ZIP_EXTENSIONS = new Set(['.docx', '.pptx', '.xlsx', '.zip']);

export function validateFileBuffer(buffer: Buffer, filename: string): string | null {
  if (buffer.length === 0) {
    return `${filename} decoded to an empty file — the base64 content was likely missing or malformed.`;
  }

  const ext = filename.slice(filename.lastIndexOf('.')).toLowerCase();

  if (ZIP_EXTENSIONS.has(ext) && !buffer.subarray(0, 2).equals(ZIP_MAGIC)) {
    return `${filename} does not look like a valid ${ext} file (missing ZIP signature) — the base64 content was likely truncated or corrupted. Regenerate the file and try again.`;
  }

  if (ext === '.pdf' && !buffer.subarray(0, 4).equals(PDF_MAGIC)) {
    return `${filename} does not look like a valid PDF (missing %PDF header) — the base64 content was likely truncated or corrupted. Regenerate the file and try again.`;
  }

  return null;
}
