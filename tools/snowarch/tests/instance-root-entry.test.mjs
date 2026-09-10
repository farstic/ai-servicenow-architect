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
import { chmodSync, existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
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
    // `list` was the example until ARC-07-S06 implemented it; `import` is the one still to come.
    const r = run(entry, ['instance', 'import', '--from-legacy']);
    assert.equal(r.status, 2);
    assert.match(r.text, /ARC-07-S08/);
  });

  test(`${entry.name}: \`list --json\` reaches the server and prints only the object`, () => {
    const dir = mkdtempSync(join(tmpdir(), 'root-entry-list-'));
    try {
      const r = run(entry, ['instance', 'list', '--json'],
        { SNOW_STORE: join(dir, 'instances.json') });
      assert.equal(r.status, 0, r.text);
      // The whole of stdout parses: ARC-06-S08 does exactly this to find the labels.
      const parsed = JSON.parse(r.text);
      assert.deepEqual(parsed.instances, []);
      assert.equal(parsed.defaultInstance, null);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });

  test(`${entry.name}: \`list --all\` reaches the server as two flags, not one`, () => {
    // Two flags after a sub-command, which is the shape the frame used to eat. An empty store is
    // the empty-store sentence, and `--json` parses as a whole.
    const dir = mkdtempSync(join(tmpdir(), 'root-entry-all-'));
    try {
      const store = join(dir, 'instances.json');
      const plain = run(entry, ['instance', 'list', '--all'], { SNOW_STORE: store });
      assert.equal(plain.status, 0, plain.text);
      assert.match(plain.text, /No instances configured/);

      const json = run(entry, ['instance', 'list', '--all', '--json'], { SNOW_STORE: store });
      assert.equal(json.status, 0, json.text);
      const parsed = JSON.parse(json.text);
      assert.deepEqual(parsed.instances, []);
      assert.ok(Object.hasOwn(parsed, 'stores'), 'the --all shape carries both store paths');
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });

  test(`${entry.name}: \`list --all\` under SNOW_STORE lists the file the server READS`, () => {
    // The reviewer's reproduction, from the entry a user types. Two stores, one selected by the
    // override: `--all` used to show the global one alone, leaving out the very file in use.
    const dir = mkdtempSync(join(tmpdir(), 'root-entry-two-'));
    try {
      const home = join(dir, 'home');
      const globalStore = join(home, '.config', 'snowarch', 'instances.json');
      const override = join(dir, 'project.json');
      const account = { method: 'basic', username: 'u', password: ['pw', '-', 'fixture'].join('') };
      const instance = (url) => ({ url, environment: 'pdi', auth: account, preset: 'read-only',
        flags: {}, toolPackage: 'full', maxRecords: 100, prodWriteAck: false });
      mkdirSync(join(home, '.config', 'snowarch'), { recursive: true });
      writeFileSync(globalStore, JSON.stringify({ version: 1, defaultInstance: 'gl',
        instances: { dev1: instance('https://dev11111.service-now.com'),
          gl: instance('https://dev22222.service-now.com') } }, null, 2), { mode: 0o600 });
      writeFileSync(override, JSON.stringify({ version: 1, defaultInstance: 'dev1',
        instances: { dev1: instance('https://dev33333.service-now.com') } }, null, 2), { mode: 0o600 });
      chmodSync(globalStore, 0o600);
      chmodSync(override, 0o600);

      const env = { SNOW_STORE: override, HOME: home, USERPROFILE: home,
        XDG_CONFIG_HOME: join(home, '.config'), APPDATA: join(home, 'AppData', 'Roaming') };
      const r = run(entry, ['instance', 'list', '--all'], env);
      assert.equal(r.status, 0, r.text);
      const rows = r.text.split('\n').filter((l) => /^(dev1|gl)\s/.test(l));
      assert.equal(rows.length, 3, r.text);
      assert.equal(rows.filter((l) => l.includes('SNOW_STORE')).length, 1, r.text);
      assert.match(r.text, /Note: "dev1" exists in both/);
      // Whatever else it prints, a password is never one of the bytes.
      assert.doesNotMatch(r.text, /pw-fixture/);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });

  test(`${entry.name}: \`test <label>\` reaches the server with its label`, () => {
    // The label is the proof: it is a POSITIONAL after a sub-command, which is exactly what the
    // frame used to swallow. A label that is not in the store answers before any network call, so
    // this asserts the routing without asserting the internet.
    const dir = mkdtempSync(join(tmpdir(), 'root-entry-test-'));
    try {
      const r = run(entry, ['instance', 'test', 'no-such-label'],
        { SNOW_STORE: join(dir, 'instances.json') });
      assert.equal(r.status, 2, r.text);
      assert.match(r.text, /LABEL_NOT_FOUND/);
      assert.match(r.text, /no-such-label/);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });

  test(`${entry.name}: a bare \`instance --help\` is still the frame's own`, () => {
    const r = run(entry, ['instance', '--help']);
    assert.equal(r.status, 0);
    assert.ok(r.text.includes(USAGE.split('\n')[0]));
  });
}
