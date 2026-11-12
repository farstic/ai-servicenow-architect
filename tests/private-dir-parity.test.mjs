// Copyright 2026 Cvetomir Grigorov. Licensed under the Business Source License 1.1 (see LICENSE).
// snowarch — AI ServiceNow Architect. Not affiliated with or endorsed by ServiceNow, Inc.
/**
 * ARC-09-C272 — the engine and the server lock a path with the same command.
 *
 * Two code bases make private folders — the engine (`tools/snowarch/lib/private-dir.mjs`, stdlib only, run before anything is
 * installed) and the server (`packages/snowarch/src/store/acl.ts`, compiled into `dist/`) — and the engine cannot import the server.
 * A lock that differed between them would be one a person finds out about on the one machine where the other made the folder, so
 * the argument list and the SID reading are compared over a table, the same way the launchers' sentences are compared with their
 * source.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const engine = await import(pathToFileURL(join(root, 'tools/snowarch/lib/private-dir.mjs')).href);
const server = await import(pathToFileURL(join(root, 'packages/snowarch/dist/store/acl.js')).href);

const SIDS = ['S-1-5-21-3289802278-1561746829-1498425070-500', 'S-1-12-1-1111-2222-3333-4444', 'S-1-5-21-1-2-3-1001'];
const PATHS = ['C:\\work\\AI-Arch\\.local', 'C:\\Users\\someone\\AppData\\Roaming\\snowarch\\instances.json', 'D:\\a b\\c d\\.local'];

test('ARC-09-C272 — the same arguments for the same path, account and kind', () => {
  assert.equal(engine.SYSTEM_SID, server.SYSTEM_SID);
  for (const sid of SIDS) for (const path of PATHS) for (const dir of [true, false]) {
    assert.deepEqual(engine.lockArgs(path, sid, { dir }), server.lockArgs(path, sid, { dir }), `${path} ${sid} dir=${dir}`);
  }
});

test('ARC-09-C272 — the same account from the same whoami text, including text with none', () => {
  for (const text of [
    '"runnervmm7ud1\\runneradmin","S-1-5-21-3289802278-1561746829-1498425070-500"\r\n',
    '"AzureAD\\Last, First 1-2-3","S-1-12-1-1111-2222-3333-4444"\r\n',
    '', 'ERROR: Access is denied.', '"someone","not-a-sid"',
  ]) {
    assert.equal(engine.parseWhoamiSid(text), server.parseWhoamiSid(text), JSON.stringify(text));
  }
});
