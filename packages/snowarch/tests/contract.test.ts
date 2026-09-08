import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { collectToolCatalog, routeToolInvocation } from '../src/tools/index.js';
import { runWithInstance, FLAG_NAMES, type Flags, type InstanceRuntime } from '../src/servicenow/context.js';
import { expandPreset, PRESETS, type PresetName } from '../src/utils/permissions.js';
import { ERROR_CODES } from '../src/errors/codes.js';
import type { Gate, ToolDefinition } from '../src/tools/types.js';
import type { ServiceNowClient } from '../src/servicenow/client.js';

const here = dirname(fileURLToPath(import.meta.url));
const CONTRACT = JSON.parse(readFileSync(resolve(here, '../dist/contract.json'), 'utf8'));
const MANIFEST = JSON.parse(readFileSync(resolve(here, '../dist/tools-manifest.json'), 'utf8'));
const RENAME_MAP = JSON.parse(readFileSync(resolve(here, '../tool-rename-map.json'), 'utf8'));

const catalogue = collectToolCatalog() as ToolDefinition[];

/**
 * The contract, checked against the code that produced it.
 *
 * The point of (a) is that a DECLARATION and the RUNTIME cannot drift: the declaration says
 * `gate: 'scripting'`, and the only way to know that is still true is to call the tool with
 * every flag off and see which code comes back. Swap a `requireScripting()` for a
 * `requireWrite()` without touching the declaration and this fails — which is exactly the
 * mistake a contract is supposed to make impossible.
 */
const SENTINEL = 'MOCK_CLIENT_CALL';
const throwingClient = new Proxy({}, {
  get: () => () => { throw Object.assign(new Error('client reached'), { code: SENTINEL }); },
}) as unknown as ServiceNowClient;

const flags = (over: Partial<Flags> = {}): Flags =>
  Object.fromEntries(FLAG_NAMES.map((f) => [f, over[f] ?? 'false'])) as Flags;

function runtime(f: Flags, preset = 'custom'): InstanceRuntime {
  return {
    label: 'pdi', url: 'https://dev1.service-now.com', environment: 'pdi', preset,
    flags: f, effectiveFlags: f, toolPackage: 'full', maxRecords: 100, prodWriteAck: false,
    client: {} as InstanceRuntime['client'], warnings: [],
  };
}

async function codeFor(name: string, f: Flags, preset = 'custom'): Promise<string> {
  return runWithInstance(runtime(f, preset), async () => {
    try { await routeToolInvocation(throwingClient, name, {}); return 'RETURNED'; }
    catch (e) { return String((e as { code?: string }).code ?? 'NO_CODE'); }
  });
}

/** The code a gate produces when nothing is enabled. Composite gates report WRITE first. */
const GATE_CODE: Record<Gate, string | null> = {
  none: null,
  write: 'WRITE_NOT_ENABLED',
  cmdb_write: 'WRITE_NOT_ENABLED',
  scripting: 'WRITE_NOT_ENABLED',
  atf: 'ATF_NOT_ENABLED',
  now_assist: 'NOW_ASSIST_NOT_ENABLED',
  fluent: 'FLUENT_NOT_ENABLED',
};

/** Reached the tool body: validation, the client, or a clean return. Not a gate refusal. */
const PASSED = [SENTINEL, 'INVALID_REQUEST', 'VALIDATION_ERROR', 'RETURNED', 'NO_CODE',
  'NOT_IMPLEMENTED', 'SCHEMA_NOT_CACHED', 'FLUENT_NOT_INSTALLED',
  // ARC-04-S08's two retired script-exec stubs. The gate LET THEM THROUGH and the capability
  // then refused — which is the whole point of the code being distinct from a gate code, and
  // is why it counts as passing here rather than being special-cased out of the suite.
  'UNSUPPORTED_ON_THIS_INSTANCE'];

describe('(a) the declared gate is the gate the runtime enforces', () => {
  it.each(catalogue.map((t) => [t.name, t.gate] as const))(
    '%s declares %s and behaves that way with every flag off',
    async (name, gate) => {
      const code = await codeFor(name, flags(), 'read-only');
      const expected = GATE_CODE[gate];
      if (expected === null) expect(PASSED, `${name} declares gate:none but threw ${code}`).toContain(code);
      else expect(code, `${name} declares gate:${gate}`).toBe(expected);
    },
  );

  /**
   * The other direction, and the one that was missing.
   *
   * The composite test below iterates only tools DECLARED composite, and no preset grants WRITE
   * alone — so a tool declared `write` that actually calls `requireScripting()` threw
   * `WRITE_NOT_ENABLED` with everything off (matching its declaration) and was never asked what
   * it does when WRITE is on. `snow_fluent_script_exec` sat mis-declared behind exactly that
   * gap: the contract's ask-list under-reported it as `write` while the runtime demanded
   * SCRIPTING.
   *
   * A synthetic flag set, not a preset, precisely because the preset table is the fixture whose
   * shape excluded the failing input.
   */
  it('every tool declared `write` is satisfied by WRITE alone', async () => {
    const writeOnly = flags({ WRITE_ENABLED: 'true' });
    const under = await Promise.all(catalogue.filter((t) => t.gate === 'write').map(async (t) => {
      const code = await codeFor(t.name, writeOnly);
      return /_NOT_ENABLED$/.test(code) ? `${t.name} declares write but threw ${code}` : null;
    }));
    expect(under.filter(Boolean)).toEqual([]);
  });

  it('the composite gates are distinguished with WRITE on', async () => {
    // all-false cannot tell write from cmdb_write or scripting — WRITE is missing in each.
    // With WRITE on, the second flag is what refuses, and the declaration must match.
    for (const t of catalogue.filter((x) => x.gate === 'cmdb_write' || x.gate === 'scripting')) {
      const code = await codeFor(t.name, flags({ WRITE_ENABLED: 'true' }));
      expect(code, `${t.name} declares ${t.gate}`)
        .toBe(t.gate === 'cmdb_write' ? 'CMDB_WRITE_NOT_ENABLED' : 'SCRIPTING_NOT_ENABLED');
    }
  });
});

describe('(b) a preset that satisfies a gate lets the tool through', () => {
  const satisfied = (gate: Gate, f: Flags): boolean => {
    switch (gate) {
      case 'none': return true;
      case 'write': return f.WRITE_ENABLED === 'true';
      case 'cmdb_write': return f.WRITE_ENABLED === 'true' && f.CMDB_WRITE_ENABLED === 'true';
      case 'scripting': return f.WRITE_ENABLED === 'true' && f.SCRIPTING_ENABLED === 'true';
      case 'atf': return f.ATF_ENABLED === 'true';
      case 'now_assist': return f.NOW_ASSIST_ENABLED === 'true';
      case 'fluent': return f.FLUENT_ENABLED === 'true';
      /* c8 ignore next */ default: return false;
    }
  };

  /**
   * These two do not call the ServiceNow client at all — they spawn the `@servicenow/sdk`
   * CLI and wait for it. Measured here: 92 s and 60 s before giving up. The throwing proxy
   * cannot intercept an external process, so including them would make this suite a test of
   * how long a build takes. (a) still covers them: with every flag off the `fluent` gate
   * refuses long before the spawn.
   */
  const SPAWNS_AN_EXTERNAL_PROCESS = ['snow_fluent_build', 'snow_fluent_validate'];

  it('the exclusion list names exactly the tools that spawn, and they are gated', () => {
    for (const name of SPAWNS_AN_EXTERNAL_PROCESS) {
      const t = catalogue.find((x) => x.name === name);
      expect(t, `${name} is excluded from (b) but no longer exists`).toBeDefined();
      expect(t?.gate, `${name} is excluded from (b), so its gate must still be asserted by (a)`).toBe('fluent');
    }
  });

  it.each(['read-only', 'pdi-developer', 'full'] as const)('under %s', async (preset) => {
    const f = expandPreset(preset as PresetName);
    const wrong: string[] = [];
    for (const t of catalogue) {
      if (SPAWNS_AN_EXTERNAL_PROCESS.includes(t.name)) continue;
      if (!satisfied(t.gate, f)) continue;
      const code = await codeFor(t.name, f, preset);
      if (!PASSED.includes(code)) wrong.push(`${t.name} (${t.gate}) → ${code}`);
    }
    expect(wrong).toEqual([]);
  }, 60_000);
});

describe('composite gates — an outer gate plus a second requirement', () => {
  it('every alsoRequires names a real gate, and differs from the outer one', () => {
    // Six tools sit behind a module-wide gate AND a case-level one (now_assist then write,
    // fluent then write). `gate` is the outer one because it refuses first; without
    // `alsoRequires` the write requirement would be missing from the contract entirely, and
    // §2.1's ask list would under-report what those tools need.
    const composite = catalogue.filter((t) => t.alsoRequires);
    expect(composite.length).toBe(6);
    for (const t of composite) {
      expect(t.alsoRequires).not.toBe(t.gate);
      expect(Object.keys(CONTRACT.gates)).toContain(t.alsoRequires as string);
    }
  });

  it('the contract carries alsoRequires for exactly those tools', () => {
    const inContract = CONTRACT.tools.filter((t: { alsoRequires?: string }) => t.alsoRequires).map((t: { name: string }) => t.name).sort();
    expect(inContract).toEqual(catalogue.filter((t) => t.alsoRequires).map((t) => t.name).sort());
  });
});

describe('(c) a tool that mutates is never ungated', () => {
  it('every mutates:true tool has a gate', () => {
    const bad = catalogue.filter((t) => t.mutates && t.gate === 'none').map((t) => t.name);
    expect(bad, 'these change the instance with no flag required').toEqual([]);
  });
});

describe('(d) a read-shaped name never mutates', () => {
  it('nothing ending _index, _read or _query declares mutates:true', () => {
    const bad = catalogue.filter((t) => /_(index|read|query)$/.test(t.name) && t.mutates).map((t) => t.name);
    expect(bad).toEqual([]);
  });
});

describe('(e) manifest, contract and catalogue agree', () => {
  it('the same names, in the same number', () => {
    const cat = catalogue.map((t) => t.name).sort();
    expect(MANIFEST.map((t: { name: string }) => t.name).sort()).toEqual(cat);
    expect(CONTRACT.tools.map((t: { name: string }) => t.name).sort()).toEqual(cat);
    expect(CONTRACT.toolCount).toBe(cat.length);
    expect(cat.length).toBe(397);
  });

  it('every contract entry carries gate and mutates', () => {
    for (const t of CONTRACT.tools) {
      expect(typeof t.gate, t.name).toBe('string');
      expect(typeof t.mutates, t.name).toBe('boolean');
    }
  });

  it('the contract carries no description or inputSchema — they are not part of the sha', () => {
    // If they were, the sha would move whenever someone improved a sentence, and a pin
    // against it would mean nothing.
    for (const t of CONTRACT.tools) {
      const allowed = ['alsoRequires', 'gate', 'mutates', 'name', 'sessionMutates', 'table'];
      expect(Object.keys(t).filter((k) => !allowed.includes(k)), t.name).toEqual([]);
      expect(Object.keys(t)).toContain('gate');
      expect(Object.keys(t)).toContain('mutates');
    }
  });

  it('the contract is sorted by name, so the sha is stable across rebuilds', () => {
    const names = CONTRACT.tools.map((t: { name: string }) => t.name);
    expect(names).toEqual([...names].sort());
  });
});

describe('the update-set capture protocol resolves to registered tools', () => {
  it('every step of protocols.updateSetCapture that names a tool exists', () => {
    // The protocol is what ARC-05 generates §2.2 from. A step naming a tool that does not
    // exist would generate an instruction nobody can follow.
    const steps: string[] = CONTRACT.protocols.updateSetCapture;
    const names = new Set(catalogue.map((t) => t.name));
    const missing = steps.filter((s) => s.startsWith('snow_') && !names.has(s));
    expect(missing).toEqual([]);
    expect(steps).toContain('snow_us_capture_target_set');
  });
});

describe('(f) the rename map still maps into the catalogue', () => {
  /** Renamed, then retired. See tests/tools/parity.test.ts for why the map keeps the entry. */
  // From the shared file — see packages/snowarch/retired-tools.json and ARC-05-S02.
  const RETIRED_TOOLS: string[] = (JSON.parse(
    readFileSync(new URL('../retired-tools.json', import.meta.url), 'utf8'),
  ) as { retired: Array<{ name: string }> }).retired.map((r) => r.name);

  it('every mapped new name exists, or is declared retired', () => {
    const cat = new Set(catalogue.map((t) => t.name));
    expect(Object.values(RENAME_MAP)
      .filter((n) => !cat.has(n as string) && !RETIRED_TOOLS.includes(n as string))).toEqual([]);
  });

  it('and a retired name is really absent — the declaration is not a way to hide a live tool', () => {
    const cat = new Set(catalogue.map((t) => t.name));
    expect(RETIRED_TOOLS.filter((n) => cat.has(n))).toEqual([]);
  });
});

describe('(g) the contract mirrors permissions.ts, never a retyped copy', () => {
  it('presets deep-equal the exported table', () => {
    expect(CONTRACT.presets).toEqual(PRESETS);
  });

  it('flags name the six, with the dependency rule in requires', () => {
    expect(CONTRACT.flags.map((f: { name: string }) => f.name)).toEqual([...FLAG_NAMES]);
    const byName = Object.fromEntries(CONTRACT.flags.map((f: { name: string }) => [f.name, f]));
    expect(byName.SCRIPTING_ENABLED.requires).toEqual(['WRITE_ENABLED']);
    expect(byName.CMDB_WRITE_ENABLED.requires).toEqual(['WRITE_ENABLED']);
    expect(byName.WRITE_ENABLED.requires).toEqual([]);
    for (const f of CONTRACT.flags) expect(f.exactString).toBe('true');
  });

  it('gates list the flags each one needs', () => {
    expect(CONTRACT.gates.scripting).toEqual(['WRITE_ENABLED', 'SCRIPTING_ENABLED']);
    expect(CONTRACT.gates.cmdb_write).toEqual(['WRITE_ENABLED', 'CMDB_WRITE_ENABLED']);
    expect(CONTRACT.gates.fluent).toEqual({ requires: ['FLUENT_ENABLED'], requiresWriteWhenMutating: true });
    expect(CONTRACT.gates.none).toEqual([]);
  });

  it('errorCodes deep-equal the registry, sorted', () => {
    expect(CONTRACT.errorCodes).toEqual([...ERROR_CODES].sort((a, b) => a.code.localeCompare(b.code)));
  });

  it('the identity fields are the ones ARC-05 and ARC-06 pin against', () => {
    expect(CONTRACT.contractVersion).toBe(1);
    expect(CONTRACT.product).toBe('snowarch');
    expect(CONTRACT.server.suggestedName).toBe('servicenow');
    expect(CONTRACT.toolPackage).toBe('full');
    expect(CONTRACT.maxRecordsDefault).toBe(100);
    // The package version of record — ARC-09 sets the release number.
    expect(CONTRACT.version).toBe('2.0.0-dev');
  });
});
