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
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildWorld, NOT_COPIED } from './harness.mjs';
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
    const r = run(cwd, 'git', args);
    return r.status === 0 ? String(r.stdout ?? '').trim() : `<git failed: ${String(r.stderr ?? '').trim().slice(0, 120)}>`;
  };
  const parent = dirname(dirname(corpus));
  return {
    porcelain: ask(['status', '--porcelain'], corpus).split('\n').slice(0, 5).join(' · '),
    head: ask(['rev-parse', 'HEAD'], corpus),
    gitlink: (ask(['ls-tree', 'HEAD', 'vendor/ServiceNowDocs'], parent).split(/\s+/)[2] ?? '?'),
    // `config --get` exits 1 for a key that is not set, which is an ANSWER rather than a failure —
    // reading it as one printed `<git failed: >` and hid the very setting this diagnostic is for.
    longpaths: run(corpus, 'git', ['config', '--get', 'core.longpaths']).stdout?.trim() || '<unset>',
    platform: process.platform,
  };
}

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
  const git = (...args) => run(dir, 'git', [...ID, ...args]);

  // The corpus. `file://` submodule clones are blocked by git's own policy since 2.38 — a fixture
  // condition, not something the checklist has an opinion about.
  //
  // `core.longpaths=true` ON WINDOWS, because the PRODUCT carries it on every corpus git call
  // (`withLongPaths` in `tools/snowarch/lib/docs/sync.mjs`) and this fixture stands in for the
  // product. S-07's record refuted the need for it AGAINST A REAL CHECKOUT — 197 characters plus
  // `D:\a\<repo>\<repo>\vendor\ServiceNowDocs\markdown\alpha\` still fits inside 260 — and that
  // record is about a path this fixture does not have. Here the prefix is a TEMP directory:
  // `C:\Users\RUNNER~1\AppData\Local\Temp\snowarch-upgrade-XXXXXX\work\…` is ~103 characters
  // before the corpus path starts, so the same file lands at ~285 and the margin the record
  // measured is spent before the checkout begins.
  run(dir, 'git', [...(process.platform === 'win32' ? ['-c', 'core.longpaths=true'] : []),
    '-c', 'protocol.file.allow=always', 'submodule', 'update', '--init', 'vendor/ServiceNowDocs']);

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
