import React, { useState, useCallback, useMemo } from 'react';
import { ServiceIcon } from '@/components/mcp/service-icon';
import { ArrowUpRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ComprehensiveUserData } from '@/hooks/use-user-data';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerTrigger } from '@/components/ui/drawer';
import { Checkbox } from '@/components/ui/checkbox';
import { AppsIcon } from '@/components/icons/apps-icon';
import { useIsMobile } from '@/hooks/use-mobile';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useWebHaptics } from 'web-haptics/react';

interface McpServerSelectorProps {
  user: ComprehensiveUserData | null;
}

export const McpServerSelector: React.FC<McpServerSelectorProps> = React.memo(({ user }) => {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const isMobile = useIsMobile();
  const queryClient = useQueryClient();
  const router = useRouter();
  const haptics = useWebHaptics();

  const { data, isLoading } = useQuery({
    queryKey: ['mcpServers', user?.id],
    queryFn: async () => {
      const response = await fetch('/api/mcp/servers', { cache: 'no-store' });
      if (!response.ok) throw new Error('Failed to load MCP servers');
      return response.json() as Promise<{
        servers: Array<{
          id: string;
          name: string;
          url: string;
          isEnabled: boolean;
          transportType: string;
          authType: string;
          isOAuthConnected: boolean;
        }>;
      }>;
    },
    enabled: Boolean(user?.id),
    staleTime: 10_000,
  });

  const servers = useMemo(() => data?.servers ?? [], [data?.servers]);
  // Only count servers that are actually usable (OAuth servers must be connected)
  const isReady = (s: { authType: string; isOAuthConnected: boolean }) => s.authType !== 'oauth' || s.isOAuthConnected;
  const enabledCount = servers.filter((s) => s.isEnabled && isReady(s)).length;
  const showSearch = servers.length > 6;

  const filteredServers = useMemo(() => {
    const list = search.trim()
      ? servers.filter(
          (s) =>
            s.name.toLowerCase().includes(search.toLowerCase()) || s.url.toLowerCase().includes(search.toLowerCase()),
        )
      : servers;
    return [...list].sort((a, b) => {
      const score = (server: (typeof list)[number]) => {
        const ready = isReady(server);
        if (server.isEnabled && ready) return 3;
        if (server.isEnabled && !ready) return 2;
        if (!server.isEnabled && ready) return 1;
        return 0;
      };

      const rankDiff = score(b) - score(a);
      if (rankDiff !== 0) return rankDiff;
      return a.name.localeCompare(b.name);
    });
  }, [servers, search]);

  const handleToggle = (id: string, currentEnabled: boolean) => {
    haptics.trigger('selection');
    // Optimistic update — flip instantly in cache
    queryClient.setQueryData(['mcpServers', user?.id], (old: any) => {
      if (!old?.servers) return old;
      return { ...old, servers: old.servers.map((s: any) => (s.id === id ? { ...s, isEnabled: !currentEnabled } : s)) };
    });
    // Fire-and-forget sync
    fetch(`/api/mcp/servers/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isEnabled: !currentEnabled }),
    }).catch(() => {
      // Revert on failure
      queryClient.setQueryData(['mcpServers', user?.id], (old: any) => {
        if (!old?.servers) return old;
        return {
          ...old,
          servers: old.servers.map((s: any) => (s.id === id ? { ...s, isEnabled: currentEnabled } : s)),
        };
      });
    });
  };

  const handleOpenChange = useCallback(
    (nextOpen: boolean) => {
      setOpen(nextOpen);
      if (nextOpen) haptics.trigger('light');
      if (!nextOpen) setSearch('');
    },
    [haptics],
  );

  if (servers.length === 0) return null;

  const serverItems = (
    <div className="flex flex-col min-h-0">
      {showSearch && (
        <div className="px-2 pt-2 pb-1.5">
          <input
            type="text"
            placeholder="Search apps..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-muted/60 text-xs rounded-md px-2.5 py-1.5 outline-none placeholder:text-muted-foreground/50 focus:ring-1 focus:ring-ring"
          />
        </div>
      )}

      <div className={cn('overflow-y-auto max-h-[70vh] sm:max-h-[260px] px-1.5 pb-1.5', !showSearch && 'pt-1.5')}>
        {filteredServers.length === 0 ? (
          <div className="px-3 py-6 text-center text-xs text-muted-foreground">No servers match</div>
        ) : (
          filteredServers.map((server) => {
            const ready = isReady(server);
            return (
              <div
                key={server.id}
                onClick={() => {
                  if (ready) {
                    handleToggle(server.id, server.isEnabled);
                    return;
                  }
                  haptics.trigger('warning');
                  router.push('/apps');
                }}
                className={cn(
                  'flex items-center gap-2.5 px-2 py-2 rounded-md transition-colors',
                  ready ? 'hover:bg-accent cursor-pointer' : 'hover:bg-accent/50 cursor-pointer opacity-80',
                )}
              >
                <ServiceIcon url={server.url} name={server.name} size={20} className="shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="text-[13px] font-medium truncate leading-tight">{server.name}</div>
                  {!ready && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        haptics.trigger('warning');
                        router.push('/apps');
                      }}
                      className="inline-flex items-center gap-1 text-[11px] text-primary hover:text-primary/85 transition-colors"
                    >
                      Link app and complete setup
                      <ArrowUpRight className="size-3" />
                    </button>
                  )}
                </div>
                <Checkbox
                  checked={server.isEnabled && ready}
                  onCheckedChange={() => ready && handleToggle(server.id, server.isEnabled)}
                  onClick={(e) => e.stopPropagation()}
                  disabled={!ready}
                  className="shrink-0"
                />
              </div>
            );
          })
        )}
      </div>
    </div>
  );

  const triggerButton = (
    <button className="flex items-center gap-1.5 px-2.5 h-8 rounded-full bg-primary/8 text-primary/80 text-[12px] font-medium hover:bg-primary/12 hover:text-primary transition-colors">
      <AppsIcon width={14} height={14} />
      <span>Apps</span>
      {enabledCount > 0 && (
        <span className="flex items-center justify-center min-w-[16px] h-4 px-1 rounded-full bg-primary/15 text-[10px] font-mono tabular-nums leading-none">
          {enabledCount}
        </span>
      )}
    </button>
  );

  const drawerItems = (
    <div className="flex flex-col min-h-0 flex-1">
      {showSearch && (
        <div className="px-3 pt-2 pb-2 shrink-0">
          <input
            type="text"
            placeholder="Search apps..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-muted/60 text-sm rounded-lg px-3 py-2.5 outline-none placeholder:text-muted-foreground/50 focus:ring-1 focus:ring-ring"
          />
        </div>
      )}
      <div className={cn('overflow-y-auto flex-1 px-2 pb-2', !showSearch && 'pt-2')}>
        {filteredServers.length === 0 ? (
          <div className="px-3 py-8 text-center text-sm text-muted-foreground">No servers match</div>
        ) : (
          filteredServers.map((server) => {
            const ready = isReady(server);
            return (
              <div
                key={server.id}
                onClick={() => {
                  if (ready) {
                    handleToggle(server.id, server.isEnabled);
                    return;
                  }
                  haptics.trigger('warning');
                  router.push('/apps');
                }}
                className={cn(
                  'flex items-center gap-3.5 px-3 py-3 rounded-xl transition-colors',
                  ready
                    ? 'hover:bg-accent active:bg-accent cursor-pointer'
                    : 'hover:bg-accent/50 active:bg-accent/50 cursor-pointer opacity-80',
                )}
              >
                <ServiceIcon url={server.url} name={server.name} size={28} className="shrink-0 rounded-md" />
                <div className="flex-1 min-w-0">
                  <div className="text-[15px] font-medium truncate leading-tight">{server.name}</div>
                  {!ready && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        haptics.trigger('warning');
                        router.push('/apps');
                      }}
                      className="inline-flex items-center gap-1 text-[12px] text-primary hover:text-primary/85 transition-colors mt-0.5"
                    >
                      Link app and complete setup
                      <ArrowUpRight className="size-3.5" />
                    </button>
                  )}
                </div>
                <Checkbox
                  checked={server.isEnabled && ready}
                  onCheckedChange={() => ready && handleToggle(server.id, server.isEnabled)}
                  onClick={(e) => e.stopPropagation()}
                  disabled={!ready}
                  className="shrink-0 size-5"
                />
              </div>
            );
          })
        )}
      </div>
    </div>
  );

  if (isMobile) {
    return (
      <Drawer open={open} onOpenChange={handleOpenChange}>
        <DrawerTrigger asChild>{triggerButton}</DrawerTrigger>
        <DrawerContent className="max-h-[80vh] h-full flex flex-col overflow-hidden">
          <DrawerHeader className="text-left pb-1 shrink-0">
            <DrawerTitle className="text-lg font-light tracking-tight font-be-vietnam-pro">zetora apps</DrawerTitle>
          </DrawerHeader>
          <div className="flex-1 flex flex-col min-h-0 px-1 pb-4">
            {isLoading ? <div className="px-3 py-3 text-sm text-muted-foreground">Loading…</div> : drawerItems}
          </div>
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>{triggerButton}</PopoverTrigger>
      <PopoverContent
        onOpenAutoFocus={(event) => event.preventDefault()}
        className="w-72 p-0 font-sans rounded-xl bg-popover border shadow-none overflow-hidden"
        align="start"
        side="bottom"
        sideOffset={4}
      >
        {isLoading ? <div className="px-3 py-3 text-xs text-muted-foreground">Loading…</div> : serverItems}
      </PopoverContent>
    </Popover>
  );
});

McpServerSelector.displayName = 'McpServerSelector';
