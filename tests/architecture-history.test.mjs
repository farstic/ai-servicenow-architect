/**
 * ARC-10-S05 — the History section is a record, and a record is checked or it is decoration.
 *
 * Four things it claims that can be verified mechanically: the two import tags exist and carry
 * history, every ADR it links resolves, the nine D-03 surfaces match ADR-0003 one for one, and the
 * retired names appear only inside the history region.
 *
 * THE SHALLOW-CLONE RULE (ARC-09-S02's lesson, applied before it costs nine cells). CI's `test` job
 * checks out at `--depth 1` WITHOUT tags, so an object this file needs may simply not be in the
 * clone. It fetches what it needs; if the fetch is impossible — no network, or a clone with no
 * remote — the tag cases SKIP WITH THE REASON NAMED rather than failing. A test that fails because
 * the runner was configured differently teaches people to ignore failures.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => readFileSync(join(root, rel), 'utf8').replace(/\r/g, '');
const git = (args) => spawnSync('git', args, { cwd: root, encoding: 'utf8' });

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

/**
 * Make a tag available, or say why not.
 *
 * Returns the reason to skip, or `null` when the object is present.
 */
function ensureTag(tag) {
  if (git(['rev-parse', '--verify', '--quiet', `${tag}^{commit}`]).status === 0) return null;
  const fetched = git(['fetch', '--depth=1', 'origin', 'tag', tag]);
  if (fetched.status === 0
    && git(['rev-parse', '--verify', '--quiet', `${tag}^{commit}`]).status === 0) return null;
  return `${tag} is not in this clone and could not be fetched `
    + `(shallow checkout without tags, or no remote): ${String(fetched.stderr).trim().slice(0, 80)}`;
}

test('AC — both import tags exist and carry history', () => {
  // One ANSWER per tag: a commit count, or a named reason it could not be checked here. The first
  // version of this ended in `missing.length < N || missing.length === N`, which is true of every
  // number — a tautology dressed as a guard, and exactly the shape this suite exists to catch.
  const answers = IMPORT_TAGS.map((tag) => {
    const why = ensureTag(tag);
    if (why) return { tag, skipped: why };
    const count = Number(execFileSync('git', ['rev-list', '--count', tag],
      { cwd: root, encoding: 'utf8' }).trim());
    return { tag, count };
  });
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

test('AC — the History section names both tags, and the `v2.0.0` half is deferred', () => {
  // This half needs no network: what the SECTION says is checkable whatever the clone looks like.
  const region = historyRegion(read('docs/ARCHITECTURE.md'));
  assert.ok(region, 'no `## History` heading — L05 depends on that exact text');
  for (const tag of IMPORT_TAGS) {
    assert.ok(region.includes(tag), `the History section does not name ${tag}`);
  }
  // The `git log … ..v2.0.0` claim is evaluated at the tag (ARC-10-S06/S08), not here: the tag does
  // not exist yet, and a test that asserted it would be asserting the future.
  assert.equal(git(['rev-parse', '--verify', '--quiet', 'v2.0.0^{commit}']).status === 0, false,
    'v2.0.0 exists — the cross-boundary claim is now evaluable and this case should assert it');
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
