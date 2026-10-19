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
import { exportTree, shippedFiles, stage, unlistedReferences } from '../scripts/lib/distribution.mjs';
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
    "  readFileSync(join(root, 'docs', 'unlisted', 'joined.json'), 'utf8');",
    "  const remedy = 'run node scripts/unlisted-remedy.mjs, then re-run the doctor';",
    '  // distribution: path list — the files a scan classifies, by name; an absent one is simply not scanned',
    "  const roots = ['docs/listed-root.md',",
    "    'docs/listed-root-2.md'];",
    "  existsSync(join(root, 'packages', 'x', 'node_modules', '@y', 'z', 'package.json'));",
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
  put(root, 'docs/unlisted/joined.json', '{}\n');
  put(root, 'scripts/unlisted-remedy.mjs', '\n');
  put(root, '.claude/skills/x/SKILL.md', 'Read ' + BT + 'docs/unlisted-doc.md' + BT + ' first, then ' + BT
    + '.claude/skills/x/SKILL.md' + BT + '.\nMaintainers run ' + BT + 'tests/maintainers.test.mjs' + BT
    + ' (in the engineering checkout).\n');
  put(root, 'docs/unlisted-doc.md', '# x\n');
  // A shipped page that links a sibling by a relative path: no prefix for L05's extractor to read.
  put(root, '.claude/skills/x/linked.md', 'See [the guide](../../../docs/relative-guide.md#a-section) and [x](SKILL.md).\n'
    // The example's path lands outside the coverage, so a guard that read it as a link would report it.
    + 'Write an image as ' + BT + '![Figure N](../../../docs/figure-N.png)' + BT + ': an example in code, not a link.\n');
  put(root, 'docs/relative-guide.md', '# guide\n');
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

test('the guard finds an import, a spawn, a read (whole or in join segments), a printed remedy and a doc reference the list leaves out; a gated import is excused', (t) => {
  const root = plantedTree(t);
  const refs = unlistedReferences(root, { coverage: COV, entries: ['tools/snowarch/bin/snowarch.mjs'],
    surfaces: ['.claude/skills/'], exceptions: GATED });
  const paths = refs.map((r) => r.path).sort();
  assert.deepEqual(paths, ['docs/relative-guide.md', 'docs/unlisted-data.json', 'docs/unlisted-doc.md', 'docs/unlisted/joined.json',
    'scripts/lib/unlisted.mjs', 'scripts/unlisted-remedy.mjs', 'scripts/unlisted-spawn.mjs']);
  assert.ok(refs.every((r) => r.from && r.line > 0), 'each finding names the file and line that reaches it');
});

test('control: the same tree with everything listed has nothing to report', (t) => {
  const root = plantedTree(t);
  const all = { covers: ['tools/snowarch/', '.claude/skills/', 'scripts/', 'docs/'], excludes: [], ignores: [] };
  assert.deepEqual(unlistedReferences(root, { coverage: all, entries: ['tools/snowarch/bin/snowarch.mjs'],
    surfaces: ['.claude/skills/'], exceptions: [] }), []);
});

test('no shipped path runs through a test or fixture directory: a covered prefix cannot carry one in', () => {
  // A class assertion, not a list: packages/contract/lint/ is a covered prefix, and its tests/fixtures shipped under
  // it until the coverage excluded them. Any covered prefix that holds such a directory fails here, by name.
  const leaked = shippedFiles(REAL_ROOT)
    .filter((p) => p.split('/').slice(0, -1).some((dir) => /^(tests?|__tests__|spec|fixtures?)$/.test(dir)));
  assert.deepEqual(leaked, [], `${leaked.length} test or fixture file(s) ship`);
});

test('this tree: nothing the runtime reaches is left out of what ships', () => {
  // The guard over the real tree, in the suite as well as in the contract gate: a reference added anywhere fails here.
  const refs = unlistedReferences(REAL_ROOT);
  assert.deepEqual(refs.map((r) => `${r.path} — ${r.from}:${r.line} (${r.kind})`), []);
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
  assert.deepEqual(shipped, ['.claude/skills/x/SKILL.md', '.claude/skills/x/linked.md', 'tools/snowarch/bin/snowarch.mjs',
    'tools/snowarch/lib/a.mjs']);
  assert.equal(exportTree(root, out, COV), shipped.length);
  for (const rel of shipped) assert.deepEqual(readFileSync(join(out, rel)), readFileSync(join(root, rel)));
  assert.equal(existsSync(join(out, '.git')), false);
  assert.equal(existsSync(join(out, 'scripts')), false);
});

/** A small engineering repository with a corpus gitlink, a CRLF-attributed script and two annotated release tags. */
const PIN = 'a'.repeat(40);
function releaseTree(t) {
  const root = tempDir('snowarch-stage-src-', t);
  put(root, 'tools/snowarch/bin/snowarch.mjs', "console.log('x');\n");
  put(root, 'tools/snowarch/x.ps1', 'Write-Output a\nWrite-Output b\n');
  put(root, '.gitattributes', '*.ps1 text eol=crlf\n');
  put(root, '.gitmodules', '[submodule "vendor/ServiceNowDocs"]\n\tpath = vendor/ServiceNowDocs\n');
  put(root, 'tests/not-shipped.test.mjs', '\n');
  git(root, ['init', '-q', '-b', 'main']);
  git(root, ['add', '-A']);
  git(root, ['update-index', '--add', '--cacheinfo', `160000,${PIN},vendor/ServiceNowDocs`]);
  assert.match(git(root, ['ls-files', '--stage', 'vendor/ServiceNowDocs']), new RegExp(`^160000 ${PIN} 0\t`));
  git(root, ['commit', '-q', '-m', 'release one']);
  const tagged = (name, pin) => {
    put(root, `.tag-${name}`, `snowarch ${name}\n\ncontract: ${'c'.repeat(64)}\ndocs-pin: ${pin}\n`);
    execFileSync('git', ['-c', 'user.email=f@example.com', '-c', 'user.name=f', 'tag', '-a', '--no-sign',
      '--cleanup=verbatim', '-F', join(root, `.tag-${name}`), name], { cwd: root, stdio: 'pipe',
      env: { ...process.env, GIT_COMMITTER_DATE: '@1792243591 +0300' } });
  };
  tagged('v9.9.8', 'b'.repeat(40));   // its message disagrees with its tree
  tagged('v9.9.9', PIN);
  put(root, 'tools/snowarch/bin/snowarch.mjs', "console.log('y');\n");
  git(root, ['add', 'tools/snowarch/bin/snowarch.mjs']);   // not -a: the gitlink has no directory, and -a would drop it
  git(root, ['commit', '-q', '-m', 'release two']);
  tagged('v9.9.10', PIN);
  return root;
}
const SCOV = { covers: ['tools/snowarch/', '.gitattributes', '.gitmodules'], excludes: [], ignores: [] };
const at = (dir, args) => execFileSync('git', ['-C', dir, ...args], { encoding: 'utf8' }).trim();

test('stage is reproducible: the same tag twice gives the same commit and tag, blobs copied, never pushed', (t) => {
  const root = releaseTree(t);
  const [a, b] = [join(tempDir('snowarch-stage-a-', t), 'clone'), join(tempDir('snowarch-stage-b-', t), 'clone')];
  const one = stage(root, a, 'v9.9.9', { coverage: SCOV, tag: true });
  const two = stage(root, b, 'v9.9.9', { coverage: SCOV, tag: true });
  assert.equal(one.commit, two.commit, 'two stagings of one tag on one parent are one commit');
  assert.equal(at(a, ['rev-parse', 'v9.9.9']), at(b, ['rev-parse', 'v9.9.9']), 'and one tag object');
  assert.equal(one.parent, null);
  assert.equal(one.files, 4);
  // The blob, not a re-encoding: .gitattributes gives the script CRLF in a checkout, and its blob is the source's.
  assert.equal(at(a, ['rev-parse', 'HEAD:tools/snowarch/x.ps1']), at(root, ['rev-parse', 'v9.9.9:tools/snowarch/x.ps1']));
  assert.match(at(a, ['ls-tree', 'HEAD', 'vendor/ServiceNowDocs']), new RegExp(`^160000 commit ${PIN}\\t`));
  assert.equal(at(a, ['ls-tree', '--name-only', 'HEAD', 'tests']), '', 'nothing outside the coverage');
  const owner = 'Cvetomir Grigorov <cvetomirgrigorov@yahoo.bg>';   // NOTICE's name and contact
  assert.equal(at(a, ['log', '-1', '--format=%an <%ae>|%cn <%ce>|%s']), `${owner}|${owner}|v9.9.9`);
  assert.match(at(a, ['cat-file', '-p', 'v9.9.9']), new RegExp(`^tagger ${owner} 1792243591 \\+0300$`, 'm'));
  // Two stagings in one second would agree on the runner's clock too; the dates are the tag's, by construction.
  assert.equal(at(a, ['log', '-1', '--format=%at %ct']), '1792243591 1792243591');
  assert.equal(at(a, ['cat-file', '-p', 'v9.9.9']).split('\n\n').slice(1).join('\n\n'),
    at(root, ['cat-file', '-p', 'v9.9.9']).split('\n\n').slice(1).join('\n\n'), 'the tag message is verbatim');
  assert.equal(at(a, ['remote']), '', 'stage adds no remote and pushes nothing');
  assert.equal(at(a, ['status', '--porcelain']), '', 'the work tree is the commit');
});

test('stage puts the next release onto the clone\'s main, and refuses what would lose or misstate a release', (t) => {
  const root = releaseTree(t);
  const clone = join(tempDir('snowarch-stage-next-', t), 'clone');
  const first = stage(root, clone, 'v9.9.9', { coverage: SCOV, tag: true });
  assert.throws(() => stage(root, clone, 'v9.9.10', { coverage: SCOV }), /has history: name the new commit's parent/);
  const next = stage(root, clone, 'v9.9.10', { coverage: SCOV, onto: 'main', tag: true });
  assert.equal(next.parent, first.commit);
  assert.equal(at(clone, ['rev-parse', 'main']), next.commit);
  assert.throws(() => stage(root, clone, 'v9.9.10', { coverage: SCOV, onto: first.commit }), /not at --onto/);
  put(clone, 'tools/snowarch/bin/snowarch.mjs', 'edited\n');
  assert.throws(() => stage(root, clone, 'v9.9.10', { coverage: SCOV, onto: 'main' }), /uncommitted changes/);
  const fresh = join(tempDir('snowarch-stage-pin-', t), 'clone');
  assert.throws(() => stage(root, fresh, 'v9.9.8', { coverage: SCOV, tag: true }),
    new RegExp(`pins the corpus at ${'b'.repeat(40)}, its tree at ${PIN}`));
  assert.throws(() => stage(root, fresh, 'main', { coverage: SCOV, tag: true }), /--tag needs an annotated tag/);
});
