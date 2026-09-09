# Changelog

All notable changes to the Claude ServiceNow Architecture Engine are documented in this file.

**Repository:** [`farstic/claude-servicenow-live`](https://github.com/farstic/claude-servicenow-live)
**Last updated:** 3 June 2026

The engine follows a minor-version cadence where the **first digit** signals a major architectural shift, and the **second digit** signals an additive or corrective patch within that architecture.

---

## Unreleased

### Fixed

- **A fresh install whose pin equals the branch tip produced an EMPTY corpus that called itself
  complete.** Two defects, both mine, found by the first real bump:
  - `syncCorpus` only ran `checkout --detach` when HEAD differed from the pin. A
    `git clone --no-checkout` leaves an empty index and an empty working tree, so when the pin *is*
    the branch tip its HEAD is already correct — "at the pin" was true and "there are files" was
    false. Every run for seven weeks had a pin behind the tip, so the fetch-by-hash path always ran
    and hid it. **Populated is now its own question**, checked from the index, and an unpopulated
    checkout is *repaired* rather than refused as dirty: an empty index reads as staged deletions,
    and telling someone they have local changes they never made is the wrong answer.
  - `docs sync` printed `INCOMPLETE` in its summary and then `docs sync: complete`, exit 0. The gate
    that stops that was deleted by accident at ARC-03-S06, when replacing the `--json` object
    swallowed the block beside it. Restored, with the three tests that would have caught it.
- **The recipe block in `docs/ARCHITECTURE.md` is now GENERATED.** It embeds the docs pin, so the
  byte-for-byte parity test failed on every bump pull request by construction. `gen-docs-recipe.mjs`
  joins the generator list and `--check` is the same guarantee without the built-in failure — *a
  documentation block that embeds a moving value must be generated, not asserted.*
- **`docs-bump.yml` builds from the pull request's base**, not the ref it was dispatched on. The
  first real run was dispatched from `main` and computed its "from" pin against main's tree — right
  only while the two branches share a pin. One value, used by the checkout and by `--base`, asserted
  equal by test. The two repository settings the workflow depends on and cannot assert are named in
  its header, in `CONTRIBUTING.md` and as an ARC-08 doctor candidate.

### Added

- **The MCP registration travels with the clone.** `.mcp.json` and the non-permissions half of
  `.claude/settings.json` are committed, secret-free and asserted — the first story of M3.
  - `.mcp.json`: `stdio` · `node` · `${CLAUDE_PROJECT_DIR:-.}/packages/snowarch/dist/server.js`,
    forward slashes only, every `${…}` carrying a `:-` default because an unset variable without one
    is passed through as literal text. The `env` block is **`SNOW_STORE` and `SNOW_LOG_LEVEL` only**:
    ARC-00 S-20 confirmed the spawned server inherits the launching shell's environment, so proxy
    and CA variables need no repeating.
  - `settings.json` gains `env.MCP_TIMEOUT: "120000"` — S-06's measurement, about 160× the worst
    handshake over 27 runs on nine CI cells — beside the **generated** `permissions`. It stays
    **hook-free** per S-05: a `SessionStart` hook in the committed file would run before Node is
    known to exist.
  - `tests/registration-files.test.mjs` asserts the server key against `engine.config.json` rather
    than a literal, every placeholder's default, the S-20 key set, the absence of a `hooks` key, that
    neither file carries a credential-shaped key or value, that both are tracked while
    `settings.local.json` and `.local/` are ignored, and that a regeneration leaves `env` intact.
  - **Engine lint L02 and L07 no longer SKIP.** Both `.mcp.json` legs run: eleven checks, no notes.
  - **`~/.claude.json` is written by nothing here** — P-01's file. Measured: starting a session
    changes exactly one top-level key, `cachedGrowthBookFeaturesAt`, the CLI's feature-flag cache.

### Added

- **The recipe, proved against the real corpus on three operating systems — and ARC-03 is complete.**
  `.github/workflows/docs-real.yml` fetches the actual 300 MB corpus on Ubuntu, macOS and Windows,
  weekly and whenever the code that decides the checkout changes. Measured on its first green run:
  **179 MB tree / 34,360 files** (183 MB on Windows), **25.3 s Ubuntu · 27.5 s macOS · 35.1 s
  Windows**, `dead: 0` everywhere, `core.longpaths true` on Windows.
  - **The longest path is 197 characters inside the corpus and 272–286 on disk.** Both are printed,
    because they answer different questions — and the second is already over `MAX_PATH`, which is
    the S-07 margin argument as a measurement rather than a prediction.
  - A second Windows cell keeps Git Bash on PATH. **Acceptance criterion 5 was vacuous until this
    story's fourth fixup**: every step said `shell: bash`, which on Windows *is* Git Bash, so the
    cell meant to prove independence from bash was running under it. The job is now one Node entry
    point under the platform's default shell, and the log distinguishes "bash reachable" (True — the
    image carries one in System32) from "git bash reachable" (False after the strip).
  - `E12_ABSENT(mode)` in `status.mjs` is the doctor's absent-corpus line, printed by `docs status`
    and imported by ARC-08 rather than retyped: **FAIL, never WARN or SKIP.** With no corpus and no
    state file the mode is `skip` — an absent checkout has no shape to infer from — while a recorded
    mode still wins, because an operator who asked for `sparse` and has none has a broken install.
  - The recipe-parity negative now changes **one character** (`--depth 1` → `--depth 2`): a lost line
    is the easy case, and a single byte is what ships a different checkout while looking identical.

- **Attribution, the measured figures, and one corpus section instead of six.**
  - Every successful `docs sync` now ends with
    `docs: ServiceNow product documentation © 2026 ServiceNow, Apache-2.0 — vendor/ServiceNowDocs/LICENSE`
    — suppressed by `--quiet`, never inside `--json`, and the same constant closes the launcher
    recipe and appears in `README.md`. Three copies of a licence line is three chances for one to be
    wrong, so a test compares them.
  - `NOTICE` gains the corpus paragraph. Its claim that the corpus's `LICENSE` **and `legal/`** are
    "preserved in every checkout, sparse or full" was **not true when written**: `legal/` is a root
    DIRECTORY and cone mode materialises root files only. The recipe now carries it by name and the
    completeness check fails without it — the claim is enforced rather than softened.
  - `README.md` carries the install figures: **302 MB and about 35 s** sparse (measured 2026-09-06,
    ARC-00 S-07), and **447 MB / 48,997 files** for `--mode full` (measured 2026-09-09 — S-07 never
    measured full mode, and the README says so rather than borrowing a number).
  - `docs/ARCHITECTURE.md`: the six corpus sections S05–S09 each added are folded into one —
    "Docs corpus: how the pin, the areas file and the gate relate" — three artefacts, who writes and
    reads each, four invariants, then the commands, the exit table and the recipe block.

### Fixed

- **`sync` reported "up to date" over a checkout missing a directory it required.** Adding `legal/`
  to the cone changed what the recipe WRITES but not what `inspect` COMPARED, so the two disagreed
  and the comparison won. One definition of the cone now, used by both.
- **The `ai-gateway-overview.md` citation, remapped in three places.** Upstream withdrew the AI
  Gateway surface between `ba513f2` and `11b39be` — at the tip there is no `ai-gateway*` page and no
  MCP page in `ai-control-tower/` at all, so this was a withdrawal, not a rename. The rows now cite
  `configure-third-party-llms-using-ai-control-tower.md` and `ai-model-providers.md`, which resolve
  at **both** pins. The bump report named one dead path; there were **three citation sites**, because
  the report groups by path, and a remap has to fix every site.

- **The weekly docs bump, as a schedule rather than an intention.** P-11 records a monthly refresh
  ritual that was never executed; `.github/workflows/docs-bump.yml` runs it on Mondays at 05:17 UTC
  and opens one pull request. **It never merges.**
  - `scripts/docs-bump.mjs` is a thin wrapper. Everything that decides anything stays in the
    upstream refresh; this renders the pull-request body — a three-item checklist, then S07's report
    **verbatim inside a fence**, so a reviewer comparing it against a local run finds the same bytes.
  - One bump at a time: the branch is named for the target SHA, so a re-run updates the PR instead
    of opening a second, and a newer tip closes the older one as `superseded by #<n>`.
  - A **dry run** exits 0 with the body in the log and a `::warning::` annotation for newly dead
    citations — reporting is its job, and the red build belongs on the pull request where someone
    can act on it. Exit 6 fails the job loudly; exit 4 cannot happen on a fresh checkout and is
    treated as a bug in the recipe if it ever does.
  - `actionlint` joins CI. The workflows are code, this one has a multi-line shell step with `gh`
    calls and expression interpolation, and nothing else was checking them.
  - Tests stub `gh` with a script on PATH that records its argv — never the real one. A test that
    could open a pull request would defeat the point of a workflow that never merges.

- **`docs family <name>` — the release-family switch, proposed before it is applied.** The dry run
  is the proposal and `--yes` applies exactly what it printed; no line is edited that was not shown.
  - **EDIT only when the matched phrase is the line's ONLY family mention.** Anything else —
    "NOT available in the Australia release family, unlike Vancouver" — is listed under REVIEW
    whole, because half a sentence about the new family and half about the old is worse than a line
    nobody touched. On the real tree that is **53 EDIT and 69 REVIEW** lines, every gateway skill
    carrying at least one of each.
  - **The pin moves first, while the tree is still clean**, so S07's dirty-tree refusal guards the
    whole operation instead of tripping on this command's own edits. A tree dirtied between the dry
    run and the apply is refused before anything is written.
  - A failing lint exits 1 with everything staged — the maintainer needs the edits to fix what the
    lint caught — and the output ends with how to finish and how to abandon.
  - History (`docs/plans`, `docs/spikes`, `docs/decisions`, the changelog, RELICENSING) is never
    scanned, listed or edited: it records what was true when it was written.
  - The stored transcript is `docs/validation/ARC-03-S08-family-dry-run.md`.

- **`docs sync --upstream` — the maintainer refresh.** Fetches the family tip (or a named SHA),
  moves the pin and the gitlink, re-runs the citation gate and prints which citations *became* dead.
  It stages both paths and **commits nothing**: a human reads the diff and decides.
  - The baseline verify runs **before** the move, because "newly dead" is a difference between two
    states and the first stops existing the moment the corpus moves.
  - The pin write replaces one 40-hex string rather than reparsing the file, so the reviewer's diff
    is one token and not a reformat; it refuses outright if the file does not hold the pin it was
    told to replace.
  - Exit **1** means the pin moved *and* citations broke — both true, and the pin is staged because
    you need the new corpus to repair the citations against it. Exit **6** is new: the upstream does
    not have what was asked for (renamed family branch, unreachable SHA), and nothing moved.
  - An upstream history rewrite that leaves the tip *behind* the pin is followed, not refused, and
    the report says `(older than the current pin)` — staying put would hide the rewrite.
  - `docs status` now reads the gitlink from the **index**, so a staged bump reads as `ok` with
    `(staged)` rather than as a mismatch against a pin the maintainer just moved.
  - `docs/CONTRIBUTING.md` gains "Refreshing the corpus"; `docs/ARCHITECTURE.md` gains the sequence
    and one exit-code table for every `docs` sub-command.

- **`docs status`, `docs verify --json`, and one description of the corpus.**
  `tools/snowarch/lib/docs/status.mjs` computes what the doctor and `/snowarch status` will both
  quote — present, pinned, right family, correctly sparse, fully cited — instead of each re-deriving
  it. Twenty keys, `schema: 1`, never a network call.
  - Two distinctions the shape is built around. `mode` is what was **asked for** (ARC-06's state
    file) and `sparse` is what is **on disk**; they can disagree, both are reported, and the
    disagreement is the finding. `citations` is `null` under `verify: false` but **the key is always
    present**, so a consumer can tell "not asked" from "asked and empty" — the doctor's `--quick`
    path and the SessionStart banner depend on that difference.
  - `familyMatches` comes from the tracked branch, not from HEAD: recipe C leaves a detached HEAD at
    the pin, so HEAD says nothing about the family.
  - `sync --json` now prints this object; S05's placeholder and its "replaced by S06" comment are
    gone.
  - `LEGACY_ROOTS` and `scanRepo`'s `legacy` flag are retired — ARC-02 deleted the root mirrors, and
    a flag whose only value pointed at directories that no longer exist is a way to scan nothing and
    report success.

- **`docs sync` completed: modes, reconcile, refusal, failure mapping and a printable recipe.** S03
  delivered the checkout; this is the rest of it, in the same module rather than a second one.
  - `--mode sparse|full`, defaulting to `docs.mode` in `.local/bootstrap-state.json` when ARC-06 has
    written one. `skip` is a bootstrap flag, not a mode: it means *do not call sync*, so it is
    refused rather than quietly treated as sparse. Switching either way is a config change on the
    existing checkout — no re-clone, `.git` unchanged.
  - **Reconcile**, each step idempotent and in order: dirty tree refused first, then clone, mode,
    pin (fetch by hash only when the object is absent), gitlink, and ADR-0008's root-file repair. A
    second run on a clean checkout issues no git write at all and says `[docs] up to date (…)`.
  - A dirty working tree inside the submodule exits **4** with one sentence and touches nothing;
    `--force` is never reached for. Every other git failure exits **5** with the sentence the
    operator needs — DNS, proxy (address printed, credentials masked), TLS interception, an
    unfetchable pin, no disk space, or git's own first stderr line, never swallowed. The classifier
    is unit-tested against canned stderr because a `file://` fixture cannot produce any of it.
  - `--print-recipe` prints the git commands for the caller's actual state, and
    `docs/ARCHITECTURE.md` gains the git-only launcher recipe that ARC-06 executes when Node is
    absent. `tests/docs-recipe.test.mjs` asserts the two are byte-identical, so the block cannot
    drift from the module.
  - `--json` prints a minimal `{ pin, mode, areas, files, bytes, complete }` object. **Temporary:**
    ARC-03-S06's `docsStatus()` replaces this shape; nothing should be built on these keys.
  - `tests/docs-sync.test.mjs` builds a fixture corpus and serves it over `file://` — no network.
    Two states it goes out of its way to produce, because they are the ones that break the recipe:
    a pin that is not the branch tip (so fetch-by-hash is genuinely exercised) and a submodule whose
    `.git` is a file rather than a directory.

- **The eighteen behavioural tests move to `tests/VALIDATION-TESTS.md`, and describe the product as
  it now is.** They still described a two-surface product that D-03 cut, carried a per-test line
  naming those surfaces, cited tool names retired at S12, and reserved T-07 for a pre-commit sync
  hook deleted at S01. (The retired words are not quoted here: `tests/no-legacy-surfaces.test.mjs`
  scans this file, and quoting them to explain their removal is how they come back.)
  - `**Modes:**` replaces `**Tiers:**` on every test. T-05 and T-06 declare a **dormant** design-only
    variant — the engine states that no live instance is configured and makes no tool call — and say
    what a dormant PASS proves: that the gate holds when there is nothing to write to.
  - T-05's expected behaviour is keyed on "a tool marked `mutates: true`" rather than a tool name.
    The always-loaded rule file owns the names; a test that spelled one would need editing at every
    rename, which is how the old names survived there in the first place.
  - **New T-07 — Mode reporting and `/snowarch` in design-only**, in numeric position.
  - T-06 and T-13 gain a runnable `### Prompt`. Both described their scenario in `### Setup` and left
    the tester to invent the wording, which is not a repeatable test.
  - The dated regression baseline and the pointers to the removed run-history tables are gone;
    results belong in the pull request or under `docs/spikes/validation-runs/`.
  - `tests/validation-tests-shape.test.mjs` makes criteria 1–4 permanent, with four fixture-negatives.
    It reads the forbidden-name list out of the story's own grep expression rather than spelling it —
    written inline, the list made the test file fail the engine lint on itself.
  - `docs/CONTRIBUTING.md` gains "When to run the validation tests".
  - **Executed once, in design-only, on a clean clone — 18 of 18.** The first pass was 16 of 18, and
    both failures were real:
    - The CSM Specialist skill claimed in five places that the baseline case-escalation tables are
      absent from this release family. Ten corpus files name them. The published markdown escapes
      the underscores, so the grep that would have caught it returned nothing — the skill now says
      so, in its citation-discipline section, as a rule rather than a footnote. T-02's example rested
      on that claim and is replaced by one verified against the corpus first; its pass criteria, fail
      signals and bypass block are unchanged, because those are the test.
    - The Operational Documentation consult did not survive a refused deployment. `CLAUDE.md` §8 now
      says the go-live proposal fires even when the deployment is declined or deferred — a refusal is
      exactly when the runbook is still outstanding. Line count unchanged at 125.
    Both fixes were re-run twice each; the run record keeps the first tally and its analysis beneath
    the final one.

- **`/snowarch` — the first utility skill** (`.claude/skills/snowarch/SKILL.md`): `status` (and the
  plain word `Status`, which `CLAUDE.md` §2 routes here), `setup-instance` with its `--resume` half,
  and `doctor`. One skill with three branches, because `$ARGUMENTS` substitution is confirmed on CLI
  2.1.258 — the three-skill fallback was not needed. It reports and configures; it never designs,
  never calls an MCP tool, and never asks for a credential: `setup-instance` collects a label and a
  URL in chat and hands the rest to the user's own terminal.
  - `engine.config.json` gains `roster.utility`, the single source that keeps a utility skill out of
    the persona count in the roster generator, the skills lint, `tests/engine-config.test.mjs` and
    `tests/skill-listing.test.mjs`. A name there that has no directory now fails.
  - `tests/snowarch-skill.test.mjs` holds the shapes that carry the guarantee — the tool grant, the
    Mode-line shapes, the five-step hand-off with its Windows line, and the count of sentences
    mentioning a password — each proved against a deliberately broken copy.
  - `tests/fixtures/snowarch-doctor-stub.sh` stands in for the doctor until ARC-06/ARC-08 build it.
  - Two defects found by running it rather than reading it, both in the file and both fixed: the
    Mode line was being decorated, and the "doctor unavailable" fallback named a cause it had not
    checked. Evidence: `docs/spikes/validation-runs/ARC-02-S11-snowarch-skill.md`.
- `docs/USER-GUIDE.md` gains a "`/snowarch` commands" section — the three sub-commands, how to read
  the four `Mode:` shapes, and why setup hands off to the terminal.

### Fixed

- **Preconditions in tests are now asserted, and one guard could never have worked.** A sweep of all
  75 test files after ARC-03-S06 found a vacuous test — a `git config` the worktree config outranked,
  so the state it "broke" was never broken and the repair it claimed to exercise never ran. Three
  fixes and a standing check:
  - `tests/docs-status.test.mjs` — the HEAD-off-the-pin and narrowed-sparse-set cases assert the
    fixture actually moved before asking the subject about it, so a fixture failure no longer reads
    as a module failure.
  - `packages/snowarch/tests/tools/parity.test.ts` — its `beforeEach`/`afterEach` deleted and
    restored `MCP_TOOL_PACKAGE`, **which cannot work**: `src/tools/index.ts` builds the catalogue at
    module scope, so the variable was read at import, long before either hook ran. Replaced by an
    import-time assertion that names the variable and says a different package needs a different
    process. No change to the code under test.
  - `tests/precondition-asserts.test.mjs` — the rule as a test. Mutating state that already exists
    (git config, checkout, sparse set, index) must be followed within two lines by an assertion that
    it took. Building a fixture from nothing is deliberately not covered: there the write is the
    input, and a failed write fails the test on its own.

### Changed

- `CLAUDE.md` rewritten to a line budget: **425 lines → 125**, 57,688 bytes → 10,997, against a cap
  of 200 and 20,000. It is loaded before every turn, so its length is a cost paid on every request.
  Nothing was deleted without a home: the repo map and the roster registry are now the generated
  sections of `docs/ARCHITECTURE.md`, the write gate and capture protocol are the generated rule
  file and `governance/mcp-protocols.md`, the worked example and the two embedded validation tests
  are `tests/VALIDATION-TESTS.md` T-01/T-02/T-03, and the two engine-version footers (v2.7.7–v2.8.0) are
  the two newest entries under "Before 2.0.0" below, verbatim. The
  five-row gateway table and the Code Reviewer proposal sentence are copied byte-for-byte, because
  they are what the behavioural tests assert.

### Fixed

- **A spawned child is reaped before its temp directory is removed.** Three suites drive the built
  server over stdio into a `mkdtemp` directory and remove it in `afterEach`. `client.close()` is a
  graceful shutdown, not a join — the SDK transport races the child's exit against a 2 s timer and
  returns either way — so on a loaded runner the removal walked a directory the child was still
  writing into and threw `ENOTEMPTY`, failing the build on the teardown of a test that had passed
  (`macos-latest` / node 24, one job of 25). `tests/helpers/server-child.ts` now tracks each child by
  the pid captured at spawn time, waits for it to be gone (`SIGKILL` after 500 ms, since a child that
  ignores `SIGTERM` cannot be waited out) and only then removes the directory, with `maxRetries` to
  absorb a write already in flight. Proved against a fixture child that ignores `SIGTERM` and writes
  every 2 ms: the old teardown gives `ENOTEMPTY`, the new one removes the directory.
- **CI ran twice per commit on a work branch.** `on.push.branches` included `arc-*/**` and `chore/**`
  as well as the branches a merge lands on, so a push to a branch with an open pull request started
  two full 25-job matrices for the same SHA. They shared a runner pool, and that contention is what
  surfaced the teardown race above. Push now triggers on `main` and `develop` only; work branches
  reach CI through `pull_request`, which is where their result is read. `docs/CONTRIBUTING.md` carries
  the process rule that makes this reliable — a story branch gets its draft pull request at first push.
- `snow_us_active_update_set_ensure` advertised the input shape it had *before* the update-set
  capture rework: `default_name`, and nothing required. The handler has required `name` since that
  rework, so a caller following the published schema passed `default_name` and got
  `INVALID_REQUEST` for a field it had been told was optional. The schema now says what the handler
  enforces — `name` required, `description` optional, `default_name` gone — and the tool's own
  description no longer promises to "create one automatically if none is in progress", which was
  the same stale behaviour. `dist/contract.json` is unchanged (it carries no schemas), so the
  engine pin and its sha are untouched.

---

## Before 2.0.0

Everything below is the imported engine's history, kept as written. **The term "Tier" below is
historical** — it is the retired permission and surface vocabulary that ARC-02-S06 replaced with
Mode (`design-only` | `live`) and Preset (`read-only` | `pdi-developer` | `full` | `custom`), and the
file paths are the ones those entries were written against. Rewriting them would falsify the record
of what was decided and when. ARC-09-S02 regenerates this file from conventional commits.

The two entries that follow (v2.8.0 and v2.7.7–v2.7.8) are the engine's version footers, moved here
verbatim from the imported `CLAUDE.md` by ARC-02-S08; the imported changelog itself ended at v2.7.6.

## v2.8.0 — Phase 2.8 (Delivery Governance) opens

*v2.8.0 — Phase 2.8 (Delivery Governance) opens. Two skill-only cross-cutting advisory consults added, taking the roster to 27 (corrected from "25" — see the authoritative roster-count note): **Licensing & Entitlement Specialist** (`skills/licensing-specialist/`) — what a design costs to license (subscription/fulfiller, SKU/tier, App Engine units, Now Assist Assists, third-party SaaS), §3.1 consult + post-build review; and **Estimation & Sizing Specialist** (`skills/estimation-specialist/`) — the sizing methodology and the number (ranges, ServiceNow complexity rubric, contingency, baseline-vs-custom §1.1 delta), recorded into baseline SPM. New governance family **§4 Delivery Artefact Governance** in `governance/governance-rules.md` — ADR (§4.1), Requirements Traceability / RTM (§4.2), RAID & NFR (§4.3) — seeded from new engine-level `templates/` (adr / traceability-matrix / raid-log / nfr-checklist). Wiring: taxonomy v1.5 (roster 25, §3.1 consults, §2.4 boundaries, §4.5 triggers), prompt-patterns v1.2 (PP-20 estimation, PP-21 licensing, PP-22 ADR, PP-23 RTM, PP-24 RAID/NFR), CLAUDE.md repo map + roster + §3.1 table + Artefact standards + Phase delivery-governance touchpoints. Carries forward v2.6: docs/ knowledge base, Standing Rule, repo map.*

## v2.7.7 – v2.7.8 — Diagramming Specialist; the document-gateway rule

*CLAUDE.md v2.7.8 — Phase 2.7 arc: CMDB & CSDM Specialist promoted to 5th v2.0 Domain Expert gateway with Phase 1 Step 5 wiring + multi-gateway co-fire rule (v2.7); Security & GRC consult/review skill (v2.7.1); repo-wide ServiceNowDocs citation-path audit, ~50 dead paths remapped (v2.7.2); ATF Author skill + batch sub-agent (v2.7.3); Operational Documentation skill, completing the §6.2 consult chain (v2.7.4); Discovery Specialist + UI/UX Specialist skills (v2.7.5); the final six specialist skills — Performance & Scale, SPM, App Engine, Migration, Reporting & Analytics, DevOps / Release Manager (v2.7.6), completing the 22-specialist roster (every specialist now has a SKILL.md). Diagramming Specialist added as the 23rd specialist and 9th sub-agent — skill + batch diagram-pack sub-agent, wired as a §6.2 post-build consult plus HLD/LLD Writer and Technical Designer downstream handoff; depicts architecture (Mermaid/draw.io/PlantUML/SVG), never decides it, and flags unapproved custom objects PENDING per §1.1 (v2.7.7). Merged with the RobertBH17 line (field notes, F-0xx fixes, T-11/12/13; this session's tests renumbered T-14/15/16). Document-gateway rule — Domain Expert gateways now also fire before finalizing a domain-scoped document deliverable (proposal / scoping doc / HLD / LLD / PDD), not only before builder dispatch; Phase 1 Step 5 intro + new "Document deliverables fire the gateway too" note, and taxonomy §6.1 Step 7, updated accordingly (v2.7.8).*

## v2.7.6 — Final six specialist skills — roster is now 100% skill-backed

**Released:** June 2026
**Trigger:** Six roster specialists were still persona-only (no SKILL.md), so "all specialists available for any engagement" wasn't literally true. This closes them.

### Added (skills/, mirrored in .claude/skills/)

- **performance-scale-specialist** — §3.1 consult + post-build scale audit. Query design (GlideAggregate/index/no-nested-loops), async/batch, data growth & archival, transaction limits, reporting-at-volume. §1.1: a shadow/summary table is the wrong reflex — use a PA indicator/index.
- **spm-specialist** — Strategic Portfolio Management: demand→idea→project/program→portfolio, investment funding, resource management, agile/SAFe. Grounded in `it-business-management/`.
- **app-engine-specialist** — custom low-code app architecture (scope strategy, App Engine Studio, decision tables, document templates, AEMC). **§1.1-critical** — proceeds only on an explicit Chief-Architect-approved custom app, and stays baseline-first inside it.
- **migration-specialist** — one-time data migration (data sources → import sets → transform maps → coalesce → reconcile → cutover/rollback). Bounded against Integration (ongoing sync). §1.1: map to the baseline target, no custom "legacy data" table, no custom dedup (coalesce/IRE).
- **reporting-analytics-specialist** — reports, dashboards, Performance Analytics; makes the explicit **report-vs-PA** call. §1.1: a PA indicator, never a custom rollup/data-mart table.
- **devops-release-manager** — §3.1 consult: update-set strategy, App Repository/AEMC, DevOps Change Velocity, CI/CD APIs, environment/clone strategy, backout. Bounded against Integration (the CI-tool wire). §1.1: baseline release mechanics, no custom deployment framework.

All grounded in verified ServiceNowDocs paths (0 missing citations); skill-only (no sub-agents).

### Changed / fixed
- taxonomy §1: the six rows marked ✅ — **every one of the 22 specialists now has a SKILL.md**. Also fixed a merge-residual: ATF Author's batch sub-agent was wrongly shown as "planned / 7 sub-agent files" — corrected to ✅ batch sub-agent / **8 sub-agent files** (it was built in v2.7.3).
- CLAUDE.md: registries updated, §3.1 consult rows point at the Performance & Scale and DevOps/Release skills, persona-only line retired. TECHNICAL-ARCHITECTURE roster count 19 → **25 skills**. Engine version-of-record → v2.7.6.

### Roster state
**8 sub-agents, 25 skill directories, 22 specialists — all skill-backed.** No persona-only gaps and no referenced-but-missing files remain.

### Depth pass (skill v1.1)
The six v2.7.6 specialist skills were deepened to the rigour of the ITSM/CSM/HRSD gateways — each gained explicit **citation discipline**, **rigorous process/mechanics coverage** (e.g. Migration's transform-script lifecycle + data-type pattern table; Performance's six scale checklists; SPM's full demand→portfolio→agile map; DevOps's release-mechanics detail), a **domain anti-pattern table** (anti-pattern · baseline alternative · citation), **§1.1 hot-spots**, a **post-build review mode**, **termination conditions**, and a **hand-offs table** — while keeping each skill's correct output shape (a design/consult deliverable, not a forced 5-Part Envelope). All citations verified (0 dead). EXAMPLES for Migration/Performance/SPM expanded to multi-example.

---

## v2.7.5 — Discovery Specialist + UI/UX Specialist skills

**Released:** June 2026
**Trigger:** Pre-engagement hardening before a CSM ↔ ITSM ↔ CSDM build. Two persona-only specialists most relevant to that engagement were missing SKILL.md files: Discovery (the upstream requirements work a blueprint demands) and UI/UX (CSM lives in a configurable Workspace + a Service Portal).

### Added

- **`skills/discovery-specialist/SKILL.md` + `EXAMPLES.md`** — upstream requirements consultant (skill-only, sits *above* the routing protocol). Turns a blueprint/workshop/transcript into the structured **Discovery Output** — process scope, current-state, target-state requirements (MoSCoW), volume, sensitivity, personas/roles, gap analysis, §1.1 implications (flagged, not ruled), routing recommendation, OPEN QUESTIONS — shaped to match the **Input Contract** every Domain Expert gateway and the Story Writer already expect. Divergent/elicitation only; does not design, build, or rule §1.1. Example walks a CSM blueprint excerpt → full Discovery Output.
- **`skills/ui-ux-specialist/SKILL.md` + `EXAMPLES.md`** — designs the three UI surfaces: **configurable Workspaces** (Next Experience / UI Builder — UX pages, configurable lists/forms, contextual side panels, agent assist, declarative actions, unified nav), **Service Portal** (pages, widgets, theme), and **classic UI** (form layout, lists, UI policies, UI actions). Produces design specs, not code (Developer) or the data model (Technical Designer). Grounded in `platform-user-interface/` + `application-development/ui-builder/` (citations verified). §1.1: configuring baseline workspaces/portals/forms is configuration; new UX scopes / custom UIB components / custom widgets where baseline serves need approval.

### Changed

- taxonomy §1 roster: #20 UI/UX and #23 Discovery marked ✅. CLAUDE.md registries updated (Discovery noted as upstream-of-protocol; UI/UX pulled from the persona-only line). docs/TECHNICAL-ARCHITECTURE roster count 16 → 18 skills.

### Notes

Both are skill-only (no sub-agent); the 22-specialist count is unchanged (these were already in the roster as planned personas). All skill citations across the repo still resolve (0 missing). First commits authored under the RobertBH17 identity.

### Fixed (post-release QA review)

A thorough audit of all skills + agents + governing docs (structure was clean: frontmatter names match dirs, all internal refs + citations resolve, §1.1 in every skill, mirrors synced, no conflict markers). Fixed:

- **Engine version drift** — CLAUDE.md version-of-record was v2.7.4 while the CHANGELOG was v2.7.5; bumped title + record line + footer to v2.7.5.
- **Roster/count stamps** — README diagram "7 with sub-agents" → 8; INSTALLATION-GUIDE sample Status "v2.6" → v2.7.5; prompt-patterns "For: …v2.6" → v2.7.5; CLAUDE.md "PP-01 through PP-18" → PP-19.
- **Dangling reference closed** — the Now Assist Specialist referenced a `now-assist-genai` reference-knowledge skill that did not exist (same drift class as the earlier ATF/Op-Docs gaps). **Added `skills/now-assist-genai/SKILL.md` + `EXAMPLES.md`** — reference knowledge on Now Assist (OOB skill catalogue, Now LLM / AI-native SKU, Skill Kit, AI Control Tower governance), grounded in `intelligent-experiences/` (citations verified); the builder↔reference handoffs now resolve. Roster: 19 skill directories.
- **Cosmetic** — CSM gateway's "identical section headings" cross-reference updated to list all five Domain Experts.

---

## v2.7.4 — Operational Documentation skill (completes the §6.2 consult chain)

**Released:** June 2026
**Trigger:** The artefact standards and the §6.2 go-live consult referenced `skills/operational-documentation/SKILL.md`, but the file didn't exist — the last referenced-but-missing skill. The §6.2 hook proposed runbook + KBA authoring at go-live with nothing to adopt.

### Added

- **`skills/operational-documentation/SKILL.md` + `EXAMPLES.md`** (mirrored in `.claude/skills/`) — skill-only (no sub-agent), main-thread, fires post-build per §6.2 on a go-live signal (`ready for prod` / `sign-off` / `release` / `go-live` / `cutover` / `deploy`). Produces **runbooks** (operator/on-call: indicators, procedures, alert response, rollback, escalation), **KBAs** (baseline `kb_knowledge` / `kb_knowledge_base` / article templates / versioning / validity / review→publish / KCS create-from-incident), **training material**, and **user guides**. Audience is operators/support/end-users — explicitly bounded against the HLD/LLD Writer (architect audience) per taxonomy §2.4. Grounded in `servicenow-platform/knowledge-management/` (all citations verified). §1.1: KBAs are baseline configuration; a custom documentation/runbook table or custom publish workflow is a halt.

### Fixed / completed

- taxonomy §1 roster #24 marked ✅; CLAUDE.md "Consultants and documentation" entry now points at the skill.
- **The §6.2 post-build consult chain is now fully real:** Code Reviewer ✓, Domain Experts ✓ (5 gateways), ATF Author ✓ (v2.7.3), Operational Documentation ✓. No §6.2 consult proposes a capability the engine can't deliver.
- **No referenced-but-missing skill/agent files remain.** Every skill cited anywhere in the engine now exists with resolving doc citations.

---

## v2.7.3 — ATF Author skill + sub-agent (closes the ATF drift)

**Released:** June 2026
**Trigger:** CLAUDE.md, taxonomy, the artefact standards, and the §6.2 post-build hook all referenced an ATF Author **skill** (`skills/atf-author/SKILL.md`) and **batch sub-agent** (`agents/atf-author.md`) — but neither file existed. The engine *proposed* ATF coverage at sign-off and had nothing to adopt.

### Added

- **`skills/atf-author/SKILL.md` + `EXAMPLES.md`** (mirrored in `.claude/skills/`) — the ATF Author persona. Two modes: inline single-component (skill, fires post-build §6.2) and full-app batch (sub-agent). Covers the ATF data model (`sys_atf_test` / `_test_suite` / `_step` / `_step_config` / `_test_template` / result tables), the baseline step categories (Server / Form / Catalog / REST / Email / Application Navigation), test-design discipline (one behaviour per test, self-contained created-and-rolled-back data, explicit assertions, reuse via Test Templates, negative paths, spec coverage matrix), and **mandatory deployment notes** (runner placement, sub-prod enablement, scope/update set, `atf_test_designer`/`atf_test_admin` roles, data strategy). Grounded in `application-development/automated-test-framework-atf/` (all citations verified).
- **`agents/atf-author.md`** (mirrored in `.claude/agents/`) — the batch sub-agent: enumerates a scoped app's components, designs a suite (child suites split by runner type), returns a coverage matrix + deployment notes + a §6.2 manifest for any custom step config scripts.

### Fixed

- The "8 sub-agents" roster claim in CLAUDE.md is now **true** (7 + ATF Author). taxonomy §1 ATF Author ✅✅ is now accurate. The §6.2 ATF proposal now has a real skill/sub-agent to adopt.

### §1.1 discipline encoded

ATF tests are baseline configuration; a custom **step type** (`sys_atf_step_config` + config script) is a flagged extension whose script routes to Code Reviewer; a custom **table for test data/results** or a custom **test runner** is a §1.1 halt (use Create-a-Record-and-rollback + baseline result tables).

---

## v2.7.2 — Repo-wide citation-path audit and remediation

**Released:** June 2026
**Trigger:** While grounding the Security & GRC skill, the older skills were found to cite `ServiceNowDocs/` paths that don't exist in the current (Australia) tree — they assumed a `now-platform/` + flat `servicenow-platform/` layout that the docs don't use.

### Fixed

- **Audited every `markdown/…md` citation across all 13 skills (SKILL.md + EXAMPLES.md) — 70 distinct paths.** Found ~50 dead across **Developer (7/7), Code Reviewer (9/9), Integration Specialist (6/6), Flow Designer (7/7), ITSM (~14), ITOM/Discovery (6), CSM (4)**. HRSD, CMDB & CSDM, and Security & GRC were already clean. Agents carry no citations.
- **Remapped every dead path to a verified-existing target**, by real tree:
  - scripting/coding → `application-development/` + `api-reference/`
  - ACLs → `platform-security/access-control/`
  - ITSM processes → `it-service-management/<process>/` subdirs (the flat `…/incident-management.md` etc. never existed; real docs are in the subdirectories)
  - notifications/system-properties → `platform-administration/`; system-events → `build-workflows/system-events/`
  - Flow Designer → `build-workflows/workflow-studio/`
  - CMDB/IRE → `servicenow-platform/configuration-management-database-cmdb/`
  - IntegrationHub/MID/credentials → `integrate-applications/` + `it-operations-management/`; OAuth/mTLS → `platform-security/authentication/`
- **Verification gate:** after remediation, re-extracted and existence-tested all 70 citations → **0 missing**. Source/mirror sync confirmed.

### Known residual (cosmetic, non-blocking)

A few grounding-path *lists* in Developer/Code Reviewer/Integration/Flow now point multiple distinct concepts at the same correct file (the docs don't split those concepts into separate pages), so a description may not perfectly match its target. Paths resolve and are on-topic; tightening the prose/dedup is optional polish, tracked for a later pass.

---

## v2.7.1 — Security & GRC Specialist skill (consult + architectural-security review)

**Released:** June 2026
**Trigger:** Security & GRC was a §3.1 routing-time consult with an active persona but no SKILL.md — so the consult fired with nothing to adopt. The upcoming CSM ↔ ITSM ↔ CSDM work will hit it immediately (PII/ACL across the CSM boundary).

### Added

- **`skills/security-grc-specialist/SKILL.md` + `EXAMPLES.md`** (mirrored in `.claude/skills/`) — skill-only, **not a gateway** (deliberate: security is cross-cutting, not a single domain; its analog is Code Reviewer, not the Domain Expert gateways). Two modes: a **routing-time Constraint Note** (§3.1) that sets ACL/RBAC/data-classification/audit constraints *before* builders run, and a **post-build architectural-security review** (verdict block / fix-before-prod / consider). Seven checklists: ACL strategy & evaluation order, RBAC/SoD, field-level security, PII/sensitive-data handling, audit & logging, secure integration, GRC control mapping. Grounded in the real Australia paths (`platform-security/access-control/`, `platform-security/`, `governance-risk-compliance/`) — note the baseline Code Reviewer skill cites a stale `servicenow-platform/security/` path; the new skill uses the correct tree. §1.1 nuance encoded: ACLs/roles/security-attributes are baseline configuration (not a §1.1 trigger), but new security tables/scopes/group-structures are.

### Changed

- **`CLAUDE.md`** — added to the Phase 2.1 skills registry; removed from the persona-only "planned" line; §3.1 consult row now points at the skill and notes the two modes.
- **`taxonomy.md`** — roster #16 marked ✅ (consult/review skill). Existing §2.2 boundary (vs Code Reviewer), §4.4 trigger map, and §5 anti-route already described it correctly — unchanged.

### Notes

Distinct from a Domain Expert gateway: it does **not** auto-fire at Phase 1 Step 5 or produce a 5-Part Constraint Envelope. The five gateways remain ITSM / CSM / HRSD / ITOM / CMDB & CSDM. The §3.1 consult firing is already covered by validation test T-03; a dedicated test for the review mode is a candidate follow-up.

---

## v2.7 — CMDB & CSDM promoted to 5th Domain Expert gateway

**Released:** June 2026
**Trigger:** CMDB & CSDM was a planned routing-time consult with no SKILL.md. For CMDB/CSDM-central work (notably CSM ↔ ITSM ↔ CSDM integrations), it needed to be a first-class auto-firing gateway with its own 5-Part Constraint Envelope and §1.1 enforcement.

### Added

- **`skills/cmdb-csdm-specialist/SKILL.md` + `EXAMPLES.md`** (mirrored in `.claude/skills/`) — new v2.0 Domain Expert gateway. Grounded in the Australia branch **CSDM v5** corpus (`servicenow-platform/common-service-data-model-csdm/`, `.../configuration-management-database-cmdb/`, plus the CSM install-base and ITSM-incident CSDM touchpoints). Uses v5 table names (`cmdb_ci_service_technical`, `cmdb_ci_service_auto`, `cmdb_ci_service_business`, `cmdb_ci_business_app`) and flags pre-v5 names as a self-violation. EXAMPLES Example 1 is the canonical CSM ↔ ITSM ↔ CSDM shared-service-layer pattern.
- **`VALIDATION-TESTS.md`** — T-11 (CMDB & CSDM gateway fires for a data-model request) and T-12 (CSM ↔ ITSM ↔ CSDM multi-gateway co-fire, bridging-table blocked). Marked PENDING re-run.

### Changed

- **`CLAUDE.md` → v2.7** — added CMDB & CSDM to the Phase 1 Step 5 gateway-trigger table, the gateway registry, the Domain Expert v2.0 list, and the Status roster; added a multi-gateway **co-fire** rule with the ITOM (population) ↔ CMDB & CSDM (model) boundary; removed CMDB & CSDM from the §3.1 routing-time consult list and Step 7 (it now fires at Step 5).
- **`taxonomy.md` → v1.2** — roster marked ✅ (v2.0 gateway); §3.1 consult row retired with a promotion note; §3.2 post-build Domain Expert row and §6.1 Step 7 gateway list updated; ITOM↔CMDB&CSDM co-fire boundary documented.
- **`skills/itom-discovery-specialist/`** — "when v2.0 exists" conditionals replaced with the live population-vs-model boundary now that the gateway exists.
- **`docs/ADVANCED-WEB-SETUP.md`** — Tier 1 upload loop and verification steps updated from four skills to five.
- **`docs/TECHNICAL-ARCHITECTURE.md`, `docs/BUSINESS-OVERVIEW.md`, `README.md`** — Domain Expert roster updated from four to five.

### Notes

Per the maintenance rule, the full validation suite (T-01–T-12) must be re-run in both Claude Code and Claude.ai, and the five gateway skills re-uploaded to Tier 1, before v2.7 is considered fully landed.

---

## v2.6.1 — Documentation Suite refresh (MCP era)

**Released:** May 2026
**Trigger:** The `docs/` suite still described the pre-MCP, design-only engine (stamped v2.3). It needed to be brought in line with the live-instance architecture.

### Added

- **`docs/MCP-OPERATIONS-GUIDE.md`** — the live-instance playbook: connection, permission tiers, the §2.1 write-approval gate, the §2.2 Update Set capture protocol, read/write tool patterns, and the operator checklist.
- **`docs/LIVE-ARTEFACTS-CATALOGUE.md`** — register of the three deployed artefacts (SLABreachRiskCalculator, DuplicateIncidentDetector, P1AutoAssign), each Verdict A / baseline-only.

### Changed

- **`docs/TECHNICAL-ARCHITECTURE.md`** — rewritten: added the live-instance execution layer (§5), gate ordering, the 10-test validation suite (§8), and the pre-commit auto-sync hook (§9).
- **`docs/USER-GUIDE-AND-EXAMPLES.md`** — rewritten: added Scenario 4 (live deployment through both write gates).
- **`docs/BUSINESS-OVERVIEW.md`** — added the design-to-delivery value section and the two write gates in plain English.
- **`docs/INSTALLATION-GUIDE.md`** — added the optional NowAIKit MCP connection step.
- **`docs/ADVANCED-WEB-SETUP.md`** — clarified the web Master Project is design-only; live deployment is CLI-only.
- **`docs/nowaikit-field-notes.md`** — purpose/audience header added; existing content untouched.
- All docs: repository renamed `claude-servicenow-engine` → `claude-servicenow-live`; example scoped-app prefix neutralised to `x_acme_*`; version stamps updated to v2.6.

### Notes

Documentation-only release. No change to `CLAUDE.md`, governance rules, taxonomy, or specialist skills.

---

## v2.6 — docs/ knowledge base + auto-sync hook

**Released:** May 2026
**Trigger:** Operational knowledge about the MCP connection (confirmed behaviours, bugs, workarounds) was being lost between sessions and laptops; agent/skill mirrors were drifting from their `.claude/` copies.

### Added

- **`docs/nowaikit-field-notes.md`** — committed, cross-laptop knowledge base of confirmed NowAIKit MCP behaviours and workarounds (Update Set capture, broken script endpoints, email-via-GlideRecord pattern, `register_event` and `create_business_rule` patch-after-create gotchas, Flow Designer shells).
- **Standing Rule** — every solved MCP problem is recorded in the field notes (generic only) and pushed; instance-specific values stay in local memory.
- **Pre-commit auto-sync hook** (`.githooks/pre-commit` → `scripts/sync-agents-skills.sh`) — keeps the root `agents/`/`skills/` folders and the `.claude/` mirror aligned automatically, staging both sides on commit.
- **Three live artefacts deployed** to the connected instance — SLABreachRiskCalculator, DuplicateIncidentDetector, P1AutoAssign — all Verdict A.
- Validation suite expanded to **10 tests**, adding **T-05** (write gate), **T-06** (Update Set capture), and **T-07** (agents/skills auto-sync).

### Files updated

- `CLAUDE.md` → v2.6 (docs/ knowledge base, artefact standards paths, field-notes Standing Rule, repo map).

---

## v2.5 — Live write governance (§2.1 + §2.2)

**Released:** May 2026
**Trigger:** With the MCP connection able to mutate a live instance, writes needed hard human-control and change-tracking guarantees.

### Added

- **§2.1 — MCP Write Approval Gate.** Every write requires an explicit, specific "write approved" in the current conversation. A tier upgrade, a prior read-only "yes", a general go-ahead, or the original task description do not count. Self-approval is prohibited. Halt protocol defined.
- **§2.2 — Update Set Capture Protocol.** Before any config write, the authenticated user's `sys_update_set` preference must point at the target Update Set, so ServiceNow captures the object automatically. Documented the confirmed-non-functional alternatives (`switch_update_set`, direct `sys_update_xml` POST, the script-execution endpoints).

### Files updated

- `CLAUDE.md` → v2.5 (§2.1 Write Gate + §2.2 Update Set Capture).

---

## v2.4 — NowAIKit MCP integration

**Released:** May 2026
**Trigger:** The engine could reason about ServiceNow but not touch it. A live MCP connection turned it from a design engine into a design-and-delivery engine.

### Added

- **NowAIKit MCP connection** to a live ServiceNow instance, at a declared permission tier (read-only / read-write).
- **Live §1.1 validation** — Baseline-First verdicts are now confirmed against the live schema, not only `ServiceNowDocs/`.
- Live read tooling (schema discovery, record queries, config audit) and live write tooling (Script Includes, Business Rules, Script Actions, Update Sets, Reports).

### Notes

Write governance arrived in v2.5; v2.4 established the connection and read-side validation.

---

## v2.3.1 — Documentation Suite

**Released:** May 2026
**Trigger:** Adoption readiness — the engine needed a complete, audience-segmented documentation suite before broader team rollout.

### Added

- **Root `README.md`** — repository landing page with badges, hero diagram, 3-step quick install, and links into `docs/`.
- **`docs/README.md`** — documentation hub indexing the five sibling files and the editable diagrams folder.
- **`docs/INSTALLATION-GUIDE.md`** — radically simplified plug-and-play install. Three steps, two minutes. The `.claude/` folder ships pre-synced in the repository.
- **`docs/ADVANCED-WEB-SETUP.md`** — separate optional guide for the Claude.ai Master Project setup (skill ZIP uploads, Project Instructions paste). Isolated from the core install path.
- **`docs/BUSINESS-OVERVIEW.md`** — non-technical view of the engine as a virtual implementation team, with the §1.1 rule explained in plain English.
- **`docs/USER-GUIDE-AND-EXAMPLES.md`** — three worked scenarios (BA stories, integration design, §1.1 halt) with verbatim prompts and expected behaviour.
- **`docs/TECHNICAL-ARCHITECTURE.md`** — developer reference for the §1.1 rule, the 5-Part Constraint Envelope, the Phase 1 / Phase 2 protocol, and the agent input/output contracts.
- **`docs/CHANGELOG.md`** — this file.
- **`docs/diagrams/`** — five native `.drawio` files (engine overview, virtual team org chart, full request lifecycle, §1.1 halt protocol, architecture wall diagram) plus Lucidchart import notes.

### Notes

This is a documentation-only release. No changes to `CLAUDE.md`, the orchestrator protocol, governance rules, or specialist skills.

---

## v2.3 — Self-Authorization Prohibition

**Released:** May 2026
**Trigger:** CSM-C validation revealed the model producing a complete table model in the same turn as the §1.1 OPEN QUESTION, rationalising that the user's specific request constituted authorization.

### Changed

- **§1.1 Baseline-First rule** — added explicit prohibition language. The user's original request does not constitute Chief Architect approval of a custom object. Approval must arrive as an explicit, separate user message responding to the OPEN QUESTION.
- **Phase 1 Step 5 (Domain Expert gateway), Verdict C clause** — rewritten as a hard stop. *"Surface the blocking OPEN QUESTION and stop. Do not produce any design artefact, table model, code, or specification in the same turn."*
- **§1.1 Validation Test, wrong-behaviour signals** — converted to enumerated list with the self-authorization bypass as a fourth named failure mode.

### Files updated

- `CLAUDE.md` → v2.3
- the planned claude.ai project-instruction templates (never shipped; see the retired-name glossary in `docs/ARCHITECTURE.md`) → v2.3

### Validation

- CSM-C validation re-run in both Claude Code and Claude.ai Master Project. Both environments now produce the OPEN QUESTION and halt, with no table model emitted in the same turn.

---

## v2.2 — Domain Expert Gateway

**Released:** May 2026
**Trigger:** v2.1 introduced the orchestrator delta in concept; v2.2 wired it into `CLAUDE.md` against the actual file structure.

### Added

- **Phase 1 Step 5** in `CLAUDE.md` — mandatory Domain Expert gateway with trigger-keyword table (ITSM / CSM / HRSD / ITOM) and Verdict A/B/C routing logic.
- **Phase 2 Step 4** in `CLAUDE.md` — Domain Expert re-fires in review mode post-build, validating builder artefacts against the original 5-Part Constraint Envelope.
- Multi-builder example rewritten to show the two-phase Domain Expert pattern.
- §6.2 and §1.1 Validation Tests updated to include the gateway routing chain.

### Changed

- `CLAUDE.md` Phase 1 step numbering: 11 → 12 steps.
- `CLAUDE.md` Phase 2 step numbering: 8 → 9 steps.
- Exception clause strengthened — Domain Expert gateway fires even on explicit `@<builder-name>` invocation.

### Files updated

- `CLAUDE.md` → v2.2
- `master-project-instructions-v2.2.md`

---

## v2.1 — Orchestrator Delta (definition phase)

**Released:** May 2026
**Trigger:** v2.0 installed the Domain Expert skills but they only fired on explicit invocation. v2.1 defined the orchestrator-level changes needed to wire them into Phase 1 routing.

### Added

- `ORCHESTRATOR-DELTA.md` — six annotated replacement blocks for `CLAUDE.md` and the Master Project Instructions.
- `VALIDATION-TESTS.md` — 12 canonical test scenarios exercising Verdict A, B, and C paths.

---

## v2.0 — Domain Expert Skills

**Released:** May 2026
**Trigger:** v1.0 Domain Expert skills lacked the structured Constraint Envelope output, citation discipline, and §1.1 halt protocol needed to enforce baseline-first design at scale.

### Added

- **`itsm-specialist` v2.0** — mandatory upstream gateway skill for ITSM.
- **`csm-specialist` v2.0** — mandatory upstream gateway skill for CSM. Includes explicit Australia-release flag on `sn_customerservice_escalation`.
- **`hrsd-specialist` v2.0** — mandatory upstream gateway skill for HRSD.
- **`itom-discovery-specialist` v2.0** — mandatory upstream gateway skill for ITOM and Discovery.
- Each skill paired with an EXAMPLES.md demonstrating canonical Verdict A, B, and C scenarios.
- All four skills enforce §1.1 with citation discipline against `ServiceNowDocs/markdown/` Australia branch.

### Replaced

- v1.0 Domain Expert skills — superseded but kept in `.backups/` as rollback safety.

### Distribution

- `domain-experts-v2.0.zip` (76 KB, 8 files, 3,505 lines).

---

## Earlier — Phase 2.1 Code Reviewer hook

- Added Code Reviewer skill (skill-only, no sub-agent).
- Added §6.2 post-build hook — automatic Code Reviewer proposal on any JavaScript artefact.
- Added Developer, Flow Designer Specialist, Integration Specialist as paired skill + sub-agent specialists.

---

## Earlier — Initial release

- Chief Architect persona defined.
- Four functional groups: Builders, Reviewers and Quality, Domain Experts, Consultants and Documentation.
- `governance-rules.md` §1.1 Baseline-First rule established as authoritative.
- `taxonomy.md` two-phase resolution algorithm defined.
- `prompt-patterns.md` PP-01 through PP-18 templates published.

---

## Pending — next batch

| Item | Notes |
|---|---|
| **`atf-author` v2.0** | Agent + skill pair. Adds batch-mode test-suite generation across a whole scoped app. The current roster references `agents/atf-author.md` but the file does not yet exist on disk — this is the known gap. |
| **`security-grc-specialist`** | Clean create — skill only, no v1.0 predecessor. Will be invoked as a routing-time consult per taxonomy §3.1. |

---

## Versioning policy

- **First digit (v2.x → v3.x):** major architectural shift. Examples: new tier of specialists, breaking change to the routing protocol.
- **Second digit (v2.2 → v2.3):** additive or corrective patch within the current architecture.
- **Patch suffix (v2.3.1):** documentation or maintenance change with no functional impact on the engine.

---

*Maintained by the Enterprise Architecture Team. Repository: [`farstic/claude-servicenow-live`](https://github.com/farstic/claude-servicenow-live).*
