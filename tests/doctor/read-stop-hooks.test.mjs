// Copyright 2026 Cvetomir Grigorov. Licensed under the Business Source License 1.1 (see LICENSE).
// snowarch — AI ServiceNow Architect. Not affiliated with or endorsed by ServiceNow, Inc.
// ARC-09-C255 — the doctor reads the two hooks ARC-09-C254 added (PostToolUseFailure for Read, and Stop) as it reads the
// citation hook (ARC-09-C231): a wrong or absent entry is B07's writer's to rewrite (`doctor --fix`), a missing script a
// checkout's. Absent with Node on PATH it WARNs rather than FAILs, as the citation hook does: the session keeps its
// Licence: line, and what it loses is the note on a Read that missed, or the correction after a dead citation. A hook
// entry that goes missing after an upgrade is what the doctor is for, and the entries are written by the same writer.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rmSync } from 'node:fs';
import { join } from 'node:path';

import * as ER from '../../tools/snowarch/lib/doctor/checks/engine-repo.mjs';
import { doctorCommand } from '../../tools/snowarch/lib/doctor/index.mjs';
import * as SL from '../../tools/snowarch/lib/settings-local.mjs';
import { contextFor, copyTree, greenTree, readJson, runById, writeJson } from './helpers/tree.mjs';

const checks = ER.engineRepoChecks();
const run = (id, root, over = {}) => runById(checks, id, contextFor(root, over));
/** The full doctor, as a user runs it, against a fixture. */
async function doctorAt(root, flags = {}) {
  const chunks = [];
  const code = await doctorCommand({ flags: { 'no-network': true, ...flags },
    out: { write: (s) => chunks.push(s) }, err: { write: (s) => chunks.push(s) }, cwd: root, input: { isTTY: false } });
  return { code, text: chunks.join('') };
}
const LOCAL = '.claude/settings.local.json';

const HOOKS = [
  { name: 'Read-failure', event: 'PostToolUseFailure', matcher: 'Read', script: 'tools/snowarch/hooks/read-failure.mjs',
    problems: (local, root) => ER.readFailureProblems(local, root), loader: () => SL.READ_FAILURE_LOADER, lacks: /no PostToolUseFailure hook/,
    own: { matcher: 'Bash', hooks: [{ type: 'command', command: 'echo theirs' }] } },
  { name: 'Stop', event: 'Stop', matcher: null, script: 'tools/snowarch/hooks/stop-citations.mjs',
    problems: (local, root) => ER.stopCitationsProblems(local, root), loader: () => SL.STOP_CITATIONS_LOADER, lacks: /no Stop hook/,
    own: { hooks: [{ type: 'command', command: 'echo mine' }] } },
];
/** A settings file with `hook` as the only hook of the event. */
const only = (h, hook) => ({ hooks: { [h.event]: [{ ...(h.matcher ? { matcher: h.matcher } : {}), hooks: [{ type: 'command', timeout: 10, ...hook }] }] } });

for (const h of HOOKS) {
  test(`ARC-09-C255 — E-10 warns when Node is on PATH and the ${h.name} hook is not registered, with the writer as the fix`, async (t) => {
    const root = copyTree(t, greenTree(t));
    const local = readJson(root, LOCAL);
    delete local.hooks[h.event];
    writeJson(root, LOCAL, local);
    assert.equal(readJson(root, LOCAL).hooks[h.event], undefined, 'the fixture still registers the hook');
    const r = await run('E-10', root);
    assert.equal(r.status, 'warn', r.detail);
    assert.match(r.detail, h.lacks);
    assert.match(r.remedy ?? '', /doctor --fix/);
    assert.equal(r.data.fix?.kind, 'hook-absent');
  });

  test(`ARC-09-C255 — a green tree registers the ${h.name} hook, and E-08 and E-10 pass it`, async (t) => {
    const root = copyTree(t, greenTree(t));
    assert.ok(readJson(root, LOCAL).hooks[h.event], 'the green tree does not register the hook');
    for (const id of ['E-08', 'E-10']) assert.equal((await run(id, root)).status, 'ok', id);
  });

  test(`ARC-09-C255 — a user's own ${h.event} hook is not ours, so E-10 still says ours is absent`, async (t) => {
    const root = copyTree(t, greenTree(t));
    const local = readJson(root, LOCAL);
    local.hooks[h.event] = [h.own];
    writeJson(root, LOCAL, local);
    const r = await run('E-10', root);
    assert.equal(r.status, 'warn', r.detail);
    assert.match(r.detail, h.lacks);
  });

  test(`ARC-09-C255 — the ${h.name} hook whose timeout is over 10 s is a wrong entry, as the other hooks' is`, () => {
    const { problems, entry, present } = h.problems(only(h, { command: 'node', args: ['-e', h.loader()], timeout: 30 }), process.cwd());
    assert.equal(present, true);
    assert.match(problems.join(' '), /timeout is 30/);
    assert.equal(entry.length, 1);
  });

  test(`ARC-09-C255 — the shell-form ${h.name} hook is not the form B07 writes; the exec-form loader is`, () => {
    const loader = h.problems(only(h, { command: 'node', args: ['-e', h.loader()] }), process.cwd());
    assert.deepEqual([loader.present, loader.problems], [true, []]);
    const shell = h.problems(only(h, { command: `node \${CLAUDE_PROJECT_DIR}/${h.script}` }), process.cwd());
    assert.equal(shell.present, true);
    assert.equal(shell.entry.length, 1, shell.problems.join('; '));
    assert.match(shell.entry[0], /not in the form B07 writes/);
  });

  test(`ARC-09-C255 — a hook that is not ours, or absent, has no problems of ours`, () => {
    assert.deepEqual(h.problems({ hooks: { [h.event]: [h.own] } }, process.cwd()), { problems: [], entry: [], scriptMissing: false, present: false });
    assert.equal(h.problems(null, process.cwd()).present, false);
    assert.equal(h.problems({}, process.cwd()).present, false);
  });

  test(`ARC-09-C255 — a shell-form ${h.name} hook is rewritten by doctor --fix into the exec form`, async (t) => {
    const root = copyTree(t, greenTree(t));
    const local = readJson(root, LOCAL);
    local.hooks[h.event] = only(h, { command: `node \${CLAUDE_PROJECT_DIR}/${h.script}` }).hooks[h.event];
    writeJson(root, LOCAL, local);
    assert.equal((await run('E-10', root)).data?.fix?.kind, 'hook-wrong');
    await doctorAt(root, { fix: true, yes: true });
    const after = readJson(root, LOCAL).hooks[h.event].flatMap((g) => g.hooks);
    assert.deepEqual(after.map((x) => [x.command, x.args]), [['node', ['-e', h.loader()]]]);
  });

  test(`ARC-09-C255 — doctor --fix puts back a ${h.name} hook that is absent, once, beside a hook of the user's`, async (t) => {
    const root = copyTree(t, greenTree(t));
    const local = readJson(root, LOCAL);
    local.hooks[h.event] = [h.own];
    writeJson(root, LOCAL, local);
    assert.equal((await run('E-10', root)).data?.fix?.kind, 'hook-absent');
    await doctorAt(root, { fix: true, yes: true });
    const after = readJson(root, LOCAL).hooks[h.event];
    assert.deepEqual(after[0], h.own, 'the user\'s hook is gone or moved');
    assert.deepEqual(after.slice(1), SL.hookEntry()[h.event], 'ours is not there exactly once');
    assert.equal((await run('E-10', root)).status, 'ok');
  });

  test(`ARC-09-C255 — E-08 names a missing ${h.name} hook script, with its checkout as the cure`, async (t) => {
    const root = copyTree(t, greenTree(t));
    rmSync(join(root, h.script));
    const r = await run('E-08', root);
    assert.equal(r.status, 'fail');
    assert.match(r.detail, new RegExp(`${h.script.replace(/[./]/g, '\\$&')} is not on disk`));
    assert.match(r.remedy ?? '', new RegExp(`git checkout -- ${h.script.replace(/[./]/g, '\\$&')}`));
  });
}

test('ARC-09-C255 — with every hook present the E-10 line is the one it always was', async (t) => {
  const root = copyTree(t, greenTree(t));
  const r = await run('E-10', root);
  assert.equal(r.status, 'ok');
  assert.ok(!/hook/i.test(r.detail), `the ok line began to talk about hooks: ${r.detail}`);
});
