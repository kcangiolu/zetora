// Accessors over model objects — client-safe, shared by the server and the UI.
import { LABS } from '@/ai/catalog/config';
import { modelKey } from '@/ai/catalog/build';
import { canonicalModelId } from '@/ai/catalog/legacy-ids';
import type { Model, ModelProvider } from './types';
import type { ReasoningCapability } from '@/lib/reasoning-effort-types';

export { canonicalModelId };

// The virtual model that lets the auto-router pick per message.
export const AUTO_MODEL_ID = 'zetora-auto';

// Stands for whatever model the instance uses by default (see
// ai/catalog/task-models.ts), wherever a model id is stored or sent.
export const DEFAULT_MODEL_ALIAS = 'zetora-default';

// The tiny router model behind the auto-router task, served by Hugging Face
// (ai/providers.ts). Not a chat model, so never part of the catalog.
export const ARCH_ROUTER_MODEL = { id: 'zetora-arch-router', label: 'Arch-Router 1.5B' } as const;

// Fallbacks for models whose limits aren't published — most hosted models
// support at least this much.
export const DEFAULT_CONTEXT_WINDOW = 128_000;
export const DEFAULT_MAX_OUTPUT_TOKENS = 8000;

// Finds a model by any id it may be stored under: current, legacy, or
// spelled differently from host to host.
export function findModel(models: Model[], id: string | undefined): Model | undefined {
  if (!id) return undefined;
  const canonical = canonicalModelId(id);
  const exact = models.find((model) => model.value === canonical);
  if (exact) return exact;
  const separator = canonical.indexOf(':');
  if (separator < 0) return undefined;
  const lab = canonical.slice(0, separator);
  const key = modelKey(canonical.slice(separator + 1));
  return models.find((model) => model.provider === lab && modelKey(model.value.slice(lab.length + 1)) === key);
}

export function getProviderName(provider: ModelProvider): string {
  if (provider === 'custom') return 'Custom';
  if (provider === 'zetora') return 'Zetora';
  return LABS.find((lab) => lab.id === provider)?.name ?? provider;
}

// Lab order for the picker's provider tabs.
export const PROVIDER_ORDER: ModelProvider[] = LABS.map((lab) => lab.id);

// The reasoning-effort toggle's mode for a model: see Model.reasoningControl.
export function getReasoningControl(model: Model | undefined): ReasoningCapability {
  if (!model?.reasoning) return null;
  return model.reasoningControl ?? null;
}

// Get acceptable file types for a model
export function getAcceptedFileTypes(model: Model | undefined): string {
  // Document file types for file_query_search tool - available for ALL models
  const documentTypes = '.csv,.xlsx,.xls,.docx';
  // JSON and JSON-derived formats — accepted as plain text server-side (see
  // isTextLikeType in app/api/upload) but must be listed explicitly here or
  // the native OS file picker greys them out despite being supported.
  const jsonTypes = '.json,.jsonl,.ndjson,.geojson,.jsonc';

  // Images are always attachable — the in-chat Vision toggle governs whether
  // they're injected into the model's context or just hosted + handed to it
  // as a URL (see app/api/search/route.ts). A non-vision model can still act
  // on an image via tools like edit_image without ever "seeing" it.
  if (model?.pdf) {
    return `image/*,.pdf,${documentTypes},${jsonTypes}`;
  }
  return `image/*,${documentTypes},${jsonTypes}`;
}
