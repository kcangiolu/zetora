import { Suspense } from 'react';
import AuthCard from '@/components/auth-card';

function SignUpContent() {
  return (
    <AuthCard
      title="Create an account"
      description="Get started with AI-powered research and real-time citations."
      mode="sign-up"
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
