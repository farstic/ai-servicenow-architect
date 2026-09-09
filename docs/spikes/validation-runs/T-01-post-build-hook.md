# T-01 — §6.2 post-build hook fires without being asked

**Run** 2026-09-09 · **CLI** 2.1.258 · `claude -p --output-format json` in the repository, then
`claude -p --resume <session_id>` for the approval turn. Two turns, because T-01's chain crosses an
approval gate: a single non-interactive prompt can only reach step 4.

**Verdict: PASS on both pass criteria**, against `CLAUDE.md` at engine version 2.0.0-dev (the S08 rewrite, commit 36351d2).

## Turn 1 — the prompt, verbatim from T-01

> Implement a Script Include that calculates SLA breach risk for incidents based on assignment group
> historical data.

Step 2 fired **unprompted**: the ITSM gateway opened the answer — *"The ITSM gateway fired first
(triggers: incident, SLA, assignment group) — mandatory before any Developer dispatch."* It produced
the envelope, and its data-model part found more than the test expects: the SLA Breakdowns plugin
already generates the per-assignment-group history, so the corpus is baseline configuration rather
than anything to build. §1.1 verdict **B, conditional** — the Script Include itself raises nothing,
persisting a score would add one field to `incident` and needs explicit approval and an ADR, and a
custom per-group statistics table or a new `incident.state` value *would* halt. Performance & Scale
was flagged as a §3.1 consult, Developer proposed, four blocking OPEN QUESTIONS raised, and **no code
was written in that turn**.

## Turn 2 — approval

> Approved — dispatch the developer sub-agent as proposed. Q1: no client engagement, treat this as
> internal reference work. Q2: on-demand only, no new field.

The Developer sub-agent ran and returned the Script Include. Step 7 fired **unprompted**, verbatim:

> Code artefact produced. Proposing a Code Reviewer pass (style, performance, security,
> best-practice) before final delivery — proceed?

Asserted as a string match, not read by eye: `VERBATIM SENTENCE PRESENT: True`.

## What the run showed beyond the criteria

The builder listed four citations it could **not** verify in the docs corpus rather than asserting
them — the column names on `sla_breakdown_by_assignment` (the docs give labels only, though the table
name is verified), the internal values of `task_sla.stage`, the numeric `incident.state` values (made
a tunable property default instead of a hard dependency), and the absence of `COUNT_DISTINCT` from the
scoped `GlideAggregate` list, which changes what the computed rate means. It also flagged a
substitution it had to make — no baseline field quantifies remaining work — and raised its own open
question about which role should gate the class. That is the citation discipline behaving under a
sub-agent, which is not what T-01 tests but is worth having on the record.

Nothing was written to the repository by either turn.
