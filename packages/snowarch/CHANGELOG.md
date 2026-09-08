# Changelog

All notable changes to this project are documented here. This project adheres to
[Semantic Versioning](https://semver.org).

## 2.0.0 — Unreleased

Supersedes `snow-mcp` 1.0.0. Relicensed to Apache-2.0 and renamed to `@farstic/snowarch`; the old
npm record is neither referenced nor touched (D-01, D-02). The package version is `2.0.0-dev` until
the release is cut, so a development checkout cannot be mistaken for a release.

The sections below are grouped **Breaking · Added · Fixed · Tests · Migration from snow-mcp 1.0.0**.
The per-story detail follows them, in reverse story order.

---

### Breaking

**Nine surfaces removed (D-03).** Each was a second way in, and each is gone:

1. **HTTP and SSE transport** — `src/transport/`. stdio is the only transport.
2. **REST API** — `src/api/`. It could not exist without the HTTP transport.
3. **A2A agent routes** — `src/a2a/`, including the `/.well-known/agent.json` agent card.
4. **Web dashboard** — `src/dashboard/`.
5. **Report generator** — `src/reports/`, and with it `pdfmake` and `pptxgenjs`. The
   `snow_rpt_report_generate` tool went with it in ARC-04-S08: it had survived the cut and was
   calling a route its own implementation no longer had.
6. **Prompt catalogue** — `src/prompts/` and the MCP `prompts` capability.
7. **Direct-execution engine and LLM client** — `src/direct/`.
8. **CLI surfaces** — `setup` (and its `npm link` side effect), `auth`, `instances`, `web`,
   `capabilities`, `run`, `report`.
9. **The npm update check** — it fetched a third party's package record on every run.

**`SCRIPTING_ENABLED` no longer gates reads (R-03).** It gates *writing* scripting objects. Listing
business rules, reading a script include or exporting an update set now needs no flag at all. If you
raised `SCRIPTING_ENABLED` only to read, you can lower it.

**Store precedence is `SNOW_STORE` → project → global, first hit wins, never merged.** A missing
file named by `SNOW_STORE` is an **error**, not a reason to fall back — a typo in an explicit
override must not silently load a different instance.

**The legacy store is not read.** `~/.config/servicenow-mcp/instances.json` and
`SN_INSTANCES_CONFIG` are ignored; `./snowarch instance import --from-legacy` (ARC-07) will migrate
one.

**The current directory's `.env` is not read.** Set `SNOW_ENV_FILE` to name one. For an MCP server
the current directory is your project, and an unrelated `WRITE_ENABLED=true` there would arm writes
nobody chose.

**`MAX_RECORDS` defaults to 100, not 10**, and is per-instance (`maxRecords` in the store) rather
than process-global.

**A per-call `instance` argument no longer routes.** No tool's schema declared one, so it was an
undocumented side channel that could send a write to a different instance than the session believed
it was addressing. `snow_core_instance_switch` is the only way to change instance.

**`snow_disco_table_discover` no longer mints tools.** It used to add
`dynamic_query_<table>`, `dynamic_create_<table>` and three more to `tools/list` for the rest of the
session. It returns the columns as data now; use `snow_core_records_query` and its siblings, which
are declared, gated and in the contract.

**`snow_us_active_update_set_ensure` requires `name`** and returns only *your* in-progress update
sets. It used to take any set with `state=in progress` — on a shared instance, whoever opened one
last.

**`snow_deploy_background_script_exec` and `snow_fluent_script_exec` always refuse** with
`UNSUPPORTED_ON_THIS_INSTANCE`. Server-side script execution has no supported REST endpoint. They
stay registered so the refusal is clear rather than reading as a typo.

**The server starts with no instance configured** and advertises five core tools instead of failing.
That is a supported state.

**`REDACT_SENSITIVE_DATA` defaults to ON.** It was opt-in, so an unset variable — the normal case —
printed passwords and Authorization headers.

### Added

- **An audit trail.** One JSON line per state-changing call, in `<store dir>/audit.jsonl`; rotated
  at 10 MB, three kept; refusals recorded with their code; never payloads, credentials or the
  instance URL. `@farstic/snowarch/audit` exports it.
- **Proxy and CA support.** `HTTPS_PROXY`, `HTTP_PROXY`, `NO_PROXY` and `NODE_EXTRA_CA_CERTS` are
  honoured, and network failures are classified — `DNS_FAILURE`, `TLS_CA_UNTRUSTED`,
  `PROXY_UNREACHABLE`, `CONNECTION_REFUSED`, `CONNECTION_TIMEOUT` — each with a remedy naming the
  variable actually set.
- **A doctor.** `snowarch doctor [--json] [--no-network]`, nine checks `SV-00`…`SV-08`, exit 0/1/3,
  exported as `@farstic/snowarch/doctor`.
- **A tool contract.** `dist/contract.json` carries every tool with its gate, `mutates` and table,
  generated from the registrations rather than written down twice.
- **`snow_us_capture_target_set`.** Points REST update-set capture at a named set through
  `sys_user_preference` — which is what the API actually honours.
- **A result-size cap.** One call cannot flood a conversation: the client's `_meta` ceiling, else
  `SNOW_MAX_RESULT_CHARS`, else 100,000 characters.
- **A committed `dist/`.** A clone plus `npm ci` is a runnable install; CI rebuilds and diffs it.
- **Per-instance flags, presets and a prod-write acknowledgement.** A `prod` instance raised above
  `read-only` is refused unless `prodWriteAck` is set.

### Fixed

- **Descending sort returned ascending order.** `orderBy: '-field'` built
  `ORDERBY<field>^ORDERBYDESC` — two terms, the first ascending and the second a bare operator with
  no field. ServiceNow accepts that and sorts ascending, so every "newest first" query returned the
  oldest records and looked like it had worked.
- **`snow_intg_event_register` registered nothing usable.** It wrote `name`; `sysevent_register`
  matches on `event_name`.
- **A business rule created through the server fired on nothing.** The four `action_*` flags were
  omitted entirely, and a `sys_script` row with none set never runs — while looking correct in the
  UI list.
- **Five tools wrote to the instance while declaring `mutates: false`**, so the generated approval
  list omitted them.
- **A successful `DELETE` (204) was reported as `DELETE_NOT_FOUND`** — the empty body was parsed as
  JSON, which threw, which triggered a retry, whose second DELETE 404'd.
- **`maskPath` could be switched off by an environment variable.** It masked against `$HOME`, so a
  process started with HOME elsewhere printed absolute paths carrying the account name.
- **`maxRetries` / `retryDelayMs` / `requestTimeoutMs` could not be set to zero** — they were
  defaulted with `||`, under which a configured `0` is falsy.

### Tests

1,033 tests across 43 files, on three operating systems × Node 20/22/24. Beyond the unit suites:
a real MCP client over stdio for the unconfigured server and the tool list; a recording fake REST
client for update-set capture and payload shapes; a live CONNECT proxy and a generated self-signed
TLS certificate for the network paths; a whole-catalogue sweep asserting no credential reaches the
audit file or stderr; a rebuild-and-diff of the committed `dist/`; and generated-block checks for
this package's own documentation.

The live halves — anything needing a real instance — are deferred with written procedures in
`tests/live/README.md` rather than mocked into a pass.

### Migration from snow-mcp 1.0.0

1. **Move your instance configuration.** The legacy `~/.config/servicenow-mcp/instances.json` is no
   longer read. Recreate it as a store (see the README), or wait for
   `./snowarch instance import --from-legacy`.
2. **Check your flags.** If `SCRIPTING_ENABLED` was on only for reading, turn it off.
3. **Name your `.env`.** Set `SNOW_ENV_FILE`; the current directory's file is ignored.
4. **Re-check your limits.** `MAX_RECORDS` now defaults to 100 and belongs on the instance.
5. **Stop passing `instance` per call.** Use `snow_core_instance_switch`.
6. **Replace `dynamic_*` tool calls** with `snow_core_records_query` and its siblings after
   `snow_disco_table_discover`.
7. **Update HTTP callers.** There is no HTTP transport, REST API, dashboard or A2A endpoint. stdio
   only.
8. **`LOG_LEVEL` still works** as a fallback for `SNOW_LOG_LEVEL`; prefer the new name.

---

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

### Removed (ARC-04-S14) — the package's own `docs/` folder

All eleven package documents are gone: `INSTALLATION.md`, `CLIENT_SETUP.md` (which never existed —
the plan's list predates the import), `MULTI_INSTANCE.md`, `TOOLS.md`, `EXAMPLES.md`,
`instances.example.json`, the package `CONTRIBUTING.md` (folded into the repository's), and the six
per-family guides `ATF.md`, `NOW_ASSIST.md`, `REPORTING.md`, `SCRIPTING.md`,
`SERVICENOW_OAUTH_SETUP.md` and `TOOL_PACKAGES.md`.

They were deleted because they were **wrong, and could not notice**. `REPORTING.md` claimed 13
reporting tools where the catalogue has 17; `TOOL_PACKAGES.md` listed eight role bundles where the
code has thirteen, each with a hand-counted total that had drifted (`400+` for `full`). What a
reader needs from them is now either generated from `dist/contract.json` — the family table, the
bundle table, the preset table, the error codes — or written into the README once: the two
authentication methods with the OAuth application-registry steps, and what `MCP_TOOL_PACKAGE` does.

**`SERVICENOW_OAUTH_SETUP.md` carried the last copy of the 1.x placeholder OAuth client id in the
tree.** It leaves with the file. The two `.gitleaksignore` fingerprints for it stay: `gitleaks git`
walks history, so the findings remain in the commits that carried them, and a fingerprint is pinned
to a commit rather than to a path that still exists.

### Added (ARC-04-S13) — `dist/` is committed, and CI proves it matches the source

A clone plus `npm ci` is now a runnable live install: no TypeScript, no build step, nothing for a
first-time user to get wrong (P-20). The price of a build artefact under version control is that it
can go stale, and the only thing that makes it honest is that CI rebuilds it and diffs it — the
`dist-check` job runs `node scripts/build-dist.mjs` and `git diff --exit-code` on three OSes, and a
separate `no-build` job exercises the *committed* file with no build step at all, which is the state
a user is actually in.

`scripts/build-dist.mjs` removes `dist/` first — an incremental build leaves the output of deleted
source files behind, and a stale `dist/x.js` with no `src/x.ts` would be committed once and then
match forever. It prints the contract sha256 on the last line, which is what ARC-05-S01 pins.

Reproducibility rests on three things: `tsconfig.build.json` (no source maps, `newLine: lf`, comments
kept, `src/cli/**` included so the committed dist has a CLI); `typescript` pinned **exactly**, since a
minor upgrade regenerates every file and that is a maintainer's deliberate commit rather than
something a fresh `npm install` does to a contributor mid-PR; and `.gitattributes` marking
`dist/**` `linguist-generated=true text eol=lf` — without the LF rule a Windows checkout rewrites every
line. `merge=ours` is deliberately not set: it would resolve every `dist/` conflict silently in favour
of the current branch.

134 files, **1.5 MB**, no `.map`.

### Added (ARC-04-S12) — a server doctor, and `snowarch doctor --json`

`snowarch doctor [--json] [--no-network] [--section server]` runs nine checks and prints one line
each, or the report object with `--json`. `@farstic/snowarch/doctor` exports the same runner so
ARC-08 can merge this report with its engine checks — the runner returns data rather than printing,
because a doctor that only prints has to be re-implemented to be composed, and two implementations of
the flag rules diverge (P-16).

`SV-00` Node floor · `SV-01` dist artefacts and contract sha · `SV-02` store source, schema and modes
(skipped on Windows, where permissions are ACL-inherited) · `SV-03` per-instance URL, flags, prod
posture · `SV-04` network probes (a declared interface with a `skip` stub until ARC-07-S03) · `SV-05`
a real stdio handshake against `dist/server.js`, comparing advertised names to `dist/contract.json`
and naming the differing ones · `SV-06` `snow_core_capabilities_read` equals the store entry · `SV-07`
the audit file's location is writable · `SV-08` ancestor `.claude/skills` directories, which silently
double the roster.

Exit **0** when nothing failed, **1** on any failure, **3** when the doctor could not run at all — a
caller scripting against it needs to tell "checks failed" from "the tool is broken".

### Fixed (ARC-04-S12) — `maskPath` could be switched off by an environment variable

It masked against `homedir()`, which returns `$HOME` when that is set — so a process started with HOME
pointed elsewhere masked nothing and printed absolute paths containing the real account name. It now
also masks against `userInfo().homedir`, which reads the OS user database. Found when the doctor's
`SV-08` printed an ancestor path under a fixture HOME, which is the check whose output is most likely
to be screenshotted.

Separately, `SV-02` on a group-readable store reported the generic `STORE_PERMISSIONS_TOO_OPEN` error
and threw away its own, more specific remedy — the reader got "correct the store file" where they
could have had the exact `chmod`.

### Added (ARC-04-S11) — proxy support, a documented CA path, and errors that name the cause

**Every request now goes through one HTTP seam that honours `HTTPS_PROXY`, `HTTP_PROXY` and
`NO_PROXY`.** Node's built-in `fetch` ignores them — that is the specification, not a bug — so on a
corporate laptop the server failed with a bare `fetch failed` while `curl` to the same URL worked,
which reads as "the tool is broken". `src/servicenow/http.ts` wraps undici's `fetch` with an
`EnvHttpProxyAgent`; `undici` is pinned to exactly **6.28.1**, the newest major whose `engines.node`
admits this package's declared floor of 20.0.0 (8.x needs ≥22.19.0, 7.x needs ≥20.18.1 — 7.x would have
passed CI while breaking the floor we advertise). Production footprint: 15.3 MB against an 80 MB
ceiling.

**Empty proxy and CA variables are deleted at start-up.** `src/env-sanitise.ts` is imported *first* by
both entry points, because `EnvHttpProxyAgent` reads the environment when it is constructed and ESM
evaluates imports before the importing module's body. ARC-06 forwards these as `${HTTPS_PROXY:-}`,
which expands to an empty string rather than omitting the entry — and an empty string is not a valid
proxy URL, so without this a laptop with no proxy at all would stop reaching ServiceNow the moment the
forwarding was added.

**`NODE_EXTRA_CA_CERTS` is documented per OS** in the package README's new "Corporate networks"
section, with the Keychain / `certmgr.msc` export steps, and with a standing warning never to use
`NODE_TLS_REJECT_UNAUTHORIZED=0` — on a network that intercepts TLS it means trusting the interceptor
and every other certificate too.

**Network failures are classified.** `classifyNetworkError` walks the `cause` chain (undici nests the
real reason two levels down) and returns one of `DNS_FAILURE`, `TLS_CA_UNTRUSTED`, `PROXY_UNREACHABLE`,
`CONNECTION_REFUSED`, `CONNECTION_TIMEOUT` or `NETWORK_ERROR`, each with a remedy naming the variable
actually set. The same system code means different things depending on context: `ECONNREFUSED` with a
proxy configured is the *proxy* refusing — the client never opened a socket to the instance — so
reporting it as a connection failure would send the user to check a host that was never contacted.
Proxy URLs are masked wherever they are printed: `http://user:pass@proxy:8080` renders as
`http://***@proxy:8080`, since the host and port identify the proxy while the credentials identify the
user. The five new codes are in the error registry, the contract and `docs/TROUBLESHOOTING.md`.

### Added (ARC-04-S10) — an audit trail, and redaction that is on by default

**One JSON line per mutating call, in `<store dir>/audit.jsonl`.** §2.1 says a write needs "write
approved"; before this, that was provable only from a conversation transcript, which the reviewer
asking the question does not have. The line is
`{ ts, instance, environment, tool, gate, table, sysId, query, result, ms, source, note? }`.

What it omits is the design. **No payload** — `fields`, `data`, `script` and the response body never
appear, because a trail recording what was written is a second copy of client data in a checkout.
**No credential. No instance URL** — the label identifies the instance, and this file gets pasted into
tickets. `query` IS recorded and can carry personal data (`caller_id=…`): it is the filter that selected
the records, without it a line answers nothing, and the engine already had the string. The README says
so, and `SNOW_AUDIT_FILE=off` is the way out.

Refusals are written with their code — `WRITE_NOT_ENABLED` against a table on a date is the evidence
that the gate held. Non-mutating tools append nothing. `snow_core_instance_switch` is audited under the
new `sessionMutates` declaration with `table`/`sysId`/`query` null and a `note` naming the destination,
because it redirects where every later write lands. A write failure warns exactly once per process and
never fails the tool call; appends are synchronous, so nothing is buffered to lose on an abrupt exit.
0600 in a 0700 directory, rotating at 10 MB keeping three. `@farstic/snowarch/audit` exports
`appendAudit` / `tailAudit` / `readAuditTail` for ARC-07's CLI lines (`source: "cli"`).

**`sessionMutates` on `ToolDefinition`.** Resolves the gap ARC-04-S09 raised rather than papering over
it. `mutates` keeps meaning "changes ServiceNow records" — so contract test (c) still enforces a gate on
every one — and the new field carries "changes which instance subsequent calls address".
`snow_core_instance_switch` is the only tool that declares it, and ARC-05-S07's ask-list generator unions
the two. `snow_core_instances_reload` stays out: ARC-07's `--resume` depends on it not prompting.

### Changed (ARC-04-S10) — redaction defaults to ON

`REDACT_SENSITIVE_DATA` was opt-in (`=== 'true'`), so an unset variable — the normal case — printed
passwords and Authorization headers. It is now `!== 'false'`: a default that has to be switched on
protects nobody who did not already know to switch it on, and the people most likely to paste a log into
a ticket are the ones who never set it. `REDACT_SENSITIVE_DATA=false` still opts out for local
debugging, and is documented as dangerous.

Scrubbing now also matches credential-shaped **string values** (`/^(Basic|Bearer)\s+\S+/i`) anywhere in
logged data, not only keys named like secrets — the same string reached the log unscrubbed whenever it
arrived under an innocent key. It over-redacts prose beginning "Basic " and that trade-off is asserted
in the tests: over-redaction costs a word in a log line, under-redaction publishes a credential. An
eslint rule additionally forbids passing `headers` to the logger anywhere in `src/servicenow/`, because
redaction is a runtime behaviour with an opt-out and a lint failure is not.

### Fixed (ARC-04-S10) — three defects the new tests found

**`client.ts` could not express zero.** `maxRetries`/`retryDelayMs`/`requestTimeoutMs` were defaulted
with `||`, so a configured **0** is falsy and silently became 3 retries with a 1 s base delay. `MAX_RETRIES=0`
did nothing and nothing said so — found when an audit test that set both to 0 took seven seconds a call,
which is exactly 1 + 2 + 4 of exponential backoff. Now `??`.

**The audit `note` was built from `args.name`.** The no-secrets sweep passes the payload marker as every
argument and found it in the audit file through that field. A caller-supplied string in an audit line is
a payload channel however innocuous the field sounds; the note is now built from server-side state (the
destination label read back from the instance manager), and a refused switch echoes nothing at all.

**The debug query log printed the authenticated username.** `snow_us_active_update_set_ensure` builds
`…^sys_created_by=<username>` (ARC-04-S07), and at debug level that went straight to stderr. The client
now replaces its own account name in the logged query with `<user>`.

### Fixed (ARC-04-S09) — three defects that failed silently

Each of these returned a success. None of them raised an error, and all three had a documented
workaround because the only way to notice them was to check the result by hand.

**Descending sort returned ascending order** (P-26). `orderBy: '-sys_created_on'` built
`ORDERBY<field>^ORDERBYDESC` — two terms, the first sorting ascending and the second a bare operator
with no field. ServiceNow accepts that and sorts ascending, so every "newest first" query returned the
OLDEST records and looked like it had worked. The encoded form is one term, `ORDERBYDESC<field>`.
Multiple fields are now joined one term per field, each keeping its own direction
(`-priority,sys_created_on` → `ORDERBYDESCpriority^ORDERBYsys_created_on`). The
`servicenow://query-syntax` resource states the same grammar and names the wrong form explicitly.

*Retires the workaround in the legacy setup text. **ARC-02's docs rewrite must delete two passages
from `scripts/legacy/SETUP.md`:*** the troubleshooting row at **line 138** (*"No error, but the answer
is wrong … Never use `orderBy: \"-field\"`. Put the sort in the encoded query instead"*) and the
smoke-test sentence at **line 154** (*"If the newest is years old, `orderBy` has been used instead of
an `ORDERBYDESC` encoded query — see the troubleshooting row above."*). Both describe a defect that no
longer exists; left in place they teach users to avoid a parameter that now works.

**`snow_intg_event_register` registered nothing usable** (platform field notes §4). It wrote
`{ name, table, description }`, but `sysevent_register`'s matching key is `event_name` — `name` exists
as a column and is not what the platform matches on. The row was created, a sys_id came back, and
`event_name` read back empty. The body now carries `event_name`, a `suffix` derived from everything
after the first dot segment (empty for a single-segment name, as the UI produces), and an optional
`fired_by`; the response echoes `event_name`.

**A business rule created through the server fired on nothing** (platform field notes §5).
`snow_scr_business_rule_add` omitted the four `action_*` flags entirely, and a `sys_script` row with no
action flags never runs — while appearing in the UI list looking exactly like a working rule. All four
are now always sent as booleans, defaulting to the platform's own form: `action_insert` and
`action_update` true, `action_delete` and `action_query` false. Each is settable, an explicit `false` is
honoured, and the description states the defaults. `snow_scr_business_rule_modify` is unchanged — it
takes an explicit field map, and defaulting anything there would silently re-enable a flag the caller
had turned off.

**Five tools wrote to the instance while declaring `mutates: false`.** Found by a source scan while
fixing the first of them, not by the story. `mutates` is what the §2.1 ask-list is generated from
(ARC-05-S07), so each was a write that would never prompt: `snow_intg_event_register`,
`snow_chg_change_for_approval_submit`, `snow_flow_flow_test`, `snow_sec_vulnerabilities_scan`,
`snow_cfg_set_properties_bulk` — the last of these named in `03` S-23 as one of the 14 that MUST be in
that list. Every gate was correct and every refusal was correct; only the label the contract generator
reads was wrong, which is why no gate test could see it. `tests/tools/mutates-audit.test.ts` now scans
each tool's case body for create/update/deleteRecord and fails on any that declares `mutates: false`.

**Known gap, raised not closed: `snow_core_instance_switch` still does not appear in the ask-list.**
S-23 names it among the 14, but it changes no ServiceNow record — declaring `mutates: true` would break
the "a tool that mutates is never ungated" invariant unless it also gained a write gate, and gating it
would stop a read-only session from switching instances to *read* another one. Overloading `mutates` to
also mean "changes session state" would make one field carry two meanings. The generator needs a second
source; the exception is declared in `tests/tools/mutates-audit.test.ts` with a test asserting it is
exactly one tool and that it is still a gap, so it cannot be mistaken for completeness.

### Changed (ARC-04-S08) — `tools/list` is the same list all session, and results have a ceiling

**The runtime-generated `dynamic_<op>_<table>` tools are gone.** `snow_disco_table_discover` used to
MINT tools: discovering `u_widget` added `dynamic_query_u_widget`, `dynamic_create_u_widget` and three
more to `tools/list` for the rest of the session. A catalogue that changes shape cannot be described by
`contract.json`, cannot be cached by any client, and — the part that mattered — minted *write* tools
whose names did not exist until runtime, so no parity or gate test ever walked them. Discovery now
returns the columns as data (`{ table, source: 'instance' | 'cache', columns: [...],
cache_expires_in_minutes }`) and the caller uses `snow_core_records_query`,
`snow_core_record_add` and their siblings, which are declared, gated and counted.
`schema-cache.ts` is a column cache and nothing else.

**Removed: `snow_rpt_report_generate`.** It POSTed to a report-generation endpoint that is not part of
the REST API — the reason the D-03 surface cut removed `src/reports/` and the `pdfmake` / `pptxgenjs`
dependencies (**D-03 item 4**, "Report generator"). The tool survived that cut and had been calling a
route its own implementation no longer had. Tool count: **398 → 397.**

**`snow_deploy_background_script_exec` and `snow_fluent_script_exec` are `[Unsupported]` stubs.**
Server-side script execution has no supported REST endpoint. Both stay *registered* — deleting the
names would turn a clear refusal into `UNKNOWN_TOOL`, which reads as a typo — and both now throw
`UNSUPPORTED_ON_THIS_INSTANCE` **before any HTTP request**, naming the UI route that does work
(Scripts - Background, or a Fix Script). `ServiceNowClient.executeScript` is deleted.

**`snow_fluent_script_exec` is gated `scripting`, not `write`.** Its handler always called
`requireScripting()`; the declaration said `write`, so the generated ask-list under-reported it and a
caller reading the contract would have believed WRITE alone was enough.

**A per-call `instance` argument no longer routes.** No tool's `inputSchema` declared one, so it was an
undocumented side channel that could send a write to a different instance than the session believed it
was addressing. `snow_core_instance_switch` is the only way to change instance; an `instance` argument
is now ignored rather than refused, since it was never advertised.

**Results are capped.** Every `CallTool` result passes through `resolveCap` / `capResult`:
`_meta["anthropic/maxResultSizeChars"]` if the client sent a positive number, else
`SNOW_MAX_RESULT_CHARS`, else 100,000 characters. A records-shaped result drops whole records from the
end and gains `{ truncated: true, returned, total_fetched, hint }` — still valid JSON; anything else is
cut with `… [truncated at <cap> chars]`. A result under the cap is untouched and gains **no**
`truncated` key. Capping happens in the one place every result already passes through, so a new tool is
capped by existing rather than by its author remembering to. *(Whether any client actually sends that
`_meta` key is unverified — recorded as S-26 in `docs/plans/03-RISKS-AND-UNKNOWNS.md`, not asserted
here.)*

### Changed (ARC-04-S07) — §2.2 is now four calls, and it captures what you meant

**`snow_us_active_update_set_ensure` now requires `name` and returns only YOUR in-progress update
sets.** It used to take any set with `state=in progress`, with no user filter — on a shared instance
that is whoever opened one last, and the engagement's objects landed in a stranger's update set. It also
set `is_default: true`, which does nothing for REST capture at all.

**New: `snow_us_capture_target_set`.** REST writes are captured according to the authenticated user's
`sys_user_preference` `name=sys_update_set` (`docs/nowaikit-field-notes.md` §1). This tool sets it, in
four steps: read the update set (refusing one that is not `in progress`), resolve the account in
`sys_user`, look for an existing preference, then PATCH or POST it. Neither tool's response carries the
user name.

`snow_us_update_set_switch`'s description now says what it does and does not do: it sets `is_default`
for the UI and **does not** change what REST writes are captured into.

The protocol is now:

```
snow_us_active_update_set_ensure { name }   →  snow_us_capture_target_set { update_set_sys_id }
  →  <your write>  →  snow_us_update_set_preview
```

Catalogue 397 → 398.

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

### Known limitations carried from snow-mcp 1.0.0

Seven behaviours were recorded against the 1.0.0 server on a PDI. Four are fixed in 2.0.0 and have a
test that fails if they come back; one is verify-only against a live instance; two remain open. The
platform-side findings from the same journal are `docs/PLATFORM-NOTES.md` — a fact about ServiceNow
belongs there, a fact about this server belongs here.

| # | 1.0.0 behaviour | State in 2.0.0 |
|---|---|---|
| 1 | `update_set_switch` set `is_default: true` and did not change the capture target | **Fixed.** `snow_us_capture_target_set` writes the user preference; `tests/tools/update-set-capture.test.ts` asserts the four requests it issues and that a completed set is refused |
| 2 | `background_script_exec` / `sys_script_execution` unavailable on a PDI, surfaced as a transport error | **Fixed.** Refused with `UNSUPPORTED_ON_THIS_INSTANCE` and a message naming Scripts - Background; `tests/tools/unsupported-stubs.test.ts` |
| 3 | `event_register` left `event_name` empty | **Fixed.** `tests/tools/integration-event.test.ts` — a dotted name splits into `event_name` and suffix, a single-segment name gets an empty suffix, and the response echoes `event_name` |
| 4 | `business_rule_add` did not set `action_insert` / `action_update` | **Fixed.** `tests/tools/script-business-rule.test.ts` |
| 5 | `flow_add` / `flow_action_add` create empty shells — the flow record exists, its logic does not | **Open in 2.0.0.** Not fixed: a flow's contents are not addressable over the Table API. Build the flow in Flow Designer; the tool is for the record, not the logic |
| 6 | `record_remove` on a scripting table returned `NOT_FOUND` while the row was in fact deleted | **Verify on a live sitting.** No fixture can prove it — the claim is about what the instance does after the call. Procedure in `packages/snowarch/tests/live/README.md` |
| 7 | `sysevent_register` deletion over the API was never verified either way | **Open, unverified.** Not a known defect and not a known-good path; it has simply never been exercised |

Items 5 and 7 are the only ones a user can still be surprised by. Items 1–4 are regressions if they
reappear, which is what their tests are for.

## [1.0.0] — 2026

Initial release of ServiceNow MCP Toolkit.

- 394 tools across 37 ServiceNow domains, exposed over the Model Context Protocol.
- Resource-first tool naming grammar: `snow_<domain>_<entity>_<action>`.
- Tiered write safety gates: `WRITE_ENABLED`, `CMDB_WRITE_ENABLED`, `SCRIPTING_ENABLED`,
  `NOW_ASSIST_ENABLED`, `ATF_ENABLED`, `FLUENT_ENABLED`.
- Role-based tool packages via `MCP_TOOL_PACKAGE`.
- Transports: stdio, SSE, HTTP.
- Categorised, explained record deletion (permission/ACL, reference constraint, not found).
