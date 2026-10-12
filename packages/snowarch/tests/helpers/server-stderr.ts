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
 * It waits for `until`, by default the server's end-of-startup line, and returns what stderr held then, with the
 * child stopped. It used to exit the child at a fixed 1.5 s, and a slow start on test (windows-latest, node 20),
 * 5333 ms against 1.6 to 2.1 s on every other run, read an empty stderr where the product had written its line.
 * After `timeout` it returns what there is, so a line that never comes fails the caller's assertion, not a hang.
 */
export function serverStderr(module: string, env: Record<string, string | undefined>, cwd: string,
  { until = STARTED, timeout = 30_000 }: { until?: RegExp; timeout?: number } = {}): Promise<string> {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, ['-e',
      `import(${JSON.stringify(pathToFileURL(module).href)}).catch((e) => { console.error(String(e)); process.exit(1); });`], {
      cwd,
      env: licensedEnv({ ...process.env, ...env, SNOW_LOG_LEVEL: 'info' }),
      // stdin stays open: the server's stdio transport would exit at its end, before a slow start had logged.
      stdio: ['pipe', 'ignore', 'pipe'],
    });
    let stderr = '';
    let settled = false;
    const settle = (): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      child.kill();
      resolve(stderr);
    };
    const timer = setTimeout(settle, timeout);
    child.stderr?.setEncoding('utf8');
    child.stderr?.on('data', (chunk: string) => {
      stderr += chunk;
      if (until.test(stderr)) settle();
    });
    child.on('close', settle);
  });
}
