'use client';

import { useCallback, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { DEFAULT_MODEL_ALIAS, findModel, type Model, type TertiaryTask } from '@/ai/models';

interface CatalogResponse {
  models: Model[];
  // The model each task runs on when the user hasn't picked one.
  taskModelIds: Partial<Record<TertiaryTask, string | null>>;
  // ZETORA_MODEL_* values naming a model the catalog cannot reach.
  unavailableTaskModels: Partial<Record<TertiaryTask, string>>;
}

const NO_MODELS: Model[] = [];

async function fetchModels<T>(url: string, empty: T): Promise<T> {
  const response = await fetch(url);
  return response.ok ? ((await response.json()) as T) : empty;
}

// Every model the user can pick: the instance's catalog (built server-side
// from models.dev, see ai/catalog/) followed by the user's own custom
// provider models.
export function useModels() {
  const catalog = useQuery({
    queryKey: ['modelCatalog'],
    queryFn: () =>
      fetchModels<CatalogResponse>('/api/models', { models: [], taskModelIds: {}, unavailableTaskModels: {} }),
    staleTime: 60 * 60 * 1000,
  });
  // Same key as Settings, which invalidates it whenever custom providers change.
  const custom = useQuery({
    queryKey: ['customModels'],
    queryFn: () => fetchModels<{ models: Model[] }>('/api/custom-providers/models', { models: [] }),
    staleTime: 60_000,
  });

  const catalogModels = catalog.data?.models ?? NO_MODELS;
  const customModels = custom.data?.models ?? NO_MODELS;
  const taskModelIds = catalog.data?.taskModelIds;
  const unavailableTaskModels = catalog.data?.unavailableTaskModels;
  const defaultModelId = taskModelIds?.default ?? null;
  const models = useMemo(() => [...catalogModels, ...customModels], [catalogModels, customModels]);

  // Resolves any stored id: current, legacy, or the default alias.
  const getModel = useCallback(
    (id: string | undefined) => findModel(models, id === DEFAULT_MODEL_ALIAS ? (defaultModelId ?? undefined) : id),
    [models, defaultModelId],
  );

  return {
    models,
    catalogModels,
    customModels,
    taskModelIds,
    unavailableTaskModels,
    getModel,
    isLoading: catalog.isLoading,
  };
}
