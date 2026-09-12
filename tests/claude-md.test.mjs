import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * `CLAUDE.md` is loaded into every session, so its size is a running cost and its wording is
 * behaviour. This holds the ARC-02-S08 criteria that can be checked from the file itself; the five
 * behavioural tests (T-01…T-04, T-10) are run by hand against a live session and recorded in the PR.
 */
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const doc = readFileSync(join(root, 'CLAUDE.md'), 'utf8');
const lines = doc.trimEnd().split('\n');

const MARKER = /^\*\*Version:\*\* /;

test('criterion 1 — the budget', () => {
  assert.ok(lines.length <= 200, `${lines.length} lines, cap 200`);
  assert.ok(Buffer.byteLength(doc) <= 20_000, `${Buffer.byteLength(doc)} bytes, cap 20,000`);
  console.log(`    CLAUDE.md: ${lines.length} lines · ${Buffer.byteLength(doc)} bytes`);
});

test('criterion 2 — the four surfaces that had to leave', () => {
  // Not spelled here where a spelling would make this file a detector: the retired vocabulary
  // comes from the fixture the lint reads, and the harness-specific phrase is the one ARC-02-S06
  // replaced with "dispatch the sub-agent".
  const vocab = JSON.parse(readFileSync(join(root, 'tests/fixtures/retired-vocabulary.json'), 'utf8'))
    .tokens.map((t) => t.pattern);
  const banned = [...vocab, ...vocab.map((v) => v.replace(/^mcp__/, '').replace(/__$/, '')),
    'Task tool', 'context-mode', 'claude-ai-projects'];
  const hits = doc.split('\n')
    .map((l, i) => [i + 1, l])
    .filter(([, l]) => banned.some((b) => new RegExp(b).test(l)))
    .map(([n, l]) => `CLAUDE.md:${n}: ${l.trim().slice(0, 60)}`);
  assert.deepEqual(hits, []);
});

test('criterion 5 — one version marker, and no other version claim', () => {
  const markers = lines.filter((l) => MARKER.test(l));
  assert.equal(markers.length, 1, 'exactly one Version marker line');
  // The story's criterion 5 as written contradicts its own byte-for-byte marker rule — the marker
  // legitimately contains the superseded version. The marker line is excluded; everything else
  // must carry no version claim of its own, because two claims are one that will be wrong.
  const stray = lines.filter((l) => !MARKER.test(l) && /v?2\.8\.0|Engine version/.test(l));
  assert.deepEqual(stray, []);
});

test('criterion 4 — the strings a session needs to find', () => {
  for (const s of ['/snowarch status', './snowarch doctor --quick', 'Mode:',
    'quote its `Mode:` line verbatim',
    // ARC-02-S09 AC 4 (acceptance item B02-04): `docs/ARCHITECTURE.md` linked the modes page and
    // this file did not — `grep -ci 'modes' CLAUDE.md` was 0. A session that has to explain what
    // design-only means cannot find the page that says so.
    'docs/MODES-AND-PRESETS.md']) {
    assert.ok(doc.includes(s), `missing: ${s}`);
  }
  // The plain word, as a trigger. Backticked or not, a session must be told what `Status` does.
  assert.match(doc, /\bStatus\b/);
});

test('criterion 3 — the two blocks that are copied, not paraphrased', () => {
  // Both are load-bearing for the behavioural tests: T-01 checks the gateway fires and the exact
  // Code Reviewer wording, T-02 checks the §1.1 halt. A paraphrase of either is a silent
  // behaviour change, which is the failure mode a line budget invites.
  assert.ok(doc.includes('Code artefact produced. Proposing a Code Reviewer pass '
    + '(style, performance, security, best-practice) before final delivery — proceed?'));
  for (const gateway of ['**ITSM Specialist**', '**CSM Specialist**', '**HRSD Specialist**',
    '**ITOM/Discovery Specialist**', '**CMDB & CSDM Specialist**']) {
    assert.ok(doc.includes(gateway), `the gateway table lost ${gateway}`);
  }
  const rows = lines.filter((l) => /^\| .* \| \*\*[A-Z].*Specialist\*\* \| `\.claude\/skills\//.test(l));
  assert.equal(rows.length, 5, 'the gateway table must have exactly five rows');
});

test('criterion 7 — every repository path it names resolves', () => {
  const skipped = [];
  const dead = [];
  for (const [i, line] of lines.entries()) {
    for (const m of line.matchAll(/`([^`\n]+)`/g)) {
      const p = m[1];
      // A generic file KIND is not a path: "a change to a `SKILL.md`" names a shape, and there is
      // no `SKILL.md` at the repository root to resolve.
      if (['SKILL.md', 'EXAMPLES.md', 'README.md', 'CLAUDE.md'].includes(p)) continue;
      if (!/^(\.claude\/|governance\/|docs\/|templates\/|clients\/|packages\/|tests\/|vendor\/|scripts\/|[A-Z-]+\.md$)/.test(p)) continue;
      // A path with a placeholder is a shape: `clients/<name>/` exists only per engagement.
      if (p.includes('<')) { skipped.push(p); continue; }
      if (!existsSync(join(root, p))) dead.push(`CLAUDE.md:${i + 1} ${p}`);
    }
  }
  assert.deepEqual(dead, []);
  console.log(`    paths: ${skipped.length} placeholder(s) skipped, the rest resolve`);
});

test('the fixture this cannot produce, produced', () => {
  // Which input shape would slip past? One with TWO version markers, a paraphrased Code Reviewer
  // sentence and a dead path — all three of which a reader would call fine at a glance. Built here
  // so the checks are shown failing rather than assumed to work.
  const dir = mkdtempSync(join(tmpdir(), 'claude-md-'));
  try {
    const DEAD = `${'docs'}/${'GONE'}-${'FIXTURE'}.md`;
    const bad = [
      '# CLAUDE.md',
      '**Version:** 2.0.0-dev — one',
      '**Version:** 2.0.0-dev — two',
      'Proposing a Code Reviewer pass before delivery — proceed?',
      // Assembled rather than written: a source line containing a backticked dead path is what L05
      // hunts, so spelling it here would make this file fail the check it is demonstrating.
      `See \`${DEAD}\`.`,
      '',
    ].join('\n');
    writeFileSync(join(dir, 'CLAUDE.md'), bad);
    const badLines = bad.trimEnd().split('\n');

    assert.equal(badLines.filter((l) => MARKER.test(l)).length, 2, 'two markers must be visible');
    assert.ok(!bad.includes('Code artefact produced. Proposing a Code Reviewer pass '
      + '(style, performance, security, best-practice) before final delivery — proceed?'),
    'the paraphrase must not satisfy the verbatim check');
    assert.ok(!existsSync(join(dir, DEAD)), 'the dead path must not resolve');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
