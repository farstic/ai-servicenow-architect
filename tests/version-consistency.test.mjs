// ARC-01-S06 — one version of record.
// P-12 counted five version counters in the engine and P-19 five more in the server. This test
// exists so that number can never grow back: the three manifests and the CLAUDE.md marker line are
// asserted equal, and the mutation cases prove the assertions actually bite.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const readText = (p) => readFileSync(join(root, p), 'utf8');
const readJson = (p) => JSON.parse(readText(p));

const MANIFESTS = ['package.json', 'packages/snowarch/package.json', 'tools/snowarch/package.json'];
const SEMVER = /^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/;
const MARKER = /^\*\*Version:\*\* (\S+) /;

const rootVersion = readJson('package.json').version;

// The checks below are written against an injected file map so the mutation cases can run the SAME
// code on a modified copy. A negative case that exercises a different code path proves nothing.
function checkManifests(versions) {
  const bad = Object.entries(versions).filter(([, v]) => v !== versions['package.json']);
  if (bad.length) {
    const [file, v] = bad[0];
    throw new Error(`${file} version ${v} != root ${versions['package.json']}`);
  }
  for (const [file, v] of Object.entries(versions)) {
    if (!SEMVER.test(v)) throw new Error(`${file} version ${v} is not semver`);
  }
}

function checkMarker(claudeMd, expected) {
  const lines = claudeMd.split('\n');
  const hits = lines.filter((l) => MARKER.test(l));
  if (hits.length !== 1) {
    throw new Error(`CLAUDE.md: expected exactly one "**Version:**" line, found ${hits.length}`);
  }
  const found = hits[0].match(MARKER)[1];
  if (found !== expected) throw new Error(`CLAUDE.md marker ${found} != root ${expected}`);
  // The heading must not carry a second counter. The marker line itself legitimately says
  // "Supersedes engine v2.8.0 and snow-mcp 1.0.0", so it is excluded from this scan.
  const strays = lines.slice(0, 20)
    .filter((l) => !MARKER.test(l))
    .filter((l) => /v?\d+\.\d+\.\d+/.test(l));
  if (strays.length) throw new Error(`CLAUDE.md: version token outside the marker line: ${strays[0].slice(0, 80)}`);
}

test('all three manifests carry the same semver version', () => {
  checkManifests(Object.fromEntries(MANIFESTS.map((m) => [m, readJson(m).version])));
});

test('CLAUDE.md carries exactly one marker line and it matches the root version', () => {
  checkMarker(readText('CLAUDE.md'), rootVersion);
});

test('mutation: a workspace version that drifts is caught, with both versions named', () => {
  const versions = Object.fromEntries(MANIFESTS.map((m) => [m, readJson(m).version]));
  // DERIVED, never typed (ARC-09-C12). This assertion used to spell `root 2.0.0-dev`, and the
  // release script writes the new version BEFORE it runs this gate — so the first real release
  // failed here, after the writes, on a test about somebody else's drift. The rehearsal for
  // v2.0.0-rc.0 hit it exactly: `release: version-consistency failed after the writes — rolled
  // back, nothing was committed`. A test that hard-codes the version of record is a test that
  // fails on the one day it matters most.
  const drifted = `${rootVersion}-drifted`;
  versions['packages/snowarch/package.json'] = drifted;
  assert.throws(() => checkManifests(versions),
    new RegExp(`packages/snowarch/package\\.json version ${drifted.replace(/[.+]/g, '\\$&')}`
      + ` != root ${rootVersion.replace(/[.+]/g, '\\$&')}`));
});

test('mutation: a deleted marker line is caught, and the message says how many were found', () => {
  const stripped = readText('CLAUDE.md').split('\n').filter((l) => !MARKER.test(l)).join('\n');
  assert.throws(() => checkMarker(stripped, rootVersion),
    /CLAUDE\.md: expected exactly one "\*\*Version:\*\*" line, found 0/);
});

test('mutation: a duplicated marker line is caught too', () => {
  const lines = readText('CLAUDE.md').split('\n');
  const i = lines.findIndex((l) => MARKER.test(l));
  lines.splice(i + 1, 0, lines[i]);
  assert.throws(() => checkMarker(lines.join('\n'), rootVersion), /found 2/);
});

test('mutation: a version token smuggled back into the heading is caught', () => {
  const lines = readText('CLAUDE.md').split('\n');
  lines[0] = '# CLAUDE.md — ServiceNow Architecture Engine v2.8.0';
  assert.throws(() => checkMarker(lines.join('\n'), rootVersion), /version token outside the marker line/);
});

/**
 * The FOURTH field, learned in ARC-09-S01.
 *
 * `docs/README-head.md` opens with `**v<x.y.z>** · Apache-2.0 · …`, and `README.md` is generated
 * from it — so a release that moved the three manifests and the marker and left this behind would
 * ship a README announcing the previous version, with nothing failing. The release script writes
 * it; this is what makes that a requirement rather than a courtesy.
 */
const HEAD_VERSION = /^\*\*v(\S+)\*\* · /m;

function checkHead(head, expected) {
  const hits = head.split('\n').filter((l) => HEAD_VERSION.test(l));
  if (hits.length !== 1) {
    throw new Error(`docs/README-head.md: expected exactly one "**v<x.y.z>** ·" line, found ${hits.length}`);
  }
  const found = hits[0].match(HEAD_VERSION)[1];
  if (found !== expected) throw new Error(`docs/README-head.md v${found} != root ${expected}`);
}

test('the README head carries the root version, and README.md renders it', () => {
  checkHead(readText('docs/README-head.md'), rootVersion);
  // The generated file, too: the head is the source, but the head being right while the rendered
  // README is stale is exactly the state `gen-readme --check` exists to prevent — asserted here as
  // well because this is the test a release runs after writing.
  assert.ok(readText('README.md').includes(`**v${rootVersion}**`),
    'README.md does not carry the root version — run npm run gen');
});

test('mutation: a head left behind at the previous version is caught, with both versions named', () => {
  const stale = readText('docs/README-head.md').replace(HEAD_VERSION, '**v1.0.0** · ');
  assert.throws(() => checkHead(stale, rootVersion), /docs\/README-head\.md v1\.0\.0 != root/);
});

test('docs/CHANGELOG.md top heading is not ahead of the root version', (t) => {
  if (!existsSync(join(root, 'docs/CHANGELOG.md'))) return t.skip('no docs/CHANGELOG.md');
  const text = readText('docs/CHANGELOG.md');
  // The imported engine changelog uses "## v2.7.6 — ...", not the "## [x.y.z]" the story assumed.
  // Accept both, or this guard would match nothing and pass without checking anything.
  const m = text.match(/^#{1,3} *\[?v?(\d+)\.(\d+)\.(\d+)\]?/m);
  if (!m) return t.skip('no version heading found in docs/CHANGELOG.md');
  const top = m.slice(1, 4).map(Number);
  const rootTriple = rootVersion.split('-')[0].split('.').map(Number);
  const cmp = top[0] - rootTriple[0] || top[1] - rootTriple[1] || top[2] - rootTriple[2];
  if (cmp > 0) {
    // The product renumbered DOWNWARD at the merge: engine v2.8.0 -> product 2.0.0. The imported
    // changelog therefore legitimately reads ahead of the root until ARC-09 regenerates it. Skip
    // only while the file is provably still the un-regenerated import -- it names the predecessor
    // repository -- so this cannot mask a real regression later.
    const isStaleImport = text.includes('farstic/claude-servicenow-live');
    if (isStaleImport) {
      return t.skip(`imported engine changelog is ahead (v${top.join('.')} > ${rootVersion}) `
        + 'because the product renumbered downward at the merge; ARC-09 regenerates it');
    }
  }
  assert.ok(cmp <= 0, `docs/CHANGELOG.md top heading v${top.join('.')} is ahead of root ${rootVersion}`);
});

// ─── ARC-01-S05 — the lockfile and the one override that matters (B01-03, B01-04) ─────────────
//
// Both criteria were verified by hand at story time and by nothing since. A lockfile regeneration
// is exactly the event that would undo either, and it is also the event nobody reviews line by
// line — which is what makes these worth asserting rather than re-running.

test('AC 5 — the lockfile is v3 and links both workspaces', () => {
  const lock = JSON.parse(readFileSync(join(root, 'package-lock.json'), 'utf8'));
  assert.equal(lock.lockfileVersion, 3, 'lockfileVersion moved — npm changed, or the file was hand-edited');

  // The criterion said "workspace links `packages/snowarch,tools/snowarch`", which is the shape a
  // person reads. What the file actually holds is two `link: true` entries under `node_modules/`
  // whose `resolved` is the workspace directory — so that is what is asserted, by resolved path
  // rather than by key, since the package NAME is free to change and the directory is not.
  const links = Object.entries(lock.packages)
    .filter(([, v]) => v?.link === true)
    .map(([, v]) => v.resolved)
    .sort();
  assert.deepEqual(links, ['packages/snowarch', 'tools/snowarch'],
    'the workspace links are not the two directories this repository has');

  // ARC-01-C3: the half I dropped without saying so. `npm version` keeps the three in step; a hand
  // edit of one package.json is exactly the drift nobody reads, and the lockfile is where it shows.
  const rootVersion = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version;
  for (const dir of ['packages/snowarch', 'tools/snowarch']) {
    assert.equal(lock.packages[dir]?.version, rootVersion,
      `${dir} is ${lock.packages[dir]?.version} in the lockfile, root is ${rootVersion}`);
  }
});

test('AC 8 — minimatch resolves to 10.x everywhere, and the override is why', () => {
  // ARC-01-S05 pinned this because the transitive tree carried an old major with a known ReDoS.
  // The override is in the root manifest; the lockfile is where it either took or did not.
  const manifest = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
  assert.match(String(manifest.overrides?.minimatch ?? ''), /^\^?10\./,
    'the root override no longer pins minimatch 10.x');

  const lock = JSON.parse(readFileSync(join(root, 'package-lock.json'), 'utf8'));
  const versions = [...new Set(Object.entries(lock.packages)
    .filter(([k]) => k.endsWith('node_modules/minimatch'))
    .map(([, v]) => v.version)
    .filter(Boolean))].sort();
  assert.ok(versions.length > 0, 'minimatch is not in the lockfile at all — has the scan broken?');
  const old = versions.filter((v) => !v.startsWith('10.'));
  assert.deepEqual(old, [],
    `the lockfile resolves minimatch ${old.join(', ')} as well as 10.x — the override did not take`);
});

// ─── ARC-01-S12 AC 2 (acceptance item B01-07, second half) ───────────────────────────────────

test('AC 2 — the Product constants table has one row per engine.config.json leaf key', () => {
  // The half of B01-07 the first pass missed entirely: the row covered AC 1 (the ledger) and said
  // nothing about AC 2, which is a REAL GAP rather than a stale criterion — measured on the previous
  // head, `docs/ARCHITECTURE.md` had no such table and `docs.upstream`, `roster.utility` and
  // `mcp.permissions` appeared nowhere in `docs/` at all.
  //
  // Both directions, because either alone rots: a key added without a row is undocumented, and a row
  // left behind by a key that went is a document describing a product nobody has.
  const config = JSON.parse(readFileSync(join(root, 'engine.config.json'), 'utf8'));
  const leaves = [];
  const walk = (o, prefix) => {
    for (const [k, v] of Object.entries(o)) {
      if (k === '$schema') continue;
      const path = prefix ? `${prefix}.${k}` : k;
      if (v && typeof v === 'object' && !Array.isArray(v)) walk(v, path);
      else leaves.push(path);
    }
  };
  walk(config, '');
  assert.ok(leaves.length >= 15, `only ${leaves.length} leaf key(s) — the flatten is wrong`);

  const doc = readFileSync(join(root, 'docs/ARCHITECTURE.md'), 'utf8');
  const from = doc.indexOf('## Product constants');
  assert.ok(from > -1, 'docs/ARCHITECTURE.md has no Product constants section');
  const section = doc.slice(from, doc.indexOf('\n## ', from + 1));
  const rows = [...section.matchAll(/^\| `([^`]+)` \|/gm)].map((m) => m[1]);

  const undocumented = leaves.filter((k) => !rows.includes(k)).sort();
  assert.deepEqual(undocumented, [],
    `${undocumented.length} leaf key(s) have no row: ${undocumented.join(', ')}`);

  const orphaned = rows.filter((k) => !leaves.includes(k)).sort();
  assert.deepEqual(orphaned, [],
    `${orphaned.length} row(s) name a key the file does not have: ${orphaned.join(', ')}`);

  // The table names each key ONCE — a duplicated row is two descriptions of one thing.
  assert.deepEqual(rows, [...new Set(rows)], 'a key appears twice in the table');

  // And it carries no VALUES: the file is the source, and a value copied into prose is a second
  // source that drifts. The pin is the one worth checking, being the longest and most copyable.
  assert.equal(section.includes(config.docs.pin), false,
    'the table repeats the docs pin — the file is the source, not the prose');
});
