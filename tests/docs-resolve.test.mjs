// Copyright 2026 Cvetomir Grigorov. Licensed under the Business Source License 1.1 (see LICENSE).
// snowarch — AI ServiceNow Architect. Not affiliated with or endorsed by ServiceNow, Inc.
// ARC-09-C254 — the page a corpus link stands for. Seven links in ten that point into the corpus name a path the corpus
// does not have: a leading `australia/` that is part of the link and not of the path, or a subfolder the link leaves out.
// `resolve` says which page was meant, and says nothing when it would be a guess: two pages fit, no page has that file
// name, or the only page of that name is in another area. Every case here uses made-up names; the classes and their
// shares were measured on the corpus (docs/plans/ARC-09-release-upgrade-and-cross-platform/README.md, row C254).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';

import { corpusRelative, indexOf, loadIndex, resolve } from '../tools/snowarch/lib/docs/resolve.mjs';
import { CORPUS_DIR, syncCorpus } from '../tools/snowarch/lib/docs/sync.mjs';
import { UNCITED, buildUpstream, makeWorkspace } from './helpers/docs-fixture.mjs';
import { tempDir } from '../tools/snowarch/tests/helpers/temp.mjs';

/** A corpus in miniature: one page of each shape the real links take. */
const PAGES = [
  'markdown/alpha/page-one.md',
  'markdown/alpha/deep/folder/page-two.md',
  'markdown/alpha/one/shared.md',
  'markdown/beta/two/shared.md',
  'markdown/alpha/one/twin.md',
  'markdown/alpha/two/twin.md',
  'markdown/epsilon/a/inner/dupe.md',
  'markdown/epsilon/b/inner/dupe.md',
  'markdown/gamma/real-folder/moved.md',
  'markdown/delta/only-here.md',
];
const index = indexOf(PAGES);

const hit = (kind, path) => ({ kind, path });

// [what the link does, the path it gives, what the resolver says]
const CASES = [
  ['a page that exists as written', 'markdown/alpha/page-one.md', hit('exact', 'markdown/alpha/page-one.md')],
  ['a page in a subfolder, as written', 'markdown/alpha/deep/folder/page-two.md', hit('exact', 'markdown/alpha/deep/folder/page-two.md')],
  ['a leading australia/ is part of the link, not of the path', 'markdown/australia/alpha/page-one.md',
    hit('australia', 'markdown/alpha/page-one.md')],
  ['a subfolder left out, the file name occurs once', 'markdown/alpha/page-two.md', hit('folders', 'markdown/alpha/deep/folder/page-two.md')],
  ['the first of two subfolders left out', 'markdown/alpha/folder/page-two.md', hit('folders', 'markdown/alpha/deep/folder/page-two.md')],
  ['the second of two subfolders left out', 'markdown/alpha/deep/page-two.md', hit('folders', 'markdown/alpha/deep/folder/page-two.md')],
  ['a leading australia/ and a subfolder left out, together', 'markdown/australia/alpha/page-two.md',
    hit('folders', 'markdown/alpha/deep/folder/page-two.md')],
  ['the file name occurs in two areas: the cited area picks the page', 'markdown/alpha/shared.md', hit('folders', 'markdown/alpha/one/shared.md')],
  ['the file name occurs in two areas: the other area is picked by its own', 'markdown/beta/shared.md', hit('folders', 'markdown/beta/two/shared.md')],
  ['the file name occurs twice in one area: a cited folder picks the page', 'markdown/epsilon/a/dupe.md',
    hit('folders', 'markdown/epsilon/a/inner/dupe.md')],
  ['the file name occurs twice in one area: the other cited folder picks the other', 'markdown/epsilon/b/dupe.md',
    hit('folders', 'markdown/epsilon/b/inner/dupe.md')],
  ['the same area, another folder, the file name occurs once', 'markdown/gamma/wrong-folder/moved.md', hit('area', 'markdown/gamma/real-folder/moved.md')],
  ['the folders in another order, the file name occurs once in the area', 'markdown/alpha/folder/deep/page-two.md',
    hit('area', 'markdown/alpha/deep/folder/page-two.md')],
  ['more folders than the page has, the file name occurs once in the area', 'markdown/alpha/a/b/c/page-one.md',
    hit('area', 'markdown/alpha/page-one.md')],
  // what it will not say
  ['two pages fit the cited folders', 'markdown/alpha/twin.md', null],
  ['the file name occurs twice and a cited folder is neither', 'markdown/alpha/zzz/twin.md', null],
  ['two pages of one name, and the cited folder is in neither area', 'markdown/zeta/a/dupe.md', null],
  ['a file name that occurs once, in another area', 'markdown/gamma/only-here.md', null],
  ['a file name that occurs once, in another area, with a subfolder', 'markdown/gamma/sub/only-here.md', null],
  ['no page has that file name', 'markdown/alpha/no-such-page.md', null],
  ['an area the corpus does not have, and a file name it does not have', 'markdown/no-such-area/no-such-page.md', null],
  ['a folder, not a page', 'markdown/alpha/deep', null],
  ['an area', 'markdown/alpha', null],
  ['no .md', 'markdown/alpha/page-one', null],
  ['not under markdown/', 'alpha/page-one.md', null],
  ['case is not folded', 'markdown/Alpha/page-one.md', null],
  ['empty', '', null],
  ['not a string', undefined, null],
];

for (const [title, cited, expected] of CASES) {
  test(`ARC-09-C254 — resolve: ${title}`, () => {
    assert.deepEqual(resolve(cited, index), expected);
  });
}

test('ARC-09-C254 — resolve reads the index and changes nothing in it', () => {
  const ix = indexOf(PAGES);
  const before = JSON.stringify([ix.size, ix.named('twin.md'), ix.named('shared.md'), ix.named('page-two.md')]);
  for (const [, cited] of CASES) resolve(cited, ix);
  assert.equal(JSON.stringify([ix.size, ix.named('twin.md'), ix.named('shared.md'), ix.named('page-two.md')]), before);
  assert.equal(ix.size, PAGES.length);
});

test('ARC-09-C254 — the index: pages by path and by file name, and nothing that is not a page', () => {
  const ix = indexOf([...PAGES, 'markdown/alpha/diagram.png', 'markdown/alpha/README', 'legal/README.md', 'markdown/alpha/page-one.md']);
  assert.equal(ix.size, PAGES.length, 'a duplicate, a picture, a folder name or a page outside markdown/ was counted');
  assert.equal(ix.has('markdown/alpha/page-one.md'), true);
  assert.equal(ix.has('markdown/alpha/diagram.png'), false);
  assert.equal(ix.has('legal/README.md'), false);
  assert.deepEqual([...ix.named('twin.md')].sort(), ['markdown/alpha/one/twin.md', 'markdown/alpha/two/twin.md']);
  assert.deepEqual(ix.named('page-one.md'), ['markdown/alpha/page-one.md'], 'a duplicate path is one page');
  assert.deepEqual(ix.named('no-such-page.md'), []);
});

// ---- the path a Read was given, as `markdown/...` ----

const SPELLINGS = [
  ['an absolute path', '/Users/someone/work/repo/vendor/ServiceNowDocs/markdown/alpha/page-one.md'],
  ['a Windows path with backslashes', 'C:\\Users\\someone\\work\\repo\\vendor\\ServiceNowDocs\\markdown\\alpha\\page-one.md'],
  ['a Windows path with forward slashes', 'C:/Users/someone/work/repo/vendor/ServiceNowDocs/markdown/alpha/page-one.md'],
  ['a Windows path, drive letter in lower case', 'c:\\users\\someone\\repo\\vendor\\ServiceNowDocs\\markdown\\alpha\\page-one.md'],
  ['a path with a space in the checkout folder', '/Users/some one/my work/repo/vendor/ServiceNowDocs/markdown/alpha/page-one.md'],
  ['a path relative to the checkout', 'vendor/ServiceNowDocs/markdown/alpha/page-one.md'],
  ['a path relative to vendor/', 'ServiceNowDocs/markdown/alpha/page-one.md'],
  ['a path with a doubled separator', '/Users/someone/repo/vendor/ServiceNowDocs//markdown/alpha/page-one.md'],
];
for (const [title, file] of SPELLINGS) {
  test(`ARC-09-C254 — corpusRelative: ${title}`, () => {
    assert.equal(corpusRelative(file), 'markdown/alpha/page-one.md');
  });
}

const NOT_CORPUS = [
  ['a file of the checkout', '/Users/someone/repo/clients/acme/envelopes/e.md'],
  ['a markdown folder that is not the corpus', '/Users/someone/repo/clients/acme/markdown/alpha/page-one.md'],
  ['a folder whose name only begins like the corpus', '/Users/someone/ServiceNowDocs-old/markdown/alpha/page-one.md'],
  ['the corpus root', '/Users/someone/repo/vendor/ServiceNowDocs'],
  ['a file at the corpus root', '/Users/someone/repo/vendor/ServiceNowDocs/README.md'],
  ['a bare markdown/ path, which is relative to nothing', 'markdown/alpha/page-one.md'],
  ['empty', ''],
  ['not a string', null],
];
for (const [title, file] of NOT_CORPUS) {
  test(`ARC-09-C254 — corpusRelative: ${title} is not a corpus page`, () => {
    assert.equal(corpusRelative(file), null);
  });
}

// ---- the corpus the index is read from ----

let scratch, upstream, upstreamUrl;
before(() => {
  scratch = tempDir('snowarch-c254-index-');
  upstream = buildUpstream(scratch);
  upstreamUrl = pathToFileURL(upstream.bare).href;
});
after(() => { rmSync(scratch, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); });

/** The corpus directory of a workspace checked out in `mode`. */
const synced = (mode) => {
  const w = makeWorkspace({ scratch, pin: upstream.pin, upstreamUrl });
  syncCorpus({ ...w, mode, log: () => {} });
  return join(w.root, CORPUS_DIR);
};

test('ARC-09-C254 — the index is the corpus tree at the pin: a page this sparse install did not check out is in it', () => {
  const corpus = synced('sparse');
  assert.ok(!existsSync(join(corpus, ...UNCITED.split('/'), 'index.md')), 'the cone brought the uncited area');
  const ix = loadIndex(corpus);
  assert.ok(ix, 'no index was read from a corpus with a git directory');
  assert.equal(ix.has(`${UNCITED}/index.md`), true, 'a real page outside the cone is not in the index');
  assert.equal(ix.has('markdown/beta/extra.md'), true);
  assert.equal(ix.has('markdown/alpha/index.md'), true);
  assert.deepEqual(ix.named('extra.md'), ['markdown/beta/extra.md']);
  assert.equal(ix.has('legal/README.md'), false, 'a page outside markdown/ is in the index');
});

test('ARC-09-C254 — with no git directory the index is the pages on disk, and /-separated', (t) => {
  const corpus = tempDir('snowarch-c254-walk-', t);
  for (const p of ['markdown/alpha/page-one.md', 'markdown/alpha/deep/folder/page-two.md', 'markdown/alpha/diagram.png', 'legal/README.md']) {
    mkdirSync(dirname(join(corpus, ...p.split('/'))), { recursive: true });
    writeFileSync(join(corpus, ...p.split('/')), '# page\n');
  }
  const ix = loadIndex(corpus);
  assert.ok(ix, 'no index was read from a corpus without a git directory');
  assert.equal(ix.size, 2);
  assert.equal(ix.has('markdown/alpha/deep/folder/page-two.md'), true);
  assert.deepEqual(resolve('markdown/alpha/page-two.md', ix), hit('folders', 'markdown/alpha/deep/folder/page-two.md'));
});

test('ARC-09-C254 — a sparse corpus whose .git is removed has only the pages on disk', () => {
  const corpus = synced('sparse');
  rmSync(join(corpus, '.git'), { recursive: true, force: true });
  const ix = loadIndex(corpus);
  assert.ok(ix);
  assert.equal(ix.has('markdown/alpha/index.md'), true);
  assert.equal(ix.has(`${UNCITED}/index.md`), false, 'a page that is not on disk came from nowhere');
});

test('ARC-09-C254 — a git directory that cannot be read (a gitlink to nowhere) falls back to the pages on disk', () => {
  const corpus = synced('sparse');
  rmSync(join(corpus, '.git'), { recursive: true, force: true });
  writeFileSync(join(corpus, '.git'), 'gitdir: ../no-such-git-directory\n');
  const ix = loadIndex(corpus);
  assert.ok(ix, 'a git that fails left the hook with no index at all');
  assert.equal(ix.has('markdown/alpha/index.md'), true);
});

test('ARC-09-C254 — a directory with no markdown/ has no index, and a missing directory has none either', (t) => {
  const corpus = tempDir('snowarch-c254-none-', t);
  assert.equal(loadIndex(corpus), null);
  assert.equal(loadIndex(join(corpus, 'not-there')), null);
});

// ---- speed: a lookup is milliseconds, the index is built in a blink ----

/** `n` pages shaped like the corpus: 56 areas, two folders under each. */
const synthetic = (n) => Array.from({ length: n }, (_, i) => `markdown/area-${i % 56}/folder-${i % 37}/sub-${i % 11}/page-${i}.md`);

test('ARC-09-C254 — an index of 50,000 pages is built in under two seconds, and 10,000 lookups cost under half a second', () => {
  const pages = synthetic(50_000);
  const t0 = performance.now();
  const ix = indexOf(pages);
  const built = performance.now() - t0;
  assert.equal(ix.size, 50_000);
  assert.ok(built < 2000, `the index took ${built.toFixed(0)} ms`);
  const t1 = performance.now();
  let resolved = 0;
  for (let i = 0; i < 10_000; i += 1) {
    const k = (i * 5) % 50_000;
    // the link leaves out the innermost folder
    if (resolve(`markdown/area-${k % 56}/folder-${k % 37}/page-${k}.md`, ix)?.path === pages[k]) resolved += 1;
  }
  const looked = performance.now() - t1;
  assert.equal(resolved, 10_000, 'a lookup in the large index named the wrong page, or none');
  assert.ok(looked < 500, `10,000 lookups took ${looked.toFixed(0)} ms`);
});
