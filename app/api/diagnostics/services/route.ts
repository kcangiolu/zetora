import { z } from 'zod';
import { parseBody, withAuth } from '@/lib/api/route-handlers';
import { ChatSDKError } from '@/lib/errors';
import { SERVICE_CHECKS } from '@/lib/diagnostics/services';

// Lists every service the app itself depends on, plus whether this
// deployment has it configured — the settings dialog uses this to render
// one row per service and hide the ones intentionally dropped for this
// deployment (see the "optional service" note atop docker-compose.yml).
export const GET = withAuth(async () => {
  return Response.json({
    services: SERVICE_CHECKS.map((service) => ({
      id: service.id,
      label: service.label,
      configured: service.configured(),
    })),
  });
});

const testServiceSchema = z.object({ serviceId: z.string() });

// One button per service in the Diagnostics tab posts here to run that
// service's check on demand — mirrors the MCP "test connection" pattern.
export const POST = withAuth(async (request) => {
  const { serviceId } = await parseBody(request, testServiceSchema);
  const service = SERVICE_CHECKS.find((s) => s.id === serviceId);
  if (!service) throw new ChatSDKError('not_found:api', 'Unknown service');

  const start = Date.now();
  const result = await service.run();
  return Response.json({
    id: serviceId,
    ok: result.ok,
    detail: result.detail,
    latencyMs: Date.now() - start,
  });
});
