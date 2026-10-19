// Copyright 2026 Cvetomir Grigorov. Licensed under the Business Source License 1.1 (see LICENSE).
// snowarch — AI ServiceNow Architect. Not affiliated with or endorsed by ServiceNow, Inc.
/**
 * ARC-09-S07 — the upgrade, end to end, against a real origin and two real fixture releases.
 *
 * Every case here runs the command the way a user runs it: `./snowarch upgrade …` as a process, in
 * a clone, with a git remote that exists. The harness's whole reason for being is that an upgrade
 * cannot be proved in-process — what is under test is what happens to a TREE.
 *
 * Slow by nature (each `buildWorld` compiles a server for fixture B), so the world is built ONCE
 * per case that needs a fresh one and reused where a case only reads.
 *
 * ARC-09-C158 — the cases whose subject is the licence or the signed manifest are in
 * `upgrade-licence.e2e.test.mjs`, so the Windows job can run as two shards. Its header states the
 * rule: a case goes to the file its subject names, never to the one that balances the clock.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import {
  existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, statSync, writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { EXIT_BEHIND } from '../../tools/snowarch/lib/commands/upgrade.mjs';
import { bootstrapUser, buildWorld, fakeClaude, git, republishManifests, snowarch } from './harness.mjs';
import { stage } from '../../scripts/lib/distribution.mjs';
import { COVERAGE, isCovered } from '../../tools/snowarch/lib/licence/manifest.mjs';

const isWindows = process.platform === 'win32';
const MINUTES = 10 * 60 * 1000;

const sha256 = (p) => createHash('sha256').update(readFileSync(p)).digest('hex');
const state = (user) => JSON.parse(readFileSync(join(user, '.local/bootstrap-state.json'), 'utf8'));
const storePath = (user) => join(user, '.local/instances.json');
const backups = (user) => readdirSync(join(user, '.local'))
  .filter((f) => f.startsWith('instances.json.bak-'));

test('AC 1 — a release that moves one declared input re-runs exactly that step', async (t) => {
  const w = await buildWorld(t);
  bootstrapUser(w.user);

  // Every precondition asserted before anything is done to the tree: a test that started from a
  // state it had not checked would report the upgrade's failure as somebody else's.
  assert.equal(git(w.user, ['describe', '--tags', '--exact-match']), 'v9.0.0');
  const before = state(w.user);
  const storeBefore = sha256(storePath(w.user));
  assert.equal(JSON.parse(readFileSync(storePath(w.user), 'utf8')).version, 1);

  const r = snowarch(w.user, ['upgrade', '--to', 'v9.1.0', '--yes'], { bin: w.bin });
  assert.equal(r.status, 0, r.text);

  // The PLAN said which step, before the tree moved.
  assert.match(r.text, /steps that will re-run: B02 the documentation corpus \(vendor\/docs-areas\.txt changed\)/);
  assert.match(r.text, /store: schema v1 → v1 \(no migration\)/);
  assert.match(r.text, /credentials: untouched/);

  // …and the run did exactly that. B02 re-ran; the four cacheable steps whose inputs did not move
  // printed `ok (cached)` and kept their entries, which is the assertion that survives a runner
  // change — a step that secretly re-ran would have a new `finishedAt` even if its line looked right.
  const after = state(w.user);
  assert.notEqual(after.steps.B02.finishedAt, before.steps.B02.finishedAt, 'B02 did not re-run');
  for (const id of ['B01', 'B03', 'B05', 'B07']) {
    assert.ok(r.text.includes(`[${id}/09]`) && new RegExp(`\\[${id}/09\\][^\n]*ok \\(cached\\)`).test(r.text),
      `${id} was not cached`);
    assert.equal(after.steps[id].finishedAt, before.steps[id].finishedAt, `${id} re-ran`);
  }
  // B06 runs because a store EXISTS (ARC-09-S06 widened its `runsWhen`), which the story's AC
  // predates. It runs and changes nothing: the schema did not move.
  assert.match(r.text, /\[B06\/09\][^\n]*ok/);

  assert.equal(sha256(storePath(w.user)), storeBefore, 'the upgrade touched the credential store');
  assert.deepEqual(backups(w.user), [], 'a backup was written by an upgrade with no migration');
  // ARC-08-C36 — THIS ASSERTION USED TO BE `summary.fail >= 0`, WHICH A COUNT CANNOT FAIL.
  //
  // It is the only look this suite takes at the doctor after an upgrade, and it could not fail: a
  // count is never negative. So the one place an upgrade's own report is inspected proved nothing,
  // and E-29 has been FAILING here — this world upgrades 9.0.0 → 9.1.0, every step whose inputs did
  // not move stays cached and keeps its 9.0.0 stamp, and E-29 read an older stamp as "bootstrap
  // incomplete". The owner met exactly that at the S06 sitting on a bootstrap that had just
  // finished and said so.
  const report = JSON.parse(readFileSync(join(w.user, '.local/doctor-last.json'), 'utf8'));
  const failing = (report.checks ?? []).filter((c) => c.status === 'fail').map((c) => c.id);
  assert.deepEqual(failing, [],
    `the doctor FAILS after a clean upgrade: ${failing.join(', ')} — `
    + JSON.stringify((report.checks ?? []).filter((c) => c.status === 'fail')
      .map((c) => `${c.id}: ${c.detail}`)));
  assert.match(snowarch(w.user, ['version'], { bin: w.bin }).stdout, /tag:\s+v9\.1\.0 \(exact\)/);
}, MINUTES);

test('AC 2 — a release that moves the store schema migrates it, with a backup', async (t) => {
  const w = await buildWorld(t);
  bootstrapUser(w.user);
  const storeBefore = readFileSync(storePath(w.user));
  const authBefore = JSON.parse(storeBefore.toString()).instances;

  const r = snowarch(w.user, ['upgrade', '--to', 'v9.2.0', '--yes'], { bin: w.bin });
  assert.equal(r.status, 0, r.text);
  assert.match(r.text, /store: schema v1 → v2 \(1 migration; backup will be written\)/);

  const after = JSON.parse(readFileSync(storePath(w.user), 'utf8'));
  assert.equal(after.version, 2, 'the store was not migrated');
  for (const label of ['pdi', 'other']) {
    assert.deepEqual(after.instances[label].auth, authBefore[label].auth, `${label}'s auth changed`);
    assert.equal(after.instances[label].notes, '', 'the migration did not run');
  }

  const [backup] = backups(w.user);
  assert.ok(backup, 'no backup was written');
  const backupPath = join(w.user, '.local', backup);
  assert.deepEqual(readFileSync(backupPath), storeBefore, 'the backup is not the original bytes');
  if (!isWindows) assert.equal(statSync(backupPath).mode & 0o777, 0o600);
}, MINUTES);

test('AC 3 — a modified tracked file stops the upgrade before anything moves', async (t) => {
  const w = await buildWorld(t);
  bootstrapUser(w.user);
  const head = git(w.user, ['rev-parse', 'HEAD']);
  // A tracked file the release does not cover: the launcher puts a covered one back before any command runs
  // (ARC-11-C141), so the user's own dirty tree is the one this refusal is about. DERIVED, never named: the coverage
  // grows, and README.md, the file this case edited, became a covered one in ARC-09-C185a. Then the launcher restored
  // it, the upgrade ran, and the case failed for a reason that had nothing to do with the refusal.
  const uncovered = git(w.user, ['ls-files']).split('\n').find((p) => p.endsWith('.md') && !isCovered(p, COVERAGE));
  assert.ok(uncovered, 'the fixture has no tracked page the release leaves out');
  writeFileSync(join(w.user, uncovered), `${readFileSync(join(w.user, uncovered), 'utf8')}\nedited\n`);

  const r = snowarch(w.user, ['upgrade', '--to', 'v9.1.0', '--yes'], { bin: w.bin });
  assert.equal(r.status, 2, r.text);
  assert.match(r.text, /tracked files are modified — commit or stash them first \(git stash\)/);
  assert.match(r.text, /nothing was changed/);
  // ARC-09-C120: and which ones.
  assert.ok(r.text.includes(`modified: ${uncovered}`), r.text);
  assert.equal(git(w.user, ['rev-parse', 'HEAD']), head, 'HEAD moved after a refusal');
}, MINUTES);

// ARC-09-C120 — the owner's rc.3 upgrade stopped at U5 on an untracked file the release tracks, and did not say why.
// Release B gains one tracked file here, and the user's checkout has that path untracked.
const EXTRA = { path: 'notes/sitting.txt', content: 'from the release\n' };

test('ARC-09-C120 — an untracked file the release tracks is refused at U4, by name, and nothing moves', async (t) => {
  const w = await buildWorld(t, { extraFile: EXTRA });
  bootstrapUser(w.user);
  const head = git(w.user, ['rev-parse', 'HEAD']);
  const refused = (named) => {
    const status = git(w.user, ['status', '--porcelain']);
    const r = snowarch(w.user, ['upgrade', '--to', 'v9.2.0', '--yes'], { bin: w.bin });
    assert.equal(r.status, 2, r.text);
    assert.match(r.text, new RegExp(`upgrade: 1 untracked file is in the way of v9\\.2\\.0: ${named} — move it aside or commit it; `
      + 'nothing was changed'));
    assert.match(r.text, /git refuses to overwrite an untracked file the target tracks, even with identical content/);
    assert.doesNotMatch(r.text, /\[U5\/7\]/, 'the refusal came after the tree started to move');
    assert.equal(git(w.user, ['rev-parse', 'HEAD']), head, 'HEAD moved after a refusal');
    assert.equal(git(w.user, ['status', '--porcelain']), status, 'the working tree changed after a refusal');
  };
  // Different content, then identical: git refuses both, so the plan does too.
  for (const content of ['mine\n', EXTRA.content]) {
    mkdirSync(join(w.user, 'notes'), { recursive: true });
    writeFileSync(join(w.user, EXTRA.path), content);
    refused('notes/sitting\\.txt');
    assert.equal(readFileSync(join(w.user, EXTRA.path), 'utf8'), content, 'the untracked file was touched');
  }
  rmSync(join(w.user, 'notes'), { recursive: true, force: true });
  await t.test('the same path in another case, on a case-insensitive checkout', (st) => {
    if (git(w.user, ['config', '--get', '--bool', 'core.ignorecase'], { allowFail: true }) !== 'true') {
      st.skip('this checkout is case-sensitive: Notes/ and notes/ are two directories here, and git checks out both');
      return;
    }
    mkdirSync(join(w.user, 'Notes'), { recursive: true });
    writeFileSync(join(w.user, 'Notes', 'sitting.txt'), 'mine\n');
    refused('Notes/sitting\\.txt');
  });
}, MINUTES);

test('ARC-09-C120 — a U5 failure the plan did not foresee names git\'s own reason', async (t) => {
  const w = await buildWorld(t);
  bootstrapUser(w.user);
  const head = git(w.user, ['rev-parse', 'HEAD']);
  // Measured: `git status` exits 0 with a stale index.lock, and `git checkout` exits 128 on it, so the preflight
  // and the plan pass and the move fails.
  const lock = join(w.user, '.git', 'index.lock');
  writeFileSync(lock, '');
  try {
    const r = snowarch(w.user, ['upgrade', '--to', 'v9.1.0', '--yes'], { bin: w.bin });
    assert.equal(r.status, 1, r.text);
    assert.match(r.text, /upgrade: git could not check out v9\.1\.0 — fatal: Unable to create '[^']+index\.lock': File exists\.; nothing else was changed/);
    assert.equal(git(w.user, ['rev-parse', 'HEAD']), head, 'HEAD moved after a failed checkout');
  } finally { rmSync(lock, { force: true }); }
}, MINUTES);

test('AC 4 — a dead proxy fails the fetch with git\'s error and the proxy remedy', async (t) => {
  const w = await buildWorld(t);
  bootstrapUser(w.user);
  const head = git(w.user, ['rev-parse', 'HEAD']);

  // An `https://` origin so git goes through the proxy at all, pointed at a CLOSED loopback port.
  // Never `.invalid` — that is a DNS failure, which is a different remedy and a different test.
  // The proxy is INJECTED into this child's environment; the runner's own is untouched.
  git(w.user, ['remote', 'set-url', 'origin', 'https://127.0.0.1:9/fixture.git']);
  const r = snowarch(w.user, ['upgrade', '--check'], { env: { HTTPS_PROXY: 'http://127.0.0.1:9' } });

  assert.equal(r.status, 1, r.text);
  assert.match(r.text, /docs\/TROUBLESHOOTING\.md#(proxy|tls-ca)/);
  assert.equal(git(w.user, ['rev-parse', 'HEAD']), head);
  assert.equal(existsSync(join(w.user, '.local/upgrade-check.json')), false,
    'a failed fetch wrote a cache, so the banner would report a check that never happened');
}, MINUTES);

test('AC 5 — --check says what is available, writes the cache, and the banner reads it', async (t) => {
  const w = await buildWorld(t);
  bootstrapUser(w.user);
  const head = git(w.user, ['rev-parse', 'HEAD']);

  const r = snowarch(w.user, ['upgrade', '--check'], { bin: w.bin });
  assert.equal(r.status, EXIT_BEHIND, r.text);
  assert.match(r.text, /v9\.2\.0 available \(you are on v9\.0\.0\)/);
  assert.equal(git(w.user, ['rev-parse', 'HEAD']), head, '--check moved the tree');

  const cache = JSON.parse(readFileSync(join(w.user, '.local/upgrade-check.json'), 'utf8'));
  assert.equal(cache.behind, true);
  assert.equal(cache.latestTag, 'v9.2.0');
  assert.equal(cache.localTag, 'v9.0.0');

  // The REAL hook, in the form ARC-08-S08's test uses. No network: it reads the file.
  const hook = () => execFileSync(process.execPath,
    [join(w.user, 'tools/snowarch/hooks/session-start.mjs')],
    { cwd: w.user, encoding: 'utf8',
      input: '{"hook_event_name":"SessionStart","source":"startup"}',
      env: { ...process.env, CLAUDE_PROJECT_DIR: w.user } });

  const lines = hook().trim().split('\n');
  assert.match(lines[0], /^Mode: /);
  assert.ok(lines.includes('A newer release is available (v9.2.0) — run ./snowarch upgrade.'),
    lines.join('\n'));
  // NOT timed here. One cold invocation on a runner that has just compiled a server measures the
  // runner, not the banner — it read 1320 ms on macOS while the median of five cold runs is 29 ms
  // on the same code. `scripts/ci/banner-timing.mjs` owns that budget and takes a median; what
  // this test owns is that the nudge appears at all, and disappears when the check goes stale.

  // …and eight days later it says nothing at all, rather than repeating a check nobody made.
  writeFileSync(join(w.user, '.local/upgrade-check.json'), `${JSON.stringify({
    ...cache, checkedAt: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString(),
  }, null, 2)}\n`);
  assert.equal(hook().includes('newer release'), false,
    'a week-old check still produced a nudge');
}, MINUTES);

test('AC 6 — n at the prompt changes nothing', async (t) => {
  const w = await buildWorld(t);
  bootstrapUser(w.user);
  const head = git(w.user, ['rev-parse', 'HEAD']);

  const r = snowarch(w.user, ['upgrade', '--to', 'v9.1.0'], { input: 'n\n', bin: w.bin });
  assert.equal(r.status, 0, r.text);
  assert.match(r.text, /upgrade: nothing changed/);
  assert.equal(git(w.user, ['rev-parse', 'HEAD']), head);
  // The plan was still printed: refusing is a decision the user makes from what they read.
  assert.match(r.text, /Upgrade plan: v9\.0\.0 → v9\.1\.0/);
}, MINUTES);

// ARC-09-C170 — the version the plan says you are upgrading FROM. The owner's v2.2.0-rc.1 upgrade, from a detached
// development commit, printed `import/engine-v2.8.0-worktree → v2.2.0-rc.1`: the from-label came from a `describe`
// with no `--match`, and this repository carries `import/*` tags from its predecessors. The doctor's describe matches
// `v*` only; the plan and `--check` now use it, and name the commit when no release tag describes it.
test('ARC-09-C170 — the from-label is a release tag or the commit, never an import/* tag', async (t) => {
  const w = await buildWorld(t);
  bootstrapUser(w.user);
  const IMPORT = 'import/engine-v9.0.0-worktree';

  // Two v* tags on HEAD: the version of record's, and a newer one, as a release's negative-test tag is. The version of
  // record's wins, as it does in the doctor's Engine line (ARC-09-C154).
  git(w.user, ['tag', '-a', 'v9.0.0-neg.1', '-m', 'a negative-test tag on the release commit']);
  const check0 = snowarch(w.user, ['upgrade', '--check'], { bin: w.bin });
  assert.match(check0.text, /v9\.2\.0 available \(you are on v9\.0\.0\)/, check0.text);
  const plan0 = snowarch(w.user, ['upgrade', '--to', 'v9.1.0'], { input: 'n\n', bin: w.bin });
  assert.match(plan0.text, /Upgrade plan: v9\.0\.0 → v9\.1\.0/, plan0.text);
  git(w.user, ['tag', '-d', 'v9.0.0-neg.1']);

  // A development commit past v9.0.0, with an import/* tag on it.
  git(w.user, ['commit', '--allow-empty', '-m', 'a development commit']);
  git(w.user, ['tag', IMPORT]);
  const past = git(w.user, ['rev-parse', '--short=7', 'HEAD']);
  const check = snowarch(w.user, ['upgrade', '--check'], { bin: w.bin });
  assert.match(check.text, new RegExp(`v9\\.2\\.0 available \\(you are on v9\\.0\\.0\\+1 \\(${past}\\)\\)`), check.text);
  const plan = snowarch(w.user, ['upgrade', '--to', 'v9.1.0'], { input: 'n\n', bin: w.bin });
  assert.match(plan.text, new RegExp(`Upgrade plan: v9\\.0\\.0\\+1 \\(${past}\\) → v9\\.1\\.0`), plan.text);
  assert.doesNotMatch(`${check.text}\n${plan.text}`, /import\//);

  // A commit no release tag describes at all, with the import/* tag moved onto it.
  git(w.user, ['checkout', '--orphan', 'c170-orphan']);
  assert.equal(git(w.user, ['symbolic-ref', '--short', 'HEAD']), 'c170-orphan', 'the orphan checkout did not take');
  git(w.user, ['commit', '-m', 'an orphan development commit']);
  git(w.user, ['tag', '-f', IMPORT]);
  const orphan = git(w.user, ['rev-parse', '--short=7', 'HEAD']);
  const plan2 = snowarch(w.user, ['upgrade', '--to', 'v9.1.0'], { input: 'n\n', bin: w.bin });
  assert.match(plan2.text, new RegExp(`Upgrade plan: a development tree at ${orphan} → v9\\.1\\.0`), plan2.text);
  assert.doesNotMatch(plan2.text, /import\//);
}, MINUTES);

// ARC-09-C185c — an install moved to the distribution repository, the move MIGRATION's "An install of a 2.2.1 release
// candidate, or later" describes. Its origin is set to a repository that starts at a later release. `git fetch --tags
// --prune` does NOT drop a tag the new origin lacks (only --prune-tags would): measured, so the install keeps naming the
// release it is on.
//
// ARC-09-C192 — THE DISTRIBUTION IS STAGED, as farstic/snowarch is: each release one commit of its own history, which
// shares nothing with the engineering repository's, and each manifest signed over that commit. The case first used a
// bare clone of the engineering origin, whose shared history proved a move the real repository never makes.
test('ARC-09-C185c — an install moved to a staged distribution, unrelated in history, keeps its tag and upgrades', async (t) => {
  const w = await buildWorld(t);
  bootstrapUser(w.user);
  const staged = join(w.scratch, 'staged');
  stage(w.work, staged, 'v9.1.0', { tag: true });
  stage(w.work, staged, 'v9.2.0', { onto: 'main', tag: true });
  const distribution = join(w.scratch, 'distribution.git');
  // Through the harness's git(), as every git call here is: core.longpaths on Windows (C27b).
  git(w.scratch, ['clone', '-q', '--bare', '--no-hardlinks', staged, distribution]);
  assert.equal(git(distribution, ['tag', '--list', 'v9.0.0']), '');
  republishManifests(w.licences, staged, ['v9.1.0', 'v9.2.0']);
  // An install made with `clone --branch` before those releases existed: its own tag, and none of the later ones.
  for (const tag of ['v9.1.0', 'v9.2.0']) {
    git(w.user, ['tag', '-d', tag]);
    assert.equal(git(w.user, ['tag', '--list', tag]), '', `${tag} is still here`);
  }
  git(w.user, ['remote', 'set-url', 'origin', pathToFileURL(distribution).href]);
  assert.equal(git(w.user, ['remote', 'get-url', 'origin']), pathToFileURL(distribution).href);

  const check = snowarch(w.user, ['upgrade', '--check'], { bin: w.bin });
  assert.match(check.text, /v9\.2\.0 available \(you are on v9\.0\.0\)/, check.text);
  // The fetch kept the tag the install was cut from: MIGRATION's sentence, measured.
  assert.equal(git(w.user, ['tag', '--list', 'v9.0.0']), 'v9.0.0', 'the fetch dropped the install\'s own tag');
  // No common ancestor: the release the install moves to shares no history with the one it is on.
  assert.equal(git(w.user, ['merge-base', 'HEAD', 'v9.1.0'], { allowFail: true }), null, 'the histories are related');
  // An install on a BRANCH pulls, and a fast-forward across unrelated histories is refused at U5 with the tag checkout
  // as the remedy. Nothing moves: HEAD, the branch and the working tree are as they were (measured: of `.local/`, only
  // the currency cache every fetch writes changed).
  const head = git(w.user, ['rev-parse', 'HEAD']);
  git(w.user, ['checkout', '-q', '-B', 'main', 'v9.0.0']);
  assert.equal(git(w.user, ['branch', '--show-current']), 'main');
  git(w.user, ['fetch', '-q', 'origin', '+refs/heads/main:refs/remotes/origin/main']);
  git(w.user, ['branch', '--set-upstream-to', 'origin/main', 'main']);
  assert.equal(git(w.user, ['rev-parse', '--abbrev-ref', 'main@{upstream}']), 'origin/main');
  const pulled = snowarch(w.user, ['upgrade', '--yes'], { bin: w.bin });
  assert.equal(pulled.status, 1, pulled.text);
  assert.match(pulled.text, /upgrade: main has diverged from origin\/main — resolve with git, or use --to v9\.2\.0 to check out the release tag/);
  assert.deepEqual([git(w.user, ['rev-parse', 'HEAD']), git(w.user, ['status', '--porcelain'])], [head, ''], 'the refusal moved the tree');
  git(w.user, ['checkout', '-q', '--detach', 'v9.0.0']);
  assert.equal(git(w.user, ['branch', '--show-current']), '', 'the install is not back on its tag');
  const plan = snowarch(w.user, ['upgrade', '--to', 'v9.1.0'], { input: 'n\n', bin: w.bin });
  assert.match(plan.text, /Upgrade plan: v9\.0\.0 → v9\.1\.0/, plan.text);

  // THE FULL MOVE, as the owner's and the colleague's installs make it (MIGRATION § "An install made before 2.2.1").
  const licence = join(w.user, '.local/licence.json');
  const licenceBefore = existsSync(licence) ? sha256(licence) : null;
  const storeBefore = sha256(storePath(w.user));
  const engagement = join(w.user, 'clients/acme/acme-engagement-state.md');
  mkdirSync(join(w.user, 'clients/acme'), { recursive: true });
  writeFileSync(engagement, '# acme\n');
  assert.equal(readFileSync(engagement, 'utf8'), '# acme\n');
  const moved = snowarch(w.user, ['upgrade', '--to', 'v9.1.0', '--yes'], { bin: w.bin });
  assert.equal(moved.status, 0, moved.text);
  const target = git(distribution, ['rev-parse', 'v9.1.0^{commit}']);
  assert.equal(git(w.user, ['rev-parse', 'HEAD']), target, 'the tree is not at the new origin\'s v9.1.0');
  // The version of record, as the product reads it (ARC-09-C137: a banner test does not open the file itself).
  const version = snowarch(w.user, ['version'], { bin: w.bin }).stdout;
  assert.match(version, /^snowarch 9\.1\.0 · /m, version);
  assert.match(version, /tag:\s+v9\.1\.0 \(exact\)/, version);
  // The integrity check reads the new tag's signed manifest, whose commit is the one the new origin's tag names.
  const report = JSON.parse(readFileSync(join(w.user, '.local/doctor-last.json'), 'utf8'));
  const e32 = (report.checks ?? []).find((c) => c.id === 'E-32');
  assert.match(e32?.detail ?? '', /^Integrity: verified · v9\.1\.0 · \d+ files$/, JSON.stringify(e32));
  // What the move leaves alone: the licence, the instance store, an engagement folder.
  assert.equal(existsSync(licence) ? sha256(licence) : null, licenceBefore, 'the licence state changed');
  assert.equal(sha256(storePath(w.user)), storeBefore, 'the move touched the credential store');
  assert.equal(readFileSync(engagement, 'utf8'), '# acme\n', 'the move touched an engagement folder');
  // The kept tag points at a commit the install already holds, and nothing reads it after the move: currency is read
  // from the release the tree is on.
  assert.equal(git(w.user, ['tag', '--list', 'v9.0.0']), 'v9.0.0');
  const after = snowarch(w.user, ['upgrade', '--check'], { bin: w.bin });
  assert.match(after.text, /v9\.2\.0 available \(you are on v9\.1\.0\)/, after.text);
}, MINUTES);

// ARC-09-C109 — what counts as an acceptance at `Proceed? [Y/n]`.
//
// `promptLine` in upgrade.mjs read a line and returned '' when stdin ended, and '' does not match
// /^n/i, so a closed stdin (`< /dev/null`, a CI step, a pipe that ended) ACCEPTED the plan and moved
// the tree. The shared reader in `tools/snowarch/lib/ask.mjs` has a contract for exactly this - null
// at end of input, "every caller treats it as a refusal, never as an empty answer" - and the upgrade
// was the fourth reader that did not honour it. Enter (an empty LINE) is still the default, yes.
test('ARC-09-C109 — a closed stdin is not an acceptance: nothing moves, exit 2, and the remedy says --yes', async (t) => {
  const w = await buildWorld(t);
  bootstrapUser(w.user);
  const head = git(w.user, ['rev-parse', 'HEAD']);

  const r = snowarch(w.user, ['upgrade', '--to', 'v9.1.0'], { input: '', bin: w.bin });
  assert.equal(r.status, 2, r.text);
  assert.equal(git(w.user, ['rev-parse', 'HEAD']), head, 'the tree moved on a closed stdin');
  assert.match(r.text, /Upgrade plan: v9\.0\.0 → v9\.1\.0/);            // the plan was still printed
  assert.match(r.text, /no answer on stdin[^\n]*nothing was changed[^\n]*--yes/);
  assert.doesNotMatch(r.text, /\[U5\/7\]/);                                // step 5 never started
}, MINUTES);

test('ARC-09-C109 — a word that is not yes is not an acceptance either', async (t) => {
  const w = await buildWorld(t);
  bootstrapUser(w.user);
  const head = git(w.user, ['rev-parse', 'HEAD']);

  const r = snowarch(w.user, ['upgrade', '--to', 'v9.1.0'], { input: 'maybe\n', bin: w.bin });
  assert.equal(r.status, 0, r.text);
  assert.match(r.text, /upgrade: nothing changed/);
  assert.equal(git(w.user, ['rev-parse', 'HEAD']), head);
}, MINUTES);

test('ARC-09-C109 control — Enter at the prompt is still yes: the default has not moved', async (t) => {
  const w = await buildWorld(t);
  bootstrapUser(w.user);

  const r = snowarch(w.user, ['upgrade', '--to', 'v9.1.0'], { input: '\n', bin: w.bin });
  assert.equal(r.status, 0, r.text);
  assert.equal(git(w.user, ['describe', '--tags', '--exact-match']), 'v9.1.0');
}, MINUTES);

test('AC 8 — a Claude Code below the tag\'s floor stops the upgrade, and --force-floor does not',
  async (t) => {
    const w = await buildWorld(t, { claudeFloor: '9.9.9' });
    bootstrapUser(w.user);
    const head = git(w.user, ['rev-parse', 'HEAD']);
    // This world's own shim is NOT used: the point is a Claude Code below the floor, so the low
    // one goes first on PATH and is the one B00 and U4 both find.
    const shim = fakeClaude(join(w.scratch, 'shim'), '2.1.100 (Claude Code)');
    const env = { PATH: `${shim}${isWindows ? ';' : ':'}${process.env.PATH}` };

    const r = snowarch(w.user, ['upgrade', '--to', 'v9.1.0', '--yes'], { env });
    assert.equal(r.status, 2, r.text);
    assert.match(r.text, /claude-floor 9\.9\.9 \(installed 2\.1\.100 — BELOW the floor; upgrade Claude Code first\)/);
    assert.match(r.text, /nothing was changed/);
    assert.equal(git(w.user, ['rev-parse', 'HEAD']), head);

    // `--force-floor` gets past THIS command's refusal — and then the bootstrap's own preflight
    // refuses, because `engine.config.json`'s floor is a separate promise the release does not
    // get to waive. That is the right layering and worth asserting rather than working around:
    // the flag overrides the TAG's request, not the engine's requirement.
    const forced = snowarch(w.user, ['upgrade', '--to', 'v9.1.0', '--yes', '--force-floor'], { env });
    assert.match(forced.text, /BELOW the floor/, 'the line is still printed when the flag is used');
    assert.match(forced.text, /\[U5\/7\] move the checkout/, '--force-floor did not get past the plan');
    assert.equal(git(w.user, ['describe', '--tags', '--exact-match']), 'v9.1.0',
      'the tree did not move');
    assert.notEqual(forced.status, 0, 'the bootstrap preflight must still enforce the engine floor');
    assert.match(forced.text, /Claude Code 2\.1\.100 found, ≥ 2\.1\.214 required/);
  }, MINUTES);

test('a target that is not a release tag of this product is refused by name', async (t) => {
  const w = await buildWorld(t);
  bootstrapUser(w.user);
  git(w.user, ['tag', 'v9.5.0']);            // lightweight: no message, no contract trailer
  const head = git(w.user, ['rev-parse', 'HEAD']);

  const r = snowarch(w.user, ['upgrade', '--to', 'v9.5.0', '--yes'], { bin: w.bin });
  assert.equal(r.status, 1, r.text);
  assert.match(r.text, /v9\.5\.0 is not a release tag of this product/);
  assert.equal(git(w.user, ['rev-parse', 'HEAD']), head);
}, MINUTES);

test('already on the newest release is a sentence, not a no-op that looks like a failure', async (t) => {
  const w = await buildWorld(t);
  bootstrapUser(w.user);
  assert.equal(snowarch(w.user, ['upgrade', '--to', 'v9.2.0', '--yes'], { bin: w.bin }).status, 0);

  const again = snowarch(w.user, ['upgrade', '--to', 'v9.2.0', '--yes'], { bin: w.bin });
  assert.equal(again.status, 0, again.text);
  assert.match(again.text, /up to date \(v9\.2\.0\)/);

  const check = snowarch(w.user, ['upgrade', '--check'], { bin: w.bin });
  assert.equal(check.status, 0, 'exit 4 means BEHIND, and this checkout is not');
  assert.match(check.text, /up to date \(v9\.2\.0\)/);
}, MINUTES);

test('AC 7 — an upgrade that stops mid-way resumes where it stopped', async (t) => {
  const w = await buildWorld(t);
  bootstrapUser(w.user);

  // The stop is PLANTED, not timed: a SIGINT at a wall-clock guess is a test that passes on a fast
  // machine and hangs on a slow one. What it plants is the state a Ctrl-C during B02 leaves — a
  // step recorded `fail` with everything before it `ok` — by moving the corpus upstream out of the
  // way. It has to be outside git: an edit to `engine.config.json` would be replaced by the tag's
  // own copy at `git checkout`, which is what the first version of this test discovered.
  // `fileURLToPath`, never the scheme cut off the front. On Windows the URL is
  // `file:///C:/Users/RUNNER~1/…` with the tilde percent-encoded, so `.replace('file://','')`
  // produced `/C:/Users/RUNNER%7E1/…`, which resolved against the drive as `D:\C:\Users\…` and
  // could not be renamed. This repository documents that trap in three other modules and I wrote
  // the wrong one anyway; the Windows cell is what caught it.
  const upstream = fileURLToPath(JSON.parse(readFileSync(join(w.user, 'engine.config.json'), 'utf8'))
    .docs.upstream);
  const parked = `${upstream}.parked`;
  renameSync(upstream, parked);
  // …and the corpus is EMPTIED, because a re-sparse of a checkout that is already there never asks
  // the upstream anything: B02 has to CLONE for the missing upstream to be felt. Emptied rather
  // than removed, and rather than just losing its `.git`: an absent directory makes the gitlink
  // modified and U1 refuses the whole upgrade (correctly), and a directory with files but no
  // `.git` makes the clone fail with "already exists and is not empty" on the RESUME too — which
  // is a fixture that cannot be repaired, not a step that can.
  const corpus = join(w.user, 'vendor', 'ServiceNowDocs');
  for (const entry of readdirSync(corpus)) {
    rmSync(join(corpus, entry), { recursive: true, force: true });
  }

  const broken = snowarch(w.user, ['upgrade', '--to', 'v9.1.0', '--yes'], { bin: w.bin });
  assert.notEqual(broken.status, 0, 'the fixture did not actually stop the run');
  assert.match(broken.text, /\[B02\/09\] docs … FAIL/);

  // The promise the story makes about a failure: the tree is AT the new tag and the state file
  // records which step stopped, so a re-run finishes rather than starting over.
  assert.equal(git(w.user, ['describe', '--tags', '--exact-match']), 'v9.1.0');
  assert.match(broken.text, /the tree is at v9\.1\.0 and the state file records the step/);
  const stopped = state(w.user);
  assert.equal(stopped.steps.B02.status, 'fail');
  assert.equal(stopped.steps.B01.status, 'ok', 'a step before the failure was lost');

  // Fix the cause the way a user would, and run it again. B01 is still cached; B02 finishes.
  renameSync(parked, upstream);
  const again = snowarch(w.user, ['upgrade', '--to', 'v9.1.0', '--yes'], { bin: w.bin });
  assert.equal(again.status, 0, again.text);
  assert.match(again.text, /\[B01\/09\][^\n]*ok \(cached\)/, 'the resume re-ran a step it had done');
  assert.match(again.text, /\[B02\/09\] docs … (ok|warn)/, 'the resume did not complete B02');
  assert.notEqual(state(w.user).steps.B02.status, 'fail');
}, MINUTES);
