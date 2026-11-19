// Copyright 2026 Cvetomir Grigorov. Licensed under the Business Source License 1.1 (see LICENSE).
// snowarch — AI ServiceNow Architect. Not affiliated with or endorsed by ServiceNow, Inc.
/**
 * ARC-09-C302 — the table of remedies on the install page and in the README has a column for each platform.
 *
 * It had two columns, "macOS / Linux" and "Windows", and filled the first from the darwin sentence only, so a Linux reader was told
 * `xcode-select --install (or: brew install git)` and `brew install node@22`: two commands that cannot work on the machine in front of them.
 * tools/snowarch/lib/remedies.json has a sentence for linux in every row (ARC-06-S04), and bootstrap.sh prints it on Linux; only the page was wrong.
 *
 * A cell holds one line of the page. The Windows remedy for "not at the checkout root" has two lines (`pushd "{root}"`, then `.\bootstrap.cmd`), and a line
 * break inside a cell cuts the row on GitHub, so the generator makes each line a code span of its own and joins the spans with `<br>`.
 *
 * The table is generated (scripts/gen-readme.mjs) into docs/INSTALL.md and from there into README.md. The cases read it in three places: as the
 * generator makes it, as docs/INSTALL.md holds it and as README.md holds it, so a page that is stale, or edited by hand, fails here and not only in
 * the generators' check.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { remediesTable } from '../scripts/gen-readme.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => readFileSync(join(root, rel), 'utf8');
const remedies = JSON.parse(read('tools/snowarch/lib/remedies.json'));

const PLATFORMS = [['macOS', 'darwin'], ['Linux', 'linux'], ['Windows', 'win32']];

/**
 * A table as rows of cells. Every line is a row: a cell holds no pipe, so splitting a row on the pipe is exact, and a line that does not start with a pipe
 * is a row that a line break cut, which the next case names by itself.
 */
function cellsOf(table) {
  return table.split('\n').map((line, i) => {
    assert.ok(line.startsWith('|') && line.endsWith('|'), `line ${i + 1} of the table is not a row, a row was cut by a line break: ${line.slice(0, 70)}`);
    return line.split('|').slice(1, -1).map((cell) => cell.trim());
  });
}

/** What a remedy sentence is in a cell: each of its lines a code span of its own, the spans joined with a break, so the cell is one line of the page. */
const cellOf = (sentence) => String(sentence).split(/\r?\n/).map((line) => `\`${line}\``).join('<br>');

/** The generated region of a page: what a reader sees under "What to do if". */
function regionOf(rel) {
  const begin = '<!-- generated:remedies -->\n';
  const end = '\n<!-- /generated:remedies -->';
  const text = read(rel);
  const from = text.indexOf(begin);
  const to = text.indexOf(end);
  assert.ok(from >= 0 && to > from, `${rel} has no generated remedies region`);
  return text.slice(from + begin.length, to);
}

/** The remedy rows of remedies.json in the generator's order: a check, then its second cause when it has one. */
function remedyRows() {
  return Object.entries(remedies).filter(([id]) => !id.startsWith('$')).flatMap(([, r]) => [r, ...(r.offPath ? [r.offPath] : [])]);
}

/** What a column must not name: the tools of the other platforms. A macOS reader is not told apt, and a Linux reader is not told brew. */
const FOREIGN = Object.freeze({
  macOS: /\b(?:apt(?:-get)?|dnf|yum|winget|choco|scoop)\b/i,
  Linux: /xcode-select|\bbrew\b|\bhomebrew\b|\bwinget\b|\bchoco\b|\bscoop\b/i,
  Windows: /xcode-select|\bbrew\b|\bhomebrew\b|\bapt(?:-get)?\b|\bdnf\b|\byum\b/i,
});

const TABLES = [
  ['the generator', () => remediesTable(remedies)],
  ['docs/INSTALL.md', () => regionOf('docs/INSTALL.md')],
  ['README.md', () => regionOf('README.md')],
];

test('ARC-09-C302 — the table has a column for each platform, and each is filled from that platform\'s own remedy', () => {
  const [header, separator, ...body] = cellsOf(remediesTable(remedies));
  assert.deepEqual(header, ['If', 'macOS', 'Linux', 'Windows']);
  assert.equal(separator.length, 4);
  const expected = remedyRows();
  assert.equal(body.length, expected.length, 'a row of remedies.json is missing from the table, or one is added');
  body.forEach((cells, i) => {
    assert.equal(cells.length, 4, `row ${i + 1}`);
    assert.deepEqual(cells.slice(1), PLATFORMS.map(([, key]) => cellOf(expected[i][key] ?? expected[i].default)), `row ${i + 1}: ${cells[0]}`);
  });
});

test('ARC-09-C302 — a Linux reader is told nothing about xcode-select or brew, here or on the pages', () => {
  for (const [where, get] of TABLES) {
    const [header, , ...body] = cellsOf(get());
    const linux = header.indexOf('Linux');
    assert.notEqual(linux, -1, `${where}: no column is headed Linux (the headings are ${header.join(' · ')})`);
    for (const cells of body) assert.doesNotMatch(cells[linux], FOREIGN.Linux, `${where}: ${cells[0]}`);
  }
});

test('ARC-09-C302 — no column names the tools of another platform', () => {
  for (const [where, get] of TABLES) {
    const [header, , ...body] = cellsOf(get());
    for (const [name] of PLATFORMS) {
      const column = header.indexOf(name);
      assert.notEqual(column, -1, `${where}: no column is headed ${name}`);
      for (const cells of body) assert.doesNotMatch(cells[column], FOREIGN[name], `${where}, ${name}: ${cells[0]}`);
    }
  }
});

test('ARC-09-C302 — the install page and the README hold the table the generator makes, to the character', () => {
  const made = remediesTable(remedies);
  assert.equal(regionOf('docs/INSTALL.md'), made, 'docs/INSTALL.md is stale: run node scripts/gen-readme.mjs');
  assert.equal(regionOf('README.md'), made, 'README.md is stale: run node scripts/gen-readme.mjs');
});

test('ARC-09-C302 — the Linux sentences are the ones bootstrap.sh prints on Linux', () => {
  // The launcher is generated from the same file (scripts/gen-launcher-text.mjs), so a Linux reader meets one sentence in the terminal and on the page.
  const launcher = read('bootstrap.sh');
  const quoted = (value) => `'${String(value).replace(/'/g, `'\\''`)}'`;
  assert.ok(launcher.includes(`MSG_GIT_LINUX=${quoted(remedies.git.linux)}`), 'the launcher prints another git sentence on Linux than the page');
  assert.ok(launcher.includes(`MSG_NODE_LINUX=${quoted(remedies.node.linux)}`), 'the launcher prints another Node.js sentence on Linux than the page');
});

test('ARC-09-C302 — a platform with no sentence of its own in a row takes the row\'s default, as remedies.json says', () => {
  // Every row of the file has all three today, so only a made-up one can show it: a row with no linux sentence reads the default there.
  const [, , row] = cellsOf(remediesTable({ git: { darwin: 'for a Mac', win32: 'for Windows', default: 'for anything else' } }));
  assert.deepEqual(row.slice(1), ['`for a Mac`', '`for anything else`', '`for Windows`']);
});

test('ARC-09-C302 — every row of the table is one line, in the generator and on both pages', () => {
  for (const [where, get] of TABLES) {
    get().split('\n').forEach((line, i) => {
      assert.ok(line.startsWith('|') && line.endsWith('|'), `${where}, line ${i + 1}: a row is cut by a line break (${line.slice(0, 50)})`);
      // four cells and the two outer pipes: five pipes, six parts
      assert.equal(line.split('|').length, 6, `${where}, line ${i + 1}: a row has four cells (${line.slice(0, 50)})`);
    });
  }
});

test('ARC-09-C302 — the Windows remedy for "not at the checkout root" shows both of its lines, one under the other', () => {
  // `pushd "{root}"` and then `.\bootstrap.cmd` are typed one after the other, so the cell breaks the line between them.
  const SHOWN = '`pushd "{root}"`<br>`.\\bootstrap.cmd`';
  assert.equal(cellOf(remedies.root.win32), SHOWN, 'the Windows remedy for the checkout root is not the two lines this case reads');
  for (const [where, get] of TABLES) {
    const [header, , ...body] = cellsOf(get());
    const row = body.find((cells) => cells[0] === 'You are not at the checkout root');
    assert.ok(row, `${where}: no row for "You are not at the checkout root"`);
    assert.equal(row[header.indexOf('Windows')], SHOWN, `${where}: the Windows cell`);
  }
});

test('ARC-09-C302 — a remedy of several lines is one cell: a code span for each line, joined with a break, and a blank line is dropped', () => {
  const table = remediesTable({ git: { darwin: 'one', win32: 'first\nsecond\n\nthird\n', default: 'x' } });
  assert.equal(table.split('\n').length, 3, 'a header, a separator and one row');
  assert.deepEqual(cellsOf(table)[2].slice(1), ['`one`', '`x`', '`first`<br>`second`<br>`third`']);
});
