'use server';

import { getCurrentUser } from './user';

import { geolocation } from '@vercel/functions';
import { UIMessage, generateText, Output } from 'ai';
import type { ModelMessage } from 'ai';
import { getUser } from '@/lib/auth-utils';
import { hasVisionSupport, zetora, resolveModel } from '@/ai/providers';
import { maindb } from '@/lib/db';
import { dodosubscription } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { getDiscountConfig } from '@/lib/discount';
import { GroqProviderOptions, groq } from '@ai-sdk/groq';
import {
  createBullMqSchedule,
  scheduleBullMqOnce,
  deleteBullMqSchedule,
  pauseBullMqSchedule,
  resumeBullMqSchedule,
  getLockoutProvider,
} from '@/lib/services/bullmq';
import type { CharacterAlignmentResponseModel } from '@elevenlabs/elevenlabs-js/api/types/CharacterAlignmentResponseModel';
import {
  usageCountCache,
  createMessageCountKey,
  createExtremeCountKey,
  createAnthropicCountKey,
  createGoogleCountKey,
  createAgentModeCountKey,
} from '@/lib/performance-cache';
import {
  getComprehensiveUserData,
  getLightweightUserAuth,
  getCachedUserPreferencesByUserId,
  clearUserPreferencesCache,
} from '@/lib/user-data-server';
import {
  createConnection,
  listUserConnections,
  deleteConnection,
  manualSync,
  getSyncStatus,
  type ConnectorProvider,
} from '@/lib/connectors';
import { headers } from 'next/headers';
import { lookoutCallbackHeaders, lookoutQstashHeaders } from '@/lib/lookout-auth';
import { saveChat, saveMessages } from '@/lib/db/queries';
import { all, allSettled } from 'better-all';

import { createLogger } from '@/lib/logger';

const log = createLogger('billing');

export async function getSubDetails() {
  'use server';

  // Import here to avoid issues with SSR
  const { getComprehensiveUserData } = await import('@/lib/user-data-server');
  const userData = await getComprehensiveUserData();

  if (!userData) return { hasSubscription: false };

  return userData.polarSubscription
    ? {
        hasSubscription: true,
        subscription: userData.polarSubscription,
      }
    : { hasSubscription: false };
}

export async function previewMaxUpgrade() {
  'use server';

  try {
    const user = await getUser();
    if (!user) {
      return { success: false, error: 'Authentication required' };
    }

    const { getComprehensiveUserData } = await import('@/lib/user-data-server');
    const { dodoPayments } = await import('@/lib/auth');
    const userData = await getComprehensiveUserData();
    if (!userData) {
      return { success: false, error: 'User data not found' };
    }

    if (userData.isMaxUser) {
      return { success: false, error: 'Already on Max plan' };
    }

    const maxProductId = process.env.NEXT_PUBLIC_MAX_TIER;
    if (!maxProductId) {
      return { success: false, error: 'NEXT_PUBLIC_MAX_TIER environment variable is required' };
    }

    if (userData.proSource !== 'dodo') {
      return { success: false, error: 'Preview is only available for active Dodo subscriptions' };
    }

    const dodoProProductId = process.env.NEXT_PUBLIC_PREMIUM_TIER;
    if (!dodoProProductId) {
      return { success: false, error: 'NEXT_PUBLIC_PREMIUM_TIER environment variable is required' };
    }

    const activeDodoProSub = await maindb.query.dodosubscription.findFirst({
      where: and(
        eq(dodosubscription.userId, user.id),
        eq(dodosubscription.productId, dodoProProductId),
        eq(dodosubscription.status, 'active'),
      ),
      orderBy: (table, { desc }) => [desc(table.updatedAt), desc(table.createdAt)],
    });

    if (!activeDodoProSub?.id) {
      return { success: false, error: 'Active Dodo Pro subscription not found' };
    }

    log.debug('ℹ️ [UPGRADE] previewMaxUpgrade selected subscription:', {
      userId: user.id,
      subscriptionId: activeDodoProSub.id,
      productId: activeDodoProSub.productId,
      status: activeDodoProSub.status,
      amount: activeDodoProSub.amount,
      currency: activeDodoProSub.currency,
      interval: activeDodoProSub.interval,
      currentPeriodStart: activeDodoProSub.currentPeriodStart,
      currentPeriodEnd: activeDodoProSub.currentPeriodEnd,
      targetProductId: maxProductId,
    });

    const preview = await dodoPayments.subscriptions.previewChangePlan(activeDodoProSub.id, {
      product_id: maxProductId,
      quantity: 1,
      proration_billing_mode: 'prorated_immediately',
    });

    log.debug('ℹ️ [UPGRADE] previewMaxUpgrade Dodo preview summary:', {
      subscriptionId: activeDodoProSub.id,
      totalAmount: preview.immediate_charge.summary.total_amount,
      currency: preview.immediate_charge.summary.currency,
      settlementAmount: preview.immediate_charge.summary.settlement_amount,
      settlementCurrency: preview.immediate_charge.summary.settlement_currency,
      lineItems: preview.immediate_charge.line_items,
    });

    return {
      success: true,
      subscriptionId: activeDodoProSub.id,
      preview: {
        totalAmount: preview.immediate_charge.summary.total_amount,
        currency: preview.immediate_charge.summary.currency,
        settlementAmount: preview.immediate_charge.summary.settlement_amount,
        settlementCurrency: preview.immediate_charge.summary.settlement_currency,
        lineItems: preview.immediate_charge.line_items,
      },
    };
  } catch (error) {
    log.error('❌ [UPGRADE] previewMaxUpgrade error:', error);
    return { success: false, error: 'Failed to preview Max upgrade. Please try again.' };
  }
}

export async function upgradeToMax() {
  'use server';

  try {
    const user = await getUser();
    if (!user) {
      return { success: false, error: 'Authentication required' };
    }

    const { getComprehensiveUserData } = await import('@/lib/user-data-server');
    const { dodoPayments } = await import('@/lib/auth');
    const userData = await getComprehensiveUserData();
    if (!userData) {
      return { success: false, error: 'User data not found' };
    }

    if (userData.isMaxUser) {
      return { success: false, error: 'Already on Max plan' };
    }

    const maxProductId = process.env.NEXT_PUBLIC_MAX_TIER;
    if (!maxProductId) {
      return { success: false, error: 'NEXT_PUBLIC_MAX_TIER environment variable is required' };
    }

    if (userData.proSource === 'dodo') {
      const dodoProProductId = process.env.NEXT_PUBLIC_PREMIUM_TIER;
      if (!dodoProProductId) {
        return { success: false, error: 'NEXT_PUBLIC_PREMIUM_TIER environment variable is required' };
      }

      const activeDodoProSub = await maindb.query.dodosubscription.findFirst({
        where: and(
          eq(dodosubscription.userId, user.id),
          eq(dodosubscription.productId, dodoProProductId),
          eq(dodosubscription.status, 'active'),
        ),
        orderBy: (table, { desc }) => [desc(table.updatedAt), desc(table.createdAt)],
      });

      if (!activeDodoProSub?.id) {
        return { success: false, error: 'Active Dodo Pro subscription not found' };
      }

      log.debug('ℹ️ [UPGRADE] upgradeToMax selected subscription:', {
        userId: user.id,
        subscriptionId: activeDodoProSub.id,
        productId: activeDodoProSub.productId,
        status: activeDodoProSub.status,
        amount: activeDodoProSub.amount,
        currency: activeDodoProSub.currency,
        interval: activeDodoProSub.interval,
        currentPeriodStart: activeDodoProSub.currentPeriodStart,
        currentPeriodEnd: activeDodoProSub.currentPeriodEnd,
        targetProductId: maxProductId,
      });

      await dodoPayments.subscriptions.changePlan(activeDodoProSub.id, {
        product_id: maxProductId,
        quantity: 1,
        proration_billing_mode: 'prorated_immediately',
        on_payment_failure: 'prevent_change',
      });

      return { success: true, redirect: '/success' };
    }

    // Free users and Polar Pro users should complete Max via checkout.
    // Polar revocation happens in the Dodo webhook handler after Max becomes active.
    return { success: true, redirect: '/pricing' };
  } catch (error) {
    log.error('❌ [UPGRADE] upgradeToMax error:', error);
    return { success: false, error: 'Something went wrong. Please try again.' };
  }
}

export async function previewDowngradeToPro() {
  'use server';

  try {
    const user = await getUser();
    if (!user) {
      return { success: false, error: 'Authentication required' };
    }

    const { getComprehensiveUserData } = await import('@/lib/user-data-server');
    const { dodoPayments } = await import('@/lib/auth');
    const userData = await getComprehensiveUserData();
    if (!userData) {
      return { success: false, error: 'User data not found' };
    }

    if (!userData.isMaxUser || userData.proSource !== 'dodo') {
      return { success: false, error: 'Preview is only available for active Dodo Max subscriptions' };
    }

    const dodoMaxProductId = process.env.NEXT_PUBLIC_MAX_TIER;
    const dodoProProductId = process.env.NEXT_PUBLIC_PREMIUM_TIER;
    if (!dodoMaxProductId) {
      return { success: false, error: 'NEXT_PUBLIC_MAX_TIER environment variable is required' };
    }
    if (!dodoProProductId) {
      return { success: false, error: 'NEXT_PUBLIC_PREMIUM_TIER environment variable is required' };
    }

    const activeDodoMaxSub = await maindb.query.dodosubscription.findFirst({
      where: and(eq(dodosubscription.userId, user.id), eq(dodosubscription.productId, dodoMaxProductId)),
      orderBy: (table, { desc }) => [desc(table.createdAt)],
    });

    if (!activeDodoMaxSub?.id) {
      return { success: false, error: 'Active Dodo Max subscription not found' };
    }

    const preview = await dodoPayments.subscriptions.previewChangePlan(activeDodoMaxSub.id, {
      product_id: dodoProProductId,
      quantity: 1,
      proration_billing_mode: 'difference_immediately',
    });

    return {
      success: true,
      subscriptionId: activeDodoMaxSub.id,
      preview: {
        totalAmount: preview.immediate_charge.summary.total_amount,
        currency: preview.immediate_charge.summary.currency,
        settlementAmount: preview.immediate_charge.summary.settlement_amount,
        settlementCurrency: preview.immediate_charge.summary.settlement_currency,
        lineItems: preview.immediate_charge.line_items,
      },
    };
  } catch (error) {
    log.error('❌ [DOWNGRADE] previewDowngradeToPro error:', error);
    return { success: false, error: 'Failed to preview Pro downgrade. Please try again.' };
  }
}

export async function downgradeToPro() {
  'use server';

  try {
    const user = await getUser();
    if (!user) {
      return { success: false, error: 'Authentication required' };
    }

    const { getComprehensiveUserData } = await import('@/lib/user-data-server');
    const { dodoPayments } = await import('@/lib/auth');
    const userData = await getComprehensiveUserData();
    if (!userData) {
      return { success: false, error: 'User data not found' };
    }

    if (!userData.isMaxUser || userData.proSource !== 'dodo') {
      return { success: false, error: 'Downgrade is only available for active Dodo Max subscriptions' };
    }

    const dodoMaxProductId = process.env.NEXT_PUBLIC_MAX_TIER;
    const dodoProProductId = process.env.NEXT_PUBLIC_PREMIUM_TIER;
    if (!dodoMaxProductId) {
      return { success: false, error: 'NEXT_PUBLIC_MAX_TIER environment variable is required' };
    }
    if (!dodoProProductId) {
      return { success: false, error: 'NEXT_PUBLIC_PREMIUM_TIER environment variable is required' };
    }

    const activeDodoMaxSub = await maindb.query.dodosubscription.findFirst({
      where: and(eq(dodosubscription.userId, user.id), eq(dodosubscription.productId, dodoMaxProductId)),
      orderBy: (table, { desc }) => [desc(table.createdAt)],
    });

    if (!activeDodoMaxSub?.id) {
      return { success: false, error: 'Active Dodo Max subscription not found' };
    }

    await dodoPayments.subscriptions.changePlan(activeDodoMaxSub.id, {
      product_id: dodoProProductId,
      quantity: 1,
      proration_billing_mode: 'difference_immediately',
      on_payment_failure: 'prevent_change',
    });

    return { success: true, redirect: '/success' };
  } catch (error) {
    log.error('❌ [DOWNGRADE] downgradeToPro error:', error);
    return { success: false, error: 'Failed to downgrade to Pro. Please try again.' };
  }
}

type DiscountConfigParams = {
  email?: string | null;
  isIndianUser?: boolean;
};

export async function getDiscountConfigAction(params?: DiscountConfigParams) {
  try {
    let userEmail = params?.email ?? null;

    if (!userEmail) {
      const user = await getCurrentUser();
      userEmail = user?.email ?? null;
    }

    let isIndianUser = params?.isIndianUser;

    if (isIndianUser === undefined) {
      try {
        const headersList = await headers();
        const request = { headers: headersList };
        const locationData = geolocation(request);
        const country = (locationData.country || '').toUpperCase();
        isIndianUser = country === 'IN';
      } catch (geoError) {
        log.warn('Geolocation lookup failed in getDiscountConfigAction:', geoError);
        isIndianUser = false;
      }
    }

    return await getDiscountConfig(userEmail ?? undefined, isIndianUser);
  } catch (error) {
    log.error('Error getting discount configuration:', error);
    return {
      enabled: false,
    };
  }
}

// Initialize QStash client
