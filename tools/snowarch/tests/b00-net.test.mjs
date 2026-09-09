import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { createServer as createHttpsServer } from 'node:https';
import { createServer as createTcpServer } from 'node:net';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { bypassesProxy, classifyNetFailure, probeNetwork, proxyFor } from '../lib/probe-net.mjs';
import { classifyGitFailure } from '../lib/docs/sync.mjs';
import * as SENTENCE from '../lib/net-sentences.mjs';
import { redact } from '../lib/redact.mjs';

/**
 * No real network in any of these.
 *
 * A closed loopback port for "unreachable" — never `.invalid` or a privileged port, both of which
 * behave differently on the three runners and on a machine behind a captive portal. DNS failures
 * are injected through the classifier rather than resolved, for the same reason: a corporate DNS
 * that answers for every name would make an `.invalid` test pass while proving nothing.
 */

/** A port with nothing listening: bind, read the port, close. Racy in theory, reliable in practice. */
async function closedPort() {
  const server = createTcpServer();
  await new Promise((res) => server.listen(0, '127.0.0.1', res));
  const { port } = server.address();
  await new Promise((res) => server.close(res));
  return port;
}

test('one vocabulary: git and the probe say the same sentence for the same wall', () => {
  const proxy = 'http://proxy.example:8080';
  const gitSaid = classifyGitFailure('fatal: unable to access: Could not resolve proxy: proxy.example',
    { upstream: 'https://github.com/x/y', env: { HTTPS_PROXY: proxy } });
  const probeSaid = classifyNetFailure({ code: 'ECONNREFUSED' }, { host: 'github.com', proxy });
  assert.equal(gitSaid, probeSaid, 'two transports, two sentences — that is the drift this prevents');

  // DNS, likewise.
  assert.equal(
    classifyGitFailure('fatal: could not resolve host: github.com', { upstream: 'https://github.com/' }),
    classifyNetFailure({ code: 'ENOTFOUND' }, { host: 'github.com' }));
});

test('the TLS sentence names the failing tool\'s knob first, and the other second', () => {
  // The one place the two callers legitimately differ: when git fails the fix is git's CA setting,
  // when Node fails it is Node's. Both are named either way — finding out you needed the second
  // one after fixing the first is a bad afternoon.
  const fromGit = classifyGitFailure('fatal: SSL certificate problem: self signed certificate',
    { upstream: 'https://github.com/' });
  const fromNode = classifyNetFailure({ code: 'SELF_SIGNED_CERT_IN_CHAIN' }, { host: 'github.com' });
  assert.notEqual(fromGit, fromNode);
  assert.match(fromGit, /^TLS interception detected — set GIT_SSL_CAINFO/);
  assert.match(fromNode, /^TLS interception detected — export NODE_EXTRA_CA_CERTS/);
  for (const s of [fromGit, fromNode]) {
    assert.match(s, /NODE_EXTRA_CA_CERTS/);
    assert.match(s, /sslCAInfo/);
  }
});

test('every CERT_ code is a TLS diagnosis, not a generic one', () => {
  for (const code of ['CERT_HAS_EXPIRED', 'CERT_UNTRUSTED', 'UNABLE_TO_VERIFY_LEAF_SIGNATURE',
    'SELF_SIGNED_CERT_IN_CHAIN', 'DEPTH_ZERO_SELF_SIGNED_CERT']) {
    assert.match(classifyNetFailure({ code }, { host: 'github.com' }), /TLS interception detected/,
      `${code} was not classified as TLS`);
  }
});

test('a proxy password never reaches a sentence, through either path', () => {
  const proxy = 'http://someone:hunter2@proxy.example:8080';
  const sentence = classifyNetFailure({ code: 'ECONNREFUSED' }, { host: 'github.com', proxy });
  assert.ok(!sentence.includes('hunter2'), sentence);
  assert.match(sentence, /proxy\.example:8080/, 'the address is the point of the message');
  // And the redactor agrees: the sentence is already safe before it is printed, and printing it
  // does not change it. Two layers, and the assertion is that they do not disagree.
  assert.equal(redact(sentence), sentence);
  assert.equal(SENTENCE.maskProxy(proxy), 'http://***@proxy.example:8080');
});

test('NO_PROXY is honoured, with the rules every other tool uses', () => {
  assert.equal(bypassesProxy('github.com', '*'), true);
  assert.equal(bypassesProxy('github.com', 'github.com'), true);
  assert.equal(bypassesProxy('api.github.com', '.github.com'), true);
  assert.equal(bypassesProxy('api.github.com', 'github.com'), true);
  assert.equal(bypassesProxy('github.com', 'example.org'), false);
  assert.equal(bypassesProxy('notgithub.com', 'github.com'), false, 'a suffix is not a substring');

  const env = { HTTPS_PROXY: 'http://p:8080' };
  assert.equal(proxyFor('github.com', env), 'http://p:8080');
  assert.equal(proxyFor('github.com', { ...env, NO_PROXY: 'github.com' }), null);
  assert.equal(proxyFor('github.com', { https_proxy: 'http://lower:3128' }), 'http://lower:3128');
  assert.equal(proxyFor('github.com', {}), null);
});

test('AC 4 — an unreachable proxy is named as the proxy, not as being offline', async () => {
  const port = await closedPort();
  const proxy = `http://127.0.0.1:${port}`;
  const r = await probeNetwork({ env: { HTTPS_PROXY: proxy }, timeoutMs: 2000 });
  assert.equal(r.ok, false);
  assert.match(r.detail, new RegExp(`cannot reach proxy 127\\.0\\.0\\.1:${port} \\(HTTPS_PROXY\\)`));
  assert.match(r.detail, /unset HTTPS_PROXY \/ add github\.com to NO_PROXY/);
  assert.ok(!/offline/.test(r.detail), 'with a proxy set, "are you offline" is the wrong question');
});

test('AC 4 — a TLS-intercepting server gets the CA remedy, not a DNS one', { skip:
  spawnSync('openssl', ['version'], { stdio: 'ignore' }).status === 0
    ? false : 'openssl is not on PATH to make a fixture certificate' }, async () => {
  // A real handshake against a real untrusted certificate, generated here and never committed:
  // a private key in the repository would be a credential-shaped file in a repository whose whole
  // discipline is not having one.
  const dir = mkdtempSync(join(tmpdir(), 'snowarch-tls-'));
  try {
    execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes',
      '-keyout', join(dir, 'k.pem'), '-out', join(dir, 'c.pem'), '-days', '1',
      '-subj', '/CN=localhost'], { stdio: 'ignore' });
    const server = createHttpsServer(
      { key: readFileSync(join(dir, 'k.pem')), cert: readFileSync(join(dir, 'c.pem')) },
      (req, res) => { res.writeHead(200); res.end(); });
    await new Promise((res) => server.listen(0, '127.0.0.1', res));
    const { port } = server.address();
    try {
      const r = await probeNetwork({ target: `https://127.0.0.1:${port}/`, env: {}, timeoutMs: 4000 });
      assert.equal(r.ok, false);
      assert.match(r.detail, /^TLS interception detected — export NODE_EXTRA_CA_CERTS/);
    } finally {
      await new Promise((res) => server.close(res));
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('AC 4 — a DNS failure, injected rather than resolved', () => {
  // Injected through the seam on purpose: a corporate resolver that answers for every name would
  // make a `.invalid` hostname resolve, and the test would pass while proving nothing.
  assert.equal(classifyNetFailure({ code: 'ENOTFOUND' }, { host: 'github.com' }),
    'cannot reach github.com (DNS) — check your network and re-run');
  assert.equal(classifyNetFailure({ code: 'EAI_AGAIN' }, { host: 'github.com' }),
    'cannot reach github.com (DNS) — check your network and re-run');
});

test('with no proxy, an unreachable host asks the question that fits', async () => {
  const port = await closedPort();
  const r = await probeNetwork({ target: `https://127.0.0.1:${port}/`, env: {}, timeoutMs: 2000 });
  assert.equal(r.ok, false);
  assert.match(r.detail, /^no route to 127\.0\.0\.1 — are you offline, or is a firewall blocking 443\?$/);
});

test('any 2xx or 3xx is a pass — this asks whether the wall is there, not what the page says', async () => {
  const fake = (options, cb) => {
    const res = { statusCode: options.__status, resume() {} };
    queueMicrotask(() => cb(res));
    return { on() {}, end() {}, destroy() {} };
  };
  for (const status of [200, 204, 301, 302, 308]) {
    const r = await probeNetwork({ env: {}, request: (o, cb) => fake({ ...o, __status: status }, cb) });
    assert.equal(r.ok, true, `HTTP ${status} should pass`);
  }
  const bad = await probeNetwork({ env: {}, request: (o, cb) => fake({ ...o, __status: 503 }, cb) });
  assert.equal(bad.ok, false);
  assert.match(bad.detail, /answered HTTP 503/);
});

test('the CONNECT request carries no credentials, ever', async () => {
  // A proxy that needs authentication is a case this reports rather than solves: assembling a
  // header from the operator's environment would mean this module handling a password.
  const seen = [];
  const server = createTcpServer((socket) => {
    socket.on('data', (c) => { seen.push(c.toString('latin1')); socket.destroy(); });
  });
  await new Promise((res) => server.listen(0, '127.0.0.1', res));
  const { port } = server.address();
  try {
    await probeNetwork({ env: { HTTPS_PROXY: `http://user:secretpw@127.0.0.1:${port}` },
      timeoutMs: 2000 });
  } finally {
    await new Promise((res) => server.close(res));
  }
  assert.ok(seen.length > 0, 'the proxy fixture saw nothing — this test proved nothing');
  const request = seen.join('');
  assert.match(request, /^CONNECT github\.com:443 HTTP\/1\.1/);
  assert.ok(!/secretpw/.test(request), request);
  assert.ok(!/Authorization/i.test(request), 'no credentials are sent, so no header is built');
});
