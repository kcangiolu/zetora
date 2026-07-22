import 'server-only';
import type { UIMessageStreamWriter } from 'ai';
import type { ChatMessage } from '@/lib/types';

// Server-side registry an extension (see lib/extensions.ts, AGENT.md §2.3 if
// you have the private overlay checked out) populates via register() to add
// an exclusive special mode without the core knowing anything about who
// registered it or why. Populated once at boot (loadExtensions() runs from
// instrumentation.ts before any request is served), read from
// group-config.ts, provider-options.ts, and prepare-step.ts.
export interface ExtensionModeServerConfig {
  id: string;
  instructions: string;
  tools: readonly string[];
  // Optional per-request hook: a mode may contribute tools resolved
  // dynamically (e.g. connections to remote tool servers) beyond its static
  // `tools` list above. Called once after auth in app/api/search/route.ts;
  // returned toolNames are armed like any other active tool, and closeAll()
  // is chained into the request's existing MCP cleanup path. The core has no
  // idea what these tools are or where they come from.
  resolveDynamicTools?: (ctx: {
    userId: string;
    dataStream: UIMessageStreamWriter<ChatMessage>;
  }) => Promise<{ tools: Record<string, unknown>; toolNames: string[]; closeAll: () => Promise<void> }>;
  // Hard step bound for this mode's streamText loop — defaults applied by
  // the caller (getStreamTextStaticSettings) when unset.
  stepCount?: number;
  // Keep activeTools armed across every step instead of draining to []
  // after the first tool round — for modes that need multiple research
  // rounds rather than one-tool-call-then-synthesize (mirrors the 'auto'
  // and 'mcp' branches in prepare-step.ts).
  keepToolsArmed?: boolean;
  // Defaults to true: mirrors every pre-existing exclusive special mode
  // (memory/connectors/mcp/multi-agent/canvas), all of which silently fall
  // back to the base config for signed-out users. Set false to opt out.
  requireAuth?: boolean;
  // Overrides the zetora-memory-provider preference for this mode's turn.
  memoryProvider?: 'graphiti' | 'supermemory';
}

const registry = new Map<string, ExtensionModeServerConfig>();

export function registerExtensionMode(config: ExtensionModeServerConfig): void {
  registry.set(config.id, config);
}

// instrumentation.ts's register() hook and this module are not guaranteed to
// share the same module-scope singleton under Next.js production bundling
// (instrumentation is compiled as a separate entry point) — registrations
// made there can be invisible here. Rather than rely on that boot-time call
// alone, every reader lazily self-heals by loading extensions itself, once,
// on first use. This must stay a lazy call INSIDE the function body (i.e. at
// request time) and never a top-level await: a top-level await here runs
// during this module's own evaluation, and if anything in the extension's
// import graph re-enters this module via dynamic import() while that
// evaluation is still in flight, the chunk loader deadlocks waiting for a
// factory that can't finish (see git history — caused a full outage once).
let extensionsLoadPromise: Promise<void> | null = null;

function ensureExtensionsLoaded(): Promise<void> {
  if (process.env.EXTENSIONS_ENABLED !== 'true' || process.env.NEXT_PHASE === 'phase-production-build') {
    return Promise.resolve();
  }
  if (!extensionsLoadPromise) {
    extensionsLoadPromise = import('@/lib/extensions').then(({ loadExtensions }) => loadExtensions());
  }
  return extensionsLoadPromise;
}

export async function getExtensionMode(id: string | undefined): Promise<ExtensionModeServerConfig | undefined> {
  await ensureExtensionsLoaded();
  return id ? registry.get(id) : undefined;
}

export async function getExtensionModeIds(): Promise<string[]> {
  await ensureExtensionsLoaded();
  return [...registry.keys()];
}
