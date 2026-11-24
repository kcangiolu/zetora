import { Suspense } from 'react';
import { connection } from 'next/server';
import { redirect } from 'next/navigation';
import AuthCard from '@/components/auth-card';
import { serverEnv } from '@/env/server';
import { enabledSocialProviders, enabledSsoProviders, passwordSignInEnabled } from '@/lib/auth';

async function SignUpContent() {
  // The providers come from the instance's .env, which the image is built without.
  await connection();
  // Under SSO only, accounts are created at the first single sign-on.
  if (!serverEnv.ALLOW_SIGNUPS || !passwordSignInEnabled) redirect('/sign-in');
  return (
    <AuthCard
      title="Create an account"
      description="Get started with AI-powered research and real-time citations."
      mode="sign-up"
      socialProviders={enabledSocialProviders}
      ssoProviders={enabledSsoProviders}
      passwordSignIn={passwordSignInEnabled}
      allowSignUps
    />
  );
}

export default function SignUpPage() {
  return (
    <Suspense>
      <SignUpContent />
    </Suspense>
  );
}
