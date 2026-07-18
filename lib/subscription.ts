import { eq } from 'drizzle-orm';
import { subscription, dodosubscription } from './db/schema';
import { db, maindb } from './db';
import { auth } from './auth';
import { headers } from 'next/headers';
import {
  getProUserStatus,
  setProUserStatus,
  getDodoSubscriptions,
  setDodoSubscriptions,
  setDodoProStatus,
} from './performance-cache';
import { flow } from 'better-all';
import { getBetterAllOptions } from './better-all';

import { createLogger } from '@/lib/logger';

const log = createLogger('subscription');

// Combined function to check Pro status from both Polar and Dodo Subscriptions.
// Uses flow() to race both queries — exits as soon as either finds an active subscription.
async function getComprehensiveProStatus(
  userId: string,
): Promise<{ isProUser: boolean; source: 'polar' | 'dodo' | 'none' }> {
  type ProResult = { isProUser: boolean; source: 'polar' | 'dodo' | 'none' };
  try {
    const result = await flow<ProResult>(
      {
        async polarSubscriptions() {
          const subs = await db.select().from(subscription).where(eq(subscription.userId, userId));
          const active = subs.find((sub) => sub.status === 'active');
          if (active) {
            log.debug('🔥 Polar subscription found for user:', userId);
            this.$end({ isProUser: true, source: 'polar' });
          }
          return subs;
        },
        async dodoSubscriptions() {
          const cached = getDodoSubscriptions(userId);
          const subs =
            cached ??
            (await (async () => {
              const data = await maindb.select().from(dodosubscription).where(eq(dodosubscription.userId, userId));
              setDodoSubscriptions(userId, data);
              return data;
            })());
          const now = new Date();
          const active = subs.find((sub: any) => {
            const periodEnd = sub.currentPeriodEnd ? new Date(sub.currentPeriodEnd) : null;
            if (!periodEnd || periodEnd <= now) return false;
            return sub.status === 'active' || sub.status === 'cancelled';
          });
          if (active) {
            log.debug('🔥 Dodo subscription found for user:', userId);
            setDodoProStatus(userId, { isProUser: true, hasSubscriptions: true });
            this.$end({ isProUser: true, source: 'dodo' });
          }
          return subs;
        },
      },
      getBetterAllOptions(),
    );
    return result ?? { isProUser: false, source: 'none' };
  } catch (error) {
    log.error('Error getting comprehensive pro status:', error);
    return { isProUser: false, source: 'none' };
  }
}

// Fast pro user status check using cache
export async function isUserProCached(): Promise<boolean> {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session?.user?.id) {
    return false;
  }

  // Try cache first
  const cached = getProUserStatus(session.user.id);
  if (cached !== null) {
    return cached;
  }

  // Fallback to comprehensive check (both Polar and Dodo Subscriptions)
  const proStatus = await getComprehensiveProStatus(session.user.id);
  setProUserStatus(session.user.id, proStatus.isProUser);
  return proStatus.isProUser;
}
