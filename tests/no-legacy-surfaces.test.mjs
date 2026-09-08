// ARC-02-S05 — permanent. The engine must not describe a surface a user cannot install, or a tool the
// product does not ship. Four tokens name what was cut (D-03 items 8 and 9, P-02, P-07, P-14).
//
// Three kinds of appearance are legitimate and are handled separately, never by widening the token list:
//
//  1. THE DOCUMENTARY RECORD — docs/plans/, docs/decisions/, docs/spikes/, scripts/legacy/. These quote
//     the past deliberately: the story that says "remove context-mode" has to name it. Purging them
//     would destroy the plan that motivated the removal. Same exemption the legacy-name ratchet uses.
//  2. THE HISTORY GLOSSARY in docs/ARCHITECTURE.md — the single permitted place a retired name may be
//     explained. Only lines carrying the `<!-- retired-name: historical -->` marker qualify; a line in
//     that file WITHOUT the marker still fails, so the exemption cannot spread through the file.
//  3. FILES ANOTHER ARC OWNS — attributed in tests/legacy-names.allowlist.json, the same owner map the
//     sibling ratchet uses. One list, one place. The entry disappears when that ARC rewrites the file.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync, mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

import { lintLineEndings, lintHyphenSplits } from './lib/editorconfig.mjs';
import { isHistory, honoursMarker } from '../packages/contract/lint/lib/scan.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const owners = JSON.parse(readFileSync(join(root, 'tests/legacy-names.allowlist.json'), 'utf8')).files;

export const SURFACES = [
  ['context-mode', 'the author\'s personal hook tooling (D-03 item 9)'],
  ['ctx_', 'a context-mode tool prefix'],
  ['claude_desktop_config', 'the Claude Desktop registration path of the retired install narrative'],
  ['claude-ai-projects', 'the claude.ai project-instruction templates that never shipped (P-07)'],
];

const EXEMPT_PREFIXES = ['docs/plans/', 'docs/decisions/', 'docs/spikes/', 'scripts/legacy/'];
const HISTORY_FILE = 'docs/ARCHITECTURE.md';
const HISTORY_MARKER = '<!-- retired-name: historical -->';
const SCANNED = /\.(md|json|sh)$/;

// The rule, as a function over a file list, so the negative below runs THIS code and not a copy of it.
export function findLegacySurfaces({ base, files, allow = {} }) {
  const out = [];
  for (const rel of files) {
    if (!SCANNED.test(rel)) continue;
    if (EXEMPT_PREFIXES.some((p) => rel.startsWith(p))) continue;
    if (rel in allow) continue;
    const p = join(base, rel);
    if (!existsSync(p)) continue;
    readFileSync(p, 'utf8').split('\n').forEach((line, i) => {
      if (rel === HISTORY_FILE && line.includes(HISTORY_MARKER)) return;
      for (const [token, why] of SURFACES) {
        if (line.includes(token)) out.push(`no-legacy-surfaces: ${rel}:${i + 1}: "${token}" — ${why}`);
      }
    });
  }
  return out;
}

const tracked = () => execFileSync('git', ['ls-files'], { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
  .split('\n').filter(Boolean);

test('no retired surface is described outside the history glossary', () => {
  const hits = findLegacySurfaces({ base: root, files: tracked(), allow: owners });
  assert.deepEqual(hits, [], `${hits.length} hit(s):\n  ${hits.join('\n  ')}`);
});

test('the history glossary is exempt only line by line, and only where the marker says so', () => {
  // A line in docs/ARCHITECTURE.md without the marker must still fail — otherwise naming the file once
  // would exempt every future line in it, which is how an exemption quietly becomes a hole.
  const text = readFileSync(join(root, HISTORY_FILE), 'utf8');
  const marked = text.split('\n').filter((l) => l.includes(HISTORY_MARKER)).length;
  assert.ok(marked > 0, 'the glossary must carry the marker on its retired-name rows');
  const unmarked = findLegacySurfaces({ base: root, files: [HISTORY_FILE] });
  assert.deepEqual(unmarked, [], 'every retired name in ARCHITECTURE.md must be on a marked line');
  console.log(`    ${marked} marked glossary line(s); ${SURFACES.length} tokens enforced everywhere else`);
});

test('a planted ctx_ token fails — and each exemption suppresses only what it names', () => {
  const dir = mkdtempSync(join(tmpdir(), 'snowarch-surfaces-'));
  try {
    mkdirSync(join(dir, 'docs/plans'), { recursive: true });
    mkdirSync(join(dir, 'packages/x'), { recursive: true });
    writeFileSync(join(dir, 'docs/GUIDE.md'), 'run `ctx_batch_execute` first\n');
    writeFileSync(join(dir, 'docs/plans/PLAN.md'), 'the plan says remove ctx_batch_execute\n');
    writeFileSync(join(dir, 'packages/x/README.md'), 'writes claude_desktop_config.json\n');
    writeFileSync(join(dir, 'notes.txt'), 'ctx_ in an unscanned extension\n');
    const files = ['docs/GUIDE.md', 'docs/plans/PLAN.md', 'packages/x/README.md', 'notes.txt'];

    const hits = findLegacySurfaces({ base: dir, files });
    assert.equal(hits.length, 2, `expected the guide and the package README to fail, got ${JSON.stringify(hits)}`);
    assert.match(hits[0], /docs\/GUIDE\.md:1: "ctx_"/);
    assert.match(hits[1], /packages\/x\/README\.md:1: "claude_desktop_config"/);

    const withOwner = findLegacySurfaces({ base: dir, files, allow: { 'packages/x/README.md': 'ARC-04' } });
    assert.equal(withOwner.length, 1, 'an owner entry suppresses its own file only');
    assert.match(withOwner[0], /docs\/GUIDE\.md/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('every owner exemption names an ARC and still matches — a stale one is removed, not kept', () => {
  const used = Object.keys(owners).filter((f) => findLegacySurfaces({ base: root, files: [f] }).length > 0);
  for (const f of used) assert.match(String(owners[f]), /^ARC-\d\d$/, `${f} has no owning ARC`);
  console.log(`    ${used.length} owner-attributed file(s) still carry a retired surface: ${used.join(', ') || 'none'}`);
});

// ─── ARC-02-S06 permanent greps ──────────────────────────────────────────────
//
// The vocabulary sweep is done once; these keep it done. Each is one of the story's acceptance
// criteria, promoted from a command run at review time into a check that runs on every push —
// a criterion verified once is a criterion that decays.
//
// Scope: the documents a reader might ACT on. `docs/plans/**` and `docs/spikes/**` are history
// and describe the vocabulary being retired, which is the same exemption `engine-lint`'s scan
// set makes (ARC-05-S03) — one definition of clean, not two.

const read = (rel) => readFileSync(join(root, rel), 'utf8').replace(/\r/g, '');

/**
 * The SK-09 vocabulary exemptions, anchored to a file AND a substring of the line.
 *
 * Anchoring to both is what stops an exemption widening: "this file may say Tier" would exempt
 * every future line in it, and the one real case here is a customer's own CI classification
 * quoted inside a worked example.
 */
const vocabAllow = JSON.parse(
  readFileSync(join(root, 'tests/fixtures/vocabulary-allowlist.json'), 'utf8')).allow;
const isExemptVocabLine = (file, line) =>
  vocabAllow.some((a) => a.file === file && line.includes(a.context));

/**
 * A file's lines, stopping at the historical heading if it has one.
 *
 * `docs/CHANGELOG.md` is entirely the imported engine's history: its entries record what files
 * were CALLED and what vocabulary was in use at the time, and rewriting them would falsify the
 * record of what was decided and when. The heading carries a sentence saying so. Shared by the
 * criterion-2 and criterion-4 checks, so "current" means the same thing to both.
 */
function currentLines(rel) {
  const out = [];
  for (const line of read(rel).split('\n')) {
    if (/^## Before 2\.0\.0/.test(line)) break;
    out.push(line);
  }
  return out;
}

const IN_SCOPE = () => tracked().filter((f) =>
  (f === 'CLAUDE.md' || f === 'VALIDATION-TESTS.md'
    || f.startsWith('governance/') || f.startsWith('.claude/')
    // History, and each for its own reason:
    //   plans/spikes    — describe the vocabulary being retired, as evidence
    //   decisions/**    — an ADR that RECORDS the ruling retiring a vocabulary has to quote it
    //   RELICENSING.md  — a consent record naming the files as they were named when consent was
    //                     given; rewriting that list changes what was agreed to
    // The engine lint (ARC-05-S03) exempts the same shape, and the legacy-name ratchet already
    // exempts RELICENSING by name. One definition of history, not three.
    || (f.startsWith('docs/') && !f.startsWith('docs/plans/') && !f.startsWith('docs/spikes/')
        && !f.startsWith('docs/decisions/') && f !== 'docs/RELICENSING.md'))
  && /\.(md|json|mjs)$/.test(f));

test('ARC-02-S06 criterion 2 — no "Tier [0-9]" outside history and the anchored exemptions', () => {
  // `docs/CHANGELOG.md` below "## Before 2.0.0" is history: those entries record what things
  // were called, and rewriting them would falsify the record. The heading carries a sentence
  // saying so, and this check honours it by path + heading rather than by ignoring the file.
  const hits = [];
  for (const f of IN_SCOPE()) {
    currentLines(f).forEach((line, i) => {
      if (!/Tier [0-9]/.test(line)) return;
      if (line.includes('<!-- retired-name: historical -->')) return;
      if (isExemptVocabLine(f, line)) return;
      hits.push(`${f}:${i + 1}: ${line.trim().slice(0, 90)}`);
    });
  }
  assert.deepEqual(hits, [], `${hits.length} hit(s):\n  ${hits.join('\n  ')}`);
});

test('ARC-02-S06 criterion 3 — no "Task tool" in CLAUDE.md or governance/', () => {
  // Harness-neutral wording: the engine describes dispatching a sub-agent, not the name of the
  // mechanism a particular client uses to do it.
  const hits = [];
  for (const f of tracked().filter((x) => x === 'CLAUDE.md' || x.startsWith('governance/'))) {
    read(f).split('\n').forEach((line, i) => {
      if (line.includes('Task tool')) hits.push(`${f}:${i + 1}`);
    });
  }
  assert.deepEqual(hits, []);
});

test('ARC-02-S06 criterion 4 — every governance reference is prefixed and resolves', () => {
  const NAMES = ['governance-rules.md', 'taxonomy.md', 'prompt-patterns.md'];
  const unprefixed = [];
  const dangling = [];
  for (const f of IN_SCOPE()) {
    if (f.startsWith('governance/')) continue;
    currentLines(f).forEach((line, i) => {
      for (const n of NAMES) {
        const re = new RegExp(`(^|[^/\\w.-])${n.replace('.', '\\.')}`);
        if (re.test(line)) unprefixed.push(`${f}:${i + 1} ${n}`);
      }
    });
  }
  for (const n of NAMES) {
    if (!existsSync(join(root, 'governance', n))) dangling.push(`governance/${n}`);
  }
  assert.deepEqual(dangling, [], 'a reference points at a file that is not there');
  assert.deepEqual(unprefixed, [], `${unprefixed.length} unprefixed reference(s)`);
});

test('ARC-02-S12 criterion 2 — no retired name survives in the engine surface', () => {
  // The permanent form of the sweep. Names come from `retired-names.json`, so the check grows with
  // the catalogue rather than being a second list; history and the files whose subject is the past
  // are excluded by the same helper the lint uses, so "clean" means one thing.
  // Word boundaries for identifier-shaped keys, exactly as L03 matches them. A substring match
  // reports an old name inside the CURRENT tool that replaced it — the new name is often the old
  // one with a prefix — and produced 32 such false hits on the first run. (Stated without an
  // example: naming one here would make this file a detector its own sweep then has to exempt.)
  const escape = (k) => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const matchers = Object.keys(JSON.parse(read('packages/contract/retired-names.json')))
    .map((k) => [k, new RegExp(/^[A-Za-z0-9_]+$/.test(k) ? `\\b${escape(k)}\\b` : escape(k))]);
  const hits = [];
  for (const f of IN_SCOPE()) {
    // The lint's own predicate for "a file whose subject is the past" — history and policy files,
    // `docs/CONTRIBUTING.md` among them, because a document about which words are retired has to
    // spell them. One definition of clean, shared with L01/L02/L03 rather than guessed again.
    if (isHistory(f)) continue;
    currentLines(f).forEach((line, i) => {
      // The marker excuses a line only where the LINT honours it — `honoursMarker`, not "any file".
      // Skipping it everywhere would let a marker planted in a skill silence this check while L03
      // still failed on it, which is two answers to one question even when CI stays red.
      if (honoursMarker(f) && line.includes('retired-name: historical')) return;
      for (const [name, re] of matchers) {
        if (re.test(line)) hits.push(`${f}:${i + 1} ${name}`);
      }
    });
  }
  assert.deepEqual(hits, [], `${hits.length} retired name(s) in the engine surface`);
});

test('ARC-02-S12 criterion 4 — every tool named in the governing texts exists', () => {
  // `governance/governance-rules.md` and `docs/PLATFORM-NOTES.md` name tools in prose. A name the
  // server does not answer is worse there than anywhere else: those two are what a session reads
  // before it acts.
  const contract = JSON.parse(read('packages/snowarch/dist/contract.json'));
  const names = new Set(contract.tools.map((t) => t.name));
  const missing = [];
  for (const f of ['governance/governance-rules.md', 'docs/PLATFORM-NOTES.md']) {
    read(f).split('\n').forEach((line, i) => {
      for (const m of line.matchAll(/\bsnow_[a-z0-9_]+\b/g)) {
        if (!names.has(m[0])) missing.push(`${f}:${i + 1} ${m[0]}`);
      }
    });
  }
  assert.deepEqual(missing, [], 'a governing text names a tool the server does not have');
});

test('ARC-02-S10 criterion 1 — the platform notes carry nothing from an instance', () => {
  const doc = read('docs/PLATFORM-NOTES.md');

  // Five fields per entry, and the same number of each. An entry missing `Engine consequence:` is
  // the failure mode worth catching: it reads as a finished note while saying nothing about what
  // any specialist now does differently, which is the only reason the note is in the engine.
  const entries = (doc.match(/^## PN-\d\d /gm) ?? []).length;
  assert.ok(entries >= 7, `${entries} entries`);
  for (const field of ['Applies to', 'Behaviour', 'Grounding', 'Evidence', 'Engine consequence']) {
    const n = (doc.match(new RegExp(`^\\*\\*${field}:\\*\\*`, 'gm')) ?? []).length;
    assert.equal(n, entries, `${field}: ${n} of ${entries} entries`);
  }

  // Nothing from an instance, ever. An engagement journal became a product document once (P-13);
  // what made that unsafe was the instance data in it, not the prose.
  const leaks = doc.split('\n')
    .map((line, i) => [i + 1, line])
    .filter(([, line]) => /dev[0-9]{5,}|[0-9a-f]{32}|@/.test(line))
    .map(([n, line]) => `docs/PLATFORM-NOTES.md:${n}: ${line.trim().slice(0, 60)}`);
  assert.deepEqual(leaks, []);

  // The retired vocabulary and the old config surface, from the fixture rather than spelled here.
  const vocab = JSON.parse(read('tests/fixtures/retired-vocabulary.json')).tokens.map((t) => t.pattern);
  const banned = [...vocab, ...vocab.map((v) => v.replace(/^mcp__/, '').replace(/__$/, '')),
    'claude_desktop_config'].map((v) => new RegExp(v));
  assert.deepEqual(doc.split('\n').filter((l) => banned.some((re) => re.test(l))), []);

  // An entry with no corpus page says so in those words. The alternative a reader cannot detect is
  // an invented path that looks checkable, which is why the wording is fixed rather than free.
  // A field is its marker line plus any continuation before the next field — two entries carry
  // paths too long to sit on one line, and reading only the marker line would call them ungrounded.
  const lines = doc.split('\n');
  const grounding = lines.flatMap((l, i) => {
    if (!l.startsWith('**Grounding:**')) return [];
    const cont = [];
    for (let k = i + 1; k < lines.length && lines[k].trim() && !lines[k].startsWith('**'); k += 1) {
      cont.push(lines[k]);
    }
    return [[l, ...cont].join(' ')];
  });
  const ungrounded = grounding.filter((l) => !/markdown\//.test(l));
  assert.deepEqual(ungrounded, [], 'a Grounding line names no path at all');
  for (const l of grounding.filter((x) => /none in ServiceNowDocs/.test(x))) {
    assert.match(l, /none in ServiceNowDocs \(/);
  }
  // Criterion 3. The old file's name is built from the retired product name in the fixture rather
  // than written out — spelling it here would make this file a detector the ratchet has to exempt,
  // which it duly caught when the first version of this test did exactly that.
  const retiredProduct = vocab.find((v) => /^[a-z]+$/.test(v));
  assert.ok(retiredProduct, 'no bare product name in the vocabulary fixture');
  assert.ok(!existsSync(join(root, `docs/${retiredProduct}-field-notes.md`)),
    'criterion 3: the field notes are gone');
});

test('ARC-02-S09 criteria 1 and 2 — the Modes and presets page says what it must', () => {
  // Each string is a decision someone has to be able to find: the four preset names and six flag
  // names (`01` §6.3), the review screen and the D-05 sentence about what a failed probe does and
  // does not do, the environment regex, the production acknowledgement, and D-04's store facts.
  // Asserted by presence rather than by prose, because ARC-07-S10 rewrites the wording around
  // them and must be free to — without dropping any of them on the way.
  const doc = read('docs/MODES-AND-PRESETS.md');
  const required = [
    'read-only', 'pdi-developer', 'full', 'custom',
    'WRITE', 'CMDB_WRITE', 'SCRIPTING', 'ATF', 'NOW_ASSIST', 'FLUENT',
    // And the keys a reader actually types. The short names are `01` §6.3's prose form; the store
    // and the environment take the `*_ENABLED` form, and four of the six appeared in the page only
    // incidentally while two did not appear at all — so a reader could not map a bullet to the key.
    'WRITE_ENABLED', 'CMDB_WRITE_ENABLED', 'SCRIPTING_ENABLED',
    'ATF_ENABLED', 'NOW_ASSIST_ENABLED', 'FLUENT_ENABLED',
    'Enter = accept as shown', String.raw`^https://dev\d+\.service-now\.com`,
    '--ack-prod', 'prodWriteAck', '.local/instances.json', '0600',
    'OneDrive', 'Dropbox', 'iCloud Drive', 'Google Drive',
    '--yes', "Propose, don't impose",
    // Verbatim from D-05: the whole point of the review screen is that a probe informs the user
    // and never decides for them, and a paraphrase is exactly how that guarantee gets softened.
    'A probe that fails downgrades the recommendation shown on that line; '
      + 'it never flips the toggle by itself',
    '<!-- PRESETS:BEGIN (generated from the contract by scripts/gen-governance.mjs — ARC-05) -->',
    '<!-- PRESETS:END -->',
  ];
  assert.deepEqual(required.filter((r) => !doc.includes(r)), []);

  // Criterion 2. The page is current-facing, so neither the retired vocabulary nor a legacy product
  // name belongs in it — including in the upgrade note, which names the BEHAVIOUR that changed
  // rather than the package it changed in.
  //
  // The words come from the vocabulary fixture, never spelled here: a file that spells one becomes
  // a detector the legacy-name ratchet then has to exempt, which is exactly what this file did on
  // the first attempt. Bare product names are derived by unwrapping the `mcp__…__` patterns —
  // `servicenow-mcp` is deliberately NOT retired repo-wide (D-01's npm record is nameable), it is
  // forbidden in THIS file, so the criterion needs the bare form and the fixture holds the prefix.
  const vocab = JSON.parse(read('tests/fixtures/retired-vocabulary.json')).tokens.map((t) => t.pattern);
  const bare = vocab.map((v) => v.replace(/^mcp__/, '').replace(/__$/, ''));
  const banned = [...new Set([...vocab, ...bare])].map((v) => new RegExp(v));
  const offending = doc.split('\n')
    .map((line, i) => [i + 1, line])
    .filter(([, line]) => banned.some((re) => re.test(line)))
    .map(([n]) => `docs/MODES-AND-PRESETS.md:${n}`);
  assert.deepEqual(offending, []);

  // The budget of record is ARC-02-S09 criterion 1, amended 2026-09-08 from 150 to **160**: the
  // page merges ARC-04's tested store and permission claims rather than replacing them, and
  // ARC-07-S10 still has probe strings to add. 150 was set for a page written from scratch.
  // The three ways a wrapping pass damages a document without changing a sentence. They were
  // page-local here until `tests/lib/editorconfig.mjs` took the rule repo-wide; delegating rather
  // than keeping a second copy means "malformed" means one thing, and this page cannot drift into
  // being held to a different standard than every other file.
  const ec = [...lintLineEndings(root, ['docs/MODES-AND-PRESETS.md']),
    ...lintHyphenSplits(root, ['docs/MODES-AND-PRESETS.md'])];
  assert.deepEqual(ec, []);

  const lines = doc.trimEnd().split('\n').length;   // what `wc -l` reports for a file ending in \n
  console.log(`    ARC-02-S09: docs/MODES-AND-PRESETS.md is ${lines} lines (budget of record: 160)`);
  assert.ok(lines <= 160, `${lines} lines — over criterion 1's budget of 160`);
});

test('ARC-02-S06 criterion 5 — governance §2 names no retired tool', () => {
  // The interim §2.2 will be replaced twice (ARC-05-S05, S06). This asserts that whatever it
  // says, it does not tell a reader to call something the server answers with UNKNOWN_TOOL.
  //
  // The names come from ARC-05's generated `retired-names.json`, never from an alternation
  // written here. Two reasons, and the second is the one that decided it: a hard-coded list
  // covers the seven names whoever wrote it happened to remember and silently stops covering
  // anything renamed afterwards; and a test file that spells retired names becomes a detector
  // its own sweep has to exempt, which would blind the L03 check to every other line in this
  // file. `tests/lib/lint-rules.mjs` made the same call for the vocabulary tokens.
  const retired = Object.keys(JSON.parse(read('packages/contract/retired-names.json')));
  const hits = [];
  read('governance/governance-rules.md').split('\n').forEach((line, i) => {
    for (const name of retired) {
      if (line.includes(name)) hits.push(`governance/governance-rules.md:${i + 1} ${name}`);
    }
  });
  assert.deepEqual(hits, [], `${hits.length} retired name(s) in the governance text`);
  assert.ok(retired.length > 300, `only ${retired.length} names loaded — the source moved`);
});

test('and a marker planted where the lint does not honour it is still reported', () => {
  // `honoursMarker` is true for ARCHITECTURE, the ADRs and the CHANGELOG — documents whose subject
  // includes the past. A SKILL.md is not one of them, and a comment does not make it one.
  // The retired name comes from the fixture, not from this line: a test that spells one becomes a
  // detector its own sweep has to exempt, which is how this file already failed L03 twice.
  const someRetired = Object.keys(JSON.parse(read('packages/contract/retired-names.json')))
    .find((k) => /^[a-z][a-z0-9_]+$/.test(k));
  const line = `Use \`${someRetired}\` here. <!-- retired-name: historical -->`;
  const skill = '.claude/skills/developer/SKILL.md';
  assert.equal(honoursMarker(skill), false, 'a skill must not honour the marker');
  assert.equal(honoursMarker('docs/ARCHITECTURE.md'), true, 'ARCHITECTURE must honour it');
  // The predicate is what this check now consults, so the marker on that line excuses nothing.
  assert.ok(!(honoursMarker(skill) && line.includes('retired-name: historical')));
});
