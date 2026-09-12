import { test, before, after } from 'node:test';
import { execFileSync } from 'node:child_process';
import assert from 'node:assert/strict';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { CORPUS_DIR, EXIT, SyncError, syncCorpus } from '../tools/snowarch/lib/docs/sync.mjs';
import {
  applyFamilySwitch, classifyLine, formatPlan, planFamilySwitch,
} from '../tools/snowarch/lib/docs/family.mjs';
import { AREAS, buildUpstream, git, makeWorkspace } from './helpers/docs-fixture.mjs';

/**
 * The family switch, on a seeded tree.
 *
 * The classifier is the bulk of the story and the bulk of this file, because the difference between
 * EDIT and REVIEW is a judgement about English that a maintainer has to trust: an auto-edit that
 * rewrote half a sentence about which family ships which table would be worse than no auto-edit
 * at all. Every test asserts its precondition before acting.
 */
let scratch, upstream, upstreamUrl;

const silent = () => {};
const read = (root, rel) => readFileSync(join(root, rel), 'utf8');

/** Skill prose carrying both shapes: auto-editable forms, and facts a switch must not touch. */
const SEEDED = {
  '.claude/skills/itsm-specialist/SKILL.md':
    '---\nname: itsm-specialist\ndescription: ITSM gateway.\n---\n\n'
    + '# ITSM\n\nGrounded in the ServiceNowDocs Australia branch.\n'
    + 'Citations come from the Australia release family.\n'
    + 'Note: `task_sla.stage` differs between Australia release and Vancouver Australia builds.\n',
  '.claude/skills/csm-specialist/SKILL.md':
    '---\nname: csm-specialist\ndescription: CSM gateway.\n---\n\n'
    + '# CSM\n\n## Documentation grounding (Australia branch)\n'
    + 'sn_customerservice_escalation is available in the Australia release family.\n'
    + 'Australia ships CSDM v5, and the delta from Australia to the next family is a human task.\n',
  '.claude/skills/hrsd-specialist/SKILL.md':
    '---\nname: hrsd-specialist\ndescription: HRSD gateway.\n---\n\n# HRSD\n\n(Australia branch)\n',
  '.claude/skills/itom-discovery-specialist/SKILL.md':
    '---\nname: itom-discovery-specialist\ndescription: ITOM gateway.\n---\n\n# ITOM\n\nAustralia branch.\n',
  '.claude/skills/cmdb-csdm-specialist/SKILL.md':
    '---\nname: cmdb-csdm-specialist\ndescription: CMDB gateway.\n---\n\n# CMDB\n\nAustralia release.\n',
  'CLAUDE.md': '# engine\n\nRelease family: Australia branch.\n',
  'governance/governance-rules.md': '# rules\n\nSee the Australia release family for citations.\n',
};

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const GATEWAYS = ['itsm', 'csm', 'hrsd', 'itom-discovery', 'cmdb-csdm'];

function seeded({ family = 'australia' } = {}) {
  const w = makeWorkspace({ scratch, pin: upstream.pin, upstreamUrl });
  for (const [rel, body] of Object.entries(SEEDED)) {
    mkdirSync(join(w.root, rel.split('/').slice(0, -1).join('/')), { recursive: true });
    writeFileSync(join(w.root, rel), body);
  }
  writeFileSync(join(w.root, 'engine.config.json'), `${JSON.stringify({
    docs: { family, pin: upstream.pin, areasFile: 'vendor/docs-areas.txt', upstream: upstreamUrl },
  }, null, 2)}\n`);
  writeFileSync(join(w.root, 'engine.config.schema.json'), `${JSON.stringify({
    properties: { docs: { properties: { family: { enum: ['australia', 'xanadu', 'yokohama', 'zurich'] } } } },
  }, null, 2)}\n`);
  syncCorpus({ ...w, config: { docs: { ...w.config.docs, family: 'australia', pin: upstream.pin } }, log: silent });
  git(['add', '-A'], w.root);
  git(['-c', 'user.email=f@example.invalid', '-c', 'user.name=f', 'commit', '-qm', 'seeded'], w.root);
  assert.equal(git(['status', '--porcelain'], w.root).trim(), '', 'the seeded tree is not clean');
  return { root: w.root, config: JSON.parse(read(w.root, 'engine.config.json')) };
}

before(() => {
  scratch = mkdtempSync(join(tmpdir(), 'snowarch-docs-family-'));
  upstream = buildUpstream(scratch);
  upstreamUrl = pathToFileURL(upstream.bare).href;
  assert.ok(upstream.zurichTip && upstream.zurichTip !== upstream.tip,
    'the fixture upstream has no distinct zurich family');
});

after(() => { rmSync(scratch, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); });

test('the classifier: only-family-mention edits, anything else is REVIEW whole', () => {
  const cases = [
    ['Grounded in the ServiceNowDocs Australia branch.', 'edit', 'ServiceNowDocs Zurich branch'],
    ['## Documentation grounding (Australia branch)', 'edit', '(Zurich branch)'],
    ['Citations come from the Australia release family.', 'edit', 'Zurich release family'],
    ['Australia branch.', 'edit', 'Zurich branch'],
    ['Australia release.', 'edit', 'Zurich release'],
    // A second mention the phrase set does not cover: the whole line is REVIEW, because half a
    // sentence about the new family and half about the old is worse than an untouched line.
    ['task_sla differs between Australia release and Vancouver Australia builds.', 'review', null],
    ['Australia ships CSDM v5, and the delta from Australia is a human task.', 'review', null],
    ['sn_customerservice_escalation is available in the Australia release family.', 'edit', 'Zurich release family'],
    ['nothing to see', 'skip', null],
  ];
  for (const [line, kind, contains] of cases) {
    const c = classifyLine(line, 'australia', 'zurich');
    assert.equal(c.kind, kind, `«${line}» classified ${c.kind}`);
    if (contains) assert.ok(c.after.includes(contains), `«${line}» → ${c.after}`);
    if (kind === 'edit') assert.ok(!c.after.includes('Australia'), `«${c.after}» still says Australia`);
  }
});

test('(Old branch) is ONE edit, not two', () => {
  const c = classifyLine('see (Australia branch) for detail', 'australia', 'zurich');
  assert.equal(c.kind, 'edit');
  assert.equal(c.after, 'see (Zurich branch) for detail');
  assert.equal((c.after.match(/Zurich/g) ?? []).length, 1, 'the inner form was edited twice');
});

test('AC 1 — the dry run prints both config edits, every gateway, a REVIEW list, and changes nothing', () => {
  const w = seeded();
  const before = git(['status', '--porcelain'], w.root).trim();
  assert.equal(before, '', 'precondition: the tree is clean');

  const plan = planFamilySwitch({ ...w, to: 'zurich' });
  const text = formatPlan(plan).text;

  assert.match(text, /^docs family: australia → zurich$/m);
  assert.match(text, /^upstream branch zurich: found \(tip [0-9a-f]{7}\)$/m);
  assert.match(text, /^EDIT \.gitmodules: branch = australia → branch = zurich$/m);
  assert.match(text, /^EDIT engine\.config\.json: docs\.family "australia" → "zurich"$/m);
  for (const g of GATEWAYS) {
    assert.ok(plan.edits.some((e) => e.file.includes(`${g}-specialist`)), `no EDIT line for ${g}`);
  }
  assert.ok(plan.review.length > 0, 'the REVIEW list is empty');
  assert.match(text, /^dry run — nothing changed\. Re-run with --yes to apply\.$/m);
  assert.equal(git(['status', '--porcelain'], w.root).trim(), '', 'the dry run touched the tree');
});

/**
 * AC 2's refusal, through the REAL CLI (acceptance item B03-02).
 *
 * Every other case in this file calls `planFamilySwitch` directly, because the planner is where the
 * rules are. The refusal is not in the planner — it is three lines of argv handling in
 * `lib/docs/cli.mjs`, and nothing exercised them.
 *
 * THE PLAN'S PROPOSED CHECK WOULD HAVE RUN AGAINST THIS REPOSITORY. It said to spawn
 * `node tools/snowarch/bin/snowarch.mjs docs family zurich` with `cwd` set to the fixture. The CLI
 * does not read `cwd`: `lib/config.mjs` resolves the root from its OWN location, deliberately —
 * "cwd is used for exactly one thing: telling them when it differs". So the command would have
 * planned a family switch against the real checkout and told us nothing about the fixture. (It
 * would not have CHANGED anything — no `--yes` — but a test that passes for that reason is worse
 * than no test.)
 *
 * So the engine is copied into the workspace and the CLI is spawned from there, which puts its own
 * root at the fixture. `bin/` and `lib/` only: the tests are a third of the tree and none of them
 * runs here.
 */
/**
 * The engine, copied ONCE for this file and hard-linked into each workspace.
 *
 * `bin/` and `lib/` only — the tests are a third of the tree and none of them runs here. Copied
 * once because every case needs the same bytes and a per-case copy is the same ~750 KB again.
 */
let ENGINE_SRC = null;
const MARKER = '.docs-family-fixture-root';

/**
 * What the docs CLI needs on disk, measured rather than guessed: 3.0 MB across 317 files, copied
 * ONCE for this file and re-copied per workspace.
 *
 * `tools/snowarch/lib` alone is not enough — the engine imports out of its own tree, and the first
 * attempt died on `Cannot find module '<ws>/scripts/lib/release/tag.mjs'`. The list below is every
 * directory those imports reach (`grep -rhoE "from '\.\./\.\./\.\./[^']+'"` over `bin` and
 * `lib`). IF A NEW OUT-OF-TREE IMPORT APPEARS, this fixture fails with ERR_MODULE_NOT_FOUND naming
 * the missing path — loud and diagnosable, which is the right failure for a list that has to track
 * the engine's dependencies.
 */
const ENGINE_TREES = [
  ['tools/snowarch/bin', 'tools/snowarch/bin'],
  ['tools/snowarch/lib', 'tools/snowarch/lib'],
  ['scripts/lib', 'scripts/lib'],
  ['packages/contract', 'packages/contract'],
  ['packages/snowarch/dist', 'packages/snowarch/dist'],
  ['tests/lib', 'tests/lib'],
  // Data, not code: the engine lint reads `retired-vocabulary.json` from here. Found the same way
  // — an explicit ENOENT naming the path, which is why this list is iterated rather than guessed.
  ['tests/fixtures', 'tests/fixtures'],
];

function withEngine(ws) {
  ENGINE_SRC ??= (() => {
    const d = mkdtempSync(join(scratch, 'engine-'));
    for (const [from, to] of ENGINE_TREES) cpSync(join(REPO, from), join(d, to), { recursive: true });
    return d;
  })();
  cpSync(ENGINE_SRC, ws, { recursive: true });

  // THE PRECONDITION THE COPY EXISTS FOR. `lib/config.mjs` resolves the root from its OWN location,
  // deliberately — "cwd is used for exactly one thing: telling them when it differs". So a CLI
  // spawned with `cwd` set here but resolving elsewhere would plan a family switch against THIS
  // repository and tell us nothing, which is exactly what the plan's proposed check would have
  // done. The marker proves where it landed: absent from the real checkout, present here.
  writeFileSync(join(ws, MARKER), 'fixture root\n');
  assert.equal(existsSync(join(REPO, MARKER)), false,
    `${MARKER} exists in the real repository — the marker no longer distinguishes the trees`);
  assert.ok(existsSync(join(ws, 'engine.config.json')), 'the seeded workspace has no config');
  return ws;
}

const runCli = (ws, args) => {
  try {
    const stdout = execFileSync(process.execPath,
      [join(ws, 'tools/snowarch/bin/snowarch.mjs'), ...args],
      { cwd: ws, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    return { code: 0, stdout, stderr: '' };
  } catch (e) {
    return { code: e.status ?? 1, stdout: String(e.stdout ?? ''), stderr: String(e.stderr ?? '') };
  }
};

test('AC 2 — `docs family zurich` with no flag prints the plan, exits 2, and changes nothing', () => {
  const realConfigBefore = readFileSync(join(REPO, 'engine.config.json'), 'utf8');
  const w = seeded();
  withEngine(w.root);
  const before = git(['status', '--porcelain'], w.root).trim();

  const r = runCli(w.root, ['docs', 'family', 'zurich']);

  assert.equal(r.code, 2, `expected exit 2, got ${r.code}\n${r.stderr}`);
  assert.match(r.stderr, /^refusing to apply without --yes$/m);
  // WHERE IT RESOLVED, proven rather than trusted: the plan it printed is the FIXTURE's
  // australia → zurich, and the real checkout's `engine.config.json` is byte-identical afterwards.
  // A CLI that had resolved to this repository would have printed a plan about it instead.
  assert.equal(readFileSync(join(REPO, 'engine.config.json'), 'utf8'), realConfigBefore,
    'the refusal touched the real engine.config.json');
  // The PLAN is still printed — the refusal is not a silent no. A maintainer who asked for a
  // switch gets the thing they would have applied, which is what makes the exit code readable.
  assert.match(r.stdout, /^docs family: australia → zurich$/m);
  assert.match(r.stdout, /^EDIT engine\.config\.json: docs\.family "australia" → "zurich"$/m);
  assert.equal(git(['status', '--porcelain'], w.root).trim(), before, 'the refusal touched the tree');
});

test('AC 2 — `--dry-run` prints the same plan and exits 0, and still changes nothing', () => {
  // Both directions on the flag that distinguishes them: no flag is a REFUSAL (2), `--dry-run` is
  // an ANSWER (0). Without this, a CLI that exited 2 for everything would pass the case above.
  const w = seeded();
  withEngine(w.root);
  const before = git(['status', '--porcelain'], w.root).trim();

  const r = runCli(w.root, ['docs', 'family', 'zurich', '--dry-run']);

  assert.equal(r.code, 0, `expected exit 0, got ${r.code}\n${r.stderr}`);
  assert.equal(r.stderr.includes('refusing to apply'), false, 'a dry run refused');
  assert.match(r.stdout, /^dry run — nothing changed\. Re-run with --yes to apply\.$/m);
  assert.equal(git(['status', '--porcelain'], w.root).trim(), before);
});

test('AC 3 — a family that is not upstream exits 6 and nothing is planned', () => {
  const w = seeded();
  assert.throws(() => planFamilySwitch({ ...w, to: 'nosuchfamily' }), (e) => {
    assert.ok(e instanceof SyncError);
    assert.equal(e.code, EXIT.upstream);
    assert.match(e.message, /^upstream branch 'nosuchfamily' not found/);
    return true;
  });
  assert.equal(git(['status', '--porcelain'], w.root).trim(), '');
});

test('an invalid family NAME is refused before any network call', () => {
  const w = seeded();
  assert.throws(() => planFamilySwitch({ ...w, to: 'Zurich Two' }), /is not a family name/);
});

test('AC 4 — --yes applies every EDIT byte-for-byte, moves the pin, and stages everything', () => {
  const w = seeded();
  const commitsBefore = git(['rev-list', '--count', 'HEAD'], w.root).trim();
  const plan = planFamilySwitch({ ...w, to: 'zurich' });
  const planned = new Map(plan.edits.filter((e) => e.kind === 'prose')
    .map((e) => [`${e.file}:${e.line}`, e.after]));
  assert.ok(planned.size > 0, 'precondition: there are prose edits to apply');

  const r = applyFamilySwitch(plan, { ...w, log: silent });
  assert.equal(r.applied, true);

  for (const [where, after] of planned) {
    const [file, line] = where.split(':');
    assert.equal(read(w.root, file).split('\n')[Number(line) - 1], after, `${where} was not applied as printed`);
  }
  assert.match(read(w.root, '.gitmodules'), /branch = zurich/);
  assert.equal(JSON.parse(read(w.root, 'engine.config.json')).docs.family, 'zurich');
  assert.equal(git(['rev-parse', 'HEAD'], join(w.root, CORPUS_DIR)).trim(), upstream.zurichTip);
  assert.equal(JSON.parse(read(w.root, 'engine.config.json')).docs.pin, upstream.zurichTip);
  // Staged, never committed — counted against the tree's own history, not a literal.
  assert.ok(git(['diff', '--cached', '--name-only'], w.root).trim().length > 0, 'nothing was staged');
  assert.equal(git(['rev-list', '--count', 'HEAD'], w.root).trim(), commitsBefore, 'a commit was created');
});

test('AC 6 — a second --yes is a no-op that says so', () => {
  const w = seeded({ family: 'zurich' });
  const plan = planFamilySwitch({ ...w, to: 'zurich' });
  assert.equal(plan.already, true);
  assert.equal(formatPlan(plan).text, 'already on zurich — nothing to do');
  const lines = [];
  const r = applyFamilySwitch(plan, { ...w, log: (l) => lines.push(l) });
  assert.equal(r.applied, false);
  assert.deepEqual(lines, ['already on zurich — nothing to do']);
});

test('a family outside the schema enum adds one enum line, applied first', () => {
  const w = seeded();
  // Precondition: the enum genuinely lacks the target, or the extra line proves nothing.
  const enumBefore = JSON.parse(read(w.root, 'engine.config.schema.json'))
    .properties.docs.properties.family.enum;
  assert.ok(!enumBefore.includes('behind'), 'precondition: "behind" is not in the enum');

  const plan = planFamilySwitch({ ...w, to: 'behind' });
  assert.ok(plan.schemaEdit, 'no schema edit was planned');
  assert.match(formatPlan(plan).text, /^EDIT engine\.config\.schema\.json: docs\.family enum \+ "behind"$/m);

  applyFamilySwitch(plan, { ...w, log: silent });
  const after = JSON.parse(read(w.root, 'engine.config.schema.json'))
    .properties.docs.properties.family.enum;
  assert.ok(after.includes('behind'), 'the enum was not extended');
  assert.equal(JSON.parse(read(w.root, 'engine.config.json')).docs.family, 'behind');
});

test('a family already in the enum adds no schema line', () => {
  const w = seeded();
  const plan = planFamilySwitch({ ...w, to: 'zurich' });
  assert.equal(plan.schemaEdit, null, 'zurich is in the enum and needs no edit');
  assert.ok(!formatPlan(plan).text.includes('engine.config.schema.json'));
});

test('--from repairs a half-done switch', () => {
  // The config already says zurich while the prose still says Australia — what a switch that died
  // half-way leaves behind. `--from australia` is how the maintainer finishes it.
  const w = seeded({ family: 'zurich' });
  const detected = planFamilySwitch({ ...w, to: 'zurich' });
  assert.equal(detected.already, true, 'precondition: detection alone says there is nothing to do');

  const plan = planFamilySwitch({ ...w, to: 'zurich', from: 'australia' });
  assert.equal(plan.already, false);
  assert.ok(plan.edits.some((e) => e.kind === 'prose'), 'no prose edits were found to repair');
});

test('history is never scanned, listed or edited', () => {
  const w = seeded();
  mkdirSync(join(w.root, 'docs/plans'), { recursive: true });
  writeFileSync(join(w.root, 'docs/plans/00-history.md'), 'The Australia branch was chosen in July.\n');
  writeFileSync(join(w.root, 'docs/CHANGELOG.md'), 'Pinned to the Australia release family.\n');

  const plan = planFamilySwitch({ ...w, to: 'zurich' });
  const touched = [...plan.edits, ...plan.review].map((e) => e.file);
  assert.ok(!touched.some((f) => f.startsWith('docs/')), `history was listed: ${touched.filter((f) => f.startsWith('docs/'))}`);
  assert.match(read(w.root, 'docs/plans/00-history.md'), /Australia/, 'history was edited');
});

test('the lint-failure path exits 1, keeps the edits staged, and prints both recovery sentences', () => {
  const w = seeded();
  // Make the SK lint fail: a description over 500 characters after the switch. Precondition
  // asserted — the seeded skill must currently be short enough to pass.
  const rel = '.claude/skills/hrsd-specialist/SKILL.md';
  assert.ok(read(w.root, rel).includes('description: HRSD gateway.'));
  writeFileSync(join(w.root, rel), read(w.root, rel)
    .replace('description: HRSD gateway.', `description: ${'x'.repeat(600)}`));
  git(['add', '-A'], w.root);
  git(['-c', 'user.email=f@example.invalid', '-c', 'user.name=f', 'commit', '-qm', 'long'], w.root);

  const plan = planFamilySwitch({ ...w, to: 'zurich' });
  const lines = [];
  const r = applyFamilySwitch(plan, { ...w, log: (l) => lines.push(l) });
  const text = lines.join('\n');

  assert.equal(r.code, EXIT.incomplete, 'a failing lint must exit 1');
  assert.ok(r.failedLint, 'the failing lint is not named');
  assert.match(text, /^half-applied: fix the named lint, then review with git diff --cached$/m);
  assert.match(text, /^or abandon with: git restore --staged \. && git checkout -- \. && git -C vendor\/ServiceNowDocs checkout --detach [0-9a-f]{40}$/m);
  // Staged, so the maintainer has what they need to fix it.
  assert.ok(git(['diff', '--cached', '--name-only'], w.root).trim().length > 0);
});

test('an edit whose line moved since the plan is refused, not applied blindly', () => {
  const w = seeded();
  const plan = planFamilySwitch({ ...w, to: 'zurich' });
  const target = plan.edits.find((e) => e.kind === 'prose');
  assert.ok(target, 'precondition: there is a prose edit to disturb');

  const lines = read(w.root, target.file).split('\n');
  lines[target.line - 1] = 'somebody else edited this line';
  writeFileSync(join(w.root, target.file), lines.join('\n'));
  // COMMITTED, so the tree is clean again. Left uncommitted, the earlier and broader guard fires
  // first — `syncUpstream` refuses a dirty tree — which is the right order and would make this
  // test pass for a reason that has nothing to do with the line check it is about.
  git(['add', '-A'], w.root);
  git(['-c', 'user.email=f@example.invalid', '-c', 'user.name=f', 'commit', '-qm', 'someone else'], w.root);
  assert.equal(git(['status', '--porcelain'], w.root).trim(), '', 'precondition: clean again');

  assert.throws(() => applyFamilySwitch(plan, { ...w, log: silent }),
    /is not the line the plan described/);
});

test('the areas file and the corpus contents are not rewritten by a family switch', () => {
  const w = seeded();
  const areas = read(w.root, 'vendor/docs-areas.txt');
  applyFamilySwitch(planFamilySwitch({ ...w, to: 'zurich' }), { ...w, log: silent });
  assert.equal(read(w.root, 'vendor/docs-areas.txt'), areas);
  assert.equal(AREAS.length, areas.split('\n').filter(Boolean).length);
});

test('a tree dirtied after the dry run is refused by the earlier, broader guard', () => {
  // The order matters and is asserted: the pin moves first, so an unrelated edit made between the
  // dry run and the apply is caught as "working tree not clean" rather than as a line mismatch
  // three files later, with half the switch already written.
  const w = seeded();
  const plan = planFamilySwitch({ ...w, to: 'zurich' });
  writeFileSync(join(w.root, 'unrelated.md'), 'someone was working\n');
  git(['add', 'unrelated.md'], w.root);
  assert.match(git(['status', '--porcelain'], w.root), /unrelated\.md/);

  assert.throws(() => applyFamilySwitch(plan, { ...w, log: silent }), (e) => {
    assert.equal(e.code, EXIT.dirty);
    assert.match(e.message, /^working tree not clean/);
    return true;
  });
  assert.equal(JSON.parse(read(w.root, 'engine.config.json')).docs.family, 'australia',
    'the switch was partly applied before the refusal');
});
