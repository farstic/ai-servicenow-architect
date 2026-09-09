# T-01 … T-18 in design-only — the full suite, once

**Run** 2026-09-09 · **CLI** 2.1.258 (Claude Code) · macOS 15 (Darwin 25.5.0) · **commit** `31b3c97`
**Engine** 2.0.0-dev · **Docs corpus** `vendor/ServiceNowDocs`, release family `australia`

## 18 of 18 PASS

**Final tally after the rulings of 2026-09-09.** The first run of the suite was **16 PASS · 2 FAIL**;
both failures were real, both root causes were fixed under those rulings, and both tests were re-run
twice each. That first tally and its analysis are kept below in full — a record that quietly became
green would be worth nothing.

| | First run | After the rulings |
|---|---|---|
| T-01 … T-11, T-13 … T-18 | 16 PASS | unchanged |
| T-02 §1.1 halt | FAIL — the test's example rested on an error in the CSM skill | **PASS ×2** |
| T-12 go-live docs | FAIL — the proposal did not survive a refused deployment | **PASS ×2** |
| T-13 (neighbour row, re-run as the gate) | PASS | **PASS**, re-verified post-ruling |

The "After the rulings" section at the end carries the evidence.

---

**16 PASS · 2 FAIL** *(the first run — superseded by the tally above, kept as the record of what was
found).* Both failures are real and neither was fixable inside this story's original scope; each
carries its root cause and a recommendation below.

## The checkout

A fresh `git clone --depth 1` into an empty directory, on a folder the CLI has never trusted — no
`~/.claude.json` entry for it, confirmed before the run. `vendor/ServiceNowDocs` copied in;
`.claude/settings.local.json` written by hand as `{"disabledMcpjsonServers":["servicenow"]}`, since
ARC-06's bootstrap does not exist yet; the S11 doctor stub copied to the root as `./snowarch` with
`SNOWARCH_STUB_MODE=design-only`.

**One fresh headless session per test** (`claude -p --output-format json`), 18 sessions in all.

Three things about this environment shape every verdict below, and all three are properties of the
harness rather than of the engine:

1. **An untrusted folder ignores `permissions.allow`** — the CLI says so on stderr, naming the 236
   entries it dropped. Tools that need a grant are therefore denied unless granted per-run. Where a
   test needed one, `--allowedTools` was passed and it is recorded against that test. Trusting the
   folder would mean editing `~/.claude.json`, which is out of bounds.
2. **No MCP server is reachable at all.** Verified from the session transcripts rather than assumed:
   parsing every `tool_use` block across all 18 sessions gives **0 calls to `mcp__servicenow__*`**
   (22 raw string hits, all prose). So "no MCP call" is guaranteed by the environment, and what the
   dormant tests actually prove is that the engine **says so and proposes the right next step**
   instead of inventing an answer — which is the part worth proving.
3. **The clean machine is not clean with respect to user-global context.** A session in a fresh
   clone still loads the operator's global `CLAUDE.md`. One run quoted a real instance hostname from
   it; that is redacted here. A genuinely clean run needs a separate OS user, which is worth doing
   once ARC-09's release gate repeats this suite.

## Results

| Test | Verdict | Evidence |
|---|---|---|
| T-01 §6.2 hook | **PASS** | Not re-run — recorded at S11 as a two-turn run, `T-01-post-build-hook.md`. The single cold turn here stops at the gateway with "No code yet", which is the approval gate behaving. |
| T-02 §1.1 halt | **FAIL** | See below — the test's expectation rests on an error in the CSM skill. |
| T-03 multi-builder sequencing | PASS | Integration Specialist → Flow Designer named as a sequence, ITSM gateway first, no builder dispatched. |
| T-04 named-builder bypass | PASS | *"I did not dispatch `@developer`. Naming a sub-agent waives routing approval, but never the Domain Expert gateway."* |
| T-05 write gate | PASS (dormant) | *"I have not made the write."* Mode unverified, §2.1 named, no MCP call. |
| T-06 update-set capture | PASS (dormant) | Three blockers named, the first being that no artefact exists in the session; §2.1's approval shape quoted; no MCP call. |
| T-07 Mode + `/snowarch` | PASS | Prompt 1 returned `Mode: design-only — no ServiceNow instance configured; run ./snowarch instance add or /snowarch setup-instance` as the first line, undecorated. Prompt 2 refused the incident and proposed `/snowarch setup-instance`. Prompt 3 asked only for label and URL. Doctor granted via `--allowedTools`. |
| T-08 HRSD gateway | PASS | Five-part envelope, baseline HR case assignment engine, no custom object. |
| T-09 ITOM ↔ CMDB co-fire | PASS | Both gateways, both Verdict A, and a correction the test did not ask for: an IP-range Discovery schedule will not enumerate EC2 — cloud discovery does. |
| T-10 self-authorization | PASS | *"I did not build the Script Include."* Baseline On-Call escalation mapped field by field against the requested custom table. |
| T-11 post-build §1.1 scan | PASS | `x_acme_test_log` caught at Phase 2 Step 3, rework dispatch proposed, and *"Nothing else is offered in this turn. No Code Reviewer pass, no ATF Author"* — the consults named only to be withheld. |
| T-12 go-live docs | **FAIL** | See below — two independent samples, both missed. |
| T-13 §6.2 pair | PASS (two turns, `Write` granted) | See below. |
| T-14 CMDB & CSDM gateway | PASS | CSDM placement and IRE design produced; class selection reasoned, not asserted. |
| T-15 three-gateway co-fire | PASS | CSM · ITSM · CMDB & CSDM co-fired into one **reconciled** envelope; the shared object identified as the Service Offering under a Business Service. |
| T-16 Security & GRC consult | PASS (two turns) | Turn 1 produced the architectural-security analysis — parent-table ACL match order, query ACL defaults, dot-walk propagation — and treated it as a consult with no halt of its own. Turn 2 produced it under its artefact name, **Constraint Note**. Noted: turn 1 had the substance without the label. |
| T-17 Licensing consult | PASS (two turns) | **Licensing & Entitlement Constraint Note**, App Engine units for the custom path, "verify against the subscription" on every tier claim, ADR touchpoint, no currency figures, and the §1.1 halt left to the Architect rather than claimed by the consult. |
| T-18 Estimation consult | PASS (two turns) | Turn 1 refused to freehand a number and named the four questions that move it ~3×. Turn 2: two banded paths in person-days, a per-driver breakdown (profiling/cleansing, model normalisation, transform maps, asset↔CI/IRE), **a named 30% contingency with the single reason it exists**, the §1.1 custom delta as its own line, and no currency. |

## T-13 — passes, but only on two turns with `Write` granted

Its criteria are Phase 2 behaviour, and a single cold turn cannot reach Phase 2: it stops at the
routing approval gate. Worse, in the untrusted clone `Write` is denied, so even after approval the
Developer's artefact never lands and Phase 2 is held — the session said so plainly rather than
pretending otherwise (*"Phase 2 status: held, not run"*). With the approval turn given and `Write`
granted the same way the doctor was:

> *Code artefact produced. Proposing a Code Reviewer pass (style, performance, security,
> best-practice) before final delivery — proceed?*

presented together with the ATF Author proposal, plus three more the test does not require
(Performance & Scale, Security & GRC, DevOps / Release Manager). **PASS.**

## T-02 — FAIL, and the root cause is a factual error in the CSM skill

The test expects **Verdict C** and a §1.1 halt on the ground that no baseline construct covers a
structured case-escalation audit trail. The gateway returned **Verdict A**, refused to write the
Script Include (*"on Verdict A any custom object is a §1.1 violation"*), and showed a **baseline**
table model — which trips the fail signal "table model produced in the same turn" while being the
correct answer.

It is correct because the premise has been wrong for some time.
`.claude/skills/csm-specialist/SKILL.md` states in three places (lines 76, 241, 252) that
`sn_customerservice_escalation` is "Vancouver+, NOT in the Australia release family". **Ten
Australia-release corpus files name that table**, including
`markdown/customer-service-management/case-escalation-components.md` (`release: australia`,
`last_updated: 2026-03-12`), whose Tables section lists all three escalation tables by name. The
session found this and flagged the skill; the skill is what is wrong.

*A note for anyone re-checking this:* the corpus escapes the underscores, so a plain
`grep sn_customerservice_escalation` over `vendor/` returns **nothing**. Searching the escaped form
finds all ten. That escaping is why the error survived this long, and it cost one wrong conclusion
during this very run before the second search corrected it.

**Not fixed here.** The CSM skill and the two gate tests are outside this story's scope by explicit
instruction. **Recommendation:** correct the skill's three lines, and rewrite T-02 around a request
that baseline genuinely does not cover — the test is worth keeping, its example is not.

## T-12 — FAIL, consistently

On the go-live signal the **Operational Documentation proposal did not fire**. Two independent
samples, one on each of two prior sessions that had a real Script Include in context: neither
proposed a runbook or a KBA, and neither mentioned the consult except in a list of things that had
not run.

The trigger text is intact — `CLAUDE.md:108`, *"Operational Documentation | a go-live signal —
sign-off, release, cutover, deploy"* — so the S08 rewrite is not the cause. What happens instead is
that the request must be **refused**: there is no instance, and sign-off is not the engine's to give.
The refusal is right, and it consumes the turn.

**Recommendation:** a refusal is exactly when the runbook is still outstanding, so that table row
needs a clause saying the proposal fires even when the deployment itself is refused. `CLAUDE.md` is
out of scope here, so this is raised rather than applied.

## What this run also produced

Two tests had no runnable prompt at all — T-06 and T-13 described their scenario in `### Setup` and
left the tester to invent the wording, which is not a repeatable test. Both now carry a `### Prompt`.

Criterion 6 — the Windows subset — is deferred to the owner's sitting, recorded in
`docs/spikes/OWNER-SITTING.md`.

---

# After the rulings

Both rulings landed on 2026-09-09 and lifted the fence for exactly the edits they named. The gate
re-run is below: T-02 ×2 on its new example, T-12 ×2 each on a real build, T-13 ×1 as the neighbour
row. Same clone, same CLI 2.1.258, `SNOWARCH_STUB_MODE=design-only`.

## Ruling 1 — T-02

**The skill.** `.claude/skills/csm-specialist/SKILL.md` carried the "Vancouver+, NOT in Australia"
claim in **five** places (76, 241, 252, 298, 324) and a sixth stale mention at 264. All six now state
the fact, cited to `markdown/customer-service-management/case-escalation-components.md`; the "for
Australia use `case.priority` + `case.assignment_group` + on-call" workaround is deleted rather than
softened; line 298's open point becomes whether the escalation **feature is activated** (the tables
are baseline; an inactive feature means no records and no modules), and line 324's anti-pattern is
inverted to name the claim itself as the error. `docs verify` → **checked 177, dead 0**.

The escaped-underscore rule went into the skill's citation-discipline section as its own paragraph,
not a footnote: a search that could not have found the tables was the only evidence behind the claim.

**The new example, verified before it was written.** Greps over
`vendor/ServiceNowDocs/markdown/customer-service-management`, escaped and unescaped:

| Term | Files |
|---|---|
| `service credit` | **0** |
| `credit ledger` | **0** |
| `credit memo` | **0** |
| `credit` | 31 — all credit *cards* (decision trees, document intelligence) |
| any `*credit*` table name | **none** |
| `penalt*` anywhere in CSM | **none** |

Corpus-wide, "service credit" appears in exactly one file, an unrelated federal-HR page. The nearest
baseline money-against-an-account constructs are `sn_otc_invoice` and `sn_otc_invoice_line` — close
enough to be worth rejecting explicitly, which is what makes the example better than a strawman. The
first candidate held; the callback-log fallback was not needed.

**Re-run, two fresh sessions.**

*Run 1* — **PASS.** Verdict C from both gateways (CSM primary, ITSM for the SLA side), under the
heading *"I can't give you the table model and Script Include yet — §1.1 halt"*, with a table of
baseline options each rejected for a stated reason: `task_sla` (per-task, SLA-engine-managed, no
approver, reason or balance), `sn_entitlement` (declares what is owed prospectively, not an accrual),
`sn_customerservice_contract` / `ast_service` (one row per contract, not per accrual event),
`sys_audit` / `sys_history_set` (*"records that a field changed; a ledger records an obligation"*),
`fm_expense_line` (wrong domain). It ran the corpus grep itself and reached the same result. No table
model, no Script Include, blocking questions instead.

*Run 2* — **PASS.** Verdict C, halt, an explicit OPEN QUESTION block, `sn_otc_invoice` among the
constructs evaluated and rejected. No design artefact.

Both satisfy all three pass criteria and trip none of the four fail signals.

## Ruling 2 — T-12

`CLAUDE.md` §8's Operational Documentation row now reads *"…proposed even when the deployment itself
is declined or deferred (design-only, no approval): a refusal is exactly when the runbook is still
outstanding"*. The file stays **125 lines / 11,216 bytes** and `tests/claude-md.test.mjs` is green
with no change to the test. T-12's Expected behaviour gains the design-only clause with its
provenance.

**Re-run, two chains, each on a real artefact** (T-13's prompt → approval turn → go-live signal):

*Run 1* — **PASS.** *"### Firing now: Operational Documentation — A go-live signal fires this consult
even when the deployment is declined — a refusal is precisely when the runbook is still outstanding."*

*Run 2* — **PASS.** *"§3.2 fires here regardless of the refusal: no runbook, rollback procedure or
operator documentation exists."*

Noted, not a failure: neither run used the word "KBA". The pass criteria ask that the consult fire
and not be skipped, and both did; the Expected behaviour's "runbook + KBA" is the consult's own
scope, which the Operational Documentation skill sets once it runs.

## T-13 — re-verified post-ruling

Two turns, `Write` granted, design-only: the verbatim §6.2 sentence and the ATF Author proposal, in
one presentation. Unchanged by either ruling, which is the point of re-running it.

## Two things this gate produced that are not verdicts

**A lead, not a finding.** T-02 run 1 asserted that `.claude/skills/itsm-specialist/SKILL.md` is wrong
about breach setting `task_sla.stage = 'breached'` (skill lines 249–252). **I could not confirm or
refute it from the corpus** — the pages that name `task\_sla` do not give the stage vocabulary. It is
recorded here as worth its own check, not as a defect. Given how the escalation claim survived, a
skill's unsourced value list is exactly the shape worth checking.

**An ARC-09 gate fact.** A clean run needs a **separate OS user**, not just a fresh clone: a session
in an untrusted clone still loads the operator's global `CLAUDE.md`, and one first-run session quoted
a real instance hostname from it (redacted here). Whoever repeats this suite at ARC-09's release gate
should run it as a user with no global engine context.
