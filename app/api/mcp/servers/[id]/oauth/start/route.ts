import { withAuth } from '@/lib/api/route-handlers';
import { getUserMcpServerById } from '@/lib/db/queries';
import { ChatSDKError } from '@/lib/errors';
import { buildMcpOAuthAuthorizationUrl } from '@/lib/mcp/oauth';
import { validateMcpOAuthConfig } from '@/lib/mcp/server-config';
import { injectManagedOAuthCredentials } from '@/lib/mcp/managed-credentials';

export const POST = withAuth(
  async (request, { params, user }) => {
    const { id } = (await params) as { id: string };
    const rawServer = await getUserMcpServerById({ id, userId: user.id });
    if (!rawServer) throw new ChatSDKError('not_found:api', 'MCP server not found');
    if (rawServer.authType !== 'oauth') throw new ChatSDKError('bad_request:api', 'Server auth type is not OAuth');

    const server = injectManagedOAuthCredentials(rawServer);

    await validateMcpOAuthConfig({
      authType: 'oauth',
      oauthIssuerUrl: server.oauthIssuerUrl ?? undefined,
      oauthAuthorizationUrl: server.oauthAuthorizationUrl ?? undefined,
      oauthTokenUrl: server.oauthTokenUrl ?? undefined,
      oauthClientId: server.oauthClientId ?? undefined,
    });

    const requestOrigin = new URL(request.url).origin;
    const { authorizationUrl } = await buildMcpOAuthAuthorizationUrl({
      server,
      userId: user.id,
      requestOrigin,
    });

    return Response.json({ authorizationUrl });
  },
  { genericError: 'expose' },
);
