#!/usr/bin/env node
/**
 * Extract all tool definitions to a static JSON manifest.
 * Run after `npm run build` in root: node scripts/extract-tools.mjs
 * Output: dist/tools-manifest.json
 */
import { pathToFileURL } from 'url';
import { join, dirname } from 'path';
import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const distTools = join(__dirname, '..', 'dist', 'tools', 'index.js');

const { collectToolCatalog } = await import(pathToFileURL(distTools).href);
const tools = collectToolCatalog();

const manifest = tools.map(t => ({
  name: t.name,
  description: t.description,
  inputSchema: t.inputSchema,
  gate: t.gate,
  mutates: t.mutates,
  ...(t.sessionMutates ? { sessionMutates: t.sessionMutates } : {}),
  ...(t.alsoRequires ? { alsoRequires: t.alsoRequires } : {}),
  ...(t.table ? { table: t.table } : {}),
}));

const outPath = join(__dirname, '..', 'dist', 'tools-manifest.json');
writeFileSync(outPath, JSON.stringify(manifest, null, 2));
console.log(`Extracted ${manifest.length} tools → dist/tools-manifest.json`);

// ARC-04-S07 raised this from 397 to 398: snow_us_capture_target_set. ARC-04-S08 takes it
// back to 397 by removing snow_rpt_report_generate (D-03 item 4) while KEEPING the two retired
// script-exec tools registered as [Unsupported] stubs. `contract.toolCount` is DERIVED from the
// catalogue, never a literal, so the contract cannot disagree with the code even when this
// constant lags.
const EXPECTED = 397;
// S07 adds snow_us_capture_target_set (+1) and S08 removes snow_rpt_report_generate (−1)
// while keeping the two retired script-exec tools as [Unsupported] stubs; each bumps this
// constant in its own PR. `contract.toolCount` is DERIVED from the catalogue, never a
// literal, so the contract cannot disagree with the code even when this constant lags.
const unique = new Set(manifest.map(t => t.name));
if (manifest.length !== EXPECTED || unique.size !== EXPECTED) {
  console.error(`✗ Tool count parity failed: ${manifest.length} tools (${unique.size} unique), expected ${EXPECTED}.`);
  process.exit(1);
}
const unnamespaced = manifest.filter(t => !t.name.startsWith('snow_')).map(t => t.name);
if (unnamespaced.length) {
  console.error(`✗ Un-namespaced tool names: ${unnamespaced.join(', ')}`);
  process.exit(1);
}
console.log(`✓ Parity OK: ${EXPECTED} unique snow_* tools.`);

// ── The contract ──────────────────────────────────────────────────────────────
//
// One generated artefact, so ARC-05's §2.1 ask list, the §2.2 protocol text and the doctor
// read tool names, gates and error codes from the code rather than from prose (P-36).
//
// DESCRIPTIONS AND INPUT SCHEMAS ARE NOT IN IT. They change for editorial reasons, and a sha
// that moved every time someone improved a sentence would be pinned to nothing. The sha
// covers what a consumer's behaviour depends on: names, gates, mutates, tables, flags,
// presets, error codes.
{
  const { PRESETS, FLAG_NAMES } = await import('../dist/utils/permissions.js');
  const { ERROR_CODES } = await import('../dist/errors/codes.js');
  const { createHash } = await import('node:crypto');
  const pkg = JSON.parse(readFileSync(join(__dirname, '..', 'package.json'), 'utf8'));

  const REQUIRES = {
    WRITE_ENABLED: [], CMDB_WRITE_ENABLED: ['WRITE_ENABLED'], SCRIPTING_ENABLED: ['WRITE_ENABLED'],
    ATF_ENABLED: [], NOW_ASSIST_ENABLED: [], FLUENT_ENABLED: [],
  };

  const contract = {
    contractVersion: 1,
    product: 'snowarch',
    // The package version of record. ARC-09 sets the release number; until then every
    // artefact says 2.0.0-dev, and tests/version-consistency.test.mjs enforces it.
    version: pkg.version,
    server: { suggestedName: 'servicenow' },
    flags: FLAG_NAMES.map((name) => ({
      name, exactString: 'true', absentMeans: false, requires: REQUIRES[name],
    })),
    gates: {
      none: [],
      write: ['WRITE_ENABLED'],
      cmdb_write: ['WRITE_ENABLED', 'CMDB_WRITE_ENABLED'],
      scripting: ['WRITE_ENABLED', 'SCRIPTING_ENABLED'],
      atf: ['ATF_ENABLED'],
      now_assist: ['NOW_ASSIST_ENABLED'],
      fluent: { requires: ['FLUENT_ENABLED'], requiresWriteWhenMutating: true },
    },
    errorCodes: [...ERROR_CODES].sort((a, b) => a.code.localeCompare(b.code)),
    tools: manifest
      .map((t) => ({
        name: t.name, gate: t.gate, mutates: t.mutates,
        ...(t.sessionMutates ? { sessionMutates: t.sessionMutates } : {}),
        ...(t.alsoRequires ? { alsoRequires: t.alsoRequires } : {}),
        ...(t.table ? { table: t.table } : {}),
      }))
      .sort((a, b) => a.name.localeCompare(b.name)),
    presets: PRESETS,
    protocols: {
      updateSetCapture: [
        'snow_us_active_update_set_ensure', 'snow_us_capture_target_set', '<write>',
        'snow_us_update_set_preview',
      ],
    },
    toolPackage: 'full',
    maxRecordsDefault: 100,
    // Derived, never a literal: the constant above can lag a story, this cannot.
    toolCount: manifest.length,
  };

  // Deterministic: sorted where order is not semantic, \n endings, trailing newline — so
  // ARC-04-S13's rebuild-diff is stable and a sha means something.
  const text = `${JSON.stringify(contract, null, 2)}\n`;
  const contractPath = join(__dirname, '..', 'dist', 'contract.json');
  writeFileSync(contractPath, text);
  const sha = createHash('sha256').update(text).digest('hex');
  console.log(`Wrote dist/contract.json (${contract.toolCount} tools, sha256 ${sha.slice(0, 12)}…)`);
}
