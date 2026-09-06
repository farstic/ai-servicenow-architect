# ARC-02 — Engine consolidation and hardening

Status: **Stories drafted 2026-09-04** · Depends on: ARC-01 (all stories); ARC-05 for the generated governance texts and the final retired-name sweep; ARC-00 verdicts S-13 (closed by this ARC's evidence), S-16, S-19 · Blocks: ARC-07 (the `/snowarch setup-instance` skeleton it extends), ARC-08 (roster checks, the `/snowarch status` body), ARC-10

Decisions applied (from `02-DECISIONS-NEEDED.md`, all closed 2026-09-04): D-01 names (`packages/snowarch`, `@farstic/snowarch`, CLI `snowarch`, server key `servicenow` → `mcp__servicenow__`), D-02 licence wording, D-03 scope cut (claude.ai surface and context-mode leave), D-05/principle 10 (documented in `docs/MODES-AND-PRESETS.md`; the interactive behaviour is ARC-06/ARC-07's), D-06 hedge (the `/snowarch setup-instance` skill guides the terminal hand-off), Q-B (native Windows first-class — the in-session skills still need Git for Windows because Claude Code's Bash tool does, `01` §4.1), R-1 (`2.0.0`), R-2 (`/snowarch` with sub-commands `status` · `setup-instance` · `doctor`; no `/status` skill), R-3 (proxy stories are ARC-04/07/08; this ARC only carries their remedies in the skill's hand-off text once they exist). Vocabulary: **Mode** `design-only` | `live`; **Preset** `read-only` | `pdi-developer` | `full` | `custom`.

## Goal

Make the engine content a single, lint-clean, vocabulary-consistent unit: one canonical copy of the 28 skills and 9 agents, a `CLAUDE.md` under 200 lines, one Mode/Preset vocabulary, no retired tool names, no personal tooling, no unimplemented surfaces — while preserving every routing rule, gateway and validation test the engine has today.

## Why it exists

Closes P-02 (contradictory install narratives), P-04 (retired tool names in engine texts), P-06 (four "Tier" vocabularies), P-07 (claude.ai walkthroughs for an unshipped surface), P-08 (duplicated trees, wrong source of truth), P-09 (skill descriptions beyond the listing cap — seven skills invisible to routing), P-10 (pinned model ID, harness-tool naming), P-13 (engagement journals committed as product docs), P-14 (context-mode leakage); templates (P-39) are merged by ARC-01-S09 and only their references are updated here. It also removes the maintenance cost of `sync-agents-skills.sh`, `verify-structure.sh` and the pre-commit chain (P-37) by making the layout itself correct.

## Scope

**In:** `.claude/skills` and `.claude/agents` as the only copies; description rewrite ≤ 500 chars with trigger lists moved into skill bodies; skill `version:` moved under `metadata.version`; agent frontmatter (`model: inherit`, `skills:` preload, unchanged explicit `tools:`); `CLAUDE.md` rewrite (≤ 200 lines, harness-neutral wording, the `Status` / `/snowarch status` Mode rule delegating to the doctor); `governance/` folder (`governance-rules.md`, `taxonomy.md`, `prompt-patterns.md` updated to Mode/Preset and current tool names, §2.1/§2.2 in an interim form until ARC-05 generates them); `tests/VALIDATION-TESTS.md` refreshed (no dated run history; T-07 re-purposed); `docs/MODES-AND-PRESETS.md`; `docs/PLATFORM-NOTES.md` (field-notes platform sections §1-platform, §3, §7, §10, §11, §13, §15); removal of context-mode, the claude.ai surface, the `README.md` 9-step manual (replaced by the ARC-06 install page) and the legacy `docs/` set not in `01` §3; the roster generator for `docs/ARCHITECTURE.md`; the `/snowarch` project skill (`status` complete against the doctor's JSON; `setup-instance` skeleton with the terminal hand-off; `doctor`).
**Out:** the generated rule file, `governance/mcp-protocols.md`, `docs/TROUBLESHOOTING.md` and the permission allow/ask lists (ARC-05 generates them; this ARC consumes them); any server change; the `setup-instance` AskUserQuestion flow and `--resume` reload logic (ARC-07-S09); the `status` JSON rendering details (ARC-08-S09); `scripts/legacy/` (ARC-01 imports it, ARC-10 deletes it).

## Deliverables

- `.claude/skills/<28>/` and `.claude/agents/<9>.md` canonical; root `skills/`, `agents/`, `scripts/sync-agents-skills.sh`, `scripts/verify-structure.sh`, `.githooks/` deleted; every path reference rewritten; a body-comparison script proving no content loss.
- `tests/skills-lint.test.mjs` + `tests/agents-lint.test.mjs` (Node `node:test`, no dependencies): every `SKILL.md` has `name` (== directory, not a Claude Code built-in command name — R-17), `description` ≤ 500 chars (quoted when it contains `: `), `metadata.version`; every agent has `name`, `description`, explicit `tools` (no MCP), `model: inherit`, `skills:`; combined agent descriptions under the 15,000-token warning; internal path references resolve; `claude plugin validate` in a CI job that is skipped (not red) when the CLI is absent (S-19).
- `CLAUDE.md` ≤ 200 lines: identity, the two-phase routing protocol with the Domain Expert gateway, §1.1 summary with pointer to `governance/governance-rules.md`, builder-pair rules, "the MCP write gate and update-set capture live in the generated rule file", the `Status` / `/snowarch status` definition ("run `./snowarch doctor --quick` and quote its `Mode:` line verbatim"), Standing Rule for platform findings, maintenance pointers. The ARC-01-S06 marker line `**Version:** 2.0.0-dev — …` is preserved byte-for-byte (written by `scripts/release.mjs`, ARC-09-S01; asserted by ARC-01-S06's `tests/version-consistency.test.mjs`) — this ARC introduces no second version-line format.
- `governance/` texts updated; every "Tier N" replaced by Mode/Preset wording; every `mcp__nowaikit__` / `mcp__servicenow-mcp__` / retired name replaced (final sweep gated by ARC-05's lint).
- `docs/PLATFORM-NOTES.md` (PN-01…PN-07, each with a ServiceNowDocs grounding path where the corpus has one, otherwise the explicit "none in ServiceNowDocs … observed behaviour" wording — never an invented citation); `docs/nowaikit-field-notes.md` and `docs/LIVE-ARTEFACTS-CATALOGUE.md` not carried; the seven server-behaviour sections handed to ARC-04-S07/S08/S09/S14 as regression-test titles and a CHANGELOG "known limitations" list.
- `docs/MODES-AND-PRESETS.md` v1 (Mode semantics, the `01` §6.3 preset table between `PRESETS:BEGIN/END` markers for ARC-05's generator, the per-flag review screen and D-05 proposal rules, plain-language flags, prod safeguards, principle 10, the D-04 store and cloud-sync warning); ARC-07-S10 finalises it.
- `.claude/skills/snowarch/SKILL.md` (user- and model-invocable; `allowed-tools: Bash(./snowarch doctor*), Bash(node tools/snowarch/bin/snowarch.mjs doctor*), …`; sub-commands `status` · `setup-instance` · `doctor`; registered as a utility skill via `engine.config.json.roster.utility`, so the roster count stays 28).
- `scripts/gen-roster.mjs` writing the roster block of `docs/ARCHITECTURE.md` from the directory listing, with `--check` in `npm run lint`.
- `tests/VALIDATION-TESTS.md` with T-01 … T-18 rewritten to Mode/Preset and current tool names; T-07 (sync hook) replaced by a Mode-reporting / `/snowarch` test; the dated run-history sections (already deleted at import by ARC-01-S10) kept out by a shape test, and the "Regression Workflow" pointer to them removed; one recorded design-only execution.
- README/INSTALL narrative reduced to an interim page until the ARC-06 page lands; `docs/ADVANCED-WEB-SETUP.md`, `docs/INSTALLATION-GUIDE.md`, `docs/MCP-OPERATIONS-GUIDE.md`, `docs/TECHNICAL-ARCHITECTURE.md`, `docs/BUSINESS-OVERVIEW.md`, `docs/README.md`, `docs/IMPORT-NOTES.md`, root `SETUP.md`, `.claude/settings.example.json` deleted or folded into `docs/ARCHITECTURE.md`; `client-onboarding.md` stripped of the claude.ai steps and §9b and moved to `docs/CLIENT-ONBOARDING.md`; `docs/USER-GUIDE-AND-EXAMPLES.md` kept as `docs/USER-GUIDE.md` (both additions to the `01` §3 `docs/` line — see Risks).

## Dependencies

ARC-01 — by story ID as written in `ARC-01/STORIES.md`: S02 (engine import, tag `import/engine-v2.8.0-worktree`), S04 (`engine.config.json`), S05 (root `package.json`, `npm test` runner), S06 (`**Version:**` marker + version test), S07 (`.gitignore`), S09 (templates merge), S10 (residue purge + legacy-name ratchet with ARC-02-owned allow-list rows), S11 (CI matrix, advisory `plugin-validate` job), S12 (`docs/ARCHITECTURE.md` / `CONTRIBUTING.md` stubs). ARC-05 — S01 (pinned contract), S02 (`retired-names.json`), S03/S04 (`engine-lint.mjs`), S05 (generated rule file), S06 (`governance/mcp-protocols.md`), S09 (`contract` CI job); stories S01–S11 do not wait for ARC-05 (S12 does; S13 waits on S12). ARC-03-S02/S03 (citation scanner; scan set must include `docs/PLATFORM-NOTES.md`), ARC-03-S04 (repairs the two dead citations that exist today). ARC-04-S07/S08/S09/S14 receive the S10 handover. ARC-00: S-13 is closed by S03's evidence; S-16 affects whether the skill's doctor call prompts; S-19 decides whether `claude plugin validate` runs on CI. Not a dependency of this ARC but recorded for the reader: the D-06 hedge (S-14a–g concluded before ARC-06 starts) gates ARC-06, not ARC-02 — the `/snowarch setup-instance` skeleton is written here on the monorepo path and would be re-pointed by ARC-07-S09 if the channel decision were re-opened.

## Acceptance criteria

- [ ] `diff -rq` of the old `.claude/skills` against the new one shows only frontmatter/description, `## Triggers` and citation-path changes (no body-content loss) — verified by `scripts/maint/compare-skill-bodies.mjs`, which strips frontmatter and the new section and compares (S01, S03).
- [ ] In a fresh `claude` session in the repository, the skill listing shows **all 28 roster skills (29 entries with `snowarch`) with a description** (S-13, evidence file committed) and `/snowarch status` — and the plain-text `Status` — return the doctor's `Mode:` line (S03, S11; against the doctor stub until ARC-08, against the real doctor from ARC-08's CI run).
- [ ] `wc -l CLAUDE.md` ≤ 200; `grep -c "Task tool" CLAUDE.md governance/*.md` = 0; `grep -rn "Tier [0-9]" CLAUDE.md governance docs .claude tests` = 0 — with one ruling for the verifier: lines under the `## Before 2.0.0` heading of `docs/CHANGELOG.md` are history and are excluded by the test with a disclaimer sentence (S06 open point — closed at integration 2026-09-04: exclusion with disclaimer, no rewrite) (S06, S08).
- [ ] `node packages/contract/lint/engine-lint.mjs` (from ARC-05) passes: no retired name, correct prefix, all tool tokens in the contract (S12).
- [ ] `grep -rn "context-mode\|ctx_\|claude_desktop_config\|claude-ai-projects" --include=*.md --include=*.json --include=*.sh .` (excluding `vendor/`, `node_modules/`, `.git/` and `scripts/legacy/`, which ARC-10 deletes) returns nothing outside the `## History` section of `docs/ARCHITECTURE.md` (S05).
- [ ] `tests/VALIDATION-TESTS.md` T-01 … T-18 pass in design-only mode on a clean machine (the two §1.1/§6.2 gate tests included; T-05/T-06 on their dormant variant; live-mode execution deferred to ARC-09/ARC-10) — recorded under `docs/spikes/validation-runs/` (S13).
- [ ] Every agent runs with `model: inherit` and loads its persona through `skills:`; a dispatched Developer sub-agent produces the same artefact structure as before (structure baseline captured before the change; regression run of the §6.2 validation test) (S04).
- [ ] `scripts/gen-roster.mjs --check` passes in CI and `docs/ARCHITECTURE.md` shows 28 skills / 9 agents / 1 utility skill generated from the directory listing (S07).
- [ ] `tests/legacy-names.allowlist.json` (ARC-01-S10) contains no row owned by `ARC-02` and `node --test tests/no-legacy-names.test.mjs` passes — the "allow-list empty for my files" criterion ARC-01-S10 asks every consuming ARC to carry (rows retired by S05/S06/S08/S13; final check in S12).
- [ ] `grep -c '^\*\*Version:\*\* ' CLAUDE.md` = 1 and `tests/version-consistency.test.mjs` (ARC-01-S06) passes unchanged after the `CLAUDE.md` rewrite (S08).

## Risks

- Description rewrites weaken auto-routing (R-06). Mitigation: keep the first sentence as the trigger sentence, list trigger keywords in the body's `## Triggers` section, run T-01/T-02/T-14/T-17 in S03 and the full suite in S13; fallback ≤ 300 chars, then persona routing in `CLAUDE.md` (`03` S-13).
- `governance/` relocation breaks citations inside skills that reference `governance-rules.md` by root path (25 mentions in 17 skill files today; 55 across all engine texts — measured 2026-09-04). Mitigation: S01/S06 rewrite them; the S02 lint (SK-10) and the ARC-05 lint check internal path references.
- The `/snowarch` sub-command dispatch relies on Claude Code substituting the typed arguments into the skill (`docs:skills`, `$ARGUMENTS`) — documented, not yet exercised in `00` §9. Mitigation: a ten-minute check is the first task of S11; fallback is three skills `snowarch-status` / `snowarch-setup-instance` / `snowarch-doctor` (R-2's intent preserved; owner informed).
- Some platform notes have no page in the corpus that states the behaviour (`sys_outbound_http_log`, `sys_script_fix` truncation, REST honouring `sys_user_preference`). Mitigation: explicit "observed" wording; no invented citations.
- Two later ARCs (ARC-07-S09, ARC-08-S09) extend `.claude/skills/snowarch/SKILL.md` in place. Mitigation: merge order recorded in S11; frontmatter and hand-off block are byte-frozen unless the owner changes the wording.
- `docs/USER-GUIDE.md` and `docs/CLIENT-ONBOARDING.md` are not in the `01` §3 `docs/` line. Mitigation: proposed as additions; the verifier may instead fold the user guide into `docs/INSTALL.md` "First session" (ARC-06-S13).

## Stories

Detailed write-ups: [`STORIES.md`](STORIES.md). Story order differs from the pre-decision title list (removals before the governance move, governance move before the `CLAUDE.md` rewrite, roster generator pulled forward). Other ARCs cite this ARC by story ID since the integration pass of 2026-09-04; the original title numbers are kept here for the record ("ARC-02 story 10" was the `/snowarch` skill, "story 7" MODES-AND-PRESETS, "story 9" the removals, "story 11" the retired-name sweep, "story 2" the lint):

| Original title № | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Story ID | S01 | S02 | S03 | S04 | S08 | S06 | S09 | S10 | S05 | S11 | S12 | S13 | S07 |

| ID | Title | Size |
|---|---|---|
| ARC-02-S01 | Make `.claude/` canonical: delete root mirrors, sync script, structure gate and pre-commit chain; rewrite every path reference | M |
| ARC-02-S02 | Skills lint and agents lint (`tests/skills-lint.test.mjs`), wired into CI | M |
| ARC-02-S03 | Rewrite every skill description to ≤ 500 chars; triggers into bodies; `version:` → `metadata.version`; S-13 verification | L |
| ARC-02-S04 | Agent frontmatter: `model: inherit`, `skills:` preload, `tools:` unchanged; §6.2 regression run | M |
| ARC-02-S05 | Remove context-mode, the claude.ai surface, the settings example, the 9-step README manual; disposition of legacy docs | M |
| ARC-02-S06 | Move governance texts to `governance/`; Mode/Preset vocabulary sweep across CLAUDE.md, governance, docs, skills, tests | M |
| ARC-02-S07 | Roster generator: `scripts/gen-roster.mjs` writes the roster table into `docs/ARCHITECTURE.md`; `--check` in CI | S |
| ARC-02-S08 | `CLAUDE.md` ≤ 200 lines rewrite; harness-neutral wording; `Status` → `/snowarch status`; version line owned by the release script | L |
| ARC-02-S09 | `docs/MODES-AND-PRESETS.md` — Mode semantics, the preset table and plain-language flags of `01` §6.3, principle 10 | S |
| ARC-02-S10 | `docs/PLATFORM-NOTES.md` from the field notes; server-behaviour sections handed to ARC-04 as regression-test titles | M |
| ARC-02-S11 | `/snowarch` project skill: `status` (delegates to the doctor), `setup-instance` skeleton with the terminal hand-off, `doctor` | M |
| ARC-02-S12 | Retired-name final sweep with ARC-05's `retired-names.json` and `engine-lint.mjs` (incl. ITOM SKILL/EXAMPLES) | S |
| ARC-02-S13 | Refresh `VALIDATION-TESTS.md` (T-01…T-18) to Mode/Preset and current tool names; replace T-07; strip run history; execute in design-only mode | M |

Sizing: ≈ 22.5 engineer-days (range 20–28); critical path S01 → S02 → S03 → S04 → S05 → S06 → S07 → S08 → S11 → S13; S12 waits on ARC-05.
