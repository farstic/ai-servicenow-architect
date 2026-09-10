// ARC-07-S05 (rework) — the ROOT ENTRY, run as a process, with real options.
//
// The six tests in `instance-forwarder.test.mjs` are unit tests on the builder: they prove the
// argv it composes adds nothing, and they never start a process. That is why the frame ate the
// options on the way to the builder and every one of them stayed green — `./snowarch instance add
// … --yes` answered "--yes needs a value" from the ENGINE's parser, and `instance add --help`
// printed the forwarder's one-line usage instead of the server's. A user cannot type an argument
// that does not pass through a launcher, so the test has to type one.
//
// Every assertion here is about WHOSE answer arrived. The production policy and the exit table
// exist only in the server CLI; the one-line `instance` usage exists only in the engine. Each is
// therefore a witness that the arguments reached the right program unchanged.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { CLI_PATH, preconditions, USAGE } from '../lib/instance.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');

// The server's own table, imported from the server's own build: this file asserts that the help
// text CAME FROM THERE, so the table it compares against has to be that program's, not a copy.
const { EXIT_CODES } = await import(pathToFileURL(join(root, CLI_PATH.replace(/index\.js$/, 'instance.js'))).href);

/**
 * The entries a user actually types, one per row.
 *
 * `snowarch.cmd` runs through `cmd.exe` and the POSIX launcher runs as itself, so the OS decides
 * which rows exist — a launcher is only testable on the platform whose shell reads it.
 */
const ENTRIES = [
  { name: 'the engine entry', argv0: process.execPath, lead: [join(root, 'tools/snowarch/bin/snowarch.mjs')] },
  ...(process.platform === 'win32'
    ? [{ name: 'snowarch.cmd', argv0: process.env.COMSPEC || 'cmd.exe', lead: ['/c', join(root, 'snowarch.cmd')] }]
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
  test(`${entry.name}: options reach the server — the production policy answers, exit 3`, () => {
    const dir = mkdtempSync(join(tmpdir(), 'root-entry-'));
    const store = join(dir, 'instances.json');
    try {
      const r = run(entry, ['instance', 'add', 'prod-acme', '--url', 'https://acme.service-now.com',
        '--env', 'prod', '--preset', 'full', '--yes', '--username', 'u'], { SNOW_STORE: store });
      assert.equal(r.status, 3);
      assert.match(r.text, /PROD_WRITE_NOT_ACKNOWLEDGED/);
      // The two wrong answers this test exists to keep out: the frame's parser refusing a flag it
      // has no table for, and the forwarder's precondition sentence standing in for the server's.
      assert.doesNotMatch(r.text, /needs a value/);
      assert.doesNotMatch(r.text, /not installed yet/);
      assert.equal(existsSync(store), false);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });

  test(`${entry.name}: \`add --help\` is the server's help, with the exit table`, () => {
    const r = run(entry, ['instance', 'add', '--help']);
    assert.equal(r.status, 0);
    for (const { code, meaning } of EXIT_CODES) assert.ok(r.text.includes(`${code}  ${meaning}`), `${code}`);
    // The engine's one-line usage is the answer this used to get.
    assert.doesNotMatch(r.text, /usage: \.\/snowarch instance <command>/);
  });

  test(`${entry.name}: an unknown sub-command is the server's refusal, not the frame's`, () => {
    const r = run(entry, ['instance', 'list']);
    assert.equal(r.status, 2);
    assert.match(r.text, /ARC-07-S06/);
  });

  test(`${entry.name}: a bare \`instance --help\` is still the frame's own`, () => {
    const r = run(entry, ['instance', '--help']);
    assert.equal(r.status, 0);
    assert.ok(r.text.includes(USAGE.split('\n')[0]));
  });
}
