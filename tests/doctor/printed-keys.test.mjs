// Copyright 2026 Cvetomir Grigorov. Licensed under the Business Source License 1.1 (see LICENSE).
// snowarch — AI ServiceNow Architect. Not affiliated with or endorsed by ServiceNow, Inc.
/**
 * ARC-09-C208 — no doctor line prints a configuration key as a masked first.last name.
 *
 * The static guard (`tools/snowarch/tests/printed-redaction.test.mjs`) reads the engine's sentences, but a key spliced
 * into one at run time is not in any of them: E-06 builds `${name} is missing` from a table of keys, so with
 * `docs.pin` absent the doctor printed "d***.p*** is missing". This case runs the doctor itself, its real checks and
 * the runner's redaction, over a configuration with the keys of that table absent, and reads what a user would see.
 *
 * Not every key: `loadConfig` requires docs.pin, docs.family, mcp.serverKey and floors.node, and with one of them
 * absent the doctor stops before E-06 runs (ARC-09-C209). So those four stay, docs.pin present but not a sha, and the
 * other eight are absent.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chmodSync } from 'node:fs';
import { join } from 'node:path';

import { doctorCommand } from '../../tools/snowarch/lib/doctor/index.mjs';
import { redactResult } from '../../tools/snowarch/lib/doctor/redact.mjs';
import { redact } from '../../tools/snowarch/lib/redact.mjs';
import { CHECK_IDS, TABLE, remedyFor } from '../../tools/snowarch/lib/remedies.mjs';
import { MASKED } from './helpers/masked.mjs';
import { greenTree, linkInstall, readJson, writeJson } from './helpers/tree.mjs';

/** E-06's table (`configProblems` in doctor/checks/engine-repo.mjs), less the four `loadConfig` requires. */
const ABSENT = ['product', 'cli', 'mcp.package', 'mcp.packageDir', 'floors.git', 'floors.claudeCode', 'roster.skills',
  'roster.agents'];

async function doctorAt(root, flags) {
  const chunks = [];
  const code = await doctorCommand({ flags: { 'no-network': true, ...flags }, cwd: root,
    out: { write: (s) => chunks.push(String(s)) }, err: { write: () => {} }, input: { isTTY: false } });
  return { code, text: chunks.join('') };
}

test('ARC-09-C208 — with E-06\'s keys absent or invalid, the doctor names each key and masks none', async (t) => {
  const root = greenTree(t);
  const config = readJson(root, 'engine.config.json');
  for (const key of ABSENT) {
    const path = key.split('.');
    const parent = path.slice(0, -1).reduce((o, k) => o?.[k], config);
    delete parent[path.at(-1)];
  }
  config.docs.pin = 'ba513f2';
  writeJson(root, 'engine.config.json', config);
  const written = readJson(root, 'engine.config.json');
  assert.deepEqual([written.mcp?.package, written.docs?.pin], [undefined, 'ba513f2'], 'the fixture was not written');

  const text = await doctorAt(root, {});
  const json = await doctorAt(root, { json: true });
  const e06 = JSON.parse(json.text).checks.find((c) => c.id === 'E-06');
  assert.equal(e06?.status, 'fail', `E-06 did not report the configuration: ${JSON.stringify(e06)}`);
  assert.match(e06.detail, /`mcp\.package` is missing/, e06.detail);
  assert.match(e06.detail, /`docs\.pin` is not a 40-character sha/, e06.detail);
  for (const [form, out] of [['text', text.text], ['json', json.text]]) {
    const masked = out.split('\n').filter((l) => MASKED.test(l));
    assert.deepEqual(masked, [], `the ${form} report prints a masked key:\n  ${masked.join('\n  ')}`);
  }
});

test('ARC-09-C208 — every remedy, rendered for win32, darwin and linux, prints with no masked key', () => {
  // The case above sees only this machine's remedies: the doctor's checks measure the machine, so a macOS run renders
  // `brew install git` and never `winget install Git.Git`, which every Windows cell printed as `G***.G***` (run
  // 39418593899). Each row is rendered here for all three platforms, through the runner's redaction and the logger's.
  const rendered = [];
  for (const id of CHECK_IDS) {
    for (const platform of ['win32', 'darwin', 'linux']) {
      const sentence = TABLE[id][platform] ?? TABLE[id].default;
      const values = Object.fromEntries([...sentence.matchAll(/\{(\w+)\}/g)].map(([, key]) => [key, 'x']));
      const remedy = remedyFor(id, { platform, values });
      rendered.push(remedy);
      for (const printed of [redactResult({ remedy }).remedy, redact(remedy)]) {
        assert.doesNotMatch(printed, MASKED, `${id} on ${platform}: "${remedy}" prints as "${printed}"`);
      }
    }
  }
  // The floor: every row, three times, so a table that read empty cannot pass.
  assert.equal(rendered.length, CHECK_IDS.length * 3);
  assert.ok(CHECK_IDS.length >= 6, `only ${CHECK_IDS.length} remedy row(s) read`);
});

test('ARC-09-C208 — the masked-token pattern finds what redact prints, and not a key in backticks', () => {
  assert.equal(MASKED.test('E-06 FAIL engine.config.json: d***.p*** is missing'), true);
  assert.equal(MASKED.test('E-06 FAIL engine.config.json: `docs.pin` is missing'), false);
  assert.equal(MASKED.test('signed in as j***.s***'), true);
});

test('ARC-09-C211 — a store with an unknown key: SV-02 names the key path in backticks, and masks none', async (t) => {
  // The server joins zod's path with dots and the runner's redaction read it as a first.last name: C210's probe
  // printed SV-02 as "i***.p*** Unrecognized key(s) in object: 'notes'". A live checkout whose server can load the
  // store, as json-boundary.test.mjs builds one, with an unknown key under the instance `pdi`.
  const root = linkInstall(greenTree(t, { mode: 'live' }));
  writeJson(root, '.local/instances.json', {
    version: 1,
    defaultInstance: 'pdi',
    instances: { pdi: {
      url: 'https://dev12345.service-now.com', environment: 'pdi',
      auth: { method: 'basic', username: 'admin', password: 'fixture-only' },
      preset: 'read-only', flags: {}, toolPackage: 'full', maxRecords: 100, prodWriteAck: false,
      notes: 'an unknown key',
    } },
  });
  chmodSync(join(root, '.local/instances.json'), 0o600);
  const run = async (flags) => (await doctorAt(root, { 'no-cache': true, ...flags })).text;
  const json = await run({ json: true });
  const text = await run({});
  const sv02 = JSON.parse(json).checks.find((c) => c.id === 'SV-02');
  assert.match(sv02?.detail ?? '', /`instances\.pdi` Unrecognized key\(s\) in object: 'notes'/, JSON.stringify(sv02));
  for (const [form, out] of [['text', text], ['json', json]]) {
    const masked = out.split('\n').filter((l) => MASKED.test(l));
    assert.deepEqual(masked, [], `the ${form} report prints a masked key:\n  ${masked.join('\n  ')}`);
  }
});
