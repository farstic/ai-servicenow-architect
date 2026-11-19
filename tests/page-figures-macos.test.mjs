// Copyright 2026 Cvetomir Grigorov. Licensed under the Business Source License 1.1 (see LICENSE).
// snowarch — AI ServiceNow Architect. Not affiliated with or endorsed by ServiceNow, Inc.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import * as figures from '../scripts/lib/page-figures.mjs';

/**
 * ARC-09-C300 — the corpus figures of the two macOS guides, which the check of ARC-09-C283 and ARC-09-C290 did not read.
 *
 * The macOS guide and its HTML twin show a real run of the bootstrap on a Mac, `[docs] 51,186 files · 286 MB working tree`, and say that the Architect
 * reads "51,178 pages": the figures of the pin the install page states (ARC-09-C279). They were written once and nothing moves them, so a docs bump reads
 * them the way it reads the Windows guides, and compares them with the corpus's files and pages and with the working tree it measures itself. A Mac's
 * working tree is the Linux one that docs/INSTALL.md gives ("on Linux and macOS"), where a Windows guide's is the Windows one.
 */
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => readFileSync(join(root, rel), 'utf8');
const GUIDE = 'docs/INSTALL-MACOS.md';
const TWIN = 'docs/AI-Architect-macOS-Install-Guide.html';
const commas = (n) => n.toLocaleString('en-US');

/** The Markdown guide as it states the corpus: the example screen of a Mac's run, and the sentence under it. */
const markdown = ({ files, pages, mb }) => [
  '### 6c · It downloads the documentation', '', 'On screen:', '', '```', 'release manifest: v2.2.6 fetched (473 files)', '[docs] checkout --detach 96d3212 … 42.0 s',
  `[docs] names index … 28.8 s · 75,431 names · ${commas(pages)} pages · coverage full`, `[docs] ${commas(files)} files · ${mb} MB working tree`, 'citations: checked: 588 | dead: 0', '```', '',
  `This downloads all ${commas(pages)} pages of ServiceNow documentation that the Architect reads before it answers. The screen can sit`, 'still for a minute or two.', '',
].join('\n');

/** The HTML twin: the sentence in a paragraph, and the screen as a string of a JSON block, its line ends written as `\n`. */
const html = ({ files, pages, mb }) => [
  `        <p>This downloads all ${commas(pages)} pages of ServiceNow documentation that the Architect reads before it answers.</p>`,
  `  "docs": "release manifest: v2.2.6 fetched (473 files)\\n[docs] checkout --detach 96d3212 … 42.0 s\\n[docs] ${commas(files)} files · ${mb} MB working tree\\ncitations: checked: 588 | dead: 0",`,
].join('\n');

const FIGURES = { files: 51186, pages: 51178, workingTreeMb: 286 };

test('ARC-09-C300 — a macOS guide\'s files and working tree are read from its example screen, and its pages from the sentence, in the Markdown and in the HTML', () => {
  assert.deepEqual(figures.macosPageFigures(markdown({ files: 51186, pages: 51178, mb: 286 })), FIGURES);
  assert.deepEqual(figures.macosPageFigures(html({ files: 51186, pages: 51178, mb: 286 })), FIGURES);
  assert.deepEqual(figures.macosPageFigures(markdown({ files: 900, pages: 880, mb: 9 })), { files: 900, pages: 880, workingTreeMb: 9 }, 'no comma under a thousand');
  assert.deepEqual(figures.macosPageFigures(markdown({ files: 7, pages: 5, mb: 0 })), { files: 7, pages: 5, workingTreeMb: 0 }, 'a working tree of 0 MB is a figure, not a missing one');
});

test('ARC-09-C300 — a guide that does not state a figure in that shape gives null for it, never a guess', () => {
  assert.deepEqual(figures.macosPageFigures('# Install\n\nthe corpus is big\n'), { files: null, pages: null, workingTreeMb: null });
  const noScreen = figures.macosPageFigures(markdown({ files: 51186, pages: 51178, mb: 286 }).replaceAll('[docs] ', ''));
  assert.deepEqual(noScreen, { files: null, pages: 51178, workingTreeMb: null });
  const noSentence = figures.macosPageFigures(markdown({ files: 51186, pages: 51178, mb: 286 }).replace('downloads all', 'downloads'));
  assert.deepEqual(noSentence, { files: 51186, pages: null, workingTreeMb: 286 });
  // The names-index line of the screen says "51,178 pages" and is not the sentence: it must not be taken for it.
  const indexLineOnly = markdown({ files: 51186, pages: 51178, mb: 286 }).replace(/^This downloads all.*$/m, '');
  assert.equal(figures.macosPageFigures(indexLineOnly).pages, null);
});

test('ARC-09-C300 — a macOS guide is read as a Windows guide is: the shapes are the same, so the answer is', () => {
  for (const page of [markdown({ files: 51186, pages: 51178, mb: 286 }), html({ files: 51186, pages: 51178, mb: 286 }), '# Install\n']) {
    assert.deepEqual(figures.macosPageFigures(page), figures.windowsPageFigures(page));
  }
});

test('ARC-09-C300 — guides that state what the corpus says make one checked line each, and it says what they are', () => {
  const guide = { file: GUIDE, figures: FIGURES };
  const twin = { file: TWIN, figures: FIGURES };
  assert.deepEqual(figures.macosChecklist({ corpus: { files: 51186, pages: 51178, workingTreeMb: 286 }, macos: { guides: [guide, twin] } }), [
    `- [x] ${GUIDE} figures match the corpus: 51,186 files · 51,178 pages · 286 MB working tree`,
    `- [x] ${TWIN} figures match the corpus: 51,186 files · 51,178 pages · 286 MB working tree`,
  ]);
  // A tree of 0 MB is a figure too, and a guide that states it matches.
  assert.deepEqual(figures.macosChecklist({ corpus: { files: 13, pages: 7, workingTreeMb: 0 }, macos: { guides: [{ file: GUIDE, figures: { files: 13, pages: 7, workingTreeMb: 0 } }] } }),
    [`- [x] ${GUIDE} figures match the corpus: 13 files · 7 pages · 0 MB working tree`]);
});

test('ARC-09-C300 — a guide that differs makes an unchecked line that names each figure that differs, the corpus first, and no other', () => {
  const stale = { file: GUIDE, figures: { files: 51665, pages: 51665, workingTreeMb: 293 } };
  const near = { file: TWIN, figures: { files: 51186, pages: 51665, workingTreeMb: 286 } };
  const lines = figures.macosChecklist({ corpus: { files: 51186, pages: 51178, workingTreeMb: 286 }, macos: { guides: [stale, near] } });
  assert.equal(lines.length, 2);
  assert.equal(lines[0], `- [ ] ${GUIDE} figures differ from the corpus: files 51,186 (guide: 51,665) · pages 51,178 (guide: 51,665) · working tree 286 MB (guide: 293 MB)`);
  assert.equal(lines[1], `- [ ] ${TWIN} figures differ from the corpus: pages 51,178 (guide: 51,665)`);
});

test('ARC-09-C300 — a guide that does not state its figures, a guide that is not there, and a corpus that was not read are each said and not guessed', () => {
  const corpus = { files: 51186, pages: 51178, workingTreeMb: 286 };
  const unread = { file: GUIDE, figures: { files: 51186, pages: null, workingTreeMb: null } };
  assert.deepEqual(figures.macosChecklist({ corpus, macos: { guides: [unread, { file: TWIN, figures: null }] } }), [
    `- [ ] ${GUIDE} figures not checked: it does not state the pages and the working tree where the bump reads them`,
    `- [ ] ${TWIN} figures not checked: there is no ${TWIN} in this tree`,
  ]);
  for (const missing of ['files', 'pages', 'workingTreeMb']) {
    assert.deepEqual(figures.macosChecklist({ corpus: { ...corpus, [missing]: null }, macos: { guides: [{ file: GUIDE, figures: FIGURES }] } }),
      ['- [ ] macOS guide figures not checked: the corpus\'s files, pages or working tree could not be read'], `a corpus with no ${missing}`);
  }
  assert.deepEqual(figures.macosChecklist({ corpus: null, macos: { guides: [{ file: GUIDE, figures: FIGURES }] } }), []);
  assert.deepEqual(figures.macosChecklist({ corpus, macos: null }), []);
});

test('ARC-09-C300 — the working tree is the corpus\'s own: the Windows figure of the install page is not what a macOS guide is held to', () => {
  // The install page gives 293 MB for Windows and 286 for Linux and macOS (ARC-09-C279). A macOS guide that states the Windows 293 differs from the corpus's
  // 286, and one that states 286 matches it: the checklist is given the corpus and the guides, and never the install page.
  const corpus = { files: 51186, pages: 51178, workingTreeMb: 286 };
  const lines = figures.macosChecklist({ corpus, macos: { guides: [{ file: GUIDE, figures: { ...FIGURES, workingTreeMb: 293 } }, { file: TWIN, figures: FIGURES }] } });
  assert.deepEqual(lines, [
    `- [ ] ${GUIDE} figures differ from the corpus: working tree 286 MB (guide: 293 MB)`,
    `- [x] ${TWIN} figures match the corpus: 51,186 files · 51,178 pages · 286 MB working tree`,
  ]);
});

test('ARC-09-C300 — the real macOS guides state the corpus as the install page does: its files, its Linux and macOS working tree, and one page count in both', () => {
  const install = read('docs/INSTALL.md');
  const { files, workingTreeMb } = figures.pageFigures(install);
  assert.ok(Number.isInteger(files) && Number.isInteger(workingTreeMb), 'docs/INSTALL.md no longer states its files and its Linux and macOS working tree where the bump reads them');
  const states = [GUIDE, TWIN].map((file) => [file, figures.macosPageFigures(read(file))]);
  for (const [file, guide] of states) {
    for (const [name, value] of Object.entries(guide)) assert.ok(Number.isInteger(value) && value > 0, `${file} no longer states ${name} in the shape the bump reads`);
    assert.equal(guide.files, files, `${file} shows ${guide.files} files, docs/INSTALL.md says ${files}`);
    assert.equal(guide.workingTreeMb, workingTreeMb, `${file} shows a ${guide.workingTreeMb} MB working tree, docs/INSTALL.md says ${workingTreeMb} MB on Linux and macOS`);
    assert.ok(guide.pages <= files, `${file} says ${guide.pages} pages in a corpus of ${files} files`);
  }
  assert.equal(states[0][1].pages, states[1][1].pages, 'the Markdown guide and the HTML guide count different pages');
  // The install page does not state the pages, so the one number the macOS pair can be held to is the Windows pair's: both describe the same corpus.
  const windows = figures.windowsPageFigures(read('docs/INSTALL-WINDOWS.md'));
  assert.equal(states[0][1].pages, windows.pages, `the macOS guides say ${states[0][1].pages} pages and docs/INSTALL-WINDOWS.md says ${windows.pages}`);
});
