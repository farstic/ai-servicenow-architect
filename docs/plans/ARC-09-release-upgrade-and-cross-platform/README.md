# ARC-09 — Release, versioning, upgrade and cross-platform proof

Status: **Stories drafted 2026-09-04** · Depends on: ARC-01 (version of record, CI skeleton), ARC-02 (`CLAUDE.md` marker line; `/snowarch status` renders the doctor JSON whose `engine` header S04 feeds), ARC-03 (docs pin, `docs sync` recipe, `docs verify`, `docs-real.yml`), ARC-04 (store module, `build-dist.mjs`, `contract.json`, server doctor module, package identity), ARC-05 (contract gate, error registry), ARC-06 (first `version`, bootstrap state/resume, launchers, `bootstrap` CI job, handshake module), ARC-07 (`--password-stdin`, non-interactive `instance add` with `--no-probes`), ARC-08 (doctor registry/JSON, `doctor` CI job, banner nudge slot); ARC-00 S-03/S-04/S-07/S-08 verdicts and story S13 · Blocks: ARC-10 (the 2.0.0 tag)

## Goal

Ship one versioned artefact — a git tag whose message records the contract sha and the docs pin — produced by a release script that rebuilds `dist/`, runs every gate and generates the changelog; give users `./snowarch upgrade` that re-runs only the bootstrap steps whose inputs changed; and prove the design-only and live paths on macOS, Linux and native Windows on every commit.

## Why it exists

Closes P-12 (five counters, zero tags), P-19 (server version drift), P-29 (CI never ran tests; release never fired), P-37 (pre-commit gates inert per clone — replaced by CI), P-40 (Windows native path never proven), and the "monthly bump ritual never executed" half of P-11 (automated in ARC-03; verified here on the release path).

## Scope

**In:** `scripts/release.mjs`; tag format and message; `docs/CHANGELOG.md` generation (conventional commits); `CLAUDE.md` version line and README badge written by the script; `snowarch version|upgrade`; input-hash invalidation rules; store schema migration framework (explicit, versioned, backed up); `.gitattributes`; CI matrix `ubuntu-latest` / `macos-latest` / `windows-latest` × Node 20/22/24 with jobs: lint, server tests, contract, dist rebuild-diff, design-only bootstrap, doctor, citations; Windows job without Git Bash; release workflow on tag; optional secondary npm publish job (`--provenance`, disabled by default — roadmap `01` §17).
**Out:** plugin/marketplace packaging (roadmap), Docker (removed by D-03).

## Deliverables

- `scripts/release.mjs <x.y.z>`: bump root and package versions; rebuild `dist/`; run `npm test`, contract, engine lint, citations; write `CLAUDE.md` version line, README badge, `docs/CHANGELOG.md`; commit; tag `v<x.y.z>` with message `contract: <sha>\ndocs-pin: <sha>\nclaude-floor: <ver>`; refuse on any failing gate or dirty tree.
- `.github/workflows/release.yml`: on `v*` tags, re-run all gates on three OSes and attach the doctor JSON and the install-page size/time table as release assets.
- `./snowarch version` (version, tag, contract sha, docs pin, floors); `./snowarch upgrade [--to vX.Y.Z]` (`git fetch --tags`, checkout or `pull --ff-only`, `bootstrap --resume`, doctor); the SessionStart banner's "behind origin" nudge (reads a cached fetch, never fetches itself).
- Input-hash table (documented in `docs/ARCHITECTURE.md`): `package-lock.json` → B04; `dist/contract.json` sha → B05/B08; `vendor/docs-areas.txt` + gitlink → B02; store schema version → B06 migration; `.mcp.json` / `.claude/settings.json` hashes → B01/B07.
- Store migration framework in `packages/snowarch` (`version: 1` → n; backup file `instances.json.bak-<ts>` with 0600; never touches credentials' values).
- CI matrix with the Windows job proving `bootstrap.cmd`, `snowarch.cmd`, masked input (`--password-stdin` path in CI), the MCP handshake, and the SessionStart hook in exec form.
- `.gitattributes` (LF for `*.mjs *.md *.json *.sh`; CRLF for `*.ps1 *.cmd`); `docs/CONTRIBUTING.md` release section.

## Dependencies

ARC-01, ARC-02, ARC-03, ARC-04, ARC-05, ARC-06, ARC-07, ARC-08 (per-story detail in `STORIES.md`). ARC-00 S-03/S-04/S-07/S-08 verdicts (Q-B) and the story ARC-00-S13 PATH-stripping recipe (`spikes/windows-recipe.md` — not spike S-13, which is the skill listing deferred to ARC-02) for the Windows job design; ARC-00 S-19 for `plugin-validate`.

## Acceptance criteria

- [ ] `node scripts/release.mjs 2.0.0` on a green tree produces one commit and one tag; `git show v2.0.0` displays the contract sha and docs pin; `./snowarch version` prints the same values; `tests/version-consistency.test.mjs` passes. (S01, S04)
- [ ] The same command on a tree with a stale `dist/` or a failing lint exits non-zero without committing or tagging. (S01)
- [ ] A user on `v2.0.0` runs `./snowarch upgrade --to v2.1.0` (fixture release changing only `vendor/docs-areas.txt`; the S07 harness uses `v9.0.0 → v9.1.0`): only B02 re-runs, credentials untouched (`sha256 .local/instances.json` unchanged), doctor 0 FAIL. (S05, S07)
- [ ] A fixture release changing the store schema migrates the store, leaves a 0600 backup, and the server loads it. (S06, S07)
- [ ] CI is green on all nine matrix cells; the Windows cell runs with Git Bash removed from PATH and passes the design-only bootstrap, the doctor and the MCP handshake. (S08)
- [ ] `git ls-files --eol` shows the expected line endings; a Windows checkout of `bootstrap.ps1` runs without a line-ending error. (S09)
- [ ] `docs/CHANGELOG.md` for 2.0.0 contains the "supersedes engine v2.8.0 and snow-mcp 1.0.0" note and the migration notes from ARC-04 (R-03). (S02)

## Risks

> **Amendment 2026-09-06 (from `03` §F S-14f).** `scripts/release.mjs` checks the working tree is clean **before** testing whether the tag exists — the CLI's own plugin-tag command does it the other way round and a stale tag then masks a dirty tree until the version moves. Every product manifest carries `author` (S-19: `--strict` fails on that warning).

- Windows CI runners differ from consultant laptops (policies, AV). Mitigation: S-08 on a real locked-down VM; the install page states the tested configurations.
- Conventional-commit discipline slips. Mitigation: commitlint in CI; the release script falls back to a manually edited changelog section.

## Stories

Full write-ups (persona, context, scope, design notes, acceptance criteria, tasks, test strategy, dependencies, size, risks, definition of done) are in [`STORIES.md`](STORIES.md). The original title 4 (`version` + `upgrade` + nudge) is split into S04 and S07; title 9's package name is corrected to `@farstic/snowarch` per D-01. Sizing summary: 15–25 engineer-days (3–5 weeks for one engineer).

| ID | Title | Size |
|---|---|---|
| ARC-09-S01 | `scripts/release.mjs`: preflight, gates, version writes, release commit, annotated tag with contract sha and docs pin | L |
| ARC-09-S02 | `docs/CHANGELOG.md` generation from conventional commits; commit-message lint in CI; the 2.0.0 "supersedes" and migration notes | M |
| ARC-09-S03 | `.github/workflows/release.yml`: on `v*` tags re-run every gate on three OSes, create the GitHub Release with doctor JSON and install-metrics assets | M |
| ARC-09-S04 | `./snowarch version` extended (tag, commit, tag-message comparison; `--json` superset of ARC-06-S02's shape; feeds the doctor's `engine` header) | S |
| ARC-09-S05 | Input-hash invalidation table: `lib/inputs.mjs`, `state.staleSteps()`, `tests/input-hash.test.mjs`, `docs/ARCHITECTURE.md` section | M |
| ARC-09-S06 | Store schema migration framework in `packages/snowarch` (explicit, versioned, 0600 backup, credential values never touched) | M |
| ARC-09-S07 | `./snowarch upgrade [--to vX.Y.Z] [--check]`, the SessionStart "behind origin" nudge, and the upgrade fixture harness | L |
| ARC-09-S08 | CI matrix completion: every job on the intended cells; the Windows job without Git Bash (launchers, `--password-stdin`, MCP handshake, hook in exec form) | L |
| ARC-09-S09 | Line-ending proof: `tests/eol.test.mjs` over `git ls-files --eol`; launchers run from a CRLF-default Windows checkout | S |
| ARC-09-S10 | Optional `publish-npm.yml`: `npm publish --provenance` of `@farstic/snowarch` from a release tag, manual dispatch, dry-run by default (roadmap `01` §17 item 2) | S |
| ARC-09-S11 | `docs/CONTRIBUTING.md` release / upgrade / CI-matrix sections; `docs/INSTALL.md` "Upgrading" section; `docs/ARCHITECTURE.md` versioning section | S |
