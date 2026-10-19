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
      include: ['lib/**/*.{ts,tsx}', 'ai/**/*.{ts,tsx}'],
      // Declarations only: table definitions and ambient types have no logic to cover.
      exclude: ['lib/db/schema.ts', '**/*.d.ts'],
    },
  },
});
