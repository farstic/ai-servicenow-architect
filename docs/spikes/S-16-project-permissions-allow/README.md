> **Redaction rules (ARC-00 STORIES.md conventions).** No instance URLs, usernames, passwords, tokens or
> `~/.claude.json` contents appear in a spike record — **key names only, values as `set (len n)`**.
> Paths are `~`-relative. Screenshots are cropped to the dialog.
> A spike that runs on several operating systems carries **one *Observed* block per OS and one verdict line**.

# S-16 — Committed `permissions.allow` honoured right after trust

**Run by:** ARC-00-S04 · **Verdict consumed by:** ARC-02-S11 / ARC-07-S09

**Status: ANSWERED on 2.1.258.** `permissions.allow` **is** honoured, and the committed list is read
aloud to the user in the trust modal — but **Bash allow rules are unreliable for the product's own
commands**, because Claude wraps them non-deterministically and each wrapper segment is a separate gate.
Consumed by the architect's ruling that the in-session status/doctor path becomes an MCP tool call.

## Assumption

> `permissions.allow` entries such as `Bash(./snowarch doctor*)` in the committed `.claude/settings.json` are honoured right after trust so `/snowarch setup-instance` runs the doctor without prompts

**Impact if false:** L · **Evidence so far (from `03`):** `docs:settings`: shared project settings apply after trust

## Environment

| Field | Value |
|---|---|
| Machine / snapshot | macOS **26.5.2** build **25F84**, arm64 — the owner's machine. "clean" is realised as the ARC-00-S01 recipe: **a brand-new clone path that Claude Code has never trusted**, created fresh for every run (architect ruling 2026-09-06). Trust and MCP approval are per-project, so a new path is a faithful reset. |
| Claude Code | **2.1.214** (`~/.local/bin/claude-2.1.214`, npm-pinned prefix) **and 2.1.258** (`~/.local/bin/claude` → `~/.npm-global`). Both are named here because the story's acceptance criterion 6 asks the *Environment* to name them; **neither binary was run for this spike** — nothing about `permissions.allow` is observable outside a session. |
| Node | v24.16.0 · **git** 2.39.5 · **Shell** zsh 5.9 |
| Ubuntu | `NOT RUN — awaiting the owner's `claude` login in `arc00-ubuntu`` |
| Windows | `DEFERRED — Windows VM pending (owner input #2)` |
| Date | 2026-09-06 |

**Reset method (recorded because the story asks for it).** `claude mcp reset-project-choices` resets only
the MCP approval, not the folder's trust record, which lives in `~/.claude.json`. A brand-new path avoids
both. `spikes/S-01-preseeded-approval/run.sh` creates one per run and refuses to continue unless the
read-only precheck `grep -c "<path>" ~/.claude.json` returns `0`. **The spike never edits the project entry or the trust record in `~/.claude.json`** — `run.sh` only
greps it, read-only, and no spike path acquired a `projects[]` entry (`grep -c "<path>" ~/.claude.json`
→ `0` for all three, after every probe).

**One measured caveat: the CLI probes are not inert.** `claude mcp get` / `claude mcp list` rewrite
exactly one top-level key — `migrationVersion`. Measured on this machine: the file is byte-stable while
idle; **2.1.214 writes `13`, 2.1.258 writes `14`**, and because the *Environment* exercises both
binaries, every switch between them flips the value. A repeat probe on the *same* binary changes
nothing (sha unchanged). No other key moved, and nothing under `projects` was touched. The probes were
left with the value the current release writes. This is a real finding for the programme, not just a
correction to this record — see `spikes/README.md` §4.

## Procedure

**Check that retires it (from `03`):** Invoke `/snowarch setup-instance` in a fresh trusted checkout; count prompts.

In the trusted clone from S-01 step 3, in the same session:

1. Ask Claude to run `./snowarch doctor --json` — allowed by `Bash(./snowarch doctor*)`. Expect **0** prompts.
2. Ask Claude to run `./snowarch version` — not allow-listed. Expect **1** prompt.
3. Record whether the **very first** Bash call after trust prompts — that is the actual `03` question
   ("honoured *immediately* after trust"), and it is the one an automated check cannot answer.

## Observed

### macOS

`NOT RUN.` Both steps require a Claude Code session and a permission decision at a TTY. Nothing about this
spike is observable from the CLI: `claude mcp`/`claude --version` do not evaluate `permissions.allow`, and
`claude -p` in an untrusted folder ignores the block entirely (see the incidental observation below), which
is the opposite of the condition under test.

What **is** established here, so the interactive run starts from a known state: the committed
`.claude/settings.json` in this repository carries exactly four `allow` entries —
`Bash(./snowarch doctor*)`, `mcp__servicenow__snow_core_capabilities_read`,
`mcp__servicenow__snow_core_instances_reload`, `mcp__servicenow__snow_*_read` — and one `ask` entry,
`mcp__servicenow__snow_core_record_add`. The stub launcher answers `./snowarch doctor --json` with
`{"doctor":"stub","ok":true}` and echoes its argv for anything else, so both the allowed and the control
command are ready.

### Ubuntu

`NOT RUN — awaiting the owner's `claude` login in `arc00-ubuntu`.`

### Windows

`DEFERRED — Windows VM pending (owner input #2)` (the story wants the `gitbash` snapshot for this spike,
because the doctor is invoked through Claude's own Bash tool).

## Verdict

`S-16: NOT RUN — interactive; runs in the same session as S-01`

Nothing in this record moves the `03` S-16 assumption in either direction. The open question is the narrow
one Procedure step 3 names — whether `permissions.allow` is honoured on the **very first** Bash call
*immediately* after trust — and it cannot be answered without a human at a TTY. The pre-recorded `03`
fallback ("The skill declares the same commands in its `allowed-tools` — turn-scoped, not trust-gated,
`docs:skills`") is therefore **neither adopted nor retired: it remains available and unexercised**, and
ARC-02-S11 / ARC-07-S09 must keep branching on it until the interactive run reports. The one thing this
record does establish is the *negative* precondition, from the ARC-00-S01 login probe below: before trust,
the allow block is not in force at all, so a "0 prompts" reading from an untrusted folder would prove
nothing.

## Evidence

- `.claude/settings.json` in this repository — the allow/ask blocks under test.
- `spikes/S-01-preseeded-approval/run.sh` — prepares the trusted clone; its checklist step 4 is this spike.

---

### The compound-command form — `Bash(./snowarch doctor*)` does NOT cover what Claude actually runs

Measured headlessly on 2.1.258 with `--settings` carrying **only** `Bash(./snowarch doctor*)`, asking for
the exact compound form the owner saw in the sitting:

```
requested: ./snowarch doctor --json 2>&1; echo "EXIT: $?"
Claude:    "So I ran only the first part, ./snowarch doctor --json 2>&1 … the EXIT: line is missing …
            I didn't retry the blocked compound form. If you approve `echo` (or the compound pattern),
            I'll re-run it exactly as written."
```

So the allow rule matches the **first segment only**; the `echo` segment is evaluated as its own command
and needs its own rule. This is corroborated from the owner's own screen *(source: owner sitting 2026-09-07, relayed by the architect)*: the permission dialog for
`./snowarch version` offered *"don't ask again for `./snowarch version` **and** `echo \"EXIT: $?\"` commands"*
— **two** commands, i.e. the compound is split into segments each needing approval.

### The wrapper is **non-deterministic** — which kills the "just allow the wrapper too" fix

Two sittings, same command, **two different wrappers** *(source: owner sitting 2026-09-07, relayed by the architect)*:

| Session | What Claude actually ran | Option 2 offered to remember |
|---|---|---|
| `live`, 2.1.258 | `./snowarch version 2>&1; echo "EXIT: $?"` | `./snowarch version` **and** `echo "EXIT: $?"` |
| `design`, 2.1.258 | `./snowarch doctor --json > <scratch>/doctor.json 2><scratch>/doctor.err; echo "exit=$?"; wc -c <scratch>/doctor.json <scratch>/doctor.err` | `echo "exit=$?"` only |

Different redirections, different `echo` text (`EXIT:` vs `exit=`), and a third segment (`wc -c`) in one
of them. **My earlier proposal — put the exact wrapper entry in the generated `allow` — cannot work**, and
this record retracts it: there is no exact wrapper to enumerate. The `doctor`/`version` segment matched
the rule both times; every wrapper segment was a fresh gate.

**Architect ruling of 2026-09-07, consumed by ARC-05 and ARC-08:** *Bash allow rules are unreliable for
the product's own commands, because Claude wraps them non-deterministically.* Therefore the in-session
status/doctor path is **an MCP tool call, not a Bash call** — `/snowarch status` calls
`snow_core_status_read`, which is exactly allow-listable and proven prompt-free (T3 headless; the owner's
A4 step 2 in manual mode), and the doctor's in-session summary is exposed as an MCP tool by the server.
`./snowarch doctor` on the shell remains for humans and CI. Bash `allow` entries survive only for the
bootstrap's own launcher, documented as *"one approval the first time"*.

### The committed `permissions.allow` is shown to the user **at trust time**

The `design` variant's trust modal, verbatim *(source: owner sitting 2026-09-07, relayed by the architect)*:

> Accessing workspace: <path> · Quick safety check: Is this a project you created or one you trust? …
> Claude Code'll be able to read, edit, and execute files here. **⚠ This folder pre-approves 4 tool
> permissions in .claude/settings.json: `mcp__servicenow__snow_core_capabilities_read`,
> `mcp__servicenow__snow_core_instances_reload`, `mcp__servicenow__snow_*_read`, and
> `Bash(./snowarch doctor*)` These will apply without asking. Only proceed if you trust this
> configuration.** · Security guide · ❯ No, exit / Yes, I trust this folder

Two things follow, and both are load-bearing for ARC-06. First, **the middle-wildcard glob is rendered
literally** — `mcp__servicenow__snow_*_read` is shown to the user as written, so a three-glob `allow`
reads as three lines here rather than 205. Second, **whatever ARC-05 generates is read aloud to the user
at first launch**, so the file is user-facing copy, not just configuration: ARC-06's "what you will see"
text must quote this modal, and a bloated 269-entry `allow` would have been a wall of text at the one
moment the user is deciding whether to trust the folder. That is an independent argument for the glob
form, arrived at from the UI rather than from the count.

### From the owner's sitting, 2026-09-07 *(source: owner sitting 2026-09-07, relayed by the architect)*

- **The session started in `auto mode` on 2.1.258** (source of the default — owner setting or version
  default — not established; recorded as observed).
- In **auto mode**, `./snowarch doctor --json` ran ("Listed 1 directory, ran 1 shell command") **and**
  `./snowarch version` ran — **neither prompted**. Auto mode auto-approved both, so **S-16 cannot be read
  from an auto-mode session**: a "0 prompts" reading there says nothing about the allow rule.
- After switching to **default** mode, `./snowarch version` **prompted**, verbatim:

  > Bash command · Tip: auto mode handles these prompts for you — choose "switch to auto mode" below ·
  > `./snowarch version 2>&1; echo "EXIT: $?"` · Run snowarch version · This command requires approval ·
  > Do you want to proceed? ❯ 1. Yes · 2. Yes, and don't ask again for `./snowarch version` and
  > `echo "EXIT: $?"` commands in <path> · 3. Yes, and switch to auto mode · 4. No

**This changes how the spike must be run:** the allow-rule question is only meaningful in a mode that
does not auto-approve. The sitting's S-16 steps have to state the mode explicitly.

### Incidental — from the ARC-00-S01 login probe, **not** the spike run

Observed on the Ubuntu VM (`arc00-ubuntu`, Claude Code 2.1.263) in an **untrusted** checkout of this
repository. Recorded so this spike starts from it; it is **not** a verdict.

```
Ignoring 4 permissions.allow entries from .claude/settings.json: this workspace has not been trusted.
```

The four entries are exactly this repository's committed `permissions.allow` block. This is consistent with
the assumption's evidence line — shared project settings apply **after** trust — and it means the spike must
count prompts in a checkout where the trust dialog has been accepted; before that the allow block is not in
force at all, so a "0 prompts" reading from an untrusted folder would prove nothing.
