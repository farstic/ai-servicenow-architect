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
  'launcher', 'windows-launcher', 'secrets', 'plugin-validate',
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
  assert.deepEqual(jobNames, KNOWN_JOBS, 'a job was added or renamed — protection lists 42 contexts');

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

test('the run is cancelled when superseded, so thirteen cells are not paid for twice', () => {
  const ci = wf('ci.yml');
  assert.match(ci, /concurrency:\n\s+group: ci-\$\{\{ github\.ref \}\}\n\s+cancel-in-progress: true/);
});
