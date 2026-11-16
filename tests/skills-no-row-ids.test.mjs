// Copyright 2026 Cvetomir Grigorov. Licensed under the Business Source License 1.1 (see LICENSE).
// snowarch — AI ServiceNow Architect. Not affiliated with or endorsed by ServiceNow, Inc.
// ARC-09-C282 — no plan row id in the prose of a skill or an agent. A skill's sentence is read by the model and can come
// back in an answer, where "ARC-09-C160" means nothing to the reader: nine such ids were taken out of the gateway skills
// in this row, and this guard keeps them out. An HTML comment is a maintainer's note, not a sentence, and is left alone.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { rowIdsIn } from './lib/row-ids.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** Every .md file under a directory of the repository, as a repository-relative path with forward slashes. */
function markdownIn(dir) {
  const out = [];
  for (const e of readdirSync(join(ROOT, dir), { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...markdownIn(p));
    else if (e.isFile() && e.name.endsWith('.md')) out.push(relative(ROOT, join(ROOT, p)).split('\\').join('/'));
  }
  return out.sort();
}

test('ARC-09-C282 — a plan row or story id in a sentence is found, with its line and any letter that ends it', () => {
  const text = [
    '# A skill',
    '',
    '**Always evaluate, for a request about money against an account (ARC-09-C161).** Part 2 names each of these.',
    '- It was asserted the opposite until ARC-02-S13 measured it, and again until ARC-09-C263b did.',
    '',
  ].join('\n');
  assert.deepEqual(rowIdsIn(text), [
    { id: 'ARC-09-C161', line: 3 },
    { id: 'ARC-02-S13', line: 4 },
    { id: 'ARC-09-C263b', line: 4 },
  ]);
});

test('ARC-09-C282 — an id in an HTML comment is a maintainer\'s note: nothing is found, on one line or on several', () => {
  const text = [
    '# A skill',
    '   <!-- The field contract, agreed with ARC-08-S01 and fixed 2026-09-10.',
    '        UNTIL ARC-08-S01 SHIPS the section does not exist. -->',
    '<!-- ARC-08-S09: the doctor\'s own check ids extend this -->',
    '',
  ].join('\n');
  assert.deepEqual(rowIdsIn(text), []);
});

test('ARC-09-C282 — a sentence on the line where a comment closes is still read, and its line number is the file\'s', () => {
  const text = [
    '# A skill',
    '<!-- a note that names ARC-08-S01',
    '     over two lines --> then a sentence with (ARC-09-C160).',
    'and before <!-- ARC-08-S09 --> a sentence with ARC-02-S13 after it.',
    '',
  ].join('\n');
  assert.deepEqual(rowIdsIn(text), [
    { id: 'ARC-09-C160', line: 3 },
    { id: 'ARC-02-S13', line: 4 },
  ]);
});

test('ARC-09-C282 — what only looks like an id is not one: a plan name, a bare C number, an id with no number', () => {
  assert.deepEqual(rowIdsIn('The ARC-09 rows, C360 and ARC-09-C and ARC-9-C12 and XARC-09-C12 are not ids.\n'), []);
});

test('ARC-09-C282 — no skill or agent sentence names a plan row', () => {
  const files = [...markdownIn('.claude/skills'), ...markdownIn('.claude/agents')];
  assert.ok(files.length >= 38, `${files.length} skill and agent files read, fewer than the 29 skills and 9 agents`);
  const found = files.flatMap((f) => rowIdsIn(readFileSync(join(ROOT, f), 'utf8')).map((hit) => `${f}:${hit.line} ${hit.id}`));
  assert.deepEqual(found, [], 'a plan row id stands in a sentence the model reads');
});
