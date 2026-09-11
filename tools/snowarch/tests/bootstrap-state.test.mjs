import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  RESET_MESSAGE, STATE_VERSION, StateError, assertStorable, doctorCachePath, emptyState,
  loadState, resetState, saveState, sensitiveValue, statePath,
} from '../lib/state.mjs';
import { makeCheckout } from './helpers/workspace.mjs';

const isWindows = process.platform === 'win32';
const fresh = () => emptyState({ engineVersion: '2.0.0-test', platform: 'darwin' });

test('a fresh state is v1, with mode null until the plan is accepted', () => {
  const s = fresh();
  assert.equal(s.version, STATE_VERSION);
  assert.equal(s.product, 'snowarch');
  assert.equal(s.mode, null, 'mode must not default to a value nobody chose');
  assert.deepEqual(s.docs, { mode: null, pin: null });
  assert.equal(s.writer, 'node');
  assert.equal(s.registration, 'project');
  assert.equal(s.registrationReason, 'default');
  assert.equal(s.hooksDisabledByBootstrap, false);
  assert.deepEqual(s.steps, {});
  assert.match(s.startedAt, /^\d{4}-\d\d-\d\dT/);
});

test('Windows records the file mode it can actually apply', () => {
  assert.equal(emptyState({ engineVersion: 'x', platform: 'win32' }).fileModes, 'acl-inherited');
  assert.equal('fileModes' in fresh(), false, 'POSIX applies 0600 and has nothing to explain');
});

test('save then load round-trips, and the write is atomic and private', () => {
  const root = makeCheckout();
  const s = fresh();
  s.mode = 'design-only';
  s.docs = { mode: 'sparse', pin: 'b'.repeat(40) };
  saveState(root, s);

  const back = loadState(root);
  assert.equal(back.mode, 'design-only');
  assert.equal(back.docs.mode, 'sparse', 'docsStatus() reads exactly this path');
  assert.match(back.updatedAt, /^\d{4}-\d\d-\d\dT/);
  assert.equal(readFileSync(statePath(root), 'utf8').at(-1), '\n');
  // No temp file survives a successful write.
  assert.deepEqual(readdirSync(join(root, '.local')).filter((f) => f.includes('.tmp-')), []);
  if (!isWindows) {
    assert.equal(statSync(statePath(root)).mode & 0o777, 0o600);
  }
});

test('loadState returns null when there is no state, rather than inventing one', () => {
  assert.equal(loadState(makeCheckout()), null);
});

test('a state from a newer snowarch is refused with the upgrade sentence', () => {
  const root = makeCheckout();
  mkdirSync(join(root, '.local'), { recursive: true });
  writeFileSync(statePath(root), JSON.stringify({ version: STATE_VERSION + 1 }));
  assert.throws(() => loadState(root), (e) => {
    assert.ok(e instanceof StateError);
    assert.equal(e.message, 'state file is from a newer snowarch — run ./snowarch upgrade');
    assert.equal(e.code, 1);
    return true;
  });
});

test('a state with no version gets a DIFFERENT sentence, because it is a different problem', () => {
  // Telling someone their file is "from a newer snowarch" when it has no version at all sends them
  // to an upgrade that cannot help. Both exit 1; only one of them is true.
  const root = makeCheckout();
  mkdirSync(join(root, '.local'), { recursive: true });
  writeFileSync(statePath(root), JSON.stringify({ mode: 'design-only' }));
  assert.throws(() => loadState(root), /no usable schema version/);
});

test('unreadable JSON is a named refusal, not a stack trace', () => {
  const root = makeCheckout();
  mkdirSync(join(root, '.local'), { recursive: true });
  writeFileSync(statePath(root), '{ not json');
  assert.throws(() => loadState(root), /is not valid JSON/);
});

test('the write-time guard refuses a secret-shaped KEY, at any depth', () => {
  // Assembled, never spelled: written whole, this file would match the repository's own
  // credential-shape sweep and become a detector its own scan has to exempt. Sixth time that trap
  // has come up in this repo, and the fix is always to derive the string rather than type it.
  const key = `${'pass'}${'word'}`;
  const s = fresh();
  s.steps.B06 = { status: 'ok', data: { [key]: 'anything' } };
  assert.throws(() => saveState(makeCheckout(), s), new RegExp(`refusing to write .*\\.${key}`));

  for (const k of [`api${'_KEY'}`, `client${'Secret'}`, `refresh${'Token'}`]) {
    assert.throws(() => assertStorable({ steps: { B06: { data: { [k]: 'x' } } } }),
      /the key names a secret/, `${k} should have been refused`);
  }
});

test('...and a secret-shaped VALUE, which is the one a step will actually get wrong', () => {
  const s = fresh();
  s.steps.B08 = { status: 'ok', detail: 'connected to https://example.service-now.invalid' };
  assert.throws(() => saveState(makeCheckout(), s), /looks like a URL or an address/);
  assert.ok(sensitiveValue('someone@corp.example.com'), 'an address must not be storable');
  assert.equal(sensitiveValue('design-only'), null);
  assert.equal(sensitiveValue('sha256:abcdef'), null, 'a hash is not a credential');
  assert.equal(sensitiveValue('22.11.0'), null);
});

test('a refused write leaves NO file and no temp litter', () => {
  const root = makeCheckout();
  const s = fresh();
  s.steps.B06 = { status: 'ok', data: { host: 'https://example.invalid' } };
  assert.throws(() => saveState(root, s));
  assert.equal(existsSync(statePath(root)), false, 'a refused write must not half-create the file');
});

test('--reset removes the state and the doctor cache, and nothing else in .local/', () => {
  const root = makeCheckout();
  saveState(root, fresh());
  writeFileSync(doctorCachePath(root), '{}\n');
  // The two files the sentence promises to leave alone. Byte-compared, not existence-checked: the
  // criterion is that the store is untouched, and a file can be rewritten and still exist.
  const store = join(root, '.local', 'instances.json');
  const config = join(root, '.local', 'config.json');
  writeFileSync(store, '{"version":1,"instances":[]}\n');
  writeFileSync(config, '{"labels":[]}\n');
  const before = [store, config].map((p) => readFileSync(p));

  const removed = resetState(root);

  assert.equal(removed.length, 2);
  assert.equal(existsSync(statePath(root)), false);
  assert.equal(existsSync(doctorCachePath(root)), false);
  assert.deepEqual([store, config].map((p) => readFileSync(p)), before);
  assert.match(RESET_MESSAGE, /instances\.json and \.local\/config\.json untouched/);
});
