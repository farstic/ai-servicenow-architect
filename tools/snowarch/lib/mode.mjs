// ARC-06-S12 — `snowarch mode`: what this checkout is, and how to change it.
//
// Three forms, and the shape of the command is the point:
//
//   mode              report — the S09 Mode line and the registration kind, nothing written
//   mode live         B00, then the runner; B01–B03 stand on their cached results
//   mode design       B07 and B09 only; the credential store is not touched
//
// `mode live` is deliberately NOT a second bootstrap. It reuses the same registry, the same
// runner, the same state file and the same closing block, and the only thing it decides is which
// steps are in the list — because an installation that can be reached two ways is an installation
// with two behaviours, and the second one is always the less tested.
//
// The `--register` fallback is the other half of the story: on a machine whose policy rejects
// project-scope MCP servers, the same secret-free entry is registered per-checkout (`local`) or,
// as a last resort, per-machine (`user`). Everything to do with `~/.claude.json` goes through
// `registration-claude.mjs`, which calls the CLI that owns that file.
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { EXIT_FAIL, EXIT_OK, EXIT_PREREQ, EXIT_USAGE } from './exit.mjs';
import { loadConfig, root as defaultRoot, version } from './config.mjs';
import { checkLocation, checkMode } from './instance-file.mjs';
import { LIVE_YES_WITHOUT_FILE } from './bootstrap.mjs';
import { CREATED_BY_US, SCOPES, resolveClaude, register as registerServer, serverEntry, unregister }
  from './registration-claude.mjs';
import { LAST, STEPS, interrupt, runSteps } from './steps/index.mjs';
import { readDefaultLabel } from '../../../packages/snowarch/dist/store/label.js';
import { StateError, loadState, saveState } from './state.mjs';
import { instanceKeptNote, modeLine, registrationLine, restartSentence } from './text.mjs';

export const USAGE = [
  'usage: ./snowarch mode [live|design] [options]',
  '',
  '  (no argument)             print the Mode line and the registration kind',
  '  live                      switch this checkout to live: B04–B09, B01–B03 cached',
  '  design                    switch back to design-only; the instance store is kept',
  '',
  '  --register project|local|user   where the MCP server is registered (default: unchanged)',
  '  --ack-user-scope          required by --register user; it affects every project',
  '  --instance-file <path>    read live-mode connection details from a file, once',
  '  --yes                     do not prompt (live needs --instance-file with it)',
  '  --json                    print the result object on stdout',
].join('\n');

/** The refusal, verbatim from the story: user scope is a firewall decision, not a convenience. */
export const USER_SCOPE_REFUSAL =
  'user scope attaches the "servicenow" server to every project on this machine, against the '
  + 'engagement firewall — prefer --register local. Re-run with --ack-user-scope to proceed.';

/** The same sentence with the configured key, for a checkout that renamed the server. */
export const userScopeRefusal = (serverKey) =>
  USER_SCOPE_REFUSAL.replace('"servicenow"', `"${serverKey}"`);

export const NOT_BOOTSTRAPPED =
  'this checkout has not been bootstrapped — run ./bootstrap.sh first (mode switches an existing '
  + 'installation; it does not create one)';

export const storePath = (root) => join(root, '.local', 'instances.json');

/** The label only. Never the store's contents: this file names an instance, it does not open it. */
export function defaultLabel(root, read = readDefaultLabel) {
  const p = storePath(root);
  if (!existsSync(p)) return null;
  return read(p)?.label ?? null;
}

/**
 * The steps each form runs.
 *
 * `live` is the whole registry: B00 is a preflight that always runs, and B01–B03 report
 * `ok (cached)` because their recorded inputs have not changed — which is the runner's own
 * behaviour, not a list maintained here. `design` is two steps and no network: the toggle, and the
 * summary that tells the user what just happened.
 */
export const DESIGN_STEPS = Object.freeze(['B07', 'B09']);

/**
 * The list, from the registry — the one thing this command actually decides.
 *
 * `registry` is a parameter so a test can drive the run with stub steps and still assert THIS
 * function against the real `STEPS`. The alternative — an end-to-end `mode live` in a unit test —
 * would run `npm ci`, a wizard and a handshake to prove a list, and S14's integration suite is
 * where those belong.
 */
export function stepsFor(target, registry = STEPS) {
  return target === 'live'
    ? registry.slice(1)                                   // B00 has already run as the preflight
    : registry.filter((s) => DESIGN_STEPS.includes(s.id));
}

export async function modeCommand({ flags = {}, positional = [], log, root = defaultRoot,
  env = process.env, out = process.stdout, err = process.stderr, cwd = process.cwd(),
  probe = undefined, exec = undefined, execClaude = undefined, claudePath = undefined,
  readLabel = readDefaultLabel, registry = STEPS } = {}) {
  const config = loadConfig(root);
  const serverKey = config.mcp.serverKey;
  const refuse = (message, code = EXIT_USAGE) => { log.fail(message); return code; };

  const target = positional[0];
  if (target !== undefined && target !== 'live' && target !== 'design') {
    return refuse(`mode takes live or design, not "${target}"`);
  }
  if (flags.register !== undefined && !SCOPES.includes(flags.register)) {
    return refuse(`--register must be ${SCOPES.join(', ')}, not "${flags.register}"`);
  }
  // Checked before anything is read or written, like S03's equivalent: a refusal must leave the
  // checkout as it found it.
  if (flags.register === 'user' && !flags['ack-user-scope']) {
    return refuse(userScopeRefusal(serverKey));
  }

  let state;
  try { state = loadState(root); } catch (e) {
    if (!(e instanceof StateError)) throw e;
    return refuse(e.message, e.code);
  }
  if (!state) return refuse(NOT_BOOTSTRAPPED, EXIT_PREREQ);

  if (target === undefined) return report({ state, root, flags, log, readLabel });

  const wantsLive = target === 'live';
  const hasStore = existsSync(storePath(root));
  // Criterion 7. The same sentence S03 prints, imported rather than repeated: there is one reason
  // this combination cannot work and it should not have two phrasings.
  if (wantsLive && flags.yes && !flags['instance-file'] && !hasStore) {
    return refuse(LIVE_YES_WITHOUT_FILE);
  }
  if (flags['instance-file']) {
    const path = flags['instance-file'];
    if (!existsSync(path)) return refuse(`${path} does not exist`);
    const mode = checkMode(path);
    if (!mode.ok) return refuse(mode.reason, EXIT_FAIL);
    const location = checkLocation(path, root);
    if (!location.ok) return refuse(location.reason, EXIT_FAIL);
  }

  // The registration is settled BEFORE the steps run, because B07 writes the toggles from
  // `state.registration`: a local registration made after B07 would leave the project entry
  // enabled and both would load.
  if (flags.register !== undefined) {
    const changed = await changeRegistration({
      root, serverKey, scope: flags.register, state, log,
      exec: execClaude, env, claudePath, config,
    });
    if (!changed.ok) return refuse(changed.reason, changed.code ?? EXIT_FAIL);
    // Saved HERE, not with the rest of the run.
    //
    // `~/.claude.json` has already changed. If B00 then fails — no network, Node gone — a state
    // file that still said `project` would disown an entry this tool had just created, and the
    // undo (`--register project`) refuses to remove what it does not own. The orphan would
    // outlive the failure, and only `claude mcp get` would ever mention it.
    saveState(root, state);
  }

  const node = { present: true, version: process.versions.node,
    major: Number(process.versions.node.split('.')[0]) };
  const mode = wantsLive ? 'live' : 'design-only';
  const ctx = {
    root, config, env, node,
    // The docs decision is the one already recorded. `mode live` is not a docs command, and
    // passing anything else here would make B02 re-sync a corpus nobody asked about.
    docs: state.docs?.mode ?? 'skip',
    areaCount: 0,
    instanceFile: flags['instance-file'] ?? null,
    skipClaudeCheck: Boolean(flags['skip-claude-check']),
    mode,
    state,
    ...(readLabel === readDefaultLabel ? {} : { readLabel }),
  };
  state.mode = mode;
  state.node = node;
  state.engineVersion = version(root);

  const lines = [];
  const onLine = (line) => { lines.push(line); log.step(line); };
  const live = { child: null, step: null };

  if (wantsLive) {
    // B00 first and alone, exactly as `bootstrap` runs it: a machine that cannot reach github.com
    // or has lost Node must not be told it is now live.
    const preflight = await runSteps({
      root, ctx: { ...ctx, cwd, probe, exec }, state, steps: [registry[0]], last: LAST, onLine,
      save: () => {},
    });
    if (preflight.code !== EXIT_OK) return preflight.code;
  }

  const onSigint = () => {
    const r = interrupt({ root, state, live, onLine });
    process.exit(r.code);
  };
  process.on('SIGINT', onSigint);
  let outcome;
  try {
    outcome = await runSteps({
      root, ctx: { ...ctx, cwd, probe, exec }, state, live, last: LAST, onLine,
      steps: stepsFor(target, registry),
    });
  } finally {
    process.off('SIGINT', onSigint);
  }
  saveState(root, state);

  const closing = closingBlock({ outcome, state, root, serverKey, wantsLive, env, readLabel });
  if (flags.json) {
    log.json({
      mode: state.mode,
      registration: state.registration,
      steps: state.steps,
      summary: { ok: outcome.summary.ok, warn: outcome.summary.warn,
        fail: outcome.summary.fail, skipped: outcome.summary.skipped },
      next: closing,
    });
  } else {
    for (const line of closing.split('\n')) log.step(line);
  }
  return outcome.code === EXIT_OK ? EXIT_OK : EXIT_FAIL;
}

/**
 * What the run ends with: B09's block, plus the one sentence that is specific to a mode SWITCH.
 *
 * A fresh install ends with "run `claude` here"; a switch ends with "restart the one you have
 * open", because the session that is already running has read its MCP configuration and nothing
 * this command did reached it.
 */
export function closingBlock({ outcome, state, root, serverKey, wantsLive, env,
  readLabel = readDefaultLabel }) {
  const parts = [];
  if (outcome.stoppedAt) {
    return `stopped at ${outcome.stoppedAt} — fix the cause above and re-run`;
  }
  if (outcome.next) parts.push(outcome.next);
  if (!wantsLive) parts.push(instanceKeptNote({ label: defaultLabel(root, readLabel), env }));
  parts.push(restartSentence(serverKey));
  return parts.join('\n');
}

/** `mode` with no argument: two lines, or the object. Reads the state; writes nothing. */
function report({ state, root, flags, log, readLabel }) {
  const label = defaultLabel(root, readLabel);
  const instance = state.mode === 'live' && label
    ? { label, environment: state.instance?.environment ?? 'unknown',
      preset: state.instance?.preset ?? 'unknown' }
    : null;
  const line = modeLine({ mode: state.mode, instance: state.steps?.B08?.data?.instance ?? instance });
  if (flags.json) {
    log.json({
      mode: state.mode,
      modeLine: line,
      registration: state.registration,
      registrationLine: registrationLine(state.registration),
      defaultInstance: label,
    });
    return EXIT_OK;
  }
  log.step(line);
  log.step(registrationLine(state.registration));
  return EXIT_OK;
}

/**
 * Add or remove the `~/.claude.json` entry, and record what happened in the state.
 *
 * `--register project` is the undo, and it removes ONLY an entry this tool created — the state's
 * `registrationReason` is the proof. An entry from an older install, or one the user made by
 * hand, is left alone with the command printed: ARC-08-S03 is where leftovers are reported, and a
 * tool that deletes configuration it did not create is a tool nobody runs twice.
 */
export async function changeRegistration({ root, serverKey, scope, state, log, exec, env,
  claudePath = undefined, config }) {
  const previous = state.registration ?? 'project';
  const ownedByUs = state.registrationReason === CREATED_BY_US;
  const path = claudePath === undefined ? resolveClaude({ env }) : claudePath;
  const opts = { root, claudePath: path, env, ...(exec ? { exec } : {}) };

  if (scope === previous && scope !== 'project') {
    log.step(`registration: already ${scope} — nothing to change`);
    return { ok: true, changed: false };
  }

  if (scope === 'project') {
    if (previous === 'project') {
      log.step('registration: already project (.mcp.json) — nothing to change');
      return { ok: true, changed: false };
    }
    const removed = unregister({ ...opts, serverKey, scope: previous, ownedByUs });
    if (!removed.ok && !removed.skipped) return { ok: false, reason: removed.reason };
    // A skipped removal is not a failure: the user asked to go back to the project entry, and the
    // toggles below do exactly that. The entry we refused to touch is named in the note.
    if (removed.skipped) log.warn(removed.reason);
    state.registration = 'project';
    state.registrationReason = 'default';
    log.step(`registration: project (.mcp.json)${removed.skipped ? '' : ` — removed the ${previous}-scope entry`}`);
    return { ok: true, changed: true };
  }

  let entry;
  try { entry = serverEntry(root, serverKey); } catch (e) { return { ok: false, reason: e.message }; }
  const result = registerServer({ ...opts, serverKey, scope, entry });
  if (!result.ok) return { ok: false, reason: result.reason };
  state.registration = scope;
  state.registrationReason = CREATED_BY_US;
  log.step(`registration: ${scope} — "${serverKey}" registered with claude mcp add-json -s ${scope}`);
  return { ok: true, changed: true, entry: result.entry };
}
