import { NextRequest, NextResponse } from 'next/server';
import { getUser } from '@/lib/auth-utils';
import { getCustomProviders, saveCustomProviders } from '@/lib/custom-providers';

export async function GET() {
  try {
    const user = await getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const providers = await getCustomProviders();
    return NextResponse.json({ providers });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to fetch providers' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const { providers } = await req.json();
    if (!Array.isArray(providers)) {
      return NextResponse.json({ error: 'providers must be an array' }, { status: 400 });
    }
    await saveCustomProviders(providers);
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to save providers' }, { status: 500 });
  }
}
