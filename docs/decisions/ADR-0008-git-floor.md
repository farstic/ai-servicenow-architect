# ADR-0008 — Git floor, and the sparse-checkout repair that keeps it low

> **What this is:** an Architecture Decision Record for the *product*, not for a client engagement. It uses the engine's ADR template (`reference/templates/adr-template.md`) with the engagement fields adapted for an engine-level decision, exactly as ARC-00-S03's design notes prescribe. ADRs are immutable once Accepted: a later change is a **new** ADR that supersedes this one, never an edit.

---

| Field | Value |
|---|---|
| **ADR ID** | ADR-0008 |
| **Title** | Git floor, and the sparse-checkout repair that keeps it low |
| **Status** | **Accepted (2026-09-07, option A)** — supersedes the `floors.git` row of **ADR-0001** only. Every other value in ADR-0001 stands unchanged. The `--cone` reproduction and the repair step were independently reproduced by the architect on the same VM before acceptance. |
| **Date** | 2026-09-07 |
| **Decision owner** | Cvetomir Grigorov (owner) — initials `PENDING OWNER` |
| **Engagement** | AI ServiceNow Architect — product |
| **Release family** | Australia (docs corpus) |
| **§1.1 relevance** | None |
| **Related** | Supersedes `floors.git` in ADR-0001 · spike **S-07** (ARC-00-S09) · consumed by ARC-03 (corpus recipe + doctor) and ARC-08 |

## Context

ADR-0001 fixed `floors.git = "2.25.0"`. **That value cannot be met by the recipes as written**, and the
failure is silent. Measured on `arc00-ubuntu` (Ubuntu 22.04.5 LTS, stock **git 2.34.1**) on 2026-09-07,
independently reproduced by the architect on the same VM:

1. **Recipe B does not exist below some version above 2.34.1.** `--filter` is absent from
   `git submodule update`'s usage text entirely.
2. **Recipes A and C exit 0, report a clean tree and the correct pin — and silently omit five files:**
   `.gitignore`, **`LICENSE`**, `README.md`, `llms.txt`, `llms_template.txt`. Every check the recipe
   performs still passes. A vendored corpus shipping without the upstream `LICENSE` is an attribution
   defect, not a cosmetic one.

Controlled for platform: the **same OS** (`ubuntu-22.04`) reports the correct 34 689 in CI, where git is
2.55.0. The variable is the git version.

**The root cause is now isolated**, in a ten-line reproduction rather than inferred:

```
$ git --version ; git sparse-checkout set --cone a ; git sparse-checkout list
git version 2.34.1
--cone            <-- the FLAG is stored as a PATTERN
a
$ find . -type f -not -path './.git/*'
./a/f.txt         <-- root1.txt and root2.txt are missing
```

On 2.34.1 `sparse-checkout set --cone <dirs>` **swallows `--cone` as a pattern**, so cone mode is never
enabled and the root directory — which cone mode always matches — is not included. `git sparse-checkout
list` prints the flag back, which is the tell. Modern git parses the flag.

## Decision

**Two changes, and the first is what makes the floor a small question rather than a large one.**

**1. The corpus recipe gains an explicit root-file repair step, and the doctor asserts the result.**
After `sparse-checkout set --cone`, materialise any *root-level* path the index still marks skipped:

> ⚠ **The snippet below is superseded by the corrected implementation in
> [`spikes/S-07-docs-submodule/README.md`](../../spikes/S-07-docs-submodule/README.md), and ARC-03 must
> take the corrected one.** A portability test after this ADR was accepted found the version below
> defective: `awk`'s `$2` truncates a path at the first space, `git ls-files -v` without `-z` C-quotes
> non-ASCII paths, and one bad path aborts `update-index` while the script still prints success. The
> **decision** — a repair step plus `floors.git` = `2.34.1` — is unaffected, so this note is a pointer
> rather than a change to the decision; if the architect wants the block itself replaced, that is
> **ADR-0009 superseding this ADR**, per the immutability rule. Recorded 2026-09-07.

```sh
skipped=$(git ls-files -v | awk '$1 == "S" && $2 !~ /\// { print $2 }')
if [ -n "$skipped" ]; then
  printf '%s\n' "$skipped" | tr '\n' '\0' | xargs -0 git update-index --no-skip-worktree
  printf '%s\n' "$skipped" | tr '\n' '\0' | xargs -0 git checkout --
fi
```

Measured on the real corpus at pin `ba513f2`: **34 683 → 34 688 files, `LICENSE` present, `git status`
clean, and a second run is a no-op** ("root paths already present"). On git ≥ 2.39 nothing is skipped at
the root, so the step costs nothing and changes nothing — it is a repair, not a branch.

**2. `floors.git` moves from `2.25.0` to `2.34.1`** — the lowest version *proven* to produce a correct
corpus, with the repair step applied. `2.39.5` is the lowest version proven correct *without* it.

**Recipe B is removed from every recipe list.** It cannot run on the current Ubuntu LTS. Recipe C is the
documented path: it needs no `git submodule update --filter`, and on the VM it was also the faster of the
two that ran (36.6 s vs 42.0 s) and the smaller on disk (64 MB of `.git` vs 112 MB).

## Options considered

| Option | Summary | Pros | Cons |
|---|---|---|---|
| **A (chosen)** | Repair step in the recipe; floor `2.34.1` | Ubuntu 22.04 LTS — the current LTS — keeps working; the step is idempotent and a no-op on modern git; the corpus is identical on every version | One more line in the recipe; `2.34.1` is a measured floor, not a derived one |
| B | Floor `2.39.5`, no repair | Nothing to maintain; matches unmodified upstream behaviour | **Excludes stock Ubuntu 22.04 LTS entirely.** Every 22.04 user must add a PPA or build git before installing |
| C | Keep `2.25.0` | No ADR needed | Not supportable: 2.25.0 is unmeasured, and everything measured below 2.39.5 produces a corpus missing `LICENSE` |

## Consequences

- **ARC-03's doctor asserts corpus *completeness*, not just the pin.** A `rev-parse HEAD` check passes on a
  corpus missing five files. The assertion is the five root files plus the 20 cone areas.
- **`spikes/engine.config.seed.json` carries `floors.git = "2.34.1"`** on this ADR's acceptance.
- **The bracket below 2.34.1 is deliberately not asserted.** Nothing under 2.34.1 has been measured, and
  neither the release that fixed the `--cone` parsing nor the one that added `submodule update --filter`
  has been established from git's release notes (2.36's notes cover
  `clone --filter --recurse-submodules`, a different change; 2.38's match nothing). **If a lower floor is
  ever wanted, measure it** — do not infer it.
- **This ADR supersedes only ADR-0001's `floors.git` row.** ADR-0001 is not edited; it remains Accepted and
  immutable, and a reader following the supersession chain lands here.

## Follow-ups

| # | Item | Owner |
|---|---|---|
| 1 | ~~Move to **Accepted** once the owner rules on option A vs B~~ — **done 2026-09-07: option A** | — |
| 2 | Land the repair step in the ARC-03 corpus recipe and the completeness check in the doctor — **use the corrected snippet in the S-07 record, not the block above** | ARC-03 |
| 4 | ~~Architect to rule whether the corrected snippet warrants **ADR-0009**~~ — **ruled 2026-09-07: no ADR-0009, the pointer suffices.** A code sample inside an ADR is illustration, not decision; the immutability rule protects the *decision*, which is unchanged. ARC-03-S02's story text cites the **S-07 record** as the source of truth for the snippet, never this ADR. | — |
| 3 | Optional: narrow the floor below 2.34.1 by measuring 2.26–2.33 — worth it only if a distro that matters ships one of them | — |
