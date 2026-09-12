# ARC-00 spike workspace — index, environment record and verdict register

Throwaway workspace for the ARC-00 spikes of the **AI ServiceNow Architect v3** programme.
**ARC-01** imports `spikes/` into `farstic/ai-servicenow-architect` as `docs/spikes/` and `docs/decisions/`
as-is (ARC-00 `STORIES.md` conventions). No ARC-01 story currently owns that import — see
`docs/decisions/README.md` §4.5. Built by **ARC-00-S01**; every later ARC-00 story fills in its own records.

> **Redaction rules (ARC-00 STORIES.md conventions).** No instance URLs, usernames, passwords, tokens or
> `~/.claude.json` contents appear anywhere in this repository — **key names only, values as `set (len n)`**.
> Paths are written `~`-relative. Screenshots are cropped to the dialog.

Names in force (D-01 / R-1 / R-2): repository `farstic/ai-servicenow-architect` · CLI `snowarch` ·
MCP server key `servicenow` (tools `mcp__servicenow__snow_*`) · npm `@farstic/snowarch` in
`packages/snowarch` · first release `2.0.0` · project skill `/snowarch`.
The existing npm record `@farstic/snow-mcp@1.0.0` is never touched.

---

## 1. What is in here

| Path | What it is |
|---|---|
| `.mcp.json` | Project-scope registration of key `servicenow` → the stub server; mirrors `01` §5 with the stub in place of `packages/snowarch/dist/server.js`. |
| `.claude/settings.json` | `env.MCP_TIMEOUT`, the exec-form `node` SessionStart hook, and the `permissions` `allow` / `ask` blocks that S-12, S-16 and S-18 exercise. |
| `CLAUDE.md` | One line, so a session in this folder proves it loaded the file. |
| `snowarch`, `snowarch.cmd` | Stub launchers. `./snowarch doctor --json` → `{"doctor":"stub","ok":true}`; anything else echoes its argv. |
| `spikes/stub-server/server.mjs` | Zero-dependency MCP stdio stub (below). |
| `spikes/stub-server/selftest.mjs` | 21 assertions over the stub; the CI workflow runs it on 3 OSes × Node 20/22/24. |
| `spikes/hooks/session-start.mjs` | Exec-form SessionStart hook; prints whether it ran and whether `${CLAUDE_PROJECT_DIR}` was substituted. |
| `spikes/TEMPLATE.md` | The spike-record template — six fixed sections and the one-line verdict format. |
| `spikes/S-NN-<slug>/README.md` | One record per spike, *Assumption* pre-filled verbatim from `03-RISKS-AND-UNKNOWNS.md`. |
| `docs/decisions/` | ADR-0001 … ADR-0007 (ARC-00-S03). Empty at S01. |
| `.github/workflows/selftest.yml` | The self-test workflow; also the **non-interactive Ubuntu arm** for spikes that need no `claude` login. |

### The stub server in one paragraph

`spikes/stub-server/server.mjs` speaks newline-delimited JSON-RPC 2.0 over stdin/stdout using
`node:readline` and no packages. **`initialize`** replies with the *client's own* `protocolVersion`
echoed back, `capabilities.tools.listChanged = true` and `serverInfo { name: "servicenow-stub",
version: "0.0.0" }`; the reply is held back by `STUB_STARTUP_DELAY_MS` so S-06 can drive
`MCP_TIMEOUT` past its limit. **`tools/list`** returns **set A — five tools** when `STUB_CONFIGURED`
is `0` or unset (`snow_core_instances_index`, `snow_core_instances_reload`,
`snow_core_current_instance_read`, `snow_core_capabilities_read`, `snow_core_status_read` — the
unconfigured-mode set of `01` §9 / ARC-04 README item 2) and **set B — eight tools** when
`STUB_CONFIGURED=1`, adding `snow_core_records_query`, `snow_core_record_add` and
`snow_probe_env_read`. Calling `snow_core_instances_reload` flips the process to set B for the rest
of its life and emits a `notifications/tools/list_changed` notification (S-02). `snow_probe_env_read`
returns `cwd`, `argv` and seven environment variables as text: `CLAUDE_PROJECT_DIR`, `SNOW_STORE`
and `STUB_CONFIGURED` verbatim (they are paths and a flag), and `HTTPS_PROXY`, `HTTP_PROXY`,
`NO_PROXY`, `NODE_EXTRA_CA_CERTS` **only** as `unset` or `set (len n)` — a proxy URL can carry
credentials. `snow_core_record_add` returns the fixed string `stub: would create record` (S-18);
every other tool returns `stub: <name> ok`. `STUB_EXIT_ON_START=1` exits 1 before `initialize` — the
negative control for S-17. Two deliberate additions beyond the story text, both noted as deviations
in §6: an empty inherited value is reported as `(set, empty string)` / `set (len 0)` rather than
`unset`, so S-20 can tell "not inherited" from "inherited as an empty string"; and `resources/list` /
`prompts/list` answer with empty arrays instead of `-32601` so an unadvertised probe leaves no error
in `/mcp` (S-17 wants a clean panel).

---

## 2. Environment record

### 2.1 macOS — the owner's working machine

| Field | Value |
|---|---|
| OS | macOS **26.5.2**, build **25F84**, arm64 (Apple silicon) |
| git | 2.39.5 (Apple Git-154) |
| Node | **v24.16.0** (`/usr/local/bin/node`), npm 11.13.0 |
| Claude Code — current | **2.1.258**, installed via **npm** at `~/.npm-global/lib/node_modules/@anthropic-ai/claude-code`; linked as `~/.local/bin/claude` |
| Claude Code — floor | **2.1.214**, `npm install -g --prefix ~/.local/claude-code-2.1.214 @anthropic-ai/claude-code@2.1.214`; linked as `~/.local/bin/claude-2.1.214` |
| Logged in | Yes (this is the owner's own machine) |
| Snapshots | **None — see the recipe form below** |

`~/.local/bin` is deliberately **not** added to `PATH`; both binaries are invoked by absolute path so
nothing in the owner's shell profile changes.

**Why the macOS environment is a recipe, not a snapshot (architect ruling, 2026-09-06).** The macOS
"machine" of the story's table is the owner's live laptop: a fresh user account cannot be created for
this ARC and macOS offers no VM-style snapshots. The two states the spikes need are therefore
reproduced as commands:

- **`clean`** — for the first-session spikes (S-01, S-09, S-16) "clean" means *a brand-new folder
  Claude Code has never trusted*. Workspace trust and the `enabledMcpjsonServers` pre-seeding that
  S-01 exercises are **per-project**, not per-user, so a fresh directory on this account is faithful:

  ```sh
  mkdir -p ~/spike-runs/$(date +%Y%m%d-%H%M%S) && cd $_   # never-trusted folder
  git clone git@github.com:farstic/snowarch-spikes.git .  # then run the spike
  ```

- **`no-node`** — `spikes/recipes/no-node.sh` (below) removes **every** `PATH` entry that contains a
  `node` executable and then `exec`s the command, so *every descendant* — including the MCP server
  Claude Code spawns from `.mcp.json` with `command: "node"` — inherits an environment in which node
  cannot be found. Observed on 2026-09-06:

  ```
  $ which -a node | xargs -n1 dirname | sort -u
  /usr/local/bin
  $ ./no-node.sh sh -c 'echo "command -v node: [$(command -v node)]"; echo "git: $(command -v git)"'
  command -v node: []
  git: /usr/bin/git
  $ ./no-node.sh sh -c 'sh -c "command -v node || echo \"grandchild: node not found\""'
  grandchild: node not found
  ```

### 2.2 Ubuntu — Multipass VM `arc00-ubuntu`

**Option chosen: Multipass**, with the GitHub Actions `ubuntu-22.04` runner as a second,
non-interactive arm. Multipass gives a real Ubuntu 22.04 guest with named snapshots
(`multipass snapshot` / `multipass restore`), which the story's `clean` / `no-node` requirement needs
and which no container gives; the GitHub runner cannot host a spike that needs an interactive
`claude` login, so it carries only the spikes that need none (the stub self-test, S-15, S-07).
Docker Desktop is present on the host but its daemon was not running and a container is not a
faithful VM, so it was the third choice.

| Field | Value |
|---|---|
| Guest OS | Ubuntu **22.04.5 LTS** (Jammy Jellyfish), aarch64 |
| Host tooling | multipass **1.16.3+mac**, multipassd 1.16.3+mac |
| git | 2.34.1 (preinstalled in the image) |
| Node | **v22.23.2** (`snap install node --classic --channel=22`), npm 10.9.8 |
| Claude Code — floor | **2.1.214** — native installer, `bash install.sh 2.1.214`; `~/.local/bin/claude-2.1.214` → `~/.local/share/claude/versions/2.1.214` |
| Claude Code — current | **2.1.263** — native installer, `bash install.sh latest`; `~/.local/bin/claude` → `~/.local/share/claude/versions/2.1.263` |
| Logged in | **YES — 2026-09-07** (Claude Max, on 2.1.263). Both snapshots re-taken from the logged-in state. The VM reports *System restart required* and has deliberately **not** been rebooted, so the snapshots capture the state the owner logged in on. Remote Control was active in the owner's session (`/rc active`) — incidental, not part of the recipe. |
| Snapshots | `clean`, `no-node` |

Exact commands used:

```sh
multipass launch 22.04 --name arc00-ubuntu --cpus 2 --memory 4G --disk 20G
multipass exec arc00-ubuntu -- bash -lc 'sudo snap install node --classic --channel=22'
# native installer; `Usage: install.sh [stable|latest|VERSION]` is the script's own documented
# argument handling (install.sh line 10) -- no flag was invented
multipass exec arc00-ubuntu -- bash -lc 'curl -fsSL https://claude.ai/install.sh -o /tmp/install.sh'
multipass exec arc00-ubuntu -- bash -lc 'bash /tmp/install.sh 2.1.214'
multipass exec arc00-ubuntu -- bash -lc 'bash /tmp/install.sh latest'
multipass exec arc00-ubuntu -- bash -lc 'ln -sfn ~/.local/share/claude/versions/2.1.214 ~/.local/bin/claude-2.1.214'
multipass stop arc00-ubuntu && multipass snapshot arc00-ubuntu --name clean --comment '…'
multipass start arc00-ubuntu && multipass exec arc00-ubuntu -- bash -lc 'sudo snap remove node'
multipass stop arc00-ubuntu && multipass snapshot arc00-ubuntu --name no-node --comment '…'
multipass restore --destructive arc00-ubuntu.clean && multipass start arc00-ubuntu
```

```
$ multipass list --snapshots
Instance       Snapshot   Parent   Comment
arc00-ubuntu   clean      --       git 2.34.1, Node 22.23.2 (snap), Claude Code 2.1.…
arc00-ubuntu   no-node    clean    clean with the node snap removed; claude native b…
```

The instance currently sits on the restored `clean` snapshot (`node --version` → `v22.23.2`,
`claude --version` → `2.1.263`).

### 2.3 Windows — DEFERRED

**`DEFERRED — Windows VM pending (owner input #2).`** The story's third machine (Windows 11 23H2 Pro,
PowerShell 5.1 only, MinGit so that `where bash` finds nothing, snapshots `clean` / `no-node` /
`gpo-allsigned` / `gitbash`) is not built. Owner input #2 in `04-ROADMAP.md` §9 — "a Windows 10/11
machine or VM **without Git Bash on PATH**" — is still open, and this repository fakes nothing in its
place. Concretely deferred:

| Item | Status |
|---|---|
| Acceptance criterion 3, Windows row (`claude-2.1.214 --version` / `claude --version` on Windows) | `DEFERRED — Windows VM pending (owner input #2)` |
| Acceptance criterion 4 (`where bash` / `where sh` empty, `git --version` succeeds) | `DEFERRED — Windows VM pending (owner input #2)` |
| Acceptance criterion 5, Windows row (`clean`, `no-node`, `gpo-allsigned`, `gitbash` snapshots) | `DEFERRED — Windows VM pending (owner input #2)` |
| Task 5 / Task 6, Windows parts | `DEFERRED — Windows VM pending (owner input #2)` |
| Spikes S-03, S-04, S-08 (and the Windows halves of S-01, S-07, S-15, S-20) | Cannot start until the VM exists |

**The `windows-latest` job in `.github/workflows/selftest.yml` is the stub self-test only.** That
runner *has* Git Bash, so it is never evidence for S-03 / S-04 / S-08 and must not be read as such.

### 2.4 Node version note

The story's machine table asks for Node 22 LTS. This Mac runs **Node v24.16.0** — the version the
whole plan set was audited against on 2026-09-04 — and it was not downgraded; the Ubuntu VM carries
**Node v22.23.2**, so the pair 24 (macOS) / 22 (Ubuntu) covers both. The product floor stays Node ≥ 20
(`01` principle 6) and the CI matrix runs 20 / 22 / 24 on every OS.

---

## 3. Acceptance criteria — ARC-00-S01

| # | Criterion | Status | Evidence |
|---|---|---|---|
| 1 | Fresh clone; `initialize` answered in one line within 200 ms; `tools/list` = 5 (set A) with `STUB_CONFIGURED` unset | **MET** (macOS, Ubuntu, and 9 CI jobs) | §3.1 |
| 2 | `STUB_CONFIGURED=1` → 8 tools incl. `snow_core_record_add` + `snow_probe_env_read`; `HTTPS_PROXY` reported as `set (len n)`, never by value | **MET, with one correction to the story's expected literal** | §3.2 |
| 3 | `claude-2.1.214 --version` → `2.1.214` and `claude --version` → current, on each machine | **MET (macOS, Ubuntu)** · Windows `DEFERRED — Windows VM pending (owner input #2)` | §2.1, §2.2 |
| 4 | On the Windows VM `where bash` / `where sh` find nothing and `git --version` succeeds | `DEFERRED — Windows VM pending (owner input #2)` | §2.3 |
| 5 | `clean` and `no-node` on each machine (+ `gpo-allsigned`, `gitbash` on Windows) | **Ubuntu MET (real snapshots)** · **macOS MET as recipe, not snapshot** · Windows `DEFERRED — Windows VM pending (owner input #2)` | §2.1, §2.2, §2.3 |
| 6 | `spikes/TEMPLATE.md` with the six sections, the verdict-line format and the redaction rules at the top | **MET** | `spikes/TEMPLATE.md` |
| 7 | No file from `AI-Architect-Claude`, no `src/` from `snow-mcp`; both source repositories unchanged | **MET** | §3.3 |

### 3.1 Criterion 1 — fresh clone, five tools

Real stdout of the command shown. The only edit is the home path, rewritten to `~` (this folder is
imported into the **public** product repository by ARC-01-S02); nothing else is altered.

```
$ git clone git@github.com:farstic/snowarch-spikes.git && cd snowarch-spikes
$ printf '%s\n%s\n' \
   '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"t","version":"0"}}}' \
   '{"jsonrpc":"2.0","id":2,"method":"tools/list"}' | node spikes/stub-server/server.mjs
{"jsonrpc":"2.0","id":1,"result":{"protocolVersion":"2025-06-18","capabilities":{"tools":{"listChanged":true}},"serverInfo":{"name":"servicenow-stub","version":"0.0.0"}}}
{"jsonrpc":"2.0","id":2,"result":{"tools":[{"name":"snow_core_instances_index","description":"Stub: list configured instances.","inputSchema":{"type":"object","properties":{},"additionalProperties":false}},{"name":"snow_core_instances_reload","description":"Stub: reload the instance store.","inputSchema":{"type":"object","properties":{},"additionalProperties":false}},{"name":"snow_core_current_instance_read","description":"Stub: read the current instance.","inputSchema":{"type":"object","properties":{},"additionalProperties":false}},{"name":"snow_core_capabilities_read","description":"Stub: read server capabilities.","inputSchema":{"type":"object","properties":{},"additionalProperties":false}},{"name":"snow_core_status_read","description":"Stub: read server status.","inputSchema":{"type":"object","properties":{},"additionalProperties":false}}]}}
```

Two lines out for two lines in: the `initialize` result echoing the client's `protocolVersion`, and
a `tools/list` result carrying **five** tools — set A, in the order of `01` §9. The same pipeline on
the Ubuntu VM (`~/snowarch-spikes`, Node v22.23.2) prints the identical two lines.

The **within-200 ms** half of the criterion is not visible in that transcript — a shell pipeline
cannot time the first byte. It is measured by the instrumented self-test, whose assertion is quoted
in §3.4.

### 3.2 Criterion 2 — eight tools and a redacted proxy value

Real stdout of the command shown, home path rewritten to `~` as above. Three requests in, three
lines out; lines 1 and 2 are the handshake, line 3 is the probe.

```
$ printf '%s\n%s\n%s\n' \
   '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"t","version":"0"}}}' \
   '{"jsonrpc":"2.0","id":2,"method":"tools/list"}' \
   '{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"snow_probe_env_read","arguments":{}}}' \
  | STUB_CONFIGURED=1 HTTPS_PROXY='http://u:p@proxy.invalid:3128' node spikes/stub-server/server.mjs
{"jsonrpc":"2.0","id":1,"result":{"protocolVersion":"2025-06-18","capabilities":{"tools":{"listChanged":true}},"serverInfo":{"name":"servicenow-stub","version":"0.0.0"}}}
{"jsonrpc":"2.0","id":2,"result":{"tools":[{"name":"snow_core_instances_index",…},{"name":"snow_core_instances_reload",…},{"name":"snow_core_current_instance_read",…},{"name":"snow_core_capabilities_read",…},{"name":"snow_core_status_read",…},{"name":"snow_core_records_query",…},{"name":"snow_core_record_add",…},{"name":"snow_probe_env_read",…}]}}
{"jsonrpc":"2.0","id":3,"result":{"content":[{"type":"text","text":"snow_probe_env_read (stub)\ncwd: ~/work/snowarch-spikes\nargv: [\"/usr/local/bin/node\",\"~/work/snowarch-spikes/spikes/stub-server/server.mjs\"]\nenv:\nCLAUDE_PROJECT_DIR: unset\nSNOW_STORE: unset\nSTUB_CONFIGURED: 1\nHTTPS_PROXY: set (len 29)\nHTTP_PROXY: unset\nNO_PROXY: unset\nNODE_EXTRA_CA_CERTS: unset"}]}}
```

Line 2 is elided at the `inputSchema` of each tool (marked `…`) purely for width; the eight names are
verbatim and in order. **Eight** tools, including `snow_core_record_add` and `snow_probe_env_read`.

The same probe text with its `\n` escapes rendered — a presentation of line 3 above, not separate
output:

```
snow_probe_env_read (stub)
cwd: ~/work/snowarch-spikes
argv: ["/usr/local/bin/node","~/work/snowarch-spikes/spikes/stub-server/server.mjs"]
env:
CLAUDE_PROJECT_DIR: unset
SNOW_STORE: unset
STUB_CONFIGURED: 1
HTTPS_PROXY: set (len 29)
HTTP_PROXY: unset
NO_PROXY: unset
NODE_EXTRA_CA_CERTS: unset
```

**Correction to the story text.** ARC-00-S01 acceptance criterion 2 says the fixture
`http://u:p@proxy.invalid:3128` must print `HTTPS_PROXY: set (len 31)`. That string is **29**
characters long; 31 is its length *including the two surrounding quotation marks*
(`JSON.stringify(v).length === 31`). The stub reports the true length of the value, so the observed
output is `HTTPS_PROXY: set (len 29)`. The behaviour the criterion is protecting — the value never
appears, only its length — is met; only the arithmetic in the story text needs amending.

### 3.3 Criterion 7 — the two source repositories are untouched

```
$ git -C ~/work/AI-Architect-Claude log --oneline -1
21bdf69 docs: field-notes §15 — sys_script_fix.name silently truncates at 40 chars over REST
$ git -C ~/work/AI-Architect-Claude status --short | wc -l
13          # identical to the session-start snapshot; all pre-existing, none authored here

$ git -C ~/work/snow-mcp log --oneline -1
bb09bde chore(desktop): remove UI redesign brief (cleanup)
$ git -C ~/work/snow-mcp status --short | wc -l
1           # pre-existing

$ git ls-files | grep -E '(^|/)(src|dist)/'
none
```

Every tracked file was authored in this repository. The tree grew across three commits — `ec0e793`
(the 38-file skeleton), `e55799b` (`spikes/README.md`, `spikes/recipes/no-node.sh`) and the
verification-fix commit that carries this sentence (`.gitattributes`) — so re-run `git ls-files | wc -l`
rather than trusting a number pasted here. None of the files was copied from a source repository. The four basenames that
also exist in a source repository were byte-compared and all differ:

| File | vs source | Result |
|---|---|---|
| `CLAUDE.md` | `AI-Architect-Claude/CLAUDE.md` | DIFFERENT (61 bytes vs 59,799) |
| `.gitignore` | `AI-Architect-Claude/.gitignore` | DIFFERENT (50 vs 756) |
| `.gitignore` | `snow-mcp/.gitignore` | DIFFERENT (50 vs 783) |
| `.claude/settings.json` | `AI-Architect-Claude/.claude/settings.json` | DIFFERENT (534 vs 910) |

No fixture copy of `snow-mcp/dist/`, `package.json` or `package-lock.json` was taken: the S01 tree in
the story's design notes has no fixtures folder and no task asks for them; they belong to
**ARC-00-S08**, which runs S-15 and S-06.

### 3.4 Self-test and CI

```
$ node spikes/stub-server/selftest.mjs
stub-server self-test
  PASS  AC1 initialize returns a result
  PASS  AC1 first line within 200 ms (observed 36 ms)
  PASS  AC1 initialize echoes the client protocolVersion
  PASS  AC1 serverInfo.name is servicenow-stub
  PASS  AC1 capabilities.tools.listChanged is true
  PASS  AC1 tools/list returns 5 tools (set A), observed 5
  PASS  AC1 set A names match 01 section 9 / ARC-04 README item 2
  PASS  AC2 tools/list returns 8 tools (set B), observed 8
  PASS  AC2 set B includes snow_core_record_add and snow_probe_env_read
  PASS  AC2 HTTPS_PROXY reported as "set (len 29)"
  PASS  AC2 the proxy value never appears in the probe output
  PASS  AC2 the other three proxy/CA keys report "unset"
  PASS  S-18 snow_core_record_add returns the fixed string
  PASS  S-20 an empty inherited value reads as "(set, empty string)"
  PASS  S-20 an empty redacted value reads as "set (len 0)", not "unset"
  PASS  S-02 tool count goes 5 -> 8 after reload (observed 5 -> 8)
  PASS  S-02 notifications/tools/list_changed is emitted
  PASS  S-02 list_changed is a notification (no id)
  PASS  S-17 negative control exits with code 1 (observed 1)
  PASS  S-17 negative control writes nothing to stdout
  PASS  S-06 STUB_STARTUP_DELAY_MS=400 delays the reply (observed 435 ms)

stub-server self-test: OK
```

The second line is the only instrumented source of the criterion-1 **within-200 ms** figure, and the
self-test is the only place it is claimed.

GitHub Actions run `34038663427` (`stub-server self-test`, 42 s) — **9/9 green**:
`ubuntu-22.04`, `macos-latest`, `windows-latest` × Node 20, 22, 24. Each job runs the self-test and
repeats the criterion-1 handshake by hand.

---

## 3.5 ARC-00-S04 — the first-session spikes (S-01, S-16, S-17)

**The S-01 dialog count is the number this workspace exists to produce, and it is NOT MET.** The story's
own test strategy says why: *"Manual, interactive (dialogs cannot be scripted)."* Counting modals needs a
human at a TTY, and accepting the workspace-trust dialog is what makes Claude Code write
`hasTrustDialogAccepted` into `~/.claude.json` — the file these spikes must not touch and that `03` §D says
the design deliberately never writes. Driving it through a pseudo-terminal was rejected for the same reason.

What **was** established non-interactively, on macOS, on **both** 2.1.214 and 2.1.258, character-identical:

| Variant | `claude mcp get servicenow` → Status | in `claude mcp list` | stub processes |
|---|---|---|---|
| live — `enabledMcpjsonServers` | `⏸ Pending approval (run \`claude\` to approve)` | present | 0 |
| design — `disabledMcpjsonServers` | `✘ Rejected (see disabledMcpjsonServers in settings)` | **absent** | 0 |
| control — no toggle file | `⏸ Pending approval (run \`claude\` to approve)` | present | 0 |

So `disabledMcpjsonServers` **is** honoured before the folder is trusted, with exactly the string `03`
predicted; `enabledMcpjsonServers` **is not**, and the live variant is byte-identical to having no toggle
file at all. The two *discriminating* readings are the status string and the `mcp list` omission; the
`0` stub processes discriminate nothing (the count is `0` in every variant, because a pending-approval
server is not started either) and are recorded as background. That matches the `docs:mcp` quote in `03` and is precisely why the dialog count needs the
trust dialog accepted first. `spikes/S-01-preseeded-approval/run.sh` prepares each run — fresh clone path,
read-only `~/.claude.json` precheck, toggle file, untracked check — and prints the checklist for the human.

S-17's stub half is confirmed (five tools in unconfigured mode; the stub exits 1 writing nothing under
`STUB_EXIT_ON_START=1`) — but the control S-17's own procedure defines is a **`/mcp` reading**, and both
`/mcp` readings still need the session. S-16 is entirely interactive and has not run.

---

## 4. Blocked / open

| # | Item | Detail |
|---|---|---|
| 1 | ~~Ubuntu VM is not logged in~~ **RESOLVED 2026-09-07** | `claude -p` in the VM prints, verbatim: `Not logged in · Please run /login`. Login is an interactive flow; per the architect's instruction it was not worked around. `~/.claude/.credentials.json` is absent. Once the owner logs in, `multipass delete --snapshot arc00-ubuntu.clean` then re-take `clean` so the snapshot carries the logged-in state. |
| 2 | **Windows machine** | Owner input #2 — see §2.3. |
| 3 | **`claude mcp get` / `claude mcp list` are not inert on `~/.claude.json`** | Measured on macOS while running these spikes: the file is byte-stable while idle, but each probe rewrites exactly one top-level key — `migrationVersion`. **2.1.214 writes `13`; 2.1.258 writes `14`**, so alternating the two versions flips it on every switch; a repeat probe on the same binary writes nothing. No other key moves and nothing under `projects` is touched. **This is a programme finding, not just a spike note:** ARC-06 pins a 2.1.214 floor that will sit beside a newer global `claude` on a consultant's laptop, and `03` R-13 has the shipped doctor call `claude mcp get servicenow` — so the product's own doctor will do this to the user's file. Worth a `03` row and an ARC-08 note. |
| 4 | **One owner sitting closes nine spikes** | Consolidated into **[`OWNER-SITTING.md`](OWNER-SITTING.md)** — ordered steps, exact commands, what to observe and where to paste each answer, **55–70 minutes**. It covers S-01, S-16, S-17, S-06 (the `MCP_TIMEOUT` half) and S-14a/b/c/d. Everything in ARC-00 that could be measured without a human has been. |
| 5 | **The S-01 / S-16 / S-17 interactive runs** | ~10 minutes at a terminal: three variants × two Claude Code versions, following the checklist `spikes/S-01-preseeded-approval/run.sh` prints. It produces the dialog count for the README promise, the S-16 prompt counts and the S-17 `/mcp` panel. It cannot be scripted, and accepting the trust dialog is a decision for the machine's owner, not for the delivery team. |

**Incidental observation while probing the VM (not a verdict; S-16 belongs to ARC-00-S04).** In an
untrusted checkout the CLI printed: *"Ignoring 4 permissions.allow entries from
`.claude/settings.json`: this workspace has not been trusted."* — consistent with the S-16 evidence
line in `03`, and it names `projects[<path>].hasTrustDialogAccepted` in `~/.claude.json` as the
alternative, which `03` §D deliberately does **not** use.

---

## 4b. Fallback propagation

Every verdict that did **not** simply confirm its assumption changed something downstream. This is
that list, with the consequence and **the measurement that shows it landed** — because "the fallback
was propagated" is a claim about the tree, and a table that only names intentions is the thing
ARC-00-S14 AC4 exists to prevent. Each row was re-measured on the ARC-00 acceptance branch.

| Verdict | What it forced | Where it landed | Measured |
|---|---|---|---|
| **S-01** — the pre-seed is ignored BEFORE trust and applied at trust time | The install page cannot promise "no dialog"; it describes the trust dialog and the fallback wording | `docs/INSTALL.md` | the page carries the trust dialog wording (6 mentions) |
| **S-05** — headlessly a failing exec-form hook produces NO notice | The committed settings ship **hook-free** rather than relying on `disableAllHooks`, which would silently disable the user's own hooks | `.claude/settings.json` | **0 hooks** in the committed settings |
| **S-07** — recipe C needs a fifth step, and `core.longpaths` was not exercised | `git submodule init` is in the recipe on every surface, and the git floor is the version the spike ran | `tools/snowarch/launcher/docs-recipe.{sh,ps1}`, `docs/ARCHITECTURE.md`, `engine.config.json` | `submodule init` present in both recipe modes; `floors.git` = **2.34.1** |
| **S-12** — one middle-wildcard glob covers 92 of 269 non-mutating tools (34%) | ARC-05 ships a **hybrid**: globs plus explicit per-tool rules, not a single glob | `.claude/settings.json` | **397** explicit `mcp__servicenow__snow_*` rules |
| **S-16** — Claude runs a compound wrapper, and the wrapper varied between two sittings | Bash allow rules were **abandoned** for this purpose rather than written more cleverly | `.claude/settings.json` | **0** `Bash(` allow rules |
| **S-14a/b/c/e** — storage answered on macOS only; a plugin-bundled server is invisible to `claude mcp get`; `--config KEY=` is rejected; the marketplace/enable split is user+project | D-06 resolved **away from the plugin channel** (ADR-0006), so none of these became a shipped constraint | ADR-0006, and the absence of a plugin manifest | no `.claude-plugin/` in the tree; `engine.config.json` mentions no plugin |
| **S-14g** — past the cap npm ci is SIGTERM'd while the installer exits 0 | Would have forced "no completeness check while npm is in flight" — **it has no target in the product**, because the plugin channel was not taken. Recorded so that a future plugin channel inherits the finding rather than rediscovering it | — | no plugin install path exists to carry it |

## 5. Verdict register

One line per spike; ARC-00-S14 copies the final verdicts here from the records.

**The convention, because a summary that may say less than its source is not a summary.** A record's
`## Verdict` line reads ``S-NN: <TOKEN><qualifier?><separator><sentence>``. The token is the longest
match from a closed set of eight — `CONFIRMED`, `CONFIRMED WITH CORRECTIONS`, `REFUTED`, `PARTIAL`,
`NOT PROVEN`, `NOT RUN`, `DEFERRED`, `INTERACTIVE-PENDING` — *longest* because `CONFIRMED` is a
prefix of `CONFIRMED WITH CORRECTIONS`. The separator is an em-dash or a **sentence-ending** period,
which is to say `/—|\.(\s|$)/`: S-14g's `REFUTED on both halves.` ends on a period, and a
version-qualified verdict like `CONFIRMED on 2.1.258 —` must not be cut at the `2.1`. Everything
between the token and the separator is a qualifier, and **a qualifier is a caveat**.

**Every caveat is bold, and the register may never say less than the record.** A register row must
carry its record's token exactly and every bold phrase of its record verbatim; numbers that are not
bold are the record's business and may be abbreviated here. That is what lets S-06's "394 tools
everywhere" drop from its row while S-15's "measured on macOS only — du was not run on the runners"
may not. `tests/spikes-register.test.mjs` enforces all of it, both directions — a row with no
record, a record with no row — with a guard that fails if no record is bolded at all, because a
never-says-less test over an unbolded tree proves nothing. Before this convention landed the rule
was broken in the direction that matters: S-20's row read `NOT RUN` over a record that says
`CONFIRMED on macOS`, and S-14g's read `PARTIAL` over a record that says `REFUTED on both halves`.

| Spike | Record | Run by | Verdict |
|---|---|---|---|
| S-01 | `S-01-preseeded-approval/` | ARC-00-S04 | `S-01: CONFIRMED **on 2.1.258** — a pre-seeded `enabledMcpjsonServers` removes the per-server approval: live 1 dialog (trust only), design 1 (trust only, server absent from `/mcp`), no-pre-seed control 2 — the second being the "New MCP server found in this project" prompt, which is what makes the count evidence; **2.1.214 not measured**` |
| S-02 | `S-02-list-changed-after-reload/` | ARC-00-S10 | `S-02: CONFIRMED on 2.1.258, macOS, non-interactively, with a negative control — after snow_core_instances_reload the newly advertised tools are callable in the same session, no restart and no /mcp reconnect` |
| S-03 | `S-03-project-dir-expansion-windows/` | ARC-00-S06 | `S-03: DEFERRED — **Windows VM pending (owner input #2)**; the macOS control is recorded and **nothing is inferred about Windows from it**` |
| S-04 | `S-04-raw-mode-masked-input/` | ARC-00-S07 | `S-04: NOT RUN — **blocked on the Windows VM (owner input #2)**` |
| S-05 | `S-05-hook-without-node/` | ARC-00-S06 | `S-05: CONFIRMED **on 2.1.258** — interactively an exec-form hook whose interpreter is absent reports its failure verbatim and non-blockingly and the session stays usable, while **headlessly there is no notice at all**` |
| S-06 | `S-06-mcp-timeout-cold-start/` | ARC-00-S08 | `S-06: CONFIRMED **on 2.1.258** — cold start over 27 runs on 9 CI cells: initialize 694 ms worst, tools/list 750 ms worst, so MCP_TIMEOUT=120000 keeps ≈160× headroom; and the settings env block does govern startup, proven headlessly with a 2×2` |
| S-07 | `S-07-docs-submodule/` | ARC-00-S09 | `S-07: CONFIRMED WITH CORRECTIONS — recipe C is fastest and smallest on all four machines (302 MB macOS / 305 MB ubuntu / 315 MB windows) and pin-by-hash fetch works everywhere, but **it needs a fifth step, git submodule init**, without which the superproject reports the submodule uninitialised; and **the core.longpaths control did not exercise MAX_PATH, so acceptance criterion 2 is unanswered for a real install path**` |
| S-08 | `S-08-bootstrap-cmd-execution-policy/` | ARC-00-S07 | `S-08: NOT RUN — **blocked on the Windows VM (owner input #2)**` |
| S-09 | `S-09-claude-first-clone/` | ARC-00-S10 | `S-09: NOT RUN — **not run in ARC-00, and nothing depends on it**` |
| S-10 | `S-10-readonly-preset-sufficiency/` | **Deferred → ARC-04-S05** | `S-10: DEFERRED → ARC-04` |
| S-11 | `S-11-claude-code-floor/` | ARC-00-S11 | `S-11: CONFIRMED **on the mechanisms measured** — floor 2.1.214 sufficient: eight rows measure seven of the story's eleven mechanisms identical on 2.1.214 and 2.1.258; **four of the eleven are unmeasured: ${VAR:-default} expansion, enabled/disabledMcpjsonServers, exec-form hook + CLAUDE_PROJECT_DIR, skills/agents listing**` |
| S-12 | `S-12-middle-wildcard-globs/` | ARC-00-S05 | `S-12: CONFIRMED **on 2.1.258** — a middle-wildcard glob works, with a no-rule control showing `-p` does not auto-approve; but **one glob covers only 92 of 269 non-mutating tools (34%)**, three globs reach 205, and **64 need explicit per-tool rulings**, so ARC-05 needs a hybrid` |
| S-13 | `S-13-skill-description-cap/` | **CONFIRMED** (closed by ARC-02-S03) — the cause is a TOTAL listing budget stated by the CLI itself (`Skill listing over budget: 42 skills, 34399 chars > 30000 budget`), not a per-file cause; ten YAML hazards were checked and none separated the four empty descriptions from the twenty-four that worked. The engine controls only its share of that total. | `S-13: CONFIRMED — total listing budget; engine share cut 27,119 → 11,191 chars, all 28 register with a description` |
| S-14a | `S-14a-user-config-masked-dialog/` | ARC-00-S12 | `S-14a: PARTIAL — storage answered **on macOS only**: sensitive → the keychain, non-sensitive → ~/.claude/settings.json, USER scope, 0644, even for a project-scope install. **Masking of the dialog itself is interactive-pending, and the Windows and Linux stores are not run**` |
| S-14b | `S-14b-plugin-server-approval/` | ARC-00-S12 | `S-14b: PARTIAL — a plugin-bundled server is invisible to `claude mcp get`/`list` although `claude plugin list --json` shows it fully. **The dialog count is interactive-pending**` |
| S-14c | `S-14c-empty-user-config-substitution/` | ARC-00-S12 | `S-14c: PARTIAL — `--config KEY=` is rejected, so blank and absent are one state at the CLI. **What ${user_config.KEY} expands to for an unset option is interactive-pending**` |
| S-14d | `S-14d-session-start-additional-context/` | ARC-00-S12 | `S-14d: INTERACTIVE-PENDING — a self-describing 12,299-byte payload and its plugin hook are built and verified standalone; **startup, compact and resume injection each need a session**` |
| S-14e | `S-14e-scaffolded-marketplace-install/` | ARC-00-S12 | `S-14e: PARTIAL — private-git marketplace add works; the marketplace/enable split is user+project, not project alone. **The second-machine run and the dialog are interactive-pending**` |
| S-14f | `S-14f-plugin-tag-two-plugins/` | ARC-00-S12 | `S-14f: CONFIRMED **on 2.1.258** — two plugins tag cleanly at one commit with a manifest/marketplace cross-check. **The dependency field is spelled `dependencies` and is array-valued — `plugin-dependencies` and `pluginDependencies` do not exist**` |
| S-14g | `S-14g-plugin-cache-npm-ci-cap/` | ARC-00-S12 | `S-14g: REFUTED **on both halves**. The cap is close, not comfortable — 5.2 s unthrottled but **36.5 s on a 4 Mbit link (1.6x headroom, not the 31x claimed from a warm cache)**, crossing 60 s at 1 Mbit; and **it does not fail loudly** — past the cap npm ci is SIGTERM'd while `claude plugin install` prints success and exits 0` |
| S-15 | `S-15-npm-ci/` | ARC-00-S08 | `S-15: CONFIRMED — 57.3 MB content / 171 packages on 3 OSes × Node 20/22/24 (72 MB du, **measured on macOS only — du was not run on the runners**); nothing under tools/snowarch; no per-package node_modules; handshake ok (394 tools)` |
| S-16 | `S-16-project-permissions-allow/` | ARC-00-S04 | `S-16: CONFIRMED **on 2.1.258** — a committed `permissions.allow` Bash rule is honoured after trust, with its control blocked. But **Claude runs a compound wrapper rather than the bare command, and the wrapper varied between two sittings of the same command**, and **auto mode makes the spike unreadable**` |
| S-17 | `S-17-unconfigured-server/` | ARC-00-S04 | `S-17: CONFIRMED **on 2.1.258** — an unconfigured server is accepted as connected (`/mcp`: servicenow · connected · 5 tools, which is set A), and the negative control fails as it must under STUB_EXIT_ON_START=1` |
| S-18 | `S-18-permissions-ask-auto-mode/` | ARC-00-S05 | `S-18: CONFIRMED **on 2.1.258** — an `ask` rule prompts in auto and manual mode alike, its allow-listed control unprompted in both; but **64 fall outside both lists — 34 of those plainly change state**, so a suffix-derived ask block would leave 34 write tools ungated` |
| S-19 | `S-19-plugin-validate-headless-ci/` | ARC-00-S12 | `S-19: CONFIRMED — runs on all three runners with **no login and no TTY**; exit 0 on valid targets incl. --strict, exit 1 on a manifest missing name and on malformed JSON` |
| S-20 | `S-20-shell-env-inheritance/` | ARC-00-S06 | `S-20: CONFIRMED **on macOS** — a project stdio server inherits the launching shell's environment and CLAUDE_PROJECT_DIR is set by Claude Code; **HTTPS_PROXY / HTTP_PROXY not measured directly (an unreachable HTTPS_PROXY stops Claude Code reaching its own API)**` |

Identifier hygiene: spike **`S-13`** (skill listing, deferred to ARC-02) is not story **`ARC-00-S13`**
(the Windows CI recipe). Spike `S-14` is seven sub-spikes `S-14a`…`S-14g`. `S-20` postdates `03` and
gets its `03` §A row from ARC-00-S14.

---

## 6. Deviations from the ARC-00-S01 story text

| # | Story text | What was done | Why |
|---|---|---|---|
| 1 | AC 2 expects `HTTPS_PROXY: set (len 31)` | Observed `set (len 29)` | The fixture is 29 characters; 31 counts the quotation marks. See §3.2. |
| 2 | macOS machine: "fresh user account", snapshots `clean` / `no-node` | Owner's live laptop; both states as reproducible recipes | Architect ruling 2026-09-06. See §2.1. |
| 3 | Machine table: Node 22 LTS everywhere | macOS Node 24.16.0, Ubuntu Node 22.23.2 | Architect ruling 2026-09-06 — the owner's machine is not downgraded. See §2.4. |
| 4 | "install the floor with the native installer's version argument" | macOS floor is **npm**-pinned into a separate prefix; Ubuntu floor uses the **native** installer | This Mac's Claude Code is an npm install, and the native installer was not run on it. The Ubuntu VM supplies the native data point. Feeds S-11. |
| 5 | Third machine: Windows 11 23H2 Pro | Not built | Owner input #2 outstanding; every affected row reads `DEFERRED — Windows VM pending (owner input #2)`. |
| 6 | Stub: env probe prints `unset` or `set (len n)` | Adds a third state — `(set, empty string)` / `set (len 0)` | S-20 must distinguish "not inherited" from "inherited as the empty string `${VAR:-}` yields". |
| 7 | Stub advertises `capabilities.tools` only | `resources/list` / `prompts/list` answer with empty arrays instead of `-32601` | S-17 wants no error in `/mcp` if a client probes an unadvertised method. |
| 8 | "a 30-line self-test" | 21 assertions, ~110 lines | Covers AC 1 and AC 2 in full plus the S-02 / S-06 / S-17 / S-18 / S-20 levers. |
| 9 | Task 4: copy the template into `S-01` … `S-19` | 26 records: `S-01` … `S-20`, with `S-14` expanded to `S-14a`…`S-14g` | `S-14a–g` and `S-20` are in ARC-00's scope and need records; `S-20` is named in the ARC's acceptance criteria. |
| 10 | Repository remote | `origin` is the **SSH** URL, not HTTPS | The machine's `gh` OAuth token lacks the `workflow` scope, so an HTTPS push rejects `.github/workflows/selftest.yml`. SSH already authenticates as `farstic`. No token is written to disk. |
| 11 | Design notes: "`03` S-17 still says *four* because it predates `snow_core_status_read`" | Not adopted — the note is false | The `03` §A S-17 row lists **five** tools by name, `snow_core_status_read` among them. Same class as deviation 1: the story text needs amending, not the deliverable. |
| 12 | `.gitattributes` is not in the story's tree | Added | `snowarch` and `spikes/recipes/no-node.sh` are POSIX shell; a Windows clone with `core.autocrlf=true` would give them CRLF and they would stop running on the Ubuntu VM and in CI. |

---

## 7. Post-delivery verification of this story

Before ARC-00-S01 was reported, the deliverable was put through an adversarial review — five
independent lenses (stub-vs-spec, redaction, evidence integrity, portability, governance/naming),
each finding refuted by a separate reviewer. Seventeen findings were filed, **eight survived
refutation and all eight are fixed in this repository**:

| # | Defect | Fix |
|---|---|---|
| 1 | Criterion 5's Windows cell read a bare `DEFERRED`, contradicting §6's claim that every affected row carries the full sentence | Full form restored in §3 |
| 2, 8 | Criterion 7 evidence claimed "38 tracked files … single initial commit" — false at HEAD | Replaced with a commit-anchored statement and a "re-run the command" instruction |
| 3 | §3.1 / §3.2 were **reconstructions formatted as shell transcripts**: the printed commands could not produce the printed output (the `31 ms` figure came from the instrumented self-test, and the §3.2 command had no stdin redirect) | Both blocks replaced with the real stdout of the command shown; the timing claim moved to §3.4 where the self-test actually measures it. `spikes/TEMPLATE.md` says "Paste real output … Never paraphrase output" — this story had broken its own rule |
| 4 | `selftest.mjs` inherited the operator's `HTTP_PROXY` / `NO_PROXY` / `NODE_EXTRA_CA_CERTS`, so the AC 2 assertions described the operator's shell; any proxied developer or self-hosted runner got a red gate with no defect present | The four keys are now **deleted** (not blanked — `''` reports `set (len 0)`) from the base environment, case-insensitively for Windows |
| 5 | `no-node.sh` silently left node on `PATH` if a `PATH` entry contained a space or a trailing slash, and still `exec`ed — a spike would have recorded a verdict against a node-**present** environment | Line-safe read, trailing-slash normalisation on both sides, and a post-condition assert that exits 1 rather than running |
| 6 | The stub called `process.exit(0)`, discarding stdout writes still queued on the pipe — silent truncation reported as success | `process.exitCode = 0` + `process.stdin.destroy()`; verified at volume (3001 requests → 3001 parsable lines, exit 0) |
| 7 | The S-17 record and a code comment both asserted `03` says "four" tools, two lines under a verbatim quote of `03` saying five | Claim removed from both; the story-text error flagged upstream (§6 row 11) |

Nine further findings were filed and **refuted** — among them a claim that the `len 29` figure was
wrong (it is not; the story is), and a claim that the `S-20` provenance note contradicts `03`.
