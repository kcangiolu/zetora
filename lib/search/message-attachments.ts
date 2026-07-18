import { TextPart, ImagePart, FilePart, ModelMessage } from 'ai';

export type AttachmentRef = { url: string; contentType: string; name?: string };

// PDF support requires Pro subscription (enforced in form-component.tsx)
export const DOCUMENT_MIME_TYPES = [
  'application/pdf',
  'text/csv',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel',
];

// Collects every attached file across the conversation, split three ways:
// known document types (file_query_search), images (vision / edit_image),
// and everything else (decoded as text later). Each category dedupes by URL
// independently, preserving message order.
export function collectAttachments(messages: Array<{ parts?: unknown }>): {
  contextFiles: AttachmentRef[];
  contextImages: AttachmentRef[];
  otherFileParts: AttachmentRef[];
} {
  const contextFiles: AttachmentRef[] = [];
  const contextImages: AttachmentRef[] = [];
  const otherFileParts: AttachmentRef[] = [];
  const seenUrls = new Set<string>();
  const seenImageUrls = new Set<string>();
  const seenOtherUrls = new Set<string>();

  for (const msg of messages) {
    const parts = (msg.parts as (TextPart | ImagePart | FilePart)[]) ?? [];
    for (const part of parts) {
      if (part.type === 'file') {
        const filePart = part as any;
        const mediaType = filePart.mediaType || '';
        const url = filePart.url || '';
        if (!url) continue;
        if (documentMime(mediaType)) {
          if (!seenUrls.has(url)) {
            seenUrls.add(url);
            contextFiles.push({ url, contentType: mediaType, name: filePart.name });
          }
        } else if (mediaType.startsWith('image/')) {
          if (!seenImageUrls.has(url)) {
            seenImageUrls.add(url);
            contextImages.push({ url, contentType: mediaType, name: filePart.name });
          }
        } else if (!seenOtherUrls.has(url)) {
          seenOtherUrls.add(url);
          otherFileParts.push({ url, contentType: mediaType, name: filePart.name });
        }
      }
    }
  }

  return { contextFiles, contextImages, otherFileParts };
}

function documentMime(mediaType: string): boolean {
  return DOCUMENT_MIME_TYPES.includes(mediaType);
}

// Removes file parts from the raw model input — every attached file is
// handled out-of-band instead (document/text instructions and image URLs are
// injected as text by the route). Images are the only part kept in the
// content array, and only when Vision is on.
export function stripFilePartsForModel(messages: ModelMessage[], visionEnabled: boolean): ModelMessage[] {
  return messages.map((msg: any) => {
    if (msg.role === 'user' && Array.isArray(msg.content)) {
      const filteredContent = msg.content.filter((part: any) => {
        if (part.type === 'file') {
          const mediaType = part.mimeType || part.mediaType || '';
          if (mediaType.startsWith('image/')) return visionEnabled;
          return false;
        }
        return true;
      });
      return { ...msg, content: filteredContent };
    }
    return msg;
  });
}

export function buildFileInstruction(contextFiles: AttachmentRef[]): string {
  const fileNames = contextFiles.map((f) => f.name || 'unnamed file').join(', ');
  return `\n\n[Attached files in conversation: ${fileNames}. Use the file_query_search tool to search and retrieve information from these files.]`;
}

// Always tell the model the URL of any attached image — even when Vision is
// on this doubles as the reference edit_image needs, and when Vision is off
// it's the only way a non-vision model can act on the image at all.
export function buildImageInstruction(contextImages: AttachmentRef[], visionEnabled: boolean): string {
  const imageList = contextImages.map((f) => `${f.name || 'unnamed image'}: ${f.url}`).join('\n');
  return visionEnabled
    ? `\n\n[Attached image URLs (also shown to you above):\n${imageList}\nPass one of these URLs to the edit_image tool if asked to modify it.]`
    : `\n\n[Attached images (Vision is off, you cannot see their contents):\n${imageList}\nPass one of these URLs to the edit_image tool if asked to modify one.]`;
}

// Whether an "other" attachment is actually text is only known once we try to
// decode it: small UTF-8 files are inlined, large ones are returned for the
// file_query_search path, and anything that doesn't decode (or fetch) is
// reported as unreadable rather than sent to the model.
export async function fetchInlineableTextFiles(
  otherFileParts: AttachmentRef[],
  thresholdBytes = 128 * 1024,
): Promise<{
  inlineTextFiles: Array<{ name: string; text: string }>;
  unreadableFiles: Array<{ name: string }>;
  largeTextFiles: AttachmentRef[];
}> {
  const inlineTextFiles: Array<{ name: string; text: string }> = [];
  const unreadableFiles: Array<{ name: string }> = [];
  const largeTextFiles: AttachmentRef[] = [];

  await Promise.all(
    otherFileParts.map(async (file) => {
      const name = file.name || 'unnamed file';
      try {
        const res = await fetch(file.url, { signal: AbortSignal.timeout(15_000) });
        if (!res.ok) {
          unreadableFiles.push({ name });
          return;
        }
        const bytes = new Uint8Array(await res.arrayBuffer());
        let text: string | null;
        try {
          text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
        } catch {
          text = null;
        }
        if (text === null) {
          unreadableFiles.push({ name });
          return;
        }
        if (bytes.byteLength <= thresholdBytes) {
          inlineTextFiles.push({ name, text });
        } else {
          largeTextFiles.push({ url: file.url, contentType: file.contentType || 'text/plain', name: file.name });
        }
      } catch {
        unreadableFiles.push({ name });
      }
    }),
  );

  return { inlineTextFiles, unreadableFiles, largeTextFiles };
}
