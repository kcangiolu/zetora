import { NextRequest, NextResponse } from 'next/server';
import { nanoid } from 'nanoid';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import { assertInternalHermesAuth } from '@/lib/hermes/internal-auth';
import { assertHermesEnabled } from '@/lib/hermes/feature-flag';
import { getHermesConnectorByGatewayId } from '@/lib/db/queries';
import { getStorageClient } from '@/lib/storage';
import { createLogger } from '@/lib/logger';

const log = createLogger('api-internal-hermes-media');

const MAX_MEDIA_BYTES = 25 * 1024 * 1024;

function sanitizeExtension(raw: string | undefined): string {
  const cleaned = (raw ?? '')
    .replace(/[^a-zA-Z0-9]/g, '')
    .toLowerCase()
    .slice(0, 10);
  return cleaned || 'bin';
}

// Receives a gateway's `POST {connector}/relay/media` upload, forwarded verbatim (raw
// bytes) by hermes-relay-service via internalClient.ts's uploadGatewayMedia — this is the
// only place in zetora-app that actually touches storage credentials for Hermes media.
// The returned `id` is opaque to the gateway; it round-trips through
// `{connector}/relay/media/{id}` as the send_media action's source_url, and
// agent-event/route.ts resolves it back to storagePublicUrl below.
export async function POST(req: NextRequest) {
  const disabled = assertHermesEnabled();
  if (disabled) return disabled;

  const authError = assertInternalHermesAuth(req);
  if (authError) return authError;

  const gatewayId = req.headers.get('x-gateway-id');
  if (!gatewayId) {
    return NextResponse.json({ error: 'missing_gateway_id' }, { status: 400 });
  }

  const connector = await getHermesConnectorByGatewayId(gatewayId);
  if (!connector) {
    return NextResponse.json({ error: 'unknown_gateway' }, { status: 404 });
  }

  const contentType = req.headers.get('content-type') || 'application/octet-stream';
  const filenameHeader = req.headers.get('x-media-filename');
  const filename = filenameHeader ? decodeURIComponent(filenameHeader) : undefined;

  const body = Buffer.from(await req.arrayBuffer());
  if (body.length > MAX_MEDIA_BYTES) {
    return NextResponse.json({ error: 'payload_too_large' }, { status: 413 });
  }

  const ext = sanitizeExtension(filename?.split('.').pop());
  const { client: storageClient, bucketName: storageBucket, publicUrl: storagePublicUrl } = getStorageClient();
  const key = `zetora/hermes-media/${connector.userId}/${nanoid()}.${ext}`;

  try {
    await storageClient.send(
      new PutObjectCommand({
        Bucket: storageBucket,
        Key: key,
        Body: body,
        ContentType: contentType,
        Metadata: { 'user-id': connector.userId },
      }),
    );
  } catch (error) {
    log.error('Failed to upload Hermes media:', error);
    return NextResponse.json({ error: 'internal_error' }, { status: 500 });
  }

  // Stateless reference: the id IS the base64url-encoded final URL, so resolving it back
  // (agent-event/route.ts's send_media branch) needs no database lookup or link table —
  // same "no correlation table needed" pattern already used for edit/react's message_id.
  const url = `${storagePublicUrl}/${key}`;
  const id = Buffer.from(url, 'utf8').toString('base64url');

  return NextResponse.json({ id });
}
