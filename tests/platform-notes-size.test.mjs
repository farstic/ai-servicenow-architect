// Copyright 2026 Cvetomir Grigorov. Licensed under the Business Source License 1.1 (see LICENSE).
// snowarch — AI ServiceNow Architect. Not affiliated with or endorsed by ServiceNow, Inc.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CAP, NOTES, PLAN_HEADING, sizeVerdict } from './lib/platform-notes-size.mjs';

/**
 * ARC-09-C222 — `docs/PLATFORM-NOTES.md` is split by area before it reaches 80,000 bytes. The planted texts sit
 * either side of the cap and are asked first, so the real file passing means something: the check has been seen
 * to fail.
 */
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(root, p), 'utf8');

/** `bytes` bytes of text once every line end is one LF: 80-byte lines ending in `eol`. */
const planted = (bytes, eol = '\n') => `${'x'.repeat(79)}${eol}`.repeat(Math.floor(bytes / 80)) + 'x'.repeat(bytes % 80);

test('ARC-09-C222 — one byte under the cap, the notes stay whole', () => {
  assert.deepEqual(sizeVerdict(planted(CAP - 1)), { verdict: 'ok', bytes: CAP - 1 });
});

test('ARC-09-C222 — at the cap and over it, the verdict is split, and the message names the plan', () => {
  for (const bytes of [CAP, CAP + 2_048]) {
    const v = sizeVerdict(planted(bytes));
    assert.equal(v.verdict, 'split', `${bytes} bytes`);
    assert.equal(v.bytes, bytes);
    assert.ok(v.message.includes(NOTES), v.message);
    assert.ok(v.message.includes('docs/CONTRIBUTING.md') && v.message.includes(PLAN_HEADING), v.message);
  }
});

test('ARC-09-C222 — CRLF line ends count as LF, so a Windows checkout measures what git stores', () => {
  const text = planted(CAP - 1, '\r\n');
  assert.ok(Buffer.byteLength(text) >= CAP, 'the control: counted raw, this text is at or over the cap');
  assert.deepEqual(sizeVerdict(text), { verdict: 'ok', bytes: CAP - 1 });
});

test('ARC-09-C222 — the cap counts bytes, not characters', () => {
  const text = 'é'.repeat(CAP / 2);
  assert.ok(text.length < CAP, 'the control: counted in characters, this text is under the cap');
  assert.equal(sizeVerdict(text).verdict, 'split');
});

test('ARC-09-C222 — the shipped notes are under the cap', () => {
  const v = sizeVerdict(read(NOTES));
  assert.equal(v.verdict, 'ok', v.message);
});

test('ARC-09-C222 — the plan the message names is in the contributor guide, and every reader it lists exists', () => {
  const guide = read('docs/CONTRIBUTING.md');
  const at = guide.indexOf(`\n## ${PLAN_HEADING}\n`);
  assert.ok(at >= 0, `docs/CONTRIBUTING.md has no section "${PLAN_HEADING}"`);
  const next = guide.indexOf('\n## ', at + 1);
  const section = guide.slice(at, next === -1 ? undefined : next);
  assert.ok(section.includes('docs/platform-notes/<area>.md'), 'the plan does not say where the entries go');
  const readers = [...section.matchAll(/`((?:tests|scripts|tools|packages)\/[^`\s]+\.(?:mjs|ts))`/g)].map((m) => m[1]);
  assert.ok(readers.length >= 6, `${readers.length} readers listed`);
  assert.deepEqual(readers.filter((p) => !existsSync(join(root, p))), [], 'the plan lists a reader that does not exist');
});
