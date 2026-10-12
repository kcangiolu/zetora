import { getCatalogModels } from '@/ai/catalog/models';
import { getRoleModelId } from '@/ai/catalog/roles';
import { loadModelCatalog } from '@/ai/catalog/store';

export const dynamic = 'force-dynamic';

// The model picker's catalog. Public: signed-out visitors see it too.
export async function GET() {
  await loadModelCatalog();
  return Response.json({
    models: getCatalogModels(),
    defaultModelId: getRoleModelId('default') ?? null,
    fastModelId: getRoleModelId('fast') ?? null,
  });
}
