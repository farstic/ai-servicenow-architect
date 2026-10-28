// Copyright 2026 Cvetomir Grigorov. Licensed under the Business Source License 1.1 (see LICENSE).
// snowarch — AI ServiceNow Architect. Not affiliated with or endorsed by ServiceNow, Inc.
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
import { chmodSync, realpathSync } from 'node:fs';
import { dirname, join } from 'node:path';

import { doctorCommand } from '../../tools/snowarch/lib/doctor/index.mjs';
import { maskForJson, labelsIn, LABEL_MASK, HOST_MASK, HOME_MASK, homeValues } from '../../tools/snowarch/lib/doctor/json-boundary.mjs';
import { cacheSensitiveValue, INSTANCE_HOST } from '../../tools/snowarch/lib/doctor-cache.mjs';
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
  // ARC-08-C20 — BOTH SPELLINGS now, longest first. A path can reach the report resolved while the
  // home arrives unresolved, and on macOS that is the normal case: `os.tmpdir()` says
  // `/var/folders/…` and the realpath of anything inside it is `/private/var/folders/…`. Masking
  // only the unresolved prefix left `/private` in front of the mask — a committed fixture carried
  // `toplevel: '/private~'`.
  const values = homeValues(fakeHome);
  assert.ok(values.includes(fakeHome), 'the fixture root is not usable as a home');
  assert.deepEqual([...values].sort((a, b) => b.length - a.length), values,
    'the spellings are not longest-first — the shorter one would mask inside the longer');
  const resolved = realpathSync(fakeHome);
  if (resolved !== fakeHome) {
    assert.ok(values.includes(resolved), 'the resolved spelling is not masked');
  }

  // The closed path, driven rather than waited for: a `realpath` that reports a different prefix
  // must produce both, longer first, with no filesystem involved.
  assert.deepEqual(homeValues('/var/folders/x', { realpath: () => '/private/var/folders/x' }),
    ['/private/var/folders/x', '/var/folders/x']);
  // …and a home that is not on disk at all is still a string worth masking.
  assert.deepEqual(homeValues('/var/folders/x', { realpath: () => { throw new Error('ENOENT'); } }),
    ['/var/folders/x']);

  // ARC-08-C20 — BOTH SEPARATORS, driven with a Windows-shaped value on any platform. `git
  // rev-parse --show-toplevel` answers with forward slashes on Windows while the home arrives with
  // backslashes, so a by-value mask holding one spelling missed the other: the report kept
  // `~/AppData/Local/Temp/snowarch-doctor-<random>` — the username masked by the generic pattern,
  // the rest of the path left behind, different every run. Three Windows cells failed on it.
  const win = homeValues('C:\\Users\\someone\\AppData\\Local\\Temp\\run',
    { realpath: (x) => x });
  assert.ok(win.includes('C:\\Users\\someone\\AppData\\Local\\Temp\\run'));
  assert.ok(win.includes('C:/Users/someone/AppData/Local/Temp/run'),
    'the forward-slash spelling git prints on Windows is not masked');

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

// ── ARC-09-C227 — every instance host in a string, not only the first ──────────────────────────────────
//
// maskForJson replaced with INSTANCE_HOST, which has no g flag, so a string naming two instances kept the second
// address: "https://alpha.service-now.com and https://beta.service-now.com" came out as
// "<host> and https://beta.service-now.com", and a host named twice kept its second copy. Shipped through 2.2.4.
// The shared constant stays non-global: cacheSensitiveValue asks it with .test(), and a /g regex carries
// lastIndex from one call to the next.

const ALPHA = 'https://alpha.service-now.com';
const BETA = 'https://beta.service-now.com';
const maskedValue = (value) => maskForJson({ server: { instances: [] }, value }).value;

test('ARC-09-C227 — two instance hosts in one string are both masked', () => {
  assert.equal(maskedValue(`${ALPHA} and ${BETA}`), `${HOST_MASK} and ${HOST_MASK}`);
});

test('ARC-09-C227 — the same host twice in one string is masked twice', () => {
  assert.equal(maskedValue(`${ALPHA} then ${ALPHA} again`), `${HOST_MASK} then ${HOST_MASK} again`);
});

test('ARC-09-C227 — two hosts in a nested field and in an array element are all masked', () => {
  const out = maskForJson({ server: { instances: [] }, a: { b: `${ALPHA}/api ${BETA}/x`, list: [`${BETA} ${ALPHA}`] } });
  assert.deepEqual(out.a, { b: `${HOST_MASK}/api ${HOST_MASK}/x`, list: [`${HOST_MASK} ${HOST_MASK}`] });
});

test('ARC-09-C227 — control: one host in a string is masked, as before', () => {
  assert.equal(maskedValue(`see ${ALPHA}/now`), `see ${HOST_MASK}/now`);
});

test('ARC-09-C227 — control: the cache guard gives the same answer when asked twice', () => {
  const value = `${ALPHA} is the instance`;
  assert.equal(cacheSensitiveValue(value), 'it carries an instance address');
  assert.equal(cacheSensitiveValue(value), 'it carries an instance address');
});

test('ARC-09-C227 — control: the shared INSTANCE_HOST stays non-global', () => {
  assert.equal(INSTANCE_HOST.flags.includes('g'), false, 'INSTANCE_HOST gained the g flag, and its .test() callers now carry lastIndex');
});

// ── ARC-09-C221 — the store's own hosts, by value (the latent case once called C228) ───────────────────────────────
//
// INSTANCE_HOST recognises a ServiceNow-hosted URL with a scheme. An instance on a custom domain, or a host written
// bare, is not that shape, so maskForJson left it as written. Measured at develop 5b5c0daf: no field of
// `doctor --json` carried the host, with the network off or on (an `.invalid` host). So the leak was latent, and the
// boundary now also masks what the store itself names, by value: the non-credential tier, shared with
// `/snowarch finding` (tools/snowarch/lib/mask-values.mjs). It never reads the credential block.

const STORE_VALUES = { hosts: ['servicedesk.acmebank.com'], stems: ['acmebank'] };

test('ARC-09-C221 — a custom-domain instance is masked by value: its URL, its bare host and its stem', () => {
  const out = maskForJson({ server: { instances: [] }, v: ['see https://servicedesk.acmebank.com/now/nav',
    'host servicedesk.acmebank.com, no scheme', 'the acmebank instance and acmebankdev'] }, STORE_VALUES).v;
  assert.deepEqual(out, [`see ${HOST_MASK}/now/nav`, `host ${HOST_MASK}, no scheme`, `the ${HOST_MASK} instance and ${HOST_MASK}`]);
});

test('ARC-09-C221 — control: the product\'s own words survive the store\'s values, and no values means no change', () => {
  const product = ['ServiceNow and snowarch', 'see https://docs.servicenow.com/x', 'github.com/farstic/snowarch'];
  assert.deepEqual(maskForJson({ server: { instances: [] }, v: product }, STORE_VALUES).v, product);
  assert.deepEqual(maskForJson({ server: { instances: [] }, v: ['host servicedesk.acmebank.com'] }).v,
    ['host servicedesk.acmebank.com'], 'with no store values the boundary changed what it masks');
  // A store host whose stem is one of the product's own words (`portal.service.example`, `snow.servicenow.example`)
  // still masks the host whole, but not the word: the report is full of it.
  const words = ['ServiceNow and the Service Portal', 'servicenow.com/docs'];
  assert.deepEqual(maskForJson({ server: { instances: [] }, v: words }, { hosts: [], stems: ['service', 'servicenow'] }).v, words,
    'a product word was masked as a store stem');
});

test('ARC-09-C221 — the store\'s values are read SNOW_STORE first, and never a credential', async (t) => {
  const { storeMaskValues } = await import('../../tools/snowarch/lib/doctor/json-boundary.mjs');
  const root = linkInstall(greenTree(t, { mode: 'live' }));
  const store = { version: 1, defaultInstance: 'acme-prod', instances: { 'acme-prod': {
    url: 'https://servicedesk.acmebank.com', environment: 'prod',
    auth: { method: 'basic', username: 'svc.integration', password: FIXTURE_SECRET },
    preset: 'read-only', flags: {}, toolPackage: 'full', maxRecords: 100, prodWriteAck: false } } };
  writeJson(root, '.local/instances.json', store);
  assert.deepEqual(storeMaskValues(root, {}), { hosts: ['servicedesk.acmebank.com'], stems: ['acmebank'] });
  writeJson(root, 'elsewhere.json', { ...store, instances: { x: { ...store.instances['acme-prod'], url: 'https://other.example.org' } } });
  assert.deepEqual(storeMaskValues(root, { SNOW_STORE: join(root, 'elsewhere.json') }), { hosts: ['other.example.org'], stems: ['example'] });
  const all = JSON.stringify(storeMaskValues(root, {}));
  assert.ok(!all.includes(FIXTURE_SECRET) && !all.includes('svc.integration'), 'a credential reached the boundary\'s values');
  assert.deepEqual(storeMaskValues(join(root, 'nowhere'), {}), { hosts: [], stems: [] });
});

test('ARC-09-C221 — every maskForJson call passes the store\'s values', async () => {
  const { readdirSync, readFileSync: read } = await import('node:fs');
  const { fileURLToPath } = await import('node:url');
  const { default: ts } = await import('typescript');
  const lib = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'tools', 'snowarch', 'lib');
  // ARC-09-C242 — every module under lib, not two named ones (the regression hunt), read by the compiler
  // tests/lib/temp-sites.mjs reads with, so a comment, a string, a regex or a template is never mistaken for code. A
  // call's arguments must hold storeMaskValues(…); the function is imported, statically or with await import(), under
  // its own name only, and never passed on as a value.
  const files = readdirSync(lib, { recursive: true }).map((p) => String(p).replace(/\\/g, '/')).filter((p) => p.endsWith('.mjs')).sort();
  const calls = [];
  const loose = [];
  for (const f of files) {
    const source = ts.createSourceFile(f, read(join(lib, f), 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
    const at = (node) => `${f}:${source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1}`;
    const calls_ = (node, name) => {
      let found = false;
      const look = (n) => {
        if (ts.isCallExpression(n) && ts.isIdentifier(n.expression) && n.expression.text === name) found = true;
        else ts.forEachChild(n, look);
      };
      look(node);
      return found;
    };
    const visit = (node) => {
      if (ts.isIdentifier(node) && node.text === 'maskForJson') {
        const p = node.parent;
        if (ts.isCallExpression(p) && p.expression === node) {
          calls.push(`${at(node)}: ${p.arguments.some((a) => calls_(a, 'storeMaskValues')) ? 'ok' : 'MISSING'}`);
        } else if ((ts.isFunctionDeclaration(p) && p.name === node)
          || ((ts.isImportSpecifier(p) || ts.isBindingElement(p) || ts.isExportSpecifier(p)) && !p.propertyName)) {
          // the definition, or an import or a re-export under its own name
        } else {
          loose.push(at(node));
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
  }
  assert.equal(calls.length, 3, `expected the 3 known call sites: ${calls.join(' | ')}`);
  assert.deepEqual(calls.filter((c) => c.endsWith('MISSING')), [], 'a call site masks without the store\'s values');
  assert.deepEqual(loose, [], 'maskForJson is imported under another name or passed on as a value');
});

// ── ARC-09-C242 — a store stem masks whole names in the doctor's JSON, and names at a token boundary ───────────────────
//
// The regression hunt (wf_9be5c51c-184): a stem matched every word it begins, so a store host whose stem is `snow` or
// `corp` turned `./snowarch` and `corpus` into `<host>`, in `doctor --json` and in the lines U7 prints from it. A stem
// masks its whole word now when what follows it is nothing, a sibling instance's environment word with digits, or a
// token boundary, which the architect ruled on 2026-10-28: an uppercase letter or a digit (`-`, `_` and `.` end the word,
// so they are whole names already). A lowercase continuation is not a boundary. The client-confidentiality rule outranks
// readability, and the one cost is asserted below, so it is documented behaviour rather than a discovery.

test('ARC-09-C242 — the hunt\'s control: a store stem that begins a product word leaves the word as it is', () => {
  const words = ['run ./snowarch doctor', 'the corpus is sparse', 'run ./bootstrap.sh', '.local/bootstrap-state.json is absent'];
  for (const stem of ['snow', 'corp', 'boot']) {
    assert.deepEqual(maskForJson({ server: { instances: [] }, v: words }, { hosts: [], stems: [stem] }).v, words, `stem ${stem}`);
  }
});

test('ARC-09-C242 — a store stem masks its whole name and a sibling instance\'s in the doctor\'s JSON', () => {
  const names = ['corp', 'CORP', 'corpdev', 'corp-test', 'CORPUAT2', 'corp2dev', 'corp01prd'];
  assert.deepEqual(maskForJson({ server: { instances: [] }, v: names }, { hosts: [], stems: ['corp'] }).v,
    [HOST_MASK, HOST_MASK, HOST_MASK, `${HOST_MASK}-test`, HOST_MASK, HOST_MASK, HOST_MASK]);
});

test('ARC-09-C242 — the doctor\'s own words survive a store\'s values: node, proxy, and the snow_ tools beside a bare host', () => {
  const printed = ['install Node.js 20+', 'run node scripts/build-dist.mjs', 'set HTTPS_PROXY', 'call snow_core_capabilities_read first'];
  assert.deepEqual(maskForJson({ server: { instances: [] }, v: printed }, { hosts: ['snow'], stems: ['node', 'proxy'] }).v, printed,
    'a word the doctor prints was masked as a store value');
});

/** What the doctor's JSON makes of `v`, for a store whose host has these stems. */
const stemWords = (stems, v) => maskForJson({ server: { instances: [] }, v }, { hosts: [], stems }).v;

test('ARC-09-C242 — `AcmeBank-snowarch` is masked: an uppercase letter after the stem is a boundary', () => {
  assert.deepEqual(stemWords(['acme'], ['AcmeBank-snowarch', '/work/AcmeBank-snowarch/clients']),
    [`${HOST_MASK}-snowarch`, `/work/${HOST_MASK}-snowarch/clients`]);
});

test('ARC-09-C242 — `acme2` is masked: a digit after the stem is a boundary', () => {
  assert.deepEqual(stemWords(['acme'], ['acme2', 'acme2foo', 'the acme2 instance']), [HOST_MASK, HOST_MASK, `the ${HOST_MASK} instance`]);
});

test('ARC-09-C242 — `corpus` stays: a lowercase continuation is not a boundary', () => {
  assert.deepEqual(stemWords(['corp'], ['corpus', 'the corpus is sparse', 'a corporate policy']), ['corpus', 'the corpus is sparse', 'a corporate policy']);
});

test('ARC-09-C242 — `./snowarch` stays: a lowercase continuation is not a boundary', async () => {
  // `snow` is a product word, so the doctor's JSON drops it before the rule: both the product's own call and the rule
  // itself, asked directly with the stem, leave the word alone.
  assert.deepEqual(stemWords(['snow'], ['./snowarch', 'run ./snowarch doctor']), ['./snowarch', 'run ./snowarch doctor']);
  const { maskStemWords } = await import('../../tools/snowarch/lib/mask-values.mjs');
  const text = 'run ./snowarch doctor; snowarch-write; snowdrift';
  assert.equal(maskStemWords(text, ['snow'], () => HOST_MASK), text);
});

test('ARC-09-C242 — a camel-case, all-capitals or separated word that begins with the stem is masked whole', () => {
  assert.deepEqual(stemWords(['acme'], ['acmeUtils', 'ACMEMID01', 'ACMEBANK', 'Acme2dev', 'acme.getManager', 'acme_core', 'acme-prod']),
    [HOST_MASK, HOST_MASK, HOST_MASK, HOST_MASK, `${HOST_MASK}.getManager`, `${HOST_MASK}_core`, `${HOST_MASK}-prod`]);
});

test('ARC-09-C242 — the accepted cost: a lowercase word that only begins with the name is not masked in the JSON', () => {
  // The architect's ruling of 2026-10-28: a lowercase continuation is not a boundary, so `acmebank` and `acmeutils`
  // under the stem `acme` stay in the doctor's JSON, as `corpus` stays under `corp`. A finding masks them
  // (tools/snowarch/tests/finding.test.mjs). Changing this is a decision, not a fix.
  assert.deepEqual(stemWords(['acme'], ['acmebank', 'acmeutils']), ['acmebank', 'acmeutils']);
});
