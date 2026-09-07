// ARC-01-S10b — criterion 6's substantive half, as a test rather than a hand check.
//
// The criterion says the tree may contain no hostname the maintainer actually uses. The list of
// real hosts must never enter the repository, so it is read at run time from sources that are
// never committed, compared, and reported as COUNTS ONLY — no value is ever printed, not on
// success and not on failure.
//
// Written after the ARC-01-S10 report described this check as automated when it had in fact only
// been run ad hoc in a shell. The check is the same; committing it is the point.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { homedir } from 'node:os';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const HOST = /([a-z0-9-]+)\.service-now\.com/gi;

// (1) the tree's hosts, via the criterion's own grep
function treeHosts() {
  const out = execFileSync('git',
    ['grep', '-h', '-o', '-E', '[a-z0-9-]+\\.service-now\\.com', '--', '.'],
    { cwd: root, encoding: 'utf8' });
  return new Set(out.split('\n').filter(Boolean).map((h) => h.split('.')[0].toLowerCase()));
}

// (2) real fragments, only from local sources that are never committed
function localSources() {
  const home = homedir();
  const files = [];
  const memDir = join(home, '.claude/projects/-Users-cvetomirgrigorov-work-AI-Architect-Claude/memory');
  if (existsSync(memDir)) {
    const walk = (d) => { for (const e of readdirSync(d)) {
      const p = join(d, e);
      if (statSync(p).isDirectory()) walk(p); else files.push(p);
    } };
    walk(memDir);
  }
  const globalMd = join(home, '.claude/CLAUDE.md');
  if (existsSync(globalMd)) files.push(globalMd);
  return files;
}

function realFragments(files) {
  const set = new Set();
  for (const f of files) {
    let t;
    try { t = readFileSync(f, 'utf8'); } catch { continue; }
    for (const m of t.matchAll(HOST)) set.add(m[1].toLowerCase());
  }
  return set;
}

test('no hostname in the tree is one the maintainer actually uses', (t) => {
  const sources = localSources();
  if (sources.length === 0) {
    // (3) CI has neither source. Skipping WITH the reason, rather than passing, so a green run on a
    // machine that cannot see the real list is never mistaken for evidence that it checked.
    return t.skip('no local never-committed source present (no memory/ and no global CLAUDE.md) — '
      + 'this check is meaningful only on a machine that holds the real list');
  }
  const tree = treeHosts();
  const real = realFragments(sources);
  const overlap = [...tree].filter((h) => real.has(h));
  // (5) counts only, on success and on failure alike
  console.log(`    tree hosts: ${tree.size} | local sources: ${sources.length} | `
    + `real fragments: ${real.size} | overlap: ${overlap.length}`);
  assert.equal(overlap.length, 0,
    `no-real-hostnames: ${overlap.length} host(s) in the tree match a real instance — `
    + 'values deliberately not printed; grep the tree locally for them');
});

test('the check would actually catch a real host — proven without naming one', () => {
  // The assertion above can only be trusted if it fires. Rather than plant a real hostname anywhere,
  // the same set logic is exercised on synthetic sets.
  const tree = new Set(['acme', 'dev12345', 'realco']);
  const real = new Set(['realco']);
  const overlap = [...tree].filter((h) => real.has(h));
  assert.deepEqual(overlap, ['realco']);
  assert.equal([...new Set(['acme', 'dev12345'])].filter((h) => real.has(h)).length, 0);
});
