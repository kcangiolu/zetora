// The one master switch for the whole Hermes Agent relay channel — separate from, and
// upstream of, per-user connector enrollment (Settings > Hermes) and the
// HERMES_RELAY_PUBLIC_URL "is the relay actually configured on this deployment" check.
// NEXT_PUBLIC_HERMES_ENABLED is a client-bundle-inlined build arg (see Dockerfile,
// .gitea/workflows/docker.yml), not a runtime .env value — flipping it requires a
// rebuild, same as NEXT_PUBLIC_MCP_ENABLED/NEXT_PUBLIC_CANVAS_ENABLED. Defaults to
// enabled (unlike those two, which default off): this feature already ships to real
// users, so an unset build-arg must not silently regress an existing deployment.
//
// Lives in its own module, apart from feature-flag.ts's assertHermesEnabled, precisely so
// client components can import it — feature-flag.ts pulls in next/server, which a client
// component can't. The NEXT_PUBLIC_ value is still inlined at build time here: the
// bundler substitutes the process.env expression textually, wherever it appears.
export function isHermesEnabled(): boolean {
  return process.env.NEXT_PUBLIC_HERMES_ENABLED !== 'false';
}
