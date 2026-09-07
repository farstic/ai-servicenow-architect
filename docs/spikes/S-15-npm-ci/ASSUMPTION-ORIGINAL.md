> **Redaction rules (ARC-00 STORIES.md conventions).** No instance URLs, usernames, passwords, tokens or
> `~/.claude.json` contents appear in a spike record — **key names only, values as `set (len n)`**.
> Paths are not secrets and may be printed verbatim. Screenshots are cropped to the dialog.
> A spike that runs on several operating systems carries **one *Observed* block per OS and one verdict line**.

# S-15 — Root npm ci footprint and module resolution

**Run by:** ARC-00-S08 · **Verdict consumed by:** ARC-01-S05 / ARC-06-S07 (`npm ci` footprint)

**Status: NOT RUN** — record created by ARC-00-S01 with the *Assumption* pre-filled; ARC-00-S08 fills in Environment, Procedure, Observed and Verdict.

## Assumption

> `npm ci --omit=dev --ignore-scripts` at the monorepo root installs only the server's runtime dependencies (~72 MB) and nothing for `tools/snowarch`; no hoisting surprise breaks `dist/server.js` module resolution

**Impact if false:** M · **Evidence so far (from `03`):** Server production tree measured at 72 MB / 155 packages with no install scripts

## Environment

| Field | Value |
|---|---|
| Machine / snapshot | _to be filled by ARC-00-S08_ |
| Claude Code | _`claude --version`; and `claude-2.1.214 --version` where the floor is exercised_ |
| Node | _`node --version`_ |
| git | _`git --version`_ |
| Shell | _zsh 5.9 / PowerShell 5.1 / cmd_ |
| Date | _YYYY-MM-DD_ |

## Procedure

**Check that retires it (from `03`):** Run it on a clean checkout on all three OSes; run the MCP handshake

```
_exact commands, in order — or point to run.sh / run.ps1 next to this file_
```

## Observed

_One block per OS. Paste real output, redacted per the rules above._

## Verdict

`S-15: NOT RUN` — to be replaced by `S-15: CONFIRMED` or `S-15: FAILED → fallback Pin `--workspace packages/snowarch` or install inside the package directory`

## Evidence

- _`logs/<file>` — what it is_
