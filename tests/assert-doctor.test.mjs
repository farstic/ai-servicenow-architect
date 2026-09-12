/**
 * ARC-09-C20 — two callers, two shapes, one judgement.
 *
 * `assert-doctor.mjs` decides whether a doctor report describes a green design-only install. It had
 * one caller for two arcs — the bootstrap cells, which run the doctor BEFORE `npm ci` — and it
 * encoded that as though it were the only world: every `SV-` check must be `skip`, because nothing
 * is installed for them to ask.
 *
 * `release.yml` installs first, for its lint and test gates. So rehearsal run 8 produced a report
 * that was green in every way that matters — `{"ok":31,"warn":1,"fail":1,"skip":6}`, E-00 the only
 * failure on a runner with no Claude Code, server `state: ready, mode: unconfigured` — and the
 * judgement refused it: `a server check ran before npm ci: SV-00, SV-01, SV-02, SV-05, SV-07,
 * SV-08`. The script was right about its caller and wrong about the world.
 *
 * The expectation is explicit now, and the DEFAULT is the old one: a caller that does not say which
 * world it is in gets the stricter shape that was already being asserted.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { tempDir } from '../tools/snowarch/tests/helpers/temp.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SCRIPT = join(root, 'scripts/ci/assert-doctor.mjs');

const judge = (file, args = []) => spawnSync(process.execPath,
  [SCRIPT, '--in', file, '--expect-fail', 'E-00', ...args], { encoding: 'utf8' });

/** A report on disk, from the bootstrap snapshot with the named changes. */
function reportFile(t, mutate) {
  const dir = tempDir('snowarch-judge-', t);
  const report = JSON.parse(readFileSync(join(root, 'tests/fixtures/doctor/snapshot-linux.json'), 'utf8'));
  // The snapshot is a PASSING bootstrap report except that E-00 is expected to fail there, which is
  // what `--expect-fail E-00` says. Make that true rather than assuming it.
  report.checks = report.checks.map((c) => (c.id === 'E-00' ? { ...c, status: 'fail' } : c));
  // The snapshot fixture is a NORMALISED report — `doctor-snapshot.mjs` strips the volatile fields,
  // `modeLine` among them — and this script asserts one. Restored here rather than added to the
  // snapshot, which exists to be compared and would then carry a line that changes per machine.
  report.modeLine = report.modeLine
    ?? 'Mode: design-only — no instance configured, no MCP server registered';
  mutate(report);
  const file = join(dir, 'doctor.json');
  writeFileSync(file, `${JSON.stringify(report, null, 2)}\n`);
  return file;
}

/** Run 8's shape: dependencies installed, the server answered, SV checks ran. */
const installedShape = (report) => {
  report.checks = report.checks.map((c) => {
    if (!c.id.startsWith('SV-')) return c;
    return { ...c, status: c.id === 'SV-02' ? 'warn' : 'ok' };
  });
  report.server = { state: 'ready', mode: 'unconfigured', instances: [] };
};

test('C20: the bootstrap shape passes `absent` — the default is the old rule', (t) => {
  const file = reportFile(t, () => {});
  const r = judge(file);
  assert.equal(r.status, 0, `${r.stdout}${r.stderr}`);
  // ...and explicitly, which is the same answer.
  assert.equal(judge(file, ['--deps', 'absent']).status, 0);
});

test('C20: the bootstrap shape FAILS `installed` — no server answered', (t) => {
  const r = judge(reportFile(t, () => {}), ['--deps', 'installed']);
  assert.equal(r.status, 1);
  // The SV checks being `skip` is fine under `installed`; what is not fine is the server never
  // reaching `ready`, because an installed tree whose server did not answer is not green, it is
  // silent.
  assert.match(r.stderr, /server block says state "absent", not ready/);
});

test('C20: run 8\'s shape passes `installed`', (t) => {
  const r = judge(reportFile(t, installedShape), ['--deps', 'installed']);
  assert.equal(r.status, 0, `${r.stdout}${r.stderr}`);
});

test('C20: run 8\'s shape FAILS `absent`, with the message that was right for that caller', (t) => {
  const r = judge(reportFile(t, installedShape), ['--deps', 'absent']);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /a server check ran before npm ci: SV-/);
});

test('C20: a FAILING server check is refused under `installed` — the allowance is not a blindfold', (t) => {
  const file = reportFile(t, (report) => {
    installedShape(report);
    report.checks = report.checks.map((c) => (c.id === 'SV-05' ? { ...c, status: 'fail' } : c));
  });
  const r = judge(file, ['--deps', 'installed']);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /a server check FAILED: SV-05/);
});

test('C20: an unknown --deps value is a usage error, not a default', (t) => {
  const r = judge(reportFile(t, () => {}), ['--deps', 'maybe']);
  assert.equal(r.status, 2);
  assert.match(r.stderr, /--deps must be absent or installed/);
});
