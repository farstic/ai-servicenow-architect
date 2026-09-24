import { test } from 'node:test';
import { EXPECTED_FAIL_ON_RUNNERS } from '../scripts/ci/doctor-snapshot.mjs';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tempDir } from '../tools/snowarch/tests/helpers/temp.mjs';

/**
 * What the workflows must be true about themselves.
 *
 * `actionlint` checks their syntax in CI. These are the claims a linter cannot make: that a list
 * written twice stays the same list, and that the workflow which never merges still cannot.
 */
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const wf = (name) => readFileSync(join(root, '.github/workflows', name), 'utf8');

/** The `paths:` blocks of a workflow, as arrays, in order of appearance. */
function pathLists(text) {
  const out = [];
  const lines = text.split('\n');
  lines.forEach((l, i) => {
    if (!/^\s*paths:\s*$/.test(l)) return;
    const items = [];
    for (let j = i + 1; j < lines.length; j += 1) {
      const m = /^\s*- (.+)$/.exec(lines[j]);
      if (!m) break;
      items.push(m[1].trim());
    }
    out.push(items);
  });
  return out;
}

test('docs-real triggers on the same paths for pull_request and push', () => {
  // Two literal copies, because actionlint will not follow a YAML alias for `paths`. This is what
  // makes the duplication safe: a path added to one and not the other means the job stops running
  // on half the events that should trigger it, silently.
  const lists = pathLists(wf('docs-real.yml'));
  assert.equal(lists.length, 2, `expected two paths blocks, found ${lists.length}`);
  assert.deepEqual(lists[0], lists[1], 'the pull_request and push path lists have drifted');
  assert.ok(lists[0].includes("'tools/snowarch/lib/docs/**'"), 'the docs library is not a trigger');
  assert.ok(lists[0].includes("'.github/workflows/docs-real.yml'"),
    'the workflow does not trigger on itself — it could not prove a change to itself');
});

test('every workflow references actions by major-version tag, as the repository does', () => {
  for (const f of readdirSync(join(root, '.github/workflows'))) {
    const uses = [...wf(f).matchAll(/uses:\s*(\S+)/g)].map((m) => m[1]);
    for (const u of uses) {
      assert.match(u, /@v\d+$/, `${f}: ${u} is not pinned to a major-version tag`);
    }
  }
});

test('no workflow can merge, and only the live suite reads a repository secret', () => {
  // ONE workflow may, and only these names. Until ARC-07-S11 the answer was "none", which was the
  // right rule for a repository whose every job ran on a proposed change; the live E2E suite needs
  // credentials for a real instance, runs on the default branch only, and never on a proposal. So
  // the rule became an ALLOW-LIST rather than a prohibition — a secret appearing in any other
  // workflow, or a NEW name appearing in this one, still fails here.
  const ALLOWED = {
    'e2e-live.yml': ['SNOW_E2E_URL', 'SNOW_E2E_USERNAME', 'SNOW_E2E_PASSWORD',
      'SNOW_E2E_OAUTH_CLIENT_ID', 'SNOW_E2E_OAUTH_CLIENT_SECRET'],
    // ARC-09-S10. One name, in one workflow, and it is the owner's npm token — granular and
    // scoped to `@farstic/snowarch` alone, so even a leak cannot reach the `@farstic/snow-mcp`
    // record (D-01). It appearing anywhere else, or a second name appearing here, fails this test.
    'publish-npm.yml': ['NPM_TOKEN'],
  };
  for (const f of readdirSync(join(root, '.github/workflows'))) {
    const text = wf(f);
    assert.ok(!/gh pr merge|--auto\b/.test(text), `${f} can merge`);
    // `[A-Z0-9_]`, not `[A-Z_]`: the live names carry a digit, and the narrower class captured
    // `SNOW_E` — a prefix that matches nothing, which would have made the allow-list a lie.
    const secrets = [...new Set([...text.matchAll(/secrets\.([A-Z0-9_]+)/g)].map((m) => m[1]))].sort();
    assert.deepEqual(secrets, (ALLOWED[f] ?? []).slice().sort(),
      `${f} reads repository secrets this test does not allow`);
  }
});

test('the live suite never runs on a proposed change, and asks for the branch it needs', () => {
  const text = wf('e2e-live.yml');
  // The `on:` block only — the prose above it explains WHY there is no such trigger, and a grep
  // over the whole file would read the explanation as the thing it forbids.
  const on = /\non:\n([\s\S]*?)\nconcurrency:/.exec(text);
  assert.ok(on, 'e2e-live.yml has no on: block before concurrency:');
  assert.doesNotMatch(on[1], /pull_request/, 'the live suite would run on a proposed change');
  assert.match(on[1], /schedule:/, 'the live suite is not scheduled');
  assert.match(on[1], /workflow_dispatch:/, 'the live suite cannot be run on demand');
  // ARC-07-S11 / Sitting E2 — the guard admits a DISPATCH on any ref, and keeps the default-branch
  // requirement for everything else. The owner dispatched this on `develop`; the job was skipped and
  // the run reported `conclusion=skipped`, which reads as a calm nothing.
  assert.match(text, /if: github\.event_name == 'workflow_dispatch' \|\| github\.ref == format\('refs\/heads\/\{0\}', github\.event\.repository\.default_branch\)/,
    'a dispatch is still refused on a non-default ref');
  // And the artefact is checked before it is published.
  assert.match(text, /Refuse to publish a log that contains a secret/);
  assert.ok(text.indexOf('Refuse to publish') < text.indexOf('upload-artifact'),
    'the log is uploaded before it is checked');
});

test('docs-bump checks out the same branch it opens the pull request against', () => {
  // The first real run was dispatched from `main` and computed its "from" pin against main's tree.
  // Harmless while the two branches share a pin, and wrong the moment develop runs ahead — so the
  // checkout ref and the `--base` are asserted to be one value rather than two that happen to match.
  const text = wf('docs-bump.yml');
  const checkoutRef = /^\s*ref: (\S+)$/m.exec(text);
  const prBase = /gh pr create --base (\S+)/.exec(text);
  assert.ok(checkoutRef, 'the checkout has no explicit ref — it would follow the dispatch');
  assert.ok(prBase, 'no `gh pr create --base` found');
  assert.equal(checkoutRef[1], prBase[1],
    'the branch the run is built from is not the branch the pull request targets');
});

test('the workflows name the repository settings they depend on', () => {
  // Settings are not in the tree, so nothing here can assert them. Naming them in the file is what
  // stops the next person losing an afternoon to `gh pr create` failing with a permissions error.
  const text = wf('docs-bump.yml');
  assert.match(text, /Allow GitHub Actions to create and approve pull requests/);
  assert.match(text, /Approve and run/);
});

/**
 * ARC-06-S14 — the `bootstrap` job is the install promise, and its cell names are an interface.
 *
 * `main`'s branch protection lists required contexts BY NAME. A renamed cell is not a red build —
 * it is a required check that silently stops being required, which is worse: protection keeps
 * waiting for a context nobody produces any more, or (if the name simply vanished from the list)
 * a broken install merges green. So the thirteen names are enumerated here, and changing one is a
 * two-file change with a comment pointing at the settings that have to change with it.
 */
/**
 * Every job in `ci.yml`, in order — the names branch protection lists.
 *
 * Here so that ADDING one is a deliberate edit to this list with the protection change beside it,
 * rather than a silent new context nothing requires. ARC-08-S11 put the doctor into the bootstrap
 * cells as steps for exactly this reason.
 */
const KNOWN_JOBS = [
  'test', 'contract', 'no-build', 'docs-check', 'footprint', 'actionlint', 'bootstrap',
  // ARC-09-S02. The 43rd required context on `main`: it is the only place the commit convention is
  // enforced, and an unrequired check that goes red without blocking anything is not a guard.
  'commitlint',
  // ARC-09-S03, three more (44–46): the release path is exercised on every commit, because
  // `release.yml` only ever runs on a tag and a path that runs once per release is broken by then.
  'release-dryrun',
  // ARC-09-S07, three more (47–49): the upgrade moves a tree, and a tree is the one thing a unit
  // test cannot move. The three cells are three operating systems' git and filesystems.
  'upgrade-e2e',
  'launcher',
  // ARC-09-S08, three more (50–52): a Windows machine driven entirely through `.cmd`, with no Git
  // Bash on PATH, on three Node majors. ARC-06-S14's `no-gitbash` cell keeps its own name and its
  // own required context; this adds what that cell does not run.
  'windows-native',
  'windows-launcher', 'secrets', 'plugin-validate',
  // ARC-09-S09, two more (53–54): the line-ending policy proved on a Windows checkout made with
  // the Git-for-Windows default, which is the only place it can actually break.
  'eol',
];

/** The three required contexts `release-dryrun` adds, exactly as a check-run prints them. */
const RELEASE_DRYRUN_CONTEXTS = [
  'release-dryrun (ubuntu-latest)',
  'release-dryrun (macos-latest)',
  'release-dryrun (windows-latest)',
];

/** And the three `upgrade-e2e` adds (ARC-09-S07), in the same form. */
const UPGRADE_E2E_CONTEXTS = [
  'upgrade-e2e (ubuntu-latest)',
  'upgrade-e2e (macos-latest)',
  'upgrade-e2e (windows-latest)',
];

const BOOTSTRAP_CELLS = [
  'bootstrap (ubuntu-latest, node 20)',
  'bootstrap (ubuntu-latest, node 22)',
  'bootstrap (ubuntu-latest, node 24)',
  'bootstrap (macos-latest, node 20)',
  'bootstrap (macos-latest, node 22)',
  'bootstrap (macos-latest, node 24)',
  'bootstrap (windows-latest, node 20)',
  'bootstrap (windows-latest, node 22)',
  'bootstrap (windows-latest, node 24)',
  'bootstrap (no-node, ubuntu-latest)',
  'bootstrap (no-node, macos-latest)',
  'bootstrap (no-node, windows-latest)',
  'bootstrap (no-gitbash, windows-latest)',
];

test('the bootstrap job has exactly the thirteen cells protection will require', () => {
  const ci = wf('ci.yml');
  const labels = [...ci.matchAll(/label: '([^']+)'/g)].map((m) => `bootstrap (${m[1]})`);
  assert.deepEqual(labels, BOOTSTRAP_CELLS);
  // 9 + 3 + 1, and each variant answers a different question — nine Node majors across three
  // operating systems, three launchers finishing without Node, one Windows machine with no POSIX
  // shell at all.
  assert.equal(labels.filter((l) => /node \d\d\)/.test(l)).length, 9);
  assert.equal(labels.filter((l) => l.includes('no-node')).length, 3);
  assert.equal(labels.filter((l) => l.includes('no-gitbash')).length, 1);
  assert.match(ci, /name: bootstrap \(\$\{\{ matrix\.label \}\}\)/);
});

test('every bootstrap run skips the Claude Code check and fetches its own corpus', () => {
  const ci = wf('ci.yml');
  const job = ci.slice(ci.indexOf('\n  bootstrap:'), ci.indexOf('\n  launcher:'));
  // Invocation lines only — a comment that MENTIONS a launcher is prose, and matching it would
  // make this test fail for a sentence rather than for a command.
  const runs = job.split('\n')
    .map((l) => l.trim())
    .filter((l) => !l.startsWith('#') && !l.startsWith('rem '))
    // `call ` is allowed at the front since ARC-09-S08: a `.cmd` invoked from `shell: cmd` without
    // it never returns, so every cmd step now calls one. The test below enforces that; this one
    // must simply still FIND them, or it would count three invocations and claim six were checked.
    .filter((l) => /^(call )?(\.[\\/]|& powershell |[^#]*-File \.\\)bootstrap\.(sh|cmd|ps1)/.test(l));
  assert.ok(runs.length >= 6, `only ${runs.length} launcher invocations found`);
  for (const r of runs) {
    assert.match(r, /--mode design --yes --skip-claude-check/,
      `a bootstrap invocation without the runner's flags: ${r}`);
  }
  // The corpus must be fetched BY the bootstrap, or B02 is a no-op and assertion 6 a tautology.
  assert.match(job, /submodules: false/);
  // No cell may reach for a secret, and none of them needs one.
  assert.equal(/secrets\./.test(job), false, 'a bootstrap cell reads a secret');
});

test('the doctor runs inside the bootstrap cells, and adds no job name (ARC-08-S11)', () => {
  const ci = wf('ci.yml');
  const job = ci.slice(ci.indexOf('\n  bootstrap:'), ci.indexOf('\n  launcher:'));

  // STEPS, not a job. `main`'s protection lists 42 contexts by name; a new job would not be one of
  // them and could go red for a week without blocking anything.
  // From under `jobs:` only: `on.push` is a trigger key at the same indentation, and a regex over
  // the whole file reads it as a job called "push".
  const jobsBlock = ci.slice(ci.indexOf('\njobs:'));
  const jobNames = [...jobsBlock.matchAll(/^  ([a-z][a-z0-9-]*):$/gm)].map((m) => m[1]);
  assert.deepEqual(jobNames, KNOWN_JOBS, 'a job was added or renamed — protection lists its contexts by name');

  // The report is produced without touching the cache — a doctor that answered from `.local` would
  // be reporting on a run that happened before the install being tested.
  const doctorRuns = job.split('\n').map((l) => l.trim())
    .filter((l) => !l.startsWith('#') && /snowarch(\.cmd)? doctor/.test(l) && l.includes('--json'));
  assert.ok(doctorRuns.length >= 3, `only ${doctorRuns.length} JSON doctor invocations`);
  for (const r of doctorRuns) assert.match(r, /--no-cache/, `a cached doctor run: ${r}`);

  // The three things the steps exist to do.
  // The allowance in the workflow and the one the snapshots are held to are the same list.
  // `includes`, not a regex: an escaped path in a pattern reads to the citation lint as a file
  // that does not exist, and it is right to — `assert-doctor\.mjs` is not a path.
  // The report is read from `$RUNNER_TEMP` since ARC-09-S08: a cmd step that wrote it into the
  // checkout made `assert-clean` report the job's own artefacts as untracked files.
  assert.ok(job.includes('scripts/ci/assert-doctor.mjs --in "$RUNNER_TEMP/doctor.json" '
    + `--expect-fail ${EXPECTED_FAIL_ON_RUNNERS.join(',')}`),
  'the workflow does not allow exactly the runner-expected failures');
  assert.match(job, /scripts\/ci\/doctor-snapshot\.mjs --in "\$RUNNER_TEMP\/doctor\.json"/);
  // Two paths since ARC-09-S08: the fast one under `01` §8's 300 ms (a trip there is a product
  // regression) and the re-run one at 1000 ms on the difference (a trip there is C5's territory).
  assert.match(job, /scripts\/ci\/banner-timing\.mjs --runs 5 --budget-ms 1000/);
  assert.match(job, /--fast-budget-ms 300 --summary/);

  // The artifact, uploaded whether or not the job was green: a report you can only read when the
  // run passed is a report you cannot use to find out why it failed.
  assert.match(job, /uses: actions\/upload-artifact@v4\n\s+if: always\(\)/);
  assert.match(job, /name: doctor-\$\{\{ matrix\.label \}\}/);

  // The doctor runs BEFORE the dependencies are installed, which is what makes every SV- check
  // skip — the state a design-only install is actually in.
  assert.ok(job.indexOf('assert-doctor.mjs') < job.indexOf('npm ci --ignore-scripts'),
    'the doctor now runs after npm ci — the snapshot would describe a machine no user is on');
});

test('commitlint runs on pull requests only, with the history it needs (ARC-09-S02)', () => {
  const ci = wf('ci.yml');
  const job = ci.slice(ci.indexOf('\n  commitlint:'), ci.indexOf('\n  release-dryrun:'));

  // On a push there is no base branch to compare against, and `origin/main..HEAD` on `main` itself
  // is empty — a job that ran there would report "0 commits ok" forever and prove nothing.
  assert.match(job, /if: github\.event_name == 'pull_request'/);
  // The range is `origin/<base>..<head>`; a shallow clone has no merge base to compute it from.
  assert.match(job, /fetch-depth: 0/);
  assert.match(job, /run: node scripts\/ci\/commitlint\.mjs/);
  // One cell, so the required context is the bare job name — which is what branch protection lists.
  assert.equal(/strategy:/.test(job), false, 'a matrix would change the required context name');
  assert.match(job, /name: commitlint/);
});

test('upgrade-e2e runs the harness on three OSes, and adds three named contexts (ARC-09-S07)', () => {
  const ci = wf('ci.yml');
  const job = ci.slice(ci.indexOf('\n  upgrade-e2e:'), ci.indexOf('\n  launcher:'));

  const list = /^\s*os: \[([^\]]+)\]$/m.exec(job);
  assert.ok(list, 'the matrix is not one os list');
  assert.deepEqual(list[1].split(',').map((o) => `upgrade-e2e (${o.trim()})`), UPGRADE_E2E_CONTEXTS);
  assert.match(job, /name: upgrade-e2e \(\$\{\{ matrix\.os \}\}\)/);

  // `fetch-depth: 0`: the harness tags fixture releases and reads their messages back, and a
  // shallow clone has nothing to describe against.
  assert.match(job, /fetch-depth: 0/);
  // A git identity, because the harness COMMITS: a runner has no global one, and a fixture that
  // depends on the machine having one fails only there (ARC-09-S05's lesson).
  assert.match(job, /git config --global user\.email/);
  // No secret, and no network beyond the harness's own local origin.
  assert.equal(/secrets\./.test(job), false, 'an upgrade cell reads a secret');
  // ARC-09-C13 wrapped this command across lines and added the walkthrough, so the assertion
  // joins continuations first — pinning one line's worth of a command asserts its formatting.
  const e2eRun = job.replace(/\\\n\s+/g, ' ');
  assert.match(e2eRun, /node --test[^\n]*tests\/upgrade\/upgrade\.e2e\.test\.mjs/);
  // The walkthrough runs HERE rather than in `npm test`: this job already builds a harness
  // world on three OSes once per commit, and `tests/upgrade/` is excluded from `npm test`.
  assert.match(e2eRun, /tests\/upgrade\/harness-shape\.test\.mjs/);
  assert.match(job, /tests\/upgrade\/upgrade-unit\.test\.mjs/);
  // The checkout under test must be exactly as it was: the harness builds its world in TMPDIR,
  // and an upgrade test that moved this tree would be the worst possible kind of side effect.
  assert.match(job, /assert-clean\.mjs/);
});

test('release-dryrun runs the real release on three OSes, every commit (ARC-09-S03)', () => {
  const ci = wf('ci.yml');
  const job = ci.slice(ci.indexOf('\n  release-dryrun:'), ci.indexOf('\n  upgrade-e2e:'));

  // The three contexts, in the form branch protection lists them.
  const list = /^\s*os: \[([^\]]+)\]$/m.exec(job);
  assert.ok(list, 'the matrix is not one os list');
  const contexts = list[1].split(',').map((o) => `release-dryrun (${o.trim()})`);
  assert.deepEqual(contexts, RELEASE_DRYRUN_CONTEXTS);
  assert.match(job, /name: release-dryrun \(\$\{\{ matrix\.os \}\}\)/);

  // `--dry-run` is what makes this safe to run on every commit, and `--offline --no-install` keep
  // it from touching the network twice. A missing `--dry-run` here would WRITE a version on a CI
  // runner and commit it.
  assert.match(job, /node scripts\/release\.mjs 9\.9\.9 --dry-run --offline --no-install --allow-branch/);
  // The branch comes from the checkout, not from `github.head_ref`, which is empty on a push.
  assert.match(job, /branch=\$\(git rev-parse --abbrev-ref HEAD\)/);
  // Gate 6 is `docs verify`, so the corpus has to be there.
  assert.match(job, /snowarch\.mjs docs sync --yes/);
  // ...and the tree is unchanged afterwards, which is the claim `--dry-run` makes.
  assert.match(job, /scripts\/ci\/assert-clean\.mjs/);
  assert.match(job, /fetch-depth: 0/);
});

test('release.yml runs on tags only, and is the one workflow that may write (ARC-09-S03)', () => {
  const release = wf('release.yml');

  // A tag trigger and nothing else: a `push` on a branch here would publish a Release per commit.
  assert.match(release, /^on:\n  push:\n    tags: \['v\*'\]$/m);
  assert.equal(/pull_request/.test(release), false, 'a fork could then run a job that may write');
  assert.equal(/workflow_dispatch/.test(release), false, 'a Release must come from a tag, not a button');

  // `contents: write`, and exactly the two workflows that need it — asserted as a CLOSED SET
  // rather than as "only this one", which is what I first wrote and which is not true:
  // `docs-bump.yml` pushes the branch it opens its pull request from. Two workflows may write to
  // this repository, both of them scheduled or tag-triggered, neither reachable from a fork's pull
  // request. A third appearing is a decision somebody has to make here.
  assert.match(release, /^permissions:\n  contents: write$/m);
  const mayWrite = readdirSync(join(root, '.github/workflows'))
    .filter((name) => /contents: write/.test(wf(name))).sort();
  assert.deepEqual(mayWrite, ['docs-bump.yml', 'release.yml']);

  // The only credential is the token GitHub hands the job. No repository secret is read.
  assert.equal(/secrets\./.test(release), false, 'release.yml reads a repository secret');
  assert.match(release, /GH_TOKEN: \$\{\{ github\.token \}\}/);

  // Every step is a `node` invocation or an action — no `npx`, which would fetch a package at
  // release time and make the release depend on a registry being up.
  assert.equal(/npx /.test(release), false, 'release.yml runs npx');

  // The tag is verified BEFORE the gates: a tag that does not describe this tree is not a release
  // to be tested, and every minute after that one is spent on the wrong thing.
  const verifyAt = release.indexOf('verify-tag.mjs');
  assert.notEqual(verifyAt, -1);
  assert.ok(verifyAt < release.indexOf('npm ci'), 'the gates run before the tag is verified');

  // Three platforms, and `publish` waits for all of them.
  assert.match(release, /os: \[ubuntu-latest, macos-latest, windows-latest\]/);
  assert.match(release, /^    needs: verify$/m);

  // The seven assets, named — the criterion is that there are exactly these. Searched inside the
  // PUBLISH JOB, WITH COMMENTS STRIPPED. Narrowing to the job was the first fix, because the
  // command is named in the file's header comment and an `indexOf` over the whole file found the
  // prose. It was not enough: ARC-09-C22's follow-up added a comment INSIDE the publish job that
  // quotes the command it is explaining, and the ordering assertion below then compared the
  // comment's position against the assets check and failed on a correct workflow. Comments out
  // first is the repository's rule for every source scan for exactly this reason — in a comment a
  // command is the lesson, in a `run:` block it is what executes.
  const publish = release.slice(release.indexOf('\n  publish:'))
    .split('\n').filter((l) => !/^\s*#/.test(l)).join('\n');
  const create = publish.slice(publish.indexOf('gh release create'));
  for (const asset of ['doctor-ubuntu-latest.json', 'doctor-macos-latest.json',
    'doctor-windows-latest.json', 'install-metrics-ubuntu-latest.json',
    'install-metrics-macos-latest.json', 'install-metrics-windows-latest.json',
    'install-metrics.md']) {
    assert.ok(create.includes(asset), `the release does not attach ${asset}`);
  }
  // ...and nothing is published without being read first.
  assert.ok(publish.indexOf('assert-assets.mjs') < publish.indexOf('gh release create'),
    'the assets are published before they are checked');
  // Not vacuous: both positions must exist, or `-1 < -1` is false and `-1 < n` is true for the
  // wrong reason. This is the pair the comment above is about.
  assert.ok(publish.includes('assert-assets.mjs') && publish.includes('gh release create'),
    'the publish job lost a step the ordering assertion compares');
});

test('the run is cancelled when superseded, so thirteen cells are not paid for twice', () => {
  const ci = wf('ci.yml');
  assert.match(ci, /concurrency:\n\s+group: ci-\$\{\{ github\.ref \}\}\n\s+cancel-in-progress: true/);
});

/**
 * ARC-09-C4 — the banner budget is spent on the BANNER, not on the machine.
 *
 * `bootstrap (no-gitbash, windows-latest)` measured 728, 802, 944 and 1027 ms across four
 * consecutive runs whose product code was byte-identical, and the fourth failed a 1000 ms budget
 * the first three passed. Most of that is Node starting up on a cold Windows runner — something
 * this product cannot make faster and should not be judged on. The harness measures that floor
 * too, interleaved so both see the same weather, and the budget is spent on the difference.
 */
test('banner-timing measures a node floor and judges the difference (ARC-09-C4)', () => {
  const src = readFileSync(join(root, 'scripts/ci/banner-timing.mjs'), 'utf8');

  // The floor is a REAL empty node process, not a constant somebody measured once on a laptop.
  assert.match(src, /timed\(\['-e', ''\]\)/);
  // Interleaved: a floor taken in a block of its own describes a different machine.
  assert.match(src, /floors\.push\(timed/);
  // And the budget is applied to the difference, never to the raw median — which is the whole fix.
  assert.match(src, /const cost = Math\.max\(0, median - floor\)/);
  assert.match(src, /if \(cost > BUDGET\)/);
  assert.equal(/if \(median > BUDGET\)/.test(src), false, 'the raw median is being judged again');
  // Both numbers are still printed: "the banner cost 190 ms on a machine where starting node costs
  // 840" is the sentence a reader needs; "1027 ms" is not.
  assert.match(src, /node floor \$\{floor\} ms → banner \$\{cost\} ms/);
});

/**
 * ARC-09-S08's first chore, carried from ARC-08-S11 — a `.cmd` invoked without `call` transfers
 * control and never comes back.
 *
 * `cmd.exe` does not return from a batch file unless it was CALLED: `.\bootstrap.cmd …` ends the
 * calling script, so every line after it is dead. ARC-06-S14's Windows cells were written that
 * way, which made their `if not "%ERRORLEVEL%"=="0" exit /b 1` lines unreachable — a cell that
 * could not go red for the thing it was there to check. ARC-09-S04 hit the same rule from the
 * other side, where an `exit /b 3` sat inside an echoed string.
 *
 * `call` is a `cmd` builtin and only that: the two PowerShell steps that run `.\bootstrap.cmd`
 * must NOT have it, and a regex that added it everywhere put it in both. Hence the pairing below —
 * the shell decides.
 */
test('every cmd step CALLs a .cmd, and no powershell step does (ARC-09-S08)', () => {
  const ci = wf('ci.yml');
  const lines = ci.split('\n');
  let shell = null;
  const bare = [];
  const wrongShell = [];
  for (const [i, line] of lines.entries()) {
    const m = /^\s+shell:\s*(\S+)/.exec(line);
    if (m) shell = m[1];
    if (/^\s+(call )?\.?\.?[\\/]?[a-z]*\\?(bootstrap|snowarch)\.cmd /.test(line)) {
      const called = /^\s+call /.test(line);
      // `& cmd /c "…"` inside PowerShell is a new cmd process whose only job is that line: it
      // returns whatever the batch file exits with, so `call` is neither needed nor allowed there.
      if (/cmd \/c/.test(line)) continue;
      if (shell === 'cmd' && !called) bare.push(`${i + 1}: ${line.trim()}`);
      if (shell !== 'cmd' && called) wrongShell.push(`${i + 1}: ${line.trim()}`);
    }
  }
  assert.deepEqual(bare, [],
    'a .cmd invoked from `shell: cmd` without `call` never returns — the lines after it are dead');
  assert.deepEqual(wrongShell, [],
    '`call` is a cmd builtin; in PowerShell it is not a command at all');
});

test('the exit-code check after a .cmd is reachable, proven by running cmd (ARC-09-S08)', (t) => {
  // The claim is about `cmd.exe`, so on anything else this is honest about not having run.
  if (process.platform !== 'win32') {
    return t.skip('cmd.exe is the subject; the drill runs on the Windows cells');
  }
  const dir = tempDir('snowarch-call-drill-', t);
  writeFileSync(join(dir, 'fails.cmd'), '@echo off\r\nexit /b 7\r\n');

  // WITHOUT `call`: control never returns, so the marker after it never prints and the step's own
  // exit check cannot run. That is the bug, reproduced rather than described.
  writeFileSync(join(dir, 'without.cmd'), '@echo off\r\n.\\fails.cmd\r\necho AFTER\r\nexit /b 0\r\n');
  const without = spawnSync(process.env.COMSPEC || 'cmd.exe', ['/c', join(dir, 'without.cmd')],
    { cwd: dir, encoding: 'utf8' });
  assert.equal(/AFTER/.test(without.stdout ?? ''), false, 'control returned without `call`');
  assert.equal(without.status, 7, 'the caller exited with the callee\'s code, having never resumed');

  // WITH `call`: control returns, the check runs, and the planted failure turns the step red.
  writeFileSync(join(dir, 'with.cmd'),
    '@echo off\r\ncall .\\fails.cmd\r\nif not "%ERRORLEVEL%"=="0" exit /b 1\r\necho AFTER\r\n');
  const withCall = spawnSync(process.env.COMSPEC || 'cmd.exe', ['/c', join(dir, 'with.cmd')],
    { cwd: dir, encoding: 'utf8' });
  assert.equal(withCall.status, 1, 'the exit-code check did not fire');
  assert.equal(/AFTER/.test(withCall.stdout ?? ''), false, 'the check let a failure through');
});

/**
 * ARC-09-S08 — the required contexts, generated, and held to the workflow they come from.
 *
 * `main`'s branch protection lists its required checks BY NAME. A list typed into a settings page
 * silently stops matching: a renamed cell is not a red build, it is a required check nobody
 * produces any more — protection either waits for ever or quietly stops requiring the thing it was
 * there for. So the list is generated from `ci.yml`, this test holds the two together, and the
 * architect's protection call reads the file.
 */
test('required-contexts.json is exactly what ci.yml produces on a pull request (ARC-09-S08)', () => {
  const fixture = JSON.parse(readFileSync(join(root, 'tests/fixtures/required-contexts.json'), 'utf8'));

  // The generator is the one implementation; this runs it in `--check` mode rather than
  // re-deriving the names here, because a second derivation is a second opinion and the day they
  // disagree the test is as likely to be wrong as the file.
  const check = spawnSync(process.execPath,
    [join(root, 'scripts/gen-required-contexts.mjs'), '--check'], { encoding: 'utf8' });
  assert.equal(check.status, 0,
    `the fixture is stale or unreadable — run npm run gen\n${check.stdout}${check.stderr}`);

  assert.equal(fixture.count, fixture.contexts.length);
  assert.equal(new Set(fixture.contexts).size, fixture.contexts.length, 'a duplicated context');
  assert.ok(fixture.count >= 50, `${fixture.count} contexts — the parser lost some`);

  // Every job in the workflow is represented, and nothing else is.
  const ci = wf('ci.yml');
  const jobsBlock = ci.slice(ci.indexOf('\njobs:'));
  const jobNames = [...jobsBlock.matchAll(/^ {2}([a-z][a-z0-9-]*):$/gm)].map((m) => m[1]);
  // A job's CONTEXT is its `name:` when it has one, not its id — `no-build` prints as
  // `no-build handshake (ubuntu-latest)`. Comparing against the id would have passed for twelve
  // jobs and failed for the one that renames itself, which is the one worth catching.
  const displayOf = (job) => {
    // Sliced PAST the job's own header, or the split cuts at index 0 and the block is empty — the
    // same trap the contexts generator hit reading `matrix:`.
    const header = `\n  ${job}:`;
    const after = jobsBlock.slice(jobsBlock.indexOf(header) + header.length);
    const block = after.split(/\n {2}[a-z][a-z0-9-]*:\n/)[0];
    const name = /^ {4}name:\s*(.+)$/m.exec(block);
    return name ? name[1].trim().replace(/^['"]|['"]$/g, '').replace(/\s*\(.*$/, '') : job;
  };
  for (const job of jobNames) {
    const display = displayOf(job);
    assert.ok(fixture.contexts.some((c) => c === display || c.startsWith(`${display} (`)),
      `${job} (printed as "${display}") produces no context in the fixture`);
  }
  const displays = jobNames.map(displayOf);
  for (const context of fixture.contexts) {
    assert.ok(displays.some((d) => context === d || context.startsWith(`${d} (`)),
      `${context} names no job in ci.yml`);
  }

  // The three this story adds, in the form a check run prints them.
  for (const node of ['20', '22', '24']) {
    assert.ok(fixture.contexts.includes(`windows-native (node ${node}, no Git Bash)`),
      `windows-native (node ${node}, no Git Bash) is missing`);
  }

  // The conditional workflows are excluded BY NAME with a reason, never by "it was not in the last
  // run". `docs-real.yml` names its jobs after the OS and is path-filtered: a PR that touches its
  // paths produces four extra check runs, and a generator that learned its list from a run would
  // have made them required.
  assert.ok(Object.keys(fixture._notRequired).includes('docs-real.yml'));
  for (const [file, why] of Object.entries(fixture._notRequired)) {
    assert.ok(existsSync(join(root, '.github/workflows', file)), `${file} is not there`);
    assert.ok(why.length > 30, `${file}'s exclusion carries no reason`);
  }

  // ...AND THE REVERSE (ARC-09-S10). Until this story every workflow happened to be accounted for,
  // and nothing said so: a new file could sit in `.github/workflows/` producing checks that were
  // neither required nor deliberately excluded, and the generator — which reads only the gating
  // workflow — would not have noticed. `publish-npm.yml` was the first file to test that, which is
  // why the assertion arrives with it rather than as tidying.
  const unaccounted = readdirSync(join(root, '.github/workflows'))
    .filter((f) => f.endsWith('.yml'))
    .filter((f) => f !== 'ci.yml' && !(f in fixture._notRequired));
  assert.deepEqual(unaccounted, [], 'these workflows are neither the gating one nor excluded with '
    + 'a reason — add them to NOT_REQUIRED in scripts/gen-required-contexts.mjs');

  // S09 merged and the job exists, so its two contexts are here — the inverse of what this
  // asserted while the job did not: a name CI does not produce is a required check waiting for
  // ever, and a job CI does produce that is NOT required is a red build nothing blocks on.
  assert.deepEqual(fixture.contexts.filter((c) => c.startsWith('eol')),
    ['eol (ubuntu-latest)', 'eol (windows-latest)']);
});

test('the contexts generator fails LOUDLY on a job it cannot classify (ARC-09-S08)', () => {
  // The property that makes the file trustworthy: an omission would be a context that never
  // becomes required, found months later by a bad merge. The generator's contract is exit 2 with
  // the job named, and both halves are asserted of the source rather than hoped for.
  const src = readFileSync(join(root, 'scripts/gen-required-contexts.mjs'), 'utf8');
  assert.match(src, /process\.exit\(2\)/, 'there is no hard-failure path');
  assert.match(src, /const die = /, 'the failure is not in one place');
  for (const shape of ['cannot read', 'which the matrix does not set', 'declares no matrix']) {
    assert.ok(src.includes(shape), `no hard failure for: ${shape}`);
  }
  // …and it is a FAILURE, not a warning that carries on: every `die` ends the process.
  assert.match(src, /writeSync\(2, `gen-required-contexts: \$\{why\}\\n`\); process\.exit\(2\); \};/);
});

/**
 * ARC-09-S08 — a `shell: bash` step in a job that removed Git Bash resolves to the WSL stub.
 *
 * `C:\Windows\System32\bash.exe` is on every Windows machine and is not a shell — it is the WSL
 * launcher, and on a runner with no distribution installed it prints "Windows Subsystem for Linux
 * has no installed distributions" and exits 1. So a job that strips Git Bash JOB-WIDE has taken on
 * a rule: nothing in it may ask for bash. Measured the hard way — `strip-git-bash.mjs` wrote
 * `GITHUB_ENV` in ARC-06-S14's cell and the cell's own bash assertions started failing there.
 */
test('a job that exports the stripped PATH has no bash steps left in it (ARC-09-S08)', () => {
  const ci = wf('ci.yml');
  const jobsBlock = ci.slice(ci.indexOf('\njobs:'));
  const names = [...jobsBlock.matchAll(/^ {2}([a-z][a-z0-9-]*):$/gm)];

  for (const [i, m] of names.entries()) {
    const body = jobsBlock.slice(m.index, i + 1 < names.length ? names[i + 1].index : undefined);
    if (!/strip-git-bash\.mjs[^\n]*--export/.test(body)) continue;

    // Every step after the export must be a shell this job still has. The job default counts too.
    const usesBash = [...body.matchAll(/^\s+shell:\s*bash\s*$/gm)];
    assert.deepEqual(usesBash.map((x) => x[0].trim()), [],
      `${m[1]} strips Git Bash job-wide and still has a \`shell: bash\` step — that resolves to `
      + 'C:\\Windows\\System32\\bash.exe, the WSL stub');
    assert.match(body, /shell: cmd/, `${m[1]} exports a stripped PATH but declares no cmd default`);
  }
});

test('every cmd step ends with an explicit exit code (ARC-09-S08)', () => {
  // A cmd step's exit code is the LAST command's, and `if` does not reset ERRORLEVEL — so a step
  // whose final line is `if %ERRORLEVEL% GEQ 2 exit /b 1` inherits whatever the command before it
  // returned and goes red while asserting nothing. Three cells failed exactly there.
  const ci = wf('ci.yml');
  const offenders = [];
  for (const [, block] of ci.matchAll(/^\s+run: \|\n((?:\s{10}.*\n)+)/gm)) {
    const lines = block.split('\n').map((l) => l.trim()).filter(Boolean);
    if (!lines.some((l) => /^(call |rem |where |type |set )/.test(l))) continue;   // not a cmd step
    const last = lines[lines.length - 1];
    if (/^if %ERRORLEVEL% GEQ \d+ exit \/b \d+$/.test(last)) offenders.push(last);
  }
  assert.deepEqual(offenders, [],
    'a cmd step ending in a GEQ guard inherits the previous command\'s code — add `exit /b 0`');
});

/**
 * ARC-09-S08 — a cmd step writes its scratch to `%RUNNER_TEMP%`, never into the checkout.
 *
 * `windows-native`'s last step claims "the checkout is as CI found it", and on its first run
 * `assert-clean` reported `?? version.txt` and `?? hook.txt` — written by two of the job's own
 * earlier steps. That is the assertion doing exactly its job, and the reason this is now a rule
 * rather than a habit: the older cell had the same `version.txt` and remembered to `del` it, which
 * works until somebody adds a step and does not.
 *
 * `%RUNNER_TEMP%` needs no cleanup, cannot be seen by `git status`, and survives between steps of
 * the same job — which a `del` at the end of one step does not give you anyway.
 */
test('no cmd step redirects into the checkout (ARC-09-S08)', () => {
  const ci = wf('ci.yml');
  const lines = ci.split('\n');

  // The steps, with the shell each actually runs under: a step's own `shell:` when it has one,
  // otherwise its JOB's `defaults.run.shell`. A regex over the whole file cannot know that, and the
  // first version of this test flagged bash redirects, a PowerShell line and a `>` inside a
  // JavaScript string — three false findings that would have taught a reader to distrust it.
  const cmdLines = [];
  let jobDefault = null;
  let stepShell = null;
  let inRun = false;
  let runIndent = 0;

  for (const [i, line] of lines.entries()) {
    if (/^ {2}[a-z][a-z0-9-]*:$/.test(line)) { jobDefault = null; stepShell = null; inRun = false; }
    const def = /^ {8}shell:\s*(\S+)/.exec(line);          // defaults.run.shell, at job level
    if (def) jobDefault = def[1];
    if (/^ {6}- /.test(line)) { stepShell = null; inRun = false; }
    const own = /^ {8}shell:\s*(\S+)/.exec(line) ?? /^ {6}shell:\s*(\S+)/.exec(line);
    if (own && /^ {6,8}shell:/.test(line) && !/^ {8}shell:/.test(line)) stepShell = own[1];
    else if (own && inRun === false && /^ {8}shell:/.test(line) && jobDefault === own[1]) {
      // ambiguous at this indentation; the job default already captured it
    } else if (own) stepShell = own[1];

    const runStart = /^(\s+)run: \|/.exec(line);
    if (runStart) { inRun = true; runIndent = runStart[1].length; continue; }
    if (inRun) {
      if (line.trim() === '') continue;
      const indent = line.length - line.trimStart().length;
      if (indent <= runIndent) { inRun = false; continue; }
      if ((stepShell ?? jobDefault) === 'cmd') cmdLines.push([i + 1, line.trim()]);
    }
  }

  assert.ok(cmdLines.length > 20, `only ${cmdLines.length} cmd lines found — the parser is wrong`);

  // `%RUNNER_TEMP%` needs no cleanup, is invisible to `git status`, and survives between steps of
  // the same job — which a `del` at the end of one step does not give you anyway.
  const allowed = /^("%RUNNER_TEMP%[^"]*"|"?%GITHUB_STEP_SUMMARY%"?|"?%GITHUB_OUTPUT%"?|nul|&1)$/;
  const offenders = [];
  for (const [n, text] of cmdLines) {
    if (text.startsWith('rem ')) continue;
    // `(?<![=<])` because `=>` is an arrow function, not a redirect: a `node -e "…"` one-liner
    // full of them read as five writes into the checkout on the first attempt.
    for (const [, target] of text.matchAll(/(?<![=<])\d?>>?\s*("[^"]*"|\S+)/g)) {
      if (!allowed.test(target)) offenders.push(`${n}: ${text}`);
    }
  }

  assert.deepEqual(offenders, [],
    'a cmd step writes into the checkout — use %RUNNER_TEMP%, so no step has to remember a `del`');
  // …and the rule has no exception left: the `del`s that used to clean up after such writes are
  // gone with the writes they cleaned up after.
  assert.equal(/^\s+del (version|hook)\.txt\s*$/m.test(ci), false, 'a `del` survived its write');
});


/** The two required contexts `eol` adds, exactly as a check run prints them. */
const EOL_CONTEXTS = ['eol (ubuntu-latest)', 'eol (windows-latest)'];

test('eol sets autocrlf BEFORE the checkout, on Windows only (ARC-09-S09)', () => {
  const ci = wf('ci.yml');
  // The job block: from its key to the next top-level job key, or the end of the file.
  const from = ci.indexOf('\n  eol:');
  assert.ok(from > -1, 'the eol job is gone from ci.yml');
  const next = ci.slice(from + 1).search(/\n {2}[a-z][a-z0-9-]*:\n/);
  const body = next === -1 ? ci.slice(from) : ci.slice(from, from + 1 + next);

  // COMMENT LINES OUT FIRST. This job's comment explains the ordering and names
  // `actions/checkout@v4` while doing so, so the naive index of that string is in the PROSE, three
  // steps above the step — and the assertion passed or failed on where someone put a paragraph.
  const code = body.split('\n').filter((l) => !/^\s*#/.test(l)).join('\n');
  const configAt = code.indexOf('core.autocrlf true');
  const checkoutAt = code.indexOf('actions/checkout@v4');
  assert.ok(configAt > -1, 'the autocrlf step is gone — the job then tests the runner default');
  // THE ordering assertion. The setting decides what the clone writes, so afterwards is a tree
  // already written under the default: the job would still be green and would prove nothing.
  assert.ok(configAt < checkoutAt,
    'core.autocrlf is set AFTER the checkout, so the checkout it governs already happened');

  // And only on Windows: on ubuntu the same setting would rewrite the tree in the other direction
  // and the LF assertions would be testing the runner's config rather than the repository.
  const configStep = code.slice(code.lastIndexOf('- name:', configAt), configAt);
  assert.match(configStep, /if: runner\.os == 'Windows'/);

  // The `--help` step is cmd, because `cmd.exe` is what a Windows user's shell actually is, and
  // the `.cmd` launchers are the files under test.
  assert.match(code, /shell: cmd/);
  assert.match(code, /call \.\\bootstrap\.cmd --help/);
  assert.match(code, /call \.\\snowarch\.cmd --help/);
  assert.match(code, /powershell -NoProfile -ExecutionPolicy Bypass -File bootstrap\.ps1 --help/);

  // Both byte assertions present, and the LF one on BOTH cells: a `\r` committed to bootstrap.sh
  // is a Unix failure, so ubuntu is where it must be caught, not only Windows.
  assert.match(code, /assert-crlf\.mjs bootstrap\.cmd bootstrap\.ps1 snowarch\.cmd/);
  const lfStep = code.slice(code.lastIndexOf('- name:', code.indexOf('assert-lf.mjs')), code.indexOf('assert-lf.mjs'));
  assert.equal(/if:/.test(lfStep), false, 'the LF assertion was made conditional — it must run on both');
});

test('eol adds exactly two required contexts, by the names a check run prints (ARC-09-S09)', () => {
  const fixture = JSON.parse(readFileSync(join(root, 'tests/fixtures/required-contexts.json'), 'utf8'));
  for (const name of EOL_CONTEXTS) {
    assert.ok(fixture.contexts.includes(name), `${name} is not in required-contexts.json`);
  }
  // 52 before this story. A generated file is not evidence on its own — the number is the claim.
  assert.equal(fixture.count, 54, `${fixture.count} contexts — S09 takes 52 to 54`);
});

test('publish-npm is dispatch-only, dry by default, and the only OIDC workflow (ARC-09-S10)', () => {
  const text = wf('publish-npm.yml');
  // COMMENTS OUT FIRST, for the same reason the `eol` test does it (ARC-09-S09): this workflow's
  // header explains the guards and names both scripts and the forbidden package while doing so, so
  // an assertion over the raw text is an assertion about where someone put a paragraph. In a
  // comment it is the RULE; in a step it is the behaviour.
  const code = text.split('\n').filter((l) => !/^\s*#/.test(l)).join('\n');

  // AC 4, as the story spells it: one trigger, and it is a human's.
  assert.equal((code.match(/workflow_dispatch/g) ?? []).length, 1);
  for (const trigger of ['tags:', 'pull_request:', 'schedule:']) {
    assert.equal(code.includes(`\n  ${trigger}`), false, `publish-npm triggers on ${trigger}`);
  }
  // `push:` deserves its own look: a `push` trigger here would publish on every merge to develop.
  assert.equal(/^on:\n(?:\s+\S.*\n)*?\s{2}push:/m.test(code), false, 'publish-npm triggers on push');

  // THE DEFAULT IS THE HARMLESS ONE. A dialog accepted as it stands must not publish.
  assert.match(code, /dry_run:\n(?:.*\n)*?\s+default: true/);
  assert.match(code, /--dry-run/);

  // The provenance permission, and nowhere else. `id-token: write` is a credential in its own
  // right: it mints an OIDC token any step in that workflow can present.
  assert.match(code, /id-token: write/);
  for (const f of readdirSync(join(root, '.github/workflows'))) {
    if (f === 'publish-npm.yml') continue;
    assert.equal(/id-token:\s*write/.test(wf(f)), false, `${f} also has id-token: write`);
  }

  // The two guards run BEFORE the install and before the token is anywhere near a command.
  const order = ['verify-tag.mjs', 'assert-publish-target.mjs', 'npm ci', 'NODE_AUTH_TOKEN']
    .map((needle) => code.indexOf(needle));
  assert.deepEqual(order, [...order].sort((a, b) => a - b),
    'the publish steps are out of order — the target check must precede npm ci and the token');
  assert.ok(order.every((i) => i > -1), 'a publish step went missing');

  // The name that must never appear in a publish command, and the one that must.
  assert.match(code, /npm publish --workspace packages\/snowarch/);
  // In the STEPS. The header comment names it deliberately — that sentence is why the guard exists.
  assert.equal(code.includes('snow-mcp'), false,
    'the forbidden package name appears in a publish-npm step, not merely in its explanation');
});

test('publish-npm adds no required context, and is excluded with its reason (ARC-09-S10)', () => {
  const fixture = JSON.parse(readFileSync(join(root, 'tests/fixtures/required-contexts.json'), 'utf8'));
  assert.equal(fixture.contexts.some((c) => c.includes('publish')), false,
    'a manual-dispatch workflow cannot be a required check: protection would wait for ever');
  const why = fixture._notRequired['publish-npm.yml'];
  assert.ok(why && why.length > 30, 'publish-npm.yml is excluded without a reason');
  assert.match(why, /dispatch/);
  // Unchanged by this story, and the number is the claim.
  assert.equal(fixture.count, 54, `${fixture.count} contexts — S10 adds none`);
});


test('C19: the release judges its doctor report instead of letting -e decide', () => {
  const text = wf('release.yml');
  const code = text.split('\n').filter((l) => !/^\s*#/.test(l)).join('\n');

  // The capture must not be the judgement: `set +e` around the doctor, the exit code kept, and only
  // 2-and-above fatal (usage, or the doctor could not run at all).
  assert.match(code, /set \+e/);
  assert.match(code, /if \[ "\$code" -ge 2 \]; then exit 1; fi/);

  // The judgement is the SAME script and the same flag the bootstrap cells use — one implementation
  // of "which failures does this environment explain", not a second opinion in YAML.
  // Matched across the line break: ARC-09-C20 wrapped this step, and an assertion pinned to one
  // line's worth of it would fail on a reflow rather than on a change of meaning.
  // Line continuations joined AND whitespace squeezed: the YAML line ends `\` after a space,
  // so a naive join leaves two. An assertion that fails on a double space is an assertion
  // about formatting.
  const judge = code.replace(/\\\n\s+/g, ' ').replace(/ {2,}/g, ' ');
  assert.match(judge, /assert-doctor\.mjs --in doctor-\$\{\{ matrix\.os \}\}\.json --expect-fail E-00/);
  const ci = wf('ci.yml');
  assert.match(ci, /assert-doctor\.mjs --in "\$RUNNER_TEMP\/doctor\.json" --expect-fail E-00/);

  // ...and it runs AFTER the report exists and BEFORE the upload, or a bad report reaches the
  // artefact store and the judgement is decoration.
  const wrote = code.indexOf('doctor-${{ matrix.os }}.json');
  const judged = code.indexOf('assert-doctor.mjs');
  const uploaded = code.indexOf('upload-artifact');
  assert.ok(wrote < judged && judged < uploaded,
    `order is wrong: wrote ${wrote}, judged ${judged}, uploaded ${uploaded}`);

  // The sentence a reader of the Release needs, next to the numbers — asserted where it LIVES.
  // ARC-09-C21 moved it out of this workflow and into `release-notes.mjs`, because the body has one
  // writer now; a workflow that still carried the sentence would be a second one.
  const notesScript = readFileSync(join(root, 'scripts/ci/release-notes.mjs'), 'utf8');
  assert.match(notesScript, /E-00 is expected there, and every other check must be ok/);
  assert.equal(/E-00 is expected there/.test(code), false,
    'the workflow writes the sentence itself — the body is composed in one place');

  // ARC-09-C20: this job installs before it runs the doctor, so it says which world it is in. The
  // bootstrap cells do NOT pass the flag and must not — the default is their shape, and a cell that
  // started passing `installed` would stop noticing something installing too early.
  assert.match(code, /--deps installed/);
  const ciCode = wf('ci.yml').split('\n').filter((l) => !/^\s*#/.test(l)).join('\n');
  assert.equal(/--deps/.test(ciCode), false,
    'a bootstrap cell passes --deps — the default is its shape and saying so would invite changing it');
});

/**
 * ARC-09-C42 — the PowerShell linter step must be able to say which kind of failure it had.
 *
 * #198's `windows launcher` cell printed three lines: `Value cannot be null. Parameter name:
 * source`, and an exit 1. No version, no path, no findings table — so a **bad module release**, a
 * **partial extraction** and a **real finding about bootstrap.ps1** were indistinguishable, and the
 * step's own `Get-Module -ListAvailable` guard had stayed silent because the manifest WAS there.
 *
 * These are structural assertions, and that limit is the point of saying it here: the behavioural
 * control — break the import on purpose and watch it print the import sentence instead of the null
 * — needs a Windows runner, and `pwsh` is not on the machine this suite runs on. What a test on
 * this side CAN hold is that the step still carries each of the three distinctions. A step that
 * loses one of them loses the ability to tell the next reader what happened.
 */
test('ARC-09-C42 — the analyzer step imports, prints its version, and separates a crash from a finding', () => {
  const ci = wf('ci.yml');
  const from = ci.indexOf('PSScriptAnalyzer (5.1 compatibility)');
  assert.ok(from > 0, 'the PSScriptAnalyzer step is gone from ci.yml');
  // Bounded by the NEXT step, not by indentation guessing: `- name:` at six spaces is what starts
  // one in this file, and a slice that stops at the first two-space line stops inside the script.
  const next = ci.indexOf('\n      - name:', from);
  const step = ci.slice(from, next === -1 ? ci.length : next);
  assert.ok(step.includes('Invoke-ScriptAnalyzer'), 'the slice did not capture the analysis itself');

  // 1. It IMPORTS rather than listing. `-ListAvailable` reads a manifest; only an import loads the
  //    assemblies that threw.
  assert.match(step, /Import-Module PSScriptAnalyzer -ErrorAction Stop/,
    'the step does not import the module, so a half-extracted install still passes its check');

  // 2. It prints the version and the path, on EVERY run. Without this the value a `-RequiredVersion`
  //    pin would need does not exist in any log — which is why this job is not pinned yet.
  assert.match(step, /Write-Host "PSScriptAnalyzer \$\(\$m\.Version\) from \$\(\$m\.ModuleBase\)"/,
    'the step no longer records which version it resolved');

  // 3. Three failures, three exits, three sentences. Sharing exit 1 is what made #198 unreadable.
  const exits = [...step.matchAll(/exit (\d)/g)].map((m) => m[1]);
  assert.deepEqual([...new Set(exits)].sort(), ['1', '2', '3'],
    `a crash, an import failure and a finding must not share an exit code — found: ${exits.join(', ')}`);
  assert.match(step, /will not import/, 'the import failure has no sentence of its own');
  assert.match(step, /this is a CRASH, not a finding/, 'a crash is not distinguished from a finding');
});

/**
 * ARC-09-C42 — nothing but ASCII inside a `shell: powershell` step.
 *
 * WHAT HAPPENED: #201's first head failed to PARSE, not to run — `ParserError …
 * TerminatorExpectedAtEndOfString`. GitHub writes a `shell: powershell` step to a `.ps1` with **no
 * BOM**, and Windows PowerShell 5.1 then reads it in the ANSI code page. A UTF-8 em dash is
 * `E2 80 94`; in cp1252 that is `â€"`, and `0x94` is the curly double quote `”`, which 5.1 accepts
 * as a **string terminator**. So a sentence with an em dash inside a double-quoted string closes
 * the string early and the parser dies before a single line runs.
 *
 * `pwsh` (7) reads UTF-8 and would not care. 5.1 is exactly what that job exists to test, which is
 * why the rule is scoped to `shell: powershell` and not to the file.
 *
 * ONE LINE BROKE IT and ten did not: the ten were `#` comments, where a stray quote is harmless
 * because a comment runs to end of line — four of them had been shipping green for months. The rule
 * is still the whole block, because "ASCII except inside comments" is a rule nobody can apply while
 * writing, and because this is the structural control the C42 docblock said was missing: it needs
 * no Windows runner.
 */
test('ARC-09-C42 — no `shell: powershell` step carries a byte 5.1 will misread', () => {
  const ci = wf('ci.yml');
  const lines = ci.split('\n');
  const blocks = [];
  lines.forEach((line, i) => {
    if (line.trim() !== 'shell: powershell') return;          // `pwsh` is UTF-8 and exempt
    const indent = line.length - line.trimStart().length;
    let j = i;
    while (j < lines.length && !lines[j].trim().startsWith('run: |') && j <= i + 6) j += 1;
    if (!lines[j]?.trim().startsWith('run: |')) return;
    let k = j + 1;
    while (k < lines.length
      && (lines[k].trim() === '' || lines[k].length - lines[k].trimStart().length > indent)) k += 1;
    blocks.push([j + 1, k]);
  });
  assert.ok(blocks.length >= 10, `only ${blocks.length} powershell blocks found — the scan moved`);

  const offenders = [];
  for (const [a, b] of blocks) {
    for (let n = a; n < b; n += 1) {
      const bad = [...lines[n]].filter((c) => c.codePointAt(0) > 127);
      if (bad.length) offenders.push(`ci.yml:${n + 1}: ${[...new Set(bad)].join('')} in ${lines[n].trim().slice(0, 70)}`);
    }
  }
  assert.deepEqual(offenders, [],
    `${offenders.length} non-ASCII character(s) inside a Windows PowerShell 5.1 step. 5.1 reads these\n`
    + 'steps in the ANSI code page, where an em dash decodes to a curly quote that terminates a\n'
    + `string. Use a plain hyphen and straight quotes:\n  ${offenders.join('\n  ')}`);
});

/**
 * ARC-09-C48 — no test file runs nowhere, including inside the directory the walk is told to skip.
 *
 * `tests/run.mjs` walks the tree so that a new test file is picked up without anybody remembering
 * to add it, and excludes exactly one directory — `tests/upgrade/`, whose harness builds a world
 * per case and needs a full-depth checkout with tags. That exclusion is defended in the file, and
 * the defence contains a promise nothing checks:
 *
 *   "An exclusion is a thing that rots, so it is a LIST of one with the job that covers it named:
 *    anything added here that no job runs is documentation, which is what the recursive walk above
 *    exists to prevent."
 *
 * The walk prevents an unrun file everywhere EXCEPT inside the directory it is told to skip, and
 * there the covering job names its three files by hand. So the one place the guarantee is asserted
 * in prose is the one place the mechanism cannot reach. A fourth file added to `tests/upgrade/`
 * today runs in neither `npm test` nor CI, and nothing says so — it passes both, by being absent
 * from both, which is the failure-versus-absence confusion this arc keeps finding.
 *
 * Found while reporting gate numbers for #206: `npm test` read 1378 before and after that PR
 * merged, although it added three tests. They were real and they passed; they were simply not in
 * the suite whose number I was quoting.
 */

/** The files a `node --test` run-block names, in the job whose step contains `marker`. */
export function testFilesInJob(text, marker) {
  const lines = text.split('\n');
  const at = lines.findIndex((l) => l.includes(marker));
  if (at === -1) return null;
  const out = [];
  for (let i = at; i < lines.length; i += 1) {
    const m = /(tests\/[\w./-]+\.test\.mjs)/.exec(lines[i]);
    if (m) { out.push(m[1]); continue; }
    // Stop at the next step, so a later job's list cannot be read as this one's.
    if (out.length && /^\s{6}- name:/.test(lines[i])) break;
  }
  return out;
}

/** Which files are on disk but named by no job, and which are named but no longer on disk. */
export function runsNowhere({ onDisk, named }) {
  return {
    unrun: onDisk.filter((f) => !named.includes(f)),
    stale: named.filter((f) => !onDisk.includes(f)),
  };
}

test('ARC-09-C48 — every test file excluded from `npm test` is named by the job that covers it', () => {
  const dir = 'tests/upgrade';
  const onDisk = readdirSync(join(root, dir))
    .filter((f) => f.endsWith('.test.mjs')).map((f) => `${dir}/${f}`).sort();
  const named = (testFilesInJob(wf('ci.yml'), 'node --test --test-concurrency=2') ?? []).sort();

  // NON-VACUITY, both sides. An empty parse and an empty directory agree perfectly, and that
  // agreement is exactly what this test must not report as health.
  assert.ok(onDisk.length >= 3, `only ${onDisk.length} test files found in ${dir} — has it moved?`);
  assert.ok(named.length >= 3, `the job's file list parsed as ${named.length} entries — the step moved`);

  const { unrun, stale } = runsNowhere({ onDisk, named });
  assert.deepEqual(unrun, [],
    `${unrun.length} test file(s) in ${dir} run NOWHERE: excluded from \`npm test\` by tests/run.mjs `
    + 'and not named by the upgrade-e2e job. Add them to that job\'s run-block, or move them under a '
    + 'directory the walk covers.');
  assert.deepEqual(stale, [],
    `the upgrade-e2e job names ${stale.length} file(s) that no longer exist: ${stale.join(', ')}`);
});

test('ARC-09-C48 control — the predicate fails by NAME in both directions', () => {
  // The closed path, driven directly: no file is planted, because the thing under test is the
  // comparison, and a test that created a file to prove a comparison works would be testing the
  // filesystem. A fourth file nobody listed is the case that reached CI.
  const onDisk = ['tests/upgrade/a.test.mjs', 'tests/upgrade/b.test.mjs'];
  assert.deepEqual(runsNowhere({ onDisk, named: ['tests/upgrade/a.test.mjs'] }),
    { unrun: ['tests/upgrade/b.test.mjs'], stale: [] });

  // And the rot facing the other way: a list that outlives the file it names. Same defect class —
  // the list stops describing the tree — and it would otherwise fail in CI as a missing path.
  assert.deepEqual(runsNowhere({ onDisk: ['tests/upgrade/a.test.mjs'], named: onDisk }),
    { unrun: [], stale: ['tests/upgrade/b.test.mjs'] });

  // Agreement is reported as agreement, or the test above could never pass.
  assert.deepEqual(runsNowhere({ onDisk, named: onDisk }), { unrun: [], stale: [] });

  // The parser is aimed at ONE step: a marker that is not there returns null rather than the first
  // list it can find, so a renamed step fails the non-vacuity floor instead of silently comparing
  // against some other job's files.
  assert.equal(testFilesInJob(wf('ci.yml'), 'a step that does not exist'), null);
});

/**
 * ARC-08-C25 — the doctor artifact and the product's `--json` are held to ONE shape.
 *
 * The `doctor-<label>` bundle carried three files with three shapes and nothing checked any of
 * them, so a reviewer pulling one to read a quick run's `durationMs` got `doctor-normalised.json` —
 * which `doctor-snapshot.mjs` strips of the clock and the counts on purpose — and reasonably
 * concluded the artifact was a legacy shape that could not answer the question.
 *
 * The bundle was right and unlabelled. The report that WOULD have answered it, `doctor-quick.json`,
 * was written by the job and never uploaded at all: the one number ARC-08-C19's budget question
 * turned on existed for the length of a step and was thrown away.
 */
test('ARC-08-C25 — every report the job uploads is validated, by the product\'s own validator', () => {
  const ci = wf('ci.yml');

  // The quick report reaches the artifact. It is the one a timing question needs, and it was the
  // one missing.
  const upload = /name: doctor-\$\{\{ matrix\.label \}\}[\s\S]*?retention-days/.exec(ci);
  assert.ok(upload, 'the doctor artifact step is gone');
  for (const file of ['doctor.json', 'doctor-quick.json', 'doctor-ps.json',
    'doctor-normalised.json']) {
    assert.ok(upload[0].includes(file), `${file} is not uploaded`);
  }

  // …and every one of them that CLAIMS to be a report is validated before it is uploaded.
  const validate = /node scripts\/ci\/validate-report\.mjs[\s\S]*?\n\n/.exec(ci);
  assert.ok(validate, 'the reports are uploaded without being validated');
  for (const file of ['doctor.json', 'doctor-quick.json', 'doctor-ps.json']) {
    assert.ok(validate[0].includes(file), `${file} is uploaded but never validated`);
  }

  // Runs on a red job too: a report validated only when the job was green is a report you cannot
  // trust on the run you actually needed it for.
  const step = /- name: The uploaded reports are schema-v1[\s\S]*?run: >/.exec(ci);
  assert.ok(step, 'the validation step is gone');
  assert.match(step[0], /if: always\(\)/);
});

test('ARC-08-C25 — the validator is the product\'s, and the exemption is by name', async () => {
  // ONE SHAPE, NOT TWO. The point of the row is that the artifact cannot drift from the product,
  // and it cannot because the CI script imports `validateReport` rather than describing the schema
  // a second time. A test that only checked the workflow text would not see a second copy.
  const mod = await import('../scripts/ci/validate-report.mjs');
  const src = readFileSync(join(root, 'scripts/ci/validate-report.mjs'), 'utf8');
  assert.match(src, /import \{ validateReport \} from '\.\.\/\.\.\/tools\/snowarch\/lib\/doctor\/report-json\.mjs'/,
    'the CI validator describes the schema itself instead of importing the product\'s');

  // The stripped snapshot is exempt BY NAME, with the reason beside it — an allow-list rather than
  // a pattern, so the next file added to the bundle has to say which of the two it is.
  assert.deepEqual([...mod.NOT_A_REPORT.keys()], ['doctor-normalised.json']);
  assert.match(mod.NOT_A_REPORT.get('doctor-normalised.json'), /comparison key, not a report/);
  assert.deepEqual(mod.problemsFor('x/doctor-normalised.json', '{"anything":true}'), [],
    'the normalised snapshot is being held to a schema it never claimed');

  // A report missing the number the artifact exists to answer is refused, and says which.
  const { ranAt: _gone, ...noClock } = JSON.parse(
    readFileSync(join(root, 'tests/fixtures/doctor/status-design.json'), 'utf8'));
  const problems = mod.problemsFor('doctor.json', JSON.stringify(noClock));
  assert.ok(problems.some((p) => /ranAt is missing/.test(p)), problems.join('\n'));

  // …and a real, current report passes, which is the half that proves the rule is satisfiable.
  assert.deepEqual(mod.problemsFor('doctor.json',
    readFileSync(join(root, 'tests/fixtures/doctor/status-design.json'), 'utf8')), []);
});

/**
 * ARC-07-S11 / Sitting E2 — which tree the instance actually sees, and why a skip is never silent.
 *
 * Two findings from one dispatch. The job was skipped because the guard was the ref alone, and the
 * run reported `conclusion=skipped` — a calm nothing rather than a refusal with a reason. And the
 * SCHEDULE runs on the default branch, which is `main`: 289 commits behind `develop` when this was
 * measured, without a single row of ARC-08 or ARC-09 in it. **No scheduled run has ever tested a
 * tree with the live-suite rows in it**, and a green nightly on that tree says nothing about the
 * release candidate.
 *
 * Asserted over the TEXT, like every other test in this file. A YAML parser would read better and
 * would mean depending on one from a test whose whole subject is a file CI reads literally.
 */
test('ARC-07-S11 — the schedule tests develop, a dispatch tests the ref it was given', () => {
  const text = wf('e2e-live.yml');
  // The checkout's `ref:`, as one line. Both branches of the expression are the claim: what the
  // schedule resolves to, and what everything else resolves to.
  assert.match(text,
    /ref: \$\{\{ github\.event_name == 'schedule' && 'develop' \|\| github\.ref \}\}/,
    'the schedule would test the default branch, which is not where the work is');
  // It belongs to the CHECKOUT, not to some later step that happens to mention a ref.
  const checkout = text.slice(text.indexOf('actions/checkout'), text.indexOf('actions/setup-node'));
  assert.match(checkout, /ref: \$\{\{ github\.event_name == 'schedule'/,
    'the ref is set somewhere other than the checkout');
  // …and the run says which sha it tested, because the two paths resolve differently on purpose.
  assert.match(text, /The tree this run tests/, 'the run never prints the tree it tested');
  assert.match(text, /git rev-parse HEAD/, 'the run prints no sha');
});

test('ARC-07-C8 — the pty driver is python3, and the run says so', () => {
  // The step this replaces printed `script(1)`'s dialect, which was the citation the story lacked.
  // `script(1)` is gone — it called `tcgetattr` on its own stdin, and Node's default child stdio is
  // a socketpair on darwin — so the citation now has to be about the driver that IS used. A missing
  // step would leave a macOS failure unreadable again, which is how this row was found.
  const text = wf('e2e-live.yml');
  assert.match(text, /python3 --version/, 'the run never names the pty driver it used');
  assert.match(text, /if \[ -t 0 \]; then echo "stdin: tty"/,
    'the run never says whether its own stdin was a tty — the fact the whole row turned on');
  assert.equal(/command -v script\b/.test(text), false,
    'the workflow still proves script(1) is present, which nothing drives any more');
});

test('ARC-07-S11 — a skipped run says why, from a job that is not the skipped one', () => {
  // A job whose `if` is false runs NONE of its steps, so the reason cannot be printed from inside
  // `live` — that is exactly how the dispatch produced a completed run, a skipped job, and no
  // sentence anywhere. The explanation is its own job, carrying the negated condition.
  const text = wf('e2e-live.yml');
  const at = text.indexOf('\n  explain-skip:');
  assert.ok(at > 0, 'nothing explains a skip');
  const job = text.slice(at);
  assert.match(job, /if: \$\{\{ !\(github\.event_name == 'workflow_dispatch'/,
    "the skip job does not carry the guard's negation");
  assert.match(job, /default_branch/);
  assert.match(job, /echo "skipped:/, 'the skip job prints no reason');
  assert.match(job, /\$\{\{ github\.ref \}\}/, 'the reason does not name the ref that was refused');
});

// ─── The acceptance harness is hand-run, and nothing may schedule it ──────────────────────────

/** Every workflow file, as text, so a reference cannot hide in a job nobody reads. */
const allWorkflows = () => readdirSync(join(root, '.github/workflows'))
  .filter((f) => /\.ya?ml$/.test(f))
  .map((f) => ({ file: f, text: wf(f) }));

test('no workflow references the acceptance harness — it degrades a tree on purpose', () => {
  // `scripts/acceptance/tag-controls.py` EDITS SOURCE FILES so a named test fails, then restores
  // them. That is exactly what makes it useful by hand on a tag and unacceptable in CI: a job
  // running it would be a job that rewrites the repository it is testing, and a job killed halfway
  // would leave the tree degraded with no one watching. It also clones from the network and runs
  // the whole suite dozens of times.
  //
  // Asserted over the workflow TEXT like every other check in this file, and over EVERY workflow
  // rather than a list of the ones that exist today — a reference added to a new workflow tomorrow
  // is the case this is for.
  const hits = [];
  for (const { file, text } of allWorkflows()) {
    text.split('\n').forEach((line, i) => {
      if (/tag-controls|scripts\/acceptance/.test(line)) hits.push(`${file}:${i + 1}: ${line.trim()}`);
    });
  }
  assert.deepEqual(hits, [], `${hits.length} workflow line(s) reference the hand-run harness`);

  // Not vacuous: there are workflows to scan, and the matcher really does fire.
  assert.ok(allWorkflows().length >= 5, `only ${allWorkflows().length} workflow(s) scanned`);
  // `9.9.9` and not the real version: this is fixture text, and a bare literal of the version
  // the next release carries is exactly what the sweep next door refuses (ARC-09-C12a). It caught
  // this line on its first full run, which is the sweep earning its place on its author.
  assert.match('        run: python3 -u scripts/acceptance/tag-controls.py v9.9.9',
    /tag-controls|scripts\/acceptance/, 'the matcher would not catch a real reference');
});

test('the acceptance harness says it is hand-run, and can be imported without running', () => {
  // The header is the only thing standing between a reader and an hour-long networked run that
  // rewrites files, so the sentences that say so are asserted rather than trusted.
  const src = readFileSync(join(root, 'scripts/acceptance/tag-controls.py'), 'utf8');
  // WHITESPACE-COLLAPSED before matching, for the reason `validation-tests-shape` collapses: the
  // header wraps, so `DELIBERATELY DEGRADES A\nWORKING TREE` contains the sentence and not the
  // string. This assertion failed on its first run for exactly that, which is the cheapest possible
  // demonstration that a rule a reflow can break is a rule a reflow will break.
  const flat = src.replace(/\s+/g, ' ');
  for (const needed of ['HAND-RUN ONLY', 'NEVER IN CI', 'DELIBERATELY DEGRADES A WORKING TREE',
    'python3 -u']) {
    assert.ok(flat.includes(needed), `the harness header no longer says "${needed}"`);
  }
  // ARC-08-C25's property, which this file failed while carrying a control that checks it for
  // everybody else: `main()` ran at module scope and three `sys.argv` reads preceded it, so an
  // import either raised IndexError or started a network clone.
  assert.match(src, /if __name__ == '__main__':/, 'the harness runs on import');
  assert.equal(/^TAG = sys\.argv/m.test(src), false, 'the harness reads argv at module scope');
});
