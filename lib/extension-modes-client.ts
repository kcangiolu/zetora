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

const modeUIs = new Map<string, ExtensionModeUIDescriptor>();
const listeners = new Set<() => void>();

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
let extensionsLoaded = false;
export async function loadClientExtensions(): Promise<void> {
  if (extensionsLoaded) return;
  extensionsLoaded = true;

  if (process.env.NEXT_PUBLIC_EXTENSIONS_ENABLED !== 'true') return;

  try {
    const { registerClient } = await import('@extensions/register-client');
    await registerClient();
  } catch (error) {
    console.error('[extensions] Failed to load client extensions:', error);
  }
}
