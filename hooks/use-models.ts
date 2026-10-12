'use client';

import { useCallback, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { DEFAULT_MODEL_ALIAS, FAST_MODEL_ALIAS, findModel, type Model } from '@/ai/models';

interface CatalogResponse {
  models: Model[];
  defaultModelId: string | null;
  fastModelId: string | null;
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
    queryFn: () => fetchModels<CatalogResponse>('/api/models', { models: [], defaultModelId: null, fastModelId: null }),
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
  const defaultModelId = catalog.data?.defaultModelId ?? null;
  const fastModelId = catalog.data?.fastModelId ?? null;
  const models = useMemo(() => [...catalogModels, ...customModels], [catalogModels, customModels]);

  // Resolves any stored id: current, legacy, or a role alias.
  const getModel = useCallback(
    (id: string | undefined) => {
      const roleModelId = id === DEFAULT_MODEL_ALIAS ? defaultModelId : id === FAST_MODEL_ALIAS ? fastModelId : id;
      return findModel(models, roleModelId ?? undefined);
    },
    [models, defaultModelId, fastModelId],
  );

  return { models, catalogModels, customModels, defaultModelId, getModel, isLoading: catalog.isLoading };
}
