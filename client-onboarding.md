# client-onboarding.md — New Client Onboarding Ritual

> ⚠️ **DRAFT / NOT YET IMPLEMENTED.** This ritual depends on `claude-ai-projects/` templates that are **not shipped** in the repo — `master-project-instructions.md`, `satellite-project-template.md`, `state-file-template.md`. The `cp` steps below will fail on a fresh clone. Treat this document as a placeholder until those templates are authored; do not follow it as-is for Tier 1 setup.

> **Purpose:** Reproducible procedure for spinning up a new client engagement in the ServiceNow Architecture Engine. Turns "new client signed" into a 30-minute setup (10 minutes once practiced).
>
> **Scope:** Tier 1 (Claude.ai satellite project) and Tier 2 (Claude Code local repo).
>
> **Discipline:** Follow every step. The system's confidentiality firewall and routing precision depend on a complete setup.

---

## Pre-onboarding — gather context (10 min)

Before opening any tool, collect the following from your contract, internal handbook, project initiation pack, or Notion. Missing pieces are acceptable — placeholders are honoured — but more context now means less rework later.

### Required

- **Client name** (exact, official spelling).
- **Engagement type.** Implementation / Optimisation / Managed Service / AI enablement / Migration / etc.
- **Active modules in scope.** ITSM, CSM, HRSD, ITOM, SPM, GRC, Now Assist, etc.
- **Release family** of the client's instance (default: Australia).
- **ServiceNow instance URL** (e.g., `https://<client-instance>.service-now.com`) — needed for Tier 2 MCP work.
- **Sprint / PI cadence.** If known.

### Strongly recommended

- **Key stakeholders.** Names, roles, decision authority. Used to disambiguate transcript references and assign decisions to owners.
- **Naming conventions.** Scoped app prefix, table prefix, KB taxonomy, integration naming patterns.
- **Existing scoped applications** in the instance.
- **LLM / AI infrastructure decisions.** Region, governance layer, model selection (relevant only for Now Assist–scoped engagements).

### Optional (add as discovered)

- Engagement-specific recurring patterns.
- Workstream-specific knowledge (e.g., custom integrations, agent catalogues).
- Past sprint deliverables for tone / quality calibration.

---

## Step 1 — Generate the satellite instructions

> **Note:** The `claude-ai-projects/` folder is gitignored — it is local-only and never committed to the shared repo. It is intended to hold your personal templates and client-specific instruction files. ⚠️ **These templates are not yet provided in the repo** (see the DRAFT banner at the top) — the steps below are a placeholder and will not work until they are authored.

```bash
cd ~/work/claude-servicenow-live
mkdir -p claude-ai-projects
# NOT YET AVAILABLE — claude-ai-projects/satellite-project-template.md does not exist in the repo yet (see DRAFT banner). Create the instructions file manually for now.
```

`{{client-short-name}}` = lowercase short identifier, e.g., `acme`, `globex`, `initech`.

Open the new file and fill in every `{{PLACEHOLDER}}`:
- `{{CLIENT_NAME}}` — exact official name.
- `{{ENGAGEMENT_TYPE}}` — single phrase.
- `{{MODULES}}` — comma-separated list.
- `{{SCOPED_APPS}}` — known scoped app prefixes; if unknown, write "to be confirmed" and create OD-{{XX}}-01 for it later.
- `{{STAKEHOLDERS}}` — formatted matrix; include name, role, and decision authority per person.
- `{{NAMING_CONVENTIONS}}` — anything the client is strict about.
- `{{SPRINT_CADENCE}}` — if known.

For complex engagements (multiple workstreams, distinct LLM decisions, recurring patterns), expand the Engagement-specific defaults section (§7) and Recurring patterns section (§8) accordingly. Your first completed satellite instructions file becomes the gold-standard exemplar for subsequent engagements.

---

## Step 2 — Generate the engagement state file

```bash
mkdir -p clients/{{client-short-name}}
# NOT YET AVAILABLE — claude-ai-projects/state-file-template.md does not exist in the repo yet (see DRAFT banner). Create the state file manually for now.
```

Open the new state file and fill in:
- `{{CLIENT_NAME}}` everywhere
- `{{XX}}` replace with the client's short code in capitals (e.g., `AC` for Acme, `GL` for Globex)
- Current PI/sprint, delivery workstreams, open decisions, blockers
- If the engagement is freshly signed and most fields are empty, fill what you can and leave the rest as placeholders. The structure matters more than completeness on day 1.

---

## Step 3 — Optional engagement-specific knowledge files

Some engagements have recurring reference content that doesn't fit in the state file or instructions. Create dedicated files in `clients/{{client-short-name}}/` for:

- An agentic workflow catalogue (if Now Assist is in scope) — see `clients/{{client-short-name}}/{{client-short-name}}-agentic-workflow-catalogue.md`.
- A current-state architecture summary if migrating from a complex existing setup.
- A glossary of client-specific terminology.

Skip if not yet needed. Add as you discover the need.

---

## Step 4 — Save local files

> **Important:** Both `claude-ai-projects/` and `clients/` are gitignored — these folders are **local-only** and are never committed to the shared repo. This is intentional: client instructions and state files contain confidential engagement data.
>
> Your local backup discipline replaces git here: back up these folders to a secure location (encrypted drive, private cloud storage, or a separate private repo) according to your firm's data retention policy.

Verify the files are in place:

```bash
ls claude-ai-projects/{{client-short-name}}-instructions.md
ls clients/{{client-short-name}}/{{client-short-name}}-engagement-state.md
```

---

## Step 5 — Create the Claude.ai satellite project

1. Open **claude.ai/projects** → **New Project**.
2. **Name** (exactly): `{{Client Name}} — Active Engagement`
3. **Description:** one sentence summarising the engagement and confidentiality boundary. Example: *"Q2 2026 — ITSM implementation. Modules: ITSM, Now Assist. Confidential — {{Client Name}} only."*
4. Open the project → **Set project instructions** (pencil icon).
5. Open the local file `claude-ai-projects/{{client-short-name}}-instructions.md`.
6. **Skip the meta header.** Copy from the line `You are the **Chief ServiceNow Architect**...` to the end. Do NOT include the `# Satellite Project Template — ...` header or the `> Paste the entire content...` instruction-to-self block. Those are for you, not for Claude.
7. Paste into the Custom Instructions field.
8. Click **Save instructions**.

---

## Step 6 — Upload knowledge files to the satellite project

1. In the satellite project → **Project knowledge** area → **Add content**.
2. Upload `{{client-short-name}}-engagement-state.md` from `clients/{{client-short-name}}/`.
3. Upload any optional engagement-specific knowledge files created in Step 3.
4. **Do NOT** upload generic ServiceNow documentation. That lives in the `ServiceNowDocs/` submodule and is fetched on demand by Tier 2 only.
5. **Do NOT** upload SKILL.md files. Those are personal skills at the account level — already available in every project.

---

## Step 7 — Smoke test (5 min)

In the satellite project, open a new chat and type exactly:

```
Status
```

Expected response shape:
1. Engagement: {{Client Name}} — {{Engagement Type}}.
2. Active modules listed correctly.
3. LLM provider noted (if applicable).
4. Currently active persona: "Chief Architect — routing".
5. State file content correctly summarised (current PI/sprint, top open decisions, top blockers).

If any of these are missing or wrong:
- Check the instructions were pasted from the right line (`You are the **Chief ServiceNow Architect**...`).
- Check the state file uploaded successfully and is in correct markdown.
- Check the file is named exactly `{{client-short-name}}-engagement-state.md` and the instructions reference that exact filename.

Re-run `Status` after fixing.

---

## Step 8 — First real-task validation (15 min)

Pick a small real task from the engagement's current backlog. Examples:
- Write one Gherkin story for a current sprint item.
- Run discovery on a new requirement that just came in.
- Sketch a technical design for a small feature.

Run the task through the satellite. Verify:
- The routing protocol fires correctly (restate, assumptions, propose specialist, wait).
- Engagement defaults are applied silently (correct workspace, correct LLM provider, correct stakeholder personas).
- Open decisions from the state file are surfaced as prompts in the assumptions table where relevant.
- The output references engagement-specific naming conventions correctly.

If anything drifts, the satellite instructions need refinement. Common fixes:
- Engagement-specific defaults (§7 in instructions) is too thin — expand.
- Recurring patterns (§8 in instructions) didn't anticipate this scenario — add the new pattern.
- The state file is missing context the assumption table needed — update.

---

## Step 9 — (Optional) Tier 2 client folder structure and MCP config

### 9a — Create the working subfolder structure

If you'll be using Claude Code (Tier 2) for this client's work — code generation, ATF batches, multi-file artefacts — create the working subfolder structure:

```bash
mkdir -p clients/{{client-short-name}}/scripts/{script-includes,business-rules,client-scripts,scheduled-jobs}
mkdir -p clients/{{client-short-name}}/scripts/atf
mkdir -p clients/{{client-short-name}}/flows
mkdir -p clients/{{client-short-name}}/designs
mkdir -p clients/{{client-short-name}}/stories
mkdir -p clients/{{client-short-name}}/runbooks
```

> **Note:** `clients/` is gitignored — these folders are local-only. No `git add` or `git commit` is needed or possible here.

This keeps generated artefacts physically separated by client, which is the Tier 2 confidentiality discipline (Tier 2 has no UI-level firewall — folder discipline enforces it).

### 9b — Configure NowAIKit MCP for the client instance

If you will use live ServiceNow instance tools (MCP) for this engagement, update your local `claude_desktop_config.json` with the client's instance credentials:

```
Location (macOS): ~/Library/Application Support/Claude/claude_desktop_config.json
```

Update the `env` block:
```json
"SERVICENOW_INSTANCE_URL": "https://{{client-instance}}.service-now.com",
"SERVICENOW_USERNAME": "{{your-username-on-client-instance}}",
"SERVICENOW_PASSWORD": "{{your-password-or-token}}"
```

Restart Claude Code after saving. Verify the connection:
```
> Check the current ServiceNow instance connection
```

> **Security:** `claude_desktop_config.json` is never committed to git. Credentials stay on your local machine only. When switching between client engagements, update this file and restart Claude Code.

---

## Step 10 — (Rare) Client-specific sub-agents

Almost no client warrants a client-specific sub-agent. The 22 generic specialists cover 95% of cases. Create a client-specific sub-agent only if:

- The client has a unique role no other client will ever have (e.g., a regulator-mandated specialist).
- You've hit the same gap three times in real work and the gap is genuinely client-specific.
- A generic specialist's output consistently misses a client-specific pattern that can't be captured in the satellite instructions.

If all three are true, create:
- `.claude/agents/{{client-short-name}}-{{role}}.md`
- Optionally `.claude/skills/{{client-short-name}}-{{role}}/SKILL.md`

These sit alongside the generic agents and skills. The router will see them based on description match.

**Recommendation:** defer this until the third occurrence of a real gap. Premature client-specific sub-agents pollute the routing.

---

## Step 11 — Document the engagement in your own records

Update your delivery tracker, Notion, or whatever you use to track active engagements. Note:
- Date the satellite was set up.
- Path to the local state file (`clients/{{client-short-name}}/{{client-short-name}}-engagement-state.md`).
- Update cadence committed (weekly / monthly / event-triggered).

---

## Maintenance ritual (post-onboarding)

### Weekly (or after any major event)

- Update the engagement state file with closed decisions, new blockers, sprint progress.
- Re-upload to the satellite project's knowledge area (delete old version, upload new).
- Back up the state file per your local retention policy (`clients/` is gitignored — git commit is not possible here).

### After a workshop, refinement, or PI planning

- Capture the transcript or notes into a new file under `clients/{{client-short-name}}/transcripts/`.
- Optionally upload to the satellite project for Discovery Specialist consumption.

### Monthly

- Run `git submodule update --remote ServiceNowDocs` to pull the latest official docs.
- Skim release notes for changes affecting the engagement's modules.

---

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| `Status` returns generic Claude response, not engagement-specific | Instructions weren't pasted, or were pasted with the meta header still attached | Re-paste from `You are the **Chief ServiceNow Architect**...` only. Save. |
| State file not being read at runtime | Filename mismatch between instructions and uploaded file | Confirm both reference the same filename exactly. |
| Routing keeps misrouting to ITSM Specialist when task is HRSD | Trigger keywords overlap | Make the task wording more explicit. If it persists, refine taxonomy.md. |
| Engagement defaults not being applied | §7 of instructions too thin | Expand engagement-specific defaults section. |
| Cross-client comparison happened despite firewall | Memory or cross-conversation drift | Explicitly say "this is the {{Client}} engagement scope" at conversation start. |

---

## Estimated time

- First time: 30 minutes (most time spent gathering pre-onboarding context).
- Practiced (3rd+ client): 10 minutes mechanical execution.
- Pre-onboarding context gathering may take much longer for complex engagements; that's not a system overhead, it's engagement reality.

---

*End of client-onboarding.md.*
