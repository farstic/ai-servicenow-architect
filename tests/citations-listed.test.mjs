// Copyright 2026 Cvetomir Grigorov. Licensed under the Business Source License 1.1 (see LICENSE).
// snowarch — AI ServiceNow Architect. Not affiliated with or endorsed by ServiceNow, Inc.
// ARC-09-C281 — a page named by its bare file name in a comma list, after a full citation, is a citation too.
//
// The skills write a list of pages in one folder as the path once and then the names: `markdown/a/b/x.md`, `y.md`,
// `z.md`. The gate read the first and none of the others, so when the 96d3212 bump took pages out of a folder the gate
// said `dead: 10` and four bare names that died with them stayed unseen. A name in such a list is now resolved against
// the folder of the full path before it and checked like any other citation. The reader of an answer (extract, which
// the Stop hook uses) is unchanged: only the repository scan lists them.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { areasOf, extract, scanRepo } from '../tools/snowarch/lib/docs/citations.mjs';
import { formatResult, verifyCitations } from '../tools/snowarch/lib/docs/verify.mjs';
import { spellings } from '../tools/snowarch/lib/text.mjs';
import { tempDir } from '../tools/snowarch/tests/helpers/temp.mjs';

const SPELL = spellings();
const FIXTURE_CORPUS = resolve(dirname(fileURLToPath(import.meta.url)), 'fixtures/docs-corpus');

/** A repository holding one skill with the given text, and the fixture corpus (alpha: a, b, x-one · beta: a, b, c). */
function withTree(skillText, fn) {
  const dir = tempDir('cite-listed-');
  try {
    mkdirSync(join(dir, '.claude', 'skills', 'fx'), { recursive: true });
    writeFileSync(join(dir, '.claude', 'skills', 'fx', 'SKILL.md'), skillText);
    cpSync(FIXTURE_CORPUS, join(dir, 'vendor', 'ServiceNowDocs'), { recursive: true });
    fn(dir);
  } finally { rmSync(dir, { recursive: true, force: true }); }
}
const verify = (dir) => verifyCitations({ root: dir });
const deadOf = (r) => r.dead.map((d) => d.path);

test('ARC-09-C281 — a bare name in a comma list is checked in the folder of the full path before it: a page there passes, a page not there is dead', () => {
  withTree('| Row | `markdown/alpha/a.md`, `b.md`, `gone.md` |\n', (dir) => {
    const r = verify(dir);
    assert.deepEqual(deadOf(r), ['markdown/alpha/gone.md'], 'a bare name that is no page of the folder went unseen');
    assert.equal(r.status, 'fail');
    assert.equal(r.checked, 3, 'the full path and its two listed names');
    assert.match(formatResult(r, SPELL).text, /^DEAD \.claude\/skills\/fx\/SKILL\.md:1 markdown\/alpha\/gone\.md$/m);
  });
  // The control: the same list with every name a page of the folder is green.
  withTree('| Row | `markdown/alpha/a.md`, `b.md`, `x-one.md` |\n', (dir) => {
    const r = verify(dir);
    assert.deepEqual(deadOf(r), []);
    assert.equal(r.status, 'ok');
    assert.equal(r.checked, 3);
  });
});

test('ARC-09-C281 — a name belongs to the nearest full path before it, and a list may restart in another folder', () => {
  // x-one.md is a page of alpha and not of beta: read against the nearest path it is beta's, and dead.
  withTree('`markdown/alpha/a.md`, `markdown/beta/c.md`, `x-one.md`\n', (dir) => {
    assert.deepEqual(deadOf(verify(dir)), ['markdown/beta/x-one.md']);
  });
  withTree('`markdown/alpha/a.md`, `markdown/beta/c.md`, `b.md`\n', (dir) => {
    const r = verify(dir);
    assert.deepEqual(deadOf(r), []);
    assert.equal(r.checked, 3);
  });
});

test('ARC-09-C281 — the list runs over a comma, "and" and "or", and a full path need not be in backticks', () => {
  withTree('markdown/alpha/a.md, `b.md` and `gone.md`\n', (dir) => {
    assert.deepEqual(deadOf(verify(dir)), ['markdown/alpha/gone.md']);
  });
  withTree('`markdown/alpha/a.md`, `b.md`, or `gone.md`\n', (dir) => {
    assert.deepEqual(deadOf(verify(dir)), ['markdown/alpha/gone.md']);
  });
  // Braces in the file part leave the folder one: the list still has somewhere to resolve against.
  withTree('`markdown/alpha/{a,b}.md`, `gone.md`\n', (dir) => {
    assert.deepEqual(deadOf(verify(dir)), ['markdown/alpha/gone.md']);
  });
});

test('ARC-09-C281 — what is not a member of a list is not checked: other words, another cell, a name before any path, a glob, a repository file', () => {
  const unseen = [
    '`markdown/alpha/a.md` (see also `gone.md`)\n',                 // words between the path and the name
    '| `markdown/alpha/a.md` | `gone.md` |\n',                        // another table cell
    '`gone.md` and then markdown/alpha/a.md\n',                       // the name comes before any path
    'Grep `markdown/*/index.md`, never an `index.md` whole.\n',        // a glob is no folder to resolve against
    '`markdown/alpha/a.md`, `CLAUDE.md`, `gone.md`\n',                 // a repository file ends the list
    '`markdown/{alpha,beta}/a.md`, `gone.md`\n',                      // braces in the folder: two folders, none to resolve against
  ];
  for (const text of unseen) {
    withTree(text, (dir) => {
      const dead = deadOf(verify(dir)).filter((p) => p.endsWith('gone.md'));
      assert.deepEqual(dead, [], `a name that is no list member was checked: ${text.trim()}`);
    });
  }
});

test('ARC-09-C281 — a listed name adds no area, and the reader of an answer still takes the full path only', () => {
  withTree('`markdown/alpha/a.md`, `b.md`, `gone.md`\n', (dir) => {
    assert.deepEqual(areasOf(scanRepo({ root: dir }).citations), ['alpha']);
  });
  const answer = extract('See `markdown/alpha/a.md`, `b.md`, `gone.md` for it.\n');
  assert.deepEqual(answer.citations.map((c) => c.path), ['markdown/alpha/a.md'],
    'the Stop hook reads answers with extract: widening it is a separate decision');
});
