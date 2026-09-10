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
import { contextFor, greenTree, runById } from './helpers/tree.mjs';

const checks = engineDocsChecks();
const PIN = 'a'.repeat(40);

const status = (over = {}) => ({
  present: true, path: 'vendor/ServiceNowDocs', mode: 'sparse',
  pin: PIN, gitlink: PIN, head: PIN, gitlinkStaged: false,
  pinMatchesGitlink: true, headMatchesPin: true,
  family: 'australia', branch: 'australia', familyMatches: true,
  sparse: 'cone', areasExpected: ['now/x'], areasPresent: ['now/x'], areasMissing: [],
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
  assert.equal(moved.data.fix.kind, 'docs-sync');

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
