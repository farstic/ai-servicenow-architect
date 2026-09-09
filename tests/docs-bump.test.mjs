import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { CORPUS_DIR, EXIT, syncCorpus } from '../tools/snowarch/lib/docs/sync.mjs';
import { syncUpstream } from '../tools/snowarch/lib/docs/upstream.mjs';
import { prBody } from '../scripts/docs-bump.mjs';
import { RECIPE_TARGET, renderRecipeBlock } from '../tools/snowarch/lib/docs/recipe-block.mjs';
import { AREAS, CITED_PAGE, buildUpstream, git, makeWorkspace, writeCitingSkill } from './helpers/docs-fixture.mjs';

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
  scratch = mkdtempSync(join(tmpdir(), 'snowarch-docs-bump-'));
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
  const report = syncUpstream({ ...w, config: { ...w.config, docs: { ...w.config.docs, family: 'deletes-cited' } }, log: silent });
  const body = prBody(report);

  assert.match(body, new RegExp(`^docs pin: ${upstream.pin.slice(0, 7)} \\(\\d{4}-\\d\\d-\\d\\d\\) → [0-9a-f]{7} `, 'm'));
  assert.match(body, /^citations: checked: \d+ \| dead: \d+ → checked: \d+ \| dead: \d+$/m);
  assert.match(body, /^newly dead \(1\):$/m);
  assert.match(body, new RegExp(`DEAD \\.claude/skills/fixture/SKILL\\.md:\\d+ ${CITED_PAGE}`));
});

test('the body leads with the checklist and fences the report unaltered', () => {
  const w = ready();
  const report = syncUpstream({ ...w, log: silent });
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
  const a = syncUpstream({ ...w, log: silent });
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
  syncUpstream({ ...w, log: silent });
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

  const report = syncUpstream({ ...w, log: silent });
  const fenced = prBody(report).split('```')[1].trim().split('\n');

  assert.equal(report.recipe, 'written');
  assert.match(fenced[fenced.length - 1],
    /^staged: engine\.config\.json, vendor\/ServiceNowDocs, docs\/ARCHITECTURE\.md — review, then: /);
  // The JSON the workflow writes carries it too, without a second place deciding what "staged" is.
  const out = JSON.parse(JSON.stringify({ ...report, prBody: prBody(report), dryRun: false }));
  assert.deepEqual(out.staged, ['engine.config.json', CORPUS_DIR, RECIPE_TARGET]);
  assert.equal(out.recipe, 'written');
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
  assert.equal(read(w.root, RECIPE_TARGET), before, 'the document was left modified');
  assert.equal(JSON.parse(read(w.root, 'engine.config.json')).docs.pin, pinBefore);
  assert.equal(git(['status', '--porcelain'], w.root).trim(), '');
});
