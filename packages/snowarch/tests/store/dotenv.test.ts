import { describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const SERVER = resolve(here, '../../dist/server.js');

/**
 * Criterion 7 — a project's own `.env` must not configure this server.
 *
 * This is P-22 and it is worth being precise about why it mattered: a bare
 * `dotenv.config()` reads the `.env` of whatever directory the process starts in. An MCP
 * server starts in the user's project, so an unrelated `WRITE_ENABLED=true` sitting in
 * their repository would arm writes against a production instance without anyone
 * choosing it. The variable is read from the environment, so proving it requires a real
 * child process with a real file on disk — an in-process test would only prove that the
 * module does not call dotenv, not that the file is ignored.
 */
function runServer(cwd: string, env: Record<string, string | undefined>): { stdout: string; stderr: string } {
  // pathToFileURL, not the bare path: on Windows a dynamic import of an absolute path
  // fails with ERR_UNSUPPORTED_ESM_URL_SCHEME, because `D:\\...` parses as a URL scheme.
  // Only the windows-latest cells could have shown this.
  const r = spawnSync(process.execPath, ['-e', `
    process.env.NODE_ENV = 'test';
    import(${JSON.stringify(pathToFileURL(SERVER).href)}).catch((e) => { console.error(String(e)); process.exit(1); });
    setTimeout(() => process.exit(0), 1500);
  `], {
    cwd,
    env: { ...process.env, ...env, SNOW_LOG_LEVEL: 'debug' } as NodeJS.ProcessEnv,
    encoding: 'utf8',
    timeout: 30_000,
  });
  return { stdout: r.stdout ?? '', stderr: r.stderr ?? '' };
}

describe('criterion 7 - a project .env has no effect without SNOW_ENV_FILE', () => {
  it('WRITE_ENABLED=true in the project .env does not reach the process', () => {
    const project = mkdtempSync(join(tmpdir(), 'snowarch-dotenv-'));
    try {
      writeFileSync(join(project, '.env'), 'WRITE_ENABLED=true\nSERVICENOW_INSTANCE_URL=https://leaked.service-now.com\n');
      mkdirSync(join(project, '.local'), { recursive: true, mode: 0o700 });

      const { stderr } = runServer(project, {
        CLAUDE_PROJECT_DIR: project,
        SNOW_STORE: undefined,
        SNOW_ENV_FILE: undefined,
        SERVICENOW_INSTANCE_URL: undefined,
        WRITE_ENABLED: undefined,
      });

      // The startup line reports what was actually loaded. If the .env had been read, the
      // instance from it would appear and the mode would not be unconfigured.
      expect(stderr).toContain('mode: unconfigured');
      expect(stderr).not.toContain('leaked.service-now.com');
    } finally {
      rmSync(project, { recursive: true, force: true });
    }
  }, 40_000);

  it('the same file IS read when SNOW_ENV_FILE names it', () => {
    // The other half of the rule: opting in explicitly still works, so this is isolation,
    // not removal.
    const project = mkdtempSync(join(tmpdir(), 'snowarch-dotenv-'));
    try {
      const envFile = join(project, 'my.env');
      writeFileSync(envFile, 'SERVICENOW_INSTANCE_URL=https://chosen.service-now.com\n');
      const { stderr } = runServer(project, {
        CLAUDE_PROJECT_DIR: project,
        SNOW_ENV_FILE: envFile,
        SERVICENOW_INSTANCE_URL: undefined,
      });
      expect(stderr).toContain('instance source: env');
      expect(stderr).not.toContain('mode: unconfigured');
    } finally {
      rmSync(project, { recursive: true, force: true });
    }
  }, 40_000);

  it('a SNOW_ENV_FILE that does not exist is ignored rather than fatal', () => {
    const project = mkdtempSync(join(tmpdir(), 'snowarch-dotenv-'));
    try {
      const { stderr } = runServer(project, {
        CLAUDE_PROJECT_DIR: project,
        SNOW_ENV_FILE: join(project, 'absent.env'),
        SERVICENOW_INSTANCE_URL: undefined,
      });
      expect(stderr).toContain('mode: unconfigured');
    } finally {
      rmSync(project, { recursive: true, force: true });
    }
  }, 40_000);
});
