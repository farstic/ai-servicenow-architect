# ARC-03 — ServiceNowDocs corpus strategy

> **Amendment 2026-09-07 (from ARC-01-S02's R-4 scan).** **Any `gitleaks` step in CI must exclude
> `vendor/ServiceNowDocs`, or it will fail permanently from the moment the corpus lands.** Measured on
> the engine's checkout of the corpus: **592 rule hits**, of which **`curl-auth-user` ×526** — the REST
> API reference pages are full of `curl -u user:password` examples, plus `generic-api-key` ×44,
> `curl-auth-header` ×8, `private-key` ×8, `jwt` ×4 and two single hits. **None is a real credential**;
> they are documentation samples published by ServiceNow. For contrast the same scan over the engine's
> own history (59 commits) and over the ARC-01-S02 import artefact (57 commits) each returned **no leaks
> found**, so the corpus is the entire source of noise. Add `vendor/ServiceNowDocs` to `.gitleaksignore`
> or to the workflow's path filter, and say in the workflow why — a future maintainer who deletes the
> exclusion will get 592 failures and no explanation.


Status: **Stories drafted 2026-09-04** · **S01–S09 merged (9 of 11) — the M1 half of this ARC is complete; the rest is M2** · Depends on: ARC-01 · Blocks: ARC-06 (B02), ARC-08 (docs checks)

## Goal

Make the official documentation corpus cheap to obtain, pinned, verifiable and refreshable with one command, without giving up the engine's offline-first grounding rule: a shallow, cone-sparse `vendor/ServiceNowDocs` submodule whose checked-out areas are generated from the citations the skills actually make.

## Why it exists

Closes P-11: the corpus is today the dominant install cost (616 MB, 263 MiB history pack, 48,991 files), its pin drifted from May to July without a commit, two citations are dead (a third, in an agent file the old gate never scanned, is dead as well — see STORIES.md), and the citation gate exits 0 when the corpus is missing. The measured alternative (blobless, depth-1, cone-sparse clone of the cited areas) is 299 MB / 35,185 files / ~55 s (`00` §3.10). It also removes the never-executed "monthly bump ritual" (old README Step 8) by automating it, and surfaces the Apache-2.0 attribution the corpus requires (D-02).

## Scope

**In:** `.gitmodules` (`vendor/ServiceNowDocs`, `branch = australia`, `shallow = true`); pin re-seeded to `ba513f2` (the July refresh; full SHA `ba513f2c62d3698ef5bfdd8044110226b8419689`); `scripts/gen-docs-areas.mjs` → `vendor/docs-areas.txt` (one top-level `markdown/<area>` per line, derived from every citation in `.claude/skills`, `.claude/agents`, `governance/`, `docs/PLATFORM-NOTES.md`, `CLAUDE.md`); `tools/snowarch/lib/docs/verify.mjs` (port of `verify-citations.sh` incl. `{a,b}` brace forms; missing corpus = FAIL unless `--allow-missing`); repair of the dead citations; `./snowarch docs sync [--upstream] | verify | status | family <name>`; `.github/workflows/docs-bump.yml` (weekly: fetch upstream branch, move gitlink, verify, open a PR); `NOTICE` attribution and the install page's attribution line; `engine.config.json.docs.pin` == gitlink lint; a three-OS real-corpus CI job proving size and Windows long paths.
**Out:** on-demand fetching of individual documents at design time (would break offline grounding and the gate); refactoring the 34 directory-level citations to file level (not needed for sparse-by-area; may be a later improvement).

## Deliverables

- `.gitmodules` with `shallow = true`; the B02 recipe as a git-only command list (`./snowarch docs sync --print-recipe`) that ARC-06's `bootstrap.sh` / `bootstrap.ps1` execute when Node is absent and `tools/snowarch/lib/docs/checkout.mjs` executes otherwise. **Caveat S-07 must settle:** the naive `git submodule update --init --depth 1 vendor/ServiceNowDocs && git -C vendor/ServiceNowDocs sparse-checkout set --cone $(cat vendor/docs-areas.txt)` checks out the full 48,991-file tree first and only then narrows it, so wall time is that of a full checkout rather than the measured ~55 s; candidates are `git submodule update --init --depth 1 --filter=blob:none vendor/ServiceNowDocs` (the `--filter` option of `git submodule update` verified on git 2.39.5) followed by the sparse set, or a direct `git clone --filter=blob:none --no-checkout --depth 1 --sparse --branch australia <url> vendor/ServiceNowDocs` + `sparse-checkout set` + `checkout <pin>` + `git submodule absorbgitdirs` (the recipe that produced the 299 MB / 55 s measurement). Either recipe must fetch the pin **by SHA**: upstream `australia` is already past `ba513f2` (tip `11b39be` on 2026-09-04).
- `vendor/docs-areas.txt` (generated; CI fails when stale). Today's generated set is **19** areas: servicenow-platform, application-development, platform-user-interface, customer-service-management, platform-security, it-service-management, it-business-management, it-operations-management, intelligent-experiences, platform-administration, build-workflows, it-asset-management, api-reference, now-intelligence, integrate-applications, governance-risk-compliance, now-platform, employee-service-management, core-business-suite. (`now-assist`, listed in an earlier draft, is not a `markdown/` directory at `ba513f2` and is cited by no skill — the generator, never a hand list, is authoritative. The full corpus has 55 top-level directories at the pin; no number is hard-coded.)
- `tools/snowarch/lib/docs/{citations,verify,checkout,status,family}.mjs` + `tests/citations.test.mjs` and fixture-based tests; the dead citations remapped (`it-asset-management/itam-subscrip-summary.md`, `subscription-itam-licensing.md` in the licensing skill; `markdown/now-assist/` in the Now Assist agent).
- `snowarch docs` subcommands; `docs-bump.yml`; `docs-real.yml` (three-OS real-corpus proof); `docs/ARCHITECTURE.md` section "Docs corpus: how the pin, the areas file and the gate relate" including the `docsStatus()` JSON shape consumed by ARC-08 and `/snowarch status`.
- `NOTICE` (Apache-2.0, Copyright 2026 ServiceNow — ARC-01 creates the file, ARC-03 owns the corpus paragraph) and the attribution line printed by B02 / `docs sync`.

## Dependencies

ARC-01 (layout, `engine.config.json` + schema, `LICENSE`/`NOTICE` files, CI skeleton). ARC-02 for the canonical `.claude/` location the scanner reads (interim `--legacy-roots`). ARC-00 S-07 result for the recipe choice, pin-by-SHA confirmation, Windows long-path confirmation and the size/time statement in the install page. Note on D-06: ARC-06 may not start before the S-14 plugin spikes conclude; ARC-03 must therefore not be on ARC-06's critical path — the recipe block (`--print-recipe`) and the `docsStatus()` shape are published as soon as S05/S06 merge so ARC-06 and ARC-08 can proceed in parallel.

## Acceptance criteria

- [ ] A fresh user on a clean machine with git ≥ 2.25 runs B02 (`./snowarch docs sync`) and obtains a working tree ≤ 350 MB containing every file cited by the skills; `./snowarch docs verify` reports `checked: ≥ 160 | dead: 0` (163 distinct normalised citations measured 2026-09-04 across all scan roots; the old script's "175" counted punctuation variants and is not the reference — see STORIES.md facts block). (S05, S06)
- [ ] `./snowarch docs verify` on a checkout **without** the submodule exits non-zero with "corpus missing — run ./bootstrap.sh --docs sparse (or ./snowarch docs sync)" (never SKIP); the doctor shows FAIL. (S03, S06, S11)
- [ ] `engine.config.json.docs.pin` equals `git ls-tree HEAD vendor/ServiceNowDocs`; the lint fails when they differ. (S01)
- [ ] `scripts/gen-docs-areas.mjs --check` fails in CI when a skill cites an area missing from `vendor/docs-areas.txt`. (S02)
- [ ] `docs-bump.yml` opened at least one PR in a dry run containing the new pin, the verification output and the list of newly dead citations (if any). (S07, S09)
- [ ] `./snowarch docs family zurich --dry-run` prints the exact edits it would make (gitmodules branch, config, gateway skill sentences) and refuses without `--yes` — Propose → Review → Apply per design principle 10. (S08)
- [ ] `--docs full` yields the full checkout (every `markdown/*` directory); `--docs skip` yields a doctor FAIL with the sync remedy. (S05, S11)
- [ ] The three-OS real-corpus job is green on native `windows-latest` with `core.longpaths` set by the recipe. (S11)

## Known state of upstream at ARC-03-S07 (2026-09-09)

Measured by the one real `docs sync --upstream` run, then reverted — the pin in the repository is
still `ba513f2…`:

| | |
|---|---|
| pinned | `ba513f2` (2026-07-09) |
| upstream tip of `australia` | `11b39be` (2026-08-28) — **seven weeks ahead** |
| citations after the move | `checked: 180 \| dead: 1` |
| what breaks | `.claude/skills/now-assist-genai/SKILL.md:40` → `markdown/intelligent-experiences/ai-control-tower/ai-gateway-overview.md` |

**S09's first bump PR will exit 1 and carry exactly one remap.** Recorded here so that is a known
quantity rather than a surprise on the first automated run.

## Risks

> **Amendment 2026-09-07 (ADR-0008 option A).** Recipe C is five steps **plus an idempotent repair step** that materialises any root-level path git left `skip-worktree` after `sparse-checkout set --cone` (git 2.34.1 stores the flag as a pattern; no-op on ≥ 2.39). `floors.git` stays 2.34.1 — stock Ubuntu 22.04 LTS remains supported. The completeness check (five root files + every cone area) is the safety net.

> **Amendment 2026-09-07 (from `03` §F S-07 Ubuntu).** The git floor is raised by ADR-0008 (bracket: 2.34.1 silently omits the corpus root files incl. `LICENSE`; 2.39.5 correct); `snowarch docs verify` and the doctor assert the presence of the five root files and every cone area — a pin match alone is not completeness. Recipe B is gone from every list (no `--filter` on stock Ubuntu LTS git).

> **Amendment 2026-09-06 (from `03` §F S-07, superseded row).** Recipe C is documented as **five** steps — the fifth is `git submodule init`, without which the superproject reports the populated corpus as uninitialised (`-` in `git submodule status`). Reconcile the cited-areas list before any number travels: the STORIES text says 19 in five places and 20 in one; `markdown/release-notes` is cited only by `README.md`, not by any skill or agent — decide in S02 whether it is in scope (architect recommendation: exclude) and regenerate the areas file from that rule. Size sentence for INSTALL.md: "about 300 MB on disk, ~315 MB on Windows". The Windows `core.longpaths` question is open until the VM run at a realistic path.

- Submodule depth-1 without a blob filter may cost ~350 MB instead of ~300 (S-07). Mitigation: acceptable; record the measured number in the install page (S10/S11 copy it from the CI summary).
- Upstream force-pushes or branch renames (`australia` → next family). Mitigation: `docs family` command; `docs sync --upstream` and the bump workflow fail loudly with a named remedy, never auto-merge.
- Windows long paths with 35k files (longest corpus path is 197 characters; with a typical checkout prefix it exceeds `MAX_PATH`). Mitigation: the recipe passes `-c core.longpaths=true` and persists it in the submodule config on win32 (S-07 verifies; S11 proves weekly). Per Q-B the Windows path is native first-class; if S-03/S-04/S-08 fail their time-box the product falls back to "Git Bash required", which does not change this ARC's recipe (it never depends on bash).
- The first network call of the install is the corpus fetch, so corporate proxies and TLS-intercepting gateways surface here first (R-3). Mitigation: `docs sync` maps git's DNS / TLS-CA / proxy failures to exact remedies (S05); the wizard probe (ARC-07) and the doctor (ARC-08) carry the equivalent checks for the server's own `fetch`.

## Stories

Full write-ups: [`STORIES.md`](STORIES.md). Sizes: S ≤ ½ day · M 1–2 days · L 3–5 days. Total 18.5–23.5 engineer-days (per-story ranges in STORIES.md "Sizing summary").

| ID | Title | Size |
|---|---|---|
| ARC-03-S01 | Shallow submodule at `vendor/ServiceNowDocs`, pin re-seeded to `ba513f2`, pin recorded in `engine.config.json` with a pin-equals-gitlink lint | M |
| ARC-03-S02 | Citation scanner library, `scripts/gen-docs-areas.mjs` and generated `vendor/docs-areas.txt` with a CI staleness check | M |
| ARC-03-S03 | Port `verify-citations.sh` to `tools/snowarch/lib/docs/verify.mjs`; brace and directory forms; missing corpus = FAIL | M |
| ARC-03-S04 | Repair the dead citations (two in the licensing skill, one in the Now Assist agent) | S |
| ARC-03-S05 | `snowarch docs sync` — the checkout/reconcile recipe (sparse · full · skip), pinned-SHA fetch, Windows long paths; the Node-free launcher recipe text | L |
| ARC-03-S06 | `snowarch docs verify` and `snowarch docs status`; the `docsStatus()` data shape consumed by the doctor and `/snowarch status` | M |
| ARC-03-S07 | `snowarch docs sync --upstream` — move the pin to the upstream tip, verify, print the dead-citation diff (maintainer) | M |
| ARC-03-S08 | `snowarch docs family <name> --dry-run|--yes` — release-family switch with a printed edit plan and gateway-skill re-lint | M |
| ARC-03-S09 | `.github/workflows/docs-bump.yml` weekly PR with pin, verification output and newly dead citations | M |
| ARC-03-S10 | `NOTICE` attribution, the B02/`docs sync` attribution line, install-page attribution and size/time statement, `docs/ARCHITECTURE.md` corpus section | S |
| ARC-03-S11 | Windows long-path CI proof and `--docs skip` → doctor FAIL wiring (three-OS real-corpus job) | M |
