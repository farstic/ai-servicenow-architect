// Copyright 2026 Cvetomir Grigorov. Licensed under the Business Source License 1.1 (see LICENSE).
// snowarch — AI ServiceNow Architect. Not affiliated with or endorsed by ServiceNow, Inc.
// ARC-09-C254 — the Stop hook. A reply that cites a corpus page at a path the corpus does not have, where the resolver
// knows the page that was meant, is sent back once: `decision: "block"` and a reason that asks for ONE line starting
// "Correction:", not the answer again. `stop_hook_active` is the cap — true means Claude Code is already continuing
// because a Stop hook asked, so the hook says nothing — and every failure of its own is silence. Every case runs the core
// over a temp root with a corpus of its own; the script is spawned only where its root does not matter.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { report } from '../../tools/snowarch/hooks/stop-citations.mjs';
import { loadIndex } from '../../tools/snowarch/lib/docs/resolve.mjs';
import { CORPUS_DIR, syncCorpus } from '../../tools/snowarch/lib/docs/sync.mjs';
import { UNCITED, buildUpstream, makeWorkspace } from '../helpers/docs-fixture.mjs';
import { tempDir } from '../../tools/snowarch/tests/helpers/temp.mjs';

const HOOK = fileURLToPath(new URL('../../tools/snowarch/hooks/stop-citations.mjs', import.meta.url));

const put = (root, path, text) => {
  mkdirSync(dirname(join(root, path)), { recursive: true });
  writeFileSync(join(root, path), text);
};

const PAGES = [
  'markdown/alpha/page-one.md',
  'markdown/alpha/deep/folder/page-two.md',
  'markdown/alpha/one/twin.md',
  'markdown/alpha/two/twin.md',
  'markdown/delta/only-here.md',
];

function project(t) {
  const root = tempDir('snowarch-c254-stop-', t);
  for (const p of PAGES) put(root, `${CORPUS_DIR}/${p}`, '# page\n');
  return root;
}

const stopping = (message, extra = {}) => ({ hook_event_name: 'Stop', stop_hook_active: false, last_assistant_message: message, ...extra });
const block = (reason) => ({ code: 0, stderr: '', stdout: `${JSON.stringify({ decision: 'block', reason })}\n` });
const SILENT = Object.freeze({ code: 0, stderr: '', stdout: '' });

/** What the model is asked, word for word: one line, "Correction:", neither the answer again nor the wrong path. */
const ONE = (cited, real) => `Your reply cites a corpus page at a path that does not exist: ${cited} -> ${real}. `
  + 'Add one line that starts "Correction:" and gives the right path. Do not repeat the answer, and do not write the wrong path again.';
const MANY = (n, pairs) => `Your reply cites ${n} corpus pages at paths that do not exist: ${pairs.map(([a, b]) => `${a} -> ${b}`).join('; ')}. `
  + 'Add one line that starts "Correction:" and gives the right path for each. Do not repeat the answer, and do not write the wrong paths again.';

const DEAD = 'markdown/alpha/page-two.md';
const REAL = 'markdown/alpha/deep/folder/page-two.md';

test('ARC-09-C254 — a reply that cites a dead path the resolver knows is sent back once, for one line', async (t) => {
  const root = project(t);
  const r = await report(stopping(`The queue is assigned by rule (citation: ${DEAD}).`), { root });
  assert.deepEqual(r, block(ONE(DEAD, REAL)));
  assert.equal(r.stdout.split('\n').length, 2, 'the JSON is not one line');
});

test('ARC-09-C254 — two dead paths are named in the order they first appear, each once, and the plural is said', async (t) => {
  const root = project(t);
  const message = `One (citation: ${DEAD}). Two (citation: markdown/australia/alpha/page-one.md). Three (citation: ${DEAD}).`;
  assert.deepEqual(await report(stopping(message), { root }),
    block(MANY(2, [[DEAD, REAL], ['markdown/australia/alpha/page-one.md', 'markdown/alpha/page-one.md']])));
});

test('ARC-09-C254 — stop_hook_active is the cap: nothing is said, though the reply still cites a dead path', async (t) => {
  const root = project(t);
  assert.deepEqual(await report(stopping(`Still (citation: ${DEAD}).`, { stop_hook_active: true }), { root }), SILENT);
});

test('ARC-09-C254 — a citation that is alive, or that cannot be resolved, is silence', async (t) => {
  const root = project(t);
  for (const [why, message] of [
    ['alive', 'A claim (citation: markdown/alpha/page-one.md).'],
    ['alive, in a subfolder', 'A claim (citation: markdown/alpha/deep/folder/page-two.md).'],
    ['two pages fit', 'A claim (citation: markdown/alpha/twin.md).'],
    ['no page has that name', 'A claim (citation: markdown/alpha/no-such-page.md).'],
    ['the only page of that name is in another area', 'A claim (citation: markdown/gamma/only-here.md).'],
  ]) assert.deepEqual(await report(stopping(message), { root }), SILENT, why);
});

test('ARC-09-C254 — beside an alive path and a path nothing can resolve, only the path that can be is named', async (t) => {
  const root = project(t);
  const message = `A (citation: markdown/alpha/page-one.md). B (citation: ${DEAD}). C (citation: markdown/alpha/no-such-page.md).`;
  assert.deepEqual(await report(stopping(message), { root }), block(ONE(DEAD, REAL)));
});

test('ARC-09-C254 — a citation is read as the gate reads one: any spelling, punctuation, a table cell, a brace group', async (t) => {
  const root = project(t);
  for (const [why, message] of [
    ['in backticks', `See \`${DEAD}\` for it.`],
    ['with the vendor path', `See vendor/ServiceNowDocs/${DEAD} for it.`],
    ['with the corpus folder', `See ServiceNowDocs/${DEAD} for it.`],
    ['before a full stop', `It is documented in ${DEAD}.`],
    ['in a table cell', `| Claim | Source |\n| --- | --- |\n| A | ${DEAD} |`],
    ['in a brace group with an alive page', 'See markdown/alpha/{page-one,page-two}.md for both.'],
  ]) assert.deepEqual(await report(stopping(message), { root }), block(ONE(DEAD, REAL)), why);
});

test('ARC-09-C254 — a line the gate cannot read does not hide the lines it can', async (t) => {
  const root = project(t);
  const message = `Two groups: markdown/alpha/{a,b}/{c,d}.md\nA claim (citation: ${DEAD}).`;
  assert.deepEqual(await report(stopping(message), { root }), block(ONE(DEAD, REAL)));
});

test('ARC-09-C254 — a folder, a placeholder and a bare area are no page', async (t) => {
  const root = project(t);
  for (const message of ['See markdown/alpha/deep/ for the folder.', 'Cite the path used: markdown/... in the end.', 'The area markdown/alpha.']) {
    assert.deepEqual(await report(stopping(message), { root }), SILENT, message);
  }
});

// The hook runs at the end of every turn, and a design answer cites pages it has just read. A page on disk is alive, so the
// corpus tree (tens of milliseconds) is read only when a cited path is not on disk.
test('ARC-09-C254 — the corpus tree is read only for a path that is not on disk', async (t) => {
  const root = project(t);
  let reads = 0;
  const load = (corpus) => { reads += 1; return loadIndex(corpus); };
  assert.deepEqual(await report(stopping('A (citation: markdown/alpha/page-one.md). B (citation: markdown/alpha/deep/folder/page-two.md).'),
    { root, load }), SILENT);
  assert.equal(reads, 0, 'every cited page is on disk, so there was nothing to look up');
  assert.deepEqual(await report(stopping(`A (citation: markdown/alpha/page-one.md). B (citation: ${DEAD}).`), { root, load }), block(ONE(DEAD, REAL)));
  assert.equal(reads, 1, 'a path that is not on disk is looked up, once');
});

test('ARC-09-C254 — a reply with no markdown/ in it is silence before anything is read', async (t) => {
  const root = tempDir('snowarch-c254-stop-bare-', t);
  assert.deepEqual(await report(stopping('Nothing is cited here, and there is no corpus either.'), { root }), SILENT);
});

test('ARC-09-C254 — with no corpus there is nothing to name, so nothing is said (the doctor reports the corpus)', async (t) => {
  const root = tempDir('snowarch-c254-stop-none-', t);
  assert.deepEqual(await report(stopping(`A claim (citation: ${DEAD}).`), { root }), SILENT);
});

test('ARC-09-C254 — input without a reply is no finding', async (t) => {
  const root = project(t);
  for (const input of [null, undefined, {}, { stop_hook_active: false }, { last_assistant_message: 7 }, { last_assistant_message: '' }]) {
    assert.deepEqual(await report(input, { root }), SILENT, JSON.stringify(input));
  }
});

test('ARC-09-C254 — the script exits 0 with nothing printed on input that is not JSON, on the cap, and on a reply with no citation', () => {
  const run = (stdin) => spawnSync(process.execPath, [HOOK], { input: stdin, encoding: 'utf8' });
  for (const stdin of ['not json', '', JSON.stringify(stopping('A claim (citation: markdown/alpha/typo.md).', { stop_hook_active: true })),
    JSON.stringify(stopping('Nothing is cited.'))]) {
    const r = run(stdin);
    assert.deepEqual([r.status, r.stderr, r.stdout], [0, '', ''], `stdin ${JSON.stringify(stdin.slice(0, 40))}`);
  }
});

// ---- a corpus with a git tree: a real page this install did not check out stands ----

let scratch, upstream, upstreamUrl;
before(() => {
  scratch = tempDir('snowarch-c254-stop-sync-');
  upstream = buildUpstream(scratch);
  upstreamUrl = pathToFileURL(upstream.bare).href;
});
after(() => { rmSync(scratch, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); });

test('ARC-09-C254 — sparse: a real page this install did not check out is a citation that stands', async () => {
  const w = makeWorkspace({ scratch, pin: upstream.pin, upstreamUrl });
  syncCorpus({ ...w, mode: 'sparse', log: () => {} });
  assert.deepEqual(await report(stopping(`A claim (citation: ${UNCITED}/index.md).`), { root: w.root }), SILENT);
  assert.deepEqual(await report(stopping(`A claim (citation: markdown/australia/${UNCITED.slice('markdown/'.length)}/index.md).`), { root: w.root }),
    block(ONE(`markdown/australia/${UNCITED.slice('markdown/'.length)}/index.md`, `${UNCITED}/index.md`)));
});
