import { NextRequest, NextResponse } from 'next/server';
import { detectModels } from '@/lib/custom-providers';

export async function POST(req: NextRequest) {
  const { baseURL, apiKey } = await req.json();

  if (!baseURL) {
    return NextResponse.json({ error: 'baseURL required' }, { status: 400 });
  }

  try {
    const models = await detectModels(baseURL, apiKey);
    return NextResponse.json({ models });
  } catch (error) {
    return NextResponse.json(
      { error: `Failed to detect models: ${(error as Error).message}` },
      { status: 500 },
    );
  }
}
