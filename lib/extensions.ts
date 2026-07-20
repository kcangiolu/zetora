import 'server-only';

import { createLogger } from '@/lib/logger';

const log = createLogger('extensions');

let loaded = false;

// Sole bridge from the public core to a private overlay (see AGENT.md §2.3
// if you have it checked out — it never ships in this repo). `@extensions/register`
// is aliased in next.config.ts to the overlay's agent/register.ts when
// present on disk, or to lib/extensions-noop.ts otherwise, so this import
// always resolves — there is no "module not found" path to catch here, only
// the extension's own registration code potentially throwing.
export async function loadExtensions(): Promise<void> {
  if (loaded) return;
  loaded = true;

  if (process.env.EXTENSIONS_ENABLED !== 'true') return;

  try {
    const { register } = await import('@extensions/register');
    await register();
  } catch (error) {
    log.error('Failed to load extensions:', error);
  }
}
