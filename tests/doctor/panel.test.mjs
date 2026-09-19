/**
 * ARC-08-C18 — the panel renderer, and the promise "print its output verbatim" rests on.
 *
 * SKILL.md § status was seven lines of rendering instructions with a JSON key in brackets after
 * each, a null rule, a failure branch and three fallback causes — executed by a language model,
 * once per session, with no test and no two runs guaranteed alike. These are the tests that prose
 * could not have.
 *
 * The inputs are `tests/fixtures/doctor/status-{live,design}.json`, the reports ARC-08-S09 captured
 * from real `--quick --json` runs. Nothing here builds a report by hand except where a condition
 * has no fixture (a FAIL, a fixable count), and those start from a real one.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  docsLine, engineLine, instancesLine, notProbedLine, ranAtLine, renderPanel, SHA_PREFIX,
} from '../../tools/snowarch/lib/doctor/panel.mjs';
import { REAL_ROOT } from './helpers/tree.mjs';

const fixture = (which) => JSON.parse(
  readFileSync(join(REAL_ROOT, `tests/fixtures/doctor/status-${which}.json`), 'utf8'));

const LIVE = fixture('live');
const DESIGN = fixture('design');

test('the live fixture renders to exactly these bytes', () => {
  // THE WHOLE STORY IN ONE ASSERTION. "Print its output verbatim" is a promise that the panel is a
  // fixed report's fixed rendering, so the test that matters is the one that writes the rendering
  // out in full. If a line moves, this fails and a person reads the diff — which is what the skill
  // asked a model to do from a description.
  assert.equal(renderPanel(LIVE), [
    LIVE.modeLineDetailed,
    `Engine: snowarch ${LIVE.engine.version} · contract a96863b1104b`,
    'Docs: vendor/ServiceNowDocs @ 11b39be17307 (australia) · sparse',
    'Roster: 28 skills / 9 agents',
    'Instances: pdi (pdi, custom) · uat (test, read-only)',
    'Doctor: 28 ok, 0 warn, 0 fail — quick run 2026-09-10 19:48 UTC · full report: ./snowarch doctor',
    'Capability packs and citation counts are not probed on a quick run'
      + ' — ./snowarch doctor reports them.',
  ].join('\n'));
});

test('the Mode line is first, and is the report\'s own', () => {
  // `doctor/mode.mjs` has the only definition. A renderer that re-derived it would be a second
  // answer to "is this checkout live", and the two would disagree the day one of them changed.
  for (const report of [LIVE, DESIGN]) {
    assert.equal(renderPanel(report).split('\n')[0], report.modeLineDetailed);
  }
  assert.match(LIVE.modeLineDetailed, /^Mode: /);
});

test('a line whose key is null is omitted, never guessed', () => {
  // The rule SKILL.md stated and a model applied by hand, once per line, every session.
  const bare = { ...DESIGN, engine: { version: null, tag: null, contractSha: null,
    node: null, capabilities: null, docs: null, roster: null }, server: null };
  const lines = renderPanel(bare).split('\n');
  for (const prefix of ['Engine:', 'Docs:', 'Roster:', 'Capabilities:', 'Instances:']) {
    assert.equal(lines.filter((l) => l.startsWith(prefix)).length, 0, `${prefix} was guessed`);
  }
  // …and what IS known still prints. An all-or-nothing renderer would have been easier and wrong.
  assert.equal(lines[0], bare.modeLineDetailed);
  assert.ok(lines.some((l) => l.startsWith('Doctor: ')));
});

test('the same report renders identically under a different ambient environment', () => {
  // THE DETERMINISM TEST, and it is deliberately not "render it twice in a row" — a pure function
  // passes that by construction, and the failure it cannot catch is the one that will happen:
  // reading something the process happens to be sitting in.
  //
  // TZ IS THE LIVE ONE. The doctor's own `headerLine` formats `ranAt` by string surgery and drops
  // the `Z`; the obvious way to write a friendlier stamp is `toLocaleString`, and then this same
  // report renders `19:48` in London and `21:48` in Sofia. Two people comparing pasted panels is
  // the only reason "verbatim" is worth anything, so it is asserted rather than hoped for.
  const before = { TZ: process.env.TZ, LANG: process.env.LANG, LC_ALL: process.env.LC_ALL };
  const cwd = process.cwd();
  const first = renderPanel(LIVE);
  try {
    process.env.TZ = 'Pacific/Kiritimati';        // UTC+14, and on the other side of the date line
    process.env.LANG = 'de_DE.UTF-8';
    process.env.LC_ALL = 'de_DE.UTF-8';
    process.chdir(REAL_ROOT === cwd ? join(REAL_ROOT, 'tools') : REAL_ROOT);
    assert.equal(renderPanel(LIVE), first);
  } finally {
    process.chdir(cwd);
    for (const [k, v] of Object.entries(before)) {
      if (v === undefined) delete process.env[k]; else process.env[k] = v;
    }
  }
  // And the stamp is the report's own instant, in UTC, said out loud.
  assert.equal(ranAtLine('2026-09-10T19:48:24.123Z'), '2026-09-10 19:48 UTC');
  assert.match(first, /quick run 2026-09-10 19:48 UTC/);
});

test('nothing in the renderer\'s import graph reaches the filesystem, the environment or a clock', () => {
  // STRUCTURAL, not observational. A test that renders twice and sees the same string proves the
  // absence of an impurity that FIRED; this proves there is none to fire.
  //
  // AND THE INSTRUMENT IS TESTED FIRST, on a module known to be impure. A purity check that cannot
  // see is indistinguishable from a module that is pure — the same defect this programme keeps
  // finding in checks that cannot tell failure from absence — so `report-text.mjs`, whose
  // `useColour` reads `process.env`, is walked and MUST come back with a finding.
  const impurities = (entry) => {
    const seen = new Set();
    const found = [];
    const walk = (rel) => {
      const path = join(REAL_ROOT, 'tools/snowarch/lib/doctor', rel);
      if (seen.has(path)) return;
      seen.add(path);
      // Comments are stripped first: this file's prose names `process.env` and `Date` while
      // explaining why they are absent, and so does the renderer's.
      const code = readFileSync(path, 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
      for (const banned of ['node:fs', 'node:os', 'node:child_process', 'process.env',
        'process.cwd', 'Date.now', 'new Date', 'Math.random']) {
        if (code.includes(banned)) found.push(`${rel} reaches for ${banned}`);
      }
      for (const m of code.matchAll(/from\s+'(\.[^']+)'/g)) walk(m[1]);
    };
    walk(entry);
    return { found, walked: seen.size };
  };

  // The control: the instrument sees.
  const control = impurities('report-text.mjs');
  assert.deepEqual(control.found, ['report-text.mjs reaches for process.env'],
    'the purity walker found nothing in a module that reads the environment');
  assert.ok(control.walked >= 2, 'the walker did not follow an import');

  // The renderer itself. It is a LEAF by design — the pure line renderers moved down into it when
  // this test caught `report-text.mjs` on the way in, rather than the test being narrowed to fit.
  assert.deepEqual(impurities('panel.mjs').found, []);
});

test('FAILs are listed with their remedy; warnings are not', () => {
  // The division SKILL.md already draws — "Never list WARNs one by one; that is /snowarch doctor" —
  // now drawn once, in code, instead of remembered by whoever renders. A panel that listed both
  // would print 27 lines on a quick run, where 25 of 39 checks are `skip` and two more are warns.
  const report = { ...DESIGN,
    summary: { ...DESIGN.summary, ok: 20, warn: 2, fail: 1, fixable: 1 },
    checks: [
      { id: 'E-10', status: 'fail', title: 'settings.local toggles match the recorded mode',
        detail: 'mode is live but servicenow is disabled', remedy: './snowarch mode live' },
      { id: 'E-23', status: 'warn', title: 'stale registrations', detail: 'two found' },
      { id: 'E-25', status: 'warn', title: 'cloud-synced checkout', detail: 'iCloud' },
      { id: 'E-01', status: 'ok', title: 'fine' },
    ] };
  const lines = renderPanel(report).split('\n');
  assert.ok(lines.includes('E-10 FAIL settings.local toggles match the recorded mode: '
    + 'mode is live but servicenow is disabled — ./snowarch mode live'));
  for (const warned of ['E-23', 'E-25']) {
    assert.equal(lines.some((l) => l.startsWith(warned)), false, `${warned} was listed`);
  }
  assert.ok(lines.includes('Run ./snowarch doctor --fix for the fixable ones (1).'));
  // A clean run says neither.
  assert.equal(renderPanel(LIVE).includes('--fix'), false);
});

test('the contract sha is the prefix the rest of the product prints', () => {
  // TWELVE. `./snowarch version` prints twelve, B09's summary slices twelve, the doctor cache
  // stores twelve; the SKILL.md sample showed seven and was the only one of the four. A reader
  // comparing the panel against `./snowarch version` must not have to notice that one is shorter.
  assert.equal(SHA_PREFIX, 12);
  assert.equal(engineLine({ version: '2.0.0', tag: 'v2.0.0', contractSha: 'a'.repeat(64) }),
    `Engine: snowarch 2.0.0 · tag v2.0.0 · contract ${'a'.repeat(12)}`);
  // A development checkout has no tag and says nothing rather than inventing one. The version is
  // a made-up one, not this checkout's: `tests/version-literals.test.mjs` forbids spelling the
  // version of record anywhere in the suite, because the release script writes the new version
  // before the post-write gates run and a literal would fail the release commit itself.
  assert.equal(engineLine({ version: '9.9.9-fixture', tag: null, contractSha: 'bb' }),
    'Engine: snowarch 9.9.9-fixture · contract bb');
  assert.equal(engineLine({ version: null }), null);
});

test('a missing segment drops the segment, not the line', () => {
  // The citation counts come from E-16, which walks the corpus and is outside the quick subset, so
  // on the run the skill mandates they are null while the pin and the family are not. Dropping the
  // whole line would hide the release family, which is the fact a grounding decision turns on.
  const PIN = '11b39be17307dd4b21df15a54e8011ae68f64dba';
  assert.equal(docsLine({ present: true, mode: 'sparse', pin: PIN, family: 'australia',
    citations: null, dead: null }),
  'Docs: vendor/ServiceNowDocs @ 11b39be17307 (australia) · sparse');
  assert.equal(docsLine({ present: true, mode: 'sparse', pin: PIN, family: 'australia',
    citations: 181, dead: 0 }),
  'Docs: vendor/ServiceNowDocs @ 11b39be17307 (australia) · sparse · citations checked: 181 | dead: 0');
  assert.equal(docsLine({ present: false }), 'Docs: not installed');
  assert.equal(docsLine(null), null);
});

test('what a quick run did not probe is read off the report, not remembered', () => {
  // The skill carried this as a fixed sentence naming a fixed two, so a check moving in or out of
  // the quick subset would have left it describing the old subset.
  //
  // AND IT AGREES WITH ITSELF IN ALL THREE CASES. The verb was chosen from the number of null keys
  // — which is not what governs it — so a design-only quick run, where only `capabilities` is null,
  // printed "Capability packs is not probed". Both subjects are plural nouns, so all three
  // assertions below pin `are`, and the one-key cases are the ones that were wrong.
  assert.equal(notProbedLine(LIVE),
    'Capability packs and citation counts are not probed on a quick run'
    + ' — ./snowarch doctor reports them.');

  const withPacks = { ...LIVE, engine: { ...LIVE.engine, capabilities: { docx: { present: true } } } };
  assert.equal(notProbedLine(withPacks),
    'citation counts are not probed on a quick run — ./snowarch doctor reports them.');

  // The case the owner hit on a design-only clone: capabilities null, citations present.
  const withCitations = { ...LIVE,
    engine: { ...LIVE.engine, docs: { ...LIVE.engine.docs, citations: 181, dead: 0 } } };
  assert.equal(notProbedLine(withCitations),
    'Capability packs are not probed on a quick run — ./snowarch doctor reports them.');

  // …and a report with no docs block at all names only what it can: the citation counts are not
  // missing from a corpus that is not there, they are not a fact about this checkout.
  const noDocs = { ...withPacks, engine: { ...withPacks.engine, docs: null } };
  assert.equal(noDocs.engine.capabilities !== null, true);
  assert.equal(notProbedLine(noDocs), null);
  const full = { ...LIVE, engine: { ...LIVE.engine,
    capabilities: { docx: { present: true } }, docs: { ...LIVE.engine.docs, citations: 181 } } };
  assert.equal(notProbedLine(full), null);
});

test('the instances line prints what the report carries and no more', () => {
  // The fixture's instances have `label`, `environment`, `preset`, `status` and a masked username —
  // and NO default marker, while the SKILL.md sample line showed `(pdi, custom, default)`. That
  // word was an invention of the prose renderer: there is no key for it in a schema-v1 instance.
  // It prints when a report does carry one, and is silent otherwise.
  assert.equal(instancesLine(LIVE.server), 'Instances: pdi (pdi, custom) · uat (test, read-only)');
  assert.equal(instancesLine({ instances: [{ label: 'pdi', environment: 'pdi', preset: 'custom',
    default: true }] }), 'Instances: pdi (pdi, custom, default)');
  // Design-only: an empty list is not a line saying there are none.
  assert.equal(instancesLine(DESIGN.server), null);
  assert.equal(instancesLine(null), null);
});
