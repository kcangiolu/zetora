import { describe, it, expect } from 'vitest';
import { checkModelAccess, buildUnauthenticatedRateLimitError } from '@/lib/search/access-gate';
import { models } from '@/ai/models';

// Pick representative models from the live catalog so the tests don't break
// when individual entries are renamed.
const freeModel = models.find((m) => !m.requiresAuth && !m.pro && !m.max)!.value;
const authModel = models.find((m) => m.requiresAuth && !m.pro && !m.max)!.value;
const proModel = models.find((m) => m.pro && !m.max)!.value;
const maxModel = models.find((m) => m.max)!.value;

const freeUser = { isProUser: false, isMaxUser: false };
const proUser = { isProUser: true, isMaxUser: false };
const maxUser = { isProUser: false, isMaxUser: true };

describe('checkModelAccess', () => {
  it('lets signed-out users use free models', () => {
    expect(checkModelAccess({ lightweightUser: null, model: freeModel, specialMode: undefined })).toBeNull();
  });

  it('blocks signed-out users from auth-required models', () => {
    const error = checkModelAccess({ lightweightUser: null, model: authModel, specialMode: undefined });
    expect(error?.type).toBe('unauthorized');
    expect(error?.surface).toBe('model');
  });

  it('blocks signed-out users from MCP mode', () => {
    const error = checkModelAccess({ lightweightUser: null, model: freeModel, specialMode: 'mcp' });
    expect(error?.type).toBe('unauthorized');
    expect(error?.surface).toBe('auth');
  });

  it('blocks free users from pro models but allows pro and max users', () => {
    const error = checkModelAccess({ lightweightUser: freeUser, model: proModel, specialMode: undefined });
    expect(error?.type).toBe('upgrade_required');
    expect(checkModelAccess({ lightweightUser: proUser, model: proModel, specialMode: undefined })).toBeNull();
    expect(checkModelAccess({ lightweightUser: maxUser, model: proModel, specialMode: undefined })).toBeNull();
  });

  it('blocks pro users from max models', () => {
    const error = checkModelAccess({ lightweightUser: proUser, model: maxModel, specialMode: undefined });
    expect(error?.type).toBe('upgrade_required');
    expect(checkModelAccess({ lightweightUser: maxUser, model: maxModel, specialMode: undefined })).toBeNull();
  });

  it('gates MCP mode behind a Pro subscription for signed-in users', () => {
    const error = checkModelAccess({ lightweightUser: freeUser, model: freeModel, specialMode: 'mcp' });
    expect(error?.type).toBe('upgrade_required');
    expect(error?.cause).toBe('MCP mode requires a Pro subscription');
    expect(checkModelAccess({ lightweightUser: proUser, model: freeModel, specialMode: 'mcp' })).toBeNull();
    expect(checkModelAccess({ lightweightUser: maxUser, model: freeModel, specialMode: 'mcp' })).toBeNull();
  });

  it('ignores other special modes', () => {
    expect(checkModelAccess({ lightweightUser: freeUser, model: freeModel, specialMode: 'canvas' })).toBeNull();
    expect(checkModelAccess({ lightweightUser: null, model: freeModel, specialMode: 'buddy' })).toBeNull();
  });
});

describe('buildUnauthenticatedRateLimitError', () => {
  it('returns null on success', () => {
    expect(buildUnauthenticatedRateLimitError({ success: true, limit: 10, reset: Date.now() })).toBeNull();
  });

  it('formats the limit and reset date into the message', () => {
    const reset = Date.UTC(2026, 6, 18, 12, 0, 0);
    const error = buildUnauthenticatedRateLimitError({ success: false, limit: 10, reset });
    expect(error?.type).toBe('rate_limit');
    expect(error?.cause).toContain('limit of 10 searches per day');
    expect(error?.cause).toContain(new Date(reset).toLocaleString());
  });
});
