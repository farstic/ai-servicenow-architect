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