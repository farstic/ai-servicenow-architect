// ARC-03-S02 — the citation grammar. These cases are the grammar's contract: the generator (S02)
// and the verifier (S03) both consume `extract`, so a change here changes what the sparse checkout
// contains AND what "dead citation" means.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { extract, scanRepo, areasOf, CitationSyntaxError }
  from '../tools/snowarch/lib/docs/citations.mjs';

const paths = (t) => extract(t).citations.map((c) => c.path);

test('criterion 3 — one brace group expands to two paths and one area', () => {
  const { citations } = extract('see markdown/servicenow-platform/x-{a,b}-y.md here');
  assert.deepEqual(citations.map((c) => c.path), [
    'markdown/servicenow-platform/x-a-y.md',
    'markdown/servicenow-platform/x-b-y.md',
  ]);
  assert.deepEqual([...new Set(citations.map((c) => c.area))], ['servicenow-platform']);
});

test('criterion 4 — a nested brace is a CitationSyntaxError naming file and line', () => {
  assert.throws(
    () => extract('x\nmarkdown/servicenow-platform/x-{a,{b,c}}.md\n', 'skills/x/SKILL.md'),
    (e) => {
      assert.ok(e instanceof CitationSyntaxError);
      assert.match(e.message, /^skills\/x\/SKILL\.md:2: /);
      return true;
    });
});

test('criterion 5 — trailing punctuation and slash are prose, not path', () => {
  const { citations } = extract('(see markdown/platform-security/instance-security-hardening-settings/).');
  assert.equal(citations.length, 1);
  assert.equal(citations[0].path, 'markdown/platform-security/instance-security-hardening-settings');
  assert.equal(citations[0].isDir, true);
});

test('criterion 6 — both prefixed forms normalise to markdown/…', () => {
  assert.deepEqual(paths('ServiceNowDocs/markdown/a/b.md and vendor/ServiceNowDocs/markdown/a/b.md'),
    ['markdown/a/b.md', 'markdown/a/b.md']);
});

test('a .md citation is not a directory; a bare one is', () => {
  assert.equal(extract('markdown/a/b.md').citations[0].isDir, false);
  assert.equal(extract('markdown/a/b').citations[0].isDir, true);
});

test('markdown/... is a prose placeholder, not a citation — it must never reach the areas file', () => {
  // It appears in four imported agent files as "cite the path used: markdown/...". Without this it
  // would land in the sparse-checkout list as an area that cannot exist.
  const { citations, warnings } = extract('Ground every claim and cite the path used: markdown/...');
  assert.deepEqual(citations, []);
  assert.equal(warnings.length, 1);
});

test('an area that does not look like a directory name is warned, not emitted', () => {
  const { citations, warnings } = extract('markdown/NOT_AN_AREA/x.md');
  assert.deepEqual(citations, []);
  assert.match(warnings[0].reason, /is not an area name/);
});

test('criterion 7 — the scan needs no corpus, and a missing root is skipped, not fatal', () => {
  const dir = mkdtempSync(join(tmpdir(), 'cite-'));
  try {
    mkdirSync(join(dir, '.claude/skills/x'), { recursive: true });
    writeFileSync(join(dir, '.claude/skills/x/SKILL.md'), 'see markdown/it-service-management/a.md\n');
    const r = scanRepo({ root: dir });
    assert.deepEqual(areasOf(r.citations), ['it-service-management']);
    assert.ok(r.skipped.includes('governance'), 'a missing root must be reported as skipped');
    assert.equal(r.citations[0].file, '.claude/skills/x/SKILL.md', 'file is repo-relative with / separators');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('the real tree: every emitted area is a plausible directory name', () => {
  for (const a of areasOf(scanRepo({ root: process.cwd() }).citations)) {
    assert.match(a, /^[a-z0-9][a-z0-9-]*$/, `"${a}" would be checked out as a sparse-checkout area`);
  }
});
