import { NextRequest, NextResponse } from 'next/server';
import { serverEnv } from '@/env/server';
import { getUser } from '@/lib/auth-utils';
import { getCachedUserPreferencesByUserId } from '@/lib/user-data-server';

const DEFAULT_GRAPHITI_URL = serverEnv.GRAPHITI_API_URL || 'http://localhost:8001';

// Resolve the upstream Graphiti URL from the authenticated user's saved
// preferences (never from request headers — a client-controlled target would
// turn this proxy into an SSRF gateway).
async function resolveBaseUrl(userId: string): Promise<string> {
  try {
    const prefs = await getCachedUserPreferencesByUserId(userId);
    const custom = prefs?.preferences?.['zetora-graphiti-api-url'];
    if (typeof custom === 'string' && custom) {
      const parsed = new URL(custom);
      if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
        return custom.replace(/\/$/, '');
      }
    }
  } catch {
    // Invalid preference value — fall back to the configured default.
  }
  return DEFAULT_GRAPHITI_URL;
}

async function parseResponse(res: Response): Promise<{ data: unknown; status: number }> {
  const text = await res.text();
  if (!text) {
    return { data: null, status: res.status };
  }
  try {
    return { data: JSON.parse(text), status: res.status };
  } catch {
    return { data: { error: text }, status: res.status };
  }
}

async function requireUser() {
  const user = await getUser().catch(() => null);
  if (!user) {
    return { user: null, response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  }
  return { user, response: null };
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const { user, response } = await requireUser();
  if (!user) return response;

  const { path } = await params;
  const baseUrl = await resolveBaseUrl(user.id);
  const body = await req.json();

  const res = await fetch(`${baseUrl}/${path.join('/')}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  const { data, status } = await parseResponse(res);
  return NextResponse.json(data, { status });
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const { user, response } = await requireUser();
  if (!user) return response;

  const { path } = await params;
  const baseUrl = await resolveBaseUrl(user.id);
  const url = new URL(req.url);
  const targetUrl = `${baseUrl}/${path.join('/')}${url.search}`;
  const res = await fetch(targetUrl);
  const { data, status } = await parseResponse(res);
  return NextResponse.json(data, { status });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const { user, response } = await requireUser();
  if (!user) return response;

  const { path } = await params;
  const baseUrl = await resolveBaseUrl(user.id);
  const contentType = req.headers.get('content-type') || '';
  const hasBody = contentType.includes('application/json');
  const body = hasBody ? await req.json() : undefined;

  const res = await fetch(`${baseUrl}/${path.join('/')}`, {
    method: 'DELETE',
    headers: hasBody ? { 'Content-Type': 'application/json' } : {},
    ...(body !== undefined && { body: JSON.stringify(body) }),
  });

  const { data, status } = await parseResponse(res);
  return NextResponse.json(data, { status });
}
