# Live Artefacts Catalogue — What the Engine Has Deployed

**Repository:** [`farstic/claude-servicenow-live`](https://github.com/farstic/claude-servicenow-live)
**Purpose:** A register of the configuration objects the engine has built and deployed to a live ServiceNow instance under the MCP write protocol. For each artefact: what it does, its object type, the baseline tables it touches, and its §1.1 verdict.
**Audience:** Anyone auditing what is live, onboarding to the engine, or extending one of these artefacts.
**Last updated:** 29 May 2026
**Related:** [`MCP-OPERATIONS-GUIDE.md`](./MCP-OPERATIONS-GUIDE.md) (how these were deployed) · [`nowaikit-field-notes.md`](./nowaikit-field-notes.md) (the write gotchas applied) · root `VALIDATION-TESTS.md` (the regression suite that exercises this behaviour).

---

## How to read this catalogue

Each artefact below was produced by a builder specialist, cleared by a Domain Expert, reviewed by the Code Reviewer, and deployed through the two write gates (§2.1 approval, §2.2 Update Set capture). The **§1.1 verdict** column records the Baseline-First outcome.

> **§1.1 status of the entire catalogue: clean.** All three artefacts are **Verdict A** — they read and write **baseline tables only**. No custom table, no custom scoped application, no custom state extension, and no custom Connection & Credential Alias was created for any of them. This is the intended steady state: the engine adds behaviour, not schema.

Table and field references below name the **baseline constructs** each artefact relies on. Exact method signatures and field-level logic live in the deployed objects themselves and in the corresponding regression tests in root `VALIDATION-TESTS.md`; they are not duplicated here.

---

## 1. SLABreachRiskCalculator

| Attribute | Value |
|---|---|
| **Object type** | Script Include |
| **Purpose** | Calculates the SLA breach-risk score for an incident, informed by the historical SLA performance of its assignment group. |
| **Baseline tables touched** | `incident`, `task_sla`, `contract_sla`, `sys_user_group` — all baseline |
| **Custom objects created** | None |
| **§1.1 verdict** | **A** — fully baseline; configuration and logic only |
| **Domain gateway** | ITSM Specialist (incident + SLA domain) |

A reusable, callable Script Include — it computes a score on demand rather than reacting to a database event. The breach-risk logic reads existing SLA definitions (`contract_sla`) and their per-task instances (`task_sla`), aggregates historical performance by assignment group (`sys_user_group`), and returns a risk indicator for the incident in hand.

This artefact is the worked example behind the §6.2 post-build validation test in `CLAUDE.md`: ITSM gateway fires at Phase 1 Step 5, the Developer builds it, ITSM re-fires in review mode at Phase 2 Step 4, and the Code Reviewer pass fires because a JavaScript artefact was produced.

---

## 2. DuplicateIncidentDetector

| Attribute | Value |
|---|---|
| **Object type** | Detection logic over the incident table (event-driven) |
| **Purpose** | Identifies likely-duplicate incidents and raises a platform event so downstream handlers can act on the match. |
| **Baseline tables touched** | `incident`, `sysevent_register` (event registration) — all baseline |
| **Custom objects created** | None — `duplicate.incident.detected` is a registered **event**, not a custom table |
| **§1.1 verdict** | **A** — baseline detection + baseline event framework |
| **Domain gateway** | ITSM Specialist (incident domain) |

Detects duplicate incidents and fires the registered event `duplicate.incident.detected`. The event-registration step exercised a known MCP gotcha: `register_event` leaves `event_name` blank, so the record is patched immediately after creation (see [`nowaikit-field-notes.md`](./nowaikit-field-notes.md) §4). Using a registered event rather than a custom table keeps the artefact on the baseline event framework — the correct Baseline-First choice.

---

## 3. P1AutoAssign

| Attribute | Value |
|---|---|
| **Object type** | Script Include **+** Business Rule **+** Script Action |
| **Purpose** | Automatically routes newly-raised P1 incidents to the correct assignment group and notifies the responsible party. |
| **Baseline tables touched** | `incident`, `sys_user_group`, `sys_email` (notification) — all baseline |
| **Custom objects created** | None |
| **§1.1 verdict** | **A** — baseline tables, baseline notification path |
| **Domain gateway** | ITSM Specialist (incident domain) |

A three-part artefact, each part in its correct jurisdiction:

- **Business Rule** — fires on the `incident` table when a P1 is raised, and delegates the routing decision. The BR was patched after creation to set `action_insert` / `action_update`, which `create_business_rule` leaves `false` by default (see [`nowaikit-field-notes.md`](./nowaikit-field-notes.md) §5).
- **Script Include** — holds the assignment logic (which baseline `sys_user_group` a given P1 should route to), kept separate so it is reusable and testable.
- **Script Action** — sends the notification. It writes directly to `sys_email` via a GlideRecord insert rather than `gs.sendEmail()`, because `gs.sendEmail()` bypasses `sys_email` on PDI and cannot be verified (see [`nowaikit-field-notes.md`](./nowaikit-field-notes.md) §3).

This artefact is the clearest illustration of the builder-pair routing rules: the Developer owns the Script Include and Script Action code, the Business Rule wiring follows the ITSM Constraint Envelope, and the whole set deployed through both write gates.

---

## 4. Catalogue summary

| Artefact | Type | §1.1 verdict | Custom objects |
|---|---|---|---|
| SLABreachRiskCalculator | Script Include | A | None |
| DuplicateIncidentDetector | Event-driven detection | A | None |
| P1AutoAssign | Script Include + BR + Script Action | A | None |

**Three artefacts live, zero custom architectural objects created.** Every one is baseline-only behaviour added to baseline tables — the Baseline-First rule working exactly as intended.

---

## 5. Adding a new entry

When the engine deploys a new artefact to a live instance, add a section here following the same template: object type, purpose, **baseline tables touched**, custom objects created (state *None* explicitly if so), §1.1 verdict, and the originating Domain gateway. Keep it generic — no sys_ids, no instance URLs, no record-specific data. If a deployment ever creates a custom object, its §1.1 verdict will be **B** or **C** and the approving user message must be referenced.

---

*Documents artefacts deployed by the [Claude ServiceNow Architecture Engine](https://github.com/farstic/claude-servicenow-live) v2.6.*
