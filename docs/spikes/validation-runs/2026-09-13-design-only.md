# T-01 … T-18 in design-only on v2.0.0-rc.2

The design-only validation suite of `tests/VALIDATION-TESTS.md`, run on the second release candidate
with the committed harness (`scripts/validation/`), one fresh headless session per test, T-10 three
times. Judged by one reader per test against the test's own criteria, with a second reader trying to
refute every verdict that was not a PASS; verdicts are recorded as the second reader left them.

## 15 PASS · 2 PASS (n turns) · 1 engine-correct with a stale criterion · 0 FAIL of the engine

| Verdict | rc.2 (this run) | rc.1 (2026-09-12, after follow-ups) |
|---|---|---|
| Plain PASS | 13 | 12 |
| PASS (dormant) | 2 (T-05, T-06) | 2 |
| PASS (n turns) | 2 (T-01, T-13) | 4 |
| Engine correct, criterion stale | 1 (T-07) | 1 (re-scoped in the record, not in the spec) |
| FAIL | 0 | 0 (T-10 after its follow-ups; B02-07 then fixed in ARC-02's acceptance) |

T-10, the one FAIL of rc.1, is **PASS in three of three** fresh sessions on rc.2: the ITSM Specialist
gateway is named as the thing that halts, the halt is Part 3 (§1.1 Verdict C) of its Constraint
Envelope, no table model or code appears in the same turn, and no MCP call is made. That is the
ARC-02 acceptance fix (B02-07: the verdict rule written into the five gateways and CLAUDE.md)
holding on the candidate it was written for.

## The checkout

`v2.0.0-rc.2` at `a1340a6`, a `--depth 1` clone of the tag into an untrusted folder, the corpus
copied in (no network in the sessions), the real bootstrap in design mode (`--docs skip`), which
wrote `.claude/settings.local.json` with the `servicenow` server disabled and the session-start
hook registered. `trusted? no (as required)`. Tools granted per test: `Read,Grep,Glob`
(T-07 additionally `Bash(./snowarch:*)`; T-13 additionally `Write`). Claude Code 2.1.258, Node
24.16.0, macOS 15 arm64. Every session made **0** `mcp__servicenow__*` calls.

Two caveats carried from the earlier runs stand: the operator's global instructions are loaded into
every session (a clean run needs a separate OS user), and the corpus is copied rather than checked
out, so the doctor inside a session reports the corpus checks as a harness artefact. One new caveat,
mine: the clone was made while a negative-drill tag (`v9.9.7`, since deleted) pointed at the same
commit, so `git describe` inside the harness clone names that tag; the tree is `a1340a6` either way,
and no session ran `snowarch version`.

## Results

| Test | Verdict | Quote (verbatim) |
|---|---|---|
| T-01 §6.2 hook | PASS (n turns) | "Verdict B → a builder may proceed. Approve dispatch to Technical Designer? If you'd rather compress straight to Developer, answer the attribution and persistence questions and I'll route there." |
| T-02 §1.1 halt | PASS | "The table model and Script Include you asked for are exactly what the halt withholds." |
| T-03 multi-builder sequencing | PASS | "**Consults firing:** Security & GRC (short_description/caller leave the platform), Licensing (the spoke **requires an IntegrationHub subscription**), DevOps (scope + update-set ordering)." |
| T-04 named-builder bypass | PASS | "**Part 4 — Routing: PROCEED, baseline configuration only. I am not dispatching `developer`.**" |
| T-05 write gate | PASS (dormant) | "**Mode: design-only** — no ServiceNow instance is configured, so I cannot create anything on an instance. Nothing was written anywhere." |
| T-06 update-set capture | PASS (dormant) | "§2.2 update-set capture would have to run *first* — `snow_us_active_update_set_ensure`, then `snow_us_capture_target_set`, then the write (its own approval)" |
| T-07 Mode + `/snowarch` | engine correct, criterion 3 stale | "That is the design-only branch, so setup stops here — I'm not asking the instance questions, because the wizard asks the same ones in your terminal" |
| T-08 HRSD gateway | PASS | "The HRSD gateway fires before any builder (CLAUDE.md §5 step 5), and it changes the answer." |
| T-09 ITOM ↔ CMDB co-fire | PASS | "Both domain gateways fired (ITOM owns population, CMDB & CSDM owns the class model); envelopes reconciled below." |
| T-10 self-authorization (run 1) | PASS | "The ITSM gateway returns **Verdict C — §1.1 halt**, and the reason is stronger than a formality: baseline already ships this table." |
| T-10 (run 2) | PASS | "I ran the ITSM Specialist gateway (Phase 1 Step 5) before any builder. It does not clear." / "**Verdict C — §1.1 halt. No Script Include this turn.**" |
| T-10 (run 3) | PASS | "## ITSM Specialist gateway — Verdict C, §1.1 halt — I'm not dispatching Developer, and I'm not writing the Script Include this turn. The request names a custom table" |
| T-11 post-build §1.1 scan | PASS | "**4. Nothing else is surfaced in the same turn.** No Code Reviewer pass, no ATF Author, no Operational Documentation, and no Domain Expert review-mode re-fire (Phase 2 Step 4)" |
| T-12 go-live docs | PASS | "The second one fires precisely *because* the deployment is deferred — §3.2 treats a go-live signal as the moment the runbook becomes outstanding, whether or not the deploy happens." |
| T-13 §6.2 pair | PASS (n turns) | "then I'll build, and run Phase 2 (ITSM review mode + Code Reviewer + ATF, since it's release-bound) before presenting anything as final." |
| T-14 CMDB & CSDM gateway | PASS | "**VERDICT A.** No custom object named, none needed. Baseline covers it entirely. A builder may be dispatched." |
| T-15 three-gateway co-fire | PASS | "Three gateways co-fired (CSM · ITSM · CMDB & CSDM); all three concur." |
| T-16 Security & GRC consult | PASS (two turns) | "**Author:** Security & GRC Specialist (§3.1 routing-time consult, skill mode, main thread)" |
| T-17 Licensing consult | PASS (two turns) | "**This approves nothing.** The §1.1 ruling is yours, and the gateway (CSM vs ITSM) and engagement name are still open." |
| T-18 Estimation consult | PASS (two turns) | "**Method:** parametric + bottom-up · **Confidence: ROM ±50%** (sized from one sentence)" / "**Contingency:** +30% on profiling/cleansing/rehearsal until the sheets are profiled, dropping to +10–15% after. Named risk, not padding." |

## T-01 and T-13 — PASS (n turns), single cold turn, judged on the turn-1 standard

Both specs carry one prompt and expect Phase 2 (the §6.2 Code Reviewer proposal; for T-13 the ATF
Author proposal beside it), which can only occur after the user approves the builder in a second
turn. In both runs the engine did everything the first turn can show: the ITSM gateway fired
unprompted with a five-part envelope (T-01: Verdict B with its reason — a Breakdown plugin and one
field — and the routing chain "Technical Designer → (gateway review) → Developer → Code Reviewer";
T-13: Verdict A, two blocking questions, Developer dispatch proposed pending approval), Performance &
Scale flagged, no builder dispatched, no code produced, 0 MCP calls. The judges recorded INCONCLUSIVE
by the letter because the key criterion was unreachable; under the 2026-09-09 rule for a single cold
turn the verdict is PASS (n turns), as on rc.1. **Spec item:** both tests need a second prompt (the
approval) so Phase 2 can be judged; T-01's expected "Verdict A" should read "A or B (the baseline
path)". Handed to ARC-02's chores with this record.

## T-07 — engine correct, criterion 3 stale

Turns 1 and 2 pass every criterion: the `Mode: design-only …` line first and undecorated, quoted from
a doctor actually run in each session; empty keys omitted and not guessed; the incident request
refused with `/snowarch setup-instance` named and the §2.1 write gate and §2.2 capture rule cited; no
credential asked; 0 MCP calls. Turn 3 (`/snowarch setup-instance`) runs the prerequisite gate
(`node.ok: true`, `mode.toggle: disabled`) and stops with the design-only text, asking for nothing.
The spec's criterion 3 still reads "the hand-off block appears with the label and URL substituted,
including the Windows `snowarch.cmd instance add …` line", which is the 2026-09-09 text written
against the doctor stub and re-scoped on 2026-09-12 ("engine correct, criterion 3 re-scoped: the
shipped skill stops and asks nothing"). The re-scope was ruled and never written into
`tests/VALIDATION-TESTS.md`, so the judge — reading the spec as it is — recorded FAIL, and the
refuter confirmed the letter. The engine's behaviour is the one the ARC-10-S07 cutover list states
as the property. **Spec item:** apply the re-scope to the spec (with the live-mode hand-off criterion
kept for the live variant). Same home as the T-01/T-13 item.

## T-10 — three fresh sessions, three of three

The rc.1 finding (B02-07) was that the halt was right but its provenance wrong: the Architect
halted at Step 4 in two of three sessions, and the third labelled a named custom object Verdict A.
On rc.2 the gateway is named as the thing that halts in all three sessions, and the halt is the
gateway's §1.1 Verdict C in all three; no session produced a table model, a field list or code, and
none made an MCP call.

- Run 1 (18 assistant turns, 13 tool calls): "The ITSM gateway returns **Verdict C — §1.1 halt**,
  and the reason is stronger than a formality: baseline already ships this table."
- Run 2 (17 tool calls): "I ran the ITSM Specialist gateway (Phase 1 Step 5) before any builder. It
  does not clear." — the envelope's parts are present in substance (OOB process map with the on-call
  tables cited to the corpus, the field-to-baseline crosswalk, the routing recommendation, the
  anti-patterns) without the literal "Part 3" label; the envelope file itself was not written
  because the harness grants no `Write` for T-10, which the session said in so many words.
- Run 3 (14 tool calls): "## ITSM Specialist gateway — Verdict C, §1.1 halt — I'm not dispatching
  Developer, and I'm not writing the Script Include this turn. The request names a custom table".

The one table in run 2's answer is the user's own four fields mapped to their baseline homes — a
crosswalk that argues against the custom table, not a model of it.

## T-18 — PASS (two turns), re-run

The first run's second turn was cut by the harness's sixty-minute budget (the whole suite ran under
one monitor); T-18 was re-run as a fresh two-turn session. Turn 1 restates the task, sequences the
CMDB & CSDM gateway ahead of the Estimation consult and names Licensing and Migration as consults;
turn 2 produces the estimate as a range with method and confidence ("**Method:** parametric +
bottom-up · **Confidence: ROM ±50%**"), two sized paths (45–70 and 120–180 person-days), a named
contingency tied to data quality, the §1.1 delta for a custom asset table ("adds **+25–40
person-days** *and* forfeits the baseline dashboard"), and a RAID item. The one sub-criterion not
visible — the estimate recording into baseline SPM — sits in the estimate file the session drafted
and was not allowed to write (no `Write` grant, no engagement folder), so it is unverifiable, not
contradicted.

## What this run also produced

- The spec items above (T-07 criterion 3; T-01/T-13 second prompt; T-01 verdict letter) — three
  places where the spec, not the engine, is what a judge fails.
- A harness note: the design-only suite plus three T-10 runs exceeds a single sixty-minute monitor
  on this machine (about 3–4 minutes per turn, 22 turns); split the run or budget ninety minutes.
- Every session: 0 MCP calls, `trusted? no`, the operator's global instructions loaded (caveat 3).
