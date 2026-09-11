// ARC-06-S03 — `.local/bootstrap-state.json`: what this checkout knows about its own installation.
//
// Three properties, and each exists because of a specific way this file could hurt someone:
//
//   ATOMIC   a temp file plus `rename`, so a Ctrl-C mid-write cannot leave half a JSON document
//            where the next run — and `/snowarch status`, and the doctor — expect a whole one.
//   PRIVATE  0600 on POSIX. It is not supposed to hold anything sensitive, and the guard below is
//            what keeps that true, but a file this cheap to lock down should be locked down.
//   GUARDED  a write-time refusal of secret-shaped keys and values. `redact()` stops a secret being
//            PRINTED; this stops one being STORED, which is the longer-lived mistake — a log rotates
//            after ten runs, a state file does not.
//
// It is read by more than the bootstrap: `docsStatus()` (ARC-03-S06) reads `docs.mode`, and the
// `/snowarch status` skill reads `mode` when the doctor cannot run. That is why `docs.mode` is
// nested exactly where it is, and why the shape is versioned.
import { chmodSync, existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { EXIT_FAIL } from './exit.mjs';
import { isSecretKey, redact } from './redact.mjs';

export const STATE_VERSION = 1;
export const PRODUCT = 'snowarch';

export const statePath = (root) => join(root, '.local', 'bootstrap-state.json');
export const doctorCachePath = (root) => join(root, '.local', 'doctor-last.json');

/** Everything `--reset` may remove. Named here so the runner cannot widen it by accident. */
export const RESET_PATHS = [statePath, doctorCachePath];

/** The sentence `--reset` prints. The two files it names are the ones it must NOT touch. */
export const RESET_MESSAGE =
  'reset: bootstrap state cleared (.local/instances.json and .local/config.json untouched)';

export class StateError extends Error {
  constructor(message, code = EXIT_FAIL) { super(message); this.name = 'StateError'; this.code = code; }
}

/**
 * A value that must never reach the file.
 *
 * Two tests, and the second is the one that generalises: a URL shape, and then "would the redactor
 * change this?". Using the redactor as the oracle means the guard covers addresses, credential-ish
 * `KEY=value` text and anything a caller has registered as secret, without this module keeping a
 * second opinion about what sensitive looks like.
 */
const URLISH = /[a-z][a-z0-9+.-]*:\/\/|@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/i;
export function sensitiveValue(value) {
  if (typeof value !== 'string') return null;
  if (URLISH.test(value)) return 'looks like a URL or an address';
  if (redact(value) !== value) return 'the redactor would rewrite it';
  return null;
}

/**
 * Refuse to store a secret, wherever in the tree it is.
 *
 * Walks the whole object rather than checking the keys this version happens to define: the failure
 * to prevent is a step three stories from now putting an instance URL in its `data` blob, and that
 * step will not be edited into this list first.
 */
export function assertStorable(value, path = 'state') {
  if (Array.isArray(value)) {
    value.forEach((v, i) => assertStorable(v, `${path}[${i}]`));
    return value;
  }
  if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) {
      if (isSecretKey(k)) {
        throw new StateError(`refusing to write ${path}.${k}: the key names a secret — `
          + 'the state file records what was configured, never a credential');
      }
      assertStorable(v, `${path}.${k}`);
    }
    return value;
  }
  const why = sensitiveValue(value);
  if (why) {
    throw new StateError(`refusing to write ${path}: ${why} — `
      + 'the state file records what was configured, never a credential or an instance address');
  }
  return value;
}

/** The v1 skeleton. `mode` is null until the plan is accepted; the launchers write the same shape. */
export function emptyState({ engineVersion, platform = process.platform, node = null,
  writer = 'node', now = new Date() } = {}) {
  const at = now.toISOString();
  const state = {
    version: STATE_VERSION,
    product: PRODUCT,
    engineVersion,
    mode: null,
    docs: { mode: null, pin: null },
    node: node ?? { present: false, version: null },
    writer,
    platform,
    registration: 'project',
    registrationReason: 'default',
    hooksDisabledByBootstrap: false,
    startedAt: at,
    updatedAt: at,
    steps: {},
  };
  // Windows has no `chmod` worth the name, so the file inherits the directory's ACL and the state
  // says so rather than leaving a reader to assume a mode that was never applied.
  if (platform === 'win32') state.fileModes = 'acl-inherited';
  return state;
}

/**
 * Read the state, or `null` when there is none.
 *
 * A version this build does not know is an error, not something to migrate on the fly: the file may
 * have been written by a newer snowarch whose fields this one would silently drop on the next save.
 */
export function loadState(root) {
  const p = statePath(root);
  if (!existsSync(p)) return null;

  let parsed;
  // A leading BOM is stripped before parsing: Notepad adds one to anything it saves, and a
  // user who opened this file to look at it should not be told it is corrupt.
  try { parsed = JSON.parse(readFileSync(p, 'utf8').replace(/^\uFEFF/, '')); } catch (e) {
    throw new StateError(`.local/bootstrap-state.json is not valid JSON (${e.message}) — `
      + 'run ./snowarch bootstrap --reset to start over');
  }
  const version = parsed?.version;
  if (version > STATE_VERSION) {
    throw new StateError('state file is from a newer snowarch — run ./snowarch upgrade');
  }
  // A missing or nonsensical version is a DIFFERENT problem, and gets a different sentence: telling
  // someone their file is "from a newer snowarch" when it has no version at all sends them to an
  // upgrade that will not help.
  if (!Number.isInteger(version) || version < 1) {
    throw new StateError('.local/bootstrap-state.json has no usable schema version — '
      + 'run ./snowarch bootstrap --reset to start over');
  }
  if (!parsed.steps || typeof parsed.steps !== 'object') parsed.steps = {};
  return parsed;
}

/**
 * Write it, atomically, with the guard in front.
 *
 * The temp name carries the pid so two processes cannot rename over each other's half-written file,
 * and it is removed on failure — a `.tmp` left in `.local/` after a crash is litter a user has to
 * wonder about.
 */
export function saveState(root, state, { now = new Date() } = {}) {
  assertStorable(state);
  const p = statePath(root);
  mkdirSync(join(root, '.local'), { recursive: true, mode: 0o700 });

  const next = { ...state, updatedAt: now.toISOString() };
  const tmp = `${p}.tmp-${process.pid}`;
  try {
    writeFileSync(tmp, `${JSON.stringify(next, null, 2)}\n`, { mode: 0o600 });
    if (process.platform !== 'win32') chmodSync(tmp, 0o600);
    renameSync(tmp, p);
  } catch (e) {
    rmSync(tmp, { force: true });
    throw new StateError(`could not write .local/bootstrap-state.json: ${e.message}`);
  }
  return next;
}

/** `--reset`: the state and the doctor's cache, and nothing else that lives in `.local/`. */
export function resetState(root) {
  const removed = [];
  for (const at of RESET_PATHS) {
    const p = at(root);
    if (existsSync(p)) { rmSync(p, { force: true }); removed.push(p); }
  }
  return removed;
}

/**
 * Which steps would run again, and why.
 *
 * ARC-09-S05. The resume rule lives in the runner — skip a step whose recorded hash still matches —
 * and this is the same question asked from outside, for a user who wants to know what `--resume`
 * is about to do, and for `upgrade` (ARC-09-S07), which needs to say what a new version invalidates
 * before it changes anything.
 *
 * Four reasons, and the fourth is the one that surprises people:
 *
 *   `never-run`        no record — a fresh checkout, or a step added since
 *   `failed`           it ran and did not succeed; a failure is never cached
 *   `inputs-changed`   the hash moved, and `changed` names the inputs that did
 *   `launcher-recorded` the LAUNCHERS record `inputsHash: null` by design (ARC-06-S14): bash and
 *                      PowerShell cannot compute the table, so a Node-free install leaves every
 *                      step unverifiable and the next Node run re-runs B01/B02 as a reconcile.
 *                      Treated as stale, because "no hash" and "a hash that matches" must never be
 *                      the same answer — the same rule the git seam follows about failure.
 */
export function staleSteps(state, ctx, { hashFor, steps = null, alwaysRuns = () => false } = {}) {
  if (typeof hashFor !== 'function') throw new TypeError('staleSteps needs hashFor');
  const ids = steps ?? Object.keys(state?.steps ?? {});
  const out = [];

  for (const step of ids) {
    // A step that runs every time is not STALE — it is unconditional, and listing it would put
    // B00 and B09 in every answer to "what changed". The runner spells the same fact
    // `cacheable = false`; the table spells it as a row with no inputs, and the caller passes
    // whichever it holds. Both also record `inputsHash: null`, which is why this comes first: the
    // launcher rule below must not claim a null that was never going to be a hash.
    if (alwaysRuns(step)) continue;

    const recorded = state?.steps?.[step];
    // A step recorded `skipped` was decided against by `runsWhen` — design-only never installs
    // dependencies — so it holds no result to reuse. It has not run in this checkout, and the
    // detail says which of the two ways that came about.
    if (!recorded || recorded.status === 'skipped') {
      out.push({ step, reason: 'never-run', changed: [], ...(recorded ? { detail: 'skipped' } : {}) });
      continue;
    }
    if (recorded.status !== 'ok') {
      out.push({ step, reason: 'failed', changed: [], detail: recorded.status });
      continue;
    }
    if (recorded.inputsHash === null || recorded.inputsHash === undefined) {
      out.push({ step, reason: 'launcher-recorded', changed: [] });
      continue;
    }

    let current;
    try { current = hashFor(step, ctx); } catch (e) {
      // A row that cannot be hashed is stale, not fatal: the step will run, which is the safe
      // direction, and the reason says what happened rather than crashing a resume.
      out.push({ step, reason: 'inputs-changed', changed: [`unhashable: ${e.message}`] });
      continue;
    }
    if (current !== recorded.inputsHash) {
      out.push({ step, reason: 'inputs-changed', changed: [], now: current, was: recorded.inputsHash });
    }
  }
  return out;
}

/** One line per stale step, in the words the bootstrap's own output uses. */
export function explainStale(stale) {
  const REASON = {
    'never-run': 'has not run in this checkout',
    failed: 'did not succeed last time',
    'inputs-changed': 'its inputs changed',
    'launcher-recorded': 'was recorded by a launcher, which cannot compute the hash',
  };
  return stale.map(({ step, reason, changed = [], detail }) => {
    const why = REASON[reason] ?? reason;
    const extra = changed.length ? ` (${changed.join(', ')})` : (detail ? ` (${detail})` : '');
    return `${step} will run — ${why}${extra}`;
  });
}
