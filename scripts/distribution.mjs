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
import { existsSync, writeSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { engineeringNames, exportTree, shippedFiles, stage, trackedFiles, unlistedReferences } from './lib/distribution.mjs';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
// Synchronous writes and an exit code, never process.exit(): a piped report is never cut off (ARC-09-C6).
const out = (line) => writeSync(1, `${line}\n`);
const err = (line) => writeSync(2, `${line}\n`);

function main(argv) {
  const [cmd, arg, ref] = argv;
  if (cmd === '--check') {
    const shipped = shippedFiles(ROOT);
    const notShipped = trackedFiles(ROOT).length - shipped.length;
    if (argv.includes('--list')) for (const p of shipped) out(p);
    const refs = unlistedReferences(ROOT);
    for (const r of refs) err(`UNSHIPPED ${r.path} — reached by ${r.from}:${r.line} (${r.kind})`);
    // ARC-09-C185c: and no shipped file names the engineering repository.
    const names = engineeringNames(ROOT);
    for (const n of names) err(`NAMED ${n.file}:${n.line} — ${n.text}`);
    out(`distribution: shipped ${shipped.length} · not shipped ${notShipped} · unshipped references ${refs.length} `
      + `· engineering names ${names.length}`);
    return refs.length === 0 && names.length === 0 ? 0 : 1;
  }
  if (cmd === 'export' && arg) {
    const dir = resolve(arg);
    if (existsSync(dir)) {
      err(`distribution: ${dir} already exists — export into a new directory`);
      return 2;
    }
    out(`distribution: exported ${exportTree(ROOT, dir)} files to ${dir}`);
    return 0;
  }
  if (cmd === 'stage' && arg && ref && !ref.startsWith('--')) {
    const rest = argv.slice(3);
    const at = rest.indexOf('--onto');
    const onto = at === -1 ? null : rest[at + 1];
    if (at !== -1 && (!onto || onto.startsWith('--'))) {
      err('distribution: --onto takes the ref of the new commit\'s parent');
      return 2;
    }
    try {
      const s = stage(ROOT, resolve(arg), ref, { onto, tag: rest.includes('--tag') });
      out(`distribution: staged ${ref} in ${resolve(arg)} — commit ${s.commit}, tree ${s.tree}, `
        + `${s.files} files, corpus pin ${s.pin.slice(0, 7)}${s.parent ? `, parent ${s.parent.slice(0, 7)}` : ', no parent'}`
        + `${s.tag ? `, tag ${s.tag}` : ''}. Nothing was pushed.`);
      return 0;
    } catch (e) {
      err(`distribution: stage refused — ${e.message}`);
      return 1;
    }
  }
  err('usage: node scripts/distribution.mjs --check [--list] | export <dir> | stage <clone> <ref> [--onto <ref>] [--tag]');
  return 2;
}

process.exitCode = main(process.argv.slice(2));
