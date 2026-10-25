import { describe, it, expect } from 'vitest';
import { UnrecognizedActionError } from 'next/dist/client/components/unrecognized-action-error';
import { isStaleDeploymentError, shouldReloadForStaleDeployment, STALE_RELOAD_GUARD_MS } from '@/lib/stale-deployment';

describe('isStaleDeploymentError', () => {
  it('recognizes a Server Action the new build no longer has', () => {
    expect(
      isStaleDeploymentError(new UnrecognizedActionError('Server Action "abc" was not found on the server.')),
    ).toBe(true);
  });

  it('recognizes a lazy chunk that is gone from the server', () => {
    const webpackError = new Error('Loading chunk 123 failed.');
    webpackError.name = 'ChunkLoadError';
    expect(isStaleDeploymentError(webpackError)).toBe(true);
    expect(isStaleDeploymentError(new Error('Loading CSS chunk 45 failed.'))).toBe(true);
    expect(isStaleDeploymentError(new Error('Failed to load chunk /_next/static/chunks/abc.js'))).toBe(true);
  });

  it('leaves any other error alone', () => {
    expect(isStaleDeploymentError(new Error('Failed to fetch'))).toBe(false);
    expect(isStaleDeploymentError('Loading chunk 1 failed.')).toBe(false);
    expect(isStaleDeploymentError(undefined)).toBe(false);
  });
});

describe('shouldReloadForStaleDeployment', () => {
  it('reloads the first time', () => {
    expect(shouldReloadForStaleDeployment(null, 1_000)).toBe(true);
  });

  it('does not reload again right after a reload', () => {
    expect(shouldReloadForStaleDeployment(1_000, 1_000 + STALE_RELOAD_GUARD_MS)).toBe(false);
  });

  it('reloads again once the guard window has passed', () => {
    expect(shouldReloadForStaleDeployment(1_000, 1_001 + STALE_RELOAD_GUARD_MS)).toBe(true);
  });
});
