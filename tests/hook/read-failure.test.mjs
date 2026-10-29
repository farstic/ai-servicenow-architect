// Copyright 2026 Cvetomir Grigorov. Licensed under the Business Source License 1.1 (see LICENSE).
// snowarch — AI ServiceNow Architect. Not affiliated with or endorsed by ServiceNow, Inc.
// ARC-09-C254 — the PostToolUseFailure hook for Read. A Read of a corpus page that is not at that path fails with "File
// does not exist", and the model goes looking: the corpus's own links name pages with a leading `australia/` or without a
// subfolder. The hook says which page was meant, as context beside the failed Read, and says nothing when it would be a
// guess. It decides "not found" itself (the file is not on disk), not from the error text, which Claude Code calls display
// text. Every case runs the core over a temp root with a corpus of its own; the script is spawned only where its root
// does not matter.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { report } from '../../tools/snowarch/hooks/read-failure.mjs';
import { CORPUS_DIR, syncCorpus } from '../../tools/snowarch/lib/docs/sync.mjs';
import { spellings } from '../../tools/snowarch/lib/text.mjs';
import { tempDir } from '../../tools/snowarch/tests/helpers/temp.mjs';
import { UNCITED, buildUpstream, git, makeWorkspace } from '../helpers/docs-fixture.mjs';

const HOOK = fileURLToPath(new URL('../../tools/snowarch/hooks/read-failure.mjs', import.meta.url));

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

/** A project with a corpus of five pages and a file outside it. */
function project(t, { pages = PAGES } = {}) {
  const root = tempDir('snowarch-c254-read-', t);
  for (const p of pages) put(root, `${CORPUS_DIR}/${p}`, '# page\n');
  put(root, 'clients/acme/envelopes/e.md', '# envelope\n');
  return root;
}

const at = (root, rel) => join(root, CORPUS_DIR, ...rel.split('/'));
const failed = (file, extra = {}) => ({ hook_event_name: 'PostToolUseFailure', tool_name: 'Read', tool_input: { file_path: file },
  error: 'File does not exist. Note: your current working directory is /somewhere.', is_interrupt: false, duration_ms: 3, ...extra });

/** What the model is told: two paths and fixed words, no value of any engagement. */
const NOTE = (cited, real) => `ServiceNowDocs: there is no page at ${cited}. The page is ${real}. Read it before you cite it, and cite that path.`;
const context = (text) => `${JSON.stringify({ hookSpecificOutput: { hookEventName: 'PostToolUseFailure', additionalContext: text } })}\n`;
const SILENT = Object.freeze({ code: 0, stderr: '', stdout: '' });

test('ARC-09-C254 — a Read of a page that is not at that path is told which page was meant, on one line of context', async (t) => {
  const root = project(t);
  const r = await report(failed(at(root, 'markdown/alpha/page-two.md')), { root });
  assert.deepEqual(r, { code: 0, stderr: '', stdout: context(NOTE('markdown/alpha/page-two.md', 'markdown/alpha/deep/folder/page-two.md')) });
  assert.equal(r.stdout.split('\n').length, 2, 'the JSON is not one line');
});

test('ARC-09-C254 — a leading australia/ is taken off', async (t) => {
  const root = project(t);
  assert.deepEqual(await report(failed(at(root, 'markdown/australia/alpha/page-one.md')), { root }), {
    code: 0, stderr: '', stdout: context(NOTE('markdown/australia/alpha/page-one.md', 'markdown/alpha/page-one.md')),
  });
});

test('ARC-09-C254 — the note is the same for every spelling of the path the model gave', async (t) => {
  const root = project(t);
  const expected = { code: 0, stderr: '', stdout: context(NOTE('markdown/alpha/page-two.md', 'markdown/alpha/deep/folder/page-two.md')) };
  for (const file of [
    'C:\\Users\\someone\\repo\\vendor\\ServiceNowDocs\\markdown\\alpha\\page-two.md',
    'C:/Users/someone/repo/vendor/ServiceNowDocs/markdown/alpha/page-two.md',
    'vendor/ServiceNowDocs/markdown/alpha/page-two.md',
    '/Users/some one/my work/repo/vendor/ServiceNowDocs/markdown/alpha/page-two.md',
  ]) assert.deepEqual(await report(failed(file), { root }), expected, file);
});

test('ARC-09-C254 — a checkout reached through a link gets the same note', async (t) => {
  const root = project(t);
  const link = join(tempDir('snowarch-c254-link-', t), 'checkout');
  symlinkSync(root, link, process.platform === 'win32' ? 'junction' : 'dir');
  assert.deepEqual(await report(failed(at(link, 'markdown/alpha/page-two.md')), { root }), {
    code: 0, stderr: '', stdout: context(NOTE('markdown/alpha/page-two.md', 'markdown/alpha/deep/folder/page-two.md')),
  });
});

test('ARC-09-C254 — a page that is there means the Read failed for another reason, so nothing is said', async (t) => {
  const root = project(t);
  assert.deepEqual(await report(failed(at(root, 'markdown/alpha/page-one.md'), { error: 'EACCES: permission denied' }), { root }), SILENT);
  assert.deepEqual(await report(failed(at(root, 'markdown/alpha'), { error: 'EISDIR: illegal operation on a directory' }), { root }), SILENT);
});

test('ARC-09-C254 — nothing is said when it would be a guess', async (t) => {
  const root = project(t);
  for (const [why, rel] of [
    ['two pages fit', 'markdown/alpha/twin.md'],
    ['no page has that name', 'markdown/alpha/no-such-page.md'],
    ['the only page of that name is in another area', 'markdown/gamma/only-here.md'],
    ['an area that is not there', 'markdown/zeta'],
    ['not a page', 'markdown/alpha/page-one'],
  ]) assert.deepEqual(await report(failed(at(root, rel)), { root }), SILENT, why);
});

test('ARC-09-C254 — a file that is not in the corpus is no business of the hook', async (t) => {
  const root = project(t);
  for (const file of [join(root, 'clients/acme/envelopes/missing.md'), join(root, 'clients/acme/markdown/alpha/page-two.md'),
    '/Users/someone/ServiceNowDocs-old/markdown/alpha/page-two.md', join(root, CORPUS_DIR, 'README.md')]) {
    assert.deepEqual(await report(failed(file), { root }), SILENT, file);
  }
});

test('ARC-09-C254 — a failed Edit, Write or Bash is not read like a failed Read', async (t) => {
  const root = project(t);
  for (const tool of ['Edit', 'Write', 'Bash', 'Grep', undefined]) {
    assert.deepEqual(await report(failed(at(root, 'markdown/alpha/page-two.md'), { tool_name: tool }), { root }), SILENT, String(tool));
  }
});

test('ARC-09-C254 — input without a usable file path is no finding', async (t) => {
  const root = project(t);
  for (const input of [null, undefined, {}, { tool_name: 'Read' }, { tool_name: 'Read', tool_input: {} },
    { tool_name: 'Read', tool_input: { file_path: 7 } }, { tool_name: 'Read', tool_input: { file_path: '' } }]) {
    assert.deepEqual(await report(input, { root }), SILENT, JSON.stringify(input));
  }
});

test('ARC-09-C254 — with no corpus there is nothing to name, so nothing is said (the doctor reports the corpus)', async (t) => {
  const root = tempDir('snowarch-c254-none-', t);
  assert.deepEqual(await report(failed(at(root, 'markdown/alpha/page-two.md')), { root }), SILENT);
});

test('ARC-09-C254 — the script exits 0 with nothing printed on input that is not JSON, and for a path outside the corpus', () => {
  const run = (stdin) => spawnSync(process.execPath, [HOOK], { input: stdin, encoding: 'utf8' });
  for (const stdin of ['not json', '', JSON.stringify(failed(fileURLToPath(import.meta.url))), JSON.stringify({ tool_input: { file_path: 5 } })]) {
    const r = run(stdin);
    assert.deepEqual([r.status, r.stderr, r.stdout], [0, '', ''], `stdin ${JSON.stringify(stdin.slice(0, 40))}`);
  }
});

// ---- a corpus with a git tree: a real page this install did not check out ----

let scratch, upstream, upstreamUrl;
before(() => {
  scratch = tempDir('snowarch-c254-read-sync-');
  upstream = buildUpstream(scratch);
  upstreamUrl = pathToFileURL(upstream.bare).href;
});
after(() => { rmSync(scratch, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); });

const synced = (mode) => {
  const w = makeWorkspace({ scratch, pin: upstream.pin, upstreamUrl });
  syncCorpus({ ...w, mode, log: () => {} });
  return w.root;
};
const OUT = `${UNCITED}/index.md`;
const SPELL = spellings();
const SPARSE = 'a real page, not installed on this sparse corpus';
const WHOLE = `not on disk in this install's corpus — run ${SPELL.cli} doctor`;

test('ARC-09-C254 — sparse: a real page outside the cone is said to be there, and not to be read', async () => {
  const root = synced('sparse');
  assert.deepEqual(await report(failed(at(root, OUT)), { root }), {
    code: 0, stderr: '', stdout: context(`ServiceNowDocs: ${OUT} — ${SPARSE}.`),
  });
});

test('ARC-09-C254 — sparse: the page that was meant is outside the cone too', async () => {
  const root = synced('sparse');
  assert.deepEqual(await report(failed(at(root, `markdown/australia/${UNCITED.slice('markdown/'.length)}/index.md`)), { root }), {
    code: 0, stderr: '',
    stdout: context(`ServiceNowDocs: there is no page at markdown/australia/${UNCITED.slice('markdown/'.length)}/index.md. `
      + `The page is ${OUT}, ${SPARSE}.`),
  });
});

test('ARC-09-C254 — sparse: a page that was meant and is on disk is read as any other', async () => {
  const root = synced('sparse');
  assert.deepEqual(await report(failed(at(root, 'markdown/australia/alpha/index.md')), { root }), {
    code: 0, stderr: '', stdout: context(NOTE('markdown/australia/alpha/index.md', 'markdown/alpha/index.md')),
  });
});

test('ARC-09-C254 — the whole corpus with a real page missing from disk sends the user to the doctor', async () => {
  const root = synced('full');
  const corpus = join(root, CORPUS_DIR);
  git(['update-index', '--skip-worktree', '--', OUT], corpus);
  rmSync(join(corpus, ...OUT.split('/')));
  assert.deepEqual(await report(failed(at(root, OUT)), { root }), {
    code: 0, stderr: '', stdout: context(`ServiceNowDocs: ${OUT} — ${WHOLE}.`),
  });
});
