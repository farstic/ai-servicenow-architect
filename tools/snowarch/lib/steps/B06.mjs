// B06 instance — the slot ARC-07's wizard drops into, and the operator path that works today.
//
// Two ways in, and they are genuinely different jobs. The INTERACTIVE path hands the terminal to
// the wizard by SPAWNING it with inherited stdio — not by importing it — because the wizard reads
// raw-mode keystrokes and masks a password, and a library called in-process cannot own a TTY the
// bootstrap is also using. The NON-INTERACTIVE path never has a terminal at all: it reads a 0600
// file, probes once, and writes the store.
//
// Everything that needs `node_modules` is imported LAZILY. `dist/cli/index.js` and the store's
// schema module both exist only after B04, and a design-only run — which never reaches this step —
// must still be able to load the module. A test asserts that nothing here is imported at load time.
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { codeForStatus, probeAuth } from '../probe-auth.mjs';
import { readInstanceFile, SENTENCE } from '../instance-file.mjs';
import { childEnv } from '../spawn-env.mjs';
import { TEXT } from './inputs.mjs';
import { INPUTS } from '../inputs.mjs';

export const id = 'B06';
export const title = 'instance';
export const needsNode = true;
/**
 * Live mode, OR a store that is already there (ARC-09-S06).
 *
 * A design-only checkout that still carries a `.local/instances.json` is not a hypothetical: it is
 * what a user has after `mode design`, and what S07's upgrade harness is. That file must stay
 * LOADABLE across an upgrade, which means a schema change has to reach it in either mode — and the
 * step that reaches it is this one. Without the second clause, upgrading a design-only checkout
 * would leave the store a version behind and the next `mode live` would meet a schema it cannot
 * read, in the place least able to explain it.
 */
export const runsWhen = (ctx) => ctx.mode === 'live' || storeExists(ctx.root);
export const skipReason = 'design-only';

export const MIGRATION_FAILED =
  'the store migration did not complete — run ./snowarch store migrate to see why; '
  + 'nothing was changed and a backup was written if the migration had started';

export const NO_TERMINAL =
  'no terminal for the instance wizard — run ./snowarch instance add in an interactive terminal, '
  + 'or pass --instance-file <path> (see docs/INSTALL.md "Operators and CI")';
export const WIZARD_ABSENT =
  'instance wizard not available in this build — run ./bootstrap.sh again after upgrading';

const CLI = join('packages', 'snowarch', 'dist', 'cli', 'index.js');

// ARC-09-S05: the declaration lives in `lib/inputs.mjs`. Ten steps answering "what are my
// inputs" in ten files is ten places to get the resume rule wrong, and no way to show a user the
// set — the table is one answer, and `docs/ARCHITECTURE.md` renders from it.
export const inputs = INPUTS.B06.resolve;

// `root` guarded: `runsWhen` is called with whatever ctx a caller has, and a step selector that
// threw on a ctx without a root would turn "which steps run" into a crash.
export const storeExists = (root) => Boolean(root) && existsSync(join(root, '.local', 'instances.json'));

function shapeOf(root) {
  const p = join(root, '.local', 'instances.json');
  if (!existsSync(p)) return { present: false, version: null };
  try {
    // Presence and schema version only. This file holds credentials, and a hash input that read
    // further would put one a careless line away from the log.
    const text = readFileSyncSafe(p);
    const v = text === null ? null : JSON.parse(text)?.version;
    return { present: true, version: Number.isInteger(v) ? v : null };
  } catch { return { present: true, version: null }; }
}

function readFileSyncSafe(p) {
  try { return readFileSync(p, 'utf8'); } catch { return null; }
}

/** Does the built CLI advertise `instance add`? Asked before spawning, so the failure is named. */
export function wizardAvailable(root, { run = spawnSync } = {}) {
  const cli = join(root, CLI);
  if (!existsSync(cli)) return false;
  const r = run(process.execPath, [cli, 'instance', '--help'],
    { encoding: 'utf8', stdio: 'pipe', cwd: root, env: childEnv(root) });
  return /\badd\b/.test(`${r.stdout ?? ''}${r.stderr ?? ''}`);
}

/**
 * The file path: read, propose, probe once, save.
 *
 * The probe comes before the save and there is no retry: a non-interactive run has nobody to ask
 * for a corrected password, so a second attempt is the same wrong credential sent again — noise in
 * the instance's audit log, and on some configurations a lockout.
 */
export async function fromInstanceFile(ctx) {
  const contract = ctx.contract ?? JSON.parse(
    readFileSyncSafe(join(ctx.root, 'packages', 'snowarch', 'dist', 'contract.json')) ?? '{}');

  const file = await readInstanceFile(ctx.instanceFile, { root: ctx.root, contract,
    ...(ctx.plat ? { plat: ctx.plat } : {}), ...(ctx.gitRun ? { gitRun: ctx.gitRun } : {}) });
  if (!file.ok) return { status: 'fail', detail: file.reason, remedy: null };

  for (const note of file.notes) ctx.line?.(note);
  if (file.modeNote) ctx.line?.(`note: ${file.modeNote}`);

  const probe = ctx.probeAuth ?? probeAuth;
  for (const [label, entry] of Object.entries(file.store.instances)) {
    const result = await probe({ url: entry.url, username: entry.auth.username,
      password: entry.auth.password, ...(ctx.env ? { env: ctx.env } : {}) });
    if (!result.ok) {
      return { status: 'fail', remedy: null,
        detail: result.code === codeForStatus(401)
          ? SENTENCE.authFailed(label)
          : `${result.code} for "${label}" — nothing saved${result.detail ? ` (${result.detail})` : ''}` };
    }
  }

  const { saveStore } = await import('../../../../packages/snowarch/dist/store/index.js');
  const { completeFlags } = await import('../../../../packages/snowarch/dist/store/schema.js');
  const { expandPreset } = await import('../../../../packages/contract/lib/contract.mjs');

  // Every saved entry carries all six flags as byte-exact strings: the loader would fill the gaps
  // and warn, and a store written by the bootstrap should not be one the doctor has to correct.
  const instances = Object.fromEntries(Object.entries(file.store.instances).map(([label, e]) => [
    label,
    { ...e, flags: completeFlags(e.preset === 'custom' ? e.flags : expandPreset(contract, e.preset)) },
  ]));

  saveStore(join(ctx.root, '.local', 'instances.json'),
    { version: file.store.version, defaultInstance: file.defaultInstance, instances });

  ctx.line?.(SENTENCE.stillThere(ctx.instanceFile));
  const labels = Object.keys(instances);
  return {
    status: 'ok',
    detail: `${labels.length} instance(s) saved from the file`,
    // Labels are not secrets, but nothing about the URL, the user or the credential goes here.
    data: { saved: labels.length, defaultInstance: file.defaultInstance,
      probes: 'auth ok · others not probed' },
  };
}

/**
 * A store whose schema is behind gets MIGRATED — never re-wizarded.
 *
 * This is the branch the whole of S06 exists for. "Something about the store changed" has exactly
 * one safe answer when the thing that changed is its SHAPE, and re-running the wizard over
 * somebody's credentials is not it. The migration runs through the built CLI with `--yes` (the
 * plan was already shown and accepted at the bootstrap's own plan screen), writes its 0600 backup
 * and never touches a credential value.
 */
export async function migrateIfBehind(ctx) {
  const shape = shapeOf(ctx.root);
  if (!shape.present) return null;

  const current = await storeSchemaVersion(ctx.root);
  if (current === null || shape.version === null || shape.version === current) return null;
  if (shape.version > current) {
    // A store from the FUTURE is not this step's to fix: downgrading it would mean discarding
    // whatever the newer build added. The doctor's SV-09 says the same thing with the command.
    return { status: 'warn', remedy: null,
      detail: `store schema v${shape.version} is newer than this build's v${current} — `
        + 'run ./snowarch upgrade' };
  }

  const spawn = ctx.spawn ?? spawnSync;
  const r = spawn(process.execPath, [join(ctx.root, CLI), 'store', 'migrate', '--yes'],
    { stdio: 'inherit', cwd: ctx.root, env: childEnv(ctx.root) });
  if (r.status !== 0) return { status: 'fail', detail: MIGRATION_FAILED, remedy: null };
  return { status: 'ok', detail: `store schema v${shape.version} → v${current} (migrated)`,
    data: { migratedFrom: shape.version, migratedTo: current } };
}

/** The schema this BUILD reads, from the contract — the same number S05's B06 row hashes. */
async function storeSchemaVersion(root) {
  const p = join(root, 'packages', 'snowarch', 'dist', 'contract.json');
  const text = readFileSyncSafe(p);
  if (text === null) return null;
  try {
    const v = JSON.parse(text)?.storeSchemaVersion;
    return Number.isInteger(v) ? v : null;
  } catch { return null; }
}

export const run = async (ctx) => {
  // BEFORE the instance-file and wizard paths, because both write a store and this decides
  // whether the store that is already there can be read at all.
  const migrated = await migrateIfBehind(ctx);
  if (migrated && migrated.status !== 'ok') return migrated;
  if (migrated) return migrated;

  if (ctx.instanceFile) return fromInstanceFile(ctx);

  // A design-only checkout reaches this step only because a store exists (`runsWhen`), and with
  // the store current there is nothing else here to do: the wizard is live mode's business.
  if (ctx.mode !== 'live') {
    return { status: 'ok', detail: 'store present and current; no wizard in design-only mode' };
  }

  const interactive = ctx.isTTY ?? Boolean(process.stdin.isTTY);
  if (!interactive) return { status: 'fail', detail: NO_TERMINAL, remedy: null };

  if (!wizardAvailable(ctx.root, ctx.spawn ? { run: ctx.spawn } : {})) {
    return { status: 'fail', detail: WIZARD_ABSENT, remedy: null };
  }

  // The terminal is handed over wholesale: the wizard prints its own secret-free summary, and this
  // step deliberately learns nothing from it beyond the exit code and what the STORE says
  // afterwards — never a URL, a username or a credential.
  const spawn = ctx.spawn ?? spawnSync;
  const r = spawn(process.execPath, [join(ctx.root, CLI), 'instance', 'add', '--from-bootstrap'],
    // The wizard writes the store; it must write THIS checkout's.
    { stdio: 'inherit', cwd: ctx.root, env: childEnv(ctx.root) });
  if (r.status !== 0) {
    return { status: 'fail', remedy: null,
      detail: `the instance wizard exited ${r.status ?? 'abnormally'} — nothing was saved by B06` };
  }

  const { readDefaultLabel } = await import('../../../../packages/snowarch/dist/store/label.js');
  const label = readDefaultLabel(join(ctx.root, '.local', 'instances.json'));
  return { status: 'ok', detail: label ? `default instance "${label.label}"` : 'wizard completed',
    data: { saved: label ? 1 : 0, defaultInstance: label?.label ?? null } };
};
