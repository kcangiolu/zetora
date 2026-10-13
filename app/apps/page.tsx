'use client';

import { useState, Suspense, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useUser } from '@/contexts/user-context';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { sileo } from 'sileo';
import { SidebarTrigger } from '@/components/ui/sidebar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { cn, normalizeError } from '@/lib/utils';
import {
  Plus,
  Loader2,
  MoreHorizontal,
  Trash2,
  Zap,
  Link2Off,
  LinkIcon,
  ArrowUpRight,
  Pencil,
  ChevronDown,
  Wrench,
} from 'lucide-react';
import { AppsIcon } from '@/components/icons/apps-icon';
import { ServiceIcon } from '@/components/mcp/service-icon';

function getTransportType(url: string): 'sse' | 'http' {
  const lower = url.toLowerCase();
  return lower.endsWith('/sse') || lower.includes('/sse?') ? 'sse' : 'http';
}

function AppsListSkeleton() {
  return (
    <div className="rounded-xl border border-border/60 divide-y divide-border/40 overflow-hidden bg-card/50">
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="px-4 py-3.5 flex items-center gap-3">
          <Skeleton className="size-8 rounded-lg shrink-0" />
          <div className="flex-1 space-y-1.5">
            <Skeleton className="h-3.5 w-28" />
            <Skeleton className="h-2.5 w-44" />
          </div>
          <Skeleton className="size-8 rounded-md shrink-0" />
        </div>
      ))}
    </div>
  );
}

function AppsContent() {
  const { user, isLoading: isAuthLoading } = useUser();
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const mcpEnabled = process.env.NEXT_PUBLIC_MCP_ENABLED === 'true';

  useEffect(() => {
    if (!mcpEnabled) {
      router.replace('/');
      return;
    }
    if (!isAuthLoading && !user) router.push('/sign-in');
  }, [mcpEnabled, isAuthLoading, user, router]);

  // Handle OAuth callback redirect
  useEffect(() => {
    const oauthStatus = searchParams.get('mcpOauth');
    const message = searchParams.get('message');
    if (!oauthStatus) return;
    if (oauthStatus === 'success') {
      sileo.success({ title: 'App connected', description: 'OAuth authorization successful' });
    } else {
      sileo.error({ title: 'OAuth failed', description: message ?? 'Authorization was not completed' });
    }
    // Strip the params from the URL without a re-render
    const clean = new URL(window.location.href);
    clean.searchParams.delete('mcpOauth');
    clean.searchParams.delete('message');
    window.history.replaceState({}, '', clean.toString());
  }, [searchParams]);

  // Asked from the server: it is the URI actually sent to OAuth providers,
  // which MCP_OAUTH_CALLBACK_ORIGIN can point away from this page's origin.
  const { data: oauthCallbackUri } = useQuery({
    queryKey: ['mcpOAuthRedirectUri'],
    queryFn: async () => {
      const r = await fetch('/api/mcp/oauth/redirect-uri');
      if (!r.ok) throw new Error('Failed to load the redirect URI');
      return ((await r.json()) as { redirectUri: string }).redirectUri;
    },
    enabled: Boolean(user?.id),
    staleTime: Infinity,
  });

  const [showAddDialog, setShowAddDialog] = useState(false);
  const emptyAddForm = {
    name: '',
    url: '',
    authType: 'none' as 'none' | 'bearer' | 'header' | 'oauth',
    bearerToken: '',
    headerName: '',
    headerValue: '',
    oauthClientId: '',
    oauthClientSecret: '',
  };
  const [addForm, setAddForm] = useState(emptyAddForm);
  const resetAddForm = () => setAddForm(emptyAddForm);

  type ServerRecord = {
    id: string;
    name: string;
    url: string;
    authType: 'none' | 'bearer' | 'header' | 'oauth';
    isEnabled: boolean;
    hasCredentials: boolean;
    isOAuthConnected: boolean;
    oauthConfigured: boolean;
    oauthError: string | null;
    lastError: string | null;
    lastTestedAt: string | null;
  };

  const { data: serversData, isLoading: serversLoading } = useQuery({
    queryKey: ['mcpServers', user?.id],
    queryFn: async () => {
      const r = await fetch('/api/mcp/servers');
      if (!r.ok) return { servers: [] as ServerRecord[] };
      return r.json() as Promise<{ servers: ServerRecord[] }>;
    },
    enabled: Boolean(user?.id),
    staleTime: 10_000,
  });

  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [testingId, setTestingId] = useState<string | null>(null);
  const [connectingId, setConnectingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Tool management
  const [expandedToolsId, setExpandedToolsId] = useState<string | null>(null);
  const [serverToolsCache, setServerToolsCache] = useState<
    Record<string, Array<{ name: string; title: string | null; description: string | null }>>
  >({});
  const [toolsLoading, setToolsLoading] = useState<Record<string, boolean>>({});

  const fetchServerTools = async (serverId: string) => {
    if (serverToolsCache[serverId] || toolsLoading[serverId]) return;
    setToolsLoading((prev) => ({ ...prev, [serverId]: true }));
    try {
      const res = await fetch(`/api/mcp/servers/${serverId}/tools`);
      const data = (await res.json()) as {
        ok: boolean;
        tools: Array<{ name: string; title: string | null; description: string | null }>;
      };
      if (data.ok) setServerToolsCache((prev) => ({ ...prev, [serverId]: data.tools }));
    } catch {
      /* ignore */
    } finally {
      setToolsLoading((prev) => ({ ...prev, [serverId]: false }));
    }
  };

  const patchDisabledTools = async (serverId: string, disabledToolList: string[]) => {
    // Optimistic update first
    queryClient.setQueryData(['mcpServers', user?.id], (old: any) => {
      if (!old?.servers) return old;
      return {
        ...old,
        servers: old.servers.map((s: any) => (s.id === serverId ? { ...s, disabledTools: disabledToolList } : s)),
      };
    });
    const res = await fetch(`/api/mcp/servers/${serverId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ disabledTools: disabledToolList }),
    });
    // Only refetch on failure to revert optimistic update
    if (!res.ok) {
      queryClient.invalidateQueries({ queryKey: ['mcpServers', user?.id] });
    }
  };

  const saveDisabledTools = (serverId: string, disabledToolList: string[]) => {
    void patchDisabledTools(serverId, disabledToolList);
  };

  const toggleToolDisabled = (serverId: string, currentDisabled: string[], toolName: string) => {
    const next = currentDisabled.includes(toolName)
      ? currentDisabled.filter((t) => t !== toolName)
      : [...currentDisabled, toolName];
    saveDisabledTools(serverId, next);
  };

  type EditForm = {
    name: string;
    url: string;
    headerName: string;
    headerValue: string;
    bearerToken: string;
    oauthClientId: string;
    oauthClientSecret: string;
  };
  const [editTarget, setEditTarget] = useState<ServerRecord | null>(null);
  const [editForm, setEditForm] = useState<EditForm>({
    name: '',
    url: '',
    headerName: '',
    headerValue: '',
    bearerToken: '',
    oauthClientId: '',
    oauthClientSecret: '',
  });

  const openEdit = (server: ServerRecord) => {
    setEditTarget(server);
    setEditForm({
      name: server.name,
      url: server.url,
      headerName: '',
      headerValue: '',
      bearerToken: '',
      oauthClientId: '',
      oauthClientSecret: '',
    });
  };

  const [togglingId, setTogglingId] = useState<string | null>(null);
  const toggleMutation = useMutation({
    mutationFn: async ({ id, isEnabled }: { id: string; isEnabled: boolean }) => {
      setTogglingId(id);
      const r = await fetch(`/api/mcp/servers/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isEnabled }),
      });
      if (!r.ok) throw new Error('Failed to update');
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['mcpServers', user?.id] }),
    onError: () => sileo.error({ title: 'Update failed' }),
    onSettled: () => setTogglingId(null),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      setDeletingId(id);
      const r = await fetch(`/api/mcp/servers/${id}`, { method: 'DELETE' });
      if (!r.ok) throw new Error('Failed to delete');
    },
    onSuccess: () => {
      setDeletingId(null);
      queryClient.invalidateQueries({ queryKey: ['mcpServers', user?.id] });
      sileo.success({ title: 'App removed' });
    },
    onError: () => {
      setDeletingId(null);
      sileo.error({ title: 'Delete failed' });
    },
  });

  const editMutation = useMutation({
    mutationFn: async () => {
      if (!editTarget) return;
      const body: Record<string, unknown> = {
        name: editForm.name.trim(),
        url: editForm.url.trim(),
        transportType: getTransportType(editForm.url),
      };
      if (editTarget.authType === 'header' && editForm.headerValue.trim()) {
        body.headerName = editForm.headerName.trim() || 'Authorization';
        body.headerValue = editForm.headerValue.trim();
      }
      if (editTarget.authType === 'bearer' && editForm.bearerToken.trim()) {
        body.bearerToken = editForm.bearerToken.trim();
      }
      if (editTarget.authType === 'oauth' && editForm.oauthClientId.trim()) {
        body.oauthClientId = editForm.oauthClientId.trim();
      }
      if (editTarget.authType === 'oauth' && editForm.oauthClientSecret.trim()) {
        body.oauthClientSecret = editForm.oauthClientSecret.trim();
      }
      const r = await fetch(`/api/mcp/servers/${editTarget.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data?.cause || data?.message || 'Failed to update');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['mcpServers', user?.id] });
      sileo.success({ title: 'App updated' });
      setEditTarget(null);
    },
    onError: (error: Error) => sileo.error({ title: 'Update failed', description: normalizeError(error) }),
  });

  const testMutation = useMutation({
    mutationFn: async (id: string) => {
      setTestingId(id);
      const r = await fetch('/api/mcp/servers/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ serverId: id }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data?.cause || data?.message || 'Test failed');
      return data as { toolCount: number };
    },
    onSuccess: (data) => {
      setTestingId(null);
      queryClient.invalidateQueries({ queryKey: ['mcpServers', user?.id] });
      sileo.success({
        title: 'Connection successful',
        description: `${data.toolCount} tool${data.toolCount === 1 ? '' : 's'} loaded`,
      });
    },
    onError: (error: Error) => {
      setTestingId(null);
      sileo.error({ title: 'Connection test failed', description: normalizeError(error) });
    },
  });

  const oauthStartMutation = useMutation({
    mutationFn: async (id: string) => {
      setConnectingId(id);
      const r = await fetch(`/api/mcp/servers/${id}/oauth/start`, { method: 'POST' });
      const data = await r.json();
      if (!r.ok) throw new Error(data?.cause || data?.message || 'OAuth failed');
      return data as { authorizationUrl: string };
    },
    onSuccess: ({ authorizationUrl }) => {
      if (authorizationUrl) window.location.assign(authorizationUrl);
    },
    onError: (error: Error) => {
      setConnectingId(null);
      sileo.error({ title: 'Authorization failed', description: normalizeError(error) });
    },
  });

  const oauthDisconnectMutation = useMutation({
    mutationFn: async (id: string) => {
      const r = await fetch(`/api/mcp/servers/${id}/oauth/disconnect`, { method: 'POST' });
      if (!r.ok) throw new Error('Failed to disconnect');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['mcpServers', user?.id] });
      sileo.success({ title: 'Disconnected' });
    },
    onError: () => sileo.error({ title: 'Disconnect failed' }),
  });

  const addMutation = useMutation({
    mutationFn: async () => {
      const { name, url, authType, bearerToken, headerName, headerValue, oauthClientId, oauthClientSecret } = addForm;
      const body: Record<string, unknown> = {
        name: name.trim(),
        url: url.trim(),
        isEnabled: true,
        authType,
        transportType: getTransportType(url),
        ...(authType === 'bearer' && bearerToken ? { bearerToken: bearerToken.trim() } : {}),
        ...(authType === 'header' && headerName
          ? { headerName: headerName.trim(), headerValue: headerValue.trim() }
          : {}),
        ...(authType === 'oauth' && oauthClientId.trim() ? { oauthClientId: oauthClientId.trim() } : {}),
        ...(authType === 'oauth' && oauthClientSecret.trim() ? { oauthClientSecret: oauthClientSecret.trim() } : {}),
      };
      const r = await fetch('/api/mcp/servers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data?.cause || data?.message || 'Failed to add server');
      if (authType === 'oauth') {
        const oauthR = await fetch(`/api/mcp/servers/${data.server.id}/oauth/start`, { method: 'POST' });
        const oauthData = await oauthR.json();
        if (!oauthR.ok) throw new Error(oauthData?.cause || oauthData?.message || 'Failed to start OAuth');
        if (oauthData.authorizationUrl) {
          window.location.assign(oauthData.authorizationUrl);
          return data;
        }
      }
      return data;
    },
    onSuccess: () => {
      if (addForm.authType !== 'oauth') sileo.success({ title: `${addForm.name} added` });
      queryClient.invalidateQueries({ queryKey: ['mcpServers', user?.id] });
      setShowAddDialog(false);
      resetAddForm();
    },
    onError: (error: Error) => sileo.error({ title: 'Failed to add app', description: normalizeError(error) }),
  });

  if (!mcpEnabled) return null;

  if (isAuthLoading) {
    return (
      <div className="flex-1 min-h-dvh flex flex-col py-8">
        <div className="max-w-5xl mx-auto w-full px-4 sm:px-6 lg:px-8 space-y-6">
          <div className="flex items-center justify-center gap-3">
            <Skeleton className="size-5 rounded" />
            <Skeleton className="h-6 w-16" />
          </div>
          <AppsListSkeleton />
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 min-h-dvh flex flex-col">
      <div className="flex-1 flex flex-col py-8">
        <div className="max-w-5xl mx-auto w-full px-4 sm:px-6 lg:px-8">
          {/* ── Page header ──────────────────────────────────────── */}
          <div className="mb-6">
            <div className="flex items-center justify-center gap-2 relative">
              <div className="md:hidden absolute left-0">
                <SidebarTrigger />
              </div>
              <AppsIcon width={24} height={24} className="text-foreground" />
              <h1 className="text-2xl font-light tracking-tight font-be-vietnam-pro">zetora apps</h1>
            </div>
          </div>

          <div className="space-y-5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-semibold">My Apps</h2>
                {(serversData?.servers ?? []).length > 0 && (
                  <span className="text-xs font-medium text-muted-foreground/50 tabular-nums bg-muted/50 px-2 py-0.5 rounded-full">
                    {(serversData?.servers ?? []).length}
                  </span>
                )}
              </div>
              <Button
                size="sm"
                variant="outline"
                className="h-7 gap-1.5 text-xs"
                onClick={() => setShowAddDialog(true)}
              >
                <Plus className="size-3" />
                Add app
              </Button>
            </div>

            {serversLoading ? (
              <AppsListSkeleton />
            ) : (serversData?.servers ?? []).length === 0 ? (
              <div className="rounded-xl border border-dashed border-border/60 py-12 flex flex-col items-center gap-3">
                <div className="size-10 rounded-xl bg-muted/50 flex items-center justify-center">
                  <AppsIcon width={18} height={18} className="text-muted-foreground/50" />
                </div>
                <div className="text-center">
                  <p className="text-sm font-medium text-muted-foreground">No apps connected</p>
                  <p className="text-sm text-muted-foreground/60 mt-1.5">Add any app that exposes an MCP server</p>
                </div>
                <Button size="sm" variant="outline" onClick={() => setShowAddDialog(true)} className="mt-1">
                  Add app
                </Button>
              </div>
            ) : (
              <div className="rounded-xl border border-border/60 divide-y divide-border/40 bg-card/50 overflow-hidden">
                {[...(serversData?.servers ?? [])]
                  .sort((a, b) => {
                    const score = (s: ServerRecord) => {
                      const ready = s.authType !== 'oauth' || s.isOAuthConnected;
                      if (s.isEnabled && ready) return 3;
                      if (s.isEnabled && !ready) return 2;
                      if (!s.isEnabled && ready) return 1;
                      return 0;
                    };
                    return score(b) - score(a);
                  })
                  .map((server) => {
                    const isToolsExpanded = expandedToolsId === server.id;
                    const tools = serverToolsCache[server.id] ?? [];
                    const isLoadingTools = toolsLoading[server.id] ?? false;
                    const disabledForServer: string[] = Array.isArray((server as any).disabledTools)
                      ? (server as any).disabledTools
                      : [];
                    const isReady = server.authType !== 'oauth' || server.isOAuthConnected;
                    return (
                      <div key={server.id} className="transition-colors hover:bg-muted/20">
                        <div className="px-5 py-4 flex items-center gap-4">
                          {/* Icon + info — dimmed when inactive */}
                          <div
                            className={cn(
                              'flex items-center gap-4 flex-1 min-w-0 transition-opacity',
                              (!server.isEnabled || (server.authType === 'oauth' && !server.isOAuthConnected)) &&
                                'opacity-40',
                            )}
                          >
                            <div className="size-8 flex items-center justify-center shrink-0 overflow-hidden">
                              <ServiceIcon url={server.url} name={server.name} size={22} />
                            </div>
                            <div className="flex-1 min-w-0 space-y-0.5">
                              <div className="flex items-center gap-2 min-w-0">
                                <span className="text-sm font-medium truncate">{server.name}</span>
                                {server.authType === 'oauth' && !server.isOAuthConnected && (
                                  <span
                                    className="shrink-0 size-1.5 rounded-full bg-amber-400 dark:bg-amber-500"
                                    title="OAuth not connected"
                                  />
                                )}
                                {disabledForServer.length > 0 && (
                                  <span className="shrink-0 text-xs font-medium text-muted-foreground/60 tabular-nums">
                                    {disabledForServer.length} hidden
                                  </span>
                                )}
                              </div>
                              <p className="text-xs text-muted-foreground/60 truncate">
                                {(() => {
                                  try {
                                    return new URL(server.url).hostname;
                                  } catch {
                                    return server.url;
                                  }
                                })()}
                              </p>
                              {(server.oauthError || server.lastError) && (
                                <p className="text-xs text-destructive/80 truncate mt-1">
                                  {server.oauthError || server.lastError}
                                </p>
                              )}
                            </div>
                          </div>

                          {/* Actions — never dimmed */}
                          <div className="flex items-center gap-2 shrink-0">
                            {server.authType === 'oauth' && !server.isOAuthConnected && (
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 text-xs px-2.5 gap-1"
                                onClick={() => oauthStartMutation.mutate(server.id)}
                                disabled={connectingId === server.id && oauthStartMutation.isPending}
                              >
                                {connectingId === server.id && oauthStartMutation.isPending ? (
                                  <Loader2 className="size-3 animate-spin" />
                                ) : (
                                  <LinkIcon className="size-3" />
                                )}
                                Connect
                              </Button>
                            )}

                            {/* Lock toggle for OAuth servers that aren't connected yet */}
                            {server.authType === 'oauth' && !server.isOAuthConnected ? (
                              <Switch checked={false} disabled className="opacity-30" />
                            ) : (
                              <Switch
                                checked={server.isEnabled}
                                onCheckedChange={(v) => toggleMutation.mutate({ id: server.id, isEnabled: v })}
                                disabled={togglingId === server.id}
                              />
                            )}

                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="sm" className="size-7 p-0 text-muted-foreground">
                                  <MoreHorizontal className="size-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end" className="w-44">
                                <DropdownMenuItem onClick={() => openEdit(server)}>
                                  <Pencil className="size-3.5 mr-2" />
                                  Edit
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  onClick={() => testMutation.mutate(server.id)}
                                  disabled={testingId === server.id && testMutation.isPending}
                                >
                                  {testingId === server.id && testMutation.isPending ? (
                                    <Loader2 className="size-3.5 mr-2 animate-spin" />
                                  ) : (
                                    <Zap className="size-3.5 mr-2" />
                                  )}
                                  Test connection
                                </DropdownMenuItem>
                                {server.authType === 'oauth' && server.isOAuthConnected && (
                                  <>
                                    <DropdownMenuItem onClick={() => oauthStartMutation.mutate(server.id)}>
                                      <ArrowUpRight className="size-3.5 mr-2" />
                                      Reconnect OAuth
                                    </DropdownMenuItem>
                                    <DropdownMenuItem
                                      onClick={() => oauthDisconnectMutation.mutate(server.id)}
                                      className="text-muted-foreground"
                                    >
                                      <Link2Off className="size-3.5 mr-2" />
                                      Disconnect OAuth
                                    </DropdownMenuItem>
                                  </>
                                )}
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                  className="text-destructive focus:text-destructive"
                                  onClick={() => setConfirmDeleteId(server.id)}
                                >
                                  <Trash2 className="size-3.5 mr-2" />
                                  Remove
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                            {/* Tool management toggle */}
                            {isReady && (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="size-7 p-0 text-muted-foreground"
                                title="Manage tools"
                                onClick={() => {
                                  const next = isToolsExpanded ? null : server.id;
                                  setExpandedToolsId(next);
                                  if (next) fetchServerTools(next);
                                }}
                              >
                                <ChevronDown
                                  className={cn(
                                    'size-4 transition-transform duration-150',
                                    isToolsExpanded && 'rotate-180',
                                  )}
                                />
                              </Button>
                            )}
                          </div>
                        </div>
                        {/* Tool list */}
                        {isToolsExpanded && isReady && (
                          <div className="px-5 pb-4">
                            <div className="rounded-lg border border-border/40 bg-muted/30 overflow-hidden">
                              <div className="px-3 py-2 border-b border-border/30 flex items-center justify-between">
                                <div className="flex items-center gap-1.5">
                                  <Wrench className="size-3 text-muted-foreground/60" />
                                  <span className="text-xs font-medium text-muted-foreground">Tools</span>
                                  {!isLoadingTools && tools.length > 0 && (
                                    <span className="text-xs text-muted-foreground/50 tabular-nums">
                                      {tools.length - disabledForServer.length}/{tools.length} enabled
                                    </span>
                                  )}
                                </div>
                                {!isLoadingTools && tools.length > 0 && disabledForServer.length > 0 && (
                                  <button
                                    type="button"
                                    onClick={() => void saveDisabledTools(server.id, [])}
                                    className="text-xs text-primary hover:text-primary/80 transition-colors font-medium"
                                  >
                                    Enable all
                                  </button>
                                )}
                              </div>
                              {isLoadingTools ? (
                                <div className="px-3 py-3 flex items-center gap-2 text-xs text-muted-foreground/60">
                                  <Loader2 className="size-3.5 animate-spin shrink-0" />
                                  Loading tools…
                                </div>
                              ) : tools.length === 0 ? (
                                <div className="px-3 py-3 text-xs text-muted-foreground/60">No tools found</div>
                              ) : (
                                <div className="max-h-[280px] overflow-y-auto divide-y divide-border/30">
                                  {tools.map((tool) => {
                                    const isDisabled = disabledForServer.includes(tool.name);
                                    return (
                                      <div
                                        key={tool.name}
                                        onClick={() => toggleToolDisabled(server.id, disabledForServer, tool.name)}
                                        className="flex items-center gap-3 px-3 py-2 cursor-pointer hover:bg-muted/40 transition-colors group"
                                      >
                                        <div
                                          className={cn(
                                            'size-1.5 rounded-full shrink-0 transition-colors',
                                            isDisabled ? 'bg-muted-foreground/20' : 'bg-emerald-500',
                                          )}
                                        />
                                        <span
                                          className={cn(
                                            'flex-1 text-xs font-mono truncate transition-colors',
                                            isDisabled ? 'text-muted-foreground/40 line-through' : 'text-foreground/80',
                                          )}
                                        >
                                          {tool.title ?? tool.name}
                                        </span>
                                        <Switch
                                          checked={!isDisabled}
                                          onCheckedChange={() =>
                                            toggleToolDisabled(server.id, disabledForServer, tool.name)
                                          }
                                          onClick={(e) => e.stopPropagation()}
                                          className="shrink-0 scale-75"
                                        />
                                      </div>
                                    );
                                  })}
                                </div>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Edit dialog ──────────────────────────────────────────── */}
      <Dialog
        open={!!editTarget}
        onOpenChange={(v) => {
          if (!v) setEditTarget(null);
        }}
      >
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <div className="flex items-center gap-2.5 mb-1">
              <div className="size-7 flex items-center justify-center overflow-hidden shrink-0">
                {editTarget && <ServiceIcon url={editTarget.url} name={editTarget.name} size={20} />}
              </div>
              <DialogTitle>Edit {editTarget?.name}</DialogTitle>
            </div>
          </DialogHeader>
          <div className="space-y-3 py-1">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Name</Label>
              <Input
                value={editForm.name}
                onChange={(e) => setEditForm((p) => ({ ...p, name: e.target.value }))}
                autoFocus
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">URL</Label>
              <Input
                value={editForm.url}
                onChange={(e) => setEditForm((p) => ({ ...p, url: e.target.value }))}
                placeholder="https://…"
              />
            </div>
            {editTarget?.authType === 'header' && (
              <>
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Header name</Label>
                  <Input
                    value={editForm.headerName}
                    onChange={(e) => setEditForm((p) => ({ ...p, headerName: e.target.value }))}
                    placeholder="Authorization"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">
                    New header value <span className="text-muted-foreground/50">(leave blank to keep existing)</span>
                  </Label>
                  <Input
                    type="password"
                    value={editForm.headerValue}
                    onChange={(e) => setEditForm((p) => ({ ...p, headerValue: e.target.value }))}
                    placeholder="Bearer sk-…"
                  />
                </div>
              </>
            )}
            {editTarget?.authType === 'bearer' && (
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">
                  New token <span className="text-muted-foreground/50">(leave blank to keep existing)</span>
                </Label>
                <Input
                  type="password"
                  value={editForm.bearerToken}
                  onChange={(e) => setEditForm((p) => ({ ...p, bearerToken: e.target.value }))}
                  placeholder="sk-…"
                />
              </div>
            )}
            {editTarget?.authType === 'oauth' && (
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">
                  OAuth Client ID <span className="text-muted-foreground/50">(leave blank to keep existing)</span>
                </Label>
                <Input
                  value={editForm.oauthClientId}
                  onChange={(e) => setEditForm((p) => ({ ...p, oauthClientId: e.target.value }))}
                  placeholder="Client ID…"
                />
                <Label className="text-xs text-muted-foreground">
                  OAuth Client secret <span className="text-muted-foreground/50">(leave blank to keep existing)</span>
                </Label>
                <Input
                  type="password"
                  value={editForm.oauthClientSecret}
                  onChange={(e) => setEditForm((p) => ({ ...p, oauthClientSecret: e.target.value }))}
                  placeholder="Client secret…"
                />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setEditTarget(null)}>
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={() => editMutation.mutate()}
              disabled={!editForm.name.trim() || !editForm.url.trim() || editMutation.isPending}
            >
              {editMutation.isPending ? 'Saving…' : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Delete confirmation ──────────────────────────────────── */}
      <AlertDialog
        open={!!confirmDeleteId}
        onOpenChange={(v) => {
          if (!v) setConfirmDeleteId(null);
        }}
      >
        <AlertDialogContent className="max-w-sm">
          <AlertDialogHeader>
            <AlertDialogTitle>Remove app?</AlertDialogTitle>
            <AlertDialogDescription className="text-pretty">
              This will disconnect any OAuth sessions and cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (confirmDeleteId) {
                  deleteMutation.mutate(confirmDeleteId);
                  setConfirmDeleteId(null);
                }
              }}
              disabled={deletingId === confirmDeleteId && deleteMutation.isPending}
            >
              {deletingId === confirmDeleteId && deleteMutation.isPending ? (
                <Loader2 className="size-3 animate-spin mr-1.5" />
              ) : (
                <Trash2 className="size-3 mr-1.5" />
              )}
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ── Add app dialog ───────────────────────────────────────── */}
      <Dialog
        open={showAddDialog}
        onOpenChange={(v) => {
          if (!v) {
            setShowAddDialog(false);
            resetAddForm();
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add app</DialogTitle>
            <DialogDescription className="text-pretty">
              Connect any app that exposes a remote MCP server. Its URL is usually in the app&apos;s developer
              documentation.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-1">
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Name</Label>
                <Input
                  placeholder="My Server"
                  value={addForm.name}
                  onChange={(e) => setAddForm((p) => ({ ...p, name: e.target.value }))}
                  autoFocus
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Auth</Label>
                <Select
                  value={addForm.authType}
                  onValueChange={(v: typeof addForm.authType) => setAddForm((p) => ({ ...p, authType: v }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No auth</SelectItem>
                    <SelectItem value="bearer">Bearer token</SelectItem>
                    <SelectItem value="header">Custom header</SelectItem>
                    <SelectItem value="oauth">OAuth</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">URL</Label>
              <Input
                placeholder="https://your-mcp-server.com/mcp"
                value={addForm.url}
                onChange={(e) => setAddForm((p) => ({ ...p, url: e.target.value }))}
              />
            </div>
            {addForm.authType === 'bearer' && (
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Bearer token</Label>
                <Input
                  type="password"
                  placeholder="sk-…"
                  value={addForm.bearerToken}
                  onChange={(e) => setAddForm((p) => ({ ...p, bearerToken: e.target.value }))}
                />
              </div>
            )}
            {addForm.authType === 'header' && (
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Header name</Label>
                  <Input
                    placeholder="x-api-key"
                    value={addForm.headerName}
                    onChange={(e) => setAddForm((p) => ({ ...p, headerName: e.target.value }))}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Header value</Label>
                  <Input
                    type="password"
                    placeholder="sk-…"
                    value={addForm.headerValue}
                    onChange={(e) => setAddForm((p) => ({ ...p, headerValue: e.target.value }))}
                  />
                </div>
              </div>
            )}
            {addForm.authType === 'oauth' && (
              <>
                <p className="text-xs font-medium text-muted-foreground bg-muted/50 rounded-lg px-3 py-2">
                  OAuth endpoints are discovered from the server URL. Leave the client fields blank if the server
                  registers clients itself; otherwise create an OAuth app with the provider and enter its credentials.
                </p>
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">Client ID (optional)</Label>
                    <Input
                      placeholder="Client ID…"
                      value={addForm.oauthClientId}
                      onChange={(e) => setAddForm((p) => ({ ...p, oauthClientId: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">Client secret (optional)</Label>
                    <Input
                      type="password"
                      placeholder="Client secret…"
                      value={addForm.oauthClientSecret}
                      onChange={(e) => setAddForm((p) => ({ ...p, oauthClientSecret: e.target.value }))}
                    />
                  </div>
                </div>
                <div className="space-y-1.5 rounded-lg border border-border/60 bg-muted/30 px-2.5 py-2">
                  <div className="flex items-center justify-between gap-2">
                    <Label className="text-xs text-muted-foreground">Redirect URI</Label>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-6 px-2 text-xs"
                      disabled={!oauthCallbackUri}
                      onClick={async () => {
                        if (!oauthCallbackUri) return;
                        try {
                          await navigator.clipboard.writeText(oauthCallbackUri);
                          sileo.success({ title: 'Copied redirect URI' });
                        } catch {
                          sileo.error({ title: 'Copy failed' });
                        }
                      }}
                    >
                      Copy
                    </Button>
                  </div>
                  <code className="block text-xs text-foreground/80 wrap-break-word whitespace-pre-wrap">
                    {oauthCallbackUri ?? 'Loading…'}
                  </code>
                </div>
              </>
            )}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setShowAddDialog(false);
                resetAddForm();
              }}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={() => addMutation.mutate()}
              disabled={!addForm.name.trim() || !addForm.url.trim() || addMutation.isPending}
            >
              {addMutation.isPending ? 'Adding…' : addForm.authType === 'oauth' ? 'Add & Connect' : 'Add App'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default function AppsPage() {
  return (
    <Suspense
      fallback={
        <div className="flex-1 min-h-dvh flex flex-col py-8">
          <div className="max-w-5xl mx-auto w-full px-4 sm:px-6 lg:px-8 space-y-6">
            <div className="flex items-center justify-center gap-3">
              <Skeleton className="size-5 rounded" />
              <Skeleton className="h-6 w-16" />
            </div>
            <AppsListSkeleton />
          </div>
        </div>
      }
    >
      <AppsContent />
    </Suspense>
  );
}
