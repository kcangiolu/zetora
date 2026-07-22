import { getComprehensiveUserData } from '@/lib/user-data-server';
import { getUserMcpServerById, updateUserMcpServer } from '@/lib/db/queries';
import { ChatSDKError } from '@/lib/errors';
import { exchangeMcpOAuthCode, verifyMcpOAuthState } from '@/lib/mcp/oauth';

function assertUser(user: Awaited<ReturnType<typeof getComprehensiveUserData>>) {
  if (!user) throw new ChatSDKError('unauthorized:auth', 'Authentication required');
  return user;
}

function redirectToApps(request: Request, status: 'success' | 'error', message?: string) {
  const url = new URL('/apps', new URL(request.url).origin);
  url.searchParams.set('tab', 'my-servers');
  url.searchParams.set('mcpOauth', status);
  if (message) url.searchParams.set('message', message.slice(0, 120));
  return Response.redirect(url.toString(), 302);
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = assertUser(await getComprehensiveUserData());
    const { id } = await params;
    const requestUrl = new URL(request.url);
    const code = requestUrl.searchParams.get('code');
    const state = requestUrl.searchParams.get('state');
    if (!code || !state) return redirectToApps(request, 'error', 'Missing OAuth callback params');

    const server = await getUserMcpServerById({ id, userId: user.id });
    if (!server) return redirectToApps(request, 'error', 'MCP server not found');
    if (server.authType !== 'oauth') return redirectToApps(request, 'error', 'Server is not OAuth');

    const payload = verifyMcpOAuthState({
      state,
      expectedUserId: user.id,
      expectedServerId: id,
    });

    await exchangeMcpOAuthCode({
      server,
      userId: user.id,
      code,
      verifier: payload.verifier,
      requestOrigin: requestUrl.origin,
    });

    await updateUserMcpServer({
      id,
      userId: user.id,
      values: {
        oauthError: null,
      },
    });

    return redirectToApps(request, 'success');
  } catch (error) {
    const { id } = await params;
    const user = await getComprehensiveUserData().catch(() => null);
    if (user?.id) {
      await updateUserMcpServer({
        id,
        userId: user.id,
        values: {
          oauthError: error instanceof Error ? error.message.slice(0, 1000) : 'OAuth callback failed',
        },
      }).catch(() => null);
    }
    return redirectToApps(request, 'error', error instanceof Error ? error.message : 'OAuth callback failed');
  }
}
