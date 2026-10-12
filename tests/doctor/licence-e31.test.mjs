// Copyright 2026 Cvetomir Grigorov. Licensed under the Apache License, Version 2.0 (see LICENSE).
// snowarch — AI ServiceNow Architect. Not affiliated with or endorsed by ServiceNow, Inc.
// ARC-11-C1 — E-31, the licence: in the quick set, offline. From ARC-11-C6 step 5 a refused state (missing, invalid,
// expired, revoked) is a FAIL, the one cause a doctor names for a licence that is not in force; expiring is a warning.
//
// Enforcement is on every build (ARC-11-C6): the CLI and the server refuse without a licence, and the
// doctor is one of the commands a person needs to see why, so it runs and says so, with the refusal's
// remedy. ARC-11-C6 step 5 makes a refused state a FAIL.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { engineChecks } from '../../tools/snowarch/lib/doctor/checks/index.mjs';
import { LAST_UNENFORCED_RELEASE, WAY_BACK } from '../../tools/snowarch/lib/doctor/checks/licence.mjs';
import { statusCommand } from '../../tools/snowarch/lib/commands/status.mjs';
import { spellings } from '../../tools/snowarch/lib/text.mjs';
import { greenTree } from './helpers/tree.mjs';
import { licencePath } from '../../tools/snowarch/lib/local-paths.mjs';
import { writeListCache } from '../../tools/snowarch/lib/licence/state.mjs';
import { keyPair, licence, licenceText, listDoc, productKeys } from '../../tools/snowarch/tests/helpers/licence.mjs';
import { tempDir } from '../../tools/snowarch/tests/helpers/temp.mjs';

const primary = keyPair();
const KEYS = productKeys(primary, keyPair());
const NOW = new Date('2026-10-10T12:00:00Z');
const E31 = engineChecks().find((c) => c.id === 'E-31');

function ctxFor(t, { file = null, env = {} } = {}) {
  const root = tempDir('snowarch-e31-', t);
  mkdirSync(join(root, '.local'), { recursive: true });
  if (file !== null) writeFileSync(licencePath(root), file);
  return { root, env, platform: process.platform, home: '', flags: {}, now: () => NOW.getTime(), licenceKeys: KEYS };
}

test('ARC-11-C1 — E-31 is declared once: repo section, fail, quick, offline, spawns nothing, never fixed', () => {
  assert.equal(engineChecks().filter((c) => c.id === 'E-31').length, 1);
  assert.deepEqual(
    [E31.section, E31.severity, E31.quick, E31.network, E31.spawns, E31.fixable],
    ['repo', 'fail', true, false, false, false],
  );
});

test('ARC-11-C6 — no licence is a FAIL, with the line the banner prints and the refusal\'s remedy', async (t) => {
  const r = await E31.run(ctxFor(t));
  assert.equal(r.status, 'fail');
  assert.equal(r.detail, 'Licence: missing');
  assert.match(r.remedy, /^Run .+ licence check to see why, then install a valid licence as \.local\/licence\.json\./);
  assert.match(r.command, /licence check$/);
});

test('ARC-11-C6 step 6 — E-31\'s remedy ends with the way back, to the last release that runs without a licence', async (t) => {
  // v2.0.12, named once: 2.0.13 is the first release that refuses without a licence (C6), so going back to escape
  // enforcement means that one, whichever release a checkout came from.
  assert.equal(LAST_UNENFORCED_RELEASE, 'v2.0.12');
  const ctx = ctxFor(t);
  const cli = spellings({ platform: ctx.platform, env: ctx.env }).cli;
  assert.equal(WAY_BACK(cli), `To go back to the last release that runs without a licence: ${cli} upgrade --to v2.0.12.`);
  for (const file of [null, licenceText(licence({ valid_until: '2026-10-01' }), primary)]) {
    const r = await E31.run(ctxFor(t, { file }));
    assert.equal(r.status, 'fail');
    assert.match(r.remedy, /^Run .+ licence check to see why, then install a valid licence as \.local\/licence\.json\./);
    assert.ok(r.remedy.endsWith(`restart it afterwards. ${WAY_BACK(cli)}`), r.remedy);
  }
  // A licence in its last month is in force: its warning has no way back to offer.
  const soon = await E31.run(ctxFor(t, { file: licenceText(licence({ valid_until: '2026-10-25' }), primary) }));
  assert.equal(soon.remedy.includes('upgrade --to'), false, soon.remedy);
});

test('ARC-11-C1 — a licence in force is ok; one in its last month is a warning; a forged one is a FAIL that says why', async (t) => {
  const ok = await E31.run(ctxFor(t, { file: licenceText(licence(), primary) }));
  assert.deepEqual([ok.status, ok.detail], ['ok', 'Licence: ok · LIC-2026-0002 · until 2027-10-10']);
  const soon = await E31.run(ctxFor(t, { file: licenceText(licence({ valid_until: '2026-10-25' }), primary) }));
  assert.equal(soon.status, 'warn');
  assert.match(soon.detail, /^Licence: expiring · LIC-2026-0002 · until 2026-10-25 — /);
  const doc = JSON.parse(licenceText(licence(), primary));
  doc.licence.org = 'Another Org';
  const forged = await E31.run(ctxFor(t, { file: JSON.stringify(doc) }));
  assert.equal(forged.status, 'fail');
  assert.match(forged.detail, /^Licence: invalid — the signature does not match the content$/);
});

test('ARC-11-C6 — an expired licence and a revoked one are FAILs too, each with the reason and the remedy', async (t) => {
  const expired = await E31.run(ctxFor(t, { file: licenceText(licence({ valid_until: '2026-10-01' }), primary) }));
  assert.equal(expired.status, 'fail');
  assert.equal(expired.detail, 'Licence: expired — expired on 2026-10-01');
  assert.match(expired.remedy, /licence check to see why/);

  const ctx = ctxFor(t, { file: licenceText(licence(), primary) });
  writeListCache(ctx.root, { checkedAt: '2026-10-10T00:00:00Z', source: 'test',
    list: listDoc({ version: 1, revoked: [{ id: 'LIC-2026-0002', revokedAt: '2026-10-09', reason: 'ended' }] }, primary) });
  const revoked = await E31.run(ctx);
  assert.equal(revoked.status, 'fail');
  assert.equal(revoked.detail, 'Licence: revoked — revoked on 2026-10-09 (ended)');
  assert.match(revoked.remedy, /licence check to see why/);
});

test('ARC-11-C1 — E-31\'s data names the state and the id, never the licensee or the org', async (t) => {
  const r = await E31.run(ctxFor(t, { file: licenceText(licence(), primary) }));
  assert.deepEqual(Object.keys(r.data).sort(),
    ['enforced', 'id', 'listVersion', 'perpetual', 'scope', 'state', 'validUntil']);
  assert.equal(JSON.stringify(r).includes('Test Licensee'), false);
});

test('ARC-11-C1 — a perpetual licence says so, and its data carries the word the status panel prints', async (t) => {
  // The status panel renders its Licence line from this data with the banner's function, and a
  // perpetual licence has no `validUntil` to print: without `perpetual` the panel would have to
  // re-derive the core's rule, or print `until null`.
  const { valid_until: _, ...forever } = licence({ id: 'LIC-2026-0001' });
  const r = await E31.run(ctxFor(t, { file: licenceText(forever, primary) }));
  assert.deepEqual([r.status, r.detail], ['ok', 'Licence: ok · LIC-2026-0001 · perpetual']);
  assert.deepEqual([r.data.perpetual, r.data.validUntil], [true, null]);
});

test('ARC-11-C1 — a report spells E-31\'s command for the shell the run was TOLD about, not the machine\'s', async (t) => {
  // The Windows cells' failure, driven from any machine: the status fixtures are captured with the shell
  // pinned to `linux`, and E-31 spelled its command for the machine instead — `.\snowarch.cmd` into a POSIX
  // fixture. ARC-07-W17's rule, that the doctor renders for the shell it was told about, now reaches the
  // checks as it already reached the Mode line. The expectation is derived from the product's own speller.
  const root = greenTree(t);
  for (const platform of ['win32', 'linux']) {
    const chunks = [];
    await statusCommand({ out: { write: (s) => chunks.push(s) }, cwd: root, flags: { json: true }, home: root,
      env: {}, platform });
    const e31 = JSON.parse(chunks.join('')).checks.find((c) => c.id === 'E-31');
    assert.equal(e31.command, `${spellings({ platform, env: {} }).cli} licence check`, platform);
  }
});
