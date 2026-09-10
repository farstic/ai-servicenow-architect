import { test } from 'node:test';
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

test('no workflow can merge, and none reads a repository secret', () => {
  for (const f of readdirSync(join(root, '.github/workflows'))) {
    const text = wf(f);
    assert.ok(!/gh pr merge|--auto\b/.test(text), `${f} can merge`);
    const secrets = [...text.matchAll(/secrets\.([A-Z_]+)/g)].map((m) => m[1]);
    assert.deepEqual([...new Set(secrets)], [], `${f} reads a repository secret`);
  }
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

test('the run is cancelled when superseded, so thirteen cells are not paid for twice', () => {
  const ci = wf('ci.yml');
  assert.match(ci, /concurrency:\n\s+group: ci-\$\{\{ github\.ref \}\}\n\s+cancel-in-progress: true/);
});
