> **Redaction rules (ARC-00 STORIES.md conventions).** No instance URLs, usernames, passwords, tokens or
> `~/.claude.json` contents appear in a spike record — **key names only, values as `set (len n)`**.
> Paths are `~`-relative. Screenshots are cropped to the dialog.
> A spike that runs on several operating systems carries **one *Observed* block per OS and one verdict line**.

# S-17 — Unconfigured server accepted as connected

**Run by:** ARC-00-S04 · **Verdict consumed by:** ARC-04-S04 / ARC-06-S08

**Status: CONFIRMED on 2.1.258 — both `/mcp` readings observed, positive and negative. A `✔ connected`
reading is meaningful; a failure is visible but **undiagnosed**, which is the finding that matters.**

## Assumption

> A stdio server that starts with **zero** instances and advertises five tools (`snow_core_instances_index`, `snow_core_instances_reload`, `snow_core_current_instance_read`, `snow_core_capabilities_read`, `snow_core_status_read` — `01` §9, ARC-04-S04) is accepted by Claude Code as "connected" and shows no error in `/mcp`

**Impact if false:** M · **Evidence so far (from `03`):** Nothing contrary in `docs:mcp`; a placeholder-URL start already advertises tools today

**Note.** The stub advertises **five** tools in set A, matching the `03` §A S-17 row quoted above, which
lists all five by name. The count observed here is **five**. The ARC-00-S01 design note that once read
"`03` S-17 still says *four* because it predates `snow_core_status_read`" **was already corrected by the
architect** in `b1097b7` and now reads "`03` S-17 lists all five by name" — nothing outstanding there.
The same error does survive in **this** story's own text: ARC-00-S04's *Scope* still says "`03` S-17 says
\"four\" — the record notes the discrepancy and the count observed". `03` §A S-17 reads "advertises five
tools" and names all five, `snow_core_status_read` included, so there is no discrepancy to note. Flagged
to the architect.

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

**Check that retires it (from `03`):** Start the ARC-04 server unconfigured under Claude Code; check `/mcp` and `claude mcp list`.

1. `STUB_CONFIGURED` unset — the stub is in unconfigured mode.
2. In a trusted session: `/mcp` → expect `servicenow ✔ connected` with five tools listed.
3. Ask Claude to call `snow_core_capabilities_read` — the allow-list entry means no prompt.
4. Negative control: `STUB_EXIT_ON_START=1` → `/mcp` must show a failure, proving the check can fail.

## Observed

### macOS — non-interactive evidence

The tool advertisement, from a fresh clone with `STUB_CONFIGURED` unset:

```
$ printf '%s\n%s\n' \
   '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"t","version":"0"}}}' \
   '{"jsonrpc":"2.0","id":2,"method":"tools/list"}' | node spikes/stub-server/server.mjs
{"jsonrpc":"2.0","id":1,"result":{"protocolVersion":"2025-06-18","capabilities":{"tools":{"listChanged":true}},"serverInfo":{"name":"servicenow-stub","version":"0.0.0"}}}
{"jsonrpc":"2.0","id":2,"result":{"tools":[{"name":"snow_core_instances_index",…},{"name":"snow_core_instances_reload",…},{"name":"snow_core_current_instance_read",…},{"name":"snow_core_capabilities_read",…},{"name":"snow_core_status_read",…}]}}
```

Real stdout of the command shown. Line 2 is elided at each tool's `description`/`inputSchema` (marked `…`)
purely for width; the five names are verbatim and in order — exactly the five of `01` §9 and the ARC-04
README. The unelided line is reproduced in full in `spikes/README.md` §3.1.

The negative control behaves as designed:

```
$ printf '%s\n' \
   '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"t","version":"0"}}}' \
  | STUB_EXIT_ON_START=1 node spikes/stub-server/server.mjs
(exit code 1; no stdout above)
```

Real output of the command shown; the parenthetical is the shell reporting `$?` — the command itself
prints nothing, which is the point.

`claude mcp get servicenow` and `claude mcp list` in an untrusted folder both report
`⏸ Pending approval (run \`claude\` to approve)` and **do not start the server** — sampled once a second
across a full `mcp list` call, our stub process count stayed at 0. So the CLI cannot report "connected"
before trust, and the `/mcp` half of this spike is only observable inside a session.

### Owner sitting, 2026-09-07 — both `/mcp` readings, Claude Code 2.1.258, manual mode *(source: owner sitting 2026-09-07, relayed by the architect)*

**Positive (`control` variant, after choosing "Use this MCP server"):**

> `servicenow` · **✔ connected** · **5 tools** — under a **Project MCPs** section, with the `.mcp.json`
> path shown

Five tools is set A, the unconfigured advertisement, so the panel and the stub agree: the server is
accepted as connected **while unconfigured**. That is the question this spike asks, and the answer is yes.

**Negative control (`STUB_EXIT_ON_START=1`):**

> `servicenow` · **✘ failed** · panel footer: *"※ Run `claude --debug` to see error logs"*
> Detail view: *"Status: ✘ failed · Command: `node` · Args: `./spikes/stub-server/server.mjs` ·
> Config location: `<path>/.mcp.json` · 1. Reconnect / 2. Disable"*
> — **no error text at all.**

**So the `✔` is meaningful and the `✘` is not diagnostic.** The panel tells the user *that* the server
failed and gives them two buttons, but nothing about *why*: no exit code, no stderr excerpt, no
distinction between a crash, a bad command path, and a timeout (S-06 confirms the timeout case renders
**byte-identically**). The one lead it offers is *"Run `claude --debug`"*.

**The `/mcp` panel is not the only channel, and this record's first version got that wrong.** A typed
failure notice **is** injected into the session context — `servicenow (CONNECTION_CLOSED): "Connection
closed"` for this crash control, `(CONNECT_TIMEOUT)` with the exceeded budget for S-06's timeout, and
`(ENOENT): "Executable not found in $PATH: node"` when the interpreter is missing (measured on the Ubuntu
VM under S-05). See S-06's *"Correction — the failure is diagnosed"* section. So the platform does know
why; the **panel** is the surface that does not say. That narrows the defect rather than removing it: a
user reading `/mcp` still cannot tell a timeout from a crash.

**A caveat I am flagging rather than resolving.** Headlessly I measured that `claude -p --debug` produces
**no** relevant stderr — stderr stayed at exactly 157 bytes and a grep for `servicenow|timeout|failed|error`
returned nothing (S-06). That is **`-p --debug`, not an interactive `claude --debug`**, and the two may
well differ; the panel's advice has not been falsified. But it has not been verified either, and it is the
only remedy the product's own UI offers a stuck user. **Worth two minutes in the next sitting**: run
`claude --debug` interactively against the crashing stub and record whether the error is actually there.

**Consequence for ARC-04/ARC-06.** `snowarch doctor` cannot rely on `/mcp` to explain a failure to the
user, because `/mcp` does not explain it. The doctor performs the handshake itself and prints the cause.

### Ubuntu

`NOT RUN — awaiting the owner's `claude` login in `arc00-ubuntu`` (the handshake itself was re-run there
during ARC-00-S01 and returned the same five tools on Node v22.23.2).

### Windows

`DEFERRED — Windows VM pending (owner input #2).`

## Verdict

`S-17: NOT PROVEN — the five-tool unconfigured advertisement is confirmed and the stub exits 1 writing nothing under STUB_EXIT_ON_START=1; the two /mcp readings — "accepted as connected" and the control's failure — need one interactive run`

The half this spike shares with the stub — five tools in unconfigured mode, and a stub that genuinely
refuses to start under `STUB_EXIT_ON_START=1` — is confirmed on macOS on Node 24 and reproduced on Ubuntu
on Node 22. **The control this spike's own Procedure step 4 defines is a `/mcp` reading** ("`/mcp` must
show a failure"), and that was not observed; what is confirmed is the process-level precondition for it.
Whether Claude Code shows the healthy server as `✔ connected` with no error in `/mcp` is likewise not
established. The interactive run owes both readings; `run.sh`'s checklist step 5b now asks for the
control explicitly. ARC-04's fallback (advertise the
status tool only) is **not** adopted: nothing observed argues for it, and choosing it is ARC-04's call.

## Evidence

- `spikes/stub-server/server.mjs` — set A is the five tools; `STUB_EXIT_ON_START=1` is the control.
- `spikes/stub-server/selftest.mjs` — asserts both, and runs on three OSes × Node 20/22/24 in CI.
