// Copyright 2026 Cvetomir Grigorov. Licensed under the Business Source License 1.1 (see LICENSE).
// snowarch — AI ServiceNow Architect. Not affiliated with or endorsed by ServiceNow, Inc.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { CORPUS_DIR, EXIT, syncCorpus } from '../tools/snowarch/lib/docs/sync.mjs';
import { syncUpstream } from '../tools/snowarch/lib/docs/upstream.mjs';
import { prBody } from '../scripts/docs-bump.mjs';
import { RECIPE_TARGET, renderRecipeBlock } from '../tools/snowarch/lib/docs/recipe-block.mjs';
import {
  AREAS, CITED_PAGE, PIN_FOLLOWERS, buildUpstream, git, installPage, makeWorkspace, writeCitingSkill, writeFollowers,
} from './helpers/docs-fixture.mjs';
import { spellings } from '../tools/snowarch/lib/text.mjs';
import { tempDir } from '../tools/snowarch/tests/helpers/temp.mjs';

/**
 * ARC-07-C31 — the launcher these cases assert, DERIVED from the process.
 *
 * The product lines here render for the terminal in front of them, so the process is the same
 * source they use (rule 1). A POSIX literal would be green on a mac and red on all three Windows
 * cells, which is this row's own "62 expectations across 13 files" trap.
 */
const SPELL = spellings();

/**
 * The weekly bump: the body a reviewer reads, and the paths the workflow takes around it.
 *
 * `gh` is STUBBED — a script on PATH that records its argv and answers the two queries the workflow
 * makes. Never the real `gh`: a test that opened a pull request would be a test that changed the
 * repository, and the whole point of this workflow is that nothing merges without a human.
 */
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
let scratch, upstream, upstreamUrl, ghBin, ghLog;

const silent = () => {};
const read = (root, rel) => readFileSync(join(root, rel), 'utf8');

function ready() {
  const w = makeWorkspace({ scratch, pin: upstream.pin, upstreamUrl });
  writeFileSync(join(w.root, 'engine.config.json'), `${JSON.stringify({
    docs: { family: 'australia', pin: upstream.pin, areasFile: 'vendor/docs-areas.txt', upstream: upstreamUrl },
  }, null, 2)}\n`);
  writeCitingSkill(w.root, CITED_PAGE);
  syncCorpus({ ...w, config: { docs: { ...w.config.docs, pin: upstream.pin } }, log: silent });
  git(['add', '-A'], w.root);
  git(['-c', 'user.email=f@example.invalid', '-c', 'user.name=f', 'commit', '-qm', 'ready'], w.root);
  assert.equal(git(['status', '--porcelain'], w.root).trim(), '', 'precondition: the tree is clean');
  return { root: w.root, config: JSON.parse(read(w.root, 'engine.config.json')) };
}

/** A `gh` that records what it was asked and answers the two queries the workflow makes. */
function stubGh(dir, { existingPr = '', openBumpPrs = '[]' } = {}) {
  const bin = join(dir, 'bin');
  mkdirSync(bin, { recursive: true });
  const log = join(dir, 'gh.log');
  writeFileSync(log, '');
  writeFileSync(join(bin, 'gh'), `#!/bin/sh
printf '%s\\n' "$*" >> ${JSON.stringify(log)}
case "$1 $2" in
  "pr list") case "$*" in
      *"--head"*) printf '%s' ${JSON.stringify(existingPr)} ;;
      *) printf '%s' ${JSON.stringify(openBumpPrs)} ;;
    esac ;;
  "pr create") echo "https://github.com/x/y/pull/123" ;;
esac
exit 0
`);
  chmodSync(join(bin, 'gh'), 0o755);
  return { bin, log };
}

before(() => {
  scratch = tempDir('snowarch-docs-bump-');
  upstream = buildUpstream(scratch);
  upstreamUrl = pathToFileURL(upstream.bare).href;
  ({ bin: ghBin, log: ghLog } = stubGh(scratch));
  assert.notEqual(upstream.tip, upstream.pin, 'the fixture tip is not ahead of the pin');
});

after(() => { rmSync(scratch, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); });

test('AC 1 — the body carries the pin line, the citations line and the newly-dead section', () => {
  const w = ready();
  // `deletes-cited` removes the page the fixture skill cites, so there IS a newly dead citation —
  // the shape the real first bump will have.
  const report = syncUpstream({ ...w, config: { ...w.config, docs: { ...w.config.docs, family: 'deletes-cited' } }, log: silent, spell: SPELL });
  const body = prBody(report);

  assert.match(body, new RegExp(`^docs pin: ${upstream.pin.slice(0, 7)} \\(\\d{4}-\\d\\d-\\d\\d\\) → [0-9a-f]{7} `, 'm'));
  assert.match(body, /^citations: checked: \d+ \| dead: \d+ → checked: \d+ \| dead: \d+$/m);
  assert.match(body, /^newly dead \(1\):$/m);
  assert.match(body, new RegExp(`DEAD \\.claude/skills/fixture/SKILL\\.md:\\d+ ${CITED_PAGE}`));
});

test('the body leads with the checklist and fences the report unaltered', () => {
  const w = ready();
  const report = syncUpstream({ ...w, log: silent, spell: SPELL });
  const body = prBody(report);
  const lines = body.split('\n');

  assert.equal(lines[0], '- [ ] newly dead citations remapped (or none)');
  assert.equal(lines[1], '- [ ] `node scripts/docs.mjs verify` → `dead: 0`');
  assert.equal(lines[2], '- [ ] release notes skimmed: `vendor/ServiceNowDocs/markdown/release-notes/`');
  // Verbatim: a reviewer comparing this against a local run must find the same bytes.
  const fenced = body.split('```')[1].trim().split('\n');
  assert.match(fenced[0], /^docs pin: /);
  assert.match(fenced[fenced.length - 1], /^staged: engine\.config\.json, vendor\/ServiceNowDocs — review, then: /);
  assert.match(body, /Never auto-merged\./);
});

test('a dry run restores the tree exactly — porcelain empty AND the pin unmoved', () => {
  const w = ready();
  const pinBefore = JSON.parse(read(w.root, 'engine.config.json')).docs.pin;
  const headBefore = git(['rev-parse', 'HEAD'], join(w.root, CORPUS_DIR)).trim();
  assert.equal(pinBefore, upstream.pin, 'precondition: the pin is where the fixture put it');

  const r = execFileSync(process.execPath, [join(repoRoot, 'scripts/docs-bump.mjs'), '--dry-run'],
    { cwd: w.root, encoding: 'utf8' });

  assert.match(r, /docs-bump: dry run — tree restored, porcelain empty, nothing staged/);
  assert.equal(git(['status', '--porcelain'], w.root).trim(), '', 'the dry run left the tree dirty');
  assert.equal(JSON.parse(read(w.root, 'engine.config.json')).docs.pin, pinBefore, 'the pin moved');
  assert.equal(git(['rev-parse', 'HEAD'], join(w.root, CORPUS_DIR)).trim(), headBefore, 'the corpus moved');
});

test('a dry run whose only finding is dead citations still exits 0, with a warning annotation', () => {
  const w = ready();
  writeFileSync(join(w.root, 'engine.config.json'), `${JSON.stringify({
    docs: { ...w.config.docs, family: 'deletes-cited' },
  }, null, 2)}\n`);
  git(['add', '-A'], w.root);
  git(['-c', 'user.email=f@example.invalid', '-c', 'user.name=f', 'commit', '-qm', 'aim at the deleting branch'], w.root);

  const r = execFileSync(process.execPath, [join(repoRoot, 'scripts/docs-bump.mjs'), '--dry-run'],
    { cwd: w.root, encoding: 'utf8' });   // throws on a non-zero exit, which is the assertion

  assert.match(r, /^::warning::docs-bump: 1 newly dead citation\(s\)/m);
  assert.match(r, /^newly dead \(1\):$/m);
  assert.equal(git(['status', '--porcelain'], w.root).trim(), '');
});

test('a real (non-dry) run exits 1 when citations broke, and leaves the move staged', () => {
  const w = ready();
  writeFileSync(join(w.root, 'engine.config.json'), `${JSON.stringify({
    docs: { ...w.config.docs, family: 'deletes-cited' },
  }, null, 2)}\n`);
  git(['add', '-A'], w.root);
  git(['-c', 'user.email=f@example.invalid', '-c', 'user.name=f', 'commit', '-qm', 'aim'], w.root);

  let code = 0;
  try { execFileSync(process.execPath, [join(repoRoot, 'scripts/docs-bump.mjs')], { cwd: w.root, encoding: 'utf8' }); }
  catch (e) { code = e.status; }

  assert.equal(code, EXIT.incomplete, 'a broken citation must exit 1 so the workflow labels it');
  assert.deepEqual(git(['diff', '--cached', '--name-only'], w.root).trim().split('\n').sort(),
    ['engine.config.json', CORPUS_DIR].sort());
});

test('an upstream that does not have the branch exits 6 with an ::error:: annotation', () => {
  const w = ready();
  writeFileSync(join(w.root, 'engine.config.json'), `${JSON.stringify({
    docs: { ...w.config.docs, family: 'no-such-branch' },
  }, null, 2)}\n`);
  git(['add', '-A'], w.root);
  git(['-c', 'user.email=f@example.invalid', '-c', 'user.name=f', 'commit', '-qm', 'aim at nothing'], w.root);

  let code = 0, out = '';
  try { execFileSync(process.execPath, [join(repoRoot, 'scripts/docs-bump.mjs')], { cwd: w.root, encoding: 'utf8' }); }
  catch (e) { code = e.status; out = String(e.stdout ?? ''); }

  assert.equal(code, EXIT.upstream);
  assert.match(out, /^::error::docs-bump: upstream branch 'no-such-branch' not found/m);
  assert.equal(git(['rev-parse', 'HEAD'], join(w.root, CORPUS_DIR)).trim(), upstream.pin, 'the corpus moved anyway');
});

test('AC 3 — the branch name is stable for the same target SHA', () => {
  // The workflow derives it from the short SHA, so two runs against one tip address one branch and
  // therefore one pull request. Asserted on the value the workflow reads, not on the workflow.
  const w = ready();
  const a = syncUpstream({ ...w, log: silent, spell: SPELL });
  assert.equal(`chore/docs-bump-${a.to.slice(0, 7)}`, `chore/docs-bump-${upstream.tip.slice(0, 7)}`);
  assert.match(`chore/docs-bump-${a.to.slice(0, 7)}`, /^chore\/docs-bump-[0-9a-f]{7}$/);
});

test('the stubbed gh records the calls the workflow would make — and is never the real gh', {
  // POSIX-only, and the subject is too: this workflow runs on `ubuntu-latest` and nothing else, so
  // a shell-script stub reached through a colon-separated PATH is exactly the shape under test. On
  // Windows `command -v` finds no extensionless script and the test would be measuring the runner,
  // not the workflow.
  skip: process.platform === 'win32' ? 'the bump workflow is ubuntu-only; the stub is a POSIX script' : false,
}, () => {
  // Guard on the stub itself: a test that silently fell through to a real `gh` would be a test that
  // could open a pull request.
  const which = execFileSync('sh', ['-c', 'command -v gh'],
    { env: { ...process.env, PATH: `${ghBin}:${process.env.PATH}` }, encoding: 'utf8' }).trim();
  assert.equal(which, join(ghBin, 'gh'), 'PATH does not reach the stub first');

  execFileSync('sh', ['-c', 'gh pr list --head chore/docs-bump-abc1234 --state open --json number'],
    { env: { ...process.env, PATH: `${ghBin}:${process.env.PATH}` }, encoding: 'utf8' });
  execFileSync('sh', ['-c', 'gh pr create --base develop --head chore/docs-bump-abc1234 --body-file body.md'],
    { env: { ...process.env, PATH: `${ghBin}:${process.env.PATH}` }, encoding: 'utf8' });

  const calls = readFileSync(ghLog, 'utf8').trim().split('\n');
  assert.ok(calls.some((c) => c.startsWith('pr list')), 'the existing-PR query was not made');
  assert.ok(calls.some((c) => c.startsWith('pr create --base develop')), 'the create call was not made');
  assert.ok(!calls.some((c) => c.includes('--merge') || c.includes('merge')), 'something tried to merge');
});

test('the workflow never merges, never edits skills, and asks for no secret but GITHUB_TOKEN', () => {
  const wf = readFileSync(join(repoRoot, '.github/workflows/docs-bump.yml'), 'utf8');
  assert.ok(!/gh pr merge|--auto|--merge\b/.test(wf), 'the workflow can merge');
  assert.ok(!/\.claude\/skills/.test(wf), 'the workflow touches skills');
  const secrets = [...wf.matchAll(/secrets\.([A-Z_]+)/g)].map((m) => m[1]);
  assert.deepEqual([...new Set(secrets)], [], 'the workflow reads a repository secret');
  assert.match(wf, /GH_TOKEN: \$\{\{ github\.token \}\}/);
  assert.match(wf, /cancel-in-progress: false/);
  assert.match(wf, /cron: '17 5 \* \* 1'/);
});

test('the areas file is untouched by a bump', () => {
  const w = ready();
  const areas = read(w.root, 'vendor/docs-areas.txt');
  syncUpstream({ ...w, log: silent, spell: SPELL });
  assert.equal(read(w.root, 'vendor/docs-areas.txt'), areas);
  assert.equal(AREAS.length, areas.split('\n').filter(Boolean).length);
});

test('the script writes the outputs the workflow reads', () => {
  // The workflow keys every later step on these. They used to be produced by an inline `node -e`
  // in the YAML; moving them here is what removed shellcheck's SC2016 finding, so the contract
  // between script and workflow is asserted rather than assumed.
  const w = ready();
  const outFile = join(scratch, `gh-output-${Date.now()}`);
  writeFileSync(outFile, '');
  execFileSync(process.execPath, [join(repoRoot, 'scripts/docs-bump.mjs'), '--dry-run'],
    { cwd: w.root, encoding: 'utf8', env: { ...process.env, GITHUB_OUTPUT: outFile } });

  const kv = Object.fromEntries(readFileSync(outFile, 'utf8').split('\n').filter(Boolean)
    .map((l) => l.split('=')));
  assert.deepEqual(Object.keys(kv).sort(), ['date', 'from', 'moved', 'newly_dead', 'short', 'to']);
  assert.equal(kv.from, upstream.pin);
  assert.equal(kv.to, upstream.tip);
  assert.equal(kv.short, upstream.tip.slice(0, 7));
  assert.equal(kv.moved, 'true');
  assert.match(kv.date, /^\d{4}-\d\d-\d\d$/);

  // The workflow interpolates `short` into a branch name and a commit message, so it must not
  // carry anything a shell would treat as syntax.
  assert.match(kv.short, /^[0-9a-f]{7}$/);
});

test('the body a reviewer reads names the regenerated document among the staged paths', () => {
  // The S09 half of the recipe fix. The upstream tests prove the block moves; this proves the
  // pull-request body SAYS SO, because a reviewer approving a bump has only this text to tell them
  // that a generated document changed underneath the pin.
  const w = ready();
  const { block } = renderRecipeBlock({ config: w.config, areas: AREAS });
  mkdirSync(join(w.root, 'docs'), { recursive: true });
  writeFileSync(join(w.root, RECIPE_TARGET), `# fixture\n\n${block}\n`);
  git(['add', '-A'], w.root);
  git(['-c', 'user.email=f@example.invalid', '-c', 'user.name=f', 'commit', '-qm', 'doc'], w.root);

  const report = syncUpstream({ ...w, log: silent, spell: SPELL });
  const fenced = prBody(report).split('```')[1].trim().split('\n');

  assert.equal(report.recipe.architecture, 'written');
  assert.match(fenced[fenced.length - 1],
    /^staged: engine\.config\.json, vendor\/ServiceNowDocs, docs\/ARCHITECTURE\.md — review, then: /);
  // The JSON the workflow writes carries it too, without a second place deciding what "staged" is.
  const out = JSON.parse(JSON.stringify({ ...report, prBody: prBody(report), dryRun: false }));
  assert.deepEqual(out.staged, ['engine.config.json', CORPUS_DIR, RECIPE_TARGET]);
  assert.equal(out.recipe.architecture, 'written');
});

test('a dry run restores the regenerated document too, not just the pin', () => {
  // The restore used to name `engine.config.json` and nothing else. Once the refresh regenerated a
  // second file, a dry run unstaged it and left it modified — and the check below is what says so.
  const w = ready();
  const { block } = renderRecipeBlock({ config: w.config, areas: AREAS });
  mkdirSync(join(w.root, 'docs'), { recursive: true });
  writeFileSync(join(w.root, RECIPE_TARGET), `# fixture\n\n${block}\n`);
  git(['add', '-A'], w.root);
  git(['-c', 'user.email=f@example.invalid', '-c', 'user.name=f', 'commit', '-qm', 'doc'], w.root);
  const before = read(w.root, RECIPE_TARGET);
  const pinBefore = JSON.parse(read(w.root, 'engine.config.json')).docs.pin;

  const r = execFileSync(process.execPath, [join(repoRoot, 'scripts/docs-bump.mjs'), '--dry-run'],
    { cwd: w.root, encoding: 'utf8', env: { ...process.env, GITHUB_OUTPUT: '' } });

  assert.match(r, /dry run — tree restored, porcelain empty, nothing staged/);
  // Bytes, not a normalised comparison: the fixture workspace pins `eol=lf` exactly as this
  // repository does, so a document that came back with different line endings would be a fixture
  // that stopped modelling the real one — worth failing over rather than papering over.
  assert.equal(read(w.root, RECIPE_TARGET), before, 'the document was left modified');
  assert.equal(JSON.parse(read(w.root, 'engine.config.json')).docs.pin, pinBefore);
  assert.equal(git(['status', '--porcelain'], w.root).trim(), '');
});

/**
 * ARC-09-C280 — the files that quote the pin, and the corpus map, are the bump's output too.
 *
 * The workflow runs this script and commits what it staged, so what the script stages is what the bot's pull request
 * carries. #573, the bump to 96d3212, carried the config, the gitlink and the three recipe targets and went red on the
 * panel sample, the two status fixtures and the map, which a person then moved by hand.
 */
const MAP_PATH = 'vendor/docs-map.md';
const GEN_MAP = join(repoRoot, 'scripts', 'gen-docs-map.mjs');
const mapTool = (w, ...args) => spawnSync(process.execPath, [GEN_MAP, ...args, '--root', w.root], { encoding: 'utf8' });
const BUMP = join(repoRoot, 'scripts', 'docs-bump.mjs');
const bump = (w, ...args) => spawnSync(process.execPath, [BUMP, ...args], {
  cwd: w.root, encoding: 'utf8', env: { ...process.env, GITHUB_OUTPUT: '' },
});

/** The workspace gains the five followers and the map, at the current pin, committed. */
function withFollowersAndMap(w) {
  writeFollowers(w.root, upstream.pin);
  const made = mapTool(w, '--write');
  assert.equal(made.status, 0, `the fixture cannot make its first map: ${made.stdout}${made.stderr}`);
  git(['add', '-A'], w.root);
  git(['-c', 'user.email=f@example.invalid', '-c', 'user.name=f', 'commit', '-qm', 'followers and map'], w.root);
  assert.equal(git(['status', '--porcelain'], w.root).trim(), '', 'precondition: the tree is clean');
}

test('ARC-09-C280 — a real run stages the files that follow the pin and the map, and names them in its report', () => {
  const w = ready();
  withFollowersAndMap(w);

  const r = bump(w, '--json');

  assert.equal(r.status, 0, `${r.stdout}${r.stderr}`);
  const out = JSON.parse(read(w.root, 'bump.json'));
  const staged = ['engine.config.json', CORPUS_DIR, ...PIN_FOLLOWERS, MAP_PATH];
  assert.deepEqual(out.staged, staged, 'the report does not list what the bump staged');
  assert.deepEqual(git(['diff', '--cached', '--name-only'], w.root).trim().split('\n').sort(), [...staged].sort());
  for (const p of PIN_FOLLOWERS) {
    assert.ok(read(w.root, p).includes(upstream.tip.slice(0, 12)), `${p}: does not carry the new pin`);
    assert.ok(!read(w.root, p).includes(upstream.pin.slice(0, 12)), `${p}: still carries the old pin`);
  }
  assert.ok(read(w.root, MAP_PATH).includes(upstream.tip) && !read(w.root, MAP_PATH).includes(upstream.pin), 'the map is not at the new pin');
  assert.equal(mapTool(w, '--check').status, 0, 'the generator calls the bump\'s map stale');
  const fenced = out.prBody.split('```')[1].trim().split('\n');
  assert.match(fenced[fenced.length - 1],
    /^staged: engine\.config\.json, vendor\/ServiceNowDocs, .*tests\/fixtures\/doctor\/status-live\.json, vendor\/docs-map\.md — review, then: /);
});

test('ARC-09-C280 — a dry run puts the files that follow the pin and the map back too, not just the pin', () => {
  const w = ready();
  withFollowersAndMap(w);
  const before = Object.fromEntries([...PIN_FOLLOWERS, MAP_PATH].map((f) => [f, read(w.root, f)]));

  const r = bump(w, '--dry-run');

  assert.match(r.stdout, /dry run — tree restored, porcelain empty, nothing staged/);
  for (const [f, text] of Object.entries(before)) assert.equal(read(w.root, f), text, `${f} was left modified`);
  assert.equal(git(['status', '--porcelain'], w.root).trim(), '');
});

test('ARC-09-C280 — a map the generator will not write is reported before the staged line, and the rest is still staged', () => {
  const w = ready();
  withFollowersAndMap(w);
  // The generator refuses a sparse corpus (exit 2): the map is made from the whole corpus at the pin.
  git(['sparse-checkout', 'set', '--cone', 'markdown/alpha'], join(w.root, CORPUS_DIR));
  assert.ok(!existsSync(join(w.root, CORPUS_DIR, 'markdown/beta')), 'the cone did not leave beta out');
  const mapBefore = read(w.root, MAP_PATH);

  const r = bump(w, '--json');

  assert.equal(r.status, 0, `${r.stdout}${r.stderr}`);
  const out = JSON.parse(read(w.root, 'bump.json'));
  assert.equal(out.map, 'refused', 'the report says nothing about the corpus map');
  assert.equal(read(w.root, MAP_PATH), mapBefore, 'a map the generator refused was touched');
  assert.deepEqual(out.staged, ['engine.config.json', CORPUS_DIR, ...PIN_FOLLOWERS]);
  const fenced = out.prBody.split('```')[1].trim().split('\n');
  assert.match(fenced.at(-2), /^map: vendor\/docs-map\.md was NOT regenerated/);
  assert.match(fenced.at(-1), /^staged: /);
});

test('ARC-09-C280 — a follower that no longer quotes the pin is reported before the staged line', () => {
  const w = ready();
  writeFollowers(w.root, upstream.pin, { except: [PIN_FOLLOWERS[0]] });
  mkdirSync(dirname(join(w.root, PIN_FOLLOWERS[0])), { recursive: true });
  writeFileSync(join(w.root, PIN_FOLLOWERS[0]), '# fixture\n\nreworded, and it names no pin\n');
  git(['add', '-A'], w.root);
  git(['-c', 'user.email=f@example.invalid', '-c', 'user.name=f', 'commit', '-qm', 'followers'], w.root);

  const r = bump(w, '--json');

  assert.equal(r.status, 0, `${r.stdout}${r.stderr}`);
  const out = JSON.parse(read(w.root, 'bump.json'));
  assert.equal(out.followers?.[PIN_FOLLOWERS[0]], 'lost', 'the report says nothing about the files that follow the pin');
  assert.ok(!out.staged.includes(PIN_FOLLOWERS[0]));
  const fenced = out.prBody.split('```')[1].trim().split('\n');
  assert.match(fenced.at(-2), new RegExp(`^pin: ${PIN_FOLLOWERS[0].replaceAll('.', '\\.')} carries neither`));
  assert.match(fenced.at(-1), /^staged: /);
});

/**
 * ARC-09-C283 — a bump says whether the install page's corpus figures still hold.
 *
 * Nothing on the page follows the corpus, and the bump has both in front of it: the fresh corpus on disk and `docs/INSTALL.md` in the
 * tree. The body's checklist gets one line with the corpus's files, areas and working tree next to the page's, so a stale page is
 * visible at the bump and not a month later (ARC-09-C279 found it at 56 areas and 51,665 files against 54 and 51,186).
 */
/** The corpus as the bump left it, counted here by walking the disk, not by the code under test. */
function corpusNow(w) {
  const dir = join(w.root, CORPUS_DIR);
  let files = 0, bytes = 0;
  const walk = (d) => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      if (e.name === '.git') continue;
      const p = join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.isFile()) { files += 1; bytes += statSync(p).size; }
    }
  };
  walk(dir);
  const areas = readdirSync(join(dir, 'markdown'), { withFileTypes: true }).filter((e) => e.isDirectory()).length;
  return { files, areas, workingTreeMb: Math.round(bytes / 1e6) };
}
const commitAll = (w, message) => {
  git(['add', '-A'], w.root);
  git(['-c', 'user.email=f@example.invalid', '-c', 'user.name=f', 'commit', '-qm', message], w.root);
};

test('ARC-09-C283 — a bump prints the corpus figures next to a stale page\'s, and a page that holds gets a checked line', () => {
  const w = ready();
  mkdirSync(join(w.root, 'docs'), { recursive: true });
  writeFileSync(join(w.root, 'docs', 'INSTALL.md'), installPage({ areas: 99, files: 99999, mb: 5 }));
  commitAll(w, 'a stale page');

  const first = bump(w, '--json');
  assert.equal(first.status, 0, `${first.stdout}${first.stderr}`);
  const out = JSON.parse(read(w.root, 'bump.json'));
  const corpus = corpusNow(w);
  assert.deepEqual(out.figures?.corpus, corpus, 'the report does not carry the corpus figures, or they are not what is on disk');
  assert.deepEqual(out.figures?.page, { areas: 99, files: 99999, workingTreeMb: 5 });
  const lead = out.prBody.split('```')[0].split('\n');
  const line = lead.find((l) => l.includes('install page figures'));
  assert.ok(line, `the checklist has no install page figures line:\n${lead.join('\n')}`);
  assert.ok(line.startsWith('- [ ] install page figures differ from the corpus'), line);
  for (const part of [`files ${corpus.files.toLocaleString('en-US')} (page: 99,999)`, `areas ${corpus.areas} (page: 99)`,
    `working tree ${corpus.workingTreeMb} MB (page: 5 MB)`]) assert.ok(line.includes(part), `${part} is not in: ${line}`);

  // The page is brought up to the corpus, and the same bump, with nothing left to move, says so. The report file is the run's own
  // output and not a change, so it goes before the commit: a bump refuses a tree that is not clean.
  rmSync(join(w.root, 'bump.json'));
  commitAll(w, 'bumped');
  writeFileSync(join(w.root, 'docs', 'INSTALL.md'), installPage({ areas: corpus.areas, files: corpus.files, mb: corpus.workingTreeMb }));
  commitAll(w, 'the page follows');
  const second = bump(w, '--json');
  assert.equal(second.status, 0, `${second.stdout}${second.stderr}`);
  const again = JSON.parse(read(w.root, 'bump.json'));
  assert.equal(again.from, again.to, 'the second bump moved after all — this proves nothing');
  assert.ok(again.prBody.split('```')[0].includes(
    `- [x] install page figures match the corpus: ${corpus.files.toLocaleString('en-US')} files · ${corpus.areas} areas · ${corpus.workingTreeMb} MB working tree`),
  again.prBody.split('```')[0]);
});

test('ARC-09-C283 — a tree with no install page says it did not check, and the report still carries the corpus', () => {
  const w = ready();
  const r = bump(w, '--json');
  assert.equal(r.status, 0, `${r.stdout}${r.stderr}`);
  const out = JSON.parse(read(w.root, 'bump.json'));
  assert.equal(out.figures?.page, null, 'the report says nothing about the page');
  assert.deepEqual(out.figures?.corpus, corpusNow(w));
  assert.ok(out.prBody.includes('- [ ] install page figures not checked: there is no docs/INSTALL.md in this tree'));
});

/**
 * ARC-03-S09 AC 5 — the `needs-remap` label, and the half that was "by construction".
 *
 * The workflow adds the label when a citation died: `labels="$labels,needs-remap"` guarded by
 * `NEWLY_DEAD != "0"`. The test above asserts the gh calls a PR makes; nothing asserted the GUARD,
 * so "a broken citation gets the label" was true of the file and true of nobody's run
 * (acceptance item B03-03).
 *
 * The snippet is READ OUT OF THE WORKFLOW and executed, rather than retyped here. A copy would be a
 * second definition of the rule, and the first thing a second definition does is stop matching —
 * which is the same reason the cloud-sync fixture exists and the roster has one source.
 */
test('AC 5 — the needs-remap guard, extracted from the workflow and run both ways', () => {
  const wf = readFileSync(join(repoRoot, '.github/workflows/docs-bump.yml'), 'utf8');

  // The two lines that decide the labels, taken verbatim and with their indentation stripped.
  const lines = wf.split('\n').map((l) => l.trim());
  const start = lines.indexOf('labels=docs-corpus');
  assert.ok(start > -1, 'the workflow no longer sets `labels=docs-corpus` — find the new shape');
  const guard = lines[start + 1];
  assert.match(guard, /^if \[ "\$NEWLY_DEAD" != "0" \]; then labels="\$labels,needs-remap"; fi$/,
    `the guard changed shape: ${guard}`);

  const snippet = `${lines[start]}\n${guard}\necho "$labels"`;
  const run = (newlyDead) => execFileSync('sh', ['-c', snippet],
    { encoding: 'utf8', env: { ...process.env, NEWLY_DEAD: newlyDead } }).trim();

  // Both directions, which is the whole point: a dead citation labels, a clean bump does not.
  assert.equal(run('0'), 'docs-corpus');
  assert.equal(run('1'), 'docs-corpus,needs-remap');
  assert.equal(run('7'), 'docs-corpus,needs-remap');
  // ...and the label is CREATED before it is used, or `gh pr create --label` fails on a fresh repo.
  assert.match(wf, /gh label create needs-remap --color [0-9a-f]{6}/);
  assert.ok(wf.indexOf('gh label create needs-remap') < wf.indexOf('labels=docs-corpus'),
    'the label is used before it is created');
});

test('AC 5 — both PR paths pass the computed labels, so an existing PR gains it too', () => {
  // A bump that breaks a citation usually UPDATES yesterday's open PR rather than opening one, so
  // the edit path is the one a reader actually meets. Asserted on the workflow's own two calls.
  const wf = readFileSync(join(repoRoot, '.github/workflows/docs-bump.yml'), 'utf8');
  assert.match(wf, /gh pr edit "\$existing" --body-file body\.md --add-label "\$labels"/);
  assert.match(wf, /--body-file body\.md --label "\$labels"/);
});

/**
 * ARC-09-C290 — a bump says whether the Windows guides' corpus figures hold. The two guides show a real run of the bootstrap (`[docs] <files> files ·
 * <n> MB working tree`, a Windows run's) and say how many pages the Architect reads; they were left on the old pin when the install page moved
 * (ARC-09-C279), and the bump read only the install page. The files are the corpus's, the pages are counted as the names index counts them, and the
 * working tree is the install page's own figure for Windows, which no Linux checkout can measure.
 */
/** The pages of the corpus as the bump left it: the `.md` files below an area folder, counted here by walking the disk, not by the code under test. */
function pagesNow(w) {
  const md = join(w.root, CORPUS_DIR, 'markdown');
  let pages = 0;
  const walk = (d) => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const p = join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.isFile() && e.name.endsWith('.md')) pages += 1;
    }
  };
  for (const e of readdirSync(md, { withFileTypes: true })) if (e.isDirectory()) walk(join(md, e.name));
  return pages;
}
const commas = (n) => n.toLocaleString('en-US');
const windowsGuide = ({ files, pages, mb }) => `On screen:\n\n\`\`\`\n[docs] ${commas(files)} files · ${mb} MB working tree\n\`\`\`\n\nThis downloads all ${commas(pages)} pages of ServiceNow documentation.\n`;

test('ARC-09-C290 — a bump says, for each Windows guide, whether it states the corpus\'s files and pages and the install page\'s Windows working tree', () => {
  const w = ready();
  mkdirSync(join(w.root, 'docs'), { recursive: true });
  // The guides are stale: the install page says 5 MB on Linux and so 12 on Windows, a guide says 99,999 files, and the other says nothing that is right.
  writeFileSync(join(w.root, 'docs', 'INSTALL.md'), installPage({ areas: 99, files: 99999, mb: 5 }));
  writeFileSync(join(w.root, 'docs', 'INSTALL-WINDOWS.md'), windowsGuide({ files: 99999, pages: 99990, mb: 11 }));
  writeFileSync(join(w.root, 'docs', 'AI-Architect-Windows-Install-Guide.html'), 'a guide that states no figure\n');
  commitAll(w, 'stale guides');

  const first = bump(w, '--json');
  assert.equal(first.status, 0, `${first.stdout}${first.stderr}`);
  const out = JSON.parse(read(w.root, 'bump.json'));
  const corpus = corpusNow(w);                                              // after the bump: the report measures the corpus it left
  const pages = pagesNow(w);
  assert.notEqual(pages, corpus.files, 'precondition: the fixture corpus has a file that is no page, or this proves nothing about counting pages');
  assert.deepEqual(out.figures?.windows?.corpus, { files: corpus.files, pages }, `the report does not carry the corpus's files and pages: ${JSON.stringify(out.figures?.windows)}`);
  assert.equal(out.figures?.windows?.workingTreeMb, 12, 'the report does not carry the install page\'s Windows working tree');
  const lead = out.prBody.split('```')[0].split('\n');
  const stale = lead.find((l) => l.includes('docs/INSTALL-WINDOWS.md figures'));
  assert.ok(stale?.startsWith('- [ ] docs/INSTALL-WINDOWS.md figures differ from the corpus: '), `no differing line for the Markdown guide:\n${lead.join('\n')}`);
  for (const part of [`files ${commas(corpus.files)} (guide: 99,999)`, `pages ${commas(pages)} (guide: 99,990)`, 'Windows working tree 12 MB (guide: 11 MB)']) {
    assert.ok(stale.includes(part), `${part} is not in: ${stale}`);
  }
  assert.ok(lead.includes('- [ ] docs/AI-Architect-Windows-Install-Guide.html figures not checked: it does not state the files, the pages and the working tree where the bump reads them'),
    `no line for the guide that states nothing:\n${lead.join('\n')}`);

  // The install page and the guides follow the corpus, and the same bump, with nothing left to move, says so for both.
  rmSync(join(w.root, 'bump.json'));
  commitAll(w, 'bumped');
  const windowsMb = corpus.workingTreeMb + 7;                               // the fixture install page gives Windows 7 MB more than Linux
  writeFileSync(join(w.root, 'docs', 'INSTALL.md'), installPage({ areas: corpus.areas, files: corpus.files, mb: corpus.workingTreeMb }));
  writeFileSync(join(w.root, 'docs', 'INSTALL-WINDOWS.md'), windowsGuide({ files: corpus.files, pages, mb: windowsMb }));
  writeFileSync(join(w.root, 'docs', 'AI-Architect-Windows-Install-Guide.html'), windowsGuide({ files: corpus.files, pages, mb: windowsMb }));
  commitAll(w, 'the guides follow');
  const second = bump(w, '--json');
  assert.equal(second.status, 0, `${second.stdout}${second.stderr}`);
  const again = JSON.parse(read(w.root, 'bump.json'));
  assert.equal(again.from, again.to, 'the second bump moved after all — this proves nothing');
  const held = again.prBody.split('```')[0].split('\n');
  for (const file of ['docs/INSTALL-WINDOWS.md', 'docs/AI-Architect-Windows-Install-Guide.html']) {
    assert.ok(held.includes(`- [x] ${file} figures match the corpus: ${commas(corpus.files)} files · ${commas(pages)} pages · ${windowsMb} MB working tree`), `no checked line for ${file}:\n${held.join('\n')}`);
  }
});

test('ARC-09-C290 — a tree with no Windows guide says it did not check, for each guide', () => {
  const w = ready();
  const corpus = corpusNow(w);
  mkdirSync(join(w.root, 'docs'), { recursive: true });
  writeFileSync(join(w.root, 'docs', 'INSTALL.md'), installPage({ areas: corpus.areas, files: corpus.files, mb: corpus.workingTreeMb }));
  commitAll(w, 'the install page only');
  const r = bump(w, '--json');
  assert.equal(r.status, 0, `${r.stdout}${r.stderr}`);
  const lead = JSON.parse(read(w.root, 'bump.json')).prBody.split('```')[0].split('\n');
  for (const file of ['docs/INSTALL-WINDOWS.md', 'docs/AI-Architect-Windows-Install-Guide.html']) {
    assert.ok(lead.includes(`- [ ] ${file} figures not checked: there is no ${file} in this tree`), `no line for ${file}:\n${lead.join('\n')}`);
  }
});

/**
 * ARC-09-C300 — and whether the macOS guides' figures hold. The macOS guide and its HTML twin show the same real run and say the same sentence as the
 * Windows pair (`[docs] <files> files · <n> MB working tree`, "downloads all <n> pages"), and a docs bump has to say whether they follow the corpus too.
 * What differs is the working tree: a Mac counts the bytes a Linux checkout does, so the guide is held to the corpus's own working tree, which the bump
 * measures, and not to the install page's Windows figure.
 */
const macosGuide = (figures) => windowsGuide(figures);                       // the same two shapes, said by a Mac's run

test('ARC-09-C300 — a bump says, for each macOS guide, whether it states the corpus\'s files, pages and working tree', () => {
  const w = ready();
  mkdirSync(join(w.root, 'docs'), { recursive: true });
  // The guides are stale: one says 99,999 files, and the other says nothing that is right. The install page is stale too, and stays so below.
  writeFileSync(join(w.root, 'docs', 'INSTALL.md'), installPage({ areas: 99, files: 99999, mb: 5 }));
  writeFileSync(join(w.root, 'docs', 'INSTALL-MACOS.md'), macosGuide({ files: 99999, pages: 99990, mb: 11 }));
  writeFileSync(join(w.root, 'docs', 'AI-Architect-macOS-Install-Guide.html'), 'a guide that states no figure\n');
  commitAll(w, 'stale macOS guides');

  const first = bump(w, '--json');
  assert.equal(first.status, 0, `${first.stdout}${first.stderr}`);
  const out = JSON.parse(read(w.root, 'bump.json'));
  const corpus = corpusNow(w);                                              // after the bump: the report measures the corpus it left
  const pages = pagesNow(w);
  assert.notEqual(pages, corpus.files, 'precondition: the fixture corpus has a file that is no page, or this proves nothing about counting pages');
  assert.notEqual(corpus.workingTreeMb, 11, 'precondition: the stale guide must differ in its working tree');
  assert.deepEqual(out.figures?.macos?.corpus, { files: corpus.files, pages, workingTreeMb: corpus.workingTreeMb },
    `the report does not carry the corpus's files, pages and working tree: ${JSON.stringify(out.figures?.macos)}`);
  const lead = out.prBody.split('```')[0].split('\n');
  const stale = lead.find((l) => l.includes('docs/INSTALL-MACOS.md figures'));
  assert.ok(stale?.startsWith('- [ ] docs/INSTALL-MACOS.md figures differ from the corpus: '), `no differing line for the Markdown guide:\n${lead.join('\n')}`);
  for (const part of [`files ${commas(corpus.files)} (guide: 99,999)`, `pages ${commas(pages)} (guide: 99,990)`, `working tree ${corpus.workingTreeMb} MB (guide: 11 MB)`]) {
    assert.ok(stale.includes(part), `${part} is not in: ${stale}`);
  }
  assert.ok(lead.includes('- [ ] docs/AI-Architect-macOS-Install-Guide.html figures not checked: it does not state the files, the pages and the working tree where the bump reads them'),
    `no line for the guide that states nothing:\n${lead.join('\n')}`);
  // The Windows lines are the ones they were: nothing of the macOS pair reaches them.
  assert.ok(lead.includes('- [ ] docs/INSTALL-WINDOWS.md figures not checked: there is no docs/INSTALL-WINDOWS.md in this tree'), `the Windows line changed:\n${lead.join('\n')}`);
});

test('ARC-09-C300 — guides that state the corpus\'s own figures make one checked line each, whatever the install page says', () => {
  const w = ready();
  mkdirSync(join(w.root, 'docs'), { recursive: true });
  // The install page is stale and says 5 MB, and stays so: the macOS guides are held to the corpus's working tree, which the bump measures, and not to
  // that page's. A first bump moves the pin, as the Windows case above does, so that the figures written next are those of the corpus a second one finds.
  writeFileSync(join(w.root, 'docs', 'INSTALL.md'), installPage({ areas: 99, files: 99999, mb: 5 }));
  commitAll(w, 'a stale install page');
  const first = bump(w, '--json');
  assert.equal(first.status, 0, `${first.stdout}${first.stderr}`);
  rmSync(join(w.root, 'bump.json'));
  commitAll(w, 'bumped');
  const corpus = corpusNow(w);
  const pages = pagesNow(w);
  writeFileSync(join(w.root, 'docs', 'INSTALL-MACOS.md'), macosGuide({ files: corpus.files, pages, mb: corpus.workingTreeMb }));
  writeFileSync(join(w.root, 'docs', 'AI-Architect-macOS-Install-Guide.html'), macosGuide({ files: corpus.files, pages, mb: corpus.workingTreeMb }));
  commitAll(w, 'the macOS guides follow the corpus');
  const second = bump(w, '--json');
  assert.equal(second.status, 0, `${second.stdout}${second.stderr}`);
  const again = JSON.parse(read(w.root, 'bump.json'));
  assert.equal(again.from, again.to, 'the second bump moved after all — this proves nothing');
  const held = again.prBody.split('```')[0].split('\n');
  for (const file of ['docs/INSTALL-MACOS.md', 'docs/AI-Architect-macOS-Install-Guide.html']) {
    assert.ok(held.includes(`- [x] ${file} figures match the corpus: ${commas(corpus.files)} files · ${commas(pages)} pages · ${corpus.workingTreeMb} MB working tree`), `no checked line for ${file}:\n${held.join('\n')}`);
  }
  // ...and the same install page, still stale, is still said to differ: the macOS lines do not hide it.
  assert.ok(held.some((l) => l.startsWith('- [ ] install page figures differ from the corpus')), `the install page's own line is gone:\n${held.join('\n')}`);
});

test('ARC-09-C300 — a tree with no macOS guide says it did not check, for each guide', () => {
  const w = ready();
  const corpus = corpusNow(w);
  mkdirSync(join(w.root, 'docs'), { recursive: true });
  writeFileSync(join(w.root, 'docs', 'INSTALL.md'), installPage({ areas: corpus.areas, files: corpus.files, mb: corpus.workingTreeMb }));
  commitAll(w, 'the install page only');
  const r = bump(w, '--json');
  assert.equal(r.status, 0, `${r.stdout}${r.stderr}`);
  const lead = JSON.parse(read(w.root, 'bump.json')).prBody.split('```')[0].split('\n');
  for (const file of ['docs/INSTALL-MACOS.md', 'docs/AI-Architect-macOS-Install-Guide.html']) {
    assert.ok(lead.includes(`- [ ] ${file} figures not checked: there is no ${file} in this tree`), `no line for ${file}:\n${lead.join('\n')}`);
  }
});
