import { test } from 'node:test';
import { EXPECTED_FAIL_ON_RUNNERS } from '../scripts/ci/doctor-snapshot.mjs';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

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
  // Secrets exist on the default branch; a dispatch from a topic branch would run green and empty.
  assert.match(text, /if: github\.ref == format\('refs\/heads\/\{0\}', github\.event\.repository\.default_branch\)/);
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
  'launcher', 'windows-launcher', 'secrets', 'plugin-validate',
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
    .filter((l) => /^(\.[\\/]|& powershell |[^#]*-File \.\\)bootstrap\.(sh|cmd|ps1)/.test(l));
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
  assert.ok(job.includes('scripts/ci/assert-doctor.mjs --in doctor.json '
    + `--expect-fail ${EXPECTED_FAIL_ON_RUNNERS.join(',')}`),
  'the workflow does not allow exactly the runner-expected failures');
  assert.match(job, /scripts\/ci\/doctor-snapshot\.mjs --in doctor\.json/);
  assert.match(job, /scripts\/ci\/banner-timing\.mjs --runs 5 --budget-ms 1000 --summary/);

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
  assert.match(job, /node --test[^\n]*tests\/upgrade\/upgrade\.e2e\.test\.mjs/);
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
  // PUBLISH JOB: `gh release create` is also written in the header comment, and an `indexOf` over
  // the whole file finds the prose first and compares the wrong two positions.
  const publish = release.slice(release.indexOf('\n  publish:'));
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
