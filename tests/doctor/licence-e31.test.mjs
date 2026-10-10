// ARC-11-C1 — E-31, the licence: a warning and never a failure, in the quick set, offline.
//
// The owner's first requirement is that everything keeps working exactly as now, and today nobody has
// a licence. So the default — no file, no enforcement — must be one WARN line in the doctor and
// nothing else: a FAIL would fail bootstrap's closing check, the status panel and CI on every
// machine. Enforcement does not change that either; what enforcement refuses is the CLI and the
// server, and the doctor is one of the commands a person needs to see why.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { engineChecks } from '../../tools/snowarch/lib/doctor/checks/index.mjs';
import { licencePath } from '../../tools/snowarch/lib/local-paths.mjs';
import { keyPair, licence, licenceText, productKeys } from '../../tools/snowarch/tests/helpers/licence.mjs';
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

test('ARC-11-C1 — E-31 is declared once: repo section, warn, quick, offline, spawns nothing, never fixed', () => {
  assert.equal(engineChecks().filter((c) => c.id === 'E-31').length, 1);
  assert.deepEqual(
    [E31.section, E31.severity, E31.quick, E31.network, E31.spawns, E31.fixable],
    ['repo', 'warn', true, false, false, false],
  );
});

test('ARC-11-C1 — no licence is one warning, with the line the banner prints', async (t) => {
  const r = await E31.run(ctxFor(t));
  assert.equal(r.status, 'warn');
  assert.equal(r.detail, 'Licence: missing · warn only');
  assert.match(r.command, /licence check$/);
});

test('ARC-11-C1 — enforcement makes it say "enforced", and it is still a warning', async (t) => {
  const r = await E31.run(ctxFor(t, { env: { SNOW_LICENCE_ENFORCE: 'true' } }));
  assert.equal(r.status, 'warn');
  assert.equal(r.detail, 'Licence: missing · enforced');
});

test('ARC-11-C1 — a licence in force is ok; one in its last month is a warning; a forged one is a warning that says why', async (t) => {
  const ok = await E31.run(ctxFor(t, { file: licenceText(licence(), primary) }));
  assert.deepEqual([ok.status, ok.detail], ['ok', 'Licence: ok · LIC-2026-0002 · until 2027-10-10']);
  const soon = await E31.run(ctxFor(t, { file: licenceText(licence({ valid_until: '2026-10-25' }), primary) }));
  assert.equal(soon.status, 'warn');
  assert.match(soon.detail, /^Licence: expiring · LIC-2026-0002 · until 2026-10-25 · warn only/);
  const doc = JSON.parse(licenceText(licence(), primary));
  doc.licence.org = 'Another Org';
  const forged = await E31.run(ctxFor(t, { file: JSON.stringify(doc) }));
  assert.equal(forged.status, 'warn');
  assert.match(forged.detail, /^Licence: invalid · warn only — the signature does not match the content$/);
});

test('ARC-11-C1 — E-31\'s data names the state and the id, never the licensee or the org', async (t) => {
  const r = await E31.run(ctxFor(t, { file: licenceText(licence(), primary) }));
  assert.deepEqual(Object.keys(r.data).sort(), ['enforced', 'id', 'listVersion', 'scope', 'state', 'validUntil']);
  assert.equal(JSON.stringify(r).includes('Test Licensee'), false);
});
