import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    environment: 'node',
    globals: true,
    include: ['tests/**/*.test.ts'],
    setupFiles: ['tests/setup.ts'],
    coverage: {
      provider: 'v8',
      include: [
        'lib/speakable-text.ts',
        'lib/parser.ts',
        'lib/discount.ts',
        'lib/search-utils.ts',
        'lib/utils.ts',
        'lib/rate-limit.ts',
        'lib/lookout-auth.ts',
        'lib/custom-providers.ts',
        'lib/context-window.ts',
        'lib/search/context-budget.ts',
        'lib/errors.ts',
        'lib/chat-messages.ts',
        'lib/hermes/attachments.ts',
        'lib/hermes/chat-mode.ts',
        'lib/hermes/enabled.ts',
        'lib/mcp/crypto.ts',
        'lib/mcp/server-config.ts',
        'lib/tools/datetime.ts',
        'lib/search/auto-router.ts',
        'lib/search/prepare-step.ts',
        'lib/tools/web-search-limits.ts',
        'lib/timeouts.ts',
        'lib/vector/qdrant-filters.ts',
        'lib/vector/archive-merge.ts',
        'lib/tools/graphiti-memory.ts',
        'lib/graphiti/write-coordinator.ts',
        'lib/anonymizer/pseudonymize.ts',
      ],
    },
  },
});
