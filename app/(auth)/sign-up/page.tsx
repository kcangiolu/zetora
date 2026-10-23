import { Suspense } from 'react';
import { connection } from 'next/server';
import { redirect } from 'next/navigation';
import AuthCard from '@/components/auth-card';
import { serverEnv } from '@/env/server';
import { enabledSocialProviders } from '@/lib/auth';

async function SignUpContent() {
  // The providers come from the instance's .env, which the image is built without.
  await connection();
  if (!serverEnv.ALLOW_SIGNUPS) redirect('/sign-in');
  return (
    <AuthCard
      title="Create an account"
      description="Get started with AI-powered research and real-time citations."
      mode="sign-up"
      socialProviders={enabledSocialProviders}
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
