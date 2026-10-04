/**
 * ARC-09-C109 - there is ONE line reader for a yes/no prompt, and it has a contract.
 *
 * `tools/snowarch/lib/ask.mjs` says why it exists: three readers of one line were three chances to
 * disagree about what end-of-input means, and "stdin closed" is the case where a prompt must not be
 * read as a yes. `upgrade.mjs` then grew a fourth (`promptLine`, a dynamic `import('node:readline')`),
 * returned '' at end of input, and a closed stdin accepted the plan and moved the tree.
 *
 * Two things are pinned here: the contract (null at end of input, only an explicit yes proceeds), and
 * that no other file of the engine opens a `readline` interface of its own.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { Readable } from 'node:stream';
import { fileURLToPath } from 'node:url';

import { askOnce, isYes, lineReader } from '../tools/snowarch/lib/ask.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const stream = (text) => Readable.from(text === '' ? [] : [text]);

test('end of input is null, an empty line is an empty string, and they are different answers', async () => {
  assert.equal(await askOnce(stream(''))(), null);
  assert.equal(await askOnce(stream('\n'))(), '');
  assert.equal(await askOnce(stream('y\n'))(), 'y');
  const reader = lineReader(stream('one\n'));
  assert.equal(await reader.ask(), 'one');
  assert.equal(await reader.ask(), null);                 // the second question finds nothing
  reader.close();
});

test('only Enter, y and yes proceed; end of input, n and a stray word do not', () => {
  for (const yes of ['', 'y', 'Y', 'yes', 'YES', '  y  ']) assert.equal(isYes(yes), true, JSON.stringify(yes));
  for (const no of [null, 'n', 'no', 'maybe', 'yep', 'ok', 'x']) assert.equal(isYes(no), false, JSON.stringify(no));
});

/**
 * Files that OPEN a readline interface: import it (static, dynamic or require) or call
 * `createInterface`. A comment that names `node:readline` (plan.mjs has one) is not a reader.
 */
const OPENS = /(?:from\s+|import\s*\(\s*|require\s*\(\s*)['"](?:node:)?readline['"]|\bcreateInterface\s*\(/;
function readers(files, read) {
  return files.filter((f) => OPENS.test(read(f)));
}
const tracked = () => execFileSync('git', ['ls-files', '--', 'tools', 'scripts'], { cwd: root, encoding: 'utf8' })
  .split('\n').filter((f) => /\.(?:mjs|js|cjs)$/.test(f) && !/(^|\/)tests?\//.test(f));

test('no file of tools/ or scripts/ opens a readline interface except ask.mjs', () => {
  const files = tracked();
  assert.ok(files.length > 50, `only ${files.length} files scanned - the scan is broken, not the tree`);
  const found = readers(files, (f) => readFileSync(join(root, f), 'utf8'));
  assert.ok(found.includes('tools/snowarch/lib/ask.mjs'), 'the sentinel: ask.mjs itself must be found');
  assert.deepEqual(found.filter((f) => f !== 'tools/snowarch/lib/ask.mjs'), [],
    'a private line reader is a second opinion on what end-of-input means; use lib/ask.mjs');
});

test('control - the scan sees the spelling upgrade.mjs used, the static ones and require, and not a comment', () => {
  const sources = {
    'a.mjs': "const { createInterface } = await import('node:readline');",
    'b.mjs': "import { createInterface } from 'node:readline';",
    'c.mjs': "import readline from 'node:readline';",
    'd.mjs': "const x = 1;",
    'e.mjs': "// `ask` is injected - `node:readline` in production, an array of answers in the tests.",
    'f.mjs': "const rl = require('readline').createInterface({ input });",
  };
  assert.deepEqual(readers(Object.keys(sources), (f) => sources[f]), ['a.mjs', 'b.mjs', 'c.mjs', 'f.mjs']);
});
