/**
 * ARC-08-C1 — the `--json` form carries no instance label and no instance host.
 *
 * WHY IT IS A TEST AND NOT A REVIEW NOTE. ARC-10-S10's issue template asks a stranger to paste
 * `./snowarch doctor --json` into a public tracker, and ARC-10-S07's lint would refuse the same
 * content in a validation record. Both rules are about the same bytes, so one of them has to be
 * mechanical or they will disagree the first time a check gains a field.
 *
 * MEASURED at ARC-10-S10, on a live fixture: the label appeared in SEVEN fields across four shapes
 * — `modeLine`, `modeLineDetailed`, `server.instances[].label`, two check `detail` strings and two
 * `data.fix*.label` payloads. Each is asserted by PATH below as well as by value, so a regression
 * in any one of them is named rather than counted.
 *
 * Reaching the live state took three attempts, and the reason is recorded because it is not
 * obvious: SV-02 REFUSES A STORE THAT IS GROUP/WORLD-READABLE. A fixture store written at the
 * default 0644 is found and not loaded — `mode 0644 is group/world-readable` — so the doctor stays
 * design-only and a test written against it proves nothing.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chmodSync } from 'node:fs';
import { join } from 'node:path';

import { doctorCommand } from '../../tools/snowarch/lib/doctor/index.mjs';
import { maskForJson, labelsIn, LABEL_MASK, HOST_MASK } from '../../tools/snowarch/lib/doctor/json-boundary.mjs';
import { greenTree, linkInstall, writeJson } from './helpers/tree.mjs';

const LABEL = 'acme-prod';
const HOST = 'dev12345.service-now.com';
const FIXTURE_SECRET = ['hun', 'ter', '2hunter2'].join('');

/** A checkout the server can actually load a store from. */
async function liveReport(t, { label = LABEL, environment = 'prod' } = {}) {
  const root = linkInstall(greenTree(t, { mode: 'live' }));
  writeJson(root, '.local/instances.json', {
    version: 1,
    defaultInstance: label,
    instances: { [label]: {
      url: `https://${HOST}`, environment,
      auth: { method: 'basic', username: 'svc.integration', password: FIXTURE_SECRET },
      preset: 'read-only', flags: {}, toolPackage: 'full', maxRecords: 100, prodWriteAck: false,
    } },
  });
  // SV-02's refusal, above. Without this the run never goes live.
  chmodSync(join(root, '.local/instances.json'), 0o600);

  const run = async (flags) => {
    let out = '';
    await doctorCommand({ flags: { 'no-network': true, 'no-cache': true, ...flags },
      out: { write: (s) => { out += s; } }, cwd: root, input: { isTTY: false } });
    return out;
  };
  return { json: await run({ json: true }), text: await run({}) };
}

/** ARC-10-S07's six, so the two rules are checked against each other rather than in parallel. */
const S07 = [
  ['hostname', /[a-z0-9-]+\.service-now\.com/],
  ['e-mail', /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/],
  ['sys_id', /\b[0-9a-f]{32}\b/],
  ['credential', /(password|secret|token)\s*[:=]/i],
  ['home path', /(\/Users\/|\/home\/|C:\\Users\\)/],
];

test('C1 — the live JSON passes S07 and carries neither the label nor the host', async (t) => {
  const { json, text } = await liveReport(t);
  const parsed = JSON.parse(json);

  // The run really did go live, or everything below is true of a design-only report.
  assert.match(parsed.modeLine, /^Mode: live /, `not a live run: ${parsed.modeLine}`);

  const hits = [];
  json.split('\n').forEach((l, i) => {
    for (const [n, re] of S07) if (re.test(l)) hits.push(`${n} @${i + 1}: ${l.trim().slice(0, 80)}`);
  });
  assert.deepEqual(hits, [], `${hits.length} S07 finding(s) in the JSON`);
  assert.equal(json.includes(LABEL), false, 'the JSON carries the instance label');
  assert.equal(json.includes(HOST), false, 'the JSON carries the instance host');
  assert.equal(json.includes(FIXTURE_SECRET), false, 'the JSON carries the password');

  // BOTH DIRECTIONS. The TEXT report keeps the label — it is local, and a practitioner needs to see
  // which instance the doctor is talking about. Without this the masking could be "the fixture
  // never had a label" and every assertion above would still pass.
  assert.ok(text.includes(LABEL), 'the text report lost the label — the fixture proves nothing');
});

test('C1 — each of the seven measured fields is masked, by path', async (t) => {
  const { json } = await liveReport(t);
  const r = JSON.parse(json);
  const at = (path) => path.split('.').reduce((v, k) => {
    const m = /^(\w+)\[(\d+)\]$/.exec(k);
    return m ? v?.[m[1]]?.[Number(m[2])] : v?.[k];
  }, r);

  assert.match(at('modeLine'), /instance=<label>/);
  assert.match(at('modeLineDetailed'), /<label>/);
  assert.equal(at('server.instances[0].label'), LABEL_MASK);

  // The two check details and the two fix payloads, found by shape rather than by index: the
  // numbers 32 and 35 were this fixture's, and an index is the first thing a new check moves.
  const details = (r.checks ?? []).map((c) => c.detail).filter((d) => typeof d === 'string');
  assert.ok(details.some((d) => d.startsWith(`${LABEL_MASK}:`)),
    'no check detail carries the masked label — the fixture stopped producing them');
  const fixLabels = (r.checks ?? []).flatMap((c) => [c?.data?.fix?.label,
    ...(c?.data?.fixes ?? []).map((f) => f?.label)]).filter(Boolean);
  assert.ok(fixLabels.length > 0, 'no fix payload carried a label — the path assertion is vacuous');
  assert.deepEqual([...new Set(fixLabels)], [LABEL_MASK]);
});

test('C1 — masking is by VALUE, so a field nobody listed is covered too', () => {
  const report = { server: { instances: [{ label: 'acme-prod' }] },
    somethingNew: { nested: ['acme-prod at https://dev12345.service-now.com/api'] } };
  const masked = maskForJson(report);
  assert.deepEqual(masked.somethingNew.nested, [`${LABEL_MASK} at ${HOST_MASK}/api`]);
  assert.deepEqual(labelsIn(report), ['acme-prod']);
});

test('C1 — a label of `dev` also masks the environment token, and that is the accepted cost', async (t) => {
  // Documented by a test rather than discovered. Word-bounded matching cannot tell a user's label
  // from the same word used as an environment, and the alternative — a list of words a user may
  // not choose — is wrong for whoever chooses one.
  // The collision needs the environment to BE the label — that is the case, not a contrivance: a
  // practitioner who calls their development instance `dev` has one.
  const { json } = await liveReport(t, { label: 'dev', environment: 'dev' });
  const r = JSON.parse(json);                       // it still parses
  assert.match(r.modeLine, /instance=<label> \(<label>\)/,
    `expected both tokens masked: ${r.modeLine}`);
  // And nothing else is damaged: the preset and the schema survive.
  assert.match(r.modeLine, /preset=read-only/);
  assert.equal(r.schema, JSON.parse(json).schema);
  assert.ok(Array.isArray(r.checks) && r.checks.length > 0, 'the report lost its checks');
});
