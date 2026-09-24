/**
 * `./snowarch upgrade` — seven numbered steps, and nothing happens before the sixth line.
 *
 * ARC-09-S07. An upgrade is the moment a user is most entitled to know what is about to happen to
 * their checkout, and least able to check afterwards: by the time something is wrong the tree has
 * moved. So the plan is computed BEFORE the tree is touched — which files changed between HEAD and
 * the tag, which bootstrap steps that makes stale, whether the store's schema moves, whether the
 * installed Claude Code still clears the tag's floor — and printed as one block with a `[Y/n]`
 * under it. Everything up to that point is reads.
 *
 * Three promises hold whatever happens after it:
 *
 *   **Credentials are never read or written by this command.** `.local/instances.json` is opened by
 *   exactly one thing in an upgrade: S06's migration, in B06, when the release changes the store's
 *   schema — announced in the plan, with its 0600 backup, before the user says yes.
 *
 *   **A failure leaves the tree at the new tag with the state file saying which step stopped.**
 *   Re-running finishes the job; that is the resume rule (S05), not a special path here.
 *
 *   **The banner never fetches.** This command writes `.local/upgrade-check.json`; the SessionStart
 *   hook reads it. A banner that could fetch would be a banner that could hang a session start.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, symlinkSync } from 'node:fs';

import { CACHE_FILE } from '../doctor-cache.mjs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { EXIT_FAIL, EXIT_OK, EXIT_USAGE } from '../exit.mjs';
import { branchState, git, isShallow } from '../git.mjs';
import { childEnv } from '../spawn-env.mjs';
import { loadConfig, root as defaultRoot } from '../config.mjs';
import { loadState } from '../state.mjs';
// ARC-08-C29 — the runner's own step list, so the plan and the run are one computation.
import { STEPS } from '../steps/index.mjs';
import { makeExec } from '../steps/B00.mjs';
import { nodeInfo, stepContext } from '../bootstrap.mjs';
import { engineChecks } from '../doctor/checks/index.mjs';
import { nonOkLines } from '../doctor/panel.mjs';
import { formatVersion, meetsFloor } from '../versions.mjs';
import { writeUpgradeCheck } from '../upgrade-check.mjs';
import { hashFor, INPUTS, STEP_IDS } from '../inputs.mjs';

/**
 * What U7 says about a doctor report — the tally AND the checks it counted, as one list.
 *
 * ARC-09-C46. U7 printed `DOCTOR: 31 ok, 3 warn, 1 fail (4 skip)` and stopped, so the owner's rc.5
 * upgrade told them a check had failed and not which one; they ran `./snowarch doctor` again to
 * learn it was E-27. The lines were already in `report` and were thrown away with it. That is
 * ARC-08-C3's defect one command over — "a count is what you write when you have the list and do
 * not print it" — and B09 fixed it for the bootstrap, which is why the renderer is imported rather
 * than written a second time.
 *
 * A FUNCTION, and the tally is inside it, because the defect was that the two were separable: a
 * caller could print the number and skip the list, and for one release that is exactly what it did.
 * Now there is nothing to skip — the count and what it counted are one return value.
 *
 * WARNINGS TOO, not only failures, which is wider than the brief and deliberately so. The next row
 * on this list is about an E-28 WARN printed by this very step whose wording cannot now be
 * recovered, because the tally was all that reached the transcript. A run of this command is
 * evidence about a warning as often as about a failure.
 */
export function doctorLines(report, checks = null) {
  if (!report?.summary) return [];
  const { ok = 0, warn = 0, fail = 0, skip = 0 } = report.summary;
  // THE TALLY AND THE WORDS COME FROM DIFFERENT PLACES (ARC-09-C56). The tally is a count and
  // carries no label, so it stays with the run that measured it; taking it from `checks` would be
  // taking a different run's arithmetic. The words are this terminal's, when we have that copy.
  const source = checks ? { checks } : report;
  return [`DOCTOR: ${ok} ok, ${warn} warn, ${fail} fail (${skip} skip)`, ...nonOkLines(source)];
}

/**
 * The doctor cache, but only if THIS RUN wrote it — otherwise `null`.
 *
 * Read from `.local/doctor-last.json`, which `doctor/index.mjs` writes from the unmasked report —
 * the `--json` on stdout is masked at the boundary for a different audience.
 *
 * ONE DEFINITION OF FRESHNESS. Both readers below are about the same file, the same run and the
 * same question, so the age test lives here once. A second freshness rule beside this one is how
 * two readers of one cache drift into disagreeing about which run they are describing.
 */
function readCacheThisRun(root, { read = readFileSync, notBefore = null } = {}) {
  try {
    const cache = JSON.parse(read(join(root, CACHE_FILE), 'utf8'));
    // WHICH RUN WROTE IT. Every bootstrapped tree has a cache from an earlier doctor, so a read with
    // no notion of when would hand back yesterday's answer — tally and all — as this run's.
    // `>=` and not `>`: the doctor stamps the cache from its own clock, and a run fast enough to
    // land on the start instant is this run, not a stale one.
    if (notBefore !== null) {
      const at = Date.parse(cache?.at ?? '');
      if (!Number.isFinite(at) || at < notBefore) return null;
    }
    return cache;
  } catch { return null; }
}

/**
 * The Mode line the doctor wrote for THIS MACHINE, or `null`.
 *
 * Returns `null` on any unreadable or shapeless cache: a caller that prints nothing is honest, and
 * one that falls back to the masked line prints `<label>` as though it were the instance's name.
 */
export function readCachedModeLine(root, { read = readFileSync, notBefore = null } = {}) {
  const line = readCacheThisRun(root, { read, notBefore })?.modeLine;
  return typeof line === 'string' && line.length > 0 ? line : null;
}

/**
 * The non-ok checks the doctor cached for THIS MACHINE, titled, or `null` (ARC-09-C56).
 *
 * The cache stores `{id, status, detail, remedy?}` and DROPS `title`, so the title is resolved by
 * id from the registry that owns it. A copy of the titles kept beside the registry would be the
 * second copy of a sentence this repository keeps removing.
 *
 * There IS a titled copy in the cache — `payload.report` mirrors the whole stored report — but it
 * is not in `COMPATIBILITY_KEYS`, which pins `checks` and not `report`. Reading the mirror would
 * build a user-facing line on a key nothing promises to keep.
 *
 * An id the registry cannot name falls back to the id alone. `registry.mjs` refuses id reuse
 * ("ids are never reused"), so an unresolvable id can only ever mean a RETIRED check — never the
 * wrong title — and `SV-99 WARN: <detail>` is a true line where `undefined` is a broken one.
 */
export function readCachedChecks(root, { read = readFileSync, notBefore = null,
  titles = checkTitles } = {}) {
  const checks = readCacheThisRun(root, { read, notBefore })?.checks;
  if (!Array.isArray(checks) || checks.length === 0) return null;
  const byId = titles();
  return checks.map((c) => ({ ...c, title: byId.get(c.id) ?? null }));
}

/** `id → title`, from the registry that defines them. Built once; the registry is static. */
let TITLES = null;
function checkTitles() {
  if (TITLES === null) TITLES = new Map(engineChecks().map((c) => [c.id, c.title]));
  return TITLES;
}

/** `--check` found a newer release. A code, so a script can ask without parsing prose. */
export const EXIT_BEHIND = 4;

/** The fetch is the one call here that talks to another machine, and it gets its own budget. */
export const FETCH_TIMEOUT_MS = 120_000;

export const USAGE = [
  'usage: ./snowarch upgrade [--to vX.Y.Z] [--check] [--yes] [--pre] [--force-floor]',
  '',
  '  --check        fetch the tags, say whether a newer release exists, change nothing (exit 4 when behind)',
  '  --to vX.Y.Z    a specific release tag (checks it out detached; the summary says how to return)',
  '  --yes          accept the plan without asking',
  '  --pre          consider prerelease tags',
  '  --force-floor  upgrade even though the release wants a newer Claude Code',
].join('\n');

export const DIRTY =
  'upgrade: tracked files are modified — commit or stash them first (git stash); nothing was changed';
export const NOTHING_CHANGED = 'upgrade: nothing changed';

/**
 * What git's failure was, in the words of a remedy.
 *
 * Git's own stderr is printed too, always and first: it is the truth, and a classifier that
 * replaced it would be deciding what the user is allowed to see. What this adds is the sentence a
 * reader can act on — and only when the shape is recognised, because a confident wrong remedy
 * costs more than none (R-3, and `03`'s proxy findings).
 */
export function classifyGitFetchError(stderr = '', { remote = 'origin' } = {}) {
  const text = String(stderr);
  const host = /could not resolve host:?\s*(\S+)/i.exec(text)?.[1] ?? remote;
  if (/could not resolve host/i.test(text)) {
    return { kind: 'dns', line: `upgrade: DNS failure for ${host} — check the network; if you are `
      + 'behind a corporate proxy, git reads HTTPS_PROXY / http.proxy '
      + '(docs/TROUBLESHOOTING.md#proxy_unreachable)' };
  }
  if (/SSL certificate problem|unable to get local issuer|self[- ]signed certificate/i.test(text)) {
    return { kind: 'tls', line: 'upgrade: TLS certificate not trusted — a TLS-intercepting proxy '
      + 'needs its CA in git (http.sslCAInfo) and in Node (NODE_EXTRA_CA_CERTS); see '
      + 'docs/TROUBLESHOOTING.md#tls_ca_untrusted' };
  }
  if (/\b407\b|proxy authentication required/i.test(text)) {
    return { kind: 'proxy-auth', line: 'upgrade: the proxy demanded authentication (407) — put the '
      + 'credentials in HTTPS_PROXY, or ask for an exception for this host '
      + '(docs/TROUBLESHOOTING.md#proxy_auth_required)' };
  }
  // A refused connection is the shape a dead proxy makes, and it is the one AC 4 exercises.
  if (/connection refused|failed to connect|couldn't connect to server|unable to access/i.test(text)) {
    return { kind: 'proxy', line: 'upgrade: could not reach the remote — if you are behind a '
      + 'corporate proxy, git reads HTTPS_PROXY / http.proxy '
      + '(docs/TROUBLESHOOTING.md#proxy_unreachable)' };
  }
  return { kind: 'unknown', line: null };
}

// ARC-09-S12 — `parseSemver` and `sortTags` moved to `lib/semver.mjs` and are re-exported here so
// every existing importer keeps working. The copy that lived here compared the prerelease as a
// string, so `rc.10` sorted below `rc.9` and this command would have offered a checkout on rc.9 the
// release it was already on. `checks/host.mjs` imports both from this module; the re-export is what
// makes moving the rule a one-file change rather than a rename across the tree.
// A re-export does NOT bind the names locally, and `releaseTags` below calls `sortTags` — the first
// version of this line was `export { … } from …` and every real tag resolution threw
// `sortTags is not defined`. Import, then export: one statement for the module's own use, one for
// the importers that already read these names from here.
import { parseSemver, sortTags } from '../semver.mjs';

export { parseSemver, sortTags };

/** The release tags this checkout knows about, newest first. */
export function releaseTags(root, { pre = false, opts = {} } = {}) {
  const out = git(root, ['tag', '--list', 'v*'], { ...opts, allowFail: true }) ?? '';
  const all = sortTags(out.split('\n').map((l) => l.trim()).filter(Boolean));
  return pre ? all : all.filter((t) => t.pre === null);
}

/**
 * The tag's own message, parsed — the product's proof that a tag is a RELEASE.
 *
 * Any tag can be called `v9.9.9`. A release tag of this product is annotated and carries the
 * `contract:` trailer S01 writes, so a target without one is refused by name rather than checked
 * out and discovered afterwards.
 */
export async function readTag(root, tag, { opts = {} } = {}) {
  const message = git(root, ['tag', '-l', '--format=%(contents)', tag], { ...opts, allowFail: true });
  if (!message) return null;
  const { parseTagMessage } = await import('../../../../scripts/lib/release/tag.mjs');
  return parseTagMessage(message);
}

/** The contract a TAG ships, without checking it out. */
export function contractAt(root, tag, { opts = {} } = {}) {
  const text = git(root, ['show', `${tag}:packages/snowarch/dist/contract.json`],
    { ...opts, allowFail: true });
  if (!text) return null;
  try { return JSON.parse(text); } catch { return null; }
}

/**
 * Which steps this upgrade will re-run, and why — from S05's table, not from a second opinion.
 *
 * DIFFED, not hashed, and that is the whole reason this is not a call to `staleSteps()`: that
 * function answers "what is stale in this checkout NOW", and the plan has to answer "what will be
 * stale once the tree is at the tag" — before the tree moves, which is the only moment at which a
 * plan is worth reading. So the question is put to git: `git diff --name-only HEAD <tag>`,
 * restricted to the files S05's INPUTS table declares, which keeps ONE declaration of what a step
 * depends on even though two functions read it. The gitlink and the store schema are the two
 * inputs that are not plain files, and each is compared on its own terms below.
 */
export function stepsThatWillRun(root, tag, { ctx, opts = {} }) {
  const declared = new Map();
  for (const id of STEP_IDS) {
    for (const input of INPUTS[id].inputs) {
      if (input.kind !== 'file') continue;
      const ref = input.ref.startsWith('<') ? ctx.config.docs.areasFile : input.ref;
      if (!declared.has(ref)) declared.set(ref, new Set());
      declared.get(ref).add(id);
    }
  }
  const changed = (git(root, ['diff', '--name-only', 'HEAD', tag, '--', ...declared.keys()],
    { ...opts, allowFail: true }) ?? '').split('\n').map((l) => l.trim()).filter(Boolean);

  const reasons = new Map();
  for (const file of changed) {
    for (const id of declared.get(file) ?? []) {
      if (!reasons.has(id)) reasons.set(id, []);
      reasons.get(id).push(file);
    }
  }
  // The corpus moves by its GITLINK, which no `--name-only` diff of files reports as content.
  const here = git(root, ['ls-tree', 'HEAD', 'vendor/ServiceNowDocs'], { ...opts, allowFail: true });
  const there = git(root, ['ls-tree', tag, 'vendor/ServiceNowDocs'], { ...opts, allowFail: true });
  if (here && there && here !== there) {
    if (!reasons.has('B02')) reasons.set('B02', []);
    reasons.get('B02').push('the docs pin');
  }
  return [...reasons.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([step, files]) => ({ step, title: INPUTS[step].title, files }));
}

/**
 * ARC-08-C29 — THE SET THE RUNNER WILL DECIDE, computed before the user says Y.
 *
 * `stepsThatWillRun` below answers a DIFFERENT question from the one the bootstrap asks. It maps
 * CHANGED FILES to steps; the runner compares each step's INPUT HASH against the recorded state
 * and re-runs anything that differs, has no record, or did not finish. The two agree often enough
 * to look like one computation and they are not, and the owner's rc.6 → rc.9 upgrade is what that
 * costs: U4 promised `B04, B05, B08`, U6 ran eight steps, and **B06 — which U4 never mentioned —
 * started the instance wizard**. The list the user approves was not the list that runs.
 *
 * The old function's own comment names the obstacle, and it is real: the plan is read BEFORE U5
 * moves the tree, so the post-move inputs are not on disk to hash. `git worktree add --detach
 * <temp> <tag>` puts them there — a real checkout of the tag, sharing the object store, 0.4 s —
 * and the real `.local/` is symlinked in, because the store and the state do NOT move with the
 * tag. That tree is what the checkout will be at U6, so hashing it with `hashFor` — the runner's
 * own function, over the runner's own table — is the runner's decision, taken early.
 *
 * If the worktree cannot be made, this returns `null` and the caller says the plan is a
 * FILE-CHANGE ESTIMATE rather than silently printing a different computation under the same
 * heading. Two answers wearing one label is the defect this row exists to remove.
 */
/**
 * The ctx the plan asks its questions with — EXPORTED so a test asks them the same way.
 *
 * `mode` and `docs` come from the RECORDED state, because that is what the upgrade re-runs under:
 * an upgrade does not ask the two plan questions again, it repeats the answers already on disk.
 * `node` is this machine's, because it is this machine that will run the steps. Everything else is
 * `stepContext`'s, which is what the bootstrap hands its steps.
 *
 * Exported because the first version of `plan-agrees.test.mjs` built its own ctx to record the
 * "current" hashes and then compared them against ones built here — two constructions, disagreeing
 * about `state.registration`, and the test reported B07 stale on a tree where nothing had changed.
 * A test that constructs its own version of the thing under test is measuring its own copy.
 */
export function planContext({ root, config, ctx = {}, state = null }) {
  return {
    ...stepContext({ root, config, env: ctx.env ?? process.env, node: ctx.node ?? nodeInfo(),
      flags: { yes: true }, state }),
    mode: state?.mode ?? ctx.mode ?? 'design',
    docs: state?.docs?.mode ?? ctx.docs ?? 'sparse',
  };
}

export function rerunAtTag(root, tag, { ctx, state, run = spawnSync, keepWorktree = null } = {}) {
  const scratch = keepWorktree ? null : mkdtempSync(join(tmpdir(), 'snowarch-plan-'));
  const at = keepWorktree ?? join(scratch, 'at-tag');
  const added = keepWorktree !== null
    || run('git', ['worktree', 'add', '--detach', '--quiet', at, tag],
      { cwd: root, encoding: 'utf8', stdio: 'pipe' })?.status === 0;
  if (!added) {
    // The worktree failed, so the directory made for it is rubbish. Removed HERE rather than in
    // the `finally` below, which the early return never reaches.
    if (scratch) rmSync(scratch, { recursive: true, force: true });
    return null;
  }

  try {
    // The store and the state are the CHECKOUT's, not the tag's: an upgrade does not move them,
    // and B06's inputs are mostly about them. A worktree without them would read `storePresent=no`
    // and call B06 stale on every upgrade — the opposite of this row's point.
    const local = join(root, '.local');
    if (existsSync(local)) {
      try { symlinkSync(local, join(at, '.local'), 'dir'); } catch { /* already there */ }
    }

    let config = ctx.config;
    try { config = JSON.parse(readFileSync(join(at, 'engine.config.json'), 'utf8')); } catch { /* the tag's, or ours */ }

    // THE RUNNER'S OWN SHAPE, from the runner's own constructor. A spread of the upgrade
    // command's `{ root, config }` was missing `env`, and `B04.runsWhen` reads
    // `ctx.env.SNOWARCH_TEST_FORCE_DEPS` — so every real upgrade crashed at `[U4/7] plan`. A ctx
    // assembled at a call site is a ctx that drifts from what the steps read.
    //
    // `mode` and `docs` come from the RECORDED state, because that is what the upgrade re-runs
    // under: an upgrade does not ask the two questions again, it repeats the answers already on
    // disk. `node` is this machine's, because it is this machine that will run the steps.
    const tagCtx = planContext({ root: at, config, ctx, state });

    const out = new Map();
    for (const step of STEPS) {
      if (step.runsWhen(tagCtx) === false) continue;
      if (step.cacheable === false) continue;   // B00 and B09 run every time and say so elsewhere
      const recorded = state?.steps?.[step.id];
      if (!recorded) { out.set(step.id, 'never recorded'); continue; }
      if (recorded.status !== 'ok') {
        out.set(step.id, recorded.reason === 'interrupted' ? 'last run interrupted' : 'last run did not finish');
        continue;
      }
      let hash = null;
      try { hash = hashFor(step.id, tagCtx); } catch { hash = null; }
      if (hash === null) { out.set(step.id, 'inputs could not be read'); continue; }
      if (hash !== recorded.inputsHash) out.set(step.id, 'inputs changed');
    }
    return out;
  } finally {
    if (keepWorktree === null) {
      run('git', ['worktree', 'remove', '--force', at], { cwd: root, encoding: 'utf8', stdio: 'pipe' });
      // AND THE DIRECTORY THAT HELD IT. Removing the worktree leaves the `mkdtemp` behind, so
      // every real plan left one empty `snowarch-plan-*` in the OS temp directory — measured at
      // five after one test file. `rmSync` after `worktree remove`, in the same `finally`, so an
      // exception between them still cleans up.
      if (scratch) rmSync(scratch, { recursive: true, force: true });
    }
  }
}

/**
 * The list the plan prints: the runner's SET, with the file diff's words where it has them.
 *
 * ARC-08-C29. Two computations answered the same heading and disagreed — U4 said `B04, B05, B08`
 * and the run went on to start B06's wizard. This is the one computation, with the readable half
 * kept: `rerunAtTag` decides WHICH steps, `stepsThatWillRun` explains WHY for the ones a file
 * change explains, and a step stale for any other reason carries the hash's own word instead of
 * vanishing from the line.
 */
export function planSteps(root, tag, { ctx, state, opts = {}, run = spawnSync } = {}) {
  const byFile = new Map(stepsThatWillRun(root, tag, { ctx, opts })
    .map((s) => [s.step, s]));
  const decided = rerunAtTag(root, tag, { ctx, state, run });

  // No worktree, no runner comparison: fall back to the file diff and SAY it is an estimate.
  if (decided === null) {
    return { steps: [...byFile.values()].map((s) => ({ ...s, why: 'files changed' })), estimate: true };
  }

  const steps = [...decided.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([step, why]) => ({
      step,
      title: INPUTS[step]?.title ?? step,
      files: byFile.get(step)?.files ?? [],
      why,
    }));
  return { steps, estimate: false };
}

/** What the store will do, said before it is done. */
export function storePlan(root, tag, { opts = {} } = {}) {
  const store = join(root, '.local', 'instances.json');
  if (!existsSync(store)) return { line: 'store: none (no instance store in this checkout)' };
  let from = null;
  try { from = JSON.parse(readFileSync(store, 'utf8'))?.version ?? null; } catch { from = 'unreadable'; }
  const to = contractAt(root, tag, { opts })?.storeSchemaVersion ?? null;
  if (from === 'unreadable') {
    return { line: 'store: the store is not valid JSON — run ./snowarch store migrate to see why',
      blocked: true };
  }
  if (to === null) return { line: `store: schema v${from} → unknown (the tag ships no contract)` };
  if (to === from) return { line: `store: schema v${from} → v${to} (no migration)` };
  if (to < from) {
    return { line: `store: schema v${from} is NEWER than the target's v${to} — this is a downgrade`,
      blocked: true };
  }
  return { line: `store: schema v${from} → v${to} (1 migration; backup will be written)`,
    migrates: true };
}

/** Is the installed Claude Code new enough for what the tag asks? */
export function floorCheck(tagInfo, { exec }) {
  const want = tagInfo?.floors?.claudeCode ?? null;
  if (!want) return { line: null, below: false };
  const r = exec('claude', ['--version']);
  if (!r.found || !r.ok) {
    return { line: `claude-floor ${want} (installed: not found — install Claude Code, or pass `
      + '--force-floor)', below: false, unknown: true };
  }
  const { ok: passes, found } = meetsFloor(r.stdout, want);
  if (!found) return { line: `claude-floor ${want} (installed version not understood)`, below: false, unknown: true };
  // `formatVersion`, because `meetsFloor` answers with a parsed OBJECT and a template literal
  // turns that into `[object Object]` — which is what the first run of this printed.
  const shown = formatVersion(found);
  return passes
    ? { line: `claude-floor ${want} (installed ${shown} ok)`, below: false }
    : { line: `claude-floor ${want} (installed ${shown} — BELOW the floor; upgrade Claude Code first)`,
      below: true };
}

const short = (sha) => (sha ? String(sha).slice(0, 7) : '—');

/** The plan block, exactly as the story writes it. */
export function renderPlan({ from, to, commits, date, tagInfo, floor, steps, store,
  restart = null, estimate = false }) {
  const lines = [`Upgrade plan: ${from} → ${to}`
    + `${commits === null ? '' : ` (${commits} commit${commits === 1 ? '' : 's'}`
      + `${date ? `, ${date}` : ''})`}`];
  lines.push(`  tag verified: contract ${short(tagInfo?.contract)}… · docs-pin `
    + `${short(tagInfo?.docsPin)} · ${floor.line ?? 'claude-floor not stated'}`);
  // ARC-08-C29 — the SET is the runner's decision, the REASON is whatever can be said about it.
  //
  // `files` is the readable half: `package-lock.json changed` tells a reader what moved. But a
  // step can be stale for reasons no file diff shows — a literal input, a last run that did not
  // finish — and those steps used to be absent from this line and present in the run. When the
  // set comes from the hash, the reason is the diff where there is one and the hash's own word
  // where there is not.
  lines.push(steps.length === 0
    ? '  steps that will re-run: none (only the preflight and the summary)'
    : `  steps that will re-run: ${steps.map((s) => `${s.step} ${s.title} `
      + `(${s.files?.length ? `${s.files.join(', ')} changed` : s.why})`).join('; ')}`);
  // Said out loud when the runner's own comparison could not be made, rather than printing a
  // different computation under the same heading.
  if (estimate) {
    lines.push('  (the list above is a file-change estimate: the tag could not be checked out to '
      + "compare the runner's own inputs)");
  }
  lines.push(`  ${store.line}`);
  lines.push('  credentials: untouched (.local/instances.json is never read or written by the upgrade)');
  if (restart) lines.push(`  after the upgrade: ${restart}`);
  return lines.join('\n');
}

/**
 * The step a previous run stopped at, or `null`.
 *
 * `fail` and `interrupted` both mean "this checkout is part-way through an install", which is the
 * state a resume exists for. A step that was SKIPPED is not one of them: `runsWhen` declining is a
 * decision, not an interruption.
 */
export function failedStep(state) {
  for (const [id, entry] of Object.entries(state?.steps ?? {})) {
    if (entry?.status === 'fail' || entry?.status === 'interrupted') return id;
  }
  return null;
}

/** `[U3/7] resolve target` — the step line, in the bootstrap's own shape. */
const stepLine = (n, title) => `[U${n}/7] ${title}`;

export async function upgradeCommand({ flags = {}, positional = [], log, root = defaultRoot,
  env = process.env, cwd = process.cwd(), exec = undefined, run = spawnSync,
  now = () => new Date(), ask = null, input = process.stdin } = {}) {
  if (positional.length > 0) {
    log.fail(`upgrade takes no positional arguments; did you mean --to ${positional[0]}?`);
    log.step(USAGE);
    return EXIT_USAGE;
  }
  const opts = { env };
  const probe = exec ?? makeExec({ env });
  const config = loadConfig(root);
  const remote = 'origin';

  // ── U1 preflight ──────────────────────────────────────────────────────────────────────────
  log.step(stepLine(1, 'preflight'));
  const state = (() => { try { return loadState(root); } catch { return null; } })();
  const dirty = git(root, ['status', '--porcelain', '--untracked-files=no'], { ...opts, allowFail: true });
  if (dirty === null) {
    log.fail('upgrade: this is not a git checkout — the upgrade moves a tree, and there is none');
    return EXIT_USAGE;
  }
  if (dirty.trim() !== '') {
    log.fail(DIRTY);
    return EXIT_USAGE;
  }
  const shallow = isShallow(root, opts);

  // ── U2 fetch ──────────────────────────────────────────────────────────────────────────────
  log.step(stepLine(2, `fetch tags from ${remote}`));
  const fetchArgs = ['fetch', '--tags', '--prune', ...(shallow ? ['--unshallow'] : []), remote];
  const fetched = run('git', fetchArgs, { cwd: root, encoding: 'utf8', env: childEnv(root, env),
    timeout: FETCH_TIMEOUT_MS, stdio: 'pipe' });
  if (fetched.status !== 0) {
    const stderr = String(fetched.stderr ?? fetched.error?.message ?? '').trim();
    if (stderr) for (const line of stderr.split('\n')) log.step(line);
    const { line } = classifyGitFetchError(stderr, { remote });
    log.fail(line ?? 'upgrade: git could not fetch the release tags; nothing was changed');
    return EXIT_FAIL;
  }

  // ── U3 resolve the target ─────────────────────────────────────────────────────────────────
  log.step(stepLine(3, 'resolve target'));
  const tags = releaseTags(root, { pre: Boolean(flags.pre), opts });
  const latest = tags[0]?.tag ?? null;
  const target = flags.to ?? latest;
  const here = git(root, ['describe', '--tags', '--exact-match'], { ...opts, allowFail: true })?.trim() ?? null;
  const localTag = here ?? (git(root, ['describe', '--tags', '--abbrev=0'], { ...opts, allowFail: true })?.trim() ?? null);

  if (!target) {
    log.fail(`upgrade: ${remote} has no release tags${flags.pre ? '' : ' (prereleases need --pre)'}`);
    return EXIT_FAIL;
  }
  const tagInfo = await readTag(root, target, { opts });
  if (!tagInfo?.contract) {
    log.fail(`upgrade: ${target} is not a release tag of this product`);
    return EXIT_FAIL;
  }

  const behind = Boolean(latest && localTag !== latest);
  // ARC-09-C47 — this write KEEPS its verdict, and that is deliberate. It fetched the tags and
  // compared them, so `behind` here is a measurement; `upgrade --check` exists to refresh exactly
  // this record, and the banner's nudge reads it. Do not strip it for symmetry with `finish()`,
  // whose `behind` was a literal — the asymmetry IS the distinction this row is about.
  writeUpgradeCheck(root, { latestTag: latest, localTag, behind, remote, now,
    source: 'upgrade-check' });

  if (flags.check) {
    log.step(behind
      ? `${latest} available (you are on ${localTag ?? 'an untagged commit'})`
      : `up to date (${localTag ?? latest})`);
    return behind ? EXIT_BEHIND : EXIT_OK;
  }

  // Already at the target — but "the tree is there" and "the upgrade finished" are two different
  // claims, and the failure message this command prints says "re-run ./snowarch upgrade". A run
  // that answered `up to date` to that would be telling a user to type a command that does
  // nothing. So an unfinished bootstrap continues from U6 instead.
  const unfinished = here === target ? failedStep(state) : null;
  if (here === target && !unfinished) {
    log.step(`up to date (${target})`);
    return EXIT_OK;
  }
  if (unfinished) {
    log.step(`already at ${target}; the last run stopped at ${unfinished} — continuing from there`);
    return finish({ root, env, log, run, target, latest, remote, now, state });
  }

  // ── U4 the plan, computed before anything moves ───────────────────────────────────────────
  log.step(stepLine(4, 'plan'));
  const ctx = { root, config };
  // ARC-08-C29 — ONE COMPUTATION. `planSteps` asks the runner's own question (hash the tag's
  // inputs, compare with the recorded state) and falls back to the file diff only when the tag
  // cannot be checked out — in which case the plan says so rather than printing the other answer
  // under the same heading.
  const { steps, estimate } = planSteps(root, target, { ctx, state, opts });
  const store = storePlan(root, target, { opts });
  const floor = floorCheck(tagInfo, { exec: probe });
  const commits = Number(git(root, ['rev-list', '--count', `HEAD..${target}`], { ...opts, allowFail: true }) ?? '');
  const date = git(root, ['log', '-1', '--format=%cs', target], { ...opts, allowFail: true });

  log.step(renderPlan({
    from: localTag ?? 'an untagged commit', to: target,
    commits: Number.isFinite(commits) ? commits : null, date, tagInfo, floor, steps, store, estimate,
    restart: 'restart claude (the MCP server binary changed) — or run /mcp → servicenow → reconnect',
  }));

  if (store.blocked) {
    log.fail('upgrade: nothing was changed');
    return EXIT_FAIL;
  }
  if (floor.below && !flags['force-floor']) {
    log.fail('upgrade: the installed Claude Code is below the floor this release wants — upgrade it '
      + 'first, or pass --force-floor; nothing was changed');
    return EXIT_USAGE;
  }

  if (!flags.yes) {
    const answer = ask
      ? await ask('Proceed? [Y/n]')
      : await promptLine('Proceed? [Y/n] ', { input, log });
    if (/^n/i.test(String(answer).trim())) {
      log.step(NOTHING_CHANGED);
      return EXIT_OK;
    }
  }

  // ── U5 move the tree ──────────────────────────────────────────────────────────────────────
  log.step(stepLine(5, `move the checkout to ${target}`));
  const branch = branchState(root, opts);
  const onBranch = Boolean(branch.branch) && !branch.detached;
  if (!flags.to && onBranch) {
    const pulled = run('git', ['pull', '--ff-only', remote, branch.branch],
      { cwd: root, encoding: 'utf8', env: childEnv(root, env), stdio: 'pipe' });
    if (pulled.status !== 0) {
      const stderr = String(pulled.stderr ?? '').trim();
      if (stderr) for (const line of stderr.split('\n')) log.step(line);
      log.fail(`upgrade: ${branch.branch} has diverged from ${remote}/${branch.branch} — resolve `
        + `with git, or use --to ${target} to check out the release tag`);
      return EXIT_FAIL;
    }
    const past = Number(git(root, ['rev-list', '--count', `${target}..HEAD`], { ...opts, allowFail: true }) ?? '0');
    if (past > 0) {
      log.step(`${branch.branch} is ${past} commit${past === 1 ? '' : 's'} past ${target} `
        + '(development commits)');
    }
  } else {
    const out = git(root, ['checkout', '--quiet', target], { ...opts, allowFail: true });
    if (out === null) {
      log.fail(`upgrade: git could not check out ${target}; nothing else was changed`);
      return EXIT_FAIL;
    }
    log.step(`HEAD is detached at ${target} — return with: git checkout ${branch.branch ?? 'main'}`);
  }

  return finish({ root, env, log, run, target, latest, remote, now, state });
}

/**
 * U6 and U7 — the half that runs whether this is a move or a continuation.
 *
 * Extracted because an upgrade has two ways in: the ordinary one, which plans and moves the tree
 * first, and a RE-RUN after a step failed, where the tree is already at the target and planning a
 * move that has happened would be a lie in a box. Both end here, so both end the same way.
 */
export async function finish({ root, env, log, run, target, latest, remote, now, state }) {
  log.step(stepLine(6, 'bootstrap (only the steps whose inputs changed)'));
  const mode = state?.mode === 'live' ? 'live' : 'design';
  const bootstrap = run(process.execPath, [join(root, 'tools/snowarch/bin/snowarch.mjs'),
    'bootstrap', '--mode', mode, '--yes'],
  { cwd: root, stdio: 'inherit', env: childEnv(root, env) });
  if (bootstrap.status !== 0) {
    log.fail(`upgrade: the bootstrap stopped (exit ${bootstrap.status ?? 'abnormally'}) — the tree `
      + `is at ${target} and the state file records the step; re-run ./snowarch upgrade or `
      + './snowarch bootstrap');
    return EXIT_FAIL;
  }

  // ── U7 the doctor, and the cache ──────────────────────────────────────────────────────────
  log.step(stepLine(7, 'doctor'));
  // Taken BEFORE the spawn, from the injected clock: the cache is only this run's if it was written
  // at or after this instant.
  const startedAt = Number(now());
  const doctor = run(process.execPath, [join(root, 'tools/snowarch/bin/snowarch.mjs'),
    'doctor', '--json', '--no-cache', '--write-cache'],
  { cwd: root, encoding: 'utf8', env: childEnv(root, env), stdio: ['ignore', 'pipe', 'pipe'] });
  let report = null;
  try { report = JSON.parse(doctor.stdout ?? ''); } catch { report = null; }

  // THE MODE LINE COMES FROM THE CACHE, NOT FROM THE `--json` STDOUT WE JUST PARSED.
  //
  // `<label>` is not an unfilled template: it is `LABEL_MASK` from `doctor/json-boundary.mjs`, and
  // masking `--json` is deliberate and right — that is the form which TRAVELS, an issue template
  // asks a stranger to paste it, so labels and hosts leave as `<label>` / `<host>`. U7 was printing
  // that copy to the user's own terminal, which is the one audience that owns the words: the owner
  // saw `instance=<label> (<label>)` here and `instance=pdi (pdi)` from `./snowarch doctor` a
  // second later (sitting, 2026-09-23).
  //
  // The unmasked line is already on disk and we already asked for it: `doctor/index.mjs` caches the
  // report BEFORE `maskForJson` runs, and the spawn above passes `--write-cache`. So this reads the
  // copy meant for this machine. No second doctor run, and no reconstruction of a line the doctor
  // owns — `modeLine` carries the preset and the doctor's own tally, which this command does not
  // know and must not invent.
  //
  // A MASK IS WORSE THAN SILENCE, so there is no fallback to `report.modeLine`: it reads as a value.
  // ...AND IT HAS TO BE THIS RUN'S. Reading the cache fixed the mask and opened this one step down:
  // the file is there on every bootstrapped tree, so a failed doctor — the upgrade that broke
  // something, when the closing line matters most — would be closed with yesterday's line as though
  // it had just been measured. ARC-07-C9's class (a recorded value rendered as fresh) one step from
  // where it was fixed, and the split B09 gets right.
  //
  // Four conditions, and each is a way the line could be about a different run: the doctor exited 0,
  // its report parsed, it did not report a `cacheError` (it tried to write and could not), and the
  // file is stamped at or after the moment we started it. Otherwise silence.
  const wroteThisRun = doctor.status === 0 && report !== null && !report.cacheError;

  // ARC-09-C56 — the lines UNDER the tally are this terminal's copy too, under the same binding.
  //
  // C53 fixed the Mode line and left these reading the masked stdout, and the REMEDY is the sharper
  // half of what that costs: a detail saying `<label>` is a fact rendered vaguely, but a remedy
  // saying `./snowarch instance test <label>` is a command-shaped string that FAILS when pasted —
  // in the one place the product is telling somebody what to do next.
  //
  // Falling back to the stdout rather than to silence, which is the opposite of the Mode line's
  // answer and deliberately so: a masked LINE still names the check, its status and its remedy's
  // shape, so it degrades to vague-but-true. A masked Mode line degrades to false, because
  // `instance=<label>` reads as the instance's name. Silence costs a reader the check entirely.
  const cachedChecks = wroteThisRun ? readCachedChecks(root, { notBefore: startedAt }) : null;
  for (const line of doctorLines(report, cachedChecks)) log.step(line);

  const cachedModeLine = wroteThisRun ? readCachedModeLine(root, { notBefore: startedAt }) : null;
  if (cachedModeLine) log.step(cachedModeLine);

  // ARC-09-C47 — NO CURRENCY VERDICT HERE. This used to write `behind: false` as a literal,
  // because an upgrade had just finished, and overwrite the measurement U7's doctor had made
  // moments earlier. An upgrade knows which tag it moved to; it does not know whether a newer
  // release exists, and it had not asked. It records what it did and leaves currency to the check
  // that defines it.
  writeUpgradeCheck(root, { localTag: target, remote, now, source: 'upgrade' });
  return EXIT_OK;
}

/** One line from stdin, with no dependency on a TTY library. */
async function promptLine(prompt, { input, log }) {
  log.step(prompt);
  const { createInterface } = await import('node:readline');
  const rl = createInterface({ input, terminal: false });
  try {
    for await (const line of rl) return line;
    return '';
  } finally { rl.close(); }
}
