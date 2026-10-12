import 'server-only';

import {
  AUTO_MODEL_ID,
  DEFAULT_CONTEXT_WINDOW,
  DEFAULT_MAX_OUTPUT_TOKENS,
  DEFAULT_MODEL_ALIAS,
} from '@/ai/models/helpers';
import type { Model, ModelParameters } from '@/ai/models/types';
import type { ReasoningEffort } from '@/lib/reasoning-effort-types';
import { canonicalModelId } from './legacy-ids';
import { getSamplingParameters } from './overrides';
import { getReasoningCapabilityFor } from './reasoning';
import { getCatalogEntries, getCatalogEntry } from './store';
import { getTaskModelId } from './task-models';
import type { CatalogEntry } from './types';

// Models released this recently get the "new" badge.
const NEW_MODEL_DAYS = 30;

// Resolves any stored model id — current, legacy, or the default alias — to
// its catalog entry.
export function getModelEntry(id: string): CatalogEntry | undefined {
  const canonical = canonicalModelId(id);
  if (canonical === DEFAULT_MODEL_ALIAS) {
    const defaultModelId = getTaskModelId('default');
    return defaultModelId ? getCatalogEntry(defaultModelId) : undefined;
  }
  return getCatalogEntry(canonical);
}

function isRecentRelease(releaseDate: string | undefined): boolean {
  if (!releaseDate) return false;
  return Date.now() - new Date(releaseDate).getTime() < NEW_MODEL_DAYS * 24 * 60 * 60 * 1000;
}

function toModel(entry: CatalogEntry): Model {
  return {
    value: entry.id,
    label: entry.label,
    description: entry.description,
    provider: entry.lab,
    vision: entry.vision,
    pdf: entry.pdf,
    reasoning: entry.reasoning !== null,
    reasoningControl: getReasoningCapabilityFor(entry),
    structuredOutput: entry.structuredOutput,
    maxOutputTokens: entry.maxOutputTokens ?? DEFAULT_MAX_OUTPUT_TOKENS,
    contextWindow: entry.contextWindow,
    releaseDate: entry.releaseDate,
    experimental: entry.status !== undefined,
    isNew: isRecentRelease(entry.releaseDate),
  };
}

const AUTO_MODEL: Model = {
  value: AUTO_MODEL_ID,
  label: 'Auto',
  description: 'Automatically routes your query to the best model',
  provider: 'zetora',
  vision: true,
  pdf: true,
  reasoning: false,
  structuredOutput: true,
  maxOutputTokens: DEFAULT_MAX_OUTPUT_TOKENS,
  experimental: false,
};

// What the model picker lists: the virtual Auto entry, then the catalog.
export function getCatalogModels(): Model[] {
  return [AUTO_MODEL, ...getCatalogEntries().map(toModel)];
}

function getModelConfig(id: string): Model | undefined {
  if (id === AUTO_MODEL_ID) return AUTO_MODEL;
  const entry = getModelEntry(id);
  return entry && toModel(entry);
}

export function hasVisionSupport(id: string): boolean {
  return getModelConfig(id)?.vision ?? false;
}

export function getMaxOutputTokens(id: string): number {
  return getModelEntry(id)?.maxOutputTokens ?? DEFAULT_MAX_OUTPUT_TOKENS;
}

// Real input+output context window for a catalog model. Custom (llama.cpp/
// Ollama/vLLM) models don't go through this — see resolveContextWindow() in
// lib/context-window.ts, which probes their backend directly.
export function getContextWindow(id: string): number {
  return getModelEntry(id)?.contextWindow ?? DEFAULT_CONTEXT_WINDOW;
}

export function getModelParameters(id: string, effort?: ReasoningEffort): ModelParameters {
  const entry = getModelEntry(id);
  return entry ? getSamplingParameters(entry.lab, entry.reasoning !== null && effort !== 'off') : {};
}
