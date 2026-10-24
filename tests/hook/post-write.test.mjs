// Copyright 2026 Cvetomir Grigorov. Licensed under the Business Source License 1.1 (see LICENSE).
// snowarch — AI ServiceNow Architect. Not affiliated with or endorsed by ServiceNow, Inc.
// ARC-09-C231 — a file the Architect writes under clients/ has its citations resolved after the write, and a dead
// path goes back to the model before the file is presented: PostToolUse, exit 2, the paths on stderr.
//
// The core, `report(input, { root })`, is pure but for reading the written file and the corpus, so every case runs
// it over a temp root with a one-page corpus of its own and nothing is written into this checkout. The script's own
// run is spawned only where its root does not matter: outside clients/, and on input that is not JSON.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { CORRECT, report } from '../../tools/snowarch/hooks/post-write.mjs';
import { CORPUS_DIR, syncCorpus } from '../../tools/snowarch/lib/docs/sync.mjs';
import { statePath } from '../../tools/snowarch/lib/local-paths.mjs';
import { spellings } from '../../tools/snowarch/lib/text.mjs';
import { tempDir } from '../../tools/snowarch/tests/helpers/temp.mjs';
import { UNCITED, buildUpstream, git, makeWorkspace } from '../helpers/docs-fixture.mjs';

const HOOK = fileURLToPath(new URL('../../tools/snowarch/hooks/post-write.mjs', import.meta.url));
const ALIVE = 'markdown/it-service-management/incident-management/alive.md';
const DEAD = 'markdown/it-service-management/extra-folder/incident-management/alive.md';
const DEAD2 = 'markdown/it-service-management/incident-management/gone.md';

const put = (root, path, text) => {
  mkdirSync(dirname(join(root, path)), { recursive: true });
  writeFileSync(join(root, path), text);
};

/** A project with a one-page corpus, two envelopes under clients/, and a file outside it. */
function project(t, { corpus = true } = {}) {
  const root = tempDir('snowarch-c231-', t);
  if (corpus) put(root, `vendor/ServiceNowDocs/${ALIVE}`, '# alive\n');
  put(root, 'clients/acme/envelopes/clean.md', `## Part 1\nA baseline claim (citation: ${ALIVE}).\n`);
  put(root, 'clients/acme/envelopes/seeded.md',
    `## Part 1\nA baseline claim (citation: ${ALIVE}).\nAnother (citation: ${DEAD}).\n`);
  put(root, 'clients/acme/envelopes/two.md', `One (citation: ${DEAD}).\nTwo (citation: ${DEAD2}).\n`);
  put(root, 'notes/outside.md', `A dead one outside clients/ (citation: ${DEAD}).\n`);
  return root;
}

const written = (root, path, tool = 'Write') => ({
  hook_event_name: 'PostToolUse', tool_name: tool, tool_input: { file_path: join(root, path) },
});

const SILENT = Object.freeze({ code: 0, stderr: '', stdout: '' });

test('ARC-09-C231 — a dead citation under clients/ goes back to the model: exit 2, the path and its line', async (t) => {
  const root = project(t);
  assert.deepEqual(await report(written(root, 'clients/acme/envelopes/seeded.md'), { root }), {
    code: 2,
    stderr: `1 dead citation in clients/acme/envelopes/seeded.md: ${DEAD} (line 3). ${CORRECT}\n`,
    stdout: '',
  });
});

test('ARC-09-C231 — the same file with every path alive says nothing', async (t) => {
  const root = project(t);
  assert.deepEqual(await report(written(root, 'clients/acme/envelopes/clean.md'), { root }), SILENT);
});

test('ARC-09-C231 — two dead paths are both named, each with its line', async (t) => {
  const root = project(t);
  assert.deepEqual(await report(written(root, 'clients/acme/envelopes/two.md'), { root }), {
    code: 2,
    stderr: `2 dead citations in clients/acme/envelopes/two.md: ${DEAD} (line 1); ${DEAD2} (line 2). ${CORRECT}\n`,
    stdout: '',
  });
});

test('ARC-09-C231 — an Edit is read like a Write: the hook keys on the file, not the tool', async (t) => {
  const root = project(t);
  assert.equal((await report(written(root, 'clients/acme/envelopes/seeded.md', 'Edit'), { root })).code, 2);
});

test('ARC-09-C231 — a file outside clients/ is not checked, dead citation or not', async (t) => {
  const root = project(t);
  assert.deepEqual(await report(written(root, 'notes/outside.md'), { root }), SILENT);
});

test('ARC-09-C231 — with no corpus nothing can be checked, so nothing is said (the doctor reports the corpus)', async (t) => {
  const root = project(t, { corpus: false });
  assert.deepEqual(await report(written(root, 'clients/acme/envelopes/seeded.md'), { root }), SILENT);
});

test('ARC-09-C231 — input without a file path is no finding', async (t) => {
  const root = project(t);
  for (const input of [null, {}, { tool_input: {} }, { tool_input: { file_path: 7 } }, { tool_input: { file_path: '' } }]) {
    assert.deepEqual(await report(input, { root }), SILENT, JSON.stringify(input));
  }
});

test('ARC-09-C231 — the script itself exits 0 with nothing on stderr outside clients/, and on input that is not JSON', () => {
  const run = (stdin) => spawnSync(process.execPath, [HOOK], { input: stdin, encoding: 'utf8' });
  for (const stdin of [JSON.stringify({ tool_input: { file_path: fileURLToPath(import.meta.url) } }), 'not json', '']) {
    const r = run(stdin);
    assert.deepEqual([r.status, r.stderr, r.stdout], [0, '', ''], `stdin ${JSON.stringify(stdin.slice(0, 40))}`);
  }
});

// ARC-09-C239 — a note `/snowarch finding` writes records a path as the user saw it, dead or not, so it is not sent
// back. The exemption is finding.mjs's own shape (`clients/<engagement>/findings/<name>`) and nothing near it.
test('ARC-09-C239 — a finding note is not sent back, though it cites a dead path', async (t) => {
  const root = project(t);
  put(root, 'clients/acme/findings/2026-10-24-dead-link.md', `As seen (citation: ${DEAD}).\n`);
  assert.deepEqual(await report(written(root, 'clients/acme/findings/2026-10-24-dead-link.md'), { root }), SILENT);
});

test('ARC-09-C239 — only finding.mjs\'s shape is exempt: four near shapes are still checked', async (t) => {
  const root = project(t);
  for (const rel of ['clients/acme/findings.md', 'clients/findings/x.md', 'clients/acme/sub/findings/x.md',
    'clients/acme/Findings/x.md']) {
    put(root, rel, `As seen (citation: ${DEAD}).\n`);
    assert.equal((await report(written(root, rel), { root })).code, 2, rel);
  }
});

// ARC-09-C239 — a real page this install did not check out is not dead. With only such pages the model is told so as
// context (exit 0, additionalContext on one line), never asked to correct a citation that is right; beside a dead path
// they follow the correction on the same stderr. The wording follows the mode the product reads, not a guess.
let scratch, upstream, upstreamUrl;
before(() => {
  scratch = tempDir('snowarch-c239-hook-');
  upstream = buildUpstream(scratch);
  upstreamUrl = pathToFileURL(upstream.bare).href;
});
after(() => { rmSync(scratch, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); });

const synced = (mode) => {
  const w = makeWorkspace({ scratch, pin: upstream.pin, upstreamUrl });
  syncCorpus({ ...w, mode, log: () => {} });
  return w.root;
};
const SPELL = spellings();
const OUT = `${UNCITED}/index.md`;
const sparseEntry = (path, line) => `${path} (line ${line}) — a real page, not installed on this sparse corpus`;
const fullEntry = (path, line) => `${path} (line ${line}) — not on disk in this install's corpus — run ${SPELL.cli} doctor`;
const context = (text) => `${JSON.stringify({ hookSpecificOutput: { hookEventName: 'PostToolUse', additionalContext: text } })}\n`;

test('ARC-09-C239 — sparse: a real page outside the cone is context on exit 0, with no correction asked', async () => {
  const root = synced('sparse');
  put(root, 'clients/acme/envelopes/out.md', `One (citation: markdown/alpha/index.md).\nTwo (citation: ${OUT}).\n`);
  const r = await report(written(root, 'clients/acme/envelopes/out.md'), { root });
  assert.deepEqual(r, { code: 0, stderr: '', stdout: context(`In clients/acme/envelopes/out.md: ${sparseEntry(OUT, 2)}.`) });
  assert.equal(r.stdout.split('\n').length, 2, 'the JSON is not one line');
  assert.ok(!r.stdout.includes(CORRECT), 'a real page was asked to be corrected');
});

test('ARC-09-C239 — beside a dead path, the real page follows the correction on the same stderr', async () => {
  const root = synced('sparse');
  put(root, 'clients/acme/envelopes/mixed.md', `One (citation: ${OUT}).\nTwo (citation: markdown/alpha/typo.md).\n`);
  assert.deepEqual(await report(written(root, 'clients/acme/envelopes/mixed.md'), { root }), {
    code: 2,
    stderr: `1 dead citation in clients/acme/envelopes/mixed.md: markdown/alpha/typo.md (line 2). ${CORRECT} `
      + `In the same file: ${sparseEntry(OUT, 1)}.\n`,
    stdout: '',
  });
});

test('ARC-09-C239 — the whole corpus with a real page missing from disk sends the user to the doctor', async () => {
  const root = synced('full');
  const corpus = join(root, CORPUS_DIR);
  git(['update-index', '--skip-worktree', '--', OUT], corpus);
  assert.match(git(['ls-files', '-t', '--', OUT], corpus), /^S /, 'the page is not skip-worktree');
  rmSync(join(corpus, ...OUT.split('/')));
  put(root, 'clients/acme/envelopes/full.md', `One (citation: ${OUT}).\n`);
  assert.deepEqual(await report(written(root, 'clients/acme/envelopes/full.md'), { root }), {
    code: 0, stderr: '', stdout: context(`In clients/acme/envelopes/full.md: ${fullEntry(OUT, 1)}.`),
  });
});

test('ARC-09-C239 — the wording follows the recorded mode: a sparse recorded without optIn reads as the whole corpus', async () => {
  const root = synced('sparse');
  mkdirSync(dirname(statePath(root)), { recursive: true });
  writeFileSync(statePath(root), `${JSON.stringify({ docs: { mode: 'sparse' } })}\n`);
  put(root, 'clients/acme/envelopes/rec.md', `One (citation: ${OUT}).\n`);
  assert.deepEqual(await report(written(root, 'clients/acme/envelopes/rec.md'), { root }), {
    code: 0, stderr: '', stdout: context(`In clients/acme/envelopes/rec.md: ${fullEntry(OUT, 1)}.`),
  });
});
