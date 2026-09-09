import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createLogger } from '../lib/log.mjs';
import { register, reset } from '../lib/redact.mjs';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const isWindows = process.platform === 'win32';

/** A sink that records what a logger wrote, so the assertions are on bytes rather than on intent. */
const sink = () => { const lines = []; return { write: (s) => lines.push(s), lines }; };

test('every line goes through redaction — console and file alike', () => {
  const dir = mkdtempSync(join(tmpdir(), 'snowarch-log-'));
  try {
    reset();
    const secret = `${'pw'}-${'q'.repeat(10)}`;
    register(secret);
    const out = sink(); const err = sink();
    const log = createLogger({ command: 'test', logRoot: dir, out, err });
    log.step(`storing ${secret}`);
    log.warn(`SERVICENOW_PASSWORD=${secret}`);

    assert.ok(!out.lines.join('').includes(secret), 'stdout carried the secret');
    assert.ok(!err.lines.join('').includes(secret), 'stderr carried the secret');
    assert.ok(log.logFile, 'no log file was opened');
    const onDisk = readFileSync(log.logFile, 'utf8');
    assert.ok(!onDisk.includes(secret), 'the LOG FILE carried the secret');
    assert.match(onDisk, /storing <redacted>/);
    assert.match(onDisk, /SERVICENOW_PASSWORD=set \(len \d+\)/);
  } finally { reset(); rmSync(dir, { recursive: true, force: true }); }
});

test('the log file is opened lazily — a command that says nothing leaves nothing', () => {
  const dir = mkdtempSync(join(tmpdir(), 'snowarch-log-'));
  try {
    const log = createLogger({ command: 'quiet-one', logRoot: dir, out: sink(), err: sink() });
    assert.equal(log.logFile, null);
    assert.ok(!existsSync(join(dir, '.local', 'logs')), 'the log directory was created for nothing');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('the log file is 0600', { skip: isWindows ? 'POSIX permissions' : false }, () => {
  const dir = mkdtempSync(join(tmpdir(), 'snowarch-log-'));
  try {
    const log = createLogger({ command: 'perm', logRoot: dir, out: sink(), err: sink() });
    log.step('something');
    assert.equal(statSync(log.logFile).mode & 0o777, 0o600, 'a log can contain a URL and a username');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('rotation keeps the last ten', () => {
  const dir = mkdtempSync(join(tmpdir(), 'snowarch-log-'));
  try {
    const logs = join(dir, '.local', 'logs');
    mkdirSync(logs, { recursive: true });
    for (let i = 1; i <= 12; i += 1) writeFileSync(join(logs, `old-20260101-0000${i}.log`), 'x');
    assert.equal(readdirSync(logs).length, 12, 'the fixture did not seed twelve');

    const log = createLogger({ command: 'rotate', logRoot: dir, out: sink(), err: sink() });
    log.step('a line, which opens the file and rotates');
    const left = readdirSync(logs);
    assert.equal(left.length, 10, `kept ${left.length}`);
    assert.ok(left.includes(log.logFile.split(/[\\/]/).pop()), 'the current log was rotated away');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('--quiet silences the console and still writes the file', () => {
  const dir = mkdtempSync(join(tmpdir(), 'snowarch-log-'));
  try {
    const out = sink(); const err = sink();
    const log = createLogger({ command: 'q', logRoot: dir, quiet: true, out, err });
    log.step('a step'); log.warn('a warning');
    assert.deepEqual(out.lines, []);
    assert.deepEqual(err.lines, []);
    // The file is the record: quiet is about the terminal, not about forgetting what happened.
    assert.match(readFileSync(log.logFile, 'utf8'), /a step[\s\S]*a warning/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('a read-only checkout logs to the console and does not fail the command', () => {
  // The log root is an existing FILE, so `mkdir <file>/.local/logs` throws on every platform
  // (ENOTDIR here, ENOENT on Windows) with no dependency on permissions. An unwritable *path*
  // was the obvious fixture and the wrong one: `/nonexistent- -path` is only unwritable for an
  // unprivileged user, and the Windows runner — Administrator, drive-relative — created
  // `C:\nonexistent- -path` and logged into it happily. The fixture has to make the failure,
  // not assume the environment supplies one.
  const dir = mkdtempSync(join(tmpdir(), 'snowarch-ro-'));
  try {
    const notADir = join(dir, 'read-only-checkout');
    writeFileSync(notADir, '');
    const out = sink(); const err = sink();
    const log = createLogger({ command: 'ro', logRoot: notADir, out, err });
    log.step('still works');
    assert.equal(log.logFile, null, 'a failed open must not leave a log file behind');
    // The point of the story: the line still reached the operator, and nothing threw.
    assert.match(out.lines.join(''), /still works/);
    assert.equal(err.lines.join(''), '');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('AC 3 - the launcher refuses without Node, and with Node below the floor',
  { skip: isWindows ? 'the POSIX launcher; snowarch.cmd is ARC-06-S11' : false }, () => {
    const dir = mkdtempSync(join(tmpdir(), 'snowarch-launcher-'));
    try {
      const binDir = join(dir, 'bin');
      mkdirSync(binDir, { recursive: true });
      const launcher = join(repoRoot, 'snowarch');
      assert.ok(existsSync(launcher), 'the launcher is missing');
      // Precondition: with a real node on PATH it works, so a failure below is the shim, not the CLI.
      const ok = spawnSync(launcher, ['version'], { encoding: 'utf8', cwd: repoRoot });
      assert.equal(ok.status, 0, 'the launcher does not work with a real node');

      // (a) no node at all.
      const none = spawnSync(launcher, ['version'],
        { encoding: 'utf8', cwd: repoRoot, env: { ...process.env, PATH: binDir } });
      assert.equal(none.status, 3, 'a missing Node must be a prerequisite failure');
      assert.match(none.stderr, /Node\.js 20\+ is required and was not found on PATH/);
      assert.match(none.stderr, /brew install node@22/);

      // (b) node present but too old.
      writeFileSync(join(binDir, 'node'),
        '#!/bin/sh\nif [ "$1" = "-p" ]; then echo 18; else echo "v18.0.0"; fi\n');
      chmodSync(join(binDir, 'node'), 0o755);
      const old = spawnSync(launcher, ['version'],
        { encoding: 'utf8', cwd: repoRoot, env: { ...process.env, PATH: binDir } });
      assert.equal(old.status, 3, 'an old Node must be a prerequisite failure');
      assert.match(old.stderr, /Node\.js 20\+ is required; found/);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });

test('the launcher is committed executable and LF-only', () => {
  const mode = spawnSync('git', ['ls-files', '-s', 'snowarch'], { cwd: repoRoot, encoding: 'utf8' }).stdout;
  assert.match(mode, /^100755 /, 'the launcher is not committed with the executable bit');
  const text = readFileSync(join(repoRoot, 'snowarch'), 'utf8');
  assert.ok(!text.includes('\r'), 'CRLF in the launcher is a bad-interpreter error on every Unix box');
  assert.ok(text.split('\n').length <= 20, 'the launcher is meant to be readable at a glance');
  const attrs = readFileSync(join(repoRoot, '.gitattributes'), 'utf8');
  assert.match(attrs, /^snowarch text eol=lf$/m, 'nothing stops a Windows clone giving it CRLF');
});
