import 'server-only';

import { desc, eq } from 'drizzle-orm';
import { dodosubscription } from '../schema';
import { ChatSDKError } from '../../errors';
import { maindb } from '../index';
import {
  getDodoSubscriptions,
  setDodoSubscriptions,
  getDodoProStatus,
  setDodoProStatus,
} from '../../performance-cache';
import { encryptMcpCredentials, decryptMcpCredentials } from '@/lib/mcp/crypto';

type DodoSubscriptionRow = typeof dodosubscription.$inferSelect;

function getValidDate(value: Date | string | null | undefined): Date | null {
  if (!value) return null;
  if (value instanceof Date) return value;

  const parsedDate = new Date(value);
  return Number.isNaN(parsedDate.getTime()) ? null : parsedDate;
}

function isActiveDodoSubscriptionRecord(
  subscriptionRow: {
    currentPeriodEnd: Date | string | null;
    status: string;
    cancelAtPeriodEnd: boolean | null;
  },
  now: Date,
): boolean {
  const periodEnd = getValidDate(subscriptionRow.currentPeriodEnd);
  const isWithinPaidPeriod = !periodEnd || periodEnd > now;

  if (!isWithinPaidPeriod) return false;
  if (subscriptionRow.status === 'active') return true;
  if (subscriptionRow.status === 'cancelled' && subscriptionRow.cancelAtPeriodEnd === true) return true;

  return false;
}

async function getCachedOrFreshDodoSubscriptions(userId: string) {
  const cachedSubscriptions = getDodoSubscriptions(userId);
  if (cachedSubscriptions) return cachedSubscriptions as DodoSubscriptionRow[];

  const subscriptions = await maindb
    .select()
    .from(dodosubscription)
    .where(eq(dodosubscription.userId, userId))
    .orderBy(desc(dodosubscription.createdAt));

  setDodoSubscriptions(userId, subscriptions);
  return subscriptions;
}

// Cache user lookups for the duration of the request

// Dodo Subscription CRUD operations
export async function getDodoSubscriptionsByUserId({ userId }: { userId: string }) {
  try {
    return await getCachedOrFreshDodoSubscriptions(userId);
  } catch (error) {
    throw new ChatSDKError('bad_request:database', 'Failed to get Dodo subscriptions by user id');
  }
}

export async function getDodoSubscriptionById({ subscriptionId }: { subscriptionId: string }) {
  try {
    const [selectedSubscription] = await maindb
      .select()
      .from(dodosubscription)
      .where(eq(dodosubscription.id, subscriptionId))
      .limit(1);
    return selectedSubscription;
  } catch (error) {
    throw new ChatSDKError('bad_request:database', 'Failed to get Dodo subscription by id');
  }
}

export async function getActiveDodoSubscriptionsByUserId({ userId }: { userId: string }) {
  try {
    const allSubscriptions = await getCachedOrFreshDodoSubscriptions(userId);
    const now = new Date();
    return allSubscriptions
      .filter((subscriptionRow: DodoSubscriptionRow) => isActiveDodoSubscriptionRecord(subscriptionRow, now))
      .toSorted((subscriptionA: DodoSubscriptionRow, subscriptionB: DodoSubscriptionRow) => {
        const periodEndA = getValidDate(subscriptionA.currentPeriodEnd)?.getTime() ?? 0;
        const periodEndB = getValidDate(subscriptionB.currentPeriodEnd)?.getTime() ?? 0;

        return periodEndB - periodEndA;
      });
  } catch (error) {
    throw new ChatSDKError('bad_request:database', 'Failed to get active Dodo subscriptions by user id');
  }
}

export async function getTotalDodoSubscriptionAmountByUserId({ userId }: { userId: string }) {
  try {
    const subscriptions = await getActiveDodoSubscriptionsByUserId({ userId });
    return subscriptions.reduce((total: number, sub: DodoSubscriptionRow) => total + (sub.amount || 0), 0);
  } catch (error) {
    console.error('Error getting total subscription amount:', error);
    return 0;
  }
}

export async function hasActiveDodoSubscription({ userId }: { userId: string }) {
  try {
    // Check cache first for overall status
    const cachedStatus = getDodoProStatus(userId);
    if (cachedStatus !== null) {
      // Backward compatibility: handle both old (hasSubscriptions) and new (isProUser) cache formats
      return cachedStatus.isProUser ?? cachedStatus.hasSubscriptions ?? false;
    }

    // Use maindb to avoid replication lag and getActiveDodoSubscriptionsByUserId
    // which now handles cancelled subscriptions correctly
    const subscriptions = await getActiveDodoSubscriptionsByUserId({ userId });
    const hasSubscriptions = subscriptions.length > 0;

    // Cache the result
    const statusData = { hasSubscriptions, isProUser: hasSubscriptions };
    setDodoProStatus(userId, statusData);

    return hasSubscriptions;
  } catch (error) {
    console.error('Error checking Dodo Subscription status:', error);
    return false;
  }
}

export async function isDodoSubscriptionExpired({ userId }: { userId: string }) {
  try {
    const subscriptions = await getActiveDodoSubscriptionsByUserId({ userId });
    return subscriptions.length === 0;
  } catch (error) {
    console.error('Error checking Dodo Subscription expiration:', error);
    return true;
  }
}

export async function getDodoSubscriptionExpirationInfo({ userId }: { userId: string }) {
  try {
    const subscriptions = await getActiveDodoSubscriptionsByUserId({ userId });

    if (subscriptions.length === 0) {
      return null;
    }

    const mostRecentSubscription = subscriptions.find(
      (subscriptionRow: DodoSubscriptionRow) => subscriptionRow.currentPeriodEnd,
    );
    if (!mostRecentSubscription) {
      return null;
    }

    const expirationDate = getValidDate(mostRecentSubscription.currentPeriodEnd);
    if (!expirationDate) return null;

    // Calculate days until expiration
    const now = new Date();
    const diffTime = expirationDate.getTime() - now.getTime();
    const daysUntilExpiration = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    return {
      subscriptionDate: mostRecentSubscription.createdAt,
      expirationDate,
      daysUntilExpiration,
      isExpired: daysUntilExpiration <= 0,
      isExpiringSoon: daysUntilExpiration <= 7 && daysUntilExpiration > 0,
    };
  } catch (error) {
    console.error('Error getting Dodo Subscription expiration info:', error);
    return null;
  }
}

// Lookout CRUD operations
