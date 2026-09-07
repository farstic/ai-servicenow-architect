> **Redaction rules (ARC-00 STORIES.md conventions).** No instance URLs, usernames, passwords, tokens or
> `~/.claude.json` contents appear in a spike record — **key names only, values as `set (len n)`**.
> Paths are `~`-relative. Screenshots are cropped to the dialog.
> A spike that runs on several operating systems carries **one *Observed* block per OS and one verdict line**.

# S-06 — `MCP_TIMEOUT` and the 394-tool cold start

**Run by:** ARC-00-S08 · **Verdict consumed by:** ARC-06-S01 (`MCP_TIMEOUT`), ARC-06-S08

**Status: CONFIRMED on 2.1.258 — both halves. `MCP_TIMEOUT` in a settings `env` block governs MCP
startup (headless 2x2), and the owner's interactive run supplies the UI reading: the failure is shown,
and it is **indistinguishable from a crash**.**

## Assumption

> `MCP_TIMEOUT` set through the committed `.claude/settings.json` `env` block governs the 394-tool server's startup on first launch; the cold start fits the value

**Impact if false:** M · **Evidence so far (from `03`):** `docs:settings-reference` `env`: timeout-class variables apply at startup from every settings file — strong evidence; cold-start time never measured

## Environment

| Field | Value |
|---|---|
| macOS | **26.5.2** build **25F84**, arm64 — Node v24.16.0, npm 11.13.0, git 2.39.5 |
| GitHub runners | `ubuntu-22.04`, `macos-latest`, `windows-latest` × Node 20 / 22 / 24 — nine cells, workflow `.github/workflows/spike-matrix.yml`, run `34046168899` on `8071d00`, **9/9 green** |
| Ubuntu VM | `NOT RUN — awaiting the owner's `claude` login in `arc00-ubuntu`` (this spike needs no Claude Code, but the VM row is the "slow laptop" sample and is taken in the same sitting) |
| Windows VM | `DEFERRED — Windows VM pending (owner input #2)` — the `windows-latest` runner covers the OS but not the "slow laptop" sample |
| Fixture source | `~/work/snow-mcp` at HEAD **`bb09bde`**, working tree, **read-only** |
| Date | 2026-09-06 |

**Fixture provenance, stated precisely.** `packages/snowarch/dist/` is copied byte-identical from
`snow-mcp/dist` (429 files, 4.2 MB, `diff -rq` clean). **`dist/` is not tracked in `snow-mcp`** —
`git ls-files dist` returns nothing — so the fixture copies an *untracked build output* of the working
tree at `bb09bde`, which is the same provenance gap `00` records for the published npm tarball. The
package manifest is `snow-mcp/package.json` with **only** `name` → `@farstic/snowarch`, `version` →
`2.0.0` and `bin` → `{ "snowarch": "dist/cli/index.js" }` changed; the 9 runtime dependencies and all 8
devDependencies are kept, so `--omit=dev` is meaningful. Nothing in `~/work/snow-mcp` was modified.

## Procedure

**Check that retires it (from `03`):** Measure `time node packages/snowarch/dist/server.js` to `initialize` on a slow laptop; start `claude` with a deliberately low value and confirm the failure, then with 120000.

Half one — the cold start, scriptable:

```sh
node spikes/S-06-cold-start/handshake.mjs \
     spikes/S-15-npm-ci/fixture/packages/snowarch/dist/server.js --repeat=3
```

`handshake.mjs` spawns the server with a **placeholder** environment — `SERVICENOW_INSTANCE_URL=https://example.invalid`,
no credentials, no capability flags — sends `initialize`, then `tools/list`, and reports both latencies
and the tool count.

**The placeholder is real, not nominal.** The first version of the probe inherited the whole parent
environment, which would have made the tool count and the latencies depend on whatever the operator's
shell exports — on the owner's machine, which has a live instance configured, a stray `SNOW_*` or
`MCP_TOOL_PACKAGE` could silently change the headline 394. It now passes only the variables a Node
process needs to run (`PATH`, `HOME`/`USERPROFILE`, `SystemRoot`, `TMPDIR`, `LANG`, `NODE_OPTIONS`,
`PATHEXT`, …) plus the placeholder URL; `--inherit-env` restores the old behaviour for anyone who wants
to measure their own shell deliberately. The nine CI cells were clean rooms either way, so their numbers
stand unchanged; the macOS local row was re-taken under the controlled environment and still reports
394 tools. The probe also now **fails** on a JSON-RPC error from `initialize` or `tools/list` (it
previously scored an error response as a successful handshake with `tools: null` and exit 0), requires
every `--repeat` run to succeed, and accepts `--expect-tools=394` to assert the count.

Half two — that the settings `env` path governs startup: set `STUB_STARTUP_DELAY_MS=5000` with
`MCP_TIMEOUT=2000` (expect a startup failure in `/mcp`, text recorded) and then `120000` (expect
connected). **Interactive.**

## Observed

### Cold start — nine CI cells, three runs each (`initialize` ms per run)

Both latencies are listed per machine (acceptance criterion 4). `tools/list` is the one that bounds a
client's time-to-usable, because it is the call that serialises all 394 tool schemas.

| Runner | Node | `initialize` (3 runs) | `tools/list` (3 runs) | worst gap | tools |
|---|---|---|---|---|---|
| ubuntu-22.04 | 20 | 249 / 212 / 209 | 254 / 216 / 214 | +5 | 394 |
| ubuntu-22.04 | 22 | 256 / 211 / 210 | 270 / 223 / 224 | +14 | 394 |
| ubuntu-22.04 | 24 | 509 / 435 / 513 | 531 / 457 / 534 | +22 | 394 |
| macos-latest | 20 | 361 / 365 / 394 | 376 / 382 / 401 | +17 | 394 |
| macos-latest | 22 | 161 / 142 / 153 | 168 / 149 / 160 | +7 | 394 |
| macos-latest | 24 | 204 / 184 / 191 | 214 / 191 / 199 | +10 | 394 |
| windows-latest | 20 | 667 / 620 / 558 | 679 / 629 / 568 | +12 | 394 |
| windows-latest | 22 | 673 / 311 / 323 | **750** / 317 / 328 | **+77** | 394 |
| windows-latest | 24 | **694** / 327 / 346 | 702 / 334 / 351 | +8 | 394 |

**Ubuntu VM `arc00-ubuntu`** (Node v22.23.2, logged-in `clean` snapshot, 2026-09-07), three runs: `initialize` 163 / 139 / 116 ms · `tools/list` 169 / 143 / 119 ms · **tools: 394**. Comfortably inside the envelope; it does not move the worst case.

macOS, local (Node 24.16.0), three runs: `initialize` 140 / 106 / 99 ms · `tools/list` 143 / 110 / 103 ms
· **tools: 394**. The server's own first stderr line, verbatim:

```
[INFO] ServiceNow MCP Toolkit server running on stdio [394 tools]
```

**394 tools on every one of the ten machines**, matching the parity guard `EXPECTED = 394` in
`snow-mcp/scripts/extract-tools.mjs`. No dynamic additions were observed. The placeholder-URL start logs
nothing but that one INFO line — it does **not** error, which is the behaviour `00` §4's "Startup gate"
row describes and which ARC-04's unconfigured mode later replaces.

**Slowest observed: `initialize` 694 ms** (windows-latest, Node 24, first run) and **`tools/list`
750 ms** (windows-latest, Node 22, first run) — 27 runs in total. The honest figure to size against is
the larger one: against the committed `MCP_TIMEOUT` of **120 000 ms**, 750 ms is **≈ 160× headroom**. A
laptop ten times slower than the slowest CI cell would still have ≈ 16× headroom.

The `initialize` → `tools/list` gap is 5–22 ms on eight of the nine cells and **77 ms** on the ninth
(windows-latest, Node 22, first run) — the cost of serialising 394 tool schemas, and small enough that
it does not change the sizing.

### The `MCP_TIMEOUT` half — CONFIRMED headlessly, 2026-09-07, Claude Code 2.1.258

`claude -p --mcp-config <f> --settings <f> --strict-mcp-config`, with the stub's
`STUB_STARTUP_DELAY_MS` knob delaying the `initialize` reply. A clean 2x2 — vary the timeout, vary the
server, and only the one cell that should fail fails:

| # | `env.MCP_TIMEOUT` (settings file) | server `initialize` delay | tool call | exit |
|---|---|---|---|---|
| A5a | **2000** | **5000 ms** | **UNAVAILABLE** — no tool result returned | **0** |
| A5b | 15000 | 5000 ms | ran — `stub: snow_core_capabilities_read ok` | 0 |
| A5c | 2000 | none (fast) | ran — `stub: snow_core_capabilities_read ok` | 0 |
| A5d | 15000 | server `exit(1)` before `initialize` | UNAVAILABLE — transport closed (S-17 control) | 0 |

**The verdict column is read from behaviour, not from what the model said.** "Ran" means the string
`stub: snow_core_capabilities_read ok` — which only the stub can produce — came back; "UNAVAILABLE" means
it did not. That distinction matters here more than usual, because the same runs show the narration is
unreliable (below), so no cell in this table is scored on the model's explanation of itself.

**A5b and A5c are the controls that make A5a evidence rather than coincidence**: the same slow server
connects when the budget is raised, and the same tight budget connects when the server is fast. So the
`env` block of a `--settings` file **is** read for `MCP_TIMEOUT` and **does** gate MCP startup. That is
the assumption this spike exists to test, and it holds.


### Correction — the failure **is** diagnosed, in one channel, and typed

An earlier version of this record (and the report built on it) said the platform surfaces *that* an MCP
server failed and never *why*. **That was wrong, and the error mattered**, because it argued the product
had to reconstruct a diagnosis it can simply read. Re-tested on 2.1.258 with a prompt that forbids
diagnosis and asks only for a verbatim quotation — *"Do not diagnose or speculate. Quote VERBATIM any MCP
server connection failure notice present in your context… If there is none, reply NONE."*

| Case | Notice injected into the session context |
|---|---|
| `MCP_TIMEOUT=2000`, server delays 5000 ms | `servicenow (CONNECT_TIMEOUT): "MCP server servicenow connection timed out after 2000ms"` |
| server `exit(1)` before `initialize` | `servicenow (CONNECTION_CLOSED): "Connection closed"` |
| `node` absent from `PATH` (Ubuntu VM) | `servicenow (ENOENT): "Executable not found in $PATH: node"` |
| healthy server | `NONE` |

The crash case also arrives with its own preamble: *"The following MCP servers are configured but failed
to connect — their tools (typically named `mcp__<server>__*`) are unavailable for this session:"*.

**So the diagnosis exists, it is typed (`CONNECT_TIMEOUT` / `CONNECTION_CLOSED` / `ENOENT`), and it even
carries the exact millisecond budget that was exceeded.** What is true is narrower and still consequential:
the notice appears **only in the model's context**. It is **not** on stderr, **not** in the exit code
(still `0`), and per the owner's sitting **not** in the `/mcp` detail view, whose timeout and crash panels
are byte-identical.

**What actually went wrong in the first test, and the product rule it yields.** The first probe asked the
model to *"say exactly why"*. It answered with the real cause **plus** fabricated ones — a genuine instance
hostname pulled from the operator's global `CLAUDE.md`, and *"confirm the PDI isn't hibernating"* — for a
stub with no instance and no network. Asked instead to **quote and not diagnose**, it returned the notice
exactly. The failure mode is not that the model has no information; it is that **an invitation to explain
produces embellishment on top of accurate data**. Hence the rule for ARC-06/ARC-08:

1. `snowarch doctor` performs its own handshake and classifies the failure itself — it must not depend on
   a channel only the model can see, and must not depend on the exit code, which is `0` on failure.
2. The generated engine rule file instructs Claude to **quote the MCP failure notice verbatim and add
   nothing** — no cause, no remedy it has not been given. The three type codes above are the vocabulary.

### Three things the headless route does NOT give — and A5 stays in the sitting because of them

1. **There is no error on stderr.** Every one of the five runs — successes and failures alike — produced
   an identical **157-byte** stderr consisting solely of the harness's own
   *"Warning: no stdin data received in 3s"* line. Nothing about the server, the timeout, or the failure.
2. **The exit code is `0` on failure.** A5a and A5d both failed to connect and both exited **0**. A CI
   check that shells out to `claude -p` and tests `$?` **would not notice a dead or timed-out MCP server.**
   That is a load-bearing finding for ARC-06's doctor design: *the exit code cannot be the failure signal.*
3. **`--debug` adds nothing.** Re-run of A5a with `--debug`: stderr still exactly 157 bytes, and
   `grep -inE 'servicenow|timeout|timed out|mcp server|failed|error'` over it returned **no lines**.

**So the only channel carrying the failure is the assistant's own prose — and that channel is not
trustworthy.** In A5a and A5d the narration reached outside the fixture entirely and asserted a cause from
unrelated context: it named a real ServiceNow instance hostname read from the operator's global
`CLAUDE.md` and offered *"confirm the PDI isn't hibernating"* as a fix. **The stub has no instance, no
credentials and no network.** The diagnosis was invented from ambient context and was wrong.

**Consequence for ARC-06-S01/S08, stated plainly:** the product must not rely on Claude narrating an MCP
startup failure. `snowarch doctor` has to detect and report it itself — the handshake result is the
signal, not the exit code and not the model's explanation.

### The interactive half, owner sitting 2026-09-07, 2.1.258, manual mode *(source: owner sitting 2026-09-07, relayed by the architect)*

`env.MCP_TIMEOUT` = `"2000"` in the committed `.claude/settings.json`, stub delayed 5000 ms:

> `/mcp` → `servicenow` · **✘ failed** — detail view **byte-identical to the crash case**
> (`STUB_EXIT_ON_START=1`, S-17): same fields, same two buttons, **no "timed out" wording anywhere.**

This closes the spike from the UI side and confirms the headless result independently: the settings `env`
block does govern startup, because setting it to 2000 against a 5000 ms server produces a failed server.

**The consequence is the finding, and it is now doubly evidenced.** The platform surfaces *that* the
server failed and never *why* — not headlessly (no stderr, exit 0, `--debug` silent) and not in the UI
(a failure panel identical for timeout and crash). **ARC-08's doctor must distinguish them itself**; it
can, because it performs the handshake and therefore holds the timing: a server that answers late is a
timeout, a server whose transport closes is a crash. Nothing in Claude Code will tell the user which.

### The `MCP_TIMEOUT` half — original interactive framing (now closed by the row above)

`NOT MET.` Proving that the `env` block in `.claude/settings.json` governs *startup* requires starting
Claude Code and reading `/mcp` — the same interactive constraint as ARC-00-S04, and in a folder whose
trust dialog has been accepted. The stub already carries the lever this test needs
(`STUB_STARTUP_DELAY_MS`), and `spikes/stub-server/selftest.mjs` proves the lever works
(`S-06 STUB_STARTUP_DELAY_MS=400 delays the reply (observed 435 ms)`), so only the Claude-Code-side
observation is outstanding. It should be taken in the same sitting as the S-01 / S-16 / S-17 runs.

### Windows VM

`DEFERRED — Windows VM pending (owner input #2)`. The Ubuntu VM row is above, taken 2026-09-07 once the
owner logged the VM in.

## Verdict

`S-06: NOT PROVEN — cold start measured over 27 runs on 9 CI cells: initialize 694 ms worst, tools/list 750 ms worst, 394 tools everywhere, so MCP_TIMEOUT=120000 keeps ≈160× headroom on the slower metric; that the settings env block governs startup is untested and needs one interactive run`

The number ARC-06 needs is in hand and it is not close: **120 000 ms is roughly 160 times the slowest
complete handshake observed** (`tools/list`, 750 ms), and the value would still hold with an order of
magnitude of margin on a much slower machine. Nothing argues for changing it. What is *not* established is the mechanism — that
`env.MCP_TIMEOUT` in the committed `.claude/settings.json` is what applies at server startup, rather
than only a shell-exported value. `03`'s evidence for that is documentary and strong; this spike does
not add to it.

## Evidence

- `spikes/S-06-cold-start/handshake.mjs` — the probe; `--json` for machine-readable output.
- `.github/workflows/spike-matrix.yml`, run `34046168899` on `8071d00` — the nine cells × three runs.
- `spikes/stub-server/selftest.mjs` — proves `STUB_STARTUP_DELAY_MS` works, which is the lever the
  interactive half will use.
