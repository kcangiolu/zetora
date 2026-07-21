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
  requirePro?: boolean;
  // Overrides the zetora-memory-provider preference for this mode's turn.
  memoryProvider?: 'graphiti' | 'supermemory';
}

const registry = new Map<string, ExtensionModeServerConfig>();

export function registerExtensionMode(config: ExtensionModeServerConfig): void {
  registry.set(config.id, config);
}

export function getExtensionMode(id: string | undefined): ExtensionModeServerConfig | undefined {
  return id ? registry.get(id) : undefined;
}

export function getExtensionModeIds(): string[] {
  return [...registry.keys()];
}

// instrumentation.ts's register() call populates *a* copy of this module's
// registry at boot — but Next.js/Turbopack doesn't guarantee route handlers
// (app/api/**/route.ts) share that exact module instance with
// instrumentation.ts's own module graph, so a registration made there can be
// invisible here (observed in production: registerExtensionMode('agent')
// ran successfully — its BullMQ job-scheduler side effects exist in Redis —
// yet getExtensionModeIds() read from app/api/search/route.ts came back
// empty). Top-level await self-heals per module instance: whichever copy of
// this file a given entry point ends up with loads extensions itself before
// any importer can call the functions above, since ES module evaluation
// (including its own top-level awaits) always completes before dependents
// can run. lib/extensions.ts's own `loaded` guard keeps this idempotent
// within a single instance; harmless if it also runs redundantly in others.
//
// Skipped during `next build`'s static phase (NEXT_PHASE, set by Next.js
// itself): register() can reach into BullMQ/Redis (agent/register.ts),
// infrastructure that isn't and shouldn't be available at build time —
// running it there hung the build. Runtime is the only phase this needs to
// self-heal for anyway.
if (process.env.EXTENSIONS_ENABLED === 'true' && process.env.NEXT_PHASE !== 'phase-production-build') {
  const { loadExtensions } = await import('@/lib/extensions');
  await loadExtensions();
}
