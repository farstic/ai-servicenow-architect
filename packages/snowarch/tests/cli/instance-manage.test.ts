import { describe, expect, it } from 'vitest';
import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  EXIT_FAILED, EXIT_OK, EXIT_POLICY, MISMATCH, WAS_DEFAULT, credentialsUpdated, defaultChanged,
  labelNotFound, mirrorDefault, parseFlagPairs, prodRaiseWarning, removeQuestion, runList,
  runRemove, runSetCredentials, runSetDefault, runSetFlags, runSetPreset, runTest, type AddIo,
  type ManageDeps,
} from '../../src/cli/instance.js';
import { EXIT_USAGE } from '../../src/cli/tty.js';
import { instanceHelp, parseManageArgs } from '../../src/cli/instance-command.js';
import { NO_INSTANCES, listJson, listTable, secretNote } from '../../src/cli/format.js';
import { CORE_TOOLS_UNCONFIGURED } from '../../src/tools/status.js';
import type { Store } from '../../src/store/schema.js';
import { fakeRest } from '../helpers/fake-rest.js';
import { scriptedTty } from '../helpers/scripted-tty.js';

/**
 * ARC-07-S06 — the seven maintenance commands.
 *
 * Two rules run through every case here, and they are the reason the suite is shaped this way:
 *
 *   WHAT A COMMAND MAY TOUCH IS NARROWER THAN THE STORE. `test` writes `lastProbe` and nothing
 *   else; `set-credentials` writes `auth` and only after the instance said `ok`; the permission
 *   commands never touch a credential. So the assertions compare the OTHER fields byte for byte
 *   before and after, rather than checking that the intended field changed and trusting the rest.
 *
 *   NO OUTPUT MAY CARRY A SECRET. The last test in this file scans every byte every command in it
 *   wrote — stdout, JSON and all — for the fixture secrets. It is the check that survives a future
 *   command being added without one.
 *
 * Every secret is assembled rather than spelled, so this file is not a hit in the repository's own
 * secret sweep.
 */
const URL_PDI = 'https://dev12345.service-now.com';
const URL_PROD = 'https://acme.service-now.com';
const USERNAME = 'svc.snowarch';
const EMAIL_USER = 'someone@corp.example.com';
const PASSWORD = ['pw', '-', 'first'].join('');
const NEW_PASSWORD = ['pw', '-', 'second'].join('');
const CLIENT_SECRET = ['cs', '-', 'fixture'].join('');

/** Everything every command in this file wrote, so the sweep at the end can read all of it. */
const everything: string[] = [];

const io = (answers: readonly string[], secrets: readonly string[] = [NEW_PASSWORD]):
AddIo & { written: () => string; asked: () => string[] } => {
  const tty = scriptedTty(answers);
  const queue = [...secrets];
  return {
    ask: tty.ask,
    write: (text: string) => { everything.push(text); tty.write(text); },
    secret: async () => (queue.length > 1 ? (queue.shift() as string) : (queue[0] ?? '')),
    written: () => tty.written,
    asked: () => tty.prompts,
  };
};

const entry = (over: Record<string, unknown> = {}): Record<string, unknown> => ({
  url: URL_PDI,
  environment: 'pdi',
  auth: { method: 'basic', username: USERNAME, password: PASSWORD },
  preset: 'read-only',
  flags: { WRITE_ENABLED: 'false', CMDB_WRITE_ENABLED: 'false', SCRIPTING_ENABLED: 'false',
    ATF_ENABLED: 'false', NOW_ASSIST_ENABLED: 'false', FLUENT_ENABLED: 'false' },
  toolPackage: 'full',
  maxRecords: 100,
  prodWriteAck: false,
  ...over,
});

interface Workspace { dir: string; store: string; config: string; audit: string; cleanup: () => void }

function workspace(instances: Record<string, Record<string, unknown>>, defaultInstance = 'pdi'): Workspace {
  const dir = mkdtempSync(join(tmpdir(), 'instance-manage-'));
  const store = join(dir, 'instances.json');
  writeFileSync(store, `${JSON.stringify({ version: 1, defaultInstance, instances }, null, 2)}\n`,
    { mode: 0o600 });
  chmodSync(store, 0o600);
  return { dir, store, config: join(dir, 'config.json'), audit: join(dir, 'audit.jsonl'),
    cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

const read = (ws: Workspace): Store => JSON.parse(readFileSync(ws.store, 'utf8')) as Store;
const bytes = (ws: Workspace): string => readFileSync(ws.store, 'utf8');
const auditLines = (ws: Workspace): Array<Record<string, unknown>> =>
  (existsSync(ws.audit)
    ? readFileSync(ws.audit, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l) as Record<string, unknown>)
    : []);

/** A probe client whose `sys_user` answer is scripted; every other table answers 200. */
const client = (statuses: readonly number[]) => {
  const queue = [...statuses];
  const calls: number[] = [];
  return {
    calls,
    make: () => {
      const status = queue.length > 1 ? (queue.shift() as number) : (queue[0] ?? 200);
      calls.push(status);
      return fakeRest({
        sys_user: { status },
        sys_user_has_role: { status: 200, records: [{ 'role.name': 'admin' }] },
        sys_update_set: { status: 200 },
        sys_script_include: { status: 200 },
        cmdb_ci: { status: 200 },
        sys_atf_test: { status: 200 },
        sys_properties: { status: 200, records: [{ sys_id: 'x' }] },
      });
    },
  };
};

const reachable = async () => ({ ok: true as const, status: 200, latencyMs: 1 });

const deps = (ws: Workspace, statuses: readonly number[] = [200], now = '2026-09-10T08:00:00.000Z'):
ManageDeps & { calls: number[] } => {
  const c = client(statuses);
  // The audit file follows the STORE (ARC-04-S10 puts it beside the store in use), and the env
  // var is what tells the writer which temp directory that is for this case.
  process.env.SNOW_AUDIT_FILE = ws.audit;
  return {
    storePath: ws.store,
    configPath: ws.config,
    makeClient: c.make as unknown as ManageDeps['makeClient'],
    reachability: reachable as unknown as ManageDeps['reachability'],
    now: () => now,
    calls: c.calls,
  };
};

describe('AC 1 — list', () => {
  it('prints the table with masked usernames, a default marker and no secret field', () => {
    const ws = workspace({
      pdi: entry({ lastProbe: { at: '2026-09-04T10:12:00Z', auth: 'ok', write: 'ok',
        scripting: 'ok', cmdb: 'ok', atf: 'ok', nowAssist: 'not licensed', fluent: 'not installed' } }),
      uat: entry({ environment: 'test', preset: 'read-only',
        auth: { method: 'oauth_ropc', username: EMAIL_USER, password: PASSWORD,
          clientId: 'cid', clientSecret: CLIENT_SECRET } }),
    });
    try {
      const terminal = io([]);
      expect(runList({}, terminal, deps(ws))).toBe(EXIT_OK);
      const out = terminal.written();
      expect(out).toContain('LABEL  ENV');
      // The domain SURVIVES the mask — ARC-04-S02's rule — and the local part does not.
      expect(out).toContain('s***@corp.example.com');
      expect(out).toContain('a***'.replace('a', USERNAME[0] as string));
      expect(out).not.toContain(USERNAME);
      expect(out).not.toContain(EMAIL_USER);
      // The default marker is a column, not a sentence.
      expect(out.split('\n')[1]).toContain('*');
    } finally { ws.cleanup(); }
  });

  it('--json carries `set (len n)` where the secret is, and never the secret', () => {
    const ws = workspace({ pdi: entry() });
    try {
      const terminal = io([]);
      expect(runList({ json: true }, terminal, deps(ws))).toBe(EXIT_OK);
      const parsed = JSON.parse(terminal.written()) as ReturnType<typeof listJson>;
      expect(parsed.instances[0]?.auth.secret).toBe(`set (len ${PASSWORD.length})`);
      expect(parsed.defaultInstance).toBe('pdi');
      expect(terminal.written()).not.toContain(PASSWORD);
      // The shape ARC-06-S08 reads: an ARRAY of instances, each with a label.
      expect(Array.isArray(parsed.instances)).toBe(true);
      expect(parsed.instances[0]?.label).toBe('pdi');
    } finally { ws.cleanup(); }
  });

  it('an empty store is a sentence and exit 0, not an error', () => {
    const ws = workspace({});
    try {
      const terminal = io([]);
      expect(runList({}, terminal, deps(ws))).toBe(EXIT_OK);
      expect(terminal.written()).toContain(NO_INSTANCES);
      expect(listTable(listJson(ws.store, { version: 1, instances: {} } as Store))).toBe(NO_INSTANCES);
    } finally { ws.cleanup(); }
  });

  it('--verbose names the store it read, masked', () => {
    const ws = workspace({ pdi: entry() });
    try {
      const terminal = io([]);
      runList({ verbose: true }, terminal, deps(ws));
      expect(terminal.written()).toContain('store: ');
    } finally { ws.cleanup(); }
  });

  it('secretNote describes a secret without showing one, and says when there is none', () => {
    expect(secretNote(PASSWORD)).toBe(`set (len ${PASSWORD.length})`);
    expect(secretNote(undefined)).toBe('not set');
    expect(secretNote('')).toBe('not set');
  });
});

describe('AC 2 — test', () => {
  it('rewrites lastProbe and leaves the credentials and the preset byte-identical', async () => {
    const ws = workspace({ pdi: entry() });
    try {
      const before = read(ws).instances.pdi;
      const terminal = io([]);
      expect(await runTest({ label: 'pdi' }, terminal, deps(ws))).toBe(EXIT_OK);
      const after = read(ws).instances.pdi;
      expect(after?.lastProbe?.at).toBe('2026-09-10T08:00:00.000Z');
      expect(JSON.stringify(after?.auth)).toBe(JSON.stringify(before?.auth));
      expect(after?.preset).toBe(before?.preset);
      expect(JSON.stringify(after?.flags)).toBe(JSON.stringify(before?.flags));

      // ARC-07-S02 AC 5's "once per run", on the other command that prints it (acceptance item
      // B07-01). `instance test` re-probes an entry that already exists, so it is the run where a
      // second line would be least noticed.
      expect(terminal.written().match(/^network: /gm) ?? []).toHaveLength(1);
    } finally { ws.cleanup(); }
  });

  it('a 401 exits 1 with the credentials and the preset untouched', async () => {
    const ws = workspace({ pdi: entry() });
    try {
      const before = read(ws).instances.pdi;
      expect(before, 'precondition: the entry exists').toBeDefined();
      const terminal = io([]);
      const d = deps(ws, [401]);
      expect(await runTest({ label: 'pdi' }, terminal, d)).toBe(EXIT_FAILED);
      const after = read(ws).instances.pdi;
      expect(JSON.stringify(after?.auth)).toBe(JSON.stringify(before?.auth));
      expect(after?.preset).toBe(before?.preset);
      // ONE request, S03's rule: a failed login is never retried by a probe.
      expect(d.calls.length).toBe(1);
    } finally { ws.cleanup(); }
  });

  it('names an unknown label rather than probing something else', async () => {
    const ws = workspace({ pdi: entry() });
    try {
      const terminal = io([]);
      expect(await runTest({ label: 'nope' }, terminal, deps(ws))).toBe(EXIT_USAGE);
      expect(terminal.written()).toContain('LABEL_NOT_FOUND');
      expect(labelNotFound('nope', ['pdi'])).toContain('Known: pdi.');
    } finally { ws.cleanup(); }
  });
});

describe('AC 10 — test --all --json', () => {
  it('prints ONE object keyed by label with the eight fields, and nothing else on stdout', async () => {
    const ws = workspace({ pdi: entry(), uat: entry({ environment: 'test' }) });
    try {
      const terminal = io([]);
      expect(await runTest({ all: true, json: true }, terminal, deps(ws))).toBe(EXIT_OK);
      const out = terminal.written();
      // Parsing the WHOLE of stdout is the assertion: ARC-06-S08 does exactly this, and a network
      // note printed above the object would make it `unparsable` there and green here.
      const parsed = JSON.parse(out) as { instances: Record<string, Record<string, unknown>> };
      expect(Object.keys(parsed.instances).sort()).toEqual(['pdi', 'uat']);
      for (const label of ['pdi', 'uat']) {
        expect(Object.keys(parsed.instances[label] ?? {}).sort()).toEqual(
          ['at', 'atf', 'auth', 'cmdb', 'fluent', 'nowAssist', 'scripting', 'write']);
      }
      expect(out).not.toContain(USERNAME);
      expect(out).not.toContain(PASSWORD);
    } finally { ws.cleanup(); }
  });

  it('--all without --json is a usage error, not a table nobody asked for', async () => {
    const ws = workspace({ pdi: entry() });
    try {
      const terminal = io([]);
      expect(await runTest({ all: true }, terminal, deps(ws))).toBe(EXIT_USAGE);
      expect(terminal.written()).toContain('--json');
    } finally { ws.cleanup(); }
  });

  it('exit 1 when ANY instance fails, with both still reported', async () => {
    const ws = workspace({ pdi: entry(), uat: entry({ environment: 'test' }) });
    try {
      const terminal = io([]);
      expect(await runTest({ all: true, json: true }, terminal, deps(ws, [200, 401]))).toBe(EXIT_FAILED);
      const parsed = JSON.parse(terminal.written()) as { instances: Record<string, { auth: string }> };
      expect(parsed.instances.pdi?.auth).toBe('ok');
      expect(parsed.instances.uat?.auth).toBe('auth failed');
    } finally { ws.cleanup(); }
  });
});

describe('AC 3 — set-credentials', () => {
  it('three wrong passwords leave the OLD credentials in place and exit 1', async () => {
    const ws = workspace({ pdi: entry() });
    try {
      const before = bytes(ws);
      const terminal = io(['', 'y', '', 'y', ''], [NEW_PASSWORD]);
      expect(await runSetCredentials({ label: 'pdi' }, terminal, deps(ws, [401]))).toBe(EXIT_FAILED);
      expect(bytes(ws)).toBe(before);
      expect(terminal.written()).toContain('AUTHENTICATION_FAILED');
    } finally { ws.cleanup(); }
  });

  it('a good password is saved, re-probed, and reported without showing it', async () => {
    const ws = workspace({ pdi: entry() });
    try {
      const terminal = io([''], [NEW_PASSWORD]);
      expect(await runSetCredentials({ label: 'pdi' }, terminal, deps(ws))).toBe(EXIT_OK);
      const after = read(ws).instances.pdi;
      expect(after?.auth.password).toBe(NEW_PASSWORD);
      // Enter kept the account: the username is the one that was there.
      expect(after?.auth.username).toBe(USERNAME);
      expect(after?.lastProbe?.at).toBe('2026-09-10T08:00:00.000Z');
      expect(terminal.written()).toContain(credentialsUpdated('pdi'));
      expect(terminal.written()).not.toContain(NEW_PASSWORD);
      expect(auditLines(ws).at(-1)).toMatchObject({ action: 'set-credentials', actor: 'cli', tool: null });
    } finally { ws.cleanup(); }
  });

  it('the prompt offers the current account, masked', async () => {
    const ws = workspace({ pdi: entry() });
    try {
      const terminal = io([''], [NEW_PASSWORD]);
      await runSetCredentials({ label: 'pdi' }, terminal, deps(ws));
      expect(terminal.asked()[0]).toBe(`Username [${USERNAME[0]}***]: `);
    } finally { ws.cleanup(); }
  });

  it('changing --auth to oauth_ropc asks for the client fields and drops nothing else', async () => {
    const ws = workspace({ pdi: entry() });
    try {
      const terminal = io(['', 'client-id'], [NEW_PASSWORD, CLIENT_SECRET]);
      expect(await runSetCredentials({ label: 'pdi', auth: 'oauth_ropc' }, terminal, deps(ws))).toBe(EXIT_OK);
      const auth = read(ws).instances.pdi?.auth as Record<string, string>;
      expect(auth.method).toBe('oauth_ropc');
      expect(auth.clientId).toBe('client-id');
      expect(auth.clientSecret).toBe(CLIENT_SECRET);
      expect(terminal.written()).not.toContain(CLIENT_SECRET);
    } finally { ws.cleanup(); }
  });
});

describe('AC 4 and AC 6 — set-preset on production', () => {
  const prod = () => workspace({ 'prod-acme': entry({ environment: 'prod', url: URL_PROD }) }, 'prod-acme');

  it('refuses without --ack-prod, exit 3, nothing changed', async () => {
    const ws = prod();
    try {
      const before = bytes(ws);
      const terminal = io([]);
      expect(await runSetPreset({ label: 'prod-acme', preset: 'full', yes: true }, terminal, deps(ws)))
        .toBe(EXIT_POLICY);
      expect(terminal.written()).toContain('PROD_WRITE_NOT_ACKNOWLEDGED');
      expect(bytes(ws)).toBe(before);
      expect(auditLines(ws)).toEqual([]);
    } finally { ws.cleanup(); }
  });

  it('a typed label that does not match changes nothing and exits 3', async () => {
    const ws = prod();
    try {
      const before = bytes(ws);
      const terminal = io(['prod']);
      expect(await runSetPreset({ label: 'prod-acme', preset: 'full', ackProd: true, yes: true },
        terminal, deps(ws))).toBe(EXIT_POLICY);
      expect(terminal.written()).toContain(prodRaiseWarning());
      expect(terminal.written()).toContain(MISMATCH);
      expect(bytes(ws)).toBe(before);
    } finally { ws.cleanup(); }
  });

  it('the typed label raises it: six flags true, prodWriteAck true, one audit line', async () => {
    const ws = prod();
    try {
      const terminal = io(['prod-acme']);
      expect(await runSetPreset({ label: 'prod-acme', preset: 'full', ackProd: true, yes: true },
        terminal, deps(ws))).toBe(EXIT_OK);
      const after = read(ws).instances['prod-acme'];
      expect(after?.preset).toBe('full');
      expect(Object.values(after?.flags ?? {}).every((v) => v === 'true')).toBe(true);
      expect(after?.prodWriteAck).toBe(true);
      const lines = auditLines(ws);
      expect(lines).toHaveLength(1);
      expect(lines[0]).toMatchObject({ instance: 'prod-acme', environment: 'prod', tool: null,
        actor: 'cli', action: 'set-preset', preset: 'full', prodWriteAck: true,
        confirmedVia: 'prompt', result: 'ok' });
    } finally { ws.cleanup(); }
  });

  it('--confirm-label is the CI form and is audited as `flag`, not as a person typing', async () => {
    const ws = prod();
    try {
      const terminal = io([]);
      expect(await runSetPreset({ label: 'prod-acme', preset: 'full', ackProd: true,
        confirmLabel: 'prod-acme', yes: true }, terminal, deps(ws))).toBe(EXIT_OK);
      expect(auditLines(ws)[0]).toMatchObject({ confirmedVia: 'flag' });
    } finally { ws.cleanup(); }
  });

  it('AC 6 — back to read-only resets prodWriteAck and writes its own line', async () => {
    const ws = prod();
    try {
      await runSetPreset({ label: 'prod-acme', preset: 'full', ackProd: true,
        confirmLabel: 'prod-acme', yes: true }, io([]), deps(ws));
      expect(read(ws).instances['prod-acme']?.prodWriteAck).toBe(true);

      const terminal = io([]);
      expect(await runSetPreset({ label: 'prod-acme', preset: 'read-only', yes: true },
        terminal, deps(ws))).toBe(EXIT_OK);
      const after = read(ws).instances['prod-acme'];
      expect(after?.prodWriteAck).toBe(false);
      expect(after?.preset).toBe('read-only');
      expect(auditLines(ws)).toHaveLength(2);
    } finally { ws.cleanup(); }
  });

  it('a non-production instance takes the preset with no ceremony at all', async () => {
    const ws = workspace({ pdi: entry() });
    try {
      const terminal = io([]);
      expect(await runSetPreset({ label: 'pdi', preset: 'full', yes: true }, terminal, deps(ws)))
        .toBe(EXIT_OK);
      expect(read(ws).instances.pdi?.preset).toBe('full');
      expect(terminal.written()).not.toContain('PRODUCTION');
      // The credentials are not this command's business.
      expect(read(ws).instances.pdi?.auth.password).toBe(PASSWORD);
    } finally { ws.cleanup(); }
  });
});

describe('AC 7 — set-flags', () => {
  it('asks the dependency question and applies both when the answer is yes', async () => {
    const ws = workspace({ pdi: entry() });
    try {
      const terminal = io(['']);          // Enter = yes to "turn them on as well?"
      expect(await runSetFlags({ label: 'pdi', pairs: ['SCRIPTING=on'] }, terminal, deps(ws)))
        .toBe(EXIT_OK);
      expect(terminal.asked().join(' ')).toContain('SCRIPTING requires WRITE');
      const after = read(ws).instances.pdi;
      expect(after?.flags?.SCRIPTING_ENABLED).toBe('true');
      expect(after?.flags?.WRITE_ENABLED).toBe('true');
      expect(after?.preset).toBe('custom');
    } finally { ws.cleanup(); }
  });

  it('a non-interactive run refuses the contradiction instead of resolving it', async () => {
    const ws = workspace({ pdi: entry() });
    try {
      const before = bytes(ws);
      const terminal = io([]);
      expect(await runSetFlags({ label: 'pdi', pairs: ['SCRIPTING=on'], yes: true }, terminal, deps(ws)))
        .toBe(EXIT_USAGE);
      expect(terminal.written()).toContain('SCRIPTING requires WRITE');
      expect(bytes(ws)).toBe(before);
    } finally { ws.cleanup(); }
  });

  it('a full set lands as a NAMED preset, not as `custom`', async () => {
    const ws = workspace({ pdi: entry() });
    try {
      const pairs = ['WRITE=on', 'CMDB_WRITE=on', 'SCRIPTING=on', 'ATF=on', 'NOW_ASSIST=on', 'FLUENT=on'];
      expect(await runSetFlags({ label: 'pdi', pairs, yes: true }, io([]), deps(ws))).toBe(EXIT_OK);
      expect(read(ws).instances.pdi?.preset).toBe('full');
    } finally { ws.cleanup(); }
  });

  it('production is capped here exactly as in set-preset', async () => {
    const ws = workspace({ 'prod-acme': entry({ environment: 'prod', url: URL_PROD }) }, 'prod-acme');
    try {
      const before = bytes(ws);
      const terminal = io([]);
      expect(await runSetFlags({ label: 'prod-acme', pairs: ['WRITE=on'], yes: true }, terminal, deps(ws)))
        .toBe(EXIT_POLICY);
      expect(bytes(ws)).toBe(before);
    } finally { ws.cleanup(); }
  });

  it('parseFlagPairs names what it did not understand', () => {
    expect(parseFlagPairs(['NOPE=on']).ok).toBe(false);
    expect(parseFlagPairs(['WRITE=maybe']).ok).toBe(false);
    expect(parseFlagPairs([]).ok).toBe(false);
    const parsed = parseFlagPairs(['WRITE=on', 'ATF=off']);
    expect(parsed.ok && [...parsed.changes.entries()]).toEqual([['WRITE_ENABLED', 'true'], ['ATF_ENABLED', 'false']]);
  });
});

describe('AC 9 — set-default', () => {
  it('writes the store, mirrors the label, and names the reload tool from the contract', () => {
    const ws = workspace({ pdi: entry(), uat: entry({ environment: 'test' }) });
    try {
      writeFileSync(ws.config, `${JSON.stringify({ version: 1, mode: 'live', defaultInstance: 'pdi',
        registration: 'project', updatedAt: '2026-09-01T00:00:00.000Z' }, null, 2)}\n`);
      const terminal = io([]);
      expect(runSetDefault({ label: 'uat' }, terminal, deps(ws))).toBe(EXIT_OK);
      expect(read(ws).defaultInstance).toBe('uat');

      const config = JSON.parse(readFileSync(ws.config, 'utf8')) as Record<string, unknown>;
      expect(config.defaultInstance).toBe('uat');
      // Every other key survives byte for byte — this file belongs to the bootstrap.
      expect(config.updatedAt).toBe('2026-09-01T00:00:00.000Z');
      expect(config.mode).toBe('live');
      expect(config.registration).toBe('project');
      expect(config.version).toBe(1);

      expect(terminal.written()).toContain(CORE_TOOLS_UNCONFIGURED[1]);
      expect(terminal.written()).toBe(`${defaultChanged('uat')}\n`);
    } finally { ws.cleanup(); }
  });

  it('no config file means no mirror, and no failure either', () => {
    const ws = workspace({ pdi: entry(), uat: entry({ environment: 'test' }) });
    try {
      expect(existsSync(ws.config), 'precondition: there is no config to mirror into').toBe(false);
      expect(runSetDefault({ label: 'uat' }, io([]), deps(ws))).toBe(EXIT_OK);
      expect(mirrorDefault(ws.config, 'uat')).toBe(false);
      expect(existsSync(ws.config)).toBe(false);
    } finally { ws.cleanup(); }
  });

  it('an unparseable config is not this command\'s failure', () => {
    const ws = workspace({ pdi: entry() });
    try {
      writeFileSync(ws.config, '{ not json');
      expect(mirrorDefault(ws.config, 'pdi')).toBe(false);
      expect(readFileSync(ws.config, 'utf8')).toBe('{ not json');
    } finally { ws.cleanup(); }
  });
});

describe('AC 8 — remove', () => {
  it('asks before deleting, and `n` leaves the entry alone', async () => {
    const ws = workspace({ pdi: entry() });
    try {
      const before = bytes(ws);
      const terminal = io(['n']);
      expect(await runRemove({ label: 'pdi' }, terminal, deps(ws))).toBe(EXIT_FAILED);
      expect(terminal.asked()[0]).toBe(removeQuestion('pdi', ws.store));
      expect(bytes(ws)).toBe(before);
    } finally { ws.cleanup(); }
  });

  it('--yes deletes it, says it was the default, and the store is then empty', async () => {
    const ws = workspace({ pdi: entry() });
    try {
      const terminal = io([]);
      expect(await runRemove({ label: 'pdi', yes: true }, terminal, deps(ws))).toBe(EXIT_OK);
      expect(Object.keys(read(ws).instances)).toEqual([]);
      expect(read(ws).defaultInstance).toBeUndefined();
      expect(terminal.written()).toContain(WAS_DEFAULT('pdi'));
      expect(auditLines(ws).at(-1)).toMatchObject({ action: 'remove', actor: 'cli' });

      const listing = io([]);
      runList({}, listing, deps(ws));
      expect(listing.written()).toContain(NO_INSTANCES);
    } finally { ws.cleanup(); }
  });

  it('removing a non-default instance leaves the default alone', async () => {
    const ws = workspace({ pdi: entry(), uat: entry({ environment: 'test' }) });
    try {
      expect(await runRemove({ label: 'uat', yes: true }, io([]), deps(ws))).toBe(EXIT_OK);
      expect(read(ws).defaultInstance).toBe('pdi');
    } finally { ws.cleanup(); }
  });
});

describe('the parser and the help', () => {
  it('gives each sub-command the positionals it takes, and refuses the rest', () => {
    expect(parseManageArgs('list', ['--json']).ok).toBe(true);
    expect(parseManageArgs('list', ['extra']).ok).toBe(false);
    expect(parseManageArgs('set-preset', ['pdi']).ok).toBe(false);
    const preset = parseManageArgs('set-preset', ['pdi', 'full', '--ack-prod']);
    expect(preset.ok && preset.options).toMatchObject({ label: 'pdi', preset: 'full', ackProd: true });
    const flags = parseManageArgs('set-flags', ['pdi', 'WRITE=on', 'ATF=off']);
    expect(flags.ok && flags.options.pairs).toEqual(['WRITE=on', 'ATF=off']);
    expect(parseManageArgs('test', ['pdi', '--all']).ok).toBe(false);
    expect(parseManageArgs('set-preset', ['pdi', 'full', '--confirm-label']).ok).toBe(false);
  });

  it('lists every sub-command — ARC-06-S08 detects `test` by reading this', () => {
    const help = instanceHelp();
    for (const name of ['add', 'list', 'test', 'set-credentials', 'set-preset', 'set-flags',
      'set-default', 'remove']) expect(help, name).toContain(name);
    expect(/\btest\b/.test(help), "B08's own regex").toBe(true);
  });
});

describe('the sweep', () => {
  it('no byte written by any command in this file is a secret', () => {
    // Non-vacuous: the suite above ran dozens of commands, so there is something to scan.
    expect(everything.join('').length).toBeGreaterThan(500);
    const all = everything.join('');
    for (const secret of [PASSWORD, NEW_PASSWORD, CLIENT_SECRET]) {
      expect(all.includes(secret), `a command printed a ${secret.length}-character secret`).toBe(false);
    }
  });
});
