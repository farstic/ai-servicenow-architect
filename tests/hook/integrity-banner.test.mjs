// Copyright 2026 Cvetomir Grigorov. Licensed under the Apache License, Version 2.0 (see LICENSE).
// snowarch — AI ServiceNow Architect. Not affiliated with or endorsed by ServiceNow, Inc.
// ARC-11-C141 (was C7's "the hook never hashes") — the SessionStart hook checks the checkout's own files at every start
// on a STAT KEY: a `stat` per covered file when nothing moved, and only the files whose stamp moved read and hashed.
// A change is put back and the banner says so, third, after the Licence line; a tree that cannot be restored prints
// its "cannot restore" line there, which the CLAUDE.md sentence keys on (the owner's ruling, 2026-10-14; the
// architect's Q3, R5, R6). The proof of cost stays `scripts/ci/hook-compare.mjs`'s +25 ms.
//
// THE INSTRUMENT: a release tree whose signed manifest covers a SENTINEL, a file nothing but an integrity check reads,
// and a child hook whose every `fs` read, and every `stat`, is traced. The manifest verifies in the child (it trusts the
// fixture key), and its tag and commit are the checkout's own. Each case asserts the trace saw the run, so a pass is
// not the trace of a run that never happened.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { COVERAGE, isCovered, manifestFromArchive, signManifest, writeManifestCache } from '../../tools/snowarch/lib/licence/manifest.mjs';
import { licenceFixture, licensedEnv } from '../../tools/snowarch/tests/helpers/licence-hook/index.mjs';
import { readTraceImport } from '../../tools/snowarch/tests/helpers/read-trace.mjs';
import { tempDir } from '../../tools/snowarch/tests/helpers/temp.mjs';
import { LINKED, REAL_ROOT, linkInstall, readJson, releaseTree } from '../doctor/helpers/tree.mjs';

const SENTINEL = 'tools/snowarch/e32-sentinel.txt';
const STDIN = '{"hook_event_name":"SessionStart","source":"startup"}';

/**
 * The coverage with the fixture's LINKED install excluded. A linked directory under a covered one is a link to this
 * checkout, not a file the release shipped, so a fixture's manifest leaves it out as a signed manifest may — and a
 * restore never writes through it (the link guard refuses first).
 */
const FIXTURE_COVERAGE = { ...COVERAGE,
  excludes: [...COVERAGE.excludes, ...LINKED.map((p) => `${p}/`).filter((p) => isCovered(`${p}x`, COVERAGE))] };

/** A release tree, v9.1.0, linked so its CLI and hook run, with its manifest signed by the fixture key. */
function signedRelease(t, { files = {} } = {}) {
  const root = releaseTree(t, '9.1.0', { files });
  const manifest = manifestFromArchive(root, 'v9.1.0', { coverage: FIXTURE_COVERAGE });
  writeManifestCache(root, { tag: 'v9.1.0', doc: signManifest(manifest, licenceFixture().primary.privateKey),
    checkedAt: '2026-10-13T12:00:00.000Z', source: 'a fixture' });
  linkInstall(root);
  return { root, manifest };
}

const HOOK = (root) => join(root, 'tools/snowarch/hooks/session-start.mjs');
const child = (root, args, extra = {}) => spawnSync(process.execPath, args, { cwd: root, input: STDIN, encoding: 'utf8',
  env: licensedEnv({ ...process.env, CLAUDE_PROJECT_DIR: root, SNOWARCH_BANNER_PHASES: '1',
    SNOW_AUDIT_FILE: join(root, '.local', 'audit-under-test.jsonl'), ...extra }, { root }) });
const bannerOf = (r) => r.stdout.trim().split('\n');

/** The hook, with its reads and its stats traced: each as the set of covered files, relative to the checkout. */
function traced(t, root) {
  const dir = tempDir('snowarch-hook-trace-', t);
  const [reads, stats] = [join(dir, 'reads.txt'), join(dir, 'stats.txt')];
  const env = licensedEnv({ ...process.env, CLAUDE_PROJECT_DIR: root, SNOWARCH_BANNER_PHASES: '1',
    SNOW_AUDIT_FILE: join(root, '.local', 'audit-under-test.jsonl'),
    SNOWARCH_TEST_READ_TRACE: reads, SNOWARCH_TEST_STAT_TRACE: stats }, { root });
  env.NODE_OPTIONS = `${env.NODE_OPTIONS} ${readTraceImport()}`;
  const r = spawnSync(process.execPath, [HOOK(root)], { cwd: root, input: STDIN, encoding: 'utf8', env });
  const real = realpathSync(root).replace(/\\/g, '/');
  const covered = (file) => readFileSync(file, 'utf8').split('\n').filter(Boolean)
    .map((p) => p.replace(/\\/g, '/'))
    .map((p) => (p.startsWith(`${real}/`) ? p.slice(real.length + 1) : null))
    .filter((p) => p !== null && isCovered(p, FIXTURE_COVERAGE));
  // A READ here is a covered file's bytes. Two reads are not that, and are left out by name: a covered directory's
  // listing (the stat key's walk, which is how an added file is seen), and package.json, the version of record, which
  // every start reads to know which release this is.
  const content = (p) => !p.endsWith('/') && p !== 'package.json';
  return { r, reads: [...new Set(covered(reads))].filter(content).sort(), stats: [...new Set(covered(stats))].sort(),
    traced: readFileSync(reads, 'utf8').split('\n').filter(Boolean).length };
}

test('ARC-11-C141 — on a verified tree the hook stats every covered file and reads none; an edit is read alone', (t) => {
  const { root, manifest } = signedRelease(t, { files: { [SENTINEL]: 'read by an integrity check alone\n' } });
  assert.ok(SENTINEL in manifest.files, 'the manifest covers the sentinel');
  // The first start has no stat key yet: it hashes everything once, finds the tree verified, and records the key.
  const first = child(root, [HOOK(root)]);
  assert.equal(first.status, 0, first.stderr);
  assert.equal(bannerOf(first).some((l) => l.startsWith('Integrity:')), false, first.stdout);

  const quiet = traced(t, root);
  assert.equal(quiet.r.status, 0, quiet.r.stderr);
  assert.ok(quiet.traced > 20, `the trace saw ${quiet.traced} reads`);
  assert.deepEqual(quiet.reads, [], 'a start with nothing moved read a covered file');
  const files = Object.keys(manifest.files).sort();
  assert.deepEqual(files.filter((p) => !quiet.stats.includes(p)), [], 'a covered file was not stat\'d');
  t.diagnostic(`stat key: ${quiet.stats.length} covered files stat'd, ${quiet.reads.length} read`);

  // One file changed: it, and only it, is read — to find the difference and to check the restored bytes.
  writeFileSync(join(root, SENTINEL), 'changed\n');
  const moved = traced(t, root);
  assert.deepEqual(moved.reads, [SENTINEL], `the hook read more than the one file that moved: ${moved.reads.join(', ')}`);
  assert.match(bannerOf(moved.r)[2] ?? '', /^Integrity: restored — The AI Architect's own files are not yours to change under this licence: 1 file restored from v9\.1\.0, 0 moved to \.local\/integrity-removed\/\d{8}T\d{6}Z\/ \(tools\/snowarch\/e32-sentinel\.txt\)\. Your own material belongs under clients\/<name>\/\.$/,
    moved.r.stdout);
  assert.equal(readFileSync(join(root, SENTINEL), 'utf8'), 'read by an integrity check alone\n');
});

test('ARC-11-C141 — a changed CLAUDE.md is put back at the start; the banner says so third, with "restart claude"', (t) => {
  const { root } = signedRelease(t);
  const signed = readFileSync(join(root, 'CLAUDE.md'), 'utf8');
  writeFileSync(join(root, 'CLAUDE.md'), `${signed}one more line\n`);
  const lines = bannerOf(child(root, [HOOK(root)]));
  assert.ok(lines[1].startsWith('Licence:'), lines.join('\n'));
  assert.match(lines[2], /^Integrity: restored — .* \(CLAUDE\.md\)\. Your own material belongs under clients\/<name>\/\. — restart claude$/,
    lines.join('\n'));
  assert.equal(readFileSync(join(root, 'CLAUDE.md'), 'utf8'), signed);
  // Said once: the next start finds the tree verified and says nothing.
  assert.equal(bannerOf(child(root, [HOOK(root)])).some((l) => l.startsWith('Integrity:')), false);
});

test('ARC-11-C141 — a tree that cannot be restored: the banner prints its "cannot restore" line third', (t) => {
  const { root } = signedRelease(t);
  rmSync(join(root, '.local', 'release-manifest.json'));
  const lines = bannerOf(child(root, [HOOK(root)]));
  assert.ok(lines[1].startsWith('Licence:'), lines.join('\n'));
  assert.match(lines[2], /^Integrity: cannot restore — no signed manifest for v9\.1\.0 — Run .+ licence check --refresh to fetch it; if it says none is published, reinstall from a signed release tag\.$/,
    lines.join('\n'));
});

test('ARC-11-C7 — a verified tree: status prints it verified, and the banner prints no Integrity line', (t) => {
  const { root } = signedRelease(t);
  const status = child(root, [join(REAL_ROOT, 'tools/snowarch/bin/snowarch.mjs'), 'status']);
  assert.match(status.stdout, /^Integrity: verified · v9\.1\.0 · \d+ files$/m, status.stdout + status.stderr);
  assert.equal(readJson(root, '.local/doctor-last.json').checks.find((c) => c.id === 'E-32').status, 'ok');
  const banner = bannerOf(child(root, [HOOK(root)]));
  assert.ok(banner[1].startsWith('Licence:'), banner.join('\n'));
  assert.equal(banner.some((l) => l.startsWith('Integrity:')), false, banner.join('\n'));
});
