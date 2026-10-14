// Copyright 2026 Cvetomir Grigorov. Licensed under the Apache License, Version 2.0 (see LICENSE).
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
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import {
  existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, statSync, writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { EXIT_BEHIND } from '../../tools/snowarch/lib/commands/upgrade.mjs';
import { manifestFromArchive, signManifest, writeManifestCache } from '../../tools/snowarch/lib/licence/manifest.mjs';
import { licenceFixture } from '../../tools/snowarch/tests/helpers/licence-hook/index.mjs';
import { bootstrapUser, buildEnforcementWorld, buildManifestWorld, buildWorld, fakeClaude, git, snowarch } from './harness.mjs';

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
  writeFileSync(join(w.user, 'CLAUDE.md'), `${readFileSync(join(w.user, 'CLAUDE.md'), 'utf8')}\nedited\n`);

  const r = snowarch(w.user, ['upgrade', '--to', 'v9.1.0', '--yes'], { bin: w.bin });
  assert.equal(r.status, 2, r.text);
  assert.match(r.text, /tracked files are modified — commit or stash them first \(git stash\)/);
  assert.match(r.text, /nothing was changed/);
  // ARC-09-C120: and which ones.
  assert.match(r.text, /modified: CLAUDE\.md/);
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

// ── ARC-11-C6 — a user without a licence ─────────────────────────────────────────────────────────────────
//
// The owner's own path: a checkout on the last release that runs without a licence, upgrading to the first that
// refuses. U1 to U5 and finish() are 2.0.12's code, and U6 and U7 are 2.0.13's bootstrap and doctor. By the owner's
// ruling from the rc.3 sitting (2026-10-13), "the user must not learn how to have a working Architect without a
// licence": what U7 shows is E-31's FAIL and its remedy, and nothing that sends the reader back.

test('ARC-11-C6 — 2.0.12 to 2.0.13 with no licence: E-31 FAIL at U7 with no way back; the move back refused, licensed taken', async (t) => {
  const w = await buildEnforcementWorld(t);
  bootstrapUser(w.user, { store: false, licence: false });
  const up = snowarch(w.user, ['upgrade', '--yes'], { bin: w.bin, licence: false });
  assert.equal(git(w.user, ['describe', '--tags', '--exact-match']), 'v2.0.13', up.text);
  assert.ok(up.text.includes('[U7/7]'), up.text);
  const u7 = up.text.slice(up.text.indexOf('[U7/7]'));
  // The line a user reads at U7, in every cell's log (the owner's rule), spelled for the shell the cell runs.
  t.diagnostic(u7.split('\n').find((l) => l.includes('E-31')) ?? 'U7 printed no E-31 line');
  assert.match(u7, /E-31 FAIL/, u7);
  assert.ok(u7.includes('.local/licence.json'), u7);
  assert.equal(u7.includes('upgrade --to'), false, u7);

  // And the path is closed (the owner's ruling): with no licence in force, a move to a release at or below the last
  // that enforces nothing is refused before anything moves, exit 3, with the code and the remedy, and no word of why.
  const refused = snowarch(w.user, ['upgrade', '--to', 'v2.0.12', '--yes'], { bin: w.bin, licence: false });
  t.diagnostic(refused.text.split('\n').find((l) => l.includes('LICENCE_NOT_VALID')) ?? 'no refusal line');
  assert.equal(refused.status, 3, refused.text);
  assert.match(refused.text, /\(Code: LICENCE_NOT_VALID\)/, refused.text);
  assert.ok(refused.text.includes('licence check'), refused.text);
  assert.equal(/last release that runs without|go back to|unenforced|without enforcement/i.test(refused.text), false, refused.text);
  assert.equal(git(w.user, ['describe', '--tags', '--exact-match']), 'v2.0.13', refused.text);

  // The owner's own way back stays: with a licence in force, the same move is taken.
  const licensed = snowarch(w.user, ['upgrade', '--to', 'v2.0.12', '--yes'], { bin: w.bin });
  assert.equal(licensed.status, 0, licensed.text);
  assert.equal(git(w.user, ['describe', '--tags', '--exact-match']), 'v2.0.12', licensed.text);
}, 2 * MINUTES);

test('ARC-11-C6 — with no licence, U4 says what the release refuses and the remedy, with --yes and without', async (t) => {
  const w = await buildWorld(t);
  bootstrapUser(w.user, { licence: false });
  const head = git(w.user, ['rev-parse', 'HEAD']);
  const said = (text) => text.indexOf('Licence: missing — v9.1.0 runs no MCP tool');

  // Without --yes: said before the question, and a no changes nothing.
  const asked = snowarch(w.user, ['upgrade', '--to', 'v9.1.0'], { input: 'n\n', bin: w.bin, licence: false });
  assert.equal(asked.status, 0, asked.text);
  assert.ok(said(asked.text) > -1, asked.text);
  assert.ok(said(asked.text) < asked.text.indexOf('Proceed? [Y/n]'), 'the notice comes after the question');
  assert.equal(asked.text.includes('upgrade --to v2.0.12'), false, asked.text);
  assert.equal(git(w.user, ['rev-parse', 'HEAD']), head);

  // With --yes: said, and the move goes ahead, because it is still the reader's to make.
  const moved = snowarch(w.user, ['upgrade', '--to', 'v9.1.0', '--yes'], { bin: w.bin, licence: false });
  assert.ok(said(moved.text) > -1, moved.text);
  assert.equal(git(w.user, ['describe', '--tags', '--exact-match']), 'v9.1.0', moved.text);
}, MINUTES);

// ── ARC-11-C7 — a target from 2.1 on moves only with its signed manifest ─────────────────────────────────────────

test('ARC-11-C7 — a target with no signed manifest, or one that is not its own, is refused at U4, and nothing moves', async (t) => {
  const w = await buildWorld(t, { unsigned: ['v9.1.0'], altered: ['v9.2.0'] });
  bootstrapUser(w.user);
  const head = git(w.user, ['rev-parse', 'HEAD']);
  const status = git(w.user, ['status', '--porcelain']);
  const none = snowarch(w.user, ['upgrade', '--to', 'v9.1.0', '--yes'], { bin: w.bin });
  assert.equal(none.status, 1, none.text);
  assert.match(none.text, /upgrade: v9\.1\.0 has no verified signed manifest \(release manifest: none is published for v9\.1\.0\) — nothing was changed/);
  const altered = snowarch(w.user, ['upgrade', '--to', 'v9.2.0', '--yes'], { bin: w.bin });
  assert.equal(altered.status, 1, altered.text);
  assert.match(altered.text, /upgrade: v9\.2\.0 has no verified signed manifest \(1 file in the published manifest differs from v9\.2\.0's own, the first CLAUDE\.md\) — nothing was changed/);
  for (const r of [none, altered]) assert.doesNotMatch(r.text, /\[U5\/7\]/, 'the refusal came after the tree started to move');
  assert.equal(git(w.user, ['rev-parse', 'HEAD']), head, 'HEAD moved after a refusal');
  assert.equal(git(w.user, ['status', '--porcelain']), status, 'the working tree changed after a refusal');
}, MINUTES);

test('ARC-11-C7 — a covered directory with a file the release does not ship stops the upgrade after U5, before U6', async (t) => {
  const w = await buildWorld(t);
  bootstrapUser(w.user);
  mkdirSync(join(w.user, '.claude', 'skills', 'mine'), { recursive: true });
  writeFileSync(join(w.user, '.claude', 'skills', 'mine', 'SKILL.md'), 'a skill nobody shipped\n');
  const r = snowarch(w.user, ['upgrade', '--to', 'v9.1.0', '--yes'], { bin: w.bin });
  assert.equal(r.status, 1, r.text);
  assert.match(r.text, /release manifest: v9\.1\.0 fetched \(\d+ files\)/);
  assert.match(r.text, /upgrade: the tree at v9\.1\.0 is not what its signed manifest records — 1 file differs, the first \.claude\/skills\/mine\/SKILL\.md \(extra\); the upgrade stops before the bootstrap — return with: git checkout /);
  assert.doesNotMatch(r.text, /\[U6\/7\]/, 'the bootstrap ran on a tree that is not the release');
}, MINUTES);

// ── ARC-09-C140 — B01 fetches the manifest whenever none is held for the release ─────────────────────────────────

const BOOTSTRAP = ['bootstrap', '--mode', 'design', '--yes', '--skip-claude-check', '--docs', 'sparse'];
const VERIFIED_RC1 = /Integrity: verified · v2\.1\.0-rc\.1 · \d+ files/;
const between = (text, from, to = null) => {
  const a = text.indexOf(from);
  if (a === -1) return '';
  const b = to === null ? -1 : text.indexOf(to, a);
  return text.slice(a, b === -1 ? undefined : b);
};
/** E-32 as U7's (or the last) doctor wrote it to `.local/doctor-last.json`. */
const e32 = (user) => (JSON.parse(readFileSync(join(user, '.local/doctor-last.json'), 'utf8')).checks ?? [])
  .find((c) => c.id === 'E-32') ?? null;
/** The steps the plan promised, from its one line: `steps that will re-run: B02 … (…); B06 … (…)`. */
const planned = (text) => {
  const line = text.split('\n').find((l) => l.includes('steps that will re-run: ')) ?? '';
  const list = line.slice(line.indexOf('steps that will re-run: ') + 'steps that will re-run: '.length);
  return list.startsWith('none') ? [] : list.split('; ').map((item) => item.slice(0, 3)).sort();
};
/** The steps that RAN in a bootstrap's output: every `[Bnn/09]` line that is not cached or skipped, but B00 and B09. */
const ran = (text) => text.split(/\r?\n/)
  .map((l) => /\[(B\d\d)\/09\] .* … (.+)$/.exec(l))
  .filter((m) => m && !['B00', 'B09'].includes(m[1]) && m[2] !== 'ok (cached)' && !m[2].startsWith('skipped'))
  .map((m) => m[1]).sort();

test('ARC-09-C140 — 2.0.13 to 2.1.0-rc.1: B01 fetches the manifest the old U4 never did, U7 reads verified, and a held one is not fetched again', async (t) => {
  const w = await buildManifestWorld(t);
  bootstrapUser(w.user, { store: false });
  const cache = join(w.user, '.local', 'release-manifest.json');
  assert.equal(existsSync(cache), false, '2.0.13 wrote a manifest cache, so this is not the owner\'s starting point');
  const gone = `${w.licences.bare}.gone`;
  const status = () => snowarch(w.user, ['status'], { bin: w.bin }).text;

  // (a) The owner's sequence: 2.0.13's U1 to U5 fetch nothing, and U6 is 2.1.0-rc.1's bootstrap with B01's inputs
  // unchanged. Before ARC-09-C140 it printed `[B01/09] workspace … ok (cached)` and U7 ended in E-32 FAIL.
  const up = snowarch(w.user, ['upgrade', '--to', 'v2.1.0-rc.1', '--yes'], { bin: w.bin });
  assert.equal(git(w.user, ['describe', '--tags', '--exact-match']), 'v2.1.0-rc.1', up.text);
  const u6 = between(up.text, '[U6/7]', '[U7/7]');
  t.diagnostic(`(a) ${u6.split('\n').find((l) => l.includes('[B01/09]')) ?? 'U6 printed no B01 line'}`);
  t.diagnostic(`(a) ${u6.split('\n').find((l) => l.includes('release manifest:')) ?? 'U6 printed no manifest line'}`);
  assert.doesNotMatch(u6, /\[B01\/09\][^\n]*\(cached\)/, u6);
  assert.match(u6, /release manifest: v2\.1\.0-rc\.1 fetched \(\d+ files\)/, u6);
  const u7 = between(up.text, '[U7/7]');
  t.diagnostic(`(a) ${u7.split('\n').find((l) => l.includes('E-32')) ?? 'U7 printed no E-32 line (ok checks are not listed)'}`);
  assert.doesNotMatch(u7, /E-32\s+FAIL/, u7);
  assert.equal(e32(w.user)?.status, 'ok', JSON.stringify(e32(w.user)));
  assert.match(status(), VERIFIED_RC1);

  // (b) Down to 2.0.13 and back, with the licences repository gone: the cache survives both moves and is this
  // release's, so B01 stays cached, nothing is fetched, and E-32 reads verified straight away.
  const down = snowarch(w.user, ['upgrade', '--to', 'v2.0.13', '--yes'], { bin: w.bin });
  assert.equal(git(w.user, ['describe', '--tags', '--exact-match']), 'v2.0.13', down.text);
  assert.ok(existsSync(cache), 'the cache did not survive the move to 2.0.13');
  renameSync(w.licences.bare, gone);
  const back = snowarch(w.user, ['upgrade', '--to', 'v2.1.0-rc.1', '--yes'], { bin: w.bin });
  assert.equal(git(w.user, ['describe', '--tags', '--exact-match']), 'v2.1.0-rc.1', back.text);
  assert.match(between(back.text, '[U6/7]', '[U7/7]'), /\[B01\/09\][^\n]*ok \(cached\)/, back.text);
  assert.doesNotMatch(back.text, /release manifest:/, 'a held manifest was fetched again');
  assert.equal(e32(w.user)?.status, 'ok', JSON.stringify(e32(w.user)));
  assert.match(status(), VERIFIED_RC1);

  // (c) A cache that holds another release's manifest, signed and valid: B01 runs for it and fetches this one.
  renameSync(gone, w.licences.bare);
  writeManifestCache(w.user, { tag: 'v2.0.13', checkedAt: new Date().toISOString(), source: 'fixture',
    doc: signManifest(manifestFromArchive(w.work, 'v2.0.13'), licenceFixture().primary.privateKey) });
  const other = snowarch(w.user, BOOTSTRAP, { bin: w.bin });
  assert.equal(other.status, 0, other.text);
  assert.doesNotMatch(other.text, /\[B01\/09\][^\n]*\(cached\)/, other.text);
  assert.match(other.text, /release manifest: v2\.1\.0-rc\.1 fetched \(\d+ files\)/, other.text);
  assert.match(status(), VERIFIED_RC1);

  // (d) No network and no manifest: B01 warns with the reason, and E-32 FAILs with the remedy. Nothing crashes.
  rmSync(cache);
  renameSync(w.licences.bare, gone);
  const offline = snowarch(w.user, BOOTSTRAP, { bin: w.bin });
  assert.equal(offline.status, 0, offline.text);
  assert.match(offline.text, /\[B01\/09\][^\n]*warn/, offline.text);
  assert.match(offline.text, /release manifest: could not be reached \(/, offline.text);
  const doctor = snowarch(w.user, ['doctor'], { bin: w.bin });
  t.diagnostic(`(d) ${doctor.text.split('\n').find((l) => l.includes('E-32')) ?? 'the doctor printed no E-32 line'}`);
  assert.match(doctor.text, /E-32\s+FAIL/, doctor.text);
  assert.ok(doctor.text.includes('Integrity: cannot restore — no signed manifest for v2.1.0-rc.1'), doctor.text);
  assert.ok(doctor.text.includes('licence check --refresh'), doctor.text);
  assert.doesNotMatch(`${offline.text}${doctor.text}`, /crashed|TypeError|ReferenceError/);
}, 3 * MINUTES);

test('ARC-09-C140 — 2.1 to 2.1: the plan and the run agree on B01, after an install that could not fetch and after one that did', async (t) => {
  const w = await buildWorld(t);
  const gone = `${w.licences.bare}.gone`;

  // An install with no network: B01 warns, E-32 FAILs with the remedy.
  renameSync(w.licences.bare, gone);
  const install = bootstrapUser(w.user);
  assert.match(install, /release manifest: could not be reached \(/, install);
  const doctor = snowarch(w.user, ['doctor'], { bin: w.bin });
  assert.match(doctor.text, /E-32\s+FAIL/, doctor.text);
  assert.ok(doctor.text.includes('licence check --refresh'), doctor.text);
  renameSync(gone, w.licences.bare);

  // 9.0.0 → 9.1.0: B01's last run warned, so the plan names it and the run runs it, line for line.
  const one = snowarch(w.user, ['upgrade', '--to', 'v9.1.0', '--yes'], { bin: w.bin });
  assert.equal(one.status, 0, one.text);
  t.diagnostic(`9.0.0 → 9.1.0 plan ${planned(one.text).join(', ') || '(none)'} · ran ${ran(between(one.text, '[U6/7]', '[U7/7]')).join(', ') || '(none)'}`);
  assert.ok(planned(one.text).includes('B01'), one.text);
  assert.deepEqual(ran(between(one.text, '[U6/7]', '[U7/7]')), planned(one.text), one.text);
  assert.equal(e32(w.user)?.status, 'ok', JSON.stringify(e32(w.user)));

  // 9.1.0 → 9.2.0: U5 writes the target's manifest, so the plan leaves B01 out and U6 finds it cached.
  const two = snowarch(w.user, ['upgrade', '--to', 'v9.2.0', '--yes'], { bin: w.bin });
  assert.equal(two.status, 0, two.text);
  t.diagnostic(`9.1.0 → 9.2.0 plan ${planned(two.text).join(', ') || '(none)'} · ran ${ran(between(two.text, '[U6/7]', '[U7/7]')).join(', ') || '(none)'}`);
  assert.equal(planned(two.text).includes('B01'), false, two.text);
  assert.match(between(two.text, '[U6/7]', '[U7/7]'), /\[B01\/09\][^\n]*ok \(cached\)/, two.text);
  assert.deepEqual(ran(between(two.text, '[U6/7]', '[U7/7]')), planned(two.text), two.text);
  assert.equal(e32(w.user)?.status, 'ok', JSON.stringify(e32(w.user)));

  // And B01's own write does not make it stale: a second bootstrap finds it cached. (What else re-runs here is not
  // B01's: B02's recorded warn is the fixture corpus's dead citations, which every bootstrap in this world reports.)
  const again = snowarch(w.user, BOOTSTRAP, { bin: w.bin });
  assert.equal(again.status, 0, again.text);
  t.diagnostic(`second bootstrap ran ${ran(again.text).join(', ') || 'B00 and B09 only'}`);
  assert.match(again.text, /\[B01\/09\][^\n]*ok \(cached\)/, again.text);
  assert.equal(ran(again.text).includes('B01'), false, again.text);
}, 3 * MINUTES);
