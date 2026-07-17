import { Suspense } from 'react';
import TwoFactorVerifyCard from '@/components/two-factor-verify-card';

export default function TwoFactorPage() {
  return (
    <Suspense>
      <TwoFactorVerifyCard />
    </Suspense>
  );
}
