// ARC-11-C1 — `./snowarch licence`: keygen, issue, show, verify, check, init-list and revoke.
//
// The owner's side (keygen, issue, init-list, revoke) works with PRIVATE keys, and the rule for those
// is absolute: they are written and read only OUTSIDE the checkout — `.local/` included, symlinks
// resolved — and they never appear in anything the command prints. The licensee's side (show, verify,
// check) reads `.local/licence.json` and the cached list, and fetches only when asked to.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { copyFileSync, existsSync, mkdirSync, readFileSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import { licenceCommand } from '../lib/commands/licence.mjs';
import { readList } from '../lib/licence/core.mjs';
import { readListCache } from '../lib/licence/state.mjs';
import { licencePath } from '../lib/local-paths.mjs';
import { EXIT_FAIL, EXIT_OK, EXIT_USAGE } from '../lib/exit.mjs';
import { keyPair, licence, licenceText, listRepo, productKeys } from './helpers/licence.mjs';
import { tempDir } from './helpers/temp.mjs';

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

test('ARC-11-C1 — show and check with no licence say missing, warn only, and exit 1', async (t) => {
  const w = world(t);
  for (const sub of ['show', 'check']) {
    const r = await run(w, [sub]);
    assert.equal(r.code, EXIT_FAIL, r.text);
    assert.match(r.text, /Licence: missing · warn only/);
  }
  const enforced = await run(w, ['check'], {}, { env: { SNOW_LICENCE_ENFORCE: 'true' } });
  assert.match(enforced.text, /Licence: missing · enforced/);
  assert.match(enforced.text, /enforce: on/);
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
  assert.match(after.text, /Licence: revoked · warn only/);
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
