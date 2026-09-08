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
    // 30 s, not vitest's 5 s default.
    //
    // A large part of this suite spawns the server, the CLI or the doctor as a child process, or
    // fsyncs a file. `tests/store/atomic.test.ts`, `tests/docs/readme-blocks.test.ts` and
    // `tests/doctor/doctor.test.ts` are the three that actually failed. None of them is slow:
    // atomic's 50-iteration write+fsync+rename+read loop measures ~223 ms on an idle machine, and
    // readme-blocks takes ~1 s for the whole file. They exceed 5 s only when every worker is
    // issuing fsyncs and spawning processes at once, and the victim is then whichever test lost
    // the race — three different ones across four full runs.
    //
    // A wall-clock budget inside a parallel runner measures contention as well as its subject, so
    // it has to have headroom for the contention or it is not measuring the subject at all. 30 s
    // is ~135x atomic's real cost; a genuine hang still fails, just later. A suite that fails one
    // run in two teaches people to rerun until green, which costs more than the hang would.
    testTimeout: 30_000,
    // The same reasoning for `beforeAll`/`afterAll`: several suites build a fixture instance,
    // write a store or start a server in a hook, and a hook that times out fails every test in
    // its file — the loudest version of the same flake.
    hookTimeout: 30_000,
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
