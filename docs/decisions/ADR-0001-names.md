# ADR-0001 — Product, repository, CLI and server names

> **What this is:** an Architecture Decision Record for the *product*, not for a client engagement. It uses the engine's ADR template (`reference/templates/adr-template.md`) with the engagement fields adapted for an engine-level decision, exactly as ARC-00-S03's design notes prescribe. ADRs are immutable once Accepted: a later change is a **new** ADR that supersedes this one, never an edit.

---

| Field | Value |
|---|---|
| **ADR ID** | ADR-0001 |
| **Title** | Product, repository, CLI and server names |
| **Status** | Accepted |
| **Date** | 2026-09-06 (recorded) · decision taken 2026-09-04 |
| **Decision owner** | Cvetomir Grigorov (owner) — initials `PENDING OWNER`, decision taken 2026-09-04 |
| **Engagement** | AI ServiceNow Architect — product |
| **Release family** | Australia (docs corpus) |
| **§1.1 relevance** | None |
| **Related** | Supersedes nothing · consumed by ARC-01-S04 (`engine.config.json`), ARC-04, ARC-05, ARC-09 · values mirrored in `spikes/engine.config.seed.json` · floor confirmation: spike S-11 (ARC-00-S11) |

## Context

The three existing identities disagree: the working directory is `AI-Architect-Claude`, its GitHub remote is `claude-servicenow-live`, and the tooling was branded NowAIKit (`00` P-15). Four names have to be fixed before any code is written, because each is read by machinery rather than by people: the repository name, the CLI/product short name, the **MCP server key** — which becomes the literal tool prefix that the write gate, the permission rules and the hook matchers are generated from — and the npm package name. Fixing them late means regenerating the governance texts, the permission blocks, the doctor and the lint.

## Decision

The owner's ruling of 2026-09-04, quoted verbatim from `docs/plans/02-DECISIONS-NEEDED.md` §D-01:

> **DECIDED 2026-09-04 — (a)(b)(c) confirmed as recommended; (d) AMENDED by the owner.** (a) `farstic/ai-servicenow-architect` · (b) `snowarch` · (c) MCP key `servicenow` → tool prefix `mcp__servicenow__` · (d) **`@farstic/snowarch` — a brand-new npm record** (availability verified 2026-09-04: `npm view @farstic/snowarch` → not published). **Owner constraint:** the existing `@farstic/snow-mcp@1.0.0` on npmjs is **never touched** — no new version, no deprecation, no unpublish, no README edit; anything the unified product publishes goes under a totally new package. Consequences: the server+CLI package directory is `packages/snowarch` (not `packages/snow-mcp`), its `bin` is `snowarch`, and `npx @farstic/snowarch` yields the CLI and the stdio server — one name across repo-package/CLI/npm. `engine.config.json` records all four values; ARC-01/ARC-04/ARC-05/ARC-09 use them. **Confirmed by the owner 2026-09-04: `@farstic/snowarch`.**

**The values this ADR fixes**, in the form ARC-01 writes into `engine.config.json`:

| Value | Setting |
|---|---|
| GitHub repository | `farstic/ai-servicenow-architect` |
| Product / CLI short name | `snowarch` |
| MCP server key | `servicenow` |
| Tool prefix (derived) | `mcp__servicenow__` — e.g. `mcp__servicenow__snow_core_records_query` |
| npm package | `@farstic/snowarch` |
| Package directory | `packages/snowarch` |
| First release | `2.0.0` (see ADR-0007, R-1) |
| Optional global config dir | `~/.config/snowarch/` (`product` names it; `cli` names the command — ARC-01-S04 keeps them as separate keys so renaming one cannot silently rename the other) |

**The floors and corpus values this ADR also fixes**, because `engine.config.json` holds them beside the
names (`01` §3) and the ARC-00 README asks for "names and floors" together:

| Value | Setting | Where it comes from |
|---|---|---|
| `floors.node` | `20.0.0` | `01` principle 6, "One runtime for shipped tooling: Node ≥ 20"; the predecessor server already declares `engines.node >=20.0.0` |
| `floors.git` | `2.25.0` | cone `sparse-checkout`, introduced in the git 2.25.0 release notes (`00` §"git" row; `01` prerequisites) |
| `floors.claudeCode` | **`2.1.214`** | **Decided; S-11 confirmation pending.** `01` §4 and §12 record "Floors: Claude Code ≥ 2.1.214, git ≥ 2.25, Node ≥ 20" in the Decided register (DR-11), and the ARC-00 README builds its test machines "each with Claude Code at the floor 2.1.214". Spike **S-11** is the *confirmation*, not the origin: its assumption is "the floor 2.1.214 is sufficient for every mechanism used", with the fallback "raise the floor". A FAILED S-11 changes the value by **superseding this ADR**, never by blanking the field. Architect ruling, 2026-09-06. |
| `docs.family` | `australia` | the release family the corpus and every citation are pinned to |
| `docs.pin` | `ba513f2c62d3698ef5bfdd8044110226b8419689` | the full SHA of the ServiceNowDocs checkout in use (the "July refresh"), verified with `git -C <engine>/ServiceNowDocs rev-parse HEAD`; ARC-01-S04's schema constrains it to `^[0-9a-f]{40}$`. Known pin drift: the engine superproject's gitlink records `0ba98cdaf706821d72ff79e92b18adc057e60e29` while the checkout is this one (`00` §3.10). ARC-03 owns reconciling it; ARC-01-S04 records the pin as data. |

**Owner constraint, restated because it is easy to violate by helpfulness:** the pre-existing npm record `@farstic/snow-mcp@1.0.0` is **never touched** — no new version, no deprecation, no unpublish, no README edit. Everything the unified product publishes goes under the new `@farstic/snowarch` record.

Confirmed by the owner on 2026-09-04.

## Options considered

| Option | Summary | Pros | Cons |
|---|---|---|---|
| **A (chosen)** | `ai-servicenow-architect` / `snowarch` / `servicenow` / `@farstic/snowarch` | Matches the product the user already calls "AI ServiceNow Architect"; ends the three-way name mismatch (`00` P-15); `snowarch` is short, lowercase and collides with nothing on npm or in the bundled skills; tools read `mcp__servicenow__snow_…`, which two candidate designs and two judges had already assumed | A brand-new npm record has no download history |
| B | Keep the server package name `@farstic/snow-mcp` (the `02` recommendation for (d)) | The scoped name is already owned and published | The owner's constraint is that this record is frozen; publishing a new major under it is exactly what must not happen. **Amended by the owner to option A.** |
| C | Server key `snow` or `servicenow-mcp` | `servicenow-mcp` preserves today's working-tree `CLAUDE.md` text | `snow` yields the stuttering `mcp__snow__snow_…`; `servicenow-mcp` is longer for no benefit |
| D (defer) | Decide names during ARC-01 | None | The names are inputs to the generated governance texts (ARC-05); deciding after generation means regenerating everything |

## §1.1 record (if a custom object was in play)

Not applicable — engine-level decision. No ServiceNow table, scoped application, state value or
other platform object is created, extended or approved by this ADR. §1.1 governs what the product
*builds on a customer instance*; this record governs how the product itself is built and shipped.

## Consequences

- `engine.config.json` (ARC-01-S04) is the single place all four values live; the doctor, the lint, the generators and the launchers read them and never hard-code them. `spikes/engine.config.seed.json` in this repository is the value set ARC-01 starts from.
- The tool prefix `mcp__servicenow__` is a contract value: ARC-05 generates the `permissions.allow` / `permissions.ask` blocks and the write-gate text from it. Changing the server key later invalidates every generated permission rule.
- The server key satisfies the documented constraint that it contain only letters, digits, `-` and `_`.
- The directory a user clones into does **not** have to match the repository name — the design uses `${CLAUDE_PROJECT_DIR}` throughout — so a renamed checkout cannot break the registration.
- `npx @farstic/snowarch` yields both the CLI and the stdio server: one name across repository package, CLI binary and npm record.
- Retired vocabulary: the retired *identities* are the repository name `claude-servicenow-live`, the brand `NowAIKit` / `nowaikit`, the old MCP server key `servicenow-mcp` (and with it the tool prefix `mcp__servicenow-mcp__`) and the package directory `packages/snow-mcp`. **ARC-01-S10 owns the mechanical rule and its own pattern list** — this ADR fixes the identities, not the regexes, and the ratchet is built from ARC-01-S10's measured patterns rather than from this bullet. Note that a bare `servicenow-mcp` cannot be the pattern: it is a substring of the frozen npm record and of legitimate historical URLs. `docs/decisions/ADR-*.md` is on ARC-01-S10's always-exempt list, so these ADRs may name the past freely.

## Follow-ups

- **`floors.claudeCode` awaits its confirmation spike.** The seed carries the decided `2.1.214`. ARC-00-S11 produces the verdict; if it *raises* the floor, that is recorded in a **new** ADR superseding this one — never an edit here, and never by blanking the field.
- ARC-01-S10 builds the legacy-name ratchet test from the retired list above.
- ARC-09-S10 publishes only under `@farstic/snowarch`; the `@farstic/snow-mcp` record stays frozen (owner input #5 supplies a token scoped to the new record only).

---

*ADR — AI ServiceNow Architect. One decision per file; never edit a decision's history — supersede it with a new ADR. Produced by ARC-00-S03 from the owner's rulings of 2026-09-04 recorded in `docs/plans/02-DECISIONS-NEEDED.md`.*
