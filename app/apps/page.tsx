'use client';

import { useState, useMemo, Suspense, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useUser } from '@/contexts/user-context';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { sileo } from 'sileo';
import { SidebarTrigger } from '@/components/ui/sidebar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card } from '@/components/ui/card';
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
import { Tabs as KumoTabs } from '@cloudflare/kumo';
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
  Search,
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
import { parseAsString, useQueryState } from 'nuqs';
import { getMcpCatalogIcon } from '@/lib/mcp/catalog-icons';
import {
  CATALOG,
  CATEGORIES,
  type CategoryId,
  type CatalogItem,
  FEATURED_NAMES,
  CATALOG_URLS,
  getTransportType,
} from './catalog-data';
import { ServiceIcon, CatalogCard, CardSkeleton, isOauthWithClientSetup } from './marketplace-shared';

function McpMarketplaceContent() {
  const { user, isProUser, isLoading: isAuthLoading } = useUser();
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

  const [activeTab, setActiveTab] = useState(() =>
    searchParams.get('tab') === 'my-servers' ? 'my-servers' : 'browse',
  );
  const [search, setSearch] = useQueryState('q', parseAsString.withDefault(''));
  const [category, setCategory] = useState<CategoryId>('all');
  const isReadOnlyMarketplace = !isProUser;

  const [apiKeyTarget, setApiKeyTarget] = useState<CatalogItem | null>(null);
  const [apiKeyValues, setApiKeyValues] = useState<Record<string, string>>({});
  const [oauthSetupTarget, setOauthSetupTarget] = useState<CatalogItem | null>(null);
  const [oauthSetupValues, setOauthSetupValues] = useState<Record<string, string>>({});
  const [addingUrl, setAddingUrl] = useState<string | null>(null);
  const oauthCallbackUri = useMemo(() => {
    const configuredOrigin = process.env.NEXT_PUBLIC_APP_URL?.trim();
    const origin = configuredOrigin
      ? configuredOrigin.replace(/\/+$/, '')
      : typeof window !== 'undefined'
        ? window.location.origin.replace(/\/+$/, '')
        : '';
    return origin ? `${origin}/api/mcp/oauth/callback` : '/api/mcp/oauth/callback';
  }, []);

  const [showCustomDialog, setShowCustomDialog] = useState(false);
  const [customForm, setCustomForm] = useState({
    name: '',
    url: '',
    authType: 'none' as 'none' | 'bearer' | 'header' | 'oauth',
    bearerToken: '',
    headerName: '',
    headerValue: '',
  });
  const resetCustomForm = () =>
    setCustomForm({ name: '', url: '', authType: 'none', bearerToken: '', headerName: '', headerValue: '' });

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
    enabled: Boolean(user?.id && isProUser),
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
  };
  const [editTarget, setEditTarget] = useState<ServerRecord | null>(null);
  const [editForm, setEditForm] = useState<EditForm>({
    name: '',
    url: '',
    headerName: '',
    headerValue: '',
    bearerToken: '',
    oauthClientId: '',
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
      const lower = editForm.url.toLowerCase();
      const body: Record<string, unknown> = {
        name: editForm.name.trim(),
        url: editForm.url.trim(),
        transportType: lower.endsWith('/sse') || lower.includes('/sse?') ? 'sse' : 'http',
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

  const connectedUrls = useMemo(
    () => new Set((serversData?.servers ?? []).map((s) => s.url.replace(/\/$/, ''))),
    [serversData],
  );

  const filteredItems = useMemo(() => {
    const q = search.toLowerCase().trim();
    const filtered = CATALOG.filter((item) => {
      if (category !== 'all' && item.category !== category) return false;
      if (!q) return true;
      return item.name.toLowerCase().includes(q) || item.maintainer.toLowerCase().includes(q);
    });

    // Prioritize true OAuth entries first, then OAuth requiring client setup.
    return [...filtered].sort((a, b) => {
      const rank = (item: CatalogItem) => {
        if (item.auth === 'oauth' && !isOauthWithClientSetup(item)) return 0;
        if (isOauthWithClientSetup(item)) return 1;
        return 2;
      };
      const rankDiff = rank(a) - rank(b);
      if (rankDiff !== 0) return rankDiff;
      return a.name.localeCompare(b.name);
    });
  }, [search, category]);

  const featuredItems = useMemo(() => {
    const catalogByName = new Map(CATALOG.map((item) => [item.name, item]));
    return FEATURED_NAMES.map((name) => catalogByName.get(name)).filter((item): item is CatalogItem => Boolean(item));
  }, []);

  const addMutation = useMutation({
    mutationFn: async ({
      item,
      apiKey,
      fieldValues,
      oauthCredentials,
    }: {
      item: CatalogItem;
      apiKey?: string;
      fieldValues?: Record<string, string>;
      oauthCredentials?: Record<string, string>;
    }) => {
      const firstField = item.fields?.[0];
      const resolvedHeaderName = firstField?.headerName ?? 'Authorization';
      const resolvedValue = firstField ? (fieldValues?.[firstField.label] ?? apiKey ?? '') : (apiKey ?? '');
      const body: Record<string, unknown> = {
        name: item.name,
        url: item.url,
        isEnabled: true,
        transportType: getTransportType(item.url),
        authType: item.auth === 'oauth' ? 'oauth' : item.auth === 'apikey' ? 'header' : 'none',
        ...(item.auth === 'apikey' && resolvedValue
          ? {
              headerName: resolvedHeaderName,
              headerValue:
                resolvedHeaderName.toLowerCase() === 'authorization' ? `Bearer ${resolvedValue}` : resolvedValue,
            }
          : {}),
        ...(oauthCredentials?.oauthClientId ? { oauthClientId: oauthCredentials.oauthClientId } : {}),
        ...(oauthCredentials?.oauthClientSecret ? { oauthClientSecret: oauthCredentials.oauthClientSecret } : {}),
      };
      const r = await fetch('/api/mcp/servers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data?.cause || data?.message || 'Failed to add server');
      if (item.auth === 'oauth') {
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
    onSuccess: (_, { item }) => {
      if (item.auth !== 'oauth') sileo.success({ title: `${item.name} added` });
      queryClient.invalidateQueries({ queryKey: ['mcpServers', user?.id] });
      setApiKeyTarget(null);
      setApiKeyValues({});
      setOauthSetupTarget(null);
      setOauthSetupValues({});
    },
    onError: (error: Error) => sileo.error({ title: 'Failed to add app', description: normalizeError(error) }),
    onSettled: () => setAddingUrl(null),
  });

  const customMutation = useMutation({
    mutationFn: async () => {
      const { name, url, authType, bearerToken, headerName, headerValue } = customForm;
      const lower = url.toLowerCase();
      const body: Record<string, unknown> = {
        name: name.trim(),
        url: url.trim(),
        isEnabled: true,
        authType,
        transportType: lower.endsWith('/sse') || lower.includes('/sse?') ? 'sse' : 'http',
        ...(authType === 'bearer' && bearerToken ? { bearerToken: bearerToken.trim() } : {}),
        ...(authType === 'header' && headerName
          ? { headerName: headerName.trim(), headerValue: headerValue.trim() }
          : {}),
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
      if (customForm.authType !== 'oauth') sileo.success({ title: `${customForm.name} added` });
      queryClient.invalidateQueries({ queryKey: ['mcpServers', user?.id] });
      setShowCustomDialog(false);
      resetCustomForm();
    },
    onError: (error: Error) => sileo.error({ title: 'Failed to add app', description: normalizeError(error) }),
  });

  const handleAdd = (item: CatalogItem) => {
    if (!isProUser) {
      router.push('/pricing');
      return;
    }
    if (item.auth === 'apikey') {
      setApiKeyTarget(item);
      setApiKeyValues({});
      return;
    }
    if (item.auth === 'oauth' && item.oauthSetup?.length) {
      setOauthSetupTarget(item);
      setOauthSetupValues({});
      return;
    }
    setAddingUrl(item.url);
    addMutation.mutate({ item });
  };

  const handleCustomOpen = () => {
    if (!isProUser) {
      router.push('/pricing');
      return;
    }
    setShowCustomDialog(true);
  };

  useEffect(() => {
    if (isReadOnlyMarketplace && activeTab !== 'browse') {
      setActiveTab('browse');
    }
  }, [isReadOnlyMarketplace, activeTab]);

  if (!mcpEnabled) return null;

  if (isAuthLoading) {
    return (
      <div className="flex-1 min-h-dvh flex flex-col py-8">
        <div className="max-w-5xl mx-auto w-full px-4 sm:px-6 lg:px-8 space-y-6">
          <div className="flex items-center justify-center gap-3">
            <Skeleton className="size-5 rounded" />
            <Skeleton className="h-6 w-16" />
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <CardSkeleton key={i} />
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 min-h-dvh flex flex-col">
      <div className="flex-1 flex flex-col py-8">
        <div className="max-w-5xl mx-auto w-full px-4 sm:px-6 lg:px-8">
          {/* ── Page header ──────────────────────────────────────── */}
          <div className="mb-6 space-y-4">
            <div className="flex items-center justify-center gap-2 relative">
              <div className="md:hidden absolute left-0">
                <SidebarTrigger />
              </div>
              <AppsIcon width={24} height={24} className="text-foreground" />
              <h1 className="text-2xl font-light tracking-tight font-be-vietnam-pro">zetora apps</h1>
            </div>

            {/* Tabs + search (desktop: side by side, mobile: stacked) */}
            <div className="flex flex-col sm:flex-row justify-between items-stretch sm:items-center gap-3">
              <KumoTabs
                variant="segmented"
                value={activeTab}
                onValueChange={setActiveTab}
                className="w-full sm:w-auto **:[[role=tablist]]:w-full sm:**:[[role=tablist]]:w-auto **:[[role=tab]]:flex-1 **:[[role=tab]]:justify-center sm:**:[[role=tab]]:flex-none sm:**:[[role=tab]]:justify-start [--color-kumo-tint:var(--accent)] [--color-kumo-base:var(--background)] [--color-kumo-recessed:var(--muted)] [--color-kumo-surface:var(--card)] [--text-color-kumo-default:var(--foreground)] [--text-color-kumo-strong:var(--muted-foreground)] [--text-color-kumo-subtle:var(--muted-foreground)] [--color-kumo-ring:var(--border)]"
                tabs={
                  isReadOnlyMarketplace
                    ? [{ value: 'browse', label: 'Marketplace' }]
                    : [
                        { value: 'browse', label: 'Marketplace' },
                        {
                          value: 'my-servers',
                          label: `My Apps${connectedUrls.size > 0 ? ` (${connectedUrls.size})` : ''}`,
                        },
                      ]
                }
              />
              {activeTab === 'browse' && (
                <div className="relative w-full sm:w-auto sm:flex-none">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground/40 pointer-events-none" />
                  <Input
                    placeholder="Search apps..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="pl-8 h-8 text-sm w-full sm:w-52"
                  />
                </div>
              )}
            </div>

            {isReadOnlyMarketplace && (
              <div className="rounded-xl border border-border/50 bg-card/30 px-3.5 py-2.5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                <p className="text-xs text-muted-foreground">
                  Browse all apps for free. Upgrade to connect and run app tools in chat.
                </p>
                <Button size="sm" className="h-7 w-fit" onClick={() => router.push('/pricing')}>
                  Upgrade to Pro
                </Button>
              </div>
            )}

            {/* Category pills — browse only */}
            {activeTab === 'browse' && (
              <div className="flex flex-wrap gap-1.5">
                {CATEGORIES.map((cat) => (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => setCategory(cat.id)}
                    className={cn(
                      'px-3 py-1.5 text-xs font-medium rounded-md transition-colors',
                      category === cat.id
                        ? 'bg-primary text-primary-foreground shadow-sm'
                        : 'bg-transparent text-muted-foreground hover:bg-muted hover:text-foreground',
                    )}
                  >
                    {cat.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* ── Browse tab ───────────────────────────────────────── */}
          {activeTab === 'browse' && (
            <div className="space-y-8">
              {/* Featured section — only when no filter active */}
              {!search && category === 'all' && (
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <h2 className="text-sm font-semibold">Featured</h2>
                    <span className="text-xs font-medium text-muted-foreground/50 tabular-nums bg-muted/50 px-2 py-0.5 rounded-full">
                      {featuredItems.length}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    {featuredItems.map((item) => (
                      <CatalogCard
                        key={item.name}
                        item={item}
                        isConnected={connectedUrls.has(item.url.replace(/\/$/, ''))}
                        isAdding={addingUrl === item.url && addMutation.isPending}
                        onAdd={handleAdd}
                        canConnect={!isReadOnlyMarketplace}
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* All servers grid */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <h2 className="text-sm font-semibold">
                      {search || category !== 'all' ? 'Results' : 'All Servers'}
                    </h2>
                    <span className="text-xs font-medium text-muted-foreground/50 tabular-nums bg-muted/50 px-2 py-0.5 rounded-full">
                      {filteredItems.length}
                    </span>
                  </div>
                </div>

                {serversLoading ? (
                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                    {Array.from({ length: 8 }).map((_, i) => (
                      <CardSkeleton key={i} />
                    ))}
                  </div>
                ) : filteredItems.length > 0 ? (
                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                    {/* Add custom — always first */}
                    <Card
                      className="shadow-none bg-card/30 cursor-pointer border-dashed border border-border/60 hover:border-primary/40 hover:bg-card/50 transition-all duration-200 flex items-center justify-center min-h-[120px] group rounded-xl"
                      onClick={handleCustomOpen}
                    >
                      <div className="flex flex-col items-center gap-2 text-muted-foreground group-hover:text-primary transition-colors">
                        <div className="size-8 rounded-xl bg-muted/50 flex items-center justify-center group-hover:bg-primary/10 transition-colors">
                          <Plus className="size-4" />
                        </div>
                        <span className="text-xs font-medium text-muted-foreground mt-2">Add custom server</span>
                      </div>
                    </Card>
                    {filteredItems.map((item) => (
                      <CatalogCard
                        key={`${item.name}-${item.url}`}
                        item={item}
                        isConnected={connectedUrls.has(item.url.replace(/\/$/, ''))}
                        isAdding={addingUrl === item.url && addMutation.isPending}
                        onAdd={handleAdd}
                        canConnect={!isReadOnlyMarketplace}
                      />
                    ))}
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center py-16 gap-2">
                    <p className="text-sm text-muted-foreground text-pretty text-center">
                      No servers match &ldquo;{search}&rdquo;
                    </p>
                    <button
                      type="button"
                      onClick={() => {
                        setSearch('');
                        setCategory('all');
                      }}
                      className="text-xs font-medium text-primary hover:underline transition-colors mt-2"
                    >
                      Clear filters
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── My Apps tab ──────────────────────────────────────── */}
          {activeTab === 'my-servers' && (
            <div className="max-w-6xl space-y-5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <h2 className="text-sm font-semibold">My Apps</h2>
                  {(serversData?.servers ?? []).length > 0 && (
                    <span className="text-xs font-medium text-muted-foreground/50 tabular-nums bg-muted/50 px-2 py-0.5 rounded-full">
                      {(serversData?.servers ?? []).length}
                    </span>
                  )}
                </div>
                <Button size="sm" variant="outline" className="h-7 gap-1.5 text-xs" onClick={handleCustomOpen}>
                  <Plus className="size-3" />
                  Add App
                </Button>
              </div>

              {serversLoading ? (
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
              ) : (serversData?.servers ?? []).length === 0 ? (
                <div className="rounded-xl border border-dashed border-border/60 py-12 flex flex-col items-center gap-3">
                  <div className="size-10 rounded-xl bg-muted/50 flex items-center justify-center">
                    <AppsIcon width={18} height={18} className="text-muted-foreground/50" />
                  </div>
                  <div className="text-center">
                    <p className="text-sm font-medium text-muted-foreground">No apps connected</p>
                    <p className="text-sm text-muted-foreground/60 mt-1.5">Browse to add your first app</p>
                  </div>
                  <Button size="sm" variant="outline" onClick={() => setActiveTab('browse')} className="mt-1">
                    Browse Apps
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
                                <ServiceIcon
                                  url={server.url}
                                  name={server.name}
                                  size={22}
                                  customIcon={getMcpCatalogIcon(server.url)}
                                />
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
                                  {!CATALOG_URLS.has(server.url.replace(/\/$/, '')) && (
                                    <DropdownMenuItem onClick={() => openEdit(server)}>
                                      <Pencil className="size-3.5 mr-2" />
                                      Edit
                                    </DropdownMenuItem>
                                  )}
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
                                              isDisabled
                                                ? 'text-muted-foreground/40 line-through'
                                                : 'text-foreground/80',
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
          )}
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

      {/* ── Custom server dialog ─────────────────────────────────── */}
      <Dialog
        open={showCustomDialog}
        onOpenChange={(v) => {
          if (!v) {
            setShowCustomDialog(false);
            resetCustomForm();
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add custom app</DialogTitle>
            <DialogDescription className="text-pretty">Connect any MCP-compatible remote endpoint.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-1">
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Name</Label>
                <Input
                  placeholder="My Server"
                  value={customForm.name}
                  onChange={(e) => setCustomForm((p) => ({ ...p, name: e.target.value }))}
                  autoFocus
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Auth</Label>
                <Select
                  value={customForm.authType}
                  onValueChange={(v: typeof customForm.authType) => setCustomForm((p) => ({ ...p, authType: v }))}
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
                value={customForm.url}
                onChange={(e) => setCustomForm((p) => ({ ...p, url: e.target.value }))}
              />
            </div>
            {customForm.authType === 'bearer' && (
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Bearer token</Label>
                <Input
                  type="password"
                  placeholder="sk-…"
                  value={customForm.bearerToken}
                  onChange={(e) => setCustomForm((p) => ({ ...p, bearerToken: e.target.value }))}
                />
              </div>
            )}
            {customForm.authType === 'header' && (
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Header name</Label>
                  <Input
                    placeholder="x-api-key"
                    value={customForm.headerName}
                    onChange={(e) => setCustomForm((p) => ({ ...p, headerName: e.target.value }))}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Header value</Label>
                  <Input
                    type="password"
                    placeholder="sk-…"
                    value={customForm.headerValue}
                    onChange={(e) => setCustomForm((p) => ({ ...p, headerValue: e.target.value }))}
                  />
                </div>
              </div>
            )}
            {customForm.authType === 'oauth' && (
              <p className="text-xs font-medium text-muted-foreground bg-muted/50 rounded-lg px-3 py-2">
                OAuth endpoints will be auto-discovered from the server URL after adding.
              </p>
            )}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setShowCustomDialog(false);
                resetCustomForm();
              }}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={() => customMutation.mutate()}
              disabled={!customForm.name.trim() || !customForm.url.trim() || customMutation.isPending}
            >
              {customMutation.isPending ? 'Adding…' : customForm.authType === 'oauth' ? 'Add & Connect' : 'Add App'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── OAuth setup dialog (pre-registered client credentials) ── */}
      <Dialog
        open={!!oauthSetupTarget}
        onOpenChange={(v) => {
          if (!v) {
            setOauthSetupTarget(null);
            setOauthSetupValues({});
          }
        }}
      >
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <div className="flex items-center gap-2.5 mb-1">
              <div className="size-7 flex items-center justify-center overflow-hidden shrink-0">
                {oauthSetupTarget && <ServiceIcon url={oauthSetupTarget.url} name={oauthSetupTarget.name} size={20} />}
              </div>
              <DialogTitle>Connect {oauthSetupTarget?.name}</DialogTitle>
            </div>
            <DialogDescription className="text-pretty">
              {oauthSetupTarget?.name} requires a pre-registered OAuth app. You&apos;ll be redirected to authorize after
              entering your credentials.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-1">
            {oauthSetupTarget?.oauthSetup?.map((field, i) => (
              <div key={field.key} className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label className="text-xs text-muted-foreground">{field.label}</Label>
                  {field.hintUrl && (
                    <a
                      href={field.hintUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-muted-foreground/60 hover:text-primary flex items-center gap-0.5 transition-colors"
                    >
                      {field.hintText ?? 'Get credentials'}
                      <ArrowUpRight className="size-3 ml-0.5" />
                    </a>
                  )}
                </div>
                <Input
                  type="password"
                  placeholder={field.placeholder}
                  value={oauthSetupValues[field.key] ?? ''}
                  onChange={(e) => setOauthSetupValues((p) => ({ ...p, [field.key]: e.target.value }))}
                  autoFocus={i === 0}
                />
              </div>
            ))}
            <div className="space-y-1.5 rounded-lg border border-border/60 bg-muted/30 px-2.5 py-2">
              <div className="flex items-center justify-between gap-2">
                <Label className="text-xs text-muted-foreground">Redirect URI</Label>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-6 px-2 text-xs"
                  onClick={async () => {
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
                {oauthCallbackUri}
              </code>
            </div>
            <p className="text-xs font-medium text-muted-foreground/60">
              Stored securely · you&apos;ll be redirected to authorize
            </p>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setOauthSetupTarget(null);
                setOauthSetupValues({});
              }}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={() => {
                if (!oauthSetupTarget) return;
                const allFilled = oauthSetupTarget.oauthSetup?.every((f) => oauthSetupValues[f.key]?.trim());
                if (!allFilled) return;
                setAddingUrl(oauthSetupTarget.url);
                addMutation.mutate({ item: oauthSetupTarget, oauthCredentials: oauthSetupValues });
              }}
              disabled={
                addMutation.isPending || !oauthSetupTarget?.oauthSetup?.every((f) => oauthSetupValues[f.key]?.trim())
              }
            >
              {addMutation.isPending ? 'Adding…' : 'Add & Connect'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── API Key dialog ───────────────────────────────────────── */}
      <Dialog
        open={!!apiKeyTarget}
        onOpenChange={(v) => {
          if (!v) {
            setApiKeyTarget(null);
            setApiKeyValues({});
          }
        }}
      >
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <div className="flex items-center gap-2.5 mb-1">
              <div className="size-7 flex items-center justify-center overflow-hidden shrink-0">
                {apiKeyTarget && <ServiceIcon url={apiKeyTarget.maintainerUrl} name={apiKeyTarget.name} size={20} />}
              </div>
              <DialogTitle>Connect {apiKeyTarget?.name}</DialogTitle>
            </div>
            <DialogDescription className="text-pretty">
              {apiKeyTarget?.fields?.length ? (
                'Enter your credentials to connect this app.'
              ) : (
                <>
                  Sent as{' '}
                  <code className="text-xs bg-muted px-1 py-0.5 rounded font-mono">Authorization: Bearer …</code>
                </>
              )}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-1">
            {apiKeyTarget?.fields?.length ? (
              apiKeyTarget.fields.map((field, i) => (
                <div key={field.label} className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs text-muted-foreground">{field.label}</Label>
                    {field.hintUrl && (
                      <a
                        href={field.hintUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-muted-foreground/60 hover:text-primary flex items-center gap-0.5 transition-colors"
                      >
                        {field.hintText ?? 'Get key'}
                        <ArrowUpRight className="size-3 ml-0.5" />
                      </a>
                    )}
                  </div>
                  <Input
                    type="password"
                    placeholder={field.placeholder}
                    value={apiKeyValues[field.label] ?? ''}
                    onChange={(e) => setApiKeyValues((p) => ({ ...p, [field.label]: e.target.value }))}
                    autoFocus={i === 0}
                  />
                  {field.steps && field.steps.length > 0 && (
                    <div className="rounded-lg border border-border/50 bg-muted/30 px-3 py-2.5 space-y-2">
                      <p className="text-xs font-medium text-muted-foreground">How to get your token</p>
                      <ol className="space-y-2">
                        {field.steps.map((step, si) => {
                          const scopeMatch = step.text.match(/^(.*?add:\s*)(.+)$/);
                          const scopes = scopeMatch
                            ? scopeMatch[2]
                                .split(',')
                                .map((s) => s.trim())
                                .filter(Boolean)
                            : null;
                          return (
                            <li key={si} className="flex gap-2 text-xs text-muted-foreground/80 leading-relaxed">
                              <span className="shrink-0 font-medium text-muted-foreground/50 tabular-nums">
                                {si + 1}.
                              </span>
                              <span className="space-y-1.5">
                                <span className="block">
                                  {scopes ? scopeMatch![1] : step.text}
                                  {step.url && (
                                    <a
                                      href={step.url}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="ml-1 text-primary hover:text-primary/80 inline-flex items-center gap-0.5 transition-colors"
                                    >
                                      {step.urlLabel ?? step.url}
                                      <ArrowUpRight className="size-3" />
                                    </a>
                                  )}
                                </span>
                                {scopes && (
                                  <span className="flex flex-wrap gap-1">
                                    {scopes.map((scope) => (
                                      <code
                                        key={scope}
                                        className="text-xs bg-background border border-border/60 rounded px-1.5 py-0.5 font-mono text-foreground/70"
                                      >
                                        {scope}
                                      </code>
                                    ))}
                                    <button
                                      type="button"
                                      onClick={() => navigator.clipboard.writeText(scopes.join(' '))}
                                      className="text-xs text-muted-foreground/50 hover:text-primary transition-colors ml-0.5 flex items-center gap-0.5"
                                    >
                                      Copy all
                                    </button>
                                  </span>
                                )}
                              </span>
                            </li>
                          );
                        })}
                      </ol>
                    </div>
                  )}
                </div>
              ))
            ) : (
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">API Key</Label>
                <Input
                  type="password"
                  placeholder="sk-…"
                  value={apiKeyValues['key'] ?? ''}
                  onChange={(e) => setApiKeyValues({ key: e.target.value })}
                  autoFocus
                />
              </div>
            )}
            <p className="text-xs font-medium text-muted-foreground/60">Stored securely · editable later in My Apps</p>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setApiKeyTarget(null);
                setApiKeyValues({});
              }}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={() => {
                if (!apiKeyTarget) return;
                const firstVal = apiKeyTarget.fields?.length ? Object.values(apiKeyValues)[0] : apiKeyValues['key'];
                if (!firstVal?.trim()) return;
                setAddingUrl(apiKeyTarget.url);
                addMutation.mutate({ item: apiKeyTarget, fieldValues: apiKeyValues });
              }}
              disabled={addMutation.isPending || !Object.values(apiKeyValues).some((v) => v.trim())}
            >
              {addMutation.isPending ? 'Adding…' : 'Add App'}
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
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {Array.from({ length: 12 }).map((_, i) => (
                <CardSkeleton key={i} />
              ))}
            </div>
          </div>
        </div>
      }
    >
      <McpMarketplaceContent />
    </Suspense>
  );
}
