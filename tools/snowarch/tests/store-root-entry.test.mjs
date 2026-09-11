// ARC-09-S06 — the ROOT ENTRY for `store`, run as a process, with real options.
//
// The unit tests next door prove the argv the forwarder composes. This one types the arguments,
// through the launcher a user actually runs, because the failure they cannot catch is the frame
// eating a flag on the way: `./snowarch instance add … --yes` once answered "--yes needs a value"
// from the ENGINE's parser with every unit test green, and `store restore <file> --yes` is the
// same shape.
//
// Every assertion is about WHOSE answer arrived. The exit table and the backup sentence exist
// only in the server CLI; the one-line usage exists only in the engine.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { preconditions } from '../lib/instance.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');

const ENTRIES = [
  { name: 'the engine entry', argv0: process.execPath, lead: [join(root, 'tools/snowarch/bin/snowarch.mjs')] },
  ...(process.platform === 'win32'
    // `call`, because a `.cmd` invoked without it transfers control and never comes back — the
    // lesson S04's CI cell learned the hard way.
    ? [{ name: 'snowarch.cmd', argv0: process.env.COMSPEC || 'cmd.exe', lead: ['/c', 'call', join(root, 'snowarch.cmd')] }]
    : [{ name: './snowarch', argv0: join(root, 'snowarch'), lead: [] }]),
];

const run = (entry, args, env = {}) => {
  const r = spawnSync(entry.argv0, [...entry.lead, ...args],
    { encoding: 'utf8', cwd: root, env: { ...process.env, ...env } });
  return { status: r.status, text: `${r.stdout ?? ''}${r.stderr ?? ''}` };
};

test('the server CLI can run from this checkout — the precondition for every row below', () => {
  const check = preconditions({ root });
  assert.equal(check.ok, true, check.problems.join(' · '));
});

for (const entry of ENTRIES) {
  test(`${entry.name}: a bare --help is the ENGINE's one-liner`, () => {
    const r = run(entry, ['store', '--help']);
    assert.equal(r.status, 0);
    assert.match(r.text, /usage: \.\/snowarch store <command>/);
  });

  test(`${entry.name}: \`migrate --help\` is the SERVER's help, with the exit table`, () => {
    const r = run(entry, ['store', 'migrate', '--help']);
    assert.equal(r.status, 0, r.text);
    assert.match(r.text, /usage: snowarch store <command>/);
    assert.match(r.text, /exit codes:/);
    assert.match(r.text, /never pruned automatically/);
    assert.doesNotMatch(r.text, /usage: \.\/snowarch store <command>/);
  });

  test(`${entry.name}: \`migrate --yes\` reaches the server as a FLAG, not a value`, () => {
    const dir = mkdtempSync(join(tmpdir(), 'store-root-entry-'));
    try {
      const store = join(dir, 'instances.json');
      writeFileSync(store, `${JSON.stringify({ version: 1, instances: {} }, null, 2)}\n`);
      const r = run(entry, ['store', 'migrate', '--yes'], { SNOW_STORE: store });
      assert.equal(r.status, 0, r.text);
      assert.match(r.text, /schema v1 is current — nothing to do/);
      // The two wrong answers this test exists to keep out.
      assert.doesNotMatch(r.text, /needs a value/);
      assert.doesNotMatch(r.text, /not installed yet/);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });

  test(`${entry.name}: an unreadable store exits 1 through the launcher, and writes nothing`, () => {
    const dir = mkdtempSync(join(tmpdir(), 'store-root-entry-bad-'));
    try {
      const store = join(dir, 'instances.json');
      writeFileSync(store, '{ hand-edited\n');
      const r = run(entry, ['store', 'migrate', '--yes'], { SNOW_STORE: store });
      assert.equal(r.status, 1, r.text);
      assert.match(r.text, /STORE_UNREADABLE/);
      assert.match(r.text, /\.\/snowarch store backups/);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });

  test(`${entry.name}: an unknown sub-command is the SERVER's refusal`, () => {
    const r = run(entry, ['store', 'frobnicate']);
    assert.equal(r.status, 2);
    assert.match(r.text, /migrate, backups or restore/);
  });
}
