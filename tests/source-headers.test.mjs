// Copyright 2026 Cvetomir Grigorov. Licensed under the Apache License, Version 2.0 (see LICENSE).
// snowarch — AI ServiceNow Architect. Not affiliated with or endorsed by ServiceNow, Inc.
//
// ARC-11-C2 — every source file the author owns starts with the copyright header.
//
// WHICH FILES. Tracked, with one of six extensions (.ts, .mjs, .js, .sh, .py, .ps1), outside vendor/,
// every node_modules/ and every dist/: the corpus is ServiceNow's, the modules are their authors', and
// dist/ is built from src/. Markdown and JSON carry no header; the repository's NOTICE covers them.
//
// WHERE THE HEADER GOES. First, unless the file begins with a shebang, which must stay line 1, or a
// UTF-8 byte order mark, which must stay bytes 0–2 (bootstrap.ps1, for Windows PowerShell 5.1). A file
// whose region a generator writes keeps its header above that region, so no generator changes.
//
// ONE EXEMPTION LIST, each entry with its reason, and an entry must name something that exists.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const HEADER = [
  'Copyright 2026 Cvetomir Grigorov. Licensed under the Apache License, Version 2.0 (see LICENSE).',
  'snowarch — AI ServiceNow Architect. Not affiliated with or endorsed by ServiceNow, Inc.',
];
const SLASHES = ['.ts', '.mjs', '.js'];
const HASHES = ['.sh', '.py', '.ps1'];

const EXEMPT = Object.freeze([
  { path: 'docs/spikes/', reason: 'records of what a spike ran; history, not maintained source' },
]);

const headerFor = (ext) => HEADER.map((line) => `${SLASHES.includes(ext) ? '//' : '#'} ${line}`);

/** Why `text` does not start with the header for `ext`, or `null`. A BOM, then a shebang, may come first. */
function headerProblem(text, ext) {
  const lines = text.replace(/^﻿/, '').split(/\r?\n/);
  const at = lines[0]?.startsWith('#!') ? 1 : 0;
  const [first, second] = headerFor(ext);
  if (lines[at] !== first || lines[at + 1] !== second) return `line ${at + 1} is not the copyright header`;
  return null;
}

/** The owned source files, as git tracks them. */
function ownedSources() {
  return execFileSync('git', ['ls-files', '-z', '--', ...[...SLASHES, ...HASHES].map((e) => `*${e}`)],
    { cwd: ROOT, encoding: 'utf8', maxBuffer: 1 << 26 })
    .split('\0').filter(Boolean)
    .filter((f) => !/^vendor\/|(^|\/)node_modules\/|(^|\/)dist\//.test(f));
}

const exempt = (f) => EXEMPT.some((e) => f.startsWith(e.path));

test('ARC-11-C2 — every owned source file starts with the copyright header, after a shebang or a BOM', () => {
  const files = ownedSources().filter((f) => !exempt(f));
  assert.ok(files.length > 500, `only ${files.length} owned source files — the listing is wrong`);
  const missing = files.filter((f) => headerProblem(readFileSync(join(ROOT, f), 'utf8'), extname(f)) !== null);
  assert.deepEqual(missing, [], `${missing.length} file(s) without the header:\n  ${missing.slice(0, 30).join('\n  ')}`);
});

test('ARC-11-C2 — each exemption names a path that exists, with its reason', () => {
  const files = ownedSources();
  for (const e of EXEMPT) {
    assert.ok(e.reason && e.reason.trim().length > 0, `${e.path} has no reason`);
    assert.ok(files.some((f) => f.startsWith(e.path)), `${e.path} exempts nothing — remove it`);
  }
});

test('ARC-11-C2 — the check accepts the header after a shebang or a BOM, and nothing else', () => {
  const js = headerFor('.mjs').join('\n');
  const sh = headerFor('.sh');
  assert.equal(headerProblem(`${js}\nimport x from 'y';\n`, '.mjs'), null);
  assert.equal(headerProblem(`#!/usr/bin/env node\n${js}\n`, '.mjs'), null);
  assert.equal(headerProblem(`﻿${sh.join('\r\n')}\r\nparam()\r\n`, '.ps1'), null, 'a BOM and CRLF');
  assert.notEqual(headerProblem("import x from 'y';\n", '.mjs'), null, 'no header');
  assert.notEqual(headerProblem(`${headerFor('.mjs').reverse().join('\n')}\n`, '.mjs'), null, 'the lines swapped');
  assert.notEqual(headerProblem(`${js}\n`, '.sh'), null, 'the wrong comment style');
  assert.notEqual(headerProblem(`// a comment first\n${js}\n`, '.mjs'), null, 'the header below the top');
});

test('ARC-11-C2 — docs/CONTRIBUTING.md quotes the header the guard holds every file to', () => {
  const contributing = readFileSync(join(ROOT, 'docs/CONTRIBUTING.md'), 'utf8');
  for (const line of headerFor('.mjs')) assert.ok(contributing.includes(line), `CONTRIBUTING does not quote: ${line}`);
  assert.ok(contributing.includes('tests/source-headers.test.mjs'), 'CONTRIBUTING does not point to the guard');
});
