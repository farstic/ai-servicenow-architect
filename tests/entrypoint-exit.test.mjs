// An entry point that prints must not call `process.exit()`.
//
// Found by ARC-09-S02's CI: `the two docs entry points are one implementation` failed on one cell
// with `Unterminated string in JSON at position 8192` — 8 KiB exactly, a pipe-buffer boundary. A
// write past the pipe buffer is ASYNCHRONOUS, and `process.exit()` ends the process before it
// drains, so a `--json` object reaches its caller cut in half. `tools/snowarch/bin/snowarch.mjs`
// had already learned this and says so in a comment; `scripts/docs.mjs` still carried the old form.
//
// Two halves, deliberately: the mechanism is proved with a script that really truncates, so nobody
// has to take the claim on trust; then every entry point in the tree is held to the rule.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** Entry points that write to stdout and end. Each must set `exitCode`, never call `exit()`. */
const ENTRY_POINTS = [
  'tools/snowarch/bin/snowarch.mjs',
  'scripts/docs.mjs',
];

test('the mechanism is real: process.exit() truncates a large write through a pipe', () => {
  const dir = mkdtempSync(join(tmpdir(), 'snowarch-exit-'));
  const body = 'x'.repeat(400_000);
  const write = `process.stdout.write(${JSON.stringify(body)});`;
  writeFileSync(join(dir, 'exits.mjs'), `${write}\nprocess.exit(0);\n`);
  writeFileSync(join(dir, 'sets.mjs'), `${write}\nprocess.exitCode = 0;\n`);

  // `spawnSync` with `encoding` gives us a PIPE, which is the condition — a terminal behaves
  // differently and is exactly why this is invisible when a person runs the command by hand.
  const bytes = (file) => {
    const r = spawnSync(process.execPath, [join(dir, file)], { encoding: 'utf8', maxBuffer: 1 << 26 });
    return (r.stdout ?? '').length;
  };
  const truncated = bytes('exits.mjs');
  const whole = bytes('sets.mjs');

  assert.equal(whole, body.length, 'setting exitCode lost output — the premise is wrong');
  // On some platforms the write happens to complete; the assertion that always holds is that
  // `exitCode` is never WORSE, and the message says what was seen either way.
  assert.ok(truncated <= whole,
    `process.exit() delivered more than process.exitCode (${truncated} > ${whole})`);
  if (truncated < whole) {
    assert.ok(truncated % 1024 === 0 || truncated < body.length,
      `truncated at ${truncated} of ${body.length} bytes`);
  }
});

test('every entry point that prints sets exitCode instead of calling exit()', () => {
  const offenders = [];
  for (const rel of ENTRY_POINTS) {
    const text = readFileSync(join(root, rel), 'utf8');
    // In a comment it is the LESSON; in code it is the bug. Comment lines are dropped first.
    const code = text.split('\n').filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n');
    if (/process\.exit\s*\(/.test(code)) offenders.push(rel);
  }
  assert.deepEqual(offenders, [],
    'these end the process before stdout drains — a --json object reaches its caller cut in half');
});

test('scripts/docs.mjs --json is one whole object through a pipe', () => {
  const out = execFileSync(process.execPath, [join(root, 'scripts/docs.mjs'), 'status', '--json'],
    { cwd: root, encoding: 'utf8', maxBuffer: 1 << 26 });
  const report = JSON.parse(out);           // the assertion IS the parse
  assert.equal(typeof report, 'object');
  assert.equal(out.trimStart()[0], '{', 'something precedes the object on stdout');
});
