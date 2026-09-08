import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * `retired-names.json` is generated, flat, and read by `grep -f`.
 *
 * The shape is dictated by the consumer and is unusual enough to be worth stating: `jq -r
 * 'keys[]'` must yield exactly the forbidden words, so the file carries **no metadata keys** —
 * not even `$schema`. One would become a "retired name", and every file in the repository that
 * mentions a JSON schema would fail the sweep.
 */
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (p) => JSON.parse(readFileSync(resolve(root, p), 'utf8'));

const committed = read('packages/contract/retired-names.json');
const renameMap = read('packages/snowarch/tool-rename-map.json');
const identifiers = read('packages/contract/retired-identifiers.json');
const retiredTools = read('packages/snowarch/retired-tools.json').retired;
const contract = read('packages/snowarch/dist/contract.json');

const REMOVED = '(removed)';
const currentTools = new Set(contract.tools.map((t) => t.name));
const removedNames = new Set(retiredTools.map((t) => t.name));

test('the committed file equals the generator output', () => {
  // Run the generator's own `--check`, rather than re-deriving the merge here. A test that
  // re-implemented the merge would agree with itself and not with the tool anybody runs.
  execFileSync(process.execPath, ['packages/contract/gen-retired-names.mjs', '--check'],
    { cwd: root, stdio: 'pipe' });
});

test('the count is derived from the three sources, never a literal', () => {
  // 394 renames + 6 identifiers + 1 removed today. Asserting `401` here would make every future
  // rename a two-file change for no reason, and would say nothing about WHY the number moved.
  const expected = new Set([
    ...Object.keys(renameMap),
    ...Object.keys(identifiers),
    ...removedNames,
  ]);
  assert.equal(Object.keys(committed).length, expected.size);
  assert.deepEqual(Object.keys(committed).sort(), [...expected].sort());
});

test('keys are sorted', () => {
  const keys = Object.keys(committed);
  assert.deepEqual(keys, [...keys].sort());
});

test('there are no metadata keys', () => {
  // `jq -r 'keys[]'` feeds `grep -f` directly. A `$schema` or `_note` key would be greppable as
  // a forbidden word.
  const meta = Object.keys(committed).filter((k) => k.startsWith('$') || k.startsWith('_'));
  assert.deepEqual(meta, []);
});

test('every value is a non-empty string', () => {
  for (const [k, v] of Object.entries(committed)) {
    assert.equal(typeof v, 'string', `${k}: value is not a string`);
    assert.ok(v.trim().length > 0, `${k}: empty replacement`);
  }
});

test('criterion 3 — a snow_ key is retired only if it is a removed tool', () => {
  // The story's original form was "no key starts with snow_", a guard against a rename map whose
  // keys became new names. ARC-04-S08 removed a registered tool, which IS a retired name and
  // does start with snow_ — so the guard is stated as the property it was protecting.
  const snowKeys = Object.keys(committed).filter((k) => k.startsWith('snow_'));
  for (const k of snowKeys) {
    assert.ok(removedNames.has(k), `${k} starts with snow_ but is not in retired-tools.json`);
  }
});

test('and no retired key is a name the server still answers', () => {
  // The other half, and the one that actually matters: a current tool listed as retired would
  // make the sweep forbid the correct name everywhere.
  const live = Object.keys(committed).filter((k) => currentTools.has(k));
  assert.deepEqual(live, [], 'these are still in the contract');
});

test('a removed tool maps to the literal (removed)', () => {
  for (const name of removedNames) {
    assert.equal(committed[name], REMOVED, `${name} should map to ${REMOVED}`);
  }
});

test('a rename whose destination was removed collapses to (removed)', () => {
  // `generate_report` → `snow_rpt_report_generate` → gone. Left uncollapsed, the file would send
  // a reader of the old name to one that also does not exist, and the second hop is the one
  // nobody checks.
  const chained = Object.entries(renameMap).filter(([, v]) => removedNames.has(v));
  assert.ok(chained.length > 0, 'no chained removal in the fixture — this test proves nothing');
  for (const [oldName] of chained) {
    assert.equal(committed[oldName], REMOVED, `${oldName} should collapse to ${REMOVED}`);
  }
});

test('no replacement is itself retired', () => {
  const dead = Object.entries(committed)
    .filter(([, v]) => v !== REMOVED && v in committed)
    .map(([k, v]) => `${k} -> ${v}`);
  assert.deepEqual(dead, []);
});

test('the bare product words are NOT retired', () => {
  // Deliberate, per the story: they are legitimate in history sections and ADRs, they are
  // ARC-10's legacy-store detector strings, and `@farstic/snow-mcp` is an npm record D-01
  // forbids touching — it has to stay nameable. Only the `mcp__…__` prefixes and the package
  // path are retired. Asserted by name so a future "tidy-up" has to argue with a test.
  for (const word of ['snow-mcp', 'servicenow-mcp', '@farstic/snow-mcp']) {
    assert.ok(!(word in committed), `${word} must not be retired`);
  }
  for (const word of ['mcp__nowaikit__', 'mcp__servicenow-mcp__', 'mcp__snow-mcp__', 'packages/snow-mcp']) {
    assert.ok(word in committed, `${word} must be retired`);
  }
});

test('the file is 2-space JSON with LF and a trailing newline', () => {
  const raw = readFileSync(resolve(root, 'packages/contract/retired-names.json'), 'utf8');
  assert.equal(raw, `${JSON.stringify(committed, null, 2)}\n`);
  assert.ok(!raw.includes('\r'), 'CRLF line endings');
});
