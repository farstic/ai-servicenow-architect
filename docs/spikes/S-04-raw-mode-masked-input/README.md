> **Redaction rules (ARC-00 STORIES.md conventions).** No instance URLs, usernames, passwords, tokens or
> `~/.claude.json` contents appear in a spike record — **key names only, values as `set (len n)`**.
> Paths are not secrets and may be printed verbatim. Screenshots are cropped to the dialog.
> A spike that runs on several operating systems carries **one *Observed* block per OS and one verdict line**.

# S-04 — setRawMode masked input in Windows consoles

**Run by:** ARC-00-S07 · **Verdict consumed by:** ARC-07-S01 (masked input); Q-B

**Status: NOT RUN** — record created by ARC-00-S01 with the *Assumption* pre-filled; ARC-00-S07 fills in Environment, Procedure, Observed and Verdict.

## Assumption

> `process.stdin.setRawMode` masked input works in Windows Terminal and conhost under PowerShell 5.1 and cmd

**Impact if false:** M · **Evidence so far (from `03`):** Node docs: TTY raw mode is supported on Windows consoles

## Environment

| Field | Value |
|---|---|
| Machine / snapshot | _to be filled by ARC-00-S07_ |
| Claude Code | _`claude --version`; and `claude-2.1.214 --version` where the floor is exercised_ |
| Node | _`node --version`_ |
| git | _`git --version`_ |
| Shell | _zsh 5.9 / PowerShell 5.1 / cmd_ |
| Date | _YYYY-MM-DD_ |

## Procedure

**Check that retires it (from `03`):** Run `./snowarch instance add` on the Windows VM; verify no echo, backspace handling, Ctrl-C

```
_exact commands, in order — or point to run.sh / run.ps1 next to this file_
```

## Observed

_One block per OS. Paste real output, redacted per the rules above._

## Verdict

`S-04: NOT RUN — **blocked on the Windows VM (owner input #2)**. The fallback if it fails is `--password-stdin`, and later the `--web` one-shot form`

## Evidence

- _`logs/<file>` — what it is_
