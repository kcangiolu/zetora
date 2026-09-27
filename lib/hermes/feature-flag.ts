import { NextResponse } from 'next/server';
import { isHermesEnabled } from './enabled';

// Re-exported so the dozen server-side callers keep a single import site; the function
// itself lives in ./enabled so client components can reach it without next/server.
export { isHermesEnabled };

// Every Hermes route (public and internal) calls this first, so a disabled deployment
// behaves as if the feature doesn't exist — not just hidden in the UI. The
// hermes-relay-service container itself is additionally gated by the `hermes` Docker
// Compose profile (docker-compose.yml), so on a disabled deployment nothing ever calls
// the internal routes in the first place; this is the defense-in-depth backstop.
export function assertHermesEnabled(): NextResponse | null {
  if (isHermesEnabled()) return null;
  return NextResponse.json({ error: 'Hermes is not enabled on this deployment' }, { status: 404 });
}
