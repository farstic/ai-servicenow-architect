// Copyright 2026 Cvetomir Grigorov. Licensed under the Business Source License 1.1 (see LICENSE).
// snowarch — AI ServiceNow Architect. Not affiliated with or endorsed by ServiceNow, Inc.
// ARC-09-C231 — a file the Architect writes under clients/ has its citations resolved after the write, and a dead
// path goes back to the model before the file is presented: PostToolUse, exit 2, the paths on stderr.
//
// The core, `report(input, { root })`, is pure but for reading the written file and the corpus, so every case runs
// it over a temp root with a one-page corpus of its own and nothing is written into this checkout. The script's own
// run is spawned only where its root does not matter: outside clients/, and on input that is not JSON.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { CORRECT, report } from '../../tools/snowarch/hooks/post-write.mjs';
import { tempDir } from '../../tools/snowarch/tests/helpers/temp.mjs';

const HOOK = fileURLToPath(new URL('../../tools/snowarch/hooks/post-write.mjs', import.meta.url));
const ALIVE = 'markdown/it-service-management/incident-management/alive.md';
const DEAD = 'markdown/it-service-management/extra-folder/incident-management/alive.md';
const DEAD2 = 'markdown/it-service-management/incident-management/gone.md';

/** A project with a one-page corpus, two envelopes under clients/, and a file outside it. */
function project(t, { corpus = true } = {}) {
  const root = tempDir('snowarch-c231-', t);
  const put = (path, text) => {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), text);
  };
  if (corpus) put(`vendor/ServiceNowDocs/${ALIVE}`, '# alive\n');
  put('clients/acme/envelopes/clean.md', `## Part 1\nA baseline claim (citation: ${ALIVE}).\n`);
  put('clients/acme/envelopes/seeded.md', `## Part 1\nA baseline claim (citation: ${ALIVE}).\nAnother (citation: ${DEAD}).\n`);
  put('clients/acme/envelopes/two.md', `One (citation: ${DEAD}).\nTwo (citation: ${DEAD2}).\n`);
  put('notes/outside.md', `A dead one outside clients/ (citation: ${DEAD}).\n`);
  return root;
}

const written = (root, path, tool = 'Write') => ({
  hook_event_name: 'PostToolUse', tool_name: tool, tool_input: { file_path: join(root, path) },
});

test('ARC-09-C231 — a dead citation under clients/ goes back to the model: exit 2, the path and its line', async (t) => {
  const root = project(t);
  assert.deepEqual(await report(written(root, 'clients/acme/envelopes/seeded.md'), { root }), {
    code: 2,
    stderr: `1 dead citation in clients/acme/envelopes/seeded.md: ${DEAD} (line 3). ${CORRECT}\n`,
  });
});

test('ARC-09-C231 — the same file with every path alive says nothing', async (t) => {
  const root = project(t);
  assert.deepEqual(await report(written(root, 'clients/acme/envelopes/clean.md'), { root }), { code: 0, stderr: '' });
});

test('ARC-09-C231 — two dead paths are both named, each with its line', async (t) => {
  const root = project(t);
  assert.deepEqual(await report(written(root, 'clients/acme/envelopes/two.md'), { root }), {
    code: 2,
    stderr: `2 dead citations in clients/acme/envelopes/two.md: ${DEAD} (line 1); ${DEAD2} (line 2). ${CORRECT}\n`,
  });
});

test('ARC-09-C231 — an Edit is read like a Write: the hook keys on the file, not the tool', async (t) => {
  const root = project(t);
  assert.equal((await report(written(root, 'clients/acme/envelopes/seeded.md', 'Edit'), { root })).code, 2);
});

test('ARC-09-C231 — a file outside clients/ is not checked, dead citation or not', async (t) => {
  const root = project(t);
  assert.deepEqual(await report(written(root, 'notes/outside.md'), { root }), { code: 0, stderr: '' });
});

test('ARC-09-C231 — with no corpus nothing can be checked, so nothing is said (the doctor reports the corpus)', async (t) => {
  const root = project(t, { corpus: false });
  assert.deepEqual(await report(written(root, 'clients/acme/envelopes/seeded.md'), { root }), { code: 0, stderr: '' });
});

test('ARC-09-C231 — input without a file path is no finding', async (t) => {
  const root = project(t);
  for (const input of [null, {}, { tool_input: {} }, { tool_input: { file_path: 7 } }, { tool_input: { file_path: '' } }]) {
    assert.deepEqual(await report(input, { root }), { code: 0, stderr: '' }, JSON.stringify(input));
  }
});

test('ARC-09-C231 — the script itself exits 0 with nothing on stderr outside clients/, and on input that is not JSON', () => {
  const run = (stdin) => spawnSync(process.execPath, [HOOK], { input: stdin, encoding: 'utf8' });
  for (const stdin of [JSON.stringify({ tool_input: { file_path: fileURLToPath(import.meta.url) } }), 'not json', '']) {
    const r = run(stdin);
    assert.deepEqual([r.status, r.stderr], [0, ''], `stdin ${JSON.stringify(stdin.slice(0, 40))}`);
  }
});
