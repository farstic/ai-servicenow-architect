// Copyright 2026 Cvetomir Grigorov. Licensed under the Apache License, Version 2.0 (see LICENSE).
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

import { manifestFromArchive, signManifest, writeManifestCache } from '../../tools/snowarch/lib/licence/manifest.mjs';
import { licenceFixture, licensedEnv } from '../../tools/snowarch/tests/helpers/licence-hook/index.mjs';
import { readTraceImport } from '../../tools/snowarch/tests/helpers/read-trace.mjs';
import { tempDir } from '../../tools/snowarch/tests/helpers/temp.mjs';
import { REAL_ROOT, greenTree, linkInstall, readJson } from '../doctor/helpers/tree.mjs';

const SENTINEL = 'tools/snowarch/e32-sentinel.txt';
const STDIN = '{"hook_event_name":"SessionStart","source":"startup"}';
const git = (root, args) => execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: 'pipe' }).trim();

test('ARC-11-C7 — the hook re-runs the quick doctor without E-32, so it reads no file only E-32 reads', (t) => {
  const root = greenTree(t, { extra: { 'package.json': { ...readJson(REAL_ROOT, 'package.json'), version: '9.1.0' } } });
  writeFileSync(join(root, SENTINEL), 'read by E-32 alone\n');
  git(root, ['add', SENTINEL]);
  git(root, ['commit', '-qm', 'the sentinel']);
  git(root, ['tag', '-a', 'v9.1.0', '-m', 'v9.1.0']);
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
  assert.ok(reads.some((p) => p.endsWith('package.json')) && reads.length > 20, `the trace saw ${reads.length} reads`);
  assert.deepEqual(reads.filter((p) => p.replace(/\\/g, '/').endsWith(SENTINEL)), [], 'the hook read a file only E-32 reads');
});
