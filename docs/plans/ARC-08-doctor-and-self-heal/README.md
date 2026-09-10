# ARC-08 — Doctor, self-heal and the session banner

Status: **In progress — S01–S08 merged (8 of 11), started 2026-09-10** · Depends on: ARC-04 (server doctor module), ARC-05 (data-driven names), ARC-06 (state file, toggles), ARC-07 (probes); ARC-00 S-05/S-06/S-13 · Blocks: ARC-09 (CI uses the doctor), ARC-10 (cutover checks)

Decisions applied: D-01…D-06, Q-A, Q-B, R-1…R-3 (see `02-DECISIONS-NEEDED.md`). Naming used here: server package `packages/snowarch` (`@farstic/snowarch`, first release `2.0.0`); MCP key `servicenow` → tools `mcp__servicenow__snow_*`; project skill `/snowarch` with sub-commands `status` · `setup-instance` · `doctor`; engine checks `E-xx`, server checks `SV-xx` (the `S-xx` prefix is reserved for the spikes in `03`); vocabulary Mode `design-only` | `live`, Preset `read-only` | `pdi-developer` | `full` | `custom`.

## Goal

One command, one merged report, one authoritative `Mode:` line: an engine doctor and a server doctor with stable check IDs, a `--fix` whitelist that repairs what is safe and prints the exact command for what is not, a SessionStart banner that keeps the engine truthful about its mode every session, and a generated troubleshooting catalogue so every failure names its remedy.

## Why it exists

Closes P-16 (bash-only doctor that needs Node anyway and prints the username), P-17 (the reference install fails its own doctor — the new installer must produce a passing doctor on first run), the mode-detection half of P-05/P-21 (the engine no longer parses `~/.claude.json`; it asks the server), P-03 at runtime (`*_NOT_ENABLED` mapped to `set-preset`), and P-34 (stale registrations with secrets detected). The existing `scripts/doctor.sh` is the most precise specification of a correct install (39 checks, `00` §3.9); this ARC preserves every check's intent under the new sources.

## Scope

**In:** `tools/snowarch/lib/doctor/` (engine checks E-xx), `packages/snowarch` doctor module (server checks SV-xx), the merged report and JSON schema, `--quick|--no-network|--fix|--section|--json`, the D-id mapping table, `hooks/session-start.mjs`, the `/snowarch status` skill body, `docs/TROUBLESHOOTING.md` consumption, stale-registration and legacy-store detection, the D-04 cloud-sync-folder WARN and the R-3 proxy/CA host check.
**Out:** the checks' underlying fixes in other ARCs; upgrade (ARC-09); the probes themselves (ARC-07); `instance import --from-legacy` (ARC-07).

## Deliverables

- Engine checks E-00 … E-27 (each with id, title, severity, remedy, `fixable`): CLI floor and login; git floor; repo root; `.mcp.json` / `.claude/settings.json` hashes and placeholder defaults; credential-shaped keys absent; docs corpus present, pin, branch, sparse set, citations; roster from directory listing; description lengths; retired names; prefix consistency (`engine.config.json` ↔ `.mcp.json` ↔ rule file); generated files fresh; stale `~/.claude.json` entries for this folder (`servicenow-mcp`, `nowaikit`) → prints `claude mcp remove <name> -s local` and the `.bak-*` reminder; legacy `~/.config/servicenow-mcp/` present → prints `./snowarch instance import --from-legacy`; checkout under a cloud-sync folder (OneDrive/Dropbox/iCloud/Google Drive) → WARN (D-04); proxy/CA environment (`HTTPS_PROXY`, `NO_PROXY`, `NODE_EXTRA_CA_CERTS`) inspected with masked values and echo of the network classifier code (R-3); Claude Code registration status via `claude mcp get servicenow` compared with the recorded mode (`03` R-13; expected by ARC-06-S01/S05); capability packs (docx / PDF QA / draw.io / Mermaid) reported as capabilities; Windows notes (file modes ACL-inherited).
- **The S-03 fallback does not exist yet (ARC-06-S11, 2026-09-09).** If the Windows sitting shows
  that Claude Code does not expand `${CLAUDE_PROJECT_DIR}` in `.mcp.json` on native Windows, the
  bootstrap will write a per-machine local override (`claude mcp add-json … -s local`) and record
  `mcpJsonOverrideSha` in the state — and E-07 verifies that sha. Until the spike runs there is
  nothing to check, and this line exists so its absence is a decision rather than an oversight.
- **Doctor candidate raised by ARC-06-S05 (2026-09-09): `.claude/settings.local.json` unparsable.**
  B07 refuses invalid JSON and changes nothing — but its inputs hash (mode, Node presence, hooks
  branch, registration) deliberately does **not** include the file's content, so on a checkout that
  has already bootstrapped once the step reports `ok (cached)` and never re-reads it. That is the
  hash table behaving as ARC-06-S03 specifies; it means the bootstrap is the wrong place to notice
  a file that became unparsable afterwards, and the doctor is the right one. Add it as an E-check
  with the same sentence B07 prints, and `--fix` must NOT rewrite it — the file belongs to the
  operator.
- Server checks SV-00 … SV-07 (from `packages/snowarch` `doctor`): Node floor; `dist/server.js` and module resolution; store presence, schema, modes; per instance: URL shape, auth probe (basic and ROPC), per-preset probes, six flags explicit and dependency-consistent, `toolPackage == full`, `@servicenow/sdk` when FLUENT; MCP stdio handshake against the real `dist/server.js` with tool set == contract; `snow_core_capabilities_read` == store; audit log present and writable.
- `docs/ARCHITECTURE.md` appendix: mapping table old `D00–D37` → new `E-xx`/`SV-xx` (every old intent accounted for; D19/D20 path checks and D36 prefix check re-targeted; D32/D33 probes moved to the server module).
- `--fix` whitelist (idempotent, reported): deps → B04; docs missing/unsparse → B02; pin drift → `git submodule update --checkout`; flags < 6 → explicit `"false"`; store modes → chmod; toggles → rewrite for recorded mode; stale `doctor-last.json` → re-run. Never: credentials, `.mcp.json`, `~/.claude*`.
- `hooks/session-start.mjs` (exec form, `timeout` 10 s, < 300 ms typical): reads `.local/doctor-last.json`, re-runs the offline `--quick` subset when older than 24 h or when `.mcp.json`/store mtime changed; prints one line (`Mode: …`), plus first-run nudge, upgrade nudge, stale-registration nudge; never prints secrets; never blocks.
- `/snowarch status` skill: runs `./snowarch doctor --quick --json` and prints Mode line, engine version, docs pin, roster, capability packs. When `node` is not on PATH (design-only install without Node) it reads `.local/bootstrap-state.json` instead and reports the mode with "doctor unavailable until Node 20+ is installed".
- Output redaction: usernames masked, secrets as `set (len n)`; `--json` schema documented for the skill and CI.
- Runtime error mapping in the generated rule file (stop, no retry, remedy verbatim) and VALIDATION-TESTS T-19 (`AUTHENTICATION_FAILED`) / T-20 (`*_NOT_ENABLED`).
- CI: doctor after the design-only bootstrap on three OSes, JSON snapshot test, redaction and stale-registration fixture tests, banner timing.

## Dependencies

ARC-04-S02/S04/S11/S12 (store module, `snow_core_capabilities_read`, network classifier codes, server doctor module boundaries), ARC-05-S03/S04/S05/S06/S08/S10 (lint library, rule renderer, error-code registry, contract loader), ARC-06-S01/S02/S04/S05/S06/S07/S08/S12/S14 (committed files, CLI skeleton, steps as functions, toggles, B08, CI bootstrap job), ARC-07-S03/S08/S09/S10/S11 (probes, `import --from-legacy`, `setup-instance` skill branch, `ruleText` for the wizard's codes, live E2E harness), ARC-03-S05/S06/S11 (`docs sync`, `docsStatus()`, E-12 text), ARC-02-S02/S07/S10/S11/S13 (lint rule ids, `gen-roster.mjs --json`, platform note, `/snowarch` skill file, `tests/VALIDATION-TESTS.md`), ARC-01-S04 (`engine.config.json`), ARC-00 S-01/S-05/S-06/S-20 verdicts and ARC-00-S04/S06/S13 (S-01 status strings, S-05/S-20 verdicts, Windows recipe). ARC-09-S04 (`./snowarch version` — the `engine.tag` field) and ARC-09-S07 (`upgrade-check.json`) are optional inputs; ARC-09-S08 later places the doctor CI job on its final cells. Two state-file keys are required of ARC-06-S03/S05/S12 by S02/S03: `hooksDisabledByBootstrap` and `registration`.

## Acceptance criteria

- [ ] On the reference machine after ARC-06/07, `./snowarch doctor` reports **0 FAIL**; the old `scripts/doctor.sh`'s four failures (dead citations, absent NOW_ASSIST/FLUENT, retired names) are impossible by construction and covered by E-checks that pass. (S02, S05, S11)
- [x] Every check id from the old doctor appears in the mapping table with its new id or an explicit "retired because …" reason. (S07 — `docs/ARCHITECTURE.md` appendix, rendered from `tools/snowarch/lib/doctor/mapping.mjs`; `tests/doctor/mapping.test.mjs` asserts all 38 ids both ways against `scripts/legacy/doctor.sh`, 2026-09-10)
- [ ] `./snowarch doctor --json` output pasted into a chat contains no secret and no clear-text username (test greps the JSON for the fixture credentials). (S01, S03, S04, S11)
- [ ] `--fix` repairs a store entry with four flags, a docs checkout with a wrong sparse set, and a missing `settings.local.json` toggle in one run, and reports each; it refuses to touch `.mcp.json` when its hash differs and prints the `git checkout -- .mcp.json` command instead. (S06)
- [ ] The SessionStart banner appears within 1 s of session start on the CI machines and shows `Mode: design-only` or `Mode: live — …` matching the store; with Node absent the launcher's `disableAllHooks` fallback leaves the session clean (S-05). (S08, S11)
- [ ] A copied `~/.claude.json` fixture with stale `servicenow-mcp` and `nowaikit` entries produces the exact removal commands in the report. (S03, S11)
- [ ] With a fake `claude` on PATH printing `✘ Rejected (see disabledMcpjsonServers in settings)` and `bootstrap-state.mode == "live"`, E-27 WARNs with the `run ./snowarch mode live` remedy; with `claude` absent it is `skip`; `--quick` never runs it (`03` R-13). (S03)
- [ ] Runtime: when the server returns `AUTHENTICATION_FAILED`, the engine (per the generated rule file) stops and prints the `set-credentials` remedy; the VALIDATION-TESTS gain a test for this. (S10)
- [ ] Design principle 10 ("Propose, don't impose") holds for `--fix`: the plan is shown and Enter applies; `--yes` accepts it for CI. (S06)

> **Candidate check, recorded at the ARC-06 docs-sync fix (2026-09-09).** `docs-bump.yml` depends on
> a repository setting no file in the tree can assert:
> `gh api repos/<owner>/<repo>/actions/permissions/workflow` → `can_approve_pull_request_reviews`.
> With it off, the weekly bump moves the pin, pushes its branch and fails at `gh pr create` — a
> failure that looks like a workflow bug and is not one.

## Risks

> **Amendment 2026-09-07 (from `03` §F "Pattern 4/4").** Design rationale of record: four independent Claude Code surfaces reported success or said nothing while the underlying work had failed (dead MCP server → exit 0; unspawnable hook → silence; plugin `npm ci` SIGTERM → "✔ Successfully installed"; scaffolded plugins → nothing). The doctor therefore performs its own handshake, its own hook probe, its own dependency-tree completeness check and its own registration read, and never treats a Claude Code message or exit code as evidence.

> **Amendment 2026-09-07 (from `03` §F S-06 / S-16).** (1) MCP startup failure is signalled by the doctor's own `initialize`/`tools/list` handshake, never by Claude Code's exit code (0 on failure, no stderr). (2) `/snowarch status` and the in-session doctor summary are **MCP tool calls** (`snow_core_status_read`, `snow_core_doctor_read` — ARC-04 adds the latter), because MCP allow rules match exactly and Bash allow rules do not survive Claude's non-deterministic command wrapper. (3) The generated rule file states: on any MCP failure the engine quotes the doctor's output and never diagnoses (regression: a fabricated "PDI hibernating" diagnosis naming an unrelated real hostname).

> **Amendment 2026-09-07 (from `03` §F S-24 / S-20).** The `--live` handshake and the CI end-to-end checks may use `claude -p --mcp-config <file> --settings <rules> --strict-mcp-config`, which reaches a project stdio server with no trust dialog and no approval (proven on macOS). E-26 (proxy/CA) reports the launching shell's variables as inherited on macOS; the Windows row stays hedged.

> **Amendment 2026-09-06 (from `03` §F S-07).** The docs-corpus check reads the **superproject's** `git submodule status` and requires the initialised form (no leading `-`) at the pinned SHA; a populated `vendor/ServiceNowDocs` tree with an uninitialised gitlink is a FAIL with the remedy `git submodule init` (folded into `./snowarch docs sync`).

> **Amendment 2026-09-06 (from `03` §F S-21).** No doctor check, banner, or `--fix` action may shell out to `claude mcp get|list|add` for a *read-only* purpose: those commands rewrite `migrationVersion` in `~/.claude.json` when Claude Code versions alternate. Registration state is read from `.mcp.json`, `.claude/settings.json` and `.claude/settings.local.json` directly. The one legitimate `claude mcp` call (E-23's printed remedy for stale registrations) is printed for the user, never executed by the doctor.

- Doctor drift from the checks in other ARCs. Mitigation: each ARC's acceptance criteria name the doctor check that proves them; CI runs the doctor after the bootstrap (S11 snapshot test).
- Banner cost on slow disks. Mitigation: cached JSON; `--quick` subset bounded; hook `timeout` 10 s; in-hook watchdog 5 s (S08).
- Whether the environment the doctor sees equals the environment Claude Code's spawned server sees (proxy/CA variables) — spike S-20, raised by ARC-04-S11 and run in ARC-00-S06 (ARC-00-S14 adds its row to `03` §A, which does not list it yet); until answered E-26 reports "as seen by this shell".
- `claude mcp get servicenow` output wording is Claude Code's (`03` R-13); E-27 recognises the S-01-recorded strings and degrades to a WARN "could not read registration status" on anything else — never a false FAIL.
- ARC-04-S12's `CheckResult` fixes `fixable: false` and lacks `code`/`command`/`data`/`durationMs`; S01 extends it with optional fields in a PR against ARC-04's tree (backwards-compatible, tested).
- ARC-07-S03 (probes) may land after S04; SV-04 stays a stub reporting `skip: probes not available` until it does — CI never depends on SV-04.

## Stories

Full write-ups: [`STORIES.md`](STORIES.md).

| ID | Title | Size |
|---|---|---|
| ARC-08-S01 | Doctor framework: check registry, sections, severities, remedies from the contract, JSON schema, exit codes, redaction | L |
| ARC-08-S02 | Engine checks E-00…E-22: prerequisites, repo wiring, docs corpus, roster, contract | L |
| ARC-08-S03 | Stale-registration, legacy-store, cloud-sync, proxy/CA and registration-status detectors (E-23…E-27) with exact commands | M |
| ARC-08-S04 | Server checks SV-00…SV-07 integrated: module import, probe wiring (basic + ROPC), FLUENT SDK, capabilities equality, section `server` | M |
| ARC-08-S05 | Merged report, the authoritative `Mode:` line, `--quick` / `--no-network` / `--section`, capability packs, `.local/doctor-last.json` | M |
| ARC-08-S06 | `--fix` whitelist with per-fix reporting and refusal rules | L |
| ARC-08-S07 | Old→new check mapping table (`D00–D37` → `E-xx` / `SV-xx` / retired) in `docs/ARCHITECTURE.md` | S |
| ARC-08-S08 | `hooks/session-start.mjs` banner: cache, staleness re-run, nudges, hook timeout, S-05 handling | M |
| ARC-08-S09 | `/snowarch status` skill body: doctor-JSON rendering and the no-Node fallback | M |
| ARC-08-S10 | Runtime error mapping in the generated rule file; VALIDATION-TESTS T-19 (`AUTHENTICATION_FAILED`) and T-20 (`*_NOT_ENABLED`) | M |
| ARC-08-S11 | CI: doctor after bootstrap on three OSes, JSON snapshot test, fixture-driven detector tests, banner timing | M |

Total: 22–30 engineer-days (≈ 4.5–6 weeks for one engineer). Critical path: S01 → S02/S04 → S05 → S06/S08 → S11.
