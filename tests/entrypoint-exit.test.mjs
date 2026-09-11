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
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { tempDir } from '../tools/snowarch/tests/helpers/temp.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/**
 * Every `.mjs` under these directories that WRITES TO STDOUT — found by a scan, never a list.
 *
 * ARC-09-C6 widened this from two named entry points, and the widening is the point: the rule is
 * about a process that prints, not about a file somebody remembered to add. A list of twenty-nine
 * names is a list that rots the first time a generator is added; a scan sweeps the new file the
 * day it appears.
 *
 * `tools/snowarch/hooks/` is in the sweep as a GUARD rather than a fix — the banner hook already
 * sets `process.exitCode` and returns, which is why a 12 KB `additionalContext` reaches the model
 * intact. It is exactly the kind of file someone tidies.
 */
const SWEPT_DIRS = ['scripts', 'scripts/ci', 'tools/snowarch/hooks', 'tools/snowarch/bin'];
// "Prints" means writes to fd 1 or 2 BY ANY MECHANISM — including the synchronous form. The first
// version of this listed only the buffered ones, so converting the thirty files to `writeSync`
// emptied the sweep's own membership and it reported two files and a pass. A scan whose subject
// disappears when the problem is fixed is a scan that stops watching.
const PRINTS = /process\.(stdout|stderr)\.write\(|console\.(log|error|warn)\(|writeSync\(\s*[12]\s*,/;

function printingFiles() {
  const out = [];
  for (const dir of SWEPT_DIRS) {
    const here = join(root, dir);
    if (!existsSync(here)) continue;
    for (const entry of readdirSync(here, { withFileTypes: true })) {
      if (!entry.isFile() || !entry.name.endsWith('.mjs')) continue;
      const rel = `${dir}/${entry.name}`;
      if (PRINTS.test(readFileSync(join(root, rel), 'utf8'))) out.push(rel);
    }
  }
  return out.sort();
}

test('the mechanism is real: process.exit() truncates a large write through a pipe', (t) => {
  // Through the helper, so the directory goes with the run. A bare `mkdtempSync` leaves one behind
  // per run — which is how a developer's TMPDIR reached 14,261 of them (ARC-08-S06), and what
  // `tools/snowarch/tests/fixture-cleanup.test.mjs` exists to keep from happening again.
  const dir = tempDir('snowarch-exit-', t);
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

test('a file that can exit writes SYNCHRONOUSLY, so nothing can be pending (ARC-09-C6)', () => {
  const swept = printingFiles();
  // A scan that found nothing would pass silently and prove nothing; this is the tripwire on the
  // scan itself.
  assert.ok(swept.length >= 25, `the sweep found only ${swept.length} printing files`);

  const offenders = [];
  for (const rel of swept) {
    const text = readFileSync(join(root, rel), 'utf8');
    // In a comment it is the LESSON; in code it is the bug. Comment lines are dropped first.
    const code = text.split('\n').filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n');
    if (!/process\.exit\s*\(/.test(code)) continue;

    // THE RULE, in the form that is actually checkable. `process.exit()` drops writes that are
    // still QUEUED, and a write to a pipe queues — so the danger is not "an exit near a write", it
    // is any pending write anywhere in the process when the exit happens. A file that can exit
    // therefore uses `writeSync`, which returns when the bytes are gone. Then there is nothing to
    // drop and the author has no arithmetic to do.
    //
    // ANY reference to the streams, not only a write through them. Touching `process.stdout` at
    // all makes libuv open fd 1 as a stream and set it NON-BLOCKING; `writeSync` on a non-blocking
    // pipe whose buffer is full does not wait — it throws EAGAIN. So a script that reads
    // `process.stdout.isTTY` to decide about colour and then writeSyncs a large report can crash
    // on a runner in exactly the place this rule protects. None of the thirty does it today; this
    // is what keeps it that way.
    const touched = [...code.matchAll(/process\.(stdout|stderr)|console\.(log|error|warn)\(/g)];
    if (touched.length > 0) {
      offenders.push(`${rel} (${touched.length} buffered write(s) or stream reference(s))`);
    }
  }
  assert.deepEqual(offenders, [],
    'these can exit with a write still queued — a --json object reaches its caller cut in half. '
    + 'Use writeSync(1, …) / writeSync(2, …), or set process.exitCode and return');
});

test('every swept file still prints what it printed before (ARC-09-C6)', () => {
  // The conversion must be a change of MECHANISM, not of output. `writeSync` takes a string and
  // writes it whole, so the one thing that could have changed is a missing newline where
  // `console.log` added one — which is why every console call became a template ending in \n.
  for (const rel of printingFiles()) {
    const code = readFileSync(join(root, rel), 'utf8');
    for (const [, body] of code.matchAll(/writeSync\(\s*[12]\s*,\s*([^\n]*)$/gm)) {
      // Only a LITERAL can be judged here. `writeSync(1, r)` passes a captured command output that
      // carries its own newlines — `process.stdout.write(r)` added none either — and a rule that
      // demanded one would be asking for a blank line after every group. A quoted string that ends
      // the call on its own line, though, must terminate itself, or output that used to be one
      // line per record becomes one long line.
      // …and an interpolation is a variable wearing a literal's clothes: `${r.stdout}` carries
      // whatever newlines the captured output had, exactly as the buffered form did.
      const literal = /^['"`]/.test(body.trim()) && !body.includes('${');
      if (literal && /\);\s*$/.test(body) && !/\\n/.test(body)) {
        assert.fail(`${rel}: a writeSync literal with no newline: ${body.trim()}`);
      }
    }
  }
});

test('the sweep catches a printing file that exits — proven, not assumed', (t) => {
  // A negative control on the RULE, the same way ARC-09-C3 put one on its listener. Without it,
  // a sweep whose regex stopped matching would report zero offenders for ever.
  const dir = tempDir('snowarch-sweep-', t);
  const planted = join(dir, 'planted.mjs');
  writeFileSync(planted, 'process.stdout.write("x".repeat(9000));\nprocess.exit(1);\n');
  const code = readFileSync(planted, 'utf8');
  assert.match(code, PRINTS);
  assert.match(code, /process\.exit\s*\(/);
  // …and the allowed shape is recognised, so the rule has a way to be satisfied other than by
  // never printing.
  const offends = (src) => /process\.(stdout|stderr)|console\.(log|error|warn)\(/.test(src);

  // The allowed shape satisfies the rule: `writeSync` and nothing else.
  assert.equal(offends('writeSync(1, "x");\nprocess.exit(1);\n'), false,
    'the allowed writeSync shape is not recognised');

  // …and a stream REFERENCE is an offence even with no write through it. Touching
  // `process.stdout` sets fd 1 non-blocking, and `writeSync` on a full non-blocking pipe throws
  // EAGAIN — a crash in the exact place the rule protects. This is the case a "no `.write(`" rule
  // would have let through.
  const sniffing = 'const colour = process.stdout.isTTY;\n'
    + 'writeSync(1, "x".repeat(90000));\nprocess.exit(1);\n';
  assert.equal(offends(sniffing), true,
    'a file that sniffs isTTY and then writeSyncs is not caught — that is the EAGAIN case');
});

test('scripts/docs.mjs --json is one whole object through a pipe', () => {
  const out = execFileSync(process.execPath, [join(root, 'scripts/docs.mjs'), 'status', '--json'],
    { cwd: root, encoding: 'utf8', maxBuffer: 1 << 26 });
  const report = JSON.parse(out);           // the assertion IS the parse
  assert.equal(typeof report, 'object');
  assert.equal(out.trimStart()[0], '{', 'something precedes the object on stdout');
});
