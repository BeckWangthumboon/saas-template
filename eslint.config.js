import convexPlugin from '@convex-dev/eslint-plugin';
import js from '@eslint/js';
import eslintConfigPrettier from 'eslint-config-prettier';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import simpleImportSort from 'eslint-plugin-simple-import-sort';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/node_modules/**',
      'apps/backend/convex/_generated/**',
      'apps/web/src/routeTree.gen.ts',
      'eslint.config.js',
      'apps/web/vite.config.ts',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  ...tseslint.configs.stylisticTypeChecked,
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2020,
      globals: {
        ...globals.browser,
        ...globals.node,
      },
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
      'simple-import-sort': simpleImportSort,
    },
    rules: {
      // React
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': 'off',

      // Import sorting
      'simple-import-sort/imports': 'error',
      'simple-import-sort/exports': 'error',

      // TypeScript overrides for React/shadcn compatibility
      '@typescript-eslint/no-unused-vars': [
        'error',
        { varsIgnorePattern: '^_', argsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { prefer: 'type-imports', fixStyle: 'inline-type-imports' },
      ],
      '@typescript-eslint/no-import-type-side-effects': 'error',

      // Relax strict rules that conflict with React patterns
      '@typescript-eslint/no-misused-promises': [
        'error',
        { checksVoidReturn: { attributes: false } },
      ],
      '@typescript-eslint/restrict-template-expressions': [
        'error',
        { allowNumber: true, allowBoolean: true },
      ],
      '@typescript-eslint/no-empty-object-type': 'off',

      // Convex handlers often don't need await
      '@typescript-eslint/require-await': 'off',
    },
  },
  {
    files: ['apps/backend/convex/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: './_generated/server',
              message: 'Use ./functions so triggers and custom ctx are enforced.',
            },
          ],
          patterns: [
            {
              group: ['**/_generated/server'],
              message: 'Use ./functions so triggers and custom ctx are enforced.',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['apps/backend/convex/functions.ts'],
    rules: {
      'no-restricted-imports': 'off',
    },
  },
  ...convexPlugin.configs.recommended,
  eslintConfigPrettier,
);
