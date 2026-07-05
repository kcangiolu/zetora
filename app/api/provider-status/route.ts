import { getAvailableProviders, getAvailableCustomProviders } from '@/ai/provider-status';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  const providers = [...getAvailableProviders(), ...getAvailableCustomProviders()];
  return NextResponse.json({ providers });
}
