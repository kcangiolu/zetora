import { createMCPClient } from '@ai-sdk/mcp';
import { withError } from '@/lib/api/route-handlers';
import { getComprehensiveUserData } from '@/lib/user-data-server';
import { getUserMcpServerById } from '@/lib/db/queries';
import { resolveMcpAuthHeaders } from '@/lib/mcp/auth-headers';
import { validateMcpServerUrl } from '@/lib/mcp/server-config';
import { ChatSDKError } from '@/lib/errors';

// Session-gated only (no Pro requirement, unlike the other MCP routes).
export const GET = withError(
  async (_request, { params }) => {
    const user = await getComprehensiveUserData();
    if (!user) throw new ChatSDKError('unauthorized:auth');

    const { id } = (await params) as { id: string };
    const server = await getUserMcpServerById({ id, userId: user.id });
    if (!server) throw new ChatSDKError('not_found:api', 'MCP server not found');

    validateMcpServerUrl(server.url);

    const client = await createMCPClient({
      transport: {
        type: server.transportType,
        url: server.url,
        headers: await resolveMcpAuthHeaders({ server, userId: user.id }),
      },
    });

    try {
      const toolsResult = await client.listTools();
      const tools = toolsResult.tools.map((t) => ({
        name: t.name,
        title: t.title ?? null,
        description: t.description ?? null,
      }));
      return Response.json({ ok: true, tools });
    } finally {
      await client.close();
    }
  },
  { genericError: 'expose' },
);
