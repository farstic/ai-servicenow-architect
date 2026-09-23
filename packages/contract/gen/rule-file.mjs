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

/**
 * The tool that re-reads the instance's state after the user has fixed something.
 *
 * Named for the same reason `SWITCH_TOOL` is — the sentence is about THIS tool, and a sentence
 * cannot be rendered from a set. Its existence is asserted against the REAL contract by
 * `tests/contract/gen-governance.test.mjs` ("the … tools are real tools in the contract"), not
 * here: almost every case in that file renders a synthetic four-tool contract on purpose, to prove
 * this renderer has not learned the real names, and a hard check here would make that impossible.
 */
const CAPABILITIES_TOOL = 'snow_core_capabilities_read';

/**
 * The sentence a pre-flight stop prints — ADR-0010, one definition.
 *
 * It is here rather than in the rule file's template string because TWO documents must carry it:
 * this generator renders it into `.claude/rules/00-mode-and-mcp-gate.md`, and `T-22` in
 * `tests/VALIDATION-TESTS.md` states it as the expected output a tester compares against. A
 * sentence stated in two places is a sentence that will disagree with itself — that is P-33's whole
 * history in this repository — so both read this constant and a test asserts each of them does.
 *
 * Each carries its OWN inline-code formatting, so the rule file renders them bare — wrapping
 * them in backticks nests a fence inside a fence and the reader gets the raw delimiters.
 *
 * Placeholders are angle-bracketed and substituted by the session from what it actually read.
 * `<flags-read>` is every flag with its state, not just the failing one: the point of ADR-0010's
 * ruling (b) is that a stop SHOWS ITS WORKING, so a mis-resolved gate is refutable at a glance
 * instead of quietly costing the user a capability they have.
 */
export const PREFLIGHT_STOP = 'Pre-flight on "<label>": preset=<preset> · <flags-read>. '
  + '<tool> needs gate `<gate>` = <required-flags>; <flag> is off — not calling it, '
  + 'and not asking for write approval.';

/**
 * A gate the contract does not define. NOT a pass-through, and this is the whole reason the
 * constant exists: the tempting failure mode is to treat an unrecognised gate as "no gate" and
 * proceed, which turns every future gate the rule has not learned about into an ungated call.
 */
export const PREFLIGHT_UNKNOWN_GATE = 'unknown gate `<gate>` — contract and rule disagree';

/**
 * Approval granularity — Sitting D1, two findings in one sitting, both about "how many questions".
 *
 * The owner asked for three records to be deleted by sys_id; one question listed all three, one
 * `write approved` came back, and the server was called three times. §2.1 already said *"Approval
 * is per action — one write approved covers exactly one write"*, so the rule was right and the
 * reading was wrong — which means the rule was not stated in a way that survives an enumerated
 * request. That is a rule-file defect, not a judgement lapse.
 *
 * The sentence is deliberately the SAME shape as the "not approval" list beside it: a request that
 * enumerates its targets is still a request. Naming three records is how a person describes a job,
 * not how they approve three writes.
 */
export const APPROVAL_PER_RECORD = 'N distinct records is N questions, each asked and answered '
  + 'before its own call. A request that enumerates them is the request, not the approval — the '
  + 'same sentence as "the original task description is not approval".';

/**
 * The §2.2 pair under one approval — but only when the question says so.
 *
 * The same session treated `ensure` + `capture_target_set` as covered by the write's approval once
 * and asked a separate question for `capture_target_set` another time. Both readings are
 * defensible from the old text, which is the problem: a rule that can be read two ways has been
 * written once and understood twice.
 *
 * The ruling is the cheap one. The pair is machinery FOR the write the user approved, so folding it
 * into that approval is honest — provided the approval said so. Asked bare, they are two writes
 * nobody agreed to, and they get their own questions.
 */
export const APPROVAL_WITH_CAPTURE = 'About to <action> on instance "<label>", after ensuring '
  + 'update set <name> and pointing capture at it — write approved?';

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
  // The six are named so the wildcard is readable as a rule rather than a pattern to match: a
  // session that has just been handed `SCRIPTING_NOT_ENABLED` should see it in the line. From the
  // contract's flags, never a list here — ARC-08-S10.
  const flagList = contract.flags.map((f) => f.name.replace('_ENABLED', '')).join(', ');

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

## §2.0 — Capabilities pre-flight (before EVERY mutating call)
1. Call \`${CAPABILITIES_TOOL}\`. It is a read: no approval needed, and **the answer is not carried past the call it was read for** — there is no cache, so there is no stale one.
2. Resolve the tool's \`gate\` from the contract this session advertises. No \`gate\` → it is a read; no pre-flight. A gate the contract does not define → stop, never a pass-through: ${PREFLIGHT_UNKNOWN_GATE}.
3. A required flag off → **stop, showing what was read**, then the remedy below. No call is made and **no write question is asked** — there is nothing to approve. The stop line, verbatim with the placeholders substituted:
   > ${PREFLIGHT_STOP}
4. Every required flag on → continue to §2.1. Inside a §2.2 chain this is one read per mutating call, three for one captured write; that is the price of having no invalidation to get wrong.

## §2.1 — Write gate
- A mutating tool (\`mutates: true\` or \`sessionMutates: true\` in the contract — ${asks.length} tools; the same set is the \`permissions.ask\` list in \`.claude/settings.json\`) is called only after an explicit "write approved" message from the user, in the current conversation, that names the specific action.
- Not approval: the original task description; a "yes" to a routing or review proposal; an earlier general go-ahead; a preset or flag change made in the terminal.
- Before any mutating call, ask exactly: \`About to <action> on instance "<label>" — write approved?\` and wait for the answer.
- Self-approval is prohibited: approval is never inferred from context, urgency or logical flow.
- Granularity: ${APPROVAL_PER_RECORD}
- The §2.2 ensure + capture pair is covered by the configuration write's approval ONLY when the question names them: \`${APPROVAL_WITH_CAPTURE}\` Asked bare, each is its own write and gets its own question.

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
When a tool result contains \`(Code: <CODE>)\` for one of the codes below: stop the current step, print the remedy line verbatim, and wait. Do not call the tool again with the same or different credentials. Do not suggest editing \`.local/instances.json\`, \`.mcp.json\` or any settings file by hand. After the user reports the remedy done, continue from the interrupted step — for \`AUTHENTICATION_FAILED\` and \`NO_INSTANCE_CONFIGURED\`, call \`${CAPABILITIES_TOOL}\` first to confirm the new state.
${ruleCodes.map(line).join('\n')}
- \`*_NOT_ENABLED\` (${flagList}) → ${wildcard.remedy} — \`${wildcard.command}\`.

A remedy printed with \`<label>\`, \`<host>\` or \`<proxy>\` still in it: substitute what the tool result carried (\`${CAPABILITIES_TOOL}\` has the label), and print the placeholder only when nothing did. If two different runtime errors occur in one session, also say: run \`./snowarch doctor\` in a terminal and paste the FAIL lines.

Long form: \`governance/mcp-protocols.md\` · every code: \`docs/TROUBLESHOOTING.md\`
`;
}
