# Changelog

All notable changes to this project are documented here. This project adheres to
[Semantic Versioning](https://semver.org).

## 2.0.0 — Unreleased

Supersedes `servicenow-mcp` 1.0.0. Relicensed to Apache-2.0 and renamed to `@farstic/snowarch`;
the old npm record is neither referenced nor touched (D-01, D-02).

### Removed (D-03 surface cut, ARC-04-S01)

Named individually, because each was a way in that no longer exists:

- **HTTP and SSE transport** — `src/transport/` (`index.ts`, `http-server.ts`, `auth-middleware.ts`).
  stdio is the only transport.
- **REST API** — `src/api/`. It could not exist without the HTTP transport.
- **A2A agent routes** — `src/a2a/`, including the `/.well-known/agent.json` agent card.
- **Web dashboard** — `src/dashboard/`.
- **Report generator** — `src/reports/`, and with it the `pdfmake` and `pptxgenjs` dependencies.
  `snow_rpt_report_generate` remains registered and now fails with an explicit
  `NOT_IMPLEMENTED` error naming the cut.
- **Prompt catalogue** — `src/prompts/` (32 files) and the MCP `prompts` capability with its
  `ListPrompts` / `GetPrompt` handlers. `initialize` no longer advertises `prompts`.
- **Direct-execution engine and LLM client** — `src/direct/`; the SDK no longer re-exports
  `executeDirectly` or `callLlm`.
- **CLI surfaces** — `setup` (and its `npm link` side effect), `auth`, `instances`, `web`,
  `shortcuts`, `capabilities`, `run`, `report`, and the client-config writers and detectors
  (`src/cli/writers/`, `detect-clients.ts`, `auth.ts`, `setup.ts`, `shortcuts.ts`,
  `config-store.ts`). The CLI is now `start`, `instance`, `doctor`, `contract`.
- **The npm update check** — it fetched a third party's package record on every run.

### Changed

- MCP `serverInfo.name` is `snowarch` (was `servicenow-mcp`).
- SDK entry point reduced to the client, its error type and the query types.
- `vitest` scoped to this package, so a test run no longer walks up into sibling trees.

### Migration notes (configuration)

One store, one precedence. What changed for an existing install:

- **`SN_INSTANCES_CONFIG` is removed.** Point `SNOW_STORE` at the file instead, or let the
  per-checkout store at `<checkout>/.local/instances.json` be found. The old snake_case schema
  is not read.
- **The legacy wizard store is no longer read.** It used to be consulted *before* env-defined
  instances and returned early, which meant a file in the home directory silently overrode
  `SERVICENOW_INSTANCE_URL` (P-21). ARC-07's `instance import --from-legacy` reads it through
  its own reader when the time comes.
- **A project `.env` is no longer read.** `dotenv` runs only when `SNOW_ENV_FILE` names an
  existing file. Before, the server read the `.env` of whatever directory it started in — for
  an MCP server that is the user's project (P-22).
- **`SNOW_LOG_LEVEL` is read before `LOG_LEVEL`**, which remains as a fallback.

Precedence, first existing wins, never merged: `SNOW_STORE` (empty string counts as unset) →
`<CLAUDE_PROJECT_DIR or cwd>/.local/instances.json` → `~/.config/snowarch/instances.json`
(`%APPDATA%\snowarch\instances.json` on Windows). Env-defined instances (`SERVICENOW_*`,
`SN_INSTANCE_*`) win over all of them and the startup line says which store was ignored.

`SNOW_STORE` pointing at a missing file is an **error**, not a reason to fall back — otherwise a
typo in an explicit override loads a different instance than the one named, silently.

### Added (ARC-04-S06) — every tool declares its gate, and the contract is generated

- Each of the 397 registrations now carries `gate` and `mutates` (and `table` where the tool's table is
  fixed). Both are required fields, so a new tool that omits one does not compile.
- **`dist/contract.json`** is emitted at build time from those declarations plus the flag, preset and
  error-code tables. Descriptions and input schemas are deliberately excluded, so its sha moves when
  behaviour moves and not when prose does.
- **`snowarch contract`** prints a summary, `--json` the file, `--sha` the sha256 and nothing else.
- **`src/errors/codes.ts`** is the single registry of error codes and their remedies, checked in both
  directions against what `src/` actually throws.

**Fixed while seeding the declarations:** thirteen tools called their permission gate *after* validating
arguments, so an unauthorised caller was told their arguments were wrong about an operation they were
not allowed to attempt — `snow_cfg_properties_import`, `snow_cfg_set_properties_bulk`,
`snow_cfg_system_property_set`, `snow_cfg_system_property_remove`, `snow_devops_deployment_track`,
`snow_devops_devops_change_add`, `snow_fluent_request_batch`, `snow_itam_asset_add`,
`snow_itam_asset_modify`, `snow_itam_asset_retire`, `snow_itam_asset_lifecycle_track`,
`snow_va_va_topic_add`, `snow_va_va_topic_modify`. The gate is now the first statement in each.

### Changed (ARC-04-S05) — SCRIPTING gates writes, not reads

**Migration note (R-03), for anyone upgrading from `servicenow-mcp` 1.0.0.** `SCRIPTING_ENABLED` no
longer gates *reads*. Listing and reading Script Includes, Business Rules, Client Scripts, ACLs, UI
Policies, UI Actions, change sets and update sets now works with no write flag at all, which is what
SCRIPTING was always documented to mean: *writing* those objects.

**If you were relying on SCRIPTING to keep script bodies out of a session, that control is gone —
and it was never the right one.** A flag the client sets is not a confidentiality boundary. Use a
ServiceNow account whose roles do not grant read access to the tables you want withheld.

- Reads ungated: the seven `snow_scr_*_index` / `_read` pairs, plus `snow_us_update_sets_index`,
  `snow_us_current_update_set_read`, `snow_us_update_set_preview` and **`snow_us_update_set_export`**
  — the last of these required SCRIPTING before, so exporting an update set for review needed a
  write flag.
- Writes unchanged, and the gate is now the first statement of each mutating case rather than a
  single check before the dispatch switch.
- Mutating scripting tools carry a `[Scripting]` description prefix; reads carry none.

### Added (ARC-04-S04) — the server starts without an instance

- **It no longer exits when no instance is configured.** An unconfigured checkout used to show a
  crashed MCP server; the process now stays up and can explain itself.
- While unconfigured, `tools/list` advertises exactly five tools that need no instance:
  `snow_core_status_read`, `snow_core_capabilities_read`, `snow_core_instances_reload`,
  `snow_core_instances_index`, `snow_core_current_instance_read`. Any other tool returns
  **`NO_INSTANCE_CONFIGURED`** with both remedies. `UNKNOWN_TOOL` stays reserved for names that exist
  in no configuration.
- **New tools** (394 → 397): `snow_core_status_read` (mode, store, instances, tool count),
  `snow_core_capabilities_read` (preset, flags, effective flags — never a username or a secret),
  `snow_core_instances_reload` (re-read the store and re-advertise).
- `snow_core_instances_reload` sends `notifications/tools/list_changed` when the advertised set
  changes, and the server declares `capabilities.tools.listChanged`. **Adding an instance in another
  terminal no longer needs a Claude Code restart.**
- `snow_core_current_instance_read` answers `{ name: null, mode: "unconfigured" }` instead of throwing.
- Closing stdin exits the process with **code 0**, not a signal.

### Changed (ARC-04-S03) — flags are per instance

- The six permission flags belong to the **instance being addressed**, not to the process. One server
  can hold a PDI and a production instance; `snow_core_instance_switch` moves the flags with the client.
- `WRITE_ENABLED` and its siblings in the server's environment now apply **only to env-defined
  instances** (`SERVICENOW_*`, `SN_INSTANCE_*`). They have no effect on an instance from the store.
- `MAX_RECORDS` is superseded by the store's `maxRecords`, and **the default is now 100** (it was 10).
  `MAX_RECORDS` still applies on the env-defined path.
- A `prod` instance raised above `read-only` without `prodWriteAck: true` is **not loaded**; it is
  listed with `status: "not_loaded"` and the reason `PROD_WRITE_NOT_ACKNOWLEDGED`.
- New codes on the load report and on `snow_core_instance_switch`: `PROD_WRITE_NOT_ACKNOWLEDGED`,
  `INSTANCE_NOT_LOADED`, `UNKNOWN_INSTANCE`, `NO_INSTANCE_CONFIGURED`. New warnings:
  `FLAG_DEPENDENCY_VIOLATION`, `PRESET_FLAGS_MISMATCH`. The six `*_NOT_ENABLED` codes are unchanged.
- Refusal messages now name the instance and carry the command that changes it.

### Store error codes

Reported on the load report now; ARC-04-S06 lists them in the tool contract.

| Code | Meaning |
|---|---|
| `STORE_NOT_FOUND` | the path resolved but no file is there |
| `STORE_UNREADABLE` | the file exists but is not parseable JSON |
| `STORE_SCHEMA_INVALID` | schema violation, message names the field path |
| `STORE_SCHEMA_UNSUPPORTED` | written by a newer server — run `./snowarch upgrade` |
| `STORE_PERMISSIONS_TOO_OPEN` | the file is group/world-readable, or its directory is group/world-writable without the sticky bit; the message carries the `chmod`. Any other group/world directory bit is a warning, not a refusal — a 0600 file is unreadable whatever folder it sits in |

### Unchanged

- 394 tools, their names and their schemas. No tool was added or removed.

## [1.0.0] — 2026

Initial release of ServiceNow MCP Toolkit.

- 394 tools across 37 ServiceNow domains, exposed over the Model Context Protocol.
- Resource-first tool naming grammar: `snow_<domain>_<entity>_<action>`.
- Tiered write safety gates: `WRITE_ENABLED`, `CMDB_WRITE_ENABLED`, `SCRIPTING_ENABLED`,
  `NOW_ASSIST_ENABLED`, `ATF_ENABLED`, `FLUENT_ENABLED`.
- Role-based tool packages via `MCP_TOOL_PACKAGE`.
- Transports: stdio, SSE, HTTP.
- Categorised, explained record deletion (permission/ACL, reference constraint, not found).
