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
  existsSync, readFileSync, readdirSync, renameSync, rmSync, statSync, writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { EXIT_BEHIND } from '../../tools/snowarch/lib/commands/upgrade.mjs';
import { bootstrapUser, buildWorld, fakeClaude, git, snowarch } from './harness.mjs';

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
  assert.equal(JSON.parse(readFileSync(join(w.user, '.local/doctor-last.json'), 'utf8'))
    .summary.fail >= 0, true);
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
  assert.equal(git(w.user, ['rev-parse', 'HEAD']), head, 'HEAD moved after a refusal');
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
