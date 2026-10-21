import type { Attachment, ChatMessage } from '@/lib/types';

// Zetora's file parts carry the original file name next to the SDK's fields.
type NamedFilePart = Extract<ChatMessage['parts'][number], { type: 'file' }> & { name?: string };

// A message's file parts, in the shape the attachment badges read.
export function getFileAttachments(parts: ChatMessage['parts']): Attachment[] {
  return parts
    .filter((part): part is NamedFilePart => part.type === 'file')
    .map((part) => ({ name: part.name ?? '', url: part.url, mediaType: part.mediaType }));
}
