import { test } from 'node:test';
import assert from 'node:assert/strict';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ContractPinMismatch, expandPreset, flagNames, loadContract, presetNames,
} from '../../packages/contract/lib/contract.mjs';

/**
 * ARC-05 acceptance, B05-05 — ARC-05-S10's three criteria, none of which had a unit test.
 *
 * `expandPreset` and `ContractPinMismatch` existed only in `lib/contract.mjs` and in two engine
 * steps that call them; `tests/contract/no-literals.test.mjs` asserts nobody spells the flag names
 * by hand, which is a different claim. What was never asserted is that the loader does what the
 * story says when the pin is stale, and that the dependency rule refuses the pair it names.
 *
 * Stdlib only, as AC 1 requires: this file imports `node:*` and the loader, and nothing else.
 */
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const CONTRACT = 'packages/snowarch/dist/contract.json';
const PIN = 'packages/contract/required-tools.json';

test('B05-05 AC 1 — the contract declares six flags, loaded with no dependency but the stdlib', () => {
  const c = loadContract();
  assert.equal(flagNames(c).length, 6);
  // Named, not just counted: a contract that lost one flag and gained another would keep the six.
  assert.deepEqual(flagNames(c), ['WRITE_ENABLED', 'CMDB_WRITE_ENABLED', 'SCRIPTING_ENABLED',
    'ATF_ENABLED', 'NOW_ASSIST_ENABLED', 'FLUENT_ENABLED']);
  assert.deepEqual(presetNames(c), ['read-only', 'pdi-developer', 'full']);
});

test('B05-05 AC 2 — a stale pin throws ContractPinMismatch naming both shas; verifyPin:false loads', () => {
  // A fixture root, because the claim is about a pin that DISAGREES and the committed pair agrees.
  const dir = mkdtempSync(join(tmpdir(), 'contract-loader-'));
  try {
    for (const rel of [CONTRACT, PIN]) {
      mkdirSync(join(dir, dirname(rel)), { recursive: true });
      copyFileSync(join(root, rel), join(dir, rel));
    }
    const pin = JSON.parse(readFileSync(join(dir, PIN), 'utf8'));
    const pinned = pin.contractSha256;
    pin.contractSha256 = 'f'.repeat(64);
    writeFileSync(join(dir, PIN), `${JSON.stringify(pin, null, 2)}\n`);

    assert.throws(() => loadContract({ root: dir }), (err) => {
      assert.ok(err instanceof ContractPinMismatch, `threw ${err.name}`);
      assert.equal(err.name, 'ContractPinMismatch');
      // BOTH shas, which is the criterion: an error naming only one leaves the reader to go and
      // compute the other before they can act.
      assert.equal(err.pinned, 'f'.repeat(64));
      assert.notEqual(err.actual, err.pinned);
      assert.match(err.message, /contract sha mismatch: pinned f{12}… committed [0-9a-f]{12}…/);
      assert.match(err.message, /run node packages\/contract\/pin\.mjs and review the proposal/);
      return true;
    });

    // …and the escape hatch still loads the SAME contract, which is what makes it an escape hatch
    // rather than a second code path.
    const loaded = loadContract({ root: dir, verifyPin: false });
    assert.equal(flagNames(loaded).length, 6);
    assert.notEqual(pinned, 'f'.repeat(64), 'fixture: the pin was already the fake sha');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('B05-05 AC 3 — the dependency rule refuses the pair it names, and pdi-developer expands', () => {
  const c = loadContract();
  assert.throws(
    () => expandPreset(c, 'custom', { SCRIPTING_ENABLED: 'true' }),
    /^Error: SCRIPTING_ENABLED requires WRITE_ENABLED$/,
    'the error must name the PAIR — "invalid flags" sends the reader to look at all six',
  );
  // The other direction: the same pair, satisfied, is allowed.
  assert.doesNotThrow(() => expandPreset(c, 'custom',
    { SCRIPTING_ENABLED: 'true', WRITE_ENABLED: 'true' }));

  // The §6.3 row, in full. Asserted as the whole object rather than field by field: a preset that
  // gained a seventh flag would otherwise pass every individual check.
  assert.deepEqual(expandPreset(c, 'pdi-developer'), {
    WRITE_ENABLED: 'true', CMDB_WRITE_ENABLED: 'true', SCRIPTING_ENABLED: 'true',
    ATF_ENABLED: 'true', NOW_ASSIST_ENABLED: 'false', FLUENT_ENABLED: 'false',
  });
  // And an unknown preset names what IS declared, so the reader does not have to go looking.
  assert.throws(() => expandPreset(c, 'nonesuch'),
    /unknown preset "nonesuch" — the contract declares read-only, pdi-developer, full/);
});
