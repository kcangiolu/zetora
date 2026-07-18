'use client';

import { Button } from '@/components/ui/button';

import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import { useMediaQuery } from '@/hooks/use-media-query';

import {
  createConnectorAction,
  listUserConnectorsAction,
  deleteConnectorAction,
  manualSyncConnectorAction,
  getConnectorSyncStatusAction,
} from '@/app/actions';

import { all } from 'better-all';
import { getBetterAllOptions } from '@/lib/better-all';

import { Check, X, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';

import { sileo } from 'sileo';
import { useQuery } from '@tanstack/react-query';

import { Loader2 } from 'lucide-react';

import { cn } from '@/lib/utils';

import { HugeiconsIcon } from '@/components/ui/hugeicons';
import { Crown02Icon, InformationCircleIcon } from '@hugeicons/core-free-icons';
import { CONNECTOR_CONFIGS, CONNECTOR_ICONS, type ConnectorProvider } from '@/lib/connectors';

// Custom visx-based chart components

export function ConnectorsSection({ user }: { user: any }) {
  const isProUser = user?.isProUser || false;
  const isMobile = useMediaQuery('(max-width: 768px)');
  const [connectingProvider, setConnectingProvider] = useState<ConnectorProvider | null>(null);
  const [syncingProvider, setSyncingProvider] = useState<ConnectorProvider | null>(null);
  const [deletingConnectionId, setDeletingConnectionId] = useState<string | null>(null);

  const {
    data: connectorsData,
    isLoading: connectorsLoading,
    refetch: refetchConnectors,
  } = useQuery({
    queryKey: ['connectors', user?.id],
    queryFn: listUserConnectorsAction,
    enabled: !!user && isProUser,
    staleTime: 1000 * 60 * 2,
  });

  // Query actual connection status for each provider using Supermemory API
  const connectionStatusQueries = useQuery({
    queryKey: ['connectorsStatus', user?.id],
    queryFn: async () => {
      if (!user?.id || !isProUser) return {};

      const providers = Object.keys(CONNECTOR_CONFIGS) as ConnectorProvider[];
      const statusMap = await all(
        Object.fromEntries(
          providers.map((provider) => [
            `provider:${provider}`,
            async () => {
              try {
                return await getConnectorSyncStatusAction(provider);
              } catch (error) {
                console.error(`Failed to get status for ${provider}:`, error);
                return null;
              }
            },
          ]),
        ),
        getBetterAllOptions(),
      );

      return providers.reduce(
        (acc, provider) => {
          acc[provider] = statusMap[`provider:${provider}`];
          return acc;
        },
        {} as Record<string, any>,
      );
    },
    enabled: !!user?.id && isProUser,
    staleTime: 1000 * 60 * 2,
  });

  const handleConnect = async (provider: ConnectorProvider) => {
    setConnectingProvider(provider);
    try {
      const result = await createConnectorAction(provider);
      if (result.success && result.authLink) {
        window.location.href = result.authLink;
      } else {
        sileo.error({
          title: result.error || 'Failed to connect',
          description: 'Please try again',
          icon: <X className="h-4 w-4" />,
        });
      }
    } catch (error) {
      sileo.error({
        title: 'Failed to connect',
        description: 'Please try again',
        icon: <X className="h-4 w-4" />,
      });
    } finally {
      setConnectingProvider(null);
    }
  };

  const handleSync = async (provider: ConnectorProvider) => {
    setSyncingProvider(provider);
    try {
      const result = await manualSyncConnectorAction(provider);
      if (result.success) {
        sileo.success({
          title: `${CONNECTOR_CONFIGS[provider].name} sync started`,
          description: 'Your data is being synchronized',
          icon: <Check className="h-4 w-4" />,
        });
        refetchConnectors();
        // Refetch connection status after a delay to show updated counts
        setTimeout(() => {
          connectionStatusQueries.refetch();
        }, 2000);
      } else {
        sileo.error({
          title: result.error || 'Failed to sync',
          description: 'Please try again',
          icon: <X className="h-4 w-4" />,
        });
      }
    } catch (error) {
      sileo.error({
        title: 'Failed to sync',
        description: 'Please try again',
        icon: <X className="h-4 w-4" />,
      });
    } finally {
      setSyncingProvider(null);
    }
  };

  const handleDelete = async (connectionId: string, providerName: string) => {
    setDeletingConnectionId(connectionId);
    try {
      const result = await deleteConnectorAction(connectionId);
      if (result.success) {
        sileo.success({
          title: `${providerName} disconnected`,
          description: 'The connection has been removed',
          icon: <Trash2 className="h-4 w-4" />,
        });
        refetchConnectors();
        // Also refetch connection statuses immediately to update the UI
        connectionStatusQueries.refetch();
      } else {
        sileo.error({
          title: result.error || 'Failed to disconnect',
          description: 'Please try again',
          icon: <X className="h-4 w-4" />,
        });
      }
    } catch (error) {
      sileo.error({
        title: 'Failed to disconnect',
        description: 'Please try again',
        icon: <X className="h-4 w-4" />,
      });
    } finally {
      setDeletingConnectionId(null);
    }
  };

  const connections = connectorsData?.connections || [];
  const connectionStatuses = connectionStatusQueries.data || {};

  return (
    <div className={cn('space-y-4', isMobile ? 'space-y-3' : 'space-y-4')}>
      <div>
        <div className="flex items-center gap-2 mb-1">
          <span className="font-pixel-grid text-xs text-muted-foreground/50">01</span>
          <h3 className={cn('font-semibold', isMobile ? 'text-sm' : 'text-base')}>Connected Services</h3>
        </div>
        <p className={cn('text-muted-foreground ml-5', isMobile ? 'text-[11px] leading-relaxed' : 'text-xs')}>
          Connect your cloud services to search across all your documents in one place
        </p>
      </div>

      {/* Beta Announcement Alert */}
      <Alert className="border-primary/20 bg-primary/5 rounded-xl">
        <HugeiconsIcon icon={InformationCircleIcon} className="h-4 w-4 text-primary" />
        <AlertTitle className="text-foreground text-sm">
          Connectors <span className="font-pixel text-[11px] uppercase tracking-wider text-primary/50">Beta</span>
        </AlertTitle>
        <AlertDescription className="text-muted-foreground text-xs">
          Available for Pro users. This feature is in beta and there may be breaking changes.
        </AlertDescription>
      </Alert>

      {!isProUser && (
        <div className="border border-dashed border-border/60 rounded-xl p-6 text-center bg-muted/10">
          <div className="flex flex-col items-center space-y-4">
            <div className="w-12 h-12 rounded-xl bg-muted/50 flex items-center justify-center">
              <HugeiconsIcon
                icon={Crown02Icon}
                size={24}
                color="currentColor"
                strokeWidth={1.5}
                className="text-muted-foreground"
              />
            </div>
            <div className="space-y-2">
              <h4 className="font-semibold text-base">
                <span className="font-pixel text-xs uppercase tracking-wider">Pro</span> Feature
              </h4>
              <p className="text-muted-foreground text-xs max-w-sm mx-auto">
                Connectors are available for Pro users only. Upgrade to connect Google Drive, Notion, and OneDrive.
              </p>
            </div>
            <Button asChild className="rounded-lg">
              <Link href="/pricing">
                <HugeiconsIcon icon={Crown02Icon} size={14} color="currentColor" strokeWidth={1.5} className="mr-2" />
                Upgrade to Pro
              </Link>
            </Button>
          </div>
        </div>
      )}

      {isProUser && (
        <div className="space-y-3">
          {Object.entries(CONNECTOR_CONFIGS).map(([provider, config]) => {
            const connectionStatus = connectionStatuses[provider]?.status;
            const connection = connections.find((c) => c.provider === provider);
            // A connector is connected if we have a connection record OR if status check confirms it
            const isConnected = !!connection || (connectionStatus?.isConnected && connectionStatus !== null);
            const isConnecting = connectingProvider === provider;
            const isSyncing = syncingProvider === provider;
            const isDeleting = connection && deletingConnectionId === connection.id;
            const isStatusLoading = connectionStatusQueries.isLoading;
            const isComingSoon = provider === 'onedrive';

            return (
              <div key={provider} className={cn('border border-border/60 rounded-xl', isMobile ? 'p-3' : 'p-4')}>
                <div className={cn('flex items-center', isMobile ? 'gap-2' : 'justify-between')}>
                  <div className="flex items-start gap-3">
                    <div className="flex items-center justify-center w-7 h-7 mt-0.5 rounded-lg bg-muted/50">
                      <div className="text-lg">
                        {(() => {
                          const IconComponent = CONNECTOR_ICONS[config.icon];
                          return IconComponent ? <IconComponent /> : null;
                        })()}
                      </div>
                    </div>
                    <div className="flex-1 min-w-0">
                      <h4 className={cn('font-medium', isMobile ? 'text-[13px]' : 'text-sm')}>{config.name}</h4>
                      <p className={cn('text-muted-foreground', isMobile ? 'text-[10px] leading-tight' : 'text-xs')}>
                        {config.description}
                      </p>
                      {isComingSoon ? (
                        <div className={cn('flex items-center gap-2', isMobile ? 'mt-0.5' : 'mt-1')}>
                          <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                          <span
                            className={cn('text-blue-600 dark:text-blue-400', isMobile ? 'text-[10px]' : 'text-xs')}
                          >
                            Coming Soon
                          </span>
                        </div>
                      ) : isStatusLoading && !connection ? (
                        <div className={cn('flex items-center gap-2', isMobile ? 'mt-0.5' : 'mt-1')}>
                          <div className="w-2 h-2 bg-muted animate-pulse rounded-full"></div>
                          <span className={cn('text-muted-foreground', isMobile ? 'text-[10px]' : 'text-xs')}>
                            Checking connection...
                          </span>
                        </div>
                      ) : isConnected ? (
                        <div className={cn('flex items-center gap-2', isMobile ? 'mt-0.5' : 'mt-1')}>
                          <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                          <span
                            className={cn('text-green-600 dark:text-green-400', isMobile ? 'text-[10px]' : 'text-xs')}
                          >
                            Connected
                          </span>
                          {(connectionStatus?.email || connection?.email) && (
                            <span className={cn('text-muted-foreground', isMobile ? 'text-[10px]' : 'text-xs')}>
                              • {connectionStatus?.email || connection?.email}
                            </span>
                          )}
                        </div>
                      ) : (
                        <div className={cn('flex items-center gap-2', isMobile ? 'mt-0.5' : 'mt-1')}>
                          <div className="w-2 h-2 bg-muted-foreground/30 rounded-full"></div>
                          <span className={cn('text-muted-foreground', isMobile ? 'text-[10px]' : 'text-xs')}>
                            Not connected
                          </span>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className={cn('flex items-center', isMobile ? 'gap-1' : 'gap-2')}>
                    {isComingSoon ? (
                      <Button
                        size="sm"
                        disabled
                        variant="outline"
                        className={cn(
                          'text-blue-600 dark:text-blue-400 border-blue-200 dark:border-blue-800',
                          isMobile ? 'h-7 text-[10px] px-2' : 'h-8',
                        )}
                      >
                        Coming Soon
                      </Button>
                    ) : isConnected ? (
                      <>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleSync(provider as ConnectorProvider)}
                          disabled={isSyncing || isDeleting || isStatusLoading}
                          className={cn(isMobile ? 'h-7 text-[10px] px-2' : 'h-8')}
                        >
                          {isSyncing ? (
                            <>
                              <Loader2 className={cn(isMobile ? 'h-2.5 w-2.5' : 'h-3 w-3', 'animate-spin mr-1')} />
                              Syncing...
                            </>
                          ) : (
                            'Sync'
                          )}
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => connection && handleDelete(connection.id, config.name)}
                          disabled={isDeleting || isSyncing || isStatusLoading}
                          className={cn(
                            'text-destructive hover:text-destructive',
                            isMobile ? 'h-7 text-[10px] px-2' : 'h-8',
                          )}
                        >
                          {isDeleting ? (
                            <>
                              <Loader2 className={cn(isMobile ? 'h-2.5 w-2.5' : 'h-3 w-3', 'animate-spin mr-1')} />
                              Disconnecting...
                            </>
                          ) : (
                            'Disconnect'
                          )}
                        </Button>
                      </>
                    ) : (
                      <Button
                        size="sm"
                        onClick={() => handleConnect(provider as ConnectorProvider)}
                        disabled={isConnecting || isStatusLoading}
                        className={cn(isMobile ? 'h-7 text-[10px] px-2' : 'h-8')}
                      >
                        {isConnecting ? (
                          <>
                            <Loader2 className={cn(isMobile ? 'h-2.5 w-2.5' : 'h-3 w-3', 'animate-spin mr-1')} />
                            Connecting...
                          </>
                        ) : (
                          'Connect'
                        )}
                      </Button>
                    )}
                  </div>
                </div>

                {isConnected && !isComingSoon && (
                  <div className={cn('border-t border-border', isMobile ? 'mt-2 pt-2' : 'mt-3 pt-3')}>
                    <div className={cn('text-xs', isMobile ? 'grid grid-cols-1 gap-2' : 'grid grid-cols-3 gap-4')}>
                      <div>
                        <span className="text-muted-foreground">Document Chunk:</span>
                        <div className="font-medium">
                          {isStatusLoading ? (
                            <span className="text-muted-foreground">Loading...</span>
                          ) : connectionStatus?.documentCount !== undefined ? (
                            connectionStatus.documentCount === 0 ? (
                              <span
                                className="text-amber-600 dark:text-amber-400"
                                title="Documents are being synced from your account"
                              >
                                Syncing...
                              </span>
                            ) : (
                              connectionStatus.documentCount.toLocaleString()
                            )
                          ) : connection?.metadata?.pageToken ? (
                            connection.metadata.pageToken === 0 ? (
                              <span
                                className="text-amber-600 dark:text-amber-400"
                                title="Documents are being synced from your account"
                              >
                                Syncing...
                              </span>
                            ) : (
                              connection.metadata.pageToken.toLocaleString()
                            )
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </div>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Last Sync:</span>
                        <div className="font-medium">
                          {isStatusLoading ? (
                            <span className="text-muted-foreground">Loading...</span>
                          ) : connectionStatus?.lastSync || connection?.createdAt ? (
                            new Date(connectionStatus?.lastSync || connection?.createdAt).toLocaleDateString()
                          ) : (
                            <span className="text-muted-foreground">Never</span>
                          )}
                        </div>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Limit:</span>
                        <div className="font-medium">{config.documentLimit.toLocaleString()}</div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

