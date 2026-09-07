> **Redaction rules (ARC-00 STORIES.md conventions).** No instance URLs, usernames, passwords, tokens or
> `~/.claude.json` contents appear in a spike record — **key names only, values as `set (len n)`**.
> Paths are not secrets and may be printed verbatim. Screenshots are cropped to the dialog.
> A spike that runs on several operating systems carries **one *Observed* block per OS and one verdict line**.

# S-13 — Skill listing with descriptions capped at 500 chars

**Run by:** DEFERRED → ARC-02-S03 · **Verdict consumed by:** ARC-02-S02, ARC-05-S04

**Status: PARTIAL — the census is done and it changes the question.** **27 of the 28 descriptions are
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

**The falsifiable prediction.** If the cause *is* a length threshold, the boundary sits near **~1,100
characters**, because exactly seven descriptions exceed roughly that figure — and they are the seven named
in the table above. **If the 7 that dropped are those 7, the threshold hypothesis is strongly supported;
if they are not, length is not the mechanism at all.** That is a one-minute check for whoever saw the
original listing, and it decides the question.

**Explicitly not claimed:** which seven actually dropped. That observation is not in this record and was
not available to me, so the table above is a *prediction*, not a finding. No skill file was modified.

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
