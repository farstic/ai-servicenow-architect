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
