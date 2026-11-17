// Copyright 2026 Cvetomir Grigorov. Licensed under the Business Source License 1.1 (see LICENSE).
// snowarch — AI ServiceNow Architect. Not affiliated with or endorsed by ServiceNow, Inc.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import * as figures from '../scripts/lib/page-figures.mjs';
import { installPage } from './helpers/docs-fixture.mjs';

/**
 * ARC-09-C290 — the corpus figures of the two Windows guides, which ARC-09-C283's check did not read.
 *
 * The 96d3212 bump moved the install page to 54 areas and 51,186 files and its Windows working tree to 293 MB (ARC-09-C279), and the page's
 * check (ARC-09-C283) reads only docs/INSTALL.md. The Windows guide and its HTML twin went on showing a real run of the old pin, `[docs] 51,665
 * files · 299 MB working tree`, and saying that the Architect reads "51,665 pages". The figures a guide states are now read the way the install
 * page's are, and compared at the bump with the corpus and with the install page's Windows working tree.
 */
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => readFileSync(join(root, rel), 'utf8');
const GUIDE = 'docs/INSTALL-WINDOWS.md';
const TWIN = 'docs/AI-Architect-Windows-Install-Guide.html';
const commas = (n) => n.toLocaleString('en-US');

/** The Markdown guide as it states the corpus: an example screen, and the sentence under it. */
const markdown = ({ files, pages, mb }) => [
  '### 6c · It downloads the documentation', '', 'On screen:', '', '```', 'release manifest: v2.2.5 fetched (473 files)', '[docs] checkout --detach 96d3212 … 89.9 s',
  `[docs] ${commas(files)} files · ${mb} MB working tree`, 'citations: checked: 588 | dead: 0', '```', '',
  `This downloads all ${commas(pages)} pages of ServiceNow documentation that the Architect reads before it answers. The screen can`, 'sit still for a minute or two.', '',
].join('\n');

/** The HTML twin: the sentence in a paragraph, and the screen as a string of a JSON block, its line ends written as `\n`. */
const html = ({ files, pages, mb }) => [
  `        <p>This downloads all ${commas(pages)} pages of ServiceNow documentation that the Architect reads before it answers.</p>`,
  `  "docs": "release manifest: v2.2.5 fetched (473 files)\\n[docs] checkout --detach 96d3212 … 89.9 s\\n[docs] ${commas(files)} files · ${mb} MB working tree\\ncitations: checked: 588 | dead: 0",`,
].join('\n');

const FIGURES = { files: 51186, pages: 51178, workingTreeMb: 293 };

test('ARC-09-C290 — a Windows guide\'s files and working tree are read from its example screen, and its pages from the sentence, in the Markdown and in the HTML', () => {
  assert.deepEqual(figures.windowsPageFigures(markdown({ files: 51186, pages: 51178, mb: 293 })), FIGURES);
  assert.deepEqual(figures.windowsPageFigures(html({ files: 51186, pages: 51178, mb: 293 })), FIGURES);
  assert.deepEqual(figures.windowsPageFigures(markdown({ files: 900, pages: 880, mb: 9 })), { files: 900, pages: 880, workingTreeMb: 9 }, 'no comma under a thousand');
});

test('ARC-09-C290 — a guide that does not state a figure in that shape gives null for it, never a guess', () => {
  assert.deepEqual(figures.windowsPageFigures('# Install\n\nthe corpus is big\n'), { files: null, pages: null, workingTreeMb: null });
  const noScreen = figures.windowsPageFigures(markdown({ files: 51186, pages: 51178, mb: 293 }).replaceAll('[docs] ', ''));
  assert.deepEqual(noScreen, { files: null, pages: 51178, workingTreeMb: null });
  const noSentence = figures.windowsPageFigures(markdown({ files: 51186, pages: 51178, mb: 293 }).replace('downloads all', 'downloads'));
  assert.deepEqual(noSentence, { files: 51186, pages: null, workingTreeMb: 293 });
});

test('ARC-09-C290 — the install page\'s Windows working tree is read from its corpus costs, across the wrapped lines', () => {
  assert.equal(figures.installWindowsMb(installPage({ areas: 54, files: 51186, mb: 286 })), 293);
  assert.equal(figures.installWindowsMb('# Install\n'), null);
});

test('ARC-09-C290 — guides that state what the corpus and the install page say make one checked line each, and it says what they are', () => {
  const guide = { file: GUIDE, figures: FIGURES };
  const twin = { file: TWIN, figures: FIGURES };
  assert.deepEqual(figures.windowsChecklist({ corpus: { files: 51186, pages: 51178 }, windows: { workingTreeMb: 293, guides: [guide, twin] } }), [
    `- [x] ${GUIDE} figures match the corpus: 51,186 files · 51,178 pages · 293 MB working tree`,
    `- [x] ${TWIN} figures match the corpus: 51,186 files · 51,178 pages · 293 MB working tree`,
  ]);
});

test('ARC-09-C290 — a guide that differs makes an unchecked line that names each figure that differs, the corpus first, and no other', () => {
  const stale = { file: GUIDE, figures: { files: 51665, pages: 51665, workingTreeMb: 299 } };
  const near = { file: TWIN, figures: { files: 51186, pages: 51665, workingTreeMb: 293 } };
  const lines = figures.windowsChecklist({ corpus: { files: 51186, pages: 51178 }, windows: { workingTreeMb: 293, guides: [stale, near] } });
  assert.equal(lines.length, 2);
  assert.equal(lines[0], `- [ ] ${GUIDE} figures differ from the corpus: files 51,186 (guide: 51,665) · pages 51,178 (guide: 51,665) · Windows working tree 293 MB (guide: 299 MB)`);
  assert.equal(lines[1], `- [ ] ${TWIN} figures differ from the corpus: pages 51,178 (guide: 51,665)`);
});

test('ARC-09-C290 — a guide that does not state its figures, a guide that is not there, and a source that was not read are each said and not guessed', () => {
  const corpus = { files: 51186, pages: 51178 };
  const unread = { file: GUIDE, figures: { files: 51186, pages: null, workingTreeMb: null } };
  assert.deepEqual(figures.windowsChecklist({ corpus, windows: { workingTreeMb: 293, guides: [unread, { file: TWIN, figures: null }] } }), [
    `- [ ] ${GUIDE} figures not checked: it does not state the pages and the working tree where the bump reads them`,
    `- [ ] ${TWIN} figures not checked: there is no ${TWIN} in this tree`,
  ]);
  assert.deepEqual(figures.windowsChecklist({ corpus: { files: 51186, pages: null }, windows: { workingTreeMb: 293, guides: [{ file: GUIDE, figures: FIGURES }] } }),
    ['- [ ] Windows guide figures not checked: the corpus\'s pages, or the Windows working tree of docs/INSTALL.md, could not be read']);
  assert.deepEqual(figures.windowsChecklist({ corpus: null, windows: { workingTreeMb: 293, guides: [{ file: GUIDE, figures: FIGURES }] } }), []);
  assert.deepEqual(figures.windowsChecklist({ corpus, windows: null }), []);
});

test('ARC-09-C290 — the real Windows guides state the corpus as the install page does: its files, its Windows working tree, and one page count in both', () => {
  const install = read('docs/INSTALL.md');
  const files = figures.pageFigures(install).files;
  const windowsMb = figures.installWindowsMb(install);
  assert.ok(Number.isInteger(files) && Number.isInteger(windowsMb), 'docs/INSTALL.md no longer states its files and its Windows working tree where the bump reads them');
  const states = [GUIDE, TWIN].map((file) => [file, figures.windowsPageFigures(read(file))]);
  for (const [file, guide] of states) {
    for (const [name, value] of Object.entries(guide)) assert.ok(Number.isInteger(value) && value > 0, `${file} no longer states ${name} in the shape the bump reads`);
    assert.equal(guide.files, files, `${file} shows ${guide.files} files, docs/INSTALL.md says ${files}`);
    assert.equal(guide.workingTreeMb, windowsMb, `${file} shows a ${guide.workingTreeMb} MB working tree, docs/INSTALL.md says ${windowsMb} MB on Windows`);
    assert.ok(guide.pages <= files, `${file} says ${guide.pages} pages in a corpus of ${files} files`);
  }
  assert.equal(states[0][1].pages, states[1][1].pages, 'the Markdown guide and the HTML guide count different pages');
});
