import { convertToModelMessages, pruneMessages, type ModelMessage } from 'ai';

import { getHiddenContextImageUrlsByChatId } from '@/lib/db/queries';
import { createLogger } from '@/lib/logger';
import type { ChatMessage } from '@/lib/types';

import { appendToLastUserMessage } from './chat-initialization';
import { estimateTokenCount, PRUNE_TOKEN_THRESHOLD } from './context-budget';
import type { ImageReferences } from './fit-context-budget';
import {
  appendGeneratedImagePartsToLastUserMessage,
  buildFileInstruction,
  buildImageInstruction,
  collectAttachments,
  fetchInlineableTextFiles,
  labelUploadedImagesInPlace,
  stripFilePartsForModel,
} from './message-attachments';

const log = createLogger('search');

// The conversation as model messages, with what its attachments need: documents
// announced for file_query_search, images labelled and listed (shown to the model when
// vision is on), small text files inlined.
export async function prepareModelMessages({
  conversation,
  chatId,
  isTemporaryChat,
  visionEnabled,
}: {
  conversation: ChatMessage[];
  chatId: string;
  isTemporaryChat: boolean;
  visionEnabled: boolean;
}) {
  const converted = await convertToModelMessages(conversation, { ignoreIncompleteToolCalls: true });

  // A first, conservative cut on estimated size: one tool-heavy turn can be huge, and the
  // model's real context window is only known after auto-routing. The exact cut to the
  // window happens in fitToContextBudget.
  const estimatedTokens = estimateTokenCount(converted);
  let pruned = converted;
  if (estimatedTokens > PRUNE_TOKEN_THRESHOLD) {
    log.info(`🔧 Pruning messages: ~${estimatedTokens} estimated tokens (${conversation.length} total messages)`);
    pruned = pruneMessages({ reasoning: 'all', messages: converted, toolCalls: 'before-last-5-messages' });
    log.info(`✂️ Pruned to ${pruned.length} messages`);
  }

  // Images the user hid from the conversation stay out. A temporary chat has nothing saved.
  const hiddenImageUrls = isTemporaryChat
    ? new Set<string>()
    : new Set(await getHiddenContextImageUrlsByChatId({ chatId }));
  const { contextFiles, contextImages, contextUploadedImages, contextGeneratedImages, otherFileParts } =
    collectAttachments(conversation, hiddenImageUrls);

  const messages: ModelMessage[] = stripFilePartsForModel(pruned, visionEnabled);

  if (contextFiles.length > 0) appendToLastUserMessage(messages, buildFileInstruction(contextFiles));

  const userMessageCount = conversation.filter((message) => message.role === 'user').length;
  // An "Uploaded image N of M" anchor next to each image's pixels: otherwise the URL
  // list below is the only reference, detached from where the image sits.
  if (visionEnabled && contextUploadedImages.length > 0) {
    labelUploadedImagesInPlace(messages, contextUploadedImages, userMessageCount);
  }

  let imageInstruction: string | null = null;
  if (contextUploadedImages.length > 0 || contextGeneratedImages.length > 0) {
    imageInstruction = buildImageInstruction(contextUploadedImages, contextGeneratedImages, visionEnabled);
    appendToLastUserMessage(messages, imageInstruction);
  }

  // Generated images have no file part to keep: with vision on, this is what shows the
  // model their pixels.
  if (visionEnabled && contextGeneratedImages.length > 0) {
    appendGeneratedImagePartsToLastUserMessage(messages, contextGeneratedImages, userMessageCount);
  }

  if (otherFileParts.length > 0) {
    const { inlineTextFiles, unreadableFiles, largeTextFiles } = await fetchInlineableTextFiles(otherFileParts);
    // Too large to inline: searched with file_query_search like other documents.
    contextFiles.push(...largeTextFiles);

    if (inlineTextFiles.length > 0 || unreadableFiles.length > 0) {
      const inlineBlocks = inlineTextFiles
        .map((f) => `\n\n[Attached file: ${f.name}]\n\`\`\`\n${f.text}\n\`\`\``)
        .join('');
      const unreadableNote =
        unreadableFiles.length > 0
          ? `\n\n[Could not read as text, skipped: ${unreadableFiles.map((f) => f.name).join(', ')}]`
          : '';
      appendToLastUserMessage(messages, inlineBlocks + unreadableNote);
    }

    if (largeTextFiles.length > 0) {
      const fileNames = otherFileParts
        .filter((o) => contextFiles.some((f) => f.url === o.url))
        .map((f) => f.name || 'unnamed file')
        .join(', ');
      appendToLastUserMessage(
        messages,
        `\n\n[Large attached files: ${fileNames}. Use the file_query_search tool to search and retrieve information from these files.]`,
      );
    }
  }

  const images: ImageReferences = {
    instruction: imageInstruction,
    uploaded: contextUploadedImages,
    generated: contextGeneratedImages,
    visionEnabled,
  };
  return { messages, contextFiles, contextImages, images };
}
