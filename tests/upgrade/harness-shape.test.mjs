/**
 * ARC-09-C13 — what the fixture world IS, and one release cut inside it.
 *
 * ARC-09-S11's AC 3 asked for the release checklist to be walked on this harness. It could not be:
 * the fixture carried a CURATED subset of the tree, and two of this repository's own checks are
 * about the tree as a whole — `gen-all --check` stops on a generator whose target or input is
 * absent, and lint rule L05 asserts that every path a tracked file CITES exists. Chasing that one
 * directory at a time went 79 dead citations → 46 → the next one, because the subset was the
 * defect. The fixture is every tracked file now, minus the corpus.
 *
 * What this file asserts is the SHAPE that makes the walkthrough possible, and then the walkthrough.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildWorld, LONGPATHS, NOT_COPIED, persistLongPaths } from './harness.mjs';
import { tempDir } from '../../tools/snowarch/tests/helpers/temp.mjs';
import { applyWrites } from '../../scripts/lib/release/writers.mjs';

const REAL_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

/**
 * The guard: the tests whose subject is WHAT THIS TREE LOOKS LIKE.
 *
 * Not the full suite, and the reason is measured rather than assumed. Run whole inside the fixture
 * it is 1154 tests, about two minutes, and 24 failures — of which 23 are tests asserting properties
 * of a REAL CHECKOUT (`the real checkout is not linked…`, `buildWorld({ modules: 'copy' })…`, the
 * wizard's credential cases, the store CLI spawning the built server) run inside a tree that is
 * deliberately not one. Exactly one was the class this guard exists for. A guard whose output is
 * 96% noise is a guard nobody reads.
 *
 * These seven ask the question a released tree answers differently, which is the whole point: they
 * are what went red on rehearsal runs 4 and 5, on the release commit's own pull request.
 */
const TREE_SCANNING = Object.freeze([
  'tests/changelog.test.mjs',
  'tests/version-literals.test.mjs',
  'tests/version-tag.test.mjs',
  'tests/validation-tests-shape.test.mjs',
  'tests/docs-links.test.mjs',
  'tests/no-legacy-names.test.mjs',
  'tests/never-commit.test.mjs',
]);

const run = (dir, cmd, args) =>
  spawnSync(cmd, args, { cwd: dir, encoding: 'utf8', maxBuffer: 1 << 26,
    shell: cmd === 'npm' && process.platform === 'win32' });

/**
 * Git, with `core.longpaths` on Windows. ONE entry point, and a scan test keeps it that way.
 *
 * `run(dir, 'git', …)` was called directly from eight places here and C27 added the flag to one of
 * them. That is not a fix, it is a coin flip on which call meets the 197-character page first.
 */
const rgit = (dir, args) => run(dir, 'git', [...LONGPATHS, ...args]);

test('C13: exactly one thing is left out of the fixture, and it says why', () => {
  const skipped = Object.entries(NOT_COPIED);
  assert.equal(skipped.length, 1,
    `${skipped.length} exclusions — a second one is a conversation, not an edit: ${skipped.map(([k]) => k)}`);
  const [[path, why]] = skipped;
  assert.equal(path, 'vendor/ServiceNowDocs');
  assert.ok(why.length > 60, 'the exclusion carries no reason');
});

test('C13: the fixture carries every tracked file but the corpus', async (t) => {
  const world = await buildWorld(t, {});
  const work = typeof world === 'string' ? world : world.work;

  const tracked = execFileSync('git', ['ls-files', '-z'], { cwd: REAL_ROOT, encoding: 'utf8',
    maxBuffer: 1 << 28 }).split('\0').filter(Boolean)
    .filter((rel) => rel !== 'vendor/ServiceNowDocs');
  // A sample rather than all 1,800: the ones whose absence caused a documented failure.
  for (const rel of ['tests/contract/no-literals.test.mjs', 'governance/mcp-protocols.md',
    'docs/MODES-AND-PRESETS.md', 'docs/snippets/import-from-legacy.md', 'vendor/docs-areas.txt',
    '.github/workflows/ci.yml']) {
    assert.ok(tracked.includes(rel), `${rel} is not tracked — the sample is stale`);
    assert.ok(existsSync(join(work, rel)), `${rel} is missing from the fixture`);
  }
  assert.equal(existsSync(join(work, 'vendor/ServiceNowDocs/markdown')), false,
    'the corpus was copied into the fixture');
});

/**
 * What the corpus submodule itself says, for a failure message that names its own cause.
 *
 * A parent repository reports a submodule as ` M <path>` for THREE different situations — content
 * modified in its working tree, HEAD moved away from the recorded gitlink, or a file that never
 * checked out — and prints the same two characters for all of them. Asking the submodule directly
 * separates them: `porcelain` is empty unless its own tree is dirty, and `head` differing from
 * `gitlink` is the second case. `longpaths` is here because on Windows it decides whether the
 * corpus's 197-character page can exist at all under a temp prefix.
 */
function submoduleState(corpus) {
  const ask = (args, cwd) => {
    const r = rgit(cwd, args);
    return r.status === 0 ? String(r.stdout ?? '').trim() : `<git failed: ${String(r.stderr ?? '').trim().slice(0, 120)}>`;
  };
  // THE MECHANISM, not only the symptom: the same question asked with the flag and without it.
  // ` M <path>` is not what git prints for a path it cannot open, so what the bare call actually
  // says — "Filename too long", a modification, or nothing — is the thing the record should carry.
  const bare = run(corpus, 'git', ['status', '--porcelain']);
  const flagged = rgit(corpus, ['status', '--porcelain']);
  const oneLine = (r) => `status=${r.status} out=${JSON.stringify(String(r.stdout ?? '').trim().split('\n').slice(0, 3).join(' · '))}`
    + ` err=${JSON.stringify(String(r.stderr ?? '').trim().split('\n').slice(0, 2).join(' · '))}`;
  const parent = dirname(dirname(corpus));
  return {
    porcelain: ask(['status', '--porcelain'], corpus).split('\n').slice(0, 5).join(' · '),
    head: ask(['rev-parse', 'HEAD'], corpus),
    gitlink: (ask(['ls-tree', 'HEAD', 'vendor/ServiceNowDocs'], parent).split(/\s+/)[2] ?? '?'),
    // `config --get` exits 1 for a key that is not set, which is an ANSWER rather than a failure —
    // reading it as one printed `<git failed: >` and hid the very setting this diagnostic is for.
    longpaths: run(corpus, 'git', ['config', '--get', 'core.longpaths']).stdout?.trim() || '<unset>',
    platform: process.platform,
    withoutFlag: oneLine(bare),
    withFlag: oneLine(flagged),
  };
}

/**
 * The list of ways to spawn git that BYPASS the wrapper. Data, so the scan reads as a rule.
 *
 * Written without the quotes the patterns look for, or this array would be its own first finding.
 */
const BYPASS = [
  [/run\s*\([^,]+,\s*['"]git['"]/, "run(dir, 'git', …) — use rgit(dir, …)"],
  [/execFileSync\s*\(\s*['"]git['"]/, "execFileSync('git', …) — use git()/gitRaw() from harness.mjs"],
  [/spawnSync\s*\(\s*['"]git['"]/, "spawnSync('git', …) — use rgit(dir, …)"],
];

/** A line may opt out by saying why, on the line, where a reader of the call sees it. */
const SCAN_EXEMPT = 'scan-exempt:';

test('C27b: every git call in tests/upgrade/ carries core.longpaths on Windows', () => {
  // C27 put the flag on ONE of eight call sites and the cell stayed red. A fix applied by hand to
  // the call that happened to be in view is a fix that holds until the next call runs first, so
  // the rule is mechanical: every git in this directory goes through the wrapper, or says on the
  // line why it does not.
  const dir = dirname(fileURLToPath(import.meta.url));
  const hits = [];
  for (const name of readdirSync(dir).filter((f) => f.endsWith('.mjs')).sort()) {
    // This file names all three call shapes above and plants each as a control. Exempt by name,
    // with the reason, exactly as `tests/precondition-asserts.test.mjs` exempts itself.
    if (name === 'harness-shape.test.mjs') continue;
    readFileSync(join(dir, name), 'utf8').split('\n').forEach((line, i) => {
      if (/^\s*(\/\/|\*|\/\*)/.test(line)) return;           // comments out first
      if (line.includes(SCAN_EXEMPT)) return;
      for (const [re, why] of BYPASS) {
        if (re.test(line)) hits.push(`tests/upgrade/${name}:${i + 1} — ${why}`);
      }
    });
  }
  assert.deepEqual(hits, [], `${hits.length} git call(s) bypassing the wrapper`);
});

test('C27b: ...and the bypass scan catches each shape it names', () => {
  // Both directions. Without this, a pattern that stopped matching would report nothing and pass —
  // which is how the flag came to be on one call site while the suite looked clean.
  const planted = [
    "  run(dir, 'git', ['status']);",
    "  execFileSync('git', ['status'], { cwd });",
    "  spawnSync('git', ['status'], { cwd });",
  ];
  planted.forEach((line, i) => {
    assert.ok(BYPASS[i][0].test(line), `pattern ${i} no longer matches its own shape`);
  });
  // ...and the wrapper itself is not a finding, or every corrected call would be reported.
  for (const [re] of BYPASS) {
    assert.equal(re.test("  rgit(dir, ['status', '--porcelain']);"), false, 'rgit is reported as a bypass');
  }
  // ...nor is a line that says why it opts out.
  assert.equal(planted.some((l) => `${l} // ${SCAN_EXEMPT} the subject`.includes(SCAN_EXEMPT)), true);
});

test('C27b: a `-c` override does not persist, and a config write does', (t) => {
  // The control on the fix above, and it runs everywhere rather than only where the failure was.
  // C27's first attempt passed `-c core.longpaths=true` to `submodule update` and stopped there.
  // That is a setting for ONE PROCESS: the checkout worked and every later git call — including
  // the one the parent's `git status` spawns inside the submodule — saw nothing. The Windows cell
  // stayed red with `longpaths: "<unset>"` printed beside the modified file.
  //
  // Asserted as git behaviour rather than as a sentence in a comment, because "I thought `-c`
  // persisted" is the belief that cost the cycle, and a belief is what a control is for.
  const dir = tempDir('snowarch-longpaths-', t);
  rgit(dir, ['init', '-q', '-b', 'main', '.']);
  // Deliberately NOT through `rgit`: this case is about what a bare call sees, which is the whole
  // question. Exempt from the scan below by the marker on the line.
  const get = () => run(dir, 'git', ['config', '--local', '--get', 'core.longpaths']); // scan-exempt: the subject
  run(dir, 'git', ['-c', 'core.longpaths=true', 'rev-parse', 'HEAD']); // scan-exempt: the subject
  assert.equal(get().status, 1, 'a `-c` override outlived its process');

  run(dir, 'git', ['config', 'core.longpaths', 'true']); // scan-exempt: the subject
  assert.equal(get().stdout.trim(), 'true', 'a config write did not persist');
});

test('C13: ARC-09-S11 AC 3 — the released shape is produced, tagged, and checked', async (t) => {
  // `modules: 'copy'` (ARC-09-C11): this runs the real writers, and the release path installs. With
  // the default link, anything that ran `npm ci` would delete the developer's own `node_modules`
  // through the symlink — which is how C11 was found.
  //
  // `schemaBump: false` (ARC-09-C13): release B normally edits the store schema source to exercise
  // migration, and the suite then asserts `schema v1 is current` against a tree that says v2.
  const world = await buildWorld(t, { modules: 'copy', schemaBump: false });
  const dir = typeof world === 'string' ? world : world.work;
  const ID = ['-c', 'user.email=f@example.invalid', '-c', 'user.name=Fixture'];
  const git = (...args) => rgit(dir, [...ID, ...args]);

  // The corpus. `file://` submodule clones are blocked by git's own policy since 2.38 — a fixture
  // condition, not something the checklist has an opinion about.
  //
  // `core.longpaths=true` ON WINDOWS, because the PRODUCT carries it on every corpus git call
  // (`withLongPaths` in `tools/snowarch/lib/docs/sync.mjs`) and this fixture stands in for the
  // product. S-07's record did not refute the need for it, whatever the paraphrase in `sync.mjs`
  // says: its own words are that "the core.longpaths control did NOT reach MAX_PATH, so AC 2 is
  // unanswered for a real install path". The control never reached the limit, so the question was
  // LEFT OPEN — and it was left open about a real checkout, where 197 characters plus
  // `D:\a\<repo>\<repo>\vendor\ServiceNowDocs\markdown\alpha\` fits inside 260 with room to spare.
  // This fixture is where the open question gets answered. Here the prefix is a TEMP directory:
  // `C:\Users\RUNNER~1\AppData\Local\Temp\snowarch-upgrade-XXXXXX\work\…` is ~103 characters
  // before the corpus path starts, so the same file lands at ~285 and the margin the record
  // measured is spent before the checkout begins.
  rgit(dir, ['-c', 'protocol.file.allow=always', 'submodule', 'update', '--init',
    'vendor/ServiceNowDocs']);

  // ...AND WRITTEN INTO THE CORPUS'S OWN CONFIG, which is the half C27 missed. `-c` is a setting
  // for ONE PROCESS: it let the 197-character page check out and did nothing for anything after.
  // The parent's `git status` spawns its own git INSIDE the submodule, which reads the submodule's
  // config and not the parent's command line — so it could not read that path and reported the
  // file modified. The diagnostic said it in one line: `longpaths: "<unset>"` beside
  // `porcelain: "M markdown/alpha/llll….md"`, with head equal to the gitlink, so the checkout HAD
  // happened and it was the reading of it that failed.
  //
  // `syncCorpus` does both for the same reason (`-c` on every call via `withLongPaths`, then
  // `config core.longpaths true` on the corpus once it exists). The fixture now does both too, and
  // `persistLongPaths` reads the value back rather than assuming the write took.
  persistLongPaths(join(dir, 'vendor/ServiceNowDocs'));

  // The corpus materialised COMPLETELY, asserted in the submodule's own terms and immediately.
  // Without this the same failure arrives much later as ` M vendor/ServiceNowDocs` on the PARENT's
  // `git status` — a gitlink the parent calls modified, which says nothing about why and is what
  // sent this to CI twice. A file that did not check out is a file that is missing.
  const corpus = join(dir, 'vendor/ServiceNowDocs');
  const corpusState = submoduleState(corpus);
  // LOGGED ON EVERY RUN, green included. The point of a diagnostic is that the occurrence names
  // itself, and a message that only prints on failure tells you nothing about the run that worked
  // — which is the comparison you want when the next cell goes red.
  console.log(`    corpus: ${JSON.stringify(corpusState)}`);
  assert.equal(corpusState.porcelain, '',
    `the corpus checkout is incomplete:\n${JSON.stringify(corpusState, null, 2)}`);
  assert.equal(corpusState.head, corpusState.gitlink,
    `the corpus is not at the gitlink the fixture recorded:\n${JSON.stringify(corpusState, null, 2)}`);
  // The setting itself, asserted rather than merely logged. C27 logged `<unset>` on the Windows
  // runner and the cell still went red — a value that is only printed is a value nobody is holding
  // to anything. On win32 this must be `true`, and the whole point is that it PERSISTED.
  if (process.platform === 'win32') {
    assert.equal(corpusState.longpaths, 'true',
      `core.longpaths did not persist into the corpus config — a \`-c\` override is one process `
      + `only:\n${JSON.stringify(corpusState, null, 2)}`);
  }
  run(dir, 'node', ['scripts/gen-docs-areas.mjs', '--write']);
  run(dir, 'npm', ['run', 'gen']);
  git('commit', '-aqm', 'chore(docs): areas for this corpus');

  // ── THE WRITES, through the release's own writer ───────────────────────────────────────────
  //
  // NOT `scripts/release.mjs` end to end, and the reason is worth writing down rather than working
  // around: a full release runs the suite as a gate, and the suite asserts things a FIXTURE
  // legitimately is not. `engine.config.json validates against its schema` is the clearest —
  // `docs.upstream` must match `^https://…\.git$` for a real checkout, and this world points at a
  // local bare repository because it must work with no network. Both are right; they cannot both
  // hold. That is the same reason the guard below is the tree-scanning subset rather than the whole
  // suite, and it is why this test exercises `applyWrites` — the code that PRODUCES a released
  // tree — and then the tag path, which has a preflight but no gates.
  const written = applyWrites({
    root: dir,
    version: '9.3.0',
    date: '2026-01-01',
    run: (args) => run(dir, args[0], args.slice(1)).status ?? 1,
    from: 'v9.2.0',
    tag: { docsPin: '0'.repeat(40) },
  });
  assert.equal(written.ok, true, `the writes failed: ${written.message}`);
  // What C12b added: the artefact is rebuilt and its sha is what the tag will quote.
  assert.ok(written.contractSha, 'applyWrites returned no contract sha');
  assert.match(readFileSync(join(dir, 'packages/snowarch/dist/contract.json'), 'utf8'),
    /"version": *"9\.3\.0"/, 'the rebuilt contract does not carry the released version');

  // ── THE COMMIT AND THE TAG ─────────────────────────────────────────────────────────────────
  git('add', '-A');
  git('commit', '-qm', 'chore(release): v9.3.0');
  // The message carries the SUBMODULE's own answer, because ` M vendor/ServiceNowDocs` on the
  // parent is a symptom with at least three causes — content modified, HEAD moved, or a file that
  // never checked out — and a failure that does not say which costs a round trip through CI to ask.
  assert.equal(git('status', '--porcelain').stdout.trim(), '',
    'the release commit left the tree dirty — STAGED missed something (ARC-09-C12c); corpus: '
    + JSON.stringify(submoduleState(corpus)));

  const tagOnly = run(dir, 'node', ['scripts/release.mjs', '9.3.0', '--tag-only', '--offline']);
  assert.equal(tagOnly.status, 0, `--tag-only refused:\n${tagOnly.stdout}${tagOnly.stderr}`);
  assert.match(tagOnly.stdout, /Tagged v9\.3\.0/);

  // The first thing `release.yml` asks of a tag, asked here before any tag reaches a remote.
  const verified = run(dir, 'node', ['scripts/ci/verify-tag.mjs', 'v9.3.0']);
  assert.equal(verified.status, 0, `verify-tag refused:\n${verified.stdout}${verified.stderr}`);

  // ── THE STANDING GUARD ─────────────────────────────────────────────────────────────────────
  //
  // A RELEASED tree under the tests whose subject is what a tree looks like. Rehearsal runs 4 and 5
  // lost seven tests to this class between them, each costing a round trip through CI and a pull
  // request; every one of them would have failed here first.
  for (const file of TREE_SCANNING) {
    const r = run(dir, 'node', ['--test', file]);
    assert.equal(r.status, 0,
      `${file} fails on the RELEASED tree:\n${`${r.stdout}${r.stderr}`.slice(0, 3000)}`);
  }
});
