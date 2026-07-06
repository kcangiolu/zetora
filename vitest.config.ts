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
        'lib/errors.ts',
        'lib/chat-messages.ts',
        'lib/mcp/crypto.ts',
        'lib/mcp/server-config.ts',
        'lib/tools/datetime.ts',
        'lib/search/auto-router.ts',
        'lib/search/prepare-step.ts',
      ],
    },
  },
});
