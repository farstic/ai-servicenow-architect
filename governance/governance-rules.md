# Global Architecture Rules

**Authoritative source. All other governance references in the architecture engine — CLAUDE.md, Master Project Instructions, individual SKILL.md anti-patterns, sub-agent termination conditions — must reference this file by section number. If language drifts between this file and a downstream reference, this file wins.**

---

## §1.1 — Baseline-First / Zero Custom Objects Without Explicit Approval

No specialist — skill or sub-agent — may propose, design, or create **custom tables**, **custom scoped applications**, **custom state-model extensions**, **custom Connection & Credential Aliases**, or any other **major custom architectural object** without the Chief Architect's explicit, prior approval captured in the routing-time dispatch envelope.

### Baseline-first is the standing default

For every component, the specialist must first identify whether a baseline ServiceNow construct can serve the requirement. Baseline candidates include:

- An existing baseline table (`incident`, `sn_customerservice_case`, `sn_hr_core_case`, `task`, `sys_user_group`, `change_request`, etc.).
- The baseline scope of the relevant module (`sn_customerservice`, `sn_hr_core`, `global` where appropriate).
- The `work_notes` or `comments` journal field for audit trail or commentary needs.
- Baseline audit history (`sys_history_set`) for record-level audit.
- Baseline state values and field choices.
- System properties for instance-wide configuration.
- Existing baseline business rules, flows, or Script Includes (extend or call, do not duplicate).
- Configuration options (UI policies, dictionary defaults, ACL conditions) over custom code.

**Baseline solutions are accepted without further approval and are always preferred over custom equivalents.**

### Halt protocol when a custom object appears necessary

If a specialist concludes — after honest baseline evaluation — that a custom object is genuinely the only viable technical path, the specialist **must halt before designing it** and return a blocking `OPEN QUESTION — CUSTOM OBJECT PROPOSAL` to the Chief Architect, structured as:

1. **Baseline option evaluated** — what baseline construct was considered, and why it falls short for this specific requirement. "I didn't think of one" is not an acceptable answer; evaluation is mandatory.
2. **Custom object proposed** — the smallest possible scope. The hierarchy of preference, from least to most invasive:
   - A new field on a baseline table (preferred).
   - A new table extending a baseline table, in the baseline scope (acceptable).
   - A new table extending a baseline table, in a pre-existing scoped app (acceptable if scoped app already approved).
   - A new top-level table in a pre-existing scoped app (requires justification).
   - A new top-level table in a new scoped app (requires strong justification).
   - A new scoped app (requires strongest justification — separate deployment cadence, App Repository distribution intent, or genuine domain separation).
3. **Consequences of approval** — data model impact, deployment dependency, support cost, platform-upgrade risk, App Repository implications.
4. **Alternatives if rejected** — degraded design, deferred functionality, manual workaround, baseline-only path with documented gaps.

### The Chief Architect's response

On receiving a `CUSTOM OBJECT PROPOSAL`, the Chief Architect:

- **Approves** the custom object with documented rationale (the approval becomes part of the dispatch envelope for downstream builders).
- **Rejects** the custom object and instructs the specialist to redesign with baseline only.
- **Proposes a baseline alternative** the specialist had not considered, and returns control to the specialist to evaluate it.

The Chief Architect must not silently approve a custom-object proposal without explicit confirmation from the user when the user is available. If the user is asynchronous, the Chief Architect approves only the smallest-possible-scope variant from item 2's hierarchy, and surfaces the decision for user ratification at the next interaction.

### Violation handling

**A specialist that silently defaults to a custom object — without surfacing the decision for approval — is in violation of §1.1, and the artefact must be reworked.** Detection signals include:

- A design spec or implementation that references a new table name (`x_*_*`, or any non-baseline `<scope>_<table>`) not present in the dispatch envelope.
- A design spec or implementation that references a new scoped app prefix not present in the dispatch envelope.
- A design spec or implementation that defines new Connection & Credential Aliases, new state values, or new sys_user_group structures not present in the dispatch envelope.

When detected, the Chief Architect halts the post-build §6.2 flow and re-dispatches the specialist with the §1.1 halt protocol as the rework brief.

### Scope of application

This rule applies to all 25 specialists at all tiers — builders, reviewers, domain experts, consultants, documentation specialists. It overrides any prior "default to scoped app" or "create a dedicated table" language that may exist in earlier-phase SKILL.md files. Where conflict exists, §1.1 wins.

### Routing-time vs post-build enforcement

- **Routing-time (§6.1):** the Chief Architect surfaces the §1.1 evaluation as part of Phase 1 assumptions. If the user's request implies a custom object, the Chief Architect must explicitly raise the proposal as a blocking OPEN QUESTION at Phase 1 — not after dispatch.
- **Post-build (§6.2):** the Chief Architect inspects every returned artefact for §1.1 violations as part of the post-build evaluation. A detected violation triggers a rework dispatch before any other consult proposals (Code Reviewer, ATF Author, Operational Documentation) are surfaced.

---

## §2.1 — MCP Write Operations Explicit Approval Gate

> **Interim.** ARC-05-S05 generates the machine-readable rule file from `dist/contract.json`; this
> section is the human statement of the same rule until then, and is written to say the same thing.

Every MCP write against a live ServiceNow instance requires an explicit **"write approved"** from the
user *in the current conversation*, before the tool is called.

**Which tools this covers.** Any tool of the `servicenow` server whose contract entry says
`mutates: true` or `sessionMutates: true`. That is the definition — not a list of names, and not a
guess from the name's suffix. `packages/contract/required-tools.json` records what the engine expects
of each tool it depends on, and `packages/snowarch/dist/contract.json` is what the server declares.

Naming tools by their suffix was tried and does not work: over the real catalogue, a suffix rule
leaves **more than thirty** state-changing tools ungated — among them approving a request, rolling
back a deployment, retiring an article or an asset, completing a task, firing an event and setting
system properties (`03` S-23). If a tool changes anything, the gate applies, whatever it is called.

`sessionMutates` is in the definition for one tool: switching instance changes no record, and it
decides **where every later write lands**. Approving it is approving that.

**What counts as "write approved":**
- A clear, explicit user message in the current conversation authorising the specific write about to
  be made — "write approved", "go ahead and create it", "да, качи".

**What does NOT count:**
- A previous "yes" to a read (approving a routing proposal, approving a Code Reviewer pass).
- A general go-ahead earlier in the conversation that did not name this write.
- The user's original task description, however detailed.
- **Switching Mode (`design-only` → `live`) or raising a Preset.** That is a configuration change: it
  makes a write *possible*, and says nothing about whether this write is *wanted*.

**Halt protocol.** About to write without an approval in the current conversation: stop and ask —
*"About to [describe the action] — write approved?"* — then wait.

**Self-approval is prohibited.** Approval is a discrete user message. It is never inferred from
context, from urgency, or from the logic of the task.

---

## §2.2 — MCP Update Set Capture Mandatory Pre-Write Protocol

> **Interim.** ARC-05-S06 generates the protocol file from the contract's
> `protocols.updateSetCapture` and this section will point at it; the four calls below are that
> protocol, written out. (The generated file is named only once it exists — a path in backticks
> that resolves to nothing is a claim the reader cannot check.)

Before any MCP write that produces a ServiceNow **configuration object** — Script Include, Business
Rule, Client Script, UI Policy, Flow, ACL — point the update-set capture at a named set. Four calls:

1. `snow_us_active_update_set_ensure { name }` — the name is required, and only *your* in-progress
   sets are returned. Without both, a shared instance hands back whoever opened one last, and the
   engagement's objects land in a stranger's update set.
2. `snow_us_capture_target_set { update_set_sys_id }` — points capture at it.
3. Do the write.
4. `snow_us_update_set_preview { sys_id }` — confirm the objects are in the set. This step is the
   evidence; without it the protocol was performed but not verified.

**Why a preference and not a "current update set".** REST honours the authenticated user's
`sys_user_preference` with `name=sys_update_set`. The `is_default` flag on an update set is a UI
concept and does nothing for the API — setting it looks like success and captures nothing.

**What does not work, confirmed:**
- Switching the update set by flag: `is_default` does not change the API's capture target.
- Writing `sys_update_xml` directly: refused with `INSUFFICIENT_PRIVILEGES`, admin included.
- Running a server-side script to do it: there is no supported REST endpoint for script execution.
  The two tools that once tried are still registered and refuse with
  `UNSUPPORTED_ON_THIS_INSTANCE` — they are **not** substitutes. Run the script in
  **System Definition → Scripts - Background**, or as a Fix Script from the UI.

**Halt protocol.** Steps 1–2 not done before a configuration write: stop and do them. Capture cannot
be applied retroactively over REST — the object is already outside the set.

---

## §4 — Delivery Artefact Governance (ADR · Traceability · RAID & NFR)

> **Numbering note.** This file deliberately skips §3 to avoid collision with the high-traffic routing-consult namespace (taxonomy/CLAUDE.md **§3.1** routing-time consults, **§3.2** post-build consults). Governance rule families are §1 (Baseline-First), §2 (MCP), §4 (Delivery Artefact Governance). Always cite these as "governance-rules.md §4.x".

These rules turn isolated specialist artefacts into auditable enterprise delivery. They are **engagement-scoped**: the living instances live under `clients/<name>/` (gitignored — confidentiality firewall), seeded from the engine-level templates in `templates/`. They apply across every module. None of these artefacts is a ServiceNow object — they are delivery governance, so they never themselves trigger §1.1; but each must respect §1.1 when it *records* a decision or requirement that implies a custom object.

### §4.1 — Architecture Decision Records (ADR)

A significant architectural decision must be captured as an ADR before it is treated as settled. Template: `templates/adr-template.md`. Location: `clients/<name>/decisions/ADR-<NNN>-<slug>.md`.

**An ADR is mandatory for:**
- Every §1.1 custom-object **approval or rejection** (the ADR is the durable record of the dispatch-envelope decision — it is where "the user approved this custom table on this date" lives).
- Every baseline-vs-custom call, every routing override, and every choice between two viable ServiceNow patterns (spoke vs Scripted REST, report vs PA, flow vs business rule, workspace vs portal, etc.).
- Any release/scope/security/licensing trade-off a reviewer would later challenge with "why did we…?".

**Discipline:** one decision per file; ADRs are immutable once Accepted — a changed decision is a *new* ADR that supersedes the old one (status `Superseded by ADR-NNN`). The Chief Architect proposes the ADR; the decision owner is the user (or named authority). An ADR does not replace the §1.1 approval gate — it records the outcome of it.

### §4.2 — Requirements Traceability (the golden thread)

Every requirement on a release path must be traceable through story → design → build → test → deployment. Template: `templates/traceability-matrix-template.md`. Location: `clients/<name>/traceability.md` (one living matrix per engagement or per release/PI).

**Discipline:** the matrix is **append-as-you-go**, not retro-fitted. Each specialist adds its reference to the relevant row as it produces an artefact — Story Writer the story ID, Technical Designer / HLD-LLD Writer the design ref, Developer / Flow Designer the build artefact, ATF Author the test ID, DevOps / Release Manager the update set. The Chief Architect updates the matrix at the Phase 2 post-build step and surfaces any **coverage gap** (a requirement with no test, or no build) as an OPEN QUESTION before sign-off. A release should not be declared done while the matrix shows a `❌ gap` on an in-scope requirement.

### §4.3 — RAID and NFR capture

**RAID** (Risks, Assumptions, Issues, Dependencies) and **NFRs** (non-functional requirements) are captured at discovery/design time and maintained through delivery. Templates: `templates/raid-log-template.md`, `templates/nfr-checklist-template.md`. Locations: `clients/<name>/raid-log.md`, and the NFR checklist alongside the design it constrains.

**Discipline:**
- **Every unresolved `OPEN QUESTION` becomes a RAID item** so it survives the gap between sessions/laptops rather than evaporating. Estimation surfaces sizing risks/assumptions; Discovery surfaces dependencies; Performance/Security/Licensing each surface their own risks.
- **NFRs are design constraints, not afterthoughts.** Capture them before build and hand each to its owning consult (Performance & Scale, Security & GRC, Licensing, UI/UX, Integration). An NFR with an unconfirmed target is a RAID Assumption until the client confirms it. Never assert an NFR target from memory.

### Enforcement points

- **Routing-time (Phase 1):** when a §1.1 custom-object question is raised, the Chief Architect notes that approval will be recorded as an ADR (§4.1); NFRs and RAID items surfaced during assumptions go into the engagement logs (§4.3).
- **Post-build (Phase 2):** after a builder returns, the Chief Architect updates the traceability matrix (§4.2) and records any decision taken during the build as an ADR (§4.1) before presenting the artefact as final.

These rules are advisory scaffolding, not a hard halt like §1.1/§2.1 — but skipping them is a delivery-governance defect the Chief Architect should flag, the same way a missing Code Reviewer pass is flagged.

---

## Maintenance

This file is the canonical source for global architecture rules. Updates committed with message: `governance: <rule-id> <change-summary>`.

When a new rule is added (§1.2, §1.3, etc.):
1. Author the rule here first.
2. Update `taxonomy.md` to reference the new rule by §-number.
3. Patch CLAUDE.md and Master Project Instructions with the routing-time enforcement reference.
4. Patch every SKILL.md anti-patterns section with the skill-level reinforcement.
5. Patch every agent definition's termination conditions with the agent-level reinforcement.

Drift between this file and downstream references is a maintenance bug. Resolve in favour of this file.

---

*End of governance-rules.md v1.4 — ARC-02-S06: moved to `governance/`; Mode/Preset vocabulary replaces the retired Tier model; §2.1 keyed on the contract's `mutates` / `sessionMutates` rather than on tool names; §2.2 rewritten to the four calls that exist today, with the two retired script-execution tools named as NOT substitutes. Both §2 sections are interim: ARC-05-S05/S06 generate them. Prior — v1.3: added §4 Delivery Artefact Governance (ADR §4.1, Requirements Traceability §4.2, RAID & NFR §4.3), seeded from `templates/`; §3 deliberately skipped to avoid the routing-consult §3.x namespace; §1.1 scope updated 22 → 25 specialists. Prior — v1.2: §2.1 MCP write gate + §2.2 update-set capture.*
