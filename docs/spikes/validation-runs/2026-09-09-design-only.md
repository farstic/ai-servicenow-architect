# T-01 … T-18 in design-only — the full suite, once

**Run** 2026-09-09 · **CLI** 2.1.258 (Claude Code) · macOS 15 (Darwin 25.5.0) · **commit** `31b3c97`
**Engine** 2.0.0-dev · **Docs corpus** `vendor/ServiceNowDocs`, release family `australia`

**16 PASS · 2 FAIL.** Both failures are real and neither is fixable inside this story's scope; each
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
