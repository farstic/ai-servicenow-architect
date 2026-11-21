// Copyright 2026 Cvetomir Grigorov. Licensed under the Business Source License 1.1 (see LICENSE).
// snowarch — AI ServiceNow Architect. Not affiliated with or endorsed by ServiceNow, Inc.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import * as figures from '../scripts/lib/page-figures.mjs';

/**
 * ARC-09-C306 — the corpus figure of the user guide's page, which the checks of ARC-09-C283, ARC-09-C290 and ARC-09-C300 did not read.
 *
 * The user guide's page states the corpus once, in the words of the install page: "all 54 areas and 51,186 files". It states no size and no pin, and its example screens carry
 * placeholders (`<n>/<n> areas`), so the files and the areas are the whole of what a docs bump can hold it to. The two numbers were written once, and nothing moves them, so a bump
 * reads them the way it reads the guides' and says in its pull request whether they follow the corpus. What the bump reports is the same words the install page's check uses; it
 * is the page's own checklist line because the page is a file of its own, and a stale line has to name it.
 */
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => readFileSync(join(root, rel), 'utf8');
const PAGE = 'docs/AI-Architect-User-Guide.html';
const commas = (n) => n.toLocaleString('en-US');

/** The page as it states the corpus: a sentence in a paragraph, with the markup of the paragraph around it. */
const html = ({ areas, files }) => `<p>Your folder holds ServiceNow's product documentation. The install takes the whole of it: all ${areas} areas and ${commas(files)} files. What it costs is on the install page.</p>`;

const FIGURES = { areas: 54, files: 51186 };

test('ARC-09-C306 — the user guide\'s areas and files are read from the sentence the install page uses, in a paragraph of the HTML', () => {
  assert.deepEqual(figures.userGuidePageFigures(html({ areas: 54, files: 51186 })), FIGURES);
  assert.deepEqual(figures.userGuidePageFigures(html({ areas: 9, files: 900 })), { areas: 9, files: 900 }, 'no comma under a thousand');
  assert.deepEqual(figures.userGuidePageFigures(html({ areas: 0, files: 0 })), { areas: 0, files: 0 }, '0 is a figure, not a missing one');
  // The text is flattened before it is read, so a sentence that a line end cuts is still the sentence; a figure cut by a tag is not.
  assert.deepEqual(figures.userGuidePageFigures('<p>the whole of it: all 54 areas\n      and 51,186 files.</p>'), FIGURES);
  assert.deepEqual(figures.userGuidePageFigures('<p>all <b>54</b> areas and 51,186 files</p>'), { areas: null, files: null }, 'a tag inside the phrase hides it from the bump, so it is not read');
});

test('ARC-09-C306 — a page that does not state the corpus in those words gives null, never a guess', () => {
  assert.deepEqual(figures.userGuidePageFigures('<p>the corpus is big</p>'), { areas: null, files: null });
  assert.deepEqual(figures.userGuidePageFigures(''), { areas: null, files: null });
  assert.deepEqual(figures.userGuidePageFigures(undefined), { areas: null, files: null });
  // Another sentence with the same numbers in other words is not the statement: only the install page's words are read.
  assert.deepEqual(figures.userGuidePageFigures('<p>54 areas, 51,186 files</p>'), { areas: null, files: null });
  assert.deepEqual(figures.userGuidePageFigures('<p>about 490 MB on disk</p>'), { areas: null, files: null });
});

test('ARC-09-C306 — the user guide is read as the install page is: the same words, so the same answer for the two numbers they share', () => {
  for (const page of [html({ areas: 54, files: 51186 }), 'all 54 areas and 51,186 files', '# Install\n']) {
    const { areas, files } = figures.pageFigures(page);
    assert.deepEqual(figures.userGuidePageFigures(page), { areas, files });
  }
});

test('ARC-09-C306 — a page that states what the corpus says makes one checked line, and it says what they are', () => {
  const guide = { file: PAGE, figures: FIGURES };
  assert.deepEqual(figures.userGuideChecklist({ corpus: { files: 51186, areas: 54 }, guides: [guide] }),
    [`- [x] ${PAGE} figures match the corpus: 51,186 files · 54 areas`]);
  // A corpus that carries more than the two numbers (the bump's own) is held to those two.
  assert.deepEqual(figures.userGuideChecklist({ corpus: { files: 51186, areas: 54, pages: 51178, workingTreeMb: 286 }, guides: [guide] }),
    [`- [x] ${PAGE} figures match the corpus: 51,186 files · 54 areas`]);
  assert.deepEqual(figures.userGuideChecklist({ corpus: { files: 13, areas: 0 }, guides: [{ file: PAGE, figures: { files: 13, areas: 0 } }] }),
    [`- [x] ${PAGE} figures match the corpus: 13 files · 0 areas`]);
});

test('ARC-09-C306 — a page that differs makes an unchecked line that names each figure that differs, the corpus first, and no other', () => {
  const corpus = { files: 51186, areas: 54 };
  assert.deepEqual(figures.userGuideChecklist({ corpus, guides: [{ file: PAGE, figures: { files: 51665, areas: 56 } }] }),
    [`- [ ] ${PAGE} figures differ from the corpus: files 51,186 (guide: 51,665) · areas 54 (guide: 56)`]);
  assert.deepEqual(figures.userGuideChecklist({ corpus, guides: [{ file: PAGE, figures: { files: 51300, areas: 54 } }] }),
    [`- [ ] ${PAGE} figures differ from the corpus: files 51,186 (guide: 51,300)`]);
  assert.deepEqual(figures.userGuideChecklist({ corpus, guides: [{ file: PAGE, figures: { files: 51186, areas: 56 } }] }),
    [`- [ ] ${PAGE} figures differ from the corpus: areas 54 (guide: 56)`]);
});

test('ARC-09-C306 — a page that does not state its figures, a page that is not there, and a corpus that was not read are each said and not guessed', () => {
  const corpus = { files: 51186, areas: 54 };
  assert.deepEqual(figures.userGuideChecklist({ corpus, guides: [{ file: PAGE, figures: { files: null, areas: null } }] }),
    [`- [ ] ${PAGE} figures not checked: it does not state the files and the areas where the bump reads them`]);
  assert.deepEqual(figures.userGuideChecklist({ corpus, guides: [{ file: PAGE, figures: { files: 51186, areas: null } }] }),
    [`- [ ] ${PAGE} figures not checked: it does not state the areas where the bump reads them`]);
  assert.deepEqual(figures.userGuideChecklist({ corpus, guides: [{ file: PAGE, figures: null }] }),
    [`- [ ] ${PAGE} figures not checked: there is no ${PAGE} in this tree`]);
  for (const missing of ['files', 'areas']) {
    assert.deepEqual(figures.userGuideChecklist({ corpus: { ...corpus, [missing]: null }, guides: [{ file: PAGE, figures: FIGURES }] }),
      ['- [ ] user guide figures not checked: the corpus\'s files or areas could not be read'], `a corpus with no ${missing}`);
  }
  assert.deepEqual(figures.userGuideChecklist({ corpus: null, guides: [{ file: PAGE, figures: FIGURES }] }), []);
  assert.deepEqual(figures.userGuideChecklist({ corpus, guides: null }), []);
  assert.deepEqual(figures.userGuideChecklist({ corpus, guides: [] }), []);
});

test('ARC-09-C306 — the real user guide states the corpus as the install page does, and nothing else of it', () => {
  const install = figures.pageFigures(read('docs/INSTALL.md'));
  assert.ok(Number.isInteger(install.files) && Number.isInteger(install.areas), 'docs/INSTALL.md no longer states its areas and files where the bump reads them');
  const page = figures.userGuidePageFigures(read(PAGE));
  for (const [name, value] of Object.entries(page)) assert.ok(Number.isInteger(value) && value > 0, `${PAGE} no longer states ${name} in the shape the bump reads`);
  assert.equal(page.areas, install.areas, `${PAGE} shows ${page.areas} areas, docs/INSTALL.md says ${install.areas}`);
  assert.equal(page.files, install.files, `${PAGE} shows ${page.files} files, docs/INSTALL.md says ${install.files}`);
});
