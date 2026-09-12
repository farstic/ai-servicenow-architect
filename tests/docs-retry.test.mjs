import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  CORPUS_DIR, EXIT, RETRY_WAITS_MS, SyncError, blockingSleep, inspect, retryLine, retryPlan,
  syncCorpus, transientReason,
} from '../tools/snowarch/lib/docs/sync.mjs';
import { buildUpstream, git, makeWorkspace } from './helpers/docs-fixture.mjs';

/**
 * ARC-03-C1 — the corpus checkout survives a transient network failure, and says so.
 *
 * WHAT HAPPENED: `bootstrap (no-node, macos-latest)` failed on 89bb06f with an HTTP 408 during the
 * corpus checkout. Two defects, one run. The Node path had no retry at all, so a 408 was a failed
 * install. The Node-FREE path was worse: the launcher's generated recipe was six commands in
 * sequence with no check of any kind, so the shell function's exit status was its final `echo`'s —
 * always 0 — `|| die B02` never fired, and the doctor reported "area missing" three steps
 * downstream of the cause. This file covers the Node path's retry and the launcher's cleanup;
 * `tests/docs-recipe.test.mjs` covers the rendering that makes the recipe fail fast.
 *
 * The transient substrings are libcurl's as surfaced by git, from ARC-00 S-07's transcripts. A
 * `file://` fixture cannot emit a single one of them, which is why the class and the schedule are
 * proven against canned stderr and the WIRING is proven once, with a fake `git` on PATH.
 */

const silent = () => {};
let scratch, upstream, upstreamUrl;

before(() => {
  scratch = mkdtempSync(join(tmpdir(), 'snowarch-docs-retry-'));
  upstream = buildUpstream(scratch);
  upstreamUrl = pathToFileURL(upstream.bare).href;
});
after(() => { rmSync(scratch, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); });

// ── 1. the class ─────────────────────────────────────────────────────────────────────────────────

test('AC 1 — the transient class, both directions, with every string named', () => {
  // Every string here is one a retry must survive. Written out rather than generated: a table that
  // built its own inputs would agree with the implementation by construction.
  const transient = [
    ['error: RPC failed; curl 18 transfer closed with outstanding read data remaining', 'curl 18'],
    ['error: RPC failed; curl 56 GnuTLS recv error (-54)', 'curl 56'],
    ['error: RPC failed; HTTP 408 curl 22 The requested URL returned error: 408', 'HTTP 408'],
    ['fatal: unable to access: The requested URL returned error: 429', 'HTTP 429'],
    ['fatal: unable to access: The requested URL returned error: 500', 'HTTP 500'],
    ['fatal: unable to access: The requested URL returned error: 502', 'HTTP 502'],
    ['fatal: unable to access: The requested URL returned error: 503', 'HTTP 503'],
    ['fatal: the remote end hung up unexpectedly', 'remote hung up'],
    ['fatal: early EOF', 'early EOF'],
    ['fatal: unexpected disconnect while reading sideband packet', 'sideband disconnect'],
    ['error: RPC failed; something this table has never seen', 'RPC failed'],
  ];
  for (const [stderr, label] of transient) {
    assert.equal(transientReason(stderr), label, stderr);
  }

  // The other direction, and it is the half that matters: a permanent failure retried three times
  // is 12 s of waiting for the same answer.
  const permanent = [
    'fatal: unable to access: Could not resolve host: github.com',
    'remote: Support for password authentication was removed.\nfatal: Authentication failed for ...',
    "fatal: invalid username or password",
    'remote: Repository not found.\nfatal: repository not found',
    'error: object file .git/objects/ab/cd is empty\nfatal: loose object is corrupt object',
    'fatal: the requested URL returned error: 404',
    'fatal: the requested URL returned error: 403',
    'error: pathspec did not match any file(s) known to git',
    '',
  ];
  for (const stderr of permanent) assert.equal(transientReason(stderr), null, stderr);

  // Permanent WINS when both appear in one stderr, which is git's normal shape: it prints
  // `RPC failed` above the thing that actually went wrong.
  assert.equal(transientReason('error: RPC failed; HTTP 401\nfatal: Authentication failed'), null);
  assert.equal(transientReason('error: RPC failed; curl 18\nfatal: could not resolve host'), null);
  // Case is git's, and it has varied across versions.
  assert.equal(transientReason('ERROR: RPC FAILED; CURL 18 TRANSFER CLOSED'), 'curl 18');
});

// ── 2. the schedule ──────────────────────────────────────────────────────────────────────────────

test('AC 2 — three attempts, 3 s then 9 s, no jitter, and the line says so', () => {
  const t408 = 'error: RPC failed; HTTP 408 curl 22 The requested URL returned error: 408';

  assert.deepEqual([...RETRY_WAITS_MS], [3000, 9000], 'the schedule itself');
  // One entry per WAIT, so the attempt count cannot disagree with the waits.
  assert.equal(RETRY_WAITS_MS.length + 1, 3, 'three attempts');

  const first = retryPlan(t408, 1);
  assert.deepEqual(first, { reason: 'HTTP 408', waitMs: 3000, next: 2, of: 3 });
  const second = retryPlan(t408, 2);
  assert.deepEqual(second, { reason: 'HTTP 408', waitMs: 9000, next: 3, of: 3 });
  // The third attempt has no wait after it — that is what makes it the last one.
  assert.equal(retryPlan(t408, 3), null, 'a fourth attempt is never planned');

  // No jitter: the same input plans the same wait every time. Asserted, because "no jitter" is a
  // property a future edit could quietly remove and every other test here would still pass.
  for (let i = 0; i < 5; i += 1) assert.equal(retryPlan(t408, 1).waitMs, 3000);

  assert.equal(retryLine(first, 'checkout'),
    '[docs] corpus: transient (HTTP 408) during checkout, attempt 2 of 3 in 3 s');
  assert.equal(retryLine(second, 'fetch'),
    '[docs] corpus: transient (HTTP 408) during fetch, attempt 3 of 3 in 9 s');
  // A permanent failure is never planned for, at any attempt number.
  for (let a = 1; a <= 3; a += 1) {
    assert.equal(retryPlan('fatal: Could not resolve host: github.com', a), null);
  }
});

test('AC 2 — the injected sleep is what waits, and the default one really sleeps', () => {
  // The default is a BLOCKING sleep: every git call in the recipe is synchronous, so an async pause
  // would change syncCorpus's signature for all five callers. 40 ms, not 3000 — the claim is that
  // it blocks, and a test that proved it by spending the real schedule would cost 12 s.
  const t0 = Date.now();
  blockingSleep(40);
  const spent = Date.now() - t0;
  assert.ok(spent >= 35, `blockingSleep returned after ${spent} ms`);
});

// ── 3. the wiring, with a fake git on PATH ───────────────────────────────────────────────────────

/**
 * A `git` earlier on PATH than the real one, failing the first `n` times it is asked to do `verb`
 * and delegating everything else — including the successful attempt — to the real git.
 *
 * POSIX only, and the skip below names why: `execFileSync('git', …)` runs with `shell: false`, and
 * on Windows that cannot execute a `.cmd` shim, so the fake would never be reached and the test
 * would pass without testing anything. The policy above is platform-independent and covered
 * everywhere; this proves the policy is CALLED, which is the part a fixture cannot infer.
 */
function fakeGit(dir, { verb, fail, stderr }) {
  mkdirSync(dir, { recursive: true });
  const counter = join(dir, 'count');
  writeFileSync(counter, '0');
  const real = execFileSync('/usr/bin/env', ['sh', '-c', 'command -v git'], { encoding: 'utf8' }).trim();
  writeFileSync(join(dir, 'git'), `#!/bin/sh
for a in "$@" ; do
  if [ "$a" = "${verb}" ] ; then
    n=$(cat "${counter}")
    if [ "$n" -lt "${fail}" ] ; then
      echo $((n + 1)) > "${counter}"
      echo "${stderr}" >&2
      exit 128
    fi
  fi
done
exec "${real}" "$@"
`);
  chmodSync(join(dir, 'git'), 0o755);
  return { counter, read: () => Number(readFileSync(counter, 'utf8').trim()) };
}

const posixOnly = { skip: process.platform === 'win32'
  ? 'POSIX only: execFileSync runs git with shell:false, which cannot execute a .cmd shim on Windows'
  : false };

test('AC 3 — a transient failure is retried and the sync completes', posixOnly, () => {
  const w = makeWorkspace({ scratch, pin: upstream.pin, upstreamUrl });
  const bin = join(scratch, 'fake-bin-retry');
  const fake = fakeGit(bin, {
    verb: 'checkout', fail: 2,
    stderr: 'error: RPC failed; HTTP 408 curl 22 The requested URL returned error: 408',
  });
  const saved = process.env.PATH;
  const slept = [];
  const said = [];
  let r = null;
  try {
    process.env.PATH = `${bin}:${saved}`;
    r = syncCorpus({ ...w, log: (m) => said.push(m), sleep: (ms) => slept.push(ms) });
    assert.equal(r.completeness.ok, true, 'the sync did not complete');
  } finally {
    process.env.PATH = saved;
  }
  assert.equal(fake.read(), 2, 'the fake git did not fail exactly twice');
  assert.deepEqual(slept, [3000, 9000], 'the wired schedule is not the planned one');
  const retries = said.filter((l) => l.includes('corpus: transient'));
  assert.deepEqual(retries, [
    '[docs] corpus: transient (HTTP 408) during checkout, attempt 2 of 3 in 3 s',
    '[docs] corpus: transient (HTTP 408) during checkout, attempt 3 of 3 in 9 s',
  ]);
  // And it really landed at the pin — a retry that reports success over an empty tree is the
  // failure this story exists to remove.
  assert.equal(inspect(w.root, w.config, r.areas).head, upstream.pin);
});

test('AC 3 — exhaustion fails with the network sentence AND the attempt count', posixOnly, () => {
  const w = makeWorkspace({ scratch, pin: upstream.pin, upstreamUrl });
  const bin = join(scratch, 'fake-bin-exhaust');
  const fake = fakeGit(bin, {
    verb: 'clone', fail: 99,
    stderr: 'error: RPC failed; HTTP 503 curl 22 The requested URL returned error: 503',
  });
  const saved = process.env.PATH;
  const slept = [];
  let err = null;
  try {
    process.env.PATH = `${bin}:${saved}`;
    syncCorpus({ ...w, log: silent, sleep: (ms) => slept.push(ms) });
  } catch (e) { err = e; } finally { process.env.PATH = saved; }

  assert.ok(err instanceof SyncError, `expected SyncError, got ${err}`);
  assert.equal(err.code, EXIT.git);
  assert.match(err.message, /\(3 attempts\)$/, err.message);
  assert.equal(fake.read(), 3, 'it did not try exactly three times');
  assert.deepEqual(slept, [3000, 9000], 'it slept a schedule it had not planned');
});

test('AC 3 — a permanent failure is not retried at all', posixOnly, () => {
  const w = makeWorkspace({ scratch, pin: upstream.pin, upstreamUrl });
  const bin = join(scratch, 'fake-bin-permanent');
  const fake = fakeGit(bin, {
    verb: 'clone', fail: 99,
    stderr: 'fatal: unable to access: Could not resolve host: github.com',
  });
  const saved = process.env.PATH;
  const slept = [];
  let err = null;
  try {
    process.env.PATH = `${bin}:${saved}`;
    syncCorpus({ ...w, log: silent, sleep: (ms) => slept.push(ms) });
  } catch (e) { err = e; } finally { process.env.PATH = saved; }

  assert.ok(err instanceof SyncError, `expected SyncError, got ${err}`);
  assert.equal(fake.read(), 1, 'a permanent failure was tried more than once');
  assert.deepEqual(slept, [], 'it waited for a failure that will never change');
  assert.doesNotMatch(err.message, /attempts/, 'a single attempt must not report a count');
});

// ── 4. re-runnable on a partial corpus ───────────────────────────────────────────────────────────

test('AC 4 — a partial corpus is finished, not re-cloned: `re-run` has to be true', () => {
  // The state a failed run leaves on the NODE path: `.git` is there (the clone got that far), the
  // working tree is not populated. MSG_NET tells the operator to re-run, and the launcher now
  // removes a directory it created — so this is the other half of the same promise: where the
  // directory legitimately survives, the re-run must finish the job rather than trip over it.
  const w = makeWorkspace({ scratch, pin: upstream.pin, upstreamUrl });
  const corpus = join(w.root, CORPUS_DIR);

  git(['clone', '--filter=blob:none', '--no-checkout', '--depth', '1', '--sparse',
    '--branch', w.config.docs.family, upstreamUrl, CORPUS_DIR], w.root);
  assert.ok(existsSync(join(corpus, '.git')), 'fixture: no .git to be partial with');
  assert.ok(!existsSync(join(corpus, 'LICENSE')), 'fixture: the tree is already populated');

  const said = [];
  const r = syncCorpus({ ...w, log: (m) => said.push(m) });

  assert.equal(r.completeness.ok, true, 'the re-run did not finish the checkout');
  assert.equal(inspect(w.root, w.config, r.areas).head, upstream.pin);
  assert.ok(existsSync(join(corpus, 'LICENSE')), 'the working tree is still empty');
  // The claim is not just "it worked" — it is that it did NOT clone over an existing directory,
  // which is exactly what a re-run of the raw recipe fails on ("already exists and is not empty").
  assert.ok(!said.some((l) => l.includes('clone')), `it cloned: ${said.join(' | ')}`);
  assert.ok(said.some((l) => l.includes('checkout')), 'it never checked out');
});
