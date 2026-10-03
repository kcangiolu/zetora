import { ModelMessage } from 'ai';

export type AttachmentRef = { url: string; contentType: string; name?: string };

// Shared identity for every image kept in context, uploaded or generated, so
// both kinds can be labeled with a stable "Image N of M" anchor next to
// their pixels (see labelUploadedImagesInPlace and
// appendGeneratedImagePartsToLastUserMessage). Without this, an image just
// sits in its turn with nothing tying it to an identity, so a model asked
// about "the first image" or "the picture from before" has only raw
// position to go on — which is what causes images to get mixed up once a
// few pile up in one conversation.
export type ContextImageRef = AttachmentRef & {
  turnIndex: number;
  sourceMessageId: string;
};

// Extra identity carried only for generate_image/edit_image outputs, so each
// one can be labeled distinctly when several end up in the same request
// (see appendGeneratedImagePartsToLastUserMessage) instead of arriving as
// unlabeled sibling image parts the model has no way to tell apart.
export type GeneratedImageRef = ContextImageRef & {
  toolCallId?: string;
  prompt?: string;
  seed?: number;
};

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
//
// Images produced by generate_image/edit_image never arrive as a `file`
// part — the tool result is plain JSON containing an imageUrl — so they're
// picked up separately here and reported in contextGeneratedImages too.
// Unlike uploaded images, nothing elsewhere in the message array already
// carries their bytes/URL as a model content part, so stripFilePartsForModel
// has nothing to keep for them; the caller must inject a fresh image part
// (see appendGeneratedImagePartsToLastUserMessage) to make them visible.
export function collectAttachments(
  messages: Array<{ id?: string; role?: string; parts?: unknown }>,
  hiddenImageUrls?: Set<string>,
): {
  contextFiles: AttachmentRef[];
  contextImages: ContextImageRef[];
  contextUploadedImages: ContextImageRef[];
  contextGeneratedImages: GeneratedImageRef[];
  otherFileParts: AttachmentRef[];
} {
  const contextFiles: AttachmentRef[] = [];
  const contextImages: ContextImageRef[] = [];
  const contextUploadedImages: ContextImageRef[] = [];
  const contextGeneratedImages: GeneratedImageRef[] = [];
  const otherFileParts: AttachmentRef[] = [];
  const seenUrls = new Set<string>();
  const seenImageUrls = new Set<string>();
  const seenOtherUrls = new Set<string>();

  // Counts user turns as they're walked, so a tool part reached right after
  // the Nth user message is stamped turnIndex=N — the same numbering as
  // userMessageCount at the route.ts call site, which appendGeneratedImagePartsToLastUserMessage
  // uses as "current turn" to compute each image's recency label.
  let turnIndex = 0;
  for (const msg of messages) {
    if (msg.role === 'user') turnIndex++;
    const parts = (msg.parts as any[]) ?? [];
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
            const ref: ContextImageRef = {
              url,
              contentType: mediaType,
              name: filePart.name,
              turnIndex,
              sourceMessageId: msg.id ?? '',
            };
            contextImages.push(ref);
            contextUploadedImages.push(ref);
          }
        } else if (!seenOtherUrls.has(url)) {
          seenOtherUrls.add(url);
          otherFileParts.push({ url, contentType: mediaType, name: filePart.name });
        }
      } else if (part.type === 'tool-generate_image' || part.type === 'tool-edit_image') {
        const toolPart = part as any;
        if (toolPart.state !== 'output-available' || !toolPart.output?.success) continue;
        const url = toolPart.output.imageUrl || '';
        if (!url || hiddenImageUrls?.has(url)) continue;
        if (!seenImageUrls.has(url)) {
          seenImageUrls.add(url);
          const ref: GeneratedImageRef = {
            url,
            contentType: 'image/png',
            turnIndex,
            sourceMessageId: msg.id ?? '',
            toolCallId: toolPart.toolCallId,
            prompt: toolPart.output.prompt,
            seed: toolPart.output.seed,
          };
          contextImages.push(ref);
          contextGeneratedImages.push(ref);
        }
      }
    }
  }

  return { contextFiles, contextImages, contextUploadedImages, contextGeneratedImages, otherFileParts };
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

// Makes generate_image/edit_image output actually visible to the model.
// Uploaded images get this for free (their `file` part already carries the
// bytes/URL; stripFilePartsForModel just decides whether to keep it), but a
// generated image only ever exists as JSON text in a tool result, so there's
// no existing image content part to keep — one has to be added. Only call
// this when Vision is on; the URL-only text instruction from
// buildImageInstruction is what carries the "treat it as an object" ability
// (pass the URL to edit_image) in every case, vision on or off.
export function appendGeneratedImagePartsToLastUserMessage(
  messages: ModelMessage[],
  images: GeneratedImageRef[],
  currentTurnIndex: number,
): void {
  if (images.length === 0) return;
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i] as any;
    if (msg.role !== 'user') continue;
    const labeledParts = images.flatMap((img, idx) => [
      { type: 'text', text: buildGeneratedImageLabel(img, idx, images.length, currentTurnIndex) },
      { type: 'image', image: img.url, mediaType: img.contentType },
    ]);
    if (Array.isArray(msg.content)) {
      msg.content.push(...labeledParts);
    } else {
      const textContent = typeof msg.content === 'string' ? msg.content : '';
      msg.content = [{ type: 'text', text: textContent }, ...labeledParts];
    }
    return;
  }
}

// Gives each image an explicit ordinal + recency + prompt so a model shown
// several at once (e.g. "critique the most recent one") has textual grounding
// to keep them distinct instead of a bare unlabeled sibling-image array.
function buildGeneratedImageLabel(img: GeneratedImageRef, idx: number, total: number, currentTurnIndex: number): string {
  const turnsAgo = currentTurnIndex - img.turnIndex;
  const recency = turnsAgo <= 0 ? 'most recent, generated just now' : `generated ${turnsAgo} turn${turnsAgo === 1 ? '' : 's'} ago`;
  const promptPart = img.prompt ? `, prompt: "${img.prompt}"` : '';
  return `\n\n[Image ${idx + 1} of ${total} — ${recency}${promptPart}. When discussing this image, refer to it as "Image ${idx + 1}".]`;
}

// Same anchor generated images get above, but for images the user attached
// directly — those otherwise have no per-image label at all, only a flat
// URL list at the very end of the conversation (buildImageInstruction),
// decoupled from wherever the pixels actually sit in history.
function buildUploadedImageLabel(img: ContextImageRef, ordinal: number, total: number, currentTurnIndex: number): string {
  const turnsAgo = currentTurnIndex - img.turnIndex;
  const recency = turnsAgo <= 0 ? 'most recent, attached just now' : `attached ${turnsAgo} turn${turnsAgo === 1 ? '' : 's'} ago`;
  return `\n\n[Uploaded image ${ordinal} of ${total} — ${recency}. When discussing this image, refer to it as "Uploaded image ${ordinal}".]`;
}

// Inserts that label immediately before each uploaded image's existing file
// part, in place. Unlike generated images, an uploaded image already has a
// content part carrying its pixels (kept in place by stripFilePartsForModel)
// — there's nothing to append, just a label to slot in next to what's
// already there. Only call this when Vision is on; with it off the file
// parts have already been stripped, so this is a no-op anyway.
export function labelUploadedImagesInPlace(
  messages: ModelMessage[],
  uploadedImages: ContextImageRef[],
  currentTurnIndex: number,
): void {
  if (uploadedImages.length === 0) return;
  const total = uploadedImages.length;
  const ordinalByUrl = new Map(uploadedImages.map((img, idx) => [img.url, idx + 1]));

  for (const msg of messages as any[]) {
    if (msg.role !== 'user' || !Array.isArray(msg.content)) continue;
    let touched = false;
    const labeled: any[] = [];
    for (const part of msg.content) {
      // convertToModelMessages puts a file part's URL in `data`.
      if (part.type === 'file' && typeof part.data === 'string' && ordinalByUrl.has(part.data)) {
        const ordinal = ordinalByUrl.get(part.data)!;
        labeled.push({ type: 'text', text: buildUploadedImageLabel(uploadedImages[ordinal - 1], ordinal, total, currentTurnIndex) });
        touched = true;
      }
      labeled.push(part);
    }
    if (touched) msg.content = labeled;
  }
}

export function buildFileInstruction(contextFiles: AttachmentRef[]): string {
  const fileNames = contextFiles.map((f) => f.name || 'unnamed file').join(', ');
  return `\n\n[Attached files in conversation: ${fileNames}. Use the file_query_search tool to search and retrieve information from these files.]`;
}

// Always tell the model the URL of any attached image — even when Vision is
// on this doubles as the reference edit_image needs, and when Vision is off
// it's the only way a non-vision model can act on the image at all. Ordinals
// here match labelUploadedImagesInPlace / appendGeneratedImagePartsToLastUserMessage
// exactly (both are built from these same two arrays, in the same order), so
// "Uploaded image 2" in this list is the same image labeled "Uploaded image
// 2" next to its pixels earlier in the conversation — not just a same-named
// but positionally decoupled reference.
export function buildImageInstruction(
  uploadedImages: ContextImageRef[],
  generatedImages: GeneratedImageRef[],
  visionEnabled: boolean,
): string {
  const uploadedLines = uploadedImages.map((f, i) => `Uploaded image ${i + 1} (${f.name || 'unnamed image'}): ${f.url}`);
  const generatedLines = generatedImages.map(
    (f, i) => `Generated image ${i + 1}${f.prompt ? ` (prompt: "${f.prompt}")` : ''}: ${f.url}`,
  );
  const imageList = [...uploadedLines, ...generatedLines].join('\n');
  return visionEnabled
    ? `\n\n[Attached image URLs (each one also shown to you above with a matching label):\n${imageList}\nPass one of these URLs to the edit_image tool if asked to modify it.]`
    : `\n\n[Attached images (Vision is off, you cannot see their contents):\n${imageList}\nPass one of these URLs to the edit_image tool if asked to modify one.]`;
}

// Fix-up pass for after pruneToContextBudget drops the oldest turns to fit
// the model's context window. Two things can go stale when that happens:
// the flat image list above still names every image from the whole
// conversation, including ones whose turn just got dropped; and generated
// images are appended fresh onto the last user message regardless of their
// source turn, so — unlike uploaded images, whose label+pixels live
// together in their own turn and vanish as one unit when that turn is
// pruned — pruning the turn a generated image came from does NOT remove it.
// Only call this when turnsRemoved > 0.
export function reconcileImageReferencesAfterPruning({
  messages,
  turnsRemoved,
  contextUploadedImages,
  contextGeneratedImages,
  visionEnabled,
  previousImageInstruction,
}: {
  messages: ModelMessage[];
  turnsRemoved: number;
  contextUploadedImages: ContextImageRef[];
  contextGeneratedImages: GeneratedImageRef[];
  visionEnabled: boolean;
  previousImageInstruction: string;
}): void {
  const survivingUploaded = contextUploadedImages.filter((img) => img.turnIndex > turnsRemoved);
  const survivingGenerated = contextGeneratedImages.filter((img) => img.turnIndex > turnsRemoved);
  const droppedGeneratedUrls = new Set(
    contextGeneratedImages.filter((img) => img.turnIndex <= turnsRemoved).map((img) => img.url),
  );
  const newImageInstruction =
    survivingUploaded.length + survivingGenerated.length > 0
      ? buildImageInstruction(survivingUploaded, survivingGenerated, visionEnabled)
      : '';

  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i] as any;
    if (msg.role !== 'user') continue;

    if (Array.isArray(msg.content)) {
      if (droppedGeneratedUrls.size > 0) {
        const kept: any[] = [];
        for (let idx = 0; idx < msg.content.length; idx++) {
          const part = msg.content[idx];
          const next = msg.content[idx + 1];
          if (part.type === 'text' && next?.type === 'image' && droppedGeneratedUrls.has(next.image)) {
            idx++; // also skip the paired image part
            continue;
          }
          if (part.type === 'image' && droppedGeneratedUrls.has(part.image)) continue;
          kept.push(part);
        }
        msg.content = kept;
      }
      // Not just "the last text part": once generated-image labels sit after
      // it in the array, that would grab a label instead of the text part
      // that actually holds the instruction blob.
      const targetIndex = msg.content.findIndex(
        (p: any) => p.type === 'text' && typeof p.text === 'string' && p.text.includes(previousImageInstruction),
      );
      if (targetIndex >= 0) {
        msg.content[targetIndex] = {
          ...msg.content[targetIndex],
          text: msg.content[targetIndex].text.split(previousImageInstruction).join(newImageInstruction),
        };
      }
    } else if (typeof msg.content === 'string') {
      msg.content = msg.content.split(previousImageInstruction).join(newImageInstruction);
    }
    return;
  }
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
