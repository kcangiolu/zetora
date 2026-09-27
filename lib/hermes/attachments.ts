// What a Zetora attachment looks like once it has been uploaded (the shape
// components/ui/form-component/attachment-utils.tsx's Attachment reduces to on the wire).
export interface HermesAttachmentRef {
  url: string;
  name?: string;
  mediaType?: string;
}

// One entry of the inbound event's `media` array — the rich, per-attachment form
// gateway/relay/ws_transport.py's _media_types_from_wire reads. `mime` may be empty: the
// gateway then falls back to the message-level type for that slot rather than dropping it.
export interface HermesMediaRef {
  url: string;
  mime: string;
  name: string | null;
}

// Mirrors MEDIA_MAX_BYTES in gateway/relay/media.py: the gateway downloads every URL we
// cite and abandons anything larger, silently. Zetora's own upload allows 50MB for a
// document, so Agent mode has to refuse the 25-50MB band itself — a file the agent will
// never see must not look like it was sent.
export const HERMES_MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024;

// Whether `url` is an object in OUR storage, under THIS user's own prefix.
//
// This is a security check, not tidiness: whatever Zetora puts in the inbound event's
// `media_urls` is downloaded by the gateway (gateway/relay/adapter.py's
// _localize_inbound_media), without a bearer for a public URL. Without this, a forged
// request body turns the agent into a fetcher for arbitrary URLs.
//
// Origin is compared as an origin, never as a string prefix — `https://storage.test` must
// not match `https://storage.test.evil.com` (same reasoning as isOwnR2Url in
// app/api/upload/route.ts). The path check then pins the object to the uploader's own
// prefix, the one app/api/upload/route.ts writes: `zetora/users/<userId>/`. WHATWG URL
// parsing normalises `..` segments before we look, so a traversal attempt can only ever
// fail the prefix test.
function isOwnedStorageUrl(url: string, userId: string, storagePublicUrl: string): boolean {
  let parsed: URL;
  let base: URL;
  try {
    parsed = new URL(url);
    base = new URL(storagePublicUrl);
  } catch {
    return false;
  }
  if (parsed.origin !== base.origin) return false;
  // MinIO's public URL carries the bucket in its path (http://host:9000/zetora-uploads);
  // R2's does not. Either way the key is appended to it verbatim by the upload route.
  const basePath = base.pathname.replace(/\/+$/, '');
  return parsed.pathname.startsWith(`${basePath}/zetora/users/${userId}/`);
}

// Splits the attachments a Hermes send carries into what can be cited to the agent and
// what has to be refused. Refusals are returned rather than dropped so the caller can name
// the file — an attachment that silently never reaches the agent is worse than an error.
export function resolveHermesAttachments({
  attachments,
  userId,
  storagePublicUrl,
}: {
  attachments: HermesAttachmentRef[];
  userId: string;
  storagePublicUrl: string;
}): { media: HermesMediaRef[]; rejected: Array<{ name: string; reason: string }> } {
  const media: HermesMediaRef[] = [];
  const rejected: Array<{ name: string; reason: string }> = [];

  for (const attachment of attachments) {
    const name = attachment.name || 'attachment';
    if (!attachment.url || !isOwnedStorageUrl(attachment.url, userId, storagePublicUrl)) {
      rejected.push({ name, reason: 'not an uploaded file of yours' });
      continue;
    }
    media.push({ url: attachment.url, mime: attachment.mediaType || '', name: attachment.name ?? null });
  }

  return { media, rejected };
}

// The inbound event's message-level `message_type`, mirroring what a native adapter sends.
// Hermes classifies each attachment by its own MIME first (run.py's _event_media_is_image
// and siblings) and only consults this when a slot's MIME is empty — so this is a fallback,
// which is why a mixed message reports 'document': it is the safe answer for the entries
// whose MIME didn't make it, since a non-image misclassified as an image gets base64'd into
// a vision content part and the provider rejects the request.
export function hermesMessageTypeFor(mimes: string[]): 'text' | 'photo' | 'document' {
  if (mimes.length === 0) return 'text';
  return mimes.every((mime) => mime.startsWith('image/')) ? 'photo' : 'document';
}
