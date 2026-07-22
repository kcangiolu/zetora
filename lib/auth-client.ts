import { createAuthClient } from 'better-auth/react';
import { lastLoginMethodClient, twoFactorClient } from 'better-auth/client/plugins';

export const authClient = createAuthClient({
  baseURL: process.env.NODE_ENV === 'production' ? process.env.NEXT_PUBLIC_APP_URL : 'http://localhost:3000',
  plugins: [lastLoginMethodClient(), twoFactorClient()],
});

export const { signIn, signOut, signUp, useSession } = authClient;
