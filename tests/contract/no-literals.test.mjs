import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync, writeFileSync, rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadContract, flagNames, presetNames, errorCodes } from '../../packages/contract/lib/contract.mjs';

/**
 * Engine tooling reads names from the contract, never from a list of its own.
 *
 * The failure this prevents is the one the whole ARC is about: a wizard with six flag names typed
 * into it, a doctor with a preset list, a message with a remedy — each true when written, none of
 * them noticed when the server changes. The names are loaded from the contract at test time, so the
 * guard grows with the catalogue rather than being a second list itself.
 */
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const contract = loadContract({ root });

/**
 * Where the rule applies.
 *
 * `tools/snowarch/**` already exists — ARC-03 put the docs library there — so the guard is not
 * vacuous today, and it will cover ARC-06's launcher and ARC-07's wizard from their first commit
 * rather than being remembered afterwards. Those two are the code most likely to reach for a
 * literal. The test asserts BOTH that a declared root which exists contributes files, and prints
 * any root that does not, so a vacuous pass would be visible in the output rather than looking
 * like coverage.
 */
const ROOTS = ['tools/snowarch', 'packages/contract/gen', 'packages/contract/lint'];
const SKIP_DIRS = new Set(['tests', 'fixtures', 'node_modules']);

function walk(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = join(dir, e.name);
    if (e.isDirectory()) return SKIP_DIRS.has(e.name) ? [] : walk(p);
    return e.name.endsWith('.mjs') ? [p] : [];
  });
}

const allow = JSON.parse(readFileSync(join(root, 'tests/fixtures/contract-literals-allowlist.json'), 'utf8')).allow;
const allowed = new Map(allow.map((a) => [a.file, new Set(a.literals)]));

/** A comment is not code. A rule stated in prose has to be able to name what it forbids. */
const isComment = (line) => /^\s*(\/\/|\*|\/\*)/.test(line);

test('ARC-05-S10 criterion 4 — no engine tool holds a name the contract owns', () => {
  const names = [...flagNames(contract), ...presetNames(contract),
    ...errorCodes(contract).map((e) => e.code)];
  const present = ROOTS.filter((r) => existsSync(join(root, r)));
  const absent = ROOTS.filter((r) => !existsSync(join(root, r)));
  const files = present.flatMap((r) => walk(join(root, r))).map((f) => f.slice(root.length + 1).split('\\').join('/'));

  // A declared root that exists must contribute something: a scan set that silently matched nothing
  // is the shape this guard is most likely to rot into.
  for (const r of present) {
    assert.ok(files.some((f) => f.startsWith(`${r}/`)), `${r} exists but contributed no files`);
  }
  console.log(`    scanned ${files.length} file(s) in ${present.length} root(s)`
    + `${absent.length ? `; not yet created: ${absent.join(', ')}` : ''}`);

  const hits = [];
  for (const file of files) {
    const excused = allowed.get(file) ?? new Set();
    readFileSync(join(root, file), 'utf8').split('\n').forEach((line, i) => {
      if (isComment(line)) return;
      for (const n of names) {
        if (excused.has(n)) continue;
        if (line.includes(`'${n}'`) || line.includes(`"${n}"`)) hits.push(`${file}:${i + 1} literal "${n}"`);
      }
      // A hard-coded prefix, not the construction. `mcp__${serverKey}__` is how it is SUPPOSED to
      // be built — from engine.config.json — and forbidding that would forbid the fix.
      const m = /['"`]mcp__(?!\$\{)([a-z0-9-]+)__/.exec(line);
      if (m) hits.push(`${file}:${i + 1} hard-coded prefix mcp__${m[1]}__`);
    });
  }
  assert.deepEqual(hits, [], 'read it from the contract loader, or add it to the allow-list with a reason');
});

test('the allow-list is small, reasoned, and load-bearing', () => {
  assert.ok(allow.length <= 4, `the allow-list grew to ${allow.length} (ceiling 4) — argue for it, do not edit it`);
  for (const a of allow) {
    assert.ok(existsSync(join(root, a.file)), `${a.file} is allow-listed but does not exist`);
    assert.ok(a.reason.length > 60, `${a.file}: the reason is too short to be one`);
    assert.ok(!a.reason.toUpperCase().includes('TODO'), `${a.file}: "TODO" is not a reason`);
    const text = readFileSync(join(root, a.file), 'utf8');
    for (const lit of a.literals) {
      // Quoted, or a bare object key: `full:` and `'read-only':` are the same map entry, and only
      // the hyphenated names need quoting. A check that demanded quotes would fail on the tidier
      // half of the very map it is excusing.
      const bare = new RegExp(`(^|[^\\w-])${lit.replace(/[-]/g, '\\-')}\\s*:`, 'm');
      assert.ok(text.includes(`'${lit}'`) || text.includes(`"${lit}"`) || bare.test(text),
        `${a.file} no longer contains "${lit}" — remove the entry`);
    }
  }
});

test('and every preset the contract declares has its prose entry', () => {
  // The allow-list excuses a map keyed by preset name. That is only safe while the map covers the
  // presets that exist — otherwise a new preset renders with an empty cell and nobody notices.
  for (const file of ['packages/contract/gen/presets.mjs', 'packages/contract/gen/rule-file.mjs']) {
    const text = readFileSync(join(root, file), 'utf8');
    for (const name of presetNames(contract)) {
      assert.ok(text.includes(`'${name}'`) || text.includes(`${name}:`),
        `${file} has no entry for the preset "${name}"`);
    }
  }
});

test('criterion 4 negative — a planted list and a planted code are both caught', () => {
  // Planted where ARC-06 and ARC-07 will write, because that is the code the guard exists for.
  const dir = join(root, 'tools/snowarch/lib');
  const planted = join(dir, '__guard-probe.mjs');
  try {
    writeFileSync(planted, [
      '// A probe for the ARC-05-S10 guard. Deleted by the test that wrote it.',
      "const FLAGS = ['WRITE_ENABLED', 'SCRIPTING_ENABLED'];",
      "export const remedy = (code) => (code === 'AUTHENTICATION_FAILED' ? 'reauthenticate' : '');",
      "export const url = 'mcp__servicenow__snow_core_records_query';",
      'export default FLAGS;',
      '',
    ].join('\n'));

    const names = [...flagNames(contract), ...presetNames(contract),
      ...errorCodes(contract).map((e) => e.code)];
    const text = readFileSync(planted, 'utf8');
    const hits = [];
    text.split('\n').forEach((line, i) => {
      if (isComment(line)) return;
      for (const n of names) {
        if (line.includes(`'${n}'`)) hits.push(`tools/snowarch/lib/__guard-probe.mjs:${i + 1} literal "${n}"`);
      }
      const m = /['"`]mcp__(?!\$\{)([a-z0-9-]+)__/.exec(line);
      if (m) hits.push(`tools/snowarch/lib/__guard-probe.mjs:${i + 1} hard-coded prefix mcp__${m[1]}__`);
    });
    assert.deepEqual(hits, [
      'tools/snowarch/lib/__guard-probe.mjs:2 literal "WRITE_ENABLED"',
      'tools/snowarch/lib/__guard-probe.mjs:2 literal "SCRIPTING_ENABLED"',
      'tools/snowarch/lib/__guard-probe.mjs:3 literal "AUTHENTICATION_FAILED"',
      'tools/snowarch/lib/__guard-probe.mjs:4 hard-coded prefix mcp__servicenow__',
    ]);
    // And the comment on line 1 is not a hit: a file may say what it must not do.
    assert.ok(!hits.some((h) => h.endsWith(':1')));
  } finally {
    rmSync(planted, { force: true });
  }
});
