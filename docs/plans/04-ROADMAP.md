# 04 — Roadmap

Status: **Integrated 2026-09-04** · Basis: the 132 stories of `ARC-00`…`ARC-10` (`05-STORY-INDEX.md`), their story-map dependency graph (acyclic after the six re-orientations listed in §7), each ARC's own sizing table, and the owner decisions of `02` (all closed 2026-09-04). Effort is in **engineer-days** (one person, focused); calendar figures assume five working days a week and are given as ranges, never a date.

---

## 1. Milestones in dependency order

| Milestone | ARCs (stories) | Stories | Effort (engineer-days) | Entry gate (§3) | Exit criterion |
|---|---|---|---|---|---|
| **M0 — Spikes and gates** | ARC-00 (all 14) | 14 | 19–30 (ARC total) | owner decisions in `02` (done); a Windows machine or VM; a PDI for S-10's later run | Every row S-01…S-20 in `03` §A/§B carries Status + Evidence; ADR-0001…0007 Accepted and ADR-0006 resolved ("monorepo path confirmed" or ADR-0008); `LICENSE`/`NOTICE`/`RELICENSING.md` agreed; `spikes/engine.config.seed.json` fixed; `spikes/windows-recipe.md` written; the gate sign-off block for ARC-01 and ARC-06 present with dates (ARC-00-S14) |
| **M1 — Foundation** *(**COMPLETE 2026-09-08 — 21 of 21**)* | ARC-01 (all 12) · ARC-03-S01…S04 · ARC-02-S01…S05 | 21 | 27–31 (per-story); ARC-01 alone 12–17 | G1, G2 | `farstic/ai-servicenow-architect` exists with both histories imported (`import/*` tags), Apache-2.0 root commit, `engine.config.json` + schema, one version of record (`2.0.0-dev`), root workspaces with `npm ci` green on three OSes, CI skeleton (3 OS × Node 20/22/24) green, legacy-name ratchet in place; `.claude/` canonical, skills lint green, descriptions ≤ 500 chars (S-13 verdict recorded), context-mode and the claude.ai surface gone; docs submodule pinned to `ba513f2` with 0 dead citations **`main` exists as of 2026-09-08** (branched from `793e58d`), protected with 12 required status contexts, and is the repository default branch. |
| **M2 — Server, contract and engine consolidation** *(**COMPLETE 2026-09-09 — 40 of 40; merged to `main` 2026-09-09 @ `28104b3` (PR #74, owner-approved; 26 required contexts green)**; ARC-05 COMPLETE 2026-09-08 (all 11 stories); ARC-04 COMPLETE 2026-09-08 (all 14 stories); ARC-02 COMPLETE 2026-09-09 (all 13 stories); ARC-03 COMPLETE 2026-09-09 (all 11 stories)*)* | ARC-04 (all 14) · ARC-05 (all 11) · ARC-03-S05…S11 · ARC-02-S06…S13 | 40 | 71.5–81 (per-story); ARC totals 31–32 + 15–20 + rest of ARC-03/ARC-02 | G1 (ARC-04 hard gate), M1 | `node packages/snowarch/dist/server.js` starts unconfigured with the five core tools and answers `initialize` on three OSes from a fresh clone; `dist/contract.json` (398 tools, `gate`/`mutates`) pinned by `required-tools.json` (41 tools) with `contract.test.ts` and `engine-lint.mjs` green and generated texts byte-identical; S-10 verdict recorded (ARC-04-S05); `CLAUDE.md` ≤ 200 lines, Mode/Preset vocabulary everywhere, `/snowarch` skill skeleton, retired-name sweep complete, VALIDATION-TESTS T-01…T-18 executed in design-only; `snowarch docs sync|verify|status|sync --upstream|family` and `docs-bump.yml` working; proxy agent and network classifier in the server (R-3) |
| **M3 — Install, wizard, doctor** *(**in progress — 2 of 36**, started 2026-09-09)* | ARC-06 (all 14) · ARC-07 (all 11) · ARC-08 (all 11) | 36 | 57.5–91.5 (per-story); ARC totals 21.5–38.5 + 20–25 + 22–30 | G3 (S-14 before ARC-06-S01), G4 (Windows spikes before native-Windows promises), G5 | `git clone … && ./bootstrap.sh` reaches `Mode: design-only` on macOS/Linux/Windows with and without Node (13 CI bootstrap cells incl. Windows without Git Bash); `./bootstrap.sh` → wizard → `DOCTOR: … 0 fail` / `Mode: live — …` with `~/.claude.json` byte-identical; `snowarch instance add|list|test|set-preset --ack-prod|import --from-legacy` per D-04/D-05 with the per-flag review screen; `/snowarch status|setup-instance|doctor` work in-session (S-02/S-16 verdict texts applied); doctor 0 FAIL on the reference install, banner < 1 s, `--fix` idempotent, leftover detectors print exact commands; `docs/INSTALL.md`, `MODES-AND-PRESETS.md`, generated `TROUBLESHOOTING.md` |
| **M4 — Release 2.0.0** | ARC-09 (all 11) | 11 | 15–25 | M3; G6; owner's npm token only for the optional S10 | `node scripts/release.mjs 2.0.0` produces one commit and tag `v2.0.0` (contract sha + docs pin in the message); `release.yml` re-runs every gate on three OSes and publishes the GitHub Release with doctor JSON and install-metrics assets; `docs/CHANGELOG.md` carries the "supersedes engine v2.8.0 and snow-mcp 1.0.0" note and the migration notes; `./snowarch version` equals the tag; `./snowarch upgrade` proven with two fixture releases and credentials byte-identical; nine CI cells + the Windows-without-Git-Bash cell green on every commit; `publish-npm.yml` dry run green (real publish is a manual dispatch) |
| **M5 — Migration and cutover** | ARC-10 (all 10) | 10 | 10.5–14 + a fixed 14-calendar-day wait | G7 (`v2.0.0` tag) | `docs/MIGRATION.md` machine-checked against the doctor's leftover detectors; author's machine cut over (doctor 0 FAIL, legacy store and stale registrations gone); five clean-machine validation records (macOS/Ubuntu/Windows design-only, one live `pdi-developer`, one proxied laptop) committed under `docs/validation/`; deprecation notices in both old repositories with `@farstic/snow-mcp@1.0.0` untouched; two-week review held and the archive executed or deferred with a reason |

### M1 exit evidence — recorded 2026-09-08

Every exit condition from the M1 row, with what was measured rather than what was intended.

| Exit condition | Evidence |
|---|---|
| both histories imported (`import/*` tags) | `import/engine-v2.8.0-worktree` → `7f99a3a`, `import/snow-mcp-1.0.0` → `58a66e0` |
| Apache-2.0 root commit | `58f0b8c`; `LICENSE`, `NOTICE`, `docs/RELICENSING.md` |
| `engine.config.json` + schema | both present; `tests/engine-config.test.mjs`, 13 tests |
| one version of record | `2.0.0-dev`; `tests/version-consistency.test.mjs` |
| root workspaces, `npm ci` green on three OSes | workspaces `packages/*`, `tools/snowarch`; nine green cells |
| CI skeleton 3 OS × Node 20/22/24 | run 34174606714, 12 of 12 jobs |
| legacy-name ratchet in place | `tests/no-legacy-names.test.mjs`; allow-list 19 → 11 rows |
| `.claude/` canonical | 28 skills, 9 agents |
| skills lint green | SK-01…SK-12, AG-01…AG-06, all enforced |
| descriptions ≤ 500 chars | 28 skills, 11,191 chars total (was 27,119), longest 479 (was 1,587) |
| S-13 verdict recorded | **CONFIRMED** — a total listing budget, stated by the CLI's own debug log; `docs/spikes/S-13-skill-description-cap/` |
| context-mode and the claude.ai surface gone | `tests/no-legacy-surfaces.test.mjs`, permanent, on every cell |
| docs pinned to `ba513f2` with 0 dead citations | gitlink `ba513f2c62d3698ef5bfdd8044110226b8419689`; `checked: 168 | dead: 0`, 0 warnings |

Two findings from M1 that outlived their stories and are carried forward:

- **The skill listing budget is a TOTAL across every skill in a session** — the engine's, the user's own
  and the bundled ones — so the engine controls only its share (S-13, `03` §F). This is why ≤ 500
  characters is a standing rule rather than a one-off cleanup.
- **Claude Code loads project skills from every `.claude/skills` between the working directory and the
  filesystem root.** A checkout beneath a folder that already has one loads both rosters and spends the
  budget twice (S-13 addendum, `03` §F). ARC-04-S12's doctor warns on it.

### M2 exit evidence — recorded 2026-09-09

Every exit condition from the M2 row, with what was measured on `develop` @ `e48d983` (the ARC-03-S11 merge) rather than what was intended.

| Exit condition | Evidence |
|---|---|
| server starts unconfigured with the five core tools and answers `initialize` on three OSes from a fresh clone | `packages/snowarch/tests/server/unconfigured.test.ts`; the `no-build handshake` job on ubuntu / macos / windows against the committed `dist/` — CI run 34317967180, 26 of 26 |
| `dist/contract.json` pinned by `required-tools.json`, `contract.test.ts` and `engine-lint.mjs` green, generated texts byte-identical | 397 tools (`gate` / `mutates`); `required-tools.json` 42 tools, `contractSha256` `86b63770e08e…`; `L01 ok … L11 ok` with the name checks REQUIRED; `gen-all: 4 generator(s) current`; the drift drill PR #56 went red 18 of 25 and was closed unmerged (ARC-05-S11) |
| S-10 verdict recorded (ARC-04-S05) | **Open — deferred, not measured.** ARC-04-S05 recorded the procedure (`docs/spikes/S-10-readonly-preset-sufficiency/PROCEDURE.md`); the run needs the owner's live instance and sits in `docs/spikes/OWNER-SITTING.md`. Carried into M3 as an owner-sitting item, not a blocker |
| `CLAUDE.md` ≤ 200 lines | 125 lines / 11,216 bytes (`tests/claude-md.test.mjs`); was 425 / 57,688 |
| Mode/Preset vocabulary everywhere | `tests/no-legacy-surfaces.test.mjs` (Tier 0 outside history); `docs/MODES-AND-PRESETS.md`; `.claude/rules/00-mode-and-mcp-gate.md` generated from the contract |
| `/snowarch` skill skeleton | `.claude/skills/snowarch/SKILL.md` (`status` · `setup-instance` · `doctor`; `$ARGUMENTS` CONFIRMED on 2.1.258); `roster.utility` = `["snowarch"]`; 28 persona skills + 1 utility, 9 agents |
| retired-name sweep complete | ARC-02 allow-list rows 0; `NAME_CHECKS_REQUIRED = true` (`L01 0 · L02 0 · L03 0`) since ARC-02-S12 |
| VALIDATION-TESTS T-01…T-18 executed in design-only | `docs/spikes/validation-runs/2026-09-09-design-only.md` — **18 of 18 PASS** after two rulings (T-02 rewritten to a genuine Verdict-C case; T-12's go-live proposal fires even when deployment is declined); the 16-of-18 first tally kept beneath it |
| `snowarch docs sync \| verify \| status \| sync --upstream \| family` working | `node scripts/docs.mjs …` (the launcher is ARC-06): sync reconcile 2 s on a current checkout, `docs status` four `ok` lines, `checked: 181 \| dead: 0`, `--upstream` real run moved to `11b39be` and was reverted, `family zurich --dry-run` 53 EDIT / 69 REVIEW, porcelain 0 after each |
| `docs-bump.yml` working | committed with its dry-run record (`docs/validation/2026-09-09-docs-bump-dry-run.md`); `workflow_dispatch` resolves on the default branch, so the first real run follows the `main` merge |
| proxy agent and network classifier in the server (R-3) | `packages/snowarch/tests/servicenow/proxy.test.ts`, `net-errors.test.ts` (31 tests); `docs-real.yml` proved the corpus recipe on three OSes — run 34317967230, 4 of 4 |

Three findings from M2 that outlived their stories and are carried forward:

- **A test that passes while asserting nothing looks exactly like a passing test.** Config precedence (`config.worktree` outranks the repository config), import-time captures and steps that log a state they have not yet produced each defeated a guard silently; `tests/precondition-asserts.test.mjs` now requires every mutation of pre-existing state to be followed by an assertion that it took.
- **The corpus escapes underscores.** A plain `grep sn_customerservice_escalation` over `vendor/` returns nothing; the escaped form finds ten Australia pages. A five-paragraph claim in the CSM skill survived on that non-result until ARC-02-S13's run. Search the corpus with `\_` before asserting that a table does not exist.
- **A clean validation run needs a separate OS user, not just a fresh clone** — an untrusted clone still loads the operator's global `CLAUDE.md`, from which one T-run quoted a real hostname (redacted). ARC-09's release gate inherits this.

Story-to-milestone assignment is in `05-STORY-INDEX.md` (column *Milestone*). M1 and M2 split ARC-02 and ARC-03 because their first stories need only ARC-01 while their later stories need ARC-04/ARC-05 (the retired-name sweep, the generated governance texts) or the S-07 recipe verdict.

---

## 2. Critical path

The longest dependency chain by nominal effort (band midpoints; the index carries the low/high bands) is **32 stories ≈ 69 engineer-days** (≈ 60–85 across the bands) — roughly a third of the total, which is why two engineers shorten the calendar and three barely do:

```
ARC-00-S02 (licence texts, D-02) → ARC-00-S03 (ADRs, engine.config seed)
→ ARC-01-S03 (server import, leaf D-03 cut) → S04 (engine.config.json) → S05 (workspaces, npm ci) → S06 (version of record)
→ ARC-04-S01 (D-03 code cut, identity 2.0.0) → S02 (store) → S03 (flags/presets/prod rule) → S04 (unconfigured start, reload)
   → S06 (gate/mutates, contract.json) → S08 (dead endpoints, result cap) → S13 (committed dist/)
→ ARC-05-S01 (required-tools.json pin) → S05 (gen-governance, rule file) → S06 (error registry, TROUBLESHOOTING)
→ ARC-07-S02 (URL/env/reachability) → S03 (probe library) → S04 (preset review screen) → S05 (instance add) → S06 (list/test/set-*)
→ ARC-06-S08 (B08 handshake + probes) → S09 (B09 summary) → S10 (bootstrap.sh) → S11 (bootstrap.ps1/.cmd) → S14 (bootstrap CI job)
→ ARC-08-S11 (doctor CI) → ARC-09-S03 (release.yml) → ARC-09-S08 (CI matrix completion, Windows native)
→ ARC-10-S08 (clean-machine runs) → S09 (deprecation notices) → [14 calendar days] → S10 (post-release review, archive)
```

Two calendar-bound items sit beside the chain: ARC-00-S12 (S-14a–g, one-week hard time-box, run in parallel with ARC-00-S04…S10 and required to finish before ARC-06-S01 — gate G3) and ARC-10-S08 (five runs by different people on their own machines). A failed spike adds its pre-recorded fallback (typically 1–3 days) but does not add stories.

---

## 3. Entry gates (hard stops)

| Gate | Before | Condition | Owner of the check |
|---|---|---|---|
| **G1 — Licence (D-02)** | ARC-01-S01 (root commit), ARC-01-S02 (engine import), **ARC-04-S01** (hard gate: "nothing can be published until this is settled", `03` R-11) | `LICENSE` (Apache-2.0), `NOTICE`, the relicensing sentence and `RELICENSING.md` agreed; for the engine's second contributor (`RobertBH17`, commit `5b40835`) either written consent or the rewrite-before-import file list — ARC-01-S02 imports nothing from that commit un-relicensed | ARC-00-S02; sign-off in ARC-00-S14 |
| **G2 — Names, floors, seed values** | ARC-01-S03 (D-03 cut), ARC-01-S04 (`engine.config.json`), ARC-01-S05 (`npm ci` recipe) | ADR-0001/0003 Accepted; `spikes/engine.config.seed.json` with `floors.claude` = S-11 verdict; S-15 footprint verdict | ARC-00-S03, S11, S08 |
| **G3 — Channel hedge (D-06)** | **ARC-06-S01** — the first bootstrap story; ARC-07-S09 inherits | S-14a–g and S-19 carry verdicts within the one-week time-box; ADR-0006 moved to Accepted ("monorepo path confirmed") **or** superseded by ADR-0008 ("channel decision re-opened"), in which case ARC-06/ARC-07 are re-planned before any bootstrap investment | ARC-00-S12; sign-off in ARC-00-S14 |
| **G4 — Native Windows (Q-B)** | every native-Windows promise: ARC-06-S11 (`bootstrap.ps1`/`.cmd`), ARC-06-S13 (INSTALL wording), ARC-07-S01 (masked input), ARC-09-S08 (Windows-without-Git-Bash cell), `01` §13 | S-03, S-04, S-08 executed on a Windows machine **without** Git Bash on PATH (ARC-00-S06/S07) and `spikes/windows-recipe.md` written (ARC-00-S13); if any fails, the pre-recorded "Git Bash required" fallback is applied by ARC-00-S14 without re-planning | ARC-00-S06/S07/S13/S14 |
| **G5 — Server artefacts** | ARC-06-S07/S08 (B05/B08), ARC-07-S05 (B06 slot), ARC-08-S01/S04 | ARC-04-S13 (committed `dist/`) and ARC-05-S01 (contract pin) merged; ARC-04-S12 (doctor module) and ARC-05-S06/S10 for the doctor; ARC-05-S07 replaces the seed permission block before the M3 exit | story dependency lines |
| **G6 — Deferred spikes** | ARC-04-S14 (CHANGELOG gate-split note), M2 exit; ARC-02 listing acceptance | S-10 verdict recorded by ARC-04-S05 (`docs/spikes/S-10-read-only-sufficiency/`), S-13 by ARC-02-S03 (`docs/spikes/S-13-skill-description-cap/`) | ARC-04-S05, ARC-02-S03 |
| **G7 — Tag** | ARC-10-S06 (author cutover), ARC-10-S08 (validation runs), ARC-10-S09 | `v2.0.0` exists (ARC-09-S01) and its Release page has the three-OS assets (ARC-09-S03) | ARC-09 |

Owner-supplied inputs that no story can produce (kept out of the plan on purpose): the GitHub repository (ARC-01-S01), a Windows 10/11 machine or VM without Git Bash (ARC-00-S01), a PDI for the live E2E runs and S-10 (ARC-04/ARC-07/ARC-10), the second contributor's consent or the choice to rewrite (ARC-00-S02), an npm granular token for the optional publish (ARC-09-S10), and the owner's initials on the ARC-00-S14 sign-off block.

---

## 4. What runs in parallel

- **Inside M0.** ARC-00-S02/S03 (licence, ADRs — desk work) run beside ARC-00-S01 (environments); the interactive Claude Code spikes S04/S05/S06/S10 are serial on one machine, S07/S08/S09 can use a second; S12 (plugin spikes) runs on its own five-day box alongside. S14 closes.
- **Inside M1.** ARC-01 is mostly serial (S01 → S02/S03 → S04 → S05 → S06 …) but ARC-03-S01…S04 and ARC-02-S01…S05 start as soon as ARC-01-S02/S04 land; ARC-01-S11 (CI) can absorb them.
- **After M1 — three streams until the M3 gates:**
  - *Stream A, server:* ARC-04-S01 → S02 → S03 → {S04, S05} → S06 → {S07, S08, S09, S10, S11, S12} → S13 → S14, then ARC-05 (S01 → S02/S03 → S04, S05 → S06 → S07/S08 → S09 → S10 → S11). ARC-04-S09 + S11 and S13 + S14 are independent pairs a second person can take (ARC-04 README risk).
  - *Stream B, engine and docs:* ARC-02-S06 → S07 → S08 → S09/S10 → S11, and ARC-03-S05 → S06 → S07 → S08/S09/S10 → S11 — none of these needs the server. ARC-02-S12/S13 wait for ARC-05-S02…S04.
  - *Stream sequencing in force (2026-09-08).* One engineer, so the two streams interleave rather
    than run side by side: **ARC-02-S06 → S07 → S09 → S10**, then **ARC-05 S05 → S06 → S07 → S04 →
    S08 → S09 → S10**, then **ARC-02-S12 → S08 → S11 → S13**, **ARC-05-S11**, then
    **ARC-03-S05…S11**. Two departures from Stream B as planned above, both forced by dependencies
    rather than preference: ARC-02-S08 (the `CLAUDE.md` rewrite) moves behind ARC-05 so it is
    written once against the generated protocol file rather than twice, and ARC-02-S12 needs
    ARC-05's `retired-names.json` and `engine-lint.mjs` to exist before it can sweep with them.
  - *Stream C, bootstrap design-only path (opens at G3):* ARC-06-S02 → S03 → S04/S05/S06 → S09 (design half) → S10 → S11, plus S01 — they need ARC-01, ARC-03-S05/S06 and the ARC-00 verdicts only. S07, S08, S12, S13, S14 wait for Stream A (ARC-04-S02/S03/S04/S13, ARC-05-S01) and for ARC-07-S05/S06.
- **M3 interleaving.** ARC-07-S01/S02 start once ARC-04-S01/S11 exist; ARC-07-S03…S06 follow ARC-04-S02/S03/S12; ARC-08-S01 starts after ARC-04-S12 + ARC-05-S06/S10 + ARC-06-S02, its detectors (S03) and engine checks (S02) after ARC-06-S01/S04/S05; ARC-08-S07/S09/S10 are small and float.
- **M4 pulled forward.** ARC-09-S01/S02 (release script, changelog) can be built during M3 (they need ARC-01-S06/S11, ARC-02-S08, ARC-03-S06, ARC-04-S13, ARC-05-S09); S05 after ARC-06-S03; S06 after ARC-08-S04; only S03, S07, S08, S09, S10, S11 are end-of-line.
- **M5 pulled forward.** ARC-10-S02/S04/S05 (docs and policy) can be written during M3/M4; S01 needs ARC-07-S08 and ARC-08-S03/S10; S03 needs ARC-02-S12 and ARC-09-S02; S06–S10 are strictly post-tag.

**A workable two-engineer split.** Engineer 1 owns Stream A end to end (ARC-04 → ARC-05 → ARC-07 → ARC-08 server checks → ARC-09-S06/S07/S10); Engineer 2 owns Streams B and C (ARC-02 → ARC-03 → ARC-06 → ARC-08 engine checks and banner → ARC-09-S01…S05/S08/S09/S11); ARC-00 and ARC-10 are shared, and the Windows work (ARC-00-S06/S07/S13, ARC-06-S11, ARC-09-S08) goes to whoever holds the Windows machine. The hand-off points are exactly the G5 artefacts (`dist/`, contract pin, doctor module, probe library, B06 slot interface).

---

## 5. Effort — honest ranges

| Basis | Engineer-days |
|---|---|
| Sum of the eleven ARC totals as stated in each `STORIES.md` | **204.5 – 283** |
| Sum of the per-story figures behind `05-STORY-INDEX.md` (band midpoints where an ARC gives only bands) | 199.5 – 273.5 |
| Critical path (§2), nominal | ≈ 69 (≈ 60–85 across bands) |

Not in the numbers: owner review turnarounds, spike failures that trigger a fallback (+1–3 days each; +1–2 days if `RELICENSING.md` resolves as a rewrite), a re-opened channel decision (ADR-0008 — re-plans ARC-06/ARC-07, not sized), waiting for other people's clean-machine runs (ARC-10-S08), and the fixed 14 calendar days before ARC-10-S10.

- **One engineer:** 205–283 engineer-days ≈ **41–57 working weeks (≈ 9½–13 months)** of focused work; with the calendar-bound waits and normal review latency, plan for **10–14 months** to a `2.0.0` that has been through M5.
- **Two engineers:** the critical path (§2) bounds the calendar from below and M0/M1 are largely serial, so the split does not halve the time: ≈ 100–142 engineer-days each in parallel, plus ~15 % coordination on the G5 hand-offs → **≈ 26–34 working weeks (6–8 months)** to the same end state. A third engineer only helps inside M2/M3 (the ARC-04 pairs, ARC-03, ARC-08) and is not recommended before M1 is done.

The six-week-per-ARC ceiling every ARC was sized against is respected individually (largest: ARC-04 at 31–32 days, ARC-06 at 21.5–38.5); the programme is long because it is eleven of them in a dependency chain, not because any single ARC is oversized.

---

## 6. The `2.0.0` release exit checklist

Tick every line on a clean machine before `node scripts/release.mjs 2.0.0` is run (ARC-09-S01 refuses on the mechanical ones):

- [ ] **Gates and records.** `03` §A/§B: every row S-01…S-20 (S-14 as seven rows) has Status + Evidence and none reads "unverified"; S-10 and S-13 verdicts recorded by ARC-04-S05 / ARC-02-S03; ADR-0001…0007 Accepted, ADR-0006 resolved (or ADR-0008 acted on); the ARC-00-S14 sign-off block carries dates and initials.
- [ ] **Licence.** `LICENSE` Apache-2.0, `NOTICE` with the ServiceNow/ServiceNowDocs attribution, `RELICENSING.md`; zero non-Apache licence claims in the tree (ARC-01-S08); `npm view @farstic/snow-mcp version` still prints `1.0.0` with no deprecation (D-01).
- [ ] **Names and vocabulary.** `engine-lint.mjs` green (prefix `mcp__servicenow__`, no retired name, every tool token in the pinned contract); every ARC's rows of `tests/legacy-names.allowlist.json` empty; `grep -rn "Tier [0-9]" CLAUDE.md governance docs .claude tests` = 0 outside the CHANGELOG history section; skill `/snowarch` with `status` · `setup-instance` · `doctor`.
- [ ] **Contract.** `dist/contract.json` lists 398 tools with `gate`/`mutates`; `required-tools.json` (41 tools) pins its sha; `contract.test.ts`, `engine-lint.mjs` and the generated files (`.claude/rules/00-mode-and-mcp-gate.md`, `governance/mcp-protocols.md`, the `permissions.allow`/`ask` blocks, `docs/TROUBLESHOOTING.md`) are byte-identical to their generators; rebuilt `dist/` equals committed `dist/`.
- [ ] **Design-only install.** `git clone … && ./bootstrap.sh --mode design` on macOS, Linux and Windows (`bootstrap.cmd`, no Git Bash on PATH) reaches `Mode: design-only` with the corpus present, with and without Node; the first `claude` shows the trust dialog only (or exactly the S-01-recorded count); `/mcp` shows `servicenow` disabled, not failed; `git status` shows no tracked file modified; `~/.claude.json` byte-identical before and after.
- [ ] **Live install.** `./bootstrap.sh` (interactive) → one amendable plan screen (principle 10) → wizard with the per-flag review screen → `DOCTOR: … 0 fail`, `Mode: live — …`; `/mcp` shows `servicenow ✔ connected`; `/snowarch setup-instance --resume` makes a new instance live without a restart (or prints the S-02 fallback); `prod` capped at `read-only` without `--ack-prod`; `AUTHENTICATION_FAILED` bounded to three attempts; one `.local/audit.jsonl` line per mutating call and never a secret.
- [ ] **Credentials.** `grep -rE "PASSWORD|SECRET|TOKEN|_KEY\"" .mcp.json .claude/settings.json` empty; store 0700/0600 (ACL note on Windows); cloud-sync WARN fires under OneDrive/Dropbox/iCloud/Google Drive; no credential in argv, transcript, `~/.claude.json` or git (CI secret grep green).
- [ ] **Docs corpus.** `./snowarch docs verify` → `checked: ≥ 160 | dead: 0`; pin == gitlink == HEAD; `--docs skip` yields a doctor FAIL; attribution line printed by B02 and present in `NOTICE` / `docs/INSTALL.md`.
- [ ] **Doctor and banner.** `./snowarch doctor --json` 0 FAIL on the reference install and on the CI snapshot for three OSes; banner within 1 s on CI; `--fix` idempotent and reported per fix; E-23/E-24 print the exact `claude mcp remove` / `import --from-legacy` commands; E-26 reports proxy/CA state.
- [ ] **Validation tests.** `tests/VALIDATION-TESTS.md` T-01…T-20 pass in design-only on a clean machine and the live subset (T-05/T-06/T-19/T-20) in `pdi-developer` — records under `docs/validation/` with the redaction lint green.
- [ ] **CI.** `ci.yml` green on the nine cells (3 OS × Node 20/22/24) plus the 13 bootstrap cells (incl. `no-node` and `no-gitbash`), `doctor`, `contract`, `dist` rebuild-diff, `release-dryrun`, `eol`, `commitlint`; `docs-real.yml` last run green.
- [ ] **Release mechanics.** Version of record `2.0.0` in root, package and tools `package.json` and the `CLAUDE.md` marker; `docs/CHANGELOG.md` has the "supersedes engine v2.8.0 and snow-mcp 1.0.0" sentence and the migration notes (R-03); `docs/INSTALL.md`, `MODES-AND-PRESETS.md`, `MIGRATION.md`, `ARCHITECTURE.md` (history, scope-cut ledger, D00–D37 → E-/SV- map), `CONTRIBUTING.md` current; `publish-npm.yml` dry run green and **disabled by default**.
- [ ] **After the tag (M5, not blocking the tag):** ARC-09-S03 Release page with doctor JSON + install-metrics assets; author cutover (ARC-10-S06); five clean-machine records (S08); deprecation notices (S09); two-week review and archive decision (S10).

---

## 7. Consistency fixes applied by the integration pass (2026-09-04)

- **Dependency cycles removed (weaker edge re-oriented to "consumer, not prerequisite"):** ARC-06-S01 ↔ ARC-05-S07 (the seed permission block ships first; the generator overwrites it later); ARC-07-S06 ↔ ARC-06-S08 (B08 consumes `instance test --all --json`); ARC-07-S10 ↔ ARC-08-S10 (the rule text merges first; T-19 follows); ARC-09-S08 ↔ ARC-09-S09 (the `eol` test no longer waits for the matrix consolidation); ARC-03-S11 → ARC-09-S08 replaced by ARC-00-S13 (the Windows PATH recipe originates in the spike, ARC-09-S08 only places the job); ARC-08-S08 ↔ ARC-09-S07 (the banner fixes the `upgrade-check.json` shape; the upgrade command writes it later). ARC-01-S03's bare "ARC-00" dependency was narrowed to ARC-00-S03 so the five-day S-14 box no longer sits on the critical path (ARC-01's README already said the hedge does not gate it).
- **Cross-ARC references:** 127 "ARC-NN story N" title-number references rewritten to `ARC-NN-Sxx` ids, resolved by content where an ARC split or merged stories; 0 dangling ids remain.
- **Residuals from the eleven verifications closed:** S-10 run moved into ARC-04-S05 (three-line change plus the cross-ARC table); ARC-06 README entry gate (D-06 hedge) and principle-10 criterion; ARC-04 README legacy-name criterion; ARC-06-S06 citation count `≥ 160` / `163`; ARC-06-S03 state keys `registrationReason` and `hooksDisabledByBootstrap` (ARC-06-S12 renamed `wroteDisableAllHooks`); ARC-08 E-13/F3 remedy made canonical (`./snowarch docs sync`); ARC-08 E-24 and ARC-07-S08 legacy-store path on Windows (`%USERPROFILE%\.config\servicenow-mcp`, never `%APPDATA%`); ARC-07-S05 accepts `--no-probes`; ARC-07-S09 pastes `docs/snippets/terminal-handoff.md` verbatim; ARC-04-S02 `lastProbe` vocabulary aligned with ARC-07-S03 and the later `detectCloudSync()` / `XDG_CONFIG_HOME` / `matchPreset()` additions recorded; ARC-04-S10 exports `appendAudit`; ARC-01-S10 exempts `docs/MIGRATION.md`; ARC-01-S03 ledger records the `src/api` ruling (removed — dead once the HTTP transport is cut); ARC-08-S10 hands T-19/T-20 to ARC-10-S07; ARC-02 README CHANGELOG-history ruling closed (exclusion with disclaimer).
- **Plan documents swept to the decided names:** `01` (`packages/snowarch`, `@farstic/snowarch`, `/snowarch …`, first release `2.0.0`, `SV-xx` server checks, B03 as the plan-screen line, `docs sync` vs `docs sync --upstream`, 41-tool contract, `render-diagrams.ps1`, the three added `docs/` pages); `03` (names, R-03/R-14/R-16/R-17 closed against R-1/R-2, S-17 "five tools", S-10/S-13 deferral notes, **S-19 and S-20 rows added**, new §E spike → runner map); `00` glossary; this folder's `README.md`.

---

## 8. Coverage

- **Pain points.** All forty P-01…P-40 of `00` are closed by at least one story (most by several); the ones carried by a single story are P-07 (ARC-02-S05), P-08 (ARC-02-S01), P-14 (ARC-02-S05), P-20 (ARC-04-S13), P-22 (ARC-04-S02), P-28 (ARC-04-S01), P-30 (ARC-04-S14), P-31 (ARC-04-S01), P-35 (ARC-04-S10), P-39 (ARC-01-S09) — each is a self-contained fix, so single ownership is correct.
- **Decisions.** D-01…D-06, Q-A, Q-B, R-1, R-2, R-3 and the two minor folds are each implemented by named stories (ADR record in ARC-00-S03; D-01 in ARC-01-S01/S03, ARC-04-S01, ARC-06-S01; D-02 in ARC-00-S02, ARC-01-S01/S08; D-03 in ARC-01-S02/S03, ARC-04-S01, ARC-02-S05; D-04 in ARC-04-S02, ARC-07-S05/S07, ARC-08-S03; D-05 in ARC-04-S03, ARC-07-S04/S06; D-06 in ARC-00-S12, ARC-06-S01, ARC-07-S09; Q-A in ARC-07-S07, ARC-10-S02; Q-B in ARC-00-S06/S07/S13, ARC-06-S11, ARC-09-S08; R-1 in ARC-01-S06, ARC-04-S01, ARC-09-S01; R-2 in ARC-02-S11, ARC-07-S09, ARC-08-S09; R-3 in ARC-04-S11, ARC-07-S02, ARC-08-S03; `metadata.version` in ARC-02-S03; S-19 in ARC-00-S12).
- **Spikes.** Every S-01…S-20 row of `03` is executed by exactly one ARC-00 story (`03` §E) — S-10 and S-13 deferred to ARC-04-S05 and ARC-02-S03 because they need product code — and consumed by the stories that branch on the verdict. S-14b/c/e/f/g have no direct story consumer by design: their only consumer is the ADR-0006/0008 gate (G3).

---

## 9. Owner inputs — the only things the plan cannot supply itself

Status legend: ☐ open · ☑ done · ◐ in progress. Everything else in this programme is an engineering task with an owner story.

| # | Input | Needed by | Status |
|---|---|---|---|
| 1 | Create the GitHub repository `farstic/ai-servicenow-architect` (empty; ARC-01-S01 makes the root commit) and confirm branch protection can be set on it | ARC-01-S01 | ☑ **Done 2026-09-06** — public, empty, no default branch yet (`gh repo view`); branch protection available (public repo, free plan) — R-4 |
| 2 | A Windows 10/11 machine or VM **without Git Bash on PATH** (plus, for S-08, a GPO-locked execution-policy VM, or the decision to skip that case) | ARC-00-S06/S07/S13; later ARC-06/ARC-09 Windows proofs | ☐ |
| 3 | A PDI (`dev\d+.service-now.com`) with an admin user for the live E2E suites and the deferred spike S-10; a second, proxied laptop for the ARC-10-S08 proxy run | ARC-04, ARC-04-S05, ARC-07-S11, ARC-10-S08 | ☐ |
| 4 | **D-02 relicensing of the engine's second contributor** (RobertBH17, commit `5b40835`): written consent to Apache-2.0 (resolution a) **or** choose rewrite-before-import (resolution b). ARC-01-S02 cannot push those commits until settled (R-4 obligation 2) | ARC-00-S02 → ARC-01-S02 | ☐ |
| 5 | npm publish rights: a granular access token scoped to `@farstic/snowarch` only, stored as the `NPM_TOKEN` repository secret for the optional, manually dispatched `publish-npm.yml`; confirm `@farstic/snow-mcp@1.0.0` is never versioned, deprecated or unpublished | ARC-09-S10 | ☐ |
| 6 | Initial the ARC-00-S14 gate sign-off block (ARC-01 entry: D-01/D-02/D-03 ADRs; ARC-06 entry: S-01/S-03/S-05/S-08/S-09/S-15/S-16 verdicts + S-14 conclusion + Q-B) when the spike records exist | ARC-00-S14 | ◐ **ARC-06 half satisfied 2026-09-08** — ADR-0006 Accepted ("monorepo path confirmed") on the S-14a–g verdicts in `03` §F, ratified by the architect at merge. The ARC-01 half and the owner's own initials remain open. |
| 7 | Confirm the Claude Code account plan on which the auto-mode spike S-18 is run (the plan determines whether auto mode exists); ARC-05 keeps the deny + PreToolUse fallback until confirmed | ARC-00-S11, ARC-05 | ☐ |
| 9 | **`main` created — done 2026-09-08.** Branched from `793e58d` (the M1 milestone merge), protected with 12 required status checks (the `ci.yml` job names verbatim), `allow_force_pushes` and `allow_deletions` both false, `enforce_admins: false` so the owner can recover it; set as the repository default branch. Commands and `protection.json` recorded in `docs/CONTRIBUTING.md`; evidence in ARC-01-S01's amendment. | ARC-01-S01 | ☑ done |
| 8 | **OAuth example client secret in the old documentation — CLOSED 2026-09-08, no action.** The client id `a1b2c3…p6` in the imported docs is a non-hex placeholder, sits beside `dev12345` and `your_username`, and the connected instance's `oauth_entity` table has **0 matching rows**. It was never a live credential, so no rotation is required and no R-4 obligation arises from it. | — | ☑ closed |
