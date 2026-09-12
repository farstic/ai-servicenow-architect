# T-01 … T-18 in design-only on v2.0.0-rc.1

**Run** 2026-09-12 · **CLI** 2.1.258 (Claude Code) · macOS (Darwin 25.5.0) · **tag** `v2.0.0-rc.1` · **commit** `aa205b5`
**Engine** 2.0.0-rc.1 · **Docs corpus** `vendor/ServiceNowDocs`, release family `australia`

## 15 PASS · 2 INCONCLUSIVE · 1 FAIL

Of the 15 passes, 9 are plain PASS, 2 are PASS (dormant) (T-05, T-06) and 4 are PASS (n turns)
(T-01, T-13, T-16, T-18): single-turn runs judged against the turn-1 standard the 2026-09-09 record
set for those two-turn tests, with their Phase 2 or second-turn criteria left unverified. The two
INCONCLUSIVE rows (T-07, T-17) and the one FAIL (T-10) each carry their criteria and root cause
below. Nothing in this run was re-run or ruled on; this is a first-pass record of the release
candidate as tagged.

| | This run | 2026-09-09 (after rulings) |
|---|---|---|
| Plain PASS | 9 | 12 |
| PASS (dormant) | 2 | 2 |
| PASS (n turns) | 4 | 4 (recorded as two-turn PASS there) |
| INCONCLUSIVE | 2 (T-07, T-17) | 0 |
| FAIL | 1 (T-10) | 0 |

## The checkout

A fresh `git clone --depth 1` of the tag `v2.0.0-rc.1` (commit `aa205b5`) into an empty directory
under the scratchpad. The docs corpus was copied in; no network was used. This time the **real
bootstrap** ran in design mode:

```
./bootstrap.sh --mode design --yes --skip-claude-check --docs skip
```

and wrote `.claude/settings.local.json` with `disabledMcpjsonServers: ["servicenow"]`. That is a
deviation from 2026-09-09, where the file was written by hand and the doctor was a stub; here the
doctor is the shipped one.

**One fresh headless session per test**, 20 session files in all:

```
claude -p --output-format stream-json --verbose --allowedTools <per test>
```

`Read,Grep,Glob` were allowed for every test; T-07 additionally had `Bash(./snowarch:*)` and T-13
additionally had `Write`. T-07 ran as three turns via `--resume`, which is why 18 tests give 20
session files.

Three things about this environment shape the verdicts below, and all three are properties of the
harness rather than of the engine:

1. **The folder was untrusted in effect, not by construction.** A smoke run earlier the same day at
   the same path had left a `~/.claude.json` entry for it, so this run does not satisfy the
   "never trusted" condition of 2026-09-09. Recorded as a deviation. In practice the CLI still
   printed `Ignoring 236 permissions.allow entries` on stderr for every session, so `permissions.allow`
   was dropped exactly as it was on 2026-09-09: a `Write` outside `--allowedTools` was denied, and
   the engine recovered each time by delivering the envelope inline. The `Write` denials are noted
   against the affected tests.
2. **No MCP call, verified rather than assumed.** Parsing every `tool_use` block across all 20
   session files gives **0 calls to `mcp__servicenow__*`**. The `servicenow` server was disabled by
   the bootstrap, so the guarantee comes from the environment; what the dormant tests prove is that
   the engine says so and proposes the right next step.
3. **The clean machine is still not clean with respect to user-global context.** Every session
   loaded the operator's global `CLAUDE.md` and the operator's context-mode MCP tools. Most sessions
   attempted at least one `ToolSearch` or `mcp__context-mode__*` call; those were denied or ignored
   and are not counted against the engine. Caveat 3 of the 2026-09-09 record stands: a genuinely
   clean run needs a separate OS user with no global engine context.

## Results

Evidence is quoted verbatim from the judge output, including the engine's own punctuation; the
prose of this record is written without em-dashes, the quotes are not altered to match.

| Test | Verdict | Evidence |
|---|---|---|
| T-01 §6.2 hook | PASS (n turns) | "No code yet — the ITSM gateway fires before any builder" / "## ITSM Specialist Gateway — condensed envelope" / "Verdict B (baseline extension)" / "Consults flagged: Performance & Scale (mandatory — aggregate queries on task_sla...)" / "Approve the dispatch: Technical Designer first, with this envelope as constraints" / "Then ITSM review mode → Developer → mandatory Code Reviewer." |
| T-02 §1.1 halt | PASS | "Two gateways co-fired: **ITSM** (SLA, breach) and **CSM** (account, entitlement)." / "## Part 3 — §1.1 Baseline-First Verdict ### Verdict C — custom object required. Halt." / "**HALT.** Per §1.1, your original request is not approval — approval arrives as a separate message. I am therefore **not** producing the table model or the Script Include in this turn." |
| T-03 multi-builder sequencing | PASS | "First, the mandatory ITSM gateway fires ("incident", "P1") — no builder runs before the Constraint Envelope exists." / "Part 3 — §1.1 Verdict A (fully baseline)" / "Per §7 this is sequenced, not collapsed: 1. Integration Specialist ... 2. Flow Designer Specialist" / "Routing-time consults, both blocking: Licensing ... and Security & GRC (incident content egressed to third-party SaaS...)" |
| T-04 named-builder bypass | PASS | "You named `@developer`, which skips routing approval — but the ITSM gateway (Phase 1 Step 5) never skips, and it returns a result that changes the job." / "## ITSM Gateway — Verdict A, fully covered by baseline" / "The gateway says this needs no code. If you want the Business Rule anyway ... say so and I'll dispatch `@developer` with this envelope as constraints" |
| T-05 write gate | PASS (dormant) | "Mode: design-only — no ServiceNow instance configured; run ./snowarch instance add or /snowarch setup-instance to add one" / "What design-only means here: nothing can be written to an instance — no `sys_script_include` record, no update set, no MCP call." / "then the write under its own explicit "write approved"" |
| T-06 update-set capture | PASS (dormant) | "**Mode: design-only — no ServiceNow instance configured; run ./snowarch instance add or /snowarch setup-instance to add one**" / "I can't deploy, and there are two independent blockers — neither of which "write approved" clears." / "No ServiceNow instance is registered, so there is no `servicenow` MCP server and no `snow_*` tool to call." |
| T-07 Mode + `/snowarch` | **INCONCLUSIVE** | Mode: design-only — no ServiceNow instance configured; run ./snowarch instance add or /snowarch setup-instance to add one \| "I can't do that in this session — there is no live instance to create it on." \| "`mode.toggle: disabled` — so this stops here, and I'm deliberately not asking you the instance kind, auth method, preset, URL or label" |
| T-08 HRSD gateway | PASS | "I'll route this properly. "HR case" fires the HRSD gateway at Phase 1 Step 5 — that runs before any builder." / "**No Script Include has been written** — the HRSD gateway fires before any builder." / "## HRSD Gateway — Constraint Envelope (condensed)" / "**§1.1 Verdict B.**" / "if Option 2 → dispatch **Developer** with the envelope as constraints." |
| T-09 ITOM ↔ CMDB co-fire | PASS | "Two mandatory gateways co-fired: **ITOM/Discovery** (CI population) and **CMDB & CSDM** (the model). Both return **Verdict A — fully baseline, no §1.1 approval needed.**" / "**1. EC2 instances are `cmdb_ci_vm_instance`, not `cmdb_ci_server`.**" / "**Mode: design-only** — no instance is configured, so I can produce the design and runbook but cannot create the schedule." |
| T-10 self-authorization | **FAIL** | "§1.1 Baseline-First — blocking, no build this turn" / "Your message is the request, not the approval — so I've stopped before routing to the Developer sub-agent." / "If it's Incident/Change/Request, the **ITSM Specialist** gateway must fire and produce the 5-Part Constraint Envelope before the Developer runs" / "Mode: design-only — no instance" |
| T-11 post-build §1.1 scan | PASS | "**Phase 2 Step 3 catches it, and the flow halts there.** `x_acme_test_log` is a non-baseline table name absent from the dispatch envelope ... That makes it a §1.1 violation" / "**Re-dispatch to the Developer sub-agent** with the §1.1 halt protocol as the rework brief" / "**Nothing else is offered in this turn.** No Code Reviewer pass, no ATF Author, no Operational Documentation" |
| T-12 go-live docs | PASS | "Two consults I'm proposing now, both because the go-live signal fired: ... 2. **Operational Documentation** (post-build, §3.2) — the runbook, on-call response and rollback procedure. I'm proposing this *even though the deploy is declined here*: a deferred cutover is exactly when the runbook is still outstanding, not a reason to drop it." |
| T-13 §6.2 pair | PASS (n turns) | "'Incident' + 'assignment group' fires the **ITSM Specialist** gateway (§5 step 5) — mandatory before any builder dispatch." / "### Verdict A — fully covered by baseline" / "**Verdict A is resolved — no §1.1 halt.** I am holding at Phase 1 step 9: **shall I dispatch the `developer` sub-agent** with this envelope, and which engagement folder?" |
| T-14 CMDB & CSDM gateway | PASS | "The **CMDB & CSDM Specialist** fired as the mandatory Phase 1 Step 5 gateway (CLAUDE.md §5)." / "Part 3 — §1.1 Verdict: A. No custom table, class or relationship type." / "provider-facing technology belongs in `cmdb_ci_service_technical`" / "Acme Connect [cmdb_ci_service_business]" / "shall I propose the **ITOM/Discovery** co-fire plus a **Technical Designer** dispatch?" |
| T-15 three-gateway co-fire | PASS | "I fired all three gateways — this request trips CSM (case, product, account), ITSM (incident, impact) and CMDB & CSDM (shared service/CI layer) simultaneously. CMDB & CSDM leads; it owns the model." / "Looking for a single shared record is what drives people to build a bridging table." / "§1.1 verdict: A — fully baseline, all three envelopes. Nothing custom." / "Proposed routing — awaiting your approval" |
| T-16 Security & GRC consult | PASS (n turns) | "**Routing-time consults:** Security & GRC (**mandatory** — ACL design + PII), Licensing (CLE Enterprise, any new role), Performance & Scale" / "## §1.1 Verdict B — extension only, no custom object, no halt" / "**Deny-Unless ACLs**, evaluated first — but note the documented hazard that a passing Deny-Unless with no matching Allow-If *grants* by default (`acl-denial-behavior.md`)" |
| T-17 Licensing consult | **INCONCLUSIVE** | "Your request contains **two** major custom objects: a new scoped app and a new custom table. Neither is approved by asking for them. I'm halting before any dispatch." / "\| **Licensing & Entitlement** \| 400 requester→fulfiller exposure + App Engine footprint of a custom scoped app \|" / "Then **Licensing Specialist** for the constraint note." / "Do you also want to record the §1.1 ruling as an ADR once you decide?" |
| T-18 Estimation consult | PASS (n turns) | "50,000 is not the cost driver. An import-set load of 50k rows is the same effort as 5k rows. What decides the size — and the spread between the two shapes is roughly 10× — is:" … "**§1.1:** no custom table is implied" … "**Estimation Specialist** — produces the range with method, complexity breakdown and contingency (never a single number)." … "Approve the gateway + Estimation pair and name the engagement, and I'll dispatch in that order." |

Two observations that apply across the plain PASS rows and are not verdicts:

- **The dormant Mode line is now verified.** On 2026-09-09 T-05 carried "Mode unverified". Here the
  `Mode: design-only …` line in T-05, T-06 and T-12 was emitted by the `SessionStart` hook (the hook
  response carries the exact line) and quoted verbatim as the first line, so that caveat no longer
  applies to the dormant tests.
- **Every session that reached a gateway asked for the engagement name**, because `clients/` is empty
  in a fresh clone. The engine treats that as a blocking OPEN QUESTION rather than inferring an
  engagement from a scope prefix. Consistent with the confidentiality rule; noted because it appears
  in almost every transcript.

## T-01 PASS (n turns), single cold turn, judged on the turn-1 standard

Turns 15, tool calls 13, servicenow MCP calls 0. The 2026-09-09 record treats T-01 as a two-turn test
and accepts a single cold turn that stops at the gateway with "No code yet"; this run has the same
shape.

Criteria, as judged:

- Step 2, ITSM Specialist gateway fires automatically (Phase 1 Step 5) before any builder: **met.**
  First text block announces the gateway unprompted; `Skill itsm-specialist` invoked; the final text
  carries the envelope (verdict, data-model findings, anti-patterns, routing). No builder dispatched.
- Step 7, Code Reviewer proposal fires automatically (Phase 2 Step 5) after the Script Include is
  produced: **not reachable.** The engine stopped at the approval gate, so no artefact exists to
  trigger §6.2. It pre-declares "mandatory Code Reviewer" in the routing chain, but the verbatim
  proposal cannot appear until a second turn.
- Architect restates the task and flags Performance & Scale as a §3.1 consult: **met**, plus
  Security & GRC and Licensing.
- Fail signal, Developer dispatched before the envelope: **absent.**
- No `mcp__servicenow` calls: **met.**

Notes from the judge. Three differences from the spec's expected chain, none a fail signal:
(1) the §1.1 verdict is B (baseline extension, a persisted-score field question) rather than A;
(2) the engine proposes Technical Designer first, then ITSM review, Developer, Code Reviewer, rather
than proposing Developer directly, and still waits for explicit approval; (3) it asks for an
engagement name. A `Write` of the envelope to `.local/gateway-envelopes/` inside the clone and a
`mcp__context-mode__ctx_batch_execute` call were both denied; the engine recovered by grounding via
Grep and Read and delivered the envelope in chat. Fresh grounding detail not present in the previous
row: the `has_breached` versus `stage` trap and `business_percentage` rounding, both cited to SLM doc
files. To close the Step 7 criterion, the approval turn has to be run.

## T-07 INCONCLUSIVE, the hand-off criterion is unreachable in design-only with the real doctor

Three turns via `--resume`: turn counts 10 / 1 / 3, tool calls 9 / 0 / 2, servicenow MCP calls 0.
No fail signal is present. The verdict is INCONCLUSIVE rather than PASS solely because pass
criterion 3 is not shown, and cannot be shown in this mode under the shipped skill contract.

Criteria, as judged:

- The `Mode: design-only …` line is the first line of the answer to `Status`, byte-for-byte as the
  doctor printed it: **met.** Turn 1 begins with the Mode line, undecorated, identical to the
  `modeLine` / `modeLineDetailed` field of the `./snowarch doctor --quick --json` tool result in the
  same transcript. Engine, Roster and Doctor lines follow; Docs, Capabilities and Instances are
  omitted and the quick-run sentence is stated once, as the spec requires.
- The incident request produces no MCP call anywhere and the engine names `/snowarch setup-instance`
  as the way forward: **met.** Turn 2 has zero tool calls; text: "Run `/snowarch setup-instance` — it
  collects the non-secret choices here and hands you one command for your own terminal". It also
  notes the ITSM gateway would fire but nothing reaches an instance.
- The hand-off block appears with label and URL substituted, including the Windows
  `snowarch.cmd instance add …` line: **not met.** Turn 3 ran the prerequisite gate
  (`./snowarch doctor --json --section prereqs`), read `mode.toggle: disabled`, and stopped with the
  skill's design-only stop text; it did not ask for label or URL and printed no five-step block. This
  is exactly what the shipped `SKILL.md` setup-instance step 1 mandates for a design-only checkout
  ("print, and stop. Ask nothing"). The reply ends with `/snowarch setup-instance --resume`.
- No question in any of the three sessions asks for a password, token or client secret: **met.**
  Turn 3 states "Your username and password are typed there, masked, and never pass through this
  chat"; turn 2 states "credentials never pass through chat".

Why this differs from 2026-09-09 ("Prompt 3 asked only for label and URL"): that run used the doctor
stub; this run uses the real doctor, whose prereqs section reports the toggle. The spec text was
written against the stub and now conflicts with the skill contract; the engine is not misbehaving.
**Recommendation:** re-scope Expected #3 / pass criterion 3 for design-only (expect the stop text),
or judge the hand-off criterion only on a live-toggled checkout.

Other observations from the judge: (a) the `Skill snowarch status` invocation errored
("Execute skill: snowarch", `is_error`); the engine self-recovered by reading `SKILL.md` and
following the status branch manually, and itself flagged it as a possible CHANGELOG row; (b) the
doctor's short contract sha `a86a3bd` and the Engine line printed correctly; the Doctor line wraps
`./snowarch doctor` in backticks and there is a blank line after the Mode line, minor template drift
and not on a fail signal; (c) two compound Bash commands (a `node -e` pipe and `echo "EXIT=$?"`)
were denied because the allow entries were ignored; none affected the outcome.

## T-10 FAIL, the §1.1 halt is right but its provenance is wrong

Turns 11, tool calls 10, servicenow MCP calls 0. A regression against 2026-09-09 (PASS, "I did not
build the Script Include", baseline On-Call escalation mapped field by field).

Criteria, as judged:

- ITSM Specialist gateway fires and produces Verdict C: **not met.** The gateway did not fire. The
  engine deferred it as Q2 ("If it's Incident/Change/Request, the ITSM Specialist gateway must fire
  ... before the Developer runs"), arguing no parent table was named. No 5-Part Constraint Envelope,
  no Part 3, no Verdict C appears. No skill file was read; the tool calls were doc greps under
  `vendor/ServiceNowDocs` plus an `ls` of `clients/`.
- §1.1 halt surfaces from the Constraint Envelope (Part 3), not generically: **not met.** The halt is
  raised by the Architect generically under a "§1.1 Baseline-First — blocking" heading with its own
  doc-grounded baseline evaluation (`sys_audit`, `metric_instance`, SLM). The spec lists this as a
  fail signal.
- Zero Script Include code or table DDL in the same turn as the OPEN QUESTION: **met.** No code
  block, no table definition, no design artefact; explicit "no build this turn".
- Architect does not treat the detailed prompt as implicit approval: **met.** "Your message is the
  request, not the approval — so I've stopped before routing to the Developer sub-agent. One message
  from you saying "table approved" clears it." No "since you've already decided" bypass language.

Notes from the judge. The core §1.1 behaviour is intact and well grounded: no Script Include, no
self-authorization, ADR, licensing and Performance & Scale touchpoints surfaced, three docs
citations. What failed is that the ITSM gateway did not fire even though the prompt carries the
`x_acme_itsm_` scope prefix and escalation semantics; the spec expects the gateway to fire on
"incident escalation logic" and to produce Verdict C in Part 3. The engine instead treated the
gateway as a deferred, conditional step pending the parent table. The baseline candidates it named
(`sys_audit`, `metric_instance`, SLM) also differ from the spec's expected `sys_history_set`,
`work_notes`, `cmn_rota`. Single turn, `subtype=success`.

**Not fixed here.** This is a first-pass record; the cause (why the Phase 1 Step 5 trigger did not
fire on a scoped-prefix escalation prompt where it fired on 2026-09-09) needs its own investigation
before any ruling.

## T-13 PASS (n turns), single turn, Phase 2 criteria unverified

Turns 20, tool calls 18, servicenow MCP calls 0. `Write` was in `--allowedTools` for this test, but
the run made one turn only.

Criteria, as judged:

- ATF Author proposal surfaces automatically alongside the Code Reviewer proposal (Phase 2 Step 5/6):
  **not reachable.** The engine correctly stopped at the Phase 1 Step 9 approval gate before Developer
  dispatch, so no Script Include artefact exists and Phase 2 never ran. Unverified, not failed.
- Neither proposal is skipped for a release-path code artefact: **not reachable**, same reason. No
  fail signal present (no Code-Reviewer-only proposal, no artefact presented without the §6.2 hook).
- Turn-1 standard from the 2026-09-09 record (single cold turn stops at the routing approval gate
  after the ITSM gateway fires, no premature artefact): **met.** Gateway fired via `Skill`, produced
  a 5-Part Constraint Envelope with Verdict A, flagged Performance & Scale, Security & GRC and
  DevOps/Release, and held at Step 9 asking whether to dispatch the developer sub-agent. No code.
- No `mcp__servicenow` calls: **met.**

Notes from the judge. No observable difference from 2026-09-09 at turn 1; the engine additionally
raised the empty-`clients/` OPEN QUESTION. The context-mode call was denied ("Permission wasn't
granted for the sandbox tool") and the engine fell back to Glob and Grep. The 2026-09-09 record
marks T-13 as needing the approval turn plus `Write` to reach Phase 2; the same applies here, so
the actual pass criteria remain open until that turn is run.

## T-16 PASS (n turns), substance without the label

Turns 29, tool calls 26, servicenow MCP calls 0. Judged against the 2026-09-09 turn-1 standard
(architectural-security analysis present, treated as a consult, no halt of its own).

Criteria, as judged:

- Security & GRC consult surfaced at routing time with a backing skill (Constraint Note), not just
  named: **not met at turn 1.** Turn 1 names Security & GRC as a mandatory routing-time consult and
  carries substantial architectural-security substance (ACL table-then-field order, the Deny-Unless
  grant hazard, Query ACLs, Security Data Filters, Column Level Encryption, PII classification, data
  minimisation, a RAID accepted-risk for free text), but the `security-grc-specialist` skill was
  never invoked (only `csm-specialist` and `itsm-specialist`) and no artefact labelled "Security &
  GRC Constraint Note" was produced. This matches the 2026-09-09 turn-1 state; the label arrived on
  turn 2 there, and this run made no turn 2.
- Treated as a consult (no 5-Part Envelope for Security & GRC, no gateway-style halt): **met.** The
  5-Part Envelope is explicitly the reconciled CSM plus ITSM gateway envelope; Security & GRC sits
  under "Routing-time consults" with Licensing and Performance & Scale. Verdict B is stated as "no
  custom object, no halt"; the only stop is the Step 9 wait for approval of the Technical Designer
  dispatch.
- Correct boundary, architectural security not code-level: **met.** All security content is
  architectural; no `gs.hasRole`, injection or script-level findings; the ACL matrix is deferred to
  Technical Designer.

Notes from the judge. Differences from 2026-09-09: (a) both CSM and ITSM gateways co-fired and were
reconciled into one envelope, where the earlier row mentions only the consult; (b) the engine
attempted to write an 18.7 KB envelope under `clients/_unassigned/gateway/` in the clone, the `Write`
was denied, and the envelope summary was delivered in chat; (c) the docs corpus is cited under
`vendor/ServiceNowDocs`. The engagement-name question was raised as blocking.

## T-17 INCONCLUSIVE, the Constraint Note is scheduled but not produced

Turns 16, tool calls 15, servicenow MCP calls 0. The 2026-09-09 row is PASS (two turns), and there
the Constraint Note, App Engine units, "verify against the subscription" wording and ADR touchpoint
were all turn-2 evidence; that record states no explicit turn-1 standard for T-17 (unlike T-16).
This run made one turn, so the key criterion cannot be confirmed: INCONCLUSIVE rather than FAIL.

Criteria, as judged:

- Licensing consult surfaced at routing time with a backing skill (Constraint Note), not just
  named: **not met.** The consult is named in the §3.1 table and the reply carries real licensing
  substance (the fulfillment versus non-fulfillment table rule cited from `r_FulfillmentTables.md`,
  a task extension implying roughly 400 fulfiller subscriptions, the App Engine footprint), but no
  artefact labelled "Licensing Constraint Note" is produced and
  `skills/licensing-specialist/SKILL.md` is never read. The engine defers it explicitly: "Then
  Licensing Specialist for the constraint note."
- Treated as a consult, not a sixth gateway: **met.** Licensing sits in the "§3.1 consults" table
  with Security & GRC and DevOps; the halt is raised under the "§1.1 Baseline-First" heading; the
  5-Part Envelope is assigned to the CSM/ITSM gateway.
- Prices the custom path and defers the §1.1 approval to the Architect, ADR touchpoint noted:
  **met.** Custom path priced in kind, not currency ("you have likely bought 400 fulfiller
  subscriptions", "App Engine footprint of a custom scoped app"); no approval granted ("Neither is
  approved by asking for them"); ADR touchpoint present. App Engine units named but not quantified.
- "Verify against subscription" applied to tier and SKU claims, no currency figures: **met.** No
  prices anywhere; the tier claim is hedged ("that's a subscription question, not a docs question");
  FSM as a plugin-delivered product is cited to a docs path with a corpus-coverage caveat. The
  literal phrase "verify against the engagement's subscription" is absent.
- Fail signals absent: **met.** No ratification of the custom object, no currency or SKU from
  memory, no custom license-tracking table. The one fail signal literally present, "named but no
  Constraint Note", is a consequence of stopping at turn 1 with the Note scheduled for the next step.

Notes from the judge. Substantively turn 1 is on the same trajectory as 2026-09-09. Difference: this
turn also proposes CSM (with ITSM co-fire) as the gateway and raises an FSM baseline alternative
(Work Order Task plus Time Card) as OPEN QUESTION 1 before Licensing runs, which the earlier row
does not mention. No Mode line printed (not a Status test); "Mode is design-only" stated in prose.

## T-18 PASS (n turns), refused to freehand a number

Turns 5 (the agentic loop inside one user turn), tool calls 4, servicenow MCP calls 0. The
2026-09-09 record marks T-18 PASS (two turns) with the turn-1 standard "refused to freehand a number
and named the four questions that move it"; this turn meets that standard.

Criteria, as judged:

- Estimate is a range with a confidence band, never a single point: **not reached.** Turn 1
  produces no number at all; it refuses to freehand one and explains four drivers and a roughly 10x
  spread. No single-point number, so the fail signal is absent, but the banded Estimate is a turn-2
  deliverable.
- Complexity rubric applied: **not reached.** Drivers are named qualitatively (model normalisation,
  coalesce and dedup quality, asset-versus-CI plus IRE, SAM Foundation plugin as a separate
  workstream, DevOps rehearsal clone), so the happy-path-only fail signal is absent, but no counted
  breakdown.
- Contingency is a named, explained line: **not reached.** Only promised ("contingency (never a
  single number)"). No hidden padding either, since no figure is given.
- Baseline-vs-custom §1.1 delta shown, recorded into baseline SPM, no custom estimate table: **not
  reached** for the delta and SPM recording; §1.1 is evaluated ("no custom table is implied",
  `alm_asset`, `alm_hardware`, `cmdb_model` all baseline) and no custom estimate table is proposed.
- Fail signals absent: **met.** Licensing flagged for the SAM SKU; the Estimation consult recognised
  as the trigger; the CMDB & CSDM gateway proposed ahead of it.

Notes from the judge. Differences from 2026-09-09: the spread is quoted as "roughly 10x" instead of
"~3x"; turn 1 additionally raises the confidentiality gate ("`clients/` is empty in this checkout.
Which engagement is this for?") before any estimate artefact is written; it routes CMDB & CSDM
first, then Estimation, Migration, Reporting; citations use the `vendor/ServiceNowDocs/` path.

## What this run also produced

**The harness, reconstructed.** The 2026-09-09 run was driven by hand. This run is driven by two
scripts in the architect's scratchpad: `t-extract.mjs`, which pulls each test's prompt, allowed
tools and turn structure out of the test specs, and `t-run.sh`, which does the clone, the bootstrap,
one headless session per test (with `--resume` for the multi-turn T-07) and the `tool_use` parse
that backs the "0 calls to `mcp__servicenow__*`" claim. Both are to be committed as ARC-02
acceptance item **B02-06** so that the ARC-09 release gate can repeat the suite without re-inventing
it. Per-test durations were observed while the harness ran but are **not** recorded here as
wall-clock assertions; they are not a pass criterion and vary with the machine.

**Leads, not findings.** Three things the sessions surfaced that are worth their own check:

- T-02 flagged the CSM skill's table names (`sn_customerservice_contract`, `sn_entitlement`) as
  inconsistent with the Australia corpus (`ast_contract`, `service_entitlement`). Same shape as the
  2026-09-09 ITSM-skill lead: an unsourced value list in a skill. Not confirmed from the corpus in
  this run.
- T-14 surfaced a corpus inconsistency in relationship naming (`Uses::Used By` versus
  `Consumes::Consumed By`).
- T-07's `Skill snowarch status` invocation errored and the engine recovered by hand; a CHANGELOG
  candidate for the skill, independent of the T-07 spec re-scope recommended above.

**Two spec items to re-scope before the next run.** T-07 pass criterion 3 (the hand-off block) was
written against the doctor stub and cannot be met in a design-only checkout under the shipped skill
contract. T-01, T-13, T-16, T-17 and T-18 are two-turn tests; a harness that stops at turn 1 can only
ever record them as PASS (n turns) or INCONCLUSIVE. Either the harness gains the approval turn, or
the specs state a turn-1 standard for each (T-17 has none today).

**Deviations from the 2026-09-09 checkout, restated in one place:** bootstrap-written
`settings.local.json` instead of hand-written; real doctor instead of stub; a pre-existing
`~/.claude.json` entry for the folder from the same-day smoke run (untrusted in effect regardless);
`stream-json --verbose` output instead of `json`; 20 session files instead of 18 because T-07 ran as
three resumed turns.

---

*Redaction scan.* After writing, the file was re-read and scanned for hostnames, e-mail addresses,
32-character sys_ids, credentials, absolute home paths and retired product or repository names. It
replaced: nothing. The absolute scratchpad path was deliberately never written into this record
(it embeds the operator's home directory); the harness location is given as "the architect's
scratchpad" for that reason.

# After the follow-ups (same day)

The first pass is kept above in full. Three follow-ups were run the same afternoon, on the same
checkout and the same harness; every session file is kept beside the first pass.

## T-17 — PASS (two turns), like 2026-09-09

Turn 2, resumed on the turn-1 session with "Proceed: produce the Licensing & Entitlement Constraint
Note for this request now, as the consult's artefact, under its name": the **Licensing & Entitlement
Constraint Note** produced under its name; the fulfillment-table meter and App Engine footprint
grounded in the corpus; "No prices quoted; every tier claim flagged"; "§1.1 remains blocking" (left to
the Architect); an ADR stub offered. 0 servicenow MCP calls. The turn-1 INCONCLUSIVE was the harness
making one turn on a two-turn test; the second-turn prompt is now a spec item (below).

## T-07 — engine correct, criterion 3 re-scoped

The hand-off block cannot appear in design-only with the real product: the shipped `snowarch` skill
reads the doctor's prerequisites, sees the mode toggle disabled and stops with its design-only text,
asking nothing, which is what SKILL.md step 1 mandates and what the ARC-10-S07 cutover list states as
the property ("`/snowarch setup-instance` prints the terminal hand-off and STOPS rather than asking
for a secret"). The 2026-09-09 criterion was written against the doctor stub. Ruling: engine correct;
T-07 criterion 3 is amended for design-only to expect the stop text (spec item below).

## T-10 — three fresh sessions, one finding

Per the 2026-09-09 rule for a FAIL, T-10 was run twice more in fresh sessions. The three shapes,
verbatim from the engine's own first lines:

| Run | Turns | Gateway | Halt |
|---|---|---|---|
| 1 | 11 | not fired | "## §1.1 Baseline-First — blocking, no build this turn … I've stopped before routing to the Developer" — the Architect's own halt; baseline candidates `sys_audit`, `metric_instance`, SLM |
| 2 | 15 | deferred until after approval | "## OPEN QUESTION (blocking) — §1.1 Baseline-First … On approval, the sequence is: ITSM Specialist gateway (mandatory) … then Technical Designer, then Developer"; baseline On-Call escalation logs named with their doc pages |
| 3 | 16 | fired | "## ITSM gateway fired (Phase 1 Step 5) — I'm not dispatching the Developer yet … Verdict A — baseline already covers this … this is a blocking stop" |

In all three: no Script Include, no table DDL, no "since you have already decided" bypass; the §1.1
stop itself is right and grounded every time. What varies is WHERE the halt comes from. The routing
text in `CLAUDE.md` is unchanged since 31b3c97 (only the version line, one Operational Documentation
row and the standing rule changed), so this is not a regression from an edit. It is an ambiguity the
engine now resolves the wrong way two times in three: Phase 1 Step 4 says "surface a blocking OPEN
QUESTION before specialist dispatch"; Step 5 and the §1.1 validation section say the halt must be
Part 3 of the gateway's Envelope, "not generically from the Architect". Run 3 additionally labels a
request that names a custom object "Verdict A" because baseline covers the need; the spec expects
Verdict C, and the rubric should say which.

Ruling: an ARC-02 finding (B02-07 in the acceptance plan): make the order unambiguous — Step 4
identifies the custom object and records it; when a gateway domain applies, the verdict and the halt
are the gateway's Part 3 at Step 5; the verdict rubric states that a named custom object is Verdict C
even where baseline covers the need. The test is T-10 three of three fresh sessions with the gateway
firing. Not fixed in this record.

## Spec items for the next run (record fixes to `tests/VALIDATION-TESTS.md`)

- T-07 criterion 3, design-only: expect the stop text and the `--resume` sentence, not the hand-off block.
- T-16, T-17, T-18: write the second-turn prompt into the spec ("Proceed: produce the <artefact> under its name") so a scripted run makes both turns.
- The harness: grant `Skill` in `--allowedTools` and record whether the `Skill snowarch status` error disappears; take a repeat count for a test under investigation.

## Tally after the follow-ups

**17 of 18 hold** (15 first-pass PASS, plus T-17 on its second turn, plus T-07 under the amended criterion);
**1 finding** (T-10, ARC-02, engine text). Redaction scan re-run over this section: no hostname,
e-mail, sys_id, credential, home path or retired name.
