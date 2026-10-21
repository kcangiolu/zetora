'use client';

import React, { useState, useEffect } from 'react';
import { SidebarInset } from '@/components/ui/sidebar';
import { AppSidebar } from '@/components/app-sidebar';
import { ChatHistoryDialog } from '@/components/chat-history-dialog';
import { useUser } from '@/contexts/user-context';

export function SidebarLayout({ children }: { children: React.ReactNode }) {
  const { user } = useUser();
  const [commandDialogOpen, setCommandDialogOpen] = useState(false);

  // Keyboard shortcut for opening chat history (Cmd+K or Ctrl+K)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setCommandDialogOpen((prev) => !prev);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  return (
    <>
      <AppSidebar user={user || null} />
      <SidebarInset>{children}</SidebarInset>

      {/* Chat History Dialog */}
      <ChatHistoryDialog open={commandDialogOpen} onOpenChange={setCommandDialogOpen} user={user ?? null} />
    </>
  );
}
