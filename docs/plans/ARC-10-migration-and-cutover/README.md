# ARC-10 — Migration and cutover from the old repositories

Status: **In progress — S01–S02 merged (2 of 10), started 2026-09-12** · Depends on: every other ARC (ARC-09's `v2.0.0` tag in particular; see the phase split below) · Blocks: nothing — it ends the programme

## Goal

Move the author (first) and then every user from the two old repositories and their machine-local wiring to the unified product without losing engagement state or leaving credentials behind, prove the product end to end on clean machines, and retire the old repositories with clear pointers.

## Why it exists

Closes the residual halves of P-13 (residue and `memory/` convention), P-34 (six credential copies in `~/.claude.json` and `.bak-*` files on existing machines), P-15 (old names still reachable), and the engagement-continuity risk that a re-architecture always carries. It also converts the engine's "Standing Rule — document every solved problem" and the 2026-06-08 "MCP findings excluded" rule into the new split (`01` DR-16).

## Scope

**In:** author's machine cutover; the cleanup guidance the doctor already prints (stale registrations, legacy store, `.bak-*` reminder); `clients/` engagement folders and `memory/` conventions carried into the new checkout; full VALIDATION-TESTS run in both modes (`design-only` and `live` / `pdi-developer`) on clean machines, plus one proxied laptop (R-3); the old repositories' README deprecation notices and GitHub archive (owner action); final `docs/ARCHITECTURE.md` history section; the standing-rule text rewritten; retirement of the parked legacy scaffolding (`scripts/legacy/`, transitional `.gitignore` lines, legacy-name allow-list) handed over by ARC-01.
**Out:** any edit to the old repositories before the new one is tagged `v2.0.0` (the old repos stay read-only until then); any npm action on the existing `@farstic/snow-mcp@1.0.0` record (D-01 — never touched); telemetry of any kind; team/shared-instance migration (Q-A — roadmap ARC).

## Deliverables

- `docs/MIGRATION.md`: step list for an existing user — clone the new repo, `./bootstrap.sh`, `./snowarch instance import --from-legacy` (Propose → Review → Apply, principle 10) or add fresh, copy `clients/<name>/` folders, run the doctor, then `claude mcp remove servicenow-mcp -s local` / `… nowaikit …` per project, delete `~/.claude.json.bak-*` after review, delete `~/.config/servicenow-mcp/`, remove context-mode hooks from personal settings if unwanted (explicitly the user's choice, D-03); proxy / private-CA note (`HTTPS_PROXY`, `NO_PROXY`, `NODE_EXTRA_CA_CERTS`, R-3). A machine check (`tests/migration-doc.test.mjs`) ties every doctor leftover remedy to the page. (S01)
- Engagement-state carry-over: `clients/` stays gitignored; `docs/CONTRIBUTING.md` documents the per-checkout-per-engagement recommendation and Claude Code's auto memory as the replacement for the `memory/MEMORY.md` convention. (S02)
- Legacy scaffolding retired: `scripts/legacy/` deleted, obsolete `.gitignore` lines removed, `tests/legacy-names.allowlist.json` reduced to the ARC-10-owned README line. (S03)
- Rewritten standing rule in `CLAUDE.md`/`docs/CONTRIBUTING.md`: platform findings → `docs/PLATFORM-NOTES.md`; server behaviours → `packages/snowarch/CHANGELOG.md` + regression test under `packages/snowarch/tests/`; instance-specific values → never committed (`.local/`, `clients/<name>/`, auto memory). (S04)
- `docs/ARCHITECTURE.md` "History" section linking import tags (`import/engine-v2.8.0-worktree`, `import/snow-mcp-1.0.0`) and the ADRs of ARC-00, with a test that the tags and links resolve. (S05)
- Validation-record tooling: `docs/validation/TEMPLATE.md`, redaction lint `tests/validation-records.test.mjs`, and the cutover test list appended to `tests/VALIDATION-TESTS.md`. (S07)
- Clean-machine validation records (macOS, Ubuntu, Windows): VALIDATION-TESTS T-01 … T-18 plus T-19 (`AUTHENTICATION_FAILED`), T-20 (`*_NOT_ENABLED`) and the design-only checks, in `design-only` and `live` (`pdi-developer`) modes, plus one proxied-laptop record; results stored under `docs/validation/<date>-<os>.md` without instance identifiers; the Q-B Windows outcome (native vs "Git Bash required") recorded. (S06, S08)
- Deprecation notices for `farstic/claude-servicenow-live` and `farstic/snow-mcp` README tops ("superseded by …; history preserved under import tags in the new repository"); owner archive checklist in `docs/CONTRIBUTING.md`; GitHub "archived" flag (owner action) after the notices land and the two-week review. (S09, S10)
- Telemetry-free feedback loop: `.github/ISSUE_TEMPLATE/install-problem.yml` and `migration-problem.yml` carrying the redacted `./snowarch doctor --json`; the post-release review record. (S10)

## Dependencies

All ARCs complete; `v2.0.0` tagged (ARC-09). **Phase split:** S01–S05 and S07 are in-tree deliverables that must merge *before* ARC-09 runs `node scripts/release.mjs 2.0.0` (the `v2.0.0` README links to `docs/MIGRATION.md`); S06, S08, S09 and S10 run *after* the `v2.0.0` tag exists (exception: S08's proxied-laptop run may execute on the release candidate, as ARC-04-S11's test strategy expects it "before the tag"). Specific upstream stories: ARC-07-S02 (reachability probe diagnosis), ARC-07-S08 (`instance import --from-legacy`), ARC-07-S11 (fixture harness), ARC-08-S01/S03/S10 (check registry / leftover detectors E-23…E-26 / T-19–T-20), ARC-06-S13 (install page, Uninstall section), ARC-01-S07/S10/S11/S12, ARC-02-S08/S10/S12/S13, ARC-04-S01/S11/S14, ARC-09-S01 (tag), S02 (`docs/CHANGELOG.md`), S03 (release assets), S07 (upgrade nudge), S08 (CI matrix), S11 (`docs/INSTALL.md#upgrading`).

## Acceptance criteria

- [ ] **The author's machine** after following `docs/MIGRATION.md`: `./snowarch doctor` 0 FAIL; `jq '.projects | to_entries[] | select(.value.mcpServers != null) | .key' ~/.claude.json` lists no entry for the new checkout and the old entries the author chose to remove are gone; `~/.config/servicenow-mcp/` absent; engagement folders present and untracked. (S06)
- [ ] **Three clean machines** (one per OS) reach `Mode: design-only` from the install page alone (no author present), and one of them reaches `Mode: live` (`pdi-developer`) against a PDI, with the validation records committed. (S07, S08)
- [ ] The old repositories show the deprecation notice on GitHub and are archived; the new repository's README links to `docs/MIGRATION.md`. (S01, S09, S10)
- [ ] `git log --oneline import/engine-v2.8.0-worktree..v2.0.0 | wc -l` > 0 and the import tags resolve in the new repository. (S05, S06)
- [ ] `grep -rn "Standing Rule\|nowaikit-field-notes" CLAUDE.md docs` shows only the rewritten rule and the migration note. (S04)
- [ ] A user who ignores the cleanup steps still gets a doctor report naming every leftover with its exact command (verified with the ARC-08 fixture). (S01)

## Risks

- Users with engagement content inside the old engine checkout lose track of it. Mitigation: `docs/MIGRATION.md` step "preserve engagement content first", with a checksum listing before and after (S01, S02).
- Archiving too early breaks someone's clone. Mitigation: notices first, archive two weeks after `v2.0.0`, decided at the S10 review.
- No proxied corporate laptop available by the tag. Mitigation: the proxy run is recorded as "not performed" with a date commitment; S09 is not blocked (R-3 checks are unit/integration-tested in ARC-04/07/08).

## Stories

Full write-ups: [STORIES.md](STORIES.md) (10 stories, ≈ 10.5–14 engineer-days plus a fixed 14-calendar-day wait between S09 and S10).

| ID | Title | Size | Status |
|---|---|---|---|
| ARC-10-S01 | `docs/MIGRATION.md`: existing-user step list and the cleanup command list derived from the ARC-08 detectors | M | **Done** |
| ARC-10-S02 | Engagement-state carry-over: `clients/` per checkout, `memory/MEMORY.md` retired in favour of Claude Code auto memory | S | **Done** |
| ARC-10-S03 | Retire the legacy scaffolding: `scripts/legacy/`, obsolete `.gitignore` lines, empty legacy-name allow-list | S | — |
| ARC-10-S04 | Rewrite the standing rule and the field-notes policy (DR-16) in `CLAUDE.md` and `docs/CONTRIBUTING.md` | S | — |
| ARC-10-S05 | `docs/ARCHITECTURE.md` "History" section: import tags, ADR links, scope-cut ledger pointer, old-repository links | S | — |
| ARC-10-S06 | Author's machine cutover on `v2.0.0`: doctor 0 FAIL, stale entries removed, legacy store gone, engagements untracked | M | — |
| ARC-10-S07 | Validation-record template, redaction lint and the cutover test list (T-01…T-18 + `AUTHENTICATION_FAILED` + design-only) | M | — |
| ARC-10-S08 | Clean-machine validation runs: macOS, Ubuntu, Windows in `design-only`; one `live` (`pdi-developer`); one proxied laptop | L | — |
| ARC-10-S09 | Deprecation notices in `farstic/claude-servicenow-live` and `farstic/snow-mcp`; archive checklist for the owner | S | — |
| ARC-10-S10 | Two-week post-release review: telemetry-free feedback loop (issue template with the doctor JSON) and the archive trigger | M | — |

Mapping from the original titles-only list: 1 → S01; 2 → S06; 3 → S02; 4 → S07 + S08 (tooling split from execution); 5 → S04; 6 → S05; 7 → S09; 8 → S10; S03 is new (discharges the `scripts/legacy/` and `.gitignore` obligations ARC-01 handed to ARC-10).
