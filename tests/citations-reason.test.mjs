// Copyright 2026 Cvetomir Grigorov. Licensed under the Business Source License 1.1 (see LICENSE).
// snowarch — AI ServiceNow Architect. Not affiliated with or endorsed by ServiceNow, Inc.
// ARC-09-C239 — dead means absent from the corpus tree at the pin, not merely absent from disk. Each dead entry says
// why: `outside` for a real page this install did not check out, `missing` for a path the tree does not have. The
// gate still fails both; the citation hook reads the reason.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';

import { verifyCitations } from '../tools/snowarch/lib/docs/verify.mjs';
import { CORPUS_DIR, syncCorpus } from '../tools/snowarch/lib/docs/sync.mjs';
import { UNCITED, buildUpstream, makeWorkspace } from './helpers/docs-fixture.mjs';
import { tempDir } from '../tools/snowarch/tests/helpers/temp.mjs';

let scratch, upstream, upstreamUrl;
before(() => {
  scratch = tempDir('snowarch-c239-reason-');
  upstream = buildUpstream(scratch);
  upstreamUrl = pathToFileURL(upstream.bare).href;
});
after(() => { rmSync(scratch, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); });

/** A workspace whose corpus is checked out in `mode`. */
const synced = (mode) => {
  const w = makeWorkspace({ scratch, pin: upstream.pin, upstreamUrl });
  syncCorpus({ ...w, mode, log: () => {} });
  return w.root;
};

/** A file under clients/ citing each path on a line of its own. */
const citing = (root, paths) => {
  const rel = 'clients/acme/envelopes/e.md';
  mkdirSync(dirname(join(root, rel)), { recursive: true });
  writeFileSync(join(root, rel), `${paths.map((p) => `A claim (citation: ${p}).`).join('\n')}\n`);
  return rel;
};

const reasons = (r) => Object.fromEntries(r.dead.map((d) => [d.path, d.reason]));

const CITED = [`${UNCITED}/index.md`, `${UNCITED}/typo.md`, 'markdown/no-such-area/index.md', 'markdown/alpha/typo.md',
  'markdown/alpha/index.md'];

test('ARC-09-C239 — on a sparse checkout a real page outside the cone is outside, and a path the tree lacks is missing', () => {
  const root = synced('sparse');
  assert.ok(!existsSync(join(root, CORPUS_DIR, ...UNCITED.split('/'))), 'the cone brought the uncited area');
  const r = verifyCitations({ root, roots: [citing(root, CITED)] });
  assert.equal(r.status, 'fail', 'the gate stopped failing a page that is not on disk');
  assert.deepEqual(reasons(r), {
    [`${UNCITED}/index.md`]: 'outside',
    [`${UNCITED}/typo.md`]: 'missing',
    'markdown/no-such-area/index.md': 'missing',
    'markdown/alpha/typo.md': 'missing',
  });
});

test('ARC-09-C239 — a corpus with no git directory cannot tell, so every path not on disk stays dead', () => {
  const root = synced('sparse');
  rmSync(join(root, CORPUS_DIR, '.git'), { recursive: true, force: true });
  assert.ok(!existsSync(join(root, CORPUS_DIR, '.git')), 'the corpus still has a git directory');
  const r = verifyCitations({ root, roots: [citing(root, CITED)] });
  assert.deepEqual(new Set(Object.values(reasons(r))), new Set(['missing']));
  assert.equal(r.dead.length, 4);
});

test('ARC-09-C239 — a corpus whose git cannot be read (a gitlink to nowhere) also leaves every path dead', () => {
  const root = synced('sparse');
  rmSync(join(root, CORPUS_DIR, '.git'), { recursive: true, force: true });
  writeFileSync(join(root, CORPUS_DIR, '.git'), 'gitdir: ../no-such-git-directory\n');
  assert.ok(existsSync(join(root, CORPUS_DIR, '.git')), 'the broken gitlink was not written');
  const r = verifyCitations({ root, roots: [citing(root, CITED)] });
  assert.deepEqual(new Set(Object.values(reasons(r))), new Set(['missing']));
  assert.equal(r.dead.length, 4);
});

test('ARC-09-C239 — on the whole corpus nothing is outside: the uncited area is on disk', () => {
  const root = synced('full');
  const r = verifyCitations({ root, roots: [citing(root, CITED)] });
  assert.deepEqual(reasons(r), {
    [`${UNCITED}/typo.md`]: 'missing',
    'markdown/no-such-area/index.md': 'missing',
    'markdown/alpha/typo.md': 'missing',
  });
});
