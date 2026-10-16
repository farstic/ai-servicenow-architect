// Copyright 2026 Cvetomir Grigorov. Licensed under the Business Source License 1.1 (see LICENSE).
// snowarch — AI ServiceNow Architect. Not affiliated with or endorsed by ServiceNow, Inc.
// ARC-11-C1 — `./snowarch licence`: keygen, issue, show, verify, check, init-list and revoke.
//
// The owner's side (keygen, issue, init-list, revoke) works with PRIVATE keys, and the rule for those
// is absolute: they are written and read only OUTSIDE the checkout — `.local/` included, symlinks
// resolved — and they never appear in anything the command prints. The licensee's side (show, verify,
// check) reads `.local/licence.json` and the cached list, and fetches only when asked to.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readFileSync, renameSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import { licenceCommand } from '../lib/commands/licence.mjs';
import { readList } from '../lib/licence/core.mjs';
import { readListCache } from '../lib/licence/state.mjs';
import { licencePath, revocationsPath } from '../lib/local-paths.mjs';
import { EXIT_FAIL, EXIT_OK, EXIT_USAGE } from '../lib/exit.mjs';
import { keyPair, licence, licenceText, listDoc, listRepo, manifestDoc, productKeys } from './helpers/licence.mjs';
import { manifestFromArchive, readManifest, readManifestCache } from '../lib/licence/manifest.mjs';
import { tempDir } from './helpers/temp.mjs';
import { fileURLToPath } from 'node:url';
import { spellings } from '../lib/text.mjs';

const REPO = fileURLToPath(new URL('../../../', import.meta.url));

const NOW = new Date('2026-10-10T12:00:00Z');

function capture() {
  const lines = [];
  const push = (kind) => (m) => { lines.push(`${kind}: ${m}`); };
  const log = { step: push('step'), ok: push('ok'), note: push('note'), warn: push('warn'), fail: push('fail'),
    debug: () => {}, json: (v) => { lines.push(`json: ${JSON.stringify(v)}`); } };
  return { log, lines, text: () => lines.join('\n') };
}

/** A checkout (the root) and a place outside it, as the owner's machine has both. */
function world(t) {
  const root = tempDir('snowarch-licence-root-', t);
  mkdirSync(join(root, '.local'), { recursive: true });
  const outside = tempDir('snowarch-licence-keys-', t);
  return { root, outside };
}

async function run(w, positional, flags = {}, extra = {}) {
  const c = capture();
  const code = await licenceCommand({ positional, flags, log: c.log, root: w.root, env: {}, now: () => NOW,
    config: {}, ...extra });
  return { code, text: c.text(), lines: c.lines };
}

/** keygen into `outside`, and the key list a build shipping those two keys would carry. */
async function keygen(t, w) {
  const out = join(w.outside, 'primary.pem');
  const rec = join(w.outside, 'recovery', 'recovery.pem');
  const r = await run(w, ['keygen'], { out, 'recovery-out': rec, to: 'Test Owner', org: 'Test Org' });
  assert.equal(r.code, EXIT_OK, r.text);
  const pub = JSON.parse(readFileSync(join(w.outside, 'public-keys.json'), 'utf8'));
  return { ...r, out, rec, keys: pub.keys };
}

test('ARC-11-C1 — keygen refuses any path inside the checkout, .local/ included, symlinks resolved', async (t) => {
  const w = world(t);
  const link = join(w.outside, 'via-link');
  symlinkSync(w.root, link, process.platform === 'win32' ? 'junction' : 'dir');
  const ok = join(w.outside, 'r.pem');
  for (const inside of [join(w.root, 'k.pem'), join(w.root, '.local', 'k.pem'), join(link, 'k.pem'),
    join(w.root, 'deeper', 'not-yet', 'k.pem')]) {
    for (const flags of [{ out: inside, 'recovery-out': ok }, { out: join(w.outside, 'p.pem'), 'recovery-out': inside }]) {
      const r = await run(w, ['keygen'], { ...flags, to: 'Test Owner', org: 'Test Org' });
      assert.equal(r.code, EXIT_USAGE, `${inside}\n${r.text}`);
      assert.match(r.text, /inside this checkout/);
    }
  }
  assert.equal(existsSync(join(w.root, 'k.pem')), false);
  assert.equal(existsSync(join(w.outside, 'p.pem')), false, 'a refusal writes neither key');
});

test('ARC-11-C1 — keygen refuses one path for both keys, and never overwrites a key', async (t) => {
  const w = world(t);
  const p = join(w.outside, 'k.pem');
  const same = await run(w, ['keygen'], { out: p, 'recovery-out': p, to: 'Test Owner', org: 'Test Org' });
  assert.equal(same.code, EXIT_USAGE);
  writeFileSync(p, 'precious');
  const again = await run(w, ['keygen'], { out: p, 'recovery-out': join(w.outside, 'r.pem'), to: 'Test Owner', org: 'Test Org' });
  assert.equal(again.code, EXIT_USAGE);
  assert.equal(readFileSync(p, 'utf8'), 'precious');
  const missing = await run(w, ['keygen'], { out: join(w.outside, 'x.pem') });
  assert.equal(missing.code, EXIT_USAGE);
  assert.match(missing.text, /--recovery-out/);
});

test('ARC-11-C1 — keygen writes two key pairs, the creator\'s perpetual live licence and the ledger, and prints no private key', async (t) => {
  const w = world(t);
  const g = await keygen(t, w);
  for (const p of [g.out, g.rec]) {
    assert.match(readFileSync(p, 'utf8'), /BEGIN PRIVATE KEY/);
    if (process.platform !== 'win32') assert.equal(statSync(p).mode & 0o777, 0o600, p);
  }
  assert.equal(g.keys.length, 2);
  assert.deepEqual(g.keys.map((k) => k.role), ['primary', 'recovery']);
  assert.doesNotMatch(readFileSync(join(w.outside, 'public-keys.json'), 'utf8'), /PRIVATE KEY/);
  assert.doesNotMatch(g.text, /PRIVATE KEY/, 'keygen printed a private key');
  for (const k of g.keys) assert.ok(g.text.includes(k.fingerprint), `${k.role}'s fingerprint is not printed`);
  assert.match(g.text, /offline/);

  const creator = join(w.outside, 'LIC-2026-0001.json');
  assert.ok(existsSync(creator), 'the creator licence is written beside the primary key');
  const v = await run(w, ['verify', creator], {}, { keys: g.keys });
  assert.equal(v.code, EXIT_OK, v.text);
  assert.match(v.text, /Licence: ok · LIC-2026-0001 · perpetual/);
  const doc = JSON.parse(readFileSync(creator, 'utf8'));
  assert.deepEqual([doc.licence.scope, doc.licence.licensee, doc.licence.valid_until], ['live', 'Test Owner', undefined]);
  const ledger = JSON.parse(readFileSync(join(w.outside, 'issued.json'), 'utf8'));
  assert.deepEqual(ledger.issued.map((e) => e.id), ['LIC-2026-0001']);
});

test('ARC-11-C1 — issue numbers from the ledger beside the key, signs, and the licence round-trips through show and verify', async (t) => {
  const w = world(t);
  const g = await keygen(t, w);
  const issue = (over = {}) => run(w, ['issue'], { to: 'Test Licensee', org: 'Test Org', scope: 'live',
    'valid-until': '2027-10-10', key: g.out, ...over }, { keys: g.keys });
  const a = await issue();
  assert.equal(a.code, EXIT_OK, a.text);
  assert.match(a.text, /LIC-2026-0002/);
  const b = await issue({ scope: 'design-only' });
  assert.match(b.text, /LIC-2026-0003/);
  const file = join(w.outside, 'LIC-2026-0002.json');

  copyFileSync(file, licencePath(w.root));
  const show = await run(w, ['show'], {}, { keys: g.keys });
  assert.equal(show.code, EXIT_OK, show.text);
  for (const s of ['Licence: ok · LIC-2026-0002 · until 2027-10-10', 'Test Licensee', 'Test Org', 'primary']) {
    assert.ok(show.text.includes(s), `show lacks "${s}"\n${show.text}`);
  }
  const forged = JSON.parse(readFileSync(file, 'utf8'));
  forged.licence.valid_until = '2099-12-31';
  const forgedPath = join(w.outside, 'forged.json');
  writeFileSync(forgedPath, JSON.stringify(forged));
  const bad = await run(w, ['verify', forgedPath], {}, { keys: g.keys });
  assert.equal(bad.code, EXIT_FAIL);
  assert.match(bad.text, /Licence: invalid/);
});

test('ARC-11-C1 — issue: one of --valid-until and --perpetual, a key outside the checkout, an id when there is no ledger', async (t) => {
  const w = world(t);
  const g = await keygen(t, w);
  const base = { to: 'Test Licensee', org: 'Test Org', scope: 'live', key: g.out };
  assert.equal((await run(w, ['issue'], base)).code, EXIT_USAGE);
  assert.equal((await run(w, ['issue'], { ...base, 'valid-until': '2027-01-01', perpetual: true })).code, EXIT_USAGE);
  assert.equal((await run(w, ['issue'], { ...base, 'valid-until': '01/01/2027' })).code, EXIT_USAGE);
  assert.equal((await run(w, ['issue'], { ...base, scope: 'everything', 'valid-until': '2027-01-01' })).code, EXIT_USAGE);

  const insideKey = join(w.root, 'k.pem');
  copyFileSync(g.out, insideKey);
  const inside = await run(w, ['issue'], { ...base, key: insideKey, 'valid-until': '2027-01-01' });
  assert.equal(inside.code, EXIT_USAGE);
  assert.match(inside.text, /inside this checkout/);

  // The recovery key's directory has no ledger: an id must be given, or two licences could share one.
  const noLedger = await run(w, ['issue'], { ...base, key: g.rec, 'valid-until': '2027-01-01' });
  assert.equal(noLedger.code, EXIT_USAGE);
  assert.match(noLedger.text, /--id/);
  const withId = await run(w, ['issue'], { ...base, key: g.rec, 'valid-until': '2027-01-01', id: 'LIC-2026-0100', issuer: 'Test Owner' },
    { keys: g.keys });
  assert.equal(withId.code, EXIT_OK, withId.text);
  assert.ok(existsSync(join(dirname(g.rec), 'LIC-2026-0100.json')));

  const perpetual = await run(w, ['issue'], { ...base, perpetual: true }, { keys: g.keys });
  assert.equal(perpetual.code, EXIT_OK, perpetual.text);
});

test('ARC-11-C1 — issue with a key this build does not ship says so, and still writes the licence', async (t) => {
  const w = world(t);
  const g = await keygen(t, w);
  const r = await run(w, ['issue'], { to: 'Test Licensee', org: 'Test Org', scope: 'live', 'valid-until': '2027-01-01',
    key: g.out }, { keys: productKeys(keyPair(), keyPair()) });
  assert.equal(r.code, EXIT_OK, r.text);
  assert.match(r.text, /not one this build ships/);
});

test('ARC-11-C6 — show and check with no licence say missing, what is refused, and exit 1', async (t) => {
  const w = world(t);
  for (const sub of ['show', 'check']) {
    const r = await run(w, [sub]);
    assert.equal(r.code, EXIT_FAIL, r.text);
    assert.match(r.text, /Licence: missing\n/);
    assert.match(r.text, /every command but licence, doctor, status, version, upgrade, bootstrap and mode design is refused, and every MCP tool/);
    assert.doesNotMatch(r.text, /enforce:|warn only/);
  }
});

test('ARC-09-C159 — check names the renewal for an expiring licence, in E-31\'s words, and a licence that is ok says nothing of it', async (t) => {
  // Issued months ago (the fixture's 2026-01-15), so the threshold is the full 30 days: `issue` stamps today, and a
  // licence issued today is never expiring before its last third.
  const w = world(t);
  const primary = keyPair();
  const keys = productKeys(primary, keyPair());
  writeFileSync(licencePath(w.root), licenceText(licence({ valid_until: '2026-10-20' }), primary));
  const r = await run(w, ['check'], {}, { keys });
  assert.equal(r.code, EXIT_OK, r.text);
  assert.match(r.text, /Licence: expiring · LIC-2026-0002/);
  assert.ok(r.lines.includes('step:   Licence LIC-2026-0002 expires on 2026-10-20 (10 days left) — ask the issuer for a renewal before then.'), r.text);
  assert.doesNotMatch(r.text, /install a valid licence/);
  writeFileSync(licencePath(w.root), licenceText(licence(), primary));
  const ok = await run(w, ['check'], {}, { keys });
  assert.equal(ok.code, EXIT_OK, ok.text);
  assert.doesNotMatch(ok.text, /renewal/);
});

test('ARC-11-C1 — init-list writes a signed version-1 empty list and the commands for the owner\'s first push', async (t) => {
  const w = world(t);
  const g = await keygen(t, w);
  const dir = join(w.outside, 'snowarch-licences');
  mkdirSync(dir);
  const r = await run(w, ['init-list'], { list: dir, key: g.out }, { keys: g.keys,
    config: { licence: { revocations: { repo: 'farstic/snowarch-licences', ref: 'main', path: 'revocations.json' } } } });
  assert.equal(r.code, EXIT_OK, r.text);
  const list = readList(readFileSync(join(dir, 'revocations.json'), 'utf8'), { keys: g.keys });
  assert.deepEqual([list.ok, list.version, list.revoked], [true, 1, []]);
  for (const s of ['git -C', 'init', 'https://github.com/farstic/snowarch-licences.git', 'push']) {
    assert.ok(r.text.includes(s), `the push commands lack "${s}"\n${r.text}`);
  }
  assert.match(r.text, /never pushes/);
  assert.equal((await run(w, ['init-list'], { list: dir, key: g.out }, { keys: g.keys })).code, EXIT_USAGE,
    'a second init-list would replace the list');
  const inside = await run(w, ['init-list'], { list: w.root, key: g.out }, { keys: g.keys });
  assert.equal(inside.code, EXIT_USAGE);
});

test('ARC-11-C1 — revoke: the first creates the list, each next one raises the version, no names and no free text', async (t) => {
  const w = world(t);
  const g = await keygen(t, w);
  const dir = join(w.outside, 'list');
  mkdirSync(dir);
  const revoke = (id, reason) => run(w, ['revoke', id], { reason, key: g.out, list: dir }, { keys: g.keys });
  const first = await revoke('LIC-2026-0002', 'ended');
  assert.equal(first.code, EXIT_OK, first.text);
  assert.match(first.text, /push/);
  let list = readList(readFileSync(join(dir, 'revocations.json'), 'utf8'), { keys: g.keys });
  assert.deepEqual([list.version, list.revoked], [1, [{ id: 'LIC-2026-0002', revokedAt: '2026-10-10', reason: 'ended' }]]);
  assert.equal((await revoke('LIC-2026-0003', 'lost')).code, EXIT_OK);
  list = readList(readFileSync(join(dir, 'revocations.json'), 'utf8'), { keys: g.keys });
  assert.equal(list.version, 2);
  assert.equal((await revoke('LIC-2026-0003', 'lost')).code, EXIT_USAGE, 'revoked twice');
  assert.equal((await revoke('LIC-2026-0004', 'they did not pay on time')).code, EXIT_USAGE, 'free text');
  assert.equal((await revoke('Test Licensee', 'ended')).code, EXIT_USAGE, 'a name, not an id');
  for (const e of list.revoked) assert.deepEqual(Object.keys(e).sort(), ['id', 'reason', 'revokedAt']);
});

test('ARC-11-C1 — check --refresh fetches the list, and a revoked licence reads revoked', async (t) => {
  const w = world(t);
  const g = await keygen(t, w);
  const a = await run(w, ['issue'], { to: 'Test Licensee', org: 'Test Org', scope: 'live', 'valid-until': '2027-10-10',
    key: g.out }, { keys: g.keys });
  assert.equal(a.code, EXIT_OK, a.text);
  copyFileSync(join(w.outside, 'LIC-2026-0002.json'), licencePath(w.root));
  const dir = join(w.outside, 'list');
  mkdirSync(dir);
  await run(w, ['revoke', 'LIC-2026-0002'], { reason: 'breach', key: g.out, list: dir }, { keys: g.keys });
  const repo = listRepo(t, { 'revocations.json': readFileSync(join(dir, 'revocations.json'), 'utf8') });
  const config = { licence: { revocations: { repo, ref: 'main', path: 'revocations.json' } } };

  const before = await run(w, ['check'], {}, { keys: g.keys, config });
  assert.match(before.text, /Licence: ok/, 'check without --refresh never fetches');
  const after = await run(w, ['check'], { refresh: true }, { keys: g.keys, config });
  assert.equal(after.code, EXIT_FAIL, after.text);
  assert.match(after.text, /Licence: revoked\n/);
  assert.match(after.text, /version 1/);
  assert.equal(readListCache(w.root).list.list.version, 1);
});

test('ARC-11-C1 — check --refresh against a repository with nothing published yet changes nothing', async (t) => {
  const w = world(t);
  const g = await keygen(t, w);
  writeFileSync(licencePath(w.root), licenceText(licence({ id: 'LIC-2026-0005' }), { privateKey: readFileSync(g.out, 'utf8') }));
  const config = { licence: { revocations: { repo: listRepo(t, null), ref: 'main', path: 'revocations.json' } } };
  const r = await run(w, ['check'], { refresh: true }, { keys: g.keys, config });
  assert.equal(r.code, EXIT_OK, r.text);
  assert.match(r.text, /Licence: ok · LIC-2026-0005/);
  assert.match(r.text, /no revocation list is published yet/);
});

test('ARC-11-C1 — an unknown sub-command, or none, is a usage error', async (t) => {
  const w = world(t);
  assert.equal((await run(w, [])).code, EXIT_USAGE);
  assert.equal((await run(w, ['sign'])).code, EXIT_USAGE);
});

test('ARC-11-C1 — check says when the held list is more than a day old, and only then', async (t) => {
  const w = world(t);
  const key = keyPair();
  const keys = productKeys(key, keyPair());
  const hold = (checkedAt) => writeFileSync(revocationsPath(w.root),
    JSON.stringify({ checkedAt, source: 'fixture', list: listDoc({ version: 2, revoked: [] }, key) }));
  hold('2026-10-09T11:00:00.000Z');
  const stale = await run(w, ['check'], {}, { keys });
  assert.match(stale.text,
    /revocation list: version 2, checked 2026-10-09T11:00:00\.000Z — more than a day old; --refresh fetches it now/);
  hold('2026-10-10T11:00:00.000Z');
  const fresh = await run(w, ['check'], {}, { keys });
  assert.match(fresh.text, /revocation list: version 2, checked 2026-10-10T11:00:00\.000Z$/m);
  assert.equal(fresh.text.includes('more than a day old'), false);
});

test('ARC-11-C1 — after keygen, a perpetual live licence issued with the primary key is the next id, and verifies', async (t) => {
  // The owner's own next step: a corrected creator licence. The keys `keygen` made are the product keys
  // once committed, which is what injecting them here stands for.
  const w = world(t);
  const g = await keygen(t, w);
  const r = await run(w, ['issue'], { to: 'Test Owner', org: 'Test Org', scope: 'live', perpetual: true, key: g.out },
    { keys: g.keys });
  assert.equal(r.code, EXIT_OK, r.text);
  assert.match(r.text, /licence issue: LIC-2026-0002 for Test Owner \(Test Org\), live, perpetual/);
  assert.equal(r.text.includes('not one this build ships'), false, 'the primary key is a product key');
  const v = await run(w, ['verify', join(w.outside, 'LIC-2026-0002.json')], {}, { keys: g.keys });
  assert.equal(v.code, EXIT_OK, v.text);
  assert.match(v.text, /Licence: ok · LIC-2026-0002 · perpetual/);
  const ledger = JSON.parse(readFileSync(join(w.outside, 'issued.json'), 'utf8'));
  assert.deepEqual(ledger.issued.map((e) => [e.id, e.valid_until]), [['LIC-2026-0001', null], ['LIC-2026-0002', null]]);
});

test('ARC-11-C1 — keygen refuses a placeholder as --org, naming the flag and the value, and writes nothing', async (t) => {
  // The owner's own keygen took `--org "<фирма или твоето име>"` pasted as it stood, and the creator licence
  // carries it. A value that is a placeholder — "<" … ">" once trimmed — never reaches a signed licence.
  const w = world(t);
  const out = join(w.outside, 'primary.pem');
  const r = await run(w, ['keygen'], { out, 'recovery-out': join(w.outside, 'recovery.pem'), to: 'Test Owner',
    org: '<фирма или твоето име>' });
  assert.equal(r.code, EXIT_USAGE, r.text);
  assert.match(r.text, /--org "<фирма или твоето име>" is a placeholder, not a value/);
  assert.equal(existsSync(out), false, 'a refused keygen wrote a key');
});

test('ARC-11-C1 — issue refuses a placeholder as --to, trimmed, and keeps a value that only contains brackets', async (t) => {
  const w = world(t);
  const g = await keygen(t, w);
  const base = { org: 'Test Org', scope: 'live', 'valid-until': '2027-10-10', key: g.out };
  const r = await run(w, ['issue'], { ...base, to: '  <your name>  ' }, { keys: g.keys });
  assert.equal(r.code, EXIT_USAGE, r.text);
  assert.match(r.text, /--to " {2}<your name> {2}" is a placeholder, not a value/);
  assert.equal(existsSync(join(w.outside, 'LIC-2026-0002.json')), false, 'a refused issue wrote a licence');
  const kept = await run(w, ['issue'], { ...base, to: 'Test Licensee <Test Org>' }, { keys: g.keys });
  assert.equal(kept.code, EXIT_OK, kept.text);
});

test('ARC-11-C6 step 7 — show\'s and verify\'s valid until: line says the day is UTC, with the days left, and the last day by name', async (t) => {
  const w = world(t);
  const key = keyPair();
  const keys = productKeys(key, keyPair());
  // NOW is 2026-10-10. An expired licence's line has no count: its why: line says when it ended.
  for (const [until, tail] of [['2026-10-20', '(UTC, 10 days)'], ['2026-10-11', '(UTC, 1 day)'],
    ['2026-10-10', '(UTC, last day)'], ['2026-10-09', '(UTC)']]) {
    writeFileSync(licencePath(w.root), licenceText(licence({ valid_until: until }), key));
    for (const args of [['show'], ['verify', licencePath(w.root)]]) {
      const r = await run(w, args, {}, { keys });
      assert.ok(r.lines.includes(`step:   valid until:  ${until} ${tail}`), `${args[0]} ${until}\n${r.text}`);
    }
  }
});

test('ARC-11-C6 step 7 — check prints the same valid until: line after its banner, when the signature holds and there is a term', async (t) => {
  // check is the command every remedy names, so it carries the day's meaning too (the architect's ruling B, 2026-10-12).
  const w = world(t);
  const key = keyPair();
  const keys = productKeys(key, keyPair());
  for (const [until, tail] of [['2026-10-20', '(UTC, 10 days)'], ['2026-10-10', '(UTC, last day)'], ['2026-10-09', '(UTC)']]) {
    writeFileSync(licencePath(w.root), licenceText(licence({ valid_until: until }), key));
    const r = await run(w, ['check'], {}, { keys });
    assert.equal(r.lines[1], `step:   valid until:  ${until} ${tail}`, r.text);
  }
  // No term, or no signature to trust one from: no line.
  const { valid_until: _, ...forever } = licence();
  writeFileSync(licencePath(w.root), licenceText(forever, key));
  const perpetual = await run(w, ['check'], {}, { keys });
  const forged = JSON.parse(licenceText(licence(), key));
  forged.licence.valid_until = '2099-12-31';
  writeFileSync(licencePath(w.root), JSON.stringify(forged));
  const invalid = await run(w, ['check'], {}, { keys });
  for (const r of [perpetual, invalid]) assert.equal(r.text.includes('valid until:'), false, r.text);
});

test('ARC-11-C7 — check --refresh also fetches this release\'s signed manifest; a development tree fetches none', async (t) => {
  const w = world(t);
  const g = await keygen(t, w);
  const key = { privateKey: readFileSync(g.out, 'utf8') };
  writeFileSync(licencePath(w.root), licenceText(licence({ id: 'LIC-2026-0005' }), key));
  const repo = listRepo(t, { 'releases/v9.1.0.json': `${JSON.stringify(manifestDoc('v9.1.0', key))}\n` });
  const config = { licence: { revocations: { repo, ref: 'main', path: 'revocations.json' } } };

  writeFileSync(join(w.root, 'package.json'), '{ "version": "9.1.0" }\n');
  const release = await run(w, ['check'], { refresh: true }, { keys: g.keys, config });
  assert.equal(release.code, EXIT_OK, release.text);
  assert.match(release.text, /^step: release manifest: v9\.1\.0 fetched \(1 file\)$/m);
  assert.equal(readManifestCache(w.root).tag, 'v9.1.0');

  writeFileSync(join(w.root, 'package.json'), '{ "version": "9.1.0-dev" }\n');
  const dev = await run(w, ['check'], { refresh: true }, { keys: g.keys, config });
  assert.doesNotMatch(dev.text, /release manifest/);
});

// ── ARC-11-C7 — sign-release ─────────────────────────────────────────────────────────────────────────────────────

const gitIn = (cwd, args) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: 'pipe',
  env: { ...process.env, GIT_AUTHOR_NAME: 'f', GIT_AUTHOR_EMAIL: 'f@example.invalid', GIT_COMMITTER_NAME: 'f',
    GIT_COMMITTER_EMAIL: 'f@example.invalid' } }).trim();

/** The world's root as a release checkout: a few covered files, the real attributes, tagged `tag`. */
function releaseRoot(w, tag) {
  const files = {
    '.gitattributes': readFileSync(join(REPO, '.gitattributes'), 'utf8'),
    'package.json': `{ "version": "${tag.slice(1)}" }\n`,
    'CLAUDE.md': '# a release\n',
    'tools/snowarch/lib/a.mjs': 'export const a = 1;\n',
    'docs/page.md': 'not covered\n',
  };
  for (const [rel, text] of Object.entries(files)) {
    mkdirSync(dirname(join(w.root, rel)), { recursive: true });
    writeFileSync(join(w.root, rel), text);
  }
  gitIn(w.root, ['init', '-q', '--initial-branch=main']);
  gitIn(w.root, ['add', '-A']);
  gitIn(w.root, ['commit', '-qm', tag]);
  gitIn(w.root, ['tag', '-a', tag, '-m', tag]);
}

test('ARC-11-C7 — sign-release signs the tag\'s manifest into the licences clone and prints how to publish it', async (t) => {
  const w = world(t);
  const g = await keygen(t, w);
  releaseRoot(w, 'v9.1.0');
  const dir = join(w.outside, 'licences');
  mkdirSync(dir);
  const r = await run(w, ['sign-release', 'v9.1.0'], { key: g.out, list: dir }, { keys: g.keys });
  assert.equal(r.code, EXIT_OK, r.text);
  const doc = readFileSync(join(dir, 'releases', 'v9.1.0.json'), 'utf8');
  const read = readManifest(doc, { keys: g.keys });
  assert.deepEqual([read.ok, read.manifest.tag, read.key], [true, 'v9.1.0', 'primary']);
  assert.deepEqual(read.manifest.files, manifestFromArchive(w.root, 'v9.1.0').files);
  assert.deepEqual(Object.keys(read.manifest.files).sort(), ['CLAUDE.md', 'package.json', 'tools/snowarch/lib/a.mjs']);
  assert.match(r.text, /licence sign-release: v9\.1\.0 \([0-9a-f]{7}, 3 files, the primary key\)/);
  assert.match(r.text, /Publish it before the tag is pushed/);
  assert.match(r.text, /git -C ".+" add releases\/v9\.1\.0\.json/);
  assert.match(r.text, /git -C ".+" commit -m "Release manifest, v9\.1\.0"/);
});

test('ARC-11-C7 — sign-release refuses a tag before 2.1, a tag that is not here, and a tag already signed', async (t) => {
  const w = world(t);
  const g = await keygen(t, w);
  releaseRoot(w, 'v9.1.0');
  const dir = join(w.outside, 'licences');
  mkdirSync(dir);
  const sign = (tag) => run(w, ['sign-release', tag], { key: g.out, list: dir }, { keys: g.keys });
  const early = await sign('v2.0.13');
  assert.deepEqual([early.code, /v2\.0\.13 is before 2\.1\.0/.test(early.text)], [EXIT_USAGE, true], early.text);
  const absent = await sign('v9.2.0');
  assert.deepEqual([absent.code, /no commit named v9\.2\.0/.test(absent.text)], [EXIT_USAGE, true], absent.text);
  assert.equal((await sign('v9.1.0')).code, EXIT_OK);
  const twice = await sign('v9.1.0');
  assert.deepEqual([twice.code, /exists — a tag is signed once/.test(twice.text)], [EXIT_USAGE, true], twice.text);
  const bare = await run(w, ['sign-release'], { key: g.out, list: dir }, { keys: g.keys });
  assert.equal(bare.code, EXIT_USAGE);
});

test('ARC-11-C7 — sign-release with a key this product does not ship writes nothing', async (t) => {
  const w = world(t);
  const g = await keygen(t, w);
  releaseRoot(w, 'v9.1.0');
  const dir = join(w.outside, 'licences');
  mkdirSync(dir);
  const stranger = join(w.outside, 'stranger.pem');
  writeFileSync(stranger, keyPair().privateKey);
  const r = await run(w, ['sign-release', 'v9.1.0'], { key: stranger, list: dir }, { keys: g.keys });
  assert.equal(r.code, EXIT_FAIL, r.text);
  assert.match(r.text, /does not verify with the keys this product ships \(not signed by a key this product ships\) — nothing was written/);
  assert.equal(existsSync(join(dir, 'releases', 'v9.1.0.json')), false);
});

// The launcher's two spellings, from the one place that spells them — never typed here (the launcher audit, ARC-07-C35b).
const POSIX_CLI = spellings({ platform: 'darwin', env: {} }).cli;
const WINDOWS_CLI = spellings({ platform: 'win32', env: {} }).cli;

// ── ARC-09-C156 — a licence copied into .local/ under its own name ───────────────────────────────────────────────
//
// The Windows colleague's 2.1.0 install (2026-10-15): `issue` said to copy the file "to .local/licence.json", the file
// went into .local/ under its own name, and every surface read `Licence: missing — no licence is installed`. `issue`
// now prints the two commands that install it under the one name the product reads, and `check` names a licence that
// sits in .local/ under any other name, with the command that renames it — the file's name, never its contents.

test('ARC-09-C156 — issue prints the two ready commands that install the file as .local/licence.json, by its real name', async (t) => {
  const w = world(t);
  const g = await keygen(t, w);
  const issue = (over = {}) => run(w, ['issue'], { to: 'Test Licensee', org: 'Test Org', scope: 'live',
    'valid-until': '2027-10-10', key: g.out, ...over }, { keys: g.keys });
  const after = (r) => r.lines.slice(r.lines.findIndex((l) => l.includes('Send this file to the licensee')) + 1);
  const a = await issue();
  assert.equal(a.code, EXIT_OK, a.text);
  assert.deepEqual(after(a), [
    'step:   It must be named licence.json there: a copy under its own name is not read. From their checkout folder, with the file in Downloads:',
    'step:     macOS or Linux:      cp ~/Downloads/LIC-2026-0002.json .local/licence.json',
    'step:     Windows PowerShell:  Copy-Item "$HOME\\Downloads\\LIC-2026-0002.json" .local\\licence.json',
    'step:   Saved somewhere else, that folder replaces Downloads. Then they restart Claude Code, whose banner names the licence.',
  ]);
  // --out names the file, and the commands name what was written, not the default.
  const b = await issue({ out: join(w.outside, 'acme-licence.json') });
  assert.equal(b.code, EXIT_OK, b.text);
  assert.ok(after(b).includes('step:     macOS or Linux:      cp ~/Downloads/acme-licence.json .local/licence.json'), b.text);
});

test('ARC-09-C156 — check names a licence in .local/ under another name, with the rename command, and never its contents', async (t) => {
  const w = world(t);
  const g = await keygen(t, w);
  const issued = await run(w, ['issue'], { to: 'Test Licensee', org: 'Test Org', scope: 'live',
    'valid-until': '2027-10-10', key: g.out }, { keys: g.keys });
  assert.equal(issued.code, EXIT_OK, issued.text);
  const dir = join(w.root, '.local');
  // The colleague's exact state: the file in .local/ under the name it was sent with, and no licence.json.
  copyFileSync(join(w.outside, 'LIC-2026-0002.json'), join(dir, 'LIC-2026-0002.json'));
  // ...beside the JSON the product keeps there, which is not a licence and is never named.
  writeFileSync(join(dir, 'instances.json'), '{"instances":[]}\n');

  const posix = await run(w, ['check'], {}, { keys: g.keys, platform: 'darwin' });
  assert.equal(posix.code, EXIT_FAIL, posix.text);
  assert.match(posix.text, /Licence: missing/);
  assert.ok(posix.lines.includes('step:   found: LIC-2026-0002.json in .local/ is a licence under another name, and only '
    + `licence.json is read. Rename it, then run ${POSIX_CLI} licence check again:`), posix.text);
  assert.ok(posix.lines.includes(`step:     mv "${dir}/LIC-2026-0002.json" "${dir}/licence.json"`), posix.text);
  assert.doesNotMatch(posix.text, /instances\.json/);
  for (const content of ['Test Licensee', 'Test Org', 'LIC-2026-0002 ·', 'licensee']) {
    assert.equal(posix.text.includes(content), false, `check printed the licence's ${content}`);
  }

  const windows = await run(w, ['check'], {}, { keys: g.keys, platform: 'win32' });
  assert.ok(windows.lines.includes(`step:     Move-Item "${dir}\\LIC-2026-0002.json" "${dir}\\licence.json"`), windows.text);
  assert.ok(windows.text.includes(`then run ${WINDOWS_CLI} licence check again:`), windows.text);

  // Control: the command it printed, run — the licence reads ok, and nothing is "found" any more.
  renameSync(join(dir, 'LIC-2026-0002.json'), licencePath(w.root));
  const after = await run(w, ['check'], {}, { keys: g.keys, platform: 'darwin' });
  assert.equal(after.code, EXIT_OK, after.text);
  assert.match(after.text, /Licence: ok · LIC-2026-0002/);
  assert.doesNotMatch(after.text, /found:/);
});

test('ARC-09-C156 — a JSON in .local/ that does not verify as a licence is not named, and with no licence nothing is found', async (t) => {
  const w = world(t);
  const g = await keygen(t, w);
  const dir = join(w.root, '.local');
  writeFileSync(join(dir, 'doctor-last.json'), '{"checks":[]}\n');
  writeFileSync(join(dir, 'forged.json'), JSON.stringify({ format: 'snowarch-licence/1', licence: { id: 'LIC-2026-0099' },
    signature: 'AAAA' }));
  writeFileSync(join(dir, 'broken.json'), '{ not json');
  const r = await run(w, ['check'], {}, { keys: g.keys, platform: 'darwin' });
  assert.equal(r.code, EXIT_FAIL, r.text);
  assert.doesNotMatch(r.text, /found:/);
});
