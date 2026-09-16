/**
 * ARC-08-C7 — ONE remedy for "there is no instance yet", enforced by scanning the tree.
 *
 * The first version of this check listed the surfaces it knew about and asserted each carried the
 * constant. It passed while two more surfaces said something else, in the same runner and in the
 * server — because a test that enumerates can only ever see what its author already saw. An
 * enumeration is a memory; this is a search.
 *
 * So: every line under the engine's lib, the server's src, and the generated files that mentions
 * `instance add` or `setup-instance` must either carry the one remedy, or be on the allowlist below
 * WITH the state it belongs to. A new copy fails here by default, which is the only arrangement that
 * survives somebody adding a surface without reading this file.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import { ADD_INSTANCE } from '../tools/snowarch/lib/text.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** Where a remedy for this state could plausibly be written. Tests are excluded: they quote. */
// `scripts/` is in scope because a generator WRITES a surface: the fourth copy of this remedy
// lived in `gen-doctor-docs.mjs` and reached the published docs from there.
const TREES = ['tools/snowarch/lib', 'packages/snowarch/src', 'scripts'];
const FILES = ['README.md', 'docs/INSTALL.md', 'docs/ARCHITECTURE.md', 'bootstrap.sh', 'bootstrap.ps1'];

/**
 * The STATE, not the commands.
 *
 * Two earlier patterns here were wrong, and both failed on contact with the tree rather than in
 * review. `/instance add|setup-instance/` matched 70 lines — comments, the wizard's own docs, and
 * `a prod instance ADDitionally needs --ack-prod`. Narrowing to command spellings still matched 32,
 * because a command is not a remedy: `import-legacy` re-adds after a migration, `tty.ts` explains
 * `--password-stdin`, INSTALL walks somebody through the wizard on purpose. None of those is this
 * state.
 *
 * What ARC-05-S06 criterion 3 is about is the answer to ONE question — "there is no instance yet,
 * what do I do?" — so that question is what this matches, and the remedy is checked in the message
 * that answers it.
 */
// Singular AND plural. The pattern was a third enumeration: it listed the phrasings its author
// could imagine, and `No instanceS configured` — the empty-store message in `format.ts` — walked
// straight through it. Same state, seventh wording.
const STATE = /no (?:ServiceNow )?instances?(?: (?:is|are))? configured|No ServiceNow instances?/i;
const IS_COMMENT = /^\s*(\/\/|\*|#|<!--)/;

/**
 * Occurrences that are NOT this remedy, each with the state it belongs to.
 *
 * Keyed by file and a fragment of the line rather than by `file:line`. A line number is a fact about
 * everything ABOVE an entry, so an unrelated edit higher in the file would fail this test and teach
 * the next person to re-number the allowlist rather than read it. The fragment identifies the
 * occurrence and survives the file moving around it — and it still fails if the line itself changes,
 * which is the case that matters.
 */
const ALLOWED = [
  { file: 'packages/snowarch/src/doctor/types.ts', needle: 'nothing to probe',
    state: 'a check DETAIL, not a remedy — it explains why a probe was skipped and offers nothing' },
  { file: 'packages/snowarch/src/doctor/checks.ts', needle: "skip('SV-03'",
    state: 'a check DETAIL for SV-03 — it reports why the check was skipped and offers no remedy' },
  { file: 'packages/snowarch/src/doctor/checks.ts', needle: "skip('SV-04'",
    state: 'a check DETAIL for SV-04 — same: a skip reason, with nothing offered to act on' },
  { file: 'tools/snowarch/lib/text.mjs', needle: 'firstRun',
    state: 'the session-start BANNER, which this file constrains to one line — "a nudge that wraps '
      + 'is a nudge that gets skipped". It offers the in-Claude half, which is the actionable one '
      + 'where it is read; the full remedy is one line down, in the Mode line' },
  { file: 'tools/snowarch/lib/text.json', needle: 'firstRun',
    state: 'generated from BANNER.firstRun above by `npm run gen`; E-21 keeps it fresh' },
];

const walk = (dir) => readdirSync(dir).flatMap((entry) => {
  const full = join(dir, entry);
  if (statSync(full).isDirectory()) return walk(full);
  // `.json` is in the list because `text.json` is a SURFACE: the Node-free launchers read it,
  // and a generated file nobody scans is exactly where a stale wording survives.
  return /\.(mjs|ts|js|md|sh|ps1|json)$/.test(entry) ? [full] : [];
});

function occurrences() {
  const files = [
    ...TREES.flatMap((t) => walk(join(root, t))),
    ...FILES.map((f) => join(root, f)),
  ];
  const found = [];
  for (const file of files) {
    // Forward slashes ALWAYS: `relative()` answers in the platform's separator, so on Windows every
    // allowlist key (written with `/`) missed and the scan reported five allowlisted occurrences as
    // violations. The test was green on macOS and red on four Windows cells.
    const rel = relative(root, file).split(sep).join('/');
    const lines = readFileSync(file, 'utf8').split('\n');
    lines.forEach((line, i) => {
      if (!STATE.test(line) || IS_COMMENT.test(line)) return;
      // The message continues onto the next lines — these strings are wrapped at 100 columns, so
      // the remedy is routinely on a different line from the state it answers. Two lines of window
      // is what the longest of them needs; a window of one would have "found" a missing remedy in
      // every wrapped message in the tree.
      const window = lines.slice(i, i + 3).join(' ');
      found.push({ rel, line: i + 1, text: line.trim(), window });
    });
  }
  return found;
}

test('ARC-08-C7 — every mention of this remedy is the one remedy, or is allowlisted with its state', () => {
  const remedy = ADD_INSTANCE();
  // The rendering differs per platform spelling (`snowarch.cmd`), so the commands are what is
  // matched, not the whole sentence: a surface carries the remedy when it sends the reader to
  // `mode live`, which is the decision ARC-05-S06 criterion 3 records.
  // A source line that RENDERS the constant carries it just as much as one that spells it out —
  // B08 does exactly that, and a matcher looking only for the literal would have called the fix
  // a violation.
  const carriesRemedy = (text) => /mode live|ADD_INSTANCE|MODE_VARIANTS\.unconfigured/.test(text);

  const unlisted = occurrences().filter(({ rel, text, window }) => {
    if (carriesRemedy(window)) return false;
    return !ALLOWED.some((a) => a.file === rel && (text.includes(a.needle) || window.includes(a.needle)));
  });

  assert.deepEqual(unlisted.map((u) => `${u.rel}:${u.line}: ${u.text.slice(0, 90)}`), [],
    `${unlisted.length} place(s) answer "no instance configured" with their own wording.\n`
    + 'Render ADD_INSTANCE, or add an entry to ALLOWED saying which state it belongs to.');

  // NON-VACUITY: the scan must actually be finding things, or an empty result proves nothing.
  // The floor moves with the pattern, or it stops meaning anything. Widening to `instances?` took
  // the scan from 5 matches to 11; 9 leaves room for two legitimate removals while still failing
  // loudly if the pattern stops matching or a tree is renamed out from under it.
  assert.ok(occurrences().length >= 9,
    `the scan found only ${occurrences().length} — the trees or the pattern moved`);
  assert.match(remedy, /mode live/);
});

test('ARC-08-C7 — allowlist keys match on Windows too', () => {
  // The scan keys the allowlist on a repo-relative path written with forward slashes, while
  // `relative()` answers in the platform's separator. On four Windows cells that mismatch turned
  // five allowlisted occurrences into reported violations, for three pushes, while this suite was
  // green on macOS. The normalisation is asserted here rather than hoped for.
  const windowsShaped = 'packages\\snowarch\\src\\doctor\\checks.ts';
  assert.equal(windowsShaped.split('\\').join('/'), 'packages/snowarch/src/doctor/checks.ts');
  for (const entry of ALLOWED) {
    assert.doesNotMatch(entry.file, /\\/, `an allowlist key must be written with forward slashes: ${entry.file}`);
  }
});

test('ARC-08-C7 — the allowlist has no dead entries', () => {
  // Both directions. An allowlist that keeps excusing an occurrence which no longer exists is how a
  // list stops describing the tree, and the next person trusts it anyway.
  const found = occurrences();
  for (const entry of ALLOWED) {
    assert.ok(found.some((f) => f.rel === entry.file && f.text.includes(entry.needle)),
      `allowlist entry no longer matches anything: ${entry.file} — "${entry.needle}"`);
    assert.ok(entry.state && entry.state.length > 20,
      `allowlist entry has no stated reason: ${entry.file}`);
  }
});

test('ARC-08-C7 — the server carries the same remedy, pinned rather than imported', () => {
  // The server package has no dependency on `tools/`, and generating a source file into `src/` would
  // make its build wait on the engine's generator. So the string lives there and is pinned here —
  // what this repository already does for server-side strings (AUTHENTICATION_FAILED).
  const status = readFileSync(join(root, 'packages/snowarch/src/no-instance.ts'), 'utf8');
  const message = /export const NO_INSTANCE_MESSAGE =([\s\S]*?);/.exec(status)?.[1] ?? '';

  assert.match(message, /mode live/, 'the server sends the reader somewhere else than the engine does');
  assert.match(message, /setup-instance/, 'the in-Claude path must still be offered');
  assert.doesNotMatch(message, /instance add/,
    '`instance add` is the wizard alone: it leaves a live instance with design toggles around it');
});
