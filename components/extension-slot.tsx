'use client';

import { useSyncExternalStore, type ComponentType } from 'react';
import { loadClientExtensions } from '@/lib/extension-modes-client';

// Client-side counterpart to lib/extensions.ts: a private overlay (see
// AGENT.md §2.3) registers components here by name via registerClient() in
// @extensions/register-client, and <ExtensionSlot name="..." /> renders
// whatever is registered for that name — nothing, when no overlay is
// checked out. loadClientExtensions (the one-time
// @extensions/register-client import) lives in lib/extension-modes-client.ts
// so the mode selector can trigger it too, whichever mounts first.
//
// Stored on globalThis rather than a plain module-scope const: this module
// is reachable both statically (app/layout.tsx's <ExtensionSlot />) and
// dynamically (register-client.ts's `await import(...)`), and Turbopack can
// resolve those two call sites to genuinely separate module instances —
// registerSlotComponent would then write into a Map ExtensionSlot never
// reads from. globalThis is the one thing guaranteed shared across module
// instances in the same browser tab (see lib/search/extension-modes.ts for
// the server-side counterpart of this exact problem).
declare global {
  var __zetoraSlotComponents: Map<string, ComponentType<Record<string, unknown>>> | undefined;
  var __zetoraSlotListeners: Set<() => void> | undefined;
}
const slotComponents = (globalThis.__zetoraSlotComponents ??= new Map());
const listeners = (globalThis.__zetoraSlotListeners ??= new Set());

export function registerSlotComponent(name: string, component: ComponentType<Record<string, unknown>>): void {
  slotComponents.set(name, component);
  listeners.forEach((listener) => listener());
}

// useSyncExternalStore, not useState+manual-listener: slotComponents is an
// external mutable store (a plain Map mutated outside React's render cycle
// by registerSlotComponent) — with the React Compiler enabled project-wide
// (next.config.ts), a plain `slotComponents.get(name)` read at render time
// gets treated as a pure derivation of `name` and memoized across renders,
// so it never picks up the Map's mutation once registerSlotComponent runs
// after the initial render. useSyncExternalStore is the API React provides
// specifically for reads like this — the compiler special-cases it and
// re-subscribes/re-reads correctly instead of memoizing the snapshot away.
function subscribe(onStoreChange: () => void): () => void {
  loadClientExtensions();
  listeners.add(onStoreChange);
  return () => listeners.delete(onStoreChange);
}

export function ExtensionSlot({ name, ...props }: { name: string } & Record<string, unknown>) {
  const Component = useSyncExternalStore(
    subscribe,
    () => slotComponents.get(name),
    () => undefined,
  );
  if (!Component) return null;
  return <Component {...props} />;
}
