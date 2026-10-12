// Copyright 2026 Cvetomir Grigorov. Licensed under the Apache License, Version 2.0 (see LICENSE).
// snowarch — AI ServiceNow Architect. Not affiliated with or endorsed by ServiceNow, Inc.
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { licensedEnv } from '../../../../tools/snowarch/tests/helpers/licence-hook/index.mjs';

/**
 * ARC-09-C132 — the stderr of a server module started in a child, for a test that reads its startup lines.
 *
 * Moved unchanged from `tests/store/masking.test.ts`: the child imports `module` and exits at 1.5 s, and the
 * caller reads whatever stderr holds by then.
 */
export function serverStderr(module: string, env: Record<string, string | undefined>, cwd: string): string {
  const r = spawnSync(process.execPath, ['-e', `
    import(${JSON.stringify(pathToFileURL(module).href)}).catch((e) => { console.error(String(e)); process.exit(1); });
    setTimeout(() => process.exit(0), 1500);
  `], {
    cwd,
    env: licensedEnv({ ...process.env, ...env, SNOW_LOG_LEVEL: 'info' }),
    encoding: 'utf8',
    timeout: 30_000,
  });
  return r.stderr ?? '';
}
