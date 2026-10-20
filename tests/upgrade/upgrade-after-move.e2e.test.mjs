// Copyright 2026 Cvetomir Grigorov. Licensed under the Business Source License 1.1 (see LICENSE).
// snowarch — AI ServiceNow Architect. Not affiliated with or endorsed by ServiceNow, Inc.
/**
 * ARC-09-C215 — the upgrade cases whose subject is the run after a move, end to end, against the same
 * harness as `upgrade.e2e.test.mjs`.
 *
 * THE RULE, by subject and never by seconds: a case belongs here when what it measures is the run after a
 * move — what the next `upgrade`, the next bootstrap or U7 reads from the state the move left at the tag:
 * resuming, continuing at the tag, "up to date", and what is re-run. The move itself stays in
 * `upgrade.e2e.test.mjs`, and the licence gate and the signed manifest in `upgrade-licence.e2e.test.mjs`.
 * A new case goes to the file its subject names; the two Windows shards' times follow from that, and are
 * measured rather than balanced (ARC-09-C158).
 *
 * The cases were moved verbatim from `upgrade.e2e.test.mjs`, whose Windows shard reached ARC-09-C134's
 * 45 minutes on a slow runner with every case passing (run 39466322223, 44.6 min of cases).
 *
 * Every case runs the command the way a user runs it, in a clone with a real origin, and builds its own
 * world, so no case here depends on one in another file.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { bootstrapUser, buildWorld, git, snowarch } from './harness.mjs';

const MINUTES = 10 * 60 * 1000;

const state = (user) => JSON.parse(readFileSync(join(user, '.local/bootstrap-state.json'), 'utf8'));

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
  // ARC-09-C196 — the line no longer claims the state file records the step: a bootstrap that died before its first
  // entry recorded none. Here B02 did record its failure, which the next assertions read.
  assert.match(broken.text, /the tree is at v9\.1\.0; re-run /);
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

// ── ARC-09-C196 — a move that did not finish is never "up to date" ───────────────────────────────────────────────────

const STATE = '.local/bootstrap-state.json';

test('ARC-09-C196 — a bootstrap interrupted after the move continues on the next run', async (t) => {
  const w = await buildWorld(t);
  bootstrapUser(w.user);
  const up = snowarch(w.user, ['upgrade', '--to', 'v9.1.0', '--yes'], { bin: w.bin });
  assert.equal(up.status, 0, up.text);

  // interrupt()'s OWN record, written by calling it as a Ctrl-C during B02 would: status 'failed', reason
  // 'interrupted'. failedStep tested 'fail' and 'interrupted', so the next run read "up to date".
  const { interrupt } = await import('../../tools/snowarch/lib/steps/index.mjs');
  const recorded = state(w.user);
  interrupt({ root: w.user, state: recorded, live: { step: 'B02' }, onLine: () => {} });
  assert.deepEqual([state(w.user).steps.B02.status, state(w.user).steps.B02.reason], ['failed', 'interrupted']);

  const again = snowarch(w.user, ['upgrade', '--to', 'v9.1.0', '--yes'], { bin: w.bin });
  assert.equal(again.status, 0, again.text);
  assert.match(again.text, /already at v9\.1\.0; the last run stopped at B02 — continuing from there/, again.text);
  // B02 ran to its end: ok, or warn in this world, whose fixture corpus warns.
  assert.ok(['ok', 'warn'].includes(state(w.user).steps.B02.status), again.text);
  // And it does not loop: the next run is up to date.
  const third = snowarch(w.user, ['upgrade', '--to', 'v9.1.0', '--yes'], { bin: w.bin });
  assert.match(third.text, /up to date \(v9\.1\.0\)/, third.text);
}, 2 * MINUTES);

test('ARC-09-C196 — a move whose bootstrap recorded nothing continues on the next run, then is up to date', async (t) => {
  const w = await buildWorld(t);
  bootstrapUser(w.user);
  // The state as it stood before the move is the state a U6 that saved nothing leaves: the bootstrap died before
  // its first entry, or was killed, or the run stopped between U5 and U6.
  const before = readFileSync(join(w.user, STATE), 'utf8');
  const up = snowarch(w.user, ['upgrade', '--to', 'v9.1.0', '--yes'], { bin: w.bin });
  assert.equal(up.status, 0, up.text);
  writeFileSync(join(w.user, STATE), before);
  assert.equal(readFileSync(join(w.user, STATE), 'utf8'), before, 'the pre-move state was not put back');

  // v9.1.0 changes vendor/docs-areas.txt, B02's input: the plan the tag's own runner asks names it.
  const again = snowarch(w.user, ['upgrade', '--to', 'v9.1.0', '--yes'], { bin: w.bin });
  assert.equal(again.status, 0, again.text);
  assert.match(again.text,
    /already at v9\.1\.0, with steps still to run \([^)]*B02: inputs changed[^)]*\) — continuing from there/, again.text);
  assert.doesNotMatch(again.text, /\[B02\/09\][^\n]*ok \(cached\)/, `B02 did not re-run:\n${again.text}`);
  // No loop: the hashes the real bootstrap just recorded are the plan's, so the next run is up to date.
  const third = snowarch(w.user, ['upgrade', '--to', 'v9.1.0', '--yes'], { bin: w.bin });
  assert.equal(third.status, 0, third.text);
  assert.match(third.text, /up to date \(v9\.1\.0\)/, third.text);
}, 3 * MINUTES);

test('ARC-09-C196 — the control: a finished move is up to date on the next run', async (t) => {
  const w = await buildWorld(t);
  bootstrapUser(w.user);
  const up = snowarch(w.user, ['upgrade', '--to', 'v9.1.0', '--yes'], { bin: w.bin });
  assert.equal(up.status, 0, up.text);
  const again = snowarch(w.user, ['upgrade', '--to', 'v9.1.0', '--yes'], { bin: w.bin });
  assert.equal(again.status, 0, again.text);
  assert.match(again.text, /up to date \(v9\.1\.0\)/, again.text);
  assert.doesNotMatch(again.text, /continuing from there/, again.text);
}, 2 * MINUTES);

test('ARC-09-C196 — at the tag, a manifest cache that does not hold this release is a step to run, not "up to date"', async (t) => {
  // U5 writes the verified manifest before U6; the at-target path writes none. So a stopped move that left the cache
  // without this release's manifest is a real reason to continue, and B01 refreshes it: the resume heals itself.
  const w = await buildWorld(t);
  bootstrapUser(w.user);
  const up = snowarch(w.user, ['upgrade', '--to', 'v9.1.0', '--yes'], { bin: w.bin });
  assert.equal(up.status, 0, up.text);
  const cache = join(w.user, '.local', 'release-manifest.json');
  rmSync(cache);
  assert.equal(existsSync(cache), false, 'the manifest cache was not removed');

  const again = snowarch(w.user, ['upgrade', '--to', 'v9.1.0', '--yes'], { bin: w.bin });
  assert.equal(again.status, 0, again.text);
  assert.match(again.text,
    /already at v9\.1\.0, with steps still to run \([^)]*B01: the release manifest is not held[^)]*\) — continuing from there/,
    again.text);
  assert.ok(existsSync(cache), `B01 did not put the release manifest back:\n${again.text}`);
  const third = snowarch(w.user, ['upgrade', '--to', 'v9.1.0', '--yes'], { bin: w.bin });
  assert.match(third.text, /up to date \(v9\.1\.0\)/, third.text);
}, 3 * MINUTES);

test('ARC-09-C196 — a step that warned before a move that changed its inputs still runs at the tag', async (t) => {
  // At the tag a recorded warn is judged by its hash, like ok: finished unless its inputs changed. v9.1.0 changes
  // B02's input, so a pre-move state with B02 warned must still continue, and the next run must be up to date.
  const w = await buildWorld(t);
  bootstrapUser(w.user);
  const planted = state(w.user);
  planted.steps.B02.status = 'warn';
  writeFileSync(join(w.user, STATE), `${JSON.stringify(planted, null, 2)}\n`);
  assert.equal(state(w.user).steps.B02.status, 'warn', 'the warn was not planted');
  const before = readFileSync(join(w.user, STATE), 'utf8');
  const up = snowarch(w.user, ['upgrade', '--to', 'v9.1.0', '--yes'], { bin: w.bin });
  assert.equal(up.status, 0, up.text);
  writeFileSync(join(w.user, STATE), before);
  assert.equal(readFileSync(join(w.user, STATE), 'utf8'), before, 'the pre-move state was not put back');

  const again = snowarch(w.user, ['upgrade', '--to', 'v9.1.0', '--yes'], { bin: w.bin });
  assert.equal(again.status, 0, again.text);
  assert.match(again.text,
    /already at v9\.1\.0, with steps still to run \([^)]*B02: inputs changed[^)]*\) — continuing from there/, again.text);
  const third = snowarch(w.user, ['upgrade', '--to', 'v9.1.0', '--yes'], { bin: w.bin });
  assert.match(third.text, /up to date \(v9\.1\.0\)/, third.text);
}, 3 * MINUTES);

// ── ARC-09-C210 — right after a move, U7's E-28 does not call the release just installed "available" ───────────────

test('ARC-09-C210 — from a tree with no reachable tag, U7 says nothing is available after the move to the latest', async (t) => {
  // The owner's first upgrade against farstic/snowarch, from an export whose history has no release tag: U2 wrote
  // the from-tree's record (localTag null, behind) and U7 printed "E-28 WARN release currency: v2.2.1 available"
  // right after the move to v2.2.1. Here the export is an orphan commit holding v9.0.0's files.
  const w = await buildWorld(t);
  bootstrapUser(w.user);
  git(w.user, ['checkout', '-q', '--orphan', 'export']);
  // `symbolic-ref`, not `rev-parse`: an orphan branch has no commit yet, and HEAD names it without resolving.
  assert.equal(git(w.user, ['symbolic-ref', '--short', 'HEAD']), 'export', 'the orphan branch was not checked out');
  git(w.user, ['commit', '-q', '-m', 'an export with no release tag behind it']);
  assert.equal(git(w.user, ['describe', '--tags'], { allowFail: true }), null, 'a release tag is still reachable');

  const up = snowarch(w.user, ['upgrade', '--to', 'v9.2.0', '--yes'], { bin: w.bin });
  assert.equal(up.status, 0, up.text);
  assert.match(up.text, /Upgrade plan: a development tree at [0-9a-f]{7} → v9\.2\.0/, up.text);
  assert.doesNotMatch(up.text, /E-28 +WARN/, `U7 called the release it had just installed available:\n${up.text}`);
}, 2 * MINUTES);

test('ARC-09-C210 — the control: from a release, U7 says nothing is available after the move to the latest', async (t) => {
  const w = await buildWorld(t);
  bootstrapUser(w.user);
  assert.equal(git(w.user, ['describe', '--tags', '--exact-match']), 'v9.0.0');
  const up = snowarch(w.user, ['upgrade', '--to', 'v9.2.0', '--yes'], { bin: w.bin });
  assert.equal(up.status, 0, up.text);
  assert.doesNotMatch(up.text, /E-28 +WARN/, up.text);
}, 2 * MINUTES);

// ── ARC-09-C213 — after a successful bootstrap or move, a second bootstrap re-runs no cacheable step ────────────────

/** The cacheable steps (B01–B08) a bootstrap RAN rather than cached or skipped, read from its step lines. */
const ranAgain = (out) => [...out.matchAll(/^\[(B0[1-8])\/09\] [^\n]*… (ok|warn|fail)(?: \(([^)]*)\))?/gm)]
  .filter((m) => m[3] !== 'cached').map((m) => m[1]);

test('ARC-09-C213 — after a fresh install, a plain move and a store-migrating move, a second bootstrap re-runs no cacheable step whose last run was ok', async (t) => {
  // The class: the recorded hash describes the inputs as each step LEFT them, so a bootstrap right after a successful
  // one re-runs nothing that finished ok. B06 recorded its hash before migrating the store, and C196's at-tag plan then
  // told a finished move to v9.2.0 that it had steps to run. A step recorded warn re-runs by the runner's own rule
  // (it caches only ok), so those are left out by name, and the set is pinned: a new warn in these worlds is said here.
  const w = await buildWorld(t);
  const warned = () => Object.entries(state(w.user).steps)
    .filter(([id, entry]) => /^B0[1-8]$/.test(id) && entry.status === 'warn').map(([id]) => id).sort();
  const point = () => {
    const excused = warned();
    return { excused, ranAgain: ranAgain(bootstrapUser(w.user, { store: false })).filter((id) => !excused.includes(id)) };
  };
  bootstrapUser(w.user);
  // The fixture writes the store after its bootstrap, a change made by someone else; one bootstrap takes that in.
  bootstrapUser(w.user, { store: false });
  const fresh = point();

  const plain = snowarch(w.user, ['upgrade', '--to', 'v9.1.0', '--yes'], { bin: w.bin });
  assert.equal(plain.status, 0, plain.text);
  const afterPlain = point();

  const migrating = snowarch(w.user, ['upgrade', '--to', 'v9.2.0', '--yes'], { bin: w.bin });
  assert.equal(migrating.status, 0, migrating.text);
  const afterMigrating = point();

  const expected = { excused: ['B02'], ranAgain: [] };
  assert.deepEqual({ fresh, afterPlain, afterMigrating }, { fresh: expected, afterPlain: expected, afterMigrating: expected },
    'a bootstrap right after a successful one re-ran a step that had finished ok, or the warned set changed');
}, 4 * MINUTES);
