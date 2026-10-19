#!/usr/bin/env node
// Copyright 2026 Cvetomir Grigorov. Licensed under the Business Source License 1.1 (see LICENSE).
// snowarch — AI ServiceNow Architect. Not affiliated with or endorsed by ServiceNow, Inc.
/**
 * ARC-09-C185a — what a user receives, from the one list (`COVERAGE`).
 *
 *   node scripts/distribution.mjs --check [--list]   shipped N · not shipped M, and every path the runtime reaches that
 *                                                     does not ship (exit 1 on any). --list prints the shipped files.
 *   node scripts/distribution.mjs export <dir>        the shipped files as HEAD has them, into <dir>, which must not
 *                                                     exist yet. No .git, no history.
 */
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { exportTree, shippedFiles, trackedFiles, unlistedReferences } from './lib/distribution.mjs';

const ROOT = resolve(new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const [cmd, arg] = process.argv.slice(2);

if (cmd === '--check') {
  const shipped = shippedFiles(ROOT);
  const notShipped = trackedFiles(ROOT).length - shipped.length;
  if (process.argv.includes('--list')) for (const p of shipped) console.log(p);
  const refs = unlistedReferences(ROOT);
  for (const r of refs) console.error(`UNSHIPPED ${r.path} — reached by ${r.from}:${r.line} (${r.kind})`);
  console.log(`distribution: shipped ${shipped.length} · not shipped ${notShipped} · unshipped references ${refs.length}`);
  process.exit(refs.length === 0 ? 0 : 1);
} else if (cmd === 'export' && arg) {
  const dir = resolve(arg);
  if (existsSync(dir)) {
    console.error(`distribution: ${dir} already exists — export into a new directory`);
    process.exit(2);
  }
  console.log(`distribution: exported ${exportTree(ROOT, dir)} files to ${dir}`);
} else {
  console.error('usage: node scripts/distribution.mjs --check [--list] | export <dir>');
  process.exit(2);
}
