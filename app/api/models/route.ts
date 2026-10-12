import { getCatalogModels } from '@/ai/catalog/models';
import { getTaskModelIds } from '@/ai/catalog/task-models';
import { loadModelCatalog } from '@/ai/catalog/store';

export const dynamic = 'force-dynamic';

// The model picker's catalog. Public: the About page lists it.
export async function GET() {
  await loadModelCatalog();
  return Response.json({ models: getCatalogModels(), taskModelIds: getTaskModelIds() });
}
