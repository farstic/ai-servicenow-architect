// Copyright 2026 Cvetomir Grigorov. Licensed under the Apache License, Version 2.0 (see LICENSE).
// snowarch — AI ServiceNow Architect. Not affiliated with or endorsed by ServiceNow, Inc.
import { spawn } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { licensedEnv } from '../../../../tools/snowarch/tests/helpers/licence-hook/index.mjs';

/** The server's end-of-startup line: `main()` prints it after every store, instance and audit line. */
export const STARTED = /\[INFO\] licence: /;

/**
 * ARC-09-C132 — the stderr of a server module started in a child, for a test that reads its startup lines.
 *
 * It waits for `until`, by default the server's end-of-startup line, and returns what stderr held then. It used to
 * exit the child at a fixed 1.5 s, and a slow start on test (windows-latest, node 20), 5333 ms against 1.6 to 2.1 s on
 * every other run, read an empty stderr where the product had written its line. After `timeout` it returns what there
 * is, so a line that never comes fails the caller's assertion, not a hang.
 *
 * IT RETURNS ONLY ONCE THE CHILD HAS EXITED. At the line, or at the cap, it ends the child the way a client ends the
 * server: it closes stdin, and the server exits 0 at its end (server.ts:395). A child still there a cap later is killed.
 * Either way the promise settles on `close`, after the exit and with its pipes shut. On Windows a directory a live
 * child holds cannot be removed, and a helper that returned at the line failed every Windows cell of run
 * 38286365851 with EPERM and EBUSY.
 */
export function serverStderr(module: string, env: Record<string, string | undefined>, cwd: string,
  { until = STARTED, timeout = 30_000 }: { until?: RegExp; timeout?: number } = {}): Promise<string> {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, ['-e',
      `import(${JSON.stringify(pathToFileURL(module).href)}).catch((e) => { console.error(String(e)); process.exit(1); });`], {
      cwd,
      env: licensedEnv({ ...process.env, ...env, SNOW_LOG_LEVEL: 'info' }),
      // stdin stays open until the line: at its end the server exits (server.ts:395), and an exit can cut stderr writes
      // still pending on a Windows pipe.
      stdio: ['pipe', 'ignore', 'pipe'],
    });
    let stderr = '';
    let killer: NodeJS.Timeout | undefined;
    const end = (): void => {
      if (killer) return;
      clearTimeout(cap);
      child.stdin?.end();
      killer = setTimeout(() => child.kill(), timeout);
    };
    const cap = setTimeout(end, timeout);
    child.stderr?.setEncoding('utf8');
    child.stderr?.on('data', (chunk: string) => {
      stderr += chunk;
      if (until.test(stderr)) end();
    });
    child.on('close', () => {
      clearTimeout(cap);
      clearTimeout(killer);
      resolve(stderr);
    });
  });
}
