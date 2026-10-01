import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { createServer } from 'node:net';
import { delimiter, dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { which } from '../lib/which.mjs';
import { useStateRoot } from './helpers/state-root.mjs';
import { tempDir } from './helpers/temp.mjs';

/**
 * ARC-09-C76 — B00's network step settles in a process that nothing else keeps alive.
 *
 * `windows-native (node 24, no Git Bash)` failed once with `expected exit 3, got 13` and Node's
 * `Detected unsettled top-level await`. B00's retry pause `unref()`'d its timer, so after a retryable
 * probe failure that left no socket open the event loop was empty for the whole wait, and Node ended
 * the process with `main()` still pending. A network that needs no retry never reaches the pause —
 * which is why the rerun went green, and why a loop of healthy runs would pass with the defect present.
 *
 * Both cases run in a CHILD process, and that is the point of them: under `node:test` the runner keeps
 * the loop alive, so an awaited unref'd timer completes in-process and every in-process case passes
 * with the defect in place. Measured before these were written.
 */
const here = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(here, '..', '..', '..');
const BIN = join(ROOT, 'tools', 'snowarch', 'bin', 'snowarch.mjs');

/** A port nothing listens on — bound, then closed — so a connection to it is refused at once. */
async function refusingPort() {
  const server = createServer();
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const { port } = server.address();
  await new Promise((r) => server.close(r));
  return port;
}

/** This process's environment without any spelling of PATH or a proxy, plus what the case sets. */
function childEnv(over) {
  const kept = Object.entries(process.env)
    .filter(([k]) => !/^path$/i.test(k) && !/^(https?|all|no)_proxy$/i.test(k));
  return { ...Object.fromEntries(kept), ...over };
}

test('without git, on a network that needs a retry, bootstrap still exits 3 — not 13', { timeout: 120_000 }, async (t) => {
  // The CI step's own shape — `bootstrap --mode design --yes --skip-claude-check --docs skip` with git
  // off PATH — and the one thing that step could not control: the probe target is a port that refuses,
  // so the run takes the retry path every time instead of when the network happens to flake.
  const emptyBin = join(tempDir('snowarch-c76-', t), 'empty-bin');
  mkdirSync(emptyBin, { recursive: true });
  const PATH = [emptyBin, dirname(process.execPath)].join(delimiter);
  assert.equal(which('git', { env: { PATH, PATHEXT: '.EXE;.CMD' } }), null,
    'git is still resolvable on the constructed PATH — this test would prove nothing');

  const r = spawnSync(process.execPath,
    [BIN, 'bootstrap', '--mode', 'design', '--yes', '--skip-claude-check', '--docs', 'skip'], {
      cwd: ROOT,
      encoding: 'utf8',
      env: childEnv({ PATH, PATHEXT: '.EXE;.CMD', SNOWARCH_STATE_ROOT: useStateRoot(t),
        SNOWARCH_TEST_NET_URL: `https://127.0.0.1:${await refusingPort()}/` }),
    });
  const out = `${r.stdout}${r.stderr}`;

  assert.equal(/unsettled top-level await/.test(out), false, `the process ended under a pending await:\n${out}`);
  assert.equal(r.status, 3, out);
  assert.match(out, /^FAIL B00: git not found$/m);
  // The schedule ran to its end, so both pauses were waited out rather than abandoned — and a run that
  // stopped taking the retry path would fail here instead of passing with nothing proved.
  assert.match(out, /^FAIL B00: .*\(3 attempts\)$/m);
});

test('the probe settles at its ceiling when the request holds nothing open', { timeout: 30_000 }, () => {
  // A request that never answers and owns no socket. The only thing that can settle the race is the
  // probe's own ceiling, so the ceiling has to be a timer the event loop counts.
  const probeNet = pathToFileURL(join(ROOT, 'tools', 'snowarch', 'lib', 'probe-net.mjs')).href;
  const script = [
    `const { probeNetwork } = await import(${JSON.stringify(probeNet)});`,
    'const silent = () => { const req = { on: () => req, end: () => {}, destroy: () => {} }; return req; };',
    "const r = await probeNetwork({ target: 'https://probe.invalid/', env: {}, timeoutMs: 200, request: silent });",
    'console.log(JSON.stringify({ ok: r.ok, code: r.code }));',
  ].join('\n');
  const r = spawnSync(process.execPath, ['--input-type=module', '-e', script], { encoding: 'utf8' });
  const out = `${r.stdout}${r.stderr}`;

  assert.equal(/unsettled top-level await/.test(out), false, `the probe never settled:\n${out}`);
  assert.equal(r.status, 0, out);
  assert.deepEqual(JSON.parse(r.stdout.trim()), { ok: false, code: 'ETIMEDOUT_PROBE' });
});
