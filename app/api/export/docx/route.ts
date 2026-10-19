import { NextRequest } from 'next/server';

import { renderMarkdownDocx } from '@/lib/export/docx/render';
import { handleExportRequest } from '@/lib/export/export-request';
import { createLogger } from '@/lib/logger';

const log = createLogger('export-docx');

export async function POST(req: NextRequest) {
  return handleExportRequest(req, {
    render: renderMarkdownDocx,
    contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    filename: 'zetora-export.docx',
    log,
  });
}
