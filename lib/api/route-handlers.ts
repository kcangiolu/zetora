import 'server-only';

import { z } from 'zod';
import { ChatSDKError } from '@/lib/errors';
import { getUser } from '@/lib/auth-utils';
import { getComprehensiveUserData, type ComprehensiveUserData } from '@/lib/user-data-server';
import type { User } from '@/lib/db/schema';

import { createLogger } from '@/lib/logger';

const log = createLogger('route-handlers');

/**
 * Composable wrappers for App Router route handlers. They centralize the
 * auth gate + try/catch boilerplate that used to be copy-pasted per route.
 *
 * Not for streaming or signature-verified routes (search, lookout, auth,
 * webhooks) — those own their response lifecycle.
 */

export type RouteContext = { params: Promise<Record<string, string | string[]>> };

type Handler<Ctx> = (req: Request, ctx: Ctx) => Promise<Response> | Response;

export interface RouteErrorOptions {
  /**
   * How to render errors that aren't ChatSDKError/ZodError:
   * - 'opaque' (default): log once, return `{ error: 'Internal server error' }` 500
   * - 'expose': surface `error.message` as a bad_request:api 400 — for routes
   *   whose lib helpers throw plain Errors with user-actionable messages
   *   (the MCP validation pattern).
   */
  genericError?: 'opaque' | 'expose';
}

/**
 * Single error boundary: ChatSDKError renders itself, ZodError becomes a 400,
 * anything else follows `genericError` (opaque 500 by default, using the
 * `{ error }` body shape existing clients already parse).
 */
export function withError<Ctx extends RouteContext = RouteContext>(
  handler: Handler<Ctx>,
  options: RouteErrorOptions = {},
): Handler<Ctx> {
  return async (req, ctx) => {
    try {
      return await handler(req, ctx);
    } catch (error) {
      if (error instanceof ChatSDKError) return error.toResponse();
      if (error instanceof z.ZodError) {
        const message = error.issues[0]?.message || 'Invalid request payload';
        if (options.genericError === 'expose') {
          return new ChatSDKError('bad_request:api', message).toResponse();
        }
        return Response.json({ error: message }, { status: 400 });
      }
      if (options.genericError === 'expose' && error instanceof Error) {
        return new ChatSDKError('bad_request:api', error.message).toResponse();
      }
      log.error(`[api] ${req.method} ${new URL(req.url).pathname}:`, error);
      return Response.json({ error: 'Internal server error' }, { status: 500 });
    }
  };
}

/** Session-authenticated route: 401 with the legacy `{ error }` body when signed out. */
export function withAuth<Ctx extends RouteContext = RouteContext>(
  handler: Handler<Ctx & { user: User }>,
  options?: RouteErrorOptions,
): Handler<Ctx> {
  return withError(async (req, ctx) => {
    const user = await getUser();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    return handler(req, { ...ctx, user });
  }, options);
}

/**
 * Pro-gated route: resolves comprehensive user data (subscription status
 * included) and rejects non-Pro users, mirroring the assertProUser pattern
 * the MCP routes established.
 */
export function withProAuth<Ctx extends RouteContext = RouteContext>(
  handler: Handler<Ctx & { user: ComprehensiveUserData }>,
  options?: RouteErrorOptions,
): Handler<Ctx> {
  return withError(async (req, ctx) => {
    const user = await getComprehensiveUserData();
    if (!user) throw new ChatSDKError('unauthorized:auth', 'Authentication required');
    if (!user.isProUser) throw new ChatSDKError('upgrade_required:auth', 'Pro subscription required');
    return handler(req, { ...ctx, user });
  }, options);
}

/** Parse + validate a JSON body; malformed JSON and schema failures both 400. */
export async function parseBody<Schema extends z.ZodType>(req: Request, schema: Schema): Promise<z.output<Schema>> {
  let json: unknown;
  try {
    json = await req.json();
  } catch {
    throw new ChatSDKError('bad_request:api', 'Invalid JSON body');
  }
  return schema.parse(json);
}
