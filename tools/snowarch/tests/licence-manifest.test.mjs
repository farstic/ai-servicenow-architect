// Copyright 2026 Cvetomir Grigorov. Licensed under the Business Source License 1.1 (see LICENSE).
// snowarch — AI ServiceNow Architect. Not affiliated with or endorsed by ServiceNow, Inc.
// ARC-11-C7 — the manifest's format, and the hash of a checkout's bytes.
//
// A fixture repository in the product's shape is archived and checked out here. The bytes `git archive` writes are
// the bytes a checkout writes: a `.ps1` is CRLF in both by `.gitattributes`, and a mode bit is in neither hash. The
// last case runs the same comparison on THIS repository, on whichever platform runs the suite, which is where the
// claim that one manifest fits all three operating systems is proved.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { chmodSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  COVERAGE, MANIFEST_FORMAT, archiveDiffers, checkTree, hashBytes, isCovered, manifestFromArchive, readManifest,
  signManifest,
} from '../lib/licence/manifest.mjs';
import { keyPair, productKeys } from './helpers/licence.mjs';
import { tempDir } from './helpers/temp.mjs';

const REAL_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const primary = keyPair();
const KEYS = productKeys(primary, keyPair());

const ENV = { ...process.env, GIT_AUTHOR_NAME: 'fixture', GIT_AUTHOR_EMAIL: 'fixture@example.invalid',
  GIT_COMMITTER_NAME: 'fixture', GIT_COMMITTER_EMAIL: 'fixture@example.invalid' };
const git = (cwd, args) => execFileSync('git', args, { cwd, env: ENV, encoding: 'utf8', stdio: 'pipe' }).trim();

/** Two paths past ustar's 100-character name: one git splits into the prefix field, one it writes in a pax header. */
const LONG = `.claude/skills/${'a-skill-whose-directory-name-is-long-enough-'.repeat(2)}x/SKILL.md`;
const PAX = `.claude/skills/s/${'n'.repeat(101)}.md`;

/** Every committed file of the fixture, LF as committed. */
const FILES = {
  '.gitattributes': '* text=auto eol=lf\n*.ps1 text eol=crlf\n',
  'package.json': '{ "version": "9.1.0" }\n',
  'engine.config.json': '{}\n',
  'CLAUDE.md': '# fixture\n',
  '.claude/settings.json': '{}\n',
  '.claude/rules/00.md': 'a rule\n',
  '.claude/agents/a.md': 'an agent\n',
  '.claude/skills/s/SKILL.md': 'a skill\n',
  [LONG]: 'a skill with a long path\n',
  [PAX]: 'a file whose name alone is past 100 characters\n',
  'packages/snowarch/dist/index.js': 'export {};\n',
  'tools/snowarch/lib/a.mjs': 'export const a = 1;\n',
  'tools/snowarch/launcher/recipe.ps1': 'Write-Output one\nWrite-Output two\n',
  'tools/snowarch/bin/run.mjs': '#!/usr/bin/env node\n',
  'tools/snowarch/tests/a.test.mjs': 'a test\n',
  'docs/page.md': 'a page\n',
};
const COVERED = Object.keys(FILES).filter((p) => isCovered(p, COVERAGE)).sort();

/** The fixture repository, committed and tagged v9.1.0 as a release is, and a checkout of the tag beside it. */
function fixture(t, extra = {}) {
  const base = tempDir('snowarch-manifest-', t);
  const repo = join(base, 'repo');
  mkdirSync(repo);
  git(repo, ['init', '-q', '--initial-branch=main']);
  git(repo, ['config', 'core.longpaths', 'true']);
  for (const [path, content] of Object.entries({ ...FILES, ...extra })) {
    mkdirSync(dirname(join(repo, path)), { recursive: true });
    writeFileSync(join(repo, path), content);
  }
  git(repo, ['add', '-A']);
  git(repo, ['update-index', '--chmod=+x', 'tools/snowarch/bin/run.mjs']);
  git(repo, ['commit', '-q', '-m', 'v9.1.0']);
  git(repo, ['tag', '-a', 'v9.1.0', '-m', 'v9.1.0']);
  const tree = join(base, 'tree');
  git(base, ['-c', 'core.longpaths=true', 'clone', '-q', '--branch', 'v9.1.0', repo, tree]);
  return { repo, tree, commit: git(repo, ['rev-parse', 'v9.1.0^{commit}']) };
}

const signed = (manifest, key = primary) => signManifest(manifest, key.privateKey);

test('ARC-11-C7 — the manifest of a tag covers what the row covers, from the bytes a checkout writes', (t) => {
  const { repo, tree, commit } = fixture(t);
  const m = manifestFromArchive(repo, 'v9.1.0');
  assert.deepEqual(Object.keys(m.files).sort(), COVERED);
  assert.ok(COVERED.includes(LONG) && COVERED.includes(PAX), 'both long paths are covered');
  assert.ok(!COVERED.includes('tools/snowarch/tests/a.test.mjs') && !COVERED.includes('docs/page.md'));
  assert.deepEqual([m.tag, m.commit], ['v9.1.0', commit]);
  assert.deepEqual([m.covers, m.excludes, m.ignores], [[...COVERAGE.covers], [...COVERAGE.excludes], [...COVERAGE.ignores]]);
  // CRLF by `.gitattributes`, in the archive and in the checkout alike, and the hash is of those bytes.
  const ps1 = readFileSync(join(tree, 'tools/snowarch/launcher/recipe.ps1'));
  assert.equal(ps1.toString('utf8'), 'Write-Output one\r\nWrite-Output two\r\n');
  assert.equal(m.files['tools/snowarch/launcher/recipe.ps1'], hashBytes(ps1));
  for (const path of COVERED) assert.equal(m.files[path], hashBytes(readFileSync(join(tree, ...path.split('/')))), path);
});

test('ARC-11-C7 — a mode bit is not in the hash: the executable file hashes as its bytes', (t) => {
  const { repo } = fixture(t);
  const m = manifestFromArchive(repo, 'v9.1.0');
  assert.equal(git(repo, ['ls-files', '-s', 'tools/snowarch/bin/run.mjs']).split(' ')[0], '100755');
  assert.equal(m.files['tools/snowarch/bin/run.mjs'], hashBytes(Buffer.from('#!/usr/bin/env node\n')));
});

test('ARC-11-C7 — a signed manifest reads back; any other content, key or shape does not', (t) => {
  const { repo } = fixture(t);
  const m = manifestFromArchive(repo, 'v9.1.0');
  const good = readManifest(JSON.stringify(signed(m)), { keys: KEYS });
  assert.deepEqual([good.ok, good.key, good.manifest.tag], [true, 'primary', 'v9.1.0']);

  const doc = signed(m);
  doc.manifest = { ...m, files: { ...m.files, 'CLAUDE.md': '0'.repeat(64) } };
  assert.deepEqual(readManifest(doc, { keys: KEYS }), { ok: false, reason: 'the signature does not match the content' });
  assert.deepEqual(readManifest(signed(m, keyPair()), { keys: KEYS }),
    { ok: false, reason: 'not signed by a key this product ships' });
  assert.match(readManifest('{', { keys: KEYS }).reason, /not JSON/);
  assert.match(readManifest({ ...signed(m), format: 'snowarch-licence/1' }, { keys: KEYS }).reason,
    new RegExp(`not a ${MANIFEST_FORMAT} manifest`));

  const shape = (over) => readManifest(signed({ ...m, ...over }), { keys: KEYS }).reason;
  assert.match(shape({ tag: 'HEAD' }), /the tag is not v/);
  assert.match(shape({ commit: 'abc' }), /not a full sha/);
  assert.match(shape({ covers: [] }), /covers is empty/);
  assert.match(shape({ excludes: ['../x/'] }), /not relative/);
  assert.match(shape({ files: {} }), /files is empty/);
  assert.match(shape({ files: { 'docs/page.md': '0'.repeat(64) } }), /not under what the manifest covers/);
  assert.match(shape({ files: { 'CLAUDE.md': 'sha256:00' } }), /not sha256 hex/);
  assert.match(shape({ files: { 'tools/snowarch/../x.mjs': '0'.repeat(64) } }), /not a relative path/);
});

test('ARC-11-C7 — a checkout of the tag is unmodified, and every kind of difference is named', (t) => {
  const { repo, tree } = fixture(t);
  const m = manifestFromArchive(repo, 'v9.1.0');
  assert.deepEqual(checkTree(tree, m), { ok: true, checked: COVERED.length, modified: [] });

  // Not the product's: an operating system's file, an excluded directory, and a path nothing covers.
  writeFileSync(join(tree, '.claude/skills/.DS_Store'), 'finder');
  writeFileSync(join(tree, 'tools/snowarch/tests/new.test.mjs'), 'a new test');
  writeFileSync(join(tree, 'docs/new.md'), 'a new page');
  if (process.platform !== 'win32') chmodSync(join(tree, 'tools/snowarch/lib/a.mjs'), 0o755);
  assert.deepEqual(checkTree(tree, m).modified, []);

  writeFileSync(join(tree, 'tools/snowarch/lib/a.mjs'), 'export const a = 2;\n');
  rmSync(join(tree, '.claude/skills/s/SKILL.md'));
  mkdirSync(join(tree, '.claude/skills/dropped'));
  writeFileSync(join(tree, '.claude/skills/dropped/SKILL.md'), 'a dropped-in skill');
  writeFileSync(join(tree, 'CLAUDE.md'), '# fixture\r\n');
  const r = checkTree(tree, m);
  assert.equal(r.ok, false);
  assert.deepEqual(r.modified, [
    { path: '.claude/skills/dropped/SKILL.md', why: 'extra' },
    { path: '.claude/skills/s/SKILL.md', why: 'missing' },
    { path: 'CLAUDE.md', why: 'changed' },
    { path: 'tools/snowarch/lib/a.mjs', why: 'changed' },
  ]);
});

test('ARC-11-C7 — on this platform, git archive writes the bytes this checkout holds, for every covered file', () => {
  // Files this checkout has changed are not the comparison's: they differ from HEAD on purpose.
  const changed = new Set(git(REAL_ROOT, ['diff', '--name-only', 'HEAD', '--', ...COVERAGE.covers]).split('\n').filter(Boolean));
  const m = manifestFromArchive(REAL_ROOT, 'HEAD');
  const compared = Object.entries(m.files).filter(([path]) => !changed.has(path));
  // An instrument that compared nothing would pass: the product covers hundreds of files, and one of them is CRLF.
  assert.ok(compared.length > 300, `compared ${compared.length} files`);
  const ps1 = 'tools/snowarch/launcher/docs-recipe.ps1';
  if (m.files[ps1] && !changed.has(ps1)) assert.ok(readFileSync(join(REAL_ROOT, ps1)).includes('\r\n'), `${ps1} is CRLF`);
  const differ = compared.filter(([path, hash]) => hashBytes(readFileSync(join(REAL_ROOT, ...path.split('/')))) !== hash)
    .map(([path]) => path);
  assert.deepEqual(differ, [], `git archive and this ${process.platform} checkout disagree`);
});

// ── ARC-09-C192 — a manifest is compared on the coverage it carries ───────────────────────────────────────────────

/**
 * v2.2.0's COVERAGE, as that tag's packages/snowarch/src/licence/integrity.ts has it: what its manifests were signed
 * with, and what a 2.2.0 install compares a release with.
 */
const V2_2_0 = Object.freeze({
  covers: ['packages/snowarch/dist/', 'tools/snowarch/', 'CLAUDE.md', '.claude/rules/', '.claude/skills/',
    '.claude/agents/', '.claude/settings.json', 'engine.config.json', 'package.json'],
  excludes: ['tools/snowarch/tests/'],
  ignores: ['.DS_Store', 'Thumbs.db', 'desktop.ini'],
});

/** Files 2.2.1's coverage reaches and 2.2.0's does not. */
const WIDER = { 'governance/governance-rules.md': '# rules\n', 'templates/adr.md': '# ADR\n',
  'docs/INSTALL.md': '# install\n', 'README.md': '# readme\n', '.editorconfig': 'root = true\n' };

test('ARC-09-C192 — a manifest is compared on the coverage it carries, whichever release reads it', (t) => {
  const { repo, commit } = fixture(t, WIDER);
  const older = manifestFromArchive(repo, 'v9.1.0', { coverage: V2_2_0 });
  const newer = manifestFromArchive(repo, 'v9.1.0');
  // The precondition: the two coverages disagree on this tree, or nothing below is about coverage.
  for (const p of Object.keys(WIDER)) {
    assert.ok(p in newer.files && !(p in older.files), `${p} does not separate the two coverages`);
  }
  // (a) An older release's manifest, read by this code: the files it covers are its own, and the files it never
  //     covered are not missing from it. This is a 2.2.1 install moving back to 2.2.0.
  assert.equal(archiveDiffers(repo, 'v9.1.0', older), null);
  // (b) This release's manifest, read by this code.
  assert.equal(archiveDiffers(repo, 'v9.1.0', newer), null);
  // (c) A covered file altered is still found, under either coverage.
  assert.equal(archiveDiffers(repo, 'v9.1.0', { ...older, files: { ...older.files, 'CLAUDE.md': '0'.repeat(64) } }),
    "1 file in the published manifest differs from v9.1.0's own, the first CLAUDE.md");
  assert.equal(archiveDiffers(repo, 'v9.1.0', { ...newer, files: { ...newer.files, 'README.md': '0'.repeat(64) } }),
    "1 file in the published manifest differs from v9.1.0's own, the first README.md");
  // (d) Another commit is refused as before, before any file is compared.
  assert.equal(archiveDiffers(repo, 'v9.1.0', { ...older, commit: 'b'.repeat(40) }),
    `the published manifest names bbbbbbb, and v9.1.0 here is ${commit.slice(0, 7)}`);
});
