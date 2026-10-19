import { ModelUnavailableError } from '@/ai/catalog/task-models';

import { isContextLengthError } from './context-budget';

// The message the chat shows when a stream fails.
export function getStreamErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.includes('Rate Limit')) {
    return 'Oops, you have reached the rate limit! Please try again later.';
  }
  if (error instanceof ModelUnavailableError) return error.message;
  if (isContextLengthError(error)) {
    return "Oops, this conversation is too long for this model's context window! Start a new conversation or switch to a model with a larger context window.";
  }
  return 'Oops, an error occurred!';
}
