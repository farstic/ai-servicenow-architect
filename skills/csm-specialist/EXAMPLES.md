# CSM Specialist v2.0 — Worked Examples

Three examples exercising each §1.1 verdict path. Each example shows the full 5-Part Constraint Envelope output for a realistic dispatch input. Read these alongside `SKILL.md` to understand the gateway's output format and depth.

---

## Example 1 — Verdict A (Fully Baseline)

### Dispatch input

**Source:** Chief Architect, routing from a user request.
**User request:** *"We need work-notes audit trail on customer cases — every change made to a case should be logged with the agent's name, timestamp, and what changed. Show me how to design this."*
**Module:** CSM
**Workspace:** CSM Configurable Workspace
**Volume:** ~50K cases/year, ~3K active concurrent
**Sensitivity:** PII (customer contact details on cases)

### Gateway Response

```markdown
# CSM Specialist Gateway Response

**Request:** Implement an audit trail on customer cases capturing agent, timestamp, and changed fields.
**Domain Expert:** CSM Specialist v2.0
**Release family:** Australia

---

## Part 1 — OOB Process Map

ServiceNow CSM cases extend `task`, which inherits the platform's audit history machinery. The OOB audit flow for a `sn_customerservice_case` record is:

1. **User opens case in CSM Configurable Workspace** — case form renders with `work_notes`, `comments`, and activity stream populated from `sys_journal_field` and `sys_history_set`.
2. **Agent makes a change** — any field write fires the dictionary's audit flag (`sys_dictionary.audit = true`) and writes a row to `sys_history_set` + `sys_history_line` capturing old value, new value, who, and when.
3. **Agent adds a work note** — appends to `case.work_notes` journal; the activity stream renders it with agent name, timestamp, and the work-note body.
4. **Activity stream rebuild** — the case form's activity-stream formatter (baseline UI formatter) reads from `sys_journal_field` + `sys_history_set` and renders the chronological audit log.

Baseline notifications fire on key state transitions but are not required for this audit-trail requirement.

(citation: markdown/customer-service-management/csm-case-management.md, markdown/now-platform/index.md for audit history)

## Part 2 — Data Model Alignment

**Primary baseline table:** `sn_customerservice_case` (extends `task` parent)

**Critical baseline fields:**

| Field | Type | Purpose |
|---|---|---|
| `sn_customerservice_case.work_notes` | Journal | Internal agent notes; appended-only, agent-stamped |
| `sn_customerservice_case.comments` | Journal | Customer-visible communication |
| `task.sys_updated_on` | DateTime | Last update timestamp (inherited) |
| `task.sys_updated_by` | String | Last update user (inherited) |

**Related baseline tables in scope:**

- `sys_history_set` — one row per record-update event
- `sys_history_line` — one row per field change within a `sys_history_set` event
- `sys_journal_field` — `work_notes` and `comments` content
- `sys_audit` — field-level audit when `sys_dictionary.audit = true`

**Baseline reference fields:** no reference qualifiers material to this requirement.

(citation: markdown/now-platform/index.md, markdown/customer-service-management/csm-data-management.md)

## Part 3 — §1.1 Baseline-First Verdict

**Verdict: A — Fully covered by baseline.**

The audit-trail requirement is fully satisfied by three baseline constructs:

1. **`work_notes` journal field** on `sn_customerservice_case` — captures agent commentary, timestamped, attributed.
2. **`sys_history_set` + `sys_history_line`** — captures field-level changes (old value, new value, who, when) whenever auditing is enabled on the dictionary entry.
3. **Activity stream formatter** on the case form — renders the combined timeline natively in CSM Configurable Workspace.

No custom object needed. No new table. No new field. Pure configuration: ensure `sys_dictionary.audit = true` on the fields the engagement wants to audit (typically all of: `state`, `assigned_to`, `priority`, `category`, `account`, `contact`, `consumer`, `contract`, `entitlement`).

(citation: markdown/now-platform/index.md for audit history)

## Part 4 — Routing Recommendation

**PROCEED — baseline configuration only.**

No Technical Designer dispatch needed. The configuration path:

1. Confirm field-level audit flags in `sys_dictionary` for the fields the engagement wants to track. Typically baseline already audits `state`, `assigned_to`, `priority`; verify and extend as needed.
2. Confirm the activity-stream formatter is enabled on the case form in CSM Configurable Workspace (baseline behaviour; verify it has not been removed in form layout).
3. If a structured *export* of the audit trail is needed (e.g., for compliance reporting), use a report or a Performance Analytics indicator over `sys_history_set`. No custom storage needed.

Consult flags: none fire for this request. PII is present on the case form, but baseline ACLs on `sn_customerservice_case` already enforce read/write rules for agent vs customer roles — no architectural security work needed.

## Part 5 — Anti-Patterns to Block

If Technical Designer or Developer is invoked downstream for unrelated work on this case form, block these:

- **Do not create a custom audit table** (`u_case_audit`, `x_acme_csm_case_audit`, etc.). Baseline `sys_history_set` covers field-level audit; baseline `work_notes` covers commentary. Custom audit table is a §1.1 violation.
- **Do not duplicate audit-write logic in a Business Rule.** Field auditing is handled by the platform when `sys_dictionary.audit = true` — a custom BR that writes audit rows on update is redundant and risks doubled rows.
- **Do not write a custom activity-stream renderer.** Baseline UI formatter handles this. Replacing it loses the platform's evolution path (UI Builder, Next Experience).
- **Do not query `sys_history_set` with deep joins in a Script Include** without indexing review. On high-volume case tables this becomes a performance trap. Use the baseline `GlideRecordHistoryWalker` API or built-in audit reports.

## Open Questions

None. Requirement is fully satisfied by baseline configuration.

---

*End of CSM Specialist Gateway Response.*
```

---

## Example 2 — Verdict B (Baseline Extension)

### Dispatch input

**Source:** Chief Architect, routing from a user request.
**User request:** *"We need to add a 'customer journey stage' on every customer service case — onboarding, adoption, expansion, renewal, churn. Agents should set it on case create; we want to report on case volume per stage."*
**Module:** CSM
**Workspace:** CSM Configurable Workspace
**Volume:** ~80K cases/year
**Sensitivity:** Internal CRM data, not PII

### Gateway Response

```markdown
# CSM Specialist Gateway Response

**Request:** Add a "customer journey stage" attribute on customer service cases with five values for reporting.
**Domain Expert:** CSM Specialist v2.0
**Release family:** Australia

---

## Part 1 — OOB Process Map

`sn_customerservice_case` is the baseline CSM case table. The OOB flow:

1. **Case create** — agent or auto-create from email/chat/portal. Form renders fields from baseline `sn_customerservice_case` and `task` parent.
2. **Case categorisation** — agent sets `category`, `subcategory`, `priority`, `account`, `contact`/`consumer`, `contract`, `entitlement`.
3. **Case work** — state transitions through `1` New → `10` Open → `18` Work in Progress → `3` Awaiting Info → `6` Resolved → `7` Closed.
4. **Reporting** — Performance Analytics indicators and reports run against `sn_customerservice_case` and join to `customer_account` for customer-segment analysis.

The proposed "customer journey stage" is a **dimension** of the case record itself, not a new entity. It belongs on the case, not in a separate table.

(citation: markdown/customer-service-management/csm-case-management.md)

## Part 2 — Data Model Alignment

**Primary baseline table:** `sn_customerservice_case` (extends `task`)

**Existing baseline fields that are NOT a fit for "journey stage":**

| Field | Why not |
|---|---|
| `sn_customerservice_case.state` | Lifecycle state, not customer journey |
| `sn_customerservice_case.priority` | Severity, not journey |
| `sn_customerservice_case.category` | Issue type (e.g., billing, technical), not journey |
| `customer_account.customer_lifecycle_stage` (if present in baseline — verify) | This lives on the *account*, not the case. Cases inherit account context but the request is per-case journey, which may differ from account-level stage. |

**Critical baseline fields to respect:** `account`, `contact`, `consumer`, `state`, `priority`, `category` — all already exist and the journey-stage field must not conflict with their semantics.

**Related baseline tables:** `customer_account` for account-level context; `sn_customerservice_contract` for contract-stage context (renewal date, contract state).

(citation: markdown/customer-service-management/configure-csm-accounts-contacts.md)

## Part 3 — §1.1 Baseline-First Verdict

**Verdict: B — Requires baseline extension.**

The smallest viable extension:

**Add a single Choice field on baseline `sn_customerservice_case`.**

- **Field name:** `sn_customerservice_case.u_customer_journey_stage` (engagement scope prefix per engagement convention; field type Choice)
- **Choice values:** `onboarding` / `adoption` / `expansion` / `renewal` / `churn`
- **Mandatory:** No (agent may leave blank on case create if unknown; populate on next-touch)
- **ACL:** Inherits `sn_customerservice_case` field ACL — no new ACLs required.
- **Reporting:** Add to case-list view in CSM Configurable Workspace; Performance Analytics indicator `Cases by Customer Journey Stage` straightforward to define.

(citation: markdown/customer-service-management/csm-data-management.md)

**Why this is Verdict B, not Verdict A:**

The five values map a *new dimension* that does not exist on `sn_customerservice_case` today. Reusing `category` would collide with issue-type semantics and break existing reports. Reusing `state` would collide with case-lifecycle semantics. The smallest possible extension is one Choice field on the baseline table — no new table, no new scoped app, no state-machine change.

**Why this is Verdict B, not Verdict C:**

A new field on a baseline table is the smallest-scope custom object per §1.1's preference hierarchy (top of the list). It is not a new table, not a new scoped app, not a new Connection Alias, not a state extension on a baseline state field. It is the minimum-viable customisation, which §1.1 accepts at routing-time without halting — provided the Chief Architect approves the field name and engagement-scope conventions.

(citation: markdown/customer-service-management/csm-data-management.md — case data model)

## Part 4 — Routing Recommendation

**PROCEED — dispatch to Technical Designer with constraints.**

Technical Designer's deliverable should include:

1. **Field definition** — `u_customer_journey_stage` (Choice, 5 values), mandatory=No, default=blank.
2. **Form layout update** — surface the field in CSM Configurable Workspace case form, near `account` / `contract` (customer-context cluster).
3. **List view update** — add column to baseline case list view (engagement default view).
4. **Choice population** — populate `sys_choice` records for the five values.
5. **Reporting note** — direction to Reporting & Analytics for the indicator (not Technical Designer's deliverable).
6. **No new ACLs** — explicitly note that field ACLs inherit from `sn_customerservice_case`.
7. **No code** — this is pure configuration. No Developer dispatch needed unless agents request auto-population logic, in which case a small Business Rule is acceptable and would route through Developer + Code Reviewer.

Consult flags:

- **Reporting & Analytics Specialist** — for the Performance Analytics indicator definition (downstream, not blocking).

## Part 5 — Anti-Patterns to Block

- **Do not create a `u_customer_journey` child table.** One field on the baseline table is enough; a child table is an over-design and a §1.1 escalation.
- **Do not put the journey stage on `customer_account` instead of the case.** Account-level journey is a separate concern; cases within one account can sit at different journey points (a churned customer can still have open support cases).
- **Do not extend `sn_customerservice_case.state` with new state values for journey stages.** State is lifecycle; journey is a dimension. Conflating them breaks SLA definitions and case-flow reports.
- **Do not duplicate journey logic in a Business Rule that writes to a new table.** A Choice field is enough; if auto-population is needed, the BR writes to `u_customer_journey_stage` on the same case record.
- **Do not name the field with a global prefix** if engagement convention uses scope prefix `x_acme_*` — coordinate with App Engine Specialist on naming.

## Open Questions

1. **Engagement field-naming convention** — is `u_customer_journey_stage` correct, or does the engagement use `x_<scope>_customer_journey_stage`? Confirm with Chief Architect before Technical Designer dispatches.
2. **Auto-population** — should the field auto-populate from `customer_account.customer_lifecycle_stage` (if that field exists on baseline `customer_account` in the engagement's release)? Verify baseline field availability before design.
3. **Choice value localisation** — does the engagement need localised choice labels? Affects sys_choice record design.

---

*End of CSM Specialist Gateway Response.*
```

---

## Example 3 — Verdict C (§1.1 Halt)

### Dispatch input

**Source:** Chief Architect, routing from a user request.
**User request:** *"We need a separate 'case escalation' table for our CSM cases. Each escalation should track from-tier, to-tier, reason code, business-impact summary, and stakeholder list. We need a related list on the case form with full escalation history. Build the table and the Script Include that creates an escalation record when the agent clicks an Escalate button."*
**Module:** CSM
**Workspace:** CSM Configurable Workspace
**Volume:** ~80K cases/year, ~10% escalate at least once (~8K escalation events/year)
**Sensitivity:** Customer escalations include business-impact statements (potentially commercially sensitive)

### Gateway Response

```markdown
# CSM Specialist Gateway Response

**Request:** Create a custom case-escalation table with structured fields, related list on the case form, and a Script Include to write escalation records on a UI Action click.
**Domain Expert:** CSM Specialist v2.0
**Release family:** Australia

---

## Part 1 — OOB Process Map

The CSM baseline does not have a generic "case escalation" table in Australia release family. The Vancouver+ release introduces `sn_customerservice_escalation`, but **this is not available in Australia** — verify the engagement's release before assuming.

The baseline escalation handling in Australia for `sn_customerservice_case`:

1. **Agent identifies escalation need** — typically when state moves to higher priority, or when case ages past an SLA threshold.
2. **Baseline escalation channels:**
   - `sn_customerservice_case.escalation` field (Choice: None / Low / High / Moderate / Critical) — present on baseline and visible on the case form.
   - `sn_customerservice_case.priority` field — agents may raise priority to signal escalation.
   - `work_notes` — agents log escalation context as appended journal entries.
   - `sys_history_set` — every field change is auto-audited.
   - SLA engine (`task_sla`) — breach events fire baseline notifications and can drive `assignment_group` reassignment via assignment rules.
3. **Baseline notifications** fire on priority change, escalation-field change, and SLA-breach approach.

The user's request describes a *structured escalation event log* with five typed fields. This is a richer model than the baseline single `escalation` Choice field provides.

(citation: markdown/customer-service-management/csm-case-management.md, markdown/customer-service-management/agent-exp.md)

## Part 2 — Data Model Alignment

**Primary baseline table:** `sn_customerservice_case` (extends `task`)

**Existing baseline fields relevant to escalation:**

| Field | Type | Coverage of the requirement |
|---|---|---|
| `sn_customerservice_case.escalation` | Choice (None/Low/Moderate/High/Critical) | Captures current escalation level only, not history |
| `sn_customerservice_case.priority` | Choice | Severity proxy for escalation level |
| `sn_customerservice_case.assignment_group` | Reference | Captures which tier owns the case at this moment |
| `sn_customerservice_case.work_notes` | Journal | Captures arbitrary escalation context, not structured |

**Baseline tables NOT available in Australia for this requirement:**

- `sn_customerservice_escalation` — **NOT in Australia.** Released in Vancouver. Cannot be assumed.

**Related baseline tables:**

- `sys_history_set` + `sys_history_line` — captures field-change events but with raw old/new values, not domain-modelled "escalation events"
- `task_sla` — captures SLA breach but not arbitrary escalation events

The requirement for structured *escalation events* (from-tier → to-tier, reason code, business-impact summary, stakeholders) is not satisfied by any baseline construct in Australia. Each baseline option covers part of the requirement but none covers the full structured-event model.

(citation: markdown/customer-service-management/csm-data-management.md)

## Part 3 — §1.1 Baseline-First Verdict

**Verdict: C — Requires custom object. §1.1 HALT.**

```
🚨 OPEN QUESTION — CUSTOM OBJECT PROPOSAL (§1.1 Blocking)

Before any specialist may be dispatched, §1.1 requires honest evaluation of baseline alternatives. This proposal halts dispatch until Chief Architect direction is received.

1. Baseline options evaluated [citations REQUIRED]:

   a. `sn_customerservice_case.escalation` Choice field
      - Covers: current escalation level (None/Low/Moderate/High/Critical)
      - Falls short: single-value field, no history of transitions, no structured metadata (from-tier, to-tier, reason, stakeholders)
      - Citation: markdown/customer-service-management/csm-case-management.md

   b. `work_notes` structured-JSON append on each escalation event
      - Covers: free-text escalation log with timestamp and agent attribution
      - Falls short: no typed fields, no related-list rendering on the form, hard to report on programmatically without text parsing
      - Citation: markdown/now-platform/index.md (work_notes journal field)

   c. Field auditing on `escalation` + `priority` + `assignment_group` via `sys_history_set`
      - Covers: every change to escalation-relevant fields is captured with old value, new value, who, when
      - Falls short: captures field deltas, not domain events; no place for reason-code, business-impact summary, stakeholder list; no related-list rendering by default
      - Citation: markdown/now-platform/index.md (audit history)

   d. Hybrid: `escalation` + `priority` + `assignment_group` audit + structured JSON in `work_notes` on each escalation
      - Covers: most of the requirement, with field-level audit for state and JSON for structured context
      - Falls short: structured JSON in a journal field is not queryable for reports without text parsing; agents must manually format the JSON; brittle long-term
      - This is a degraded-but-acceptable Alternative — see item 4.

2. Custom object proposed (smallest viable scope):

   Smallest-scope candidate: **A new child table extending `task` (or extending `sn_customerservice_case` directly), in the baseline `sn_customerservice` scope.** Not a new scoped app.

   Hierarchy position (§1.1 preference order, from least to most invasive):
   - Field on baseline table: insufficient — five typed fields needed
   - New child table extending baseline CSM table, in baseline `sn_customerservice` scope: PROPOSED
   - New top-level table in pre-existing scoped app: not justified — sibling-of-task design loses parent-child semantic
   - New scoped app: not justified — no separate deployment cadence required

   Proposed table: `sn_customerservice_case_escalation` (extending `task`, in scope `sn_customerservice`, one related list on `sn_customerservice_case`).

   Field list:
   - `parent_case` (Reference to `sn_customerservice_case`, mandatory)
   - `from_tier` (Reference to `sys_user_group`)
   - `to_tier` (Reference to `sys_user_group`)
   - `reason_code` (Choice)
   - `business_impact_summary` (String, 4000)
   - `stakeholders` (Reference list to `sys_user`)
   - Inherits: `sys_created_on`, `sys_created_by`, `state` from task parent

3. Consequences of approval:
   - **Data model:** one new child table in baseline scope; one related list on case form; minor form-layout work. No CSM upgrade-path concern (child of `task`).
   - **Deployment:** ships in the same update set as the case-form changes; no separate scoped-app deployment cadence.
   - **Support cost:** low — agents learn one new related list; no separate workspace.
   - **Platform-upgrade risk:** low — child of baseline `task`, in baseline scope, with field types that align with baseline conventions. If Vancouver+ ships `sn_customerservice_escalation`, migration path is documented (field-by-field copy script during upgrade).

4. Alternatives if rejected:
   - **Alternative A: Pure baseline (Verdict A-degraded).** Use `escalation` field + `work_notes` + field-level audit. Lose the structured fields; reporting is text-parsing or summary-by-priority. Acceptable if escalation reporting is informal.
   - **Alternative B: Defer until release upgrade.** Wait for Vancouver+ release of `sn_customerservice_escalation` and use baseline then. Acceptable if engagement's roadmap includes the upgrade within 6 months.
   - **Alternative C: Reduce-dimension custom design.** Drop "stakeholders" (handle as `work_notes` mentions) and "business-impact summary" (handle as `work_notes`), keep only `from_tier`, `to_tier`, `reason_code`. Smaller field set, but still a custom table — same §1.1 cost, less benefit. Not recommended.

Decision required from Chief Architect before any specialist is dispatched.

Recommendation if approved: dispatch Technical Designer with this envelope as the dispatch constraints, plus Security & GRC consult (business-impact summary may contain commercially sensitive content).

Recommendation if rejected: adopt Alternative A (pure baseline degraded design). Dispatch ITSM-equivalent Technical Designer pattern to formalise the configuration: enable field-level audit on `escalation`, `priority`, `assignment_group`; define structured `work_notes` template; build Performance Analytics indicator on `sn_customerservice_case` filtered by `escalation > 0`.
```

(citation: markdown/customer-service-management/csm-case-management.md, markdown/now-platform/index.md)

## Part 4 — Routing Recommendation

**HALT — §1.1 custom-object proposal in Part 3 requires Chief Architect decision.**

No specialist is dispatched until the proposal is approved, rejected, or replaced by a Chief Architect alternative.

If approved → dispatch Technical Designer with this envelope. Security & GRC consult fires.

If rejected → adopt Alternative A or Alternative B from Part 3.

## Part 5 — Anti-Patterns to Block

(Surfaced now so that if the proposal is approved, the downstream Technical Designer dispatch carries these constraints.)

- **Do not create a top-level scoped app for this.** Child table in the baseline `sn_customerservice` scope is the correct level. New scoped app for one related list is §1.1 over-escalation.
- **Do not duplicate `task` fields on the new escalation table.** The escalation table inherits from `task` and automatically has `sys_created_on`, `sys_created_by`, `state`, `assigned_to`. Adding parallel fields creates audit-trail confusion.
- **Do not write a Business Rule that copies escalation-table rows back to `work_notes`.** Keep the two stores separate: structured fields on the new table, agent commentary in `work_notes`. Double-writing is a maintenance trap.
- **Do not name the table `u_case_escalation` or `x_acme_case_escalation` if the engagement uses the baseline `sn_customerservice` scope convention.** Match engagement scope-prefix convention; confirm with App Engine Specialist if unclear.
- **Do not reference `sn_customerservice_escalation` as if it exists in Australia.** It does not. Vancouver+ only.
- **Do not skip Security & GRC consult on `business_impact_summary`.** Customer business-impact statements can be commercially sensitive; ACL design matters.

## Open Questions

1. **Engagement release-upgrade roadmap** — is Vancouver+ on the roadmap within 6 months? If yes, Alternative B (defer) becomes attractive.
2. **Engagement scope-prefix convention** — `sn_customerservice` vs `x_acme_csm` vs `u_*`. Determines table naming.
3. **Stakeholder reporting requirement** — is the "stakeholder list" needed for outbound notifications, or only for record-keeping? If notifications, Now Assist or Flow Designer downstream involvement increases.
4. **Reduce-dimension acceptable?** — Would dropping "stakeholders" and "business-impact summary" (keeping only `from_tier`, `to_tier`, `reason_code`) make the §1.1 proposal more acceptable? See Alternative C.

---

*End of CSM Specialist Gateway Response.*
```

---

## Reading these examples

- **Example 1 (Verdict A)** — pattern for the most common request type. The Domain Expert proves baseline covers it and the build chain is short-circuited. PROCEED — baseline configuration only. No Technical Designer dispatch.
- **Example 2 (Verdict B)** — pattern for legitimate baseline extensions. One field on a baseline table. §1.1 accepts this at the smallest scope. PROCEED — Technical Designer dispatch with envelope as constraints.
- **Example 3 (Verdict C)** — pattern for §1.1 halt. The Domain Expert refuses to ratify a custom table without Chief Architect approval. Four baseline alternatives evaluated honestly. Alternatives if rejected documented. HALT — wait for decision.

The §6.2 post-build review fires after Technical Designer returns a spec for Verdict B and Verdict C (approved) cases. The Domain Expert re-validates the spec against the envelope before Developer is dispatched. Post-build review examples are not included in this file — they are short reviews following the four-check structure in `SKILL.md`.

---

*End of CSM Specialist EXAMPLES.md v2.0.*
