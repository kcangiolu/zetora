import 'server-only';

import { serverEnv } from '@/env/server';
import { getCachedUserPreferencesByUserId } from '@/lib/user-data-server';

const DEFAULT_GRAPHITI_URL = serverEnv.GRAPHITI_API_URL || 'http://localhost:8001';

// Resolve the upstream Graphiti URL from the authenticated user's saved
// preferences (never from request headers — a client-controlled target would
// turn callers into an SSRF gateway).
export async function resolveGraphitiBaseUrl(userId: string): Promise<string> {
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
