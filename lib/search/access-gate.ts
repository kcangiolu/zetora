import { ChatSDKError } from '@/lib/errors';

// Login is required to make any AI request. Any connected account has
// access to every model/mode — there is no Pro/Max tier left to gate on.
export function checkModelAccess({ lightweightUser }: { lightweightUser: unknown }): ChatSDKError | null {
  if (!lightweightUser) {
    return new ChatSDKError('unauthorized:auth', 'Sign in required');
  }
  return null;
}
