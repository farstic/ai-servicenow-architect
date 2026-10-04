import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * ARC-09-C89, C90, C91 — the three places where an engagement's files are named, filed and numbered.
 *
 * The owner's S09/S10 sittings found that Phase 1 Step 2 read a file onboarding never wrote (R5), that
 * design-only work with no engagement named went to a session scratchpad (R6), and that two artefacts
 * in one answer both held an "OQ-1" (R8). Each is a statement in prose that two documents made about
 * the same thing and did not keep equal, so each is asserted here as a property of the files — the
 * behaviour that follows from them is T-25 in `tests/VALIDATION-TESTS.md`, which needs a live session.
 */
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => readFileSync(join(root, rel), 'utf8');

/** What a contributor's checkout contains and git would not ignore — new files count before `git add`. */
const listed = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z'],
  { cwd: root, encoding: 'utf8', maxBuffer: 1 << 26 }).split('\0').filter(Boolean);

/** Records of what was true on a date: a plan row, a changelog and a validation run quote the old spelling. */
const HISTORY = ['docs/plans/', 'docs/spikes/', 'docs/validation/', 'docs/decisions/',
  'docs/CHANGELOG.md', 'docs/RELICENSING.md'];
/** The roster's own surfaces: what a session loads, what a person is told to follow. */
const ROSTER = (f) => f.endsWith('.md')
  && (f === 'CLAUDE.md' || f === 'README.md' || f.startsWith('.claude/') || f.startsWith('governance/')
    || f.startsWith('templates/') || f.startsWith('docs/'))
  && !HISTORY.some((h) => f === h || f.startsWith(h));
const surfaces = listed.filter(ROSTER);

const hits = (re) => surfaces.flatMap((f) => read(f).split('\n')
  .map((l, i) => [i + 1, l]).filter(([, l]) => re.test(l)).map(([n]) => `${f}:${n}`));

// ── C89 — one file, not two ──────────────────────────────────────────────────────────────────────

const STATE_FILE = 'clients/<name>/<name>-engagement-state.md';

test('C89 — no roster surface names an engagement instructions file', () => {
  // `-instructions-v*.md` was the old per-engagement file name the four builders were told to read;
  // "engagement's instructions" and "instructions and state" are the same idea in prose.
  assert.deepEqual(hits(/-instructions-v|engagement['’]s instructions|instructions and state/i), []);
});

test('C89 — Step 2 reads the file onboarding creates, and says so in the same words', () => {
  const step2 = read('CLAUDE.md').split('\n').find((l) => /^2\. \*\*Read engagement context\*\*/.test(l));
  assert.ok(step2, 'Phase 1 Step 2 is not in CLAUDE.md');
  assert.ok(step2.includes(`\`${STATE_FILE}\``), `Step 2 does not name ${STATE_FILE}`);

  const onboarding = read('docs/CLIENT-ONBOARDING.md');
  const created = onboarding.match(/Create `(clients\/<name>\/[^`]+)`/);
  assert.ok(created, 'onboarding names no file to create');
  assert.equal(created[1], STATE_FILE, 'onboarding creates a different file from the one Step 2 reads');
});

test('C89 — the four builders that read a role matrix are pointed at the same file', () => {
  for (const agent of ['story-writer', 'technical-designer', 'hld-lld-writer', 'now-assist-specialist']) {
    const text = read(`.claude/agents/${agent}.md`);
    assert.ok(text.includes('clients/<client>/<client>-engagement-state.md'),
      `${agent} does not point at the engagement-state file`);
  }
});

test('C89 — the user guide describes the file the engine reads', () => {
  const line = read('docs/USER-GUIDE.md').split('\n').find((l) => l.includes('Switch context to clients/'));
  assert.ok(line, 'the context-switch sentence is not in the user guide');
  assert.match(line, /engagement-state/);
});

// ── C90 — a durable home for work with no engagement ────────────────────────────────────────────

test('C90 — Step 2 and the map name clients/_unfiled/, and refuse the scratchpad', () => {
  const lines = read('CLAUDE.md').split('\n');
  const step2 = lines.find((l) => /^2\. \*\*Read engagement context\*\*/.test(l)) ?? '';
  assert.ok(step2.includes('`clients/_unfiled/`'), 'Step 2 does not name the unfiled home');
  assert.match(step2, /never a scratchpad or temp directory/);
  assert.match(step2, /naming an engagement moves it/);
  const map = lines.find((l) => l.startsWith('- `clients/<name>/`')) ?? '';
  assert.ok(map.includes('`clients/_unfiled/`'), 'the "where things are" line does not list it');
});

test('C90 — onboarding says what happens to work filed before the engagement was named', () => {
  const doc = read('docs/CLIENT-ONBOARDING.md');
  const section = doc.slice(doc.indexOf('## No engagement named yet'));
  assert.ok(doc.includes('## No engagement named yet'), 'onboarding has no section for it');
  assert.ok(section.includes('clients/_unfiled/'));
  assert.match(section, /only what this session produced moves/i);
});

// ── C91 — OPEN QUESTION ids carry their artefact ────────────────────────────────────────────────

const governance = read('governance/governance-rules.md');
const section44 = governance.includes('### §4.4') ? governance.slice(governance.indexOf('### §4.4')) : '';
const KINDS = [...section44.matchAll(/^\| `([A-Z]{2})` \|/gm)].map((m) => m[1]);

test('C91 — the scheme is defined once, in governance §4.4, with its kinds in a table', () => {
  assert.ok(section44, 'governance/governance-rules.md has no §4.4');
  assert.deepEqual(KINDS, ['ES', 'ST', 'DS', 'EV', 'DC', 'CN']);
  assert.match(section44, /OQ-<kind>-<n>/);
});

test('C91 — no roster surface mints a bare id: OQ-<n>, or "Open Question <n>"', () => {
  assert.deepEqual(hits(/\bOQ-\d|\bOpen Questions? \d/), []);
});

test('C91 — every coded id in the roster names a kind the table defines', () => {
  const all = surfaces.flatMap((f) => [...read(f).matchAll(/\bOQ-([A-Z]{2})-\d+/g)].map((m) => ({ f, kind: m[1], id: m[0] })));
  assert.deepEqual(all.filter((m) => !KINDS.includes(m.kind)).map((m) => `${m.f}: ${m.id}`), []);
  // Not vacuous: every kind the table defines is used by at least one example or format.
  assert.deepEqual(KINDS.filter((k) => !all.some((m) => m.kind === k)), [], 'a kind with no example');
});

/**
 * The numbered items under an "Open questions" heading — the place a producer copies its id shape from.
 * An item is `1.`, `# 1.` (a Gherkin comment) or `- 1.`; it is a violation when it carries no OQ id. Only the
 * PLURAL heading opens a list: `OPEN QUESTION — CUSTOM OBJECT PROPOSAL` is one question in four numbered parts.
 */
function bareListItems(text) {
  const head = /^(#{1,6}\s*(?:\d+\.\s*)?open (?:questions|decisions)\b.*|\*\*open questions\*\*.*|#\s*OPEN QUESTIONS.*)$/i;
  const out = [];
  let inList = false;
  text.split('\n').forEach((line, i) => {
    if (head.test(line.trim())) { inList = true; return; }
    if (!inList) return;
    if (/^#{2,6}\s/.test(line)) { inList = false; return; }
    if (/^\s*(?:#\s*)?(?:[-*]\s+)?(?:\*\*)?\d+[.)]\s/.test(line)) out.push(i + 1);
  });
  return out;
}

test('C91 — a numbered list under an open-questions heading carries ids, not bare numbers', () => {
  const bad = surfaces.flatMap((f) => bareListItems(read(f)).map((n) => `${f}:${n}`));
  assert.deepEqual(bad, []);
});

test('C91 — every format that mints ids shows its own kind', () => {
  const needs = {
    '.claude/skills/story-writer/SKILL.md': 'OQ-ST-1',
    'templates/gherkin-feature-template.md': 'OQ-ST-1',
    '.claude/skills/technical-designer/SKILL.md': 'OQ-DS-',
    '.claude/skills/hld-lld-writer/SKILL.md': 'OQ-DS-',
    '.claude/skills/discovery-specialist/SKILL.md': 'OQ-DC-',
    'docs/CLIENT-ONBOARDING.md': 'OQ-ES-',
    'templates/raid-log-template.md': 'OQ-',
  };
  for (const g of ['itsm', 'csm', 'hrsd', 'itom-discovery', 'cmdb-csdm', 'fso-insurance']) {
    needs[`.claude/skills/${g}-specialist/SKILL.md`] = 'OQ-EV-';
  }
  const missing = Object.entries(needs).filter(([f, s]) => !read(f).includes(s)).map(([f, s]) => `${f} lacks ${s}`);
  assert.deepEqual(missing, []);
});

test('C91 — CLAUDE.md points at the scheme and keeps plumbing out of the answer', () => {
  const doc = read('CLAUDE.md');
  assert.match(doc, /OQ-<kind>-<n>.*governance\/governance-rules\.md/);
  const line = doc.split('\n').find((l) => l.startsWith('- **Keep plumbing out of the answer.**')) ?? '';
  assert.ok(line, 'the plumbing line is not in CLAUDE.md §1');
  assert.match(line, /prompt you wrote for a helper/);
  assert.ok(line.includes('.claude/rules/00-mode-and-mcp-gate.md'), 'the one exception is not named');
});

// ── the fixture these checks cannot produce, produced ───────────────────────────────────────────

test('the list detector sees a bare list, and a coded one passes (so a green run is not a blind one)', () => {
  const bare = '## Open questions\n\n1. Which group?\n2. Which queue?\n\n## Next\n';
  const coded = '## Open questions\n\nOQ-DS-1. Which group?\nOQ-DS-2. Which queue?\n\n## Next\n';
  const gherkin = '  # OPEN QUESTIONS\n  # 1. Who signs off?\n';
  const outside = '## Steps\n\n1. Do this\n';
  assert.deepEqual(bareListItems(bare), [3, 4]);
  assert.deepEqual(bareListItems(coded), []);
  assert.deepEqual(bareListItems(gherkin), [2]);
  assert.deepEqual(bareListItems(outside), []);
});

// ── C105 — the unfiled home holds design artefacts in live mode too, and never an instance change ──
//
// C90 stated the home for design-only work. A live session with no engagement named has the same
// durability problem, and one more: it can WRITE to an instance, and that write has to be recorded
// somewhere that names a client. The owner's ruling (the architect's, 2026-10): `clients/_unfiled/`
// is the home in live mode as well, for design artefacts only; before the first instance write of a
// session with no engagement named the Architect asks once which engagement it is for and records the
// change in that engagement's state file; it never records an instance change in `_unfiled`.
//
// That is one statement made in four places (CLAUDE.md, the generated rule file, the generated long
// form, onboarding) that must not drift apart, so the sweep below asserts it of EVERY surface that
// names the unfiled home, not of the four I happen to know about.

const INSTANCE_CHANGE = /\b(?:instance change|change to an instance)\b/i;

test('C105 — Step 2 files design artefacts in both modes, and files no instance change there', () => {
  const lines = read('CLAUDE.md').split('\n');
  const step2 = lines.find((l) => /^2\. \*\*Read engagement context\*\*/.test(l)) ?? '';
  assert.match(step2, /design artefacts/, 'Step 2 still says "what you produce"');
  assert.match(step2, /`design-only` and `live` mode alike/, 'Step 2 does not say the home applies in live mode');
  assert.match(step2, /A change to an instance is never filed there/);
  // C90's wording must survive: the scratchpad refusal and the reply that says where it went.
  assert.match(step2, /never a scratchpad or temp directory/);
  const map = lines.find((l) => l.startsWith('- `clients/<name>/`')) ?? '';
  assert.match(map, /design artefacts produced before an engagement was named \(never instance changes\)/);
});

test('C105 — every surface that names the unfiled home also says no instance change is filed there', () => {
  const naming = [...new Set(hits(/clients\/_unfiled\//).map((h) => h.split(':')[0]))];
  // Not vacuous: the four places the statement is made. A surface that stopped naming the home would
  // otherwise drop out of this sweep silently.
  for (const want of ['CLAUDE.md', '.claude/rules/00-mode-and-mcp-gate.md', 'governance/mcp-protocols.md',
    'docs/CLIENT-ONBOARDING.md']) {
    assert.ok(naming.includes(want), `${want} no longer names clients/_unfiled/`);
  }
  const silent = naming.filter((f) => !INSTANCE_CHANGE.test(read(f)));
  assert.deepEqual(silent, [], 'names the unfiled home without saying an instance change is never filed there');
});

test('C105 — onboarding: the live-mode paragraph names the question, the update set and the state file', () => {
  const doc = read('docs/CLIENT-ONBOARDING.md');
  const section = doc.slice(doc.indexOf('## No engagement named yet'), doc.indexOf('## Maintenance'));
  assert.match(section, /`design-only` and in `live` mode alike/);
  assert.ok(section.includes('Which engagement is this for?'), 'the question is not quoted');
  assert.match(section, /update-set name/);
  assert.match(section, /state file/);
  assert.match(section, /never records an instance change under `_unfiled`/);
});

test('C105 — T-25 carries the live case, and it checks the question comes before the update set', () => {
  const doc = read('tests/VALIDATION-TESTS.md');
  const from = doc.indexOf('## T-25 ');
  assert.notEqual(from, -1, 'T-25 is gone');
  const t25 = doc.slice(from);
  assert.match(t25, /^\*\*Modes:\*\* design-only ✅ · live ✅/m, 'T-25 still says live was not run');
  assert.ok(t25.includes('### Live variant'), 'T-25 has no live variant');
  const live = t25.slice(t25.indexOf('### Live variant'));
  assert.ok(live.includes('Which engagement is this for?'));
  assert.match(live, /before any\s+`snow_us_active_update_set_ensure`\s+and before the write question/,
    'the ordering — question, then update set, then the write question — is not stated');
  assert.match(live, /`clients\/_unfiled\/` holds\s+no record of it/, 'the live case does not forbid filing the change in _unfiled');
});
