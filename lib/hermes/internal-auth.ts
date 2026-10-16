import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { serverEnv } from '@/env/server';
import { secretsEqual } from '@/lib/secure-compare';

// Gates every /api/internal/hermes/* route, called only by hermes-relay-service over the
// compose network. That network isn't itself a trust boundary — zetora-app's port is not
// loopback-restricted by default (see docker-compose.yml) — so this header check is the
// real access control, same posture as CRON_SECRET on the lookout callbacks (lib/lookout-auth.ts).
export function assertInternalHermesAuth(req: NextRequest): NextResponse | null {
  const secret = serverEnv.HERMES_RELAY_INTERNAL_SECRET;
  if (!secret || secret === 'placeholder') {
    return NextResponse.json(
      { error: 'Hermes relay endpoint disabled: HERMES_RELAY_INTERNAL_SECRET is not configured' },
      { status: 503 },
    );
  }
  if (!secretsEqual(req.headers.get('Authorization'), `Bearer ${secret}`)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  return null;
}
