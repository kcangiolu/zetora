// The one master switch for the whole Hermes Agent relay channel, upstream of
// per-user connector enrollment (Settings > Hermes) and of the
// HERMES_RELAY_PUBLIC_URL check. NEXT_PUBLIC_HERMES_ENABLED is inlined into
// the client bundle at build time (a Dockerfile build arg), so changing it
// needs a rebuild. Off unless set to true, like the other experimental flags.
//
// Kept apart from feature-flag.ts's assertHermesEnabled so client components
// can import it: feature-flag.ts pulls in next/server.
export function isHermesEnabled(): boolean {
  return process.env.NEXT_PUBLIC_HERMES_ENABLED === 'true';
}
