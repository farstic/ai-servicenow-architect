// Copyright 2026 Cvetomir Grigorov. Licensed under the Business Source License 1.1 (see LICENSE).
// snowarch — AI ServiceNow Architect. Not affiliated with or endorsed by ServiceNow, Inc.
/**
 * ARC-09-C185a — one allow-list of shipped paths, and a guard that nothing the runtime reaches is left out of it.
 *
 * The signed manifest's coverage (`COVERAGE`, packages/snowarch/src/licence/integrity.ts) is the one definition: the
 * signer, the verifier's stored copy and the distribution export read it. The guard finds every path the runtime
 * reaches — an import, a literal repo path in runtime code (a spawn, a read, a printed pointer), a path a shipped doc
 * cites — and reports any that the list leaves out. An unshipped module reached only behind `isEngineeringCheckout`
 * is a named exception. A planted case of each kind is caught here; the real tree is checked by `--check`.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tempDir } from '../tools/snowarch/tests/helpers/temp.mjs';
import { isEngineeringCheckout } from '../tools/snowarch/lib/engineering-checkout.mjs';
import { exportTree, shippedFiles, unlistedReferences } from '../scripts/lib/distribution.mjs';
import { engineContractChecks } from '../tools/snowarch/lib/doctor/checks/engine-contract.mjs';

const REAL_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
// A backtick, built here so the fixtures' cited paths are not citations of this file (L05 reads it too).
const BT = String.fromCharCode(96);

function put(root, rel, text) {
  mkdirSync(dirname(join(root, rel)), { recursive: true });
  writeFileSync(join(root, rel), text);
}
const git = (root, args) => execFileSync('git', ['-c', 'user.email=f@example.com', '-c', 'user.name=f', ...args],
  { cwd: root, encoding: 'utf8', stdio: 'pipe' });

/** A small repository: a runtime entry and a skill, each reaching one path the list leaves out, and one gated import. */
function plantedTree(t) {
  const root = tempDir('snowarch-dist-', t);
  put(root, 'tools/snowarch/bin/snowarch.mjs', "import '../lib/a.mjs';\n");
  put(root, 'tools/snowarch/lib/a.mjs', [
    "import { spawnSync } from 'node:child_process';",
    "import { readFileSync } from 'node:fs';",
    "import { join } from 'node:path';",
    "import { b } from '../../../scripts/lib/unlisted.mjs';",
    'export async function go(root) {',
    "  spawnSync(process.execPath, [join(root, 'scripts/unlisted-spawn.mjs')]);",
    "  readFileSync(join(root, 'docs/unlisted-data.json'), 'utf8');",
    '  // a comment naming ' + BT + 'docs/only-in-a-comment.md' + BT + ' is not a reference',
    "  if (isEngineeringCheckout(root)) await import('../../../scripts/lib/gated.mjs');",
    '  return b;',
    '}',
    '',
  ].join('\n'));
  put(root, 'scripts/lib/unlisted.mjs', 'export const b = 1;\n');
  put(root, 'scripts/lib/gated.mjs', 'export const g = 1;\n');
  put(root, 'scripts/unlisted-spawn.mjs', '\n');
  put(root, 'docs/unlisted-data.json', '{}\n');
  put(root, '.claude/skills/x/SKILL.md', 'Read ' + BT + 'docs/unlisted-doc.md' + BT + ' first, then ' + BT
    + '.claude/skills/x/SKILL.md' + BT + '.\n');
  put(root, 'docs/unlisted-doc.md', '# x\n');
  git(root, ['init', '-q', '-b', 'main']);
  git(root, ['add', '-A']);
  git(root, ['commit', '-q', '-m', 'fixture']);
  return root;
}
const COV = { covers: ['tools/snowarch/', '.claude/skills/'], excludes: [], ignores: [] };
const GATED = [{ from: 'tools/snowarch/lib/a.mjs', to: 'scripts/lib/gated.mjs', reason: 'a maintainers\' module behind isEngineeringCheckout' }];

test('isEngineeringCheckout is the tree shape: tests/ and .github/ both present', (t) => {
  assert.equal(isEngineeringCheckout(REAL_ROOT), true);
  const root = tempDir('snowarch-eng-', t);
  assert.equal(isEngineeringCheckout(root), false);
  mkdirSync(join(root, 'tests'));
  assert.equal(isEngineeringCheckout(root), false, 'tests/ alone is not the engineering checkout');
  mkdirSync(join(root, '.github'));
  assert.equal(isEngineeringCheckout(root), true);
});

test('E-21 skips outside the engineering checkout, with the reason, and runs no generator', async (t) => {
  const root = tempDir('snowarch-e21-', t);
  const e21 = engineContractChecks().find((c) => c.id === 'E-21');
  const r = await e21.run({ root, selfRoot: root, config: {} });
  assert.equal(r.status, 'skip');
  assert.match(r.detail ?? r.message ?? '', /verified by the signed manifest \(E-32\).*maintainers' tools, run in the engineering checkout/);
});

test('the guard finds an import, a spawn, a read and a doc reference the list leaves out; a gated import is excused', (t) => {
  const root = plantedTree(t);
  const refs = unlistedReferences(root, { coverage: COV, entries: ['tools/snowarch/bin/snowarch.mjs'],
    surfaces: ['.claude/skills/'], exceptions: GATED });
  const paths = refs.map((r) => r.path).sort();
  assert.deepEqual(paths, ['docs/unlisted-data.json', 'docs/unlisted-doc.md', 'scripts/lib/unlisted.mjs', 'scripts/unlisted-spawn.mjs']);
  assert.ok(refs.every((r) => r.from && r.line > 0), 'each finding names the file and line that reaches it');
});

test('control: the same tree with everything listed has nothing to report', (t) => {
  const root = plantedTree(t);
  const all = { covers: ['tools/snowarch/', '.claude/skills/', 'scripts/', 'docs/'], excludes: [], ignores: [] };
  assert.deepEqual(unlistedReferences(root, { coverage: all, entries: ['tools/snowarch/bin/snowarch.mjs'],
    surfaces: ['.claude/skills/'], exceptions: [] }), []);
});

test('every workspace the root package.json and package-lock.json name ships its package.json (npm ci needs it)', () => {
  const pkg = JSON.parse(readFileSync(join(REAL_ROOT, 'package.json'), 'utf8'));
  const lock = JSON.parse(readFileSync(join(REAL_ROOT, 'package-lock.json'), 'utf8'));
  const tracked = execFileSync('git', ['-C', REAL_ROOT, 'ls-files', '-z', '--', '*package.json'], { encoding: 'utf8' })
    .split('\0').filter(Boolean);
  // `packages/*` names every directory under packages/ that holds a package.json; an exact entry names itself.
  const fromGlobs = pkg.workspaces.flatMap((w) => tracked.map((p) => p.replace(/\/package\.json$/, ''))
    .filter((dir) => (w.endsWith('/*') ? dir.startsWith(w.slice(0, -1)) && !dir.slice(w.length - 1).includes('/') : dir === w)));
  const fromLock = Object.keys(lock.packages).filter((k) => k !== '' && !k.includes('node_modules/'));
  const workspaces = [...new Set([...fromGlobs, ...fromLock])].sort();
  assert.ok(workspaces.length >= 2, `the workspaces were derived: ${workspaces.join(', ')}`);
  const shipped = new Set(shippedFiles(REAL_ROOT));
  for (const ws of workspaces) assert.ok(shipped.has(`${ws}/package.json`), `${ws}/package.json ships`);
});

test('the export writes the shipped files, byte for byte, and nothing else — no .git', (t) => {
  const root = plantedTree(t);
  const out = join(tempDir('snowarch-export-', t), 'tree');
  const shipped = shippedFiles(root, COV);
  assert.deepEqual(shipped, ['.claude/skills/x/SKILL.md', 'tools/snowarch/bin/snowarch.mjs', 'tools/snowarch/lib/a.mjs']);
  assert.equal(exportTree(root, out, COV), shipped.length);
  for (const rel of shipped) assert.deepEqual(readFileSync(join(out, rel)), readFileSync(join(root, rel)));
  assert.equal(existsSync(join(out, '.git')), false);
  assert.equal(existsSync(join(out, 'scripts')), false);
});
