// Copyright 2026 Cvetomir Grigorov. Licensed under the Business Source License 1.1 (see LICENSE).
// snowarch — AI ServiceNow Architect. Not affiliated with or endorsed by ServiceNow, Inc.
/**
 * ARC-09-C261 — the lookup E-28 makes before it asks the remote anything (lib/dns-probe.mjs).
 *
 * It runs in a short-lived child, `spawnSync(process.execPath, [<dns-lookup-child.mjs>, <host>], { timeout })`, because an in-process
 * `dns.lookup` that hangs cannot be cancelled and would keep the CLI alive after the doctor had printed (the CLI ends with
 * `process.exitCode`, never `process.exit()`), and because c-ares does not have getaddrinfo's semantics: it does not read the hosts
 * file, search domains or a macOS scoped resolver the way git does. The host is the child's argument and never part of any code.
 * Nothing here asks a real resolver for anything but `localhost`, which the hosts file answers.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tempDir } from './helpers/temp.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const probe = () => import('../lib/dns-probe.mjs');
/** A child program of the test's own: what the probe runs in place of the real lookup, so no resolver is asked. */
const childFile = (t, body) => { const file = join(tempDir('c261-child-', t), 'child.mjs'); writeFileSync(file, body); return file; };

test('ARC-09-C261 — the lookup has its own 5 s, and E-28 still ends inside the runner\'s budget when the lookup and the remote each use theirs', async () => {
  const { DNS_BUDGET } = await probe();
  const { NETWORK_TIMEOUT_MS } = await import('../lib/doctor/runner.mjs');
  const { REMOTE_BUDGET_MS } = await import('../lib/doctor/checks/host.mjs');
  assert.equal(DNS_BUDGET, 5_000);
  assert.equal(REMOTE_BUDGET_MS, 15_000);
  // E-28's calls are synchronous, so the runner's timer cannot fire during them, but the first `await` after them lets it: a resolver
  // that answers at 4.9 s and a remote that then sits out its whole budget must still end in a warning, not in "timed out". The
  // two other seconds are for the `git config` questions, the child's start and the imports.
  assert.ok(DNS_BUDGET + REMOTE_BUDGET_MS + 2_000 <= NETWORK_TIMEOUT_MS,
    `${DNS_BUDGET} + ${REMOTE_BUDGET_MS} ms and 2 s to spare do not fit in the runner's ${NETWORK_TIMEOUT_MS} ms for a network check`);
});

test('ARC-09-C261 — the runner says 25 s for a network check and 15 s for the rest, in its own text and on the architecture page', async () => {
  // The architect's ruling of 2026-11-01: DNS stays at 5 s and the runner's budget for a network check goes to 25 s, and nothing may still
  // say 20: not the sentence the runner prints when a check hangs, which is built from the budget, and not the page that describes it.
  const runner = await import('../lib/doctor/runner.mjs');
  assert.equal(runner.NETWORK_TIMEOUT_MS, 25_000);
  assert.equal(runner.DEFAULT_TIMEOUT_MS, 15_000);
  assert.equal(runner.timeoutFor({ network: true }), 25_000);
  assert.equal(runner.timeoutFor({ network: false }), 15_000);
  assert.equal(runner.timedOutText(runner.timeoutFor({ network: true })), 'timed out after 25 s');
  const page = readFileSync(join(ROOT, 'docs', 'ARCHITECTURE.md'), 'utf8').replace(/\s+/g, ' ');
  const said = /after its timeout \((\d+) s, (\d+) s for a network check\)/.exec(page);
  assert.ok(said, 'the architecture page no longer says what the runner\'s timeouts are, in the shape this test reads');
  assert.deepEqual([Number(said[1]) * 1000, Number(said[2]) * 1000], [runner.DEFAULT_TIMEOUT_MS, runner.NETWORK_TIMEOUT_MS],
    'the architecture page and the runner disagree about the doctor\'s timeouts');
});

test('ARC-09-C261 — localhost resolves in the real child, from the hosts file', async () => {
  const { lookupHost } = await probe();
  assert.deepEqual(lookupHost('localhost'), { ok: true });
});

test('ARC-09-C261 — a child that never answers is killed at the budget and reported as not answered, with no real lookup', async (t) => {
  const { lookupHost } = await probe();
  const started = Date.now();
  assert.deepEqual(lookupHost('anything', { timeoutMs: 300, child: childFile(t, 'setTimeout(() => {}, 60000);') }), { ok: false, timedOut: true });
  assert.ok(Date.now() - started < 5_000, `the child outlived its budget: ${Date.now() - started} ms`);
});

test('ARC-09-C261 — an answer that says no such host is reported by its code, and nothing but a kill is read as a timeout', async (t) => {
  const { lookupHost } = await probe();
  assert.deepEqual(lookupHost('x', { child: childFile(t, 'console.log("ENOTFOUND"); process.exitCode = 1;') }), { ok: false, code: 'ENOTFOUND' });
  assert.deepEqual(lookupHost('x', { child: childFile(t, 'process.exitCode = 1;') }), { ok: false, code: 'ERROR' });
  assert.deepEqual(lookupHost('x', { child: childFile(t, 'process.exitCode = 0;') }), { ok: true });
});

test('ARC-09-C261 — the host is an argument of the child, never part of any code, and the budget is the spawn\'s timeout', async () => {
  const { lookupHost } = await probe();
  const calls = [];
  const spawn = (cmd, args, options) => { calls.push({ cmd, args, options }); return { status: 0, stdout: '' }; };
  const hostile = 'a.example.invalid"); process.exit(7); ("';
  assert.deepEqual(lookupHost(hostile, { spawn, timeoutMs: 1234 }), { ok: true });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].cmd, process.execPath);
  assert.equal(calls[0].args.length, 2, 'the child gets its program and the host, nothing else');
  assert.match(calls[0].args[0].replace(/\\/g, '/'), /\/tools\/snowarch\/lib\/dns-lookup-child\.mjs$/);
  assert.equal(calls[0].args[1], hostile);
  assert.equal(calls[0].options.timeout, 1234);
});
