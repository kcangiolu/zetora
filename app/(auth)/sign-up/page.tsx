import { Suspense } from 'react';
import { connection } from 'next/server';
import AuthCard from '@/components/auth-card';
import { enabledSocialProviders } from '@/lib/auth';

async function SignUpContent() {
  // The providers come from the instance's .env, which the image is built without.
  await connection();
  return (
    <AuthCard
      title="Create an account"
      description="Get started with AI-powered research and real-time citations."
      mode="sign-up"
      socialProviders={enabledSocialProviders}
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
