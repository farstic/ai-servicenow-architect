/**
 * ARC-07-C3 — the confirm that authorised a second failed login.
 *
 * Sitting C, T-19, rc.5. One character was changed in the stored password; a read returned
 * AUTHENTICATION_FAILED and the session stopped, correctly, printing the remedy with the label
 * filled in. The owner ran `./snowarch instance set-credentials pdi` — "Credentials updated, all
 * probes ok" — and typed `done`. The session then called `capabilities_read` to confirm, was told
 * everything was fine, retried the read, and got AUTHENTICATION_FAILED again. `./snowarch instance
 * test pdi` passed in the terminal at the same moment.
 *
 * The store was right; the running server still held what it read at startup. So the confirm was
 * the sentence that authorised the retry, and the retry was a second failed login against an
 * account whose remedy warns, in its own first line, that repeated failures can lock it. Following
 * the product exactly is what produced the harm.
 *
 * AND THE FIX EXISTED, UNNAMED. `InstanceManager.reload()` was implemented, `load()` idempotent,
 * and `snow_core_instances_reload` already shipped as one of the five tools available even with
 * nothing configured. Nothing said its name where it was needed.
 */
import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { chmodSync, mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { currentCapabilities } from '../../src/tools/status.js';
import { instanceManager } from '../../src/servicenow/instances.js';
import { ERROR_CODES } from '../../src/errors/codes.js';

let home: string;
let saved: NodeJS.ProcessEnv;

const writeStore = (marker: { preset: string; maxRecords: number }) => {
  writeFileSync(join(home, '.local', 'instances.json'), `${JSON.stringify({
    version: 1,
    defaultInstance: 'pdi',
    instances: {
      pdi: {
        url: 'https://fixture.example',
        environment: 'pdi',
        auth: { method: 'basic', username: 'someone', password: 'unused-by-this-test' },
        preset: marker.preset,
        flags: {
          WRITE_ENABLED: 'true', CMDB_WRITE_ENABLED: 'true', SCRIPTING_ENABLED: 'true',
          ATF_ENABLED: 'true', NOW_ASSIST_ENABLED: 'true', FLUENT_ENABLED: 'false',
        },
        toolPackage: 'full',
        maxRecords: marker.maxRecords,
        prodWriteAck: false,
      },
    },
  }, null, 2)}\n`);
  // 0600 or the loader refuses it (D-04, STORE_PERMISSIONS_TOO_OPEN) and every assertion below
  // would be testing the refusal rather than the reload.
  chmodSync(join(home, '.local', 'instances.json'), 0o600);
};

beforeEach(() => {
  saved = { ...process.env };
  home = mkdtempSync(join(tmpdir(), 'caps-reload-'));
  mkdirSync(join(home, '.local'), { recursive: true });
  // The same isolation `tests/doctor/sv03-sv04.test.ts` uses: the suite's setup provides
  // SERVICENOW_* env credentials, which load as an instance called `default` and would answer
  // every question here instead of the fixture store.
  process.env.HOME = home;
  process.env.USERPROFILE = home;
  process.env.APPDATA = home;
  process.env.CLAUDE_PROJECT_DIR = home;
  process.env.SNOW_STORE = join(home, '.local', 'instances.json');
  for (const k of ['SERVICENOW_INSTANCE_URL', 'SERVICENOW_BASIC_USERNAME',
    'SERVICENOW_BASIC_PASSWORD', 'SERVICENOW_OAUTH_USERNAME', 'SERVICENOW_OAUTH_PASSWORD',
    'SNOW_ENV_FILE']) delete process.env[k];
  writeStore({ preset: 'full', maxRecords: 100 });
  instanceManager.reload();
});

afterEach(() => {
  for (const k of Object.keys(process.env)) if (!(k in saved)) delete process.env[k];
  Object.assign(process.env, saved);
  instanceManager.reload();
  rmSync(home, { recursive: true, force: true });
});

describe('ARC-07-C3 — capabilities_read reports the store as it is now', () => {
  it('sees a store rewritten after the server started', () => {
    // WHAT IS BEING OBSERVED, and why it is not the credential itself: `capabilities_read` reports
    // label, url, environment, preset, flags, toolPackage, maxRecords — field by field, on purpose,
    // and never the username or the secret. So a credential change is INVISIBLE to this call by
    // design, and asserting on it would be asserting on a field that does not exist.
    //
    // What the reload actually fixes is the loaded RUNTIME, which is built from the store and
    // carries the client the credentials belong to. `preset` and `maxRecords` are the cheapest
    // proof that the runtime was rebuilt from the file rather than remembered from startup — and
    // if it was rebuilt, the credentials came with it. That is the claim, stated rather than
    // implied by a field that happens to be printed.
    const before = currentCapabilities() as { preset?: string; maxRecords?: number };
    expect(before.preset).toBe('full');
    expect(before.maxRecords).toBe(100);

    // What `set-credentials` does from the server's point of view: the file changes underneath it.
    writeStore({ preset: 'read-only', maxRecords: 25 });

    const after = currentCapabilities() as { preset?: string; maxRecords?: number };
    expect(after.preset).toBe('read-only');
    expect(after.maxRecords).toBe(25);
  });

  it('still reports an unconfigured store as unconfigured', () => {
    // Both directions: the reload must not invent an instance where the store has none.
    writeFileSync(join(home, '.local', 'instances.json'), `${JSON.stringify({ version: 1, instances: {} })}\n`);
    chmodSync(join(home, '.local', 'instances.json'), 0o600);
    const caps = currentCapabilities() as { mode?: string; instance?: unknown };
    expect(caps.mode).toBe('unconfigured');
    expect(caps.instance).toBeNull();
  });
});

describe('ARC-07-C3 — the remedy names the tool that makes a retry safe', () => {
  it('AUTHENTICATION_FAILED tells the session to reload before retrying', () => {
    const entry = ERROR_CODES.find((e) => e.code === 'AUTHENTICATION_FAILED');
    expect(entry).toBeDefined();
    expect(entry!.remedy).toContain('snow_core_instances_reload');

    // The warning it already carried must survive: this row adds a step, it does not soften the
    // stop. A remedy that named the reload but dropped "do not retry" would trade one harm for
    // another.
    expect(entry!.remedy).toContain('stop immediately');
    expect(entry!.remedy).toContain('lock the account');
    // And it is still the text a session actually reads.
    expect(entry!.showInRule).toBe(true);
  });
});
