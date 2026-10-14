// Copyright 2026 Cvetomir Grigorov. Licensed under the Apache License, Version 2.0 (see LICENSE).
// snowarch — AI ServiceNow Architect. Not affiliated with or endorsed by ServiceNow, Inc.
import { afterAll, describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { remedyFor } from '../../src/errors/codes.js';
import { bootstrapSpelling, cliSpelling } from '../../src/cli/tty.js';
import { NO_INSTANCE_MESSAGE } from '../../src/no-instance.js';
import { removeTempDir, trackTempDir } from '../helpers/server-child.js';
import { licenceFixture, licensedEnv } from '../../../../tools/snowarch/tests/helpers/licence-hook/index.mjs';
import { releaseCheckout } from './fixtures.js';
import { readFileSync, writeFileSync } from 'node:fs';

/**
 * ARC-11-C6 step 4b — the package CLI is the product's second door, and it refuses what ./snowarch refuses.
 *
 * `dist/cli/index.js` is the npm package's `bin`, and ./snowarch forwards `instance` and `store` to it. With the
 * refusal at ./snowarch's door only, `node packages/snowarch/dist/cli/index.js instance add` was the way round
 * it. One set and one decision (`src/licence/gate.ts`, ruling R3), with the licence read where the server reads
 * it: CLAUDE_PROJECT_DIR, else the working directory. `doctor` runs, as at ./snowarch, because seeing the state
 * is how a person repairs it.
 */
const here = dirname(fileURLToPath(import.meta.url));
const CLI = resolve(here, '../../dist/cli/index.js');

const base = trackTempDir(mkdtempSync(join(tmpdir(), 'snowarch-package-cli-')));
afterAll(() => { removeTempDir(base); });

/** The fixture's keys trusted (the hook) and no licence in the project: the state is `missing`. */
const unlicensed = (args: readonly string[]) => spawnSync(process.execPath, [CLI, ...args], {
  encoding: 'utf8', cwd: base, timeout: 30_000,
  env: licensedEnv({ ...process.env, CLAUDE_PROJECT_DIR: join(base, 'none'),
    SNOW_STORE: join(base, 'none', 'instances.json') }, { licence: false }),
});

const { meaning, remedy } = remedyFor('LICENCE_NOT_VALID', { cli: cliSpelling(), bootstrap: bootstrapSpelling() });

describe('ARC-11-C6 step 4b — with no licence in force, the package CLI refuses what ./snowarch refuses', () => {
  it('instance list exits 3, naming the state and LICENCE_NOT_VALID with its meaning and remedy, and prints nothing on stdout', () => {
    const r = unlicensed(['instance', 'list']);
    expect(r.status).toBe(3);
    expect(r.stdout).toBe('');
    expect(r.stderr).toContain('snowarch instance: licence missing (Code: LICENCE_NOT_VALID)');
    expect(r.stderr).toContain(meaning);
    expect(r.stderr).toContain(remedy);
  });

  it.each([
    [['start']],
    [['store', 'migrate', '--dry-run']],
    [['contract', '--sha']],
    // A raw command's own help belongs to the command, so it is refused as `./snowarch instance --help` is.
    [['instance', '--help']],
  ])('%j is refused the same way, and runs nothing', (args) => {
    const r = unlicensed(args);
    expect(r.status).toBe(3);
    expect(r.stdout).toBe('');
    expect(r.stderr).toContain(`snowarch ${args[0]}: licence missing (Code: LICENCE_NOT_VALID)`);
    expect(r.stderr).toContain(remedy);
  });

  it('doctor runs: seeing the state is how a person repairs it', () => {
    const r = unlicensed(['doctor', '--no-network', '--json']);
    expect(r.status).not.toBe(3);
    expect(r.stderr).not.toContain('Code: LICENCE_NOT_VALID');
    expect(JSON.parse(r.stdout).product).toBe('snowarch');
  });

  it('help, the version, a command\'s own help and a bare call are answered before the door', () => {
    const help = unlicensed(['--help']);
    expect(help.status).toBe(0);
    expect(help.stdout).toContain('Usage: snowarch');
    const version = unlicensed(['--version']);
    expect(version.status).toBe(0);
    expect(version.stdout.trim()).toMatch(/^\d+\.\d+\.\d+/);
    const own = unlicensed(['contract', '--help']);
    expect(own.status).toBe(0);
    expect(own.stdout).toContain('Usage: snowarch contract');
    const bare = unlicensed([]);
    expect(bare.stderr).toContain('Usage: snowarch');
    for (const r of [help, version, own, bare]) expect(`${r.stdout}${r.stderr}`).not.toContain('LICENCE_NOT_VALID');
  });
});

describe('ARC-11-C6 step 4b — with a licence in force, the package CLI runs as it always has', () => {
  it('instance list answers with no instance configured', () => {
    const r = spawnSync(process.execPath, [CLI, 'instance', 'list'], {
      encoding: 'utf8', cwd: base, timeout: 30_000,
      env: licensedEnv({ ...process.env, CLAUDE_PROJECT_DIR: join(base, 'licensed'),
        SNOW_STORE: join(base, 'licensed', 'instances.json') }),
    });
    expect(r.status).toBe(0);
    expect(r.stdout).toContain(NO_INSTANCE_MESSAGE(cliSpelling()));
    expect(r.stderr).not.toContain('LICENCE_NOT_VALID');
  });
});

describe('ARC-11-C141 — the package CLI is the same door for the checkout\'s own files', () => {
  /** A licensed release checkout whose manifest is signed by the key the child trusts (the hook's). */
  const run = (root: string, args: readonly string[]) => spawnSync(process.execPath, [CLI, ...args], {
    encoding: 'utf8', cwd: root, timeout: 30_000,
    env: licensedEnv({ ...process.env, CLAUDE_PROJECT_DIR: root, SNOW_STORE: join(root, '.local', 'instances.json'),
      SNOW_AUDIT_FILE: join(base, 'c141-audit.jsonl') }),
  });

  it('a tree that cannot be restored: instance list exits 3 with INTEGRITY_NOT_VERIFIED and the line; doctor runs', () => {
    const root = releaseCheckout({ key: licenceFixture().primary, cache: false });
    const r = run(root, ['instance', 'list']);
    expect(r.status).toBe(3);
    expect(r.stderr).toContain("snowarch instance: this command does not run while the AI Architect's own files cannot be restored (Code: INTEGRITY_NOT_VERIFIED)");
    expect(r.stderr).toContain('Integrity: cannot restore — no signed manifest for v9.1.0 — ');
    expect(r.stdout).toBe('');
    expect(run(root, ['doctor']).stderr).not.toContain('INTEGRITY_NOT_VERIFIED');
  });

  it('a changed file is put back before the command, which then runs', () => {
    const root = releaseCheckout({ key: licenceFixture().primary });
    writeFileSync(join(root, 'CLAUDE.md'), 'my architect\n');
    const r = run(root, ['instance', 'list']);
    expect(r.status).toBe(0);
    expect(r.stderr).toMatch(/^Integrity: restored — The AI Architect's own files are not yours to change under this licence: 1 file restored from v9\.1\.0, /m);
    expect(readFileSync(join(root, 'CLAUDE.md'), 'utf8')).toBe('# signed\n');
  });
});
