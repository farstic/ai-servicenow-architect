# ADR-0005 — Default permission posture, production safeguards and "Propose, don't impose"

> **What this is:** an Architecture Decision Record for the *product*, not for a client engagement. It uses the engine's ADR template (`reference/templates/adr-template.md`) with the engagement fields adapted for an engine-level decision, exactly as ARC-00-S03's design notes prescribe. ADRs are immutable once Accepted: a later change is a **new** ADR that supersedes this one, never an edit.

---

| Field | Value |
|---|---|
| **ADR ID** | ADR-0005 |
| **Title** | Default permission posture, production safeguards and "Propose, don't impose" |
| **Status** | Accepted |
| **Date** | 2026-09-06 (recorded) · decision taken 2026-09-04 |
| **Decision owner** | Cvetomir Grigorov (owner) — initials `PENDING OWNER`, decision taken 2026-09-04 |
| **Engagement** | AI ServiceNow Architect — product |
| **Release family** | Australia (docs corpus) |
| **§1.1 relevance** | None |
| **Related** | Consumed by ARC-04 (per-instance flags, read/write gate split), ARC-06 and ARC-07 (acceptance criterion) · design principle 10 in `01` §2 · verified mechanically by spike S-18 |

## Context

Writes against a live ServiceNow instance are the one irreversible thing this product does, and the current registration is all-write with two flags absent (`00` §5). Governance §2.1 says writes are exceptional and explicit. At the same time, a practitioner on their own developer instance who has to grant the six capability flags — `WRITE`, `CMDB_WRITE`, `SCRIPTING`, `ATF`, `NOW_ASSIST`, `FLUENT` (`01` §6.3) — one at a time will not thank anyone for it. The posture therefore has to be safe **and** short, and — after the owner's modification — it has to keep the user in control of every step rather than deciding for them.

## Decision

The owner's ruling of 2026-09-04, quoted verbatim from `docs/plans/02-DECISIONS-NEEDED.md` §D-05:

> **DECIDED 2026-09-04 — confirmed WITH A MODIFICATION from the owner.** (a) **Changed:** for `pdi` / `dev` / `test` instances the system *proposes* the `full` preset (every capability on), not `read-only`; the user reviews a per-flag screen where each flag is pre-set ON and annotated with its live probe result, and may toggle any flag or switch preset before anything is saved. A failing probe changes only the recommendation text on that line, never the toggle. `read-only` remains the proposal for `prod`. (b) **Unchanged:** `prod` is capped at `read-only`; raising it requires `./snowarch instance set-preset <label> <preset> --ack-prod` with the label typed, and the server refuses a `prod` instance with a write preset unless `prodWriteAck: true` is in the store. Environment detection: `^https://dev\d+\.service-now\.com` → proposed `pdi`; everything else is asked, never guessed. **Owner directive recorded as design principle 10 in `01` §2 ("Propose, don't impose"):** the user must be involved in the whole configuration process — the system proposes at every step, the user can change any value at any level, and the whole experience must be intuitive, easy and fast. This is now an acceptance criterion for ARC-06 and ARC-07 and the `01` §6.3 preset flow was rewritten accordingly.

**What this fixes.** For instances tagged `pdi`, `dev` or `test` the system **proposes** the `full` preset with every capability on, and shows a per-flag review screen: each flag pre-set ON and annotated with its live probe result, every flag toggleable, and the preset itself switchable before anything is saved. A failing probe changes only the recommendation text on that line — never the toggle. For `prod` the proposal is `read-only` and it is **capped** there: raising it requires `./snowarch instance set-preset <label> <preset> --ack-prod` with the label typed, and the server refuses a `prod` instance carrying a write preset unless `prodWriteAck: true` is in the store. Environment is detected only for `^https://dev\d+\.service-now\.com` → proposed `pdi`; everything else is **asked, never guessed**.

Confirmed by the owner on 2026-09-04.

## Options considered

| Option | Summary | Pros | Cons |
|---|---|---|---|
| **A (chosen, as modified by the owner)** | Propose `full` for non-production with a per-flag review; propose and cap `read-only` for production | Costs a developer-instance user one review screen instead of six separate decisions; keeps the production cap a security reviewer expects; the user is involved at every step (principle 10) | A reviewer reading only "proposes full" without the review screen may misread the posture |
| B | The `02` recommendation: default every instance to `read-only`, pre-select `pdi-developer` only when tagged PDI or Development | Safest possible default | The owner judged it too timid for the target persona; **modified to option A** |
| C | Replicate today's all-write posture as the default | Nothing changes for the author | The doctor then warns on every all-write production instance, and the security claims in `01` §7 must be softened |
| D | No production cap | Simpler | The environment tag becomes informational only and the audit trail documents nothing |

## §1.1 record (if a custom object was in play)

Not applicable — engine-level decision. No ServiceNow table, scoped application, state value or
other platform object is created, extended or approved by this ADR. §1.1 governs what the product
*builds on a customer instance*; this record governs how the product itself is built and shipped.

## Consequences

- **Design principle 10, "Propose, don't impose"** (`01` §2). Every configuration step — bootstrap and wizard alike — follows **Propose → Review → Apply**: the system shows its proposal with a one-line reason, the user accepts it with Enter or edits any single value before it is applied, and everything stays re-editable afterwards. Nothing is applied without being shown first. The user may change any value at any level, and the experience must be intuitive, fast and easy. This is an **acceptance criterion** for ARC-06 and ARC-07, not advice.
- The §2.1 write gate is made mechanical rather than textual: ARC-05 generates a `permissions.ask` rule for every `mutates:true` tool into the committed `.claude/settings.json`. On plans that start a session in auto mode, an action matching an explicit `ask` rule resolves to a user prompt **before** the classifier is consulted — spike **S-18** verifies exactly this, and until it does, ARC-05 keeps the fallback story open (generate `deny` plus a PreToolUse hook gated on a per-session approval marker).
- `prodWriteAck: true` lives in the store, so the acknowledgement travels with the instance entry and the server can refuse without asking the user again.
- The audit trail (`.local/audit.jsonl`) is what documents a raised production preset afterwards.
- A non-interactive `--yes` path exists for CI, and it inherits the same cap: it cannot raise a `prod` instance without `--ack-prod`.

## Follow-ups

- Spike **S-18** (ARC-00-S05) must show the prompt appearing in auto mode; record the account plan, since the plan determines whether auto mode exists (owner input #7).
- Spike **S-12** (ARC-00-S05) decides whether the generated allow list can use middle-wildcard globs or must be ~250 explicit tool names.
- ARC-04-S05 runs the validation suite under `read-only` and `pdi-developer` on a developer instance (deferred spike S-10).

---

*ADR — AI ServiceNow Architect. One decision per file; never edit a decision's history — supersede it with a new ADR. Produced by ARC-00-S03 from the owner's rulings of 2026-09-04 recorded in `docs/plans/02-DECISIONS-NEEDED.md`.*
