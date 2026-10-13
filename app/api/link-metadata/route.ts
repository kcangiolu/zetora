import { withAuth } from '@/lib/api/route-handlers';
import { ChatSDKError } from '@/lib/errors';
import { getLinkMetadata } from '@/lib/link-metadata';

// Link previews for the chat (citations, sources): read by Zetora itself so
// the links a user sees never leave for a third-party metadata service.
export const GET = withAuth(async (request) => {
  const url = new URL(request.url).searchParams.get('url');
  if (!url) throw new ChatSDKError('bad_request:api', 'URL parameter is required');

  const metadata = await getLinkMetadata(url);
  if (!metadata) return Response.json({ error: 'No metadata for this link' }, { status: 404 });
  return Response.json(metadata, { headers: { 'Cache-Control': 'private, max-age=86400' } });
});
