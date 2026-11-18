// Copyright 2026 Cvetomir Grigorov. Licensed under the Business Source License 1.1 (see LICENSE).
// snowarch — AI ServiceNow Architect. Not affiliated with or endorsed by ServiceNow, Inc.
/**
 * ARC-09-C292 — the early gate of the citedUnread class (ARC-09-C267) must recognise a citation written only with back-slashes (`markdown\csm\c_Esc.md`).
 *
 * The check reads every citation of a line as `posix(line)`, so a back-slash path is a citation once a line reaches it; but the gate in front of it looked for the text
 * `markdown/`, with a forward slash, in a reply and in a file the turn wrote. A reply that cites a page only the way a Windows tool prints it was never checked, and a
 * never-opened page it cited was not asked about. The Stop hook's cases are tests/hook/stop-backslash-citations.test.mjs.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { groundingFindings } from '../tools/snowarch/lib/docs/grounding-check.mjs';
import { A, U, res, use } from './helpers/lever2.mjs';

const PAGE = 'markdown/csm/c_Esc.md';
const back = (path) => path.replaceAll('/', '\\');
const text = (t) => A([{ type: 'text', text: t }]);
const check = (reply, rows = [U('q'), text(reply)]) => groundingFindings({ rows, reply, index: null, options: { blocking: ['citedUnread'], askedOnly: true, pageExists: () => true } });
const paths = (r) => r.findings.citedUnread.map((i) => i.path);

test('ARC-09-C292 — a reply that cites a never-opened page only with back-slashes is asked about, as one with slashes is', () => {
  assert.deepEqual(paths(check(`The rule is in (citation: ${PAGE}).`)), [PAGE], 'the control: slashes');
  assert.deepEqual(paths(check(`The rule is in (citation: ${back(PAGE)}).`)), [PAGE], 'back-slashes, and the ask names the page with slashes');
  assert.deepEqual(paths(check(`The rule is in (citation: markdown\\csm/c_Esc.md).`)), [PAGE], 'mixed separators');
  assert.deepEqual(paths(check(`The rule is in C:\\work\\vendor\\ServiceNowDocs\\${back(PAGE)} and nowhere else.`)), [PAGE], 'a Windows path with the corpus folder in front of it');
  assert.deepEqual(paths(check(`The rule is in \`${back(PAGE)}\`.`)), [PAGE], 'in a code span');
  const r = check(`The rule is in ${back(PAGE)}.`);
  assert.deepEqual(r.blocks, ['citedUnread']);
  assert.ok(r.reasonBody.includes(`never opened: ${PAGE}.`), r.reasonBody);
});

test('ARC-09-C292 — a back-slash citation of a page the session opened, declared unread, or not on disk is not asked about, as with slashes', () => {
  const read = [U('q'), use('r1', 'Read', { file_path: `/home/dev/install/vendor/ServiceNowDocs/${PAGE}` }), res('r1', '1\tx'), text(`The rule is in ${back(PAGE)}.`)];
  assert.deepEqual(paths(check(`The rule is in ${back(PAGE)}.`, read)), [], 'opened by a Read of the same page');
  assert.deepEqual(paths(check(`The rule is in ${back(PAGE)} (not read this turn).`)), [], 'the line says it was not read');
  const gone = groundingFindings({ rows: [U('q'), text(`See ${back(PAGE)}.`)], reply: `The rule is in ${back(PAGE)}.`, index: null, options: { blocking: ['citedUnread'], askedOnly: true, pageExists: () => false } });
  assert.deepEqual(paths(gone), [], 'a page that is not on disk is C254\'s');
  assert.deepEqual(paths(check('No citation here, only a back-slash \\ in a sentence.')), []);
});

test('ARC-09-C292 — a file the turn wrote that cites a never-opened page only with back-slashes is asked about', () => {
  const file = '/home/dev/install/clients/acme/envelopes/e1.md';
  const wrote = (content) => [U('q'), use('w1', 'Write', { file_path: file, content }), res('w1', 'File created successfully'), text('Saved.')];
  assert.deepEqual(paths(check('Saved.', wrote(`# Envelope\n\nThe rule is in (citation: ${PAGE}).\n`))), [PAGE], 'the control: slashes');
  assert.deepEqual(paths(check('Saved.', wrote(`# Envelope\n\nThe rule is in (citation: ${back(PAGE)}).\n`))), [PAGE], 'back-slashes');
});
