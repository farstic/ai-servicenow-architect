# Technical Designer — Examples

Three gold-standard examples of Technical Designer output. Each example shows the input prompt, the produced design spec, and an explanation of why each choice was made.

---

## Example 1 — Story → component design for SLA breach risk surface on Incident form

### Input prompt

> Technical Designer task: produce a design spec for the SLA breach risk surface on the Incident form per the story below.
>
> Story:
> ```gherkin
> Feature: SLA breach risk surface on Incident form
>   As an itil agent
>   I want the breach risk score and band displayed on the incident form
>   So that I can prioritise interventions before SLAs breach
>
>   Background:
>     Given the user is logged into Service Operations Workspace
>     And the user holds the role itil
>
>   Scenario: High-risk incident shows red badge
>     Given an incident is open
>     And the breach risk score for the incident is 75
>     When the agent opens the incident form
>     Then the SLA Risk badge displays "High" in red
>     And the badge shows the score "75"
>
>   Scenario: Risk score below threshold shows green badge
>     Given an incident is open
>     And the breach risk score is 25
>     When the agent opens the incident
>     Then the SLA Risk badge displays "Low" in green
>
>   Scenario: Risk calculation fails
>     Given the breach risk service is unavailable
>     When the agent opens the incident
>     Then the badge displays "—" with tooltip "Risk unavailable"
> ```
>
> Module: ITSM
> Volume context: ~500K incidents, ~50K active concurrent.
> Sensitive data: none beyond standard ITSM.
> Scoped app prefix: x_acme_itsm
> Release family: Australia
>
> Surface §3.1 routing-time consults that fire.

### Expected output

**File suggestion:** `clients/acme/itsm/sla-breach-risk-surface-design.md`

```markdown
# SLA Breach Risk Surface — Component Design

| | |
|---|---|
| Parent story | Feature: SLA breach risk surface on Incident form |
| Scope | x_acme_itsm |
| Author | Technical Designer |
| Date | 2026-05-09 |
| Release family | Australia |

## 1. Purpose

Surface the SLA breach risk score and qualitative band ("Low" / "Medium" / "High") on the Incident form within Service Operations Workspace, so itil agents can prioritise interventions on risk before SLA breach occurs. The score is sourced at form-load time from the existing `SLABreachRiskCalculator` Script Include (see x_acme_itsm developer artefact).

## 2. Scope decision

**Scoped:** `x_acme_itsm`. The risk surface is ITSM-domain functionality on the baseline `incident` table; it has no reuse expectations outside the engagement and must be portable as part of the x_acme_itsm app's deployment.

## 3. Data model

No persistent storage proposed. The risk score is computed at form load and rendered transiently. Persistence is rejected because:
- Risk recomputes from historical data continuously; persisting would create staleness.
- Form-load latency budget (sub-200ms for the badge call) accommodates real-time computation per the existing `SLABreachRiskCalculator` performance profile.

If persistence is later required (e.g., for list views or reporting), the recommended design is a calculated field (`x_acme_itsm.sla_risk_score`) on `incident` populated by an async BR — that is a follow-up design, not in scope here.

**No new tables. No new fields. No indexes.** Section captured explicitly to confirm absence is intentional.

## 4. Access control matrix

The badge is a read-only UI surface. ACL implications are limited to ensuring the risk-calculation Script Include's existing role guard (`itil` or system context) is the gate.

| Component | Operation | Role | Condition | Rationale |
|---|---|---|---|---|
| Client-side badge UI | render | itil | (none — handled by SOW) | The badge is a UI surface; visibility follows the form's existing ACL on `incident`. |
| `SLABreachRiskCalculator.calculateRisk` | execute | itil OR system | implicit in Script Include | Existing role guard preserved; no change required for this design. |

No new ACLs required.

## 5. Server-side logic outline

**No new server-side logic.** The existing `x_acme_itsm.SLABreachRiskCalculator` Script Include is reused as-is. A new `client_callable` wrapper Script Include is required to expose `calculateRisk` to the UI Action's GlideAjax call:

| Item | Type | Purpose | Inputs | Outputs | Rationale |
|---|---|---|---|---|---|
| `SLABreachRiskClient` | Script Include (client_callable: **true**) | GlideAjax wrapper around `SLABreachRiskCalculator.calculateRisk` | `sysparm_incident_sysid` | JSON: `{ risk, score, basis }` | Client cannot invoke a non-client-callable Script Include directly. The wrapper enforces role check (`itil`) and delegates. **Rationale: server not client because the calculator's data access requires server-side aggregation; rationale BR not flow because this is request-response, not event-driven orchestration.** |

The wrapper's body delegates to `SLABreachRiskCalculator` and returns the JSON serialisation. Implementation detail (the actual delegation code) is the Developer's deliverable.

## 6. Client-side logic outline

| Item | Type | Table | When | Condition | Rationale |
|---|---|---|---|---|---|
| `SLA Risk Badge` | Client Script (onLoad) | incident | onLoad | `g_form.getValue('sys_id')` is set | **Rationale client not server: the badge is a UI affordance, rendered transiently per form load with no side effects on the record.** Calls `GlideAjax('x_acme_itsm.SLABreachRiskClient', 'calculateRisk', { sysparm_incident_sysid: <sys_id> })` and renders the result via a Service Operations Workspace badge component. On error, renders `"—"` with tooltip "Risk unavailable" per the story's third scenario. |

## 7. Process automation outline

**No flows required for this surface.** The badge is render-time only; no event-driven orchestration is needed.

## 8. Integration touchpoints

**None.** The risk calculation reads only from local ServiceNow tables (`task_sla`, `incident`).

## 9. Notifications

**None.** The badge is a UI affordance; no notifications dispatched.

## 10. Performance considerations

**Critical performance budget: form-load + badge render ≤ 200ms.**

- Existing `SLABreachRiskCalculator` profile shows ~80ms for two `GlideAggregate` queries on the `task_sla` historical lookback — within budget.
- The GlideAjax round-trip adds ~50ms typical, ~100ms p95 — total ~130–180ms, within budget.
- Caching: server-side caching is rejected because the calculation is per-incident and must reflect the current SLA state. Per-form-session caching is acceptable but not required — the Client Script can hold the result in a closure for the duration of the form session.
- Async load: the badge SHOULD render asynchronously after form paint (don't block form load on the GlideAjax call). The Client Script renders a placeholder immediately, then updates with the result on AJAX completion.

**Consult flag: Performance & Scale Specialist** — fires on volume context (~500K incidents). The existing Script Include profile must be re-validated against current production query plans before go-live.

## 11. Security review

| Concern | Mitigation |
|---|---|
| Privilege escalation via GlideAjax | The wrapper Script Include enforces `gs.hasRole('itil')` before delegation. Non-itil callers get a `null` response, badge renders "—". |
| Information disclosure — risk band reveals operational data | The score and band are derived from the caller's already-readable incident; no privilege escalation. |
| Injection via `sysparm_incident_sysid` | The wrapper validates the parameter as a sys_id format (32-char hex) before delegation. |
| Audit | The risk calculation is a read; no audit record required beyond standard `incident` view audit. |

**No consult flag.** Sensitive-data classification is "none beyond standard ITSM" and ACLs are minimal.

## 12. CMDB / CSDM impact

**None.** The design touches `incident` and `task_sla` only.

## 13. Test strategy outline

| Coverage area | Test approach |
|---|---|
| Happy path — high score | ATF: open incident with mocked task_sla data producing score=75, assert badge text "High", colour red, score "75". |
| Happy path — low score | ATF: open incident with mocked task_sla data producing score=25, assert badge text "Low", colour green. |
| Risk service unavailable | ATF: temporarily break `SLABreachRiskClient` (rename or fail-fast), open incident, assert badge shows "—" with tooltip. |
| Non-itil caller | ATF: impersonate non-itil user with read access to the incident, confirm GlideAjax returns null, badge renders "—". |
| Performance | Load test: 50 concurrent form opens, assert p95 badge-render time <200ms. |

**Hand-off:** ATF Author writes the actual test cases.

## 14. Open questions

1. **Workspace badge component** — does Service Operations Workspace's UX framework provide a reusable badge component, or does the Client Script render via inline HTML? **ASSUMPTION:** SOW exposes `g_form.getControl()`-compatible badge rendering; confirm with UI/UX Specialist before implementation.
2. **Tooltip content for the failure case** — "Risk unavailable" is generic. Should this surface the underlying cause (timeout / no SLA / non-itil caller)? Product owner decision.
3. **Caching policy** — per-form-session caching is recommended but not required; confirm whether the engagement has a standing rule on client-side caching for derived data.

## Downstream handoff manifest

- **Developer** — implements `x_acme_itsm.SLABreachRiskClient` Script Include (client_callable wrapper) and the `SLA Risk Badge` Client Script.
- **Flow Designer Specialist** — not required. No flows in this design.
- **Integration Specialist** — not required. No integrations in this design.
- **UI/UX Specialist** — consult required for SOW badge component pattern (see Open Question 1).

## Consult flags

- **Performance & Scale Specialist** (§3.1) — fires on volume context (~500K incidents). Re-validate existing Script Include against current query plans before go-live.
- **Security & GRC Specialist** — does not fire. ACLs are minimal, no PII.
- **CMDB & CSDM Specialist** — does not fire. No `cmdb_*` access.
- **DevOps / Release Manager** — does not fire. No new scoped app (extending existing x_acme_itsm).
```

### §6.2 post-build manifest

> *Technical design produced. Proposing handoff to Developer for the `SLABreachRiskClient` Script Include and `SLA Risk Badge` Client Script implementations listed in the spec — proceed?*
>
> **Routing-time consult flag (§3.1) standing:** Performance & Scale Specialist consult is recommended before go-live to validate the existing Script Include's query plans against current ~500K-incident volume.
>
> **UI/UX Specialist consult** — Open Question 1 (SOW badge component pattern) should be resolved before Developer implementation begins.

### Explanation

The design spec uses all 14 sections in order, marking sections "Not applicable" with rationale where appropriate (data model, flows, integrations, notifications, CMDB) rather than skipping them. This is a Phase 2.1-style discipline: empty sections force the designer to confirm absence is intentional, not an oversight.

The performance section explicitly flags the §3.1 consult and articulates the latency budget. The security section walks through four concerns rather than handwaving "ACLs are fine".

The handoff manifest names exactly which Phase 2.1 builders consume the design (Developer here; not Flow Designer or Integration Specialist because their sections are empty). UI/UX Specialist is correctly surfaced as a consult — Technical Designer doesn't pretend to know the SOW UX framework, that's a domain consult.

The Developer handoff is the post-build §6.2 trigger. Once Developer produces the wrapper Script Include and the Client Script (both JS), the Code Reviewer trigger will fire on those artefacts — but not on this design spec, which is text.

---

## Example 2 — Net-new component: HR Lifecycle Event for Internal Transfer

### Input prompt

> Technical Designer task: design the HR Lifecycle Event for Internal Transfer per the story below.
>
> Story (high-level):
> - As an HR business partner, I want to initiate an Internal Transfer Lifecycle Event when an employee accepts an internal role.
> - The Lifecycle Event creates HR cases for the source manager (offboarding tasks) and target manager (onboarding tasks), and notifies the employee of timelines.
> - The Lifecycle Event integrates with an external HRIS to update the employee's reporting line on the effective date.
>
> Module: HRSD + Integration to Workday HRIS
> Volume: ~50 transfers/month
> Sensitive data: HR PII (employee compensation, reporting line, performance notes excluded)
> Scoped app prefix: x_acme_hrsd
> Release family: Australia
>
> Surface all routing-time consults that fire.

### Expected output

**File suggestion:** `clients/acme/hrsd/internal-transfer-lifecycle-event-design.md`

```markdown
# Internal Transfer Lifecycle Event — Component Design

| | |
|---|---|
| Parent story | Internal Transfer Lifecycle Event (HR business partner initiates on internal role acceptance) |
| Scope | x_acme_hrsd |
| Author | Technical Designer |
| Date | 2026-05-09 |
| Release family | Australia |

## 1. Purpose

Provide an HR Lifecycle Event in HRSD that, on initiation by an HR business partner, orchestrates the offboarding tasks for the source manager, the onboarding tasks for the target manager, employee communication, and the Workday HRIS reporting-line update on the transfer's effective date. The Lifecycle Event is the single point of coordination for an Internal Transfer.

## 2. Scope decision

**Scoped:** `x_acme_hrsd`. Lifecycle Events are inherently HRSD-domain artefacts; the configuration (activity sets, document templates) belongs in the engagement's HRSD scoped app, not global.

## 3. Data model

| Table | Action | Rationale |
|---|---|---|
| `sn_hr_le_case` (baseline) | Reuse | Lifecycle Event cases are baseline HRSD; no extension needed for this LE. |
| `sn_hr_core_case` (baseline) | Reuse | Activity-level HR cases generated by the LE. |
| `x_acme_hrsd_transfer_meta` | Net-new | Holds transfer-specific metadata not in baseline LE: source role title, target role title, effective date, target cost centre. One record per LE case. |

### `x_acme_hrsd_transfer_meta` field list

| Name | Type | Label | Mandatory | Default | Reference | Description |
|---|---|---|---|---|---|---|
| `le_case` | reference | LE Case | yes | — | `sn_hr_le_case` | Parent LE case. |
| `source_role_title` | string(80) | Source role title | yes | — | — | Title at time of transfer. |
| `target_role_title` | string(80) | Target role title | yes | — | — | New title. |
| `effective_date` | glide_date | Effective date | yes | — | — | Date of reporting-line change. |
| `target_cost_centre` | reference | Target cost centre | yes | — | `cmn_cost_centre` | Cost-centre alignment. |
| `workday_sync_status` | choice | Workday sync status | no | `pending` | — | Values: pending, in_progress, success, failed. |
| `workday_sync_attempt_count` | integer | Workday sync attempt count | no | 0 | — | Used by retry logic. |

### Indexes

| Index | Columns | Rationale |
|---|---|---|
| `idx_le_case` | `le_case` | Lookup by parent LE case (1:1 in practice but enforced as index, not unique constraint, to allow late-binding). |
| `idx_effective_date_status` | `effective_date`, `workday_sync_status` | Scheduled job query for "ready-to-sync transfers" runs on this composite. |

## 4. Access control matrix

| Table | Operation | Role | Condition | Rationale |
|---|---|---|---|---|
| `sn_hr_le_case` (Internal Transfer LE) | create | `sn_hr_core.hr_business_partner` | LE definition = Internal Transfer | Only HRBPs initiate transfers. |
| `sn_hr_le_case` | read | `sn_hr_core.basic` | `subject_person = current` OR has explicit case ACL | Baseline HRSD privacy: employee sees own LE; HR roles see by activity ACL. |
| `x_acme_hrsd_transfer_meta` | create | `sn_hr_core.hr_business_partner` | parent LE state = open | Created by the LE flow on initiation. |
| `x_acme_hrsd_transfer_meta` | read | `sn_hr_core.hr_business_partner` | parent LE assigned to caller | HRBPs see own transfers. |
| `x_acme_hrsd_transfer_meta` | read | `sn_hr_core.hr_admin` | (none) | HR admins see all. |
| `x_acme_hrsd_transfer_meta` | write | `sn_hr_core.hr_admin` | (none) | Restricted writes. |
| `x_acme_hrsd_transfer_meta.workday_sync_status` field-level | read | `sn_hr_core.basic` | DENY | Sync status is operational metadata, not employee-facing. |

## 5. Server-side logic outline

| Item | Type | Table | When | Order | Condition | Rationale |
|---|---|---|---|---|---|---|
| `SetTransferEffectiveDate` | Business Rule | `x_acme_hrsd_transfer_meta` | before insert | 100 | `effective_date` is empty | Defaults effective date to first-of-month + 1 month if HRBP didn't set it. **Server not client because field defaults must be enforced regardless of UI used.** **BR not flow because trivial field-set, no orchestration.** |
| `SyncToWorkday` | Scheduled Job | (no table) | daily 06:00 AEST | n/a | n/a | Queries `x_acme_hrsd_transfer_meta` where `effective_date <= today` AND `workday_sync_status IN (pending, failed)` AND `workday_sync_attempt_count < 5`. Calls Workday spoke per record. **Scheduled not BR because the trigger is date-based, not event-based.** |
| `WorkdayTransferUtils` | Script Include | n/a | n/a | n/a | n/a | Encapsulates the Workday API call (request shaping, response parsing, retry-status update). Called by `SyncToWorkday` and the Workday flow. **Script Include not inline because reused by both scheduled job and a flow.** |

## 6. Client-side logic outline

| Item | Type | Table | When | Condition | Rationale |
|---|---|---|---|---|---|
| `Validate Effective Date` | UI Policy | `x_acme_hrsd_transfer_meta` | on change of `effective_date` | `effective_date < today` | Show inline error: "Effective date must be today or later." **Client because user feedback at field-edit time; the BR also enforces server-side.** |

## 7. Process automation outline

| Item | Type | Trigger | Inputs | Outputs | Step list (high-level) | Error handling |
|---|---|---|---|---|---|---|
| `Internal Transfer LE Flow` | Flow | LE case insert with definition = "Internal Transfer" | LE case sys_id | (none — orchestrates only) | 1) Create source-manager offboarding HR case (assignment due 7d before effective date). 2) Create target-manager onboarding HR case (assignment due 1d before effective date). 3) Send employee comms email. 4) Schedule Workday sync (writes to `x_acme_hrsd_transfer_meta` with `pending` status). | If any sub-case creation fails, mark LE case state = "Error", notify HRBP. |
| `WorkdaySyncOnDemand` | Subflow | Called from scheduled job per record | `x_acme_hrsd_transfer_meta` sys_id | Updated `workday_sync_status` | 1) Call `WorkdayTransferUtils.syncReportingLine` via Integration Specialist's Workday spoke. 2) Update meta record status. 3) On success, append note to LE case. 4) On failure, increment attempt count; if ≥5, escalate to HR admin. | Built into the subflow. |

**Hand-off note:** Flow Designer Specialist consumes this outline and produces the actual flow design.

## 8. Integration touchpoints

| Direction | System | Purpose | Auth | Payload | Volume | MID Server |
|---|---|---|---|---|---|---|
| Outbound | Workday HRIS | Update employee reporting line, cost centre, role title | OAuth2 (existing Workday spoke credential) | JSON: { employee_id, effective_date, manager_id, cost_centre, role_title } | ~50/month, batched daily | Required if Workday is on-prem proxy; cloud Workday tenant: not required. **Confirm with Acme network team (Open Question).** |

**Hand-off note:** Integration Specialist consumes this list and produces the integration architecture spec, including the retry/DLQ pattern, Connection Alias setup, and the `WorkdayTransferUtils` Script Include's Workday spoke invocation pattern.

## 9. Notifications

| Item | Trigger | Recipient | Content | Channel |
|---|---|---|---|---|
| Employee transfer comms | LE case insert | Employee (subject_person) | "Your transfer to <target role> is scheduled for <effective date>. See HR case for details." | Email + Employee Center notification. |
| HR admin escalation | Workday sync attempt_count ≥ 5 | HR admin group | "Workday sync for transfer <LE case number> failed 5 attempts. Manual intervention required." | Email + in-platform task. |

## 10. Performance considerations

- Volume is low (~50/month) — no scale concerns for the LE flow itself.
- The scheduled job processes all due transfers in a single 06:00 AEST run. At ~50/month with ~5 ready per day, this is well within batch budget.
- Workday API latency: assume 500–1500ms per call. Sequential processing is acceptable at this volume; parallelisation not required.

**Consult flag: Performance & Scale Specialist — does not fire.** Volume well below 1M record threshold; no async/batch design pressure.

## 11. Security review

| Concern | Mitigation |
|---|---|
| HR PII in transit to Workday | OAuth2 over TLS 1.2+ via Connection Alias managed by Integration Specialist; no PII logged outside `sn_hr_core_case` and `x_acme_hrsd_transfer_meta`. |
| HR PII in scoped app | Field-level ACL DENY on `workday_sync_status` to `sn_hr_core.basic`; meta record read restricted to HRBP (own) and HR admin (all). |
| Workday credential leakage | Credential lives in Connection Alias, never in code. Integration Specialist owns this design. |
| Audit | Baseline HRSD case audit covers LE state transitions; sync attempts logged to `x_acme_hrsd_transfer_meta` history. |

**Consult flag: Security & GRC Specialist — fires.** HR PII in scope; non-trivial ACLs across multiple tables; outbound integration with regulated employee data. Recommend Security & GRC review of:
- The ACL matrix above (especially the field-level DENY on `workday_sync_status`).
- The Integration Specialist's Workday auth and data-in-transit pattern.
- Audit retention policy on `x_acme_hrsd_transfer_meta`.

## 12. CMDB / CSDM impact

**None.** No `cmdb_*` access. Cost centre is referenced from `cmn_cost_centre`, which is HR/Finance domain, not CMDB.

## 13. Test strategy outline

| Coverage area | Test approach |
|---|---|
| LE initiation creates correct sub-cases | ATF: HRBP initiates LE, assert source-manager and target-manager HR cases created with correct due dates. |
| Effective date default | ATF: HRBP initiates without setting effective date; assert default is first-of-month + 1 month. |
| Effective date past validation | ATF: attempt to set effective date in past; assert UI policy fires AND BR rejects on save. |
| Workday sync happy path | ATF + integration mock: scheduled job runs, mock Workday returns success, assert status = success and LE case has confirmation note. |
| Workday sync retry | ATF + integration mock: mock Workday returns 500, assert attempt_count increments and re-runs next day. |
| Workday sync escalation | ATF + integration mock: 5 consecutive failures, assert HR admin escalation notification dispatched. |
| ACL — HRBP cannot read others' transfers | ATF: HRBP A initiates transfer; HRBP B attempts read; assert ACL denies. |

## 14. Open questions

1. **Workday tenant deployment** — cloud or on-prem? Drives MID Server requirement (Section 8). Open Question for Acme infra team.
2. **Effective-date business rule** — is "first-of-month + 1 month" the correct default, or should it be configurable per-engagement? **ASSUMPTION:** hardcoded for now; revisit if multiple BUs need different defaults.
3. **Workday API contract** — assume the existing Workday spoke supports a `update_reporting_line` Action; confirm with Integration Specialist (next handoff).
4. **Source manager change scenarios** — what happens if the source manager changes between LE initiation and effective date? Out of scope here; flag for product owner.
5. **Compensation changes** — explicitly out of scope per the input. Compensation flows through a separate Lifecycle Event.

## Downstream handoff manifest

- **Developer** — implements `SetTransferEffectiveDate` BR, `SyncToWorkday` Scheduled Job, and `WorkdayTransferUtils` Script Include. Implements the `Validate Effective Date` UI Policy.
- **Flow Designer Specialist** — designs `Internal Transfer LE Flow` and `WorkdaySyncOnDemand` Subflow per Section 7 outline.
- **Integration Specialist** — designs the Workday spoke invocation pattern, Connection Alias for Workday OAuth2, and the retry/DLQ pattern referenced by `WorkdayTransferUtils`.
- **HRSD Specialist** — consult on Lifecycle Event activity-set configuration and Employee Center notification template.

## Consult flags

- **Performance & Scale Specialist** (§3.1) — does not fire (~50/month volume).
- **Security & GRC Specialist** (§3.1) — fires. HR PII in scope, non-trivial ACLs, regulated outbound integration.
- **CMDB & CSDM Specialist** (§3.1) — does not fire.
- **DevOps / Release Manager** (§3.1) — does not fire (existing scoped app, not new).
```

### §6.2 post-build manifest

> *Technical design produced. Proposing handoffs:*
>
> 1. *Developer for the `SetTransferEffectiveDate` BR, `SyncToWorkday` Scheduled Job, `WorkdayTransferUtils` Script Include, and `Validate Effective Date` UI Policy implementations — proceed?*
> 2. *Flow Designer Specialist for the Internal Transfer LE Flow and Workday Sync Subflow design — proceed?*
> 3. *Integration Specialist for the Workday spoke invocation pattern, Connection Alias, and retry/DLQ design — proceed?*
>
> **Standing routing-time consults (§3.1):**
> - **Security & GRC Specialist** — fires on HR PII + non-trivial ACL design + outbound regulated integration.
>
> **Domain consults:**
> - **HRSD Specialist** — consult recommended on Lifecycle Event activity-set configuration before Flow Designer dispatch.

### Explanation

This is a multi-builder design — three Phase 2.1 builders consume the spec (Developer, Flow Designer Specialist, Integration Specialist). The spec uses tables aggressively (field list, ACL matrix, BR list, integration touchpoints) rather than prose, because that's what downstream builders consume cleanly.

The rationale columns on the BR list and Client Script list are mandatory ("server not client because…", "BR not flow because…") — that's a Phase 2.1-style anti-pattern guard. Without rationale, the design is just a list, and the Developer can't second-guess the choices.

The §3.1 consult flags fire correctly: Security & GRC fires on HR PII + outbound integration; Performance & Scale does NOT fire because the volume is low — and the spec says so explicitly rather than firing the consult defensively.

The HRSD Specialist domain consult is correctly surfaced — Technical Designer designs the table model and BR list, but doesn't pretend to know HRSD's Lifecycle Event activity-set conventions. That's a domain expert handoff before Flow Designer Specialist can build the LE flow.

Open Question 4 (source manager change scenarios) is a real question that the input didn't cover. Technical Designer surfaces it rather than inventing a design — that's the convergent-but-honest discipline.

---

## Example 3 — Scoped-app structure design for new CSM Customer Portal extension

### Input prompt

> Technical Designer task: design the scoped-app structure for a new Acme CSM Customer Portal extension that adds case-deflection AI on the customer-facing portal.
>
> Story:
> - As a customer using the portal, I want AI-driven case deflection that suggests KB articles before I submit a case.
> - The deflection AI calls a Now Assist skill on the platform.
> - If deflection succeeds (customer accepts an article), no case is created. If deflection fails, the customer's draft is preserved and a case is submitted.
>
> Module: CSM + Now Assist
> Volume: ~10K case submissions/month attempted; deflection rate target 30% (~3K deflections/month).
> Sensitive data: customer-supplied case content (varies; assume none until classified).
> Scoped app prefix: x_acme_csm_portal (NEW scoped app)
> Release family: Australia
>
> Surface all routing-time consults that fire.

### Expected output

**File suggestion:** `clients/acme/csm/customer-portal-deflection-design.md`

```markdown
# Customer Portal AI Case Deflection — Component Design

| | |
|---|---|
| Parent story | AI-driven case deflection on Acme Customer Portal |
| Scope | x_acme_csm_portal (NEW) |
| Author | Technical Designer |
| Date | 2026-05-09 |
| Release family | Australia |

## 1. Purpose

Add AI-driven case deflection to the Acme customer-facing portal. Before a customer submits a case, the deflection skill (a Now Assist skill backed by AI Search over the published Knowledge Base) suggests relevant KB articles. If the customer accepts an article, the case submission is abandoned and a deflection event is logged. If not, the case is submitted with the customer's draft preserved.

## 2. Scope decision

**New scoped app: `x_acme_csm_portal`.** This is genuinely new functionality with its own deployment cadence; it should not co-deploy with the existing `x_acme_csm` scoped app. The portal extension is also a candidate for App Repository distribution to other Acme business units in future, which requires a clean scope boundary now.

**DevOps / Release Manager consult fires** — new scoped app warrants a deployment-pipeline review.

## 3. Data model

| Table | Action | Rationale |
|---|---|---|
| `sn_customerservice_case` (baseline) | Reuse | Standard CSM cases. |
| `x_acme_csm_portal_deflection_event` | Net-new | One record per deflection attempt; tracks suggested articles, customer choice, deflection outcome. Used for analytics and skill-tuning. |

### `x_acme_csm_portal_deflection_event` field list

| Name | Type | Label | Mandatory | Default | Reference | Description |
|---|---|---|---|---|---|---|
| `session_id` | string(64) | Session ID | yes | — | — | Portal session correlation. |
| `customer_account` | reference | Customer account | yes | — | `customer_account` | Account submitting. |
| `attempted_subject` | string(255) | Attempted subject | yes | — | — | Customer's draft case subject. |
| `suggested_articles` | string(2000) | Suggested articles (JSON) | no | — | — | JSON array of `{ kb_sys_id, score }`. |
| `accepted_article` | reference | Accepted article | no | — | `kb_knowledge` | Set if customer accepted; null if not. |
| `outcome` | choice | Outcome | yes | — | — | Values: deflected, not_deflected_submitted, not_deflected_abandoned. |
| `case_created` | reference | Case created | no | — | `sn_customerservice_case` | Set if outcome = not_deflected_submitted. |
| `created_on` | glide_date_time | Created on | yes | now | — | Standard. |

### Indexes

| Index | Columns | Rationale |
|---|---|---|
| `idx_outcome_created` | `outcome`, `created_on` | Reporting and analytics queries by outcome over time. |
| `idx_account_created` | `customer_account`, `created_on` | Per-customer deflection-rate reporting. |
| `idx_session` | `session_id` | Reconciliation if portal logs and platform logs need correlation. |

## 4. Access control matrix

| Table | Operation | Role | Condition | Rationale |
|---|---|---|---|---|
| `x_acme_csm_portal_deflection_event` | create | `snc_internal` (system context) | (none) | Only created by the portal-side flow, not directly by users. |
| `x_acme_csm_portal_deflection_event` | read | `sn_customerservice_agent` | `customer_account = caller account` | CSM agents see deflection events for accounts they support. |
| `x_acme_csm_portal_deflection_event` | read | `sn_customerservice_admin` | (none) | Admins see all. |
| `x_acme_csm_portal_deflection_event` | write | (none) | (none) | Read-only after creation. Audit integrity. |
| `x_acme_csm_portal_deflection_event.attempted_subject` | read | `sn_customerservice_agent` | `customer_account = caller account` | Subject may contain customer-confidential text; restrict to entitled agents. |

## 5. Server-side logic outline

| Item | Type | Table | When | Order | Condition | Rationale |
|---|---|---|---|---|---|---|
| `LogDeflectionEvent` | Script Include | n/a | n/a | n/a | n/a | Public method `logEvent(sessionId, accountSysId, subject, suggestedArticles, outcome, caseSysIdOrNull)`. Called by the portal flow after each deflection attempt. **Script Include not inline because reused across happy-path and abandonment flows.** |
| `EvaluateDeflectionRate` | Scheduled Job | n/a | weekly Mon 02:00 AEST | n/a | n/a | Aggregates the past 7 days of deflection events; updates Performance Analytics indicators. **Scheduled not BR because the calculation is windowed, not event-driven.** |

## 6. Client-side logic outline

**Not applicable.** The portal is its own UI surface (Service Portal widget); customer-facing client logic lives in the widget, not as Client Scripts on the case form. The widget design is owned by **UI/UX Specialist**.

## 7. Process automation outline

| Item | Type | Trigger | Inputs | Outputs | Step list (high-level) | Error handling |
|---|---|---|---|---|---|---|
| `Portal Deflection Orchestrator` | Subflow | Called from the Service Portal widget on customer subject submission | session_id, account, subject text | { suggested_articles, status } | 1) Call Now Assist deflection skill (see Section 8). 2) Return suggested articles to widget. 3) On widget callback (customer accepts/declines), call `LogDeflectionEvent`. 4) If declined, allow widget to submit case via standard CSM portal path. | If Now Assist skill fails or times out (>3s), return empty suggestions; widget falls back to standard case-submission path. |

**Hand-off note:** Flow Designer Specialist consumes this outline and produces the actual subflow design.

## 8. Integration touchpoints

| Direction | System | Purpose | Auth | Payload | Volume | MID Server |
|---|---|---|---|---|---|---|
| Internal | Now Assist deflection skill | Suggest KB articles for a customer subject | Platform-internal (no external auth) | { subject, account_context } → { articles: [{kb_sys_id, score}] } | ~10K/month | n/a |

**No external integrations.** The Now Assist skill is platform-internal.

**Hand-off note:** Now Assist Specialist designs the deflection skill itself (prompt, tools, confidence thresholds, governance via AI Control Tower). Integration Specialist not required for this design.

## 9. Notifications

**Not applicable for this surface.** Customer-facing notifications during deflection are part of the widget UX, not platform-side. CSM agents receive standard case-creation notifications via baseline CSM (no change).

## 10. Performance considerations

- Deflection skill latency: budget ≤ 2 seconds (perceptual budget for "while customer waits"). Now Assist Specialist must validate this against the chosen LLM and AI Search index size.
- Volume: ~10K/month attempted, ~250 peak per business day, ~30 per business hour. Concurrent peak budget: ~3 concurrent skill calls. Well within Now Assist throughput envelope.
- `x_acme_csm_portal_deflection_event` write rate: ~10K/month, no concern.
- Indicator update job (`EvaluateDeflectionRate`): weekly aggregation over ~10K records, sub-second.

**Consult flag: Performance & Scale Specialist — does not fire** at this volume. The 2-second perceptual latency budget on the skill is a Now Assist concern, not a platform-scale concern.

## 11. Security review

| Concern | Mitigation |
|---|---|
| Customer-supplied subject text — could contain PII or competitive-sensitive content | Logged to `x_acme_csm_portal_deflection_event.attempted_subject` with field-level read restriction (Section 4). Now Assist skill governance must address content classification (Now Assist Specialist scope). |
| KB article exposure to customers without entitlement | The deflection skill must filter suggestions to KBs published to the customer's portal context. Now Assist Specialist owns this filtering logic. |
| Deflection-event tampering | Read-only after creation (Section 4); no write ACLs. Audit integrity. |
| Cross-account leakage in deflection-event reads | ACL condition `customer_account = caller account` enforced for `sn_customerservice_agent`. |

**Consult flag: Security & GRC Specialist — fires.** Customer-supplied content logged to the platform; non-trivial ACLs; new scoped app crossing into customer-facing surface. Security & GRC review of:
- The field-level ACL on `attempted_subject`.
- The deflection skill's content-classification policy (delegated to Now Assist Specialist).
- Audit retention policy for `x_acme_csm_portal_deflection_event`.

## 12. CMDB / CSDM impact

**None.** No `cmdb_*` access.

## 13. Test strategy outline

| Coverage area | Test approach |
|---|---|
| Deflection happy path — customer accepts | ATF + skill mock: customer submits subject, mock skill returns articles, customer accepts → assert no case created, deflection_event.outcome = deflected. |
| Deflection rejected | ATF + skill mock: customer rejects suggestions, submits case → assert case created, deflection_event.case_created = case sys_id, outcome = not_deflected_submitted. |
| Deflection abandoned | ATF: customer closes portal session without accepting or submitting → assert deflection_event.outcome = not_deflected_abandoned. |
| Skill timeout fallback | ATF + skill mock with 5s delay: assert widget falls back to standard case path, no skill suggestions returned. |
| ACL — agent cannot read other accounts | ATF: agent A reads deflection_event for account B → assert denied. |
| Performance — skill latency | Load test: 50 concurrent customer submissions, assert p95 skill round-trip ≤ 2s. |

## 14. Open questions

1. **Customer-content classification policy** — does Acme have a published policy on what customer-submitted text can be logged to the platform vs. tokenised/redacted? Decision required before go-live. Routing to Security & GRC Specialist.
2. **Portal widget design** — the Service Portal widget UX (suggestion display, accept/decline interactions, draft preservation) is owned by UI/UX Specialist; this design covers only the platform-side surface.
3. **Deflection skill design** — the Now Assist skill itself (prompt, tools, confidence routing, AI Control Tower governance) is owned by Now Assist Specialist; this design covers only the platform integration point.
4. **Multi-language support** — is the deflection skill expected to support multiple languages? Drives Now Assist Specialist's skill design.
5. **Deflection-event retention** — how long do we keep deflection events for analytics? 12 months default; confirm with Acme legal.

## Downstream handoff manifest

- **Developer** — implements `LogDeflectionEvent` Script Include and `EvaluateDeflectionRate` Scheduled Job.
- **Flow Designer Specialist** — designs the `Portal Deflection Orchestrator` Subflow per Section 7 outline.
- **Now Assist Specialist** — designs the deflection skill, its prompt, tool list (AI Search wrapper), confidence thresholds, and AI Control Tower governance.
- **UI/UX Specialist** — designs the Service Portal widget for customer-facing interaction.
- **Reporting & Analytics Specialist** — designs the Performance Analytics indicators driven by `EvaluateDeflectionRate`.

## Consult flags

- **Performance & Scale Specialist** (§3.1) — does not fire at platform-side volume.
- **Security & GRC Specialist** (§3.1) — fires. Customer-supplied content logged; non-trivial ACLs; new scoped app crossing customer-facing surface.
- **CMDB & CSDM Specialist** (§3.1) — does not fire.
- **DevOps / Release Manager** (§3.1) — fires. New scoped app warrants deployment-pipeline review and App Repository distribution policy decision.
```

### §6.2 post-build manifest

> *Technical design produced. Proposing handoffs:*
>
> 1. *Developer for `LogDeflectionEvent` Script Include and `EvaluateDeflectionRate` Scheduled Job — proceed?*
> 2. *Flow Designer Specialist for the Portal Deflection Orchestrator Subflow — proceed?*
> 3. *Now Assist Specialist for the deflection skill design (prompt, tools, governance) — proceed?*
>
> **Standing routing-time consults (§3.1):**
> - **Security & GRC Specialist** — fires. Customer content + new scoped app + non-trivial ACLs.
> - **DevOps / Release Manager** — fires. New scoped app warrants deployment-pipeline and App Repository review.
>
> **Additional handoffs:**
> - **UI/UX Specialist** — Service Portal widget design (customer-facing UX).
> - **Reporting & Analytics Specialist** — Performance Analytics indicators for deflection rate.

### Explanation

This design exercises **multiple consult flags simultaneously** — Security & GRC for customer content, DevOps for the new scoped app — and surfaces **multiple Phase 2.2/2.1 builder handoffs** — Developer, Flow Designer Specialist, **Now Assist Specialist**, UI/UX Specialist, Reporting & Analytics. Technical Designer's job is to identify all of these correctly and refuse to encroach on their territory.

Notable discipline: Section 6 (Client-side logic) is "Not applicable" with a rationale pointing to UI/UX Specialist — Technical Designer doesn't pretend to design Service Portal widgets. Section 8 (Integrations) uses the "internal Now Assist skill" as the only touchpoint and immediately hands off to Now Assist Specialist for the skill itself.

The Section 3 (Data model) field list and indexes follow a strict tabular format — that's what Developer and Reporting & Analytics consume cleanly. The ACL matrix in Section 4 has **field-level** restrictions on `attempted_subject` (customer-supplied content) — a Phase 2.1-style anti-pattern guard against logging PII without protection.

Open Question 1 (customer-content classification policy) explicitly routes to Security & GRC Specialist rather than being resolved here. That's the Phase 2.1-style "honest uncertainty" pattern — Technical Designer surfaces what cannot be answered without policy input.

---

*End of Technical Designer EXAMPLES.md v1.0.*
