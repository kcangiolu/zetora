import { requiresAuthentication, requiresProSubscription, requiresMaxSubscription } from '@/ai/models';
import { ChatSDKError } from '@/lib/errors';
import type { SpecialModeId } from '@/lib/utils';

// Early exit checks (no DB operations needed). Returns the error to send
// back, or null when the user may proceed.
export function checkModelAccess({
  lightweightUser,
  model,
  specialMode,
}: {
  lightweightUser: { isProUser?: boolean; isMaxUser?: boolean } | null;
  model: string;
  // string covers extension-mode ids (lib/search/extension-modes.ts) as well
  // as the hardcoded SpecialModeId/'buddy' modes.
  specialMode: SpecialModeId | 'buddy' | string | undefined;
}): ChatSDKError | null {
  if (!lightweightUser) {
    if (requiresAuthentication(model)) {
      return new ChatSDKError('unauthorized:model', `${model} requires authentication`);
    }
    if (specialMode === 'mcp') {
      return new ChatSDKError('unauthorized:auth', 'Authentication required to use MCP mode');
    }
    // Extreme Search is no longer a mode you must be authenticated to select
    // — extreme_search is a base tool, gated via activeTools filtering
    // (signed-out users simply never get it offered).
    return null;
  }
  // Fast auth checks using lightweight user (no additional DB calls)
  if (requiresMaxSubscription(model) && !lightweightUser.isMaxUser) {
    return new ChatSDKError('upgrade_required:model', `${model} requires a Max subscription`);
  }
  if (requiresProSubscription(model) && !lightweightUser.isProUser && !lightweightUser.isMaxUser) {
    return new ChatSDKError('upgrade_required:model', `${model} requires a Pro subscription`);
  }
  if (specialMode === 'mcp' && !lightweightUser.isProUser && !lightweightUser.isMaxUser) {
    return new ChatSDKError('upgrade_required:auth', 'MCP mode requires a Pro subscription');
  }
  return null;
}

export function buildUnauthenticatedRateLimitError(result: {
  success: boolean;
  limit: number;
  reset: number;
}): ChatSDKError | null {
  if (result.success) return null;
  const resetDate = new Date(result.reset);
  return new ChatSDKError(
    'rate_limit:api',
    `You've reached the limit of ${result.limit} searches per day for unauthenticated users. Sign in for more searches or wait until ${resetDate.toLocaleString()}.`,
  );
}
