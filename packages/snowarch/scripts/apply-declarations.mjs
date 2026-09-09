#!/usr/bin/env node
/**
 * Writes the seeded `gate` / `mutates` / `table` onto every registration. One-off for
 * ARC-04-S06, committed beside the seeder so the pair is reproducible.
 *
 * It inserts the three fields after `inputSchema` in each manifest entry. It does NOT invent
 * values — it consumes `seed-declarations.mjs --json`, whose gates come from the dispatcher
 * source and whose mutates come from the suffix grammar plus a reviewed hand list.
 */
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

// Via a file, not a pipe: execFileSync's default maxBuffer truncated the 397-row JSON, and a
// truncated payload is worse than a failure — it would have annotated most tools and silently
// skipped the rest.
const tmp = new URL('../.declarations.json', import.meta.url).pathname;
execFileSync('bash', ['-c',
  `node ${new URL('seed-declarations.mjs', import.meta.url).pathname} --json > ${tmp}`]);
const rows = JSON.parse(readFileSync(tmp, 'utf8'));
const decl = new Map(rows.map((r) => [r.name, r]));

// Tools whose table is FIXED by the tool rather than passed in. The audit writer (S10)
// records it; a table that came from the arguments would put the caller's guess in an audit
// record, so those are deliberately absent.
const FIXED_TABLE = {
  snow_scr_business_rule_add: 'sys_script', snow_scr_business_rule_modify: 'sys_script',
  snow_scr_script_include_add: 'sys_script_include', snow_scr_script_include_modify: 'sys_script_include',
  snow_scr_client_script_add: 'sys_script_client', snow_scr_client_script_modify: 'sys_script_client',
  snow_scr_ui_policy_add: 'sys_ui_policy',
  snow_scr_ui_action_add: 'sys_ui_action', snow_scr_ui_action_modify: 'sys_ui_action',
  snow_scr_acl_add: 'sys_security_acl', snow_scr_acl_modify: 'sys_security_acl',
  snow_us_update_set_add: 'sys_update_set', snow_us_update_set_switch: 'sys_update_set',
  snow_us_update_set_complete: 'sys_update_set', snow_us_active_update_set_ensure: 'sys_update_set',
  snow_inc_incident_add: 'incident', snow_inc_incident_modify: 'incident',
  snow_inc_incident_resolve: 'incident', snow_inc_incident_close: 'incident',
  snow_prb_problem_add: 'problem', snow_prb_problem_modify: 'problem', snow_prb_problem_resolve: 'problem',
  snow_chg_change_request_add: 'change_request', snow_chg_change_request_modify: 'change_request',
  snow_chg_change_request_close: 'change_request',
  snow_itam_asset_add: 'alm_asset', snow_itam_asset_modify: 'alm_asset', snow_itam_asset_retire: 'alm_asset',
  snow_cfg_system_property_set: 'sys_properties', snow_cfg_system_property_remove: 'sys_properties',
  snow_usr_user_add: 'sys_user', snow_usr_user_modify: 'sys_user',
  snow_usr_group_add: 'sys_user_group', snow_usr_group_modify: 'sys_user_group',
  snow_kb_knowledge_article_add: 'kb_knowledge', snow_kb_knowledge_article_modify: 'kb_knowledge',
  snow_kb_knowledge_article_publish: 'kb_knowledge', snow_kb_knowledge_article_retire: 'kb_knowledge',
};

let touched = 0;
let entries = 0;
for (const file of readdirSync(new URL('../src/tools/', import.meta.url))) {
  if (!file.endsWith('.ts') || file === 'types.ts' || file === 'index.ts' || file === 'status.ts') continue;
  const url = new URL(`../src/tools/${file}`, import.meta.url);
  const lines = readFileSync(url, 'utf8').split('\n');
  const out = [];
  let pending = null;      // the tool whose inputSchema we are inside
  let depth = 0;
  for (const line of lines) {
    const m = /^(\s*)name: '(snow_[a-z0-9_]+)',\s*$/.exec(line);
    if (m && decl.has(m[2])) pending = { name: m[2], indent: m[1] };
    if (pending && /inputSchema:/.test(line)) { depth = 0; }
    out.push(line);
    if (pending && /inputSchema:/.test(line)) {
      // Walk to the end of the inputSchema object, then insert after it.
      depth = (line.match(/\{/g) ?? []).length - (line.match(/\}/g) ?? []).length;
      if (depth === 0) { insert(out, pending); pending = null; }
      else pending.counting = true;
      continue;
    }
    if (pending?.counting) {
      depth += (line.match(/\{/g) ?? []).length - (line.match(/\}/g) ?? []).length;
      if (depth <= 0) { insert(out, pending); pending = null; }
    }
  }
  function insert(buf, p) {
    const d = decl.get(p.name);
    if (buf.some((l, i) => i > buf.length - 6 && /^\s*gate: /.test(l))) return;
    buf.push(`${p.indent}gate: '${d.gate}',`);
    buf.push(`${p.indent}mutates: ${d.mutates},`);
    if (d.alsoRequires) buf.push(`${p.indent}alsoRequires: '${d.alsoRequires}',`);
    if (FIXED_TABLE[p.name]) buf.push(`${p.indent}table: '${FIXED_TABLE[p.name]}',`);
    entries += 1;
  }
  const text = out.join('\n');
  writeFileSync(url, text);
  touched += 1;
}
console.log(`apply-declarations: ${entries} registration(s) annotated across ${touched} module(s)`);
