// Copyright 2026 Cvetomir Grigorov. Licensed under the Business Source License 1.1 (see LICENSE).
// snowarch — AI ServiceNow Architect. Not affiliated with or endorsed by ServiceNow, Inc.
/**
 * ARC-09-C272 — F9, the doctor's explicit repair for a store that other accounts can read.
 *
 * SV-02 reads the store's permissions on Windows and fails when anyone besides the account, SYSTEM and Administrators holds an
 * allow entry. Its remedy for the checkout's own store is `doctor --fix`, which — like every repair — shows its plan first and
 * changes nothing until it is confirmed. F9 is that repair: it locks the checkout's `.local/` to the account and SYSTEM, by SID,
 * and nothing else. The lock tools are a seam here; no case runs icacls.
 *
 * The rails the other repairs have apply to it unchanged: it is in the closed whitelist, it names what it touches, a path that is
 * not under `.local/` is refused, and on a platform that is not Windows it does nothing and says so.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';

import { applyPlan, buildPlan, FIXERS, KINDS, TARGETS } from '../../tools/snowarch/lib/doctor/fix.mjs';
import { greenTree } from './helpers/tree.mjs';

const action = (fix = { path: '.local' }) => ({ id: 'F9', check: 'SV-02', kind: 'store-acl', title: 't', target: '.local/', detail: 'd', fix });
const recording = (result = { ok: true }) => {
  const locks = [];
  return { locks, locker: { platform: 'win32', lock: (path, opts) => { locks.push([path, opts]); return result; } } };
};

test('ARC-09-C272 — F9 is in the whitelist, with a target, and ahead of the repairs that read the store', () => {
  assert.ok(KINDS.includes('store-acl'));
  assert.equal(TARGETS['store-acl'], '.local/');
  const f9 = FIXERS.filter((f) => f.kind === 'store-acl');
  assert.deepEqual(f9.map((f) => f.id), ['F9']);
  assert.ok(FIXERS.findIndex((f) => f.kind === 'store-acl') < FIXERS.findIndex((f) => f.kind === 'cache-stale'), 'the cache is last, as it was');
});

test('ARC-09-C272 — F9 locks the checkout\'s .local as a folder, once, and says so', async (t) => {
  const root = greenTree(t, { mode: 'design' });
  const { locks, locker } = recording();
  const done = await applyPlan({ actions: [action()] }, { root, platform: 'win32' }, { locker });
  assert.equal(done[0].result, 'applied');
  assert.deepEqual(locks, [[join(root, '.local'), { dir: true }]]);
  assert.match(done[0].detail, /readable only by you and SYSTEM/);
});

test('ARC-09-C272 — F9 reports a lock that failed as failed, with the reason, and never as applied', async (t) => {
  const root = greenTree(t, { mode: 'design' });
  const { locker } = recording({ ok: false, reason: 'icacls exited 5: Access is denied.' });
  const done = await applyPlan({ actions: [action()] }, { root, platform: 'win32' }, { locker });
  assert.equal(done[0].result, 'failed');
  assert.match(done[0].detail, /icacls exited 5: Access is denied\./);
});

test('ARC-09-C272 — F9 does nothing on a platform that is not Windows, and says why', async (t) => {
  const root = greenTree(t, { mode: 'design' });
  const { locks, locker } = recording();
  const done = await applyPlan({ actions: [action()] }, { root, platform: 'linux' }, { locker });
  assert.equal(done[0].result, 'noop');
  assert.deepEqual(locks, []);
});

test('ARC-09-C272 — F9 locks what the check named under .local/ and refuses anything else', async (t) => {
  const root = greenTree(t, { mode: 'design' });
  const { locks, locker } = recording();
  for (const path of ['../elsewhere', 'node_modules', '/abs/path', 'C:\\Users', '.claude']) {
    const done = await applyPlan({ actions: [action({ path })] }, { root, platform: 'win32' }, { locker });
    assert.ok(['refused', 'failed'].includes(done[0].result), `${path}: ${done[0].result}`);
  }
  assert.deepEqual(locks, [], 'a path outside .local/ reached the lock');
  const done = await applyPlan({ actions: [action({ path: '.local/logs' })] }, { root, platform: 'win32' }, { locker });
  assert.equal(done[0].result, 'applied');
  assert.deepEqual(locks, [[join(root, '.local', 'logs'), { dir: true }]]);
});

test('ARC-09-C272 — a failing SV-02 that names store-acl is proposed by the plan; one that does not is refused with its command', () => {
  const failing = (fix, fixable) => ({ checks: [{ id: 'SV-02', status: 'fail', fixable, command: 'icacls …', data: fix ? { fix } : {} }] });
  const planned = buildPlan(failing({ kind: 'store-acl', path: '.local' }, true));
  assert.deepEqual(planned.actions.map((a) => [a.id, a.kind, a.target]), [['F9', 'store-acl', '.local/']]);
  const refused = buildPlan(failing(null, false));
  assert.deepEqual(refused.actions, []);
});
