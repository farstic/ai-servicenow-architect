// ARC-08-S07 — the old doctor's 39 checks, and where each of them went.
//
// The table is DATA and this test reads the data, not the markdown — a test that parsed the page
// would pass on a page that had drifted from the registry, which is the failure the page exists to
// prevent. What it does read from disk is the OLD SCRIPT: the ids this table claims to account for
// have to be the ids that script really assigns, in both directions, because a table written from
// memory is a table with a row missing.
//
// HAND-OFF: ARC-10-S03 deletes `scripts/legacy/`. When it does, the two cross-check cases below go
// with the file — they are the only reason it is still read — and the rest of this suite stands on
// its own. Do not keep a copy of the script to keep them alive; the table will have been audited
// against it by then, which is the whole point of having done it now.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { isRetired, labelFor, MAPPING, mappedIds,
  unmappedIds } from '../../tools/snowarch/lib/doctor/mapping.mjs';
import { engineChecks } from '../../tools/snowarch/lib/doctor/checks/index.mjs';
import { mappingTable } from '../../scripts/gen-doctor-docs.mjs';
import { REAL_ROOT } from './helpers/tree.mjs';

const registryIds = engineChecks().map((c) => c.id);
const LEGACY = join(REAL_ROOT, 'scripts/legacy/doctor.sh');

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

/**
 * The two cases that read the old script. ARC-10-S03 deletes it; delete these with it.
 */
test('every D id in the table is one the old script really assigns', { skip: !existsSync(LEGACY) }, () => {
  const script = readFileSync(LEGACY, 'utf8');
  const assigned = new Set([...script.matchAll(/CHECK_ID="(D\d+)"/g)].map((m) => m[1]));
  assert.equal(assigned.size, 38, `the script assigns ${assigned.size} distinct ids`);
  for (const row of MAPPING) {
    assert.ok(assigned.has(row.old), `${row.old} is in the table and not in the old script`);
  }
});

test('the old script assigns no id the table omits', { skip: !existsSync(LEGACY) }, () => {
  const script = readFileSync(LEGACY, 'utf8');
  const assigned = [...new Set([...script.matchAll(/CHECK_ID="(D\d+)"/g)].map((m) => m[1]))];
  const listed = new Set(MAPPING.map((r) => r.old));
  const missing = assigned.filter((id) => !listed.has(id));
  assert.deepEqual(missing, [], `the old script checks ${missing.join(', ')} and the table does not`);
});
