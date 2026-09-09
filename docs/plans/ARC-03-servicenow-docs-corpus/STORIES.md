# ARC-03 — Stories

Status: Draft · Decisions applied: D-01…D-06, Q-A, Q-B, R-1…R-3 · Source: README.md of this ARC · Last updated: 2026-09-04

Conventions used below: the new repository is `farstic/ai-servicenow-architect` (D-01); the corpus lives at `vendor/ServiceNowDocs`; the CLI is `./snowarch` (`tools/snowarch/bin/snowarch.mjs`, zero-dependency Node ESM per `01` §3/§13); the first release is `2.0.0` (R-1); the project skill is `/snowarch` with sub-commands `status` · `setup-instance` · `doctor` (R-2). "Old engine" means `~/work/AI-Architect-Claude` (read-only source of truth for today's behaviour); line numbers refer to it.

**Invocation convention.** ARC-01 S05 leaves `tools/snowarch/bin` and `lib` empty ("Out: any content of `tools/snowarch/bin` or `lib` (ARC-06)"), and the root `./snowarch` / `snowarch.cmd` launchers are ARC-06 deliverables. ARC-06 depends on this ARC (B02), so this ARC cannot wait for ARC-06: **S05 creates the minimal `tools/snowarch/bin/snowarch.mjs` dispatcher** (a sub-command table with `docs` only; ARC-06 adds `bootstrap`, `mode`, `version` to the same table, never replaces the file). Every `./snowarch docs …` in the acceptance criteria below is shorthand for `node tools/snowarch/bin/snowarch.mjs docs …`, which is the form the tests and the CI workflows of this ARC use; the launcher form becomes valid once ARC-06 lands.

Facts measured on the old engine on 2026-09-04 and relied on by these stories:

- `.gitmodules` today: path `ServiceNowDocs`, url `https://github.com/ServiceNow/ServiceNowDocs.git`, `branch = australia`, no `shallow`. Superproject gitlink `0ba98cd…` (May); working tree at `ba513f2c62d3698ef5bfdd8044110226b8419689` (2026-07-09 "July refresh"). Upstream `refs/heads/australia` is already past the pin (`11b39be…` on 2026-09-04), so **the pin is not the branch tip** — every checkout recipe must fetch the pinned SHA by hash.
- `scripts/verify-citations.sh` (61 lines): scans `skills/` only with `grep -rhoE '(ServiceNowDocs/)?markdown/[A-Za-z0-9_./{},-]+'`, strips trailing `[).,;:]`, expands one `{a,b}` brace group, and **exits 0 with `SKIP:` when `ServiceNowDocs/markdown` is absent** (lines 23–26). Output today: `Citations checked: 175 | dead: 2 … FAIL`. **What "175" counts:** the script runs `sort -u` *before* stripping trailing punctuation, so 175 is the number of distinct raw strings (a path cited once as `…/x.md` and once as `…/x.md)` counts twice). Measured 2026-09-04 with the S02 grammar (strip `[]).,;:]+` and a trailing `/`, then unique): **161** distinct citation paths in `skills/` (399 occurrences), **163** across `skills/` + `agents/` + `CLAUDE.md` + `governance-rules.md` (the two extra are the bare `markdown/` root and `markdown/application-development/automated-test-framework-atf/`). The new gate's `checked` is the distinct-normalised number; no story or README may keep "175" as its expectation.
- The two dead citations are in `skills/licensing-specialist/SKILL.md` (lines 29, 39, 40, 65, 66) and `EXAMPLES.md` (lines 23, 54, 56): `markdown/it-asset-management/itam-subscrip-summary.md` and `markdown/it-asset-management/subscription-itam-licensing.md`. A **third** dead citation exists outside the scanned tree: `agents/now-assist-specialist.md:71` cites `ServiceNowDocs/markdown/now-assist/`, a directory that does not exist at `ba513f2`; the ARC README's illustrative "20 areas" list inherited that `now-assist` entry from `00` §3.10. Unique cited top-level areas from skills today: **19** (`servicenow-platform`, `application-development`, `platform-user-interface`, `customer-service-management`, `platform-security`, `it-service-management`, `it-business-management`, `it-operations-management`, `intelligent-experiences`, `platform-administration`, `build-workflows`, `it-asset-management`, `api-reference`, `now-intelligence`, `integrate-applications`, `governance-risk-compliance`, `now-platform`, `employee-service-management`, `core-business-suite`). 34 citations point at directories; 2 use brace form (`csdm-implement-{foundation,crawl,walk,run,fly}-stage.md`, `csdm-lifecy-tables-{tang-physical,intang-logical}.md`).
- `markdown/` at `ba513f2` has **55** top-level directories (`00` §3.10 says 54; nothing may hard-code the number). Longest file path inside the corpus is 197 characters relative to the corpus root: `markdown/platform-security/instance-security-hardening-settings/sc-limit-attachment-size-in-training-and-prediction-flows-for-graphql-enpoints-plugin-applicability-platform-document-intelligence.md` (in the cited `platform-security` area, so present in every sparse checkout). Under the `windows-latest` workspace prefix `D:\a\ai-servicenow-architect\ai-servicenow-architect\vendor\ServiceNowDocs\` (~70 characters) it exceeds `MAX_PATH` (260), so `core.longpaths` is required, not optional (`03` S-07). Stories S05 and S11 name this file in their assertions.
- `git sparse-checkout list` on a worktree whose sparse checkout is disabled does **not** print "disabled": on git 2.39.5 it exits 128 with `fatal: this worktree is not sparse` (measured 2026-09-04 in a scratch repo). Sparse state must therefore be read from `git config --get core.sparseCheckout` / `core.sparseCheckoutCone`, and `list` only called when `core.sparseCheckout` is `true`.
- The corpus ships `LICENSE` (Apache-2.0, "Copyright 2026 ServiceNow"), `README.md`, `legal/`, `llms.txt`. Cone sparse-checkout always materialises top-level files, so `LICENSE` is present in every sparse checkout.
- The old README "Step 8 — Monthly maintenance" (lines 479–500) is `git submodule update --remote ServiceNowDocs && git add ServiceNowDocs && git commit …` followed by manual skill edits — never executed (pin never moved after the initial import, `00` §3.10).

## Story map

| ID | Title | Size | Depends on | Delivers |
|---|---|---|---|---|
| ARC-03-S01 | Shallow submodule at `vendor/ServiceNowDocs`, pin re-seeded to `ba513f2`, pin recorded in `engine.config.json` with a pin-equals-gitlink lint | M | ARC-01 (layout, `engine.config.json` + schema) | `.gitmodules`, gitlink, `docs.pin`, `tests/docs-pin.test.mjs` |
| ARC-03-S02 | Citation scanner library, `scripts/gen-docs-areas.mjs` and generated `vendor/docs-areas.txt` with a CI staleness check | M | S01 | `tools/snowarch/lib/docs/citations.mjs`, `scripts/gen-docs-areas.mjs`, `vendor/docs-areas.txt`, CI step |
| ARC-03-S03 | Port `verify-citations.sh` to `tools/snowarch/lib/docs/verify.mjs`; brace and directory forms; missing corpus = FAIL | M | S02 | `verify.mjs`, `tests/citations.test.mjs`, `checked: n \| dead: m` output |
| ARC-03-S04 | Repair the dead citations (two in the licensing skill, one in the Now Assist agent) | S | S03, ARC-02 (canonical `.claude/` location) | 0 dead citations at `ba513f2` |
| ARC-03-S05 | `snowarch docs sync` — the checkout/reconcile recipe (sparse · full · skip), pinned-SHA fetch, Windows long paths; the Node-free launcher recipe text | L | S01, S02; ARC-00 S-07 verdict | `tools/snowarch/lib/docs/checkout.mjs`, the minimal `tools/snowarch/bin/snowarch.mjs` dispatcher (`docs` sub-command table; ARC-06 extends it), `docs sync`, documented git recipe for `bootstrap.sh`/`.ps1`, fixture tests |
| ARC-03-S06 | `snowarch docs verify` and `snowarch docs status`; the `docsStatus()` data shape consumed by the doctor and `/snowarch status` | M | S03, S05 | `docs verify`, `docs status [--json]`, `status.mjs` |
| ARC-03-S07 | `snowarch docs sync --upstream` — move the pin to the upstream tip, verify, print the dead-citation diff (maintainer) | M | S05, S06 | upstream refresh in one command; replaces old README Step 8 |
| ARC-03-S08 | `snowarch docs family <name> --dry-run\|--yes` — release-family switch with a printed edit plan and gateway-skill re-lint | M | S07 | `family.mjs`, edit plan, REVIEW list |
| ARC-03-S09 | `.github/workflows/docs-bump.yml` weekly PR with pin, verification output and newly dead citations | M | S07; ARC-01 CI skeleton | `docs-bump.yml`, `scripts/docs-bump.mjs`, PR body template |
| ARC-03-S10 | `NOTICE` attribution, the B02/`docs sync` attribution line, install-page attribution and size/time statement, `docs/ARCHITECTURE.md` corpus section | S | S05; ARC-01 (`LICENSE`/`NOTICE` files exist); ARC-00 S-07 numbers | attribution text in three places, architecture section |
| ARC-03-S11 | Windows long-path CI proof and `--docs skip` → doctor FAIL wiring (three-OS real-corpus job) | M | S05, S06; ARC-01 S11 `ci.yml` conventions (three-OS matrix, `@v4` action references); ARC-00 S13 (Windows PATH-stripping recipe, `spikes/windows-recipe.md`); ARC-00 S-07. ARC-08-S02 (E-12 rendering), ARC-09-S03 (release gate) and ARC-09-S08 (final cell placement) are *consumers*, not prerequisites | `windows-latest` real-corpus job, `docs-real.yml`, E-check inputs |

README titles → stories: README 1 → S01 · README 2 → S02 · README 3 → S03 · README 4 → S04 · README 5 (`sync|verify|status`) → **split** into S05 (sync = obtain/reconcile) and S06 (verify, status) because sync carries the S-07-dependent recipe and is the one piece ARC-06 and ARC-08 both call · README 6 → S08 · README 7 → S09 · README 8 → S10 · README 9 → **split** into S05 (the long-path handling itself, which is part of the recipe) and S11 (the CI proof and the size/time numbers). S07 is **added**: `01` §10 defines `docs sync` as the upstream refresh, while the README's remedies ("corpus missing — run …", "`--docs skip` yields a doctor FAIL with the sync remedy") need a local reconcile that never moves the pin; the two are separated as `docs sync` (local, user-safe) and `docs sync --upstream` (maintainer).

---

## Stories

### ARC-03-S01 — Shallow submodule at `vendor/ServiceNowDocs`, pin re-seeded to `ba513f2`, pin recorded in `engine.config.json` with a pin-equals-gitlink lint

**As** a maintainer **I want** the corpus registered once, at `vendor/ServiceNowDocs`, shallow by declaration, pinned to the July refresh, with the pin duplicated into `engine.config.json` and a lint that fails when the two diverge **so that** "Australia release" means exactly one commit on every machine and every tool reads the pin from one file.

**Context.** Closes the pin-drift half of P-11 (`00` §3.10: gitlink `0ba98cd` vs checkout `ba513f2`, never bumped since import). Implements `01` §10 bullets 1–2 and the ARC acceptance criterion "`engine.config.json.docs.pin` equals `git ls-tree HEAD vendor/ServiceNowDocs`; the lint fails when they differ". Decision DR-9 (`01` §18).

**Scope.** In: `.gitmodules`; the gitlink commit; `engine.config.json.docs`; the schema entry; `tests/docs-pin.test.mjs`; CI wiring of that test. Out: the checkout recipe (S05), the areas file (S02), any edit to skills, any `git submodule update` in CI (the lint reads `git ls-tree`, which needs no checkout).

**Design notes.**

- `.gitmodules` (LF, per `.gitattributes` from ARC-01):
  ```
  [submodule "vendor/ServiceNowDocs"]
  	path = vendor/ServiceNowDocs
  	url = https://github.com/ServiceNow/ServiceNowDocs.git
  	branch = australia
  	shallow = true
  ```
  `shallow = true` makes `git submodule update --init` clone with `--depth 1` without the flag (git `gitmodules(5)` `submodule.<name>.shallow`); the flag is still passed explicitly by S05 so the recipe does not depend on the user's git honouring the key.
- Gitlink: `git update-index --add --cacheinfo 160000,ba513f2c62d3698ef5bfdd8044110226b8419689,vendor/ServiceNowDocs` in the seed commit (no checkout required to commit a gitlink). The commit message carries `docs-pin: ba513f2c62d3698ef5bfdd8044110226b8419689` and the sentence "supersedes the never-bumped May gitlink 0ba98cd (00 §3.10)".
- `engine.config.json.docs` (shape owned by ARC-01; this story fills the values and adds `upstream`):
  ```json
  "docs": {
    "family": "australia",
    "pin": "ba513f2c62d3698ef5bfdd8044110226b8419689",
    "areasFile": "vendor/docs-areas.txt",
    "upstream": "https://github.com/ServiceNow/ServiceNowDocs.git"
  }
  ```
  `pin` is the **full 40-hex** SHA (schema: `^[0-9a-f]{40}$`); `family` is constrained by ARC-01 S04's schema **enum** `["australia","xanadu","yokohama","zurich"]` (ARC-01 STORIES S04 design notes — not a free-form pattern; S08 must add an EDIT line for `engine.config.schema.json` when the target family is outside the enum, as ARC-01's risk note already anticipates); `upstream` is a `format: uri` string that must equal the `.gitmodules` url (lint).
- ARC-01 S04 already ships `tests/engine-config.test.mjs` check (4): `git ls-files -s vendor/ServiceNowDocs` SHA equals `docs.pin`, reported as skipped "no gitlink yet (ARC-03)" until the gitlink exists. This story does **not** duplicate that check; adding the gitlink un-skips it. `tests/docs-pin.test.mjs` (node:test, stdlib only) adds only what ARC-01 does not cover: `git config -f .gitmodules --get submodule.vendor/ServiceNowDocs.{path,branch,shallow,url}` → path == `vendor/ServiceNowDocs`, branch == `docs.family`, shallow == `true`, url == `docs.upstream`; and it re-asserts pin == gitlink only to print the exact repair on mismatch: `engine.config.json docs.pin=<a> but gitlink=<b> — run: node scripts/docs-bump.mjs --to <b> (or edit docs.pin)`.
- Both tests run under `npm test` via ARC-01's `tests/run.mjs` (ARC-01 S05 defines `test`, not `lint`, as the runner of `tests/*.test.mjs`) and therefore in the `ci.yml` `test` job on all three OSes.

**Acceptance criteria.**

1. `git ls-tree HEAD vendor/ServiceNowDocs` prints `160000 commit ba513f2c62d3698ef5bfdd8044110226b8419689	vendor/ServiceNowDocs`.
2. `git config -f .gitmodules --get submodule.vendor/ServiceNowDocs.shallow` prints `true`; `…branch` prints `australia`.
3. `node --test tests/docs-pin.test.mjs` passes on a checkout **without** the submodule populated (only `git ls-tree` / `git config -f` are used); `node --test tests/engine-config.test.mjs` reports ARC-01's check (4) as passed, no longer skipped.
4. Given `engine.config.json.docs.pin` edited to any other 40-hex value, `tests/docs-pin.test.mjs` fails and its message contains both SHAs and the `docs-bump.mjs --to` repair line.
5. Given `docs.pin` set to a 7-character short SHA, `engine.config.schema.json` validation (ARC-01 test) fails with a pattern error naming `/docs/pin`.
6. `npm test` on `ubuntu-latest`, `macos-latest`, `windows-latest` includes both tests and is green.

**Tasks.**

1. Write `.gitmodules` with the four keys. ARC-01 S03 already drops the engine's root-path gitlink and `.gitmodules` at import (`git rm --cached -q ServiceNowDocs && git rm -q .gitmodules`, ARC-01 STORIES S03); this task keeps a guard — `git ls-files -s ServiceNowDocs` must print nothing — in case the import order changes.
2. Add the gitlink at the new path with `update-index --cacheinfo 160000,<sha>,vendor/ServiceNowDocs` (verified 2026-09-04 on git 2.39.5: succeeds without the commit object being present locally).
3. Fill `engine.config.json.docs` and extend `engine.config.schema.json` (`pin` pattern, `upstream` uri — the schema has `additionalProperties: false`, so the new key must be declared).
4. Write `tests/docs-pin.test.mjs`; it is picked up by `tests/run.mjs` under `npm test`.
5. Commit with the `docs-pin:` trailer.

**Test strategy.** Unit: the lint test itself (fast, no network, all OSes in CI). Manual: `git submodule status` after S05 shows `ba513f2…` with no `+` prefix.

**Dependencies.** ARC-01 stories for the layout, `engine.config.json` and schema, `.gitattributes`, `ci.yml` skeleton.

**Size.** M — a day for the seed commit and schema, a day for the lint and the CI wiring on Windows (path separators in `git ls-tree` output are forward slashes on all OSes, but the test must not assume a shell).

**Risks / open points.** If the import order changes and the old root-level `ServiceNowDocs` gitlink survives, both gitlinks present at once would double the checkout — task 1's guard catches it. The short-SHA convention (`ba513f2`) in prose stays; only machine-read fields carry 40 hex. `.gitmodules` and `vendor/docs-areas.txt` are covered by ARC-01 S07's first `.gitattributes` line (`* text=auto eol=lf`), so no extra attribute line is needed for LF.

**Definition of done.** Merged; lint green on the three-OS matrix; `docs/ARCHITECTURE.md` corpus section (S10) references the lint; ADR-lite note in the commit message.

---

### ARC-03-S02 — Citation scanner library, `scripts/gen-docs-areas.mjs` and generated `vendor/docs-areas.txt` with a CI staleness check

**As** the engine (Claude) and the bootstrap **I want** the list of top-level `markdown/<area>` directories the skills actually cite to be generated from the citations themselves **so that** the sparse checkout is never narrower than the grounding rule requires, and never widened by hand.

**Context.** Closes the "checked-out areas are hand-maintained or absent" half of P-11; implements `01` §3 (`vendor/docs-areas.txt` GENERATED) and §10 bullet 1; ARC acceptance criterion "`scripts/gen-docs-areas.mjs --check` fails in CI when a skill cites an area missing from `vendor/docs-areas.txt`". The scanner is shared with S03 so the generator and the verifier can never disagree on what a citation is.

**Scope.** In: `tools/snowarch/lib/docs/citations.mjs` (scanner), `scripts/gen-docs-areas.mjs` (`--check`, `--write`), `vendor/docs-areas.txt`, CI step, unit tests. Out: consulting the corpus (the generator must run on a checkout with no submodule — it is what B02 needs *before* the checkout); resolving citations (S03); editing skills.

**Design notes.**

- Scan roots (relative to repo root, in this order): `.claude/skills/**/*.md`, `.claude/agents/*.md`, `governance/**/*.md`, `docs/PLATFORM-NOTES.md`, `CLAUDE.md`. Roots that do not exist yet (ARC-02 in flight) are skipped with a note, never an error. The old script scanned `skills/` only (`verify-citations.sh:21`); widening to agents is what surfaces the third dead citation (S04).
- Citation grammar (`citations.mjs` `extract(text)`), kept byte-compatible with the bash regex: match `(?:vendor\/)?(?:ServiceNowDocs\/)?markdown\/[A-Za-z0-9_.\/{},-]+`; strip trailing `[).,;:]+` and a trailing `/`; normalise to `markdown/...`; expand exactly one `{a,b,…}` group (a second group or a nested brace → `CitationSyntaxError` naming file and line). Each result: `{ path, area, isDir: !path.endsWith('.md'), file, line, raw }`. `area` = second path segment; a bare `markdown` or `markdown/` citation yields `area: null` and a warning.
- `gen-docs-areas.mjs`: collects `area` values, sorts them, writes `vendor/docs-areas.txt` as one area per line, LF, no header, trailing newline (the launchers consume it with `$(cat …)` / `Get-Content`, so no comments). `--check` regenerates in memory, diffs against the file and exits `2` with `vendor/docs-areas.txt is stale: +<added> -<removed> — run: node scripts/gen-docs-areas.mjs --write` (an empty side is omitted, so a pure addition prints `+now-assist` only). Exactly one of `--check` / `--write` is required; with neither the script prints its usage and exits `2` (no TTY or `CI` sniffing — nothing platform-dependent decides what a maintainer command does).
- Expected first output: **20 lines**, and the twentieth is the point of this story. *(Amended 2026-09-08, measured. The design note predicted 19 and said `now-assist` "does not appear until a skill cites it" — but **an agent cites it**, `.claude/agents/now-assist-specialist.md:71` → `ServiceNowDocs/markdown/now-assist/`, and this story's own note says widening the scan to agents "is what surfaces the third dead citation". So the generated file has 20 areas including `now-assist`, which is **not a directory at `ba513f2`** — S-22's dead citation, now visible in a generated artefact rather than in prose. S04 repairs the citation and the file drops back to 19. This is the 19/20 reconciliation the README amendment of 2026-09-06 asked for: **19 real areas + 1 dead one, not a miscount.** `release-notes` is a real directory at the pin but is cited only by `README.md`, which is not a scan root — architect ruling of 2026-09-08, excluded.)*
- CI: `node scripts/gen-docs-areas.mjs --check` is added to the root `package.json` `lint` script next to ARC-02's `scripts/gen-roster.mjs --check` (same convention), so `ci.yml` runs it on the three OSes; the exit code and message are the failure signal.

**Acceptance criteria.**

1. On the seeded tree, `node scripts/gen-docs-areas.mjs --write` produces exactly 19 lines, sorted, ending with a newline, LF only — asserted on Windows CI with `node -e "process.exit(/\r/.test(require('fs').readFileSync('vendor/docs-areas.txt','utf8'))?1:0)"` (a Node one-liner rather than `file`/`grep`, because ARC-09 S08 runs the Windows cell without Git Bash on PATH).
2. Given a skill file with a citation to an area no skill or agent yet cites, `--check` exits **2** and names it. *(Amended 2026-09-08: the story's example — `markdown/now-assist/foo.md` — can no longer demonstrate this, because `now-assist` is **already** in the generated file (an agent cites it). Measured instead with `markdown/release-notes/foo.md`, which produces exactly `vendor/docs-areas.txt is stale: +release-notes — run: node scripts/gen-docs-areas.mjs --write`, and doubles as proof of why `release-notes` is absent today: only `README.md` cites it, and README is not a scan root.)*
3. Given the citation `markdown/servicenow-platform/x-{a,b}-y.md`, the scanner yields two `path` values and one `area`.
4. Given `markdown/servicenow-platform/x-{a,{b,c}}.md`, the scanner throws `CitationSyntaxError` with the file path and line number.
5. Given `(see markdown/platform-security/instance-security-hardening-settings/).`, the scanner yields `markdown/platform-security/instance-security-hardening-settings` with `isDir: true` and no trailing punctuation.
6. Both `ServiceNowDocs/markdown/a/b.md` and `vendor/ServiceNowDocs/markdown/a/b.md` normalise to `markdown/a/b.md`.
7. The generator succeeds on a checkout where `vendor/ServiceNowDocs` does not exist.
8. `--check` on a fresh clone with the committed file exits 0 and prints `vendor/docs-areas.txt up to date (19 areas)`.

**Tasks.**

1. Implement `citations.mjs` (`extract`, `scanRepo({root})`), stdlib only.
2. Implement `gen-docs-areas.mjs` with `--check` / `--write` (one required; usage + exit 2 otherwise).
3. Generate and commit `vendor/docs-areas.txt`.
4. `tests/citations-scan.test.mjs` covering criteria 3–6 with inline fixtures.
5. Add the `--check` step to `ci.yml` (`lint` job).

**Test strategy.** Unit (node:test, all OSes, no network). Integration: CI `--check` on every commit. Manual: none.

**Dependencies.** S01 (layout, config). ARC-02 decides the canonical `.claude/` location; until it lands the scanner also accepts the imported root `skills/` and `agents/` paths (a flag `--legacy-roots`, removed when ARC-02 closes).

**Size.** M — the grammar and its tests are the work; the generator is a page.

**Risks / open points.** Citations written in prose forms the regex does not catch (e.g. wrapped across lines) are silently not citations — same as today; a later story may add a `<!-- cite: -->` form. The 34 directory citations mean an area's *presence* is verifiable but a directory's *contents* are not — accepted (README "Out").

**Definition of done.** Merged; unit tests and the CI `--check` step green on three OSes; `docs/CONTRIBUTING.md` gains "when you add a citation, run `node scripts/gen-docs-areas.mjs --write`".

---

### ARC-03-S03 — Port `verify-citations.sh` to `tools/snowarch/lib/docs/verify.mjs`; brace and directory forms; missing corpus = FAIL

**As** a maintainer and CI **I want** the citation gate as a Node module that treats an absent corpus as a failure **so that** a fresh clone can never pass with every citation unverified (`00` §3.9: `verify-citations.sh:23-26` exits 0 on a missing submodule).

**Context.** Closes the "gate exits 0 when the corpus is missing" half of P-11; implements `01` §8 ("0 dead citations (absent corpus = FAIL, never SKIP)") and §13 (Node-only tooling); ARC acceptance criterion "`./snowarch docs verify` on a checkout without the submodule exits non-zero with 'corpus missing — run ./bootstrap.sh --docs' (never SKIP)". Retires the bash script and the pre-commit hook chain along with ARC-02 (P-37).

**Scope.** In: `verify.mjs` (library + result object), `tests/citations.test.mjs` with a fixture corpus, the `--allow-missing` escape hatch (used only by the CI `citations` job until S05 lands and by unit tests — it cannot serve a Node-free path, because without Node nothing can run this module; ARC-06's launchers print their own `citations: not verified until Node 20+ is installed` line, `01` §4.2 B02). Out: the CLI wrapper and output formatting for humans beyond the one summary line (S06); repairing citations (S04); the doctor check itself (ARC-08 wraps this module).

**Design notes.**

- `verify.mjs` exports `verifyCitations({ root, corpusDir = 'vendor/ServiceNowDocs', allowMissing = false })` → `{ status: 'ok'|'fail'|'missing', checked, dead: [{ path, file, line, member? }], areasMissing: [] }`. It uses S02's scanner; each expanded path is tested with `fs.existsSync(join(corpusDir, path))` — files and directories alike (`-e` semantics of the bash script).
- Missing corpus = `!existsSync(join(corpusDir, 'markdown'))`. Result `status: 'missing'`; the CLI (S06) exits `3` and prints exactly `corpus missing — run ./bootstrap.sh --docs sparse (or ./snowarch docs sync)`. With `allowMissing: true` the status is still `'missing'` but the exit code is 0 and the line reads `citations: not verified until the corpus is present`. There is no `SKIP` word anywhere in the output.
- Summary line format (consumed verbatim by ARC-08 and by the ARC acceptance criterion): `checked: <n> | dead: <m>` where `n` is the number of **distinct normalised citation paths before brace expansion** (161 in `skills/` today, 163 with the agents/CLAUDE.md/governance roots — see the facts block; the old "175" counted punctuation variants and is not the reference) and `m` counts citations with at least one missing member. Each dead entry prints as `DEAD <file>:<line> <path>` (`DEAD (brace member)` for a member), so the maintainer can jump to it.
- Exit codes (library returns them, CLI uses them): 0 ok · 1 dead citations · 3 corpus missing.
- Fixture corpus for tests: `tests/fixtures/docs-corpus/markdown/{alpha,beta}/…` (a dozen files, committed) plus fixture skill files; the real corpus is never required by unit tests.

**Acceptance criteria.**

1. On a checkout with the corpus at `ba513f2` after S04, `verifyCitations()` returns `status: 'ok'`, `checked ≥ 160` (163 expected with all S02 roots; the exact figure is recorded in the PR, never hard-coded in a test), `dead: []`.
2. On a checkout without `vendor/ServiceNowDocs/markdown`, the result is `status: 'missing'` and the CLI exit code is 3; the output contains `corpus missing — run ./bootstrap.sh --docs` and does not contain `SKIP`.
3. With `--allow-missing`, exit code 0 and the line `citations: not verified until the corpus is present`.
4. Given the fixture corpus and a fixture skill citing `markdown/alpha/x-{one,two}.md` where `two` is absent, the result has one dead entry with `member: 'two'` and `checked` counts the citation once.
5. Given a fixture directory citation `markdown/beta/` that exists, it is counted as checked and not dead; given `markdown/gamma/` that does not exist, it is dead.
6. On Windows CI the same tests pass (paths joined with `node:path`, never string-concatenated with `/`).

**Tasks.**

1. Implement `verify.mjs` on top of `citations.mjs`.
2. Build the fixture corpus and fixture skills under `tests/fixtures/`.
3. Write `tests/citations.test.mjs` (criteria 2–5).
4. Delete `scripts/verify-citations.sh` and its `.githooks/pre-commit` call from the imported tree (coordinate with ARC-02 S01, which deletes the whole hook chain and until then keeps the bash script runnable with `SCAN_DIR=.claude/skills` — its text names ARC-03-S03 (this story) as the deleting story; whichever lands second removes the leftover).

**Test strategy.** Unit with fixtures (three OSes). Integration: CI `citations` job (ARC-09 lists it) runs the real gate after S05's checkout; until S05 lands the job runs with `--allow-missing` and a TODO that S05 removes.

**Dependencies.** S02.

**Size.** M — the port is small; the fixture design and Windows path hygiene take the second day.

**Risks / open points.** A directory citation that exists but is empty passes — accepted. Case-insensitive filesystems (macOS default, Windows) may pass a citation whose case is wrong and Linux CI will then fail it — the CI matrix catches this; the story adds a `caseExact` check (`fs.realpathSync.native` comparison) as a WARN, not a FAIL.

**Definition of done.** Merged; tests green on the matrix; `docs/CONTRIBUTING.md` "citation gate" paragraph updated to name `./snowarch docs verify`; the bash script is gone from the tree.

---

### ARC-03-S04 — Repair the dead citations (two in the licensing skill, one in the Now Assist agent)

**As** the engine (Claude) **I want** every citation in the roster to resolve at the pin **so that** the licensing specialist and the Now Assist specialist ground their claims in files that exist.

**Context.** P-11 ("two citations are dead"); `01` §10 bullet 2 ("the two dead citations are remapped in the seed commit"); ARC acceptance criterion `dead: 0`. Widening the scan to `.claude/agents` (S02) surfaces a third.

**Scope.** In: the eight lines in `licensing-specialist/SKILL.md` and `EXAMPLES.md`; line 71 of `now-assist-specialist.md`; nothing else. Out: rewording the skills' substance; adding new citations; touching the other 24 skill files that mention "Australia" (S08's concern).

**Design notes.**

- Where the two dead paths are used today (`skills/licensing-specialist/SKILL.md`, measured 2026-09-04): line 29 lists **both** at the end of the "Software & SaaS entitlement (third-party)" citation list, after the two live directories `markdown/it-asset-management/software-asset-management/` and `markdown/it-asset-management/saas-license-management/`; line 39 cites `subscription-itam-licensing.md` for the App Engine footprint; line 40 cites `itam-subscrip-summary.md` for Now Assist consumption; lines 65–66 repeat the two in the anti-pattern table; `EXAMPLES.md` lines 23, 54, 56 mirror those uses.
- Dead → replacement (the implementer confirms by reading the target; the acceptance test is only "resolves and the sentence still makes the same claim"):
  - Line 29: drop the two dead entries from the list; the two live directories carry the third-party claim on their own (no replacement needed).
  - `markdown/it-asset-management/subscription-itam-licensing.md` ("App Engine footprint / subscription units of custom tables", lines 39, 65) → `markdown/platform-administration/addressing-issues-subscription-management-v2.md` (the only `*subscription*` page under `platform-administration` at `ba513f2` whose text mentions App Engine — `grep -il "app engine"`), or `markdown/platform-administration/types-subscription-v2.md` (exists at the pin) if the former reads as troubleshooting only.
  - `markdown/it-asset-management/itam-subscrip-summary.md` ("Now Assist Assists consumption", lines 40, 66) → `markdown/platform-administration/subscriptions-overview-v2.md` (mentions Now Assist six times at `ba513f2`), falling back to `markdown/platform-administration/subscription-management-reference-v2.md` (already cited by the same skill) if the overview does not describe Assists metering; the skill's sentence keeps "verify against the engagement's subscription".
  - `ServiceNowDocs/markdown/now-assist/` (agent, line 71) → `vendor/ServiceNowDocs/markdown/intelligent-experiences/` — the directory the `now-assist-genai` skill is grounded in (`skills/now-assist-genai/SKILL.md:3`). The same line's "using `WebFetch`" instruction stays as ARC-02 finds it (sub-agent tool lists are ARC-02's).
- The edit is made in whichever copy is canonical at the time (`.claude/skills/...` after ARC-02; the ARC-01 import otherwise), never in both.

**Acceptance criteria.**

1. `./snowarch docs verify` (or `verifyCitations()`) on the corpus at `ba513f2` prints `dead: 0`.
2. `grep -rn "itam-subscrip-summary\|subscription-itam-licensing\|markdown/now-assist" .claude governance docs CLAUDE.md` returns nothing.
3. The edited sentences in the licensing skill still name the same concept (third-party entitlement on line 29 via the two surviving directories; App Engine footprint; Assists consumption) — reviewed by the maintainer, recorded in the PR description as old → new per line.
4. `node scripts/gen-docs-areas.mjs --check` still passes (the replacements introduce no new area: `platform-administration` and `intelligent-experiences` are already cited).

**Tasks.**

1. Read the two candidate target pages; pick one per dead citation.
2. Edit the eight skill lines and the agent line.
3. Run verify, gen-docs-areas `--check`, the ARC-02 description-length lint.

**Test strategy.** The gate itself (CI `citations` job). Manual read of the replacement pages.

**Dependencies.** S03; the canonical location decision from ARC-02 (or the interim `--legacy-roots`).

**Size.** S — one sitting.

**Risks / open points.** If ARC-02 has not yet deduplicated `skills/` vs `.claude/skills/`, the fix must land in the copy the scanner reads and the mirror must be regenerated by the old sync script — avoid by sequencing after ARC-02 story that removes the mirrors.

**Definition of done.** Merged; `dead: 0` in CI; the PR lists old → new paths.

---

### ARC-03-S05 — `snowarch docs sync` — the checkout/reconcile recipe (sparse · full · skip), pinned-SHA fetch, Windows long paths; the Node-free launcher recipe text

> **Amendment 2026-09-08 — `sync` was delivered early, in ARC-03-S03.** The architect folded the corpus checkout into S03 so `sync` and `verify` could be reviewed together, and it is done: recipe C's five steps plus ADR-0008's repair step live in `tools/snowarch/lib/docs/sync.mjs`, invoked by `node scripts/docs.mjs sync`, measured at 2.1 s / 5-of-5 root files / HEAD at the pin / submodule initialised / 296 MB. **What remains for this story is therefore the rest of its scope, not the checkout** — the `--upstream` path, the pin bump and whatever else its text below assigns. Recorded here so a later reader does not see "S05" and assume the checkout is undone.

**As** an individual practitioner **I want** one idempotent command that makes `vendor/ServiceNowDocs` match the committed pin and the generated areas — from nothing, from a stale checkout, or from a wrong sparse set — in about a minute and about 300 MB **so that** bootstrap B02, the doctor's `--fix` and I all use the same, tested path.

**Context.** The dominant install cost in P-11 (616 MB / 48,991 files → measured 299 MB / 35,185 files / ~55 s, `00` §3.10). Implements `01` §4.2 B02 and §10 bullets 1 and 4; ARC acceptance criteria "fresh user … ≤ 350 MB containing every file cited", "`--docs full` yields the full checkout"; ARC risk "Windows long paths". Blocks ARC-06-S06 and the ARC-08-S06 `--fix` action "missing/unsparse docs → B02".

**Scope.** In: `tools/snowarch/lib/docs/checkout.mjs` (`syncDocs({ mode, root, config })`), the `docs sync` sub-command (local reconcile only — `--upstream` is S07), the equivalent **git-only** recipe text that ARC-06's `bootstrap.sh` / `bootstrap.ps1` execute when Node is absent, fixture-based tests, `core.longpaths` on Windows. Out: bootstrap step plumbing, `.local/bootstrap-state.json` writes and input hashes (ARC-06); doctor presentation (ARC-08); the upstream refresh (S07); on-demand fetching of single documents (README "Out").

**Design notes.**

- CLI: `./snowarch docs sync [--mode sparse|full] [--json] [--quiet]`; `--mode` defaults to the mode recorded in `.local/bootstrap-state.json.docs.mode` (written by ARC-06) or `sparse`. `--docs skip` is a bootstrap flag, not a sync mode: skip means "do not call sync"; the state file records `docs: { mode: "skip" }` and S06/S11 make the doctor FAIL on it.
- **Recipe — settled by S-07.** The module implements one of the two candidates below behind a single function; the ARC-00 S-07 verdict (recorded in ADR) picks it before this story starts, and the loser is not kept as an option:
  - **A — submodule, blobless:** `git submodule init -- vendor/ServiceNowDocs` → `git submodule update --init --depth 1 --filter=blob:none -- vendor/ServiceNowDocs` (the `--filter` option of `git submodule update` verified on git 2.39.5, `03` S-07) → `git -C vendor/ServiceNowDocs sparse-checkout set --cone <areas…>`. Blob fetching then happens lazily for the cone only.
  - **B — direct sparse clone absorbed as submodule:** `git clone --filter=blob:none --no-checkout --depth 1 --sparse --branch <family> <upstream> vendor/ServiceNowDocs` → `sparse-checkout set --cone <areas…>` → `git -C vendor/ServiceNowDocs fetch --depth 1 origin <pin>` → `checkout <pin>` → `git submodule absorbgitdirs vendor/ServiceNowDocs` (the recipe that produced the 299 MB / 55 s measurement, `03` S-07).
  - Either way the module must handle **pin ≠ branch tip**: after the shallow clone, `git -C vendor/ServiceNowDocs cat-file -e <pin>^{commit}` decides whether `git fetch --depth 1 origin <pin>` is needed (GitHub serves reachable SHAs by hash — S-07 confirms), then `git checkout --detach <pin>` (if candidate A's `submodule update` has not already done so).
  - Full mode: same clone, then `git -C vendor/ServiceNowDocs sparse-checkout disable`. Switching sparse → full or full → sparse on an existing checkout is just `sparse-checkout disable` / `set --cone …` again (no re-clone).
  - Reconcile on an existing checkout: `git -C vendor/ServiceNowDocs rev-parse HEAD` ≠ pin → fetch by hash + checkout; `git sparse-checkout list` ≠ areas file → `set --cone` again; a non-cone or pattern-mode sparse config → `sparse-checkout init --cone` then `set`. A dirty working tree inside the submodule (user edited a doc) is refused with `vendor/ServiceNowDocs has local changes — commit, stash or discard them, then re-run` (never `--force`).
- **Windows:** on `process.platform === 'win32'` every git call carries `-c core.longpaths=true` and, once the submodule exists, `git -C vendor/ServiceNowDocs config core.longpaths true` is set so later plain `git` commands (and Claude Code's Bash tool) also work; the longest corpus path (197 chars) plus a typical checkout prefix exceeds 260 (`03` S-07 verifies the setting suffices).
- Progress and output: one line per phase, e.g. `[docs] clone (depth 1, blobless) … 31 s`, `[docs] sparse set (19 areas) … 12 s`, `[docs] pin ba513f2 checked out`, `[docs] 34,352 files · 231 MB working tree · 61 MB .git`; then the attribution line from S10; then S03's verify summary when Node is present (`docs sync` is Node, so always). `--json` prints the S06 `docsStatus()` object.
- Failure mapping (our output strings are exact; R-3 requires DNS, TLS-CA and proxy to be told apart, and this is the first network call of the install). The matched substrings are libcurl's as surfaced by `git` on stderr and are matched case-insensitively; the table is confirmed and extended from the real-run transcripts S-07 records (fixture tests use `file://` URLs and cannot produce them), so the *classification* is a unit test and the *substrings* are an S-07 deliverable:
  - `Could not resolve host` with no `HTTPS_PROXY`/`https_proxy` set → exit 5, `cannot reach github.com (DNS) — check your network and re-run`;
  - `Could not resolve proxy` or `Failed to connect to <proxyhost>` while `HTTPS_PROXY`/`https_proxy` is set → exit 5, `cannot reach proxy <host:port> (HTTPS_PROXY) — fix the proxy address, or unset HTTPS_PROXY / add github.com to NO_PROXY, and re-run` (the proxy URL is printed with any `user:password@` part replaced by `***@`);
  - `SSL certificate problem` → exit 5, `TLS interception detected — set GIT_SSL_CAINFO (or git config http.sslCAInfo) to your corporate CA bundle and re-run; the MCP server needs the same bundle via NODE_EXTRA_CA_CERTS (docs/TROUBLESHOOTING.md)`;
  - the pin SHA fetch refused / `fatal: … not our ref …` / `couldn't find remote ref` for the SHA → exit 5, `pin ba513f2 not fetchable from upstream (force-push or history rewrite?) — maintainer: run ./snowarch docs sync --upstream`;
  - `No space left on device` → exit 5, `insufficient disk space: need ~400 MB free (~700 MB for --mode full)`;
  - anything else → exit 5, `git failed: <first stderr line>` (never swallowed).
- **Launcher recipe (ARC-06 executes it; ARC-03 owns the text).** Documented in `docs/ARCHITECTURE.md` as the *only* git-only sequence, for the bash-3.2 and PowerShell-5.1 launchers when Node is absent; it must equal what `checkout.mjs` runs (a test in S11 diffs the two command lists from a `--print-recipe` flag). The launcher then checks only that each line of `vendor/docs-areas.txt` exists as a directory under `markdown/` and prints `citations: not verified until Node 20+ is installed` (`01` §4.2 B02 row).
- The user-facing size/time statement in the install page comes from S-07 (S10/S11), never from this story's prose.

**Acceptance criteria.**

1. On a clean macOS 14 machine with git 2.39 and no `vendor/ServiceNowDocs` directory, `./snowarch docs sync` completes without prompts; afterwards `git submodule status` shows ` ba513f2c62d3698ef5bfdd8044110226b8419689 vendor/ServiceNowDocs` (no `-`/`+` prefix), `git -C vendor/ServiceNowDocs sparse-checkout list` equals the areas file, `du -sm vendor/ServiceNowDocs` ≤ 350, and `./snowarch docs verify` prints `dead: 0`.
2. Running the same command a second time changes nothing and finishes in < 5 s, printing `[docs] up to date (pin ba513f2, sparse, 19 areas)`.
3. Given `vendor/ServiceNowDocs` checked out at a different commit (fixture: `git -C … checkout HEAD~1` on the fixture corpus), sync fetches by hash and returns HEAD to the pin.
4. Given the sparse set manually narrowed to one area, sync restores all 19 and the removed files reappear.
5. `./snowarch docs sync --mode full` on a sparse checkout yields every top-level `markdown/` directory present (55 at `ba513f2`) and `git -C vendor/ServiceNowDocs config --get core.sparseCheckout` prints nothing or `false` (never call `sparse-checkout list` here — on git 2.39.5 it exits 128 with `fatal: this worktree is not sparse` once sparse checkout is disabled, see the facts block); `--mode sparse` afterwards narrows it back without re-cloning (`.git` unchanged size ± 1 MB) and `core.sparseCheckout` is `true` again.
6. Given local modifications inside the submodule, sync exits 4 with the "local changes" message and touches nothing.
7. On `windows-latest` (native PowerShell, no Git Bash on PATH), `node tools\snowarch\bin\snowarch.mjs docs sync` succeeds (the `.\snowarch.cmd` launcher form becomes valid once ARC-06 lands — see the invocation convention above) and `git -C vendor/ServiceNowDocs config core.longpaths` prints `true`; the 197-character file exists on disk (`Test-Path`).
8. With `HTTPS_PROXY=http://user:pw@127.0.0.1:9` (a closed port), the output contains `cannot reach proxy 127.0.0.1:9 (HTTPS_PROXY)` and the `NO_PROXY` remedy, never the DNS message, never the string `pw`; exit code 5. With `HTTPS_PROXY` unset and `SNOWARCH_DOCS_UPSTREAM=https://nonexistent.invalid/x.git`, the output contains `cannot reach nonexistent.invalid (DNS)` (the host is taken from the upstream URL in use, so the production message reads `cannot reach github.com (DNS)`); exit code 5. Both runs leave `vendor/` untouched.
9. `./snowarch docs sync --print-recipe --mode sparse` prints the exact git command list (one per line, no Node), byte-identical to the block embedded in `docs/ARCHITECTURE.md` (test in S11).

**Tasks.**

1. Wait for / read the S-07 ADR; implement the chosen candidate in `checkout.mjs` with a `runGit()` helper that injects `-c core.longpaths=true` on win32 and maps the error strings.
2. Implement reconcile logic (pin, sparse set, mode switch, dirty-tree refusal).
3. Implement `--print-recipe` and paste its output into `docs/ARCHITECTURE.md` (S10 owns the section; this story adds the block).
4. Build a **local fixture upstream**: a test creates a bare git repo with two commits and `markdown/{alpha,beta,gamma}/` so the whole recipe (clone, sparse, pin-by-hash, mode switch, dirty refusal) runs in CI in seconds with `file://` URLs; parametrise `docs.upstream` through an env override `SNOWARCH_DOCS_UPSTREAM` used only by tests.
5. Wire the `docs sync` sub-command in `bin/snowarch.mjs`.
6. Hand the recipe block to ARC-06 (link in their story 6).

**Test strategy.** Unit/integration against the fixture upstream on all three OSes (fast). Real-corpus end-to-end: the weekly `docs-real.yml` job from S11 and a manual run on the reference macOS machine with `time` and `du` recorded in the PR. Windows manual run once on the ARC-00 VM before merge.

**Dependencies.** S01, S02; ARC-00 S-07 verdict (recipe choice, long-path confirmation, pin-by-hash confirmation). Blocks ARC-06-S06, ARC-08-S06 (`--fix`).

**Size.** L — the recipe is five git commands, but reconcile paths, error mapping, the fixture upstream and Windows verification are four to five days.

**Risks / open points.** If S-07 shows candidate A cannot fetch a non-tip pin at depth 1 on some git versions, candidate B is used and `absorbgitdirs` becomes load-bearing — both are in `03` S-07's plan. `git` < 2.25 lacks cone mode; B00 (ARC-06) enforces the floor before B02 ever runs. Upstream force-push: covered by the "pin not fetchable" message and S07/S09.

**Definition of done.** Merged; fixture tests green on the matrix; recipe block in `docs/ARCHITECTURE.md`; ARC-06-S06 and ARC-08-S06 reference `syncDocs()`; the measured size/time from the real run recorded in the PR for S10/S11.

---

### ARC-03-S06 — `snowarch docs verify` and `snowarch docs status`; the `docsStatus()` data shape consumed by the doctor and `/snowarch status`

**As** an individual practitioner and the doctor **I want** `./snowarch docs verify` to run the citation gate and `./snowarch docs status` to tell me in one screen whether my corpus is present, pinned, on the right family, correctly sparse and fully cited **so that** the doctor (ARC-08) and the `/snowarch status` skill (ARC-02/ARC-08) quote one source instead of re-deriving it.

**Context.** ARC acceptance criteria "`./snowarch docs verify` reports `checked: ≥ 160 | dead: 0`" (163 measured 2026-09-04 with the S02 grammar and all scan roots — the old "175" counted punctuation variants, see the facts block) and "on a checkout without the submodule exits non-zero … the doctor shows FAIL"; `01` §8 engine checks (present, HEAD == pin, branch == family, sparse set == areas file, 0 dead citations) — those checks are *wrapped* by ARC-08, *computed* here.

**Scope.** In: `tools/snowarch/lib/docs/status.mjs` exporting `docsStatus({ root, verify = true })`; the two sub-commands with `--json`; exit-code contract. Out: the doctor's check ids, severities and `--fix` invocation (ARC-08); the SessionStart banner (ARC-08); fetching from upstream (`docs status` never touches the network unless `--fetch`, S07).

**Design notes.**

- `docsStatus()` returns:
  ```json
  { "present": true, "path": "vendor/ServiceNowDocs",
    "pin": "ba513f2c62…", "gitlink": "ba513f2c62…", "head": "ba513f2c62…",
    "pinMatchesGitlink": true, "headMatchesPin": true,
    "family": "australia", "branch": "australia", "familyMatches": true,
    "sparse": "cone", "areasExpected": ["…19"], "areasPresent": ["…19"], "areasMissing": [],
    "mode": "sparse", "fileCount": 34352, "sizeBytes": 242000000,
    "citations": { "status": "ok", "checked": 163, "dead": [] },
    "longpaths": null, "schema": 1 }
  ```
  `sparse` ∈ `cone` | `full` | `pattern` (legacy non-cone → treated as wrong) | `none` (absent). `mode` comes from `.local/bootstrap-state.json` when present (`sparse`/`full`/`skip`), else inferred. `longpaths` is `true`/`false` on win32, `null` elsewhere. `citations` is the S03 result object when `verify: true` (the default) and `null` when `verify: false` — the key is always present; ARC-08's `--quick` path and the SessionStart banner call `docsStatus({ verify: false })` and therefore never carry a citations figure (ARC-08 E-16 is excluded from `--quick`). `fileCount`/`sizeBytes` are computed only when `--json` or `--verbose` asks (a 35k-file walk costs ~1 s; the doctor's `--quick` path must skip it).
- `docs status` human output (exact layout, one line per fact, the doctor reuses the wording):
  ```
  docs corpus: vendor/ServiceNowDocs
    pin        ba513f2 (2026-07-09 July refresh)  gitlink ba513f2  HEAD ba513f2   ok
    family     australia  branch australia                                       ok
    checkout   sparse (cone), 19/19 areas, 34,352 files, 231 MB                  ok
    citations  checked: 163 | dead: 0                                             ok
  ```
  Divergences print `MISMATCH` / `MISSING` in the last column with the remedy on the next line (`run ./snowarch docs sync`, or for pin ≠ gitlink `maintainer: node scripts/docs-bump.mjs --to <gitlink>`). Absent corpus prints a single block: `docs corpus: MISSING — run ./bootstrap.sh --docs sparse (or ./snowarch docs sync)` and exits 3.
- `docs verify [--allow-missing] [--json]` prints S03's per-dead lines and the summary `checked: n | dead: m`; exit codes 0/1/3 from S03.
- Exit codes for `docs status`: 0 all ok · 1 any mismatch · 3 missing. `--json` always exits 0 unless the command itself failed, so callers read the object.
- The `/snowarch status` skill (ARC-02/ARC-08) prints the `pin` line from `./snowarch doctor --quick --json`, which embeds this object (`verify: false`, so `citations: null`) under `engine.docs`; the citations line is available only from a non-quick doctor run or `./snowarch docs verify` (ARC-08 owns which run the skill quotes).

**Acceptance criteria.**

1. After S05 on the reference machine, `./snowarch docs status` prints four `ok` lines and exits 0; `./snowarch docs verify` prints `checked: <n ≥ 160> | dead: 0` and exits 0 (163 expected at `ba513f2` with the S02 roots; the exact figure is recorded in the PR, never hard-coded in a test — an `n ≥ 175` expectation would fail by construction, since 175 was the old script's punctuation-variant count).
2. On a checkout without the submodule, `./snowarch docs verify` exits 3 and prints the line containing `corpus missing — run ./bootstrap.sh --docs`; `./snowarch docs status` exits 3 with `docs corpus: MISSING`.
3. Given the submodule HEAD moved off the pin, `docs status` prints `HEAD <sha>   MISMATCH` and `run ./snowarch docs sync`, exits 1.
4. Given `engine.config.json.docs.pin` ≠ gitlink, `docs status` prints `MISMATCH` on the pin line with the `docs-bump.mjs --to` remedy (same text as S01's lint).
5. Given a sparse set missing one area, the checkout line reads `18/19 areas` with `MISMATCH` and lists the missing area.
6. `./snowarch docs status --json | node -e "JSON.parse(require('fs').readFileSync(0))"` succeeds and the object has every key in the shape above.
7. `docsStatus({ verify: false })` completes in < 300 ms on the reference machine (the SessionStart hook budget in `01` §8).

**Tasks.**

1. Implement `status.mjs` (git queries via `child_process.execFileSync`, no shell).
2. Implement the two sub-commands and the table renderer.
3. `tests/docs-status.test.mjs` on the fixture corpus from S05 (criteria 3–6).
4. Publish the JSON shape in `docs/ARCHITECTURE.md` (S10 section) as the contract with ARC-08.

**Test strategy.** Unit on fixtures (matrix). Manual: run on the reference machine after S05 and paste the screen into the PR.

**Dependencies.** S03, S05.

**Size.** M — a day for the status object, a day for rendering, tests and the timing budget.

**Risks / open points.** ARC-08 may want additional fields (e.g. `lastSyncAt`); the object is versioned with `"schema": 1` so additions are non-breaking.

**Definition of done.** Merged; tests green; JSON shape documented; ARC-08's E-check story references `docsStatus()`.

---

### ARC-03-S07 — `snowarch docs sync --upstream` — move the pin to the upstream tip, verify, print the dead-citation diff (maintainer)

**As** a maintainer **I want** one command that fetches the family branch, moves the gitlink and `engine.config.json.docs.pin` to its tip (or to a SHA I name), re-runs the citation gate and shows me which citations *became* dead **so that** the monthly refresh is a five-minute review instead of the never-executed README Step 8.

**Context.** P-11 ("pin drifted May → July without a commit"); `01` §10 bullet 3 (`docs sync` = fetch upstream, move gitlink, re-run gate, print diff — "one operation replacing README Step 8"); ARC risk "upstream force-pushes or branch renames … the bump workflow fails loudly, never auto-merges". Named `--upstream` here because the flag-less `docs sync` (S05) is the user-safe local reconcile.

**Scope.** In: `--upstream [--to <sha>] [--json] [--no-verify]`; the diff of dead citations before/after; staging (not committing) the three changes; refusal on a dirty tree. Out: opening the PR (S09); editing skills (never automatic); switching family (S08).

**Design notes.**

- Sequence: refuse if `git status --porcelain` is non-empty outside `vendor/` → `git -C vendor/ServiceNowDocs fetch --depth 1 origin <family>` (or `--to <sha>`: `fetch --depth 1 origin <sha>`) → resolve target SHA → run `verifyCitations()` at the current pin (baseline) → `git -C vendor/ServiceNowDocs checkout --detach <target>` (sparse set unchanged) → run `verifyCitations()` again → write `engine.config.json.docs.pin` (preserving formatting: read, replace the string, write) → `git add engine.config.json vendor/ServiceNowDocs` → print the report. Nothing is committed; `--json` emits `{ from, to, upstreamDate, checkedBefore, checkedAfter, newlyDead: [], healed: [] }`.
- Report (exact headings, reused verbatim as the PR body by S09):
  ```
  docs pin: ba513f2 (2026-07-09) → 11b39be (2026-08-27)
  citations: checked: 163 | dead: 0 → checked: 163 | dead: 2
  newly dead (2):
    DEAD .claude/skills/itsm-specialist/SKILL.md:41 markdown/it-service-management/…
    …
  healed (0)
  staged: engine.config.json, vendor/ServiceNowDocs — review, then: git commit -m "chore(docs): bump ServiceNowDocs to 11b39be"
  ```
  If `newlyDead` is non-empty the exit code is 1 (so S09 marks the PR "needs remap") but the staging still happens — the maintainer needs the moved pin to repair the citations.
- Branch rename / disappearance: `fetch` failing with `couldn't find remote ref <family>` → exit 6 with `upstream branch '<family>' not found — the release family may have moved; run ./snowarch docs family <name> --dry-run`. `--to <sha>` whose fetch by hash is refused → exit 6 with `sha <sha> not fetchable from upstream — is it reachable from branch '<family>'?` and nothing moved. A force-push that makes the *current* pin unreachable is irrelevant here (we move forward), but the message from S05 applies to users.
- Never touches `vendor/docs-areas.txt`; if the new tip removed a cited *area*, that shows up as dead citations, which is the correct signal.

**Acceptance criteria.**

1. On a clean tree, `./snowarch docs sync --upstream` against the fixture upstream (S05) whose branch tip is one commit ahead of the pin: HEAD of the submodule equals the tip, `engine.config.json.docs.pin` equals the tip, `git diff --cached --name-only` lists exactly `engine.config.json` and `vendor/ServiceNowDocs`, no commit was created.
2. With the fixture tip deleting a cited file, the report lists it under `newly dead (1)` with file:line and the exit code is 1; the pin is still moved and staged.
3. `--to <sha>` with a SHA reachable from the branch moves to that SHA; with an unreachable SHA exits 6 with `sha <sha> not fetchable from upstream`, `git status --porcelain` is unchanged and the submodule HEAD is still the pin.
4. With a dirty tree (an unrelated modified file), the command exits 4 with `working tree not clean — commit or stash first` before any network call.
5. With `docs.family` set to a branch that does not exist upstream, exit 6 with the "upstream branch … not found" message naming `docs family`.
6. After the command, `./snowarch docs status` shows `pin … gitlink … ok` (the staged gitlink is read from the index, not HEAD, when it differs — the status line notes `(staged)`).

**Tasks.**

1. Add `--upstream` handling to the `docs sync` command; factor `movePin({ to })`.
2. Baseline/after verify and the diff computation.
3. `engine.config.json` string-preserving writer.
4. Fixture tests for criteria 1–5 (extend the S05 fixture upstream with a third commit that deletes a file).
5. Delete the old README Step 8 text from the imported `docs/`; `docs/CONTRIBUTING.md` gains "Refreshing the corpus" (five lines: run, review the report, remap, commit, push).

**Test strategy.** Fixture integration tests (matrix). Manual real run once against GitHub on the reference machine (the 2026-09-04 upstream tip is already ahead of the pin, so the run is meaningful) — output pasted into the PR, no commit pushed.

**Dependencies.** S05, S06.

**Size.** M — two days including the string-preserving config writer and the diff.

**Risks / open points.** The move is staged, not committed, so a maintainer who forgets to commit ends up with `docs status` warning `(staged)` — acceptable and visible.

**Definition of done.** Merged; tests green; `docs/CONTRIBUTING.md` section present; old Step 8 text gone.

---

### ARC-03-S08 — `snowarch docs family <name> --dry-run|--yes` — release-family switch with a printed edit plan and gateway-skill re-lint

**As** a maintainer **I want** to switch the corpus from `australia` to the next release family (`zurich` today's candidate; upstream branches as fetched by the old engine's submodule remote on 2026-09-04 — `git -C ServiceNowDocs for-each-ref refs/remotes`: australia, xanadu, yokohama, zurich, main, mobile, nofamily, other, store; only the first four are release families, matching ARC-01 S04's schema enum) with a printed, reviewable plan of every file edit **so that** the five gateway skills that hard-code "Australia" and the config never disagree with the checked-out corpus.

**Context.** ARC acceptance criterion "`./snowarch docs family zurich --dry-run` prints the exact edits it would make (gitmodules branch, config, gateway skill sentences) and refuses without `--yes`"; `01` §10 bullet 3 ("a maintainer action"); ARC risk "branch renames". Design principle 10 (Propose → Review → Apply, `01` §2) applies to this maintainer configuration step exactly as it does to the wizard: the dry run *is* the proposal, `--yes` is the apply.

**Scope.** In: `tools/snowarch/lib/docs/family.mjs`; edits to `.gitmodules` (`branch`), `engine.config.json.docs.family`, and skill/agent prose lines matching a fixed phrase set; a REVIEW list for lines it will not auto-edit; a re-sync to the new branch tip via S07 and a verify. Out: rewriting skill *content* for platform changes between families (a human task, listed as REVIEW); moving the pin without `--yes`.

**Design notes.**

- Family name validation: `^[a-z][a-z0-9-]*$`, must exist upstream (`git ls-remote --heads <upstream> <name>`; the command needs network even in dry run and says so). If `<name>` is not in the `docs.family` enum of `engine.config.schema.json` (ARC-01 S04: `australia`, `xanadu`, `yokohama`, `zurich`), the plan carries one more line — `EDIT engine.config.schema.json: docs.family enum + "<name>"` — and `--yes` applies it before writing the config, so the ARC-01 schema test stays green.
- Phrase set (case-sensitive; `Old` = current family capitalised, `New` = target capitalised): `ServiceNowDocs Old branch`, `Old branch`, `Old release family`, `(Old branch)`, `Old release` when followed by `family`/`)`/`.`. Lines matching exactly these forms are auto-edited. Any other line containing `Old` (e.g. `NOT available in Australia release`, `Australia ships CSDM v5`, delta notes) is listed under `REVIEW (not edited)` with file:line — 26 skill files mention "Australia" today; the five gateway skills carry 6–8 mentions each, most of them the auto-editable form in the frontmatter `description` and the "Grounded in" line.
- Dry-run output (exact structure):
  ```
  docs family: australia → zurich
  upstream branch zurich: found (tip e8cdeed, 2026-08-30)
  EDIT .gitmodules: branch = australia → branch = zurich
  EDIT engine.config.json: docs.family "australia" → "zurich"
  EDIT .claude/skills/itsm-specialist/SKILL.md:3  "…ServiceNowDocs Australia branch…" → "…ServiceNowDocs Zurich branch…"
  … (n EDIT lines)
  REVIEW (not edited) .claude/skills/csm-specialist/SKILL.md:88  "sn_customerservice_escalation … NOT available in Australia release"
  … 
  THEN: ./snowarch docs sync --upstream (moves the pin to zurich tip), ./snowarch docs verify, ARC-02 description-length lint
  dry run — nothing changed. Re-run with --yes to apply.
  ```
  Without `--dry-run` and without `--yes` the command prints the same plan and exits 2 with `refusing to apply without --yes`.
- `--yes`: applies the EDIT lines, runs S07's `movePin` against the new branch, runs verify and the ARC-02 lints, stages everything, commits nothing, prints the S07 report plus `REVIEW` list again. The descriptions must stay ≤ 500 chars after substitution (a longer family name could push one over; the lint catches it and the command reports it).
- `--from <name>` overrides the detected current family (for repairing a half-done switch).

**Acceptance criteria.**

1. `./snowarch docs family zurich --dry-run` on the seeded tree prints the two config EDIT lines, at least one EDIT line per gateway skill (`itsm`, `csm`, `hrsd`, `itom-discovery`, `cmdb-csdm`), a non-empty REVIEW list, and the closing `dry run — nothing changed.`; `git status --porcelain` is empty afterwards.
2. `./snowarch docs family zurich` (no flag) prints the plan and exits 2 with `refusing to apply without --yes`; nothing changes.
3. `./snowarch docs family nosuchfamily --dry-run` exits 6 with `upstream branch 'nosuchfamily' not found`.
4. On the fixture upstream (branches `australia`, `zurich`), `--yes` results in `.gitmodules` branch `zurich`, `docs.family` `zurich`, the submodule HEAD at the zurich tip, the pin updated, the EDIT lines applied byte-for-byte as printed, and everything staged.
5. After `--yes`, `node scripts/gen-docs-areas.mjs --check` and the ARC-02 description-length lint pass, or the command's exit code is 1 and the failing lint is named.
6. Running `--yes` twice is idempotent (second run: `already on zurich — nothing to do`).

**Tasks.**

1. Implement family detection, upstream check, plan builder (EDIT vs REVIEW classifier).
2. Implement apply with S07's `movePin` and lint calls.
3. Fixture tests (fixture skills containing both auto-editable and REVIEW forms; fixture upstream with two branches).
4. `docs/CONTRIBUTING.md` "Switching release family" section, including the manual REVIEW pass and the delta-notes folders (`markdown/delta-<new>-<old>/` exist upstream per family).

**Test strategy.** Fixture tests on the matrix; one manual dry run against GitHub (`zurich` exists upstream on 2026-09-04) pasted into the PR.

**Dependencies.** S07; ARC-02's canonical skill location and description-length lint.

**Size.** M — two to three days; the classifier and its tests are the bulk.

**Risks / open points.** Family switches also change platform facts inside skills (e.g. table availability); the REVIEW list makes the human task explicit but cannot do it. A family whose branch is force-rewritten upstream is handled by S07's messages.

**Definition of done.** Merged; tests green; CONTRIBUTING section present; the ARC acceptance criterion's dry-run transcript stored under `docs/validation/`.

---

### ARC-03-S09 — `.github/workflows/docs-bump.yml` weekly PR with pin, verification output and newly dead citations

**As** a maintainer **I want** a weekly workflow that runs the upstream refresh and opens (or updates) one pull request carrying the new pin, the verification output and the list of newly dead citations **so that** corpus drift is reviewed on a schedule and never auto-merged.

**Context.** P-11 ("monthly bump ritual never executed"); `01` §10 bullet 3 and §11 ("a scheduled job re-verifies citations against the docs pin"); ARC acceptance criterion "opened at least one PR in a dry run containing the new pin, the verification output and the list of newly dead citations (if any)"; ARC risk "the bump workflow fails loudly, never auto-merges".

**Scope.** In: `docs-bump.yml` (schedule + `workflow_dispatch`), `scripts/docs-bump.mjs` (thin wrapper around S07 producing the PR body), the PR branch naming, idempotent update of an existing PR, the "nothing to do" path. Out: auto-merge; editing skills; any secret beyond `GITHUB_TOKEN`.

**Design notes.**

- Trigger: `schedule: cron: '17 5 * * 1'` (Mondays 05:17 UTC) and `workflow_dispatch` with input `to` (optional SHA) and `dry_run` (boolean, default false — when true the job prints the PR body to the log and opens nothing; this is the "dry run" of the acceptance criterion).
- Job steps (`ubuntu-latest`, Node 22, stdlib only): checkout with `submodules: false` → `./snowarch docs sync` (S05, obtains the corpus at the current pin, ~1 min) → `node scripts/docs-bump.mjs --json > bump.json` (calls S07 `--upstream`; exit 0 = no change or clean move, 1 = newly dead, 6 = upstream problem → job fails loudly) → if `from == to`: log `corpus already at upstream tip` and stop → else create/refresh branch `chore/docs-bump-<shortsha>` with the two staged files committed as `chore(docs): bump ServiceNowDocs australia to <short> (<date>)` → open or update the PR with `gh pr create|edit` (`GITHUB_TOKEN`, `permissions: contents: write, pull-requests: write`). Labels: `docs-corpus`, plus `needs-remap` when `newlyDead` is non-empty.
- PR body = S07's report verbatim inside a fenced block, preceded by a checklist: `- [ ] newly dead citations remapped (or none)`, `- [ ] ./snowarch docs verify → dead: 0`, `- [ ] release notes skimmed: vendor/ServiceNowDocs/markdown/release-notes/`. Never contains instance data (there is none in this path).
- One open bump PR at a time: the branch name is stable per target SHA; a newer tip closes the previous PR with a comment `superseded by #<n>`.
- Concurrency: `concurrency: docs-bump` with `cancel-in-progress: false`.
- CI on the PR itself runs the normal `ci.yml` (S01 lint, S02 `--check`, S03 gate), so a bump with dead citations shows a red check until remapped — by design.

**Acceptance criteria.**

1. `workflow_dispatch` with `dry_run: true` on a tree whose pin is behind upstream logs a PR body containing `docs pin: <old> → <new>`, the `citations:` before/after line and a `newly dead (n):` section, and opens no PR.
2. `workflow_dispatch` with `dry_run: false` opens a PR from `chore/docs-bump-<short>` whose diff touches exactly `engine.config.json` and `vendor/ServiceNowDocs`; the PR carries label `docs-corpus`.
3. A second run with the same upstream tip does not open a second PR (the existing one is updated, log says `PR #<n> up to date`).
4. When the upstream branch is missing, the job fails with S07's exit 6 message visible in the annotations and no branch is pushed.
5. With `newlyDead` non-empty, the PR also carries `needs-remap` and its CI `citations` job is red.
6. The workflow file passes `actionlint` (added to the `lint` job by this story) and references actions the same way ARC-01 S11's `ci.yml` does (`actions/checkout@v4`, `actions/setup-node@v4` — major-version tags, ARC-01 STORIES S11; SHA pinning is not a repository convention and is not introduced by this story).

**Tasks.**

1. Write `scripts/docs-bump.mjs` (`--json`, `--to`, `--body-out <file>`).
2. Write `docs-bump.yml`; add `actionlint` to CI lint.
3. Run a dry run on a throwaway fork/branch; store the log excerpt under `docs/validation/<date>-docs-bump-dry-run.md`.
4. `docs/CONTRIBUTING.md`: "Reviewing a docs-bump PR" (three bullets).

**Test strategy.** `scripts/docs-bump.mjs` unit-tested on the S07 fixture (body rendering, exit codes). Workflow proven by the dry run and one real PR on the repository (not merged until reviewed). No Windows/macOS variant needed (runs on `ubuntu-latest` only).

**Dependencies.** S07; ARC-01 S11 `ci.yml` skeleton (job layout, action references) and the repository setting "Allow GitHub Actions to create and approve pull requests" (a GitHub behaviour not covered by any spike in `03`; proven by the dry run and the first real PR in task 3 — owner action, recorded in the checklist).

**Size.** M — a day for the script, a day for the workflow, the dry run and the docs.

**Risks / open points.** GitHub's "Allow GitHub Actions to create and approve pull requests" repository setting must be on (owner action, recorded in the story's checklist). The weekly cadence produces a PR most weeks upstream publishes; that is the intended review load.

**Definition of done.** Merged; dry-run record stored; first real bump PR opened and reviewed; CONTRIBUTING updated.

---

### ARC-03-S10 — `NOTICE` attribution, the B02/`docs sync` attribution line, install-page attribution and size/time statement, `docs/ARCHITECTURE.md` corpus section

**As** an individual practitioner and a consultancy reviewer **I want** the Apache-2.0 attribution for ServiceNowDocs to be visible where the corpus is obtained and where the repository is described, and one page that explains how the pin, the areas file and the gate relate **so that** the licence obligation (D-02) is met and the mechanism is understandable without reading the code.

**Context.** D-02 (`NOTICE` with ServiceNow/ServiceNowDocs attribution — files created by ARC-01, corpus paragraph owned here); `01` §10 bullet 5 (`NOTICE` and `docs/INSTALL.md` carry the attribution); ARC deliverables "`NOTICE` (Apache-2.0, Copyright 2026 ServiceNow) and the attribution line printed by B02" and "`docs/ARCHITECTURE.md` section 'Docs corpus: how the pin, the areas file and the gate relate'"; ARC risk mitigation "record the measured number in the install page".

**Scope.** In: the ServiceNowDocs paragraph of `NOTICE`; the one-line attribution printed by `docs sync` (and therefore B02) and by the Node-free launcher recipe; the attribution and the size/time sentence in `docs/INSTALL.md` (README body, file owned by ARC-06 — this story supplies the two sentences and their anchor); the `docs/ARCHITECTURE.md` section. Out: `LICENSE` and the relicensing sentence (ARC-01); the rest of `INSTALL.md`.

**Design notes.**

- `NOTICE` paragraph (appended under ARC-01's header):
  ```
  This repository vendors the ServiceNow product documentation corpus
  (https://github.com/ServiceNow/ServiceNowDocs) as a git submodule at
  vendor/ServiceNowDocs. Copyright 2026 ServiceNow. Licensed under the
  Apache License, Version 2.0; the corpus's own LICENSE and legal/ files
  are preserved in every checkout, sparse or full. The corpus is used
  unmodified as reference material; no ServiceNow trademark is claimed.
  ```
- Attribution line printed once at the end of a successful `docs sync` / B02 (and by the launcher recipe): `docs: ServiceNow product documentation © 2026 ServiceNow, Apache-2.0 — vendor/ServiceNowDocs/LICENSE` (exact string; a test asserts it).
- Install page sentences (anchored under the B02 row of `docs/INSTALL.md`): `The documentation corpus is a shallow, sparse checkout of the ServiceNow docs repository (Apache-2.0, © ServiceNow): about <SIZE> MB and <TIME> s on a typical connection.` plus `Prefer the whole corpus? ./bootstrap.sh --docs full (≈ <FULL_SIZE> MB).` The three placeholders are replaced by the figures ARC-00 S-07 measured (refreshed from S11's job summary); the sentences are never merged with a placeholder in them (criterion 3).
- `docs/ARCHITECTURE.md` section "Docs corpus: how the pin, the areas file and the gate relate" (≤ 100 lines *(amended at S10: the recipe block and the exit table are part of the section)*): the three artefacts (`gitlink` + `engine.config.json.docs.pin`, `vendor/docs-areas.txt`, the citation gate), who writes each (seed commit / S07 / generator / nobody by hand), who reads each (S05 recipe, launchers, doctor E-checks, `docs-bump.yml`, release tag message from ARC-09), the invariants (pin == gitlink; areas == cited areas; dead == 0; absent == FAIL), the recipe block from S05 `--print-recipe`, the `docsStatus()` JSON shape from S06, the family-switch procedure pointer, and one paragraph on why on-demand fetching is out (offline grounding, README "Out").

**Acceptance criteria.**

1. `NOTICE` contains the paragraph above; `grep -c "ServiceNowDocs" NOTICE` ≥ 1; `LICENSE` is unchanged by this story.
2. `./snowarch docs sync` output ends with the exact attribution line; `./snowarch docs sync --print-recipe` includes an `echo` of the same line as its last command, so the Node-free launcher prints it too.
3. `docs/INSTALL.md` contains the attribution sentence and the size/time sentence with real numbers (no `<SIZE>`/`<TIME>` placeholder survives — a CI grep in the `lint` job fails on `<SIZE>`).
4. `docs/ARCHITECTURE.md` has the section with the recipe block byte-identical to `--print-recipe` output (test from S11) and the `docsStatus()` shape.
5. A reviewer reading only the section can answer: "what happens if I edit `vendor/docs-areas.txt` by hand?" (CI `--check` fails) and "what happens if the corpus is missing?" (doctor FAIL, verify exit 3).

**Tasks.**

1. Write the `NOTICE` paragraph (after ARC-01 creates the file).
2. Add the attribution line to `checkout.mjs` and the recipe printer.
3. Write the two install-page sentences with S-07 numbers; add the placeholder grep to CI.
4. Write the ARCHITECTURE section; link from `docs/CONTRIBUTING.md`.

**Test strategy.** Unit assertion on the attribution string; CI placeholder grep; documentation review.

**Dependencies.** S05 (where the line is printed); ARC-01 (`NOTICE` exists); ARC-00 S-07 (numbers); ARC-06 (`docs/INSTALL.md` exists — the sentences are handed over if ARC-06 lands later).

**Size.** S — half a day of writing once the numbers exist.

**Risks / open points.** None material; the numbers may need one refresh after the recipe is finalised (S11's job prints them weekly).

**Definition of done.** Merged; CI grep in place; `NOTICE`, `INSTALL.md`, `ARCHITECTURE.md` updated; D-02 checklist item "NOTICE attribution" ticked in ARC-01's tracking.

---

### ARC-03-S11 — Windows long-path CI proof and `--docs skip` → doctor FAIL wiring (three-OS real-corpus job)

**As** CI and a Windows practitioner **I want** the real corpus checked out natively on `windows-latest` (no Git Bash), `macos-latest` and `ubuntu-latest` on a schedule, with the size and time recorded, and the doctor to FAIL when the corpus was skipped **so that** the "≤ 350 MB, every cited file present, long paths fine" claim is proven continuously rather than once, and "grounding is the product promise" (`01` §10) is enforced.

**Context.** ARC acceptance criteria "fresh user on a clean machine … ≤ 350 MB containing every file cited", "`--docs skip` yields a doctor FAIL with the sync remedy"; ARC risks "Windows long paths with 35k files" and "record the measured number"; Q-B (native Windows first-class, conditional on S-03/S-04/S-08 — this story's Windows job is independent of those spikes because it only needs git and Node, but its *first-class* status inherits Q-B's conditionality: if Q-B downgrades to "Git Bash required", the job keeps running with Git Bash on PATH and the install page says so); R-10 in `03` §B (Windows native path never yet run).

**Scope.** In: `.github/workflows/docs-real.yml` (weekly + on changes under `tools/snowarch/lib/docs/**`, `vendor/docs-areas.txt`, `.gitmodules`); the recipe-parity test (`--print-recipe` vs `docs/ARCHITECTURE.md` block); the doctor input for `docs: skip` (state file value → `docsStatus().mode === 'skip'`) and the E-check text handed to ARC-08. Out: the E-check registry, ids and `--fix` plumbing (ARC-08); bootstrap's `--docs` flag parsing (ARC-06); the CI matrix skeleton (ARC-09).

**Design notes.**

- `docs-real.yml`: matrix `os: [ubuntu-latest, macos-latest, windows-latest]`, Node 22; steps: checkout (`submodules: false`) → on Windows only, `git config --system --unset-all core.longpaths; git config --global --unset-all core.longpaths` (exit codes ignored — the runner image may pre-set it; this makes the later assertion prove the *recipe* set it) → `node tools/snowarch/bin/snowarch.mjs docs sync --json > docs.json` (Windows: `shell: pwsh`, `PATH` stripped of Git Bash's `usr/bin` with ARC-09 S08's S-13 recipe so only `git.exe` and `node.exe` are available) → assert `sizeBytes ≤ 350·1024·1024`, `areasMissing == []`, `citations.dead == []`, on Windows `longpaths == true` and the 197-char file exists (`Test-Path`) → `./snowarch docs sync --mode full` → assert every `markdown/*` directory present (count ≥ 50) → `./snowarch docs sync --mode sparse` → assert back to the areas set → print a one-line summary `os=<os> sparse=<MB> MB/<files> files/<s> s full=<MB> MB` into the job summary (`$GITHUB_STEP_SUMMARY`) — this is the source of S10's numbers after S-07's first measurement.
- Recipe-parity test (`tests/docs-recipe-parity.test.mjs`): extracts the fenced block under the ARCHITECTURE heading and compares to `--print-recipe --mode sparse` output; fails with a unified diff.
- Doctor wiring (handed to ARC-08 as a contract, implemented here on the data side): `docsStatus()` reports `mode: 'skip'` when `.local/bootstrap-state.json.docs.mode === 'skip'`, and `present: false` when the corpus is absent (`mode` is then the recorded value, or `'skip'` when no state file exists); the E-check message (ARC-08 S02 renders it, text owned here and quoted verbatim in ARC-08 STORIES E-12): `E-12 docs corpus: FAIL — corpus absent (docs mode "<mode>"); grounding and citations are unverified — run ./snowarch docs sync` with `<mode>` the recorded docs mode (`"skip"` in the README's `--docs skip` case); the remedy field is `./snowarch docs sync` (Node) with the Node-free alternative `./bootstrap.sh --docs sparse` on the next line. The `--fix` whitelist entry "missing/unsparse docs → B02" (`01` §8) calls S05's `syncDocs()`.
- Long paths: the CI Windows job explicitly unsets `core.longpaths` at system and global level before the run (step above), so the recipe's own `-c core.longpaths=true` and the persisted submodule-level `core.longpaths true` are what make it pass; the assertion reads `git -C vendor/ServiceNowDocs config --get core.longpaths` and `Test-Path` on the 197-character file. A control step with `git -c core.longpaths=false ls-files` is not attempted (it would only prove git, not the recipe). Whether `-c core.longpaths=true` alone suffices for a 260+ character checkout on Windows git is S-07's verdict (`03` S-07), not this story's.

**Acceptance criteria.**

1. `docs-real.yml` is green on all three OSes; the Windows job's log shows `core.longpaths` printed as `true` and the assertion on the 197-character path passing.
2. Each job's summary line reports sparse size ≤ 350 MB and `dead: 0`; the numbers are copied into `docs/INSTALL.md` (S10) with the date.
3. Given `.local/bootstrap-state.json` with `"docs": {"mode": "skip"}` and no corpus, `./snowarch docs status` exits 3, `docsStatus().present === false` and `docsStatus().mode === 'skip'`; the ARC-08 doctor (once wired) shows `E-12 docs corpus: FAIL — corpus absent (docs mode "skip"); grounding and citations are unverified — run ./snowarch docs sync`, never WARN or SKIP.
4. `tests/docs-recipe-parity.test.mjs` fails when one character of the ARCHITECTURE recipe block is changed.
5. With Q-B downgraded (simulated by adding Git Bash back to PATH), the Windows job still passes unchanged — the recipe never depends on bash.

**Tasks.**

1. Write `docs-real.yml` with the three-OS matrix and assertions (PowerShell for Windows, bash elsewhere, or a single Node assertion script `scripts/ci/assert-docs.mjs` to avoid two shells — preferred).
2. Write the parity test.
3. Add `mode: 'skip'` handling to `status.mjs`; document the E-check text and remedy in `docs/ARCHITECTURE.md` for ARC-08.
4. Run once on demand, copy the numbers to S10's sentences.

**Test strategy.** The workflow is the test (real network, real corpus, ~3–5 min per OS). Parity test in the normal matrix. Doctor rendering verified in ARC-08's tests.

**Dependencies.** S05, S06; ARC-01 S11 (`ci.yml` skeleton and action-reference convention) and ARC-00 S13 (the Windows-without-Git-Bash PATH recipe, `spikes/windows-recipe.md`; ARC-09 S08 later places this job on its final cells — a consumer); ARC-08 S02 is a *consumer* of the E-12 text, not a prerequisite; ARC-00 S-07 (first numbers, long-path verdict).

**Size.** M — two days: the assertion script and Windows PATH handling are the fiddly part.

**Risks / open points.** GitHub-hosted Windows runners have `core.longpaths` enabled by default in some images; the job therefore asserts the recipe *sets* it rather than that the checkout would have failed without it — the negative proof came from S-07 on the ARC-00 VM. Network flakiness on a 300 MB fetch: the job retries `docs sync` once.

**Definition of done.** Merged; `docs-real.yml` green on three OSes; numbers in `INSTALL.md`; ARC-08 story referencing `E-12` text; `03` R-10 row updated with "docs path proven on windows-latest since <date>".

---

## Sizing summary

| Story | Size | Days (range) |
|---|---|---|
| S01 | M | 1–2 |
| S02 | M | 1.5–2 |
| S03 | M | 1.5–2 |
| S04 | S | 0.5 |
| S05 | L | 4–5 |
| S06 | M | 1.5–2 |
| S07 | M | 2 |
| S08 | M | 2–3 |
| S09 | M | 2 |
| S10 | S | 0.5–1 |
| S11 | M | 2 |
| **Total** | | **18.5–23.5 engineer-days** (sum of the ranges above; ≈ 4–5 weeks for one engineer; under the 6-week threshold). S08's upper bound (3) and S10's (1) sit at the edge of their M/S bands; both are justified in the stories (classifier tests; waiting on S-07 numbers). |

Critical path: S01 → S02 → S03 → S05 (needs the S-07 verdict) → S06 → S07 → S08/S09; S04, S10, S11 hang off it. ARC-06 can start its B02 story as soon as S05's `--print-recipe` block exists; ARC-08 can wire E-checks as soon as S06's JSON shape is merged.
