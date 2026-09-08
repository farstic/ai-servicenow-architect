/**
 * `.claude/rules/00-mode-and-mcp-gate.md` — the always-loaded rule file.
 *
 * Everything a session must not get wrong about mode, the write gate and update-set capture, in one
 * file, generated. It used to be sixty lines of prose in `CLAUDE.md` and three other documents, in
 * two naming generations (P-05, P-33): the gate was keyed on a tool-name prefix that had changed,
 * and §2.2 named calls the server no longer answers.
 *
 * The division of labour here is the point. Prose sentences are literals in this module — they are
 * a judgement about how a rule should be stated, and generating them from data would only mean
 * writing them somewhere else. Every NAME, COUNT and CODE comes from the contract, because those
 * are the things that drift and the things a reader cannot check.
 */

/** Tools the §2.2 section names as NOT substitutes for the capture protocol. */
const NOT_SUBSTITUTES = {
  // These two are registered and refuse with UNSUPPORTED_ON_THIS_INSTANCE — a caller reaching for a
  // server-side script to set the update set finds them and assumes they work.
  //
  // The names are a literal here and should not be: the contract records `gate`, `mutates` and
  // `table` for every tool but nothing that says "this one is a stub", so there is no field to
  // filter on. Filtering would need `unsupported: true` on the two ToolDefinitions, the extractor
  // carrying it, and a re-pin — an ARC-04 change, not a generator change. What IS enforced today is
  // that both names are real tools in the contract (asserted in the suite), so the line can go stale
  // in its claim but never in its names.
  unsupported: ['snow_deploy_background_script_exec', 'snow_fluent_script_exec'],
  // Renamed, and the old behaviour is the trap: it sets `is_default`, which does nothing for REST.
  switch: 'snow_us_update_set_switch',
};

/** The runtime errors worth interrupting for. The REMEDIES come from the contract's registry. */
const RULE_CODES = [
  // Selection is a literal until the registry carries `showInRule` (ARC-05-S06); the remedy strings
  // are never retyped here, so a remedy corrected in the registry corrects this file on the next run.
  'AUTHENTICATION_FAILED',
  'INSUFFICIENT_PRIVILEGES',
  'NO_INSTANCE_CONFIGURED',
  'PROD_WRITE_NOT_ACKNOWLEDGED',
  'UNKNOWN_TOOL',
  'FLUENT_NOT_INSTALLED',
];

const USE_WHEN = {
  'read-only': 'none',
  'pdi-developer': 'WRITE, CMDB_WRITE, SCRIPTING, ATF',
  full: 'all six',
  custom: 'explicit',
};

export const target = '.claude/rules/00-mode-and-mcp-gate.md';

export function render(ctx) {
  const { contract, serverKey, header } = ctx;
  const prefix = `mcp__${serverKey}__`;

  // The ask list is the UNION of `mutates` and `sessionMutates` (ARC-04-S10's ruling).
  // `snow_core_instance_switch` changes no record and decides where every later write lands, so a
  // count that left it out would under-report the gate by exactly the tool that redirects it.
  const asks = contract.tools.filter((t) => t.mutates === true || t.sessionMutates === true);

  const codes = new Map(contract.errorCodes.map((e) => [e.code, e.remedy]));
  const remedy = (code) => {
    const r = codes.get(code);
    if (!r) throw new Error(`rule-file: ${code} is not in contract.errorCodes — the registry moved`);
    return r;
  };

  const steps = contract.protocols.updateSetCapture;
  if (steps.length < 4) throw new Error('rule-file: updateSetCapture has fewer than four entries');
  const [ensure, capture] = steps;
  const verify = steps[steps.length - 1];

  const flagRow = (f) => `| \`${f.name}\` | \`${f.name.replace('_ENABLED', '')}_NOT_ENABLED\` | `
    + `${f.requires.length ? f.requires.map((r) => `\`${r}\``).join(', ') : '—'} |`;

  const presetLine = Object.keys(contract.presets)
    .concat(Object.keys(USE_WHEN).filter((p) => !(p in contract.presets)))
    .map((p) => `\`${p}\` (${USE_WHEN[p] ?? 'explicit'})`)
    .join(' · ');

  return `${header}
# Mode and MCP write gate

## Mode
- The authoritative mode is the \`Mode:\` line printed at session start by the SessionStart hook. Quote it (\`/snowarch status\` does); never infer mode from any other file.
- \`Mode: design-only\` — no ServiceNow instance. Every verdict is grounded in \`vendor/ServiceNowDocs\`; the rules below are dormant; never call an MCP tool.
- \`Mode: live\` — the bundled server is registered as \`${serverKey}\`; its tools are named \`${prefix}snow_*\`. Current instance, preset and flags come from the server, never from memory. Sub-agents never call MCP tools.

## §2.1 — Write gate
- A mutating tool (\`mutates: true\` or \`sessionMutates: true\` in the contract — ${asks.length} tools; the same set is the \`permissions.ask\` list in \`.claude/settings.json\`) is called only after an explicit "write approved" message from the user, in the current conversation, that names the specific action.
- Not approval: the original task description; a "yes" to a routing or review proposal; an earlier general go-ahead; a preset or flag change made in the terminal.
- Before any mutating call, ask exactly: \`About to <action> on instance "<label>" — write approved?\` and wait for the answer.
- Self-approval is prohibited: approval is never inferred from context, urgency or logical flow.

## §2.2 — Update-set capture (before every configuration write: Script Include, Business Rule, Client Script, UI Policy, UI Action, ACL, Flow, table or field)
1. \`${ensure}\` \`{ "name": "<engagement>-<topic>" }\` — returns the in-progress update set created by the authenticated user, creating it if absent.
2. \`${capture}\` \`{ "update_set_sys_id": "<sys_id from step 1>" }\` — sets \`sys_user_preference\` \`sys_update_set\` for the authenticated user; REST writes are captured from now on.
3. Perform the write (step 3 needs its own "write approved").
4. Verify: \`${verify}\` on the update set from step 1 — the written object appears as a \`sys_update_xml\` row.

Not a substitute: \`${NOT_SUBSTITUTES.switch}\` (sets \`is_default\` only); direct writes to \`sys_update_xml\` (\`INSUFFICIENT_PRIVILEGES\`); ${NOT_SUBSTITUTES.unsupported.map((n) => `\`${n}\``).join(' and ')} (\`UNSUPPORTED_ON_THIS_INSTANCE\`). Retroactive capture is impossible — if steps 1–2 were skipped, stop and say so.

## Flags, presets, codes
| Flag | Off → error code | Requires |
|---|---|---|
${contract.flags.map(flagRow).join('\n')}
Presets: ${presetLine}. A flag is on only when its value is the exact string \`"true"\`; absent means off. Reads are never gated by WRITE/SCRIPTING.

## Runtime errors — stop and give the remedy, never retry, never propose editing flags from inside Claude
${RULE_CODES.map((c) => `- \`${c}\` → ${remedy(c)}.`).join('\n')}
- \`*_NOT_ENABLED\` → ${remedy('WRITE_NOT_ENABLED')} (a \`prod\` instance additionally needs \`--ack-prod\`).

Long form: \`governance/mcp-protocols.md\` · every code: \`docs/TROUBLESHOOTING.md\`
`;
}
