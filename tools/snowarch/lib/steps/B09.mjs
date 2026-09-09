// B09 summary — one verdict, one Mode line, and the exact next thing to type.
//
// The last five lines are the only part of the installation most people will read twice, and two of
// them are promises: the `Mode:` line is quoted back by the banner and by `/snowarch status`, and
// the dialog count is a claim about what happens thirty seconds from now. Both come from
// `lib/text.mjs`, which is also what the Node-free launchers print — one definition, four readers.
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { contractSha, version as engineVersion } from '../config.mjs';
import { writeDoctorCache } from '../doctor-cache.mjs';
import { childEnv } from '../spawn-env.mjs';
import { EXPECTED_DIALOGS, summaryBlock } from '../text.mjs';
import { which } from '../which.mjs';

export const id = 'B09';
export const title = 'summary';
export const needsNode = false;
export const runsWhen = () => true;
/** Never cached: it reports on the run that just happened, so a cached one describes another. */
export const cacheable = false;
export const inputs = () => [];

/** The steps whose results the design-only cache carries, so the first banner has something real. */
export const DESIGN_CACHE_STEPS = Object.freeze(['B01', 'B02', 'B05', 'B07']);

/**
 * `./snowarch doctor --quick --json` when that sub-command exists; this run's own tally otherwise.
 *
 * ARC-08 has not been written, and B09 must still print a number. Counting its own steps is not a
 * placeholder for the doctor — it is the honest answer to "what does this run know", and it is
 * replaced the moment there is something better to ask.
 */
export function doctorCounts(state, { root, run = spawnSync, hasDoctor = null } = {}) {
  const available = hasDoctor ?? Boolean(which('snowarch', { env: process.env }));
  if (available) {
    const r = run(process.execPath, [join(root, 'tools/snowarch/bin/snowarch.mjs'),
      'doctor', '--quick', '--json'],
    { encoding: 'utf8', stdio: 'pipe', cwd: root, env: childEnv(root) });
    try {
      const parsed = JSON.parse(r.stdout ?? '{}');
      if (parsed?.summary) return { ...parsed.summary, source: 'doctor' };
    } catch { /* fall through to this run's own tally */ }
  }
  const counts = { ok: 0, warn: 0, fail: 0, source: 'bootstrap' };
  for (const entry of Object.values(state.steps ?? {})) {
    if (entry.status === 'ok') counts.ok += 1;
    else if (entry.status === 'warn') counts.warn += 1;
    else if (entry.status === 'fail' || entry.status === 'failed') counts.fail += 1;
  }
  return counts;
}

/** B01's cloud-sync note and B02's dead citations — the two worth saying twice. */
export function warningsFrom(state) {
  const out = [];
  const cloud = state.steps?.B01?.data?.cloudSync;
  if (cloud) out.push(cloud);
  const b02 = state.steps?.B02;
  if (b02?.status === 'warn' && b02.detail) out.push(b02.detail);
  return out;
}

export const run = async (ctx) => {
  const state = ctx.state;
  const counts = doctorCounts(state, { root: ctx.root,
    ...(ctx.runDoctor ? { run: ctx.runDoctor } : {}),
    ...(ctx.hasDoctor === undefined ? {} : { hasDoctor: ctx.hasDoctor }) });

  const instance = instanceFrom(state);
  const block = summaryBlock({
    mode: ctx.mode,
    instance,
    counts,
    nodeUsable: ctx.node?.present !== false,
    dialogs: EXPECTED_DIALOGS,
    serverKey: ctx.config.mcp.serverKey,
    platform: ctx.plat,
    env: ctx.env,
    warnings: warningsFrom(state),
  });

  // Design-only runs never reach B08, so the banner would have no cache at all on a first install.
  // Live runs already have one, and overwriting it here would replace a handshake's findings with
  // a summary's.
  if (ctx.mode !== 'live' && !existsSync(join(ctx.root, '.local', 'doctor-last.json'))) {
    writeDoctorCache(ctx.root, {
      mode: ctx.mode,
      engineVersion: engineVersion(ctx.root),
      contractSha: contractSha(ctx.root)?.slice(0, 12) ?? null,
      checks: DESIGN_CACHE_STEPS
        .filter((step) => state.steps?.[step])
        .map((step) => ({ id: step, status: normalise(state.steps[step].status),
          detail: state.steps[step].detail ?? '' })),
    });
  }

  // The block is RETURNED, not printed here: the runner prints a step's line after `run()`
  // returns, so a block written from inside would be followed by `[B09/09] summary … ok` and the
  // closing five lines would not be the last five. The caller prints it once the step line is out.
  return { status: 'ok', detail: `${counts.ok} ok, ${counts.warn} warn, ${counts.fail} fail`,
    data: { counts: { ok: counts.ok, warn: counts.warn, fail: counts.fail },
      source: counts.source, dialogs: EXPECTED_DIALOGS },
    next: block };
};

/** The label, environment and preset — the three fields that are not secrets. */
function instanceFrom(state) {
  const i = state.steps?.B08?.data?.instance ?? state.instance ?? null;
  if (i?.label) return { label: i.label, environment: i.environment, preset: i.preset };
  return null;
}

/** The cache's vocabulary is ok/warn/fail; the state also uses `failed` for an interrupt. */
const normalise = (status) => (status === 'failed' ? 'fail' : status);
