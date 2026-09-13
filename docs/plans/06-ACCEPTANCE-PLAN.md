# Acceptance-phase plan: AI ServiceNow Architect v2.0.0

Source: eleven readers, one per ARC, plus a synthesizer, over `develop` at **a326369**, 2026-09-12.

**This is a reader's map, not a verdict.** The readers were skeptical by instruction and verified
nothing beyond what they could see; where one wrote "unknown" the item is kept as "verify". Some
backlog items therefore close with evidence the reader did not find, and that is the point of the
pass rather than a failure of it.

**The Vetting column is the record.** Every §2 item gains one as it is worked: `closed` (already
asserted — the evidence is quoted), `rework` (real, and the check is added), `record` (the plan or a
story text is corrected with a dated note, never a rewrite of history), or blank for not yet vetted.
Corrections to the plan itself are made in place and marked, because a plan that is quietly wrong is
worse than one that is visibly amended.

**Rebasing an acceptance PR: the changelog will conflict, and both sides are right.** Every
acceptance PR adds a bullet at the top of the same `### Fixed` group under `## Unreleased`, so each
one conflicts with every other that merged before it. Keep BOTH, earlier-merged first; drop nothing
and rewrite nothing. Measured on #164 rebased onto C31: one conflicted file, `docs/CHANGELOG.md`,
and the code files (`host.test.mjs`, three server tests) rebased untouched.

Owner directive (2026-09-10): when development closes, test every ARC against its own acceptance
criteria on a release candidate (v2.0.0-rc.1, cut through the standing rehearsal in
`docs/CONTRIBUTING.md`), fix failures as rework PRs, and only then cut v2.0.0. The owner's own
sittings (A, C, clean machines, a PDI, Windows) run last; their date is decided only when everything
else is done and green.

Conventions used below:

- Kinds: `test` (a node:test / vitest case), `ci-cell` (a job or step in `.github/workflows/*.yml`),
  `manual-rc` (a command or read run by hand on the RC), `sitting` (owner or executor on a real
  machine, instance or session), `unknown` (reader could not classify; treated as "verify").
- Verdicts on README criteria: `covered`, `uncovered`, `sitting`, `n-a`.
- Test names and CI cell names are quoted verbatim from the readers, including their own
  punctuation, so they can be grepped.
- Owner of a backlog item: `dev` (code or test change, a separate developer agent) or `architect`
  (doc amendment, status record, decision, record of a run). Size: S (under half a day) or M (half a
  day to two days).

## 1. Summary table

### 1.1 README criteria per ARC

| ARC | README criteria | covered | uncovered | sitting | n-a | README kinds (test / ci-cell / manual-rc / sitting) |
|---|---|---|---|---|---|---|
| ARC-00 Spikes and gating decisions | 11 | 5 | 3 (R1, R8, R11) | 3 (R2, R3, R4) | 0 | 0 / 1 / 5 / 5 |
| ARC-01 Repository foundation | 10 | 10 | 0 | 0 | 0 | 8 / 2 / 0 / 0 |
| ARC-02 Engine consolidation | 10 | 7 | 3 (R1, R5, R7) | 0 | 0 | 4 / 2 / 4 / 0 |
| ARC-03 Docs corpus | 8 | 8 | 0 | 0 | 0 | 5 / 3 / 0 / 0 |
| ARC-04 MCP server hardening | 14 | 13 | 0 | 1 (R6) | 0 | 10 / 2 / 1 / 1 |
| ARC-05 Engine-MCP contract | 8 | 7 | 0 | 1 (R8) | 0 | 6 / 1 / 0 / 1 |
| ARC-06 Bootstrap and registration | 9 | 6 | 0 | 3 (R2, R3, R6) | 0 | 3 / 3 / 0 / 3 |
| ARC-07 Instance wizard and credentials | 12 | 9 | 0 | 3 (R1, R6, R9) | 0 | 9 / 0 / 0 / 3 |
| ARC-08 Doctor and self-heal | 9 | 8 | 0 | 1 (README-8) | 0 | 6 / 2 / 0 / 1 |
| ARC-09 Release and upgrade | 6 | 6 | 0 | 0 | 0 | 4 / 2 / 0 / 0 |
| ARC-10 Migration and cutover | 6 | 2 | 0 | 4 (AC1, AC2, AC3, AC4) | 0 | 3 / 0 / 0 / 3 |
| **Total** | **103** | **81** | **6** | **16** | **0** | **58 / 18 / 10 / 17** |

Notes on the README column:

- ARC-00 R6 (S-18 prompt in auto mode) is kind `sitting` but verdict `covered`: the sitting was done
  2026-09-07 (OWNER-SITTING Part C). Its record verdict line is stale (see backlog B00-02).
- ARC-10 README-AC4 is kind `test` but verdict `sitting`: `tests/architecture-history.test.mjs` asserts
  the v2.0.0 half as deferred until the tag exists.
- ARC-07 criterion 12 is proven but its README box is still unticked (backlog B07-03).
- ARC-04 R3 wording (`_add` under read-only reports `SCRIPTING_NOT_ENABLED`) disagrees with the tested
  gate ordering (`WRITE_NOT_ENABLED` first); behaviour is tested, wording is imprecise (backlog B04-09).

### 1.2 Story criteria per ARC, by kind

| ARC | Stories | Criteria | test | ci-cell | manual-rc | sitting | unknown | Uncovered items listed by reader |
|---|---|---|---|---|---|---|---|---|
| ARC-00 | 14 | 81 | 1 | 4 | 43 | 31 | 2 | 10 |
| ARC-01 | 12 | 72 | 36 | 12 | 23 | 1 | 0 | 7 |
| ARC-02 | 13 | 83 | 55 | 5 | 19 | 4 | 0 | 5 |
| ARC-03 | 11 | 68 | 47 | 13 | 5 | 0 | 3 | 4 |
| ARC-04 | 14 | 91 | 63 | 12 | 12 | 3 | 1 | 9 |
| ARC-05 | 11 | 69 | 47 | 7 | 11 | 2 | 2 | 7 |
| ARC-06 | 14 | 99 | 63 | 12 | 2 | 14 | 8 | 7 |
| ARC-07 | 11 | 78 | 62 | 2 | 0 | 14 | 0 | 4 |
| ARC-08 | 11 | 79 | 60 | 4 | 0 | 14 | 1 | 3 |
| ARC-09 | 11 | 75 | 56 | 10 | 6 | 1 | 2 | 7 |
| ARC-10 | 10 | 55 | 30 | 2 | 2 | 21 | 0 | 5 |
| **Total** | **132** | **850** | **520** | **83** | **123** | **105** | **19** | **68** |

Story-index state: every story of ARC-00 to ARC-09 is Done. ARC-10: S01 to S05 and S07 Done; the tool
halves of S09 and S10 Done; S06 and S08 Not started (post-tag sittings); the run halves of S09/S10
are the owner's, after the tag. No `v2*` tag exists in the checkout.

ARC-00 caveat: 31 story criteria are `sitting` by kind, but several were completed in the
2026-09-07 owner sitting and archived in `docs/spikes/OWNER-SITTING.md`; the record verdict lines
were not updated, which is why they still count as sittings (backlog B00-02).

## 2. Backlog before the RC

Every item below is a candidate rework or chore. All are on Done stories unless marked otherwise.
IDs are plan-local (Bxx-nn). "Verify" items are the readers' "unknown" classifications.

### ARC-00

| ID | Where | Criterion | Why uncovered | Proposed check | Owner | Size| Vetting |
|---|---|---|---|---|---|---|
| B00-01 | ARC-00-S14 AC1 / README R1 | `grep -E '^\\| S-' 03 \\| grep -ci unverified` prints 0; every S-01 to S-20 row has a Status and an Evidence path | `docs/plans/03-RISKS-AND-UNKNOWNS.md` §A/§B never gained Status/Evidence columns; verdicts live only as appended §F rows; the grep prints 1 (S-26 row in §F) | Add Status + Evidence columns to 03 §A/§B (Evidence = `docs/spikes/S-NN-.../README.md`); add `tests/spikes-register.test.mjs` asserting every `^\| S-` row in §A/§B has a non-empty Status, an existing evidence path, and no "unverified" | architect (columns), dev (test) | M| **rework** — columns added and generated from the register; the criterion itself was unusable (it counted §F's honest UNVERIFIED row) and is corrected above |
| B00-02 | ARC-00-S14 AC7 | `spikes/README.md` verdict register identical to the verdict lines in the records | Register §5 disagrees: S-02 register CONFIRMED vs S-02 README:99 `NOT RUN`; S-13 CONFIRMED vs README:141 `NOT RUN`; S-14g PARTIAL vs README:173 `REFUTED`; S-20 CONFIRMED vs "CONFIRMED on macOS". **Correction (ARC-00 acceptance, measured on 9e370e8): the last two are stated backwards here.** The REGISTER was the stale side in both — S-14g's row read `PARTIAL` over a record that says `REFUTED on both halves`, and S-20's row read **`NOT RUN`** (not "CONFIRMED") over a record that says `CONFIRMED on macOS`. So S-20 is a register-only edit and its record needed no change at all. The plan is a status record and may not keep saying the opposite of the tree. Records S-01, S-05, S-06, S-16, S-17, S-18 keep NOT PROVEN / INTERACTIVE-PENDING lines although 03 §F records the 2026-09-07 sitting as CONFIRMED | Rewrite each record's `## Verdict` line to its final state (S-01, S-02, S-05, S-06, S-11, S-13, S-16, S-17, S-18, S-20), regenerate the register, add a test running the story's own diff: `diff <(grep -h '^`S-' docs/spikes/S-*/README.md \| sort) <(grep '^\| S-' docs/spikes/README.md ...)` is empty — **which can never be empty and was replaced (ARC-00 acceptance): the register ABBREVIATES the record by design** (S-06 drops "394 tools everywhere"; S-07 drops 34,688 materialised files and four timings), so a prose diff demands the register become the record. `tests/spikes-register.test.mjs` asserts the verdict TOKEN exactly, every **bold** caveat of the record present in its row (never-says-less), both directions, and a guard that fails if no record is bolded | architect (lines), dev (test) | M| **rework** — eight spikes disagreed on the verdict; the prose diff is replaced by the token + never-says-less + both-directions test, written from a run |
| B00-03 | ARC-00-S11 AC3 / README R8 | `engine.config.seed.json` floors.claude equals the version in the S-11 verdict line | S-11 README:129 still `S-11: NOT RUN` while its Observed table shows 8/8 identical on 2.1.214; table covers 8 of the 11 mechanisms listed (missing: project .mcp.json load, `${VAR:-}` expansion, enabled/disabledMcpjsonServers, exec-form hook + CLAUDE_PROJECT_DIR, skills listing); AC2 one-session pass on 2.1.214 never run (OPTIONAL in OWNER-SITTING) | Set the verdict to `S-11: CONFIRMED — floor 2.1.214 sufficient; 8 of 11 mechanisms measured headlessly, 3 not measured (<list>)` — **corrected (ARC-00 acceptance, measured on 9e370e8): 8 of 11 / 3 unmeasured does not reconcile.** The record's table has eight ROWS, two of them controls, and row 1 covers two of the story's eleven mechanisms — so eight rows measure **seven of eleven**, and **four** are unmeasured. The shipped verdict says exactly that and names the four or run the missing rows via the S-24 `claude -p --mcp-config --settings` route; add a test asserting `engine.config.json` floors.claudeCode === seed floors.claudeCode === the version in the S-11 verdict line | architect (verdict), dev (test) | S| **rework** — the verdict was a literal stub; rewritten from the record's own table, and the 8/11/3 arithmetic corrected to seven of eleven, four named |
| B00-04 | ARC-00-S13 AC1, AC4, AC5 (Done, parked) | `spikes/windows-recipe.md` exists (runner section, VM section, assertions list, S07 console cells, GPO sentence); ARC-06/ARC-09 README dependency lines reference it | `find . -name 'windows-recipe*'` returns nothing; `git log --all -- docs/spikes/windows-recipe.md spikes/windows-recipe.md` empty; ARC-09 README:42 and ARC-09 STORIES.md:727 cite it as if it existed. Runner half implemented in `scripts/ci/strip-git-bash.mjs` and proved by cells `windows-native (…, no Git Bash)` and `bootstrap (no-gitbash)` | Write `docs/spikes/windows-recipe.md` (runner section pointing at strip-git-bash.mjs, VM snapshot table from S01, S07 console cells for Q-B, GPO sentence for `docs/PLATFORM-NOTES.md`); add a path-exists assertion (e.g. in `tests/owner-sitting.test.mjs` or new `tests/spikes-files.test.mjs`); fix the ARC-09 citation | architect (doc), dev (test) | M| **record** — `windows-recipe.md` deliberately not written; both citations say "pending Sitting D", and Sitting D writes it from what that sitting does |
| B00-05 | ARC-00-S14 AC3 | 01 §13 and ARC-09 README state the Q-B outcome in one sentence each | `01-TARGET-ARCHITECTURE.md` §13 heading still "Decided: native Windows is first-class" with no outcome sentence; S-03 DEFERRED, S-04/S-08 NOT RUN; OWNER-SITTING Sitting D pre-writes a third wording ("Windows: proven in CI, not by a person") absent from both files | Add one sentence to 01 §13 and ARC-09 README: "Q-B: pending — S-03/S-04/S-08 not run (no Windows machine); until they run the release note says 'Windows: proven in CI, not by a person' (OWNER-SITTING Sitting D)"; grep-assert both files for `Q-B` plus one of the three outcome strings | architect | S| **rework** — one sentence in `01` §13 and the ARC-09 README: Q-B pending, "proven in CI, not by a person" |
| B00-06 | ARC-00-S14 AC4 (reader: unknown, turned out absent) | Fallback propagation table with one row per FAILED verdict; `git diff --stat` pasted into the record | No propagation table exists (grep -i propagation in `docs/spikes/README.md` and 03 finds nothing); consequences carried ad hoc in 03 §F "Consumed by" cells | Add §"Fallback propagation" to `docs/spikes/README.md` listing each FAILED/REFUTED verdict (S-01 pre-trust, S-05, S-07 git 2.34.1, S-12, S-14a/b/c/e/g, S-16, S-23) with target sentence and commit; reviewer confirms each target file carries the sentence | architect | S| **rework** — §4b written and every row RE-MEASURED, not asserted; S-14g has no target in the product and the table says so |
| B00-07 | ARC-00-S14 AC8 (reader: unknown, turned out absent) | 03 §C R-15 carries the "closed by ARC-04-S11; S-20 ..." sentence | `grep -n R-15 docs/plans/03-RISKS-AND-UNKNOWNS.md` shows the row without the text | Append to the R-15 mitigation cell: "closed by ARC-04-S11; S-20 answered in ARC-00-S06: CONFIRMED on macOS (inherited), Windows pending Sitting D"; grep-assert in a doc test | architect | S| **rework** — the R-15 mitigation cell carries the closing sentence with the S-20 caveat |
| B00-08 | ARC-00-S14 AC6 / README R11 | Gate sign-off block with dates and owner initials; ARC-06-S01 start later than the S-14 conclusion | Block absent from the ARC-00 README; `04-ROADMAP.md` §9 row 6 marks it half open; the date ordering is satisfiable (ADR-0006 Accepted 2026-09-08 < ARC-06-S01 Done 2026-09-09) but nothing writes it down | Append the two-line sign-off block with the recorded dates (ARC-01 entry: ADR-0001/0002/0003 Accepted 2026-09-04/2026-09-07; LICENSE/NOTICE agreed 2026-09-06/07; ARC-06 entry: verdict dates, S-14 concluded 2026-09-08, Q-B "pending"); leave `initials: PENDING OWNER`; put the initialling into OWNER-SITTING.md as an explicit row | architect | S| **rework** — block appended with the recorded dates and the ordering it exists to enforce; initials stay `PENDING OWNER` |
| B00-09 | ARC-00-S03 task 4 / AC1 | Owner initials each ADR (`Decision owner` row) | ADR-0001 to ADR-0008 Decision-owner rows all read `initials PENDING OWNER`; ADRs are Accepted on the architect's ratification only | Owner sitting row: initial the eight ADRs (edit only the Decision-owner cell); test that no `docs/decisions/ADR-*.md` with Status Accepted still contains `PENDING OWNER` (test must be written to skip or expect-fail until the sitting) | architect (row), dev (test) | S| **record** — no expect-fail test, as ruled; a Sitting A row is the enforcement and the README criterion says the initials are outstanding |
| B00-10 | ARC-00-S01 AC3/AC4/AC5 Windows rows | Windows VM with `where bash` empty, both Claude Code versions, clean / no-node / gpo-allsigned / gitbash snapshots | `docs/spikes/README.md` §2.3 "Windows — DEFERRED — Windows VM pending (owner input #2)"; 04-ROADMAP §9 row 2 still open; this single sitting blocks S-03, S-04, S-08, the Windows halves of S-01/S-05/S-06/S-20 and Q-B | Sitting D (section 4). Until then amend the story index: "Done" for S01/S04/S06/S07 should read "Done — Windows rows deferred to Sitting D" | architect | S| **record** — Sitting D, as it already was; the plan row and the ARC-00 README now cite the sitting |

Also ARC-00, status hygiene (not a criterion): the ARC README still shows 9 of 11 criteria unticked
and its Status line reads "Stories drafted 2026-09-04" while the story index marks all 14 stories
Done. Tick what the backlog closes in the same PR (owner directive: status records current).
`docs/spikes/stub-server/selftest.mjs` is not wired into `ci.yml`; decide keep-and-wire or delete
(architect, S).

### ARC-01

| ID | Where | Criterion | Why uncovered | Proposed check | Owner | Size | Vetting |
|---|---|---|---|---|---|---|---|
| B01-01 | ARC-01-S08 AC 2 | `cmp LICENSE packages/snowarch/LICENSE` exits 0 | No test compares the two; `tests/publish-target.test.mjs` asserts only that LICENSE is in the tarball and NOTICE equals root NOTICE | Add to `tests/publish-target.test.mjs`, next to the NOTICE assertion: `assert.equal(readFileSync('packages/snowarch/LICENSE'), readFileSync('LICENSE'), 'packages/snowarch/LICENSE has drifted from the root LICENSE')` | dev | S | **rework (2026-09-12)** — the NOTICE copy had a drift test and the LICENSE copy did not; added beside it |
| B01-02 | ARC-01-S08 AC 1 | Licence grep incl. "all rights reserved" empty outside exclusions AND ADR-0002 still quotes "source.available" (≥1) | `tests/no-legacy-names.test.mjs` FORBIDDEN carries four of the five patterns but not `all rights reserved`; the positive clause is not asserted | Add `(?i)all rights reserved` to FORBIDDEN (docs/decisions, docs/plans, docs/spikes, ARCHITECTURE.md already exempt); add test "ADR-0002 still quotes the superseded licence" asserting `/source.available/i` matches ≥1 line of `docs/decisions/ADR-0002-licence.md` | dev | S | **rework (2026-09-12)** — the fifth pattern added, after checking all seven live hits are already exempt carriers |
| B01-03 | ARC-01-S05 AC 8 | `npm explain minimatch --workspace packages/snowarch` lists only minimatch@10.x | Root `package.json` carries `overrides.minimatch ^10.2.2` but nothing checks the resolved version; a lockfile regeneration could drop it | node:test reading `package-lock.json` asserting every `node_modules/**/minimatch` entry has version starting `10.`; or a CI step in the test job piping `npm explain` through grep | dev | S | **rework (2026-09-12)** — both halves: the manifest still pins `^10.`, and no lockfile entry resolves outside 10.x |
| B01-04 | ARC-01-S05 AC 5 | `package-lock.json` lockfileVersion 3 with workspace links `packages/snowarch,tools/snowarch` | Verified by hand only; no test | Add to `tests/version-consistency.test.mjs`: parse package-lock.json, assert lockfileVersion === 3 and `packages['packages/snowarch']` and `packages['tools/snowarch']` exist with `link:true` and version === root version | dev | S | **rework (2026-09-12)** — asserted by RESOLVED PATH rather than by key: the name may change, the directory may not |
| B01-05 | ARC-01-S10 AC 1 | `test ! -e docs/LIVE-ARTEFACTS-CATALOGUE.md` | File absent, run-history half asserted by `tests/validation-tests-shape.test.mjs`, but nothing keeps the catalogue gone | Add `/^docs\/LIVE-ARTEFACTS-CATALOGUE\.md$/` to FORBIDDEN_PATHS in `tests/no-legacy-names.test.mjs` ("the S03 leaf-cut paths stay deleted" iterates that list) | dev | S | **rework (2026-09-12)** — a `FORBIDDEN_PATHS` entry; it was absent with nothing keeping it so |
| B01-06 | ARC-01-S03 AC 3 | 12 leaf paths absent under packages/snowarch incl. `docs/CLIENT_SETUP.md`, `docs/index.html`, `package-lock.json`, `.gitignore` | FORBIDDEN_PATHS pins 8 of 12 (desktop, clients, .github, Dockerfile, server.json, smithery.yaml, glama.json, TERMS.md); never-commit covers .gitignore; three unguarded | Extend FORBIDDEN_PATHS with `/^packages\/snowarch\/(docs\/CLIENT_SETUP\.md\|docs\/index\.html\|package-lock\.json)$/` | dev | S | **rework (2026-09-12)** — the four unpinned leaf paths added; 8 of 12 were pinned |
| B01-07 | ARC-01-S12 AC 1 / AC 2 | Scope-cut ledger has exactly 18 rows (10 leaf + 8 deferred); Product-constants table has one row per `engine.config.json` leaf key | Manual only; ledger reorganised into 6 leaf + 7 deferred rows (items grouped), so the literal "18 rows" no longer holds; engine.config.json gained keys (mcp.permissions.*, docs.upstream, roster.utility) | node:test that flattens engine.config.json leaf keys (excluding `$schema`) and asserts each key path appears as a row in the `docs/ARCHITECTURE.md` "Product constants" table; drop the "18 rows" literal or assert the 12 leaf + 8 deferred items by name | dev (test), architect (story amendment) | S | **record (2026-09-12)** — the table does not exist under that name, and eighteen counted items the record groups (the owner ruled on NINE cuts). The substance — the ten leaf paths stay absent — is B01-06 |

ARC-01 superseded-by-design criteria (story text stale, not defects; record as amendments,
architect, S): S02 AC 5 (.gitmodules, .mcp.json, .claude/settings.json now deliberately committed by
ARC-03-S01 / ARC-06-S01), S02 AC 4 (scripts/legacy deleted by ARC-10-S03), S05 AC 2 (five runtime
dependencies after ARC-04-S01: @modelcontextprotocol/sdk, commander, dotenv, undici, zod), S07 exact
.gitignore/.gitattributes content, S11 AC 1 "11 jobs" (now about 15 job families), S11 AC 6, S12 AC 4
(docs/CONTRIBUTING.md is itself allow-listed with owner ARC-10). S02 AC 2/3/8/9 need the maintainer's
old checkout and are point-in-time (now stale).

### ARC-02

| ID | Where | Criterion | Why uncovered | Proposed check | Owner | Size | Vetting |
|---|---|---|---|---|---|---|---|
| B02-01 | README R1 / ARC-02-S01 AC 2 / ARC-02-S03 AC 3 | `compare-skill-bodies.mjs` against the import tag reports "bodies identical: 62/65" (S01) and 56/56 with `## Triggers` excluded (S03) | `scripts/validation/compare-skill-bodies.mjs` exists but nothing in CI, package.json or tests/ invokes it; README lines 53-55 admit nobody has run it since the move; `scripts/validation/` was to be deleted at ARC end and is still present | Add `tests/skill-bodies-preserved.test.mjs`: `git worktree add` a temp dir at `import/engine-v2.8.0-worktree`, run the script `<tmp>/.claude .claude`, assert the output line equals "bodies identical: 62/65" with the three attributable files named; skip with reason when the tag is absent (shallow clone). Then delete `scripts/validation/` per S01 or move the script under `scripts/ci/` | dev | M | **rework + record (2026-09-12)** — the count is not the claim (65/65 → 62/65 → 23/65); 42 differ, all attributable to five recorded causes, asserted both directions. The instrument itself truncated its output at ten with no "…and N more" — fixed |
| B02-02 | README R5 / ARC-02-S05 AC 1 | Legacy-surface grep returns nothing outside `## History` of `docs/ARCHITECTURE.md` | Live grep hits docs/MIGRATION.md, docs/CHANGELOG.md, docs/plans/**, docs/decisions/ADR-0003-scope-cut.md, docs/spikes/S-14b; `tests/no-legacy-surfaces.test.mjs` exempts them by path/marker, so the test is green while the criterion as written is not (README lines 56-61 record this) | Amend README criterion 5 to enumerate the test's exemption set and tick it against `tests/no-legacy-surfaces.test.mjs` "no retired surface is described outside the history glossary"; or narrow the exemptions and let the test fail on the extra files. Decision needed: architect | architect | S | **record (2026-09-12)** — the test was green while the criterion was false. R5 now names the carrier classes and cites the ratchet |
| B02-03 | README R7 / ARC-02-S04 AC 4 | A dispatched developer sub-agent (T-01 prompt) returns an artefact whose structure equals `tests/fixtures/regression/T-01-structure.baseline.txt` (seven-element contract set per the S04 amendment) | `tests/fixtures/regression/` does not exist; baseline and post-change captures were committed only to PR #20 (0ca7585); `scripts/validation/t01-regression.mjs` has no fixture and no test or CI cell runs it | Commit the seven-element contract list as `tests/fixtures/regression/T-01-contract.json`; make `scripts/validation/t01-regression.mjs` (or `tests/t01-regression.test.mjs`, skipping without `claude`) assert all seven on a fresh `claude -p` capture; record each run under `docs/spikes/validation-runs/` | dev | M | **rework (2026-09-12)** — the referenced baseline exists in no clone, and a literal baseline is the wrong fixture (headings are model output). The seven-element contract is committed, generated from the harness |
| B02-04 | ARC-02-S09 AC 4 | CLAUDE.md (S08) and docs/ARCHITECTURE.md link to `docs/MODES-AND-PRESETS.md`; links resolve | ARCHITECTURE links it (lines 59, 957) but `grep -ci 'modes' CLAUDE.md` = 0; `tests/claude-md.test.mjs` "criterion 7" checks only that present paths resolve | Add the pointer line to CLAUDE.md section "Where things are" (within the 200-line budget; live 130 lines) and extend `tests/claude-md.test.mjs` "criterion 4 — the strings a session needs to find" with the literal `docs/MODES-AND-PRESETS.md` | dev | S | **rework (2026-09-12)** — `grep -ci modes CLAUDE.md` was 0; pointer added and asserted, 131 lines against a 200-line budget |
| B02-05 | ARC-02-S04 AC 5 and ARC-02-S02 AC 8 | `grep -rn 'Task tool' .claude/agents` = 0 (S04-5); the SK-xx/AG-xx rule list is documented in docs/CONTRIBUTING.md (S02-8) | The "Task tool" test ("ARC-02-S06 criterion 3") scopes to CLAUDE.md and governance/, not .claude/agents; nothing asserts CONTRIBUTING carries every SK-01 to SK-12 / AG-01 to AG-06 id (23 mentions found, completeness unverified) | Extend the criterion-3 test's file set to `.claude/agents/*.md`; add a test that every rule id exported by `tests/lib/lint-rules.mjs` appears in docs/CONTRIBUTING.md | dev | S | **rework + closed (2026-09-12)** — the sweep is widened to `.claude/agents/`; all 18 rule ids were already documented, now asserted by reading the lint source |

ARC-02 note: `tests/skill-listing.test.mjs` (S-13) exists but never runs in CI (no `claude` in the
test job; the `plugin validate` job does not call it). README R2 rests on committed evidence
(`docs/spikes/S-13-skill-description-cap/README.md`, `docs/spikes/validation-runs/ARC-02-S11-snowarch-skill.md`)
plus a local re-run; it is in the RC run order (step 3.3).

### ARC-03

| ID | Where | Criterion | Why uncovered | Proposed check | Owner | Size | Vetting |
|---|---|---|---|---|---|---|---|
| B03-01 | ARC-03-S02 AC 2 (reader: unknown) | Given a skill citing an area no skill or agent yet cites, `gen-docs-areas.mjs --check` exits 2 and prints `vendor/docs-areas.txt is stale: +<area> — run: node scripts/gen-docs-areas.mjs --write` | No test references the `--check` failure path (only `tests/docs-recipe.test.mjs`, which counts areas); CI `npm run lint` proves the happy path; the message at `scripts/gen-docs-areas.mjs:47` is unasserted; AC 1 "exactly 19 lines, LF" only implied by eol.test.mjs | Add `tests/gen-docs-areas.test.mjs`: copy scan roots to a temp dir, append `markdown/release-notes/foo.md` to one fixture skill, run `--check` with cwd=temp, assert exit 2 and `/is stale: \+release-notes/`; assert the committed file has no `\r`, ends with `\n`, is sorted; assert bare invocation prints usage and exits 2 | dev | S | **rework (2026-09-12)** — and **the proposed check could not have worked**: `--check` with `cwd=temp` would have scanned this repository, because the script resolves its root from its own location. The fixture copies the script and its one stdlib-only import into a temp tree and plants a marker absent from the real checkout to prove where it resolved. Six cases, including `--write` asserting the real list is byte-identical afterwards |
| B03-02 | ARC-03-S08 AC 2 (reader: unknown) | `docs family zurich` with neither `--dry-run` nor `--yes` prints the plan and exits 2 with `refusing to apply without --yes`; nothing changes | Implemented at `tools/snowarch/lib/docs/cli.mjs:138` but `tests/docs-family.test.mjs` has no bare-invocation case | In `tests/docs-family.test.mjs`, spawn `node tools/snowarch/bin/snowarch.mjs docs family zurich` against the fixture upstream; assert exit 2, stderr contains `refusing to apply without --yes`, stdout contains the EDIT plan, `git status --porcelain` empty | dev | S | **rework (2026-09-12)** — same trap, worse consequence: `lib/config.mjs` also resolves from its own location, so the proposed spawn would have planned a family switch against THIS repository. The engine is copied instead (3.0 MB, 317 files, once per file), with the marker and a byte-identical assertion on the real `engine.config.json`. Both directions: no flag refuses (exit 2), `--dry-run` answers (exit 0) |
| B03-03 | ARC-03-S09 AC 5 (reader: unknown) | With `newlyDead` non-empty, the PR carries the `needs-remap` label and its CI `citations` job is red | `docs-bump.yml` adds `needs-remap` when NEWLY_DEAD != 0, but `tests/docs-bump.test.mjs` asserts only exit 1 + staged move (line 131) and the gh-stub call list; the "CI red" half is by construction, not asserted | Extend the gh-stub test to assert `gh pr create … --label docs-corpus,needs-remap` on the fixture tip that deletes a cited page; or add a `tests/workflows.test.mjs` assertion that the "Open or update" step's `labels` expression includes `needs-remap` guarded by `NEWLY_DEAD != "0"` | dev | S | **rework (2026-09-12)** — the guard is now READ OUT OF `docs-bump.yml` and executed rather than retyped, so it cannot drift from the file. `NEWLY_DEAD=0` → `docs-corpus`; `1`/`7` → `docs-corpus,needs-remap`; the label is created before use; both PR paths (create and edit) pass the computed labels |
| B03-04 | ARC-03-S05 AC 8 | Live proxy run: `HTTPS_PROXY=http://user:pw@127.0.0.1:9` yields `cannot reach proxy 127.0.0.1:9 (HTTPS_PROXY)` (never `pw`), exit 5; `SNOWARCH_DOCS_UPSTREAM=https://nonexistent.invalid/x.git` yields the DNS message, exit 5; vendor/ untouched | `tests/docs-sync.test.mjs` "failure mapping — every row…" unit-tests the classifier on canned git stderr; no test drives real git against a closed port or unresolvable host | manual-rc on the RC (run order step 4.2); optionally an opt-in `docs-real.yml` step on ubuntu-latest doing the same | architect (run), dev (optional step) | S | **record (2026-09-12)** — `SNOWARCH_DOCS_UPSTREAM` **has never existed in any commit of product code** (`git log -S … --all` → nothing); it lives only in this plan and two story texts. The upstream is `engine.config.json` `docs.upstream` with no environment override, so the DNS negative needs a config fixture and is proven by `tests/docs-sync.test.mjs:252/283`. Both stories amended; the 4.2b row you dropped cites the same. No variable was built to satisfy a criterion |

ARC-03 chore: **ARC-03-C1** — `bootstrap (no-node, *)` red on `89bb06f`: the generated corpus recipe
swallowed a transient HTTP 408 (its exit status was its final `echo`'s), so the doctor reported the symptom;
and the recipe had never been idempotent. Retry, fail-fast joiners on all three surfaces, a clone
precondition, and launcher cleanup. The register for it is the chores table in
`docs/plans/ARC-03-servicenow-docs-corpus/README.md` (the ARC-09 precedent), where the full row lives.

ARC-03 note: `docs-real.yml` and `docs-bump.yml` are not `main` required contexts; their green
status is read from GitHub Actions (run order step 0.3). S01 AC1 pin literal `ba513f2` is superseded
(pin now 11b39be after PR #78); tests compare gitlink to config, not to a literal.

### ARC-04

| ID | Where | Criterion | Why uncovered | Proposed check | Owner | Size | Vetting |
|---|---|---|---|---|---|---|---|
| B04-01 | ARC-04-S03 criterion 1 (live half) | When switched back to pdi the same call succeeds on a PDI (live, `RUN_LIVE_E2E=1`) | S03 amendment says the case "stays in tests/live/live-e2e.test.ts" and the README says every deferral has a procedure in `packages/snowarch/tests/live/README.md`; neither is true (live-e2e cases: basic-auth handshake, CRUD, attachment, pagination, DELETE_NOT_FOUND, SV-04, impersonation; README carries only S07 c4 and S09 c2/3/4); Sitting C does not name it | Add an "ARC-04-S03 criterion 1" section to `packages/snowarch/tests/live/README.md` (two-instance store fixture, switch prod → record_add refused, switch pdi → record_add succeeds, teardown) or a RUN_LIVE_E2E case in live-e2e.test.ts; list it under Sitting C in `docs/spikes/OWNER-SITTING.md` | dev (procedure), owner (run) **(corrected at ARC-04 acceptance, 2026-09-13, on c8dcd3c: the run needs an instance this session never touches, so the split is procedure/run — the same shape B04-03 already used.)** | S | **record — procedure written, run is the owner's**; pass condition is that step 4 is the SAME call as step 2, since a run where both refuse proves nothing about production |
| B04-02 | ARC-04-S08 criterion 3 (live half) | tools/list before and after `snow_disco_table_discover incident` byte-identical (live); discover response contains number, short_description, state | Deferred to the owner sitting by the S08 amendment, but no procedure in tests/live/README.md and nothing in OWNER-SITTING names it; unit half covered (`tests/tools/discovery.test.ts` "the catalogue does not change when a table is discovered") | Append a section to tests/live/README.md: capture tools/list over stdio, call the tool with `{table:'incident'}`, capture again, diff byte-for-byte; assert the three columns; add to Sitting C | dev (procedure), owner (run) **(corrected at ARC-04 acceptance, 2026-09-13, on c8dcd3c: the run needs an instance this session never touches, so the split is procedure/run — the same shape B04-03 already used.)** | S | **record — procedure written, run is the owner's**; control is a third capture whose diff must NOT be empty, or a cached capture looks like a pass |
| B04-03 | ARC-04-S10 criterion 1 (literal `result == "ok"`) | `audit.jsonl` line parses to `result == "ok"` | Needs a reachable instance (S10 amendment); no procedure in tests/live/README.md or OWNER-SITTING; unit half covered by `tests/audit/no-secrets.test.ts` "criterion 1 - a mutating call writes one line, and the payload is not in it" | Fold into the S07 c4 live procedure: after the capture-chain write, `tail -1 .local/audit.jsonl` must parse with `result:"ok"` and tool `snow_scr_script_include_add`; record the redacted line | dev (procedure), owner (run) | S | **record — procedure written, run is the owner's**; runs as the last step of S07 c4, and its control is a call that FAILS |
| B04-04 | ARC-04-S06 criterion 3 | `contract --sha` prints exactly 64 hex chars + newline; twice → same; editing a description changes the manifest but not the sha, editing a gate changes it | No test exercises the CLI sub-command; related claims tested in `contract.test.ts` "12. buildContract() in-process is byte-identical to the committed contract" and "the contract carries no description or inputSchema — they are not part of the sha"; `tools/snowarch/tests/b03-b05.test.mjs` B05 checks the pinned sha | Add `packages/snowarch/tests/cli/contract.test.ts`: spawn `dist/cli/index.js contract --sha` twice, assert `/^[0-9a-f]{64}\n$/` and equality with sha256(dist/contract.json); run `contract` and `contract --json`, assert tool count equals `contract.toolCount` | dev | S | **rework** — nothing had spawned the sub-command; 64 hex + newline, empty stderr, stable, equal to sha256(dist/contract.json) |
| B04-05 | ARC-04-S01 criterion 4 and ARC-04-S02 criterion 6 | `grep -rn "servicenow-mcp…" packages/snowarch/src` returns nothing | Stale: matches `packages/snowarch/src/cli/import-legacy.ts:49,54,58` (ARC-07-S08 `instance import --from-legacy` must name the legacy store path); the ratchet exempts that file; no amendment records the exception | Amend both criteria (or add an S01/S02 amendment) to exclude `src/cli/import-legacy.ts`; make it a test: extend `tests/no-legacy-names.test.mjs` or add a packages/snowarch test scanning src/ minus import-legacy.ts for the five literals | architect (amendment), dev (test) | S | **rework** — false since ARC-07-S08; amended, and a both-directions ratchet so an exemption cannot outlive its reason |
| B04-06 | ARC-04-S01 criterion 5 | `dist/cli/index.js --help` lists exactly start, instance, doctor, contract; `contract` exits 2 "not implemented in this story" | Superseded twice (ARC-07 filled `instance`, ARC-09-S06 added `store`, S06 filled `contract`) and never re-stated; no test asserts the top-level command list | Add a test spawning `dist/cli/index.js --help` and asserting the command set equals the one in `packages/snowarch/README.md` § CLI (start · instance · store · doctor · contract); amend the criterion text | dev, architect | S | **rework** — the proposed check compared `--help` against a README section that did not exist; written, and the test reads it |
| B04-07 | ARC-04-S06 criterion 6 | Spot-check snapshot: records_query none/false, record_add write/true, script_include_add scripting/true, script_include_read none/false, atf_test_exec atf/true, na_summary_generate now_assist/false, instance_switch none/false, capture_target_set write/true | No snapshot test names these eight; values verified by hand against dist/contract.json (all match) but nothing guards them | Add an `it.each` spot-check in `packages/snowarch/tests/contract.test.ts` asserting the eight (name, gate, mutates) triples against the built contract | dev | S | **rework** — verified by hand and guarded by nothing; eight rows plus a guard that they are real, distinct and span five gates |
| B04-08 | ARC-04-S14 criterion 5 (reader: unknown) | A reader following only the README can register the server with a generic MCP client and call `snow_core_status_read` (manual check by someone other than the author, recorded in the PR) | No record in docs/validation/, OWNER-SITTING.md or the ARC README exit table (the only "second reader" note, OWNER-SITTING lines 119-125, is ARC-10-S02's) | Record the read-through (who by role, date, client used, redacted status_read output) in docs/validation/ or the ARC-04 README exit table; or fold into Sitting A as an explicit line | architect | S | **record — the run is the owner's**; the author cannot be the reader, which is the criterion's point. Sitting A row with the pass condition |
| B04-09 | ARC-04 README "Deferred to the owner's live sitting" paragraph, and R3 wording | Each deferral has a runnable procedure in `packages/snowarch/tests/live/README.md`; R3 says `_add → SCRIPTING_NOT_ENABLED` under read-only | Only S07 c4 and S09 c2/3/4 have procedures; S05's S-10 lives in `docs/spikes/S-10-readonly-preset-sufficiency/PROCEDURE.md` (README names the folder `S-10-read-only-sufficiency`); S03 c1, S08 c3, S10 ok have none; Sitting C references no ARC-04 deferral by name. R3 test asserts `WRITE_NOT_ENABLED` under read-only (S03 gate ordering) and `SCRIPTING_NOT_ENABLED` under WRITE-only | Add an "ARC-04 live deferrals" block to OWNER-SITTING.md Sitting C listing S03 c1, S05/S-10, S07 c4, S08 c3, S09 c2/3/4, S10 result:ok with file/section per procedure; write the three missing procedures (B04-01/02/03); fix the S-10 folder name and the R3 wording in the README | architect | S | **rework** — three of six deferrals had no procedure and R3 stated the wrong error code; both corrected against the test |

ARC-04 status hygiene: README status header still reads "Stories drafted 2026-09-04" while its exit
evidence (2026-09-08) is complete. ARC-08 imports the doctor by relative path rather than
`@farstic/snowarch/doctor` (S12 c7 remains test-asserted via the exports map); note only.

### ARC-05

| ID | Where | Criterion | Why uncovered | Proposed check | Owner | Size| Vetting |
|---|---|---|---|---|---|---|
| B05-01 | ARC-05-S01 AC 4 | `pin.mjs --yes` exits 1 with exactly one `REGATE snow_fluent_script_exec:` line against a fixture; `--accept-regate` rewrites gate | No test invokes pin.mjs; the story's `tests/contract/fixtures/contract-*.json` (renamed / re-gated / missing) do not exist; only drill scenario 2 in docs/CONTRIBUTING.md shows the refusal (dated manual capture) | Add `tests/contract/pin.test.mjs` spawning `node packages/contract/pin.mjs --yes` with `SNOW_CONTRACT_PATH`/`SNOW_PIN_PATH` at fixture contracts (baseline, re-gated, missing tool); assert exit 1 + single REGATE line, exit 0 after `--accept-regate`, committed pin untouched | dev | M |
| B05-02 | ARC-05-S01 AC 5 | Required tool absent → pin.mjs exits 1 with `MISSING <name> — not in packages/snowarch/dist/contract.json`, file unchanged | Same gap; drill scenario 1 shows the server test and L08, not the pin.mjs MISSING line | Same pin.test.mjs: fixture with one required tool removed; assert the MISSING line and a byte-identical pin file afterwards | dev | (in B05-01) |
| B05-03 | ARC-05-S01 AC 7 (reader: unknown) | Propose → review → apply: without `--yes` prints proposal then waits; `n` exits 3; non-TTY without `--yes` exits 2 with the stdin message; Ctrl-D aborts | No test drives pin.mjs stdin (`tools/snowarch/tests/bootstrap-plan.test.mjs` "stdin closing is a quit" covers the bootstrap wizard, not pin.mjs) | pin.test.mjs: spawn with stdio pipe (non-TTY) → exit 2 and message; assert a closed stdin resolves to abort (exit 3), not exit 13 | dev | (in B05-01) |
| B05-04 | ARC-05-S02 AC 1 | After adding a key to `retired-identifiers.json`, `--check` exits 1 and prints the missing key; re-run without `--check` adds it | `tests/contract/retired-names.test.mjs` runs `--check` on the committed tree only (positive case) | Copy packages/contract to a temp root, append a key, run `gen-retired-names.mjs --check` → exit 1 naming the key; run without `--check` → key present | dev | S |
| B05-05 | ARC-05-S10 AC 1 to AC 3 (AC 3 reader: unknown) | `flagNames(loadContract()).length === 6` stdlib-only; stale pin throws `ContractPinMismatch` naming both shas, `verifyPin:false` loads; `expandPreset` throws `SCRIPTING_ENABLED requires WRITE_ENABLED` and pdi-developer expands to the §6.3 row | No loader unit test; `expandPreset`/`ContractPinMismatch` appear only in `packages/contract/lib/contract.mjs` and `tools/snowarch/lib/steps/B05.mjs`/`B06.mjs`; `tests/contract/no-literals.test.mjs` imports loadContract but asserts nothing about it; `tools/snowarch/tests/b03-b05.test.mjs` "AC 3 — one byte in the contract, and B05 names both 12-char prefixes" is indirect; story task 2 not delivered | Add `tests/contract/contract-lib.test.mjs`: flagNames length 6 on the real tree; loadContract with `SNOW_PIN_PATH` at a stale fixture throws ContractPinMismatch with both shas and loads with `verifyPin:false`; `expandPreset('custom',{SCRIPTING_ENABLED:'true'})` throws the exact string; `expandPreset('pdi-developer')` deep-equals `contract.presets['pdi-developer']` | dev | S |
| B05-06 | ARC-05-S08 AC 7 (reader: unknown) | Test 3 runs both flag states for every catalogue tool in under 30 s on the slowest CI runner | No timing assertion in `packages/snowarch/tests/contract.test.ts`; no CI step reports duration | manual-rc (run order step 6.1): read vitest's duration for contract.test.ts on the `contract (windows-latest, node 20)` cell log | architect | S |
| B05-07 | ARC-05-S09 AC 5 | `node scripts/contract-gate.mjs --skip-build` skips step (1) and still runs (2) to (4) | `tests/release.test.mjs` "C12b: the contract gate runs after the writes" asserts the release script invokes `contract-gate.mjs --skip-build` through a mock; nothing tests contract-gate.mjs's own step selection | Add a test running contract-gate.mjs with a fake npm on PATH (or a `--dry-run` flag) asserting the printed step list omits `dist` under `--skip-build`; or manual-rc (step 6.2): check the `CONTRACT GATE:` line lacks `dist ok` | dev (test) or architect (run) | S |

ARC-05 notes: ci.yml line 1076 still has `continue-on-error` on the plugin-validate install step
(job-level is required per CONTRIBUTING; the job is a required context). S04 AC 3 (L06) has no
fixture test, only drill scenario 2/4 and gen-governance "header carries the contract sha"; S09 AC 4
(live branch protection) is manual-rc (step 0.2).

### ARC-06

| ID | Where | Criterion | Why uncovered | Proposed check | Owner | Size| Vetting |
|---|---|---|---|---|---|---|
| B06-01 | ARC-06-S08 AC 3 (reader: unknown) | With `SNOW_STORE=/nonexistent` exported, B08 fails with the "different store" sentence naming SNOW_STORE | No test or CI step asserts the sentence (grep "different store" across tools/snowarch/tests, tests/doctor, packages/snowarch/tests finds nothing); `b08-verify.test.mjs` uses SNOW_STORE only for the AC 2 unconfigured case | Add a case to `tools/snowarch/tests/b08-verify.test.mjs`: bootstrap a fixture store, run B08 with SNOW_STORE elsewhere, assert status fail and detail matches `/different store.*SNOW_STORE/` | dev | S |
| B06-02 | ARC-06-S08 AC 4 (reader: unknown) | With `MCP_TIMEOUT=1` in a test copy of .claude/settings.json, B08 fails with the `initialize` timeout sentence; with the S-06 value it passes | No test exercises the initialize timeout; MCP_TIMEOUT appears only in `tests/doctor/engine-repo.test.mjs` (E-08 presence) and `tools/snowarch/tests/input-hash.test.mjs`; the engine's handshake module was retired for the doctor's server section (ARC-08-S05) and the negative did not follow | In `tests/doctor/server.test.mjs` (or b08-verify.test.mjs) run the server section with `settings.env.MCP_TIMEOUT='1'` against the committed dist/server.js and assert the "did not answer initialize within 1 ms" failure; then with the committed value assert ok | dev | S |
| B06-03 | ARC-06-S08 AC 5 second half (reader: unknown) | With `required-tools.json` edited to add a fictitious tool and the sha updated, B08 fails naming the tool and its `used_by` | B05 half covered (`tools/snowarch/tests/b03-b05.test.mjs` "B05 also catches a pinned tool the server does not have"); no test asserts the B08 failure text naming `used_by` | Extend b08-verify.test.mjs: fixture required-tools.json with `snow_fake_x` (used_by `['fixture']`) and matching sha, run B08 against the real unconfigured server, assert the fail detail contains `snow_fake_x` and `fixture` | dev | S |
| B06-04 | ARC-06-S08 AC 7 (reader: unknown) | Handshake module: a fixture server answering tools/list in three pages returns all names; one that never answers rejects after the timeout without a hung child | `tools/snowarch/tests/fixtures/mcp-stub.mjs` implements PAGES mode but no test references it (orphaned since the handshake moved into the doctor's server section) | Either wire mcp-stub.mjs into a pagination/timeout test of the doctor server module and assert all names + no lingering child pid, or delete the fixture and record in STORIES.md that AC 7 is proven by `packages/snowarch/tests/doctor/*` (naming the test) | dev | S |
| B06-05 | ARC-06-S10 AC 4 (reader: unknown) | bash launcher with Node absent and `--mode live` stops at B00 with the live-needs-Node FAIL, the macOS/Linux remedy, exit 3, `.local/` not created | No CI step or test runs `./bootstrap.sh --mode live` with Node stripped; the `launcher` job and no-node cells run `--mode design` only; the Windows equivalent (`windows launcher` "Exit codes 2 and 3 reach the caller") is the `--mode live --yes` → 2 case | In ci.yml job `launcher` add: `env -i PATH=/usr/bin:/bin bash ./bootstrap.sh --mode live --yes; test $? -eq 3 && ! test -d .local` and grep the output for the remedies.json darwin/linux Node remedy | dev | S |
| B06-06 | ARC-06-S10 AC 5 / ARC-06-S11 AC 7 (reader: unknown) | With Node absent and a pre-existing mergeable settings.local.json lacking the toggle, B07 fails with the hand-edit sentence (exit 1, file unchanged); after the hand edit a re-run passes with `ok (already set)` | Sentence exists in bootstrap.sh:200 and bootstrap.ps1:271 and `tests/launcher-parity.test.mjs` asserts the strings, but nothing executes the branch; CI assertion 8 only proves `ok B07: already set` on a second run of the launcher's own file | Add a step to the `launcher` and `windows launcher` jobs: write `.claude/settings.local.json` = `{"permissions":{}}`, run the Node-free launcher, assert exit 1, sha unchanged and the "cannot be merged without Node" text; add the toggle by hand and assert exit 0 with `ok B07: already set` | dev | S |
| B06-07 | ARC-06-S10 AC 8 (reader: unknown) | From `clients/acme/` inside the checkout, `../../bootstrap.sh` prints the root FAIL with the `cd` command and exits 3 | Only the Node path (`tools/snowarch/tests/b00-integration.test.mjs` "AC 2 — from a subdirectory") and the Windows launcher in CI (`..\bootstrap.cmd` → 3) are tested; the bash launcher's own root check has no test or CI step | In ci.yml job `launcher`: `mkdir -p clients/acme && (cd clients/acme && ../../bootstrap.sh --mode design --yes; test $? -eq 3)` with Node stripped; grep for "not at the repository root" and the `cd "` remedy; assert `.local/` absent | dev | S |

ARC-06 notes: README R1 is ticked although its `/mcp` + `/snowarch status` half is Sitting A (the
tick is defensible for the CI half only). The story text for S08 still describes
`lib/mcp-handshake.mjs`; an amendment should record the ARC-08-S05 retirement (architect, S).

### ARC-07

| ID | Where | Criterion | Why uncovered | Proposed check | Owner | Size | Vetting |
|---|---|---|---|---|---|---|---|
| B07-01 | ARC-07-S02 AC 5 | The `network:` line masks proxy userinfo and appears EXACTLY ONCE per `instance add` / `instance test` run | `packages/snowarch/tests/servicenow/reachability.test.ts` proves format, masking and "one line per call"; the amendment hands "once per run" to S05/S06, but no test in `cli/instance.test.ts` or `cli/instance-manage.test.ts` greps the `network:` count | In `cli/instance.test.ts` happy path and `cli/instance-manage.test.ts` "AC 2 — test", assert `stdout.match(/^network: /gm).length === 1` (and that the retry menu path does not print it twice) | dev | S | **rework (2026-09-12)** — asserted on four runs: `instance add` happy path, the unreachable path (the line precedes the probe, so a failing run prints it too), the RETRY path (re-probes, still one line), and `instance test`. The retry case caught its own first draft — menu `[1]` is *re-enter the URL*, not retry, and the precondition reported one probe instead of passing on a run that never retried |
| B07-02 | ARC-07-S07 AC 3 | The cloud-sync cases are the rows of `tests/fixtures/cloud-sync-paths.json`, and ARC-06-S05's AND ARC-08-S03's parity tests read that file | Only `packages/snowarch/tests/store/cloud-sync.test.ts` and `tools/snowarch/tests/b01-b07.test.mjs` read the fixture; the ARC-08-S03 E-25 detector (`tools/snowarch/lib/doctor/checks/host.mjs`, `tests/doctor/host.test.mjs`) does not | Add to `tests/doctor/host.test.mjs` a table test loading `packages/snowarch/tests/fixtures/cloud-sync-paths.json` and asserting E-25 answers WHETHER (and WHICH provider where named) for every row, as b01-b07.test.mjs does | dev | S | **rework + gap recorded (2026-09-12)** — the case carried three hand-written segments while claiming to answer the shared list; it is a table over all 8 `synced` and 6 `quiet` rows now. **The fixture's `env[]` section is answerable by the server's detector only**: `cloudSyncProvider(path)` takes no env, so E-25 misses Windows Known Folder Move. Pinned as current behaviour so it cannot move unnoticed; the fix is ARC-06/ARC-08's call |
| B07-03 | ARC-07 README criterion 12 (S10) | docs/MODES-AND-PRESETS.md, regenerated TROUBLESHOOTING.md and the generated rule file carry the final text; no "Tier" vocabulary | Proven (`tests/modes-page.test.mjs` AC 1/AC 4, `packages/snowarch/tests/errors/codes.test.ts`, `tests/no-legacy-surfaces.test.mjs`) but the README box is still `[ ]` while the ARC header says COMPLETE | Tick the box in `docs/plans/ARC-07-instance-wizard-and-credentials/README.md` citing the three tests | architect | S | **closed (2026-09-12)** — proven all along, the box never moved. Ticked citing `tests/modes-page.test.mjs` (5), `errors/codes.test.ts`, `no-legacy-surfaces.test.mjs` (17), all re-run green; `grep -rniE '\bTier [012]\b'` over both pages returns nothing |
| B07-04 | ARC-07-S11 AC 5 | `tests/fixtures/oauth-ropc-errors.json` contains captured `error` / `error_description` values and S03's table maps them to `OAUTH_ROPC_DISABLED` | Fixture is a valid EMPTY placeholder (`"observed": []`); probes.test.ts asserts only the empty shape; the capture needs case 5's instance write (OWNER-SITTING "The live E2E suite (ARC-07-S11)" item (d)); story is Done with an AC whose evidence cannot exist until the sitting | After the sitting commits the captured bodies, extend `packages/snowarch/tests/servicenow/probes.test.ts` to iterate `observed[]` and assert each maps to the expected code. Until then: amend the story to mark AC 5 as post-sitting | dev (after sitting), architect (amendment now) | S | **record + rework (2026-09-12)** — AC 5 marked post-sitting. The guard asserted `expect(fixture.observed).toEqual([])`, pinning the fixture EMPTY, so the sitting's own commit would have turned it red and read like a regression. Rewritten to the rule meant — every row that exists maps to a code the table knows — so the capture lands in a green tree |

### ARC-08

| ID | Where | Criterion | Why uncovered | Proposed check | Owner | Size | Vetting |
|---|---|---|---|---|---|---|---|
| B08-01 | ARC-08-S01 AC 6 (reader: unknown) | `node --test tests/doctor/` passes on ubuntu, macOS and Windows BEFORE `npm ci` (stdlib only; contract loader imported by relative path) | The `test (os, node)` job runs `npm ci --ignore-scripts` before `npm test`; no job runs tests/doctor without node_modules (the bootstrap cells run the product, not the suite); the three-OS half is proven, the "before npm ci" half is not | Add a step to one design-only `bootstrap (node-cli)` cell per OS, before any `npm ci`: `node --test tests/doctor/ tests/hook/`; or a dedicated `doctor-stdlib` job with no install step; or a static guard (like `tests/contract/no-literals.test.mjs`) failing on any bare-specifier import under tools/snowarch/lib/doctor and tests/doctor | dev | S | **rework + record (2026-09-12)** — measured on a no-install worktree: 231 cases, 222 pass, 9 fail, all nine needing the server (`@modelcontextprotocol/sdk` absent). The literal command does not run on Node 24 at all. `tests/doctor/stdlib-only.test.mjs` asserts the stdlib property (43 files, 0 bare specifiers, both directions); a step in the three `bootstrap (node-cli)` cells runs the 17-file subset before `npm ci` **CI half now on record**, run 34700650442 on 135aea1, the three `bootstrap (node-cli)` cells, each printing the same 17-file list before any install: `bootstrap (ubuntu-latest, node 20)` **196 tests, 196 pass, 0 fail, 0 skipped**; `bootstrap (macos-latest, node 20)` **196 / 196 / 0 / 0**; `bootstrap (windows-latest, node 24)` **196 / 195 / 0 / 1 skipped** — the skip is deliberate and named: `tests/doctor/host.test.mjs:83`, *"the .cmd twin is covered by the PATH lookup above"*. The printed list is byte-identical to the local one (`diff` clean); AC 6 amended |
| B08-02 | ARC-08-S04 AC 7, second half | Editing the store's `maxRecords` to 50 after the server was started makes SV-06 FAIL naming `maxRecords` | `packages/snowarch/tests/doctor/doctor.test.ts` covers the first half ("criterion 5 - removing one tool from contract.json makes SV-05 fail, naming it") and SV-06's green path; `maxRecords` appears only as fixture data | vitest case in doctor.test.ts: write store, spawn the server via the doctor's handshake seam, rewrite `.local/instances.json` with maxRecords 50, run SV-06, expect status `fail` and detail containing `maxRecords` | dev | S | **rework (2026-09-12)** — `packages/snowarch/tests/doctor/sv06-store-drift.test.ts`, in process against `dist/`, using the cached handshake as "the server already running"; negative control run in SOURCE because `pretest` rebuilds `dist` |
| B08-03 | ARC-08-S04 AC 5, second clause | With the SDK present SV-03 is ok and prints its version | `packages/snowarch/tests/doctor/sv03-sv04.test.ts` asserts the present case only as detail containing `SDK present` (injected probe returns `{installed, where}`), not a version string | Extend the test: inject `{ installed: true, version: '3.0.0' }` and assert detail matches `/3\.0\.0/`; or amend the story text if the check deliberately reports location rather than version | dev, architect (if amended) | S | **rework (2026-09-12)** — the product now prints the version AND the location; asserted both ways in `sv03-sv04.test.ts`; AC 5 amended to record that both are printed |

ARC-08 note: S02 AC 2(b) (four-flag store is not an engine concern) is only implicitly covered; no
test plants a four-flag store and asserts the E-checks are unchanged. Optional chore (dev, S).

### ARC-09

| ID | Where | Criterion | Why uncovered | Proposed check | Owner | Size| Vetting |
|---|---|---|---|---|---|---|
| B09-01 | ARC-09-S08 AC 3 (reader: unknown/partial) | password-stdin-smoke passes on the three Windows cells AND on ubuntu/macOS in the doctor job; store has `lastProbe: null` with `HTTPS_PROXY=http://127.0.0.1:9`; log contains no credential (asserted by script and by ARC-08's redaction test over the job log artifact) | `scripts/ci/assert-password-stdin.mjs` is invoked only from the windows-native job (ci.yml:816); no ubuntu/macOS invocation; the script has no HTTPS_PROXY / lastProbe assertion (amendment 6 replaced `--no-probes` with a loopback TLS stub); no redaction pass over the job-log artifact | Either amend the AC to its delivered shape (Windows-only, TLS stub) in STORIES.md, or add a step to the ubuntu/macOS `bootstrap` node-cli cells running the script and extend it to assert the output contains neither the password nor the clear username | architect (amendment) or dev (step) | S |
| B09-02 | ARC-09-S08 AC 4 | Removing `C:\Program Files\Git\cmd` from PATH as well (throwaway run) fails bootstrap.cmd at B00 with the `git ≥ 2.25 not found` remedy | No record of the throwaway run in README.md, STORIES.md amendments or docs/CONTRIBUTING.md; nothing in ci.yml or tests exercises a PATH with no git.exe | manual-rc (step 7.4): on a windows-latest branch run, add `--without-git` to strip-git-bash.mjs (or edit GITHUB_PATH) and assert `.\bootstrap.cmd --mode design --yes` exits 3 with the git remedy; record the run URL in the S08 amendments | dev (flag), architect (record) | S |
| B09-03 | ARC-09-S08 AC 5 | A PR that breaks bootstrap.cmd (goto label typo) turns all three windows-native cells red while other cells stay green | No throwaway-PR record; closest evidence `tests/workflows.test.mjs` "the exit-code check after a .cmd is reachable, proven by running cmd (ARC-09-S08)" (C7 drill) proves a planted failure reaches the step, not that a broken launcher reds exactly three cells | manual-rc (step 7.3): one throwaway branch with a `goto` typo; capture 3 red windows-native cells / others green; record the run URL in STORIES.md | architect | S |
| B09-04 | ARC-09-S08 AC 6 | Total workflow wall time on a push < 25 min; the table in docs/CONTRIBUTING.md lists measured durations per job | CONTRIBUTING § CI matrix (line ~2014) has columns Job / Cells / Shell / What only this job can answer, no durations; chore C28 records `upgrade-e2e (windows-latest)` hitting `timeout-minutes: 30` (30.2 min) once | manual-rc (step 0.4): `gh run view <latest main run> --json jobs --jq '.jobs[]\|[.name,.startedAt,.completedAt]'`; add a Duration column; assert total < 25 min or amend the budget | architect | S |
| B09-05 | ARC-09-S08 AC 7 (reader: unknown) | With Q-B fallback in force (env flag in a throwaway branch), the workflow switches to the windows-gitbash variant by changing one job block only | Q-B passed (windows-native exists, no fallback shipped); no simulation branch or env flag exists; never marked not-applicable | Record in the S08 amendments that Q-B passed and AC 7 is not applicable (see section 5) | architect | S |
| B09-06 | ARC-09-S04 AC 4 (partial) | `version --json` parses; ARC-06-S02's five-key shape assertion still passes unchanged (superset); `contractMatches` true on green tree and false after required-tools.json is edited | contractMatches true/false asserted (`tests/version-tag.test.mjs:214-219`); the five-key superset assertion was not located (grep "superset"/"contractMatches" in `tools/snowarch/tests/cli.test.mjs`); a `tests/version-command.test.mjs` named in the AC does not exist | `grep -n 'docsFamily' tools/snowarch/tests/cli.test.mjs` to locate the ARC-06-S02 JSON-shape test and confirm the five keys; if absent, add it | dev | S |
| B09-07 | ARC-09-S01 AC 8 (deviation) | release.mjs runs on windows-latest (pwsh, no Git Bash) in release-dryrun with `--dry-run --offline` and exits 0 | `release-dryrun (windows-latest)` runs `node scripts/release.mjs 9.9.9 --dry-run --offline --no-install --allow-branch` with `shell: bash` (Git Bash present), not pwsh/no-Git-Bash; the no-Git-Bash proof of the release path is not made | Change the step to `shell: pwsh` on Windows (the body is one node call) or amend AC 8 to say the no-Git-Bash property is not claimed for release.mjs | dev or architect | S |

ARC-09 note: S07 AC5's `< 300 ms` bound was not confirmed by grep in
`tests/upgrade/upgrade.e2e.test.mjs` (the nudge line and 8-day freshness are asserted). Verify (dev, S).

### ARC-10

| ID | Where | Criterion | Why uncovered | Proposed check | Owner | Size | Vetting |
|---|---|---|---|---|---|---|---|
| B10-01 | ARC-10-S03 AC 1 | `git ls-files scripts/legacy` empty; `git grep -n "scripts/legacy"` returns only docs/ARCHITECTURE.md | First half holds; second half not literally true: hits also docs/CHANGELOG.md, packages/snowarch/CHANGELOG.md, scripts/README.md, scripts/gen-doctor-docs.mjs, tests/doctor/mapping.test.mjs, tests/no-legacy-names.test.mjs (6), tools/snowarch/lib/doctor/checks/stale-registrations.json, tools/snowarch/lib/doctor/mapping.mjs; the S03 amendment explains rewrites as "name the import tag" but the criterion was not amended and the test encodes a broader allowance | Amend AC 1 to "returns only history references of the form `import/engine-v2.8.0-worktree:scripts/legacy/…` plus docs/ARCHITECTURE.md" and have the S03 case assert that shape; check command: `git grep -n 'scripts/legacy' -- . ':!docs/plans' \| grep -v 'import/engine-v2.8.0-worktree:'` lists only docs/ARCHITECTURE.md | architect (amendment), dev (test) | S | **rework + record (2026-09-12)** — the criterion returns **19 files**, not one; the plan's own replacement is false too (it filters LINES, and `docs/ARCHITECTURE.md` has 4 mentions of which 1 cites the tag). Amended to four classes over nine files, asserted as a path→class map in `tests/no-legacy-names.test.mjs` both directions. The second class is the reason the original could not have been right: the ledger is GENERATED |
| B10-02 | ARC-10-S04 AC 5 | The vocabulary test fails on a fixture file containing `docs/nowaikit-field-notes.md` outside the two allowed files | `tests/no-legacy-surfaces.test.mjs` "ARC-10-S04 AC 1/AC 4" has as its negative only a string-includes check on the token, not a fixture run through the sweep | Plant a temp file inside IN_SCOPE (as the same file's "a planted ctx_ token fails" does), run the sweep on it, assert exactly one finding naming that file, then assert it disappears after cleanup | dev | S | **rework (2026-09-12)** — the control was VACUOUS, not missing: `OLD_RULE.some((t) => `see docs/${t}.md`.includes(t))` asserts that `String.includes` works and never runs the sweep. The sweep is lifted to `findOldRule({files, read, allowed})`, the control plants a real file in a temp base, asserts exactly one hit, asserts the allowed file carrying the same token is NOT reported, and covers the wrapped-token case. Verified load-bearing: a sweep that reports nothing fails the test |
| B10-03 | ARC-10-S04 AC 3 | The CONTRIBUTING table has four rows with a real example each (PN-xx; a packages/snowarch/tests/ file for ORDERBYDESC) | Table exists (docs/CONTRIBUTING.md:1923-1934: PN-07, `packages/snowarch/tests/servicenow/client-orderby.test.ts`, docs/TROUBLESHOOTING.md § PROXY_UNREACHABLE); the "four homes" test asserts destinations, not that the examples resolve | Manual-rc (step 9.2) today; add three existence assertions to the "CLAUDE.md and CONTRIBUTING agree on the four homes" case | dev | S | **closed + rework (2026-09-12)** — the table has its four rows and all four examples resolve (`PN-07` in `docs/PLATFORM-NOTES.md`, `client-orderby.test.ts`, `docs/TROUBLESHOOTING.md`, `packages/snowarch/CHANGELOG.md`). The reader was right that only destinations were asserted; the examples are asserted now |
| B10-04 | ARC-10-S07 AC 3 | tests/VALIDATION-TESTS.md contains the cutover test list with every T-id resolvable plus the design-only checks listed by name | T-id half asserted (`tests/validation-records.test.mjs` "every id in the cutover list resolves to a test in the same file", planted T-99 negative); the design-only-checks-by-name half (banner Mode: design-only; /mcp shows the server disabled; no MCP call in T-05/T-06; /snowarch setup-instance hand-off) is not asserted | Manual-rc (step 9.3): `grep -n 'design-only' tests/VALIDATION-TESTS.md` under the cutover list; add a case asserting the four phrases are present | dev | S | **closed + rework (2026-09-12)** — all four design-only checks ARE named, in the cutover list's own paragraph. Now asserted in the SECTION rather than the file, whitespace-collapsed — a raw match found three of four, because "`/mcp` shows / the server disabled" wraps |
| B10-05 | ARC-10-S02 AC 4 | The PR description records the Claude Code documentation page (URL + fetch date) used for the auto-memory statement; the text contains no absolute path claim | PR metadata not verifiable from the tree; STORIES.md S02 amendment records the page fetched 2026-09-12; the "no absolute path" half not asserted | Manual-rc (step 9.1): `gh pr view <S02 PR> --json body \| grep -c 'docs.claude.com'` and `grep -nE '(/Users/\|/home/\|C:\\Users)' docs/CONTRIBUTING.md` under § Engagements and memory (expect none); optionally extend the S02 AC 1 case | architect | S | **closed (2026-09-12)** — both halves hold. PR #153's body: `**Page:** https://docs.claude.com/en/docs/claude-code/memory — fetched **2026-09-12** via ctx_fetch_and_index (never curl)`. And § *Engagements and memory* carries no absolute path — now asserted, since that is the half that could regress silently |

### Backlog totals

68 items: ARC-00 10, ARC-01 7, ARC-02 5, ARC-03 4, ARC-04 9, ARC-05 7, ARC-06 7, ARC-07 4, ARC-08 3,
ARC-09 7, ARC-10 5. Of these, 19 originate from reader "unknown" classifications (B00-06, B00-07,
B03-01/02/03, B04-08, B05-03, B05-05 (AC 3), B05-06, B06-01 to B06-07, B08-01, B09-01, B09-05) and are
"verify" items first. By owner: dev-led 44, architect-led 24 (several items split). By size: M 7
(B00-01, B00-02, B00-04, B02-01, B02-03, B05-01, and B04-01 to B04-03 taken together as one live-procedure
chore), S 61.

Recommended order: (1) architect amendments and status hygiene that change criterion text
(B02-02, B04-05, B04-06, B04-09, B09-01, B09-05, B09-07, B10-01, B07-03, B07-04 amendment); (2) the
dev test-gap items by ARC; (3) the ARC-00 consolidation (B00-01 to B00-08) last, since it depends on
the verdict lines being final. All rework PRs carry their story-index/ARC-README status update.

## 3. RC run order

> **Corrections from the first §3 pass (develop @ cde0aca, 2026-09-12).** Each was an expectation
> that did not match the tree; the tree was right in every case and the step text below is amended.
>
> - **1.2 lockfile** — the link entries are keyed `node_modules/@farstic/snowarch → packages/snowarch`
>   and `node_modules/@farstic/snowarch-tools → tools/snowarch`, `lockfileVersion 3`. Expect those two
>   entries with their `resolved`, not the string "3 packages/snowarch,tools/snowarch".
> - **1.5 licence grep** — the only hits are `tests/no-legacy-names.test.mjs:20,27`, the detector's own
>   pattern list; exclude that file. ADR-0002 mentions source-available twice. Passes.
> - **1.7 templates** — they live at `templates/*.md` in the root, not `docs/templates/`: six files
>   (adr, gherkin-feature, hld, nfr-checklist, raid-log, traceability-matrix); `templates/adr-template.md`
>   reaches `5b40835`; there is no `reference/`. Passes with the path corrected.
> - **4.2b DNS negative — DROPPED.** `SNOWARCH_DOCS_UPSTREAM` does not exist in product code (it
>   appears only in ARC-03/ARC-06 story text), so the check as written synced from the real upstream
>   and exited 0. `docs/CONTRIBUTING.md` also forbids `.invalid` as a network target outright.
>   The DNS behaviour is unit-tested (`tests/docs-sync.test.mjs:252/283`); ARC-03-S05's AC text needs
>   the record fix (ARC-03 acceptance PR).
> - **5.3 gate spot-check** — the real field names are `gate` / `mutates`; all eight tools as expected.
> - **5.8 server-doctor fixture** — the store shape is
>   `{ version: 1, defaultInstance, instances: { <label>: { url, environment, auth: { method, username,
>   password }, preset } } }` (`packages/snowarch/src/store/schema.ts`), not the flat sketch. At 0600
>   (`.local` 0700) the server doctor is exit 0 and its JSON carries neither password, host nor
>   username; at 0644 SV-02 fails `mode 0644 is group/world-readable` with `chmod 600 <path>`, exit 1.
> - **6.2 `contract-gate.mjs --skip-build`** — prints `CONTRACT GATE: server skipped · dist ok ·
>   generated ok · engine ok`, which is exactly ARC-05-S09 AC 5's wording. The plan's "without dist ok"
>   was a misreading. Passes.
>
> **Residual, recorded rather than fixed (ARC-04 follow-up, 2.0.x):** the SERVER CLI's own
> `doctor --json` carries the instance label verbatim. The issue template asks for the ENGINE's
> `./snowarch doctor --json`, which ARC-08-C1 masks, so nothing the template collects leaks — but the
> server CLI's JSON is a second surface with no boundary. Either the same value-mask there, or a
> documented "this JSON is local; paste the engine's". Not a blocker for the tag.

Preconditions: the backlog above is merged (or explicitly deferred by the owner), `main` is green on
all required contexts, and the RC is cut. Record every step below in `docs/validation/<date>-<os>.md`
using `docs/validation/TEMPLATE.md` (ARC-10-S07), one file per OS the checks ran on, one section per
ARC. Run `node --test tests/validation-records.test.mjs` before committing a record; it is the lint
("every committed validation record is clean"). Redaction rules for every record: no instance host,
no e-mail address, no sys_id, no credential, no home path, no retired name (the lint patterns in
`tests/fixtures/validation-records/` fire on each).

Two record homes exist today: `docs/validation/` (ARC-10-S07) and `docs/spikes/validation-runs/`
(ARC-02 R6, T-01 to T-18 runs). Keep both for the RC; the ARC-02 design-only record goes to
`docs/spikes/validation-runs/` because its own criterion names that path, everything else to
`docs/validation/`. Verify with the owner whether to consolidate after v2.0.0 (architect, S).

### Step 0: cut and confirm the candidate

| # | Check | Command or steps | Expected | Source |
|---|---|---|---|---|
| 0.1 | Cut v2.0.0-rc.1 | Follow `docs/CONTRIBUTING.md` § "The rehearsal — a standing step before every release" (precedent: run 34660381461) and the § "Releasing" checklist; `node scripts/release.mjs 2.0.0-rc.1` on a green tree | One commit, one tag; `git show v2.0.0-rc.1` shows contract sha and docs pin; seven release assets; both negatives (lightweight tag, edited contract sha) refused; metrics rows ≤ 350 MB | ARC-09 R1, S03 AC1/AC3/AC4 |
| 0.2 | Required contexts | `gh api repos/farstic/<repo>/branches/main/protection/required_status_checks --jq '.contexts\|length'`; compare with `tests/fixtures/required-contexts.json` | Count equals the fixture (reader ARC-09: 54); the nine `contract (…)` contexts, three `windows-native`, thirteen `bootstrap (…)` cells and `plugin validate` present | ARC-05-S09 AC4, ARC-09 R5, ARC-01 S11 AC5 |
| 0.3 | Non-required workflows green | On GitHub Actions, latest `docs-real.yml` job `real` (ubuntu/macos/windows, incl. `windows-latest (Git Bash on PATH)`) and `docs-bump.yml` runs | Green; assert-docs.mjs shows `core.longpaths == true` on windows | ARC-03 R8, R5, S11 AC1/AC5 |
| 0.4 | Workflow duration | `gh run view <RC run> --json jobs --jq '.jobs[]\|[.name,.startedAt,.completedAt]'` | Total < 25 min, or the budget amended (B09-04); `upgrade-e2e (windows-latest)` below `timeout-minutes: 30` | ARC-09-S08 AC6 |
| 0.5 | `./snowarch version` on the RC checkout | `./snowarch version` and `./snowarch version --json` | Six lines; contract sha and docs pin equal the tag's; `contractMatches: true` | ARC-09 R1, S04 |

### Step 1: tree, history and licence (ARC-01, ARC-04, ARC-10)

| # | Check | Command | Expected | Source |
|---|---|---|---|---|
| 1.1 | Import tags | `git tag -l 'import/*'` | `import/engine-v2.8.0-worktree`, `import/snow-mcp-1.0.0`; `git log` on `packages/snowarch/src/server.ts` and `CLAUDE.md` reaches dd005fa and 51af231 | ARC-01 README-4, ARC-10 AC4 (v2.0.0 half stays deferred) |
| 1.2 | Lockfile | `node -e "const l=require('./package-lock.json');console.log(l.lockfileVersion, Object.keys(l.packages).filter(k=>l.packages[k].link).join(','))"` | `3 packages/snowarch,tools/snowarch` | ARC-01-S05 AC5 |
| 1.3 | minimatch override | `npm explain minimatch --workspace packages/snowarch` | Only minimatch@10.x | ARC-01-S05 AC8 |
| 1.4 | Licence files | `cmp LICENSE packages/snowarch/LICENSE; echo $?`; `sha256sum LICENSE` | Exit 0; sha256 starts `cfc7749b` | ARC-01-S08 AC2, ARC-00 R9 |
| 1.5 | Licence grep | `git grep -iE 'source available\|all rights reserved\|not licensed for redistribution\|license: MIT\|SEE LICENSE IN LICENSE' -- . ':!LICENSE' ':!NOTICE' ':!docs/decisions' ':!docs/plans' ':!docs/spikes' ':!docs/ARCHITECTURE.md'`; `grep -ci 'source.available' docs/decisions/ADR-0002-licence.md` | Empty; ≥ 1 | ARC-01-S08 AC1 |
| 1.6 | Leaf cuts | `test ! -e docs/LIVE-ARTEFACTS-CATALOGUE.md`; `for p in desktop clients .github Dockerfile server.json smithery.yaml glama.json TERMS.md docs/CLIENT_SETUP.md docs/index.html package-lock.json .gitignore; do test ! -e packages/snowarch/$p \|\| echo PRESENT $p; done` | Nothing printed | ARC-01-S10 AC1, S03 AC3 |
| 1.7 | Templates | `ls reference/ 2>/dev/null; ls docs/templates/*.md \| wc -l`; `git log --follow --oneline -- docs/templates/adr-template.md \| tail -1` | No `reference/`; six templates; history reaches 5b40835 | ARC-01-S09 |
| 1.8 | Allow-list | `cat tests/legacy-names.allowlist.json` | Five rows, all owner ARC-10; no ARC-02 or ARC-04 row | ARC-02 R9, ARC-04 R14 |
| 1.9 | Scope-cut ledger and constants | Read `docs/ARCHITECTURE.md` §"Removed in ARC-01-S03" / §"Deferred to ARC-04-S01" and the "Product constants" table against `engine.config.json` leaf keys | Every leaf key has a row; the 12 leaf + 8 deferred items appear by name | ARC-01-S12 AC1/AC2 |
| 1.10 | scripts/legacy references | `git ls-files scripts/legacy \| wc -l`; `git grep -n 'scripts/legacy' -- . ':!docs/plans' \| grep -v 'import/engine-v2.8.0-worktree:'` | 0; only docs/ARCHITECTURE.md (after B10-01) | ARC-10-S03 AC1 |
| 1.11 | Standing rule grep | `grep -rn "Standing Rule\|nowaikit-field-notes" CLAUDE.md docs` | Only CLAUDE.md:119 (rewritten rule), docs/CONTRIBUTING.md history paragraph, frozen CHANGELOG/RELICENSING history | ARC-10 AC5 |
| 1.12 | Footprint | Read CI job `footprint (production install)` on the RC run | ≤ 80 MB | ARC-01 README-6, ARC-04 S01 |

### Step 2: spike records and decisions (ARC-00)

| # | Check | Command | Expected | Source |
|---|---|---|---|---|
| 2.1 | 03 status columns | `grep -E '^\| S-' docs/plans/03-RISKS-AND-UNKNOWNS.md \| grep -ci unverified` | 0 (today prints 1; after B00-01); every S-01 to S-20 row has Status and an existing Evidence path (`test -f` each) | ARC-00 R1, S14 AC1 |
| 2.2 | Register vs records | The diff from B00-02 | Empty | ARC-00-S14 AC7 |
| 2.3 | ADRs | `grep -n 'Status' docs/decisions/ADR-000[1-8]*.md`; `grep -n 'DECIDED 2026-09-04' docs/decisions/ADR-000[1-6]*.md` | Seven (plus ADR-0008) present; ADR-0001 to 0005, 0007 Accepted with DECIDED text; ADR-0006 "Accepted (2026-09-08) — monorepo path confirmed"; ADR-0002 Accepted 2026-09-07; ADR-0009 Accepted 2026-09-08. Decision-owner rows read PENDING OWNER until Sitting (section 4) | ARC-00 R7, R10, ARC-05-S11 |
| 2.4 | Seed and floors | `node -e "const s=require('./docs/spikes/engine.config.seed.json'),e=require('./engine.config.json');console.log(s.floors, e.floors)"`; `grep -n '^`S-11' docs/spikes/S-11-claude-code-floor/README.md` | floors.claudeCode 2.1.214, floors.git 2.34.1 in both; S-11 verdict line CONFIRMED (after B00-03) | ARC-00 R8, S11 AC3 |
| 2.5 | Relicensing | Read `docs/spikes/licence/RELICENSING.md` §3, §4, shortlog blocks (lines 42, 50), npm-record sentence (line 31) | Consent "yes, agreed" CLOSED 2026-09-07; owner confirmation 2026-09-06; `@farstic/snow-mcp@1.0.0` untouched (also Sitting E5) | ARC-00 R9 |
| 2.6 | S-14 / S-19 verdicts | `grep -n '^`S-14\|^`S-19' docs/spikes/S-14*/README.md docs/spikes/S-19*/README.md` | Verdict lines present and dated within the time-box; S-19 CONFIRMED (cited by ci.yml job `plugin validate`) | ARC-00 R10 |
| 2.7 | Q-B sentence, R-15, propagation, sign-off | `grep -n 'Q-B' docs/plans/01-TARGET-ARCHITECTURE.md docs/plans/ARC-09-*/README.md`; `grep -n 'R-15' docs/plans/03-RISKS-AND-UNKNOWNS.md`; `grep -in propagation docs/spikes/README.md`; `grep -n 'ARC-01 entry\|ARC-06 entry' docs/plans/ARC-00-spikes-and-gating-decisions/README.md` | All present (after B00-05 to B00-08) | ARC-00-S14 AC3/4/6/8 |
| 2.8 | S-07 recipe (optional, heavy) | Run the three recipe scripts per `docs/spikes/S-07-docs-submodule/README.md` Procedure on the OS at hand | Recipe C about 302 MB macOS / 305 MB ubuntu / 315 MB windows; wall time in the recorded range | ARC-00 R5 |

### Step 3: engine surface (ARC-02)

| # | Check | Command | Expected | Source |
|---|---|---|---|---|
| 3.1 | Skill bodies vs import | `git worktree add /tmp/old import/engine-v2.8.0-worktree && node scripts/validation/compare-skill-bodies.mjs /tmp/old/.claude .claude` (path per README; use the scratchpad if `/tmp` is not permitted) | `bodies identical: 62/65` with the three attributable files named; 56/56 with `## Triggers` excluded | ARC-02 R1, S01 AC2, S03 AC3 |
| 3.2 | CLAUDE.md budget and markers | `wc -l CLAUDE.md`; `grep -c 'Task tool' CLAUDE.md governance/*.md .claude/agents/*.md`; `grep -rn 'Tier [0-9]' CLAUDE.md governance docs .claude tests`; `grep -c '^\*\*Version:\*\* ' CLAUDE.md` | ≤ 200 (live 130); 0; only anchored exemptions; 1 | ARC-02 R3, R10, S04 AC5 |
| 3.3 | Skill listing (needs `claude` on PATH) | `node --test tests/skill-listing.test.mjs`; then in a fresh session `/snowarch status` and plain `Status` | 28/28 roster skills (29 with snowarch) register with a description, under budget; both commands return the doctor's `Mode:` line | ARC-02 R2, S11 |
| 3.4 | Design-only validation run | Run T-01 to T-18 from `tests/VALIDATION-TESTS.md` on the RC (CLI version recorded); write `docs/spikes/validation-runs/<date>-design-only.md` (precedent: 18/18 at 31b3c97 on 2.1.258) plus the two-turn T-01 record; run the T-01 structure regression (`scripts/validation/t01-regression.mjs`, seven-element set after B02-03) | 18/18 PASS; T-01 structure equals the contract set | ARC-02 R6, R7, S13 AC5, S08 AC6 |
| 3.5 | Roster generation | `node scripts/gen-all.mjs --check` | Exit 0; `docs/ARCHITECTURE.md` ROSTER block shows 28 skills / 9 agents / 1 utility | ARC-02 R8 |
| 3.6 | Engine lint | `node packages/contract/lint/engine-lint.mjs` (full) and `npm run lint:contract` | Pass; L01-L03 required (`NAME_CHECKS_REQUIRED=true`) | ARC-02 R4, ARC-05 R4 |
| 3.7 | Odds and ends | `git ls-files '*example.json' \| wc -l`; `grep -n 'Known limitations carried from snow-mcp 1.0.0' packages/snowarch/CHANGELOG.md`; `grep -c 'docs/MODES-AND-PRESETS.md' CLAUDE.md` | 0; line 571 present; 1 (after B02-04) | ARC-02-S05 AC6, S10 AC4, S09 AC4 |

### Step 4: docs corpus (ARC-03)

| # | Check | Command | Expected | Source |
|---|---|---|---|---|
| 4.1 | Sync and verify | `./bootstrap.sh --docs sparse` (fresh clone) then `./snowarch docs verify`; `du -sh vendor/ServiceNowDocs` | `checked: ≥ 160 \| dead: 0` (last dry run: 180); tree ≤ 350 MB | ARC-03 R1 |
| 4.2 | Network negatives (fresh clone, no vendor/ServiceNowDocs) | `HTTPS_PROXY=http://user:pw@127.0.0.1:9 node tools/snowarch/bin/snowarch.mjs docs sync; echo $?` then `SNOWARCH_DOCS_UPSTREAM=https://nonexistent.invalid/x.git node tools/snowarch/bin/snowarch.mjs docs sync; echo $?` | `cannot reach proxy 127.0.0.1:9 (HTTPS_PROXY)` (never `pw`), exit 5; DNS message, exit 5; `ls vendor/ServiceNowDocs` still absent | ARC-03-S05 AC8 (B03-04) |
| 4.3 | Missing corpus | Move vendor/ServiceNowDocs aside; `./snowarch docs verify; echo $?`; `./snowarch doctor` | Exit 3 with `corpus missing — run ./bootstrap.sh --docs sparse (or ./snowarch docs sync)`, never SKIP; doctor E-12 FAIL | ARC-03 R2, R7 |
| 4.4 | Pin equality | `git ls-tree HEAD vendor/ServiceNowDocs`; `node -e "console.log(require('./engine.config.json').docs.pin)"` | Same sha (11b39be at review time) | ARC-03 R3 |
| 4.5 | Family dry run | `./snowarch docs family zurich --dry-run`; then bare `./snowarch docs family zurich; echo $?` | Exact edits printed; bare invocation exit 2 `refusing to apply without --yes`, `git status --porcelain` empty | ARC-03 R6, S08 AC2 |
| 4.6 | Retired areas grep | `grep -rn "itam-subscrip-summary\|subscription-itam-licensing\|markdown/now-assist" .claude governance docs CLAUDE.md` | Nothing | ARC-03-S04 AC2 |
| 4.7 | Read-through | `docs/ARCHITECTURE.md` §"Docs corpus: how the pin, the areas file and the gate relate" (line 117) answers its two questions | Yes/no recorded | ARC-03-S10 AC5 |

### Step 5: MCP server (ARC-04)

| # | Check | Command | Expected | Source |
|---|---|---|---|---|
| 5.1 | contract --sha | `node packages/snowarch/dist/cli/index.js contract --sha` twice; `shasum -a 256 packages/snowarch/dist/contract.json` | 64 hex + newline, identical, equals the file sha; `contract --json` toolCount 397 (at review) | ARC-04 R8, S06 c3 |
| 5.2 | CLI command set | `node packages/snowarch/dist/cli/index.js --help` | start · instance · store · doctor · contract (per packages/snowarch/README.md § CLI) | ARC-04-S01 c5 |
| 5.3 | Gate spot-check | `node -e` over `dist/contract.json` for the eight tools | records_query none/false; record_add write/true; script_include_add scripting/true; script_include_read none/false; atf_test_exec atf/true; na_summary_generate now_assist/false; instance_switch none/false; capture_target_set write/true | ARC-04-S06 c6 |
| 5.4 | dist hygiene | `git ls-files packages/snowarch/dist \| wc -l`; `git ls-files packages/snowarch/dist \| grep -c '\.map$'`; `du -sh packages/snowarch/dist`; `git check-attr -a packages/snowarch/dist/server.js`; `node scripts/build-dist.mjs && git diff --exit-code --stat -- packages/snowarch/dist` | 164 files; 0 maps; ≤ 6 MB (1.9 MB); eol lf, linguist-generated true; no diff | ARC-04 R13, S13 c4/5/6 |
| 5.5 | Unconfigured start | `npx vitest run --no-coverage tests/server/unconfigured.test.ts tests/server/handshake.test.ts` in packages/snowarch without a build | Five core tools, NO_INSTANCE_CONFIGURED elsewhere, exit 0 on stdin close; version 2.0.0-rc.1 (test asserts the package version) | ARC-04 R1 |
| 5.6 | Legacy literals in src | `grep -rn "servicenow-mcp\|claude-servicenow-live\|NowAIKit\|nowaikit" packages/snowarch/src` | Only `src/cli/import-legacy.ts:49,54,58` (after B04-05 amendment) | ARC-04-S01 c4, S02 c6 |
| 5.7 | CHANGELOG headings | `grep -n '^## \|^### ' packages/snowarch/CHANGELOG.md \| head -20` | Breaking / Added / Fixed / Tests / Migration from snow-mcp 1.0.0 (lines 17-129 at review) | ARC-04-S14 c4 |
| 5.8 | Doctor (server) | `node packages/snowarch/dist/cli/index.js doctor --no-network --json` on a valid 0600 store; then `chmod 644` the store and repeat | Clean, no secret; SV-02 fail with the chmod remedy, exit 1 | ARC-04 R12, R9 |
| 5.9 | Coverage demonstration (optional) | Add an uncovered branch to `src/utils/permissions.ts`, run `vitest run --coverage`, revert | Exit 1 on the 100 % threshold | ARC-04-S03 c7 |

### Step 6: contract gate (ARC-05)

| # | Check | Command | Expected | Source |
|---|---|---|---|---|
| 6.1 | Contract test duration | Read the `contract (windows-latest, node 20)` cell log on the RC run for contract.test.ts | Under 30 s | ARC-05-S08 AC7 (B05-06) |
| 6.2 | Skip-build gate | `node scripts/contract-gate.mjs --skip-build` | `CONTRACT GATE:` line without `dist ok`; steps (2) to (4) run | ARC-05-S09 AC5 |
| 6.3 | Loader | `node -e "import('./packages/contract/lib/contract.mjs').then(m=>console.log(m.flagNames(m.loadContract()).length))"` | 6 | ARC-05-S10 AC1 |
| 6.4 | Drill hygiene | `git branch -a \| grep drill`; `git log --all --oneline \| grep drill`; `grep -c 'retired-name: historical' docs/CONTRIBUTING.md` | Empty; only 9109886/0b1966a docs commits; 0 | ARC-05-S11 AC4/AC5 |
| 6.5 | Drill outputs present | Read `docs/CONTRIBUTING.md` §"Drill outputs — 8 September 2026" scenarios 1 to 6 | Each names an L-id or contract.test assertion; scenario 6 names the S-18 verdict and "No fallback is in force" | ARC-05-S08 AC2/3, S09 AC1/2, S11 AC1/2 |
| 6.6 | Retired identifiers | `node packages/contract/gen-retired-names.mjs --check` | Exit 0 (count 401 at review) | ARC-05-S02 |

### Step 7: throwaway CI runs (ARC-06, ARC-09; optional where standing evidence is accepted)

Each is one branch or PR, closed after the run; record the run URL (no other identifiers) in the
story's amendments.

| # | Check | Steps | Expected | Source |
|---|---|---|---|---|
| 7.1 | Bootstrap writes a root file | PR making `bootstrap.sh` write a tracked root file | `bootstrap` cells red on assertion 2 (`git status --porcelain`) | ARC-06-S14 AC2 (precedent recorded in CONTRIBUTING "What CI proves about the install") |
| 7.2 | Broken dist/server.js | PR with a broken `packages/snowarch/dist/server.js` | `no-build handshake` and "The committed dist/ answers a handshake on this OS" red | ARC-06-S14 AC4 |
| 7.3 | Broken bootstrap.cmd | Branch with a `goto` label typo in bootstrap.cmd | Exactly the three `windows-native (node N, no Git Bash)` cells red; others green | ARC-09-S08 AC5 (B09-03) |
| 7.4 | No git on PATH | windows-latest branch run with `C:\Program Files\Git\cmd` also stripped | `.\bootstrap.cmd --mode design --yes` exits 3 with the `git ≥ 2.25 not found` remedy | ARC-09-S08 AC4 (B09-02) |
| 7.5 | Bash launcher negatives | If B06-05 to B06-07 are not merged as CI steps, run them by hand on macOS/Linux with Node hidden: `--mode live` → exit 3, no `.local/`; seeded settings.local.json → exit 1 then `ok B07: already set`; from `clients/acme/` → exit 3 with the `cd` remedy | As stated | ARC-06-S10 AC4/5/8, S11 AC7 |

### Step 8: release and upgrade (ARC-09)

| # | Check | Command | Expected | Source |
|---|---|---|---|---|
| 8.1 | Stale dist / failing lint refusal | On a scratch branch: edit a dist file, `node scripts/release.mjs 9.9.9 --dry-run --offline --no-install --allow-branch` | Non-zero, no commit, no tag; same for a planted lint failure | ARC-09 R2 |
| 8.2 | Upgrade harness | Read CI job `upgrade-e2e` (ubuntu/macos/windows) on the RC run | Green: AC 1 (only B02 re-runs, instances.json sha unchanged), AC 2 (schema migration with 0600 backup), C13 released shape | ARC-09 R3, R4 |
| 8.3 | EOL | Read CI job `eol` (ubuntu, windows) on the RC run; locally `git ls-files --eol -- bootstrap.ps1 bootstrap.cmd snowarch.cmd bootstrap.sh` | i/lf w/crlf for the launchers, i/lf w/lf for .sh | ARC-09 R6 |
| 8.4 | version --json shape | `grep -n 'docsFamily' tools/snowarch/tests/cli.test.mjs` | The ARC-06-S02 five-key test located (else B09-06) | ARC-09-S04 AC4 |
| 8.5 | npm channel doc | Read `docs/CONTRIBUTING.md` §"The npm channel (optional)" | All five statements present | ARC-09-S10 AC5 |
| 8.6 | release-dryrun shell | Inspect the windows-latest `release-dryrun` step shell | `pwsh` (after B09-07) or the AC amended | ARC-09-S01 AC8 |

### Step 9: migration docs (ARC-10)

| # | Check | Command | Expected | Source |
|---|---|---|---|---|
| 9.1 | S02 PR trace and paths | `gh pr view <S02 PR> --json body \| grep -c 'docs.claude.com'`; `grep -nE '(/Users/\|/home/\|C:\\Users)' docs/CONTRIBUTING.md` under § Engagements and memory | ≥ 1; none | ARC-10-S02 AC4 |
| 9.2 | Four homes examples | `ls packages/snowarch/tests/servicenow/client-orderby.test.ts && grep -n '^## PN-07' docs/PLATFORM-NOTES.md && grep -n 'PROXY_UNREACHABLE' docs/TROUBLESHOOTING.md` | All three resolve | ARC-10-S04 AC3 |
| 9.3 | Cutover list | `grep -n 'design-only' tests/VALIDATION-TESTS.md` in the cutover-list region | Banner Mode: design-only; /mcp shows the server disabled; no MCP call in T-05/T-06; /snowarch setup-instance hand-off | ARC-10-S07 AC3 |
| 9.4 | Migration page from the doctor fixture | `node --test tests/migration-doc.test.mjs` | "AC 2 — every command the legacy checks print appears in the page" passes | ARC-10 AC6 |
| 9.5 | README pointer | `grep -n 'docs/MIGRATION.md' README.md docs/INSTALL.md` | README.md:18, docs/INSTALL.md:12 | ARC-10 AC3 (link half) |

### Step 10: close the RC run

1. Commit `docs/validation/<date>-<os>.md` per OS (lint passes), and the ARC-02 record under
   `docs/spikes/validation-runs/`.
2. Update each ARC README tick list and `docs/plans/05-STORY-INDEX.md` in the same PR (owner
   directive: status records current, never batched).
3. Run the RTM gap report (governance-rules.md §4.2) and list every criterion still open; only
   sitting-kind items may remain.
4. Hand section 4 to the owner with a proposed date. Nothing else remains before v2.0.0 except the
   sittings and the post-tag items in section 5.

## 4. Sittings (owner and executors only)

This is the list handed to the owner when sections 2 and 3 are done and green. Grouped by the
sitting named in `docs/spikes/OWNER-SITTING.md`; where a reader did not name the sitting, the item is
placed by its nature and marked "verify placement". Items already completed in the 2026-09-07 sitting
are listed with their status so the owner can skip them.

### Sitting A: existing user (the owner's own machine)
**D1 to D5 placement, resolved 2026-09-12.** The `§ D` references below are correct and are NOT the
Windows sitting. `docs/spikes/OWNER-SITTING.md` carries two different things whose names collide:
`## Sitting D — Windows (when a machine exists)` at line 502, and six per-story doctor sittings
interleaved with Sittings A/B/C by the machine state each needs — `## D1.` ARC-08-S02 (line 89),
`## D2.` ARC-08-S03 (373), `### D2b` ARC-08-S04 (409), `## D3.` ARC-08-S08 (193), `## D4.` ARC-08-S09
(227), `## D5.` ARC-08-S10 (430). The reader's doubt was reasonable and the answer is that the rows
are placed right; the naming collision is the real finding, and it is worth renaming the per-story
sections (`DR-1`…, say) before anyone runs them from this table.


| Source story / criterion | What the owner does | Reader's location in OWNER-SITTING.md | Status |
|---|---|---|---|
| ARC-06-S01 AC5 | The registration sitting, item A1 | "The registration sitting" | open |
| ARC-06-S05 AC6 | Registration sitting item 4 (toggle semantics; S-01 A1 CONFIRMED 2026-09-07 on 2.1.258) | "The registration sitting" | partly done |
| ARC-06-S12 AC1, AC2, AC4, AC5, AC6 | Mode switching / `--register` in a real session (code halves tested by mode-steps, mode-register, mode-report) | "The registration sitting" | open |
| ARC-06 R1 (`/mcp` + `/snowarch status` half), ARC-06-S10 AC1, ARC-06-S13 AC1 | Reader two of the install page (reader one, the architect with Node hidden, is recorded) | Sitting A | open |
| ARC-06 R3 | A fresh user with Node 22 completing live mode: B06 wizard and B08 against an instance (see also C) | rows "The wizard against a real instance (ARC-07-S05)", "The live E2E suite (ARC-07-S11)" | open |
| ARC-09 README "real upgrade on a lived-in machine" | `./snowarch upgrade` on the owner's machine from v2.0.0-rc.1 to v2.0.0 | Sitting A install rows | open (post-tag) |
| ARC-02-S09 AC5, ARC-07-S10 AC5 | Owner read-through of docs/MODES-AND-PRESETS.md; password managers | "The password managers, and one read-through"; ARC-07-S10 read-through row (lines 180-186) | open |
| ARC-04-S14 c5 | Someone other than the author registers the server with a generic MCP client and calls `snow_core_status_read`, recorded | not listed (B04-08 proposes folding into A) | open, verify placement |
| ARC-10-S10 AC1 (GitHub-rendering half) | The two issue forms as a stranger meets them | § A6 | open |
| ARC-08-S02 AC1 / README-1 | `./snowarch doctor` reports 0 FAIL on a machine with `claude` installed (CI tolerates exactly E-00) | § D1 (OWNER-SITTING section label; not the Windows sitting; verify placement) | open |
| ARC-08-S08 AC6, AC7 / README-5 | The SessionStart banner line quoted from a real session; Node-absent fallback by hand | § D3 (verify placement) | open |
| ARC-08-S09 AC1 to AC6, ARC-05-S05 AC7 | `/snowarch status` rendered in four real sessions | § D4 "ARC-08-S09 — /snowarch status in four real sessions" (verify placement) | open |
| ARC-08-S03 AC8 (real-machine sentence) | E-23 stale-registration report on the owner's real `~/.claude.json` | § D2 (verify placement; Windows `claude mcp get` half goes to D) | open |
| ARC-00-S03 AC1, ARC-00 R11 | Initial the eight ADR Decision-owner rows and the ARC-00 gate sign-off block | not yet a row (B00-08/B00-09 add it) | open |
| ARC-00 R3 2.1.214 cell, ARC-00-S11 AC2 | One-session pass on 2.1.214 | OWNER-SITTING archive marks the floor repeat OPTIONAL | optional |

### Sitting A, clean machines (executors other than the author)

| Source story / criterion | What is done | Location | Status |
|---|---|---|---|
| ARC-06 R6, ARC-06-S13 AC2 | Path B from an empty folder, a profile without user-level CLAUDE.md / user-scope MCP servers | "Path B cannot be measured from this account (ARC-06-S13)" | open |
| ARC-10-S08 AC1 to AC7, ARC-10 README-AC2 | Three clean machines (macOS, Ubuntu, Windows) reach `Mode: design-only` from the install page alone; one reaches `Mode: live (pdi-developer)` against a PDI; one proxied laptop; records committed as `docs/validation/<date>-<os>.md` | README: post-tag sitting; Sittings A / C / D adjacent | open (post-tag) |
| ARC-10-S06 AC1 to AC7, ARC-10 README-AC1, README-AC4 (v2.0.0 half) | Author's machine cutover on v2.0.0 following docs/MIGRATION.md: doctor 0 FAIL, no stale `~/.claude.json` entry, `~/.config/servicenow-mcp/` absent, engagement folders untracked; record `docs/validation/<date>-author-cutover.md`; flip the v2.0.0 assertion in `tests/architecture-history.test.mjs` | README: post-tag sitting | open (post-tag) |

### Sitting B

No reader assigned a criterion to Sitting B, but **Sitting B is not empty** — checked 2026-09-12:
`docs/spikes/OWNER-SITTING.md:150` defines it ("Design-only in a real Claude session") and it carries
six rows of its own, `## B0.` setup plus `## B1.`–`## B5.` (lines 771–868), all ARC-00 `S-14a`–`S-14d`
spike questions. **B1 to B4 are marked ANSWERED; B5 is not** — *"S-14a, the second half — the
in-session install (do this only now)"* is the one row of this sitting still outstanding. So the gap
was in the reader pass, not in the sitting list: B's rows belong to ARC-00's spikes and were never
mapped to an ARC's acceptance criteria.

### Sitting C: live (the owner's PDI)

| Source story / criterion | What is done | Location | Status |
|---|---|---|---|
| ARC-04 R6, ARC-04-S07 c4, ARC-04-S10 c1 (`result:"ok"`) | The §2.2 capture chain end to end: `capture_target_set` then a write produces a `sys_update_xml` row in the named set, with negative control; last audit line `result:"ok"` | `packages/snowarch/tests/live/README.md` §"ARC-04-S07 criterion 4 — the §2.2 capture chain end to end"; not yet named in Sitting C (B04-09) | open |
| ARC-04-S09 c2, c3, c4 | `orderBy "-sys_created_on"` descending on a live table with ascending control | tests/live/README.md §"ARC-04-S09 … Criterion 2" | open |
| ARC-04-S03 c1 (live half) | Switch prod → write refused, switch pdi → write succeeds, `RUN_LIVE_E2E=1` | procedure missing (B04-01) | open |
| ARC-04-S05 / S-10 | Read-only preset sufficiency | `docs/spikes/S-10-readonly-preset-sufficiency/PROCEDURE.md` (status NOT RUN) | open |
| ARC-04-S08 c3 (live half) | tools/list byte-identical before and after `snow_disco_table_discover incident` | procedure missing (B04-02) | open |
| ARC-04-S04 c7 | S-17 unconfigured server: CONFIRMED on 2.1.258; Ubuntu row NOT RUN | `docs/spikes/S-17-unconfigured-server/README.md` | Ubuntu row open |
| ARC-05 R8, ARC-05-S07 AC5 | The generated ask block actually prompts for a mutating tool in auto mode, on this build (S-18 CONFIRMED with control on 2.1.258, Part C) | tests/live/README.md §"ARC-05-S07 criterion 5 — the ask block actually prompts (after ARC-06)" | re-run on RC |
| ARC-02-S04 AC6 | Live sub-agent tool list | explicitly deferred by the story to Sitting C / live CI | open |
| ARC-07 R1, ARC-07-S05 AC1, AC2 | The wizard against a real instance: credentials typed, nothing echoed, five probes ok, store 0600/0700, six flags, toolPackage full, maxRecords 100 | "The wizard against a real instance (ARC-07-S05)" items (1) to (3) | open |
| ARC-07-S11 AC2, AC3, AC4, AC5, ARC-07 R2 (lockout half) | The live E2E suite (`.github/workflows/e2e-live.yml`, `RUN_LIVE_E2E=1`, five secrets provisioned): cases incl. three wrong passwords with no PDI lockout; capture `tests/fixtures/oauth-ropc-errors.json` (item (d)); first execution of "Refuse to publish a log that contains a secret" | "The live E2E suite (ARC-07-S11)" items (a) to (d) | open |
| ARC-07-S02 (real-network diagnoses) | The two network diagnoses that need a real network | "The two network diagnoses that need a real network (ARC-07-S02)" | open |
| ARC-07-S08 | `import --from-legacy` against a REAL 1.x store | "A REAL legacy store (ARC-07-S08)" | open |
| ARC-07 R6, ARC-07-S09 AC1 to AC6 | T-20 and T-21, the four manual passes (`/snowarch setup-instance` never asks for a password; printed command identical; `--resume` ends with `Mode: live`) | "T-20 and T-21, the four manual passes (ARC-07-S09)" | open |
| ARC-08 README-8, ARC-08-S10 AC3, AC4, AC5 | T-19 and T-22 live and dormant: a session stops on AUTHENTICATION_FAILED and prints the set-credentials remedy | § D5 (verify placement) | open |
| ARC-08-S04 AC1 (live half), AC8 | Server checks with `RUN_LIVE_E2E`; store sha unchanged after a live run | § D2b (verify placement) | open |
| ARC-06 R3 (B06/B08 against an instance) | see Sitting A row; same procedure | | open |

### Sitting D: Windows (needs a Windows machine, roadmap §9 input #2)

| Source story / criterion | What is done | Location | Status |
|---|---|---|---|
| ARC-00-S01 AC3, AC4, AC5 (Windows rows) | Windows VM with `where bash` empty, both Claude Code versions, clean / no-node / gpo-allsigned / gitbash snapshots | docs/spikes/README.md §2.3; 04-ROADMAP §9 row 2 | open (blocks the rest of D) |
| ARC-00 R4, S-03, S-04, S-08, Q-B | Rows (3) S-03, (4) S-04, (5) GPO MachinePolicy; Q-B outcome written into 01 §13 and ARC-09 | Sitting D | open |
| ARC-00 R2 (Windows half of S-20) | HTTPS_PROXY / NO_PROXY / NODE_EXTRA_CA_CERTS reach the spawned server on cmd and PowerShell 5.1; `${HTTPS_PROXY:-}` when unset | S-20 README:118 DEFERRED | open |
| ARC-00 R3 (Windows cell of S-01) | Dialog count on first `claude` after live pre-seeding | S-01 record | open |
| ARC-00 Windows halves of S-05, S-06 | per 03 §F | | open |
| ARC-06 R2, ARC-06-S11 AC1, AC4 | Rows (1) double-click bootstrap.cmd, (2) Ctrl-C, (5) GPO MachinePolicy on a clean Windows 10/11 without Git Bash | Sitting D rows (1), (2), (5) | open |
| ARC-02-S11 AC9, ARC-02-S13 AC6 | `/snowarch` skill and the routing subset of T-01 to T-18 on Windows | OWNER-SITTING lines 1092, 1093 "DEFERRED — Windows VM pending" | open |
| ARC-07 R9, ARC-07-S01 AC6 | S-04 masked-input matrix (8 cells; `WINDOWS_KNOWN_BAD` ships empty in `packages/snowarch/src/cli/tty.ts:83`); fallback `--password-stdin` documented | "S-04, the masked-input matrix (ARC-07-S01)" | open |
| ARC-07-S07 | Known Folder Move detection | "Known Folder Move (ARC-07-S07)" | open, verify placement |
| ARC-08-S03 AC8 (Windows half) | `claude mcp get` on Windows | § D2 | open |
| Release-note fallback | If D does not run before v2.0.0, the release note says "Windows: proven in CI, not by a person" (pre-written in OWNER-SITTING, asserted by tests/owner-sitting.test.mjs) | Sitting D exit criterion | decision for the owner |

### Sitting E: npm channel

| Source story / criterion | What is done | Location | Status |
|---|---|---|---|
| ARC-09-S10 AC1, ARC-09 README "first publish-npm dispatch" | E1 to E5: first `publish-npm` dispatch with `dry_run:true`; NPM_TOKEN deferred by owner decision 2026-09-11 | Sitting E | open |
| ARC-01-S03 AC6 | `npm view @farstic/snow-mcp` shows 1.0.0 untouched (guarded meanwhile by tests/publish-target.test.mjs) | E5 | open |

### Post-tag owner runs not in OWNER-SITTING.md

| Source story / criterion | What is done | Where recorded | Status |
|---|---|---|---|
| ARC-10-S09 AC1, AC2, AC3, AC5, ARC-10 README-AC3 (notice + archive halves) | Post the deprecation notices on both old repositories and archive them, following the six-item checklist (`tests/predecessor-notice.test.mjs`) | docs/CONTRIBUTING.md § Retiring the predecessors; S10 review record | open (post-tag) |
| ARC-10-S10 AC3, AC4, AC5 | Tag + 14 days review using `docs/validation/TEMPLATE-post-release-review.md` | same | open (tag + 14 days) |

Sitting-kind story criteria by ARC (for the owner's estimate of effort): ARC-00 31 (many archived as
done on 2026-09-07), ARC-01 1, ARC-02 4, ARC-04 3, ARC-05 2, ARC-06 14, ARC-07 14, ARC-08 14, ARC-09 1,
ARC-10 21; README sitting verdicts 16.

## 5. Not applicable / deferred

| Item | Disposition | Citation |
|---|---|---|
| ARC-00 S-10 and S-13 | Deferred to ARC-04-S05 / ARC-02 with the check quoted | `docs/plans/03-RISKS-AND-UNKNOWNS.md` "Check" cell: "deferred to ARC-04-S05 … ARC-00-S14 records the deferral" |
| ARC-00 R3 2.1.214 repeat, ARC-00-S11 AC2 | Optional | OWNER-SITTING archive "marks the floor repeat OPTIONAL" |
| ARC-00 R4 Windows cells proven in CI | Not evidence for S-03/S-04/S-08 | `docs/spikes/README.md` §2.3 says CI cells `windows-native (node N, no Git Bash)` and `bootstrap (no-gitbash)` are not evidence for the spikes |
| ARC-01-S02 AC 5, AC 4; S05 AC 2; S07 file contents; S11 AC 1, AC 6; S12 AC 4 | Superseded by design, not defects | ARC-01 reader notes: ARC-03-S01 / ARC-06-S01 commit .gitmodules, .mcp.json, .claude/settings.json; ARC-10-S03 deleted scripts/legacy; ARC-04-S01 prune to five deps; ARC-04-S13 / ARC-10-S03 gitignore edits asserted by never-commit "ARC-10-S03 AC 2" |
| ARC-01-S02 AC 2/3/8/9 | Point-in-time against the maintainer's old checkout; now stale | ARC-01 reader |
| ARC-02-S01 AC 5 | MOOT, replaced by `node scripts/docs.mjs verify` | ARC-02-S01 amendment |
| ARC-02-S05 AC 3 (README line count) | NOT-APPLICABLE: README is 307 lines because ARC-06-S13 made docs/INSTALL.md the README body, as S05's own disposition table foresaw; the live check is version-consistency "README head carries the root version" | ARC-02 reader, S05 disposition table |
| ARC-02-S10 AC 4 ticket comments | Ruled unnecessary | S10 amendment |
| ARC-03-S01 AC 1 pin literal `ba513f2` | Superseded by PR #78 (pin 11b39be); tests compare gitlink to config | ARC-03 reader |
| ARC-03-S05 module name | Delivered inside S03 as `sync.mjs`, not `checkout.mjs` | S05 amendment |
| ARC-03-S11 parity test name | `tests/docs-recipe.test.mjs`, not the planned `docs-recipe-parity.test.mjs` | ARC-03 reader |
| ARC-05-S07 AC 6 | Not needed: S-12 answered headlessly; `engine.config.json` allowStyle `explicit`; test "criterion 7 — the glob path renders, and is not what is selected" | OWNER-SITTING C3 RETIRED |
| ARC-08 README "candidate check" on docs-bump.yml `can_approve_pull_request_reviews` | Not an acceptance criterion; no check in the tree | ARC-08 reader |
| ARC-08-S02 AC 8 timing half, S05 `--quick` budget number | De-asserted by ARC-09-C24; replaced by the CI measurement step "C5 — where the doctor spends its time" (measured, not asserted) | ARC-08 reader |
| ARC-08 README-1 in CI | Tolerates exactly one FAIL (E-00, no Claude Code on hosted runners), asserted both ways by `scripts/ci/assert-doctor.mjs --expect-fail E-00`; 0 FAIL outright is a sitting | ARC-08 reader |
| ARC-09-S08 AC 7 | Not applicable: Q-B passed, no fallback shipped; needs the amendment (B09-05) | ARC-09 reader |
| ARC-09-S09 AC 4 | Amended to fixture repos (`AC 4a`/`AC 4b`), not throwaway PRs | ARC-09 reader |
| ARC-09-S05 AC 4 | Amended from a collector job to per-cell `scripts/ci/assert-input-hashes.mjs` | ARC-09 reader |
| ARC-09 README three human items | Explicitly un-ticked by the ARC: real v2.0.0 cut (maintainer), first publish-npm dispatch (Sitting E), real upgrade on a lived-in machine (Sitting A) | ARC-09 README |
| ARC-10 README-AC4 v2.0.0 half | Deferred until the tag; `tests/architecture-history.test.mjs` "the v2.0.0 half is deferred" asserts it does not yet resolve; flip at S06 | ARC-10 reader |
| ARC-10-S03 AC 3 "at most the README line" | Amended: allow-list now five entries, all ARC-10 | STORIES S03/S10 amendments |
| ARC-10 README criteria | All six unticked, consistent with no v2.0.0 tag in the clone | ARC-10 reader |
| ARC-07 | No criterion deferred by an ADR; nothing not-applicable | ARC-07 reader |

## 6. Counts

### 6.1 Totals

| Level | Count |
|---|---|
| README criteria (11 ARC READMEs) | 103 |
| Story criteria (132 stories) | 850 |
| **All criteria** | **953** |

### 6.2 By kind

| Kind | README | Story | Total |
|---|---|---|---|
| test | 58 | 520 | 578 |
| ci-cell | 18 | 83 | 101 |
| manual-rc | 10 | 123 | 133 |
| sitting | 17 | 105 | 122 |
| unknown (verify) | 0 | 19 | 19 |
| **Total** | **103** | **850** | **953** |

### 6.3 By verdict

README criteria (reader verdicts):

| Verdict | Count |
|---|---|
| covered | 81 |
| uncovered | 6 (ARC-00 R1, R8, R11; ARC-02 R1, R5, R7) |
| sitting | 16 |
| n-a | 0 |
| **Total** | **103** |

Story criteria: the readers classified every story criterion by kind and listed the uncovered ones
individually rather than giving a per-criterion verdict. Derived view:

| Verdict | Count | Basis |
|---|---|---|
| uncovered or verify (backlog rows) | 68 | Section 2, including all 19 "unknown" |
| sitting | 105 | Kind = sitting; listed in section 4 |
| covered (test / ci-cell / manual-rc with evidence) | 677 | 850 minus the two rows above; manual-rc items re-run in section 3 |
| n-a / superseded | counted inside "covered" | Section 5 lists them; the readers did not net them out of the 850 |

Blocking for v2.0.0 in order: 68 backlog items (section 2) → RC run (section 3, 10 steps, about 70
checks) → the owner's sittings (section 4) → tag v2.0.0 → post-tag items (ARC-10-S06, S08, S09/S10
run halves, Sitting E, tag + 14 days review).
