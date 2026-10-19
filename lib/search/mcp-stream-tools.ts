import type { UIMessageStreamWriter } from 'ai';

import { createLogger } from '@/lib/logger';
import type { ChatMessage } from '@/lib/types';

const log = createLogger('search');

// The user's MCP tools for an Apps turn, and a close() that ends their clients once,
// whichever of finish, abort or error comes first.
export async function loadMcpStreamTools(
  userId: string,
  dataStream: UIMessageStreamWriter<ChatMessage>,
): Promise<{ tools: Record<string, any>; close: () => Promise<void> }> {
  const { resolveUserMcpTools } = await import('@/lib/tools/mcp-client');
  const resolved = await resolveUserMcpTools({ userId, dataStream });
  if (resolved.errors.length > 0) log.warn('MCP tool loading errors:', resolved.errors);

  let closed = false;
  return {
    tools: resolved.tools,
    close: async () => {
      if (closed) return;
      closed = true;
      await resolved.closeAll().catch((error) => log.warn('Failed closing MCP clients:', error));
    },
  };
}
