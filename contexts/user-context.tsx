'use client';

import React, { createContext, useContext, ReactNode } from 'react';
import { useCachedUserData } from '@/hooks/use-cached-user-data';
import { type ComprehensiveUserData } from '@/lib/user-data';

interface UserContextType {
  // Core user data
  user: ComprehensiveUserData | null | undefined;
  isLoading: boolean;
  error: any;
  refetch: () => void;
  isRefetching: boolean;

  shouldBypassLimitsForModel: (selectedModel: string) => boolean;

  // Additional utilities
  isCached: boolean;
  clearCache: () => void;
}

const UserContext = createContext<UserContextType | undefined>(undefined);

interface UserProviderProps {
  children: ReactNode;
}

export function UserProvider({ children }: UserProviderProps) {
  const userData = useCachedUserData();

  return <UserContext.Provider value={userData}>{children}</UserContext.Provider>;
}

export function useUser(): UserContextType {
  const context = useContext(UserContext);

  if (context === undefined) {
    throw new Error('useUser must be used within a UserProvider');
  }

  return context;
}
