> **Redaction rules (ARC-00 STORIES.md conventions).** No instance URLs, usernames, passwords, tokens or
> `~/.claude.json` contents appear in a spike record — **key names only, values as `set (len n)`**.
> Paths are not secrets and may be printed verbatim. Screenshots are cropped to the dialog.
> A spike that runs on several operating systems carries **one *Observed* block per OS and one verdict line**.

# S-09 — Claude-first clone into the cwd, then one restart

**Run by:** ARC-00-S10 · **Verdict consumed by:** ARC-06-S13 (Path B restart text)

**Status: NOT RUN** — record created by ARC-00-S01 with the *Assumption* pre-filled; ARC-00-S10 fills in Environment, Procedure, Observed and Verdict.

## Assumption

> Claude-first path: `git clone <url> .` into the folder Claude was started in, then one restart, loads `CLAUDE.md`, `.mcp.json`, `.claude/settings.json` and skills; no mid-session loading is needed

**Impact if false:** M · **Evidence so far (from `03`):** `docs:skills` says skill file changes are detected live; nothing says the same for `.mcp.json` / settings

## Environment

| Field | Value |
|---|---|
| Machine / snapshot | _to be filled by ARC-00-S10_ |
| Claude Code | _`claude --version`; and `claude-2.1.214 --version` where the floor is exercised_ |
| Node | _`node --version`_ |
| git | _`git --version`_ |
| Shell | _zsh 5.9 / PowerShell 5.1 / cmd_ |
| Date | _YYYY-MM-DD_ |

## Procedure

**Check that retires it (from `03`):** Run the recipe; check Claude Code's built-in `/status`, `/mcp` and `/help` before and after the restart

```
_exact commands, in order — or point to run.sh / run.ps1 next to this file_
```

## Observed

_One block per OS. Paste real output, redacted per the rules above._

## Verdict

`S-09: NOT RUN` — to be replaced by `S-09: CONFIRMED` or `S-09: FAILED → fallback Always instruct the restart (already in the design)`

## Evidence

- _`logs/<file>` — what it is_
