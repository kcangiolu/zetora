// Emails render server-side, so process.env.NEXT_PUBLIC_APP_URL always holds
// the real runtime value here (unlike client bundles, where it's inlined at
// build time). Falls back to localhost for local/dev sends where the var may
// be unset.
export function getAppUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, '') || 'http://localhost:3000';
}
