// Copyright 2026 Cvetomir Grigorov. Licensed under the Business Source License 1.1 (see LICENSE).
// snowarch — AI ServiceNow Architect. Not affiliated with or endorsed by ServiceNow, Inc.
/**
 * ARC-09-C199 — the SessionStart banner reads `.local/upgrade-check.json` as E-28 does.
 *
 * Found by the cross-version sweep. The banner nudged on `behind && latestTag && fresh` alone, so a record E-28 does
 * not take as a currency measurement (ARC-09-C47's three rules), or takes as up to date (ARC-09-C210), still nudged a
 * checkout that was not behind: one an upgrade wrote, one from another tree, one naming a prerelease, one no newer
 * than this release. Each fixture runs through both readers on the same checkout, and the banner speaks exactly where
 * E-28 warns that a release is available. Two readers, one meaning, ARC-09-C196's class.
 *
 * E-28 runs with the network allowed, and git answers only `describe --tags --exact-match`, with the fixture's tag;
 * `ls-remote` is refused, so a record E-28 does not take as a measurement can only end in "could not list".
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { banner } from '../../tools/snowarch/hooks/session-start.mjs';
import { doctorCommand } from '../../tools/snowarch/lib/doctor/index.mjs';
import { hostChecks } from '../../tools/snowarch/lib/doctor/checks/host.mjs';
import { writeUpgradeCheck } from '../../tools/snowarch/lib/upgrade-check.mjs';
import { linkInstall, releaseTree } from '../doctor/helpers/tree.mjs';

const E28 = hostChecks().find((c) => c.id === 'E-28');
const NOW = Date.now();
const HOUR = 60 * 60 * 1000;

/** A release tree at `version`, the hook tests' own linked install, with its cache written by the doctor itself. */
async function checkout(t, version) {
  const root = linkInstall(releaseTree(t, version));
  await doctorCommand({ flags: { quick: true, 'no-network': true, json: true }, out: { write: () => {} }, cwd: root,
    input: { isTTY: false } });
  return root;
}

/** Does E-28 warn that a release is available? */
async function e28Speaks(root, here, latestTag) {
  const exec = (_cmd, args) => {
    if (args.includes('describe')) return here ? `${here}\n` : '';
    throw Object.assign(new Error('no network in this test'), { stderr: 'fatal: refused by the test' });
  };
  const r = await E28.run({ root, flags: {}, now: () => NOW, exec });
  return r.status === 'warn' && String(r.detail).startsWith(`${latestTag} available`);
}

/** Does the banner print the upgrade nudge? The cache is fresh, so the doctor must not run. */
async function bannerSpeaks(root) {
  const r = await banner({ root, now: NOW, run: () => { throw new Error('the doctor was re-run'); } });
  assert.equal(r.path, 'cache', 'precondition: the banner took its cache path');
  return r.lines.some((l) => /^A newer release is available \(/.test(l));
}

// [what the record is, the tree's version of record, the record's fields, whether both readers speak]
const CASES = [
  ['a fresh currency measurement that says behind, the control', '9.1.0',
    { localTag: 'v9.1.0', latestTag: 'v9.2.0', behind: true }, true],
  ['a record an upgrade wrote', '9.1.0',
    { source: 'upgrade', localTag: 'v9.1.0', latestTag: 'v9.2.0', behind: true }, false],
  ['a record from another tree', '9.1.0',
    { localTag: 'v9.0.0', latestTag: 'v9.2.0', behind: true }, false],
  ['a record that names a prerelease', '9.1.0',
    { localTag: 'v9.1.0', latestTag: 'v9.2.0-rc.1', behind: true }, false],
  ['a record no newer than this release (ARC-09-C210)', '9.1.0',
    { localTag: null, latestTag: 'v9.1.0', behind: true }, false],
  ['a development tree, where neither reader knows its release, and another tree\'s localTag', '9.2.0-dev',
    { localTag: 'v9.0.0', latestTag: 'v9.2.0', behind: true }, true],
];

for (const [name, version, fields, speaks] of CASES) {
  test(`ARC-09-C199 — ${name}: ${speaks ? 'the banner nudges where E-28 warns' : 'the banner is silent where E-28 does not warn'}`,
    async (t) => {
      const root = await checkout(t, version);
      writeUpgradeCheck(root, { remote: 'origin', ...fields, now: () => new Date(NOW - HOUR) });
      const here = /-dev\b/.test(version) ? null : `v${version}`;
      // E-28 first: it is the reader the banner must agree with, and this holds the fixture to what E-28 does.
      assert.equal(await e28Speaks(root, here, fields.latestTag), speaks, 'E-28 itself');
      assert.equal(await bannerSpeaks(root), speaks, 'the banner reads the record otherwise than E-28');
    });
}
