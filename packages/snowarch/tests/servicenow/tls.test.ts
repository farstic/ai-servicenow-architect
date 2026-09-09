import { describe, expect, it, beforeAll, afterAll, afterEach, vi } from 'vitest';
import { createServer, type Server } from 'node:https';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { AddressInfo } from 'node:net';
import selfsigned from 'selfsigned';
import { resetHttpDispatcher, snFetch } from '../../src/servicenow/http.js';
import { classifyNetworkError } from '../../src/servicenow/net-errors.js';

/**
 * A TLS-intercepting corporate gateway, reproduced locally.
 *
 * The certificate is GENERATED at test time rather than committed: a committed private key
 * would be a real private key in the repository, the secret scan would be right to fail on it,
 * and suppressing that rule to make room for a fixture is how a real key gets in later. Nothing
 * here reaches the public internet — the server is on loopback and the name is `localhost`.
 *
 * The `NODE_EXTRA_CA_CERTS` half runs in a CHILD PROCESS because Node reads that variable once,
 * at process start. Setting it inside a running test does nothing at all, and a test that did
 * so would "prove" the variable works while proving that the request happened to succeed for
 * some other reason.
 */
const HERE = dirname(fileURLToPath(import.meta.url));

/**
 * ASYNC, and that is load-bearing. The HTTPS fixture runs in THIS process, and `execFileSync`
 * blocks this process's event loop for the child's whole lifetime — so the server never accepts
 * the connection and the child times out with `UND_ERR_CONNECT_TIMEOUT`. The first version of
 * this test did exactly that and read as "NODE_EXTRA_CA_CERTS does not work".
 */
const run = promisify(execFile);

/** Import the built modules the way the real entry points do: sanitiser first. */
const childScript = (port: number, marker: boolean): string => `
  const { pathToFileURL } = require('node:url');
  const load = (p) => import(pathToFileURL(p).href);
  load(${JSON.stringify(resolve(HERE, '../../dist/env-sanitise.js'))})
    .then(() => load(${JSON.stringify(resolve(HERE, '../../dist/servicenow/http.js'))}))
    .then(async (m) => {
      const res = await m.snFetch('https://localhost:${port}/api/now/table/sys_user');
      ${marker ? "const body = await res.text(); console.log('CHILD_OK ' + res.status + ' ' + body);"
    : "console.log('CHILD_OK ' + res.status);"}
    })
    .catch((e) => { console.log('CHILD_FAIL ' + (e && e.message)); });
`;

let server: Server;
let port: number;
let dir: string;
let caPath: string;

beforeAll(async () => {
  const pems = await selfsigned.generate(
    [{ name: 'commonName', value: 'localhost' }],
    {
      // `notAfterDate`, not `days`: selfsigned@5 renamed it, and the type declaration is what
      // caught it — the runtime accepted the unknown key silently and defaulted to a year.
      notAfterDate: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000),
      keySize: 2048,
      // Without a matching SAN, Node rejects with ERR_TLS_CERT_ALTNAME_INVALID even when the
      // CA is trusted — so the success half below would fail for a reason unrelated to the CA,
      // and the failure half would pass for the wrong one.
      extensions: [{
        name: 'subjectAltName',
        altNames: [{ type: 2, value: 'localhost' }, { type: 7, ip: '127.0.0.1' }],
      }],
    },
  );

  dir = mkdtempSync(join(tmpdir(), 'snowarch-tls-'));
  caPath = join(dir, 'fixture-ca.pem');
  writeFileSync(caPath, pems.cert);

  server = createServer({ key: pems.private, cert: pems.cert }, (_req, res) => {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ result: [] }));
  });
  await new Promise<void>((done) => { server.listen(0, '127.0.0.1', done); });
  port = (server.address() as AddressInfo).port;
});

afterAll(async () => {
  await new Promise<void>((done) => { server.close(() => done()); });
  rmSync(dir, { recursive: true, force: true });
});

afterEach(() => { vi.unstubAllEnvs(); resetHttpDispatcher(); });

describe('criterion 3 - an untrusted certificate', () => {
  it('classifies as TLS_CA_UNTRUSTED and the remedy names NODE_EXTRA_CA_CERTS', async () => {
    let err: unknown;
    try {
      await snFetch(`https://localhost:${port}/api/now/table/sys_user`);
    } catch (e) { err = e; }

    expect(err, 'the request should not have succeeded without the CA').toBeDefined();
    const d = classifyNetworkError(err, {});
    expect(d.code).toBe('TLS_CA_UNTRUSTED');
    expect(d.remedy).toContain('NODE_EXTRA_CA_CERTS');
    // The underlying code is kept so a report can be traced back to the real cause.
    expect(d.cause).toMatch(/CERT|SIGNATURE|ISSUER/);
  });
});

describe('criterion 3 - with NODE_EXTRA_CA_CERTS the same request succeeds', () => {
  it('in a child process, because Node reads the variable at start-up', async () => {
    // Driven through the BUILT modules so this exercises what ships, and asserted on a printed
    // marker rather than the exit code: a child that crashed before reaching the fetch would
    // also exit non-zero, and one that exited 0 for an unrelated reason would pass.
    //
    // `HTTPS_PROXY: ''` is deliberate — this is criterion 5 end to end. The child imports
    // `env-sanitise` first, exactly as the real entry points do, so the empty value is deleted
    // before the agent is built. Without that import the agent reads `""` as a proxy URL and
    // the request fails with a proxy error that has nothing to do with the CA.
    const { stdout } = await run(process.execPath, ['-e', childScript(port, true)], {
      encoding: 'utf8',
      env: { ...process.env, NODE_EXTRA_CA_CERTS: caPath, HTTPS_PROXY: '', NO_PROXY: '' },
      timeout: 30_000,
    });

    expect(stdout).toContain('CHILD_OK 200');
    expect(stdout).toContain('{"result":[]}');
  }, 40_000);

  it('and WITHOUT the variable the same child fails - the control', async () => {
    // Without this, the case above would pass on a machine that trusted the fixture CA for some
    // other reason, and the variable would never have been the thing under test.
    const env: NodeJS.ProcessEnv = { ...process.env, HTTPS_PROXY: '', NO_PROXY: '' };
    delete env.NODE_EXTRA_CA_CERTS;

    const { stdout } = await run(process.execPath, ['-e', childScript(port, false)], {
      encoding: 'utf8', env, timeout: 30_000,
    });

    expect(stdout).toContain('CHILD_FAIL');
  }, 40_000);
});
