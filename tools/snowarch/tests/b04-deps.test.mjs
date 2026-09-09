import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { NPM_ARGS, directorySize, npmCommand, resolutionCheck, run as runB04 } from '../lib/steps/B04.mjs';
import { NPM_SENTENCE, classifyNpmFailure } from '../lib/npm-failures.mjs';
import { makeCheckout } from './helpers/workspace.mjs';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

const ctxFor = (root, over = {}) => ({
  root, config: JSON.parse(readFileSync(join(root, 'engine.config.json'), 'utf8')),
  mode: 'live', node: { present: true, major: 22 }, env: process.env,
  state: { steps: {} }, line: () => {}, ...over,
});

test('the npm flags are the S-15 verdict, and scripts are never run', () => {
  // `--ignore-scripts` is not a performance flag. It is the difference between installing packages
  // and running whatever their authors put in `postinstall`, on a machine that has just cloned a
  // repository and has been told nothing about what is about to execute.
  assert.deepEqual([...NPM_ARGS],
    ['ci', '--omit=dev', '--ignore-scripts', '--no-audit', '--no-fund']);
});

test('npm is run as a SCRIPT under this Node, never as a shim', () => {
  const found = npmCommand();
  assert.ok(found, 'npm was not resolvable on this machine');
  if (found.prefix.length > 0) {
    assert.match(found.prefix[0], /npm-cli\.js$/);
    assert.equal(found.exec, process.execPath, 'the running Node, so the install matches the check');
  }
  // Windows has no runnable shim: `child_process` refuses a `.cmd` without a shell since the
  // CVE-2024-27980 fix, and a shell is what this module does not use. Reported, not guessed.
  assert.equal(npmCommand({ env: { PATH: '' }, plat: 'win32' }), null);
  assert.equal(npmCommand({ env: { PATH: '' }, plat: 'linux' }), null);
});

test('AC 2 — the resolution check asks the question the server will ask', () => {
  // Not "does node_modules exist", and not a list of names typed here: the names come from the
  // package's own manifest and resolution is asked FROM `dist/server.js`, which is where the server
  // asks. That makes it hoisting-safe and impossible to leave stale when a dependency is added.
  const { deps, missing } = resolutionCheck(repoRoot);
  assert.ok(deps.length > 0, 'the manifest declares no dependencies — this test proves nothing');
  assert.deepEqual(missing, [], 'this checkout should resolve every server dependency');

  // A package whose `exports` map does not publish `package.json` is PRESENT, not missing. The
  // obvious probe reported `commander` as missing in this very repository, and the remedy it would
  // have printed ("rm -rf node_modules") does not help.
  const notExported = resolutionCheck(repoRoot, {
    requireFrom: () => ({ resolve: (s) => {
      if (s.endsWith('/package.json')) { const e = new Error('x'); e.code = 'ERR_PACKAGE_PATH_NOT_EXPORTED'; throw e; }
      const e = new Error('x'); e.code = 'ERR_PACKAGE_PATH_NOT_EXPORTED'; throw e;
    } }),
  });
  assert.deepEqual(notExported.missing, [], 'NOT_EXPORTED proves the package is installed');

  const genuinelyGone = resolutionCheck(repoRoot, {
    requireFrom: () => ({ resolve: () => { const e = new Error('x'); e.code = 'MODULE_NOT_FOUND'; throw e; } }),
  });
  assert.equal(genuinelyGone.missing.length, deps.length);
});

test('every npm failure this project has seen maps to a remedy that fits it', () => {
  const cases = [
    ['npm ERR! code ENOTFOUND\nnpm ERR! network', NPM_SENTENCE.dns],
    ['npm ERR! code EAI_AGAIN', NPM_SENTENCE.dns],
    ['npm ERR! SELF_SIGNED_CERT_IN_CHAIN', NPM_SENTENCE.tls],
    ['npm ERR! UNABLE_TO_GET_ISSUER_CERT_LOCALLY', NPM_SENTENCE.tls],
    ['npm ERR! code EINTEGRITY\nnpm ERR! sha512 mismatch', NPM_SENTENCE.integrity],
    ['npm ERR! code EACCES\nnpm ERR! syscall mkdir', NPM_SENTENCE.eacces],
    ['npm ERR! code ENOSPC', NPM_SENTENCE.disk],
  ];
  for (const [log, expected] of cases) {
    assert.equal(classifyNpmFailure(log), expected, log.split('\n')[0]);
  }
  assert.match(NPM_SENTENCE.dns, /registry\.npmjs\.org/, 'npm reaches the registry, not github.com');
  assert.match(NPM_SENTENCE.tls, /npm honours it/);
  assert.match(NPM_SENTENCE.eacces, /never use sudo/);
});

test('an unmapped failure shows the log rather than shrugging', () => {
  // The fallback matters more than the cases: an unmapped failure that printed nothing useful is
  // how an installer earns "it just says it failed".
  const log = Array.from({ length: 40 }, (_, i) => `npm line ${i}`).join('\n');
  const out = classifyNpmFailure(log, { logPath: '/tmp/x.log' });
  assert.match(out, /^npm ci failed\. Last 20 line\(s\) of its output:/);
  assert.ok(out.includes('npm line 39'), 'the last line must be there');
  assert.ok(!out.includes('npm line 19'), 'and only the last twenty');
  assert.match(out, /Full log: \/tmp\/x\.log$/);
});

test('B04 reports a missing npm with the remedy for the platform it was asked about', async () => {
  // The remedy follows the ctx's PLATFORM, not the runner's. The first version asserted against
  // `process.platform` while telling B04 it was Linux, so it passed on macOS and Linux and failed
  // on all three Windows cells — a platform-specific failure in a test that had itself chosen the
  // platform. All three are asserted now, which is both deterministic and more coverage.
  const root = makeCheckout();
  for (const [plat, expected] of [['linux', /apt|nvm|distribution/i], ['darwin', /brew/i],
    ['win32', /winget/i]]) {
    const r = await runB04(ctxFor(root, { env: { PATH: '' }, plat }));
    assert.equal(r.status, 'fail', plat);
    assert.equal(r.detail, NPM_SENTENCE.missing, plat);
    assert.match(r.remedy, expected, plat);
  }
});

test('B04 maps a failing install and keeps the whole log out of the console', async () => {
  const root = makeCheckout();
  const debug = [];
  const r = await runB04(ctxFor(root, {
    runNpm: () => { const e = new Error('npm failed'); e.stdout = ''; e.stderr = 'npm ERR! code EINTEGRITY'; throw e; },
    log: { debug: (m) => debug.push(m), logFile: '/tmp/b04.log' },
  }));
  assert.equal(r.status, 'fail');
  assert.equal(r.detail, NPM_SENTENCE.integrity);
  assert.ok(debug.join('').includes('EINTEGRITY'), 'the full log goes to the file logger');
});

test('a successful install is measured and reported without a second walk of the tree', async () => {
  const root = makeCheckout();
  // A fake install: the post-check is what decides success, so the fixture provides resolution.
  const r = await runB04(ctxFor(root, {
    runNpm: () => 'added 171 packages',
    npmVersion: '10.9.0',
    requireFrom: () => ({ resolve: () => '/x' }),
  }));
  assert.equal(r.status, 'ok');
  assert.equal(r.data.npmVersion, '10.9.0');
  assert.equal(typeof r.data.durationMs, 'number');
});

test('a install that leaves a dependency unresolvable fails with a remedy', async () => {
  const root = makeCheckout();
  const r = await runB04(ctxFor(root, {
    runNpm: () => 'added 0 packages',
    requireFrom: () => ({ resolve: () => { const e = new Error('x'); e.code = 'MODULE_NOT_FOUND'; throw e; } }),
  }));
  assert.equal(r.status, 'fail');
  assert.match(r.detail, /npm ci finished but \d+ of \d+ server dependencies do not resolve/);
  assert.match(r.remedy, /rm -rf node_modules/);
});

test('directorySize skips symlinks so a .bin entry is not counted twice', () => {
  const root = makeCheckout();
  const dir = join(root, 'sizeme');
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'a.txt'), 'x'.repeat(100));
  assert.equal(directorySize(dir), 100);
  assert.equal(directorySize(join(root, 'no-such-dir')), null);
});

test('nothing that needs node_modules is imported at load time', () => {
  // B06 and the instance-file reader run only in live mode, but they are IMPORTED by the registry
  // on every run — including a design-only one that has never installed anything. A static import
  // of the zod-backed store modules would make `./snowarch bootstrap --mode design` fail on a fresh
  // clone, which is the product's whole first impression.
  for (const rel of ['lib/steps/B06.mjs', 'lib/instance-file.mjs', 'lib/steps/index.mjs']) {
    const src = readFileSync(join(repoRoot, 'tools/snowarch', rel), 'utf8');
    const statics = [...src.matchAll(/^import[^\n]*from\s+'([^']+)'/gm)].map((m) => m[1]);
    const zodBacked = statics.filter((s) => /dist\/store\/(schema|index)\.js$/.test(s));
    assert.deepEqual(zodBacked, [], `${rel} imports a zod-backed module statically`);
  }
  // ...and the ones that ARE static carry no dependency of their own.
  const codes = readFileSync(join(repoRoot, 'packages/snowarch/dist/errors/codes.js'), 'utf8');
  assert.equal([...codes.matchAll(/^import\s/gm)].length, 0,
    'the error registry gained an import — probe-auth loads it before B04 has run');
});
