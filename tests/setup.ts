import { vi } from 'vitest';

// env/server.ts (t3-env) hard-requires these two at import time.
process.env.DATABASE_URL ??= 'postgresql://user:pass@localhost:5432/test';
process.env.BETTER_AUTH_SECRET ??= 'test-secret';
process.env.MCP_CREDENTIALS_ENCRYPTION_KEY ??= 'test-anonymizer-key';
process.env.DODO_PAYMENTS_API_KEY ??= 'test-dodo-key';
// lib/auth.ts throws at module-load if these Polar checkout tier/slug pairs
// are empty — same "placeholder" convention docker-compose.yml uses.
process.env.NEXT_PUBLIC_STARTER_TIER ??= 'placeholder';
process.env.NEXT_PUBLIC_STARTER_SLUG ??= 'placeholder';
process.env.NEXT_PUBLIC_PREMIUM_TIER ??= 'placeholder';
process.env.NEXT_PUBLIC_PREMIUM_SLUG ??= 'placeholder';
process.env.NEXT_PUBLIC_MAX_TIER ??= 'placeholder';
process.env.NEXT_PUBLIC_MAX_SLUG ??= 'placeholder';
process.env.POLAR_WEBHOOK_SECRET ??= 'test-polar-webhook-secret';

// 'server-only' throws when imported outside a React Server Component bundle.
// Stub it so server modules can be unit-tested in isolation.
vi.mock('server-only', () => ({}));
