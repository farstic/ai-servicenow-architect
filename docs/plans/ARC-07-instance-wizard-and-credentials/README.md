# ARC-07 — Instance wizard, presets and credentials

Status: **In progress — S01 merged (1 of 11), started 2026-09-10** · Stories drafted 2026-09-04, verified 2026-09-04 · Depends on: ARC-04-S01/S02/S03/S04/S10/S11/S12 (dependency prune, store module, presets, reload, audit writer, R-3 HTTP layer, `Probes` interface), ARC-06-S02/S05/S07/S08 (CLI skeleton, `.local/config.json` mirror, B06 slot + `--instance-file`, handshake helper), ARC-02-S09/S11 (`docs/MODES-AND-PRESETS.md` page, `/snowarch` skill skeleton), ARC-05-S05/S06 (generators, error-code registry), ARC-08-S01 (doctor JSON); ARC-00 S-02/S-04/S-16/S-19 verdicts; owner decisions D-04, D-05, D-06, R-2, R-3 · Blocks: ARC-08 (live checks reuse the probes and the cloud-sync fixture), ARC-10 (`import --from-legacy`)

## Goal

Give the user a guided path to add a ServiceNow instance "with the right permissions": non-secret choices collected inside Claude Code, the secret typed once with masked input in the user's own terminal, the instance proven by live probes before it is saved, the preset explained in plain language and enforced as six explicit flags, production protected by default, and the new instance usable in the same session without a restart.

## Why it exists

Closes P-03 (absent flags; presets always write all six), P-06 (preset vocabulary), P-23 (wizard stores secrets with default file mode, `npm link`, unquoted unscoped `claude mcp add`, never writes FLUENT, "save anyway"), P-25 (tool package pinned), P-34 (no credential in argv or `~/.claude.json`), P-38 (auth methods labelled honestly). The evidence base established that no in-window channel is safe for secrets (`01` §6.1), so the wizard's terminal half is the product's credential boundary.

## Scope

**In:** `snowarch instance add|list|test|remove|set-preset|set-flags|set-credentials|set-default|import` (thin wrappers over the server package's CLI module); masked input; URL validation; reachability probe with DNS / TLS-CA / proxy diagnosis (R-3); auth probes with bounded re-entry; per-preset capability probes; preset table and flag explanations (from ARC-05's generated table); the D-05 per-flag review screen (Propose → Review → Apply, principle 10); prod safeguards (`--ack-prod`, label confirmation); `--global` store and the D-04 cloud-sync-folder WARN; `--password-stdin`; the `/snowarch setup-instance` skill behaviour (AskUserQuestion flow, command printing, `--resume` with `snow_core_instances_reload` and doctor); `docs/MODES-AND-PRESETS.md` final text; `AUTHENTICATION_FAILED` runtime rule in the generated rule file; a live E2E suite behind `RUN_LIVE_E2E=1`.
**Out:** the OS-keychain backend, the client-credentials grant and the localhost secret form (roadmap `01` §17); any UI outside the terminal and the skill.

## Deliverables

- `packages/snowarch/src/cli/instance.ts` (store-backed commands; unit-tested with a fake REST layer) and the `instance` forwarder in `tools/snowarch/bin/snowarch.mjs` (S05, S06).
- Masked input module `packages/snowarch/src/cli/tty.ts` (`process.stdin.setRawMode`; backspace, Ctrl-C, paste) with an S-04-verified Windows path; `--password-stdin`; the no-TTY rule; secrets rejected on argv (S01).
- URL normalisation (`url.ts`) and reachability diagnosis (`reachability.ts`) with the `URL_*` / `ENV_REQUIRED` codes and the wizard-grade remedies for ARC-04-S11's six network codes (`DNS_FAILURE`, `TLS_CA_UNTRUSTED`, `PROXY_UNREACHABLE`, `PROXY_AUTH_REQUIRED`, `NETWORK_TIMEOUT`, `CONNECTION_REFUSED`) (S02); the probe library `packages/snowarch/src/servicenow/probes.ts`, bound to ARC-04-S12's `Probes` interface and reused by `instance test` and the ARC-08 doctor (S03).
- Wizard flow exactly as `01` §6.2 steps 6–7: label, environment (proposed `pdi` for `devNNNNN` hosts, otherwise asked), URL validation (bare https origin; `/api` rejected with reason; trailing slash stripped; HEAD reachability with DNS/TLS/proxy diagnosis), auth method (`basic`, `oauth_ropc` labelled legacy), credentials, `sys_user` probe with a 3-attempt re-entry loop on 401 and no silent retry, role hints on 403, `OAUTH_ROPC_DISABLED` hint, per-preset probes, atomic 0600 write, secret-free summary (S05).
- Preset proposal and the per-flag review screen (`preset-ui.ts`, S04) exactly as `01` §6.3 / D-05: `full` proposed for `pdi`/`dev`/`test` with every flag pre-set ON and annotated with its probe result (a failing probe changes the recommendation text, never the toggle); `read-only` proposed and capped for `prod` unless `set-preset --ack-prod` with the label typed; `--yes` / `--preset` / `--flags` for CI.
- `instance list` (label, environment, preset, default marker, last-probe results — usernames masked, never secrets), `test` (incl. `test --all --json` for ARC-06-S08's B08), `set-credentials`, `set-preset`, `set-flags`, `set-default`, `remove` (S06); `--global` store, precedence messaging and the cloud-sync WARN (`detectCloudSync()` in the store module plus the shared `cloud-sync-paths.json` fixture, S07); `import --from-legacy` (reads `~/.config/servicenow-mcp/instances.json`, migrates with explicit `FLUENT_ENABLED: "false"`, advises deletion — used by ARC-10) (S08).
- The `setup-instance` section of `.claude/skills/snowarch/SKILL.md` (S09): prerequisite check via `./snowarch doctor --json --section prereqs`, three `AskUserQuestion`s, URL/label in chat, printed command in the OS-appropriate form (`./snowarch …` on macOS/Linux/Git Bash, `snowarch.cmd …` in PowerShell/cmd), `--resume` branch calling `snow_core_instances_reload`, `snow_core_capabilities_read`, `./snowarch doctor --json`, printing the Mode line and the §2.1/§2.2 reminder; `allowed-tools` = ARC-02-S11's four entries (doctor commands, `cat .local/bootstrap-state.json`, `Read`) plus the four core `mcp__servicenow__snow_core_*` tools, nothing else; `metadata.version: 2.0.0`.
- `docs/MODES-AND-PRESETS.md` final; error-registry entries (ARC-05-S06's `ERROR_CODES`) feeding `docs/TROUBLESHOOTING.md` for `AUTHENTICATION_FAILED`, `INSUFFICIENT_PRIVILEGES`, `PROD_WRITE_NOT_ACKNOWLEDGED`, `OAUTH_ROPC_DISABLED`, URL-shape and network errors; the three `showInRule: true` runtime entries rendered into the generated rule file (S10).
- Live E2E suite `packages/snowarch/tests/e2e/instance-wizard.e2e.test.ts` and the nightly `e2e-live.yml` workflow behind `RUN_LIVE_E2E=1` (S11).

## Dependencies

ARC-04-S01 (prompt/colour libraries removed; `commander` kept), S02 (store module `src/store/`), S03 (presets, flags, `checkProdPosture`), S04 (`snow_core_instances_reload`, `snow_core_capabilities_read`), S10 (audit writer), S11 (R-3 `snFetch` + `classifyNetworkError`), S12 (`Probes` interface); ARC-05-S05 (rule file, PRESETS block) and S06 (error-code registry, TROUBLESHOOTING renderer); ARC-06-S02 (`snowarch.mjs` skeleton), S05 (`.local/config.json` mirror, `lib/cloud-sync.mjs`), S07 (B06 slot and `--instance-file` — interface-first, stubbed until S05 lands), S08 (`lib/mcp-handshake.mjs`); ARC-02-S09 (`docs/MODES-AND-PRESETS.md` page) and S11 (`/snowarch` skill skeleton); ARC-08-S01 (`doctor --json --section prereqs`) and S03 (E-24 prints `import --from-legacy`; E-25 parity-tests the cloud-sync fixture). Story numbers are as they stand in each ARC's `STORIES.md` on 2026-09-04. ARC-00 verdicts: S-04 (Windows masked input) before S01, S-02 and S-16 before S09, S-19 for the skill lint; per D-06, no story starts before ARC-00-S12 has moved ADR-0006 to Accepted. Owner decisions D-04 (store, auth methods, cloud-sync WARN), D-05 (proposal flow, prod cap), D-06 (terminal hand-off), R-2 (skill name), R-3 (proxy diagnosis).

## Acceptance criteria

- [ ] **A fresh user with a PDI** runs `./snowarch instance add pdi --url https://devNNNNN.service-now.com --env pdi --auth basic --preset pdi-developer --default`, types username and password (nothing echoed; `ps` during the run shows no secret; the shell history contains no secret), reviews the per-flag screen, and receives the summary with all five probes `ok`; `.local/instances.json` has mode 0600, directory 0700, and contains all six flags as strings, `toolPackage: "full"`, `maxRecords: 100` (S01, S05, S11).
- [ ] A wrong password produces `AUTHENTICATION_FAILED — wrong username or password. Re-enter? (attempt 2 of 3)` and, after three failures, exits 1 with nothing saved — exactly one login request per attempt; the instance's user is **not** locked out (verify on the PDI: no lockout after the run) (S03, S05, S11).
- [ ] Every configuration step is Propose → Review → Apply (principle 10, D-05): for `pdi`/`dev`/`test` the wizard proposes `full` with all six flags pre-set ON and annotated with their probe results; a failing probe changes only the recommendation text; any flag is toggleable; `--yes` accepts every proposal (S04).
- [ ] `--env prod --preset full` in the wizard is rejected with the D-05 explanation (`PROD_WRITE_NOT_ACKNOWLEDGED`, exit 3); `set-preset prod full --ack-prod` asks for the label and then succeeds with `prodWriteAck: true`; the server loads it only then (S04, S06, S11).
- [ ] An unreachable host is diagnosed as DNS / TLS-CA / proxy / timeout / refused with the exact remedy (R-3); the wizard offers no "continue anyway" (S02).
- [ ] Inside Claude Code, `/snowarch setup-instance` never asks for a password, prints a command identical to the one a user would type by hand, and `/snowarch setup-instance --resume` ends with `Mode: live — pdi (pdi) · preset pdi-developer · …` **without** restarting the session (S-02; fallback text otherwise) (S09).
- [ ] `./snowarch instance list` output pasted into a chat contains no secret and a masked username (S06, S11).
- [ ] A checkout under OneDrive / Dropbox / iCloud Drive / Google Drive triggers `WARN STORE_IN_CLOUD_SYNC_FOLDER` before any store write (D-04); `--global` writes the per-user store and the project store wins when both hold a label (S07).
- [ ] Windows (PowerShell 5.1 and cmd, no Git Bash): the masked prompt works (S-04) or `--password-stdin` is documented as the fallback in the same output (S01).
- [ ] `import --from-legacy` migrates a legacy wizard store entry (fixture) including its flags and adds explicit `FLUENT_ENABLED: "false"` (S08).
- [ ] Unit tests cover URL validation, preset expansion, dependency rule, probe result mapping, prod cap; no test performs real network calls without `RUN_LIVE_E2E=1` (S02–S06, S11).
- [ ] `docs/MODES-AND-PRESETS.md`, the regenerated `docs/TROUBLESHOOTING.md` and the generated rule file carry the final text; no "Tier" vocabulary remains (S10).

## Risks

> **Amendment 2026-09-06 (from `03` §F S-14a).** On every channel, the instance URL and the user name are treated as confidential engagement data, not merely the password: nothing the wizard or the skill writes may land in user-scope files (`~/.claude/settings.json`, `~/.claude.json`); the per-checkout store is the only home for all three. This is a test, not a guideline.

- Corporate laptops with shared/recorded terminals (R-04) — roadmap localhost form; `--password-stdin` from a password manager CLI is documented meanwhile.
- OAuth ROPC disabled by instance hardening → the probe fails with a clear `OAUTH_ROPC_DISABLED` hint (detect the instance's error text).

## Stories

Full write-ups: [`STORIES.md`](STORIES.md) (11 stories, 20–25 engineer-days). Mapping from the original titles-only list: 1 → S01 · 2 → S02 (R-3 folded in) · 3 → S03 + S05 (probe library split out for reuse by `instance test` and the ARC-08 doctor) · 4 → S04 · 5 → S06 · 6 → S07 (D-04 cloud-sync WARN folded in) · 7 → S08 · 8 → S09 · 9 → S10 · 10 → S11.

| ID | Title | Size |
|---|---|---|
| ARC-07-S01 | Masked-input module (`process.stdin.setRawMode`), `--password-stdin`, the no-TTY rule | M |
| ARC-07-S02 | URL normalisation and validation; environment proposal; reachability probe with DNS / TLS-CA / proxy diagnosis (R-3) | M |
| ARC-07-S03 | Probe library: auth probe (basic, ROPC), 401/403 mapping, `OAUTH_ROPC_DISABLED`, role hints, per-flag capability probes, `lastProbe` record | M |
| ARC-07-S04 | Preset proposal and the per-flag review screen (Propose → Review → Apply); prod cap in the wizard; `--yes` / `--preset` / `--flags` | M |
| ARC-07-S05 | `instance add` end to end: bounded credential re-entry, atomic 0600 save, secret-free summary, the `./snowarch instance` forwarder, exit codes | L |
| ARC-07-S06 | `instance list · test · set-credentials · set-preset (--ack-prod) · set-flags · set-default · remove` | M |
| ARC-07-S07 | `--global` store, project-wins precedence messaging, cloud-sync-folder warning (D-04) | M |
| ARC-07-S08 | `instance import --from-legacy`: dry-run plan, field and flag mapping, explicit `FLUENT_ENABLED`, prod cap, deletion advice | M |
| ARC-07-S09 | `/snowarch setup-instance` skill body: prerequisite check, three `AskUserQuestion`s, printed command per OS, `--resume` with reload + doctor, S-02 fallback | M |
| ARC-07-S10 | `docs/MODES-AND-PRESETS.md` final text; error-registry entries; runtime rule text for `AUTHENTICATION_FAILED` / `INSUFFICIENT_PRIVILEGES` / `PROD_WRITE_NOT_ACKNOWLEDGED` | M |
| ARC-07-S11 | Live E2E suite behind `RUN_LIVE_E2E=1`: wizard end to end, three-failure exit with lockout check, prod cap, ROPC-disabled fixture, import | M |
