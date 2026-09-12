# ARC-08 — Doctor, self-heal and the session banner

Status: **COMPLETE 2026-09-11 — all 11 stories (S01–S11), started 2026-09-10** · Depends on: ARC-04 (server doctor module), ARC-05 (data-driven names), ARC-06 (state file, toggles), ARC-07 (probes); ARC-00 S-05/S-06/S-13 · Blocks: ARC-09 (CI uses the doctor), ARC-10 (cutover checks)

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

- [x] On the reference machine after ARC-06/07, `./snowarch doctor` reports **0 FAIL**; the old `scripts/doctor.sh`'s four failures (dead citations, absent NOW_ASSIST/FLUENT, retired names) are impossible by construction and covered by E-checks that pass. (S02, S05, S11) — *in CI, on all nine `node-cli` cells: `DOCTOR: 26 ok, 0 warn, 1 fail (10 skip) — expected here: E-00`, the one failure being that a hosted runner has no Claude Code, asserted BOTH ways by `scripts/ci/assert-doctor.mjs --expect-fail E-00`. The **reference machine** run (where `claude` is installed, so 0 FAIL outright) is the owner's sitting D1.*
- [x] Every check id from the old doctor appears in the mapping table with its new id or an explicit "retired because …" reason. (S07 — `docs/ARCHITECTURE.md` appendix, rendered from `tools/snowarch/lib/doctor/mapping.mjs`; `tests/doctor/mapping.test.mjs` asserts all 38 ids both ways against `scripts/legacy/doctor.sh`, 2026-09-10)
- [x] `./snowarch doctor --json` output pasted into a chat contains no secret and no clear-text username (test greps the JSON for the fixture credentials). (S01, S03, S04, S11) — *`tests/doctor/redaction-e2e.test.mjs`: a fixture store with `someone.fixture@corp.example.com` and a random 24-character password, read by the real command, searched in the text report, `--json`, `--fix` and `--fix --json`, on three OSes. Proved to bite: drill PR #121 broke `maskUsername` and CI went red with `json: the username reached the output unmasked`.*
- [x] `--fix` repairs a store entry with four flags, a docs checkout with a wrong sparse set, and a missing `settings.local.json` toggle in one run, and reports each; it refuses to touch `.mcp.json` when its hash differs and prints the `git checkout -- .mcp.json` command instead. (S06) — *`tests/doctor/fix.test.mjs`, the composite fixture.*
- [x] The SessionStart banner appears within 1 s of session start on the CI machines and shows `Mode: design-only` or `Mode: live — …` matching the store; with Node absent the launcher's `disableAllHooks` fallback leaves the session clean (S-05). (S08, S11) — *five cold spawns per cell, medians:* **ubuntu 330 ms · macOS 614 ms · Windows 910 ms · Windows-without-Git-Bash 895 ms**, *budget 1000 ms, in each cell's step summary. The `no-node` cells assert the other half: the launcher seeds `doctor-last.json` itself so the banner has a truthful line on a machine that cannot run the doctor.*
- [x] A copied `~/.claude.json` fixture with stale `servicenow-mcp` and `nowaikit` entries produces the exact removal commands in the report. (S03, S11) — *`tests/doctor/stale-registration-e2e.test.mjs`, through the real command with `HOME` and `USERPROFILE` redirected: both `claude mcp remove` lines verbatim, no fixture credential in the output, and `~/.claude.json` byte-identical after a plain run, `--json` and `--fix`.*
- [x] With a fake `claude` on PATH printing `✘ Rejected (see disabledMcpjsonServers in settings)` and `bootstrap-state.mode == "live"`, E-27 WARNs with the `run ./snowarch mode live` remedy; with `claude` absent it is `skip`; `--quick` never runs it (`03` R-13). (S03) — *`tests/doctor/legacy.test.mjs`; `skip` confirmed on every CI cell, where `claude` is absent.*
- [x] Runtime: when the server returns `AUTHENTICATION_FAILED`, the engine (per the generated rule file) stops and prints the `set-credentials` remedy; the VALIDATION-TESTS gain a test for this. (S10) — *the rule file's "Runtime errors" section, nineteen rule-visible codes; `tests/VALIDATION-TESTS.md` **T-19**. The behavioural run against a PDI is the owner's sitting D5.*
- [x] Design principle 10 ("Propose, don't impose") holds for `--fix`: the plan is shown and Enter applies; `--yes` accepts it for CI. (S06)

**Deferred to the owner's sitting, each with its row in `docs/spikes/OWNER-SITTING.md`:** D1 (the reference-machine doctor run, and S02's floors on a machine that is not a runner) · D2 / D2b (S03's leftover detectors against a real previous install; S04's live probes) · D3 (S08's banner in a real Claude Code session — plain stdout vs `additionalContext`) · D4 (S09's `/snowarch status` in four sessions) · D5 (S10's T-19 and T-22 live, and their dormant variants). Every one of them needs a session or a live instance; none is a code path this repository can reach.

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

### Chores

Work that is not a story: a defect found while building one, fixed in the same arc.

| ID | What | Status |
|---|---|---|
| ARC-08-C1 | The `--json` report carried the instance LABEL in seven fields and the instance HOST in two, and ARC-10-S10's issue template asks a stranger to paste exactly that output into a public tracker. ARC-10-S07's lint would have refused the same bytes in a validation record, so the two rules disagreed about the same content — one mechanical, one a review note. Found by running the doctor against a live fixture rather than by reading the writer: only a live run has instances to name, and the earlier fixture runs never went live because **SV-02 refuses a group/world-readable store** — a fixture written at the default 0644 is found and not loaded (`mode 0644 is group/world-readable`), so the doctor stayed design-only and every field below was empty | **Closed** — masked at the `--json` BOUNDARY (`lib/doctor/json-boundary.mjs`), not at the nine sites that compose a string: a check added next month is covered the day it is written, and the alternative — nine call sites and a review note — is the arrangement that produced the defect. Masking is by VALUE (every label from `server.instances[].label`, longest first; the host by C9's `INSTANCE_HOST`, now exported rather than copied), so a field nobody listed is covered too, and a test plants one to prove it. The TEXT report is unchanged and still names the instance — it is local, and a practitioner needs to know which instance the doctor is talking about; the test asserts BOTH directions, or "the fixture never had a label" would pass every assertion. `--fix` reads the in-process report and is unaffected. Cost, documented by a test rather than discovered: a label of `dev` also masks the environment token, `(<label>)` — word-bounded matching cannot tell a user's label from the same word used as an environment, and a list of words a user may not choose is wrong for whoever chooses one **Second pass (same chore, after the Windows CI cell): the CHECKOUT PATH was a third leak of the same kind.** `--json` carried it in three fields — `checks[].detail`, `checks[].data.root`, `checks[].data.toplevel` — each reading `/Users/<me>/work/ai-servicenow-architect` on a real (non-fixture) run, and on every platform that path contains the user's account name. It surfaced on Windows alone because the C1 test scans a live fixture for all six S07 patterns and the fixture's own temp root is home-shaped on exactly one platform — `C:/Users/runneradmin/AppData/Local/Temp/…` matches, `/var/folders/…` and `/tmp/…` do not. A test asserting the right general property therefore passed on two platforms while the product leaked on all three. Masked two ways, because neither alone is enough: the run's own home BY VALUE (a home can be `/opt/people/ana` and match no pattern), guarded so that a home of `/` or a bare drive root is ignored rather than matching inside every absolute path — and taken as an ARGUMENT, because the first version read `process.env` and an existing guard (`mode-register.test.mjs`, *nothing under `lib/` opens `~/.claude.json`, or anything else in the home directory*) failed the build on it. That guard was right and is the better design: `bin/snowarch.mjs` calls `homedir()` once and threads it, which is also what lets a test point a whole run at a fixture without touching the environment; and the four generic shapes `/Users/<x>`, `/home/<x>`, `C:\Users\<x>` and the forward-slash form Node returns on Windows. All become `~`, and what follows survives — depth, a space in the path, the drive letter — which is the part a maintainer reading a pasted report uses. The platform accident is fixed at the cause: a unit table over five path shapes with three negative controls (`/var/folders`, `/tmp`, and the CI runner's own `D:\a\…`, which must keep every character), plus a live run with `HOME` set to the fixture root asserting that literal string appears nowhere in the JSON. **The standard is stated in the file now** — this boundary is held to S07's six patterns, not to the fields a ruling happened to name |


The seven fields, measured on the live fixture before the fix:

| Path | Shape |
|---|---|
| `$.modeLine` | `instance=acme-prod (prod)` |
| `$.modeLineDetailed` | the same line, with the check counts |
| `$.server.instances[0].label` | the label itself |
| `$.checks[32].detail` | `acme-prod: …` — a check naming the instance it judged |
| `$.checks[32].data.fix.label` | the `--fix` payload's target |
| `$.checks[32].data.fixes[0].label` | the same, in the multi-fix form |
| `$.checks[35].detail` | a second check, same shape as the first |

After: the JSON passes all six of ARC-10-S07's redaction patterns, contains neither the label nor the host, and the mode line reads `Mode: live — instance=<label> (prod) preset=read-only`.

### Acceptance

The acceptance pass against `docs/plans/06-ACCEPTANCE-PLAN.md` §2. One row per backlog item: what it
claimed, what the tree said, and what changed.

| Item | Outcome | Evidence |
|---|---|---|
| B08-01 — S01 AC 6: `node --test tests/doctor/` passes on three OSes before `npm ci` | **rework + record** | Measured on a worktree with no `node_modules`: **231 cases, 222 pass, 9 fail**. The nine are `fix.test.mjs`, `json-boundary.test.mjs` and `redaction-e2e.test.mjs`, every one needing a loaded instance → the server → `@modelcontextprotocol/sdk`, which is not there (`ERR_MODULE_NOT_FOUND` from `dist/server.js`). Separately the literal command does not run on Node 24 **with or without** an install: `Cannot find module '<cwd>/tests/doctor'` — a bare directory is not a test target on that line, which is why `tests/run.mjs` computes a file list. Now: `tests/doctor/stdlib-only.test.mjs` asserts the property that is true (43 files, **0 bare specifiers**, both directions, one stated self-exemption), a step in the three `bootstrap (node-cli)` cells runs the 17-file stdlib subset **before `npm ci`** and refuses to run if `node_modules` exists (**196/196** locally on the no-install worktree), and AC 6 is amended to say all of this |
| B08-02 — S04 AC 7: a store edited after the server started makes SV-06 fail naming `maxRecords` | **rework** | `packages/snowarch/tests/doctor/sv06-store-drift.test.ts`, two cases. In process and importing from `dist/`, because SV-05/SV-06 look for `server.js` and `contract.json` beside their own module — imported from `src/` they find no contract and **skip**, which reads exactly like a pass and did on the first attempt. The cached handshake is "the server already running" (`resetHandshakeCache` is the fixture seam), so no clock is involved. Both directions: the drift fails naming `maxRecords` with `server 100 vs store 50` and a restart remedy; the same edit **after a restart** is green again. The negative control had to be run in SOURCE — removing the comparison from `dist/` proved nothing because `npm test` runs a `pretest` build that restored it |
| B08-03 — S04 AC 5: with the SDK present SV-03 is ok and prints its version | **rework** | It printed the location, not the version. The probe already resolves `@servicenow/sdk/package.json` to find the SDK at all, so the version was one guarded read away: SV-03 prints **both** now — the version is what a support conversation asks for, the location answers which of two installs is in use. Never throws: a versionless or unreadable `package.json` still reports the SDK as present, asserted as its own case. AC 5 amended to record that both are printed |

**Also resolved in this pass, for the plan's two open flags.** *Sitting B is not empty* —
`OWNER-SITTING.md:150` defines it and it carries `## B0.`–`## B5.` (lines 771–868), the ARC-00
`S-14a`–`S-14d` questions; B1–B4 are ANSWERED, **B5 is outstanding**. *The `§ D1`–`D5` references are
placed correctly* and are not the Windows sitting: `## Sitting D — Windows` is line 502, while the
six per-story doctor sittings sit at lines 89, 193, 227, 373, 409 and 430. The naming collision is
the real finding and is recorded in the plan.
