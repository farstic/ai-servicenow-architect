import { describe, expect, it } from 'vitest';
import type { ErrorCodeName } from '../../src/errors/codes.js';
import { ServiceNowError } from '../../src/utils/errors.js';
import {
  outsideInstance, runWithInstance, FLAG_NAMES, type Flags, type InstanceRuntime,
} from '../../src/servicenow/context.js';
import {
  applyDependencyRule, checkPresetMismatch, checkProdPosture, evaluateGate, expandPreset,
  gateError, isAtfEnabled, isCmdbWriteEnabled, isFluentEnabled, isNowAssistEnabled,
  isScriptingEnabled, isWriteEnabled, PRESETS, remedyPreset, requireAtf, requireCmdbWrite, requireFluent,
  requireNowAssist, requireScripting, requireWrite, type GateName, type PresetName,
} from '../../src/utils/permissions.js';

/**
 * The gates, per instance.
 *
 * What this replaces: the previous file drove `process.env` directly — `process.env
 * .WRITE_ENABLED = 'true'` then `requireWrite()`. That was an accurate test of the
 * behaviour P-03 describes and the exact thing this story removes: flags belonged to the
 * process, so one server could not hold a PDI and a customer's production instance at
 * once. Nothing here touches the environment.
 */
const flags = (over: Partial<Flags> = {}): Flags =>
  Object.fromEntries(FLAG_NAMES.map((f) => [f, over[f] ?? 'false'])) as Flags;

function runtime(over: Partial<InstanceRuntime> = {}): InstanceRuntime {
  const effective = over.effectiveFlags ?? flags();
  return {
    label: 'pdi',
    url: 'https://dev1.service-now.com',
    environment: 'pdi',
    preset: 'custom',
    flags: effective,
    effectiveFlags: effective,
    toolPackage: 'full',
    maxRecords: 100,
    prodWriteAck: false,
    client: {} as InstanceRuntime['client'],
    warnings: [],
    ...over,
  };
}

const asInstance = <T>(rt: Partial<InstanceRuntime>, fn: () => T): T => runWithInstance(runtime(rt), fn);

describe('expandPreset — criterion 5, the 01 §6.3 table exactly', () => {
  it('read-only is six false', () => {
    expect(expandPreset('read-only')).toEqual({
      WRITE_ENABLED: 'false', CMDB_WRITE_ENABLED: 'false', SCRIPTING_ENABLED: 'false',
      ATF_ENABLED: 'false', NOW_ASSIST_ENABLED: 'false', FLUENT_ENABLED: 'false',
    });
  });

  it('pdi-developer is WRITE, CMDB_WRITE, SCRIPTING, ATF true; NOW_ASSIST and FLUENT false', () => {
    expect(expandPreset('pdi-developer')).toEqual({
      WRITE_ENABLED: 'true', CMDB_WRITE_ENABLED: 'true', SCRIPTING_ENABLED: 'true',
      ATF_ENABLED: 'true', NOW_ASSIST_ENABLED: 'false', FLUENT_ENABLED: 'false',
    });
  });

  it('full is six true', () => {
    expect(expandPreset('full')).toEqual({
      WRITE_ENABLED: 'true', CMDB_WRITE_ENABLED: 'true', SCRIPTING_ENABLED: 'true',
      ATF_ENABLED: 'true', NOW_ASSIST_ENABLED: 'true', FLUENT_ENABLED: 'true',
    });
  });

  it('every preset returns all six names explicitly — never a partial object', () => {
    for (const p of ['read-only', 'pdi-developer', 'full'] as const) {
      expect(Object.keys(expandPreset(p)).sort()).toEqual([...FLAG_NAMES].sort());
    }
  });

  it('custom takes the store flags, and an absent flag reads as false', () => {
    expect(expandPreset('custom', { WRITE_ENABLED: 'true' })).toEqual(
      flags({ WRITE_ENABLED: 'true' }),
    );
    expect(expandPreset('custom')).toEqual(flags());
  });

  it('PRESETS is exported unchanged for the contract (S06 emits this table)', () => {
    expect(PRESETS['read-only']).toEqual(expandPreset('read-only'));
    expect(PRESETS['pdi-developer']).toEqual(expandPreset('pdi-developer'));
    expect(PRESETS.full).toEqual(expandPreset('full'));
  });
});

describe('applyDependencyRule — criterion 3', () => {
  it('SCRIPTING without WRITE is forced false and reported once', () => {
    const r = applyDependencyRule(flags({ SCRIPTING_ENABLED: 'true' }), 'x');
    expect(r.effective.SCRIPTING_ENABLED).toBe('false');
    expect(r.warnings).toHaveLength(1);
    expect(r.warnings[0]).toContain('FLAG_DEPENDENCY_VIOLATION');
    expect(r.warnings[0]).toContain('instance "x"');
  });

  it('CMDB_WRITE without WRITE is forced false', () => {
    const r = applyDependencyRule(flags({ CMDB_WRITE_ENABLED: 'true' }), 'x');
    expect(r.effective.CMDB_WRITE_ENABLED).toBe('false');
    expect(r.warnings).toHaveLength(1);
  });

  it('both dependents at once produce two warnings, not one', () => {
    const r = applyDependencyRule(flags({ SCRIPTING_ENABLED: 'true', CMDB_WRITE_ENABLED: 'true' }), 'x');
    expect(r.warnings).toHaveLength(2);
  });

  it('with WRITE present nothing is changed and nothing is warned', () => {
    const input = flags({ WRITE_ENABLED: 'true', SCRIPTING_ENABLED: 'true', CMDB_WRITE_ENABLED: 'true' });
    const r = applyDependencyRule(input, 'x');
    expect(r.effective).toEqual(input);
    expect(r.warnings).toEqual([]);
  });

  it('ATF, NOW_ASSIST and FLUENT do not depend on WRITE', () => {
    const input = flags({ ATF_ENABLED: 'true', NOW_ASSIST_ENABLED: 'true', FLUENT_ENABLED: 'true' });
    const r = applyDependencyRule(input, 'x');
    expect(r.effective).toEqual(input);
    expect(r.warnings).toEqual([]);
  });

  it('the default label is used when none is given', () => {
    expect(applyDependencyRule(flags({ SCRIPTING_ENABLED: 'true' })).warnings[0]).toContain('"unknown"');
  });
});

describe('checkPresetMismatch — criterion 4', () => {
  it('a named preset whose stored flags differ is reported, naming the differing flags', () => {
    const w = checkPresetMismatch('pdi-developer', { FLUENT_ENABLED: 'true' }, 'pdi');
    expect(w).toHaveLength(1);
    expect(w[0]).toContain('PRESET_FLAGS_MISMATCH');
    expect(w[0]).toContain('FLUENT_ENABLED');
    expect(w[0]).toContain('instance "pdi"');
  });

  it('a named preset whose stored flags agree is silent', () => {
    expect(checkPresetMismatch('pdi-developer', PRESETS['pdi-developer'], 'pdi')).toEqual([]);
  });

  it('a flag the store omits is not a mismatch — absent is not the same as different', () => {
    expect(checkPresetMismatch('full', { WRITE_ENABLED: 'true' }, 'pdi')).toEqual([]);
  });

  it('custom can never mismatch — its flags ARE the definition', () => {
    expect(checkPresetMismatch('custom', { WRITE_ENABLED: 'true' }, 'pdi')).toEqual([]);
  });

  it('the default label is used when none is given', () => {
    expect(checkPresetMismatch('full', { WRITE_ENABLED: 'false' })[0]).toContain('"unknown"');
  });
});

describe('checkProdPosture — D-05, criterion 2', () => {
  const base = { label: 'prod', environment: 'prod', preset: 'full', prodWriteAck: false };

  it('prod raised above read-only without the acknowledgement is refused, with the --ack-prod remedy', () => {
    const r = checkProdPosture({ ...base, effectiveFlags: expandPreset('full') });
    expect(r.ok).toBe(false);
    expect(r.code).toBe('PROD_WRITE_NOT_ACKNOWLEDGED');
    expect(r.message).toContain('./snowarch instance set-preset prod full --ack-prod');
    expect(r.message).toContain('PROD_WRITE_NOT_ACKNOWLEDGED');
  });

  it('ANY flag counts, not only WRITE — an ATF-only custom instance still runs tests against production', () => {
    const r = checkProdPosture({
      ...base, preset: 'custom', effectiveFlags: flags({ ATF_ENABLED: 'true' }),
    });
    expect(r.ok).toBe(false);
    expect(r.message).toContain('set-preset prod custom --ack-prod');
  });

  it('prod at read-only is fine without any acknowledgement', () => {
    expect(checkProdPosture({ ...base, preset: 'read-only', effectiveFlags: expandPreset('read-only') }).ok).toBe(true);
  });

  it('prod with the acknowledgement loads', () => {
    expect(checkProdPosture({ ...base, prodWriteAck: true, effectiveFlags: expandPreset('full') }).ok).toBe(true);
  });

  it('a non-prod environment is never gated by this rule', () => {
    for (const environment of ['pdi', 'dev', 'test']) {
      expect(checkProdPosture({ ...base, environment, effectiveFlags: expandPreset('full') }).ok).toBe(true);
    }
  });
});

describe('evaluateGate — one implementation, shared with the contract', () => {
  const on = (...names: Array<keyof Flags>) => flags(Object.fromEntries(names.map((n) => [n, 'true'])));

  it('none is always allowed, even with every flag false', () => {
    expect(evaluateGate('none', false, flags())).toEqual({ ok: true });
    expect(evaluateGate('none', true, flags())).toEqual({ ok: true });
  });

  it('write', () => {
    expect(evaluateGate('write', false, flags()).code).toBe('WRITE_NOT_ENABLED');
    expect(evaluateGate('write', false, on('WRITE_ENABLED')).ok).toBe(true);
  });

  it('cmdb_write names WRITE first when WRITE is what is missing — the pre-existing order', () => {
    expect(evaluateGate('cmdb_write', false, flags()).code).toBe('WRITE_NOT_ENABLED');
    expect(evaluateGate('cmdb_write', false, on('CMDB_WRITE_ENABLED')).code).toBe('WRITE_NOT_ENABLED');
    expect(evaluateGate('cmdb_write', false, on('WRITE_ENABLED')).code).toBe('CMDB_WRITE_NOT_ENABLED');
    expect(evaluateGate('cmdb_write', false, on('WRITE_ENABLED', 'CMDB_WRITE_ENABLED')).ok).toBe(true);
  });

  it('scripting behaves the same way', () => {
    expect(evaluateGate('scripting', false, on('SCRIPTING_ENABLED')).code).toBe('WRITE_NOT_ENABLED');
    expect(evaluateGate('scripting', false, on('WRITE_ENABLED')).code).toBe('SCRIPTING_NOT_ENABLED');
    expect(evaluateGate('scripting', false, on('WRITE_ENABLED', 'SCRIPTING_ENABLED')).ok).toBe(true);
  });

  it('atf and now_assist stand alone', () => {
    expect(evaluateGate('atf', false, flags()).code).toBe('ATF_NOT_ENABLED');
    expect(evaluateGate('atf', false, on('ATF_ENABLED')).ok).toBe(true);
    expect(evaluateGate('now_assist', false, flags()).code).toBe('NOW_ASSIST_NOT_ENABLED');
    expect(evaluateGate('now_assist', false, on('NOW_ASSIST_ENABLED')).ok).toBe(true);
  });

  it('fluent needs WRITE only when the operation mutates', () => {
    expect(evaluateGate('fluent', false, flags()).code).toBe('FLUENT_NOT_ENABLED');
    expect(evaluateGate('fluent', false, on('FLUENT_ENABLED')).ok).toBe(true);
    expect(evaluateGate('fluent', true, on('FLUENT_ENABLED')).code).toBe('WRITE_NOT_ENABLED');
    expect(evaluateGate('fluent', true, on('FLUENT_ENABLED', 'WRITE_ENABLED')).ok).toBe(true);
  });

  it('every gate name is covered by this suite', () => {
    const covered: GateName[] = ['none', 'write', 'cmdb_write', 'scripting', 'atf', 'now_assist', 'fluent'];
    for (const g of covered) expect(() => evaluateGate(g, false, flags())).not.toThrow();
    expect(covered).toHaveLength(7);
  });

  it('missing[] names the flag the caller has to change', () => {
    expect(evaluateGate('cmdb_write', false, on('WRITE_ENABLED')).missing).toEqual(['CMDB_WRITE_ENABLED']);
    expect(evaluateGate('fluent', true, on('FLUENT_ENABLED')).missing).toEqual(['WRITE_ENABLED']);
  });
});

describe('the require* wrappers read the ambient instance', () => {
  it('each one throws with its own code when its flag is absent', () => {
    const cases: Array<[() => void, string]> = [
      [requireWrite, 'WRITE_NOT_ENABLED'],
      [requireCmdbWrite, 'WRITE_NOT_ENABLED'],
      [requireScripting, 'WRITE_NOT_ENABLED'],
      [requireAtf, 'ATF_NOT_ENABLED'],
      [requireNowAssist, 'NOW_ASSIST_NOT_ENABLED'],
      [requireFluent, 'FLUENT_NOT_ENABLED'],
    ];
    for (const [fn, code] of cases) {
      asInstance({ effectiveFlags: flags() }, () => {
        try { fn(); throw new Error(`expected ${code}`); } catch (e) {
          expect((e as ServiceNowError).code).toBe(code);
        }
      });
    }
  });

  it('each one passes when its flags are present', () => {
    asInstance({ effectiveFlags: expandPreset('full') }, () => {
      expect(() => { requireWrite(); requireCmdbWrite(); requireScripting(); requireAtf();
        requireNowAssist(); requireFluent(); }).not.toThrow();
    });
  });

  it('the is*Enabled helpers agree with the require* functions', () => {
    asInstance({ effectiveFlags: expandPreset('pdi-developer') }, () => {
      expect(isWriteEnabled()).toBe(true);
      expect(isCmdbWriteEnabled()).toBe(true);
      expect(isScriptingEnabled()).toBe(true);
      expect(isAtfEnabled()).toBe(true);
      expect(isNowAssistEnabled()).toBe(false);
      expect(isFluentEnabled()).toBe(false);
    });
  });

  it('outside any instance a gate throws NO_INSTANCE_CONFIGURED rather than allowing the call', () => {
    // A gate that cannot tell which instance it is protecting must not decide it is allowed.
    //
    // `outsideInstance` is needed because tests/setup.ts enters a runtime before every test:
    // without it this property would be untestable, and "untestable" is how it would quietly
    // stop being true.
    outsideInstance(() => {
      try { requireWrite(); throw new Error('expected a throw'); } catch (e) {
        expect((e as ServiceNowError).code).toBe('NO_INSTANCE_CONFIGURED');
      }
      try { isWriteEnabled(); throw new Error('expected a throw'); } catch (e) {
        expect((e as ServiceNowError).code).toBe('NO_INSTANCE_CONFIGURED');
      }
    });
  });
});

describe('the refusal message names the instance and the remedy — criterion 5 of the review', () => {
  it('a non-prod instance is told which preset to set', () => {
    asInstance({ label: 'prod-lookalike', preset: 'read-only', environment: 'dev' }, () => {
      try { requireWrite(); } catch (e) {
        const m = (e as ServiceNowError).message;
        expect(m).toBe('Write operations are disabled for instance "prod-lookalike" (preset read-only). '
          + 'Run: ./snowarch instance set-preset prod-lookalike pdi-developer');
      }
    });
  });

  it('a prod instance is told it is capped, and that raising it needs --ack-prod', () => {
    asInstance({ label: 'prod', preset: 'read-only', environment: 'prod' }, () => {
      try { requireWrite(); } catch (e) {
        const m = (e as ServiceNowError).message;
        expect(m).toContain('Instance "prod" is tagged prod and capped at read-only');
        expect(m).toContain('./snowarch instance set-preset prod <preset> --ack-prod');
      }
    });
  });

  it('each code carries its own sentence', () => {
    const expected: Array<[() => void, string]> = [
      [requireCmdbWrite, 'CMDB write operations are disabled'],
      [requireScripting, 'Scripting operations are disabled'],
      [requireAtf, 'ATF test execution is disabled'],
      [requireNowAssist, 'Now Assist / AI features are disabled'],
      [requireFluent, 'Fluent / now-sdk operations are disabled'],
    ];
    asInstance({ effectiveFlags: flags({ WRITE_ENABLED: 'true' }) }, () => {
      for (const [fn, text] of expected) {
        try { fn(); } catch (e) { expect((e as ServiceNowError).message).toContain(text); }
      }
    });
  });

  it('the remedy names the SMALLEST preset that actually enables the missing flag', () => {
    // Shipped wrong in S03: the remedy hard-coded `pdi-developer`, so a FLUENT or
    // NOW_ASSIST refusal on an instance ALREADY at pdi-developer told the reader to set
    // the preset they were on — a remedy that changes nothing. Those two are only in `full`.
    expect(remedyPreset(['WRITE_ENABLED'])).toBe('pdi-developer');
    expect(remedyPreset(['CMDB_WRITE_ENABLED'])).toBe('pdi-developer');
    expect(remedyPreset(['SCRIPTING_ENABLED'])).toBe('pdi-developer');
    expect(remedyPreset(['ATF_ENABLED'])).toBe('pdi-developer');
    expect(remedyPreset(['NOW_ASSIST_ENABLED'])).toBe('full');
    expect(remedyPreset(['FLUENT_ENABLED'])).toBe('full');
    // Nothing missing: the least permissive preset is enough, and it is never `custom`.
    expect(remedyPreset([])).toBe('read-only');
    expect(remedyPreset()).toBe('read-only');
    // A combination takes the smallest preset that covers BOTH.
    expect(remedyPreset(['WRITE_ENABLED', 'FLUENT_ENABLED'])).toBe('full');
  });

  it('a flag no preset enables falls back to full rather than returning undefined', () => {
    // The defensive branch, exercised rather than ignored: if a seventh flag is added to
    // FLAG_NAMES and forgotten in the PRESETS table, `find` returns undefined and the
    // remedy would read "set-preset pdi undefined". The cast is how a future mistake is
    // simulated today — there is no legal value that reaches this branch yet.
    expect(remedyPreset(['SOMETHING_NEW' as never])).toBe('full');
  });

  it('each family suggests a preset that would actually work', () => {
    const cases: Array<[() => void, PresetName, string]> = [
      [requireAtf, 'read-only', 'pdi-developer'],
      [requireNowAssist, 'pdi-developer', 'full'],
      [requireFluent, 'pdi-developer', 'full'],
    ];
    for (const [fn, preset, expected] of cases) {
      asInstance({ preset, effectiveFlags: expandPreset(preset) }, () => {
        try { fn(); throw new Error('expected a throw'); } catch (e) {
          const m = (e as ServiceNowError).message;
          expect(m).toContain(`set-preset pdi ${expected}`);
          // The suggestion must differ from what the instance already has.
          expect(m).not.toContain(`set-preset pdi ${preset}`);
        }
      });
    }
  });

  it('an unrecognised code still produces a usable sentence rather than "undefined"', () => {
    asInstance({}, () => {
        // The cast is the point of the case, not a way around the type. Since ARC-05-S06 the
        // code is the registry's union, so this literal cannot occur by accident — but the
        // runtime path it exercises is still reachable: a flag added to the contract before its
        // code reaches the registry arrives here as a string nobody registered, and the sentence
        // a user reads must not become "undefined".
      expect(gateError({ ok: false, code: 'SOMETHING_NEW' as ErrorCodeName }).message).toContain('Operation is disabled');
      expect(gateError({ ok: false }).message).toContain('Write operations are disabled');
    });
  });
});

describe('criterion 8 — the environment does not reach a store-defined instance', () => {
  it('WRITE_ENABLED=true in process.env has no effect on the runtime flags', () => {
    const saved = process.env.WRITE_ENABLED;
    process.env.WRITE_ENABLED = 'true';
    try {
      asInstance({ effectiveFlags: expandPreset('read-only') }, () => {
        expect(isWriteEnabled()).toBe(false);
        expect(() => requireWrite()).toThrow(/Write operations are disabled/);
      });
    } finally {
      if (saved === undefined) delete process.env.WRITE_ENABLED; else process.env.WRITE_ENABLED = saved;
    }
  });
});
