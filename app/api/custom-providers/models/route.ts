import { NextResponse } from 'next/server';
import { getUser } from '@/lib/auth-utils';
import { getCustomModels } from '@/lib/custom-providers';

export async function GET() {
  try {
    const user = await getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const customModels = await getCustomModels();
    const models = customModels.map((m) => ({
      value: m.id,
      label: m.label,
      description: `Custom model via ${m.providerId}`,
      vision: false,
      reasoning: false,
      experimental: false,
      category: 'Free',
      pdf: false,
      pro: false,
      requiresAuth: false,
      freeUnlimited: true,
      maxOutputTokens: 16000,
      provider: 'custom',
      isNew: true,
    }));

    return NextResponse.json({ models });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to fetch custom models' }, { status: 500 });
  }
}
