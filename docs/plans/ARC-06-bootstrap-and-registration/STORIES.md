# ARC-06 — Stories

Status: Draft, adversarially verified 2026-09-04 (cross-ARC story IDs reconciled to each ARC's `STORIES.md`; B06 slot aligned with ARC-07 S05; S-20 branch added to S01) · Decisions applied: D-01…D-06, Q-A, Q-B, R-1…R-3 · Source: README.md of this ARC · Last updated: 2026-09-04

Conventions used throughout this file:

- **Names in force (D-01, R-1, R-2).** Repository `farstic/ai-servicenow-architect`; CLI `snowarch` (`./snowarch`, `snowarch.cmd`); MCP server key `servicenow` → tools `mcp__servicenow__snow_*`; server + CLI package `@farstic/snowarch` in `packages/snowarch` (entry `packages/snowarch/dist/server.js`); first release `2.0.0`; project skill `/snowarch` with sub-commands `status` · `setup-instance` · `doctor`. Every `packages/snow-mcp` path in `01` reads as `packages/snowarch`; every `/status` / `/setup-instance` reads as `/snowarch status` / `/snowarch setup-instance`.
- **Vocabulary.** Mode `design-only` | `live`; Preset `read-only` | `pdi-developer` | `full` | `custom`. "Tier" never appears in a user-visible string.
- **Step line format** (all launchers and the Node CLI): `[B02/09] docs … ok (48 s)` · `[B04/09] deps … FAIL` followed by `FAIL B04: <cause>` · `Remedy: <one exact command or sentence>` · `Re-run ./bootstrap.sh to resume at B04.` Skipped steps print `[B06/09] instance … skipped (design-only)`.
- **Exit codes** (bootstrap and every `snowarch` sub-command): `0` success · `1` a step or command failed (cause and remedy printed) · `2` usage error · `3` prerequisite missing (B00 FAIL, or Node absent for a Node-only command) · `130` interrupted (Ctrl-C; state flushed).
- **Principle 10 (D-05, `01` §2).** *Installation* runs uninterrupted after **one amendable plan summary** (S03/S07); *configuration* (B06 instance wizard) is always Propose → Review → Apply (ARC-07). `--yes` accepts every proposal. Nothing is applied without having been shown.
- **Secrets (D-04, `01` §7).** No story in this ARC reads, prints, logs or copies a credential. The only files that may hold one are `.local/instances.json` (written by ARC-04's store module through the B06 slot) and the operator-supplied `--instance-file` (read once, never copied, never logged).
- **Spike inputs.** S-01 (dialog count), S-03 (Windows `${CLAUDE_PROJECT_DIR}` expansion), S-05 (hook with Node absent), S-08 (`bootstrap.cmd` under Restricted policy), S-09 (Path B restart), S-15 (root `npm ci` footprint), S-16 (project `permissions.allow` after trust), S-20 (whether `HTTPS_PROXY` / `NO_PROXY` / `NODE_EXTRA_CA_CERTS` exported in the launching shell reach the server spawned from `.mcp.json` — ARC-00 S06; consumed by S01's `env` block) are ARC-00 verdicts recorded in ADRs before this ARC starts; the D-06 hedge (S-14a–g, S-19; ADR-0006 "monorepo path confirmed") is an **entry condition** for S01. Q-B: native Windows first-class is conditional on S-03/S-04/S-08; the "Git Bash required" fallback is pre-recorded in `03` §A and applied by S11/S14 without re-planning.
- **Cross-ARC story IDs** are the `ARC-NN-Sxx` identifiers of each ARC's `STORIES.md` story map (not the former README title numbers). In force here: ARC-01 S04 `engine.config.json` · S05 workspaces · S07 `.gitattributes` · S11 CI skeleton; ARC-03 S05 `docs sync` recipe · S06 `docsStatus()` · S10 attribution · S11 real-corpus job; ARC-04 S02 store module · S03 presets and prod rule · S04 unconfigured start + `snow_core_capabilities_read` · S11 proxy agent · S13 committed `dist/`; ARC-05 S01 `required-tools.json` · S07 generated permission blocks; ARC-07 S03 probe library · S05 `instance add` + `addInstance()` · S06 `instance list|test` · S09 `/snowarch setup-instance` skill · S11 live E2E; ARC-08 S01 framework · S03 detectors · S05 `Mode:` line and cache · S06 `--fix` · S08 banner · S09 `/snowarch status` · S11 CI; ARC-09 S04 `version` · S05 hash table · S08 CI matrix · S09 line endings.

## Story map

| ID | Title | Size | Depends on | Delivers |
|---|---|---|---|---|
| ARC-06-S01 | Committed `.mcp.json` and `.claude/settings.json`; placeholder and secret-shape tests | M | ARC-01 (layout, `engine.config.json`); ARC-00 S-05/S-06/S-20 verdicts (ARC-05 S07 later overwrites the seed permission block — consumer, not prerequisite) | `git clone` is the registration: two secret-free committed files and the test that keeps them so |
| ARC-06-S02 | `snowarch` CLI skeleton (stdlib only): argument parsing, exit codes, secret-free logging, `version` | M | ARC-01 | `tools/snowarch/bin/snowarch.mjs`, `lib/cli.mjs`, `lib/log.mjs`, `lib/redact.mjs`; root `snowarch` launcher (POSIX sh) |
| ARC-06-S03 | Bootstrap orchestrator: state file, step registry, resume, per-step input hashes, plan summary, `--yes` / `--from` / `--reset` | L | S02 | `lib/state.mjs`, `lib/steps/index.mjs`, `.local/bootstrap-state.json` v1, the one amendable plan screen |
| ARC-06-S04 | B00 preflight (floors from `engine.config.json`, root check, disk, network, Node detection) with named remedies | M | S03; ARC-03 S05 (git failure strings) | `lib/steps/B00.mjs`, `lib/remedies.mjs` (per-OS remedy table), R-3 DNS/TLS/proxy mapping for the github.com probe |
| ARC-06-S05 | B01 workspace and B07 `settings.local.json` toggles (merge, never overwrite); cloud-sync WARN; `.local/config.json` | M | S03; ARC-00 S-01/S-05 verdicts | `lib/steps/B01.mjs`, `lib/steps/B07.mjs`, `lib/settings-local.mjs` |
| ARC-06-S06 | B02 docs step calling the ARC-03 recipe; `--docs sparse\|full\|skip`; launcher recipe parity | M | S03; ARC-03 S05/S06 | `lib/steps/B02.mjs`; the embedded git-only recipe for S10/S11 with a parity test |
| ARC-06-S07 | B03 mode line of the plan; B04 `npm ci`; B05 contract sha check; the B06 wizard slot; `--instance-file` non-interactive live bootstrap | L | S03, S05; ARC-04 S02/S03/S13; ARC-05 S01; ARC-00 S-15 | `lib/steps/B03…B06.mjs`, the slot interface ARC-07 S05 implements, operator path for CI |
| ARC-06-S08 | B08 MCP stdio handshake and live-probe invocation; `.local/doctor-last.json` v1 | M | S07; ARC-04 S04/S13; (probes) ARC-07 S06 | `lib/mcp-handshake.mjs`, `lib/steps/B08.mjs`, the cache the SessionStart banner reads |
| ARC-06-S09 | B09 summary: `DOCTOR:` line, authoritative `Mode:` line, next-step text with the dialog budget | S | S05, S08; ARC-00 S-01 | `lib/steps/B09.mjs`, `lib/text.mjs` (platform-specific command spellings, S-01 constant) |
| ARC-06-S10 | `bootstrap.sh` (bash 3.2-clean) with the Node-free design-only path | L | S04, S05, S06, S09 | The macOS/Linux/Git-Bash launcher: exec into Node when present, B00/B01/B02/B07/B09 itself when not |
| ARC-06-S11 | `bootstrap.ps1` + `bootstrap.cmd` with the Node-free design-only path; `snowarch.cmd` | L | S10; ARC-00 S-03/S-08 verdicts, S13 Windows recipe | Native Windows launchers (PowerShell 5.1, cmd, double-click) — Q-B conditional |
| ARC-06-S12 | `snowarch mode live` / `mode design` post-install switches; `mode live --register local\|user` fallback | M | S07, S08, S09 | Upgrade design-only → live without re-clone; managed-policy fallback via `claude mcp add-json … -s local` |
| ARC-06-S13 | `docs/INSTALL.md` (= README body); Path B recipe sentence and non-empty-folder clone sequence; uninstall; start-at-root note | M | S09, S10, S11, S12; ARC-03 S10 (attribution, size/time); ARC-00 S-09 | The one install page, both paths, both dialogs, the `/snowarch setup-instance` hand-off text shared with ARC-07 |
| ARC-06-S14 | CI: design-only bootstrap on three OSes with and without Node; Windows job without Git Bash; no-tracked-file-modified and secret-grep gates | M | S10, S11; ARC-01 S11 (CI skeleton); ARC-00 S13 (Windows recipe) | `.github/workflows/ci.yml` job `bootstrap`; the assertions ARC-08 S11 and ARC-09 S08 extend |

Mapping to the README's original titles-only list: 1 → S01 · 2 → S02 · 3 → S03 · 4 → S04 · 5 → S05 · 6 → S06 · 7 → S07 · 8 → S08 · 9 → S09 · 10 → S10 · 11 → S11 · 12 → S12 · 13 → S13 · 14 → S14 · **15 (`--instance-file`) merged into S07** — it is the non-interactive input of the same B06 slot and shares its validation, prod-acknowledgement and store-write path; keeping it separate would duplicate the slot contract. Cross-ARC references to this ARC use the `ARC-06-Sxx` ids (integration pass 2026-09-04).

## Stories

### ARC-06-S01 — Committed `.mcp.json` and `.claude/settings.json`; placeholder and secret-shape tests

**As** an individual practitioner **I want** the MCP registration and the team settings to travel with `git clone` as two committed, secret-free files **so that** nothing is ever written to `~/.claude.json`, no path is discovered by hand, and the doctor can prove the files are correct byte for byte.

**Context.** P-01 (hand-edited `~/.claude.json` with a plaintext password, keyed on an absolute path), P-34 (six credential copies, argv exposure). `01` §5 gives the exact content and the evidence table; `00` §9 verified `${VAR:-default}` expansion and that an unset `${VAR}` without a default is passed literally. README acceptance criteria: "`~/.claude.json` is byte-identical before and after the bootstrap", "`grep -r "PASSWORD\|SECRET" .mcp.json .claude/settings.json` returns nothing". D-01 fixes the key `servicenow` and the path `packages/snowarch/dist/server.js`; D-03 removes the author's context-mode hooks block (`engine:.claude/settings.json` today is nothing but three context-mode hooks and `effortLevel`).

**Scope.** In: the two files, `tests/registration-files.test.mjs`, the `.gitignore` line for `.claude/settings.local.json` (verify, ARC-01 owns the file), the `engine.config.json` cross-check. Out: the generated `permissions.allow`/`ask` contents (ARC-05 S07 — this story commits the six-entry seed block of `01` §5 and ARC-05's generator replaces the whole `permissions` key); the hook script body (`tools/snowarch/hooks/session-start.mjs`, ARC-08 S08 — this story commits a stub that prints `Mode: unknown — run ./snowarch doctor` and exits 0 so the committed hook never errors).

**Design notes.**

- `.mcp.json` (exact, LF, 2-space indent):
  ```json
  {
    "mcpServers": {
      "servicenow": {
        "type": "stdio",
        "command": "node",
        "args": ["${CLAUDE_PROJECT_DIR:-.}/packages/snowarch/dist/server.js"],
        "env": {
          "SNOW_STORE": "${SNOW_STORE:-}",
          "SNOW_LOG_LEVEL": "${SNOW_LOG_LEVEL:-info}"
        },
        "timeout": 600000
      }
    }
  }
  ```
  `SNOW_STORE` empty means "use the default precedence" (ARC-04 S02: `<CLAUDE_PROJECT_DIR ?? cwd>/.local/instances.json` → `~/.config/snowarch/instances.json` → unconfigured; ARC-04 S11 deletes empty-string proxy/CA variables at start-up, so a `:-` default of `""` is safe). Forward slashes only (Node accepts them on Windows, `01` §13). **S-20 branch:** if the ARC-00 S06 verdict is "forward" (the launching shell's environment does *not* reach the spawned server), the `env` block additionally carries `"HTTPS_PROXY": "${HTTPS_PROXY:-}"`, `"HTTP_PROXY": "${HTTP_PROXY:-}"`, `"NO_PROXY": "${NO_PROXY:-}"`, `"NODE_EXTRA_CA_CERTS": "${NODE_EXTRA_CA_CERTS:-}"` — still secret-free, still `:-`-defaulted; if the verdict is "inherit", the block stays as shown. The chosen branch is recorded in `docs/ARCHITECTURE.md` with the ADR reference and the test below asserts the exact key set for that branch.
- `.claude/settings.json`: `env.MCP_TIMEOUT` = the S-06 verdict value (default `"120000"`); `hooks.SessionStart` exec form `{"type":"command","command":"node","args":["${CLAUDE_PROJECT_DIR}/tools/snowarch/hooks/session-start.mjs"],"timeout":10}` with matcher `startup|resume`; `permissions` seed block from `01` §5 (`Bash(./snowarch doctor*)`, `Bash(node tools/snowarch/bin/snowarch.mjs *)`, the four core read tools in `allow`; `mcp__servicenow__snow_core_record_add` in `ask`). **S-05 branch:** if the S-05 record says a hook with Node absent blocks the session, the committed file is hook-free and S05 writes the same hook object into `.claude/settings.local.json` only when Node ≥ 20 is present (`03` S-05 fallback, second option); the test then asserts the committed file has no `hooks` key. Nothing else lives in the file — no `effortLevel`, no model pin (`00` P-10).
- `tests/registration-files.test.mjs` (node:test, run by `npm test`): parses both files; `Object.keys(mcpServers)` deep-equals `[engine.config.json.mcp.serverKey]`; `type === "stdio"`, `command === "node"`, `args[0]` ends with `/packages/snowarch/dist/server.js` and starts with `${CLAUDE_PROJECT_DIR:-.}`; every `${…}` occurrence in any string of `.mcp.json` matches `/^\$\{[A-Z_][A-Z0-9_]*:-[^}]*\}$/` (a placeholder without `:-` fails with the offending path); the only placeholder allowed in `settings.json` is `${CLAUDE_PROJECT_DIR}` inside `hooks[*].hooks[*].args`; no key at any depth in either file matches `/PASSWORD|SECRET|TOKEN|_KEY$/i`; no string value at any depth matches the same pattern as a `KEY=value` pair; every `mcp__…__` token in `permissions` starts with `mcp__${serverKey}__`; `git check-ignore -q .claude/settings.local.json` succeeds; `git ls-files --error-unmatch .mcp.json .claude/settings.json` succeeds (both tracked).
- `.local/` and `.claude/settings.local.json` stay gitignored (ARC-01 S07) — S-01 depends on `settings.local.json` being **untracked** (`03` S-01: Claude Code runs git to check that before applying its approvals).

**Acceptance criteria.**

1. On a fresh clone, `cat .mcp.json` equals the block above byte for byte and `git ls-files .mcp.json .claude/settings.json` lists both.
2. `grep -rE "PASSWORD|SECRET|TOKEN|_KEY\"" .mcp.json .claude/settings.json` prints nothing; `node --test tests/registration-files.test.mjs` passes.
3. Editing `.mcp.json` to `"SNOW_STORE": "${SNOW_STORE}"` (no default) makes the test fail with a message naming `mcpServers.servicenow.env.SNOW_STORE`.
4. Changing `engine.config.json.mcp.serverKey` to `snow` without changing `.mcp.json` fails the test with `server key mismatch: engine.config.json=snow .mcp.json=servicenow`.
5. In a trusted checkout with Node 22 and after `./bootstrap.sh --mode live` (S07–S09), `claude mcp get servicenow` reports the project-scope server with command `node` and the resolved `…/packages/snowarch/dist/server.js` path; `sha256sum ~/.claude.json` is identical before `./bootstrap.sh` and after B09 (the first `claude` may change it — that is Claude Code's own trust record, per README acceptance).
6. With the S-05 "blocking" branch active, `jq .hooks .claude/settings.json` prints `null`; otherwise it prints the single SessionStart entry with `command: "node"`.
7. `jq -r '.mcpServers.servicenow.env | keys[]' .mcp.json` prints exactly `SNOW_LOG_LEVEL SNOW_STORE` under the S-20 "inherit" verdict, and exactly `HTTPS_PROXY HTTP_PROXY NODE_EXTRA_CA_CERTS NO_PROXY SNOW_LOG_LEVEL SNOW_STORE` under "forward"; the test carries the branch as a constant `S20_BRANCH` (`"inherit"` | `"forward"`) with a comment citing the ADR that records the ARC-00 S06 verdict — the same pattern as S09's `EXPECTED_DIALOGS` — and fails on any other key set.

**Tasks.**

1. Write `.mcp.json` and `.claude/settings.json` for the recorded S-20 branch; delete the imported context-mode hooks and `effortLevel` (D-03 item 9).
2. Commit the hook stub `tools/snowarch/hooks/session-start.mjs` (replaced by ARC-08 S08).
3. Write the test; wire into root `npm test`.
4. Add the CI grep (`grep -rE` above) to the `lint` script so it fails even before the test runner starts.
5. Record the S-05 branch chosen in `docs/ARCHITECTURE.md` ("Registration files" paragraph).

**Test strategy.** Unit test on the three CI OSes (pure file parsing). Manual: criterion 5 on macOS and Windows (the S-01 spike procedure, `03` §A, re-run once against the real files).

**Dependencies.** ARC-01 (layout, `engine.config.json`, `.gitignore`); consumer, not prerequisite — ARC-05 S07 overwrites the seed permission block later (the seed ships first); ARC-00 S-05, S-06 and S-20 verdicts. Entry condition for the whole ARC: ADR-0006 "monorepo path confirmed" (D-06 hedge).

**Size.** M — two small files, but the test must be exhaustive because the doctor (ARC-08 E-checks) and the CI lint both reuse its rules.

**Risks / open points.** `enabledMcpjsonServers` semantics could change in a later Claude Code release (R-13) — the doctor re-checks `claude mcp get servicenow` text. If S-12 (middle-wildcard globs) fails, ARC-05's generator emits ~250 explicit entries into `permissions.allow`; the test does not care about the count.

**Definition of done.** Merged; test green on the matrix; `docs/ARCHITECTURE.md` paragraph written; ARC-08's E-check for "files equal committed hashes and placeholders carry `:-`" cites this test's rules.

---

### ARC-06-S02 — `snowarch` CLI skeleton (stdlib only): argument parsing, exit codes, secret-free logging, `version`

**As** a maintainer **I want** one zero-dependency Node ESM entry point with a fixed sub-command table, uniform flag parsing, uniform exit codes and a logger that cannot leak a secret **so that** every later story (bootstrap steps, `mode`, and the `docs`/`doctor`/`instance` sub-commands other ARCs mount) plugs into the same frame and runs before `npm ci` has ever executed.

**Context.** `01` §3 (`tools/snowarch/` — "ZERO-DEPENDENCY Node ESM CLI (node:fs, child_process, readline, https, crypto)"), §12 (`./snowarch version`), §13 (all shipped tooling is Node; launchers are ~100 lines). P-16 (bash-only tooling; doctor prints the username in clear). ARC-05 acceptance: "`tools/snowarch` contains no literal flag name, preset name or tool name".

**Scope.** In: `tools/snowarch/bin/snowarch.mjs`; `tools/snowarch/lib/cli.mjs` (parser), `lib/log.mjs`, `lib/redact.mjs`, `lib/config.mjs` (reads `engine.config.json`, root discovery), `lib/exit.mjs`; the root `snowarch` launcher (POSIX `sh`); `tools/snowarch/package.json` (`"type": "module"`, no `dependencies`, `"engines": {"node": ">=20"}`); the `version` sub-command. Out: `snowarch.cmd` (S11); `doctor` (ARC-08), `docs` (ARC-03), `instance` (ARC-07), `upgrade` (ARC-09) — this story registers their names in the sub-command table with a placeholder that prints `not available in this build` and exits 1 so `--help` is complete from day one.

**Design notes.**

- `bin/snowarch.mjs`: `#!/usr/bin/env node`; `import { main } from '../lib/cli.mjs'; process.exitCode = await main(process.argv.slice(2))`. Sub-commands: `bootstrap` (S03) · `mode` (S12) · `version` · `docs` · `doctor` · `instance` · `upgrade` · `help`. Unknown sub-command → `snowarch: unknown command "x" — run ./snowarch help` exit 2.
- Parser (`lib/cli.mjs`): long flags only (`--mode live`, `--mode=live`, boolean `--yes`, repeated `--docs`), `--json`, `--quiet`, `--verbose`, `--help` on every sub-command; unknown flag → usage error exit 2 with the sub-command's usage block. No dependency; ~120 lines.
- Root discovery (`lib/config.mjs`): the CLI's own location (`fileURLToPath(import.meta.url)/../../..`) is the repository root; it **never** uses `process.cwd()` for file access. `process.cwd() !== root` is reported by B00 (S04) and by every sub-command as a one-line notice `note: run from the repository root (<root>) — Claude Code reads .mcp.json from the session's working directory` (not an error for the CLI itself). `engine.config.json` is loaded and validated for the keys this ARC reads: `product`, `repo`, `mcp.serverKey`, `mcp.package`, `floors.{claudeCode,node,git}`, `docs.{family,pin,areasFile}`.
- Logger (`lib/log.mjs`): console lines (`step`, `ok`, `warn`, `fail`, `note`) plus a file log `.local/logs/<command>-<yyyymmdd-hhmmss>.log` (opened lazily after `.local/` exists; 0600 on POSIX; keep the last 10 files). **Every** line, console or file, passes through `redact()` first.
- `lib/redact.mjs`: (a) `KEY=value` and `"key": "value"` pairs whose key matches `/PASSWORD|SECRET|TOKEN|_KEY$/i` → `KEY=set (len n)`; (b) `Authorization: …` header values → `Authorization: <redacted>`; (c) e-mail-shaped and `user.name`-shaped usernames → `c***@corp.com` / `c***.n***`; (d) any string that equals a value the process was told is secret (`redact.register(value)` called by S07 when it reads an instance file) → `<redacted>`. Unit-tested with fixtures; the fixture secrets never appear in test output (the test greps its own captured stdout).
- Exit codes as in the conventions block; `lib/exit.mjs` exports named constants (`EXIT_OK`, `EXIT_FAIL`, `EXIT_USAGE`, `EXIT_PREREQ`, `EXIT_INTERRUPTED`) used everywhere; a story may not invent a new code.
- `version`: prints `snowarch 2.0.0 · contract <sha256 first 12> · docs pin <7> (<family>) · floors: Claude Code ≥ 2.1.214, Node ≥ 20, git ≥ 2.25`; `--json` prints `{ version, contractSha, docsPin, docsFamily, floors }`. Values: root `package.json.version`, `sha256(packages/snowarch/dist/contract.json)` (or `null` with `contract: not built` when the file is absent), `engine.config.json.docs`. ARC-09 S04 extends the line with the git tag and the "behind origin" state; it does not change the existing fields.
- Root `snowarch` (POSIX sh, ≤ 15 lines): resolves its own directory, checks `command -v node`, and `exec node "$DIR/tools/snowarch/bin/snowarch.mjs" "$@"`; if Node is absent: `snowarch: Node.js 20+ is required for this command. Design-only mode works without Node (./bootstrap.sh --mode design); to add live mode install Node 22 (macOS: brew install node@22 · Linux: your distribution package or nvm) and re-run.` exit 3. Node < 20 present: `snowarch: Node.js <v> found, 20+ required — upgrade Node and re-run.` exit 3. Executable bit committed (`git update-index --chmod=+x snowarch`).

**Acceptance criteria.**

1. On a fresh clone with Node 22 and **no** `node_modules`, `./snowarch version` prints the line above with the real values and exits 0; `./snowarch version --json | node -e "JSON.parse(require('fs').readFileSync(0))"` succeeds.
2. `./snowarch frobnicate` prints `snowarch: unknown command "frobnicate" — run ./snowarch help` and exits 2; `./snowarch bootstrap --frob` exits 2 with the bootstrap usage block.
3. With Node removed from PATH, `./snowarch version` prints the Node-absent message and exits 3; with Node 18 on PATH it prints the "20+ required" message and exits 3.
4. `node --test tools/snowarch/tests/redact.test.mjs` passes and the test's own output, captured to a file, contains none of the fixture secrets (`grep -c` = 0).
5. `grep -rn "require('\|from '" tools/snowarch/lib tools/snowarch/bin | grep -v "node:"` prints nothing (no third-party import; `node:` protocol enforced).
6. `find tools/snowarch -name package.json -exec grep -l '"dependencies"' {} +` prints nothing.

**Tasks.**

1. Create `tools/snowarch/package.json`, `bin/snowarch.mjs`, `lib/cli.mjs`, `lib/config.mjs`, `lib/log.mjs`, `lib/redact.mjs`, `lib/exit.mjs`.
2. Implement `version`; register placeholder entries for `docs`, `doctor`, `instance`, `upgrade`.
3. Write the root `snowarch` launcher; commit with the executable bit; add `snowarch` to `.gitattributes` as `text eol=lf`.
4. Tests: parser table test, redact fixtures, version JSON shape, unknown-command exit code.
5. Add `tools/snowarch/tests` to the root `npm test` glob.

**Test strategy.** node:test on the three CI OSes; the Node-absent cases run in the S14 job's PATH-stripped variant; Node 18 case manual on the reference machine (nvm).

**Dependencies.** ARC-01 (root `package.json` workspaces include `tools/snowarch`; `engine.config.json`).

**Size.** M — small modules, but the redactor and the exit-code discipline are load-bearing for every later story.

**Risks / open points.** Redaction by pattern cannot catch a secret that looks like a plain word; the design never puts a secret on a code path that logs (S07 registers instance-file values explicitly). `process.stdin.setRawMode` masked input is ARC-07's, not this story's.

**Definition of done.** Merged; tests green; `docs/CONTRIBUTING.md` gains "adding a `snowarch` sub-command" (table, exit codes, logger rules).

---

### ARC-06-S03 — Bootstrap orchestrator: state file, step registry, resume, per-step input hashes, plan summary, `--yes` / `--from` / `--reset`

**As** an individual practitioner **I want** `./snowarch bootstrap` to show me one plan I can amend, then run its numbered steps uninterrupted, remember exactly where it stopped, and re-run only what changed **so that** a failure, a Ctrl-C or an upgrade never means "start over" and never touches my credentials.

**Context.** `01` §4.2 ("Failure and resume: … resumes at the first incomplete step or the first step whose inputs hash changed (`--from B06` forces; `--reset` starts over)"), §12 (per-step input hashes drive `upgrade`), principle 10 (one up-front plan summary). README acceptance: "Killing the bootstrap during B04 and re-running resumes at B04, and `--reset` starts over; changing `package-lock.json` invalidates only B04". P-02 (four unstated steps). ARC-08 depends on this state file for `/snowarch status` when Node is absent; ARC-09 S05 documents the hash table this story implements.

**Scope.** In: `lib/state.mjs`, `lib/steps/index.mjs` (registry + runner), the `bootstrap` sub-command with flags `--mode design|live`, `--docs sparse|full|skip`, `--yes`, `--from BNN`, `--reset`, `--instance-file <path>` (parsed here, consumed in S07), `--skip-claude-check` (S04), `--json` (final summary object), the plan screen, SIGINT handling, the step-line output. Out: the bodies of B00–B09 (S04–S09); the launcher-side (Node-free) writer of the same state file (S10/S11 — they write a subset with the same schema).

**Design notes.**

- **Step registry.** Each `lib/steps/BNN.mjs` exports `{ id, title, needsNode: bool, runsWhen: ({mode, node}) => bool, inputs: (ctx) => string[] /* paths or literals hashed */, run: async (ctx) => StepResult }`. `StepResult = { status: 'ok'|'warn'|'fail'|'skipped', detail?, remedy?, data? }` (`data` is a small JSON object stored in the state — never secrets). Every step module is importable and its `run(ctx)` callable stand-alone (no dependence on the runner's globals) — ARC-08 S06's `--fix` calls B02/B04/B07 this way. The runner always records `durationMs` per step (ARC-09 S03's install-metrics script reads it; no `--timings` flag exists or is needed). Table:

  | Step | Title | Needs Node | Runs when | Inputs hashed |
  |---|---|---|---|---|
  | B00 | preflight | no | always (never cached — re-runs every time, < 2 s) | — |
  | B01 | workspace | no | always | `.mcp.json`, `.claude/settings.json` (content), mode |
  | B02 | docs | no (checkout) / yes (citations) | docs mode ≠ skip | `vendor/docs-areas.txt`, `git ls-tree HEAD vendor/ServiceNowDocs` (gitlink), docs mode |
  | B03 | mode | no | always (records the plan's answers) | `--mode` value |
  | B04 | deps | yes | mode = live | `package-lock.json`, Node major version |
  | B05 | contract | yes | Node present (both modes) | `packages/snowarch/dist/contract.json`, `packages/contract/required-tools.json` |
  | B06 | instance | yes | mode = live | store schema version, store presence (`.local/instances.json` exists: yes/no), `--instance-file` given: yes/no |
  | B07 | toggles | no | always | mode, Node present, S-05 branch, registration kind |
  | B08 | verify | yes | mode = live | `dist/contract.json` sha, store mtime |
  | B09 | summary | no | always (never cached) | — |

- **State file** `.local/bootstrap-state.json` v1 (0600 on POSIX; atomic write via temp file + `fs.rename`):
  ```json
  { "version": 1, "product": "snowarch", "engineVersion": "2.0.0",
    "mode": "design-only", "docs": { "mode": "sparse", "pin": "ba513f2c…" },
    "node": { "present": true, "version": "22.11.0" },
    "writer": "node", "platform": "darwin", "registration": "project", "registrationReason": "default", "hooksDisabledByBootstrap": false,
    "startedAt": "2026-09-04T10:00:00Z", "updatedAt": "…",
    "steps": { "B00": { "status": "ok", "inputsHash": null, "finishedAt": "…", "durationMs": 812 },
               "B04": { "status": "failed", "inputsHash": "sha256:…", "reason": "interrupted", "finishedAt": "…" } } }
  ```
  `writer` ∈ `node` | `bash` | `powershell` (the launchers write the same schema, S10/S11). `mode` is `null` until B03 records it. `registration` ∈ `project` | `local` | `user` with `registrationReason` ∈ `default` | `s03-fallback` | `--register` (written by B07/S05 and by S12; ARC-08 E-23/E-27 render them as `registration: local (S-03 fallback)` / `local (--register local)`). `hooksDisabledByBootstrap` is `true` only when S05's S-05 branch-A writer added `disableAllHooks` (read by ARC-08 E-10/F6 and by S12's removal rule). Never a URL, username, label of an instance (labels live in `.local/config.json`, S05) or any secret.
- **Resume rule.** For each step in order: skip if `runsWhen` is false (print `skipped (<reason>)`); if `--from BNN` and step < BNN and its recorded status is `ok` → print `ok (cached)`; else if recorded status is `ok` **and** `sha256(inputs)` equals `inputsHash` → `ok (cached)`; else run. A `fail` stops the run (`exit 1`) after writing the state; a `warn` continues. `--reset` deletes `.local/bootstrap-state.json` and `.local/doctor-last.json` only — it prints `reset: bootstrap state cleared (.local/instances.json and .local/config.json untouched)` and never removes the store, the docs checkout or `node_modules`.
- **Plan screen (principle 10)** — printed after B00, before anything is written (B01 onwards), unless `--yes`:
  ```
  Plan — Enter runs it as shown · type a number to change that line · q quits
    1  Mode   design-only          live needs a ServiceNow instance (wizard runs in this terminal); Node 22.11.0 found
    2  Docs   sparse (19 areas)    full = whole corpus · skip = none (the doctor will report FAIL)
    Steps  B01 workspace · B02 docs · B05 contract · B07 toggles · B09 summary
  >
  ```
  Proposal rules: Mode proposes `design-only` (principle 1) unless `--mode` was given or the state file already records `live`; when Node is absent line 1 reads `design-only (fixed — Node.js 20+ not found; add live mode later with ./snowarch mode live)` and cannot be changed; choosing `live` rewrites the `Steps` line to include B04 · B06 · B08 (B03 records the final answers). Docs proposes the state's recorded mode or `sparse`. The screen is re-printed after every change; Enter applies. `--yes` prints the plan with `(accepted: --yes)` and continues. The screen is the **only** interactive moment of the installation; B06 (configuration) is the wizard's own Propose → Review → Apply (ARC-07).
- **`--mode live --yes` without `--instance-file`** → usage error exit 2: `live mode with --yes needs --instance-file <path>: credentials cannot be typed non-interactively (see docs/INSTALL.md "Operators and CI")`.
- **Ctrl-C.** `process.on('SIGINT')`: the running step's child processes receive SIGINT (npm, git), the state records `status: "failed", reason: "interrupted"`, the console prints `interrupted during B04 — re-run ./bootstrap.sh to resume at B04`, exit 130.
- **Console.** One step line per step as in the conventions; durations in seconds; with `--json` the final object `{ mode, docs, steps: {…}, summary: {ok, warn, fail, skipped}, next: "<text>" }` is printed on stdout and human lines go to stderr.
- Windows: no `chmod`; the state records `"fileModes": "acl-inherited"`.

**Acceptance criteria.**

1. On a fresh clone (Node 22), `./snowarch bootstrap --mode design --yes` prints ten step lines (`B04`, `B06`, `B08` as `skipped (design-only)`), creates `.local/bootstrap-state.json` with `mode: "design-only"` and `steps.B09.status: "ok"`, exits 0; a second run prints `ok (cached)` for B01, B02, B05, B07 and finishes in < 5 s.
2. Running `./snowarch bootstrap` (no flags) shows the plan screen; pressing `1` then Enter changes line 1 to `live` and the Steps line to include `B04 · B06 · B08`; `q` exits 0 without creating `.local/`.
3. Given a live run killed with Ctrl-C while B04 is executing `npm ci`, the state shows `B04.status = "failed", reason = "interrupted"`, the exit code is 130, and the next `./bootstrap.sh` prints `ok (cached)` for B01–B03 and runs B04.
4. Given a completed live run, appending a newline to `package-lock.json` and re-running makes **only** B04 (and, because its input includes the store mtime, not B08) re-run: the step lines show exactly one non-cached step among B01–B07 and B08 `ok (cached)`; restoring the file re-runs B04 once more — the run with the modified lockfile recorded that hash — and then everything is cached again. (B00 and B09 always run.)
5. `./snowarch bootstrap --from B06` on a completed live run re-runs B06, B07, B08, B09 and caches B01–B05.
6. `./snowarch bootstrap --reset` removes the state and `doctor-last.json`, prints the "untouched" sentence, and `sha256sum .local/instances.json` is unchanged.
7. `./snowarch bootstrap --mode live --yes` without `--instance-file` exits 2 with the sentence above and writes nothing.
8. `cat .local/bootstrap-state.json | grep -Ei "password|secret|token|https://"` prints nothing after a live run.

**Tasks.**

1. Implement `lib/state.mjs` (load/validate/save/atomic; schema version guard: an unknown `version` → `state file is from a newer snowarch — run ./snowarch upgrade` exit 1).
2. Implement the registry and runner (`lib/steps/index.mjs`), input hashing (`sha256` over the concatenation of file contents / literals, files missing hashed as `<absent>`), cache decision, `--from`, `--reset`.
3. Implement the plan screen with `node:readline`; `--yes`; `--mode` / `--docs` pre-fill.
4. SIGINT handling and child-process propagation: POSIX `child.kill('SIGINT')`; on Windows `child.kill()` terminates only the direct child (Node's `TerminateProcess` semantics), so the runner spawns `taskkill /PID <child.pid> /T /F` to end npm/git grandchildren, then marks the step interrupted.
5. `--json` output; step-line formatter shared with S10/S11 wording.
6. Tests with stub steps (fast) for cache/resume/`--from`/`--reset`/interrupt.

**Test strategy.** Unit tests with stubbed steps on three OSes (state transitions, hashes, plan-screen parser fed through a PTY-less stdin mock). Integration: criteria 3–5 run in the S14 CI job in **design** mode with B04 forced by the test-only variable `SNOWARCH_TEST_FORCE_DEPS=1` (documented in the test; it makes `runsWhen` true for B04 only), so the interrupt and lockfile criteria need no ServiceNow instance and no `--instance-file`. Manual: criterion 2 (TTY) on macOS and Windows Terminal.

**Dependencies.** S02. ARC-09 S05 later documents this hash table in `docs/ARCHITECTURE.md`; S03 writes the first version of that table.

**Size.** L — the runner is straightforward, but resume semantics, the plan screen and interrupt handling need careful tests; 3–4 days.

**Risks / open points.** The store mtime as a B08 input means a wizard re-run correctly re-verifies; a `touch` also does, which is harmless. Hash inputs read whole files (`package-lock.json` ≈ 1 MB) — negligible.

**Definition of done.** Merged; tests green; `docs/ARCHITECTURE.md` "Bootstrap steps and state file" section (step table, state schema v1, hash table, exit codes) written; ARC-08 S09 (`/snowarch status` without Node) and ARC-09 S05 reference the schema.

---

### ARC-06-S04 — B00 preflight (floors from `engine.config.json`, root check, disk, network, Node detection) with named remedies

**As** an individual practitioner **I want** the bootstrap to check every prerequisite up front and stop with one named remedy per failure **so that** I never discover a missing tool half-way through, and a corporate proxy or TLS gateway is diagnosed by name rather than as a generic clone failure.

**Context.** `01` §4.1 (floors: Claude Code ≥ 2.1.214 logged in, git ≥ 2.25, Node ≥ 20 for live, disk ≥ 1 GB, HTTPS to github.com), §4.2 B00 ("Any FAIL prints a named remedy and exits 3 — nothing else runs"), §12 ("the doctor reads the floors from `engine.config.json`"). README risk "Users run the launcher from a subfolder → B00 detects 'not at repo root' and prints `cd`". R-3 (proxy / TLS-CA diagnosis; `03` R-15). The legacy `scripts/setup.sh` S1 and `doctor.sh` section 1 checked the toolchain but never disk, network or the working directory (`00` §3.9).

**Scope.** In: `lib/steps/B00.mjs`, `lib/remedies.mjs` (remedy table keyed by check id × platform), `lib/probe-net.mjs` (github.com reachability with failure classification), the `--skip-claude-check` flag (CI runners without Claude Code). Out: the Node-free re-implementation (S10/S11 — same checks, same strings, git-based network probe); the doctor's presentation of the same checks (ARC-08 E-00…E-02 wrap this module).

**Design notes.**

- Checks, in order (each prints `ok`/`WARN`/`FAIL` with a detail; any FAIL → after all checks, `FAIL B00: <n> prerequisite(s) missing` exit 3):
  1. **Root**: `process.cwd()` resolves to the repository root (S02 discovery) **and** `git -C <root> rev-parse --show-toplevel` equals it. Else `FAIL B00: not at the repository root — run: cd "<root>" && ./bootstrap.sh` (Windows: `cd /d "<root>" && .\bootstrap.cmd`).
  2. **git**: `git --version` parsed (`git version 2.39.5 (Apple Git-146)` → `2.39.5`) ≥ `floors.git`. Remedy per platform: macOS `xcode-select --install` or `brew install git`; Windows `winget install Git.Git` (Git for Windows); Linux distribution package. Below floor: `git <v> found, ≥ 2.25 required (cone sparse-checkout)`.
  3. **Claude Code**: `claude --version` first line → semver ≥ `floors.claudeCode`; absent → `FAIL B00: Claude Code not found on PATH — install it from https://code.claude.com/docs/en/setup, then re-run` (with `--skip-claude-check`: `WARN B00: Claude Code check skipped (--skip-claude-check)`); below floor → the version and the reason (`.mcp.json approval semantics need ≥ 2.1.196; hook placeholders ≥ 2.1.198; tool-list refresh ≥ 2.1.214`). **Logged in**: `claude auth status` is attempted only if the installed CLI lists that sub-command in `claude --help` output; a non-zero result → `WARN B00: Claude Code is not logged in — run: claude` (never FAIL: login is Claude Code's own first-run flow); if the sub-command does not exist the line reads `login: not verified (claude auth status unavailable)`. S-11 records which CLI versions support it.
  4. **Disk**: `fs.statfs(root)` free bytes ≥ 1 GiB (sparse docs ≈ 300 MB + deps ≈ 72 MB + headroom; `--docs full` raises the requirement to 1.5 GiB). Remedy: `free up <n> MB on <mount>`.
  5. **Network**: `lib/probe-net.mjs` does an HTTPS `HEAD https://github.com/` with a 10 s timeout through `node:https`, honouring `HTTPS_PROXY`/`https_proxy` via a CONNECT tunnel when set (stdlib only: open a socket to the proxy, send `CONNECT github.com:443`, then TLS over it) and `NO_PROXY`. Classification and exact strings (aligned with ARC-03 S05 so the user sees one vocabulary): `ENOTFOUND`/`EAI_AGAIN` → `cannot reach github.com (DNS) — check your network or proxy (set HTTPS_PROXY) and re-run`; `UNABLE_TO_VERIFY_LEAF_SIGNATURE`/`SELF_SIGNED_CERT_IN_CHAIN`/`CERT_*` → `TLS interception detected — export NODE_EXTRA_CA_CERTS=<your corporate CA bundle .pem> (and git config --global http.sslCAInfo <same file>) and re-run`; `ECONNREFUSED`/`ETIMEDOUT` with a proxy set → `proxy <host:port> not reachable — check HTTPS_PROXY / NO_PROXY and re-run`; without a proxy → `no route to github.com — are you offline?`. Any of these is FAIL (the clone and the docs fetch will fail the same way). Any 2xx/3xx is ok. `--no-network` is **not** offered here (B02 needs the network; `docs skip` users still need git); the doctor has it (ARC-08).
  6. **Node**: `node --version` ≥ `floors.node` → `ok (22.11.0)`; absent → `note: Node.js not found — design-only only; live mode needs Node 20+ (macOS: brew install node@22 · Windows: winget install OpenJS.NodeJS.LTS · Linux: distribution package or nvm)`; below floor → the same as a note (not FAIL — design-only still works; `01` §4.1). If `--mode live` was requested and Node is missing/below floor → `FAIL B00: live mode needs Node.js 20+ — <remedy>` exit 3. `npm` presence checked whenever Node passes (`npm --version`); absent → the same FAIL for live, note otherwise.
  7. **OS/arch** recorded (`process.platform`, `process.arch`, `os.release()`) into the state's `data` for B09 and the doctor; unsupported (32-bit) → WARN only.
- Remedies live in `lib/remedies.mjs` as `{ [checkId]: { darwin, win32, linux, default } }` so the launchers (S10/S11) copy the same sentences and ARC-08 reuses the table; a test asserts every check id has an entry.
- Every check runs even after a failure (the user fixes everything in one pass); the summary lists all failures.

**Acceptance criteria.**

1. On the reference macOS machine, B00 prints seven `ok` lines (login line `ok` or `not verified`) in < 3 s and the state records `node.version`.
2. From `clients/` inside the checkout, `../snowarch bootstrap` prints `FAIL B00: not at the repository root — run: cd "…/ai-servicenow-architect" && ./bootstrap.sh` and exits 3 without creating `.local/`.
3. With `PATH` stripped of `git`, the output contains `FAIL B00: git not found` and the macOS/Windows/Linux remedy for the running platform; exit 3.
4. With `HTTPS_PROXY=http://127.0.0.1:9` the network line prints `proxy 127.0.0.1:9 not reachable — check HTTPS_PROXY / NO_PROXY and re-run`; with a test TLS server presenting an untrusted certificate (fixture, `SNOWARCH_TEST_NET_URL` override) the line prints the `NODE_EXTRA_CA_CERTS` remedy; with `SNOWARCH_TEST_NET_URL=https://nonexistent.invalid/` the DNS remedy.
5. With Node absent and `--mode live`, the run ends at B00 with `FAIL B00: live mode needs Node.js 20+` and the platform remedy; with `--mode design` the same machine passes B00 with the `note:` line.
6. On a runner without Claude Code, `--skip-claude-check` yields `WARN` and exit 0 for B00; without the flag, `FAIL … Claude Code not found` exit 3.
7. Lowering `engine.config.json.floors.git` to `2.0.0` in a test copy changes the threshold (proves the floors are read, not hard-coded).

**Tasks.**

1. Implement version parsers (git, claude, node, npm) with fixture strings from the three OSes (Apple Git, Git for Windows `git version 2.47.0.windows.1`, Ubuntu).
2. Implement `probe-net.mjs` with the proxy CONNECT path and error classification; fixture servers for the tests.
3. Implement `B00.mjs`, `remedies.mjs`; wire `--skip-claude-check`.
4. Tests for each check with injected command runners (no real binaries in unit tests).
5. Copy the exact remedy sentences into a shared fixture file `tools/snowarch/lib/remedies.json` consumed by S10/S11's parity test.

**Test strategy.** Unit tests with injected runners on three OSes; network fixtures (local HTTPS server with a self-signed cert; unreachable proxy port). Manual: criterion 2 and 5 on macOS; criterion 3 on Windows (PATH edit in a cmd session).

**Dependencies.** S03. ARC-03 S05's failure strings (shared vocabulary; this story copies them, ARC-03 owns them).

**Size.** M — seven checks, but the proxy-aware probe and the fixtures are a day on their own.

**Risks / open points.** `claude auth status` may not exist on the floor version (hence "not verified", never FAIL). Windows `fs.statfs` is available on Node ≥ 20 (used only on the Node path; the launchers use `Get-PSDrive`/`df -Pk`). `NODE_EXTRA_CA_CERTS` is read by Node at process start — the remedy tells the user to export it in the shell, not to pass it to the CLI.

**Definition of done.** Merged; tests green; remedies table exported for S10/S11/ARC-08; `docs/TROUBLESHOOTING.md` (ARC-05 generator) gains a hand-maintained "Before the doctor exists: B00 failures" section with the same strings.

---

### ARC-06-S05 — B01 workspace and B07 `settings.local.json` toggles (merge, never overwrite); cloud-sync WARN; `.local/config.json`

**As** an individual practitioner **I want** the bootstrap to create the per-checkout workspace and write only the two Claude Code toggles that make my next `claude` start clean — merging into my own `settings.local.json`, never replacing it — **so that** design-only shows no MCP prompt at all, live shows at most one, and my personal local settings survive.

**Context.** `01` §4.2 B01/B07, §5 (`enabledMcpjsonServers` is exactly what Claude Code writes on approval; `disabledMcpjsonServers` rejects and wins), §9 (design-only via `disabledMcpjsonServers`), `03` S-01 (file must stay untracked) and S-05 (`disableAllHooks: true` when Node is absent, with its side effect on personal/plugin hooks — or the hook-in-local-file alternative). D-04 (cloud-sync WARN obligation — the checkout's own location is decided here, before any store exists). README acceptance: "`/mcp` shows `servicenow` as disabled for this project (not failed)"; "`git status` … shows no tracked file modified". ARC-08 `--fix` "missing settings.local toggles → rewrite for the recorded mode" reuses this writer.

**Scope.** In: `lib/steps/B01.mjs`, `lib/steps/B07.mjs`, `lib/settings-local.mjs` (`applyToggles({ root, mode, nodePresent, s05Branch, registration })` — idempotent, exported for ARC-08 and S12), `.local/config.json` v1, the cloud-sync detector (`lib/cloud-sync.mjs`, exported for ARC-07/ARC-08). Out: the store (`.local/instances.json`, ARC-04/ARC-07); the bash/PowerShell writers (S10/S11 — restricted cases, see below); the hook script body (ARC-08).

**Design notes.**

- **B01** — `mkdirSync('.local', { mode: 0o700 })` (existing dir: `chmod 0700` on POSIX, note on Windows), `.local/logs/`; write the state file (S03) with `writer: "node"`; verify the registration files: `git diff --quiet HEAD -- .mcp.json .claude/settings.json` (working tree equals commit) **and** S01's placeholder rules re-evaluated at run time (a user may have edited the file before running). Failure: `FAIL B01: .mcp.json differs from the committed version — run: git checkout -- .mcp.json   (never edit this file; per-machine values belong in .claude/settings.local.json)`. Cloud-sync detection: the absolute root path contains a segment matching `/^OneDrive/i`, `/^Dropbox$/`, `Mobile Documents/com~apple~CloudDocs`, `/^iCloud Drive$/`, `/^Google ?Drive/i` or the `GoogleDrive` FUSE mount prefix → `WARN B01: this checkout is inside a cloud-synced folder (<name>) — .local/instances.json will be synced even at mode 0600; prefer a local path such as ~/work/ (D-04)`. WARN, not FAIL (the user may accept it); recorded in the state `data` so B09 repeats it.
- **`.local/config.json`** v1: `{ "version": 1, "mode": "design-only"|"live", "defaultInstance": null|"<label>", "registration": "project"|"local"|"user", "updatedAt": "…" }` — written by B07 (mode/registration). `defaultInstance` is a **mirror, never a second source**: B07 reads the label through ARC-04 S02's store module (`readDefaultLabel(storePath)` — label only, no secrets) and copies it; the store's `defaultInstance` is authoritative and ARC-07 S06 `set-default` re-mirrors it (open point raised by ARC-07 S05, resolved here). Labels are not secrets; URLs and usernames never go here (they are in the store).
- **B07 toggle writer** (`lib/settings-local.mjs`):
  1. Read `.claude/settings.local.json` if present. Invalid JSON → `FAIL B07: .claude/settings.local.json is not valid JSON — fix or move the file, then re-run (nothing was changed)`; exit 1. This is the only failure mode; the file is never overwritten wholesale.
  2. Compute the target: live → `enabledMcpjsonServers` contains `servicenow` and `disabledMcpjsonServers` does not; design-only → the reverse. Other array members are preserved; other keys untouched; key order preserved for existing keys, new keys appended. When `registration` ≠ `project` (S12 `--register local|user`): write `disabledMcpjsonServers: ["servicenow"]` (the project entry is rejected; the local/user entry carries the same key) — see S12 for the verification of that coexistence.
  3. **Node absent** (design-only only): per the S-05 verdict — branch A (`disableAllHooks`): add `"disableAllHooks": true` and print `note: Node.js not found — hooks disabled for this project (.claude/settings.local.json disableAllHooks) so the Mode banner does not error; this also silences your personal and plugin hooks here until Node is installed and ./snowarch mode design is re-run`; branch B (hook-in-local): the committed `settings.json` is hook-free (S01) and B07 writes the SessionStart hook object into `settings.local.json.hooks` **only when Node ≥ 20 is present**, removing it otherwise. Exactly one branch is compiled in; the other is deleted after ADR-0006's sibling record for S-05 is final.
  4. Write atomically (temp + rename), 2-space indent, trailing newline; `git check-ignore -q` must succeed before writing (else `FAIL B07: .claude/settings.local.json is not gitignored — add it to .gitignore (it must stay untracked so Claude Code applies its approvals)`).
  5. Idempotent: running twice yields a byte-identical file; ARC-08's `--fix` calls the same function.
- Windows: no `chmod`; `.local/` inherits the user-profile ACL; the note `file modes: ACL-inherited` goes into the state.
- Nothing here touches `~/.claude.json`, `~/.claude/settings.json` or any file outside the checkout.

**Acceptance criteria.**

1. After `./snowarch bootstrap --mode design --yes` on a fresh clone, `stat -f %Lp .local` prints `700` (macOS) / `stat -c %a` prints `700` (Linux); `.claude/settings.local.json` deep-equals `{"disabledMcpjsonServers":["servicenow"]}` (plus `disableAllHooks: true` only when Node was absent and branch A applies); `git status --porcelain` prints nothing.
2. Given a pre-existing `.claude/settings.local.json` `{"permissions":{"allow":["Bash(ls*)"]},"enabledMcpjsonServers":["other"]}` and a design-only run, the result is `{"permissions":{"allow":["Bash(ls*)"]},"enabledMcpjsonServers":["other"],"disabledMcpjsonServers":["servicenow"]}`; a subsequent live run yields `enabledMcpjsonServers: ["other","servicenow"]` and no `disabledMcpjsonServers` member `servicenow`.
3. Given `.claude/settings.local.json` containing `{ not json`, B07 fails with the exact sentence in step 1, exit 1, and the file's bytes are unchanged.
4. Given `.mcp.json` with one byte changed, B01 fails with the `git checkout -- .mcp.json` remedy and `.local/` is still created (state records `B01: failed`).
5. On a checkout at `~/Library/Mobile Documents/com~apple~CloudDocs/x` (macOS) or `%USERPROFILE%\OneDrive\x` (Windows), B01 prints the cloud-sync WARN naming `iCloud Drive` / `OneDrive`; on `~/work/x` it does not.
6. In a trusted checkout after a design-only run, `claude mcp get servicenow` prints the `✘ Rejected (see disabledMcpjsonServers in settings)` status and `/mcp` lists the server as disabled with no prompt (S-01 design case); after a live run, `/mcp` shows `servicenow ✔ connected` after exactly the S-01 dialog count.
7. Running B07 twice produces byte-identical `settings.local.json` and `config.json` (except `updatedAt`).

**Tasks.**

1. Implement `cloud-sync.mjs` with a fixture table of paths per OS.
2. Implement `B01.mjs` (dir modes, state, registration-file verification reusing S01's rule module).
3. Implement `settings-local.mjs` (read/merge/write, gitignore check, S-05 branch) and `B07.mjs`; `config.json` writer.
4. Unit tests: merge cases, invalid JSON, idempotence, branch A/B, Windows path (no chmod).
5. Manual S-01 confirmation with the real files (criterion 6) on macOS and Windows; record in the PR.

**Test strategy.** Unit on three OSes; criterion 6 manual (Claude Code TTY) once per OS before merge, repeated by ARC-08 S11 CI where possible (`claude mcp get` is scriptable; `/mcp` is not).

**Dependencies.** S03; ARC-00 S-01 and S-05 verdicts (which branch to compile). Provides `applyToggles()` to S12 and ARC-08 S06.

**Size.** M — the merge logic is small; the S-05 branch and the manual Claude Code verification make it two days.

**Risks / open points.** Branch A's side effect (personal/plugin hooks silenced) is accepted by `03` S-05 and printed; it is undone by `./snowarch mode design` once Node is present (S12 removes the key). If S-01 fails (approval prompt still shown), nothing changes here — S09's text already budgets the click.

**Definition of done.** Merged; tests green; `docs/INSTALL.md` (S13) "What the bootstrap writes" table lists exactly these files; ARC-08 S06 imports `applyToggles()`.

---

### ARC-06-S06 — B02 docs step calling the ARC-03 recipe; `--docs sparse|full|skip`; launcher recipe parity

**As** an individual practitioner **I want** the bootstrap to obtain the pinned, sparse ServiceNowDocs corpus as one numbered step, honour `--docs full|skip`, and verify the citations when Node is present **so that** design-only grounding works offline immediately after the install and the doctor never reports "SKIP" for the product's core promise.

**Context.** `01` §4.2 B02, §10 (sparse submodule, generated areas file, `--docs full` / `--docs skip` with a doctor FAIL), P-11 (corpus cost; citation gate exits 0 when the corpus is missing). ARC-03 S05 owns the recipe (`syncDocs()`, `--print-recipe`), S06 owns `docsStatus()`, S10 the attribution line; ARC-03's README notes it must not sit on ARC-06's critical path — the recipe block is published as soon as ARC-03 S05 merges.

**Scope.** In: `lib/steps/B02.mjs` (calls `syncDocs({ mode, root, config })` from `tools/snowarch/lib/docs/checkout.mjs`, then `verify` from `lib/docs/verify.mjs`); the `--docs` flag semantics and their record in the state (`docs.mode`, `docs.pin`); the embedded git-only recipe functions in `bootstrap.sh` / `bootstrap.ps1` (text supplied here, files in S10/S11) and `tests/docs-recipe-parity.test.mjs` comparing them with `./snowarch docs sync --print-recipe --mode sparse|full`. Out: the recipe itself and its error mapping (ARC-03 S05); `docs status` presentation (ARC-03 S06 / ARC-08).

**Design notes.**

- `--docs sparse` (default) → `syncDocs({ mode: 'sparse' })`; `--docs full` → `{ mode: 'full' }`; `--docs skip` → no network call, the state records `docs: { mode: "skip", pin }` and the step prints `[B02/09] docs … skipped (--docs skip) — the doctor will report the corpus as FAIL until you run ./snowarch docs sync`. The plan screen (S03) line 2 shows the same three values.
- After `syncDocs()`, when Node is present (always true on this code path): `verify({ root })` → `citations: checked: 163 | dead: 0`; any dead citation → `WARN B02: <n> dead citation(s) — see ./snowarch docs verify` (WARN: the corpus is present; the maintainer, not the user, fixes citations; the doctor reports it). Missing corpus after a "successful" sync is impossible by ARC-03's contract; if it happens → FAIL with `run ./snowarch docs sync`.
- The step's duration and size line come from ARC-03's output (`[docs] 34,352 files · 231 MB working tree`); B02 prints the attribution line ARC-03 S10 defines (once).
- Inputs hash (S03): `vendor/docs-areas.txt`, gitlink, docs mode — so ARC-09's upgrade re-runs B02 only when the areas or the pin moved.
- **Launcher recipe.** `bootstrap.sh` and `bootstrap.ps1` embed the recipe lines as a function each (`docs_recipe_sparse` / `docs_recipe_full`), verbatim from `--print-recipe`; the Node-free path then checks only that every line of `vendor/docs-areas.txt` exists as `vendor/ServiceNowDocs/markdown/<area>/` and prints `citations: not verified until Node 20+ is installed` (`01` §4.2). `tests/docs-recipe-parity.test.mjs` extracts the function bodies (between `# recipe-begin sparse` / `# recipe-end` markers; PowerShell uses `# recipe-begin` comments too) and diffs them against `--print-recipe` output line by line — the same technique ARC-03 S11 uses for `docs/ARCHITECTURE.md`. Windows: the recipe already injects `-c core.longpaths=true` (ARC-03 S05); the PowerShell launcher runs the lines unchanged.
- Failure strings are ARC-03's (`cannot reach github.com (DNS) …`, `TLS interception detected …`, `pin … not fetchable …`, `insufficient disk space …`); B02 re-prints them under `FAIL B02:` with `Re-run ./bootstrap.sh to resume at B02.`

**Acceptance criteria.**

1. On a fresh clone with Node 22, B02 completes with `[B02/09] docs … ok (<t> s)` followed by the size line, the attribution line and `citations: checked: <n ≥ 160> | dead: 0`; `git submodule status` shows the pin without `-`/`+`; `du -sm vendor/ServiceNowDocs` ≤ 350.
2. `--docs full` yields every `markdown/*` directory of the pin (55 at `ba513f2`) and the state records `docs.mode = "full"`.
3. `--docs skip` performs no network access (asserted with `HTTPS_PROXY=http://127.0.0.1:9` — the run still succeeds), prints the `skipped (--docs skip)` line with the doctor sentence, and the state records `docs.mode = "skip"`; `./snowarch docs status` then exits 3 with `docs corpus: MISSING`.
4. A second run prints `[B02/09] docs … ok (cached)`; after `git -C vendor/ServiceNowDocs checkout HEAD~1` (fixture corpus), the gitlink input is unchanged but ARC-03's reconcile restores the pin when the step is forced with `--from B02`.
5. `node --test tests/docs-recipe-parity.test.mjs` passes; changing one recipe line in `bootstrap.sh` fails it with a unified diff naming the launcher and the line.
6. With Node absent (S10 path), B02 prints `citations: not verified until Node 20+ is installed` and `areas: 19/19 present`; a deliberately deleted area directory yields `FAIL B02: area it-service-management missing — run ./snowarch docs sync once Node is installed, or re-run ./bootstrap.sh`.

**Tasks.**

1. Implement `B02.mjs` over `syncDocs()` / `verify()`; map `--docs`.
2. Write the recipe functions into the launcher templates (handed to S10/S11) with the begin/end markers.
3. Write the parity test.
4. Fixture-corpus tests (reuse ARC-03's local bare-repo fixture via `SNOWARCH_DOCS_UPSTREAM`).

**Test strategy.** Fixture upstream in unit/integration tests on three OSes (fast); real corpus once in the S14 CI job (size and time recorded in the job summary) and weekly in ARC-03's `docs-real.yml`.

**Dependencies.** S03; ARC-03 S05 (`syncDocs`, `--print-recipe`), S06 (`docsStatus()`), S10 (attribution line). Blocks S10/S11's recipe functions.

**Size.** M — glue plus the parity test; the fixture reuse keeps it under two days.

**Risks / open points.** If ARC-03 S05 is late, S10/S11 embed the S-07 verdict's recipe directly and the parity test is added when `--print-recipe` lands (recorded as a follow-up in the PR). Recipe drift between launcher and Node path is exactly what the parity test prevents.

**Definition of done.** Merged; parity test green; `docs/INSTALL.md` (S13) quotes ARC-03's size/time sentence, not a number from this story.

---

### ARC-06-S07 — B03 mode line of the plan; B04 `npm ci`; B05 contract sha check; the B06 wizard slot; `--instance-file` non-interactive live bootstrap

**As** an individual practitioner **I want** choosing `live` to install the server's runtime dependencies, prove the checkout's contract is consistent, and hand me to the instance wizard in my own terminal — and **as** an operator or CI **I want** the same live bootstrap to run without a keyboard from a 0600 instance file — **so that** live mode is one uninterrupted run and secrets never pass through argv, a transcript or a shared config file.

**Context.** `01` §4.2 B03–B06, §4.2 "Non-interactive forms" (`--mode live --yes --instance-file <path>`), §11 (contract sha pinned by the engine), §6.2 (wizard entry points — "automatically as bootstrap step B06"), §7 (`--password-stdin`-class automation only). D-04 (one store, 0600, never in argv), D-05 (prod capped at `read-only`; `prodWriteAck`), Q-A (individual practitioner: one instance is the normal case). P-01/P-34 (credentials in `~/.claude.json` and argv — `engine:scripts/setup.sh:883-915` builds `claude mcp add … -e <12 variables>`), P-03 (absent flags). S-15 (root `npm ci --omit=dev --ignore-scripts` footprint and hoisting). ARC-07-S05 depends on this story's B06 slot; ARC-05 S01 provides `contractSha256`.

**Scope.** In: `lib/steps/B03.mjs` (records the plan's mode answer; no second prompt), `B04.mjs`, `B05.mjs`, `B06.mjs` (the slot: interface, interactive dispatch, `--instance-file` path), `lib/instance-file.mjs` (read/validate/hand over), the B04 npm failure mapping (R-3), `docs/INSTALL.md` "Operators and CI" section text (file in S13). Out: the wizard UX, masked input, probes' bodies, preset review screen, `addInstance()` (ARC-07 S01–S05); the store module, schema, presets, prod rule (ARC-04 S02/S03 — imported here); the server doctor (ARC-08).

**Design notes.**

- **B03** — no prompt of its own: the plan screen (S03) already collected the mode; B03 writes `mode` into the state and `.local/config.json`, prints `[B03/09] mode … live` and, on a re-run that changes the mode, invalidates B06/B07/B08 by construction (their inputs include the mode). With `--mode` the plan line is pre-filled; with `--yes` accepted.
- **B04 deps** (live only): `npm ci --omit=dev --ignore-scripts --no-audit --no-fund` at the root (or `--workspace packages/snowarch` if the S-15 verdict chose that fallback), `NODE_ENV=production`, stdout/stderr to the file log, a spinner-free progress line `[B04/09] deps … installing (npm ci, ~72 MB)` then `ok (41 s)`. Post-check: for every key of `packages/snowarch/package.json.dependencies`, `createRequire(root + '/packages/snowarch/dist/server.js').resolve(name + '/package.json')` succeeds (proves resolution from the entry's location, hoisting-safe, no dependency names hard-coded). Failure mapping (exact strings): npm log contains `ENOTFOUND`/`EAI_AGAIN` → `cannot reach registry.npmjs.org (DNS) — check your network or proxy (npm config set https-proxy <url>, or HTTPS_PROXY) and re-run`; `UNABLE_TO_GET_ISSUER_CERT_LOCALLY`/`SELF_SIGNED_CERT_IN_CHAIN` → `TLS interception detected — export NODE_EXTRA_CA_CERTS=<corporate CA .pem> (npm honours it) and re-run`; `EINTEGRITY` → `lockfile integrity mismatch — this checkout is inconsistent; run: git status && git checkout -- package-lock.json, then re-run`; `EACCES` → `permission denied under node_modules — remove it (rm -rf node_modules) and re-run; never use sudo`; any other → the last 20 log lines and the log path. The state records `data: { npmVersion, durationMs, sizeBytes }` (size from a directory walk, for B09).
- **B05 contract** (whenever Node is present, both modes): `sha256(packages/snowarch/dist/contract.json)` must equal `packages/contract/required-tools.json.contractSha256`; every `required-tools[].name` must appear in `contract.tools[].name`; `contract.server.suggestedName` must equal `engine.config.json.mcp.serverKey`. Failure: `FAIL B05: contract mismatch — dist/contract.json sha256 <12> ≠ pinned <12>. This checkout is inconsistent (partial pull or a maintainer forgot to regenerate). Run: git status; git checkout -- packages/snowarch/dist packages/contract; if it persists, report it — do not continue.` The step is ~30 lines; ARC-05's CI job proves the same on every commit, B05 proves it on the user's machine.
- **B06 slot interface** (`lib/steps/B06.mjs`; the contract ARC-07 S05 implements — its `addInstance()` signature is handed to this story by ARC-07 S05 task 7):
  ```js
  // Interactive path — spawn, never import (keeps the TTY for ARC-07 S01 raw-mode input):
  //   spawnSync(process.execPath, [root + '/packages/snowarch/dist/cli/index.js', 'instance', 'add', '--from-bootstrap'], { stdio: 'inherit', cwd: root })
  //   exit 0 → the wizard printed its own secret-free summary; B06 then reads label/environment/preset through ARC-04 S02's store module (never url/username/secret).
  // Non-interactive path — import from the server package's CLI module (ARC-07 S05):
  //   addInstance({ label, url, environment, auth: { method, username, password, clientId?, clientSecret? }, preset | flags, makeDefault, global: false, yes: true }, io)
  //     → { saved: boolean, entry /* masked */, lastProbe, exitCode }   — called once per instance in the file
  ```
  B06 dispatches: interactive when stdin is a TTY and no `--instance-file`; `--instance-file` otherwise; TTY absent and no file → `FAIL B06: no terminal for the instance wizard — run ./snowarch instance add in an interactive terminal, or pass --instance-file <path> (see docs/INSTALL.md "Operators and CI")`. `dist/cli/index.js` exists only after B04, so the spawn/import is lazy. Until ARC-07 S05 lands, `instance add` is absent from the built CLI and B06 fails with `instance wizard not available in this build — run ./bootstrap.sh again after upgrading`; the `--instance-file` path meanwhile writes through ARC-04 S02's store module directly, using ARC-04's probe interface for the auth probe only and recording the other probes as `not probed` — so this ARC is mergeable and end-to-end testable with `--instance-file` before ARC-07. The slot never prints anything the wizard returns beyond the summary line `Saved instance "pdi" (pdi · basic · preset full · default). Probes: auth ok · write ok · scripting ok · cmdb ok · atf ok · nowAssist off · fluent off`. If a store already exists with ≥ 1 instance, B06 proposes `keep existing instance(s) [Enter] / add another [a]` (principle 10) instead of re-running the wizard; `--yes` keeps. The default label is mirrored into `.local/config.json.defaultInstance` by B07 from the store (S05).
- **`--instance-file <path>`** (`lib/instance-file.mjs`): the file is a **store schema v1 document** (`01` §7 — `{ version: 1, defaultInstance, instances: { <label>: { url, environment, auth, preset | flags, … } } }`), so `cp` from another checkout's `.local/instances.json` works. Rules: POSIX mode must be 0600 or stricter (else `FAIL B06: <path> is group/world-readable — run: chmod 600 <path>`; Windows: skipped with the ACL note); the path must not be inside the checkout's tracked tree (`git check-ignore -q` or outside the root; else `FAIL B06: refuse to read an instance file that git could commit — move it to .local/ or outside the checkout`); the document is validated by ARC-04's store module (`validateStore`), each secret value is `redact.register()`ed before any logging; `environment: prod` with a preset other than `read-only` and `prodWriteAck !== true` → `FAIL B06: PROD_WRITE_NOT_ACKNOWLEDGED — instance "<label>" is prod with preset <p>; set "prodWriteAck": true in the file only if you really mean it (D-05)`; a missing `preset` and `flags` → D-05 proposal applied and printed (`full` for pdi/dev/test, `read-only` for prod) — with `--yes` this is the accepted proposal; a missing `environment` → if `url` matches `^https://dev\d+\.service-now\.com$` the D-05 proposal `pdi` is applied and printed (`environment: pdi (proposed from the URL — D-05; accepted: --yes)`), otherwise FAIL (`environment is required: pdi|dev|test|prod — it is never guessed for a non-dev\d+ host`). Then `addInstance()` (ARC-07 S05; before it lands, the ARC-04 store module + auth probe as described above) runs the auth probe for each instance (401 → `FAIL B06: AUTHENTICATION_FAILED for "<label>" — nothing saved` without any retry loop, this path is non-interactive), the per-preset probes, and writes `.local/instances.json` atomically (0600). The source file is never copied, moved or deleted; B06 prints `note: <path> still holds your credentials — delete it when you no longer need it`. Flags: every saved entry carries all six flags as byte-exact strings (ARC-04 preset expansion), `toolPackage: "full"`, `maxRecords: 100`.
- `--yes` with an instance file accepts the file's values and the D-05 proposals; nothing else is asked. Without `--yes` but with `--instance-file`, the plan screen is still shown (installation), and B06 shows the parsed labels/environments/presets (never url/username) with `Enter = save as shown · q = abort`.

**Acceptance criteria.**

1. `./snowarch bootstrap --mode live` (TTY, Node 22, ARC-07 S05 present) runs B04 (`ok (<t> s)`), B05 `ok`, then the wizard appears without any further bootstrap prompt (`ps -o args` shows `node …/dist/cli/index.js instance add --from-bootstrap` as a child of the bootstrap); after the wizard's `Saved instance …` line the run continues to B07 without a keypress.
2. `du -sm node_modules` after B04 ≤ 80 MB (S-15); `ls node_modules/.bin` contains no `tsc`/`vitest` (dev deps omitted); `npm ls --omit=dev --depth 0` exits 0.
3. With `packages/snowarch/dist/contract.json` altered by one byte, B05 prints the mismatch sentence with both 12-char prefixes and exits 1; B04's cache is unaffected (`ok (cached)` on the next run after `git checkout`).
4. With `HTTPS_PROXY=http://127.0.0.1:9` and an empty npm cache, B04 prints the registry proxy remedy; with a fixture CA-intercepting proxy it prints the `NODE_EXTRA_CA_CERTS` remedy.
5. `./snowarch bootstrap --mode live --yes --instance-file /tmp/pdi.json` with a 0600 file describing a PDI (`environment: pdi`, no preset) prints `preset: full (proposed for pdi — D-05; accepted: --yes)`, saves the store with six string flags, exits 0; `ps -ef` sampled during the run and `~/.zsh_history` contain no secret; `.local/logs/bootstrap-*.log` greps clean for the fixture password. The same file without `environment` but with `url: https://dev123456.service-now.com` prints `environment: pdi (proposed from the URL — D-05; accepted: --yes)` and saves; without `environment` and with `url: https://acme.service-now.com` it fails B06 with the `environment is required` sentence and saves nothing.
6. The same with `chmod 644 /tmp/pdi.json` fails before reading the file with the `chmod 600` remedy; with the file placed at `<checkout>/pdi.json` (not ignored) it fails with the "git could commit" sentence.
7. An instance file with `environment: prod, preset: full` and no `prodWriteAck` fails with `PROD_WRITE_NOT_ACKNOWLEDGED`; with `prodWriteAck: true` it saves and the server (ARC-04) loads it.
8. An instance file with a wrong password fails B06 with `AUTHENTICATION_FAILED for "pdi" — nothing saved`, exactly one authentication attempt is made (fixture REST server counts requests), and `.local/instances.json` does not exist.
9. In CI (no TTY, no `--instance-file`), `--mode live --yes` is refused at parse time (S03 criterion 7); `--mode live` without `--yes` and no TTY fails B06 with the "no terminal" sentence after B04/B05 ran.

**Tasks.**

1. `B03.mjs` (state/config write), `B04.mjs` (npm runner, resolution check, failure mapping, size), `B05.mjs`.
2. Define and document the slot interface in `docs/ARCHITECTURE.md` ("B06 slot"); implement `B06.mjs` with the stub interactive path and the `--instance-file` path.
3. `instance-file.mjs`: mode check, tracked-tree check, validation via ARC-04's store module, D-05 rules, redaction registration.
4. Fixture REST server (`tools/snowarch/tests/fixtures/sn-stub.mjs`: `/api/now/table/sys_user` 200/401/403 by credential) for B06 tests; npm failure-mapping tests with captured npm logs.
5. Write the "Operators and CI" section text (instance-file schema example with placeholder values, 0600, deletion advice) for S13.

**Test strategy.** Unit: B05 hashing, instance-file validation, D-05 rules, npm log mapping (fixtures). Integration on three OSes: B04 against the real registry (CI has it), B06 `--instance-file` against the stub REST server on 127.0.0.1. Live E2E against a PDI behind `RUN_LIVE_E2E=1` (criteria 5, 7 second half, 8) — shared with ARC-07 S11.

**Dependencies.** S03, S05; ARC-04 S02 (store module: validate/write/0600, `readDefaultLabel`), S03 (presets, prod rule), S13 (committed `dist/`); ARC-05 S01 (`contractSha256`, `required-tools.json`); ARC-00 S-15 verdict (`npm ci` form). ARC-07 S05 provides `instance add --from-bootstrap` (interactive path) and `addInstance()` (file path); ARC-07 S03 provides the per-flag probes used by the file path (until then B06's file path uses ARC-04's auth probe only and reports the others as `not probed`).

**Size.** L — four small steps plus a validated operator path with its own fixture server and security rules; 4–5 days. Not split because the slot contract and its two inputs must be designed together.

**Risks / open points.** S-15 may force `--workspace`; B04 has one place to change. The interface may need a field ARC-07 discovers (e.g. `oauth_ropc` probe result) — additive only. `--instance-file` on Windows cannot check 0600; the doc says so (ACL-inherited) and recommends deleting the file after use.

**Definition of done.** Merged; unit/integration green; live E2E run recorded; `docs/ARCHITECTURE.md` "B06 slot" section; `docs/INSTALL.md` "Operators and CI" text delivered to S13; ARC-07 S05 references the interface verbatim (`--from-bootstrap` and the `addInstance()` signature).

---

### ARC-06-S08 — B08 MCP stdio handshake and live-probe invocation; `.local/doctor-last.json` v1

**As** an individual practitioner **I want** the bootstrap to start the real server exactly as Claude Code will, complete the MCP handshake, compare the advertised tools with the contract and probe my instance **so that** the first `claude` session cannot fail on something the bootstrap could have caught, and the session banner has a fresh verdict to print.

**Context.** `01` §4.2 B08, §8 (server checks: "MCP stdio handshake (`initialize` + `tools/list`) against the real `dist/server.js`, compared with the contract; `snow_core_capabilities_read` output equals the store"; SessionStart banner reads `.local/doctor-last.json`), §9 (unconfigured server advertises five core tools). P-17 (the reference install fails its own doctor — the new installer must produce a passing verdict on first run). S-17 (unconfigured server accepted as connected), S-06 (cold start vs `MCP_TIMEOUT`). ARC-08-S05/S08 depend on this story for the cache file; ARC-08 S04 builds the server doctor module that later supersedes the probe half.

**Scope.** In: `lib/mcp-handshake.mjs` (JSON-RPC over stdio, stdlib only; exported for ARC-08 S04 and the doctor), `lib/steps/B08.mjs`, `.local/doctor-last.json` v1 writer (`lib/doctor-cache.mjs`), the probe invocation through `packages/snowarch/dist/cli/index.js instance list --json` (labels) followed by `instance test <label> --json` per label (ARC-07 S06) with a graceful "not available" path. Out: check ids, severities, the merged report, `--fix` (ARC-08); the probes' bodies (ARC-07); the banner script (ARC-08 S08 — this story only writes what it reads).

**Design notes.**

- **Spawn exactly like Claude Code**: read `.mcp.json`, expand `${VAR:-default}` with the same rule Claude Code documents (`00` §9; `CLAUDE_PROJECT_DIR` = root), spawn `node <resolved args>` with `cwd = root` and `env = process.env + expanded env`; `stdio: ['pipe','pipe','pipe']`; stderr captured to the file log (redacted). Timeout for `initialize` = `MCP_TIMEOUT` from `.claude/settings.json.env` (S-06 value) — so a cold start that would fail under Claude Code fails here first, with `FAIL B08: server did not answer initialize within <ms> ms — cold start too slow for MCP_TIMEOUT; see docs/TROUBLESHOOTING.md "MCP_TIMEOUT"`.
- **Protocol** (newline-delimited JSON-RPC 2.0 as the MCP stdio transport specifies): `initialize` `{ protocolVersion: <the version the server package declares>, capabilities: {}, clientInfo: { name: "snowarch-bootstrap", version } }` → check `result.serverInfo.name`; `notifications/initialized`; `tools/list` with cursor pagination until `nextCursor` is absent; in live mode `tools/call snow_core_capabilities_read {}`; then close stdin and wait ≤ 5 s for exit (else `SIGTERM`). One retry on `EPIPE` at spawn (npm just wrote `node_modules`; Windows AV scanners can delay the first read).
- **Comparison**: `names(tools/list)` ⊆ `contract.tools[].name` (unknown tool → FAIL `server advertises "<name>" which is not in the pinned contract — dist/ and contract out of sync`); every `required-tools[].name` ∈ advertised (missing → FAIL naming it and its `used_by`); with a configured instance the count equals `contract.tools.length` (ARC-04: gated tools remain advertised, evaluated at call time), unconfigured → exactly the five core tools (S-17). `snow_core_capabilities_read` result must equal the store's entry for the default instance (label, environment, preset, six flags, `toolPackage`, `maxRecords`; the tool masks the store path and never returns secrets — ARC-04 S04) → mismatch is FAIL `server sees a different store than the bootstrap wrote (<path masked>) — SNOW_STORE set in your shell?`.
- **Probes**: `node packages/snowarch/dist/cli/index.js instance list --json` (labels only — masked usernames are not read) then, per label, `instance test <label> --json` (ARC-07 S06; there is no `--all` on `test`) → per-instance `{ auth, write, scripting, cmdb, atf, nowAssist, fluent }` merged into the cache; if the sub-command is absent (ARC-07 S06 not yet merged) the cache records `probes: "unavailable"` and B08 prints `probes: not available in this build` (WARN, not FAIL). A probe `auth: fail` → FAIL `AUTHENTICATION_FAILED for "<label>" — run ./snowarch instance set-credentials <label>` (no retry). Role-missing on a flag the preset enables → WARN with `./snowarch instance set-preset <label> …` (the user reviewed those flags in the wizard; D-05 says a failing probe never flips a toggle).
- **`.local/doctor-last.json` v1** (0600; atomic):
  ```json
  { "version": 1, "at": "2026-09-04T10:03:12Z", "writer": "bootstrap",
    "engineVersion": "2.0.0", "contractSha": "…", "mode": "live",
    "instance": { "label": "pdi", "environment": "pdi", "preset": "full", "flags": {…}, "probes": {…} },
    "server": { "initializeMs": 1830, "toolCount": 398, "protocolVersion": "…" },
    "checks": [ { "id": "B08-handshake", "status": "ok", "detail": "398 tools, contract match" }, … ],
    "summary": { "ok": 5, "warn": 0, "fail": 0 } }
  ```
  Top-level keys `version`, `at`, `writer`, `mode`, `checks[]{id,status,detail,remedy?}`, `summary` are the compatibility contract ARC-08 S01 must keep (its schema adds; never renames). In design-only runs B08 is skipped and S09 writes a design-only cache (`mode: "design-only"`, `checks` from B01/B02/B05/B07) so the banner has something to read. `instance.label` is a label, not a secret; usernames/URLs never enter this file.
- Windows: identical (`node` is a real executable; no `.cmd` shim involved — `01` §5).

**Acceptance criteria.**

1. After B06 saved a PDI on the reference machine, B08 prints `[B08/09] verify … ok (<t> s) — <n> tools, contract match, capabilities = store, probes: auth ok · write ok · scripting ok · cmdb ok · atf ok · nowAssist <ok|no licence> · fluent <ok|sdk missing>` where `<n>` equals `jq '.tools | length' packages/snowarch/dist/contract.json` (398 at the time of `01` §6.2; the test compares, never hard-codes), and `.local/doctor-last.json` exists with `summary.fail = 0`.
2. With `.local/instances.json` removed and B08 forced (`--from B08`), the server starts unconfigured, advertises exactly five tools, and B08 reports `WARN B08: no instance configured — run ./snowarch instance add or /snowarch setup-instance`, exit 0 (S-17).
3. With `SNOW_STORE=/nonexistent` exported in the shell, B08 fails with the "different store" sentence naming `SNOW_STORE`.
4. With `MCP_TIMEOUT` set to `1` in a test copy of `.claude/settings.json`, B08 fails with the `initialize` timeout sentence (S-06 negative control); with the S-06 value it passes.
5. With `dist/contract.json` edited to drop one tool, B05 fails first; with `required-tools.json` edited to add a fictitious tool and the sha updated, B08 fails naming the tool and its `used_by`.
6. `grep -Ei "password|authorization|https://" .local/doctor-last.json .local/logs/*.log` prints nothing after a live run.
7. The handshake module, given a fixture server that answers `tools/list` in three pages, returns all names; given one that never answers, rejects after the timeout without a hung child (`ps` shows none).
8. On `windows-latest` (S14), B08 completes the handshake against the committed `dist/server.js` with no store (five tools).

**Tasks.**

1. Implement `mcp-handshake.mjs` (spawn, framing, pagination, timeouts, clean shutdown; fixture-tested).
2. Implement `B08.mjs` comparisons and the probe invocation with the "unavailable" path.
3. Implement `doctor-cache.mjs` v1 writer; document the compatibility keys in `docs/ARCHITECTURE.md`.
4. Tests: fixture MCP server (stub from ARC-00 S01, reused), timeout, pagination, comparison failures; live E2E behind `RUN_LIVE_E2E=1`.

**Test strategy.** Unit with the stub server on three OSes; integration with the real committed `dist/server.js` unconfigured (CI); live E2E on a PDI (manual + `RUN_LIVE_E2E=1`).

**Dependencies.** S07; ARC-04 S04 (unconfigured start, five core tools, `snow_core_capabilities_read`), S13 (committed `dist/`); ARC-05 S01; ARC-07 S06 (`instance list --json`, `instance test <label> --json`) for the probe half; ARC-00 S-06 value, S-17 verdict.

**Size.** M — the handshake is ~150 lines of framing and state; tests and the cache contract make it two days.

**Risks / open points.** The MCP protocol version string must match what the server package's SDK negotiates — read it from the package (`@modelcontextprotocol/sdk` constants) via the server's own `dist/` export rather than hard-coding. ARC-08 S04 will later call this module from inside the doctor; the probe invocation via a child `instance test` is an interim seam until ARC-08 merges the server doctor module.

**Definition of done.** Merged; tests green; `.local/doctor-last.json` v1 documented; ARC-08 S01 and S08 cite the compatibility keys; `docs/TROUBLESHOOTING.md` gains the `MCP_TIMEOUT` and "different store" entries.

---

### ARC-06-S09 — B09 summary: `DOCTOR:` line, authoritative `Mode:` line, next-step text with the dialog budget

**As** an individual practitioner **I want** the bootstrap to end with one verdict line, one Mode line and the exact next thing to type — including how many Claude Code dialogs to expect — **so that** I know the install is complete before I start `claude` and am never surprised by a prompt.

**Context.** `01` §4.2 B09 (`DOCTOR: 41 ok, 0 warn, 0 fail`; `Mode: design-only` / `Mode: live — instance=pdi (pdi) preset=…`; "Next: run `claude` here. You will see one workspace-trust dialog; answer Yes."), §2 principle 9 (two dialogs budgeted, never promised away), §4.3 (Path B: "Restart `claude` in this folder"), §8 (the same `Mode:` line is what the banner and `/snowarch status` quote). README acceptance: `Mode: design-only` reached with no Node; live summary shows `DOCTOR: … 0 fail` and `Mode: live — …`; README risk "S-01 fails → one approval click remains; the summary line already tells the user to expect it".

**Scope.** In: `lib/steps/B09.mjs`, `lib/text.mjs` (platform-specific command spellings; the S-01 constant `EXPECTED_DIALOGS`; the shared sentences S10/S11 print verbatim), the design-only `doctor-last.json` write (S08's writer), the `--json` `next` field. Out: the doctor's own summary (ARC-08 — B09 calls `./snowarch doctor --quick --json` when that sub-command exists and otherwise prints its own count from B01–B08 results).

**Design notes.**

- Output block (exact; `<…>` filled):
  ```
  DOCTOR: <ok> ok, <warn> warn, <fail> fail            ← from doctor --quick when available, else from this run's steps
  Mode: design-only                                    ← or: Mode: live — instance=pdi (pdi) preset=full
  Next: run `claude` here. You will see one workspace-trust dialog — answer Yes.
        (If you are already inside Claude Code in this folder: exit it and start `claude` again.)
        Add a live instance later with ./snowarch mode live, or /snowarch setup-instance inside Claude.
  ```
  Live variant lines 3–4: `Next: run \`claude\` here. You will see one workspace-trust dialog — answer Yes.` and, when `EXPECTED_DIALOGS === 2` (S-01 FAILED), `…and one approval for the "servicenow" MCP server — answer Yes.`; then `In Claude, /mcp should show: servicenow ✔ connected · /snowarch status quotes the Mode line above.` Node-absent variant line 1: `DOCTOR: unavailable until Node 20+ is installed (design-only is complete)`. Any WARN from B01 (cloud-sync) or B02 (dead citations) is repeated once under `Warnings:`.
- The `Mode:` line is **the** authoritative string: identical format in the banner (ARC-08 S08), `/snowarch status` (ARC-08 S09) and `snowarch mode` (S12); `lib/text.mjs` exports `modeLine({ mode, instance })` and all four call it.
- Platform spellings from `lib/text.mjs`: `./bootstrap.sh` / `./snowarch` on POSIX and Git Bash; `.\bootstrap.cmd` / `snowarch.cmd` when `process.platform === 'win32'` and the parent shell is not bash (`process.env.SHELL` unset and `MSYSTEM` unset).
- `--json`: `{ …, next: "<the Next block as one string>" }`.
- Design-only runs write `.local/doctor-last.json` here (S08 writer, `writer: "bootstrap"`, checks from B01/B02/B05/B07) so the first banner has a fresh cache.

**Acceptance criteria.**

1. After `./bootstrap.sh --mode design --yes` with Node 22, the last five lines are exactly the design-only block with `DOCTOR: <n> ok, 0 warn, 0 fail`; with Node absent, line 1 is the `unavailable until Node 20+` line.
2. After a live bootstrap, line 2 is `Mode: live — instance=pdi (pdi) preset=full` and line 3 mentions exactly `EXPECTED_DIALOGS` dialogs (one sentence per dialog); the S-01 ADR value and the printed count agree (test reads the constant).
3. `./snowarch bootstrap --json --mode design --yes | jq -r .next` prints the same block as the human run.
4. On Windows (cmd), the block spells `.\bootstrap.cmd` and `snowarch.cmd mode live`; in Git Bash on the same machine it spells `./bootstrap.sh` and `./snowarch mode live`.
5. The strings printed by S10/S11's launchers for the design-only block are byte-identical to `lib/text.mjs`'s (parity test over a `text.json` export, like S04's remedies).

**Tasks.**

1. `lib/text.mjs` with `modeLine()`, `nextBlock()`, `EXPECTED_DIALOGS` (value from ADR; the test asserts the ADR file quotes the same number), platform spellings; export `text.json` for launcher parity.
2. `B09.mjs`: doctor call when available, own count otherwise, warnings recap, cache write for design-only, `--json`.
3. Tests for every variant (mode × Node × platform × dialogs).

**Test strategy.** Unit snapshot tests on three OSes; manual read-through on macOS/Windows once.

**Dependencies.** S05, S08; ARC-00 S-01 verdict. ARC-08 S08/S09 import `modeLine()`.

**Size.** S — text and a few branches; ≤ ½ day once S08 exists.

**Risks / open points.** A wrong dialog count is the worst outcome of this story (a promise broken on first contact); hence the ADR-constant test.

**Definition of done.** Merged; snapshot tests green; `docs/INSTALL.md` "What you will see" quotes this block from the same source (S13).

---

### ARC-06-S10 — `bootstrap.sh` (bash 3.2-clean) with the Node-free design-only path

**As** an individual practitioner on macOS or Linux (or Git Bash) with Claude Code and git but **no Node.js** **I want** `./bootstrap.sh` to complete design-only mode in one run — and, when Node ≥ 20 is present, to hand over to the Node CLI without my noticing — **so that** the product's default end state needs nothing I do not already have.

**Context.** `01` §2 principle 6 ("Bash and PowerShell survive only as ~100-line launchers for the Node-free design-only path"), §4.2 ("Design-only without Node: the launcher performs B00 (git + claude only), B01, B02 (checkout and area-existence check only …), B07, B09 itself"), §13. README acceptance 1 ("A fresh user on a clean macOS machine with Claude Code and git but no Node runs `git clone … && cd … && ./bootstrap.sh --mode design` and reaches `Mode: design-only`"). Replaces `engine:scripts/setup.sh` (1,022 lines keyed on local scope, `00` §3.9) — bash 3.2 constraints are the same ones that file already honours (no `declare -A`, `mapfile`, `${var,,}`).

**Scope.** In: `bootstrap.sh` (target ≤ 180 lines including the embedded docs recipe), its flag subset (`--mode design|live`, `--docs sparse|full|skip`, `--yes`, `--reset`, `--help`; `--from`, `--instance-file`, `--json` accepted only to be forwarded to Node — on the Node-free path they print `needs Node.js 20+` exit 3), the Node hand-over, the Node-free B00/B01/B02/B07/B09, `tests/launcher-parity.test.mjs` (strings equal `remedies.json` / `text.json`; recipe parity from S06). Out: anything interactive beyond the two-line plan confirmation; any write outside `.local/`, `vendor/ServiceNowDocs`, `.claude/settings.local.json`.

**Design notes.**

- Header: `#!/usr/bin/env bash`; `set -u`; explicit error checks (no `set -e` — every failure prints a remedy); `ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"`; `[ "$(pwd -P)" = "$ROOT" ]` else the B00 root FAIL (`cd "<root>" && ./bootstrap.sh`) exit 3 (the Node CLI also checks; the launcher must, because it may never reach Node).
- **Hand-over**: `node_ok()` = `command -v node` and `node -p "process.versions.node.split('.')[0]"` ≥ `floors.node` major (read from `engine.config.json` with `sed -n 's/.*"node": *"\([0-9][0-9.]*\)".*/\1/p'` — the file is generated and single-line per key, which S14 asserts); when ok → `exec node "$ROOT/tools/snowarch/bin/snowarch.mjs" bootstrap "$@"` (all flags forwarded; nothing else happens in bash). When Node is absent or < 20: if `--mode live` → `FAIL B00: live mode needs Node.js 20+ — <remedy from remedies.json for darwin/linux>` exit 3; else the Node-free path.
- **Node-free path** (design-only only):
  - B00: git version parse (`git --version | sed …`) ≥ floor; `claude --version` ≥ floor (or `--skip-claude-check`); disk via `df -Pk "$ROOT" | awk 'NR==2{print $4}'` ≥ 1,048,576 KiB; network via `git ls-remote --exit-code -h "https://github.com/farstic/ai-servicenow-architect.git" HEAD >/dev/null` with `GIT_TERMINAL_PROMPT=0` and a 20 s `timeout`-less guard (git's own `http.lowSpeedLimit/Time` via `-c`), errors mapped with ARC-03 S05's strings (`Could not resolve host` → DNS line; `SSL certificate problem` → TLS line with `git config --global http.sslCAInfo`); Node absent → the `note:` line. Same sentences as S04 (`remedies.json`).
  - Plan (principle 10, two lines): `Plan: Mode design-only (fixed — Node.js 20+ not found) · Docs sparse (19 areas)` / `Enter = run · d = docs full · s = docs skip · q = quit` unless `--yes`.
  - B01: `mkdir -p "$ROOT/.local" && chmod 700 "$ROOT/.local"`; state file written with a heredoc (`writer: "bash"`, `mode: "design-only"`, `node.present: false`, `docs.mode`, step statuses as they complete — the file is rewritten after every step with the same JSON shape as S03, minimal but valid); `git diff --quiet HEAD -- .mcp.json .claude/settings.json` else the S05 remedy.
  - B02: run `docs_recipe_sparse` / `docs_recipe_full` (S06 embedded lines, marker comments), then the area-existence loop over `vendor/docs-areas.txt`, then `citations: not verified until Node 20+ is installed` and the attribution `echo` (the recipe's last line, ARC-03 S10). `--docs skip` → the S06 skipped sentence.
  - B07: `.claude/settings.local.json`: if absent → write `{"disabledMcpjsonServers":["servicenow"]}` (plus `"disableAllHooks":true` under S-05 branch A); if present and it already contains `"disabledMcpjsonServers"` with `"servicenow"` (grep) and, for branch A, `"disableAllHooks": true` → `ok (already set)`; otherwise → `FAIL B07: .claude/settings.local.json exists and cannot be merged without Node.js — add "disabledMcpjsonServers": ["servicenow"] to it by hand (see docs/INSTALL.md "Design-only without Node"), or install Node 20+ and re-run ./bootstrap.sh` exit 1 (the file is never overwritten; the case is rare — it means Claude Code or the user already wrote local settings before the first bootstrap). `.local/config.json` written with `mode: "design-only"`.
  - B09: the design-only block from `text.json` (`DOCTOR: unavailable until Node 20+ is installed (design-only is complete)`, `Mode: design-only`, the Next lines).
  - `--reset`: remove `.local/bootstrap-state.json` and `.local/doctor-last.json` only; print the "untouched" sentence.
- No `curl`, `jq`, `python`, `timeout`, `readarray`, associative arrays, `[[ =~ ]]` with captures, `${var,,}`; `sed`/`awk`/`grep` POSIX options only (BSD and GNU). Line endings LF (`.gitattributes`); executable bit committed.
- Git Bash on Windows: the same script runs; paths from `pwd -P` are POSIX-style, which git and the JSON consumers accept; `chmod` is a no-op there.

**Acceptance criteria.**

1. On a clean macOS 14 machine with Claude Code 2.1.214, git 2.39 and **no** Node, `git clone https://github.com/farstic/ai-servicenow-architect.git && cd ai-servicenow-architect && ./bootstrap.sh --mode design` shows the two-line plan, runs on Enter, prints `[B00/09] … ok`, `[B01/09] … ok`, `[B02/09] docs … ok (<t> s)` with `citations: not verified until Node 20+ is installed`, `[B07/09] toggles … ok`, and ends with the design-only block whose first line is `DOCTOR: unavailable until Node 20+ is installed (design-only is complete)`; then `claude` shows the trust dialog only, `/snowarch status` reports `Mode: design-only` (from the state file), and `/mcp` shows `servicenow` disabled, not failed.
2. On the same machine `bash --version` is 3.2 and `bash -n bootstrap.sh` plus a run under `bash -o posix` succeed; `shellcheck -s bash bootstrap.sh` reports nothing above `info`.
3. With Node 22 on PATH, `./bootstrap.sh --mode design --yes --json` produces the Node CLI's JSON (proves `exec` and flag forwarding); `ps` during the run shows a single `node …/snowarch.mjs bootstrap` process and no bash parent (exec replaced it).
4. With Node absent and `--mode live`, the run stops at B00 with the live-needs-Node FAIL and the macOS/Linux remedy, exit 3, `.local/` not created.
5. With Node absent and a pre-existing mergeable `settings.local.json` lacking the toggle, B07 fails with the hand-edit sentence, exit 1, file unchanged; after the hand edit, a re-run passes with `ok (already set)`.
6. `git status --porcelain` is empty after every run above; `.local/bootstrap-state.json` parses as JSON and has `writer: "bash"`.
7. `node --test tests/launcher-parity.test.mjs` passes (remedy sentences, the Next block, the recipe lines).
8. From `clients/acme/` inside the checkout, `../../bootstrap.sh` prints the root FAIL with the `cd` command and exits 3.

**Tasks.**

1. Write the launcher skeleton (root check, flag parse, Node detection, `exec`).
2. Implement the Node-free B00 with the shared sentences; B01 state heredoc; B02 recipe functions + area loop; B07 restricted writer; B09 block; `--reset`.
3. Parity test reading `remedies.json` / `text.json` and the recipe markers.
4. Run on macOS bash 3.2, Ubuntu bash 5, Git Bash; `shellcheck` in CI (`lint`).
5. Record the no-Node macOS run (criterion 1) with a transcript in the PR.

**Test strategy.** `shellcheck` + `bash -n` in CI; the S14 job runs the launcher with Node stripped from PATH on `ubuntu-latest` and `macos-latest` and with Node present (exec path) on all three; criterion 1 manual on the ARC-00 macOS `no-node` snapshot before merge.

**Dependencies.** S04 (remedies), S05 (toggle semantics), S06 (recipe lines), S09 (text). ARC-00 S-05 branch.

**Size.** L — the script is short, but bash-3.2 portability, the restricted B07 writer and the three-shell verification are 3 days.

**Risks / open points.** `sed`-based reading of `engine.config.json` is brittle by design; S14 asserts the file's formatting (one key per line, generated) so the launcher never mis-parses. Users with bash < 3.2 (none on supported OSes) are out of scope.

**Definition of done.** Merged; CI launcher variants green; `docs/INSTALL.md` "Design-only without Node" section text delivered to S13; ARC-08 S09 reads the state file this launcher writes.

---

### ARC-06-S11 — `bootstrap.ps1` + `bootstrap.cmd` with the Node-free design-only path; `snowarch.cmd`

**As** an individual practitioner on Windows 10/11 **without Git Bash on PATH** **I want** to run (or double-click) `bootstrap.cmd` and reach the same design-only state as the macOS user, and to have `snowarch.cmd` afterwards **so that** native Windows is a first-class path rather than "install Git Bash first" (Q-B).

**Context.** `01` §13 (`bootstrap.ps1` PowerShell 5.1+; `bootstrap.cmd` runs `powershell -ExecutionPolicy Bypass -File bootstrap.ps1` so the default Restricted policy does not block a double-click — S-08; `snowarch.cmd`), §4.1 Windows row (Git for Windows satisfies git ≥ 2.25; the in-session skills need Git Bash for Claude's Bash tool — this story proves launchers, hook and handshake, not the skills). P-40 (no native Windows path). Q-B: conditional on S-03/S-04/S-08; the fallback "Git Bash required" is pre-recorded (`03` §A S-03 and S-08 fallbacks; `01` §13). ARC-00 S13 provides the Windows test recipe (PATH stripping, VM snapshots). README acceptance 2 ("A fresh user on a clean Windows 10/11 machine without Git Bash double-clicks or runs `bootstrap.cmd` and reaches the same state (S-08)").

**Scope.** In: `bootstrap.ps1` (PowerShell 5.1-compatible: no `??`, no ternary, no `-AsHashtable` on `ConvertFrom-Json` — parse to PSCustomObject), `bootstrap.cmd`, `snowarch.cmd`, the double-click behaviour, the same Node-free B00/B01/B02/B07/B09 as S10 with the same sentences, `.gitattributes` CRLF for `*.ps1 *.cmd` (ARC-01 S07 owns the file; this story asserts it), the S-03 fallback hook (resolved absolute paths) behind a flag if S-03 FAILED. Out: masked input (ARC-07 S01 / S-04); the Windows CI job (S14); `.msi`/installer of any kind.

**Design notes.**

- `bootstrap.cmd` (exact):
  ```
  @echo off
  setlocal
  powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0bootstrap.ps1" %*
  set "RC=%ERRORLEVEL%"
  echo %CMDCMDLINE% | find /i "%~nx0" >nul && if "%~1"=="" pause
  endlocal & exit /b %RC%
  ```
  The `pause` fires only when launched by double-click with no arguments (the window would otherwise close instantly). The `%CMDCMDLINE%` double-click detection is a cmd convention, not a documented contract — it is exercised by the S-08 procedure (ARC-00 S07) on Windows 10 and 11 and task 1 records the result; if it misfires, the fallback is an unconditional `pause` when `%~1` is empty. `powershell` (Windows PowerShell 5.1) is used, not `pwsh`, because 5.1 is what every Windows 10/11 has; if `pwsh` is found it is not preferred (one code path). GPO-locked `MachinePolicy` (S-08 fallback): the `.ps1` cannot run; `bootstrap.cmd` detects `The file … is not digitally signed`/`running scripts is disabled` in the output and prints `PowerShell scripts are blocked by policy on this machine — use Git Bash: ./bootstrap.sh (Git for Windows), or ask your administrator to allow RemoteSigned for your user` exit 3. (The "pure-batch minimal path" of `03` S-08 is implemented only if S-08 FAILED under default policy — it did not in the expected case; the GPO case gets the Git Bash advice.)
- `bootstrap.ps1`: `Set-StrictMode -Version 2.0`; `$ErrorActionPreference = 'Stop'` with try/catch per step printing the same `FAIL Bnn:` / `Remedy:` lines; `$Root = Split-Path -Parent $MyInvocation.MyCommand.Path`; root check against `(Get-Location).Path`; Node detection via `Get-Command node` and `node -p …`; hand-over `& node "$Root\tools\snowarch\bin\snowarch.mjs" bootstrap @args; exit $LASTEXITCODE` (no `exec` in PowerShell — the parent waits; Ctrl-C propagates). Node-free: B00 (`git --version` parse; `claude --version`; disk via `(Get-PSDrive -Name $Root[0]).Free` ≥ 1 GiB; network via the same `git ls-remote` as S10 with the same error mapping — git is guaranteed by B00's own check order: git first, then network), plan lines identical to S10, B01 (`New-Item -ItemType Directory .local`; no chmod — state records `fileModes: "acl-inherited"`), state file via `ConvertTo-Json -Depth 5` from an ordered hashtable (same keys as S10), `git diff --quiet HEAD -- .mcp.json .claude/settings.json`, B02 recipe function with the marker comments (the recipe already carries `-c core.longpaths=true`, ARC-03 S05; the launcher additionally runs `git config core.longpaths true` in the submodule after the clone — ARC-03 does the same), area loop, B07 with the same restricted merge rule as S10 (`ConvertFrom-Json` to inspect; write whole file only when absent), B09 block with Windows spellings (`.\bootstrap.cmd`, `snowarch.cmd mode live`). Output encoding: `[Console]::OutputEncoding = [Text.Encoding]::UTF8` for the `✔`/`—` characters, with an ASCII fallback (`--ascii`, auto when `$Host.Name -eq 'ConsoleHost'` and the code page is not 65001) so conhost never prints mojibake.
- `snowarch.cmd` (exact):
  ```
  @echo off
  where node >nul 2>nul || (echo snowarch: Node.js 20+ is required for this command. Design-only works without it: .\bootstrap.cmd --mode design & exit /b 3)
  node "%~dp0tools\snowarch\bin\snowarch.mjs" %*
  exit /b %ERRORLEVEL%
  ```
  Backslash path is fine (Node on Windows). Used by `/snowarch …` skills only when the Bash tool is unavailable — the skills print `snowarch.cmd` in PowerShell/cmd sessions (ARC-07 S09, ARC-08 S09).
- **S-03 fallback** (only if the verdict FAILED): `bootstrap.ps1` and the Node B07 write `env: { "SNOWARCH_ROOT": "<resolved absolute path>" }` into `.claude/settings.local.json` and generate a per-machine local override of the server entry via `claude mcp add-json servicenow '<json with the absolute path>' -s local` (S12's mechanism) — a documented, gitignored deviation; the state records `mcpJsonOverrideSha` (sha256 of the JSON handed to `add-json`) so ARC-08 S02's E-07 can verify it, and the doctor reports `registration: local (S-03 fallback)`. If S-03 CONFIRMED, this code does not exist.
- Line endings: `.gitattributes` gives `*.ps1 *.cmd` CRLF so a Windows checkout with `core.autocrlf=false` still runs (`01` §13; ARC-09 S09 tests `git ls-files --eol`).

**Acceptance criteria.**

1. On the ARC-00 Windows `clean` snapshot (no Git Bash: `where bash` empty; Git for Windows installed; Claude Code 2.1.214; execution policy `Restricted`; no Node), double-clicking `bootstrap.cmd` opens a console that shows the plan, runs on Enter, ends with the design-only block and `Press any key to continue`; afterwards `Get-Content .local\bootstrap-state.json | ConvertFrom-Json` shows `writer = powershell`, `mode = design-only`; `git status --porcelain` is empty; `claude` in that folder shows the trust dialog only; `/mcp` shows `servicenow` disabled (S-08 + S-01).
2. `.\bootstrap.cmd --mode design --yes` from cmd and from PowerShell 5.1 produce the same result without a `pause`; exit code 0 reaches the caller (`echo %ERRORLEVEL%` / `$LASTEXITCODE`).
3. With Node 22 installed, `.\bootstrap.cmd --mode design --yes --json` prints the Node CLI's JSON and the exit code propagates; with Node absent and `--mode live`, exit 3 with the `winget install OpenJS.NodeJS.LTS` remedy.
4. On a GPO-locked VM (`MachinePolicy = AllSigned`), `.\bootstrap.cmd` prints the "blocked by policy" sentence with the Git Bash alternative and exits 3.
5. `snowarch.cmd version` prints the S02 line; `snowarch.cmd` with Node absent prints the Node sentence and exits 3.
6. `tests/launcher-parity.test.mjs` (S10) also passes for `bootstrap.ps1` (recipe lines, remedy and Next sentences).
7. With a pre-existing `settings.local.json` lacking the toggle and no Node, B07 fails with the hand-edit sentence (Windows spelling: `install Node 20+ and re-run .\bootstrap.cmd`).
8. `git ls-files --eol bootstrap.ps1 bootstrap.cmd snowarch.cmd` shows `w/crlf` on a Windows checkout and `i/crlf` in the index.
   *Amended 2026-09-10 (ARC-06-S11 review):* the assertion is `w/crlf` plus
   `attr/text eol=crlf`. With that attribute the INDEX keeps LF and the checkout converts,
   which is the attribute working; `i/crlf` would require `-text`, turning normalisation off
   for a repository three platforms clone.

**Tasks.**

1. Write `bootstrap.cmd`, `snowarch.cmd`; verify the double-click detection on Windows 10 and 11.
2. Write `bootstrap.ps1` mirroring S10 step by step; share sentences through the parity fixtures.
3. Implement the S-03 fallback only if the ADR says FAILED; otherwise document its absence.
4. Run the ARC-00 S13 Windows recipe on the `clean` snapshot (criteria 1, 2, 4); record transcripts in the PR.
5. PSScriptAnalyzer (`Invoke-ScriptAnalyzer -Settings PSGallery`) with 5.1 compatibility rules in the Windows CI lint.

**Test strategy.** PSScriptAnalyzer in CI; the S14 Windows job (PATH without Git Bash) runs `.\bootstrap.cmd --mode design --yes` with and without Node; criteria 1 and 4 manual on VMs before merge (CI runners cannot double-click or apply GPO).

**Dependencies.** S10 (shared design and fixtures); ARC-00 S-03/S-08 verdicts and S13 recipe; ARC-01 S07 (`.gitattributes`). **Q-B conditionality:** if S-03 or S-08 FAILED beyond their fallbacks, this story shrinks to `snowarch.cmd` + the "Git Bash required" text in S13, and the README/ARC-09 record the downgrade — no re-planning.

**Size.** L — PowerShell 5.1 quirks, console encoding, the double-click and policy cases, and VM verification; 4 days.

**Risks / open points.** Windows Defender can slow the 35k-file docs checkout (ARC-03 S11 measures). `pause` on double-click means an unattended double-click leaves a window open — acceptable. Long paths need `core.longpaths` (recipe) and, for the user's own tools, possibly the Windows LongPathsEnabled policy — the install page notes it.

**Definition of done.** Merged; Windows CI green; VM transcripts attached; `docs/INSTALL.md` Windows column and `docs/PLATFORM-NOTES.md` Windows section updated; ARC-09 S08 reuses the job.

---

### ARC-06-S12 — `snowarch mode live` / `mode design` post-install switches; `mode live --register local|user` fallback

**As** an individual practitioner **I want** to move a checkout from design-only to live (and back) with one command, without re-cloning or re-registering **so that** the default install can grow into a live one whenever I get an instance — and, on a machine whose policy blocks project MCP servers, to fall back to a per-checkout local registration with the same secret-free entry.

**Context.** `01` §9 ("Upgrading to live later: `./snowarch mode live` runs B04–B08 only …, flips the toggle to `enabledMcpjsonServers`, and the next `claude` session (or `/mcp` reconnect) is live — no re-clone, no re-registration"), §5 (fallback: `./snowarch mode live --register local` runs `claude mcp add-json servicenow '<same secret-free JSON>' -s local`; `--register user` last resort — attaches the server to every project, which the engagement firewall argues against; `add-json` verified on 2.1.258 with `-s local|user|project`). D-06 (the `/snowarch setup-instance` skill hands off to the terminal — it prints this command). README story 12.

**Scope.** In: `snowarch mode [live|design] [--register project|local|user] [--yes] [--instance-file] [--ack-user-scope]`; `mode` without argument prints the Mode line and the registration kind; the state/config updates; the `disableAllHooks` removal when Node is now present (S-05 branch A). Out: the wizard (ARC-07); `claude mcp remove` of stale legacy entries (ARC-08 S03 prints those commands; this story only ever adds/removes the `servicenow` entry it created itself).

**Design notes.**

- `mode live`: requires Node (S02 launcher already enforces); sets `mode: "live"` in the state; runs the S03 runner with steps B04, B05, B06, B07, B08, B09 (B00 always; B01–B03 `ok (cached)` or re-run if their inputs changed); B06 behaves as in S07 (existing store → "keep / add another"); B07 writes the live toggle and, under branch A, removes `disableAllHooks` if this bootstrap wrote it (recorded in the state as `data.wroteDisableAllHooks: true`; a user-set key is left alone and a note printed). Ends with the S09 live block plus `Restart claude (or /mcp → servicenow → reconnect) to load the server.`
- `mode design`: sets `mode: "design-only"`; runs B07 (design toggle) and B09; the store is **not** touched — prints `note: instance "<label>" kept in .local/instances.json; ./snowarch mode live re-enables it; ./snowarch instance remove <label> deletes it`. No network, no Node-only step.
- `mode` (no argument): prints `modeLine()` from the state/config and `registration: project (.mcp.json)` or `registration: local (~/.claude.json, this checkout only)`; `--json` object.
- **`--register local`** (fallback for managed policies that block project servers — the user learns of the block from `/mcp` or the doctor, and the install page names this command): builds the JSON of `.mcp.json`'s `servicenow` entry **verbatim** (the placeholders included — `CLAUDE_PROJECT_DIR` is set for local entries too, `00` §9), runs `claude mcp add-json servicenow '<json>' -s local` with `cwd = root` (local scope is keyed on the cwd), checks exit 0, then `claude mcp get servicenow` must show the entry; writes `registration: "local"` into `.local/config.json` and the state, and B07 writes `disabledMcpjsonServers: ["servicenow"]` so the project entry is rejected and only the local one loads. The story's first task verifies on the current CLI that a local-scope and a project-scope server with the same key coexist as intended (the docs describe scope precedence; the verification is recorded in the PR with the CLI version — if both would load, the `disabledMcpjsonServers` write already resolves it). Undo: `mode live --register project` runs `claude mcp remove servicenow -s local` (only if `registration` was `local` — never touches an entry this tool did not create) and rewrites the toggles.
- **`--register user`**: refused unless `--ack-user-scope` is also given; prints `user scope attaches the "servicenow" server to every project on this machine, against the engagement firewall — prefer --register local. Re-run with --ack-user-scope to proceed.` exit 2. With the ack: `claude mcp add-json servicenow '<json>' -s user`; `registration: "user"`; the doctor (ARC-08) reports it as WARN every run.
- All `claude mcp …` invocations pass the JSON as a single argv element; it contains no secret by construction (S01), so argv exposure is not a concern here; output of the `claude` CLI is logged redacted.
- `~/.claude.json` is otherwise never read or written by this story; `--register project` (default) never calls `claude mcp` at all.

**Acceptance criteria.**

1. After a design-only install with Node 22, `./snowarch mode live` runs B04/B05/B06(wizard)/B07/B08/B09 only (B01–B03 cached), `settings.local.json` flips to `enabledMcpjsonServers: ["servicenow"]` with no `disabledMcpjsonServers` member `servicenow`, and after a Claude restart `/mcp` shows `servicenow ✔ connected`.
2. `./snowarch mode design` afterwards flips the toggle back, prints the "instance kept" note, leaves `.local/instances.json` byte-identical, and `/mcp` shows the server disabled; `./snowarch mode` prints `Mode: design-only` and `registration: project (.mcp.json)`.
3. Given `disableAllHooks: true` written by a Node-free install (state `hooksDisabledByBootstrap: true`), `mode design` or `mode live` with Node now present removes the key; given the key was pre-existing (state flag absent), it is left and a note printed.
   *Amended 2026-09-10 (S-05 variant B):* no bootstrap and no `mode` run ever writes
   `disableAllHooks`, so `hooksDisabledByBootstrap` is always `false` and branch A has
   nothing to remove. What remains is variant B's own rule, and it is what the tests assert:
   `applyToggles` ADDS the SessionStart hook entry when Node is present and REMOVES it when
   it is not; a pre-existing user-set `disableAllHooks` is left alone and a note is printed.
4. `./snowarch mode live --register local` (with an existing store) results in `claude mcp get servicenow` showing a local-scope entry whose `command` is `node` and whose args contain `${CLAUDE_PROJECT_DIR:-.}/packages/snowarch/dist/server.js` unexpanded, `.local/config.json.registration = "local"`, `settings.local.json` containing `disabledMcpjsonServers: ["servicenow"]`, and a Claude session in the folder showing `servicenow ✔ connected` exactly once (no duplicate). `~/.claude.json` contains no key matching `/PASSWORD|SECRET|TOKEN/i` under that entry.
5. `./snowarch mode live --register project` after (4) removes the local entry (`claude mcp get servicenow` shows the project entry) and restores the live toggle.
6. `./snowarch mode live --register user` exits 2 with the firewall sentence; with `--ack-user-scope` it registers at user scope and `./snowarch mode` prints `registration: user (~/.claude.json, every project — not recommended)`.
7. `./snowarch mode live --yes` without a store and without `--instance-file` exits 2 with S03's sentence.

**Tasks.**

1. Verify same-key coexistence and precedence on the floor and current CLI (task recorded in the PR; adjust B07's write if needed).
2. Implement `mode` with the runner's step subset; `disableAllHooks` bookkeeping.
3. Implement `--register` with `claude mcp add-json/remove/get` wrappers (`child_process.execFile`, no shell), verification of the result, and the user-scope refusal.
4. Tests with a fake `claude` binary on PATH (records argv; asserts no secret, `-s local`, `cwd`); Claude-Code-in-the-loop criteria 1, 2, 4 manual on macOS and Windows.

**Test strategy.** Unit with the fake `claude`; integration in S14 for `mode design`/`mode live --instance-file` against the stub REST server; manual TTY checks for `/mcp`.

**Dependencies.** S07, S08, S09; ARC-08 S03 for stale-entry handling (not this story); ARC-07 S09 prints `./snowarch mode live` / `instance add` from inside Claude. `claude mcp add-json … -s local|user|project` is verified on 2.1.258 (`01` §5); `claude mcp remove` is the command `01` §8 has the doctor print — task 1 records both commands' flag spellings on the floor CLI (S-11) before the wrappers are written.

**Size.** M — the runner does the work; the `--register` wrappers, the coexistence verification and the bookkeeping are two days.

**Risks / open points.** `claude mcp add-json` flag names may change (R-13) — wrapped in one module with a version check message. Managed policies might also block local scope; then the doctor says so and the user is out of options we control (documented).

**Definition of done.** Merged; tests green; `docs/INSTALL.md` "Adding live mode later" and "If your organisation blocks project MCP servers" sections (S13); `docs/TROUBLESHOOTING.md` entries for `registration: local/user`; ARC-08 S03/S05 read `registration` from `.local/config.json`.

---

### ARC-06-S13 — `docs/INSTALL.md` (= README body); Path B recipe sentence and non-empty-folder clone sequence; uninstall; start-at-root note

**As** an individual practitioner **I want** one install page that tells me the two commands, the two dialogs, exactly what I will see, what to do if something fails, how to start from inside Claude, and how to uninstall **so that** there is no second guide to contradict it (P-02) and nothing to discover.

**Context.** `01` §3 (`README.md` "the ONE install page (2 commands, 2 dialogs, what you will see)"; `docs/INSTALL.md` = README body), §4.2–4.4 (Path A, Path B, team variant), §4.1 prerequisites table, §5 consequences ("`claude mcp add` is never run; `~/.claude.json` is never touched"), D-06 ("the `/snowarch setup-instance` skill must guide the user through the terminal hand-off for credentials from inside Claude (say exactly what to type, wait, resume)"), R-2 (skill names), S-09 (restart after Path B). README deliverables: prerequisites table, Path A with the one-line form, Path B, the two dialogs, the Mode line, "what to do if", attribution line, the "start `claude` at the checkout root" note, "Uninstall". P-02 ("README names a non-existent npm package and registers in `claude_desktop_config.json`"; four unstated steps).

**Scope.** In: `docs/INSTALL.md`; `README.md` = a 10-line header (badge line written by ARC-09's release script, one-paragraph product description, licence line) followed by the body of `docs/INSTALL.md` included by a build step (`scripts/gen-readme.mjs`, checked in CI to be byte-equal — no two copies to drift); the Path B recipe sentence and the exact commands Claude should run (empty and non-empty folder); the hand-off text shared with `/snowarch setup-instance` (a `docs/snippets/terminal-handoff.md` fragment that ARC-07 S09 pastes into the skill body — one source; ARC-07 S09 does not yet name the fragment, so this story owns both the file and the inclusion test). Out: `docs/MODES-AND-PRESETS.md` (ARC-02/ARC-07), `docs/TROUBLESHOOTING.md` (generated, ARC-05), `docs/PLATFORM-NOTES.md` content (ARC-02; this story adds the Windows launcher notes from S11).

**Design notes.**

- Page structure (headings, in order): **Prerequisites** (the `01` §4.1 table verbatim, plus one sentence: "Node.js is needed only for live mode"; the Windows row states that Git for Windows is required for the in-session `/snowarch` skills because Claude Code's Bash tool needs Git Bash — the launchers do not) · **Install — Path A (terminal first)**: the one-line form `git clone https://github.com/farstic/ai-servicenow-architect.git && cd ai-servicenow-architect && ./bootstrap.sh` (Windows: the three lines with `.\bootstrap.cmd`), then `claude` · **What you will see** (the plan screen, the ten step lines, the B09 block from S09's `text.json` — inserted by the generator so it cannot drift) · **The two dialogs** (trust: always; MCP approval: only if S-01 FAILED — the sentence is generated from `EXPECTED_DIALOGS`) · **Mode and Preset in one paragraph** (link to `docs/MODES-AND-PRESETS.md`) · **Install — Path B (Claude first)**: `mkdir my-engagement && cd my-engagement && claude`, accept trust, paste exactly: *"Install the AI ServiceNow Architect from https://github.com/farstic/ai-servicenow-architect into this folder."*; what Claude will do (`git clone https://github.com/farstic/ai-servicenow-architect.git .` then `./bootstrap.sh --mode design --yes --skip-claude-check`; Claude Code's own permission prompts for those two commands may appear in default/manual mode — answer Yes); non-empty folder: `git init && git remote add origin https://github.com/farstic/ai-servicenow-architect.git && git fetch --depth 1 origin main && git checkout -b main --track origin/main` (fails safely if an existing file collides: git refuses to overwrite untracked files — move them first); then "exit and run `claude` again — `CLAUDE.md`, `.mcp.json` and `.claude/settings.json` are read at session start (S-09)"; live mode is added later with `/snowarch setup-instance` · **Adding live mode later** (`./snowarch mode live`; `/snowarch setup-instance`; the terminal hand-off fragment: "Claude prints one command; open your own terminal at the checkout root, run it, type the credentials there (never in the chat), come back and say *done* or run `/snowarch setup-instance --resume`") · **Operators and CI** (S07's `--instance-file` text with a placeholder-only example, 0600, deletion advice; `--yes`) · **Design-only without Node** (S10/S11 restricted B07 case; the `disableAllHooks` note under branch A) · **Start `claude` at the checkout root** (Claude Code reads `.claude/settings.json` and `.mcp.json` from the session's primary working directory — `docs:settings`; a session started inside `clients/<name>/` loads neither; engagement folders are paths within the checkout, or one checkout per engagement) · **If your organisation blocks project MCP servers** (S12 `--register local`) · **What to do if** (B00 remedies table from `remedies.json`; a link to the generated `docs/TROUBLESHOOTING.md` catalogue; "re-run `./bootstrap.sh` — it resumes") · **Uninstall** (delete the checkout — it holds the only credential copy, in `.local/`; if used, `~/.config/snowarch/` (`%APPDATA%\snowarch\` on Windows); nothing was registered in `~/.claude.json` unless you used `--register local|user` — then `claude mcp remove servicenow -s local|user`; Claude Code's own trust/approval record for the folder remains and is harmless) · **Attribution** (ARC-03 S10's line and the measured size/time sentence) · **Licence** (Apache-2.0, D-02).
- Every command appears in POSIX and Windows spelling side by side where they differ; nothing references `snow-mcp`, `nowaikit`, `servicenow-mcp`, "Tier", `claude mcp add` (except in Uninstall/fallback), `claude_desktop_config.json`, or `~/.claude.json` editing — ARC-05's lint (`retired-names.json`) enforces the first group; a test in this story greps the second.
- `scripts/gen-readme.mjs`: `README.md` = `docs/README-head.md` + `docs/INSTALL.md` body; CI `lint` fails on a diff (same pattern as ARC-05's generated files).

**Acceptance criteria.**

1. A reader who follows `docs/INSTALL.md` Path A on the macOS no-Node snapshot and on the Windows `clean` snapshot reaches `Mode: design-only` without consulting any other file (verified by two people who did not write the page; recorded in the PR).
2. Path B on macOS (S-09 procedure with the real repository): the pasted sentence leads Claude to run the clone and the design bootstrap without asking the user to type anything except Yes on its own permission prompts; after one restart `/snowarch status` prints `Mode: design-only`; the same with a non-empty folder containing `notes.md`.
3. `node scripts/gen-readme.mjs --check` passes; editing `README.md` by hand fails it.
4. `grep -nE "snow-mcp|nowaikit|servicenow-mcp|Tier [0-9]|claude_desktop_config|1\.0\.0" README.md docs/INSTALL.md` prints nothing; `grep -c "2.0.0"` ≥ 1 in the header (badge/version line); `grep -c "Apache-2.0" docs/INSTALL.md` ≥ 1 (D-02).
5. The "What you will see" block equals S09's `text.json` block (generator test); the dialogs paragraph names `EXPECTED_DIALOGS` dialogs.
6. `docs/snippets/terminal-handoff.md` exists, `docs/INSTALL.md` includes it (generator-inserted, byte-equal), and `tests/terminal-handoff.test.mjs` asserts `.claude/skills/snowarch/SKILL.md` contains the fragment verbatim — the assertion is `test.todo` with the reason `ARC-07 S09 not merged` until that skill body exists, then it must pass.

**Tasks.**

1. Write `docs/INSTALL.md` per the structure; write `docs/README-head.md`; implement `gen-readme.mjs` and the CI check.
2. Write the terminal hand-off fragment and its inclusion test; agree the wording with ARC-07 S09.
3. Add the Windows notes to `docs/PLATFORM-NOTES.md`.
4. Run the two read-through verifications (criterion 1) and the Path B run (criterion 2); attach transcripts.
5. Delete the imported legacy install narratives that still exist after ARC-02 S05 (`SETUP.md`, `docs/INSTALLATION-GUIDE.md`, the interim README page) if any remain — one page only.

**Test strategy.** Generator check and greps in CI; read-throughs and the Path B run manual before merge; S-09 record cross-checked.

**Dependencies.** S09 (text), S10, S11, S12 (commands must exist as documented); ARC-03 S10 (attribution and size/time sentence); ARC-00 S-09; ARC-07 S09 consumes the fragment.

**Size.** M — writing is a day; the generator, greps and verification runs are the second.

**Risks / open points.** The Path B sentence relies on Claude choosing the documented commands; the page therefore also lists the exact commands so a user can paste them if Claude deviates. Page length: target ≤ 250 lines; anything longer moves to `docs/`.

**Definition of done.** Merged; CI green; the two transcripts attached; `README.md` regenerated; ARC-10's cutover checklist links the Uninstall section.

---

### ARC-06-S14 — CI: design-only bootstrap on three OSes with and without Node; Windows job without Git Bash; no-tracked-file-modified and secret-grep gates

**As** a maintainer **I want** every commit to prove that the design-only bootstrap completes on macOS, Linux and native Windows — through both the Node CLI and the Node-free launchers — leaves no tracked file modified and no secret-shaped key behind **so that** the install promise cannot regress silently (R-10: the Windows path was designed from docs and never run).

**Context.** README acceptance: "`./bootstrap.sh --mode design --yes` and the Windows equivalent pass on the three CI OSes on every commit; the Windows job runs without Git Bash on PATH"; "`git status` in the checkout after any bootstrap run shows no tracked file modified"; the secret grep. `01` §13 (CI runs `bootstrap --mode design --yes` on the three OSes × Node 20/22/24), `01` §4.1 Windows row (the no-Git-Bash job proves launchers, hook and handshake, not the skills). ARC-00 S13 (Windows recipe: PATH stripping). ARC-01 S11 (CI skeleton), ARC-08 S11 (adds the doctor assertion to this job), ARC-09 S08 (completes the matrix).

**Scope.** In: job `bootstrap` in `.github/workflows/ci.yml` with variants `node-cli` (three OSes × Node 20/22/24) and `no-node` (`ubuntu-latest`, `macos-latest`, `windows-latest` with Node removed from PATH), the Windows `no-gitbash` variant (Git Bash removed from PATH per the S13 recipe; `bootstrap.cmd` and `snowarch.cmd`), the assertions listed below, a job summary with B02's size/time. Out: the doctor assertion (ARC-08 S11 adds `./snowarch doctor --json` → `summary.fail == 0` to the same job), the live-mode E2E (needs a PDI; `RUN_LIVE_E2E=1` manual workflow), release gates (ARC-09).

**Design notes.**

- Common steps: checkout **without** submodules (the bootstrap must fetch them itself), `git config --global user.name/email` (some git commands need it), then the platform command with `--skip-claude-check` (runners have no Claude Code; S-11/S-19 note which runners could install it — not required here), then assertions:
  1. exit code 0;
  2. `git status --porcelain` empty (tracked files untouched; `.local/` and `settings.local.json` ignored);
  3. `.local/bootstrap-state.json` parses, `mode == "design-only"`, `steps.B09.status == "ok"`, `writer` equals the variant's expectation (`node` / `bash` / `powershell`);
  4. `.claude/settings.local.json` deep-equals the S05 target for the variant (`disableAllHooks` present only in `no-node` under branch A);
  5. `grep -rE "PASSWORD|SECRET|TOKEN|_KEY\"" .mcp.json .claude/settings.json .claude/settings.local.json .local/bootstrap-state.json .local/config.json` empty;
  6. `vendor/ServiceNowDocs` present with every area of `vendor/docs-areas.txt` (sparse) and `git -C vendor/ServiceNowDocs rev-parse HEAD` == `engine.config.json.docs.pin`;
  7. POSIX: `stat` mode of `.local` is `700`;
  8. second run of the same command exits 0 in < 30 s and prints `ok (cached)` for B01/B02/B07 (idempotence);
  9. `node-cli` variant only: B05 ran (`steps.B05.status == "ok"`); because B08 is live-only and never runs in a design-only cell, the cell additionally runs `node tools/snowarch/tests/handshake-smoke.mjs` (S08's module against the committed `dist/server.js`, no store, expects exactly the five core tools) so the committed `dist/` is proven on every OS;
  10. `no-gitbash` (Windows): `where bash` prints nothing (asserted before the run), `.\bootstrap.cmd --mode design --yes` from `cmd` and `powershell -File` invocations, `snowarch.cmd version`, `snowarch.cmd bootstrap --mode design --yes` (Node present variant), the exec-form hook smoke (`node tools/snowarch/hooks/session-start.mjs` prints a `Mode:` line reading the state file — the committed stub or ARC-08's script).
- Node removal per OS: `ubuntu`/`macos`: run the launcher with `PATH` rebuilt from a list excluding the Node directories (`which -a node` dirs) and assert `command -v node` fails inside the step; `windows`: the S13 recipe (`$env:PATH` filtered of `nodejs`, `npm`, `Git\usr\bin`, `Git\bin`, `Git\mingw64\bin` for the no-gitbash variant — `Git\cmd` stays so `git.exe` works). The docs fetch uses the real corpus (this is the only job that proves a real end-to-end design-only install; ARC-03's `docs-real.yml` proves the recipe weekly).
- Matrix cost: 9 (`node-cli`) + 3 (`no-node`) + 1 (`no-gitbash`) = 13 cells × ~2–3 min (dominated by B02 ~1 min); acceptable on every commit; `concurrency` cancels superseded runs.
- Job summary (`$GITHUB_STEP_SUMMARY`): a table of OS × variant × B02 seconds × `du -sm vendor/ServiceNowDocs` — the numbers ARC-03 S10 quotes in the install page.

**Acceptance criteria.**

1. On a green commit, the `bootstrap` job shows 13 passing cells; the Windows `no-gitbash` cell's log contains `where bash` → empty and the design-only block from `bootstrap.cmd`.
2. A commit that modifies `bootstrap.sh` to write a file at the repo root (fixture PR) fails assertion 2 with the file name in the log.
3. A commit adding `"SNOW_PASSWORD": "${SNOW_PASSWORD:-}"` to `.mcp.json` fails assertion 5 (and S01's test) on all cells.
4. A commit that breaks the committed `dist/server.js` (fixture: syntax error) fails assertion 9 on all `node-cli` cells with the handshake error text.
5. Assertion 8 passes: the second run's log shows `ok (cached)` for B01, B02, B07 and no network access to github.com (proxy env set to an unreachable host for the second run).
   *Amended 2026-09-10 (ARC-06-S14):* the unreachable-proxy half cannot be implemented as
   written. B00 probes github.com on EVERY run by design (S04 — the check is never cached),
   so a proxy pointing nowhere makes B00 FAIL and proves nothing about caching. What
   idempotence means here is asserted instead — and it means two different things by variant,
   which the job's first run is what revealed. In a **Node-CLI** cell: `ok (cached)` for
   B01/B02/B07, no `[docs]` phase line, those three entries' `finishedAt` UNCHANGED (a cached step
   is not re-recorded, so the `durationMs < 1000` the brief asked for can never hold — the number
   is still the first run's), and exit 0 in under 30 s. In a **no-node** cell there is no cache at
   all: the launchers record `"inputsHash": null` because bash cannot compute the repository's
   input hashes, and pretending it could would cache a step whose inputs had changed. So the
   launcher re-runs its steps by design, and what must hold is that nothing changed — `ok B07:
   already set`, a byte-identical `settings.local.json`, and the same step outcomes.
6. The job summary table is present with a non-empty seconds/MB value for every cell.
7. After ARC-08 S11, the same job additionally asserts `summary.fail == 0` from `./snowarch doctor --json` in the `node-cli` cells without restructuring.

**Tasks.**

1. Write the job with the three variants; PATH-stripping steps per OS (import the S13 recipe).
2. Assertion script `tools/snowarch/tests/ci-assert-bootstrap.mjs` (Node) for `node-cli` cells and a PowerShell/bash twin for the `no-node` cells (they cannot run Node).
3. `handshake-smoke.mjs` over S08's module.
4. Fixture PRs for criteria 2–4 (run once, recorded, then closed).
5. Job summary table; `concurrency` group.

**Test strategy.** The job is the test; fixture PRs prove the negatives once. Runtime budget per cell ≤ 5 min.

**Dependencies.** S10, S11 (launchers), S08 (handshake module), S03 (state schema); ARC-01 S11 (workflow skeleton); ARC-00 S13 (Windows recipe); ARC-03 S05 (real corpus recipe). Extended by ARC-08 S11 and ARC-09 S08.

**Size.** M — YAML plus two assertion scripts; Windows PATH surgery costs the second day.

**Risks / open points.** Runner images change (Node/Git Bash locations) — the PATH filter is by directory name pattern with an assertion that the removal worked, so a silent no-op cannot pass. Real-corpus fetch time on `windows-latest` (Defender) may approach the budget — ARC-03 S11 measures; raise the timeout if needed.

**Definition of done.** Merged; 13 cells green; fixture-PR results linked in `docs/CONTRIBUTING.md` "What CI proves about the install"; ARC-08 S11 and ARC-09 S08 extend the job in place.

---

## Sizing summary

| Size | Stories | Days (low–high) |
|---|---|---|
| S | S09 | 0.5–0.5 |
| M | S01, S02, S04, S05, S06, S08, S12, S13, S14 | 9 × (1–2) = 9–18 |
| L | S03, S07, S10, S11 | 4 × (3–5) = 12–20 |
| **Total** | 14 stories | **21.5–38.5 engineer-days (≈ 4.5–8 weeks for one engineer)** |

The upper bound exceeds six weeks for one engineer. Why the ARC is not split: the fourteen stories are one delivery promise ("install in one go") that is only testable end to end once the launchers, the orchestrator and the summary all exist; splitting them across ARCs would create a half-installed intermediate state. Mitigations that bring the calendar inside six weeks: S10 and S11 (launchers) are independent of S07/S08 (live steps) and can run in parallel with them; S13 (docs) and S14 (CI) can start as soon as S09's text exists; two engineers put the critical path (S01 → S02 → S03 → S04/S05/S06 → S07 → S08 → S09 → S12) at ≈ 4 weeks with the launchers and CI alongside. External waits: ARC-03 S05 (`--print-recipe`) for S06, ARC-04 S03/S13 and ARC-05 S01 for S07, ARC-07 S03/S05 for the interactive half of S07 and the probe half of S08 — none of them blocks the design-only path, which is complete after S10/S11/S14.
