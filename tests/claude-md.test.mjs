// Copyright 2026 Cvetomir Grigorov. Licensed under the Business Source License 1.1 (see LICENSE).
// snowarch — AI ServiceNow Architect. Not affiliated with or endorsed by ServiceNow, Inc.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gatewayDirs } from './lib/gateways.mjs';
import { tempDir } from '../tools/snowarch/tests/helpers/temp.mjs';
import { writeMarker } from '../scripts/lib/release/writers.mjs';

/**
 * `CLAUDE.md` is loaded into every session, so its size is a running cost and its wording is
 * behaviour. This holds the ARC-02-S08 criteria that can be checked from the file itself; the five
 * behavioural tests (T-01…T-04, T-10) are run by hand against a live session and recorded in the PR.
 */
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const doc = readFileSync(join(root, 'CLAUDE.md'), 'utf8');
const lines = doc.trimEnd().split('\n');

const MARKER = /^\*\*Version:\*\* /;

test('criterion 1 — the budget, in the state a release cut writes', () => {
  assert.ok(lines.length <= 200, `${lines.length} lines, cap 200`);
  // ARC-09-C250 — the owner's decision (2026-10-24): CLAUDE.md gains W1 and W2 and loses nothing, and the cap rises
  // from 20,000 to 20,400 bytes to hold them.
  assert.ok(Buffer.byteLength(doc) <= 20_600, `${Buffer.byteLength(doc)} bytes, cap 20,600`);
  // ARC-09-C185a — a release cut rewrites the Version marker (writers.mjs writeMarker), and the file the cut leaves
  // is the one the release's own suite reads. A -dev tree at the cap went green while `release.mjs 2.2.1-rc.99`
  // rolled back on this very case. So the budget is held at the longest version the cut writes for this release: an
  // rc, by the vX.Y.Z-rc.N convention, with a two-digit N, written by the writer the cut uses.
  const base = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version.replace(/-.*$/, '');
  const longest = `${base}-rc.99`;
  const cut = writeMarker(doc, longest);
  assert.ok(cut.ok, cut.message);
  assert.ok(Buffer.byteLength(cut.text) <= 20_600,
    `${Buffer.byteLength(cut.text)} bytes once the cut writes ${longest}, cap 20,600`);
  console.log(`    CLAUDE.md: ${lines.length} lines · ${Buffer.byteLength(doc)} bytes · ${Buffer.byteLength(cut.text)} at ${longest}`);
});

test('criterion 2 — the four surfaces that had to leave', () => {
  // Not spelled here where a spelling would make this file a detector: the retired vocabulary
  // comes from the fixture the lint reads, and the harness-specific phrase is the one ARC-02-S06
  // replaced with "dispatch the sub-agent".
  const vocab = JSON.parse(readFileSync(join(root, 'tools/snowarch/lib/lint-data/retired-vocabulary.json'), 'utf8'))
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
  // ARC-09-C188 — Status runs the panel command, and the release family and pin come from its `Docs:` line. The owner's
  // test of the export read the family by probing the corpus for a branch, which a detached, absorbed checkout has
  // none of, and reported it as "not a git checkout". The skill already said `./snowarch status`; §2 said otherwise.
  const status = lines.find((l) => l.startsWith('When the user types `Status`')) ?? '';
  // An escaped pattern, never a spelled launcher: the launcher audit reads every literal one as a site to account for.
  assert.match(status, /run `\.[/]snowarch status`/, `§2 does not send Status to the panel command: ${status}`);
  assert.match(status, /`Docs:` line is the release family and pin, never a git branch/, '§2 does not name where the family comes from');
  assert.doesNotMatch(status, /doctor --quick --json/, '§2 still sends Status to the JSON report');
});

test('criterion 3 — the two blocks that are copied, not paraphrased', () => {
  // Both are load-bearing for the behavioural tests: T-01 checks the gateway fires and the exact
  // Code Reviewer wording, T-02 checks the §1.1 halt. A paraphrase of either is a silent
  // behaviour change, which is the failure mode a line budget invites.
  assert.ok(doc.includes('Code artefact produced. Proposing a Code Reviewer pass '
    + '(style, performance, security, best-practice) before final delivery — proceed?'));
  // The gateway set is DERIVED from the roster, not pinned at five. The literal five names and the `5`
  // meant the sixth gateway (fso-insurance-specialist, 2.0.9) could only arrive by editing this case, and
  // the seventh would have met the same wall. The guard is the one it always was — a lost row fails and a
  // stray row fails — held for whatever the roster classifies as a gateway; `tests/gateway-wiring.test.mjs`
  // carries the rest of that class.
  const gateways = gatewayDirs(root);
  for (const dir of gateways) {
    assert.ok(doc.includes(`\`.claude/skills/${dir}/SKILL.md\``), `the gateway table lost ${dir}`);
  }
  const rows = lines.filter((l) => /^\| .* \| \*\*[A-Z].*Specialist\*\* \| `\.claude\/skills\//.test(l));
  assert.equal(rows.length, gateways.length, 'the gateway table must have exactly one row per gateway');
});

// ARC-09-C114 — an Envelope is the engagement's standing context: saved with the engagement, listed in
// its state file, and read back by every later session there, so a downstream specialist starts from it
// rather than re-reading the corpus. In every mode, not only under Ultracode (the architect's ruling).
test('ARC-09-C114 — Step 2: an Envelope for a named engagement is saved, listed and read back', () => {
  const step2 = lines.find((l) => l.startsWith('2. **Read engagement context**'));
  assert.ok(step2, 'Phase 1 Step 2 is gone');
  for (const phrase of [
    'A gateway Envelope for a named engagement is saved under `clients/<name>/envelopes/`',
    'listed in the state file\'s `## Envelopes` section (date · gateway · verdict · path)',
    'reading engagement context means the state file and every Envelope it lists',
    'a later prompt in that engagement starts from them instead of re-reading the corpus',
    'An Envelope under `clients/_unfiled/` is loaded by nothing until an engagement is named.',
  ]) assert.ok(step2.includes(phrase), `Step 2 lacks: ${phrase}`);
  assert.doesNotMatch(step2, /Ultracode|max effort/, 'registering an Envelope is not an Ultracode-only rule');
});

test('ARC-11-C141 — §1 keys on the session-start Integrity line: restored continues, cannot restore delivers nothing', () => {
  // The owner's sentence, as the architect relayed it (2026-10-14). The hook prints "Integrity: restored — …" or
  // "Integrity: cannot restore — …"; this is the rule that reads those two words, beside the licence's.
  // Asserted around the launcher's name, which this file does not spell (the launcher audit, ARC-07-C35b).
  const line = doc.split('\n').find((l) => l.startsWith('- **A licence gates deliverables.**')) ?? '';
  const rule = 'An `Integrity:` line: restored → tell the user and continue; cannot restore → no deliverable, point to `';
  assert.ok(line.includes(rule), `§1's licence rule does not read the Integrity line:\n${line}`);
  assert.match(line.slice(line.indexOf(rule) + rule.length), /^\S+ doctor`\.$/, 'the cannot-restore remedy is not the doctor');
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
      // A path with a placeholder is a shape: `clients/<name>/` exists only per engagement. So does
      // `clients/_unfiled/` (ARC-09-C90) and every other path under a gitignored `clients/`: none of
      // it is in a clean clone, which is the checkout this test runs in.
      if (p.includes('<') || p.startsWith('clients/')) { skipped.push(p); continue; }
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
  const dir = tempDir('claude-md-');
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

// ARC-09-C250 — NOTHING THAT WORKS IS REMOVED. The owner's rule (2026-10-24): CLAUDE.md changes are additions. The
// list in tests/fixtures/claude-md-resources.txt was taken from CLAUDE.md at develop 00faaa57: every backticked span,
// every bold span, every command flag, and every sentence that states a rule. A change that removes one edits the list
// in the same pull request, where the reviewer and the owner see it. Bold spans are in because the nine sub-agent names
// are bold, not backticked, and a list without them did not notice their removal.
const RESOURCES = readFileSync(join(root, 'tests/fixtures/claude-md-resources.txt'), 'utf8').trimEnd().split('\n')
  .filter((l) => l && !l.startsWith('#'))
  .map((l) => ({ kind: l.slice(0, l.indexOf('\t')), text: l.slice(l.indexOf('\t') + 1) }));
const removedFrom = (text) => RESOURCES.filter((r) => !text.includes(r.text));
const named = (list) => list.map((r) => `${r.kind}: ${r.text}`);

// The two additions the owner approved on 2026-10-24 (ARC-09-C250, W1 and W2), applied unless CLAUDE.md has them.
const W1_AT = 'If the corpus does not cover it, say so rather than recalling it.';
const W1 = ' In a Grep pattern write each `_` of a table, field or role name as `\\\\?_`: the corpus escapes underscores '
  + '(`sc\\_req\\_item`).';
const W2_AFTER = '- `docs/PLATFORM-NOTES.md`';
const W2 = '- `vendor/docs-map.md` — the corpus map (area · title · pages · products, and how to find a page). Find a page by '
  + 'Grep over `markdown/*/index.md` or `^product: <name>`, never by reading an `index.md` whole.';
const withAdditions = (text) => {
  let t = text.includes(W1) ? text : text.replace(W1_AT, () => `${W1_AT}${W1}`);
  if (!t.includes(W2)) {
    const all = t.split('\n');
    all.splice(all.findIndex((l) => l.startsWith(W2_AFTER)) + 1, 0, W2);
    t = all.join('\n');
  }
  return t;
};

test('ARC-09-C250 — nothing that works is removed: every listed span, rule and flag is still in CLAUDE.md', () => {
  assert.ok(RESOURCES.length >= 150, `the list holds ${RESOURCES.length} entries — it read nothing`);
  assert.deepEqual(named(removedFrom(doc)), [],
    'removed from CLAUDE.md: a removal edits tests/fixtures/claude-md-resources.txt in the same pull request');
  // ...and in the state a release cut writes, which rewrites only the Version line the list leaves out.
  const base = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version.replace(/-.*$/, '');
  assert.deepEqual(named(removedFrom(writeMarker(doc, `${base}-rc.99`).text)), []);
});

test('ARC-09-C250 — the approved additions, W1 and W2, remove nothing', () => {
  const added = withAdditions(doc);
  assert.ok(added.includes(W1) && added.includes(W2), 'W1 and W2 are not both in the text the case checks');
  assert.deepEqual(named(removedFrom(added)), []);
});

test('ARC-09-C250 — the guard names a deleted rule, and only that rule', () => {
  for (const pick of ['self-authorization is prohibited', 'A change to an instance is never filed there']) {
    const rule = RESOURCES.find((r) => r.kind === 'rule' && r.text.includes(pick));
    assert.ok(rule && doc.includes(rule.text), `"${pick}" is not a listed rule of CLAUDE.md`);
    assert.deepEqual(named(removedFrom(doc.replace(rule.text, ''))), named([rule]));
  }
});

// ARC-09-C250 — EVERY SENTENCE. A rewrite that carries none of the listed rule words, or a sentence one word shorter,
// still removes what works: the list holds every sentence of CLAUDE.md at develop, so either is named. The first case is
// C217c's variant B, which rewrites line 13's marker sentence and which the rule-word list did not notice.
test('ARC-09-C250 — a rewritten sentence is named: C217c variant B\'s line 13', () => {
  const old = 'A name neither printed in the skill nor opened in this turn carries "not documented in the bundled corpus — '
    + 'verify on the instance" and no citation; what the corpus does not settle becomes an OPEN QUESTION.';
  const rewrite = 'Only a name a corpus search misses carries "not documented in the bundled corpus — verify on the '
    + 'instance", no citation; one found but unopened is cited by path as unverified; what the corpus does not settle is '
    + 'an OPEN QUESTION.';
  assert.ok(doc.includes(old), 'the sentence the rewrite replaces is not in CLAUDE.md');
  assert.deepEqual(named(removedFrom(doc.replace(old, rewrite))), [`sentence: ${old}`]);
});

test('ARC-09-C250 — a sentence one word shorter is named', () => {
  const sentence = 'If the corpus does not cover it, say so rather than recalling it.';
  assert.ok(doc.includes(sentence), 'the sentence the case shortens is not in CLAUDE.md');
  assert.deepEqual(named(removedFrom(doc.replace(sentence, sentence.replace(' rather', '')))), [`sentence: ${sentence}`]);
});
