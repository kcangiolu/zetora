'use client';

import { useSyncExternalStore, type ComponentType } from 'react';
import { loadClientExtensions } from '@/lib/extension-modes-client';
import type { UseChatHelpers } from '@ai-sdk/react';
import type { ChatMessage } from '@/lib/types';

// Registry for rendering a specific dynamic-tool part inline in the chat
// timeline instead of the generic MCP tool-call card — e.g. the private
// agent overlay's propose_plan/ask_user tools rendering as an inline
// proposal/question card (AGENT.md, C1/C2) rather than a raw tool-call
// chip. Deliberately keyed by tool NAME (not by mode or origin): the core
// has no idea what these tools are, only that a renderer may exist for one.
//
// Same globalThis + useSyncExternalStore pattern as components/extension-slot.tsx
// for the identical reason: this module is reachable both statically
// (components/message-parts/index.tsx) and dynamically (register-client.ts's
// `await import(...)`), and Turbopack can resolve those to separate module
// instances — a plain module-scope Map would split the registry in two.
declare global {
  var __zetoraDynamicToolRenderers: Map<string, ComponentType<DynamicToolRendererProps>> | undefined;
  var __zetoraDynamicToolListeners: Set<() => void> | undefined;
}

export interface DynamicToolRendererProps {
  part: { type: 'dynamic-tool'; toolName: string; toolCallId: string; state: string } & Record<string, unknown>;
  sendMessage?: UseChatHelpers<ChatMessage>['sendMessage'];
}

const renderers = (globalThis.__zetoraDynamicToolRenderers ??= new Map());
const listeners = (globalThis.__zetoraDynamicToolListeners ??= new Set());

export function registerDynamicToolRenderer(toolName: string, component: ComponentType<DynamicToolRendererProps>): void {
  renderers.set(toolName, component);
  listeners.forEach((listener) => listener());
}

function subscribe(onStoreChange: () => void): () => void {
  loadClientExtensions();
  listeners.add(onStoreChange);
  return () => listeners.delete(onStoreChange);
}

// toolName === '' (e.g. called for a non-dynamic-tool part) always misses —
// used to keep this hook call unconditional at the top of MessagePartRenderer
// (rules of hooks: several part types return early before the dynamic-tool
// branch that actually needs this value).
export function useDynamicToolRenderer(toolName: string): ComponentType<DynamicToolRendererProps> | undefined {
  return useSyncExternalStore(
    subscribe,
    () => renderers.get(toolName),
    () => undefined,
  );
}

// Plain (non-hook) read for the message-parts grouping scans, which check
// arbitrary OTHER parts' tool names while rendering a given part rather than
// their own — those scans can't call a hook per candidate. Safe to read
// directly outside the subscription: any component with a live
// useDynamicToolRenderer() subscription re-renders on every registration
// change (registerDynamicToolRenderer notifies all listeners, not just ones
// watching the newly-registered name), so a stale read here only survives
// until the next render.
export function hasDynamicToolRenderer(toolName: string): boolean {
  return renderers.has(toolName);
}
