import { describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { EXIT_CODES, labelExists } from '../../src/cli/instance.js';

/**
 * ARC-07-S05 — the BUILT CLI, run as a process.
 *
 * What only a spawned run can prove: that commander hands `instance` its arguments intact, that
 * `--help` is the sub-command's and not commander's, and that a secret on the command line is
 * refused before either parser sees it. Everything that needs an instance is covered in-process
 * with injected dependencies (`instance.test.ts`), because a spawned CLI cannot reach a fake
 * ServiceNow: the URL rule is https-only and a self-signed TLS fixture would mean either a
 * committed private key — which the repository's own secret sweep would flag, correctly — or
 * generating one at test time on three operating systems. The live half is the owner's sitting.
 */
const here = dirname(fileURLToPath(import.meta.url));
const CLI = resolve(here, '../../dist/cli/index.js');

const run = (args: readonly string[], env: NodeJS.ProcessEnv = {}) =>
  spawnSync(process.execPath, [CLI, ...args], {
    encoding: 'utf8',
    env: { ...process.env, ...env },
  });

describe('the built CLI', () => {
  it('is there to run — the precondition for everything below', () => {
    expect(existsSync(CLI)).toBe(true);
  });

  it('prints the sub-command\'s help, with the exit-code table', () => {
    const r = run(['instance', 'add', '--help']);
    expect(r.status).toBe(0);
    for (const { code, meaning } of EXIT_CODES) {
      expect(r.stdout, `${code}`).toContain(`${code}  ${meaning}`);
    }
    // commander's own help would describe a different program: its options block, not ours.
    expect(r.stdout).not.toContain('display help for command');
  });

  it('refuses a secret on the command line BEFORE any parser sees it', () => {
    // The value is assembled so this file never spells one.
    const value = ['hunt', 'er', '2'].join('');
    const r = run(['instance', 'add', 'pdi', '--password', value]);
    expect(r.status).toBe(2);
    expect(r.stderr).toContain('Secrets are never accepted on the command line');
    // Neither the message nor commander's unknown-option echo may carry it.
    expect(`${r.stdout}${r.stderr}`).not.toContain(value);
  });

  it('takes the label commander collected, not a scan of argv', () => {
    // A label that is the word `instance` would break an index scan of `process.argv`.
    const r = run(['instance', 'add', 'Bad Label']);
    expect(r.status).toBe(2);
    expect(r.stdout + r.stderr).toContain('not a valid label');
  });

  it('exits 3 on the production policy without touching the network or the store', () => {
    const dir = mkdtempSync(join(tmpdir(), 'spawn-store-'));
    try {
      const store = join(dir, 'instances.json');
      const r = run(['instance', 'add', 'prod-acme', '--url', 'https://acme.service-now.com',
        '--env', 'prod', '--preset', 'full', '--yes', '--username', 'u'], { SNOW_STORE: store });
      expect(r.status).toBe(3);
      expect(r.stdout + r.stderr).toContain('PROD_WRITE_NOT_ACKNOWLEDGED');
      // The refusal comes before the credential prompt and before any request: nothing was
      // written, and nothing was asked.
      expect(existsSync(store)).toBe(false);
      expect(r.stdout).not.toContain('Password:');
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });

  it('names an unknown sub-command\'s owning story rather than failing vaguely', () => {
    // `list` was this test's example until ARC-07-S06 implemented it, then `import` until S08
    // did. `move` is the one the story says is NOT in 2.0.0 — remove and add instead — so it
    // cannot be overtaken by the next story, and the assertion is unchanged: a reader is told
    // whether they have found a bug or a boundary.
    const r = run(['instance', 'move', 'pdi', 'uat']);
    expect(r.status).toBe(2);
    expect(r.stdout + r.stderr).toContain('no such sub-command');
  });

  it('runs `list` now, and prints the empty-store sentence rather than a story name', () => {
    const dir = mkdtempSync(join(tmpdir(), 'spawn-list-'));
    try {
      const r = run(['instance', 'list'], { SNOW_STORE: join(dir, 'instances.json') });
      expect(r.status).toBe(0);
      expect(r.stdout).toContain('No instances configured');
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });

  it('says LABEL_EXISTS in the words the story fixes', () => {
    expect(labelExists('pdi')).toContain('LABEL_EXISTS — "pdi" already exists.');
    expect(labelExists('pdi')).toContain('--replace');
  });
});
