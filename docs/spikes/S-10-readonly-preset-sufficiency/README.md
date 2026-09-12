> **Redaction rules (ARC-00 STORIES.md conventions).** No instance URLs, usernames, passwords, tokens or
> `~/.claude.json` contents appear in a spike record — **key names only, values as `set (len n)`**.
> Paths are not secrets and may be printed verbatim. Screenshots are cropped to the dialog.
> A spike that runs on several operating systems carries **one *Observed* block per OS and one verdict line**.

# S-10 — read-only preset sufficiency for review and read workflows

**Run by:** DEFERRED → ARC-04-S05 · **Verdict consumed by:** ARC-04-S14 (CHANGELOG note), ARC-08 doctor note

**Status: NOT RUN** — record created by ARC-00-S01 with the *Assumption* pre-filled; this spike is deferred, see the note below.

## Assumption

> After the SCRIPTING read/write gate split, the `read-only` preset is sufficient for the Code Reviewer and Developer *read* workflows (list/read Script Includes, Business Rules, ACLs)

**Impact if false:** M · **Evidence so far (from `03`):** Gate placement analysed (`00` §4.3)

**Deferral.** Deferred → ARC-04 (owning story ARC-04-S05): needs the SCRIPTING read/write gate split, which is product code, and a PDI (owner input #3). Not run in ARC-00. ARC-00-S14 records the deferral in `03` §A.

## Environment

| Field | Value |
|---|---|
| Machine / snapshot | _to be filled by DEFERRED → ARC-04-S05_ |
| Claude Code | _`claude --version`; and `claude-2.1.214 --version` where the floor is exercised_ |
| Node | _`node --version`_ |
| git | _`git --version`_ |
| Shell | _zsh 5.9 / PowerShell 5.1 / cmd_ |
| Date | _YYYY-MM-DD_ |

## Procedure

**Check that retires it (from `03`):** Run VALIDATION-TESTS T-01…T-18 in `read-only` and `pdi-developer` on a PDI — deferred to ARC-04-S05 (needs the gate split; ARC-00-S14 records the deferral)

```
_exact commands, in order — or point to run.sh / run.ps1 next to this file_
```

## Observed

_One block per OS. Paste real output, redacted per the rules above._

## Verdict

`S-10: DEFERRED **→ ARC-04** — not run in ARC-00; the question moved to ARC-04-S05, which owns the read-only preset`

## Evidence

- _`logs/<file>` — what it is_
