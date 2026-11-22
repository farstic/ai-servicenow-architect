// Copyright 2026 Cvetomir Grigorov. Licensed under the Business Source License 1.1 (see LICENSE).
// snowarch — AI ServiceNow Architect. Not affiliated with or endorsed by ServiceNow, Inc.
import { describe, expect, it } from 'vitest';
import { completeFlags, parseStore, storeSchema, STORE_VERSION } from '../../src/store/schema.js';
import { cliSpelling } from '../../src/cli/tty.js';

/**
 * ARC-07-C31 slice 3 — DERIVED, and named for the package that prints it.
 *
 * These assertions are in the SERVER's own suite, against sentences slice 3 made derive, and this is
 * the THIRD test tree — the one my sweep of `tests/` and `tools/snowarch/tests/` did not look at, and
 * the one C35's audit did not either. Seventeen POSIX literals here were green on a mac and red on
 * every Windows cell.
 */
const SERVER_CLI = cliSpelling();

const base = {
  version: 1,
  defaultInstance: 'pdi',
  instances: {
    pdi: {
      url: 'https://dev12345.service-now.com',
      environment: 'pdi',
      auth: { method: 'basic', username: 'admin', password: 'secret' },
      preset: 'pdi-developer',
      flags: { WRITE_ENABLED: 'true', CMDB_WRITE_ENABLED: 'true', SCRIPTING_ENABLED: 'true',
               ATF_ENABLED: 'true', NOW_ASSIST_ENABLED: 'false', FLUENT_ENABLED: 'false' },
      toolPackage: 'full',
      maxRecords: 100,
      prodWriteAck: false,
    },
  },
};
const clone = () => JSON.parse(JSON.stringify(base));
const err = (raw: unknown) => { const r = parseStore(raw); if (!('error' in r)) throw new Error('expected an error'); return r.error; };
const ok = (raw: unknown) => { const r = parseStore(raw); if ('error' in r) throw new Error(`expected success, got ${r.error.code}: ${r.error.message}`); return r.store; };

describe('criterion 4 — the two shapes that look right and behave wrong', () => {
  it('a BOOLEAN flag is refused, naming instances.pdi.flags.WRITE_ENABLED', () => {
    // The env path compares byte-exactly against "true", so a JSON boolean reads as
    // absent — the user would believe writes were armed when they were not.
    const s = clone(); s.instances.pdi.flags.WRITE_ENABLED = true;
    const e = err(s);
    expect(e.code).toBe('STORE_SCHEMA_INVALID');
    expect(e.message).toContain('instances.pdi.flags.WRITE_ENABLED');
    expect(e.message).toContain('must be the string "true" or "false"');
  });

  it('auth.method "client_credentials" is refused, naming instances.pdi.auth.method', () => {
    const s = clone(); s.instances.pdi.auth = { method: 'client_credentials', clientId: 'a', clientSecret: 'b' };
    const e = err(s);
    expect(e.code).toBe('STORE_SCHEMA_INVALID');
    expect(e.message).toContain('instances.pdi.auth.method');
    expect(e.message).toContain('must be "basic" or "oauth_ropc"');
  });

  it('basic loads with username + password', () => {
    expect(ok(clone()).instances.pdi.auth.method).toBe('basic');
  });

  it('oauth_ropc loads with clientId + clientSecret + username + password', () => {
    const s = clone();
    s.instances.pdi.auth = { method: 'oauth_ropc', clientId: 'id', clientSecret: 'sec', username: 'u', password: 'p' };
    expect(ok(s).instances.pdi.auth.method).toBe('oauth_ropc');
  });

  it('oauth_ropc without a clientSecret is refused, naming the field', () => {
    const s = clone();
    s.instances.pdi.auth = { method: 'oauth_ropc', clientId: 'id', username: 'u', password: 'p' };
    expect(err(s).message).toContain('instances.pdi.auth.clientSecret');
  });
});

describe('version', () => {
  // ARC-09-S06 split the one `STORE_SCHEMA_UNSUPPORTED` in two. The remedy is what differs, and
  // it is the whole reason: a store from the FUTURE needs a newer checkout, a store from the PAST
  // needs migrating — and telling the second reader to upgrade sends them to a command that
  // changes nothing while their file sits there.
  it('a NEWER version says to upgrade the checkout, not to edit the store', () => {
    const s = clone(); s.version = 2;
    const e = err(s);
    expect(e.code).toBe('STORE_SCHEMA_NEWER');
    expect(e.message).toContain(`newer than this server supports (${STORE_VERSION})`);
    expect(e.message).toContain(`${SERVER_CLI} upgrade`);
  });
  it('an OLDER version says to migrate, and never mentions upgrading', () => {
    const s = clone(); s.version = 0;
    const e = err(s);
    expect(e.code).toBe('STORE_SCHEMA_OUTDATED');
    expect(e.message).toContain(`older than this server (${STORE_VERSION})`);
    expect(e.message).toContain(`${SERVER_CLI} store migrate`);
    expect(e.message).not.toContain('upgrade');
  });
  it('an unsupported version is not reported as a malformed store', () => {
    const s = clone(); s.version = 2; s.instances = 'nonsense';
    expect(err(s).code).toBe('STORE_SCHEMA_NEWER');
  });
});

describe('url and label', () => {
  it.each([
    ['a trailing slash', 'https://dev1.service-now.com/'],
    ['a path', 'https://dev1.service-now.com/api'],
    ['http', 'http://dev1.service-now.com'],
  ])('refuses %s', (_why, url) => {
    const s = clone(); s.instances.pdi.url = url;
    expect(err(s).message).toContain('instances.pdi.url');
  });

  it('refuses a label that does not match the slug pattern', () => {
    const s = clone(); s.instances = { 'PDI Prod': s.instances.pdi };
    expect(err(s).code).toBe('STORE_SCHEMA_INVALID');
  });

  it('refuses an unknown key rather than ignoring it', () => {
    const s = clone(); s.instances.pdi.wrtieEnabled = 'true';
    expect(err(s).code).toBe('STORE_SCHEMA_INVALID');
  });
});

describe('flags completion', () => {
  it('fewer than six flags is allowed; the absent ones read as "false"', () => {
    const s = clone(); s.instances.pdi.flags = { WRITE_ENABLED: 'true' };
    const store = ok(s);
    const complete = completeFlags(store.instances.pdi.flags);
    expect(complete.WRITE_ENABLED).toBe('true');
    expect(complete.SCRIPTING_ENABLED).toBe('false');
    expect(Object.keys(complete)).toHaveLength(6);
  });

  it('defaults fill in for absent optional fields', () => {
    const s = clone();
    delete s.instances.pdi.toolPackage; delete s.instances.pdi.maxRecords; delete s.instances.pdi.prodWriteAck;
    const store = ok(s);
    expect(store.instances.pdi.toolPackage).toBe('full');
    expect(store.instances.pdi.maxRecords).toBe(100);
    expect(store.instances.pdi.prodWriteAck).toBe(false);
  });

  it('maxRecords outside 1–1000 is refused', () => {
    const s = clone(); s.instances.pdi.maxRecords = 0;
    expect(err(s).message).toContain('instances.pdi.maxRecords');
  });
});

describe('lastProbe passthrough', () => {
  it('an unknown probe key does not invalidate the store — ARC-07-S03 adds keys without a version bump', () => {
    const s = clone();
    s.instances.pdi.lastProbe = { at: '2026-09-04T10:00:00Z', auth: 'ok', somethingNew: 'ok' };
    expect(ok(s).instances.pdi.lastProbe).toMatchObject({ somethingNew: 'ok' });
  });
});

describe('ARC-09-C211 — the path a store error names is a key, in backticks, never a name', () => {
  // The engine's printer reads a bare `word.word` as a person's first.last and masks it: SV-02 printed
  // "instances.pdi Unrecognized key(s) in object: 'notes'" as "i***.p*** …" (C210's probe). In backticks it is a key.
  // (ARC-09-C307: the unknown key's own name is no longer in the sentence: it can be a password. The object that holds it is.)
  it('an unknown key in an instance names its object in backticks', () => {
    const s = clone(); (s.instances.pdi as Record<string, unknown>).notes = 'x';
    const e = err(s);
    expect(e.code).toBe('STORE_SCHEMA_INVALID');
    expect(e.message).toBe('`instances.pdi` Unrecognized key(s) in object');
  });

  it('an unknown key at the root names no path, and prints no empty backticks or leading space', () => {
    const s = clone(); (s as Record<string, unknown>).notes = 'x';
    const e = err(s);
    expect(e.code).toBe('STORE_SCHEMA_INVALID');
    expect(e.message).toBe('Unrecognized key(s) in object');
  });
});

/**
 * ARC-09-C307 — the architect's ruling of 2026-11-22: STORE_SCHEMA_INVALID names the FIELD PATH and quotes nothing the file held.
 *
 * A store holds passwords, and a parser's sentence quotes what it was given: `Invalid enum value. Expected …, received '<the value>'` for a
 * value, `Unrecognized key(s) in object: '<its name>'` for a field it did not know, and a path through a record carries the record's key (an
 * instance label, a flag name). Each of those can be somebody's password pasted in the wrong place, and the sentence is printed in a terminal,
 * written to `.local/logs` and pasted into a bug report.
 */
describe('ARC-09-C307 — a store error names the field path and quotes nothing the file held', () => {
  const SECRET = ['sk', 'live', 'q7Zr', '4491xv'].join('-');
  const OTHER = ['PW', 'Other', '1234'].join('-');          // not a label either: a label is lower case

  it('a value that is not one of the allowed ones: the allowed ones are listed, the value is not', () => {
    const s = clone(); s.instances.pdi.environment = SECRET;
    expect(err(s)).toEqual({ code: 'STORE_SCHEMA_INVALID', message: "`instances.pdi.environment` Invalid enum value. Expected 'pdi' | 'dev' | 'test' | 'prod'" });
  });

  it('...for the preset and the tool package as well', () => {
    const a = clone(); a.instances.pdi.preset = SECRET;
    expect(err(a).message).toBe("`instances.pdi.preset` Invalid enum value. Expected 'read-only' | 'pdi-developer' | 'full' | 'custom'");
    const b = clone(); b.instances.pdi.toolPackage = SECRET;
    expect(err(b).message).toBe("`instances.pdi.toolPackage` Invalid enum value. Expected 'full'");
  });

  it('a flag name that is not a flag: the path says <key>, and the flags there are are listed', () => {
    const s = clone(); s.instances.pdi.flags = { ...s.instances.pdi.flags, [SECRET]: 'true' };
    expect(err(s).message).toBe("`instances.pdi.flags.<key>` Invalid enum value. Expected 'WRITE_ENABLED' | 'CMDB_WRITE_ENABLED' | 'SCRIPTING_ENABLED' | 'ATF_ENABLED' | 'NOW_ASSIST_ENABLED' | 'FLUENT_ENABLED'");
  });

  it('a label that is not a label: the path says <key>, and the rule is stated', () => {
    const s = clone(); s.instances = { [SECRET]: s.instances.pdi }; delete s.defaultInstance;
    expect(err(s).message).toBe('`instances.<key>` must match ^[a-z][a-z0-9_-]{0,31}$');
  });

  it('a default instance that is not a label: named by its field, not quoted', () => {
    const s = clone(); s.defaultInstance = SECRET;
    expect(err(s).message).toBe('`defaultInstance` must match ^[a-z][a-z0-9_-]{0,31}$');
  });

  it('a label that is one stays in the path: the instance list prints labels, and the instance that is wrong is the one to name', () => {
    const s = clone(); s.instances = { acme_dev: s.instances.pdi }; s.defaultInstance = 'acme_dev'; s.instances.acme_dev.maxRecords = 0;
    expect(err(s).message).toContain('`instances.acme_dev.maxRecords`');
  });

  it('a file that is a JSON string or an array: the type is named, never the value', () => {
    expect(err(SECRET).message).toBe('Expected object, received string');
    expect(err([SECRET]).message).toBe('Expected object, received array');
  });

  it('what an allowed value says is unchanged: a flag keeps its own words, and so does the auth method', () => {
    const f = clone(); f.instances.pdi.flags.WRITE_ENABLED = SECRET;
    expect(err(f).message).toBe('`instances.pdi.flags.WRITE_ENABLED` must be the string "true" or "false"');
    const a = clone(); a.instances.pdi.auth = { method: SECRET, username: 'u', password: 'p' };
    expect(err(a).message).toBe('`instances.pdi.auth.method` must be "basic" or "oauth_ropc"');
  });

  /**
   * The instrument that does not need to know where a parser quotes: put one secret in each place a store has, put a different one in the
   * same place, and ask whether the sentence changed. A sentence that says anything of the file says something different for a different
   * file. Every value of the base store is replaced in turn, and every object of it is given a key of that name.
   */
  function places(secret: string): Array<{ where: string; raw: unknown }> {
    const out: Array<{ where: string; raw: unknown }> = [];
    const at = (root: Record<string, unknown>, path: string[]): Record<string, unknown> =>
      path.reduce((node, key) => node[key] as Record<string, unknown>, root);
    const walk = (node: Record<string, unknown>, path: string[]) => {
      for (const [key, value] of Object.entries(node)) {
        const here = [...path, key];
        if (value && typeof value === 'object') { walk(value as Record<string, unknown>, here); continue; }
        const raw = clone();
        at(raw, path)[key] = secret;
        out.push({ where: `the value of ${here.join('.')}`, raw });
      }
      const raw = clone();
      at(raw, path)[secret] = 'x';
      out.push({ where: `a key of ${path.join('.') || 'the root'}`, raw });
    };
    walk(clone(), []);
    return out;
  }

  /** The places where a parser's sentence changes with what the file held, and how many places it refused at all. */
  function differing(sentence: (raw: unknown) => string | null): { differs: string[]; refused: number } {
    const first = places(SECRET);
    const second = places(OTHER);
    expect(second.map((x) => x.where)).toEqual(first.map((x) => x.where));
    const differs: string[] = [];
    let refused = 0;
    first.forEach((place, i) => {
      const a = sentence(place.raw);
      const b = sentence(second[i]!.raw);
      if (a === null && b === null) return;                   // this place takes any value (a user name, a password): nothing is said
      refused += 1;
      if (a !== b || (a ?? '').includes(SECRET) || (a ?? '').length <= 10) differs.push(place.where);
    });
    return { differs, refused };
  }

  const ours = (raw: unknown): string | null => { const r = parseStore(raw); return 'error' in r ? r.error.message : null; };
  /** What the loader said before this ruling: the schema's own first issue, as zod words it. */
  const quoting = (raw: unknown): string | null => {
    const r = storeSchema.safeParse(raw);
    return r.success ? null : `${r.error.issues[0]!.path.join('.')} ${r.error.issues[0]!.message}`;
  };

  it('whatever the secret is, and wherever it is put, the sentence is the same: nothing of the file can be in it', () => {
    const { differs, refused } = differing(ours);
    expect(differs, `the sentence depends on what the file held, at: ${differs.join('; ')}`).toEqual([]);
    // a vacuous pass is the failure of this instrument: it must find a refusal in most places of the base store
    expect(refused).toBeGreaterThanOrEqual(12);
  });

  it('the instrument can fail: zod\'s own sentence, which the loader used to print, depends on the file in exactly the places the ruling names', () => {
    const { differs } = differing(quoting);
    expect(differs.length).toBeGreaterThanOrEqual(4);
    expect(differs.join('\n')).toMatch(/environment/);
    expect(differs.join('\n')).toMatch(/a key of the root/);
    expect(differs.join('\n')).toMatch(/a key of instances\.pdi/);
    expect(differs.join('\n')).toMatch(/a key of instances$/m);
  });
});
