// Lets sandboxed Python hand back binary output files (docx/pptx/pdf/xlsx/...)
// without the model ever having to read or retype base64 content. The script
// calls zetora_save_file(path) itself; we capture the bytes via a stdout
// marker (same trick docker-provider.ts already uses for matplotlib charts)
// and strip it out before the model sees stdout.
export const FILE_MARKER = '__ZETORA_FILE__:';

const FILE_PRELUDE = `
import base64 as __zetora_b64, json as __zetora_json
__zetora_output_files = []
def zetora_save_file(path, filename=None):
    with open(path, 'rb') as __zetora_fh:
        __zetora_data = __zetora_fh.read()
    __zetora_output_files.append({
        'filename': filename or path.rsplit('/', 1)[-1],
        'content': __zetora_b64.b64encode(__zetora_data).decode(),
    })
    return path
`.trim();

const FILE_FOOTER = `
if __zetora_output_files:
    print('${FILE_MARKER}' + __zetora_json.dumps(__zetora_output_files))
`.trim();

export function wrapCodeForFileCapture(code: string): string {
  return `${FILE_PRELUDE}\n\n${code}\n\n${FILE_FOOTER}`;
}

export interface CapturedFile {
  filename: string;
  content: string;
}

export function parseFileMarker(stdout: string): { stdout: string; files?: CapturedFile[] } {
  if (!stdout.includes(FILE_MARKER)) {
    return { stdout };
  }

  const markerIdx = stdout.indexOf(FILE_MARKER);
  const cleanStdout = stdout.substring(0, markerIdx).trim();
  const filesJson = stdout.substring(markerIdx + FILE_MARKER.length).trim();

  try {
    const files: CapturedFile[] = JSON.parse(filesJson);
    return { stdout: cleanStdout, files: files.length > 0 ? files : undefined };
  } catch {
    return { stdout: cleanStdout };
  }
}
