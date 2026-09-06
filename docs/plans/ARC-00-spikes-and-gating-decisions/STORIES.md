# ARC-00 — Stories

Status: Draft · Decisions applied: D-01…D-06, Q-A, Q-B, R-1…R-3 · Source: README.md of this ARC · Last updated: 2026-09-04

Conventions used throughout this file:

- **Spike workspace** = a throwaway git repository `snowarch-spikes` (local clone plus a private GitHub remote; needed by S-09 and S-14c–e for real clone/marketplace behaviour). It never contains code from `AI-Architect-Claude` or `snow-mcp` except read-only copies of `snow-mcp/dist/` and `package.json`/`package-lock.json` used as fixtures. ARC-01 imports `spikes/` into the new repository as `docs/spikes/` and `docs/decisions/` as-is.
- **Spike record** = `spikes/S-NN-<slug>/README.md` with the fixed sections *Assumption* (quoted from `03` §A/§B) · *Environment* (OS build, Claude Code version(s), git, Node, shell) · *Procedure* (exact commands, or `run.sh` / `run.ps1` next to it) · *Observed* (output, secrets redacted) · *Verdict* — the single line `S-NN: CONFIRMED | FAILED → fallback <text>` · *Evidence* (file paths of logs/screenshots under the same folder). A spike that runs on several OSes carries one Observed block per OS and one verdict line.
- **Redaction rules**: no instance URLs, usernames, passwords, tokens, or `~/.claude.json` contents in any spike record — key names only, values as `set (len n)`. Screenshots are cropped to the dialog.
- **Claude Code versions**: every spike that exercises Claude Code runs on the floor **2.1.214** and on the current release (2.1.258 at audit time, `00` §1); the S-11 story (S11) is the verdict over that pair.
- Names follow the decisions: package `@farstic/snowarch` in `packages/snowarch`, server key `servicenow` → tool prefix `mcp__servicenow__`, CLI `snowarch`, skill `/snowarch` (`status` · `setup-instance` · `doctor`), first release `2.0.0`. Where `01` still prints `packages/snow-mcp`, `/status`, `/setup-instance` or `1.0.0`, read the decided names. Claude Code's **built-in** `/status` command (not a skill) is still referred to by that name where a spike inspects it (S10) — it is what the R-2 rename avoids colliding with.
- **Identifier hygiene**: stories are `ARC-00-SNN` / `SNN` (no hyphen); spikes are `S-NN` (hyphen). `ARC-00-S13` (Windows recipe story) and spike `S-13` (skill listing, deferred to ARC-02) are different things — other ARCs must write the story form when they mean the recipe.
- **S-20** ("environment inheritance of project stdio servers": do `HTTPS_PROXY` / `HTTP_PROXY` / `NO_PROXY` / `NODE_EXTRA_CA_CERTS` set in the shell that starts `claude` reach the server Claude Code spawns from `.mcp.json`?) was proposed by ARC-04-S11 and ARC-08's README after `03` was written. It is folded into S06 (the stub's env probe already exists there) and gets its own `03` §A row in S14.

## Story map

| ID | Title | Size | Depends on | Delivers |
|---|---|---|---|---|
| ARC-00-S01 | Spike workspace, stub MCP server and three clean test environments | L | — | The reusable harness every spike runs in (repo, stub server, VM snapshots, record format) |
| ARC-00-S02 | Licence and relicensing statement (D-02): `LICENSE`, `NOTICE`, header sweep list | S | — | Agreed licence texts and the relicensing sentence ARC-01 commits |
| ARC-00-S03 | ADR-0001…ADR-0006 (+ ADR-0007 post-decision rulings) and the `engine.config.json` value set | M | S02 | Six Accepted ADRs, one for the rulings, fixed name/floor values (D-01, S-11) |
| ARC-00-S04 | First-session spikes: S-01 pre-seeded approval, S-16 project `permissions.allow`, S-17 unconfigured server | M | S01 | Dialog count on first `claude` (macOS + Windows), allow-rule and unconfigured-server verdicts |
| ARC-00-S05 | Permission-rule spikes: S-18 `permissions.ask` in auto mode, S-12 middle-wildcard globs | M | S01, S04 | Proof that the §2.1 gate is mechanical; glob vs explicit allow list decision |
| ARC-00-S06 | Hook and path-expansion spikes: S-03 `${CLAUDE_PROJECT_DIR}` on native Windows, S-05 hook with Node absent, S-20 shell-env inheritance | M | S01 | Windows-native verdict for `.mcp.json`/hook expansion; the S-05 fallback choice; whether proxy/CA variables reach the spawned server (S-20, for ARC-04/ARC-06/ARC-08) |
| ARC-00-S07 | Windows console spikes: S-04 raw-mode masked input, S-08 `bootstrap.cmd` under Restricted and GPO-locked policies | M | S01 | The Q-B "native Windows first-class" evidence |
| ARC-00-S08 | Server install and startup spikes: S-15 root `npm ci` footprint, S-06 `MCP_TIMEOUT` and 394-tool cold start | M | S01 | Install size, cold-start time, timeout value confirmed on three OSes |
| ARC-00-S09 | S-07 — ServiceNowDocs submodule recipes: size and time on three OSes | M | S01 | The B02 recipe ARC-03 documents, with measured numbers |
| ARC-00-S10 | Session-dynamics spikes: S-09 Claude-first clone-into-cwd and restart, S-02 `list_changed` after reload | M | S01, S04 | Path B recipe verdict; whether `/snowarch setup-instance` needs the `/mcp` reconnect fallback |
| ARC-00-S11 | S-11 — Claude Code 2.1.214 floor verdict over the spike matrix | S | S04–S10 | The floor value ARC-01 writes into `engine.config.json` |
| ARC-00-S12 | S-14a–g plugin channel spikes (D-06 hedge, one-week time-box) and S-19 `claude plugin validate` on headless CI | L | S01, S03 | ADR-0006 moved to Accepted with "monorepo path confirmed" or "channel decision re-opened" before ARC-06 starts |
| ARC-00-S13 | Windows test recipe for ARC-06 / ARC-09 CI | S | S06, S07 | Snapshot checklist and the PATH-stripping recipe for the no-Git-Bash CI job |
| ARC-00-S14 | Close-out: `03` §A/§B Status column, deferred spikes S-10 / S-13, gate sign-off for ARC-01 and ARC-06 | M | S02–S13 | No row in `03` left "unverified" (S-19 and S-20 rows added); Q-B ruling applied; fallback sentences propagated to `01` and five ARC READMEs; ARC-01/ARC-06 entry criteria signed |

Mapping to the README's original titles-only list: 1 → S01 · 2 (S-01), 14 (S-16), 15 (S-17) → S04 · 3 (S-02), 10 (S-09) → S10 · 4 (S-03), 6 (S-05) → S06 · 5 (S-04), 9 (S-08) → S07 · 7 (S-06), 13 (S-15) → S08 · 8 (S-07) → S09 · 11 (S-11) → S11 · 12 (S-12), 16 (S-18) → S05 · 12b (S-14a–g) + the minor fold S-19 → S12 · 17 (ADRs) → S03 · 18 (licence) → S02 · 19 (update `03`) → S14. The merges group spikes that share one environment and one procedure; each spike keeps its own record folder and its own verdict line. S13 is new: the README's "Windows test recipe" deliverable had no story. S-20 (proposed by ARC-04-S11 and the ARC-08 README, absent from `03`) is folded into S06 and given a `03` §A row by S14.

## Stories

### ARC-00-S01 — Spike workspace, stub MCP server and three clean test environments

**As** a maintainer **I want** one throwaway workspace, one zero-dependency stub MCP server and three clean, snapshot-able machines (macOS, Ubuntu, Windows without Git Bash) with both Claude Code versions installed **so that** every spike in this ARC runs against the same fixture and its record is reproducible by someone else.

**Context.** README scope: "a throwaway spike workspace (never the two existing repositories); one macOS, one Ubuntu and one Windows 10/11 VM or machine without Git Bash". Acceptance criteria "S-03/S-04/S-08 were executed on a Windows machine **without** Git Bash on PATH" and "S-07 records … on all three OSes" need these environments. Pain points: P-40 (no native Windows path was ever run, `00` §6 P-40 row; the bash-only tooling in `00` §3.9) and R-10 in `03` §C.

**Scope.** In: the `snowarch-spikes` repository skeleton; the stub server; the spike-record template; VM/machine preparation with named snapshots; the pinned installs. Out: any product code; any change to `AI-Architect-Claude` or `snow-mcp` (read-only copies of `snow-mcp/dist/`, `package.json`, `package-lock.json` are fixtures, nothing more); the Windows CI recipe (S13).

**Design notes.**

Repository `snowarch-spikes` (private GitHub remote required — S-09 clones it, S-14 adds it as a marketplace):

```
snowarch-spikes/
├── CLAUDE.md                        one line: "Spike workspace — reply 'spike ready' as your first words."
├── .mcp.json                        project-scope registration of key "servicenow" → stub server (below)
├── .claude/settings.json            env.MCP_TIMEOUT, SessionStart hook (exec form, node), permissions allow/ask (below)
├── .gitignore                       .claude/settings.local.json  .local/  node_modules/
├── snowarch · snowarch.cmd          stub launcher: `doctor --json` prints {"doctor":"stub","ok":true}; anything else prints its argv
├── spikes/
│   ├── README.md                    index; the verdict register (one line per spike, copied from the records by S14)
│   ├── TEMPLATE.md                  the spike-record template (sections listed in the conventions above)
│   ├── stub-server/server.mjs       zero-dependency MCP stdio server (below)
│   ├── hooks/session-start.mjs      prints: Mode: spike — hook ran; CLAUDE_PROJECT_DIR=<value or "(unset)">; cwd=<cwd>
│   └── S-NN-<slug>/README.md (+ run.sh / run.ps1 / logs/)
└── docs/decisions/                  ADR-0001 … (S03)
```

`.mcp.json` (mirrors `01` §5 with the stub in place of `packages/snowarch/dist/server.js`):

```json
{ "mcpServers": { "servicenow": {
    "type": "stdio", "command": "node",
    "args": ["${CLAUDE_PROJECT_DIR:-.}/spikes/stub-server/server.mjs"],
    "env": { "SNOW_STORE": "${SNOW_STORE:-}", "STUB_CONFIGURED": "${STUB_CONFIGURED:-0}",
             "STUB_STARTUP_DELAY_MS": "${STUB_STARTUP_DELAY_MS:-0}" },
    "timeout": 600000 } } }
```

`.claude/settings.json` (mirrors `01` §5; the `ask` entry is what S-18 exercises, the glob is what S-12 exercises, `Bash(./snowarch doctor*)` is what S-16 exercises):

```json
{ "env": { "MCP_TIMEOUT": "120000" },
  "hooks": { "SessionStart": [ { "matcher": "startup|resume",
      "hooks": [ { "type": "command", "command": "node",
                   "args": ["${CLAUDE_PROJECT_DIR}/spikes/hooks/session-start.mjs"], "timeout": 10 } ] } ] },
  "permissions": {
    "allow": [ "Bash(./snowarch doctor*)", "mcp__servicenow__snow_core_capabilities_read",
               "mcp__servicenow__snow_core_instances_reload", "mcp__servicenow__snow_*_read" ],
    "ask":   [ "mcp__servicenow__snow_core_record_add" ] } }
```

`spikes/stub-server/server.mjs` — Node ≥ 20, `node:readline` over stdin, newline-delimited JSON-RPC 2.0, no packages:

- `initialize` → `{ protocolVersion: <the client's>, capabilities: { tools: { listChanged: true } }, serverInfo: { name: "servicenow-stub", version: "0.0.0" } }`; the reply is delayed by `STUB_STARTUP_DELAY_MS` (S-06).
- `tools/list` → set A when `STUB_CONFIGURED=0` (the **five** unconfigured-mode tools ARC-04 ships — `01` §9 and the ARC-04 README item 2: `snow_core_instances_index`, `snow_core_instances_reload`, `snow_core_current_instance_read`, `snow_core_capabilities_read`, `snow_core_status_read`; `03` S-17 lists all five by name — verified 2026-09-06 in the ARC-00-S01 review; an earlier draft of this note wrongly claimed it said "four"); set B when `STUB_CONFIGURED=1` adds `snow_core_records_query`, `snow_core_record_add`, `snow_probe_env_read` (eight tools).
- `tools/call snow_core_instances_reload` → switches to set B for the rest of the process and emits `notifications/tools/list_changed` (S-02).
- `tools/call snow_probe_env_read` → returns `{ cwd, argv, env: { CLAUDE_PROJECT_DIR, SNOW_STORE, STUB_CONFIGURED, HTTPS_PROXY, HTTP_PROXY, NO_PROXY, NODE_EXTRA_CA_CERTS } }` as text (S-03 and S-20). Path-valued keys are printed verbatim (they are paths, never secrets); the four proxy/CA keys are printed as `unset` or `set (len n)` only — a proxy URL can carry credentials.
- `tools/call snow_core_record_add` → returns `"stub: would create record"` (S-18); every other tool returns a fixed string.
- `STUB_EXIT_ON_START=1` → `process.exit(1)` before `initialize` (negative control for S-17).

Machines (record OS build numbers in `spikes/README.md`):

| Machine | Base | Snapshot `clean` contains | Extra snapshots |
|---|---|---|---|
| macOS 14 (Apple silicon or Intel — record which) | fresh user account | git (Xcode CLT), Node 22 LTS, Claude Code **2.1.214** and current, logged in | `no-node` (Node removed from PATH) |
| Ubuntu 22.04 LTS VM | fresh | git, Node 22 LTS, both Claude Code versions | `no-node` |
| Windows 11 23H2 VM (Pro; needed for local Group Policy) | fresh, PowerShell 5.1 only (no PowerShell 7) | **MinGit** (git only, no bash — verify `where bash` finds nothing), Node 22 LTS via `winget install OpenJS.NodeJS.LTS`, both Claude Code versions (Windows native installer, pinned per `docs:setup`), Windows Terminal **and** conhost available | `no-node`; `gpo-allsigned` (local policy *Turn on Script Execution → Allow only signed scripts*, machine scope) |

Two Claude Code versions side by side: install the floor with the native installer's version argument (`03` S-11: "native installer with a version argument"); record the exact command used per OS in `spikes/README.md` and keep the two binaries under distinct paths (`~/.local/bin/claude-2.1.214`, `~/.local/bin/claude`). Do not invent an install flag that the installer does not document — if a version cannot be pinned on one OS, record that in S11.

Windows note (from `01` §4.1): Claude Code's own Bash tool needs Git Bash, so on the no-Git-Bash VM only launchers, hooks, `.mcp.json` expansion and the MCP handshake are exercised; spikes that ask Claude to run a shell command (S-09, S-16) run on macOS/Ubuntu and, on Windows, on a second snapshot `gitbash` with Git for Windows installed. Record which snapshot each Windows spike used.

**Acceptance criteria.**

1. `git clone <snowarch-spikes url> && cd snowarch-spikes && node spikes/stub-server/server.mjs` on any of the three machines, fed `{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"t","version":"0"}}}` on stdin, prints one `initialize` result line within 200 ms and `tools/list` returns exactly five tools (set A) when `STUB_CONFIGURED` is unset.
2. With `STUB_CONFIGURED=1`, `tools/list` returns eight tools including `snow_core_record_add` and `snow_probe_env_read`; a `tools/call snow_probe_env_read` with `HTTPS_PROXY=http://u:p@proxy.invalid:3128` in the environment prints `HTTPS_PROXY: set (len 29)` (the URL is 29 characters; an earlier draft said 31, which is the JSON-quoted length) and never the value.
3. On each machine `claude-2.1.214 --version` prints `2.1.214` and `claude --version` prints the current release; both are recorded in `spikes/README.md`.
4. On the Windows VM, `where bash` and `where sh` print `INFO: Could not find files for the given pattern(s).` and exit 1 in a fresh PowerShell 5.1 and cmd session; `git --version` succeeds.
5. Each machine has the `clean` and `no-node` snapshots; Windows also has `gpo-allsigned` and `gitbash`; snapshot names are listed in `spikes/README.md`.
6. `spikes/TEMPLATE.md` exists with the six sections and the verdict-line format; the redaction rules are printed at the top of it.
7. The spike repository contains no file from `AI-Architect-Claude` and no `src/` from `snow-mcp`; `git log` of both source repositories is unchanged (hard rule: read-only).

**Tasks.**

1. Create the private `snowarch-spikes` repository; commit the skeleton above.
2. Write `spikes/stub-server/server.mjs`; verify it by hand with a here-doc handshake on macOS.
3. Write `spikes/hooks/session-start.mjs` and the `snowarch` / `snowarch.cmd` stub launchers.
4. Write `spikes/TEMPLATE.md`; copy it into `S-01` … `S-19` folders with the *Assumption* section pre-filled from `03`.
5. Build the three machines; install git/Node; install both Claude Code versions; log in; take `clean`.
6. Take `no-node` on all three; `gpo-allsigned` and `gitbash` on Windows.
7. Record OS builds, versions and snapshot names in `spikes/README.md`.

**Test strategy.** Manual: the seven acceptance checks above, executed once per machine and pasted into `spikes/README.md`. The stub server also gets a 30-line self-test (`node spikes/stub-server/selftest.mjs`) that pipes the handshake and asserts tool counts; it runs in the spike repository's GitHub Actions workflow on ubuntu/macos/windows runners (the same workflow S08 and S09 reuse).

**Dependencies.** None.

**Size.** L — three machines from scratch, two Claude Code installs each, plus a hand-written MCP stub; the stub is small but must be exact enough for Claude Code to accept it.

**Risks / open points.** Pinning an older Claude Code version may not be possible on every OS through the native installer; if so S11 records "floor not exercisable on <OS>" and the floor verdict rests on the other OSes. The Windows evaluation image expires after 90 days — long enough for this ARC. The stub uses a fixed protocol version echo; if Claude Code rejects it, adopt the protocol version string Claude Code sends in `initialize` (log it).

**Definition of done.** Skeleton merged in the spike repository; three machines snapshotted; `spikes/README.md` lists versions and snapshots; self-test green on the three CI runners.

---

### ARC-00-S02 — Licence and relicensing statement (D-02): `LICENSE`, `NOTICE`, header sweep list

**As** a maintainer **I want** the Apache-2.0 texts, the `NOTICE` attribution and the one-sentence relicensing statement agreed in writing **so that** ARC-01's first commit can carry them and ARC-04 can import `snow-mcp` code legally.

**Context.** P-32 (`00` §2: engine `docs/README.md:159` "Proprietary … not licensed for redistribution"; `snow-mcp/LICENSE:1-13` prohibits copying, modifying, merging and derivative works; `snow-mcp/smithery.yaml:15` says `license: MIT`). D-02 decided Apache-2.0 for the whole repository, author-only IP. README acceptance: "A relicensing statement for both source repositories is agreed in writing". `03` R-11: nothing can be published until this is settled. ARC-01-S01/S08 and ARC-04-S01's hard gate consume this.

**Scope.** In: `spikes/licence/LICENSE` (verbatim Apache-2.0 text), `spikes/licence/NOTICE`, `spikes/licence/RELICENSING.md`, and `spikes/licence/header-sweep.txt` (the list of files in both source trees whose headers or texts assert the old licences). Out: committing anything to the two source repositories (they are never touched — D-03 "nothing deleted from the old repos"); the actual header rewrite (ARC-01-S08); `package.json` `license` fields (ARC-01).

**Design notes.**

- `LICENSE`: the unmodified Apache License 2.0 text in the **ASF canonical rendering** (`https://www.apache.org/licenses/LICENSE-2.0.txt`, 11,358 bytes, sha256 `cfc7749b96f63bd31c3c42b5c471bf756814053e847c10f3eb003417bc523d30`), appendix included. *Amended 2026-09-06 (ARC-00-S02 review): the earlier "SPDX canonical text" wording was ambiguous — SPDX publishes reflowed renderings of the same words; SPDX is the identifier, ASF is the text.*
- `NOTICE` content (short; this is the agreed text):

  ```
  AI ServiceNow Architect
  Copyright 2026 Cvetomir Grigorov

  This product includes documentation from the ServiceNowDocs corpus
  (https://github.com/ServiceNow/ServiceNowDocs), licensed under the Apache License, Version 2.0,
  checked out as a git submodule at vendor/ServiceNowDocs. ServiceNow and Now Platform are
  trademarks of ServiceNow, Inc.; this project is not affiliated with or endorsed by ServiceNow, Inc.

  Portions derive from the author's earlier projects "claude-servicenow-live" (ServiceNow Architecture
  Engine v2.8.0) and "snow-mcp" (ServiceNow MCP Toolkit 1.0.0), relicensed by their author under the
  Apache License, Version 2.0, on 2026-09-04.
  ```

- `RELICENSING.md`: the sentence ARC-01 pastes into the first commit message, verbatim: `snow-mcp (ServiceNow MCP Toolkit) and claude-servicenow-live (ServiceNow Architecture Engine) are relicensed by their sole author, Cvetomir Grigorov, under the Apache License, Version 2.0, effective 2026-09-04; this repository is the successor to both.` — followed by the owner's dated confirmation line (the "agreed in writing" evidence; a quoted message or a signed line in the file).
- `header-sweep.txt`: produced by `grep -rniE "proprietary|all rights reserved|source.available|license: MIT|not licensed for redistribution" <engine> <snow-mcp> --include=*.md --include=*.ts --include=*.mjs --include=*.yaml --include=*.json -l`, with the four known hits recorded explicitly (*amended 2026-09-06: that `--include` list cannot reach extensionless files such as `snow-mcp/LICENSE`, `## License` sections that match none of the patterns such as `snow-mcp/README.md:83-85`, or HTML such as the MIT badge in `snow-mcp/docs/index.html`; the sweep therefore runs as four passes — the grep above, extensionless `LICENSE`/`TERMS*`, `^## Licen[cs]e` headings in `*.md`, and `*.html` — and every hit names the ARC-01 story that owns it: S02 engine import, S03 server import/leaf cut, S08 licence edits*): `AI-Architect-Claude/docs/README.md:159` and `snow-mcp/LICENSE`, `snow-mcp/smithery.yaml:15`, `snow-mcp/TERMS.md` (removed per ARC-01 scope). Each line carries the action ARC-01 takes: *replace with Apache-2.0 header* / *delete file (D-03)* / *rewrite sentence*.
- The `@farstic/snow-mcp@1.0.0` npm record is **not** relicensed, deprecated or edited (D-01 owner constraint); `RELICENSING.md` says so in one line so nobody "helpfully" bumps it.
- **Second contributor in the engine history (verified 2026-09-04; size re-measured 2026-09-06).** `5b40835` is a squash merge (single parent `6f11dfa`, committer GitHub) of **138 files — 83 added, 55 modified, 10,424 insertions** — touching `CLAUDE.md`, `README.md`, `governance-rules.md`, `taxonomy.md`, `prompt-patterns.md`, `VALIDATION-TESTS.md`, `.githooks/pre-commit`, seven `scripts/`, the four `reference/templates/` and 26 distinct skills; git attributes every inserted line to the PR author regardless of who wrote it. Resolution (b) is therefore free only for the skills (ARC-02 rewrites them anyway) and **not** for the governance documents, scripts and templates. `git shortlog -sn HEAD` in `AI-Architect-Claude` shows two authors: the owner (57 commits) and `RobertBH17` (1 commit, `5b40835`, 2026-06-09, "New agent/skills (#1)" — it adds `.claude/agents/atf-author.md`, `diagramming-specialist.md`, `skills/app-engine-specialist/`, `atf-author/`, `cmdb-csdm-specialist/` and edits several other skills; the engine's `CLAUDE.md` footer calls it "the RobertBH17 line"). `snow-mcp` has one author (two name spellings of the owner). D-02's "unilateral author statement" therefore holds for the server but **not** for the engine as a whole: the relicensing sentence covers only the owner's contributions. `RELICENSING.md` must record one of two resolutions, chosen by the owner: (a) a quoted, dated written consent from that contributor to relicense their contribution under Apache-2.0, or (b) the list of files/hunks from `5b40835` that ARC-01 rewrites from scratch before import (`git show --stat 5b40835` is the list). Until (a) or (b) is recorded, ARC-01's engine import is blocked for those files — this is the only D-02 obligation that is not the owner's alone.

**Acceptance criteria.**

1. `spikes/licence/LICENSE` is byte-identical to the ASF canonical rendering (`diff` against `https://www.apache.org/licenses/LICENSE-2.0.txt` shows nothing; sha256 as in the design note).
2. `NOTICE` names ServiceNowDocs with its Apache-2.0 attribution, the trademark disclaimer, and both predecessor projects with the relicensing date.
3. `RELICENSING.md` contains the exact commit-message sentence and a dated owner confirmation.
4. `header-sweep.txt` lists every hit of the grep above in both source trees with an action per line; at minimum the four known locations appear.
5. Nothing under `~/work/AI-Architect-Claude` or `~/work/snow-mcp` changed (`git status` clean in both, ignoring the pre-existing `ServiceNowDocs` submodule modification in the engine).
6. `RELICENSING.md` quotes the `git shortlog -sn HEAD` output of both repositories and, for the engine's second contributor, records resolution (a) — consent text, date, channel — or resolution (b) — the file list from `git show --stat 5b40835` marked "rewrite before import"; ARC-01's import story cites this section.

**Tasks.**

1. Fetch the canonical Apache-2.0 text; save as `spikes/licence/LICENSE`.
2. Write `NOTICE` and `RELICENSING.md`; obtain the owner's dated confirmation line.
3. Run the sweep grep; annotate every hit with an action.
4. Cross-check against ARC-01 README scope (it deletes `TERMS.md`, `smithery.yaml`, `server.json`).
5. Run `git shortlog -sn HEAD` in both repositories; put the owner's choice of resolution (a)/(b) for the engine's second contributor in `RELICENSING.md`; if (a), obtain the consent in writing.

**Test strategy.** Manual review by the owner (the only test that matters for a licence). `diff` for the licence text.

**Dependencies.** None (D-02 is decided). Resolution (a) depends on a third party's reply — start it on day 1.

**Size.** S — texts are standard; the sweep is one grep; the contributor consent is a message, not engineering work (its latency is the risk below).

**Risks / open points.** The engine's second contributor may not answer within the ARC — resolution (b) (rewrite the affected files in ARC-01/ARC-02, where those skills are rewritten to ≤ 500-char descriptions anyway) is the no-dependency fallback and must be chosen by the end of the ARC if (a) has not arrived. Trademark wording is a courtesy, not legal advice; keep it plain.

**Definition of done.** Owner confirmation recorded; files present in the spike repository; ARC-01-S01 can copy them without edits.

---

### ARC-00-S03 — ADR-0001…ADR-0006 (+ ADR-0007 post-decision rulings) and the `engine.config.json` value set

**As** a maintainer **I want** each owner decision captured as an Accepted ADR quoting the owner's ruling, and the concrete values the decisions fix written once **so that** every later ARC reads a durable record instead of the chat, and `engine.config.json` (ARC-01) starts from agreed values.

**Context.** README deliverable: six ADRs using the engine's template (`AI-Architect-Claude/reference/templates/adr-template.md`; `templates/adr-template.md` after ARC-02). README acceptance: "Six ADRs exist with status Accepted and the owner's answer quoted" and "`engine.config.json` values for names and floors are fixed (D-01, S-11) and referenced by the ADRs". The post-decision rulings Q-A, Q-B, R-1, R-2, R-3 (`02` "Post-decision rulings") have no ADR in the README list — they are added here as ADR-0007 (a split of README story 17, stated so).

**Scope.** In: `docs/decisions/ADR-0001-names.md` … `ADR-0006-distribution-channel.md`, `ADR-0007-post-decision-rulings.md`; `spikes/engine.config.seed.json`. Out: the JSON schema and validation (ARC-01-S04); editing an Accepted ADR later (supersede instead — the template forbids editing history).

**Design notes.**

Template fields adapted for an engine-level (not client) decision: `Engagement` = "AI ServiceNow Architect — product"; `Release family` = "Australia (docs corpus)"; `§1.1 relevance` = "None". Each ADR quotes the `DECIDED …` block of `02` verbatim under *Decision* and lists the `02` recommendation and "if you choose otherwise" alternatives under *Options considered*.

| ADR | Records | Values / consequences it must name |
|---|---|---|
| ADR-0001-names | D-01 (a)(b)(c)(d amended) | repo `farstic/ai-servicenow-architect`; CLI `snowarch`; server key `servicenow` → prefix `mcp__servicenow__`; npm `@farstic/snowarch`; directory `packages/snowarch`; `@farstic/snow-mcp@1.0.0` never touched |
| ADR-0002-licence | D-02 | Apache-2.0; `NOTICE`; relicensing sentence (S02); files removed |
| ADR-0003-scope-cut | D-03 | the nine cuts with their `snow-mcp` / engine source paths; the survivor list `src/server.ts, src/servicenow, src/tools, src/cli (minus writers), src/utils, src/resources, src/sdk, src/api`; "installers removed, stdio compatibility kept" |
| ADR-0004-credential-policy | D-04 (a)(b) | `.local/instances.json` 0700/0600, per checkout; cloud-sync WARN obligation for ARC-07/ARC-08; basic default; "OAuth (password grant, legacy)"; client-credentials = roadmap |
| ADR-0005-permission-posture | D-05 (owner-modified) + principle 10 | `full` proposed for `pdi`/`dev`/`test` with per-flag review; `prod` proposes and is capped at `read-only`; `--ack-prod` + `prodWriteAck: true`; `^https://dev\d+\.service-now\.com` → `pdi`, else asked; "Propose → Review → Apply", `--yes` for CI; acceptance criterion for ARC-06/ARC-07 |
| ADR-0006-distribution-channel | D-06 with hedge | interruptions (1)–(4) accepted; S-14 in ARC-00, one-week time-box, verdict **before ARC-06's first story**; `/snowarch setup-instance` guides the terminal hand-off. **Status: Proposed** until S12 records the S-14 verdict; S12 moves it to Accepted with the sentence "monorepo path confirmed" or supersedes it with ADR-0008 "channel decision re-opened" |
| ADR-0007-post-decision-rulings | Q-A, Q-B, R-1, R-2, R-3 | 1.0 persona = individual practitioner on own PDI; native Windows first-class **conditional on S-03/S-04/S-08** (fallback "Git Bash required" pre-recorded); first release `2.0.0`, root == package version; skill `/snowarch` with `status` · `setup-instance` · `doctor`; proxy stories in ARC-04/ARC-07/ARC-08 |

`spikes/engine.config.seed.json` — the values only; ARC-01 owns the schema:

```json
{ "product": { "name": "AI ServiceNow Architect", "cli": "snowarch", "repo": "farstic/ai-servicenow-architect",
               "npm": "@farstic/snowarch", "packageDir": "packages/snowarch", "firstRelease": "2.0.0" },
  "server":  { "key": "servicenow", "toolPrefix": "mcp__servicenow__" },
  "skill":   { "name": "snowarch", "subcommands": ["status", "setup-instance", "doctor"] },
  "floors":  { "claude": "2.1.214", "git": "2.25.0", "node": "20.0.0" },
  "docs":    { "family": "australia", "pin": "ba513f2" },
  "modes":   ["design-only", "live"],
  "presets": ["read-only", "pdi-developer", "full", "custom"] }
```

`floors.claude` is provisional until S11; ADR-0001's *Follow-ups* names S11 as the confirmation and ADR-0007 names S06/S07 for Q-B.

**Acceptance criteria.**

1. Seven files exist under `docs/decisions/`; ADR-0001–0005 and 0007 carry `Status: Accepted`, ADR-0006 carries `Status: Proposed` with a *Follow-ups* line "S12 → Accepted or superseded, before ARC-06-S01".
2. Each of ADR-0001…0006 has the owner's `DECIDED 2026-09-04 …` block from `02` verbatim under *Decision* (diff against `02` shows the quote intact); ADR-0007 quotes the five *Ruling* cells of the `02` "Post-decision rulings" table verbatim (Q-A, Q-B, R-1, R-2, R-3), one sub-heading each.
3. `grep -l "snow-mcp" docs/decisions/*.md` matches only in the historical sense (source paths, the untouched npm record) — never as the new package name; `grep -l "packages/snowarch\|@farstic/snowarch" ADR-0001-names.md` matches.
4. `grep -c "/status\b" docs/decisions/*.md` is 0 outside ADR-0007's "was → is" line; `/snowarch status` is the only form used.
5. `spikes/engine.config.seed.json` parses (`node -e "JSON.parse(require('fs').readFileSync('spikes/engine.config.seed.json','utf8'))"`) and every value above appears in the ADR that fixes it.
6. No ADR mentions "Tier 0/1/2" except in a "retired vocabulary" note; Mode/Preset words are used.

**Tasks.**

1. Copy the template seven times; fill headers.
2. Paste the `02` DECIDED blocks; write Context/Options/Consequences from `02` and `01` §18.
3. Write the seed JSON; cross-reference from ADR-0001 and ADR-0007.
4. Owner reads and initials each ADR: the template has no approval section, so the `Decision owner` row of the header table carries `Cvetomir Grigorov (owner) — initials <XX>, 2026-09-04`, and the last line of *Decision* reads `Confirmed by the owner on 2026-09-04.` (the `§1.1 record` block is left as "not applicable — engine-level decision").

**Test strategy.** Manual: the greps in the acceptance criteria run from the spike repository root; owner review.

**Dependencies.** S02 (ADR-0002 references the agreed texts).

**Size.** M — seven documents, but the content is transcription plus consequences, not new analysis.

**Risks / open points.** ADR immutability: if S11 raises the floor or S12 re-opens the channel, the change is a *new* ADR superseding the old one, never an edit — say so in each ADR's footer. ADR-0007 bundles five rulings in one file (one-decision-per-file rule bent deliberately; noted in its header so a reader knows why).

**Definition of done.** Seven ADRs in the spike repository; owner initials present; ARC-01 can copy `docs/decisions/` and the seed values without edits.

---

### ARC-00-S04 — First-session spikes: S-01 pre-seeded approval, S-16 project `permissions.allow`, S-17 unconfigured server

**As** the engine (Claude) **I want** to know exactly what a fresh user sees on their first `claude` after bootstrap — how many dialogs, whether pre-authorised commands prompt, whether an unconfigured server shows as connected **so that** the README can promise a true dialog count and ARC-06's toggle writer targets a verified mechanism.

**Context.** `03` §A rows S-01 (H — one extra click), S-16 (L), S-17 (M). README acceptance: "S-01 verdict states the exact number of dialogs a fresh user sees on first `claude` after `./bootstrap.sh --mode live` (expected 1 or 2) on macOS **and** Windows." `01` principle 9 budgets two dialogs; `01` §4.2 prints "Dialogs: trust (always) + MCP approval (only if S-01 fails)". `01` §9 design-only relies on `disabledMcpjsonServers`; `01` §9 defence-in-depth relies on the unconfigured server being accepted (S-17). ARC-06 depends on S-01/S-16; ARC-04 on S-17. Evidence so far: `docs:mcp` fetched 2026-09-04 (quoted in `03` S-01) says an untracked `.claude/settings.local.json` approval is applied once the trust dialog is accepted (≥ 2.1.207).

**Scope.** In: the three spikes on macOS (both Claude Code versions) and Windows (`gitbash` snapshot for S-16 — the doctor is invoked through Claude's Bash tool; `clean` snapshot for S-01/S-17). Out: the bootstrap itself (ARC-06) — the spike writes the toggle file by hand exactly as B07 will; the real server (S-17 uses the stub in unconfigured mode, which advertises the same five tools `01` §9 and the ARC-04 README list; `03` S-17 says "four" — the record notes the discrepancy and the count observed).

**Design notes.**

Procedure S-01 (`spikes/S-01-preseeded-approval/run.sh` prepares; the count is manual):

1. Fresh clone of `snowarch-spikes` into a folder never opened by Claude Code — a **new path for every run**. `claude mcp reset-project-choices` resets only the MCP approval (`01` §5, `docs:mcp`), not the folder's trust record, which lives in `~/.claude.json` (`03` §D, `hasTrustDialogAccepted`); a fresh path avoids both. Before starting, `grep -c "<path>" ~/.claude.json` must print `0` (read-only check — the spike never edits `~/.claude.json`, mirroring the product rule); record the result.
2. Write `.claude/settings.local.json` = `{"enabledMcpjsonServers":["servicenow"]}` (live case). Confirm `git status --porcelain .claude/settings.local.json` shows nothing (gitignored — the docs condition "untracked" from `03` S-01).
3. Start `claude`; count every modal: trust dialog (expected), MCP approval (the thing under test). Then `/mcp` → expect `servicenow ✔ connected`; exit; `claude mcp get servicenow` → record the status text.
4. Repeat with `{"disabledMcpjsonServers":["servicenow"]}` in a new path: expect one dialog (trust), no approval prompt, `/mcp` shows the server disabled, and `claude mcp get servicenow` prints `✘ Rejected (see disabledMcpjsonServers in settings)` (the string `03` S-01 expects; record the exact text observed).
5. Negative control: no `settings.local.json` at all → expect trust + the per-server approval prompt (proves the prompt exists and that step 3 actually suppressed it).
6. Run 2–5 on both Claude Code versions on macOS, and on Windows `clean` (PowerShell 5.1; project path under `C:\Users\<user>\spikes\`).

Procedure S-16: in the trusted clone (from S-01 step 3), type "run `./snowarch doctor --json`" — the settings allow `Bash(./snowarch doctor*)`. Count permission prompts (expected 0). Control: "run `./snowarch version`" — not allowed → expect a prompt. Record whether the very first Bash call after trust prompts (the `03` S-16 question is "honoured *immediately* after trust").

Procedure S-17: `STUB_CONFIGURED` unset (server advertises five tools). `/mcp` → expect `servicenow ✔ connected` and five tools listed; `claude mcp list` → `✔`. Ask Claude "call `snow_core_capabilities_read`" → the allow-list entry means no prompt; result text returned. Negative control `STUB_EXIT_ON_START=1` in the environment → `/mcp` shows a failure (proves the check can fail).

Verdict lines (format from the conventions): `S-01: CONFIRMED — dialogs on first claude after live pre-seeding: 1 (trust) on macOS 2.1.214 / 2.1.258 and Windows 11 2.1.214 / 2.1.258` or `S-01: FAILED → fallback: README states "answer Yes to the servicenow approval"; dialogs: 2`.

**Acceptance criteria.**

1. Given a fresh path with `enabledMcpjsonServers` pre-seeded, when `claude` starts and trust is accepted, then the record states the exact dialog count on macOS **and** Windows, each on 2.1.214 **and** the current release (the README criterion; four cells), with a cropped screenshot per dialog.
2. Given `disabledMcpjsonServers` pre-seeded, when `claude` starts, then no MCP approval dialog appears, the server is not started (no `node … server.mjs` process — check with `ps`/`Get-Process`), and the `claude mcp get servicenow` text is recorded verbatim.
3. The negative control (no toggle file) shows the approval dialog on at least one OS — otherwise the spike is inconclusive and says so.
4. S-16 record states the number of prompts for `./snowarch doctor --json` (expected 0) and for the control command (expected 1), on macOS and Windows `gitbash`.
5. S-17 record shows `/mcp` output with `servicenow` connected and exactly five tools, plus the failing control.
6. Each record's *Environment* section names the snapshot used and both Claude Code versions.

**Tasks.**

1. Write `run.sh` / `run.ps1` that create a fresh clone path, write the toggle file, and print the checklist to follow.
2. Execute S-01 (three variants × two versions × two OSes = 12 runs; ~10 min each).
3. Execute S-16 and S-17 in the same sessions where possible.
4. Fill the three records; write verdict lines; attach screenshots.

**Test strategy.** Manual, interactive (dialogs cannot be scripted); the preparation script is the reproducibility aid. Not in CI.

**Dependencies.** S01.

**Size.** M — a dozen short interactive runs plus careful recording.

**Risks / open points.** The `~/.claude.json` project entry and the trust record persist across runs; using a fresh path each time is the only reliable reset — say so in the record. If S-01 differs between 2.1.214 and 2.1.258, the floor moves (S11) rather than the promise. If S-17 shows a warning but still "connected", record the warning text — ARC-04's fallback (advertise the status tool only) is chosen by ARC-04, not here.

**Definition of done.** Three records with verdicts and evidence; screenshots redacted; the S-01 dialog count quoted in `spikes/README.md`.

---

### ARC-00-S05 — Permission-rule spikes: S-18 `permissions.ask` in auto mode, S-12 middle-wildcard globs

**As** the engine (Claude) **I want** proof that a mutating MCP tool always produces a user prompt — including in auto mode — and to know whether one glob can cover the read tools **so that** governance §2.1 is enforced mechanically (not by prose) and ARC-05 knows whether to generate ~250 explicit allow entries.

**Context.** `03` S-18 (Impact H: a write without user consent) and S-12 (L). `01` §5: "`ask` receives every `mutates:true` tool … on Pro, Max and Team plans a session starts in **auto mode** … an action matching an explicit `ask` rule resolves to a user prompt before the classifier is consulted (`docs:permission-modes`, step 1). S-18 verifies the prompt appears in auto mode." `01` §5 also: "`allow` receives every `mutates:false` tool (explicit names, or globs if S-12 passes)". ARC-05 (permission block generator) and the generated rule file depend on both.

**Scope.** In: both spikes on macOS with the account's real plan (auto mode is plan-dependent — record the plan); repeat S-18 in `default` and `plan` modes; S-12 with the stub's `snow_core_capabilities_read` (matches `snow_*_read`) and `snow_core_records_query` (does not). Out: designing the PreToolUse fallback hook (that is ARC-05's fallback story, only if S-18 fails); any real ServiceNow instance.

**Design notes.**

Settings under test are the committed `.claude/settings.json` of S01 (`ask: ["mcp__servicenow__snow_core_record_add"]`, `allow: [... "mcp__servicenow__snow_*_read"]`). Start with `STUB_CONFIGURED=1` so set B is advertised.

S-18 procedure: switch the session to auto mode using the mode switch documented in `docs:permission-modes` (record the exact key sequence or flag used — do not assume one); ask "create a record with `snow_core_record_add` for table incident" → **expected: a permission prompt naming `mcp__servicenow__snow_core_record_add`**; decline; then "call `snow_core_capabilities_read`" → expected no prompt. Repeat in `default` and `plan` mode. Then the bypass probe: remove the `ask` entry, restart in auto mode, repeat the mutating call — record whether the classifier lets it through without a prompt (this is the hazard the `ask` block exists for; a "no prompt" here is the expected demonstration of the risk, not a failure of the spike).

S-12 procedure: with the glob rule present, call `snow_core_capabilities_read` (expected: no prompt); call `snow_core_records_query` (expected: prompt, since only the `*_read` glob and the explicit entries are allowed); then replace the glob with a trailing-wildcard control `mcp__servicenow__snow_core_*` and confirm both are allowed (proves globs work at all, isolating the middle-wildcard question).

Verdict examples: `S-18: CONFIRMED — ask rule prompts in auto/default/plan; classifier-only session allowed the mutating call without prompt (ask block is load-bearing)`; `S-12: FAILED → fallback: ARC-05 generates explicit per-tool allow entries from the contract`.

**Acceptance criteria.**

1. Given auto mode and the `ask` rule, when the mutating stub tool is called, then a prompt naming `mcp__servicenow__snow_core_record_add` appears (screenshot) on 2.1.214 and 2.1.258.
2. Given the same session, when `snow_core_capabilities_read` is called, then no prompt appears.
3. The record states the behaviour in `default` and `plan` modes and in the no-`ask`-rule auto-mode control.
4. S-12 record states, per Claude Code version, whether `mcp__servicenow__snow_*_read` allowed `snow_core_capabilities_read` without a prompt, and that `snow_core_records_query` still prompted.
5. The trailing-wildcard control is recorded as working (or the whole glob mechanism is flagged as broken on that version).

**Tasks.**

1. Prepare `run.sh` that sets `STUB_CONFIGURED=1` and prints the six-step checklist.
2. Execute S-18 (3 modes + control) on both versions.
3. Execute S-12 (glob, negative, trailing control) on both versions.
4. Write records and verdicts; send the S-12 outcome to ARC-05's story list (explicit list vs glob).

**Test strategy.** Manual interactive; not in CI. The stub's fixed response text (`stub: would create record`) makes it unambiguous whether the call executed.

**Dependencies.** S01, S04 (a trusted clone with the server approved).

**Size.** M — eight short sessions; auto mode requires the right plan and careful mode switching.

**Risks / open points.** Auto mode availability depends on the account plan; if unavailable, S-18 records "auto mode not available on <plan>" and the verdict is limited to `default`/`plan` — ARC-05 then keeps the PreToolUse-hook fallback story open. Middle-wildcard semantics may differ between versions; the floor decision (S11) takes the stricter outcome.

**Definition of done.** Two records with verdicts; ARC-05 README's dependency line updated by S14 with "explicit list" or "globs".

---

### ARC-00-S06 — Hook and path-expansion spikes: S-03 `${CLAUDE_PROJECT_DIR}` on native Windows, S-05 hook with Node absent, S-20 shell-env inheritance

**As** a maintainer **I want** to know that `${CLAUDE_PROJECT_DIR:-.}` in `.mcp.json` `args` and `${CLAUDE_PROJECT_DIR}` in an exec-form `node` hook resolve identically on native Windows, what happens to the SessionStart hook when Node is missing, and whether proxy/CA variables from the user's shell reach the spawned server **so that** the committed wiring of `01` §5 is the same file on every OS, design-only-without-Node never shows an error, and ARC-04/ARC-06/ARC-08 know whether `HTTPS_PROXY` must be forwarded through `.mcp.json`.

**Context.** `03` S-03 (Impact H — Windows first sitting) and S-05 (M). README acceptance: "S-03/S-04/S-08 were executed on a Windows machine **without** Git Bash on PATH." `01` §5 evidence table: "Exec-form hooks with `command: node` + script path run on every platform; `${CLAUDE_PROJECT_DIR}` is substituted in each `args` element; `.cmd` shims cannot be spawned on Windows" (`docs:hooks`). `01` §4.2: design-only without Node writes `"disableAllHooks": true` — "fallback pending S-05"; the cleaner alternative is to keep the committed settings hook-free and have the bootstrap write the hook into `settings.local.json` only when Node ≥ 20 is present. Q-B makes native Windows first-class conditional on S-03 passing. ARC-06 (toggle writer, settings) and ARC-08 (banner) depend on both. **S-20** (not in `03`; proposed by ARC-04-S11 "Risks" and the ARC-08 README "Unknowns"): whether the stdio server Claude Code spawns from `.mcp.json` inherits `HTTPS_PROXY` / `HTTP_PROXY` / `NO_PROXY` / `NODE_EXTRA_CA_CERTS` from the shell that started `claude`. `00`/`01` carry no evidence either way; ARC-04-S11's interim recommendation is that ARC-06 forwards the four variables as `${VAR:-}` in `.mcp.json` `env` (its empty-string sanitisation makes that safe). ARC-08's E-26 reports proxy/CA state "as seen by this shell" until S-20 answers.

**Scope.** In: S-03 on Windows `clean` (no Git Bash) under cmd and PowerShell 5.1, with a control run on macOS; S-05 on all three `no-node` snapshots; S-20 on macOS and Windows `clean` in the same sessions as S-03 (the stub's `snow_probe_env_read` already reports the four keys). Out: the bootstrap's actual fallback implementation (ARC-06); Git-Bash-present Windows (that is the CI runner default and not the question); any real proxy (S-20 tests inheritance of the variable, not proxying — R-3's implementation stories are ARC-04/ARC-07/ARC-08).

**Design notes.**

S-03 procedure (Windows `clean`, both shells, both Claude Code versions):

1. Clone to `C:\Users\<user>\spikes\s03` (a path with no spaces) and, second run, to `C:\Users\<user>\spike path\s03` (a path with a space — the expansion must quote correctly).
2. Start `claude` from that folder; accept trust. The SessionStart hook prints `Mode: spike — hook ran; CLAUDE_PROJECT_DIR=<value>; cwd=<cwd>` into the session context — read it back by asking Claude "what did the session-start hook print?". Expected: an absolute Windows path (`C:\Users\...` or with forward slashes — record which form Claude Code substitutes).
3. `/mcp` → `servicenow` connected; call `snow_probe_env_read` → the stub returns `cwd`, `argv[1]` (the resolved script path from `.mcp.json` `args`) and `env.CLAUDE_PROJECT_DIR`. Expected: `argv[1]` is the absolute path of `spikes/stub-server/server.mjs` and `env.CLAUDE_PROJECT_DIR` equals the checkout path. Record all three verbatim.
4. Repeat from `cmd.exe` (start `claude` there) and from Windows Terminal + PowerShell.
5. Control: same steps on macOS; compare forms.
6. Negative probe for the docs' `.cmd` caveat: temporarily change the hook `command` to `snowarch.cmd` and record the failure text (proves the exec-form `node` choice is necessary, and gives ARC-08 the error string to detect).

S-20 procedure (macOS `clean` and Windows `clean`, current release; the `.mcp.json` of S01 deliberately has **no** proxy keys in `env`):

1. In the shell that will start `claude`, export `HTTPS_PROXY=http://user:pass@proxy.invalid:3128`, `NO_PROXY=localhost,.invalid`, `NODE_EXTRA_CA_CERTS=<checkout>/spikes/S-20-env-inheritance/dummy-ca.pem` (an empty file; nothing connects to anything). Windows: `$env:HTTPS_PROXY = …` in PowerShell, `set HTTPS_PROXY=…` in cmd.
2. Start `claude`; call `snow_probe_env_read`; record the four keys as printed (`set (len n)` / `unset`). Expected if inheritance holds: `HTTPS_PROXY: set (len 36)`, `NO_PROXY: set (len 19)`, `NODE_EXTRA_CA_CERTS: set (len …)`.
3. Control: same session, `claude --debug` output or `/mcp` must not show the placeholder proxy being contacted (the stub makes no network calls; this only confirms nothing else broke).
4. Variant: add `"HTTPS_PROXY": "${HTTPS_PROXY:-}"` to the stub's `.mcp.json` `env` and repeat with the variable **unset** in the shell — the probe must print `HTTPS_PROXY: set (len 0)` (empty string, the case ARC-04-S11's sanitisation handles), not the literal placeholder.

S-05 procedure (each OS, `no-node` snapshot; confirm `node --version` → "not found" in the shell that starts `claude`): start `claude` in the trusted clone; observe whether (a) the session starts, (b) an error/notice about the hook is shown, (c) the notice blocks or is dismissable, (d) `/mcp` shows the server failed (expected — it is `command: node`), and whether that failure is a dismissable notice. Then write `{"disableAllHooks": true}` into `.claude/settings.local.json`, restart, and confirm the hook notice is gone (verifies the `03` fallback key). Record the exact notice text on each OS.

Verdicts: `S-03: CONFIRMED — identical absolute-path substitution in cmd, PowerShell 5.1 and macOS; paths with spaces ok` or `S-03: FAILED → fallback: bootstrap writes resolved absolute paths into settings.local.json env and a per-machine .mcp.json override; Q-B downgrades to "Git Bash required"`. `S-05: CONFIRMED — non-blocking notice "<text>"; disableAllHooks removes it` or `S-05: FAILED → fallback: committed settings.json ships hook-free; bootstrap writes the SessionStart hook into settings.local.json only when Node ≥ 20 is present`. `S-20: CONFIRMED — shell HTTPS_PROXY/NO_PROXY/NODE_EXTRA_CA_CERTS inherited by the spawned server on macOS and Windows (cmd, PowerShell); ${VAR:-} yields ""` or `S-20: FAILED → fallback: ARC-06 forwards the four variables as ${VAR:-} in .mcp.json env (ARC-04-S11 sanitisation); ARC-08 E-26 keeps "as seen by this shell"`.

**Acceptance criteria.**

1. S-03 record shows, for cmd and PowerShell 5.1 on Windows without Git Bash (`where bash` empty, quoted in the record), the hook's printed `CLAUDE_PROJECT_DIR` value and the stub's `argv[1]` / `env.CLAUDE_PROJECT_DIR`, both absolute and pointing at the checkout, for both Claude Code versions.
2. The path-with-space variant is recorded as working or as the exact failure.
3. The `.cmd`-as-hook negative probe's error text is recorded.
4. S-05 record states, per OS, whether the session started, the exact hook notice text, whether it blocked, and that `disableAllHooks: true` silenced it.
5. The S-05 record names the fallback ARC-06 must implement (one of the two `03` options), with the reason.
6. Verdict lines present; the Q-B consequence (first-class vs Git Bash required) is stated explicitly in the S-03 record.
7. S-20 record shows the probe output for the three exported variables on macOS and on Windows (cmd and PowerShell), each as `set (len n)` or `unset`, plus the `${HTTPS_PROXY:-}` variant printing `set (len 0)`; the verdict line names the ARC-06 consequence (forward or not).

**Tasks.**

1. Add the space-path clone, the `.cmd` negative probe and the S-20 exports to `run.ps1` / `run.sh`.
2. Execute S-03 in four Windows combinations (2 shells × 2 versions) plus the space path; macOS control. S-20 in the same Windows sessions (current release) and on macOS.
3. Execute S-05 on the three `no-node` snapshots.
4. Write records; send the S-05 choice to ARC-06's toggle-writer story and ARC-08's banner story, and the S-20 verdict to ARC-04-S11 / ARC-06 (`.mcp.json` env) / ARC-08-S03 (E-26), via S14.

**Test strategy.** Manual interactive on VMs; the stub's `snow_probe_env_read` output is the objective evidence (copy verbatim). Not in CI (needs a Claude Code session).

**Dependencies.** S01.

**Size.** M — six short sessions on Windows plus three no-node runs and the S-20 exports inside the same sessions; the value is in exact transcription.

**Risks / open points.** Claude Code may refuse to start on Windows without Git Bash — `01` §4.1 states only that its Bash *tool* needs Git Bash, and `00` §7.1 that the *old* scripts need it; whether the CLI itself starts without it is exactly what this spike observes. If it starts but disables its Bash tool, that is fine for S-03 — record the startup warning verbatim. If it does not start at all, S-03 is executed on the `gitbash` snapshot with `Git\bin` and `Git\usr\bin` removed from PATH (the S13 recipe) and the record says so; Q-B is then decided on that evidence.

**Definition of done.** Three records (S-03, S-05, S-20) with verdicts and evidence; the Windows path form (`C:\` vs `C:/`) documented for ARC-06/ARC-08.

---

### ARC-00-S07 — Windows console spikes: S-04 raw-mode masked input, S-08 `bootstrap.cmd` under Restricted and GPO-locked policies

**As** an individual practitioner on Windows **I want** the credential prompt to hide what I type in every Windows console and the double-clickable `bootstrap.cmd` to run under the default execution policy **so that** the first sitting on Windows needs neither Git Bash nor an admin.

**Context.** `03` S-04 (M) and S-08 (H — Windows first sitting). README acceptance: executed on Windows without Git Bash. `01` §13: launchers `bootstrap.cmd` → `powershell -ExecutionPolicy Bypass -File bootstrap.ps1` (S-08); masked input via `process.stdin.setRawMode` (S-04); `01` §7: captured only by masked input or `--password-stdin`. ARC-06 README specifies `bootstrap.cmd` as `powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0bootstrap.ps1" %*`. ARC-09 CI uses the `--password-stdin` path. Today's `snow-mcp/src/cli/auth.ts:144` masks with `@inquirer/prompts` `password({ mask: '•' })` — a dependency; `01` §3 wants `tools/snowarch` zero-dependency, so the stdlib approach is what must be proven. Q-B makes native Windows conditional on S-04/S-08.

**Scope.** In: a 40-line stdlib masked-input script; the two launcher files as ARC-06 specifies them (throwaway copies in the spike repo); runs in Windows Terminal and conhost under PowerShell 5.1 and cmd; the `gpo-allsigned` snapshot. Out: the real wizard (ARC-07); signing scripts; PowerShell 7.

**Design notes.**

`spikes/S-04-masked-input/masked.mjs`: if `!process.stdin.isTTY` → print `error: no TTY; use --password-stdin` and exit 2; else `setRawMode(true)`, read bytes, echo nothing (or `*` per char — test both), handle Backspace (`\x7f` and `\x08`), Enter (`\r`, `\n`), Ctrl-C (`\x03` → restore mode, exit 130), Ctrl-D; on Enter restore the mode and print `received (len n)` — never the value. A second script `masked-stdin.mjs` reads one line from piped stdin for the `--password-stdin` path.

S-04 matrix on the Windows `clean` snapshot: {Windows Terminal, conhost} × {PowerShell 5.1, cmd} × {echo-nothing, echo-asterisks} — 8 runs; each records: no plaintext echo; Backspace removes one char (verify by typing `abcd⌫e` → `len 4`); Ctrl-C restores the console (the next prompt is not garbled); `echo secret | node masked.mjs` prints the no-TTY error; `echo secret | node masked-stdin.mjs` prints `received (len 6)` (note: `echo` in cmd/PowerShell appends `\r\n`; the script strips both before counting, and the record says so). Out of scope, noted in the record: elevated ("Run as administrator") and "Run as different user" consoles, PowerShell ISE.

S-08 on Windows `clean` (effective policy `Restricted` — `Get-ExecutionPolicy` prints `Restricted`; `Get-ExecutionPolicy -List` is quoted in the record — on a fresh client every scope reads `Undefined` and the effective default is `Restricted`): double-click `bootstrap.cmd` in Explorer; run `.\bootstrap.cmd --mode design --yes` from cmd and from PowerShell; expected: `bootstrap.ps1` runs and prints its arguments. Control: `.\bootstrap.ps1` directly → expected the `running scripts is disabled on this system` error (proves the policy is active). Then the `gpo-allsigned` snapshot (MachinePolicy = AllSigned): repeat; expected: `-ExecutionPolicy Bypass` is overridden by the machine policy and the script is refused — record the exact message; then exercise the `03` fallback: a pure-batch `bootstrap-minimal.cmd` that performs only git commands (`git submodule update --init --depth 1`, sparse set, writes `.local/bootstrap-state.json` with `echo`), i.e. the design-only path without PowerShell — record that it completes. Also record whether a signed script would be accepted (informational; signing is not planned).

Verdicts: `S-04: CONFIRMED — raw-mode masking correct in 8/8 console combinations; --password-stdin works` or `S-04: FAILED → fallback: --password-stdin only on <combination>; roadmap --web form`. `S-08: CONFIRMED (Restricted) / FAILED (GPO AllSigned) → fallback: docs state "under GPO-locked policy use Git Bash ./bootstrap.sh or bootstrap-minimal.cmd (design-only)"`.

**Acceptance criteria.**

1. S-04 record contains the 8-cell matrix with, per cell: echo behaviour, Backspace test result, Ctrl-C restore result; the no-TTY error text; the `--password-stdin` result.
2. Given `Get-ExecutionPolicy` prints `Restricted` (and `-List` is quoted), when `bootstrap.cmd` is double-clicked and invoked from cmd and PowerShell, then `bootstrap.ps1` runs (its printed argv is in the record) and the direct `.\bootstrap.ps1` control fails with the error containing `running scripts is disabled on this system` (quoted in full).
3. On `gpo-allsigned`, the record quotes the refusal text and shows `bootstrap-minimal.cmd` completing the git-only design path.
4. Both spikes were executed with `where bash` empty (quoted in *Environment*).
5. Verdict lines present; the S-08 record states in one sentence what `docs/PLATFORM-NOTES.md` (ARC-06/ARC-09) must say about GPO-locked machines.

**Tasks.**

1. Write `masked.mjs`, `masked-stdin.mjs`, `bootstrap.cmd`, `bootstrap.ps1` (prints argv only), `bootstrap-minimal.cmd`.
2. Run the S-04 matrix; screenshot each cell's console.
3. Run S-08 on `clean`; revert; run on `gpo-allsigned`.
4. Write records and verdicts.

**Test strategy.** Manual on the Windows VM (console behaviour cannot be proven on a CI runner — no interactive console). `masked-stdin.mjs` and the no-TTY error are additionally run in the spike repo's GitHub Actions `windows-latest` job as the automatable half.

**Dependencies.** S01.

**Size.** M — 8 console runs plus two policy states; setup of the GPO snapshot is the slow part.

**Risks / open points.** conhost under cmd is the historically weakest raw-mode host; if only that cell fails, the fallback is a doctor WARN ("use Windows Terminal or `--password-stdin`"), not a downgrade of Q-B — state which cells must pass for "first-class": Windows Terminal × PowerShell 5.1 at minimum. GPO AllSigned is expected to fail by design (`03`: "GPO MachinePolicy cannot be overridden"); the verdict is about the fallback being usable.

**Definition of done.** Two records with matrix, quotes and verdicts; S13 consumes the console findings.

---

### ARC-00-S08 — Server install and startup spikes: S-15 root `npm ci` footprint, S-06 `MCP_TIMEOUT` and 394-tool cold start

**As** a maintainer **I want** measured install size, package count and module-resolution behaviour of a workspace-root `npm ci --omit=dev --ignore-scripts`, and the real server's cold-start time against the `MCP_TIMEOUT` value in the committed settings **so that** B04 (deps) and the `env.MCP_TIMEOUT` value in `01` §5 rest on numbers, on all three OSes.

**Context.** `03` S-15 (M) and S-06 (M). `01` §4.2 B04: "`npm ci --omit=dev --ignore-scripts` at the root (workspace lockfile; ~72 MB; the server package has no install scripts)"; `01` §5: `MCP_TIMEOUT: "120000"` in `.claude/settings.json` `env`, "timeout-class `env` values in `.claude/settings.json` apply at startup from every settings file" (`docs:settings-reference`); "cold-start time never measured". `03` S-15 records the production tree at 72 MB / 155 packages with no install scripts (`00` §2 gives 72 MB production deps); today's `snow-mcp/node_modules` with dev deps is 164 MB, `dist/` 4.2 MB (measured 2026-09-04). ARC-06 (B04, B08), ARC-04 (package layout) and ARC-09 (CI) depend on these.

**Scope.** In: a throwaway monorepo fixture inside the spike repo; the measurements on the three GitHub Actions runners and on the three VMs (VMs give "slow laptop" numbers); the `MCP_TIMEOUT` low/high test with the stub. Out: the D-03 dependency cut itself (ARC-04) — the spike measures the pre-cut tree and notes the expected reduction (`02` D-03: reports ≈ 20 MB of the 72 MB); changing `snow-mcp`.

**Design notes.**

Fixture `spikes/S-15-npm-ci/fixture/`:

```
package.json            { "name": "ai-servicenow-architect", "version": "2.0.0", "private": true,
                          "workspaces": ["packages/*", "tools/snowarch"] }
packages/snowarch/      package.json copied from snow-mcp with "name": "@farstic/snowarch", "version": "2.0.0",
                        devDependencies kept (so --omit=dev is meaningful), "bin": { "snowarch": "dist/cli/index.js" }
                        (today's package.json names itself "servicenow-mcp" with bins "servicenow-mcp" → dist/cli/index.js and
                        "servicenow-mcp-server" → dist/server.js; the fixture renames, nothing else);
                        dist/ copied read-only from snow-mcp/dist
tools/snowarch/         package.json { "name": "@farstic/snowarch-tools", "version": "2.0.0", "private": true } — no dependencies
```

Generate the lockfile once with `npm install --package-lock-only` at the fixture root (macOS), commit it. Then, on each OS/runner, from a clean checkout: `time npm ci --omit=dev --ignore-scripts`; record `du -sh node_modules` (`Get-ChildItem -Recurse | Measure-Object Length -Sum` on Windows), `ls node_modules | wc -l` (top-level package count), `test ! -d tools/snowarch/node_modules`, `test ! -d packages/snowarch/node_modules || ls packages/snowarch/node_modules` (hoisting check), then the handshake: `node spikes/S-06-cold-start/handshake.mjs packages/snowarch/dist/server.js` — spawns the server with a placeholder environment (`SERVICENOW_INSTANCE_URL=https://example.invalid` alone — `00` §4 line "Startup gate" shows that this start advertises 394 tools with no credentials; flags unset), sends `initialize` then `tools/list`, prints `initialize: <ms> ms · tools/list: <ms> ms · tools: <count>`. Expected count 394 (the manifest guard in `snow-mcp/scripts/extract-tools.mjs`); record any dynamic-tool additions.

S-06 with Claude Code (macOS and Windows, one version each): set `STUB_STARTUP_DELAY_MS=5000` (in `settings.local.json` `env` or the shell) and `MCP_TIMEOUT=2000` in `.claude/settings.json` → expect `/mcp` to show a startup failure (record the text); set `MCP_TIMEOUT=120000` → connected. This proves the settings `env` path governs startup. Then start Claude Code against the real fixture server (edit `.mcp.json` `args` to `packages/snowarch/dist/server.js` in a spike branch) and record the time-to-connected shown by `/mcp` or `claude mcp list`.

Verdicts: `S-15: CONFIRMED — <MB> / <n> packages on ubuntu/macos/windows; nothing under tools/snowarch; handshake ok` or `FAILED → fallback: npm ci --workspace packages/snowarch`. `S-06: CONFIRMED — settings env MCP_TIMEOUT governs startup (2000 → fail, 120000 → ok); real cold start <ms> ms max over 6 machines; 120000 keeps ≥ 10× headroom`.

**Acceptance criteria.**

1. For each of the six machines (three runners, three VMs) the S-15 record lists wall time, size, top-level package count, and the result of the two `test` checks.
2. The handshake against `packages/snowarch/dist/server.js` after the root install succeeds on all six and reports the tool count.
3. S-06 record shows the failure text with `MCP_TIMEOUT=2000` and success with `120000` on macOS and Windows.
4. S-06 record lists `initialize` and `tools/list` latency per machine; the slowest number and the resulting headroom factor are stated in the verdict line.
5. If any platform hoists differently and breaks resolution, the record names the failing module and the chosen fallback.

**Tasks.**

1. Build the fixture; generate and commit the lockfile.
2. Write `handshake.mjs` (zero deps; reused later by ARC-06 `lib/mcp-handshake.mjs` as a reference).
3. Add `spike-matrix.yml` job steps for S-15 + handshake on the three runners.
4. Run the same on the three VMs.
5. Run the S-06 timeout test with Claude Code on macOS and Windows.
6. Write records and verdicts; hand the timeout number to ARC-06 and the size number to `docs/INSTALL.md` (ARC-06) via S14.

**Test strategy.** Automated in the spike repo's GitHub Actions matrix (ubuntu/macos/windows × Node 20/22/24 — nine cells; the numbers are read from the job log). Manual on VMs. The Claude Code timeout half is manual.

**Dependencies.** S01.

**Size.** M — the fixture and the handshake script are small; nine CI cells plus three VMs are mostly waiting.

**Risks / open points.** `--omit=dev` behaviour with workspaces has changed across npm majors — record `npm --version` per cell (Node 20/22/24 ship different npm). The placeholder-URL start may log errors while still advertising tools; that is acceptable and noted (ARC-04's unconfigured mode replaces it).

**Definition of done.** Two records; CI matrix job green; numbers quoted in `spikes/README.md`.

---

### ARC-00-S09 — S-07 — ServiceNowDocs submodule recipes: size and time on three OSes

**As** a maintainer **I want** the three candidate B02 recipes timed and sized on macOS, Linux and Windows, including long-path handling and pin fetchability **so that** ARC-03 documents one recipe and `docs/INSTALL.md` states a true size.

**Context.** `03` S-07; README acceptance "S-07 records size on disk and wall time for the B02 recipe on all three OSes". `01` §10: measured reference 299 MB / 35,185 files / ~55 s for a direct blobless sparse clone; the submodule path "expected between that and ~350 MB". ARC-03 README caveat: as written, `git submodule update --init --depth 1` checks out the full 48,991-file tree before `sparse-checkout set` narrows it; candidates are `--filter=blob:none` on `submodule update` (verified on git 2.39.5) or the direct clone + `absorbgitdirs`. ARC-03-S05 (recipe), ARC-03-S11 (Windows long-path proof) and ARC-06-S06 (B02) depend on the result.

**Scope.** In: the three recipes from `03` S-07, each run on the three runners and the three VMs; `core.longpaths` on Windows; the "pin no longer tip" check. Out: choosing the cited-areas list (ARC-03 generates `vendor/docs-areas.txt`; the spike uses the engine's current 20 cited areas from `00` §3, copied into `spikes/S-07-docs-submodule/docs-areas.txt`).

**Design notes.**

Fixture: a spike branch of `snowarch-spikes` with `.gitmodules` (`path = vendor/ServiceNowDocs`, `url = https://github.com/ServiceNow/ServiceNowDocs`, `branch = australia`, `shallow = true`) and the gitlink pinned to `ba513f2` (the pin `01` §10 names). Three scripts, each starting from a fresh clone of the spike branch (`--no-recurse-submodules`):

- `recipe-A-naive.sh`: `git submodule update --init --depth 1 vendor/ServiceNowDocs && git -C vendor/ServiceNowDocs sparse-checkout set --cone $(cat docs-areas.txt)`
- `recipe-B-filter.sh`: `git submodule update --init --depth 1 --filter=blob:none vendor/ServiceNowDocs && git -C vendor/ServiceNowDocs sparse-checkout set --cone $(cat docs-areas.txt)`
- `recipe-C-direct.sh`: `git clone --filter=blob:none --no-checkout --depth 1 --sparse --branch australia <url> vendor/ServiceNowDocs && git -C vendor/ServiceNowDocs sparse-checkout set --cone $(cat docs-areas.txt) && git -C vendor/ServiceNowDocs checkout ba513f2 && git submodule absorbgitdirs`

Each prints: wall time (`time`), `du -sh vendor/ServiceNowDocs` and `du -sh vendor/ServiceNowDocs/.git` (or `.git/modules/vendor/ServiceNowDocs`), file count (`git -C vendor/ServiceNowDocs ls-files | wc -l`), `git -C vendor/ServiceNowDocs rev-parse HEAD` (== `ba513f2`), and `git -C vendor/ServiceNowDocs status --porcelain` (must be empty). `.ps1` twins for Windows with `git config --global core.longpaths true` set first, plus a control run without it that records the first long-path error text (if any). Pin fetchability: `ba513f2` is **already** behind the `australia` tip (ARC-03 README: tip `11b39be` on 2026-09-04), so every recipe run above already exercises the pin-by-SHA fetch that `03` S-07 wants ("git then fetches the pinned SHA by hash, which GitHub permits") — the record states the tip SHA observed (`git ls-remote <url> refs/heads/australia`) next to the pin. As a control, repeat recipes A, B and C once with the gitlink moved to the current tip: if A fails only for the non-tip pin, the failure text (expected `Fetched in submodule path 'vendor/ServiceNowDocs', but it did not contain ba513f2…` or similar — quote it) is the evidence that ARC-03's recipe must fetch by SHA explicitly. Network: note the runner's location; VMs on the same home network give a consistent second sample.

Verdict: `S-07: CONFIRMED — recipe <B|C>: <MB> / <files> / <s> on macOS, <…> Linux, <…> Windows (longpaths required: yes/no); pin-by-hash fetch ok` or `FAILED → fallback: recipe A, ~<MB>, size printed in the README`.

**Acceptance criteria.**

1. For each recipe × each of the six machines the record lists wall time, total size, `.git` size, file count, HEAD, and clean status.
2. On Windows the record states whether any recipe fails without `core.longpaths=true` and quotes the error.
3. The record states the `australia` tip SHA at run time next to the pin `ba513f2` (proving the pin was not the tip), and the tip-pin control run is recorded for recipes A, B and C, with the git error quoted for any recipe that succeeds only at the tip.
4. The verdict names one recipe for ARC-03 and gives the size/time sentence `docs/INSTALL.md` will print.
5. Every run started from a checkout with no `vendor/ServiceNowDocs` present (the script deletes it first and asserts absence).

**Tasks.**

1. Create the spike branch with `.gitmodules` and the gitlink; copy the 20-area list.
2. Write the three `.sh` scripts and their `.ps1` twins.
3. Add a `spike-matrix.yml` job running all three recipes on the three runners (one Node version is enough — git is what matters).
4. Run on the three VMs.
5. Run the tip-pin control variant; record the tip SHA.
6. Write the record; hand the recipe to ARC-03 via S14.

**Test strategy.** Automated on the three GitHub runners (numbers from logs); manual on VMs for the consultant-laptop sample. No Claude Code involved.

**Dependencies.** S01.

**Size.** M — scripts are short; nine recipe runs of ~1–5 minutes each per machine, plus Windows long-path handling.

**Risks / open points.** Runner network speed flatters the time numbers — the VM numbers are the ones quoted for users. `git submodule update --filter` requires git ≥ 2.27-ish and was verified on 2.39.5; record the git version per machine and confirm the `01` §4.1 floor (git ≥ 2.25) still holds for the chosen recipe — if not, S14 raises the git floor in the seed config and ADR-0001 follow-up.

**Definition of done.** Record with the six-machine table; recipe chosen; CI job green.

---

### ARC-00-S10 — Session-dynamics spikes: S-09 Claude-first clone-into-cwd and restart, S-02 `list_changed` after reload

**As** an individual practitioner **I want** to know that starting `claude` in an empty folder, asking it to install the repo, and restarting once gives a fully loaded engine, and that adding an instance mid-session makes new tools callable without reconnecting **so that** Path B (`01` §4.3) and step 8 of `/snowarch setup-instance` (`01` §6.2) promise only what works.

**Context.** `03` S-09 (M) and S-02 (M). `01` §4.3: "The restart is required because `CLAUDE.md`, `.mcp.json` and `.claude/settings.json` are read at session start (S-09)"; `01` §6.2 step 8: "the skill calls `snow_core_instances_reload` (server re-reads the store and emits `tools/list_changed`) … No session restart. If the tool list does not refresh (S-02), the skill says 'run `/mcp` → servicenow → reconnect'." D-06 hedge: the `/snowarch setup-instance` skill must guide the terminal hand-off — the S-02 outcome fixes the last line of that guidance. ARC-06 (Path B recipe) and ARC-07 (step 8) depend on these.

**Scope.** In: S-09 on macOS and Ubuntu (Claude's Bash tool is required; Windows on the `gitbash` snapshot), both Claude Code versions; the non-empty-folder variant; S-02 with the stub's reload tool on both versions. Out: the real `snow_core_instances_reload` (ARC-04) — the stub emits the same notification; the skill text itself (ARC-02/ARC-07).

**Design notes.**

S-09 procedure:

1. `mkdir s09 && cd s09 && claude` (fresh path); accept trust. Record what Claude Code's built-in `/status`, `/mcp` and `/help` show (no project settings, no server, no skills — the "before"). (`/status` here is the built-in command R-2 renamed the skill away from, not `/snowarch status`.)
2. Paste: *"Clone https://github.com/farstic/snowarch-spikes.git into this folder with `git clone <url> .` and then run `./snowarch doctor --json`."* Claude runs it through its Bash tool (record the permission prompts it triggers — this is an untrusted-command count for the README).
3. Without restarting: built-in `/status`, `/mcp`, `/help` again → record whether `.mcp.json`'s server, the SessionStart hook line, or `CLAUDE.md` ("spike ready") are picked up mid-session (expected: not).
4. Exit; `claude` again in the same folder → record the "after": trust dialog again? (expected: no — same path), MCP approval (per S-01 result), the hook line, `/mcp` connected, the `CLAUDE.md` greeting.
5. Non-empty folder variant: create `s09b` with a stray `notes.md`; the clone sequence is `git init && git remote add origin <url> && git fetch --depth 1 origin main && git checkout -f main` (the `01` §4.3 "init/fetch/checkout sequence"); confirm `notes.md` survives and step 4 holds.

S-02 procedure (trusted clone, `STUB_CONFIGURED` unset → set A of four tools): ask Claude to call `snow_core_instances_reload` (allowed by settings — no prompt); the stub switches to set B and emits `notifications/tools/list_changed`; then ask "call `snow_probe_env_read`" (a set-B tool). Expected: callable without `/mcp` reconnect; `/mcp` lists eight tools. Run on the floor version 2.1.214 as well as current (the `≥ 2.1.214` resilience note in `03` makes the floor the interesting cell). If it fails: perform `/mcp` → servicenow → reconnect and confirm that path works (this is the fallback text).

Verdicts: `S-09: CONFIRMED — mid-session nothing loads; one restart loads CLAUDE.md, .mcp.json, settings, hook; non-empty folder sequence ok; Bash prompts during install: <n>`. `S-02: CONFIRMED — new tools callable after list_changed on 2.1.214 and 2.1.258` or `FAILED → fallback: /snowarch setup-instance prints "run /mcp → servicenow → reconnect" as its last step`.

**Acceptance criteria.**

1. S-09 record contains the before / mid-session / after triple of built-in `/status`, `/mcp`, `/help` outputs (trimmed) on macOS and Ubuntu for both versions, and the Windows `gitbash` run on one version.
2. The number of permission prompts Claude raised while cloning and running the doctor is stated.
3. The non-empty-folder sequence is recorded as working with the stray file preserved.
4. S-02 record shows a set-B tool executing after reload with no reconnect, or the exact failure and the successful `/mcp` reconnect path, on both versions.
5. Verdict lines present; the S-02 line names the last step text for `/snowarch setup-instance`.

**Tasks.**

1. Write `run.sh` printing the two checklists; push the spike repo so the public/private clone URL works (use a deploy key or PAT via `gh auth`, never a token in the record).
2. Execute S-09 (2 OSes × 2 versions + Windows gitbash + non-empty variant).
3. Execute S-02 on both versions.
4. Write records and verdicts.

**Test strategy.** Manual interactive; not in CI.

**Dependencies.** S01, S04 (approval state understood).

**Size.** M — six interactive runs plus the reload test.

**Risks / open points.** `/help` may not list skills on every version — record whatever surface lists them (`docs:skills`); the point is "before vs after restart". A private remote requires credentials inside the Claude session's shell — use an already-authenticated `gh`/credential helper; never paste a token.

**Definition of done.** Two records with verdicts; the `/snowarch setup-instance` last-step sentence handed to ARC-07 via S14.

---

### ARC-00-S11 — S-11 — Claude Code 2.1.214 floor verdict over the spike matrix

**As** a maintainer **I want** one verdict stating whether every mechanism the design uses behaves the same on the floor 2.1.214 as on the current release **so that** `engine.config.json.floors.claude` (ARC-01) and the B00 preflight (ARC-06) enforce a number that is proven, not remembered.

**Context.** `03` S-11 (L): evidence is version notes (2.1.196 approval semantics, 2.1.198 hook placeholders, 2.1.214 `list_changed` resilience); check: "Install exactly 2.1.214 … run design-only and live flows". `01` §4.1 and §12 fix the floor at 2.1.214; README acceptance ties `engine.config.json` floors to S-11. ADR-0001's follow-up (S03) points here.

**Scope.** In: the cross-version comparison of the S-01, S-02, S-03, S-05, S-06, S-09, S-12, S-16, S-17, S-18 records; a short design-only and live end-to-end pass on 2.1.214 (macOS) that touches every mechanism in one session. Out: any spike re-run beyond the two versions already exercised; older-than-floor testing (not needed — the floor is a minimum).

**Design notes.** The record is a table: rows = mechanisms (project `.mcp.json` load; `${VAR:-default}` expansion; `enabledMcpjsonServers`/`disabledMcpjsonServers`; exec-form hook + `${CLAUDE_PROJECT_DIR}`; `MCP_TIMEOUT` from settings `env`; `permissions.allow` after trust; `permissions.ask` in auto mode; middle-wildcard glob; `list_changed`; unconfigured server accepted; skills/agents listing), columns = 2.1.214 / current, cells = the verdict from the source record with a link. Then the one-session pass on 2.1.214: design-only clone (S-01 design variant) → restart into live variant → reload → mutating call prompt. If any cell differs, the verdict raises the floor to the lowest version where all cells match — using only versions actually exercised (if the current release is the only one that passes everything, the floor becomes that release; no interpolation).

Verdict: `S-11: CONFIRMED — floor 2.1.214 sufficient; all 11 mechanisms identical on 2.1.214 and 2.1.258` or `S-11: FAILED → floor raised to <version> (mechanism <name> differs); engine.config.seed.json updated; ADR-0001 follow-up recorded`.

**Acceptance criteria.**

1. The record's table has every mechanism row filled for both versions with a link to the evidence record.
2. The one-session pass on 2.1.214 is described step by step with its outcome.
3. `spikes/engine.config.seed.json` `floors.claude` equals the version in the verdict line.
4. If the floor changed, ADR-0001 carries a dated *Follow-ups* entry and S14 propagates the value to `01` §4.1/§12 in the close-out list.

**Tasks.**

1. Build the table from S04–S10 records.
2. Run the one-session pass on 2.1.214 (macOS).
3. Write the verdict; update the seed JSON if needed.

**Test strategy.** Desk check plus one manual session. Not in CI.

**Dependencies.** S04, S05, S06, S08, S10 (and S07/S09 for completeness of the environment table).

**Size.** S — consolidation plus one session.

**Risks / open points.** If pinning 2.1.214 failed on some OS (S01 risk), the verdict is limited to the OSes where it ran and says so. The current release will move during the ARC — record the version tested, not "latest".

**Definition of done.** Record with table and verdict; seed JSON consistent; ADR follow-up if raised.

---

### ARC-00-S12 — S-14a–g plugin channel spikes (D-06 hedge, one-week time-box) and S-19 `claude plugin validate` on headless CI

**As** a maintainer **I want** the eleven plugin-channel behaviours exercised within one week, and `claude plugin validate` proven on a headless runner **so that** ADR-0006 can record "monorepo path confirmed" or "channel decision re-opened" before ARC-06's first story, and ARC-05's lint can rely on `claude plugin validate` in CI.

**Context.** D-06 hedge (`02`): "S-14 is pulled forward into ARC-00 and must complete **before ARC-06 starts** … if S-14 proves the eleven plugin behaviours within its time-box, the channel decision is re-opened before any bootstrap investment; if not, ARC-06 proceeds on the verified monorepo path with no time lost." README acceptance: "S-14a–g carry verdicts within the one-week time-box, and ADR-0006 records either 'monorepo path confirmed' or 'channel decision re-opened' before ARC-06's first story starts." `03` §B lists S-14a–g; `01` §16 lists why A lost (user-scope default, `~12 KB` SessionStart injection, prefix `mcp__plugin_<p>_<s>__`, one `userConfig` set per plugin). Minor fold from `02`: `claude plugin validate` on headless CI = S-19. `00` §3 records that `claude plugin validate .claude/skills` and `.claude/agents` pass locally on 2.1.258.

**Scope.** In: a throwaway marketplace repository `snowarch-spikes-marketplace` with two plugins (`architect-engine`: skills + agents + SessionStart hook; `servicenow-server`: bundled stub server with `userConfig`); the seven S-14 checks on the three VMs; S-19 on the three GitHub runners; the ADR-0006 outcome. **Time-box: five working days, hard stop** — whatever is unverified at the end is recorded as `FAILED → not proven within time-box` (which, per D-06, keeps the monorepo path). Out: building a real plugin channel (roadmap `01` §17 item 1); any change to the monorepo plan unless the owner re-opens the decision.

**Design notes.**

Marketplace fixture (names and fields as `docs:plugins` describes them — the spike records the exact schema the CLI accepts; nothing here is a product commitment):

```
snowarch-spikes-marketplace/
├── .claude-plugin/marketplace.json           name "snowarch-spikes", plugins: architect-engine, servicenow-server
├── plugins/architect-engine/
│   ├── .claude-plugin/plugin.json            name, version 0.0.1
│   ├── skills/<3 sample skills from the engine, descriptions ≤ 500 chars>/SKILL.md
│   ├── agents/<1 sample agent>.md
│   └── hooks/hooks.json                      SessionStart → node ${CLAUDE_PLUGIN_ROOT}/hooks/inject.mjs (prints a 12 KB additionalContext payload — S-14d)
└── plugins/servicenow-server/
    ├── .claude-plugin/plugin.json            userConfig: SNOW_URL (required), SNOW_USER (required), SNOW_PASSWORD (required, sensitive: true), SNOW_OPTIONAL (optional)
    ├── .mcp.json                             servicenow → node ${CLAUDE_PLUGIN_ROOT}/server/server.mjs, env from ${user_config.*} (S-14a/b/c)
    └── server/server.mjs                     the S01 stub, plus a tool that echoes the names and lengths of its env values (never values)
```

Checks, each its own record folder `S-14a` … `S-14g`, `S-19`:

- **S-14a** masked `userConfig`: `claude plugin marketplace add <git url>`; `claude plugin install servicenow-server@snowarch-spikes --scope project` in a terminal and `/plugin install …` in a session, on all three OSes; record whether the `sensitive` field is masked; find where the value is stored (`~/.claude/.credentials.json` vs OS keychain — key names only, `ls -la` modes); note the ~2 KB Keychain budget behaviour on macOS by supplying a 3 KB value.
- **S-14b** approval count: dialogs on the first session after install (compare with S-01).
- **S-14c** optional blank field: leave `SNOW_OPTIONAL` blank; the echo tool reports whether env holds `""`, the literal `${user_config.SNOW_OPTIONAL}`, or the server failed to load.
- **S-14d** 12 KB `additionalContext`: `claude --debug`; confirm the payload arrives untruncated at startup, after `/compact` and on `claude --resume`.
- **S-14e** teammate install: a scaffolded `.claude/settings.json` with `extraKnownMarketplaces` + `enabledPlugins` in a second fresh clone on another VM; record whether both plugins install and whether the `userConfig` dialog appears.
- **S-14f** tagging: `claude plugin tag --help`; tag both plugins on the same commit as `<name>--v0.0.1`; record the accepted `plugin-dependencies` shape (from `docs:plugin-dependencies`).
- **S-14g** cache install cap: bundle the S08 fixture (`packages/snowarch` with lockfile) into the server plugin; install on a throttled network (macOS `Network Link Conditioner` or Linux `tc qdisc … rate 2mbit`); record whether the 60-second `npm ci` cap is hit and what the failure looks like.
- **S-19** headless validate: GitHub Actions on ubuntu/macos/windows runners, no login, native install of Claude Code, `claude plugin validate plugins/architect-engine` and `… .claude/skills`-shaped directory: record exit code, whether it demands authentication or a TTY, and its stdout.

Tool prefix observed in S-14a sessions is recorded verbatim (expected `mcp__plugin_servicenow-server_servicenow__…` per `01` §16 — confirm).

ADR-0006 outcome (S03 left it *Proposed*): if all of S-14a–g are CONFIRMED and the owner wants to re-open → new ADR-0008 "Channel decision re-opened" superseding ADR-0006, and ARC-06 does not start until the owner rules; otherwise ADR-0006 → *Accepted* with the added sentence "Monorepo path confirmed on <date>: S-14 <n>/7 confirmed within the time-box; plugin channel remains roadmap item 1."

**Acceptance criteria.**

1. By the end of day 5 every S-14a–g folder carries a verdict line; unfinished checks read `FAILED → not proven within time-box`.
2. S-14a record states, per OS, whether the sensitive field was masked in both the terminal and in-session installs, and the storage location by name with file mode (values never copied).
3. S-14b record gives the dialog count on the first session and compares it to the S-01 count.
4. S-14c record quotes the echo tool's output for the blank optional field.
5. S-14d record shows the byte count received at startup, after `/compact` and on resume.
6. S-19 record shows the three runners' exit codes and whether login/TTY was required; the ARC-05 lint story is marked feasible or given the fallback ("validate locally in pre-release only").
7. ADR-0006 is `Status: Accepted` with the confirmation sentence, or ADR-0008 exists and ARC-06 is marked blocked in `plans/README.md` — before ARC-06-S01 begins (date recorded in both).

**Tasks.**

1. Day 1: build the marketplace fixture; S-19 workflow.
2. Day 2: S-14a, S-14b, S-14c on macOS; start Windows/Linux.
3. Day 3: S-14d, S-14f; S-14a/b/c on Windows and Linux.
4. Day 4: S-14e (second VM), S-14g (throttled).
5. Day 5: records, verdicts, ADR-0006 outcome with the owner.

**Test strategy.** Manual interactive for S-14a–f on the three VMs; S-14g semi-automated with a throttling script; S-19 fully automated on the three runners. Time-box tracked in `spikes/S-14/README.md` with a day log.

**Dependencies.** S01 (VMs, stub), S03 (ADR-0006 exists as Proposed). Must conclude before ARC-06-S01 — schedule it in parallel with S04–S10, not after.

**Size.** L — the time-box is the size: five days, hard stop, one engineer. Not XL because incompleteness is an accepted outcome by design.

**Risks / open points.** Plugin CLI surfaces change between releases — run on the current release only (the floor is irrelevant to a roadmap channel); record the version. The keychain-budget probe on macOS may pop Keychain prompts for `claude` — record them, they are part of the UX cost. If the owner re-opens the decision, every ARC-06/ARC-07 story is re-planned — that is the point of the hedge, and it is the only path by which this ARC can delay ARC-06.

**Definition of done.** Eight records with verdicts; ADR-0006 Accepted (or ADR-0008 present); `plans/README.md` ARC-06 entry dated accordingly; owner sign-off line in `spikes/S-14/README.md`.

---

### ARC-00-S13 — Windows test recipe for ARC-06 / ARC-09 CI

**As** CI **I want** a written, repeatable recipe for "Windows without Git Bash on PATH" — for both a local VM and a `windows-latest` GitHub runner — including the console and policy findings **so that** ARC-06's design-only CI job and ARC-09's nine-cell matrix reproduce the ARC-00 Windows evidence instead of rediscovering it.

**Context.** README deliverable: "A Windows test recipe (VM image or checklist) reused by ARC-06/ARC-09 CI." ARC-09 acceptance: "the Windows cell runs with Git Bash removed from PATH and passes the design-only bootstrap, the doctor and the MCP handshake"; ARC-09 risk: "Windows CI runners differ from consultant laptops (policies, AV). Mitigation: S-08 on a real locked-down VM; the install page states the tested configurations." `01` §4.1 explains why the no-Git-Bash job proves launchers, hook and handshake, not the skills. Q-B: native Windows first-class conditional on S-03/S-04/S-08.

**Scope.** In: `spikes/windows-recipe.md` (VM checklist + snapshots from S01, the PATH-stripping steps for a runner, the assertions a job must make, the console/policy caveats from S07); a working `spike-matrix.yml` Windows job that applies the recipe and runs the S08 handshake and the S07 `masked-stdin.mjs` check. Out: the product CI workflow itself (ARC-09), the launchers (ARC-06).

**Design notes.**

Runner section of the recipe (PowerShell steps for a `windows-latest` job):

```powershell
# 1. Prove Git Bash is present, then remove it from PATH for the rest of the job
$gitRoot = Split-Path (Split-Path (Get-Command git.exe).Source)      # C:\Program Files\Git
$stripped = ($env:PATH -split ';' | Where-Object { $_ -notmatch [regex]::Escape("$gitRoot\bin") -and $_ -notmatch [regex]::Escape("$gitRoot\usr\bin") -and $_ -notmatch 'mingw64\\bin' }) -join ';'
"PATH=$stripped" | Out-File -Append -Encoding utf8 $env:GITHUB_ENV
# 2. In the next step assert:
if (Get-Command bash.exe -ErrorAction SilentlyContinue) { throw "bash.exe still on PATH" }
git --version            # git.exe from $gitRoot\cmd must still work
node --version           # >= 20
```

Then the assertions ARC-06/ARC-09 jobs make: `bootstrap.cmd --mode design --yes` exit 0 (ARC-06); `snowarch.cmd doctor --json` exit 0 (ARC-08); the stdio handshake against `packages/snowarch/dist/server.js` (S08 script); `echo x | node … --password-stdin` path (S07); the SessionStart hook script executed directly with `node` and `CLAUDE_PROJECT_DIR` set (a Claude Code session cannot run on a runner — the recipe says so and points to the VM section for S-03). VM section: the S01 snapshot table, how to reset between runs, the S07 console matrix cells that must pass for "first-class", the GPO caveat text for `docs/PLATFORM-NOTES.md`. Also: `git config --global core.longpaths true` before any docs checkout (from S09), and the `.gitattributes` expectation (`*.ps1 *.cmd` CRLF) with the check `git ls-files --eol bootstrap.ps1`.

**Acceptance criteria.**

1. `spikes/windows-recipe.md` exists with the runner section, the VM section and the assertions list.
2. The spike repo's `windows-latest` job, after applying the recipe, fails its own assertion step when the PATH-stripping step is skipped (proves the check is real) and passes with it.
3. The job runs the S08 handshake and the S07 `--password-stdin` check green.
4. The recipe states which S07 console cells are required for Q-B "first-class" and the GPO sentence for `docs/PLATFORM-NOTES.md`.
5. ARC-06 and ARC-09 README dependency lines reference the recipe (done in S14).

**Tasks.**

1. Write the recipe from S01/S06/S07/S09 findings.
2. Add the PATH-stripping and assertion steps to `spike-matrix.yml`; run once with and once without the strip.
3. Wire the S08 handshake and S07 stdin check into the job.

**Test strategy.** Automated in the spike repo's GitHub Actions; the VM section is verified by re-running one S07 cell from the checklist alone.

**Dependencies.** S06, S07 (findings), S08 (handshake script), S09 (long paths).

**Size.** S — mostly transcription of what S06–S09 learned into one file plus a small job.

**Risks / open points.** Runner images change; the recipe pins the image by its `runner-images` release label in the record. A `bash.exe` may still resolve after the strip from a location that is not Git's (e.g. `C:\Windows\System32\bash.exe`, the WSL launcher, if the image ships it) — the assertion must therefore print `(Get-Command bash.exe).Source` and fail only when it is under `$gitRoot`; a non-Git `bash.exe` is recorded, not treated as Git Bash (Claude Code's Bash tool needs Git Bash specifically, `01` §4.1). AV on consultant laptops is out of reach for ARC-00 — noted as an ARC-09 documentation item, not tested here.

**Definition of done.** Recipe file present; spike job green; ARC-06/ARC-09 references added.

---

### ARC-00-S14 — Close-out: `03` §A/§B Status column, deferred spikes S-10 / S-13, gate sign-off for ARC-01 and ARC-06

**As** a maintainer **I want** every spike row in `03` to carry a status and evidence pointer, the two spikes that cannot run before product code (S-10, S-13) formally deferred to their owning ARCs, the Q-B ruling applied, and the entry criteria of ARC-01 and ARC-06 signed **so that** no ARC starts on an unverified assumption and the plan set is consistent with the evidence.

**Context.** README deliverable: "`03-RISKS-AND-UNKNOWNS.md` §A updated with a Status column (Confirmed / Failed-fallback adopted / Deferred)"; acceptance: "Every row S-01 … S-18 in `03` §A carries a verdict with a pointer to its evidence; no row remains 'unverified'." `03` S-10 requires the ARC-04 SCRIPTING gate split and a PDI (VALIDATION-TESTS T-01…T-18) and S-13 requires ARC-02's rewritten descriptions — neither can run in ARC-00; they are deferred, not skipped. Q-B: a failed S-03/S-04/S-08 downgrades native Windows to "Git Bash required" via the fallback in `03` §A and `01` §13 "with no re-planning". README risk: "ARC-01 can start on D-01 alone; ARC-04 cannot start without D-02 and D-03."

**Scope.** In: edits to `03` (Status column in §A and §B, S-19 row added, S-10/S-13 marked Deferred with owner ARC and the exact check to run there), `spikes/README.md` verdict register, the fallback propagation list (which `01`/ARC README sentences change for each FAILED verdict), the Q-B sentence in `01` §13 and ARC-09, the ARC dependency-line updates (ARC-03 recipe, ARC-05 glob/explicit, ARC-06 S-05 choice and dialog count, ARC-07 S-02 last-step text, ARC-06/ARC-09 Windows recipe), and the gate sign-off. Out: any product code; re-running spikes; changing decisions (only the owner can, via a new ADR).

**Design notes.**

`03` §A gains two columns: **Status** ∈ {Confirmed, Failed-fallback adopted, Deferred → ARC-NN, Not proven within time-box (S-14 only)} and **Evidence** = `docs/spikes/S-NN-<slug>/README.md` (the post-ARC-01 path; until then the spike repo path). §B gains the same for S-14a–g; two new rows are added to §A with their verdicts: **S-19** ("`claude plugin validate` runs on a headless CI runner without login/TTY", from S12) and **S-20** ("project stdio servers inherit `HTTPS_PROXY` / `NO_PROXY` / `NODE_EXTRA_CA_CERTS` from the shell that started `claude`", from S06; fallback: ARC-06 forwards them as `${VAR:-}`). §C R-15 gains the sentence "closed by ARC-04-S11; S-20 answered in ARC-00-S06: <verdict>" (ARC-04-S11's definition of done asks ARC-00 for exactly this). Deferred rows:

- **S-10** → `Deferred → ARC-04` (after the SCRIPTING read/write split): "run VALIDATION-TESTS T-01…T-18 in `read-only` and `pdi-developer` on a PDI; verdict decides whether Code Review of live scripts needs `pdi-developer`." Owner: **ARC-04-S05** (the gate-split story) runs it and writes `docs/spikes/S-10-read-only-sufficiency/README.md`; ARC-00 cannot — it ends before ARC-01 begins, so ARC-04-S05's tasks "hand the S-10 checklist to ARC-00" are to be read as "run the checklist recorded here". ARC-08 doctor note if it fails.
- **S-13** → `Deferred → ARC-02` (after descriptions ≤ 500 chars): "`claude --debug` listing shows 28 skill names with descriptions." Owner: ARC-02-S03 (the description-cap story) runs it and writes `docs/spikes/S-13-skill-listing/README.md`.

Fallback propagation table (in `spikes/README.md`, one row per FAILED verdict): S-01 → `01` §4.2 dialog sentence + ARC-06 INSTALL text; S-02 → ARC-07 `/snowarch setup-instance` last step; S-03 → `01` §13 + Q-B "Git Bash required" + ARC-06 per-machine override story; S-04 → `--password-stdin` prominence + doctor WARN (ARC-07/ARC-08); S-05 → ARC-06 toggle writer/hook placement + ARC-08 banner; S-06 → `MCP_TIMEOUT` value in `01` §5; S-07 → ARC-03 recipe + size sentence; S-08 → `docs/PLATFORM-NOTES.md` GPO sentence + `bootstrap-minimal.cmd` story in ARC-06; S-09 → Path B text; S-11 → floors; S-12 → ARC-05 explicit allow list; S-15 → B04 command; S-16 → skill `allowed-tools` (ARC-02); S-17 → ARC-04 advertise-status-only; S-18 → ARC-05 deny + PreToolUse hook story; S-19 → ARC-05 lint runs validate locally only; S-20 → ARC-06 `.mcp.json` `env` forwards `${HTTPS_PROXY:-}` / `${HTTP_PROXY:-}` / `${NO_PROXY:-}` / `${NODE_EXTRA_CA_CERTS:-}` + ARC-08 E-26 wording.

Gate sign-off block appended to this ARC's README: `ARC-01 entry: D-01/D-02/D-03 ADRs Accepted on <date>; LICENSE/NOTICE agreed on <date>.` and `ARC-06 entry: S-01/S-03/S-05/S-08/S-09/S-15/S-16 verdicts recorded on <date>; S-14 concluded on <date> with ADR-0006 <Accepted | superseded by ADR-0008>; Q-B ruling applied: <native first-class | Git Bash required>.`

**Acceptance criteria.**

1. `grep -E '^\| S-' 03-RISKS-AND-UNKNOWNS.md | grep -ci "unverified"` prints `0` (the word may remain in §D's heading, which is not a spike row); every S-01…S-20 row (S-14 as seven rows) has a Status and an Evidence path, and `test -f` on each Evidence path succeeds in the spike repository.
2. S-10 and S-13 rows read `Deferred → ARC-04` / `Deferred → ARC-02` with the exact check quoted; the ARC-04 and ARC-02 READMEs carry a matching dependency sentence naming the owning story (ARC-04-S05, ARC-02-S03).
3. `01` §13 and ARC-09 README state the Q-B outcome in one sentence each, matching the S-03/S-04/S-08 verdicts.
4. The fallback propagation table has one row per FAILED verdict and every target sentence was edited (a `git diff --stat` of the plans folder is pasted into the record).
5. ARC-03, ARC-05, ARC-06, ARC-07, ARC-09 README dependency lines quote the concrete ARC-00 outcome they consume (recipe letter, glob/explicit, S-05 choice, dialog count, S-02 last-step text, Windows recipe path).
6. The gate sign-off block is present with dates and the owner's initials; ARC-06-S01's start date is later than the S-14 conclusion date.
7. `spikes/README.md` verdict register lists S-01…S-20 (S-14 as seven sub-rows) with one line each, identical to the verdict lines in the records (`diff <(grep -h '^S-' spikes/S-*/README.md | sort) <(grep '^S-' spikes/README.md | sort)` is empty).
8. `03` §C R-15 carries the "closed by ARC-04-S11; S-20 …" sentence.

**Tasks.**

1. Collect verdict lines into `spikes/README.md`.
2. Edit `03` §A/§B/§C (columns, S-19 and S-20 rows, deferrals, R-15 sentence).
3. Apply the fallback propagation table to `01` and the ARC READMEs; apply Q-B.
4. Update the five dependency lines.
5. Write the gate sign-off; obtain the owner's initials.

**Test strategy.** Desk check with the greps in the acceptance criteria; owner review of the sign-off.

**Dependencies.** S02–S13 (all verdicts and texts).

**Size.** M — editing, no new evidence, but it touches `03` (three sections), `01` (§4.2, §5, §13 and any FAILED-verdict sentence), five ARC READMEs, the verdict register and the sign-off, and it waits on the owner's initials; one full day is realistic, two if several verdicts FAILED (each adds a propagation row and an ADR follow-up).

**Risks / open points.** Editing `01` for a FAILED verdict must not silently rewrite a decision — where a fallback changes a user-visible promise (S-01 dialog count, S-03 Windows), the change is quoted in the ADR follow-up of ADR-0007 (Q-B) or ADR-0001, dated. Evidence paths change when ARC-01 imports `spikes/` to `docs/spikes/`; ARC-01's import story rewrites the column in one sed.

**Definition of done.** `03`, `01` and the ARC READMEs consistent with the records; sign-off present; this ARC's README `Status:` set to "Complete — gates signed <date>".

---

## Sizing summary

| Size | Stories | Engineer-days (planning range) |
|---|---|---|
| S (≤ ½ day) | S02, S11, S13 | 1.5 |
| M (1–2 days) | S03, S04, S05, S06, S07, S08, S09, S10, S14 | 9–18 |
| L (3–5 days) | S01, S12 (time-boxed at 5) | 8–10 |
| **Total** | 14 stories | **19–30 engineer-days** (≈ 4–6 weeks for one engineer) |

At or under the six-week threshold; the upper bound assumes every M story takes two days, which only happens if most verdicts FAIL. S12 (S-14 plugin spikes) runs in parallel with S04–S10 on the calendar so that it concludes before ARC-06's first story without extending the ARC; the VMs from S01 are shared, so parallel work needs snapshot discipline (one spike per snapshot at a time). Interactive Claude Code spikes (S04, S05, S06, S10) cannot be parallelised on one machine; their day counts assume the two Claude Code versions are run back to back.
