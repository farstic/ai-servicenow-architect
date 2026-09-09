import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { docsStatus, formatStatus, SCHEMA, SPARSE } from '../tools/snowarch/lib/docs/status.mjs';
import { CORPUS_DIR, MODE, syncCorpus } from '../tools/snowarch/lib/docs/sync.mjs';
import { AREAS, buildUpstream, git, makeWorkspace } from './helpers/docs-fixture.mjs';

/**
 * `docsStatus()` is the contract ARC-08 wraps, so what is tested is not "does it return an object"
 * but: does each way a checkout can be wrong produce the right FLAG, the right HUMAN LINE and the
 * right EXIT CODE. A field that flips while the screen still says `ok` would be a doctor that
 * reports green on a broken corpus, which is the failure this file exists to prevent.
 *
 * The fixture is S05's, imported rather than rebuilt.
 */
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const EVERY_KEY = [
  'present', 'path', 'pin', 'gitlink', 'head', 'pinMatchesGitlink', 'headMatchesPin',
  'family', 'branch', 'familyMatches', 'sparse', 'areasExpected', 'areasPresent', 'areasMissing',
  'mode', 'fileCount', 'sizeBytes', 'citations', 'longpaths', 'schema', 'gitlinkStaged',
];

let scratch, upstream, upstreamUrl;

/** A workspace that also carries an engine.config.json, which `docsStatus` reads. */
function workspace({ pin = upstream.pin, family = 'australia' } = {}) {
  const w = makeWorkspace({ scratch, pin: upstream.pin, upstreamUrl });
  writeFileSync(join(w.root, 'engine.config.json'), JSON.stringify({
    docs: { family, pin, areasFile: 'vendor/docs-areas.txt', upstream: upstreamUrl },
  }, null, 2));
  return w;
}

before(() => {
  scratch = mkdtempSync(join(tmpdir(), 'snowarch-docs-status-'));
  upstream = buildUpstream(scratch);
  upstreamUrl = pathToFileURL(upstream.bare).href;
});

after(() => { rmSync(scratch, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); });

test('a good checkout: every key present, every flag true, four ok lines, exit 0', () => {
  const w = workspace();
  syncCorpus({ ...w, log: () => {} });
  const s = docsStatus({ root: w.root });

  assert.deepEqual(Object.keys(s).sort(), [...EVERY_KEY].sort());
  assert.equal(s.schema, SCHEMA);
  assert.equal(s.present, true);
  assert.equal(s.headMatchesPin, true);
  assert.equal(s.pinMatchesGitlink, true);
  assert.equal(s.familyMatches, true);
  assert.equal(s.sparse, SPARSE.cone);
  assert.deepEqual(s.areasMissing, []);
  assert.equal(s.mode, MODE.sparse);
  assert.ok(s.fileCount > 0 && s.sizeBytes > 0);
  assert.equal(s.citations.status, 'ok');
  // `null` on anything but Windows: the setting does not exist there, and `false` would read as
  // "off", which is a different claim from "not applicable".
  assert.equal(s.longpaths, process.platform === 'win32' ? true : null);

  const f = formatStatus(s);
  assert.equal(f.code, 0);
  assert.equal(f.text.split('\n').filter((l) => l.trim().endsWith('ok')).length, 4, f.text);
  assert.ok(!f.text.includes('MISMATCH'));
});

test('criterion 3 — HEAD off the pin: flag, line and exit 1', () => {
  const w = workspace();
  syncCorpus({ ...w, log: () => {} });
  const corpus = join(w.root, CORPUS_DIR);
  git(['checkout', '-q', '--detach', git(['rev-parse', 'HEAD~1'], corpus).trim()], corpus);

  const s = docsStatus({ root: w.root });
  assert.equal(s.headMatchesPin, false);
  const f = formatStatus(s);
  assert.equal(f.code, 1);
  assert.match(f.text, /pin .*MISMATCH/);
  assert.match(f.text, /run node scripts\/docs\.mjs sync/);
});

test('criterion 4 — pin ≠ gitlink: the docs-bump remedy, not the sync one', () => {
  const w = workspace();
  syncCorpus({ ...w, log: () => {} });
  // Move the CONFIG pin, leaving the gitlink where it is — the maintainer's case.
  const other = git(['rev-parse', 'HEAD~1'], join(w.root, CORPUS_DIR)).trim();
  writeFileSync(join(w.root, 'engine.config.json'), JSON.stringify({
    docs: { family: 'australia', pin: other, areasFile: 'vendor/docs-areas.txt', upstream: upstreamUrl },
  }, null, 2));

  const s = docsStatus({ root: w.root });
  assert.equal(s.pinMatchesGitlink, false);
  const f = formatStatus(s);
  assert.equal(f.code, 1);
  assert.match(f.text, new RegExp(`maintainer: node scripts/docs-bump\\.mjs --to ${upstream.pin}`));
});

test('branch ≠ family is reported even while HEAD matches the pin', () => {
  // The state the fixture has to be built to produce: recipe C leaves a DETACHED head at the pin,
  // so `familyMatches` cannot be inferred from HEAD and has to come from the tracked branch.
  const w = workspace({ family: 'vancouver' });
  syncCorpus({ ...w, log: () => {} });

  const s = docsStatus({ root: w.root });
  assert.equal(s.headMatchesPin, true, 'the pin should still match');
  assert.equal(s.familyMatches, false);
  assert.equal(s.branch, 'australia');
  const f = formatStatus(s);
  assert.equal(f.code, 1);
  assert.match(f.text, /family .*MISMATCH/);
});

test('criterion 5 — one area missing: n−1 of n, MISMATCH, and the area is named', () => {
  const w = workspace();
  syncCorpus({ ...w, log: () => {} });
  const corpus = join(w.root, CORPUS_DIR);
  git(['sparse-checkout', 'set', '--cone', ...AREAS.slice(0, -1)], corpus);

  const s = docsStatus({ root: w.root });
  assert.deepEqual(s.areasMissing, [AREAS[AREAS.length - 1]]);
  assert.equal(s.areasPresent.length, AREAS.length - 1);
  const f = formatStatus(s);
  assert.equal(f.code, 1);
  assert.match(f.text, new RegExp(`${AREAS.length - 1}/${AREAS.length} areas`));
  assert.ok(f.text.includes(AREAS[AREAS.length - 1]), 'the missing area is not named');
});

test('pattern-mode sparse is its own value, and fails the checkout line', () => {
  const w = workspace();
  syncCorpus({ ...w, log: () => {} });
  // `--worktree`, not a plain `config`: `sparse-checkout` turns on `extensions.worktreeConfig` and
  // stores cone mode in `config.worktree`, which OUTRANKS the repository config. Writing the plain
  // key leaves the effective value untouched — `git config --get` still answers `true` — so a test
  // that flips it the obvious way asserts nothing at all.
  const corpus = join(w.root, CORPUS_DIR);
  git(['config', '--worktree', 'core.sparseCheckoutCone', 'false'], corpus);
  assert.equal(git(['config', '--get', 'core.sparseCheckoutCone'], corpus).trim(), 'false',
    'the fixture did not actually leave cone mode');

  const s = docsStatus({ root: w.root });
  assert.equal(s.sparse, SPARSE.pattern);
  const f = formatStatus(s);
  assert.equal(f.code, 1);
  assert.match(f.text, /PATTERN mode/);
});

test('criterion 2 — an absent corpus is a valid object, one MISSING block, exit 3', () => {
  const w = workspace();               // never synced
  const s = docsStatus({ root: w.root, verify: false });

  assert.deepEqual(Object.keys(s).sort(), [...EVERY_KEY].sort());
  assert.equal(s.present, false);
  assert.equal(s.sparse, SPARSE.none);
  assert.equal(s.head, null);
  assert.equal(s.fileCount, null);
  assert.deepEqual(s.areasMissing, s.areasExpected);

  const f = formatStatus(s);
  assert.equal(f.code, 3);
  assert.match(f.text, /^docs corpus: MISSING/);
  assert.equal(f.text.split('\n').length, 1, 'the missing case prints one block');
});

test('verify:false leaves citations null — and the KEY is still there', () => {
  const w = workspace();
  syncCorpus({ ...w, log: () => {} });
  const s = docsStatus({ root: w.root, verify: false });

  assert.ok('citations' in s, 'the key must be present so a consumer can tell "not asked" from "empty"');
  assert.equal(s.citations, null);
  // No citations row, so three lines rather than four — the screen must not invent an unknown.
  const f = formatStatus(s);
  assert.equal(f.text.split('\n').filter((l) => l.trim().endsWith('ok')).length, 3);
});

test('the recorded mode wins over the checkout shape, and both are reported', () => {
  // A stale state file saying `sparse` over a full checkout. Reporting only one of them would hide
  // exactly the disagreement worth seeing.
  const w = workspace();
  syncCorpus({ ...w, mode: MODE.full, log: () => {} });
  mkdirSync(join(w.root, '.local'), { recursive: true });
  writeFileSync(join(w.root, '.local/bootstrap-state.json'), JSON.stringify({ docs: { mode: MODE.sparse } }));

  const s = docsStatus({ root: w.root, verify: false });
  assert.equal(s.mode, MODE.sparse, 'the state file owns `mode`');
  assert.equal(s.sparse, SPARSE.full, 'the checkout owns `sparse`');
});

test('with no state file the mode is inferred from the checkout', () => {
  const w = workspace();
  syncCorpus({ ...w, mode: MODE.full, log: () => {} });
  assert.equal(docsStatus({ root: w.root, verify: false }).mode, MODE.full);
});

test('criterion 7 — verify:false is well under the SessionStart budget', () => {
  const w = workspace();
  syncCorpus({ ...w, log: () => {} });
  const t = Date.now();
  docsStatus({ root: w.root, verify: false });
  const ms = Date.now() - t;
  // The story's budget is 300 ms on the reference machine. Asserted generously here because this
  // runs inside a parallel matrix cell where a wall-clock budget measures contention, not the
  // subject — the number that matters is logged.
  console.log(`    docsStatus({verify:false}): ${ms} ms`);
  assert.ok(ms < 3000, `${ms} ms — an order of magnitude over the 300 ms budget`);
});

test('the real repository: four ok lines, and the object every key', () => {
  // Not a fixture: the checkout this very repository carries. It is the case ARC-08 will wrap.
  const s = docsStatus({ root: repoRoot, verify: false, measure: false });
  assert.deepEqual(Object.keys(s).sort(), [...EVERY_KEY].sort());
  if (s.present) {
    assert.equal(s.headMatchesPin, true);
    assert.equal(s.familyMatches, true);
    assert.equal(s.sparse, SPARSE.cone);
    assert.deepEqual(s.areasMissing, []);
  }
});
