# ADR-0002 — Licence of the unified repository and relicensing of both predecessors

> **What this is:** an Architecture Decision Record for the *product*, not for a client engagement. It uses the engine's ADR template (`reference/templates/adr-template.md`) with the engagement fields adapted for an engine-level decision, exactly as ARC-00-S03's design notes prescribe. ADRs are immutable once Accepted: a later change is a **new** ADR that supersedes this one, never an edit.

---

| Field | Value |
|---|---|
| **ADR ID** | ADR-0002 |
| **Title** | Licence of the unified repository and relicensing of both predecessors |
| **Status** | **Accepted** (2026-09-07) — both owner-gated items landed: the owner's relicensing confirmation and the second contributor's written consent |
| **Date** | 2026-09-06 (recorded) · decision taken 2026-09-04 |
| **Decision owner** | Cvetomir Grigorov (owner) — initials `PENDING OWNER`, decision taken 2026-09-04 |
| **Engagement** | AI ServiceNow Architect — product |
| **Release family** | Australia (docs corpus) |
| **§1.1 relevance** | None |
| **Related** | Depends on ARC-00-S02 (`spikes/licence/LICENSE`, `NOTICE`, `RELICENSING.md`, `header-sweep.txt`) · consumed by ARC-01-S01, ARC-01-S02, ARC-01-S03, ARC-01-S08, ARC-04-S01 · risk `03` R-11 |

## Context

The merge is impossible under the current texts (`00` P-32). `snow-mcp/LICENSE` is a source-available licence that **prohibits copying, modifying, merging and derivative works** — precisely what the merge requires; `snow-mcp/smithery.yaml:15` simultaneously claims `license: MIT`; and the engine's `docs/README.md:157-159` says "Proprietary … not licensed for redistribution". The repository also embeds the Apache-2.0 ServiceNowDocs corpus, whose attribution must ship. `03` R-11 states plainly that nothing can be published until this is settled, and the repository was created **public** (R-4, 2026-09-06), which raises the stakes: a proprietary licence text must never reach the public tree.

## Decision

The owner's ruling of 2026-09-04, quoted verbatim from `docs/plans/02-DECISIONS-NEEDED.md` §D-02:

> **DECIDED 2026-09-04 — Apache-2.0 for the whole repository.** The author confirms this is a personal project (no employer IP claim), so relicensing is a unilateral author statement. Deliverables: one root `LICENSE` (Apache-2.0), a `NOTICE` carrying the ServiceNow / ServiceNowDocs Apache-2.0 attribution, the relicensing sentence in the first commit message, and removal of the contradictory `smithery.yaml` MIT claim and the engine's "Proprietary" wording. ARC-01 owns this.

**Artefacts produced by ARC-00-S02 and consumed by ARC-01** (all under `spikes/licence/`): `LICENSE` — the canonical Apache-2.0 text as published by the ASF at `https://www.apache.org/licenses/LICENSE-2.0.txt`, 11,358 bytes, sha256 `cfc7749b96f63bd31c3c42b5c471bf756814053e847c10f3eb003417bc523d30` (ratified by the architect 2026-09-06: the ASF rendering is the *text*, SPDX supplies the *identifier* `Apache-2.0`); `NOTICE`; `RELICENSING.md`; and `header-sweep.txt`, which lists every pre-Apache licence assertion in both source trees with the ARC-01 story that removes it.

Confirmed by the owner on 2026-09-04, and the relicensing itself confirmed **in writing on 2026-09-07**:

> „Потвърждавам relicensing под Apache-2.0, 2026-09-06"
> *(English gloss: "I confirm the relicensing under Apache-2.0, 2026-09-06.")*

Recorded by the owner's own git identity in `docs/plans/02-DECISIONS-NEEDED.md` D-02, commit `695167a`
(2026-09-07), and relayed to the delivery session through the architect. The second contributor's own consent followed the same day — **RobertBH17: "yes, agreed"**, MS Teams
chat, 2026-09-07, recorded at `3611587` — which closes the one item that was holding this ADR at
*Proposed*. **Status: Accepted.**

## Options considered

| Option | Summary | Pros | Cons |
|---|---|---|---|
| **A (chosen)** | Apache-2.0 for the whole repository, one root `LICENSE` + `NOTICE` | Aligns with the embedded ServiceNowDocs corpus; explicit patent grant; the licence consultancies and clients accept without review | Longer text than MIT |
| B | MIT | Shorter | No patent grant; misaligned with the corpus; and the stray `smithery.yaml` MIT claim would look like the surviving truth rather than the contradiction it is |
| C | Source-available / proprietary, or private | Keeps the current posture | The "public repo any user points Claude at" goal narrows to invited users; plugin/marketplace distribution becomes impractical; the `NOTICE` obligation for ServiceNowDocs still applies |
| D (do nothing) | Leave snow-mcp unrelicensed | None | ARC-04 cannot start; the server would have to be rewritten from the public REST API surface rather than merged |

## §1.1 record (if a custom object was in play)

Not applicable — engine-level decision. No ServiceNow table, scoped application, state value or
other platform object is created, extended or approved by this ADR. §1.1 governs what the product
*builds on a customer instance*; this record governs how the product itself is built and shipped.

## Consequences

- ARC-01-S01 commits the root `LICENSE` and `NOTICE`; the relicensing sentence goes in the **first commit message**.
- ARC-01-S03's leaf cut removes the server's `TERMS.md`, `smithery.yaml` and `server.json` and sets `license: "Apache-2.0"` in the renamed package manifest; ARC-01-S08 replaces `packages/snowarch/LICENSE` with the verbatim Apache-2.0 text and rewrites the two licence sections (`packages/snowarch/README.md:83-85`, engine `docs/README.md:157-159`).
- The `@farstic/snow-mcp@1.0.0` npm record is **not** relicensed, deprecated, unpublished or edited.
- The ServiceNowDocs corpus keeps its own Apache-2.0 licence and is attributed in `NOTICE`; ARC-03 owns the submodule.
- **Not fully settled.** The relicensing statement is a unilateral author statement for `snow-mcp` (single author, verified) but **not** for the engine: `git shortlog -sn HEAD` shows a second contributor with one squash-merged commit, `5b40835` — 138 files, 10,424 insertions. Until the owner records resolution (a) written consent or (b) rewrite-before-import, ARC-01-S02's import of those files is blocked.

## Follow-ups

- ~~`PENDING OWNER` — the dated owner confirmation line~~ **— RECEIVED 2026-09-07**, quoted in the *Decision* section above and recorded in `spikes/licence/RELICENSING.md` §4 with its channel and provenance (`695167a`, the owner's own commit in the plans repository). **This alone does not move the ADR to Accepted** — the follow-up below does.
- ~~Resolution (a) or (b) for the engine's second contributor~~ **— CLOSED 2026-09-07 as resolution (a).**
  **Resolution (a) — consent obtained.** Contributor **RobertBH17**: **"yes, agreed"** — channel: **MS
  Teams chat**, **2026-09-07**; supplied by the owner via the architect session
  (`ai-architect-claude-d0`) and recorded in `docs/plans/02-DECISIONS-NEEDED.md` D-02 @ `3611587`.
>
  Preceded by the owner's own statement of the same day, „Имаме разрешение от RobertBH17" *("We have
  RobertBH17's permission")*, recorded at `cf2dde7`.

  Resolution (b) is withdrawn and **ARC-01-S02 may import the 138 files of `5b40835` under Apache-2.0**.
  Outreach was the owner's throughout; the delivery team contacted no one.
- When both land, ARC-00-S02 fills `RELICENSING.md` in one commit and this ADR moves to **Accepted** — by editing only the `Status` row, which is the one field an ADR may change before it is Accepted.
- ARC-01-S02 must pass a full-history secret scan before pushing any imported history (R-4 obligation 1).

---

*ADR — AI ServiceNow Architect. One decision per file; never edit a decision's history — supersede it with a new ADR. Produced by ARC-00-S03 from the owner's rulings of 2026-09-04 recorded in `docs/plans/02-DECISIONS-NEEDED.md`.*
