# 05 — Story index (tracking sheet)

Status: **Integrated 2026-09-04** · Generated from the story-map tables of the eleven `ARC-NN-<slug>/STORIES.md` files by the integration pass; regenerate rather than hand-edit the rows, but **do** maintain the *Status* column by hand (or in a copy) as work proceeds · Milestones are defined in [`04-ROADMAP.md`](04-ROADMAP.md).

**How to read it.** One row per story, in ARC order. *Depends on* is the normalised form of the story-map "Depends on" cell: same-ARC stories as `S05`, other ARCs as `ARC-04-S02/S03`, a whole earlier ARC as `ARC-01 (all)`, and spike verdicts as `verdicts S-01 S-16` (each verdict is produced by the ARC-00 story named in `03` §E). Consumer relationships ("later overwrites", "consumed by") are deliberately **not** dependencies and do not appear here. *Size* uses each ARC's own bands (S ≤ 1 day · M 1–2 days · L 3–5 days; ARC-04 uses L 3–4 / M 1.5–2). *Status* values: Not started · In progress · Blocked (name the gate) · Done (every acceptance criterion of the story passed).

**Totals.** 132 stories: ARC-00 14 · ARC-01 12 · ARC-02 13 · ARC-03 11 · ARC-04 14 · ARC-05 11 · ARC-06 14 · ARC-07 11 · ARC-08 11 · ARC-09 11 · ARC-10 10. Sizes: S 25 · M 83 · L 24.

## The sheet

| ID | ARC | Title | Size | Depends on | Milestone | Status |
|---|---|---|---|---|---|---|
| ARC-00-S01 | ARC-00 | Spike workspace, stub MCP server and three clean test environments | L | — | M0 | Done (2026-09-07) |
| ARC-00-S02 | ARC-00 | Licence and relicensing statement (D-02): `LICENSE`, `NOTICE`, header sweep list | S | — | M0 | Done (2026-09-07) |
| ARC-00-S03 | ARC-00 | ADR-0001…ADR-0006 (+ ADR-0007 post-decision rulings) and the `engine.config.json` value set | M | S02 | M0 | Done (2026-09-07) |
| ARC-00-S04 | ARC-00 | First-session spikes: S-01 pre-seeded approval, S-16 project `permissions.allow`, S-17 unconfigured server | M | S01 | M0 | Done (2026-09-07) |
| ARC-00-S05 | ARC-00 | Permission-rule spikes: S-18 `permissions.ask` in auto mode, S-12 middle-wildcard globs | M | S01, S04 | M0 | Done (2026-09-07) |
| ARC-00-S06 | ARC-00 | Hook and path-expansion spikes: S-03 `${CLAUDE_PROJECT_DIR}` on native Windows, S-05 hook with Node absent, S-20 shell-env inheritance | M | S01 | M0 | Done (2026-09-07) |
| ARC-00-S07 | ARC-00 | Windows console spikes: S-04 raw-mode masked input, S-08 `bootstrap.cmd` under Restricted and GPO-locked policies | M | S01 | M0 | Done — parked items noted (2026-09-07) |
| ARC-00-S08 | ARC-00 | Server install and startup spikes: S-15 root `npm ci` footprint, S-06 `MCP_TIMEOUT` and 394-tool cold start | M | S01 | M0 | Done (2026-09-07) |
| ARC-00-S09 | ARC-00 | S-07 — ServiceNowDocs submodule recipes: size and time on three OSes | M | S01 | M0 | Done (2026-09-07) |
| ARC-00-S10 | ARC-00 | Session-dynamics spikes: S-09 Claude-first clone-into-cwd and restart, S-02 `list_changed` after reload | M | S01, S04 | M0 | Done (2026-09-07) |
| ARC-00-S11 | ARC-00 | S-11 — Claude Code 2.1.214 floor verdict over the spike matrix | S | S04, S10 | M0 | Done (2026-09-07) |
| ARC-00-S12 | ARC-00 | S-14a–g plugin channel spikes (D-06 hedge, one-week time-box) and S-19 `claude plugin validate` on headless CI | L | S01, S03 | M0 | Done (2026-09-07) |
| ARC-00-S13 | ARC-00 | Windows test recipe for ARC-06 / ARC-09 CI | S | S06, S07 | M0 | Done — parked items noted (2026-09-07) |
| ARC-00-S14 | ARC-00 | Close-out: `03` §A/§B Status column, deferred spikes S-10 / S-13, gate sign-off for ARC-01 and ARC-06 | M | S02, S13 | M0 | Done (2026-09-07) |
| ARC-01-S01 | ARC-01 | Found the repository: root commit with `LICENSE`/`NOTICE`, default branch, protection, skeleton | M | ARC-00-S02 | M1 | Done (2026-09-08) |
| ARC-01-S02 | ARC-01 | Import the engine working tree with history (submodule dropped, legacy scripts parked) | M | S01; ARC-00-S02 | M1 | Done (2026-09-08) |
| ARC-01-S03 | ARC-01 | Import the server into `packages/snowarch` with history; leaf-level D-03 cut; package rename | L | S01; ARC-00-S02/S03 | M1 | Done (2026-09-08) |
| ARC-01-S04 | ARC-01 | `engine.config.json` + JSON schema + validation test | M | S02, S03 | M1 | Done (2026-09-08) |
| ARC-01-S05 | ARC-01 | Root `package.json`, workspaces, lockfile; `npm ci` proven on three OSes | M | S03, S04 | M1 | Done (2026-09-08) |
| ARC-01-S06 | ARC-01 | Single version of record and `tests/version-consistency.test.mjs` | S | S05 | M1 | Done (2026-09-08) |
| ARC-01-S07 | ARC-01 | `.gitignore` / `.gitattributes` / `.editorconfig` and the never-commit test | S | S05 | M1 | Done (2026-09-08) |
| ARC-01-S08 | ARC-01 | Licence sweep: replace every old licence claim, remove contradictions | S | S02, S03 | M1 | Done (2026-09-08) |
| ARC-01-S09 | ARC-01 | Merge `reference/templates/` and `templates/` into `templates/`; update every reference | S | S02 | M1 | Done (2026-09-08) |
| ARC-01-S10 | ARC-01 | Purge engagement residue; legacy-name ratchet test | M | S02, S03, S05, S09 | M1 | Done (2026-09-08) |
| ARC-01-S11 | ARC-01 | CI skeleton: three OSes × Node 20/22/24; footprint gate; `claude plugin validate` job | M | S05, S06, S07, S10 | M1 | Done (2026-09-08) |
| ARC-01-S12 | ARC-01 | `docs/ARCHITECTURE.md` and `docs/CONTRIBUTING.md` first versions | M | S01, S11 | M1 | Done (2026-09-08) |
| ARC-02-S01 | ARC-02 | Make `.claude/` canonical: delete root mirrors, sync script, structure gate and pre-commit chain; rewrite every path reference | M | ARC-01-S02/S09 | M1 | Done (2026-09-08) |
| ARC-02-S02 | ARC-02 | Skills lint and agents lint (`tests/skills-lint.test.mjs`), wired into CI | M | S01; ARC-00-S12; ARC-01-S05/S11; verdicts S-19 | M1 | Done (2026-09-08) |
| ARC-02-S03 | ARC-02 | Rewrite every skill description to ≤ 500 chars; triggers into bodies; `version:` → `metadata.version`; S-13 verification | L | S02 | M1 | Done (2026-09-08) |
| ARC-02-S04 | ARC-02 | Agent frontmatter: `model: inherit`, `skills:` preload, `tools:` unchanged; §6.2 regression run | M | S02 | M1 | Done (2026-09-08) |
| ARC-02-S05 | ARC-02 | Remove context-mode, the claude.ai surface, the settings example, the 9-step README manual; disposition of legacy docs | M | S01; ARC-01-S10 | M1 | Done (2026-09-08) |
| ARC-02-S06 | ARC-02 | Move governance texts to `governance/`; Mode/Preset vocabulary sweep across CLAUDE.md, governance, docs, skills, tests | M | S05; ARC-01-S04 | M2 | Done (2026-09-08) |
| ARC-02-S07 | ARC-02 | Roster generator: `scripts/gen-roster.mjs` writes the roster table into `docs/ARCHITECTURE.md`; `--check` in CI | S | S02; ARC-01-S12 | M2 | Done (2026-09-08) |
| ARC-02-S08 | ARC-02 | `CLAUDE.md` ≤ 200 lines rewrite; harness-neutral wording; `Status` → `/snowarch status`; version line owned by the release script | L | S06, S07; ARC-01-S06 | M2 | Done (2026-09-08) |
| ARC-02-S09 | ARC-02 | `docs/MODES-AND-PRESETS.md` — Mode semantics, the preset table and plain-language flags of `01` §6.3, principle 10 | S | S06 | M2 | Done (2026-09-08) |
| ARC-02-S10 | ARC-02 | `docs/PLATFORM-NOTES.md` from the field notes; server-behaviour sections handed to ARC-04 as regression-test titles | M | S05 | M2 | Done (2026-09-08) |
| ARC-02-S11 | ARC-02 | `/snowarch` project skill: `status` (delegates to the doctor), `setup-instance` skeleton with the terminal hand-off, `doctor` | M | S02, S08; ARC-00-S04; verdicts S-16 | M2 | Done (2026-09-09) — criteria 2–7 verified in headless sessions against the doctor stub; criterion 9 (Windows run) deferred to the owner's sitting |
| ARC-02-S12 | ARC-02 | Retired-name final sweep with ARC-05's `retired-names.json` and `engine-lint.mjs` (incl. ITOM SKILL/EXAMPLES) | S | S06; ARC-05-S02/S04 | M2 | Done (2026-09-08) |
| ARC-02-S13 | ARC-02 | Refresh `VALIDATION-TESTS.md` (T-01…T-18) to Mode/Preset and current tool names; replace T-07; strip run history; execute in design-only mode | M | S08, S11, S12 | M2 | Done (2026-09-09) — all 18 executed in design-only on a clean clone; the Windows subset (criterion 6) deferred to the owner's sitting |
| ARC-03-S01 | ARC-03 | Shallow submodule at `vendor/ServiceNowDocs`, pin re-seeded to `ba513f2`, pin recorded in `engine.config.json` with a pin-equals-gitlink lint | M | ARC-01 (all) | M1 | Done (2026-09-08) |
| ARC-03-S02 | ARC-03 | Citation scanner library, `scripts/gen-docs-areas.mjs` and generated `vendor/docs-areas.txt` with a CI staleness check | M | S01 | M1 | Done (2026-09-08) |
| ARC-03-S03 | ARC-03 | Port `verify-citations.sh` to `tools/snowarch/lib/docs/verify.mjs`; brace and directory forms; missing corpus = FAIL | M | S02 | M1 | Done (2026-09-08) |
| ARC-03-S04 | ARC-03 | Repair the dead citations (two in the licensing skill, one in the Now Assist agent) | S | S03; ARC-02 (all) | M1 | Done (2026-09-08) |
| ARC-03-S05 | ARC-03 | `snowarch docs sync` — the checkout/reconcile recipe (sparse · full · skip), pinned-SHA fetch, Windows long paths; the Node-free launcher recipe text | L | S01, S02; ARC-00-S09; verdicts S-07 | M2 | Done (2026-09-09) |
| ARC-03-S06 | ARC-03 | `snowarch docs verify` and `snowarch docs status`; the `docsStatus()` data shape consumed by the doctor and `/snowarch status` | M | S03, S05 | M2 | Done (2026-09-09) |
| ARC-03-S07 | ARC-03 | `snowarch docs sync --upstream` — move the pin to the upstream tip, verify, print the dead-citation diff (maintainer) | M | S05, S06 | M2 | Done (2026-09-09) |
| ARC-03-S08 | ARC-03 | `snowarch docs family <name> --dry-run\|--yes` — release-family switch with a printed edit plan and gateway-skill re-lint | M | S07 | M2 | Done (2026-09-09) |
| ARC-03-S09 | ARC-03 | `.github/workflows/docs-bump.yml` weekly PR with pin, verification output and newly dead citations | M | S07; ARC-01 (all) | M2 | Done (2026-09-09) |
| ARC-03-S10 | ARC-03 | `NOTICE` attribution, the B02/`docs sync` attribution line, install-page attribution and size/time statement, `docs/ARCHITECTURE.md` corpus section | S | S05; ARC-00-S09; ARC-01 (all); verdicts S-07 | M2 | Done (2026-09-09) |
| ARC-03-S11 | ARC-03 | Windows long-path CI proof and `--docs skip` → doctor FAIL wiring (three-OS real-corpus job) | M | S05, S06; ARC-00-S09/S13; ARC-01-S11; verdicts S-07 | M2 | Done (2026-09-09) |
| ARC-04-S01 | ARC-04 | D-03 code cut, dependency prune, identity `@farstic/snowarch` 2.0.0, vitest scoping, `npm test` in CI | L | ARC-01-S05/S06 | M2 | Done (2026-09-08) |
| ARC-04-S02 | ARC-04 | Store module v1: precedence, schema, file-mode check, atomic writes; legacy stores and cwd `dotenv` removed | L | S01 | M2 | Done (2026-09-08) |
| ARC-04-S03 | ARC-04 | Per-instance flag evaluation, preset expansion, dependency rule, prod acknowledgement; `permissions.ts` at 100 % coverage | L | S02 | M2 | Done (2026-09-08) |
| ARC-04-S04 | ARC-04 | Unconfigured start mode, `NO_INSTANCE_CONFIGURED`, `snow_core_status_read`, `snow_core_capabilities_read`, `snow_core_instances_reload` + `list_changed` | L | S03 | M2 | Done (2026-09-08) |
| ARC-04-S05 | ARC-04 | SCRIPTING / update-set read-gate split | M | S03 | M2 | Done (2026-09-08) |
| ARC-04-S06 | ARC-04 | `gate` / `mutates` on every registration; `extract-tools.mjs` emits manifest fields and `dist/contract.json`; `snowarch contract` | L | S04, S05 | M2 | Done (2026-09-08) |
| ARC-04-S07 | ARC-04 | `snow_us_capture_target_set`; `snow_us_active_update_set_ensure` with mandatory name and current-user filter | M | S05, S06 | M2 | Done (2026-09-08) |
| ARC-04-S08 | ARC-04 | Retire dead script-execution endpoints; remove undeclared per-call `instance` routing and runtime-generated tools; result-size cap | M | S04, S06 | M2 | Done (2026-09-08) |
| ARC-04-S09 | ARC-04 | Defect fixes with regression tests: `ORDERBYDESC`, `event_name`, `action_insert`/`action_update` | M | S01 | M2 | Done (2026-09-08) |
| ARC-04-S10 | ARC-04 | Audit trail writer with rotation; redaction defaults; Authorization header never logged | M | S02, S06 | M2 | Done (2026-09-08) |
| ARC-04-S11 | ARC-04 | Proxy agent honouring `HTTPS_PROXY` / `HTTP_PROXY` / `NO_PROXY`; documented `NODE_EXTRA_CA_CERTS`; network-error classifier (R-3) | M | S01 | M2 | Done (2026-09-08) |
| ARC-04-S12 | ARC-04 | Server doctor module (`src/doctor/`) and `snowarch doctor --json` | M | S04, S06 | M2 | Done (2026-09-08) |
| ARC-04-S13 | ARC-04 | `scripts/build-dist.mjs`; committed `dist/`; CI rebuild-and-diff | M | S06, S08 | M2 | Done (2026-09-08) |
| ARC-04-S14 | ARC-04 | Rewrite `packages/snowarch/README.md`, `.env.example`, `CHANGELOG.md` from code; 2.0.0 migration notes | M | S01, S13 | M2 | Done (2026-09-08) |
| ARC-05-S01 | ARC-05 | `required-tools.json`: engine pin with `used_by` and `contractSha256` | M | ARC-01-S04; ARC-04-S06/S13 | M2 | Done (2026-09-08) |
| ARC-05-S02 | ARC-05 | `retired-names.json` generated from the rename map | S | ARC-04-S01 | M2 | Done (2026-09-08) |
| ARC-05-S03 | ARC-05 | `engine-lint.mjs` core: tokens, prefix, retired names, pin | M | S01, S02 | M2 | Done (2026-09-08) |
| ARC-05-S04 | ARC-05 | `engine-lint.mjs` structural checks: descriptions, path references, `used_by`, generated-file byte check, plugin validate | M | S03, S05, S06, S07; ARC-00-S12; verdicts S-19 | M2 | Done (2026-09-08) |
| ARC-05-S05 | ARC-05 | `gen-governance.mjs` framework, the rule file `.claude/rules/00-mode-and-mcp-gate.md` and the `PRESETS` block of `docs/MODES-AND-PRESETS.md` | M | S01; ARC-02-S09; ARC-04-S03/S06/S07 | M2 | Done (2026-09-08) |
| ARC-05-S06 | ARC-05 | Error-code registry, `governance/mcp-protocols.md` and `docs/TROUBLESHOOTING.md` | M | S05; ARC-04-S02/S03/S04/S08/S11 | M2 | Done (2026-09-08) |
| ARC-05-S07 | ARC-05 | Generated `permissions.allow` / `permissions.ask` blocks in `.claude/settings.json` | M | S05; ARC-00-S05; ARC-06-S01; verdicts S-12 S-18 | M2 | Done (2026-09-08) |
| ARC-05-S08 | ARC-05 | Server `tests/contract.test.ts`: gates, presets, invariants, pin, dist parity | L | S01, S06; ARC-04-S01/S03/S05/S06/S13 | M2 | Done (2026-09-08) |
| ARC-05-S09 | ARC-05 | CI job `contract` and the release gate script | S | S03, S04, S08; ARC-01-S11 | M2 | Done (2026-09-08) |
| ARC-05-S10 | ARC-05 | Contract loader for engine tooling and the no-literal-names guard | M | S01, S06 | M2 | Done (2026-09-08) |
| ARC-05-S11 | ARC-05 | Drift drill and contributor documentation | M | S01, S10 | M2 | Done (2026-09-08) |
| ARC-06-S01 | ARC-06 | Committed `.mcp.json` and `.claude/settings.json`; placeholder and secret-shape tests | M | ARC-00-S06/S08; ARC-01 (all); verdicts S-05 S-06 S-20 | M3 | Done (2026-09-09) |
| ARC-06-S02 | ARC-06 | `snowarch` CLI skeleton (stdlib only): argument parsing, exit codes, secret-free logging, `version` | M | ARC-01 (all) | M3 | Done (2026-09-09) |
| ARC-06-S03 | ARC-06 | Bootstrap orchestrator: state file, step registry, resume, per-step input hashes, plan summary, `--yes` / `--from` / `--reset` | L | S02 | M3 | Done (2026-09-09) |
| ARC-06-S04 | ARC-06 | B00 preflight (floors from `engine.config.json`, root check, disk, network, Node detection) with named remedies | M | S03; ARC-03-S05 | M3 | Done (2026-09-09) |
| ARC-06-S05 | ARC-06 | B01 workspace and B07 `settings.local.json` toggles (merge, never overwrite); cloud-sync WARN; `.local/config.json` | M | S03; ARC-00-S04/S06; verdicts S-01 S-05 | M3 | Done (2026-09-09) |
| ARC-06-S06 | ARC-06 | B02 docs step calling the ARC-03 recipe; `--docs sparse\|full\|skip`; launcher recipe parity | M | S03; ARC-03-S05/S06 | M3 | Not started |
| ARC-06-S07 | ARC-06 | B03 mode line of the plan; B04 `npm ci`; B05 contract sha check; the B06 wizard slot; `--instance-file` non-interactive live bootstrap | L | S03, S05; ARC-00-S08; ARC-04-S02/S03/S13; ARC-05-S01; verdicts S-15 | M3 | Not started |
| ARC-06-S08 | ARC-06 | B08 MCP stdio handshake and live-probe invocation; `.local/doctor-last.json` v1 | M | S07; ARC-04-S04/S13; ARC-07-S06 | M3 | Not started |
| ARC-06-S09 | ARC-06 | B09 summary: `DOCTOR:` line, authoritative `Mode:` line, next-step text with the dialog budget | S | S05, S08; ARC-00-S04; verdicts S-01 | M3 | Not started |
| ARC-06-S10 | ARC-06 | `bootstrap.sh` (bash 3.2-clean) with the Node-free design-only path | L | S04, S05, S06, S09 | M3 | Not started |
| ARC-06-S11 | ARC-06 | `bootstrap.ps1` + `bootstrap.cmd` with the Node-free design-only path; `snowarch.cmd` | L | S10; ARC-00-S06/S07/S13; verdicts S-03 S-08 | M3 | Not started |
| ARC-06-S12 | ARC-06 | `snowarch mode live` / `mode design` post-install switches; `mode live --register local\|user` fallback | M | S07, S08, S09 | M3 | Not started |
| ARC-06-S13 | ARC-06 | `docs/INSTALL.md` (= README body); Path B recipe sentence and non-empty-folder clone sequence; uninstall; start-at-root note | M | S09, S10, S11, S12; ARC-00-S10; ARC-03-S10; verdicts S-09 | M3 | Not started |
| ARC-06-S14 | ARC-06 | CI: design-only bootstrap on three OSes with and without Node; Windows job without Git Bash; no-tracked-file-modified and secret-grep gates | M | S10, S11; ARC-00-S13; ARC-01-S11 | M3 | Not started |
| ARC-07-S01 | ARC-07 | Masked-input module (`process.stdin.setRawMode`), `--password-stdin`, the no-TTY rule | M | ARC-00-S07; ARC-04-S01; verdicts S-04 | M3 | Not started |
| ARC-07-S02 | ARC-07 | URL normalisation and validation; environment proposal; reachability probe with DNS / TLS-CA / proxy diagnosis (R-3) | M | ARC-04-S11; ARC-05-S06 | M3 | Not started |
| ARC-07-S03 | ARC-07 | Probe library: auth probe (basic, ROPC), 401/403 mapping, `OAUTH_ROPC_DISABLED`, role hints, per-flag capability probes, `lastProbe` record | M | S02; ARC-04-S02/S03/S12 | M3 | Not started |
| ARC-07-S04 | ARC-07 | Preset proposal and the per-flag review screen (Propose → Review → Apply); prod cap in the wizard; `--yes` / `--preset` / `--flags` | M | S03; ARC-04-S03/S06 | M3 | Not started |
| ARC-07-S05 | ARC-07 | `instance add` end to end: bounded credential re-entry, atomic 0600 save, secret-free summary, the `./snowarch instance` forwarder, exit codes | L | S01, S04; ARC-04-S02/S10; ARC-06-S02/S07 | M3 | Not started |
| ARC-07-S06 | ARC-07 | `instance list · test (incl. --all --json) · set-credentials · set-preset (--ack-prod) · set-flags · set-default · remove` | M | S05; ARC-04-S03/S10 | M3 | Not started |
| ARC-07-S07 | ARC-07 | `--global` store, project-wins precedence messaging, cloud-sync-folder warning (D-04) | M | S05, S06; ARC-04-S02; ARC-06-S05; ARC-08-S03 | M3 | Not started |
| ARC-07-S08 | ARC-07 | `instance import --from-legacy`: dry-run plan, field and flag mapping, explicit `FLUENT_ENABLED`, prod cap, deletion advice | M | S04, S05, S07; ARC-04-S02 | M3 | Not started |
| ARC-07-S09 | ARC-07 | `/snowarch setup-instance` skill body: prerequisite check, three `AskUserQuestion`s, printed command per OS, `--resume` with reload + doctor, S-02 fallback | M | S05, S06; ARC-00-S04/S10/S12; ARC-02-S11; ARC-04-S04; ARC-08-S01; verdicts S-02 S-16 S-19 | M3 | Not started |
| ARC-07-S10 | ARC-07 | `docs/MODES-AND-PRESETS.md` final text; error-registry entries; runtime rule text for `AUTHENTICATION_FAILED` / `INSUFFICIENT_PRIVILEGES` / `PROD_WRITE_NOT_ACKNOWLEDGED` | M | S02, S08; ARC-02-S09; ARC-05-S05/S06 | M3 | Not started |
| ARC-07-S11 | ARC-07 | Live E2E suite behind `RUN_LIVE_E2E=1`: wizard end to end, three-failure exit with lockout check, prod cap, ROPC-disabled fixture, import | M | S05, S08; ARC-06-S08 | M3 | Not started |
| ARC-08-S01 | ARC-08 | Doctor framework: check registry, sections, severities, remedies from the contract, JSON schema, exit codes, redaction | L | ARC-04-S12; ARC-05-S06/S10; ARC-06-S02 | M3 | Not started |
| ARC-08-S02 | ARC-08 | Engine checks E-00…E-22: prerequisites, repo wiring, docs corpus, roster, contract | L | S01; ARC-01-S04; ARC-03-S06; ARC-05-S03/S04; ARC-06-S01/S05 | M3 | Not started |
| ARC-08-S03 | ARC-08 | Stale-registration, legacy-store, cloud-sync, proxy/CA and registration-status detectors (E-23…E-27) with exact commands | M | S01; ARC-00-S04; ARC-04-S02/S11; ARC-06-S05/S12; verdicts S-01 | M3 | Not started |
| ARC-08-S04 | ARC-08 | Server checks SV-00…SV-07 integrated: module import, probe wiring (basic + ROPC), FLUENT SDK, capabilities equality, section `server` | M | S01; ARC-04-S04/S12; ARC-07-S03 | M3 | Not started |
| ARC-08-S05 | ARC-08 | Merged report, the authoritative `Mode:` line, `--quick` / `--no-network` / `--section`, capability packs, `.local/doctor-last.json` | M | S01, S02, S04 | M3 | Not started |
| ARC-08-S06 | ARC-08 | `--fix` whitelist with per-fix reporting and refusal rules | L | S02, S03, S04, S05; ARC-03-S05; ARC-06-S05/S06/S07 | M3 | Not started |
| ARC-08-S07 | ARC-08 | Old→new check mapping table (`D00–D37` → `E-xx` / `SV-xx` / retired) in `docs/ARCHITECTURE.md` | S | S02, S03, S04 | M3 | Not started |
| ARC-08-S08 | ARC-08 | `hooks/session-start.mjs` banner: cache, staleness re-run, nudges, hook timeout, S-05 handling | M | S05; ARC-00-S06; ARC-06-S01/S05; verdicts S-05 | M3 | Not started |
| ARC-08-S09 | ARC-08 | `/snowarch status` skill body: doctor-JSON rendering and the no-Node fallback | M | S05, S08; ARC-02-S11; ARC-07-S09 | M3 | Not started |
| ARC-08-S10 | ARC-08 | Runtime error mapping in the generated rule file; VALIDATION-TESTS T-19 (`AUTHENTICATION_FAILED`) and T-20 (`*_NOT_ENABLED`) | M | S05; ARC-02-S13; ARC-05-S05/S06; ARC-07-S10 | M3 | Not started |
| ARC-08-S11 | ARC-08 | CI: doctor after bootstrap on three OSes, JSON snapshot test, fixture-driven detector tests, banner timing | M | S02, S10; ARC-00-S13; ARC-06-S14 | M3 | Not started |
| ARC-09-S01 | ARC-09 | `scripts/release.mjs`: preflight, gates, version writes, release commit, annotated tag with contract sha and docs pin | L | ARC-01-S06/S11; ARC-02-S08; ARC-03-S06; ARC-04-S13; ARC-05-S09 | M4 | Not started |
| ARC-09-S02 | ARC-09 | `docs/CHANGELOG.md` generation from conventional commits; commit-message lint in CI; the 2.0.0 "supersedes" and migration notes | M | S01; ARC-04-S14 | M4 | Not started |
| ARC-09-S03 | ARC-09 | `.github/workflows/release.yml`: on `v*` tags re-run every gate on three OSes, create the GitHub Release with doctor JSON and install-metrics assets | M | S01, S02; ARC-03-S05/S11; ARC-06-S03/S14; ARC-08-S01/S11 | M4 | Not started |
| ARC-09-S04 | ARC-09 | `./snowarch version` extended (tag, commit, tag-message comparison; `--json` superset of ARC-06-S02's shape; feeds the doctor's `engine` header) | S | S01; ARC-03-S01; ARC-05-S10; ARC-06-S02; ARC-08-S01 | M4 | Not started |
| ARC-09-S05 | ARC-09 | Input-hash invalidation table: `lib/inputs.mjs`, `state.staleSteps()`, `tests/input-hash.test.mjs`, `docs/ARCHITECTURE.md` section | M | ARC-03-S02; ARC-04-S06; ARC-06-S03 | M4 | Not started |
| ARC-09-S06 | ARC-09 | Store schema migration framework in `packages/snowarch` (explicit, versioned, 0600 backup, credential values never touched) | M | ARC-04-S02/S04/S06/S12; ARC-05-S06; ARC-08-S04 | M4 | Not started |
| ARC-09-S07 | ARC-09 | `./snowarch upgrade [--to vX.Y.Z] [--check]`, the SessionStart "behind origin" nudge, and the upgrade fixture harness | L | S04, S05, S06; ARC-06-S03/S09; ARC-08-S08 | M4 | Not started |
| ARC-09-S08 | ARC-09 | CI matrix completion: every job on the intended cells; the Windows job without Git Bash (launchers, `--password-stdin`, MCP handshake, hook in exec form) | L | S02, S03, S07, S09; ARC-00-S06/S07/S13; ARC-03-S02/S11; ARC-04-S13; ARC-05-S09; ARC-06-S08/S14; ARC-07-S01/S04/S05; ARC-08-S11 | M4 | Not started |
| ARC-09-S09 | ARC-09 | Line-ending proof: `tests/eol.test.mjs` over `git ls-files --eol`; launchers run from a CRLF-default Windows checkout | S | ARC-01-S07; ARC-06-S10/S11 | M4 | Not started |
| ARC-09-S10 | ARC-09 | Optional `publish-npm.yml`: `npm publish --provenance` of `@farstic/snowarch` from a release tag, manual dispatch, dry-run by default (roadmap `01` §17 item 2) | S | S01, S03; ARC-04-S01 | M4 | Not started |
| ARC-09-S11 | ARC-09 | `docs/CONTRIBUTING.md` release / upgrade / CI-matrix sections; `docs/INSTALL.md` "Upgrading" section; `docs/ARCHITECTURE.md` versioning section | S | S01, S10 | M4 | Not started |
| ARC-10-S01 | ARC-10 | `docs/MIGRATION.md`: existing-user step list and the cleanup command list derived from the ARC-08 detectors | M | ARC-01-S10; ARC-06-S13; ARC-07-S08; ARC-08-S01/S03/S10 | M5 | Not started |
| ARC-10-S02 | ARC-10 | Engagement-state carry-over: `clients/` per checkout, `memory/MEMORY.md` retired in favour of Claude Code auto memory | S | ARC-01-S07; ARC-02-S01/S08 | M5 | Not started |
| ARC-10-S03 | ARC-10 | Retire the legacy scaffolding: `scripts/legacy/`, obsolete `.gitignore` lines, empty legacy-name allow-list | S | ARC-02-S12; ARC-04-S01/S14; ARC-09-S02 | M5 | Not started |
| ARC-10-S04 | ARC-10 | Rewrite the standing rule and the field-notes policy (DR-16) in `CLAUDE.md` and `docs/CONTRIBUTING.md` | S | ARC-02-S08/S10; ARC-04-S14 | M5 | Not started |
| ARC-10-S05 | ARC-10 | `docs/ARCHITECTURE.md` "History" section: import tags, ADR links, scope-cut ledger pointer, old-repository links | S | ARC-00-S03; ARC-01-S12 | M5 | Not started |
| ARC-10-S06 | ARC-10 | Author's machine cutover on `v2.0.0`: doctor 0 FAIL, stale entries removed, legacy store gone, engagements untracked | M | S01, S05; ARC-07-S08; ARC-08-S03; ARC-09-S01 | M5 | Not started |
| ARC-10-S07 | ARC-10 | Validation-record template, redaction lint and the cutover test list (T-01…T-18 + `AUTHENTICATION_FAILED` + design-only) | M | ARC-01-S11; ARC-02-S13; ARC-08-S10 | M5 | Not started |
| ARC-10-S08 | ARC-10 | Clean-machine validation runs: macOS, Ubuntu, Windows in `design-only`; one `live` (`pdi-developer`); one proxied laptop | L | S06, S07; ARC-04-S11; ARC-07-S02; ARC-09-S03/S08 | M5 | Not started |
| ARC-10-S09 | ARC-10 | Deprecation notices in `farstic/claude-servicenow-live` and `farstic/snow-mcp`; archive checklist for the owner | S | S08; ARC-04-S14; ARC-09-S01 | M5 | Not started |
| ARC-10-S10 | ARC-10 | Two-week post-release review: telemetry-free feedback loop (issue template with the doctor JSON) and the archive trigger | M | S09; ARC-08-S01 | M5 | Not started |

## Per milestone

| Milestone | Stories | ARCs (stories) | Effort from per-story figures (engineer-days) |
|---|---|---|---|
| M0 Spikes & gates | 14 | ARC-00 (14) | 18.5–31 |
| M1 Foundation | 21 | ARC-01 (12), ARC-02 (5), ARC-03 (4) | 27–31 |
| M2 Server & contract | 40 | ARC-02 (8), ARC-03 (7), ARC-04 (14), ARC-05 (11) | 71.5–81 |
| M3 Install, wizard, doctor | 36 | ARC-06 (14), ARC-07 (11), ARC-08 (11) | 57.5–91.5 |
| M4 Release 2.0.0 | 11 | ARC-09 (11) | 15–25 |
| M5 Migration & cutover | 10 | ARC-10 (10) | 10–14 |

The per-story figures are the ones each STORIES.md states in its sizing table (band midpoints where an ARC gives only bands); the ARC-level ranges quoted in `04-ROADMAP.md` are the ARCs' own totals and are authoritative where the two differ by a day or two.

## Dependency waves (earliest possible start, for parallel planning)

Wave 0 = no story dependencies. A story's wave is one more than the highest wave among its dependencies (ARC-level dependencies count as the whole ARC). 35 waves in total; the first stories of each wave:

- Wave 0: ARC-00-S01, ARC-00-S02
- Wave 1: ARC-00-S03, ARC-00-S04, ARC-00-S06, ARC-00-S07, ARC-00-S08, ARC-00-S09, ARC-01-S01
- Wave 2: ARC-00-S05, ARC-00-S10, ARC-00-S12, ARC-00-S13, ARC-01-S02, ARC-01-S03
- Wave 3: ARC-00-S11, ARC-00-S14, ARC-01-S04, ARC-01-S08, ARC-01-S09
- Wave 4: ARC-01-S05, ARC-02-S01
- Wave 5: ARC-01-S06, ARC-01-S07, ARC-01-S10
- Wave 6: ARC-01-S11, ARC-02-S05, ARC-04-S01
- Wave 7: ARC-01-S12, ARC-02-S02, ARC-02-S06, ARC-02-S10, ARC-04-S02, ARC-04-S09, ARC-04-S11, ARC-05-S02, ARC-07-S01
- Wave 8: ARC-02-S03, ARC-02-S04, ARC-02-S07, ARC-02-S09, ARC-03-S01, ARC-04-S03, ARC-06-S01, ARC-06-S02, ARC-10-S05
- Wave 9: ARC-02-S08, ARC-03-S02, ARC-04-S04, ARC-04-S05, ARC-06-S03
- Wave 10: ARC-02-S11, ARC-03-S03, ARC-03-S05, ARC-04-S06, ARC-06-S05, ARC-10-S02
- Wave 11: ARC-03-S06, ARC-03-S10, ARC-04-S07, ARC-04-S08, ARC-04-S10, ARC-04-S12, ARC-06-S04, ARC-09-S05
- Wave 12: ARC-03-S07, ARC-03-S11, ARC-04-S13, ARC-06-S06
- Wave 13: ARC-03-S08, ARC-03-S09, ARC-04-S14, ARC-05-S01
- Wave 14: ARC-05-S03, ARC-05-S05, ARC-06-S07, ARC-10-S04
- Wave 15: ARC-05-S06, ARC-05-S07
- Wave 16: ARC-05-S04, ARC-05-S08, ARC-05-S10, ARC-07-S02
- Wave 17: ARC-02-S12, ARC-05-S09, ARC-05-S11, ARC-07-S03, ARC-08-S01
- Wave 18: ARC-02-S13, ARC-07-S04, ARC-08-S02, ARC-08-S04, ARC-09-S01
- Wave 19: ARC-03-S04, ARC-07-S05, ARC-08-S05, ARC-09-S02, ARC-09-S04, ARC-09-S06
- Wave 20: ARC-07-S06, ARC-08-S08, ARC-10-S03
- Wave 21: ARC-06-S08, ARC-07-S09
- Wave 22: ARC-06-S09, ARC-08-S09
- Wave 23: ARC-06-S10, ARC-06-S12, ARC-09-S07
- Wave 24: ARC-06-S11, ARC-08-S03
- Wave 25: ARC-06-S13, ARC-06-S14, ARC-07-S07, ARC-08-S06, ARC-08-S07, ARC-09-S09
- Wave 26: ARC-07-S08
- Wave 27: ARC-07-S10, ARC-07-S11
- Wave 28: ARC-08-S10
- Wave 29: ARC-08-S11, ARC-10-S01, ARC-10-S07
- Wave 30: ARC-09-S03, ARC-10-S06
- Wave 31: ARC-09-S08, ARC-09-S10
- Wave 32: ARC-09-S11, ARC-10-S08
- Wave 33: ARC-10-S09
- Wave 34: ARC-10-S10

## How this sheet was built (and how to re-check it)

1. Story IDs: every `### ARC-NN-Sxx` heading has exactly one story-map row and vice versa; IDs are unique across the tree (132 headings, 132 rows).
2. Cross-ARC references: every `ARC-NN-Sxx` / `ARC-NN Sxx` token anywhere under `plans/` resolves to an existing story (0 dangling after the integration pass); the former "ARC-NN story N" title numbers were rewritten to IDs using each ARC's README-number → ID map, resolved by content where an ARC split or merged stories (ARC-01 6 → S01+S08, ARC-03 5 → S05+S06 and 9 → S05+S11, ARC-04 2+7 → S04 and 12 → S01+S03, ARC-07 3 → S03+S05, ARC-09 4 → S04+S07, ARC-10 4 → S07+S08, ARC-06 15 → S07).
3. Dependency graph: built from the story-map "Depends on" cells only (consumer clauses stripped); Tarjan SCC finds no cycle, with or without ARC-level dependencies expanded. Six edges were re-oriented to reach that state — see `04-ROADMAP.md` §"Consistency fixes".
4. Names: `packages/snowarch`, `@farstic/snowarch`, `mcp__servicenow__`, `/snowarch status|setup-instance|doctor`, first release `2.0.0`, Mode `design-only` | `live`, Preset `read-only` | `pdi-developer` | `full` | `custom` — every other spelling under `plans/` now appears only as a "reads as" note, in a retired-name list, or as the untouched npm record `@farstic/snow-mcp@1.0.0`.
