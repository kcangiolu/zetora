import { NextResponse } from 'next/server';

// The one master switch for the whole Hermes Agent relay channel — separate from, and
// upstream of, per-user connector enrollment (Settings > Hermes) and the
// HERMES_RELAY_PUBLIC_URL "is the relay actually configured on this deployment" check.
// NEXT_PUBLIC_HERMES_ENABLED is a client-bundle-inlined build arg (see Dockerfile,
// .gitea/workflows/docker.yml), not a runtime .env value — flipping it requires a
// rebuild, same as NEXT_PUBLIC_MCP_ENABLED/NEXT_PUBLIC_CANVAS_ENABLED. Defaults to
// enabled (unlike those two, which default off): this feature already ships to real
// users, so an unset build-arg must not silently regress an existing deployment.
export function isHermesEnabled(): boolean {
  return process.env.NEXT_PUBLIC_HERMES_ENABLED !== 'false';
}

// Every Hermes route (public and internal) calls this first, so a disabled deployment
// behaves as if the feature doesn't exist — not just hidden in the UI. The
// hermes-relay-service container itself is additionally gated by the `hermes` Docker
// Compose profile (docker-compose.yml), so on a disabled deployment nothing ever calls
// the internal routes in the first place; this is the defense-in-depth backstop.
export function assertHermesEnabled(): NextResponse | null {
  if (isHermesEnabled()) return null;
  return NextResponse.json({ error: 'Hermes is not enabled on this deployment' }, { status: 404 });
}
