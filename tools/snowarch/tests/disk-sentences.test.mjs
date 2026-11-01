// Copyright 2026 Cvetomir Grigorov. Licensed under the Business Source License 1.1 (see LICENSE).
// snowarch — AI ServiceNow Architect. Not affiliated with or endorsed by ServiceNow, Inc.
/**
 * ARC-09-C260 — the out-of-disk sentence, said once for each thing that failed.
 *
 * One sentence, "insufficient disk space: need ~400 MB free (~700 MB for --mode full)", was what a docs sync that hit "No space left on
 * device" printed (`docs sync`, `docs sync --upstream`, B02's FAIL) and what an `npm ci` that hit ENOSPC printed (B04). Its first figure
 * was the sparse corpus, which the default stopped being in ARC-09-C244; its second named `--mode full`, a flag of `docs sync` that the
 * bootstrap does not have (its flag is `--docs`); and for npm it named a docs flag that cannot help. C259 found it while giving the
 * product one size unit, and the owner's directive of 2026-11-01 took it into 2.2.5. There are two sentences now. The docs one says the
 * whole corpus is the default and quotes the install page's two figures; the npm one says what node_modules takes. Neither says what
 * is needed or tells the reader to re-run: a failed sync may have left part of the corpus on disk, and a figure for "free space needed"
 * is one nobody measured.
 *
 * The figures are measured, and each carries its source where it is written (net-sentences.mjs, npm-failures.mjs): 490 and 365 MB are
 * docs-real run 41063258542 (tree plus .git on disk, full and sparse), 16 MB is CI's footprint job of run 41123130560.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as SENTENCE from '../lib/net-sentences.mjs';
import * as NPM from '../lib/npm-failures.mjs';
import { megabytes } from '../lib/size.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const PAGE = readFileSync(join(root, 'docs', 'INSTALL.md'), 'utf8');

const DOCS_TEXT = 'insufficient disk space: the whole documentation (the default) takes about 490 MB on disk, a sparse checkout about 365 MB';
const NPM_TEXT = 'insufficient disk space: the dependencies take about 16 MB in node_modules, and npm\'s cache needs room too';

test('ARC-09-C260 — a failed docs sync says what the documentation takes, and a failed npm install what the dependencies take', () => {
  assert.equal(SENTENCE.noDiskSpaceDocs, DOCS_TEXT);
  assert.equal(NPM.NPM_SENTENCE.disk, NPM_TEXT);
  assert.notEqual(NPM.NPM_SENTENCE.disk, SENTENCE.noDiskSpaceDocs, 'the two failures still read the same');
  // npm's sentence is the one B04 prints, by the path B04 reads it.
  assert.equal(NPM.classifyNpmFailure('npm ERR! code ENOSPC'), NPM.NPM_SENTENCE.disk);
  assert.equal(NPM.classifyNpmFailure('npm ERR! ENOSPC: no space left on device, write'), NPM.NPM_SENTENCE.disk);
});

test('ARC-09-C260 — neither sentence carries the old figures or a flag, the docs one no need and no re-run, and npm\'s names nothing of the documentation', () => {
  for (const [which, sentence] of [['docs', SENTENCE.noDiskSpaceDocs], ['npm', NPM.NPM_SENTENCE.disk]]) {
    for (const old of ['~400', '~700', '--mode', '--docs']) {
      assert.ok(!sentence.includes(old), `the ${which} sentence still says "${old}": ${sentence}`);
    }
  }
  // A failed sync may have left part of the corpus on disk, so the docs sentence says what the corpus takes, not what is "needed" or "free".
  for (const word of ['need', 'free', 're-run']) {
    assert.ok(!SENTENCE.noDiskSpaceDocs.includes(word), `the docs sentence says "${word}"`);
  }
  // `npm ci` fetches registry packages; a docs flag, or the word, tells its reader to look in the wrong place.
  for (const docsWord of ['--mode', '--docs', 'sparse', 'documentation', 'corpus']) {
    assert.ok(!NPM.NPM_SENTENCE.disk.includes(docsWord), `the npm sentence names "${docsWord}"`);
  }
  // The docs sentence says the whole corpus is the default and the sparse one is the other answer.
  assert.match(SENTENCE.noDiskSpaceDocs, /the whole documentation \(the default\)/);
  assert.match(SENTENCE.noDiskSpaceDocs, /a sparse checkout/);
});

/** The page's two corpus costs, as the sentence's constants must agree with them: the whole corpus and a sparse checkout, on disk. */
function agrees(page) {
  const whole = Number(/about (\d+) MB on disk and about/.exec(page)?.[1]);
  const sparse = Number(/\(about (\d+) MB on disk\)/.exec(page)?.[1]);
  assert.ok(whole > 0 && sparse > 0, 'the install page no longer states the corpus cost on disk in the shape this test reads');
  return Math.abs(megabytes(SENTENCE.CORPUS_WHOLE) - whole) <= 10 && Math.abs(megabytes(SENTENCE.CORPUS_SPARSE) - sparse) <= 10;
}

test('ARC-09-C260 — the sentence\'s figures are within 10 MB of the install page\'s, each read from its own file', () => {
  assert.ok(agrees(PAGE), `the sentence says ${megabytes(SENTENCE.CORPUS_WHOLE)} and ${megabytes(SENTENCE.CORPUS_SPARSE)} MB, the page says otherwise`);
  // The control: a page that says another number is not agreed with, so this test can fail.
  assert.equal(agrees(PAGE.replace(/about (\d+) MB on disk and about/, 'about 700 MB on disk and about')), false);
  assert.equal(agrees(PAGE.replace(/\(about (\d+) MB on disk\)/, '(about 150 MB on disk)')), false);
  // And the sentence is built from those constants, so changing a constant changes the words.
  assert.ok(SENTENCE.noDiskSpaceDocs.includes(`about ${megabytes(SENTENCE.CORPUS_WHOLE)} MB`));
  assert.ok(SENTENCE.noDiskSpaceDocs.includes(`about ${megabytes(SENTENCE.CORPUS_SPARSE)} MB`));
  assert.ok(NPM.NPM_SENTENCE.disk.includes(`about ${megabytes(NPM.NODE_MODULES)} MB`));
});
