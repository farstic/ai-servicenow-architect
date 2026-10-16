// Copyright 2026 Cvetomir Grigorov. Licensed under the Business Source License 1.1 (see LICENSE).
// snowarch — AI ServiceNow Architect. Not affiliated with or endorsed by ServiceNow, Inc.
// ARC-11-C1 — the CLI and the server reach the same verdict on the same licence, with the same keys.
//
// TWO COPIES, BECAUSE THE SERVER IMPORTS NOTHING FROM OUTSIDE ITS PACKAGE. The key list, the
// canonical form, the signature check, the states and the banner wording exist once in
// `tools/snowarch/lib/licence/` and once in `packages/snowarch/src/licence/`. A doctor that says
// `ok` while the server refuses, or a banner that says `revoked` while the server serves, is the
// failure two copies invite, and nothing but a comparison notices it. This file is that comparison,
// run against the server's COMMITTED build, which is what a checkout actually starts.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import * as cli from '../lib/licence/core.mjs';
import { PRODUCT_KEYS as CLI_KEYS } from '../lib/licence/keys.mjs';
import { bannerLine as cliBanner, REMEDY as CLI_REMEDY } from '../lib/licence/state.mjs';
import { fetchList, listSource as cliSource } from '../lib/licence/fetch.mjs';

import { keyPair, licence, licenceText, listDoc, listRepo, productKeys } from './helpers/licence.mjs';
import { SLOW_GIT_SKIP, slowGitPath } from './helpers/slow-git.mjs';
import { tempDir } from './helpers/temp.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const dist = (rel) => import(pathToFileURL(join(ROOT, 'packages/snowarch/dist', rel)).href);
const server = await dist('licence/core.js');
const { PRODUCT_KEYS: SERVER_KEYS } = await dist('licence/keys.js');
const serverState = await dist('licence/state.js');
const { remedyFor } = await dist('errors/codes.js');

const primary = keyPair();
const recovery = keyPair();
const stranger = keyPair();
const KEYS = productKeys(primary, recovery);
const NOW = new Date('2026-10-10T12:00:00Z');

test('ARC-11-C1 — the two key lists are the same list', () => {
  assert.deepEqual(SERVER_KEYS, CLI_KEYS);
});

test('ARC-11-C1 — the two canonical forms and fingerprints agree', () => {
  const values = [
    {}, [], null, 'x', 0, -1.5, true, { b: [1, { d: 4, c: 3 }], a: 'ü' }, { a: undefined, b: null },
    licence(), { nested: { deeper: { deepest: [null, false, 'Тест'] } } },
  ];
  for (const v of values) assert.equal(server.canonicalJson(v), cli.canonicalJson(v), JSON.stringify(v));
  assert.throws(() => server.canonicalJson({ n: Number.POSITIVE_INFINITY }), /finite/);
  for (const k of [primary, recovery, stranger]) assert.equal(server.fingerprint(k.publicKey), cli.fingerprint(k.publicKey));
});

/** Every verdict the core can reach, each as the text of a file and the options it is read with. */
function cases() {
  const { valid_until: _, ...forever } = licence({ id: 'LIC-2026-0001' });
  const doc = JSON.parse(licenceText(licence(), primary));
  doc.licence.valid_until = '2099-12-31';
  const revoked = cli.readList(listDoc({ version: 4, revoked: [{ id: 'LIC-2026-0002', revokedAt: '2026-10-09', reason: 'breach' }] }, primary), { keys: KEYS });
  return [
    ['ok', licenceText(licence(), primary), {}],
    ['recovery', licenceText(licence(), recovery), {}],
    ['stranger', licenceText(licence(), stranger), {}],
    ['perpetual', licenceText(forever, primary), {}],
    ['perpetual stranger', licenceText(forever, stranger), {}],
    ['expiring', licenceText(licence({ valid_until: '2026-10-20' }), primary), {}],
    // The window's two edges, so a copy whose EXPIRING_DAYS drifted from the other's cannot agree here.
    ['day 30', licenceText(licence({ valid_until: '2026-11-09' }), primary), {}],
    ['day 31', licenceText(licence({ valid_until: '2026-11-10' }), primary), {}],
    ['last day', licenceText(licence({ valid_until: '2026-10-10' }), primary), {}],
    // ARC-09-C159 — a 30-day term's threshold is 10: 20 left is ok, 10 is expiring, and 11 is ok in a 32-day term.
    ['30-day term, 20 left', licenceText(licence({ issued: '2026-09-30', valid_until: '2026-10-30' }), primary), {}],
    ['30-day term, 10 left', licenceText(licence({ issued: '2026-09-20', valid_until: '2026-10-20' }), primary), {}],
    ['32-day term, 11 left', licenceText(licence({ issued: '2026-09-19', valid_until: '2026-10-21' }), primary), {}],
    ['expired', licenceText(licence({ valid_until: '2026-10-09' }), primary), {}],
    ['design-only', licenceText(licence({ scope: 'design-only' }), primary), {}],
    ['forged', JSON.stringify(doc), {}],
    ['missing', null, {}],
    ['garbage', 'not json', {}],
    ['bad id', licenceText(licence({ id: 'LIC-1' }), primary), {}],
    ['revoked', licenceText(licence(), primary), { list: revoked }],
    ['no keys', licenceText(licence(), primary), { keys: [] }],
  ];
}

test('ARC-11-C1 — the CLI and the server reach the same status on every case', () => {
  for (const [name, text, opts] of cases()) {
    const o = { keys: KEYS, now: NOW, list: null, ...opts };
    assert.deepEqual(server.checkLicence(text, o), cli.checkLicence(text, o), name);
  }
});

test('ARC-11-C1 — the CLI and the server read the same lists the same way, and keep the same one', () => {
  const entry = { id: 'LIC-2026-0002', revokedAt: '2026-10-11', reason: 'other' };
  const docs = [
    listDoc({ version: 1, revoked: [entry] }, primary),
    listDoc({ version: 2, revoked: [] }, recovery),
    listDoc({ version: 1, revoked: [entry] }, stranger),
    listDoc({ version: 1, revoked: [{ ...entry, notes: 'free text' }] }, primary),
    'not json',
  ];
  for (const doc of docs) assert.deepEqual(server.readList(doc, { keys: KEYS }), cli.readList(doc, { keys: KEYS }));
  const [one, two] = docs.slice(0, 2).map((d) => cli.readList(d, { keys: KEYS }));
  assert.deepEqual(server.newerList(two, one), cli.newerList(two, one));
  assert.deepEqual(server.newerList(one, two), cli.newerList(one, two));
});

test('ARC-11-C1 — the banner line and the server\'s notice say the state in the same words', () => {
  for (const [name, text, opts] of cases()) {
    const s = cli.checkLicence(text, { keys: KEYS, now: NOW, list: null, ...opts });
    for (const enforced of [false, true]) {
      assert.equal(serverState.licenceLine(s, { enforced }), cliBanner(s, { enforced }), `${name} enforced=${enforced}`);
    }
  }
});

test('ARC-11-C1 — the CLI refuses with the remedy the server\'s error code carries', () => {
  const spell = { cli: '<cli>', bootstrap: '<bootstrap>' };
  assert.equal(CLI_REMEDY(spell.cli), remedyFor('LICENCE_NOT_VALID', spell).remedy);
});

test('ARC-11-C1 — the CLI and the server read the list\'s address from the same config the same way', () => {
  const configs = [
    { licence: { revocations: { repo: 'farstic/snowarch-licences', ref: 'main', path: 'revocations.json' } } },
    { licence: { revocations: { repo: 'file:///tmp/list.git', ref: 'main', path: 'revocations.json' } } },
    { licence: {} }, {}, null,
  ];
  for (const c of configs) assert.deepEqual(serverState.listSource(c), cliSource(c), JSON.stringify(c));
});

// ARC-11-C6, the architect's ruling B (2026-10-12) — ONE FILE, WHICHEVER SIDE READS IT. The CLI reads
// `<state root>/.local/licence.json`, where the state root is the checkout unless SNOWARCH_STATE_ROOT moves it;
// the server reads `<CLAUDE_PROJECT_DIR, else its working directory>/.local/licence.json`, and Claude Code starts
// it with CLAUDE_PROJECT_DIR set to the checkout. With no variable set, both are the same file, so a licence
// copied in once is the one both see; enforcement on every build would otherwise refuse on one side only.
test('ARC-11-C6 ruling B — with no state root set, the CLI and the server read the licence from one file', async (t) => {
  const { licencePath: cliPath } = await import('../lib/local-paths.mjs');
  const { licenceStatus: cliStatus } = await import('../lib/licence/state.mjs');
  const session = await dist('licence/session.js');
  const saved = { state: process.env.SNOWARCH_STATE_ROOT, project: process.env.CLAUDE_PROJECT_DIR };
  t.after(() => {
    for (const [k, v] of [['SNOWARCH_STATE_ROOT', saved.state], ['CLAUDE_PROJECT_DIR', saved.project]]) {
      if (v === undefined) delete process.env[k]; else process.env[k] = v;
    }
  });
  delete process.env.SNOWARCH_STATE_ROOT;

  // The paths, for this checkout: the CLI's, and the one the server takes from CLAUDE_PROJECT_DIR.
  const want = join(ROOT, '.local', 'licence.json');
  assert.equal(cliPath(ROOT), want);
  assert.equal(serverState.licencePath(ROOT), want);

  // And what each side READS, for a checkout of a test's own: the server's session takes its root from
  // CLAUDE_PROJECT_DIR, the CLI is handed the same root, and both find the one licence written there.
  const root = tempDir('snowarch-licence-one-file-', t);
  mkdirSync(join(root, '.local'), { recursive: true });
  writeFileSync(join(root, '.local', 'licence.json'), licenceText(licence({ id: 'LIC-2026-9003' }), primary));
  process.env.CLAUDE_PROJECT_DIR = root;
  const served = session.initLicence({ keys: KEYS, env: {}, now: () => NOW });
  const read = cliStatus(root, { keys: KEYS, env: {}, now: NOW });
  assert.deepEqual([served.state, served.id], ['ok', 'LIC-2026-9003'], 'the server did not read <CLAUDE_PROJECT_DIR>/.local/licence.json');
  assert.deepEqual([read.state, read.id], ['ok', 'LIC-2026-9003'], 'the CLI did not read <root>/.local/licence.json');
});

// ARC-11-C6 step 7 — THE DAYS LEFT, IN ONE WORDING. E-31's expiring detail and the server's first-answer notice each
// say what is left of the term through their side's phrase. The day of `valid_until` counts, until 00:00 UTC of the
// next (docs/USER-GUIDE.md), so 0 days left is the last day, and is named so, not "0 days left".
test('ARC-11-C6 step 7 — the CLI and the server say the days left in the same words, and name the last day', async () => {
  const { daysLeftPhrase: cliDays } = await import('../lib/licence/state.mjs');
  for (const [days, phrase] of [[0, 'last day'], [1, '1 day left'], [2, '2 days left'], [30, '30 days left']]) {
    assert.equal(cliDays(days), phrase, `the CLI, ${days}`);
    assert.equal(serverState.daysLeftPhrase(days), phrase, `the server, ${days}`);
  }
  // And on every expiring case the core reaches, the window's edges included.
  for (const [name, text, opts] of cases()) {
    const s = cli.checkLicence(text, { keys: KEYS, now: NOW, list: null, ...opts });
    if (s.state === 'expiring') assert.equal(serverState.daysLeftPhrase(s.daysLeft), cliDays(s.daysLeft), name);
  }
});

// ARC-11-C11 — THE TWO FETCHES CLASSIFY THE SAME REPOSITORIES THE SAME WAY, the deadline in the third call among
// them. Each copy is its own code, the CLI's synchronous on a 15-second budget and the server's asynchronous on
// three, so a reading fixed in one and not the other is exactly the failure two copies invite. Run against the
// server's committed build, as the cases above are. The deadline case needs a git that is slow on `show`, which
// only POSIX can stand in for; on Windows it is reported as not run, by name, and the others still run.
test('ARC-11-C11 — the CLI and the server classify the same repositories the same way', async (t) => {
  const { fetchListAsync } = await dist('licence/refresh.js');
  const text = `${JSON.stringify(listDoc({ version: 1, revoked: [] }, primary), null, 2)}\n`;
  const gone = pathToFileURL(join(tempDir('snowarch-gone-', t), 'nothing.git')).href;
  const cases = [
    ['a published list', listRepo(t, { 'revocations.json': text }), 'fetched', null],
    ['a repository with no branch', listRepo(t, null), 'none', null],
    ['a branch with no file', listRepo(t, { 'README.md': 'x\n' }), 'none', null],
    ['no repository at all', gone, 'unreachable', null],
    ['a show the deadline kills', listRepo(t, { 'revocations.json': text }), 'unreachable', 'show'],
  ];
  for (const [name, url, expected, slow] of cases) {
    let env = process.env;
    let budget = 20_000;
    if (slow) {
      const PATH = slowGitPath({ dir: tempDir('snowarch-slow-git-', t), subcommand: slow, seconds: 4 });
      if (PATH === null) { t.diagnostic(`${name}: not run, ${SLOW_GIT_SKIP}`); continue; }
      env = { ...process.env, PATH };
      budget = 1_500;
    }
    const cli = fetchList({ url, ref: 'main', path: 'revocations.json', timeoutMs: budget, env });
    const server = await fetchListAsync({ url, ref: 'main', path: 'revocations.json', budgetMs: budget, env });
    assert.equal(cli.status, expected, `${name}: the CLI says ${JSON.stringify(cli)}`);
    assert.equal(server.status, expected, `${name}: the server says ${JSON.stringify(server)}`);
  }
});
