// ARC-08-S02 — E-12…E-16 over an INJECTED `docsStatus`.
//
// The corpus is a 35,000-file submodule. Building four fixtures of it to exercise four verdicts
// would make this suite unrunnable on a fresh clone, and the checks do not read the corpus anyway:
// they read ARC-03-S06's answer about it. So the answer is what the tests supply — which is also
// the only way to assert the absent-corpus cases without deleting the developer's own checkout.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { docsFor, engineDocsChecks } from '../../tools/snowarch/lib/doctor/checks/engine-docs.mjs';
import { E12_ABSENT } from '../../tools/snowarch/lib/docs/status.mjs';
import { KINDS } from '../../tools/snowarch/lib/doctor/fix.mjs';
import { contextFor, greenTree, runById } from './helpers/tree.mjs';

const checks = engineDocsChecks();
const PIN = 'a'.repeat(40);

const status = (over = {}) => ({
  present: true, path: 'vendor/ServiceNowDocs', mode: 'sparse',
  pin: PIN, gitlink: PIN, head: PIN, gitlinkStaged: false,
  pinMatchesGitlink: true, headMatchesPin: true,
  family: 'australia', branch: 'australia', familyMatches: true,
  sparse: 'cone', areasExpected: ['now/x'], areasPresent: ['now/x'], areasMissing: [],
  rootMissing: [],
  citations: { checked: 289, dead: [] },
  ...over,
});

const ctx = (t, over = {}) => contextFor(greenTree(t), {
  docsStatus: () => status(over.status ?? {}),
  ...over,
});

const run = (t, id, over) => runById(checks, id, ctx(t, over));

test('the green corpus passes every docs check', async (t) => {
  const c = ctx(t);
  for (const id of ['E-12', 'E-13', 'E-14', 'E-15', 'E-16']) {
    const r = await runById(checks, id, c);
    assert.equal(r.status, 'ok', `${id}: ${r.detail}`);
  }
});

test('docsStatus is computed once per verification level, not once per check', async (t) => {
  let calls = 0;
  const c = contextFor(greenTree(t), { docsStatus: () => { calls += 1; return status(); } });
  for (const id of ['E-12', 'E-13', 'E-14', 'E-15']) await runById(checks, id, c);
  assert.equal(calls, 1, `four checks asked for the corpus ${calls} times`);
  await runById(checks, 'E-16', c);
  assert.equal(calls, 2, 'the citation walk did not get its own answer');
  assert.ok(docsFor(c));
});

/**
 * ARC-03-C2 — ADR-0008's Consequences say "ARC-03's doctor asserts corpus completeness", and until
 * now only half of that was true. E-15 checks the AREAS; nothing checked the files every corpus
 * has, at any cone. A corpus whose `LICENSE` had been pruned passed every check in the file:
 * present, on the pin, on the family, correctly sparse, citations clean.
 *
 * `checkCompleteness` in `sync.mjs` has always looked at this list — it simply had no reader once
 * the sync returned, which is why the remedy for a missing root file is the same `docs sync` that
 * would have caught it in the first place.
 */
test('E-12 fails a corpus that is present but missing a root file, and names it', async (t) => {
  const r = await run(t, 'E-12', { status: { rootMissing: ['LICENSE'] } });
  assert.equal(r.status, 'fail', 'a corpus missing LICENSE was reported as present and well');
  assert.match(r.detail, /on disk but incomplete/);
  assert.match(r.detail, /LICENSE/, 'the report does not say WHICH file is missing');
  assert.equal(r.command, './snowarch docs sync');
  assert.deepEqual(r.data.rootMissing, ['LICENSE']);
  assert.equal(r.data.fix.kind, 'corpus-missing', 'the fix route does not reach `docs sync`');
  // ...and that kind is one the fixer actually knows. A `fix` naming a kind nothing handles is a
  // remedy the user is offered and never gets — asserted here rather than assumed from the string.
  assert.ok(KINDS.includes(r.data.fix.kind), `the fixer has no kind "${r.data.fix.kind}"`);
});

test('E-12 names every missing root file, not just the first', async (t) => {
  const r = await run(t, 'E-12', { status: { rootMissing: ['LICENSE', 'llms.txt', 'legal'] } });
  for (const f of ['LICENSE', 'llms.txt', 'legal']) assert.match(r.detail, new RegExp(f));
});

test('E-12 on a complete corpus says how many root entries it checked', async (t) => {
  // BOTH DIRECTIONS. A check that cannot fail on a pruned corpus is the defect being fixed — and a
  // check whose ok line does not say what it looked at is the next version of the same problem:
  // "present" meant four things before this story and five after, with no way to tell from the
  // report which it had done.
  const r = await run(t, 'E-12');
  assert.equal(r.status, 'ok');
  assert.match(r.detail, /root entries/, `the ok line does not say the root files were checked: ${r.detail}`);
  assert.deepEqual(r.data.rootMissing, []);
});

test('E-12 prefers the ABSENT sentence over the incomplete one — an absent corpus is missing all of them', async (t) => {
  // Ordering matters and is asserted rather than assumed: `docsStatus` reports every root file as
  // missing when the corpus is absent, which is the honest reading, and an operator with no corpus
  // must be told THAT rather than handed a list of five files.
  const r = await run(t, 'E-12', { status: { present: false, mode: 'skip', rootMissing: ['LICENSE', 'llms.txt'] } });
  assert.equal(r.status, 'fail');
  assert.doesNotMatch(r.detail, /on disk but incomplete/,
    'an absent corpus was reported as an incomplete one');
});

// AC 5.
test('E-12 fails an absent corpus with ARC-03-S11\'s sentence, and never warns or skips', async (t) => {
  const r = await run(t, 'E-12', { status: { present: false, mode: 'skip' } });
  assert.equal(r.status, 'fail');
  assert.ok(E12_ABSENT('skip').endsWith(r.detail),
    `the sentence is not ARC-03-S11's: ${JSON.stringify(r.detail)}`);
  assert.equal(r.command, './snowarch docs sync');
  assert.equal(checks.find((c) => c.id === 'E-12').severity, 'fail');
});

test('E-12 quotes the recorded mode, because "skip" and "sparse" failed for different reasons', async (t) => {
  const r = await run(t, 'E-12', { status: { present: false, mode: 'sparse' } });
  assert.match(r.detail, /docs mode "sparse"/);
});

// AC 5, second half.
test('E-16 fails an absent corpus as unverifiable, never as clean', async (t) => {
  const r = await run(t, 'E-16', { status: { present: false, mode: 'skip', citations: { checked: 0, dead: [] } } });
  assert.equal(r.status, 'fail');
  assert.match(r.detail, /citations unverifiable — corpus absent \(see E-12\)/);
});

// AC 2 (a).
test('E-16 lists dead citations as file:line → path, up to ten', async (t) => {
  const dead = Array.from({ length: 12 }, (_, i) => ({
    file: `.claude/skills/s${i}/SKILL.md`, line: i + 1, path: `now/missing-${i}.md`,
  }));
  const r = await run(t, 'E-16', { status: { citations: { checked: 289, dead } } });
  assert.equal(r.status, 'fail');
  assert.match(r.detail, /12 dead citation\(s\)/);
  assert.match(r.detail, /\.claude\/skills\/s0\/SKILL\.md:1 → now\/missing-0\.md/);
  assert.equal(r.data.first.length, 10);
});

test('E-16 counts what it checked when nothing is dead', async (t) => {
  const r = await run(t, 'E-16');
  assert.match(r.detail, /checked: 289 \| dead: 0/);
});

test('E-16 is excluded from --quick — the walk is most of the quick budget', () => {
  assert.equal(checks.find((c) => c.id === 'E-16').quick, false);
});

// AC 6.
test('E-13 separates the user\'s mismatch from the maintainer\'s', async (t) => {
  const moved = await run(t, 'E-13', { status: { head: 'b'.repeat(40), headMatchesPin: false } });
  assert.equal(moved.status, 'fail');
  assert.equal(moved.command, './snowarch docs sync');
  assert.equal(moved.data.fix.kind, 'head-off-pin');

  const repinned = await run(t, 'E-13', {
    status: { gitlink: 'c'.repeat(40), pinMatchesGitlink: false },
  });
  assert.equal(repinned.status, 'fail');
  assert.match(repinned.detail, /pin \w+ ≠ committed gitlink/);
  assert.match(repinned.command, /^node scripts\/docs-bump\.mjs --to c{40}$/);
  assert.equal(repinned.data.fix, null, 'moving the pin was offered as a --fix');
});

test('E-13 says when the gitlink is staged rather than committed', async (t) => {
  const r = await run(t, 'E-13', {
    status: { gitlink: 'c'.repeat(40), pinMatchesGitlink: false, gitlinkStaged: true },
  });
  assert.match(r.detail, /gitlink staged, not yet committed/);
});

test('E-14 names the branch it found and the family it wanted', async (t) => {
  const r = await run(t, 'E-14', { status: { branch: 'vancouver', familyMatches: false } });
  assert.equal(r.status, 'fail');
  assert.match(r.detail, /branch "vancouver".*family "australia"/);
});

test('E-15 fails a pattern sparse-checkout and lists the missing areas', async (t) => {
  const r = await run(t, 'E-15', {
    status: { sparse: 'pattern', areasMissing: ['now/a', 'now/b'], areasPresent: [] },
  });
  assert.equal(r.status, 'fail');
  assert.match(r.detail, /sparse checkout is "pattern"/);
  assert.match(r.detail, /2 area\(s\) missing: now\/a, now\/b/);
});

test('the other corpus checks defer to E-12 rather than repeating its diagnosis', async (t) => {
  const c = ctx(t, { status: { present: false, mode: 'skip' } });
  for (const id of ['E-13', 'E-14', 'E-15']) {
    const r = await runById(checks, id, c);
    assert.equal(r.status, 'skip');
    assert.match(r.detail, /see E-12/);
  }
});
