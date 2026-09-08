#!/usr/bin/env node
/**
 * One-off seeding for ARC-04-S06, committed for reproducibility.
 *
 * `gate` is DERIVED, not guessed: every tool is called with all six flags "false" through a
 * client whose every method throws a sentinel, and the code that comes back says which gate
 * it hit. A tool that reaches the client is `none`. This is the same technique parity.test.ts
 * uses, and it is the only way to get 397 declarations that match the code rather than the
 * documentation.
 *
 * `mutates` is derived from the name suffix, then reviewed: the suffix grammar is
 * resource-first (`snow_<domain>_<entity>_<action>`), so the action is the last segment.
 *
 * Anomalies are printed rather than fixed — a script that silently corrects the thing it is
 * auditing cannot be used as evidence. They are fixed by hand in the same story.
 *
 *   node scripts/seed-declarations.mjs            # review table + anomalies
 *   node scripts/seed-declarations.mjs --json     # machine-readable, for the patcher
 */
import { readdirSync, readFileSync } from 'node:fs';
import { collectToolCatalog, routeToolInvocation } from '../dist/tools/index.js';
import { runWithInstance } from '../dist/servicenow/context.js';

const FLAG_NAMES = ['WRITE_ENABLED', 'CMDB_WRITE_ENABLED', 'SCRIPTING_ENABLED',
  'ATF_ENABLED', 'NOW_ASSIST_ENABLED', 'FLUENT_ENABLED'];

const SENTINEL = 'MOCK_CLIENT_CALL';
const throwingClient = new Proxy({}, {
  get: () => () => { throw Object.assign(new Error('client reached'), { code: SENTINEL }); },
});

const CODE_TO_GATE = {
  WRITE_NOT_ENABLED: 'write',
  CMDB_WRITE_NOT_ENABLED: 'cmdb_write',
  SCRIPTING_NOT_ENABLED: 'scripting',
  ATF_NOT_ENABLED: 'atf',
  NOW_ASSIST_NOT_ENABLED: 'now_assist',
  FLUENT_NOT_ENABLED: 'fluent',
};

// The composite gates report WRITE first when WRITE is missing, so all-false cannot tell
// cmdb_write from write. A second pass with WRITE on resolves it.
const flags = (over = {}) => Object.fromEntries(FLAG_NAMES.map((f) => [f, over[f] ?? 'false']));
const rt = (f) => ({
  label: 'seed', url: 'https://seed.invalid', environment: 'dev', preset: 'custom',
  flags: f, effectiveFlags: f, toolPackage: 'full', maxRecords: 100, prodWriteAck: false,
  client: {}, warnings: [],
});

async function codeWith(name, f) {
  return runWithInstance(rt(f), async () => {
    try { await routeToolInvocation(throwingClient, name, {}); return 'RETURNED'; }
    catch (e) { return String(e?.code ?? 'NO_CODE'); }
  });
}

async function deriveGate(name) {
  const first = await codeWith(name, flags());
  if (!CODE_TO_GATE[first]) return 'none';
  if (first !== 'WRITE_NOT_ENABLED') return CODE_TO_GATE[first];
  // WRITE was the blocker. With WRITE on, a composite gate reveals its second flag.
  const second = await codeWith(name, flags({ WRITE_ENABLED: 'true' }));
  return CODE_TO_GATE[second] ?? 'write';
}

const MUTATING_SUFFIX = new RegExp('_(' + [
  'add', 'modify', 'remove', 'exec', 'set', 'ensure', 'switch', 'complete', 'publish',
  'commit', 'trigger', 'send', 'fire', 'approve', 'reject', 'close', 'resolve', 'retire',
  'upload', 'assign', 'unassign', 'import', 'clone', 'rollback', 'track', 'train',
  'configure', 'schedule', 'reconcile', 'order', 'annotate', 'install', 'deploy',
].join('|') + ')$');

// Hand list: names whose action word does not carry its effect.
const FORCE_MUTATES = new Set([
  'snow_core_natural_language_modify', 'snow_fluent_request_batch', 'snow_fluent_script_exec',
  'snow_fluent_build', 'snow_fluent_init', 'snow_deploy_solution_package_add',
]);
// Reads whose suffix looks mutating: `_export` writes nothing on the instance, and switching
// or reloading an instance changes only this process.
const FORCE_READS = new Set([
  'snow_us_update_set_export', 'snow_core_instance_switch', 'snow_core_instances_reload',
  'snow_rpt_report_data_export', 'snow_cfg_properties_export', 'snow_us_update_set_preview',
  // `_exec` in the suffix grammar means "run this", and running a QUERY changes nothing.
  // Both of these read and summarise; neither writes to the instance.
  'snow_ml_virtual_agent_nlu_exec', 'snow_rpt_aggregate_query_exec',
]);

/**
 * The SOURCE gate: which require*() the dispatcher case calls.
 *
 * The probe alone is not enough, and the first run of this script proved it: a tool whose
 * gate sits AFTER its argument validation throws INVALID_REQUEST on an empty argument
 * object, so the probe never reaches the gate and reports `none` — which would have baked a
 * missing gate into the contract for tools that in fact have one.
 *
 * Reading both and comparing them is the point: the source says what was intended, the probe
 * says what a caller experiences, and a disagreement is exactly the anomaly worth fixing.
 */
const GATE_OF_CALL = {
  requireWrite: 'write', requireCmdbWrite: 'cmdb_write', requireScripting: 'scripting',
  requireAtf: 'atf', requireNowAssist: 'now_assist', requireFluent: 'fluent',
};

function sourceGates() {
  const out = new Map();
  const dir = new URL('../src/tools/', import.meta.url);
  for (const file of readdirSync(dir)) {
    if (!file.endsWith('.ts')) continue;
    const text = readFileSync(new URL(file, dir), 'utf8');
    const lines = text.split('\n');
    let current = null;
    // A gate between `export async function dispatch…` and `switch (name)` applies to EVERY
    // case in the module and fires FIRST. Three modules have one (discovery, now-assist,
    // now-assist-skills), and a case-level gate underneath it is unreachable until the outer
    // one passes — so the outer gate is what a caller hits, and it is what the tool declares.
    let preSwitch = null;
    {
      const start = lines.findIndex((l) => /export async function dispatch/.test(l));
      if (start !== -1) {
        for (let n = start; n < lines.length; n += 1) {
          if (/switch \(name\)/.test(lines[n])) break;
          const r = /\b(require(?:Write|CmdbWrite|Scripting|Atf|NowAssist|Fluent))\(\)/.exec(
            lines[n].replace(/\/\/.*$/, ''));
          if (r) { preSwitch = GATE_OF_CALL[r[1]]; break; }
        }
      }
    }
    for (const raw of lines) {
      // Strip comments before matching. Without this a comment that MENTIONS a gate — e.g.
      // "it called requireScripting() before" — reads as a gate call, and ARC-04-S05 left
      // exactly such a comment behind.
      const line = raw.replace(/\/\/.*$/, '').replace(/\/\*.*?\*\//g, '');
      const c = /case '(snow_[a-z0-9_]+)'/.exec(line);
      if (c) { current = c.group ?? c[1]; if (!out.has(current)) out.set(current, { gate: preSwitch ?? 'none', beforeValidation: true, seenValidation: false }); continue; }
      const r = /\b(require(?:Write|CmdbWrite|Scripting|Atf|NowAssist|Fluent))\(\)/.exec(line);
      if (r && current) {
        const rec = out.get(current);
        // The pre-switch gate wins: it already refused before this line could run.
        if (rec.gate === 'none') { rec.gate = GATE_OF_CALL[r[1]]; rec.beforeValidation = !rec.seenValidation; }
        else if (rec.gate !== GATE_OF_CALL[r[1]]) rec.alsoRequires = GATE_OF_CALL[r[1]];
        continue;
      }
      if (current && /throw new ServiceNowError\(/.test(line) && /INVALID_REQUEST|VALIDATION_ERROR/.test(line)) {
        out.get(current).seenValidation = true;
      }
    }
  }
  return out;
}

const fromSource = sourceGates();

const rows = [];
for (const tool of collectToolCatalog()) {
  const probed = await deriveGate(tool.name);
  const src = fromSource.get(tool.name);
  // The source is authoritative for the DECLARATION; the probe is authoritative for what a
  // caller sees. Where they differ the tool is listed as an anomaly, not silently resolved.
  const gate = src?.gate && src.gate !== 'none' ? src.gate : probed;
  const mutates = FORCE_READS.has(tool.name) ? false
    : FORCE_MUTATES.has(tool.name) || MUTATING_SUFFIX.test(tool.name);
  rows.push({
    name: tool.name, gate, mutates,
    probed, source: src?.gate ?? 'none',
    gateAfterValidation: Boolean(src && src.gate !== 'none' && !src.beforeValidation),
    alsoRequires: src?.alsoRequires ?? null,
    marker: /^\[(\w+)\]/.exec(tool.description)?.[1] ?? '',
  });
}
rows.sort((a, b) => a.name.localeCompare(b.name));

if (process.argv.includes('--json')) {
  console.log(JSON.stringify(rows, null, 2));
  process.exit(0);
}

const byModule = {};
for (const r of rows) {
  const m = r.name.split('_')[1];
  (byModule[m] ??= []).push(r);
}
console.log(`# Seeded declarations — ${rows.length} tools\n`);
for (const [m, list] of Object.entries(byModule).sort()) {
  const w = list.filter((r) => r.mutates).length;
  const gates = [...new Set(list.map((r) => r.gate))].sort().join(', ');
  console.log(`  ${m.padEnd(8)} ${String(list.length).padStart(3)} tools · ${String(w).padStart(3)} mutating · gates: ${gates}`);
}

const anomalies = [
  ...rows.filter((r) => r.mutates && r.gate === 'none')
    .map((r) => `mutates:true with gate:none  ${r.name}`),
  ...rows.filter((r) => r.gateAfterValidation)
    .map((r) => `gate AFTER validation (caller sees INVALID_REQUEST, not a permission code)  ${r.name} [${r.gate}]`),
  ...rows.filter((r) => r.marker === 'Write' && r.gate === 'none')
    .map((r) => `[Write] marker with gate:none  ${r.name}`),
  ...rows.filter((r) => /_(index|read|query)$/.test(r.name) && r.mutates)
    .map((r) => `read-shaped name with mutates:true  ${r.name}`),
];
const composite = rows.filter((r) => r.alsoRequires);
if (composite.length) {
  console.log(`\n# Composite gates — an outer gate plus a case gate (${composite.length}).`);
  console.log('# The contract has ONE gate field, so the second requirement is not expressible.');
  for (const r of composite) console.log(`  ${r.name}: ${r.gate} then ${r.alsoRequires}`);
}

console.log(`\n# Anomalies: ${anomalies.length}`);
for (const a of anomalies) console.log(`  ${a}`);
