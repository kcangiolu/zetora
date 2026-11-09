import { getCatalogModels } from '@/ai/catalog/models';
import { getTaskModelIds, getUnavailableTaskModels } from '@/ai/catalog/task-models';
import { getCatalogStatus, loadModelCatalog } from '@/ai/catalog/store';

export const dynamic = 'force-dynamic';

// The model picker's catalog. Public: the About page lists it.
export async function GET() {
  await loadModelCatalog();
  return Response.json({
    models: getCatalogModels(),
    // Told apart from an empty list, which an instance without keys has by design.
    catalogRead: getCatalogStatus().fetchedAt !== null,
    taskModelIds: getTaskModelIds(),
    unavailableTaskModels: getUnavailableTaskModels(),
  });
}
