#!/usr/bin/env node
/**
 * The `docs/ARCHITECTURE.md` "Doctor" section's two moving blocks.
 *
 * The prose around them is hand-written and stays that way. What is generated is the JSON SHAPE and
 * the renderer SAMPLE — a documentation block that embeds a moving value is a block that goes stale
 * the first time the value moves, and nobody re-reads a section they already believe. Both are
 * rendered from the real modules with a fixture registry, so the page shows what the doctor
 * actually produces.
 *
 * Usage: `node scripts/gen-doctor-docs.mjs [--check]` · exit 0 current/written · 1 stale.
 *
 * Stdlib only — it runs inside `npm run lint`.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { engineChecks } from '../tools/snowarch/lib/doctor/checks/index.mjs';
import { FIXERS, TARGETS } from '../tools/snowarch/lib/doctor/fix.mjs';
import { createRegistry } from '../tools/snowarch/lib/doctor/registry.mjs';
import { buildReport } from '../tools/snowarch/lib/doctor/report-json.mjs';
import { renderText } from '../tools/snowarch/lib/doctor/report-text.mjs';
import { runChecks } from '../tools/snowarch/lib/doctor/runner.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const TARGET = 'docs/ARCHITECTURE.md';
const CHECK = process.argv.includes('--check');

/** Three checks, one per outcome, so the sample shows every status a reader will meet. */
const FIXTURE = [
  { id: 'E-00', section: 'prereqs', title: 'Claude Code CLI', severity: 'fail', quick: true,
    network: false, spawns: false, fixable: false,
    run: async () => ({ status: 'ok', detail: '2.1.258 >= 2.1.214, logged in' }) },
  { id: 'E-12', section: 'docs', title: 'docs corpus', severity: 'fail', quick: false,
    network: false, spawns: false, fixable: true,
    run: async () => ({ status: 'fail', detail: 'corpus absent (docs mode "skip")',
      remedy: 'run ./snowarch docs sync' }) },
  { id: 'SV-03', section: 'server', title: 'instance flags', severity: 'warn', quick: false,
    network: false, spawns: false, fixable: true,
    run: async () => ({ status: 'warn', detail: 'instance "pdi": 4/6 flags explicit',
      remedy: 'the doctor writes the missing ones as "false"' }) },
];

export async function sample() {
  const registry = createRegistry(FIXTURE);
  const checks = registry.all();
  const { results, summary } = await runChecks(checks, { contract: null }, { now: () => 0 });
  const report = buildReport({
    results, checks, summary,
    options: { quick: false, noNetwork: false, fix: false, section: null },
    ranAt: '2026-09-04T10:00:12Z',
    durationMs: 1830,
    modeLine: 'Mode: design-only — no ServiceNow instance configured; run ./snowarch instance add '
      + 'or /snowarch setup-instance to add one',
    // The version is pinned in the SAMPLE rather than read: a documentation block that changed on
    // every version bump would be a diff in every release commit and a page nobody trusts.
    root: null,
  });
  // The version is pinned in the SAMPLE rather than read from the checkout: a documentation block
  // that changed on every version bump would be a diff in every release commit, and a page whose
  // diffs are always noise is a page nobody reads the diffs of.
  const pinned = { ...report, version: '2.0.0' };
  return {
    json: JSON.stringify(pinned, null, 2),
    text: renderText({ report: pinned, checks, colour: false }),
  };
}

/**
 * The check list, from the registry itself.
 *
 * ARC-08-S02's definition of done asks for "E-00…E-22 with one line each" on this page. Typed out,
 * that list is stale the first time a check moves section or leaves `--quick` — the roster's own
 * lesson (P-12), one directory further down. So it is rendered from the declarations, and the
 * `--quick` column is computed the way the runner computes it rather than copied from the flag.
 */
export function checkTable(checks = engineChecks()) {
  const rows = ['| Check | Section | What it answers | `--quick` | `--fix` |', '|---|---|---|---|---|'];
  for (const c of checks) {
    const quick = c.quick && !c.spawns && !c.network ? 'yes' : '—';
    rows.push(`| \`${c.id}\` | ${c.section} | ${c.title} | ${quick} | ${c.fixable ? 'yes' : '—'} |`);
  }
  return rows.join('\n');
}

/**
 * The `--fix` whitelist, from `FIXERS` itself.
 *
 * The list being CLOSED is the feature, so the page a user reads must be the list the code
 * applies — not a copy of it that was true when somebody wrote the page.
 */
export function fixTable(fixers = FIXERS) {
  const rows = ['| Fix | Trigger (`data.fix.kind`) | What it does | Touches |', '|---|---|---|---|'];
  for (const f of fixers) {
    rows.push(`| \`${f.id}\` | \`${f.kind}\` | ${f.title} | \`${TARGETS[f.kind] ?? '—'}\` |`);
  }
  return rows.join('\n');
}

function replaceRegion(doc, name, body) {
  const open = `<!-- generated:${name} -->`;
  const close = `<!-- /generated:${name} -->`;
  const start = doc.indexOf(open);
  const stop = doc.indexOf(close, start);
  if (start === -1 || stop === -1) throw new Error(`${TARGET}: no ${name} region`);
  return `${doc.slice(0, start + open.length)}\n${body}\n${doc.slice(stop)}`;
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const { json, text } = await sample();
  const current = readFileSync(join(root, TARGET), 'utf8');
  let next = replaceRegion(current, 'doctor-json', ['```json', json, '```'].join('\n'));
  next = replaceRegion(next, 'doctor-text', ['```', text, '```'].join('\n'));
  next = replaceRegion(next, 'doctor-checks', checkTable());
  next = replaceRegion(next, 'doctor-fixes', fixTable());

  if (current.replace(/\r\n/g, '\n') === next) {
    process.stdout.write(`gen-doctor-docs: ${TARGET} current (4 blocks).\n`);
  } else if (CHECK) {
    process.stdout.write(`gen-doctor-docs: ${TARGET} is stale — run npm run gen and commit the result\n`);
    process.exit(1);
  } else {
    writeFileSync(join(root, TARGET), next);
    process.stdout.write(`gen-doctor-docs: wrote ${TARGET} (4 blocks).\n`);
  }
}
