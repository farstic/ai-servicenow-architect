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
import { renderFinding } from '../../tools/snowarch/lib/finding.mjs';
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

/** What the model is asked, word for word: one line, "Correction:", neither the answer again nor the wrong path, and no mention of this. */
const ASK = ' Do not mention this notice.';
const ONE = (cited, real) => `Your reply cites a corpus page at a path that does not exist: ${cited} -> ${real}. `
  + `Add one line that starts "Correction:" and gives the right path. Do not repeat the answer, and do not write the wrong path again.${ASK}`;
const MANY = (n, pairs) => `Your reply cites ${n} corpus pages at paths that do not exist: ${pairs.map(([a, b]) => `${a} -> ${b}`).join('; ')}. `
  + `Add one line that starts "Correction:" and gives the right path for each. Do not repeat the answer, and do not write the wrong paths again.${ASK}`;

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

// The user is to see the correction, never the mechanism: the line the model is asked for stays exactly as it was, and the reason
// ends by asking that the notice itself stay out of the reply. The floor run had a model write "per the stop-hook feedback".
test('ARC-09-C254 — the line asked for is the same words as before, and the reason ends by asking that the notice not be mentioned', async (t) => {
  const root = project(t);
  const reasonOf = async (message) => JSON.parse((await report(stopping(message), { root })).stdout).reason;
  const one = await reasonOf(`A (citation: ${DEAD}).`);
  assert.ok(one.includes('Add one line that starts "Correction:" and gives the right path. Do not repeat the answer, and do not write the wrong path again.'),
    'the line asked for has changed');
  assert.ok(one.endsWith('again. Do not mention this notice.'), 'the singular reason does not end with the request');
  const many = await reasonOf(`A (citation: ${DEAD}). B (citation: markdown/australia/alpha/page-one.md).`);
  assert.ok(many.includes('Add one line that starts "Correction:" and gives the right path for each. Do not repeat the answer, and do not write the wrong paths again.'),
    'the line asked for in the plural has changed');
  assert.ok(many.endsWith('again. Do not mention this notice.'), 'the plural reason does not end with the request');
  for (const reason of [one, many]) assert.equal(reason.match(/Do not mention this notice\./g).length, 1, 'said once');
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

// The floor run found it, on both Claude Code versions: a model that had followed the Read hook's note wrote "I found it at <real>.
// My first read used <dead>, which does not exist", and was sent back for a line that said the same. A reply that names a dead path
// only to say it does not exist, next to the page the resolver names, has nothing to correct: the right path is in it already.
test('ARC-09-C254 — a reply that names the dead path beside the page itself is not sent back, whatever it says of the dead one', async (t) => {
  const root = project(t);
  for (const [why, message] of [
    ["the floor run's sentence", `The first line of the page is "# Page two". The page is at ${REAL}; my first read used ${DEAD}, which does not exist.`],
    ['the real page after the dead path', `My first read used ${DEAD}, which does not exist; the page is at ${REAL}.`],
    ['the real page as a full path in backticks', `I found it at \`/work/repo/vendor/ServiceNowDocs/${REAL}\`, not at \`${DEAD}\`.`],
    ['both cited, the dead one in a citation', `A claim (citation: ${DEAD}). The same page again (citation: ${REAL}).`],
    ['the real page with Windows separators', `I found it at C:\\work\\repo\\vendor\\ServiceNowDocs\\markdown\\alpha\\deep\\folder\\page-two.md, not at ${DEAD}.`],
  ]) assert.deepEqual(await report(stopping(message), { root }), SILENT, why);
});

test('ARC-09-C254 — a dead path that stands alone, or whose page is not in the reply, is sent back', async (t) => {
  const root = project(t);
  const other = 'markdown/australia/alpha/page-one.md';
  for (const [why, message, expected] of [
    ['alone', `A claim (citation: ${DEAD}).`, block(ONE(DEAD, REAL))],
    ['said not to exist, and no page named', `My first read used ${DEAD}, which does not exist.`, block(ONE(DEAD, REAL))],
    ['beside another page that is there', `A (citation: markdown/alpha/page-one.md). B (citation: ${DEAD}).`, block(ONE(DEAD, REAL))],
    ['beside a path of the same file name that is not the page', `Another one is at markdown/delta/page-two.md. B (citation: ${DEAD}).`, block(ONE(DEAD, REAL))],
    ['two dead paths, the page of the second in the reply', `A (citation: ${DEAD}). B (citation: ${other}). B is at markdown/alpha/page-one.md.`, block(ONE(DEAD, REAL))],
    ['two dead paths, the page of the first in the reply', `A (citation: ${DEAD}). B (citation: ${other}). A is at ${REAL}.`, block(ONE(other, 'markdown/alpha/page-one.md'))],
    ['two dead paths, neither page in the reply', `A (citation: ${DEAD}). B (citation: ${other}).`, block(MANY(2, [[DEAD, REAL], [other, 'markdown/alpha/page-one.md']]))],
  ]) assert.deepEqual(await report(stopping(message), { root }), expected, why);
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

// ---- a finding records a path as the user saw it ----
// C231 does not check what `/snowarch finding` writes, because a finding records a path as the user saw it, and the most natural
// finding to report is a dead citation. The finder prints its masked copy for the user to send as it is (ARC-09-C252), so the hook must
// not push a "Correction:" line after it. The paths inside the finder's printed copy are not checked. The copy is found by its own
// structure, from its header line to the end of its "Read before sending:" list, not by reading the transcript: the hook has the reply,
// a transcript may not exist (a session that keeps none), and the structure is the finder's own output, run here through the real
// `renderFinding` so that a change to it breaks this file and not a user's turn.
const NOTE = (path) => `The Architect cited ${path} in a design note, and the page is not there.`;
const SEND = 'Send the text above to the person who issued your licence.';
const HEADERS = [
  ['store read, credentials read', { storeRead: true, credentialsRead: true }],
  ['store read, credentials not read', { storeRead: true, credentialsRead: false }],
  ['store not read, credentials read', { storeRead: false, credentialsRead: true }],
  ['neither read', { storeRead: false, credentialsRead: false }],
];
const copyOf = (note, flags = HEADERS[3][1]) => renderFinding(note, { engagement: 'acme-bank', aliases: [], labels: [], storeUrls: [], usernames: [] }, flags);
const SAVED = 'The note is saved at clients/acme-bank/findings/2026-10-29-dead-citation.md.';

test('ARC-09-C254 — a finding\'s printed copy that quotes a dead path is left alone, in each of the finder\'s four headers, and costs no lookup', async (t) => {
  const root = project(t);
  let reads = 0;
  const load = (corpus) => { reads += 1; return loadIndex(corpus); };
  for (const [why, flags] of HEADERS) {
    const copy = copyOf(NOTE(DEAD), flags);
    assert.ok(copy.includes(DEAD), `${why}: the finder's own copy does not quote the path, so this test would prove nothing`);
    assert.deepEqual(await report(stopping(`${SAVED}\n\n${copy}\n${SEND}`), { root, load }), SILENT, why);
    assert.deepEqual(await report(stopping(`${SAVED}\n\n\`\`\`\n${copy}\`\`\`\n${SEND}`), { root, load }), SILENT, `${why}, in a code fence`);
  }
  assert.equal(reads, 0, 'a path that stands only inside the copy needs no look at the corpus');
});

test('ARC-09-C254 — the same dead path in an ordinary reply still sends it back', async (t) => {
  const root = project(t);
  assert.deepEqual(await report(stopping(NOTE(DEAD)), { root }), block(ONE(DEAD, REAL)));
  assert.deepEqual(await report(stopping(`${SAVED}\n\n${NOTE(DEAD)}\n${SEND}`), { root }), block(ONE(DEAD, REAL)), 'the same words, with no copy of the finder\'s in the reply');
});

test('ARC-09-C254 — in a finding turn, a dead path written outside the copy is still sent back, and only that one', async (t) => {
  const root = project(t);
  const other = 'markdown/australia/alpha/page-one.md';
  const copy = copyOf(NOTE(DEAD));
  for (const [why, message, expected] of [
    ['before the copy', `The Architect also cited ${DEAD} earlier.\n\n${copy}\n${SEND}`, block(ONE(DEAD, REAL))],
    ['after the copy, with a blank line', `${copy}\nSee also ${DEAD}.`, block(ONE(DEAD, REAL))],
    ['on the line right after the copy\'s last item', `${copy.trimEnd()}\nSee also ${DEAD}.`, block(ONE(DEAD, REAL))],
    ['another dead path outside, the quoted one inside', `Also ${other}.\n\n${copy}\n${SEND}`, block(ONE(other, 'markdown/alpha/page-one.md'))],
  ]) assert.deepEqual(await report(stopping(message), { root }), expected, why);
});

test('ARC-09-C254 — only what the finder prints is its copy: a header with no review list, and a review list with no header, are not', async (t) => {
  const root = project(t);
  const copy = copyOf(NOTE(DEAD));
  const lines = copy.split('\n');
  const header = lines[0];
  assert.deepEqual(await report(stopping(`${header}\n\n${NOTE(DEAD)}\n${SEND}`), { root }), block(ONE(DEAD, REAL)), 'a header alone');
  assert.deepEqual(await report(stopping(`Read before sending:\n- ${DEAD} is in the note\n${SEND}`), { root }), block(ONE(DEAD, REAL)),
    'a review list alone, with the path in one of its items');
});

test('ARC-09-C254 — a copy with Windows line endings, or indented, is still the copy', async (t) => {
  const root = project(t);
  const copy = copyOf(NOTE(DEAD));
  assert.deepEqual(await report(stopping(`${SAVED}\r\n\r\n${copy.replace(/\n/g, '\r\n')}\r\n${SEND}`), { root }), SILENT, 'Windows line endings');
  assert.deepEqual(await report(stopping(`${SAVED}\n\n${copy.split('\n').map((l) => (l ? `    ${l}` : l)).join('\n')}\n${SEND}`), { root }), SILENT, 'indented');
});

test('ARC-09-C254 — the review list is part of the copy: an item that names a path is not checked either', async (t) => {
  const root = project(t);
  const copy = copyOf(NOTE(DEAD));
  const withItem = `${copy.trimEnd()}\n- check ${DEAD} against the page the user saw\n`;
  assert.deepEqual(await report(stopping(`${withItem}\n${SEND}`), { root }), SILENT);
});

test('ARC-09-C254 — the page is carried wherever it stands: the real page inside the copy, the dead path outside it, is not sent back', async (t) => {
  const root = project(t);
  const copy = copyOf(`The page is at ${REAL}.`);
  assert.deepEqual(await report(stopping(`A claim (citation: ${DEAD}).\n\n${copy}\n${SEND}`), { root }), SILENT);
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
