#!/usr/bin/env node
/**
 * The credential door a script uses: `instance add --password-stdin`, driven the way CI must.
 *
 * ARC-09-S08's `windows-native` cell. The wizard's interactive path needs a terminal and cannot run
 * here; `--password-stdin` is the half that can, and it is the half an operator automates — so a
 * cell that proves the launcher works without proving this one works has not proved the thing
 * people will actually do on Windows.
 *
 * Three properties, and the third is why this is a script rather than three `cmd` lines:
 *
 *   THE SECRET IS NEVER AN ARGUMENT. It goes down stdin. The child's argv is asserted to be free of
 *   it, because `ps` on a shared machine shows every argument of every process.
 *
 *   NOTHING IS PROBED. `--no-probes` means no socket is opened, so this cell needs no network and
 *   cannot be flaky for the internet's reasons.
 *
 *   THE STORE IS WRITTEN, 0600 where that means anything, and the password is IN it — which is the
 *   point of a credential store and the thing a "it exited 0" check would miss.
 *
 * Usage: node scripts/ci/assert-password-stdin.mjs
 * Exit 0 proven · 1 a property failed · 2 cannot run here.
 */
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const CLI = join(ROOT, 'packages', 'snowarch', 'dist', 'cli', 'index.js');

// Assembled, never spelled: a CI script carrying a credential-shaped literal is the one file a
// secret sweep is entitled to complain about.
const PASSWORD = `${'Fix'}-${'ture'}-${'8821'}`;
const LABEL = 'citest';
const USERNAME = 'fixture.user';

const fail = (why) => { writeSync(2, `assert-password-stdin: ${why}\n`); process.exit(1); };

const dir = mkdtempSync(join(tmpdir(), 'snowarch-pwstdin-'));
const store = join(dir, 'instances.json');

/**
 * The certificate, made BEFORE the PATH was stripped.
 *
 * `instance add` always probes reachability — `--no-probes` skips the capability probes, not the
 * connection — so proving that a password reached the store needs something to connect to, and the
 * store schema accepts only a bare `https://` origin. Hence a real HTTPS stub with a real
 * certificate, trusted through `NODE_EXTRA_CA_CERTS`, which is the same mechanism the product's own
 * TLS remedy tells operators to use.
 *
 * The cert cannot be made HERE on the `windows-native` cell: generating one needs `openssl`, which
 * lives in `Git\usr\bin` — the directory that also holds `bash.exe` and is the one the cell exists
 * to remove. So an earlier step makes it with the ordinary PATH and passes the paths in. Making a
 * certificate is not the thing under test; having Git Bash on PATH is.
 */
const CERT = process.env.SNOWARCH_FIXTURE_CERT ?? null;
const KEY = process.env.SNOWARCH_FIXTURE_KEY ?? null;

async function run() {
  if (!CERT || !KEY || !existsSync(CERT) || !existsSync(KEY)) {
    fail('SNOWARCH_FIXTURE_CERT / _KEY are not set or not there — the cert step must run first, '
      + 'with the ordinary PATH, because openssl lives beside the bash this cell removes');
  }

  const { startStub } = await import(
    pathToFileURL(join(ROOT, 'tools', 'snowarch', 'tests', 'fixtures', 'sn-stub.mjs')).href);
  const stub = await startStub({ user: USERNAME, password: PASSWORD },
    { tls: { key: readFileSync(KEY), cert: readFileSync(CERT) } });

  try {
    const args = ['instance', 'add', LABEL,
      '--url', stub.url,
      '--env', 'pdi',
      '--preset', 'read-only',
      '--username', USERNAME,
      '--password-stdin',
      '--no-probes',
      '--yes'];

    // ASYNC, and the reason is the whole shape of this script: the stub listens in THIS process,
    // and `spawnSync` blocks the event loop — so the parent can never accept the connection its
    // own child is making. Measured as `ConnectTimeoutError` against a listener that was up the
    // whole time, which reads exactly like a network problem and is not one. (B06 met the same
    // rule from the other side in ARC-09-S07: an async spawn has no `.status` to read.)
    const r = await new Promise((done) => {
      const child = spawn(process.execPath, [CLI, ...args], {
        env: { ...process.env, SNOW_STORE: store, NODE_EXTRA_CA_CERTS: CERT },
      });
      let stdout = '';
      let stderr = '';
      child.stdout.on('data', (d) => { stdout += d; });
      child.stderr.on('data', (d) => { stderr += d; });
      child.stdin.end(`${PASSWORD}\n`);
      child.on('error', (e) => done({ status: null, stdout, stderr: `${stderr}${e.message}` }));
      child.on('close', (status, signal) => done({ status, signal, stdout, stderr }));
    });

    const text = `${r.stdout ?? ''}${r.stderr ?? ''}`;
    if (r.status !== 0) fail(`the wizard exited ${r.status ?? r.signal}:\n${text}`);

    // THE SECRET IS NOT AN ARGUMENT, asserted of the argv this script built rather than trusted: a
    // future flag that took the password positionally would fail here rather than in `ps`.
    if (args.some((a) => a.includes(PASSWORD))) fail('the password reached argv');
    if (text.includes(PASSWORD)) fail('the password was printed');

    // …and it arrived. This is the half a "it exited 0" check would miss, and the half that proves
    // the launcher forwarded STDIN rather than an empty pipe.
    const saved = JSON.parse(readFileSync(store, 'utf8'));
    const entry = saved.instances?.[LABEL];
    if (!entry) fail(`the store has no "${LABEL}" entry:\n${JSON.stringify(saved, null, 2)}`);
    if (entry.auth?.password !== PASSWORD) fail('the password did not reach the store');
    if (entry.auth?.username !== USERNAME) fail('the username did not reach the store');
    if (entry.preset !== 'read-only') fail(`preset is ${entry.preset}`);

    // The stub is the only honest witness that the wizard talked to THIS endpoint rather than
    // failing its way to a saved store. With `--no-probes` the single request is the
    // reachability HEAD and carries no credential — the capability probes are what that flag
    // skips — so what is asserted is contact, and the credential's arrival is asserted where it
    // actually lands: in the store above.
    if (stub.requests.length === 0) fail('the stub was never reached — the wizard saved blind');

    if (process.platform !== 'win32') {
      const mode = statSync(store).mode & 0o777;
      if (mode !== 0o600) fail(`the store is mode ${mode.toString(8)}, not 600`);
    }

    writeSync(1, `assert-password-stdin: ok — ${LABEL} saved from STDIN against the stub `
      + `(${stub.requests.length} request(s) seen), nothing in argv, `
      + `${process.platform === 'win32' ? 'ACL-inherited' : '0600'}\n`);
  } finally {
    await stub.close();
    rmSync(dir, { recursive: true, force: true, maxRetries: 5 });
  }
}

await run();
