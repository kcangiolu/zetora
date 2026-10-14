import { betterAuth } from 'better-auth/minimal';
import { nextCookies } from 'better-auth/next-js';
import { lastLoginMethod, twoFactor } from 'better-auth/plugins';
import {
  user,
  session,
  verification,
  account,
  chat,
  message,
  messageUsage,
  customInstructions,
  stream,
  lookout,
  userMcpServer,
  twoFactor as twoFactorTable,
} from '@/lib/db/schema';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { maindb } from '@/lib/db';
import { config } from 'dotenv';
import { serverEnv } from '@/env/server';
import { invalidateSessionCacheForToken } from './user-data-server';
import { sendVerificationEmail, sendTwoFactorOTPEmail } from './email';
import { APIError } from 'better-auth/api';

import { createLogger } from '@/lib/logger';

const log = createLogger('auth');

config({
  path: '.env.local',
});

// Origins allowed for auth flows, driven entirely by env so a self-hosted
// fork works without editing this file. ALLOWED_ORIGINS is an optional
// comma-separated list for any additional domains.
const configuredOrigins = [
  process.env.NODE_ENV === 'production' ? undefined : 'http://localhost:3000',
  process.env.NEXT_PUBLIC_APP_URL,
  process.env.BETTER_AUTH_BASE_URL,
  ...(process.env.ALLOWED_ORIGINS?.split(',').map((o) => o.trim()) ?? []),
].filter((o): o is string => Boolean(o));

const trustedOrigins = Array.from(new Set(configuredOrigins));

// Set by app/api/auth/[...all]/route.ts from getClientIp(), so the sign-in
// rate limit cannot be dodged by sending a forged X-Forwarded-For.
export const CLIENT_IP_HEADER = 'x-zetora-client-ip';
export const UNTRUSTED_CLIENT_IP = '0.0.0.0';

export const auth = betterAuth({
  appName: 'zetora',
  baseURL: process.env.NODE_ENV === 'production' ? process.env.BETTER_AUTH_BASE_URL : 'http://localhost:3000',
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: true,
  },
  emailVerification: {
    sendOnSignUp: true,
    autoSignInAfterVerification: true,
    expiresIn: 3600,
    sendVerificationEmail: async ({ user, url }) => {
      await sendVerificationEmail({ to: user.email, url });
    },
  },
  rateLimit: {
    max: 100,
    window: 60,
  },
  experimental: { joins: true },
  advanced: {
    ipAddress: {
      ipAddressHeaders: [CLIENT_IP_HEADER],
    },
  },
  databaseHooks: {
    session: {
      delete: {
        before: async (session) => {
          // Immediately evict the token from the session cache on logout/revocation
          // so the 15-min TTL window can't be exploited with a stolen cookie
          invalidateSessionCacheForToken(session.token);
        },
      },
    },
    user: {
      create: {
        before: async () => {
          // Single choke point for every account-creation path (email/password
          // sign-up and every social provider's first-time OAuth sign-in all
          // route through here) — lets ALLOW_SIGNUPS=false close the instance
          // without touching each auth method separately.
          if (!serverEnv.ALLOW_SIGNUPS) {
            throw new APIError('FORBIDDEN', {
              message: 'You are not authorized to create an account',
              code: 'SIGNUPS_DISABLED',
            });
          }
        },
      },
    },
  },
  database: drizzleAdapter(maindb, {
    provider: 'pg',
    schema: {
      user,
      session,
      verification,
      account,
      chat,
      message,
      messageUsage,
      customInstructions,
      stream,
      lookout,
      userMcpServer,
      twoFactor: twoFactorTable,
    },
  }),
  socialProviders: {
    ...(serverEnv.GITHUB_CLIENT_ID && serverEnv.GITHUB_CLIENT_SECRET
      ? { github: { clientId: serverEnv.GITHUB_CLIENT_ID, clientSecret: serverEnv.GITHUB_CLIENT_SECRET } }
      : {}),
    ...(serverEnv.GOOGLE_CLIENT_ID && serverEnv.GOOGLE_CLIENT_SECRET
      ? { google: { clientId: serverEnv.GOOGLE_CLIENT_ID, clientSecret: serverEnv.GOOGLE_CLIENT_SECRET } }
      : {}),
    ...(serverEnv.TWITTER_CLIENT_ID && serverEnv.TWITTER_CLIENT_SECRET
      ? { twitter: { clientId: serverEnv.TWITTER_CLIENT_ID, clientSecret: serverEnv.TWITTER_CLIENT_SECRET } }
      : {}),
    ...(process.env.MICROSOFT_CLIENT_ID && process.env.MICROSOFT_CLIENT_SECRET
      ? {
          microsoft: {
            clientId: process.env.MICROSOFT_CLIENT_ID,
            clientSecret: process.env.MICROSOFT_CLIENT_SECRET,
            prompt: 'select_account',
          },
        }
      : {}),
  },
  plugins: [
    lastLoginMethod(),
    twoFactor({
      issuer: 'Zetora',
      otpOptions: {
        async sendOTP({ user, otp }) {
          await sendTwoFactorOTPEmail({ to: user.email, otp });
        },
      },
    }),
    nextCookies(),
  ],
  trustedOrigins,
  allowedOrigins: trustedOrigins,
});
