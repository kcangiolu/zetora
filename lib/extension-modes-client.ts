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
  requirePro?: boolean;
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

// Shared by ExtensionSlot (components/extension-slot.tsx) and the mode
// selector so either can trigger the one-time @extensions/register-client
// import, whichever mounts first.
export async function loadClientExtensions(): Promise<void> {
  if (globalThis.__zetoraExtensionsLoaded) return;
  globalThis.__zetoraExtensionsLoaded = true;

  if (process.env.NEXT_PUBLIC_EXTENSIONS_ENABLED !== 'true') return;

  try {
    const { registerClient } = await import('@extensions/register-client');
    await registerClient();
  } catch (error) {
    console.error('[extensions] Failed to load client extensions:', error);
  }
}
