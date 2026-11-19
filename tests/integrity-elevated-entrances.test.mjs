// Copyright 2026 Cvetomir Grigorov. Licensed under the Business Source License 1.1 (see LICENSE).
// snowarch — AI ServiceNow Architect. Not affiliated with or endorsed by ServiceNow, Inc.
/**
 * ARC-09-C303 — the entrances of the integrity check, run as root. One rule inside `ensureIntegrity` (tools/snowarch/tests/integrity-elevated.test.mjs)
 * and four doors that call it; this file runs each door through the same three states and holds each to the same two facts: the answer the
 * door gives, and that the checkout, `.local/`, `.git/` and the home folder are byte for byte what they were.
 *
 *   verified    a user's own start recorded the verdict, and nothing has moved since: a root process passes, and writes nothing;
 *   unrecorded  a fresh install, no verdict yet: a root process cannot record one, so it says the tree is not verified;
 *   changed     a covered file differs from the signed one: a root process does not put it back, and says so.
 *
 * The doors: the SessionStart hook (the banner), the MCP server's licence session (the refusal every tool call gets), the package CLI
 * (`dist/cli/index.js`, the second door) and `./snowarch` (the first). The children believe they are root through one preload
 * (tools/snowarch/tests/helpers/fake-root.mjs) and their file operations run as the real user, so a door that does write costs a red case and
 * never a root-owned file. The MCP server itself does not start as root; its case is last.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { appendFileSync } from 'node:fs';
import { join } from 'node:path';

import * as session from '../packages/snowarch/dist/licence/session.js';
import { CANNOT_RESTORE_PREFIX } from '../packages/snowarch/dist/licence/integrity.js';
import { TABLE } from '../tools/snowarch/lib/remedies.mjs';
import { licenceFixture, licensedEnv } from '../tools/snowarch/tests/helpers/licence-hook/index.mjs';
import { tempDir } from '../tools/snowarch/tests/helpers/temp.mjs';
import { REAL_ROOT, asRoot, changes, cliCheckout, described, pretendRoot, signedRelease, snapshot } from './helpers/elevated.mjs';

const SENTINEL = 'tools/snowarch/e32-sentinel.txt';
const STDIN = '{"hook_event_name":"SessionStart","source":"startup"}';
const SERVER = join(REAL_ROOT, 'packages/snowarch/dist/server.js');
const PACKAGE_CLI = join(REAL_ROOT, 'packages/snowarch/dist/cli/index.js');
const NOW = () => new Date('2026-10-14T12:05:01.000Z');

/** The sentence as a line prints it: remedies.json holds a fragment. */
const SENTENCE = () => {
  const said = TABLE.elevated?.default;
  assert.ok(said, 'remedies.json has no sentence for "elevated"');
  return `${said[0].toUpperCase()}${said.slice(1)}.`;
};

/** The environment of a child: its checkout and its home folder are the case's own, and it trusts the fixture key. */
function childEnv(t, root, extra = {}) {
  const home = tempDir('snowarch-c303-home-', t);
  const env = { ...process.env, HOME: home, USERPROFILE: home, CLAUDE_PROJECT_DIR: root,
    SNOW_AUDIT_FILE: join(root, '.local', 'audit-under-test.jsonl'), ...extra };
  for (const k of ['SNOWARCH_STATE_ROOT', 'SNOW_STORE', 'XDG_CONFIG_HOME', 'XDG_DATA_HOME', 'XDG_STATE_HOME']) delete env[k];
  return { env: licensedEnv(env, { root }), home };
}

const run = (file, args, root, env, input = '') => spawnSync(process.execPath, [file, ...args], { cwd: root, input, encoding: 'utf8', env, timeout: 120000 });

/** What the case has to hold: nothing in the checkout and nothing in the home folder was written. */
function held(before, after, what) {
  assert.deepEqual(described(changes(before.root, snapshot(after.root))), [], `${what}: the checkout was written`);
  assert.deepEqual(described(changes(before.home, snapshot(after.home))), [], `${what}: the home folder was written`);
}

const edit = (root, rel = SENTINEL) => appendFileSync(join(root, rel), 'edited\n');

// ── 1. the SessionStart hook: the banner ──────────────────────────────────────────────────────────────────────────────

const HOOK = (root) => join(root, 'tools/snowarch/hooks/session-start.mjs');
const banner = (r) => r.stdout.trim().split('\n');
const integrityLine = (lines) => lines.find((l) => l.startsWith('Integrity:'));

test('C303, the hook — as root, a verified tree starts with no Integrity line, and nothing is written', (t) => {
  const { root } = signedRelease(t, { files: { [SENTINEL]: 'read by an integrity check alone\n' } });
  const { env, home } = childEnv(t, root);
  const first = run(HOOK(root), [], root, env, STDIN);
  assert.equal(first.status, 0, first.stderr);
  const before = { root: snapshot(root), home: snapshot(home) };
  const r = run(HOOK(root), [], root, asRoot(env), STDIN);
  assert.equal(r.status, 0, r.stderr);
  assert.equal(integrityLine(banner(r)), undefined, r.stdout);
  held(before, { root, home }, 'the hook, verified');
});

test('C303, the hook — as root, a fresh install says the tree is not verified, on the third line, and writes nothing', (t) => {
  const { root } = signedRelease(t, { files: { [SENTINEL]: 'read by an integrity check alone\n' } });
  const { env, home } = childEnv(t, root);
  const before = { root: snapshot(root), home: snapshot(home) };
  const r = run(HOOK(root), [], root, asRoot(env), STDIN);
  assert.equal(r.status, 0, 'the hook never fails a session');
  assert.equal(r.stderr, '', 'and prints nothing on stderr');
  const line = integrityLine(banner(r));
  assert.ok(line?.startsWith(CANNOT_RESTORE_PREFIX), r.stdout);
  assert.match(line, /running as root/);
  assert.ok(line.endsWith(SENTENCE()), line);
  held(before, { root, home }, 'the hook, unrecorded');
});

test('C303, the hook — as root, a changed covered file is not put back, the banner says so, and nothing is written', (t) => {
  const { root } = signedRelease(t, { files: { [SENTINEL]: 'read by an integrity check alone\n' } });
  const { env, home } = childEnv(t, root);
  assert.equal(run(HOOK(root), [], root, env, STDIN).status, 0);
  edit(root);
  const before = { root: snapshot(root), home: snapshot(home) };
  const r = run(HOOK(root), [], root, asRoot(env), STDIN);
  assert.equal(r.status, 0);
  const line = integrityLine(banner(r));
  assert.ok(line?.startsWith(CANNOT_RESTORE_PREFIX), r.stdout);
  assert.match(line, /1 file differs from the signed manifest/);
  held(before, { root, home }, 'the hook, changed');
});

// ── 2. the MCP server's licence session ───────────────────────────────────────────────────────────────────────────────

test('C303, the server session — as root, a verified tree passes, an unrecorded one and a changed one refuse every tool, and nothing is written', (t) => {
  const { keys } = licenceFixture();
  const start = (root) => { session.resetIntegrityForTests(); return session.initIntegrity({ root, keys, now: NOW }); };
  t.after(() => session.resetIntegrityForTests());

  const verified = signedRelease(t, { files: { [SENTINEL]: 'read by an integrity check alone\n' } }).root;
  assert.equal(start(verified).state, 'verified', 'the user\'s own start records the verdict');
  pretendRoot(t);
  let before = snapshot(verified);
  assert.equal(start(verified).state, 'verified');
  assert.doesNotThrow(() => session.assertIntegrity());
  assert.deepEqual(described(changes(before, snapshot(verified))), [], 'a root start of a verified tree wrote');

  const fresh = signedRelease(t).root;
  before = snapshot(fresh);
  assert.equal(start(fresh).state, 'refused');
  assert.throws(() => session.assertIntegrity(), (e) => e.code === 'INTEGRITY_NOT_VERIFIED' && e.message.endsWith(SENTENCE()), 'every tool call is refused');
  assert.deepEqual(described(changes(before, snapshot(fresh))), [], 'a root start of an unrecorded tree wrote');

  pretendRoot(t, 1000);
  const changed = signedRelease(t, { files: { [SENTINEL]: 'read by an integrity check alone\n' } }).root;
  assert.equal(start(changed).state, 'verified');
  edit(changed);
  pretendRoot(t);
  before = snapshot(changed);
  assert.equal(start(changed).state, 'refused');
  assert.throws(() => session.assertIntegrity(), (e) => e.code === 'INTEGRITY_NOT_VERIFIED' && /1 file differs/.test(e.message));
  assert.deepEqual(described(changes(before, snapshot(changed))), [], 'a root start of a changed tree wrote');
});

// ── 3. the package CLI, the second door ───────────────────────────────────────────────────────────────────────────────

const REFUSED = /\(Code: INTEGRITY_NOT_VERIFIED\)/;

test('C303, the package CLI — as root, a verified tree runs a read, and an unrecorded or a changed one is refused with the root sentence', (t) => {
  const { root } = signedRelease(t, { files: { [SENTINEL]: 'read by an integrity check alone\n' } });
  const { env, home } = childEnv(t, root);
  const list = (e) => run(PACKAGE_CLI, ['instance', 'list'], root, e);
  const snap = () => ({ root: snapshot(root), home: snapshot(home) });

  let before = snap();
  const fresh = list(asRoot(env));
  assert.equal(fresh.status, 3, 'an unrecorded tree is refused as a refused licence is');
  assert.match(fresh.stderr, REFUSED);
  assert.ok(fresh.stderr.includes(SENTENCE()), fresh.stderr);
  held(before, { root, home }, 'the package CLI, unrecorded');

  assert.equal(list(env).status, 0, 'the user\'s own run records the verdict');
  before = snap();
  const verified = list(asRoot(env));
  assert.equal(verified.status, 0, verified.stderr);
  held(before, { root, home }, 'the package CLI, verified');

  edit(root);
  before = snap();
  const changed = list(asRoot(env));
  assert.equal(changed.status, 3);
  assert.match(changed.stderr, REFUSED);
  assert.match(changed.stderr, /1 file differs from the signed manifest/);
  held(before, { root, home }, 'the package CLI, changed');
});

// ── 4. ./snowarch, the first door ─────────────────────────────────────────────────────────────────────────────────────

test('C303, ./snowarch — as root, a read that is allowed runs on a verified tree and is refused on an unrecorded or a changed one, and nothing is written', (t) => {
  const { root } = cliCheckout(t, { release: true, files: { [SENTINEL]: 'read by an integrity check alone\n' } });
  const { env, home } = childEnv(t, root);
  const docs = (e) => run(join(root, 'tools/snowarch/bin/snowarch.mjs'), ['docs', 'status'], root, e);
  const snap = () => ({ root: snapshot(root), home: snapshot(home) });

  let before = snap();
  const fresh = docs(asRoot(env));
  assert.equal(fresh.status, 3, `${fresh.stdout}${fresh.stderr}`);
  assert.match(fresh.stderr, /does not run while the AI Architect's own files cannot be restored/);
  assert.ok(fresh.stderr.includes(SENTENCE()), fresh.stderr);
  held(before, { root, home }, './snowarch, unrecorded');

  docs(env);
  before = snap();
  const verified = docs(asRoot(env));
  assert.doesNotMatch(verified.stderr, /cannot be restored/, verified.stderr);
  held(before, { root, home }, './snowarch, verified');

  edit(root);
  before = snap();
  const changed = docs(asRoot(env));
  assert.equal(changed.status, 3);
  assert.match(changed.stderr, /1 file differs from the signed manifest/);
  held(before, { root, home }, './snowarch, changed');
});

// ── 5. the MCP server does not start as root ──────────────────────────────────────────────────────────────────────────

test('C303, the server — a root process does not start it: the sentence on stderr, a non-zero exit, and nothing written anywhere', (t) => {
  const { root } = signedRelease(t, { files: { [SENTINEL]: 'read by an integrity check alone\n' } });
  const { env, home } = childEnv(t, root);
  const before = { root: snapshot(root), home: snapshot(home) };
  const r = run(SERVER, [], root, asRoot(env));
  assert.notEqual(r.status, 0, 'a server a root process started is a server that wrote as root');
  assert.ok(r.stderr.includes(SENTENCE().replace(/\.$/, '')), r.stderr);
  assert.equal(r.stdout, '', 'stdout is the protocol, and nothing was said on it');
  held(before, { root, home }, 'the server');
});

test('C303, the server — started by a user, with its stdin closed, it starts and exits cleanly: the harness tells the two apart', (t) => {
  const { root } = signedRelease(t);
  const { env } = childEnv(t, root);
  const r = run(SERVER, [], root, env);
  assert.equal(r.status, 0, r.stderr);
});

