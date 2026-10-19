// Copyright 2026 Cvetomir Grigorov. Licensed under the Business Source License 1.1 (see LICENSE).
// snowarch — AI ServiceNow Architect. Not affiliated with or endorsed by ServiceNow, Inc.
/**
 * ARC-09-C185a — the signed manifest over what a user receives.
 *
 *   1. The larger set: a release's manifest covers governance/, templates/, the runtime scripts and the user docs, so
 *      E-32 names a changed one and `doctor --fix` puts it back.
 *   2. An older manifest — signed before the coverage grew — still verifies against the coverage it stores.
 *   3. R5: `licence sign-release` inside a staged distribution clone signs the staged commit, and E-32 verifies there.
 *   4. R4: a staged tree with no tag (what the release workflow's verify job installs) verifies by its file hashes,
 *      and E-32's line says verified — never "development tree".
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { engineChecks } from '../tools/snowarch/lib/doctor/checks/index.mjs';
import { FIXERS } from '../tools/snowarch/lib/doctor/fix.mjs';
import { licenceCommand } from '../tools/snowarch/lib/commands/licence.mjs';
import { manifestFromArchive, readManifest, signManifest, writeManifestCache } from '../tools/snowarch/lib/licence/manifest.mjs';
import { tempDir } from '../tools/snowarch/tests/helpers/temp.mjs';
import { stage } from '../scripts/lib/distribution.mjs';
import { releaseTree } from './doctor/helpers/tree.mjs';

const NOW = new Date('2026-10-19T12:00:00Z');
const PIN = 'a'.repeat(40);
const gitIn = (root, args) => execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: 'pipe' }).trim();
const E32 = engineChecks().find((c) => c.id === 'E-32');
const run = (root, keys) => E32.run({ root, env: {}, platform: process.platform, home: '', flags: {},
  now: () => NOW.getTime(), licenceKeys: keys });

/** The coverage before ARC-09-C185a, as integrity.ts held it: what a 2.2.0 or 2.2.1 manifest stores. */
const BEFORE = Object.freeze({
  covers: ['packages/snowarch/dist/', 'tools/snowarch/', 'CLAUDE.md', '.claude/rules/', '.claude/skills/',
    '.claude/agents/', '.claude/settings.json', 'engine.config.json', 'package.json'],
  excludes: ['tools/snowarch/tests/'],
  ignores: ['.DS_Store', 'Thumbs.db', 'desktop.ini'],
});

/** Files a release ships since the coverage grew, and one it does not. */
const FILES = {
  'governance/taxonomy.md': '# Taxonomy\n',
  'templates/adr.md': '# ADR\n',
  'scripts/docs.mjs': '// the docs CLI\n',
  'docs/INSTALL.md': '# Install\n',
  'tests/engineering-only.test.mjs': '// not shipped\n',
};

/** A keygen'd primary key outside every checkout, and the product key list that ships its public half. */
async function ownerKeys(t) {
  const root = tempDir('snowarch-dist-keys-root-', t);
  const outside = tempDir('snowarch-dist-keys-', t);
  const out = join(outside, 'primary.pem');
  const code = await licenceCommand({ positional: ['keygen'], log: quiet().log, root, env: {}, now: () => NOW,
    config: {}, flags: { out, 'recovery-out': join(outside, 'recovery', 'recovery.pem'), to: 'Test Owner', org: 'Test Org' } });
  assert.equal(code, 0, 'keygen');
  return { out, outside, keys: JSON.parse(readFileSync(join(outside, 'public-keys.json'), 'utf8')).keys };
}

function quiet() {
  const lines = [];
  const push = (kind) => (m) => { lines.push(`${kind}: ${m}`); };
  return { lines, log: { step: push('step'), ok: push('ok'), note: push('note'), warn: push('warn'), fail: push('fail'),
    debug: () => {}, json: () => {} } };
}

/** An engineering release tree at v9.1.0 with the corpus gitlink, tagged with a message whose docs-pin agrees. */
function releaseSource(t) {
  const root = releaseTree(t, '9.1.0', { files: FILES });
  gitIn(root, ['update-index', '--add', '--cacheinfo', `160000,${PIN},vendor/ServiceNowDocs`]);
  assert.match(gitIn(root, ['ls-files', '--stage', 'vendor/ServiceNowDocs']), new RegExp(`^160000 ${PIN} 0\\t`));
  gitIn(root, ['commit', '-qm', 'the corpus gitlink']);
  gitIn(root, ['tag', '-d', 'v9.1.0']);
  assert.equal(gitIn(root, ['tag', '--list', 'v9.1.0']), '', 'the first tag is gone');
  const message = join(tempDir('snowarch-dist-tagmsg-', t), 'message');
  writeFileSync(message, `snowarch v9.1.0\n\ncontract: ${'c'.repeat(64)}\ndocs-pin: ${PIN}\n`);
  gitIn(root, ['tag', '-a', '--no-sign', '--cleanup=verbatim', '-F', message, 'v9.1.0']);
  assert.match(gitIn(root, ['cat-file', '-p', 'v9.1.0']), new RegExp(`^docs-pin: ${PIN}$`, 'm'));
  return root;
}

const cache = (root, doc) => writeManifestCache(root, { tag: 'v9.1.0', doc, checkedAt: NOW.toISOString(), source: 'a fixture' });

test('the larger set: a release manifest covers governance, templates, the runtime scripts and the user docs, and a restore puts one back', async (t) => {
  const { out, keys } = await ownerKeys(t);
  const root = releaseSource(t);
  const manifest = manifestFromArchive(root, 'v9.1.0');
  for (const rel of ['governance/taxonomy.md', 'templates/adr.md', 'scripts/docs.mjs', 'docs/INSTALL.md',
    'packages/snowarch/package.json']) {
    assert.ok(manifest.files[rel], `${rel} is covered`);
  }
  assert.equal(manifest.files['tests/engineering-only.test.mjs'], undefined, 'tests/ is not');
  cache(root, signManifest(manifest, readFileSync(out, 'utf8')));
  assert.equal((await run(root, keys)).status, 'ok');

  const signed = readFileSync(join(root, 'governance/taxonomy.md'), 'utf8');
  writeFileSync(join(root, 'governance/taxonomy.md'), `${signed}an edit\n`);
  const modified = await run(root, keys);
  assert.equal(modified.status, 'fail');
  assert.match(modified.detail, /1 file differs from the signed manifest for v9\.1\.0: governance\/taxonomy\.md$/);
  const fixer = FIXERS.find((f) => f.kind === 'integrity-restore');
  const was = process.env.SNOW_AUDIT_FILE;
  process.env.SNOW_AUDIT_FILE = join(tempDir('snowarch-dist-audit-', t), 'audit.jsonl');
  t.after(() => { if (was === undefined) delete process.env.SNOW_AUDIT_FILE; else process.env.SNOW_AUDIT_FILE = was; });
  const r = await fixer.apply({ root, kind: 'integrity-restore', ctx: { root, env: {}, platform: process.platform,
    home: '', flags: {}, now: () => NOW.getTime(), licenceKeys: keys } });
  assert.equal(r.result, 'applied', r.detail);
  assert.equal(readFileSync(join(root, 'governance/taxonomy.md'), 'utf8'), signed);
  assert.equal((await run(root, keys)).status, 'ok');
});

test('a manifest signed before the coverage grew verifies against the coverage it stores, not today\'s', async (t) => {
  const { out, keys } = await ownerKeys(t);
  const root = releaseSource(t);
  const older = manifestFromArchive(root, 'v9.1.0', { coverage: BEFORE });
  assert.equal(older.files['governance/taxonomy.md'], undefined, 'the older coverage leaves governance out');
  cache(root, signManifest(older, readFileSync(out, 'utf8')));
  const verified = await run(root, keys);
  assert.equal(verified.status, 'ok', verified.detail);
  assert.equal(verified.data.checked, Object.keys(older.files).length, 'it checked the files its own coverage names');

  // A file only today's coverage names is not the older manifest's business; a file it names still is.
  writeFileSync(join(root, 'governance/taxonomy.md'), 'an edit the older manifest does not cover\n');
  assert.equal((await run(root, keys)).status, 'ok');
  writeFileSync(join(root, 'CLAUDE.md'), `${readFileSync(join(root, 'CLAUDE.md'), 'utf8')}an edit\n`);
  const changed = await run(root, keys);
  assert.equal(changed.status, 'fail');
  assert.match(changed.detail, /: CLAUDE\.md$/);
});

test('R5 and R4: sign-release inside a staged clone signs the staged commit; a staged tree with no tag verifies by its hashes', async (t) => {
  const { out, outside, keys } = await ownerKeys(t);
  const src = releaseSource(t);

  // R5 — the owner signs in the distribution clone: the manifest names the commit the distribution tag names.
  const clone = join(tempDir('snowarch-dist-signed-', t), 'snowarch');
  const staged = stage(src, clone, 'v9.1.0', { tag: true });
  const list = join(outside, 'licences');
  mkdirSync(list);
  const signer = quiet();
  const code = await licenceCommand({ positional: ['sign-release', 'v9.1.0'], flags: { key: out, list }, log: signer.log,
    root: clone, env: {}, now: () => NOW, config: {}, keys });
  assert.equal(code, 0, signer.lines.join('\n'));
  const doc = readFileSync(join(list, 'releases', 'v9.1.0.json'), 'utf8');
  const read = readManifest(doc, { keys });
  assert.equal(read.ok, true);
  assert.equal(read.manifest.commit, staged.commit, 'the manifest names the staged commit');
  assert.equal(Object.keys(read.manifest.files).length, staged.files, 'it covers every staged file');
  cache(clone, JSON.parse(doc));
  const inClone = await run(clone, keys);
  assert.equal(inClone.status, 'ok', inClone.detail);
  assert.equal(inClone.detail, `Integrity: verified · v9.1.0 · ${staged.files} files`);

  // R4 — the verify job's tree: the same ref staged with no tag. There is no local tag to compare commits with, so
  // E-32 verifies the files by their hashes, and its line says so as for any release.
  const untagged = join(tempDir('snowarch-dist-untagged-', t), 'snowarch');
  const again = stage(src, untagged, 'v9.1.0');
  assert.equal(gitIn(untagged, ['tag', '--list']), '', 'no tag in the verify tree');
  assert.equal(again.commit, staged.commit, 'staging is reproducible: the same commit, tag or no tag');
  cache(untagged, JSON.parse(doc));
  const hashed = await run(untagged, keys);
  assert.equal(hashed.status, 'ok', hashed.detail);
  assert.equal(hashed.detail, `Integrity: verified · v9.1.0 · ${staged.files} files`);
  assert.doesNotMatch(hashed.detail, /development/);
  // ...and a changed file there is still found: hashes, not a tag, are what verified it.
  writeFileSync(join(untagged, 'governance/taxonomy.md'), 'an edit\n');
  assert.equal((await run(untagged, keys)).status, 'fail');
});
