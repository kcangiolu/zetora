import { withAuth } from '@/lib/api/route-handlers';
import { upsertUserPreferences } from '@/lib/db/queries';
import { clearUserPreferencesCache, getCachedUserPreferencesByUserId } from '@/lib/user-data-server';

// zetora-custom-providers[].apiKey holds third-party API keys. Nothing in the
// client reads them back from this generic endpoint (custom providers come
// redacted from /api/custom-providers) — strip them so they never sit in a
// browser response body or the settings query cache.
function redactSecretPreferences(record: Record<string, unknown> | null | undefined) {
  if (!record) return record;
  const rest = { ...record };
  if (Array.isArray(rest['zetora-custom-providers'])) {
    rest['zetora-custom-providers'] = (rest['zetora-custom-providers'] as Array<{ apiKey?: unknown }>).map(
      ({ apiKey: _apiKey, ...provider }) => provider,
    );
  }
  return rest;
}

export const GET = withAuth(async (_req, { user }) => {
  const record = await getCachedUserPreferencesByUserId(user.id);
  const preferences = record ? { ...record, preferences: redactSecretPreferences(record.preferences) } : record;

  return Response.json(preferences);
});

export const POST = withAuth(async (request, { user }) => {
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
});
