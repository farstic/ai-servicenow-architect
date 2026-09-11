/**
 * ARC-09-C12a — no test spells the version of record.
 *
 * The release script writes the new version into the manifests and THEN runs the post-write gates,
 * so any assertion that hard-codes today's version fails on the release commit itself. That is not
 * hypothetical: the v2.0.0-rc.0 rehearsal got through the preflight, all six gates and the writes,
 * and then stopped at
 *
 *     release: version-consistency failed after the writes — rolled back, nothing was committed
 *
 * because `tests/version-consistency.test.mjs` asserted the literal `root 2.0.0-dev`. The rollback
 * worked and nothing was committed, but the real 2.0.0 cut would have failed identically — and
 * `release-dryrun` could never have caught it, because `--dry-run` stops before the writes.
 *
 * Two more were found the same way (`CONTRACT.version` and the handshake's `serverInfo.version`).
 * This file is what stops the next one being found by a release.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const rootVersion = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version;

/**
 * Files where the version string is INPUT rather than an expectation.
 *
 * Each one builds a fixture that carries a version — a fake manifest, a fake tag, a planted
 * `CLAUDE.md` marker — and the string is what the fixture is made of. They are listed by name with
 * the reason, never matched by a pattern, so adding one is a decision somebody wrote down.
 */
const FIXTURE_FILES = {
  'tests/claude-md.test.mjs': 'plants marker lines in a synthetic CLAUDE.md to prove the counter',
  'tests/release.test.mjs': 'builds release fixtures whose manifests carry a starting version',
  'tests/release-workflow.test.mjs': 'builds a tagged fixture tree',
};

// NOT this file: it reads the version and interpolates it, so it never spells one — and its own
// stale-entry check caught the exemption I wrote for it out of habit.
function testFiles(dir, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === 'fixtures' || entry.name === 'dist') continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) { testFiles(full, out); continue; }
    if (/\.test\.(mjs|ts)$/.test(entry.name)) out.push(relative(root, full).split('\\').join('/'));
  }
  return out;
}

/** The offending lines of one file: the version, spelled, outside a comment. */
export function literalLines(text, version) {
  const hits = [];
  text.split('\n').forEach((line, i) => {
    if (/^\s*(\/\/|\*|\/\*|#)/.test(line)) return;      // in a comment it is the lesson
    if (line.includes(version)) hits.push(i + 1);
  });
  return hits;
}

test('no assertion spells the current version of record (ARC-09-C12a)', () => {
  const offenders = [];
  for (const rel of [...testFiles(join(root, 'tests')), ...testFiles(join(root, 'packages'))]) {
    if (rel in FIXTURE_FILES) continue;
    const lines = literalLines(readFileSync(join(root, rel), 'utf8'), rootVersion);
    if (lines.length > 0) offenders.push(`${rel}:${lines.join(',')}`);
  }
  assert.deepEqual(offenders, [], `these spell "${rootVersion}" — read it from package.json instead. `
    + 'The release script writes the new version before the post-write gates run, so a literal here '
    + 'fails on the release commit itself (ARC-09-C12: the v2.0.0-rc.0 rehearsal)');
});

test('the sweep would catch a planted literal, and ignores one in a comment (ARC-09-C12a)', () => {
  // The negative control. Without it this file passes for ever the moment the scan stops finding
  // anything — including if `rootVersion` were read wrongly and became an empty string.
  const planted = `it('x', () => { expect(CONTRACT.version).toBe('${rootVersion}'); });`;
  assert.deepEqual(literalLines(planted, rootVersion), [1]);
  assert.deepEqual(literalLines(`// the version was ${rootVersion} when this was written`, rootVersion), []);
  assert.ok(rootVersion.length > 0 && /\d/.test(rootVersion), 'the version being searched for is not a version');
});

test('every allow-listed fixture file still contains the version it is listed for (ARC-09-C12a)', () => {
  // An exemption that outlives its reason is how a list stops meaning anything.
  const stale = Object.keys(FIXTURE_FILES).filter((rel) =>
    literalLines(readFileSync(join(root, rel), 'utf8'), rootVersion).length === 0);
  assert.deepEqual(stale, [], 'these no longer spell the version — remove them from FIXTURE_FILES');
});
