'use client';

import type { SearchGroup } from '@/lib/utils';

// Client-side counterpart to lib/search/extension-modes.ts: an extension
// registers a selectable chat mode's UI descriptor here via registerClient()
// in @extensions/register-client, and consumers (the mode selector in
// components/ui/form-component/index.tsx, components/mode-accent.tsx) render
// whatever is registered — nothing, when no overlay is checked out.
export interface ExtensionModeUIDescriptor {
  id: string;
  name: string;
  description: string;
  icon: SearchGroup['icon'];
  requireAuth?: boolean;
  // Palette for the generic "mode accent" animation (app/globals.css,
  // components/mode-accent.tsx) — inert if omitted.
  accent?: { palette: string[] };
}

// Stored on globalThis rather than plain module-scope state: this module is
// reachable both statically (the mode selector, components/mode-accent.tsx)
// and dynamically (register-client.ts's `await import(...)` back into this
// same file), and Turbopack can resolve those call sites to genuinely
// separate module instances — a write from one instance would then be
// invisible to reads from another, and `extensionsLoaded` could be false in
// more than one instance, running the whole registerClient() import
// redundantly. globalThis is the one thing guaranteed shared across module
// instances in the same browser tab (see components/extension-slot.tsx,
// which hit this exact bug in practice, and lib/search/extension-modes.ts
// for the server-side counterpart).
declare global {
  var __zetoraModeUIs: Map<string, ExtensionModeUIDescriptor> | undefined;
  var __zetoraModeUIListeners: Set<() => void> | undefined;
  var __zetoraExtensionsLoaded: boolean | undefined;
  var __zetoraRequestSettingsProvider: (() => unknown) | undefined;
}
const modeUIs = (globalThis.__zetoraModeUIs ??= new Map());
const listeners = (globalThis.__zetoraModeUIListeners ??= new Set());

export function registerExtensionModeUI(descriptor: ExtensionModeUIDescriptor): void {
  modeUIs.set(descriptor.id, descriptor);
  listeners.forEach((listener) => listener());
}

export function getExtensionModeUIs(): ExtensionModeUIDescriptor[] {
  return [...modeUIs.values()];
}

export function subscribeExtensionModeUIs(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

// A registered extension mode may contribute an opaque per-request settings
// blob the client should attach to every chat request body (e.g. the agent
// overlay's per-connector off/read-only/full session overrides, C4) — the
// core has no idea what shape this is, it's just forwarded to the server's
// resolveDynamicTools ctx (lib/search/extension-modes.ts) as `unknown`, the
// same "opaque, request-scoped, can only restrict" contract as
// sessionEnabledSources (lib/search/tool-filter.ts). At most one provider at
// a time — last registration wins, same as registerSlotComponent overwriting
// by name. globalThis for the same reason as modeUIs/listeners above:
// register-client.ts writes via a dynamic import back into this module,
// which Turbopack may resolve to a separate instance from the static import
// in components/chat-interface.tsx.
export function registerExtensionRequestSettings(provider: () => unknown): void {
  globalThis.__zetoraRequestSettingsProvider = provider;
}

export function getExtensionRequestSettings(): unknown {
  return globalThis.__zetoraRequestSettingsProvider?.();
}

// Shared by ExtensionSlot (components/extension-slot.tsx) and the mode
// selector so either can trigger the one-time @extensions/register-client
// import, whichever mounts first.
//
// The one-time guard only applies in production: every registerClient()
// call is idempotent (registerSlotComponent/registerDynamicToolRenderer/
// registerExtensionModeUI are all plain Map.set calls), but in dev, Turbopack
// Fast Refresh preserves this module's globalThis state across edits — so
// gating unconditionally meant any NEW registration added to
// agent/register-client.ts silently never took effect in an already-open
// tab until a full hard reload, a recurring source of "this new slot/
// renderer isn't showing up" confusion. In production there's no Fast
// Refresh and every registration that will ever exist is already in the
// bundle on first load, so the one-time guard is pure (safe) perf.
export async function loadClientExtensions(): Promise<void> {
  if (globalThis.__zetoraExtensionsLoaded && process.env.NODE_ENV === 'production') return;
  globalThis.__zetoraExtensionsLoaded = true;

  if (process.env.NEXT_PUBLIC_EXTENSIONS_ENABLED !== 'true') return;

  try {
    const { registerClient } = await import('@extensions/register-client');
    await registerClient();
  } catch (error) {
    console.error('[extensions] Failed to load client extensions:', error);
  }
}
