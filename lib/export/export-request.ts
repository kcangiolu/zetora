import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { getUser } from '@/lib/auth-utils';
import type { createLogger } from '@/lib/logger';
import { exportRateLimit, getClientIdentifier } from '@/lib/rate-limit';

const exportRequestSchema = z.object({
  title: z.string().nullish(),
  content: z.string().refine((content) => content.trim().length > 0, 'Empty content'),
  meta: z
    .object({
      modelLabel: z.string().nullish(),
      createdAt: z.union([z.string(), z.number()]).optional(),
    })
    .optional(),
});

export type ExportRequest = z.infer<typeof exportRequestSchema>;

// The PDF and Word export routes: rate limit, validate, render, send as a download.
// No session is required (shared chats can be exported by anonymous visitors), so the
// limit is per account, or per IP for anonymous visitors.
export async function handleExportRequest(
  req: NextRequest,
  {
    render,
    contentType,
    filename,
    log,
  }: {
    render: (request: ExportRequest) => Promise<Uint8Array>;
    contentType: string;
    filename: string;
    log: ReturnType<typeof createLogger>;
  },
): Promise<Response> {
  try {
    const user = await getUser();
    const rateLimitResult = await exportRateLimit.limit(getClientIdentifier(req, user?.id));
    if (!rateLimitResult.success) {
      return NextResponse.json({ error: 'Too many requests. Please try again later.' }, { status: 429 });
    }

    const parsed = exportRequestSchema.safeParse(await req.json());
    if (!parsed.success) return NextResponse.json({ error: 'Invalid content' }, { status: 400 });

    const bytes = await render(parsed.data);
    return new Response(new Uint8Array(bytes), {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'no-store, no-cache, must-revalidate',
        Pragma: 'no-cache',
      },
    });
  } catch (e: any) {
    log.error(`${filename} export error:`, e);
    return NextResponse.json({ error: e?.message || `Failed to generate ${filename}` }, { status: 500 });
  }
}
