/**
 * ARC-10-S07 — a validation record is committed, so it may not carry what a run sees.
 *
 * The sittings (ARC-10-S06, S08) write into `docs/validation/`, from a machine with a real instance
 * on it. Everything that makes a run useful — the URL it reached, the account it used, the ids that
 * came back — is exactly what must not survive into the repository. This refuses all of it, names
 * the pattern and the line, and proves each pattern fires with a fixture carrying only that one.
 *
 * THE REDACTION HALF applies to every `docs/validation/*.md`, including the two records that
 * predate the format. THE SHAPE HALF is keyed on the FIRST HEADING, because this directory holds
 * more than one kind of document and a rule that demanded one shape would have retired a template
 * that works: `# Validation run —` (ARC-10-S07) and `# Post-release review —` (ARC-10-S10) each
 * have their own required sections, and `TEMPLATE-e2e-live.md` — ARC-07-S11's own format — matches
 * neither heading and is governed by the redaction half alone.
 *
 * The shape half was DESCRIBED in this paragraph from the day the file was written and implemented
 * by nothing: the sentence said a rule existed and no test asserted it. Found while adding the
 * second shape (ARC-10-S10), which is the honest place to record it — a docblock is not a test.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => readFileSync(join(root, rel), 'utf8').replace(/\r/g, '');

/** The retired names come from the detector's data, never a second list (ARC-05). */
const retiredNames = () => Object.keys(JSON.parse(read('packages/contract/retired-names.json')));

/**
 * What a committed record may not contain.
 *
 * `sys_id` is WORD-BOUNDED, and that is the whole difficulty: a 32-hex run of characters inside a
 * 40-hex git sha or the 64-hex contract sha is not a sys_id, and a rule that flagged those would
 * fire on every record that quotes the build it tested. Both negatives are asserted below.
 */
export function patterns(retired = retiredNames()) {
  return [
    ['hostname', /[a-z0-9-]+\.service-now\.com/],
    ['e-mail', /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/],
    ['sys_id', /\b[0-9a-f]{32}\b/],
    ['credential', /(password|secret|token)\s*[:=]/i],
    ['home path', /(\/Users\/|\/home\/|C:\\Users\\)/],
    ['retired name', new RegExp(retired.map((n) => (/^[0-9A-Za-z_]+$/.test(n)
      ? `\\b${n}\\b` : n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))).join('|'))],
  ];
}

/** One finding per offending line: `<file>:<line>: <pattern> — <the line>`. */
export function scanRecord(rel, text, pats = patterns()) {
  const out = [];
  text.split('\n').forEach((line, i) => {
    for (const [name, re] of pats) {
      if (re.test(line)) out.push(`${rel}:${i + 1}: ${name} — ${line.trim().slice(0, 70)}`);
    }
  });
  return out;
}

const RECORDS = () => readdirSync(join(root, 'docs/validation'))
  .filter((f) => f.endsWith('.md')).sort();

test('AC — every committed validation record is clean', () => {
  const findings = RECORDS().flatMap((f) => scanRecord(`docs/validation/${f}`, read(`docs/validation/${f}`)));
  assert.deepEqual(findings, [], `${findings.length} finding(s):\n  ${findings.join('\n  ')}`);
  // Not vacuous: there are records to scan, and the two that predate this format are among them.
  assert.ok(RECORDS().length >= 4, `only ${RECORDS().length} record(s) — the directory scan is wrong`);
});

test('AC — each pattern fires, on a fixture carrying only that one', () => {
  const dir = 'tests/fixtures/validation-records';
  const expected = {
    'hostname.md': 'hostname',
    'email.md': 'e-mail',
    'sys-id.md': 'sys_id',
    'credential.md': 'credential',
    'home-path.md': 'home path',
    'retired-name.md': 'retired name',
  };
  for (const [file, pattern] of Object.entries(expected)) {
    const findings = scanRecord(`${dir}/${file}`, read(`${dir}/${file}`));
    assert.equal(findings.length, 1, `${file} produced ${findings.length} findings: ${findings.join(' · ')}`);
    assert.match(findings[0], new RegExp(`^${dir}/${file}:\\d+: ${pattern} — `),
      `${file}: ${findings[0]}`);
  }
  // ...and the README beside them carries none, or the fixtures would be proving the directory
  // rather than themselves.
  assert.deepEqual(scanRecord(`${dir}/README.md`, read(`${dir}/README.md`)), []);
});

test('AC — a sha is not a sys_id, and a redacted length is not a credential', () => {
  const [, , sysId] = patterns();
  // The three shas a record legitimately quotes. A 32-hex RUN inside a longer hex string has no
  // word boundary, which is what makes the word-bounded form safe here.
  for (const sha of ['2bc5c79', '11b39be17307dd4b21df15a54e8011ae68f64dba', 'a'.repeat(64)]) {
    assert.equal(sysId[1].test(sha), false, `${sha.slice(0, 12)}… reads as a sys_id`);
  }
  assert.equal(sysId[1].test('a'.repeat(32)), true, 'a real sys_id no longer matches');

  const [, , , credential] = patterns();
  // The doctor's own rendering, and T-19's sentence: both NAME a credential without carrying one.
  for (const line of ['holds 3 env keys, 1 credential-shaped — set (len 14)',
    'edit the stored password in `.local/instances.json`']) {
    assert.equal(credential[1].test(line), false, `refused a line that carries no secret: ${line}`);
  }
  assert.equal(credential[1].test('password: hunter2'), true, 'a real leak no longer matches');
});

// ─── One place a new record goes, asserted rather than agreed ────────────────────────────────

/** The documents that TELL somebody where to record a run. History is not in this set. */
export const INSTRUCTION_FILES = ['tests/VALIDATION-TESTS.md', 'docs/CONTRIBUTING.md',
  'docs/spikes/OWNER-SITTING.md'];

/** A mention is allowed only while it is saying the path is retired, or that old records stay. */
export const RETIRED_PATH = 'docs/spikes/validation-runs';
const allows = (line) => /\bretired\b|\bstay\b/.test(line);

test('AC — no instruction still sends a new record to the retired path', () => {
  // The sentence lived in FIVE places, not the one this story changed first: two more in
  // `tests/VALIDATION-TESTS.md` and three in `OWNER-SITTING.md`, which is the file the sittings
  // actually read while doing the run. "One definition" is a claim about the whole tree, and the
  // only way it stays true is a check — the next copy is otherwise found by somebody reading.
  const hits = [];
  for (const rel of INSTRUCTION_FILES) {
    read(rel).split('\n').forEach((line, i) => {
      if (line.includes(RETIRED_PATH) && !allows(line)) {
        hits.push(`${rel}:${i + 1}: ${line.trim().slice(0, 72)}`);
      }
    });
  }
  assert.deepEqual(hits, [], `${hits.length} instruction(s) still name the retired path`);

  // ...and each file names the CURRENT one, or this passes on a tree that tells nobody anything.
  for (const rel of INSTRUCTION_FILES) {
    assert.ok(read(rel).includes('docs/validation/'), `${rel} does not name the current location`);
  }

  // Both directions on the allowance: a bare mention is a finding, a retirement sentence is not.
  assert.equal(allows('or in `docs/spikes/validation-runs/<date>-<what>.md`.'), false);
  assert.equal(allows('those records stay under `docs/spikes/validation-runs/`'), true);
  assert.equal(allows('that path is retired for new ones'), true);
});

// ─── The cutover list's ids resolve against the test file's own headings ──────────────────────

/** `## T-NN — title` — level two, which is what `tests/VALIDATION-TESTS.md` uses. */
export const headingIds = (text) => [...text.matchAll(/^## (T-\d\d) — /gm)].map((m) => m[1]);
/** The ids named in the Cutover test list's rows. */
export const listIds = (text) => {
  const from = text.indexOf('## Cutover test list');
  if (from === -1) return [];
  const section = text.slice(from, (text.indexOf('\n## ', from + 1) + 1) || text.length);
  return [...new Set([...section.matchAll(/`(T-\d\d)`/g)].map((m) => m[1]))];
};

test('AC — every id in the cutover list resolves to a test in the same file', () => {
  const text = read('tests/VALIDATION-TESTS.md');
  const known = new Set(headingIds(text));
  assert.ok(known.size >= 20, `only ${known.size} T-headings parsed — the parse is stale`);
  const listed = listIds(text);
  assert.ok(listed.length > 0, 'the cutover list names no test at all');
  const unresolved = listed.filter((id) => !known.has(id));
  assert.deepEqual(unresolved, [], `${unresolved.length} id(s) in the list resolve to no section`);

  // The negative: an id that cannot exist must be reported, or "all resolve" is a sentence about
  // a parse that found nothing. Planted INSIDE the real section — the first attempt appended a
  // second `## Cutover test list` at the end of the file, which `listIds` never reads because it
  // takes the first, so the control passed a parser that had seen nothing.
  const planted = text.replace('| 1 | macOS · `design-only` |', '| 0 | planted | `T-99` |\n| 1 | macOS · `design-only` |');
  assert.notEqual(planted, text, 'the plant did not apply — the table shape changed');
  assert.equal(listIds(planted).includes('T-99'), true, 'the list parser missed a planted id');
  assert.equal(new Set(headingIds(planted)).has('T-99'), false, 'T-99 must not resolve');
  assert.deepEqual(listIds(planted).filter((id) => !known.has(id)), ['T-99'],
    'the unresolved-id check does not report the planted one');
});

// ─── ARC-10-S07 AC 3, second half, and ARC-10-S02 AC 4 (acceptance items B10-04, B10-05) ──────

/**
 * The four design-only checks the cutover list names by name.
 *
 * AC 3's first half — every `T-` id in the list resolves to a section — has been asserted since
 * S07. Its second half, that the list also names what a design-only row proves, was true in the
 * document and asserted by nothing: measured in the acceptance pass, all four phrases are in the
 * list's own paragraph. A paragraph nothing checks is a paragraph that survives one rewrite.
 */
export const DESIGN_ONLY_CHECKS = [
  ['the banner', /the banner reads `Mode: design-only`/],
  ['/mcp', /`\/mcp` shows the server disabled/],
  ['no MCP call', /T-05 and T-06 run their dormant variant/],
  ['the hand-off', /`\/snowarch setup-instance` prints the terminal hand-off and STOPS/],
];

test('AC 3 — the cutover list says what a design-only row proves, not only which tests it runs', () => {
  const text = read('tests/VALIDATION-TESTS.md');
  const from = text.indexOf('## Cutover test list');
  assert.ok(from > -1, 'the cutover list is gone');
  const section = text.slice(from, (text.indexOf('\n## ', from + 1) + 1) || text.length);

  // WHITESPACE-COLLAPSED before matching, and this is not a convenience: the paragraph wraps
  // "`/mcp` shows / the server disabled", so a raw match found three of the four and reported the
  // fourth as deleted. The same trap ARC-10-S04's sweep is collapsed for — a rule that a reflowed
  // paragraph can break is a rule that will be broken by a reflow.
  const flat = section.replace(/\s+/g, ' ');
  const missing = DESIGN_ONLY_CHECKS.filter(([, re]) => !re.test(flat)).map(([n]) => n);
  assert.deepEqual(missing, [], `${missing.length} design-only check(s) no longer named in the list`);

  // In the SECTION, not merely in the file: the phrases exist elsewhere too, and a rule satisfied
  // by a sentence three pages away tells a reader of this table nothing.
  assert.ok(section.length < text.length, 'the section slice took the whole file');
  // The control that the slice is doing work: the list's own table rows are inside it, and the
  // file's later sections are not.
  assert.match(flat, /\| # \| Machine · mode \|/);
  assert.equal(/## Recording a validation run/.test(section), false, 'the slice ran past the section');
});

test('AC 4 — the engagements guidance claims no absolute path', () => {
  // ARC-10-S02's other half. The page tells somebody where their engagements live, which is the
  // kind of sentence that reaches for a real path — and a real path in a committed document is
  // both wrong for every other machine and a leak of this one. The redaction lint above refuses
  // the same shapes in a validation record; this refuses them in the guidance that produces one.
  const doc = read('docs/CONTRIBUTING.md');
  const from = doc.indexOf('## Engagements and memory');
  assert.ok(from > -1, 'the Engagements and memory section is gone');
  const section = doc.slice(from, (doc.indexOf('\n## ', from + 1) + 1) || doc.length);

  const [, , , , homePath] = patterns();
  const hits = section.split('\n')
    .map((l, i) => [i + 1, l])
    .filter(([, l]) => homePath[1].test(l))
    .map(([i, l]) => `docs/CONTRIBUTING.md § Engagements and memory:+${i}: ${l.trim().slice(0, 70)}`);
  assert.deepEqual(hits, [], `${hits.length} absolute path(s) in the engagements guidance`);

  // Not vacuous, in both directions: the section is really there, and the pattern really fires.
  assert.ok(section.includes('clients/'), 'the section does not describe where engagements live');
  assert.equal(homePath[1].test('put them in /Users/you/work/clients'), true);
});

// ─── The shape half: each kind of record carries its own sections ────────────────────────────

/** First `# ` heading, which is what decides WHICH shape a file in this directory must have. */
export const firstHeading = (text) => (/^# (.+)$/m.exec(text) || [, ''])[1];

/**
 * The sections a record of each kind must carry, by the heading that identifies it.
 *
 * A template is held to its own shape too — it is the thing people copy, so a template missing a
 * section propagates the gap into every record made from it.
 */
export const SHAPES = new Map([
  ['# Validation run —', ['## Install timeline', '## Doctor summary', '## Tests',
    '## Observer notes', '## Defects raised']],
  ['# Post-release review —', ['## Denominator', '## Issues', '## Was the doctor JSON enough?',
    '## Did any report carry a secret?', '## Archive decision', '## Next actions']],
]);

/** `null` when the file is not one of the shaped kinds; otherwise the sections it is missing. */
export function missingSections(text) {
  const head = firstHeading(text);
  for (const [prefix, required] of SHAPES) {
    // A required heading must be a WHOLE LINE. Substring matching passed `## Archive decisions`
    // for `## Archive decision`, which is how the negative control below first failed to fire.
    if (`# ${head}`.startsWith(prefix)) {
      const lines = new Set(text.split('\n').map((l) => l.trimEnd()));
      return required.filter((h) => !lines.has(h));
    }
  }
  return null;
}

test('AC — every shaped record carries its sections, and the unshaped one is left alone', () => {
  const findings = [];
  let shaped = 0;
  for (const f of RECORDS()) {
    const missing = missingSections(read(`docs/validation/${f}`));
    if (missing === null) continue;
    shaped += 1;
    for (const h of missing) findings.push(`docs/validation/${f}: missing ${h}`);
  }
  assert.deepEqual(findings, [], `${findings.length} missing section(s):\n  ${findings.join('\n  ')}`);
  // Two today — one template of each kind, which is the floor: the sittings' own records (S06,
  // S08) and the review join them later. The two dated records in this directory are ARC-03's and
  // predate the format, so they match no shape and are governed by the redaction half alone.
  assert.ok(shaped >= 2, `only ${shaped} shaped record(s) — the heading match is wrong`);

  // Both kinds are really present, or "every shaped record" is a sentence about one of them.
  const heads = RECORDS().map((f) => firstHeading(read(`docs/validation/${f}`)));
  assert.ok(heads.some((h) => h.startsWith('Validation run —')), 'no validation run to shape-check');
  assert.ok(heads.some((h) => h.startsWith('Post-release review —')), 'no review to shape-check');

  // ARC-07-S11's template matches neither heading and must stay unshaped, not silently pass.
  assert.equal(missingSections(read('docs/validation/TEMPLATE-e2e-live.md')), null,
    'the e2e template is being held to a shape it never had');

  // The negative: a record that loses a section is reported.
  const review = read('docs/validation/TEMPLATE-post-release-review.md');
  const damaged = review.replace('\n## Archive decision', '\n## Archive decisions');
  assert.notEqual(damaged, review, 'the plant did not apply — the heading changed');
  assert.deepEqual(missingSections(damaged), ['## Archive decision']);
});
