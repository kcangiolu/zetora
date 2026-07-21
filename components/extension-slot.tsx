'use client';

import { useEffect, useState, type ComponentType } from 'react';
import { loadClientExtensions } from '@/lib/extension-modes-client';

// Client-side counterpart to lib/extensions.ts: a private overlay (see
// AGENT.md §2.3) registers components here by name via registerClient() in
// @extensions/register-client, and <ExtensionSlot name="..." /> renders
// whatever is registered for that name — nothing, when no overlay is
// checked out. loadClientExtensions (the one-time
// @extensions/register-client import) lives in lib/extension-modes-client.ts
// so the mode selector can trigger it too, whichever mounts first.
const slotComponents = new Map<string, ComponentType<Record<string, unknown>>>();
const listeners = new Set<() => void>();

export function registerSlotComponent(name: string, component: ComponentType<Record<string, unknown>>): void {
  slotComponents.set(name, component);
  listeners.forEach((listener) => listener());
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
