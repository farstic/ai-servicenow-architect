# ARC-01 — Repository foundation and monorepo assembly

> **Amendment 2026-09-07 — the R-4 obligation, sharpened by use.** Obligation 1 ("full-history secret
> scan before any imported history is pushed") is not discharged by scanning and sanitising the working
> tree. **A hit in an ancestor commit survives sanitising the tip**, because an import brings the whole
> history — measured in ARC-01-S03, where a scan of the sanitised artefact still found the value in the
> source's initial commit. When a scan finds a hit that cannot be certified benign, **the import
> source's history is rewritten with `git filter-repo --replace-text` before the import**, the
> replacement list is generated programmatically and deleted, and the import commit records the
> `sha256` of both the original value and the file, before and after — so the deviation from
> byte-identity is auditable without the value ever being reproduced. Two consequences follow and are
> already applied to ARC-01-S03: a criterion that compares commit **SHAs** across an import cannot pass
> after a rewrite and must compare subject, author-date and count instead; and `git subtree add` does
> not compose with `git log --follow`, so the `filter-repo --to-subdirectory-filter` +
> `merge --allow-unrelated-histories` route is the default rather than the fallback.


Status: **COMPLETE — all 12 stories delivered and merged to `develop`, 2026-09-08** (see [STORIES.md](STORIES.md)) · Depends on: ARC-00 (D-01, D-02, D-03 — all decided 2026-09-04; the S-14 plugin-channel hedge does **not** gate this ARC, the layout is plugin-shaped either way) · Blocks: ARC-02 … ARC-10

## Goal

Create `farstic/ai-servicenow-architect` with the target layout of `01` §3, one version of record, one configuration file for every product constant, a CI skeleton, and the two current codebases seeded from their **working trees** (not `origin/main`) with the directory-level scope cut applied — so that every later ARC edits files that are already in their final place.

## Why it exists

Closes P-12 (five version counters, zero tags), P-15 (naming fragmentation), P-18 (dead URLs, npm identity), P-19 (server version drift), P-39 (templates split), and the engagement-residue half of P-13. It also establishes the single place (`engine.config.json`) that P-05/P-06 fixes will read from, and the workspace lockfile that ARC-06's `npm ci` step depends on (`00` §7).

## Decisions applied (2026-09-04)

- **D-01:** repository `farstic/ai-servicenow-architect`; CLI `snowarch`; MCP server key `servicenow` (tool prefix `mcp__servicenow__`); npm package **`@farstic/snowarch`** in **`packages/snowarch`** with `bin` `snowarch`. The existing npm record `@farstic/snow-mcp@1.0.0` is never touched — no publish, no deprecate, no unpublish, no README edit; ARC-01 runs no `npm publish` at all.
- **D-02:** Apache-2.0 for the whole repository; root `LICENSE` + `NOTICE` (ServiceNow/ServiceNowDocs attribution); the relicensing sentence is the **first commit message**; the server's source-available `LICENSE`, `TERMS.md`, `smithery.yaml` (MIT claim) and the engine's `docs/README.md` "Proprietary" wording are removed or replaced.
- **D-03:** all nine surfaces leave the product; nothing is deleted from the old repositories. ARC-01 removes the items that no surviving `src/` file imports (see the cut split under Scope); ARC-04-S01 removes the import-entangled `src/` directories.
- **R-1:** the working version throughout this ARC is `2.0.0-dev`; ARC-09 releases `2.0.0`.
- **R-2 / principle 10 / D-04 / D-05 / R-3 / Q-A:** no user-facing behaviour is built in this ARC, so the `/snowarch` skill naming, the Propose → Review → Apply rule, the credential store, presets and proxy handling are not exercised here; they are referenced only where the layout reserves their place (`tools/snowarch`, `.local/` ignore rules).
- **Q-B:** native Windows is first-class; ARC-01's `windows-latest` CI cell needs only `node`, `npm` and `git` (no Git Bash); the "Git Bash removed from PATH" proof is ARC-09's.
- **Minor fold:** `claude plugin validate` on a headless runner is spike S-19 (ARC-00); the CI job is advisory (`continue-on-error`) until S-19 has a verdict.

## Scope

**In:** repository creation; layout; root `package.json` (`version` `2.0.0-dev`, `workspaces`, scripts), `package-lock.json`; `engine.config.json` + JSON schema; `LICENSE`, `NOTICE`; `.gitignore`, `.gitattributes`, `.editorconfig`; `.github/workflows/ci.yml` skeleton (lint + type-check + test on three OSes × Node 20/22/24); import of the engine working tree into the root layout; import of the server into `packages/snowarch` with the **leaf-level** D-03 cut applied — `desktop/`, `clients/`, `.github/` (Copilot personas and old workflows), `Dockerfile`, `server.json`, `smithery.yaml`, `glama.json`, `TERMS.md`, `docs/CLIENT_SETUP.md`, `docs/index.html` — and the package renamed; history preservation; `docs/ARCHITECTURE.md` and `docs/CONTRIBUTING.md`; `templates/` merge; engagement-residue purge; the four engine tests under `tests/` (config, version, never-commit, legacy-name ratchet).
**Out:** any behaviour change to server or engine content (ARC-02/ARC-04) — in particular the D-03 `src/` directories that surviving code imports (`src/direct`, `src/a2a`, `src/dashboard`, `src/reports`, `src/prompts`, `src/cli/writers`, `src/cli/detect-clients.ts`, `src/transport/http-server.ts`) stay until ARC-04-S01 edits the importers (`src/server.ts:15,167,170`, `src/cli/setup.ts:25-28`, `src/cli/config-store.ts:8`, `src/sdk/index.ts:51-109`, `src/api/index.ts:17`; ARC-04-S01 also rules on `src/api`, a D-03 survivor that ARC-04's README item 1 cuts); dependency pruning (ARC-04); the docs submodule configuration (ARC-03); the bootstrap (ARC-06); prose rewrites of the engine and server documents that still carry old names (ARC-02 / ARC-04 — tracked by the ARC-01 ratchet test's allow-list).

## Deliverables

- Repository with the tree of `01` §3 (empty `.local/` never committed; `vendor/ServiceNowDocs` added by ARC-03; directories a later ARC populates are declared in `docs/ARCHITECTURE.md`, not created empty).
- `engine.config.json`:
  ```json
  { "$schema": "./engine.config.schema.json",
    "product": "snowarch", "repo": "farstic/ai-servicenow-architect", "cli": "snowarch",
    "mcp": { "serverKey": "servicenow", "package": "@farstic/snowarch", "packageDir": "packages/snowarch" },
    "floors": { "claudeCode": "2.1.214", "node": "20.0.0", "git": "2.25.0" },
    "docs": { "family": "australia", "pin": "ba513f2c62d3698ef5bfdd8044110226b8419689", "areasFile": "vendor/docs-areas.txt" },
    "roster": { "skills": 28, "agents": 9 } }
  ```
  with `engine.config.schema.json` (draft 2020-12, `additionalProperties: false`) and `tests/engine-config.test.mjs` (Ajv validation + cross-checks against the tree).
- Root `package.json` (`private`, `2.0.0-dev`, `workspaces: ["packages/*", "tools/snowarch"]`, scripts `bootstrap`, `doctor`, `test`, `lint`, `type-check`, `build:dist`, `release`), `package-lock.json` (lockfileVersion 3), a private placeholder `tools/snowarch/package.json`, `tests/run.mjs` launcher; `tests/version-consistency.test.mjs` asserting root == `packages/snowarch` == `tools/snowarch` == the `**Version:**` marker line in `CLAUDE.md`.
- `packages/snowarch/package.json` renamed to `@farstic/snowarch`, `bin` `{ "snowarch": "dist/cli/index.js" }`, `files` `dist/` + the two example files, `license` `Apache-2.0`, repository URLs and `keywords` pointing at the new identity; `packages/snowarch/dist/` ignored until ARC-04-S13 commits it.
- Git history: engine history merged at the root (`git merge --allow-unrelated-histories` of an import branch prepared from a scratch clone + working-tree overlay); server history imported with **`git subtree add --prefix=packages/snowarch`** (present in Apple git 2.39.5; the import runs once on the maintainer's macOS machine). Tags `import/engine-v2.8.0-worktree` and `import/snow-mcp-1.0.0`. `git filter-repo` is not needed (measured: engine `.git` 768 KB, server pack 2.64 MiB, `desktop/` 1.6 MB tracked; `node_modules` was never tracked) and is the documented fallback only if `git log --follow` fails to cross the subtree merge.
- `.github/workflows/ci.yml`: job `test` on `ubuntu-latest` / `macos-latest` / `windows-latest` × Node 20/22/24 running `npm ci --ignore-scripts`, `npm run lint`, `npm run type-check`, `npm test`; job `footprint` (`npm ci --omit=dev --ignore-scripts`, `node_modules` ≤ 80 MB); job `plugin-validate` (`claude plugin validate .claude/skills` and `.claude/agents`, advisory until ARC-00 S-19). Ten required status checks on `main`.
- `docs/ARCHITECTURE.md` (layout with owner ARC per directory, audience split, product-constant registry, scope-cut ledger, history section — the only product file allowed to spell the retired names) and `docs/CONTRIBUTING.md` (gates, the four tests and their failure messages, generated-files rule, versioning, branch protection commands).
- `tests/never-commit.test.mjs` (ignore rules + credential-literal scan + EOL policy) and `tests/no-legacy-names.test.mjs` + `tests/legacy-names.allowlist.json` (old names / paths / licence strings can only decrease; every allow-listed file has an owner ARC).

## Dependencies

ARC-00 for names, licence and scope-cut confirmation (all closed 2026-09-04) and ARC-00-S02 (`LICENSE`/`NOTICE` text, `RELICENSING.md` — including the consent-or-rewrite resolution for the engine's second contributor, `RobertBH17` commit `5b40835`; the files it lists as "rewrite before import" may not be imported verbatim). Nothing else. ARC-00 S-15 and S-19 are consumed if available and otherwise measured by S05/S11 respectively.

## Acceptance criteria

> **All ten verified by running them at the ARC-01 close-out (2026-09-08), not by inspection.** A tick
> here means a command was executed and its output read. The evidence, in order:
> **1** CI run [34164741254](https://github.com/farstic/ai-servicenow-architect/actions/runs/34164741254) — all nine `test` cells `success` ·
> **2** the same run's `plugin validate` job `success`, CLI pinned to 2.1.258 ·
> **3** `tests/engine-config.test.mjs` 12 pass / 0 fail / 1 skipped-with-reason ·
> **4** two `import/*` tags; oldest commit touching `packages/snowarch/src/server.ts` = `dd005fa`, touching `CLAUDE.md` = `51af231` ·
> **5** `tests/no-legacy-names.test.mjs` 6 pass / 0 fail, allow-list 19 entries each with an owning ARC ·
> **6** every leaf item of the D-03 cut absent (0 of 8 present) ·
> **7** the licence clause returns **0 matches** *as amended on 2026-09-08* — see the correction in `STORIES.md` §ARC-01-S08: the two matches it acquired are a **detector** (the ratchet's own pattern list) and the **historical record** (this ARC's D-03 cut ledger), the same two classes the ratchet already exempts ·
> **8** `2.0.0-dev 2.0.0-dev 2.0.0-dev` ·
> **9** `never-commit` + `no-real-hostnames` 10 pass / 0 fail ·
> **10** the catalogue is absent and the run-history headings count 0.


- [x] `git clone` of the new repository followed by `npm ci --ignore-scripts` succeeds on the three CI OSes × Node 20/22/24 with no network access other than github.com and registry.npmjs.org (S05, S11).
- [x] `claude plugin validate .claude/skills` and `claude plugin validate .claude/agents` pass on the seeded content (S02 locally; S11 in CI, advisory until S-19).
- [x] `tests/engine-config.test.mjs` validates `engine.config.json` against the schema in CI; every constant named in `01` §3 comments exists in it; `roster` counts match the directory listing; `docs.pin` matches the gitlink once ARC-03 adds it (S04).
- [x] `git tag -l` shows the two import tags; `git log --follow packages/snowarch/src/server.ts` reaches the original server history; `git log -- CLAUDE.md` reaches the original engine history (S02, S03).
- [x] `grep -rn "cvetomirgrigorov/servicenow-mcp\|claude-servicenow-live\|NowAIKit\|nowaikit" --include=*.md --include=*.json --include=*.ts .` returns only `docs/ARCHITECTURE.md` (history section), ADRs, `NOTICE`, `scripts/legacy/**`, and files listed in `tests/legacy-names.allowlist.json` with an owner (ARC-02 / ARC-04 / ARC-09); the ratchet test fails on any other occurrence and on any allow-listed file that no longer matches (S10).
- [x] No leaf item from the D-03 cut list exists in the tree (`desktop/`, `clients/`, `.github/agents`, `Dockerfile`, `server.json`, `smithery.yaml`, `glama.json`, `TERMS.md`); the import-entangled `src/` items are recorded in the `docs/ARCHITECTURE.md` cut ledger with owner ARC-04; `node_modules` after `npm ci --omit=dev --ignore-scripts` ≤ 80 MB (S03, S05, S11).
- [x] `LICENSE` and `NOTICE` present; no file in the tree states another licence (`git grep -i -E "source available|all rights reserved|not licensed for redistribution|license: MIT|SEE LICENSE IN LICENSE"` is empty outside `LICENSE`/`NOTICE`); no source file carries an old-licence header (measured: none did) (S01, S08).
- [x] Root, `packages/snowarch` and `tools/snowarch` versions are `2.0.0-dev` and `tests/version-consistency.test.mjs` passes (S06).
- [x] `.local/`, `clients/`, `.env`, `.claude/settings.local.json`, `memory/`, `.DS_Store` are ignored and absent from `git ls-files`; no credential-shaped literal is tracked; `git ls-files --eol` shows `i/lf w/crlf` for `*.ps1`/`*.cmd` and `i/lf w/lf` for `*.sh`/`*.mjs`/`*.md`/`*.json` on every CI cell (S07).
- [x] `docs/LIVE-ARTEFACTS-CATALOGUE.md` and the dated run-history sections of `VALIDATION-TESTS.md` are gone; the only `*.service-now.com` host in product files is the documentation placeholder `dev12345.service-now.com`, and none of the maintainer's engagement hostnames (kept in local `memory/`, never in the plan) appears outside `scripts/legacy/` (S10).

## Risks

> **Amendment 2026-09-06 (from `03` §F S-19).** Any plugin/marketplace manifest scaffolded in this ARC carries `name`, `version`, `description` **and `author`** — `claude plugin validate --strict` (ARC-05 CI) turns the missing-author warning into exit 1.

- History import size: **retired** — measured on 2026-09-04 the two histories total < 4 MB; the repository stays far below the 30 MB target without `git filter-repo`. Residual risk: `git log --follow` across the subtree merge; fallback `git filter-repo --to-subdirectory-filter` is written into S03.
- Renaming the server package before ARC-04 rebuilds `dist/` leaves no stale `dist/` in the tree because `dist/` is never imported (gitignored in the source) and stays ignored until ARC-04-S13 commits it; CI proves the server compiles with `tsc --noEmit` and runs its vitest suite (green once `desktop/tests/**` is removed — the only failing files today, `00` §4.9).
- The README's "no file from the cut list" wording could tempt an implementer to delete `src/prompts` & co. and break the build; the Scope section and S03 make the split explicit and the ratchet test pins the leaf paths.
- ARC-02 and ARC-04 could forget to empty their allow-list rows; the rule is written into `docs/CONTRIBUTING.md` and proposed as a one-line acceptance criterion in both ARC READMEs (S10 task 4). Verified 2026-09-04: neither ARC-02 nor ARC-04 README/STORIES mentions `tests/legacy-names.allowlist.json` yet (ARC-10-S03 does); the proposal is open with the plan owner.
- The ratchet's `Tier [012] \(` pattern is scanned in `*.md` only: 23 `packages/snowarch/src/tools/*.ts` files carry `Tier 0` / `Tier 1 (WRITE_ENABLED=true)` header comments (the server's flag vocabulary, `00` §3.6) that belong to ARC-04's principle-4 sweep, not to a 23-row allow-list.
- The engine history has a second contributor (`RobertBH17`, `5b40835`, 2026-06-09 — 3 new skills, 2 new agents, small edits to 8 other roster files). ARC-00-S02's `RELICENSING.md` resolves it by consent (a) or a rewrite list (b); S02 applies the ruling before the import tag and exempts the listed files from its byte-identical check. Under (b) the rewritten texts must exist before S02 runs — raised as an OPEN QUESTION in S02 (owner rewrites in ARC-01, or ARC-02-S03 re-authors them and S02 imports them as-is).
- Two CLI homes (`packages/snowarch` bin `snowarch` per D-01; `tools/snowarch/bin/snowarch.mjs` per `01` §3) — not an ARC-01 problem, but ARC-01 creates both manifests; the question is logged in `docs/ARCHITECTURE.md` for ARC-04/ARC-06.

## Stories

Full write-ups: [STORIES.md](STORIES.md) (12 stories, ≈ 12–17 engineer-days, sequential).

| ID | Title | Size |
|---|---|---|
| ARC-01-S01 | Found the repository: root commit with `LICENSE`/`NOTICE`, default branch, protection, skeleton | M |
| ARC-01-S02 | Import the engine working tree with history (submodule dropped, legacy scripts parked) | M |
| ARC-01-S03 | Import the server into `packages/snowarch` with history; leaf-level D-03 cut; package rename | L |
| ARC-01-S04 | `engine.config.json` + JSON schema + validation test | M |
| ARC-01-S05 | Root `package.json`, workspaces, lockfile; `npm ci` proven on three OSes | M |
| ARC-01-S06 | Single version of record and `tests/version-consistency.test.mjs` | S |
| ARC-01-S07 | `.gitignore` / `.gitattributes` / `.editorconfig` and the never-commit test | S |
| ARC-01-S08 | Licence sweep: replace every old licence claim, remove contradictions | S |
| ARC-01-S09 | Merge `reference/templates/` and `templates/` into `templates/`; update every reference | S |
| ARC-01-S10 | Purge engagement residue; legacy-name ratchet test | M |
| ARC-01-S11 | CI skeleton: three OSes × Node 20/22/24; footprint gate; `claude plugin validate` job | M |
| ARC-01-S12 | `docs/ARCHITECTURE.md` and `docs/CONTRIBUTING.md` first versions | M |

### Acceptance

The acceptance pass against `docs/plans/06-ACCEPTANCE-PLAN.md` §2. One row per backlog item.

| Item | Outcome | Evidence |
|---|---|---|
| B01-01 — S08 AC 2: `cmp LICENSE packages/snowarch/LICENSE` | **rework** | The NOTICE copy was compared with its root and the LICENSE copy was not — the same argument one file over, with a test for one of them. `cmp` exits 0 today; the assertion sits beside the NOTICE one, because a copy is a thing that drifts |
| B01-02 — S08 AC 1: the licence grep | **rework** | `FORBIDDEN` carried four of the five patterns; `all rights reserved` — the pre-relicensing header — was missing. Added, after checking that all seven live hits are already in exempt carriers (`docs/ARCHITECTURE.md`, `docs/plans/**`, `docs/spikes/licence/**`): a pattern that turns the ratchet red on history is a pattern somebody exempts too widely to make green |
| B01-03 — S05 AC 8: minimatch 10.x only | **rework** | The root override was there and nothing checked that it took. Both halves asserted — the manifest still pins `^10.`, and no `node_modules/**/minimatch` in the lockfile resolves outside 10.x. A lockfile regeneration is exactly the event that would undo it and exactly the event nobody reads line by line |
| B01-04 — S05 AC 5: lockfileVersion 3 and the workspace links | **rework** | Hand-verified once, asserted never. The criterion's shape ("links `packages/snowarch,tools/snowarch`") is what a person reads; the file holds two `link: true` entries whose `resolved` is the directory, so that is what is asserted — by resolved PATH rather than by key, since the package name may change and the directory may not |
| B01-05 — S10 AC 1: the catalogue stays gone | **rework** | Absent, and nothing kept it absent; now a `FORBIDDEN_PATHS` entry |
| B01-06 — S03 AC 3: the twelve leaf paths | **rework** | Eight of twelve were pinned. The four that were not — `docs/CLIENT_SETUP.md`, `docs/index.html`, `package-lock.json`, `.gitignore` under `packages/snowarch/` — are all absent today and nothing kept them gone. A workspace package has no lockfile and no `.gitignore` of its own; the two `docs/` files were the old standalone server's site |
| B01-07 — S12 AC 1: the ledger's eighteen rows | **record** | **The table does not exist under that name.** `grep -i 'scope.cut'` over `docs/ARCHITECTURE.md` finds one line — the ADR index row. The ledger became ADR-0003 itself, where the cuts are PROSE with their source paths and the only table is *Options considered* (four rows, A/B/C/D). And eighteen was a count of ITEMS where the record groups them: `clients/`, `src/cli/writers/` and `src/cli/detect-clients.ts` are one cut in the ADR's numbering, because the owner ruled on **nine cuts**. A literal row count could never match without ungrouping a decision to satisfy a test — the same shape as ARC-10-S03 AC 1. What is asserted instead is the criterion's substance: all ten leaf paths stay absent, which B01-06 completed in the same pass |
