import { NextRequest } from 'next/server';

import { handleExportRequest } from '@/lib/export/export-request';
import { renderMarkdownPdf } from '@/lib/export/pdf/render';
import { createLogger } from '@/lib/logger';

const log = createLogger('export-pdf');

// MathJax and sharp make this CPU-heavy: handleExportRequest rate-limits it.
export async function POST(req: NextRequest) {
  return handleExportRequest(req, {
    render: renderMarkdownPdf,
    contentType: 'application/pdf',
    filename: 'zetora-export.pdf',
    log,
  });
}
