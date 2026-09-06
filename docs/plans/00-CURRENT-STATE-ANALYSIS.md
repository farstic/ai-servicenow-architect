# 00 — Current-State Analysis

Status: **Draft** · Audit date: 2026-09-04 · Sources: read-only audit of both working trees, Claude Code CLI 2.1.258, `code.claude.com/docs`. Evidence notation is defined in [`README.md`](README.md).

This document is the ground truth the rest of the plan set builds on. A new maintainer should be able to learn the whole current system from it without opening either repository.

---

## 1. Executive summary

- The product today is **two repositories plus one machine-local file**. The engine (`AI-Architect-Claude`, GitHub `farstic/claude-servicenow-live`) is a Claude Code project whose only automatically loaded file is a 58 KB `CLAUDE.md`; 28 skills and 9 sub-agents are read from `.claude/skills/` and `.claude/agents/`. The MCP server (`snow-mcp`, package name `servicenow-mcp` 1.0.0, 394 tools) is a separate TypeScript checkout that must be built locally. They are joined by a per-project entry in `~/.claude.json` that carries an absolute path to `dist/server.js`, a plaintext ServiceNow password, and an incomplete set of permission flags.
- **Nobody can install it from the documentation.** Yesterday's audit found 71 findings, 23 blockers; the uncommitted `scripts/setup.sh` (1,022 lines) and `scripts/doctor.sh` (39 checks) are the first fix and the best statement of what a correct install must satisfy — and the author's own reference machine fails that doctor with 4 FAILs.
- The engine↔server coupling is **purely textual and drifting**: 31 retired tool names (118 occurrences in 12 governing files), a §2.1 write gate keyed on a prefix the server is no longer registered under, four incompatible meanings of the word "Tier", and no machine-readable contract on either side.
- **Design-only mode is a real, supported end state in the engine but impossible in the server**: `server.ts` exits 1 when no instance is configured.
- **context-mode is the author's personal tooling**, not an engine dependency: zero references in any skill, agent or governance file; mandated only by the author's global `~/.claude/CLAUDE.md`.
- Claude Code 2.1.258 provides, docs-verified, every mechanism a clean design needs: a committed project-scope `.mcp.json` with `${VAR:-default}` expansion, committed `.claude/settings.json` with exec-form hooks, `.claude/skills` / `.claude/agents` discovery, `CLAUDE.md` imports and `.claude/rules/`, `enabledMcpjsonServers` / `disabledMcpjsonServers`, MCP `list_changed`, and (for a later channel) plugins with bundled MCP servers and masked `userConfig` secrets. See §9.

---

## 2. The two repositories at a glance

| | Engine | MCP server |
|---|---|---|
| Local path | `~/work/AI-Architect-Claude` | `~/work/snow-mcp` |
| GitHub | `farstic/claude-servicenow-live` (directory and repo names differ) | `farstic/snow-mcp` (public); every URL inside the repo points at `github.com/cvetomirgrigorov/servicenow-mcp`, which does not exist (`gh repo view` → "Could not resolve") |
| What it is | Claude Code orchestrator: `CLAUDE.md`, 28 `SKILL.md`, 9 agents, governance-rules / taxonomy / prompt-patterns, templates, scripts, `docs/`, `ServiceNowDocs/` submodule | Node ≥ 20 TypeScript/ESM MCP server: 394 `snow_*` tools, 38 prompts, 7 resources; plus CLI wizard, BYOK "direct mode", PDF/PPTX reports, A2A endpoint, HTTP dashboard, Electron desktop app, six AI-client config writers |
| Size | 4.7 MB tracked (176 files) + 616 MB submodule | 164 MB `node_modules` (dev), 72 MB production deps, 4.2 MB `dist/` (gitignored) |
| Version(s) of record | `CLAUDE.md:14` says v2.8.0; footer says v2.7.8; CHANGELOG stops at 2.7.6; docs badges 2.6; README roadmap uses 1.x; skills 1.0.0/1.1.0/2.0.0; **0 git tags** across 58 commits | `package.json` 1.0.0; `server.json` and `smithery.yaml` 4.0.0; `desktop/package.json` 3.0.3; `docs/TOOLS.md` "v2.6.0"; dashboard HTML "v4.0.0"; **0 git tags**, 28 commits (2026-06-06…06-08) |
| Licence | `docs/README.md:157-159`: "Proprietary … Internal use only; not licensed for redistribution" | `LICENSE:1-13`: source-available, **prohibits copying, modifying, merging, derivative works**; `smithery.yaml:15` says `license: MIT` |
| Working tree state | Modified: `CLAUDE.md`, `README.md`, `SETUP.md`, `docs/{INSTALLATION-GUIDE,MCP-OPERATIONS-GUIDE,README,TECHNICAL-ARCHITECTURE}.md`, `scripts/README.md` (+379/−173). Untracked: `scripts/doctor.sh`, `scripts/setup.sh`, `scratchpad/`. Submodule gitlink drift (§3.10) | Clean; `dist/` present locally but gitignored |

---

## 3. The engine, mapped

### 3.1 Layout and what Claude Code actually loads

Root governing files: `CLAUDE.md` (441 lines / 58 KB — **the only file loaded automatically**), `governance-rules.md` (§1.1 baseline-first, §2.1 write gate, §2.2 update-set capture, §4 delivery artefacts), `taxonomy.md` (304 lines), `prompt-patterns.md` (518 lines, PP-01…PP-24), `client-onboarding.md` (DRAFT), `VALIDATION-TESTS.md` (715 lines; 18 manual behavioural tests T-01…T-18), `README.md` (629 lines, 9-step manual), `SETUP.md` (160 lines, canonical since 2026-09-04). Directories: `.claude/{agents,skills,settings.json,settings.example.json}`, `agents/`, `skills/`, `docs/` (11 files, 2,370 lines), `scripts/` (15 files), `reference/templates/` (ADR, RTM, RAID, NFR), `templates/` (HLD, Gherkin), `.githooks/pre-commit`, `ServiceNowDocs/`, plus local-only `scratchpad/` and `.backups/`.

Evidence: `ls -la`, `wc -l`, `git ls-files | wc -l` = 176, `du -sh -I ServiceNowDocs -I .git .` = 4.7M.

The implicit audience split — end-user runtime (`CLAUDE.md`, skills, agents, governance, taxonomy, prompt patterns), maintainer (VALIDATION-TESTS, `.githooks`, `scripts/verify-*`, sync script, CHANGELOG), optional deliverable toolchain (`scripts/md-to-docx*`, `render-*`) — is not reflected in the layout.

### 3.2 Skills and agents: duplication and discovery

- `skills/` and `.claude/skills/` (28 directories each) and `agents/` and `.claude/agents/` (9 files each) are **byte-identical real copies, both committed** (`diff -rq` → no differences; `git ls-files .claude | wc -l` = 68; ~1.8 MB duplicated).
- Claude Code discovers project skills only at `.claude/skills/<name>/SKILL.md` and project sub-agents at `.claude/agents/` (`docs:skills` "Where skills live"; `docs:sub-agents` scope table). The root copies are dead weight at runtime.
- The repository contradicts itself about which side is canonical: `scripts/sync-agents-skills.sh:11-16` and `README.md:212` say `.claude/` is the source and the root is a GitHub-visibility mirror; `docs/TECHNICAL-ARCHITECTURE.md:301` and `docs/README.md:131` say the opposite.
- Yet `scripts/verify-citations.sh:21` (`SCAN_DIR=skills`) and `verify-structure.sh` scan the **root** copies, and agents load their skill by root path (`agents/developer.md:34` → `skills/developer/SKILL.md`). The gates verify the mirror and the agents read the mirror.
- Frontmatter is valid and plugin-shaped: `claude plugin validate .claude/skills` and `.claude/agents` both pass on 2.1.258. 27 of 28 skills carry `version:` (missing: `operational-documentation`).

### 3.3 Skill descriptions and the listing cap

Descriptions total 27,672 characters; 18 of 28 exceed 1,000 characters (`estimation-specialist` 1,611, `licensing-specialist` 1,596). The skill listing truncates at 1,536 characters (`docs:skills` frontmatter table). In the planning session's own Claude Code process, **seven skills registered with no description at all** (`operational-documentation`, `performance-scale-specialist`, `reporting-analytics-specialist`, `security-grc-specialist`, `spm-specialist`, `technical-designer`, `ui-ux-specialist`) and two were truncated with "…". Description-driven auto-routing of a builder (`technical-designer`) and two consults is therefore impaired today. The mechanism that drops whole descriptions is not stated in the docs (**unverified**; check with `claude --debug`).

### 3.4 Sub-agents: model pin, tools, harness naming

All 9 agents pin `model: claude-opus-4-8` and restrict `tools: Read, Write, Edit, Glob, Grep, WebFetch` (`grep -n '^model:\|^tools:' agents/*.md`). Per `docs:sub-agents`, omitting `tools` inherits every tool including MCP tools; an explicit list excludes them — so builders cannot touch a live instance by construction (only the main thread can). The pinned model ID is a hidden hard dependency; the docs offer aliases `sonnet` / `opus` / `haiku` and `inherit`. Agents read their skill by path rather than through the `skills:` frontmatter field that preloads a skill (`docs:sub-agents` "Preload skills into subagents"). `CLAUDE.md:90,160` and `docs/TECHNICAL-ARCHITECTURE.md:117` say sub-agents are dispatched "via the Task tool"; the current CLI exposes the `Agent` tool.

### 3.5 Governance and `CLAUDE.md`

`CLAUDE.md` carries identity, the repo map, the roster, the two-phase routing protocol (Phase 1 §6.1 with the Domain Expert gateway at Step 5; Phase 2 §6.2 post-build with Code Reviewer / ATF / Operational Documentation / Diagramming proposals), builder-pair rules, the §2.1 MCP write gate, the §2.2 update-set capture protocol, the "Status" command, the field-notes standing rule, and two validation tests. The uncommitted working-tree version adds a "Mode" rule: Status must run `bash scripts/doctor.sh` and quote its `Mode:` line verbatim (`CLAUDE.md:354`).

§2.1 in the **committed** `CLAUDE.md:294` keys the write gate on `mcp__nowaikit__create_*/update_*/delete_*/execute_*`; the server is registered as `servicenow-mcp`, so live tool names are `mcp__servicenow-mcp__snow_*`. The working-tree copy rewrites the gate as "any tool that mutates instance state, whatever it is named" under `mcp__servicenow-mcp__` (`CLAUDE.md:296,300`). §2.2 in both `CLAUDE.md:325-338` and `governance-rules.md:99-110` still uses retired names (`create_update_set`, `query_records`, `update_record`, `create_record`, `switch_update_set`, `execute_script`); the working-tree `README.md:278-286` restates the same protocol with current names.

### 3.6 Four incompatible "Tier" vocabularies

| Vocabulary | Meaning | Where |
|---|---|---|
| Delivery surface | Tier 0 = design-only, no MCP; Tier 1 = claude.ai Projects; Tier 2 = Claude Code + MCP | `README.md:7-9`, `CLAUDE.md:1`, `taxonomy.md:5` |
| Operations guide / author's global rules | Tier 0 = no MCP; Tier 1 = read-only; "Tier 1 (Read-Write)" | `docs/MCP-OPERATIONS-GUIDE.md:31-39`; `~/.claude/CLAUDE.md:64-66` |
| Uncommitted setup/doctor | Tier 0 = design-only; Tier 1 = live instance | `scripts/setup.sh:8-16,774`; `scripts/doctor.sh` `--tier0` |
| Server | Tier 1 = `WRITE_ENABLED`; Tier 2 = `CMDB_WRITE_ENABLED`; Tier 3 = `SCRIPTING_ENABLED`; "Tier AI" = `NOW_ASSIST_ENABLED`; ATF; `smithery.yaml` "5-tier permissions" | `mcp:.env.example:37-49`; `mcp:src/utils/permissions.ts:5-12` |

"Tier 2" means "Claude Code" in the engine and "CMDB write" in the server.

### 3.7 Tier 1 (claude.ai Projects) is unimplemented

`claude-ai-projects/` does not exist and is gitignored (`.gitignore:4`); `README.md:337-339,369`, `docs/ADVANCED-WEB-SETUP.md:99` and `client-onboarding.md:3` carry "not yet shipped" banners; `taxonomy.md:5` still claims to be read by a "Tier 1 master". `docs/ADVANCED-WEB-SETUP.md` zips five skills for claude.ai upload — but claude.ai skill uploads accept only `name/description/license/compatibility/metadata/allowed-tools` and fail hard on any other key; 27 skills carry `version:` (`docs:skills` "Using skill frontmatter outside Claude Code").

### 3.8 Versioning and counts drift

Five independent counters (see §2) and zero tags. `docs/TECHNICAL-ARCHITECTURE.md:233,264,280` says 8 sub-agents / 25 skills / 10 tests and lists CMDB & CSDM as a routing-time consult (CLAUDE.md says gateway); `docs/BUSINESS-OVERVIEW.md:19,67` says 24 roles; `docs/README.md:129-132` says 12 skills / 7 sub-agents / 10 tests; `governance-rules.md:63` says "all 25 specialists". Actual: 27 personas (28 `SKILL.md` including the `now-assist-genai` companion), 9 sub-agents, 18 tests. `scripts/doctor.sh:234-235` derives expected roster counts by parsing `CLAUDE.md` prose.

### 3.9 Tooling, pre-commit, and the uncommitted setup/doctor

- All governance scripts are bash-only (`doctor.sh`, `setup.sh`, `verify-structure.sh`, `verify-citations.sh`, `sync-agents-skills.sh`, `.githooks/pre-commit`) but bash-3.2-clean (no `declare -A`, `mapfile`, `${var,,}`); Windows needs Git Bash or WSL (`SETUP.md:35`). `jq` is not used anywhere; `doctor.sh` reads `~/.claude.json` with `node -e` (`scripts/doctor.sh:405-466`), so **the doctor itself needs Node even in design-only mode**.
- The pre-commit chain (mirror sync → verify-structure → verify-citations) is inert until `git config core.hooksPath .githooks` is run per clone (`.githooks/pre-commit:7-8`; `README.md:141`). `verify-citations.sh:23-26` deliberately exits 0 when the submodule is absent, so a fresh clone passes with every citation unverified.
- `scripts/setup.sh` (uncommitted, 1,022 lines): S1 preflight (`doctor --tier0`), S2 submodule init, S3 hooksPath, S4 mirror sync, S5 optional context-mode (default N), S6 `settings.json` from the example, S7 tier gate, S8 locate/clone `../snow-mcp`, S9 `npm install && npm run build`, S10 credentials via `read -rs`, S11 six flags + `MCP_TOOL_PACKAGE` + `MAX_RECORDS`, S12 `claude mcp add servicenow-mcp -s local -e … -- node <snow-mcp>/dist/server.js` with a verified backup of `~/.claude.json` and a re-read of the written entry, S13 full doctor. It ends with "RESTART REQUIRED".
- `scripts/doctor.sh` (uncommitted, 1,141 lines): 39 checks D00–D37 in three sections; flags `--tier0 --no-network --json`; exit 0/1/3; never writes; redacts values matching `/PASSWORD|SECRET|TOKEN|_KEY$/i` but **prints the basic-auth username in clear** (`scripts/doctor.sh:617`). D25–D27 re-implement the server's flag semantics in bash; D32/D33 re-implement basic-auth REST probes (`sys_user`, `sys_update_set`, `sys_script_include`, `cmdb_ci`, `sys_atf_test`, `sys_properties`); D36 fails unless `CLAUDE.md` gates on `mcp__<registered key>__`; D37 lists 12 governing documents with retired tool names.
- Reference machine result today: `DOCTOR: 36 ok, 4 warn, 4 fail` — 2 dead citations, `NOW_ASSIST_ENABLED` absent, `FLUENT_ENABLED` absent, 12 docs with retired names.
- Optional deliverable toolchain: `md-to-docx.py` (pure stdlib) / `md-to-docx.ps1` (PowerShell 5.1, no Word), `render-drawio.sh/.ps1` (draw.io Desktop), `render-pdf.sh` (LibreOffice) / `render-pdf-pages.ps1` (Word + WinRT), `render-diagrams.sh/.ps1` (`npx @mermaid-js/mermaid-cli`, downloads Chromium). The doctor treats all of these as WARN only.

### 3.10 The ServiceNowDocs submodule

- `.gitmodules`: `https://github.com/ServiceNow/ServiceNowDocs.git`, branch `australia`, **not** shallow. Apache-2.0 (Copyright 2026 ServiceNow), an LLM-oriented markdown export with images omitted, refreshed at least monthly, links as absolute GitHub raw URLs, `llms.txt` at root.
- Size: **616 MB** on disk = 346 MB working tree (48,991 `.md` files across 54 `markdown/` product folders) + 270 MB `.git` (single 263 MiB pack, 36 commits, full history; the submodule's `.git` is a full directory, not a gitdir pointer).
- **Pin drift**: superproject HEAD records gitlink `0ba98cd` (2026-05-15) but the checkout is `ba513f2` (2026-07-09 "July refresh"); `git status` shows ` M ServiceNowDocs`; the gitlink has never been bumped since the initial import (`git log -1 -- ServiceNowDocs` → 2026-05-28). "Australia release" therefore means two corpora depending on whether HEAD or the working tree is trusted. Release families are branches on the upstream: australia, xanadu, yokohama, zurich, main, mobile, nofamily, other, store.
- Consumption: 175 citation paths in skills covering 19–20 of the 54 folders (servicenow-platform 77, it-service-management 42, application-development 41–42, customer-service-management 40, employee-service-management 28, platform-security 25–26, it-operations-management 25, it-business-management 23, platform-user-interface 18, intelligent-experiences 13, it-asset-management 12, build-workflows 12, platform-administration 11, api-reference 10, now-platform 9, integrate-applications 5, now-intelligence 4, governance-risk-compliance 3, core-business-suite 2, now-assist 1). **Two citations are dead** (`markdown/it-asset-management/itam-subscrip-summary.md`, `…/subscription-itam-licensing.md`); `bash scripts/verify-citations.sh` → "checked 175 | dead 2 … FAIL". 35 citations point at directories (one at the `markdown/` root), so a file-level curated subset is not possible without a skills refactor.
- Measured alternative: a blobless, depth-1, cone-sparse clone of the 20 cited areas = **299 MB** (61 MB `.git`, 50.37 MiB pack, 35,185 files, ~55 s from GitHub); the 20 areas alone are 233 MB / 34,352 files.
- Behaviour without the corpus: the engine degrades to "say so and offer the live URL" (`CLAUDE.md` grounding rules; `docs/INSTALLATION-GUIDE.md:55`); doctor D15 reports FAIL. Docs are a soft runtime dependency but a hard dependency for the citation gate and the doctor.

### 3.11 Engagement residue and licence

Untracked `scratchpad/UserManagerAjax.js` (a ServiceNow Script Include), gitignored `.backups/settings.json.*`, `.DS_Store` present and not ignored; `clients/` absent and gitignored; `CLAUDE.md:413` designates `memory/MEMORY.md` for instance-specific values but `memory/` is neither present nor ignored. Committed documents that are one engagement's journal: `docs/LIVE-ARTEFACTS-CATALOGUE.md` (three artefacts on the author's PDI), `docs/nowaikit-field-notes.md` (15 PDI findings; §8 still says `claude_desktop_config.json`; section numbering runs 1-7,10,9,8,13,14,11,15 with no §12), `VALIDATION-TESTS.md:692-715` (dated test runs), `client-onboarding.md:194-218` (edits `claude_desktop_config.json` with `SERVICENOW_USERNAME/PASSWORD`, which `SETUP.md:132` says are OAuth-only aliases). Licence: proprietary/internal-only (`docs/README.md:157-159`) while the vision is a public repository embedding an Apache-2.0 corpus.

### 3.12 context-mode verdict

context-mode (npm package `context-mode` 1.0.25, Elastic-2.0, third-party author) is registered as a **user-scope** MCP server in `~/.claude.json`, wired as three hooks (PreToolUse/PostToolUse/SessionStart) in the author's `~/.claude/settings.json` with absolute paths under `~/.npm-global`, and mandated only by the author's global `~/.claude/CLAUDE.md`. In the engine it appears **only** in `README.md:227-253` (§3e), the gitignored `.claude/settings.json` and its tracked `.claude/settings.example.json` (same hooks with a `/path/to/your/npm-global` placeholder), `scripts/setup.sh:315-349` (S5, optional, default N, strips the hooks block if absent), `scripts/doctor.sh:379` and `docs/INSTALLATION-GUIDE.md:73` ("runs fully without it"). `grep -rE 'MCP|mcp__|ctx_' skills agents | wc -l` = 0. It depends on `better-sqlite3` (native module; `prebuild-install || node-gyp rebuild`), and its hooks intercept Bash/Read/Grep/WebFetch/Agent on every call, breaking those tools when the package is missing (`doctor.sh:378`). **Verdict: personal productivity tooling that leaked into the product; not an engine dependency.**

---

## 4. The MCP server, mapped

### 4.1 Identity, package, npm collisions

`package.json`: name `servicenow-mcp`, version 1.0.0, `type: module`, `engines.node >=20.0.0`, bins `servicenow-mcp` → `dist/cli/index.js` and `servicenow-mcp-server` → `dist/server.js`, `build = tsc && node scripts/extract-tools.mjs`, `setup = node dist/cli/index.js setup`; runtime deps include `@modelcontextprotocol/sdk ^1.26`, `@inquirer/prompts`, `chalk`, `ora`, `commander`, `dotenv`, `pdfmake`, `pptxgenjs`, `zod` (`mcp:package.json:2-50,101-110`).

**Not published under that name.** `npm view servicenow-mcp version` → 1.2.0 (repository `schwarztim/servicenow-mcp`); `npm view servicenow-mcp-server version` → 2.1.10 (Happy Technologies LLC). `README.md:55-56` (`npx servicenow-mcp start`, `npx -y servicenow-mcp-server`) and `docs/INSTALLATION.md:35-38,147-162` would install strangers' code; the CLI's update check (`src/cli/index.ts:57-85`) fetches `registry.npmjs.org/servicenow-mcp/latest` and, because 1.2.0 > 1.0.0, nags "Update available … Run npx servicenow-mcp@latest" on every CLI invocation. **The author does own a scoped name**: `npm view @farstic/snow-mcp version maintainers` → `1.0.0`, maintainer `farstic` (verified 2026-09-04); that tarball was published from an untracked state (git HEAD still names the package `servicenow-mcp`).

`dist/` is gitignored (`.gitignore:5`); a fresh clone has no runnable server until `npm install && npm run build`. `dist/tools-manifest.json` lists 394 tools (`scripts/extract-tools.mjs:28-31` guards `EXPECTED=394`).

### 4.2 Configuration precedence and the startup gate

`InstanceManager.loadInstances()` (`mcp:src/servicenow/instances.ts:41-169`): (1) `SN_INSTANCES_CONFIG` JSON file with snake_case keys; (2) `~/.config/servicenow-mcp/instances.json` — the wizard store, camelCase keys — **returns early and thereby silently overrides every env-var instance** (`tests/servicenow/instances.test.ts:7-9` documents this); (3) `SN_INSTANCE_<NAME>_URL/_AUTH/_USERNAME/_PASSWORD/_CLIENT_ID/_CLIENT_SECRET` with `SN_DEFAULT_INSTANCE`; (4) legacy `SERVICENOW_INSTANCE_URL` as `default` (aliases `SERVICENOW_OAUTH_*` or unprefixed `SERVICENOW_CLIENT_ID/USERNAME/PASSWORD`). The header comment lists three methods and omits the wizard store. The wizard store copies `writeEnabled/scriptingEnabled/cmdbWriteEnabled/atfEnabled/nowAssistEnabled` of the **default** instance into `process.env` only when unset; `fluentEnabled` is not in the map (`instances.ts:89-106`).

Startup gate (`mcp:src/server.ts:23-30`): if none of `SERVICENOW_INSTANCE_URL`, `SN_INSTANCE_*_URL`, `SN_INSTANCES_CONFIG` is set, log "No ServiceNow instance configured" and **exit 1** — the wizard store does not satisfy it. With only a placeholder URL (no credentials) the server starts and advertises 394 tools (probe: `SERVICENOW_INSTANCE_URL=https://example.invalid node dist/server.js` → "running on stdio [394 tools]"). **Design-only mode is therefore not supported by the server today.**

`dotenv.config()` runs at start with no path (`server.ts:11,21`), so a `.env` in the spawning process's cwd — for Claude Code, the project directory — is loaded into the server.

### 4.3 Permission flags: semantics, gating, advertisement

- Guards are pure env checks: `process.env.X !== 'true'` throws `ServiceNowError` with codes `WRITE_NOT_ENABLED`, `CMDB_WRITE_NOT_ENABLED`, `SCRIPTING_NOT_ENABLED`, `NOW_ASSIST_NOT_ENABLED`, `ATF_NOT_ENABLED`, `FLUENT_NOT_ENABLED`; **absent == disabled**; `requireCmdbWrite()` and `requireScripting()` call `requireWrite()` first (`mcp:src/utils/permissions.ts:14-68`).
- Tool advertisement never consults the flags: `collectToolCatalog()` filters only by `MCP_TOOL_PACKAGE` (`src/tools/index.ts:274-290`); no `is*Enabled()` helper is referenced outside `permissions.ts`. A disabled family therefore fails **mid-task** with `(Code: *_NOT_ENABLED)` rather than being absent from `tools/list`.
- Gate placement: `dispatchScriptAction` gates **every** `snow_scr_*` tool, reads included (`src/tools/script.ts:389-391`); `dispatchNowAssistAction` gates every `snow_na_*` (`src/tools/now-assist.ts:153-155`); all `snow_us_*` writes call `requireScripting` (`src/tools/updateset.ts:143-195`); ATF gates only `*_exec` (`src/tools/atf.ts:140-158`); Fluent SDK tools call `requireFluent` while `snow_fluent_script_exec` only calls `requireWrite` (`src/tools/fluent.ts:384-386,401-422`). Description markers are inconsistent: `[Write]` 48, `[Scripting]` 11, "requires WRITE_ENABLED" 73, "requires SCRIPTING_ENABLED" 28, NOW_ASSIST 8, ATF 2, CMDB_WRITE 1, FLUENT 3; 4 mutating-named tools carry no marker at all.
- Flags are **process-global**, not per instance (`docs/MULTI_INSTANCE.md:182` acknowledges it). A dev-write / prod-read posture needs separate server processes today.

### 4.4 Tool packages

`MCP_TOOL_PACKAGE` selects one of 14 values (`full` + 13 role bundles: service_desk, change_coordinator, knowledge_author, catalog_builder, system_administrator, platform_developer, portal_developer, integration_engineer, itom_engineer, agile_manager, ai_developer, devops_engineer, itam_analyst — `.env.example:64-68`; the wizard lists 10). No bundle contains the 35 tools the engine cites: closest are `system_administrator` (79 tools, 18 missing — all `snow_scr_*`) and `platform_developer` (55 tools, 18 missing — every `snow_us_*`). An unknown name silently falls back to `full` (`tests/tools/router.test.ts:45`). Any non-`full` choice breaks §2.2 or the Developer / Code Reviewer flows with `UNKNOWN_TOOL`.

### 4.5 Multi-instance

One `ServiceNowClient` per registered instance in a module-singleton `InstanceManager`; `snow_core_instance_switch` flips `currentName` for the whole process (shared across HTTP sessions); `snow_core_instances_index` / `snow_core_current_instance_read` report state; `InstanceManager.reload()` exists but nothing calls it (`instances.ts:32-34,189-248`; `src/tools/core.ts:231-252,378-398`). `server.ts:68-69` routes an `args.instance` override, but **zero** of the 394 `inputSchema`s declare an `instance` property, although `docs/MULTI_INSTANCE.md:142-150` documents it.

### 4.6 Wizard, writers, client registration

- `npm run setup` = an 11-step `@inquirer` wizard (`src/cli/setup.ts:361-1131`, 1,348 lines): instance (subdomain → `https://<x>.service-now.com`, HEAD reachability, "continue anyway"), auth basic|oauth + execution context, credentials (masked), connection test via `queryRecords({table:'sys_user',limit:1})` with Retry / Re-enter / "/api prefix" (which produces an invalid base URL) / HTTPS / **Save anyway** / Cancel, tool package + write → scripting/CMDB/ATF sub-flags + Now Assist (**FLUENT never asked**), components mcp/sdk/apex, AI provider (Ollama/LM Studio/Anthropic/OpenAI key), informational steps, save, client install, auto-configuration. After client install it runs `npm link` (falls back to `npm prefix`, then sudo advice) (`setup.ts:238-269`).
- The wizard persists the whole `InstanceConfig` — `password`, `clientSecret`, `aiApiKey` — as plaintext JSON at `~/.config/servicenow-mcp/instances.json` via `writeFileSync` with default permissions (`src/cli/config-store.ts:13-51,129-141`), on every platform including Windows.
- Client writers cover Claude Desktop, Cursor, VS Code, Windsurf, Continue.dev, Claude Code (detected by `which claude`) and a `.env` fallback (`src/cli/detect-clients.ts:47-187`). Claude Code registration is `execSync("claude mcp add servicenow-mcp node <abs dist/server.js> --env K=V …")` built by string concatenation — no quoting, **no `-s/--scope`** (so it lands in `local` scope for the directory the wizard ran in), plaintext password in argv/env, emits `SERVICENOW_AUTH_MODE` / `SN_INSTANCE_GROUP` / `SN_INSTANCE_ENVIRONMENT` (never read by the server) and never `FLUENT_ENABLED` (`src/cli/writers/index.ts:17-47,110-122`). A password with a shell metacharacter breaks it. `docs/CLIENT_SETUP.md:22-43` and `clients/claude-code/SETUP.md:25-48` instruct `claude mcp add servicenow --command "node" --args "…"` — flags the CLI does not have (`cli: claude mcp add --help` lists `-e/--env`, `-s/--scope`, `-t/--transport`, `-H/--header`).
- OAuth is implemented only as the resource-owner password grant against `/oauth_token.do` (client id + secret + username + password; token cached at 90 % of `expires_in`; refresh token unused — `src/servicenow/client.ts:108-150`). Per-user auth (`servicenow-mcp auth login`) pastes an authorization code manually and stores tokens in `~/.config/servicenow-mcp/tokens.json` without a file mode (`src/cli/auth.ts:29-135`). `grep client_credentials src` → none.

### 4.7 Transports, dashboard, desktop, web

- Transports: stdio (default); `sse` (GET `/sse` + POST `/messages`); `http` (Streamable HTTP at `/mcp`, one transport + Server per session) — both add unauthenticated `GET /health`; HTTP also mounts REST (`/api/tools`, `/api/tool`, `/api/instances`, `/api/instances/switch` …), A2A (`/.well-known/agent.json`) and the dashboard. Bearer auth is `SNMCP_API_KEY`; **unset means unauthenticated**; `CORS_ORIGIN` defaults to `*` (`src/transport/index.ts:27-190`; `src/api/index.ts:22-126`; `.env.example:83-89`).
- The dashboard is a static page: four stat cards, tool search, one-tool JSON viewer; no instance/flag/credential editing; version hard-coded "v4.0.0"; it requires an already-configured instance to boot (`src/dashboard/index.ts:12-118`). **It cannot be the post-install wizard.**
- `servicenow-mcp web` spawns `desktop/serve.cjs` on `127.0.0.1:4175` serving `desktop/renderer/dist` (absent in a fresh clone → "Web UI assets not found"), which proxies AI-provider and ServiceNow REST calls directly from the browser — it bypasses the MCP server entirely (`src/cli/index.ts:205-264`; `desktop/serve.cjs`).
- `desktop/` is Electron 41 + React 18 + Vite (v3.0.3): spawns `dist/server.js` as a private child (invisible to Claude Code), encrypts secrets with AES-256-GCM keyed via `safeStorage`, then `syncToMcpConfig()` **decrypts them back into plaintext** `~/.config/servicenow-mcp/instances.json` and defaults `writeEnabled: … ?? true` (`desktop/main/config-store.ts:303-337`). It never writes any AI-client config; `release.yml` builds only on `v*` tags (0 exist); code signing unconfigured.

### 4.8 Known defects (still present in source)

| Defect | Location | Effect |
|---|---|---|
| Descending sort built as `ORDERBY<field>^ORDERBYDESC`; correct encoded form is `ORDERBYDESC<field>` (`engine:ServiceNowDocs/markdown/api-reference/GlideListClientAPINEx.md:191`) | `mcp:src/servicenow/client.ts:384-388` | `orderBy: '-sys_created_on'` silently returns ascending order; `SETUP.md:154` documents an operator workaround |
| `snow_intg_event_register` writes only name/table/description | `src/tools/integration.ts` | `event_name` left empty (field-notes §4) |
| `snow_scr_business_rule_add` payload has no `action_insert/action_update` | `src/tools/script.ts` | rule never fires (field-notes §5) |
| `snow_deploy_background_script_exec` POSTs `/api/now/sp/background_script`; `snow_fluent_script_exec` → `/api/now/v1/batch` wrapping `sys_script_execution` | `src/tools/deployment.ts:143-147`; `client.ts` `executeScript` | 404/400 on PDI (field-notes §2) |
| Dynamic schema tools generated at runtime, but no `tools/list_changed` is ever sent and `CallTool` uses the array captured at `createServer()` | `src/tools/schema-cache.ts`; `src/server.ts:49-65` | "dynamic discovery" invisible to connected clients |
| Delete returned NOT_FOUND on success | `client.ts:302-305` | **fixed** (returns on HTTP 204) |

### 4.9 Tests, CI, Docker, docs accuracy, licence

- `npx vitest run` → 12 failed / 31 passed / 1 skipped files; 272 tests pass; all 12 failures are `desktop/tests/**` (missing `@playwright/test`, `@testing-library/*`, `electron` at root; `vitest.config.ts` has no exclude). `tests/setup.ts` presets `SERVICENOW_INSTANCE_URL`; live E2E behind `RUN_LIVE_E2E=1`.
- `.github/workflows/ci.yml:26-36` runs `npm ci`, lint, type-check, build on Node 20.x/21.x — **never `npm test`**. Ten `.github/agents/*.agent.md` are GitHub Copilot personas (unrelated to Claude Code).
- `Dockerfile:5-11` runs `npm ci --only=production` then `npm run build` — `typescript` is a devDependency and `scripts/` is never copied; the image cannot build.
- `docs/INSTALLATION.md:41-68,211-309,490-521` documents OIDC/SSO, audit logging (`AUDIT_*`), org policy (`SNMCP_ORG_CONFIG`), `ALLOW_ANY_TABLE/ALLOWED_TABLES`, `HTTP_PORT/HTTP_HOST`, `/auth/login` — zero implementation in `src`; it describes a 5-step wizard (real: 11). `.env.example` is the accurate env contract (every key has ≥ 1 src reference). Retired names persist in `EXAMPLES.md`, `docs/INSTALLATION.md`, `clients/lovable/SETUP.md`, `instances.example.json`; `tool-rename-map.json` (394 old→new) is consumed only by `tests/tools/parity.test.ts` — no runtime alias.
- `LICENSE` prohibits copying, modifying, merging, publishing, distributing, sublicensing or derivative works; `TERMS.md` restates it; `smithery.yaml:15` says MIT. **Merging this code into a new repository requires the copyright holder to relicense.**

### 4.10 Prompts and Copilot agents overlapping the roster

26 prompt capabilities (`scan-health`, `review-code`, `build-flow`, `build-business-rule`, `ops-deploy`, `docs-runbook`, …) are exposed by Claude Code as `/servicenow-mcp:<name>` (`docs:mcp` "Claude Code lists each MCP prompt as /servername:promptname") and cite retired tool names 212 times across 27 files (`src/prompts/capabilities/*.ts`). Invoking `/servicenow-mcp:build-flow` bypasses §1.1, §2.1, §2.2 and the Domain Expert gateways — a parallel, ungoverned persona roster.

---

## 5. How the two are wired today — the anti-pattern

`~/.claude.json` (102 KB, six projects with `mcpServers`) holds, under `projects["~/work/AI-Architect-Claude"].mcpServers["servicenow-mcp"]`:

```
type: stdio · command: node · args: [~/work/snow-mcp/dist/server.js]
env keys: SERVICENOW_INSTANCE_URL, SERVICENOW_AUTH_METHOD=basic, SERVICENOW_BASIC_USERNAME,
          SERVICENOW_BASIC_PASSWORD (a credential is present; value not read),
          WRITE_ENABLED, SCRIPTING_ENABLED, CMDB_WRITE_ENABLED, ATF_ENABLED
absent:   NOW_ASSIST_ENABLED, FLUENT_ENABLED, MCP_TOOL_PACKAGE, MAX_RECORDS
```

(`jq`/`node` inspection printing key names only.) Four other stale project entries register the server as `nowaikit` via `start-mcp.sh` scripts and one more `servicenow-mcp` entry under another path — six env blocks, six credential copies. `claude mcp list` shows `servicenow-mcp ✔ Connected`. The engine has no `.mcp.json`; `.gitignore:3-16` excludes `.claude/settings.json`, `.claude/settings.local.json`, `.mcp.json`, `.env`, `start-mcp.sh` — **nothing that wires the MCP is version-controlled**.

What a new user must do today to reach working tools: clone the engine; separately clone the server; `npm install`; `npm run build`; discover the `dist/server.js` path; run (or hand-write) the `claude mcp add … -s local` registration with 12 env keys; set `core.hooksPath`; restart Claude Code; and know that any absent flag will throw `*_NOT_ENABLED` half-way through a task. Local scope is keyed on the absolute checkout path, so renaming or moving the folder silently loses the server (`doctor.sh` D17). `claude mcp add` passes the secret through argv (visible to `ps`) and every `~/.claude.json.bak-*` retains historical secrets (`SETUP.md:110-118`).

---

## 6. Pain-point catalogue

Each row is a verified defect of the *onboarding architecture*, with evidence and the ARC that closes it. IDs are referenced from every ARC README.

| ID | Pain point | Evidence | Closed by |
|----|-----------|----------|-----------|
| P-01 | Product = two clones + a hand-edited, machine-wide JSON with a plaintext password, keyed on an absolute path | §5; `SETUP.md:105-118`; `doctor.sh` D17 | ARC-06 |
| P-02 | Three overlapping install narratives; README names a non-existent npm package and registers in `claude_desktop_config.json` (never read by Claude Code); four unstated steps between clone and working tools | `README.md:3,161-262,325-379`; `docs/INSTALLATION-GUIDE.md`; `SETUP.md:62-64`; `client-onboarding.md:194-218` | ARC-02, ARC-06 |
| P-03 | Absent flag = disabled but still advertised → `*_NOT_ENABLED` mid-task; the author's own registration omits two flags | `mcp:src/utils/permissions.ts`; `src/tools/index.ts:274-290`; §5 | ARC-04, ARC-07 |
| P-04 | 31 retired tool names, 118 occurrences in 12 governing files (+ ITOM skill); server rejects them with `UNKNOWN_TOOL` | rename-map scan; `CLAUDE.md:325-338`; `governance-rules.md:99-110`; `docs/MCP-OPERATIONS-GUIDE.md`; `skills/itom-discovery-specialist/SKILL.md:370` | ARC-02, ARC-05 |
| P-05 | §2.1 write gate keyed on `mcp__nowaikit__` while the server is registered as `servicenow-mcp` | `git show HEAD:CLAUDE.md` line 294; `doctor.sh` D36 | ARC-05 |
| P-06 | Four incompatible "Tier" vocabularies | §3.6 | ARC-02, ARC-07 |
| P-07 | Tier 1 (claude.ai Projects) unimplemented yet documented; skills carry keys claude.ai rejects | §3.7 | ARC-02 (D-03) |
| P-08 | Skills/agents duplicated in two committed trees; contradictory source-of-truth docs; gates verify the mirror | §3.2 | ARC-02 |
| P-09 | Skill descriptions exceed listing caps: 7 skills register with no description, 2 truncated | §3.3 | ARC-02 |
| P-10 | Sub-agents pin a model ID; docs name a harness tool that has been renamed | §3.4 | ARC-02 |
| P-11 | 616 MB full-history submodule; pin drift May→July; 2 dead citations; absent corpus passes the gate | §3.10 | ARC-03 |
| P-12 | Five version counters, zero tags; hand-maintained counts drift across docs | §3.8 | ARC-01, ARC-09 |
| P-13 | Engagement residue committed or lying in the tree; `memory/` convention not ignored | §3.11 | ARC-01 (purge at import), ARC-02 (field notes), ARC-10 (`memory/` convention) |
| P-14 | context-mode leaked into the product via example settings and setup S5 | §3.12 | ARC-02 |
| P-15 | Naming fragmented: `AI-Architect-Claude` / `claude-servicenow-live` / NowAIKit (14 files) / `servicenow-mcp` / `snow-mcp` | `git remote -v`; `grep -rli nowaikit` | ARC-01 (D-01) |
| P-16 | Tooling is bash-only (Windows needs Git Bash/WSL); doctor prints the username in clear; doctor needs Node even for design-only | §3.9 | ARC-08, ARC-09 |
| P-17 | The reference install fails its own doctor (4 FAILs) | §3.9 | ARC-06, ARC-08 |
| P-18 | Server package name and both bin names belong to third parties on npm; update nag points at a stranger's package; all repo URLs dead | §4.1 | ARC-01, ARC-04 |
| P-19 | Server version drift across five files | §2 | ARC-04, ARC-09 |
| P-20 | `dist/` gitignored → every install compiles TypeScript; Dockerfile cannot build | §4.1, §4.9 | ARC-04 |
| P-21 | Four config stores, hidden wizard-store override, two JSON schemas, startup gate ignores the store; **no instance → exit 1** (design-only impossible) | §4.2 | ARC-04 |
| P-22 | `dotenv.config()` from cwd loads a project `.env` into the server | §4.2 | ARC-04 |
| P-23 | Wizard stores secrets plaintext with default mode; runs `npm link`; unquoted, unscoped `claude mcp add`; never writes FLUENT; "Save anyway" | §4.6 | ARC-07 |
| P-24 | `SCRIPTING_ENABLED` gates reads (Code Reviewer cannot list Script Includes in a read-only posture); flags process-global | §4.3 | ARC-04 |
| P-25 | No `MCP_TOOL_PACKAGE` bundle covers the engine's tools; unknown value silently → `full` | §4.4 | ARC-04, ARC-07 |
| P-26 | ORDERBYDESC, `event_name`, `action_insert`, dead script-execution endpoints | §4.8 | ARC-04 |
| P-27 | Undeclared per-call `instance` argument; runtime-generated tools never announced | §4.5, §4.8 | ARC-04 |
| P-28 | HTTP/SSE unauthenticated by default; dashboard is not a wizard; desktop app decrypts secrets to disk; `web` bypasses MCP | §4.7 | ARC-04 (D-03) |
| P-29 | Root `npm test` red out of the box; CI never runs tests; release workflow never fired | §4.9 | ARC-04, ARC-09 |
| P-30 | Server docs describe unimplemented features and wrong CLI flags | §4.9 | ARC-04 |
| P-31 | 26 server prompts + 10 Copilot agents duplicate the roster and bypass governance | §4.10 | ARC-04 |
| P-32 | Licence conflict: source-available (no derivatives) vs `MIT` vs proprietary | §2 | ARC-00 (D-02) |
| P-33 | §2.2 update-set capture is a five-call composition; `active_update_set_ensure` picks an arbitrary in-progress set with no user filter | `mcp:src/tools/updateset.ts:118-226`; `grep sys_user_preference src` → descriptions only | ARC-04, ARC-05 |
| P-34 | Six credential copies in `~/.claude.json`; argv exposure; `.bak-*` retain secrets | §5 | ARC-06, ARC-07, ARC-10 |
| P-35 | No audit trail of write operations beyond §2.1 prose | — (absence) | ARC-04 |
| P-36 | No machine-readable contract: manifest carries only name/description/inputSchema; tier only in prose | §4.3 | ARC-05 |
| P-37 | Pre-commit hooks inert until `core.hooksPath` is set; citation gate passes with the corpus absent | §3.9 | ARC-09 (CI replaces) |
| P-38 | "OAuth" = ROPC password grant only (legacy; hardening can disable it); per-user auth unfinished | §4.6; `engine:ServiceNowDocs/markdown/platform-security/authentication/resource-owner-password-credential-workflow.md:3`; `…/sc-disable-resource-owner-password-credentials-ropc-in-oauth-2-token-grants.md` | ARC-07 (D-04) |
| P-39 | Templates split across `reference/templates/` and `templates/` | `find reference templates -type f` | ARC-01 (story 10) |
| P-40 | No native-Windows path; PowerShell twins exist only for the deliverable toolchain | `SETUP.md:35` | ARC-06, ARC-09 |

---

## 7. Dependency inventory and requirements matrix

### 7.1 Inventory (everything outside the two repositories)

| Dependency | Needed by | Floor / notes | Vendorable? |
|---|---|---|---|
| Claude Code CLI | everything | 2.1.258 installed; native binary (no Node at runtime); npm install path wants Node 22+; macOS 13+, Windows 10 1809+, Ubuntu 20.04+, 4 GB RAM (`docs:setup`). Login: Pro/Max or `ANTHROPIC_API_KEY` (key overrides subscription billing — `SETUP.md:31`) | no |
| git | clone, submodule, sparse checkout | ≥ 2.25 for cone `sparse-checkout` (git 2.25.0 release notes); ≥ 2.13 for plain recursive clone; host 2.39.5 | no |
| Node.js + npm | MCP server (`engines >=20.0.0`), doctor (`node -e`), Mermaid renderer (`npx`) | 20 minimum; 22 LTS recommended; host 24.16.0; CI matrix 20.x/21.x | no |
| bash 3.2 / Git Bash / WSL | every governance and setup script | macOS stock bash suffices; Windows needs Git Bash or WSL | n/a |
| ServiceNowDocs corpus | grounding, citation gate, doctor D15 | 616 MB full; 299 MB sparse; Apache-2.0 | yes (subset/sparse) |
| ServiceNow instance + account | live mode only | basic auth works with zero instance-side setup (`ServiceNowDocs/markdown/api-reference/rest-api-explorer/c_RESTAPI.md:273,316`); OAuth needs admin work | no |
| `@servicenow/sdk` | `FLUENT_ENABLED=true` only | `mcp:src/tools/fluent.ts:22-26` (`FLUENT_NOT_INSTALLED`) | no |
| python3 (stdlib) or PowerShell 5.1 | `.docx` export | `scripts/md-to-docx.py:1-12`; `.ps1:3-6` | n/a |
| draw.io Desktop | client-ready figures | `scripts/render-drawio.sh:23-32`; brew cask / winget / AppImage | no (Electron app) |
| LibreOffice or Word + WinRT | PDF QA | `scripts/render-pdf.sh:17-24`; `render-pdf-pages.ps1:2-8` | no |
| `@mermaid-js/mermaid-cli` + Chromium | Mermaid previews | `scripts/render-diagrams.sh:14-23` (first-run download) | no |
| context-mode (+ `better-sqlite3` native) | nothing in the engine | author's personal tooling (§3.12) | no |
| Docker | server http/sse deployment only | Dockerfile broken (§4.9) | n/a |
| Claude in Chrome | nothing | Claude Code's own `--chrome` feature; no engine reference | n/a |

`jq` is **not** a dependency (no script invokes it).

### 7.2 Requirements matrix (proposed for the new installer)

| Tier of capability | Must have | Graceful degradation when absent |
|---|---|---|
| **Design-only (default end state)** | Claude Code ≥ 2.1.214 (floor justified in `01` §12), logged in; git ≥ 2.25; HTTPS to github.com; ~350 MB disk (sparse docs) / ~650 MB (full) | Docs corpus absent → grounding degrades to "say so + live URL"; doctor reports FAIL with the sync remedy (never SKIP) |
| **Live instance** | Node ≥ 20 (22 LTS recommended) + npm on PATH; instance URL (bare https origin); basic account or OAuth client + user; all six flags explicit; `MCP_TOOL_PACKAGE=full`; `MAX_RECORDS` | Node absent → live mode unavailable, design-only continues; wrong password → `AUTHENTICATION_FAILED` at capture time, never at runtime |
| **Documents** | python3 (any 3.x) or PowerShell 5.1+; LibreOffice or Word for PDF QA | No `.docx` / no PDF preview; markdown deliverables unaffected |
| **Diagrams** | draw.io Desktop; Node + `npx mmdc` + Chromium | Mermaid-only diagrams; no figures embedded in Word (converter refuses Mermaid fences by design) |
| **Optional** | context-mode, Docker, Electron desktop, Claude in Chrome | Not part of the product |

---

## 8. The engine↔MCP coupling contract (as it exists today)

The coupling is one-directional (nothing in `snow-mcp` knows the engine exists) and confined to ~12 engine files: `CLAUDE.md` §2.1/§2.2, `governance-rules.md` §2.1/§2.2, `taxonomy.md` (1 line), `VALIDATION-TESTS.md`, `README.md`, `SETUP.md`, `client-onboarding.md`, `docs/*.md`, `scripts/setup.sh`, `scripts/doctor.sh`, `scripts/README.md`, `.claude/settings*.json`. The 28 skills and 9 agents contain **no** `mcp__`, `snow_`, `nowaikit`, flag or `sys_user_preference` reference, except one retired name (`cmdb_health_dashboard` → `snow_core_health_dashboard_read`) in the ITOM skill. The roster is already MCP-agnostic.

| Contract element | Current value | Where it is (re)stated |
|---|---|---|
| Registration key → tool prefix | `servicenow-mcp` → `mcp__servicenow-mcp__` (committed CLAUDE.md still says `mcp__nowaikit__`) | `setup.sh:91`; `CLAUDE.md:296`; `doctor.sh` D36 |
| Tools the engine cites (35, all present in the manifest) | `snow_core_{records_query,record_add,record_modify,record_remove,record_read,table_schema_read,natural_language_modify,health_dashboard_read}`, `snow_us_{update_set_add,active_update_set_ensure,current_update_set_read,update_set_switch,update_sets_index}`, `snow_scr_{business_rule_add,business_rule_modify,business_rules_index,script_include_add,script_include_read,script_include_modify,script_includes_index}`, `snow_intg_event_register`, `snow_flow_{flow_add,flow_action_add}`, `snow_atf_atf_{test_exec,suite_exec}`, `snow_cmdb_reconcile`, `snow_inc_incident_{resolve,modify}`, `snow_deploy_background_script_exec`, `snow_fluent_script_exec`, `snow_perf_table_completeness_check`, `snow_rpt_{aggregate_query_exec,scheduled_job_add,report_add}`, `snow_disco_table_discover` | rename-map scan against `dist/tools-manifest.json` |
| Flags | `WRITE_ENABLED`, `CMDB_WRITE_ENABLED`, `SCRIPTING_ENABLED`, `NOW_ASSIST_ENABLED`, `ATF_ENABLED`, `FLUENT_ENABLED` — exact string `"true"`, absent = false, SCRIPTING/CMDB_WRITE require WRITE | `permissions.ts`; `doctor.sh` D25–D27 (bash re-implementation) |
| Error codes | `*_NOT_ENABLED` ×6, `AUTHENTICATION_FAILED` (401), `INSUFFICIENT_PRIVILEGES` (403), `UNKNOWN_TOOL`, `FLUENT_NOT_INSTALLED` | `client.ts:276-278`; `SETUP.md` error catalogue |
| §2.2 update-set capture | create/ensure update set → resolve user sys_id → read/write `sys_user_preference` name=`sys_update_set` → write object → verify `sys_update_xml`; **no server tool sets the preference** | `CLAUDE.md:325-338`; `governance-rules.md:99-110`; `README.md:278-286` (current names) |
| Tool package | must be `full` | §4.4 |
| Output limits | `MAX_RECORDS` (cap 1000; code default 10 when unset; setup default 100) vs Claude Code's 25,000-token MCP output cap | `client.ts:368-374`; `docs:mcp` |
| Config source for the engine's mode | `~/.claude.json` env block parsed by `doctor.sh` with `node -e` | `doctor.sh:403-466` |

**Retired names still cited** (most frequent): `query_records` 21, `update_record` 10, `delete_record` 8, `create_record` 7, `create_update_set` 6, `switch_update_set` 6, `create_business_rule` 6, `register_event` 5, `execute_script` 4, `execute_background_script` 4, `create_script_include` 4. `execute_script` now maps to `snow_fluent_script_exec` (gated by FLUENT) — a rename-with-regate no text caught.

**Field-notes classification** (for ARC-02/ARC-04): platform facts that belong in product docs — §1 (platform half: REST honours `sys_user_preference` `sys_update_set`), §3 (email on PDI), §7 (`sys_update_xml` DELETE rows are normal), §10 (assignment rules in `sysrule_assignment`, field `document`), §11 (incident state 6 needs a valid `close_code`), §13 (basic-auth header leaks into `sys_outbound_http_log` at verbose levels), §15 (`sys_script_fix.name` truncates at 40). Server behaviours that belong in the server changelog/tests — §1 (`switch_update_set` only sets `is_default`), §2, §4, §5, §6, §9a (fixed), §9b (unverified). Obsolete — §8. Engine tooling — §14.

**Minimal contract that stops the drift** (adopted in `01` §11): one committed JSON with server name, flags + semantics + dependency graph, error codes, required tools with per-tool `gate` and `mutates`, the §2.2 call sequence, named presets, docs areas/pin, manifest hash — enforced by a server test (every required tool exists and throws the contract's code when its flag is unset), an engine lint (every `snow_*` / `mcp__*` token and every rename-map key checked), and tooling that reads names from the file instead of hard-coding them.

---

## 9. Claude Code mechanisms verified today (the substrate)

| Mechanism | What the docs / CLI say | Source |
|---|---|---|
| Project-scope `.mcp.json` | Committed at the repo root; interactive sessions prompt once per server; `claude mcp reset-project-choices` resets; `claude -p` loads without asking | `docs:mcp` "Project scope" |
| Env expansion | `${VAR}` and `${VAR:-default}` in `command`, `args`, `env`, `url`, `headers`; `CLAUDE_PROJECT_DIR` is set **in the spawned server's environment** and must be referenced as `${CLAUDE_PROJECT_DIR:-.}` in project/local/user entries | `docs:mcp` "Option 3: Add a local stdio server"; Design B probe on 2.1.258: unset `${VAR}` without a default is passed literally |
| Approval pre-seeding | `enabledMcpjsonServers` (array of server names) is what Claude Code itself writes to `.claude/settings.local.json` when you approve a server; `disabledMcpjsonServers` rejects (takes precedence); in an **untrusted** folder the shared project file is ignored, user/managed/`--settings` honoured | `docs:settings-reference` `enabledMcpjsonServers`, `disabledMcpjsonServers`, `enableAllProjectMcpServers` |
| Status text | `⏸ Pending approval`, `✘ Rejected (see disabledMcpjsonServers in settings)`, `⊘ Disabled for this project` | `docs:mcp` "claude mcp list" statuses |
| `claude mcp add` | `[options] <name> <commandOrUrl> [args...]`, `-e/--env`, `-s/--scope local\|user\|project` (default local), `-t/--transport`, `--` separator; `add-json`; `get`; `list`; `reset-project-choices` | `cli: claude mcp add --help`, `claude mcp --help` |
| Tool naming | `mcp__<server>__<tool>`; plugin-bundled: `mcp__plugin_<plugin>_<server>__<tool>`; permission rules accept globs only after the literal `mcp__<server>__` prefix | `docs:mcp` "Plugin MCP tool names"; `docs:permissions` |
| Limits | Warning at 10,000 output tokens, cap 25,000 (`MAX_MCP_OUTPUT_TOKENS`); `MCP_TIMEOUT` = startup timeout; per-server `timeout` (ms) in `.mcp.json` = per-call wall clock | `docs:mcp` tips |
| `list_changed` | Supported; Claude Code refreshes tools/prompts/resources without reconnect; keeps previous list if a refresh fails (≥ 2.1.214) | `docs:mcp` "Dynamic tool updates" |
| Settings scopes | User `~/.claude/settings.json`; shared project `.claude/settings.json` (commit it); project-local `.claude/settings.local.json` (gitignored when Claude creates it); managed | `docs:settings` "Settings files and who they affect" |
| `env` in settings | Applied to every session and subprocesses; timeout/limit-class variables (safe class) apply **at startup from every settings file**; project/local `env` otherwise applies after trust | `docs:settings-reference` `env` "When Claude Code applies env values" |
| Hooks | `SessionStart` matchers `startup\|resume\|clear\|compact\|fork`; plain stdout or `hookSpecificOutput.additionalContext` adds context; `reloadSkills`; exec form (`command` + `args`) substitutes `${CLAUDE_PROJECT_DIR}` in each `args` element; on Windows exec form must run a real executable — use `node <script>`, never `.cmd` shims; `Setup` fires only with `--init-only`/`--maintenance`, so first-use checks belong in SessionStart | `docs:hooks` |
| `disableAllHooks` | In a non-managed file disables user/project/local/plugin hooks | `docs:settings-reference` |
| Skills | `.claude/skills/<name>/SKILL.md` (project), `~/.claude/skills/` (personal), plugin `skills/`; description shown in listing, truncated at 1,536 chars; `allowed-tools` grants for the invoking turn and is **not** gated by workspace trust; symlinked skill dirs are followed; `.claude-plugin/plugin.json` inside a skill folder loads it as a plugin | `docs:skills` |
| Sub-agents | `.claude/agents/`; `tools` omitted inherits every tool (incl. MCP); `model`: alias `sonnet\|opus\|haiku\|fable`, full ID, or `inherit`; `skills:` preloads skill content; agent descriptions warned above 15,000 tokens combined | `docs:sub-agents` |
| `CLAUDE.md` | `@path/to/import` expands at launch; `.claude/rules/*.md` without `paths` frontmatter load at launch with the same priority as `.claude/CLAUDE.md` (path-scoped rules load on demand). The docs' "200 lines / 25 KB" figure is the load cap for auto-memory `MEMORY.md`, not a CLAUDE.md limit — the ≤ 200-line `CLAUDE.md` target in `01` is the plan's own choice | `docs:memory` |
| Plugins (for the deferred channel) | `.claude-plugin/plugin.json`, `skills/`, `agents/`, `hooks/hooks.json`, `.mcp.json` with `${CLAUDE_PLUGIN_ROOT}`; `${CLAUDE_PLUGIN_DATA}` = `~/.claude/plugins/data/<id>/` persists across updates; `userConfig` fields with `sensitive: true` mask input and store in secure storage, substituted as `${user_config.KEY}` into MCP env; cache runs `npm ci --ignore-scripts` when `package.json` + lockfile exist; plugin agents may not declare `hooks`/`mcpServers`/`permissionMode`; `/reload-plugins` restarts plugin hooks and MCP servers | `docs:plugins-reference`; `cli: claude plugin --help` (`validate`, `tag`, `install`, `marketplace`, `details`, `init`) |

---

## 10. Glossary (retired and replacement terms)

| Term today | Meaning(s) today | Replacement in the target design |
|---|---|---|
| Tier 0 / Tier 1 / Tier 2 (engine) | design-only / claude.ai Projects / Claude Code + MCP | **Mode**: `design-only` or `live` (claude.ai surface is out of scope, D-03) |
| Tier 1/2/3/AI/ATF (server) | which flag family is enabled | **Preset**: `read-only`, `pdi-developer`, `full`, `custom` → six explicit flags |
| NowAIKit | historical name of the MCP server | `servicenow` (server key) / `@farstic/snowarch` (package; D-01 amended 2026-09-04 — the old `@farstic/snow-mcp@1.0.0` record is never touched) |
| `nowaikit` / `servicenow-mcp` registration | server keys used at different times | `servicenow` (one key, one prefix `mcp__servicenow__`) |
| "Task tool" | harness tool for dispatching sub-agents | "dispatch the sub-agent" (harness-neutral wording) |
| Field notes | mixed platform facts + MCP-tool bugs + engine tooling | `docs/PLATFORM-NOTES.md` (platform facts only); server CHANGELOG + regression tests (server behaviours) |
