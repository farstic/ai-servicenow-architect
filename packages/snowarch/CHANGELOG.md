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
