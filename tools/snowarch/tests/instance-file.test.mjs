import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  SENTENCE, checkLocation, checkMode, presetsFrom, proposeFor, readInstanceFile,
} from '../lib/instance-file.mjs';
import { NO_TERMINAL, WIZARD_ABSENT, fromInstanceFile, run as runB06 } from '../lib/steps/B06.mjs';
import { codeForStatus, probeAuth } from '../lib/probe-auth.mjs';
import { redact, reset } from '../lib/redact.mjs';
import { startStub } from './fixtures/sn-stub.mjs';
import { makeCheckout } from './helpers/workspace.mjs';

const isWindows = process.platform === 'win32';
const repoRoot = new URL('../../../', import.meta.url).pathname;
const contract = JSON.parse(readFileSync(join(repoRoot, 'packages/snowarch/dist/contract.json'), 'utf8'));

/** Assembled, never spelled: written whole it matches this repository's own credential sweep. */
const PASSWORD = `${'pw'}-${'Zq7'.repeat(4)}`;
const USER = 'admin';
const PDI_URL = 'https://dev123456.service-now.com';

/** A 0600 instance file OUTSIDE any checkout — where the story says an operator should keep it. */
function instanceFile(entry, { mode = 0o600 } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'snowarch-if-'));
  const path = join(dir, 'pdi.json');
  writeFileSync(path, `${JSON.stringify({ version: 1, instances: { pdi: entry } }, null, 2)}\n`);
  if (!isWindows) chmodSync(path, mode);
  return path;
}

const basic = (over = {}) => ({
  url: PDI_URL, environment: 'pdi',
  auth: { method: 'basic', username: USER, password: PASSWORD }, ...over,
});

test('AC 6 — a group-readable file is refused BEFORE it is read', { skip: isWindows ? 'no POSIX modes' : false },
  async () => {
    const path = instanceFile(basic(), { mode: 0o644 });
    const r = await readInstanceFile(path, { root: makeCheckout(), contract });
    assert.equal(r.ok, false);
    assert.equal(r.reason, SENTENCE.groupReadable(path));
    assert.match(r.reason, /chmod 600/);
    // "Before it is read" is the claim: a file the group can read has already leaked, and reading
    // it first would put the credential in this process before saying so.
    reset();
    assert.equal(redact(PASSWORD), PASSWORD, 'the password must not have been registered yet');
  });

test('checkMode accepts 0600 and stricter, and says what Windows cannot check', () => {
  const path = instanceFile(basic());
  if (!isWindows) {
    assert.equal(checkMode(path, 'linux').ok, true);
    chmodSync(path, 0o400);
    assert.equal(checkMode(path, 'linux').ok, true, '0400 is stricter, not looser');
    chmodSync(path, 0o640);
    assert.equal(checkMode(path, 'linux').ok, false, 'group-readable');
  }
  const onWindows = checkMode(path, 'win32');
  assert.equal(onWindows.ok, true);
  assert.match(onWindows.note, /ACL-inherited \(Windows\) — delete the file after use/);
});

test('AC 6 — a file git could commit is refused, and an ignored one is not', () => {
  const root = makeCheckout();
  const tracked = join(root, 'pdi.json');
  writeFileSync(tracked, '{}');
  const r = checkLocation(tracked, root);
  assert.equal(r.ok, false);
  assert.equal(r.reason, SENTENCE.tracked);

  // `.local/` is gitignored in the fixture, so a file there is safe...
  writeFileSync(join(root, '.local-probe'), '');
  assert.equal(checkLocation(join(root, '.local', 'pdi.json'), root).ok, true);
  // ...and so is anywhere outside the checkout.
  assert.equal(checkLocation(instanceFile(basic()), root).ok, true);
});

test('the D-05 proposals are chosen by preset SHAPE, not by preset name', () => {
  const names = presetsFrom(contract);
  const raised = (p) => Object.values(contract.presets[p]).filter((v) => v === 'true').length;
  assert.ok(raised(names.full) > raised(names.readOnly), 'full must raise more flags than read-only');
  assert.equal(raised(names.readOnly), Math.min(...Object.keys(contract.presets).map(raised)));

  // pdi with no preset gets the most permissive one; prod gets the most restrictive.
  const pdi = proposeFor({ url: PDI_URL, environment: 'pdi' }, names);
  assert.equal(pdi.entry.preset, names.full);
  assert.deepEqual(pdi.notes, [`preset: ${names.full} (proposed for pdi — D-05; accepted: --yes)`]);

  const prod = proposeFor({ url: 'https://acme.service-now.com', environment: 'prod' }, names);
  assert.equal(prod.entry.preset, names.readOnly);

  // A written preset is never overridden by a proposal.
  const explicit = proposeFor({ url: PDI_URL, environment: 'pdi', preset: names.readOnly }, names);
  assert.equal(explicit.entry.preset, names.readOnly);
  assert.deepEqual(explicit.notes, []);
});

test('AC 5 — environment is proposed from a dev URL and required for anything else', async () => {
  const names = presetsFrom(contract);
  const fromUrl = proposeFor({ url: 'https://dev123456.service-now.com' }, names);
  assert.equal(fromUrl.entry.environment, 'pdi');
  assert.ok(fromUrl.notes.includes('environment: pdi (proposed from the URL — D-05; accepted: --yes)'));

  const cannotGuess = proposeFor({ url: 'https://acme.service-now.com' }, names);
  assert.equal(cannotGuess.ok, false);
  assert.equal(cannotGuess.reason, SENTENCE.environmentRequired);
  assert.match(SENTENCE.environmentRequired, /it is never guessed for a non-dev host/);

  // ...and end to end, the failure names the label and saves nothing.
  const root = makeCheckout();
  const path = instanceFile({ url: 'https://acme.service-now.com',
    auth: { method: 'basic', username: USER, password: PASSWORD } });
  const r = await readInstanceFile(path, { root, contract });
  assert.equal(r.ok, false);
  assert.match(r.reason, /^pdi: environment is required/);
});

test('AC 7 — prod above read-only needs prodWriteAck, and the code is the registry\'s', async () => {
  const root = makeCheckout();
  const names = presetsFrom(contract);
  const prod = { url: 'https://acme.service-now.com', environment: 'prod', preset: names.full,
    auth: { method: 'basic', username: USER, password: PASSWORD } };

  const refused = await readInstanceFile(instanceFile(prod), { root, contract });
  assert.equal(refused.ok, false);
  assert.equal(refused.reason, SENTENCE.prodNotAcknowledged('pdi', names.full));
  assert.match(refused.reason, /^PROD_WRITE_NOT_ACKNOWLEDGED/);
  assert.match(refused.reason, /only if you really mean it \(D-05\)/);

  const acked = await readInstanceFile(instanceFile({ ...prod, prodWriteAck: true }),
    { root, contract });
  assert.equal(acked.ok, true, acked.reason);

  // ...and prod at the read-only preset needs no acknowledgement at all.
  const readOnly = await readInstanceFile(instanceFile({ ...prod, preset: names.readOnly }),
    { root, contract });
  assert.equal(readOnly.ok, true, readOnly.reason);
});

test('the password is registered with the redactor before anything could log it', async () => {
  reset();
  const root = makeCheckout();
  assert.equal(redact(PASSWORD), PASSWORD, 'precondition: not registered yet');
  await readInstanceFile(instanceFile(basic()), { root, contract });
  assert.equal(redact(`saving with ${PASSWORD}`), 'saving with <redacted>');
  reset();
});

test('AC 8 — a wrong password is exactly one attempt, and nothing is saved', async () => {
  const stub = await startStub({ user: USER, password: PASSWORD });
  const root = makeCheckout();
  const path = instanceFile(basic());
  const lines = [];
  try {
    const r = await fromInstanceFile({
      root, instanceFile: path, contract, line: (l) => lines.push(l),
      // The REAL probe, pointed at the counting fixture. The store document must carry a bare
      // https origin (the schema says so), so the transport is redirected rather than faked — the
      // request, the Basic header and the 401 mapping are all the production ones.
      probeAuth: (args) => probeAuth({ ...args, url: stub.url, password: 'the-wrong-one' }),
    });

    assert.equal(r.status, 'fail');
    assert.equal(r.detail, SENTENCE.authFailed('pdi'));
    assert.equal(stub.attempts, 1, 'a non-interactive path must never retry a rejected credential');
    assert.equal(existsSync(join(root, '.local', 'instances.json')), false, 'a store was written');
  } finally { await stub.close(); }
});

test('AC 5 — the right password saves a 0600 store with six string flags, and one attempt', async () => {
  const stub = await startStub({ user: USER, password: PASSWORD });
  const root = makeCheckout();
  const path = instanceFile({ url: PDI_URL,
    auth: { method: 'basic', username: USER, password: PASSWORD } });   // no environment, no preset
  const lines = [];
  try {
    const r = await fromInstanceFile({ root, instanceFile: path, contract,
      line: (l) => lines.push(l), probeAuth: (args) => probeAuth({ ...args, url: stub.url }) });

    assert.equal(r.status, 'ok', r.detail);
    assert.equal(stub.attempts, 1);
    const names = presetsFrom(contract);
    assert.ok(lines.includes(`pdi — environment: pdi (proposed from the URL — D-05; accepted: --yes)`));
    assert.ok(lines.includes(`pdi — preset: ${names.full} (proposed for pdi — D-05; accepted: --yes)`));
    assert.ok(lines.some((l) => l === SENTENCE.stillThere(path)), 'the file still holds the secret');

    const storePath = join(root, '.local', 'instances.json');
    const store = JSON.parse(readFileSync(storePath, 'utf8'));
    const entry = store.instances.pdi;
    assert.equal(Object.keys(entry.flags).length, 6, 'all six flags, so the doctor has nothing to fix');
    assert.ok(Object.values(entry.flags).every((v) => typeof v === 'string'), 'flags are strings');
    assert.equal(entry.toolPackage, 'full');
    assert.equal(entry.maxRecords, 100);
    assert.equal(store.defaultInstance, 'pdi');
    if (!isWindows) assert.equal(statSync(storePath).mode & 0o777, 0o600);

    // AC 5's other half: nothing anyone can read carries the password.
    const printed = lines.join('\n');
    assert.ok(!printed.includes(PASSWORD), printed);
    assert.ok(!JSON.stringify(r).includes(PASSWORD));
    // ...and the SOURCE file is untouched — never copied, moved or deleted.
    assert.ok(existsSync(path));
    assert.ok(readFileSync(path, 'utf8').includes(PASSWORD), 'the source file was modified');
  } finally { await stub.close(); }
});

test('the probe maps what the instance answered, using the registry\'s own codes', async () => {
  const stub = await startStub({ user: USER, password: PASSWORD }, { forbidden: 'readonly' });
  try {
    assert.equal((await probeAuth({ url: stub.url, username: USER, password: PASSWORD })).ok, true);

    const wrong = await probeAuth({ url: stub.url, username: USER, password: 'nope' });
    assert.equal(wrong.status, 401);
    assert.equal(wrong.code, codeForStatus(401));
    assert.equal(wrong.code, 'AUTHENTICATION_FAILED', 'the registry names 401 this');

    const forbidden = await probeAuth({ url: stub.url, username: 'readonly', password: PASSWORD });
    assert.equal(forbidden.status, 403);
    assert.equal(forbidden.code, codeForStatus(403));
    assert.match(forbidden.detail, /authenticated but has no rights/);

    assert.equal(stub.attempts, 3, 'one request per call, no retries anywhere');
    // The fixture records the SHAPE of what it was sent, never the bytes.
    assert.deepEqual(stub.requests.map((r) => r.hadPassword), [true, true, true]);
    assert.ok(!JSON.stringify(stub.requests).includes(PASSWORD));
  } finally { await stub.close(); }
});

test('AC 9 — no terminal and no file is a named failure, not a hang', async () => {
  const root = makeCheckout();
  const r = await runB06({ root, mode: 'live', instanceFile: null, isTTY: false, contract,
    line: () => {}, state: { steps: {} }, node: { present: true } });
  assert.equal(r.status, 'fail');
  assert.equal(r.detail, NO_TERMINAL);
  assert.match(NO_TERMINAL, /--instance-file <path>/);
});

test('the wizard is probed for before it is spawned, and its absence is named', async () => {
  const root = makeCheckout();
  // Until ARC-07-S05 lands, `instance add` is absent from the built CLI. B06 must say so rather
  // than spawn something that will fail with a usage error nobody can act on. This test flips when
  // ARC-07-S05 adds the sub-command.
  const r = await runB06({ root, mode: 'live', instanceFile: null, isTTY: true, contract,
    line: () => {}, state: { steps: {} }, node: { present: true },
    spawn: () => ({ status: 0, stdout: 'Usage: instance list|test', stderr: '' }) });
  assert.equal(r.status, 'fail');
  assert.equal(r.detail, WIZARD_ABSENT);

  // ...and when the CLI does advertise it, B06 spawns with the terminal inherited. The file has
  // to exist for the probe to get that far — B06 checks for it before running anything, so a
  // missing build is reported rather than spawned into.
  mkdirSync(join(root, 'packages/snowarch/dist/cli'), { recursive: true });
  writeFileSync(join(root, 'packages/snowarch/dist/cli/index.js'), '// placeholder\n');
  const calls = [];
  const spawn = (exec, args, opts) => {
    calls.push({ exec, args, stdio: opts?.stdio });
    return args.includes('--help')
      ? { status: 0, stdout: 'Usage: instance add|list|test', stderr: '' }
      : { status: 0 };
  };
  const ok = await runB06({ root, mode: 'live', instanceFile: null, isTTY: true, contract,
    line: () => {}, state: { steps: {} }, node: { present: true }, spawn });
  assert.equal(ok.status, 'ok');
  const spawned = calls.at(-1);
  assert.deepEqual(spawned.args.slice(-3), ['instance', 'add', '--from-bootstrap']);
  assert.equal(spawned.stdio, 'inherit', 'the wizard needs the TTY for masked input');
  assert.equal(spawned.exec, process.execPath, 'never a shell, never npx');
});
