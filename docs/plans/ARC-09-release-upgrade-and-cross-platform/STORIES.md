# ARC-09 — Stories

Status: Draft · Decisions applied: D-01…D-06, Q-A, Q-B, R-1…R-3 · Source: README.md of this ARC · Last updated: 2026-09-04

Names and versions in this file follow the owner's rulings of 2026-09-04 (`02-DECISIONS-NEEDED.md`): package directory **`packages/snowarch`**, npm name **`@farstic/snowarch`** (a new record — `@farstic/snow-mcp@1.0.0` is never touched), `bin` **`snowarch`**, first unified release **`2.0.0`** (R-1; root and package versions equal), MCP server key `servicenow` → tools `mcp__servicenow__snow_*` (D-01), project skill **`/snowarch`** with `status` · `setup-instance` · `doctor` (R-2), native Windows first-class **conditional on ARC-00 S-03 / S-04 / S-08** with the pre-recorded "Git Bash required" fallback (Q-B), proxy/CA behaviour per R-3 (ARC-04 owns the agent; this ARC proves the doctor's proxy checks in CI and gives `upgrade` a proxy-aware failure message). Vocabulary: **Mode** `design-only` | `live`; **Preset** `read-only` | `pdi-developer` | `full` | `custom`. Design principle 10 ("Propose, don't impose", `01` §2) applies to every interactive command this ARC adds (`release.mjs` plan confirmation, `upgrade` plan confirmation) with `--yes` for CI.

Conventions. "Old server" = `~/work/snow-mcp` (`package.json` name `servicenow-mcp` 1.0.0, `bin` `dist/cli/index.js`, CI on Node 20/21 never running tests, `release.yml` building the Electron desktop app — `00` §4.9). "Old engine" = `~/work/AI-Architect-Claude` (no `.github/workflows`, no `.gitattributes`, pre-commit chain inert until `core.hooksPath` is set — `00` §3.9). Neither repository has a single git tag. Exit codes used by `tools/snowarch` (ARC-06-S02): `0` ok · `1` failure · `2` usage / precondition · `3` preflight.

## Story map

| ID | Title | Size | Depends on | Delivers |
|---|---|---|---|---|
| ARC-09-S01 | `scripts/release.mjs`: preflight, gates, version writes, release commit, annotated tag with contract sha and docs pin | L | ARC-01 S06/S11, ARC-02 S08, ARC-03 S06, ARC-04 S13, ARC-05 S09 | One command that produces one commit and one `v<x.y.z>` tag, or refuses without writing anything |
| ARC-09-S02 | `docs/CHANGELOG.md` generation from conventional commits; commit-message lint in CI; the 2.0.0 "supersedes" and migration notes | M | S01; ARC-04 S14 | A generated changelog the release script writes; commits that cannot slip the convention unnoticed |
| ARC-09-S03 | `.github/workflows/release.yml`: on `v*` tags re-run every gate on three OSes, create the GitHub Release with doctor JSON and install-metrics assets | M | S01, S02; ARC-03 S05/S11, ARC-06-S03/S14, ARC-08-S01/S11 | A release page per tag whose assets prove the tag on macOS, Linux and Windows |
| ARC-09-S04 | `./snowarch version` extended (tag, commit, tag-message comparison; `--json` superset of ARC-06-S02's shape; feeds the doctor's `engine` header) | S | ARC-05 S10, ARC-06-S02, ARC-03 S01, ARC-08-S01; S01 (tag format) | The user-side mirror of what the tag records |
| ARC-09-S05 | Input-hash invalidation table: `lib/inputs.mjs`, `state.staleSteps()`, `tests/input-hash.test.mjs`, `docs/ARCHITECTURE.md` section | M | ARC-06-S03; ARC-03 S02; ARC-04 S06 | Exactly the affected bootstrap steps re-run after a checkout change |
| ARC-09-S06 | Store schema migration framework in `packages/snowarch` (explicit, versioned, 0600 backup, credential values never touched) | M | ARC-04 S02, S04, S06, S12; ARC-05 S06; ARC-08-S04 | `./snowarch store migrate`; the server refuses an outdated or newer schema with a named remedy |
| ARC-09-S07 | `./snowarch upgrade [--to vX.Y.Z] [--check]`, the SessionStart "behind origin" nudge, and the upgrade fixture harness | L | S04, S05, S06; ARC-06-S03/S09; ARC-08-S08 | Upgrade = fetch + checkout + a second `bootstrap` run + doctor; credentials byte-identical; proven with two fixture releases |
| ARC-09-S08 | CI matrix completion: every job on the intended cells; the Windows job without Git Bash (launchers, `--password-stdin`, MCP handshake, hook in exec form) | L | ARC-00 S06/S07/S13, ARC-03 S02/S11, ARC-04 S13, ARC-05 S09, ARC-06-S08/S14, ARC-07-S01/S04/S05, ARC-08-S11; S02, S03, S07, S09 | Nine green cells plus the native-Windows proof on every commit (Q-B) |
| ARC-09-S09 | Line-ending proof: `tests/eol.test.mjs` over `git ls-files --eol`; launchers run from a CRLF-default Windows checkout | S | ARC-01 S07, ARC-06-S10/S11 (S08 later consolidates the `eol` job — consumer) | No CRLF/LF regression can merge; `bootstrap.cmd` and `bootstrap.ps1` run after a Windows clone |
| ARC-09-S10 | Optional `publish-npm.yml`: `npm publish --provenance` of `@farstic/snowarch` from a release tag, manual dispatch, dry-run by default (roadmap `01` §17 item 2) | S | S01, S03; ARC-04 S01 | A guarded, never-automatic secondary channel that can only ever publish the new package name |
| ARC-09-S11 | `docs/CONTRIBUTING.md` release / upgrade / CI-matrix sections; `docs/INSTALL.md` "Upgrading" section; `docs/ARCHITECTURE.md` versioning section | S | S01–S10 | The maintainer and user documentation for everything this ARC ships |

README stories → this map: README 1 → S01; README 2 → S02; README 3 → S03; README 4 (version, upgrade, nudge) is **split** into S04 (`version`) and S07 (`upgrade` + nudge) because `upgrade` needs the input-hash table (S05) and the migration framework (S06) first; README 5 → S05; README 6 → S06; README 7 → S08; README 8 → S09; README 9 → S10 (package name corrected to `@farstic/snowarch` per D-01); README 10 → S11.

---

## Stories

> **Carried in from ARC-08-S03 (ruling, 2026-09-10).** `ROLE_BUNDLE_MAP` is not in
> `packages/snowarch/dist/contract.json`, so `scripts/gen-readme-tables.mjs` reads it out of the
> built module as data (`scripts/lib/bundles.mjs`) — the only way that generator could run on a
> clone with no `node_modules`. Putting the bundle map INTO the contract is the right home for it
> and moves the contract sha, so it belongs to a release story with a deliberate pin bump rather
> than to a fix. Whichever ARC-09 story next touches `scripts/build-dist.mjs` should take it, drop
> `scripts/lib/bundles.mjs` and its parity test, and quote the pin outputs.

### ARC-09-S01 — `scripts/release.mjs`: preflight, gates, version writes, release commit, annotated tag with contract sha and docs pin

> **Amendment 2026-09-11 (from the delivery).** Five departures, and one bug the fixture found.
>
> 1. **The supported flow is four steps, not one.** `main` requires 42 status checks with
>    `strict: true`, so a release commit pushed straight to it carries no checks and is refused —
>    the story's one-shot flow cannot land here. The flow of record:
>    `release.mjs <x.y.z> --yes --allow-branch release/v<x.y.z>` on a branch cut from `main`
>    (writes + commit, **no tag**) → pull request to `main`, CI runs the checks on the release
>    commit itself → `release.mjs <x.y.z> --tag-only` on `main` at the merge commit → `git push
>    origin v<x.y.z>`. `--allow-branch` therefore also suppresses the tag: a tag created on a
>    release branch would name a commit that the merge is about to replace. Recorded in
>    `docs/CONTRIBUTING.md`; S03's `release.yml` triggers on the tag.
> 2. **The README is generated, so the writer edits the HEAD.** `README.md` = `docs/README-head.md`
>    + `docs/INSTALL.md` body + `docs/README-tail.md`, byte-asserted by `gen-readme --check` inside
>    the lint the release has just passed. The version line and the badge live in the head, and the
>    README is regenerated afterwards. A writer that edited `README.md` directly would produce a
>    tree whose own lint fails — after the gates had already passed, which is the worst moment to
>    find out. `tests/version-consistency.test.mjs` learned the head's field: it is the **fourth**
>    version counter, and a release that left it behind would ship a README announcing the previous
>    version with nothing failing.
> 3. **There was no `confirm` in `inputs.mjs`.** There were THREE line readers — `bootstrap.mjs`'s
>    `stdinAsker`, `doctor/index.mjs`'s `defaultAsk` (whose comment already claimed it was "the same
>    reader the plan screen uses", a claim nothing enforced) and the plan screen's injected `ask`.
>    ARC-09-S01 made the claim true: `tools/snowarch/lib/ask.mjs`, used by all three and by the
>    release prompt. `null` for end-of-input is the contract, and `isYes` treats it as a refusal —
>    a closed stdin must never read as a yes.
> 4. **A ninth preflight check, in effect: the pin and the artefact must already agree.** The tag
>    records the contract sha; `packages/contract/required-tools.json` records the same value. A
>    release whose two records disagreed would carry a sha nobody pinned, so the run refuses with
>    both abbreviated shas and the `pin.mjs` command.
> 5. **The message for check 8 is split in two.** "Node ≥ 20" and "npm resolvable" fail for
>    different reasons and a maintainer can act on only one of them at a time:
>    `release: Node <v> is below the floor of 20 — upgrade Node first` and `release: npm is not on
>    PATH`.
>
> *The bug.* The first fixture run passed a release on a repository git could not describe. The git
> helper returned `''` for a failed command, so a `git status --porcelain` that could not run — the
> corpus gitlink pointed at a gitdir that was not there — came back as an empty string, which reads
> as a CLEAN TREE. A refusal to answer and an answer of "nothing" must never be the same value; the
> helper now throws unless the caller passed `allowFail`, and `release()` turns that into
> `release: git <cmd> failed — <first line of stderr>` with exit 2.


**As** a maintainer **I want** one command, `node scripts/release.mjs <x.y.z>`, that refuses to run on a dirty or stale tree, runs every gate, writes the version into every place that carries it, commits once and creates one annotated tag whose message records the contract sha and the docs pin **so that** the product has exactly one version counter and one tag per release (P-12, P-19) and a release can never be cut from a tree that CI would reject (P-29).

**Context.** README deliverable 1 and acceptance criteria 1–2; `01` §12 (root `package.json.version` is the only counter; `CLAUDE.md` line, README badge and changelog written by the script; tag `v<x.y.z>` records contract sha and docs pin), §11 ("a release cannot be tagged unless all three pass"), `03` R-02 (stale `dist/`). R-1: the first version this script cuts is **2.0.0**. ARC-01 S06 already collapsed the counters to `2.0.0-dev` in root / `packages/snowarch` / `tools/snowarch` and the `CLAUDE.md` marker line `**Version:** 2.0.0-dev — …`; ARC-05 S09 provides `scripts/contract-gate.mjs --skip-build`; ARC-04 S13 provides `scripts/build-dist.mjs` and the rebuild-and-diff rule.

**Scope.** In: `scripts/release.mjs` and `scripts/lib/release/*.mjs`; the version writers (three `package.json`, `package-lock.json`, `CLAUDE.md` marker, README badge); the gate sequence; the commit; the annotated tag; `--dry-run`, `--yes`, `--push`, `--tag-only`, `--allow-branch`, `--allow-prerelease`, `--offline`; `tests/release.test.mjs`. Out: changelog content (S02 — S01 only calls `writeChangelog()` and ships a stub that inserts the version heading); the CI release workflow (S03); npm publish (S10); any bump of the docs pin (that is `./snowarch docs sync --upstream`, ARC-03 S07 — the release records whatever gitlink is committed, it never moves it). A tempted implementer must **not** make the script commit a rebuilt `dist/` for the maintainer: a stale `dist/` is a refusal (README acceptance 2), not something the release silently repairs.

**Design notes.**
- Invocation: `node scripts/release.mjs <x.y.z> [--dry-run] [--yes] [--push] [--tag-only] [--allow-branch <name>] [--allow-prerelease] [--offline] [--no-install]`. Also reachable as `npm run release -- 2.0.0` (root script from ARC-01 S05). Node ≥ 20, stdlib only (`node:fs`, `node:child_process`, `node:path`, `node:crypto`, `node:readline`); on Windows spawn `npm.cmd` / `git.exe` via `spawnSync(cmd, args, { shell: process.platform === 'win32' })` — no bash anywhere (Q-B; a maintainer may release from Windows).
- **Preflight** (exit 2, nothing written, each message exact):
  1. Version argument matches `^\d+\.\d+\.\d+$` (or `^\d+\.\d+\.\d+-[0-9A-Za-z.]+$` with `--allow-prerelease`); else `release: version "2.0" is not x.y.z`.
  2. `git tag -l v<x.y.z>` is empty; else `release: tag v2.0.0 already exists`.
  3. New version is semver-greater than the newest existing `v*` tag (ignored when no tag exists — the 2.0.0 case); else `release: 1.9.0 is not greater than the latest tag v2.0.0`.
  4. Branch is `main` (or the `--allow-branch` value); else `release: must run on main (currently on feature/x); use --allow-branch <name> for a hotfix branch`.
  5. `git status --porcelain` is empty (tracked modifications **and** untracked non-ignored files); else `release: working tree not clean:\n<porcelain lines>\nCommit or stash first — nothing was written`.
  6. Unless `--offline`: `git fetch origin <branch>` succeeds and `git merge-base --is-ancestor origin/<branch> HEAD`; else `release: HEAD is behind origin/main — git pull --ff-only first`.
  7. `vendor/ServiceNowDocs/.git` exists and `git ls-tree HEAD vendor/ServiceNowDocs` equals `engine.config.json.docs.pin`; else `release: docs pin mismatch or corpus missing — run ./snowarch docs sync`.
  8. Node ≥ 20 and `npm` resolvable.
- **Plan screen** (principle 10; skipped by `--yes`): prints current version → new version, `git log --oneline v<prev>..HEAD | wc -l` commits, the gates that will run, the files that will be written, whether `--push` is set; `Proceed? [Y/n]`. Enter or `y` proceeds; `n` prints `release: nothing changed` and exits 0 with nothing written (principle 10 — the plan is a proposal, never an imposition). `--dry-run` runs preflight and gates, prints the plan and the exact tag message, writes nothing, exits 0.
- **Gates** (in order; first failure → `release: gate failed: <name> (exit <n>) — nothing was written`, exit 1):
  1. `npm ci --ignore-scripts` (skipped by `--no-install`).
  2. `node scripts/build-dist.mjs` then `git diff --exit-code --quiet -- packages/snowarch/dist`; on a diff: `release: dist/ is stale — run node scripts/build-dist.mjs and commit it in a normal PR, then release` (the diff is left in the tree for inspection; exit 1).
  3. `npm run lint` (engine lint, skills/agents lint, roster `--check`, docs-areas `--check` — whatever ARC-01 S05 / ARC-02 S02/S07 / ARC-03 S02 wired into the root `lint` script).
  4. `npm test` (root runner: engine `node:test` files and the server vitest suite).
  5. `node scripts/contract-gate.mjs --skip-build` (ARC-05 S09).
  6. `./snowarch docs verify` (citations against the pinned corpus, ARC-03; absent corpus is a FAIL, never SKIP).
- **Writes** (only after every gate passed):
  1. `npm version <x.y.z> --no-git-tag-version --workspaces --include-workspace-root` — updates root, `packages/snowarch`, `tools/snowarch` and `package-lock.json` in one npm call (npm ≥ 7 workspace semantics; Node 20/22 bundle npm 10 and Node 24 bundles npm 11 — not cited in `01`/`03`; `tests/release.test.mjs` runs the real `npm version` call on all nine cells, which is the proof).
  2. `CLAUDE.md`: replace the single line matching `^\*\*Version:\*\* \S+ ` (ARC-01 S06 marker) with `**Version:** <x.y.z> — the version of record is the root package.json; this line is written by scripts/release.mjs. Supersedes engine v2.8.0 and snow-mcp 1.0.0.`; zero or two matches → abort before any write with `release: CLAUDE.md marker line missing or duplicated`.
  3. `README.md`: replace the badge `![version](https://img.shields.io/badge/version-<old>-blue)` with the new version (`-` in a prerelease escaped as `--` per shields.io); the badge is inserted by this story's first run if absent (line 3 of the README, after the title and the one-line description).
  4. `docs/CHANGELOG.md` via `writeChangelog(version, date)` (S02; the S01 stub turns `## Unreleased` into `## <x.y.z> — <YYYY-MM-DD>` and re-creates an empty `## Unreleased` above it).
  5. Re-run `node --test tests/version-consistency.test.mjs` (ARC-01 S06) as a post-write check; failure aborts with `git checkout -- .` of the touched files and exit 1.
- **Commit**: `git add package.json package-lock.json packages/snowarch/package.json tools/snowarch/package.json CLAUDE.md README.md docs/CHANGELOG.md` (explicit list, never `-A`); `git commit -m "chore(release): v<x.y.z>"` (a conventional-commit subject so S02's lint accepts it).
- **Tag**: `git tag -a v<x.y.z> -F <tmpfile>` with the message exactly:
  ```
  snowarch v<x.y.z>

  contract: <sha256 hex of packages/snowarch/dist/contract.json at HEAD>
  docs-pin: <40-hex gitlink of vendor/ServiceNowDocs at HEAD>
  claude-floor: <engine.config.json.floors.claudeCode>
  node-floor: <engine.config.json.floors.node>
  git-floor: <engine.config.json.floors.git>
  ```
  The three trailers named by the README (`contract`, `docs-pin`, `claude-floor`) are mandatory; `node-floor` / `git-floor` are added so `./snowarch version` (S04) and `release.yml` (S03) can verify all floors from the tag alone. `git show v<x.y.z>` displays the message because the tag is annotated. `--sign` passes `-s` when the maintainer has `user.signingkey`; default unsigned.
- **`--tag-only`** (for a `main` protected by "require pull request"): verifies that the tree at HEAD already carries `<x.y.z>` everywhere (the four version fields, marker, badge, changelog heading) and that HEAD is a merge of a commit whose subject is `chore(release): v<x.y.z>`, then creates only the tag. The two-phase flow (`--allow-branch release/v2.0.0` → PR → merge without squash → `--tag-only` on `main`) is documented in S11; the default one-shot flow assumes ARC-01 S01's protection requires status checks but allows the maintainer's direct push.
- **Push**: never by default. Final line: `Released v2.0.0 (commit <short>) — push with: git push origin main --follow-tags`. With `--push` the script runs exactly that command.
- **Files**: `scripts/release.mjs` (argument parsing, orchestration), `scripts/lib/release/preflight.mjs`, `gates.mjs`, `writers.mjs`, `tag.mjs` (also exports `parseTagMessage(text) → { contract, docsPin, floors }` reused by S03/S04/S07). The gate runner is injectable so unit tests can stub it.

**Acceptance criteria.**
1. On a clean, green `main` with `vendor/ServiceNowDocs` present, `node scripts/release.mjs 2.0.0 --yes` exits 0, `git log -1 --format=%s` is `chore(release): v2.0.0`, `git tag -l v2.0.0` prints the tag, and `git show v2.0.0 | head -12` displays `contract: <64 hex>`, `docs-pin: <40 hex>`, `claude-floor: 2.1.214`, `node-floor: 20.0.0`, `git-floor: 2.25.0`. (README acceptance 1, first half.)
2. After criterion 1, `sha256sum packages/snowarch/dist/contract.json` equals the tag's `contract:` value and `git ls-tree HEAD vendor/ServiceNowDocs | cut -f1 | cut -d' ' -f3` equals `docs-pin:`; `node --test tests/version-consistency.test.mjs` passes; `grep -c "2.0.0" CLAUDE.md README.md` ≥ 1 each and `grep -rn '"version"' package.json packages/snowarch/package.json tools/snowarch/package.json` shows `2.0.0` three times. (README acceptance 1.)
3. With one uncommitted edit to `packages/snowarch/src/tools/core.ts` (dist stale) the same command prints `release: dist/ is stale — …` and exits 1; `git tag -l v2.0.0` is empty and `git log -1` is unchanged. (README acceptance 2.)
4. With a deliberately failing lint (a skill description of 600 chars) the command prints `release: gate failed: lint (exit 1) — nothing was written`, exits 1, and no file in the tree is modified (`git status --porcelain` shows only the injected change).
5. With an untracked `notes.txt` at the root the command exits 2 with `release: working tree not clean:` followed by `?? notes.txt`.
6. `node scripts/release.mjs 2.0.0 --dry-run` exits 0, prints the tag message verbatim, and leaves `git status --porcelain` empty and `git tag -l` unchanged.
7. `node scripts/release.mjs 1.9.0` after `v2.0.0` exists exits 2 with `release: 1.9.0 is not greater than the latest tag v2.0.0`.
8. The same script runs on `windows-latest` (pwsh, no Git Bash) in the `release-dryrun` CI job (S03) with `--dry-run --offline` and exits 0.
9. Without `--yes`, on a green tree, answering `n` at `Proceed? [Y/n]` prints `release: nothing changed`, exits 0, and `git status --porcelain` and `git tag -l` are unchanged (principle 10; the test drives stdin).

**Tasks.**
1. Write `scripts/lib/release/tag.mjs` (`buildTagMessage`, `parseTagMessage`) with unit tests first — S03/S04/S07 import it.
2. Write `preflight.mjs` with the eight checks and their exact messages.
3. Write `gates.mjs` running the six gates through an injectable runner; `writers.mjs` for the five writes and the rollback on post-write failure.
4. Write `scripts/release.mjs` (argument parsing, plan screen, `--dry-run`, `--tag-only`, `--push`).
5. Insert the README badge line and confirm the `CLAUDE.md` marker (ARC-01 S06 / ARC-02 S08) is present exactly once.
6. `tests/release.test.mjs`: unit tests with a stubbed gate runner in a temp git repo fixture (criteria 3–7 and 9 as fixture mutations); one real `--dry-run --offline --no-install` run of the actual tree as an integration test.
7. Add the `release` section stub to `docs/CONTRIBUTING.md` (final text in S11).

**Test strategy.** Unit (`node:test`) on a temp repository fixture with stubbed gates, all nine CI cells. Integration: the real `--dry-run` on ubuntu/macos/windows × Node 22 in S03's `release-dryrun` job. Manual: the first real run is the 2.0.0 release itself (ARC-10), done from the maintainer's machine after S03 is green.

**Dependencies.** ARC-01 S06 (marker line, version test), S11 (CI skeleton); ARC-02 S08 (`CLAUDE.md` rewrite keeps the marker); ARC-03 S06 (`./snowarch docs verify` command; S03 is the underlying `lib/docs/verify.mjs`); ARC-04 S13 (`build-dist.mjs`); ARC-05 S09 (`contract-gate.mjs --skip-build` — that story documents this exact call).

**Size.** L — 3–5 days: eight preflight checks, six gates, five writers, the two protection flows, and a fixture-based test suite that must run on Windows.

**Risks / open points.** (a) Branch protection on `main` (ARC-01 S01): if "require PR" is on, the one-shot flow cannot push — the `--tag-only` flow covers it; the choice is recorded in S11. (b) `npm version --workspaces` rewrites `package-lock.json` formatting — verified on npm 10; if a future npm reorders keys, the diff is still confined to version fields (the commit is reviewed by CI in S03). (c) The badge is a static shields.io image — no network at release time; the README stays accurate only because the script writes it. (d) A prerelease (`2.1.0-rc.1`) is allowed only with `--allow-prerelease`; `2.0.0` itself is a plain release.

**Definition of done.** Merged; `tests/release.test.mjs` green on all cells; `docs/CONTRIBUTING.md` release stub present; `npm run release` wired; the `release-dryrun` job (S03) green on three OSes.

---

### ARC-09-S02 — `docs/CHANGELOG.md` generation from conventional commits; commit-message lint in CI; the 2.0.0 "supersedes" and migration notes

> **Amendment 2026-09-11 (from the delivery).** Four departures.
>
> 1. **The Notes ruling.** The existing `## Unreleased` block held the per-story entries every PR of
>    this programme added — the human record of how the product was built. They moved into
>    `### Notes` **verbatim**, with the seeded 2.0.0 sentence and the migration heading above them.
>    The generator's groups are for commits from here on; the Notes are what carries a paragraph
>    somebody needed to write, and they survive regeneration by design.
> 2. **The frozen heading is `## Before 2.0.0`**, not `## Before 2.0.0 (engine v2.x line)`, and the
>    baseline for AC 7 is **`bcd4dcd`**, not ARC-02-S05. S05 changed one line of the file; S06
>    (`69d6efa`) added the heading; S08 (`bcd4dcd`) moved the two engine version footers in, which is
>    the last DELIBERATE change to the region and therefore what "unchanged" has to mean.
>    `tests/changelog.test.mjs` compares against `git show bcd4dcd:docs/CHANGELOG.md`.
> 3. **The retired-name sweep is satisfied by assembling the identifiers, not by allow-listing the
>    test.** A test asserting the historical "supersedes" sentence would contain the old repository
>    names forever, so an allow-list entry for it could never go stale — and the ratchet only works
>    because every entry eventually does. The test builds the two identifiers from parts, the idiom
>    `tests/doctor/redact.test.mjs` already uses for addresses. `docs/CHANGELOG.md` keeps its
>    existing ARC-09 allow-list entry; the marker mechanism the story describes
>    (`<!-- retired-name: historical -->`) does not exist in this tree — the allow-list is by FILE.
> 4. **`commitlint.mjs` lints the repository it was RUN in**, not the one it lives in. The story's
>    shape would have made the test spawn it against a fixture and silently lint this checkout
>    instead — passing while proving nothing. `--root` defaults to `process.cwd()`, which is the
>    checkout in CI and the fixture in a test.
>
> 5. **AC 7 cannot be a history comparison.** The first version read
>    `git show bcd4dcd:docs/CHANGELOG.md`; the `test` job clones SHALLOW, so the object is absent and
>    the assertion failed on nine cells where nothing was wrong. The frozen region is a COMMITTED
>    FIXTURE now — `tests/fixtures/changelog-before-2.0.0.md`, written once from that commit — so the
>    comparison works at any depth and a failure prints the lines that moved. The history comparison
>    survives as its own test, named for what it needs and skipping with a reason on a shallow clone.
> 6. **The local base was wrong, and only the local one.** The CI job was always right — drill PR
>    #126 produced exactly one line, the drill's own commit. But `commitlint` run BY HAND defaulted
>    to `origin/main..HEAD`, and `main` lags `develop` by a milestone: on a develop-based branch that
>    is every commit merged since the last release, including subjects written before the convention
>    (ARC-09-S01's own, for one). The local base is now the branch's upstream, or `origin/develop`.
>    Two-dot throughout — `A...B` is the symmetric difference and would pull the base's commits in,
>    which is the opposite of what a lint of "your commits" means.
>
> *The new required context is `commitlint`* — one cell, `pull_request` only, so the check-run name
> is the bare job name. 42 → 43 at the M4 merge.


**As** a maintainer **I want** the changelog section for a version generated from the conventional-commit history since the previous tag, with a hand-written notes block that survives regeneration, and a CI check that every commit on a pull request follows the convention **so that** the changelog is never hand-maintained (P-12 "hand-maintained counts drift") and the 2.0.0 section carries the "supersedes engine v2.8.0 and snow-mcp 1.0.0" statement and the server migration notes (`03` R-03) that existing users need.

**Context.** README deliverable "`docs/CHANGELOG.md` generation (conventional commits)", acceptance criterion 7, risk "conventional-commit discipline slips → commitlint in CI; fallback manually edited section". `01` §3 marks `docs/CHANGELOG.md` GENERATED; ARC-01 S06 imported the old engine changelog (stops at 2.7.6) as-is and left regeneration to this ARC; ARC-02 S05 adds the heading `## Before 2.0.0 (engine v2.x line)` above the imported text and ARC-02 S06 tolerates historical wording ("Tier") only below it; ARC-04 S14 writes `packages/snowarch/CHANGELOG.md` with the 2.0.0 migration note (heading `Migration from snow-mcp 1.0.0`).

**Scope.** In: `scripts/lib/release/changelog.mjs` (`writeChangelog`, `sectionFor`), the `docs/CHANGELOG.md` layout, `scripts/ci/commitlint.mjs` and its CI job, the seeded 2.0.0 notes, `tests/changelog.test.mjs`. Out: rewriting the imported pre-2.0.0 history (kept verbatim under `## Before 2.0.0`); the server package's own `CHANGELOG.md` (ARC-04 S14; S02 links to it and copies its migration bullets into the root changelog at release time).

**Design notes.**
- `docs/CHANGELOG.md` layout (top to bottom): title and one-line rule ("generated by `scripts/release.mjs`; edit only the *Notes* block under *Unreleased*"); `## Unreleased` containing `### Notes` (hand-written, preserved verbatim by the generator) ; one `## <x.y.z> — <YYYY-MM-DD>` section per release, newest first, each with `### Notes` (moved from Unreleased), `### Breaking`, `### Added`, `### Fixed`, `### Changed`, `### Internal`, then a trailer line `Tag v<x.y.z> · contract <first 12 hex> · docs-pin <first 7 hex>`; finally `## Before 2.0.0 (engine v2.x line)` — ARC-02 S05's heading, kept byte-identical — over the imported engine changelog text and one sentence linking the old server history (`packages/snowarch/CHANGELOG.md` and ARC-01 S03's `import/snow-mcp-1.0.0` tag). The generator inserts release sections strictly between `## Unreleased` and that heading and never rewrites anything below it.
- Generation: `git log --format=%H%x1f%s%x1f%b%x1e <prevTag>..HEAD` (from the root commit when no tag exists); parse each subject with `^(feat|fix|perf|refactor|docs|test|build|ci|chore|revert)(\(([^)]+)\))?(!)?: (.+)$`; map `feat` → Added, `fix` → Fixed, `perf`/`refactor` → Changed, everything else → Internal (one bullet per commit, `<scope>: <subject> (<short sha>)`); `!` or a `BREAKING CHANGE:` footer → also listed under Breaking with the footer text; merge commits and `chore(release):` commits skipped. Non-conforming subjects are listed under Internal verbatim with a `(unconventional)` suffix — the generator never fails on history, only the lint does on new commits (README fallback: a manually edited section is always possible through Notes).
- **2.0.0 notes** (seeded by this story into `## Unreleased / ### Notes`, so the first release carries them): the exact sentence `This release supersedes engine v2.8.0 (farstic/claude-servicenow-live) and snow-mcp 1.0.0 (farstic/snow-mcp); both histories are preserved under the import tags.` followed by `#### Migration for snow-mcp 1.0.0 users` with the R-03 bullets transcribed from `packages/snowarch/CHANGELOG.md` (ARC-04 S14): SCRIPTING no longer gates reads; store precedence env > project > global and the legacy `~/.config/servicenow-mcp/instances.json` is no longer read (`./snowarch instance import --from-legacy`, ARC-07); cwd `.env` no longer loaded (`SNOW_ENV_FILE` only); the server starts unconfigured instead of exiting; the package is `@farstic/snowarch` 2.0.0 and `@farstic/snow-mcp@1.0.0` stays as it is. The lines naming the old repositories carry the `<!-- retired-name: historical -->` marker ARC-05 S02 requires so the retired-name lint accepts them.
- `scripts/ci/commitlint.mjs` (stdlib, ~60 lines): reads `git log --format=%s <base>..<head>` for the PR range (`GITHUB_BASE_REF`/`GITHUB_SHA` in CI; `origin/main..HEAD` locally), applies the regex above plus `subject ≤ 100 chars`, `scope` from an allow-list derived from the tree (`engine`, `server`, `contract`, `docs`, `bootstrap`, `doctor`, `wizard`, `ci`, `release`, `deps`, or a skill/agent directory name), and prints `commitlint: 3 commits ok` or `commitlint: FAIL <sha> "<subject>" — expected type(scope)?: subject; see docs/CONTRIBUTING.md#commits`. Merge commits and `Merge pull request` subjects are skipped. No npm dependency (the maintainer may swap in `@commitlint/cli` later; the CI job name and message format are the contract). CI job `commitlint` (ubuntu, `pull_request` only, `fetch-depth: 0`), required on `main`.
- `writeChangelog(version, date)` is what S01 calls; it also returns the generated section text so S03 can use `sectionFor(version)` as the GitHub Release body.

**Acceptance criteria.**
1. On a fixture repository with four commits `feat(server): add snow_core_status_read`, `fix(doctor)!: fail on absent corpus` (+ `BREAKING CHANGE:` footer), `docs: typo`, `wip stuff`, `writeChangelog('2.0.0','2026-10-01')` produces a section with Added (1), Fixed (1), Breaking (1, the footer text), Internal (2 — one marked `(unconventional)`), and the trailer line with the fixture tag's contract/docs-pin values.
2. The `### Notes` block under `## Unreleased` before the run appears byte-identical under `## 2.0.0 — 2026-10-01 / ### Notes` after it, and a fresh empty `### Notes` exists under `## Unreleased`.
3. Running the generator twice for the same version is rejected with `changelog: section 2.0.0 already exists` (exit 1) — no duplicate sections.
4. `docs/CHANGELOG.md` at the 2.0.0 release contains the exact "supersedes" sentence and the `#### Migration for snow-mcp 1.0.0 users` heading with at least the five bullets listed above (README acceptance 7); `tests/changelog.test.mjs` asserts both on the committed file until the release, and on the 2.0.0 section afterwards.
5. A pull request whose head adds a commit `updated stuff` fails the `commitlint` job with the `FAIL <sha> "updated stuff" — expected …` line; the same PR with the commit reworded to `chore(ci): update matrix` passes.
6. `git log --format=%s | grep -c "chore(release)"` stays 0 in `## Unreleased` output (release commits are skipped).
7. `## Before 2.0.0 (engine v2.x line)` retains the imported text unchanged (`git diff` of that region against the ARC-02 S05 state is empty).

**Tasks.**
1. Restructure `docs/CHANGELOG.md` into the layout (Unreleased above, ARC-02 S05's `## Before 2.0.0 (engine v2.x line)` below) and seed the 2.0.0 Notes block from `packages/snowarch/CHANGELOG.md` (coordinate wording with ARC-04 S14).
2. Implement `changelog.mjs` (parser, grouping, Notes preservation, trailer) and wire it into S01's writers.
3. Implement `scripts/ci/commitlint.mjs`; add the `commitlint` job; mark it required.
4. Write `tests/changelog.test.mjs` (fixture repo built in a temp dir with `git init` + commits) and `tests/commitlint.test.mjs`.
5. Add the "Commits" section to `docs/CONTRIBUTING.md` (types, scopes, `!`/footer, examples).

**Test strategy.** Unit tests on temp-repo fixtures (all cells); the `commitlint` job on a deliberately non-conforming throwaway PR; the 2.0.0 assertion in `tests/changelog.test.mjs` runs on every commit.

**Dependencies.** S01 (`writeChangelog` call site, `parseTagMessage` for the trailer); ARC-04 S14 (migration bullets); ARC-05 S02 (`retired-name: historical` marker semantics); ARC-01 S11 (CI skeleton).

**Size.** M — 1–2 days.

**Risks / open points.** Commit history before this story lands is not conventional (the imported histories are certainly not) — the generator's `(unconventional)` fallback covers it and the lint applies only to PR ranges. The retired-name lint (ARC-05 S03) must accept the historical marker on changelog lines — coordinate the marker syntax before merging.

**Definition of done.** Merged; `commitlint` required on `main`; `docs/CHANGELOG.md` restructured with the seeded 2.0.0 notes; `docs/CONTRIBUTING.md#commits` written.

---

### ARC-09-S03 — `.github/workflows/release.yml`: on `v*` tags re-run every gate on three OSes, create the GitHub Release with doctor JSON and install-metrics assets

> **Amendment 2026-09-11 (from the delivery).** Five departures.
>
> 1. **`release.yml` is NOT the only workflow that may write.** `docs-bump.yml` has
>    `contents: write` too — it pushes the branch it opens its pull request from. I wrote the claim
>    into the workflow's own header and into a test, and the test caught it within the run. The
>    assertion is a CLOSED SET now (`['docs-bump.yml', 'release.yml']`), which is the true and more
>    useful statement: a third workflow asking for write is a decision somebody has to make in that
>    test.
> 2. **Two scripts the story did not name.** `scripts/ci/release-notes.mjs`, because the story spells
>    the release body as `changelog.mjs --section`, which would put a CLI on a library S01 and S02
>    both import — a module that is sometimes a program is a module whose imports have side effects.
>    And `scripts/ci/assert-assets.mjs`, because criterion 2 requires the redaction check to run on
>    the assets and nothing else in the workflow reads them: a doctor report attached to a public
>    Release is permanent in a way a pasted one is not. It never prints what it finds — printing the
>    secret to prove it was found publishes it in the job log.
> 3. **`--allow-branch` reads the branch from the checkout**, not from `github.head_ref`, which is
>    empty on a push. One expression that is right on both events.
> 4. **The install page's budget moved 250 → 252.** The page gained a fact — every release
>    re-measures the corpus on three platforms and attaches the table — and the page was at its cap.
>    My first attempt paid for the two lines by trimming two provenance strings; `install-page` and
>    `attribution` caught both and were right to. Every figure on that page names where it was
>    measured, and a cap is worth moving for a fact but not for an unattributed number.
> 5. **The rehearsal is not run.** Pushing `v2.0.0-rc.0` creates a PUBLIC Release on a public
>    repository. The procedure is in the pull request, ready to run, and `docs/CONTRIBUTING.md`
>    carries the placeholders for the run URL, the seven asset names, the measured rows and whether
>    `gh` was present on the runner images.


**As** a maintainer **I want** pushing a `v*` tag to re-run every gate on `ubuntu-latest`, `macos-latest` and `windows-latest`, verify that the tag message matches the tree, and publish a GitHub Release whose assets are the three doctor JSON reports and a size/time table of the install **so that** every release is proven on the three platforms after the fact (P-29 "release never fired"; `03` R-10) and the install page can quote measured numbers.

**Context.** README deliverable 2 (`release.yml` on `v*` tags, gates on three OSes, doctor JSON and install-page size/time table as release assets); `01` §12/§13; the old server's `release.yml` built the Electron desktop app on tags (removed by D-03) and is replaced, not adapted. S01 defines the tag message; S02 provides `sectionFor(version)` for the release body.

**Scope.** In: `.github/workflows/release.yml`; `scripts/ci/install-metrics.mjs`; `scripts/ci/verify-tag.mjs`; the `release-dryrun` job added to `ci.yml` (runs S01 in `--dry-run` on every commit so the release path itself is tested continuously). Out: npm publish (S10 — a separate, manual workflow); Docker (D-03); the 2.0.0 release execution itself (ARC-10).

**Design notes.**
- `release.yml`:
  ```yaml
  name: release
  on: { push: { tags: ['v*'] } }
  permissions: { contents: write }
  jobs:
    verify:
      name: verify (${{ matrix.os }})
      strategy: { fail-fast: false, matrix: { os: [ubuntu-latest, macos-latest, windows-latest] } }
      runs-on: ${{ matrix.os }}
      steps:
        - uses: actions/checkout@v4
          with: { fetch-depth: 0 }                 # tags and history for verify-tag and the changelog
        - uses: actions/setup-node@v4
          with: { node-version: 22, cache: npm }
        - run: node scripts/ci/verify-tag.mjs ${{ github.ref_name }}
        - run: npm ci --ignore-scripts
        - run: npm run lint
        - run: npm test
        - run: node scripts/contract-gate.mjs          # rebuild + diff + contract + engine lint + gen:check
        - run: node tools/snowarch/bin/snowarch.mjs bootstrap --mode design --yes   # B02 checks out the pinned corpus (ARC-03 S05 recipe); per-step durationMs lands in .local/bootstrap-state.json (ARC-06-S03)
        - run: node tools/snowarch/bin/snowarch.mjs docs verify
        - run: node tools/snowarch/bin/snowarch.mjs doctor --json --no-network --no-cache > doctor-${{ matrix.os }}.json
        - run: node scripts/ci/install-metrics.mjs ${{ matrix.os }} > install-metrics-${{ matrix.os }}.json
        - uses: actions/upload-artifact@v4
          with: { name: release-${{ matrix.os }}, path: 'doctor-*.json install-metrics-*.json' }
    publish:
      needs: verify
      runs-on: ubuntu-latest
      steps:
        - uses: actions/checkout@v4
          with: { fetch-depth: 0 }
        - uses: actions/setup-node@v4
          with: { node-version: 22 }
        - uses: actions/download-artifact@v4
          with: { pattern: release-*, merge-multiple: true }
        - run: node scripts/ci/install-metrics.mjs --table install-metrics-*.json > install-metrics.md
        - run: node scripts/lib/release/changelog.mjs --section ${{ github.ref_name }} > release-notes.md
        - run: cat install-metrics.md >> release-notes.md
        - run: gh release create ${{ github.ref_name }} --title "snowarch ${{ github.ref_name }}" --notes-file release-notes.md doctor-*.json install-metrics-*.json install-metrics.md
          env: { GH_TOKEN: ${{ github.token }} }
  ```
  `gh` is assumed present on GitHub-hosted runner images (a runner-image fact, not cited in `01`/`03`; the rehearsal run in criterion 1 is the proof — if it is absent, the step becomes `actions/github-script` calling `repos.createRelease`); `contents: write` is the only permission. The Windows leg runs under the runner's default shell (pwsh) with every step a `node` invocation — no Git Bash dependency (Q-B). Every step name is a Node script; no `run: |` bash blocks.
- `scripts/ci/verify-tag.mjs <tag>`: `git cat-file -p refs/tags/<tag>` → `parseTagMessage` (S01); asserts `contract` == sha256 of `packages/snowarch/dist/contract.json` in the checkout, `docs-pin` == `git ls-tree HEAD vendor/ServiceNowDocs` gitlink == `engine.config.json.docs.pin`, the three floors == `engine.config.json.floors`, the tag name's version == root `package.json.version` == `CLAUDE.md` marker; prints `tag v2.0.0 verified` or `tag v2.0.0: contract sha in message (…) != dist/contract.json (…)` and exits 1. A lightweight tag (no message) fails with `tag v2.0.0 is not annotated — create it with scripts/release.mjs`.
- `scripts/ci/install-metrics.mjs <os>`: reads `.local/bootstrap-state.json` (ARC-06-S03's v1 state file records `durationMs` on every step unconditionally — no flag is needed), `du`-equivalent via `node:fs` recursion of `vendor/ServiceNowDocs` and `node_modules`, `git ls-files vendor/ServiceNowDocs | wc -l`-equivalent, and emits `{ os, node, docsBytes, docsFiles, docsSeconds, depsBytes, bootstrapSeconds }`; `--table` merges the three JSON files into the markdown table the install page (`docs/INSTALL.md`, ARC-06-S13) quotes: `| OS | docs on disk | docs files | B02 time | node_modules | bootstrap total |`.
- `ci.yml` job `release-dryrun` (three OSes × Node 22, every push/PR): `npm ci --ignore-scripts`, `node scripts/release.mjs 9.9.9 --dry-run --offline --no-install`. Because `--dry-run` runs the real gates, this job doubles as the "release path never rots" guard; it needs the corpus for gate 6, so it runs `node tools/snowarch/bin/snowarch.mjs docs sync --mode sparse --yes` first (ARC-03 S05; the same recipe ARC-06-S14's `bootstrap` job exercises through B02).

**Acceptance criteria.**
1. Pushing tag `v2.0.0-rc.0` (a rehearsal tag on a throwaway branch, deleted afterwards) runs `verify` on the three OSes and `publish` once; the GitHub Release `v2.0.0-rc.0` exists with exactly seven assets: `doctor-ubuntu-latest.json`, `doctor-macos-latest.json`, `doctor-windows-latest.json`, three `install-metrics-*.json`, `install-metrics.md`.
2. Each `doctor-*.json` validates against ARC-08-S01's schema v1 with `summary.fail == 0` and `mode == "design-only"` (`--no-network --no-cache`, as ARC-08-S11's `doctor` job asserts) and contains no credential-shaped value (the ARC-08 redaction test is re-run on the assets).
3. `install-metrics.md` in the release body shows three rows with non-zero docs size and B02 time; the macOS/Linux docs size lies within the S-07 measured band (≤ 350 MB) and the table is the one `docs/INSTALL.md` links to.
4. A lightweight tag `git tag v9.9.8 && git push origin v9.9.8` fails `verify` at `verify-tag` on all three OSes with `tag v9.9.8 is not annotated …`; no Release is created (`publish` is skipped because `needs` failed).
5. An annotated tag whose `contract:` line is edited to a wrong sha (created by hand for the test) fails `verify-tag` with the `contract sha in message … != …` message.
6. `release-dryrun` is green on every push on the three OSes; introducing a stale `dist/` on a PR turns it red with S01's stale-dist message.
7. The release body starts with the S02 section for the version (Notes, Breaking, Added, …) followed by the metrics table.

**Tasks.**
1. Write `scripts/ci/verify-tag.mjs` and `scripts/ci/install-metrics.mjs` (reads `durationMs` from the ARC-06-S03 state file) with unit tests on fixtures.
2. Write `release.yml`; add `release-dryrun` to `ci.yml`.
3. Rehearse with a prerelease tag on a throwaway branch (criteria 1–5); delete the rehearsal Release and tag.
4. Link `install-metrics.md` of the latest Release from `docs/INSTALL.md` (ARC-06-S13 text) and record the rehearsal numbers in `docs/CONTRIBUTING.md`.

**Test strategy.** Unit for the two scripts; the workflow itself is exercised by the rehearsal tag (manual, once) and by `release-dryrun` on every commit (automatic). Windows leg proves the Node-only release path under pwsh.

**Dependencies.** S01, S02; ARC-06-S03 (`durationMs` in `.local/bootstrap-state.json`), ARC-06-S14 (`bootstrap` CI job — same corpus recipe), ARC-08-S01 (doctor JSON schema v1, `summary.fail`), ARC-08-S11 (`doctor` job assertions and redaction test), ARC-03 S05 (`docs sync`, `--print-recipe`) and S11 (`docs-real.yml`, the three-OS real-corpus proof this workflow repeats on tags).

**Size.** M — 1–2 days plus the rehearsal.

**Risks / open points.** macOS runner minutes (10×) — `verify` runs only on tags, `release-dryrun` on every commit could be limited to ubuntu + windows if cost bites (option recorded in S11). `gh release create` needs `contents: write`; if the repository later enables environment protection, the `publish` job moves behind an environment named `release`.

**Definition of done.** Merged; rehearsal Release created and deleted with the run URL recorded in `docs/CONTRIBUTING.md`; `release-dryrun` required on `main`.

---

### ARC-09-S04 — `./snowarch version` extended (tag, commit, tag-message comparison; `--json` superset of ARC-06-S02's shape; feeds the doctor's `engine` header)

> **Amendment 2026-09-11 (from the delivery).** Four departures.
>
> 1. **The command lives in `tools/snowarch/lib/cli.mjs`**, not `lib/commands/version.mjs` — there is
>    no `commands/` directory; ARC-06-S02 put every sub-command in the one CLI file. The FACTS moved
>    to a new `lib/version-info.mjs` (`versionInfo`, `renderVersion`) so the doctor can import them
>    without importing the CLI, and the git spawns to a new `lib/git.mjs`.
> 2. **The git seam is `tools/snowarch/lib/git.mjs`, not S01's helper.** S01's lives in
>    `scripts/lib/release/` and closes over the release script's own root and flags; the engine
>    needs `describe`, `tagMessage`, `gitlink` and `branchState` against an arbitrary root, with
>    `childEnv` and Windows `git.exe` resolution. What IS shared is the rule S01 paid for: a failed
>    command throws, and only a caller that passed `allowFail` gets `null` — a refusal to answer and
>    an answer of "nothing" are different values.
> 3. **`--json`'s five original keys are asserted as a SUPERSET now.** ARC-06-S02's test used
>    `deepEqual` over every key, which a superset cannot satisfy by definition; it asserts the five
>    are present and unchanged in name, type and value. That is the property the story actually
>    fixes, and a consumer written against the old object still reads the same values out of the new
>    one.
> 4. **The bug-report sentence is in `docs/CONTRIBUTING.md`, with a one-line pointer on the install
>    page.** The page was at 252 of 252 after S03 and the full sentence cost two lines; CONTRIBUTING
>    carries "What to paste in a bug report" and the page says "Reporting it? Paste
>    `./snowarch version` and `./snowarch doctor`." Final count: **252**.
>
> *Also:* the shallow-clone case prints its own wording — `tag: none (shallow clone — tags
> unreachable; git fetch --tags --unshallow)` — because "no release tag" without saying why sends a
> reader looking for a bug in the product. And a mismatch cannot be shown through the real binary in
> a test: the launcher resolves the checkout from its own location, not from `cwd`, so a subprocess
> cannot be pointed at a fixture. The wording is asserted on the fixture through `versionInfo`, and
> the exit-0 property through the real binary on the real tree.


**As** an individual practitioner **I want** `./snowarch version` to print the product version, the release tag I am on (or how far past it), the commit, the contract sha, the docs pin and the version floors **so that** a support conversation or a bug report starts from the same facts the tag records (P-12, P-19) and the doctor — and through it `/snowarch status` — quotes one source.

**Context.** README deliverable 3 (`./snowarch version` — version, tag, contract sha, docs pin, floors); `01` §12 second bullet; acceptance criterion 1 ("`./snowarch version` prints the same values" as `git show v2.0.0`). **ARC-06-S02 already ships a first `version`** (one line: `snowarch 2.0.0 · contract <12 hex> · docs pin <7> (<family>) · floors: …`; `--json` `{ version, contractSha, docsPin, docsFamily, floors }`, values from root `package.json`, `dist/contract.json`, `git ls-tree`, `engine.config.json`). This story **extends** it with the git facts (tag, distance, commit, dirty) and the tag-message comparison, without a network call; it does not create the command. The old server's CLI fetched `registry.npmjs.org/servicenow-mcp/latest` on every invocation and nagged about a stranger's package (`00` §2, `src/cli/index.ts:57-85`) — ARC-04 S01 removed that; `version` must remain **offline** and never contact a registry.

**Scope.** In: `tools/snowarch/lib/commands/version.mjs` (extend), `lib/git.mjs` helpers (`describe`, `tagMessage`, `gitlink`), the `--json` superset, and an exported `versionInfo(root)` that ARC-08-S01's doctor runner calls to fill the report header `engine: { version, tag, contractSha, … }` — that header is what `/snowarch status` (ARC-02 S11 / ARC-08-S09) renders; the skill never spawns `version` itself. Out: any network call (the "behind origin" check is S07's `upgrade --check`); npm registry lookups (never); changing ARC-06-S02's one-line format or its five JSON keys (kept as-is; new keys are added beside them).

**Design notes.**
- Human output (exact layout, values illustrative; line 1 is ARC-06-S02's line unchanged, lines 2–6 are new):
  ```
  snowarch 2.0.0 · contract 9b1c3e7f2a41 · docs pin ba513f2 (australia) · floors: Claude Code ≥ 2.1.214, Node ≥ 20, git ≥ 2.25
  tag:        v2.0.0 (exact)
  commit:     3f2a9c1 (main, clean)
  contract:   sha256:9b1c…e7f2  packages/snowarch/dist/contract.json — matches engine pin
  docs-pin:   ba513f2 (australia) — gitlink matches engine.config.json
  floors:     claude ≥ 2.1.214 · node ≥ 20.0.0 · git ≥ 2.25.0
  ```
  Variants: `tag: v2.0.0+3 (3 commits past v2.0.0)` from `git describe --tags --long --match 'v*'`; `tag: none (no release tag reachable — development checkout)`; `commit: 3f2a9c1 (detached, dirty)`; `contract: … — DOES NOT match engine pin (run npm run contract)`; `docs-pin: … — gitlink ≠ engine.config.json (run ./snowarch docs verify)`. When the reachable tag's annotated message carries `contract:`/`docs-pin:` (S01 `parseTagMessage`), a third comparison line `tag says: contract 9b1c…e7f2 · docs-pin ba513f2` is printed and any mismatch against the working tree is flagged `(differs — checkout is not the release)`.
- Sources: version from root `package.json` (never from git); contract sha computed with `node:crypto` over `packages/snowarch/dist/contract.json` and compared with `packages/contract/required-tools.json.contractSha256` through ARC-05 S10's loader (no literal names in `tools/snowarch`); docs pin from `git ls-tree HEAD vendor/ServiceNowDocs` (not the checked-out submodule HEAD — the doctor owns that comparison) versus `engine.config.json.docs.pin`; floors from `engine.config.json.floors`.
- `--json` (a strict superset of ARC-06-S02's object — its five keys keep their names and types): `{ "version": "2.0.0", "contractSha": "<64 hex>", "docsPin": "<40 hex gitlink>", "docsFamily": "australia", "floors": { "claudeCode": "2.1.214", "node": "20.0.0", "git": "2.25.0" }, "tag": { "name": "v2.0.0", "distance": 0, "exact": true, "message": { "contract": "…", "docsPin": "…", "floors": {…} } | null } | null, "commit": { "sha": "…", "short": "…", "branch": "main"|null, "dirty": false }, "contractPinned": "<64 hex from required-tools.json>", "contractMatches": true, "docsPinConfig": "<40 hex from engine.config.json>", "docsPinMatches": true }`. `versionInfo(root)` returns the same object; the doctor copies `version`, `tag.name`, `contractSha` into its `engine` header.
- Exit code 0 even on mismatches (it is a report; the doctor turns mismatches into FAIL); exit 2 only when not run inside the checkout (`version: run from the checkout root`). Missing `dist/contract.json` (impossible on a clone; possible in a broken worktree) → `contract: missing` and exit 0.
- `snowarch.cmd version` (ARC-06-S11) reaches the same code; git is invoked as `git.exe` on PATH — present without Git Bash when Git for Windows is installed (its `cmd/` directory stays on PATH in the S08 job).

**Acceptance criteria.**
1. On a checkout at tag `v2.0.0` (S07 harness fixture), `./snowarch version` prints `snowarch 2.0.0`, `tag: v2.0.0 (exact)`, and the `contract:` and `docs-pin:` values equal the values in `git show v2.0.0` (README acceptance 1, second half); `tests/version-consistency.test.mjs` passes.
2. Two commits past the tag, the second line reads `tag: v2.0.0+2 (2 commits past v2.0.0)`.
3. In a checkout with no tag, `tag: none (no release tag reachable — development checkout)` and exit 0.
4. `./snowarch version --json | node -e "JSON.parse(require('fs').readFileSync(0))"` succeeds; the object has the keys listed above and ARC-06-S02's `tests/version-command.test.mjs` shape assertion (its five keys) still passes unchanged; `.contractMatches` is `true` on a green tree and `false` after `packages/contract/required-tools.json.contractSha256` is edited.
4a. `./snowarch doctor --json` at the same checkout reports `engine.version`, `engine.tag` and `engine.contractSha` equal to `version --json`'s `version`, `tag.name` and `contractSha` (the doctor calls `versionInfo()`; ARC-08-S11's snapshot normaliser strips these values, so the equality is asserted here, not there).
5. Running with the network disabled (`--offline` is not needed — there is no network code; the test blocks DNS via an invalid `HTTPS_PROXY` and asserts the command still completes in < 500 ms).
6. `.\snowarch.cmd version` in the S08 Windows job prints the same six lines.

**Tasks.**
1. Add `lib/git.mjs` (spawn wrappers with a 5 s timeout and Windows `git.exe` resolution); extend ARC-06-S02's `lib/commands/version.mjs` with lines 2–6 and the new JSON keys; export `versionInfo(root)`.
2. Point ARC-08-S01's report-header code at `versionInfo()` (one import; if ARC-08 landed with its own ad-hoc reader, replace it — one source of truth).
3. Extend `tests/version-command.test.mjs` on the S07 harness fixture (tagged / past-tag / untagged states) and add the doctor-header equality test (criterion 4a).
4. Confirm with ARC-02 S11 / ARC-08-S09 that `/snowarch status` prints `engine.version` / `engine.tag` from the doctor JSON (no change expected on their side).

**Test strategy.** Unit on temp fixtures (all nine cells); the Windows-native job (S08) executes the command through `snowarch.cmd`.

**Dependencies.** ARC-06-S02 (CLI skeleton, exit codes, the first `version` and its JSON shape), ARC-05 S10 (contract loader), ARC-03 S01 (pin in `engine.config.json`), ARC-08-S01 (doctor report header `engine.{version,tag,contractSha}`), S01 (`parseTagMessage`).

**Size.** S — half a day.

**Risks / open points.** `git describe` on a shallow user clone: `git clone` of the product is a full clone (only the docs submodule is shallow), so tags are reachable; if a user cloned with `--depth 1`, the output degrades to `tag: none …` and S07's `upgrade` runs `git fetch --tags --unshallow` when it detects a shallow checkout.

**Definition of done.** Merged; command documented in `docs/INSTALL.md` (troubleshooting "what to paste in a bug report") and `docs/CONTRIBUTING.md`; the doctor's `engine` header is filled from `versionInfo()` and `/snowarch status` shows the tag.

---

### ARC-09-S05 — Input-hash invalidation table: `lib/inputs.mjs`, `state.staleSteps()`, `tests/input-hash.test.mjs`, `docs/ARCHITECTURE.md` section

**As** the engine's bootstrap **I want** each step to declare exactly which committed inputs it depends on and to be marked stale only when one of them changed **so that** running `bootstrap` again after an upgrade re-runs precisely the affected steps (README acceptance 3: a release changing only `vendor/docs-areas.txt` re-runs only B02) and never touches credentials.

**Context.** README deliverable "Input-hash table (documented in `docs/ARCHITECTURE.md`)": `package-lock.json` → B04; `dist/contract.json` sha → B05/B08; `vendor/docs-areas.txt` + gitlink → B02; store schema version → B06 migration; `.mcp.json` / `.claude/settings.json` hashes → B01/B07. `01` §4.2 ("resumes at the first incomplete step or the first step whose inputs hash changed"), §12. ARC-06-S03 ships the state file and per-step `inputsHash`; ARC-06's acceptance already covers "changing `package-lock.json` invalidates only B04". This story makes the table complete, documented and tested, and adds the schema-version input that S06 introduces.

**Scope.** In: `tools/snowarch/lib/inputs.mjs` (the table as code), `lib/state.mjs` additions (`staleSteps()`, `explainStale()`), the B06 "migrate, don't re-wizard" rule, `tests/input-hash.test.mjs`, the `docs/ARCHITECTURE.md` section. Out: the step implementations (ARC-06), the migration itself (S06), the `upgrade` command that consumes `explainStale()` (S07).

**Design notes.**
- `lib/inputs.mjs` exports `INPUTS`:

  | Step | Inputs hashed (sha256 over the concatenation, in this order) | Why |
  |---|---|---|
  | B00 preflight | `engine.config.json` (`floors` object only, canonical JSON) | new floors must be re-checked; cheap (< 1 s), so B00 re-runs on every run |
  | B01 workspace | bytes of `.mcp.json`, bytes of `.claude/settings.json` | committed-hash verification must be redone when the wiring changed |
  | B02 docs | bytes of `vendor/docs-areas.txt`; gitlink of `vendor/ServiceNowDocs` from `git ls-tree HEAD`; `engine.config.json.docs` object | new areas or a moved pin need a re-checkout / re-sparse |
  | B03 mode | the recorded mode string from the state file | never invalidated by a checkout change; only `./snowarch mode …` rewrites it |
  | B04 deps | bytes of `package-lock.json`; `process.versions.node` major | lockfile change or a Node major change re-installs |
  | B05 contract | bytes of `packages/snowarch/dist/contract.json`; bytes of `packages/contract/required-tools.json` | pin or contract change re-verifies |
  | B06 wizard | `contract.storeSchemaVersion` (S06) | a schema change runs the **migration**, never the wizard; the wizard runs only when no store exists |
  | B07 toggles | bytes of `.claude/settings.json`; the recorded mode | toggle content depends on both |
  | B08 verify | bytes of `packages/snowarch/dist/contract.json`; `dist/server.js` sha; the store file mtime+size (never its content) | a new server binary or contract re-runs the handshake; a changed store re-runs the probes |
  | B09 summary | always re-runs | output only |

  Each entry is `{ step, inputs: [{ kind: 'file'|'gitlink'|'json-path'|'literal', ref }], hash(ctx) }`; `hash` is deterministic across OSes (files read as bytes — `.gitattributes` keeps them LF on every platform; the store is hashed by `mtime+size` only so credentials never enter a hash).
- `lib/state.mjs`: `staleSteps(state, ctx) → [{ step, reason: 'never-run'|'failed'|'inputs-changed', changed: ['vendor/docs-areas.txt'] }]` and `explainStale()` producing the human lines S07 prints in its plan (`B02 docs — vendor/docs-areas.txt changed`). Resume rule: run every stale step in order; a non-stale step is printed as `[B04/09] deps … skipped (inputs unchanged)`. `--from Bnn` forces from a step; `--reset` clears the state file.
- `docs/ARCHITECTURE.md` gains "Bootstrap input hashes and upgrade invalidation" with the table above and the sentence "credentials are never hashed, read or rewritten by any step other than the wizard and the migration".

**Acceptance criteria.**
1. `tests/input-hash.test.mjs`: for each table row, mutating exactly that input in a temp copy of a bootstrapped checkout makes `staleSteps()` return **only** the listed step(s) (`.mcp.json` → B01 only; `.claude/settings.json` → B01 and B07; `vendor/docs-areas.txt` → B02; gitlink → B02; `package-lock.json` → B04; `dist/contract.json` → B05 and B08; `required-tools.json` → B05; `storeSchemaVersion` → B06; `dist/server.js` → B08; the store file → B08 only).
2. Editing the fixture store's `auth.password` value without changing size or mtime leaves every step non-stale, proving credential content is never hashed.
3. `./snowarch bootstrap --yes` a second time on an unchanged, completed checkout runs only B00 and B09; every other step line reads `ok (cached)` (its hash still matches) or `skipped (<reason>)` (`runsWhen` declined — `design-only`, `--docs skip`), and the run finishes in < 5 s (no network, no npm). On a live checkout all eight read `ok (cached)`. **Amended in the build (S05):** there is no `--resume` flag — resuming IS a second run, and `--from BNN` is the explicit control; `--resume` belongs to `/snowarch setup-instance` (ARC-07-S09) and means something else there. The cached wording is `ok (cached)`, not `skipped (inputs unchanged)`: `skipped` is `runsWhen`'s word in the same output and is counted separately.
4. The hash of every row is identical on ubuntu, macOS and Windows for the same commit (CI uploads each cell's `.local/bootstrap-state.json` as an artifact and a final ubuntu step asserts the `steps.*.inputsHash` values agree across the nine cells).
5. `docs/ARCHITECTURE.md` contains the table and CI's `gen:check`-style test (`tests/input-hash.test.mjs` renders the table from `INPUTS` and diffs it against the docs section) fails when they diverge.

**Tasks.**
1. Write `lib/inputs.mjs` with the table and per-kind readers; write `staleSteps` / `explainStale`.
2. Integrate with ARC-06's step runner (`lib/steps/*.mjs` declare `inputs: INPUTS.B04` instead of ad-hoc hashes if ARC-06 shipped them ad hoc).
3. Write `tests/input-hash.test.mjs` (fixture builder shared with S07's harness).
4. Write the `docs/ARCHITECTURE.md` section and the render-and-diff test.

**Test strategy.** Unit on all nine cells; cross-OS hash equality via CI artifacts; second-run smoke in the bootstrap job (ARC-06-S14).

**Dependencies.** ARC-06-S03 (state file, resume), ARC-03 S02 (`docs-areas.txt`), ARC-04 S06 (`contract.json`) and S06 of this ARC for `storeSchemaVersion` (the B06 row is added when S06 merges; until then it hashes the literal `1`).

**Size.** M — 1–2 days.

**Risks / open points.** ARC-06-S03 may already implement part of this table — the merge is a refactor to one source of truth, not a second mechanism. Store `mtime` on Windows has 100 ns resolution and on some Linux filesystems 1 s; the test uses a 2 s gap when it needs a changed mtime.

**Definition of done.** Merged; table in `docs/ARCHITECTURE.md`; ARC-06 steps import `INPUTS`; tests green on nine cells.

---

### ARC-09-S06 — Store schema migration framework in `packages/snowarch` (explicit, versioned, 0600 backup, credential values never touched)

**As** the server **I want** `.local/instances.json` to carry a schema version, migrations to be explicit functions run only on request (`./snowarch store migrate`) or by the upgrade path, with a 0600 backup written first and credential values proven untouched **so that** a release that changes the store shape never corrupts or silently rewrites a user's credentials (README acceptance 4; D-04; `01` §12 "store schema migrations are explicit and backed up").

**Context.** README deliverable "Store migration framework in `packages/snowarch` (`version: 1` → n; backup file `instances.json.bak-<ts>` with 0600; never touches credentials' values)". The old server's `loadConfig()` (`src/cli/config-store.ts:110-127`) migrated per-instance fields silently on every load and swallowed parse errors by returning an empty config — exactly the behaviour to replace. ARC-04 S02 ships the v1 store module with atomic 0600 writes and the file-mode check; ARC-04 S06 ships `dist/contract.json` (this story adds `storeSchemaVersion` to it); ARC-04 S12 ships the server doctor module (`src/doctor/`) whose checks ARC-08-S04 integrates as `SV-00…SV-07` (this story adds one more).

**Scope.** In: `packages/snowarch/src/store/migrations/` (registry, `migrateStore`), the `storeSchemaVersion` field in `contract.json` (via `scripts/extract-tools.mjs`), server start-up behaviour on schema mismatch, CLI `store migrate [--dry-run] [--yes]` and `store backups`, doctor check, B06's migration branch (with S05), tests. Out: the OS-keychain backend (`01` §17 item 3); importing the legacy `~/.config/servicenow-mcp/instances.json` (ARC-07-S08, `instance import --from-legacy` — an import, not a migration); changing any credential value or auth method (never).

**Design notes.**
- `src/store/migrations/index.ts`: `export const CURRENT_SCHEMA_VERSION = 1;` (2.0.0 ships v1; the framework exists before the first migration) and `export const MIGRATIONS: Migration[] = []` where `Migration = { from: number, to: number, describe: string, up(store: Readonly<StoreV_from>): StoreV_to }`. Rules enforced by `tests/store-migrations.test.ts`: `MIGRATIONS` is contiguous (`1→2, 2→3 …`) ending at `CURRENT_SCHEMA_VERSION`; every `up` is pure (input deep-frozen); for every instance the subtree `auth` is deep-equal before and after (credential values, usernames, method — untouched); `up` may add/rename non-auth fields and set defaults only.
- `migrateStore(path, { backup = true, dryRun = false })`: read + JSON parse (a parse error is a hard error `STORE_UNREADABLE` with the path — never "return empty"); `version === CURRENT` → `{ migrated: false }`; `version > CURRENT` → throw `STORE_SCHEMA_NEWER` (`store schema 3 is newer than this server supports (2) — run ./snowarch upgrade, or restore instances.json.bak-<ts>`); otherwise copy the file byte-for-byte to `instances.json.bak-<YYYYMMDDTHHMMSSZ>` in the same directory with mode 0600 (Windows: ACL-inherited, reported as such), apply each migration in order, write atomically 0600 through ARC-04 S02's writer, return `{ migrated: true, from, to, backup }`; one stderr line `store: migrated schema v1 → v2 (backup instances.json.bak-20261001T101500Z)`. `dryRun` prints `describe` of each pending migration and touches nothing.
- **Server start-up** (`src/store` loader): on `version < CURRENT` the server does **not** migrate; it enters the ARC-04 unconfigured mode with `configError: STORE_SCHEMA_OUTDATED` and every instance tool returns that code with remedy `./snowarch store migrate` (explicit by design — a user who `git pull`ed by hand gets a named next step instead of a silent rewrite). On `version > CURRENT` likewise with `STORE_SCHEMA_NEWER`. Both codes join the ARC-05 S06 error registry (remedy text as above) so `docs/TROUBLESHOOTING.md` and the rule file carry them.
- **CLI**: `./snowarch store migrate` delegates to `packages/snowarch/dist/cli/index.js store migrate` (the same delegation `instance …` uses). Principle 10: prints `Store schema v1 → v2 · 1 migration: "add lastUpgradeCheck to instances" · backup will be written to .local/instances.json.bak-<ts> · credentials: untouched · Proceed? [Y/n]`; `--yes` for scripts. `store backups` lists `instances.json.bak-*` with size and date; `store restore <file>` copies a backup back (0600, atomic) after the same confirmation.
- **Doctor**: server check `SV-09 store schema` (**amended from SV-08 in the build** — ARC-08-S04 shipped the ancestor-skills check under that id first; implemented in ARC-04 S12's `src/doctor/` module): OK `store schema v1 (current)`; FAIL `store schema v1 < server v2 — run ./snowarch store migrate`; FAIL `store schema v3 > server v2 — run ./snowarch upgrade`. **Not** in the `--fix` whitelist (the whitelist never touches the credential file — `01` §8); the remedy is the explicit command.
- **Contract**: `extract-tools.mjs` writes `"storeSchemaVersion": CURRENT_SCHEMA_VERSION` into `dist/contract.json`; ARC-05's contract test asserts it equals the constant; S05 hashes it for B06; S07 reads `git show <tag>:packages/snowarch/dist/contract.json` to predict a migration before checkout.
- **B06 branch** (with S05): B06's `runsWhen` becomes `mode === 'live' || storeExists` (a design-only checkout that still carries a `.local/instances.json` must keep it loadable — the S07 harness is exactly that case). When B06 is stale because `storeSchemaVersion` changed and a store exists → run `migrateStore` (after the plan confirmation, `--yes` in upgrade), in either mode; when no store exists → the wizard as today (live) or `skipped (design-only)`; when the store is current → `skipped (inputs unchanged)`.

**Acceptance criteria.**
1. `tests/store-migrations.test.ts` with a **test-only** migration `1→2` (registered through a test hook, not shipped): a v1 fixture store with two instances (fixture credentials) migrates to v2; the backup file exists, is byte-identical to the original, and has mode `0600` on POSIX (`fs.statSync().mode & 0o777 === 0o600`); the `auth` subtree of both instances is deep-equal before/after; the new file is mode 0600 and `version: 2`. (README acceptance 4, first two parts.)
2. After the migration, `node packages/snowarch/dist/server.js` (test build with the hook) answers `initialize` and `snow_core_capabilities_read` reports both instances (README acceptance 4, "the server loads it").
3. A v3 store against a v2 server: server starts unconfigured with `configError: STORE_SCHEMA_NEWER`; `./snowarch store migrate` exits 1 with the `newer than this server supports` message; nothing is written.
4. A v1 store against a v2 server: `snow_core_records_query` returns `STORE_SCHEMA_OUTDATED` with the `./snowarch store migrate` remedy; the doctor reports the FAIL line; `--fix` leaves the store untouched and reports `store schema: not auto-fixable (credential file) — run ./snowarch store migrate`.
5. `./snowarch store migrate --dry-run` prints the pending migration description and `git status`/store sha are unchanged; `--yes` performs it non-interactively; without `--yes` an `n` answer exits 0 with `store: nothing changed`.
6. A store with invalid JSON makes `store migrate` exit 1 with `STORE_UNREADABLE: .local/instances.json is not valid JSON — restore a backup (./snowarch store backups)`; the file is not overwritten.
7. The migration-contiguity and auth-untouched invariants fail the test suite when a deliberately bad migration (touching `auth.password`) is registered in a test.
8. `dist/contract.json` carries `storeSchemaVersion: 1` and the ARC-05 contract test asserts it.

**Tasks.**
1. Implement the registry, `migrateStore`, backup writer (reuse ARC-04 S02's atomic writer and mode check), and the error codes in the registry (ARC-05 S06).
2. Server loader: schema comparison → unconfigured mode with `configError`.
3. CLI `store migrate|backups|restore` with the principle-10 confirmation; delegation from `tools/snowarch`.
4. Doctor check `SV-08` in the server doctor module (ARC-04 S12) and its row in ARC-08-S04's `SV-` table.
5. `extract-tools.mjs`: emit `storeSchemaVersion`; update the contract test.
6. Tests (criteria 1–8) including the test-only migration hook; B06 branch with S05.
7. `docs/CONTRIBUTING.md` "Adding a store migration" (S11 consolidates).

**Test strategy.** Vitest in `packages/snowarch/tests` (nine cells; mode assertions POSIX-only with a Windows ACL note); the end-to-end "fixture release changes the schema" case runs in S07's harness.

**Dependencies.** ARC-04 S02 (store module, atomic writes), S04 (unconfigured mode and `configError`), S06 (`extract-tools.mjs`, contract), S12 (server doctor module); ARC-05 S06 (error registry — `STORE_NOT_FOUND` exists there; the three codes here are additions); ARC-08-S04 (`SV-` integration table); S05 (B06 branch).

**Size.** M — 1–2 days (the framework is small; the invariants and the two start-up paths take the time).

**Risks / open points.** Shipping `CURRENT_SCHEMA_VERSION = 1` with an empty registry means the first real migration is written by whoever changes the schema — the contiguity test forces them through this framework. Backups accumulate: `store backups` lists them; pruning is a manual `rm` (documented), never automatic.

**Amendments made during the build (ARC-09-S06).**

1. **The doctor check is `SV-09`, not `SV-08`.** ARC-08-S04 shipped the ancestor-skills check under that id first. Registered in `src/doctor/checks.ts`, in both `CHECK_IDS` lists (the server module's and the engine's `SERVER_CHECK_IDS`), in `--quick` (it reads one number from one file, the same as `SV-02`), in the three committed doctor snapshots, and in the ARCHITECTURE `SV-` table. The "new checks with no old counterpart" list recomputed itself.
2. **`STORE_SCHEMA_UNSUPPORTED` is split, not supplemented.** It existed and covered BOTH directions with one remedy — "run `./snowarch upgrade`" — which is right for a store from the future and actively misleading for one from the past: the checkout is already new enough and the file that needs migrating is untouched by an upgrade. It becomes `STORE_SCHEMA_NEWER` and `STORE_SCHEMA_OUTDATED`, both `showInRule: true` (a session must stop and name the command, never edit a credential file). `tests/store/schema.test.ts` was updated; the package README and CHANGELOG rows follow the rename.
3. **The test hook is a parameter, not `registerMigrationForTest`.** A registry a test can append to is a registry a production path can append to, and a hook must exist in the shipped build to be callable from one. `migrateStore(path, { migrations })` — and `runStoreMigrate(argv, io, chain)` — give a test its 1→2 fixture while the shipped `MIGRATIONS` stays empty; `checkRegistry()` is applied to whatever chain is passed, so a fixture is held to the same rules.
4. **`checkRegistry` does not check where a chain starts.** `migrateStore` already refuses a store the chain cannot take (`STORE_SCHEMA_OUTDATED`, naming the version), which is the same fact discovered against the actual file. "The shipped chain starts at 1" is a separate claim, exported as `SHIPPED_CHAIN_STARTS_AT` and asserted of the shipped registry.
5. **AC 2 is a round trip.** A migration ENDING at the version the server reads needs a store below it, and at v1 there is nothing below — `version: 0` is refused by design because it never existed. The test migrates v1 → v2 with the fixture chain, proves the credentials survived, restores the backup, and hands the result to a real spawned server. It asserts the criterion's claim and one more: the backup is a rescue that works.
6. **AC 2's tools.** `snow_core_capabilities_read` reports the CURRENT instance; `snow_core_instances_index` is the list. Both are asserted.
7. **`configErrors`, plural.** ARC-04-S04 shipped an array — one store can fail for more than one reason — and the story's `configError` is the singular of it.
8. **The store stamp's second reader.** S05's B06 row now hashes `dist/contract.json#storeSchemaVersion` in place of the literal, so a release that changes the schema makes exactly B06 stale.
9. **`store migrate --help` is help.** Answered once in `runStore` before dispatch, rather than three times.

**Definition of done.** Merged; error codes in the registry and `docs/TROUBLESHOOTING.md`; doctor check present; `docs/CONTRIBUTING.md` section written; contract test extended.

---

### ARC-09-S07 — `./snowarch upgrade [--to vX.Y.Z] [--check]`, the SessionStart "behind origin" nudge, and the upgrade fixture harness

> **Amendment 2026-09-10 — the file's shape is fixed by ARC-08-S08.** `.local/upgrade-check.json`
> is `{ behind: boolean, latestTag: string, checkedAt: string }`. The session banner reads it and
> nothing else: an absent file is no nudge, a `behind: false` file is no nudge, and the hook never
> fetches. The nudge wording is `lib/text.mjs`'s `BANNER.upgrade(tag)` — this story adopts it
> rather than writing a second sentence.


**As** an individual practitioner **I want** `./snowarch upgrade` to fetch the release tags, show me what will change, move my checkout to the target release, re-run only the bootstrap steps whose inputs changed, migrate the store if the release requires it, and finish with a doctor run — and I want the session banner to tell me when a newer release exists without ever fetching by itself **so that** upgrading is one command that never touches my credentials (README deliverable 3, acceptance 3–4; `01` §12; principle 10).

**Context.** README deliverable "`./snowarch upgrade [--to vX.Y.Z]` (`git fetch --tags`, checkout or `pull --ff-only`, a second `bootstrap` run, doctor); the SessionStart banner's 'behind origin' nudge (reads a cached fetch, never fetches itself)"; `01` §8 (banner < 300 ms, adds "run ./snowarch upgrade" when behind); `03` R-15 / R-3 (proxies — `git fetch` must fail with a proxy-aware message). ARC-06-S03/S09 ship the resume rule and the summary; ARC-08-S08 ships the banner this story extends.

**Scope.** In: `tools/snowarch/lib/commands/upgrade.mjs`; `.local/upgrade-check.json`; the banner nudge line; the doctor's network-subset "release currency" check that refreshes the cache; `docs/INSTALL.md` "Upgrading"; the fixture harness `tests/upgrade/harness.mjs` with two fixture releases; `tests/upgrade.e2e.test.mjs`; CI job `upgrade-e2e`. Out: moving the docs pin (ARC-03 S07 `docs sync --upstream`, a maintainer action); anything that writes to `~/.claude.json`; auto-upgrade (never — the nudge is text).

**Design notes.**
- Invocation: `./snowarch upgrade [--to vX.Y.Z] [--check] [--yes] [--pre]`. `--check`: fetch tags, refresh the cache, print `v2.1.0 available (you are on v2.0.0)` or `up to date (v2.1.0)`, change nothing else, exit 0 (exit 4 when behind, for scripts).
- Sequence (each line printed `[U1/7] …`):
  1. **U1 preflight** (exit 2, nothing changed): inside the checkout root; `git status --porcelain --untracked-files=no` empty, else `upgrade: tracked files are modified — commit or stash them first (git stash); nothing was changed`; shallow checkout detected (`git rev-parse --is-shallow-repository` = true) → `git fetch --unshallow --tags` is added to U2.
  2. **U2 fetch**: `git fetch --tags --prune origin` with a 120 s timeout. On failure print git's stderr and, when `classifyGitFetchError()` recognises it, one remedy line: `could not resolve host` → `upgrade: DNS failure for <host> — check the network; if you are behind a corporate proxy, git reads HTTPS_PROXY / http.proxy (docs/TROUBLESHOOTING.md#proxy)`; `SSL certificate problem` → `upgrade: TLS certificate not trusted — a TLS-intercepting proxy needs its CA in git (http.sslCAInfo) and in Node (NODE_EXTRA_CA_CERTS); see docs/TROUBLESHOOTING.md#tls-ca`; `407` → proxy auth. Exit 1; nothing changed. (R-3 for the upgrade path; the server's own agent is ARC-04 S11.)
  3. **U3 resolve target**: `--to vX.Y.Z` must be an annotated tag with a `contract:` trailer (S01 `parseTagMessage`), else `upgrade: v2.1.0 is not a release tag of this product`. Without `--to`: the highest semver `v*` tag (prereleases only with `--pre`). If the target equals the reachable tag and HEAD is exact → `up to date (v2.0.0)`, then still run the doctor (`--quick`) and exit 0.
  4. **U4 plan** (principle 10): compute, **before touching the tree**, `git diff --name-only HEAD <tag> -- <every file in S05's INPUTS>` plus the gitlink comparison and `git show <tag>:packages/snowarch/dist/contract.json` → `storeSchemaVersion`; print:
     ```
     Upgrade plan: v2.0.0 → v2.1.0 (12 commits, 2026-10-14)
       tag verified: contract 9b1c…e7f2 · docs-pin ba513f2 · claude-floor 2.1.214 (installed 2.1.260 ok)
       steps that will re-run: B02 docs (vendor/docs-areas.txt changed)
       store: schema v1 → v1 (no migration)
       credentials: untouched (.local/instances.json is never read or written by the upgrade)
       after the upgrade: restart claude (the MCP server binary changed) — or run /mcp → servicenow → reconnect
     Proceed? [Y/n]
     ```
     The installed Claude Code version is compared with the tag's `claude-floor`; below the floor the plan says `claude-floor 2.1.214 (installed 2.1.200 — BELOW the floor; upgrade Claude Code first)` and the command exits 2 unless `--force-floor`.
  5. **U5 move the tree**: with `--to`, or when HEAD is detached: `git checkout --quiet <tag>` (detached; the summary says how to return: `git checkout main`). Without `--to` on a branch with an upstream (`main` after a normal clone): `git pull --ff-only origin <branch>`; if the pull is refused (diverged) → `upgrade: main has diverged from origin/main — resolve with git, or use --to v2.1.0 to check out the release tag`; after the pull, if HEAD is past the newest tag, note `main is 3 commits past v2.1.0 (development commits)`. Submodule movement is B02's job (gitlink hash changed → stale).
  6. **U6 `bootstrap --yes`** (a second run — there is no `--resume` flag; see S05's AC 3 amendment) with the recorded mode: S05's stale set runs; a B06 migration runs `migrateStore` (S06) — the plan already announced it and its backup; nothing else touches `.local/instances.json`. On a step failure the tree stays at the new tag (the state file records the failed step; re-run `./snowarch upgrade` or `./snowarch bootstrap`), and the message names the step exactly as bootstrap does.
  7. **U7 doctor**: `doctor --json` → `.local/doctor-last.json`; print `DOCTOR: … 0 fail` and the `Mode:` line; write `.local/upgrade-check.json` with `behind: false`.
- **Cache** `.local/upgrade-check.json`: `{ "checkedAt": "<ISO>", "remote": "origin", "localTag": "v2.0.0", "localDistance": 0, "latestTag": "v2.1.0", "behind": true }`. Writers: `upgrade` (U2/U7), `upgrade --check`, and the doctor's network subset (a new engine check **`E-28` release currency** — **amended from `E-27` in the build**, which ARC-08-S03 had already taken: WARN `v2.1.0 available — run ./snowarch upgrade` when behind; SKIP under `--no-network`/`--quick`; it refreshes the cache at most once per 24 h). **The banner never fetches**: ARC-08-S08 already reserves the upgrade nudge slot — it reads `.local/upgrade-check.json` and, when `behind === true`, prints the separate line `A newer release is available (v2.1.0) — run ./snowarch upgrade.` after the Mode line. This story keeps that wording verbatim and adds only the freshness rule (`checkedAt` < 7 days old, else no nudge) and the file shape above; no cache = no nudge. Budget unchanged (< 300 ms, file read only). *Note for ARC-08:* story 8 attributes the cache writer to "ARC-09-S04"; the writer is this story (S07) — `version` never fetches.
- **Harness** `tests/upgrade/harness.mjs`: builds, in a temp dir, a bare "origin" from the current tree at `v9.0.0` (versions rewritten to 9.0.0 with S01's writers, annotated tag via `tag.mjs`), then two fixture releases committed on top: **A** `v9.1.0` — changes only `vendor/docs-areas.txt` (adds one area from the corpus); **B** `v9.2.0` — registers a `1→2` migration (adds a non-auth field `notes: ""` per instance), bumps `CURRENT_SCHEMA_VERSION`, rebuilds `dist/` (`scripts/build-dist.mjs`), and tags with `storeSchemaVersion: 2` in the contract. A "user" clone is bootstrapped `--mode design --yes` at `v9.0.0`, then given a fixture store (`version: 1`, two instances, fixture credentials; the mode stays design-only so nothing connects — B06's `runsWhen` includes `storeExists`, S06) and its sha256 recorded. For the server-start assertion in criterion 2 the harness runs `npm ci --omit=dev --ignore-scripts` once in the user clone (design-only bootstrap never runs B04); that install is not part of the upgrade under test.
- `docs/INSTALL.md` "Upgrading": the two commands (`./snowarch upgrade`, `./snowarch upgrade --check`), what is re-run, "credentials are never touched", "restart `claude` afterwards", the diverged-branch note, and the proxy remedy pointer.

**Acceptance criteria.**
1. Harness: from `v9.0.0`, `./snowarch upgrade --to v9.1.0 --yes` exits 0; the state file shows B02 re-run (new `finishedAt`) while B01/B03/B06/B07 print `skipped (inputs unchanged)` and B04/B05/B08 `skipped (design-only)` — no step other than B00, B02 and B09 has a new `finishedAt`; `sha256(.local/instances.json)` is unchanged; `.local/doctor-last.json` has `fail: 0`; `./snowarch version` prints `tag: v9.1.0 (exact)`. (README acceptance 3.)
2. Harness: `./snowarch upgrade --to v9.2.0 --yes` prints `store: schema v1 → v2 (1 migration; backup will be written)` in the plan, exits 0; `.local/instances.json.bak-*` exists with mode 0600 (POSIX) and is byte-identical to the pre-upgrade store; the new store has `version: 2` and unchanged `auth` subtrees; `node packages/snowarch/dist/server.js` at `v9.2.0` answers `initialize` and lists the instances via `snow_core_capabilities_read`. (README acceptance 4.)
3. With a modified tracked file, `upgrade` exits 2 with the "commit or stash" message and `git rev-parse HEAD` is unchanged.
4. With `HTTPS_PROXY=http://127.0.0.1:9` and an `https://` origin, `upgrade` exits 1, prints git's error and the proxy remedy line naming `docs/TROUBLESHOOTING.md#proxy`; nothing changed (R-3).
5. `./snowarch upgrade --check` on the `v9.0.0` clone prints `v9.2.0 available (you are on v9.0.0)`, exits 4, writes `.local/upgrade-check.json` with `behind: true`, and does not move HEAD; a subsequent simulated SessionStart (`echo '{"hook_event_name":"SessionStart","source":"startup"}' | node tools/snowarch/hooks/session-start.mjs`, the ARC-08-S08 test form) prints the Mode line followed by `A newer release is available (v9.2.0) — run ./snowarch upgrade.` in < 300 ms with the network disabled; with `checkedAt` rewritten to 8 days ago the nudge line is absent.
6. Without `--yes`, answering `n` at `Proceed?` exits 0 with `upgrade: nothing changed`.
7. Interrupting U6 (SIGINT during B02 in the harness) and re-running `./snowarch upgrade --to v9.1.0 --yes` resumes at B02 and completes.
8. `--to v9.1.0` when the installed Claude Code reports a version below the tag's `claude-floor` (harness fakes `claude --version` via PATH shim) exits 2 with the BELOW-the-floor line.
9. The `upgrade-e2e` CI job (ubuntu, macOS, Windows × Node 22) runs criteria 1–2 and 5 green; the Windows leg runs under pwsh with Git Bash on PATH (the no-Git-Bash proof is S08's).

**Tasks.**
1. `lib/commands/upgrade.mjs`: U1–U7, `classifyGitFetchError`, plan rendering from S05's `explainStale()`, floor comparison.
2. Cache writer/reader (`lib/upgrade-check.mjs`); freshness rule in `hooks/session-start.mjs`'s existing upgrade-nudge slot (ARC-08-S08); `E-27 release currency` check (next free id after ARC-08-S03's `E-23…E-26`) registered through ARC-08-S01's registry with ARC-08-S02's check shape — the network-gated, cache-refreshing check this story calls `E-release-currency` above.
3. Harness (`tests/upgrade/harness.mjs`, fixtures under `tests/upgrade/fixtures/`), reusing S05's fixture builder.
4. `tests/upgrade.e2e.test.mjs` and the unit tests for the classifier and plan renderer.
5. `upgrade-e2e` job in `ci.yml`; `docs/INSTALL.md` "Upgrading" section; troubleshooting anchors `#proxy`, `#tls-ca` (ARC-05 S06 generated file — add the git-specific sentences to the generator's remedy text for the R-3 codes).

**Test strategy.** Unit for the classifier, plan and cache (nine cells); the harness e2e on three OSes × Node 22 (it runs `build-dist.mjs`, so it needs dev dependencies — the `test` job's `npm ci --ignore-scripts` install); manual: the first real upgrade `v2.0.0 → v2.0.1` on the author's machine is recorded in ARC-10's validation notes.

**Dependencies.** S04 (tag parsing, version output), S05 (stale set), S06 (migration, `storeSchemaVersion`); ARC-06-S03 (the resume rule, state file), ARC-06-S09 (summary lines); ARC-08-S01 (check registry, JSON), ARC-08-S02 (engine-check shape), ARC-08-S03 (`E-23…E-26` ids precede `E-27`), ARC-08-S08 (banner nudge slot and wording); ARC-04 S13 (`build-dist.mjs` for fixture B); ARC-05 S06 (error remedies).

**Size.** L — 3–5 days: the command is ~300 lines, but the harness with two fixture releases and a rebuilt `dist/` is the bulk.

**Risks / open points.** (a) `git pull --ff-only` on a user who committed engagement files inside the checkout (`clients/` is ignored, so normally nothing) — the diverged message covers it. (b) The harness rebuilds `dist/` for fixture B on every CI run (~1 min); acceptable. (c) Whether a detached-HEAD checkout confuses users — the summary prints the way back; the default path keeps them on `main`. (d) ARC-08-S08's nudge wording is adopted verbatim (see design notes); the cache file shape here is the contract both sides read, and ARC-08's "written by ARC-09-S04" attribution should read S07.

**Amendments made during the build (ARC-09-S07).**

1. **The release-currency check is `E-28`, not `E-27`.** ARC-08-S03 shipped `E-27` (Claude Code registration status). Registered in the `host` section beside it, `network: true`, out of `--quick` for both of that flag's reasons at once — it spawns git and it leaves the machine. The engine registry is 39 checks; the mapping's "new checks with no old counterpart" list recomputed to 13; the three doctor snapshots gained the row and their `summary.skip`.
2. **A re-run after a failed step CONTINUES, rather than reporting `up to date`.** The failure message this command prints says "re-run ./snowarch upgrade", and a run that answered `up to date` to that would be telling a user to type a command that does nothing. When the tree is already at the target and the state file records a failed or interrupted step, U4 and U5 are skipped and the run continues from U6 — which is what AC 7 actually asks for.
3. **AC 7's interrupt is PLANTED, not timed.** A SIGINT at a wall-clock guess passes on a fast machine and hangs on a slow one. The harness parks the corpus upstream and empties the corpus directory, which produces the state a Ctrl-C during B02 leaves — `B02: fail` with everything before it `ok` — and then restores both and re-runs. (Emptied rather than removed: an absent directory makes the gitlink modified and U1 refuses the whole upgrade, correctly.)
4. **AC 4's origin is `https://127.0.0.1:<closed>`, and the proxy is injected into the child.** Never `.invalid`, which is a DNS failure — a different remedy and a different test. The assertion is that a `#proxy` or `#tls-ca` anchor is named and that no cache is written: a failed fetch that wrote one would make the banner report a check that never happened.
5. **`--force-floor` overrides the TAG's request, not the engine's requirement.** Past the plan, the bootstrap's own B00 still enforces `engine.config.json`'s floor. Asserted rather than worked around: that layering is the right one.
6. **The troubleshooting anchors needed no registry edit.** `PROXY_UNREACHABLE` and `TLS_CA_UNTRUSTED` already carry remedies that serve; the git-specific sentences live in `classifyGitFetchError`, which is where a git failure is being explained. **No registry text moved, so the contract sha and the pin are untouched** (`4117dc73744e…`).
7. **The harness links `node_modules` rather than running `npm ci`.** Fixture release B rebuilds `dist/`, which needs TypeScript, and B06's migration runs the built CLI, which needs commander. A link is the same thing without a minute per world and without the network.
8. **`STORE_VERSION` is now used where `1` was typed.** Three literals in `src/cli/` constructed `{ version: 1 }` and cast to `Store`; bumping the schema in fixture B broke the build on all three, which is the type system doing its job — and the fix is S06's own "one constant" rule.
9. **A product defect found by the harness and fixed here: B06 read `.status` off an asynchronous `ChildProcess`.** The runner hands every step an async `spawn` so its interrupt handler can reach the child. `r.status` on one is `undefined`, which `!== 0` — so B06 declared every spawn a failure the moment it started it. In production the WIZARD would run, the user would answer its prompts, and the bootstrap would already have printed "the instance wizard exited abnormally" over the top of them. Every test injected a synchronous fake returning `{ status: 0 }`, so nothing caught it. Both paths now await the child, and the failure line names how it ended (`exit 1` vs `killed by SIGTERM`).
10. **The harness copies `.gitattributes`, and a Windows runner is what proved it had to.** The fixture is meant to be "exactly as a cloned engine checkout carries it", and without that file it inherits the machine's `core.autocrlf` — true on `windows-latest`. `git clone` then rewrote the 2,585-line `dist/contract.json` to CRLF, its sha256 became `ad124526e86b`, and B05 failed the pin check against `4117dc73744e` on a fixture whose contract nobody had touched. All ten e2e cases failed there and only there; ubuntu and macOS passed because autocrlf is off. The fixture clones are deliberately NOT given `core.autocrlf=false`: the point of the Windows cell is that a DEFAULT Windows git produces a checkout the product accepts. This is ARC-09-S05's own lesson — files are hashed as bytes, and `.gitattributes` is what makes that comparable between machines — landing on the fixture built to test it.
11. **`docs/INSTALL.md`'s budget moves 252 → 268.** "How do I upgrade" is the second question an install page is asked; the detail is in `docs/CONTRIBUTING.md` § Upgrading the product, linked from it.

**Definition of done.** Merged; `upgrade-e2e` green on three OSes; `docs/INSTALL.md` "Upgrading" written; banner nudge freshness rule and `E-28` documented in ARC-08's check table; README acceptance 3 and 4 demonstrated by the harness in CI.

---

### ARC-09-S08 — CI matrix completion: every job on the intended cells; the Windows job without Git Bash (launchers, `--password-stdin`, MCP handshake, hook in exec form)

**As** CI **I want** one workflow in which lint, server tests, contract gate, dist rebuild-diff, design-only bootstrap, doctor, citations, EOL, commitlint, release dry-run and upgrade e2e each run on their intended cells of `ubuntu-latest` / `macos-latest` / `windows-latest` × Node 20/22/24, plus one Windows job with Git Bash removed from PATH that proves `bootstrap.cmd`, `snowarch.cmd`, the `--password-stdin` credential path, the MCP stdio handshake and the SessionStart hook in exec form **so that** the design-only and live paths are proven on three platforms on every commit (README acceptance 5; P-29, P-37 — CI replaces the inert pre-commit chain; P-40 and Q-B — native Windows).

**Context.** README deliverables "CI matrix … with jobs: lint, server tests, contract, dist rebuild-diff, design-only bootstrap, doctor, citations; Windows job without Git Bash" and "CI matrix with the Windows job proving `bootstrap.cmd`, `snowarch.cmd`, masked input (`--password-stdin` path in CI), the MCP handshake, and the SessionStart hook in exec form"; `01` §4.1 (the no-Git-Bash job proves launchers, hook and MCP handshake — **not** the in-session skills, which need Claude Code's Bash tool), §13; `03` R-10; Q-B (native first-class conditional on S-03/S-04/S-08). The jobs were introduced piecemeal: ARC-01 S11 (`test`, `footprint`, `plugin-validate`), ARC-04 S13 (`dist-check`), ARC-05 S09 (`contract`), ARC-03 S02 (`gen-docs-areas.mjs --check` inside the root `lint` script) and S11 (`docs-real.yml` — a *separate* weekly / path-triggered workflow, not a `ci.yml` job), ARC-06-S14 (`bootstrap`, variants `node-cli` / `no-node` / a Windows `no-gitbash` cell — the first Windows-without-Git-Bash run), ARC-08-S11 (`doctor`), S02 (`commitlint`), S03 (`release-dryrun`), S07 (`upgrade-e2e`), S09 (`eol`). ARC-00 S13 provides the PATH-stripping recipe (`spikes/windows-recipe.md`).

**Scope.** In: the consolidated `ci.yml` job table with cells and `needs`; the `windows-native` job; `scripts/ci/strip-git-bash.mjs` (applies ARC-00 S13's recipe to `GITHUB_PATH`/`GITHUB_ENV`); `scripts/ci/hook-smoke.mjs`; required-status-check wiring; `docs/CONTRIBUTING.md` "CI matrix" table (final text in S11). Out: running Claude Code itself in CI (needs a login — `/snowarch …` skills are proven manually in ARC-10's validation run); the plugin-validate verdict (ARC-00 S-19); any live instance in CI (the `--password-stdin` proof uses fixture credentials and the probe is skipped).

**Design notes.**
- Final job table (cells; `needs` in parentheses):

  | Job | Cells | Provenance |
  |---|---|---|
  | `test` (lint, type-check, engine `node:test`, server vitest) | 3 OS × 3 Node | ARC-01 S11 |
  | `contract` (rebuild+diff, contract test, engine lint, gen:check) | 3 OS × 3 Node (rebuild-diff may be ubuntu-only if budget requires — ARC-05 S09 note) | ARC-05 S09 / ARC-04 S13 |
  | `bootstrap` (`--mode design --yes`; variants `node-cli` 3 OS × Node 20/22/24, `no-node` 3 OS with Node stripped from PATH, `no-gitbash` windows) | as ARC-06-S14 defines them (13 cells) | ARC-06-S14 |
  | `doctor` (after bootstrap, `--json --no-cache`, snapshot test) | 3 OS × Node 22 (`needs: bootstrap` via artifact of `.local/`) | ARC-08-S11 |
  | citations — no separate `ci.yml` job: `gen-docs-areas.mjs --check` runs inside `test`'s `npm run lint`, and `docs verify` on the real corpus runs inside `bootstrap`'s B02 (`node-cli` cells); the scheduled three-OS proof is `docs-real.yml` | (inside `test` and `bootstrap`) | ARC-03 S02 / ARC-06-S06 / ARC-03 S11 |
  | `eol` | ubuntu + windows (`core.autocrlf=true`) | S09 |
  | `commitlint` | ubuntu, PRs only | S02 |
  | `release-dryrun` | 3 OS × Node 22 | S03 |
  | `upgrade-e2e` | 3 OS × Node 22 | S07 |
  | `windows-native` (no Git Bash) | windows × Node 20/22/24 | this story |
  | `footprint`, `plugin-validate` | ubuntu | ARC-01 S11 |

  Concurrency group per ref with cancel-in-progress; `fail-fast: false` everywhere; every step is a `node …` or `npm …` invocation except CI-only assertions, which use `shell: pwsh` on Windows and `shell: bash` elsewhere (product code never assumes bash — `01` §13).
- `windows-native` job:
  ```yaml
  windows-native:
    name: windows-native (node ${{ matrix.node }}, no Git Bash)
    runs-on: windows-latest
    strategy: { fail-fast: false, matrix: { node: [20, 22, 24] } }
    defaults: { run: { shell: cmd } }          # cmd.exe, not pwsh: the launcher's native host
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: ${{ matrix.node }} }
      - run: node scripts/ci/strip-git-bash.mjs     # ARC-00 S13 recipe: drops Git\bin, Git\usr\bin, Git\mingw64\bin (keeps Git\cmd for git.exe); writes GITHUB_PATH; asserts `where bash` is empty afterwards
      - run: where bash & if not errorlevel 1 exit /b 1
      - run: .\bootstrap.cmd --mode design --yes
      - run: .\snowarch.cmd version
      - run: .\snowarch.cmd doctor --json --no-network > doctor.json
      - run: node scripts/ci/assert-doctor.mjs doctor.json --fail 0
      - run: npm ci --omit=dev --ignore-scripts
      - run: node scripts/ci/password-stdin-smoke.mjs
      - run: node tools/snowarch/lib/mcp-handshake.mjs packages/snowarch/dist/server.js --expect-contract
      - run: node scripts/ci/hook-smoke.mjs
  ```
  - `password-stdin-smoke.mjs`: spawns `snowarch.cmd instance add ci --url https://dev000000.service-now.com --env pdi --auth basic --username ci-fixture --password-stdin --preset read-only --no-probes --yes` with a fixture password on stdin — the flag set is ARC-07-S05's synopsis (`instance add <label> [--url] [--env] [--auth] [--preset|--flags] [--password-stdin] [--yes] …`, label positional) plus `--no-probes`, which ARC-07-S04/S08 define for `instance import` and which ARC-07-S05 accepts on `instance add` as well (added at this story's request) (probe skipped, `lastProbe: null`, summary line `probe: skipped (--no-probes)`; without it the probe would try to reach the fixture host, which must never happen in CI) — then asserts `.local/instances.json` exists, parses, has `auth.password` equal to the fixture, the process's stdout/stderr contain neither the password nor the clear username (masked `c*-fixture` form per `01` §7), and — on Windows — the doctor reports `file modes: ACL-inherited`. This proves the masked-input module's non-TTY branch on native Windows; the raw-mode TTY branch is S-04's spike evidence (a runner has no console).
  - `tools/snowarch/lib/mcp-handshake.mjs` (ARC-06-S08's exported module) spawns `node packages/snowarch/dist/server.js` with `SNOW_STORE` pointing at the fixture store, performs `initialize` + `tools/list`, compares to `dist/contract.json`; with the store present but `disabledMcpjsonServers` irrelevant (no Claude Code here), the server advertises the full read-only tool set — the assertion is "tool set == contract for preset read-only".
  - `hook-smoke.mjs`: writes the SessionStart payload (`{"hook_event_name":"SessionStart","source":"startup","cwd":"<checkout>"}` — the stdin fields `00` §5 hooks row and ARC-08-S08 name) to the hook's stdin and runs it **exactly as `.claude/settings.json` declares it** — `command: "node"`, `args: ["${CLAUDE_PROJECT_DIR}/tools/snowarch/hooks/session-start.mjs"]` (exec form, `01` §5 table) with the placeholder substituted by the script itself from `CLAUDE_PROJECT_DIR` = the checkout — asserting exit 0, stdout containing `Mode: design-only`, wall time < 1 s. (The placeholder expansion by Claude Code itself is S-03's evidence; CI proves the script under cmd.)
- `strip-git-bash.mjs` reads `spikes/windows-recipe.md`'s filter list (copied into the script as constants with the spike id in a comment); it must keep `C:\Program Files\Git\cmd` (git.exe) — `git` is a product prerequisite (`01` §4.1) and the launchers call it.
- Q-B conditionality: this job exists **only if** ARC-00 S-03, S-04 and S-08 passed. If any failed, the pre-recorded fallback applies: the job is renamed `windows-gitbash`, runs `bash ./bootstrap.sh --mode design --yes` under Git Bash, and `docs/INSTALL.md` states "Git for Windows required"; no other story changes.
- Required status checks on `main` after this story: the nine `test` cells, `contract`, the `bootstrap` cells, `doctor`, `eol`, `commitlint`, `release-dryrun`, `upgrade-e2e`, the three `windows-native` cells, `footprint` (and `plugin-validate` when S-19 confirmed). `docs-real.yml` is scheduled, so it is never a required PR check.

**Acceptance criteria.**
1. A push to `main` shows every job in the table above green; `gh api repos/farstic/ai-servicenow-architect/branches/main/protection/required_status_checks --jq '.contexts | length'` ≥ 20 and includes the three `windows-native (…)` contexts. (README acceptance 5, first half.)
2. In each `windows-native` cell the log shows `where bash` printing nothing (step exit 0 only because the assertion inverts it), then `Mode: design-only`, `DOCTOR: … 0 fail`, `handshake ok: 5 core tools + N read tools == contract(read-only)`, `hook ok (… ms): Mode: design-only`. (README acceptance 5, second half.)
3. `password-stdin-smoke.mjs` passes on the three Windows cells and, run on ubuntu/macOS in the `doctor` job, proves the same non-TTY path there; the resulting `.local/instances.json` has `lastProbe: null` (no network attempt — asserted by running with `HTTPS_PROXY=http://127.0.0.1:9`, which would fail any probe); its log contains no credential or clear username (asserted by the script and by ARC-08's redaction test over the job log artifact).
4. Removing `C:\Program Files\Git\cmd` from PATH as well (a deliberate throwaway run) fails `bootstrap.cmd` at B00 with the `git ≥ 2.25 not found` remedy — proving the job really depends on git.exe alone, not on Git Bash.
5. A PR that breaks `bootstrap.cmd` (e.g. a `goto` label typo) turns all three `windows-native` cells red while the other cells stay green.
6. Total wall time of the workflow on a push is < 25 min (macOS being the tail); the table in `docs/CONTRIBUTING.md` lists measured durations per job.
7. With Q-B fallback in force (simulated by an env flag in a throwaway branch), the workflow file switches to the `windows-gitbash` variant by changing one job block only.

**Tasks.**
1. Consolidate the job table into `ci.yml` (some jobs were added by other ARCs — align names, cells, `needs`, artifacts between `bootstrap` and `doctor`).
2. Write `scripts/ci/strip-git-bash.mjs`, `password-stdin-smoke.mjs`, `hook-smoke.mjs`, `assert-doctor.mjs`.
3. Add `windows-native`; run on a branch; fix Windows-only findings (path separators, `spawn` of `.cmd` files requires `shell: true` or explicit `cmd /c`).
4. Wire required contexts; record per-job durations in `docs/CONTRIBUTING.md` (S11).
5. If Q-B fallback: apply the `windows-gitbash` variant and the INSTALL wording.

**Test strategy.** The workflow is the test; criteria 4, 5 and 7 are deliberate throwaway runs. Fixture credentials only; no live instance; nothing in CI writes outside the runner.

**Dependencies.** ARC-00 S06 (S-03 verdict) and S07 (S-04 / S-08 verdicts) → Q-B, S13 (PATH recipe); ARC-06-S08 (`lib/mcp-handshake.mjs`), S11 (launchers), S14 (`bootstrap` job and its `no-gitbash` cell); ARC-07-S01 (`--password-stdin`), S05 (`instance add` non-interactive form; `--no-probes` accepted there — requested by this story), S04 (`--no-probes` semantics); ARC-08-S11 (doctor job, snapshot, redaction); ARC-04 S13; ARC-05 S09; ARC-03 S02 / S11; S02, S03, S07, S09 (jobs to consolidate).

**Size.** L — 3–5 days (mostly Windows-only iteration on a runner nobody can reproduce locally — `03` R-10; the maintainer has no Windows machine).

**Risks / open points.** (a) `windows-latest` may carry `C:\Windows\System32\bash.exe` (WSL stub) — the recipe (ARC-00 S13) must decide whether to strip `System32` (not possible) or assert `where bash` finds only the WSL stub and that it is not runnable (`bash -c true` fails without a distro); recorded as an open point for S13 to settle. (b) Runner image updates (Server 2022 → 2025) change PATH layout — the strip script prints the resulting PATH for diagnosis. (c) macOS minutes: if budget bites, macOS runs `test`, `bootstrap-design`, `doctor`, `release-dryrun`, `upgrade-e2e` on `main` only (documented option, not the default).

**Definition of done.** Merged; all contexts required; `docs/CONTRIBUTING.md` CI table with durations; Q-B outcome reflected in the job name and in `docs/INSTALL.md`.

---

### ARC-09-S09 — Line-ending proof: `tests/eol.test.mjs` over `git ls-files --eol`; launchers run from a CRLF-default Windows checkout

**As** a maintainer **I want** a test that reads `git ls-files --eol` and fails on any tracked file whose index or working-tree line endings violate `.gitattributes`, and a Windows CI step that clones with Git for Windows' default `core.autocrlf=true` and runs `bootstrap.cmd`, `bootstrap.ps1` and `snowarch.cmd` **so that** a consultant's Windows checkout never breaks on a line-ending error (README acceptance 6; `01` §13) and no PR can regress the policy ARC-01 S07 committed.

**Context.** README deliverable "`.gitattributes` (LF for `*.mjs *.md *.json *.sh`; CRLF for `*.ps1 *.cmd`)"; ARC-01 S07 created the file (`* text=auto eol=lf`, per-extension rules, `*.ps1`/`*.cmd` `eol=crlf`, `*.drawio`/`*.svg` LF) and its criterion 5 notes "ARC-09 repeats this with the real launchers". ARC-04 S13 added `packages/snowarch/dist/** text eol=lf`. Neither old repository had a `.gitattributes`. `cmd.exe` is widely reported to mis-parse LF-only batch files around labels (`goto`) — a platform behaviour not cited in `01`/`03` and not spiked on its own; the CRLF rule for `*.cmd` is ARC-01 S07's committed policy regardless, and ARC-00 S-08 / S13 run `bootstrap.cmd` only as a CRLF file. This story therefore *enforces* the policy and proves the launchers run after a real Windows clone; it does not depend on the LF-failure claim being reproducible. PowerShell tolerates either ending; `bootstrap.ps1` is held to CRLF for consistency.

**Scope.** In: `tests/eol.test.mjs`; the `eol` CI job (ubuntu + windows with `core.autocrlf=true`); launcher smoke under a CRLF-default clone; a `.gitattributes` completeness assertion (every tracked extension is covered by an explicit rule or `text=auto`). Out: editing `.gitattributes` itself (ARC-01 S07 owns it; if this story finds a gap it adds the line there with a note).

**Design notes.**
- `tests/eol.test.mjs` (`node:test`, stdlib): runs `git ls-files --eol`, parses `i/<index> w/<worktree> attr/<attrs>\t<path>`, and asserts: (1) no tracked text file has `i/crlf` or `i/mixed` (the index is always LF — git normalises on add; `eol=crlf` affects checkout only); (2) `*.ps1`, `*.cmd` → `attr/text eol=crlf` and, on Windows, `w/crlf`; (3) `*.mjs *.md *.json *.sh *.ts *.yml *.yaml *.txt` and `packages/snowarch/dist/**` → `eol=lf` and `w/lf` on every OS; (4) binary files (`*.png`, `*.docx`) show `i/-text`; (5) every file whose extension is not in the explicit list is either `text=auto`-normalised (`i/lf`) or listed in `tests/eol.allowlist.json` with a reason. Failure message names the file and the expected/actual pair: `eol: bootstrap.cmd expected attr eol=crlf w/crlf, got eol=lf w/lf`.
- `eol` job:
  ```yaml
  eol:
    strategy: { matrix: { os: [ubuntu-latest, windows-latest] } }
    runs-on: ${{ matrix.os }}
    steps:
      - run: git config --global core.autocrlf true        # Git for Windows installer default ("Checkout Windows-style")
        if: runner.os == 'Windows'
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22 }
      - run: node --test tests/eol.test.mjs
      - run: .\bootstrap.cmd --help & .\snowarch.cmd --help & powershell -NoProfile -ExecutionPolicy Bypass -File bootstrap.ps1 --help
        shell: cmd
        if: runner.os == 'Windows'
      - run: node scripts/ci/assert-crlf.mjs bootstrap.cmd bootstrap.ps1 snowarch.cmd    # bytes contain \r\n on every line
        if: runner.os == 'Windows'
      - run: node scripts/ci/assert-lf.mjs bootstrap.sh snowarch tools/snowarch/bin/snowarch.mjs .mcp.json     # no \r anywhere, even with autocrlf=true
  ```
  The `--help` runs prove the launchers parse and exit 0 after a real Windows clone (README acceptance 6, "runs without a line-ending error"); the byte assertions prove the checkout side of the policy under `autocrlf=true`, which is what a consultant laptop has.
- Also asserted on ubuntu: `bash -n bootstrap.sh` and `sh -n bootstrap.sh` (syntax only) and that `bootstrap.sh` has no `\r` — a CRLF `bootstrap.sh` fails with `bad interpreter: /bin/bash^M`, the classic symptom this policy prevents.

**Acceptance criteria.**
1. `node --test tests/eol.test.mjs` passes on the committed tree on all nine `test` cells and in the `eol` job.
2. `git ls-files --eol -- '*.ps1' '*.cmd'` on the Windows `eol` runner shows `i/lf w/crlf attr/text eol=crlf` for every launcher; `-- '*.sh' '*.mjs' '*.json' '*.md'` shows `i/lf w/lf`. (README acceptance 6, first half.)
3. On the Windows `eol` runner with `core.autocrlf=true`, `bootstrap.cmd --help`, `snowarch.cmd --help` and `powershell … -File bootstrap.ps1 --help` each exit 0. (README acceptance 6, second half.)
4. A PR that commits `bootstrap.cmd` with LF endings (forced with `git -c core.autocrlf=false add` and an attribute override in the throwaway branch) fails the test with the `expected attr eol=crlf …` message; a PR that adds a `*.mjs` file with CRLF fails with `i/crlf` reported.
5. Every extension present in `git ls-files` is covered (criterion 5 of the test); adding a `scripts/x.pyw` file without a rule fails until a rule or an allow-list entry exists.
6. `bash -n bootstrap.sh` passes on ubuntu and macOS.

**Tasks.**
1. Write `tests/eol.test.mjs` and `tests/eol.allowlist.json`; write `scripts/ci/assert-crlf.mjs` / `assert-lf.mjs` (20 lines each).
2. Add the `eol` job; mark it required.
3. Fix any gap found in `.gitattributes` (in ARC-01 S07's file, with a comment naming this story).
4. Add a "Line endings" paragraph to `docs/CONTRIBUTING.md` (S11).

**Test strategy.** Unit on every cell; the `eol` job on ubuntu + Windows with the consultant-default `autocrlf`; criterion 4 by deliberate throwaway PRs.

**Dependencies.** ARC-01 S07 (`.gitattributes`), ARC-06-S10/S11 (the launchers exist). Consumer: S08 consolidates the `eol` job onto its final cell.

**Size.** S — half a day.

**Risks / open points.** `git ls-files --eol` output for files with `-text` attribute varies slightly across git versions (2.25 floor vs runner's 2.4x) — the parser tolerates both `i/-text` and `i/none`.

**Definition of done.** Merged; `eol` required on `main`; `docs/CONTRIBUTING.md` paragraph; README acceptance 6 evidenced by the Windows `eol` run URL.

---

### ARC-09-S10 — Optional `publish-npm.yml`: `npm publish --provenance` of `@farstic/snowarch` from a release tag, manual dispatch, dry-run by default (roadmap `01` §17 item 2)

**As** a maintainer **I want** a workflow I can dispatch by hand for an existing release tag that verifies the tag, runs the contract gate, and publishes `packages/snowarch` to npm as `@farstic/snowarch` with provenance — defaulting to a dry run — **so that** the secondary channel for non-Architect users (`npx @farstic/snowarch start`) exists behind a guard and can never touch `@farstic/snow-mcp` (D-01) or publish an unverified tree (`03` §D: the old 1.0.0 tarball had no provenance).

**Context.** README deliverable "optional secondary npm publish job (`--provenance`, disabled by default — roadmap `01` §17)"; `01` §12 last bullet and §17 item 2 (package name corrected by D-01 to `@farstic/snowarch`; the engine never consumes it); R-1 (2.0.0 is the first version under the new name); ARC-04 S01 (package identity, `bin` `snowarch`, `files` `dist/`).

**Scope.** In: `.github/workflows/publish-npm.yml` (`workflow_dispatch` only), `scripts/ci/assert-publish-target.mjs`, `publishConfig` in `packages/snowarch/package.json`, the CONTRIBUTING paragraph. Out: enabling it on tag push (never — a maintainer decision per release); the engine consuming the package (never); any change to the `@farstic/snow-mcp` record (forbidden; the assertion script makes it impossible from this workflow).

**Design notes.**
- `publish-npm.yml`:
  ```yaml
  name: publish-npm (optional)
  on:
    workflow_dispatch:
      inputs:
        tag:     { description: 'Release tag, e.g. v2.0.0', required: true, type: string }
        dry_run: { description: 'Dry run (no publish)', required: true, type: boolean, default: true }
  permissions: { contents: read, id-token: write }     # id-token for npm provenance (OIDC)
  jobs:
    publish:
      runs-on: ubuntu-latest
      steps:
        - uses: actions/checkout@v4
          with: { ref: ${{ inputs.tag }}, fetch-depth: 0 }
        - uses: actions/setup-node@v4
          with: { node-version: 22, registry-url: 'https://registry.npmjs.org' }
        - run: node scripts/ci/verify-tag.mjs ${{ inputs.tag }}                       # S03: tag message == tree
        - run: node scripts/ci/assert-publish-target.mjs                              # name == @farstic/snowarch; never @farstic/snow-mcp; version == tag; bin == snowarch; files ⊇ dist/
        - run: npm ci --ignore-scripts
        - run: node scripts/contract-gate.mjs
        - run: npm publish --workspace packages/snowarch --provenance --access public ${{ inputs.dry_run && '--dry-run' || '' }}
          env: { NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }} }
  ```
  `NPM_TOKEN` is a repository secret the owner creates for the `farstic` account (granular token scoped to `@farstic/snowarch` only — the CONTRIBUTING text says so explicitly, so even a leaked token cannot touch `@farstic/snow-mcp`); `--provenance` requires the OIDC `id-token: write` permission and a public GitHub repository (D-02 makes it public). `publishConfig: { "access": "public", "provenance": true }` in `packages/snowarch/package.json`.
- `assert-publish-target.mjs`: reads `packages/snowarch/package.json`; exits 1 with `publish: refusing — package name is "@farstic/snow-mcp" (D-01: the old record is never touched)` if the name is anything but `@farstic/snowarch`; asserts `version` equals the tag without `v`; `bin.snowarch === "dist/cli/index.js"`; `files` includes `dist/`; `engines.node >= 20`; `license === "Apache-2.0"`; `repository.url` names `farstic/ai-servicenow-architect`.
- The published tarball must work stand-alone: `npx -y @farstic/snowarch@2 start` boots the stdio server in unconfigured mode (ARC-04 S04) and `npx -y @farstic/snowarch@2 instance add …` runs the wizard — the `--dry-run` output lists the tarball contents; a post-publish smoke (`npx … --version` from a clean temp dir) is a documented manual step, not automated (it needs the real registry).

**Acceptance criteria.**
1. Dispatching the workflow with `tag: v2.0.0-rc.0` (the S03 rehearsal tag) and `dry_run: true` runs green; the log shows `npm notice` tarball contents including `dist/server.js`, `dist/cli/index.js`, `dist/contract.json`, and `Tarball Details … name: @farstic/snowarch`; nothing is published (`npm view @farstic/snowarch` still returns "not found" afterwards).
2. With `packages/snowarch/package.json` name temporarily set to `@farstic/snow-mcp` on a throwaway tag, the run fails at `assert-publish-target` with the D-01 refusal message before `npm ci`.
3. With a lightweight tag the run fails at `verify-tag` (S03 script).
4. The workflow has no `push`/`tags` trigger (`grep -c "workflow_dispatch" .github/workflows/publish-npm.yml` = 1 and `grep -c "tags:" …` = 0).
5. `docs/CONTRIBUTING.md` states: "disabled by default; dispatch manually; token scoped to `@farstic/snowarch`; never publish `@farstic/snow-mcp`; the engine never consumes the package".

**Tasks.**
1. Add `publishConfig` (ARC-04 S01's file) and `scripts/ci/assert-publish-target.mjs` with a unit test.
2. Write `publish-npm.yml`; dispatch a dry run against the rehearsal tag.
3. Document the secret creation (granular token, single package) and the manual post-publish smoke in `docs/CONTRIBUTING.md` (S11).

**Test strategy.** Unit for the assertion script (all cells); one manual dry-run dispatch; a real publish only when the owner decides (roadmap).

**Dependencies.** S01 (tag format), S03 (`verify-tag.mjs`, rehearsal tag); ARC-04 S01 (package identity), ARC-05 S09 (contract gate).

**Size.** S — half a day.

**Risks / open points.** npm's provenance requires the `repository.url` in `package.json` to match the GitHub repository exactly (`git+https://github.com/farstic/ai-servicenow-architect.git`) — asserted by the script. Trusted publishing (OIDC without a token) may be preferred later; the workflow change is the `NODE_AUTH_TOKEN` line only.

**Definition of done.** Merged; one green dry run recorded; CONTRIBUTING paragraph; `npm view @farstic/snow-mcp` unchanged (1.0.0).

---

### ARC-09-S11 — `docs/CONTRIBUTING.md` release / upgrade / CI-matrix sections; `docs/INSTALL.md` "Upgrading" section; `docs/ARCHITECTURE.md` versioning section

**As** a maintainer (and, for the upgrade section, an individual practitioner) **I want** the release procedure, the two protection flows, the commit convention, the store-migration recipe, the CI job table with durations, the line-ending policy, the optional npm channel and the user-facing upgrade instructions written in the three documents `01` §3 names **so that** the next person can cut a release or upgrade a checkout from the documents alone (README deliverable "`docs/CONTRIBUTING.md` release section"; ARC-01 S12 created the files; every story above left a stub or a paragraph that this story consolidates and cross-links).

**Context.** README deliverable 6 (last item) and story 10; `01` §3 `docs/` line; ARC-01 S12 (first versions of ARCHITECTURE and CONTRIBUTING, with a "Versioning: never edit a version by hand; `scripts/release.mjs` is the only writer" paragraph queued by ARC-01 S06); ARC-05 S11 (CONTRIBUTING sections on the contract gate — the release section links to them, does not repeat them).

**Scope.** In: `docs/CONTRIBUTING.md` sections "Commits" (S02), "Releasing" (S01/S03: prerequisites, one-shot flow, two-phase `--tag-only` flow, what a failed gate means, the tag message, rehearsal tags, deleting a bad tag before push, hotfix on `--allow-branch release/vX.Y`), "Store schema migrations" (S06), "CI matrix" (S08 table with cells, `needs`, measured durations, the macOS-cost option), "Line endings" (S09), "npm channel (optional)" (S10); `docs/INSTALL.md` "Upgrading" (S07 — user wording, no maintainer detail) and "What to paste in a bug report" (`./snowarch version` output, S04); `docs/ARCHITECTURE.md` "Versioning, tags and upgrade" (one version counter, tag trailers, input-hash table from S05, cache file `.local/upgrade-check.json`, what the banner reads). Out: new mechanisms; changing any other ARC's documentation beyond cross-links.

**Design notes.**
- Each section starts with the exact command(s) and ends with "Where this is tested" naming the test file or CI job — the documents must stay consistent with the tests, and `tests/docs-links.test.mjs` (ARC-05 S04's path-reference check, extended here with a list of required anchors) fails when a named test file or anchor disappears.
- The "Releasing" checklist (verbatim, to be pasted into a release PR description):
  1. `git switch main && git pull --ff-only` · CI green on HEAD · `vendor/ServiceNowDocs` present.
  2. `node scripts/release.mjs 2.0.0` (plan → Enter) — or `--allow-branch release/v2.0.0` then PR, merge (no squash), `node scripts/release.mjs 2.0.0 --tag-only` on `main`.
  3. `git push origin main --follow-tags` (or `--push`).
  4. Watch `release` → check the Release page: three doctor JSONs, `install-metrics.md`.
  5. Update the install page's metrics link if the numbers moved; announce.
  6. Optional: dispatch `publish-npm` with `dry_run: false`.
- "Upgrading" in `docs/INSTALL.md` (user voice): `./snowarch upgrade` · what re-runs · "credentials untouched" · "restart `claude`" · `./snowarch upgrade --check` · the diverged-branch and proxy notes with the troubleshooting anchors.
- Retired-name discipline: the old repository names appear only in the "History" section of `docs/ARCHITECTURE.md` (ARC-01 S12) and in the changelog Notes (S02) with the historical marker; this story adds none.

**Acceptance criteria.**
1. `docs/CONTRIBUTING.md` contains the six sections with the exact headings above; every command in them exists (`tests/docs-links.test.mjs` extracts fenced `./snowarch …`, `node scripts/…` and `npm run …` commands and asserts the script/subcommand exists).
2. `docs/INSTALL.md` has "Upgrading" and "What to paste in a bug report"; the retired-name lint (ARC-05 S03) passes on all three documents.
3. A reader following "Releasing" on the harness repository (S07) cuts `v9.3.0` without consulting any other document (dry-run walkthrough recorded in the PR).
4. The ARCHITECTURE table equals S05's rendered `INPUTS` (the render-and-diff test passes).
5. Every "Where this is tested" line names an existing file or CI job (asserted by the docs test).

**Tasks.**
1. Collect the stubs left by S01–S10; write the six CONTRIBUTING sections and the two INSTALL sections; write the ARCHITECTURE section.
2. Extend `tests/docs-links.test.mjs` with the required-anchor list and the command-existence check.
3. Walk the release checklist against the harness repository; record the walkthrough.

**Test strategy.** `tests/docs-links.test.mjs` on every cell; the manual walkthrough once.

**Dependencies.** S01–S10 (content), ARC-01 S12 (files), ARC-05 S04/S11 (link checker, contract sections).

**Size.** S — half a day of writing plus the walkthrough.

**Risks / open points.** Documentation drift after this ARC — the tests bind commands and anchors, not prose; prose changes remain a review duty.

**Definition of done.** Merged; docs test green; the release checklist walkthrough recorded; ARC-10 can point users at `docs/INSTALL.md#upgrading`.

---

## Sizing summary

| Story | Size | Days (min–max) |
|---|---|---|
| S01 release script | L | 3–5 |
| S02 changelog + commitlint | M | 1–2 |
| S03 release workflow | M | 1–2 |
| S04 `version` | S | 0.5 |
| S05 input-hash table | M | 1–2 |
| S06 store migrations | M | 1–2 |
| S07 `upgrade` + nudge + harness | L | 3–5 |
| S08 CI matrix + Windows native | L | 3–5 |
| S09 EOL proof | S | 0.5 |
| S10 optional npm publish | S | 0.5 |
| S11 documentation | S | 0.5 |
| **Total** | | **15–25 engineer-days** (3–5 weeks for one engineer) |

Under the six-week ceiling. The tail risk is S08 (Windows-only iteration on a runner no maintainer can reproduce locally, `03` R-10) and the D-06 hedge: this ARC cannot start its ARC-06-dependent stories (S05, S07, S08, S09) before ARC-06 exists, and ARC-06 waits for the S-14 conclusion; S01–S04, S06 and S10 depend only on ARC-01/03/04/05 and can start earlier.
