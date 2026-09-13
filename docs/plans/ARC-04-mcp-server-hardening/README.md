# ARC-04 — MCP server hardening and scope cut

Status: **Stories Done · acceptance closed 2026-09-13 (ARC-04 acceptance PR)** · **Open only on the owner: four criteria whose runs need a live instance — S03 c1, S08 c3, S10 c1 (Sitting C) and S14 c5, the second reader (Sitting A). Each has a written procedure with its pass condition; none is ticked until a run lands in `docs/validation/`.** · Depends on: ARC-01 (import, D-02, D-03); ARC-00 spike verdicts S-02, S-10, S-17 (behaviour ships regardless; fallbacks designed in) · Blocks: ARC-05 (contract generator), ARC-06 (committed `dist/`, unconfigured mode), ARC-07 (store schema, presets, CLI module, network-error classifier), ARC-08 (server doctor module)

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

## Acceptance criteria — ARC-04 exit evidence, recorded 2026-09-08

Every criterion with what was measured, not what was intended. "Deferred" means the check needs a
real instance and no agent in this arc holds credentials; each has a written, runnable procedure in
`packages/snowarch/tests/live/README.md`.

| # | Criterion | Status | Evidence |
|---|---|---|---|
| 1 | Unconfigured start: `initialize`, five core tools, `NO_INSTANCE_CONFIGURED` elsewhere, clean exit on stdin close | **Met** | `tests/server/unconfigured.test.ts` (real MCP client over stdio); the `no-build handshake` CI job runs it against the committed `dist/` on three OSes. *Version reads `2.0.0-dev`, not `2.0.0` — the release is ARC-09's.* |
| 2 | Per-instance flags: `switch prod` then a write → `WRITE_NOT_ENABLED`, `pdi` unaffected | **Met** | `tests/tools/gate-split.test.ts`, `tests/servicenow/context.test.ts`; S03 criterion 1's live half **deferred**. |
| 3 | `read-only` reads scripting objects; `..._add` → **`WRITE_NOT_ENABLED`** under `read-only`, and `SCRIPTING_NOT_ENABLED` only once WRITE is enabled *(corrected at ARC-04 acceptance, 2026-09-13: the row said `SCRIPTING_NOT_ENABLED` under read-only, which the test has never asserted — `tests/tools/gate-split.test.ts:136` expects `WRITE_NOT_ENABLED` with all flags false and `:142` expects `SCRIPTING_NOT_ENABLED` with write-only. That ordering is S03's ruling: the write flag is answered before the scripting flag, so an operator turning on one flag at a time is told the FIRST thing that is missing, not the last)* | **Met** | `tests/tools/gate-split.test.ts` — the split is derived from the registered catalogue, so a new `snow_scr_*` tool cannot escape it. S-10 recorded in `docs/spikes/S-10-readonly-preset-sufficiency/`. |
| 4 | `prod` + `full` + `prodWriteAck: false` → not loaded; `true` → loads | **Met** | `tests/servicenow/prod-ack.test.ts`; end to end via `SV-03` in `tests/doctor/doctor.test.ts` with both postures. |
| 5 | `orderBy: "-sys_created_on"` sorts descending | **Met (unit)** | `tests/servicenow/client-orderby.test.ts` asserts the captured URL: `active=true^ORDERBYDESCsys_created_on`. **Live half deferred** (S09 criterion 2), with an ascending negative control in the procedure. |
| 6 | `capture_target_set` then a write produces a `sys_update_xml` row in the named set | **Deferred** | S07 criterion 4. Unit gate: `tests/tools/update-set-capture.test.ts` asserts the four-call sequence and the `sys_user_preference` write. Procedure includes a negative control. |
| 7 | `npm test` green on 3 OS × Node 20/22/24; no `desktop/` tests; `permissions.ts` 100 % | **Met** | 9 green cells per run; `permissions.ts` held at 100 % by the per-file coverage threshold — which itself only started running when S03 changed `npm test` to `vitest run --coverage`. |
| 8 | `dist/contract.json` lists every tool with `gate` and `mutates`; sha printed by `contract --sha` | **Met** | 397 tools, not 398 — S08 removed `snow_rpt_report_generate` (D-03 item 5). Committed sha `b7ffa16862059fef0db0e6a167a0ad9d427e65d433fb407492363813f6f3fc60`. `tests/contract.test.ts`. |
| 9 | World-readable store refused with the `chmod` remedy; audit line per mutating call, no secrets | **Met** | `tests/store/*`, `tests/doctor/doctor.test.ts` (0644 → `SV-02 fail`, exit 1), `tests/audit/no-secrets.test.ts` (every mutating tool under `full`, fixture credentials, audit **and** stderr). |
| 10 | `grep -rn "cwd\|dotenv.config()" src/server.ts` shows only the `SNOW_ENV_FILE` branch | **Met** | S02; the guard is that `dotenv.config()` is called only for a file that exists and was named. |
| 11 | CONNECT proxy honoured, `NO_PROXY` bypasses, self-signed TLS → `TLS_CA_UNTRUSTED` naming `NODE_EXTRA_CA_CERTS` | **Met** | `tests/servicenow/proxy.test.ts` (in-process CONNECT fixture, asserted on the recorded `CONNECT host:443`) and `tests/servicenow/tls.test.ts` (generated certificate, child process for the CA variable). Three OSes; no test reaches the public internet. |
| 12 | `doctor --no-network --json` clean on a valid store, no secrets; 0644 → fail with the remedy | **Met** | `tests/doctor/doctor.test.ts`, criteria 1/3/6. |
| 13 | Fresh clone, no build: `initialize` answers on three OSes; `build-dist.mjs` produces no diff | **Met** | `no-build handshake` and `dist-check` CI jobs, three OSes each; the architect re-verified on a new clone. |
| 14 | ARC-04 owns no row in `tests/legacy-names.allowlist.json` | **Met** | ARC-04's row left with `docs/INSTALLATION.md` in S14. |

**Deferred to the owner's live sitting**, each with a runnable procedure. The paragraph used to
claim that and be false for three of the six — S03 c1, S08 c3 and S10 c1 had no procedure anywhere,
and S05's lives in a different file from the one named here. Written out per deferral, with where
each one actually is (ARC-04 acceptance, 2026-09-13):

| Deferral | Procedure |
|---|---|
| S03 criterion 1 — live flag behaviour | `packages/snowarch/tests/live/README.md` § *ARC-04-S03 criterion 1* |
| S05's S-10 observation | `docs/spikes/S-10-readonly-preset-sufficiency/PROCEDURE.md` — **not** in the live README, and the folder is `S-10-readonly-preset-sufficiency`, not `S-10-readonly-preset-sufficiency` as this file used to say |
| S07 criterion 4 — update-set capture | `packages/snowarch/tests/live/README.md` § *ARC-04-S07 criterion 4* |
| S08 criterion 3 — byte-identical `tools/list` | `packages/snowarch/tests/live/README.md` § *ARC-04-S08 criterion 3* |
| S09 criteria 2/3/4 — sort order, `event_name`, `action_insert` | `packages/snowarch/tests/live/README.md` §§ *Criterion 2 / 3 / 4* |
| S10 criterion 1 — the literal `result: "ok"` | `packages/snowarch/tests/live/README.md` § *ARC-04-S10 criterion 1*, run as the last step of S07 c4 |

All six are owner-run: the procedures are written, the runs are the owner's, and Sitting C names the
file each outcome goes into. Until a run lands in `docs/validation/`, the criteria stay unticked. **S-26** — whether any MCP client actually sends
`_meta["anthropic/maxResultSizeChars"]` — is unverified and recorded as a candidate in `03` §F, not
asserted anywhere.


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
| ARC-04-S11 | Proxy agent honouring `HTTPS_PROXY` / `HTTP_PROXY` / `NO_PROXY`; documented `NODE_EXTRA_CA_CERTS`; network-error classifier (R-3) | M | Done (2026-09-08) |
| ARC-04-S12 | Server doctor module (`src/doctor/`) and `snowarch doctor --json` | M | Done (2026-09-08) |
| ARC-04-S13 | `scripts/build-dist.mjs`; committed `dist/`; CI rebuild-and-diff | M | Done (2026-09-08) |
| ARC-04-S14 | Rewrite `packages/snowarch/README.md`, `.env.example`, `CHANGELOG.md` from code; 2.0.0 migration notes | M | Done (2026-09-08) |

Mapping to the earlier titles-only list: former stories 2 and 7 merged into S04; former story 12 split into S01 (harness, CI) and S03 (coverage); S11 added per R-3; S12 added to carry the server doctor module ARC-08 depends on. Total 31–32 engineer-days. The full former-number → story-ID table is at the top of `STORIES.md`; ARC-05/06/07 still cite this ARC by the former numbers.

### Acceptance

The acceptance pass against `docs/plans/06-ACCEPTANCE-PLAN.md` §4. One row per backlog item.

**Seven of the nine needed an instance this session never touches.** For those the deliverable is a
written procedure plus a Sitting C row and nothing else: the acceptance row says the run is the
owner's, the criterion stays unticked, and no test asserts an unrun procedure — a test red by design
is noise, which is the ruling B00-09 settled. What is NOT here, deliberately, is a `RUN_LIVE_E2E=1`
case skipped everywhere in CI: a case that has never executed is coverage in the suite listing and
nothing in fact.

**Every procedure states its pass condition as the exact output to see** — the command, the field or
line that must be there, and what a failure looks like — and every one carries a **negative control**,
because a run without its control is not a result. Placeholders only (`dev12345`, `acme`); no
instance, host, user or sys_id anywhere.

| Item | Outcome | Evidence |
|---|---|---|
| B04-01 — S03 c1: the live half of the flag refusal | **record — procedure written, run is the owner's** | `tests/live/README.md` § *ARC-04-S03 criterion 1*. Pass condition: step 2 refuses with `PROD_WRITE_NOT_ACKNOWLEDGED` and no `sys_id`; step 4, **the same call argument for argument**, returns a `sys_id` and an `INC` number. The control is that sameness — *a run where both refuse proves nothing about production*, which is exactly what the unit half already cannot answer |
| B04-02 — S08 c3: the live half of the byte-identical catalogue | **record — procedure written, run is the owner's** | `tests/live/README.md` § *ARC-04-S08 criterion 3*. Pass condition: `diff A B` produces **no output** and the discover response names `number`, `short_description`, `state`. Control: a third capture after `snow_core_instances_reload`, whose diff must NOT be empty — without it, a capture that always produced identical bytes (a cached response, a truncated file) looks exactly like a passing run |
| B04-03 — S10 c1: the literal `result: "ok"` | **record — procedure written, run is the owner's** | `tests/live/README.md` § *ARC-04-S10 criterion 1*, run as the **last step of the S07 c4 procedure** rather than separately — a second mutating call would be a second chance at a different answer. Control: one call that FAILS, whose next line must not say `ok`; a trail that writes `ok` unconditionally passes the positive half every time |
| B04-04 — S06 c3: `contract --sha` | **rework** | Nothing spawned the sub-command; the suite proved the contract file and reached past the command an operator runs. `tests/cli/contract-cli.test.ts`: exactly 64 hex characters and a newline with empty stderr (the property the whole sub-command exists for — a pipeline can compare builds without parsing JSON), stable across two runs, equal to sha256 of `dist/contract.json`, and the gates-not-prose claim asserted through computed shas rather than from memory |
| B04-05 — S01 c4 / S02 c6: the retired names | **rework** | The criterion has been false since ARC-07-S08: `src/cli/import-legacy.ts` cannot find the legacy store without naming it. Amended, and enforced as a **both-directions ratchet** — an unlisted file carrying a literal fails, and **a listed carrier that stopped carrying one fails too**, so an exemption cannot outlive its reason. Four of the five literals are asserted absent per literal, and the scan asserts it read something |
| B04-06 — S01 c5: the command set | **rework** | Superseded twice and never re-stated, and its proposed check compared `--help` against `README.md § CLI` — **a section that did not exist**; the five commands appeared together only in the acceptance plan. The section is written, and the test reads it: one source, two readers, and a command added to one but not the other fails rather than drifts. Criterion amended (`store` added, `contract` no longer exits 2) |
| B04-07 — S06 c6: the eight-tool spot-check | **rework** | Verified by hand when the story closed and guarded by nothing; the suite kept the FILE honest and said nothing about whether the file is right. Eight `it.each` rows, plus a guard that the eight are real and distinct and span at least five gates — a spot-check where every row shared one gate would prove nothing about the map |
| B04-08 — S14 c5: the second reader | **record — the run is the owner's** | No record existed anywhere, and **the author cannot be the reader**, which is the point of the criterion. A Sitting A row states the pass condition — a successful `snow_core_status_read` **without opening any file but that README** — and asks for role, date, client, redacted output, and every place the reader had to guess, because those are the finding |
| B04-09 — the deferrals paragraph and R3 | **rework** | The paragraph claimed every deferral had a procedure; **three of six had none** and a fourth pointed at the wrong file. Written out per deferral with where each one is. R3's row said `..._add → SCRIPTING_NOT_ENABLED` under `read-only`; the test has never asserted that — `gate-split.test.ts:136` expects `WRITE_NOT_ENABLED` with all flags false and `:142` expects `SCRIPTING_NOT_ENABLED` with write-only, which is S03's gate ordering: the operator is told the FIRST thing missing, not the last. Corrected, with the dead path `S-10-read-only-sufficiency` → `S-10-readonly-preset-sufficiency` fixed in all five files that carried it |
