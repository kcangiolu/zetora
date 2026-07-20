'use client';

import { useEffect, useState, type ComponentType } from 'react';

// Client-side counterpart to lib/extensions.ts: a private overlay (see
// AGENT.md §2.3) registers components here by name via registerClient() in
// @extensions/register, and <ExtensionSlot name="..." /> renders whatever
// is registered for that name — nothing, when no overlay is checked out.
const slotComponents = new Map<string, ComponentType<Record<string, unknown>>>();
const listeners = new Set<() => void>();

export function registerSlotComponent(name: string, component: ComponentType<Record<string, unknown>>): void {
  slotComponents.set(name, component);
  listeners.forEach((listener) => listener());
}

let extensionsLoaded = false;
async function loadClientExtensions(): Promise<void> {
  if (extensionsLoaded) return;
  extensionsLoaded = true;

  if (process.env.NEXT_PUBLIC_EXTENSIONS_ENABLED !== 'true') return;

  try {
    const { registerClient } = await import('@extensions/register');
    await registerClient();
  } catch (error) {
    console.error('[extensions] Failed to load client extensions:', error);
  }
}

export function ExtensionSlot({ name, ...props }: { name: string } & Record<string, unknown>) {
  const [, forceUpdate] = useState(0);

  useEffect(() => {
    loadClientExtensions();

    const listener = () => forceUpdate((n) => n + 1);
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }, []);

  const Component = slotComponents.get(name);
  if (!Component) return null;
  return <Component {...props} />;
}
