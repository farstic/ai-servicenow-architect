import { describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { LIVE, liveConfig } from './env.js';
import { findSecret, redact, secretForms } from './redact.js';

/**
 * ARC-07-S11, AC 1 — the live suite is SKIPPED in an ordinary run, and reaches that decision
 * without touching the network.
 *
 * "Skipped" and "passed" look identical in a summary line, which is exactly how a suite that
 * quietly stopped running goes unnoticed for a release. So this asserts the reporter's own numbers:
 * a nested vitest run of the live file, with the gate off and `fetch` replaced by a thrower, must
 * report skipped > 0 and passed === 0 — and the thrower must never have been called.
 */
const here = dirname(fileURLToPath(import.meta.url));
const pkg = resolve(here, '../..');
const LIVE_FILE = 'tests/e2e/instance-wizard.e2e.test.ts';

describe('AC 1 — no live case runs, and no request is made, without the gate', () => {
  it('the ordinary run has the gate off', () => {
    // The precondition every other assertion here depends on. If a developer exported the gate in
    // their shell, this says so rather than letting the next assertion pass for the wrong reason.
    expect(process.env.RUN_LIVE_E2E, 'RUN_LIVE_E2E is set in this run').not.toBe('1');
    expect(LIVE).toBe(false);
    expect(liveConfig()).toBeNull();
  });

  it('the reporter says SKIPPED, not passed — and the fetch stub was never called', () => {
    const dir = mkdtempSync(join(tmpdir(), 'e2e-gate-'));
    try {
      // `fetch` replaced before anything imports, through `--import`: vitest's CLI has no
      // `--setupFiles` flag in this version, and a config file would need its own root resolution.
      // If the live file so much as resolves a URL while deciding to skip, the child writes the
      // marker and throws, and this test says which.
      const marker = join(dir, 'fetch-was-called');
      const setup = join(dir, 'no-network.mjs');
      writeFileSync(setup, [
        "import { writeFileSync } from 'node:fs';",
        `const marker = ${JSON.stringify(marker)};`,
        'globalThis.fetch = () => {',
        '  writeFileSync(marker, "called");',
        '  throw new Error("fetch was called without RUN_LIVE_E2E");',
        '};',
      ].join('\n'));
      const report = join(dir, 'report.json');

      const vitest = resolve(pkg, '../../node_modules/vitest/vitest.mjs');
      const run = spawnSync(process.execPath, [vitest, 'run', LIVE_FILE,
        '--reporter=json', '--outputFile', report], {
        cwd: pkg,
        encoding: 'utf8',
        env: {
          ...process.env,
          RUN_LIVE_E2E: '',
          SNOWARCH_FETCH_MARKER: marker,
          CI: '1',
          NODE_OPTIONS: `${process.env.NODE_OPTIONS ?? ''} --import ${pathToFileURL(setup).href}`.trim(),
        },
      });
      expect(run.status, `${run.stdout}\n${run.stderr}`).toBe(0);

      const json = JSON.parse(readFileSync(report, 'utf8')) as
        { numPassedTests: number; numPendingTests: number; numTotalTests: number };
      // PENDING is vitest's word for skipped. Passed must be zero: a live case that "passed"
      // without an instance is a case that asserted nothing.
      expect(json.numPendingTests, 'no live case was reported as skipped').toBeGreaterThan(0);
      expect(json.numPassedTests, 'a live case ran without the gate').toBe(0);
      expect(existsSync(marker), 'fetch was called while the gate was off').toBe(false);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  }, 180_000);
});

describe('the redactor — the artefact side of the same promise', () => {
  const fixture = {
    username: 'e2e.user',
    password: ['pw', '-', 'fixture'].join(''),
    clientSecret: ['cs', '-', 'fixture'].join(''),
    url: 'https://dev12345.service-now.com',
  };

  it('replaces the value, its base64 and the basic-auth header form', () => {
    const header = Buffer.from(`${fixture.username}:${fixture.password}`).toString('base64');
    const transcript = `Authorization: Basic ${header}\ntyped: ${fixture.password}\n`
      + `b64: ${Buffer.from(fixture.password).toString('base64')}\n`;
    const clean = redact(transcript, fixture);
    expect(clean).not.toContain(fixture.password);
    expect(clean).not.toContain(header);
    expect(clean).toContain('***');
    // And the finder agrees about the RAW text — the assertions run before redaction, always.
    expect(findSecret(transcript, fixture)).not.toBeNull();
    expect(findSecret(clean, fixture)).toBeNull();
  });

  it('keeps the URL and the account out of a committed record, without calling them secrets', () => {
    expect(redact(`store at ${fixture.url}`, fixture)).not.toContain(fixture.url);
    // The username alone is not treated as a leak by the FINDER — the prompt echoes it — but it is
    // still redacted out of anything written down. Whose PDI this was is not a product fact.
    expect(findSecret(`user ${fixture.username}`, fixture)).toBeNull();
    expect(redact(`user ${fixture.username}`, fixture)).not.toContain(fixture.username);
  });

  it('ignores values too short to be distinctive', () => {
    // A three-character "secret" would redact half the transcript, including the word it appears
    // inside. Forms shorter than four characters are dropped rather than applied.
    expect(secretForms({ password: 'abc', username: 'u' })).not.toContain('abc');
  });
});

function existsSync(p: string): boolean {
  try { readFileSync(p); return true; } catch { return false; }
}
