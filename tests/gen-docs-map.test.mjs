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

/** A root with a three-area corpus at a pin, an engine.config.json naming that pin, and no map yet. */
function fixture(t) {
  const root = tempDir('snowarch-c250-map-', t);
  const corpus = join(root, 'vendor/ServiceNowDocs');
  const put = (rel, text) => { mkdirSync(dirname(join(corpus, rel)), { recursive: true }); writeFileSync(join(corpus, rel), text); };
  mkdirSync(corpus, { recursive: true });
  initFixtureRepo((args) => git(args, corpus), corpus, ['-q', '-b', 'australia']);
  put('llms.txt', `# ServiceNow docs\n\n- [Alpha publication](${URL_OF('alpha')})\n`);
  put('markdown/alpha/index.md', page('Alpha TOC'));
  put('markdown/alpha/a.md', page('A', 'Product One'));
  put('markdown/alpha/b.md', page('B', 'Product One'));
  put('markdown/alpha/nested/c.md', page('C', 'Product Two'));
  put('markdown/beta/index.md', page('Beta Files'));
  put('markdown/beta/d.md', page('D', 'Piped|Name'));
  put('markdown/delta-x/index.md', page('x Combined Product Files'));
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
    ['`markdown/beta/`', 'Beta Files', '1', 'Piped/Name (1)'],
    ['`markdown/delta-x/`', 'x Combined Product Files', '0', ''],
  ]);
});

test('ARC-09-C250 — a title comes from llms.txt, else from the area index.md; a pipe never reaches a cell', (t) => {
  const { corpus, pin } = fixture(t);
  const map = buildMap({ corpus, pin });
  assert.ok(map.includes('| Alpha publication |'), 'llms.txt\'s title is not used');
  assert.ok(map.includes('| Beta Files |'), 'the index.md title is not the fallback');
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
