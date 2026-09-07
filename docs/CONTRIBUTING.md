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

**Negative cases run in CI, not by hand.** Where a criterion asks "does X fail when it should", the test
mutates an in-memory copy or a throwaway `git init` under `os.tmpdir()`. The working tree is never
dirtied. And a fixture has to be able to fail: a `ghp_` token of 36 identical characters is *not* caught
by gitleaks — the rule has an entropy threshold — so a naive fixture would have "proved" the scan works
while proving nothing.

---

## The engine's git floor

`floors.git` is **2.34.1** (ADR-0008), not ADR-0001's 2.25.0. Below 2.34.1 nothing has been measured, and
**on 2.34.1 itself `git sparse-checkout set --cone <dirs>` swallows `--cone` as a pattern**, so cone mode
never engages and the corpus checkout silently omits its five root files — `LICENSE` among them. ARC-03's
recipe therefore carries an idempotent repair step, and the doctor asserts corpus *completeness* rather
than just the pin: `rev-parse HEAD` matches the pin on a corpus missing five files.
