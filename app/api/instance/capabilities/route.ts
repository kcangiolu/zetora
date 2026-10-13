import { withAuth } from '@/lib/api/route-handlers';
import { getInstanceCapabilities } from '@/lib/instance/capabilities';

export const GET = withAuth(async () => Response.json(getInstanceCapabilities()));
