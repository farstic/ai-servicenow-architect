// Copyright 2026 Cvetomir Grigorov. Licensed under the Business Source License 1.1 (see LICENSE).
// snowarch — AI ServiceNow Architect. Not affiliated with or endorsed by ServiceNow, Inc.
// ARC-03-S03 — the citation gate. The bash script this replaces exited 0 when the corpus was
// absent, so a fresh clone passed with every citation unverified; criterion 2 is that defect's
// regression test.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync, cpSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { verifyCitations, formatResult, EXIT } from '../tools/snowarch/lib/docs/verify.mjs';
import { spellings } from '../tools/snowarch/lib/text.mjs';
import { tempDir } from '../tools/snowarch/tests/helpers/temp.mjs';

/**
 * ARC-07-C31 — the launcher these cases assert, DERIVED from the process.
 *
 * The product lines here render for the terminal in front of them, so the process is the same
 * source they use (rule 1). A POSIX literal would be green on a mac and red on all three Windows
 * cells, which is this row's own "62 expectations across 13 files" trap.
 */
const SPELL = spellings();

const here = dirname(fileURLToPath(import.meta.url));
const FIXTURE_CORPUS = resolve(here, 'fixtures/docs-corpus');

// Every path is joined with node:path, never concatenated with '/', so the Windows cell exercises
// the same code (criterion 6).
function withTree(skillText, fn) {
  const dir = tempDir('cite-verify-');
  try {
    mkdirSync(join(dir, '.claude', 'skills', 'fx'), { recursive: true });
    writeFileSync(join(dir, '.claude', 'skills', 'fx', 'SKILL.md'), skillText);
    fn(dir);
  } finally { rmSync(dir, { recursive: true, force: true }); }
}
const withCorpus = (dir) => {
  cpSync(FIXTURE_CORPUS, join(dir, 'vendor', 'ServiceNowDocs'), { recursive: true });
  return 'vendor/ServiceNowDocs';
};

test('criterion 2 — an absent corpus is `missing`, exit 3, and never says SKIP', () => {
  withTree('see markdown/alpha/a.md\n', (dir) => {
    const r = verifyCitations({ root: dir });
    assert.equal(r.status, 'missing');
    const { text, code } = formatResult(r, SPELL);
    assert.equal(code, EXIT.missing);
    // The whole line, not a pattern: a template given to `new RegExp` keeps `\(` in its prose, which no product line
    // carries, so the launcher audit could not resolve the site (ARC-07-C35b's "regex syntax in the sentence").
    assert.equal(text, `corpus missing — run ${SPELL.bootstrap} (or ${SPELL.cli} docs sync)`);
    // ARC-09-C244 — the remedy fetches what an install fetches by default, the whole corpus; `--docs sparse` is never
    // offered.
    assert.doesNotMatch(text, /--docs sparse/, 'the remedy offers the sparse corpus');
    assert.doesNotMatch(text, /SKIP/i, 'the word SKIP must appear nowhere — that was the old defect');
  });
});

test('criterion 3 — --allow-missing exits 0 with its own wording, still not SKIP', () => {
  withTree('see markdown/alpha/a.md\n', (dir) => {
    const { text, code } = formatResult(verifyCitations({ root: dir, allowMissing: true }), SPELL);
    assert.equal(code, EXIT.ok);
    assert.equal(text, 'citations: not verified until the corpus is present');
    assert.doesNotMatch(text, /SKIP/i);
  });
});

test('criterion 4 — a brace citation with one missing member is ONE dead entry naming the member', () => {
  withTree('see markdown/alpha/x-{one,two}.md\n', (dir) => {
    const r = verifyCitations({ root: dir, corpusDir: withCorpus(dir) });
    assert.equal(r.status, 'fail');
    assert.equal(r.checked, 1, 'a brace citation is ONE distinct path before expansion');
    assert.equal(r.dead.length, 1);
    assert.equal(r.dead[0].member, 'x-two.md');
    assert.match(formatResult(r, SPELL).text, /^DEAD \(brace member\) /m);
  });
});

test('criterion 5 — an existing directory citation passes; a missing one is dead', () => {
  withTree('good markdown/beta/ and bad markdown/gamma/\n', (dir) => {
    const r = verifyCitations({ root: dir, corpusDir: withCorpus(dir) });
    assert.equal(r.checked, 2);
    assert.deepEqual(r.dead.map((d) => d.path), ['markdown/gamma']);
  });
});

test('all citations resolving gives status ok and exit 0', () => {
  withTree('markdown/alpha/a.md and markdown/beta/c.md\n', (dir) => {
    const r = verifyCitations({ root: dir, corpusDir: withCorpus(dir) });
    assert.equal(r.status, 'ok');
    const { text, code } = formatResult(r, SPELL);
    assert.equal(code, EXIT.ok);
    assert.equal(text, 'checked: 2 | dead: 0');
  });
});

test('the same path cited from two files is checked once', () => {
  const dir = tempDir('cite-dupe-');
  try {
    mkdirSync(join(dir, '.claude', 'skills', 'a'), { recursive: true });
    mkdirSync(join(dir, '.claude', 'skills', 'b'), { recursive: true });
    writeFileSync(join(dir, '.claude', 'skills', 'a', 'SKILL.md'), 'markdown/alpha/a.md\n');
    writeFileSync(join(dir, '.claude', 'skills', 'b', 'SKILL.md'), 'markdown/alpha/a.md\n');
    const r = verifyCitations({ root: dir, corpusDir: withCorpus(dir) });
    assert.equal(r.checked, 1, 'checked counts distinct paths, not citation sites');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
