#!/usr/bin/env node
/**
 * A throwaway certificate for a loopback fixture, made where openssl is still on PATH.
 *
 * ARC-09-S08. The `windows-native` cell strips Git Bash from PATH, and on Windows `openssl.exe`
 * lives in `Git\usr\bin` — the same directory as the `bash.exe` the cell exists to remove. So the
 * certificate is made in an earlier step, with the ordinary PATH, and its paths are handed on.
 * Making a certificate is not what that cell is testing; having no Git Bash is.
 *
 * Never committed. A private key in a repository whose whole discipline is not having one would be
 * a credential-shaped file in it, whatever the comment above it said — so this writes to a
 * directory the job throws away and prints the two paths for the step that needs them.
 *
 * Usage: node scripts/ci/make-fixture-cert.mjs [--out <dir>]  (default: RUNNER_TEMP or a temp dir)
 * Exit 0 written · 2 openssl is not here.
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { appendFileSync, existsSync, mkdirSync, mkdtempSync, writeSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const argv = process.argv.slice(2);
const value = (n, d) => (argv.indexOf(n) === -1 ? d : argv[argv.indexOf(n) + 1]);

if (spawnSync('openssl', ['version'], { stdio: 'ignore' }).status !== 0) {
  writeSync(2, 'make-fixture-cert: openssl is not on PATH — run this step before the PATH is '
    + 'stripped, or install it\n');
  process.exit(2);
}

const out = value('--out', process.env.RUNNER_TEMP ?? mkdtempSync(join(tmpdir(), 'snowarch-cert-')));
if (!existsSync(out)) mkdirSync(out, { recursive: true });
const key = join(out, 'fixture-key.pem');
const cert = join(out, 'fixture-cert.pem');

// One day, no passphrase: it exists for the length of one job and is trusted only through
// NODE_EXTRA_CA_CERTS by the child that needs it.
//
// The SAN is not optional, and a CN alone is not a substitute. The stub listens on 127.0.0.1 and
// its URL says so, and a certificate whose only name is `localhost` does not validate for an IP —
// the connection fails, undici reports no response, and the wizard says CONNECTION_TIMEOUT, which
// sends a reader looking for a network problem that does not exist. Measured exactly that way
// before the `-addext` line was added.
execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes',
  '-keyout', key, '-out', cert, '-days', '1', '-subj', '/CN=localhost',
  '-addext', 'subjectAltName=DNS:localhost,IP:127.0.0.1'], { stdio: 'ignore' });

writeSync(1, `make-fixture-cert: ${cert}\n`);
if (process.env.GITHUB_ENV) {
  appendFileSync(process.env.GITHUB_ENV, `SNOWARCH_FIXTURE_CERT=${cert}\nSNOWARCH_FIXTURE_KEY=${key}\n`);
}
