// Copyright 2026 Cvetomir Grigorov. Licensed under the Apache License, Version 2.0 (see LICENSE).
// snowarch — AI ServiceNow Architect. Not affiliated with or endorsed by ServiceNow, Inc.
// ARC-11-C10 — the doctor FAILs when the SessionStart hook is gone.
//
// From 2.0.13 the hook prints the `Licence:` line CLAUDE.md's licence rule reads, so a session without it has no
// line and the rule does not fire. The hook lives in `.claude/settings.local.json`, which E-10 owns: with `node`
// on PATH — how the hook runs it, and how bootstrap.sh decides it (`command -v node`) — an absent hook, a wrong
// one, and a `disableAllHooks` the user set all FAIL; a machine without Node keeps its hook-free state (ARC-06-S05).
// `doctor --fix` re-registers through B07's own writer, and a bootstrap re-run repairs it too.
//
// The bounds, written in the row: a session started with `--setting-sources project` loads no local settings, and
// nothing on disk records that; a user who edits CLAUDE.md is the manual-clone bound; the server gives no notice.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { engineRepoChecks } from '../../tools/snowarch/lib/doctor/checks/engine-repo.mjs';
import { doctorCommand } from '../../tools/snowarch/lib/doctor/index.mjs';
import { applyToggles, INVALID_JSON } from '../../tools/snowarch/lib/settings-local.mjs';
import { run as runB07 } from '../../tools/snowarch/lib/steps/B07.mjs';
import { contextFor, copyTree, greenTree, readJson, runById, writeJson } from './helpers/tree.mjs';
import { tempDir } from '../../tools/snowarch/tests/helpers/temp.mjs';

const checks = engineRepoChecks();
const run = (id, root, over = {}) => runById(checks, id, contextFor(root, over));
const LOCAL = '.claude/settings.local.json';

/** An environment whose PATH holds no `node`: the machine the bootstrap left hook-free. */
function nodeless(t) {
  const env = { ...process.env };
  for (const k of Object.keys(env)) if (k.toLowerCase() === 'path') delete env[k];
  env.PATH = tempDir('snowarch-no-node-', t);
  return env;
}
/** A green tree whose local settings lost the SessionStart entry. */
function withoutHook(t) {
  const root = copyTree(t, greenTree(t));
  const local = readJson(root, LOCAL);
  const { SessionStart: _gone, ...hooks } = local.hooks ?? {};
  writeJson(root, LOCAL, { ...local, hooks });
  return root;
}
/** The full doctor, as a user runs it, against a fixture. */
async function doctorAt(root, flags = {}) {
  const chunks = [];
  const code = await doctorCommand({ flags: { 'no-network': true, ...flags },
    out: { write: (s) => chunks.push(s) }, err: { write: (s) => chunks.push(s) }, cwd: root, input: { isTTY: false } });
  return { code, text: chunks.join('') };
}

test('ARC-11-C10 — an absent hook FAILs E-10 when node is on PATH, with the hook-absent fix', async (t) => {
  const root = withoutHook(t);
  const r = await run('E-10', root);
  assert.equal(r.status, 'fail', r.detail);
  assert.match(r.detail, /SessionStart hook/);
  assert.equal(r.data?.fix?.kind, 'hook-absent');
  const e08 = await run('E-08', root);
  assert.equal(e08.status, 'ok');
  assert.doesNotMatch(e08.detail, /see E-10/);
});

test('ARC-11-C10 — a machine without node keeps the hook-free reading (ARC-06-S05)', async (t) => {
  const root = withoutHook(t);
  const r = await run('E-10', root, { env: nodeless(t) });
  assert.equal(r.status, 'ok', r.detail);
  assert.equal((await run('E-08', root, { env: nodeless(t) })).status, 'ok');
});

test('ARC-11-C10 — a disableAllHooks the user set FAILs E-10 when node is on PATH, and no fixer takes their key', async (t) => {
  const root = copyTree(t, greenTree(t));
  writeJson(root, LOCAL, { ...readJson(root, LOCAL), disableAllHooks: true });
  const r = await run('E-10', root);
  assert.equal(r.status, 'fail', r.detail);
  assert.match(r.remedy ?? '', /remove "disableAllHooks"/);
  assert.equal(r.data?.fix ?? null, null);
  const without = await run('E-10', root, { env: nodeless(t) });
  assert.equal(without.status, 'ok');
  assert.match(without.detail, /by choice/);
});

test('ARC-11-C10 — doctor --fix re-registers an absent hook, byte for byte what B07 writes', async (t) => {
  const root = withoutHook(t);
  const twin = withoutHook(t);
  const b07 = applyToggles({ root: twin, mode: 'design', nodePresent: true,
    serverKey: readJson(twin, 'engine.config.json').mcp.serverKey });
  assert.equal(b07.ok, true, b07.reason);
  assert.equal((await run('E-10', root)).status, 'fail');
  await doctorAt(root, { fix: true, yes: true });
  assert.equal(readFileSync(join(root, LOCAL), 'utf8'), readFileSync(join(twin, LOCAL), 'utf8'));
  assert.equal((await run('E-10', root)).status, 'ok');
});

test('ARC-11-C10 — a hook at a wrong path FAILs E-08 with doctor --fix as the remedy, and E-10 rewrites it', async (t) => {
  // Two wrong paths: the script somewhere else in this checkout, and another checkout's script by absolute path —
  // which ends in the right three segments and still is not the entry B07 writes.
  for (const command of ['node ${CLAUDE_PROJECT_DIR}/tools/snowarch/old/session-start.mjs',
    'node /elsewhere/checkout/tools/snowarch/hooks/session-start.mjs']) {
    const root = copyTree(t, greenTree(t));
    const local = readJson(root, LOCAL);
    local.hooks.SessionStart[0].hooks[0].command = command;
    writeJson(root, LOCAL, local);
    const e08 = await run('E-08', root);
    assert.equal(e08.status, 'fail', command);
    assert.match(e08.remedy ?? '', /doctor --fix/, command);
    const e10 = await run('E-10', root);
    assert.equal(e10.status, 'fail', command);
    assert.equal(e10.data?.fix?.kind, 'hook-wrong', command);
    await doctorAt(root, { fix: true, yes: true });
    assert.equal((await run('E-08', root)).status, 'ok', command);
    assert.equal((await run('E-10', root)).status, 'ok', command);
  }
});

test('ARC-11-C10 — the hook script itself missing FAILs E-08 with a checkout of it, naming E-32', async (t) => {
  const root = copyTree(t, greenTree(t));
  rmSync(join(root, 'tools/snowarch/hooks/session-start.mjs'));
  const e08 = await run('E-08', root);
  assert.equal(e08.status, 'fail');
  assert.match(e08.remedy ?? '', /git checkout -- tools\/snowarch\/hooks\/session-start\.mjs/);
  assert.match(e08.remedy ?? '', /E-32/);
  // Rewriting the entry would not bring the file back, so E-10 offers no hook fix for it.
  assert.notEqual((await run('E-10', root)).data?.fix?.kind, 'hook-wrong');
});

test('ARC-11-C10 — an unparsable settings.local.json FAILs E-10, and --fix refuses it with the reason', async (t) => {
  const root = copyTree(t, greenTree(t));
  writeFileSync(join(root, LOCAL), '{ not json');
  assert.equal((await run('E-10', root)).status, 'fail');
  const { text } = await doctorAt(root, { fix: true, yes: true });
  assert.equal(readFileSync(join(root, LOCAL), 'utf8'), '{ not json');
  // The refusal's own words — E-10's detail shares only its opening, so the tail is what proves F6 ran and declined.
  const tail = INVALID_JSON.slice(INVALID_JSON.indexOf('fix or move'));
  assert.ok(text.includes(tail), `the fixer's refusal is not in the output:\n${text}`);
});

test('ARC-11-C10 — a bootstrap re-run repairs an absent hook (B07 is idempotent)', async (t) => {
  const root = withoutHook(t);
  const config = readJson(root, 'engine.config.json');
  const state = readJson(root, '.local/bootstrap-state.json');
  const r = await runB07({ root, mode: 'design-only', node: { present: true }, state, config, line: () => {} });
  assert.notEqual(r?.status, 'fail', r?.detail);
  assert.equal((await run('E-10', root)).status, 'ok');
});

test('ARC-11-C10 bound — a session started with --setting-sources project is undetectable: the verdict does not change', async (t) => {
  const root = withoutHook(t);
  const plain = await run('E-10', root);
  const hinted = await run('E-10', root, { env: { ...process.env, CLAUDE_CODE_SETTING_SOURCES: 'project' } });
  assert.deepEqual({ status: hinted.status, detail: hinted.detail }, { status: plain.status, detail: plain.detail });
});
