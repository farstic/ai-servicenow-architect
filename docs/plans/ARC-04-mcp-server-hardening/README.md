# ARC-04 — MCP server hardening and scope cut

Status: **Stories drafted 2026-09-04** · Depends on: ARC-01 (import, D-02, D-03); ARC-00 spike verdicts S-02, S-10, S-17 (behaviour ships regardless; fallbacks designed in) · Blocks: ARC-05 (contract generator), ARC-06 (committed `dist/`, unconfigured mode), ARC-07 (store schema, presets, CLI module, network-error classifier), ARC-08 (server doctor module)

Names and versions in this file follow the owner's rulings of 2026-09-04 (`02-DECISIONS-NEEDED.md`): package directory **`packages/snowarch`**, npm name **`@farstic/snowarch`**, `bin` **`snowarch`**, first unified version **2.0.0** (R-1), MCP server key `servicenow` → tools `mcp__servicenow__snow_*` (D-01), project skill **`/snowarch`** with `setup-instance` · `status` · `doctor` (R-2). The existing `@farstic/snow-mcp@1.0.0` npm record is never touched. Vocabulary: Mode `design-only` | `live`; Preset `read-only` | `pdi-developer` | `full` | `custom`.

## Goal

Turn `packages/snowarch` into a server that (a) starts safely with **no** instance, (b) reads one store with an explicit, logged precedence and evaluates permission flags **per instance**, (c) never blocks reads behind a write flag, (d) declares each tool's gate and mutating nature in code so a contract can be generated, (e) writes an audit trail, (f) works behind corporate proxies and TLS-intercepting gateways (R-3), and (g) ships prebuilt.

## Why it exists

Closes P-03 (absent flags fail mid-task), P-18 (identity), P-19 (version drift), P-20 (`dist/` gitignored, Dockerfile), P-21 (four config stores, hidden override, exit 1 without instance), P-22 (cwd `dotenv`), P-24 (SCRIPTING gates reads; global flags), P-25 (tool packages), P-26 (ORDERBYDESC, `event_name`, `action_insert`, dead endpoints), P-27 (undeclared `instance` arg, phantom dynamic tools), P-28 (dashboard/desktop/web), P-29 (tests/CI), P-30 (docs describing unimplemented features), P-31 (ungoverned prompts), P-33 (§2.2 five-call composition), P-35 (no audit trail); and risk R-15 (proxies / custom CAs) per the owner's R-3 ruling.

## Scope

**In:** everything under `packages/snowarch`; the CLI subcommands `start`, `instance` (store module and probe interface — UX in ARC-07), `doctor` (server module — merged report in ARC-08), `contract`; regression tests for the field-note server behaviours; the proxy agent and network-error classifier; committed `dist/`.
**Out:** the wizard's terminal UX (ARC-07); the engine-side pin and lint (ARC-05); any transport other than stdio (D-03); the plugin channel (D-06 hedge — spikes S-14a–g run in ARC-00 and gate ARC-06, not this ARC); native-Windows first-class status is conditional on ARC-00 S-03/S-04/S-08 (Q-B) — this ARC's own Windows obligations (paths, file modes, CRLF-safe `dist/`, `%APPDATA%` global store) hold in either outcome.

## Deliverables

1. **Scope cut finalised** (D-03): `src/direct`, `src/a2a`, `src/dashboard`, `src/reports`, `src/prompts`, `src/transport` (sse/http), `src/api` (the REST API of D-03 item 6 — it imports the HTTP transport and the prompts and cannot exist without them), `src/cli/writers`, `src/cli/detect-clients`, `src/cli/auth` (per-user paste flow), `src/cli/setup`, `src/cli/shortcuts`, `src/cli/config-store` removed; `src/sdk` kept as a client re-export only (the Apex / direct-mode re-exports of D-03 item 3 removed); `pdfmake`, `pptxgenjs`, `@inquirer/*`, `ora`, `chalk` removed from runtime deps (ARC-07 implements masked input with `process.stdin.setRawMode`; no prompt library); `npm link` side effect and the npm update nag removed. Identity: `@farstic/snowarch` 2.0.0, `bin` `snowarch`, MCP `serverInfo.name` `snowarch`.
2. **Unconfigured start mode**: no `process.exit(1)`; with zero instances the server advertises `snow_core_instances_index`, `snow_core_instances_reload`, `snow_core_current_instance_read`, `snow_core_capabilities_read`, `snow_core_status_read`; every other call returns `NO_INSTANCE_CONFIGURED` with the `/snowarch setup-instance` remedy; after `instances_reload` it emits `notifications/tools/list_changed` (S-02; fallback `/mcp` reconnect text in the ARC-07 skill).
3. **Single store**: `SNOW_STORE` (empty string = unset) → `<CLAUDE_PROJECT_DIR ?? cwd>/.local/instances.json` → `~/.config/snowarch/instances.json` (Windows `%APPDATA%\snowarch\instances.json`); schema v1 (`01` §7); env-defined instances (`SERVICENOW_*` / `SN_INSTANCE_*`) load *instead of* the store and are logged at startup; `SN_INSTANCES_CONFIG`, the legacy `~/.config/servicenow-mcp/instances.json` and its silent override **removed**; cwd `dotenv.config()` removed (`SNOW_ENV_FILE` only); refuse a group/world-readable store with the `chmod 600` remedy; atomic 0600 writes and an `isUnderCloudSyncFolder` helper for the D-04 WARN in ARC-07/ARC-08.
4. **Per-instance flags** evaluated at call time (an `AsyncLocalStorage` carrier keeps the `require*()` call sites unchanged); `snow_core_instance_switch` switches flags with the instance; preset expansion (`read-only`, `pdi-developer`, `full`, `custom`) to six byte-exact strings with the SCRIPTING/CMDB_WRITE→WRITE dependency; `environment: prod` with anything above `read-only` refuses to load without `prodWriteAck: true` (D-05; the wizard's propose-review-apply flow of principle 10 is ARC-07's).
5. **Gate split**: `snow_scr_*` and `snow_us_*` *reads* ungated; `requireScripting()` only on mutating tools; ATF `*_exec` unchanged; `snow_na_*` unchanged (licence-bound).
6. **Per-tool declarations**: every registration carries `gate` and `mutates` (and an optional fixed `table` for the audit writer); `scripts/extract-tools.mjs` emits `dist/tools-manifest.json` (+ `gate`, `mutates`) and `dist/contract.json` (`01` §11) and still guards the unique-name count; `snowarch contract [--json|--sha]`.
7. **New/changed tools**: `snow_core_capabilities_read` (instance, environment, preset, six flags + effective flags, toolPackage, maxRecords, store path masked, configError, configWarnings); `snow_core_status_read`; `snow_core_instances_reload`; `snow_us_capture_target_set` (writes `sys_user_preference` name=`sys_update_set` for the authenticated user; returns the preference sys_id); `snow_us_active_update_set_ensure` requires a name and filters by current user; `snow_deploy_background_script_exec` and `snow_fluent_script_exec` retired as `[Unsupported]` stubs returning `UNSUPPORTED_ON_THIS_INSTANCE` before any HTTP call (names kept because the engine cites them); the undeclared per-call `instance` routing removed; `snow_disco_table_discover` returns schema data instead of generating tools. Post-change tool count: **398** (394 + 4).
8. **Defect fixes with regression tests**: `ORDERBYDESC<field>` (`client.ts:384-388`); `snow_intg_event_register` sets `event_name` (and `suffix`); `snow_scr_business_rule_add` sets `action_insert/action_update` (and `action_delete/query` when requested); a result-size cap honouring `_meta["anthropic/maxResultSizeChars"]` when supplied, else `SNOW_MAX_RESULT_CHARS` (default 100,000).
9. **Audit trail**: one JSON line per `mutates: true` call (including refused ones) to `<store dir>/audit.jsonl` (timestamp, instance, tool, table, sys_id/query, result code — never payload values or credentials), 10 MB rotation; `REDACT_SENSITIVE_DATA` default on; Authorization header never logged (test-enforced).
10. **Proxy and CA support (R-3)**: `undici` `EnvHttpProxyAgent` honouring `HTTPS_PROXY` / `HTTP_PROXY` / `NO_PROXY`; documented `NODE_EXTRA_CA_CERTS`; empty-string sanitisation for `.mcp.json` pass-through; `classifyNetworkError` yielding `DNS_FAILURE` / `TLS_CA_UNTRUSTED` / `PROXY_UNREACHABLE` / `PROXY_AUTH_REQUIRED` / `CONNECTION_REFUSED` / `NETWORK_TIMEOUT` with remedies (reused by ARC-07's probe and ARC-08's doctor).
11. **Server doctor module**: `src/doctor/` with the check registry contract, checks `SV-00`…`SV-07` (Node floor, dist, store, per-instance flags and prod posture, probes interface, stdio handshake vs contract, capabilities == store, audit file), `snowarch doctor [--json] [--no-network]`; importable by ARC-08 as `@farstic/snowarch/doctor`. Check ids use the `SV-` prefix ARC-08 fixed (the `S-xx` of `01` §8 collides with the spike ids).
12. **Identity and tests**: one version (root); `server.json`/`smithery.yaml`/dashboard version strings gone with the surfaces; `vitest.config.ts` scoped to `packages/snowarch/tests`; `npm test` in CI on three OSes × Node 20/22/24; `tests/contract.test.ts` first form (ARC-05 extends it); `tool-rename-map.json` retained for the parity test only; `permissions.ts` at 100 % coverage.
13. **Committed `dist/`** built by `scripts/build-dist.mjs` (deterministic: pinned TypeScript, LF, no source maps); CI rebuilds and runs `git diff --exit-code packages/snowarch/dist`.
14. `packages/snowarch/README.md`, `.env.example` and `CHANGELOG.md` rewritten from code: env contract (test-enforced), tool families (generated), gates, error codes, store, audit, corporate networks; the retired field-note behaviours listed as fixed tests; the 2.0.0 migration note (R-03).

## Dependencies

ARC-01. D-02 (relicensing) is a hard gate; D-03 fixes the cut list; D-05 fixes the prod rule; D-01/R-1 fix names and version. ARC-00 verdicts for S-02 (`list_changed`), S-17 (unconfigured server accepted) and S-10 (read-only sufficient after the gate split) are consumed by the ARCs downstream of this one; the stories ship the behaviour and its fallbacks either way. This ARC does not wait for the S-14 plugin spikes (D-06 hedge gates ARC-06).

## Acceptance criteria

- [ ] `node packages/snowarch/dist/server.js` with no store and no env starts, answers `initialize` (`serverInfo.name == "snowarch"`, version `2.0.0`), lists exactly the five core tools, and returns `NO_INSTANCE_CONFIGURED` for any other tool.
- [ ] With a store containing `pdi` (`pdi-developer`) and `prod` (`read-only`), `snow_core_instance_switch prod` followed by `snow_core_record_add` returns `WRITE_NOT_ENABLED`, while the same call on `pdi` succeeds against a PDI.
- [ ] With `read-only`, `snow_scr_script_includes_index` and `snow_scr_script_include_read` succeed; `snow_scr_script_include_add` returns `SCRIPTING_NOT_ENABLED`.
- [ ] A store entry `environment: prod`, `preset: full`, `prodWriteAck: false` makes the server log `PROD_WRITE_NOT_ACKNOWLEDGED` and keep the instance unloaded; with `true` it loads.
- [ ] `snow_core_records_query` with `orderBy: "-sys_created_on"` returns the newest record first (unit test with a captured encoded query, plus a live test behind `RUN_LIVE_E2E=1`).
- [ ] `snow_us_capture_target_set` followed by `snow_scr_script_include_add` produces a `sys_update_xml` row in the named update set on a PDI (live E2E).
- [ ] `npm test` green on the three CI OSes × Node 20/22/24; zero `desktop/` tests; coverage of `permissions.ts` 100 %.
- [ ] `dist/contract.json` exists, lists 398 tools with `gate` and `mutates` for each, and its sha256 is printed by `snowarch contract --sha`.
- [ ] A world-readable store makes the server refuse to load it and print the chmod remedy; `.local/audit.jsonl` receives one line per mutating call and never contains a password or the Authorization header (test greps).
- [ ] `grep -rn "cwd\|dotenv.config()" packages/snowarch/src/server.ts` shows only the `SNOW_ENV_FILE` branch.
- [ ] Behind a local CONNECT-proxy fixture with `HTTPS_PROXY` set, the client tunnels through it and `NO_PROXY` bypasses it; a self-signed TLS fixture yields `TLS_CA_UNTRUSTED` naming `NODE_EXTRA_CA_CERTS`, and succeeds once the variable points at the fixture CA (R-3).
- [ ] `snowarch doctor --no-network --json` on a valid store reports `summary.fail == 0` and contains no secret or clear username; on a 0644 store it fails with the `chmod 600` remedy.
- [ ] On a fresh clone without a build step, `node packages/snowarch/dist/server.js` answers `initialize` on all three OSes; `node scripts/build-dist.mjs` produces no diff.
- [ ] `tests/legacy-names.allowlist.json` (ARC-01-S10) contains no row owned by `ARC-04` and `node --test tests/no-legacy-names.test.mjs` passes — the "allow-list empty for my files" criterion ARC-01-S10 asks every consuming ARC to carry (S01, S14).

## Risks

> **Amendment 2026-09-07 (from `03` §F S-16).** Add a read-only `snow_core_doctor_read` tool (the server-side doctor summary, redacted, JSON) so the in-session `/snowarch status|doctor` path never needs a Bash allow rule; it joins the five unconfigured-mode tools (six) and is `mutates:false`, `gate:none`.

> **Amendment 2026-09-06 (from `03` §F S-23).** The per-tool `mutates` (and `gate`) values in the contract are **authored from each tool's behaviour**, tool by tool, during the import review — never derived from the name. The §2.1 suffix list is at most a lint *hint* ("suffix says write, flag says read → review"). Tests: every one of the 394 (later 398) tools carries an explicit boolean; the 14 tools named in `03` S-23 are `mutates: true`; a new tool without the field fails the build.

- The gate split changes behaviour for existing snow-mcp 1.0.0 users (R-03). Mitigation: CHANGELOG migration note; the product ships as 2.0.0 under a new npm record (`@farstic/snowarch`); the old record is untouched.
- Per-instance flag evaluation touches every dispatcher. Mitigation: an `AsyncLocalStorage` carrier (`runWithInstance`) keeps every `require*()` call site unchanged; the contract test asserts every tool's gate.
- `list_changed` may not surface in Claude Code (S-02). Mitigation: documented `/mcp` reconnect fallback.
- Whether project stdio servers inherit the user's shell environment (`HTTPS_PROXY`, `NODE_EXTRA_CA_CERTS`) is unverified. Mitigation: proposed spike S-20 for ARC-00; meanwhile ARC-06 may forward the variables as `${VAR:-}` — the server's empty-string sanitisation makes that safe.
- Summed size is 31–32 engineer-days (≈ 6–6.5 weeks for one engineer). Mitigation: two independent story chains (S09 + S11; S13 + S14) can run on a second engineer — see the sizing summary in `STORIES.md`.

## Stories

Full write-ups (persona, context, scope, design notes, acceptance criteria, tasks, test strategy, dependencies, size, risks, definition of done) are in [`STORIES.md`](STORIES.md).

| ID | Title | Size | Status |
|---|---|---|---|
| ARC-04-S01 | D-03 code cut, dependency prune, identity `@farstic/snowarch` 2.0.0, vitest scoping, `npm test` in CI | L | Done (2026-09-08) |
| ARC-04-S02 | Store module v1: precedence, schema, file-mode check, atomic writes; legacy stores and cwd `dotenv` removed | L | Done (2026-09-08) |
| ARC-04-S03 | Per-instance flag evaluation, preset expansion, dependency rule, prod acknowledgement; `permissions.ts` at 100 % coverage | L | Done (2026-09-08) |
| ARC-04-S04 | Unconfigured start mode, `NO_INSTANCE_CONFIGURED`, `snow_core_status_read`, `snow_core_capabilities_read`, `snow_core_instances_reload` + `list_changed` | L | Done (2026-09-08) |
| ARC-04-S05 | SCRIPTING / update-set read-gate split | M | Done (2026-09-08) |
| ARC-04-S06 | `gate` / `mutates` on every registration; `extract-tools.mjs` emits manifest fields and `dist/contract.json`; `snowarch contract` | L | Done (2026-09-08) |
| ARC-04-S07 | `snow_us_capture_target_set`; `snow_us_active_update_set_ensure` with mandatory name and current-user filter | M | Done (2026-09-08) |
| ARC-04-S08 | Retire dead script-execution endpoints; remove undeclared per-call `instance` routing and runtime-generated tools; result-size cap | M | Done (2026-09-08) |
| ARC-04-S09 | Defect fixes with regression tests: `ORDERBYDESC`, `event_name`, `action_insert` / `action_update` | M | Done (2026-09-08) |
| ARC-04-S10 | Audit trail writer with rotation; redaction defaults; Authorization header never logged | M | Done (2026-09-08) |
| ARC-04-S11 | Proxy agent honouring `HTTPS_PROXY` / `HTTP_PROXY` / `NO_PROXY`; documented `NODE_EXTRA_CA_CERTS`; network-error classifier (R-3) | M | Not started |
| ARC-04-S12 | Server doctor module (`src/doctor/`) and `snowarch doctor --json` | M | Not started |
| ARC-04-S13 | `scripts/build-dist.mjs`; committed `dist/`; CI rebuild-and-diff | M | Not started |
| ARC-04-S14 | Rewrite `packages/snowarch/README.md`, `.env.example`, `CHANGELOG.md` from code; 2.0.0 migration notes | M | Not started |

Mapping to the earlier titles-only list: former stories 2 and 7 merged into S04; former story 12 split into S01 (harness, CI) and S03 (coverage); S11 added per R-3; S12 added to carry the server doctor module ARC-08 depends on. Total 31–32 engineer-days. The full former-number → story-ID table is at the top of `STORIES.md`; ARC-05/06/07 still cite this ARC by the former numbers.
