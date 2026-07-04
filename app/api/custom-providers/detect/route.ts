import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getUser } from '@/lib/auth-utils';
import { detectModels } from '@/lib/custom-providers';

// Fetches an arbitrary user-supplied baseURL server-side, so require a
// session to keep it from being used as an unauthenticated SSRF probe.
const DetectSchema = z.object({
  baseURL: z.string().url(),
  apiKey: z.string().optional(),
});

export async function POST(req: NextRequest) {
  const user = await getUser().catch(() => null);
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const parsed = DetectSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'baseURL must be a valid URL' }, { status: 400 });
  }

  try {
    const models = await detectModels(parsed.data.baseURL, parsed.data.apiKey);
    return NextResponse.json({ models });
  } catch (error) {
    return NextResponse.json({ error: `Failed to detect models: ${(error as Error).message}` }, { status: 500 });
  }
}
