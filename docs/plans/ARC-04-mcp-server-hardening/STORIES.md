# ARC-04 — Stories

Status: Draft · Decisions applied: D-01…D-06, Q-A, Q-B, R-1…R-3 · Source: README.md of this ARC · Last updated: 2026-09-04

Names used throughout (D-01, R-1): package directory `packages/snowarch`, npm name `@farstic/snowarch`, `bin` `snowarch`, version `2.0.0` (equal to the root), MCP server key `servicenow` → tool names `mcp__servicenow__snow_*`, project skill `/snowarch` with sub-commands `status` · `setup-instance` · `doctor`. Every mention of `packages/snow-mcp`, `snow-mcp contract`, `/setup-instance`, `1.0.0` or "Tier" in older plan text is to be read with these values. Vocabulary: *Mode* `design-only` | `live`; *Preset* `read-only` | `pdi-developer` | `full` | `custom`.

Source evidence is cited as `mcp:<path>:<line>` (the `snow-mcp` working tree at `~/work/snow-mcp`) and `engine:<path>` (`~/work/AI-Architect-Claude`), the same notation as `00`. Line numbers refer to the working tree audited on 2026-09-04; after ARC-01's import the same files live under `packages/snowarch/`.

## Story map

| ID | Title | Size | Depends on | Delivers |
|---|---|---|---|---|
| ARC-04-S01 | D-03 code cut, dependency prune, identity `@farstic/snowarch` 2.0.0, vitest scoping, `npm test` in CI | L | ARC-01 (S05 import, S06 licence) | A server-only package that builds, lints and tests green on three OSes under its final name and version |
| ARC-04-S02 | Store module v1: precedence, schema, file-mode check, atomic writes; legacy stores and cwd `dotenv` removed | L | S01 | `src/store/` read by the server, the CLI (ARC-07) and the doctor (ARC-08); one store, one logged precedence |
| ARC-04-S03 | Per-instance flag evaluation, preset expansion, dependency rule, prod acknowledgement; `permissions.ts` at 100 % coverage | L | S02 | Flags belong to the instance, not the process; presets expand to six byte-exact strings; `prod` write posture refused without `prodWriteAck` |
| ARC-04-S04 | Unconfigured start mode, `NO_INSTANCE_CONFIGURED`, `snow_core_status_read`, `snow_core_capabilities_read`, `snow_core_instances_reload` + `list_changed` | L | S03 | The server never exits 1; five core tools always advertised; store re-read without a session restart |
| ARC-04-S05 | SCRIPTING / update-set read-gate split | M | S03 | `snow_scr_*` and `snow_us_*` reads work under `read-only`; only mutating tools call `requireScripting()` |
| ARC-04-S06 | `gate` / `mutates` on every registration; `extract-tools.mjs` emits manifest fields and `dist/contract.json`; `snowarch contract` | L | S04, S05 | The machine-readable contract of `01` §11, generated from code, with 398 tools |
| ARC-04-S07 | `snow_us_capture_target_set`; `snow_us_active_update_set_ensure` with mandatory name and current-user filter | M | S05, S06 | §2.2 becomes four calls; capture via `sys_user_preference` is a single tool |
| ARC-04-S08 | Retire dead script-execution endpoints; remove undeclared per-call `instance` routing and runtime-generated tools; result-size cap | M | S04, S06 | No tool calls a non-existent endpoint; the advertised tool list is static and equal to the contract |
| ARC-04-S09 | Defect fixes with regression tests: `ORDERBYDESC`, `event_name`, `action_insert`/`action_update` | M | S01 | The three field-note server behaviours become passing tests |
| ARC-04-S10 | Audit trail writer with rotation; redaction defaults; Authorization header never logged | M | S02, S06 | `<store dir>/audit.jsonl`, one line per `mutates: true` call, secret-free by test |
| ARC-04-S11 | Proxy agent honouring `HTTPS_PROXY` / `HTTP_PROXY` / `NO_PROXY`; documented `NODE_EXTRA_CA_CERTS`; network-error classifier (R-3) | M | S01 | Corporate-proxy laptops reach the instance; DNS / TLS-CA / proxy failures are distinguishable by code |
| ARC-04-S12 | Server doctor module (`src/doctor/`) and `snowarch doctor --json` | M | S04, S06 | The SV-xx checks ARC-08 merges into the unified report, usable stand-alone |
| ARC-04-S13 | `scripts/build-dist.mjs`; committed `dist/`; CI rebuild-and-diff | M | S06, S08 | A fresh clone runs `node packages/snowarch/dist/server.js` with no compile step |
| ARC-04-S14 | Rewrite `packages/snowarch/README.md`, `.env.example`, `CHANGELOG.md` from code; 2.0.0 migration notes | M | S01–S13 | Documentation that describes only what the code does, plus the R-03 migration note |

Mapping to the README's original titles: README stories 2 and 7 are merged into S04 (the unconfigured mode is defined by those three tools and the reload); README story 12 (vitest scoping, `npm test` in CI, `permissions.ts` coverage) is split into S01 (harness and CI) and S03 (coverage travels with the rewrite of `permissions.ts`); S11 is the R-3 story the owner required; S12 is new — it carries the "server doctor module" that ARC-08's dependency line attributes to ARC-04. All other README titles map one-to-one (README 1→S01, 3→S02, 4→S03, 5→S05, 6→S06, 8→S07, 9→S08, 10→S09, 11→S10, 13→S13, 14→S14).

| Former README number | Former title (short) | Story ID now |
|---|---|---|
| 1 | D-03 code cut, dependency prune, identity | S01 |
| 2 | Unconfigured start mode | S04 |
| 3 | Single store | S02 |
| 4 | Per-instance flags, presets, prod rule | S03 |
| 5 | Gate split | S05 |
| 6 | `gate` / `mutates` declarations, contract | S06 |
| 7 | New core tools + `instances_reload` | S04 |
| 8 | `snow_us_capture_target_set` / `ensure` | S07 |
| 9 | Dead endpoints, `instance` routing, generated tools, result cap | S08 |
| 10 | Defect fixes (ORDERBYDESC, `event_name`, `action_insert`) | S09 |
| 11 | Audit trail | S10 |
| 12 | Identity and tests (vitest scoping, CI, coverage) | S01 + S03 |
| 13 | Committed `dist/` | S13 |
| 14 | Package README / `.env.example` / CHANGELOG | S14 |
| — | Proxy agent + network-error classifier (R-3) | S11 |
| — | Server doctor module | S12 |

**Consumers cite this ARC by mixed numbering.** ARC-05, ARC-06 and ARC-07 `STORIES.md` refer to "ARC-04 story N" with the *former* README numbers (e.g. ARC-06 "ARC-04 S03: store precedence" = former 3 = **S02**; ARC-07 "story 7 (reload)" = former 7 = **S04**; ARC-01 "story 11 commits `dist/`" = former 13 = **S13**), while ARC-08 already uses the IDs above. Resolve every such reference through this table; the verifiers of those ARCs are asked to rewrite them to `ARC-04-Sxx` form.

---

## Stories

### ARC-04-S01 — D-03 code cut, dependency prune, identity `@farstic/snowarch` 2.0.0, vitest scoping, `npm test` in CI

**As** a maintainer **I want** `packages/snowarch` to contain only the stdio server, its tools, the ServiceNow client, the resources, the utilities and a minimal CLI, under its final name and version, with a green test run on every CI OS **so that** every later ARC-04 story edits a package that already builds, lints and tests clean and carries no surface the owner removed.

**Context.** Closes P-18 (package and bin names belong to third parties; update nag fetches a stranger's package — `mcp:src/cli/index.ts:57-85`), P-19 (version drift across `package.json`, `server.json`, `smithery.yaml`, dashboard HTML), P-28 (HTTP/SSE, dashboard, desktop, `web`), P-29 (`npm test` red — 12 failing `desktop/tests/**` files; CI never runs tests — `mcp:.github/workflows/ci.yml:26-36`), P-31 (26 prompts, 10 Copilot personas). Applies D-01 (names), D-03 (cut list), R-1 (2.0.0). ARC-01-S03 removes the *directories* `desktop/`, `clients/`, `src/direct`, `src/a2a`, `src/dashboard`, `src/reports`, `src/prompts`, `.github/agents`, `Dockerfile`, `server.json`, `smithery.yaml`, `TERMS.md` at import; this story removes what is left inside the surviving tree and makes it compile.

**Scope.** In: delete `src/transport/` (`index.ts`, `http-server.ts`, `auth-middleware.ts`), `src/api/`, `src/cli/writers/`, `src/cli/detect-clients.ts`, `src/cli/auth.ts`, `src/cli/setup.ts`, `src/cli/shortcuts.ts`, `src/cli/config-store.ts`; reduce `src/sdk/index.ts` to a re-export of `ServiceNowClient`, `ServiceNowError` and the types (drop the `executeDirectly` / direct-mode re-exports — D-03 item 3); rewrite `src/cli/index.ts` to the four sub-commands `start`, `instance`, `doctor`, `contract` (the first as today's child-process spawn, the other three as stubs that print `not implemented in this story` and exit 2 — `contract` is filled by S06, `doctor` by S12, `instance` by ARC-07 on top of the store module S02 ships; the `bin` path `packages/snowarch/dist/cli/index.js` is the forwarding target ARC-06/ARC-07's `tools/snowarch` launcher relies on and must not move); delete the `tests/` folders and files of every removed module (`tests/a2a`, `tests/api`, `tests/cli/writers.test.ts`, `tests/writers.test.ts` — both exist today, `mcp:tests/cli/writers.test.ts` and `mcp:tests/writers.test.ts` — `tests/direct`, `tests/reports`, `tests/transport`); remove `pdfmake`, `pptxgenjs`, `@inquirer/prompts`, `ora`, `chalk` from `dependencies`; remove the `npm link` side effect (`mcp:src/cli/setup.ts:235-269` — gone with the file) and the npm update check; `package.json` identity; `vitest.config.ts` scoping; root `npm test` wiring in CI. Out: any behavioural change to tools, the store, flags or the start-up gate (S02–S04); the `.env.example` / README rewrite (S14).

**Design notes.**
- `packages/snowarch/package.json`: `"name": "@farstic/snowarch"`, `"version": "2.0.0"`, `"bin": { "snowarch": "dist/cli/index.js" }`, `"main": "dist/server.js"`, `"exports": { ".": "./dist/server.js", "./sdk": "./dist/sdk/index.js", "./client": "./dist/servicenow/client.js" }`, `"files": ["dist/", ".env.example"]`, `"engines": { "node": ">=20.0.0" }`, `"license": "Apache-2.0"`, `"repository": "github:farstic/ai-servicenow-architect"`, `"homepage"` / `"bugs"` on the same repository. No `mcpName`, no `desktop/` entries in `files`. The old `@farstic/snow-mcp@1.0.0` npm record is never referenced or touched (D-01).
- `src/server.ts`: `new Server({ name: 'snowarch', version: getPackageVersion() }, …)` — the MCP `initialize` name becomes `snowarch`; `getPackageVersion()` (`mcp:src/utils/version.ts`) already resolves `dist/utils/version.js → ../../package.json`, which after ARC-01's version lint equals the root version. Remove the `prompts` capability and the two prompt handlers, the `connectTransport` import and the HTTP branch of `main()`; connect `StdioServerTransport` directly.
- Dependencies after the cut: `@modelcontextprotocol/sdk`, `commander`, `dotenv`, `zod` (+ `undici` added by S11). `npm ci --omit=dev --ignore-scripts` in the package must stay ≤ 80 MB (ARC-01 acceptance criterion); measure and record in the PR.
- `vitest.config.ts` (package): `test.include: ['tests/**/*.test.ts']`, `test.root: __dirname`, `coverage.include: ['src/**']`, `coverage.exclude: ['src/cli/index.ts']`. Root `package.json` `"test": "npm test --workspaces --if-present && node --test tests/"` (ARC-01 owns the root file; this story submits the change).
- CI: the ARC-01 skeleton runs `npm test` on `ubuntu-latest` / `macos-latest` / `windows-latest` × Node 20/22/24 — this story makes it non-placeholder for the package. `tests/setup.ts` keeps presetting `SERVICENOW_INSTANCE_URL` (env-defined instance path survives, S02).
- Remove `tool-rename-map.json` from runtime consideration (it stays in the package root for `tests/tools/parity.test.ts` only; `.npmignore` excludes it).

**Acceptance criteria.**
1. `git ls-files packages/snowarch/src` contains no path under `transport/`, `api/`, `direct/`, `a2a/`, `dashboard/`, `reports/`, `prompts/`, `cli/writers/`, and no `cli/{auth,setup,shortcuts,detect-clients,config-store}.ts`.
2. `npm run type-check`, `npm run lint` and `npm test` pass in `packages/snowarch` on the three CI OSes × Node 20/22/24; zero test files under a `desktop/` path exist; the parity test still counts 394 tools (tool changes are later stories).
3. `node -e "const p=require('./packages/snowarch/package.json');console.log(p.name,p.version,p.license)"` prints `@farstic/snowarch 2.0.0 Apache-2.0` (today: `servicenow-mcp 1.0.0 SEE LICENSE IN LICENSE` — D-02), and `node tests/version-consistency.test.mjs` (ARC-01) passes.
4. `grep -rn "servicenow-mcp\|registry.npmjs.org\|npm link\|smithery\|server.json" packages/snowarch/src packages/snowarch/package.json` returns nothing; `grep -rniE "proprietary|SEE LICENSE IN|\"license\": *\"MIT\"" packages/snowarch --include=*.json --include=*.ts --include=*.md --exclude-dir=node_modules` returns nothing (D-02: no contradictory licence claim survives in the package).
5. `node packages/snowarch/dist/cli/index.js --help` (after a local build) lists exactly `start`, `instance`, `doctor`, `contract`; `node … contract` exits 2 with `not implemented in this story`.
6. `npm ls --omit=dev --depth=0` in the package lists only `@modelcontextprotocol/sdk`, `commander`, `dotenv`, `zod`; `du -sh node_modules` after `npm ci --omit=dev --ignore-scripts` ≤ 80 MB.
7. The MCP `initialize` response (stdio handshake with a placeholder `SERVICENOW_INSTANCE_URL`) reports `serverInfo.name == "snowarch"` and `serverInfo.version == "2.0.0"`.

**Tasks.**
1. Delete the listed source and test files; fix imports in `src/server.ts`, `src/tools/index.ts`, `src/sdk/index.ts`, `src/resources/index.ts`.
2. Rewrite `src/cli/index.ts` (commander, four sub-commands, no banner, no update check); keep the `start` child-process pattern so the CLI never writes to the JSON-RPC stdout.
3. Update `package.json` identity, `bin`, `exports`, `files`, `dependencies`; regenerate the workspace lockfile at the root.
4. Scope `vitest.config.ts`; wire the root `npm test`; confirm CI runs it on nine matrix cells.
5. Add `tests/server/handshake.test.ts`: spawn `dist/server.js`, send `initialize`, assert `serverInfo`.
6. Record the removed surfaces in `CHANGELOG.md` under `## 2.0.0 — Unreleased` (S14 rewrites the file; the list must exist from this story on).

**Test strategy.** Unit: existing suites minus the deleted ones. Integration: stdio handshake test (spawns the built server). CI: nine matrix cells. Manual: none.

**Dependencies.** ARC-01-S03 (import into `packages/snowarch`, directory cut, rename) and ARC-01-S01/S08 (`LICENSE`, headers). D-02 is a hard gate: no code moves before the relicensing statement is committed.

**Size.** L — 3–4 days. ~40 % of the source tree is removed and every surviving import must be re-verified; the CLI is rewritten from scratch; the lockfile and CI need attention on Windows.

**Risks / open points.** `src/sdk` and `src/api` appear both in D-03's survivor sentence and in its cut items (3) and (6); this story keeps `src/sdk` (client re-export only) and removes `src/api` (it imports `../transport/http-server.js` and `../prompts/index.js` — `mcp:src/api/index.ts:14-17` — and cannot exist without the HTTP transport D-03 removes). Recorded in the README correction; the verifier should confirm with the owner if in doubt.

**Definition of done.** Merged; nine CI cells green; `packages/snowarch/CHANGELOG.md` has the removed-surfaces list; `docs/ARCHITECTURE.md` "server package" paragraph names the surviving directories.

---

### ARC-04-S02 — Store module v1: precedence, schema, file-mode check, atomic writes; legacy stores and cwd `dotenv` removed

**As** the server **I want** exactly one configuration store with an explicit, logged precedence and a validated schema **so that** an instance can never be silently overridden, a group-readable secret file is never loaded, and the wizard (ARC-07) and doctor (ARC-08) read and write the same file through the same module.

**Context.** Closes P-21 (four stores — `SN_INSTANCES_CONFIG`, `~/.config/servicenow-mcp/instances.json` returning early and overriding env instances, `SN_INSTANCE_*`, `SERVICENOW_*` — `mcp:src/servicenow/instances.ts:40-170`; `tests/servicenow/instances.test.ts:7-9` documents the override), P-22 (`dotenv.config()` with no path at `mcp:src/server.ts:21` loads the project's `.env` into the server). Implements `01` §5 (last paragraph), §7 and §14; applies D-04 (per-checkout store, 0700/0600, atomic, cloud-sync WARN helper for ARC-07/08).

**Scope.** In: `src/store/paths.ts`, `src/store/schema.ts`, `src/store/index.ts`; `InstanceManager` rewritten on top of it (loading only — flag semantics are S03); removal of `SN_INSTANCES_CONFIG` and the legacy wizard store; `dotenv` only via `SNOW_ENV_FILE`; the env-defined instance path (`SERVICENOW_*`, `SN_INSTANCE_*`) kept for CI and automation and logged; store-path masking helper. Out: preset expansion and per-instance gating (S03); `import --from-legacy` (ARC-07-S08 reads the legacy file through its own reader, never through this module); the OS-keychain backend (roadmap).

**Design notes.**
- **Precedence** (`resolveStorePath()` in `src/store/paths.ts`): (1) `SNOW_STORE` if set and non-empty — `.mcp.json` passes `${SNOW_STORE:-}` (`01` §5), so an empty string must be treated as unset; (2) `<CLAUDE_PROJECT_DIR ?? process.cwd()>/.local/instances.json` (`CLAUDE_PROJECT_DIR` is set in the server's environment by Claude Code — `01` §5 evidence table; empty string treated as unset); (3) global: `~/.config/snowarch/instances.json` on macOS/Linux, `%APPDATA%\snowarch\instances.json` on Windows (`process.env.APPDATA`, falling back to `path.join(os.homedir(), 'AppData', 'Roaming')`). The first path that exists wins; they are never merged. Result object: `{ path, source: 'env' | 'project' | 'global' | 'none', candidates: [{ path, exists }] }`.
- **Env-defined instances** (`SERVICENOW_INSTANCE_URL` or any `SN_INSTANCE_<NAME>_URL`): if present, they are loaded **instead of** any store and the startup log says so: `[INFO] instance source: env (SERVICENOW_*/SN_INSTANCE_*); store ignored: ~/work/x/.local/instances.json`. Their six flags come from `WRITE_ENABLED` … `FLUENT_ENABLED` (byte-exact `"true"`; absent = `"false"`), `MCP_TOOL_PACKAGE`, `MAX_RECORDS`, `SN_INSTANCE_<NAME>_ENVIRONMENT` (default `dev`), `SN_INSTANCE_<NAME>_PROD_WRITE_ACK`. This is the CI / `tests/setup.ts` path and the `--instance-file`-free automation path; it is not a user path.
- **Schema v1** (`src/store/schema.ts`, zod): exactly `01` §7 —
  ```json
  { "version": 1, "defaultInstance": "pdi",
    "instances": { "pdi": {
      "url": "https://dev12345.service-now.com",
      "environment": "pdi",                      // pdi | dev | test | prod
      "auth": { "method": "basic", "username": "…", "password": "…" },
                                                 // or { "method": "oauth_ropc", "clientId", "clientSecret", "username", "password" }
      "preset": "pdi-developer",                 // read-only | pdi-developer | full | custom
      "flags": { "WRITE_ENABLED": "true", "CMDB_WRITE_ENABLED": "true", "SCRIPTING_ENABLED": "true",
                 "ATF_ENABLED": "true", "NOW_ASSIST_ENABLED": "false", "FLUENT_ENABLED": "false" },
      "toolPackage": "full", "maxRecords": 100, "prodWriteAck": false,
      "lastProbe": { "at": "2026-09-04T10:00:00Z", "auth": "ok", "write": "ok", "scripting": "ok", "cmdb": "ok", "atf": "ok", "nowAssist": "not licensed", "fluent": "not installed" }
    } } }
  ```
  `url` must be a bare `https://` origin (no path, no trailing slash); labels match `^[a-z][a-z0-9_-]{0,31}$`; `auth.method` is the enum `["basic", "oauth_ropc"]` (D-04: basic default, OAuth password grant kept as legacy; `client_credentials` is roadmap and is rejected with `STORE_SCHEMA_INVALID: instances.pdi.auth.method must be "basic" or "oauth_ropc"`); `flags` values are the literal strings `"true"` / `"false"` (booleans are rejected with `STORE_SCHEMA_INVALID: instances.pdi.flags.WRITE_ENABLED must be the string "true" or "false"`); fewer than six flags is allowed (absent = `"false"`, WARN `FLAGS_INCOMPLETE` so the doctor can `--fix`); `toolPackage` is the enum `["full"]`; `maxRecords` integer 1–1000, default 100; `lastProbe` optional — its keys are the `01` §7 list plus `fluent` (ARC-07-S03 writes it; schema version stays 1) and the object is declared with `.passthrough()` so a later probe key never invalidates a store. An unknown `version` is refused with `STORE_SCHEMA_UNSUPPORTED: store version 2 is newer than this server (supports 1) — run ./snowarch upgrade`.
- **File-mode check** (POSIX only): if `(stat.mode & 0o077) !== 0` the store is not loaded and the server starts unconfigured (S04) with `configError = { code: 'STORE_PERMISSIONS_TOO_OPEN', message: 'Refusing to load ~/work/x/.local/instances.json: file mode 0644 is group/world-readable. Run: chmod 600 ~/work/x/.local/instances.json' }`; a directory mode with `0o077` bits adds `chmod 700 <dir>`. On Windows the check is skipped and the log says `file modes: ACL-inherited (Windows)` (`01` §13).
- **Atomic write** (`saveStore()`): `mkdirSync(dir, { recursive: true, mode: 0o700 })`, write `<file>.tmp-<pid>-<random>` with `mode: 0o600`, `fsyncSync`, `renameSync` over the target (Node's `fs.renameSync` replaces an existing file on Windows too — proven by this story's `windows-latest` test), re-`chmodSync(0o600)` on POSIX. Callers: the CLI (ARC-07) and the doctor `--fix` (ARC-08). The server itself never writes the store.
- **`dotenv`:** `src/server.ts` runs `dotenv.config({ path: process.env.SNOW_ENV_FILE })` only when `SNOW_ENV_FILE` is set and the file exists; no other `dotenv` call exists in `src/`. `tests/live/live-e2e.test.ts` keeps its own explicit `.env` reader (`mcp:tests/live/live-e2e.test.ts:16-27`) — it is a test, not the server.
- **Removed:** `SN_INSTANCES_CONFIG` (snake_case schema), `~/.config/servicenow-mcp/instances.json` and its `process.env` flag copying (`mcp:src/servicenow/instances.ts:62-112`), `SN_DEFAULT_INSTANCE` is kept for the env path only.
- **Helpers exported for ARC-07/08:** `isUnderCloudSyncFolder(p)` — true when the resolved path contains a segment matching `/^(OneDrive|Dropbox|Google Drive|GoogleDrive|iCloud Drive|Mobile Documents)$/i` or lies under `~/Library/Mobile Documents/` (D-04 WARN obligation lives in the wizard and the doctor; the server only logs `[WARN] store is under a cloud-sync folder (OneDrive); 0600 does not prevent synchronisation`); `maskPath(p)` replaces the home directory prefix with `~` and the checkout prefix with `<checkout>`; `maskUsername('cvetomir@corp.com') → 'c***@corp.com'`.
- **Logging:** the logger reads `SNOW_LOG_LEVEL` first, then `LOG_LEVEL` (the `.mcp.json` of `01` §5 passes `SNOW_LOG_LEVEL`). Startup line (info): `[INFO] snowarch 2.0.0 — store: project (<checkout>/.local/instances.json) — instances: pdi (pdi, pdi-developer, default), prod (prod, read-only) — tools: 398` or `… — store: none (SNOW_STORE unset; <checkout>/.local/instances.json missing; ~/.config/snowarch/instances.json missing) — mode: unconfigured — tools: 5`.

**Acceptance criteria.**
1. Given `SNOW_STORE=/tmp/a.json` (mode 0600, valid v1) and a valid `.local/instances.json` in `CLAUDE_PROJECT_DIR`, when the server starts, then it loads `/tmp/a.json` only and logs `store: env (/tmp/a.json)`; with `SNOW_STORE=""` it loads the project store and logs `store: project (…)`; with neither it loads the global store; with none it logs `mode: unconfigured`.
2. Given `SERVICENOW_INSTANCE_URL` set and a valid project store present, when the server starts, then the env instance `default` is loaded, the store is ignored, and the log contains `instance source: env … store ignored: <masked path>`.
3. Given a project store with mode 0644 on macOS/Linux, when the server starts, then no instance is loaded, `snow_core_status_read` (S04) reports `configErrors[0].code == "STORE_PERMISSIONS_TOO_OPEN"` and the message contains `chmod 600 <path>`; on `windows-latest` the same file loads and the log contains `ACL-inherited`.
4. Given a store whose `flags.WRITE_ENABLED` is boolean `true`, when loaded, then the store is refused with `STORE_SCHEMA_INVALID` naming the path `instances.pdi.flags.WRITE_ENABLED`; given `auth.method: "client_credentials"`, the store is refused with `STORE_SCHEMA_INVALID` naming `instances.pdi.auth.method`; `basic` (username + password) and `oauth_ropc` (clientId + clientSecret + username + password) both load (D-04).
5. Given `saveStore()` is called on a directory that does not exist, then the directory is created 0700, the file is 0600, no `.tmp-*` file remains, and a concurrent reader never observes a partial file (test: 50 interleaved read/write iterations, every read parses).
6. `grep -rn "servicenow-mcp\|SN_INSTANCES_CONFIG" packages/snowarch/src` returns nothing; `grep -rn "cwd\|dotenv.config()" packages/snowarch/src/server.ts` shows only the `SNOW_ENV_FILE` branch (README acceptance criterion).
7. A project `.env` containing `WRITE_ENABLED=true` in `CLAUDE_PROJECT_DIR` has no effect on a server started without `SNOW_ENV_FILE` (test asserts `WRITE_NOT_ENABLED` on a write tool).
8. `isUnderCloudSyncFolder('/Users/x/Library/CloudStorage/OneDrive-Corp/repo/.local/instances.json')` and `'C:\\Users\\x\\OneDrive\\repo\\.local\\instances.json'` return true; `'/Users/x/work/repo/.local/instances.json'` returns false.

**Tasks.**
1. Implement `src/store/paths.ts` (`resolveStorePath`, `maskPath`, `maskUsername`, `isUnderCloudSyncFolder`) with `node:path` only.
2. Implement `src/store/schema.ts` (zod) and `src/store/index.ts` (`loadStore(path)` → `{ store } | { error }`, `saveStore(path, store)`, `checkFileModes(path)`).
3. Rewrite `src/servicenow/instances.ts`: `InstanceManager.load()` returns a `LoadReport { source, path, loaded[], notLoaded[{label, code, message}], configErrors[] }`; env-defined path retained; legacy readers deleted.
4. Replace `dotenv.config()` with the `SNOW_ENV_FILE` branch; rename `LOG_LEVEL` reading to `SNOW_LOG_LEVEL` with fallback.
5. Tests: `tests/store/paths.test.ts`, `tests/store/schema.test.ts`, `tests/store/atomic.test.ts` (POSIX modes skipped on Windows with an explicit `it.skipIf`), rewrite `tests/servicenow/instances.test.ts` for the new precedence.
6. Update `CHANGELOG.md` migration notes: removed `SN_INSTANCES_CONFIG`, legacy store not read, cwd `.env` not read.

**Test strategy.** Unit (paths, schema, modes, atomic rename) on all three OSes; integration (server start with each precedence case, using a temp `CLAUDE_PROJECT_DIR`); no network. Manual: none.

**Dependencies.** S01.

**Size.** L — 3 days. The module is small but it is the foundation three ARCs read and write; the precedence and the Windows path need their own tests.

**Risks / open points.** `CLAUDE_PROJECT_DIR` on native Windows is covered by S-03 (ARC-00); if S-03 fails, ARC-06's fallback writes an absolute `SNOW_STORE` — this module already honours it. Whether the project store should also be consulted when `SNOW_STORE` points to a missing file: decided here as "no — `SNOW_STORE` is explicit; a missing file is `configError STORE_NOT_FOUND`", so a misconfigured override never silently falls back. Later additions by ARC-07 as PRs against `src/store/`: `paths.ts` gains `detectCloudSync()` (ARC-07-S07, built on `isUnderCloudSyncFolder`) and honours `XDG_CONFIG_HOME` for the global store path; `lastProbe` values use ARC-07-S03's vocabulary (`ok` · `role missing` · `not licensed` · `not installed` · `skipped`).

**Definition of done.** Merged; tests green on nine cells; `docs/MODES-AND-PRESETS.md` (ARC-07 owns the final text) receives the precedence paragraph as a draft section; the contract (S06) lists `STORE_PERMISSIONS_TOO_OPEN`, `STORE_SCHEMA_INVALID`, `STORE_SCHEMA_UNSUPPORTED`, `STORE_NOT_FOUND`.

---

### ARC-04-S03 — Per-instance flag evaluation, preset expansion, dependency rule, prod acknowledgement; `permissions.ts` at 100 % coverage

**As** an individual practitioner with a PDI and a customer's production instance in one store **I want** the six permission flags to belong to the instance I am currently addressing **so that** `snow_core_instance_switch prod` immediately makes every write refuse while the same call on `pdi` succeeds, without a second server process.

**Context.** Closes P-03 (absent flag = disabled but still advertised; flags are pure `process.env` checks — `mcp:src/utils/permissions.ts:14-68`) and the process-global half of P-24 (`00` §4.3; `docs/MULTI_INSTANCE.md:182` acknowledges it). Implements `01` §6.3 (presets, dependency rule, byte-exact strings, prod safety rule) and D-05 (prod capped at `read-only`; `prodWriteAck: true` required in the store; `--ack-prod` typing is ARC-07's UX, the refusal is the server's). README risk: "per-instance flag evaluation touches every dispatcher" — mitigated below without touching the ~158 `require*()` call sites.

**Scope.** In: `src/utils/permissions.ts` rewrite; `src/servicenow/context.ts` (AsyncLocalStorage carrier); `InstanceManager` runtime entries with resolved flags; preset table and expansion; dependency rule; prod acknowledgement; `snow_core_instance_switch` semantics; 100 % coverage threshold on `permissions.ts`. Out: which tools call which gate (S05, S06); the wizard's per-flag review screen (ARC-07); the doctor's `--fix` for incomplete flags (ARC-08).

**Design notes.**
- **Carrier.** `src/servicenow/context.ts`: `const als = new AsyncLocalStorage<InstanceRuntime>()`; `runWithInstance(rt, fn)`; `currentInstance(): InstanceRuntime` (throws `ServiceNowError('…', 'NO_INSTANCE_CONFIGURED')` when unset). `src/server.ts` wraps every `CallTool` in `runWithInstance(instanceManager.current(), () => routeToolInvocation(client, name, args))`. `requireWrite()` and its five siblings keep their zero-argument signatures and read `currentInstance().flags` — the dispatchers do not change. `node:async_hooks` `AsyncLocalStorage` is stable since Node 16 and the floor is Node 20.
- **`InstanceRuntime`**: `{ label, url, environment, preset, flags: Flags, effectiveFlags: Flags, toolPackage: 'full', maxRecords, prodWriteAck, client, warnings: string[] }` where `Flags = Record<'WRITE_ENABLED'|'CMDB_WRITE_ENABLED'|'SCRIPTING_ENABLED'|'ATF_ENABLED'|'NOW_ASSIST_ENABLED'|'FLUENT_ENABLED', 'true'|'false'>`.
- **Presets** (`PRESETS` constant, exported for the contract in S06): `read-only` = six `"false"`; `pdi-developer` = WRITE, CMDB_WRITE, SCRIPTING, ATF `"true"`, NOW_ASSIST, FLUENT `"false"`; `full` = six `"true"`; `custom` = the store's `flags` as given. `expandPreset(preset, custom?)` returns six explicit strings; for a non-`custom` preset the store's `flags` object is compared with the expansion and a mismatch is a WARN `PRESET_FLAGS_MISMATCH` (effective = the preset's expansion; the doctor offers to rewrite).
- **Dependency rule** (`applyDependencyRule(flags)`): `SCRIPTING_ENABLED` and `CMDB_WRITE_ENABLED` require `WRITE_ENABLED`. Violation → the dependent flag's *effective* value is `"false"`, a WARN `FLAG_DEPENDENCY_VIOLATION: SCRIPTING_ENABLED=true requires WRITE_ENABLED=true on instance "x" — treated as false` is logged and surfaced in `snow_core_capabilities_read.configWarnings`. Effective flags are what gates read; the store is not modified by the server.
- **Prod rule** (`checkProdPosture(entry)`): `environment === 'prod'` and any effective flag `"true"` and `prodWriteAck !== true` → the instance is **not loaded** (`status: 'not_loaded'`, `code: 'PROD_WRITE_NOT_ACKNOWLEDGED'`) and the log reads `[WARN] instance "prod": environment=prod with preset full but prodWriteAck is not true — not loaded. Raise it deliberately with: ./snowarch instance set-preset prod full --ack-prod (code PROD_WRITE_NOT_ACKNOWLEDGED)`. With `prodWriteAck: true` it loads and the startup line shows `prod (prod, full, prodWriteAck)`. "Anything above `read-only`" is the threshold (`01` §6.3 safety rules), i.e. any of the six flags true.
- **Gate evaluation** (`evaluateGate(gate, mutates, flags): { ok: true } | { ok: false, code, missing[] }`): `none` → ok; `write` → WRITE; `cmdb_write` → WRITE + CMDB_WRITE (code `CMDB_WRITE_NOT_ENABLED` unless WRITE is the missing one, then `WRITE_NOT_ENABLED` — today's order in `requireCmdbWrite`); `scripting` → WRITE + SCRIPTING (same ordering); `atf` → ATF; `now_assist` → NOW_ASSIST; `fluent` → FLUENT, plus WRITE when `mutates`. The `require*()` functions are thin wrappers over `evaluateGate` so the contract test (S06) and the runtime share one implementation.
- **Error messages** carry the remedy with the label: `Write operations are disabled for instance "prod" (preset read-only). Run: ./snowarch instance set-preset prod pdi-developer` and, when `environment === 'prod'`: `Instance "prod" is tagged prod and capped at read-only. Raising it requires: ./snowarch instance set-preset prod <preset> --ack-prod`. Codes unchanged: `WRITE_NOT_ENABLED`, `CMDB_WRITE_NOT_ENABLED`, `SCRIPTING_NOT_ENABLED`, `ATF_NOT_ENABLED`, `NOW_ASSIST_NOT_ENABLED`, `FLUENT_NOT_ENABLED`.
- **Switch**: `snow_core_instance_switch` sets `currentLabel`; the next call runs under that instance's runtime — flags switch with it. Switching to a `not_loaded` instance returns `INSTANCE_NOT_LOADED` with the stored reason. Unknown label → `UNKNOWN_INSTANCE: Unknown instance "uat". Configured: pdi, prod`.
- **`maxRecords`**: `client.queryRecords` default page size comes from the runtime (`currentInstance().maxRecords`, default 100) instead of `process.env.MAX_RECORDS || 10` (`mcp:src/servicenow/client.ts:371-373`); env-defined instances keep `MAX_RECORDS`.
- **Coverage**: `vitest.config.ts` `coverage.thresholds: { 'src/utils/permissions.ts': { lines: 100, functions: 100, branches: 100, statements: 100 } }`; CI runs `vitest run --coverage`.

**Acceptance criteria.**
1. Given a store with `pdi` (`pdi-developer`) and `prod` (`read-only`, `prodWriteAck: false`), when `snow_core_instance_switch {name:"prod"}` is followed by `snow_core_record_add`, then the result is `Error: Write operations are disabled for instance "prod" … (Code: WRITE_NOT_ENABLED)`; when switched back to `pdi` the same call reaches the client (unit: throwing proxy) and succeeds on a PDI (live, `RUN_LIVE_E2E=1`) — README acceptance criterion 2.
2. Given `environment: prod, preset: full, prodWriteAck: false`, when the server starts, then the log contains `PROD_WRITE_NOT_ACKNOWLEDGED`, `snow_core_instances_index` lists the instance with `status: "not_loaded"`, and `snow_core_instance_switch prod` returns `INSTANCE_NOT_LOADED`; with `prodWriteAck: true` the instance loads and writes reach the client — README acceptance criterion 4.
3. Given `preset: custom` with `WRITE_ENABLED: "false", SCRIPTING_ENABLED: "true"`, when loaded, then `effectiveFlags.SCRIPTING_ENABLED == "false"`, the WARN `FLAG_DEPENDENCY_VIOLATION` is logged once, and `snow_scr_script_include_add` returns `WRITE_NOT_ENABLED`.
4. Given `preset: pdi-developer` and a store `flags` object with `FLUENT_ENABLED: "true"`, when loaded, then effective FLUENT is `"false"` and `PRESET_FLAGS_MISMATCH` is reported in `configWarnings`.
5. `expandPreset()` returns, for each of the three named presets, exactly the six strings of the `01` §6.3 table (snapshot test; the same table is emitted into `dist/contract.json` by S06).
6. Two concurrent `CallTool` requests addressed to the process (one after `switch pdi`, one after `switch prod`) each see their own instance's flags (ALS isolation test with `Promise.all`).
7. `vitest run --coverage` reports 100 % lines/branches/functions/statements for `src/utils/permissions.ts`; a deliberately uncovered branch fails CI (README acceptance criterion 7).
8. `WRITE_ENABLED=true` in the server's environment has no effect on a store-defined instance (env flags apply only to env-defined instances).

**Tasks.**
1. Add `src/servicenow/context.ts`; wrap `CallTool` and `ReadResource` handlers in `runWithInstance`.
2. Rewrite `src/utils/permissions.ts`: `FLAG_NAMES`, `PRESETS`, `expandPreset`, `applyDependencyRule`, `checkProdPosture`, `evaluateGate`, `require*` wrappers, `is*Enabled` helpers reading the runtime.
3. Extend `InstanceManager.load()` to build `InstanceRuntime` entries, apply the rules, and classify `not_loaded` instances; extend `listAll()` with `environment`, `preset`, `status`, `reason` (never credentials).
4. Move the `maxRecords` default into the runtime.
5. Tests: rewrite `tests/tools/permissions.test.ts` to the new API with the 100 % threshold; `tests/servicenow/context.test.ts` (ALS isolation); `tests/servicenow/prod-ack.test.ts`; extend `tests/live/live-e2e.test.ts` with the pdi/prod switch case.
6. `CHANGELOG.md`: "flags are per instance; `WRITE_ENABLED` etc. in the environment apply only to env-defined instances; `MAX_RECORDS` default is now 100".

**Test strategy.** Unit with the throwing-proxy client (`mcp:tests/tools/parity.test.ts:13-18` pattern); coverage gate in CI; live E2E for the pdi write behind `RUN_LIVE_E2E=1` (developer machine, not CI). Manual: none.

**Dependencies.** S02.

**Size.** L — 3 days. The rewrite itself is a day; the ALS wrapping, the `not_loaded` state model, the coverage threshold and the tests are the rest.

**Risks / open points.** Resource reads (`servicenow://…`) also need an instance — wrapped the same way. The `snow_na_*` and `snow_fluent_*` families keep their current gate placement here; S05/S06 finalise. The threshold for "prod write posture" (any flag true) is stricter than "WRITE true" and deliberately so; ARC-07's `set-preset --ack-prod` UX must explain that even `custom` with only `ATF_ENABLED` needs the acknowledgement. Later addition by ARC-07-S04 as a PR against `permissions.ts`: `matchPreset(flags)` returns the preset whose expansion equals the six strings, else `custom`.

**Definition of done.** Merged; coverage gate active in CI; `docs/MODES-AND-PRESETS.md` draft section "How the server applies flags" written; contract fields `flags[]`, `presets{}` and `gates{}` sourced from these exports in S06.

---

### ARC-04-S04 — Unconfigured start mode, `NO_INSTANCE_CONFIGURED`, `snow_core_status_read`, `snow_core_capabilities_read`, `snow_core_instances_reload` + `list_changed`

**As** an individual practitioner in design-only mode, or one who has just typed `./snowarch instance add` in another terminal, **I want** the server to start with no instance, describe its own state, and pick up a new store without a Claude Code restart **so that** an unconfigured checkout never shows a crashed MCP server and the `/snowarch setup-instance` `--resume` step (ARC-07) can finish in the same session.

**Context.** Closes the "exit 1 without instance" half of P-21 (`mcp:src/server.ts:23-30`) and the "reload exists but nothing calls it" half of P-27 (`mcp:src/servicenow/instances.ts:209-214`; no `tools/list_changed` ever sent — `00` §4.8). Implements `01` §9 (defence in depth), §6.2 step 8, §14. Spikes: S-17 (unconfigured stdio server accepted as connected) and S-02 (`list_changed` honoured after reload) — both ARC-00; fallbacks are designed in.

**Scope.** In: start-up without instances; the five core tools always advertised; `NO_INSTANCE_CONFIGURED` for everything else; `snow_core_status_read`; `snow_core_capabilities_read`; `snow_core_instances_reload` with `notifications/tools/list_changed`; `capabilities.tools.listChanged: true`. Out: the `/snowarch setup-instance` skill text (ARC-07-S09); doctor consumption of `status_read` (S12/ARC-08).

**Design notes.**
- **Start-up.** `src/server.ts` no longer inspects the environment for URLs and never calls `process.exit(1)` for configuration reasons (only for a transport failure). `instanceManager.load()` runs once at start; its `LoadReport` is retained for `status_read`. `main()` logs the startup line of S02 and connects stdio.
- **Advertised tools.** `ListTools`: when `instanceManager.loadedCount() === 0` → exactly `snow_core_instances_index`, `snow_core_instances_reload`, `snow_core_current_instance_read`, `snow_core_capabilities_read`, `snow_core_status_read`; otherwise the full catalogue (S08 makes it static). `CallTool` for any tool outside the advertised set while unconfigured → `Error: No ServiceNow instance is configured for this checkout. Inside Claude Code run /snowarch setup-instance; in a terminal run ./snowarch instance add <label>. (Code: NO_INSTANCE_CONFIGURED)`. (`UNKNOWN_TOOL` is reserved for names that exist in no configuration.)
- **`snow_core_status_read`** (gate `none`, `mutates: false`; needs no instance): `{ product: "snowarch", version: "2.0.0", mode: "unconfigured" | "configured", store: { source, path: <masked>, candidates: [{ path: <masked>, exists }] }, instances: { loaded: ["pdi"], notLoaded: [{ label: "prod", code: "PROD_WRITE_NOT_ACKNOWLEDGED", message }] }, configErrors: [{ code, message }], configWarnings: [...], toolsAdvertised: 5 | 398, node: process.version, pid, uptimeSeconds, auditFile: <masked> | null }`.
- **`snow_core_capabilities_read`** (gate `none`, `mutates: false`): for the current instance `{ instance: "pdi", url: "https://dev12345.service-now.com", environment: "pdi", preset: "pdi-developer", flags: { six strings }, effectiveFlags: { six strings }, toolPackage: "full", maxRecords: 100, prodWriteAck: false, storePath: <masked>, configError: null, configWarnings: [] }`; when unconfigured `{ instance: null, mode: "unconfigured", remedy: "/snowarch setup-instance" }`. Never a username, never a secret; the doctor (ARC-08) asserts this output equals the store.
- **`snow_core_instances_reload`** (gate `none`, `mutates: false`): re-resolves the store path, reloads, keeps `currentLabel` if it still exists else the store's `defaultInstance`, returns `{ action: "reloaded", source, path: <masked>, loaded, notLoaded, configErrors, toolsAdvertised, listChangedSent: true|false }`; when the advertised set changed (5 ↔ 398) the handler calls `server.sendToolListChanged()` (`@modelcontextprotocol/sdk` `Server.sendToolListChanged()` — `mcp:node_modules/@modelcontextprotocol/sdk/dist/esm/server/index.d.ts:193`) and the server declares `capabilities.tools.listChanged: true`. Claude Code refreshes tools without reconnecting and keeps the previous list on failure (≥ 2.1.214, `01` §5 evidence table); S-02 verifies; the ARC-07 skill prints "run `/mcp` → servicenow → reconnect" if the refresh does not surface.
- **`snow_core_instances_index`** gains `status` / `reason` per instance and `mode`; `snow_core_current_instance_read` returns `{ name: null, mode: "unconfigured" }` when nothing is loaded instead of throwing.
- Resources: `ReadResource` while unconfigured returns the same `NO_INSTANCE_CONFIGURED` error text (not a crash).

**Acceptance criteria.**
1. `node packages/snowarch/dist/server.js` with no store, no `SNOW_STORE`, no `SERVICENOW_*` / `SN_INSTANCE_*` variables and `CLAUDE_PROJECT_DIR` pointing at an empty temp dir: the process stays up, answers `initialize`, `tools/list` returns exactly the five core tools, `snow_core_records_query` returns `NO_INSTANCE_CONFIGURED`, and when the test client closes the transport (stdin EOF) the process exits with code 0 within 5 s (the server handles `StdioServerTransport.onclose` with `process.exit(0)`; no signal is used, because Windows has no `SIGTERM` delivery and a POSIX process killed by `SIGTERM` without a handler reports a signal, not a code) — README acceptance criterion 1 (stdio integration test on all three OSes).
2. In that state `snow_core_status_read` returns `mode: "unconfigured"`, three `candidates` with `exists: false`, `toolsAdvertised: 5`; `snow_core_capabilities_read` returns `instance: null` and `remedy: "/snowarch setup-instance"`.
3. Given the unconfigured server is running, when a valid 0600 store is written to `<CLAUDE_PROJECT_DIR>/.local/instances.json` and `snow_core_instances_reload` is called, then the response has `loaded: ["pdi"]`, `toolsAdvertised: 398`, `listChangedSent: true`, and the test's MCP client receives a `notifications/tools/list_changed` notification followed by a `tools/list` of 398 tools.
4. Given a store with a `PROD_WRITE_NOT_ACKNOWLEDGED` instance and a loaded `pdi`, `snow_core_status_read.instances.notLoaded[0].code == "PROD_WRITE_NOT_ACKNOWLEDGED"` and `toolsAdvertised == 398`.
5. Reload after the store file was deleted returns `loaded: []`, `toolsAdvertised: 5`, `listChangedSent: true`; a subsequent `snow_core_records_query` returns `NO_INSTANCE_CONFIGURED`.
6. The JSON of `snow_core_status_read` and `snow_core_capabilities_read` for a fixture store containing username `fixture.user` and password `Fixture-Secret-1` contains neither string (grep test).
7. Under Claude Code, an unconfigured server shows `✔ connected` in `/mcp` and no error (manual, part of S-17; if S-17 fails, the fallback is to advertise only `snow_core_status_read` and log the reason — the code path is a one-line constant).

**Tasks.**
1. Remove the start-up gate; retain the `LoadReport`; connect stdio; declare `listChanged`; on `transport.onclose` (stdin EOF) flush the audit writer (S10) and `process.exit(0)`.
2. Implement the advertised-set function and the `NO_INSTANCE_CONFIGURED` branch in `CallTool` / `ReadResource`.
3. Implement the three tools in `src/tools/core.ts` with `gate: 'none', mutates: false` (S06 formalises the fields; add them now).
4. Implement `reload()` semantics (path re-resolution, `currentLabel` retention) and the `sendToolListChanged()` call.
5. Tests: `tests/server/unconfigured.test.ts` (stdio, real `dist/server.js` via `tsx` in tests), `tests/tools/core-status.test.ts`, secret-grep test; run under a temp `HOME`/`APPDATA` so the developer's own global store is never read.
6. `CHANGELOG.md`: "the server starts without an instance; `NO_INSTANCE_CONFIGURED`; new core tools".

**Test strategy.** Integration over stdio with the MCP SDK client (`Client` + `StdioClientTransport`) on three OSes; unit for the tools; manual S-17 / S-02 in ARC-00 with this build.

**Dependencies.** S03. ARC-00 S-17 and S-02 verdicts before ARC-06/ARC-07 rely on the behaviour (this story ships either way; the fallbacks are documented strings).

**Size.** L — 3 days. Three new tools, the state model, the notification path, and the stdio integration harness that later stories reuse.

**Risks / open points.** If Claude Code does not honour `list_changed` for stdio servers (S-02 fails), the user experience degrades to one `/mcp` reconnect — accepted in `03`. The `tools/list` size change from 5 to 398 in one notification has not been observed under Claude Code; S-02's procedure should use this exact build.

**Definition of done.** Merged; stdio integration tests green on nine cells; `docs/TROUBLESHOOTING.md` entry for `NO_INSTANCE_CONFIGURED` (generated by ARC-05 from the contract's `errorCodes`, seeded here); README of the package lists the five core tools.

---

### ARC-04-S05 — SCRIPTING / update-set read-gate split

**As** the engine running the Code Reviewer against a live instance in the `read-only` preset **I want** to list and read Script Includes, Business Rules, Client Scripts, ACLs, UI Policies, UI Actions and update sets **so that** review and design work never needs a write flag, and SCRIPTING means what `01` §6.3 says: *writing* those objects.

**Context.** Closes the gate-placement half of P-24: `dispatchScriptAction` calls `requireScripting()` before the `switch`, gating every `snow_scr_*` tool including `_index` / `_read` (`mcp:src/tools/script.ts:389-391`); `snow_us_*` writes call `requireScripting` per case while reads are ungated (`mcp:src/tools/updateset.ts:143-195`). Spike S-10 (ARC-00) checks that `read-only` suffices for the Code Reviewer / Developer read workflows once this lands. README risk R-03 (behaviour change for snow-mcp 1.0.0 users) — CHANGELOG note.

**Scope.** In: `src/tools/script.ts` and `src/tools/updateset.ts` gate placement; description markers; tests. Out: ATF (`*_exec` stays gated `atf`, reads ungated — `mcp:src/tools/atf.ts:140-158`, unchanged); `snow_na_*` (all gated `now_assist`, licence-bound — `mcp:src/tools/now-assist.ts:153-155`, unchanged); Fluent (unchanged here; S08 retires `script_exec`).

**Design notes.**
- Delete the pre-switch `requireScripting()` in `dispatchScriptAction`; add `requireScripting()` as the first statement of each mutating case: `snow_scr_business_rule_add|modify`, `snow_scr_script_include_add|modify`, `snow_scr_client_script_add|modify`, `snow_scr_changeset_commit|publish`, `snow_scr_ui_policy_add`, `snow_scr_ui_action_add|modify`, `snow_scr_acl_add|modify`. Reads stay without a gate: `snow_scr_business_rules_index|business_rule_read`, `script_includes_index|script_include_read`, `client_scripts_index|client_script_read`, `changesets_index|changeset_read`, `ui_policies_index|ui_policy_read`, `ui_actions_index|ui_action_read`, `acls_index|acl_read`.
- `src/tools/updateset.ts`: `snow_us_current_update_set_read`, `snow_us_update_sets_index`, `snow_us_update_set_preview`, `snow_us_update_set_export` (it only reads `sys_update_set` / `sys_update_xml` and returns a summary — `mcp:src/tools/updateset.ts:191-208` — yet today it calls `requireScripting()` at `:193`; that call is removed) are reads with no gate; `snow_us_update_set_add|switch|complete`, `snow_us_active_update_set_ensure` keep `requireScripting()`; `snow_us_capture_target_set` (S07) is `write`.
- Description prefixes normalised: mutating scripting tools begin `[Scripting]`, reads carry no marker; S06's declarations make the marker informational only.
- `SCRIPT_TOOL_NAMES` set (`mcp:src/tools/script.ts:375-382`) stays as the dispatcher's membership test.

**Acceptance criteria.**
1. With the `read-only` preset, `snow_scr_script_includes_index` and `snow_scr_script_include_read` reach the client (unit: throwing proxy records the call; live: return records), while `snow_scr_script_include_add` returns `Error: Scripting operations are disabled for instance "pdi" (preset read-only). Run: ./snowarch instance set-preset pdi pdi-developer (Code: SCRIPTING_NOT_ENABLED)` — README acceptance criterion 3.
2. For every `snow_scr_*` and `snow_us_*` tool, the code thrown with all flags `"false"` equals the table above (parameterised test: reads → `MOCK_CLIENT_CALL`, writes → `SCRIPTING_NOT_ENABLED`); with `WRITE_ENABLED` alone, writes throw `SCRIPTING_NOT_ENABLED`; with `pdi-developer`, all reach the client.
3. `snow_atf_atf_test_exec` / `atf_suite_exec` throw `ATF_NOT_ENABLED` under `pdi-developer` minus ATF and pass under `pdi-developer`; every other `snow_atf_*` tool is ungated (unchanged, asserted).
4. Every `snow_na_*` tool throws `NOW_ASSIST_NOT_ENABLED` under `pdi-developer` (unchanged, asserted).
5. `docs/MODES-AND-PRESETS.md` draft (ARC-02-S09 owns the file; this story submits the edit): the SCRIPTING line reads `*Reading* them is always allowed.` and the parenthetical `(ARC-04 splits the gate; today it blocks reads too)` from `01` §6.3 is gone — `grep -n "today it blocks reads" docs/MODES-AND-PRESETS.md` returns nothing.

**Tasks.**
1. Move the gate in `script.ts`; audit `updateset.ts`; normalise descriptions.
2. Add `tests/tools/gate-split.test.ts` (parameterised over the two families plus the ATF/NOW_ASSIST invariants).
3. `CHANGELOG.md` migration note (R-03): "SCRIPTING no longer gates reads; users relying on SCRIPTING to hide script contents must use a role-restricted account".
4. Run spike S-10 with this build (deferred here by ARC-00-S14 — ARC-00 ends before this code exists): VALIDATION-TESTS T-01…T-18 under `read-only` and `pdi-developer` on a PDI; write the verdict to `docs/spikes/S-10-read-only-sufficiency/README.md` and set the S-10 Status cell in `03` §A.

**Test strategy.** Unit (throwing proxy); live E2E case for `read-only` list/read on a PDI behind `RUN_LIVE_E2E=1`; S-10 manual run by this story (record in `docs/spikes/S-10-read-only-sufficiency/README.md`).

**Dependencies.** S03.

**Size.** M — 1.5 days.

**Risks / open points.** Some `snow_scr_*_read` tools return script bodies; a client who considered SCRIPTING a confidentiality control loses that — R-03 note. Nothing else.

**Definition of done.** Merged; gate-split test green; CHANGELOG note; S-10 verdict recorded (`docs/spikes/S-10-read-only-sufficiency/README.md`; `03` §A Status cell).

---

### ARC-04-S06 — `gate` / `mutates` on every registration; `extract-tools.mjs` emits manifest fields and `dist/contract.json`; `snowarch contract`

**As** the engine (ARC-05's lint and generators) **I want** every tool to declare in code which flag family gates it and whether it mutates the instance, and the server to emit one contract file from those declarations **so that** the §2.1 `ask` list, the §2.2 protocol text and the doctor read tool names, gates and error codes from a generated artefact instead of prose.

**Context.** Closes the server half of P-36 (manifest carries only name/description/inputSchema; tier only in prose) and P-25's "no bundle covers the engine's tools" by pinning `toolPackage: full` in the contract. Implements `01` §11 (contract shape, server test), `01` §5 (permission blocks generated from `mutates`), D-01 (`server.suggestedName: "servicenow"`). ARC-05 depends on this story and S13.

**Scope.** In: `ToolDefinition` type extension; `gate` / `mutates` (and optional `table`) on all registrations; a one-off seeding script and its review; `scripts/extract-tools.mjs` extension; `dist/contract.json`; `snowarch contract [--json] [--sha]`; `tests/contract.test.ts` first form (ARC-05-S08 extends it). Out: `required-tools.json`, the engine lint and the generators (ARC-05).

**Design notes.**
- New file `src/tools/types.ts` (no manifest type exists today — `coreToolManifest()` at `mcp:src/tools/core.ts:21` and its 38 siblings return an inferred array literal): `type Gate = 'none' | 'write' | 'cmdb_write' | 'scripting' | 'atf' | 'now_assist' | 'fluent'`; `interface ToolDefinition { name; description; inputSchema; gate: Gate; mutates: boolean; table?: string }` — `table` is optional and set where the tool's table is fixed (e.g. `snow_scr_business_rule_add` → `sys_script`), consumed by the audit writer (S10); every `*ToolManifest()` is annotated `: ToolDefinition[]`, so a missing field is a TypeScript error.
- **Seeding** (`scripts/seed-declarations.mjs`, run once, committed for reproducibility): for each catalogue tool run it through the throwing-proxy client with all flags `"false"` (the `parity.test.ts` technique) and record the thrown code → `gate` (`MOCK_CLIENT_CALL` → `none`); derive `mutates` from the name suffix set `_add|_modify|_remove|_exec|_set|_ensure|_switch|_complete|_publish|_commit|_trigger|_send|_fire|_approve|_reject|_close|_resolve|_retire|_upload|_assign|_unassign|_import|_export_?|_clone|_rollback|_track|_train|_configure|_schedule|_reconcile|_order|_annotate|_install|_deploy` plus a hand list; print a review table (name, gate, mutates, description marker) and a list of anomalies: `mutates:true` with `gate:'none'`, `[Write]`-marked tools with `gate:'none'`, `_read|_index|_query` names with `mutates:true`. Anomalies are fixed in code in this story (add the missing `requireWrite()`; correct the description) and listed in the PR.
- **`extract-tools.mjs`**: manifest entries gain `gate`, `mutates`, `table`; `EXPECTED` becomes 398 (394 − 0 removed + `snow_core_instances_reload`, `snow_core_capabilities_read`, `snow_core_status_read`, `snow_us_capture_target_set`; the two retired script-execution tools stay registered as `[Unsupported]` stubs — S08); the unique-name and `snow_` prefix guards stay. It additionally writes `dist/contract.json`:
  ```json
  { "contractVersion": 1, "product": "snowarch", "version": "2.0.0",
    "server": { "suggestedName": "servicenow" },
    "flags": [ { "name": "WRITE_ENABLED", "exactString": "true", "absentMeans": false, "requires": [] },
               { "name": "CMDB_WRITE_ENABLED", "exactString": "true", "absentMeans": false, "requires": ["WRITE_ENABLED"] },
               { "name": "SCRIPTING_ENABLED", "exactString": "true", "absentMeans": false, "requires": ["WRITE_ENABLED"] },
               { "name": "ATF_ENABLED", … }, { "name": "NOW_ASSIST_ENABLED", … }, { "name": "FLUENT_ENABLED", … } ],
    "gates": { "none": [], "write": ["WRITE_ENABLED"], "cmdb_write": ["WRITE_ENABLED","CMDB_WRITE_ENABLED"],
               "scripting": ["WRITE_ENABLED","SCRIPTING_ENABLED"], "atf": ["ATF_ENABLED"], "now_assist": ["NOW_ASSIST_ENABLED"],
               "fluent": { "requires": ["FLUENT_ENABLED"], "requiresWriteWhenMutating": true } },
    "errorCodes": [ { "code": "WRITE_NOT_ENABLED", "remedy": "./snowarch instance set-preset <label> <preset>" }, … ,
                    { "code": "NO_INSTANCE_CONFIGURED", "remedy": "/snowarch setup-instance" },
                    { "code": "AUTHENTICATION_FAILED", "remedy": "stop; ./snowarch instance set-credentials <label>" }, … ],
    "tools": [ { "name": "snow_core_records_query", "gate": "none", "mutates": false }, … 398 entries, sorted by name ],
    "presets": { "read-only": {…six strings…}, "pdi-developer": {…}, "full": {…} },
    "protocols": { "updateSetCapture": ["snow_us_active_update_set_ensure", "snow_us_capture_target_set", "<write>", "snow_us_update_set_preview"] },
    "toolPackage": "full", "maxRecordsDefault": 100, "toolCount": 398 }
  ```
  `flags`, `gates` and `presets` are imported from `permissions.ts` exports (S03), never retyped. Output is deterministic (sorted keys where order is not semantic, `\n` line endings, trailing newline) so S13's rebuild-diff is stable.
- **`snowarch contract`**: `--json` prints the file; `--sha` prints `sha256(dist/contract.json)` as 64 hex chars and nothing else (ARC-05's pin and ARC-06's B05 compare against it); no flag prints a summary `contract 1 · snowarch 2.0.0 · 398 tools · sha256 <first 12>`.
- **`tests/contract.test.ts` (first form)**: (a) every catalogue tool with all flags `"false"` throws exactly the code implied by its `gate` (or reaches the client for `none`); (b) with each named preset applied, every tool whose gate is satisfied by the preset reaches the client; (c) every `mutates:true` tool has `gate !== 'none'`; (d) every name matching `_(index|read|query)$` has `mutates:false`; (e) manifest names == contract names == catalogue names, count 398; (f) `tool-rename-map.json` values ⊆ catalogue (parity retained); (g) `contract.flags/gates/presets` deep-equal the `permissions.ts` exports.

**Acceptance criteria.**
1. `tsc` fails if any `ToolDefinition` lacks `gate` or `mutates` (type test: a fixture manifest without `gate` does not compile — `tsd`-style or `// @ts-expect-error` test).
2. `node scripts/extract-tools.mjs` after a build prints `Extracted 398 tools → dist/tools-manifest.json` and `Wrote dist/contract.json (398 tools, sha256 …)`; the contract has `gate` and `mutates` for each tool — README acceptance criterion 8 (with 398 as the post-cut count).
3. `node packages/snowarch/dist/cli/index.js contract --sha` prints exactly 64 hex characters and a newline; running it twice prints the same value; editing one description changes the manifest but not the contract sha (descriptions are not part of the contract), editing one `gate` changes it.
4. `tests/contract.test.ts` (a)–(g) pass; introducing `mutates: true` on a `_read` tool fails (d); changing a `requireScripting()` to `requireWrite()` without changing the declaration fails (a).
5. The anomaly list from the seeding script is empty after this story (test (c)/(d) are the permanent form).
6. `snow_core_records_query` is `gate: none, mutates: false`; `snow_core_record_add` is `write, true`; `snow_scr_script_include_add` is `scripting, true`; `snow_scr_script_include_read` is `none, false`; `snow_atf_atf_test_exec` is `atf, true`; `snow_na_summary_generate` is `now_assist, false`; `snow_core_instance_switch` is `none, false` (session state, not instance state); `snow_us_capture_target_set` is `write, true` (spot-check snapshot).

**Tasks.**
1. Add the type; add fields to the 394 existing registrations by running the seeding script and reviewing its table module by module (39 files under `src/tools/` today, of which `index.ts`, `schema-cache.ts` and `discovery.ts` carry no catalogue tools of their own after S08).
2. Fix every anomaly in code; note each in the PR and in `CHANGELOG.md`.
3. Extend `scripts/extract-tools.mjs`; write the contract serialiser (`src/contract/build.ts`, used by both the script and the CLI).
4. Implement `snowarch contract`.
5. Write `tests/contract.test.ts` (a)–(g); keep `parity.test.ts` for the rename-map bijection.
6. Update `EXPECTED` and the parity test to 398 in the same commit as S04/S07/S08 land the new tools (coordinate the order: S04 added three, S07 adds one; this story pins the constant).

**Test strategy.** Unit (contract test, type test); CI on nine cells; deterministic-output test (two consecutive runs byte-identical).

**Dependencies.** S04 (three new core tools exist), S05 (final gate placement for the scripting families); S07 lands `snow_us_capture_target_set` — if S07 merges after S06, the `EXPECTED` constant is bumped by S07 (say so in both PRs).

**Size.** L — 4 days. 394 registrations reviewed one by one against their code; the seeding script removes the typing but not the judgement.

**Risks / open points.** The name-suffix heuristic misses tools such as `snow_cat_catalog_item_order` or `snow_ntf_emergency_broadcast_send` — the hand list and the review table exist for that. Tools whose mutating nature depends on arguments (`snow_fluent_request_batch`, `snow_core_natural_language_modify`) are declared `mutates: true` (conservative). The contract does not carry descriptions or input schemas (they live in the manifest) so wording changes do not churn the pin.

**Definition of done.** Merged; `dist/contract.json` produced by the build; `docs/ARCHITECTURE.md` "The contract: who generates" paragraph (ARC-05 completes it); ARC-05-S01 can pin the sha.

---

### ARC-04-S07 — `snow_us_capture_target_set`; `snow_us_active_update_set_ensure` with mandatory name and current-user filter

**As** the engine executing §2.2 before a configuration write **I want** one tool that points the authenticated user's REST update-set capture at a named update set, and an ensure tool that never returns somebody else's in-progress set **so that** §2.2 is four generated calls and every created Script Include lands in the intended update set.

**Context.** Closes P-33 (`active_update_set_ensure` picks an arbitrary `state=in progress` set with no user filter — `mcp:src/tools/updateset.ts:210-222`; `grep sys_user_preference src` → descriptions only; the working pattern is a five-call composition in `CLAUDE.md` §2.2). Platform fact relied on: ServiceNow honours `sys_user_preference` `name=sys_update_set` for REST calls (`engine:docs/nowaikit-field-notes.md` §1, confirmed 2026-05-27); `snow_us_update_set_switch` only sets `is_default: true` and does not change REST capture (same note). Implements `01` §11 last paragraph and `01` §14.

**Scope.** In: the new tool; the changed ensure tool; description note on `snow_us_update_set_switch`; unit tests with a recorded REST fixture; live E2E. Out: the generated §2.2 text (ARC-05-S05); the wizard's `sys_update_set` probe (ARC-07).

**Design notes.**
- **`snow_us_capture_target_set`** — `gate: 'write'`, `mutates: true`, `table: 'sys_user_preference'`. Input `{ update_set_sys_id: string }` (required; `INVALID_REQUEST: update_set_sys_id is required`). Steps: (1) `GET sys_update_set/<sys_id>` fields `sys_id,name,state,application` → `NOT_FOUND` if absent, `INVALID_REQUEST: update set "<name>" is not in progress (state=complete)` if not `in progress`; (2) resolve the authenticated user: `GET sys_user?sysparm_query=user_name=<username>&sysparm_fields=sys_id,user_name` where `<username>` is the instance's basic or ROPC username (`INSUFFICIENT_PRIVILEGES` mapping if the account cannot read `sys_user`); (3) `GET sys_user_preference?sysparm_query=user=<user_sys_id>^name=sys_update_set`; (4) `PATCH` the preference `{ value: <update_set_sys_id> }` or `POST { user, name: 'sys_update_set', value, type: 'string' }`; (5) return `{ action: 'updated' | 'created', preference_sys_id, user_sys_id, update_set: { sys_id, name, application }, verify_with: 'snow_us_update_set_preview' }`. The username is never included in the response.
- **`snow_us_active_update_set_ensure`** — `gate: 'scripting'`, `mutates: true`, `table: 'sys_update_set'`. Input `{ name: string, description?: string }` (`name` required — `INVALID_REQUEST: name is required; pass the update set name the engagement uses, e.g. "ENG-123 story 4"`). Query `sys_update_set` with `name=<name>^state=in progress^sys_created_by=<username>` (`sys_created_by` holds the `user_name` string); found → `{ action: 'existing_found', update_set: { sys_id, name } }`; else create `{ name, description, state: 'in progress' }` (no `is_default`) → `{ action: 'created', update_set }`. Both responses end with `next: 'snow_us_capture_target_set { update_set_sys_id }'`.
- **`snow_us_update_set_switch`** description becomes `[Scripting] Mark an update set as the default for the UI (is_default). Does NOT change what REST writes are captured into — use snow_us_capture_target_set.`
- Contract `protocols.updateSetCapture` = `["snow_us_active_update_set_ensure", "snow_us_capture_target_set", "<write>", "snow_us_update_set_preview"]` (S06).

**Acceptance criteria.**
1. Unit (fake REST layer recording requests): `snow_us_capture_target_set` with an existing preference issues exactly `GET sys_update_set`, `GET sys_user`, `GET sys_user_preference`, `PATCH sys_user_preference/<id>` and returns `action: "updated"`; with no preference it issues `POST sys_user_preference` with `{ user, name: "sys_update_set", value, type: "string" }` and returns `action: "created"`.
2. Unit: a `complete` update set is refused with `INVALID_REQUEST` and no preference request is made.
3. Unit: `snow_us_active_update_set_ensure` without `name` returns `INVALID_REQUEST`; with a name, the query string sent contains `sys_created_by=<username>` and `name=<name>`; another user's in-progress set with the same name is not returned (fixture has two rows, one foreign).
4. Live (`RUN_LIVE_E2E=1`, PDI): `ensure {name:"[LIVE E2E] capture"}` → `capture_target_set` → `snow_scr_script_include_add` → `snow_us_update_set_preview` shows a `sys_update_xml` row whose `name` contains the Script Include name; teardown deletes the Script Include and completes the update set (`sys_update_xml` DELETE rows are expected — field-notes §7) — README acceptance criterion 6.
5. Responses of both tools, serialised, contain no username (grep against the fixture username).
6. `snow_us_capture_target_set` under `read-only` returns `WRITE_NOT_ENABLED`; `ensure` under WRITE-only returns `SCRIPTING_NOT_ENABLED`.

**Tasks.**
1. Add a minimal `FakeRestClient` test helper (`tests/helpers/fake-rest.ts`) that records calls and serves fixtures — reused by S09.
2. Implement the two tools in `src/tools/updateset.ts`; update the switch description.
3. Tests (unit + live case).
4. Add the tool to the manifest/contract (bump `EXPECTED` if S06 is already merged).
5. `CHANGELOG.md`: "§2.2 is now `ensure → capture_target_set → write → preview`; `snow_us_active_update_set_ensure` requires `name` and filters by the current user".

**Test strategy.** Unit with the fake REST layer; live E2E on a PDI (developer machine); none of it in CI touches the network.

**Dependencies.** S05 (gate placement), S06 (declarations; either order with an `EXPECTED` bump).

**Size.** M — 1.5 days.

**Risks / open points.** Accounts without read on `sys_user` (rare for a PDI admin, plausible on a client instance) cannot resolve their own sys_id — the error names the missing table and the ARC-07 probe list gains `sys_user_preference` write. ROPC's `username` is the token owner's, which is the capturing user; documented in the tool description.

**Definition of done.** Merged; live case documented in `tests/live/README.md` (new file — today `tests/live/` holds only `live-e2e.test.ts`); contract protocol updated; ARC-05 generator consumes it.

---

### ARC-04-S08 — Retire dead script-execution endpoints; remove undeclared per-call `instance` routing and runtime-generated tools; result-size cap

**As** the engine **I want** every advertised tool to either work or fail with a clear, immediate `UNSUPPORTED_ON_THIS_INSTANCE`, the tool list to be static and equal to the contract, and large query results to be bounded **so that** no builder wastes a turn on a 404, no phantom tool appears, and the first live session cannot blow Claude Code's MCP output cap.

**Context.** Closes P-26's dead endpoints (`snow_deploy_background_script_exec` → `POST /api/now/sp/background_script` returns 404 on PDI — `mcp:src/tools/deployment.ts:143-151`; `snow_fluent_script_exec` → `/api/now/v1/batch` wrapping `sys_script_execution` returns 400 — `mcp:src/servicenow/client.ts:1151-1176`; `engine:docs/nowaikit-field-notes.md` §2), P-27 (`args.instance` routed at `mcp:src/server.ts:68-69` while zero `inputSchema`s declare it; `schemaCache.getGeneratedTools()` appended at `mcp:src/tools/index.ts:276-286` with no `list_changed` and a `CallTool` array captured at `createServer()`), and R-05 (25,000-token cap; `_meta["anthropic/maxResultSizeChars"]` considered). Roadmap `01` §17 item 6 keeps a *declared* `instance` argument as a later option.

**Scope.** In: the two stubs; deletion of `client.executeScript()` and the `callNowAssist('/api/now/sp/background_script')` path; removal of `args.instance` routing; `snow_disco_table_discover` returns schema data; `schema-cache.ts` reduced to a column cache; static catalogue; result-size cap on `snow_core_records_query` (and the shared `queryRecords` envelope). Out: implementing a working script-execution endpoint (none exists on PDI; the stub's message points to the UI); a general per-tool truncation policy beyond the query envelope.

**Design notes.**
- **Stubs.** Both tools stay registered (the engine cites both — `00` §8 — and ARC-05's `required-tools.json` lists them) with description `[Unsupported] …: no working endpoint exists on PDI; run the script in System Definition > Scripts - Background`, `gate: 'scripting'`, `mutates: true`; the handler throws `ServiceNowError('Server-side script execution has no supported REST endpoint on this instance. Run the script in System Definition > Scripts - Background, or author it as a Fix Script (sys_script_fix) and run it from the UI.', 'UNSUPPORTED_ON_THIS_INSTANCE')` **before** any HTTP call. `client.executeScript` and the batch wrapper are deleted; `callNowAssist` stays for the `snow_na_*` family.
- **Instance routing.** `src/server.ts` resolves the client only from `instanceManager.current()`; a caller passing `instance` in `arguments` gets it ignored (no schema declares it). The `README.md` of the package documents `snow_core_instance_switch` as the only way.
- **Discovery.** `snow_disco_table_discover { table }` returns `{ table, source: 'instance' | 'cache', columns: [{ element, internal_type, label, max_length, mandatory, reference, read_only, default_value }], cache_expires_in_minutes }`; `available_tools` and `generatedToolNames` are removed; `schemaCache.set(table, columns)`; `collectToolCatalog()` returns `ALL_TOOLS` filtered only by `MCP_TOOL_PACKAGE`; `ALL_TOOLS` is computed once at module load; `createServer()` and `ListTools` use the same array.
- **Result-size cap.** In `CallTool`, after serialising the result: if `request.params._meta?.['anthropic/maxResultSizeChars']` is a positive number use it, else `SNOW_MAX_RESULT_CHARS` (default `100000` ≈ 25,000 tokens, `00` §8). If the JSON exceeds the cap and the tool is `snow_core_records_query` (or any tool whose result has a `records` array), drop records from the end until it fits and add `{ truncated: true, returned: n, total_fetched: m, hint: 'reduce limit or pass fields to narrow the columns' }`; for any other tool, return the first cap characters with a trailing `… [truncated at <cap> chars]`. Whether Claude Code supplies `_meta["anthropic/maxResultSizeChars"]` is not evidenced in `00`/`01`; the code treats it as an optional client hint and the default cap carries the guarantee.

**Acceptance criteria.**
1. With a recording fake client, calling `snow_deploy_background_script_exec` and `snow_fluent_script_exec` under `full` returns `UNSUPPORTED_ON_THIS_INSTANCE` and zero HTTP requests are recorded; under `read-only` they return `SCRIPTING_NOT_ENABLED` (gate first).
2. `grep -rn "sys_script_execution\|background_script\|executeScript" packages/snowarch/src` returns only the stub messages.
3. `tools/list` before and after `snow_disco_table_discover incident` is byte-identical (398 tools); the discover response contains a `columns` array with at least `number`, `short_description`, `state` for `incident` (live) or the fixture columns (unit).
4. `CallTool snow_core_records_query { table: "incident", instance: "prod" }` is served by the current instance (unit: the recorded base URL is the current instance's) and the response contains no error about `instance`.
5. Given a fake `queryRecords` returning 100 records of 3,000 chars each and `_meta["anthropic/maxResultSizeChars"] = 50000`, the response JSON is ≤ 50,000 chars, `truncated: true`, `returned` < 100; without `_meta` and with `SNOW_MAX_RESULT_CHARS=100000` the same holds at 100,000; a small result carries no `truncated` key.
6. `grep -n "args.instance\|\['instance'\]" packages/snowarch/src/server.ts` returns nothing.

**Tasks.**
1. Replace the two handlers with stubs; delete `executeScript` and the `/api/now/sp/background_script` branch; update descriptions.
2. Remove `args.instance` routing; document the switch tool.
3. Rewrite `discovery.ts` / `schema-cache.ts`; freeze `ALL_TOOLS`; remove `getGeneratedTools()`.
4. Implement the cap in `src/server.ts` (`src/utils/result-size.ts`, unit-tested in isolation).
5. Tests: `tests/tools/unsupported-stubs.test.ts`, `tests/tools/discovery.test.ts` rewrite, `tests/utils/result-size.test.ts`, server test for `args.instance`.
6. `CHANGELOG.md`: retired endpoints, removed `instance` argument (roadmap note), discovery no longer generates tools, result cap.

**Test strategy.** Unit; stdio integration for the static list; live check of `table_discover` behind `RUN_LIVE_E2E=1`.

**Dependencies.** S04 (static list interacts with the unconfigured/configured advertised sets), S06 (declarations on the stubs).

**Size.** M — 2 days.

**Risks / open points.** Removing the generated tools changes nothing for clients (they were never announced — `00` §4.8) but `tests/tools/discovery.test.ts` today asserts their presence and must be rewritten. The cap's record-dropping is only applied to `records`-shaped results; aggregate tools with a single huge object fall back to character truncation, which may cut JSON mid-structure — the trailing marker makes it obvious; ARC-05's troubleshooting entry explains.

**Definition of done.** Merged; tests green; `docs/TROUBLESHOOTING.md` entry for `UNSUPPORTED_ON_THIS_INSTANCE` seeded in the contract `errorCodes`; `docs/PLATFORM-NOTES.md` (ARC-02) keeps the "no background-script endpoint on PDI" platform fact, the server side is now a test.

---

### ARC-04-S09 — Defect fixes with regression tests: `ORDERBYDESC`, `event_name`, `action_insert` / `action_update`

**As** the engine **I want** descending sorts, event registrations and business rules created through the server to behave as the ServiceNow platform requires **so that** the three documented workarounds (`engine:SETUP.md:154`, field-notes §4, §5) disappear and cannot regress.

**Context.** Closes P-26 (defects) — `00` §4.8 table: descending sort is built as `ORDERBY<field>^ORDERBYDESC` (`mcp:src/servicenow/client.ts:384-388`) where the platform's encoded form is `ORDERBYDESC<field>` (`engine:ServiceNowDocs/markdown/api-reference/GlideListClientAPINEx.md:191` — `^ORDERBYDESCpriority`); `snow_intg_event_register` writes only `name`, `table`, `description` (`mcp:src/tools/integration.ts:428-438`), leaving `event_name` empty so the notification engine cannot match the event (field-notes §4); `snow_scr_business_rule_add` sends `name, collection, when, script, condition, active, order` (`mcp:src/tools/script.ts:405-411`) and never `action_insert` / `action_update`, so the rule never fires (field-notes §5). ARC-02-S10 hands these three field-note sections over as regression-test titles.

**Scope.** In: the three fixes, their unit tests with captured request bodies, live E2E cases. Out: any other tool's payload completeness (tracked as follow-ups in `CHANGELOG.md` "Known gaps" if found during testing).

**Design notes.**
- **Sort.** `client.queryRecords`: `orderBy: '-sys_created_on'` → append `^ORDERBYDESCsys_created_on` (or `ORDERBYDESCsys_created_on` when there is no query); ascending unchanged. Multiple fields (`'-priority,sys_created_on'`) are supported by joining each term. The `servicenow://query-syntax` resource text is corrected to the same grammar.
- **Event registration.** `snow_intg_event_register { name, table, description?, fired_by? }` writes `{ event_name: name, table, description, suffix: name.split('.').slice(1).join('.'), fired_by }` — `event_name` is the matching key; `suffix` follows field-notes §4's convention (everything after the first dot segment); the response echoes `event_name`. The `sysevent_register` `name` column is not set explicitly (the platform derives `sys_name`); the test asserts `event_name` is present in the POST body.
- **Business rule.** `snow_scr_business_rule_add` input gains `action_insert?: boolean` (default `true`), `action_update?: boolean` (default `true`), `action_delete?: boolean` (default `false`), `action_query?: boolean` (default `false`); the payload always includes all four as booleans; the description states the defaults. `snow_scr_business_rule_modify` passes `fields` through unchanged (already does).

**Acceptance criteria.**
1. Unit: `queryRecords({ table: 'incident', orderBy: '-sys_created_on' })` sends `sysparm_query=ORDERBYDESCsys_created_on`; with `query: 'active=true'` sends `active=true^ORDERBYDESCsys_created_on`; `orderBy: 'number'` sends `ORDERBYnumber` — README acceptance criterion 5 (unit half).
2. Live (`RUN_LIVE_E2E=1`): `snow_core_records_query { table: "incident", orderBy: "-sys_created_on", limit: 5 }` returns records whose `sys_created_on` values are non-increasing — README acceptance criterion 5 (live half).
3. Unit: `snow_intg_event_register { name: "duplicate.incident.detected", table: "incident" }` POSTs a body with `event_name: "duplicate.incident.detected"` and `suffix: "incident.detected"`; live: the created `sysevent_register` row read back has a non-empty `event_name` (teardown deletes it).
4. Unit: `snow_scr_business_rule_add` with no action arguments POSTs `action_insert: true, action_update: true, action_delete: false, action_query: false`; with `action_update: false` the body reflects it; live: the created `sys_script` row read back has `action_insert == "true"` (teardown deletes it, inside a `[LIVE E2E]` update set per S07).
5. No workaround text survives in the package: `grep -rniE "ORDERBY[a-z_]+\^ORDERBYDESC|orderBy has been used instead|newest is years old" packages/snowarch/README.md packages/snowarch/src/resources` returns nothing, and the `servicenow://query-syntax` resource text shows `^ORDERBYDESC<field>` as the descending form (the operator workaround at `engine:SETUP.md:154` is retired by ARC-02's docs rewrite once this fix ships — this story hands ARC-02 the sentence to delete).

**Tasks.**
1. Fix `client.ts` sort building; update the query-syntax resource.
2. Fix the two payloads; extend the business-rule input schema.
3. Tests: `tests/servicenow/client-orderby.test.ts` (captured URL), `tests/tools/integration-event.test.ts`, `tests/tools/script-business-rule.test.ts` using the S07 `FakeRestClient`; live cases appended to `tests/live/live-e2e.test.ts`.
4. `CHANGELOG.md` "Fixed" entries naming the three field-note sections.

**Test strategy.** Unit with recorded requests; live E2E on a PDI outside CI.

**Dependencies.** S01 (harness); S07's fake REST helper (or land the helper here if S09 goes first — either PR carries it).

**Size.** M — 1.5 days.

**Risks / open points.** `suffix` semantics for single-segment event names (no dot) → empty string; acceptable and matches the UI behaviour. No other open points.

**Definition of done.** Merged; three regression tests green; `CHANGELOG.md` Fixed section; the corresponding field-note sections are marked "fixed in 2.0.0" by ARC-02's split.

---

### ARC-04-S10 — Audit trail writer with rotation; redaction defaults; Authorization header never logged

**As** a consultancy security reviewer **I want** every mutating call the engine makes against a client instance to leave one secret-free line in a file inside the checkout **so that** "write approved" (§2.1) is provable after the fact, and nothing the server logs can leak a credential.

**Context.** Closes P-35 (no audit trail beyond prose). Implements `01` §7 "Audit trail" (JSON lines, rotation at 10 MB, never payloads or credentials) and `01` §7 "How never leaked" (`REDACT_SENSITIVE_DATA` default on; Authorization header never logged). Today `REDACT_SENSITIVE_DATA` is opt-in (`mcp:src/utils/logging.ts:36` — `=== 'true'`) and the logger's `SENSITIVE_KEY` regex only scrubs object keys, not header strings.

**Scope.** In: `src/audit/writer.ts`; hook in `CallTool` for `mutates: true` tools; rotation; redaction default; a request-log guard for `Authorization`; `SNOW_AUDIT_FILE` override; `snowarch audit tail` is ARC-07/08's CLI surface — this story exposes `readAuditTail(n)` from the module. Out: shipping audit lines anywhere else; per-user audit on shared instances (Q-A: roadmap).

**Design notes.**
- **Location.** `<store dir>/audit.jsonl` where store dir is the directory of the store in use (`<checkout>/.local/` for the project store, `~/.config/snowarch/` for the global store); for env-defined instances `<CLAUDE_PROJECT_DIR ?? cwd>/.local/audit.jsonl`; `SNOW_AUDIT_FILE` overrides; `SNOW_AUDIT_FILE=off` disables (logged once at startup as `[WARN] audit trail disabled`). The file is created 0600 in a 0700 directory (S02's helpers).
- **Line shape.** `{"ts":"2026-09-04T10:22:31.412Z","instance":"pdi","environment":"pdi","tool":"snow_core_record_add","gate":"write","table":"incident","sysId":"a1b2…"|null,"query":"active=true^…"|null,"result":"ok"|"WRITE_NOT_ENABLED"|"API_ERROR","ms":312}` — `table` from `args.table ?? tool.table ?? null`; `sysId` from `args.sys_id ?? result.sys_id ?? null`; `query` from `args.query ?? args.sysparm_query ?? null` (a query is a filter, not a payload); **never** `args.fields`, `args.data`, `args.script`, `args.payload`, `args.record`, or any response body. Refused calls (`*_NOT_ENABLED`, `NO_INSTANCE_CONFIGURED`) are also written with their code — an attempted write is audit-relevant.
- **Writer.** Synchronous `appendFileSync` per line (writes are rare; durability beats throughput); at start of each append, if `statSync(file).size >= 10 * 1024 * 1024` rotate `audit.jsonl → audit.jsonl.1` (shifting `.1 → .2`, keeping three) before writing. A write failure (read-only filesystem) is logged once as `[WARN] audit trail unavailable: <reason>` and never fails the tool call.
- **Exported API.** `appendAudit(entry)` and `tailAudit(n)` are exported from `src/audit/writer.ts` and through the package `exports` map (`@farstic/snowarch/audit`) so that ARC-07-S06 can append CLI audit lines (`set-preset --ack-prod`, `set-credentials`, `remove`) with `source: "cli"`; MCP calls carry `source: "mcp"`.
- **Redaction.** `REDACT_SENSITIVE_DATA` defaults **on** (`!== 'false'`); the logger additionally redacts string values matching `/^(Basic|Bearer)\s+\S+/i` anywhere in logged data, and `client.ts` never passes `options.headers` to the logger (today `logger.info` is called with the table name only — `mcp:src/servicenow/client.ts:398`; the guard is a unit test that instruments the logger and asserts no header ever reaches it, plus a lint rule forbidding `logger.*(…, { headers` in `src/servicenow/`).
- `readAuditTail(n = 50)` returns the last n parsed lines (for ARC-07/08's `snowarch audit tail`).

**Acceptance criteria.**
1. Given a loaded `pdi` under `pdi-developer` and a fake client, when `snow_core_record_add { table: "incident", data: { short_description: "SECRET-PAYLOAD-MARKER" } }` runs, then `<store dir>/audit.jsonl` gains exactly one line whose JSON parses to `tool == "snow_core_record_add"`, `table == "incident"`, `result == "ok"`, and the file does not contain `SECRET-PAYLOAD-MARKER`.
2. Given `read-only`, the same call appends one line with `result == "WRITE_NOT_ENABLED"`; `snow_core_records_query` (mutates false) appends nothing.
3. After 200 appends of a 60 KB fixture line (forcing > 10 MB), `audit.jsonl.1` exists, `audit.jsonl` is smaller than 10 MB, and every line in both files parses.
4. A fixture run with password `Fixture-Secret-1` and username `fixture.user` across all tools of the contract test (S06 (a) loop with `mutates: true` under `full`, fake client) leaves an audit file and a captured stderr log that contain neither string nor the substring `Basic ` followed by base64 — README acceptance criterion 9 (grep test).
5. With `REDACT_SENSITIVE_DATA` unset, `logger.info('x', { password: 'p', headers: { Authorization: 'Basic abc' } })` prints `***` for both; with `REDACT_SENSITIVE_DATA=false` the values print (explicit opt-out retained for local debugging, documented as dangerous).
6. With `SNOW_AUDIT_FILE` pointing into a read-only directory, tool calls still succeed and stderr contains `audit trail unavailable` exactly once.
7. On Windows the audit file is written and rotated (mode bits skipped with the ACL note).

**Tasks.**
1. Implement `src/audit/writer.ts` (path resolution via S02 helpers, append, rotate, tail).
2. Hook into `CallTool` (after the tool resolves its declaration, around the invocation, timing with `performance.now()`).
3. Flip the redaction default; add the header-string redaction; add the lint rule.
4. Tests: `tests/audit/writer.test.ts`, `tests/audit/no-secrets.test.ts` (grep across audit + captured stderr), `tests/utils/logging.test.ts` extension.
5. Document the line shape in the package README (S14) and seed `docs/ARCHITECTURE.md` "Audit trail" paragraph.

**Test strategy.** Unit on three OSes (rotation uses real files in a temp dir); the no-secrets grep runs in CI.

**Dependencies.** S02 (store dir, mode helpers), S06 (`mutates`, `table` declarations).

**Size.** M — 1.5 days.

**Risks / open points.** `query` strings may contain personal data (`caller_id=…`) — accepted: they are filters the engine already had in its transcript; the README says so. Audit lines carry the instance label, not the URL.

**Definition of done.** Merged; no-secrets test in CI; contract `errorCodes` unchanged; `01` §7 audit paragraph holds true of the code.

---

### ARC-04-S11 — Proxy agent honouring `HTTPS_PROXY` / `HTTP_PROXY` / `NO_PROXY`; documented `NODE_EXTRA_CA_CERTS`; network-error classifier (R-3)

**As** an individual practitioner on a corporate laptop behind an HTTP proxy and a TLS-intercepting gateway **I want** the server's HTTP client to use my proxy settings and my company root CA, and to tell me by name whether a failure is DNS, TLS trust or the proxy **so that** a first live session does not fail with a bare `fetch failed`.

**Context.** R-3 (owner ruling 2026-09-04): "ARC-04 — proxy agent honouring `HTTPS_PROXY` / `NO_PROXY` + documented `NODE_EXTRA_CA_CERTS`". `03` R-15: Node's built-in `fetch` (undici) ignores `HTTPS_PROXY` / `NO_PROXY` unless a proxy agent is configured; custom CAs need `NODE_EXTRA_CA_CERTS`. The surviving code calls the global `fetch` in three places (`mcp:src/servicenow/client.ts:144, 241, 1051`). ARC-07's wizard probe and ARC-08's doctor consume this story's classifier.

**Scope.** In: `undici` runtime dependency; `src/servicenow/http.ts` (one `fetch` wrapper with an `EnvHttpProxyAgent` dispatcher); replacement of the three call sites; `src/servicenow/net-errors.ts` (`classifyNetworkError`); empty-string sanitisation of proxy / CA variables; documentation of `NODE_EXTRA_CA_CERTS`; `.mcp.json` pass-through recommendation for ARC-06. Out: authenticated proxies beyond what the URL carries (`http://user:pass@proxy:8080` works by URL, documented); PAC files; the wizard's remedy text (ARC-07-S02) and the doctor check (ARC-08).

**Design notes.**
- **Agent.** `import { fetch as undiciFetch, EnvHttpProxyAgent } from 'undici'`; `const dispatcher = new EnvHttpProxyAgent()` (reads `HTTP_PROXY`, `HTTPS_PROXY`, `NO_PROXY` and their lowercase forms at construction); `export function snFetch(url, init) { return undiciFetch(url, { ...init, dispatcher }) }`. The `undici` package is the same implementation Node bundles, published separately; the dispatcher must be paired with `undici`'s own `fetch`, not the global one, because a dispatcher from a different undici build is rejected by the global `fetch`. Pin the `undici` major that ships `EnvHttpProxyAgent` (6.10+); verify the exact version at implementation time and record it in the lockfile. **Unverified library claims (not evidenced in `00`/`01`/`03`, to be proven by this story's own fixture tests before merge):** that `EnvHttpProxyAgent` exists in the pinned `undici` release and honours `NO_PROXY`, and that the global `fetch` rejects a dispatcher from a separately installed `undici`. If either fails, the fallback is a hand-built `ProxyAgent(process.env.HTTPS_PROXY ?? process.env.HTTP_PROXY)` with an explicit `NO_PROXY` host-suffix match in `http.ts` — the acceptance criteria below are unchanged.
- **Sanitisation.** At start-up, for each of `HTTP_PROXY`, `HTTPS_PROXY`, `NO_PROXY`, `NODE_EXTRA_CA_CERTS` (and lowercase): if the value is the empty string, `delete process.env[k]` before the agent is constructed (ARC-06's `.mcp.json` may forward them as `${HTTPS_PROXY:-}`; an empty string must mean unset). `NODE_EXTRA_CA_CERTS` is read by Node itself at process start; an empty value is ignored by Node — this story adds a test that starts the server with `NODE_EXTRA_CA_CERTS=""` and asserts no warning on stderr.
- **Classifier.** `classifyNetworkError(err): { code, cause, remedy }` from the undici/Node error cause codes: `ENOTFOUND` / `EAI_AGAIN` → `DNS_FAILURE` ("check the instance host name; if you are on a corporate network, set HTTPS_PROXY"); `UNABLE_TO_VERIFY_LEAF_SIGNATURE`, `SELF_SIGNED_CERT_IN_CHAIN`, `DEPTH_ZERO_SELF_SIGNED_CERT`, `UNABLE_TO_GET_ISSUER_CERT_LOCALLY`, `CERT_HAS_EXPIRED` → `TLS_CA_UNTRUSTED` ("your network intercepts TLS; export the corporate root certificate as PEM and set NODE_EXTRA_CA_CERTS=/path/to/corp-root.pem before starting Claude Code"); `ECONNREFUSED` / `ECONNRESET` / `EHOSTUNREACH` when a proxy is configured → `PROXY_UNREACHABLE` ("HTTPS_PROXY=<masked host:port> is set but not reachable"); the same codes without a proxy → `CONNECTION_REFUSED`; `UND_ERR_CONNECT_TIMEOUT` / `ETIMEDOUT` / abort → `NETWORK_TIMEOUT`; HTTP 407 → `PROXY_AUTH_REQUIRED`. `client.request()` maps a thrown `TypeError: fetch failed` through the classifier so tool errors read `Error: <remedy> (Code: TLS_CA_UNTRUSTED)` instead of `fetch failed`. Proxy URLs are masked in every message (`http://***@proxy.corp:8080`).
- **Docs.** `packages/snowarch/README.md` section "Corporate networks": the four variables, the PEM export hint per OS (macOS Keychain Access → export `.cer` → `openssl x509 -inform der -outform pem`; Windows `certmgr.msc` → Base-64 X.509), the `.mcp.json` pass-through note (ARC-06 decides whether to forward or rely on inheritance — see risks).

**Acceptance criteria.**
1. Given a local HTTP CONNECT proxy fixture (test starts one on `127.0.0.1:<port>` with `node:http`) and `HTTPS_PROXY=http://127.0.0.1:<port>`, when the client requests `https://example.invalid/api/now/table/sys_user`, then the proxy fixture records a `CONNECT example.invalid:443`; with `NO_PROXY=example.invalid` it records nothing.
2. Given `HTTPS_PROXY=http://127.0.0.1:1` (nothing listening), `classifyNetworkError` yields `PROXY_UNREACHABLE` and the tool error text contains `HTTPS_PROXY=http://127.0.0.1:1 is set but not reachable`.
3. Given a local TLS fixture with a self-signed certificate and no `NODE_EXTRA_CA_CERTS`, the error classifies as `TLS_CA_UNTRUSTED` and the remedy names `NODE_EXTRA_CA_CERTS`; with `NODE_EXTRA_CA_CERTS=<fixture CA pem>` the request succeeds (the test spawns a child Node process because the variable is read at process start).
4. `https://does-not-exist.invalid` classifies as `DNS_FAILURE`.
5. Starting the server with `HTTPS_PROXY=""` and `NODE_EXTRA_CA_CERTS=""` produces no stderr warning and behaves as if unset.
6. All of the above pass on `ubuntu-latest`, `macos-latest`, `windows-latest`; no test reaches the public internet.
7. `grep -rn "\bfetch(" packages/snowarch/src` shows only `src/servicenow/http.ts`.

**Tasks.**
1. Add `undici`; implement `http.ts` and replace the three call sites.
2. Implement `net-errors.ts` and map it in `client.request()`; mask proxy URLs.
3. Sanitise empty variables at start-up (`src/server.ts` and `src/cli/index.ts`, before any import that constructs the agent — use a tiny `src/env-sanitise.ts` imported first).
4. Tests with in-process proxy and TLS fixtures (`tests/servicenow/proxy.test.ts`, `tests/servicenow/tls.test.ts`, `tests/servicenow/net-errors.test.ts`).
5. README "Corporate networks" section; contract `errorCodes` gains the six network codes with remedies (S06 file, this story's entries).

**Test strategy.** Unit + integration with local fixtures on three OSes in CI; manual verification on a real proxied laptop before the `v2.0.0` tag (ARC-10 cutover checklist; recorded as "not performed" with a date if no such laptop is available — ARC-10 risk).

**Dependencies.** S01. Consumers: ARC-07-S02 (probe), ARC-08-S03 (doctor check E-26).

**Size.** M — 1.5 days.

**Risks / open points.** Whether Claude Code's spawned stdio server inherits the user's shell environment (so `HTTPS_PROXY` / `NODE_EXTRA_CA_CERTS` reach it without `.mcp.json` entries) is not evidenced in `00`/`01`; this story proposes spike **S-20** for ARC-00 ("environment inheritance of project stdio servers" — **not yet a row in `03` §A nor a task in ARC-00's stories; ARC-08-S03 already cites it, so ARC-00's verifier must add the row or reject the proposal**) and, pending it, recommends ARC-06 forward the four variables in `.mcp.json` as `${VAR:-}` — which this story's sanitisation makes safe. PAC-file proxies are out of scope; the README says so and names `HTTPS_PROXY` as the workaround.

**Definition of done.** Merged; fixtures green on nine cells; README section written; `03` R-15 updated with "closed by ARC-04-S11; S-20 proposed" by ARC-00.

---

### ARC-04-S12 — Server doctor module (`src/doctor/`) and `snowarch doctor --json`

> **Amendment 2026-09-08 (from ARC-02-S04, S-13 addendum).** **The doctor walks from the checkout up to
> the filesystem root and WARNS on every ancestor `.claude/skills` it finds.** Claude Code loads project
> skills from *every* such directory on that path, not only the checkout's own: the roster doubles and
> the S-13 listing budget is spent twice, silently. Severity **warning**, not error — the checkout still
> works. The message names the offending path(s) and the remedy: move the checkout out from under them,
> or disable the ancestor's skills with `/skills`. See the `S-13 (addendum)` row in
> `docs/plans/03-RISKS-AND-UNKNOWNS.md` §F for the measured evidence and the CLI's own `project=[…]`
> log line; `pollutingAncestors()` in `scripts/ci/skill-listing-check.mjs` is a working implementation
> of the walk, with unit tests in `tests/skill-listing.test.mjs`.

**As** ARC-08's unified doctor and as a non-Architect user of `npx @farstic/snowarch` **I want** the server package to own the checks only it can perform — Node floor, dist resolvable, store validity and modes, per-instance flags and probes, the stdio handshake against itself, capabilities-equals-store **so that** one report can merge engine checks (E-xx) and server checks (S-xx) without re-implementing the flag rules in a second language (P-16, `00` §3.9 D25–D27).

**Context.** `01` §8 "Server checks (S-xx, `packages/snowarch` doctor module, also usable stand-alone)"; ARC-08's dependency line names "ARC-04-S12 (server doctor module boundaries)". The check *content* for probes reuses ARC-07's probe functions once they exist; this story defines the module boundary, the check registry contract, and the checks that need no wizard code.

**Scope.** In: `src/doctor/index.ts` (registry, runner, JSON schema), checks `SV-00` … `SV-07` listed below, `snowarch doctor [--json] [--no-network] [--section server]`, exit codes, redaction. Out: engine checks, `--fix`, the merged report, the banner (ARC-08); auth/preset probes' implementation (ARC-07-S03 — the doctor calls `probes.runAll(instance)` through an interface this story declares and a stub satisfies).

**Design notes.**
- **Registry contract** (shared with ARC-08): `interface Check { id: 'SV-00' …; title: string; severity: 'fail' | 'warn' | 'info'; network: boolean; run(ctx): Promise<CheckResult> }`, `CheckResult = { id, title, status: 'ok' | 'warn' | 'fail' | 'skip', detail: string, remedy?: string, fixable: false }`. Runner returns `{ product, version, ranAt, checks: CheckResult[], summary: { ok, warn, fail, skip }, mode: 'unconfigured' | 'configured', instances: [{ label, environment, preset, status }] }`. JSON is the same shape ARC-08's `--json` emits for the merged report (documented in `docs/ARCHITECTURE.md`).
- **Checks.** `SV-00` Node ≥ 20 (`process.versions.node` vs `engines`); `SV-01` `dist/server.js` and `dist/contract.json` present, importable, contract sha printed; `SV-02` store resolution (source, masked path, cloud-sync WARN via `isUnderCloudSyncFolder`), schema valid, modes 0700/0600 (skip with note on Windows); `SV-03` per instance: URL is a bare https origin, six flags explicit (WARN `FLAGS_INCOMPLETE`), dependency-consistent (WARN `FLAG_DEPENDENCY_VIOLATION`), `toolPackage == full`, prod posture (`PROD_WRITE_NOT_ACKNOWLEDGED` → FAIL with the `--ack-prod` remedy), `@servicenow/sdk` on PATH when FLUENT; `SV-04` (network) per instance auth probe and per-preset probes via the ARC-07 interface (stub returns `skip` until ARC-07 lands); `SV-05` stdio handshake: spawn `dist/server.js` with the same environment, `initialize` + `tools/list`, compare names to `dist/contract.json` (FAIL on any difference; in unconfigured mode expect the five core tools); `SV-06` `snow_core_capabilities_read` over that handshake equals the store entry (flags, preset, environment, maxRecords); `SV-07` audit file location writable (WARN if not).
- **CLI.** `snowarch doctor` prints one line per check `SV-03 ok   instance pdi: flags explicit, preset pdi-developer` and a summary `SERVER DOCTOR: 7 ok, 1 warn, 0 fail`; exit 0 (no fail), 1 (any fail), 3 (could not run). `--json` prints the object only. Usernames masked, secrets shown as `set (len n)`, never values.

**Acceptance criteria.**
1. On a checkout with a valid store, `node packages/snowarch/dist/cli/index.js doctor --no-network --json` returns a JSON object with `checks[]` ids `SV-00`…`SV-07`, `SV-04` `skip`, `summary.fail == 0`, and `instances[0].preset` matching the store.
2. With no store, `mode == "unconfigured"`, `SV-02` is `warn` with remedy `/snowarch setup-instance`, `SV-05` passes with five tools, exit code 0.
3. With a store of mode 0644 (POSIX), `SV-02` is `fail` with the `chmod 600` remedy and exit code 1.
4. With `environment: prod, preset: full, prodWriteAck: false`, `SV-03` is `fail` naming `./snowarch instance set-preset prod full --ack-prod`.
5. Editing `dist/contract.json` to remove one tool makes `SV-05` `fail` listing the differing name.
6. The `--json` output for the fixture store contains neither the fixture password nor the clear username (grep).
7. The same module is importable from `tools/snowarch` (`import { runServerDoctor } from '@farstic/snowarch/doctor'` via the package `exports` map) — the hand-off ARC-08 needs.

**Tasks.**
1. Define the registry types; implement the runner and the JSON shape.
2. Implement `SV-00`…`SV-07`; declare the `Probes` interface and its stub.
3. Implement the CLI sub-command; add `./doctor` to `package.json` `exports`.
4. Tests: `tests/doctor/*.test.ts` per check with fixtures (temp `HOME`/`APPDATA`); a snapshot test of the JSON shape.
5. Document the shape and ids in `docs/ARCHITECTURE.md` (appendix seeded for ARC-08's mapping table).

**Test strategy.** Unit per check; integration for `SV-05`/`SV-06` (real spawn of `dist/server.js`); CI on nine cells; no network in CI (`SV-04` stub).

**Dependencies.** S04 (status/capabilities tools), S06 (contract file). ARC-07-S03 later replaces the probe stub.

**Size.** M — 2 days.

**Risks / open points.** `01` §8 names the server checks `S-xx`, which collides with the spike ids `S-01`…`S-19` in `03`; ARC-08 (`STORIES.md` S01 "Id prefixes") already settled on `SV-xx` for server checks and `E-xx` for engine checks, so this story ships the ids as `SV-00`…`SV-07` from the first commit — ARC-08-S01's planned "rename `S-` → `SV-` in the server module" step becomes a no-op. The ids are one exported constant in `src/doctor/index.ts`.

**Definition of done.** Merged; JSON schema documented; ARC-08-S04 can import the module.

---

### ARC-04-S13 — `scripts/build-dist.mjs`; committed `dist/`; CI rebuild-and-diff

**As** an individual practitioner cloning the repository **I want** a runnable `packages/snowarch/dist/server.js` in the tree **so that** live mode needs `npm ci` and nothing else, and as a maintainer **I want** CI to prove the committed output matches the source.

**Context.** Closes P-20 (`dist/` gitignored — every install compiles TypeScript; `mcp:.gitignore:5`). Implements `01` §2 principle 2 (everything committable is committed), §3 (`dist/` committed, CI rebuilds and diffs), §12 (the release script refuses to tag on a diff — ARC-09). Risk R-02 (stale `dist/`) is mitigated here.

**Scope.** In: `scripts/build-dist.mjs` at the repository root (maintainer tooling per `01` §3), deterministic compiler settings, `.gitattributes` entries, un-ignoring `dist/`, the CI job, the first committed `dist/`. Out: the release script (ARC-09), the npm publish job (roadmap).

**Design notes.**
- `scripts/build-dist.mjs`: `rm -rf packages/snowarch/dist`; `tsc -p packages/snowarch/tsconfig.build.json`; `node packages/snowarch/scripts/extract-tools.mjs`; print the contract sha. `tsconfig.build.json` extends `tsconfig.json` with `"sourceMap": false, "declarationMap": false, "newLine": "lf", "removeComments": false` and includes `src/cli/**` (today's `tsconfig.server.json` excludes the CLI — `mcp:tsconfig.server.json:7`; the `bin` needs it). Output is deterministic for a given TypeScript version — the version is pinned exactly in `devDependencies` (no caret) so CI and the maintainer produce identical bytes.
- `.gitattributes` (ARC-01 file, this story's lines): `packages/snowarch/dist/** linguist-generated=true -diff merge=ours` is **not** used (`merge=ours` hides conflicts); instead `packages/snowarch/dist/** linguist-generated=true text eol=lf`.
- `.gitignore`: remove `dist/` for the package; keep `*.tsbuildinfo`.
- CI job `dist-check` (in the ARC-01 workflow): `npm ci --ignore-scripts && node scripts/build-dist.mjs && git diff --exit-code -- packages/snowarch/dist` on the three OSes (Windows proves the LF rule). Failure message in the job: `dist/ is stale — run node scripts/build-dist.mjs and commit`.
- `packages/snowarch/package.json` `"files"` includes `dist/`; `"scripts"."build"` remains for local use and calls the same script via `node ../../scripts/build-dist.mjs`.

**Acceptance criteria.**
1. On a fresh clone (no build), `node packages/snowarch/dist/server.js` answers `initialize` on all three OSes (the S04 handshake test is re-run against the committed file in CI without a build step).
2. `node scripts/build-dist.mjs` twice in a row yields `git status --porcelain packages/snowarch/dist` empty after the second run; the same on `windows-latest`.
3. A PR that edits `src/tools/core.ts` without rebuilding fails the `dist-check` job with the stale message; after `node scripts/build-dist.mjs` and commit it passes.
4. `git ls-files packages/snowarch/dist | wc -l` > 0 and includes `server.js`, `cli/index.js`, `tools-manifest.json`, `contract.json`; no `.map` files.
5. `git check-attr -a packages/snowarch/dist/server.js` shows `linguist-generated: true` and `eol: lf`.
6. `du -sh packages/snowarch/dist` ≤ 6 MB (today 4.2 MB with maps; report the value).

**Tasks.**
1. Write `tsconfig.build.json`; pin `typescript` exactly.
2. Write `scripts/build-dist.mjs`; wire `npm run build:dist` at the root (ARC-01 script name).
3. Update `.gitignore` / `.gitattributes`; commit the first `dist/`.
4. Add the CI job on three OSes; make the S04 handshake test run once against `dist/` in a "no build" job.
5. `docs/CONTRIBUTING.md`: "never edit `dist/`; run the build script; CI diffs it".

**Test strategy.** CI job on three OSes; handshake against the committed artefact.

**Dependencies.** S06 (`contract.json` is part of `dist/`), S08 (static catalogue — the committed manifest must be final for ARC-05's pin). Must merge before ARC-05-S01 and ARC-06-S07/S08 (B05/B08).

**Size.** M — 1.5 days.

**Risks / open points.** Every source PR now carries a `dist/` diff — accepted (`01` principle 2); `linguist-generated` collapses it in GitHub review. A TypeScript minor upgrade regenerates all of `dist/` in one commit — done deliberately by the maintainer.

**Definition of done.** Merged with `dist/` committed; `dist-check` green on three OSes; `docs/CONTRIBUTING.md` updated; ARC-05 can pin `contractSha256`.

---

### ARC-04-S14 — Rewrite `packages/snowarch/README.md`, `.env.example`, `CHANGELOG.md` from code; 2.0.0 migration notes

**As** a non-Architect user of `npx @farstic/snowarch` and as the engine's documentation generators **I want** the package's own documentation to describe exactly what the code does — env contract, tool families, gates, error codes, store, audit, corporate networks — and a changelog that tells a snow-mcp 1.0.0 user what changed **so that** P-30 cannot recur and R-03 is honoured.

**Context.** Closes P-30 (`docs/INSTALLATION.md` documents OIDC/SSO, `AUDIT_*`, `SNMCP_ORG_CONFIG`, `ALLOW_ANY_TABLE`, `/auth/login`, an 11-step wizard described as 5 — none implemented; wrong `claude mcp add` flags — `00` §4.9), the documentation half of P-18 (dead URLs), R-03 (migration note for gate split, precedence inversion, no cwd `.env`, unconfigured start; "the optional npm channel publishes as a new major" — 2.0.0 under the new record, D-01/R-1). ARC-09's generated `docs/CHANGELOG.md` for the product cites this file's 2.0.0 section.

**Scope.** In: `packages/snowarch/README.md`, `.env.example`, `CHANGELOG.md`; deletion of `docs/INSTALLATION.md`, `docs/CLIENT_SETUP.md`, `docs/MULTI_INSTANCE.md`, `docs/TOOLS.md`, `EXAMPLES.md`, `instances.example.json`, `SECURITY.md` rewrite (contact + supported version 2.x), `CONTRIBUTING.md` merged into the root `docs/CONTRIBUTING.md`; a generated tool-family table. Out: the product install page (`README.md` root, ARC-06), `docs/MODES-AND-PRESETS.md` (ARC-07), `docs/TROUBLESHOOTING.md` (ARC-05 generates).

**Design notes.**
- **README.md** sections, each derived from a source of truth: (1) What it is — stdio MCP server, 398 tools, `npx @farstic/snowarch start` and `node dist/server.js`; registration example for a generic MCP client (`{"command":"npx","args":["-y","@farstic/snowarch@2","start"]}`) with the note that the Architect registers it through its committed `.mcp.json`; (2) Configuration — the store (schema v1 verbatim, precedence, file modes, `SNOW_STORE`, `SNOW_ENV_FILE`), env-defined instances for CI; (3) Presets and flags — the six-flag table from `permissions.ts` (generated block, marked `<!-- generated: presets -->`); (4) Tool families — one row per `src/tools/*.ts` module with counts and gate summary, generated from `dist/tools-manifest.json` by `scripts/gen-readme-tables.mjs` (idempotent; CI diffs the block); (5) Error codes — from `dist/contract.json.errorCodes`; (6) §2.2 update-set capture — the four calls; (7) Audit trail — line shape; (8) Corporate networks (S11); (9) CLI — `start | instance | doctor | contract`; (10) Development — build, test, `RUN_LIVE_E2E=1`.
- **`.env.example`** pruned to keys with ≥ 1 reference in `src/`: `SNOW_STORE`, `SNOW_ENV_FILE`, `SNOW_LOG_LEVEL`, `SNOW_AUDIT_FILE`, `SNOW_MAX_RESULT_CHARS`, `REDACT_SENSITIVE_DATA` (default true), `MCP_TOOL_PACKAGE` (must be `full` for the Architect), the env-defined instance block (`SERVICENOW_INSTANCE_URL`, `SERVICENOW_AUTH_METHOD`, `SERVICENOW_BASIC_USERNAME/PASSWORD`, `SERVICENOW_OAUTH_*`, `SN_INSTANCE_<NAME>_*` incl. `_ENVIRONMENT`, `_PROD_WRITE_ACK`, `SN_DEFAULT_INSTANCE`), the six flags, `MAX_RECORDS`, `MAX_RETRIES`, `RETRY_DELAY_MS`, `REQUEST_TIMEOUT_MS`, `AGILE_TABLE_PREFIX`, `HTTPS_PROXY` / `NO_PROXY` / `NODE_EXTRA_CA_CERTS` (commented). No `TRANSPORT`, `PORT`, `HOST`, `SNMCP_API_KEY`, `CORS_ORIGIN`, `SN_INSTANCES_CONFIG`. A test (`tests/docs/env-example.test.ts`) asserts every key in the file is referenced in `src/` and every `process.env.X` read in `src/` is documented (allow-list for Node's own variables).
- **CHANGELOG.md** `## 2.0.0` with sections: *Breaking* (removed surfaces — D-03 list; SCRIPTING no longer gates reads; store precedence env > project > global with no merging; legacy `~/.config/servicenow-mcp/instances.json` and `SN_INSTANCES_CONFIG` no longer read — `./snowarch instance import --from-legacy` (ARC-07); cwd `.env` no longer read — `SNOW_ENV_FILE`; `MAX_RECORDS` default 100; per-call `instance` argument removed; `snow_disco_table_discover` no longer generates tools; `snow_us_active_update_set_ensure` requires `name`; two script-execution tools return `UNSUPPORTED_ON_THIS_INSTANCE`; `REDACT_SENSITIVE_DATA` defaults on; package renamed `@farstic/snowarch`, bin `snowarch`, MCP server name `snowarch`), *Added* (unconfigured mode; `snow_core_status_read`, `snow_core_capabilities_read`, `snow_core_instances_reload`, `snow_us_capture_target_set`; per-instance flags; presets; prod acknowledgement; audit trail; proxy support; contract), *Fixed* (ORDERBYDESC, `event_name`, `action_insert/update`, the S06 anomaly list), *Tests* (the field-note behaviours now covered: §1 `switch` semantics documented, §2 stubs, §4, §5), and a *Migration from snow-mcp 1.0.0* checklist (five steps). The file states that `@farstic/snow-mcp@1.0.0` on npm is unrelated and unmaintained (D-01 owner constraint: never touched).
- Dead URLs: every `github.com/cvetomirgrigorov/servicenow-mcp` reference replaced with `github.com/farstic/ai-servicenow-architect` (ARC-01's acceptance grep must stay empty).

**Acceptance criteria.**
1. `node scripts/gen-readme-tables.mjs --check` exits 0 on the committed README and 1 after a manual edit inside a generated block (CI job).
2. `tests/docs/env-example.test.ts` passes: every `.env.example` key is read somewhere in `src/`, every `process.env.<KEY>` in `src/` (outside the allow-list `NODE_*`, `HOME`, `USERPROFILE`, `APPDATA`, `CLAUDE_PROJECT_DIR`, `HTTP_PROXY`, `HTTPS_PROXY`, `NO_PROXY` and their lowercase forms, and `LOG_LEVEL` — the pre-2.0 name S02 keeps as a fallback for `SNOW_LOG_LEVEL`, documented in `CHANGELOG.md` only) appears in `.env.example`.
3. `grep -rn "OIDC\|SNMCP_ORG_CONFIG\|ALLOW_ANY_TABLE\|/auth/login\|claude mcp add servicenow --command\|servicenow-mcp\|cvetomirgrigorov/servicenow-mcp" packages/snowarch/src packages/snowarch/README.md packages/snowarch/.env.example packages/snowarch/SECURITY.md` returns nothing (the legacy path `~/.config/servicenow-mcp/instances.json` is named only in `CHANGELOG.md`'s migration section, which is excluded from this grep on purpose).
4. `CHANGELOG.md` contains the headings `Breaking`, `Added`, `Fixed`, `Tests`, `Migration from snow-mcp 1.0.0`, mentions each of the nine D-03 items, and the gate-split note (R-03).
5. A reader following only the README can register the server with a generic MCP client using an env-defined instance and call `snow_core_status_read` (manual check by someone other than the author, recorded in the PR).
6. The README's presets block equals the `01` §6.3 table (snapshot test against `permissions.ts` exports).

**Tasks.**
1. Write `scripts/gen-readme-tables.mjs` (families, presets, error codes) with `--check`.
2. Rewrite README.md; delete the obsolete docs; rewrite `SECURITY.md`.
3. Prune `.env.example`; write the env test.
4. Write `CHANGELOG.md` 2.0.0 from the notes accumulated by S01–S13.
5. Add the CI check job.

**Test strategy.** Generated-block check and env-key test in CI; one manual read-through by a second person.

**Dependencies.** S01–S13 (content); S06/S13 (`dist/` artefacts the generators read).

**Size.** M — 2 days.

**Risks / open points.** The README duplicates parts of `docs/MODES-AND-PRESETS.md` (ARC-07) — acceptable for the npm audience; the generated blocks keep them identical where it matters (presets). Nothing else.

**Definition of done.** Merged; CI doc checks green; ARC-09's product changelog can reference the 2.0.0 section; ARC-10's deprecation notice for `farstic/snow-mcp` links to it.

---

## Sizing summary

| Size | Stories | Engineer-days |
|---|---|---|
| L (3–4 d) | S01 (3–4), S02 (3), S03 (3), S04 (3), S06 (4) | 16–17 |
| M (1.5–2 d) | S05 (1.5), S07 (1.5), S08 (2), S09 (1.5), S10 (1.5), S11 (1.5), S12 (2), S13 (1.5), S14 (2) | 15 |
| **Total** | 14 | **31–32 engineer-days (≈ 6–6.5 weeks for one engineer)** |

This exceeds six weeks. It is not split further because the ARC is one coherent refactor of a single package and every story is already independently mergeable. Two independent chains can run in parallel on a second engineer without conflict: **S09 + S11** (client-level fixes, depend only on S01) and **S13 + S14** (build and docs, once S06/S08 are in). With that split the elapsed time is about four weeks. Stories with live E2E cases (S03, S05, S07, S08, S09) need a PDI and are exercised on a developer machine, never in CI.

## Cross-ARC hand-offs (what other ARCs receive from this one)

| Consumer | Receives | From |
|---|---|---|
| ARC-05 | `dist/contract.json` (398 tools, gates, mutates, flags, presets, error codes, §2.2 protocol), `snowarch contract --sha`, `tests/contract.test.ts` first form | S06, S13 |
| ARC-06 | server that starts unconfigured; committed `dist/`; `SNOW_STORE`/`SNOW_LOG_LEVEL` env contract; recommendation to forward `HTTPS_PROXY`/`NO_PROXY`/`NODE_EXTRA_CA_CERTS` as `${VAR:-}` | S04, S13, S02, S11 |
| ARC-07 | `src/store/` (schema v1, atomic `saveStore`, `isUnderCloudSyncFolder`, masking), `PRESETS`/`expandPreset`/dependency rule, prod rule, `snow_core_instances_reload`, `classifyNetworkError`, the `Probes` interface, `readAuditTail` | S02, S03, S04, S11, S12, S10 |
| ARC-08 | `@farstic/snowarch/doctor` module (`SV-00`…`SV-07`, JSON shape), `snow_core_status_read` / `capabilities_read` | S12, S04 |
| ARC-09 | deterministic `scripts/build-dist.mjs`, `CHANGELOG.md` 2.0.0 section, pinned `typescript` | S13, S14 |
| ARC-02 | field-note sections §1, §2, §4, §5 closed as tests (titles in `CHANGELOG.md` "Tests") | S07, S08, S09 |
| ARC-00 | S-02 / S-17 procedures use the S04 build; S-10 is run by S05 itself (deferred by ARC-00-S14); spike S-20 (env inheritance of project stdio servers) is run by ARC-00-S06 and its verdict consumed by S11 | S04, S05, S11 |
