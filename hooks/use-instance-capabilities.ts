'use client';

import { useQuery } from '@tanstack/react-query';
import type { InstanceCapabilities } from '@/lib/instance/capabilities';

// What this instance has (see lib/instance/capabilities.ts). Undefined while
// loading: callers hide the optional parts until it arrives rather than
// flashing options the instance may not have.
export function useInstanceCapabilities(): InstanceCapabilities | undefined {
  const { data } = useQuery({
    queryKey: ['instanceCapabilities'],
    queryFn: async () => {
      const response = await fetch('/api/instance/capabilities');
      if (!response.ok) throw new Error('Failed to load instance capabilities');
      return (await response.json()) as InstanceCapabilities;
    },
    staleTime: 60 * 60 * 1000,
  });
  return data;
}
