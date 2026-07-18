import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Plus, Check, Loader2, ArrowUpRight } from 'lucide-react';
import { getMcpCatalogIcon, MCP_COMPONENT_ICON_URLS } from '@/lib/mcp/catalog-icons';
import { Github01Icon } from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@/components/ui/hugeicons';
import { CATEGORIES, faviconUrl, type CatalogAuth, type CatalogItem } from './catalog-data';

const AUTH_LABELS: Record<CatalogAuth, string> = { oauth: 'OAuth', apikey: 'API Key', open: 'Free' };

export function isOauthWithClientSetup(item: CatalogItem) {
  return item.auth === 'oauth' && Boolean(item.oauthSetup?.length);
}

// ─── Sub-components ───────────────────────────────────────────────────────────

export function ServiceIcon({
  url,
  name,
  size = 24,
  customIcon,
  serverUrl,
}: {
  url: string;
  name: string;
  size?: number;
  customIcon?: string;
  serverUrl?: string;
}) {
  const checkUrl = (serverUrl ?? url).replace(/\/+$/, '');
  if (MCP_COMPONENT_ICON_URLS.has(checkUrl)) {
    return <HugeiconsIcon icon={Github01Icon} size={size} className="text-foreground" />;
  }
  const src = customIcon ?? getMcpCatalogIcon(serverUrl ?? url) ?? faviconUrl(url);
  return src ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt={name} width={size} height={size} className="object-contain rounded" loading="lazy" />
  ) : (
    <span
      className="flex items-center justify-center rounded-md bg-muted text-xs font-semibold text-muted-foreground/70"
      style={{ width: size, height: size }}
    >
      {name.slice(0, 2).toUpperCase()}
    </span>
  );
}

export function CatalogCard({
  item,
  isConnected,
  isAdding,
  onAdd,
  canConnect = true,
}: {
  item: CatalogItem;
  isConnected: boolean;
  isAdding: boolean;
  onAdd: (item: CatalogItem) => void;
  canConnect?: boolean;
}) {
  const catLabel = CATEGORIES.find((c) => c.id === item.category)?.label ?? item.category;
  const needsClientSetup = isOauthWithClientSetup(item);

  return (
    <Card className="shadow-none bg-card/50 border border-border/60 hover:border-primary/30 hover:shadow-sm transition-all duration-200 h-full flex flex-col rounded-xl group">
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <div className="size-8 flex items-center justify-center overflow-hidden shrink-0">
            <ServiceIcon
              url={item.maintainerUrl}
              name={item.name}
              size={24}
              customIcon={item.customIcon ?? getMcpCatalogIcon(item.url)}
              serverUrl={item.url}
            />
          </div>
          {isConnected ? (
            <span className="text-xs font-medium text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5 bg-emerald-500/10 px-2 py-0.5 rounded-full">
              <Check className="size-3" /> Added
            </span>
          ) : (
            <button
              type="button"
              onClick={() => onAdd(item)}
              disabled={isAdding}
              aria-label={`Add ${item.name}`}
              className="text-xs font-medium text-muted-foreground hover:text-primary flex items-center gap-1.5 transition-colors disabled:opacity-50 px-2 py-1 rounded-md hover:bg-muted"
            >
              {isAdding ? <Loader2 className="size-3 animate-spin" /> : <Plus className="size-3" />}
              {isAdding ? 'Adding' : canConnect ? 'Add' : 'Upgrade'}
            </button>
          )}
        </div>
        <CardTitle className="text-sm font-medium group-hover:text-primary transition-colors line-clamp-1 mt-2 ml-1">
          {item.name}
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0 flex-1 flex flex-col justify-between gap-2">
        <div className="flex items-center gap-2 flex-wrap mt-1">
          <span className="inline-flex items-center rounded-md bg-secondary/50 px-2 py-0.5 text-xs font-medium text-secondary-foreground ring-1 ring-inset ring-secondary-foreground/10">
            {catLabel}
          </span>
          <span className="inline-flex items-center rounded-md bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground ring-1 ring-inset ring-muted-foreground/10">
            {AUTH_LABELS[item.auth]}
          </span>
          {needsClientSetup && (
            <span className="inline-flex items-center rounded-md bg-amber-500/10 px-2 py-0.5 text-xs font-medium text-amber-600 dark:text-amber-400 ring-1 ring-inset ring-amber-500/20">
              Client setup
            </span>
          )}
        </div>
        <a
          href={item.maintainerUrl}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="text-xs text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1 w-fit mt-3"
        >
          {item.maintainer}
          <ArrowUpRight className="size-3" />
        </a>
      </CardContent>
    </Card>
  );
}

export function CardSkeleton() {
  return (
    <Card className="shadow-none h-full flex flex-col rounded-xl">
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <Skeleton className="size-8 rounded-lg" />
          <Skeleton className="h-3 w-8" />
        </div>
        <Skeleton className="h-4 w-3/4 mt-2" />
      </CardHeader>
      <CardContent className="pt-0 flex-1 flex flex-col justify-between gap-2">
        <div className="flex items-center gap-2 mt-1">
          <Skeleton className="h-5 w-16 rounded-md" />
          <Skeleton className="h-5 w-12 rounded-md" />
        </div>
        <Skeleton className="h-3 w-20 mt-3" />
      </CardContent>
    </Card>
  );
}

// ─── Page content ─────────────────────────────────────────────────────────────
