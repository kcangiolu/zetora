// Accessors over model objects — client-safe, shared by the server and the UI.
import { LABS, PROVIDERS } from '@/ai/catalog/config';
import { modelKey } from '@/ai/catalog/build';
import type { Model, ModelProvider } from './types';
import type { ReasoningCapability } from '@/lib/reasoning-effort-types';

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

// Finds a model by its catalog id, or by the same id spelled differently.
export function findModel(models: Model[], id: string | undefined): Model | undefined {
  if (!id) return undefined;
  const exact = models.find((model) => model.value === id);
  if (exact) return exact;
  const separator = id.indexOf(':');
  if (separator < 0) return undefined;
  const prefix = id.slice(0, separator + 1);
  const key = modelKey(id.slice(separator + 1));
  return models.find((model) => model.value.startsWith(prefix) && modelKey(model.value.slice(prefix.length)) === key);
}

// Whether a stored selection names a catalog model this instance no longer
// offers: retired upstream, or its provider's key was removed. Only meaningful
// once the catalog has been read. A custom model is left alone, since its
// provider not answering right now says nothing about the model.
export function isRetiredModelSelection(selected: string, catalogModels: Model[]): boolean {
  if (selected === DEFAULT_MODEL_ALIAS || selected === AUTO_MODEL_ID || selected.startsWith('custom-')) return false;
  return !findModel(catalogModels, selected);
}

export function getProviderName(provider: ModelProvider): string {
  if (provider === 'custom') return 'Custom';
  if (provider === 'zetora') return 'Zetora';
  return (
    PROVIDERS.find((entry) => entry.id === provider)?.name ?? LABS.find((lab) => lab.id === provider)?.name ?? provider
  );
}

// Order of the picker's provider tabs.
export const PROVIDER_ORDER: ModelProvider[] = PROVIDERS.map((provider) => provider.id);

// Order of the lab groups inside a provider's tab.
export const LAB_ORDER: string[] = LABS.map((lab) => lab.id);

export function getLabName(lab: string): string {
  return LABS.find((entry) => entry.id === lab)?.name ?? lab;
}

// The provider to show next to a model's name: the one serving it, when that
// is not the lab's own API (Qwen through Groq, Gemini through Agent Platform).
export function getServingProviderName(model: Model): string | undefined {
  return model.lab && model.lab !== model.provider ? getProviderName(model.provider) : undefined;
}

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
