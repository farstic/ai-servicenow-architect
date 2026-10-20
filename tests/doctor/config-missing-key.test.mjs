// Copyright 2026 Cvetomir Grigorov. Licensed under the Business Source License 1.1 (see LICENSE).
// snowarch — AI ServiceNow Architect. Not affiliated with or endorsed by ServiceNow, Inc.
/**
 * ARC-09-C209 — a configuration missing a key `loadConfig` requires is E-06's FAIL, never a crash of the doctor.
 *
 * Found by ARC-09-C208's runtime guard: with docs.pin, docs.family, mcp.serverKey or floors.node absent, `runDoctor`
 * reached `loadConfig` through `versionInfo`, which threw "engine.config.json is missing: …", and the CLI ended in a
 * Node stack trace. E-06 exists to say exactly this, with its remedy; a doctor must never crash on the thing it is
 * there to diagnose.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { doctorCommand } from '../../tools/snowarch/lib/doctor/index.mjs';
import { EXIT_FAIL } from '../../tools/snowarch/lib/exit.mjs';
import { greenTree, readJson, writeJson } from './helpers/tree.mjs';

/** The four keys `loadConfig` (tools/snowarch/lib/config.mjs) requires. */
const REQUIRED = ['docs.pin', 'docs.family', 'mcp.serverKey', 'floors.node'];

async function doctorAt(root, flags) {
  const chunks = [];
  const code = await doctorCommand({ flags: { 'no-network': true, ...flags }, cwd: root,
    out: { write: (s) => chunks.push(String(s)) }, err: { write: () => {} }, input: { isTTY: false } });
  return { code, text: chunks.join('') };
}

for (const key of REQUIRED) {
  test(`ARC-09-C209 — with ${key} absent, the doctor reports E-06 FAIL with its remedy and exits 1`, async (t) => {
    const root = greenTree(t);
    const config = readJson(root, 'engine.config.json');
    const [section, name] = key.split('.');
    delete config[section][name];
    writeJson(root, 'engine.config.json', config);
    assert.equal(readJson(root, 'engine.config.json')[section]?.[name], undefined, `the fixture still has ${key}`);

    const json = await doctorAt(root, { json: true });
    const e06 = JSON.parse(json.text).checks.find((c) => c.id === 'E-06');
    assert.equal(e06?.status, 'fail', JSON.stringify(e06));
    assert.ok(e06.detail.includes(`\`${key}\` is missing`), e06.detail);
    assert.equal(e06.remedy, 'restore with `git checkout -- engine.config.json`');
    assert.equal(json.code, EXIT_FAIL);

    const text = await doctorAt(root, {});
    assert.equal(text.code, EXIT_FAIL);
    assert.match(text.text, new RegExp(`E-06 +FAIL +engine\\.config\\.json: .*\`${key.replace('.', '\\.')}\` is missing`),
      text.text);
  });
}
