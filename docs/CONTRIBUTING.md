# CONTRIBUTING

First version, written at the ARC-01 close-out. It records the conventions the foundation stories
established and the reasons behind them — several exist because something went wrong once.

---

## The review model

Work happens on an **ARC branch** (`arc-NN/<name>`), is **reviewed by the architect on a fresh clone**,
and reaches `develop` by **pull request**. `main` is created only at a **milestone merge, with the
owner's explicit approval**. It did not exist during ARC-01, which is why the CI workflow triggers on
`main`, `develop`, `arc-*/**` **and** `chore/**`: a workflow watching only `main` would never have run.

**`main` exists as of 2026-09-08**, created from `793e58d` (the M1 milestone merge) once M1 was complete.
Recorded here as commands rather than as prose, so the next milestone repeats it instead of
reconstructing it:

```sh
git push origin 793e58d:refs/heads/main
gh api -X PUT repos/farstic/ai-servicenow-architect/branches/main/protection --input protection.json
gh repo edit --default-branch main
```

`protection.json` — the 12 required contexts are the `ci.yml` job names, not names invented for the
rule; a context that does not match a job name is a check that never reports and therefore never blocks:

```json
{"required_status_checks":{"strict":true,"contexts":[
  "test (ubuntu-latest, node 20)","test (ubuntu-latest, node 22)","test (ubuntu-latest, node 24)",
  "test (macos-latest, node 20)","test (macos-latest, node 22)","test (macos-latest, node 24)",
  "test (windows-latest, node 20)","test (windows-latest, node 22)","test (windows-latest, node 24)",
  "footprint (production install)","secret scan","plugin validate"]},
 "enforce_admins":false,"required_pull_request_reviews":null,"restrictions":null,
 "allow_force_pushes":false,"allow_deletions":false}
```

Proved rather than assumed: a force-push from a second clone is refused with **GH006**, deletion is
refused, `licenseInfo.key` reads `apache-2.0`, and CI on `main` is green. `enforce_admins:false` is
deliberate — the owner must be able to recover the branch without deleting the protection first.

**Never push to `develop` or `main` directly.** `develop` is protected (no force pushes, no deletions).

### Reporting a change

Two rules, both of which exist because a report was wrong in a way that looked right.

**Verify a push against the remote, never against the exit code.** `git push origin <branch>` pushes that
*ref*, not `HEAD`; if the branch ref is stale and already matches the remote, **the push is a no-op and
exits 0**. A report once said "pushed" on that basis while four commits sat on the wrong local branch.
The proof is:

```sh
git ls-remote origin refs/heads/<branch>
```

**Paste the literal command with its real output.** Not "PASS". A criterion once gained a clause that was
reported as passing and had never been executed — it returned 0 because the term it grepped for is
spelled differently in the file it grepped. And **if a report says a check is *automated*, it names the
file and the test, greppably**: a check that lives only in someone's shell history is not automated, and
that has happened here too.

---

## The roster lives in one place

**Skills and agents live only under `.claude/`; there is no mirror and no sync step.** The engine used
to commit a byte-identical copy at `skills/` and `agents/`, kept equal by `scripts/sync-agents-skills.sh`
and a pre-commit hook — and the gates scanned the *mirror* while Claude Code read `.claude/`. ARC-02-S01
deleted the mirrors, the sync script, the structure gate and the hook chain, and rewrote every path
reference. `tests/engine-config.test.mjs` keeps the counts honest: it asserts `engine.config.json`'s `roster` (28 skills, 9 agents) against the files actually on disk, so a lost or duplicated skill fails the build rather than drifting in prose.

## Versioning

**One version of record: the `version` field of the root `package.json`.** It is mirrored byte-exactly in
`packages/snowarch/package.json`, `tools/snowarch/package.json` and the `**Version:**` marker line in
`CLAUDE.md`. `tests/version-consistency.test.mjs` fails on any divergence, on a missing marker, on a
*duplicated* marker, and on a version token smuggled back into `CLAUDE.md`'s heading.

**Never edit a version by hand.** `scripts/release.mjs` (ARC-09) becomes the only writer. Before it
exists, a version change is a deliberate edit to all four places in one commit, with the test run.

Context for why this is enforced rather than trusted: P-12 counted **five** version counters in the
engine and P-19 **five more** in the server.

---

## What must never be committed

`.local/` (the per-checkout store; ADR-0004 puts `instances.json` there at mode `0600`), `clients/`,
`deliverables/`, `memory/`, `.env`, `.claude/settings.local.json`, and `reports/` — that last one is
ignored because it may quote live instance data, and it was deliberately kept when ARC-01-S07's exact
list would have dropped it.

`tests/never-commit.test.mjs` enforces this, and `tests/no-real-hostnames.test.mjs` additionally checks
that **no hostname in the tree is one the maintainer actually uses** — comparing against sources that are
never committed, reporting counts only, and *skipping with its reason* on a machine that cannot see them.

**`git add -f` does not help you.** The test scans `git ls-files`, so a force-added file is *more*
visible, not less: it fails the build by name. If a file genuinely belongs in the repository, the answer
is to change `.gitignore` in a commit someone reviews.

Two mechanical notes worth knowing:

- **`node_modules/` with a trailing slash does not ignore a *symlink* named `node_modules`.** A trailing
  slash matches directories only; pnpm and some yarn layouts symlink their store. Both forms are listed.
- **The credential scan is heuristic on purpose.** Structure is the real defence (D-04's store location);
  the scan is the net under it. Its allowance is four named rules — an all-caps token, a lowercase
  snake/kebab word, an **exact** generic word, and a named-fixture set with recorded provenance — rather
  than a prefix list that grows. Exact match, not prefix, so a real value merely *starting* with a
  generic word is still flagged.

---

## Secret scanning

CI runs `gitleaks` over the **full history** on every push. Two allowances, and they are different kinds:

- **`.gitleaks.toml`** excludes `vendor/ServiceNowDocs` by path — ServiceNow's own corpus, which trips
  **592** default rules (526 of them `curl -u user:password` examples in the REST API pages). The path is
  listed *before* ARC-03 creates it, so that merge cannot turn CI permanently red.
- **`.gitleaksignore`** lists **four findings by fingerprint** (`commit:file:rule:line`), each with its
  own comment. Not by rule id, which would blind the scan to every future finding of that kind; not by
  path, which would blind whole documents.

**Fingerprints go in `.gitleaksignore`, not in the TOML.** A `fingerprints` key inside `[allowlist]` is
not part of gitleaks' schema: it is **silently ignored**, so the config reads as correct and changes
nothing. That was caught only by re-running the scan locally.

**A value that cannot be certified as fabricated is rewritten out of history, not ignored.** ARC-01-S03
found a `SERVICENOW_CLIENT_SECRET` whose shape was indistinguishable from a real one; it was removed from
every commit with `git filter-repo --replace-text` before the import. Sanitising only the tip is *not*
sufficient — an import brings all ancestors, and a scan of the sanitised artefact still found the value
in the initial commit.

---

## CI

`.github/workflows/ci.yml` — four jobs, no secrets, no step declaring a `shell:`.

| Job | What |
|---|---|
| `test` | 3 OSes × Node 20/22/24, `fail-fast: false`: `npm ci --ignore-scripts`, `assert-clean`, `lint`, `type-check`, `test` |
| `footprint` | production install, gated on **summed file content** |
| `secret scan` | `gitleaks` over the full history, pinned to v8.30.1 |
| `plugin validate` | advisory; pinned to `@anthropic-ai/claude-code@2.1.258` |

**The footprint gate names its metric, and that matters.** `du` block-rounds and its semantics differ per
OS — the same tree reads **72 MB by `du` and 57.3 MB by summed content**. The gate sums content with
`node:fs` and prints the number it compared, so the figure is identical on every cell. ARC-04-S01's
dependency prune is expected to take it to ~27 MB.

**Runner images resolved on the first green run** ([run 34164741254](https://github.com/farstic/ai-servicenow-architect/actions/runs/34164741254), 2026-09-07, 12/12):

| Cell | Platform | Node |
|---|---|---|
| `ubuntu-latest` | `linux x64` | 20.20.2 · 22.23.2 · 24.20.0 |
| `macos-latest` | `darwin arm64` | 20.20.2 · 22.23.2 · 24.20.0 |
| `windows-latest` | `win32 x64` | 20.20.2 · 22.23.2 · **24.19.0** |

The `-latest` aliases move without notice; these labels are recorded so a future red run can be
attributed. **Note the Windows cell resolved Node 24 to 24.19.0 while the other two got 24.20.0** — the
matrix is not as uniform as `[20, 22, 24]` suggests.

**The Windows cell is not the "no Git Bash" proof.** The hosted image ships Git Bash. What that cell does
prove is narrower: no step calls a POSIX shell (Q-B). The genuine no-Git-Bash test needs a machine where
the shell is absent and belongs to ARC-09-S08.

**If a macOS cell ever needs to be cheap:** the repository is public, so hosted runners cost nothing
today. Should it ever become private, scheduling macOS on `main` only is the lever — recorded as an
option, not a default.

---

## Tests

`npm test` at the root runs `tests/run.mjs` (engine) and then each workspace's own suite.

`tests/run.mjs` computes its file list **in Node rather than with a shell glob**: on Windows npm runs
scripts through `cmd.exe`, which does no glob expansion, and whether `node --test` expands a glob itself
varies by Node line.

**A skipped test states its reason, and the reason is load-bearing.** Two skip deliberately today — the
`docs/CHANGELOG.md` ordering guard (the imported changelog reads *ahead* of the root version because the
product renumbered downward at the merge; it becomes a live assertion when ARC-09 regenerates the file)
and the `vendor/ServiceNowDocs` gitlink check (ARC-03 creates it). **A check that passes because its
subject is absent is not a check** — hence a skip with a reason rather than a silent pass.

**Run `gitleaks` after committing, not on a staged tree.** `gitleaks git` walks **commits**; staged and
unstaged changes are invisible to it, so a clean local run on a tree you have not committed proves
nothing about what CI will scan. Writing this very paragraph proved it: the sentence above originally
quoted the offending line verbatim, a local scan of the staged tree reported zero findings, and CI went
red on the quoted text — the documentation of the false positive reproduced the false positive. Note
also that a rewrite is not optional when this happens: a follow-up commit leaves the line in history,
where `gitleaks git` keeps finding it.

**Run the suite after `git add`, not before.** `tests/no-legacy-names.test.mjs` scans `git ls-files`,
so an untracked file is invisible to it. In ARC-02-S02 a new module carrying a forbidden token passed
locally and turned all nine CI cells red — `npm test` on an unstaged tree is simply not the check CI
runs. The same applies to any test that walks the tracked set rather than the working directory.

**Ask what shape the fixture cannot produce.** The single most repeated defect in this repo is a test
that passed because its fixture could not express the failing input. `mkdtempSync` only ever makes 0700
directories, so a test of the directory-mode rule went green against a rule that was wrong (ARC-04-S02).
A fake checkout created *inside* a fake HOME cannot exercise path masking, because the mask matched HOME
first and the checkout branch never ran (S02). No preset grants WRITE alone, so a tool declared `write`
that actually demanded SCRIPTING was never asked the one question that would expose it (S08). In each
case the assertion was reasonable and the fixture was the problem. Before trusting a green test, name
the input it cannot construct.

**Network tests use a closed loopback port — never `.invalid`, never port 1 or 9.** An unresolvable
hostname costs a DNS round-trip per call (about 1.4 s), which turned a ~130-call security sweep into a
four-minute test of the resolver (ARC-04-S10). And Node rejects the low well-known ports outright with
"bad port" *before* the request layer, so a test pointed at `127.0.0.1:1` never exercises the timeout or
retry path it was written for, while looking as though it did. A high closed port (49151) refuses in
about 20 ms and goes through the real code path.

**Tests are type-checked, and the coverage gate runs in CI.** `tsconfig.json` excludes `tests/`, so a
`@ts-expect-error` type test was passing by never being compiled — `npm run type-check` now runs
`tsc --noEmit` twice, the second time against `tsconfig.tests.json` (ARC-04-S06). Separately, `npm test`
was `vitest run`, so the per-file coverage thresholds were configured and never enforced; it is now
`vitest run --coverage` (S03). A gate that is not wired to a command is documentation.

**Probe scripts are Node, not shell.** GNU-only `sed -i` and `\s` forms silently no-op on macOS's BSD
`sed` — no error, no match, and a "fix" that changed nothing (found by the architect during ARC-04-S06).
The same applies to `python str.replace`, which returns the string unchanged when the indentation does
not match: assert on every replacement, or edit by line index.

**Negative cases run in CI, not by hand.** Where a criterion asks "does X fail when it should", the test
mutates an in-memory copy or a throwaway `git init` under `os.tmpdir()`. The working tree is never
dirtied. And a fixture has to be able to fail: a `ghp_` token of 36 identical characters is *not* caught
by gitleaks — the rule has an entropy threshold — so a naive fixture would have "proved" the scan works
while proving nothing.

---

## Roster lint — the SK-xx and AG-xx rule ids

Every skill and agent in `.claude/` is linted on every push. Each rule has a stable id; a failure quotes
it, so `git grep SK-04` finds both the rule and the tests that prove it. The rules are functions in
`tests/lib/lint-rules.mjs` — deliberately *not* inlined in the test bodies, because the negative cases in
`tests/lint-negatives.test.mjs` must run **the same code** as the real-tree checks. A negative case that
re-implements its rule proves only that the re-implementation works.

| id | rule | why |
|---|---|---|
| SK-01 | `name` is a slug equal to the skill's directory | a mismatch registers the skill under a name nothing references |
| SK-02 | `description` present, ≤ 500 chars unless allow-listed | the description is what the model routes on; the allow-list is a ratchet ARC-02-S03 empties |
| SK-03 | no unquoted `": "` in `name`/`description` | a YAML plain scalar ends at `: ` — this is the hazard that stopped `now-assist-specialist` registering |
| SK-04 | `version` lives at `metadata.version`, as semver | a top-level `version:` is rejected by claude.ai uploads (S-13) |
| SK-05 | no unknown top-level frontmatter keys | an unrecognised key is silently ignored, so a typo'd rule never takes effect |
| SK-06 | every skill ships an `EXAMPLES.md` | the roster's own standard |
| SK-07 | directory count matches `engine.config.json` `roster.skills` | one number, one place |
| SK-08 | no skill name collides with a Claude Code built-in command | the built-in wins and the skill is unreachable |
| SK-09 | no retired vocabulary under `.claude/` — the token list is `RETIRED` in `tests/lib/lint-rules.mjs`, not repeated here | the v3 rebuild dropped the old permission-tier and product names; the rule stops them coming back while ARC-02-S06 sweeps the governing documents. Spelling the tokens in prose would trip the separate legacy-name ratchet, which is the point of keeping one source of truth |
| SK-10 | every `.claude/…`, `governance/…`, `templates/…`, `docs/…` path quoted in a skill body, agent body or governing document resolves | a dead path routes the reader — or the model — to nothing |
| AG-01 | `name` equals the agent's file stem | as SK-01 |
| AG-02 | `description` present, no unquoted `": "` | as SK-03; the orchestrator dispatches on this text |
| AG-03 | explicit `tools:` list, no `mcp__*`, no `Agent`/`Task` | **an agent with no `tools:` key inherits everything, MCP tools included** — a sub-agent must not hold instance access, and must not dispatch sub-agents |
| AG-04 | `model: inherit` | a pinned model id rots; enabled by ARC-02-S04 |
| AG-05 | `skills:` preloads existing roster skills | enabled by ARC-02-S04 |
| AG-06 | combined description budget under the sub-agent threshold | every agent description sits in the main context |

Two more tests carry no rule id, because the ARC-08 doctor does not quote them: a **ratchet** asserting
the SK-02 length allow-lists never grow (ARC-02-S03 empties them), and a **pending** check recording the
49 retired-vocabulary hits still in `CLAUDE.md` and `README.md` — SK-09's own surface is clean, so the
rule is enabled rather than deferred, and the outstanding sweep is reported instead of hidden.

An SK-09 exemption is anchored to **both a file and a substring of the matching line**, never a line
number, so it cannot drift onto a different line as the file is edited. There is one today: an ITOM
worked example quotes a customer's own "Tier 1 Strict / Tier 2 Standard / Tier 3 Relaxed" CI
classification, which is the client's vocabulary, not the engine's retired permission model. A test
asserts that exemption actually suppresses something — an allow-list entry that exempts nothing is dead
weight pretending to be a decision.

AG-04 and AG-05 are **written but switched off** behind `ENFORCE_S04` in `tests/agents-lint.test.mjs`,
because ARC-02-S04 makes the content change they require. They are not merely skipped: a companion test
asserts the *known-bad* state (all agents still carry a pinned model id, none preload skills), so fixing
the agents early fails that test and points at the switch, rather than letting a disabled rule pass
quietly over an already-clean tree.

### Evidence, not reasoning

A criterion is reported as passing only by pasting the command and its actual output. Reasoning that
it would pass is not evidence, and a report that reads as evidence when it is not is worse than no
report — the reader stops checking.

Two incidents. In ARC-01-S08 a positive clause was reported as PASS having never been run. In
ARC-04-S09 a `grep | sed` pipeline was reported as "exit 1, no matches" when the `$?` read belonged
to `sed`, not to `grep`; the answer happened to be right and the check was not the one claimed. Write
the output to a file and check the exit status of the command you mean, or make the command the last
in the pipeline.

The same applies to a push. `git push` exiting 0 is not proof the remote moved — an ARC-01-S03 push
was a no-op against a stale ref and was reported as done. `git ls-remote origin refs/heads/<branch>`
is the proof, and it goes in the report.

### Never edit `packages/snowarch/dist/` — build it

`dist/` is **committed** (ARC-04-S13), so a clone plus `npm ci` is a runnable live install with no
build step and nothing for a first-time user to get wrong. The price of a build artefact under
version control is that it can go stale, and the only thing that makes it honest is that CI can
rebuild it and prove the bytes match:

```sh
node scripts/build-dist.mjs          # rm -rf dist → tsc -p tsconfig.build.json → extract-tools
git add packages/snowarch/dist
```

The `dist-check` job runs exactly that on three OSes and then `git diff --exit-code --
packages/snowarch/dist`. A source change without a rebuild fails it with *"dist/ is stale — run
node scripts/build-dist.mjs and commit"* and a `--stat` of the files that differ.

Three things make the output reproducible, and each is load-bearing:

- **`tsconfig.build.json`** turns off `sourceMap` and `declarationMap` (they embed paths and roughly
  double the artefact), sets `newLine: lf`, and keeps comments — `dist/` is what an `npx` user reads
  when something breaks.
- **`typescript` is pinned exactly**, no caret. A minor upgrade regenerates every file in `dist/`;
  that is a deliberate maintainer commit, not something a fresh `npm install` should do to a
  contributor mid-PR.
- **`.gitattributes`** marks `dist/**` `linguist-generated=true text eol=lf`. Without the LF rule a
  Windows checkout rewrites every line and `dist-check` is red there for line endings alone.
  `merge=ours` is deliberately **not** set: it resolves every `dist/` conflict silently in favour of
  the current branch, which is how a stale artefact gets merged with nobody seeing it.

Every source PR now carries a `dist/` diff. `linguist-generated` collapses it in review.

### Never spawn `npx` (or any `.cmd`) from a build or test script

Node refuses to `spawnSync` a `.cmd` without a shell — `EINVAL` — and `npx` on Windows *is*
`npx.cmd`. Passing `shell: true` fixes the spawn and hands cmd.exe the argument quoting, which is the
other half of the same problem. Run the tool's own JS entry point with `process.execPath` instead:
`node node_modules/typescript/bin/tsc …`. It has no shell, no `.cmd`, and it is unambiguously the
pinned local copy rather than whatever `npx` would resolve. ARC-04-S13's first build script called
`npx tsc` and was red on all three Windows cells while green on six others.

### Never mutate a shared build artefact in a test

A test that edits `dist/` — even one that restores it in a `finally` — cannot be isolated by cleaning
up, because vitest runs test files in parallel workers and the *window* is the problem, not the
residue. ARC-04-S12's doctor test did exactly that and made `tests/contract.test.ts` fail in 2 of 6
full runs, in a file that story never touched. Copy the artefact and run against the copy; the copy
has to live **inside** the package, because Node resolves dependencies by walking up from the module
and a copy in `os.tmpdir()` dies with `ERR_MODULE_NOT_FOUND`.

### Never derive a path from a file URL's `pathname`

`new URL(import.meta.url).pathname` is `/C:/…` on Windows — a leading slash before the drive letter,
which is not a filesystem path. Use `fileURLToPath(import.meta.url)`. ARC-04-S12 shipped the wrong
form; nine green cells on macOS and Linux said nothing while all three Windows cells spent 223 seconds
timing out and reporting a broken installation on a good one. `tests/doctor/doctor.test.ts` scans the
source for the bad form, so the class is caught on the platforms that do not have the bug.

### Pin a dependency against the floor you advertise, not the floor CI happens to run

ARC-04-S11 needed `undici`. The newest major, and the one after it, both declare an `engines.node`
above this package's stated floor of 20.0.0 — and `undici@7` would have **passed CI**, because the
`node 20` matrix cell resolves to a current 20.19+. Read `engines` before choosing, and record the
version and the reason.

### The force-push rule of record

**Never on `develop` or `main`.** On an ARC or chore branch, only your **own unmerged** commits, always
with `--force-with-lease=<branch>:<the sha you expect to replace>`, and always stated in the report —
a rewrite nobody mentions is a rewrite nobody can review.

It came up in ARC-04-S08: a pushed commit failed the secret scan on a false positive — a constant whose
name ended in `_KEY`, assigned a slash-separated string, which `generic-api-key` reads as a credential —
and the choice was to amend or to add a `.gitleaksignore` fingerprint. The fingerprint is pinned to the commit sha and would have
been a permanent suppression entry for a line that no longer exists, so the commit was amended and the
constant renamed to `META_CAP_FIELD`. The rule is the general form of that: prefer rewriting your own
unmerged history over leaving a permanent exception behind, and never rewrite anyone else's.

### Every PR carries its own status update

A story PR that does not update its status is incomplete and comes back as rework, exactly like a
missing test (owner directive, 2026-09-08). Three places, in the same PR as the work:

- the story's row in `docs/plans/05-STORY-INDEX.md` → `Done (<date>)`,
- the status table in that ARC's `README.md`,
- the milestone counter in `docs/plans/04-ROADMAP.md`.

Status filled in later is status nobody can trust; the point of the rule is that the plan is never
describing a state the repository is not in.

### Before you push

```
npm test
claude plugin validate .claude/skills --strict
claude plugin validate .claude/agents --strict
```

CI runs all three. `--strict` promotes warnings to failures — S-19 found it rejects a missing `author`
where the component type requires one — so the strict form is the one worth running; the lax form lets a
warning through unnoticed. The `plugin-validate` job is no longer `continue-on-error`: a real validation
failure turns the workflow red. What it will not do is go red because the CLI is missing — the install
step tolerates failure and the validate steps are guarded on `claude` being on `PATH`, so an unreachable
registry logs `claude CLI not available on this runner (S-19)` and skips. It is now one of the **12 required status
checks on `main`** (see "The review model"), alongside the nine test cells, the footprint job and the
secret scan.

---

## Writing a skill description

A skill's description is what the model routes on, and every description in the roster is sent to
**every** session. That makes it a shared, finite resource: Claude Code applies a **total** listing
budget across all skills in a session — the engine's, the user's own, and the bundled ones — and when
the total is exceeded it truncates descriptions and drops some to empty. The CLI says so itself:

```
[WARN] Skill listing over budget: 42 skills, 34399 chars > 30000 budget — descriptions will be
       truncated. Run /skills to disable some, or raise skillListingBudgetFraction in settings.
```

That is the mechanism behind P-09, confirmed and closed as spike S-13. The consequence is the rule:
**the engine controls only its own share of the budget**, so a description that is longer than it
needs to be spends a user's headroom, not just its own.

The recipe, applied to all 28 (`scripts/maint/descriptions.mjs` holds the text):

1. **Sentence 1 — the trigger sentence.** `Use when …` for builders, reviewers and consults;
   `Mandatory gateway for …` for the five Domain Experts. Name the domain nouns a user would actually
   type — tables, products, artefact names.
2. **Sentence 2 — what it produces.** The artefact name. Gateways add: *Produces the 5-Part Constraint
   Envelope; fires at Phase 1 Step 5 and Phase 2 Step 4.*
3. **Sentence 3, optional — the one boundary** that prevents mis-routing.

Hard limits, enforced by SK-02 and SK-11: **≤ 500 characters**, no ServiceNowDocs paths, no §1.1
mechanics, and no keyword lists. Quote the scalar whenever it contains `: ` (SK-03).

Nothing is deleted to hit the limit. The keyword list, the firing statement and the "not this skill"
boundaries move into a `## Triggers` section, which is every SKILL.md's first H2:

```markdown
## Triggers

**Keywords:** <comma-separated, the terms a user would type>

**Fires:** <routing-time consult | post-build consult | Phase 1 Step 5 + Phase 2 Step 4 gateway | on demand>

**Not this skill:** <the boundary sentences that used to live in the description>
```

Verify with `node scripts/ci/skill-listing-check.mjs`, which reads the CLI's own registration log
rather than asking a session to describe itself — a model that omits a long description is
indistinguishable from a description that was never registered.

**Skills load from every `.claude/skills` between the working directory and the filesystem root**, not
only the one in the project you are in. Clone the engine beneath a folder that already carries a
`.claude/skills` and a session loads *both* rosters, spending the listing budget on both. The CLI
prints the walk-up in its debug log:

```
[DEBUG] Loading skills from: … project=[<project>/.claude/skills, <ancestor>/.claude/skills]
```

This is why the listing check chooses its scratch directory only after inspecting that directory's
ancestors, and refuses to report a number when the debug log names any root but its own. A measurement
taken in a polluted location does not fail loudly — it silently counts too many.

## Citations

Every citation in the roster is a full `markdown/<area>/<page>.md` path that exists at the pinned
corpus commit. Three shapes are **not** citations the gate can check, and all three were repaired in
ARC-02-S03:

- a bare `foo.md`, with no path at all;
- an area-prefixed but rootless `platform-security/access-control/foo.md`, which looks checkable and
  is not — the gate's pattern requires the `markdown/` root, so such a token is neither checked nor
  warned, and a reader trusts it anyway;
- a directory citation missing the same root.

The second shape is caught by **SK-12** using `findRootlessCitations`. Its allow-list has a ceiling of
one, and that one entry is the deliberate counter-example below.

`node scripts/docs.mjs verify` reports `checked` / `dead` and warns on each unrepaired citation. It
warns rather than fails, because the fix is prose. One token is deliberately left unrepaired: the
security skill names `servicenow-platform/security/` as the path ACLs are *not* under. A citation
quoted to be contradicted must stay wrong.

---

## The engine's git floor

`floors.git` is **2.34.1** (ADR-0008), not ADR-0001's 2.25.0. Below 2.34.1 nothing has been measured, and
**on 2.34.1 itself `git sparse-checkout set --cone <dirs>` swallows `--cone` as a pattern**, so cone mode
never engages and the corpus checkout silently omits its five root files — `LICENSE` among them. ARC-03's
recipe therefore carries an idempotent repair step, and the doctor asserts corpus *completeness* rather
than just the pin: `rev-parse HEAD` matches the pin on a corpus missing five files.
