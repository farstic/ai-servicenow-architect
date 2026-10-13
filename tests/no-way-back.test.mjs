// Copyright 2026 Cvetomir Grigorov. Licensed under the Apache License, Version 2.0 (see LICENSE).
// snowarch — AI ServiceNow Architect. Not affiliated with or endorsed by ServiceNow, Inc.
/**
 * ARC-11-C6, the owner's ruling from the rc.3 sitting (2026-10-13): "the user must not learn how to have a working
 * Architect without a licence". So no shipped file and no page a person is sent to read says how to get one: not the
 * sentence that sent a reader to the last release that runs without a licence, not the command that went there, and
 * not the name the code gave it. The path itself is closed too: `upgrade` refuses that move without a licence in force.
 *
 * SHIPPED is what a checkout runs and what Claude Code loads. PAGES are what a person reads: the top-level pages, the
 * package's, `docs/` and the issue templates, and the validation tests a sitting follows. The engineering record is
 * not swept: the plans, the validation records, the spikes and the decisions say what was built and ruled, the
 * reversal included, and the changelog's released sections are history (ARC-09-C17).
 *
 * The generic words "way back" are swept in the pages only. In shipped code they also mean other things (a reply lost
 * on the way back, the recovery key's way back in, the host menu's way back from a typo), and the precise patterns
 * are what cover the code.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { historyStartsAt } from './helpers/changelog-history.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** What the product said, and what would say it again. */
const PRECISE = [/go back to the last release/i, /last release that runs without/i, /upgrade --to v2\.0\.12(?![-\w]|\.\d)/,
  /\bWAY_BACK\b/];
const GENERIC = [/\bway back\b/i];

const isShipped = (f) => /^(tools\/snowarch\/(lib|bin|hooks)\/|packages\/snowarch\/(src|dist)\/|\.claude\/)/.test(f)
  || f === 'CLAUDE.md';
const isPage = (f) => /^[^/]+\.md$/.test(f) || /^packages\/snowarch\/[^/]+\.md$/.test(f)
  || f.startsWith('.github/ISSUE_TEMPLATE/') || f === 'tests/VALIDATION-TESTS.md'
  || (/^docs\/.+\.md$/.test(f) && !/^docs\/(plans|validation|spikes|decisions)\//.test(f));

/** The text a sweep reads: the changelog's live part only, every other file whole. */
function readable(f) {
  const text = readFileSync(join(root, f), 'utf8');
  if (f !== 'docs/CHANGELOG.md') return text;
  const lines = text.split('\n');
  return lines.slice(0, Math.min(historyStartsAt(lines), lines.length)).join('\n');
}

const tracked = () => execFileSync('git', ['ls-files'], { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
  .split('\n').filter(Boolean);

function hits(files, patterns) {
  const found = [];
  for (const f of files) {
    let text;
    try { text = readable(f); } catch { continue; }
    text.split('\n').forEach((line, i) => {
      if (patterns.some((re) => re.test(line))) found.push(`${f}:${i + 1}: ${line.trim().slice(0, 100)}`);
    });
  }
  return found;
}

test('ARC-11-C6 — the patterns catch the sentence step 6 shipped, and the command in it', () => {
  // A sweep that cannot match the thing it was written for proves nothing.
  const said = 'To go back to the last release that runs without a licence: ./snowarch upgrade --to v2.0.12.';
  for (const re of PRECISE.slice(0, 3)) assert.ok(re.test(said), String(re));
  assert.ok(GENERIC[0].test('prints the way back'));
  // A prerelease of 2.0.12 is a validation record's subject, not the way back.
  assert.equal(PRECISE[2].test('./snowarch upgrade --to v2.0.12-rc.2 --pre'), false);
  assert.equal(PRECISE[2].test('upgrade --to v2.0.12.1'), false);
});

test('ARC-11-C6 — no shipped file and no page says how to have a working Architect without a licence', () => {
  const files = tracked();
  const shipped = files.filter(isShipped);
  const pages = files.filter(isPage);
  // Non-vacuity: both sets are what they say they are.
  assert.ok(shipped.length > 300, `only ${shipped.length} shipped files`);
  assert.ok(pages.length > 20, `only ${pages.length} pages`);
  assert.ok(shipped.includes('tools/snowarch/lib/doctor/checks/licence.mjs') && pages.includes('docs/INSTALL.md'));
  const found = [...hits(shipped, PRECISE), ...hits(pages, [...PRECISE, ...GENERIC])];
  assert.deepEqual(found, [], `${found.length} place(s) still say it:\n  ${found.join('\n  ')}`);
});
