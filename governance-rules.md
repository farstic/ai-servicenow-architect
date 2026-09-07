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

Every MCP write operation against a live ServiceNow instance requires an explicit **"write approved"** from the user in the current conversation before the tool is called. This gate applies to any `create_*`, `update_*`, `delete_*`, `execute_*`, and any other MCP tool that mutates instance state.

**What counts as "write approved":**
- A clear, explicit user message in the current conversation that authorises the specific write action about to be taken (e.g., "write approved", "go ahead and create", "yes, deploy it", "yes, update it").

**What does NOT count as "write approved":**
- A previous "yes" to a read-only operation (approving a routing proposal, approving a Code Reviewer pass).
- A general go-ahead earlier in the conversation that did not name the specific write action.
- The user's original task description, however detailed.
- A tier or permission upgrade.

**Halt protocol:** If a write operation is about to be executed without a "write approved" in the current conversation, stop and surface: *"About to [describe action] — write approved?"* Wait for explicit confirmation before proceeding.

**Self-approval is prohibited.** Claude may not infer write approval from context, urgency, or logical flow. Approval must be a discrete user message.

---

## §2.2 — MCP Update Set Capture Mandatory Pre-Write Protocol

Before executing any `create_*` or `update_*` MCP write operation that produces a ServiceNow configuration object (Script Include, Business Rule, Client Script, UI Policy, Flow, etc.), the active `sys_user_preference` for `sys_update_set` **must** be set to the target Update Set for the authenticated user.

**Why:** ServiceNow REST API calls honour the `sys_user_preference` record with `name=sys_update_set` for the authenticated user. Setting this preference before write operations causes automatic capture of created/updated objects into the target Update Set. Without this step, objects land on the instance but are not captured in any Update Set and cannot be promoted or migrated.

**Mandatory steps before any configuration write:**

1. Identify or create the target Update Set — `create_update_set` or confirm an existing one is `in progress`.
2. Resolve the authenticated user's sys_id — `query_records(sys_user, user_name=<username>)`.
3. Set the user preference — `query_records(sys_user_preference, user=<sys_id>^name=sys_update_set)`:
   - If exists → `update_record(sys_user_preference, <pref_sys_id>, {value: <update_set_sys_id>})`
   - If not exists → `create_record(sys_user_preference, {user: <sys_id>, name: 'sys_update_set', value: <update_set_sys_id>, type: 'string'})`
4. Execute the write operation — object is now captured automatically.
5. Verify capture — `query_records(sys_update_xml, update_set=<update_set_sys_id>)`.

**What does NOT work (confirmed non-functional on ServiceNow REST API):**
- `switch_update_set` — only sets `is_default: true` on the record; does NOT switch session context.
- Direct POST to `sys_update_xml` — blocked by `INSUFFICIENT_PRIVILEGES` even for admin users.
- `execute_script` / `execute_background_script` — call non-existent ServiceNow endpoints; fail with 400/404.

**Halt protocol:** If steps 1–3 have not been completed before a configuration write, stop and complete them first. Retroactive capture via REST is not possible.

---

## §4 — Delivery Artefact Governance (ADR · Traceability · RAID & NFR)

> **Numbering note.** This file deliberately skips §3 to avoid collision with the high-traffic routing-consult namespace (taxonomy/CLAUDE.md **§3.1** routing-time consults, **§3.2** post-build consults). Governance rule families are §1 (Baseline-First), §2 (MCP), §4 (Delivery Artefact Governance). Always cite these as "governance-rules.md §4.x".

These rules turn isolated specialist artefacts into auditable enterprise delivery. They are **engagement-scoped**: the living instances live under `clients/<name>/` (gitignored — confidentiality firewall), seeded from the engine-level templates in `reference/templates/`. They apply across every module. None of these artefacts is a ServiceNow object — they are delivery governance, so they never themselves trigger §1.1; but each must respect §1.1 when it *records* a decision or requirement that implies a custom object.

### §4.1 — Architecture Decision Records (ADR)

A significant architectural decision must be captured as an ADR before it is treated as settled. Template: `reference/templates/adr-template.md`. Location: `clients/<name>/decisions/ADR-<NNN>-<slug>.md`.

**An ADR is mandatory for:**
- Every §1.1 custom-object **approval or rejection** (the ADR is the durable record of the dispatch-envelope decision — it is where "the user approved this custom table on this date" lives).
- Every baseline-vs-custom call, every routing override, and every choice between two viable ServiceNow patterns (spoke vs Scripted REST, report vs PA, flow vs business rule, workspace vs portal, etc.).
- Any release/scope/security/licensing trade-off a reviewer would later challenge with "why did we…?".

**Discipline:** one decision per file; ADRs are immutable once Accepted — a changed decision is a *new* ADR that supersedes the old one (status `Superseded by ADR-NNN`). The Chief Architect proposes the ADR; the decision owner is the user (or named authority). An ADR does not replace the §1.1 approval gate — it records the outcome of it.

### §4.2 — Requirements Traceability (the golden thread)

Every requirement on a release path must be traceable through story → design → build → test → deployment. Template: `reference/templates/traceability-matrix-template.md`. Location: `clients/<name>/traceability.md` (one living matrix per engagement or per release/PI).

**Discipline:** the matrix is **append-as-you-go**, not retro-fitted. Each specialist adds its reference to the relevant row as it produces an artefact — Story Writer the story ID, Technical Designer / HLD-LLD Writer the design ref, Developer / Flow Designer the build artefact, ATF Author the test ID, DevOps / Release Manager the update set. The Chief Architect updates the matrix at the Phase 2 post-build step and surfaces any **coverage gap** (a requirement with no test, or no build) as an OPEN QUESTION before sign-off. A release should not be declared done while the matrix shows a `❌ gap` on an in-scope requirement.

### §4.3 — RAID and NFR capture

**RAID** (Risks, Assumptions, Issues, Dependencies) and **NFRs** (non-functional requirements) are captured at discovery/design time and maintained through delivery. Templates: `reference/templates/raid-log-template.md`, `reference/templates/nfr-checklist-template.md`. Locations: `clients/<name>/raid-log.md`, and the NFR checklist alongside the design it constrains.

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

*End of governance-rules.md v1.3 — added §4 Delivery Artefact Governance (ADR §4.1, Requirements Traceability §4.2, RAID & NFR §4.3), seeded from `reference/templates/`; §3 deliberately skipped to avoid the routing-consult §3.x namespace; §1.1 scope updated 22 → 25 specialists. Prior — v1.2: §2.1 MCP write gate + §2.2 update-set capture.*
