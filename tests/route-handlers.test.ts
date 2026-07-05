import { describe, it, expect, beforeEach, vi } from 'vitest';
import { z } from 'zod';

const getUser = vi.hoisted(() => vi.fn());
const getComprehensiveUserData = vi.hoisted(() => vi.fn());

vi.mock('@/lib/auth-utils', () => ({ getUser }));
vi.mock('@/lib/user-data-server', () => ({ getComprehensiveUserData }));

import { withError, withAuth, withProAuth, parseBody, type RouteContext } from '@/lib/api/route-handlers';
import { ChatSDKError } from '@/lib/errors';

const ctx: RouteContext = { params: Promise.resolve({}) };
const req = (body?: unknown) =>
  new Request('http://localhost/api/test', {
    method: 'POST',
    body: body === undefined ? undefined : JSON.stringify(body),
  });

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('withError', () => {
  it('passes successful responses through', async () => {
    const handler = withError(async () => Response.json({ ok: true }));
    const res = await handler(req(), ctx);
    expect(res.status).toBe(200);
  });

  it('renders thrown ChatSDKError via toResponse', async () => {
    const handler = withError(async () => {
      throw new ChatSDKError('upgrade_required:auth', 'pro only');
    });
    const res = await handler(req(), ctx);
    expect(res.status).toBe(402);
    expect(await res.json()).toMatchObject({ code: 'upgrade_required:auth' });
  });

  it('maps ZodError to a 400 with the first issue message', async () => {
    const handler = withError(async () => {
      z.object({ name: z.string() }).parse({});
      return Response.json({});
    });
    const res = await handler(req(), ctx);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBeTypeOf('string');
  });

  it('hides unexpected errors behind an opaque 500 and logs once', async () => {
    const handler = withError(async () => {
      throw new Error('db password is hunter2');
    });
    const res = await handler(req(), ctx);
    expect(res.status).toBe(500);
    expect(JSON.stringify(await res.json())).not.toContain('hunter2');
    expect(console.error).toHaveBeenCalledOnce();
  });
});

describe('withAuth', () => {
  it('returns the legacy 401 body when signed out', async () => {
    getUser.mockResolvedValue(null);
    const inner = vi.fn();
    const res = await withAuth(inner)(req(), ctx);
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'Unauthorized' });
    expect(inner).not.toHaveBeenCalled();
  });

  it('injects the session user into the context', async () => {
    getUser.mockResolvedValue({ id: 'u1' });
    const handler = withAuth(async (_req, { user }) => Response.json({ id: user.id }));
    const res = await handler(req(), ctx);
    expect(await res.json()).toEqual({ id: 'u1' });
  });
});

describe('withProAuth', () => {
  it('401s anonymous users through the error boundary', async () => {
    getComprehensiveUserData.mockResolvedValue(null);
    const res = await withProAuth(async () => Response.json({}))(req(), ctx);
    expect(res.status).toBe(401);
  });

  it('402s signed-in non-Pro users', async () => {
    getComprehensiveUserData.mockResolvedValue({ id: 'u1', isProUser: false });
    const res = await withProAuth(async () => Response.json({}))(req(), ctx);
    expect(res.status).toBe(402);
  });

  it('passes comprehensive data to the handler for Pro users', async () => {
    getComprehensiveUserData.mockResolvedValue({ id: 'u1', isProUser: true });
    const handler = withProAuth(async (_req, { user }) => Response.json({ pro: user.isProUser }));
    expect(await (await handler(req(), ctx)).json()).toEqual({ pro: true });
  });
});

describe('parseBody', () => {
  const schema = z.object({ name: z.string().min(1) });

  it('returns the parsed payload', async () => {
    expect(await parseBody(req({ name: 'zetora' }), schema)).toEqual({ name: 'zetora' });
  });

  it('turns malformed JSON into a bad_request ChatSDKError', async () => {
    const bad = new Request('http://localhost/api/test', { method: 'POST', body: '{oops' });
    await expect(parseBody(bad, schema)).rejects.toBeInstanceOf(ChatSDKError);
  });

  it('lets schema failures propagate as ZodError for withError to map', async () => {
    await expect(parseBody(req({}), schema)).rejects.toBeInstanceOf(z.ZodError);
  });
});
