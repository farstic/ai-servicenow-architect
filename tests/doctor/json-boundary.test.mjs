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
import { dirname, join } from 'node:path';

import { doctorCommand } from '../../tools/snowarch/lib/doctor/index.mjs';
import { maskForJson, labelsIn, LABEL_MASK, HOST_MASK, HOME_MASK, homeValues } from '../../tools/snowarch/lib/doctor/json-boundary.mjs';
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

test('C1 — a home directory is masked, in every shape a platform writes one', () => {
  // ARC-08-C1 second pass, and the reason it is a UNIT test rather than another fixture run: the fixture's own
  // temp root is home-shaped on ONE platform. `C:/Users/runneradmin/AppData/Local/Temp/...` on a
  // Windows runner matches S07's home-path pattern; `/var/folders/...` on macOS and `/tmp/...` on
  // Linux do not. So the live scan above passed on two platforms while the product leaked the
  // user's account name on all three, and only the Windows cell said so. A table of shapes cannot
  // have that accident.
  const cases = [
    ['/Users/alice/work/repo', `${HOME_MASK}/work/repo`],
    ['/home/carol/p', `${HOME_MASK}/p`],
    [String.raw`C:\Users\bob\src\repo`, `${HOME_MASK}\\src\\repo`],
    ['C:/Users/runneradmin/AppData/Local/Temp/x', `${HOME_MASK}/AppData/Local/Temp/x`],
    [String.raw`D:\Users\runneradmin\AppData\Local\Temp\x`, `${HOME_MASK}\\AppData\\Local\\Temp\\x`],
  ];
  for (const [from, to] of cases) assert.equal(maskForJson({ p: from }).p, to, `not masked: ${from}`);

  // The negatives, and they are the half that keeps the rule useful: a path that names nobody keeps
  // every character. `D:\a\...` is the CI runner's own checkout; `/var/folders` is macOS's temp.
  for (const keep of ['/var/folders/xy/T/z', '/tmp/snowarch-doctor-abc',
    String.raw`D:\a\ai-servicenow-architect\ai-servicenow-architect`]) {
    assert.equal(maskForJson({ p: keep }).p, keep, `masked something that names nobody: ${keep}`);
  }

  // What survives is what a maintainer reading a pasted report actually uses.
  assert.equal(maskForJson({ p: '/Users/alice/my work/repo' }).p, `${HOME_MASK}/my work/repo`);
});

test('C1 — the three fields that carried the checkout path are masked, by path', () => {
  // Measured on a real (non-fixture) run of this repository before the fix: `checks[].detail`,
  // `checks[].data.root` and `checks[].data.toplevel`, each reading `/Users/<me>/work/<repo>`.
  // Asserted by path as well as by value, so a regression in any one of them is named.
  const home = '/Users/someone/work/ai-servicenow-architect';
  const report = { checks: [{ id: 'E-03', detail: home, data: { root: home, toplevel: home } }] };
  const m = maskForJson(report);
  assert.equal(m.checks[0].detail, `${HOME_MASK}/work/ai-servicenow-architect`);
  assert.equal(m.checks[0].data.root, `${HOME_MASK}/work/ai-servicenow-architect`);
  assert.equal(m.checks[0].data.toplevel, `${HOME_MASK}/work/ai-servicenow-architect`);

  // And the whole point, in the form the lint asks it: the result carries no home path at all.
  assert.equal(/(\/Users\/|\/home\/|C:\\Users\\)/.test(JSON.stringify(m)), false);
});

test('C1 — with the run\'s home set to the fixture root, that root appears nowhere in the JSON', async (t) => {
  // THE PLATFORM-INDEPENDENT FORM of the leak that only Windows CI exposed. The fixture's own temp
  // root is home-shaped on exactly one platform — `C:/Users/runneradmin/AppData/Local/Temp/…`
  // matches S07's home-path pattern, `/var/folders/…` and `/tmp/…` do not — so the live scan passed
  // on macOS and Ubuntu while the product leaked the user's account name on all three.
  //
  // Telling the run that the fixture's parent IS its home removes the accident: the checkout sits
  // under it on every platform, so the path fields carry it, and the assertion is that the literal
  // string is gone. No pattern is involved, which is the point — this is the by-VALUE half.
  //
  // Through the `home` OPTION rather than `process.env`: nothing under `lib/` may read the home
  // directory, `bin/snowarch.mjs` calls `homedir()` once and threads it, and this test travels the
  // same path a real run does.
  const root = linkInstall(greenTree(t, { mode: 'design' }));
  const fakeHome = dirname(root);
  assert.deepEqual(homeValues(fakeHome), [fakeHome], 'the fixture root is not usable as a home');

  let json = '';
  await doctorCommand({ flags: { json: true, 'no-network': true, 'no-cache': true },
    out: { write: (s) => { json += s; } }, cwd: root, home: fakeHome, input: { isTTY: false } });

  // The precondition, or this asserts nothing: the report really does quote a home-rooted path.
  const masked = [];
  const walk = (v) => {
    if (typeof v === 'string') { if (v.includes(HOME_MASK)) masked.push(v); }
    else if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === 'object') Object.values(v).forEach(walk);
  };
  walk(JSON.parse(json));
  assert.ok(masked.length > 0, 'no field carried a home-rooted path — the fixture stopped quoting one');

  assert.equal(json.includes(fakeHome), false, `the fixture root survived into the JSON: ${fakeHome}`);

  // Both directions, on a home that NO generic shape matches, so this isolates the by-value half.
  // `fakeHome` cannot serve: on a Windows runner the fixture root sits under
  // `C:/Users/runneradmin/AppData/Local/Temp`, which the pattern masks on its own — the control
  // would then pass for the wrong reason on two platforms and fail on the third, which is the exact
  // accident this whole chore is about.
  const odd = '/opt/people/ana';
  assert.deepEqual(homeValues(odd), [odd]);
  assert.equal(JSON.stringify(maskForJson({ p: `${odd}/checkout` }, { home: '' })).includes(odd),
    true, 'something other than the home value masked it — the control proves nothing');
  assert.equal(JSON.stringify(maskForJson({ p: `${odd}/checkout` }, { home: odd })).includes(odd),
    false, 'a home that matches no pattern was not masked by value');
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
