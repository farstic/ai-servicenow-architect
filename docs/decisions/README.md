# Architecture Decision Records — index and the ARC-00-S03 record

**Eight** ADRs: seven capturing the owner's decisions of 2026-09-04 (and R-4 of 2026-09-06), plus
**ADR-0008** (2026-09-07), the first raised by a spike result rather than by a planning question — S-07
measured that ADR-0001's git floor cannot be met. It is the first use of the supersession rule in anger:
ADR-0001 is **not** edited, and ADR-0008 replaces one row of it. **ARC-01** imports this
folder into `farstic/ai-servicenow-architect` as `docs/decisions/` as-is — the obligation is stated at ARC
level (ARC-00 `STORIES.md` conventions: "ARC-01 imports `spikes/` into the new repository as `docs/spikes/`
and `docs/decisions/` as-is") and **no ARC-01 story currently owns it**; see §4.5.

**Status: PARTIAL.** **Seven** ADRs are Accepted (ADR-0002 and ADR-0008 both moved on 2026-09-07); ADR-0006 remains Proposed
by design until ARC-00-S12's S-14 verdict; the owner's initials are `PENDING OWNER` on all seven.
Details in §3.

| ADR | Records | Status |
|---|---|---|
| [`ADR-0001-names.md`](ADR-0001-names.md) | D-01 — repository, CLI, MCP server key, npm package, and the floors/corpus values that sit beside them | **Accepted** |
| [`ADR-0002-licence.md`](ADR-0002-licence.md) | D-02 — Apache-2.0 for the whole repository, and the relicensing of both predecessors | **Accepted (2026-09-07)** — owner's confirmation and the second contributor's written consent both recorded |
| [`ADR-0003-scope-cut.md`](ADR-0003-scope-cut.md) | D-03 — the nine surfaces that do not enter the product | **Accepted** |
| [`ADR-0004-credential-policy.md`](ADR-0004-credential-policy.md) | D-04 — one 0600 store per checkout; basic auth default | **Accepted** |
| [`ADR-0005-permission-posture.md`](ADR-0005-permission-posture.md) | D-05 + principle 10 — propose `full` for non-production with a per-flag review; cap production at `read-only` | **Accepted** |
| [`ADR-0006-distribution-channel.md`](ADR-0006-distribution-channel.md) | D-06 — monorepo and bootstrap now, plugin channel spiked in parallel | **Proposed** — ARC-00-S12 accepts it or supersedes it with ADR-0008 |
| [`ADR-0007-post-decision-rulings.md`](ADR-0007-post-decision-rulings.md) | Q-A, Q-B, R-1, R-2, R-3, R-4 | **Accepted** |
| [`ADR-0008-git-floor.md`](ADR-0008-git-floor.md) | The git floor, and the sparse-checkout root-file repair that keeps it low — **supersedes ADR-0001's `floors.git` row only** | **Accepted (2026-09-07)** — option A: recipe repair step + `floors.git` = `2.34.1` |

Values these ADRs fix are mirrored in [`../../spikes/engine.config.seed.json`](../../spikes/engine.config.seed.json),
which ARC-01-S04 starts `engine.config.json` from.

**ADRs are immutable once Accepted.** A later change is a *new* ADR that supersedes the old one,
never an edit. The one exception, stated in each Proposed ADR, is its own `Status` row moving from
Proposed to Accepted.

---

## 1. How the quotes were produced

Acceptance criterion 2 requires the owner's ruling verbatim. The `DECIDED 2026-09-04 …` blockquotes
and the six *Ruling* cells were **extracted programmatically** from
`docs/plans/02-DECISIONS-NEEDED.md` on `origin/arc-00/spikes`, not retyped, so the criterion holds by
construction. Re-verified after every edit:

```
D-01 -> ADR-0001-names.md: VERBATIM OK          Q-A ruling in ADR-0007: VERBATIM OK
D-02 -> ADR-0002-licence.md: VERBATIM OK        Q-B ruling in ADR-0007: VERBATIM OK
D-03 -> ADR-0003-scope-cut.md: VERBATIM OK      R-1 ruling in ADR-0007: VERBATIM OK
D-04 -> ADR-0004-credential-policy.md: VERBATIM OK   R-2 ruling in ADR-0007: VERBATIM OK
D-05 -> ADR-0005-permission-posture.md: VERBATIM OK  R-3 ruling in ADR-0007: VERBATIM OK
D-06 -> ADR-0006-distribution-channel.md: VERBATIM OK R-4 ruling in ADR-0007: VERBATIM OK
```

Template: the engine's `reference/templates/adr-template.md`, read-only, with the engagement fields
adapted for an engine-level decision exactly as the design notes prescribe — `Engagement` = "AI
ServiceNow Architect — product", `Release family` = "Australia (docs corpus)", `§1.1 relevance` =
"None", and the `§1.1 record` block filled with why it does not apply rather than deleted.

---

## 2. Acceptance criteria

| # | Criterion | Status |
|---|---|---|
| 1 | Seven files; 0001–0005 and 0007 `Accepted`, 0006 `Proposed` with a *Follow-ups* line naming S12 before ARC-06-S01 | **MET, with one intended exception** — ADR-0002 is `Proposed`, not `Accepted`, on the architect's instruction of 2026-09-06 (its owner-confirmation and (a)/(b) fields are `PENDING OWNER`). ADR-0006 is `Proposed` as required. |
| 2 | Each of ADR-0001…0006 quotes the `02` `DECIDED` block verbatim; ADR-0007 quotes the five *Ruling* cells verbatim, one sub-heading each | **MET** — §1; six rulings, not five: R-4 was added to `02` on 2026-09-06 and is included on the architect's instruction. |
| 3 | `snow-mcp` appears only historically; ADR-0001 carries `packages/snowarch` / `@farstic/snowarch` | **MET** — all 12 `snow-mcp` occurrences are a source path, the frozen npm record, or the rejected option B; ADR-0001 carries the new names 7 times. |
| 4 | `/status` appears 0 times outside ADR-0007's "was → is" line | **MET in substance.** In the seven ADRs — the criterion's population — there are **3 occurrences, all in ADR-0007**: the was → is line the criterion allows, plus two **inside the verbatim `02` quotations** that criterion 2 forbids altering (the R-2 question and the R-2 ruling both name the built-in command). Criteria 2 and 4 are in tension; criterion 2 wins. This record (`README.md`) adds 2 more while explaining the tension, so `grep -c` over the whole folder returns 5 — the record is not an ADR. No ADR uses `/status` as a live form. |
| 5 | The seed JSON parses and every value appears in the ADR that fixes it | **MET** — `node -e "JSON.parse(…)"` clean; product/server values in ADR-0001, skill values in ADR-0007 (R-2), floors and corpus values in ADR-0001's second table, Mode/Preset vocabulary in ADR-0003. |
| 6 | No "Tier 0/1/2" except in a "retired vocabulary" note | **MET in substance, 1 occurrence** — "Tier 1" appears once, inside the verbatim D-03 quotation in ADR-0003, and ADR-0003's retired-vocabulary note names that occurrence explicitly and states the term is retired. Same criterion-2 tension as above. |

---

## 3. What is deliberately not filled in

| Item | Where | Why |
|---|---|---|
| **Owner initials** | the `Decision owner` row of all seven ADRs — `initials PENDING OWNER` | Initials are a signature. The decisions themselves are quoted from the owner's own recorded rulings, so the *substance* is evidenced; the initialling is an owner action, like ARC-00-S02's confirmation line. |
| *(resolved 2026-09-07)* **ADR-0002 → Accepted** | its `Status` row | Both owner-gated items landed on 2026-09-07: the owner's relicensing confirmation (`695167a`) and the contributor's own consent (`3611587`). ADR-0002 is **Accepted**; ARC-01-S02 may import the 138 files of `5b40835`. |
| **ADR-0006 → Accepted or superseded** | its `Status` row | Waits on ARC-00-S12's S-14 verdict; it is an entry gate for ARC-06-S01 (the D-06 hedge). |
| *(resolved 2026-09-06)* **`floors.claudeCode`** | `spikes/engine.config.seed.json` | Previously the literal `pending S-11`. The architect ruled that the floor is decided at **2.1.214** (`01` §4/§12, DR-11), S-11 confirms it, and a FAILED S-11 changes it by superseding ADR-0001 rather than by leaving a blank. The seed now carries `2.1.214`. |

---

## 4. Findings for the architect

1. ***(RESOLVED 2026-09-06 — architect ruling.)*** The seed originally followed ARC-00-S03's literal
   JSON block (`product` as an object, plus `server`, `skill`, `modes`, `presets`, `floors.claude`, a
   short `docs.pin`) and was structurally incompatible with ARC-01-S04's target, whose schema is
   `additionalProperties: false` at every level — four of those keys would have been rejected outright
   and `product` would have failed its type. **The seed now takes ARC-01-S04's exact shape**: `product`
   (string), `repo`, `cli`, `mcp{serverKey,package,packageDir}`, `floors{claudeCode,node,git}`,
   `docs{family,pin,areasFile}` with the full 40-character SHA, `roster{skills,agents}` — and nothing
   else at any level. Every one of S04's schema constraints was re-checked against the file (`^[0-9a-f]{40}$`
   pin, the `serverKey` / `package` / `packageDir` / `areasFile` patterns, semver floors, the `family`
   enum, integer roster counts): all pass. `roster` was verified against the engine tree — 28
   `skills/*/SKILL.md`, 9 `agents/*.md`. `modes`, `presets` and the skill sub-commands moved out of the
   seed; they live in ADR-0003 and ADR-0007. S03's definition of done was amended to match.
2. **The docs pin has a known drift.** The engine superproject's gitlink records `0ba98cd` while the
   working checkout is `ba513f2` (`00` §3.10). The seed carries `ba513f2`, the checkout actually in
   use, and ADR-0001 says so; ARC-03 owns the reconciliation. If the pin is later moved, that is a new
   ADR, not an edit.
3. **Acceptance criteria 2 and 4/6 conflict**, as recorded in §2. The verbatim `02` quotes contain
   `/status` twice and "Tier 1" once. Criterion 2 is the stronger requirement, so the quotes stand and
   the retired-vocabulary notes carry the carve-out. Worth a one-line amendment to criteria 4 and 6
   ("outside verbatim `02` quotations and the retired-vocabulary note").
4. **No ARC-01 story owns the import of `docs/decisions/` (or `docs/spikes/`).** The obligation is stated
   at ARC level only — ARC-00's `STORIES.md` conventions and its README deliverable line — and none of
   ARC-01's twelve stories executes it. ARC-01-S02 imports the **engine working tree** and its acceptance
   criterion 3 is a byte-identical `diff -rq` against `~/work/AI-Architect-Claude/`, which a folder from
   this repository would fail; ARC-01-S03 imports the **server**. Yet ARC-01-S10's ratchet already exempts
   `docs/decisions/ADR-*.md`, so the plans assume these files are in the tree. **ARC-01 needs a story, or an
   explicit sentence in an existing one, that copies `snowarch-spikes/spikes/` and
   `snowarch-spikes/docs/decisions/` in.** The first version of this record wrongly named ARC-01-S02 as the
   importing story; corrected.
5. **The ARC-00 README and the ARC-00-S03 story disagree on the ADR count.** The story's Context says
   "README deliverable: six ADRs" and treats ADR-0007 as a split it is introducing; the README's own
   deliverable line names all seven files, ADR-0007 among them, and its acceptance criterion reads "Seven
   ADRs exist; ADR-0001…0005 and 0007 with status Accepted". The deliverable follows the README. One
   sentence of the story needs amending.
6. **ADR-0007 carries six rulings, not five.** The story lists Q-A, Q-B, R-1, R-2, R-3; R-4
   (repository visibility, 2026-09-06) postdates the story text and was added on the architect's
   instruction. Its three obligations are consequential — full-history secret scan, second-contributor
   relicensing before push, PII grep on every plan push — and are recorded in ADR-0007's Consequences.

---

## 5. Verification of this story

Adversarial self-review before reporting, per the architect's standing instruction: five lenses over the
seven ADRs and the seed (31 agents), each finding refuted by an independent reviewer. **26 findings filed,
11 survived refutation** — six distinct issues after de-duplication, all fixed here. **Refutations
spot-checked: 3 of 15**, chosen as the three most consequential; two of the three were sound and one was
too lenient (it dismissed an understatement in §4 finding 1 that was real — the seed↔`engine.config.json`
divergence is structural, not a rename, and §4.1 now says so). Every confirmed finding was additionally
re-derived from the plans by hand before being applied. The acceptance-criteria greps in §2 and the
verbatim-quote check in §1 were re-run afterwards and both still pass.
