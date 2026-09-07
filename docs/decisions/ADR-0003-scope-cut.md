# ADR-0003 — Scope cut: the nine surfaces that do not enter the unified product

> **What this is:** an Architecture Decision Record for the *product*, not for a client engagement. It uses the engine's ADR template (`reference/templates/adr-template.md`) with the engagement fields adapted for an engine-level decision, exactly as ARC-00-S03's design notes prescribe. ADRs are immutable once Accepted: a later change is a **new** ADR that supersedes this one, never an edit.

---

| Field | Value |
|---|---|
| **ADR ID** | ADR-0003 |
| **Title** | Scope cut: the nine surfaces that do not enter the unified product |
| **Status** | Accepted |
| **Date** | 2026-09-06 (recorded) · decision taken 2026-09-04 |
| **Decision owner** | Cvetomir Grigorov (owner) — initials `PENDING OWNER`, decision taken 2026-09-04 |
| **Engagement** | AI ServiceNow Architect — product |
| **Release family** | Australia (docs corpus) |
| **§1.1 relevance** | None |
| **Related** | Consumed by ARC-01-S02, ARC-01-S03 (leaf-level cut), ARC-04 (import-entangled items) · cut ledger lives in `docs/ARCHITECTURE.md` (ARC-01-S12) · risk `03` R-12 |

## Context

The server carries surfaces unrelated to Claude Code onboarding — an Electron desktop app, config writers for eight other MCP clients, a BYOK direct mode, PDF/PPTX report generation (~20 MB of the 72 MB runtime footprint), an A2A endpoint, HTTP/SSE transports with a dashboard and Dockerfile, and 26 server prompt capabilities. Two of them are governance hazards rather than merely surplus: the server prompts bypass the §1.1 / §2.1 / §2.2 gates entirely, and the context-mode hooks break Bash, Read and Grep when the package is absent. Every surface kept is a dependency, a second configuration store, or a maintenance obligation.

## Decision

The owner's ruling of 2026-09-04, quoted verbatim from `docs/plans/02-DECISIONS-NEEDED.md` §D-03:

> **DECIDED 2026-09-04 — cut all nine.** Nothing is deleted from the source repositories; the items are simply not carried into the unified repository. Source locations for the record — in `snow-mcp`: (1) `desktop/`; (2) `clients/`, `src/cli/writers/`, `src/cli/detect-clients.ts`; (3) `src/direct/`; (4) `src/reports/`; (5) `src/a2a/`; (6) `src/transport/http-server.ts`, `src/dashboard/`, `Dockerfile`; (7) `src/prompts/`, `.github/agents/*.agent.md`. In the engine: (8) `docs/ADVANCED-WEB-SETUP.md` + Tier 1 sections of README / client-onboarding; (9) the hooks block of `.claude/settings.json` (the author's global `~/.claude/CLAUDE.md` stays on their machine, outside the product). What survives from the server: `src/server.ts`, `src/servicenow/`, `src/tools/`, `src/cli/` (minus writers), `src/utils/`, `src/resources/`, `src/sdk/`, `src/api/`. Note for ARC-04: item (2) removes the *installers* for other MCP clients, not the server's compatibility with them — it remains a standard stdio MCP server. ARC-01/ARC-04 own the cut.

**What survives from the server:** `src/server.ts`, `src/servicenow/`, `src/tools/`, `src/cli/` (minus the writers), `src/utils/`, `src/resources/`, `src/sdk/`, `src/api/` — the stdio server, the CLI (`instance`, `doctor`, `contract`, `start`) and the 394 tools.

**The nine cuts, with their source paths.** In `snow-mcp`: (1) `desktop/`; (2) `clients/`, `src/cli/writers/`, `src/cli/detect-clients.ts`; (3) `src/direct/`; (4) `src/reports/`; (5) `src/a2a/`; (6) `src/transport/http-server.ts`, `src/dashboard/`, `Dockerfile`; (7) `src/prompts/`, `.github/agents/*.agent.md`. In the engine: (8) `docs/ADVANCED-WEB-SETUP.md` and the claude.ai-surface sections of `README.md` / `client-onboarding.md`; (9) the hooks block of `.claude/settings.json`.

**Nothing is deleted from the source repositories** — the items are simply not carried into the unified repository, and both histories preserve them.

Confirmed by the owner on 2026-09-04.

## Options considered

| Option | Summary | Pros | Cons |
|---|---|---|---|
| **A (chosen)** | Cut all nine | Removes ~20 MB of runtime footprint, two governance hazards and a second and third configuration store; one product, one story | Anyone relying on a cut surface must use the archived repository |
| B | Keep HTTP/SSE and the Dockerfile | Server reachable over the network | ARC-04 gains hardening stories (mandatory API key, CORS off by default, instance-less boot) and the Dockerfile is rewritten: +1 sprint |
| C | Keep the desktop app | A GUI exists | It becomes a third configuration store again; either re-pointed at the `.local/instances.json` schema (≈2 sprints, per-OS signing unresolved) or unsupported |
| D | Keep the 26 server prompts | Familiar entry points | They must be rewritten to current tool names (212 retired references) and put behind the same §1.1 / §2.1 gates, or they remain an ungoverned parallel roster |

## §1.1 record (if a custom object was in play)

Not applicable — engine-level decision. No ServiceNow table, scoped application, state value or
other platform object is created, extended or approved by this ADR. §1.1 governs what the product
*builds on a customer instance*; this record governs how the product itself is built and shipped.

## Consequences

- **Item (2) removes the installers for other MCP clients, not the compatibility.** The product remains a standard stdio MCP server; what goes is the code that wrote configuration files for Claude Desktop, Cursor, VS Code, Windsurf, Continue, Codex, Gemini and Lovable.
- ARC-01-S03 performs the **leaf-level** cut in one `git rm -r` commit; items entangled inside `src/` are recorded in the `docs/ARCHITECTURE.md` cut ledger with ARC-04 as owner.
- Today's production dependency tree is roughly 72 MB / 155 packages with no install scripts (`00` §2; spike **S-15** re-measures this **pre-cut** tree on all three operating systems — ARC-00-S08's scope says so explicitly). Cut item (4) removes `pdfmake` and `pptxgenjs`, about **20 MB of that 72 MB**, when ARC-04-S01 prunes the server's dependencies — leaving roughly 52 MB. ARC-01's ≤ 80 MB footprint gate is sized against the 72 MB figure and holds both before and after the prune. No plan document states a post-cut package count, so none is invented here.
- Cutting item (9) means the product ships **no** hooks block it did not author; the author's personal global instructions stay on their machine, outside the product.
- **Retired vocabulary note.** The owner's ruling quoted above under *Decision* says "Tier 1 sections of README / client-onboarding" — that is the surface removed by item (8), named in the vocabulary of the time. The quote is reproduced verbatim because ARC-00-S03's acceptance criterion 2 requires it, and this note is the "retired vocabulary" carve-out that its acceptance criterion 6 allows. **"Tier N" is retired and is used nowhere else in these ADRs.** The vocabulary in force is Mode `design-only` | `live` and Preset `read-only` | `pdi-developer` | `full` | `custom`.

## Follow-ups

- ARC-01-S12 writes the cut ledger into `docs/ARCHITECTURE.md`, naming the owner ARC for each entangled item.
- ARC-10 links the archived source repositories so the cut surfaces stay findable (`03` R-08, R-12).

---

*ADR — AI ServiceNow Architect. One decision per file; never edit a decision's history — supersede it with a new ADR. Produced by ARC-00-S03 from the owner's rulings of 2026-09-04 recorded in `docs/plans/02-DECISIONS-NEEDED.md`.*
