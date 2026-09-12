// ARC-08-S07 — the old doctor's 39 checks, and where each of them went.
//
// The table is DATA and this test reads the data, not the markdown — a test that parsed the page
// would pass on a page that had drifted from the registry, which is the failure the page exists to
// prevent. What it does read from disk is the OLD SCRIPT: the ids this table claims to account for
// have to be the ids that script really assigns, in both directions, because a table written from
// memory is a table with a row missing.
//
// HAND-OFF TAKEN (ARC-10-S03, 2026-09-12). The old script is deleted and the two cross-check cases
// went with it, as S07 asked. They are not replaced and no copy was kept: the table WAS audited
// against the real script while it was here — both directions, 38 ids — and that audit is the thing
// of value, not a fixture of a file the product no longer ships. The originals are readable at the
// import tag: `git show import/engine-v2.8.0-worktree:scripts/legacy/doctor.sh` (1,141 lines).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { isRetired, labelFor, MAPPING, mappedIds,
  unmappedIds } from '../../tools/snowarch/lib/doctor/mapping.mjs';
import { engineChecks } from '../../tools/snowarch/lib/doctor/checks/index.mjs';
import { REAL_ROOT } from './helpers/tree.mjs';
import { mappingTable } from '../../scripts/gen-doctor-docs.mjs';

const registryIds = engineChecks().map((c) => c.id);

// AC 1.
test('every D00…D37 appears exactly once', () => {
  const ids = MAPPING.map((r) => r.old);
  assert.equal(ids.length, 38, `the table has ${ids.length} rows, not 38`);
  assert.equal(new Set(ids).size, ids.length, 'an old id appears twice');
  for (let n = 0; n <= 37; n += 1) {
    const id = `D${String(n).padStart(2, '0')}`;
    assert.ok(ids.includes(id), `${id} is not accounted for`);
  }
  // D16 and D31 are ONE row each, noting their parts — the story's shape, and the reason the count
  // is 38 rather than the script's 39 assignments (D17 is assigned twice there).
  assert.match(MAPPING.find((r) => r.old === 'D16').intent, /a–d/);
  assert.match(MAPPING.find((r) => r.old === 'D31').intent, /;.*;/);
});

// AC 1, second half.
test('every new id the table names exists in the registry', () => {
  for (const id of mappedIds()) {
    assert.ok(registryIds.includes(id), `${id} is mapped but no check has that id`);
  }
  // Not vacuous: the table really does name ids.
  assert.ok(mappedIds().length > 20, 'the table maps suspiciously few ids');
});

// AC 2.
test('every retired row names the ARC or story that made it unnecessary', () => {
  const retired = MAPPING.filter(isRetired);
  assert.ok(retired.length >= 4, `only ${retired.length} rows read as retired`);
  for (const row of retired) {
    assert.match(row.note, /ARC-\d\d(-S\d\d)?|P-\d\d|D-\d\d/,
      `${row.old} is retired and names no ARC, story or decision: ${row.note}`);
  }
});

test('a row with no new id is either retired or carried by the runner, and says which', () => {
  for (const row of MAPPING.filter((r) => r.ids.length === 0)) {
    assert.ok(isRetired(row) || /runner|exit 3/.test(labelFor(row)),
      `${row.old} names no new id and does not say where its intent went`);
  }
});

// AC 3.
test('the new-checks list is the registry minus the mapped ids, computed', () => {
  const fresh = unmappedIds(registryIds);
  assert.deepEqual(fresh, registryIds.filter((id) => !mappedIds().includes(id)));
  // The story listed E-09 and SV-05 as BOTH mapped and new; computing removes that double count.
  assert.equal(fresh.includes('E-09'), false, 'E-09 is mapped from D31 and cannot also be new');
  assert.equal(fresh.includes('SV-05'), false, 'SV-05 is mapped from D22 and cannot also be new');
  // SV-08 post-dates the story and belongs here.
  assert.ok(fresh.includes('SV-08'));
  assert.equal(fresh.length + new Set(mappedIds()).size, registryIds.length,
    'a registry id is neither mapped nor listed as new');
});

test('the rendered appendix is what the generator produces', () => {
  const page = readFileSync(join(REAL_ROOT, 'docs/ARCHITECTURE.md'), 'utf8');
  const open = '<!-- generated:doctor-mapping -->';
  const close = '<!-- /generated:doctor-mapping -->';
  const start = page.indexOf(open);
  const stop = page.indexOf(close, start);
  assert.ok(start !== -1 && stop !== -1, 'the appendix region is not in the page');
  assert.equal(page.slice(start + open.length, stop).trim(), mappingTable().trim(),
    'the committed appendix is not what the generator renders — run npm run gen');
  // And the Doctor section points at it.
  assert.match(page, /Appendix: the old doctor's checks/);
});
