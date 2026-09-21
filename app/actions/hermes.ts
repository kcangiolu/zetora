'use server';

import { randomBytes } from 'node:crypto';
import { getCurrentUser } from './user';
import { createHermesConnector, getHermesConnectorByUserId, getHermesChatLock, revokeHermesConnector } from '@/lib/db/queries/hermes';
import { getChatByIdForValidation } from '@/lib/db/queries/chat';
import { hashEnrollmentToken } from '@/lib/hermes/crypto';
import { isHermesEnabled } from '@/lib/hermes/feature-flag';
import { serverEnv } from '@/env/server';
import { createLogger } from '@/lib/logger';

const log = createLogger('actions-hermes');

const ENROLLMENT_TOKEN_TTL_MS = 15 * 60 * 1000;

// Generates a fresh, short-lived enrollment token and returns the exact `hermes gateway
// enroll` command for the Settings > Hermes tab to display. Re-running this while a
// connector already exists rotates the token (and, once redeemed, the gateway secret) —
// createHermesConnector upserts on the unique userId.
export async function createHermesEnrollmentAction() {
  'use server';

  if (!isHermesEnabled()) {
    return { success: false as const, error: 'Hermes is not enabled on this deployment' };
  }

  try {
    const user = await getCurrentUser();
    if (!user) {
      return { success: false as const, error: 'Authentication required' };
    }

    if (serverEnv.HERMES_RELAY_PUBLIC_URL === 'placeholder') {
      return { success: false as const, error: 'Hermes relay is not configured on this deployment' };
    }

    if (!process.env.NEXT_PUBLIC_APP_URL) {
      return { success: false as const, error: 'Hermes relay is not configured on this deployment' };
    }

    const enrollmentToken = randomBytes(24).toString('base64url');
    const connector = await createHermesConnector({
      userId: user.id,
      enrollmentTokenHash: hashEnrollmentToken(enrollmentToken),
      enrollmentTokenExpiresAt: new Date(Date.now() + ENROLLMENT_TOKEN_TTL_MS),
    });

    const relayUrl = `${serverEnv.HERMES_RELAY_PUBLIC_URL.replace(/\/$/, '')}/relay`;
    const idpTokenUrl = `${process.env.NEXT_PUBLIC_APP_URL.replace(/\/$/, '')}/api/hermes/idp-token/${enrollmentToken}`;
    // Two things `hermes gateway enroll` needs that aren't its own flags: the ambient
    // identity-token URL it fetches BEFORE enrolling (gateway.idp.token_url — see
    // gateway/relay/__init__.py's _resolve_relay_identity_token, mode 1b) is set via env
    // var prefix here rather than asking the user to hand-edit config.yaml.
    // --gateway-id is deliberately omitted: the CLI defaults to gw-<hostname>, which we
    // accept and store as-is (see app/api/internal/hermes/enroll/route.ts).
    const enrollCommand = `GATEWAY_RELAY_IDP_TOKEN_URL=${idpTokenUrl} hermes gateway enroll --connector-url ${relayUrl} --token ${enrollmentToken}`;

    return {
      success: true as const,
      enrollCommand,
      expiresAt: connector.enrollmentTokenExpiresAt,
    };
  } catch (error) {
    log.error('Failed to create Hermes enrollment:', error);
    return { success: false as const, error: 'Failed to create enrollment' };
  }
}

export async function getHermesConnectorStatusAction() {
  'use server';

  if (!isHermesEnabled()) {
    return { success: true as const, connector: null };
  }

  try {
    const user = await getCurrentUser();
    if (!user) {
      return { success: false as const, error: 'Authentication required', connector: null };
    }

    const connector = await getHermesConnectorByUserId(user.id);
    if (!connector) {
      return { success: true as const, connector: null };
    }

    return {
      success: true as const,
      connector: {
        status: connector.status,
        label: connector.label,
        gatewaySecretPrefix: connector.gatewaySecretPrefix,
        lastConnectedAt: connector.lastConnectedAt,
        lastDisconnectedAt: connector.lastDisconnectedAt,
        lastError: connector.lastError,
      },
    };
  } catch (error) {
    log.error('Failed to fetch Hermes connector status:', error);
    return { success: false as const, error: 'Failed to fetch status', connector: null };
  }
}

// Which mode lane `chatId` is permanently committed to — null for a chat that hasn't
// received its first message yet (still free to become either). Drives
// components/ui/form-component/index.tsx hiding the now-irrelevant mode option; the
// actual enforcement is server-side in /api/search and /api/hermes/send, this is UI only.
export async function getHermesChatLockAction(chatId: string) {
  'use server';

  if (!isHermesEnabled()) {
    return { success: true as const, lock: null };
  }

  try {
    const user = await getCurrentUser();
    if (!user) {
      return { success: false as const, error: 'Authentication required', lock: null };
    }

    const chat = await getChatByIdForValidation({ id: chatId });
    if (chat && chat.userId !== user.id) {
      return { success: false as const, error: 'Chat not found', lock: null };
    }
    if (!chat) {
      // Not persisted yet (a brand-new, unsent chat) — unlocked by definition.
      return { success: true as const, lock: null };
    }

    const lock = await getHermesChatLock(chatId);
    return { success: true as const, lock };
  } catch (error) {
    log.error('Failed to resolve Hermes chat lock:', error);
    return { success: false as const, error: 'Failed to resolve chat lock', lock: null };
  }
}

export async function revokeHermesConnectorAction() {
  'use server';

  if (!isHermesEnabled()) {
    return { success: false as const, error: 'Hermes is not enabled on this deployment' };
  }

  try {
    const user = await getCurrentUser();
    if (!user) {
      return { success: false as const, error: 'Authentication required' };
    }

    const connector = await getHermesConnectorByUserId(user.id);
    if (!connector) {
      return { success: false as const, error: 'No Hermes connector to revoke' };
    }

    await revokeHermesConnector({ id: connector.id, userId: user.id });
    return { success: true as const };
  } catch (error) {
    log.error('Failed to revoke Hermes connector:', error);
    return { success: false as const, error: 'Failed to revoke connector' };
  }
}
