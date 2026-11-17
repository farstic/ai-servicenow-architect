// Copyright 2026 Cvetomir Grigorov. Licensed under the Business Source License 1.1 (see LICENSE).
// snowarch — AI ServiceNow Architect. Not affiliated with or endorsed by ServiceNow, Inc.
// ARC-09-C283 — the install page's corpus figures, read from the page, and the line a docs-bump pull request prints with the
// corpus's own.
//
// The page states three figures about the corpus in "What the corpus costs": its areas, its files, and the working tree on Linux and
// macOS. Nothing on the page follows the corpus: the 96d3212 bump took two areas and 480 files out, and the page went on saying 56 areas
// and 51,665 files until a person noticed (ARC-09-C279). The bump has the fresh corpus on disk and the page in the tree, so its body
// can say, at the moment of the bump, whether the three still hold. The Windows working tree is not compared: it counts line endings
// a Linux checkout does not have.
//
// ARC-09-C290 — the two Windows guides state the corpus as well, and were left on the old pin: an example screen with `[docs] <files> files · <n> MB
// working tree` (a Windows run's, so the Windows working tree) and the sentence "downloads all <n> pages". The bump compares them with the corpus's files
// and pages, and with the Windows working tree that the install page gives, which no Linux checkout can measure.

/** `{ areas, files, workingTreeMb }` as the page states them in "What the corpus costs", each `null` when it does not. */
export function pageFigures(text) {
  const flat = String(text ?? '').replace(/\s+/g, ' ');
  const corpus = /all (\d+) areas and ([\d,]+) files/.exec(flat);
  const tree = /\*\*working tree\*\* is (\d+) MB on Linux/.exec(flat);
  return {
    areas: corpus ? Number(corpus[1]) : null,
    files: corpus ? Number(corpus[2].replaceAll(',', '')) : null,
    workingTreeMb: tree ? Number(tree[1]) : null,
  };
}

const commas = (n) => n.toLocaleString('en-US');

/** The three figures, each as the page words it, in the order the lines name them. */
const FIGURES = Object.freeze([
  { key: 'files', noun: 'the files', show: (n) => `files ${commas(n)}`, plain: (n) => `${commas(n)} files`, page: (n) => commas(n) },
  { key: 'areas', noun: 'the areas', show: (n) => `areas ${n}`, plain: (n) => `${n} areas`, page: (n) => String(n) },
  { key: 'workingTreeMb', noun: 'the Linux working tree', show: (n) => `working tree ${n} MB`, plain: (n) => `${n} MB working tree`,
    page: (n) => `${n} MB` },
]);

const joined = (items) => (items.length > 1 ? `${items.slice(0, -1).join(', ')} and ${items.at(-1)}` : items[0]);

/**
 * The checklist lines for a bump's pull-request body: what the corpus measures, next to what the page says. `corpus` is
 * `{ files, areas, workingTreeMb }` or `null` when the corpus was not measured (then there is nothing to say); `page` is
 * `pageFigures`' answer, or `null` when the tree has no install page.
 */
export function figuresChecklist({ corpus, page }) {
  if (!corpus) return [];
  if (!page) return ['- [ ] install page figures not checked: there is no docs/INSTALL.md in this tree'];
  const unread = FIGURES.filter((f) => page[f.key] === null);
  if (unread.length > 0) {
    return [`- [ ] install page figures not checked: docs/INSTALL.md does not state ${joined(unread.map((f) => f.noun))} where the bump reads them`];
  }
  const differ = FIGURES.filter((f) => corpus[f.key] !== page[f.key]);
  if (differ.length === 0) {
    return [`- [x] install page figures match the corpus: ${FIGURES.map((f) => f.plain(corpus[f.key])).join(' · ')}`];
  }
  return [`- [ ] install page figures differ from the corpus (docs/INSTALL.md, "What the corpus costs"): `
    + `${differ.map((f) => `${f.show(corpus[f.key])} (page: ${f.page(page[f.key])})`).join(' · ')}`];
}

/**
 * `{ files, pages, workingTreeMb }` as a Windows guide states them (ARC-09-C290): the files and the working tree on its example screen,
 * `[docs] 51,186 files · 293 MB working tree`, and the pages in the sentence under it, "downloads all 51,178 pages". The Markdown guide and
 * its HTML twin say both the same way, the screen in the twin being a string of a JSON block. Each is `null` when the guide does not.
 */
export function windowsPageFigures(text) {
  const flat = String(text ?? '').replace(/\s+/g, ' ');
  const screen = /\[docs\] ([\d,]+) files · (\d+) MB working tree/.exec(flat);
  const pages = /downloads all ([\d,]+) pages/.exec(flat);
  return {
    files: screen ? Number(screen[1].replaceAll(',', '')) : null,
    pages: pages ? Number(pages[1].replaceAll(',', '')) : null,
    workingTreeMb: screen ? Number(screen[2]) : null,
  };
}

/** The Windows working tree, in megabytes, as the install page gives it in "What the corpus costs"; `null` when it does not. */
export function installWindowsMb(text) {
  const flat = String(text ?? '').replace(/\s+/g, ' ');
  const tree = /\*\*working tree\*\* is \d+ MB on Linux and macOS and (\d+) MB on Windows/.exec(flat);
  return tree ? Number(tree[1]) : null;
}

/** The figures of a Windows guide, each as the checklist words it. */
const WINDOWS_FIGURES = Object.freeze([
  { key: 'files', noun: 'the files', show: (n) => `files ${commas(n)}`, plain: (n) => `${commas(n)} files`, guide: (n) => commas(n) },
  { key: 'pages', noun: 'the pages', show: (n) => `pages ${commas(n)}`, plain: (n) => `${commas(n)} pages`, guide: (n) => commas(n) },
  { key: 'workingTreeMb', noun: 'the working tree', show: (n) => `Windows working tree ${n} MB`, plain: (n) => `${n} MB working tree`, guide: (n) => `${n} MB` },
]);

/**
 * The checklist lines for a bump's pull-request body about the Windows guides, one for each (ARC-09-C290). `corpus` is `{ files, pages }` as the fresh
 * corpus has them, or `null` when it was not measured (then there is nothing to say); `windows` is `{ workingTreeMb, guides: [{ file, figures }] }`: the
 * Windows working tree that the install page gives, and each guide's `windowsPageFigures`, or `null` for a guide that is not in the tree.
 */
export function windowsChecklist({ corpus, windows }) {
  if (!corpus || !windows) return [];
  const expected = { files: corpus.files ?? null, pages: corpus.pages ?? null, workingTreeMb: windows.workingTreeMb ?? null };
  if (WINDOWS_FIGURES.some((f) => expected[f.key] === null)) {
    return ['- [ ] Windows guide figures not checked: the corpus\'s pages, or the Windows working tree of docs/INSTALL.md, could not be read'];
  }
  return windows.guides.map(({ file, figures }) => {
    if (figures === null) return `- [ ] ${file} figures not checked: there is no ${file} in this tree`;
    const unread = WINDOWS_FIGURES.filter((f) => figures[f.key] === null);
    if (unread.length > 0) return `- [ ] ${file} figures not checked: it does not state ${joined(unread.map((f) => f.noun))} where the bump reads them`;
    const differ = WINDOWS_FIGURES.filter((f) => expected[f.key] !== figures[f.key]);
    if (differ.length === 0) return `- [x] ${file} figures match the corpus: ${WINDOWS_FIGURES.map((f) => f.plain(expected[f.key])).join(' · ')}`;
    return `- [ ] ${file} figures differ from the corpus: ${differ.map((f) => `${f.show(expected[f.key])} (guide: ${f.guide(figures[f.key])})`).join(' · ')}`;
  });
}
