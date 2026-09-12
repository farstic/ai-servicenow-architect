/**
 * ARC-10-S07 — a validation record is committed, so it may not carry what a run sees.
 *
 * The sittings (ARC-10-S06, S08) write into `docs/validation/`, from a machine with a real instance
 * on it. Everything that makes a run useful — the URL it reached, the account it used, the ids that
 * came back — is exactly what must not survive into the repository. This refuses all of it, names
 * the pattern and the line, and proves each pattern fires with a fixture carrying only that one.
 *
 * THE REDACTION HALF applies to every `docs/validation/*.md`, including the two records that
 * predate the format. THE SHAPE HALF applies only to files whose first heading is
 * `# Validation run —`, because `TEMPLATE-e2e-live.md` is ARC-07-S11's own format and a rule that
 * demanded one shape would have retired a template that works.
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
