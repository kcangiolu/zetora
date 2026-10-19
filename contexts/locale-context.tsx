'use client';

import { createContext, useContext, type ReactNode } from 'react';

const LocaleContext = createContext<string | undefined>(undefined);

// The request's locale (lib/locale.ts), the same on the server and in the
// browser so formatted dates hydrate without a mismatch.
export function LocaleProvider({ locale, children }: { locale: string; children: ReactNode }) {
  return <LocaleContext.Provider value={locale}>{children}</LocaleContext.Provider>;
}

export function useLocale(): string {
  const locale = useContext(LocaleContext);
  if (locale === undefined) {
    throw new Error('useLocale must be used within a LocaleProvider');
  }
  return locale;
}
