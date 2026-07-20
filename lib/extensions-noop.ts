// Fallback for `@extensions/register` when no private overlay is checked out
// (see next.config.ts's fs.existsSync-based alias). An overlay's
// `agent/register.ts` must export this same shape, called from two
// different bundles:
//
// - register()       — server only, called once from instrumentation.ts.
//   Wire up lib/services/bullmq.ts's registerJobHandler() here.
// - registerClient()  — client only, called from
//   components/extension-slot.tsx on mount. Wire up UI slot components here.
//
// Keep each function's actual imports *inside* its body (dynamic `import()`),
// not at module top level — a top-level `import ... from 'bullmq'` (or any
// other Node-only package) would break when this same file is bundled for
// the client by registerClient()'s caller, and vice versa for browser-only
// imports reaching the server bundle.
export async function register(): Promise<void> {
  // No extensions installed — intentionally empty.
}

export async function registerClient(): Promise<void> {
  // No extensions installed — intentionally empty.
}
