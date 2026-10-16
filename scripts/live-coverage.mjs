#!/usr/bin/env node
// Copyright 2026 Cvetomir Grigorov. Licensed under the Business Source License 1.1 (see LICENSE).
// snowarch — AI ServiceNow Architect. Not affiliated with or endorsed by ServiceNow, Inc.
/**
 * `docs/validation/LIVE-COVERAGE.md` — the live-coverage ledger, generated (ARC-09-C167a).
 *
 * Reads the server's tool manifest, the hand-kept `docs/validation/live-coverage.json`, the sitting records under
 * `docs/validation/` and `docs/PLATFORM-NOTES.md`. Registered in `scripts/lib/generators.mjs`, so `npm run gen`
 * writes the page and `npm run gen:check` — `npm run lint`, and the contract gate's `generated` step — fails when
 * the page is stale, when a manifest tool has no entry, or when an entry's evidence does not hold.
 *
 * Usage: node scripts/live-coverage.mjs [--check]
 * Exit: 0 current or written · 1 stale or a ledger problem · 2 cannot run (a missing input).
 */
import { existsSync, readdirSync, readFileSync, writeFileSync, writeSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isRecord, LEDGER, problems, render, TARGET, tally, totalsLine } from './lib/live-coverage.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const CHECK = process.argv.includes('--check');
const MANIFEST = 'packages/snowarch/dist/tools-manifest.json';
const die = (why) => { writeSync(2, `live-coverage: ${why}\n`); process.exit(2); };

for (const f of [MANIFEST, LEDGER]) if (!existsSync(join(root, f))) die(`${f} is missing`);
const manifest = JSON.parse(readFileSync(join(root, MANIFEST), 'utf8'));
const tools = (Array.isArray(manifest) ? manifest : manifest.tools).map((t) => t.name);
const ledger = JSON.parse(readFileSync(join(root, LEDGER), 'utf8'));
const records = Object.fromEntries([
  ...readdirSync(join(root, 'docs/validation')).map((f) => `docs/validation/${f}`),
  'docs/PLATFORM-NOTES.md',
].filter(isRecord).map((p) => [p, readFileSync(join(root, p), 'utf8')]));

const found = problems({ tools, ledger, records });
if (found.length > 0) {
  writeSync(1, `live-coverage: ${found.length} problem(s) in ${LEDGER}:\n  ${found.join('\n  ')}\n`);
  process.exit(1);
}

const body = render({ tools, ledger, records });
const line = totalsLine(tally({ tools, ledger, records }));
const current = existsSync(join(root, TARGET)) ? readFileSync(join(root, TARGET), 'utf8') : null;
if (current === body) {
  writeSync(1, `live-coverage: ${TARGET} current — ${line}\n`);
} else if (CHECK) {
  writeSync(1, `live-coverage: ${TARGET} is stale — run npm run gen and commit the result\n`);
  process.exitCode = 1;
} else {
  writeFileSync(join(root, TARGET), body);
  writeSync(1, `live-coverage: wrote ${TARGET} — ${line}\n`);
}
