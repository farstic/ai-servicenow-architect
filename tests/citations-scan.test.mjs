// ARC-03-S02 — the citation grammar. These cases are the grammar's contract: the generator (S02)
// and the verifier (S03) both consume `extract`, so a change here changes what the sparse checkout
// contains AND what "dead citation" means.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { extract, scanRepo, areasOf, findBareCitations, CitationSyntaxError }
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
    () => extract('x\nmarkdown/servicenow-platform/x-{a,{b,c}}.md\n', '.claude/skills/x/SKILL.md'),
    (e) => {
      assert.ok(e instanceof CitationSyntaxError);
      assert.match(e.message, /^\.claude\/skills\/x\/SKILL\.md:2: /);
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

// ---- ARC-03-S04b: the blind spot. A citation with no `markdown/` prefix cannot be resolved, so
// `verify` reported dead: 0 on a skill that still pointed a reader at files existing nowhere.
test('a bare (citation: `x.md`) is warned; the same citation with a full path is not', () => {
  const bare = findBareCitations('see the rule *(citation: `subscription-itam-licensing.md`)*', '.claude/skills/x/SKILL.md');
  assert.equal(bare.length, 1);
  assert.equal(bare[0].file, '.claude/skills/x/SKILL.md');
  assert.equal(bare[0].line, 1);
  assert.match(bare[0].reason, /citation without a markdown\/ path/);

  const full = findBareCitations('see the rule *(citation: `markdown/it-asset-management/index.md`)*', '.claude/skills/x/SKILL.md');
  assert.deepEqual(full, [], 'a full-path citation must NOT warn');
});

test('a table cell that is only a bare *.md is warned; a full path is not; a repo file is not', () => {
  const rows = [
    '| Anti-pattern | Better | Citation |',
    '|---|---|---|',
    '| a | b | `itam-subscrip-summary.md` |',
    '| c | d | `markdown/it-asset-management/index.md` |',
    '| e | f | `SKILL.md` |',
  ].join('\n');
  const w = findBareCitations(rows, '.claude/skills/x/SKILL.md');
  assert.equal(w.length, 1, 'only the bare corpus filename should warn');
  assert.equal(w[0].line, 3);
  assert.match(w[0].reason, /table citation without a markdown\/ path/);
});

test('the warning never becomes a failure — verify still exits 0 with warnings present', async () => {
  const { verifyCitations, formatResult, EXIT } = await import('../tools/snowarch/lib/docs/verify.mjs');
  const dir = mkdtempSync(join(tmpdir(), 'bare-'));
  try {
    mkdirSync(join(dir, '.claude/skills/x'), { recursive: true });
    mkdirSync(join(dir, 'vendor/ServiceNowDocs/markdown/alpha'), { recursive: true });
    writeFileSync(join(dir, 'vendor/ServiceNowDocs/markdown/alpha/a.md'), 'x');
    writeFileSync(join(dir, '.claude/skills/x/SKILL.md'),
      'ok markdown/alpha/a.md and blind *(citation: `nowhere.md`)*\n');
    const r = verifyCitations({ root: dir });
    assert.equal(r.status, 'ok');
    assert.equal(formatResult(r).code, EXIT.ok, 'a bare citation must warn, never fail');
    assert.ok(r.warnings.some((w) => /citation without a markdown/.test(w.reason)));
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
