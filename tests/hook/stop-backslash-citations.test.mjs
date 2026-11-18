// Copyright 2026 Cvetomir Grigorov. Licensed under the Business Source License 1.1 (see LICENSE).
// snowarch — AI ServiceNow Architect. Not affiliated with or endorsed by ServiceNow, Inc.
/**
 * ARC-09-C292 — through the Stop hook (the pure function's cases are tests/backslash-citations.test.mjs): a citation written only with back-slashes
 * (`markdown\it-service-management\c_Alpha.md`) is checked, in a reply and in a file the turn wrote, on POSIX and on Windows alike. The tests build the back-slash
 * spelling themselves, so they hold on either platform.
 */
import { join } from 'node:path';
import { PAGE, asked, readPage, res, silent, stop, use, withInstall } from '../helpers/lever2.mjs';

const back = (path) => path.replaceAll('/', '\\');
const OPENED = (page) => `You cited pages that this session never opened: ${page}.`;

withInstall('ARC-09-C292 hook — a reply that cites a never-opened page only with back-slashes is asked about: with a backtick, without one, and mixed with slashes', async (t) => {
  const plain = await stop(t, { rows: [], message: `The rule is in (citation: ${back(PAGE.alpha)}).` });
  asked(plain, PAGE.alpha);
  asked(await stop(t, { rows: [], message: `The rule is in \`${back(PAGE.alpha)}\`.` }), PAGE.alpha);
  asked(await stop(t, { rows: [], message: `The rule is in (citation: ${PAGE.alpha.replace('/', '\\')}).` }), PAGE.alpha);
  asked(await stop(t, { rows: [], message: `The rule is in (citation: ${PAGE.alpha}).` }), PAGE.alpha);          // the control: slashes
  if (!plain.reason.includes(OPENED(PAGE.alpha))) throw new Error(`the ask does not name the page with slashes: ${plain.reason}`);
});

withInstall('ARC-09-C292 hook — a page the session opened, a line that says it was not read, and a page not on disk are not asked about, spelled with back-slashes', async (t, i) => {
  silent(await stop(t, { rows: readPage('r', i.abs(PAGE.alpha)), message: `The rule is in (citation: ${back(PAGE.alpha)}).` }), 'opened by a Read');
  silent(await stop(t, { rows: [], message: `The rule is in ${back(PAGE.alpha)} (not read this turn).` }), 'declared unread');
  silent(await stop(t, { rows: [], message: `The rule is in (citation: ${back('markdown/it-service-management/c_Missing.md')}).` }), 'not on disk');
});

withInstall('ARC-09-C292 hook — a file the turn wrote that cites a never-opened page only with back-slashes is asked about, whatever the final message says', async (t, i) => {
  const file = join(i.root, 'clients', 'acme', 'envelopes', 'e1.md');
  const write = (content) => [use('w', 'Write', { file_path: file, content }), res('w', 'File created successfully')];
  asked(await stop(t, { rows: write(`# Envelope\n\nThe rule is in (citation: ${PAGE.alpha}).\n`), message: 'Saved the Envelope.' }), PAGE.alpha);      // the control
  asked(await stop(t, { rows: write(`# Envelope\n\nThe rule is in (citation: ${back(PAGE.alpha)}).\n`), message: 'Saved the Envelope.' }), PAGE.alpha);
  silent(await stop(t, { rows: [...readPage('r', i.abs(PAGE.alpha)), ...write(`# Envelope\n\n(citation: ${back(PAGE.alpha)}).\n`)], message: 'Saved the Envelope.' }), 'opened');
});
