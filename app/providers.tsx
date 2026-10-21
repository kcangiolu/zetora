'use client';

import { ThemeProvider } from 'next-themes';
import { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { UserProvider } from '@/contexts/user-context';
import { DataStreamProvider } from '@/components/data-stream-provider';
import { SpeechProvider } from '@/contexts/speech-context';
import { LocaleProvider } from '@/contexts/locale-context';

// Create a client
const queryClient = new QueryClient({
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
                't3chat',
                'claudedark',
                'claudelight',
                'neutrallight',
                'neutraldark',
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
