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
