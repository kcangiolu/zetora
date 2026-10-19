import { ModelUnavailableError } from '@/ai/catalog/task-models';
import { ChatSDKError } from '@/lib/errors';
import { getImageModerationModelId, moderateImages } from '@/lib/image-moderation';
import { createLogger } from '@/lib/logger';
import type { ChatMessage } from '@/lib/types';

const log = createLogger('search');

// The error to answer with when the instance moderates images and one in the new user
// message is blocked, or cannot be checked. Runs before anything is saved, so a blocked
// image never reaches the model or the history.
export async function moderateRequestImages(message: ChatMessage, signal: AbortSignal): Promise<ChatSDKError | null> {
  const imageUrls = message.parts.flatMap((part) =>
    part.type === 'file' && part.mediaType.startsWith('image/') ? [part.url] : [],
  );
  if (imageUrls.length === 0) return null;

  let modelId: string | undefined;
  try {
    modelId = getImageModerationModelId();
  } catch (error) {
    if (error instanceof ModelUnavailableError) return new ChatSDKError('not_found:model', error.message);
    throw error;
  }
  if (!modelId) return null;

  try {
    const verdict = await moderateImages(modelId, imageUrls, signal);
    return verdict.safe ? null : new ChatSDKError('forbidden:moderation', verdict.category);
  } catch (error) {
    log.error('Image moderation failed:', error);
    return new ChatSDKError('internal:moderation', error instanceof Error ? error.message : String(error), error);
  }
}
