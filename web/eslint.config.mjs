import { defineConfig, globalIgnores } from 'eslint/config';
import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTs from 'eslint-config-next/typescript';

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    // React 19's compiler-era rules flag patterns the app uses on purpose (refs read in render for the 3D stage, state set in effects for transitions). The tests and browser checks cover them.
    rules: {
      'react-hooks/refs': 'off',
      'react-hooks/set-state-in-effect': 'off',
      'react-hooks/immutability': 'off',
      'react-hooks/preserve-manual-memoization': 'off',
      'react/no-unescaped-entities': 'off',
      'react/display-name': 'off',
      '@next/next/no-img-element': 'off', // photos come from an external host; the site is served without Next's image optimiser
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    },
  },
  globalIgnores(['.next*/**', 'out/**', 'build/**', 'next-env.d.ts', 'public/**', 'vendor/**', 'scripts/**']),
]);
