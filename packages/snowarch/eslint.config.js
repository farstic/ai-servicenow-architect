import tsPlugin from '@typescript-eslint/eslint-plugin';
import tsParser from '@typescript-eslint/parser';
import globals from 'globals';

export default [
  {
    files: ['src/**/*.ts', 'tests/**/*.ts'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: 2022,
        sourceType: 'module',
        project: './tsconfig.eslint.json',
      },
      globals: {
        ...globals.node,
      },
    },
    plugins: {
      '@typescript-eslint': tsPlugin,
    },
    rules: {
      ...tsPlugin.configs['recommended'].rules,
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      'no-console': 'off',
    },
  },
  {
    // The header guard (ARC-04-S10). `client.ts` builds an Authorization header on every
    // request; the moment one reaches the logger, a credential is on stderr and in whatever
    // transcript or CI log captured it. The logger redacts credential-shaped values, but a
    // second line of defence that fails at LINT time is worth having: redaction is a runtime
    // behaviour with an opt-out (`REDACT_SENSITIVE_DATA=false`), and this is not.
    //
    // Scoped to src/servicenow/ because that is where headers exist. `tests/audit/no-secrets`
    // proves the runtime half across every mutating tool.
    files: ['src/servicenow/**/*.ts'],
    rules: {
      // One selector, not two: `Identifier[name='headers']` anywhere inside a logger call
      // covers the shorthand `{ headers }`, the explicit `{ headers: options.headers }` and a
      // bare `logger.info('x', options.headers)`. Two overlapping selectors reported the same
      // line three times, which reads as three problems.
      'no-restricted-syntax': ['error', {
        selector: "CallExpression[callee.object.name='logger'] Identifier[name='headers']",
        message: 'Never pass headers to the logger: they carry Authorization. Log the table or URL path instead.',
      }],
    },
  },
];
