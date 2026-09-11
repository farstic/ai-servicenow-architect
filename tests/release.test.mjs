// ARC-09-S01 — the release script, against a repository that is not this one.
//
// Every case runs on a TEMP git repository built here: three manifests, the CLAUDE.md marker, the
// README head, a changelog, a `vendor/ServiceNowDocs` gitlink matching the config's pin, and a
// `dist/contract.json` whose sha256 the tag must carry. Building it rather than reusing the real
// checkout is what lets the destructive cases run at all — a test that tagged the working repo
// would leave a `v2.0.0` behind that the next preflight would refuse.
//
// The gates are STUBBED through the injected runner. They take minutes and need a network; what
// this file is about is the ORDER and the REFUSALS — that nothing is written before they pass, and
// that each failure produces its exact sentence. One case is not stubbed: a real
// `--dry-run --offline --no-install` against the actual tree, which is the only way to know the
// script runs where it will be run.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { release } from '../scripts/release.mjs';
import { buildTagMessage, parseTagMessage, tagIsComplete } from '../scripts/lib/release/tag.mjs';
import { compareVersions, latestTag } from '../scripts/lib/release/preflight.mjs';
import { badgeLine, writeHead, writeMarker } from '../scripts/lib/release/writers.mjs';
import { tempDir } from '../tools/snowarch/tests/helpers/temp.mjs';
import { STAGED } from '../scripts/lib/release/writers.mjs';
import { writeGitattributes } from './helpers/gitattributes.mjs';

const REAL_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const CONFIG = JSON.parse(readFileSync(join(REAL_ROOT, 'engine.config.json'), 'utf8'));
const PIN = CONFIG.docs.pin;

const git = (root, args) => execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: 'pipe' });
const read = (root, p) => readFileSync(join(root, p), 'utf8');
const write = (root, p, text) => {
  mkdirSync(dirname(join(root, p)), { recursive: true });
  writeFileSync(join(root, p), text);
};

/** The contract `build-dist` would produce for a version — the fixture's whole point (C12b). */
const contractFor = (version) => `${JSON.stringify({ schema: 1, version, tools: [] }, null, 2)}\n`;

/** A checkout the release script would accept: clean, on `main`, pinned, with a contract. */
function fixture(t, { version = '2.0.0-dev', contract = null } = {}) {
  // ARC-09-C12b: the contract EMBEDS the version, exactly as the real one does — `build-dist` bakes
  // it in from `packages/snowarch/package.json`. A fixture whose contract was a constant could not
  // see the defect this story exists for: a release rewrites the version, the committed contract
  // goes stale, and the release commit fails its own `dist ok` gate on its own pull request.
  contract = contract ?? contractFor(version);
  const root = tempDir('snowarch-release-', t);
  const manifest = (name) => `${JSON.stringify({ name, version, private: true }, null, 2)}\n`;

  write(root, 'package.json', `${JSON.stringify({
    name: 'fixture', version, private: true, workspaces: ['packages/snowarch', 'tools/snowarch'],
  }, null, 2)}\n`);
  write(root, 'package-lock.json', `${JSON.stringify({ name: 'fixture', version, lockfileVersion: 3 }, null, 2)}\n`);
  write(root, 'packages/snowarch/package.json', manifest('@fixture/snowarch'));
  write(root, 'tools/snowarch/package.json', manifest('@fixture/tools'));
  write(root, 'CLAUDE.md', `# Fixture\n\n**Version:** ${version} — the version of record is the root package.json; this line is written by scripts/release.mjs.\n\nBody.\n`);
  write(root, 'docs/README-head.md', `# Fixture\n\n**v${version}** · Apache-2.0 · Claude Code ≥ ${CONFIG.floors.claudeCode}\n\nA description.\n`);
  write(root, 'docs/CHANGELOG.md', '# Changelog\n\n## Unreleased\n\n- something\n');
  write(root, 'engine.config.json', `${JSON.stringify(CONFIG, null, 2)}\n`);
  write(root, 'packages/snowarch/dist/contract.json', contract);
  // ARC-09-C12: the repository's own line-ending rules, or a CRLF-default checkout restores
  // different bytes than this fixture wrote and the rollback's byte-equality assertions fail on
  // Windows alone. Copied from the tracked file so it cannot drift.
  writeGitattributes(root);
  write(root, 'packages/contract/required-tools.json', `${JSON.stringify({
    contractSha256: createHash('sha256').update(contract).digest('hex'), tools: [],
  }, null, 2)}\n`);
  // The corpus: a REAL inner repository, and a gitlink in the index that matches the pin.
  // `update-index --cacheinfo` is how a submodule entry is made without a submodule — but the
  // working tree has to hold something git can describe, or `git status` in the outer repository
  // fails with "not a git repository" and every question about cleanliness goes unanswered.
  mkdirSync(join(root, 'vendor/ServiceNowDocs'), { recursive: true });
  git(join(root, 'vendor/ServiceNowDocs'), ['init', '-q']);

  git(root, ['init', '-q', '-b', 'main']);
  git(root, ['config', 'user.email', 'fixture@example.com']);
  git(root, ['config', 'user.name', 'fixture']);
  git(root, ['add', '.gitattributes', 'package.json', 'package-lock.json', 'packages', 'tools',
    'CLAUDE.md', 'docs', 'engine.config.json']);
  git(root, ['update-index', '--add', '--cacheinfo', `160000,${PIN},vendor/ServiceNowDocs`]);
  git(root, ['commit', '-qm', 'fixture']);
  return root;
}

/** The default stub: every gate passes, npm/gen/test are no-ops that write what they must. */
function runner(root, { fail = null, code = 1, skip = 0, gen = false } = {}) {
  const calls = [];
  // `skip` lets the first N matching calls through (ARC-09-C12b). The contract gate runs TWICE in
  // a release — once before the writes and once after — so a matcher that failed the first
  // occurrence would stop the run at the pre-write gate and never exercise the post-write path,
  // which is the path the rehearsal broke on.
  let seen = 0;
  return {
    calls,
    run: (args) => {
      calls.push(args.join(' '));
      const name = args.join(' ');
      if (fail && name.includes(fail)) {
        seen += 1;
        if (seen > skip) return code;
      }
      // `npm version` really does rewrite the manifests, so the stub does the same thing: a test
      // whose npm wrote nothing would assert about a tree the real command never produces.
      if (args[0] === 'npm' && args[1] === 'version') {
        const v = args[2];
        for (const p of ['package.json', 'package-lock.json', 'packages/snowarch/package.json',
          'tools/snowarch/package.json']) {
          const json = JSON.parse(read(root, p));
          json.version = v;
          write(root, p, `${JSON.stringify(json, null, 2)}\n`);
        }
        return 0;
      }
      // `gen-readme` renders the head into README.md — the fixture's version of the generator.
      if (name.includes('gen-readme') || name === 'npm run gen') {
        write(root, 'README.md', read(root, 'docs/README-head.md'));
        // ARC-09-C12c: a generator that rewrites a file NO hand list knows about — the shape of
        // the three the rehearsal left behind, whose headers carry the contract sha.
        if (gen && name === 'npm run gen') {
          write(root, 'docs/TROUBLESHOOTING.md', '# Troubleshooting\n\n<!-- GENERATED sha256 new -->\n');
        }
        return 0;
      }
      // ARC-09-C12b. `build-dist` BAKES THE VERSION into the contract, so the stub does too: a
      // stub that returned 0 and wrote nothing would make every assertion below pass on a tree the
      // real command never produces — which is precisely the shape of the defect being fixed.
      if (name.includes('build-dist')) {
        const v = JSON.parse(read(root, 'packages/snowarch/package.json')).version;
        write(root, 'packages/snowarch/dist/contract.json', contractFor(v));
        return 0;
      }
      // `pin.mjs --yes` records the sha of whatever `dist/contract.json` now is.
      if (name.includes('pin.mjs')) {
        const sha = createHash('sha256')
          .update(read(root, 'packages/snowarch/dist/contract.json')).digest('hex');
        const pin = JSON.parse(read(root, 'packages/contract/required-tools.json'));
        write(root, 'packages/contract/required-tools.json',
          `${JSON.stringify({ ...pin, contractSha256: sha }, null, 2)}\n`);
        return 0;
      }
      return 0;
    },
  };
}

const capture = () => { const lines = []; return { stream: { write: (s) => lines.push(s) }, text: () => lines.join('') }; };

async function run(root, argv, { ask = null, fail = null, skip = 0, gen = false, unstage = [] } = {}) {
  const out = capture();
  const err = capture();
  const r = runner(root, { fail, skip, gen });
  const code = await release({ argv, root, out: out.stream, err: err.stream, ask, run: r.run,
    ...(unstage.length ? { staged: STAGED.filter((f) => !unstage.includes(f)) } : {}),
    now: () => new Date('2026-09-11T00:00:00Z') });
  return { code, out: out.text(), err: err.text(), calls: r.calls };
}

// ── the tag message: built and parsed by the same module, asserted as a round trip ──────────────

test('buildTagMessage produces the six lines the story fixes, in order', () => {
  const message = buildTagMessage({ version: '2.0.0', contract: 'a'.repeat(64), docsPin: 'b'.repeat(40),
    floors: CONFIG.floors });
  assert.deepEqual(message.split('\n').slice(0, 7), [
    'snowarch v2.0.0',
    '',
    `contract: ${'a'.repeat(64)}`,
    `docs-pin: ${'b'.repeat(40)}`,
    `claude-floor: ${CONFIG.floors.claudeCode}`,
    `node-floor: ${CONFIG.floors.node}`,
    `git-floor: ${CONFIG.floors.git}`,
  ]);
});

test('parseTagMessage round-trips buildTagMessage, and reads it out of a git show page', () => {
  const built = buildTagMessage({ version: '2.1.0', contract: 'c'.repeat(64), docsPin: 'd'.repeat(40),
    floors: CONFIG.floors });
  const parsed = parseTagMessage(built);
  assert.equal(parsed.version, '2.1.0');
  assert.equal(parsed.contract, 'c'.repeat(64));
  assert.equal(parsed.docsPin, 'd'.repeat(40));
  assert.deepEqual(parsed.floors, CONFIG.floors);
  assert.ok(tagIsComplete(parsed));

  // What `git show v2.1.0` actually prints — the message wrapped in a page. S03/S04/S07 read it
  // from here, so the parser has to survive the wrapper.
  const page = `tag v2.1.0\nTagger: someone <someone@example.com>\nDate:   Thu Sep 11 00:00:00 2026\n\n${built}\ncommit abc123\n`;
  assert.deepEqual(parseTagMessage(page), parsed);
});

test('a malformed field is refused at build time, not discovered by a reader a year later', () => {
  const base = { version: '2.0.0', contract: 'a'.repeat(64), docsPin: 'b'.repeat(40), floors: CONFIG.floors };
  assert.throws(() => buildTagMessage({ ...base, contract: 'short' }), /not a sha256/);
  assert.throws(() => buildTagMessage({ ...base, docsPin: 'abc' }), /not a 40-hex gitlink/);
  assert.throws(() => buildTagMessage({ ...base, floors: { node: '20.0.0', git: '2.34.1' } }), /floors\.claudeCode/);
  assert.equal(parseTagMessage('not a tag'), null);
  assert.equal(tagIsComplete(parseTagMessage(`snowarch v2.0.0\n\ncontract: short\n`)), false);
});

test('versions sort the way semver says, prerelease below its release', () => {
  assert.equal(compareVersions('2.0.1', '2.0.0'), 1);
  assert.equal(compareVersions('2.0.0', '2.0.0'), 0);
  assert.equal(compareVersions('1.9.0', '2.0.0'), -1);
  assert.equal(compareVersions('2.0.0-rc.1', '2.0.0'), -1);
  assert.equal(latestTag(['v1.9.0', 'v2.0.0', 'v2.0.0-rc.1', 'not-a-tag']), 'v2.0.0');
  assert.equal(latestTag([]), null, 'the 2.0.0 case: no tag is not an error');
});

// ── the writers, on text ───────────────────────────────────────────────────────────────────────

test('the writers replace exactly one thing each, and refuse what they cannot place', () => {
  const marker = writeMarker('a\n**Version:** 1.0.0 — words\nb\n', '2.0.0');
  assert.match(marker.text, /^\*\*Version:\*\* 2\.0\.0 — the version of record/m);
  assert.equal(writeMarker('no marker here\n', '2.0.0').ok, false);
  assert.equal(writeMarker('**Version:** 1.0.0 — a\n**Version:** 1.0.0 — b\n', '2.0.0').ok, false);

  const head = writeHead('# T\n\n**v1.0.0** · Apache-2.0\n\nbody\n', '2.0.0');
  assert.match(head.text, /\*\*v2\.0\.0\*\* · /);
  assert.ok(head.text.includes(badgeLine('2.0.0')), 'the badge was not inserted on the first run');
  // Idempotent: a second release replaces the badge rather than adding another.
  const again = writeHead(head.text, '2.1.0');
  assert.equal((again.text.match(/img\.shields\.io/g) ?? []).length, 1);
  assert.ok(again.text.includes(badgeLine('2.1.0')));
  // shields.io eats a single dash; a prerelease has to escape it or the badge reads "version-2.1.0".
  assert.ok(writeHead(head.text, '2.1.0-rc.1').text.includes('version-2.1.0--rc.1-blue'));

  // The changelog is ARC-09-S02's, and `tests/changelog.test.mjs` owns it: it needs a repository,
  // not a string, because the groups come from the commits since the previous tag.
});

// ── the acceptance criteria, on the fixture ────────────────────────────────────────────────────

test('AC 1/2 — a green run commits once, tags once, and the tag carries the two shas', async (t) => {
  const root = fixture(t);
  assert.equal(git(root, ['status', '--porcelain']).trim(), '', 'the fixture did not start clean');
  assert.equal(git(root, ['tag', '-l']).trim(), '', 'the fixture already has a tag');

  const { code, out } = await run(root, ['2.0.0', '--yes', '--offline', '--no-install']);
  assert.equal(code, 0, out);

  assert.equal(git(root, ['log', '-1', '--format=%s']).trim(), 'chore(release): v2.0.0');
  assert.equal(git(root, ['tag', '-l', 'v2.0.0']).trim(), 'v2.0.0');

  const message = git(root, ['tag', '-l', '--format=%(contents)', 'v2.0.0']);
  const parsed = parseTagMessage(message);
  assert.ok(tagIsComplete(parsed), message);
  // The two shas, against the fixture's own artefacts rather than against a constant.
  assert.equal(parsed.contract,
    createHash('sha256').update(readFileSync(join(root, 'packages/snowarch/dist/contract.json'))).digest('hex'));
  assert.equal(parsed.docsPin, PIN);
  assert.deepEqual(parsed.floors, CONFIG.floors);

  // Every counter moved, and the tree is clean afterwards.
  for (const p of ['package.json', 'packages/snowarch/package.json', 'tools/snowarch/package.json']) {
    assert.equal(JSON.parse(read(root, p)).version, '2.0.0', p);
  }
  assert.match(read(root, 'CLAUDE.md'), /^\*\*Version:\*\* 2\.0\.0 —/m);
  assert.match(read(root, 'docs/README-head.md'), /\*\*v2\.0\.0\*\* · /);
  assert.match(read(root, 'docs/CHANGELOG.md'), /## 2\.0\.0 — 2026-09-11/);
  assert.equal(git(root, ['status', '--porcelain']).trim(), '', 'the release left the tree dirty');
});

test('AC 3 — a stale dist/ refuses, with no tag and no new commit', async (t) => {
  const root = fixture(t);
  const before = git(root, ['log', '-1', '--format=%H']).trim();
  const out = capture();
  const err = capture();
  const code = await release({
    argv: ['2.0.0', '--yes', '--offline', '--no-install'],
    root, out: out.stream, err: err.stream,
    run: runner(root).run,
    // The build succeeded and produced something different from what is committed — which is not
    // an exit code, and is the whole reason this gate has a second half.
    git: (args, opts) => (args[0] === 'diff' ? null : execGit(root, args, opts)),
  });
  assert.equal(code, 1);
  assert.equal(err.text().trim(),
    'release: dist/ is stale — run node scripts/build-dist.mjs and commit it in a normal PR, then release');
  assert.equal(git(root, ['tag', '-l']).trim(), '');
  assert.equal(git(root, ['log', '-1', '--format=%H']).trim(), before);
  assert.equal(JSON.parse(read(root, 'package.json')).version, '2.0.0-dev', 'a version was written anyway');
});

test('AC 4 — a failing lint stops before any write, and names the gate and the code', async (t) => {
  const root = fixture(t);
  const { code, err } = await run(root, ['2.0.0', '--yes', '--offline', '--no-install'],
    { fail: 'npm run lint' });
  assert.equal(code, 1);
  assert.equal(err.trim(), 'release: gate failed: lint (exit 1) — nothing was written');
  assert.equal(git(root, ['status', '--porcelain']).trim(), '', 'a file was modified before the gates passed');
  assert.equal(git(root, ['tag', '-l']).trim(), '');
});

test('AC 5 — an untracked file is not clean, and the message shows the porcelain line', async (t) => {
  const root = fixture(t);
  write(root, 'notes.txt', 'scratch\n');
  const { code, err } = await run(root, ['2.0.0', '--yes', '--offline', '--no-install']);
  assert.equal(code, 2);
  assert.match(err, /^release: working tree not clean:\n\?\? notes\.txt\nCommit or stash first — nothing was written$/m);
});

test('AC 6 — --dry-run prints the tag message verbatim and writes nothing', async (t) => {
  const root = fixture(t);
  const { code, out } = await run(root, ['2.0.0', '--dry-run', '--offline', '--no-install']);
  assert.equal(code, 0);
  const expected = buildTagMessage({
    version: '2.0.0',
    contract: createHash('sha256').update(readFileSync(join(root, 'packages/snowarch/dist/contract.json'))).digest('hex'),
    docsPin: PIN,
    floors: CONFIG.floors,
  });
  assert.ok(out.includes(expected), `the tag message is not in the output:\n${out}`);
  assert.match(out, /release: --dry-run — nothing was written/);
  assert.equal(git(root, ['status', '--porcelain']).trim(), '');
  assert.equal(git(root, ['tag', '-l']).trim(), '');
});

test('AC 7 — a version below the latest tag is refused, naming both', async (t) => {
  const root = fixture(t);
  git(root, ['tag', '-a', 'v2.0.0', '-m', 'snowarch v2.0.0']);
  const { code, err } = await run(root, ['1.9.0', '--yes', '--offline', '--no-install']);
  assert.equal(code, 2);
  assert.equal(err.trim(), 'release: 1.9.0 is not greater than the latest tag v2.0.0');
  // ...and the same name twice is refused before that, by check 2.
  const second = await run(root, ['2.0.0', '--yes', '--offline', '--no-install']);
  assert.equal(second.code, 2);
  assert.equal(second.err.trim(), 'release: tag v2.0.0 already exists');
});

test('AC 9 — answering n changes nothing, and exits 0', async (t) => {
  const root = fixture(t);
  const { code, out } = await run(root, ['2.0.0', '--offline', '--no-install'],
    { ask: async () => 'n' });
  assert.equal(code, 0);
  assert.match(out, /Proceed\? \[Y\/n\]/);
  assert.match(out, /release: nothing changed/);
  assert.equal(git(root, ['status', '--porcelain']).trim(), '');
  assert.equal(git(root, ['tag', '-l']).trim(), '');

  // And a closed stdin is a no, not a yes — the case a prompt gets wrong exactly once.
  const closed = await run(root, ['2.0.0', '--offline', '--no-install'], { ask: async () => null });
  assert.equal(closed.code, 0);
  assert.match(closed.out, /release: nothing changed/);
  assert.equal(git(root, ['tag', '-l']).trim(), '');
});

test('Enter is yes — the default in [Y/n] is the one the brackets promise', async (t) => {
  const root = fixture(t);
  const { code } = await run(root, ['2.0.0', '--offline', '--no-install'], { ask: async () => '' });
  assert.equal(code, 0);
  assert.equal(git(root, ['tag', '-l', 'v2.0.0']).trim(), 'v2.0.0');
});

test('the release branch flow commits and does NOT tag — the tag comes after the merge', async (t) => {
  const root = fixture(t);
  git(root, ['checkout', '-qb', 'release/v2.0.0']);
  assert.equal(git(root, ['rev-parse', '--abbrev-ref', 'HEAD']).trim(), 'release/v2.0.0',
    'the fixture did not move off main — the branch case would then be testing main');
  const { code, out } = await run(root,
    ['2.0.0', '--yes', '--offline', '--no-install', '--allow-branch', 'release/v2.0.0']);
  assert.equal(code, 0);
  assert.equal(git(root, ['log', '-1', '--format=%s']).trim(), 'chore(release): v2.0.0');
  assert.equal(git(root, ['tag', '-l']).trim(), '', 'a release branch must not carry the tag');
  assert.match(out, /open a pull request to main, then run --tag-only there/);

  // ...and --tag-only on the merged tree makes the tag, verifying the tree carries the version.
  const tagOnly = await run(root, ['2.0.0', '--tag-only', '--offline', '--allow-branch', 'release/v2.0.0']);
  assert.equal(tagOnly.code, 0, tagOnly.err);
  assert.equal(git(root, ['tag', '-l', 'v2.0.0']).trim(), 'v2.0.0');
});

test('--tag-only refuses a tree that does not carry the version', async (t) => {
  const root = fixture(t);
  const { code, err } = await run(root, ['2.0.0', '--tag-only', '--offline']);
  assert.equal(code, 2);
  assert.match(err, /--tag-only, but the tree carries 2\.0\.0-dev, not 2\.0\.0/);
  assert.equal(git(root, ['tag', '-l']).trim(), '');
});

test('a pin that disagrees with the artefact refuses before anything runs', async (t) => {
  const root = fixture(t);
  const pin = JSON.parse(read(root, 'packages/contract/required-tools.json'));
  pin.contractSha256 = 'f'.repeat(64);
  write(root, 'packages/contract/required-tools.json', `${JSON.stringify(pin, null, 2)}\n`);
  git(root, ['add', 'packages/contract/required-tools.json']);
  git(root, ['commit', '-qm', 'drift']);

  const { code, err } = await run(root, ['2.0.0', '--yes', '--offline', '--no-install']);
  assert.equal(code, 2);
  assert.match(err, /the pin says ffffffffffff… and dist\/contract\.json is/);
});

// ── the integration case: the real script, on the real tree ─────────────────────────────────────

test('a real --dry-run on this checkout prints this checkout\'s tag message and writes nothing', async (t) => {
  // PRECONDITION, stated rather than assumed: gate 6 is `docs verify`, which needs the corpus, and
  // a checkout without the submodule cannot run the real gates at all.
  //
  // This used to pass on a runner with no submodule, and for a bad reason (ARC-09-C2): the doctor's
  // `--fix` fixtures were syncing a corpus into the live checkout through a symlink, so whichever
  // test ran first left one behind for this one to find. With that writer gone, a cell without the
  // corpus says so and skips — the `release-dryrun` job syncs one and is where this claim is
  // actually proved on three OSes.
  if (!existsSync(join(REAL_ROOT, 'vendor', 'ServiceNowDocs', 'markdown'))) {
    return t.skip('no docs corpus in this checkout — release-dryrun covers this on three OSes');
  }
  const before = execFileSync('git', ['status', '--porcelain'], { cwd: REAL_ROOT, encoding: 'utf8' });
  const branch = execFileSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'],
    { cwd: REAL_ROOT, encoding: 'utf8' }).trim();
  const out = capture();
  const err = capture();
  // `--no-install` and `--offline`: no network and no `npm ci` inside a test, ever. The gates are
  // still the REAL ones — this is the case that would catch a script that cannot run here at all.
  const code = await release({
    argv: ['99.0.0', '--dry-run', '--offline', '--no-install', '--allow-branch', branch],
    root: REAL_ROOT, out: out.stream, err: err.stream,
    // The gates are stubbed to pass: running lint and the whole suite from inside the suite would
    // be a recursion, not a test. What is real here is everything else — the preflight against
    // this repository, the contract sha of the committed artefact, the pin, the gitlink.
    run: () => 0,
    git: null,
  });

  if (before.trim() !== '') {
    assert.equal(code, 2, 'a dirty checkout must refuse');
    assert.match(err.text(), /release: working tree not clean:/);
    return;
  }
  assert.equal(code, 0, `${out.text()}${err.text()}`);
  const parsed = parseTagMessage(out.text());
  assert.ok(tagIsComplete(parsed), out.text());
  assert.equal(parsed.contract, createHash('sha256')
    .update(readFileSync(join(REAL_ROOT, 'packages/snowarch/dist/contract.json'))).digest('hex'));
  assert.equal(parsed.docsPin, PIN);
  assert.equal(execFileSync('git', ['status', '--porcelain'], { cwd: REAL_ROOT, encoding: 'utf8' }), before);
});

/** The default git runner, for the cases that stub only one command. */
function execGit(root, args, { allowFail = false } = {}) {
  try {
    return execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: 'pipe' });
  } catch {
    return allowFail ? null : '';
  }
}

// ── ARC-09-C12b — the release rebuilds the artefact it is about to tag ─────────────────────────
//
// `dist/contract.json` embeds the package version. Until C12b the release wrote the version and
// stopped: the commit carried a contract that still said `-dev`, its own pull request would have
// failed `dist ok`, and the tag's `contract:` trailer named a file that no longer existed in that
// form. `--dry-run` could not see it — a dry run stops before the writes — so nothing had ever
// exercised the post-write path until the v2.0.0-rc.0 rehearsal did.

test('C12b: the release rebuilds dist, moves the pin, and tags the REBUILT sha', async (t) => {
  const root = fixture(t);
  const { code, out } = await run(root, ['2.0.0', '--yes', '--offline']);
  assert.equal(code, 0, out);

  const contract = read(root, 'packages/snowarch/dist/contract.json');
  // The artefact carries the RELEASED version, not the one the tree started with.
  assert.equal(JSON.parse(contract).version, '2.0.0');
  // `build-dist` on the released tree is a no-op: what was committed is what the source builds.
  assert.equal(contract, contractFor('2.0.0'), 'a second build would differ from what was committed');

  const sha = createHash('sha256').update(contract).digest('hex');
  assert.equal(JSON.parse(read(root, 'packages/contract/required-tools.json')).contractSha256, sha,
    'the pin still names the pre-release contract');

  // And the tag quotes the same sha — the trailer is what `./snowarch version`, `release.yml` and
  // `./snowarch upgrade` all read back.
  const message = git(root, ['tag', '-l', '--format=%(contents)', 'v2.0.0']);
  assert.match(message, new RegExp(`contract: ${sha}`),
    `the tag names a different contract:\n${message}`);
});

test('C12b: the release commit contains the rebuilt artefact and the moved pin', async (t) => {
  const root = fixture(t);
  await run(root, ['2.0.0', '--yes', '--offline']);
  // Nothing left dirty: if `dist/` or the pin were written but not staged, the release commit would
  // be a version bump whose artefact is still uncommitted in the maintainer's tree.
  assert.equal(git(root, ['status', '--porcelain']).trim(), '');
  const files = git(root, ['show', '--name-only', '--format=', 'HEAD']).split('\n').filter(Boolean);
  for (const f of ['packages/snowarch/dist/contract.json', 'packages/contract/required-tools.json']) {
    assert.ok(files.includes(f), `${f} is not in the release commit: ${files.join(', ')}`);
  }
});

test('C12b: a post-write failure rolls back the rebuild and the pin too', async (t) => {
  const root = fixture(t);
  const before = {
    contract: read(root, 'packages/snowarch/dist/contract.json'),
    pin: read(root, 'packages/contract/required-tools.json'),
    manifest: read(root, 'package.json'),
  };
  // The gate that caught the real rehearsal, made to fail here on purpose.
  const { code, err } = await run(root, ['2.0.0', '--yes', '--offline'],
    { fail: 'version-consistency' });
  assert.equal(code, 1);
  assert.match(err, /rolled back, nothing was committed/);

  // BYTE-IDENTICAL, all three. A rollback that restored the manifests and left a rebuilt contract
  // behind would leave the next attempt refusing on a dirty tree the maintainer did not cause.
  assert.equal(read(root, 'packages/snowarch/dist/contract.json'), before.contract);
  assert.equal(read(root, 'packages/contract/required-tools.json'), before.pin);
  assert.equal(read(root, 'package.json'), before.manifest);
  assert.equal(git(root, ['status', '--porcelain']).trim(), '', 'the rollback left the tree dirty');
  assert.equal(git(root, ['tag', '-l']).trim(), '', 'a tag survived a rolled-back release');
});

test('C12b: the contract gate runs after the writes, and its failure rolls back too', async (t) => {
  const root = fixture(t);
  const { code, err, calls } = await run(root, ['2.0.0', '--yes', '--offline'],
    { fail: 'contract-gate.mjs --skip-build', skip: 1 });   // let the PRE-write gate pass
  assert.equal(code, 1);
  assert.match(err, /the contract gate failed after the writes — rolled back/);
  // It ran AFTER `npm version`, not as part of the pre-write gates — that is the whole point: the
  // pre-write contract gate passed on a tree whose version had not moved yet.
  const versionAt = calls.findIndex((c) => c.startsWith('npm version'));
  const gateAt = calls.lastIndexOf('node scripts/contract-gate.mjs --skip-build');
  assert.ok(versionAt > -1 && gateAt > versionAt, `order: ${calls.join(' | ')}`);
  assert.equal(git(root, ['status', '--porcelain']).trim(), '');
});

// ── ARC-09-C12c — the commit contains everything the writes produced ───────────────────────────

test('C12c: a generated file the hand list never knew is staged by the release', async (t) => {
  const root = fixture(t);
  // A file only the GENERATORS know about — the shape of the three the rehearsal left behind.
  // `STAGED` is derived from `scripts/lib/generators.mjs`, so this arrives without anyone editing
  // a list, and the stub's `npm run gen` writes it the way `gen-governance` writes its targets.
  write(root, 'docs/TROUBLESHOOTING.md', '# Troubleshooting\n\n<!-- GENERATED sha256 old -->\n');
  git(root, ['add', 'docs/TROUBLESHOOTING.md']);
  git(root, ['commit', '-qm', 'fixture: a generated file']);

  const { code, out } = await run(root, ['2.0.0', '--yes', '--offline'], { gen: true });
  assert.equal(code, 0, out);
  const files = git(root, ['show', '--name-only', '--format=', 'HEAD']).split('\n').filter(Boolean);
  assert.ok(files.includes('docs/TROUBLESHOOTING.md'),
    `the generated file is not in the release commit: ${files.join(', ')}`);
  assert.equal(git(root, ['status', '--porcelain']).trim(), '');
});

test('C12c: a release that leaves the tree dirty FAILS, naming the files', async (t) => {
  const root = fixture(t);
  write(root, 'docs/TROUBLESHOOTING.md', '# Troubleshooting\n\n<!-- GENERATED sha256 old -->\n');
  git(root, ['add', 'docs/TROUBLESHOOTING.md']);
  git(root, ['commit', '-qm', 'fixture: a generated file']);

  // The negative control: the same run with that file taken OUT of what gets staged. Without the
  // check, this is a green release that leaves a modified file behind — which is what happened.
  const { code, err } = await run(root, ['2.0.0', '--yes', '--offline'],
    { gen: true, unstage: ['docs/TROUBLESHOOTING.md'] });
  assert.equal(code, 1);
  assert.match(err, /the commit left the tree dirty/);
  assert.match(err, /docs\/TROUBLESHOOTING\.md/);
});
