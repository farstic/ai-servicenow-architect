// Copyright 2026 Cvetomir Grigorov. Licensed under the Apache License, Version 2.0 (see LICENSE).
// snowarch — AI ServiceNow Architect. Not affiliated with or endorsed by ServiceNow, Inc.
/**
 * ARC-09-C126 — `docs verify` refuses a table row with more cells than its header, outside fences.
 *
 * GitHub cuts a cell at an unescaped pipe, inside backticks too, and drops the cells past the header's
 * count (measured with `gh api markdown`, 2026-10-11), so a row like that renders short. The cases
 * plant each rule the check reads; the last holds the real tree to none, which is what makes the
 * check a gate: it found 33 such rows in 15 files on develop a4d2cb6 before the fix.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { cellCount, findWideRows, formatTables, trackedMarkdown, verifyTables } from '../tools/snowarch/lib/docs/tables.mjs';
import { tempDir } from '../tools/snowarch/tests/helpers/temp.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const table = (...rows) => ['| A | B |', '|---|---|', ...rows].join('\n');

test('cellCount counts unescaped pipes the way GitHub does, inside backticks too', () => {
  assert.equal(cellCount('| a | b |'), 2);
  assert.equal(cellCount('a | b'), 2);
  assert.equal(cellCount('| a | `x | y` |'), 3, 'a pipe inside a code span still ends a cell');
  assert.equal(cellCount('| a | `x \\| y` |'), 2, 'an escaped pipe does not');
  assert.equal(cellCount('| a | b \\|'), 2, 'an escaped trailing pipe is content, not the row\'s end');
});

test('a row wider than its header is found, with its file and line', () => {
  const text = ['# T', '', table('| 1 | written: created | updated |', '| 2 | fine |')].join('\n');
  assert.deepEqual(findWideRows(text, 'docs/x.md'), [{ file: 'docs/x.md', line: 5, cells: 3, header: 2 }]);
  // The C122 shape: the pipes inside backticks.
  assert.equal(findWideRows(table('| 1 | `<a | b>` |'), 'f.md').length, 1);
});

test('escaped pipes, narrower rows and rows in fences are not findings', () => {
  assert.deepEqual(findWideRows(table('| 1 | `<a \\| b>` |', '| 3 |')), []);
  for (const fence of ['```', '~~~', '````']) {
    assert.deepEqual(findWideRows([fence, table('| 1 | 2 | 3 |'), fence].join('\n')), [], `inside ${fence}`);
  }
  // A longer fence is not closed by a shorter one.
  assert.deepEqual(findWideRows(['````', '```', table('| 1 | 2 | 3 |'), '````'].join('\n')), []);
});

test('the table ends where GitHub ends it: a blank line or another block', () => {
  assert.deepEqual(findWideRows([table('| 1 | 2 |'), '', 'x | y | z'].join('\n')), []);
  assert.deepEqual(findWideRows([table('| 1 | 2 |'), '- a list item | with | pipes'].join('\n')), []);
  assert.deepEqual(findWideRows([table('| 1 | 2 |'), '## a heading | with | pipes'].join('\n')), []);
  // A delimiter row whose cell count is not the header's makes no table at all.
  assert.deepEqual(findWideRows(['| A | B |', '|---|', '| 1 | 2 | 3 |'].join('\n')), []);
});

test('formatTables names every wide row and fails; a clean scan passes', () => {
  const bad = formatTables({ scanned: 2, wide: [{ file: 'a.md', line: 3, cells: 4, header: 2 }] });
  assert.equal(bad.code, 1);
  assert.match(bad.text, /^WIDE a\.md:3 4 cells, header 2$/m);
  assert.match(bad.text, /escape it as \\\| or reword the cell/);
  assert.match(bad.text, /tables: 2 file\(s\) \| wide rows: 1$/);
  const good = formatTables({ scanned: 2, wide: [] });
  assert.equal(good.code, 0);
  assert.equal(good.text, 'tables: 2 file(s) | wide rows: 0');
});

test('verifyTables says fail exactly when it found a wide row, so --json cannot print ok beside one', (t) => {
  // The architect's control on #417 forced `status: 'ok'` and stayed green: the CLI exits on formatTables' count,
  // but `docs verify --json` prints this object, and its status must agree with its own list.
  const dir = tempDir('docs-tables-', t);
  writeFileSync(join(dir, 'wide.md'), `${table('| 1 | `a | b` |')}\n`);
  writeFileSync(join(dir, 'clean.md'), `${table('| 1 | `a \\| b` |')}\n`);
  const wide = verifyTables({ root: dir, files: ['wide.md'] });
  assert.deepEqual([wide.status, wide.wide.length, wide.scanned], ['fail', 1, 1]);
  const clean = verifyTables({ root: dir, files: ['clean.md'] });
  assert.deepEqual([clean.status, clean.wide.length], ['ok', 0]);
  assert.equal(verifyTables({ root: dir, files: ['clean.md', 'wide.md'] }).status, 'fail');
});

test('the scan reads the tracked Markdown outside vendor/', () => {
  const files = trackedMarkdown(ROOT);
  assert.ok(files.length >= 200, `only ${files.length} file(s): the listing is wrong`);
  assert.equal(files.some((f) => f.startsWith('vendor/')), false, 'the corpus is upstream\'s, not ours to fix');
  assert.ok(files.includes('docs/validation/TEMPLATE.md') && files.includes('CLAUDE.md'));
});

test('ARC-09-C126 — no tracked Markdown table has a row wider than its header', () => {
  const r = verifyTables({ root: ROOT });
  assert.deepEqual(r.wide.map((w) => `${w.file}:${w.line}`), [], formatTables(r).text);
  assert.equal(r.status, 'ok');
});
