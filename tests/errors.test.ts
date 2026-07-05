import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  ChatSDKError,
  getMessageByErrorCode,
  getErrorActions,
  getErrorIcon,
  isAuthError,
  isUpgradeRequiredError,
  isModelError,
  isSignInRequired,
  isProRequired,
  isRateLimited,
  visibilityBySurface,
} from '@/lib/errors';

afterEach(() => vi.restoreAllMocks());

describe('ChatSDKError', () => {
  it('splits the code into type and surface and derives status + message', () => {
    const err = new ChatSDKError('unauthorized:chat', 'no session');
    expect(err.type).toBe('unauthorized');
    expect(err.surface).toBe('chat');
    expect(err.statusCode).toBe(401);
    expect(err.cause).toBe('no session');
    expect(err.message).toBe('You need to sign in to view this chat. Please sign in and try again.');
  });

  it.each([
    ['bad_request:api', 400],
    ['unauthorized:auth', 401],
    ['upgrade_required:chat', 402],
    ['forbidden:auth', 403],
    ['model_restricted:model', 403],
    ['not_found:chat', 404],
    ['rate_limit:api', 429],
    ['offline:chat', 503],
  ] as const)('%s maps to HTTP %d', (code, status) => {
    expect(new ChatSDKError(code).statusCode).toBe(status);
  });

  it('toResponse exposes code, message and cause for user-visible surfaces', async () => {
    const res = new ChatSDKError('rate_limit:chat', 'quota').toResponse();
    expect(res.status).toBe(429);
    const body = await res.json();
    expect(body).toEqual({
      code: 'rate_limit:chat',
      message: 'You have exceeded your maximum number of messages for the day. Please try again later.',
      cause: 'quota',
    });
  });

  it('toResponse hides details and logs for database-surface errors', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = new ChatSDKError('bad_request:database', 'SELECT failed').toResponse();
    expect(spy).toHaveBeenCalledOnce();
    const body = await res.json();
    expect(body.code).toBe('');
    expect(body.message).toBe('Something went wrong. Please try again later.');
    expect(JSON.stringify(body)).not.toContain('SELECT failed');
  });
});

describe('getMessageByErrorCode', () => {
  it('always returns the generic database message for database surfaces', () => {
    expect(getMessageByErrorCode('not_found:database')).toBe(
      'An error occurred while executing a database query.',
    );
  });

  it('falls back to a generic message for unknown codes', () => {
    expect(getMessageByErrorCode('offline:api')).toBe('Something went wrong. Please try again later.');
  });
});

describe('predicates', () => {
  it('classifies auth/model/upgrade/rate-limit errors', () => {
    expect(isAuthError(new ChatSDKError('forbidden:auth'))).toBe(true);
    expect(isAuthError(new ChatSDKError('forbidden:chat'))).toBe(false);
    expect(isModelError(new ChatSDKError('rate_limit:model'))).toBe(true);
    expect(isUpgradeRequiredError(new ChatSDKError('upgrade_required:chat'))).toBe(true);
    expect(isRateLimited(new ChatSDKError('rate_limit:api'))).toBe(true);
  });

  it('isSignInRequired only fires for unauthorized on auth/chat/model surfaces', () => {
    expect(isSignInRequired(new ChatSDKError('unauthorized:auth'))).toBe(true);
    expect(isSignInRequired(new ChatSDKError('unauthorized:model'))).toBe(true);
    expect(isSignInRequired(new ChatSDKError('unauthorized:api'))).toBe(false);
    expect(isSignInRequired(new ChatSDKError('forbidden:auth'))).toBe(false);
  });

  it('isProRequired covers upgrade_required, forbidden and model_restricted', () => {
    expect(isProRequired(new ChatSDKError('upgrade_required:auth'))).toBe(true);
    expect(isProRequired(new ChatSDKError('forbidden:model'))).toBe(true);
    expect(isProRequired(new ChatSDKError('model_restricted:model'))).toBe(true);
    expect(isProRequired(new ChatSDKError('rate_limit:chat'))).toBe(false);
  });
});

describe('getErrorActions / getErrorIcon', () => {
  it('suggests sign-in first for unauthorized errors', () => {
    const actions = getErrorActions(new ChatSDKError('unauthorized:chat'));
    expect(actions.primary?.action).toBe('signin');
    expect(getErrorIcon(new ChatSDKError('unauthorized:chat'))).toBe('auth');
  });

  it('suggests upgrading for pro-gated and rate-limited errors', () => {
    expect(getErrorActions(new ChatSDKError('forbidden:model')).primary?.action).toBe('upgrade');
    expect(getErrorActions(new ChatSDKError('rate_limit:chat')).primary?.action).toBe('upgrade');
    expect(getErrorIcon(new ChatSDKError('rate_limit:chat'))).toBe('upgrade');
  });

  it('defaults to retry with an error icon', () => {
    const err = new ChatSDKError('bad_request:api');
    expect(getErrorActions(err).primary?.action).toBe('retry');
    expect(getErrorIcon(err)).toBe('error');
  });

  it('uses a warning icon for offline errors', () => {
    expect(getErrorIcon(new ChatSDKError('offline:chat'))).toBe('warning');
  });
});

describe('visibilityBySurface', () => {
  it('only the database surface is log-only', () => {
    const logOnly = Object.entries(visibilityBySurface)
      .filter(([, v]) => v === 'log')
      .map(([k]) => k);
    expect(logOnly).toEqual(['database']);
  });
});
