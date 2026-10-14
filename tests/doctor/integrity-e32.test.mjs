// Copyright 2026 Cvetomir Grigorov. Licensed under the Apache License, Version 2.0 (see LICENSE).
// snowarch — AI ServiceNow Architect. Not affiliated with or endorsed by ServiceNow, Inc.
// ARC-11-C7 — E-32, the build's integrity: the files a release ships, checked against the manifest the owner signs
// for its tag. In the quick set and offline, like E-31: it reads the cached manifest and hashes the covered files as
// they are on disk, and it never reaches the network itself.
//
// ARC-11-C141 — IN THE WORDS EVERY SURFACE USES. A tree that cannot be restored FAILs with the "Integrity: cannot
// restore — <reason>" line and its remedy, which the banner, the launcher and the server print as one line. A
// modified tree — which the launcher restores before `doctor` runs, so E-32 sees it only from another caller — FAILs
// fixable: `doctor --fix` puts the signed files back through the same function (integrity-restore).
//
// A release tree with NO manifest is a FAIL, not a warning (the architect's ruling, 2026-10-13): deleting the
// manifest is the cheapest tamper, so it must read as one. A development tree has no signed manifest to check, and
// skips.
//
// The release here is 9.1.0, the far-future version the upgrade e2e uses, because no test may spell the version the
// next release will carry (ARC-09-C12a).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { engineChecks } from '../../tools/snowarch/lib/doctor/checks/index.mjs';
import { FIXERS, TARGETS } from '../../tools/snowarch/lib/doctor/fix.mjs';
import { tempDir } from '../../tools/snowarch/tests/helpers/temp.mjs';
import { manifestFromArchive, signManifest, writeManifestCache } from '../../tools/snowarch/lib/licence/manifest.mjs';
import { keyPair, productKeys } from '../../tools/snowarch/tests/helpers/licence.mjs';
import { REAL_ROOT, greenTree, readJson, releaseTree } from './helpers/tree.mjs';

const NOW = new Date('2026-10-13T12:00:00Z');
const declared = () => engineChecks().filter((c) => c.id === 'E-32');

/** A green tree whose version of record is `version`, and nothing cached beside it. */
function treeAt(t, version) {
  return greenTree(t, { extra: { 'package.json': { ...readJson(REAL_ROOT, 'package.json'), version } } });
}

const ctxFor = (root) => ({ root, env: {}, platform: process.platform, home: '', flags: {}, now: () => NOW.getTime() });

/** E-32, or a failure that says it is not there — never a TypeError on `undefined.run`. */
function e32() {
  const [check] = declared();
  assert.ok(check, 'E-32 is not declared');
  return check;
}

test('ARC-11-C7 — E-32 is declared once: repo section, fail, quick, offline, spawns nothing, fixable (C141)', () => {
  assert.equal(declared().length, 1, `E-32 is declared ${declared().length} times`);
  const c = e32();
  assert.deepEqual(
    [c.section, c.severity, c.quick, c.network, c.spawns, c.fixable],
    ['repo', 'fail', true, false, false, true],
  );
});

test('ARC-11-C7 — a release tree with no signed manifest is a FAIL that names its tag', async (t) => {
  const r = await e32().run(ctxFor(treeAt(t, '9.1.0')));
  assert.equal(r.status, 'fail', r.detail);
  assert.equal(r.detail, 'Integrity: cannot restore — no signed manifest for v9.1.0');
  assert.match(r.remedy, /^Run .+ licence check --refresh to fetch it; if it says none is published, reinstall from a signed release tag\.$/);
  assert.match(r.command, /licence check --refresh$/);
});

test('ARC-11-C7 — a development tree has no signed manifest to check, and skips', async (t) => {
  const r = await e32().run(ctxFor(treeAt(t, '9.1.0-dev')));
  assert.equal(r.status, 'skip', r.detail);
});

// ── Green: the verify path (ARC-11-C7, decision b) ───────────────────────────────────────────────────────────────

const primary = keyPair();
const KEYS = productKeys(primary, keyPair());
const gitIn = (root, args) => execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: 'pipe' }).trim();

/** A release tree tagged v`version` as a release is, with `version`'s manifest signed by `key` in its cache. */
function signedTree(t, { version = '9.1.0', manifestVersion = version, key = primary } = {}) {
  const root = releaseTree(t, version);
  const manifest = { ...manifestFromArchive(root, `v${version}`), tag: `v${manifestVersion}` };
  writeManifestCache(root, { tag: `v${version}`, doc: signManifest(manifest, key.privateKey),
    checkedAt: NOW.toISOString(), source: 'a fixture' });
  return { root, manifest };
}

const run = (root) => e32().run({ ...ctxFor(root), licenceKeys: KEYS });

test('ARC-11-C7 — a release tree whose files are as signed is ok, naming the tag and the count', async (t) => {
  const { root, manifest } = signedTree(t);
  const n = Object.keys(manifest.files).length;
  assert.ok(n >= 4, `the fixture covers ${n} files`);
  const r = await run(root);
  assert.equal(r.status, 'ok', r.detail);
  assert.equal(r.detail, `Integrity: verified · v9.1.0 · ${n} files`);
  assert.deepEqual([r.data.state, r.data.tag, r.data.checked, r.data.modified], ['verified', 'v9.1.0', n, []]);
});

test('ARC-11-C7 — a modified release tree FAILs, naming the file, or the count and the first, and lists them all', async (t) => {
  const { root } = signedTree(t);
  writeFileSync(join(root, 'CLAUDE.md'), `${readFileSync(join(root, 'CLAUDE.md'), 'utf8')}one more line\n`);
  const one = await run(root);
  assert.equal(one.status, 'fail');
  assert.equal(one.detail, 'Integrity: modified — 1 file differs from the signed manifest for v9.1.0: CLAUDE.md');
  assert.match(one.remedy, /^Put the signed files back with .+ doctor --fix; .+ doctor --json lists every one\.$/);
  assert.match(one.command, /doctor --fix$/);
  assert.deepEqual([one.fixable, one.data.fix], [true, { kind: 'integrity-restore' }]);

  mkdirSync(join(root, '.claude/agents'), { recursive: true });
  writeFileSync(join(root, '.claude/agents/dropped.md'), 'an agent nobody shipped');
  const two = await run(root);
  assert.equal(two.detail, 'Integrity: modified — 2 files differ from the signed manifest for v9.1.0, the first .claude/agents/dropped.md');
  assert.deepEqual(two.data.modified, [{ path: '.claude/agents/dropped.md', why: 'extra' }, { path: 'CLAUDE.md', why: 'changed' }]);
});

test('ARC-11-C7 — another release\'s manifest FAILs, naming both, and the remedy fetches the right one', async (t) => {
  const { root } = signedTree(t, { manifestVersion: '9.0.0' });
  const r = await run(root);
  assert.equal(r.status, 'fail');
  assert.equal(r.detail, 'Integrity: cannot restore — the signed manifest is for v9.0.0, this checkout is v9.1.0');
  assert.match(r.remedy, /^Run .+ licence check --refresh to fetch it; if it says none is published, reinstall from a signed release tag\.$/);
  assert.match(r.command, /licence check --refresh$/);
});

test('ARC-11-C7 — a manifest for another commit than this checkout\'s own tag FAILs, naming both', async (t) => {
  const { root, manifest } = signedTree(t);
  writeFileSync(join(root, 'docs-page.md'), 'a later commit\n');
  gitIn(root, ['add', 'docs-page.md']);
  gitIn(root, ['commit', '-qm', 'later']);
  gitIn(root, ['tag', '-a', '-f', 'v9.1.0', '-m', 'v9.1.0, re-cut']);
  const moved = gitIn(root, ['rev-parse', 'v9.1.0^{commit}']);
  const r = await run(root);
  assert.equal(r.status, 'fail');
  assert.equal(r.detail, `Integrity: cannot restore — the signed manifest for v9.1.0 names commit ${manifest.commit.slice(0, 7)}, `
    + `and this checkout's v9.1.0 names ${moved.slice(0, 7)}`);
  assert.equal(r.remedy, 'Reinstall from a signed release tag.');
});

test('ARC-11-C7 — a cached manifest that does not verify FAILs with the reason, and is never used', async (t) => {
  const { root } = signedTree(t, { key: keyPair() });
  writeFileSync(join(root, 'CLAUDE.md'), 'changed, and nobody can tell from a forged manifest\n');
  const r = await run(root);
  assert.equal(r.status, 'fail');
  assert.equal(r.detail, 'Integrity: cannot restore — the signed manifest for v9.1.0 does not verify (not signed by a key this product ships)');
  assert.deepEqual(r.data.modified, []);
});

test('ARC-11-C7 — an rc is a release, and a tree with no version of record is a FAIL', async (t) => {
  const rc = await e32().run(ctxFor(treeAt(t, '9.1.0-rc.1')));
  assert.equal(rc.detail, 'Integrity: cannot restore — no signed manifest for v9.1.0-rc.1');
  const root = treeAt(t, '9.1.0');
  const pkg = readJson(root, 'package.json');
  delete pkg.version;
  writeFileSync(join(root, 'package.json'), `${JSON.stringify(pkg)}\n`);
  const none = await e32().run(ctxFor(root));
  assert.deepEqual([none.status, none.detail], ['fail', 'Integrity: cannot restore — package.json names no version']);
});

test('ARC-11-C141 — doctor --fix puts the signed files back (integrity-restore), keeping what it replaced', async (t) => {
  const was = process.env.SNOW_AUDIT_FILE;
  process.env.SNOW_AUDIT_FILE = join(tempDir('snowarch-e32-fix-audit-', t), 'audit.jsonl');
  t.after(() => { if (was === undefined) delete process.env.SNOW_AUDIT_FILE; else process.env.SNOW_AUDIT_FILE = was; });
  const { root } = signedTree(t);
  const signed = readFileSync(join(root, 'CLAUDE.md'), 'utf8');
  writeFileSync(join(root, 'CLAUDE.md'), `${signed}one more line\n`);
  const fixer = FIXERS.find((f) => f.kind === 'integrity-restore');
  assert.ok(fixer, 'no fixer takes integrity-restore');
  assert.equal(TARGETS['integrity-restore'], 'the covered files E-32 names; what it replaces is kept in .local/integrity-removed/');
  const r = await fixer.apply({ root, ctx: { ...ctxFor(root), licenceKeys: KEYS }, kind: 'integrity-restore' });
  assert.equal(r.result, 'applied', r.detail);
  assert.match(r.detail, /^Integrity: restored — /);
  assert.equal(readFileSync(join(root, 'CLAUDE.md'), 'utf8'), signed);
  assert.equal((await run(root)).status, 'ok');
  assert.equal((await fixer.apply({ root, ctx: { ...ctxFor(root), licenceKeys: KEYS }, kind: 'integrity-restore' })).result, 'noop');
});
