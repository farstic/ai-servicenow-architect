// Copyright 2026 Cvetomir Grigorov. Licensed under the Business Source License 1.1 (see LICENSE).
// snowarch — AI ServiceNow Architect. Not affiliated with or endorsed by ServiceNow, Inc.
/**
 * ARC-09-C271 — a licence number on a page is the placeholder, `LIC-2026-0000`.
 *
 * A licence number is an identifier, not a credential: the licence is a signed file that stays with its holder. But the pages are public, and one
 * placeholder, used everywhere a page shows a licence file or a status line, is what keeps a holder's number from being copied into one by hand
 * (the example in the Windows page's step that looks for the file in Downloads was the case that made this a test).
 *
 * WHAT IS SCANNED: README.md and every file tracked under docs/. WHAT IS NOT: the tests and their fixtures, which need ids of their own (a case that
 * checks what the product reads and prints needs an id that is not the placeholder). Two folders under docs/ are engineering records and not pages: the
 * plans, and the validation records of the sittings, whose ids are the test licences of those sittings and whose meaning is the difference between one
 * and the next. They are exempt by path, and each is COUNTED, so the number cannot grow unless somebody changes it here on purpose.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { trackedFiles } from '../scripts/lib/distribution.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PLACEHOLDER = 'LIC-2026-0000';
const ID = /LIC-\d{4}-\d{4}/gi;

/** The engineering records under docs/, and how many ids other than the placeholder each holds today (counted on 2026-11-12). */
const RECORDS = new Map([['docs/plans/', 3], ['docs/validation/', 35]]);

/** Every licence id in the text that is not the placeholder. The placeholder in any letter case is the placeholder; another year is not. */
const foreign = (text) => (text.match(ID) ?? []).filter((id) => id.toUpperCase() !== PLACEHOLDER);
const isPage = (file) => file === 'README.md' || file.startsWith('docs/');
const recordOf = (file) => [...RECORDS.keys()].find((prefix) => file.startsWith(prefix)) ?? null;

/**
 * The files outside the records that hold a foreign id, and the foreign ids each record holds. `read` returns a file's text, or null for one that
 * is not text. The planted cases run this function and not a copy of it.
 */
function scan(files, read) {
  const pages = [];
  const records = new Map([...RECORDS.keys()].map((prefix) => [prefix, 0]));
  for (const file of files.filter(isPage)) {
    const text = read(file);
    if (text === null) continue;
    const ids = foreign(text);
    const record = recordOf(file);
    if (record) records.set(record, records.get(record) + ids.length);
    else if (ids.length > 0) pages.push({ file, ids });
  }
  return { pages, records };
}

/** A tracked file's text from the working tree; null for a binary file (a NUL byte) and for one that is not there. */
function readText(file) {
  try {
    const bytes = readFileSync(join(root, file));
    return bytes.includes(0) ? null : bytes.toString('utf8');
  } catch { return null; }
}

const files = trackedFiles(root);
const found = scan(files, readText);

test('ARC-09-C271 — every page a reader opens uses the placeholder licence number', () => {
  const list = found.pages.map((p) => `${p.file}: ${p.ids.length} (${[...new Set(p.ids)].join(', ')})`);
  assert.deepEqual(list, [], `a page carries a licence number that is not ${PLACEHOLDER}; use the placeholder (the number of a real licence does not belong on a public page)`);
});

test('ARC-09-C271 — the engineering records hold exactly the ids they are counted for', () => {
  for (const [prefix, want] of RECORDS) {
    assert.equal(found.records.get(prefix), want,
      `${prefix} holds ${found.records.get(prefix)} licence ids other than the placeholder, counted for ${want}; a new one is a deliberate change of that count, here`);
  }
});

test('ARC-09-C271 — the scan reads the pages it is about: a floor, and the placeholder seen where it is known to be', () => {
  const pages = files.filter(isPage);
  assert.ok(pages.length >= 400, `the scan found ${pages.length} files under docs/ and README.md, which is fewer than the tree has`);
  for (const must of ['README.md', 'docs/INSTALL.md', 'docs/INSTALL-WINDOWS.md', 'docs/USER-GUIDE.md']) assert.ok(pages.includes(must), `${must} is not in the scan`);
  // The Windows page uses the placeholder in several steps; a pattern that saw none of them would pass a tree full of real numbers.
  assert.ok((readText('docs/INSTALL-WINDOWS.md').match(ID) ?? []).length >= 5, 'the pattern does not see the ids on the Windows page');
  // And the records are really where the count says: a folder that vanished would pass a count of zero only if its count were zero.
  for (const [prefix, want] of RECORDS) assert.ok(want > 0 && files.some((f) => f.startsWith(prefix)), `${prefix} has no files, or nothing is counted for it`);
});

test('ARC-09-C271 — a planted number fails the scan, the placeholder passes, and a record is counted and not reported', () => {
  const text = {
    'README.md': 'cp ~/Downloads/LIC-2026-0000.json .local/licence.json',
    'docs/INSTALL-WINDOWS.md': 'Look at the Name column, for example `LIC-2026-9014.json`.',                 // the defect this file exists for
    'docs/guide/new-page.md': 'issued as lic-2027-0000, and LIC-2026-0000 again',                              // another year, lower case: not the placeholder
    'docs/guide/lower.md': 'the placeholder in lower case: lic-2026-0000',                                      // the placeholder, however it is cased
    'docs/validation/sitting.md': 'LIC-2026-9003 expired and LIC-2026-9004 was revoked',                      // a record: counted, not a page
    'docs/plans/row.md': 'LIC-2026-9010',
    'tests/fixtures/licence.json': '{"id":"LIC-2026-9099"}',                                                     // a fixture: not a page
    'packages/snowarch/src/x.ts': 'LIC-2026-9099',
    'docs/diagram.png': null,                                                                                    // not text
  };
  const r = scan(Object.keys(text), (file) => text[file]);
  assert.deepEqual(r.pages.map((p) => p.file), ['docs/INSTALL-WINDOWS.md', 'docs/guide/new-page.md']);
  assert.deepEqual(r.pages[0].ids, ['LIC-2026-9014']);
  assert.deepEqual(r.pages[1].ids, ['lic-2027-0000']);
  assert.equal(r.records.get('docs/validation/'), 2);
  assert.equal(r.records.get('docs/plans/'), 1);
  // A page with nothing but the placeholder reports nothing.
  assert.deepEqual(scan(['README.md'], () => 'LIC-2026-0000.json twice: LIC-2026-0000').pages, []);
});
