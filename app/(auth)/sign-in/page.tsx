import { Suspense } from 'react';
import { connection } from 'next/server';
import AuthCard from '@/components/auth-card';
import { enabledSocialProviders } from '@/lib/auth';

async function SignInContent() {
  // The providers come from the instance's .env, which the image is built without.
  await connection();
  return (
    <AuthCard
      title="Welcome back"
      description="Sign in to access your research history and continue where you left off."
      mode="sign-in"
      socialProviders={enabledSocialProviders}
    />
  );
}

export default function SignInPage() {
  return (
    <Suspense>
      <SignInContent />
    </Suspense>
  );
}
