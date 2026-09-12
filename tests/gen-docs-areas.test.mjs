/**
 * ARC-03-S02 — the sparse checkout is DERIVED, and `--check` is what keeps it derived.
 *
 * `vendor/docs-areas.txt` lists the corpus areas the citations require. Widen it by hand and the
 * sparse checkout stops matching the grounding rule; narrow it and a cited page is not on disk.
 * `npm run lint` runs `--check` on every push, so the happy path has been exercised since the story
 * merged — but the FAILING path, the one the whole generator exists for, was asserted by nothing
 * (acceptance item B03-01), and neither was the message it prints.
 *
 * THE PLAN'S PROPOSED CHECK DOES NOT WORK, and finding out why shaped this file. It said to run
 * `--check` with `cwd` set to a temp directory. The script does not read `cwd`: it resolves its
 * root from its OWN location —
 *
 *     const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
 *
 * — so it would have scanned this repository no matter where it was invoked from, and the test
 * would have passed while proving nothing about a stale file.
 *
 * So the fixture is a small TREE with the script copied into it at the same relative path. Then the
 * script's own resolution puts its root at the temp directory and the real generator runs against
 * fixture citations. `citations.mjs` is stdlib-only, which is what makes copying two files enough.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SCRIPT = 'scripts/gen-docs-areas.mjs';
const CITATIONS = 'tools/snowarch/lib/docs/citations.mjs';
const OUT = 'vendor/docs-areas.txt';
/** Proof of WHERE the copied script resolved its root. Never present in the real checkout. */
const MARKER = '.gen-docs-areas-fixture-root';

/** A tree the real script can run in: itself, its one import, a scan root, and the output file. */
function fixture(t, { skill, areasFile }) {
  const dir = mkdtempSync(join(tmpdir(), 'snowarch-areas-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  for (const rel of [SCRIPT, CITATIONS]) {
    mkdirSync(join(dir, dirname(rel)), { recursive: true });
    copyFileSync(join(root, rel), join(dir, rel));
  }
  mkdirSync(join(dir, '.claude/skills/fixture'), { recursive: true });
  writeFileSync(join(dir, '.claude/skills/fixture/SKILL.md'), skill);
  mkdirSync(join(dir, 'vendor'), { recursive: true });
  if (areasFile !== null) writeFileSync(join(dir, OUT), areasFile);
  // THE PRECONDITION THE WHOLE COPY EXISTS FOR: a marker this repository does not have. If the
  // copied script ever resolved its root to the real checkout — the failure this fixture is built
  // to prevent, and the one the plan's `cwd`-based proposal would have walked into — the marker
  // would be absent and every case below would be asserting things about the wrong tree.
  writeFileSync(join(dir, MARKER), 'fixture root\n');
  assert.equal(existsSync(join(root, MARKER)), false,
    `${MARKER} exists in the real repository — the marker no longer distinguishes the trees`);
  return dir;
}

/** The script, as a user runs it. Never throws: the exit code is the thing under test. */
function run(dir, args) {
  try {
    const stdout = execFileSync(process.execPath, [join(dir, SCRIPT), ...args],
      { cwd: dir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    return { code: 0, stdout, stderr: '' };
  } catch (e) {
    return { code: e.status ?? 1, stdout: String(e.stdout ?? ''), stderr: String(e.stderr ?? '') };
  }
}

const CITES = (...areas) => areas
  .map((a) => `Grounding: \`vendor/ServiceNowDocs/markdown/${a}/page.md\`\n`).join('');

test('AC 2 — a citation to an area the committed list lacks is exit 2, naming the area', (t) => {
  const dir = fixture(t, {
    skill: CITES('administer', 'release-notes'),
    areasFile: 'markdown/administer\n',                 // release-notes missing on purpose
  });
  const r = run(dir, ['--check']);

  assert.equal(r.code, 2, `expected exit 2, got ${r.code}: ${r.stderr}`);
  assert.match(r.stderr, /vendor\/docs-areas\.txt is stale: \+release-notes/);
  assert.match(r.stderr, /run: node scripts\/gen-docs-areas\.mjs --write/);
  // The file is NOT repaired by `--check` — that is `--write`'s job, and a check that edited the
  // tree would be a check nobody could run on a clean CI tree.
  assert.equal(readFileSync(join(dir, OUT), 'utf8'), 'markdown/administer\n');
});

test('AC 2 — an area no longer cited is reported too, with a minus', (t) => {
  const dir = fixture(t, {
    skill: CITES('administer'),
    areasFile: 'markdown/administer\nmarkdown/build\n',
  });
  const r = run(dir, ['--check']);
  assert.equal(r.code, 2);
  assert.match(r.stderr, /is stale: -build/);
});

test('AC 2 — the matching case is exit 0, and says how many areas', (t) => {
  // Both directions: without this, a `--check` that always failed would pass the two above.
  const dir = fixture(t, {
    skill: CITES('administer', 'build'),
    areasFile: 'markdown/administer\nmarkdown/build\n',
  });
  const r = run(dir, ['--check']);
  assert.equal(r.code, 0, `expected exit 0, got ${r.code}: ${r.stderr}`);
  assert.match(r.stdout, /vendor\/docs-areas\.txt up to date \(2 areas\)/);
});

test('AC 2 — `--write` repairs it, and a `--check` straight after passes', (t) => {
  const realListBefore = readFileSync(join(root, OUT), 'utf8');
  const dir = fixture(t, { skill: CITES('administer', 'release-notes'), areasFile: 'markdown/administer\n' });
  const w = run(dir, ['--write']);
  assert.equal(w.code, 0);
  assert.match(w.stdout, /written \(2 areas\)/);
  assert.equal(readFileSync(join(dir, OUT), 'utf8'), 'markdown/administer\nmarkdown/release-notes\n');
  assert.equal(run(dir, ['--check']).code, 0, 'the file --write produced does not satisfy --check');
  // ...and the positive half of the precondition: the script resolved INTO the fixture, and the
  // REAL list is byte-identical afterwards. `--write` is the one case here that writes anything, so
  // it is the one that could have written to this checkout. (The first version of this assertion
  // claimed the real list contains `release-notes`; it does not — an assumption about the tree,
  // caught by making it.)
  assert.ok(existsSync(join(dir, MARKER)), 'the marker vanished');
  assert.equal(readFileSync(join(root, OUT), 'utf8'), realListBefore,
    'the fixture run modified the real vendor/docs-areas.txt');
});

test('AC 2 — neither flag, or both, is a usage error and exit 2', (t) => {
  const dir = fixture(t, { skill: CITES('administer'), areasFile: 'markdown/administer\n' });
  for (const args of [[], ['--check', '--write']]) {
    const r = run(dir, args);
    assert.equal(r.code, 2, `${JSON.stringify(args)} did not exit 2`);
    assert.match(r.stderr, /usage: node scripts\/gen-docs-areas\.mjs \(--check \| --write\)/);
  }
});

test('AC 1 — the committed file is LF, sorted, one area per line, with a trailing newline', () => {
  // The real one, not a fixture: AC 1's claim is about what is in the repository.
  const text = readFileSync(join(root, OUT), 'utf8');
  assert.equal(text.includes('\r'), false, 'the committed list has CRLF');
  assert.ok(text.endsWith('\n'), 'no trailing newline');
  const lines = text.split('\n').filter(Boolean);
  assert.deepEqual(lines, [...lines].sort(), 'the committed list is not sorted');
  assert.deepEqual(lines, [...new Set(lines)], 'the committed list repeats an area');
  for (const l of lines) assert.match(l, /^markdown\/[A-Za-z0-9_.-]+$/, `not an area line: ${l}`);
  // Non-vacuous, and the number is the one the recipe test counts.
  assert.ok(lines.length > 10, `only ${lines.length} areas — the file is not the real one`);
});
