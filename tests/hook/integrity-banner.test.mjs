// Copyright 2026 Cvetomir Grigorov. Licensed under the Business Source License 1.1 (see LICENSE).
// snowarch — AI ServiceNow Architect. Not affiliated with or endorsed by ServiceNow, Inc.
// ARC-11-C7 — the SessionStart hook never hashes. E-32 is the one quick check that reads every covered file, and the
// hook's re-run of the quick doctor leaves it out by name, so a session start costs what it cost before C7.
//
// THE INSTRUMENT: a release tree whose signed manifest covers a SENTINEL, a file nothing but E-32 reads, and a child
// hook whose every `fs` read is traced. The manifest verifies in the child (it trusts the fixture key), its tag and
// commit are the checkout's own, so E-32, had it run, would have read the sentinel. The test also asserts the hook took
// the re-run path and that the trace saw the run, so a pass is not the trace of a run that never happened.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { COVERAGE, isCovered, manifestFromArchive, signManifest, writeManifestCache } from '../../tools/snowarch/lib/licence/manifest.mjs';
import { licenceFixture, licensedEnv } from '../../tools/snowarch/tests/helpers/licence-hook/index.mjs';
import { readTraceImport } from '../../tools/snowarch/tests/helpers/read-trace.mjs';
import { tempDir } from '../../tools/snowarch/tests/helpers/temp.mjs';
import { LINKED, REAL_ROOT, VERSION_OF_RECORD, linkInstall, readJson, releaseTree } from '../doctor/helpers/tree.mjs';

const SENTINEL = 'tools/snowarch/e32-sentinel.txt';
const STDIN = '{"hook_event_name":"SessionStart","source":"startup"}';
const git = (root, args) => execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: 'pipe' }).trim();

test('ARC-11-C7 — the hook re-runs the quick doctor without E-32, so it reads no file only E-32 reads', (t) => {
  const root = releaseTree(t, '9.1.0', { files: { [SENTINEL]: 'read by E-32 alone\n' } });
  const manifest = manifestFromArchive(root, 'v9.1.0');
  assert.ok(SENTINEL in manifest.files, 'the manifest covers the sentinel');
  writeManifestCache(root, { tag: 'v9.1.0', doc: signManifest(manifest, licenceFixture().primary.privateKey),
    checkedAt: '2026-10-13T12:00:00.000Z', source: 'a fixture' });
  linkInstall(root);

  const trace = join(tempDir('snowarch-read-trace-', t), 'reads.txt');
  const env = licensedEnv({ ...process.env, CLAUDE_PROJECT_DIR: root, SNOWARCH_BANNER_PHASES: '1',
    SNOWARCH_TEST_READ_TRACE: trace }, { root });
  env.NODE_OPTIONS = `${env.NODE_OPTIONS} ${readTraceImport()}`;
  const r = spawnSync(process.execPath, [join(root, 'tools/snowarch/hooks/session-start.mjs')],
    { cwd: root, input: STDIN, encoding: 'utf8', env });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stderr, /banner-phases: path=rerun /, 'the hook re-ran the quick doctor');

  const reads = readFileSync(trace, 'utf8').split('\n').filter(Boolean);
  assert.ok(reads.some((p) => p.endsWith(VERSION_OF_RECORD)) && reads.length > 20, `the trace saw ${reads.length} reads`);
  assert.deepEqual(reads.filter((p) => p.replace(/\\/g, '/').endsWith(SENTINEL)), [], 'the hook read a file only E-32 reads');
});

// ── The banner's Integrity line: the verdict status cached, carried over the hook's own runs ──────────────────────

/**
 * The coverage with the fixture's LINKED install excluded. A linked directory under a covered one is a link to this
 * checkout, not a file the release shipped, so a fixture's manifest leaves it out as a signed manifest may.
 */
const FIXTURE_COVERAGE = { ...COVERAGE,
  excludes: [...COVERAGE.excludes, ...LINKED.map((p) => `${p}/`).filter((p) => isCovered(`${p}x`, COVERAGE))] };

/** A release tree, v9.1.0, linked so its CLI and hook run, with its manifest signed by the fixture key. */
function signedRelease(t) {
  const root = releaseTree(t, '9.1.0');
  writeManifestCache(root, { tag: 'v9.1.0', doc: signManifest(manifestFromArchive(root, 'v9.1.0', { coverage: FIXTURE_COVERAGE }),
    licenceFixture().primary.privateKey), checkedAt: '2026-10-13T12:00:00.000Z', source: 'a fixture' });
  linkInstall(root);
  return root;
}

/** The same, with one covered file changed after the tag. */
function modifiedRelease(t) {
  const root = signedRelease(t);
  writeFileSync(join(root, 'CLAUDE.md'), `${readFileSync(join(root, 'CLAUDE.md'), 'utf8')}one more line\n`);
  return root;
}

const child = (root, args, extra = {}) => spawnSync(process.execPath, args, { cwd: root, input: STDIN, encoding: 'utf8',
  env: licensedEnv({ ...process.env, CLAUDE_PROJECT_DIR: root, SNOWARCH_BANNER_PHASES: '1', ...extra }, { root }) });
const LINE = 'Integrity: modified — 1 file differs from the signed manifest for v9.1.0: CLAUDE.md';
const e32Cached = (root) => readJson(root, '.local/doctor-last.json').checks.find((c) => c.id === 'E-32');

test('ARC-11-C7 — after status FAILs E-32, the banner prints its line third, and keeps it across its own re-run', (t) => {
  const root = modifiedRelease(t);
  const status = child(root, [join(REAL_ROOT, 'tools/snowarch/bin/snowarch.mjs'), 'status']);
  assert.match(status.stdout, new RegExp(`^${LINE}$`, 'm'), status.stdout + status.stderr);
  assert.deepEqual([e32Cached(root).status, e32Cached(root).detail], ['fail', LINE]);

  const hook = join(root, 'tools/snowarch/hooks/session-start.mjs');
  const fast = child(root, [hook]);
  assert.match(fast.stderr, /banner-phases: path=cache /);
  const lines = fast.stdout.trim().split('\n');
  assert.ok(lines[1].startsWith('Licence:'), lines.join('\n'));
  assert.equal(lines[2], LINE);

  // The banner's own run leaves E-32 out, and the cache it writes keeps the verdict status cached.
  writeFileSync(join(root, 'engine.config.json'), readFileSync(join(root, 'engine.config.json')));
  const rerun = child(root, [hook]);
  assert.match(rerun.stderr, /banner-phases: path=rerun /);
  assert.equal(rerun.stdout.trim().split('\n')[2], LINE);
  assert.deepEqual([e32Cached(root).status, e32Cached(root).detail], ['fail', LINE]);
});

test('ARC-11-C7 — a verified tree: status prints it verified, and the banner prints no Integrity line', (t) => {
  const root = signedRelease(t);
  const status = child(root, [join(REAL_ROOT, 'tools/snowarch/bin/snowarch.mjs'), 'status']);
  assert.match(status.stdout, /^Integrity: verified · v9\.1\.0 · \d+ files$/m, status.stdout + status.stderr);
  assert.equal(e32Cached(root).status, 'ok');
  const banner = child(root, [join(root, 'tools/snowarch/hooks/session-start.mjs')]).stdout.trim().split('\n');
  assert.ok(banner[1].startsWith('Licence:'), banner.join('\n'));
  assert.equal(banner.some((l) => l.startsWith('Integrity:')), false, banner.join('\n'));
});
