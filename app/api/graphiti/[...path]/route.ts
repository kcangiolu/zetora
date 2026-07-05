import { NextRequest, NextResponse } from 'next/server';
import { getUser } from '@/lib/auth-utils';
import { resolveGraphitiBaseUrl as resolveBaseUrl } from '@/lib/graphiti/config';

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
