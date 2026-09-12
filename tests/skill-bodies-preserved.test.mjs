/**
 * ARC-02 README R1 / S01 AC 2 — no body content was lost when the roster moved under `.claude/`.
 *
 * THE CRITERION IS NOT A COUNT, and that is the whole finding (acceptance item B02-01). It was
 * written as `bodies identical: 65/65`, amended to `62/65` when ARC-03 repaired three dead
 * citations, and measures **23/65** today — because the engine has legitimately changed since: the
 * `## Triggers` sections moved out of the descriptions, governance moved into `governance/`, agents
 * stopped re-reading their persona skill, and a retired table name was swept. A number that has
 * gone 65 → 62 → 23 will keep moving, and each move would look like a regression.
 *
 * What the criterion MEANS is that nothing was lost, and that means every difference is
 * ATTRIBUTABLE. So the assertion is a map — file → the recorded change that explains it — and it
 * runs in both directions, the ratchet shape this repository uses everywhere else:
 *
 *   forward   a body that differs and is not listed is a FINDING
 *   backward  a listed file that no longer differs is removed, not kept
 *
 * Without the second direction the map becomes a list of files somebody once edited.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const TAG = 'import/engine-v2.8.0-worktree';
const SCRIPT = 'scripts/validation/compare-skill-bodies.mjs';
const MAP = 'tests/fixtures/skill-body-attribution.json';

const git = (args, cwd = root) =>
  execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });

/** The tag is absent in a shallow clone, and a test that cannot see it must say so, not pass. */
const tagPresent = () => {
  try { git(['rev-parse', '--verify', `${TAG}^{commit}`]); return true; } catch { return false; }
};

test('R1 — every body that differs from the import tag is attributable, and nothing else differs', (t) => {
  if (!tagPresent()) {
    t.skip(`${TAG} is not in this clone — a shallow checkout cannot answer this`);
    return;
  }
  const work = mkdtempSync(join(tmpdir(), 'snowarch-import-'));
  t.after(() => {
    try { git(['worktree', 'remove', '--force', work]); } catch { /* already gone */ }
    rmSync(work, { recursive: true, force: true });
  });
  git(['worktree', 'add', '--detach', work, TAG, '--quiet']);
  assert.ok(existsSync(join(work, '.claude')), 'the import worktree has no .claude tree');

  // The script is the ONE definition of "differs": it strips frontmatter and normalises the
  // rewritten path tokens, so a raw file comparison here would report differences it does not —
  // a second definition, and the first thing a second definition does is disagree. It exits
  // non-zero when anything differs, which is right for a gate and means the result arrives in the
  // throw. (It used to print only the first ten differences; that truncation is removed in this
  // commit, or this list would have been silently short.)
  const compare = () => {
    try {
      const stdout = execFileSync(process.execPath,
        [join(root, SCRIPT), join(work, '.claude'), join(root, '.claude')],
        { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
      return { stdout, stderr: '' };
    } catch (e) {
      return { stdout: String(e.stdout ?? ''), stderr: String(e.stderr ?? '') };
    }
  };
  const { stdout: out, stderr } = compare();
  const counted = /bodies identical: (\d+)\/(\d+)/.exec(out);
  assert.ok(counted, `the comparison printed no count:\n${out}${stderr}`);
  const [, same, total] = counted.map(Number);
  const differing = stderr.split('\n')
    .filter((l) => l.startsWith('BODY DIFFERS: ')).map((l) => l.slice('BODY DIFFERS: '.length));

  const map = JSON.parse(readFileSync(join(root, MAP), 'utf8'));
  const listed = Object.keys(map.files).sort();

  // The count is EVIDENCE, not an assertion: it must agree with the map's size, which is the only
  // thing about it that can be checked without freezing a number that legitimately moves.
  assert.equal(total - same, listed.length,
    `${total - same} bodies differ but ${listed.length} are listed — re-run the comparison and attribute the difference`);

  // Both directions, against the script's own answer.
  assert.equal(differing.length, total - same,
    'the printed list is shorter than the count — is the truncation back?');
  const unlisted = differing.filter((rel) => !(rel in map.files)).sort();
  assert.deepEqual(unlisted, [],
    `${unlisted.length} body(ies) differ from the import and are not attributed in ${MAP}:\n  ${unlisted.join('\n  ')}`);
  const stale = listed.filter((rel) => !differing.includes(rel));
  assert.deepEqual(stale, [],
    `${stale.length} listed file(s) no longer differ from the import — remove them from ${MAP}`);

  // Every attribution names a cause the map itself defines. A free-text reason is a reason nobody
  // can check; a cause key that is not in `_causes` is a typo or an invention.
  const causes = Object.keys(map._causes);
  assert.ok(causes.length >= 4, 'the cause list is too short to be the real one');
  for (const [rel, why] of Object.entries(map.files)) {
    assert.ok(Array.isArray(why) && why.length > 0, `${rel} has no attribution`);
    for (const c of why) assert.ok(causes.includes(c), `${rel}: "${c}" is not a listed cause`);
  }
});

test('R1 — the assets are byte-identical, which the count CAN assert', (t) => {
  // The asset half never legitimately changed, so its number is an assertion rather than evidence.
  if (!tagPresent()) { t.skip(`${TAG} is not in this clone`); return; }
  const work = mkdtempSync(join(tmpdir(), 'snowarch-import-'));
  t.after(() => {
    try { git(['worktree', 'remove', '--force', work]); } catch { /* already gone */ }
    rmSync(work, { recursive: true, force: true });
  });
  git(['worktree', 'add', '--detach', work, TAG, '--quiet']);
  let out = '';
  try {
    out = execFileSync(process.execPath, [join(root, SCRIPT), join(work, '.claude'), join(root, '.claude')],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  } catch (e) { out = String(e.stdout ?? ''); }
  assert.match(out, /assets identical: (\d+)\/\1$/m, `an asset differs from the import:\n${out}`);
});
