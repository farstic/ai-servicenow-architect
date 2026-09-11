#!/usr/bin/env node
/**
 * What the install actually cost, on this machine, this time.
 *
 * ARC-09-S03. `docs/INSTALL.md` tells a reader the corpus is "about 302 MB and about 30 seconds",
 * and those numbers came from one measurement on one day. A release attaches the same measurement
 * taken on all three runners, so the page can be checked against the platform the reader is on
 * rather than against the platform whoever wrote it was on.
 *
 * The columns are ARC-06-S14's, deliberately: `corpus MB (file bytes)` means the SUM OF FILE SIZES,
 * not `du`'s allocated blocks — the two differ by about 3% on these runners, `du` does not exist on
 * Windows, and a column that silently meant two things on three platforms would be worse than one
 * that says which.
 *
 * Usage:
 *   node scripts/ci/install-metrics.mjs <os>              one machine, as JSON
 *   node scripts/ci/install-metrics.mjs --table <files…>  the three merged, as the markdown table
 *
 * Exit 0 · 2 cannot run. Stdlib only; no `du`, no shell.
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

const argv = process.argv.slice(2);
const value = (n) => (argv.indexOf(n) === -1 ? undefined : argv[argv.indexOf(n) + 1]);
const ROOT = resolve(value('--root') ?? process.cwd());

const die = (m) => { process.stderr.write(`install-metrics: ${m}\n`); process.exit(2); };

/**
 * Bytes under a directory: the sum of file sizes, walked.
 *
 * Walked rather than `git ls-files | wc -l`, which counts TRACKED paths — 49,000 of them — when
 * what a reader wants is what is on their disk after a SPARSE checkout, which is 34,000. Two
 * different numbers, and the smaller one is the honest answer to "what did this cost me".
 *
 * Symlinks are counted as links, not as what they point at — a fixture tree links the corpus in,
 * and following it would report the same 179 MB as if it had been copied.
 */
export function directorySize(dir) {
  if (!existsSync(dir)) return { bytes: 0, files: 0 };
  let bytes = 0;
  let files = 0;
  const stack = [dir];
  while (stack.length) {
    const current = stack.pop();
    let entries;
    try { entries = readdirSync(current, { withFileTypes: true }); } catch { continue; }
    for (const entry of entries) {
      const p = join(current, entry.name);
      if (entry.isSymbolicLink()) continue;
      if (entry.isDirectory()) { stack.push(p); continue; }
      if (!entry.isFile()) continue;
      try { bytes += statSync(p).size; files += 1; } catch { /* vanished mid-walk */ }
    }
  }
  return { bytes, files };
}

/** Seconds, one decimal — the unit a reader compares against the install page. */
export const seconds = (ms) => (Number.isFinite(ms) ? Math.round(ms / 100) / 10 : null);

/** Megabytes, whole — the unit the page and ARC-06-S14's summary both use. */
export const megabytes = (bytes) => Math.round(bytes / (1024 * 1024));

/**
 * One machine's numbers, from the state file the bootstrap wrote and the tree it produced.
 *
 * `durationMs` is on every step unconditionally (ARC-06-S03), so nothing has to be asked for or
 * turned on: the install records what it cost while it is doing it, which is the only moment the
 * number is available.
 */
export function collect({ root = ROOT, os, node = process.version } = {}) {
  const statePath = join(root, '.local/bootstrap-state.json');
  if (!existsSync(statePath)) die(`${statePath} is not there — run the bootstrap first`);
  const state = JSON.parse(readFileSync(statePath, 'utf8'));

  const total = Object.values(state.steps ?? {})
    .reduce((sum, step) => sum + (Number(step?.durationMs) || 0), 0);

  const docs = directorySize(join(root, 'vendor/ServiceNowDocs'));
  const deps = directorySize(join(root, 'node_modules'));

  return {
    os: os ?? process.platform,
    node,
    docsBytes: docs.bytes,
    docsFiles: docs.files,
    docsSeconds: seconds(state.steps?.B02?.durationMs),
    depsBytes: deps.bytes,
    bootstrapSeconds: seconds(total),
  };
}

/** The markdown table `docs/INSTALL.md` links to. One row per machine, in the order given. */
export function table(rows) {
  const head = ['| OS | docs on disk | docs files | B02 time | node_modules | bootstrap total |',
    '|---|---|---|---|---|---|'];
  const body = rows.map((r) => `| ${r.os} | ${megabytes(r.docsBytes)} MB | ${r.docsFiles} `
    + `| ${r.docsSeconds ?? '—'} s | ${megabytes(r.depsBytes)} MB | ${r.bootstrapSeconds ?? '—'} s |`);
  return [
    '### Install metrics',
    '',
    ...head, ...body,
    '',
    '`docs on disk` and `node_modules` are the **sum of file sizes**, not `du`\'s allocated blocks —',
    'about 3% smaller, and the only figure that means the same thing on all three platforms.',
    '',
  ].join('\n');
}

const isMain = process.argv[1] && resolve(process.argv[1]).endsWith('install-metrics.mjs');
if (isMain) {
  if (argv.includes('--table')) {
    const files = argv.filter((a) => a.endsWith('.json'));
    if (files.length === 0) die('--table needs the per-OS JSON files');
    const rows = files.map((f) => JSON.parse(readFileSync(resolve(f), 'utf8')));
    process.stdout.write(table(rows));
  } else {
    const os = argv.find((a) => !a.startsWith('--') && argv[argv.indexOf(a) - 1] !== '--root');
    process.stdout.write(`${JSON.stringify(collect({ os }), null, 2)}\n`);
  }
}
