// Copyright 2026 Cvetomir Grigorov. Licensed under the Business Source License 1.1 (see LICENSE).
// snowarch — AI ServiceNow Architect. Not affiliated with or endorsed by ServiceNow, Inc.
/**
 * ARC-09-C267, lever 2 — the glob the Stop hook expands a viewer command's patterns with (lib/docs/glob-fs.mjs). A `cat dir/*.md` shows every page the
 * shell expands the pattern to, so the hook asks the file system what the shell asked it, from the folder the shell was in. The module takes its file
 * system as a seam; these cases give it a small in-memory one, so they run the same on every platform, and count its reads.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { globToRegExp, makeGlob } from '../tools/snowarch/lib/docs/glob-fs.mjs';

/** An in-memory file system from a list of file paths: folders are the paths above them. `calls` counts the folder reads. */
function memoryFs(files) {
  const dirs = new Map();
  const add = (dir, name, isDir) => { if (!dirs.has(dir)) dirs.set(dir, new Map()); dirs.get(dir).set(name, isDir); };
  for (const file of files) {
    const parts = file.split('/');
    for (let i = 1; i < parts.length; i += 1) add(parts.slice(0, i).join('/') || '/', parts[i], i < parts.length - 1);
  }
  const fs = {
    calls: 0,
    readdir: (dir) => {
      fs.calls += 1;
      const entries = dirs.get(dir.replace(/(.)\/$/, '$1'));
      if (!entries) throw Object.assign(new Error(`ENOENT: ${dir}`), { code: 'ENOENT' });
      return [...entries].map(([name, isDir]) => ({ name, isDirectory: () => isDir }));
    },
    exists: (p) => files.includes(p) || dirs.has(p),
  };
  return fs;
}
const FILES = [
  '/i/vendor/ServiceNowDocs/markdown/csm/c_Esc.md', '/i/vendor/ServiceNowDocs/markdown/csm/c_Other.md', '/i/vendor/ServiceNowDocs/markdown/csm/t_Setup.md',
  '/i/vendor/ServiceNowDocs/markdown/csm/index.json', '/i/vendor/ServiceNowDocs/markdown/csm/.hidden.md',
  '/i/vendor/ServiceNowDocs/markdown/csm/sub/c_Esc.md', '/i/vendor/ServiceNowDocs/markdown/csm/sub/deep/c_Deep.md',
  '/i/vendor/ServiceNowDocs/markdown/hr/c_Esc.md', '/i/vendor/ServiceNowDocs/markdown/hr/c_Hr.md',
];
const CSM = '/i/vendor/ServiceNowDocs/markdown/csm';
const make = (options = {}) => { const fs = memoryFs(FILES); return { fs, glob: makeGlob({ readdir: fs.readdir, exists: fs.exists, ...options }) }; };

test('ARC-09-C267 glob-fs — globToRegExp: * ? [..] [!..] [^..], escapes for everything else, the case flag', () => {
  const re = (p, o) => globToRegExp(p, o);
  assert.ok(re('c_*.md').test('c_Esc.md') && re('c_*.md').test('c_.md') && !re('c_*.md').test('x_c_Esc.md') && !re('c_*.md').test('c_Esc.mdx'));
  assert.ok(re('c_?sc.md').test('c_Esc.md') && !re('c_?sc.md').test('c_sc.md') && !re('c_?sc.md').test('c_EEsc.md'));
  assert.ok(re('[ab]*.md').test('apple.md') && re('[ab]*.md').test('b.md') && !re('[ab]*.md').test('c.md'));
  assert.ok(re('[a-c]x').test('bx') && !re('[a-c]x').test('dx'));
  assert.ok(re('[!a]x').test('bx') && !re('[!a]x').test('ax') && re('[^a]x').test('bx') && !re('[^a]x').test('ax'));
  assert.ok(re('a.b').test('a.b') && !re('a.b').test('axb'), 'a dot is a dot');
  assert.ok(re('a+(b)').test('a+(b)') && re('a$^|b').test('a$^|b'), 'regular-expression characters are literal');
  assert.ok(re('[').test('['), 'an unclosed bracket is a bracket');
  assert.ok(!re('C_*.MD').test('c_esc.md') && re('C_*.MD', { ci: true }).test('c_esc.md'), 'case only with the flag');
});

test('ARC-09-C267 glob-fs — makeGlob: a pattern is expanded to the files the shell would, sorted, from an absolute path', () => {
  const { glob } = make();
  assert.deepEqual(glob(`${CSM}/*.md`), [`${CSM}/c_Esc.md`, `${CSM}/c_Other.md`, `${CSM}/t_Setup.md`], '* does not cross a folder and does not match a hidden file');
  assert.deepEqual(glob(`${CSM}/c_?sc.md`), [`${CSM}/c_Esc.md`]);
  assert.deepEqual(glob(`${CSM}/[ct]_*.md`), [`${CSM}/c_Esc.md`, `${CSM}/c_Other.md`, `${CSM}/t_Setup.md`]);
  assert.deepEqual(glob(`${CSM}/[!c]_*.md`), [`${CSM}/t_Setup.md`]);
  assert.deepEqual(glob(`${CSM}/.h*.md`), [`${CSM}/.hidden.md`], 'a pattern that starts with a dot matches a hidden file');
  assert.deepEqual(glob(`${CSM}/*`), [`${CSM}/c_Esc.md`, `${CSM}/c_Other.md`, `${CSM}/index.json`, `${CSM}/sub`, `${CSM}/t_Setup.md`], '* matches folders and other files too');
  assert.deepEqual(glob(`${CSM.replace('/csm', '')}/*/c_Esc.md`), ['/i/vendor/ServiceNowDocs/markdown/csm/c_Esc.md', '/i/vendor/ServiceNowDocs/markdown/hr/c_Esc.md'], 'a pattern in a folder name; the literal tail is checked');
  assert.deepEqual(glob(`${CSM}/*/c_Missing.md`), [], 'a literal tail that is not there');
  assert.deepEqual(glob(`${CSM}/nope/*.md`), [], 'a folder that is not there');
  assert.deepEqual(glob(`${CSM}/c_Esc.md`), [`${CSM}/c_Esc.md`], 'no wildcard: the file if it is there');
  assert.deepEqual(glob(`${CSM}/zzz.md`), [], 'and nothing if it is not');
});

test('ARC-09-C267 glob-fs — makeGlob: ** is zero or more folders, a drive letter is a root, the case flag', () => {
  const { glob } = make();
  const docs = '/i/vendor/ServiceNowDocs/markdown';
  assert.deepEqual(glob(`${docs}/**/c_Esc.md`), [`${docs}/csm/c_Esc.md`, `${docs}/csm/sub/c_Esc.md`, `${docs}/hr/c_Esc.md`]);
  assert.deepEqual(glob(`${docs}/csm/**/*.md`), [`${CSM}/c_Esc.md`, `${CSM}/c_Other.md`, `${CSM}/sub/c_Esc.md`, `${CSM}/sub/deep/c_Deep.md`, `${CSM}/t_Setup.md`]);
  const win = make();
  const winFs = memoryFs(['C:/i/ServiceNowDocs/markdown/csm/c_Esc.md', 'C:/i/ServiceNowDocs/markdown/csm/c_Other.md']);
  const g = makeGlob({ readdir: winFs.readdir, exists: winFs.exists });
  assert.deepEqual(g('C:/i/ServiceNowDocs/markdown/csm/*.md'), ['C:/i/ServiceNowDocs/markdown/csm/c_Esc.md', 'C:/i/ServiceNowDocs/markdown/csm/c_Other.md'], 'a drive letter');
  assert.deepEqual(win.glob(`${CSM}/C_*.MD`), [], 'case matters by default');
  assert.deepEqual(win.glob(`${CSM}/C_*.MD`, { ci: true }), [`${CSM}/c_Esc.md`, `${CSM}/c_Other.md`], 'and not for PowerShell');
});

test('ARC-09-C267 glob-fs — makeGlob: the time it may take is limited, by a clock the caller can give', () => {
  let t = 0;
  const memory = memoryFs(FILES);
  let reads = 0;
  const glob = makeGlob({ readdir: (d) => { reads += 1; t += 400; return memory.readdir(d); }, exists: memory.exists, now: () => t, maxMs: 1000 });
  assert.equal(glob(`${CSM}/*.md`).length, 3, 'the first pattern costs 400 ms of the 1000');
  assert.equal(glob(`${CSM}/c_*.md`).length, 2, 'the second 400 more');
  assert.deepEqual(glob(`${CSM}/t_*.md`), [], 'the third goes over: it answers nothing, and the caller falls back to the names');
  const after = reads;
  assert.deepEqual(glob(`${CSM}/index.*`), [], 'and once the time is spent a new pattern reads nothing');
  assert.equal(reads, after);
  assert.equal(glob(`${CSM}/*.md`).length, 3, 'but an answer already given is still the answer');
});

test('ARC-09-C267 glob-fs — makeGlob: an answer is kept, and the reads, the folders and the files it will make are limited', () => {
  const { fs, glob } = make();
  const first = glob(`${CSM}/*.md`);
  const reads = fs.calls;
  assert.ok(reads >= 1);
  assert.equal(glob(`${CSM}/*.md`), first, 'the second call is the first answer, and reads nothing');
  assert.equal(fs.calls, reads);
  assert.notEqual(glob(`${CSM}/*.md`, { ci: true }), first, 'a different case flag is a different question');
  const limited = make({ maxDirs: 2 });
  assert.deepEqual(limited.glob(`/i/vendor/ServiceNowDocs/markdown/**/c_Esc.md`), [], 'over the folder limit it answers nothing, and the caller falls back to the names');
  const few = make({ maxEntries: 3 });
  assert.deepEqual(few.glob(`${CSM}/*.md`), [], 'over the entry limit too');
  const broken = makeGlob({ readdir: () => { throw new Error('EACCES'); }, exists: () => false });
  assert.deepEqual(broken('/x/*.md'), [], 'a folder that cannot be read costs nothing');
  assert.deepEqual(makeGlob()('/this/folder/does/not/exist/*.md'), [], 'the real file system, a folder that is not there');
});
