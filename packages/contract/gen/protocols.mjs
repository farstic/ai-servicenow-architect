/**
 * `governance/mcp-protocols.md` — the long form of §2.1 and §2.2.
 *
 * The rule file is what a session always carries and must stay under 45 lines; this is where the
 * same two rules are stated at length, with the platform reason they take the shape they do and the
 * table of tools the engine actually depends on. Both render from the contract, so the short form
 * and the long form cannot disagree about a name, a gate or a remedy.
 *
 * §2.1 and §2.2 previously lived in four documents in two naming generations (P-33). After this,
 * `governance/governance-rules.md` §2 points here and states nothing itself.
 */

/** Plain-language flag texts (`01` §6.3), keyed by flag name. Advice, not data. */
const FLAG_TEXT = {
  WRITE_ENABLED: 'create, update and delete records — incidents, catalog items, users, agile work, update sets. Without it everything is read-only.',
  CMDB_WRITE_ENABLED: 'additionally, CI and relationship reconciliation writes into the CMDB.',
  SCRIPTING_ENABLED: 'unlocks *writing* Script Includes, Business Rules, Client Scripts, ACLs, UI Actions and update-set changes. Reading them is always allowed.',
  ATF_ENABLED: 'execute ATF tests and suites; authoring and reading are always allowed.',
  NOW_ASSIST_ENABLED: 'the Now Assist and generative-AI tools; needs a Now Assist licence on the instance.',
  FLUENT_ENABLED: 'the ServiceNow SDK build and deploy tools; deploys also need WRITE.',
};

const USE_WHEN = {
  'read-only': 'auditing, reviewing, designing against a real instance — and the only preset a `prod` instance may hold without `--ack-prod`',
  'pdi-developer': 'building on a PDI, dev or test instance where Now Assist and Fluent are not wanted',
  full: 'everything on; the proposal for every non-production instance (D-05)',
};

export const target = 'governance/mcp-protocols.md';

export function render(ctx) {
  const { contract, pin, serverKey, header } = ctx;

  const asks = contract.tools.filter((t) => t.mutates === true || t.sessionMutates === true);
  const unsupported = contract.tools.filter((t) => t.unsupported).map((t) => t.name);
  const byName = new Map(contract.tools.map((t) => [t.name, t]));
  const steps = contract.protocols.updateSetCapture;
  const [ensure, capture] = steps;
  const verify = steps[steps.length - 1];

  // The engine's pin joined with the contract: the pin says what the engine depends on and why,
  // the contract says what the server currently declares. A row whose tool is missing from the
  // contract is a name the engine cites and the server does not answer — L01 catches it in the
  // generated file, but saying so in the cell is what a reader can act on.
  const toolRows = pin.tools.map((t) => {
    const live = byName.get(t.name);
    const gate = live ? live.gate : '**missing from the contract**';
    const mutates = live ? (live.mutates ? 'yes' : 'no') : '—';
    const also = live?.alsoRequires ? ` (then ${live.alsoRequires})` : '';
    return `| \`${t.name}\` | ${gate}${also} | ${mutates} | ${t.used_by.join(', ')} |`;
  });

  const flagRows = contract.flags.map((f) => {
    const requires = f.requires.length ? f.requires.map((r) => `\`${r}\``).join(', ') : '—';
    return `| \`${f.name}\` | ${FLAG_TEXT[f.name] ?? ''} | ${requires} |`;
  });

  const presetRows = Object.entries(contract.presets).map(([name, values]) => {
    const on = Object.entries(values).filter(([, v]) => v === 'true').map(([k]) => k.replace('_ENABLED', ''));
    return `| \`${name}\` | ${on.length ? on.join(', ') : 'none'} | ${USE_WHEN[name] ?? ''} |`;
  });

  const ruleCodes = contract.errorCodes.filter((e) => e.showInRule);

  return `${header}
# MCP protocols — the long form of §2.1 and §2.2

The always-loaded short form is \`.claude/rules/00-mode-and-mcp-gate.md\`. This document is the same
two rules at length, with the reasons. Both are generated from the server contract, so they cannot
disagree; \`governance/governance-rules.md\` §2 points here and restates nothing.

The server is registered as \`${serverKey}\`. Its tools are named \`mcp__${serverKey}__snow_*\`, and that
prefix is written in exactly one place in the engine — \`engine.config.json\` — which is what makes
renaming it a one-line change rather than a sweep.

## §2.1 — The write gate

**Which tools it covers.** Any tool whose contract entry says \`mutates: true\` or
\`sessionMutates: true\`: **${asks.length}** of ${contract.tools.length} today. That is the definition — not a list of
names, and not a guess from a name's suffix. Naming tools by suffix was tried and leaves more than
thirty state-changing tools ungated, among them approving a request, rolling back a deployment,
retiring an article, completing a task and setting system properties.

\`sessionMutates\` is in the definition for one tool. Switching instance changes no record, and it
decides **where every later write lands** — approving it is approving that.

**What counts as approval.** A clear, explicit message in the current conversation authorising the
specific write about to be made.

**What does not.** A previous "yes" to a read. A general go-ahead earlier in the conversation that
did not name this write. The task description, however detailed. And **switching Mode from
\`design-only\` to \`live\`, or raising a preset** — that is a configuration change: it makes a write
possible and says nothing about whether this write is wanted.

**Halt protocol.** About to write without approval in the current conversation: stop and ask —
\`About to <action> on instance "<label>" — write approved?\` — then wait. Approval is a discrete
message; it is never inferred from context, urgency or the logic of the task.

## §2.2 — Update-set capture

**Why a preference and not a "current update set".** REST honours the authenticated user's
\`sys_user_preference\` row with \`name=sys_update_set\`; the \`is_default\` flag on an update set is a UI
concept and does nothing for the API — setting it looks like success and captures nothing. This was
established on a live instance and is recorded as PN-01 in \`docs/PLATFORM-NOTES.md\`, with the
consequence that capture cannot be verified any other way and cannot be repaired afterwards.

Before any write that produces a configuration object — Script Include, Business Rule, Client
Script, UI Policy, UI Action, ACL, Flow, table or field — four calls:

1. \`${ensure}\` \`{ "name": "<engagement>-<topic>" }\` — the name is required, and only the caller's own
   in-progress sets are returned. Without both, a shared instance hands back whoever opened one last,
   and the engagement's objects land in a stranger's update set.
2. \`${capture}\` \`{ "update_set_sys_id": "<sys_id from step 1>" }\` — points capture at it.
3. Do the write. It needs its own approval under §2.1.
4. \`${verify}\` — confirm the objects are in the set. This step is the evidence; without it the
   protocol was performed but not verified.

**Not substitutes.** \`snow_us_update_set_switch\` sets \`is_default\` and changes nothing for REST.
Writing \`sys_update_xml\` directly is refused with \`INSUFFICIENT_PRIVILEGES\`, admin included. And
${unsupported.map((n) => `\`${n}\``).join(' and ')} refuse with \`UNSUPPORTED_ON_THIS_INSTANCE\` — they
are registered so the refusal can name the route that works, not because they work.

Capture cannot be applied retroactively over REST. If steps 1–2 were skipped, stop and say so.

## Required tools

What the engine depends on, from \`packages/contract/required-tools.json\`, joined with what the
server declares. A rename on the server side moves the sha and fails the pin before it reaches here.

| Tool | Gate | Mutates | Used by |
|---|---|---|---|
${toolRows.join('\n')}

## Flags and presets

| Flag | What it unlocks | Requires |
|---|---|---|
${flagRows.join('\n')}

A flag is on only when its value is the exact string \`"true"\`; absent means off. Declaring a
dependent flag without its prerequisite is resolved towards less access, never more.

| Preset | On | Choose it for |
|---|---|---|
${presetRows.join('\n')}

\`custom\` is the absence of a preset: six explicit toggles, with the dependency rule still enforced.

## Error codes

Every code has one meaning and one remedy, in the registry the server, the wizard, the doctor and
this document all render from. The full list is \`docs/TROUBLESHOOTING.md\`. These ${ruleCodes.length} are in the
always-loaded rule file, because a session can act on them mid-task:

${ruleCodes.map((e) => `- \`${e.code}\` — ${e.meaning} ${e.remedy}${e.command ? ` \`${e.command}\`` : ''}`).join('\n')}
`;
}
