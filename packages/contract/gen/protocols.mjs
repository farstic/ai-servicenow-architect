// Copyright 2026 Cvetomir Grigorov. Licensed under the Business Source License 1.1 (see LICENSE).
// snowarch — AI ServiceNow Architect. Not affiliated with or endorsed by ServiceNow, Inc.
import { spellings } from '../../../tools/snowarch/lib/text.mjs';
import { fillLauncher } from '../lib/contract.mjs';
import { APPROVAL_PER_RECORD, APPROVAL_WITH_CAPTURE, CAPTURE_OBJECTS, NO_ENGAGEMENT_RULE } from './rule-file.mjs';

/**
 * ARC-07-C32 — this page is COMMITTED, so the launcher placeholders fill in as PINNED POSIX: its
 * bytes must be identical on every runner or `gen:check` fails on the next machine. The rules page
 * carries the one-line Windows note that tells a PowerShell reader what to substitute.
 */
const PAGE_SPELL = spellings({ platform: 'linux', env: {} });
const fill = (t) => fillLauncher(t, PAGE_SPELL);

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
  ATF_ENABLED: 'execute ATF tests and suites; listing and reading tests, suites and results is always allowed. There is no ATF authoring tool: creating or editing a test record goes through the generic record tools and needs WRITE.',
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

**The first write of a session.** ${NO_ENGAGEMENT_RULE}

The reason is in two places. The §2.2 update-set name is \`<engagement>-<topic>\`, so a write cannot be
captured under a name that has no engagement in it. And a change to a client's instance is the one
record that has to say whose it is: \`clients/_unfiled/\` is where design artefacts wait for an
engagement to be named (CLAUDE.md Phase 1 Step 2), and it can hold one client's work beside another's. The
question is asked once per session, not once per write, and it is not the write question: the answer
names the engagement and approves nothing.

§2.0 is the capabilities pre-flight, which is in the always-loaded rule file and not in this document. A call
it refuses is never made and no write question is asked for it, and this question is not asked for it either:
there is nothing yet to record.

## §2.2 — Update-set capture

**Why a preference and not a "current update set".** REST honours the authenticated user's
\`sys_user_preference\` row with \`name=sys_update_set\`; the \`is_default\` flag on an update set is a UI
concept and does nothing for the API — setting it looks like success and captures nothing. This was
established on a live instance and is recorded as PN-01 in \`docs/PLATFORM-NOTES.md\`, with the
consequence that capture cannot be verified any other way and cannot be repaired afterwards.

Before any write that produces a configuration object — ${CAPTURE_OBJECTS} — four calls:

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

## Building an agentic solution in live mode

An AI agent and an agentic workflow are built by two tools, and each writes several records in one call
(ARC-09-C165). \`snow_ai_ai_agent_add\` writes the agent (\`sn_aia_agent\`) and one tool link
(\`sn_aia_agent_tool_m2m\`) per tool. \`snow_ai_agentic_workflow_add\` writes the team (\`sn_aia_team\`), the
workflow (\`sn_aia_usecase\`) with that team, and one member (\`sn_aia_team_member\`) per agent. Both need
\`NOW_ASSIST_ENABLED\` and \`WRITE_ENABLED\`, so §2.0 stops them under any preset but \`full\` or a \`custom\` one
with both on. The order, and what each step costs in approval:

1. **Capture first.** An agentic solution is configuration, and every record of the build is captured, the
   ones the instance creates by itself included (PN-17). The §2.2 ensure and capture are named in the first
   write question — \`${APPROVAL_WITH_CAPTURE}\` — and the capture call returns \`previous\`, the update set
   the preference named before the build. Keep it for step 6.
2. **The agent, one question.** ${APPROVAL_PER_RECORD} For the agent:
   \`About to create AI agent "<name>" (sn_aia_agent) and its tool links (sn_aia_agent_tool_m2m: <tool>, …) on instance "<label>", after ensuring update set <name> and pointing capture at it — write approved?\`
3. **The workflow, one question, after its agents exist.**
   \`About to create agentic workflow "<name>": team (sn_aia_team), workflow (sn_aia_usecase), members (sn_aia_team_member: <agent>, …) on instance "<label>" — write approved?\`
4. **Read-backs, after each call.** Each tool checks what it can before its first write, and a refusal says
   "Nothing was written.". It reads every record back, reports the configuration and the version the
   instance created by itself, and reports any difference as a warning. A failure after the first record
   names every record created and deletes nothing. Report each result, warnings first, before the next call.
5. **Verify.** \`${verify}\` on the build's update set, as §2.2 step 4.
6. **Restore the capture target.** Pointing capture at the build's update set also moved the user's own UI
   session to it (PN-18). Offer to point it back at \`previous\` — \`${capture}\` again, a write with its own
   question.
7. **Running it is a separate step.** A test run in AI Agent Studio, or a trigger, executes the solution.
   It is never part of the build, and it has its own approval.

**Access is not part of the build.** Neither tool writes an ACL, an identity or role filtering: each result's
\`access_rules\` says so, and its \`studio_route\` names the AI Agent Studio page where they are configured.
The design's Access rules item is applied there, before the solution is used. An inserted agent is active at
once (PN-17), so until then build it inactive: \`active: false\` sets its configuration (\`sn_aia_agent_config\`)
inactive after the links, and the agent's question names that record last.

**The access rules are set in the browser.** No tool sets them: the user applies the design's Access rules on the
agent's and the workflow's AI Agent Studio pages. A browser action that changes the instance is a write like any
other, and asks the §2.1 question first. Claude Code's auto mode has blocked these actions as a permission grant,
so the Studio step needs auto mode off, or the user's own hands. Studio's save does more than it shows (PN-19).

**Activation comes after the access rules.** None of the AI agent tools switches an agent on. The path is
\`snow_core_record_modify\` on the agent's \`sn_aia_agent_config\`, setting \`active\` to true, with its own enumerated
write question, once the access rules are in place. Studio's save switches the workflow on by itself (PN-19), so
read the workflow back before asking about it.

**A browser already open keeps its update set.** A session the user had open before \`snow_us_capture_target_set\`
ran does not pick up the new capture target until the user logs in again (PN-18).

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

${ruleCodes.map((e) => `- \`${e.code}\` — ${e.meaning} ${fill(e.remedy)}${e.command ? ` \`${fill(e.command)}\`` : ''}`).join('\n')}
`;
}
