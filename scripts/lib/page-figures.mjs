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
