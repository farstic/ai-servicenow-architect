> **Redaction rules (ARC-00 STORIES.md conventions).** No instance URLs, usernames, passwords, tokens or
> `~/.claude.json` contents appear in a spike record — **key names only, values as `set (len n)`**.
> Paths are not secrets and may be printed verbatim. Screenshots are cropped to the dialog.
> A spike that runs on several operating systems carries **one *Observed* block per OS and one verdict line**.

# S-13 — Skill listing with descriptions capped at 500 chars

**Run by:** DEFERRED → ARC-02-S03 · **Verdict consumed by:** ARC-02-S02, ARC-05-S04

**Status: CLOSED — CONFIRMED by ARC-02-S03 (2026-09-08). See "Closed by ARC-02-S03" at the foot of this
record for the measured mechanism; the deferral text below is kept as written.**

**Status at deferral: DEFERRED → ARC-02-S03. The census stands; my length-threshold prediction was
REFUTED by the architect, who had the listing.** The `≤ 500` figure in the assumption is unfounded, and the mechanism is
**listing-level, not per-file**. The acceptance test that replaces the cap is stated below.
already over 500 characters**, so the proposed cap is not a tweak but a rewrite of nearly the whole
roster; and if a 500-character cap were the mechanism, 27 skills would have dropped, not 7. A specific,
falsifiable alternative is stated below.

## The census — measured 2026-09-07, read-only, on the engine working tree

Every `skills/*/SKILL.md` frontmatter `description` in `~/work/AI-Architect-Claude` (read only; nothing in
that repository was modified), whitespace-collapsed, quotes stripped:

```
SKILL.md files: 28    descriptions parsed: 28    unparsed: 0
length  min / median / max :  492 / 1014 / 1587
over 500 characters        :  27 of 28
```

The only description **under** 500 is `developer` (492). The seven longest:

| chars | skill |
|---|---|
| 1587 | estimation-specialist |
| 1574 | licensing-specialist |
| 1271 | migration-specialist |
| 1214 | ui-ux-specialist |
| 1211 | devops-release-manager |
| 1189 | performance-scale-specialist |
| 1134 | security-grc-specialist |

### Two things follow, and the second is the useful one

**1. The remedy is much larger than the assumption implies.** "Cap descriptions at ≤ 500 chars" reads like
a trim; on this roster it means **rewriting 27 of 28 descriptions**, several to under a third of their
current length. Whoever owns that work should be told the size before agreeing to it.

**2. A 500-character cap cannot be the mechanism that dropped 7.** If length past 500 were the cause,
**27** skills would have dropped, not 7. So either the cause is not length, or the threshold is far higher
than 500.

**The falsifiable prediction *(made 2026-09-07, and REFUTED the same day — kept because the refutation is
the finding)*.** I predicted that if the cause were a length threshold it would sit near ~1,100 characters,
since exactly seven descriptions exceed that; and that the seven that dropped would be estimation,
licensing, migration, ui-ux, devops-release-manager, performance-scale and security-grc.

### The prediction was wrong — the architect had the listing

The seven shown **name-only**, with their measured lengths:

| chars | skill | | chars | skill |
|---|---|---|---|---|
| 1232 | ui-ux | | 1077 | reporting-analytics |
| 1208 | performance-scale | | 961 | operational-documentation |
| 1153 | security-grc | | **755** | **technical-designer** |
| 1089 | spm | | | |

**Three observations kill the length hypothesis outright.** The **four longest** descriptions —
estimation (1,610), licensing (1,595), migration (1,301), devops (1,234) — were **shown**, two of them
truncated with an ellipsis, which is per-skill truncation working as intended. **`story-writer` (784) was
shown while `technical-designer` (755) was not** — a shorter description dropped and a longer one
survived. And the dropped set is **not** a suffix of the length ordering in either direction.

*(The lengths in this table differ by a few characters from my census — 1,208 vs 1,189 for
performance-scale, 1,232 vs 1,214 for ui-ux, and so on — because the two measurements normalise the YAML
scalar differently. The difference is immaterial to every conclusion here, and it is recorded rather than
quietly reconciled.)*

### What the architect eliminated, and what is left

Every per-file cause was excluded: **no YAML hazard on any description line, no CRLF or BOM, identical
frontmatter key sets** (`name`, `description`, optionally `version`), and **all 28 skills live only in the
project `.claude/skills`** — so it is not a precedence or duplicate-source effect either.

**What remains is listing-level: most likely a total byte budget for the whole skills block.** Two things
point at it — per-skill truncation demonstrably exists (the ellipses on the two longest), and the
name-only tail **clusters alphabetically around o–u**, which is what a budget exhausted partway through an
ordered emission looks like rather than anything about the individual files.

### Consequence — the remedy changes shape, and this spike closes

**The `≤ 500` cap is unfounded and should not be implemented as stated.** Shortening descriptions is still
the lever — a smaller total is a smaller block — but 500 is an arbitrary figure that would mandate
rewriting 27 of 28 descriptions for a threshold no evidence supports.

**Handed to ARC-02-S03 with a behavioural acceptance test in place of a number:**

> **All 28 skills appear *with a description* in a fresh session.**

Shortening is justified only by that test, and only as far as that test requires. **DEFERRED — the
mechanism is a Claude Code listing behaviour, not a property of these files, and it is ARC-02-S03 that
owns making the roster render.**

**Provenance of the refutation:** the listing observation is the architect's, from their own session on
2026-09-07; the census and the (wrong) prediction are mine. No skill file was modified by either.

## Assumption

> Capping descriptions at <= 500 chars makes all 28 skills appear with descriptions in the listing (the mechanism that dropped 7 today is unknown)

**Impact if false:** M · **Evidence so far (from `03`):** `docs:skills`: 1,536-char truncation; `docs:sub-agents`: 15,000-token combined-description warning (agents)

**Deferral.** Deferred → ARC-02 (owning story ARC-02-S03): needs the rewritten <= 500-char skill descriptions, which are ARC-02 product content. Not run in ARC-00. ARC-00-S14 records the deferral in `03` §A. Note the identifier hazard: spike `S-13` is not story `ARC-00-S13` (the Windows CI recipe).

## Environment

| Field | Value |
|---|---|
| Machine / snapshot | _to be filled by DEFERRED → ARC-02-S03_ |
| Claude Code | _`claude --version`; and `claude-2.1.214 --version` where the floor is exercised_ |
| Node | _`node --version`_ |
| git | _`git --version`_ |
| Shell | _zsh 5.9 / PowerShell 5.1 / cmd_ |
| Date | _YYYY-MM-DD_ |

## Procedure

**Check that retires it (from `03`):** After ARC-02, start `claude --debug` and inspect the listing; confirm 28 names with descriptions — deferred to ARC-02-S03 (needs the rewritten descriptions; ARC-00-S14 records the deferral)

```
_exact commands, in order — or point to run.sh / run.ps1 next to this file_
```

## Observed

_One block per OS. Paste real output, redacted per the rules above._

## Verdict

`S-13: CONFIRMED — the cause is a **total listing budget** stated by the CLI itself, not a per-file cause: the engine share was cut 27,119 → 11,191 chars and all 28 skills register with a description. Ten YAML hazards were checked and none separated the four empty descriptions from the twenty-four that worked`

## Evidence

- _`logs/<file>` — what it is_

---

## Closed by ARC-02-S03 — 2026-09-08

**S-13: CONFIRMED — the cause is a total listing budget, stated by the CLI itself. Fixed by ARC-02-S03; the engine's listing is now under budget and all 28 register with a description.**

Measured 2026-09-08 on macOS, Claude Code 2.1.258, against the ARC-02-S03 tree.

## The question

P-09 recorded that seven skills appeared in a session with **no description at all**, and that the
descriptions totalled 27,672 characters. The mechanism was unverified: per-file causes (a YAML hazard,
a bad key) and a listing-level budget were both live hypotheses.

## Why "ask a session to list its skills" cannot answer it

The obvious probe — run `claude -p` in a scratch project and ask it to print its own skill listing —
is not an instrument. A model that omits a long description looks exactly like a description that was
never registered. The probe was run anyway (it is how the four empty descriptions were first seen),
but it can only raise the question, not settle it.

## The instrument

`claude --debug-file <path>` writes the CLI's own registration log. Two lines answer it directly:

```
[DEBUG] Loaded 29 unique skills (29 unconditional, 0 conditional, managed: 0, user: 1, project: 28, additional: 0, legacy commands: 0)
[DEBUG] Sending 42 skills via attachment (initial)
[WARN]  Skill listing over budget: 42 skills, 34399 chars > 30000 budget — descriptions will be truncated. Run /skills to disable some, or raise skillListingBudgetFraction in settings.
```

That is the mechanism, in the tool's own words. `scripts/ci/skill-listing-check.mjs` parses those
lines; `tests/skill-listing.test.mjs` asserts them.

## What the mechanism actually is

- It is a **total** budget across every skill in the session, not a per-file cap. The 42 counted here
  are the engine's 28 plus one user skill and thirteen bundled ones.
- Over budget, descriptions are **truncated**, and some are dropped to empty entirely.
- **The engine cannot control the total — only its own share of it.** This is the durable consequence:
  a user with their own skills installed spends the same budget, so the smaller the engine's
  contribution, the more room everything else has before anything truncates. It is why the ≤ 500
  character rule per skill is a floor to defend, not a one-off cleanup.
- The budget is configurable (`skillListingBudgetFraction`), but a fix that requires every user to
  change a setting is not a fix.

## Refuted: per-file causes

The four skills that came back empty — `reporting-analytics-specialist`, `security-grc-specialist`,
`spm-specialist`, `ui-ux-specialist` — were checked against ten YAML plain-scalar hazards
(`: `, ` #`, quotes, apostrophes, braces, brackets, backticks, commas, leading dashes, markdown bold).
**No hazard was present in the four and absent from the twenty-four that worked.** Their frontmatter
was valid; they were casualties of the total budget.

Separately, exactly two descriptions were *truncated* rather than emptied — `estimation-specialist`
(1,587 chars) and `licensing-specialist` (1,574), the only two above the 1,536 per-description
truncation point recorded in the Claude Code skills documentation. Those two effects are distinct and
both were present.

## Before and after

| | before | after |
|---|---|---|
| skills registered (project) | 28 | 28 |
| descriptions over 500 chars | 27 of 28 | 0 |
| total description characters | 27,119 | 11,191 |
| longest description | 1,587 | 479 |
| listing total, all 42 skills | 34,399 chars | under the 30,000 budget |
| truncation warning | present | absent |
| skills listing with no description | 4 | 0 |
| skills listing truncated mid-sentence | 2 | 0 |

Confirmed end to end: a headless session asked for the six previously broken skills returns all six
with their descriptions.

## Fallback, unused

The story's fallback — shorten to ≤ 300 characters and re-test, then escalate to moving persona
routing into `CLAUDE.md` — was not needed. ≤ 500 with the trigger material moved into a `## Triggers`
body section cleared the budget with room to spare.

## Addendum — skills load from every `.claude/skills` up the tree (2026-09-08)

Found while the architect re-verified this story on a fresh clone: the measurement returned **56** where
28 was expected, and the script reported OK on it.

Claude Code discovers project skills from **every** `.claude/skills` between the working directory and
the filesystem root. A scratch project created beneath a directory that already carries one loads both
rosters. The CLI prints the walk-up itself:

```
[DEBUG] Loading skills from: managed=…, user=…, project=[<scratch>/.claude/skills, <ancestor>/.claude/skills]
[DEBUG] Loaded 30 unique skills (… project: 29 …)
```

Reproduced deliberately with a one-skill decoy in an ancestor: `project: 29` instead of 28.
`env -u CLAUDE_PROJECT_DIR` changes nothing — it is the directory walk-up, not an environment variable.

Two consequences:

1. **For the measurement.** `scripts/ci/skill-listing-check.mjs` now picks its scratch parent only after
   inspecting that directory's ancestors, requires the debug log's `project=[…]` list to name exactly
   its own scratch directory, and SKIPS with the polluting paths named when no clean parent exists. It
   compares the count to `engine.config.json` and reports FAILED, not OK, on a mismatch — the earlier
   version printed OK on 56 because only the test compared, and the two disagreed.
2. **For the product.** This is not a test artefact. A user who clones the engine beneath a folder that
   already has `.claude/skills` gets both sets, and both spend the same listing budget measured above.
   Recorded as an S-13 addendum row in `docs/plans/03-RISKS-AND-UNKNOWNS.md` §F; a doctor check for it
   is owned by ARC-04.

