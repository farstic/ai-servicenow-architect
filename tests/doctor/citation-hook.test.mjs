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
import { contextFor, copyTree, greenTree, readJson, runById, writeJson } from './helpers/tree.mjs';

const checks = engineRepoChecks();
const run = (id, root, over = {}) => runById(checks, id, contextFor(root, over));
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
    command: `node \${CLAUDE_PROJECT_DIR}/${SCRIPT}`, timeout: 30 }] }] } };
  const { problems, entry, present } = postWriteProblems(local, process.cwd());
  assert.equal(present, true);
  assert.match(problems.join(' '), /timeout is 30/);
  assert.equal(entry.length, 1);
});

test('ARC-09-C231 — E-08 names a missing citation hook script, with its checkout as the cure', async (t) => {
  const root = copyTree(t, greenTree(t));
  rmSync(join(root, SCRIPT));
  const r = await run('E-08', root);
  assert.equal(r.status, 'fail');
  assert.match(r.detail, /tools\/snowarch\/hooks\/post-write\.mjs is not on disk/);
  assert.match(r.remedy ?? '', /git checkout -- tools\/snowarch\/hooks\/post-write\.mjs/);
});
