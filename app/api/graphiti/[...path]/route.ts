import { NextRequest, NextResponse } from 'next/server';
import { serverEnv } from '@/env/server';

const DEFAULT_GRAPHITI_URL = serverEnv.GRAPHITI_API_URL || 'http://localhost:8000';

function resolveBaseUrl(req: NextRequest): string {
  return req.headers.get('X-Graphiti-Url') || DEFAULT_GRAPHITI_URL;
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

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const { path } = await params;
  const baseUrl = resolveBaseUrl(req);
  const body = await req.json();

  const res = await fetch(`${baseUrl}/${path.join('/')}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  const { data, status } = await parseResponse(res);
  return NextResponse.json(data, { status });
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const { path } = await params;
  const baseUrl = resolveBaseUrl(req);
  const url = new URL(req.url);
  const targetUrl = `${baseUrl}/${path.join('/')}${url.search}`;
  const res = await fetch(targetUrl);
  const { data, status } = await parseResponse(res);
  return NextResponse.json(data, { status });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const { path } = await params;
  const baseUrl = resolveBaseUrl(req);
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
