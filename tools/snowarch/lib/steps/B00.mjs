// B00 preflight — every prerequisite, checked before anything is installed.
//
// Two rules shape this step, and both come from watching installers get it wrong:
//
//   EVERY CHECK RUNS, even after one has failed. An operator who is missing git AND behind a
//   TLS-intercepting proxy should learn both in one pass, not discover the second after fixing the
//   first. So nothing short-circuits; the failures are collected and counted at the end.
//
//   EVERY FAILURE NAMES ITS REMEDY. "Prerequisite missing" is a status, not help. The sentences
//   live in `remedies.json` because the Node-free launchers print the same ones (S10/S11) and the
//   doctor quotes them (ARC-08) — one wording, three programs.
//
// This step runs BEFORE the plan screen and is never cached: it decides whether the machine can run
// the others, and a cached "yes" from last week is exactly the answer nobody wants after Node has
// been uninstalled.
import { execFileSync } from 'node:child_process';
import { realpathSync, statfsSync } from 'node:fs';
import { arch, platform, release } from 'node:os';
import { posix, resolve, win32 } from 'node:path';
import { EXIT_PREREQ } from '../exit.mjs';
import { remedyFor } from '../remedies.mjs';
import { formatVersion, meetsFloor, parseVersion } from '../versions.mjs';
import { MODE } from '../docs/sync.mjs';
import { probeNetwork } from '../probe-net.mjs';
import { which } from '../which.mjs';

export const id = 'B00';
export const title = 'preflight';
export const needsNode = false;
export const runsWhen = () => true;
export const cacheable = false;
export const inputs = () => [];

/** Disk. Not a configured floor — it is what this repository costs, and the numbers are its own. */
const GIB = 1024 ** 3;
export const DISK_SPARSE = 1 * GIB;      // sparse docs ≈ 300 MB + deps ≈ 72 MB + headroom
export const DISK_FULL = 1.5 * GIB;      // `--docs full` is the whole corpus

const mb = (bytes) => `${Math.round(bytes / (1024 * 1024))} MB`;
const gb = (bytes) => `${(bytes / GIB).toFixed(1)} GB`;

/**
 * Run a tool by its RESOLVED path.
 *
 * `which` first, then spawn the file — never a bare name, which on Windows sends `child_process`
 * through a shell to resolve `.cmd`, and never `npx`, which would reach the network from the step
 * whose job is to find out whether the network works.
 */
export function makeExec({ env = process.env, plat = process.platform } = {}) {
  return (name, args) => {
    const bin = which(name, { env, platform: plat });
    if (!bin) return { found: false, ok: false, stdout: '', stderr: '' };
    try {
      const stdout = execFileSync(bin, args, { encoding: 'utf8', stdio: 'pipe', timeout: 10_000 });
      return { found: true, ok: true, stdout, stderr: '', bin };
    } catch (e) {
      return { found: true, ok: false, stdout: String(e.stdout ?? ''),
        stderr: String(e.stderr ?? e.message ?? ''), bin };
    }
  };
}

const ok = (id2, detail, extra = {}) => ({ id: id2, status: 'ok', detail, ...extra });
const warn = (id2, detail, remedy = null) => ({ id: id2, status: 'warn', detail, remedy });
const fail = (id2, detail, remedy, extra = {}) => ({ id: id2, status: 'fail', detail, remedy, ...extra });

/**
 * 1. The working directory is the checkout, and git agrees it is a repository root.
 *
 * Paths are compared through `realpath`. `resolve` alone is not enough: on macOS `/tmp` and
 * `/var` are symlinks, home directories are often symlinked on managed machines, and git always
 * reports the resolved path — so a checkout reached through a link compared unequal to itself and
 * the user was told to `cd` to the directory they were already standing in.
 */
export const samePath = (a, b, plat = process.platform) => {
  const norm = (p) => {
    let x = String(p).trim();
    // `realpath` first: on macOS `/tmp` and `/var` are symlinks, managed machines symlink home
    // directories, and git always reports the resolved path.
    try { x = realpathSync(x); } catch { /* a path that does not exist yet still normalises */ }
    // Then the PLATFORM'S OWN resolver, chosen by the parameter rather than by which machine is
    // running. `path.resolve` is whichever flavour the host is, so on macOS it leaves
    // `C:/Users/...` untouched and the Windows branch could not be exercised anywhere but
    // Windows — which is how it shipped broken: git prints forward slashes there, Node hands
    // back backslashes, and every command exited 3 saying "not at the repository root".
    // Windows paths are also case-insensitive, so `D:\A\repo` and `D:\a\repo` are one place.
    if (plat === 'win32') return win32.resolve(x.replace(/\//g, '\\')).toLowerCase();
    return posix.resolve(x);
  };
  return norm(a) === norm(b);
};

export function checkRoot({ root, cwd, exec, plat }) {
  const remedy = remedyFor('root', { platform: plat, values: { root } });
  if (!samePath(cwd, root, plat)) {
    return fail('root', `not at the repository root — run: ${remedy}`, remedy);
  }
  const top = exec('git', ['-C', root, 'rev-parse', '--show-toplevel']);
  if (!top.found || !top.ok) {
    // git's own absence is check 2's finding, not this one's — reporting it twice would have the
    // operator fix one problem and see two lines about it.
    return warn('root', `${root} (git could not confirm the repository root)`);
  }
  if (!samePath(top.stdout.trim(), root, plat)) {
    return fail('root', `not at the repository root — run: ${remedy}`, remedy);
  }
  return ok('root', root);
}

/** 2. git, at or above the configured floor. */
export function checkGit({ exec, floors, plat }) {
  const remedy = remedyFor('git', { platform: plat });
  const r = exec('git', ['--version']);
  if (!r.found) return fail('git', 'git not found', remedy);
  const { ok: passes, found } = meetsFloor(r.stdout, floors.git);
  if (!found) return fail('git', `git version not understood: ${r.stdout.trim()}`, remedy);
  if (!passes) {
    // The reason is built from the configured floor, never from a number typed here: ADR-0008 is
    // why the floor is what it is, and if the floor moves this sentence has to move with it.
    return fail('git', `git ${formatVersion(found)} found, ≥ ${floors.git} required `
      + `(below ${floors.git}, \`sparse-checkout set --cone\` stores \`--cone\` as a pattern)`, remedy);
  }
  return ok('git', formatVersion(found));
}

/**
 * 3. Claude Code, and whether it is logged in.
 *
 * The login probe is attempted only when the installed CLI advertises the sub-command, and never
 * fails the run: signing in is Claude Code's own first-run flow, and a preflight that refused to
 * install an engine because the user had not signed in yet would be refusing the wrong thing.
 */
export function checkClaudeCode({ exec, floors, plat, skip }) {
  if (skip) return warn('claudeCode', 'Claude Code check skipped (--skip-claude-check)');
  const remedy = remedyFor('claudeCode', { platform: plat });
  const r = exec('claude', ['--version']);
  if (!r.found) {
    return fail('claudeCode',
      `Claude Code not found on PATH — install it from https://code.claude.com/docs/en/setup, `
      + 'then re-run', remedy);
  }
  const { ok: passes, found } = meetsFloor(r.stdout, floors.claudeCode);
  if (!found) return fail('claudeCode', `Claude Code version not understood: ${r.stdout.trim()}`, remedy);
  if (!passes) {
    return fail('claudeCode', `Claude Code ${formatVersion(found)} found, ≥ ${floors.claudeCode} `
      + 'required (tool-list refresh after a registration change)', remedy);
  }

  const help = exec('claude', ['--help']);
  if (!help.ok || !/\bauth\b/.test(`${help.stdout}${help.stderr}`)) {
    return ok('claudeCode', `${formatVersion(found)} · login: not verified `
      + '(claude auth status unavailable)');
  }
  const auth = exec('claude', ['auth', 'status']);
  return auth.ok
    ? ok('claudeCode', `${formatVersion(found)} · login: ok`)
    : warn('claudeCode', 'Claude Code is not logged in — run: claude', 'claude');
}

/** 4. Enough disk for the corpus, the dependencies and some headroom. */
export function checkDisk({ root, docs, plat, statfs = statfsSync }) {
  // `MODE.full` rather than the word: it is ARC-03's vocabulary for a checkout shape, and it is
  // also spelled like a preset the contract owns, so a quoted copy here is the wrong kind of name.
  const need = docs === MODE.full ? DISK_FULL : DISK_SPARSE;
  let free;
  try {
    const s = statfs(root);
    free = Number(s.bavail) * Number(s.bsize);
  } catch (e) {
    return warn('disk', `free space not measured (${e.code ?? e.message})`);
  }
  if (free < need) {
    const remedy = remedyFor('disk', { platform: plat,
      values: { needed: mb(need - free), mount: root } });
    return fail('disk', `${gb(free)} free, ${gb(need)} needed`, remedy);
  }
  return ok('disk', `${gb(free)} free`);
}

/** 5. github.com, through whatever the environment puts in the way. */
export async function checkNetwork({ env, plat, probe = probeNetwork, target }) {
  const r = await probe({ env, ...(target ? { target } : {}) });
  if (r.ok) {
    return ok('network', `github.com reachable (HTTP ${r.status})`
      + (r.proxy ? ` via proxy ${r.proxy}` : ''));
  }
  return fail('network', r.detail, remedyFor('network', { platform: plat }));
}

/**
 * 6. Node and npm — a FAIL only when live mode was asked for.
 *
 * Design-only needs no Node at all: the launchers do that path themselves. So an absent Node is a
 * `note:` there and a hard stop only when the operator asked for the mode that cannot work without
 * it. Saying "install Node" to someone who does not need it is how installers earn their reputation.
 */
export function checkNode({ exec, floors, plat, mode }) {
  const remedy = remedyFor('node', { platform: plat });
  const live = mode === 'live';
  // `usable` is recorded separately from the STATUS, because the two answer different questions:
  // an absent Node is a `note` in design-only (status ok) and still means live mode cannot run.
  // The plan screen reads this to decide whether it may offer live at all — parsing it back out of
  // the sentence, which is what the first version did, is a sentence away from being wrong.
  const missing = (detail) => (live
    ? fail('node', `live mode needs Node.js ${parseVersion(floors.node).major}+ — ${remedy}`, remedy,
      { usable: false })
    : ok('node', `note: ${detail}`, { usable: false }));

  const r = exec('node', ['--version']);
  if (!r.found) {
    return missing(`Node.js not found — design-only only; live mode needs Node `
      + `${parseVersion(floors.node).major}+ (${remedy})`);
  }
  const { ok: passes, found } = meetsFloor(r.stdout, floors.node);
  if (!found || !passes) {
    return missing(`Node.js ${formatVersion(found) ?? r.stdout.trim()} found, `
      + `≥ ${floors.node} needed for live mode (${remedy})`);
  }
  const npm = exec('npm', ['--version']);
  if (!npm.found || !npm.ok) {
    return missing(`Node.js ${formatVersion(found)} found but npm is not on PATH (${remedy})`);
  }
  return ok('node', `${formatVersion(found)} · npm ${parseVersion(npm.stdout)
    ? formatVersion(parseVersion(npm.stdout)) : npm.stdout.trim()}`, { usable: true });
}

/** 7. What machine this is — recorded for B09 and the doctor; only 32-bit is worth a warning. */
export function checkPlatform({ plat, cpu = arch(), rel = release() }) {
  const detail = `${plat} ${cpu} ${rel}`;
  return cpu.includes('32') || cpu === 'ia32'
    ? warn('platform', `${detail} — 32-bit`, remedyFor('platform', { platform: plat }))
    : ok('platform', detail);
}

/** All seven, in order, none of them short-circuiting. */
export async function runChecks(ctx) {
  const exec = ctx.exec ?? makeExec({ env: ctx.env, plat: ctx.plat });
  const common = { ...ctx, exec };
  return [
    checkRoot(common),
    checkGit(common),
    checkClaudeCode(common),
    checkDisk(common),
    await checkNetwork(common),
    checkNode(common),
    checkPlatform(common),
  ];
}

/** `ok B00 git: 2.39.5` · `WARN B00: …` · `FAIL B00: …` — the story's forms, one per check. */
export function checkLine(check) {
  if (check.status === 'ok') return `ok B00 ${check.id}: ${check.detail}`;
  return `${check.status === 'warn' ? 'WARN' : 'FAIL'} B00: ${check.detail}`;
}

export const run = async (ctx) => {
  const plat = ctx.plat ?? process.platform;
  const checks = await runChecks({
    root: ctx.root, cwd: ctx.cwd ?? process.cwd(), env: ctx.env ?? process.env,
    floors: ctx.config.floors, docs: ctx.docs, mode: ctx.mode, plat,
    skip: Boolean(ctx.skipClaudeCheck), exec: ctx.exec, probe: ctx.probe, statfs: ctx.statfs,
    target: ctx.env?.SNOWARCH_TEST_NET_URL,
  });

  for (const c of checks) {
    ctx.line?.(checkLine(c));
    if (c.remedy && c.status !== 'ok') ctx.line?.(`Remedy: ${c.remedy}`);
  }

  const failures = checks.filter((c) => c.status === 'fail');
  const versionOf = (cid) => parseVersion(checks.find((c) => c.id === cid)?.detail ?? '');
  const data = {
    node: formatVersion(versionOf('node')),
    git: formatVersion(versionOf('git')),
    claudeCode: formatVersion(versionOf('claudeCode')),
    platform: plat, arch: arch(), release: release(),
    nodeUsable: checks.find((c) => c.id === 'node')?.usable === true,
    checks: Object.fromEntries(checks.map((c) => [c.id, c.status])),
  };

  if (failures.length > 0) {
    return { status: 'fail', code: EXIT_PREREQ, data,
      detail: `${failures.length} prerequisite(s) missing`,
      remedy: failures.map((f) => f.remedy).filter(Boolean)[0] ?? null };
  }
  const warned = checks.filter((c) => c.status === 'warn').length;
  return { status: warned > 0 ? 'warn' : 'ok', data,
    detail: warned > 0 ? `${warned} warning(s)` : undefined };
};
