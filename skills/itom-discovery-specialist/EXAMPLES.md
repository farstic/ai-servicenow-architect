# ITOM/Discovery Specialist v2.0 — Worked Examples

Three examples exercising each §1.1 verdict path. Each shows the full 5-Part Constraint Envelope for a realistic ITOM dispatch. Read alongside `SKILL.md`.

---

## Example 1 — Verdict A (Fully Baseline)

### Dispatch input

**Source:** Chief Architect.
**User request:** *"We need to discover ~2,000 Linux servers in our data center, populate the CMDB, and keep CIs deduplicated. We have one MID Server in the data center network. Show me how to design this."*
**Module:** ITOM (Discovery)
**Volume:** ~2K Linux servers
**Sensitivity:** Privileged SSH credentials in scope; data center is internal network

### Gateway Response

```markdown
# ITOM/Discovery Specialist Gateway Response

**Request:** Discover ~2K Linux servers in a single network, populate CMDB with dedup.
**Domain Expert:** ITOM/Discovery Specialist v2.0
**Release family:** Australia

---

## Part 1 — OOB Process Map

The baseline horizontal Discovery flow for a Linux server:

1. **Schedule fires.** A `discovery_schedule` record configured for the data center IP range invokes Discovery on its cadence (typical: weekly full scan + nightly delta).
2. **MID Server claims work.** The single data center MID Server picks up the scheduled work via ECC queue.
3. **Network scan phase.** The MID Server runs the Network Discovery probe (port scan / ICMP) to enumerate live IPs in scope.
4. **Classification phase.** For each live IP, the MID Server runs the Classification probe to identify the device type — SSH-port-22 + SNMP fingerprint → Linux server.
5. **Pattern execution.** Once classified as Linux, the **Linux Server discovery pattern** (`sn_disco_pattern` for Linux) executes on the MID Server. The pattern uses the configured SSH credentials (`discovery_credentials` record, type=SSH) to log in and gather configuration: hostname, OS version, hardware (CPU, memory, disk), installed packages, network interfaces, mounted filesystems.
6. **ECC queue output.** Pattern results return as input records on `ecc_queue`.
7. **Sensor processing.** Server-side sensors parse the pattern output.
8. **IRE identification.** IRE looks up the CI by identification rule for `cmdb_ci_linux_server`. Default identifier: `serial_number` (independent); fallback identifier: `name` + `ip_address` (composite).
9. **IRE reconciliation.** If existing CI found, reconciliation rules determine which fields update (Discovery typically has high precedence for hardware fields).
10. **CI insert/update.** `cmdb_ci_linux_server` record inserted or updated.

(citation: markdown/it-operations-management/index.md, markdown/servicenow-platform/configuration-management-database-cmdb/c_CMDBIdentifyandReconcile.md)

## Part 2 — Data Model Alignment

**Primary baseline CI class:** `cmdb_ci_linux_server`

**Class hierarchy:**
`cmdb_ci_linux_server` extends `cmdb_ci_server` extends `cmdb_ci_computer` extends `cmdb_ci_hardware` extends `cmdb_ci`

**Critical baseline fields:**

| Field | Type | Purpose |
|---|---|---|
| `cmdb_ci_linux_server.serial_number` | String | Independent identifier (highest priority) |
| `cmdb_ci_linux_server.name` | String | Hostname; composite identifier |
| `cmdb_ci_linux_server.ip_address` | String | IP address; composite identifier |
| `cmdb_ci_linux_server.os_version` | String | Linux distribution + version |
| `cmdb_ci_linux_server.discovery_source` | String | Set to "ServiceNow:Discovery" on Discovery write |
| `cmdb_ci_linux_server.install_status` | Choice | Set to "Installed" on Discovery insert |
| `cmdb_ci_linux_server.operational_status` | Choice | Operational/Non-Operational |

**Related baseline tables:**

- `ecc_queue` — communication queue between MID Server and instance
- `discovery_schedule` — schedule records
- `sn_disco_pattern` — Linux Server pattern (baseline)
- `discovery_credentials` — SSH credentials, type=SSH, vault-encrypted
- `cmdb_identification_rule` — `cmdb_ci_linux_server` identification rule (baseline)
- `cmdb_rel_ci` — relationships from Linux server to network gear, applications, etc.

(citation: markdown/it-operations-management/index.md, markdown/servicenow-platform/configuration-management-database-cmdb/ci-class-manager-landing-page.md)

## Part 3 — §1.1 Baseline-First Verdict

**Verdict: A — Fully covered by baseline.**

The Linux server discovery requirement is fully satisfied by baseline ITOM constructs:

1. **One `discovery_schedule` record** for the data center IP range, scheduled weekly full + nightly delta.
2. **Existing baseline MID Server** (no new MID Server needed for 2K servers with one schedule — well within single-MID throughput).
3. **Baseline Linux Server discovery pattern** (`sn_disco_pattern` record) — already shipped, no extension needed.
4. **Baseline SSH credential type** in `discovery_credentials` — engagement configures one credential record with the SSH key/password for the discovery service account.
5. **Baseline `cmdb_ci_linux_server` identification rule** — already ships with serial_number (independent) + name+ip_address (composite). No new IRE rule needed.
6. **Baseline reconciliation rules** — Discovery has standard precedence for hardware fields; engagement may need to adjust if other data sources also write to CIs, but no custom logic needed.

No custom CI class. No custom pattern. No custom dedup logic. No custom Business Rules. Pure baseline Discovery configuration.

(citation: markdown/it-operations-management/index.md)

## Part 4 — Routing Recommendation

**PROCEED — baseline configuration only.**

No Technical Designer dispatch needed. The configuration path:

1. **Verify MID Server health** — confirm the data center MID Server is online (`ecc_agent` record status), running supported MID version, in the correct application scope.
2. **Configure SSH credential** — create `discovery_credentials` record (type=SSH, scope = engagement-specific discovery credential vault).
3. **Configure Discovery schedule** — `discovery_schedule` record with:
   - IP range or netmask for the data center
   - Cadence (weekly full + nightly delta is typical)
   - MID Server selector pointing at the data center MID
4. **Run initial test scan** — limited IP range, validate CI insert and IRE behaviour.
5. **Run full scan** — observe completion time, CI count, CMDB Health dashboard for orphans or duplicates.
6. **Tune** — adjust schedule cadence based on real-world throughput.

Optional Developer involvement: none for baseline Linux Discovery.

Consult flags:
- **Security & GRC** — informational consult on SSH credential governance (rotation, vault, service-account least-privilege).
- **Performance & Scale** — not fired; 2K CIs is well within single-MID throughput.

## Part 5 — Anti-Patterns to Block

- **Do not create a `u_linux_server` or `x_acme_linux_server` CI class.** `cmdb_ci_linux_server` covers it; custom class is a §1.1 violation and breaks IRE.
- **Do not write a custom Discovery probe for Linux.** Baseline Linux Server pattern covers hostname, OS, hardware, packages. Extensions to baseline pattern are acceptable (with §1.1 review); custom probes that bypass pattern infrastructure are not.
- **Do not write a custom Business Rule that deduplicates CIs by hostname.** IRE handles dedup via identification rules. Custom dedup BRs corrupt IRE state.
- **Do not bypass the ECC queue for "fast" MID Server result handling.** All MID traffic through ECC.
- **Do not put SSH credentials in plain text on the MID Server filesystem.** Use `discovery_credentials` records (vault-encrypted, transmitted via ECC).
- **Do not create relationships in `cmdb_rel_ci` manually** without going through Discovery or IRE-mediated insertion. Manual relationships break service-map consistency.
- **Do not set `cmdb_ci_linux_server.discovery_source` to a custom value** ("Discovery_Custom", etc.). Use the baseline `ServiceNow:Discovery` source so reconciliation rules apply consistently.

## Open Questions

1. **Service account governance** — does the engagement have a Linux service account with the appropriate sudo rules for Discovery? If not, Security & GRC consult fires.
2. **Schedule timing** — is there a maintenance-window constraint on Linux servers? Discovery is low-impact but engagement may want to align with established windows.
3. **CMDB Health baseline** — is CMDB Health Dashboard active in the engagement? Recommend enabling before initial scan to catch orphan / stale / duplicate CIs in real time.

---

*End of ITOM/Discovery Specialist Gateway Response.*
```

---

## Example 2 — Verdict B (Baseline Extension)

### Dispatch input

**Source:** Chief Architect.
**User request:** *"On our Linux server CIs, we need to record a 'compliance baseline tier' (Tier 1 Strict, Tier 2 Standard, Tier 3 Relaxed). This is set during onboarding and used by our Security team in reports. It does not come from Discovery — it's set manually by the Linux Engineering team via the CI form."*
**Module:** ITOM (CMDB)
**Volume:** ~2K Linux servers (continues from Example 1)
**Sensitivity:** Internal compliance tagging; informs security reporting

### Gateway Response

```markdown
# ITOM/Discovery Specialist Gateway Response

**Request:** Add a "compliance baseline tier" attribute on Linux server CIs, manually set.
**Domain Expert:** ITOM/Discovery Specialist v2.0
**Release family:** Australia

---

## Part 1 — OOB Process Map

`cmdb_ci_linux_server` records are populated by baseline Discovery (per Example 1 envelope). Once a CI exists, the CI form supports both Discovery-written fields and manually-edited fields. Field-write origin is tracked by:

- `cmdb_ci.discovery_source` (which source last wrote the record)
- `sys_history_set` (per-field audit, including who manually edited)
- IRE reconciliation rules (which sources can update which fields)

For manually-set fields that Discovery should not overwrite, IRE reconciliation rules need a "manual override" or "Discovery-cannot-write" configuration.

(citation: markdown/servicenow-platform/configuration-management-database-cmdb/c_CMDBIdentifyandReconcile.md)

## Part 2 — Data Model Alignment

**Primary baseline CI class:** `cmdb_ci_linux_server`

**Existing baseline fields evaluated:**

| Field | Coverage |
|---|---|
| Existing fields on `cmdb_ci_linux_server` | None capture "compliance tier" — closest is `comments` (free text) or generic `category` (single Choice, used for CI classification, not compliance). |
| Tag-based pattern (`label`, `tag` tables in the platform) | Available — could tag CIs with "Tier1Strict" / "Tier2Standard" / "Tier3Relaxed" labels. Lightweight, but tag-based reporting is more fragile than field-based reporting. |
| Hardware-related fields | Not relevant (hardware data is Discovery-driven; compliance is policy-driven). |

The compliance-tier attribute is a *new dimension* on the CI. Baseline does not carry it.

(citation: markdown/servicenow-platform/configuration-management-database-cmdb/ci-class-manager-landing-page.md)

## Part 3 — §1.1 Baseline-First Verdict

**Verdict: B — Requires baseline extension.**

The smallest viable extension:

**Add a single Choice field on `cmdb_ci_linux_server`:**

- **Field name:** `cmdb_ci_linux_server.compliance_baseline_tier` (or engagement-scope-prefixed equivalent if convention dictates)
- **Type:** Choice. Values: `tier_1_strict` / `tier_2_standard` / `tier_3_relaxed`
- **Mandatory:** No (existing CIs may not have it set initially; populate over time)
- **Default:** None — explicit assignment required by Linux Engineering
- **IRE reconciliation rule:** Configure `cmdb_ci_linux_server.compliance_baseline_tier` such that **Discovery cannot write to it** (Discovery has no source for it; manual edit only).

**Why this is Verdict B, not Verdict A:**

The attribute is genuinely new on `cmdb_ci_linux_server`. Tag-based labels (alternative considered) would work but expose engagement to tag-vs-field reporting fragility — Security team's reports depend on consistent classification, and tags are easier to remove accidentally.

**Why this is Verdict B, not Verdict C:**

One field on a baseline CI class is at the top of §1.1's preference hierarchy. No new table, no new scoped app, no custom CI class, no state-machine impact.

**Important: Should this field be on `cmdb_ci_linux_server` or on a parent class?**

Consider: Should the field live on `cmdb_ci_linux_server` (Linux-only) or on `cmdb_ci_server` (all servers) or on `cmdb_ci` (all CIs)?

If the engagement plans to compliance-tier *all* servers (Windows, Solaris, AIX), the field belongs on `cmdb_ci_server` (parent class) so it inherits to all server variants. If only Linux, keep it on `cmdb_ci_linux_server`. Open question in Part 5.

(citation: markdown/servicenow-platform/configuration-management-database-cmdb/c_CMDBIdentifyandReconcile.md — reconciliation rules for manual fields)

## Part 4 — Routing Recommendation

**PROCEED — dispatch to Technical Designer with constraints.**

Technical Designer's deliverable:

1. **Class-placement decision** — confirm `cmdb_ci_linux_server` vs `cmdb_ci_server` for the field. Document rationale.
2. **Field definition** — `compliance_baseline_tier` (Choice, 3 values, mandatory=No).
3. **Form layout update** — surface field on CI form, in a dedicated "Compliance" section.
4. **List view update** — add column to default `cmdb_ci_linux_server` list view (or `cmdb_ci_server` if placed on parent).
5. **IRE reconciliation rule** — explicit rule preventing Discovery from writing or clearing this field. Manual write only.
6. **Audit** — confirm `sys_dictionary.audit = true` on the new field so manual changes are captured in `sys_history_set`.
7. **Reporting note** — direction to Reporting & Analytics for compliance-tier-based reports (not Technical Designer's deliverable).

Consult flags:
- **CMDB & CSDM Specialist** — co-fire gateway for the CI/CSDM model placement of the field (class choice, CSDM phase); ITOM owns the Discovery/population side.
- **Reporting & Analytics Specialist** — downstream, non-blocking.

## Part 5 — Anti-Patterns to Block

- **Do not let Discovery write to `compliance_baseline_tier`.** IRE reconciliation rule must explicitly block Discovery from updating this field. Otherwise weekly Discovery scans will clear manually-set values.
- **Do not store compliance tier as a tag.** Reports need consistent, queryable field-level data. Tags are easier to lose.
- **Do not create a `u_linux_compliance_tier` table** with a 1:1 reference to `cmdb_ci_linux_server`. One field on the baseline CI class is enough.
- **Do not extend `cmdb_ci_linux_server.category` with compliance tier values.** `category` has separate semantics (CI classification). Conflating categories breaks existing reports.
- **Do not put the field on `cmdb_ci` (the root CI class) unless engagement intends to compliance-tier all CI types.** Field placement should match scope of use; over-broad placement bloats the schema for irrelevant CI types.
- **Do not skip the IRE reconciliation rule.** Discovery overwriting manually-set values on its weekly run is the #1 failure mode for hybrid manual/Discovery fields.

## Open Questions

1. **Class placement** — is the field for Linux only, or all servers? If all servers, place on `cmdb_ci_server` (parent class). Confirm with engagement before Technical Designer dispatch.
2. **Default tier on Discovery insert** — should new Linux CIs default to one tier on first Discovery, or remain blank until manually set? If default tier, configure on form via UI default (not IRE — IRE shouldn't write this field).
3. **Compliance reporting consumer** — who consumes the compliance tier reports? Security team, audit team, both? Affects ACL visibility on the field (might need read access for `it_admin` + `security_admin` roles).
4. **Engagement field-naming convention** — `compliance_baseline_tier` (baseline-scope) vs scoped-app prefix. Confirm with Chief Architect / App Engine Specialist.

---

*End of ITOM/Discovery Specialist Gateway Response.*
```

---

## Example 3 — Verdict C (§1.1 Halt)

### Dispatch input

**Source:** Chief Architect.
**User request:** *"We've adopted a new in-house platform — 'AceGrid' — that runs as a clustered data-plane service. AceGrid clusters have specific attributes: cluster name, leader node, follower nodes, shard count, replication factor, cluster health metric. We need this as a first-class CI in the CMDB with custom Discovery and CMDB Health rules. Build the CI class and the Discovery pattern."*
**Module:** ITOM (CMDB + Discovery)
**Volume:** ~50 AceGrid clusters expected
**Sensitivity:** Internal infrastructure; AceGrid is internal-only technology

### Gateway Response

```markdown
# ITOM/Discovery Specialist Gateway Response

**Request:** Create a custom CI class for in-house AceGrid clusters with custom Discovery pattern and CMDB Health rules.
**Domain Expert:** ITOM/Discovery Specialist v2.0
**Release family:** Australia

---

## Part 1 — OOB Process Map

The baseline CMDB ships a deep class hierarchy under `cmdb_ci`, including extensive coverage of:

- Database clusters (`cmdb_ci_db_cluster` and variants)
- Application clusters (`cmdb_ci_appl_cluster` and variants)
- Cache clusters (`cmdb_ci_cache_*`)
- Search/indexing clusters
- Container orchestration (`cmdb_ci_kubernetes_*` family)
- Cloud-native clusters

The baseline Discovery framework supports:

- Pattern-based discovery via `sn_disco_pattern`
- IRE identification rules per CI class
- CMDB Health rules per CI class

The user's request introduces a new in-house technology (AceGrid) not covered by any baseline CI class. The relevant question is whether AceGrid can be modelled by an existing baseline class (with field extensions) or requires a new CI class.

(citation: markdown/servicenow-platform/configuration-management-database-cmdb/ci-class-manager-landing-page.md)

## Part 2 — Data Model Alignment

**Existing baseline classes evaluated for AceGrid:**

| Baseline class | Fit |
|---|---|
| `cmdb_ci_appl_cluster` | Partial — covers generic "application cluster" with leader/follower model; AceGrid's shard/replication semantics are not baseline fields |
| `cmdb_ci_db_cluster` | Partial — covers database cluster with shards but AceGrid is not a database; semantic mismatch on `database` parent |
| `cmdb_ci_cache_cluster` (if it exists in Australia — verify) | Partial — covers in-memory cache clusters with similar leader/follower; AceGrid is data-plane service, not pure cache |
| `cmdb_ci_kubernetes_cluster` | Mismatch — AceGrid runs on/in Kubernetes but is not Kubernetes itself |
| `cmdb_ci_appl` (generic application) | Too generic — loses the cluster semantic (no relationships to nodes, no shard tracking) |

**Genuine semantic gap:** AceGrid is a clustered data-plane service with:
- Cluster identity + leader/follower model (covered by `cmdb_ci_appl_cluster` partially)
- Shard count + replication factor (NOT in any baseline class)
- AceGrid-specific health metric (NOT in any baseline class)

**Relationships AceGrid needs:**
- AceGrid Cluster → leader node CI (Hosted on / Runs on)
- AceGrid Cluster → follower node CIs (Hosted on / Runs on)
- AceGrid Cluster → upstream business service (Used by)
- AceGrid Cluster → underlying infrastructure (Depends on)

The relationship semantics are baseline (`cmdb_rel_ci` covers them). The CI class question is the contested part.

(citation: markdown/servicenow-platform/configuration-management-database-cmdb/ci-class-manager-landing-page.md)

## Part 3 — §1.1 Baseline-First Verdict

**Verdict: C — Requires custom object. §1.1 HALT.**

```
🚨 OPEN QUESTION — CUSTOM OBJECT PROPOSAL (§1.1 Blocking)

Before any specialist may be dispatched, §1.1 requires honest evaluation. This proposal halts dispatch until Chief Architect decision is received.

1. Baseline options evaluated [citations REQUIRED]:

   a. Use `cmdb_ci_appl_cluster` directly with field extensions for shard count, replication factor, AceGrid health metric
      - Covers: cluster identity, leader/follower (`cluster_role` field on cluster member CIs)
      - Falls short: requires three field extensions on `cmdb_ci_appl_cluster` that apply only to AceGrid (and not to other application clusters). Schema bloat on the parent class for AceGrid-specific attributes.
      - Citation: markdown/servicenow-platform/configuration-management-database-cmdb/ci-class-manager-landing-page.md

   b. Use `cmdb_ci_appl_cluster` with a child reference to a new "AceGrid metadata" table
      - Covers: cluster identity baseline; AceGrid-specific data in a separate sidecar table
      - Falls short: indirection through a sidecar table makes queries and reports more complex than necessary; sidecar is itself a custom table (similar §1.1 cost to a child CI class but with worse semantics)
      - Citation: markdown/servicenow-platform/configuration-management-database-cmdb/ (CMDB data-model principles)

   c. Use baseline `cmdb_ci_appl` (generic application) with multiple tag-based or list-based attributes
      - Covers: storage of arbitrary attributes
      - Falls short: loses the cluster semantic (no first-class relationships to nodes as cluster members), bad for IRE and Discovery (no clear identifier), bad for reporting
      - Citation: markdown/servicenow-platform/configuration-management-database-cmdb/ (cluster semantics)

   d. Don't create a CI; track AceGrid via tags on the host servers
      - Covers: lightweight "this Linux server runs AceGrid" tracking
      - Falls short: loses cluster identity entirely; no cluster-level reporting; no Service Mapping integration
      - Citation: n/a (anti-pattern)

2. Custom object proposed (smallest viable scope):

   Smallest-scope candidate: **A new CI class `cmdb_ci_acegrid_cluster` extending `cmdb_ci_appl_cluster`, in the CMDB scope.**

   Hierarchy position (§1.1 preference order):
   - Field on baseline table: rejected — three fields on `cmdb_ci_appl_cluster` for AceGrid-specific data bloats the parent class
   - Child CI class extending baseline `cmdb_ci_appl_cluster`, in CMDB scope: PROPOSED — keeps AceGrid-specific fields on the AceGrid class, inherits cluster semantics from baseline
   - New top-level CI class extending `cmdb_ci`: rejected — would lose baseline cluster relationships and reporting
   - New scoped app: rejected — CMDB scope is appropriate

   Proposed class: `cmdb_ci_acegrid_cluster` (extends `cmdb_ci_appl_cluster`, in CMDB scope)

   AceGrid-specific fields:
   - `shard_count` (Integer)
   - `replication_factor` (Integer)
   - `health_metric` (Decimal) — AceGrid-reported health, 0.0 to 1.0
   - `leader_node` (Reference to `cmdb_ci_linux_server` or `cmdb_ci_server`)
   - Inherits from `cmdb_ci_appl_cluster`: cluster name, cluster members (via `cmdb_rel_ci`)

   Discovery: new `sn_disco_pattern` record extending baseline `cmdb_ci_appl_cluster` pattern, with AceGrid-specific probe sequence (call AceGrid's admin API on cluster leader to gather shard, replication, and health data).

   IRE: new `cmdb_identification_rule` for `cmdb_ci_acegrid_cluster`:
   - Independent identifier: `cluster_name` (assumes engagement guarantees unique AceGrid cluster names)
   - Fallback identifier: `leader_node` + `name` (if name is reusable across clusters)

   CMDB Health: new rules under `cmdb_health_dashboard` for AceGrid-specific completeness (e.g., "shard_count must be populated", "leader_node relationship must exist").

3. Consequences of approval:
   - **Data model:** one new CI class in CMDB scope; child of baseline `cmdb_ci_appl_cluster`. Three new fields on the child class. IRE rule. CMDB Health rules.
   - **Deployment:** ships in CMDB update set; no separate scoped app cadence.
   - **Support cost:** medium — new CI class to administer, new Discovery pattern to maintain (especially during AceGrid version upgrades that change admin API), new IRE rule to govern.
   - **Platform-upgrade risk:** medium-low — child class extending baseline `cmdb_ci_appl_cluster`. ServiceNow could ship its own AceGrid CI class in a future release if AceGrid becomes industry-standard (currently no announced roadmap). If so, migration path is documented (class merge with field-by-field copy).
   - **Service Mapping:** new pattern needed if AceGrid clusters are part of business-service top-down maps. Top-down maps recognise `cmdb_ci_appl_cluster` parent, so inheritance gives partial recognition; AceGrid-specific patterns can extend.

4. Alternatives if rejected:
   - **Alternative A: Pure baseline (option (a) above).** Use `cmdb_ci_appl_cluster` directly with three field extensions on the parent class. Acceptable but causes schema bloat on the parent class for non-AceGrid clusters too. Adopted by some engagements that want to minimise CMDB schema additions.
   - **Alternative B: Defer until ServiceNow ships AceGrid CI class.** Not viable unless AceGrid is announced on ServiceNow's roadmap (unlikely for in-house technology).
   - **Alternative C: Tag-based tracking on host servers.** Lightweight; loses cluster semantic; not recommended for the 50-cluster operational scale described in dispatch.

Decision required from Chief Architect before any specialist is dispatched.

Recommendation if approved: dispatch Technical Designer + Performance & Scale consult (for Discovery throughput on 50 clusters with API-based probe) + DevOps consult (for pattern-version management).

Recommendation if rejected: adopt Alternative A. Document schema-bloat trade-off.
```

(citation: markdown/servicenow-platform/configuration-management-database-cmdb/ci-class-manager-landing-page.md, markdown/it-operations-management/discovery-and-service-mapping-patterns/)

## Part 4 — Routing Recommendation

**HALT — §1.1 custom-object proposal in Part 3 requires Chief Architect decision.**

No specialist is dispatched until proposal is approved, rejected, or replaced.

If approved: dispatch Technical Designer + Performance & Scale + DevOps. Pattern development is non-trivial; allow design time.

If rejected: adopt Alternative A (extend `cmdb_ci_appl_cluster` directly).

## Part 5 — Anti-Patterns to Block

(Surfaced now in case the proposal is approved.)

- **Do not create the CI class outside CMDB scope.** Custom scoped apps for single CI classes are §1.1 over-escalation.
- **Do not create a custom probe that bypasses pattern infrastructure.** Use `sn_disco_pattern` records, even for AceGrid-specific discovery. Custom probes are §1.1 violations and break upgrade-path.
- **Do not write a custom CMDB Business Rule that dedups AceGrid clusters by leader_node.** Use IRE. AceGrid identification rule must be defined as part of the design.
- **Do not duplicate the AceGrid health metric in a separate "alert" table.** If `health_metric` drops below a threshold, the appropriate baseline path is Event Management — emit an event from AceGrid into `em_event`, configure `em_alert_rules` to correlate, and let baseline event-management handle alerting.
- **Do not create custom relationships between AceGrid clusters and their nodes.** Use `cmdb_rel_ci` with appropriate baseline relationship types (Hosted on::Runs on, Depends on::Used by).
- **Do not skip the IRE identification rule definition.** A new CI class without IRE rules will create orphans on every Discovery cycle.
- **Do not assume cluster names are globally unique without verification.** If the engagement has multiple AceGrid deployments (e.g., prod, staging, dev), `cluster_name` alone may not be unique. Composite identifier (e.g., `cluster_name` + `environment`) may be needed.
- **Do not bypass the ECC queue for the AceGrid admin API call.** All MID Server external API calls flow through ECC queue protocol.

## Open Questions

1. **AceGrid admin API stability** — is the API versioned? Pattern development assumes a stable contract. Provide AceGrid API documentation to Technical Designer.
2. **Cluster name global uniqueness** — confirm or extend identifier to composite.
3. **Health metric threshold for Event Management** — what threshold triggers an alert? Defines `em_alert_rules` configuration downstream.
4. **AceGrid version diversity** — are all 50 clusters on the same AceGrid version? Version differences in admin API affect pattern stability.
5. **Service Map integration** — should AceGrid clusters appear in top-down business service maps? Affects whether new Service Mapping patterns are also needed (Service Mapping Specialist consult might extend timeline).
6. **DevOps pattern lifecycle** — will AceGrid pattern be deployed via update set or via CI/CD? Affects DevOps consult scope.

---

*End of ITOM/Discovery Specialist Gateway Response.*
```

---

## Reading these examples

- **Example 1 (Verdict A)** — pattern for the most common Discovery scenario. Baseline Linux Server pattern, baseline IRE rule, baseline MID Server. PROCEED — baseline configuration only. No Technical Designer dispatch.
- **Example 2 (Verdict B)** — pattern for a single field extension on a baseline CI class, with IRE reconciliation governance to protect manual-set values from Discovery overwrite. PROCEED — Technical Designer dispatch with envelope as constraints.
- **Example 3 (Verdict C)** — pattern for §1.1 halt on a new CI class. Four baseline alternatives evaluated, full §1.1 hierarchy considered, smallest-scope custom class proposed (child of baseline `cmdb_ci_appl_cluster` in CMDB scope, NOT new scoped app). HALT — Chief Architect decision required.

The §6.2 post-build review fires after Technical Designer returns a spec for Verdict B and Verdict C (approved). The Domain Expert re-validates against the envelope before Developer is dispatched.

---

*End of ITOM/Discovery Specialist EXAMPLES.md v2.0.*
