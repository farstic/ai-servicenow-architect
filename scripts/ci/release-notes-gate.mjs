#!/usr/bin/env node
// Copyright 2026 Cvetomir Grigorov. Licensed under the Apache License, Version 2.0 (see LICENSE).
// snowarch — AI ServiceNow Architect. Not affiliated with or endorsed by ServiceNow, Inc.
/**
 * ARC-11-C6 — the release's `notes` gate: the section this cut will write, swept before anything is written.
 *
 * The v2.0.13 cut of 2026-10-13 wrote, from commit subjects, lines that the owner's ruling forbids a page to carry,
 * and nothing read them: the changelog's own sweep reads only its live part, and the section did not exist until
 * the release wrote it. So the release renders the section itself, here, the way `writeChangelog` will. It reads
 * the commits since the previous final, applies the committed overrides, and adds the hand-written block it will
 * carry. It then sweeps the lot with the patterns the page sweep uses. It runs among the release's gates, before
 * the writes, so the dry run fails too.
 *
 * Usage: node scripts/ci/release-notes-gate.mjs [--from <tag>]
 * Exit 0 the section is clean · 1 it says what the ruling forbids · 2 usage, or git could not read the range.
 */
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { extractUnreleased, readCommits, readOverrides, renderGroups } from '../lib/release/changelog.mjs';
import { forbiddenLines, GENERIC, PRECISE } from '../lib/release/no-way-back.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

/** `{ ok, hits, lines }` for the section a cut from `from` would write. */
export function notesGate({ root = ROOT, from = null, git, read = (p) => readFileSync(join(root, p), 'utf8') } = {}) {
  const commits = readCommits({ root, from, git });
  const body = renderGroups(commits, { overrides: readOverrides(root) });
  const carried = extractUnreleased(read('docs/CHANGELOG.md')) ?? '';
  const text = `${carried}\n${body}`;
  const hits = forbiddenLines(text, [...PRECISE, ...GENERIC]);
  return { ok: hits.length === 0, hits, lines: text.split('\n').length };
}

function main(argv) {
  const at = argv.indexOf('--from');
  if (at !== -1 && !argv[at + 1]) {
    process.stderr.write('usage: node scripts/ci/release-notes-gate.mjs [--from <tag>]\n');
    return 2;
  }
  let r;
  try {
    r = notesGate({ from: at === -1 ? null : argv[at + 1] });
  } catch (e) {
    process.stderr.write(`release notes: ${e?.message ?? e}\n`);
    return 2;
  }
  if (r.ok) {
    process.stdout.write(`release notes: clean (${r.lines} lines)\n`);
    return 0;
  }
  process.stderr.write(`release notes: ${r.hits.length} line(s) say what the owner's ruling forbids a page to say. `
    + `Give each one an override in scripts/lib/release/notes-overrides.json, or reword it:\n`);
  for (const h of r.hits) process.stderr.write(`  ${h.text}\n`);
  return 1;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) process.exitCode = main(process.argv.slice(2));
