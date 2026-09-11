import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
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
const REQUIRED = JSON.parse(readFileSync(resolve(here, '../../contract/required-tools.json'), 'utf8'));
const EXCEPTIONS = JSON.parse(readFileSync(resolve(here, 'contract-exceptions.json'), 'utf8'));
const ENGINE_CONFIG = JSON.parse(readFileSync(resolve(here, '../../../engine.config.json'), 'utf8'));

// Criterion 8's canary. The whole suite runs with WRITE_ENABLED=true in the ENVIRONMENT, and every
// probe below still expects a refusal: flags belong to the instance, not to the process. If a gate
// ever consulted `process.env`, the all-false probes would start passing and this suite would go
// green for exactly the wrong reason — which is the failure mode a gate test cannot detect from
// inside its own assertions.
process.env.WRITE_ENABLED = 'true';
process.env.SCRIPTING_ENABLED = 'true';

const catalogue = collectToolCatalog() as ToolDefinition[];

/** Every `.ts` under a directory. The registry scan needs the files, not a glob dependency. */
function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) return sourceFiles(p);
    return p.endsWith('.ts') ? [p] : [];
  });
}

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

// ---------------------------------------------------------------------------------------------
// ARC-05-S08 brings this suite to its final form: 14 numbered invariants. The blocks below that
// carry letters are ARC-04-S06's first form and map onto them — (a)→3, (b)→4, (c)→8, (d)→7,
// (e)→9, (f)→10, (g)→5 — extended in place rather than duplicated beside a second copy.
// ---------------------------------------------------------------------------------------------

describe('1 and 2 — the engine pins a subset of the catalogue, and agrees about it', () => {
  // The server-side mirror of the engine lint's L08. Both are wanted: this one fails in the
  // package that changed the tool, at the moment it changes; L08 fails in a clone with no
  // node_modules, in the lint everyone runs.
  const names = new Set(catalogue.map((t) => t.name));

  it('1. every required tool is in the catalogue', () => {
    const missing = (REQUIRED.tools as { name: string }[])
      .map((t) => t.name).filter((n) => !names.has(n));
    expect(missing, 'pinned but not registered — a rename the engine has not been told about').toEqual([]);
  });

  it('2. and the catalogue agrees with the engine about gate, mutates and the rest', () => {
    const byName = new Map(catalogue.map((t) => [t.name, t]));
    const show = (v: unknown) => (v === undefined ? '—' : String(v));
    const differing: string[] = [];
    for (const pinned of REQUIRED.tools) {
      const live = byName.get(pinned.name);
      if (!live) continue;                       // test 1 reports it; twice would read as two faults
      for (const f of ['gate', 'mutates', 'sessionMutates', 'alsoRequires'] as const) {
        const a = show((pinned as Record<string, unknown>)[f]);
        const b = show((live as unknown as Record<string, unknown>)[f]);
        if (a !== b) differing.push(`${pinned.name}: engine expects ${f}=${a}, catalogue declares ${f}=${b}`);
      }
    }
    expect(differing).toEqual([]);
  });
});

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

describe('8 — gate and mutates imply each other, and every exception says why', () => {
  const WRITING_GATES = new Set(['write', 'scripting', 'cmdb_write', 'atf']);
  const exempt = new Map<string, string>(
    (EXCEPTIONS.gateClasses as { id: string; tools: string[] }[])
      .flatMap((c) => c.tools.map((t) => [t, c.id] as const)));

  it('8a. a tool that mutates is never ungated', () => {
    const bad = catalogue.filter((t) => t.mutates && t.gate === 'none' && !exempt.has(t.name))
      .map((t) => t.name);
    expect(bad, 'these change the instance with no flag required').toEqual([]);
  });

  it('8b. and a writing gate implies it mutates', () => {
    // The other direction, and the one that catches a declaration drifting: a tool behind WRITE
    // that says it does not mutate is either mis-declared or wrongly gated, and both make the
    // §2.1 ask list wrong — it is built from `mutates`, not from the gate.
    const bad = catalogue
      .filter((t) => WRITING_GATES.has(t.gate) && !t.mutates && !t.sessionMutates && !exempt.has(t.name))
      .map((t) => `${t.name} (gate ${t.gate}, mutates false)`);
    expect(bad, 'gated as a write but declared not to mutate — add a class to tests/contract-exceptions.json with a reason')
      .toEqual([]);
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
      // `unsupported` joined the list in ARC-05-S06: the rule file's "not a substitute"
      // sentence names the two script-execution stubs, and it named them from a literal
      // until the contract could say which tools they are.
      const allowed = ['alsoRequires', 'gate', 'mutates', 'name', 'sessionMutates', 'table', 'unsupported'];
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

describe('5 and 6 — the flag set is closed, and no preset contradicts the dependency rule', () => {
  const declared = CONTRACT.flags.map((f: { name: string }) => f.name).sort();

  it('5. the contract, the source and every preset name the same flags', () => {
    // A seventh flag added to permissions.ts with a guard, and nowhere else, is the failure this
    // catches: the server would gate on it while the contract, the presets and the generated rule
    // file all described six.
    const source = readFileSync(resolve(here, '../src/utils/permissions.ts'), 'utf8');
    // `*_NOT_ENABLED` are error codes, not flags — the same words in the other direction.
    const referenced = [...new Set(source.match(/\b[A-Z][A-Z_]*_ENABLED\b/g) ?? [])]
      .filter((n) => !n.endsWith('_NOT_ENABLED')).sort();
    expect(referenced, 'permissions.ts references a flag the contract does not declare').toEqual(declared);
    expect([...FLAG_NAMES].sort()).toEqual(declared);
    for (const [name, values] of Object.entries(CONTRACT.presets as Record<string, Flags>)) {
      expect(Object.keys(values).sort(), `preset ${name} does not carry all six flags`).toEqual(declared);
    }
  });

  it('6. no preset turns a flag on while its prerequisite is off', () => {
    const requires = new Map<string, string[]>(
      CONTRACT.flags.map((f: { name: string; requires: string[] }) => [f.name, f.requires]));
    const broken: string[] = [];
    for (const [name, values] of Object.entries(CONTRACT.presets as Record<string, Flags>)) {
      for (const [flag, value] of Object.entries(values)) {
        if (value !== 'true') continue;
        for (const need of requires.get(flag) ?? []) {
          if (values[need as keyof Flags] !== 'true') broken.push(`${name}: ${flag} is on but ${need} is off`);
        }
      }
    }
    // A preset that did this would be resolved towards LESS access at runtime, so the instance
    // would be safe and the preset would be a lie — which is worse than a refusal, because the
    // user reads the preset and believes it.
    expect(broken).toEqual([]);
  });
});

describe('7 — a mutating name mutates, and every exception says why', () => {
  const MUTATING_SUFFIXES = new Set(['add', 'modify', 'remove', 'exec', 'publish', 'trigger',
    'switch', 'resolve', 'annotate', 'schedule', 'complete', 'retire', 'send', 'import',
    'configure', 'submit', 'order', 'assign', 'unassign', 'reconcile', 'close', 'approve',
    'reject', 'set', 'rollback', 'clone', 'upload', 'fire', 'register', 'commit', 'ensure',
    'train', 'track', 'scan']);
  const exempt = new Map<string, string>(
    (EXCEPTIONS.suffixClasses as { id: string; tools: string[] }[])
      .flatMap((c) => c.tools.map((t) => [t, c.id] as const)));

  it('7. the last segment agrees with mutates, or the tool is in a named class', () => {
    const disagreeing = catalogue
      .filter((t) => MUTATING_SUFFIXES.has(t.name.split('_').pop() as string) !== t.mutates)
      .map((t) => t.name)
      .filter((n) => !exempt.has(n));
    expect(disagreeing, 'add the tool to a class in tests/contract-exceptions.json, with a reason').toEqual([]);
  });

  it('every exception names a real tool, and every class carries a reason', () => {
    // Both lists, not just the suffix one: a gate exception is the more consequential of the two,
    // since it excuses a tool from the rule that keeps the §2.1 ask list honest.
    // An exception list is a governance surface: it says which parts of the catalogue do not
    // follow the rule and why. Left unchecked it becomes a way to make a test green — a stale
    // entry silences nothing and a reasonless one explains nothing.
    const names = new Set(catalogue.map((t) => t.name));
    const allClasses = [...EXCEPTIONS.suffixClasses, ...EXCEPTIONS.gateClasses] as
      { id: string; reason: string; tools: string[] }[];
    for (const c of allClasses) {
      expect(c.reason.length, `class ${c.id} has no reason`).toBeGreaterThan(40);
      expect(c.reason.toUpperCase()).not.toContain('TODO');
      expect(c.tools.length, `class ${c.id} exempts nothing`).toBeGreaterThan(0);
      for (const t of c.tools) expect(names.has(t), `${t} is exempted but not registered`).toBe(true);
    }
    // And each exemption is load-bearing: without it the rule would fire on that tool.
    for (const [name, id] of exempt) {
      const t = catalogue.find((x) => x.name === name)!;
      const wouldFire = MUTATING_SUFFIXES.has(t.name.split('_').pop() as string) !== t.mutates;
      expect(wouldFire, `${name} is exempted in ${id} but the rule does not fire on it`).toBe(true);
    }
  });
});

describe('11 — every code the server can throw has a meaning and a remedy', () => {
  it('11a. every literal thrown in src/ is a registry key', () => {
    // `ServiceNowError` takes the registry's union, so `tsc` already refuses an unregistered
    // literal. This is the second, independent check: a type can be widened by accident, and a
    // scan of the source notices when it has been.
    const registered = new Set<string>(ERROR_CODES.map((e) => e.code));
    const thrown = new Set<string>();
    for (const file of sourceFiles(resolve(here, '../src'))) {
      const text = readFileSync(file, 'utf8');
      for (const m of text.matchAll(/new ServiceNowError\(\s*(?:[^,]|\([^)]*\))+?,\s*'([A-Z_]+)'/gs)) {
        thrown.add(m[1]);
      }
    }
    expect([...thrown].filter((c) => !registered.has(c)).sort(),
      'add these to src/errors/codes.ts with a meaning and a remedy').toEqual([]);
    expect(thrown.size, 'the scan found nothing — it is not looking where the throws are').toBeGreaterThan(10);
  });

  it('11b. and every registry entry is usable', () => {
    const empty = ERROR_CODES.filter((e) => !e.meaning?.trim() || !e.remedy?.trim()).map((e) => e.code);
    expect(empty, 'a code with no meaning or no remedy reaches a user with nothing to do').toEqual([]);
    for (const e of ERROR_CODES) {
      expect(e.meaning.length, `${e.code}: the meaning is too short to mean anything`).toBeGreaterThan(20);
      expect(typeof e.showInRule, `${e.code}: showInRule is not declared`).toBe('boolean');
    }
  });

  it('11d. exactly these codes are rule-visible (ARC-08-S10)', () => {
    // `showInRule` decides what goes into the file every session has loaded, so the set is a
    // DESIGN decision and not an accumulation. deepEqual, not "contains": the failure this catches
    // is the one nobody would report — a code quietly added to the always-loaded file, or one
    // quietly taken back out after the story that put it there was signed off.
    //
    // Three groups, and each is here for a different reason:
    //   the six flag gates      a session can raise a preset for the user (one wildcard line)
    //   the six state codes     something about the instance or the call must change first
    //   the seven network codes  the machine cannot reach the instance; retrying is the wrong move
    const expected = [
      'ATF_NOT_ENABLED', 'AUTHENTICATION_FAILED', 'CMDB_WRITE_NOT_ENABLED', 'CONNECTION_REFUSED',
      'CONNECTION_TIMEOUT', 'DNS_FAILURE', 'FLUENT_NOT_ENABLED', 'FLUENT_NOT_INSTALLED',
      'INSTANCE_NOT_LOADED',
      'INSUFFICIENT_PRIVILEGES', 'NOW_ASSIST_NOT_ENABLED', 'NO_INSTANCE_CONFIGURED',
      'PROD_WRITE_NOT_ACKNOWLEDGED', 'PROXY_AUTH_REQUIRED', 'PROXY_UNREACHABLE',
      'SCRIPTING_NOT_ENABLED', 'TLS_CA_UNTRUSTED', 'UNKNOWN_TOOL', 'WRITE_NOT_ENABLED',
    ];
    const actual = ERROR_CODES.filter((e) => e.showInRule).map((e) => e.code as string).sort();
    expect(actual).toEqual(expected);
    // And the contract carries the same set — the rule file renders from THAT, so a `dist/` that
    // is one compile behind would render yesterday's section from today's registry.
    expect(CONTRACT.errorCodes.filter((e: { showInRule: boolean }) => e.showInRule)
      .map((e: { code: string }) => e.code).sort()).toEqual(expected);
  });

  it('11e. every flag gate has a registry entry named from FLAG_NAMES', () => {
    // The `*_NOT_ENABLED` family is derived, never listed: `evaluateGate` refuses with the name
    // built from the flag, the rule file's wildcard names the flags from the contract, and this
    // asserts the registry holds an entry for each. A seventh flag then fails HERE — with the code
    // it needs an entry for — instead of reaching a user as a code with no remedy attached.
    const registered = new Set(ERROR_CODES.map((e) => e.code as string));
    for (const flag of FLAG_NAMES) {
      const code = `${flag.replace('_ENABLED', '')}_NOT_ENABLED`;
      expect(registered.has(code), `${code} has no registry entry`).toBe(true);
      const entry = ERROR_CODES.find((e) => (e.code as string) === code);
      expect(entry?.showInRule, `${code} is not rule-visible`).toBe(true);
    }
  });

  it('11c. a schema advertises what its handler enforces', () => {
    // The `default_name` class, from the ARC-05-S06 amendment. Two halves: a required property is
    // marked required, and a property nobody reads is not advertised. The second half is the one
    // that caught the original — `default_name` was advertised for a handler that never read it,
    // so nothing failed until a caller trusted the schema.
    const problems: string[] = [];
    for (const file of sourceFiles(resolve(here, '../src/tools'))) {
      const text = readFileSync(file, 'utf8');
      // `x is required` refusals name the property in the message, which is where a caller looks.
      for (const m of text.matchAll(/'([a-z_]+) is required/g)) {
        const prop = m[1];
        // The enclosing handler, not the nearest tool DEFINITION: refusals live in the dispatch
        // switch, a long way from the manifest, and "the last name above it" picks a neighbour.
        const near = text.slice(0, m.index);
        const tool = [...near.matchAll(/case '(snow_[a-z0-9_]+)':/g)].pop()?.[1];
        if (!tool) continue;
        const def = catalogue.find((t) => t.name === tool);
        const schema = def?.inputSchema as { required?: string[] } | undefined;
        if (schema && !(schema.required ?? []).includes(prop)) {
          problems.push(`${tool}: refuses without "${prop}" but its schema does not mark it required`);
        }
      }
    }
    expect([...new Set(problems)]).toEqual([]);
  });
});

describe('12, 13 and 14 — the committed artefacts are the ones the code produces', () => {
  it('12. buildContract() in-process is byte-identical to the committed contract', async () => {
    // The extractor is plain JavaScript with no declaration file, and it should stay that way: a
    // hand-written .d.ts would be a second statement of its signature, free to drift from the one
    // that matters. `@ts-expect-error` rather than a cast, because it fails loudly if the module
    // ever gains types — at which point this line should go, not be quietly kept.
    // @ts-expect-error — untyped .mjs; the assertion below is what checks the shape
    const { buildContract } = await import('../scripts/extract-tools.mjs');
    const manifest = JSON.parse(readFileSync(resolve(here, '../dist/tools-manifest.json'), 'utf8'));
    const rebuilt = await buildContract(manifest);
    const committed = readFileSync(resolve(here, '../dist/contract.json'), 'utf8');
    expect(rebuilt, 'dist/contract.json is not what the extractor now produces — run node scripts/build-dist.mjs')
      .toBe(committed);
  });

  it('13. the engine pin still describes the committed contract', () => {
    const committed = readFileSync(resolve(here, '../dist/contract.json'), 'utf8');
    const sha = createHash('sha256').update(committed).digest('hex');
    expect(sha, 'contract sha changed — on the engine side run node packages/contract/pin.mjs')
      .toBe(REQUIRED.contractSha256);
  });

  it('14. the server key is the one engine.config.json declares', () => {
    expect(CONTRACT.server.suggestedName).toBe(ENGINE_CONFIG.mcp.serverKey);
    expect(REQUIRED.serverKey).toBe(ENGINE_CONFIG.mcp.serverKey);
  });
});
