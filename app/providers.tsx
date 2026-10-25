'use client';

import { ThemeProvider } from 'next-themes';
import { ReactNode, useEffect } from 'react';
import { MutationCache, QueryCache, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { UserProvider } from '@/contexts/user-context';
import { DataStreamProvider } from '@/components/data-stream-provider';
import { SpeechProvider } from '@/contexts/speech-context';
import { LocaleProvider } from '@/contexts/locale-context';
import { reloadIfStaleDeployment } from '@/lib/stale-deployment';

// Create a client
const queryClient = new QueryClient({
  // Server Actions called through queries and mutations reject here, never reaching an error boundary.
  queryCache: new QueryCache({ onError: reloadIfStaleDeployment }),
  mutationCache: new MutationCache({ onError: reloadIfStaleDeployment }),
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5, // 5 minutes - increased to reduce unnecessary refetches
      refetchOnWindowFocus: false, // Disabled globally for better performance - enable per-query if needed
      refetchOnMount: false, // Use cached data when available
      gcTime: 1000 * 60 * 30, // 30 minutes - keep cached data much longer
      retry: 3,
      retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
      // Use structural sharing to prevent unnecessary re-renders
      structuralSharing: true,
      // Keep showing placeholder data while fetching new data
      notifyOnChangeProps: ['data', 'error', 'isLoading'],
    },
  },
});

export function Providers({
  children,
  nonce,
  locale,
}: {
  children: ReactNode;
  nonce: string | undefined;
  locale: string;
}) {
  // Lazy chunks load outside React (dynamic imports in event handlers), so a
  // failure there never reaches an error boundary.
  useEffect(() => {
    const onError = (event: ErrorEvent) => reloadIfStaleDeployment(event.error);
    const onRejection = (event: PromiseRejectionEvent) => reloadIfStaleDeployment(event.reason);
    window.addEventListener('error', onError);
    window.addEventListener('unhandledrejection', onRejection);
    return () => {
      window.removeEventListener('error', onError);
      window.removeEventListener('unhandledrejection', onRejection);
    };
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <UserProvider>
        <DataStreamProvider>
          <SpeechProvider>
            <ThemeProvider
              nonce={nonce}
              attribute="class"
              defaultTheme="system"
              enableSystem
              disableTransitionOnChange
              themes={[
                'light',
                'dark',
                'colourful',
                'plum',
                'inkdark',
                'inklight',
                'neutrallight',
                'neutraldark',
                'midnight',
                'forest',
                'ember',
              ]}
            >
              <LocaleProvider locale={locale}>{children}</LocaleProvider>
            </ThemeProvider>
          </SpeechProvider>
        </DataStreamProvider>
      </UserProvider>
    </QueryClientProvider>
  );
}
