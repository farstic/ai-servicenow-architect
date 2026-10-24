// Copyright 2026 Cvetomir Grigorov. Licensed under the Business Source License 1.1 (see LICENSE).
// snowarch — AI ServiceNow Architect. Not affiliated with or endorsed by ServiceNow, Inc.
// ARC-09-C231 — the doctor reads the PostToolUse citation hook as it reads SessionStart's (ARC-11-C10): a wrong or
// absent entry is B07's writer's to rewrite (`doctor --fix`), a missing script a checkout's. Absent with Node on
// PATH it WARNs rather than FAILs: the session keeps its Licence: line, and what it loses is the citation check.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rmSync } from 'node:fs';
import { join } from 'node:path';

import { engineRepoChecks, postWriteProblems } from '../../tools/snowarch/lib/doctor/checks/engine-repo.mjs';
import { doctorCommand } from '../../tools/snowarch/lib/doctor/index.mjs';
import { POST_WRITE_LOADER } from '../../tools/snowarch/lib/settings-local.mjs';
import { contextFor, copyTree, greenTree, readJson, runById, writeJson } from './helpers/tree.mjs';

const checks = engineRepoChecks();
const run = (id, root, over = {}) => runById(checks, id, contextFor(root, over));
/** The full doctor, as a user runs it, against a fixture (hook-gone.test.mjs's helper). */
async function doctorAt(root, flags = {}) {
  const chunks = [];
  const code = await doctorCommand({ flags: { 'no-network': true, ...flags },
    out: { write: (s) => chunks.push(s) }, err: { write: (s) => chunks.push(s) }, cwd: root, input: { isTTY: false } });
  return { code, text: chunks.join('') };
}
const LOCAL = '.claude/settings.local.json';
const SCRIPT = 'tools/snowarch/hooks/post-write.mjs';

test('ARC-09-C231 — E-10 warns when Node is on PATH and the citation hook is not registered, with the writer as the fix', async (t) => {
  const root = copyTree(t, greenTree(t));
  const local = readJson(root, LOCAL);
  delete local.hooks.PostToolUse;
  writeJson(root, LOCAL, local);
  assert.equal(readJson(root, LOCAL).hooks.PostToolUse, undefined, 'the fixture still registers the citation hook');
  const r = await run('E-10', root);
  assert.equal(r.status, 'warn', r.detail);
  assert.match(r.detail, /no PostToolUse citation hook/);
  assert.match(r.remedy ?? '', /doctor --fix/);
  assert.equal(r.data.fix?.kind, 'hook-absent');
});

test('ARC-09-C231 — a green tree registers the citation hook, and E-08 and E-10 pass it', async (t) => {
  const root = copyTree(t, greenTree(t));
  assert.ok(readJson(root, LOCAL).hooks.PostToolUse, 'the green tree does not register the citation hook');
  for (const id of ['E-08', 'E-10']) assert.equal((await run(id, root)).status, 'ok', id);
});

test('ARC-09-C231 — a citation hook whose timeout is over 10 s is a wrong entry, as SessionStart\'s is', () => {
  const local = { hooks: { PostToolUse: [{ matcher: 'Write|Edit', hooks: [{ type: 'command',
    command: 'node', args: ['-e', POST_WRITE_LOADER], timeout: 30 }] }] } };
  const { problems, entry, present } = postWriteProblems(local, process.cwd());
  assert.equal(present, true);
  assert.match(problems.join(' '), /timeout is 30/);
  assert.equal(entry.length, 1);
});

// ARC-09-C239 — B07 writes the citation hook in exec form, a loader that is a no-op when the script is gone. The shell
// form C231 wrote is an entry for B07 to rewrite, as `doctor --fix` does.
test('ARC-09-C239 — the shell-form citation hook is not the form B07 writes; the exec-form loader is', () => {
  const entry = (hook) => ({ hooks: { PostToolUse: [{ matcher: 'Write|Edit', hooks: [{ type: 'command', timeout: 10,
    ...hook }] }] } });
  const loader = postWriteProblems(entry({ command: 'node', args: ['-e', POST_WRITE_LOADER] }), process.cwd());
  assert.deepEqual([loader.present, loader.problems], [true, []]);
  const shell = postWriteProblems(entry({ command: `node \${CLAUDE_PROJECT_DIR}/${SCRIPT}` }), process.cwd());
  assert.equal(shell.present, true);
  assert.equal(shell.entry.length, 1, shell.problems.join('; '));
  assert.match(shell.entry[0], /not in the form B07 writes/);
});

test('ARC-09-C239 — a shell-form citation hook is rewritten by doctor --fix into the exec form', async (t) => {
  const root = copyTree(t, greenTree(t));
  const local = readJson(root, LOCAL);
  local.hooks.PostToolUse = [{ matcher: 'Write|Edit', hooks: [{ type: 'command', command: `node \${CLAUDE_PROJECT_DIR}/${SCRIPT}`,
    timeout: 10 }] }];
  writeJson(root, LOCAL, local);
  assert.equal((await run('E-10', root)).data?.fix?.kind, 'hook-wrong');
  await doctorAt(root, { fix: true, yes: true });
  const after = readJson(root, LOCAL).hooks.PostToolUse.flatMap((g) => g.hooks);
  assert.deepEqual(after.map((h) => [h.command, h.args]), [['node', ['-e', POST_WRITE_LOADER]]]);
});

test('ARC-09-C231 — E-08 names a missing citation hook script, with its checkout as the cure', async (t) => {
  const root = copyTree(t, greenTree(t));
  rmSync(join(root, SCRIPT));
  const r = await run('E-08', root);
  assert.equal(r.status, 'fail');
  assert.match(r.detail, /tools\/snowarch\/hooks\/post-write\.mjs is not on disk/);
  assert.match(r.remedy ?? '', /git checkout -- tools\/snowarch\/hooks\/post-write\.mjs/);
});
