import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { EXTENSIONS, EXCLUDED, filesInScope, lintLineEndings, lintHyphenSplits }
  from './lib/editorconfig.mjs';

/**
 * `.editorconfig` declared `end_of_line = lf` and `insert_final_newline = true` for every path, and
 * nothing read it. Five tracked files were in breach when this was written — all five last touched
 * by a script that rewrote a whole file and joined its parts back with the terminator missing, and
 * all five green on nineteen CI cells.
 */
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

test('every tracked file in scope ends with exactly one newline and has no CR', () => {
  const files = filesInScope(root);
  assert.ok(files.length > 200, `only ${files.length} files in scope — the listing is wrong`);
  const findings = lintLineEndings(root, files);
  assert.deepEqual(findings, [], `${findings.length} finding(s):\n  ${findings.join('\n  ')}`);
  console.log(`    editorconfig: ${files.length} tracked file(s) clean`);
});

test('no markdown prose splits a word across the wrap', () => {
  const findings = lintHyphenSplits(root, filesInScope(root));
  assert.deepEqual(findings, [], `${findings.length} finding(s):\n  ${findings.join('\n  ')}`);
});

test('the checks fail on each breach, and only on it', () => {
  // A checker nobody has seen fail is a checker nobody knows the shape of. Each case is one file
  // written wrong on purpose, in a temp tree, so the assertion is about the rule and not about
  // whatever the repository happens to contain today.
  const dir = mkdtempSync(join(tmpdir(), 'editorconfig-'));
  try {
    const w = (rel, body) => {
      mkdirSync(join(dir, dirname(rel)), { recursive: true });
      writeFileSync(join(dir, rel), body);
    };
    w('ok.md', 'fine\n');
    w('no-newline.md', 'missing');
    w('extra-blank.md', 'too many\n\n');
    w('crlf.md', 'windows\r\nline\r\n');
    w('empty.md', '');
    const files = ['ok.md', 'no-newline.md', 'extra-blank.md', 'crlf.md', 'empty.md'];

    assert.deepEqual(lintLineEndings(dir, files), [
      'no-newline.md: no final newline (insert_final_newline = true)',
      'extra-blank.md: blank line(s) at end of file',
      'crlf.md: CR present (end_of_line = lf)',
    ]);
    // One finding for `crlf.md`, not two: a file ending `\r\n` DOES end with a newline, so only the
    // CR is a breach. Worth stating because the opposite is the natural guess, and a check written
    // to that guess would report a second problem that is not there.
    // An EMPTY file is not a breach either: there is no last line to terminate, and demanding a
    // newline would mean demanding content.
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('a hyphen split is caught, and code and tables are not prose', () => {
  const dir = mkdtempSync(join(tmpdir(), 'editorconfig-'));
  try {
    writeFileSync(join(dir, 'doc.md'), [
      'A sentence that wraps on non-',
      'production and reads wrong.',
      '',
      '| a | b- |',
      '| c | d |',
      '',
      '```',
      'const x = value-',
      'other;',
      '```',
      '',
      'A dash at the end of a line —',
      'that is an em dash, not a split.',
      '',
    ].join('\n'));
    const f = lintHyphenSplits(dir, ['doc.md']);
    assert.equal(f.length, 1, f.join('\n'));
    assert.match(f[0], /^doc\.md:1: word split across the wrap — "non-production"$/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('the scope is what the ruling says, and excludes what a fix would falsify', () => {
  assert.deepEqual(EXTENSIONS, ['.md', '.mjs', '.ts', '.json', '.yml', '.yaml']);
  // `.ps1` / `.cmd` are absent deliberately: `.editorconfig` gives those CRLF, so a check that
  // assumed LF everywhere would be wrong about the two files the config is most explicit on.
  assert.ok(!EXTENSIONS.includes('.ps1') && !EXTENSIONS.includes('.cmd'));
  for (const p of ['vendor/', 'packages/snowarch/dist/', 'docs/spikes/']) {
    assert.ok(EXCLUDED.includes(p), `${p} must stay excluded`);
  }
  const files = filesInScope(root);
  assert.deepEqual(files.filter((f) => f.includes('/fixtures/')), [], 'a fixture reached the scan');
  assert.ok(files.includes('CLAUDE.md') && files.includes('package.json'));
  // And it really is the tracked set, not a directory walk: an untracked file must not be scanned.
  const tracked = new Set(execFileSync('git', ['ls-files'], { cwd: root, encoding: 'utf8' }).split('\n'));
  assert.deepEqual(files.filter((f) => !tracked.has(f)), []);
});
