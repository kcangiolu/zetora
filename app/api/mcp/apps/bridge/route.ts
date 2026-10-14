import { createMCPClient } from '@ai-sdk/mcp';
import { z } from 'zod';
import { withError } from '@/lib/api/route-handlers';
import { getComprehensiveUserData } from '@/lib/user-data-server';
import { getUserMcpServerById } from '@/lib/db/queries';
import { resolveMcpAuthHeaders } from '@/lib/mcp/auth-headers';
import { validateMcpServerUrl, getMcpFetch } from '@/lib/mcp/server-config';
import { ChatSDKError } from '@/lib/errors';

const bridgeRequestSchema = z.object({
  serverId: z.string().min(1),
  method: z.enum(['tools/call', 'resources/list', 'resources/read', 'resources/templates/list', 'prompts/list']),
  params: z.record(z.string(), z.unknown()).optional(),
});

export const POST = withError(
  async (request) => {
    const user = await getComprehensiveUserData();
    if (!user) throw new ChatSDKError('unauthorized:auth');

    const input = bridgeRequestSchema.parse(await request.json());
    const server = await getUserMcpServerById({ id: input.serverId, userId: user.id });
    if (!server) return new ChatSDKError('not_found:api', 'MCP server not found').toResponse();

    await validateMcpServerUrl(server.url);

    const client = await createMCPClient({
      transport: {
        type: server.transportType,
        url: server.url,
        fetch: getMcpFetch(server.url),
        redirect: 'error',
        headers: await resolveMcpAuthHeaders({
          server,
          userId: user.id,
        }),
      },
    });

    try {
      const params = input.params ?? {};

      if (input.method === 'tools/call') {
        const toolName = typeof params.name === 'string' ? params.name : '';
        const toolArgs =
          params.arguments && typeof params.arguments === 'object' ? (params.arguments as Record<string, unknown>) : {};
        if (!toolName) {
          return new ChatSDKError('bad_request:api', 'Tool name is required').toResponse();
        }

        const toolSet = await client.tools();
        const tool = toolSet[toolName] as any;
        if (!tool?.execute) {
          return new ChatSDKError('not_found:api', `Tool not found: ${toolName}`).toResponse();
        }

        const result = await tool.execute(toolArgs, {});
        return Response.json({
          ok: true,
          result,
        });
      }

      if (input.method === 'resources/list') {
        const result = await client.listResources();
        return Response.json({ ok: true, result });
      }

      if (input.method === 'resources/read') {
        const uri = typeof params.uri === 'string' ? params.uri : '';
        if (!uri) return new ChatSDKError('bad_request:api', 'Resource URI is required').toResponse();
        const result = await client.readResource({ uri });
        return Response.json({ ok: true, result });
      }

      if (input.method === 'resources/templates/list') {
        const result = await client.listResourceTemplates();
        return Response.json({ ok: true, result });
      }

      const result = await client.experimental_listPrompts();
      return Response.json({ ok: true, result });
    } finally {
      await client.close();
    }
  },
  { genericError: 'expose' },
);
