> **Redaction rules (ARC-00 STORIES.md conventions).** No instance URLs, usernames, passwords, tokens or
> `~/.claude.json` contents appear in a spike record — **key names only, values as `set (len n)`**.
> Paths are `~`-relative. Screenshots are cropped to the dialog.
> A spike that runs on several operating systems carries **one *Observed* block per OS and one verdict line**.

# S-03 — `${CLAUDE_PROJECT_DIR}` expansion on native Windows

**Run by:** ARC-00-S06 · **Verdict consumed by:** ARC-06-S11/S12 and ARC-09-S08 (Q-B)

**Status: `DEFERRED — Windows VM pending (owner input #2)`. The macOS control half is done and is
recorded here so the Windows run has something to compare against.**

## Assumption

> `${CLAUDE_PROJECT_DIR:-.}` expansion in `.mcp.json` `args` and exec-form `node` hooks with `${CLAUDE_PROJECT_DIR}` in `args` behave identically on native Windows (cmd / PowerShell, no Git Bash)

**Impact if false:** H · **Evidence so far (from `03`):** `docs:mcp` and `docs:hooks` describe both without platform caveats; exec form on Windows requires a real executable — `node.exe` is one

## Environment

| Field | Value |
|---|---|
| macOS | **26.5.2** build **25F84**, arm64 · Node v24.16.0 |
| Claude Code | **2.1.258** only for this sitting (S-21) · `migrationVersion` unchanged at 14 |
| "no-node" | the ARC-00-S01 recipe `spikes/recipes/no-node.sh` — strips every `PATH` entry containing a `node` executable and `exec`s, so descendants inherit it |
| Ubuntu VM · Windows VM | `NOT RUN — awaiting the owner's claude login` · `DEFERRED — Windows VM pending (owner input #2)` |
| Date | 2026-09-07 |

## Procedure

**Check that retires it (from `03`):** Windows 10/11 VM without Git Bash: run both flows; inspect the spawned server's env and the hook's stdout.

## Observed

### macOS control (step 5 of the story's procedure)

From the S-20 probe, which spawned the server through Claude Code and read its environment back:

```
argv: ["/usr/local/bin/node","~/work/snowarch-spikes/spikes/stub-server/server.mjs"]
CLAUDE_PROJECT_DIR: <the checkout path>
```

So on macOS: `${CLAUDE_PROJECT_DIR:-.}` in `.mcp.json` `args` resolves to an **absolute** path with
forward slashes, and `CLAUDE_PROJECT_DIR` is **set in the server's environment** to the checkout path.
Those are the two values the Windows run has to match in shape.

The hook side of the control is also in hand from ARC-00-S01: run directly with the variable set, the
hook prints `Mode: spike — hook ran; CLAUDE_PROJECT_DIR=<path>; cwd=<path>`, and with it unset it prints
`(unset)` — so the hook itself distinguishes the two cases unambiguously.

### Windows

`DEFERRED — Windows VM pending (owner input #2).` Nothing is inferred from the macOS control: the whole
point of the spike is that Windows path handling may differ, and Q-B ("native Windows first-class")
hangs on it. The story's six-step procedure — no-space path, space path, both shells, both Claude Code
versions, the `.cmd`-as-hook negative probe — is unchanged and unstarted.

## Verdict

`S-03: DEFERRED — Windows VM pending (owner input #2). macOS control recorded: .mcp.json args resolve to an absolute forward-slash path and CLAUDE_PROJECT_DIR is set in the server's environment; nothing is inferred about Windows from it.`

## Evidence

- The macOS control output is quoted in `spikes/S-20-shell-env-inheritance/README.md`, from the same probe.
