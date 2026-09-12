> **Redaction rules (ARC-00 STORIES.md conventions).** No instance URLs, usernames, passwords, tokens or
> `~/.claude.json` contents appear in a spike record — **key names only, values as `set (len n)`**.
> Paths are not secrets and may be printed verbatim. Screenshots are cropped to the dialog.
> A spike that runs on several operating systems carries **one *Observed* block per OS and one verdict line**.

# S-08 — bootstrap.cmd under Restricted and GPO-locked policies

**Run by:** ARC-00-S07 · **Verdict consumed by:** ARC-06-S11 (`bootstrap.cmd`), ARC-09-S08; Q-B

**Status: NOT RUN** — record created by ARC-00-S01 with the *Assumption* pre-filled; ARC-00-S07 fills in Environment, Procedure, Observed and Verdict.

## Assumption

> `bootstrap.cmd` running `powershell -ExecutionPolicy Bypass -File bootstrap.ps1` works under the default Restricted policy; behaviour under a GPO-locked policy

**Impact if false:** H (Windows first sitting) · **Evidence so far (from `03`):** Standard technique; per-process Bypass is documented by Microsoft; GPO "MachinePolicy" cannot be overridden

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

**Check that retires it (from `03`):** Test on default policy and on a GPO-locked VM

```
_exact commands, in order — or point to run.sh / run.ps1 next to this file_
```

## Observed

_One block per OS. Paste real output, redacted per the rules above._

## Verdict

`S-08: NOT RUN — **blocked on the Windows VM (owner input #2)**. The fallback if GPO-locked is to document the Git Bash path and ship a pure-batch minimal design-only path`

## Evidence

- _`logs/<file>` — what it is_
