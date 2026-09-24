/**
 * ARC-10-S05 — the History section is a record, and a record is checked or it is decoration.
 *
 * Four things it claims that can be verified mechanically: the two import tags exist and carry
 * history, every ADR it links resolves, the nine D-03 surfaces match ADR-0003 one for one, and the
 * retired names appear only inside the history region.
 *
 * THE SHALLOW-CLONE RULE (ARC-09-S02's lesson, applied before it costs nine cells). CI's `test` job
 * checks out at `--depth 1` WITHOUT tags, so an object this file needs may simply not be in the
 * clone. It fetches what it needs INTO A TEMPORARY REPOSITORY — never into the checkout it is
 * running in, which it only reads (see `resolveTag`) — and if the fetch is impossible, no network
 * or no remote, the tag cases SKIP WITH THE REASON NAMED rather than failing. A test that fails
 * because the runner was configured differently teaches people to ignore failures.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => readFileSync(join(root, rel), 'utf8').replace(/\r/g, '');
const git = (args) => spawnSync('git', args, { cwd: root, encoding: 'utf8' });
/** Read, never spelled: the tripwire below names the release tag this checkout is heading for. */
const rootVersion = JSON.parse(read('package.json')).version;

export const IMPORT_TAGS = ['import/engine-v2.8.0-worktree', 'import/snow-mcp-1.0.0'];

/** The `## History` region: from the heading to the next `## ` that is not a history heading. */
export function historyRegion(doc) {
  const lines = doc.split('\n');
  const start = lines.findIndex((l) => l === '## History');
  if (start === -1) return null;
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i += 1) {
    // `## The D-03 cut ledger` and `## Before <version>` are history too — L05 treats them the same
    // way, and this file must not disagree with the check it is documenting.
    if (/^## /.test(lines[i]) && !/^## (History|The D-03 cut ledger|Before \d)/.test(lines[i])) {
      end = i;
      break;
    }
  }
  return lines.slice(start, end).join('\n');
}

/** `git` in a NAMED directory, so every call site has to say which repository it means. */
const gitIn = (cwd, args) => spawnSync('git', args, { cwd, encoding: 'utf8' });

/**
 * A tag's commit count, or a named reason it could not be measured here.
 *
 * THIS TEST USED TO FETCH INTO THE DEVELOPER'S OWN REPOSITORY. `ensureTag` ran
 * `git fetch --depth=1 origin tag <tag>` with `cwd` set to REAL_ROOT — the checkout the suite is
 * running in — so on any clone lacking the import tags, running `npm test` WROTE two refs into the
 * repository under test. It was invisible on a clone that already had them, which is every clone
 * that had run the suite once, and it is the same class as a generator that writes on import: a
 * test may read the tree it runs in and must not change it.
 *
 * So the local repository is only ever READ. When the tag is not there, the fetch happens in a
 * TEMPORARY repository built for the purpose and removed afterwards — CI's `--depth 1` checkout
 * still gets a real answer, and nothing lands in anybody's refs. The remote URL is read from the
 * local clone, which is a read.
 *
 * `run` and `mkTemp` are injected so the guarantee is testable: a case can assert that no `fetch`
 * was ever issued with `cwd` equal to the repository under test. A promise in a comment is not one.
 */
export function resolveTag(tag, { at = root, run = gitIn,
  mkTemp = () => mkdtempSync(join(tmpdir(), 'snowarch-tagcheck-')),
  cleanup = (dir) => rmSync(dir, { recursive: true, force: true }) } = {}) {
  const countIn = (dir) => Number(String(run(dir, ['rev-list', '--count', tag]).stdout ?? '').trim());

  if (run(at, ['rev-parse', '--verify', '--quiet', `${tag}^{commit}`]).status === 0) {
    return { count: countIn(at), where: 'local' };
  }

  const url = String(run(at, ['remote', 'get-url', 'origin']).stdout ?? '').trim();
  if (!url) {
    return { skipped: `${tag} is not in this clone and could not be fetched `
      + '(no origin remote to fetch it from)' };
  }

  const tmp = mkTemp();
  try {
    // `-b main` because `init.defaultBranch` is a MACHINE setting (ARC-09-C14): this repository
    // never checks out a branch here — it fetches one tag — but a fixture whose branch name
    // differs between a laptop and a runner is how that rule was learned, and the sweep in
    // `precondition-asserts.test.mjs` caught this line before it left the branch.
    if (run(tmp, ['init', '-q', '-b', 'main']).status !== 0) {
      return { skipped: `${tag} is not in this clone and could not be fetched `
        + '(a temporary repository could not be created)' };
    }
    const fetched = run(tmp, ['fetch', '--depth=1', url, `+refs/tags/${tag}:refs/tags/${tag}`]);
    if (fetched.status !== 0) {
      return { skipped: `${tag} is not in this clone and could not be fetched `
        + `(shallow checkout without tags, or no network): ${String(fetched.stderr).trim().slice(0, 80)}` };
    }
    return { count: countIn(tmp), where: 'temporary clone' };
  } finally {
    cleanup(tmp);
  }
}

test('AC — both import tags exist and carry history', () => {
  // One ANSWER per tag: a commit count, or a named reason it could not be checked here. The first
  // version of this ended in `missing.length < N || missing.length === N`, which is true of every
  // number — a tautology dressed as a guard, and exactly the shape this suite exists to catch.
  const answers = IMPORT_TAGS.map((tag) => ({ tag, ...resolveTag(tag) }));
  assert.equal(answers.length, IMPORT_TAGS.length);

  const checked = answers.filter((a) => a.count !== undefined);
  for (const a of checked) assert.ok(a.count > 0, `${a.tag} resolves but has no commits`);

  const skipped = answers.filter((a) => a.skipped);
  // Not a failure, and not silence either — the reason is printed where a reader of the run sees it.
  for (const a of skipped) console.log(`    skipped: ${a.skipped}`);
  // ...and a skip is only ever the shallow-clone case. Any other reason is a real failure.
  for (const a of skipped) {
    assert.match(a.skipped, /could not be fetched/, `${a.tag} was skipped for an unexpected reason`);
  }
});

/** The release tag this checkout is heading for. Derived, never spelled (ARC-09-C12a). */
export const releaseTagOf = (version) => `v${String(version).replace(/-.*$/, '')}`;

/**
 * The cross-boundary claim, READ FROM THE SECTION rather than retyped.
 *
 * "Reading across the import boundary" states it as two runnable commands with their answers:
 *
 *     git log -- CLAUDE.md                            # reaches 2026-05-28, the engine's first commit
 *     git log -- packages/snowarch/src/server.ts      # reaches 2026-06-06, the server's
 *
 * Parsed, so the assertion is about what the document SAYS. Retyping the paths and dates here would
 * make this a test of a second copy — and a section edited to claim something else would keep
 * passing, which is the failure mode this whole file exists to prevent.
 */
export function crossBoundaryClaims(doc) {
  const region = historyRegion(doc) ?? '';
  return [...region.matchAll(/^git log -- (\S+)\s+# reaches (\d{4}-\d{2}-\d{2})/gm)]
    .map((m) => ({ path: m[1], reaches: m[2] }));
}

test('AC — the History section names both tags, and the cross-boundary claim holds at the tag', () => {
  // This half needs no network: what the SECTION says is checkable whatever the clone looks like.
  const region = historyRegion(read('docs/ARCHITECTURE.md'));
  assert.ok(region, 'no `## History` heading — L05 depends on that exact text');
  for (const tag of IMPORT_TAGS) {
    assert.ok(region.includes(tag), `the History section does not name ${tag}`);
  }

  // THE ARC-10 TRIPWIRE, and it is CONDITIONAL rather than a swap.
  //
  // It used to assert the release tag does NOT exist, so that the cut would trip it and somebody
  // would come and write the real assertion. That is fine on `develop` and fatal at the tag:
  // `release.yml`'s verify job checks the TAG out and runs `npm test`, so on the release run the
  // deferral fails by design, verify goes red, publish is skipped and the final tag is dead. A
  // rehearsal cannot see it — no tag exists in a rehearsal — so it would have been found by cutting.
  //
  // So the case answers itself instead of asking to be rewritten: deferred while the tag does not
  // resolve, and evaluating the claim the moment it does. Nothing has to land at cut time.
  const releaseTag = releaseTagOf(rootVersion);
  if (git(['rev-parse', '--verify', '--quiet', `${releaseTag}^{commit}`]).status !== 0) {
    console.log(`    deferred: ${releaseTag} does not exist here — the cross-boundary claim is `
      + 'evaluated at the tag');
    return;
  }

  // THE TAG RESOLVES. Everything below is about `<import-tag>..<release-tag>`, which needs the
  // history to be present — `release.yml` checks out at `fetch-depth: 0`, but a developer who
  // fetched just the tag into a shallow clone must get the file's own shallow-clone treatment
  // (a named skip) rather than a failure about how their clone was made.
  const shallow = git(['rev-parse', '--is-shallow-repository']).stdout.trim() === 'true';
  const missing = IMPORT_TAGS.filter((t) =>
    git(['rev-parse', '--verify', '--quiet', `${t}^{commit}`]).status !== 0);
  if (shallow || missing.length > 0) {
    console.log(`    skipped: ${releaseTag} resolves but the range cannot be walked here `
      + `(${shallow ? 'shallow clone' : `not in this clone: ${missing.join(', ')}`})`);
    return;
  }

  // 1. The range the section's claim is about is non-empty in both directions that matter: each
  //    import tag is an ANCESTOR of the release, so `git log <import-tag>..<release>` has commits.
  for (const tag of IMPORT_TAGS) {
    assert.equal(git(['merge-base', '--is-ancestor', tag, releaseTag]).status, 0,
      `${tag} is not an ancestor of ${releaseTag} — the History claims the imports were merged in`);
    const count = Number(git(['rev-list', '--count', `${tag}..${releaseTag}`]).stdout.trim());
    assert.ok(count > 0, `git log ${tag}..${releaseTag} is empty`);
  }

  // 2. ...and the two commands the section prints, run AT THE TAG, answer what it says they answer:
  //    the log reaches the named date WITH NO `--follow`, which is the whole point of the sentence.
  const claims = crossBoundaryClaims(read('docs/ARCHITECTURE.md'));
  assert.equal(claims.length, 2, `the section states ${claims.length} cross-boundary command(s), expected 2`);
  for (const { path, reaches } of claims) {
    const dates = git(['log', releaseTag, '--format=%ad', '--date=short', '--', path])
      .stdout.trim().split('\n').filter(Boolean);
    assert.ok(dates.length > 0, `git log ${releaseTag} -- ${path} reaches nothing`);
    assert.equal(dates[dates.length - 1], reaches,
      `the History says \`git log -- ${path}\` reaches ${reaches}; at ${releaseTag} it reaches `
      + `${dates[dates.length - 1]}`);
  }
});

test('AC — every ADR the History links resolves, and the link check is not vacuous', () => {
  const region = historyRegion(read('docs/ARCHITECTURE.md'));
  const links = [...region.matchAll(/\]\((decisions\/ADR-[^)]+)\)/g)].map((m) => m[1]);
  assert.ok(links.length >= 9, `only ${links.length} ADR link(s) in the History section`);
  const dead = links.filter((rel) => !existsSync(join(root, 'docs', rel)));
  assert.deepEqual(dead, [], `${dead.length} ADR link(s) resolve to nothing`);

  // The negative: the same resolver on a link that cannot exist must report it. Without this,
  // "no dead links" would stay true if the extraction silently matched nothing.
  assert.equal(existsSync(join(root, 'docs', 'decisions/ADR-9999-nope.md')), false);
});

test('AC — the nine "Not carried" surfaces are ADR-0003\'s nine, one for one', () => {
  // Parsed from the ADR rather than retyped: the History section is a RESTATEMENT, and a
  // restatement that drifts from its source is worse than a pointer to it.
  const adr = read('docs/decisions/ADR-0003-scope-cut.md');
  const decision = /\*\*The nine cuts, with their source paths\.\*\*([^\n]*)/.exec(adr);
  assert.ok(decision, 'ADR-0003 no longer states the nine cuts in the expected sentence');
  const numbered = [...decision[1].matchAll(/\((\d)\)/g)].map((m) => Number(m[1]));
  assert.deepEqual(numbered, [1, 2, 3, 4, 5, 6, 7, 8, 9],
    'the ADR sentence stopped numbering all nine as expected');

  const region = historyRegion(read('docs/ARCHITECTURE.md'));
  const rows = [...region.matchAll(/^\| (\d) \| (.+?) \| (.+?) \|$/gm)];
  assert.equal(rows.length, 9, `the History table lists ${rows.length} surfaces, not nine`);
  assert.deepEqual(rows.map((r) => Number(r[1])), [1, 2, 3, 4, 5, 6, 7, 8, 9]);

  // Every path the ADR names appears in the row with the same number. Items 8 and 9 are the
  // engine's and name their files inside a longer sentence, which is why the comparison is on the
  // BACKTICKED paths rather than on the prose around them.
  const adrItems = decision[1].split(/\(\d\)/).slice(1).map((s) => s.trim());
  assert.equal(adrItems.length, 9, `the ADR sentence split into ${adrItems.length} items`);
  for (let i = 0; i < adrItems.length; i += 1) {
    for (const [, path] of adrItems[i].matchAll(/`([^`]+)`/g)) {
      assert.ok(rows[i][2].includes(path),
        `D-03 item ${i + 1}: the History row does not name ${path}`);
    }
  }
});

test('AC — the retired names appear only inside the history region', () => {
  const doc = read('docs/ARCHITECTURE.md');
  const region = historyRegion(doc);
  const outside = doc.replace(region, '');
  // Built from the glossary's own rows rather than spelled here — a file that writes a retired name
  // becomes a finding in the sweep that forbids it, and this one is not a detector.
  const names = [...region.matchAll(/^\| `([^`]+)` \| .*<!-- retired-name: historical -->/gm)]
    .map((m) => m[1]);
  assert.ok(names.length >= 4, `only ${names.length} marked glossary row(s) — the parse is stale`);
  const leaked = names.filter((n) => outside.includes(n));
  assert.deepEqual(leaked, [], `${leaked.length} retired name(s) outside the History region`);
});

// ─── The repository under test is READ, never written ──────────────────────────────────────────
//
// `ensureTag` used to run `git fetch --depth=1 origin tag <tag>` with `cwd` set to REAL_ROOT, so on
// any clone lacking the import tags, `npm test` wrote two refs into the developer's own repository.
// Invisible on a clone that already had them — which is every clone that had run the suite once —
// and the same class as a generator that writes on import: a test may read the tree it runs in and
// must not change it.
//
// The guarantee is asserted rather than promised: `run` is injected, every invocation is recorded,
// and the cases below ask what was issued and WHERE.

/** A recording stub: answers by command, and keeps every `(cwd, args)` it was given. */
function recorder({ has = false, url = 'git@example.invalid:o/r.git', fetchOk = true } = {}) {
  const calls = [];
  const run = (cwd, args) => {
    calls.push({ cwd, args });
    if (args[0] === 'rev-parse') return { status: has ? 0 : 1, stdout: '' };
    if (args[0] === 'remote') return { status: 0, stdout: `${url}\n` };
    if (args[0] === 'init') return { status: 0, stdout: '' };
    if (args[0] === 'fetch') return { status: fetchOk ? 0 : 128, stdout: '', stderr: 'fatal: no' };
    if (args[0] === 'rev-list') return { status: 0, stdout: '412\n' };
    return { status: 0, stdout: '' };
  };
  return { run, calls, fetches: () => calls.filter((c) => c.args[0] === 'fetch') };
}

const TMP = '/tmp/a-temporary-repository';
const opts = (r, over = {}) => ({ at: '/the/repo/under/test', run: r.run,
  mkTemp: () => TMP, cleanup: () => {}, ...over });

test('ARC-10 — a tag that is already here is COUNTED, and nothing is fetched at all', () => {
  const r = recorder({ has: true });
  const got = resolveTag('import/x', opts(r));
  assert.equal(got.count, 412);
  assert.equal(got.where, 'local');
  assert.deepEqual(r.fetches(), [], 'a tag that is present was fetched anyway');
});

test('ARC-10 — a missing tag is fetched into a TEMPORARY repository, never the one under test', () => {
  const r = recorder({ has: false });
  const got = resolveTag('import/x', opts(r));
  assert.equal(got.count, 412);
  assert.equal(got.where, 'temporary clone');

  // THE GUARANTEE, and the reason this test exists: a fetch happened, and not here.
  assert.equal(r.fetches().length, 1, 'the missing tag was not fetched at all');
  assert.equal(r.fetches()[0].cwd, TMP);
  for (const c of r.calls) {
    if (c.cwd === '/the/repo/under/test') {
      assert.ok(['rev-parse', 'remote', 'rev-list'].includes(c.args[0]),
        `the repository under test was given a write command: git ${c.args.join(' ')}`);
    }
  }
});

test('ARC-10 — no remote is a named skip, and still writes nothing', () => {
  const r = recorder({ has: false, url: '' });
  const got = resolveTag('import/x', opts(r));
  assert.match(got.skipped, /could not be fetched/, 'the skip does not match the caller\'s guard');
  assert.match(got.skipped, /no origin remote/);
  assert.deepEqual(r.fetches(), [], 'a fetch was attempted with no remote to fetch from');
});

test('ARC-10 — a fetch that fails is deferred with the reason, not a failure', () => {
  const r = recorder({ has: false, fetchOk: false });
  const got = resolveTag('import/x', opts(r));
  assert.equal(got.count, undefined, 'a failed fetch produced a count');
  assert.match(got.skipped, /could not be fetched/);
  assert.match(got.skipped, /no network/);
});

test('ARC-10 — the temporary repository is removed, including when the fetch fails', () => {
  for (const fetchOk of [true, false]) {
    const removed = [];
    const r = recorder({ has: false, fetchOk });
    resolveTag('import/x', opts(r, { cleanup: (d) => removed.push(d) }));
    assert.deepEqual(removed, [TMP], `the temp repository leaked with fetchOk=${fetchOk}`);
  }
});
