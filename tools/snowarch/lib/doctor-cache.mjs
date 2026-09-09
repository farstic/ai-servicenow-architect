// ARC-06-S08 — `.local/doctor-last.json`: what the SessionStart banner reads.
//
// The banner has to print a verdict in under 300 ms, on a machine that may have no Node at all, so
// it cannot run checks — it reads the last ones. That makes this file a CONTRACT rather than a
// convenience: ARC-08-S01's schema may add keys, never rename these.
//
// It goes through the same write-time secret guard as the bootstrap state, and for the same reason:
// a step three stories from now will have a probe result it wants to keep, and the obvious place to
// put a URL is a `detail` string.
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { assertStorable } from './state.mjs';
import { writeJsonAtomic } from './settings-local.mjs';

export const CACHE_VERSION = 1;
export const CACHE_FILE = join('.local', 'doctor-last.json');
export const cachePath = (root) => join(root, CACHE_FILE);

/**
 * The keys ARC-08 may rely on. Named here rather than left implicit, so a rename is a visible
 * change to a list rather than a silent break in a file nobody reads until the banner goes blank.
 */
export const COMPATIBILITY_KEYS = Object.freeze(['version', 'at', 'writer', 'mode', 'checks', 'summary']);

/** `{ ok, warn, fail }` from the checks themselves — never a count kept in parallel with them. */
export function summarise(checks) {
  const summary = { ok: 0, warn: 0, fail: 0 };
  for (const c of checks) if (c.status in summary) summary[c.status] += 1;
  return summary;
}

/**
 * Write the cache, 0600 and atomically.
 *
 * `writer` says who produced it — `bootstrap` here, `doctor` in ARC-08 — because a banner reading a
 * cache written by a run that skipped half the checks should be able to tell.
 */
export function writeDoctorCache(root, { mode, checks, engineVersion = null, contractSha = null,
  instance = null, server = null, writer = 'bootstrap', now = new Date() }) {
  const payload = {
    version: CACHE_VERSION,
    at: now.toISOString(),
    writer,
    engineVersion,
    contractSha,
    mode,
    ...(instance ? { instance } : {}),
    ...(server ? { server } : {}),
    checks,
    summary: summarise(checks),
  };
  // The same guard the state file uses: a URL, an address or a secret-shaped key fails the write
  // rather than reaching a file that, unlike the store, things read casually.
  assertStorable(payload, 'doctor-last');
  mkdirSync(join(root, '.local'), { recursive: true, mode: 0o700 });
  // 0600: it names a configured instance and its probe results. Not a secret, but not the sort of
  // thing another account on a shared machine has any business reading either.
  writeJsonAtomic(cachePath(root), payload, { mode: 0o600 });
  return payload;
}
