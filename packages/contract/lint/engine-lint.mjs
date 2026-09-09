#!/usr/bin/env node
/**
 * The engine lint: does any governing text cite something the server does not have?
 *
 * Five checks today (S04 adds the rest):
 *
 *   L01  every `snow_*` token is a tool in the contract
 *   L02  every `mcp__…__` prefix is the one `engine.config.json` declares
 *   L03  no retired name outside the three files where naming the past is the job
 *   L07  the registration key agrees across its four declarations
 *   L11  the pin's sha still describes the committed contract
 *
 * Usage:
 *   node packages/contract/lint/engine-lint.mjs [--json] [--root <dir>] [--only L01,L03]
 *
 * Exit 0 pass · 1 findings · 2 cannot run. "Cannot run" is separate from "found problems" on
 * purpose: a missing `dist/contract.json` means the check never happened, and a caller that
 * treated that as a pass would be reassured by silence.
 *
 * Stdlib only, no shelling out, no git. It has to work on a fresh clone before `npm ci`, and it
 * has to finish in a couple of seconds on every CI cell — including Windows, where spawning a
 * process per file would dominate the runtime.
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { scanFiles } from './lib/scan.mjs';
import { renderJson, renderText, statusOf } from './lib/report.mjs';
import * as l01 from './checks/l01-tokens.mjs';
import * as l02 from './checks/l02-prefix.mjs';
import * as l03 from './checks/l03-retired.mjs';
import * as l04 from './checks/l04-descriptions.mjs';
import * as l05 from './checks/l05-paths.mjs';
import * as l06 from './checks/l06-generated.mjs';
import * as l08 from './checks/l08-expectations.mjs';
import * as l09 from './checks/l09-used-by.mjs';
import * as l07 from './checks/l07-serverkey.mjs';
import * as l10 from './checks/l10-plugin-validate.mjs';
import * as l11 from './checks/l11-pin.mjs';

const CHECKS = [l01, l02, l03, l04, l05, l06, l07, l08, l09, l10, l11];

const argv = process.argv.slice(2);
const flag = (name) => argv.includes(name);
const value = (name) => {
  const i = argv.indexOf(name);
  return i === -1 ? undefined : argv[i + 1];
};

// `fileURLToPath`, never `new URL(...).pathname` — `/C:/…` on Windows is not a path.
const selfRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const root = resolve(value('--root') ?? selfRoot);
const asJson = flag('--json');
const only = (value('--only') ?? '').split(',').map((s) => s.trim()).filter(Boolean);

const readJson = (p) => JSON.parse(readFileSync(p, 'utf8'));
const cannotRun = (message) => {
  process.stderr.write(`engine-lint: ${message}\n`);
  process.exit(2);
};

const contractPath = join(root, 'packages', 'snowarch', 'dist', 'contract.json');
const pinPath = join(root, 'packages', 'contract', 'required-tools.json');
const retiredPath = join(root, 'packages', 'contract', 'retired-names.json');
const configPath = join(root, 'engine.config.json');
const mcpPath = join(root, '.mcp.json');

if (!existsSync(contractPath)) {
  cannotRun(`${contractPath} is missing — the contract is a build artefact; run node scripts/build-dist.mjs`);
}
for (const p of [pinPath, retiredPath, configPath]) {
  if (!existsSync(p)) cannotRun(`${p} is missing`);
}

let ctx;
try {
  const contractText = readFileSync(contractPath, 'utf8');
  const config = readJson(configPath);
  const serverKey = config?.mcp?.serverKey;
  if (typeof serverKey !== 'string' || serverKey.length === 0) {
    cannotRun('engine.config.json has no mcp.serverKey — L02 has no expected value to compare against');
  }
  ctx = {
    root,
    files: scanFiles(root),
    contractText,
    contract: JSON.parse(contractText),
    requiredTools: readJson(pinPath),
    retiredNames: readJson(retiredPath),
    serverKey,
    config,
    // True when the lint is running against its own repository rather than a fixture tree.
    // L06 needs it: two generators take no --root and would check the real repo from a fixture.
    isSelfRoot: root === selfRoot,
    requireClaude: flag('--require-claude'),
    // A check that cannot run says so through the CLI rather than deciding an exit code itself.
    cannotRun,
    // A check that could not run adds its id here; `statusOf` already has the vocabulary
    // for it, and a skip rendered as a pass is the one outcome a reader must not see.
    skipped: new Set(),
    mcpJson: existsSync(mcpPath) ? readJson(mcpPath) : null,
    skipNotes: [],
  };
} catch (e) {
  cannotRun(`could not read an input: ${e.message}`);
}

const selected = only.length > 0 ? CHECKS.filter((c) => only.includes(c.id)) : CHECKS;
if (only.length > 0) {
  const unknown = only.filter((id) => !CHECKS.some((c) => c.id === id));
  if (unknown.length > 0) cannotRun(`--only names unknown check(s): ${unknown.join(', ')}`);
}

const results = selected.map((check) => {
  const findings = check.run(ctx);
  return {
    id: check.id,
    findings,
    status: statusOf({ ...check, skipped: ctx.skipped.has(check.id) }, findings),
  };
});

process.stdout.write(asJson ? renderJson(results) : renderText(results));

// The skip notes go to stderr, not into the JSON: they say what was NOT checked, which is
// operator information rather than a finding, and putting them in `findings` would make a
// consumer count them as problems.
for (const note of ctx.skipNotes) process.stderr.write(`SKIP ${note}\n`);

process.exit(results.some((r) => r.status === 'fail') ? 1 : 0);
