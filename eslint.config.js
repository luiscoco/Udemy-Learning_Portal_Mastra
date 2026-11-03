import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';

export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/coverage/**',
      '**/.mastra/**',
      '.data/**',
      'playwright-report/**',
      'test-results/**',
      '.claude/**',
      '.agents/**',
      '.github/prompts/**',
      '.github/skills/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: { globals: { ...globals.node } },
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      '@typescript-eslint/consistent-type-imports': 'error',
    },
  },
  {
    files: ['apps/web/**/*.{ts,tsx}'],
    languageOptions: { globals: { ...globals.browser } },
    plugins: { 'react-hooks': reactHooks },
    rules: {
      ...reactHooks.configs.recommended.rules,
      // The browser must never import server-only packages.
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@mastra/*', '@mlp/auth', '@mlp/deploy', '@mlp/mastra-runtime', '@mlp/labs', '@mlp/api'],
              message: 'Server-only package: call the API instead.',
            },
          ],
        },
      ],
    },
  },
  {
    // The client SDK runs in the browser: same rule (L66).
    files: ['packages/client/**/*.ts'],
    languageOptions: { globals: { ...globals.browser } },
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@mastra/*', '@mlp/auth', '@mlp/deploy', '@mlp/mastra-runtime', '@mlp/labs', '@mlp/lab-engine', '@mlp/api', 'node:*'],
              message: 'The client SDK is browser-safe: only @mlp/contracts and zod.',
            },
          ],
        },
      ],
    },
  },
);
