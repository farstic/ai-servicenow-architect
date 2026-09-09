> **Redaction rules (ARC-00 STORIES.md conventions).** No instance URLs, usernames, passwords, tokens or
> `~/.claude.json` contents appear in a spike record — **key names only, values as `set (len n)`**.
> Paths are `~`-relative. Screenshots are cropped to the dialog.
> A spike that runs on several operating systems carries **one *Observed* block per OS and one verdict line**.

# S-07 — ServiceNowDocs submodule recipes: size and time

**Run by:** ARC-00-S09 · **Verdict consumed by:** ARC-03-S05/S10/S11, ARC-06-S06

**Status: CONFIRMED on three CI runners and macOS. Recipe C is recommended by measurement on every
machine, and `core.longpaths` turns out not to be required. One gap remains: no VM samples.**

> **Folder note.** ARC-00-S01 created this record as `spikes/S-07-docs-submodule-recipes/`; ARC-00-S09's
> story names the scripts folder `spikes/S-07-docs-submodule/`. The two were consolidated here, under the
> story's name, so one spike has one folder.

## Assumption

> `git submodule update --init --depth 1` followed by cone `sparse-checkout set` yields roughly the measured 299 MB / ~55 s; long paths (35k files) are fine on Windows git

**Impact if false:** M · **Evidence so far (from `03`):** Direct blobless sparse clone measured 299 MB; the submodule path with `--filter=blob:none` was not exercised

## Environment

| Field | Value |
|---|---|
| macOS | **26.5.2** build **25F84**, arm64 — git **2.39.5** (Apple Git-154), home network |
| GitHub runners | `ubuntu-22.04`, `macos-latest`, `windows-latest` — git **2.55.0** (`2.55.0.windows.5` on Windows); workflow `.github/workflows/s07-recipes.yml`, run `34046585778`, **9/9 green** |
| Ubuntu VM · Windows VM | **Ubuntu VM RUN 2026-09-07** — Ubuntu 22.04.5 LTS aarch64, **git 2.34.1** (stock), Node v22.23.2; see the Ubuntu row below, which changes the spike's conclusion · `DEFERRED — Windows VM pending (owner input #2)` — these are the "consultant laptop" samples the story says to quote for users |
| Fixture | branch `spike/s-07-docs`: `.gitmodules` (path `vendor/ServiceNowDocs`, the public ServiceNowDocs repository, branch `australia`, `shallow = true`) and a gitlink pinned to **`ba513f2c62d3698ef5bfdd8044110226b8419689`**. Control branch `spike/s-07-docs-tip` is the same tree with the gitlink at the tip. |
| Areas | `docs-areas.txt` — **20 areas**, `markdown/`-prefixed |
| Date | 2026-09-06 |

**Where the 20 areas come from — and why they are not ARC-03's 19.** Derived from the engine's own
citations. The scan was **the whole engine repository excluding the corpus itself**
(`git grep -ohE 'markdown/[a-z0-9-]+/' -- . ':(exclude)ServiceNowDocs'`), which yields **21 distinct
names**; dropping **`now-assist`**, which is cited but **is not a directory in the corpus** (the real
area is `intelligent-experiences`, also cited), leaves the 20 measured here.

An earlier version of this paragraph described that scan as "grepping its **skills and agents**". That is
narrower and yields **20**, not 21 — it excludes `markdown/release-notes`, whose only citation in the
engine is `README.md:490` (`ls ServiceNowDocs/markdown/release-notes/`), a docs-refresh instruction rather
than a skill or agent reference. The counts were right for the scan actually run; the sentence naming the
scan was wrong, and is corrected here.

**Consequence for ARC-03, and it is not cosmetic.** ARC-03's README states its generated set is
**19 areas**. This record measures **20**, and the extra one — `markdown/release-notes` — is
**329 files / 5 876 KB** of what was sized. So every headline figure here measures a *superset* of the
checkout ARC-03-S05 will actually generate; ARC-03's tree will be roughly 6 MB and 329 files smaller.

> **Reconciliation — architect ruling, 2026-09-06.** The 19-vs-20 decision belongs to **ARC-03-S02**.
> The architect's recorded recommendation is to **exclude `release-notes`** (the citation gate's scope is
> skills and agents; the `README.md` link is informational) and to read **every figure in this record as
> an upper bound**. The measurements below are deliberately left as taken — they are what the 20-area
> checkout actually is — and are not restated for a set that has not been decided yet.

## Procedure

**Check that retires it (from `03`):** Time and `du` the B02 step on macOS, Linux, Windows (enable `core.longpaths`); compare three recipes; confirm the pin is still fetchable once it is no longer the branch tip.

Each recipe starts from a **fresh clone** of the spike branch with `--no-recurse-submodules`, deletes any
`vendor/ServiceNowDocs` and asserts its absence (acceptance criterion 5), then:

- **A — naive:** `git submodule update --init --depth 1` then `sparse-checkout set --cone <20 areas>`
- **B — filter:** the same, with `--filter=blob:none` on the submodule update
- **C — direct:** `git clone --filter=blob:none --no-checkout --depth 1 --sparse --branch australia`,
  `sparse-checkout set --cone`, `fetch --depth 1 origin <pin>`, `checkout <pin>`, `git submodule absorbgitdirs`

The three were run **sequentially, never in parallel**, so the wall times are not distorted by shared
bandwidth.

## Observed

### How every figure in the tables below was measured

The architect's re-run reported 48,997 files where this record says 34,689, and 239 MB where it says
304 MB. Both pairs are right; they are different measurements. The exact commands, from
`recipe-common.sh`:

| Column | Command | What it counts |
|---|---|---|
| **files on disk** | `find vendor/ServiceNowDocs -type f -not -path '*/.git/*' -not -name .git \| wc -l` | what the sparse checkout actually **materialises** — **34 688** with the `-not -name .git` term, **34 689** without it (the run in the tables below predates the term; see the note under this table) |
| *(tracked, for contrast)* | `git -C vendor/ServiceNowDocs ls-files \| wc -l` | every path in the **index at the pin**, sparse or not — **48 997**. Sparse checkout does not shrink the index; it sets the skip-worktree bit. |
| *(the bridge)* | `git -C vendor/ServiceNowDocs ls-files -v \| grep -vc '^S'` | tracked paths **without** skip-worktree — **34 688**. The `-C` is load-bearing: run from the superproject root the same command counts the superproject's own index instead. |
| **working tree** | `du -sk vendor/ServiceNowDocs` | the checkout only — **244 636 KB (239 MB)**. For a submodule the object store is elsewhere, so this figure excludes it. |
| **`.git`** | `du -sk .git/modules/vendor/ServiceNowDocs` | the submodule's object store in the superproject — **64 136 KB (63 MB)** |
| **total on disk** | the sum of the two above | **308 772 KB ≈ 302 MB** |

**34 689 = 34 688 + 1**, and the extra one is `vendor/ServiceNowDocs/.git` itself: after
`git submodule absorbgitdirs` it is a **49-byte pointer file**, not a directory, so the
`-not -path '*/.git/*'` filter (which excludes the *contents* of a `.git` directory) does not exclude
it. The scripts now subtract it, so later runs report **34 688** and match the bridge figure exactly.

One measurement caveat: `du -sk .git/modules/…` for recipe C read **65 356 KB** immediately after the
run and **64 136 KB** when re-measured later — git's background maintenance repacking. Treat the `.git`
figures as ±2%. The "≈ 304 MB" this record first printed was the sum using the immediately-post-run
figure; **302 MB** is the settled number.

### The nine CI cells (run `34046585778`, all green; git 2.55.0; Windows with `core.longpaths true`)

| Runner | Recipe | wall | working tree | `.git` | files on disk | HEAD | clean |
|---|---|---|---|---|---|---|---|
| ubuntu-22.04 | A-naive | 29.1 s | 247 592 KB | 112 296 KB | 34 689 | `ba513f2` | yes |
| ubuntu-22.04 | B-filter | 33.8 s | 247 592 KB | 92 160 KB | 34 689 | `ba513f2` | yes |
| ubuntu-22.04 | **C-direct** | **23.6 s** | 247 592 KB | **64 324 KB** | 34 689 | `ba513f2` | yes |
| macos-latest | A-naive | 35.1 s | 244 636 KB | 123 660 KB | 34 689 | `ba513f2` | yes |
| macos-latest | B-filter | 43.5 s | 244 636 KB | 104 744 KB | 34 689 | `ba513f2` | yes |
| macos-latest | **C-direct** | **30.3 s** | 244 636 KB | **65 296 KB** | 34 689 | `ba513f2` | yes |
| windows-latest | A-naive | 44.8 s | 258 624 KB | 112 187 KB | 34 689 | `ba513f2` | yes |
| windows-latest | B-filter | 52.4 s | 258 624 KB | 92 032 KB | 34 689 | `ba513f2` | yes |
| windows-latest | **C-direct** | **35.6 s** | 258 616 KB | **64 231 KB** | 34 689 | `ba513f2` | yes |

### macOS, local (the owner's machine, git 2.39.5, home network)

| Recipe | wall | working tree | `.git` | total on disk | files |
|---|---|---|---|---|---|
| A-naive | 47.9 s | 244 636 KB (239 MB) | 123 280 KB (120 MB) | **359 MB** | 34 689 |
| B-filter | 62.6 s | 244 636 KB | 105 236 KB (103 MB) | **342 MB** | 34 689 |
| **C-direct** | **37.6 s** | 244 636 KB | 65 356 KB (64 MB) | **304 MB** | 34 689 |

Every run: `HEAD` = `ba513f2c62d3698ef5bfdd8044110226b8419689`, `git status --porcelain` empty.

### Three results worth stating plainly

1. **Recipe C wins on both axes on every machine** — fastest *and* smallest `.git`, by a wide margin
   (64 MB against 92–124 MB). Its total, 304 MB on macOS, lands almost exactly on the **299 MB** that
   `01` §10 measured for a direct blobless sparse clone; the small difference is the areas list.
2. **Recipe B is *slower* than recipe A, not faster.** `--filter=blob:none` on `git submodule update`
   saves ~17 MB of `.git` and costs **5–15 seconds depending on the machine** (macOS local +14.7 s, macos-latest +8.4 s, ubuntu +4.7 s, windows +7.6 s), because the blobs it declined to fetch up front have
   to be fetched on demand during checkout. That is the opposite of the intuition behind offering it, and
   it is consistent across macOS local, macOS CI, ubuntu and windows.
3. **The pin-by-SHA worry is retired.** `ba513f2` is well behind the branch tip —
   `git ls-remote … refs/heads/australia` returned **`11b39be17307dd4b21df15a54e8011ae68f64dba`** at run
   time, the same tip the ARC-03 README recorded on 2026-09-04 — and **all three recipes fetched and
   checked out the non-tip pin successfully on all four machines**. There is therefore **no error text to
   quote for acceptance criterion 3**: nothing failed, so no recipe "succeeds only at the tip".

### The Windows `core.longpaths=false` control (acceptance criterion 2)

Run `34048226638` carries a `longpaths: [true, false]` matrix dimension on the Windows job; the
`false` cells run with `continue-on-error` because a failure there would be the answer, not a broken job.

```
core.longpaths = false
```

**All three recipes succeed with `core.longpaths=false`** — 34 689 files, HEAD `ba513f2`, no error:

| Recipe | wall (longpaths=false) | wall (longpaths=true) | files | HEAD |
|---|---|---|---|---|
| A-naive | 43.8 s | 44.8 s | 34 689 | `ba513f2` |
| B-filter | 51.1 s | 52.4 s | 34 689 | `ba513f2` |
| C-direct | **35.5 s** | 35.6 s | 34 689 | `ba513f2` |

**This does NOT show that `core.longpaths` is unnecessary, and an earlier version of this record wrongly
said it did.** The result is an artefact of the runner's very short workspace path. Measured:

| | prefix | + longest corpus path (197) | vs `MAX_PATH` (260) |
|---|---|---|---|
| GitHub `windows-latest` workspace `D:\a\snowarch-spikes\snowarch-spikes\vendor\ServiceNowDocs\` | 56 | **253** | under |
| A realistic install `C:\Users\<name>\work\ai-servicenow-architect\vendor\ServiceNowDocs\` | 77 | **274** | **over** |

The longest tracked path in the corpus is 197 characters
(`markdown/platform-security/instance-security-hardening-settings/sc-limit-attachment-size-…-platform-document-intelligence.md`).
On the runner the total never approaches `MAX_PATH`, so **the control never exercised the condition it
was meant to test.** ARC-03's README predicted exactly this — "the longest corpus path is 197 characters;
**with a typical checkout prefix it exceeds `MAX_PATH`**" — and this evidence does not contradict it.

**What this control does establish:** at a ≤56-character prefix, none of the three recipes needs
`core.longpaths`, and none errors without it. **What it does not:** anything about a real user's install
path, which is ~77 characters and puts the same file 14 characters over the limit. Acceptance criterion 2
therefore stands **unanswered for the case that matters**, and the honest next step is the Windows VM
(owner input #2) with the checkout at a realistic path — not another hosted-runner cell. Nor does this
control isolate the OS-level `LongPathsEnabled` policy, which the runner image may have on.

**Amendment 2026-09-09 (ARC-03-S05, confirmed by ARC-03-S06).** The prefix finally bit, in the one
place nobody was watching: the S05 fixture builder could not run on `windows-latest` at all —
`git add -A` failed with `unable to index file` on the 197-character path — because a runner temp
directory (`D:\a\…\Temp\snowarch-docs-sync-XXXXXX\src\`) is far longer than the ≤56-character
prefix this control measured. So acceptance criterion 2 is not merely unanswered for the case that
matters; a longer-than-typical prefix has now been observed failing on the same corpus, in CI. The
`core.longpaths` setting stays, and the fixture carries it too.

**Cross-run caveat on the table above:** the `longpaths=true` column is quoted from run `34046585778` and
the `longpaths=false` column from run `34048226638`. Within run `34048226638` alone the `false` cells are
2.9 s / 5.2 s / 0.6 s *faster* than that run's own `true` cells; the near-identical times shown here are
an artefact of pairing across runs. The conclusion is unaffected — no cell failed either way — but the
numbers should not be read as a within-run comparison.

### Recipe C leaves the superproject's submodule **uninitialised** — and the record nearly missed it

Every "clean" reading in the tables above was taken **inside** the submodule. Asking the *superproject*
what it thinks gives a different answer:

```
# after recipe C
$ git submodule status
-ba513f2c62d3698ef5bfdd8044110226b8419689 vendor/ServiceNowDocs     # leading '-' = NOT initialised

# after recipe A
$ git submodule status
 ba513f2c62d3698ef5bfdd8044110226b8419689 vendor/ServiceNowDocs (ba513f2c6)
```

The working tree is fully populated, `git status --porcelain` is empty in both the submodule and the
superproject, and the gitlink matches — but `git submodule status` reports recipe C's submodule as
uninitialised, because a direct clone plus `absorbgitdirs` never registers it in `.git/config`.

**One extra step fixes it**, verified:

```
$ git submodule init
Submodule 'vendor/ServiceNowDocs' (…/ServiceNowDocs) registered for path 'vendor/ServiceNowDocs'
$ git submodule status
 ba513f2c62d3698ef5bfdd8044110226b8419689 vendor/ServiceNowDocs (ba513f2c)
```

**This changes what ARC-03 should document.** The story's four-step recipe C is incomplete: it must be
`clone --sparse` → `sparse-checkout set` → `fetch`/`checkout <pin>` → `absorbgitdirs` → **`git submodule
init`**. Any later `git submodule` command, and any doctor check built on `git submodule status`, would
otherwise report a correctly populated corpus as missing.

### The tip-pin control (acceptance criterion 3), macOS

Identical runs against `spike/s-07-docs-tip`, gitlink at `11b39be`:

| Recipe | wall (tip) | wall (pin) | `.git` (tip) | files (tip) |
|---|---|---|---|---|
| A-naive | 37.5 s | 47.9 s | 90 720 KB | 35 539 |
| B-filter | 61.2 s | 62.6 s | 96 496 KB | 35 539 |
| C-direct | 33.5 s | 37.6 s | 64 268 KB | 35 539 |

All three succeed at the tip as well. The pin costs recipe A about **10 seconds** and recipe C about
**4** — the price of the by-SHA fetch — **and, for recipe A, about 32 MB of `.git`** (123 280 KB at the
pin against 90 720 KB at the tip). That object-store penalty is the second-largest differentiator between
the recipes after wall time, and it matters to ARC-03 because pin-behind-tip is the steady state, not the
exception. Recipe C is almost unaffected (65 356 KB against 64 268 KB). The tip tree carries 850 more
files than the pinned one — the corpus moving on between 2026-07-09 and now.

**Reproducibility caveat on this table.** `recipe-C-direct.sh` took its pin from a `PIN` environment
variable defaulting to the `ba513f2` literal, so it did **not** read the gitlink. The runs above were
correct because `PIN=11b39be…` was exported explicitly (the tip log records `S07_HEAD=11b39be…`), but a
stranger following "check out `spike/s-07-docs-tip` and run the three scripts" would have got A and B at
the tip and **C silently at the pin**. The script now reads the gitlink with
`git rev-parse HEAD:vendor/ServiceNowDocs` and only falls back to `PIN`.

### Ubuntu VM · Windows VM

**Ubuntu VM — RUN 2026-09-07, and it changes the spike's conclusion.** `arc00-ubuntu`, Ubuntu 22.04.5
LTS aarch64, kernel 5.15.0-191, **git 2.34.1** (the distribution's stock git), Node v22.23.2. Fixture
delivered as a `git bundle` of `spike/s-07-docs` over `multipass transfer`, so **no GitHub credential was
placed on the VM**; `ServiceNow/ServiceNowDocs` is public and was cloned from GitHub normally. Three fresh
clones, recipes run **sequentially**.

| Recipe | wall | working tree | `.git` | files materialised | HEAD | clean |
|---|---|---|---|---|---|---|
| A — naive | **41 958 ms** | 247 508 KB | 112 012 KB | **34 683** | `ba513f2` ✓ | ✓ |
| **B — filter** | — | — | — | — | — | **FAILED, exit 1** |
| C — direct | **36 600 ms** | 247 504 KB | **64 196 KB** | **34 683** | `ba513f2` ✓ | ✓ |

*(The VM ran the spike branch's `recipe-common.sh`, which predates the `-not -name .git` fix, so its raw
`S07_FILES_ON_DISK` line reads 34 684. The 34 683 above is the settled definition, recomputed on the VM
afterwards and equal to the `ls-files -v` bridge count on both recipes.)*

### Finding 1 — recipe B does not exist on Ubuntu 22.04's stock git

```
$ git submodule update --init --depth 1 --filter=blob:none vendor/ServiceNowDocs
usage: git submodule [--quiet] [--cached]
   or: git submodule [--quiet] add [-b <branch>] ...
$ git submodule update -h | grep -i filter        # -> no output
```

`--filter` is **not a recognised option of `git submodule update` in git 2.34.1** — it is absent from the
usage text entirely, so this is an unsupported option and not a runtime failure. **Ubuntu 22.04 LTS is the
current LTS and ships 2.34.1**, so the recipe this spike recommends is unavailable on a large share of the
Linux machines the product will meet. Recipe C — which reaches the same end state through
`git clone --filter=blob:none` on the *submodule URL directly*, an option 2.34.1 does support — worked
without modification and is the portable path.

### Finding 2 — on git 2.34.1 the corpus is silently **missing its five root files**, `LICENSE` among them

Recipes A and C both exit 0, report a clean tree and the correct pin, and materialise **34 683** files
where every other cell measures **34 688**. The five are identified exactly, by differencing the
materialised set against the cone patterns' own definition (root files, plus everything under each of the
20 areas):

```
in expected but NOT materialised on git 2.34.1:
  .gitignore
  LICENSE
  README.md
  llms.txt
  llms_template.txt
(nothing materialised that was not expected)
```

**All five are the repository's root-level files.** Cone mode is documented to always match the root
directory; git 2.34.1 does not do so when `sparse-checkout set --cone <dirs>` names directories
explicitly.

**This is controlled for platform, not just observed.** The same OS — `ubuntu-22.04` — reports **34 689**
in CI, where git is 2.55.0. So the variable is the **git version**, not Linux:

| Cell | git | files on disk (old definition) |
|---|---|---|
| CI `ubuntu-22.04`, `macos-latest`, `windows-latest`, all recipes | 2.55.0 | 34 689 |
| macOS local | 2.39.5 | 34 689 |
| **Ubuntu VM** | **2.34.1** | **34 684** |

**Measured bracket: broken at 2.34.1, correct at 2.39.5.** The exact release that fixed it is *not*
established here and is deliberately not asserted — the git 2.36 release notes cover
`clone --filter --recurse-submodules`, which is a different change, and nothing in 2.38's notes matches.
Whoever sets the floor should confirm it from git's own release notes.

**Why this is not cosmetic.** A vendored documentation corpus that silently omits **`LICENSE`** is an
attribution defect — the tree ships without the upstream licence file, and nothing in the recipe's output
says so. Every check the recipe performs passes: exit 0, correct HEAD, empty `git status --porcelain`.
Only a file count catches it, and only against a known-good number.

### The root cause, isolated — and the recipe can be repaired instead of gated

Not inferred from the file list; reproduced in ten lines on the VM:

```
$ git --version ; git sparse-checkout set --cone a ; git sparse-checkout list
git version 2.34.1
--cone                                   <-- the FLAG is stored as a PATTERN
a
$ find . -type f -not -path './.git/*'
./a/f.txt                                <-- root1.txt and root2.txt are missing
```

**On 2.34.1 `sparse-checkout set --cone <dirs>` swallows `--cone` as a pattern**, so cone mode is never
enabled and the root directory — which cone mode always matches — is never included. `sparse-checkout
list` printing the flag back is the tell, and it is visible in the real corpus too: `s07-C`'s pattern
list begins with a literal `--cone` line.

*(The older `init --cone` + `set <dirs>` idiom does produce the root files on 2.34.1, but it warns
`unrecognized pattern: 'a'` / `disabling cone pattern matching` and falls back to non-cone matching. It is
**not** recommended here: its general correctness over 20 area patterns was not established, and a
fallback that silently changes matching semantics is the wrong fix for a bug whose symptom is silence.)*

**The repair, measured on the real corpus.** Materialise any *root-level* path the index still marks
skipped, after the cone is set:

```sh
# Materialise any ROOT-level path that sparse-checkout left marked skip-worktree.
# `-z` is load-bearing: without it `git ls-files -v` C-quotes unusual paths
# (rööt-3.txt renders as "r\303\266\303\266t-3.txt"), and field-splitting on
# whitespace loses everything after the first space in a path.
list_skipped_root() {
  git ls-files -v -z | tr '\0' '\n' | sed -n 's/^S //p' | grep -v '/' || true
}
n=$(list_skipped_root | grep -c . || true)
if [ "$n" -gt 0 ]; then
  list_skipped_root | tr '\n' '\0' | xargs -0 git update-index --no-skip-worktree
  git checkout -- .
  left=$(list_skipped_root | grep -c . || true)          # verify, never announce
  [ "$left" -gt 0 ] && { echo "REPAIR FAILED: $left root path(s) still skipped" >&2; exit 1; }
  echo "repaired $n root path(s)"
else
  echo "root paths already present -- no repair needed"
fi
```

**The first version of this snippet was defective, and the defect is worth recording** because it is the
same class as the bug it repairs. It used `awk '$1 == "S" && $2 !~ /\// { print $2 }'`, and on a portability
test with hostile root filenames it failed three ways at once: `$2` **truncated `root 2.txt` to `root`**;
without `-z`, `git ls-files -v` **C-quotes non-ASCII paths**, so `rööt-3.txt` arrives as
`"r\303\266\303\266t-3.txt"`; and one bad path made `update-index` abort, leaving *every* path unrepaired
— while the script still printed **"repaired 2 root path(s)"**. It announced a success it had not achieved.

The corpus's five root files are plain ASCII with no spaces, so the defective version happened to work on
them — which is exactly why it would have shipped. The corrected version is verified on **both toolchains**, against
the same hostile set (`root1.txt`, `root 2.txt`, `root'4.txt`, `rööt-3.txt`):

| Toolchain | Result |
|---|---|
| macOS 2.39.5, BSD `sed`/`xargs` | 4 restored · `git status` clean · second run a no-op |
| Ubuntu 22.04 git 2.34.1, GNU `sed` 4.8 | 4 restored · `git status` clean · second run a no-op |

**These four names are ARC-03's regression fixture** *(architect ruling, 2026-09-07)*: `root1.txt`,
`root 2.txt`, `root'4.txt`, `rööt-3.txt` — a plain name, a space, an apostrophe, and a non-ASCII name that
`git ls-files -v` C-quotes without `-z`. The completeness test asserts all four are restored **and** that
the step exits non-zero when they are not, because *"announces a success it has not achieved"* is the
failure mode the doctor must never have either.

Both are needed: this step ships in a recipe that runs on the machine with the *old* git, which is the
GNU side, and on the owner's macOS, which is the BSD side. It now **exits non-zero if any root path is
still skipped afterwards** instead of trusting itself.

Run against the broken `s07-A` tree at pin `ba513f2`:

```
before: materialised=34683  LICENSE=MISSING
repaired 5 root path(s)
after : materialised=34688  LICENSE=present  status=[]
run again -> root paths already present -- no repair needed
after 2nd: materialised=34688
```

**Exactly the modern-git number, a clean tree, and idempotent.** On git ≥ 2.39 nothing is skipped at the
root, so the step is a no-op — it is a repair, not a version branch. **This is what turns the finding from
"raise the floor and drop Ubuntu 22.04 LTS" into "add one step and keep it".**

### Consequences

1. **`floors.git = "2.25.0"` is not supportable and moves — see [`ADR-0008`](../../docs/decisions/ADR-0008-git-floor.md)**
   (Proposed), which supersedes only ADR-0001's `floors.git` row. With the repair step above the floor is
   **2.34.1**, the lowest version *proven* to yield a correct corpus; **2.39.5** is the lowest proven
   correct *without* it. Nothing below 2.34.1 is measured and none is asserted.
2. **ARC-03's doctor asserts corpus *completeness*, not just the pin** *(architect ruling, 2026-09-07)*.
   `rev-parse HEAD` equals the pin on a corpus missing five files, so the pin check cannot catch this. The
   assertion is **the five root files and the 20 cone areas**; the materialised count against a recorded
   number is the stronger form.
3. **Recipe B cannot be the documented default.** It is the fastest on modern git but unavailable on the
   current Ubuntu LTS. Recipe C is the portable recommendation, and it was also the fastest of the two
   that ran here (36.6 s vs 42.0 s) and the smallest on disk (64 MB of `.git` vs 112 MB).

### Windows VM

`DEFERRED — Windows VM pending (owner input #2)`.

## Verdict

`S-07: CONFIRMED WITH CORRECTIONS — recipe C is fastest and smallest on all four machines (302 MB macOS / 305 MB ubuntu / 315 MB windows on disk; 34,688 materialised files of 48,997 tracked; 37.6 s macOS, 23.6 s ubuntu-22.04, 30.3 s macos-latest, 35.6 s windows-latest) and pin-by-hash fetch works everywhere — but it needs a fifth step, `git submodule init`, without which the superproject reports the submodule uninitialised; and the core.longpaths control did NOT exercise MAX_PATH, so acceptance criterion 2 is unanswered for a real install path`

**Recipe C is recommended by measurement, with a fifth step added.** It is fastest on every machine and
its `.git` is a third smaller than either submodule-update recipe — but as the story specifies it, it
leaves the superproject's submodule uninitialised; ARC-03 should document
`… → absorbgitdirs → git submodule init`. Recipe B should not be offered: it is strictly worse than A on
time for a modest `.git` saving.

**Size, per machine rather than as one number.** C's total on disk is **302 MB** on macOS local,
**303 MB** on macos-latest, **305 MB** on ubuntu-22.04 and **315 MB** on windows-latest (258 616 KB tree
+ 64 231 KB `.git`; the Windows working tree is ~14 MB larger on identical content, the expected CRLF
expansion). An earlier version of this verdict said "under 310 MB everywhere" — false on the one platform
with the least headroom. The `03` fallback ("accept up to ~350 MB") is still **not needed**, since 315 <
350. The sentence for `docs/INSTALL.md`: *"The documentation corpus is a sparse checkout of the cited
areas — about 300 MB on disk, ~315 MB on Windows, and 25–40 seconds on a normal connection."* Note that
this measures **20** areas; ARC-03's generated set is **19**, about 6 MB smaller.

**Floors.** git **2.55.0** on the runners and **2.39.5** on macOS both clear the `01` §4.1 floor of
git ≥ 2.25, and no recipe needed anything newer in practice — but this record did not test at 2.25
itself, so it clears the floor by observation on 2.39.5+, not by proof at the floor. ADR-0001's
`floors.git` stands unless ARC-03 exercises 2.25 directly.

Choosing the recipe is ARC-03's decision; this record recommends by measurement and decides nothing.

## Evidence

- `docs-areas.txt`, `recipe-A-naive.sh`, `recipe-B-filter.sh`, `recipe-C-direct.sh`, `recipe-common.sh` — in this folder.
- Branches `spike/s-07-docs` (gitlink at the pin) and `spike/s-07-docs-tip` (gitlink at the tip).
- `.github/workflows/s07-recipes.yml`, run `34046585778` — the nine cells.

## Two gaps, named rather than papered over

1. ***(CLOSED 2026-09-06.)*** The Windows `core.longpaths` control ran — see the section above; the
   answer is that no recipe needs it.
2. **No VM samples.** The story says the VM numbers are the ones to quote for users, because runner
   network speed flatters the times. The macOS local run is a home-network sample and the closest thing
   here; it is 20–60% slower than the runners, which is the direction to expect.
