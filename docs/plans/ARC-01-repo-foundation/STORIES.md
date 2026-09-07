# ARC-01 — Stories

Status: Draft · Decisions applied: D-01…D-06, Q-A, Q-B, R-1…R-3 · Source: README.md of this ARC · Last updated: 2026-09-04

Conventions used below. "Engine" = the working tree at `~/work/AI-Architect-Claude` (GitHub `farstic/claude-servicenow-live`, HEAD `21bdf69`, 58 commits, 176 tracked files, `.git` 768 KB). "Server" = the working tree at `~/work/snow-mcp` (GitHub `farstic/snow-mcp`, HEAD `bb09bde`, 28 commits, 269 tracked files, pack 2.64 MiB; only `package-lock.json` is modified in the working tree). Both are read-only sources; every import runs from a scratch clone. "New repo" = `farstic/ai-servicenow-architect`, cloned locally as `ai-servicenow-architect/`. Package directory is `packages/snowarch` (D-01); the pre-release version string for the whole of ARC-01 is `2.0.0-dev` (R-1; ARC-09 releases `2.0.0`). Measured facts quoted in the stories were taken on 2026-09-04 on the maintainer's machine (git 2.39.5 Apple, Node 24.16.0, npm 11.13.0, gh 2.58.0, Claude Code 2.1.258).

## Story map

| ID | Title | Size | Depends on | Delivers |
|---|---|---|---|---|
| ARC-01-S01 | Found the repository: root commit with `LICENSE`/`NOTICE`, default branch, protection, skeleton | M | ARC-00 (D-01, D-02, ARC-00-S02) | `farstic/ai-servicenow-architect` exists, Apache-2.0 from commit 1, `main` protected |
| ARC-01-S02 | Import the engine working tree with history (submodule dropped, legacy scripts parked) | M | S01, ARC-00-S02 (`RELICENSING.md` second-contributor ruling) | Engine content at the repo root; tag `import/engine-v2.8.0-worktree` |
| ARC-01-S03 | Import the server into `packages/snowarch` with history; leaf-level D-03 cut; package rename | L | S01, ARC-00-S03 (ADR-0003 = D-03; ARC-00-S02 for the licence texts) | `packages/snowarch` = `@farstic/snowarch`; tag `import/snow-mcp-1.0.0`; server tests green |
| ARC-01-S04 | `engine.config.json` + JSON schema + validation test | M | S02, S03 | The one file every product constant is read from |
| ARC-01-S05 | Root `package.json`, workspaces, lockfile; `npm ci` proven on three OSes | M | S03, S04 | Installable monorepo; root scripts; test runner |
| ARC-01-S06 | Single version of record and `tests/version-consistency.test.mjs` | S | S05 | Root = package = tools = `CLAUDE.md` marker = `2.0.0-dev` |
| ARC-01-S07 | `.gitignore` / `.gitattributes` / `.editorconfig` and the never-commit test | S | S05 | Per-checkout state can never be committed; LF/CRLF policy |
| ARC-01-S08 | Licence sweep: replace every old licence claim, remove contradictions | S | S02, S03 | Zero non-Apache licence statements in the tree |
| ARC-01-S09 | Merge `reference/templates/` and `templates/` into `templates/`; update every reference | S | S02 | One template folder (P-39) |
| ARC-01-S10 | Purge engagement residue; legacy-name ratchet test | M | S02, S03, S05, S09 | No engagement journal in the tree; old names can only shrink |
| ARC-01-S11 | CI skeleton: three OSes × Node 20/22/24; footprint gate; `claude plugin validate` job | M | S05, S06, S07, S10 | Green matrix on every push/PR; required checks wired to protection |
| ARC-01-S12 | `docs/ARCHITECTURE.md` and `docs/CONTRIBUTING.md` first versions | M | S01–S11 | Layout, audience split, constant registry, cut ledger, contributor rules |

Mapping to the README's original titles-only list: 1→S01, 6→S01 (root commit) + S08 (sweep) — split because D-02 requires the relicensing sentence in the *first* commit; 4→S02; 5→S03; 2→S04; 3→S05; 9→S06; 7→S07; 10→S09; 12→S10 (plus the ratchet test that makes the README's old-name acceptance criterion enforceable); 8→S11; 11→S12.

## Stories

### ARC-01-S01 — Found the repository: root commit with `LICENSE`/`NOTICE`, default branch, protection, skeleton

> **Branch-model reconciliation (architect ruling, 2026-09-07 — read before implementing).** The repository already exists with `develop` as its integration branch and the programme plans as its first commit (`811163f`, 2026-09-06); `main` does not exist yet and, by the owner's directive, is created only at a milestone merge with the owner's explicit approval. Therefore: (1) **this story's "root commit" is the *foundation commit* on `arc-01/foundation`** — the first commit that carries LICENSE, NOTICE, `docs/RELICENSING.md`, `docs/decisions/`, `docs/spikes/`, `docs/ARCHITECTURE.md` and `engine.config.json`; the relicensing sentence goes verbatim into *this* commit's message (it precedes every imported line of code, which is what D-02 requires). No history rewrite. (2) AC 2 reads: `git show --stat <foundation commit>` lists exactly those paths (plus nothing else), and its message contains the relicensing sentence. (3) AC 1, 3 and 4 (`main` default branch, `main` protection, force-push rejection on `main`) are **deferred to the milestone merge** that creates `main` (ARC-01's exit / M1) and are executed there by the architect; in the meantime the same protection (no force pushes, no deletions) is applied to `develop` by the architect — AC 3/4 are run against `develop` now. (4) The GitHub default branch is switched to `main` at that same merge (`gh repo edit --default-branch main`). AC 5 unchanged.

> **Amendment 2026-09-06 (from ARC-00-S03 finding a).** The root commit ALSO carries the ARC-00 artefacts, copied verbatim from `farstic/snowarch-spikes` at its final tag: `spikes/licence/LICENSE` → `/LICENSE`, `spikes/licence/NOTICE` → `/NOTICE`, `spikes/licence/RELICENSING.md` → `docs/RELICENSING.md`, `spikes/licence/header-sweep.txt` → `docs/spikes/licence/header-sweep.txt`, `docs/decisions/` → `docs/decisions/`, `spikes/` (records, TEMPLATE, stub server, recipes, hooks) → `docs/spikes/`, `spikes/engine.config.seed.json` → `engine.config.json` (validated by S04). No ARC-01 story imported these before; this is the story that does. **Gate:** `docs/spikes/` contains pre-relicensing server build output as fixtures (`S-15-npm-ci/fixture/`, from snow-mcp `bb09bde`); it must not be committed to the public repository before ADR-0002 is Accepted (D-02 owner confirmation + the RobertBH17 resolution). Acceptance: `diff -rq <snowarch-spikes>/docs/decisions docs/decisions` and `diff -rq <snowarch-spikes>/spikes docs/spikes` are empty at the root commit.

**As** a maintainer **I want** `farstic/ai-servicenow-architect` to exist with an Apache-2.0 root commit, a protected `main` branch and the agreed directory skeleton **so that** every later story lands files in their final place and the relicensing statement is the first line of the repository's history.

**Context.** D-01 (repository name), D-02 (licence, relicensing sentence "in the first commit"; `00` P-32), P-15 (three-way name mismatch). README acceptance criterion "`LICENSE` and `NOTICE` present". `00` §2 records that the engine has 0 tags and the server 0 tags — this story starts the tag discipline of `01` §12.

**Scope.** In: GitHub repository creation; root commit containing exactly `LICENSE`, `NOTICE` and the `docs/ARCHITECTURE.md` stub; default branch `main`; classic branch protection (no force-push, no deletion, required status checks — the check names are filled in by S11); the skeleton directories that ARC-01 itself populates. Out: `.gitignore` (S07 — the engine's own `.gitignore` is imported in S02 and replaced in S07, so a root `.gitignore` here would only conflict on merge); `README.md` (the engine's is imported in S02; ARC-06 writes the install page); any directory that a later ARC populates (`tools/snowarch/bin`, `packages/contract`, `vendor`, `governance`, `.claude/rules` — they are declared in `docs/ARCHITECTURE.md` with their owner ARC, not created empty; git tracks no empty directories).

**Design notes.**
- Create: `gh repo create farstic/ai-servicenow-architect --public --description "AI ServiceNow Architect — Claude Code engine + bundled ServiceNow MCP server (snowarch)" --disable-wiki`. Local: `git init -b main ai-servicenow-architect && cd ai-servicenow-architect && git remote add origin https://github.com/farstic/ai-servicenow-architect.git`.
- `LICENSE` = verbatim Apache License 2.0 text (the SPDX canonical text; 202 lines). `NOTICE` = the text agreed in ARC-00-S02 ("Licence and relicensing statement (D-02): `LICENSE`, `NOTICE`, header sweep list"). If ARC-00 delivers no text, use this draft verbatim:
  ```
  AI ServiceNow Architect
  Copyright 2026 Cvetomir Grigorov

  This product includes software first published as "ServiceNow Architecture Engine"
  (github.com/farstic/claude-servicenow-live, v2.8.0) and "ServiceNow MCP Toolkit"
  (github.com/farstic/snow-mcp, 1.0.0), both relicensed by their author under the
  Apache License, Version 2.0, on 2026-09-04.

  This product vendors, as the git submodule vendor/ServiceNowDocs, documentation from
  ServiceNow/ServiceNowDocs (github.com/ServiceNow/ServiceNowDocs),
  Copyright 2026 ServiceNow, Inc., licensed under the Apache License, Version 2.0.
  ServiceNow is a trademark of ServiceNow, Inc. This project is not affiliated with,
  sponsored by or endorsed by ServiceNow, Inc.
  ```
- Root commit message (the D-02 relicensing sentence lives here; it must be the first commit so that `git log --reverse | head -1` shows it). The body is the sentence from ARC-00-S02's `RELICENSING.md` **verbatim** (ARC-00-S02 acceptance criterion 3 fixes its wording; its draft reads "… are relicensed by their sole author, Cvetomir Grigorov, under the Apache License, Version 2.0, effective 2026-09-04; this repository is the successor to both."), followed by the personal-project line. If ARC-00-S02 has not delivered the sentence, use this fallback:
  ```
  chore: found ai-servicenow-architect under Apache-2.0

  The ServiceNow Architecture Engine (farstic/claude-servicenow-live, v2.8.0) and the
  ServiceNow MCP Toolkit (farstic/snow-mcp, 1.0.0) are relicensed by their author,
  Cvetomir Grigorov, under the Apache License 2.0 and merged into this repository.
  This is a personal project; no employer holds an IP claim on either codebase.
  ```
  Note: the word "sole" in ARC-00-S02's draft is only accurate once `RELICENSING.md` records the second engine contributor's consent (resolution (a)) or the rewrite of that contributor's files (resolution (b)) — S02 applies the ruling; S01 must not paste a sentence that the ruling contradicts.
- Branch protection (classic API; works on a public repository on the free plan): `gh api -X PUT repos/farstic/ai-servicenow-architect/branches/main/protection --input protection.json` with `{"required_status_checks":{"strict":true,"contexts":[]},"enforce_admins":false,"required_pull_request_reviews":null,"restrictions":null,"allow_force_pushes":false,"allow_deletions":false}`. `contexts` stays empty until S11 fills it with the job names of `ci.yml`. `enforce_admins:false` is deliberate: the maintainer is the only committer (Q-A persona), and S02/S03 push merge commits directly to `main`.
- Skeleton: `docs/`, `tests/`, `templates/`, `scripts/legacy/`, `packages/`, `tools/snowarch/`, `.github/workflows/` are created by the stories that first put a file in them (S02, S05, S09, S11). This story writes only `docs/ARCHITECTURE.md` as a 20-line stub containing the `01` §3 tree verbatim and a table "directory → owner ARC" so that reviewers of S02–S12 have the target in front of them; S12 replaces the stub.
- Repository settings: default branch `main`; merge commits allowed (S02/S03 need real merge commits to preserve history — squash would destroy it); delete-branch-on-merge on.

> **Amendment 2026-09-07 (the R-4 gate, fired twice).** **When a gitleaks hit lives in an ancestor commit, sanitising the working tree is not sufficient** — an import brings the whole history, and the value survives in its ancestors. The import source's history is rewritten with `git filter-repo --replace-text` **before** the import, the replacement list is generated programmatically and deleted (the value is never typed or printed), and both the value's and the file's `sha256` are recorded in the import commit so the deviation from byte-identity is auditable without reproducing the value. Byte-identity for surviving files therefore holds **except** for the sanitised lines, which are named in that commit. This gate stopped a real import here for the first time: once on the value, and once on a method that would not have removed it.

**Acceptance criteria.**
1. `gh repo view farstic/ai-servicenow-architect --json name,defaultBranchRef,licenseInfo` returns `name: ai-servicenow-architect`, `defaultBranchRef.name: main`, `licenseInfo.key: apache-2.0` (GitHub's licence detector recognises the verbatim text).
2. `git log --reverse --format=%B | head -6` on `main` prints the relicensing sentence recorded in ARC-00-S02's `RELICENSING.md` verbatim (or the fallback above when ARC-00-S02 delivered none); the root commit's tree contains exactly `LICENSE` and `NOTICE` and `docs/ARCHITECTURE.md` (`git ls-tree -r --name-only $(git rev-list --max-parents=0 HEAD)`).
3. `gh api repos/farstic/ai-servicenow-architect/branches/main/protection --jq '.allow_force_pushes.enabled, .allow_deletions.enabled'` prints `false` twice.
4. `git push --force origin main` from a second clone is rejected with `remote: error: GH006: Protected branch update failed`.
5. `grep -c "Apache License" LICENSE` ≥ 1 and `grep -c "ServiceNow, Inc." NOTICE` ≥ 1; neither file contains the words "Proprietary", "Source Available" or "MIT".

**Tasks.**
1. Confirm ARC-00-S02 output (NOTICE text) or adopt the draft above; confirm D-01 spelling of the repository name.
2. `gh repo create …`; `git init -b main`; add remote.
3. Write `LICENSE`, `NOTICE`, `docs/ARCHITECTURE.md` stub; commit with the message above; push.
4. Apply branch protection and repository settings via `gh api`; record the commands in `docs/CONTRIBUTING.md` (S12) so they are reproducible.
5. Verify criteria 1–5; note the root commit SHA in `docs/ARCHITECTURE.md` history section.

**Test strategy.** Manual, once, on macOS (`gh` authenticated as `farstic` — verified on the host). Criterion 4 is a manual negative test from a second clone. No CI (nothing to run yet).

**Dependencies.** ARC-00: D-01 and D-02 closed (they are), ARC-00-S02 (`LICENSE`/`NOTICE` text agreed). Nothing else.

**Size.** M — half a day of mechanics plus the review of the NOTICE wording with the owner.

**Risks / open points.** The GitHub licence detector may not classify `NOTICE`-adjacent text; only `LICENSE` matters for criterion 1. Rulesets (the newer protection API) are deliberately not used — classic protection is enough and simpler to reproduce with one `gh api` call.

**Definition of done.** Repository public on GitHub; root commit pushed; protection applied; `docs/ARCHITECTURE.md` stub committed; the commands recorded for S12.

---

### ARC-01-S02 — Import the engine working tree with history (submodule dropped, legacy scripts parked)

> **Amendment 2026-09-06 (from ARC-00-S03 finding a).** Criterion 3's `diff -rq` against `~/work/AI-Architect-Claude/` additionally excludes the paths the root commit (S01) brought from `snowarch-spikes` and that do not exist in the engine: `--exclude=LICENSE --exclude=NOTICE --exclude=RELICENSING.md --exclude=decisions --exclude=spikes --exclude=engine.config.json`. The engine import is still byte-identical for every engine-originated file.

**As** a maintainer **I want** the engine's current *working tree* (not `origin/main`) imported at the root of the new repo with its full history **so that** the 28 skills, 9 agents, governance texts and scripts land in the location ARC-02 edits, and `git log` on any engine file still reaches the 2026 history.

**Context.** README goal "seeded from their working trees (not `origin/main`)"; `00` §2 lists the uncommitted engine state; measured on 2026-09-04 `git status --short` prints 13 lines — 9 modified (`CLAUDE.md`, `README.md`, `SETUP.md`, the `ServiceNowDocs` gitlink, four `docs/*.md`, `scripts/README.md`) and 4 untracked (`scripts/setup.sh` 1,022 lines, `scripts/doctor.sh` 1,141 lines, `scratchpad/`, `node-compile-cache/`). `03` R-08 (history lost to future readers). README acceptance criterion: import tag present. D-03 item 9 (the hooks block of `.claude/settings.json` does not travel) and `01` §3 "Not in the repository" list. **Second contributor (verified 2026-09-04):** `git shortlog -sn --all` on the engine shows `farstic` 60 and `RobertBH17` 1 — commit `5b40835` (2026-06-09, "New agent/skills (#1)") adds `.claude/agents/atf-author.md`, `.claude/agents/diagramming-specialist.md`, `.claude/skills/app-engine-specialist/{SKILL,EXAMPLES}.md`, `.claude/skills/atf-author/{SKILL,EXAMPLES}.md`, `.claude/skills/cmdb-csdm-specialist/{SKILL,EXAMPLES}.md` and makes small edits to `code-reviewer`, `csm-specialist` and seven other agent files (full list: `git show --stat 5b40835`). ARC-00-S02's `RELICENSING.md` records resolution (a) written consent or (b) the "rewrite before import" file list; this story executes whichever is recorded.

**Scope.** In: a scratch clone of the engine brought to working-tree state, committed and tagged `import/engine-v2.8.0-worktree`; merge into the new repo with `--allow-unrelated-histories`; removal of the `ServiceNowDocs` gitlink and `.gitmodules` in the import commit (ARC-03 re-adds the corpus at `vendor/ServiceNowDocs`); `SETUP.md`, `scripts/setup.sh`, `scripts/doctor.sh` moved under `scripts/legacy/` as reference material. Out: any edit to engine content (ARC-02); root mirror deletion (`skills/`, `agents/` stay — ARC-02-S01); residue purge of *tracked* files (S10 — `docs/LIVE-ARTEFACTS-CATALOGUE.md` is imported and then removed by S10 so the history shows the deliberate deletion); the docs corpus (ARC-03).

**Design notes.**
- Scratch clone: `git clone ~/work/AI-Architect-Claude "$SCRATCH/engine-import"` (clones committed HEAD `21bdf69`; the source is never written).
- Overlay the working tree: `rsync -a --delete --exclude-from="$SCRATCH/engine-exclude.txt" ~/work/AI-Architect-Claude/ "$SCRATCH/engine-import/"` where `engine-exclude.txt` is exactly:
  ```
  .git/
  ServiceNowDocs/
  node-compile-cache/
  scratchpad/
  .backups/
  .DS_Store
  .claude/settings.json
  .claude/settings.local.json
  .mcp.json
  .env
  clients/
  deliverables/
  reports/
  memory/
  diagram-preview/
  nowaikit-example.ts
  start-mcp.sh
  ```
  Rationale per line: `.claude/settings.json` (gitignored in the engine, holds the author's absolute-path context-mode hooks — D-03 item 9), `.mcp.json` (gitignored, holds a plaintext instance password — `00` §3.11, principle 3 of `01` §2), `scratchpad/`/`.backups/`/`node-compile-cache/` (residue, `00` §3.11). `rsync` ships with macOS; this import runs once on the maintainer's machine.
- In the scratch clone: `git rm --cached -q ServiceNowDocs && git rm -q .gitmodules` (the gitlink `0ba98cd` and the July checkout `ba513f2` disagree — `00` §3.10; the pin is recorded as data in S04 and re-materialised by ARC-03). `mkdir scripts/legacy && git mv SETUP.md scripts/legacy/SETUP.md && git mv scripts/setup.sh scripts/legacy/setup.sh 2>/dev/null || mv scripts/setup.sh scripts/legacy/ ; mv scripts/doctor.sh scripts/legacy/`. Add `scripts/legacy/README.md` (6 lines): "Reference material only. These files are the last bash-era setup and doctor (engine v2.8.0, 2026-09-04). They are not executed by anything in this repository and are not maintained; ARC-06/ARC-08 replace them; ARC-10 deletes this folder."
- Relicensing ruling (before the commit below): read `RELICENSING.md` from ARC-00-S02. Under **(a)** nothing changes. Under **(b)** every file on its "rewrite before import" list is replaced in the scratch clone by the rewritten text supplied with the ruling *before* the import commit, so that no tagged import commit carries the un-relicensed content; those files are then exempt from criterion 3 (byte-identical) and are listed in `docs/ARCHITECTURE.md` §History as "re-authored at import, see RELICENSING.md". Their file names do not change, so criterion 6 (28 skills / 9 agents) still holds. **OPEN QUESTION (owner, before S02 starts):** under (b), who writes the rewritten texts — the owner inside ARC-01 (adds ~1–2 days to this story: three whole skills and two agents) or ARC-02-S03, which rewrites every skill anyway (then S02 imports the files unchanged and the history keeps commit `5b40835` — ARC-00's README risk note takes this stance)? Proposed default: ARC-02-S03, with `RELICENSING.md` and `docs/ARCHITECTURE.md` recording that the listed files are superseded there. The merge commit carries commit `5b40835` in either case; whether that is acceptable under (b) is part of the same ruling.
- `git add -A && git commit -m "import: engine v2.8.0 working tree as of 2026-09-04" && git tag -a import/engine-v2.8.0-worktree -m "Engine working tree at import (source HEAD 21bdf69 + uncommitted changes); ServiceNowDocs gitlink dropped, re-added by ARC-03 at vendor/"`.
- In the new repo: `git fetch "$SCRATCH/engine-import" --tags && git merge --allow-unrelated-histories --no-ff import/engine-v2.8.0-worktree -m "import: merge engine history (farstic/claude-servicenow-live) at the repository root"`. No path conflicts are possible: the root commit holds only `LICENSE`, `NOTICE`, `docs/ARCHITECTURE.md`, and the engine has none of the three (it has `docs/README.md`, not `docs/ARCHITECTURE.md`; no `LICENSE`).
- Why merge rather than `git subtree add`: subtree needs a prefix; the engine lives at the root. An unrelated-histories merge keeps every engine path unchanged, so `git log <file>` needs no `--follow`.
- The engine's `.gitignore` arrives verbatim and is replaced in S07; its `.githooks/`, `scripts/sync-agents-skills.sh`, `scripts/verify-*.sh`, root `skills/`, `agents/` arrive verbatim (ARC-02 deletes them). The engine's `.claude/settings.example.json` (the author's context-mode hook example, D-03 item 9) arrives verbatim; ARC-02 removes it in its context-mode sweep (ARC-02 README acceptance criterion: `grep -rn "context-mode\|ctx_…"` returns nothing).

**Acceptance criteria.**
1. `git tag -l 'import/*'` lists `import/engine-v2.8.0-worktree`; `git merge-base --is-ancestor import/engine-v2.8.0-worktree main` exits 0.
2. The **set** of commits touching `CLAUDE.md` is identical in both histories — `diff <(git -C ~/work/AI-Architect-Claude log --format=%H -- CLAUDE.md) <(git log --format=%H -- CLAUDE.md)` shows only the import commit as an addition — and `git log --format=%H -- CLAUDE.md | tail -1` equals the engine's oldest such commit. *(Amended 2026-09-07: the original criterion asked for `≥ 20` commits touching `CLAUDE.md`. **That was never true of this repository** — the engine has **7** across its entire 58-commit history, so the import produces 8: those 7 plus the import commit. The count was measuring nothing; the identity of the sets is the property that actually shows history survived.)*
3. `diff -rq --exclude=.git --exclude=ServiceNowDocs --exclude=node-compile-cache --exclude=scratchpad --exclude=.backups --exclude=.DS_Store --exclude=settings.json --exclude=.mcp.json --exclude=SETUP.md --exclude=setup.sh --exclude=doctor.sh --exclude=.gitmodules --exclude=LICENSE --exclude=NOTICE --exclude=ARCHITECTURE.md --exclude=legacy --exclude=plans --exclude=.gitignore ~/work/AI-Architect-Claude/ ./` prints nothing (byte-identical import of everything not on the exclusion/move list) — under relicensing resolution (b) the files on the `RELICENSING.md` rewrite list are added to the `--exclude` set and are checked instead by criterion 9.
   *(Amended 2026-09-07, two exclusions added.* **`plans`**: `docs/plans/` comes from `811163f`, the repository's **true root commit** on `develop`, and does not exist in the engine — the branch-model reconciliation made this criterion reachable by content that predates the engine import entirely. **`.gitignore`**: ARC-01-S02b replaces the engine's file with a union of it and the four entries the plans commit carried — `.local/`, `node_modules/`, `.DS_Store`, `Thumbs.db` — because `.local/` holds ADR-0004's 0600 credential store and must not be unprotected between S02 and S07. Byte-identity with the engine is therefore deliberately given up for this one file, and criterion 3 must exempt it or contradict S02b.)*
4. `test -f scripts/legacy/setup.sh && test -f scripts/legacy/doctor.sh && test -f scripts/legacy/SETUP.md && test -f scripts/legacy/README.md` and `test ! -f SETUP.md`.
5. `git ls-files | grep -E '^(ServiceNowDocs|\.gitmodules|\.mcp\.json|\.claude/settings\.json|scratchpad/|\.backups/|node-compile-cache/)'` prints nothing; `git ls-files -s ServiceNowDocs` prints nothing (no gitlink).
6. `git ls-files .claude/skills | grep -c SKILL.md` = 28 and `ls .claude/agents/*.md | wc -l` = 9 (the roster travelled intact); `claude plugin validate .claude/skills` and `claude plugin validate .claude/agents` print `✔ Validation passed` (both pass today on 2.1.258 — `00` §3.2).
7. `git grep -l -E '"(password|client_secret|clientSecret)"\s*:\s*"' -- . ':!packages' ':!*.example.json'` prints nothing **except `docs/plans/ARC-01-repo-foundation/STORIES.md`** (no secret from the gitignored engine files crossed over). *(Amended 2026-09-07: the one match is this very file — ARC-01-**S07**'s own acceptance step `printf '{"password":"hunter2hunter2"}' > .local/instances.json`. It is a plan-document fixture already on ADR-0007's recorded fixture list, and it is not engine-originated. The criterion is catching its own text; expected, and named here so a future run does not treat it as a finding.)*
8. The source repository is unchanged: `git -C ~/work/AI-Architect-Claude status --short > "$SCRATCH/engine-status-before.txt"` is taken before task 1, and after task 4 `git -C ~/work/AI-Architect-Claude status --short | diff - "$SCRATCH/engine-status-before.txt"` prints nothing (13 lines on 2026-09-04: 9 modified, 4 untracked); `git -C ~/work/AI-Architect-Claude rev-parse HEAD` still prints `21bdf69…`.
9. `RELICENSING.md` (from ARC-00-S02) is quoted in the import commit message body ("relicensing: resolution (a) consent dated …" or "resolution (b): N files re-authored — see RELICENSING.md"); under (b), for every listed file `git diff --stat import/engine-v2.8.0-worktree^ import/engine-v2.8.0-worktree -- <file>` shows a change (the rewritten text landed in the import commit) or the file is named in the OPEN QUESTION's recorded answer as "re-authored by ARC-02-S03".

**Tasks.**
0. Read `RELICENSING.md`; if resolution (b) and the rewritten texts are not supplied, stop and obtain the owner's answer to the OPEN QUESTION above.
1. Write `engine-exclude.txt` in the scratchpad; scratch-clone the engine; overlay with `rsync`.
2. Drop the gitlink and `.gitmodules`; move the three legacy files; write `scripts/legacy/README.md`.
3. Commit and tag in the scratch clone; run criterion 3's `diff -rq` against the scratch clone first.
4. Fetch and merge into the new repo; push `main` and the tag.
5. Run criteria 1–8; record the merge commit SHA in `docs/ARCHITECTURE.md` (history section, S12).

**Test strategy.** Manual, once, macOS. Criteria 3, 5, 7 are the safety net against carrying a secret or residue — run them before pushing. Later ARCs rely on criterion 6 (`claude plugin validate` on the seeded content — README acceptance criterion 2).

**Dependencies.** S01. ARC-00 D-03 (item 9) closed. ARC-00-S02 `RELICENSING.md` with the second-contributor resolution (a)/(b) recorded — a hard gate for the import tag.

**Size.** M — the mechanics are an hour; the value is in the verification steps and in getting the exclusion list right once. Under relicensing resolution (b) with the rewrite done inside ARC-01, add 1–2 days (three skills and two agents to re-author) — counted in the sizing summary's contingency.

**Risks / open points.** `rsync --delete` against the scratch clone also deletes files that are tracked in HEAD but absent from the working tree — that is the intended "working tree wins" semantics, but review the resulting `git status` in the scratch clone before committing. `docs/LIVE-ARTEFACTS-CATALOGUE.md` and the dated sections of `VALIDATION-TESTS.md` are imported deliberately and removed in S10.

**Definition of done.** Merge commit and tag on `origin/main`; criteria 1–8 recorded in the PR/commit description; `docs/ARCHITECTURE.md` history section updated (S12 finalises).

---

### ARC-01-S03 — Import the server into `packages/snowarch` with history; leaf-level D-03 cut; package rename

> **Amendment 2026-09-06 (from ARC-00-S02 finding e).** The leaf cut of this story MUST also `git rm` the server's `LICENSE` (the "Source Available License — All rights reserved" text), `TERMS.md`, `smithery.yaml` and `server.json` before the import is committed, and `packages/snowarch/package.json` `license` must read `Apache-2.0` (the `SEE LICENSE IN LICENSE` value and its copies in the deleted `desktop/` and lock files go with the cut). Rationale: without this, `packages/snowarch/LICENSE` arrives in a public Apache-2.0 tree carrying a contradictory proprietary licence until ARC-01-S08 runs. ARC-01-S08 then writes the single root `LICENSE`/`NOTICE` from `spikes/licence/`.

**As** a maintainer **I want** the server's working tree imported under `packages/snowarch` with history, the D-03 surfaces that nothing under `src/` imports removed, and the package renamed to `@farstic/snowarch` **so that** ARC-04 hardens a server that already lives in its final directory under its final name, and the test suite is green from the first CI run.

**Context.** D-01 (d) amended: package `@farstic/snowarch`, directory `packages/snowarch`, bin `snowarch`; the npm record `@farstic/snow-mcp@1.0.0` is never touched. D-03 (cut list). P-18 (bins and package name belong to third parties; dead URLs), P-15. `00` §4.9: `npx vitest run` today → 12 failed files, **all** `desktop/tests/**`; 272 tests pass. README deliverable "import of snow-mcp … with `desktop/`, `clients/`, … removed"; README acceptance criteria 4 (history) and 6 (cut list, footprint).

**Scope.** In: scratch clone + working-tree overlay (`package-lock.json` is the only modified file); tag `import/snow-mcp-1.0.0`; `git subtree add --prefix=packages/snowarch`; removal of every D-03 item that **no surviving source file imports** (list below); `package.json` identity fields; deletion of the package-local lockfile, `.gitignore` and `.github/`. Out — handed to ARC-04-S01 ("D-03 code cut, dependency prune, identity `@farstic/snowarch` 2.0.0, vitest scoping") with an explicit ledger: every `src/` directory on the D-03 list, because surviving files import them and removing them requires source edits (`src/server.ts:15` imports `./prompts/index.js` and dynamically imports `./a2a/index.js` and `./dashboard/index.js` at lines 167/170; `src/cli/setup.ts:25-28` imports `detect-clients`, `writers`, `../direct/llm-client.js`; `src/cli/config-store.ts:8` imports `../direct`; `src/sdk/index.ts` imports `direct`, `prompts`, `reports`; `src/api/index.ts:17` imports `prompts`; `src/transport/http-server.ts` is the HTTP transport). Also out: dependency pruning (`pdfmake`, `pptxgenjs`, `@inquirer/prompts`, `ora`, `chalk` — ARC-04-S01), any `exports` map change, committed `dist/` (ARC-04-S13 "`scripts/build-dist.mjs`; committed `dist/`; CI rebuild-and-diff"). Note for the ledger: D-03 lists `src/api/` as a survivor, while ARC-04 README item 1 cuts it as the REST API of D-03 item 6 — ARC-04-S01 rules; ARC-01 carries it unchanged.

**Design notes.**
- Scratch: `git clone ~/work/snow-mcp "$SCRATCH/snow-mcp-import" && cp ~/work/snow-mcp/package-lock.json "$SCRATCH/snow-mcp-import/" && git -C "$SCRATCH/snow-mcp-import" commit -am "import: snow-mcp working tree as of 2026-09-04" && git -C "$SCRATCH/snow-mcp-import" tag -a import/snow-mcp-1.0.0 -m "snow-mcp at import (source HEAD bb09bde + working-tree package-lock.json)"`. `dist/` is gitignored in the source (`.gitignore:5`) and therefore absent from the clone — correct (ARC-04-S13 commits a rebuilt `dist/`).
- Import: `git subtree add --prefix=packages/snowarch "$SCRATCH/snow-mcp-import" import/snow-mcp-1.0.0 -m "import: snow-mcp history into packages/snowarch"` then `git fetch "$SCRATCH/snow-mcp-import" tag import/snow-mcp-1.0.0`. `git subtree` is present in Apple git 2.39.5 (verified: `git subtree` prints its usage); the import runs once, on macOS, so no other platform's git matters here. `git filter-repo` is **not** installed on the host and is not needed: the source pack is 2.64 MiB and `desktop/` is 1.6 MB of tracked files — the README's "node_modules-sized blobs" risk does not materialise (`node_modules` was never tracked). Fallback if criterion 3 fails: `pip install git-filter-repo`, `git filter-repo --to-subdirectory-filter packages/snowarch` in the scratch clone, then `git merge --allow-unrelated-histories`.
- Leaf cut (one commit, `git rm -r`): `packages/snowarch/desktop/`, `packages/snowarch/clients/`, `packages/snowarch/.github/` (the ten Copilot `*.agent.md` personas and the two old workflows — root CI replaces them in S11), `packages/snowarch/Dockerfile`, `packages/snowarch/server.json`, `packages/snowarch/smithery.yaml`, `packages/snowarch/glama.json`, `packages/snowarch/TERMS.md`, `packages/snowarch/docs/CLIENT_SETUP.md`, `packages/snowarch/docs/index.html` (registry/marketing assets for the retired distribution channels), `packages/snowarch/package-lock.json` (the root lockfile governs — S05), `packages/snowarch/.gitignore` (root governs — S07). Removing `desktop/` removes the 12 failing vitest files (`desktop/tests/**`, `00` §4.9) and nothing else under `tests/` references the removed items (checked: `tests/cli/writers.test.ts` tests `src/cli/writers`, which stays until ARC-04).
- `packages/snowarch/package.json` edits (identity only):
  ```json
  "name": "@farstic/snowarch",
  "version": "2.0.0-dev",
  "description": "ServiceNow MCP server and snowarch CLI — the live-instance half of AI ServiceNow Architect",
  "bin": { "snowarch": "dist/cli/index.js" },
  "files": ["dist/", "instances.example.json", ".env.example"],
  "license": "Apache-2.0",
  "homepage": "https://github.com/farstic/ai-servicenow-architect#readme",
  "repository": { "type": "git", "url": "git+https://github.com/farstic/ai-servicenow-architect.git", "directory": "packages/snowarch" },
  "bugs": { "url": "https://github.com/farstic/ai-servicenow-architect/issues" },
  "publishConfig": { "access": "public" }
  ```
  Remove `mcpName`, remove the `desktop/serve.cjs` and `desktop/renderer/dist/` entries from `files`, remove the second bin (`servicenow-mcp-server`): `npx @farstic/snowarch start` already reaches the server through the CLI's `start` command (`src/cli/index.ts:115`). Replace the two `keywords` entries `servicenow-mcp` and `servicenow-mcp-server` (`package.json:54-55`) with `snowarch` — otherwise the S10 ratchet fires on the manifest. Move `overrides.minimatch` to the root `package.json` (S05) — npm applies `overrides` from the root manifest of the install (npm `package.json` docs, "overrides"); S05 criterion 8 proves the override still takes effect. Keep `scripts`, `exports`, `dependencies`, `devDependencies` untouched (ARC-04).
- The CLI reads its version from `../../package.json` relative to `dist/cli/index.js` (`src/cli/index.ts:27-29`) — that still resolves to `packages/snowarch/package.json`. The update-check against `registry.npmjs.org/servicenow-mcp` (`src/cli/index.ts:57-85`, P-18) is code and stays for ARC-04; it is listed in the S10 allow-list under owner ARC-04.
- Cut ledger: a table in `docs/ARCHITECTURE.md` (S12) with one row per D-03 item: item → removed in ARC-01-S03 | ARC-04-S01, and the reason (leaf vs. imported).

**Acceptance criteria.**
1. `git tag -l 'import/*'` lists both `import/engine-v2.8.0-worktree` and `import/snow-mcp-1.0.0`.
2. `git log --oneline -- packages/snowarch/src/server.ts | tail -1` has the **same subject and author-date** as `git -C ~/work/snow-mcp log --oneline -- src/server.ts | tail -1`, and the two histories have the same commit count (28) and the same number of commits touching that file (2). *(Amended 2026-09-07, twice over, and both amendments come from the R-4 gate firing. **(a) SHAs necessarily differ**: a gitleaks hit lived in an ancestor commit, so the import source's history was rewritten with `git filter-repo --replace-text` before import — see the import commit for the `ebcdd71 → dd005fa` mapping and both file hashes. **(b) `--follow` and `git subtree add` do not compose**: `subtree add` grafts the tree at a prefix without recording a rename, so `git log --follow -- packages/snowarch/src/server.ts` returned **0 commits** even though the history was present and reachable by other queries. The import therefore uses this story's own documented fallback — `filter-repo --to-subdirectory-filter packages/snowarch` then `git merge --allow-unrelated-histories`, the same shape as the S02 engine import — after which the criterion's own query works without `--follow`.)*
3. `for p in desktop clients .github Dockerfile server.json smithery.yaml glama.json TERMS.md docs/CLIENT_SETUP.md docs/index.html package-lock.json .gitignore; do test ! -e packages/snowarch/$p || echo "STILL PRESENT $p"; done` prints nothing.
4. `node -e "const p=require('./packages/snowarch/package.json');console.log(p.name,p.version,Object.keys(p.bin).join(','),p.license)"` prints `@farstic/snowarch 2.0.0-dev snowarch Apache-2.0`; `grep -c -E "cvetomirgrigorov|servicenow-mcp|mcpName" packages/snowarch/package.json` = 0 (identity, URLs, bins and keywords all renamed).
5. In `packages/snowarch` after the root `npm ci --ignore-scripts` (S05): `npx tsc --noEmit -p tsconfig.json` exits 0 and `npx vitest run` reports 0 failed files (272 tests passing, 1 skipped live file, as today minus the desktop files).
6. `npm view @farstic/snow-mcp version` still prints `1.0.0` and `npm view @farstic/snow-mcp deprecated` prints nothing — the old record is untouched (D-01 owner constraint). No `npm publish` is run anywhere in ARC-01.
7. `git -C ~/work/snow-mcp status --short` still prints exactly ` M package-lock.json`.

**Tasks.**
1. Scratch-clone, overlay `package-lock.json`, commit, tag.
2. `git subtree add`; fetch the tag; verify criterion 2 immediately (before any other commit) — if it fails, switch to the filter-repo fallback.
3. Leaf-cut commit (`git rm -r` list above).
4. `package.json` identity edit commit; move `overrides` to the root (S05 picks it up).
5. After S05, run criterion 5 on macOS; S11 proves it on Linux and Windows.
6. Write the cut-ledger rows for S12.

**Test strategy.** Criterion 5 = the server's own vitest suite (unit) and `tsc --noEmit` — run locally now, in CI from S11 on three OSes × three Node versions. Criteria 2 and 3 are one-off manual checks; criterion 3 is also folded into the S10 ratchet test as forbidden paths so it cannot regress.

**Dependencies.** S01; ARC-00 D-03. S05 must follow before criterion 5 can be run (root install).

**Size.** L — the subtree import is quick, but the cut must be verified file by file against the import graph, the package identity touches the CLI's self-version and the `files` allow-list, and the criterion-2 history check decides between two tools.

**Risks / open points.** (a) The tension between D-01 ("`packages/snowarch` bin `snowarch` yields CLI + stdio server") and `01` §3 (`tools/snowarch/bin/snowarch.mjs` is the zero-dependency bootstrap/doctor CLI behind the root `./snowarch` launcher) is not resolved here: ARC-01 gives both packages their `package.json`; ARC-04 (server CLI: `instance`, `doctor`, `contract`, `start`) and ARC-06 (`bootstrap`, `docs`, `mode`, `upgrade`) must agree on which command lives where, and `docs/ARCHITECTURE.md` (S12) records the question. (b) `packages/snowarch/README.md`, `docs/INSTALLATION.md`, `docs/SERVICENOW_OAUTH_SETUP.md` still describe the removed surfaces and the third-party `npx servicenow-mcp` — ARC-04-S14 ("Rewrite `packages/snowarch/README.md`, `.env.example`, `CHANGELOG.md` from code") rewrites them; S10's allow-list names them under owner ARC-04.

**Definition of done.** Subtree merge, leaf-cut and rename commits on `origin/main`; both tags pushed; vitest green locally; cut ledger drafted for S12.

---

### ARC-01-S04 — `engine.config.json` + JSON schema + validation test

**As** the engine (Claude), the server, the doctor and the release tooling **I want** one committed JSON file holding every product constant, validated by a schema and a test **so that** names, floors, docs pin and roster expectations are never hand-written twice (P-05/P-06 fixes in ARC-05/ARC-02 read from it; the doctor reads floors from it — `01` §8, §12).

**Context.** README deliverable `engine.config.json` (+ schema + test); `01` §3 comment "product name, server key, floors (claude/node/git), docs family+pin, roster expectations"; D-01 "all four values live in `engine.config.json`"; `02` D-01 "server key must contain only letters, digits, `-` and `_`"; `01` §10 pin `ba513f2` (working-tree checkout, 2026-07-09 July refresh); `01` §12 floors 2.1.214 / 2.25 / 20; `00` §3.8 (roster counts drift; `doctor.sh:234-235` parses prose for counts).

**Scope.** In: the file, the schema (JSON Schema draft 2020-12), the test, the root devDependency `ajv`. Out: anything that *consumes* the file (ARC-02 lint, ARC-05 generators, ARC-06/ARC-08 doctor, ARC-09 release) — they read, ARC-01 only defines.

**Design notes.**
- `engine.config.json` (exact content; the pin is the full SHA of the engine's working-tree checkout, `git -C ~/work/AI-Architect-Claude/ServiceNowDocs rev-parse HEAD`):
  ```json
  {
    "$schema": "./engine.config.schema.json",
    "product": "snowarch",
    "repo": "farstic/ai-servicenow-architect",
    "cli": "snowarch",
    "mcp": { "serverKey": "servicenow", "package": "@farstic/snowarch", "packageDir": "packages/snowarch" },
    "floors": { "claudeCode": "2.1.214", "node": "20.0.0", "git": "2.34.1" },
    "docs": { "family": "australia", "pin": "ba513f2c62d3698ef5bfdd8044110226b8419689", "areasFile": "vendor/docs-areas.txt" },
    "roster": { "skills": 28, "agents": 9 }
  }
  ```
  `product` and `cli` are both `snowarch` by D-01(b); they are separate keys because `product` names the global config directory (`~/.config/snowarch/`) while `cli` names the command, and a future rename of one must not silently rename the other.
- `engine.config.schema.json`: `$schema: https://json-schema.org/draft/2020-12/schema`, `additionalProperties: false` at every level, `required` = every key shown. Constraints: `repo` `^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$`; `mcp.serverKey` `^[A-Za-z0-9_-]+$` (D-01); `mcp.package` `^@[a-z0-9-]+/[a-z0-9-]+$`; `mcp.packageDir` `^packages/[a-z0-9-]+$`; each floor `^\d+\.\d+\.\d+$`; `docs.family` enum `["australia","xanadu","yokohama","zurich"]` (the upstream release-family branches listed in `00` §3.10; `main`/`mobile`/`nofamily`/`other`/`store` are not release families); `docs.pin` `^[0-9a-f]{40}$`; `docs.areasFile` `^vendor/[a-z0-9.-]+$`; `roster.skills`/`roster.agents` integer ≥ 1.
- `tests/engine-config.test.mjs` (`node:test`): (1) the file parses; (2) Ajv 2020 (`ajv/dist/2020.js`, `strict: true`) validates it against the schema; (3) cross-checks against reality: `mcp.packageDir` exists and its `package.json.name` equals `mcp.package`; `roster.skills` equals the number of `.claude/skills/*/SKILL.md`; `roster.agents` equals the number of `.claude/agents/*.md`; (4) `git ls-files -s vendor/ServiceNowDocs` — when a gitlink exists (after ARC-03), its SHA equals `docs.pin`; before ARC-03 the check is reported as skipped with the reason "no gitlink yet (ARC-03)". Check (4) is what turns the `01` §10 "pin == gitlink (lint)" rule into a test without waiting for ARC-03.
- Root `devDependencies`: `"ajv": "^8.17.1"` (dev only; `npm ci --omit=dev` never installs it, so the runtime footprint criterion is unaffected).

> **Amendment 2026-09-08.** Two corrections to the design note above, both from decisions taken after it was written. **(a) `floors.git` is `2.34.1`, not `2.25.0`** — **ADR-0008** (Accepted 2026-09-07) supersedes ADR-0001's value: nothing below 2.34.1 has been measured, and below it the corpus recipe silently omits five root files including `LICENSE` (spike S-07). The literal JSON above is corrected in place. **(b)** the schema declares `$schema` as an allowed property, because `additionalProperties: false` at the top level would otherwise reject the editor hint the design note itself puts in the file.
>
> **A finding for ARC-01-S07, from running this story's test:** `.gitignore`'s `node_modules/` does **not** ignore a **symlink** named `node_modules` — a trailing slash matches directories only, and git reported `?? node_modules`. Setups that symlink their store (pnpm, some yarn layouts) would leave it untracked-but-visible. S07 should carry `node_modules` without the slash, or both forms.

**Acceptance criteria.**
1. `node -e "JSON.parse(require('fs').readFileSync('engine.config.json','utf8'))"` exits 0.
2. `node --test tests/engine-config.test.mjs` passes on macOS, Linux, Windows (via S11) and reports the gitlink check as skipped until ARC-03 lands, then as passed.
3. Changing `mcp.serverKey` to `service now` (with a space) or `docs.pin` to a 7-character SHA makes the test fail with Ajv's message naming the offending path (`/mcp/serverKey`, `/docs/pin`).
4. Adding an unknown top-level key (`"tier": 2`) fails the test (`additionalProperties`).
5. Every constant named in the `01` §3 comment for `engine.config.json` — product name, server key, floors (claude/node/git), docs family + pin, roster expectations — resolves to a key in the file (checked by reading the file, not by prose).
6. `grep -rn "snow-mcp" engine.config.json` returns nothing.

**Tasks.**
1. Read the full docs SHA from the engine's working tree; write the file and the schema.
2. Add `ajv` to root `devDependencies` (S05 wires the root `package.json`; if S04 lands first, commit the two files and wire the dependency in S05).
3. Write the test; run criteria 2–4 locally (negative cases as temporary edits, then revert).
4. Document each key's consumer ARC in `docs/ARCHITECTURE.md` (S12).

**Test strategy.** Unit (`node:test` + Ajv) in CI on all nine matrix cells from S11. Negative cases are exercised by the test itself using in-memory mutated copies of the object (so criteria 3–4 run in CI, not only by hand).

**Dependencies.** S02 (roster on disk), S03 (`packages/snowarch/package.json` name). D-01 closed; S-11 (Claude Code floor) may later raise `floors.claudeCode` — a one-line edit.

**Size.** M — 1 day including the cross-checks and the mutated-copy negative tests.

**Risks / open points.** The schema's `docs.family` enum must be extended when ServiceNow adds a family; `./snowarch docs family <name>` (ARC-03) will need to edit both the config and, if new, the enum. Recorded as an ARC-03 note.

**Definition of done.** Both files and the test merged; test green in CI (S11); consumer table in `docs/ARCHITECTURE.md`.

---

### ARC-01-S05 — Root `package.json`, workspaces, lockfile; `npm ci` proven on three OSes

**As** CI and the bootstrap (ARC-06 step B04) **I want** a root `package.json` with npm workspaces, a single root lockfile and the agreed scripts **so that** `npm ci --ignore-scripts` (dev) and `npm ci --omit=dev --ignore-scripts` (runtime) install the server's dependencies from one lockfile on macOS, Linux and native Windows.

**Context.** README deliverable (root `package.json`, scripts, lockfile); `01` §3 root line (`workspaces ["packages/*", "tools/snowarch"]`), §4.2 B04 (`npm ci --omit=dev --ignore-scripts` at the root, ~72 MB pre-cut / ~27 MB post-cut per ARC-00-S08), §13 (Node-only tooling); `03` S-15 (root `npm ci --omit=dev` footprint and module resolution — ARC-00 spike); README acceptance criteria 1 (clean `npm ci` on three OSes) and 6 (≤ 80 MB); R-1 (version `2.0.0` at release → `2.0.0-dev` now).

**Scope.** In: root `package.json`, `package-lock.json` (lockfileVersion 3), a private placeholder `tools/snowarch/package.json` so the second workspace is real from day one, `tests/run.mjs` (a 15-line test launcher), the root `overrides` block moved from the server. Out: any content of `tools/snowarch/bin` or `lib` (ARC-06); `scripts/build-dist.mjs` (ARC-04), `scripts/release.mjs` (ARC-09) — the root scripts point at their final paths and fail with `MODULE_NOT_FOUND` until those ARCs land; nothing in ARC-01 CI calls them.

**Design notes.**
- Root `package.json`:
  ```json
  {
    "name": "ai-servicenow-architect",
    "version": "2.0.0-dev",
    "private": true,
    "description": "AI ServiceNow Architect — Claude Code engine + bundled ServiceNow MCP server (snowarch)",
    "license": "Apache-2.0",
    "repository": { "type": "git", "url": "git+https://github.com/farstic/ai-servicenow-architect.git" },
    "type": "module",
    "engines": { "node": ">=20.0.0" },
    "workspaces": ["packages/*", "tools/snowarch"],
    "scripts": {
      "bootstrap": "node tools/snowarch/bin/snowarch.mjs bootstrap",
      "doctor": "node tools/snowarch/bin/snowarch.mjs doctor",
      "test": "node tests/run.mjs && npm test --workspaces --if-present",
      "lint": "npm run lint --workspaces --if-present",
      "type-check": "npm run type-check --workspaces --if-present",
      "build:dist": "node scripts/build-dist.mjs",
      "release": "node scripts/release.mjs"
    },
    "overrides": { "minimatch": "^10.2.2" },
    "devDependencies": { "ajv": "^8.17.1" }
  }
  ```
- `tools/snowarch/package.json`: `{ "name": "@farstic/snowarch-tools", "version": "2.0.0-dev", "private": true, "type": "module", "description": "Zero-dependency bootstrap/doctor CLI; populated by ARC-06" }`. Measured on npm 11.13.0: a `packages/*` match without `package.json` is skipped and a literal workspace path without one is tolerated, so the placeholder is for determinism across npm 10 (Node 20) rather than a hard requirement. ARC-05's `packages/contract` therefore needs no `package.json`; `docs/ARCHITECTURE.md` says so.
- `tests/run.mjs`: reads `tests/*.test.mjs` with `readdirSync`, then `spawnSync(process.execPath, ['--test', ...files], { stdio: 'inherit' })` and exits with the child's status. Reason: on Windows npm runs scripts through `cmd.exe`, which performs no glob expansion, and whether `node --test` expands a glob argument itself varies by Node line — so a file list computed by Node is the one form that behaves identically on all nine CI cells (`01` §13: all shipped tooling is Node; nothing assumes a POSIX shell). S11 criterion 1 is the proof.
- Lockfile: `npm install --package-lock-only --ignore-scripts` at the root produces `package-lock.json` (`lockfileVersion: 3`) with `packages/snowarch` and `tools/snowarch` as workspace links; commit it. Delete nothing else — the server's own lockfile was removed in S03.
- Footprint: `npm ci --omit=dev --ignore-scripts` then measure `node_modules` — today's server production tree is 72 MB (`00` §2) and the server package has no install scripts (`01` §4.2 B04), so the README's ≤ 80 MB gate holds before ARC-04-S01 prunes `pdfmake`/`pptxgenjs` (72 → 27 MB `du`, 176 → 135 packages, `02` D-03 as re-measured by ARC-00-S08). **State the metric in the gate** — `du -sk` (block-rounded) and summed file content differ by ~15 MB on this tree; the gate uses the summed-content figure the CI job computes, and the `≤ 80 MB` pre-cut ceiling reads `≤ 60 MB` content / `≤ 80 MB du`. Measure with `node -e` (recursive `statSync` sum) so the number is comparable across OSes (`du` semantics differ).
- Module resolution: hoisting puts `@modelcontextprotocol/sdk` etc. in root `node_modules`; `packages/snowarch/dist/server.js` resolves them by walking up — the S-15 spike's fallback (`--workspace packages/snowarch`) is recorded in `docs/CONTRIBUTING.md` in case a later dependency breaks hoisting.

**Acceptance criteria.**
1. On a clean clone (`git clone … && cd …`) with only github.com and registry.npmjs.org reachable, `npm ci --ignore-scripts` exits 0 on the images behind `ubuntu-latest`, `macos-latest` and `windows-latest` with Node 20, 22 and 24 (nine cells; proven by S11, which records the resolved image labels from the job logs in `docs/CONTRIBUTING.md` — the `-latest` aliases move over time).
2. `npm ci --omit=dev --ignore-scripts` on `ubuntu-latest` produces a `node_modules` of ≤ 80 MB (measured by `node -e` as above) and `npm ls --omit=dev --depth=0 --workspace packages/snowarch` lists exactly the nine runtime dependencies of the imported `package.json` (`@inquirer/prompts`, `@modelcontextprotocol/sdk`, `chalk`, `commander`, `dotenv`, `ora`, `pdfmake`, `pptxgenjs`, `zod`).
3. `npm test` at the root runs `tests/run.mjs` (engine tests) and then `vitest run` in `packages/snowarch`; exit 0 on all nine cells.
4. `npm run lint` at the root runs the server's `eslint src tests` and exits 0 (the imported ESLint 9 config; `tools/snowarch` has no lint script and is skipped by `--if-present`).
5. `node -e "const l=require('./package-lock.json');console.log(l.lockfileVersion, Object.keys(l.packages).filter(k=>/^(packages|tools)\//.test(k)).join(','))"` prints `3 packages/snowarch,tools/snowarch`.
6. `npm ci --ignore-scripts` writes nothing outside `node_modules/` (`git status --short` is empty afterwards on every OS — no lockfile churn between npm 10 and npm 11).
7. Negative: with `registry.npmjs.org` blocked, `npm ci` fails with `ENOTFOUND`/`ECONNREFUSED` and nothing partial is left that a second run cannot repair (`rm -rf node_modules` is never necessary — `npm ci` removes it itself).
8. `npm explain minimatch --workspace packages/snowarch 2>/dev/null | grep -E "^minimatch@"` lists only `minimatch@10.x` versions — the `overrides` block moved to the root still applies to the workspace's transitive dependencies.

**Tasks.**
1. Write the root and `tools/snowarch` `package.json`; move `overrides` from the server; generate and commit the lockfile.
2. Write `tests/run.mjs`; wire `ajv` from S04.
3. Local proof on macOS: criteria 2–6 and 8.
4. Push; S11 proves criterion 1 on the matrix; record the measured footprint per OS in `docs/CONTRIBUTING.md`.

**Test strategy.** Integration: the CI matrix itself (S11) is the test for criterion 1; criterion 2 is a dedicated `footprint` job. Criterion 6 is a `git status --porcelain` step after install in every cell. Criterion 7 is manual (macOS, once) — documented in `docs/CONTRIBUTING.md`, not automated.

**Dependencies.** S03 (server present, its lockfile removed), S04 (`ajv`). ARC-00 S-15 verdict, if already available, is quoted; if not, this story's criterion 2 *is* the measurement S-15 asked for and its result is fed back to `03` §A.

**Size.** M — 1 day; the cross-OS proof depends on S11 but the local proof and the launcher are same-day work.

**Risks / open points.** npm 10 vs 11 lockfile normalisation differences (criterion 6) — if a cell rewrites the lockfile, pin the CI npm version with `npm i -g npm@<x>` in the workflow and record it in `docs/CONTRIBUTING.md`. `engines.node` is advisory (`engine-strict` is off by default) — the doctor (ARC-08) enforces the floor, not npm.

**Definition of done.** Root manifest, placeholder workspace, lockfile and launcher merged; nine green cells in S11; footprint recorded.

---

### ARC-01-S06 — Single version of record and `tests/version-consistency.test.mjs`

**As** a maintainer **I want** one version string (`2.0.0-dev`) in the root `package.json`, mirrored byte-exactly in both workspaces and in a machine-readable `CLAUDE.md` line, with a test that fails on any divergence **so that** the five counters of P-12 and the five files of P-19 collapse to one, and ARC-09's release script has a single place to bump.

**Context.** P-12 (five version counters, 0 tags — `CLAUDE.md:14` v2.8.0, footer v2.7.8, CHANGELOG 2.7.6, badges 2.6, skills 1.0.0/1.1.0/2.0.0), P-19 (server: `package.json` 1.0.0, `server.json`/`smithery.yaml` 4.0.0, `desktop/package.json` 3.0.3, `docs/TOOLS.md` v2.6.0, dashboard v4.0.0 — `00` §2); `01` §12 principle 5 and R-1 (first release `2.0.0`, root == package); README deliverable `tests/version-consistency.test.mjs`.

**Scope.** In: the version fields of root, `packages/snowarch`, `tools/snowarch`; the `CLAUDE.md` marker line; the test. Out: skill `version:` frontmatter (ARC-02 moves it under `metadata.version` — minor fold in `02`); `docs/CHANGELOG.md` generation, README badge, tags (ARC-09); the `CLAUDE.md` heading and footer prose (ARC-02 rewrites `CLAUDE.md` ≤ 200 lines and must keep the marker line).

**Design notes.**
- Marker line. Replace `CLAUDE.md` line 14 (`**Engine version:** v2.8.0 — authoritative version-of-record for this file. …`) with exactly:
  `**Version:** 2.0.0-dev — the version of record is the root package.json; this line is written by scripts/release.mjs (ARC-09). Supersedes engine v2.8.0 and snow-mcp 1.0.0.`
  and drop ` v2.8.0` from the line-1 heading (`# CLAUDE.md — ServiceNow Architecture Engine (Tier 2 / Claude Code)` — the "Tier 2" wording is ARC-02's vocabulary sweep, untouched here). These two edits are the only ARC-01 changes to `CLAUDE.md`; they are version strings, not behaviour.
- `tests/version-consistency.test.mjs` (`node:test`): read `package.json`, `packages/snowarch/package.json`, `tools/snowarch/package.json`; assert all three `version` fields are identical and match `^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$`; read `CLAUDE.md`, find exactly one line matching `^\*\*Version:\*\* (\S+) `, assert the capture equals the root version; assert no `v?\d+\.\d+\.\d+` token appears in the first 20 lines of `CLAUDE.md` *other than on the marker line itself* (the marker line legitimately says "Supersedes engine v2.8.0 and snow-mcp 1.0.0"; the heading must not carry a second counter); when a `docs/CHANGELOG.md` exists with a `## [x.y.z]` heading, the topmost heading version ≤ root version (semver compare on the numeric triple; pre-release suffix ignored) — a forward guard for ARC-09.
- The engine's `docs/CHANGELOG.md` (stops at 2.7.6) is imported as-is; ARC-09 regenerates it. The test only guards ordering, so the stale file does not fail ARC-01. *(Amended 2026-09-08, two corrections from running it. **(a) The heading shape is not `## [x.y.z]`** — the imported file uses `## v2.7.6 — …`, so a guard written for the bracketed form would have matched nothing and passed **vacuously**, which is the same failure mode as a check whose subject is absent. The test accepts both shapes. **(b) The reasoning that "the stale file does not fail ARC-01" does not hold as stated**: the guard is "topmost ≤ root", and **2.7.6 > 2.0.0-dev**, because the product renumbered *downward* at the merge (engine v2.8.0 → product 2.0.0). The test therefore reports this case as **skipped with its reason**, and — so the skip cannot mask a real regression later — it skips **only while the file is provably the un-regenerated import**, detected by its reference to the predecessor repository `farstic/claude-servicenow-live`. Once ARC-09 regenerates it, the guard becomes a live assertion with no code change.)*

**Acceptance criteria.**
1. `node --test tests/version-consistency.test.mjs` passes on the committed tree.
2. Editing `packages/snowarch/package.json` to `2.0.1-dev` fails the test with `packages/snowarch/package.json version 2.0.1-dev != root 2.0.0-dev`.
3. Deleting the marker line from `CLAUDE.md` fails the test with `CLAUDE.md: expected exactly one "**Version:**" line, found 0`.
4. `grep -n "v2.8.0" CLAUDE.md` lists exactly the marker line (14), the roster-count note (line 54, "Roster count (authoritative, v2.8.0)"), the advisory-consults heading (line 120) and the footer paragraph (line 442) — measured on the import; line 1 no longer carries it. Lines 54, 120 and 442 are prose and belong to ARC-02-S08's rewrite, not to this story.
5. `grep -rn '"version"' package.json packages/snowarch/package.json tools/snowarch/package.json` shows `2.0.0-dev` three times.

**Tasks.**
1. Edit `CLAUDE.md` lines 1 and 14 as specified; set the three `version` fields (S05 already did — verify).
2. Write the test; exercise criteria 2–3 as in-test mutated copies (like S04).
3. Add a one-paragraph "Versioning" section to `docs/CONTRIBUTING.md` (S12): never edit a version by hand; `scripts/release.mjs` (ARC-09) is the only writer.

**Test strategy.** Unit, in CI on all cells via `tests/run.mjs`. Mutation cases inside the test file.

**Dependencies.** S05 (three manifests exist). ARC-02 must preserve the marker line (recorded as an ARC-02 constraint in `docs/CONTRIBUTING.md`).

**Size.** S — half a day.

**Risks / open points.** ARC-02's `CLAUDE.md` rewrite could drop the marker; the test catches it. Skill frontmatter `version:` values stay inconsistent (1.0.0/1.1.0/2.0.0) until ARC-02 — deliberately outside this test.

**Definition of done.** Test merged and green; `CLAUDE.md` marker present; CONTRIBUTING paragraph queued for S12.

---

### ARC-01-S07 — `.gitignore` / `.gitattributes` / `.editorconfig` and the never-commit test

**As** an individual practitioner **I want** the checkout to make it impossible to commit `.local/`, `clients/`, `.env`, `.claude/settings.local.json` or a credential-shaped literal, and to check out scripts with the right line endings on Windows **so that** the per-checkout store (D-04) and engagement content (confidentiality firewall) never reach GitHub and native Windows (Q-B) gets working `.ps1`/`.cmd` files.

**Context.** `01` §3 (`.gitignore` and `.gitattributes` lines), §7 ("gitignored"), §13 (LF/CRLF policy), D-04, `00` §3.11 (`memory/` convention not ignored; `.DS_Store` not ignored), P-13; README story 7 "verify `.local/`, `clients/`, `.env`, `settings.local.json` never commit". ARC-09 lists `.gitattributes` too — ARC-01 creates it, ARC-09 verifies `git ls-files --eol` on the Windows runner.

**Scope.** In: the three dotfiles at the root (replacing the imported engine `.gitignore`), `tests/never-commit.test.mjs`. Out: the doctor's runtime check for credential-shaped keys in settings files (ARC-08); CI credential-literal grep as a separate job (this test *is* it, run by `npm test`).

**Design notes.**
- `.gitignore` (exact):
  ```
  # per-checkout state — never committed (01 §3, §7; D-04)
  .local/
  clients/
  deliverables/
  memory/
  .env
  .env.*
  !.env.example
  .claude/settings.local.json

  # dependencies and build output
  node_modules/
  packages/snowarch/dist/
  *.tsbuildinfo
  coverage/

  # OS and editors
  .DS_Store
  Thumbs.db
  .vscode/
  .idea/

  # legacy scratch locations from the engine era (removed by ARC-10 once nothing writes them)
  .backups/
  scratchpad/
  diagram-preview/
  node-compile-cache/
  ```
  Notes: `.mcp.json` and `.claude/settings.json` are **not** ignored — the product commits them (ARC-05/ARC-06); the never-commit test's literal scan guards the interval until then. `packages/snowarch/dist/` is ignored only until ARC-04-S13 commits `dist/` (that story deletes the line). `memory/` is added now because P-13 names it and the cost is zero; ARC-10 owns the convention.
- `.gitattributes` (exact):
  ```
  * text=auto eol=lf
  *.mjs text eol=lf
  *.md  text eol=lf
  *.json text eol=lf
  *.sh  text eol=lf
  *.ps1 text eol=crlf
  *.cmd text eol=crlf
  *.png binary
  *.drawio text eol=lf
  *.svg text eol=lf
  ```
- `.editorconfig`: `root = true`; `[*] charset = utf-8, end_of_line = lf, insert_final_newline = true, trim_trailing_whitespace = true, indent_style = space, indent_size = 2`; `[*.md] trim_trailing_whitespace = false`; `[*.{ps1,cmd}] end_of_line = crlf`; `[Makefile] indent_style = tab` (not present, harmless).
- `tests/never-commit.test.mjs`: (1) for each of `.local/instances.json`, `.local/audit.jsonl`, `clients/acme/notes.md`, `deliverables/x.docx`, `memory/MEMORY.md`, `.env`, `.env.local`, `.claude/settings.local.json`, `.DS_Store`, `node_modules/x`: `git check-ignore -q <path>` exits 0; (2) `.env.example` and `packages/snowarch/.env.example` are **not** ignored; (3) `git ls-files` contains no path matching `^(\.local|clients|deliverables|memory)/|(^|/)\.env$|settings\.local\.json$|(^|/)\.DS_Store$`; (4) credential-literal scan over `git ls-files` with extensions `json md ts mjs sh yml yaml ps1 cmd`: fail on a JSON-style `"(password|passwd|secret|token|[a-z_]*_key)"\s*:\s*"([^"]{8,})"` or env-style `^[A-Z0-9_]*(PASSWORD|SECRET|TOKEN)[A-Z0-9_]*=(.{8,})$` whose value does not start with `YOUR_`, `your_`, `<`, `${`, `***`, `changeme`, `example`, `placeholder` (case-insensitive) — the placeholder set is a constant at the top of the test; (5) `git ls-files --eol` for every `*.ps1`/`*.cmd` shows `i/lf w/crlf` and for every `*.sh`/`*.mjs` shows `i/lf w/lf` — the `text` attribute stores LF in the index and `eol=` fixes the working-tree ending on every OS (`gitattributes(5)`; the policy itself is `01` §13), so the index side is always `i/lf` and only the `w/` column differs per extension. Check (4) is the "CI grep fails on credential-shaped literals anywhere in the tree" of `01` §7.

**Acceptance criteria.**
1. `node --test tests/never-commit.test.mjs` passes on the committed tree on macOS, Linux and Windows (S11).
2. `printf '{"password":"hunter2hunter2"}' > .local/instances.json && git add -A && git status --short` shows nothing staged from `.local/` (ignored), on all three OSes.
3. `git add -f .local/instances.json` (forcing) followed by the test fails with `never-commit: tracked path matches forbidden pattern: .local/instances.json`.
4. Committing a file `docs/x.md` containing `SERVICENOW_BASIC_PASSWORD=RealLookingValue123` fails the test with the file and line number; the same line with `=your_password` passes.
5. On every cell (the `eol=` attribute overrides `core.autocrlf`), `git ls-files --eol -- '*.ps1' '*.cmd'` shows `i/lf w/crlf` and `-- '*.sh' '*.mjs'` shows `i/lf w/lf` after a fresh clone with the runner's default `core.autocrlf` (ARC-09-S08 repeats this with the real launchers; ARC-01 has only the imported `scripts/md-to-docx.ps1`, `scripts/render-diagrams.ps1`, `scripts/render-pdf-pages.ps1` and the eight `scripts/*.sh` files to check — measured listing 2026-09-04).
6. `git ls-files | grep -c "^\.gitignore$"` = 1 and `test ! -e packages/snowarch/.gitignore` (one ignore file for the monorepo).

**Tasks.**
1. Replace the imported `.gitignore`; add `.gitattributes`, `.editorconfig`; run `git add --renormalize .` and commit the (expected: none) line-ending changes.
2. Write the test; run criteria 2–4 by hand once, then keep 3–4 as in-test mutated fixtures written under a temporary directory with `git -C` (the test must never leave the working tree dirty).
3. Push; S11 proves criterion 1 and 5 on Windows.

**Test strategy.** Unit (`node:test`, spawns `git`) on every cell. Manual once for criterion 2. `docs/CONTRIBUTING.md` (S12) tells contributors the test exists and why `--force`-adding is pointless.

**Dependencies.** S05 (test launcher). S02/S03 (imported trees to scan).

**Size.** S — half a day.

**Risks / open points.** The literal scan is heuristic; it will not catch a base64 blob. That is acceptable for 1.0 (principle 3 is enforced structurally by D-04's store location, the scan is defence in depth). Whether `.claude/settings.json` should stay untracked until ARC-05 generates it: yes — nothing in ARC-01 creates it, and criterion (4) guards the interval.

**Definition of done.** Three dotfiles and the test merged; green on all cells; `docs/CONTRIBUTING.md` paragraph queued.

---

### ARC-01-S08 — Licence sweep: replace every old licence claim, remove contradictions

**As** a maintainer **I want** every remaining licence statement in the tree to say Apache-2.0 **so that** D-02 is true of the whole repository, not only of the root `LICENSE`, and the README acceptance criterion "every source file header that named the old licence is updated" is met.

**Context.** D-02 ("remove the contradictory `smithery.yaml` MIT claim and the engine's 'Proprietary' wording"); `00` §2 Licence row (`docs/README.md:157-159`; server `LICENSE:1-13`; `smithery.yaml:15`); P-32. Measured on 2026-09-04: no `src/`, `tests/` or `scripts/` file in either repository carries a licence header (`grep -rn "All rights reserved\|Source Available\|SPDX\|@license"` → none), so the "header sweep" reduces to the files listed below.

**Scope.** In: `packages/snowarch/LICENSE` (replace the source-available text with the verbatim Apache-2.0 text — or delete it, see notes), `packages/snowarch/README.md:83-85` licence section, `packages/snowarch/package.json.license` (done in S03; verified here), `docs/README.md:157-159`; `smithery.yaml`, `TERMS.md`, `server.json` are already deleted in S03 (verified here). Measured on 2026-09-04: in the server, `git grep -l "All rights reserved"` matches only `LICENSE`; `CONTRIBUTING.md`, `SECURITY.md`, `EXAMPLES.md`, `CHANGELOG.md` and `docs/TOOLS.md` carry no licence wording at all, and the engine's only licence statement is `docs/README.md:157-159`. Out: rewriting any of those documents beyond the licence lines (ARC-02 / ARC-04).

**Design notes.**
- `packages/snowarch/LICENSE`: keep a file (npm packs `LICENSE*` automatically and consumers of `npx @farstic/snowarch` expect one in the tarball); content = verbatim Apache-2.0, identical to the root `LICENSE` (`cmp LICENSE packages/snowarch/LICENSE` exits 0).
- `packages/snowarch/README.md` §License → `Apache-2.0 — see [LICENSE](./LICENSE) and the repository [NOTICE](../../NOTICE). © 2026 Cvetomir Grigorov.`
- `docs/README.md` §License → `Apache-2.0 — see the repository [LICENSE](../LICENSE) and [NOTICE](../NOTICE).` (the file itself is rewritten by ARC-02; the licence paragraph must not survive that rewrite in its old form — the S10 ratchet forbids the string `not licensed for redistribution`).
- Ratchet patterns added to S10's forbidden list (no allow-list entries permitted): `Source Available License`, `All rights reserved. Internal use only`, `not licensed for redistribution`, `license: MIT`, `SEE LICENSE IN LICENSE`. *(Amended 2026-09-08: these five must be scanned with `':!docs/plans' ':!docs/decisions' ':!docs/spikes'`, for the reason in criterion 1 — the decision record and the spike archive quote the superseded texts deliberately, and 11 of the 12 pre-sweep hits were exactly that. A ratchet without those exclusions would force 11 allow-list rows on day one, or the deletion of ADR-0002's evidence.)*

**Acceptance criteria.**
1. `git grep -n -i -E "source available|all rights reserved|not licensed for redistribution|license: MIT|SEE LICENSE IN LICENSE" -- . ':!LICENSE' ':!packages/snowarch/LICENSE' ':!NOTICE' ':!docs/plans' ':!docs/decisions' ':!docs/spikes'` prints nothing — **and** `git grep -c "Source Available" docs/decisions/ADR-0002-licence.md` is ≥ 1, so the evidence is still there.

   *(Amended 2026-09-08, measured before the sweep. The criterion **as originally written could never pass, and passing it would have been the wrong outcome.** The grep hit **12 files**, of which exactly **one** — `docs/README.md:159` — was a licence claim this repository makes. The other eleven are the repository's own **record of why D-02 was needed**: ADR-0002 quotes the source-available text as its evidence, `00`/`02` and the ARC-00/01/04 stories describe the problem and the fix, `docs/spikes/licence/header-sweep.txt` exists precisely to list these strings, and `docs/spikes/S-15-npm-ci/fixture/` is a frozen pre-relicensing build. Making the original grep return nothing would have required **deleting the evidence that the relicensing decision was taken** — the opposite of what D-02 needs. The criterion is therefore scoped to files that state the repository's terms, and a second, positive clause asserts the quotations survive, so the check cannot be "fixed" later by erasing the record. This is also why the ratchet patterns in S10 must carry the same three path exclusions.)*
2. `cmp LICENSE packages/snowarch/LICENSE` exits 0.
3. `node -e "console.log(require('./packages/snowarch/package.json').license, require('./package.json').license)"` prints `Apache-2.0 Apache-2.0`.
4. `npm pack --dry-run --workspace packages/snowarch 2>&1 | grep -E "LICENSE|NOTICE"` lists `LICENSE` (npm includes it automatically) — `NOTICE` is added to the package `files` in ARC-09's publish story if the optional npm channel is enabled; noted, not done here.
5. `test ! -e packages/snowarch/smithery.yaml && test ! -e packages/snowarch/TERMS.md && test ! -e packages/snowarch/server.json`.

**Tasks.**
1. Replace `packages/snowarch/LICENSE`; edit the two README licence sections; grep-and-fix any `All rights reserved` line.
2. Add the five patterns to the S10 forbidden list (or, if S08 lands before S10, note them for S10).
3. Run criterion 1 on the tree; commit `chore(licence): Apache-2.0 everywhere (D-02)`.

**Test strategy.** Criterion 1 becomes permanent through the S10 ratchet test (unit, every cell). Criteria 2–5 manual once; 2 and 3 are also asserted by the S10 test as cheap invariants.

**Dependencies.** S02, S03 (files present). ARC-00 D-02 closed.

**Size.** S — two hours.

**Risks / open points.** None material. If the owner later wants a `SPDX-License-Identifier: Apache-2.0` header in every source file, that is an ARC-04 (server) / ARC-02 (engine scripts) decision; ARC-01 records the option in `docs/CONTRIBUTING.md` and does not add headers to the ~140 tracked files under the server's `src/`, `tests/` and `scripts/` now.

**Definition of done.** Sweep commit merged; criterion 1 empty; ratchet patterns registered.

---

### ARC-01-S09 — Merge `reference/templates/` and `templates/` into `templates/`; update every reference

**As** the engine (Claude) and its skills **I want** one `templates/` folder holding the six delivery templates **so that** P-39 is closed and every path in the governance texts resolves.

**Context.** P-39 (`00` §3.1: `reference/templates/` holds ADR, RTM, RAID, NFR; `templates/` holds HLD, Gherkin); `01` §3 `templates/ ADR, RTM, RAID, NFR, HLD, Gherkin (merged)`; README story 10; ARC-02 README: "templates (P-39) are merged by ARC-01-S09 and only their references are updated here" — this story updates the references too, since they are pure path strings; ARC-00 README notes the ADR template path becomes `templates/adr-template.md` "after ARC-02" — after this story, in fact.

**Scope.** In: `git mv` of the four files; deletion of the empty `reference/`; replacement of the 17 occurrences of `reference/templates/` in the five root files (`prompt-patterns.md`, `governance-rules.md`, `taxonomy.md`, `README.md`, `CLAUDE.md` — measured 2026-09-04: `grep -rl --include='*.md' --include='*.sh' reference/templates .` outside `ServiceNowDocs/` → exactly these five; no skill, agent or script references the path). Out: template content changes; `.claude/skills/diagramming-specialist/templates/` (skill-local, stays).

**Design notes.**
- `git mv reference/templates/adr-template.md templates/adr-template.md` (and `nfr-checklist-template.md`, `raid-log-template.md`, `traceability-matrix-template.md`); `rmdir reference/templates reference`.
- `sed -i '' 's#reference/templates/#templates/#g'` on the five files (macOS `sed`); verify with `git grep -n "reference/templates"` → nothing.
- Add `reference/templates` to S10's forbidden patterns (no allow-list).
- Resulting `templates/`: `adr-template.md`, `gherkin-feature-template.md`, `hld-template.md`, `nfr-checklist-template.md`, `raid-log-template.md`, `traceability-matrix-template.md`.

**Acceptance criteria.**
1. `ls templates | sort` prints exactly the six file names above; `test ! -d reference`.
2. `git grep -n "reference/templates"` prints nothing.
3. `git log --follow --oneline templates/adr-template.md | wc -l` ≥ 1 and the oldest entry predates the import merge (history preserved through the rename).
4. Every path of the form `templates/<name>.md` mentioned in `CLAUDE.md`, `governance-rules.md`, `prompt-patterns.md`, `taxonomy.md`, `README.md` exists (`git grep -oh "templates/[a-z-]*\.md" -- CLAUDE.md governance-rules.md prompt-patterns.md taxonomy.md README.md | sort -u | while read p; do test -f "$p" || echo "MISSING $p"; done` prints nothing).

**Tasks.**
1. `git mv` ×4; remove `reference/`; `sed` the five files; run criteria 1–4; commit `refactor(templates): one templates/ folder (P-39)`.
2. Register the forbidden pattern with S10.

**Test strategy.** Criteria 2 and 4 are absorbed by the S10 ratchet test (forbidden pattern) and by ARC-02's skills lint (path references). Manual once here.

**Dependencies.** S02.

**Size.** S — one hour.

**Risks / open points.** The engine's own `scripts/verify-structure.sh` (imported, deleted by ARC-02) may reference `reference/templates` — it does not (measured); if a later grep finds a hit in `scripts/legacy/`, it is allow-listed there (reference material).

**Definition of done.** Commit merged; criteria 1–4 pass; pattern registered.

---

### ARC-01-S10 — Purge engagement residue; legacy-name ratchet test

**As** a maintainer **I want** the imported tree free of one engagement's journals and scratch, and a test that lets old names, old paths and old licence strings only ever *decrease* **so that** the README's "old names appear only in `docs/ARCHITECTURE.md` and ADRs" criterion is enforced mechanically from now until ARC-02 and ARC-04 finish their rewrites.

**Context.** P-13 (engagement residue: `scratchpad/`, `.backups/`, `docs/LIVE-ARTEFACTS-CATALOGUE.md` — three artefacts on the author's PDI; `VALIDATION-TESTS.md:692-715` dated runs), P-15 (names: 15 engine files / 84 occurrences of `claude-servicenow-live|NowAIKit|nowaikit`; server: `package.json`, `server.json`, `smithery.yaml`, `TERMS.md`, `clients/*`, `docs/INSTALLATION.md`, `docs/SERVICENOW_OAUTH_SETUP.md`), P-18 (`npx servicenow-mcp` installs a stranger's package); README acceptance criterion 5; the confidentiality firewall (`CLAUDE.md` "never echo client-specific content into generic locations"). ARC-02 owns the prose rewrites of `CLAUDE.md`, `README.md`, `docs/*.md`, the field notes; ARC-04 owns the server docs — this story must not pre-empt them, so it ships a ratchet rather than a rewrite.

**Scope.** In: `git rm docs/LIVE-ARTEFACTS-CATALOGUE.md`; removal of the two dated sections of `VALIDATION-TESTS.md` ("Test Run History", "Structural / Engine Integrity Runs", lines 692–715 of the import) — the tests T-01…T-18 themselves stay for ARC-02; `tests/no-legacy-names.test.mjs` + `tests/legacy-names.allowlist.json`; mechanical URL replacement in files nobody else rewrites. Out: any rewrite of `CLAUDE.md`, `README.md`, `client-onboarding.md`, `scripts/README.md`, `docs/*.md`, `docs/nowaikit-field-notes.md` (ARC-02 — `CLAUDE.md` is ARC-02-S08, the docs are ARC-02's README/INSTALL narrative stories), of `packages/snowarch/README.md`, `docs/*.md`, the `src/cli/index.ts` update check (ARC-04-S01 code cut, ARC-04-S14 docs rewrite). Those files go on the allow-list with an owner.

**Design notes.**
- Residue: `git rm docs/LIVE-ARTEFACTS-CATALOGUE.md` (it names the author's live instance artefacts; ARC-02 does not carry it either — this story removes it so the rest of ARC-01's tests never scan it). `VALIDATION-TESTS.md`: delete from the `## Test Run History` heading to end of file (both dated sections); leave everything above untouched. `scratchpad/`, `.backups/`, `node-compile-cache/` never entered the tree (S02 exclusion) and are ignored (S07).
- Forbidden patterns (regex, case-sensitive unless noted), scanned over `git ls-files` with extensions `md json ts mjs sh yml yaml ps1 cmd` plus extension-less `LICENSE`/`NOTICE`:
  `cvetomirgrigorov/servicenow-mcp` · `claude-servicenow-live` · `NowAIKit` · `nowaikit` · `mcp__servicenow-mcp__` · `mcp__nowaikit__` · `@farstic/snow-mcp` · `packages/snow-mcp` · `reference/templates` · `servicenow-mcp-server` · `npx (-y )?servicenow-mcp\b` · `registry\.npmjs\.org/servicenow-mcp` · `Source Available License` · `not licensed for redistribution` · `license: MIT` · `SEE LICENSE IN LICENSE` · `Tier [012] \(` — **scanned in `*.md` files only** (the engine's three-tier vocabulary; ARC-02 owns the sweep; allow-listed until then). Measured 2026-09-04: 23 server files `packages/snowarch/src/tools/*.ts` carry header comments such as `Read tools: Tier 0. Write tools: Tier 1 (WRITE_ENABLED=true).` (the server's own flag-tier vocabulary, `00` §3.6); those are ARC-04's principle-4 sweep and are deliberately outside this pattern so the ratchet does not require 23 allow-list rows for code comments · the S03 leaf-cut paths as tracked-path patterns (`^packages/snowarch/(desktop|clients|\.github)/`, `^packages/snowarch/(Dockerfile|server\.json|smithery\.yaml|glama\.json|TERMS\.md)$`).
- Always-exempt files (history and decisions are allowed to name the past): `docs/ARCHITECTURE.md`, `docs/decisions/ADR-*.md`, `NOTICE`, `tests/no-legacy-names.test.mjs`, `tests/legacy-names.allowlist.json`, `scripts/legacy/**` (reference material, deleted by ARC-10), `docs/MIGRATION.md` (ARC-10-S01 — it must name the old registrations and stores it removes).
- `tests/legacy-names.allowlist.json` (initial content — every entry must have a real match today, else the test fails; owner is informational). The list below is the measured 2026-09-04 result of running the forbidden patterns over the engine's tracked files (`git grep -l` for the name patterns → 14 files, minus `docs/LIVE-ARTEFACTS-CATALOGUE.md` which this story deletes; the `Tier [012] \(` pattern adds `VALIDATION-TESTS.md` and `scripts/README.md`) and over the server's tracked files outside the S03 cut (`README.md`, `docs/INSTALLATION.md`, `docs/SERVICENOW_OAUTH_SETUP.md`, `src/cli/index.ts`; `package.json` is clean after the S03 identity/keywords edit):
  ```json
  { "_rule": "A file may appear here only while it still contains a forbidden pattern and a named ARC owns its rewrite. The test fails if an allow-listed file has no match (remove the entry) or a non-listed file has one (fix it or list it with an owner).",
    "files": {
      "CLAUDE.md": "ARC-02", "README.md": "ARC-02", "client-onboarding.md": "ARC-02", "VALIDATION-TESTS.md": "ARC-02",
      "scripts/README.md": "ARC-02",
      "docs/ADVANCED-WEB-SETUP.md": "ARC-02", "docs/BUSINESS-OVERVIEW.md": "ARC-02", "docs/CHANGELOG.md": "ARC-09",
      "docs/IMPORT-NOTES.md": "ARC-02", "docs/INSTALLATION-GUIDE.md": "ARC-02", "docs/MCP-OPERATIONS-GUIDE.md": "ARC-02",
      "docs/README.md": "ARC-02", "docs/TECHNICAL-ARCHITECTURE.md": "ARC-02", "docs/USER-GUIDE-AND-EXAMPLES.md": "ARC-02",
      "docs/nowaikit-field-notes.md": "ARC-02",
      "packages/snowarch/README.md": "ARC-04",
      "packages/snowarch/docs/INSTALLATION.md": "ARC-04", "packages/snowarch/docs/SERVICENOW_OAUTH_SETUP.md": "ARC-04",
      "packages/snowarch/src/cli/index.ts": "ARC-04"
    } }
  ```
  Measured as *not* matching (and therefore absent from the list): `packages/snowarch/CHANGELOG.md`, `EXAMPLES.md`, `CONTRIBUTING.md`, `SECURITY.md`, `docs/TOOLS.md`, every file under `.claude/`, `.githooks/`, `scripts/*.sh`, `governance-rules.md`, `taxonomy.md`, `prompt-patterns.md`. The implementer re-runs the measurement after S03/S08/S09 and trims (the test enforces it). `docs/IMPORT-NOTES.md` and `docs/CHANGELOG.md` contain only the old repository URL — replace the URL mechanically in this story if the owner ARC agrees the file is otherwise untouched; otherwise leave them listed.
- Mechanical replacements done here (no prose change, files no other ARC rewrites): `farstic/claude-servicenow-live` → `farstic/ai-servicenow-architect` in `docs/IMPORT-NOTES.md`; nothing else.
- Test output format on failure: `no-legacy-names: <file>:<line>: "<pattern>" (owner: <ARC or "none — fix or allow-list">)`, and `no-legacy-names: allow-list entry "<file>" has no match — remove it` for the ratchet direction.
- README acceptance criterion 5, as met at ARC-01's exit: the grep returns matches only in `docs/ARCHITECTURE.md`, ADRs, and files present on the allow-list with an owner; at ARC-02's and ARC-04's exit the allow-list is empty (their acceptance criteria say so in `docs/CONTRIBUTING.md`).

**Acceptance criteria.**
1. `test ! -e docs/LIVE-ARTEFACTS-CATALOGUE.md`; `grep -c "Test Run History\|Structural / Engine Integrity Runs" VALIDATION-TESTS.md` = 0; `grep -c "^## T-18" VALIDATION-TESTS.md` = 1 (tests kept; the test headings are H2 — `## T-18 — Estimation & Sizing consult …` at line 575 of the import).
2. `node --test tests/no-legacy-names.test.mjs` passes on the committed tree on all cells.
3. Adding the line `see https://github.com/cvetomirgrigorov/servicenow-mcp` to `templates/hld-template.md` fails the test naming `templates/hld-template.md:<n>` and `owner: none`.
4. Removing every old name from `docs/IMPORT-NOTES.md` while leaving it on the allow-list fails the test with the "has no match — remove it" message (ratchet).
5. `git grep -n -E "cvetomirgrigorov/servicenow-mcp|claude-servicenow-live|NowAIKit|nowaikit" -- '*.md' '*.json' '*.ts' | cut -d: -f1 | sort -u` ⊆ {`docs/ARCHITECTURE.md`} ∪ allow-listed files ∪ `scripts/legacy/**` ∪ `NOTICE`.
6. `git grep -h -o -E "[a-z0-9-]+\.service-now\.com" -- . ':!scripts/legacy' ':!docs/ARCHITECTURE.md' | sort -u` prints at most the documentation placeholder `dev12345.service-now.com` (the host `01` §6.2 and the server docs use as the example), and none of the hostname fragments recorded in the maintainer's local `memory/MEMORY.md` (never committed — the fragments are checked by hand from that file, not spelled in this plan). Measured 2026-09-04: the engine's tracked files contain no `service-now.com` host at all; the untracked `scripts/setup.sh` (moved to `scripts/legacy/` by S02) contains only `dev12345.service-now.com`. `scripts/legacy/` is reference material and is checked by hand once for hostnames — if any real one appears, redact in the import commit of S02.

**Tasks.**
1. Residue removals; commit `chore: purge engagement residue (P-13)`.
2. Write the test and the allow-list; run it; trim the list until it passes; commit.
3. Run criteria 3–4 as in-test mutation fixtures (temporary files under `os.tmpdir()` with a throwaway `git init`, never the working tree).
4. Record the allow-list owner rule in `docs/CONTRIBUTING.md` (S12) and add "allow-list empty for my files" to the acceptance criteria of ARC-02 and ARC-04 (edit their READMEs' criteria — one line each — in the same PR, or raise it to the ARC owner).

**Test strategy.** Unit on every cell via `tests/run.mjs`. Criterion 6 manual once (and again by ARC-10's cutover checklist).

**Dependencies.** S02, S03, S05, S08, S09 (their forbidden patterns), S07 (the test shares the `git ls-files` helper).

**Size.** M — 1 day; most of it is trimming the allow-list against reality and writing the ratchet cleanly.

**Risks / open points.** The `Tier [012] \(` pattern is coarse; if it produces false positives in skill bodies (e.g. "Tier 1 support"), narrow it to `Tier [012] \((design|live|Claude)` — the measured occurrences today (`git grep -l -E 'Tier [012] \('`, engine, 2026-09-04) are `CLAUDE.md`, `README.md`, `VALIDATION-TESTS.md`, `client-onboarding.md`, `docs/ADVANCED-WEB-SETUP.md`, `docs/MCP-OPERATIONS-GUIDE.md`, `docs/TECHNICAL-ARCHITECTURE.md`, `scripts/README.md` and the untracked `SETUP.md` (now `scripts/legacy/`); no file under `.claude/` matches any forbidden pattern (measured: `git grep` over `.claude/`, `.githooks/`, `scripts/` returns nothing), so the skills never appear on the list.

**Definition of done.** Residue commits merged; test green; allow-list trimmed; ARC-02/ARC-04 READMEs carry the "allow-list empty" criterion.

---

### ARC-01-S11 — CI skeleton: three OSes × Node 20/22/24; footprint gate; `claude plugin validate` job

**As** CI **I want** one workflow that installs, lints, type-checks and tests the monorepo on `ubuntu-latest`, `macos-latest`, `windows-latest` × Node 20/22/24 on every push and pull request, plus a footprint job and a best-effort `claude plugin validate` job **so that** every later ARC inherits a green matrix and the README's acceptance criteria 1, 2 and 6 are checked by machines.

**Context.** README deliverable `.github/workflows/ci.yml`; `01` §13 (CI runs on three OSes × Node 20/22/24 on every commit), §12 floors; Q-B (native Windows first-class — ARC-01's Windows cell needs no Git Bash: `npm`, `node`, `git` only; the "no Git Bash on PATH" job is ARC-09's); P-29 (old CI never ran tests); `02` minor fold: `claude plugin validate` on headless CI = spike S-19 (ARC-00) — until its verdict the job is advisory.

**Scope.** In: `ci.yml` with jobs `test` (matrix), `footprint` (ubuntu, `--omit=dev` size gate), `plugin-validate` (ubuntu, advisory until S-19); branch-protection `contexts` filled with the `test` cells; concurrency cancellation. Out: server `dist` rebuild-diff, contract gate, bootstrap/doctor jobs, Windows-without-Git-Bash job, release workflow, docs-bump workflow (ARC-04/05/06/08/09/03 respectively); submodule checkout (ARC-03 adds `vendor/ServiceNowDocs` and its own job).

**Design notes.**
- `.github/workflows/ci.yml` (exact skeleton):
  ```yaml
  name: ci
  on:
    push: { branches: [main] }
    pull_request: {}
  concurrency: { group: ci-${{ github.ref }}, cancel-in-progress: true }
  jobs:
    test:
      name: test (${{ matrix.os }}, node ${{ matrix.node }})
      strategy:
        fail-fast: false
        matrix: { os: [ubuntu-latest, macos-latest, windows-latest], node: [20, 22, 24] }
      runs-on: ${{ matrix.os }}
      steps:
        - uses: actions/checkout@v4            # no submodules until ARC-03
        - uses: actions/setup-node@v4
          with: { node-version: ${{ matrix.node }}, cache: npm }
        - run: npm ci --ignore-scripts
        - run: node scripts/ci/assert-clean.mjs     # exits 1 and prints `git status --porcelain` if the install changed any tracked file (S05 criterion 6); Node, not bash — Q-B
        - run: npm run lint
        - run: npm run type-check
        - run: npm test
    footprint:
      runs-on: ubuntu-latest
      steps:
        - uses: actions/checkout@v4
        - uses: actions/setup-node@v4
          with: { node-version: 22 }
        - run: npm ci --omit=dev --ignore-scripts
        - run: node scripts/ci/footprint.mjs 80     # sums node_modules bytes; exits 1 above 80 MB; prints the number
    plugin-validate:
      runs-on: ubuntu-latest
      continue-on-error: true                     # advisory until ARC-00 S-19 has a verdict; then set to false
      steps:
        - uses: actions/checkout@v4
        - uses: actions/setup-node@v4
          with: { node-version: 22 }
        - run: npm i -g @anthropic-ai/claude-code
        - run: claude plugin validate .claude/skills
        - run: claude plugin validate .claude/agents
  ```
  `scripts/ci/footprint.mjs` is 20 lines of `node:fs` (recursive size of `node_modules`) and `scripts/ci/assert-clean.mjs` is 8 lines of `node:child_process` (`execFileSync('git', ['status', '--porcelain'])`, non-empty → print and exit 1); both live under `scripts/ci/` (maintainer-only per `01` §3). No workflow step uses `shell: bash` — every step is `npm …` or `node …`, so the Windows cell exercises exactly the Q-B assumption (`node`, `npm`, `git` only).
- The `test` job deliberately does **not** run `npm run build` in `packages/snowarch`: `type-check` proves the TypeScript compiles; the built `dist/` is committed by ARC-04, which adds the rebuild-diff job. This is the README risk "stale `dist/`" made explicit: no `dist/` exists in the tree during ARC-01.
- Windows cell: `npm`, `node`, `git` only; every root script is a Node invocation or an `npm` workspace call (S05), so `cmd.exe` suffices — consistent with Q-B. (Git for Windows on the runner image still provides a bash; nothing in this workflow calls it — the "Git Bash removed from PATH" proof is ARC-09-S08.)
- Branch protection: after the first green run, `gh api -X PATCH repos/farstic/ai-servicenow-architect/branches/main/protection/required_status_checks --input checks.json` with the nine `test (…)` contexts and `footprint`; `plugin-validate` is not required until S-19 is CONFIRMED.
- Cache: `cache: npm` keys on the root lockfile; harmless on the first run.

**Acceptance criteria.**
1. A push to `main` runs 11 jobs; the nine `test` cells and `footprint` are green; `plugin-validate` is green or "failed (non-blocking)" with the CLI's own output visible.
2. README acceptance criterion 1 (clean-clone `npm ci --ignore-scripts` on three OSes with only github.com and registry.npmjs.org) is satisfied by the nine green cells — runner images have no other registry configured; no step reaches any other host (the `plugin-validate` job additionally reaches the npm registry for the CLI, and is not part of criterion 1).
3. The `footprint` job log prints `node_modules: <n> MB (limit 80)` with n ≤ 80.
4. Breaking a test on purpose (e.g. change the root version only) turns the nine `test` cells red and blocks merging to `main` (protection contexts wired).
5. `gh api repos/farstic/ai-servicenow-architect/branches/main/protection/required_status_checks --jq '.contexts | length'` = 10.
6. When ARC-00 S-19 records CONFIRMED, flipping `continue-on-error` to `false` and adding `plugin-validate` to the contexts is a one-line change each (task 5, executed by whoever closes S-19).

**Tasks.**
1. Write `ci.yml`, `scripts/ci/footprint.mjs` and `scripts/ci/assert-clean.mjs`; push on a branch; open a PR; watch the 11 jobs; copy the resolved runner image labels (printed by the runner at job start) into `docs/CONTRIBUTING.md`.
2. Fix any OS-specific failure (line endings → S07; lockfile churn → S05 risk note; ESLint path globs on Windows).
3. Merge; wire the required contexts (criterion 5).
4. Record the run URL and the per-OS footprint in `docs/CONTRIBUTING.md` (S12).
5. Conditional: on S-19 CONFIRMED, make `plugin-validate` required.

**Test strategy.** The workflow is its own test; criterion 4 is a deliberate red run on a throwaway branch. No local equivalent for Windows except the S11 cell itself (the maintainer has no Windows machine — `03` R-10).

**Dependencies.** S05, S06, S07, S10 (tests exist), S01 (protection). ARC-00 S-19 for the advisory→required flip (not blocking).

**Size.** M — 1–2 days including the inevitable first Windows red run.

**Risks / open points.** The `-latest` runner aliases move to newer OS images over time without notice — `fail-fast: false` keeps the other cells informative, and `docs/CONTRIBUTING.md` records the image labels seen on the first green run so a later red run can be attributed. `npm i -g @anthropic-ai/claude-code` on a runner may need a login for `plugin validate` — exactly what S-19 determines; until then the job cannot block. macOS runners are the slowest; the repository is public (S01), so standard GitHub-hosted runners do not consume a paid minute budget — the option of scheduling macOS on `main` only is recorded in `docs/CONTRIBUTING.md` for the case the repository is ever made private, not as the default.

**Definition of done.** Workflow merged; 10 required contexts on `main`; footprint and run URL recorded in `docs/CONTRIBUTING.md`.

---

### ARC-01-S12 — `docs/ARCHITECTURE.md` and `docs/CONTRIBUTING.md` first versions

**As** a maintainer (and any future contributor) **I want** two documents that explain the layout, the audience split, where every product constant lives, what was cut and where its history is, and how to run the lints and tests **so that** the repository explains itself without the plan folder, and the README acceptance criterion "old names appear only in `docs/ARCHITECTURE.md` (history section) and ADRs" has a defined home for the history.

**Context.** README deliverable; `01` §3 (tree with comments), §15/§16 (why the layout); `03` R-08 (link the archived repositories from `docs/ARCHITECTURE.md`); D-03 note "nothing is deleted from the source repositories"; `00` §3.1 audience split (end-user runtime / maintainer / optional deliverable toolchain); S03 cut ledger; S04 constant registry; S05–S11 recorded numbers and commands.

**Scope.** In: the two files, replacing the S01 stub. Out: `docs/INSTALL.md`, `MODES-AND-PRESETS.md`, `TROUBLESHOOTING.md`, `PLATFORM-NOTES.md`, `CHANGELOG.md` (ARC-06/02/05/02/09); any edit to the imported engine `docs/*.md` (ARC-02).

**Design notes.**
- `docs/ARCHITECTURE.md` sections, in order: (1) *Purpose and audience split* — three audiences and which directories each touches; (2) *Layout* — the `01` §3 tree, annotated per directory with "owner ARC" and "state at ARC-01 exit" (e.g. `skills/`, `agents/` root mirrors: "imported verbatim; deleted by ARC-02-S01"; `governance/`: "created by ARC-02-S06"; `vendor/`: "ARC-03"; `packages/contract/`: "ARC-05 — needs no package.json, `packages/*` skips directories without one"); (3) *Product constants* — a table of every `engine.config.json` key → meaning → consumers (doctor, lint, generators, launchers) → the ARC that wires the consumer; the rule "never hand-write a constant that this file holds"; (4) *Versioning* — one version (root), the `CLAUDE.md` marker line, `2.0.0-dev` → `2.0.0` at ARC-09, tags `v<x.y.z>` and the two `import/*` tags; (5) *Scope cut ledger (D-03)* — one row per item: source location → removed in ARC-01-S03 or ARC-04-S01 → reason (leaf / imported by surviving code) → where its history lives (`import/snow-mcp-1.0.0`, `farstic/snow-mcp`); (6) *History* — the two source repositories by their old names and URLs (`farstic/claude-servicenow-live` "ServiceNow Architecture Engine" v2.8.0; `farstic/snow-mcp` "ServiceNow MCP Toolkit" 1.0.0; the retired identities `NowAIKit`, `servicenow-mcp`, `mcp__nowaikit__`, `mcp__servicenow-mcp__`), the import commits and tags, the relicensing statement and date, the untouched npm record `@farstic/snow-mcp@1.0.0` and why it is never republished (D-01) — this is the only product file allowed to spell those names (S10 exemption); (7) *Open layout questions* — the D-01 vs `01` §3 CLI-location question from S03 risk (a), handed to ARC-04/ARC-06; the `docs.family` enum note for ARC-03.
- `docs/CONTRIBUTING.md` sections: (1) *Prerequisites* — Node ≥ 20 (22 recommended), git ≥ 2.25, npm; (2) *Install and run the gates* — `npm ci --ignore-scripts`, `npm run lint`, `npm run type-check`, `npm test`, what each does, expected runtime, the per-OS footprint numbers from S05/S11; (3) *Tests in `tests/`* — one paragraph each for `engine-config`, `version-consistency`, `never-commit`, `no-legacy-names` with the exact failure messages and what to do (including the allow-list owner rule and "an empty allow-list for your files is part of ARC-02's and ARC-04's definition of done"); (4) *Generated files* — "never edit a generated file by hand" with the list that will exist (`vendor/docs-areas.txt`, `.claude/rules/00-mode-and-mcp-gate.md`, `governance/mcp-protocols.md`, `docs/TROUBLESHOOTING.md`, `docs/CHANGELOG.md`, `packages/snowarch/dist/**`) and the ARC that adds each generator; (5) *Versioning* — never bump by hand; `scripts/release.mjs` (ARC-09); (6) *Branching and protection* — `main` protected, required checks, the `gh api` commands from S01/S11, merge commits allowed (history), conventional-commit prefixes; (7) *Repository settings reproducibility* — the exact `gh` commands; (8) *Line endings and editors* — `.gitattributes`/`.editorconfig` rules, the Windows note; (9) *Optional* — SPDX headers decision deferred (S08), macOS CI cost option (S11).

**Acceptance criteria.**
1. Both files exist; `docs/ARCHITECTURE.md` contains every directory name from the `01` §3 tree (a script extracts the tree's first-column tokens and greps them — run once by hand) and a "Scope cut ledger" table with exactly 18 rows — the 10 leaf paths removed by S03 (`desktop/`, `clients/`, `.github/`, `Dockerfile`, `server.json`, `smithery.yaml`, `glama.json`, `TERMS.md`, `docs/CLIENT_SETUP.md`, `docs/index.html`) and the 8 import-entangled `src/` items handed to ARC-04-S01 (`src/direct`, `src/a2a`, `src/dashboard`, `src/reports`, `src/prompts`, `src/cli/writers`, `src/cli/detect-clients.ts`, `src/transport/http-server.ts`) — each carrying `ARC-01-S03` or `ARC-04-S01`, plus one note row for `src/api` (survivor per D-03, cut per ARC-04 README item 1 — ARC-04-S01 rules).
2. `docs/ARCHITECTURE.md` "Product constants" table has one row per key in `engine.config.json` (`node -e` count of leaf keys = row count).
3. `docs/CONTRIBUTING.md` lists the four `tests/*.test.mjs` files by name with their failure messages; a new contributor following §2 on a clean clone gets the same output as CI (verified by the maintainer once on macOS).
4. The S10 ratchet test passes with `docs/ARCHITECTURE.md` exempt and `docs/CONTRIBUTING.md` **not** exempt (CONTRIBUTING must describe the old names only by reference to ARCHITECTURE, never by spelling them).
5. No client, engagement, instance hostname or credential appears in either file (criterion 6 of S10 re-run).

**Tasks.**
1. Draft `ARCHITECTURE.md` from the `01` §3 tree, the S03 ledger, the S04 table and the S02/S03 import SHAs.
2. Draft `CONTRIBUTING.md` from the S01/S05/S06/S07/S10/S11 notes.
3. Run criteria 1–5; commit `docs: ARCHITECTURE and CONTRIBUTING (ARC-01)`.

**Test strategy.** Manual review plus the S10 ratchet (automated). Later ARCs update both files as part of their definition of done (each ARC README's "docs updated" line should name them — raised to the plan owner).

**Dependencies.** S01–S11 (numbers and SHAs to record).

**Size.** M — 1 day of writing against a fixed table of facts.

**Risks / open points.** The two documents will be edited by every later ARC; keep sections table-shaped so diffs stay small.

**Definition of done.** Both files merged; criteria 1–5 pass; the S01 stub is gone.

---

## Sizing summary

S01 M (1) · S02 M (1; +1–2 if relicensing resolution (b) is executed inside ARC-01) · S03 L (3) · S04 M (1) · S05 M (1) · S06 S (0.5) · S07 S (0.5) · S08 S (0.25) · S09 S (0.25) · S10 M (1) · S11 M (1.5) · S12 M (1) — **≈ 12 engineer-days nominal, 12–17 days with the first-Windows-run, allow-list-trimming and second-contributor-rewrite contingency.** Under the six-week ceiling by a wide margin; the ARC is sequential (each story depends on the previous ones) so it does not parallelise below ~2.5 calendar weeks for one engineer.

## Cross-ARC obligations created by these stories

- **ARC-00:** ARC-00-S02 must deliver `RELICENSING.md` with the second-contributor resolution (a)/(b) — and, under (b), either the rewritten texts or the owner's answer to the S02 OPEN QUESTION — before S02 tags the import; ARC-00-S08 (S-15) and ARC-00-S12 (S-19) are consumed if available; ARC-00-S11's floor verdict is a one-line `engine.config.json` edit.
- **ARC-02:** preserve the `CLAUDE.md` `**Version:**` marker line (S06; ARC-02-S08 already names "version line owned by the release script"); empty the ARC-02 rows of `tests/legacy-names.allowlist.json` (S10 — not yet an ARC-02 README criterion; raised to the plan owner); delete `scripts/legacy/`? — no, ARC-10-S03 does; remove `.claude/settings.example.json` with the context-mode sweep (D-03 item 9). ARC-02's own stories refer to ARC-01 by the README's original numbering ("story 4" = S02, "story 10" = S09) — the mapping line under the story map resolves them.
- **ARC-03:** `engine.config.json.docs.pin` is the full SHA `ba513f2c62d3698ef5bfdd8044110226b8419689`; the S04 test starts checking gitlink == pin the moment `vendor/ServiceNowDocs` exists; extend the `docs.family` enum when adding a family.
- **ARC-04:** ARC-04-S01 finishes the D-03 cut for the `src/` directories that surviving files import (ledger in `docs/ARCHITECTURE.md`) and rules on `src/api` (D-03 survivor vs ARC-04 README item 1 — ruled in ARC-04-S01: removed, because `src/api/index.ts` is `mountApiRoutes(httpServer)` over the cut HTTP transport and the cut prompts, `mcp:src/api/index.ts:14-17`; the survivor sentence's `src/api` is void once D-03 item 6 is cut); ARC-04-S13 removes the `packages/snowarch/dist/` line from `.gitignore` when committing `dist/`; ARC-04-S14 empties the ARC-04 allow-list rows (`packages/snowarch/README.md`, `docs/INSTALLATION.md`, `docs/SERVICENOW_OAUTH_SETUP.md`) and ARC-04-S01 the `src/cli/index.ts` row (update check against `registry.npmjs.org/servicenow-mcp`); the 23 `src/tools/*.ts` header comments using the server's `Tier 0/1 (…)` flag vocabulary are ARC-04's principle-4 sweep (outside the ARC-01 ratchet, which scans `Tier` in `*.md` only); agree with ARC-06 where `instance`/`doctor` vs `bootstrap`/`docs`/`mode`/`upgrade` live (D-01 vs `01` §3).
- **ARC-05:** `packages/contract/` needs no `package.json` (measured); if it gets one, add it to the version-consistency test.
- **ARC-06:** `tools/snowarch/package.json` placeholder exists (`@farstic/snowarch-tools`, private); fill `bin/` and `lib/`; the root scripts `bootstrap`/`doctor` already point at `tools/snowarch/bin/snowarch.mjs`.
- **ARC-09:** ARC-09-S01 bumps `2.0.0-dev` → `2.0.0` in three manifests + the `CLAUDE.md` marker via `scripts/release.mjs`; `.gitattributes` is in place — ARC-09-S08 verifies `git ls-files --eol` (`i/lf w/crlf` for `*.ps1`/`*.cmd`) on the Windows cell with Git Bash off PATH; make `plugin-validate` required once S-19 is CONFIRMED.
- **ARC-10:** ARC-10-S03 deletes `scripts/legacy/` and reduces the allow-list to zero; ARC-10-S06's cutover checklist re-runs S10 criterion 6.
