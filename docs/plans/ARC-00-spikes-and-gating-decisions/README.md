# ARC-00 — Spikes and gating decisions

Status: **Stories drafted 2026-09-04** · Depends on: nothing · Blocks: every other ARC

## Goal

Turn every unverified assumption the chosen design rests on into a verified fact (or a documented fallback), and record the six owner decisions plus the post-decision rulings, **before** any product code is written. No deliverable of this ARC ships to end users.

## Why it exists

The candidate designs, the three judges and the completeness review flagged the behaviours of Claude Code, git, npm and Windows listed in `03-RISKS-AND-UNKNOWNS.md` §A (S-01 … S-18) — relied on by the plan but read in documentation rather than exercised. Two of them change a user-visible promise (S-01 approval pre-seeding, S-08 Windows launcher) and one is a legal gate (licence, `00` P-32, D-02). Building on a misremembered mechanism is worse than not building; this ARC is the cheap insurance. Pain points touched: P-15 (names, D-01), P-32 (licence, D-02), P-28/P-31/P-07/P-14 (scope cut, D-03), P-38 (auth, D-04), P-03 posture (D-05), P-40 (native Windows never run, Q-B).

## Scope

**In:** spikes S-01 … S-18 of `03` §A **including the plugin-channel spikes S-14a–g** of `03` §B (D-06 hedge, decided 2026-09-04: S-14 is time-boxed to one week and must conclude before ARC-06 starts, so the channel decision can be re-opened before any bootstrap investment) and the minor fold **S-19** (`claude plugin validate` on a headless CI runner); **S-20** (shell-environment inheritance of project stdio servers — `HTTPS_PROXY` / `NO_PROXY` / `NODE_EXTRA_CA_CERTS` — proposed by ARC-04-S11 and the ARC-08 README after `03` was written; folded into story S06); decision capture for D-01 … D-06 of `02` and the post-decision rulings Q-A, Q-B, R-1, R-2, R-3; Architecture Decision Records for all of them; a throwaway spike workspace (`snowarch-spikes`, never the two existing repositories); one macOS, one Ubuntu and one Windows 10/11 VM or machine without Git Bash, each with Claude Code at the floor **2.1.214** and at the current release.
**Deferred, not skipped:** S-10 (needs the ARC-04 SCRIPTING gate split and a PDI) → ARC-04; S-13 (needs ARC-02's ≤ 500-char descriptions) → ARC-02. Both are marked `Deferred → ARC-NN` in `03` §A with the exact check quoted (story S14).
**Out:** any change to `AI-Architect-Claude` or `snow-mcp`; any product code; the proxy/TLS-CA stories of R-3 (they are implementation stories in ARC-04 / ARC-07 / ARC-08, not spikes).

**Decision status (2026-09-04):** D-01 … D-06 are all decided in `02`; the ADR story captures them. Names in force everywhere in this ARC: repo `farstic/ai-servicenow-architect`, CLI `snowarch`, MCP key `servicenow` (tools `mcp__servicenow__snow_*`), npm `@farstic/snowarch` in `packages/snowarch` (the existing `@farstic/snow-mcp@1.0.0` is never touched), first release `2.0.0`, project skill `/snowarch` with `status` · `setup-instance` · `doctor`. D-05 carries an owner modification (non-production instances propose `full`; principle 10 "Propose, don't impose") that ARC-06/ARC-07 must honour. Q-B makes native Windows first-class **conditional** on S-03 / S-04 / S-08 passing; the fallback "Git Bash required" is pre-recorded in `03` §A and `01` §13 and is applied by story S14 without re-planning.

## Deliverables

- `spikes/` in the throwaway `snowarch-spikes` repository (imported by ARC-01 as `docs/spikes/`): one record per spike (`S-NN-<slug>/README.md` with a script where automatable), the observed output (secrets redacted) and a verdict line `S-NN: CONFIRMED | FAILED → fallback <text>`; plus the zero-dependency stub MCP server and the spike-record template.
- `03-RISKS-AND-UNKNOWNS.md` §A and §B updated with Status and Evidence columns (Confirmed / Failed-fallback adopted / Deferred → ARC-NN / Not proven within time-box), the S-19 and S-20 rows added, and §C R-15 annotated with the S-20 verdict.
- `docs/decisions/ADR-0001-names.md`, `ADR-0002-licence.md`, `ADR-0003-scope-cut.md`, `ADR-0004-credential-policy.md`, `ADR-0005-permission-posture.md`, `ADR-0006-distribution-channel.md` and `ADR-0007-post-decision-rulings.md` (Q-A, Q-B, R-1, R-2, R-3) using the engine's own ADR template (`reference/templates/adr-template.md` today; `templates/adr-template.md` after ARC-02). ADR-0006 starts *Proposed* and is moved to *Accepted* ("monorepo path confirmed") or superseded by ADR-0008 ("channel decision re-opened") by the S-14 story, before ARC-06's first story.
- `spikes/engine.config.seed.json`: the agreed values for names, floors, docs family/pin, skill name — the value set ARC-01's `engine.config.json` starts from.
- `LICENSE` (Apache-2.0) and `NOTICE` text agreed, the relicensing sentence for the first commit, the header-sweep list, and — because the engine history has a second contributor (`RobertBH17`, commit `5b40835`, 2026-06-09, PR #1; verified 2026-09-04) — either that contributor's written consent to Apache-2.0 or the list of files from that commit ARC-01 rewrites before import (content only; committed by ARC-01).
- A Windows test recipe (`spikes/windows-recipe.md`: VM snapshots + the PATH-stripping steps for a `windows-latest` runner) reused by ARC-06/ARC-09 CI.
- Measured numbers handed to later ARCs: S-01 dialog count, S-06 cold start and `MCP_TIMEOUT`, S-07 docs size/time and recipe letter, S-15 install size, S-20 inherit-or-forward verdict (ARC-04-S11, ARC-06 `.mcp.json` `env`, ARC-08 E-26).

## Dependencies

None. The owner's answers in `02` are the only external input, and they are all recorded.

## Acceptance criteria

- [ ] Every row S-01 … S-20 in `03` §A/§B carries a Status and a pointer to its evidence; no row remains "unverified"; S-10 and S-13 read `Deferred → ARC-04` / `Deferred → ARC-02` with the check quoted and the owning story named (ARC-04-S05, ARC-02-S03).
- [ ] S-20 verdict states, for macOS and Windows (cmd and PowerShell 5.1), whether `HTTPS_PROXY` / `NO_PROXY` / `NODE_EXTRA_CA_CERTS` exported in the launching shell reach the server spawned from `.mcp.json`, and what `${HTTPS_PROXY:-}` yields when unset (story S06).
- [ ] S-01 verdict states the exact number of dialogs a fresh user sees on first `claude` after `./bootstrap.sh --mode live` (expected 1 or 2) on macOS **and** Windows, on Claude Code 2.1.214 and the current release.
- [ ] S-03/S-04/S-08 were executed on a Windows machine **without** Git Bash on PATH (`where bash` empty, quoted in each record), and the Q-B outcome (native first-class vs "Git Bash required") is written into `01` §13 and ARC-09.
- [ ] S-07 records size on disk and wall time for the three B02 candidate recipes on all three OSes and names the recipe ARC-03 documents.
- [ ] S-18 shows a user prompt for a `mutates:true` tool in auto mode (or records the plan limitation and keeps ARC-05's PreToolUse fallback story open).
- [ ] Seven ADRs exist; ADR-0001…0005 and 0007 with status Accepted and the owner's `DECIDED` text quoted; ADR-0006 resolved as above before ARC-06-S01.
- [ ] `spikes/engine.config.seed.json` values for names and floors are fixed (D-01, R-1, R-2, S-11) and referenced by the ADRs; `floors.claude` equals the S-11 verdict.
- [ ] A relicensing statement for both source repositories is agreed in writing (D-02) and the `@farstic/snow-mcp@1.0.0` npm record is explicitly left untouched; `RELICENSING.md` quotes `git shortlog -sn HEAD` of both repositories and records, for the engine's second contributor, either written consent or the rewrite-before-import file list (story S02).
- [ ] S-14a–g (plugin channel) and S-19 carry verdicts within the one-week time-box, and ADR-0006 records either "monorepo path confirmed" or "channel decision re-opened" **before** ARC-06's first story starts (D-06 hedge).
- [ ] The gate sign-off block (ARC-01 entry: D-01/D-02/D-03; ARC-06 entry: S-01/S-03/S-05/S-08/S-09/S-15/S-16 + S-14 conclusion + Q-B) is present at the end of this README with dates and the owner's initials.

## Risks

- A spike fails with no acceptable fallback (most likely S-03 on Windows). Mitigation: each spike lists its fallback in `03`; a failed S-03 downgrades native Windows from "first-class" to "Git Bash required" in `01` §13 and ARC-09 (Q-B, pre-recorded — no re-planning).
- The Claude Code floor 2.1.214 cannot be installed side by side with the current release on one OS. Mitigation: S-11 records the OSes it was exercised on; the floor verdict rests on those.
- S-14 proves the plugin channel and the owner re-opens D-06. Mitigation: that is the purpose of the hedge; ADR-0008 supersedes ADR-0006 and ARC-06/ARC-07 are re-planned before any bootstrap investment. Nothing else in ARC-00 is wasted.
- Auto mode (S-18) depends on the account plan. Mitigation: record the plan; ARC-05 keeps the deny + PreToolUse-hook fallback story until S-18 is confirmed.
- Corporate proxies / TLS-intercepting gateways are not spiked here (R-3). Mitigation: ARC-04 (proxy agent, `NODE_EXTRA_CA_CERTS`), ARC-07 (probe diagnosis) and ARC-08 (doctor checks) carry the implementation stories; the one proxy-adjacent *platform* question — whether the spawned server inherits those variables at all — is S-20 in story S06.
- The engine history is not single-author (`RobertBH17`, one commit). Mitigation: story S02 records consent or a rewrite list; the affected skills are rewritten in ARC-02 anyway (description cap), so resolution (b) costs nothing extra if consent does not arrive.

## Stories

Detailed write-ups (persona, context, scope, design notes, acceptance criteria, tasks, tests, size, risks, definition of done) are in [`STORIES.md`](STORIES.md). Each story keeps one record folder and one verdict line per spike; merges group spikes that share an environment and a procedure.

| ID | Title | Size |
|---|---|---|
| ARC-00-S01 | Spike workspace, stub MCP server and three clean test environments | L |
| ARC-00-S02 | Licence and relicensing statement (D-02): `LICENSE`, `NOTICE`, header sweep list | S |
| ARC-00-S03 | ADR-0001…ADR-0006 (+ ADR-0007 post-decision rulings) and the `engine.config.json` value set | M |
| ARC-00-S04 | First-session spikes: S-01 pre-seeded approval, S-16 project `permissions.allow`, S-17 unconfigured server | M |
| ARC-00-S05 | Permission-rule spikes: S-18 `permissions.ask` in auto mode, S-12 middle-wildcard globs | M |
| ARC-00-S06 | Hook and path-expansion spikes: S-03 `${CLAUDE_PROJECT_DIR}` on native Windows, S-05 hook with Node absent, S-20 shell-env inheritance | M |
| ARC-00-S07 | Windows console spikes: S-04 raw-mode masked input, S-08 `bootstrap.cmd` under Restricted and GPO-locked policies | M |
| ARC-00-S08 | Server install and startup spikes: S-15 root `npm ci` footprint, S-06 `MCP_TIMEOUT` and 394-tool cold start | M |
| ARC-00-S09 | S-07 — ServiceNowDocs submodule recipes: size and time on three OSes | M |
| ARC-00-S10 | Session-dynamics spikes: S-09 Claude-first clone-into-cwd and restart, S-02 `list_changed` after reload | M |
| ARC-00-S11 | S-11 — Claude Code 2.1.214 floor verdict over the spike matrix | S |
| ARC-00-S12 | S-14a–g plugin channel spikes (D-06 hedge, one-week time-box) and S-19 `claude plugin validate` on headless CI | L |
| ARC-00-S13 | Windows test recipe for ARC-06 / ARC-09 CI | S |
| ARC-00-S14 | Close-out: `03` §A/§B Status column, deferred spikes S-10 / S-13, gate sign-off for ARC-01 and ARC-06 | M |

Sizing: 19–30 engineer-days (≈ 4–6 weeks for one engineer; the upper bound assumes most verdicts FAIL and every propagation row is needed); S12 runs in parallel with S04–S10 so that it concludes before ARC-06-S01 without extending the ARC. Story IDs are `ARC-00-SNN`; spike IDs are `S-NN` — `ARC-00-S13` (Windows recipe) is not spike S-13 (skill listing, deferred to ARC-02).
