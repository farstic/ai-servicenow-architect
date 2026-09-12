> **Redaction rules (ARC-00 STORIES.md conventions).** No instance URLs, usernames, passwords, tokens or
> `~/.claude.json` contents appear in a spike record — **key names only, values as `set (len n)`**.
> Paths are `~`-relative. Screenshots are cropped to the dialog.
> A spike that runs on several operating systems carries **one *Observed* block per OS and one verdict line**.

# S-01 — Pre-seeded MCP approval via `.claude/settings.local.json`

**Run by:** ARC-00-S04 · **Verdict consumed by:** ARC-06-S01/S05/S09/S13 (dialog count, toggles)

**Status: CONFIRMED on 2.1.258 — all three variants observed, negative control included. The 2.1.214 row
stays pending.** The `disabledMcpjsonServers` half was already CONFIRMED on both versions
non-interactively.

## Assumption

> `.claude/settings.local.json` containing `{"enabledMcpjsonServers":["servicenow"]}` (live) or `{"disabledMcpjsonServers":["servicenow"]}` (design-only), written by the bootstrap **before** the first `claude`, suppresses the per-server approval prompt once the workspace-trust dialog is accepted

**Impact if false:** H (one extra click) · **Evidence so far (from `03`):** `docs:mcp` (fetched 2026-09-04): "Claude Code also applies approvals from an untracked `.claude/settings.local.json`, but it runs git to check whether the file is tracked, and it runs that check only in a trusted folder. In a folder you've never trusted, Claude Code waits for the trust dialog before applying the file's approvals" (≥ 2.1.207) — so the expected count is exactly one dialog (trust); the file must stay untracked (gitignored)

## Environment

| Field | Value |
|---|---|
| Machine / snapshot | macOS **26.5.2** build **25F84**, arm64 — the owner's machine. "clean" is realised as the ARC-00-S01 recipe: **a brand-new clone path that Claude Code has never trusted**, created fresh for every run (architect ruling 2026-09-06). Trust and MCP approval are per-project, so a new path is a faithful reset. |
| Claude Code | **2.1.214** (`~/.local/bin/claude-2.1.214`, npm-pinned prefix) **and 2.1.258** (`~/.local/bin/claude` → `~/.npm-global`). Both exercised in every non-interactive step below. |
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

**Check that retires it (from `03`):** Fresh clone on macOS and Windows; run `./bootstrap.sh --mode live`; start `claude`; accept trust; count dialogs; confirm `claude mcp get servicenow` shows approved. Repeat with `--mode design` and confirm `claude mcp get servicenow` shows `✘ Rejected (see disabledMcpjsonServers in settings)` and `/mcp` shows the server disabled with no prompt.

`run.sh` next to this file prepares one run: fresh clone path → read-only `~/.claude.json` precheck →
toggle file → untracked check → the manual checklist. ARC-06's bootstrap step B07 will write the same
file; the spike writes it by hand, exactly as B07 will.

```sh
sh run.sh live | design | control          # CLAUDE_BIN=~/.local/bin/claude-2.1.214 to use the floor
```

## Observed

### macOS — non-interactive evidence (both versions, three variants)

Preconditions, every run: `grep -c "<path>" ~/.claude.json` → `0`;
`git status --porcelain .claude/settings.local.json` → empty;
`git check-ignore -v .claude/settings.local.json` → `.gitignore:1:.claude/settings.local.json`.
So the docs' "untracked" condition holds.

| Variant | toggle file | `claude mcp get servicenow` → Status | `servicenow` in `claude mcp list` | our stub processes |
|---|---|---|---|---|
| **live** | `{"enabledMcpjsonServers":["servicenow"]}` | `⏸ Pending approval (run \`claude\` to approve)` | present, same status | 0 |
| **design** | `{"disabledMcpjsonServers":["servicenow"]}` | `✘ Rejected (see disabledMcpjsonServers in settings)` | **absent — 0 matching rows** | 0 |
| **control** | *(none)* | `⏸ Pending approval (run \`claude\` to approve)` | present, same status | 0 |

**Identical on 2.1.214 and 2.1.258, character for character, in all three variants.**

Full output, design variant, 2.1.258:

```
$ claude mcp get servicenow
servicenow:
  Scope: Project config (shared via .mcp.json)
  Status: ✘ Rejected (see disabledMcpjsonServers in settings)
  Type: stdio
  Command: node
  Args: ${CLAUDE_PROJECT_DIR:-.}/spikes/stub-server/server.mjs
  Environment:
    SNOW_STORE=${SNOW_STORE:-}
    STUB_CONFIGURED=${STUB_CONFIGURED:-0}
    STUB_STARTUP_DELAY_MS=${STUB_STARTUP_DELAY_MS:-0}
  Timeout: 600000ms

To remove this server, run: claude mcp remove servicenow -s project
```

**Two findings from the table above.**

1. **`disabledMcpjsonServers` is honoured *before* the folder is trusted.** The rejection status appears
   in an untrusted folder on both versions, and the string is exactly the one `03` S-01 predicted. The
   server is also omitted from `claude mcp list` entirely and no stub process is ever spawned.
2. **`enabledMcpjsonServers` is *not* honoured before trust** — the live variant's status is
   byte-identical to the control's, which has no toggle file at all. This is exactly what the `docs:mcp`
   quote in `03` describes ("in a folder you've never trusted, Claude Code waits for the trust dialog
   before applying the file's approvals"), and it is *why* the dialog count cannot be established without
   accepting trust. The asymmetry is defensible — a rejection is safe to apply early, an approval is not —
   and it is worth stating in the record because the two halves of this spike have different evidence
   levels.

**Process measurement — and a correction.** The first pass counted with `ps ax | grep -c '[s]erver\.mjs'`
and reported `1` in every variant. That was a **false positive**: an unrelated application's process matched
the loose pattern. With the precise pattern `spikes/stub-server/server\.mjs` the count is **0** in every
variant, sampled once per second across a whole `claude mcp list` call. Recorded because the loose pattern
is an easy mistake for whoever repeats this on Windows.

### Ubuntu

`NOT RUN — awaiting the owner's `claude` login in `arc00-ubuntu`.`

### Windows

`DEFERRED — Windows VM pending (owner input #2).`

### Owner sitting, 2026-09-07 — the `live` variant, Claude Code 2.1.258 *(source: owner sitting 2026-09-07, relayed by the architect)*

| Observation | Value |
|---|---|
| Dialogs at first `claude` in a never-trusted clone | **1** |
| Which dialog | the workspace-trust modal — *"Do you trust the files in this folder? / Accessing workspace… / Yes, proceed"* |
| Per-server MCP approval dialog | **not shown** |
| `/mcp` after trust | server **connected**, **5 tools** (set A — unconfigured, matching S-17) |
| First MCP tool call (`snow_core_capabilities_read`, manual mode) | ran, `stub: snow_core_capabilities_read ok`, **no prompt** |

**Interpretation, recorded as such and not as a finding:** consistent with the `docs:mcp` quote in the
Assumption — a pre-seeded `enabledMcpjsonServers` in an untracked `settings.local.json` is applied **at
trust time, not before it**, so accepting trust is the only gate and the server is enabled by the time the
session is usable.

**Why this does not yet close the spike.** One observation of "1 dialog" is compatible with two different
worlds: the pre-seed suppressed a prompt that would otherwise appear, or no per-server prompt exists on
this version at all. Only the **`control` variant** — the same clone with no pre-seeded file — separates
them, and it is expected to show **2**. The verdict stays PARTIAL until that number is in hand. Recording
a CONFIRMED here on the strength of the positive case alone is exactly the error the negative controls in
this spike set exist to prevent.

### Owner sitting, 2026-09-07 — the `design` variant *(source: owner sitting 2026-09-07, relayed by the architect)*

| Observation | Value |
|---|---|
| Trust dialog | shown (verbatim text recorded in S-16, including the pre-approved-permissions warning) |
| Per-server MCP approval dialog | **not shown** — count consistent with the `live` variant |
| `/mcp` under `disabledMcpjsonServers` | **`servicenow` is ABSENT from the panel entirely** — 10 servers listed, **no "Project MCPs" section at all** |

**Correction to this spike's own expectation text.** The procedure predicted the server would appear
**disabled**. It does not appear at all. "Absent" and "disabled" are different observable states and the
record now says **absent**; the sitting's wording was wrong and is corrected rather than reinterpreted.

**Why this matters beyond vocabulary:** a user in design-only mode has no in-panel affordance telling them
a ServiceNow server exists and is switched off — there is nothing to click, and nothing to explain the
absence. ARC-06's design-only guidance cannot say "you'll see it listed as disabled"; if the product wants
that reassurance it has to come from `snowarch doctor`, not from `/mcp`.

### Owner sitting, 2026-09-07 — the `control` variant, and the count that closes the spike *(source: owner sitting 2026-09-07, relayed by the architect)*

The negative control this spike needed. Same never-trusted clone, **no** pre-seeded
`settings.local.json` — and the per-server approval dialog **does exist**, verbatim:

> **New MCP server found in this project: servicenow** · MCP servers may execute code or access system
> resources. All tool calls require approval. Learn more in the MCP documentation. ·
> Use this MCP server / Use this and all future MCP servers in this project /
> ❯ **Continue without using this MCP server** · Enter to confirm · Esc to cancel

with **"Continue without using this MCP server" as the highlighted default**, and the trust dialog
preceding it.

| Variant | Pre-seeded file | Dialogs | Which |
|---|---|---|---|
| `live` | `{"enabledMcpjsonServers":["servicenow"]}` | **1** | trust only |
| `design` | `{"disabledMcpjsonServers":["servicenow"]}` | **1** | trust only — server **absent** from `/mcp` |
| **`control`** | **none** | **2** | trust **+ per-server approval** |

**This is what makes the count evidence.** The 1 in the `live` variant now means something: the prompt it
suppressed demonstrably exists on this version. Without this row the earlier reading was unfalsifiable,
which is why the verdict was held.

**Two consequences worth stating.** First, the default on that dialog is *"Continue without using this MCP
server"* — a user who presses Enter on reflex ends up with the server **switched off**, and nothing later
in the session explains why the tools are missing. The pre-seed is therefore not a convenience; it removes
the most likely way for a first-run user to silently break their own install. Second, INSTALL.md needs the
fallback sentence, because the pre-seed can be absent for reasons outside the product's control (a
`settings.local.json` that was never written, or a clone the user made by hand): *"If you see 'New MCP
server found in this project: servicenow', choose 'Use this MCP server' — the highlighted default is
'Continue without', which leaves it switched off."*

**Provenance note, kept deliberately.** The count of 2 is the owner's own observation relayed by the
architect, not a measurement I took. It is consistent with the two variants above and with the `docs:mcp`
quote in the Assumption; a later re-count that contradicted it would reopen this verdict.

### Why the dialog count is not here

The story's own test strategy says it: *"Manual, interactive (dialogs cannot be scripted)."* Counting
modals needs a human at a TTY, and accepting the workspace-trust dialog is what causes Claude Code to
write `hasTrustDialogAccepted` into `~/.claude.json` — the file this spike is forbidden to touch and that
`03` §D says the design deliberately never writes. Driving the dialog through a pseudo-terminal was
rejected for the same reason: it would make the trust decision on the owner's behalf.

**What the owner (or the architect at a terminal) needs to run** — about ten minutes, three variants ×
two versions:

```sh
cd ~/work/snowarch-spikes
sh spikes/S-01-preseeded-approval/run.sh live      # then follow the printed checklist
sh spikes/S-01-preseeded-approval/run.sh design
sh spikes/S-01-preseeded-approval/run.sh control
CLAUDE_BIN=~/.local/bin/claude-2.1.214 sh spikes/S-01-preseeded-approval/run.sh live   # repeat on the floor
```

The checklist the script prints asks for exactly the numbers the acceptance criteria need: the modal count
per variant, the `/mcp` panel, the S-16 prompt counts and the S-17 tool list.

## Verdict

`S-01: CONFIRMED **on 2.1.258** — a pre-seeded `enabledMcpjsonServers` removes the per-server approval, and the count is what makes it evidence: `live` 1 dialog (workspace trust only; `/mcp` connected, 5 tools), `design` 1 (trust only, the server absent from `/mcp` rather than disabled), no-pre-seed control 2 — the second being the verbatim "New MCP server found in this project" prompt whose highlighted default is "Continue without using this MCP server". The pre-seed is ignored before trust and applied at trust time; **2.1.214 not measured**`

The `disabledMcpjsonServers` (design-only) mechanism is **confirmed on macOS on both 2.1.214 and 2.1.258,
on the non-interactive CLI surface only**: the `✘ Rejected (see disabledMcpjsonServers in settings)` status
— the exact string `03` expects — and omission from `claude mcp list`. Both of those **discriminate against
the control**, which is what makes them evidence.

**"Server never started" is not evidence here.** The stub-process count is `0` in the live and control
variants too, because a pending-approval server is not started either; the reading carries no
discriminating information and is recorded as background, not as a confirming observation.

**Not observed.** `03` S-01's design check has a second conjunct — "`/mcp` shows the server disabled with
no prompt" — and this story's acceptance criterion 2 requires "no MCP approval dialog appears". Both are
interactive and ride on the same run as the dialog count; neither was exercised.
The `enabledMcpjsonServers` (live) mechanism — and with it the **dialog count that ARC-06 promises the
user** — is **not proven**: it cannot be evaluated before the trust dialog is accepted, and accepting it
is a human action. No fallback is adopted; the ARC-00 README's acceptance criterion for this spike
("the exact number of dialogs … on macOS **and** Windows") remains open.

## Evidence

- `run.sh` — the preparation script; `~/spike-runs/S-01-{live,design,control}-<stamp>/` — the three prepared paths.
- Screenshots: none yet — they are produced by the interactive run.

---

### Incidental — from the ARC-00-S01 login probe, **not** the spike run

Observed on the Ubuntu VM (`arc00-ubuntu`, Claude Code 2.1.263) in an untrusted checkout of this
repository, while ARC-00-S01 was probing the VM's authentication state. Recorded so this spike starts from
it; it is **not** a verdict.

```
$ claude -p "reply with the two words: spike ready"
Ignoring 4 permissions.allow entries from .claude/settings.json: this workspace has not been trusted.
Run Claude Code interactively here once and accept the trust dialog, or set
projects["/home/ubuntu/snowarch-spikes"].hasTrustDialogAccepted: true in /home/ubuntu/.claude.json.
Not logged in · Please run /login
```

The CLI names `projects[<path>].hasTrustDialogAccepted` in `~/.claude.json` as an alternative to the trust
dialog — **seen in CLI output, deliberately not used per `03` §D** ("`hasTrustDialogAccepted` … as a way to
skip the trust dialog — deliberately not used (it would edit `~/.claude.json`)"). The dialog count must be
measured with the dialog actually accepted, never by writing that key.
