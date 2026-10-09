// ARC-02-S05 — permanent. The engine must not describe a surface a user cannot install, or a tool the
// product does not ship. Four tokens name what was cut (D-03 items 8 and 9, P-02, P-07, P-14).
//
// Three kinds of appearance are legitimate and are handled separately, never by widening the token list:
//
//  1. THE DOCUMENTARY RECORD — docs/plans/, docs/decisions/, docs/spikes/. These quote
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
import { readFileSync, existsSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

import { lintLineEndings, lintHyphenSplits } from './lib/editorconfig.mjs';
import { isHistory, honoursMarker } from '../packages/contract/lint/lib/scan.mjs';
import { tempDir } from '../tools/snowarch/tests/helpers/temp.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const owners = JSON.parse(readFileSync(join(root, 'tests/legacy-names.allowlist.json'), 'utf8')).files;

export const SURFACES = [
  ['context-mode', 'the author\'s personal hook tooling (D-03 item 9)'],
  ['ctx_', 'a context-mode tool prefix'],
  ['claude_desktop_config', 'the Claude Desktop registration path of the retired install narrative'],
  ['claude-ai-projects', 'the claude.ai project-instruction templates that never shipped (P-07)'],
];

const EXEMPT_PREFIXES = ['docs/plans/', 'docs/decisions/', 'docs/spikes/'];
/**
 * A fourth kind, one file wide: the page whose SUBJECT is removing these surfaces (ARC-10-S01).
 *
 * `docs/MIGRATION.md` tells a user of the old install how to take the retired hook tooling off
 * their machine, which it cannot do without naming it. Not the owner map — that list is shared
 * with the sibling ratchet, which already exempts this file, and an entry there would be reported
 * as stale by its backward direction. The exemption is kept honest where it can actually be
 * narrowed: `tests/migration-doc.test.mjs` asserts the name appears under "Optional cleanup" and
 * nowhere else on the page.
 */
const EXEMPT_FILES = new Set([
  'docs/MIGRATION.md',
  // ARC-10-S03. This was exempt through the OWNER MAP until the allow-list was reduced, which is
  // the wrong list for it: an owner entry says "somebody still owes a rewrite", and nobody owes
  // one here. A changelog names what was REMOVED — the 2.0.0 notes say the old README told readers
  // to edit `claude_desktop_config.json` and that this product never does — and naming a surface
  // while recording its removal is the opposite of describing one a user could install.
  'docs/CHANGELOG.md',
]);
const HISTORY_FILE = 'docs/ARCHITECTURE.md';
const HISTORY_MARKER = '<!-- retired-name: historical -->';
const SCANNED = /\.(md|json|sh)$/;

// The rule, as a function over a file list, so the negative below runs THIS code and not a copy of it.
export function findLegacySurfaces({ base, files, allow = {} }) {
  const out = [];
  for (const rel of files) {
    if (!SCANNED.test(rel)) continue;
    if (EXEMPT_PREFIXES.some((p) => rel.startsWith(p))) continue;
    if (EXEMPT_FILES.has(rel)) continue;
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
  const dir = tempDir('snowarch-surfaces-');
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
 * The files that HAVE a history, and so a boundary below which their text is a record.
 *
 * `docs/CHANGELOG.md` is the imported engine's history: its entries record what files were CALLED and
 * what vocabulary was in use at the time, and rewriting them would falsify the record of what was
 * decided and when. Its release sections begin `## <version>`, which is what the boundary below looks
 * for. ARC-09-C79: that boundary used to apply to EVERY file in scope, so a file whose own sections are
 * numbered ("## 1. Operating principles") was read for the lines above its first one — CLAUDE.md for 8
 * of 136, `governance/taxonomy.md` for 10 of 310. A boundary belongs to the files that have a history.
 */
export const HISTORY_FILES = new Set(['docs/CHANGELOG.md']);

/** The retired vocabulary criterion 2 looks for. One definition, so a plant and the sweep cannot disagree. */
export const TIER = /Tier [0-9]/;

/**
 * A file's lines, stopping at the historical heading if it has one. Shared by the criterion-2,
 * criterion-4 and retired-name checks and the memory-convention check, so "current" means the same
 * thing to all of them.
 */
function currentLines(rel) {
  return currentLines0(read(rel), rel);
}

/**
 * The same boundary, over text already in hand — so a caller may flatten it (ARC-10-S04). Only a file in
 * HISTORY_FILES has one; any other, and any caller that names no file, is read whole.
 */
export function currentLines0(text, rel) {
  const lines = text.split('\n');
  if (!HISTORY_FILES.has(rel)) return lines;
  const out = [];
  for (const line of lines) {
    // ARC-09-C17: history starts at the NEWEST release heading, not at the frozen one — a release
    // creates a `## <version>` section above it, and its contents are a record, not live text.
    if (/^## (\d|Before )/.test(line)) break;
    out.push(line);
  }
  return out;
}

const IN_SCOPE = () => tracked().filter((f) =>
  (f === 'CLAUDE.md' || f === 'tests/VALIDATION-TESTS.md'
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
      if (!TIER.test(line)) return;
      if (line.includes('<!-- retired-name: historical -->')) return;
      if (isExemptVocabLine(f, line)) return;
      hits.push(`${f}:${i + 1}: ${line.trim().slice(0, 90)}`);
    });
  }
  assert.deepEqual(hits, [], `${hits.length} hit(s):\n  ${hits.join('\n  ')}`);
});

/**
 * The retired standing rule's three tokens, and the sweep that looks for them.
 *
 * ARC-10-S04's own tokens, assembled rather than spelled — the split falls INSIDE the retired word,
 * not at the hyphen before the rest of the filename, which would leave the word itself intact and
 * be reported by both the ratchet and L03.
 */
export const OLD_RULE = [
  ['now', 'ai', 'kit', '-field-notes'].join(''),
  ['Standing Rule', ' — Document Every Solved Problem'].join(''),
  ['MCP findings are', ' EXCLUDED'].join(''),
];

/**
 * Lifted out of the test at ARC-10-S04's acceptance (item B10-02) so a FIXTURE can drive it. While
 * it was inlined over `IN_SCOPE()` the only negative available was a string comparison, and that is
 * what the test had.
 *
 * WHITESPACE-COLLAPSED, and the line number goes with it. These tokens are PROSE — the history
 * paragraph wraps "…Every Solved / Problem" across two lines, and a line-by-line scan misses a
 * wrapped occurrence in exactly the same way. It missed this file's own paragraph first, which is
 * how the hole was found: a sweep that cannot see a token split by a newline is one somebody gets
 * past by reflowing a paragraph.
 */
export const flattenCurrent = (text, rel) => currentLines0(text, rel).join(' ').replace(/\s+/g, ' ');

export function findOldRule({ files, read: readFile, allowed = new Set(), tokens = OLD_RULE }) {
  const flat = flattenCurrent;
  const hits = [];
  for (const f of files) {
    if (allowed.has(f)) continue;
    const text = flat(readFile(f), f);
    for (const token of tokens) if (text.includes(token)) hits.push(`${f}: "${token}"`);
  }
  return hits;
}

test('ARC-10-S04 AC 1/AC 4 — the old standing rule survives only where it is replaced', () => {
  // The v2 rule sent every finding to one file and then excluded the ones about our own server.
  // Both halves are retired. The ONE place their words may appear is the paragraph in CONTRIBUTING
  // that says what happened to them — a reader who remembers the rule has to be able to find out.
  //
  // The first token is assembled, and THE SPLIT HAS TO FALL INSIDE THE RETIRED WORD — not at the
  // hyphen before the rest of the filename, which leaves the word itself intact and was duly
  // reported by both the ratchet and L03. Twice, in fact: the second report was this comment,
  // quoting the fragment while explaining that it must not be written. A comment claiming a file
  // avoids a sweep is not the same as avoiding it, and the sweep is what decides.
  const ALLOWED = new Set(['docs/CONTRIBUTING.md', 'docs/PLATFORM-NOTES.md']);
  const hits = findOldRule({ files: IN_SCOPE(), read, allowed: ALLOWED });
  assert.deepEqual(hits, [], `${hits.length} live reference(s) to the retired standing rule`);

  // Both directions. The history paragraph must actually carry them, or this passes on a tree where
  // the replacement was never explained and a reader who remembers the rule is left guessing.
  const contributing = flattenCurrent(read('docs/CONTRIBUTING.md'), 'docs/CONTRIBUTING.md');
  for (const token of OLD_RULE) {
    assert.ok(contributing.includes(token), `the history paragraph does not name "${token}"`);
  }
  // ...and the negative the story asks for, ON A REAL FILE THROUGH THE SWEEP (acceptance item
  // B10-02). What stood here was `OLD_RULE.some((t) => `see docs/${t}.md`.includes(t))` — which
  // asserts that `String.includes` works and never runs the sweep at all. A control that cannot
  // fail is worse than no control: it reads, in a diff, exactly like one that can.
  const dir = tempDir('snowarch-oldrule-');
  try {
    mkdirSync(join(dir, 'docs'), { recursive: true });
    const planted = 'docs/GUIDE.md';
    writeFileSync(join(dir, planted), `put it in ${OLD_RULE[0]}.md as before\n`);
    writeFileSync(join(dir, 'docs/CONTRIBUTING.md'), `the retired ${OLD_RULE[0]} rule is gone\n`);
    const readAt = (f) => readFileSync(join(dir, f), 'utf8');

    const found = findOldRule({ files: [planted, 'docs/CONTRIBUTING.md'], read: readAt, allowed: ALLOWED });
    assert.equal(found.length, 1, `expected exactly the planted file, got ${JSON.stringify(found)}`);
    assert.match(found[0], /^docs\/GUIDE\.md: "/);
    // The allowed file carried the same token and was not reported — the exemption suppresses its
    // own file only, which is the other half of the rule.
    assert.equal(found.some((h) => h.startsWith('docs/CONTRIBUTING.md')), false);

    // And the wrapped case, which is why the sweep collapses whitespace at all: the same token
    // split across a newline is still a hit.
    writeFileSync(join(dir, planted), `put it in ${OLD_RULE[1].replace(' — ', '\n— ')} as before\n`);
    assert.equal(findOldRule({ files: [planted], read: readAt, allowed: ALLOWED }).length, 1,
      'a token split across a newline is no longer found');
  } finally { rmSync(dir, { recursive: true, force: true }); }

  // ...and with the planted file gone, nothing lingers.
  assert.deepEqual(findOldRule({ files: IN_SCOPE(), read, allowed: ALLOWED }), []);
});

test('ARC-10-S04 — CLAUDE.md and CONTRIBUTING agree on the four homes', () => {
  // AC 2's other half: the short form a session reads and the table a maintainer reads must not
  // drift into two different rules. Asserted on the four DESTINATIONS rather than on wording, so
  // either may be rewritten and neither may quietly grow a fifth home or lose one.
  const claude = read('CLAUDE.md');
  const contributing = read('docs/CONTRIBUTING.md');
  for (const home of ['docs/PLATFORM-NOTES.md', 'packages/snowarch/tests/',
    'docs/TROUBLESHOOTING.md', 'clients/<name>/']) {
    assert.ok(claude.includes(home), `CLAUDE.md § 11 does not name ${home}`);
    assert.ok(contributing.includes(home), `the CONTRIBUTING table does not name ${home}`);
  }
  // The promise that replaced the exclusion, in both places.
  for (const [name, doc] of [['CLAUDE.md', claude], ['docs/CONTRIBUTING.md', contributing]]) {
    assert.match(doc, /no excluded category/, `${name} does not say the exclusion is gone`);
    assert.match(doc, /same pull request as the fix or the test/, `${name} does not say when to record`);
  }

  // AC 3 (acceptance item B10-03): each row carries A REAL ONE, and the examples must RESOLVE.
  // The assertions above are about destinations; an example that rots is the more likely failure,
  // because it names a specific note or file rather than a directory. All four were checked by
  // hand in the acceptance pass and all four held — this is what keeps them holding.
  const table = contributing.slice(contributing.indexOf('## Where a finding goes'));
  assert.ok(table.includes('| Kind | Home | A real one |'), 'the four-homes table lost its example column');
  for (const [example, where] of [
    ['PN-07', 'docs/PLATFORM-NOTES.md'],
    ['client-orderby.test.ts', 'packages/snowarch/tests/servicenow/client-orderby.test.ts'],
  ]) {
    assert.ok(table.includes(example), `the table no longer cites ${example}`);
    assert.ok(existsSync(join(root, where)), `${where} does not exist — the example does not resolve`);
  }
  // `PN-07` is a note INSIDE a file, so its existence is a different question from the file's.
  assert.match(read('docs/PLATFORM-NOTES.md'), /\bPN-07\b/, 'PN-07 is cited but is not in the notes');
  assert.ok(existsSync(join(root, 'docs/TROUBLESHOOTING.md')));
});

test('ARC-10-S02 AC 1 — `memory/MEMORY.md` survives only where it is retired', () => {
  // The old engine designated one file for cross-session notes. It is retired, and the two places
  // allowed to say so are the ones a reader arrives at: the CONTRIBUTING rule that retires it, and
  // the migration page's row telling a user where their copy goes. Anywhere else — `CLAUDE.md`, a
  // skill, an agent — is the convention still being taught while the rule says it is gone.
  //
  // The allowance is per FILE rather than per line, because both of those files name it more than
  // once and in more than one shape; the ban is on the convention living on somewhere a reader
  // would take as current.
  const ALLOWED = new Set(['docs/CONTRIBUTING.md', 'docs/MIGRATION.md']);
  // ...or ANY line that says it is retired. The rule caught this file's own changelog entry on the
  // first run, and the entry was right: a release note that names what it retires is the opposite
  // of teaching it, and a reader who has that file needs to recognise the name. So the allowance
  // is the SENTENCE, not a third filename — naming the convention while announcing its end is
  // always fine, and naming it any other way is what this forbids.
  const RETIRING = /\bretired\b/;
  const hits = [];
  for (const f of IN_SCOPE()) {
    if (ALLOWED.has(f)) continue;
    currentLines(f).forEach((line, i) => {
      if (!line.includes('memory/MEMORY.md') || RETIRING.test(line)) return;
      hits.push(`${f}:${i + 1}: ${line.trim().slice(0, 80)}`);
    });
  }
  assert.deepEqual(hits, [], `${hits.length} live reference(s) to the retired convention`);

  // Both directions: the two allowed files must actually carry it, or this passes on a tree where
  // the retirement was never written down and nobody is told where their notes go.
  for (const f of ALLOWED) {
    assert.ok(read(f).includes('memory/MEMORY.md'), `${f} does not name what it retires`);
  }
  // ...and the sentence allowance is not a hole: a line naming it WITHOUT saying it is retired is
  // still a hit, which is the only thing keeping the exemption from reading as "mention it freely".
  assert.equal(RETIRING.test('see memory/MEMORY.md for your notes'), false);
  assert.equal(RETIRING.test('`memory/MEMORY.md` is retired'), true);
});

test('ARC-10-S02 AC 3 — the migration page names all four directories and their destinations', () => {
  // The four are the untracked ones: nothing carries them across, and each has somewhere to go.
  // Asserted with its destination on the same line, because naming a directory without saying
  // where it goes is the shape of advice a reader cannot act on.
  const page = read('docs/MIGRATION.md');
  const rows = page.split('\n').filter((l) => l.startsWith('|'));
  for (const [name, destination] of [
    ['memory/MEMORY.md', 'clients/<name>/memory.md'],
    ['scratchpad/', 'clients/<name>/'],
    ['deliverables/', 'clients/<name>/'],
    ['diagram-preview/', 'clients/<name>/'],
  ]) {
    assert.ok(rows.some((l) => l.includes(name) && l.includes(destination)),
      `no row carries ${name} with its destination ${destination}`);
  }
});

test('ARC-02-S06 criterion 3 — no "Task tool" in CLAUDE.md or governance/', () => {
  // Harness-neutral wording: the engine describes dispatching a sub-agent, not the name of the
  // mechanism a particular client uses to do it.
  // ARC-02-S04 AC 5 (acceptance item B02-05) widens this to `.claude/agents/`, which is where the
  // criterion actually pointed — `grep -rn 'Task tool' .claude/agents` = 0 — while the test scoped
  // itself to CLAUDE.md and governance/. An agent file is exactly where the harness's name would
  // creep back in, because an agent file is about being dispatched.
  const inScope = (x) => x === 'CLAUDE.md' || x.startsWith('governance/') || x.startsWith('.claude/agents/');
  const hits = [];
  for (const f of tracked().filter(inScope)) {
    read(f).split('\n').forEach((line, i) => {
      if (line.includes('Task tool')) hits.push(`${f}:${i + 1}`);
    });
  }
  assert.deepEqual(hits, []);
  // Not vacuous: the widened set really contains agent files, or this passes on a filter that
  // matched nothing new.
  assert.ok(tracked().filter(inScope).some((f) => f.startsWith('.claude/agents/')),
    'no agent file is in scope — the filter widened to nothing');
});

test('ARC-02-S02 AC 8 — every SK-xx and AG-xx rule id is documented in CONTRIBUTING', async () => {
  // Acceptance item B02-05. The criterion says the rule list is documented; 23 mentions were found
  // and completeness was unverified — "documented" had never been checked against the ids the lint
  // actually exports. A rule a contributor cannot look up is a rule they will trip over.
  // The ids are not exported as data — they are embedded in the failure strings the lint emits
  // (`fail.push(\`SK-01 ${rel}: …\`)`), so the source of truth is the module's own text. Reading it
  // is the honest way to ask "which rules exist": a hand-kept list here would be a second
  // definition, and this file has already learned what those do.
  const source = read('tests/lib/lint-rules.mjs');
  const ids = [...new Set([...source.matchAll(/\b((?:SK|AG)-\d\d)\b/g)].map((m) => m[1]))].sort();
  assert.ok(ids.length >= 15, `only ${ids.length} rule id(s) found — the scan is wrong`);

  const contributing = read('docs/CONTRIBUTING.md');
  const missing = ids.filter((id) => !contributing.includes(id)).sort();
  assert.deepEqual(missing, [],
    `${missing.length} rule id(s) are not in docs/CONTRIBUTING.md: ${missing.join(', ')}`);
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
    // ARC-07-C14: the row number IS the mechanism now, so the page has to say so — a page that
    // kept only the accept half would leave a reader with no way to change anything.
    'Enter = apply as shown', 'a number opens that flag',
    String.raw`^https://dev\d+\.service-now\.com`,
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
  // ONE exemption, and it is a PATH rather than vocabulary: ARC-07-S10 added the migration
  // section, and the legacy store lives at `~/.config/servicenow-mcp/instances.json`. A reader
  // migrating has to type that path; a page that referred to it as "the old tool's directory"
  // would be describing a file it refuses to name. The ban is on the retired product NAME in
  // prose, which is what "one vocabulary" (P-06) is about — so the exemption is written as the
  // path, not as the word, and any other use of the name still fails.
  const LEGACY_PATH = ['.config', 'servicenow-mcp'].join('/');
  const offending = doc.split('\n')
    .map((line, i) => [i + 1, line])
    .filter(([, line]) => banned.some((re) => re.test(line)) && !line.includes(LEGACY_PATH))
    .map(([n]) => `docs/MODES-AND-PRESETS.md:${n}`);
  assert.deepEqual(offending, []);

  // Non-vacuous: the exemption must not have swallowed the rule. A planted line carrying the bare
  // name without the path is still caught.
  const planted = `${doc}\nMigrate from servicenow-mcp by hand.\n`;
  const stillCaught = planted.split('\n')
    .filter((line) => banned.some((re) => re.test(line)) && !line.includes(LEGACY_PATH));
  assert.equal(stillCaught.length, 1, 'the path exemption swallowed the vocabulary ban');

  // The budget of record is ARC-02-S09 criterion 1, amended 2026-09-08 from 150 to **160** and
  // 2026-09-10 from 160 to **170**: the page merges ARC-04's tested store and permission claims
  // rather than replacing them, ARC-07-S01 added the section on where a password may be typed
  // (the credential boundary belongs on the page a user reads before typing one), and ARC-07-S10
  // still has probe strings to add. 150 was set for a page written from scratch.
  // The three ways a wrapping pass damages a document without changing a sentence. They were
  // page-local here until `tests/lib/editorconfig.mjs` took the rule repo-wide; delegating rather
  // than keeping a second copy means "malformed" means one thing, and this page cannot drift into
  // being held to a different standard than every other file.
  const ec = [...lintLineEndings(root, ['docs/MODES-AND-PRESETS.md']),
    ...lintHyphenSplits(root, ['docs/MODES-AND-PRESETS.md'])];
  assert.deepEqual(ec, []);

  // THE LINE BUDGET IS RETIRED (ARC-07-S10 ruling). It moved 150 → 160 → 170 as the page absorbed
  // ARC-04's store facts and S01's credential boundary, and this story adds five sections the
  // README always promised — the review screens, where credentials live, the maintenance commands,
  // the migration and the limitations. A number that moves every time the page grows for a good
  // reason is not a budget; it is a chore. What it was protecting is a page nobody will read to
  // the end, and the structure protects that better: ELEVEN sections in the story's order, none
  // of them longer than sixty lines. A section over sixty is the real symptom — that is where a
  // reader gives up — and it fails here with the section named.
  const headings = doc.split('\n').filter((l) => l.startsWith('## '));
  assert.equal(headings.length, 11, `${headings.length} sections, expected 11:\n${headings.join('\n')}`);
  headings.forEach((h, i) => {
    assert.match(h, new RegExp(`^## ${i + 1}\\. `), `section ${i + 1} is out of order: ${h}`);
  });

  const bodies = doc.split(/^## /m).slice(1);
  const tooLong = bodies
    .map((b) => [b.split('\n')[0], b.trimEnd().split('\n').length])
    .filter(([, n]) => n > 60)
    .map(([title, n]) => `${title} — ${n} lines`);
  assert.deepEqual(tooLong, [], `section(s) over 60 lines:\n${tooLong.join('\n')}`);
  console.log(`    ARC-07-S10: docs/MODES-AND-PRESETS.md is ${doc.trimEnd().split('\n').length} lines, `
    + `${headings.length} sections, longest ${Math.max(...bodies.map((b) => b.trimEnd().split('\n').length))} lines`);
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

// ─── ARC-09-C78 — the prompt-audit corrections stay corrected ──────────────────
//
// The engine's 2026-10-03 prompt audit found these patterns in snowarch's own copies of the roster,
// and C78 removed them. The same promotion ARC-02-S06 made: a sweep run once at review time
// decays, and one run on every push does not. Each pattern carries its OWN scope, so a phrase that is
// legitimate in one surface — a counterparty's API docs, a quoted history — is not banned everywhere
// in order to catch it in one place.
//
// Whole files, not `currentLines`: none of these scopes holds a history section, and that function
// stops at the first `## <digit>` heading — which in CLAUDE.md is "## 1. Operating principles".

// Every pattern also reaches the surfaces a session reads without being asked to: CLAUDE.md and
// .claude/rules/ load into every session, a builder copies the templates, and tests/VALIDATION-TESTS.md
// holds the prompts run against the roster. A phrase the audit removed from a skill is as live in any of them.
const ALWAYS_READ = ['CLAUDE.md', '.claude/rules/', 'templates/', 'tests/VALIDATION-TESTS.md'];

export const AUDIT_PATTERNS = [
  { id: 'master-project', scope: ['.claude/agents/', '.claude/skills/', 'governance/', 'docs/USER-GUIDE.md', ...ALWAYS_READ],
    test: (l) => /Master Project|satellite project/i.test(l),
    why: 'the claude.ai project model; in Claude Code the firewall is folder discipline (CLAUDE.md §10)' },
  // The fetch with the corpus named on its line, in any of the ways it has been named. A `tools:` line
  // names no corpus, so a tool list never matches, and since ARC-09-C115 no agent lists WebFetch at all
  // (a counterparty's API documentation arrives as a file or as pasted text). `window: 2` also reads a sentence the
  // wrap split over two lines ("Use WebFetch to read" / "the ServiceNowDocs page") — see `oneSentence`.
  { id: 'corpus-webfetch', scope: ['.claude/', ...ALWAYS_READ], window: 2,
    test: (l) => /github\.com\/ServiceNow\/ServiceNowDocs/i.test(l)
      || (/\bweb ?fetch\b/i.test(l)
        && /ServiceNowDocs|\bcorpus\b|servicenow\.com\/docs|\b(?:Australia|ServiceNow) (?:release |product )?documentation\b/i.test(l)),
    why: 'the corpus is local — it is read with Grep and Read, never fetched' },
  { id: 'phase-label', scope: ['.claude/', ...ALWAYS_READ],
    test: (l) => /\bPhase 2\.\d/.test(l),
    why: 'an engine-development phase label the reader cannot act on — the builders are just the builders' },
  { id: 'overrides-any-prior', scope: ['.claude/', 'governance/', ...ALWAYS_READ],
    test: (l) => /overrides any prior/i.test(l),
    why: 'a diff against text no reader can see — state the rule, not what it replaced' },
  // Every shape the default has been written in, not the one this story happened to remove: "Mermaid is
  // the default", "(Mermaid default, …)", "Mermaid by default", "defaults to Mermaid", "the default is
  // Mermaid", "default: Mermaid", "Mermaid … (default)" and the catalogue's "Default notation" column.
  // The first was a live line the port missed, and the pattern written for the port could not see it.
  { id: 'mermaid-default', scope: ['.claude/', 'governance/', ...ALWAYS_READ],
    test: (l) => /Mermaid (?:is (?:the|a) default|defaults?\b|by default)|\bdefaults? to Mermaid\b|\bdefault(?: notation)? is Mermaid\b|\bdefault:\s*Mermaid\b|Mermaid[^.|\n]*\(default\)|\|\s*Default notation\s*\|/i.test(l),
    why: 'every delivered figure is an editable draw.io file; Mermaid is a draft' },
  // The shapes that make Mermaid the DELIVERABLE without the word "default": named as the format, a
  // Mermaid source rendered to the delivered SVG, the `.mmd` as source of truth, a figure required to be
  // Mermaid. A Mermaid draft is legitimate — the diagramming examples sketch every figure in one — so
  // neither the word Mermaid nor a ```mermaid fence is matched on its own.
  { id: 'mermaid-delivered', scope: ['.claude/', 'governance/', ...ALWAYS_READ],
    test: (l) => /\*\*Format:\*\*\s*Mermaid\b|\bmmdc\b[^\n]*\.svg\b|\.mmd`? is the source of truth|\bwith at least one Mermaid diagram\b|\bswimlane Mermaid diagram\b/i.test(l),
    why: 'every delivered figure is an editable draw.io file exported to SVG; Mermaid is only its draft' },
  { id: 'scoped-by-default', scope: ['.claude/skills/technical-designer/', '.claude/agents/technical-designer.md', ...ALWAYS_READ],
    // The two older wordings are the ones a later sweep found the port had not carried: a new scoped
    // app offered as a decision the designer resolves alone, and a two-way scoped-or-global choice.
    test: (l) => /default to scoped|Default for new functionality: scoped app|\bdefaults? to (?:an? )?(?:new )?scoped\b|chose (?:a )?new scoped app|scoped \(with prefix\) vs global/i.test(l),
    why: 'a new scoped app is a §1.1 object, and the baseline scope is the default' },
  // ARC-09-C115 took the web tools off every sub-agent, and AG-03 refuses one on a `tools:` line; ARC-09-C123
  // denies them to the main thread, which is where a skill runs. So neither an agent's body nor a skill may name
  // one: "fetch it with WebFetch" is an instruction nothing can follow, and the edit that makes it work again
  // puts the tool back. No exemption: no agent or skill has a reason to name one.
  { id: 'agent-web-tool', scope: ['.claude/agents/', '.claude/skills/'],
    test: (l) => /\bweb ?(?:fetch|search)\b/i.test(l),
    why: 'no session has a web tool (ARC-09-C115, C123): a document arrives as a file or as pasted text' },
];

/**
 * The exemptions, anchored to a file, a pattern AND a substring of the line — the vocabulary
 * allow-list's shape, so naming the file once does not excuse every future line in it.
 *
 * Empty since ARC-09-C115. Its one entry was the integration specialist's sentence keeping WebFetch away
 * from the corpus, and with WebFetch gone from every agent the sentence went too, so the staleness check
 * below would have failed on it. The mechanism stays, and the planted test exercises it with an entry of
 * its own.
 */
export const AUDIT_ALLOW = [];

const inAuditScope = (file, scope) => scope.some((s) => (s.endsWith('/') ? file.startsWith(s) : file === s));

// Two lines are read as one sentence only when the first does not end one and the second does not
// start a new block — a list item, heading, table row, fence, quote or frontmatter key. Two sentences
// that merely sit on adjacent lines ("WebFetch is for the counterparty API." / "Grep the corpus.")
// stay two, and so does an agent's `tools:` line and the key under it.
const oneSentence = (a, b) => b.trim() !== '' && !/[.!?]\s*$/.test(a.trim())
  && !/^\s*(?:[-*+]\s|\d+\.\s|#|\||```|>|[A-Za-z][\w-]*:\s)/.test(b);

/** The sweep, as a function over a file list and a reader, so the planted fixture runs THIS code. */
/** An exemption for the planted test, the shape AUDIT_ALLOW's entries take. */
const EXEMPT = { file: '.claude/agents/integration-specialist.md', id: 'corpus-webfetch',
  context: "`WebFetch` is for the counterparty's own API documentation (step 2), not for the corpus.",
  reason: 'the instruction that WebFetch is NOT for the corpus has to name both' };

export function findAuditRegressions({ files, read: readFile, patterns = AUDIT_PATTERNS, allow = AUDIT_ALLOW }) {
  const hits = [];
  for (const f of files) {
    const mine = patterns.filter((p) => inAuditScope(f, p.scope));
    if (mine.length === 0) continue;
    const lines = readFile(f).split('\n');
    lines.forEach((line, i) => {
      for (const p of mine) {
        // A two-line pattern reads the line with the next one when the two are one sentence, and only
        // when neither matches alone — so a hit is reported once, on the line where it starts.
        const next = lines[i + 1] ?? '';
        const pair = `${line} ${next}`;
        const text = p.test(line) ? line
          : p.window === 2 && oneSentence(line, next) && !p.test(next) && p.test(pair) ? pair : null;
        if (text === null) continue;
        // An exemption excuses its own SENTENCE, not the line it sits on. The pattern is tested again
        // with the exempted text taken out, and the line passes only when what remains is clean — so
        // an old fetch written into the same step, beside the sentence, is still a hit.
        const excused = allow.some((a) => a.file === f && a.id === p.id && text.includes(a.context)
          && !p.test(text.split(a.context).join(' ')));
        if (excused) continue;
        hits.push(`${f}:${i + 1}: [${p.id}] ${text.trim().slice(0, 80)} — ${p.why}`);
      }
    });
  }
  return hits;
}

const AUDIT_FILES = () => tracked()
  .filter((f) => /\.(md|json)$/.test(f) && AUDIT_PATTERNS.some((p) => inAuditScope(f, p.scope)));

test('ARC-09-C78 — the prompt-audit corrections stay corrected', () => {
  const files = AUDIT_FILES();
  // A floor, because a sweep that reached nothing would pass by having nothing to say.
  assert.ok(files.length > 60, `only ${files.length} file(s) in scope — the scopes no longer match the tree`);
  const hits = findAuditRegressions({ files, read });
  assert.deepEqual(hits, [], `${hits.length} hit(s):\n  ${hits.join('\n  ')}`);
  console.log(`    ${AUDIT_PATTERNS.length} patterns over ${files.length} file(s); ${AUDIT_ALLOW.length} anchored exemption(s)`);
});

test('ARC-09-C78 — a planted token per pattern fails, and the exemption suppresses only its own line', () => {
  const dir = tempDir('snowarch-audit-');
  try {
    const plant = (rel, text) => { mkdirSync(dirname(join(dir, rel)), { recursive: true }); writeFileSync(join(dir, rel), `${text}\n`); };
    // One planted line per pattern, each in a file its scope covers — the old wording, as it stood.
    plant('.claude/agents/atf-author.md', 'Sub-agents run in satellite projects, not the Master.');
    plant('governance/governance-rules.md', [
      'CLAUDE.md, Master Project Instructions, individual SKILL.md anti-patterns (Phase 2.2)',
      // Outside the agent-web-tool scope: governance may say the tools are denied.
      'The main thread has no WebFetch or WebSearch (ARC-09-C123).',
    ].join('\n'));
    plant('.claude/agents/developer.md',
      '4. Verify against `ServiceNowDocs/` using `WebFetch` against `https://github.com/ServiceNow/ServiceNowDocs/tree/australia/markdown`.');
    plant('.claude/skills/story-writer/SKILL.md', 'This rule overrides any prior "default to scoped app" language elsewhere in this SKILL.');
    plant('CLAUDE.md', [
      '- Diagrams: Mermaid in markdown for every figure (default); draw.io on request.',
      'Sub-agents run in satellite projects, not the Master Project.',
    ].join('\n'));
    // One plant per surface the C82 widening added, each in a pattern that did not reach it before.
    plant('.claude/rules/00-mode-and-mcp-gate.md', 'Read the Master Project Instructions before the first write.');
    plant('templates/hld-template.md', 'Figures: Mermaid by default; draw.io on request.');
    plant('tests/VALIDATION-TESTS.md', 'Run the Phase 2.2 disciplines against each builder.');
    // The fetch shapes the first pattern could not see; the agents' tool list, which names no corpus, passes.
    plant('.claude/skills/developer/SKILL.md', [
      'Use WebFetch to read the Australia documentation for the API.',
      'WebFetch on https://www.servicenow.com/docs/r/australia/api-reference.html for the method.',
      'web fetch the ServiceNowDocs page for the table.',
      'WebFetch the Corpus page if Grep finds nothing.',
      'webfetch the servicenowdocs markdown.',
      'tools: Read, Write, Edit, Glob, Grep, WebFetch',
    ].join('\n'));
    plant('.claude/skills/diagramming-specialist/SKILL.md', '| Diagram | Use it for | Default notation |');
    plant('.claude/agents/technical-designer.md', [
      '3. **Scoping decision** — If unknown, default to scoped with prefix `x_<vendor>_<app>`.',
      '3. **Decisions made** — (e.g., chose new scoped app over extending existing because of a separate deployment cadence).',
    ].join('\n'));
    plant('.claude/skills/technical-designer/EXAMPLES.md', '2. **Scope decision** — scoped (with prefix) vs global, with justification.');
    plant('.claude/skills/now-assist-specialist/EXAMPLES.md', 'Three examples demonstrating Phase 2.2 disciplines.');
    plant('.claude/skills/hld-lld-writer/EXAMPLES.md', 'the builders that consume it — multiple Phase 2.2/2.1 builder handoffs.');
    // The shapes a control found inert on the first head — each a wording that has actually been used.
    plant('.claude/skills/diagramming-specialist/EXAMPLES.md', [
      'Mermaid is the default; all blocks are written to parse.',
      // One plant per delivery shape...
      '**Format:** Mermaid.',
      'For the client pack, export to SVG (`mmdc -i fig.mmd -o fig.svg`).',
      'The `.mmd` is the source of truth; the `.svg` is the artefact.',
      'Each HLD section carries the design with at least one Mermaid diagram.',
      'The PDD process flow is a swimlane Mermaid diagram.',
      // ...and the draft, which stays legitimate wherever it is written.
      '**Format:** draw.io (`.drawio`) + SVG export; the figure below is its Mermaid draft.',
      '```mermaid',
      '| Diagram | Use it for | Draft notation (Mermaid sketch — every delivered figure is `.drawio`) |',
    ].join('\n'));
    plant('governance/taxonomy.md', '| Diagramming Specialist | figures | (Mermaid default, draw.io on request) |');
    plant('.claude/skills/hld-lld-writer/SKILL.md', 'Figures: the Diagramming Specialist defaults to Mermaid.');
    plant('.claude/skills/technical-designer/SKILL.md', 'If the scope is unknown, the design defaults to a scoped app.');
    // The user guide is in master-project's scope since C82, and in no other.
    plant('docs/USER-GUIDE.md', [
      'If you prefer the browser, the same prompts work in the Master Project chat on Claude.ai.',
      'Mermaid by default; Phase 2.2 disciplines.',
    ].join('\n'));
    // ...and the same phrases where their scopes do NOT reach, which must stay quiet.
    plant('docs/CONTRIBUTING.md', 'the same prompts work in the Master Project chat; Mermaid by default; Phase 2.2 disciplines');
    plant('.claude/agents/flow-designer-specialist.md', 'If unknown, default to scoped with prefix `x_<vendor>_<app>`.');
    // The exemption: its own sentence passes; an old-style corpus fetch in the SAME file still fails,
    // and the same sentence in ANOTHER file is not excused by an entry anchored to this one. The entry is
    // the fixture's own: the real list is empty since ARC-09-C115.
    plant('.claude/agents/integration-specialist.md', [
      `say so instead of recalling it. ${EXEMPT.context}`,
      '4. Verify against `ServiceNowDocs/` using `WebFetch` for MID Server behaviour.',
      // The regression written exactly where it would be: the old fetch inside the same step, on the
      // SAME line as the exempted sentence. The sentence does not excuse its neighbour.
      '4. Verify using `WebFetch` against `https://github.com/ServiceNow/ServiceNowDocs/tree/australia/markdown`; '
        + `say so instead of recalling it. ${EXEMPT.context}`,
    ].join('\n'));
    plant('.claude/agents/story-writer.md', EXEMPT.context);
    // A web tool named in an agent's prose, with no corpus in sight: the line a control found every test
    // passing on, the other tool, the spaced spelling, and a line that asks for the document instead.
    plant('.claude/agents/hld-lld-writer.md', [
      'Given only a URL, fetch it with WebFetch.',
      'If the vendor page is missing, run a WebSearch for it.',
      'A web fetch of the page will do.',
      'Ask for the document, as a file or as pasted text.',
    ].join('\n'));
    // ARC-09-C123: a skill runs in the main thread, which is denied the web tools too; a docs page is not in scope.
    plant('.claude/skills/now-assist-specialist/SKILL.md', 'If the corpus is silent, run a WebSearch for the release notes.');
    plant('docs/TROUBLESHOOTING.md', 'WebFetch and WebSearch are denied to every session in this checkout.');
    // The fetch the wrap split over two lines is one hit, on its first line; two sentences on adjacent
    // lines, two list items, and a frontmatter key under `tools:` are not a sentence and stay quiet.
    plant('.claude/skills/integration-specialist/SKILL.md', [
      'Use WebFetch to read',
      'the ServiceNowDocs page for the API.',
      'WebFetch is for the counterparty API.',
      'Grep the corpus for the table.',
      '- Use WebFetch for the counterparty API',
      '- Read the corpus with Grep',
      'tools: Read, Write, Edit, Glob, Grep, WebFetch',
      'description: reads the corpus locally',
    ].join('\n'));

    const files = ['.claude/agents/atf-author.md', 'governance/governance-rules.md', '.claude/agents/developer.md',
      '.claude/skills/story-writer/SKILL.md', 'CLAUDE.md', '.claude/skills/diagramming-specialist/SKILL.md',
      '.claude/agents/technical-designer.md', 'docs/USER-GUIDE.md', '.claude/agents/flow-designer-specialist.md',
      '.claude/agents/integration-specialist.md', '.claude/agents/story-writer.md', '.claude/agents/hld-lld-writer.md',
      '.claude/skills/now-assist-specialist/SKILL.md', 'docs/TROUBLESHOOTING.md',
      '.claude/skills/diagramming-specialist/EXAMPLES.md', 'governance/taxonomy.md', '.claude/skills/hld-lld-writer/SKILL.md',
      '.claude/skills/technical-designer/SKILL.md', '.claude/skills/technical-designer/EXAMPLES.md',
      '.claude/skills/now-assist-specialist/EXAMPLES.md', '.claude/skills/hld-lld-writer/EXAMPLES.md',
      '.claude/rules/00-mode-and-mcp-gate.md', 'templates/hld-template.md', 'tests/VALIDATION-TESTS.md',
      '.claude/skills/developer/SKILL.md', 'docs/CONTRIBUTING.md', '.claude/skills/integration-specialist/SKILL.md'];
    const readAt = (f) => readFileSync(join(dir, f), 'utf8');
    const hits = findAuditRegressions({ files, read: readAt, allow: [EXEMPT] });
    const at = (rel, id) => hits.filter((h) => h.startsWith(`${rel}:`) && h.includes(`[${id}]`)).length;
    const linesOf = (rel, id) => hits.filter((h) => h.startsWith(`${rel}:`) && h.includes(`[${id}]`)).map((h) => h.split(':')[1]);

    for (const p of AUDIT_PATTERNS) {
      assert.ok(hits.some((h) => h.includes(`[${p.id}]`)), `the planted ${p.id} line was not found`);
    }
    assert.equal(at('.claude/agents/atf-author.md', 'master-project'), 1);
    assert.equal(at('governance/governance-rules.md', 'master-project'), 1);
    assert.equal(at('CLAUDE.md', 'mermaid-default'), 1);
    assert.equal(at('CLAUDE.md', 'master-project'), 1, 'CLAUDE.md is outside master-project');
    assert.equal(at('.claude/rules/00-mode-and-mcp-gate.md', 'master-project'), 1, '.claude/rules/ is outside master-project');
    assert.equal(at('templates/hld-template.md', 'mermaid-default'), 1, 'templates/ is outside the sweep');
    assert.equal(at('tests/VALIDATION-TESTS.md', 'phase-label'), 1, 'VALIDATION-TESTS.md is outside the sweep');
    assert.equal(at('.claude/skills/diagramming-specialist/SKILL.md', 'mermaid-default'), 1);
    assert.equal(at('docs/USER-GUIDE.md', 'master-project'), 1, 'the user guide is outside master-project');
    assert.equal(hits.filter((h) => h.startsWith('docs/USER-GUIDE.md:')).length, 1,
      'a pattern other than master-project reached the user guide');
    assert.equal(hits.some((h) => h.startsWith('docs/CONTRIBUTING.md:')), false, 'a scope reached outside itself');
    assert.equal(at('.claude/skills/developer/SKILL.md', 'corpus-webfetch'), 5, 'a widened fetch shape was not seen');
    assert.equal(hits.some((h) => h.startsWith('.claude/skills/developer/SKILL.md:6:') && h.includes('[corpus-webfetch]')), false,
      'a tools: line was flagged as a corpus fetch');
    assert.equal(at('.claude/skills/diagramming-specialist/EXAMPLES.md', 'mermaid-delivered'), 5,
      'a Mermaid delivery shape was not seen, or a draft was taken for one');
    assert.equal(hits.some((h) => h.startsWith('.claude/agents/flow-designer-specialist.md:')), false,
      'the scoped-by-default rule reached past the Technical Designer');
    assert.equal(at('.claude/skills/diagramming-specialist/EXAMPLES.md', 'mermaid-default'), 1, '"Mermaid is the default" was not seen');
    assert.equal(at('governance/taxonomy.md', 'mermaid-default'), 1, '"(Mermaid default, …)" was not seen');
    assert.equal(at('.claude/skills/hld-lld-writer/SKILL.md', 'mermaid-default'), 1, '"defaults to Mermaid" was not seen');
    assert.equal(at('.claude/skills/technical-designer/SKILL.md', 'scoped-by-default'), 1, '"defaults to a scoped app" was not seen');
    assert.equal(at('.claude/agents/technical-designer.md', 'scoped-by-default'), 2,
      '"default to scoped" and "chose new scoped app" must each be seen');
    assert.equal(at('.claude/skills/technical-designer/EXAMPLES.md', 'scoped-by-default'), 1, '"scoped (with prefix) vs global" was not seen');
    assert.equal(at('.claude/skills/now-assist-specialist/EXAMPLES.md', 'phase-label'), 1, '"Phase 2.2" was not seen');
    assert.equal(at('.claude/skills/hld-lld-writer/EXAMPLES.md', 'phase-label'), 1, '"Phase 2.2/2.1" was not seen');
    assert.equal(hits.some((h) => h.startsWith('governance/') && h.includes('[phase-label]')), false,
      'the phase-label rule reached outside .claude/');
    assert.deepEqual(linesOf('.claude/agents/integration-specialist.md', 'corpus-webfetch'),
      ['2', '3'], 'the exemption must pass line 1 only — line 3 carries the old fetch beside the exempted sentence');
    assert.deepEqual(linesOf('.claude/agents/integration-specialist.md', 'agent-web-tool'), ['1', '2', '3'],
      'an exemption for corpus-webfetch excused a web tool named in an agent');
    assert.deepEqual(linesOf('.claude/agents/hld-lld-writer.md', 'agent-web-tool'), ['1', '2', '3'],
      'a web tool named in an agent\'s prose was not seen, or the line asking for the document was flagged');
    assert.deepEqual(linesOf('.claude/skills/now-assist-specialist/SKILL.md', 'agent-web-tool'), ['1'],
      'a web tool named in a skill was not seen');
    assert.equal(hits.some((h) => h.includes('[agent-web-tool]')
      && !(h.startsWith('.claude/agents/') || h.startsWith('.claude/skills/'))), false,
      'the agent-web-tool rule reached outside agents and skills: governance/ and docs/ are not its scope');
    assert.equal(at('.claude/agents/story-writer.md', 'corpus-webfetch'), 1, 'an exemption anchored to one file excused another');
    assert.deepEqual(linesOf('.claude/skills/integration-specialist/SKILL.md', 'corpus-webfetch'),
      ['1'], 'a fetch split over two lines was not seen once, or two sentences on adjacent lines were read as one');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('ARC-09-C78 — every exemption still suppresses a real line; a stale one is removed, not kept', () => {
  for (const a of AUDIT_ALLOW) {
    const p = AUDIT_PATTERNS.find((x) => x.id === a.id);
    assert.ok(p, `${a.file}: exemption names an unknown pattern ${a.id}`);
    const lines = read(a.file).split('\n').filter((l) => l.includes(a.context));
    assert.equal(lines.length, 1, `${a.file}: the exempted sentence appears ${lines.length} time(s) — it must anchor exactly one line`);
    assert.ok(p.test(lines[0]), `${a.file}: the exempted line no longer matches ${a.id} — remove the exemption`);
  }
});

// ─── ARC-09-C79 — a history boundary belongs to the files that have a history ────────────────────
//
// `currentLines` used to stop every file at its first `## <digit>` or `## Before ` heading — a boundary
// written for `docs/CHANGELOG.md`, whose release sections begin `## 2.0.x`. In a file whose own sections
// are numbered it stopped at section 1: CLAUDE.md was read for 8 of its lines, `governance/taxonomy.md`
// for 10 of 311. Every sweep that calls it inherited the hole.

test('ARC-09-C79 — the history boundary is the changelog\'s alone; every other in-scope file is read whole', () => {
  assert.deepEqual([...HISTORY_FILES], ['docs/CHANGELOG.md']);
  const short = [];
  for (const f of IN_SCOPE()) {
    const total = read(f).split('\n').length;
    const seen = currentLines(f).length;
    if (HISTORY_FILES.has(f)) continue;
    if (seen !== total) short.push(`${f}: ${seen} of ${total}`);
  }
  assert.deepEqual(short, [], 'a sweep that reads a fraction of a file is not checking it');
  // ...and the changelog still stops where its history starts.
  const log = read('docs/CHANGELOG.md').split('\n');
  const seen = currentLines('docs/CHANGELOG.md');
  assert.ok(seen.length < log.length / 10, 'the changelog is read for its current notes only');
  assert.match(log[seen.length], /^## (\d|Before )/, 'and the boundary is a release heading');
});

test('ARC-09-C79 — a token planted below a numbered heading is seen; the same token in the changelog\'s history is not', () => {
  const claude = read('CLAUDE.md');
  const anchor = '## 1. Operating principles';
  assert.ok(claude.includes(anchor), 'the heading this plant sits under');
  const tier = ['Tier', ' 1'].join('');
  const planted = claude.replace(anchor, `${anchor}\n\nA sentence naming ${tier} and ${OLD_RULE[0]}.`);
  assert.ok(currentLines0(planted, 'CLAUDE.md').some((l) => TIER.test(l)), 'the Tier sweep reads below the heading');
  assert.equal(findOldRule({ files: ['CLAUDE.md'], read: () => planted }).length, 1, 'the retired-rule sweep too');
  // The same plants under `governance/taxonomy.md`'s numbered heading, where the old boundary stopped at line 10.
  const tax = read('governance/taxonomy.md').replace('## 0. Global governance rules', `## 0. Global governance rules\n\n${tier} planted.`);
  assert.ok(currentLines0(tax, 'governance/taxonomy.md').some((l) => TIER.test(l)));
  // History stays history: the changelog's own boundary still hides what sits below it.
  const log = read('docs/CHANGELOG.md');
  const heading = log.split('\n').find((l) => /^## (\d|Before )/.test(l));
  const hidden = log.replace(heading, `${heading}\n\nThe notes record ${tier} as it was called.`);
  assert.equal(currentLines0(hidden, 'docs/CHANGELOG.md').some((l) => TIER.test(l)), false);
});
