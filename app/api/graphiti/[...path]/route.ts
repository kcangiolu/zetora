import { NextRequest, NextResponse } from 'next/server';
import { serverEnv } from '@/env/server';

const GRAPHITI_API_URL = serverEnv.GRAPHITI_API_URL || 'http://localhost:8000';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const { path } = await params;
  const body = await req.json();

  const res = await fetch(`${GRAPHITI_API_URL}/${path.join('/')}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const { path } = await params;
  const res = await fetch(`${GRAPHITI_API_URL}/${path.join('/')}`);
  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}
