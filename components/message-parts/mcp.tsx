import { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { DataUIPart } from 'ai';
import { MarkdownRenderer } from '@/components/markdown';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { Button } from '@/components/ui/button';
import { sileo } from 'sileo';
import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import type { ChatMessage, CustomUIDataTypes } from '@/lib/types';
import { createLogger } from '@/lib/logger';
import { UseChatHelpers } from '@ai-sdk/react';
import {
  AppBridge,
  PostMessageTransport,
  buildAllowAttribute,
  getToolUiResourceUri,
  type McpUiHostContext,
  type McpUiResourceMeta,
} from '@modelcontextprotocol/ext-apps/app-bridge';
import { useTheme } from 'next-themes';
import { Loader2, Check, X, Clock } from 'lucide-react';
import { ArrowRightIcon } from '@phosphor-icons/react';

// Pill that shows inline input params (e.g. query="…") like other tool headers
export const McpInputPill = ({ input }: { input: Record<string, unknown> }) => {
  const entries = Object.entries(input).slice(0, 3);
  if (!entries.length) return null;

  function formatValue(val: unknown): string {
    if (val === null || val === undefined) return 'null';
    if (typeof val === 'string') return val;
    if (typeof val === 'number' || typeof val === 'boolean') return String(val);
    try {
      return JSON.stringify(val);
    } catch {
      return String(val);
    }
  }

  return (
    <div className="flex items-center gap-1.5 flex-wrap mt-1.5 mb-2">
      {entries.map(([key, val]) => (
        <span
          key={key}
          className="inline-flex items-center gap-1 rounded-sm border border-border bg-muted px-1.5 py-0.5 text-[10px] text-foreground max-w-[220px] truncate"
        >
          <span className="text-muted-foreground">{key}</span>
          <span className="truncate">{formatValue(val).slice(0, 60)}</span>
        </span>
      ))}
    </div>
  );
};

const STRUCTURED_CONTENT_BLOCKLIST = new Set([
  '__zetora_mcp_app',
  'SYSTEM_MESSAGE',
  'system_message',
  'systemMessage',
  '_meta',
  '__meta',
  '__internal',
  'requiresApproval',
  'approvalToken',
  'instructions',
]);

function extractStructuredContent(output: unknown): Record<string, unknown> | null {
  if (!output || typeof output !== 'object') return null;
  const obj = output as Record<string, unknown>;
  const sc = obj.structuredContent;
  if (!sc || typeof sc !== 'object' || Array.isArray(sc)) return null;
  const cleaned: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(sc as Record<string, unknown>)) {
    if (!STRUCTURED_CONTENT_BLOCKLIST.has(k) && !k.startsWith('__')) {
      cleaned[k] = v;
    }
  }
  if (Object.keys(cleaned).length === 0) return null;
  return cleaned;
}

function isMarkdownLike(val: unknown): val is string {
  if (typeof val !== 'string' || val.length < 10) return false;
  return /[*_`#\n\[\]]/.test(val) || val.includes('\n');
}

function isTableLike(val: unknown): val is Record<string, unknown>[] {
  if (!Array.isArray(val) || val.length === 0) return false;
  return val.every((item) => item !== null && typeof item === 'object' && !Array.isArray(item));
}

const StructuredContentTable = ({ rows }: { rows: Record<string, unknown>[] }) => {
  const cols = useMemo(() => {
    const keys = new Set<string>();
    rows.slice(0, 20).forEach((row) => Object.keys(row).forEach((k) => keys.add(k)));
    return Array.from(keys).slice(0, 8);
  }, [rows]);

  return (
    <div className="overflow-x-auto rounded-md border border-border/50">
      <table className="w-full text-[11px] border-collapse">
        <thead>
          <tr className="bg-muted/40 border-b border-border/50">
            {cols.map((col) => (
              <th
                key={col}
                className="px-2.5 py-1.5 text-left font-medium text-muted-foreground uppercase tracking-wide whitespace-nowrap"
              >
                {col}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.slice(0, 50).map((row, i) => (
            <tr key={i} className={cn('border-b border-border/30 last:border-0', i % 2 === 0 ? '' : 'bg-muted/20')}>
              {cols.map((col) => {
                const val = row[col];
                const display =
                  val === null || val === undefined ? '—' : typeof val === 'object' ? JSON.stringify(val) : String(val);
                return (
                  <td key={col} className="px-2.5 py-1.5 text-foreground/80 max-w-[200px] truncate">
                    {display}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length > 50 && (
        <div className="px-2.5 py-1.5 text-[10px] text-muted-foreground/60 border-t border-border/30">
          Showing 50 of {rows.length} rows
        </div>
      )}
    </div>
  );
};

const StructuredContentView = ({ data }: { data: Record<string, unknown> }) => {
  const entries = Object.entries(data);

  // Single markdown string value
  if (entries.length === 1 && isMarkdownLike(entries[0][1])) {
    return (
      <div className="px-3.5 py-2.5 text-[12px] leading-relaxed text-foreground/85 prose-sm max-w-none">
        <MarkdownRenderer content={entries[0][1] as string} />
      </div>
    );
  }

  return (
    <div className="px-3.5 py-2.5 space-y-2.5">
      {entries.map(([key, val]) => {
        if (isTableLike(val)) {
          return (
            <div key={key} className="space-y-1.5">
              <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide block">{key}</span>
              <StructuredContentTable rows={val as Record<string, unknown>[]} />
            </div>
          );
        }

        if (isMarkdownLike(val)) {
          return (
            <div key={key} className="space-y-0.5">
              <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">{key}</span>
              <div className="text-[12px] leading-relaxed text-foreground/85 pl-0.5">
                <MarkdownRenderer content={val} />
              </div>
            </div>
          );
        }

        if (Array.isArray(val)) {
          return (
            <div key={key} className="space-y-1">
              <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">{key}</span>
              <div className="flex flex-wrap gap-1">
                {(val as unknown[]).slice(0, 30).map((item, i) => (
                  <span
                    key={i}
                    className="inline-flex items-center rounded-sm border border-border bg-muted px-1.5 py-0.5 text-[10px] text-foreground/80 max-w-[180px] truncate"
                  >
                    {typeof item === 'object' ? JSON.stringify(item) : String(item)}
                  </span>
                ))}
                {val.length > 30 && (
                  <span className="text-[10px] text-muted-foreground/60">+{val.length - 30} more</span>
                )}
              </div>
            </div>
          );
        }

        if (typeof val === 'boolean') {
          return (
            <div key={key} className="flex items-center gap-2">
              <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">{key}</span>
              <span
                className={cn(
                  'text-[10px] font-medium rounded px-1.5 py-0.5 border',
                  val
                    ? 'text-emerald-700 dark:text-emerald-400 bg-emerald-500/10 border-emerald-500/20'
                    : 'text-muted-foreground bg-muted/50 border-border/50',
                )}
              >
                {String(val)}
              </span>
            </div>
          );
        }

        if (typeof val === 'number') {
          return (
            <div key={key} className="flex items-baseline gap-2">
              <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide shrink-0">
                {key}
              </span>
              <span className="text-[12px] font-medium text-amber-600 dark:text-amber-400 tabular-nums">{val}</span>
            </div>
          );
        }

        if (typeof val === 'object' && val !== null) {
          return (
            <div key={key} className="space-y-0.5">
              <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">{key}</span>
              <div className="rounded-md bg-muted/40 border border-border/40 px-2.5 py-1.5 text-[11px] text-foreground/80 font-mono whitespace-pre-wrap break-all">
                {JSON.stringify(val, null, 2)}
              </div>
            </div>
          );
        }

        // Plain string / null / undefined
        const display = val === null || val === undefined ? '—' : String(val);
        return (
          <div key={key} className="flex gap-3 items-start">
            <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide shrink-0 pt-px min-w-[80px]">
              {key}
            </span>
            <span className="text-[12px] text-foreground/85 break-all">{display}</span>
          </div>
        );
      })}
    </div>
  );
};

export const McpOutputBlock = ({ output }: { output: unknown }) => {
  const [showRaw, setShowRaw] = useState(false);
  const structuredContent = useMemo(() => extractStructuredContent(output), [output]);

  const codeString = useMemo(() => (typeof output === 'string' ? output : JSON.stringify(output, null, 2)), [output]);

  if (structuredContent && !showRaw) {
    return (
      <div>
        <StructuredContentView data={structuredContent} />
        <div className="px-3.5 pb-2.5">
          <button
            type="button"
            onClick={() => setShowRaw(true)}
            className="text-[10px] text-muted-foreground/50 hover:text-muted-foreground transition-colors"
          >
            Show raw
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="px-3.5 py-2.5 max-h-64 overflow-y-auto">
      {structuredContent && (
        <div className="mb-1.5 flex justify-end">
          <button
            type="button"
            onClick={() => setShowRaw(false)}
            className="text-[10px] text-muted-foreground/50 hover:text-muted-foreground transition-colors"
          >
            Show structured
          </button>
        </div>
      )}
      <SyntaxHighlighter
        language="json"
        useInlineStyles={false}
        customStyle={{
          margin: 0,
          padding: '0.625rem',
          fontSize: '11px',
          lineHeight: '1.5',
          borderRadius: '0.375rem',
          background: 'transparent',
        }}
        className="bg-muted/50! rounded-md **:text-shadow-none! [&_.token.property]:text-primary [&_.token.string]:text-emerald-600 dark:[&_.token.string]:text-emerald-400 [&_.token.number]:text-amber-600 dark:[&_.token.number]:text-amber-400 [&_.token.boolean]:text-violet-600 dark:[&_.token.boolean]:text-violet-400 [&_.token.null]:text-muted-foreground [&_.token.punctuation]:text-muted-foreground [&_.token.operator]:text-muted-foreground [&_code]:text-foreground/80 [&_pre]:whitespace-pre-wrap! [&_pre]:wrap-break-word! [&_pre]:overflow-wrap-anywhere! [&_code]:whitespace-pre-wrap! [&_code]:wrap-break-word! [&_code]:overflow-wrap-anywhere!"
        wrapLongLines
      >
        {codeString}
      </SyntaxHighlighter>
    </div>
  );
};

interface McpApprovalData {
  requiresApproval: true;
  approvalToken: string;
  expiresInMinutes?: number;
  preview?: Record<string, string>;
  instructions?: string;
}

export function extractApprovalData(output: unknown): McpApprovalData | null {
  if (!output) return null;
  // Try structuredContent directly
  const check = (obj: any): McpApprovalData | null => {
    if (obj?.requiresApproval === true && obj?.approvalToken) return obj as McpApprovalData;
    if (obj?.structuredContent?.requiresApproval === true && obj?.structuredContent?.approvalToken)
      return obj.structuredContent as McpApprovalData;
    return null;
  };
  if (typeof output === 'object') return check(output);
  if (typeof output === 'string') {
    try {
      return check(JSON.parse(output));
    } catch {
      return null;
    }
  }
  return null;
}

export interface McpAppRenderData {
  kind: 'iframe-url' | 'iframe-html' | 'ui-resource';
  url?: string;
  html?: string;
  resourceUri?: string;
  serverId?: string;
  serverName?: string;
  toolName?: string;
}

const SANDBOX_ORIGIN = process.env.NEXT_PUBLIC_MCP_SANDBOX_ORIGIN || '';

// Module-level cache: serverId:resourceUri -> { html, resourceMeta }
// Survives accordion close/reopen and tab switches without re-fetching
const mcpHtmlCache = new Map<string, { html: string; resourceMeta: McpUiResourceMeta | null }>();

function getSandboxUrl(resourceUri: string): string | null {
  if (!SANDBOX_ORIGIN) return null;
  return SANDBOX_ORIGIN.replace(/\/+$/, '');
}

function getSafeToolUiResourceUri(candidate: unknown): string | undefined {
  if (!candidate || typeof candidate !== 'object') return undefined;
  try {
    return getToolUiResourceUri(candidate as { _meta?: Record<string, unknown> });
  } catch {
    return undefined;
  }
}

const mcpAppLog = createLogger('mcp-app');

function logMcpAppDebug(event: string, details?: Record<string, unknown>) {
  mcpAppLog.debug(event, details ?? {});
}

export function extractMcpAppRenderData(output: unknown): McpAppRenderData | null {
  if (!output) return null;

  const check = (obj: any): McpAppRenderData | null => {
    if (!obj || typeof obj !== 'object') return null;

    // Direct URL-style app outputs
    const directUrl = obj?.structuredContent?.appUrl || obj?.structuredContent?.ui?.url || obj?.appUrl || obj?.url;
    const stampedAppMeta = obj?.structuredContent?.__zetora_mcp_app;
    if (
      stampedAppMeta &&
      typeof stampedAppMeta === 'object' &&
      typeof stampedAppMeta?.resourceUri === 'string' &&
      stampedAppMeta.resourceUri.startsWith('ui://')
    ) {
      return {
        kind: 'ui-resource',
        resourceUri: stampedAppMeta.resourceUri,
        serverId: typeof stampedAppMeta.serverId === 'string' ? stampedAppMeta.serverId : undefined,
        serverName: typeof stampedAppMeta.serverName === 'string' ? stampedAppMeta.serverName : undefined,
        toolName: typeof stampedAppMeta.toolName === 'string' ? stampedAppMeta.toolName : undefined,
      };
    }

    if (typeof directUrl === 'string' && /^https?:\/\//i.test(directUrl)) {
      return { kind: 'iframe-url', url: directUrl };
    }

    // Prefer the SDK helper so we stay compatible with both current and
    // legacy tool metadata formats while still supporting our stamped fallback.
    const uiResourceUri =
      getSafeToolUiResourceUri(obj) || getSafeToolUiResourceUri({ _meta: obj?.meta }) || obj?.resourceUri;
    if (typeof uiResourceUri === 'string' && uiResourceUri.startsWith('ui://')) {
      return { kind: 'ui-resource', resourceUri: uiResourceUri };
    }

    // Content array variants
    if (Array.isArray(obj?.content)) {
      for (const item of obj.content) {
        if (!item || typeof item !== 'object') continue;
        const candidateUri = item?.uri || item?.resource?.uri;
        if (typeof candidateUri === 'string') {
          if (/^https?:\/\//i.test(candidateUri)) return { kind: 'iframe-url', url: candidateUri };
          if (candidateUri.startsWith('ui://')) return { kind: 'ui-resource', resourceUri: candidateUri };
        }
        const mime = item?.mimeType || item?.resource?.mimeType;
        const html = item?.text || item?.resource?.text;
        if (typeof html === 'string' && typeof mime === 'string' && mime.includes('text/html')) {
          return { kind: 'iframe-html', html };
        }
      }
    }

    return null;
  };

  if (typeof output === 'object') return check(output);
  if (typeof output === 'string') {
    try {
      return check(JSON.parse(output));
    } catch {
      return null;
    }
  }
  return null;
}

export function toImageCardState(
  state: string,
): 'input-streaming' | 'input-available' | 'output-available' | 'output-error' {
  if (state === 'input-streaming' || state === 'output-available' || state === 'output-error') return state;
  return 'input-available';
}

function normalizeMcpAppToolResult(
  output: unknown,
): { content: Array<Record<string, unknown>>; [key: string]: unknown } | null {
  if (output === null || output === undefined) return null;

  if (typeof output === 'string') {
    return { content: [{ type: 'text', text: output }] };
  }

  if (typeof output !== 'object') {
    return { content: [{ type: 'text', text: String(output) }] };
  }

  const record = output as Record<string, unknown>;
  if (record.toolResult && typeof record.toolResult === 'object') {
    const toolResult = record.toolResult as Record<string, unknown>;
    if (Array.isArray(toolResult.content)) {
      return toolResult as { content: Array<Record<string, unknown>>; [key: string]: unknown };
    }
    return {
      ...toolResult,
      content: [],
    };
  }

  if (Array.isArray(record.content) || 'structuredContent' in record || 'isError' in record || '_meta' in record) {
    if (Array.isArray(record.content))
      return record as { content: Array<Record<string, unknown>>; [key: string]: unknown };
    return {
      ...record,
      content: [],
    };
  }

  try {
    return {
      structuredContent: record,
      content: [{ type: 'text', text: JSON.stringify(record, null, 2) }],
    };
  } catch {
    return {
      content: [{ type: 'text', text: String(record) }],
    };
  }
}

export function McpAppOutputBlock({
  app,
  toolInput,
  toolOutput,
  sendMessage,
}: {
  app: McpAppRenderData;
  toolInput?: Record<string, unknown>;
  toolOutput?: unknown;
  sendMessage?: UseChatHelpers<ChatMessage>['sendMessage'];
}) {
  const { resolvedTheme } = useTheme();
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const bridgeRef = useRef<AppBridge | null>(null);
  const sentInputRef = useRef<string | null>(null);
  const sentResultRef = useRef<string | null>(null);
  // Stable refs for callbacks and data — prevents bridge from rebuilding on every render
  const sendMessageRef = useRef(sendMessage);
  const closeFullscreenRef = useRef<() => void>(() => {});
  useEffect(() => {
    sendMessageRef.current = sendMessage;
  }, [sendMessage]);
  const [resolvedHtml, setResolvedHtml] = useState<string | null>(
    app.kind === 'iframe-html' ? (app.html ?? null) : null,
  );
  const [resourceMeta, setResourceMeta] = useState<McpUiResourceMeta | null>(null);
  // resourceMeta ref — read at call time in bridge so it doesn't re-trigger the bridge effect
  const resourceMetaRef = useRef<McpUiResourceMeta | null>(null);
  useEffect(() => {
    resourceMetaRef.current = resourceMeta;
  }, [resourceMeta]);
  const [isBridgeReady, setIsBridgeReady] = useState(false);
  const [iframeHeight, setIframeHeight] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(app.kind === 'ui-resource');
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  // isFullscreen ref — read at call time in the bridge's onsizechange handler
  // so toggling fullscreen doesn't re-trigger (and reconnect) the bridge effect
  const isFullscreenRef = useRef(false);
  useEffect(() => {
    isFullscreenRef.current = isFullscreen;
  }, [isFullscreen]);
  const [isClosingFullscreen, setIsClosingFullscreen] = useState(false);
  const buildHostContextRef = useRef<() => McpUiHostContext>(() => ({
    displayMode: 'inline',
  }));

  const closeFullscreen = useCallback(() => {
    setIsClosingFullscreen(true);
    setTimeout(() => {
      setIsFullscreen(false);
      setIsClosingFullscreen(false);
    }, 180);
  }, []);

  useEffect(() => {
    closeFullscreenRef.current = closeFullscreen;
  }, [closeFullscreen]);
  const sandboxUrl = useMemo(
    () => (app.kind === 'ui-resource' && app.resourceUri ? getSandboxUrl(app.resourceUri) : null),
    [app.kind, app.resourceUri],
  );
  const useSandbox = !!sandboxUrl;
  const buildHostContext = useCallback((): McpUiHostContext => {
    const inlineHeight = iframeHeight ? Math.max(320, iframeHeight - 2) : 420;
    const inlineWidth = iframeRef.current?.clientWidth;

    return {
      theme: resolvedTheme === 'dark' ? 'dark' : 'light',
      displayMode: isFullscreen ? 'fullscreen' : 'inline',
      availableDisplayModes: ['inline', 'fullscreen'],
      platform: 'web',
      locale: navigator.language,
      userAgent: 'zetora-web',
      containerDimensions: isFullscreen
        ? { width: window.innerWidth, height: window.innerHeight }
        : typeof inlineWidth === 'number' && inlineWidth > 0
          ? { width: inlineWidth, height: inlineHeight }
          : undefined,
      toolInfo: app.toolName
        ? {
            tool: {
              name: app.toolName,
              title: app.toolName,
              inputSchema: { type: 'object', additionalProperties: true },
            } as NonNullable<McpUiHostContext['toolInfo']>['tool'],
          }
        : undefined,
    };
  }, [app.toolName, iframeHeight, isFullscreen, resolvedTheme]);
  useEffect(() => {
    buildHostContextRef.current = buildHostContext;
  }, [buildHostContext]);

  const proxyBridgeRequest = useCallback(
    async (method: string, params: Record<string, unknown> = {}) => {
      if (!app.serverId) throw new Error('Missing MCP server metadata for app bridge');
      const response = await fetch('/api/mcp/apps/bridge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          serverId: app.serverId,
          method,
          params,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload?.cause || payload?.message || `Bridge request failed: ${method}`);
      }
      return payload?.result;
    },
    [app.serverId],
  );

  useEffect(() => {
    if (app.kind === 'iframe-html') {
      logMcpAppDebug('using-inline-html-app', {
        toolName: app.toolName,
      });
      setResolvedHtml(app.html ?? null);
      setResourceMeta(null);
      setLoadError(null);
      setIsLoading(false);
      return;
    }

    if (app.kind !== 'ui-resource' || !app.resourceUri || !app.serverId) return;

    // Check module-level cache first — avoids re-fetching on accordion reopen
    const cacheKey = `${app.serverId}:${app.resourceUri}`;
    const cached = mcpHtmlCache.get(cacheKey);
    if (cached) {
      logMcpAppDebug('resource-cache-hit', {
        serverId: app.serverId,
        resourceUri: app.resourceUri,
      });
      setResolvedHtml(cached.html);
      setResourceMeta(cached.resourceMeta);
      setIsLoading(false);
      return;
    }

    let cancelled = false;
    setIsLoading(true);
    setLoadError(null);
    setResolvedHtml(null);
    setResourceMeta(null);

    void (async () => {
      try {
        logMcpAppDebug('resource-read-start', {
          serverId: app.serverId,
          resourceUri: app.resourceUri,
        });
        const response = await fetch('/api/mcp/apps/resource/read', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            serverId: app.serverId,
            resourceUri: app.resourceUri,
          }),
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(payload?.cause || payload?.message || 'Failed to load MCP app resource');
        }
        if (cancelled) return;
        const html = typeof payload?.html === 'string' ? payload.html : null;
        const meta = (payload?.resourceMeta ?? null) as McpUiResourceMeta | null;
        logMcpAppDebug('resource-read-success', {
          serverId: app.serverId,
          resourceUri: app.resourceUri,
          htmlLength: html?.length ?? 0,
          useSandbox: !!sandboxUrl,
          sandboxUrl,
          hasCsp: !!meta?.csp,
          hasPermissions: !!meta?.permissions,
        });
        if (html) mcpHtmlCache.set(cacheKey, { html, resourceMeta: meta });
        setResolvedHtml(html);
        setResourceMeta(meta);
      } catch (error) {
        if (!cancelled) {
          logMcpAppDebug('resource-read-error', {
            serverId: app.serverId,
            resourceUri: app.resourceUri,
            error: error instanceof Error ? error.message : String(error),
          });
          setLoadError(error instanceof Error ? error.message : 'Failed to load MCP app resource');
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [app.kind, app.resourceUri, app.serverId, app.html, app.toolName, sandboxUrl]);

  useEffect(() => {
    if (app.kind !== 'ui-resource' || !app.serverId) return;
    // Sandbox mode: wait for iframe to load the proxy page (no resolvedHtml needed)
    // srcDoc mode: need resolvedHtml
    if (!useSandbox && !resolvedHtml) return;
    const iframe = iframeRef.current;
    const targetWindow = iframe?.contentWindow;
    if (!iframe || !targetWindow) return;

    let cancelled = false;
    logMcpAppDebug('bridge-effect-start', {
      toolName: app.toolName,
      serverId: app.serverId,
      resourceUri: app.resourceUri,
      useSandbox,
      sandboxUrl,
      hasResolvedHtml: !!resolvedHtml,
    });
    setIsBridgeReady(false);
    sentInputRef.current = null;
    sentResultRef.current = null;

    const bridge = new AppBridge(
      null,
      { name: 'Zetora', version: '1.0.0' },
      {
        openLinks: {},
        downloadFile: {},
        serverTools: {},
        serverResources: {},
        updateModelContext: { text: {}, structuredContent: {} },
        message: { text: {}, structuredContent: {} },
        logging: {},
        ...(resourceMetaRef.current
          ? {
              sandbox: {
                csp: resourceMetaRef.current.csp,
                permissions: resourceMetaRef.current.permissions,
              },
            }
          : {}),
      },
      {
        hostContext: buildHostContextRef.current(),
      },
    );

    bridge.oninitialized = () => {
      logMcpAppDebug('bridge-initialized', {
        toolName: app.toolName,
        useSandbox,
      });
      if (!cancelled) setIsBridgeReady(true);
    };

    bridge.onsizechange = ({ width: _w, height }) => {
      logMcpAppDebug('bridge-size-change', {
        toolName: app.toolName,
        height,
        isFullscreen: isFullscreenRef.current,
      });
      if (cancelled || !Number.isFinite(height) || !height) return;
      // Ignore size updates while fullscreen — the app reports viewport height
      // which would corrupt the inline height on close
      setIframeHeight((prev) => {
        if (isFullscreenRef.current) return prev;
        return Math.max(450, Number(height));
      });
    };

    bridge.onopenlink = async ({ url }) => {
      try {
        window.open(url, '_blank', 'noopener,noreferrer');
        return {};
      } catch {
        return { isError: true };
      }
    };

    bridge.onmessage = async ({ role, content }) => {
      const sm = sendMessageRef.current;
      if (role !== 'user' || !sm || !Array.isArray(content)) return {};
      const text = content
        .filter(
          (part) =>
            part && typeof part === 'object' && (part as any).type === 'text' && typeof (part as any).text === 'string',
        )
        .map((part) => (part as any).text as string)
        .join('\n')
        .trim();
      if (!text) return {};
      sm({ text });
      return {};
    };

    bridge.ondownloadfile = async ({ contents }) => {
      try {
        const item = contents?.[0] as any;
        if (!item) return { isError: true };

        const resource = item?.resource ?? item;
        const filename = typeof resource?.name === 'string' ? resource.name : 'mcp-app-download';
        const mimeType = typeof resource?.mimeType === 'string' ? resource.mimeType : 'application/octet-stream';
        const hrefData =
          typeof resource?.text === 'string'
            ? `data:${mimeType};charset=utf-8,${encodeURIComponent(resource.text)}`
            : typeof resource?.blob === 'string'
              ? `data:${mimeType};base64,${resource.blob}`
              : null;

        if (!hrefData) return { isError: true };
        const anchor = document.createElement('a');
        anchor.href = hrefData;
        anchor.download = filename;
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
        return {};
      } catch {
        return { isError: true };
      }
    };

    bridge.onupdatemodelcontext = async () => ({});
    bridge.onrequestdisplaymode = async ({ mode }) => {
      if (mode === 'fullscreen') setIsFullscreen(true);
      else if (mode === 'inline') closeFullscreenRef.current();
      return { mode: mode ?? 'inline' };
    };
    bridge.oncalltool = async (params) => proxyBridgeRequest('tools/call', params as Record<string, unknown>);
    bridge.onlistresources = async (params) => proxyBridgeRequest('resources/list', params as Record<string, unknown>);
    bridge.onreadresource = async (params) => proxyBridgeRequest('resources/read', params as Record<string, unknown>);
    bridge.onlistresourcetemplates = async (params) =>
      proxyBridgeRequest('resources/templates/list', params as Record<string, unknown>);
    bridge.onlistprompts = async (params) => proxyBridgeRequest('prompts/list', params as Record<string, unknown>);

    bridgeRef.current = bridge;

    if (useSandbox) {
      // Sandbox proxy mode: wait for proxy-ready, send HTML, then connect bridge
      bridge.onsandboxready = () => {
        logMcpAppDebug('sandbox-proxy-ready', {
          toolName: app.toolName,
          sandboxUrl,
          hasResolvedHtml: !!resolvedHtml,
        });
        if (cancelled || !resolvedHtml) return;
        logMcpAppDebug('sandbox-resource-ready-send', {
          toolName: app.toolName,
          sandboxUrl,
          htmlLength: resolvedHtml.length,
          hasCsp: !!resourceMetaRef.current?.csp,
          hasPermissions: !!resourceMetaRef.current?.permissions,
        });
        void bridge
          .sendSandboxResourceReady({
            html: resolvedHtml,
            sandbox: 'allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox allow-downloads',
            csp: resourceMetaRef.current?.csp,
            permissions: resourceMetaRef.current?.permissions,
          })
          .then(() => {
            logMcpAppDebug('sandbox-resource-ready-sent', {
              toolName: app.toolName,
              sandboxUrl,
            });
          })
          .catch((error) => {
            logMcpAppDebug('sandbox-resource-ready-error', {
              toolName: app.toolName,
              sandboxUrl,
              error: error instanceof Error ? error.message : String(error),
            });
          });
      };

      void (async () => {
        try {
          logMcpAppDebug('bridge-connect-start', {
            toolName: app.toolName,
            mode: 'sandbox',
            sandboxUrl,
          });
          const transport = new PostMessageTransport(targetWindow, targetWindow);
          await bridge.connect(transport);
          logMcpAppDebug('bridge-connect-success', {
            toolName: app.toolName,
            mode: 'sandbox',
            sandboxUrl,
          });
        } catch (error) {
          if (!cancelled) {
            logMcpAppDebug('bridge-connect-error', {
              toolName: app.toolName,
              mode: 'sandbox',
              sandboxUrl,
              error: error instanceof Error ? error.message : String(error),
            });
            setLoadError(error instanceof Error ? error.message : 'Failed to initialize MCP App bridge');
          }
        }
      })();
    } else {
      // srcDoc fallback: connect directly
      void (async () => {
        try {
          logMcpAppDebug('bridge-connect-start', {
            toolName: app.toolName,
            mode: 'srcdoc',
          });
          const transport = new PostMessageTransport(targetWindow, targetWindow);
          await bridge.connect(transport);
          logMcpAppDebug('bridge-connect-success', {
            toolName: app.toolName,
            mode: 'srcdoc',
          });
        } catch (error) {
          if (!cancelled) {
            logMcpAppDebug('bridge-connect-error', {
              toolName: app.toolName,
              mode: 'srcdoc',
              error: error instanceof Error ? error.message : String(error),
            });
            setLoadError(error instanceof Error ? error.message : 'Failed to initialize MCP App bridge');
          }
        }
      })();
    }

    return () => {
      cancelled = true;
      logMcpAppDebug('bridge-effect-cleanup', {
        toolName: app.toolName,
        useSandbox,
      });
      setIsBridgeReady(false);
      const currentBridge = bridgeRef.current;
      bridgeRef.current = null;
      if (currentBridge) {
        void currentBridge.teardownResource({}).catch(() => {});
        void (currentBridge as any).close?.();
      }
    };
  }, [app.kind, app.serverId, app.toolName, app.resourceUri, resolvedHtml, useSandbox, sandboxUrl, proxyBridgeRequest]);

  // Keep the app in sync when the host theme or display mode changes
  useEffect(() => {
    if (!isBridgeReady || !bridgeRef.current) return;
    const syncHostContext = () => bridgeRef.current?.setHostContext(buildHostContext());
    syncHostContext();
    window.addEventListener('resize', syncHostContext);
    return () => window.removeEventListener('resize', syncHostContext);
  }, [buildHostContext, isBridgeReady]);

  useEffect(() => {
    if (!isBridgeReady || !bridgeRef.current) return;
    const serializedInput = JSON.stringify(toolInput ?? {});
    if (sentInputRef.current === serializedInput) return;
    sentInputRef.current = serializedInput;
    void bridgeRef.current
      .sendToolInput({
        arguments: (toolInput ?? {}) as Record<string, unknown>,
      })
      .catch(() => {});
  }, [isBridgeReady, toolInput]);

  useEffect(() => {
    if (!isBridgeReady || !bridgeRef.current) return;
    const resultPayload = normalizeMcpAppToolResult(toolOutput);
    if (!resultPayload) return;

    const serializedResult = JSON.stringify(resultPayload);
    if (sentResultRef.current === serializedResult) return;
    sentResultRef.current = serializedResult;

    void bridgeRef.current.sendToolResult(resultPayload as any).catch(() => {});
  }, [isBridgeReady, toolOutput]);

  if (isLoading) {
    return (
      <div className="px-3.5 py-2.5">
        <div className="rounded-lg border border-border/60 bg-muted/20 px-3 py-3 text-[11px] text-muted-foreground flex items-center gap-2">
          <Loader2 className="size-3 animate-spin" />
          Loading app UI…
        </div>
      </div>
    );
  }

  if (resolvedHtml || (useSandbox && sandboxUrl)) {
    const permissionAllow = buildAllowAttribute(resourceMeta?.permissions);
    const resolvedHeight = iframeHeight ? iframeHeight - 2 : 420;

    const iframeProps: Record<string, unknown> =
      useSandbox && sandboxUrl ? { src: sandboxUrl } : { srcDoc: resolvedHtml! };

    if (!useSandbox) {
      iframeProps.sandbox = 'allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox allow-downloads';
    }

    return (
      <div
        className={cn(
          'bg-background relative group',
          isFullscreen
            ? isClosingFullscreen
              ? 'fixed inset-0 z-50 flex flex-col overflow-hidden animate-out fade-out zoom-out-95 duration-180'
              : 'fixed inset-0 z-50 flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200'
            : 'w-full overflow-hidden',
        )}
      >
        {/* Fullscreen close button */}
        {isFullscreen && (
          <button
            type="button"
            onClick={closeFullscreen}
            className="absolute top-4 right-4 z-30 flex items-center gap-2 px-3 py-2 rounded-full bg-foreground text-background text-xs font-medium shadow-lg hover:opacity-90 transition-opacity animate-in fade-in slide-in-from-top-2 duration-300 delay-100"
            title="Exit fullscreen"
          >
            <X className="size-3.5" />
            Close
          </button>
        )}

        <iframe
          ref={iframeRef}
          title={app.toolName ? `${app.toolName} app` : 'MCP App'}
          allow={permissionAllow || undefined}
          onLoad={() => {
            logMcpAppDebug('iframe-load', {
              toolName: app.toolName,
              useSandbox,
              sandboxUrl,
            });
          }}
          className="block w-full border-0"
          style={
            isFullscreen
              ? { height: '100%', flex: '1 1 0%', minHeight: 0 }
              : { height: `${resolvedHeight}px`, transition: 'height 150ms' }
          }
          {...iframeProps}
        />

        {/* Expand button — inline only */}
        {!isFullscreen && (
          <button
            type="button"
            onClick={() => setIsFullscreen(true)}
            className="absolute top-2 right-2 z-20 p-1.5 rounded-lg bg-background/80 border border-border/60 text-muted-foreground hover:text-foreground hover:bg-background opacity-0 group-hover:opacity-100 transition-all shadow-sm"
            title="Open fullscreen"
          >
            <svg
              className="size-3.5"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3" />
            </svg>
          </button>
        )}
      </div>
    );
  }

  if (app.kind === 'iframe-url' && app.url) {
    return (
      <div className="px-3.5 py-2.5 space-y-2">
        <div className="rounded-lg border border-border/60 overflow-hidden bg-background">
          <iframe
            title="MCP App"
            src={app.url}
            sandbox="allow-scripts allow-forms allow-popups allow-same-origin allow-downloads"
            referrerPolicy="no-referrer"
            className="w-full h-[420px] border-0"
          />
        </div>
        <a
          href={app.url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
        >
          Open app in new tab
          <ArrowRightIcon className="size-3" />
        </a>
      </div>
    );
  }

  return (
    <div className="px-3.5 py-2.5">
      <div className="rounded-lg border border-border/60 bg-muted/20 px-3 py-2.5 text-[11px] text-muted-foreground space-y-1.5">
        <p className="text-foreground/90 font-medium">MCP App detected</p>
        {loadError ? (
          <p>Failed to load MCP App resource: {loadError}</p>
        ) : (
          <p>Server returned a UI resource reference. Missing server metadata prevented loading.</p>
        )}
        {app.serverName && <p className="text-[10px] text-muted-foreground/80">Server: {app.serverName}</p>}
        {app.resourceUri && (
          <code className="block text-[10px] text-muted-foreground/80 break-all">{app.resourceUri}</code>
        )}
      </div>
    </div>
  );
}

export const McpApprovalCard = ({
  approval,
  toolLabel,
  sendMessage,
  onStatusChange,
}: {
  approval: McpApprovalData;
  toolLabel: string;
  sendMessage?: UseChatHelpers<ChatMessage>['sendMessage'];
  onStatusChange?: (status: 'confirmed' | 'cancelled') => void;
}) => {
  const [sent, setSent] = useState(false);
  const [cancelled, setCancelled] = useState(false);
  const previewEntries = approval.preview ? Object.entries(approval.preview) : [];

  const handleConfirm = () => {
    if (!sendMessage || sent || cancelled) return;
    setSent(true);
    onStatusChange?.('confirmed');
    sendMessage({ text: `Approved. Please proceed — approvalToken: ${approval.approvalToken}` });
  };

  const handleCancel = () => {
    if (!sendMessage || sent || cancelled) return;
    setCancelled(true);
    onStatusChange?.('cancelled');
    sendMessage({ text: 'Cancel — do not proceed with this action.' });
  };

  const isDone = sent || cancelled;

  return (
    <div className="px-3.5 py-3 space-y-3">
      {/* Preview fields */}
      {previewEntries.length > 0 && (
        <div className="rounded-lg border border-border/50 bg-muted/30 overflow-hidden">
          <div className="px-3 py-2 border-b border-border/40 flex items-center gap-2">
            <div className="size-1.5 rounded-full bg-amber-500" />
            <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Preview</span>
          </div>
          <div className="divide-y divide-border/30">
            {previewEntries.map(([key, val]) => (
              <div key={key} className="px-3 py-1.5 flex gap-3 items-start">
                <span className="text-[11px] text-muted-foreground/60 capitalize w-20 shrink-0 pt-px">{key}</span>
                <span className="text-[11px] text-foreground/80 break-all">{val}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Expiry */}
      {approval.expiresInMinutes && (
        <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground/60">
          <Clock className="size-3" />
          Expires in {approval.expiresInMinutes} min
        </div>
      )}

      {/* Action buttons */}
      {isDone ? (
        <div
          className={cn(
            'rounded-lg px-3 py-2 text-[11px] font-medium',
            sent
              ? 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-700 dark:text-emerald-400'
              : 'bg-muted/50 border border-border/50 text-muted-foreground',
          )}
        >
          {sent ? '✓ Confirmed — action sent' : '✕ Cancelled'}
        </div>
      ) : (
        <div className="flex gap-2">
          <button
            type="button"
            onClick={handleConfirm}
            className="flex-1 flex items-center justify-center gap-1.5 rounded-lg bg-foreground text-background text-[12px] font-medium px-3 py-2 hover:opacity-90 transition-opacity"
          >
            <Check className="size-3.5" />
            Confirm & Send
          </button>
          <button
            type="button"
            onClick={handleCancel}
            className="flex items-center justify-center gap-1.5 rounded-lg border border-border/60 bg-muted/30 text-muted-foreground text-[12px] font-medium px-3 py-2 hover:bg-muted/60 transition-colors"
          >
            <X className="size-3.5" />
            Cancel
          </button>
        </div>
      )}
    </div>
  );
};

export interface InlineElicitationData {
  elicitationId: string;
  serverName: string;
  message: string;
  mode: 'form' | 'url';
  requestedSchema?: unknown;
  url?: string;
}

interface InlineSchemaProperty {
  type?: string;
  title?: string;
  description?: string;
  default?: unknown;
  enum?: string[];
  oneOf?: Array<{ const: string; title: string }>;
  format?: string;
}

interface InlineRequestedSchema {
  type?: string;
  properties?: Record<string, InlineSchemaProperty>;
  required?: string[];
}

function parseInlineSchema(raw: unknown): InlineRequestedSchema {
  if (!raw || typeof raw !== 'object') return {};
  return raw as InlineRequestedSchema;
}

function getInlineDefaultValue(prop: InlineSchemaProperty): unknown {
  if (prop.default !== undefined) return prop.default;
  if (prop.type === 'boolean') return false;
  if (prop.type === 'number' || prop.type === 'integer') return undefined;
  return '';
}

function buildInlineElicitationContent(
  values: Record<string, unknown>,
  properties: Record<string, InlineSchemaProperty>,
) {
  const content: Record<string, unknown> = {};

  for (const [name, prop] of Object.entries(properties)) {
    const raw = values[name];
    if (raw === undefined || raw === null || raw === '') continue;

    if (prop.type === 'boolean') {
      content[name] = Boolean(raw);
      continue;
    }
    if (prop.type === 'number' || prop.type === 'integer') {
      const numeric = typeof raw === 'number' ? raw : Number(raw);
      if (!Number.isFinite(numeric)) continue;
      content[name] = prop.type === 'integer' ? Math.trunc(numeric) : numeric;
      continue;
    }
    content[name] = String(raw);
  }

  return content;
}

export function getPendingInlineElicitations(
  dataStream: DataUIPart<CustomUIDataTypes>[],
  ignoredIds: Set<string>,
): InlineElicitationData[] {
  const doneIds = new Set<string>();
  const seenIds = new Set<string>();
  const pending: InlineElicitationData[] = [];

  // First pass: collect all done IDs
  for (const part of dataStream) {
    if (part?.type === 'data-mcp_elicitation_done') {
      const doneId = part.data?.elicitationId;
      if (doneId) doneIds.add(doneId);
    }
  }

  // Second pass: collect unique pending elicitations in order
  for (const part of dataStream) {
    if (part?.type !== 'data-mcp_elicitation') continue;
    const elicitation = part.data as InlineElicitationData;
    if (!elicitation?.elicitationId) continue;
    if (ignoredIds.has(elicitation.elicitationId)) continue;
    if (doneIds.has(elicitation.elicitationId)) continue;
    if (seenIds.has(elicitation.elicitationId)) continue;
    seenIds.add(elicitation.elicitationId);
    pending.push(elicitation);
  }

  return pending;
}

export function McpInlineElicitationCard({
  elicitation,
  onResolved,
}: {
  elicitation: InlineElicitationData;
  onResolved: (elicitationId: string) => void;
}) {
  const [submitting, setSubmitting] = useState<'accept' | 'decline' | 'cancel' | null>(null);
  const schema = useMemo(() => parseInlineSchema(elicitation.requestedSchema), [elicitation.requestedSchema]);
  const properties = useMemo(() => schema.properties ?? {}, [schema]);
  const requiredFields = schema.required ?? [];
  const hasFields = elicitation.mode === 'form' && Object.keys(properties).length > 0;

  const computeDefaultValues = () =>
    Object.fromEntries(Object.entries(properties).map(([k, p]) => [k, getInlineDefaultValue(p)]));
  const [values, setValues] = useState<Record<string, unknown>>(computeDefaultValues);

  // Reset the form when a new elicitation (or schema) arrives — render-phase
  // adjustment instead of an effect, so no stale-values frame is committed.
  const [prevElicitation, setPrevElicitation] = useState({ id: elicitation.elicitationId, properties });
  if (prevElicitation.id !== elicitation.elicitationId || prevElicitation.properties !== properties) {
    setPrevElicitation({ id: elicitation.elicitationId, properties });
    setValues(computeDefaultValues());
  }

  const respond = async (action: 'accept' | 'decline' | 'cancel') => {
    if (submitting) return;
    setSubmitting(action);
    try {
      if (action === 'accept' && elicitation.mode === 'url' && elicitation.url) {
        window.open(elicitation.url, '_blank', 'noopener,noreferrer');
      }
      const content =
        action === 'accept' && elicitation.mode === 'form'
          ? buildInlineElicitationContent(values, properties)
          : undefined;
      const response = await fetch('/api/mcp/elicitation/respond', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          elicitationId: elicitation.elicitationId,
          action,
          content,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        const message = payload?.error || payload?.message || 'Could not submit approval response.';
        // Server-side resolver already gone (timed out / already handled). Remove stale inline card.
        if (response.status === 404 && /not found|already resolved/i.test(String(message))) {
          onResolved(elicitation.elicitationId);
          return;
        }
        throw new Error(message);
      }
      onResolved(elicitation.elicitationId);
    } catch (error) {
      sileo.error({
        title: 'Action failed',
        description: error instanceof Error ? error.message : 'Could not submit approval response.',
      });
    } finally {
      setSubmitting(null);
    }
  };

  return (
    <div className="space-y-2.5 pt-0.5">
      <p className="text-[12px] text-foreground/80 leading-relaxed text-pretty">{elicitation.message}</p>

      {hasFields && (
        <div className="space-y-2.5">
          {Object.entries(properties).map(([name, prop]) => {
            const label = prop.title || name;
            const value = values[name];
            const isEnum = Array.isArray(prop.enum) && prop.enum.length > 0;
            const isOneOf = Array.isArray(prop.oneOf) && prop.oneOf.length > 0;

            if (prop.type === 'boolean') {
              return (
                <div
                  key={name}
                  className="flex items-center justify-between gap-3 rounded-lg border border-border/50 bg-muted/20 px-3 py-2.5"
                >
                  <div className="min-w-0">
                    <p className="text-[12px] font-medium text-foreground/90 leading-snug">
                      {label}
                      {requiredFields.includes(name) ? <span className="text-destructive ml-1">*</span> : null}
                    </p>
                    {prop.description ? (
                      <p className="text-[11px] text-muted-foreground text-pretty mt-0.5">{prop.description}</p>
                    ) : null}
                  </div>
                  <Switch
                    checked={Boolean(value ?? false)}
                    onCheckedChange={(checked) => setValues((prev) => ({ ...prev, [name]: checked }))}
                  />
                </div>
              );
            }

            if (isEnum || isOneOf) {
              const options = isEnum
                ? prop.enum!.map((opt) => ({ value: opt, label: opt }))
                : prop.oneOf!.map((opt) => ({ value: opt.const, label: opt.title }));
              return (
                <div key={name} className="space-y-1.5">
                  <p className="text-[11px] text-muted-foreground">
                    {label}
                    {requiredFields.includes(name) ? <span className="text-destructive ml-1">*</span> : null}
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {options.map((opt) => (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => setValues((prev) => ({ ...prev, [name]: opt.value }))}
                        className={cn(
                          'px-2.5 py-1 rounded-md text-[11px] border transition-colors',
                          value === opt.value
                            ? 'bg-foreground text-background border-foreground'
                            : 'bg-background/60 text-muted-foreground border-border/60 hover:border-foreground/30',
                        )}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>
              );
            }

            const inputType =
              prop.type === 'number' || prop.type === 'integer'
                ? 'number'
                : prop.format === 'email'
                  ? 'email'
                  : prop.format === 'uri'
                    ? 'url'
                    : 'text';

            return (
              <div key={name} className="space-y-1.5">
                <p className="text-[11px] text-muted-foreground">
                  {label}
                  {requiredFields.includes(name) ? <span className="text-destructive ml-1">*</span> : null}
                </p>
                {prop.description ? (
                  <p className="text-[11px] text-muted-foreground/60 text-pretty">{prop.description}</p>
                ) : null}
                <Input
                  type={inputType}
                  className="h-7 text-[12px] bg-background/60"
                  value={String(value ?? '')}
                  onChange={(e) => setValues((prev) => ({ ...prev, [name]: e.target.value }))}
                />
              </div>
            );
          })}
        </div>
      )}

      {elicitation.mode === 'url' && elicitation.url && (
        <p className="text-[11px] text-muted-foreground/70 break-all font-mono">{elicitation.url}</p>
      )}

      <div className="flex items-center gap-1.5 pt-0.5">
        <Button
          size="sm"
          className="h-7 px-3 text-[11px] rounded-lg"
          disabled={Boolean(submitting)}
          onClick={() => respond('accept')}
        >
          {submitting === 'accept' ? <Loader2 className="size-3 animate-spin" /> : <Check className="size-3" />}
          {elicitation.mode === 'url' ? 'Open' : hasFields ? 'Submit' : 'Approve'}
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="h-7 px-3 text-[11px] rounded-lg"
          disabled={Boolean(submitting)}
          onClick={() => respond('decline')}
        >
          {submitting === 'decline' ? <Loader2 className="size-3 animate-spin" /> : null}
          Decline
        </Button>
        <button
          type="button"
          disabled={Boolean(submitting)}
          onClick={() => respond('cancel')}
          className="text-[11px] text-muted-foreground/60 hover:text-muted-foreground transition-colors disabled:opacity-40 px-1"
        >
          {submitting === 'cancel' ? <Loader2 className="size-3 animate-spin inline mr-1" /> : null}
          Cancel
        </button>
      </div>
    </div>
  );
}
