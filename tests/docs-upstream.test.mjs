import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { CORPUS_DIR, EXIT, SyncError, syncCorpus } from '../tools/snowarch/lib/docs/sync.mjs';
import { docsStatus, formatStatus } from '../tools/snowarch/lib/docs/status.mjs';
import { formatUpstream, syncUpstream, writePin } from '../tools/snowarch/lib/docs/upstream.mjs';
import { BEGIN, END, RECIPE_TARGET, renderRecipeBlock } from '../tools/snowarch/lib/docs/recipe-block.mjs';
import {
  AREAS, CITED_PAGE, buildUpstream, git, makeWorkspace, writeCitingSkill,
} from './helpers/docs-fixture.mjs';

/**
 * The maintainer refresh, against the shared fixture upstream.
 *
 * Every test asserts its PRECONDITION before acting — the lesson from ARC-03-S06, where a test set
 * a git config the effective value ignored and then proved nothing. Here that means checking the
 * fixture really is behind the tip, really does cite the page the tip deletes, and really is clean,
 * before asserting what the command did about it.
 */
let scratch, upstream, upstreamUrl;
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const silent = () => {};
const corpusOf = (w) => join(w.root, CORPUS_DIR);
const pinIn = (root) => JSON.parse(readFileSync(join(root, 'engine.config.json'), 'utf8')).docs.pin;

/** A workspace synced at the pin, with a skill citing a page the corpus has. */
function ready({ family = 'australia', cite = CITED_PAGE } = {}) {
  const w = makeWorkspace({ scratch, pin: upstream.pin, upstreamUrl });
  writeFileSync(join(w.root, 'engine.config.json'), `${JSON.stringify({
    docs: { family, pin: upstream.pin, areasFile: 'vendor/docs-areas.txt', upstream: upstreamUrl },
  }, null, 2)}\n`);
  writeCitingSkill(w.root, cite);
  syncCorpus({ ...w, config: { docs: { ...w.config.docs, family: 'australia', pin: upstream.pin } }, log: silent });
  // Precondition: the workspace is at the pin, clean, and the cited page exists.
  assert.equal(git(['rev-parse', 'HEAD'], corpusOf(w)).trim(), upstream.pin, 'fixture is not at the pin');
  git(['add', '-A'], w.root);
  git(['-c', 'user.email=f@example.invalid', '-c', 'user.name=f', 'commit', '-qm', 'ready'], w.root);
  assert.equal(git(['status', '--porcelain'], w.root).trim(), '', 'fixture tree is not clean');
  return { ...w, config: JSON.parse(readFileSync(join(w.root, 'engine.config.json'), 'utf8')) };
}

before(() => {
  scratch = mkdtempSync(join(tmpdir(), 'snowarch-docs-upstream-'));
  upstream = buildUpstream(scratch);
  upstreamUrl = pathToFileURL(upstream.bare).href;
  // The fixture's own shape, asserted once: the tip must be AHEAD of the pin or every test below
  // is measuring a move that never happens.
  assert.notEqual(upstream.tip, upstream.pin, 'the fixture tip is not ahead of the pin');
});

after(() => { rmSync(scratch, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); });

test('AC 1 — the pin moves to the tip, both paths are staged, and nothing is committed', () => {
  const w = ready();
  const headBefore = git(['rev-parse', 'HEAD'], w.root).trim();

  const r = syncUpstream({ ...w, log: silent });

  assert.equal(r.to, upstream.tip);
  assert.equal(git(['rev-parse', 'HEAD'], corpusOf(w)).trim(), upstream.tip, 'submodule did not move');
  assert.equal(pinIn(w.root), upstream.tip, 'engine.config.json pin did not move');
  assert.deepEqual(git(['diff', '--cached', '--name-only'], w.root).trim().split('\n').sort(),
    ['engine.config.json', CORPUS_DIR].sort());
  assert.equal(git(['rev-parse', 'HEAD'], w.root).trim(), headBefore, 'a commit was created');
  assert.equal(formatUpstream(r).code, EXIT.ok);
});

test('AC 2 — a tip that deletes a cited page: newly dead with file:line, exit 1, pin still moved', () => {
  const w = ready({ family: 'deletes-cited' });
  // Precondition: the citation is live before the move, or "newly dead" proves nothing.
  const skill = join(w.root, '.claude/skills/fixture/SKILL.md');
  assert.ok(readFileSync(skill, 'utf8').includes(CITED_PAGE));
  assert.equal(docsStatus({ root: w.root }).citations.dead.length, 0, 'the citation is dead already');

  const r = syncUpstream({ ...w, log: silent });

  assert.equal(r.newlyDead.length, 1, JSON.stringify(r.newlyDead));
  assert.equal(r.newlyDead[0].path, CITED_PAGE);
  assert.equal(r.newlyDead[0].file, '.claude/skills/fixture/SKILL.md');
  assert.ok(r.newlyDead[0].line > 0);

  const f = formatUpstream(r);
  assert.equal(f.code, EXIT.incomplete, 'a broken citation must exit 1');
  assert.match(f.text, /^newly dead \(1\):$/m);
  assert.match(f.text, new RegExp(`DEAD \\.claude/skills/fixture/SKILL\\.md:\\d+ ${CITED_PAGE}`));

  // The pin moved anyway — the maintainer needs it to repair the citation.
  assert.equal(r.to, upstream.deletesCited);
  assert.equal(pinIn(w.root), upstream.deletesCited);
  assert.equal(git(['diff', '--cached', '--name-only'], w.root).trim().split('\n').length, 2);
});

test('AC 3 — --to a reachable sha moves there', () => {
  const w = ready();
  const r = syncUpstream({ ...w, to: upstream.tip, log: silent });
  assert.equal(r.to, upstream.tip);
  assert.equal(pinIn(w.root), upstream.tip);
});

test('AC 3 — --to an unreachable sha exits 6, and NOTHING moved', () => {
  const w = ready();
  const absent = 'f'.repeat(40);
  const porcelainBefore = git(['status', '--porcelain'], w.root).trim();

  assert.throws(() => syncUpstream({ ...w, to: absent, log: silent }), (e) => {
    assert.ok(e instanceof SyncError);
    assert.equal(e.code, EXIT.upstream);
    assert.equal(e.message, `sha ${absent} not fetchable from upstream — is it reachable from branch 'australia'?`);
    return true;
  });
  assert.equal(git(['status', '--porcelain'], w.root).trim(), porcelainBefore, 'the tree changed');
  assert.equal(git(['rev-parse', 'HEAD'], corpusOf(w)).trim(), upstream.pin, 'the submodule moved');
  assert.equal(pinIn(w.root), upstream.pin, 'the pin moved');
});

test('AC 5 — a family branch that is not upstream exits 6 and names `docs family`', () => {
  const w = ready({ family: 'no-such-family' });
  assert.throws(() => syncUpstream({ ...w, log: silent }), (e) => {
    assert.equal(e.code, EXIT.upstream);
    assert.equal(e.message,
      "upstream branch 'no-such-family' not found — the release family may have moved; "
      + 'run ./snowarch docs family <name> --dry-run');
    return true;
  });
  assert.equal(pinIn(w.root), upstream.pin);
});

test('AC 4 — a dirty tree outside vendor/ refuses before any network call', () => {
  const w = ready();
  writeFileSync(join(w.root, 'unrelated.txt'), 'edited\n');
  git(['add', 'unrelated.txt'], w.root);
  // Precondition: dirty OUTSIDE vendor, which is the only kind this command refuses.
  assert.match(git(['status', '--porcelain'], w.root), /unrelated\.txt/);

  assert.throws(() => syncUpstream({ ...w, log: silent }), (e) => {
    assert.equal(e.code, EXIT.dirty);
    assert.match(e.message, /^working tree not clean — commit or stash first: /);
    assert.match(e.message, /unrelated\.txt/);
    return true;
  });
  assert.equal(git(['rev-parse', 'HEAD'], corpusOf(w)).trim(), upstream.pin, 'it moved anyway');
});

test('a dirty corpus does NOT block the refresh — that is sync\'s refusal, not this one', () => {
  const w = ready();
  writeFileSync(join(corpusOf(w), 'README.md'), 'edited\n');
  assert.match(git(['status', '--porcelain'], w.root), /vendor\//);
  const r = syncUpstream({ ...w, log: silent });
  assert.equal(r.to, upstream.tip);
});

test('--no-verify skips both runs and says so, with no citation figures invented', () => {
  const w = ready();
  const r = syncUpstream({ ...w, verify: false, log: silent });
  assert.equal(r.checkedBefore, null);
  assert.equal(r.checkedAfter, null);
  assert.deepEqual(r.newlyDead, []);
  const f = formatUpstream(r);
  assert.match(f.text, /^citations: not verified \(--no-verify\)$/m);
  assert.ok(!f.text.includes('newly dead'), 'it reported a diff it never computed');
  assert.equal(f.code, EXIT.ok);
});

test('a tip BEHIND the pin is followed, and the report says it is older', () => {
  // An upstream history rewrite. The ruling is to follow rather than refuse: the pin records what
  // upstream publishes, and silently staying put would hide the rewrite.
  const w = ready({ family: 'behind' });
  assert.notEqual(upstream.behind, upstream.pin);

  const r = syncUpstream({ ...w, log: silent });
  assert.equal(r.to, upstream.behind);
  assert.equal(r.olderThanPin, true);
  assert.match(formatUpstream(r).text, /\(older than the current pin\)$/m);
});

test('the pin write changes exactly one string and the file stays valid', () => {
  const w = ready();
  const p = join(w.root, 'engine.config.json');
  const before = readFileSync(p, 'utf8');

  writePin(w.root, upstream.pin, upstream.tip);
  const after = readFileSync(p, 'utf8');

  assert.equal(after, before.replace(upstream.pin, upstream.tip), 'more than the pin string changed');
  assert.equal(after.length, before.length, 'a 40-hex swap must not change the length');
  assert.equal(before.endsWith('\n'), after.endsWith('\n'), 'the trailing newline changed');
  const parsed = JSON.parse(after);
  assert.match(parsed.docs.pin, /^[0-9a-f]{40}$/);
  assert.equal(parsed.docs.pin, upstream.tip);
});

test('the pin write refuses a file that does not hold the pin it was told to replace', () => {
  const w = ready();
  assert.throws(() => writePin(w.root, 'a'.repeat(40), upstream.tip), (e) => {
    assert.equal(e.code, EXIT.git);
    assert.match(e.message, /0 occurrence\(s\)/);
    return true;
  });
});

test('healed citations are reported: a page the new tip restores', () => {
  // Start on the branch that deleted the page, cite it (dead), then refresh to `australia`, whose
  // tip still has it. The diff has to name the recovery, not only the breakage.
  const w = ready({ family: 'deletes-cited' });
  syncUpstream({ ...w, log: silent });
  assert.equal(docsStatus({ root: w.root }).citations.dead.length, 1, 'precondition: one dead');

  git(['add', '-A'], w.root);
  git(['-c', 'user.email=f@example.invalid', '-c', 'user.name=f', 'commit', '-qm', 'moved'], w.root);
  const w2 = { ...w, config: JSON.parse(readFileSync(join(w.root, 'engine.config.json'), 'utf8')) };
  w2.config.docs.family = 'australia';

  const r = syncUpstream({ ...w2, log: silent });
  assert.equal(r.healed.length, 1, JSON.stringify(r.healed));
  assert.equal(r.healed[0].path, CITED_PAGE);
  assert.equal(r.newlyDead.length, 0);
  assert.match(formatUpstream(r).text, /^healed \(1\)$/m);
});

test('AC 6 — after the refresh, status reads the STAGED gitlink and labels it', () => {
  const w = ready();
  syncUpstream({ ...w, log: silent });

  const s = docsStatus({ root: w.root, verify: false });
  assert.equal(s.gitlink, upstream.tip, 'status read the committed gitlink, not the staged one');
  assert.equal(s.gitlinkStaged, true);
  assert.equal(s.pinMatchesGitlink, true);
  const f = formatStatus(s);
  assert.match(f.text, /gitlink [0-9a-f]{7} \(staged\)/);
  assert.equal(f.code, 0, 'a staged, consistent bump must not read as a mismatch');
});

test('the report headings are the exact contract S09 pastes', () => {
  const w = ready();
  const r = syncUpstream({ ...w, log: silent });
  const lines = formatUpstream(r).text.split('\n');
  assert.match(lines[0], /^docs pin: [0-9a-f]{7} \(\d{4}-\d\d-\d\d\) → [0-9a-f]{7} \(\d{4}-\d\d-\d\d\)/);
  assert.match(lines[1], /^citations: checked: \d+ \| dead: \d+ → checked: \d+ \| dead: \d+$/);
  assert.match(formatUpstream(r).text, /^newly dead \(\d+\):$/m);
  assert.match(formatUpstream(r).text, /^healed \(\d+\)$/m);
  assert.match(lines[lines.length - 1],
    /^staged: engine\.config\.json, vendor\/ServiceNowDocs — review, then: git commit -m "chore\(docs\): bump ServiceNowDocs to [0-9a-f]{7}"$/);
});

test('--json carries every field the workflow reads', () => {
  const w = ready();
  const r = syncUpstream({ ...w, log: silent });
  for (const k of ['from', 'to', 'upstreamDate', 'checkedBefore', 'checkedAfter', 'newlyDead', 'healed', 'staged']) {
    assert.ok(k in r, `missing key ${k}`);
  }
  assert.deepEqual(r.staged, ['engine.config.json', CORPUS_DIR]);
  JSON.parse(JSON.stringify(r));
});

test('the areas file is never touched', () => {
  const w = ready();
  const areas = join(w.root, 'vendor/docs-areas.txt');
  const before = readFileSync(areas, 'utf8');
  syncUpstream({ ...w, log: silent });
  assert.equal(readFileSync(areas, 'utf8'), before);
  assert.ok(!git(['diff', '--cached', '--name-only'], w.root).includes('docs-areas'));
  assert.equal(AREAS.length, before.split('\n').filter(Boolean).length);
});

/**
 * Give the workspace the one generated file that depends on the pin.
 *
 * Written at the CURRENT pin and committed, so the fixture starts correct and the staleness is
 * caused by the move rather than by the setup — the fixture asserts that below before trusting
 * anything it observes afterwards. `ready()` has already committed, so this commits too: a dirty
 * tree is refused at step 1 and the test would never reach the behaviour it is about.
 */
function withRecipeDoc(w, { markers = true } = {}) {
  const { block } = renderRecipeBlock({ config: w.config, areas: AREAS });
  const body = markers ? block : block.replace(BEGIN, '').replace(END, '');
  mkdirSync(join(w.root, 'docs'), { recursive: true });
  writeFileSync(join(w.root, RECIPE_TARGET),
    `# fixture architecture\n\n## The git-only corpus recipe\n\n${body}\n\ntail prose\n`);
  git(['add', '-A'], w.root);
  git(['-c', 'user.email=f@example.invalid', '-c', 'user.name=f', 'commit', '-qm', 'recipe doc'], w.root);
  assert.equal(git(['status', '--porcelain'], w.root).trim(), '', 'fixture tree is not clean');
  return join(w.root, RECIPE_TARGET);
}

const docText = (w) => readFileSync(join(w.root, RECIPE_TARGET), 'utf8');

test('the block moves with the pin, and is staged with it', () => {
  const w = ready();
  const path = withRecipeDoc(w);

  // Preconditions, on content rather than on a re-render: the block names the pin we are leaving
  // and does not name the one we are going to. Comparing the document against `renderRecipeBlock`
  // would only prove the module agrees with itself.
  assert.ok(docText(w).includes(upstream.pin), 'the fixture block does not carry the old pin');
  assert.ok(!docText(w).includes(upstream.tip), 'the fixture block already carries the new pin');

  const r = syncUpstream({ ...w, log: silent });

  assert.equal(r.recipe.architecture, 'written');
  assert.ok(docText(w).includes(upstream.tip), 'the block still does not carry the new pin');
  assert.ok(!docText(w).includes(upstream.pin), 'the block still carries the old pin');
  assert.deepEqual(r.staged, ['engine.config.json', CORPUS_DIR, RECIPE_TARGET]);
  assert.deepEqual(git(['diff', '--cached', '--name-only'], w.root).trim().split('\n').sort(),
    ['engine.config.json', CORPUS_DIR, RECIPE_TARGET].sort());
  assert.match(formatUpstream(r).text.split('\n').at(-1),
    /^staged: engine\.config\.json, vendor\/ServiceNowDocs, docs\/ARCHITECTURE\.md — review, then: /);
  assert.equal(path, join(w.root, RECIPE_TARGET));
});

test('the block the bump writes is the block the generator writes', () => {
  // The one definition, proven against the tool a maintainer actually runs rather than against the
  // module the bump already imports. If these two ever diverge, every bump pull request ships a
  // document its own CI rejects — which is the failure this whole fix exists to remove.
  const w = ready();
  withRecipeDoc(w);
  syncUpstream({ ...w, log: silent });
  const afterBump = docText(w);

  const check = spawnSync(process.execPath,
    [join(repoRoot, 'scripts', 'gen-docs-recipe.mjs'), '--root', w.root, '--check'],
    { encoding: 'utf8' });
  assert.equal(check.status, 0, `the generator calls the bump's own output stale:\n${check.stderr}`);
  assert.match(check.stdout, /target\(s\) current/);
  assert.equal(docText(w), afterBump, '--check wrote to the file');
});

test('a refresh that moves nothing does not stage a document it did not change', () => {
  const w = ready();
  withRecipeDoc(w);

  const r = syncUpstream({ ...w, to: upstream.pin, log: silent });

  assert.equal(r.from, r.to, 'the fixture moved after all — this proves nothing');
  assert.equal(r.recipe.architecture, 'current');
  assert.deepEqual(r.staged, ['engine.config.json', CORPUS_DIR]);
  assert.ok(!git(['diff', '--cached', '--name-only'], w.root).includes('ARCHITECTURE'));
});

test('a document that has lost its markers is reported, not silently skipped', () => {
  const w = ready();
  withRecipeDoc(w, { markers: false });
  const before = docText(w);

  const r = syncUpstream({ ...w, log: silent });

  // The pin still moves. This runs after the write, and a command that aborted here would leave a
  // moved pin, a moved gitlink and no report — worse than the staleness it was refusing.
  assert.equal(pinIn(w.root), upstream.tip, 'the pin should still have moved');
  assert.equal(r.recipe.architecture, 'no-markers');
  assert.equal(docText(w), before, 'a markerless document must not be rewritten');
  assert.deepEqual(r.staged, ['engine.config.json', CORPUS_DIR]);
  assert.match(formatUpstream(r).text,
    /^recipe: the architecture target has lost its generator markers/m);
  // ...and the staged line is still the last one, because S09 pastes this and keys on its shape.
  assert.match(formatUpstream(r).text.split('\n').at(-1), /^staged: /);
  assert.ok(END.length > 0);
});

test('a workspace with no such document is not a failure', () => {
  // Every other test in this file runs in exactly this shape, so the status has to be benign —
  // but it is asserted by name here rather than inferred from those tests passing.
  const w = ready();
  const r = syncUpstream({ ...w, log: silent });
  assert.deepEqual(r.recipe, { architecture: 'absent', sh: 'absent', ps1: 'absent' },
    'a fixture tree has none of the three generated targets');
  assert.deepEqual(r.staged, ['engine.config.json', CORPUS_DIR]);
});

test('a bump stages five paths when the pin moves, and two when it does not', () => {
  // ARC-06-S06 made the recipe three generated files rather than one: the published block and the
  // two launcher recipes the Node-free bootstrap will source. A pin that moves moves all three, so
  // the staged list is the config, the corpus and whichever targets actually changed — and a
  // reviewer reading the PR body sees every file the bump touched, not a subset.
  const w = ready();
  const targets = ['docs/ARCHITECTURE.md',
    'tools/snowarch/launcher/docs-recipe.sh', 'tools/snowarch/launcher/docs-recipe.ps1'];
  for (const t of targets) {
    mkdirSync(join(w.root, dirname(t)), { recursive: true });
  }
  const { block } = renderRecipeBlock({ config: w.config, areas: AREAS });
  writeFileSync(join(w.root, targets[0]), `# fixture\n\n${block}\n`);
  for (const [t, marker] of [[targets[1], 'sh'], [targets[2], 'ps1']]) {
    writeFileSync(join(w.root, t),
      `# fixture ${marker}\n# recipe-begin sparse\n# recipe-end\n# recipe-begin full\n# recipe-end\n`);
  }
  git(['add', '-A'], w.root);
  git(['-c', 'user.email=f@example.invalid', '-c', 'user.name=f', 'commit', '-qm', 'targets'], w.root);

  const r = syncUpstream({ ...w, log: silent });

  assert.deepEqual(r.staged, ['engine.config.json', CORPUS_DIR, ...targets]);
  assert.deepEqual(r.recipe, { architecture: 'written', sh: 'written', ps1: 'written' });
  assert.match(formatUpstream(r).text.split('\n').at(-1),
    /^staged: engine\.config\.json, vendor\/ServiceNowDocs, docs\/ARCHITECTURE\.md, tools\/snowarch\/launcher\/docs-recipe\.sh, tools\/snowarch\/launcher\/docs-recipe\.ps1 — /);

  // ...and a re-run that moves nothing stages the two it always stages. The first bump's changes
  // are committed first: `syncUpstream` refuses a dirty tree before it touches the network, which
  // is the behaviour under test everywhere else in this file.
  git(['-c', 'user.email=f@example.invalid', '-c', 'user.name=f', 'commit', '-qm', 'bumped'], w.root);
  const again = syncUpstream({ ...w, config: JSON.parse(readFileSync(join(w.root, 'engine.config.json'), 'utf8')),
    to: r.to, log: silent });
  assert.deepEqual(again.staged, ['engine.config.json', CORPUS_DIR]);
});
