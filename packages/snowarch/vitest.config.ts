import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  test: {
    // Scoped to this package. Without `root` and an explicit `include`, vitest walks up
    // from the invocation directory and picks up files outside the workspace — which is
    // how the removed `desktop/tests/**` suites used to run and fail (P-29).
    root: here,
    include: ['tests/**/*.test.ts'],
    globals: true,
    environment: 'node',
    setupFiles: ['./tests/setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['src/**'],
      // The CLI is a thin commander wiring around a child-process spawn and three stubs;
      // covering it would measure commander, not this package.
      exclude: ['src/cli/index.ts'],
      // permissions.ts decides whether a write reaches a customer's instance. A branch
      // nobody exercised is a branch nobody has checked, so it is held at 100 % rather
      // than at a project-wide average that a large well-covered file could carry.
      thresholds: {
        'src/utils/permissions.ts': { lines: 100, functions: 100, branches: 100, statements: 100 },
      },
    },
  },
});
