/**
 * The live suite's inputs, and the one gate.
 *
 * `RUN_LIVE_E2E=1` is the gate ARC-04's server suite already uses; there is not a second one. The
 * values arrive from repository secrets in CI and from a 0600 file through `SNOW_ENV_FILE` locally
 * — never from a `.env` in the working directory, which is how a credential ends up in a tarball.
 */
import { existsSync, readFileSync } from 'node:fs';

export const LIVE = process.env.RUN_LIVE_E2E === '1';
export const ALLOW_WRITES = process.env.SNOW_E2E_ALLOW_WRITES === '1';

/** `SNOW_ENV_FILE`, loaded the way ARC-04-S02 loads it: an explicit path, never a cwd default. */
export function loadEnvFile(path = process.env.SNOW_ENV_FILE): void {
  if (!path || !existsSync(path)) return;
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq < 0) continue;
    const key = trimmed.slice(0, eq).trim();
    // The file is authoritative for a live run: a shell that exported an older value would
    // otherwise decide, and the file is the thing the owner just edited.
    process.env[key] = trimmed.slice(eq + 1).trim();
  }
}

export interface LiveConfig {
  url: string;
  username: string;
  password: string;
  clientId?: string | undefined;
  clientSecret?: string | undefined;
}

/** The configuration, or `null` when the suite must skip. NEVER printed, whole or in part. */
export function liveConfig(): LiveConfig | null {
  loadEnvFile();
  const url = process.env.SNOW_E2E_URL;
  const username = process.env.SNOW_E2E_USERNAME;
  const password = process.env.SNOW_E2E_PASSWORD;
  if (!url || !username || !password) return null;
  return {
    url,
    username,
    password,
    clientId: process.env.SNOW_E2E_OAUTH_CLIENT_ID,
    clientSecret: process.env.SNOW_E2E_OAUTH_CLIENT_SECRET,
  };
}

export const hasOauth = (c: LiveConfig | null): boolean => Boolean(c?.clientId && c?.clientSecret);
