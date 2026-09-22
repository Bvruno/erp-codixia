import { defineConfig, globalIgnores } from 'eslint/config';
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';

const eslintConfig = defineConfig([
  globalIgnores([
    '**/node_modules/**',
    '**/dist/**',
    '**/route-tree.gen.ts',
    '**/.tanstack/**',
    '**/test-results/**',
    '**/playwright-report/**',
    'graphify-out/**',
    'scripts/**',
    '**/scripts/**',
    '*.mjs',
    '**/*.mjs',
  ]),
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['apps/web/**/*.{ts,tsx}', 'apps/plataforma/**/*.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks },
    rules: {
      ...reactHooks.configs.recommended.rules,
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },
  {
    files: ['apps/api/**/*.ts', 'packages/shared/**/*.ts'],
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },
]);

export default eslintConfig;