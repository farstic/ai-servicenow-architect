/**
 * ARC-09-C12 — the fixture helper cannot drift from the repository.
 *
 * The whole point of copying rather than retyping. A helper that wrote its own idea of the rules
 * would be a fourth place for them to live, and the one that mattered on Windows —
 * `packages/snowarch/dist/** text eol=lf` — is exactly the kind a hand-typed subset leaves out.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { gitattributesText, writeGitattributes } from './helpers/gitattributes.mjs';
import { tempDir } from '../tools/snowarch/tests/helpers/temp.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

test('the helper writes the repository\'s own .gitattributes, byte for byte (ARC-09-C12)', (t) => {
  const dir = tempDir('snowarch-attrs-', t);
  writeGitattributes(dir);
  const written = readFileSync(join(dir, '.gitattributes'), 'utf8');
  assert.equal(written, readFileSync(join(root, '.gitattributes'), 'utf8'));
  assert.equal(written, gitattributesText());
  // The rule the Windows cell failed on, named so a future edit that removes it is a conversation.
  assert.match(written, /packages\/snowarch\/dist\/\*\* .*text eol=lf/);
  assert.match(written, /^\* text=auto eol=lf$/m);
});

test('every fixture that makes a git repository carries the file (ARC-09-C12)', () => {
  // By INSPECTION of the three fixture builders, because the alternative is discovering the fourth
  // one from a red Windows cell — which is how this test came to exist.
  const sources = {
    'tests/upgrade/harness.mjs': /'\.gitattributes'/,      // in its COPIED list
    'tests/helpers/docs-fixture.mjs': /writeGitattributes\(/,
    'tests/release.test.mjs': /writeGitattributes\(/,
  };
  for (const [rel, pattern] of Object.entries(sources)) {
    assert.match(readFileSync(join(root, rel), 'utf8'), pattern,
      `${rel} builds a git fixture without the repository's .gitattributes — on a CRLF-default `
      + 'checkout its files come back with different bytes than it wrote');
  }
});
