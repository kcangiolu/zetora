import { withAuth } from '@/lib/api/route-handlers';
import { getMcpOAuthRedirectUri } from '@/lib/mcp/oauth';

export const GET = withAuth(async (request) => {
  return Response.json({ redirectUri: getMcpOAuthRedirectUri(new URL(request.url).origin) });
});
