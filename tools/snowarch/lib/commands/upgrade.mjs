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
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { EXIT_FAIL, EXIT_OK, EXIT_USAGE } from '../exit.mjs';
import { branchState, git, isShallow } from '../git.mjs';
import { childEnv } from '../spawn-env.mjs';
import { loadConfig, root as defaultRoot } from '../config.mjs';
import { loadState } from '../state.mjs';
import { makeExec } from '../steps/B00.mjs';
import { formatVersion, meetsFloor } from '../versions.mjs';
import { writeUpgradeCheck } from '../upgrade-check.mjs';
import { INPUTS, STEP_IDS } from '../inputs.mjs';

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

/** `v2.1.0` → `[2,1,0]`, and a prerelease is marked rather than dropped. */
export function parseSemver(tag) {
  const m = /^v(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?$/.exec(String(tag));
  if (!m) return null;
  return { tag, parts: [Number(m[1]), Number(m[2]), Number(m[3])], pre: m[4] ?? null };
}

/** Highest first. A prerelease sorts BELOW the release it precedes, as semver says. */
export function sortTags(tags) {
  return tags.map(parseSemver).filter(Boolean).sort((a, b) => {
    for (let i = 0; i < 3; i += 1) if (a.parts[i] !== b.parts[i]) return b.parts[i] - a.parts[i];
    if (a.pre === b.pre) return 0;
    if (a.pre === null) return -1;
    if (b.pre === null) return 1;
    return a.pre < b.pre ? 1 : -1;
  });
}

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
export function renderPlan({ from, to, commits, date, tagInfo, floor, steps, store, restart }) {
  const lines = [`Upgrade plan: ${from} → ${to}`
    + `${commits === null ? '' : ` (${commits} commit${commits === 1 ? '' : 's'}`
      + `${date ? `, ${date}` : ''})`}`];
  lines.push(`  tag verified: contract ${short(tagInfo?.contract)}… · docs-pin `
    + `${short(tagInfo?.docsPin)} · ${floor.line ?? 'claude-floor not stated'}`);
  lines.push(steps.length === 0
    ? '  steps that will re-run: none (only the preflight and the summary)'
    : `  steps that will re-run: ${steps.map((s) => `${s.step} ${s.title} `
      + `(${s.files.join(', ')} changed)`).join('; ')}`);
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
  writeUpgradeCheck(root, { latestTag: latest, localTag, behind, remote, now });

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
  const steps = stepsThatWillRun(root, target, { ctx, opts });
  const store = storePlan(root, target, { opts });
  const floor = floorCheck(tagInfo, { exec: probe });
  const commits = Number(git(root, ['rev-list', '--count', `HEAD..${target}`], { ...opts, allowFail: true }) ?? '');
  const date = git(root, ['log', '-1', '--format=%cs', target], { ...opts, allowFail: true });

  log.step(renderPlan({
    from: localTag ?? 'an untagged commit', to: target,
    commits: Number.isFinite(commits) ? commits : null, date, tagInfo, floor, steps, store,
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
async function finish({ root, env, log, run, target, latest, remote, now, state }) {
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
  const doctor = run(process.execPath, [join(root, 'tools/snowarch/bin/snowarch.mjs'),
    'doctor', '--json', '--no-cache', '--write-cache'],
  { cwd: root, encoding: 'utf8', env: childEnv(root, env), stdio: ['ignore', 'pipe', 'pipe'] });
  let report = null;
  try { report = JSON.parse(doctor.stdout ?? ''); } catch { report = null; }
  if (report?.summary) {
    const { ok: okCount = 0, warn = 0, fail = 0, skip = 0 } = report.summary;
    log.step(`DOCTOR: ${okCount} ok, ${warn} warn, ${fail} fail (${skip} skip)`);
  }
  if (report?.modeLine) log.step(report.modeLine);

  writeUpgradeCheck(root, { latestTag: latest, localTag: target, behind: false, remote, now });
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
