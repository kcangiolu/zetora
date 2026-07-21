// Shared fallback for BOTH `@extensions/register` and
// `@extensions/register-client` when no private overlay is checked out (see
// next.config.ts's fs.existsSync-based aliases) — safe as the fallback for
// both since it's empty either way. A real overlay must implement register()
// in agent/register.ts and registerClient() in agent/register-client.ts —
// TWO SEPARATE FILES, not one exporting both:
//
// - register()       — server only, called once from instrumentation.ts via
//   lib/extensions.ts. Wire up lib/services/bullmq.ts's registerJobHandler()
//   here.
// - registerClient()  — client only, called on mount via
//   lib/extension-modes-client.ts / components/extension-slot.tsx. Wire up
//   UI slot components / extension-mode UI descriptors here.
//
// Next's RSC boundary check traces through dynamic import() calls, not just
// static ones — a single module reachable from both a server call site and
// a client call site gets its *whole* import graph (including anything a
// dynamically-imported dependency pulls in) checked for 'server-only'
// leaking into the client bundle. One file with both functions will build
// fine as long as it's empty (like this one) but breaks the moment register()
// dynamically imports anything with a top-level `import 'server-only'` —
// hence two physical files upstream. Keep each function's actual imports
// *inside* its body (dynamic `import()`) regardless — a top-level
// `import ... from 'bullmq'` (or any other Node-only package) would still
// break register-client.ts's client bundle, and vice versa for browser-only
// imports reaching the server bundle.
export async function register(): Promise<void> {
  // No extensions installed — intentionally empty.
}

export async function registerClient(): Promise<void> {
  // No extensions installed — intentionally empty.
}
