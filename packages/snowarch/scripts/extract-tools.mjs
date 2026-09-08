#!/usr/bin/env node
/**
 * Extract all tool definitions to a static JSON manifest.
 * Run after `npm run build` in root: node scripts/extract-tools.mjs
 * Output: dist/tools-manifest.json
 */
import { pathToFileURL } from 'url';
import { join, dirname } from 'path';
import { writeFileSync } from 'fs';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const distTools = join(__dirname, '..', 'dist', 'tools', 'index.js');

const { collectToolCatalog } = await import(pathToFileURL(distTools).href);
const tools = collectToolCatalog();

const manifest = tools.map(t => ({
  name: t.name,
  description: t.description,
  inputSchema: t.inputSchema,
}));

const outPath = join(__dirname, '..', 'dist', 'tools-manifest.json');
writeFileSync(outPath, JSON.stringify(manifest, null, 2));
console.log(`Extracted ${manifest.length} tools → dist/tools-manifest.json`);

// Migration guard: the catalog must expose exactly this many unique, namespaced tools.
// ARC-04-S04 raised this from 394 to 397: three core tools that need no instance
// (snow_core_status_read, snow_core_capabilities_read, snow_core_instances_reload).
// ARC-04-S06 owns the arithmetic from here — its EXPECTED is 397 minus the one removal
// (snow_rpt_report_generate, ARC-04-S08) plus whatever it adds.
const EXPECTED = 397;
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
