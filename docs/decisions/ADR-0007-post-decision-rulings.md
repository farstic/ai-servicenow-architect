# ADR-0007 — Post-decision rulings: Q-A, Q-B, R-1, R-2, R-3 and R-4

> **What this is:** an Architecture Decision Record for the *product*, not for a client engagement. It uses the engine's ADR template (`reference/templates/adr-template.md`) with the engagement fields adapted for an engine-level decision, exactly as ARC-00-S03's design notes prescribe. ADRs are immutable once Accepted: a later change is a **new** ADR that supersedes this one, never an edit.

---

| Field | Value |
|---|---|
| **ADR ID** | ADR-0007 |
| **Title** | Post-decision rulings: Q-A, Q-B, R-1, R-2, R-3 and R-4 |
| **Status** | Accepted |
| **Date** | 2026-09-06 (recorded) · decision taken 2026-09-04 |
| **Decision owner** | Cvetomir Grigorov (owner) — initials `PENDING OWNER`, decision taken 2026-09-04 |
| **Engagement** | AI ServiceNow Architect — product |
| **Release family** | Australia (docs corpus) |
| **§1.1 relevance** | None |
| **Related** | Named deliverable of ARC-00-S03 — the ARC-00 README lists all seven ADRs by name and requires this one Accepted; it enumerates Q-A, Q-B, R-1, R-2, R-3, and R-4 was added to `02` on 2026-09-06, after that text was written · consumed by ARC-01, ARC-02, ARC-04, ARC-06, ARC-07, ARC-08, ARC-09 · values mirrored in `spikes/engine.config.seed.json` |

## Context

Six rulings were taken after D-01…D-06 closed: two residual owner-only questions distilled from the 56 reader questions (Q-A, Q-B) and four rulings on gaps the completeness critic and the plan review raised (R-1, R-2, R-3, and R-4 added on 2026-09-06). None of them has an ADR in the ARC-00 README's list of six. The ARC-00 README names this file among its seven ADR deliverables and requires it Accepted ("Seven ADRs exist; ADR-0001…0005 and 0007 with status Accepted"); ARC-00-S03's own Context says "README deliverable: six ADRs", which the README contradicts — flagged to the architect. They are recorded here as one file.

**Why one file for six decisions.** The one-decision-per-file rule is bent deliberately, and ARC-00-S03's design notes say so: these are the *post-decision rulings* of a single owner walkthrough, each too small for its own record but each binding on later stories. If any one of them is ever revisited, the superseding ADR addresses that ruling by its identifier (for example "ADR-0009 supersedes ADR-0007 §R-2") rather than replacing this file wholesale.

## Decision

Six rulings, each quoted verbatim from `docs/plans/02-DECISIONS-NEEDED.md`.

### Q-A — Target persona for the first release

**Question as put:** Target persona for 1.0: individual practitioner on their own PDI, team lead on a shared instance, or both?

**Ruling, quoted verbatim from the `02` "Post-decision rulings" table:**

> **Individual practitioner for 1.0.** A shared/team instance (multi-user store, per-user presets and audit) is a roadmap ARC of its own; the per-checkout store from D-04 is already the right substrate for it.

**Owner / consuming ARCs (the table's own last column):** ARC-07 scope, roadmap §17

### Q-B — Native Windows, or "Git Bash required"

**Question as put:** Windows: native first-class, or "Git Bash / WSL required"?

**Ruling, quoted verbatim from the `02` "Post-decision rulings" table:**

> **Native Windows first-class** — conditional on ARC-00 spikes S-03 / S-04 / S-08 passing inside their time-box; a failed spike downgrades to "Git Bash required" via the fallback already recorded in `03` §A and `01` §13, with no re-planning.

**Owner / consuming ARCs (the table's own last column):** ARC-00, ARC-06, ARC-09

### R-1 — First release version

**Question as put:** First release version: `@farstic/snow-mcp@1.0.0` already exists on npm.

**Ruling, quoted verbatim from the `02` "Post-decision rulings" table:**

> **First unified release is `2.0.0`** — the server is a new major (scope cut, moved gates, new store) — **published only under the new `@farstic/snowarch` record** (see D-01(d) amendment); the root/engine version and the package version stay equal per `01` principle 5.

**Owner / consuming ARCs (the table's own last column):** ARC-09

### R-2 — The project skill name

**Question as put:** Planned project skill `status` collides with Claude Code's built-in `/status`.

**Ruling, quoted verbatim from the `02` "Post-decision rulings" table:**

> **Rename to `/snowarch`** with sub-commands `status` · `setup-instance` · `doctor`; CLI and skill share one name. Every reference to `/status` and `/setup-instance` in `01`, ARC-07 and ARC-08 is to be read as `/snowarch status` and `/snowarch setup-instance`.

**Owner / consuming ARCs (the table's own last column):** ARC-02, ARC-07, ARC-08

### R-3 — Corporate proxies and TLS-intercepting gateways

**Question as put:** No story covers corporate proxies / TLS-intercepting gateways (Node `fetch`/undici ignores `HTTPS_PROXY`; custom CAs need `NODE_EXTRA_CA_CERTS`).

**Ruling, quoted verbatim from the `02` "Post-decision rulings" table:**

> **Add stories:** ARC-04 — proxy agent honouring `HTTPS_PROXY` / `NO_PROXY` and a documented `NODE_EXTRA_CA_CERTS` path; ARC-07 — wizard reachability probe distinguishes DNS / TLS-CA / proxy failures and prints the exact remedy; ARC-08 — doctor check for both.

**Owner / consuming ARCs (the table's own last column):** ARC-04, ARC-07, ARC-08

### R-4 — Repository visibility (dated 2026-09-06 in `02`)

**Question as put:** Repository visibility: public or private?

**Ruling, quoted verbatim from the `02` "Post-decision rulings" table:**

> **PUBLIC from creation** — the owner created `farstic/ai-servicenow-architect` as a public, empty repository on 2026-09-06 (verified with `gh repo view`). Rationale accepted: `git clone` needs no auth for the end user; unlimited Actions minutes for the 3-OS × 3-Node CI matrix; branch protection available on the free plan; public scoped npm package is free; both source repositories are already public and the design guarantees no secrets in the tree. **Obligations that replace the "private until ARC-01-S02" idea:** (1) ARC-01-S02 must run a full-history secret scan (`gitleaks detect --source <import> --no-git` on the import trees *and* on the rewritten history) and pass **before** any imported history is pushed; (2) the RobertBH17 relicensing consent (D-02, ARC-00-S02) must be resolved **before** ARC-01-S02 pushes those commits — until then the import stays local; (3) every push of the plan documents runs the PII/instance-host/sys_id grep that was executed 2026-09-06 (result: clean — only fixtures such as `hunter2hunter2`, `acme.service-now.com`, `*.corp.example`).

**Owner / consuming ARCs (the table's own last column):** ARC-00-S02, ARC-01-S01/S02, ARC-01-S09

Confirmed by the owner on 2026-09-04 (R-4 on 2026-09-06).

## Options considered

Each ruling's alternatives are recorded in `02` beside it; the two that carry a live fallback are:

| Ruling | Chosen | Pre-recorded fallback if the evidence fails |
|---|---|---|
| Q-B | Native Windows first-class | "Git Bash required" — already written into `03` §A and `01` §13, applied by ARC-00-S14 with **no re-planning**, if spike S-03, S-04 or S-08 fails |
| R-1 | First release `2.0.0`, root version == package version | Decouple the npm package version from the root version (rejected: it breaks `01` principle 5) |

## §1.1 record (if a custom object was in play)

Not applicable — engine-level decision. No ServiceNow table, scoped application, state value or
other platform object is created, extended or approved by this ADR. §1.1 governs what the product
*builds on a customer instance*; this record governs how the product itself is built and shipped.

## Consequences

- **Q-A** — the first release targets an individual practitioner on their own developer instance. A shared or team instance (multi-user store, per-user presets and audit) is a roadmap ARC of its own; the per-checkout store of ADR-0004 is already the right substrate for it.
- **Q-B** — native Windows is first-class **conditionally**. Spikes S-03, S-04 and S-08 must pass inside their time-box; they are run by ARC-00-S06 and ARC-00-S07 and are blocked today on owner input #2 (a Windows machine without Git Bash on PATH). A failure downgrades the promise via the pre-recorded fallback.
- **R-1** — the first unified release is `2.0.0`: a new major for the server (scope cut, moved gates, new store) and above the engine's 2.8.0 line as a product. It is published **only** under `@farstic/snowarch`; the root version, the package version and the `CLAUDE.md` marker stay equal (`01` principle 5, tested by ARC-01-S06).
- **R-2** — the project skill is `/snowarch` with sub-commands `status`, `setup-instance` and `doctor`, so that CLI and skill share one name and nothing collides with Claude Code's own built-in commands. Every reference in `01`, ARC-07 and ARC-08 to the older spellings is read as `/snowarch status` and `/snowarch setup-instance`; ARC-02-S02's skills lint carries a built-in-name collision check. The plain-text "Status" trigger stays in `CLAUDE.md`.
- **R-3** — proxy and TLS-CA support gets implementation stories rather than a spike: ARC-04 (a proxy agent honouring `HTTPS_PROXY` / `NO_PROXY` and a documented `NODE_EXTRA_CA_CERTS` path), ARC-07 (the reachability probe distinguishes DNS, TLS-CA and proxy failures and prints the exact remedy) and ARC-08 (a doctor check for both). The one *platform* question — whether a spawned project stdio server inherits those variables at all — is spike **S-20**, run by ARC-00-S06.
- **R-4** — the repository is **public from creation**, which replaces the "private until ARC-01-S02" idea with three obligations: a full-history secret scan before any imported history is pushed; the second-contributor relicensing resolved before ARC-01-S02 pushes those commits; and a PII / instance-host / sys_id grep on every push of the plan documents.
- **Retired vocabulary, was → is.** `/status` → `/snowarch status`; `/setup-instance` → `/snowarch setup-instance`; "Tier N" → Mode `design-only` | `live` and Preset `read-only` | `pdi-developer` | `full` | `custom`. The retired spellings appear in these ADRs only in this line and inside the verbatim `02` quotations that acceptance criterion 2 requires; nothing uses them as a live form.

## Follow-ups

- Q-B is unresolved in practice until owner input #2 (the Windows machine) arrives; ARC-00-S06, ARC-00-S07 and ARC-00-S13 are blocked on it and say so.
- R-1's version equality is enforced by `tests/version-consistency.test.mjs` (ARC-01-S06).
- R-4's obligation 2 is the same `PENDING OWNER` item as ADR-0002's follow-up.

---

*ADR — AI ServiceNow Architect. One decision per file; never edit a decision's history — supersede it with a new ADR. Produced by ARC-00-S03 from the owner's rulings of 2026-09-04 recorded in `docs/plans/02-DECISIONS-NEEDED.md`.*
