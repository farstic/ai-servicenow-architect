import { describe, expect, it } from 'vitest';
import {
  currentInstance, currentInstanceOrNull, outsideInstance, runWithInstance,
  FLAG_NAMES, type Flags, type InstanceRuntime,
} from '../../src/servicenow/context.js';
import { expandPreset, isWriteEnabled, requireWrite } from '../../src/utils/permissions.js';
import type { ServiceNowError } from '../../src/utils/errors.js';

/**
 * Criterion 6 — two calls in flight at once each see their own instance.
 *
 * This is the property the whole story exists for: one server process holding a PDI and a
 * customer's production instance, where `snow_core_instance_switch prod` makes writes
 * refuse without a second process. Before ARC-04-S03 the flags were read from `process.env`
 * at gate time, so "the current instance" was a single global — and two interleaved calls
 * could not disagree about it even in principle.
 */
function rt(label: string, flags: Flags, over: Partial<InstanceRuntime> = {}): InstanceRuntime {
  return {
    label,
    url: `https://${label}.service-now.com`,
    environment: label === 'prod' ? 'prod' : 'pdi',
    preset: label === 'prod' ? 'read-only' : 'pdi-developer',
    flags,
    effectiveFlags: flags,
    toolPackage: 'full',
    maxRecords: 100,
    prodWriteAck: false,
    client: {} as InstanceRuntime['client'],
    warnings: [],
    ...over,
  };
}

const PDI = rt('pdi', expandPreset('pdi-developer'));
const PROD = rt('prod', expandPreset('read-only'));

/** A tick of real asynchrony, so the two calls genuinely interleave rather than run in order. */
const tick = () => new Promise((r) => { setTimeout(r, 0); });

describe('criterion 6 - AsyncLocalStorage isolation under Promise.all', () => {
  it('two concurrent calls each see their own instance', async () => {
    const observe = (expected: string) => async () => {
      expect(currentInstance().label).toBe(expected);
      await tick();
      // After the await is the part that matters: a naive "current instance" variable would
      // have been overwritten by the other call by now.
      expect(currentInstance().label).toBe(expected);
      return { label: currentInstance().label, write: isWriteEnabled() };
    };

    const [a, b] = await Promise.all([
      runWithInstance(PDI, observe('pdi')),
      runWithInstance(PROD, observe('prod')),
    ]);

    expect(a).toEqual({ label: 'pdi', write: true });
    expect(b).toEqual({ label: 'prod', write: false });
  });

  it('the gates disagree concurrently — one refuses while the other allows', async () => {
    const attempt = async () => {
      await tick();
      try { requireWrite(); return 'allowed'; } catch (e) { return (e as ServiceNowError).code; }
    };

    const [onPdi, onProd] = await Promise.all([
      runWithInstance(PDI, attempt),
      runWithInstance(PROD, attempt),
    ]);

    expect(onPdi).toBe('allowed');
    expect(onProd).toBe('WRITE_NOT_ENABLED');
  });

  it('many interleaved calls never cross-contaminate', async () => {
    // Twenty alternating instances with a real await inside each: if the carrier leaked,
    // at this width it would show as at least one mismatch rather than as a flake.
    const results = await Promise.all(
      Array.from({ length: 20 }, (_, i) => {
        const instance = i % 2 === 0 ? PDI : PROD;
        return runWithInstance(instance, async () => {
          await tick();
          return `${i % 2 === 0 ? 'pdi' : 'prod'}=${currentInstance().label}`;
        });
      }),
    );
    expect(results.filter((r) => r.split('=')[0] !== r.split('=')[1])).toEqual([]);
  });

  it('a nested run restores the outer instance when it returns', async () => {
    await runWithInstance(PDI, async () => {
      expect(currentInstance().label).toBe('pdi');
      await runWithInstance(PROD, async () => {
        await tick();
        expect(currentInstance().label).toBe('prod');
      });
      expect(currentInstance().label).toBe('pdi');
    });
  });
});

describe('currentInstance outside a run', () => {
  it('throws NO_INSTANCE_CONFIGURED with the remedy, rather than returning a permissive default', () => {
    outsideInstance(() => {
      try {
        currentInstance();
        throw new Error('expected a throw');
      } catch (e) {
        expect((e as ServiceNowError).code).toBe('NO_INSTANCE_CONFIGURED');
        expect((e as ServiceNowError).message).toContain('./snowarch instance add');
      }
    });
  });

  it('currentInstanceOrNull returns null instead, for callers that must not throw', () => {
    outsideInstance(() => { expect(currentInstanceOrNull()).toBeNull(); });
    runWithInstance(PDI, () => { expect(currentInstanceOrNull()?.label).toBe('pdi'); });
  });
});

describe('the runtime shape', () => {
  it('carries all six flags, both declared and effective', () => {
    runWithInstance(PDI, () => {
      const r = currentInstance();
      expect(Object.keys(r.effectiveFlags).sort()).toEqual([...FLAG_NAMES].sort());
      expect(Object.keys(r.flags).sort()).toEqual([...FLAG_NAMES].sort());
    });
  });
});
