import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import logical from './scripts/eslint/logical-properties.mjs';

export default tseslint.config(
  { ignores: ['**/dist/**', '**/.next/**', '**/node_modules/**', '**/*.config.*', 'apps/web/public/**', 'apps/web/next-env.d.ts'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    plugins: { foodtrack: { rules: { 'logical-properties': logical } } },
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      'no-empty': ['error', { allowEmptyCatch: true }],
    },
  },
  { files: ['apps/web/**/*.{ts,tsx}'], rules: { 'foodtrack/logical-properties': 'error' } },
);
