import { AUTO_MODEL_ID, DEFAULT_MODEL_ALIAS, canonicalModelId } from '@/ai/models';
import { getModelEntry } from '@/ai/catalog/models';
import { ModelUnavailableError, getTaskModel } from '@/ai/catalog/task-models';
import type { UserPreferenceValues } from '@/lib/db/schema';
import { ChatSDKError } from '@/lib/errors';

interface AutoRoute {
  name: string;
  description: string;
  model: string;
}

// The model that answers this turn: the auto router's pick when Auto is selected, the
// user's (else the instance's) default for the default alias, then its catalog id, so
// provider options and saved messages name the model actually called.
export async function resolveTurnModel({
  requestedModel,
  autoRouting,
  query,
  hasImages,
  preferences,
}: {
  requestedModel: string;
  // The user's routes when the request asked for auto-routing.
  autoRouting: { routes: AutoRoute[] } | null;
  // The last user message's text, what the router classifies.
  query: string;
  hasImages: boolean;
  preferences: UserPreferenceValues | undefined;
}): Promise<{ model: string; autoRouteName?: string } | ChatSDKError> {
  let model = requestedModel.trim();
  let autoRouteName: string | undefined;

  if (autoRouting && requestedModel === AUTO_MODEL_ID) {
    if (autoRouting.routes.length === 0) {
      return new ChatSDKError('not_found:model', 'Auto mode has no routes: add some in Settings → AI Models.');
    }
    // A message without text, like the router's "other" route, goes to the default model.
    if (query) {
      const { routeWithAutoRouter } = await import('@/lib/search/auto-router');
      const routeResult = await routeWithAutoRouter({ query, routes: autoRouting.routes, hasImages });
      if (!routeResult.success || !routeResult.model) {
        return new ChatSDKError('not_found:model', routeResult.error ?? 'Auto Router failed to route the query');
      }
      model = routeResult.model;
      autoRouteName = routeResult.route;
    } else {
      model = DEFAULT_MODEL_ALIAS;
      autoRouteName = 'other';
    }
  }

  if (canonicalModelId(model) === DEFAULT_MODEL_ALIAS) {
    try {
      model = getTaskModel('default', preferences);
    } catch (error) {
      if (error instanceof ModelUnavailableError) return new ChatSDKError('not_found:model', error.message);
      throw error;
    }
  }

  // Stored selections can hold a legacy id.
  if (!model.startsWith('custom-')) model = getModelEntry(model)?.id ?? model;
  return { model, autoRouteName };
}
