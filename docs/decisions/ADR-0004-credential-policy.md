# ADR-0004 — Credential-at-rest policy and authentication methods for the first release

> **What this is:** an Architecture Decision Record for the *product*, not for a client engagement. It uses the engine's ADR template (`reference/templates/adr-template.md`) with the engagement fields adapted for an engine-level decision, exactly as ARC-00-S03's design notes prescribe. ADRs are immutable once Accepted: a later change is a **new** ADR that supersedes this one, never an edit.

---

| Field | Value |
|---|---|
| **ADR ID** | ADR-0004 |
| **Title** | Credential-at-rest policy and authentication methods for the first release |
| **Status** | Accepted |
| **Date** | 2026-09-06 (recorded) · decision taken 2026-09-04 |
| **Decision owner** | Cvetomir Grigorov (owner) — initials `PENDING OWNER`, decision taken 2026-09-04 |
| **Engagement** | AI ServiceNow Architect — product |
| **Release family** | Australia (docs corpus) |
| **§1.1 relevance** | None |
| **Related** | Consumed by ARC-04 (single store), ARC-07 (wizard, `--global`, import), ARC-08 (doctor checks) · risk `03` R-04 · roadmap items 3 (keychain) and 4 (client-credentials) |

## Context

Today's registration keeps instance credentials in `~/.claude.json`, in plain text, in a file that is backed up (`.bak-*`), read by every project on the machine, and easy to leak into a transcript. The product needs a credential story that is at least as good, needs no native module, and works headless — and it must fit the engine's client-confidentiality firewall, where one engagement is one checkout. Authentication has to serve the PDI reality (basic auth, zero instance-side setup) without pretending that the OAuth password grant is modern.

## Decision

The owner's ruling of 2026-09-04, quoted verbatim from `docs/plans/02-DECISIONS-NEEDED.md` §D-04:

> **DECIDED 2026-09-04 — (a) yes: one per-checkout store `.local/instances.json` (dir 0700, file 0600, gitignored, atomic writes, never in `~/.claude.json` / argv / transcripts); OS-keychain backend stays roadmap item 3. Rationale recorded: per-checkout (not per-user) is deliberate — it aligns with the engine's client confidentiality firewall (one engagement = one checkout = one store). Added obligation for ARC-07/ARC-08: the wizard and the doctor must WARN when the checkout path lies under a known cloud-sync folder (OneDrive, Dropbox, iCloud Drive, Google Drive), because 0600 does not prevent sync. (b) Basic auth is the wizard default; OAuth password grant is kept as an "Advanced" branch labelled "OAuth (password grant, legacy)"; client-credentials grant stays roadmap item 4.

**What this fixes:** one store per checkout at `.local/instances.json`, directory `0700`, file `0600`, gitignored, written atomically, and never copied into `~/.claude.json`, into `argv`, or into a transcript. The server resolves `SNOW_STORE` first, then `<CLAUDE_PROJECT_DIR ?? cwd>/.local/instances.json`, then the optional global `~/.config/snowarch/instances.json`, and otherwise starts **unconfigured**. Basic authentication is the wizard default; the OAuth password grant is offered as "OAuth (password grant, legacy)".

Confirmed by the owner on 2026-09-04.

## Options considered

| Option | Summary | Pros | Cons |
|---|---|---|---|
| **A (chosen)** | One 0600 JSON file per checkout, keychain later | Same protection class as today's `~/.claude.json` but with exactly one copy, correct file modes and no argv or backup exposure — a strict improvement; no native dependency; works headless; matches the one-engagement-one-checkout firewall | Plain text at rest; a client security team may object (`03` R-04) |
| B | OS keychain mandatory from day one | Strongest at rest | Adds a native dependency with prebuilt binaries per OS and Node ABI, macOS Keychain prompts for `node`, and a fallback file is still needed for headless CI: +1 sprint and a Windows/Linux credential-store test matrix |
| C | Per-user store rather than per-checkout | One place for everything | Breaks the confidentiality firewall — two engagements would share one store |
| D | Basic auth only | ~300 lines less wizard, no OAuth probe in the doctor | Existing OAuth users of the predecessor lose the mode until client-credentials ships |

## §1.1 record (if a custom object was in play)

Not applicable — engine-level decision. No ServiceNow table, scoped application, state value or
other platform object is created, extended or approved by this ADR. §1.1 governs what the product
*builds on a customer instance*; this record governs how the product itself is built and shipped.

## Consequences

- **Obligation on ARC-07 and ARC-08:** the wizard and the doctor must **WARN** when the checkout path lies under a known cloud-sync folder (OneDrive, Dropbox, iCloud Drive, Google Drive) — `0600` does not prevent synchronisation.
- ARC-07 offers basic authentication first and labels the OAuth branch honestly: it still requires a user password plus a client id and secret, and ServiceNow's own documentation classifies it as legacy with a hardening switch that disables it (`00` P-38).
- ARC-01-S07's never-commit test enforces that per-checkout state can never be committed; `.local/` is gitignored from the first commit.
- ARC-08 detects leftover `servicenow-mcp` / `nowaikit` entries with plaintext secrets in `~/.claude.json` and its `.bak-*` files and prints the exact `claude mcp remove` commands (`03` R-07).
- Roadmap, explicitly not in the first release: item 3 the OS-keychain backend, item 4 the OAuth client-credentials grant (no user password, but new server code and instance admin work).

## Follow-ups

- ARC-07 implements the cloud-sync WARN; ARC-08 adds the matching doctor check.
- A shared or team instance (multi-user store, per-user presets and audit) is a roadmap ARC of its own — the per-checkout store is already the right substrate for it (ADR-0007, Q-A).

---

*ADR — AI ServiceNow Architect. One decision per file; never edit a decision's history — supersede it with a new ADR. Produced by ARC-00-S03 from the owner's rulings of 2026-09-04 recorded in `docs/plans/02-DECISIONS-NEEDED.md`.*
