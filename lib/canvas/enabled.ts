// NEXT_PUBLIC_CANVAS_ENABLED is inlined into the client bundle at build time, so
// changing it needs a rebuild. The search route checks it too: a request for the
// Canvas mode from a build without it is refused, not served.
export function isCanvasEnabled(): boolean {
  return process.env.NEXT_PUBLIC_CANVAS_ENABLED === 'true';
}
