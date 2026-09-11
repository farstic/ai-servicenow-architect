import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { CredentialPatchRefused, loadStore, updateInstance } from '../../src/store/index.js';

/**
 * ARC-08-S06 AC 8's server half — the door the doctor's F4 goes through, and what it refuses.
 *
 * The guard lives HERE rather than in the fixer, because a rule enforced by the caller is a rule
 * that holds until the next caller. A patch naming a credential is refused whatever asked for it.
 */
const FIXTURE_USER = 'someone@corp.example.com';
const FIXTURE_PASS = ['hunter', '2', 'hunter', '2'].join('');

let dir: string;
let path: string;

const entry = () => ({
  url: 'https://dev12345.service-now.com',
  environment: 'pdi',
  auth: { method: 'basic', username: FIXTURE_USER, password: FIXTURE_PASS },
  preset: 'custom',
  flags: { WRITE_ENABLED: 'false' },
  toolPackage: 'full',
  maxRecords: 100,
  prodWriteAck: false,
});

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'snowarch-store-'));
  mkdirSync(join(dir, '.local'), { recursive: true, mode: 0o700 });
  path = join(dir, '.local', 'instances.json');
  writeFileSync(path, `${JSON.stringify({ version: 1, defaultInstance: 'pdi',
    instances: { pdi: entry() } }, null, 2)}\n`, { mode: 0o600 });
  chmodSync(path, 0o600);
});
afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

describe('updateInstance', () => {
  it('writes the patch, keeps the credentials, and leaves the file at 0600', () => {
    const before = readFileSync(path, 'utf8');
    expect(before).toContain(FIXTURE_PASS);         // the precondition this case is about

    const result = updateInstance(path, 'pdi', {
      flags: { WRITE_ENABLED: 'false', SCRIPTING_ENABLED: 'false' },
    });
    expect('error' in result).toBe(false);

    const loaded = loadStore(path);
    expect('error' in loaded).toBe(false);
    const after = (loaded as { store: { instances: Record<string, ReturnType<typeof entry>> } })
      .store.instances.pdi;
    expect(Object.keys(after.flags)).toHaveLength(2);
    expect(after.auth.password).toBe(FIXTURE_PASS);
    expect(after.auth.username).toBe(FIXTURE_USER);
    if (process.platform !== 'win32') {
      expect(statSync(path).mode & 0o777).toBe(0o600);
    }
  });

  it('refuses a patch that names a credential, whatever asked for it', () => {
    for (const key of ['auth', 'password', 'clientSecret', 'clientId']) {
      expect(() => updateInstance(path, 'pdi', { [key]: 'anything' }))
        .toThrow(CredentialPatchRefused);
    }
    // And the file is untouched by the refusal.
    expect(readFileSync(path, 'utf8')).toContain(FIXTURE_PASS);
  });

  it('says when there is no such entry rather than creating one', () => {
    const result = updateInstance(path, 'nope', { flags: {} });
    expect(result).toEqual({ unknownInstance: 'nope' });
    const loaded = loadStore(path) as { store: { instances: Record<string, unknown> } };
    expect(Object.keys(loaded.store.instances)).toEqual(['pdi']);
  });
});
