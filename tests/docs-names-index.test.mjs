// Copyright 2026 Cvetomir Grigorov. Licensed under the Business Source License 1.1 (see LICENSE).
// snowarch — AI ServiceNow Architect. Not affiliated with or endorsed by ServiceNow, Inc.
// ARC-09-C263 (M3) — the corpus names index: what it holds, when it can be trusted, and who may import it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tempDir } from '../tools/snowarch/tests/helpers/temp.mjs';
import { loadNamesIndex, namesIndexState } from '../tools/snowarch/lib/docs/names-index.mjs';
import { buildNamesIndex, ensureNamesIndex, writeNamesIndex } from '../tools/snowarch/lib/docs/names-index-build.mjs';
import { pageNames, qualifiesWhole } from '../tools/snowarch/lib/docs/name-rules.mjs';
import { indexAfterSync } from '../tools/snowarch/lib/docs/sync-index.mjs';
import { spellings } from '../tools/snowarch/lib/launcher-spelling.mjs';
import { SPARSE, sparseOf } from '../tools/snowarch/lib/docs/status.mjs';
import { corpusNamesDir } from '../tools/snowarch/lib/local-paths.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PIN = 'c10276e953456835cdbb1f3a60d58ae1980be353';

/** A corpus of `files` ({ 'markdown/<area>/<page>.md': text }) under a fresh temp directory. */
function corpusOf(files) {
  const dir = tempDir('names-corpus-');
  for (const [page, text] of Object.entries(files)) {
    const abs = join(dir, ...page.split('/'));
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, text);
  }
  return dir;
}

const FILES = {
  'markdown/itsm/a.md': [
    'The table sys\\_user and SYS_USER are one name; _sn_hr_core_ in emphasis is sn_hr_core.',
    'Dotted: com.snc.thing, glide.foo.bar, sn_si.major_incident, and a table with a field, incident.assigned_to.',
    'Version 1.2.3 and file.txt are not names. A plain word: incident.',
  ].join('\n'),
  'markdown/itsm/b.md': 'Again sys\\_user, and task_sla; also glide.foo.bar.\n',
  'markdown/csm/c.md': 'Only here: sn_customerservice_case, whose field is state; the pair is never written with a dot.\n',
};

test('ARC-09-C263 M3 — the tokeniser: escapes, case, edge underscores, dotted names, postings and counts', () => {
  const corpus = corpusOf(FILES);
  const built = buildNamesIndex({ corpus, pin: PIN, tree: null });
  const idsOf = (name) => built.names.get(name);
  assert.deepEqual(built.pages, ['markdown/csm/c.md', 'markdown/itsm/a.md', 'markdown/itsm/b.md'], 'pages sorted, ids are positions');
  assert.deepEqual(idsOf('sys_user'), [1, 2], '`sys\\_user` and `SYS_USER` are one name, on two pages, ascending');
  assert.deepEqual(idsOf('sn_hr_core'), [1], 'emphasis underscores are off the name');
  assert.equal(idsOf('_sn_hr_core_'), undefined);
  assert.deepEqual(idsOf('task_sla'), [2]);
  assert.deepEqual(idsOf('assigned_to'), [1], 'a table with a field: the field is a token of its own');
  assert.deepEqual(idsOf('com.snc.thing'), [1], 'a dotted com. name is stored whole');
  assert.deepEqual(idsOf('glide.foo.bar'), [1, 2]);
  assert.deepEqual(idsOf('sn_si.major_incident'), [1]);
  assert.equal(idsOf('incident.assigned_to'), undefined, 'a dotted name under a table is not a qualified name: it is looked up by its parts');
  assert.equal(idsOf('1.2.3'), undefined);
  assert.equal(idsOf('sn_customerservice_case.state'), undefined, 'printed whole on no page');
  assert.equal(built.meta.names, built.names.size);
  assert.equal(built.meta.pages, 3);
});

test('ARC-09-C263 M3 — coverage: the whole tree is `full`, anything less is `disk` and lists its areas', () => {
  const corpus = corpusOf(FILES);
  const all = ['markdown/csm/c.md', 'markdown/itsm/a.md', 'markdown/itsm/b.md'];
  assert.equal(buildNamesIndex({ corpus, pin: PIN, tree: all }).meta.coverage, 'full');
  const wider = buildNamesIndex({ corpus, pin: PIN, tree: [...all, 'markdown/hrsd/d.md'] });
  assert.equal(wider.meta.coverage, 'disk', 'a page of the tree that is not on disk: a sparse checkout');
  assert.deepEqual(wider.meta.areas, ['csm', 'itsm']);
  assert.equal(buildNamesIndex({ corpus, pin: PIN, tree: null }).meta.coverage, 'disk', 'git could not say: no claim of absence');
  const full = buildNamesIndex({ corpus, pin: PIN, tree: all });
  assert.equal(full.meta.areas, null);
});

test('ARC-09-C263 M3 — written atomically; read back; null for a missing, corrupt, short, unknown or foreign index', () => {
  const corpus = corpusOf(FILES);
  const dir = join(tempDir('names-out-'), 'corpus-names', PIN.slice(0, 12));
  mkdirSync(dirname(dir), { recursive: true });
  writeFileSync(`${dir}.tmp-${process.pid}`, 'left by a crashed build');                      // a leftover must not break the next write
  const built = buildNamesIndex({ corpus, pin: PIN, tree: null });
  writeNamesIndex(dir, built);
  assert.deepEqual(readdirSync(dirname(dir)), [PIN.slice(0, 12)], 'no temp file or directory is left beside it');
  const idx = loadNamesIndex(dir, { pin: PIN });
  assert.ok(idx);
  assert.equal(idx.coverage, 'disk');
  assert.equal(idx.count('sys_user'), 2);
  assert.deepEqual(idx.pathsOf('sys_user'), ['markdown/itsm/a.md', 'markdown/itsm/b.md']);
  assert.deepEqual(idx.both('sys_user', 'task_sla'), [2], 'a posting intersection: the pages that print both');
  assert.equal(idx.has('nope'), false);
  assert.equal(idx.count('nope'), 0);
  assert.deepEqual(idx.pagesOf('nope'), []);
  assert.equal(idx.namespaces.get('sn_si'), 1);
  assert.equal(idx.namespaces.get('glide'), 1);

  // The same directory written again replaces the content.
  writeNamesIndex(dir, buildNamesIndex({ corpus, pin: PIN, tree: null, pages: ['markdown/itsm/b.md'] }));
  assert.equal(loadNamesIndex(dir, { pin: PIN }).pageCount, 1);

  // null, in each way an index can be unusable.
  writeNamesIndex(dir, built);
  assert.equal(loadNamesIndex(join(dir, 'nowhere')), null, 'missing');
  assert.equal(loadNamesIndex(dir, { pin: 'f'.repeat(40) }), null, 'another pin');
  const meta = JSON.parse(readFileSync(join(dir, 'meta.json'), 'utf8'));
  writeFileSync(join(dir, 'meta.json'), '{ not json');
  assert.equal(loadNamesIndex(dir, { pin: PIN }), null, 'corrupt meta');
  writeFileSync(join(dir, 'meta.json'), JSON.stringify({ ...meta, v: 99 }));
  assert.equal(loadNamesIndex(dir, { pin: PIN }), null, 'a version it does not know');
  writeFileSync(join(dir, 'meta.json'), JSON.stringify({ ...meta, coverage: 'everything' }));
  assert.equal(loadNamesIndex(dir, { pin: PIN }), null, 'a coverage it does not know');
  writeFileSync(join(dir, 'meta.json'), JSON.stringify(meta));
  assert.ok(loadNamesIndex(dir, { pin: PIN }), 'control: the restored meta loads');
  const names = readFileSync(join(dir, 'names.tsv'), 'utf8');
  writeFileSync(join(dir, 'names.tsv'), names.split('\n').slice(0, 3).join('\n'));
  assert.equal(loadNamesIndex(dir, { pin: PIN }), null, 'fewer names than the meta says (a truncated file)');
  writeFileSync(join(dir, 'names.tsv'), 'broken line without tabs\n');
  assert.equal(loadNamesIndex(dir, { pin: PIN }), null, 'a line that is not name, count, postings');
  writeFileSync(join(dir, 'names.tsv'), names);
  writeFileSync(join(dir, 'pages.txt'), 'markdown/itsm/a.md\n');
  assert.equal(loadNamesIndex(dir, { pin: PIN }), null, 'fewer pages than the meta says');
});

test('ARC-09-C263 M3 — a Windows checkout of the files (CRLF) loads the same index', () => {
  const corpus = corpusOf(FILES);
  const dir = join(tempDir('names-crlf-'), 'idx');
  writeNamesIndex(dir, buildNamesIndex({ corpus, pin: PIN, tree: null }));
  for (const f of ['meta.json', 'pages.txt', 'names.tsv']) writeFileSync(join(dir, f), readFileSync(join(dir, f), 'utf8').replace(/\n/g, '\r\n'));
  const idx = loadNamesIndex(dir, { pin: PIN });
  assert.ok(idx, 'CRLF files load');
  assert.deepEqual(idx.pathsOf('glide.foo.bar'), ['markdown/itsm/a.md', 'markdown/itsm/b.md']);
  assert.equal(idx.pagePath(0), 'markdown/csm/c.md', 'a page path carries no carriage return');
});

test('ARC-09-C263 M3 — control: delete a page and its names disappear from the next index', () => {
  const corpus = corpusOf(FILES);
  const before = buildNamesIndex({ corpus, pin: PIN, tree: null });
  assert.ok(before.names.has('sn_customerservice_case'));
  rmSync(join(corpus, 'markdown', 'csm', 'c.md'));
  const after = buildNamesIndex({ corpus, pin: PIN, tree: null });
  assert.equal(after.names.has('sn_customerservice_case'), false, 'a name only a deleted page printed is gone');
  assert.equal(after.meta.pages, 2);
});

test('ARC-09-C263 M3 — one tokeniser: the index and the roster check call name-rules.mjs, and neither carries a second copy', () => {
  const build = readFileSync(join(ROOT, 'tools/snowarch/lib/docs/names-index-build.mjs'), 'utf8');
  const identifiers = readFileSync(join(ROOT, 'tools/snowarch/lib/docs/identifiers.mjs'), 'utf8');
  assert.match(build, /import \{[^}]*\bpageNames\b[^}]*\} from '\.\/name-rules\.mjs'/);
  assert.match(identifiers, /\bpageNames\b[\s\S]*from '\.\/name-rules\.mjs'/);
  assert.doesNotMatch(build, /matchAll\(|\\\\_/, 'the index builder does not tokenise by itself');
  // ...and it is the tokeniser corpusIndex always had: a page's names, escapes and emphasis aside.
  const { tokens, dotted } = pageNames('x `sys\\_user` and _Sys_User_, com.snc.thing');
  assert.deepEqual([...tokens].sort(), ['sys_user']);
  assert.deepEqual([...dotted], ['com.snc.thing']);
});

test('ARC-09-C263 M3 — qualifiesWhole: com., glide. and a namespace with five dotted names are looked up whole, a table with a field is not', () => {
  const ns = new Map([['sn_si', 7], ['sn_hr_core_case', 2], ['sn_ins_underwrite', 4]]);
  assert.equal(qualifiesWhole('com.snc.x', ns), true);
  assert.equal(qualifiesWhole('glide.x.y', ns), true);
  assert.equal(qualifiesWhole('sn_si.major_incident_manager', ns), true, 'seven names: a namespace');
  assert.equal(qualifiesWhole('sn_hr_core_case.state', ns), false, 'two names: a table with a field');
  assert.equal(qualifiesWhole('sn_ins_underwrite.x', ns), false, 'four names, one under the line');
  assert.equal(qualifiesWhole('unknown.x', ns), false);
});

// Import graph. STATIC imports are what a module loads when it is loaded; a computed specifier would hide one, so the walk reads
// string literals only, and the second case below lists every file that names the builder at all.
const importsOf = (file, { dynamic = false } = {}) => {
  const text = readFileSync(file, 'utf8');
  const out = [];
  for (const m of text.matchAll(dynamic ? /(?:from\s+|import\s*\(\s*)['"](\.[^'"]+)['"]/g : /^\s*(?:import|export)\b[^'"\n;]*?from\s+['"](\.[^'"]+)['"]|^\s*import\s+['"](\.[^'"]+)['"]/gm)) {
    out.push(resolve(dirname(file), m[1] ?? m[2]));
  }
  return out.filter((p) => existsSync(p));
};
function graphOf(entry, seen = new Set()) {
  if (seen.has(entry)) return seen;
  seen.add(entry);
  for (const next of importsOf(entry)) graphOf(next, seen);
  return seen;
}
// `tests` directories are left out of the walk: a test is never loaded by a hook or by a session, and tools/snowarch/tests/ builds
// an index on purpose, as a fixture (input-hash.test.mjs holds the output B02 owes). Everything a session can load is walked.
const walkFiles = (d) => readdirSync(d, { withFileTypes: true }).flatMap((e) => {
  if (e.isDirectory()) return e.name === 'tests' ? [] : walkFiles(join(d, e.name));
  return e.name.endsWith('.mjs') ? [join(d, e.name)] : [];
});

test('ARC-09-C263 M3 — nothing a hook loads can build the index: no hook, no grounding module and no static import reaches the builder', () => {
  const builder = join(ROOT, 'tools/snowarch/lib/docs/names-index-build.mjs');
  const hooksDir = join(ROOT, 'tools/snowarch/hooks');
  const entries = readdirSync(hooksDir).filter((f) => f.endsWith('.mjs')).map((f) => join(hooksDir, f));
  assert.ok(entries.length >= 4, `found ${entries.length} hook entries`);
  const leaks = entries.filter((e) => graphOf(e).has(builder)).map((e) => e.slice(ROOT.length + 1));
  assert.deepEqual(leaks, [], 'a hook reaches names-index-build.mjs through its static imports');
  for (const f of readdirSync(hooksDir).filter((x) => x.endsWith('.mjs'))) {
    assert.doesNotMatch(readFileSync(join(hooksDir, f), 'utf8'), /names-index-build|sync-index/, `${f}: a hook names the index builder`);
  }
  // Who names the builder in code at all, in any spelling (an import, a dynamic import, a URL to it): the child's caller, and nobody else.
  const namers = walkFiles(join(ROOT, 'tools')).filter((f) => /(?:from\s+|import\s*\(\s*|new URL\(\s*)['"][^'"]*names-index-build\.mjs['"]/.test(readFileSync(f, 'utf8'))).map((f) => f.slice(ROOT.length + 1).split(sep).join('/')).sort();
  assert.deepEqual(namers, ['tools/snowarch/lib/docs/sync-index.mjs'],
    'a new module names the index builder: decide in review whether it may run in a session (it may not)');
  // The control: the policy module the three callers use does reach the builder's path, and the callers use it.
  assert.match(readFileSync(join(ROOT, 'tools/snowarch/lib/docs/sync-index.mjs'), 'utf8'), /names-index-build\.mjs/);
});

test('ARC-09-C263 M3 — the build runs in a child: indexAfterSync passes the pin, says the line, and a failure is a sentence not a throw', () => {
  const root = tempDir('names-sync-');
  const corpus = corpusOf(FILES);
  const lines = [];
  const real = indexAfterSync({ root, corpus, pin: PIN, say: (l) => lines.push(l) });
  assert.equal(real.built, true, `the child built it: ${real.error}`);
  assert.match(lines[0], /^\[docs\] names index … [\d.]+ s · 6 names|^\[docs\] names index … [\d.]+ s · \d+ names · 3 pages · coverage (full|disk)$/);
  assert.ok(loadNamesIndex(corpusNamesDir(root, PIN), { pin: PIN }), 'the index is where the hook will look');
  const second = indexAfterSync({ root, corpus, pin: PIN, say: (l) => lines.push(l) });
  assert.equal(second.built, false, 'current: the child builds nothing and says nothing');
  assert.equal(lines.length, 1);
  // The seam: a child that fails, one that times out, one that prints nonsense.
  const said = [];
  const CLI = spellings().cli;
  const boom = indexAfterSync({ root, corpus, pin: PIN, cli: CLI, say: (l) => said.push(l), run: () => { throw new Error('spawn failed\nmore'); } });
  assert.equal(boom.built, false);
  assert.equal(boom.error, 'spawn failed');
  // The launcher is the one the product derives (`spellings().cli`, handed in), so it is checked by position, never typed here.
  assert.ok(said[0].startsWith('[docs] note: the names index was not built (spawn failed) — the reply checks that need it are off; run '));
  assert.ok(said[0].endsWith(' doctor --fix') && said[0].includes(CLI), said[0]);
  const late = indexAfterSync({ root, corpus, pin: PIN, say: () => {}, run: () => { throw Object.assign(new Error('x'), { code: 'ETIMEDOUT' }); } });
  assert.equal(late.error, 'the build timed out');
  const junk = indexAfterSync({ root, corpus, pin: PIN, say: () => {}, run: () => 'not json' });
  assert.equal(junk.built, false);
  // A child that exits 1 still prints its line: the error in it is the one reported.
  const failed = indexAfterSync({ root, corpus, pin: PIN, say: () => {}, run: () => { throw Object.assign(new Error('exit 1'), { stdout: '{"built":false,"error":"disk full","meta":null,"ms":0,"line":null}\n' }); } });
  assert.equal(failed.error, 'disk full');
  // The three callers use it (B02, `docs sync`, `doctor --fix`).
  for (const f of ['tools/snowarch/lib/steps/B02.mjs', 'tools/snowarch/lib/docs/cli.mjs', 'tools/snowarch/lib/doctor/fix.mjs']) {
    assert.match(readFileSync(join(ROOT, f), 'utf8'), /indexAfterSync/, `${f} does not build the names index`);
  }
});

test('ARC-09-C263 M3 — ensure: built when missing, left alone when current, rebuilt when the pages changed, other pins pruned', () => {
  const root = tempDir('names-root-');
  const corpus = corpusOf(FILES);
  const first = ensureNamesIndex({ root, corpus, pin: PIN, build: (o) => buildNamesIndex({ ...o, tree: null }) });
  assert.equal(first.built, true);
  const dir = corpusNamesDir(root, PIN);
  assert.ok(first.dir === dir && existsSync(join(dir, 'meta.json')));
  const again = ensureNamesIndex({ root, corpus, pin: PIN, build: () => { throw new Error('must not rebuild'); } });
  assert.equal(again.built, false, 'current: no build');
  assert.equal(again.error, undefined);
  writeFileSync(join(corpus, 'markdown', 'itsm', 'e.md'), 'new name: sn_new_table\n');
  const widened = ensureNamesIndex({ root, corpus, pin: PIN, build: (o) => buildNamesIndex({ ...o, tree: null }) });
  assert.equal(widened.built, true, 'a page more on disk: rebuilt');
  assert.ok(loadNamesIndex(dir, { pin: PIN }).has('sn_new_table'));
  // Another pin's index goes when this one is built.
  mkdirSync(join(root, '.local', 'corpus-names', 'aaaaaaaaaaaa'), { recursive: true });
  ensureNamesIndex({ root, corpus, pin: PIN, force: true, build: (o) => buildNamesIndex({ ...o, tree: null }) });
  assert.deepEqual(readdirSync(join(root, '.local', 'corpus-names')), [PIN.slice(0, 12)]);
  // A build that fails is reported, never thrown: the sync it follows does not fail on it.
  const failed = ensureNamesIndex({ root, corpus, pin: PIN, force: true, build: () => { throw new Error('disk full'); } });
  assert.equal(failed.built, false);
  assert.equal(failed.error, 'disk full');
  // The doctor's three words.
  assert.equal(namesIndexState(dir, { pin: PIN }).state, 'ok');
  assert.equal(namesIndexState(join(root, 'none'), { pin: PIN }).state, 'missing');
  assert.equal(namesIndexState(join(root, 'none'), { pin: PIN, siblings: ['aaaaaaaaaaaa'] }).state, 'stale');
});

// Time, printed on every cell (the architect asked for it): a synthetic corpus everywhere, the real one where it is whole.
test('ARC-09-C263 M3 — the build time on this cell is printed (synthetic corpus), and bounded', () => {
  const pages = {};
  for (let i = 0; i < 2000; i += 1) {
    const words = [];
    for (let j = 0; j < 400; j += 1) words.push(`tbl_${(i * 7 + j) % 900}_x`, `field\\_${j % 300}`, 'plain words in a sentence', `com.snc.n${j % 50}.v${i % 20}`);
    pages[`markdown/area${i % 40}/page${i}.md`] = `${words.join(' ')}\n`;
  }
  const corpus = corpusOf(pages);
  const t0 = Date.now();
  const built = buildNamesIndex({ corpus, pin: PIN, tree: null });
  const ms = Date.now() - t0;
  const dir = join(tempDir('names-time-'), 'idx');
  const t1 = Date.now();
  writeNamesIndex(dir, built);
  const writeMs = Date.now() - t1;
  const t2 = Date.now();
  const idx = loadNamesIndex(dir, { pin: PIN });
  const loadMs = Date.now() - t2;
  assert.ok(idx && idx.pageCount === 2000);
  console.log(`    names index (synthetic, ${built.meta.pages} pages, ${built.meta.names} names) on ${process.platform}/${process.arch} node ${process.versions.node}: build ${ms} ms, write ${writeMs} ms, load ${loadMs} ms`);
  assert.ok(ms < 120_000, `the synthetic build took ${ms} ms`);
});

const CORPUS = join(ROOT, 'vendor', 'ServiceNowDocs');
const WHOLE = existsSync(join(CORPUS, 'markdown')) && ![SPARSE.cone, SPARSE.pattern].includes(sparseOf(CORPUS));
test('ARC-09-C263 M3 — the real corpus: coverage full, the index builds, and its time is printed', { skip: WHOLE ? false : 'this cell has no whole corpus' }, () => {
  const t0 = Date.now();
  const built = buildNamesIndex({ corpus: CORPUS, pin: PIN });
  const ms = Date.now() - t0;
  const dir = join(tempDir('names-real-'), 'idx');
  const bytes = writeNamesIndex(dir, built);
  const idx = loadNamesIndex(dir, { pin: PIN });
  assert.ok(idx);
  console.log(`    names index (real corpus, ${built.meta.pages} pages, ${built.meta.names} names, ${(bytes / 1e6).toFixed(1)} MB) on ${process.platform}/${process.arch} node ${process.versions.node}: build ${(ms / 1000).toFixed(1)} s, coverage ${built.meta.coverage}`);
  assert.equal(built.meta.coverage, 'full', 'a whole checkout: the pages on disk are the pages of the tree');
  assert.ok(idx.has('sys_id') && idx.count('sys_id') > 100);
  assert.equal(idx.has('sn_customerservice_case.state'), false, 'a table with a field is printed whole on no page');
  assert.ok(ms < 600_000, `the real build took ${ms} ms`);
});
