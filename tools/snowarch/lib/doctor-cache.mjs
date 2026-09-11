// ARC-06-S08 — `.local/doctor-last.json`: what the SessionStart banner reads.
//
// The banner has to print a verdict in under 300 ms, on a machine that may have no Node at all, so
// it cannot run checks — it reads the last ones. That makes this file a CONTRACT rather than a
// convenience: ARC-08-S01's schema may add keys, never rename these.
//
// It goes through the same write-time secret guard as the bootstrap state, and for the same reason:
// a step three stories from now will have a probe result it wants to keep, and the obvious place to
// put a URL is a `detail` string.
import { existsSync, mkdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { assertStorable } from './state.mjs';
import { writeJsonAtomic } from './settings-local.mjs';

export const CACHE_VERSION = 1;
export const CACHE_FILE = join('.local', 'doctor-last.json');
export const cachePath = (root) => join(root, CACHE_FILE);

/**
 * The six files whose mtime decides whether the cache still describes this checkout.
 *
 * MTIMES, not hashes: the banner has ~300 ms and no Node on some machines, and six `stat` calls
 * are the cheapest question that can be asked. They are the six inputs a doctor answer depends on
 * — the registration, both settings files, the store, the config and the recorded mode — so a
 * change to any of them is a reason to re-run rather than to read.
 */
export const INPUT_FILES = Object.freeze({
  mcpJsonMtime: ['.mcp.json'],
  settingsMtime: ['.claude', 'settings.json'],
  settingsLocalMtime: ['.claude', 'settings.local.json'],
  storeMtime: ['.local', 'instances.json'],
  engineConfigMtime: ['engine.config.json'],
  bootstrapStateMtime: ['.local', 'bootstrap-state.json'],
});

export const INPUTS_FILE = join('.local', 'doctor-last.inputs.json');
export const inputsPath = (root) => join(root, INPUTS_FILE);

/** `{ mcpJsonMtime: 1757…, … }` — `null` for a file that is not there, which is itself an input. */
export function collectInputs(root, { stat = statSync, exists = existsSync } = {}) {
  const out = {};
  for (const [key, parts] of Object.entries(INPUT_FILES)) {
    const p = join(root, ...parts);
    out[key] = exists(p) ? Math.round(stat(p).mtimeMs) : null;
  }
  return out;
}

/**
 * Is the cache still describing this checkout? ONE rule, for the banner (S08) and for `--fix` (F7).
 *
 * A missing inputs file is stale, not fresh: it means the cache was written by a build that did
 * not record what it depended on, and "assume fine" is exactly the failure R-14 describes.
 */
export function cacheStale(root, { now = Date.now(), maxAgeMs = null, read = readFileSync,
  exists = existsSync, inputs = null } = {}) {
  if (!exists(cachePath(root))) return { stale: true, reason: 'no cache' };
  if (!exists(inputsPath(root))) return { stale: true, reason: 'no inputs file' };
  let recorded;
  try {
    recorded = JSON.parse(read(inputsPath(root), 'utf8'));
  } catch {
    return { stale: true, reason: 'inputs file is not valid JSON' };
  }
  const current = inputs ?? collectInputs(root);
  for (const key of Object.keys(INPUT_FILES)) {
    if (recorded[key] !== current[key]) return { stale: true, reason: `${key} changed` };
  }
  if (maxAgeMs !== null) {
    try {
      const at = Date.parse(JSON.parse(read(cachePath(root), 'utf8')).at);
      if (Number.isFinite(at) && now - at > maxAgeMs) return { stale: true, reason: 'too old' };
    } catch {
      return { stale: true, reason: 'cache is not valid JSON' };
    }
  }
  return { stale: false, reason: null };
}

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

/**
 * The report as this FILE may hold it — which is less than the report as a caller may read it.
 *
 * `server.instances[].username` is masked (`s***@corp.example.com`) and is still an ADDRESS
 * SHAPE, which the write-time guard refuses on sight — rightly: this file is read casually, pasted
 * into issues and copied between machines, and the guard's value is that it has no exceptions. The
 * banner does not need an account name to print a verdict, so the cache does not carry one. A live
 * `--json` run still returns it; a stored answer does not.
 *
 * Found the first time a CONFIGURED store met the cache: every live install would otherwise have
 * had no cache at all, and the banner no verdict to show.
 */
export function forStorage(report) {
  const server = report.server;
  if (!server?.instances?.length) return report;
  return {
    ...report,
    server: {
      ...server,
      instances: server.instances.map(({ username: _username, ...rest }) => rest),
    },
  };
}

/**
 * ARC-08's write: the doctor's own report, plus the inputs that justify reading it later.
 *
 * The SAME file and the same guard as the bootstrap's write — a second writer with its own shape
 * is how a banner ends up reading a key nobody writes any more. What is added is the report
 * itself (the doctor's JSON is the cache; there is nothing to summarise) and the inputs file.
 *
 * `--section` never gets here: a partial report cached as if it were a full one would tell the
 * banner that checks which never ran had passed. That decision is the caller's, and it is stated
 * where the caller makes it.
 */
export function writeReportCache(root, report, { writer = 'doctor', now = new Date() } = {}) {
  const stored = forStorage(report);
  const payload = {
    version: CACHE_VERSION,
    at: (now instanceof Date ? now : new Date(now)).toISOString(),
    writer,
    engineVersion: report.version ?? null,
    contractSha: report.engine?.contractSha ?? null,
    mode: report.mode ?? null,
    modeLine: report.modeLine ?? null,
    ...(stored.server ? { server: stored.server } : {}),
    checks: (stored.checks ?? []).map(({ id, status, detail, remedy = null }) =>
      ({ id, status, detail, ...(remedy ? { remedy } : {}) })),
    summary: stored.summary ?? summarise(stored.checks ?? []),
    report: stored,
  };
  assertStorable(payload, 'doctor-last');
  mkdirSync(join(root, '.local'), { recursive: true, mode: 0o700 });
  writeJsonAtomic(cachePath(root), payload, { mode: 0o600 });
  const inputs = collectInputs(root);
  writeJsonAtomic(inputsPath(root), inputs, { mode: 0o600 });
  return { payload, inputs };
}
