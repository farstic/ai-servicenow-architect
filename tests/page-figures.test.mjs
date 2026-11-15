// Copyright 2026 Cvetomir Grigorov. Licensed under the Business Source License 1.1 (see LICENSE).
// snowarch — AI ServiceNow Architect. Not affiliated with or endorsed by ServiceNow, Inc.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { figuresChecklist, pageFigures } from '../scripts/lib/page-figures.mjs';
import { installPage } from './helpers/docs-fixture.mjs';

/**
 * ARC-09-C283 — the install page's corpus figures, and the line a docs-bump pull request prints next to the corpus's own.
 *
 * Nothing on the page follows the corpus: the 96d3212 bump took two areas and 480 files out, and the page went on saying 56 areas and
 * 51,665 files until a person noticed (ARC-09-C279). The bump has the fresh corpus on disk and the page in the tree, so its body can
 * say, at the moment of the bump, whether the three figures the page states still hold.
 */
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const CORPUS = { files: 51186, areas: 54, workingTreeMb: 286 };

test('ARC-09-C283 — the page\'s areas, files and Linux working tree are read from the paragraph, across its wrapped lines', () => {
  assert.deepEqual(pageFigures(installPage({ areas: 54, files: 51186, mb: 286 })), { areas: 54, files: 51186, workingTreeMb: 286 });
  assert.deepEqual(pageFigures(installPage({ areas: 7, files: 1200, mb: 9 })), { areas: 7, files: 1200, workingTreeMb: 9 },
    'a count under a thousand has no comma, and the Windows figure is not the Linux one');
});

test('ARC-09-C283 — a page that does not state a figure in that shape gives null for it, never a guess', () => {
  const none = { areas: null, files: null, workingTreeMb: null };
  assert.deepEqual(pageFigures('# Install\n\nthe corpus is big\n'), none);
  const tree = pageFigures(installPage({ areas: 54, files: 51186, mb: 286 }).replace('**working tree**', 'working tree'));
  assert.deepEqual(tree, { areas: 54, files: 51186, workingTreeMb: null });
});

test('ARC-09-C283 — the real install page still states all three where the bump reads them', () => {
  const page = pageFigures(readFileSync(join(root, 'docs', 'INSTALL.md'), 'utf8'));
  for (const [name, value] of Object.entries(page)) assert.ok(Number.isInteger(value) && value > 0, `docs/INSTALL.md no longer states ${name} in the shape the bump reads`);
});

test('ARC-09-C283 — figures that match the corpus make a checked line, and it says what they are', () => {
  const lines = figuresChecklist({ corpus: CORPUS, page: { areas: 54, files: 51186, workingTreeMb: 286 } });
  assert.deepEqual(lines, ['- [x] install page figures match the corpus: 51,186 files · 54 areas · 286 MB working tree']);
});

test('ARC-09-C283 — figures that differ make an unchecked line that names each one that differs, corpus first, and no other', () => {
  const lines = figuresChecklist({ corpus: { files: 51300, areas: 54, workingTreeMb: 287 }, page: { areas: 54, files: 51186, workingTreeMb: 286 } });
  assert.equal(lines.length, 1);
  assert.match(lines[0], /^- \[ \] install page figures differ from the corpus \(docs\/INSTALL\.md, "What the corpus costs"\): /);
  assert.ok(lines[0].includes('files 51,300 (page: 51,186)'), lines[0]);
  assert.ok(lines[0].includes('working tree 287 MB (page: 286 MB)'), lines[0]);
  assert.ok(!lines[0].includes('areas'), `a figure that holds is named: ${lines[0]}`);
});

test('ARC-09-C283 — a page that does not state the figures, and a corpus that was not measured, are each said and not guessed', () => {
  const unread = figuresChecklist({ corpus: CORPUS, page: { areas: null, files: 51186, workingTreeMb: null } });
  assert.deepEqual(unread, ['- [ ] install page figures not checked: docs/INSTALL.md does not state the areas and the Linux working tree where the bump reads them']);
  assert.deepEqual(figuresChecklist({ corpus: null, page: { areas: 54, files: 51186, workingTreeMb: 286 } }), []);
  assert.deepEqual(figuresChecklist({ corpus: CORPUS, page: null }), [
    '- [ ] install page figures not checked: there is no docs/INSTALL.md in this tree']);
});
