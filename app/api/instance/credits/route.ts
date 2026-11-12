import { serverEnv } from '@/env/server';
import { withAuth } from '@/lib/api/route-handlers';
import { getProviderCredits } from '@/lib/instance/provider-credits';

export const dynamic = 'force-dynamic';

// The credit left on the instance's provider keys, shown only when
// ZETORA_SHOW_COSTS is on: that credit belongs to the instance owner.
export const GET = withAuth(async () => {
  if (!serverEnv.ZETORA_SHOW_COSTS) {
    return Response.json({ error: 'Costs are not shown on this instance (ZETORA_SHOW_COSTS).' }, { status: 404 });
  }
  return Response.json({ credits: await getProviderCredits() });
});
