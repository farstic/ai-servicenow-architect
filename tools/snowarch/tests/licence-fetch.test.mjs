// Copyright 2026 Cvetomir Grigorov. Licensed under the Apache License, Version 2.0 (see LICENSE).
// snowarch — AI ServiceNow Architect. Not affiliated with or endorsed by ServiceNow, Inc.
// ARC-11-C1 — the revocation list, fetched by git from its explicit URL, and what a fetch may change.
//
// Three outcomes and they must stay apart (ruling R2 and the empty-repo rule):
//   fetched     — the branch and the file are there; the list is verified before anything uses it.
//   none        — the repository answered, but has no `main` yet, or no file on it: "no list",
//                 silently, which is the state of the owner's repository until the first push.
//   unreachable — offline, a wrong URL, a proxy: the cached list stands, or none, and nothing fails.
// And one rule over all of them: a list no newer than the one held never replaces it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

import { fetchList, listSource, refreshList, refreshWithUpgrade, repoUrl } from '../lib/licence/fetch.mjs';
import { licencePath } from '../lib/local-paths.mjs';
import { readListCache, writeListCache } from '../lib/licence/state.mjs';
import { keyPair, listDoc, listRepo, productKeys } from './helpers/licence.mjs';
import { tempDir } from './helpers/temp.mjs';
import { SLOW_GIT_SKIP, slowGitPath } from './helpers/slow-git.mjs';

const primary = keyPair();
const recovery = keyPair();
const stranger = keyPair();
const KEYS = productKeys(primary, recovery);
const NOW = new Date('2026-10-10T12:00:00Z');

const listJson = (version, revoked = [], key = primary) => `${JSON.stringify(listDoc({ version, revoked }, key), null, 2)}\n`;
const entry = (id, reason = 'ended') => ({ id, revokedAt: '2026-10-09', reason });
const config = (repo) => ({ licence: { revocations: { repo, ref: 'main', path: 'revocations.json' } } });

function checkout(t) {
  const root = tempDir('snowarch-licence-fetch-', t);
  mkdirSync(join(root, '.local'), { recursive: true });
  return root;
}

test('ARC-11-C1 — the list\'s address: an owner/name is GitHub over HTTPS, anything else is used as written', () => {
  assert.equal(repoUrl('farstic/snowarch-licences'), 'https://github.com/farstic/snowarch-licences.git');
  assert.equal(repoUrl('file:///tmp/list.git'), 'file:///tmp/list.git');
  assert.equal(repoUrl('https://example.invalid/list.git'), 'https://example.invalid/list.git');
  assert.deepEqual(listSource(config('farstic/snowarch-licences')),
    { url: 'https://github.com/farstic/snowarch-licences.git', ref: 'main', path: 'revocations.json' });
  for (const c of [{}, { licence: {} }, null, { licence: { revocations: { repo: '' } } }]) {
    assert.equal(listSource(c), null, JSON.stringify(c));
  }
});

test('ARC-11-C1 — a published list is fetched whole', (t) => {
  const text = listJson(1);
  const got = fetchList({ url: listRepo(t, { 'revocations.json': text }), ref: 'main', path: 'revocations.json' });
  assert.deepEqual(got, { status: 'fetched', text });
});

test('ARC-11-C1 — a repository with no main yet is "no list", not a failure (the empty-repo rule)', (t) => {
  const got = fetchList({ url: listRepo(t, null), ref: 'main', path: 'revocations.json' });
  assert.equal(got.status, 'none');
});

test('ARC-11-C1 — a main with no list file on it is "no list" too', (t) => {
  const got = fetchList({ url: listRepo(t, { 'README.md': 'list\n' }), ref: 'main', path: 'revocations.json' });
  assert.equal(got.status, 'none');
});

test('ARC-11-C1 — a repository that cannot be reached is unreachable, and says why in one line', (t) => {
  const gone = pathToFileURL(join(tempDir('snowarch-licence-gone-', t), 'nothing.git')).href;
  const got = fetchList({ url: gone, ref: 'main', path: 'revocations.json' });
  assert.equal(got.status, 'unreachable');
  assert.equal(typeof got.detail, 'string');
  assert.equal(got.detail.includes('\n'), false);
});

test('ARC-11-C1 — git is never allowed to ask for a password: no prompt, no askpass, no credential helper', () => {
  const calls = [];
  const run = (cmd, args, opts) => { calls.push({ args, env: opts.env }); return { status: 128, stdout: '', stderr: 'fatal: no\n' }; };
  fetchList({ url: 'https://example.invalid/list.git', ref: 'main', path: 'revocations.json', run, env: { PATH: process.env.PATH } });
  assert.ok(calls.length > 0);
  for (const { args, env } of calls) {
    assert.equal(env.GIT_TERMINAL_PROMPT, '0');
    assert.equal(env.GIT_ASKPASS, '');
    assert.equal(env.SSH_ASKPASS, '');
    assert.equal(env.GCM_INTERACTIVE, 'never');
    assert.ok(args.join(' ').includes('-c credential.helper='), args.join(' '));
  }
});

test('ARC-11-C1 — a refresh keeps the newer list: updated, unchanged, then an older one ignored', (t) => {
  const root = checkout(t);
  const r = (repo) => refreshList(root, { config: config(repo), keys: KEYS, now: NOW });
  const two = r(listRepo(t, { 'revocations.json': listJson(2, [entry('LIC-2026-0002')]) }));
  assert.deepEqual([two.outcome, two.version], ['updated', 2]);
  assert.equal(readListCache(root).list.list.version, 2);
  assert.equal(r(listRepo(t, { 'revocations.json': listJson(2, [entry('LIC-2026-0002')]) })).outcome, 'unchanged');
  const one = r(listRepo(t, { 'revocations.json': listJson(1, []) }));
  assert.deepEqual([one.outcome, one.version], ['older', 2]);
  assert.equal(readListCache(root).list.list.version, 2, 'rollback protection: the held list stays');
});

test('ARC-11-C1 — "no list" and "unreachable" leave a held list where it is', (t) => {
  const root = checkout(t);
  const held = listDoc({ version: 4, revoked: [entry('LIC-2026-0007', 'lost')] }, primary);
  writeListCache(root, { list: held, checkedAt: '2026-10-01T00:00:00Z', source: 'fixture' });
  const none = refreshList(root, { config: config(listRepo(t, null)), keys: KEYS, now: NOW });
  assert.deepEqual([none.outcome, none.version], ['none', 4]);
  assert.deepEqual(readListCache(root).list, held);
  assert.equal(readListCache(root).checkedAt, NOW.toISOString(), 'the repository answered, so it was checked');
  const gone = pathToFileURL(join(tempDir('snowarch-licence-gone-', t), 'nothing.git')).href;
  const off = refreshList(root, { config: config(gone), keys: KEYS, now: new Date('2026-10-11T00:00:00Z') });
  assert.deepEqual([off.outcome, off.version], ['unreachable', 4]);
  assert.equal(readListCache(root).checkedAt, NOW.toISOString(), 'an unreachable list checked nothing');
});

test('ARC-11-C1 — a published list no product key signed is refused, and the held one stays', (t) => {
  const root = checkout(t);
  const forged = refreshList(root, { config: config(listRepo(t, { 'revocations.json': listJson(9, [entry('LIC-2026-0002')], stranger) })),
    keys: KEYS, now: NOW });
  assert.equal(forged.outcome, 'refused');
  assert.match(forged.reason, /not signed by a key this product ships/);
  assert.equal(readListCache(root), null);
});

test('ARC-11-C1 — no configured list is no fetch at all', (t) => {
  const root = checkout(t);
  let ran = false;
  const out = refreshList(root, { config: {}, keys: KEYS, now: NOW, fetcher: () => { ran = true; } });
  assert.equal(out.outcome, 'unconfigured');
  assert.equal(ran, false);
});

test('ARC-11-C1 — upgrade refreshes the list only when a licence is installed, so its default run is unchanged', (t) => {
  const root = checkout(t);
  const lines = [];
  const log = { step: (m) => lines.push(m) };
  let fetched = 0;
  const fetcher = () => { fetched += 1; return { status: 'none' }; };
  const cfg = config('farstic/snowarch-licences');
  assert.equal(refreshWithUpgrade(root, { config: cfg, keys: KEYS, now: NOW, log, fetcher }), null);
  assert.deepEqual([fetched, lines], [0, []], 'no licence: no fetch and no line');
  writeFileSync(licencePath(root), '{"format":"snowarch-licence/1"}');
  const r = refreshWithUpgrade(root, { config: cfg, keys: KEYS, now: NOW, log, fetcher });
  assert.equal(r.outcome, 'none');
  assert.equal(fetched, 1);
  assert.deepEqual(lines, ['revocation list: no revocation list is published yet']);
});

// ARC-11-C11 — a `show` the deadline ends is unreachable, not "no file". The third call reads the file out of the
// clone; when the budget runs out there, the repository never answered the question, so nothing was checked and,
// as the refresh's own contract says of unreachable, the cache keeps even its date. A `show` that fails because the
// path is not on the branch stays none: "a branch with no file" above.
test('ARC-11-C11 — a show the deadline kills is unreachable, and the cache keeps its date',
  { skip: process.platform === 'win32' ? SLOW_GIT_SKIP : false }, (t) => {
    const PATH = slowGitPath({ dir: tempDir('snowarch-slow-git-', t), subcommand: 'show', seconds: 4 });
    const env = { ...process.env, PATH };
    const url = listRepo(t, { 'revocations.json': listJson(2) });
    const got = fetchList({ url, ref: 'main', path: 'revocations.json', timeoutMs: 1_500, env });
    assert.equal(got.status, 'unreachable', JSON.stringify(got));

    const root = checkout(t);
    writeListCache(root, { list: JSON.parse(listJson(1)), checkedAt: '2020-01-01T00:00:00.000Z', source: 'fixture' });
    const r = refreshList(root, { config: config(url), keys: KEYS, now: NOW, env, timeoutMs: 1_500 });
    assert.equal(r.outcome, 'unreachable', JSON.stringify(r));
    assert.equal(r.version, 1);
    assert.equal(readListCache(root).checkedAt, '2020-01-01T00:00:00.000Z', 'a check that timed out wrote a date');
  });

test('ARC-11-C11 — the budget spent before show runs is unreachable too', () => {
  // A runner that answers ls-remote and clone at once, and lets the clone finish past the deadline, so `show` is
  // the step that finds no budget left. Its own check never calls the runner for it.
  const run = (cmd, args) => {
    if (args.includes('ls-remote')) return { status: 0, stdout: `${'a'.repeat(40)}\trefs/heads/main\n`, stderr: '' };
    if (args.includes('clone')) {
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 300);
      return { status: 0, stdout: '', stderr: '' };
    }
    throw new Error(`a git call ran with no budget left: ${args.join(' ')}`);
  };
  const got = fetchList({ url: 'file:///nowhere/list.git', ref: 'main', path: 'revocations.json', timeoutMs: 200, run });
  assert.deepEqual(got, { status: 'unreachable', detail: 'no answer within 200 ms' });
});
