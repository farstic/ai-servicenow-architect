/**
 * `.claude/rules/00-mode-and-mcp-gate.md` — the always-loaded rule file.
 *
 * Everything a session must not get wrong about mode, the write gate and update-set capture, in one
 * file, generated. It used to be sixty lines of prose in `CLAUDE.md` and three other documents, in
 * two naming generations (P-05, P-33): the gate was keyed on a tool-name prefix that had changed,
 * and §2.2 named calls the server no longer answers.
 *
 * The division of labour is the point. Prose sentences are literals here — they are a judgement
 * about how a rule should be stated, and generating them would only mean writing them somewhere
 * else. Every NAME, COUNT, CODE and REMEDY comes from the contract, because those are the things
 * that drift and the things a reader cannot check.
 */

/**
 * Named because the trap is its old behaviour: it sets `is_default`, which does nothing for REST.
 * The two script-execution stubs beside it in that sentence are NOT named here — they come from the
 * contract's `unsupported` flag, added in ARC-05-S06 precisely because a literal made the rule file
 * assert something about the server from outside the contract.
 */
const SWITCH_TOOL = 'snow_us_update_set_switch';

/** Presets in the words someone chooses one by. `custom` is the absence of a preset, not an entry. */
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

  const unsupported = contract.tools.filter((t) => t.unsupported).map((t) => t.name);
  if (unsupported.length === 0) throw new Error('rule-file: no tool is marked unsupported in the contract');

  const byCode = new Map(contract.errorCodes.map((e) => [e.code, e]));
  const entry = (code) => {
    const e = byCode.get(code);
    if (!e) throw new Error(`rule-file: ${code} is not in contract.errorCodes — the registry moved`);
    return e;
  };
  // A remedy is prose and a command is a command. The renderer sets the command as code and never
  // parses the prose looking for one — most entries have no command, and guessing where a sentence
  // stops being advice is how a half-command ends up in a fenced block.
  const line = (e) => `- \`${e.code}\` → ${e.remedy}${e.command ? ` — \`${e.command}\`` : ''}.`;

  // The six flag gates collapse into one wildcard line: they differ only in which flag is off, and
  // six near-identical lines in a file with a 45-line budget are six not spent on something else.
  // Everything else carrying `showInRule` gets its own line, in registry order.
  const flagCodes = new Set(contract.flags.map((f) => `${f.name.replace('_ENABLED', '')}_NOT_ENABLED`));
  const ruleCodes = contract.errorCodes.filter((e) => e.showInRule && !flagCodes.has(e.code));
  // The wildcard line borrows one flag's remedy, and which flag is derived rather than named: the
  // base flag is the one the others `require`, which is what makes its remedy the right one for the
  // whole family. Naming WRITE here would be a literal the loader exists to remove.
  const base = contract.flags.find((f) => contract.flags.some((o) => o.requires.includes(f.name)));
  if (!base) throw new Error('rule-file: no flag is required by another — the family has no base');
  const wildcard = entry(`${base.name.replace('_ENABLED', '')}_NOT_ENABLED`);

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

Not a substitute: \`${SWITCH_TOOL}\` (sets \`is_default\` only); direct writes to \`sys_update_xml\` (\`INSUFFICIENT_PRIVILEGES\`); ${unsupported.map((n) => `\`${n}\``).join(' and ')} (\`UNSUPPORTED_ON_THIS_INSTANCE\`). Retroactive capture is impossible — if steps 1–2 were skipped, stop and say so.

## Flags, presets, codes
| Flag | Off → error code | Requires |
|---|---|---|
${contract.flags.map(flagRow).join('\n')}
Presets: ${presetLine}. A flag is on only when its value is the exact string \`"true"\`; absent means off. Reads are never gated by WRITE/SCRIPTING.

## Runtime errors — stop and give the remedy, never retry, never propose editing flags from inside Claude
${ruleCodes.map(line).join('\n')}
- \`*_NOT_ENABLED\` → ${wildcard.remedy} — \`${wildcard.command}\`.

Long form: \`governance/mcp-protocols.md\` · every code: \`docs/TROUBLESHOOTING.md\`
`;
}
