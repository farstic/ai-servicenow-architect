# CONTRIBUTING

First version, written at the ARC-01 close-out. It records the conventions the foundation stories
established and the reasons behind them — several exist because something went wrong once.

---

## The review model

Work happens on an **ARC branch** (`arc-NN/<name>`), is **reviewed by the architect on a fresh clone**,
and reaches `develop` by **pull request**. `main` is created only at a **milestone merge, with the
owner's explicit approval**.

**Open the pull request as a draft at the first push of a story branch** — `gh pr create --draft --base
develop` with the story report as the body — and let the architect mark it ready and merge. CI triggers
on `pull_request` and on pushes to `main` and `develop` only, so until the pull request exists a work
branch has no build at all; and while it existed as both, one push started two full 25-job matrices for
the same commit, whose contention produced a real red build (2026-09-08 — see the teardown note under
*A spawned child is reaped before its temp directory is removed*).

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

**A timing assertion is a real assertion — fix the subject, not the budget.** A wall-clock check runs
inside a runner that is saturating every core, so it measures contention as well as the thing timed.
That is not a reason to loosen it: when `engine-lint`'s 5 s budget failed at 5055 ms, the standalone
run was 2.9 s and 2.1 s of it was L03 scanning ~400 regexes over every line of every file. The budget
was right and the check was slow — a prefilter took the whole lint to ~0.2 s, and the assertion that
caught it would have gone red on the Windows cell first. Before touching a budget, time the parts.

**And the other half of the same rule:** time the parts first; when the parts are fast and the budget
is what fails under contention, the budget *is* the subject — a wall-clock limit inside a parallel
runner measures contention as well as its subject. That is the snowarch suite's 5 s default, which
failed on three different tests across four runs while their real costs were ~220 ms and ~1 s. A green
CI cell is not evidence against it either: a 2-core runner spawns fewer workers and contends less, so
it says something about the runner, not about the suite.

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

### Updating the contract pin

`packages/contract/required-tools.json` declares what the engine's texts and skills depend on — the
tool names, the gate each is *expected* to carry, and the sha256 of the server contract they were
written against. It exists because `execute_script` was once renamed to `snow_fluent_script_exec`
**and re-gated in the same change**, and nothing on the engine side noticed (`00` §8).

After any change to `packages/snowarch/dist/contract.json`:

```sh
node packages/contract/pin.mjs          # proposes, then asks
node packages/contract/pin.mjs --yes    # proposes and applies
```

It prints a proposal first and writes nothing until you agree — and on a non-TTY (CI, a hook, an
agent) it exits **2** rather than deciding for you. Exit **0** applied, **1** refused, **2** cannot
run, **3** aborted.

Two things it refuses to do on its own:

- **`MISSING <name>`** — a tool the engine depends on is not in the contract. Never auto-resolved:
  either it was renamed, and the texts that cite it need updating too, or it was removed, and
  somebody has to decide what the engine does instead.
- **`REGATE <name>: expected …, server declares …`** — the gate or `mutates` changed. Accept it
  deliberately with `--accept-regate <name>…`, **and name each one in the commit message**.
  Accepting means the engine now expects the server's declaration, and a re-gate can change what a
  user is asked to approve.

`SNOW_CONTRACT_PATH` and `SNOW_PIN_PATH` override the two files, for fixtures. Use **both** when
demonstrating a re-gate: with only the first, the run writes its conclusion about a fixture into the
committed pin — which is how a demonstration of criterion 4 left the real file claiming
`snow_fluent_script_exec` is `write`, and the next honest run then refused.

`npm run lint` validates the file against its schema. The unit test proves it is *self-consistent*;
ARC-05-S03's L07 proves `serverKey` matches `engine.config.json`; ARC-05-S08 proves the gates match
the running catalogue. Three checks, three reasons to go red, deliberately not one.

### The engine lint

```sh
node packages/contract/lint/engine-lint.mjs [--json] [--root <dir>] [--only L01,L03]
```

Exit **0** pass · **1** findings · **2** cannot run. The third is separate on purpose: a missing
`dist/contract.json` means the check never happened, and a caller that read that as a pass would be
reassured by silence.

| Id | Checks |
|---|---|
| `L01` | every `snow_*` token in an engine text is a tool in `dist/contract.json`, with the nearest real name as a hint |
| `L02` | every `mcp__…__` prefix equals the one `engine.config.json` declares |
| `L03` | no retired name outside the files where naming the past is the job |
| `L07` | the registration key agrees across `engine.config.json`, `required-tools.json`, `dist/contract.json` and `.mcp.json` |
| `L11` | the pin's sha still describes the committed contract |

ARC-08's doctor imports these modules and reuses the ids, so `--json`'s shape
(`{ checks: [{ id, status, findings: [{ file, line, message }] }] }`) is a contract with that story.

**One definition of clean.** The scan set lives in `lib/scan.mjs` and nothing else defines it — no
hand-written `grep -r` anywhere should be enforcing a different one, because two definitions is how
a sweep gets declared done against the narrower of them. `docs/plans/**`, `docs/spikes/**` and
`docs/CHANGELOG.md` are **history** and exempt from the name checks: the spike records cite old
prefixes *as measured evidence*, and rewriting them would destroy the record.

Two ways a file may legitimately name a dead thing:

- **The historical marker** — an HTML comment reading `retired-name` then `historical`, honoured only in
  `docs/ARCHITECTURE.md`, `docs/decisions/**` and `docs/CHANGELOG.md`, and only for *identifiers*. A
  tool name is never excused: no sentence makes a name the server answers with `UNKNOWN_TOOL` safe to
  cite.
- **`POLICY_FILES`** in `lib/scan.mjs` — files whose *subject* is the list of dead names. A test that
  asserts which words are retired must contain them; a fixture must contain the defect it detects.
  The line to hold is that naming the dead thing is what the file is *for*, not merely convenient.

**L01, L02 and L03 are reported, not required, until ARC-02-S12 sweeps the tree.**
`scripts/ci/lint-name-summary.mjs` prints a `SUMMARY` line and exits 0; S12 flips one named constant
there and the same command becomes blocking. Requiring them today would make every unrelated PR ship
past a red check, which is how a check stops being read.

### Never edit `retired-names.json` by hand — generate it

```sh
node packages/contract/gen-retired-names.mjs           # write it
node packages/contract/gen-retired-names.mjs --check   # CI; exit 1 when stale, naming the key
```

It merges three sources, each authoritative for a different kind of dead name:

| Source | What it holds |
|---|---|
| `packages/snowarch/tool-rename-map.json` | tools that were **renamed** — the value is what replaced them |
| `packages/contract/retired-identifiers.json` | identifiers that were never tool names: the old product name, the old MCP prefixes, the old package path. Hand-authored; no build artefact knows them |
| `packages/snowarch/retired-tools.json` | tools that were **registered and then removed**. The server answers them with `UNKNOWN_TOOL`, so they are retired — but nothing replaced them, and their value is the literal `(removed)` |

Two shapes are load-bearing and easy to break:

- **No metadata keys, not even `$schema`.** The file is read by `grep -f <(jq -r 'keys[]' …)`, so
  every key is a forbidden word. A `$schema` key would make every file mentioning a JSON schema fail
  the sweep.
- **A rename whose destination was later removed collapses to `(removed)`.** `generate_report` →
  `snow_rpt_report_generate` → gone. Left as a chain, the file would send a reader of the old name
  to one that also does not exist — and the second hop is the one nobody checks.

A **second** rename of the same tool is expressed as a **new key** in the rename map, never by
changing a value. The generator refuses a replacement that is itself retired, which is what that
mistake looks like.

Bare `snow-mcp`, `servicenow-mcp` and `@farstic/snow-mcp` are deliberately **not** retired: they are
legitimate in history sections and ADRs, they are ARC-10's legacy-store detector strings, and the
npm record D-01 forbids touching has to stay nameable. Only the `mcp__…__` prefixes and
`packages/snow-mcp` are. A test asserts both halves, so a tidy-up has to argue with it.

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

### Report paths with forward slashes, on every platform

A tool that prints `governance\mcp-protocols.md` on Windows and `governance/…` on Unix produces
output that cannot be diffed between CI cells, and a reader who pastes one into a `grep` on the
other gets nothing back. Normalise once, where the path is produced — and write path *literals* in
exemption lists with `/` rather than building them with `join()`, or the comparison silently changes
which files are checked at all. ARC-05-S03 went red on three Windows cells for this; ARC-04-S13 had
the same class in a source scan.

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

---

## Generated blocks — never edit between the markers

`docs/ARCHITECTURE.md` carries a roster block between
`<!-- ROSTER:BEGIN (generated by scripts/gen-roster.mjs — do not edit) -->` and
`<!-- ROSTER:END -->`. Everything inside is produced from the directory listing —
`.claude/skills/<name>/SKILL.md` frontmatter plus its `**Fires:**` line, and `.claude/agents/`
frontmatter. Add or rename a skill or an agent, then run:

```
node scripts/gen-roster.mjs
```

`npm run lint` runs `--check`, which exits 1 with a unified diff and, when the counts disagree
with `engine.config.json.roster`, a line like `roster.skills 28 ≠ 29 found`. An edit made by hand
inside the markers survives exactly until the next person runs the generator, and fails CI before
that.

Three things the generator refuses rather than guesses, because a roster nobody can trust is worse
than no roster: a skill with no `**Fires:**` line, a `**Fires:**` line that matches none of the six
classifications, and a disagreement between `REFERENCE_SKILLS` and what the prose says. Each exits
2 — "could not build the roster", which is not the same as "the block is stale" (exit 1).

The doctor's roster check (ARC-08-S02) calls `node scripts/gen-roster.mjs --json` rather than
re-reading the directories: one definition of the roster, and `problems` in that output is the
same list `--check` prints.

---

## Drill outputs — 8 September 2026

The five drift scenarios, run for real on a throwaway branch, with the lines they actually printed.
They are here because a mechanism described is a mechanism nobody has seen fail: when one of these
appears in your terminal you should recognise it, and know which of the five it is.

Retired and invented tool names are written as `<old-name>` and `<renamed>` — the checks that keep
this file honest would otherwise fire on the very output that proves they work.

**1 — a tool renamed in the server, the engine not told.** The gate stops at the server's own suite,
and every layer that depends on the name is in the output at once:

```
CONTRACT GATE FAILED at step "dist" — the server agrees with itself
AssertionError: pinned but not registered — a rename the engine has not been told about: [ '<old-name>' ]
AssertionError: add the tool to a class in tests/contract-exceptions.json, with a reason: [ '<renamed>' ]
AssertionError: contract sha changed — on the engine side run node packages/contract/pin.mjs
```
and, from the engine side run alone:
```
L01 FAIL governance/mcp-protocols.md:77 token <old-name> not in contract (nearest: snow_core_record_read)
L08 FAIL packages/contract/required-tools.json:1 <old-name>: pinned but the contract has no such tool
L11 FAIL packages/contract/required-tools.json contract sha mismatch: pinned 86b63770… committed 795a7208…
```
Note L01's second line: the generated `governance/mcp-protocols.md` still cites the old name, because
the generators had not been re-run. One rename, four places.

**2 — a tool re-gated.** `snow_scr_script_include_add` from `scripting` to `write`:
```
L08 FAIL packages/contract/required-tools.json:1 snow_scr_script_include_add: expected gate=scripting, contract declares gate=write
L11 FAIL packages/contract/required-tools.json contract sha mismatch: pinned 86b63770… committed fbc3cea8…
```
and `pin.mjs` refuses to take it blind:
```
Re-run with: --accept-regate snow_scr_script_include_add
Accepting one means the ENGINE now expects the server's declaration — check the texts
that cite it first; a re-gate can change what a user is asked to approve.
```

**3 — a seventh flag.** `AUDIT_ENABLED` referenced in `permissions.ts` and nowhere else:
```
AssertionError: permissions.ts references a flag the contract does not declare:
  expected [ Array(7) ] to deeply equal [ 'ATF_ENABLED', …(5) ]
```

**4 — a generated file edited by hand.** One word in `docs/TROUBLESHOOTING.md`:
```
-Every error code this server might return, with what it means and what to do about
+Every error code this server can return, with what it means and what to do about
gen-all: 1 generator(s) stale — run npm run gen
L06 FAIL docs/TROUBLESHOOTING.md:1 differs from generator output (gen-governance)
```

**5 — a retired name in prose.** One sentence added to `governance/mcp-protocols.md`:
```
L03 FAIL governance/mcp-protocols.md:63 retired name "<old-name>" → use snow_core_records_query
```

**6 — the auto-mode permission prompt.** Not run here: it needs a live checkout with the server
registered. The evidence on record is spike **S-18 in `03` §F — CONFIRMED with a control**: an `ask`
rule prompts in auto mode, and without one a mutating tool runs unprompted. **No fallback is in
force**; `askStyle` stays `ask`. The re-run against this build is on the owner's live-sitting list in
`packages/snowarch/tests/live/README.md` (ARC-05-S07 criterion 5).

**The drill itself ran on the CI matrix**, not only locally: scenario 1 was pushed as a branch whose
pull request went red across **18 of 25 jobs** — all nine `contract` cells and all nine `test` cells,
the other seven green because a rename breaks neither the docs nor the secret scan. The branch was
closed without merging and deleted; nothing of it is in the history.

---

## Engine tooling imports the loader; never a list

Anything outside `packages/snowarch` that needs a flag name, a preset, a tool's gate or an error
code's remedy imports `packages/contract/lib/contract.mjs`. Not a constant of its own, not a copy in
a comment, not `['WRITE_ENABLED', …]` at the top of a wizard. `tests/contract/no-literals.test.mjs`
scans `tools/snowarch/**`, `packages/contract/gen/**` and `packages/contract/lint/**` for every name
the contract owns — loaded from the contract at test time, so the guard grows with the catalogue
instead of being a second list itself — and it runs in `npm run lint:contract`.

Four places are allow-listed, each prose keyed by a name (the `Use it when…` advice for a preset,
and the one error code the doctor reports specially). The ceiling is four: a fifth needs an argument
rather than an edit, and the entry has to say why the name cannot come from the contract. A
`mcp__${serverKey}__` template is not a literal and is never a hit — that construction is the fix,
not the problem; a hard-coded `mcp__servicenow__` is.

---

## `CLAUDE.md` has a line budget

It is loaded into every session, so its length is a running cost paid on every turn, and its wording
is behaviour rather than description. ARC-02-S08 took it from 425 lines to 125 against a cap of 200
and 20,000 bytes, enforced by `tests/claude-md.test.mjs`.

| # | Section | Budget |
|---|---|---|
| 1 | Identity — architect, router, does not impersonate | 8 |
| 2 | Operating principles | 10 |
| 3 | Mode, and what `Status` means | 10 |
| 4 | Where things are — one line per location | 12 |
| 5 | The roster in one breath, pointing at the generated table | 4 |
| 6 | Phase 1 routing, keeping the gateway table verbatim | 30 |
| 7 | Phase 2 post-build, keeping the Code Reviewer sentence verbatim | 20 |
| 8 | Builder-pair rules | 6 |
| 9 | Consults — the two tables | 14 |
| 10 | §1.1 and delivery governance | 8 |
| 11 | Confidentiality | 5 |
| 12 | Standing rule — record what you learn | 6 |
| 13 | Maintenance pointers | 5 |
| 14 | The version marker, byte-for-byte | 2 |

**Adding to `CLAUDE.md` means removing an equal number of lines, or adding a pointer instead.** The
budget is not a formatting preference: every line is read before the model has seen the user's
request, so a paragraph added here is a paragraph not spent on the task. If something needs saying
at length, it belongs in `governance/`, in `docs/`, or in the skill that needs it — and `CLAUDE.md`
gets the one line that says where.

Two blocks are copied **byte-for-byte** and must not be paraphrased: the five-row gateway table and
the Code Reviewer proposal sentence. Both are what the behavioural tests assert, and a paraphrase is
a silent behaviour change — which is exactly what a line budget invites.

---

## Adding a preflight check

1. Add the check function to `tools/snowarch/lib/steps/B00.mjs`, returning `ok` / `warn` / `fail`
   with a detail, and list it in `runChecks` — order is the operator's reading order.
2. Add its row to `lib/remedies.json` for all four platform keys; a failure without a remedy is a
   status, not help, and the test refuses a missing row or an unfilled `{placeholder}`.
3. Never spell a floor: read it from `ctx.config.floors`, and add the row to the seven-check table
   in `docs/ARCHITECTURE.md`.

## Adding a bootstrap step

1. Add a `BNN.mjs` to `tools/snowarch/lib/steps/` exporting `id`, `title`, `needsNode`, `runsWhen`,
   `inputs`, `run` — plus `skipReason` if it can be skipped, and `cacheable: false` if a recorded
   `ok` must never stand in for running it.
2. `inputs(ctx)` returns TAGGED entries only — `FILE('path')` or `TEXT('key=value')`. An untagged
   entry throws, because a literal read as a path hashes as `<absent>` and two different runs then
   share a digest.
3. Add it to `STEPS` in `lib/steps/index.mjs`, in order. That list is the only place order lives.
4. Spawn children through `ctx.spawn` and nothing else — that is how Ctrl-C reaches them.
5. Add its row to "Bootstrap steps and state file" in `docs/ARCHITECTURE.md`, and never store a URL,
   a username or a credential in the step's `data`: `saveState` refuses it at write time.

## Editing the registration files

**Never hand-edit `permissions` in `.claude/settings.json`.** It is generated from the server
contract — 236 allow entries and 161 ask entries, regenerated whenever a tool's gate changes — and a
hand-edit is overwritten by the next `npm run gen`. **`env` and `hooks` are yours**: the generator
rewrites only the key it owns and carries the rest through, which is asserted by test rather than
trusted.

`.mcp.json` is hand-written and small. Every `${…}` must carry a `:-` default, no key may look like
a credential, and the server key must equal `engine.config.json`'s `mcp.serverKey` — all three are
enforced by `tests/registration-files.test.mjs`, and the engine lint's L02/L07 cross-check the key
against the rule file and the pin.

## Switching release family

`node scripts/docs.mjs family zurich --dry-run` first, always. It prints every edit it would make
and every line it will not touch, and changes nothing.

1. **Read the plan.** `EDIT` lines are mechanical substitutions of the family name inside a fixed
   phrase set. `REVIEW (not edited)` lines are the ones that matter: a sentence that says which
   family ships which table is a platform fact, and only a human knows whether it survives the
   switch.
2. `node scripts/docs.mjs family zurich --yes` — applies exactly those edits, moves the pin to the
   new family's tip, re-runs the citation gate and the lints, and stages everything.
3. **Do the REVIEW pass by hand.** The delta folders upstream (`markdown/delta-<new>-<old>/`) are
   where the platform differences are documented; the REVIEW list is your worklist against them.
4. **Commit** — the command prints the message to use — and open the pull request.

Exit 2 means you asked without `--yes` and got the plan. Exit 6 means the branch is not upstream.
Exit 1 means a lint failed with the edits staged: fix what it named, or abandon with the two
commands the output prints.

## When the real-corpus job must run

`docs-real.yml` fetches the actual 300 MB corpus on Ubuntu, macOS and Windows. It runs itself when
you touch `tools/snowarch/lib/docs/**`, `scripts/docs.mjs`, `vendor/docs-areas.txt`, `.gitmodules` or
`engine.config.json` — the things that decide what lands on disk. **Re-run it by hand** (Actions →
docs-real → Run workflow) after a pin bump, after a family switch, and before a release tag. It is
not a required check: it needs the network, and a red run means "the recipe or the corpus changed",
which is a thing to read rather than a thing to retry.

## Reviewing a docs-bump PR

`.github/workflows/docs-bump.yml` runs on Mondays at 05:17 UTC and opens one pull request when
upstream has moved. It never merges anything.

- **Read the fenced report first.** It is `docs sync --upstream`'s output verbatim — the same bytes
  you would get running it locally. `newly dead (n)` is the whole reason the PR exists.
- **Remap the citations on the PR's branch**, then push. The `needs-remap` label and the red
  `docs-check` job both clear when `docs verify` reports `dead: 0`.
- **Two repository settings this depends on.** Settings → Actions → General → **"Allow GitHub
  Actions to create and approve pull requests"** must be on; without it the run moves the pin, pushes
  the branch and then fails at `gh pr create`. And the first CI run on each bot-authored pull request
  may need **"Approve and run"** — GitHub gates first-time-contributor workflows and `github-actions`
  counts as one.
- **One bump at a time.** The branch is named for the target SHA, so a re-run against the same tip
  updates the PR rather than opening another; a newer tip closes the older one with `superseded
  by #<n>`. If you see two open, something went wrong — say so rather than merging both.

## Refreshing the corpus

Monthly, or when a citation goes dead upstream. Five steps, and the tool does the first one only:

1. `node scripts/docs.mjs sync --upstream` — fetches the family tip, moves the pin and the gitlink,
   re-runs the citation gate and prints the before/after diff. It **stages** both paths and commits
   nothing.
2. **Read the report.** `newly dead (0)` and exit 0 means the refresh is clean.
3. **Remap what broke.** Every `newly dead` line names a file and a line to repair. Fix the
   citation, never the pin — and never delete a citation to make the gate pass.
4. `git commit -m "chore(docs): bump ServiceNowDocs to <7>"` — the report prints the exact command.
5. Push, and open the pull request as usual.

Exit 1 means the pin moved *and* citations broke. Both are true and both matter: the pin is staged
because you need the new corpus in order to repair the citations against it.

## When to run the validation tests

**Run `tests/VALIDATION-TESTS.md` after any change to `CLAUDE.md`, to `governance/`, to a `SKILL.md`
or to an agent.** The file-level checks prove the shape; only a session proves the behaviour, and
these four are the inputs that decide it. `tests/validation-tests-shape.test.mjs` keeps the document
itself honest — eighteen tests in order, each with its Modes line and four sections, no dates, no
retired names — but a green shape test says nothing about whether a gateway still fires.

**One fresh session per test.** A session that has already run T-01 is not a fresh session for T-02:
the routing behaviour under test is precisely what prior context changes, so a suite run in one
session proves less with every test it completes.

**Modes.** Each test names the Mode(s) it applies to. In `design-only`, T-05 and T-06 run their
dormant variant — the engine states that no live instance is configured and makes no tool call —
and a dormant PASS is a real PASS: it proves the gate holds when there is nothing to write to. The
live halves need a configured instance and are ARC-09/ARC-10's gate.

**Record the run** in the pull request description, or in
`docs/spikes/validation-runs/<date>-<what>.md` with the CLI version and the commit sha. Never in the
test file: it is a specification, and the dated run tables it used to carry were removed for exactly
that reason. Redact anything naming a real instance, user or credential.

**A failure is a rework item against the story that changed the text**, not a note in the record.
Fix the governing document, re-run the failed test in a fresh session, then re-run the whole suite
before committing — a fix for one test must not break another.

---

## Annotating an Accepted ADR

An ADR is immutable once Accepted: a decision record that can be edited is a record of what someone
later wished had been decided. **The one permitted edit is a lint annotation** — appending the
historical marker comment to a line so a name check stops firing on a name the ADR is *about*. It
changes no word of the decision and no word of its reasoning; without it the alternative is either a
permanently red check or an exemption for the whole file, and the second hides the next real hit.

Everything else is a new ADR that supersedes the old one. `docs/RELICENSING.md` is treated the same
way for the same reason, with one difference: its file list is quoted verbatim inside an indented
block, so the per-line marker cannot go there without editing the list — it is excluded by path
instead, in `packages/contract/lint/lib/scan.mjs`, with the reason beside it.

---

## The contract gate

`npm run contract` is four checks in one command, and the same command runs in CI, before a release
tag, and on your machine — a gate that exists in only one of those is a gate somebody meets for the
first time at the worst moment.

| Step | Proves | Fails when |
|---|---|---|
| `server` | the committed `dist/` is what the source builds | you changed a tool and did not rebuild |
| `dist` | the server agrees with itself (the 14 invariants) | a gate, a name or a code contradicts its declaration |
| `generated` | the generated texts are what the generators produce | you edited a generated file, or changed the contract and did not regenerate |
| `engine` | the engine agrees with the server (pin + required lint checks) | the sha moved and the pin was not updated |

It **stops at the first failing step**. Later steps are usually downstream of an earlier failure — a
stale `dist/` makes the pin wrong, which makes every generated header wrong — so running all four
would report one fault four times and bury the one that matters. `generated` deliberately precedes
`engine`: a stale generated file is a *cause* of engine disagreement, and reporting it as a pin
problem would send you to `pin.mjs` for a file you only had to regenerate.

`--skip-build` skips step 1, for a caller that has just rebuilt. **ARC-09-S01's release script calls
`node scripts/contract-gate.mjs --skip-build` after its own rebuild and refuses to tag on a non-zero
exit** — the gate is what makes a tag mean the artefacts agree.

### CI gates — 25 jobs

| Job | Cells | What it proves |
|---|---|---|
| `test` | 9 (3 OS × Node 20/22/24) | the suites pass, and `npm run lint` with them |
| `contract` | 9 (3 OS × Node 20/22/24) | the contract gate — it subsumes the old `dist-check`, whose rebuild-and-diff is its first step |
| `no-build handshake` | 3 (3 OS) | the committed artefact answers a real stdio handshake with no build step — the state a user is in after `git clone && npm ci` |
| `docs-check` | 1 | the README's generated blocks are current and no retired surface is documented |
| `footprint` | 1 | a production install stays within its size budget |
| `secret scan` | 1 | gitleaks over the history, not just the tree |
| `plugin validate` | 1 | `claude plugin validate --strict` on skills and agents, plus engine-lint L10 with `--require-claude` |

---

## Adding a tool

Five steps, in this order. Each one has a check that fails if it is skipped, which is the point of
the order — you cannot get halfway and have a green tree.

1. **Declare it.** Register the `ToolDefinition` with its `gate` and `mutates`. A tool that changes
   the instance is never `gate: none`, and a tool behind a writing gate always mutates —
   `tests/contract.test.ts` test 8 refuses both directions. If the name's last segment disagrees
   with `mutates`, test 7 asks for a class in `tests/contract-exceptions.json` **with a reason**;
   the reason is the deliverable, not the exemption.
2. **Rebuild.** `node scripts/build-dist.mjs`. The contract is derived — `toolCount` is counted, not
   typed — so this is what makes the declaration real.
3. **Run the server tests.** `npm test -w packages/snowarch`. Test 12 proves the committed contract
   is what the extractor produces; test 3 proves the tool refuses with its declared gate's code.
4. **Pin, on the engine side.** `node packages/contract/pin.mjs` — it prints the proposal and names
   any re-gate before it applies. Test 13 and L11 both fail until you do.
5. **Regenerate.** `npm run gen`. A new mutating tool changes the `ask` list in
   `.claude/settings.json` and every generated file's header sha; L06 fails until they are committed.

**Adding an error code** is its own list, above: registry first, then `npm run gen`.

---

## The engine lint's checks

`packages/contract/lint/engine-lint.mjs` runs eleven checks over the engine's texts. Each is a
module in `checks/` exporting **`{ id, title, run(ctx) }`**, where
`ctx = { root, config, contract, requiredTools, retiredNames, files }` plus `skipNotes`, `skipped`,
`cannotRun` and `isSelfRoot`. ARC-08's doctor imports these modules rather than shelling out, so the
shape is a contract with a story that has not been written yet — add a check by adding a module, not
by adding a branch to an existing one.

| Id | What it refuses | In CI |
|---|---|---|
| `L01` | a `snow_` token that is not a tool in the contract | summary only, until ARC-02-S12 |
| `L02` | an `mcp__…__` prefix that is not the one `engine.config.json` declares | summary only |
| `L03` | a retired name outside the files whose subject is the past | summary only |
| `L04` | a description over 500 characters, or an unquoted `": "` that stops the entry registering | **required** |
| `L05` | a repository path cited in prose that does not resolve | **required** |
| `L06` | a generated file that is not what its generator produces | **required** |
| `L07` | the registration key disagreeing across its declarations | **required** |
| `L08` | the pin and the contract disagreeing about a tool's gate, mutates, sessionMutates or alsoRequires | **required** |
| `L09` | a `used_by` nobody can resolve, or a cited tool the pin does not carry | **required** |
| `L10` | `claude plugin validate` failing on the skills or agents directory | see below |
| `L11` | a pinned sha that no longer describes the committed contract | **required** |

**L10 is the one check that needs a tool outside this repository, and it behaves accordingly.** In
the `lint` job the CLI is not installed, so L10 reports `skip` with the reason. Enforcement lives in
the `plugin validate` job, where the CLI *is* installed and the check runs with `--require-claude` —
there, a missing CLI means the job is misconfigured rather than that there is nothing to check. A
check that passed silently when it could not run would make that job look redundant while it was the
one doing the work.

Exit codes are the same everywhere: **0** current, **1** findings, **2** could not run. The third is
not a nicety — "the contract lost something this file names" and "this file is stale" call for
different actions, and a stack trace on a CI cell calls for neither.

---

## Adding an error code: the registry first

A code exists when it has an entry in `packages/snowarch/src/errors/codes.ts` — `meaning`, `remedy`,
optionally a `command`, and `showInRule`. `ServiceNowError` takes the registry's union as its code
type, so `throw new ServiceNowError(msg, 'NEW_CODE')` without an entry is a compile error at the
throw site, where the author is, rather than a string that reaches a user with nothing attached to
it. `tests/errors/codes.test.ts` scans `src/` for thrown literals as the second, independent check.

**Never write a remedy anywhere else.** `.claude/rules/00-mode-and-mcp-gate.md`,
`docs/TROUBLESHOOTING.md`, `governance/mcp-protocols.md`, the wizard and the doctor all render from
that one string; a remedy repeated in five places is five things to correct and four that will not
be. `remedy` is prose, `command` is a command — renderers set `command` as code and never parse the
prose looking for one.

Then `npm run gen`, and commit the regenerated files. `npm run lint` runs `--check` and fails on a
generated file that does not match its source.

---

## `.editorconfig` is enforced

`tests/editorconfig.test.mjs` checks every tracked `.md .mjs .ts .json .yml .yaml` file for exactly
one final newline and no CR, and markdown prose for a word split across a wrap boundary. It exists
because the config declared those rules for two years and nothing read them: five files were in
breach when the check was written, and every one had passed CI.

Excluded, because a "fix" there would be a falsification rather than a repair: `vendor/**` (not
ours), `packages/snowarch/dist/**` (build output — fix the build), `**/fixtures/**` (several are
malformed on purpose, that being their subject), `scripts/legacy/**` (the v2 engine as imported) and
`docs/spikes/**` (records of what was run). `.ps1` and `.cmd` are outside the extension list because
`.editorconfig` gives them CRLF — a check assuming LF everywhere would be wrong about the two file
types the config is most explicit on.

**If you rewrite a whole file from a script, the terminator is yours to restore.** All five original
breaches came from the same shape: read a file, split it, transform, join the parts, write it back —
`'\n\n'.join(paragraphs)` has no trailing newline and nothing complains. Write
`text.rstrip('\n') + '\n'`, or run the test.

---

## Where a finding goes

A thing learned on a real instance is one of two kinds, and they have different homes because they
have different enforcement:

| Kind | Home | What holds it in place |
|---|---|---|
| **Platform** — how ServiceNow behaves | `docs/PLATFORM-NOTES.md`, a `PN-xx` entry with all five fields | the citation gate: every path-shaped `Grounding:` must resolve under `vendor/ServiceNowDocs/`, and the file is in the scan set |
| **Server** — how this MCP server behaves | a failing test under `packages/snowarch/tests/`, then the fix; a row in `packages/snowarch/CHANGELOG.md`'s "Known limitations" until then | the test |

The distinction is not bureaucratic. A platform fact is true whatever we ship and cannot be fixed
here, so the useful thing to record is the behaviour and where it is documented. A server fact is a
defect in code we own, and writing it in prose instead of a test is how it comes back.

Two rules for a `PN-xx` entry. **`Grounding:` is a real path or an admission** — where no corpus page
states the behaviour, the line reads `none in ServiceNowDocs (<nearest area path> for the baseline
concept); observed behaviour`, never an invented path that a reader would trust. And **nothing
instance-specific ever lands here**: no URL, sys_id, user name or address. Those go in local memory.

`Engine consequence:` is the field that earns the entry its place — what a specialist now does
differently. An entry that changes nothing about how the engine works is a note, not a platform note.

---

## Vocabulary

The v3 rebuild retired four strings. **SK-09** (`.claude/`) and the criterion-2 sweep in
`tests/no-legacy-surfaces.test.mjs` (`CLAUDE.md`, `governance/`, `docs/`) both refuse them, and
`packages/contract/lint/checks/l03-retired.mjs` refuses the tool-name half everywhere else. Three
checks, one list: `tests/fixtures/retired-vocabulary.json`.

The words are not spelled out here. A file that spells a forbidden string becomes a detector its own
sweep then has to exempt, and an exemption in a document about the rule is the least defensible
exemption in the repository — the fixture is where they live, and `node --test
tests/skills-lint.test.mjs` prints each one it refuses.

| Retired shape | Say instead |
|---|---|
| The word `Tier` followed by a digit — the old permission ladder | **Mode** and **preset** (below) |
| The two `mcp__…__` prefixes of the previous servers | The prefix `engine.config.json` declares in `mcp.serverKey` |
| The previous product name | `snowarch`, or "the server" |

### Mode, and preset

Two axes, and they answer different questions. Neither is a ladder: a session does not "have more
permission" than another, it has a different set of flags, and the doctor is what says which.

- **Mode** — whether an instance is configured at all. `design-only` means no instance is
  reachable and every live call is a documented deferral; `live` means one is. `scripts/doctor.sh`
  prints a `Mode:` line and that line is the statement of record. Do not infer it from the tool
  list: a disabled family is still advertised, and reading the advertisement instead of the doctor
  is exactly the mistake the old vocabulary encouraged.
- **Preset** — which capability flags are on for that instance: `read-only`, `pdi-developer`,
  `full`, or `custom`. Presets expand to the six `*_ENABLED` flags in
  `packages/snowarch/src/utils/permissions.ts`, a dependency rule can turn one back off, and it is
  the **effective** flags after that rule — not the preset's name — that decide whether a call is
  refused.

So "this session is `live` on a `pdi-developer` instance" is a complete statement, and one that
survives a flag being switched off underneath it. The old single number could not say either half.
