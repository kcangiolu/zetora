'use client';

import { Button } from '@/components/ui/button';

import { Skeleton } from '@/components/ui/skeleton';

import { all } from 'better-all';

import { ArrowClockwiseIcon } from '@phosphor-icons/react';

import { Check } from 'lucide-react';

import { useState } from 'react';

import { useQuery, useMutation } from '@tanstack/react-query';

import { Loader2, Zap, CheckCircle2, XCircle } from 'lucide-react';

import { cn } from '@/lib/utils';

// Custom visx-based chart components

interface DiagnosticsServiceInfo {
  id: string;
  label: string;
  configured: boolean;
}

interface DiagnosticsResult {
  ok: boolean;
  detail?: string;
  latencyMs: number;
}

export function DiagnosticsSection() {
  const { data, isLoading, error } = useQuery({
    queryKey: ['diagnosticsServices'],
    queryFn: async () => {
      const response = await fetch('/api/diagnostics/services', { cache: 'no-store' });
      if (!response.ok) throw new Error('Failed to load service list');
      return response.json() as Promise<{ services: DiagnosticsServiceInfo[] }>;
    },
    staleTime: 60_000,
  });

  const [results, setResults] = useState<Record<string, DiagnosticsResult>>({});
  const [testingId, setTestingId] = useState<string | null>(null);

  const testMutation = useMutation({
    mutationFn: async (serviceId: string) => {
      setTestingId(serviceId);
      const response = await fetch('/api/diagnostics/services', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ serviceId }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body?.error || body?.message || 'Test failed');
      return body as { id: string; ok: boolean; detail?: string; latencyMs: number };
    },
    onSuccess: (result) => {
      setTestingId(null);
      setResults((prev) => ({ ...prev, [result.id]: result }));
    },
    onError: (mutationError: Error, serviceId) => {
      setTestingId(null);
      setResults((prev) => ({ ...prev, [serviceId]: { ok: false, detail: mutationError.message, latencyMs: 0 } }));
    },
  });

  const services = data?.services ?? [];
  const configuredServices = services.filter((s) => s.configured);

  const testAll = async () => {
    for (const service of configuredServices) {
      // Sequential on purpose: a stampede of simultaneous pings to every
      // local service right after a fresh `docker compose up` is the exact
      // scenario this panel exists to diagnose — don't add to the load.
      // eslint-disable-next-line no-await-in-loop
      await testMutation.mutateAsync(service.id).catch(() => null);
    }
  };

  return (
    <div className="space-y-6">
      {configuredServices.length > 0 && (
        <div className="flex justify-end">
          <Button
            variant="outline"
            size="sm"
            onClick={testAll}
            disabled={testingId !== null}
            className="gap-2 shrink-0"
          >
            <ArrowClockwiseIcon className={cn('h-4 w-4', testingId !== null && 'animate-spin')} />
            Test all
          </Button>
        </div>
      )}

      {isLoading ? (
        <div className="space-y-2">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </div>
      ) : error ? (
        <p className="text-sm text-red-600 dark:text-red-400">Failed to load the service list.</p>
      ) : configuredServices.length === 0 ? (
        <p className="text-sm text-muted-foreground">No local services are configured for this deployment.</p>
      ) : (
        <div className="space-y-2">
          {configuredServices.map((service) => {
            const result = results[service.id];
            const isTesting = testingId === service.id;
            return (
              <div
                key={service.id}
                className="flex items-center justify-between gap-3 rounded-lg border border-border/40 px-3 py-2.5"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{service.label}</p>
                  {result && (
                    <div
                      className={cn(
                        'flex items-center gap-1.5 text-xs mt-0.5',
                        result.ok ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400',
                      )}
                    >
                      {result.ok ? <CheckCircle2 className="h-3.5 w-3.5" /> : <XCircle className="h-3.5 w-3.5" />}
                      <span className="truncate">
                        {result.ok ? `OK · ${result.latencyMs}ms` : result.detail || 'Connection failed'}
                      </span>
                    </div>
                  )}
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => testMutation.mutate(service.id)}
                  disabled={isTesting}
                  className="gap-2 shrink-0"
                >
                  {isTesting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />}
                  {isTesting ? 'Testing...' : 'Test'}
                </Button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
