import { getUser } from '@/lib/auth-utils';
import { upsertUserPreferences } from '@/lib/db/queries';
import { clearUserPreferencesCache, getCachedUserPreferencesByUserId } from '@/lib/user-data-server';

// zetora-custom-providers[].apiKey and zetora-graphiti-llm-api-key hold
// third-party API keys. Nothing in the client reads them back from this
// generic endpoint (custom providers come redacted from
// /api/custom-providers; the Graphiti key is set write-only) — strip them so
// they never sit in a browser response body or the settings query cache.
function redactSecretPreferences(record: Record<string, unknown> | null | undefined) {
  if (!record) return record;
  const { 'zetora-graphiti-llm-api-key': _graphitiKey, ...rest } = record;
  if (Array.isArray(rest['zetora-custom-providers'])) {
    rest['zetora-custom-providers'] = (rest['zetora-custom-providers'] as Array<{ apiKey?: unknown }>).map(
      ({ apiKey: _apiKey, ...provider }) => provider,
    );
  }
  return rest;
}

export async function GET() {
  try {
    const user = await getUser();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const record = await getCachedUserPreferencesByUserId(user.id);
    const preferences = record ? { ...record, preferences: redactSecretPreferences(record.preferences) } : record;

    return Response.json(preferences);
  } catch (error) {
    console.error('Failed to fetch user preferences:', error);
    return Response.json({ error: 'Failed to fetch user preferences' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const user = await getUser();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const preferences = body?.preferences;

    if (!preferences || typeof preferences !== 'object' || Array.isArray(preferences)) {
      return Response.json({ error: 'Invalid preferences payload' }, { status: 400 });
    }

    const result = await upsertUserPreferences({
      userId: user.id,
      preferences,
    });

    clearUserPreferencesCache(user.id);

    return Response.json({
      success: true,
      data: { ...result, preferences: redactSecretPreferences(result.preferences) },
    });
  } catch (error) {
    console.error('Failed to save user preferences:', error);
    return Response.json({ error: 'Failed to save user preferences' }, { status: 500 });
  }
}
