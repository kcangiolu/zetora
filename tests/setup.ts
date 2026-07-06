import { vi } from 'vitest';

// env/server.ts (t3-env) hard-requires these two at import time.
process.env.DATABASE_URL ??= 'postgresql://user:pass@localhost:5432/test';
process.env.BETTER_AUTH_SECRET ??= 'test-secret';
process.env.MCP_CREDENTIALS_ENCRYPTION_KEY ??= 'test-anonymizer-key';
process.env.DODO_PAYMENTS_API_KEY ??= 'test-dodo-key';

// 'server-only' throws when imported outside a React Server Component bundle.
// Stub it so server modules can be unit-tested in isolation.
vi.mock('server-only', () => ({}));
