> **Redaction rules (ARC-00 STORIES.md conventions).** No instance URLs, usernames, passwords, tokens or
> `~/.claude.json` contents appear in a spike record — **key names only, values as `set (len n)`**.
> Paths are not secrets and may be printed verbatim. Screenshots are cropped to the dialog.
> A spike that runs on several operating systems carries **one *Observed* block per OS and one verdict line**.

# S-13 — Skill listing with descriptions capped at 500 chars

**Run by:** DEFERRED → ARC-02-S03 · **Verdict consumed by:** ARC-02-S02, ARC-05-S04

**Status: DEFERRED → ARC-02-S03. The census stands; my length-threshold prediction was REFUTED by the
architect, who had the listing.** The `≤ 500` figure in the assumption is unfounded, and the mechanism is
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

`S-13: NOT RUN` — to be replaced by `S-13: CONFIRMED` or `S-13: FAILED → fallback Investigate the per-listing budget; shorten further or move persona routing into `CLAUDE.md``

## Evidence

- _`logs/<file>` — what it is_
