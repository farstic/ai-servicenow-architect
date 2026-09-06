# AI ServiceNow Architect — onboarding re-architecture plan set

**What this folder is.** The complete analysis and implementation plan for merging the two current repositories — the *engine* (`AI-Architect-Claude` → GitHub `farstic/claude-servicenow-live`, "ServiceNow Architecture Engine v2.8.0") and the *MCP server* (`snow-mcp` → GitHub `farstic/snow-mcp`) — into **one new repository**, `farstic/ai-servicenow-architect`, that a consultant can install in one uninterrupted run, use with no ServiceNow instance at all (Mode `design-only`), and then extend with a live instance through a guided, secret-safe wizard (Mode `live`, Preset `read-only` | `pdi-developer` | `full` | `custom`).

Nothing in the two existing repositories has been modified. Everything here is a plan for a repository that does not exist yet; the owner creates it (ARC-01-S01).

Audit date for every fact quoted here: **2026-09-04**, against Claude Code CLI **2.1.258**, Node **24.16.0**, git **2.39.5**, the two repositories' working trees (including the uncommitted `scripts/setup.sh`, `scripts/doctor.sh` and rewritten `SETUP.md`), and the official Claude Code documentation at `code.claude.com/docs`.

## Reading order

| # | File | Read it when you want to… |
|---|------|---------------------------|
| 1 | [`00-CURRENT-STATE-ANALYSIS.md`](00-CURRENT-STATE-ANALYSIS.md) | Learn the whole current system: what exists, how it is wired, every verified pain point (P-01…P-40), the dependency inventory and requirements matrix, and the engine↔MCP coupling contract. Reference-grade; a new maintainer starts here. |
| 2 | [`01-TARGET-ARCHITECTURE.md`](01-TARGET-ARCHITECTURE.md) | See the chosen design in full: repository layout, exact install flow, MCP registration mechanism (with evidence), the instance wizard and permission presets, credential storage, doctor and self-heal, design-only mode, ServiceNowDocs strategy, versioning, cross-platform, contract tests, and why the alternatives lost. Everything decided on professional grounds is recorded there as **Decided**; the decided names of `02` were swept into it on 2026-09-04. |
| 3 | [`02-DECISIONS-NEEDED.md`](02-DECISIONS-NEEDED.md) | The six owner-only questions and the five post-decision rulings — **all closed on 2026-09-04** (see "Decision status" below). Binding on every story. |
| 4 | [`03-RISKS-AND-UNKNOWNS.md`](03-RISKS-AND-UNKNOWNS.md) | Track every unverified assumption any design or judge raised: spikes S-01…S-20 (S-14 as seven sub-spikes) with the check that retires each and the fallback already designed; §E maps every spike to the ARC-00 story that runs it; §C the accepted risks. |
| 5 | [`04-ROADMAP.md`](04-ROADMAP.md) | Plan the delivery: milestones M0–M5 in dependency order, the critical path, what runs in parallel, the effort range for one and for two engineers, the entry gates (S-14 before ARC-06, D-02 before ARC-04, Windows spikes before native-Windows promises) and the `2.0.0` release exit checklist. |
| 6 | [`05-STORY-INDEX.md`](05-STORY-INDEX.md) | Track the work: one row per story (132 in total) with ID, ARC, title, size, normalised dependencies, milestone and a Status column to maintain. |
| 7 | [`ARC-NN-<slug>/README.md`](#arcs) and `ARC-NN-<slug>/STORIES.md` | Do the work. One folder per ARC (epic): the README carries goal, pain points closed, scope, deliverables, dependencies, acceptance criteria and risks; `STORIES.md` carries the story map and the full write-up of every story (persona, context, scope, design notes, acceptance criteria, tasks, test strategy, dependencies, size, risks, definition of done). |

## Decision status

All owner decisions were taken on **2026-09-04** and are recorded verbatim in `02` (`DECIDED` banners and the post-decision rulings table). Every story was written against them; the summary that every file uses:

| Decision | Outcome |
|---|---|
| D-01 names | GitHub `farstic/ai-servicenow-architect` · CLI `snowarch` · MCP server key `servicenow` (tools `mcp__servicenow__snow_*`) · npm **`@farstic/snowarch`** in `packages/snowarch` (the existing `@farstic/snow-mcp@1.0.0` record is never touched) |
| D-02 licence | Apache-2.0 for the whole repository; root `LICENSE` + `NOTICE` (ServiceNow/ServiceNowDocs attribution); relicensing sentence in the first commit; the second engine contributor's consent or a rewrite of those files (ARC-00-S02) |
| D-03 scope cut | All nine surfaces removed (desktop app, other-client writers, BYOK direct mode, reports, A2A, HTTP/SSE + dashboard + Dockerfile, server prompts + Copilot personas, claude.ai surface, context-mode); nothing deleted from the old repositories |
| D-04 credentials | One per-checkout store `.local/instances.json` (0700/0600, gitignored, atomic); cloud-sync-folder WARN; basic auth default, OAuth password grant as "Advanced (legacy)"; keychain and client-credentials on the roadmap |
| D-05 posture | Propose → Review → Apply (principle 10): `pdi`/`dev`/`test` propose `full` with a per-flag review screen; `prod` proposes and is capped at `read-only` (`set-preset --ack-prod` to raise); environment asked, never guessed, except `dev\d+.service-now.com` → proposed `pdi` |
| D-06 channel | Monorepo + bootstrap for 2.0.0 with the bounded interruptions accepted; **hedge:** plugin spikes S-14a–g run in ARC-00 (one-week time-box) and conclude before ARC-06 starts |
| Q-A · Q-B | Individual practitioner on their own PDI · native Windows first-class, conditional on spikes S-03/S-04/S-08 (fallback "Git Bash required" pre-recorded) |
| R-1 · R-2 · R-3 | First unified release **2.0.0** · project skill **`/snowarch`** with sub-commands `status` · `setup-instance` · `doctor` · proxy/TLS-CA stories in ARC-04, ARC-07, ARC-08 |
| Minor folds | Skill frontmatter `version:` → `metadata.version` (ARC-02-S03); `claude plugin validate` on headless CI = spike S-19 (ARC-00-S12) |

## ARCs

ARCs are numbered `ARC-NN` in dependency order; `ARC-00` is the pre-implementation gate (spikes, ADRs, licence texts), `ARC-01`–`ARC-09` build the product, `ARC-10` cuts users over from the old repositories. The one documented back-edge: ARC-02-S12 (retired-name sweep) waits for ARC-05-S02…S04 and ARC-02-S13 waits for S12; ARC-02-S01…S11 proceed before ARC-04/ARC-05. Story counts and effort ranges are each ARC's own (`STORIES.md` sizing summary).

| ARC | Folder | One line | Stories | Effort (engineer-days) |
|-----|--------|----------|---------|------------------------|
| 00 | `ARC-00-spikes-and-gating-decisions/` | Retire the unknowns in `03`, record the decisions of `02` as ADRs, settle licence texts and names, sign the ARC-01 and ARC-06 entry gates. No product code. | 14 | 19–30 |
| 01 | `ARC-01-repo-foundation/` | Create the monorepo: root commit with licence, both histories imported, `engine.config.json`, single version of record, workspaces, CI skeleton, legacy-name ratchet. | 12 | 12–17 |
| 02 | `ARC-02-engine-consolidation/` | One canonical `.claude/` copy of skills/agents, description cap, thin `CLAUDE.md`, Mode/Preset vocabulary, `/snowarch` skill skeleton, retired-name sweep, refreshed validation tests. | 13 | 20–28 |
| 03 | `ARC-03-servicenow-docs-corpus/` | Shallow + sparse ServiceNowDocs submodule, generated area list, citation gate, `docs sync` / `verify` / `status` / `--upstream` / `family`, weekly bump PR, attribution. | 11 | 18.5–23.5 |
| 04 | `ARC-04-mcp-server-hardening/` | Server-only scope, unconfigured start, single store, per-instance flags, read/write gate split, presets, contract generator, defect fixes, audit trail, proxy agent, doctor module, committed `dist/`. | 14 | 31–32 |
| 05 | `ARC-05-contract-and-drift-prevention/` | Contract pinned by the engine, `engine-lint`, generated governance texts and permission blocks, server contract test, CI gate, drift drill. | 11 | 15–20 |
| 06 | `ARC-06-bootstrap-and-registration/` | Committed secret-free `.mcp.json` + `.claude/settings.json`; `snowarch` CLI; resumable bootstrap with one amendable plan; `bootstrap.sh` / `.ps1` / `.cmd`; `mode live|design`; the install page. | 14 | 21.5–38.5 |
| 07 | `ARC-07-instance-wizard-and-credentials/` | `snowarch instance add …` masked-input wizard, probes with DNS/TLS/proxy diagnosis, preset review screen, 0600 store, `--global`, `import --from-legacy`, `/snowarch setup-instance`, live E2E. | 11 | 20–25 |
| 08 | `ARC-08-doctor-and-self-heal/` | Unified doctor (engine E-xx + server SV-xx checks), leftover detectors, `--fix` whitelist, SessionStart Mode banner, `/snowarch status`, runtime error mapping. | 11 | 22–30 |
| 09 | `ARC-09-release-upgrade-and-cross-platform/` | Release script and tag, changelog, release workflow, `version` / `upgrade`, store migrations, CI matrix on macOS/Linux/Windows × Node 20/22/24 incl. Windows without Git Bash, optional npm publish. | 11 | 15–25 |
| 10 | `ARC-10-migration-and-cutover/` | `docs/MIGRATION.md`, legacy scaffolding retired, author's cutover, clean-machine validation runs, deprecation notices, two-week review and archive. | 10 | 10.5–14 (+14 calendar days) |

## Status legend

| Status | Meaning |
|--------|---------|
| **Draft** | Written by the planning session; not yet reviewed by the owner. |
| **Stories verified** | Every story of the ARC was written and adversarially verified against `00`–`03`, the decisions and the source repositories (all eleven ARCs, 2026-09-04). |
| **Integrated** | Cross-ARC consistency pass done: unique IDs, acyclic dependency graph, every cross-reference resolved, decided names everywhere (all eleven ARCs, 2026-09-04 — this is where every ARC stands now). |
| **Confirmed** | Owner has approved the ARC; implementation may start once its entry gate in `04` is met. |
| **In progress** | At least one story of the ARC is being implemented in the new repository. |
| **Done** | Every acceptance criterion of the ARC passes on a clean machine. |

## Conventions used in every file

- **Evidence notation.** `engine:<path>:<line>` refers to `~/work/AI-Architect-Claude`; `mcp:<path>:<line>` refers to `~/work/snow-mcp`; `docs:<page>` refers to `https://code.claude.com/docs/en/<page>.md`; `cli:` refers to output of the installed Claude Code CLI 2.1.258. Facts without a citation are marked **unverified**; a platform behaviour no document states is tied to a named spike `S-xx`.
- **No credentials** appear anywhere in this folder. Where a credential was observed in a configuration file the text says only that one is present.
- **Names.** The decided names (D-01, R-1, R-2) are used throughout: repository `farstic/ai-servicenow-architect`, CLI `snowarch`, MCP server key `servicenow`, package `@farstic/snowarch` in `packages/snowarch`, first release `2.0.0`, skill `/snowarch`. An older spelling (`packages/snow-mcp`, `/status`, `/setup-instance`, `1.0.0`, "Tier N") survives only inside a "reads as" note, a retired-name list, a quotation of the old repositories, or the untouched npm record `@farstic/snow-mcp@1.0.0`.
- **Story identifiers.** `ARC-NN-Sxx` as defined in each ARC's `STORIES.md` story map; cross-ARC references use these IDs, never the former README title numbers (each ARC's `STORIES.md` keeps the number → ID map for the record).
- **Vocabulary.** Mode `design-only` | `live`; Preset `read-only` | `pdi-developer` | `full` | `custom`. "Tier" is retired.
- **Language.** All artefacts are corporate professional English per the engine's own rule; discussion with the owner may be Bulgarian or English.

## How to use these plans

- **Where the work is defined.** Each story lives in `ARC-NN-<slug>/STORIES.md` under its `### ARC-NN-Sxx` heading; the ARC's README is the contract for the whole epic (acceptance criteria are the definition of done for the ARC). `05-STORY-INDEX.md` is the tracking sheet — maintain its *Status* column (Not started · In progress · Blocked · Done); do not restate story text there.
- **In what order.** Follow `04-ROADMAP.md`: M0 (ARC-00) first, then the milestones in order; inside a milestone, the parallel streams and the critical path tell you what to start next. Do not start an ARC before its entry gate in `04` §3 is met and its README "Dependencies" line is satisfied; ARC-01 and ARC-06 additionally need the signed gate block that ARC-00-S14 appends to ARC-00's README.
- **Where results go (in the product repository).** Spike records `docs/spikes/S-NN-<slug>/README.md` (imported from the spike repository by ARC-01-S02), decisions `docs/decisions/ADR-*.md`, validation records `docs/validation/`, the scope-cut ledger and history in `docs/ARCHITECTURE.md`.
- **How to raise a change.**
  1. *A decision changes* (names, scope, posture, channel): write a new ADR that supersedes the old one (ADRs are immutable once Accepted), add a dated line to the post-decision rulings table in `02`, and list the stories whose text carries the old value — the retired-name and legacy-name lints (ARC-01-S10, ARC-05-S02/S03) will catch the rest in the repository.
  2. *A story changes* (scope, acceptance criteria, size): edit the story and its story-map row in `STORIES.md`, keep the ID stable (retire an ID rather than reuse it), and re-run the three checks in `05` §"How this sheet was built": unique IDs, acyclic dependency graph, every cross-reference resolving. Regenerate `05-STORY-INDEX.md` afterwards.
  3. *A spike fails*: ARC-00-S14 owns the propagation — set the row's Status in `03` §A/§B, apply the pre-recorded fallback sentence to `01` and the ARC README it names, and record any user-visible change in the ADR follow-up. Never rewrite a decision through a spike.
  4. *A platform fact turns out wrong* (Claude Code, git, npm, Windows): correct `00`/`01`/`03` first, then the stories that cite the section — every story cites its evidence by section, so `grep` finds them.
- **When an ARC is done.** Tick its README acceptance criteria on a clean machine, mark its stories Done in `05`, and set the README `Status:` line. The `2.0.0` release exit checklist in `04` §5 is the programme-level definition of done.
