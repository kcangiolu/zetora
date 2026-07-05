import coreWebVitals from 'eslint-config-next/core-web-vitals';
import * as espree from 'espree';

// Global ignores must live in their own config object to apply to every rule set.
const eslintConfig = [
  {
    ignores: [
      '.next/**',
      'node_modules/**',
      'drizzle/**',
      'public/**',
      'next-env.d.ts',
      'tsconfig.tsbuildinfo',
      'coverage/**',
    ],
  },
  ...coreWebVitals,
  {
    // eslint-plugin-react's automatic version detection calls the removed
    // ESLint 9 context.getFilename API under ESLint 10 — pin the version
    // explicitly to skip detection.
    settings: {
      react: {
        version: '19',
      },
    },
  },
  {
    // The React Compiler-powered rules introduced by eslint-plugin-react-hooks
    // v7 flag ~140 pre-existing patterns across the UI. They are valuable
    // signals but not regressions, so keep them visible as warnings instead of
    // failing the build. rules-of-hooks and exhaustive-deps keep their
    // defaults.
    rules: {
      'react-hooks/set-state-in-effect': 'warn',
      'react-hooks/refs': 'warn',
      'react-hooks/purity': 'warn',
      'react-hooks/static-components': 'warn',
      'react-hooks/preserve-manual-memoization': 'warn',
      'react-hooks/immutability': 'warn',
      'react-hooks/error-boundaries': 'warn',
      'react-hooks/incompatible-library': 'warn',
    },
  },
  {
    // eslint-config-next parses plain JS with Next's compiled Babel parser,
    // whose scope manager lacks the addGlobals API required by ESLint 10.
    // All application code is TypeScript, so parse the few root-level JS
    // config files with espree instead.
    files: ['**/*.js', '**/*.mjs', '**/*.cjs', '**/*.jsx'],
    languageOptions: {
      parser: espree,
    },
  },
];

export default eslintConfig;
