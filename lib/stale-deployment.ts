import { unstable_isUnrecognizedActionError } from 'next/navigation';

// Next already reloads the page when a client navigation reaches a newer
// build, but a tab or installed PWA kept open across a deploy still runs the
// old bundle for everything else: its lazy chunks are gone from the server and
// its Server Action IDs are unknown there. Only a full reload recovers.

const LAST_RELOAD_KEY = 'zetora:stale-deployment-reload-at';
// The same failure again this soon after a reload is not a stale bundle, and
// reloading once more would loop.
export const STALE_RELOAD_GUARD_MS = 30_000;

const CHUNK_LOAD_FAILURE = /Failed to load chunk|Loading (?:CSS )?chunk \S+ failed/;

export function isStaleDeploymentError(error: unknown): boolean {
  if (unstable_isUnrecognizedActionError(error)) return true;
  if (!(error instanceof Error)) return false;
  return error.name === 'ChunkLoadError' || CHUNK_LOAD_FAILURE.test(error.message);
}

export function shouldReloadForStaleDeployment(lastReloadAt: number | null, now: number): boolean {
  return lastReloadAt === null || now - lastReloadAt > STALE_RELOAD_GUARD_MS;
}

function readLastReloadAt(): number | null {
  try {
    const value = Number(sessionStorage.getItem(LAST_RELOAD_KEY));
    return Number.isFinite(value) && value > 0 ? value : null;
  } catch {
    return null;
  }
}

/** Reloads the page when `error` comes from a stale bundle, at most once per guard window. */
export function reloadIfStaleDeployment(error: unknown): void {
  if (!isStaleDeploymentError(error)) return;
  const now = Date.now();
  if (!shouldReloadForStaleDeployment(readLastReloadAt(), now)) return;
  try {
    sessionStorage.setItem(LAST_RELOAD_KEY, String(now));
  } catch {
    // Without storage the guard cannot hold: reloading could loop, so leave
    // the error on screen.
    return;
  }
  window.location.reload();
}
