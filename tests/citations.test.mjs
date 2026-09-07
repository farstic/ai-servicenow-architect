// ARC-03-S03 — the citation gate. The bash script this replaces exited 0 when the corpus was
// absent, so a fresh clone passed with every citation unverified; criterion 2 is that defect's
// regression test.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, cpSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { verifyCitations, formatResult, EXIT } from '../tools/snowarch/lib/docs/verify.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const FIXTURE_CORPUS = resolve(here, 'fixtures/docs-corpus');

// Every path is joined with node:path, never concatenated with '/', so the Windows cell exercises
// the same code (criterion 6).
function withTree(skillText, fn) {
  const dir = mkdtempSync(join(tmpdir(), 'cite-verify-'));
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
    const { text, code } = formatResult(r);
    assert.equal(code, EXIT.missing);
    assert.match(text, /corpus missing — run \.\/bootstrap\.sh --docs/);
    assert.doesNotMatch(text, /SKIP/i, 'the word SKIP must appear nowhere — that was the old defect');
  });
});

test('criterion 3 — --allow-missing exits 0 with its own wording, still not SKIP', () => {
  withTree('see markdown/alpha/a.md\n', (dir) => {
    const { text, code } = formatResult(verifyCitations({ root: dir, allowMissing: true }));
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
    assert.match(formatResult(r).text, /^DEAD \(brace member\) /m);
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
    const { text, code } = formatResult(r);
    assert.equal(code, EXIT.ok);
    assert.equal(text, 'checked: 2 | dead: 0');
  });
});

test('the same path cited from two files is checked once', () => {
  const dir = mkdtempSync(join(tmpdir(), 'cite-dupe-'));
  try {
    mkdirSync(join(dir, '.claude', 'skills', 'a'), { recursive: true });
    mkdirSync(join(dir, '.claude', 'skills', 'b'), { recursive: true });
    writeFileSync(join(dir, '.claude', 'skills', 'a', 'SKILL.md'), 'markdown/alpha/a.md\n');
    writeFileSync(join(dir, '.claude', 'skills', 'b', 'SKILL.md'), 'markdown/alpha/a.md\n');
    const r = verifyCitations({ root: dir, corpusDir: withCorpus(dir) });
    assert.equal(r.checked, 1, 'checked counts distinct paths, not citation sites');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
