# CONTRIBUTING

First version, written at the ARC-01 close-out. It records the conventions the foundation stories
established and the reasons behind them — several exist because something went wrong once.

---

## The review model

Work happens on an **ARC branch** (`arc-NN/<name>`), is **reviewed by the architect on a fresh clone**,
and reaches `develop` by **pull request**. `main` is created only at a **milestone merge, with the
owner's explicit approval** — it does not exist during ARC-01, which is why the CI workflow triggers on
`main`, `develop` **and** `arc-*/**`: a workflow watching only `main` would never have run.

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

**Run the suite after `git add`, not before.** `tests/no-legacy-names.test.mjs` scans `git ls-files`,
so an untracked file is invisible to it. In ARC-02-S02 a new module carrying a forbidden token passed
locally and turned all nine CI cells red — `npm test` on an unstaged tree is simply not the check CI
runs. The same applies to any test that walks the tracked set rather than the working directory.

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
registry logs `claude CLI not available on this runner (S-19)` and skips. Making the job a *required*
status check still needs branch-protection contexts on `main`, which does not exist until the milestone
merge.

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
