'use client';

import { useQuery } from '@tanstack/react-query';
import { useInstanceCapabilities } from '@/hooks/use-instance-capabilities';
import type { ProviderCredit } from '@/lib/instance/provider-credits';

// The credit left on the instance's provider keys, loaded only when the
// instance shows costs (ZETORA_SHOW_COSTS). The server caches it for minutes.
export function useProviderCredits(): ProviderCredit[] | undefined {
  const enabled = useInstanceCapabilities()?.costs === true;
  const { data } = useQuery({
    queryKey: ['providerCredits'],
    enabled,
    queryFn: async () => {
      const response = await fetch('/api/instance/credits');
      if (!response.ok) throw new Error('Failed to load the providers credit');
      const body: { credits: ProviderCredit[] } = await response.json();
      return body.credits;
    },
    staleTime: 5 * 60 * 1000,
  });
  return data;
}
