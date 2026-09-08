# ARC-02 — Stories

Status: Draft · Decisions applied: D-01…D-06, Q-A, Q-B, R-1…R-3 · Source: README.md of this ARC · Last updated: 2026-09-04

Naming applied throughout (D-01, R-1, R-2): package directory `packages/snowarch`, npm record `@farstic/snowarch`, CLI `./snowarch` (`snowarch.cmd` on Windows), MCP server key `servicenow` → tool prefix `mcp__servicenow__`, first unified release `2.0.0`, project skill `/snowarch` with sub-commands `status` · `setup-instance` · `doctor`. Every older mention of `packages/snow-mcp`, `/status`, `/setup-instance`, `1.0.0` or "Tier N" in `01` is read with those substitutions; vocabulary is **Mode** (`design-only` | `live`) and **Preset** (`read-only` | `pdi-developer` | `full` | `custom`).

Story order differs from the README's title list (which was written before the decisions): removals (README 9) run before the governance move (README 6), and the governance move runs before the `CLAUDE.md` rewrite (README 5), so that every later story edits paths that already exist. README 13 (roster generator) is pulled forward because the `CLAUDE.md` rewrite depends on it. The mapping is in the story map's "Delivers" column.

## Story map
| ID | Title | Size | Depends on | Delivers |
|---|---|---|---|---|
| ARC-02-S01 | Make `.claude/` canonical: delete root mirrors, sync script, structure gate and pre-commit chain; rewrite every path reference | M | ARC-01-S02, ARC-01-S09 | README story 1; P-08, P-37 (engine half) |
| ARC-02-S02 | Skills lint and agents lint (`tests/skills-lint.test.mjs`), wired into CI | M | S01; ARC-01-S11, ARC-01-S05; ARC-00 S-19 | README story 2 (lint), story 4 (hazard rule); roster gate the doctor reuses |
| ARC-02-S03 | Rewrite every skill description to ≤ 500 chars; triggers into bodies; `version:` → `metadata.version`; S-13 verification | L | S02 | README story 3; P-09; minor fold (metadata.version); S-13 evidence |
| ARC-02-S04 | Agent frontmatter: `model: inherit`, `skills:` preload, `tools:` unchanged; §6.2 regression run | M | S02 | README story 4; P-10 (model pin) |
| ARC-02-S05 | Remove context-mode, the claude.ai surface, the settings example, the 9-step README manual; disposition of legacy docs | M | S01; ARC-01-S10 | README story 9; P-02, P-07, P-13 (field-notes half), P-14 |
| ARC-02-S06 | Move governance texts to `governance/`; Mode/Preset vocabulary sweep across CLAUDE.md, governance, docs, skills, tests | M | S05; ARC-01-S04 | README story 6; P-06 |
| ARC-02-S07 | Roster generator: `scripts/gen-roster.mjs` writes the roster table into `docs/ARCHITECTURE.md`; `--check` in CI | S | S02; ARC-01-S12 | README story 13; P-12 (hand-maintained counts) |
| ARC-02-S08 | `CLAUDE.md` ≤ 200 lines rewrite; harness-neutral wording; `Status` → `/snowarch status`; version line owned by the release script | L | S06, S07; ARC-01-S06 | README story 5; P-02, P-10 (harness naming) |
| ARC-02-S09 | `docs/MODES-AND-PRESETS.md` — Mode semantics, the preset table and plain-language flags of `01` §6.3, principle 10 | S | S06 | README story 7; P-06 |
| ARC-02-S10 | `docs/PLATFORM-NOTES.md` from the field notes; server-behaviour sections handed to ARC-04 as regression-test titles | M | S05 | README story 8; P-13; DR-16 |
| ARC-02-S11 | `/snowarch` project skill: `status` (delegates to the doctor), `setup-instance` skeleton with the terminal hand-off, `doctor` | M | S02, S08; ARC-00 S-16 | README story 10; R-2; D-06 hedge (hand-off guidance); unblocks ARC-07-S09, ARC-08-S09 |
| ARC-02-S12 | Retired-name final sweep with ARC-05's `retired-names.json` and `engine-lint.mjs` (incl. ITOM SKILL/EXAMPLES) | S | S06; ARC-05-S02–S04 | README story 11; P-04 (engine texts) |
| ARC-02-S13 | Refresh `VALIDATION-TESTS.md` (T-01…T-18) to Mode/Preset and current tool names; replace T-07; strip run history; execute in design-only mode | M | S08, S11, S12 | README story 12; R-06 mitigation |

## Stories

### ARC-02-S01 — Make `.claude/` canonical: delete root mirrors, sync script, structure gate and pre-commit chain; rewrite every path reference
**As** a maintainer **I want** exactly one committed copy of the 28 skills and 9 agents, in the directories Claude Code actually reads, **so that** no gate verifies a mirror, no agent loads a mirror, and no sync script or hook is needed to keep two trees equal.
**Context.** P-08 (`00` §3.2: `skills/` ≡ `.claude/skills/`, `agents/` ≡ `.claude/agents/`, byte-identical, both committed; gates scan the root copy, agents read the root copy — `agents/developer.md:16,34` → `skills/developer/SKILL.md`; `verify-citations.sh:21` `SCAN_DIR=skills`). P-37 (pre-commit chain inert until `core.hooksPath` is set). ARC README acceptance criterion 1 (`diff -rq` body-content preservation) and `01` §15 ("root mirrors, sync script and pre-commit chain deleted"). Claude Code discovers project skills only at `.claude/skills/<name>/SKILL.md` and project sub-agents at `.claude/agents/` (`00` §9, `docs:skills`, `docs:sub-agents`).
**Scope.** In: deletion of `skills/`, `agents/`, `scripts/sync-agents-skills.sh`, `scripts/verify-structure.sh`, `.githooks/`; a one-pass rewrite of every `skills/<x>` and `agents/<x>` path reference in `CLAUDE.md`, `governance-rules.md`, `taxonomy.md`, `prompt-patterns.md`, `VALIDATION-TESTS.md`, `docs/**`, `.claude/skills/**`, `.claude/agents/**` to `.claude/skills/<x>` / `.claude/agents/<x>`; re-pointing `scripts/verify-citations.sh` `SCAN_DIR` to `.claude/skills` until ARC-03 replaces it; a comparison script proving no body content was lost; removal of the `.DS_Store` files that are the only present difference between the trees. Out: any change to skill or agent *content* (S03, S04); the `governance/` move (S06); deleting `scripts/verify-citations.sh` itself (ARC-03-S03 replaces it with `tools/snowarch/lib/docs/verify.mjs`).
**Design notes.**
- Pre-condition check (first task): `diff -rq skills .claude/skills` and `diff -rq agents .claude/agents` report nothing except `.DS_Store`. If any real difference exists, stop and reconcile by hand — the `.claude/` side is canonical per `scripts/sync-agents-skills.sh:11-16` and `README.md:212`; `docs/TECHNICAL-ARCHITECTURE.md:301` and `docs/README.md:131` say the opposite and are corrected in S05.
- Deletions: `git rm -r skills agents .githooks scripts/sync-agents-skills.sh scripts/verify-structure.sh`. Nothing is deleted from the source repositories (D-03 wording applies to this repo only).
- Path rewrite (mechanical, reviewable): `node scripts/maint/rewrite-roster-paths.mjs` (throwaway, committed under `scripts/maint/` and deleted at the end of the ARC) applies, with word boundaries and excluding `vendor/`, `packages/`, `node_modules/`, `.git/`: `(?<![\w./-])skills/([a-z0-9-]+)/(SKILL|EXAMPLES)\.md` → `.claude/skills/$1/$2.md`; `(?<![\w./-])agents/([a-z0-9-]+)\.md` → `.claude/agents/$1.md`; bare directory mentions ``skills/`` and ``agents/`` inside backticks → ``.claude/skills/`` / ``.claude/agents/``. Known counts before (measured 2026-09-04 on the engine working tree): 25 references to `governance-rules.md` in 17 skill files (left alone here, moved in S06); 31 `skills/<x>/SKILL.md|EXAMPLES.md` tokens and 27 `agents/<x>.md` tokens under `.claude/` plus the four governing documents; 2 per agent body (the `## Skill` "Load and apply" line — `agents/developer.md:16` — and the numbered "Read the SKILL" step — `:34`).
- `scripts/verify-citations.sh`: change `SCAN_DIR=skills` to `SCAN_DIR=.claude/skills` (one line); it remains runnable from CI by ARC-01's skeleton until ARC-03-S03 deletes it.
- Body-content preservation script `scripts/maint/compare-skill-bodies.mjs <old-tree> <new-tree>`: for every `SKILL.md`, `EXAMPLES.md`, agent file, strip the YAML frontmatter, normalise the rewritten path tokens, and `diff`; print `bodies identical: N/N` or the first differing hunk. Kept in the tree for the whole ARC (S03/S04 reuse it against the `import/engine-v2.8.0-worktree` tag from ARC-01) and deleted with `scripts/maint/` at the end.
- VALIDATION-TESTS `T-07 — agents/skills auto-sync on commit` (`VALIDATION-TESTS.md:611-653`) tests the deleted hook. In this story it is marked `RETIRED (S01) — replaced in ARC-02-S13`; the replacement subject is defined in S13.
- `.gitignore` obtains `**/.DS_Store` (ARC-01-S07 owns the file; this story adds the single line if absent).
**Acceptance criteria.**
1. Given the ARC-01 import, when the story is merged, then `git ls-files skills agents .githooks scripts/sync-agents-skills.sh scripts/verify-structure.sh` prints nothing and `git ls-files .claude/skills | wc -l` = 58 (28 × SKILL.md + EXAMPLES.md = 56, plus the two tracked asset files `diagramming-specialist/templates/house-style-reference.drawio` and `.svg` — measured on the engine working tree 2026-09-04) and `ls .claude/agents/*.md | wc -l` = 9.
2. Running `node scripts/maint/compare-skill-bodies.mjs <worktree at import/engine-v2.8.0-worktree>/.claude <repo>/.claude` prints **`bodies identical: 62/65`** and `assets identical: 2/2`. *(Amended 2026-09-08, measured. The criterion's 65/65 predates ARC-03. Three files legitimately differ from the import — `licensing-specialist/{SKILL,EXAMPLES}.md` and `agents/now-assist-specialist.md` — because **ARC-03-S04 and S04b repaired their dead citations**, which is a change the import tag cannot contain. Verified programmatically that **every changed line in the three differs only in a citation token and in nothing else**, so the criterion's actual claim — no body content was lost in the move — holds. A future run of this script must expect 62/65 plus any further deliberate edits, each attributable.)* (the two diagramming template files compared by `sha256`) — ARC README acceptance criterion 1.
3. `grep -rnE "(^|[^./\w])(skills|agents)/[a-z0-9-]+" CLAUDE.md governance-rules.md taxonomy.md prompt-patterns.md VALIDATION-TESTS.md docs .claude --include=*.md` returns only occurrences already prefixed by `.claude/` (i.e. zero bare root-path references).
4. Every path produced by the rewrite resolves: `for p in $(grep -rhoE "\.claude/(skills|agents)/[A-Za-z0-9_./-]+\.md" CLAUDE.md governance-rules.md taxonomy.md prompt-patterns.md docs .claude | sort -u); do test -f "$p" || echo "DEAD $p"; done` prints nothing.
5. ~~`bash scripts/verify-citations.sh` prints `Citations checked: 175 | dead: 2`~~ **— MOOT. ARC-03-S03 deleted `scripts/verify-citations.sh` and replaced it with `tools/snowarch/lib/docs/verify.mjs`; ARC-03-S04/S04b then repaired every dead citation. The equivalent today is `node scripts/docs.mjs verify` → `checked: 161 | dead: 0`, exit 0. This story's task 4 (re-point `SCAN_DIR`) is likewise moot: the script it edits no longer exists.** *(Amended 2026-09-08.)* The original text follows for the record — the same `checked` count as before the story (measured 2026-09-04). The two dead citations pre-date this story and are repaired by ARC-03-S04; the script's non-zero exit is therefore unchanged by this story and is not a failure of it.
6. In a fresh `claude` session at the repo root, the skill listing (descriptions are shown in the listing — `docs:skills`, `00` §9) still shows 28 project skills and a dispatched `developer` sub-agent still finds its skill (smoke run of T-01's dispatch step; full regression is S04/S13).
7. `VALIDATION-TESTS.md` T-07 carries the `RETIRED (S01)` marker and no other test references `sync-agents-skills.sh` or `.githooks`.
**Tasks.**
1. Run the pre-condition diff; record the result in the PR.
2. `git rm` the mirrors, the two scripts and `.githooks/`.
3. Write and run `scripts/maint/rewrite-roster-paths.mjs`; review the diff file by file (expect only path tokens to change).
4. Edit `scripts/verify-citations.sh` `SCAN_DIR`; run it.
5. Write and run `scripts/maint/compare-skill-bodies.mjs` against the import tag.
6. Mark T-07 retired; add the `.DS_Store` ignore line.
7. Smoke-test in a fresh session (criterion 6).
**Test strategy.** Unit: none (mechanical). Integration: criteria 2–5 as a CI step of this PR (`node scripts/maint/compare-skill-bodies.mjs` against a `git worktree add` of the import tag). Manual: criterion 6 on macOS; repeated on Windows (Git Bash present, as Claude Code requires — `01` §4.1) to confirm the skill listing is unaffected by path separators.
**Dependencies.** ARC-01-S02 (engine working tree imported with `.claude/` present) and ARC-01-S09 (`reference/templates/` merged into `templates/`, so the 13 `reference/templates` references in `CLAUDE.md` / `governance-rules.md` / `taxonomy.md` / `prompt-patterns.md` — measured 2026-09-04 — are already `templates/`; ARC-01-S10's ratchet forbids the old path).
**Size.** M — the rewrite is mechanical, but the review of ~100 path edits across 70 files and the two throwaway scripts take a day and a half.
**Risks / open points.** A path token inside a fenced code example that intentionally shows the *old* layout (e.g. the CLAUDE.md repo map) is rewritten too — acceptable, because S08 replaces that block. `scripts/verify-citations.sh` still exits 0 when the corpus is absent (P-37); fixing that is ARC-03's, not this story's.
**Definition of done.** Merged; CI green on the ARC-01 matrix; `docs/CONTRIBUTING.md` gains the sentence "Skills and agents live only under `.claude/`; there is no mirror and no sync step"; `VALIDATION-TESTS.md` T-07 marked retired.

### ARC-02-S02 — Skills lint and agents lint (`tests/skills-lint.test.mjs`), wired into CI
**As** a maintainer **I want** a zero-dependency test that fails on any skill or agent frontmatter that Claude Code would drop, truncate, mis-register or that violates the engine's roster rules **so that** the structural checks of the deleted `verify-structure.sh` survive as CI, and the P-09/P-10 regressions cannot recur.
**Context.** P-09 (`00` §3.3: descriptions up to 1,611 chars, seven skills registered with no description), P-10 (pinned model ID), the `now-assist-specialist` colon-space hazard (`verify-structure.sh` check 6; `CLAUDE.md` registry note), ARC README deliverable 2 and acceptance criterion 2 (S-13), R-17 (built-in command name collision — the lint must catch a future `status`-style collision). `01` §3 lists `tests/` as "roster lint, description-length lint, version-consistency". The ARC-08 doctor's roster check (E-xx "roster from directory listing, 28 skills / 9 agents, description ≤ 500") reuses the same rules; ARC-05's `engine-lint.mjs` re-checks description length and internal paths from the contract side — duplication is deliberate (CI vs doctor vs contract), the rule set lives in one module.
**Scope.** In: `tests/skills-lint.test.mjs` and `tests/agents-lint.test.mjs` (Node ≥ 20 built-in `node:test`, no npm dependency), a shared `tests/lib/frontmatter.mjs` parser for the flat-YAML subset the engine uses, the built-in-command collision list, the CI job, and `docs/CONTRIBUTING.md` text. Out: the rules that need the contract (tool tokens, retired names — ARC-05); rewriting content to pass (S03, S04) — this story lands with the length rule **enabled but allow-listed** for the 27 currently over-long skills, and S03 empties the allow-list.
**Design notes.**
- Parser `tests/lib/frontmatter.mjs`: reads the block between the first two `---` lines; supports `key: value`, quoted scalars (`"…"`, `'…'`), a one-level nested map (`metadata:` with indented `key: value`), and flow/indented lists (`skills:` / `tools:`). Anything else → test failure `unsupported frontmatter syntax in <file>:<line>` (the engine has no reason to use more; keeping the parser small is the point).
- Skill rules (per `.claude/skills/*/SKILL.md`):
  - `name` present, equals the directory name, matches `^[a-z0-9-]+$`.
  - `description` present; length ≤ 500 characters (counted as code points after unquoting); non-empty first sentence.
  - Colon-space hazard: an unquoted `name`/`description` value containing `: ` fails with `unquoted ": " in description of <file> — quote the scalar`. Applies to skills and agents (the old check was agents-only; quoting costs nothing and removes the class of bug).
  - `metadata.version` present and semver (`^\d+\.\d+\.\d+$`); a top-level `version:` key fails with `move version under metadata.version` (minor fold from `02`). Allowed top-level keys: `name`, `description`, `allowed-tools`, `argument-hint`, `disable-model-invocation`, `user-invocable`, `license`, `compatibility`, `metadata`; any other key fails. **Unverified list:** `00` §9 does not enumerate the frontmatter keys — the implementer copies the list from the current `docs:skills` frontmatter table when writing the lint and records the docs version in a comment; today's 28 skills use only `name`, `description`, `version` (measured 2026-09-04), so the rule is safe to enable immediately.
  - `EXAMPLES.md` present next to every roster skill (`engine.config.json.roster.utility` entries — the `snowarch` skill from S11 — are exempt).
  - Roster count: `(directories under .claude/skills) − (utility skills)` equals `engine.config.json.roster.skills` (28).
  - Built-in collision (R-17): `name` must not appear in `tests/fixtures/claude-builtin-commands.json` (seeded from the actual `/help` output of Claude Code at the floor version 2.1.214 — `status` is the one collision proven so far, R-17; the other names an implementer should expect — `help`, `doctor`, `mcp`, `config`, `init`, `clear`, `compact`, `login`, `logout`, `memory`, `model`, `permissions`, `review`, `cost`, `bug`, `plugin`, `resume`, `agents`, `hooks`, `add-dir` — are illustrative and are taken from the CLI, never typed from memory); the file carries a `"source"` field naming the CLI version it was taken from. `doctor` and `mcp` are built-ins, which is why the sub-commands live under `/snowarch` and are not skills of their own.
  - Vocabulary guard (interim until ARC-05's lint owns tool tokens): no `Tier [0-9]`, `mcp__nowaikit__`, `mcp__servicenow-mcp__`, `nowaikit` anywhere under `.claude/` — enabled in S06 when the sweep lands (rule present from this story, switched on by a constant).
  - Internal path references: every `` `.claude/skills/…` ``, `` `.claude/agents/…` ``, `` `governance/…` ``, `` `templates/…` ``, `` `docs/…` `` token in a skill, agent or governing document resolves to a file or directory.
- Agent rules (per `.claude/agents/*.md`): `name` equals the file stem; `description` present and quoted-if-hazardous; `tools` present, an explicit list, and containing no `mcp__` entry and no `Agent`/`Task` entry (principle 8, DR-13); `model` present and equal to `inherit` (rule switched on in S04); `skills` present, a list, every entry an existing roster skill directory (rule switched on in S04); combined description budget: `sum(len(description))/4 ≤ 12,000` (a conservative characters-per-token estimate against the 15,000-token warning in `docs:sub-agents`; today 5,302 chars).
- Wiring: root `package.json` `test` script (ARC-01-S05) runs `node --test tests/`; the new files are picked up. CI (ARC-01-S11 matrix, 3 OS × Node 20/22/24) runs it on every push. `claude plugin validate .claude/skills` and `claude plugin validate .claude/agents` already run in ARC-01-S11's `plugin-validate` job with `continue-on-error: true` (advisory until S-19); this story converts that job to run **only when** `claude` is on the runner's PATH and ARC-00 S-19 recorded CONFIRMED (then `continue-on-error: false`); otherwise the job is `skipped` with the message `claude CLI not available on this runner (S-19)` and the two commands are listed in `docs/CONTRIBUTING.md` as a pre-push step.
- Output format: one failing assertion per rule per file, message `<rule-id> <file>: <detail>`, rule ids `SK-01…SK-10`, `AG-01…AG-06`, so the ARC-08 doctor can quote the same ids.
**Acceptance criteria.**
1. `node --test tests/` on the S01 tree passes with the length allow-list populated (27 names) and fails when the allow-list is emptied, naming every over-long skill with its measured length (e.g. `SK-02 .claude/skills/estimation-specialist/SKILL.md: description 1588 chars > 500`).
2. Adding an unquoted `description: Foo: bar` to any agent fails with the colon-space message; quoting it passes.
3. Creating `.claude/skills/status/SKILL.md` (fixture in a temp copy) fails with `SK-08 name "status" collides with a Claude Code built-in command`.
4. Adding `version: 1.0.0` at the top level of a skill fails; `metadata:\n  version: 1.0.0` passes.
5. An agent with `tools:` containing `mcp__servicenow__snow_core_records_query` fails `AG-03`; an agent without `tools:` fails `AG-03` (inherits everything, `docs:sub-agents`).
6. A dangling path token (`` `.claude/skills/does-not-exist/SKILL.md` ``) in any skill body fails `SK-10` with the file and token.
7. The CI matrix runs the test on ubuntu, macOS and Windows for Node 20/22/24; the plugin-validate job is present and either passes or is skipped with the S-19 message — never red because the CLI is absent.
8. The rule list with ids is documented in `docs/CONTRIBUTING.md`.
**Tasks.**
1. Write `tests/lib/frontmatter.mjs` with unit tests (`tests/lib/frontmatter.test.mjs`: quoted scalars, nested `metadata`, lists, error on unsupported syntax).
2. Write `tests/skills-lint.test.mjs` with rules SK-01…SK-10 and the allow-list constant `LENGTH_ALLOWLIST` (27 names, comment "emptied by ARC-02-S03").
3. Write `tests/agents-lint.test.mjs` with rules AG-01…AG-06; `model`/`skills` rules behind `const ENFORCE_S04 = false` (flipped in S04).
4. Seed `tests/fixtures/claude-builtin-commands.json`.
5. Wire the CI jobs; write the CONTRIBUTING section.
**Test strategy.** Unit: the parser tests. Integration: the lint itself, run on the real tree and on fixture copies for the negative cases (criteria 2–6 implemented as tests over temp directories). CI: three OSes (path separators, CRLF on Windows — the parser must accept `\r\n`).
**Dependencies.** S01 (single tree). ARC-01-S11 (CI matrix, advisory `plugin-validate` job) and ARC-01-S05 (root `package.json` `test` script / runner). ARC-00 S-19 verdict for the plugin-validate job's conditional.
**Size.** M — parser + two rule files + fixtures ≈ 1.5 days.
**Risks / open points.** The chars/4 token estimate is a heuristic; the real warning threshold is only visible in `claude --debug` — S03 measures it. `claude plugin validate` may not run headless (S-19) — the job design already tolerates that.
**Definition of done.** Merged; green on the full matrix; `docs/CONTRIBUTING.md` updated; ARC-08 informed that rule ids SK-xx/AG-xx exist (its E-xx roster check quotes them).

### ARC-02-S03 — Rewrite every skill description to ≤ 500 chars; triggers into bodies; `version:` → `metadata.version`; S-13 verification

> **Amendment 2026-09-08 (from ARC-03-S04b).** **This story must standardise every citation in the roster to a full `markdown/<area>/…` path.** Measured on 2026-09-08 by `tools/snowarch/lib/docs/citations.mjs`: **88 citation-shaped tokens in 13 skill files carry no `markdown/` prefix** — 22 in the `*(citation: `x.md`)*` form and 66 as bare table cells in a "Citation" column. The citation gate cannot resolve them, so `docs verify` reported `dead: 0` on a skill that still pointed a reader at two files existing **nowhere** in the corpus. `verify` now WARNS on each with file and line (never fails — the fix is prose, and a blocking warning would block this very story). ARC-03-S04b repaired the licensing skill's ten as the worked example, including two that named real pages and merely lacked their path. The remaining 88 are this story's. Worst first: `atf-author` 15, `security-grc-specialist` 12, then `spm`, `reporting-analytics`, `performance-scale`, `operational-documentation`, `devops-release-manager` 7 each.
**As** the engine (Claude) **I want** every one of the 28 skills to appear in the session's skill listing with a complete, trigger-bearing description **so that** description-driven routing works for all specialists, not for 19 of 28.
**Context.** P-09 and `00` §3.3: descriptions total 27,672 chars; the listing truncates at 1,536 (`docs:skills`); seven skills registered with no description at all (`operational-documentation`, `performance-scale-specialist`, `reporting-analytics-specialist`, `security-grc-specialist`, `spm-specialist`, `technical-designer`, `ui-ux-specialist`); the dropping mechanism is unverified → S-13. R-06 (auto-routing regression) and the README risk "keep the first sentence as the trigger sentence, list trigger keywords in the body's first section". Measured today: **27 of 28** descriptions exceed 500 chars (only `developer` at 493 passes); 18 exceed 1,000 — the README's "18 over-long" is the >1,000 count; this story rewrites all 27. Minor fold from `02`: `version:` moves under `metadata.version`; `operational-documentation` has no version at all (`00` §3.2).
**Scope.** In: the 27 description rewrites; a new first body section `## Triggers` in every SKILL.md carrying the moved trigger keywords, the gateway/consult firing statement and the "distinct from" boundary sentences; frontmatter key migration for all 28; emptying the S02 allow-list; the S-13 verification and its evidence file. Out: any change to skill bodies beyond the new section and the path tokens S01 already rewrote (S01's body-comparison script proves it); vocabulary changes (S06); the ITOM retired name (S12).
**Design notes.**
- Description recipe (applied uniformly; reviewed skill by skill):
  1. Sentence 1 — the trigger sentence, starting with "Use when …" for builders/reviewers/consults or "Mandatory gateway for …" for the five Domain Expert gateways, naming the domain nouns a user would type (tables, products, artefact names).
  2. Sentence 2 — what it produces (artefact name) and, for gateways, "Produces the 5-Part Constraint Envelope; fires at Phase 1 Step 5 and Phase 2 Step 4".
  3. Optional sentence 3 — the one boundary that prevents mis-routing (e.g. `now-assist-genai`: "Reference knowledge only — the builder is now-assist-specialist"; `cmdb-csdm-specialist`: "Owns the model; ITOM/Discovery owns CI population").
  Hard limits: ≤ 500 characters; no ServiceNowDocs paths; no "§1.1" mechanics (they belong in the body); no lists of 15 keywords — those go to `## Triggers`. Quote the scalar whenever it contains `: `.
- Body section, inserted directly after the H1 of every SKILL.md:
  ```markdown
  ## Triggers
  **Keywords:** <the moved list, comma-separated>
  **Fires:** <routing-time consult | post-build consult | Phase 1 Step 5 + Phase 2 Step 4 gateway | on demand>
  **Not this skill:** <boundary sentences moved from the description>
  ```
  Existing `## When to use` sections, where present, are merged into it (no duplicate headings).
- Frontmatter migration for all 28: delete `version: x.y.z`, add `metadata:\n  version: x.y.z` preserving the current value; `operational-documentation` receives `1.0.0`. `allowed-tools` and other keys untouched.
- S-13 verification (owner of the evidence: this story): in a fresh checkout, run `claude --debug` at the repo root, capture the skill listing, confirm 28 (29 with S11's `snowarch`) names each with a non-empty description, save the redacted excerpt as `docs/spikes/S-13-skill-listing.md` (or wherever ARC-00 keeps spike evidence — its `spikes/` folder) with the verdict line `S-13: CONFIRMED` or `FAILED → fallback <text>`. If FAILED: shorten to ≤ 300 chars for the still-missing skills and re-test; if still failing, escalate per `03` S-13 fallback (persona routing moved into `CLAUDE.md`).
- Routing smoke before the full S13 run: execute T-01 (Developer via ITSM gateway), T-02 (CSM gateway halt), T-14 (CMDB & CSDM gateway) and one consult test (T-17 licensing) from `VALIDATION-TESTS.md` in a fresh session; the gateway/consult must be selected without the user naming it.
**Acceptance criteria.**
1. `node --test tests/` passes with `LENGTH_ALLOWLIST = []`; `for f in .claude/skills/*/SKILL.md; do …; done` shows every description ≤ 500 chars and the total ≤ 14,000 chars.
2. Every SKILL.md has `## Triggers` as its first H2 and no top-level `version:`; `grep -L "metadata:" .claude/skills/*/SKILL.md` prints nothing.
3. `node scripts/maint/compare-skill-bodies.mjs` (S01) run with the `## Triggers` section and frontmatter excluded reports `bodies identical: 56/56` — nothing else in the bodies changed.
4. In a fresh `claude` session, the skill listing shows all 28 skills with a description (ARC README acceptance criterion 2, first half); the evidence file exists with a verdict line.
5. T-01, T-02, T-14 and T-17 pass in a fresh session with the rewritten descriptions (gateway/consult auto-selected).
6. `claude plugin validate .claude/skills` passes locally (and in CI when S-19 allows).
**Tasks.**
1. Draft the 27 descriptions in a single review table (`scripts/maint/descriptions-review.md`: skill · old length · new text · new length) for owner review before touching files.
2. Apply descriptions and `## Triggers` sections; migrate `version` → `metadata.version` for all 28.
3. Empty the S02 allow-list; run the lint.
4. Run the body-comparison script.
5. S-13 verification with `claude --debug`; write the evidence file.
6. Routing smoke (T-01, T-02, T-14, T-17).
7. Delete `scripts/maint/descriptions-review.md` after merge (the PR keeps it).
**Test strategy.** Unit/integration: the S02 lint. Manual: S-13 listing check and the four routing tests on macOS; the listing check repeated once on Windows (the listing is produced by the same CLI — one run suffices). Full suite: S13.
**Dependencies.** S02. ARC-00 S-13 is *closed by* this story's evidence (the spike's check is "after ARC-02, inspect the listing").
**Size.** L — 27 careful rewrites with owner review plus the verification ≈ 4 days.
**Risks / open points.** R-06: a shortened description can weaken auto-routing for a consult with many synonyms (licensing, estimation); mitigation is the `## Triggers` section and the S13 full run. If the per-listing budget (unknown mechanism) is a *total* budget rather than per-description, 28 × 500 = 14,000 chars may still overflow — the evidence file records the outcome and the fallback is a second pass at ≤ 300.
**Definition of done.** Merged; lint green with empty allow-list; evidence file committed; `docs/CONTRIBUTING.md` "Writing a skill description" section added (the recipe above).


> **Amendment 2026-09-08 (ruling on the S03 delivery).** **`## When to use` sections are NOT merged into
> `## Triggers`.** The two headings answer different questions and both are load-bearing: `## Triggers`
> says *what fires this skill and what it is not*; `## When to use` gives *adoption guidance* to a
> reader who has already arrived. Merging them would also rewrite body prose, which criterion 3 exists
> to forbid. `## Triggers` is inserted immediately **before** the original first H2 — not directly
> after the H1, which leaves the skill's own preamble sitting inside the Triggers section (a change of
> section membership that a whole-body diff cannot see; use a section-wise compare). It is still the
> first H2, so SK-11 holds. Two further rulings folded in here: `scripts/maint/descriptions.mjs` does
> **not** survive the ARC — SKILL.md frontmatter is the single source of truth for descriptions and a
> second copy would drift, so it is deleted with the rest of `scripts/maint/` per S01, with git history
> keeping it; and the rootless-citation class (`<area>/…` with no `markdown/` root) is closed **in this
> story** as SK-12, not deferred to ARC-05.

### ARC-02-S04 — Agent frontmatter: `model: inherit`, `skills:` preload, `tools:` unchanged; §6.2 regression run
**As** a maintainer **I want** the nine sub-agents to inherit the session's model and preload their persona skill through the documented `skills:` field **so that** no agent carries a hidden model dependency, no agent reads its persona by file path, and builders still cannot reach MCP tools.
**Context.** P-10 (`00` §3.4: all nine pin `model: claude-opus-4-8`; they read `skills/<x>/SKILL.md` by path instead of the `skills:` preload; `docs:sub-agents` offers `inherit` and `skills:`). DR-13 (`01` §18): explicit `tools:` retained, `model: inherit`, `skills:` preload. ARC README acceptance criterion 7 ("every agent runs with `model: inherit` and loads its persona through `skills:`; a dispatched Developer sub-agent produces the same artefact structure as before"). The colon-space hazard rule (README story 4) is implemented in S02 (`AG-02`) and switched on here together with `AG-04`/`AG-05`.
**Scope.** In: frontmatter of the nine files; the two body lines per agent that load the skill by path; the baseline capture and regression run of T-01. Out: agent descriptions' content (already ≤ 1,073 chars; left as-is except quoting); `tools:` lists (unchanged: `Read, Write, Edit, Glob, Grep, WebFetch`).
**Design notes.**
- Target frontmatter (example `.claude/agents/developer.md`):
  ```yaml
  ---
  name: developer
  description: "Implement ServiceNow code (Script Includes, Business Rules, Client Scripts, UI Scripts, Scheduled Jobs, Background Scripts, Fix Scripts, custom Flow Action scripts) per a supplied spec. Dispatched by the Chief Architect after the spec is approved. Returns code artefact(s) and a §6.2 post-build proposal manifest."
  tools: Read, Write, Edit, Glob, Grep, WebFetch
  model: inherit
  skills:
    - developer
  ---
  ```
  Mapping agent → preloaded skill: `atf-author`→`atf-author`, `developer`→`developer`, `diagramming-specialist`→`diagramming-specialist`, `flow-designer-specialist`→`flow-designer-specialist`, `hld-lld-writer`→`hld-lld-writer`, `integration-specialist`→`integration-specialist`, `now-assist-specialist`→`now-assist-specialist` (plus `now-assist-genai` as a second entry — the reference companion the builder is documented to ground on), `story-writer`→`story-writer`, `technical-designer`→`technical-designer`.
- Body edit (each agent): the `## Skill` paragraph "Load and apply: `.claude/skills/<x>/SKILL.md` …" becomes "Your persona skill `<x>` is preloaded into this context through the `skills:` frontmatter — apply it as authoritative for conventions, patterns, anti-patterns and output rules; do not re-read `SKILL.md`. Read `.claude/skills/<x>/EXAMPLES.md` for the gold-standard reference before producing the artefact." The numbered "Read the SKILL at …" step in the execution list becomes "Apply the preloaded SKILL". Wording "dispatched via the Task tool" inside agent bodies → "dispatched by the Chief Architect" (harness-neutral; `00` §10).
- Switch on `ENFORCE_S04` in `tests/agents-lint.test.mjs` (AG-04 `model == inherit`, AG-05 `skills` non-empty and resolvable).
- Regression baseline: **before** editing, run T-01 from `VALIDATION-TESTS.md` in a fresh session at the S03 tree and save the returned Developer artefact's *structure* — the ordered H2/H3 headings and the presence of a fenced JS block and the `§6.2 post-build proposal manifest` — to `tests/fixtures/regression/T-01-structure.baseline.txt` (no engagement content; the test prompt is the generic SLA-breach Script Include). After editing, repeat and diff the structure (headings and block kinds only; not the prose).
**Acceptance criteria.**
1. `grep -c "^model: inherit" .claude/agents/*.md` = 9 and `grep -L "^skills:" .claude/agents/*.md` prints nothing; `grep -n "^tools:" .claude/agents/*.md` shows nine identical explicit lists with no `mcp__` entry.
2. `node --test tests/` passes with `ENFORCE_S04 = true`; setting one agent to `model: claude-opus-4-8` fails `AG-04`.
3. `claude plugin validate .claude/agents` passes.
4. A dispatched `developer` sub-agent (T-01 prompt) returns an artefact whose structure equals `tests/fixtures/regression/T-01-structure.baseline.txt` (ARC README acceptance criterion 7); the transcript shows no `Read` of `SKILL.md` by the sub-agent (it was preloaded) and a `Read` of `EXAMPLES.md`.
5. `grep -rn "Task tool" .claude/agents` = 0.
6. (Deferred check, not gating this story.) In a live checkout, a dispatched sub-agent's tool list in the transcript contains no `mcp__servicenow__` tool (principle 8). This story guarantees it structurally through criterion 1 (explicit `tools:` lists, `docs:sub-agents` — `00` §9); the behavioural run is executed once in ARC-08-S11's live CI job and recorded there.
**Tasks.**
1. Capture the T-01 structure baseline on the S03 tree.
2. Edit the nine frontmatter blocks and the body lines.
3. Flip `ENFORCE_S04`; run the lint and `claude plugin validate`.
4. Re-run T-01; diff the structure; commit the baseline and the post-change capture in the PR (not in the tree).
**Test strategy.** Unit: lint. Manual: T-01 before/after on macOS. The `skills:` preload behaviour itself is documented (`docs:sub-agents` "Preload skills into subagents", `00` §9) — the transcript check in criterion 4 is the evidence that it happened.
**Dependencies.** S02 (rules exist), S03 (skill frontmatter final, so the preload resolves to lint-clean skills).
**Size.** M — nine small edits plus two supervised regression runs ≈ 1–1.5 days.
**Risks / open points.** If `skills:` preload does not include content the agent relied on reading by path (it preloads `SKILL.md`, not `EXAMPLES.md`), the explicit `EXAMPLES.md` read keeps behaviour equal. If `inherit` makes a smaller session model produce a structurally different artefact, the baseline diff catches it and the fallback is `model: opus` (alias, still not a pinned ID) — decision recorded in the PR.
**Definition of done.** Merged; lint green; `docs/ARCHITECTURE.md` "Sub-agents" paragraph states the three invariants (explicit tools, inherit, skills preload).

> **Amendment 2026-09-08 (ruling on the S04 delivery). Criterion 4's structure comparison is the
> SEVEN-ELEMENT CONTRACT SET, not heading equality.** Literal heading equality does not discriminate:
> two captures of the same unchanged tree (6e77019) returned 7 and 5 H2 sections respectively — two
> whole sections appearing and vanishing with no input change, because heading wording is model output.
> What does not vary is the agent body's own Output contract, and that is what a regression check must
> compare: a fenced JavaScript block; a suggested file path; the artefact type; a spec compliance
> statement; decisions made; a `§6.2 … manifest` heading; and the manifest's verbatim proposal line.
> Measured across four captures (2 before, 2 after the S04 change) all seven were present in all four
> while the H2 count ran 7 / 5 / 5 / 5. The harness still prints the H2 listing — as information for
> the reader, never as an assertion.

### ARC-02-S05 — Remove context-mode, the claude.ai surface, the settings example, the 9-step README manual; disposition of legacy docs
**As** an individual practitioner **I want** the repository to contain nothing that describes a surface I cannot install or a tool I do not have **so that** the only install narrative is the one that works (ARC-06's page) and no personal tooling breaks my session.
**Context.** D-03 items 8 and 9 (claude.ai "Tier 1" surface; context-mode); P-02 (three contradictory install narratives, `README.md:161-262,325-379`), P-07 (`claude-ai-projects/` never shipped; skills carry keys claude.ai rejects), P-14 (`.claude/settings.example.json` with context-mode hooks; `README.md:227-253` §3e), P-13 (engagement journals as product docs — the field notes are handled in S10, `LIVE-ARTEFACTS-CATALOGUE.md` is purged by ARC-01-S10). ARC README deliverable 7 and acceptance criterion 5 (`grep -rn "context-mode\|ctx_\|claude_desktop_config\|claude-ai-projects"` returns nothing outside `docs/ARCHITECTURE.md` history notes). `01` §3 fixes the target `docs/` set: `INSTALL.md`, `MODES-AND-PRESETS.md`, `TROUBLESHOOTING.md`, `PLATFORM-NOTES.md`, `ARCHITECTURE.md`, `CONTRIBUTING.md`, `CHANGELOG.md` — every other legacy document needs an explicit disposition.
**Scope.** In: deletions and folds listed in the disposition table; the interim root `README.md`; `.gitignore` cleanup of obsolete entries; the `docs/ARCHITECTURE.md` "History" note that is the single permitted place for the retired names. Out: writing `docs/INSTALL.md` (ARC-06-S13); `docs/TROUBLESHOOTING.md` and `CHANGELOG.md` generation (ARC-05, ARC-09); the field notes (S10); `scripts/legacy/` (ARC-01 imported `SETUP.md`, `setup.sh`, `doctor.sh` there as reference; ARC-08-S07 needs them for the D00–D37 mapping; ARC-10 deletes them — this story does not touch them and the ARC's grep criterion excludes that directory).
**Design notes.** Disposition table (every row is a task):

| File today | Disposition |
|---|---|
| `README.md` (629 lines, 9 steps, Tier 1/2, NowAIKit, context-mode §3e) | Replaced by an interim page (≤ 40 lines): product name, one paragraph from `docs/BUSINESS-OVERVIEW.md`, "Install: see `docs/INSTALL.md`" (the link resolves once ARC-06-S13 lands; until then the line reads "Installation page arrives with ARC-06"), the two-mode sentence (design-only / live), licence and ServiceNowDocs attribution line (D-02). ARC-06-S13 makes `docs/INSTALL.md` the README body. |
| `SETUP.md` (root) | Deleted (reference copy lives under `scripts/legacy/` from ARC-01-S02). |
| `docs/ADVANCED-WEB-SETUP.md` | Deleted (D-03 item 8). |
| `docs/INSTALLATION-GUIDE.md` | Deleted (superseded by `docs/INSTALL.md`). |
| `docs/MCP-OPERATIONS-GUIDE.md` | Deleted. Its §2.1/§2.2 playbook is superseded by `governance/mcp-protocols.md` (ARC-05) and `docs/TROUBLESHOOTING.md`; its Tier table by `docs/MODES-AND-PRESETS.md` (S09). Any platform fact it holds that is not in the field notes is moved to `docs/PLATFORM-NOTES.md` by S10 (S10 reads it before this deletion — sequence the two PRs, or keep the file until S10 merges). |
| `docs/TECHNICAL-ARCHITECTURE.md` | Folded into `docs/ARCHITECTURE.md` (ARC-01 stub) as the "Engine" section: audience split, routing-protocol overview, the two firing points of the gateways, the §6.2 hook; the roster table is replaced by the generated block (S07). Then deleted. Wrong claims are not carried (8 agents / 25 skills / CMDB as consult — `00` §3.8). |
| `docs/BUSINESS-OVERVIEW.md` | One paragraph folded into the README; deleted. |
| `docs/USER-GUIDE-AND-EXAMPLES.md` | Retained as `docs/USER-GUIDE.md` after the S06 vocabulary sweep — **open point**: not in the `01` §3 layout; proposed addition to the `docs/` line (see Risks). |
| `docs/README.md` (index) | Deleted; `docs/ARCHITECTURE.md` carries the document map. |
| `docs/IMPORT-NOTES.md` | Moved into `docs/ARCHITECTURE.md` "History" section (this is where `nowaikit`, `claude-servicenow-live`, `context-mode`, `claude-ai-projects` may still be *named* as history); deleted. |
| `docs/CHANGELOG.md` | Kept; heading `## Before 2.0.0 (engine v2.x line)` added above the existing content; ARC-09's generator prepends releases. |
| `client-onboarding.md` | Steps 1–2 (satellite instruction/state templates from `claude-ai-projects/`), 5–8 (claude.ai satellite project, uploads, satellite smoke tests) and §9b (`claude_desktop_config.json` credentials) removed; the remaining ritual (context gathering, `clients/<name>/` folder structure §9a, client-specific sub-agents, maintenance ritual) rewritten to Mode vocabulary and moved to `docs/CLIENT-ONBOARDING.md`; §9b is replaced by one sentence: "Live instance for the engagement: `/snowarch setup-instance` or `./snowarch instance add <label> …` (ARC-07)". |
| `.claude/settings.example.json` | Deleted (P-14). The untracked `.claude/settings.json` with context-mode hooks is not imported (gitignored today; ARC-06-S01 commits the new committed settings file). |
| `.gitignore` entries `claude-ai-projects/`, `nowaikit-example.ts`, `start-mcp.sh`, `reports/` (reports are a D-03 cut) | Removed; `.claude/settings.json` is *un*-ignored only when ARC-06-S01 commits the new file (ARC-01-S07 owns `.gitignore`; this story edits the four lines and says so in the PR). |
| `CLAUDE.md` lines naming context-mode, `claude-ai-projects/`, Tier 1 re-upload (`CLAUDE.md:33,433`) | Removed here as a minimal edit; the full rewrite is S08. |
| `VALIDATION-TESTS.md` "Tiers:" lines, "Claude.ai ✅" columns, `(pending Tier 1 upload)` | Left for S13 (single edit pass over that file); listed here for completeness. |

- The permitted history note in `docs/ARCHITECTURE.md` is one section `## History` (≤ 40 lines): the two source repositories, their import tags (`import/engine-v2.8.0-worktree`, `import/snow-mcp-1.0.0`), what was cut (D-03 list by name), and the retired names with their replacements (`00` §10 glossary). ARC-01-S12 creates the section (it is ARC-01-S10's "always-exempt" file for the legacy-name ratchet); this story extends it with the `IMPORT-NOTES.md` content; ARC-10-S05 finalises it (ADR links, old-repository links). Every line in it that names a retired name ends with the HTML comment `<!-- retired-name: historical -->`, the marker ARC-05's lint grep excludes (`grep -v 'retired-name: historical'`).
**Acceptance criteria.**
1. `grep -rn "context-mode\|ctx_\|claude_desktop_config\|claude-ai-projects" --include=*.md --include=*.json --include=*.sh . --exclude-dir=vendor --exclude-dir=node_modules --exclude-dir=scripts/legacy --exclude-dir=.git` returns only lines inside the `## History` section of `docs/ARCHITECTURE.md` (ARC README acceptance criterion 5, with the `scripts/legacy/` exclusion recorded in the README).
2. `test ! -e SETUP.md -a ! -e docs/ADVANCED-WEB-SETUP.md -a ! -e docs/INSTALLATION-GUIDE.md -a ! -e docs/MCP-OPERATIONS-GUIDE.md -a ! -e docs/TECHNICAL-ARCHITECTURE.md -a ! -e docs/BUSINESS-OVERVIEW.md -a ! -e docs/README.md -a ! -e docs/IMPORT-NOTES.md -a ! -e client-onboarding.md -a ! -e .claude/settings.example.json` succeeds; `docs/CLIENT-ONBOARDING.md` and `docs/USER-GUIDE.md` exist.
3. `wc -l README.md` ≤ 40; the file contains no numbered install step, no `claude mcp add`, no `npm link`, no `NowAIKit`, no `Tier`; it contains the strings `Apache-2.0`, `ServiceNowDocs`, `design-only` and `live` (D-02 attribution line and the two-mode sentence).
4. `docs/CLIENT-ONBOARDING.md` contains no `claude.ai`, `satellite`, `Tier`, `claude_desktop_config` token; its folder-structure step still creates `clients/<name>/{decisions,transcripts,artefacts}` exactly as §9a did.
5. `docs/ARCHITECTURE.md` has `## Engine` and `## History` sections; the History section names both import tags.
6. `git ls-files | grep -c "\.example\.json"` = 0.
**Tasks.**
1. Read `docs/MCP-OPERATIONS-GUIDE.md` and `docs/TECHNICAL-ARCHITECTURE.md`; extract the fold-in content into `docs/ARCHITECTURE.md` and a handover note for S10.
2. Write the interim `README.md`.
3. Rewrite `client-onboarding.md` → `docs/CLIENT-ONBOARDING.md`; rename `docs/USER-GUIDE-AND-EXAMPLES.md` → `docs/USER-GUIDE.md` (content sweep in S06).
4. Delete the listed files; edit `.gitignore`; minimal `CLAUDE.md` line removals.
5. Run the grep criterion; fix stragglers (expect `docs/CHANGELOG.md` mentions — rewrite them as history wording or leave them under the "Before 2.0.0" heading, which is history by definition; the criterion allows only `docs/ARCHITECTURE.md`, so CHANGELOG lines mentioning context-mode are rewritten to "personal hook tooling (removed)").
**Test strategy.** Integration: criterion 1 as a CI grep step (`tests/no-legacy-surfaces.test.mjs`, kept permanently). Manual: read-through of the interim README and CLIENT-ONBOARDING.
**Dependencies.** S01. ARC-01-S10 (residue purge — `LIVE-ARTEFACTS-CATALOGUE.md`, `scratchpad/`, `.backups/` already gone; the legacy-name ratchet with ARC-02-owned allow-list rows for `CLAUDE.md`, `README.md`, `client-onboarding.md`, `VALIDATION-TESTS.md` and the legacy docs — this story removes the rows for every file it deletes or rewrites) and ARC-01-S12 (`docs/ARCHITECTURE.md` stub with its History section exists).
**Size.** M — mostly deletion, but two rewrites (README interim, CLIENT-ONBOARDING) and the ARCHITECTURE folds ≈ 2 days.
**Risks / open points.** (a) `docs/USER-GUIDE.md` and `docs/CLIENT-ONBOARDING.md` are not in the `01` §3 layout; proposed as additions to the `docs/` line — the verifier should confirm or fold the user guide into `docs/INSTALL.md` "First session" (ARC-06). (b) The grep criterion needs `scripts/legacy/` excluded until ARC-10 deletes it (README corrected in this drafting). (c) Deleting `MCP-OPERATIONS-GUIDE.md` before S10 harvests it loses platform facts — sequencing rule above.
**Definition of done.** Merged; `tests/no-legacy-surfaces.test.mjs` green on the matrix; `docs/ARCHITECTURE.md` Engine + History sections present; README interim page in place.

### ARC-02-S06 — Move governance texts to `governance/`; Mode/Preset vocabulary sweep across CLAUDE.md, governance, docs, skills, tests
**As** the engine (Claude) **I want** one vocabulary — Mode `design-only` | `live`, Preset `read-only` | `pdi-developer` | `full` | `custom` — and the governance documents at one stable path **so that** "Tier 2" never again means "Claude Code" in one file and "CMDB write" in another.
**Context.** P-06 (`00` §3.6: four incompatible "Tier" vocabularies), principle 4 and DR-2 (`01` §2, §18), `00` §10 glossary (replacement terms), ARC README deliverable 3 and acceptance criterion 3 (`grep -rn "Tier [0-9]" CLAUDE.md governance docs .claude` = 0). `01` §3 places `governance-rules.md`, `taxonomy.md`, `prompt-patterns.md` under `governance/` next to the generated `mcp-protocols.md` (ARC-05). Today (measured 2026-09-04): 59 "Tier N" hits across `CLAUDE.md`, `taxonomy.md`, `VALIDATION-TESTS.md`, `client-onboarding.md`, `README.md`, five docs (`CHANGELOG`, `ADVANCED-WEB-SETUP`, `INSTALLATION-GUIDE`, `MCP-OPERATIONS-GUIDE`, `TECHNICAL-ARCHITECTURE` — four of which S05 deletes), and `.claude/skills/itom-discovery-specialist/EXAMPLES.md`; `governance-rules.md:63` says "all 25 specialists at all tiers"; `taxonomy.md:5` says it is read by a "Tier 1 master"; `taxonomy.md:37` "Builders — Tier 2 sub-agent execution".
**Scope.** In: `git mv` of the three governance files; reference updates (measured 2026-09-04: 25 `governance-rules.md` mentions in 17 skill files — 55 across CLAUDE.md, taxonomy, prompt-patterns, agents, skills and VALIDATION-TESTS; 1 `prompt-patterns.md` mention in skills; 11 `taxonomy.md` mentions across CLAUDE.md/governance/skills/agents/tests); the vocabulary sweep with the replacement table below over `CLAUDE.md`, `governance/`, `docs/`, `.claude/`, `tests/` (VALIDATION-TESTS gets its full pass in S13, but the mechanical replacements land here); the interim rewrite of `governance-rules.md` §2.1/§2.2 to current tool names and to the Mode vocabulary; switching on the S02 vocabulary guard. Out: the generated rule file and `governance/mcp-protocols.md` (ARC-05-S05 — until then §2.1/§2.2 stay in `governance-rules.md` with the interim wording); the CLAUDE.md structural rewrite (S08); tool-name changes outside §2.1/§2.2 (S12 with the contract lint).
**Design notes.**
- Move: `git mv governance-rules.md taxonomy.md prompt-patterns.md governance/`; update references with the S01 rewrite script extended by `governance-rules.md|taxonomy.md|prompt-patterns.md` → `governance/<same>` (word-boundary, backtick-aware; skip paths already under `governance/`).
- Replacement table (applied by hand, not blindly — every hit is read; the script only lists them):

| Today | Replacement |
|---|---|
| "Tier 0" / "design-only, no MCP" | "Mode `design-only`" |
| "Tier 1" (claude.ai Projects) | removed with the surface (S05); in `taxonomy.md:5` the "Read by" line becomes "Read by: `CLAUDE.md` (the Chief Architect) and every SKILL.md at routing time" |
| "Tier 2" (Claude Code + MCP) / "Tier 2 sub-agent execution" / "Tier 2 confidentiality" | "Mode `live`" where the meaning is "has an instance"; otherwise just delete the qualifier ("sub-agent execution", "folder-discipline confidentiality") |
| "Tier 1/2/3/AI" (server flag families), "Tier 1 (Read-Write)", "read-only tier" | "Preset `read-only` / `pdi-developer` / `full` / `custom`" or the named flag (`WRITE`, `CMDB_WRITE`, `SCRIPTING`, `ATF`, `NOW_ASSIST`, `FLUENT`) |
| "all 25 specialists at all tiers" (`governance-rules.md:63`) | "every specialist persona in the roster (counts are held in `engine.config.json`), in both modes" |
| "NowAIKit", "nowaikit", "servicenow-mcp" (as a server key) | "the ServiceNow MCP server (`servicenow`)" — bare names only in `docs/ARCHITECTURE.md` History |
| "Task tool" (`CLAUDE.md:90,160`) | "dispatch the sub-agent" (harness-neutral, `00` §10) |
| "Tier upgrade … Tier 0 to Tier 1" (`CLAUDE.md:308`, §2.1 non-approvals) | "Switching Mode (design-only → live) or raising a Preset is a configuration change, not a write approval" |

- Interim §2.1/§2.2 in `governance/governance-rules.md` (until ARC-05-S05 — the generated rule file — and ARC-05-S06 — `governance/mcp-protocols.md` — replace both sections by a pointer to the generated files): §2.1 gate text keyed on "any tool of the `servicenow` server whose contract entry says `mutates: true`" (no prefix literal — ARC-05's rule file is the one place that names `mcp__servicenow__`); §2.2 rewritten with the tool names that exist in today's manifest (`00` §8): ensure/create the named update set with `snow_us_active_update_set_ensure` / `snow_us_update_set_add`, resolve the user with `snow_core_records_query(sys_user …)`, read/write `sys_user_preference` name=`sys_update_set` with `snow_core_records_query` / `snow_core_record_modify` / `snow_core_record_add`, perform the write, verify with `snow_core_records_query(sys_update_xml …)`; plus the sentence "ARC-04 introduces `snow_us_capture_target_set`, after which this section is generated from the contract". "What does NOT work" bullets are rewritten with current names (`snow_us_update_set_switch` only sets `is_default`; direct POST to `sys_update_xml` → `INSUFFICIENT_PRIVILEGES`; `snow_deploy_background_script_exec` / `snow_fluent_script_exec` unavailable on PDI). Mode semantics sentence added at the top of §2: "In Mode `design-only` there is no live instance; §2.1/§2.2 are dormant and every verdict is documentation-grounded."
- `CLAUDE.md` gets only the mechanical replacements here (paths, vocabulary, "Task tool"); structure is S08's.
- `docs/USER-GUIDE.md`, `docs/CLIENT-ONBOARDING.md`, `docs/CHANGELOG.md` (only the running text above the "Before 2.0.0" heading — history entries keep their wording, and the ARC criterion is scoped to *current* vocabulary; if the verifier prefers a literal zero, the History heading gets the sentence "the term Tier below is historical") — **open point**, see Risks.
- Switch on the S02 vocabulary guard (`Tier [0-9]`, `nowaikit`, `mcp__servicenow-mcp__` under `.claude/`).
**Acceptance criteria.**
1. `test -f governance/governance-rules.md -a -f governance/taxonomy.md -a -f governance/prompt-patterns.md` and none of the three exists at the root; `git log --follow governance/taxonomy.md` reaches the pre-move history.
2. `grep -rn "Tier [0-9]" CLAUDE.md governance docs .claude tests` = 0 (ARC README acceptance criterion 3, third clause) — with `docs/CHANGELOG.md` lines below the `## Before 2.0.0` heading either rewritten or excluded per the open point recorded in the README.
3. `grep -c "Task tool" CLAUDE.md governance/*.md` = 0 (criterion 3, second clause).
4. Every `governance-rules.md` / `taxonomy.md` / `prompt-patterns.md` reference in `.claude/`, `CLAUDE.md`, `docs/`, `tests/` is prefixed `governance/` and resolves (S02 rule SK-10 covers `governance/`).
5. `governance/governance-rules.md` §2.2 names no retired tool (`create_update_set`, `query_records`, `update_record`, `create_record`, `switch_update_set`, `execute_script`, `execute_background_script`) — `grep -cwE "create_update_set|query_records|update_record|create_record|switch_update_set|execute_script|execute_background_script" governance/governance-rules.md` = 0 — and every `snow_*` token it uses exists in `packages/snowarch/dist/tools-manifest.json` (or `src/` before ARC-04-S13 commits dist).
6. `grep -rn "nowaikit\|NowAIKit\|servicenow-mcp" CLAUDE.md governance docs .claude tests` returns only `docs/ARCHITECTURE.md` History lines.
7. The S02 vocabulary guard is enabled and green.
**Tasks.**
1. `git mv` and reference rewrite; run S02 lint (SK-10).
2. Produce the hit list (`grep -rn "Tier\|nowaikit\|NowAIKit\|servicenow-mcp\|Task tool"`), review every hit against the table, apply.
3. Rewrite `governance/governance-rules.md` §2 interim text; bump its footer to v1.4 with a one-line changelog.
4. Update `governance/taxonomy.md` header (§ "Read by"), the §2.1 restatement at line 22, the "Builders" heading.
5. Enable the vocabulary guard; run the full lint and the criteria greps.
**Test strategy.** Integration: criteria 2, 3, 5, 6 added to `tests/no-legacy-surfaces.test.mjs` (from S05) as permanent greps. Manual: proofread the rewritten §2 with the owner (it is the governance text sub-agents and the main thread act on).
**Dependencies.** S05 (legacy docs gone, so the sweep touches only survivors). ARC-01-S04 (`engine.config.json` exists for the roster-count sentence).
**Size.** M — the move is an hour; the 60-odd vocabulary hits and the §2 rewrite are a day and a half.
**Risks / open points.** Historical CHANGELOG lines: the ARC criterion says zero hits in `docs`; recommended ruling: the `## Before 2.0.0` section is history and is excluded by path+heading in the test, with the disclaimer sentence — recorded in the README as an open point for the verifier. The §2.2 interim text will be replaced twice (ARC-04 tool, ARC-05 generator); it is short by design.
**Definition of done.** Merged; permanent greps in CI; `governance/governance-rules.md` v1.4; `docs/CONTRIBUTING.md` "Vocabulary" section (Mode/Preset table, forbidden words).

### ARC-02-S07 — Roster generator: `scripts/gen-roster.mjs` writes the roster table into `docs/ARCHITECTURE.md`; `--check` in CI
**As** a maintainer **I want** the specialist roster table to be generated from the directory listing **so that** counts and names cannot drift from the files again (today five documents disagree: 8/9 agents, 12/22/24/25/27 skills — `00` §3.8).
**Context.** P-12 (hand-maintained counts drift), ARC README story 13, `01` §3 (`docs/ARCHITECTURE.md`), `01` §8 (doctor: "roster from directory listing, no prose parsing"). S08's CLAUDE.md drops the long roster registry and points here.
**Scope.** In: `scripts/gen-roster.mjs` (Node stdlib), marker-delimited block in `docs/ARCHITECTURE.md`, CI `--check`, roster counts cross-checked against `engine.config.json.roster`. Out: any hand-written roster prose elsewhere (S08 removes CLAUDE.md's; S05 removed the docs').
**Design notes.**
- Input: `.claude/skills/*/SKILL.md` frontmatter (`name`, `description`, `metadata.version`, and the body `## Triggers` → `**Fires:**` line from S03) and `.claude/agents/*.md` (`name`, `description`, `skills`). Utility skills (`engine.config.json.roster.utility`, i.e. `snowarch`) are listed in a separate two-row table, not counted in the roster.
- Output: replaces the text between `<!-- ROSTER:BEGIN (generated by scripts/gen-roster.mjs — do not edit) -->` and `<!-- ROSTER:END -->` in `docs/ARCHITECTURE.md` with: a summary line `27 specialist personas · 28 skills (incl. now-assist-genai reference companion) · 9 sub-agents`, table A (skill · fires-as · has sub-agent · version), table B (agent · preloads · description first sentence), table C (utility skills). Sorted by name; LF line endings; deterministic.
- Classification of "fires-as" comes from the `**Fires:**` line (`gateway`, `routing-time consult`, `post-build consult`, `builder`, `on demand`, `reference`) — the generator fails if a skill lacks the line (S03 guarantees it).
- `--check`: regenerate to a temp string and compare with the file; exit 1 with a unified diff on mismatch. Also asserts counts equal `engine.config.json.roster.skills` / `.agents` and that every agent's `skills:` entries exist.
- Wired into root `npm run lint` (ARC-01 script) as `node scripts/gen-roster.mjs --check`.
**Acceptance criteria.**
1. `node scripts/gen-roster.mjs` on a clean tree makes no change (`git diff --exit-code docs/ARCHITECTURE.md`); `--check` exits 0.
2. Adding a dummy skill directory (temp copy) makes `--check` exit 1 with a diff showing the new row and a count mismatch message `roster.skills 28 ≠ 29 found`.
3. The generated block lists exactly 28 skills, 9 agents, 1 utility skill (after S11) and the summary line above; it contains no description longer than the first sentence (tables stay readable).
4. `grep -c "Task tool\|Tier" docs/ARCHITECTURE.md` = 0 outside the History section.
5. CI runs the check on the matrix (Windows included — CRLF-safe comparison).
**Tasks.** 1. Write the generator with a small parser reuse from `tests/lib/frontmatter.mjs`. 2. Insert markers into `docs/ARCHITECTURE.md`; run; commit. 3. Wire `--check` into `npm run lint`. 4. Document in `docs/CONTRIBUTING.md` ("never edit between ROSTER markers").
**Test strategy.** Unit: `tests/gen-roster.test.mjs` runs the generator against a fixture tree (3 skills, 1 agent) and snapshots the output; the negative case of criterion 2. CI: `--check` on the matrix.
**Dependencies.** S02 (parser, `## Triggers` contract from S03 — the generator tolerates a missing `Fires:` line with `unknown` until S03 merges, then S03 makes it mandatory), ARC-01-S12 (`docs/ARCHITECTURE.md` exists).
**Size.** S — ≈ half a day.
**Risks / open points.** None material; the ARC-08 doctor's roster check should call this module (`scripts/gen-roster.mjs --json`) rather than re-implement it — noted for ARC-08-S02.
**Definition of done.** Merged; `npm run lint` includes the check; CONTRIBUTING updated.

### ARC-02-S08 — `CLAUDE.md` ≤ 200 lines rewrite; harness-neutral wording; `Status` → `/snowarch status`; version line owned by the release script
**As** the engine (Claude) **I want** a `CLAUDE.md` that carries only what must be in context every session — identity, the two-phase routing protocol with the gateway, the §1.1 summary, the Mode rule — and points elsewhere for everything else **so that** the always-loaded text is short, true, and free of restated protocols that drift.
**Context.** P-02 and P-10 (harness-tool naming), `00` §3.5 (441 lines / 58 KB; the only auto-loaded file; §2.1/§2.2 restated; "Status" parses the doctor), `01` §3 (`CLAUDE.md` ≤ 200 lines: identity, routing protocol, §1.1 summary, Status; imports nothing large), `01` §8 (Status quotes the doctor's `Mode:` line; the ≤ 200-line figure is the plan's own choice — `00` §9 notes the docs' 200-line cap is for `MEMORY.md`), `01` §12 (version line written by `scripts/release.mjs`), ARC README deliverable 2 and acceptance criterion 3, R-2 (`/snowarch status`), R-17 (keep the plain-text "Status" trigger), ARC-05 (the rule file `.claude/rules/00-mode-and-mcp-gate.md` loads at launch with CLAUDE.md priority — `00` §9 `docs:memory`; it replaces the §2.1/§2.2 prose).
**Scope.** In: the full rewrite of `CLAUDE.md`; a line-budget table in `docs/CONTRIBUTING.md`; the version line contract with ARC-01's `tests/version-consistency.test.mjs`. Out: the content of the rule file (ARC-05), the roster table (S07), the validation tests (they stay in `VALIDATION-TESTS.md`, S13), the wizard/skill texts (S11).
**Design notes.**
- What leaves `CLAUDE.md` and where it goes: the repo map → `docs/ARCHITECTURE.md`; the "Phase 2.1 skills and agents registry" paragraphs and the roster tables → the generated block in `docs/ARCHITECTURE.md` (S07); the end-to-end worked example → `VALIDATION-TESTS.md` T-03 (already covers it); the two embedded validation tests (§6.2 hook, §1.1) → `VALIDATION-TESTS.md` T-01/T-02 (already there); §2.1 and §2.2 full text → `governance/governance-rules.md` §2 interim (S06), then the generated rule file + `governance/mcp-protocols.md` (ARC-05); the "When the user types Status" list → the `/snowarch status` skill (S11); the field-notes standing rule → rewritten in three lines (below); the two version-history footers → `docs/CHANGELOG.md` "Before 2.0.0".
- Section budget (target 170 lines, hard cap 200):

| # | Section | Lines |
|---|---|---|
| 1 | Title + identity ("Chief ServiceNow Architect"; 20+ years; routes, does not impersonate) | 8 |
| 2 | Operating principles (clarify-first; ground in `vendor/ServiceNowDocs` and cite; corporate English for artefacts; confidentiality firewall = folder discipline; push back with rationale) | 12 |
| 3 | Mode and Status: "Mode is `design-only` or `live` and is reported by the doctor. When the user types `Status` or `/snowarch status`, run `./snowarch doctor --quick` and quote its `Mode:` line verbatim — never infer the mode from any other source. In `design-only` no specialist attempts an MCP call; the generated rule file `.claude/rules/00-mode-and-mcp-gate.md` carries the MCP write gate (§2.1) and update-set capture (§2.2) — do not restate them here." | 8 |
| 4 | Where things are (one line each: `governance/governance-rules.md` §1.1/§2/§4, `governance/taxonomy.md`, `governance/prompt-patterns.md` PP-01…PP-24, `.claude/skills/`, `.claude/agents/`, `docs/ARCHITECTURE.md` roster, `docs/MODES-AND-PRESETS.md`, `docs/PLATFORM-NOTES.md`, `templates/`, `clients/<name>/`) | 12 |
| 5 | Roster in one breath: 27 personas / 28 skills / 9 sub-agents; the nine builders with sub-agents listed by name; "reviewers, gateways, consults: see the generated roster" | 12 |
| 6 | Phase 1 routing (Steps 1–12 compressed; Step 5 keeps the five-row gateway table; the multi-gateway co-fire rule; the document-deliverable rule; self-authorization prohibition) | 40 |
| 7 | Phase 2 post-build (Steps 1–9 compressed; §1.1 scan; Domain Expert review mode; the verbatim Code Reviewer proposal sentence; ATF / Operational Documentation / Diagramming triggers) | 24 |
| 8 | Builder-pair rules (4 rules, one line each) | 6 |
| 9 | Consults: §3.1 routing-time table (5 rows) and §3.2 post-build table (5 rows), one line per row | 14 |
| 10 | §1.1 summary (three sentences) + delivery-governance touchpoints (ADR/RTM/RAID one line each) + pointer | 8 |
| 11 | Confidentiality firewall (4 lines) | 5 |
| 12 | Standing rule: "When a ServiceNow platform behaviour is confirmed against a live instance, record it in `docs/PLATFORM-NOTES.md` with its ServiceNowDocs grounding; server behaviours go to `packages/snowarch/CHANGELOG.md` and a regression test; instance-specific values (URLs, sys_ids, usernames) never enter the repository." | 5 |
| 13 | Maintenance pointers (lint before commit: `npm run lint && npm test`; `tests/VALIDATION-TESTS.md` after protocol changes; skills are the only copy) | 5 |
| 14 | Version marker line, preserved **byte-for-byte** from ARC-01-S06: `**Version:** 2.0.0-dev — the version of record is the root package.json; this line is written by scripts/release.mjs (ARC-09). Supersedes engine v2.8.0 and snow-mcp 1.0.0.` (ARC-01-S06's `tests/version-consistency.test.mjs` asserts exactly one `**Version:**` line equal to root `package.json.version`; ARC-09-S01 rewrites it by the regex `^\*\*Version:\*\* \S+ `). This story invents no second format. | 2 |

- Harness-neutral wording: "dispatch the `<name>` sub-agent" (never "Task tool", "Agent tool"); "load the skill"; "the user's terminal". `mcp__servicenow__` appears nowhere in `CLAUDE.md` (the prefix's one home is the generated rule file — ARC-05 acceptance criterion 5).
- The gateway table and the verbatim §6.2 sentence are copied byte-for-byte from today's `CLAUDE.md` so that T-01/T-02/T-10 pass unchanged.
- Interim pointer text while ARC-05 has not generated the rule file: section 3's last sentence reads "… carried by `governance/governance-rules.md` §2 (to be generated into `.claude/rules/00-mode-and-mcp-gate.md` by the contract tooling)"; ARC-05-S05 flips the pointer (one-line edit) — recorded as an ARC-05 task.
**Acceptance criteria.**
1. `wc -l CLAUDE.md` ≤ 200 and `wc -c CLAUDE.md` ≤ 20,000 (ARC README acceptance criterion 3, first clause).
2. `grep -c "Task tool" CLAUDE.md` = 0; `grep -c "Tier [0-9]" CLAUDE.md` = 0; `grep -c "mcp__" CLAUDE.md` = 0; `grep -c "nowaikit\|NowAIKit\|context-mode\|claude-ai-projects" CLAUDE.md` = 0.
3. The five-row gateway table and the sentence *"Code artefact produced. Proposing a Code Reviewer pass (style, performance, security, best-practice) before final delivery — proceed?"* are present verbatim.
4. `CLAUDE.md` contains the strings `/snowarch status`, `./snowarch doctor --quick`, `Mode:` and the phrase "quote its `Mode:` line verbatim"; the word `Status` (plain text trigger) is retained (R-17).
5. `tests/version-consistency.test.mjs` (ARC-01-S06) passes **unchanged**: `grep -c '^\*\*Version:\*\* ' CLAUDE.md` = 1 and the value equals root `package.json.version` (`2.0.0-dev` until ARC-09 releases `2.0.0`); no other line of `CLAUDE.md` contains a version number (`grep -cE "v?2\.8\.0|Engine version" CLAUDE.md` = 0 — the two v2.7.8/v2.8.0 footers have moved to `docs/CHANGELOG.md`).
6. T-01, T-02, T-03, T-04, T-10 pass in a fresh session with the new file (S13 runs the full set; this story runs these five as its gate).
7. Every path named in section 4 resolves (S02 rule SK-10 extended to `CLAUDE.md`).
**Tasks.**
1. Write the new file against the budget table; keep a side-by-side "moved to" checklist in the PR (every removed paragraph names its new home).
2. Carry the ARC-01-S06 marker line over unchanged; run `tests/version-consistency.test.mjs` before and after.
3. Run the greps and the five validation tests.
4. Add the line-budget table to `docs/CONTRIBUTING.md` with the rule "adding to CLAUDE.md requires removing an equal number of lines or a pointer instead".
**Test strategy.** Integration: criteria 1, 2, 4, 5, 7 as a permanent test `tests/claude-md.test.mjs`. Manual: the five validation tests on macOS; one Windows session start to confirm no CRLF artefact in the loaded text (`.gitattributes` forces LF — ARC-01-S07).
**Dependencies.** S06 (paths and vocabulary final), S07 (roster block exists to point at), ARC-01-S06 (version test). ARC-05-S05 later flips the interim pointer.
**Size.** L — the compression is editorial work on the engine's most consequential file, with review rounds ≈ 3 days.
**Risks / open points.** Compressing Phase 1/2 wording can change behaviour subtly — the five gate tests plus the full S13 run are the guard; keep the verbatim blocks. The `Status` plain-text trigger must invoke a skill that exists (S11) — until S11 merges, section 3 says "run `./snowarch doctor --quick`" directly, which works from ARC-06 onward and, before that, tells the user the doctor is not installed yet (the launcher does not exist before ARC-06 — acceptable in a maintainer checkout).
**Definition of done.** Merged; `tests/claude-md.test.mjs` green on the matrix; CONTRIBUTING budget table; `docs/CHANGELOG.md` "Before 2.0.0" receives the two removed footers.

### ARC-02-S09 — `docs/MODES-AND-PRESETS.md` — Mode semantics, the preset table and plain-language flags of `01` §6.3, principle 10

> **Amendment 2026-09-08 (from the S09 delivery).**
> - **The SCRIPTING risk note is spent.** ARC-04-S05 merged on 2026-09-08, so "reading is always
>   allowed" is current fact and the page states it as one. The story's "the page states *from
>   2.0.0*" instruction no longer applies; a forward-looking hedge on shipped behaviour would now be
>   wrong in the other direction.
> - **Criterion 4 is half-deliverable here.** `docs/ARCHITECTURE.md` links to the page in this
>   story. `CLAUDE.md` links to it in **S08**, which owns that file's structure — S09 must not add a
>   link to a document S08 is rewriting around it. Verify criterion 4's `CLAUDE.md` half at S08.
> - **Criterion 1's line budget is amended from ≤ 150 to ≤ 160 (ruled 2026-09-08).** 150 was set for
>   a page written from scratch; the merge ruling instead keeps ARC-04-S02/S03/S05's store
>   precedence, permission and refusal claims (they are tested) and wraps the story's seven sections
>   around them, and ARC-07-S10 still has probe strings to add. Prose was compressed hard first —
>   184 → 158 across four passes, paragraphs reflowed to the width the rest of `docs/` uses and the
>   two production code blocks merged into one — and what remained was claims and their exact
>   strings, so the last eight lines could only have come from dropping a tested claim or running
>   unrelated paragraphs together. The page is 159 lines; `tests/no-legacy-surfaces.test.mjs` prints
>   the count and asserts the 160 ceiling.
> - **`servicenow-mcp` cannot appear here.** Criterion 2 forbids it and the upgrade note used it to
>   name the package people upgrade *from*. The note now names the behaviour instead — "Upgrading
>   from the 1.0.0 server" — which keeps the claim and satisfies the criterion. `docs/CONTRIBUTING.md`
>   still records that the bare name is deliberately not retired repo-wide (D-01's npm record).
**As** an individual practitioner **I want** one page that explains what `design-only` and `live` mean, what each preset turns on, what each flag does in plain words, and how production is protected **so that** I can decide on the per-flag review screen without reading the server source.
**Context.** P-06, D-05 (owner-modified posture: `full` proposed for `pdi`/`dev`/`test`; `read-only` for `prod`, capped; `--ack-prod`), principle 10 ("Propose, don't impose"), `01` §6.3 (the table, the review screen, the flag meanings, the safety rules), `01` §9 (design-only), ARC README deliverable (`docs/MODES-AND-PRESETS.md`). ARC-07-S10 delivers the *final* text (probe wording, troubleshooting cross-links) and ARC-05-S05 generates the preset table from the contract — this story writes v1 with splice markers so both can land without rewriting.
**Scope.** In: the page as specified below; cross-links from `CLAUDE.md` section 4 (S08) and `docs/ARCHITECTURE.md`. Out: probe result strings (ARC-07), `TROUBLESHOOTING.md` entries (ARC-05/ARC-07), any server behaviour claims not already in `01` §6.3.
**Design notes.** Page structure (≤ 150 lines):
1. **Mode** — `design-only` (no instance; everything works from `vendor/ServiceNowDocs`; MCP rules dormant; `/mcp` shows `servicenow` disabled for this project) and `live` (one or more instances in `.local/instances.json`; per-instance preset). How to see it: `/snowarch status` or `./snowarch doctor --quick`. How to switch: `./snowarch mode live` / `./snowarch mode design` (ARC-06-S12); adding the first instance is `/snowarch setup-instance` or `./snowarch instance add …`.
2. **Presets** — the `01` §6.3 table verbatim, wrapped in `<!-- PRESETS:BEGIN (generated from the contract by scripts/gen-governance.mjs — ARC-05) -->` … `<!-- PRESETS:END -->` so ARC-05's generator can own it later; today the rows are hand-copied.
3. **What the system proposes** (D-05 as decided): for `pdi` / `dev` / `test` → `full`, then the per-flag review screen reproduced from `01` §6.3 (each flag pre-set ON, annotated with its probe result; a failing probe changes only the recommendation text; `Enter = accept as shown · type a flag name to toggle · "preset <name>" to switch preset`); for `prod` → `read-only`, write flags greyed with the `--ack-prod` instruction. Environment detection: `^https://dev\d+\.service-now\.com` → proposed `pdi`; any other host is asked (`pdi / dev / test / prod`), never guessed. Everything re-editable: `./snowarch instance set-preset <label> <preset>`, `set-flags`, `/snowarch setup-instance`.
4. **The six flags in plain language** — the six bullets of `01` §6.3 verbatim (WRITE, CMDB_WRITE, SCRIPTING, ATF, NOW_ASSIST, FLUENT), plus the dependency rule (SCRIPTING and CMDB_WRITE require WRITE) and the fact that every preset writes all six as explicit `"true"`/`"false"` strings (P-03 closed by ARC-04/ARC-07).
5. **Production safeguards** — cap at `read-only`; `./snowarch instance set-preset <label> <preset> --ack-prod` with the label typed; server refuses `prod` + write preset without `prodWriteAck: true`; the audit log `.local/audit.jsonl` (`01` §7) records every mutating call.
6. **Principle 10** — one paragraph: Propose → Review → Apply; Enter accepts; any single value editable; `--yes` for CI.
7. **Where the values live** — `.local/instances.json` (0600, per checkout, gitignored, D-04) and the cloud-sync-folder warning (D-04: OneDrive/Dropbox/iCloud Drive/Google Drive).
No "Tier", no old server key, no price or licence claims beyond "NOW_ASSIST needs a Now Assist licence on the instance".
**Acceptance criteria.**
1. `docs/MODES-AND-PRESETS.md` exists, ≤ 150 lines, contains the four preset names, the six flag names, the review-screen block, the regex `^https://dev\d+\.service-now\.com`, the strings `--ack-prod`, `prodWriteAck`, `.local/instances.json`, `0600`, `OneDrive`, `Dropbox`, `iCloud Drive`, `Google Drive` (D-04), `--yes` (principle 10), and the phrase "Propose, don't impose"; the sentence "A probe that fails downgrades the recommendation shown on that line; it never flips the toggle by itself" appears verbatim (D-05).
2. `grep -c "Tier" docs/MODES-AND-PRESETS.md` = 0; `grep -c "nowaikit\|servicenow-mcp" …` = 0.
3. The preset table sits between the `PRESETS:BEGIN/END` markers and matches `01` §6.3 row for row (the verifier diffs the two).
4. `CLAUDE.md` (S08) and `docs/ARCHITECTURE.md` link to the page; the links resolve (S02 SK-10).
5. Read-through by the owner confirms the D-05 modification is stated as decided (non-production proposes `full`; probe failure never flips a toggle).
**Tasks.** 1. Write the page from `01` §6.3/§9/§7. 2. Insert markers. 3. Add links. 4. Owner read-through.
**Test strategy.** Integration: criteria 1–2 in `tests/no-legacy-surfaces.test.mjs`. Manual: owner review. ARC-05's generator later asserts byte-identity of the marked block.
**Dependencies.** S06 (vocabulary). Consumed by ARC-05-S05 (markers) and ARC-07-S10 (final text).
**Size.** S — ≈ half a day; the content is already decided.
**Risks / open points.** The flag semantics of SCRIPTING ("reading is always allowed") describe the post-ARC-04 server; until ARC-04-S05 merges the sentence is forward-looking — the page states "from 2.0.0".
**Definition of done.** Merged; links in place; ARC-05/ARC-07 informed of the markers.

### ARC-02-S10 — `docs/PLATFORM-NOTES.md` from the field notes; server-behaviour sections handed to ARC-04 as regression-test titles

> **Amendment 2026-09-08 (from the S10 delivery).**
> - **Criterion 4 is recorded, not re-opened (ruled).** Four of the seven handover items were already
>   delivered by ARC-04 and have tests: 1 `tests/tools/update-set-capture.test.ts`, 2
>   `tests/tools/unsupported-stubs.test.ts`, 3 `tests/tools/integration-event.test.ts`, 4
>   `tests/tools/script-business-rule.test.ts`. Item 6 is verify-only against a live instance and now
>   has a written procedure in `packages/snowarch/tests/live/README.md` — the CHANGELOG pointed at
>   that file, so the procedure had to exist for the pointer to be true. Items 5 and 7 are open. The
>   whole mapping is the "Known limitations carried from snow-mcp 1.0.0" table in
>   `packages/snowarch/CHANGELOG.md`; no checklist comment was opened on closed ARC-04 tickets.
> - **Classification of the mixed section (task 1), decided without an owner round-trip:** field-notes
>   §1's platform half — REST capture follows the user's `sys_user_preference` — is PN-01; its server
>   half — `switch` only set `is_default` — is row 1 of the CHANGELOG table. §14's docx/diagram rule
>   is present in `scripts/README.md` and was dropped. §8 named a config file this product no longer
>   uses and was dropped.
> - **The §11 observation about the error CODE was dropped from both destinations.** The note said the
>   1.0.0 tool reported an invalid `close_code` as `INSUFFICIENT_PRIVILEGES`, making a validation
>   failure look like an ACL problem. That is a server claim, so it does not belong in PN-04; but it
>   is about a tool that no longer exists in that form, and whether the current server maps it
>   correctly cannot be settled without a live instance. Adding it to the limitations table would
>   assert a defect nobody has observed in 2.0.0. Recorded here instead: **worth a live check when
>   the owner next has an instance open.**
> - **SK-09 flipped from counting to enforcing.** The rule had a test asserting the governing
>   documents were still dirty, so that "not yet swept" could not be mistaken for "swept". S06 took
>   it to one hit; this story's Standing Rule rewrite took the last one, so the test now asserts the
>   surface is clean.
> - **Criterion 5 needed more than a path swap.** The Standing Rule routed MCP findings *out* of the
>   repository (DR-16, from when the server lived elsewhere). It now names both destinations by kind
>   of finding — platform to `docs/PLATFORM-NOTES.md`, server to a test plus the CHANGELOG. S08 still
>   owns the section's structure.
**As** the engine (Claude) **I want** the platform facts learned on real instances kept as product documentation with their ServiceNowDocs grounding, and the MCP-tool bugs turned into server tests **so that** an engagement journal stops being a product document (P-13) and the knowledge survives in the place that can enforce it.
**Context.** P-13 (`00` §3.11: `docs/nowaikit-field-notes.md` — 15 PDI findings, section numbering 1-7,10,9,8,13,14,11,15, §8 still says `claude_desktop_config.json`), DR-16 (`01` §18: field-notes split; the "MCP findings excluded from this repo" standing rule lapses with the merge), `00` §8 field-notes classification (platform facts: §1-platform, §3, §7, §10, §11, §13, §15; server behaviours: §1-`switch_update_set`, §2, §4, §5, §6, §9a, §9b; obsolete: §8; engine tooling: §14), ARC README deliverable 4 ("each with the ServiceNowDocs citation it relies on"), `CLAUDE.md` Standing Rule (rewritten in S08).
**Scope.** In: `docs/PLATFORM-NOTES.md`; the handover list for ARC-04; deletion of `docs/nowaikit-field-notes.md`; §14's docx/diagram rule confirmed present in `scripts/README.md` (it is — "Golden rule" section) and dropped from the notes. Out: writing the ARC-04 tests; new platform findings.
**Design notes.**
- Entry format (one H2 per note, chronological ids kept as `PN-01…`):
  ```markdown
  ## PN-04 — Incident state 6 (Resolved) requires a valid `close_code`
  **Applies to:** `incident` · Australia family · confirmed on PDI 2026-06-26
  **Behaviour:** Setting `state=6` via REST is rejected unless `close_code` is one of the instance's active choices (…); an invalid value looks like an ACL block but is a data-validation failure.
  **Grounding:** `vendor/ServiceNowDocs/markdown/it-service-management/incident-management/resolve-and-close-an-incident.md`
  **Evidence:** observed on PDI; regression test — none (platform, not server)
  **Engine consequence:** the ITSM gateway's Data Model Alignment lists valid `close_code` values before any resolve write.
  ```
  `Grounding:` must be a path that exists in the corpus (checked by ARC-03's citation lint, which scans `docs/` too — add `docs/PLATFORM-NOTES.md` to its scan set). Where the corpus has no page stating the behaviour, the line reads `**Grounding:** none in ServiceNowDocs (<nearest area path> for the baseline concept); observed behaviour` — never an invented path.
- Notes to write and the grounding found in the corpus during drafting (the implementer re-verifies):
  - PN-01 REST honours `sys_user_preference` `name=sys_update_set` for the authenticated user (from field-notes §1, platform half) — grounding: `application-development/system-update-sets/` (directory; no page states the REST behaviour → "observed" wording), engine consequence: §2.2.
  - PN-02 Email generation on PDI (§3) — grounding: `platform-administration/activate-email-service.md`.
  - PN-03 `sys_update_xml` DELETE rows are normal (§7) — grounding: `application-development/system-update-sets/`.
  - PN-04 Incident state 6 needs a valid `close_code` (§11) — grounding as above.
  - PN-05 Assignment rules live in `sysrule_assignment`, field `document` (§10) — grounding: the assignment-rules page under `platform-administration/` if present, else `core-business-suite/assignment-rules-cbs.md` for the concept with the "observed" wording.
  - PN-06 Basic-auth `Authorization` header appears in `sys_outbound_http_log` at verbose log levels (§13) — grounding: `integrate-applications/` outbound REST area (no page names the log table in the corpus → "observed"); engine consequence: Security & GRC consult flags outbound log level on any basic-auth REST message.
  - PN-07 `sys_script_fix.name` silently truncates at 40 characters over REST (§15) — grounding: none found in the platform folders (order-management pages mention fix scripts only in passing) → "observed"; engine consequence: Developer skill's naming rule for fix scripts (≤ 40 chars).
- Handover to ARC-04 (server behaviours), delivered as a checklist in the ARC-04-S07/S08/S09 and ARC-04-S14 tickets and as a section at the end of `packages/snowarch/CHANGELOG.md` "Known limitations carried from snow-mcp 1.0.0" until each is fixed or documented:
  1. `snow_us_update_set_switch` only sets `is_default: true`; it does not change the capture context → test title "update_set_switch does not set the capture target; capture_target_set does" (ARC-04-S07).
  2. `snow_deploy_background_script_exec` / `sys_script_execution` endpoints unavailable on PDI → "background script exec returns UNSUPPORTED_ON_THIS_INSTANCE" (ARC-04-S08).
  3. `snow_intg_event_register` leaves `event_name` empty → "event_register sets event_name" (ARC-04-S09).
  4. `snow_scr_business_rule_add` does not set `action_insert` / `action_update` → "business_rule_add sets action flags" (ARC-04-S09).
  5. `snow_flow_flow_add` / `snow_flow_flow_action_add` create empty shells → documented limitation in the README/CHANGELOG (ARC-04-S14); no fix in 2.0.0.
  6. `snow_core_record_remove` on scripting tables returns `NOT_FOUND` but succeeds (§9a, marked fixed in the notes) → "record_remove on sys_script_include reports success" (ARC-04-S09, verify-only).
  7. `sysevent_register` deletion via MCP unverified (§9b) → left as a note in the CHANGELOG limitations list.
- `docs/nowaikit-field-notes.md` and the `MCP-OPERATIONS-GUIDE.md` platform facts (S05 handover note) are deleted/absorbed in this story; `docs/LIVE-ARTEFACTS-CATALOGUE.md` is already gone (ARC-01-S10).
**Acceptance criteria.**
1. `docs/PLATFORM-NOTES.md` exists with PN-01…PN-07; every entry has the five fields; `grep -c "claude_desktop_config\|nowaikit\|NowAIKit\|Tier\|mcp__" docs/PLATFORM-NOTES.md` = 0; no instance URL, sys_id, username or email appears (`grep -nE "dev[0-9]{5,}|[0-9a-f]{32}|@" docs/PLATFORM-NOTES.md` prints nothing).
2. Every `Grounding:` path that is a path resolves under `vendor/ServiceNowDocs/` (ARC-03 citation lint run with `docs/PLATFORM-NOTES.md` in scope); entries without a corpus page use the exact "none in ServiceNowDocs" wording.
3. `test ! -e docs/nowaikit-field-notes.md`.
4. The seven handover items appear as a checklist comment on the ARC-04 tickets and as the "Known limitations carried from snow-mcp 1.0.0" section in `packages/snowarch/CHANGELOG.md` (PR to ARC-04's branch or a follow-up PR the ARC-04 owner accepts).
5. `CLAUDE.md` Standing Rule (S08) and `docs/CONTRIBUTING.md` name `docs/PLATFORM-NOTES.md` as the destination for platform findings and `packages/snowarch/CHANGELOG.md` + a test for server findings.
**Tasks.** 1. Classify each field-note section against `00` §8 (agree with the owner where the old text mixes both halves — §1). 2. Write PN-01…PN-07 with verified grounding paths. 3. Write the handover checklist; open it on ARC-04. 4. Delete the field notes; add the file to the citation lint scan set (ARC-03 config). 5. Update CONTRIBUTING.
**Test strategy.** Integration: criterion 1 greps in `tests/no-legacy-surfaces.test.mjs`; criterion 2 via ARC-03's `./snowarch docs verify` once it exists (interim: `bash scripts/verify-citations.sh` with `SCAN_DIR` temporarily including `docs/`). Manual: owner review of the "Engine consequence" lines (they change gateway behaviour).
**Dependencies.** S05 (legacy docs disposition; sequencing rule with `MCP-OPERATIONS-GUIDE.md`). ARC-03-S02/S03 (citation scanner and its scan set) for criterion 2's final form.
**Size.** M — seven grounded entries with corpus verification and the ARC-04 handover ≈ 1.5 days.
**Risks / open points.** Several behaviours have no corpus page; the "observed" wording is honest but the ARC README's "each with the ServiceNowDocs citation it relies on" is then met only for the concept, not the behaviour — recorded in the README. §1's platform half and server half share one heading today; the split must be reviewed by the owner (it is the §2.2 foundation).
**Definition of done.** Merged; field notes deleted; citation lint covers the file; ARC-04 handover accepted; CONTRIBUTING and the CLAUDE.md Standing Rule agree.

### ARC-02-S11 — `/snowarch` project skill: `status` (delegates to the doctor), `setup-instance` skeleton with the terminal hand-off, `doctor`
**As** an individual practitioner **I want** one in-session command family — `/snowarch status`, `/snowarch setup-instance`, `/snowarch doctor` — **so that** the engine reports its Mode from the doctor (never by guessing), guides me through adding an instance without ever asking for a secret in chat, and never collides with Claude Code's built-in `/status`.
**Context.** R-2 (rename to `/snowarch`; sub-commands; no `/status` skill), R-17, D-06 hedge ("the `/snowarch setup-instance` skill must guide the terminal hand-off from inside Claude — say exactly what to type, wait, resume"), `01` §6.2 (the eight-step skill flow — ARC-07-S09 implements steps 2–5 and 8's reload/probe logic), `01` §8 (its `/status` — read as `/snowarch status` per R-2 — quotes the doctor's `Mode:` line; without Node it reads `.local/bootstrap-state.json`), `01` §3 (`allowed-tools: Bash(./snowarch doctor*)`; user- and model-invocable), `01` §4.1 (the in-session skills run `./snowarch …` through Claude's Bash tool, which on Windows needs Git for Windows), `00` §9 (`allowed-tools` is turn-scoped and not trust-gated; S-16 tests that `permissions.allow` is honoured right after trust), ARC-08-S09 (`/snowarch status` skill body — the full JSON rendering), ARC README deliverable 5 and acceptance criterion 2 (second half: "`/snowarch status` — and the plain-text `Status` — return the doctor's `Mode:` line").
**Scope.** In: `.claude/skills/snowarch/SKILL.md` with the three sub-commands; the `status` behaviour complete enough to quote a `Mode:` line from `./snowarch doctor --quick --json` when the doctor exists and from `.local/bootstrap-state.json` when Node or the doctor is absent; the `setup-instance` skeleton = prerequisite gate + hand-off script (exact command shape, wait, resume instruction) with the AskUserQuestion flow stubbed as "collected by ARC-07-S09"; the `doctor` sub-command; `engine.config.json` `roster.utility` entry; a fixture doctor for tests. Out: the AskUserQuestion flow, URL validation, `--resume` reload/probe logic (ARC-07-S09); the JSON-report rendering details (ARC-08-S09); any credential handling (none exists in this skill by design).
**Design notes.**
- File `.claude/skills/snowarch/SKILL.md` frontmatter:
  ```yaml
  ---
  name: snowarch
  description: "Status, instance setup and health check for the AI ServiceNow Architect. Use `/snowarch status` (or when the user types Status) to report the authoritative Mode line from the doctor; `/snowarch setup-instance` to add a live ServiceNow instance via a guided terminal hand-off; `/snowarch doctor` to run the full health check. Never asks for credentials in chat."
  argument-hint: "status | setup-instance [--resume] | doctor"
  allowed-tools: Bash(./snowarch doctor*), Bash(node tools/snowarch/bin/snowarch.mjs doctor*), Bash(cat .local/bootstrap-state.json), Read
  metadata:
    version: 2.0.0
  ---
  ```
  (≤ 500 chars; both user- and model-invocable by default — no `disable-model-invocation`, no `user-invocable: false`.) `engine.config.json` gains `"roster": { "skills": 28, "agents": 9, "utility": ["snowarch"] }` (ARC-01-S04 owns the file and its schema; this story adds the key and the schema line and says so in the PR).
- Sub-command dispatch: the body starts with "The first word of the arguments selects the sub-command (`status` when none is given)". This relies on Claude Code substituting the text typed after `/snowarch` into the skill (`$ARGUMENTS`, `docs:skills` "Skill arguments"). This behaviour is **not** in the `00` §9 substrate table — task 1 verifies it in a ten-minute check (`claude --debug`, invoke `/snowarch doctor`, confirm the body sees `doctor`). Fallback if it does not hold: three skills `snowarch-status`, `snowarch-setup-instance`, `snowarch-doctor` (same bodies; keeps R-2's no-collision intent; owner informed; R-17's lint list still applies).
- `status` body:
  1. Run `./snowarch doctor --quick --json` (Windows Git Bash: same command; if `./snowarch` is not executable, run `node tools/snowarch/bin/snowarch.mjs doctor --quick --json`).
  2. If it succeeds: print the `mode` line **verbatim** as `Mode: …` (the doctor prints it as `report.modeLine` — ARC-08-S01 defines the JSON; until then the fixture defines the same key), then engine version, docs pin, roster (`28 skills / 9 agents`), capability packs — one line each (ARC-08-S09 owns the final layout; this story prints the Mode line plus whatever keys exist).
  3. If `node` is absent or the command fails with "not found": read `.local/bootstrap-state.json` and print `Mode: <mode> — from bootstrap state; doctor unavailable until Node 20+ is installed` (`01` §8).
  4. If neither exists: print `Mode: unknown — this checkout has not been bootstrapped; run ./bootstrap.sh (Windows: bootstrap.cmd)`.
  5. Never infer the mode from `~/.claude.json`, `/mcp`, or memory (R-14).
- `setup-instance` body (skeleton; ARC-07 completes steps 2–5, 8):
  1. Prerequisite gate: `./snowarch doctor --json --section prereqs`; if Node < 20 or deps missing, print the `01` §6.2 step-1 text verbatim ("Node.js 20+ is required for live mode — install it (macOS `brew install node@22`; Windows `winget install OpenJS.NodeJS.LTS`; Linux distro package or nvm), then `/snowarch setup-instance` again.") and stop.
  2–5. `<!-- ARC-07-S09: AskUserQuestion ×3 (instance kind; auth method; preset), URL + label in chat -->` — in the skeleton, the skill asks the user in plain chat for the label and URL only and explains that kind/auth/preset are proposed by the terminal wizard (principle 10).
  6. **Hand-off (D-06 hedge)** — printed exactly in this shape:
     ```
     Next step happens in YOUR terminal (credentials never pass through this chat).
     1. Open a terminal at this checkout: <absolute path>
     2. Run:   ./snowarch instance add <label> --url <url> --default
        (Windows PowerShell/cmd:  snowarch.cmd instance add <label> --url <url> --default)
     3. The wizard proposes the environment and preset and shows a per-flag review — press Enter to accept, or edit any line.
     4. Type your username and password when prompted (masked; nothing is echoed).
     5. When it prints "Saved instance …", come back here and type:  /snowarch setup-instance --resume
     I will wait. Nothing is written until you confirm in the terminal.
     ```
  7. `--resume` branch (skeleton): call `./snowarch doctor --quick --json` and print the Mode line; `<!-- ARC-07-S09: snow_core_instances_reload, snow_core_capabilities_read, S-02 fallback text -->`.
  8. Close with the §2.1/§2.2 reminder sentence from `01` §6.2 step 9.
  No `AskUserQuestion` for secrets; the skill contains the sentence "This skill never asks for a password, token or client secret; if you are asked for one here, stop."
- `doctor` body: run `./snowarch doctor` (full, text output) and relay the summary line `DOCTOR: n ok, n warn, n fail` plus every FAIL line with its remedy; suggest `./snowarch doctor --fix` only for fixable items (the report marks them).
- Test fixture: `tests/fixtures/snowarch-doctor-stub/snowarch` (bash) and `snowarch.cmd` printing `{"mode":"design-only","modeLine":"Mode: design-only — no ServiceNow instance configured; run ./snowarch instance add or /snowarch setup-instance to add one","modeLineDetailed":"Mode: design-only — no ServiceNow instance configured; run ./snowarch instance add or /snowarch setup-instance to add one","ok":41,"warn":0,"fail":0}` for `doctor --quick --json` (the key names follow ARC-08-S01's report schema v1 — `mode`, `modeLine`, `modeLineDetailed`; ARC-08-S01 updates the stub if the schema changes), used for the manual acceptance run before ARC-06/ARC-08 exist (copy the stub to the checkout root, run the skill, remove it).
- Permissions: `.claude/settings.json` `permissions.allow` already lists `Bash(./snowarch doctor*)` and `Bash(node tools/snowarch/bin/snowarch.mjs *)` (`01` §5, ARC-06-S01); `allowed-tools` duplicates them turn-scoped (S-16 fallback).
**Acceptance criteria.**
1. `node --test tests/` passes with the new skill (SK rules; name not in the built-in list; description ≤ 500; utility exemption for EXAMPLES.md); `scripts/gen-roster.mjs --check` passes with the utility table showing `snowarch`.
2. In a fresh session with the doctor stub at the root, `/snowarch status` prints exactly the stub's Mode line as the first line of its answer (ARC README acceptance criterion 2, second half, against the stub; ARC-08's CI run repeats it against the real doctor).
3. Typing `Status` (plain text) produces the same Mode line (CLAUDE.md section 3 trigger).
4. With the stub removed and `.local/bootstrap-state.json` = `{"mode":"design-only","docsPin":"ba513f2","at":"…"}`, `/snowarch status` prints `Mode: design-only — from bootstrap state; doctor unavailable until Node 20+ is installed`.
5. With neither present, it prints the `Mode: unknown — … run ./bootstrap.sh` line and nothing else about mode.
6. `/snowarch setup-instance` in the same session prints the hand-off block with the label and URL substituted, contains the literal `/snowarch setup-instance --resume`, and the transcript contains no `AskUserQuestion` whose text mentions password/secret/token; `grep -ci "password" .claude/skills/snowarch/SKILL.md` counts only the two "never asks"/"masked" sentences.
7. `/snowarch doctor` relays the `DOCTOR:` summary line from the stub.
8. Task 1's `$ARGUMENTS` check is recorded in the PR (`CONFIRMED` with the CLI version) or the fallback layout is applied and the owner informed.
9. The Windows form `snowarch.cmd instance add …` appears in the hand-off text; on Windows (Git for Windows present) the `status` command runs through `./snowarch` or the `node tools/snowarch/bin/snowarch.mjs` fallback.
**Tasks.** 1. Verify `$ARGUMENTS` substitution (ten-minute check); record. 2. Write the skill; add the `roster.utility` key + schema line. 3. Write the doctor stub fixture. 4. Manual runs for criteria 2–7 on macOS; criterion 9 on Windows. 5. CLAUDE.md section 3 already points here (S08) — confirm the wording matches.
**Test strategy.** Unit/integration: the lints and roster check. Manual: the seven session checks with the stub (documented as a checklist in `tests/VALIDATION-TESTS.md` under the new T-07 — see S13). ARC-07/ARC-08 replace the stub with real runs.
**Dependencies.** S02 (lint rules incl. built-in list), S08 (CLAUDE.md trigger). ARC-00 S-16 (permissions honoured after trust — affects whether a prompt appears, not correctness). Unblocks ARC-07-S09 and ARC-08-S09, which extend this file in place (they must not create a second skill).
**Size.** M — one skill file with three branches, a stub, and manual verification ≈ 2 days.
**Risks / open points.** (a) `$ARGUMENTS` dispatch is docs-based, not yet exercised here — fallback recorded above. (b) Before ARC-06 exists, `./snowarch` is absent in a maintainer checkout; the skill's "not bootstrapped" branch covers it. (c) ARC-07 and ARC-08 both edit this file later — merge order: ARC-07-S09 (setup-instance body) then ARC-08-S09 (status rendering); both keep the frontmatter and the hand-off block byte-identical unless the owner changes the wording.
**Definition of done.** Merged; lint and roster green; `docs/USER-GUIDE.md` gains a "`/snowarch` commands" section; ARC-07/ARC-08 stories reference this file path.

### ARC-02-S12 — Retired-name final sweep with ARC-05's `retired-names.json` and `engine-lint.mjs` (incl. ITOM SKILL/EXAMPLES)
**As** the engine (Claude) **I want** no retired tool name to survive anywhere in the texts I read **so that** I never call a tool the server rejects with `UNKNOWN_TOOL` (P-04: 31 retired names, 118 occurrences; the ITOM skill's `cmdb_health_dashboard` → `snow_core_health_dashboard_read`).
**Context.** P-04, DR-14 (no runtime alias layer — texts are rewritten to the `snow_*` grammar), ARC README deliverable 3 (final sweep gated by ARC-05's lint) and acceptance criterion 4 (`node packages/contract/lint/engine-lint.mjs` passes), ARC README risk 2 (governance relocation breaks citations — the ARC-05 lint checks internal path references too). `00` §8: the 28 skills and 9 agents contain no `mcp__`/`snow_` references except the one ITOM retired name; most occurrences are in `CLAUDE.md` (gone with S08), `governance-rules.md` §2.2 (rewritten in S06), `README.md`/`SETUP.md`/docs (gone with S05), `scripts/*.sh` (`scripts/legacy/`, excluded). What remains for this story is whatever the contract lint still finds.
**Scope.** In: running `engine-lint.mjs` and fixing every finding in `CLAUDE.md`, `.claude/**`, `governance/**`, `docs/**`, `tests/**`, `README.md`; the ITOM SKILL.md anti-pattern row (line ~370 today: "`cmdb_health_dashboard` rules cover it") and any EXAMPLES.md echo; confirming every `snow_*` token used by S06's interim §2.2 exists in the contract. Out: `scripts/legacy/` (ARC-10 deletes it); `packages/snowarch/**` (server-side names are ARC-04's); the generators (ARC-05).
**Design notes.**
- Command: `node packages/contract/lint/engine-lint.mjs` (ARC-05-S03 core checks L01–L03/L07/L11; ARC-05-S04 structural checks L04–L06/L08; `--only L01,L03` is this story's exit test per ARC-05-S03) — checks tool tokens against the pinned contract, prefix `mcp__servicenow__`, bare retired names from `packages/contract/retired-names.json` (394 rename-map keys + `nowaikit`, `NowAIKit`, `mcp__nowaikit__`, `mcp__servicenow-mcp__`), description length, internal path references, generated-file byte identity.
- The ITOM row is *not* a tool call but prose naming a legacy tool; rewrite to "CMDB Health rules (`snow_core_health_dashboard_read` reads them) cover it" only if the sentence needs the tool at all — otherwise drop the tool name: "baseline CMDB Health rules cover it". Prefer dropping: skills are MCP-agnostic by design (`00` §8) and stay that way.
- Retired names that are *also* ordinary English or ServiceNow words (`create_request`, `update_response` appear as ServiceNow API artefacts in two skills — `grep` today shows `create_request`, `update_request`, `create_response`, `update_response`, `update_reporting_line`) — check each against `retired-names.json`; if a genuine ServiceNow term collides with a retired MCP name, wrap it in backticks with its table/API context and add it to the lint's per-file allow-list with a justification comment (ARC-05's lint must support a `// lint-allow: <name> — <reason>` marker; request it in ARC-05-S03 if absent).
- Governance relocation risk: the lint's path check covers `governance/…` references inside skills (25 `governance-rules.md` mentions in 17 skill files today) — expected zero findings after S06; any finding is fixed here.
**Acceptance criteria.**
1. `node packages/contract/lint/engine-lint.mjs` exits 0 on the tree (ARC README acceptance criterion 4).
2. `grep -rnw -f <(jq -r 'keys[]' packages/contract/retired-names.json) CLAUDE.md .claude governance docs tests README.md | grep -v 'retired-name: historical'` returns nothing (ARC-05 acceptance criterion 4 applied to the engine texts; the only permitted marked lines are in the `## History` section of `docs/ARCHITECTURE.md`, S05).
3. `grep -rn "cmdb_health_dashboard" .claude` = 0.
4. Every `snow_*` token in `governance/governance-rules.md` and `docs/PLATFORM-NOTES.md` exists in `packages/snowarch/dist/contract.json`.
5. Any allow-listed collision carries a justification comment and is listed in the PR.
6. `node --test tests/no-legacy-names.test.mjs` (ARC-01-S10) passes with **no row owned by `ARC-02`** left in `tests/legacy-names.allowlist.json` (`jq -r 'to_entries[] | select(.value=="ARC-02") | .key' tests/legacy-names.allowlist.json` prints nothing) — the "allow-list empty for my files" criterion ARC-01-S10 requires of this ARC; rows are removed progressively by S05/S06/S08/S13 and this story is where the last one goes.
**Tasks.** 1. Run the lint; triage findings into rewrite / drop / allow-list. 2. Apply. 3. Re-run; attach the clean output to the PR. 4. Add the ARC's grep to `tests/no-legacy-surfaces.test.mjs` as a permanent check (reads `retired-names.json`).
**Test strategy.** Integration: the contract lint in CI (ARC-05-S09's `contract` job) plus the permanent grep test. No manual steps.
**Dependencies.** S06 (paths and interim §2.2). ARC-05-S01 (pinned contract), ARC-05-S02 (`retired-names.json`) and ARC-05-S03/S04 (`engine-lint.mjs`); ARC-04-S13 (committed `dist/contract.json`) transitively.
**Size.** S — the earlier stories remove most occurrences; ≈ half a day to one day of triage.
**Risks / open points.** ARC-05's lint arrives late in the programme; stories S01–S11 do not wait for it (README dependency line). If ARC-05 slips, an interim `tests/retired-names.test.mjs` with a hand-copied list of the 31 names cited in `00` P-04 gives most of the value — to be deleted when the real lint lands.
**Definition of done.** Merged; contract job green; permanent grep test in place; ARC README acceptance criterion 4 ticked.

### ARC-02-S13 — Refresh `VALIDATION-TESTS.md` (T-01…T-18) to Mode/Preset and current tool names; replace T-07; strip run history; execute in design-only mode
**As** a maintainer **I want** the eighteen behavioural tests to describe the product as it now is, with no dated run history, and to have been executed once in design-only mode on a clean machine **so that** the description rewrites (R-06), the agent changes and the `CLAUDE.md` compression are proven not to have changed routing behaviour.
**Context.** ARC README deliverable 6 and acceptance criterion 6 (T-01…T-18 pass in design-only mode on a clean machine, the two §1.1/§6.2 gate tests included), P-13 (`VALIDATION-TESTS.md:692-715` dated runs; "Structural / Engine Integrity Runs" table), R-06, `01` §3 (`tests/VALIDATION-TESTS.md`, manual T-01…T-18), `00` §3.5. Today the file says "Run in both Claude Code (Tier 2) and Claude.ai (Tier 1)", every test carries a `**Tiers:**` line, T-05/T-06 cite `create_update_set`, `query_records`, `create_script_include`, and T-07 tests the deleted sync hook (retired in S01).
**Scope.** In: move to `tests/VALIDATION-TESTS.md`; header rewrite; per-test `**Modes:**` line replacing `**Tiers:**`; tool names in T-05/T-06 rewritten to the interim §2.2 names (S06) with a note that ARC-05's generated protocol supersedes them; new T-07; confirmation that the "Test Run History" and "Structural / Engine Integrity Runs" sections are gone (ARC-01-S10 already deleted them at import — lines 692–715 of the old file; the structural checks are now CI: S02, S07, S12) and removal of the "Regression Workflow" sentence that still tells the tester to "record the result in the Test Run History table"; a "Recording a run" paragraph (results go in the PR description or `docs/spikes/validation-runs/<date>.md`, never in this file); one complete execution. Out: new tests for `AUTHENTICATION_FAILED` (ARC-08-S10 adds T-19); live-mode execution of T-05/T-06 (needs ARC-06/ARC-07; recorded as ARC-09/ARC-10 gate).
**Design notes.**
- Header: "Run in a fresh `claude` session at the checkout root. Every test states the Mode(s) it applies to: `design-only` (no instance) and/or `live`. In `design-only`, MCP-dependent tests verify the *dormant* behaviour: the engine states that no live instance is configured and makes no tool call."
- `**Modes:**` mapping: T-01–T-04, T-08–T-18 → `design-only ✅ · live ✅`; T-05 (write gate) and T-06 (update-set capture) → `live ✅ · design-only: dormant variant` with the dormant expectation spelled out ("responds `Mode: design-only — no live instance; write approval is not applicable`; no MCP call in the transcript").
- **New T-07 — Mode reporting and the `/snowarch` skill in design-only**: Setup: design-only checkout (`.claude/settings.local.json` `{"disabledMcpjsonServers":["servicenow"]}`; before ARC-06 exists, written by hand; the S11 doctor stub at the root). Prompt 1: `Status`. Expected: the doctor's `Mode: design-only …` line quoted verbatim as the first line. Prompt 2: "Create an incident on the live instance for the outage." Expected: the engine states there is no live instance, proposes `/snowarch setup-instance`, and makes no MCP call; no specialist attempts one. Prompt 3: `/snowarch setup-instance`. Expected: the hand-off block (S11) with no credential request. Fail signals: any `mcp__servicenow__` call; a Mode claimed from memory; a password requested in chat.
- Tool names: T-05 expected-behaviour text keyed on "a tool of the `servicenow` server marked `mutates: true`" (no literal prefix — the rule file owns it); T-06 lists the interim §2.2 sequence with `snow_us_active_update_set_ensure`, `snow_core_records_query`, `snow_core_record_modify`/`record_add`, and the sentence "from ARC-04/ARC-05 the sequence is `snow_us_active_update_set_ensure → snow_us_capture_target_set → write → verify sys_update_xml`".
- The two gate tests keep their prompts and pass criteria byte-for-byte (they are the §6.2 and §1.1 acceptance tests referenced by `CLAUDE.md` today and by the ARC README).
- "Clean machine" before ARC-06: a fresh clone into an empty directory on a machine (or user account) that has never trusted the folder, `vendor/ServiceNowDocs` present (ARC-03 recipe or full submodule), the design-only toggle written by hand, no `~/.claude.json` entry for the folder. After ARC-06, the same run uses `./bootstrap.sh --mode design` and is repeated by ARC-09's release gate.
**Acceptance criteria.**
1. `test -f tests/VALIDATION-TESTS.md -a ! -e VALIDATION-TESTS.md`; `grep -c "Tier\|Claude.ai\|claude.ai" tests/VALIDATION-TESTS.md` = 0; `grep -c "Test Run History\|Integrity Runs" …` = 0; no line matches a date pattern `20[0-9]{2}-[0-9]{2}-[0-9]{2}` outside the header's "Last updated".
2. Eighteen `## T-NN` headings T-01…T-18, each with `**Modes:**`, `### Prompt` (or `### Setup`), `### Expected behaviour`, `### Pass criteria`, `### Fail signals`.
3. `grep -cwE "create_update_set|query_records|update_record|create_record|switch_update_set|execute_script|create_script_include|sync-agents-skills" tests/VALIDATION-TESTS.md` = 0.
4. T-07 is the Mode/skill test described above; T-01 and T-02 prompts and pass criteria are unchanged from the import tag (`git diff import/engine-v2.8.0-worktree -- VALIDATION-TESTS.md` restricted to those sections shows only the `Tiers→Modes` line and path tokens).
5. One full execution of T-01…T-18 in design-only mode on a clean macOS machine is recorded in `docs/spikes/validation-runs/2026-MM-DD-design-only.md` with per-test PASS and the CLI version; all 18 PASS (ARC README acceptance criterion 6); T-05/T-06 recorded as PASS on their dormant variant.
6. A second execution of the routing subset (T-01, T-02, T-03, T-04, T-10, T-14, T-15) on Windows (Git for Windows present) is recorded the same way — cross-platform check of the loaded texts.
**Tasks.** 1. `git mv VALIDATION-TESTS.md tests/`; update references (CLAUDE.md maintenance pointer, CONTRIBUTING). 2. Header and per-test edits; new T-07; confirm the two history sections are absent (ARC-01-S10) and fix the "Regression Workflow" pointer to them. 3. Prepare the clean design-only checkout. 4. Execute all 18; record. 5. Windows subset; record. 6. Any failure → open a rework item against the story that changed the relevant text (S03 descriptions, S04 agents, S08 CLAUDE.md), fix, re-run the failed tests.
**Test strategy.** Manual by definition (behavioural tests of the model's routing); CI checks criteria 1–4 in `tests/validation-tests-shape.test.mjs`. The run record is the evidence; it lives under `docs/spikes/validation-runs/` (dated files are allowed there, not in the test file).
**Dependencies.** S08 (CLAUDE.md final), S11 (`/snowarch` skill for T-07), S12 (names final). ARC-06 is *not* required (hand-written toggle), but the run is repeated by ARC-09's gate once it exists.
**Size.** M — the edits are half a day; one full 18-test execution with a fresh session per test is a day; the Windows subset half a day.
**Risks / open points.** A failure in T-03/T-04 after the description rewrites is the R-06 signal — the rework loop is budgeted in the size. Live-mode execution of T-05/T-06 is deferred to ARC-09/ARC-10 (noted in the README).
**Definition of done.** Merged; shape test green; run records committed; ARC README acceptance criteria 2 (skill listing, re-checked in the run) and 6 ticked; `docs/CONTRIBUTING.md` "When to run the validation tests" updated (any change to `CLAUDE.md`, `governance/`, a `SKILL.md` or an agent).

## Sizing summary

| Story | Size | Days |
|---|---|---|
| S01 | M | 1.5 |
| S02 | M | 1.5 |
| S03 | L | 4 |
| S04 | M | 1.5 |
| S05 | M | 2 |
| S06 | M | 1.5 |
| S07 | S | 0.5 |
| S08 | L | 3 |
| S09 | S | 0.5 |
| S10 | M | 1.5 |
| S11 | M | 2 |
| S12 | S | 1 |
| S13 | M | 2 |
| **Total** | | **≈ 22.5 engineer-days (range 20–28)** |

Critical path: S01 → S02 → S03 → S04 → S05 → S06 → S07 → S08 → S11 → S13, with S09/S10 in parallel after S06/S05 and S12 waiting on ARC-05. The ARC fits in about 4.5–6 weeks for one engineer; it does not exceed the six-week threshold. The long pole outside this ARC is ARC-05 (S12) — everything else can be finished before the contract tooling exists.
