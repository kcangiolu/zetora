import { withProAuth } from '@/lib/api/route-handlers';
import { getUserMcpServerById, updateUserMcpServer } from '@/lib/db/queries';
import { ChatSDKError } from '@/lib/errors';

export const POST = withProAuth(
  async (_request, { params, user }) => {
    const { id } = (await params) as { id: string };
    const server = await getUserMcpServerById({ id, userId: user.id });
    if (!server) throw new ChatSDKError('not_found:api', 'MCP server not found');

    await updateUserMcpServer({
      id,
      userId: user.id,
      values: {
        oauthAccessTokenEncrypted: null,
        oauthRefreshTokenEncrypted: null,
        oauthAccessTokenExpiresAt: null,
        oauthConnectedAt: null,
        oauthError: null,
      },
    });

    return Response.json({ ok: true });
  },
  { genericError: 'expose' },
);
