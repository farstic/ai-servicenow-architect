// Copyright 2026 Cvetomir Grigorov. Licensed under the Apache License, Version 2.0 (see LICENSE).
// snowarch — AI ServiceNow Architect. Not affiliated with or endorsed by ServiceNow, Inc.
/**
 * ARC-11-C6 — the release notes say nothing the owner's ruling forbids a page to say.
 *
 * The v2.0.13 cut of 2026-10-13 wrote, from commit subjects, an Added line "E-31 offers the way back" and three
 * Internal lines naming it: step 6's subjects from before the owner's ruling, and one written after it. The
 * changelog's own sweep reads only its live part, so the section being cut was read by nothing. The architect
 * cancelled the publish before any Release existed, and ruled: (1) a committed override map, sha to "omit" or a
 * replacement line, honoured by the generator at the cut and in the dry run; (2) the sweep run by the release
 * itself, over the section it is about to cut, so a subject like those fails the cut.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { renderGroups, writeChangelog } from '../scripts/lib/release/changelog.mjs';
import { gatePlan } from '../scripts/lib/release/gates.mjs';
import { forbiddenLines, GENERIC, PRECISE } from '../scripts/lib/release/no-way-back.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const RS = '\x1e';
const US = '\x1f';

/** The four commits the v2.0.13 cut described, as `git log` gives them, and one that says nothing of it. */
const CUT = [
  ['f36165d84503c5e9f15fa3b36bd51aa3f0b4df72', 'feat(doctor): E-31 offers the way back, U4 says it before a move; green (ARC-11-C6)'],
  ['fb0aef03bb889ad9ad8cc338a24a3b1010cf56b4', 'test(doctor): the fixtures and the template\'s three quotes carry E-31\'s way back (ARC-11-C6)'],
  ['882bb145c04c095454d6e0fc3ff39d38b5b728f5', 'test(doctor): E-31\'s way back, U4\'s notice, and the allowed set as one phrase; red (ARC-11-C6)'],
  ['0e5d1af916f965046d563f262bb377ee38205fb7', 'docs(snowarch): two comments in the licence code no longer say "way back" (ARC-11-C6)'],
  ['42c4bd69c3841a82476b3d7c385c1b5756b845c1', 'fix(snowarch): upgrade --to checks the licence before it takes the target (ARC-11-C6)'],
];
const fakeGit = (rows) => () => rows.map(([sha, subject]) => `${sha}${US}${subject}${US}${US}${'0'.repeat(40)}${RS}`).join('\n');

test('ARC-11-C6 — an override omits a commit, or replaces its line and keeps its sha', () => {
  const sha = (seed) => seed.padEnd(40, '0');
  const commits = [
    { sha: sha('aaaaaaa'), subject: 'feat(doctor): a subject the owner ruled out (ARC-11-C6)', body: '', parents: ['p'] },
    { sha: sha('bbbbbbb'), subject: 'test(doctor): another one (ARC-11-C6)', body: '', parents: ['p'] },
    { sha: sha('ccccccc'), subject: 'fix(doctor): left as it is (ARC-11-C6)', body: '', parents: ['p'] },
  ];
  const overrides = {
    [sha('aaaaaaa')]: { line: 'doctor: a neutral line (ARC-11-C6)', why: 'fixture' },
    [sha('bbbbbbb')]: { omit: true, why: 'fixture' },
  };
  const body = renderGroups(commits, { overrides });
  assert.match(body, /^### Added\n\n- doctor: a neutral line \(ARC-11-C6\) \(aaaaaaa\)$/m, body);
  assert.equal(body.includes('ruled out'), false, body);
  assert.equal(body.includes('bbbbbbb'), false, body);
  assert.match(body, /^- doctor: left as it is \(ARC-11-C6\) \(ccccccc\)$/m, body);
});

test('ARC-11-C6 — the section the v2.0.13 cut wrote, written again, says nothing the ruling forbids', () => {
  // writeChangelog as the release calls it, fed the four commits that carried the words and one that did not. The
  // committed overrides are read from the checkout, as at the cut.
  const files = { 'docs/CHANGELOG.md': '# Changelog\n\n## Unreleased\n\n### Notes\n\nA note.\n' };
  const r = writeChangelog({ root: ROOT, version: '9.9.9', date: '2026-10-13', from: 'v2.0.12', git: fakeGit(CUT),
    read: (p) => files[p], write: (p, t) => { files[p] = t; } });
  assert.ok(r.ok, r.message);
  const hits = forbiddenLines(r.section, [...PRECISE, ...GENERIC]);
  assert.deepEqual(hits, [], `the section still says it:\n  ${hits.map((h) => h.text).join('\n  ')}`);
  assert.match(r.section, /^- snowarch: upgrade --to checks the licence before it takes the target \(ARC-11-C6\) \(42c4bd6\)$/m);
});

test('ARC-11-C6 — the release sweeps the section it will cut: a notes gate after docs, from the previous final', () => {
  const plan = gatePlan({ platform: 'darwin', env: {}, notesFrom: 'v2.0.12' });
  const names = plan.map((g) => g.name);
  assert.equal(names[names.indexOf('docs') + 1], 'notes', names.join(' → '));
  assert.deepEqual(plan.find((g) => g.name === 'notes')?.argv,
    ['node', 'scripts/ci/release-notes-gate.mjs', '--from', 'v2.0.12']);
});

test('ARC-11-C6 — the notes gate fails on a subject that says it, and passes the cut with the committed overrides', async () => {
  const { notesGate } = await import('../scripts/ci/release-notes-gate.mjs');
  const read = () => '# Changelog\n\n## Unreleased\n\n### Notes\n\nA note.\n';
  const planted = ['1'.repeat(40), 'docs(snowarch): a page names the way back (ARC-11-C6)'];
  const r = notesGate({ root: ROOT, from: 'v2.0.12', git: fakeGit([...CUT, planted]), read });
  assert.equal(r.ok, false);
  assert.deepEqual(r.hits.map((h) => h.text), ['- snowarch: a page names the way back (ARC-11-C6) (1111111)']);
  assert.equal(notesGate({ root: ROOT, from: 'v2.0.12', git: fakeGit(CUT), read }).ok, true);
  // The hand-written block it carries is swept too.
  const handWritten = () => '# Changelog\n\n## Unreleased\n\n### Notes\n\nTo go back to the last release, run it.\n';
  assert.equal(notesGate({ root: ROOT, from: 'v2.0.12', git: fakeGit(CUT), read: handWritten }).ok, false);
});

test('ARC-11-C6 — an override names a full sha, exactly one of omit or line, and a why; anything else stops the cut', async () => {
  const { readOverrides } = await import('../scripts/lib/release/changelog.mjs');
  const at = (map) => () => readOverrides('/x', { exists: () => true, read: () => JSON.stringify(map) });
  const sha = 'a'.repeat(40);
  assert.deepEqual(at({ [sha]: { omit: true, why: 'w' } })(), { [sha]: { omit: true, why: 'w' } });
  for (const bad of [{ ['a'.repeat(7)]: { omit: true, why: 'w' } }, { [sha]: { omit: true, line: 'x', why: 'w' } },
    { [sha]: { line: ' ', why: 'w' } }, { [sha]: { omit: true } }]) {
    assert.throws(at(bad), /needs a full sha, exactly one of omit or line, and a why/, JSON.stringify(bad));
  }
  assert.deepEqual(readOverrides('/nowhere', { exists: () => false }), {});
  // The committed map holds to the same rule, and covers the four lines the v2.0.13 cut wrote.
  const committed = readOverrides(ROOT);
  for (const [sha4] of CUT.slice(0, 4)) assert.ok(committed[sha4], `${sha4} has no override`);
});

test('ARC-11-C6 — the gate script: a usage error is 2, and an empty range is clean', async () => {
  const { spawnSync } = await import('node:child_process');
  const gate = (args) => spawnSync(process.execPath, ['scripts/ci/release-notes-gate.mjs', ...args],
    { cwd: ROOT, encoding: 'utf8' });
  assert.equal(gate(['--from']).status, 2);
  const empty = gate(['--from', 'HEAD']);
  assert.equal(empty.status, 0, empty.stderr);
  assert.match(empty.stdout, /^release notes: clean \(\d+ lines\)$/m);
});
