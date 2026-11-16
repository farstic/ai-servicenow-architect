// Copyright 2026 Cvetomir Grigorov. Licensed under the Business Source License 1.1 (see LICENSE).
// snowarch — AI ServiceNow Architect. Not affiliated with or endorsed by ServiceNow, Inc.
// ARC-09-C250, P3 — vendor/docs-map.md, the corpus map: one row per `markdown/<area>/` folder with its title, pages
// and top `product:` values, under a header that says how to find a page. It is generated from the whole corpus at the
// pin and shipped, so an install that is sparse by choice still reads every row. Folder names are not guessable:
// Virtual Agent is `conversational-interfaces`, Security Operations `security-management`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildMap, corpusShape } from '../scripts/gen-docs-map.mjs';
import { initFixtureRepo } from '../tools/snowarch/tests/helpers/fixture-git.mjs';
import { tempDir } from '../tools/snowarch/tests/helpers/temp.mjs';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SCRIPT = join(REPO, 'scripts/gen-docs-map.mjs');
const git = (args, cwd) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: 'pipe' });
const URL_OF = (area) => `https://raw.githubusercontent.com/ServiceNow/ServiceNowDocs/australia/markdown/${area}/index.md`;
const page = (title, product) => `---\ntitle: ${title}\n${product ? `product: ${product}\n` : ''}---\n\n# ${title}\n`;

/**
 * A root with a three-area corpus at a pin, an engine.config.json naming that pin, and no map yet. `areas` adds areas of
 * its own — `{ area, llms, index }`, the title llms.txt gives it (or none) and the title of its index.md.
 */
function fixture(t, { areas = [] } = {}) {
  const root = tempDir('snowarch-c250-map-', t);
  const corpus = join(root, 'vendor/ServiceNowDocs');
  const put = (rel, text) => { mkdirSync(dirname(join(corpus, rel)), { recursive: true }); writeFileSync(join(corpus, rel), text); };
  mkdirSync(corpus, { recursive: true });
  initFixtureRepo((args) => git(args, corpus), corpus, ['-q', '-b', 'australia']);
  const more = areas.filter((a) => a.llms).map((a) => `- [${a.llms}](${URL_OF(a.area)})\n`).join('');
  put('llms.txt', `# ServiceNow docs\n\n- [Alpha publication](${URL_OF('alpha')})\n- [Beta, renamed](${URL_OF('beta')})\n${more}`);
  // The family word an index title opens with is a release label: alpha's two titles are the same name.
  put('markdown/alpha/index.md', page('Australia Alpha publication'));
  put('markdown/alpha/a.md', page('A', 'Product One'));
  put('markdown/alpha/b.md', page('B', 'Product One'));
  put('markdown/alpha/nested/c.md', page('C', 'Product Two'));
  put('markdown/beta/index.md', page('Beta Files'));
  put('markdown/beta/d.md', page('D', 'Piped|Name'));
  put('markdown/delta-x/index.md', page('x Combined Product Files'));
  for (const a of areas) put(`markdown/${a.area}/index.md`, page(a.index ?? a.llms));
  git(['add', '-A'], corpus);
  git(['-c', 'user.email=f@example.invalid', '-c', 'user.name=f', 'commit', '-qm', 'fixture'], corpus);
  const pin = git(['rev-parse', 'HEAD'], corpus).trim();
  writeFileSync(join(root, 'engine.config.json'), `${JSON.stringify({ docs: { family: 'australia', pin } })}\n`);
  return { root, corpus, pin };
}
const rows = (map) => map.split('\n').filter((l) => l.startsWith('| `markdown/'));
const cells = (row) => row.split('|').slice(1, -1).map((c) => c.trim());
const cli = (root, ...args) => spawnSync(process.execPath, [SCRIPT, ...args, '--root', root], { encoding: 'utf8' });

test('ARC-09-C250 — the map says how to find a page, then gives each area one row: title, pages, top products', (t) => {
  const { corpus, pin } = fixture(t);
  const map = buildMap({ corpus, pin });
  assert.ok(map.includes(pin), 'the map does not name the pin it was made from');
  for (const how of ['Grep `markdown/*/index.md`', '`/australia/<area>/…` as `markdown/<area>/…`',
    'Grep `^product: <name>`', 'Prefer a product\'s own area to `delta-*` and release notes']) {
    assert.ok(map.includes(how), `the header does not say: ${how}`);
  }
  assert.deepEqual(rows(map).map(cells), [
    ['`markdown/alpha/`', 'Alpha publication', '3', 'Product One (2) · Product Two (1)'],
    ['`markdown/beta/`', 'Beta, renamed / Beta Files', '1', 'Piped/Name (1)'],
    ['`markdown/delta-x/`', 'x Combined Product Files', '0', ''],
  ]);
});

test('ARC-09-C250 — a title is llms.txt\'s, the index.md title beside it when they differ; no pipe in a cell', (t) => {
  const { corpus, pin } = fixture(t);
  const map = buildMap({ corpus, pin });
  // The same name once, the family word set aside; two names, both; no llms.txt title, the index title as it is.
  assert.ok(map.includes('| Alpha publication |'), 'a name the two titles share is not shown once');
  assert.ok(map.includes('| Beta, renamed / Beta Files |'), 'a renamed area does not show both of its names');
  assert.ok(map.includes('| x Combined Product Files |'), 'the index.md title is not the fallback');
  // A pipe never reaches a cell.
  for (const row of rows(map)) assert.equal(row.split('|').length, 6, `a cell holds a pipe: ${row}`);
});

test('ARC-09-C250 — the corpus is whole when every area of the pinned tree is on disk, and a cone is not', (t) => {
  const { corpus } = fixture(t);
  assert.deepEqual(corpusShape(corpus), { whole: true, inTree: ['alpha', 'beta', 'delta-x'], missing: [] });
  git(['sparse-checkout', 'set', '--cone', 'markdown/alpha'], corpus);
  assert.ok(!existsSync(join(corpus, 'markdown/beta')), 'the cone did not leave beta out');
  assert.deepEqual(corpusShape(corpus), { whole: false, inTree: ['alpha', 'beta', 'delta-x'], missing: ['beta', 'delta-x'] });
});

test('ARC-09-C250 — --write makes the map, --check finds it current, then names a drift', (t) => {
  const { root } = fixture(t);
  const w = cli(root, '--write');
  assert.equal(w.status, 0, w.stderr);
  const target = join(root, 'vendor/docs-map.md');
  assert.ok(existsSync(target), 'nothing was written');
  const ok = cli(root, '--check');
  assert.equal(ok.status, 0, ok.stderr);
  writeFileSync(target, readFileSync(target, 'utf8').replace('Beta Files', 'Beta Edited'));
  const drift = cli(root, '--check');
  assert.equal(drift.status, 1, drift.stdout);
  assert.match(`${drift.stdout}${drift.stderr}`, /vendor\/docs-map\.md/);
});

test('ARC-09-C250 — on a sparse corpus --check says "not checked", and --write refuses and writes nothing', (t) => {
  const { root, corpus } = fixture(t);
  git(['sparse-checkout', 'set', '--cone', 'markdown/alpha'], corpus);
  assert.ok(!existsSync(join(corpus, 'markdown/beta')), 'the cone did not leave beta out');
  const check = cli(root, '--check');
  assert.equal(check.status, 0, check.stderr);
  assert.match(check.stdout, /not checked/);
  const write = cli(root, '--write');
  assert.equal(write.status, 2, write.stdout);
  assert.ok(!existsSync(join(root, 'vendor/docs-map.md')), 'a map was written from a sparse corpus');
});

test('ARC-09-C250 — the shipped map has one row for every area of the pinned tree (whole corpus only)', (t) => {
  const corpus = join(REPO, 'vendor/ServiceNowDocs');
  const shape = existsSync(join(corpus, '.git')) ? corpusShape(corpus) : null;
  if (!shape?.whole) { t.skip('not checked: this checkout\'s corpus is not the whole tree'); return; }
  const map = readFileSync(join(REPO, 'vendor/docs-map.md'), 'utf8');
  assert.deepEqual(rows(map).map((r) => cells(r)[0]), shape.inTree.map((a) => `\`markdown/${a}/\``));
});

// ARC-09-C277 — a release family opening a title is a label, not a name. The corpus is on the `australia` branch and its
// index titles say "Brazil …" on 45 areas: a reader took the map to be about Brazil. The label is left out of each part of
// a title, for any family, and only where it opens the title.

/** The titles the map shows for the given areas, by area name. */
function shown(t, areas, options) {
  const { corpus, pin } = fixture(t, { areas });
  const byArea = new Map(rows(buildMap({ corpus, pin, ...options })).map(cells).map((c) => [c[0].replace(/^`markdown\/|\/`$/g, ''), c[1]]));
  return (area) => byArea.get(area);
}

test('ARC-09-C277 — a title shows no release family at its start, in either of its parts, whichever family it is', (t) => {
  const title = shown(t, [
    { area: 'it-service-management', llms: 'IT Service Management', index: 'Brazil IT Service Management' },
    { area: 'cloud-governance-suite', index: 'Australia Cloud Governance Suite' },
    { area: 'delta-z-australia', index: 'australia Combined Product Files' },
    { area: 'release-notes', index: 'Brazil release notes' },
    { area: 'both-parts', llms: 'Brazil Foo', index: 'Australia Foo' },
    { area: 'renamed', llms: 'Account Lifecycle Events', index: 'Brazil Customer Success Management' },
    { area: 'two-words', index: 'San Diego Platform Overview' },
  ]);
  assert.equal(title('it-service-management'), 'IT Service Management', 'the family the corpus is not on stays in the index title');
  assert.equal(title('cloud-governance-suite'), 'Cloud Governance Suite', 'an index title with no llms.txt title keeps its family');
  assert.equal(title('delta-z-australia'), 'Combined Product Files', 'a family written in lower case stays');
  assert.equal(title('release-notes'), 'Release notes', 'what is left of a title does not open with a small letter');
  assert.equal(title('both-parts'), 'Foo', 'two titles that are one name once the families are gone are shown once');
  assert.equal(title('renamed'), 'Account Lifecycle Events / Customer Success Management', 'a renamed area shows both of its names, without the family');
  assert.equal(title('two-words'), 'Platform Overview', 'a family of two words stays');
});

test('ARC-09-C277 — only a family at the start of a title goes: a name that merely begins with one, or sits in the middle, stays', (t) => {
  const title = shown(t, [
    { area: 'mid', llms: 'Moving from Zurich to Australia', index: 'Moving from Zurich to Australia' },
    { area: 'longer-word', index: 'Fujitsu Integration' },
    { area: 'only-family', index: 'Brazil' },
    { area: 'vocabulary', index: 'vocabulary' },
  ]);
  assert.equal(title('mid'), 'Moving from Zurich to Australia');
  assert.equal(title('longer-word'), 'Fujitsu Integration', 'Fuji is a family; Fujitsu is not');
  assert.equal(title('only-family'), 'Brazil', 'a title that is a family and nothing else has nothing left to show');
  assert.equal(title('vocabulary'), 'vocabulary', 'a title that opens with no family keeps its case');
});

test('ARC-09-C277 — the corpus\'s own family goes from a title even when no list names it', (t) => {
  const own = (family) => shown(t, [{ area: 'zebra', index: 'Zebra Reports' }], family ? { family } : {})('zebra');
  assert.equal(own('zebra'), 'Reports');
  assert.equal(own(null), 'Zebra Reports', 'a word that is no family of this corpus lost its place at the start of a title');
});

test('ARC-09-C277 — every release family the engine config allows is one the map leaves out of a title', (t) => {
  const schema = JSON.parse(readFileSync(join(REPO, 'engine.config.schema.json'), 'utf8'));
  const allowed = schema.properties.docs.properties.family.enum;
  assert.ok(allowed.length >= 4, 'the config names no families');
  const title = shown(t, allowed.map((name) => ({ area: `family-${name}`, index: `${name[0].toUpperCase()}${name.slice(1)} Foo` })));
  for (const name of allowed) assert.equal(title(`family-${name}`), 'Foo', `the config allows ${name}, and the map keeps it in a title`);
});

test('ARC-09-C277 — the shipped map names no release family at the start of a title', () => {
  const map = readFileSync(join(REPO, 'vendor/docs-map.md'), 'utf8');
  const parts = rows(map).flatMap((r) => cells(r)[1].split(' / '));
  assert.ok(parts.length >= 50, `the map has ${parts.length} title parts`);
  const schema = JSON.parse(readFileSync(join(REPO, 'engine.config.schema.json'), 'utf8'));
  const families = [...schema.properties.docs.properties.family.enum, 'australia', 'brazil'];
  assert.deepEqual(parts.filter((p) => families.includes(p.split(/\s+/)[0].toLowerCase())), []);
  // Whatever a newer family is called, a label shows on most areas and a name on a few: the delta areas share "Combined"
  // (4 of them today), the family label was on 50 of 54.
  const opening = new Map();
  for (const p of parts) opening.set(p.split(/\s+/)[0], (opening.get(p.split(/\s+/)[0]) ?? 0) + 1);
  const [word, n] = [...opening].sort((a, b) => b[1] - a[1])[0];
  assert.ok(n < 10, `"${word}" opens ${n} of the title parts of the map: a release label that is not in the generator's list of families`);
});
