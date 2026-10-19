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
 *   node scripts/distribution.mjs stage <clone> <ref> [--onto <ref>] [--tag]
 *                                                     <ref> as one reproducible commit in the distribution clone (made
 *                                                     with git init when absent): the shipped files and the corpus
 *                                                     gitlink. --tag adds the annotated tag. It never pushes.
 */
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { exportTree, shippedFiles, stage, trackedFiles, unlistedReferences } from './lib/distribution.mjs';

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
} else if (cmd === 'stage' && arg && process.argv[4] && !process.argv[4].startsWith('--')) {
  const rest = process.argv.slice(5);
  const at = rest.indexOf('--onto');
  const onto = at === -1 ? null : rest[at + 1];
  if (at !== -1 && (!onto || onto.startsWith('--'))) {
    console.error('distribution: --onto takes the ref of the new commit\'s parent');
    process.exit(2);
  }
  const ref = process.argv[4];
  try {
    const s = stage(ROOT, resolve(arg), ref, { onto, tag: rest.includes('--tag') });
    console.log(`distribution: staged ${ref} in ${resolve(arg)} — commit ${s.commit}, tree ${s.tree}, `
      + `${s.files} files, corpus pin ${s.pin.slice(0, 7)}${s.parent ? `, parent ${s.parent.slice(0, 7)}` : ', no parent'}`
      + `${s.tag ? `, tag ${s.tag}` : ''}. Nothing was pushed.`);
  } catch (e) {
    console.error(`distribution: stage refused — ${e.message}`);
    process.exit(1);
  }
} else {
  console.error('usage: node scripts/distribution.mjs --check [--list] | export <dir> | stage <clone> <ref> [--onto <ref>] [--tag]');
  process.exit(2);
}
