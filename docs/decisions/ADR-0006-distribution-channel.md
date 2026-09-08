# ADR-0006 — Distribution channel: monorepo and bootstrap for the first release, plugin channel spiked in parallel

> **What this is:** an Architecture Decision Record for the *product*, not for a client engagement. It uses the engine's ADR template (`reference/templates/adr-template.md`) with the engagement fields adapted for an engine-level decision, exactly as ARC-00-S03's design notes prescribe. ADRs are immutable once Accepted: a later change is a **new** ADR that supersedes this one, never an edit.

---

| Field | Value |
|---|---|
| **ADR ID** | ADR-0006 |
| **Title** | Distribution channel: monorepo and bootstrap for the first release, plugin channel spiked in parallel |
| **Status** | **Accepted (2026-09-08) — "monorepo path confirmed."** ARC-00-S12's spikes settled the D-06 hedge against the plugin channel for the first release; the evidence is in `03` §F and summarised below. Not superseded. |
| **Date** | 2026-09-06 (recorded) · decision taken 2026-09-04 · **accepted 2026-09-08** |
| **Decision owner** | Cvetomir Grigorov (owner) — initials `PENDING OWNER`, decision taken 2026-09-04 |
| **Engagement** | AI ServiceNow Architect — product |
| **Release family** | Australia (docs corpus) |
| **§1.1 relevance** | None |
| **Related** | Entry gate for ARC-06-S01 · spikes S-14a…S-14g and S-19 (ARC-00-S12) · `03` §B · roadmap item 1 · entry gate for **ARC-06-S01** satisfied 2026-09-08 |

## Context

No channel gives literally zero interruptions. The chosen design guarantees no hand-edited JSON, no build step, no path discovery, one resumable command, and design-only mode in a single run with no Node — but it still contains four bounded interruptions. The plugin/marketplace channel would remove the most awkward of them (credentials typed in the user's own terminal) by using Claude Code's masked `userConfig` dialog, but it rests on eleven platform behaviours that have never been exercised, and it attaches the server at user scope by default. The two judge totals were 129 for the plugin design against 138 for the monorepo design.

## Decision

The owner's ruling of 2026-09-04, quoted verbatim from `docs/plans/02-DECISIONS-NEEDED.md` §D-06:

> **DECIDED 2026-09-04 — accepted (1)–(4) for 1.0, WITH A HEDGE.** The plugin-channel spike set S-14 is pulled forward into ARC-00 and must complete **before ARC-06 starts** (not after 1.0). If S-14 proves the eleven plugin behaviours within its time-box, the channel decision is re-opened before any bootstrap investment; if not, ARC-06 proceeds on the verified monorepo path with no time lost. ARC-00's exit criteria and ARC-06's entry criteria are updated accordingly. The `/setup-instance` skill must guide the user through the terminal hand-off for credentials from inside Claude (say exactly what to type, wait, resume) so interruption (3) never leaves the user without a next step.

**The four accepted interruptions.** (1) Claude Code's workspace-trust dialog on the first `claude` in a new folder — unavoidable for any cloned repository. (2) Possibly one approval click for the project MCP server if the pre-seeded `enabledMcpjsonServers` is not honoured on the very first launch; the documentation read on 2026-09-04 puts the expected total at one dialog, and spike **S-01** counts it. (3) Credentials typed in the user's **own terminal**, not inside Claude — the only channel that keeps them out of the transcript and out of `argv`. (4) On the "start Claude in an empty folder and point it at the repository" path, one restart of `claude` after the clone.

**The hedge is the operative part of this ADR:** the plugin-channel spike set S-14a–g is pulled forward into ARC-00 with a one-week time-box and must conclude **before ARC-06 starts**, so the channel decision can be re-opened before any bootstrap investment is made.

Confirmed by the owner on 2026-09-04.

## Options considered

| Option | Summary | Pros | Cons |
|---|---|---|---|
| **A (chosen)** | Monorepo + bootstrap now; plugin channel as roadmap item 1 once the spikes prove it | Ships a fully verified path first; every mechanism is documented or spiked; the smoother channel can be added later without breaking anyone | Keeps interruptions (1)–(4) |
| B | Plugin channel first | Removes interruption (3) via the masked `userConfig` dialog | Rests on eleven never-exercised behaviours (`03` §B); the repository layout becomes a marketplace with two plugins; the protocol moves into a SessionStart injection; the tool prefix becomes `mcp__plugin_<name>_servicenow__`, invalidating every generated permission rule; multi-instance still needs the file store; installation defaults to user scope |
| C (defer) | Decide after the first release | None | The bootstrap investment would already be sunk |

## §1.1 record (if a custom object was in play)

Not applicable — engine-level decision. No ServiceNow table, scoped application, state value or
other platform object is created, extended or approved by this ADR. §1.1 governs what the product
*builds on a customer instance*; this record governs how the product itself is built and shipped.

## Consequences

- The `/snowarch setup-instance` skill must guide the user through the terminal hand-off for credentials from inside Claude — say exactly what to type, wait, and resume — so interruption (3) never leaves the user without a next step.
- ARC-00's exit criteria and ARC-06's entry criteria both name the S-14 conclusion.
- If S-14 proves the eleven behaviours, the owner may re-open the channel decision; ADR-0008 would supersede this ADR and ARC-06 and ARC-07 are re-planned **before** any bootstrap work. Nothing else in ARC-00 is wasted either way — that is the point of the hedge.
- A plugin-channel move would change the tool prefix, which is a contract value fixed by ADR-0001; that coupling is the main reason the decision must close before ARC-05 generates the governance texts.

## Follow-ups

- **ARC-00-S12** runs S-14a…S-14g within the one-week time-box and records the verdicts, plus S-19 (`claude plugin validate` on a headless CI runner).
- On conclusion, S12 either edits this ADR's `Status` row to **Accepted** with the sentence "monorepo path confirmed", or writes **ADR-0008** superseding it with "channel decision re-opened". No other field of this ADR may change.
- The verdict must exist **before ARC-06-S01 starts** — it is an entry gate, recorded in ARC-00's gate sign-off block by ARC-00-S14.

---

*ADR — AI ServiceNow Architect. One decision per file; never edit a decision's history — supersede it with a new ADR. Produced by ARC-00-S03 from the owner's rulings of 2026-09-04 recorded in `docs/plans/02-DECISIONS-NEEDED.md`.*


## Acceptance — 2026-09-08

The hedge in D-06 was: take the monorepo now, spike the plugin channel in parallel, and let
the spikes decide whether the plugin channel is ready. ARC-00-S12 ran them, and they decided.

Four of the seven came back as silent failures rather than refusals — which is the pattern that
matters, because a channel that refuses can be worked around and a channel that lies cannot:

- **S-14a** — `sensitive: true` keeps a value out of a file **on macOS only**; Claude Code's secure
  storage is the keychain, and elsewhere the value lands in plaintext. Non-sensitive options go to a
  user-scoped `0644`/`664` file either way. A credential channel whose protection depends on the
  operating system is not a credential channel.
- **S-14b** — a plugin-bundled MCP server is **invisible to `claude mcp get` / `list`** (exit 1, "no
  such server") while `plugin list --json` prints the whole entry. The doctor and every
  troubleshooting instruction would have to know which of two tools can see the server.
- **S-14c** — an unset option and a blank one are **one state**: `--config KEY=` is rejected, so the
  wizard cannot distinguish "not answered" from "answered empty".
- **S-14e** — a scaffolded `.claude/settings.json` registers the marketplace **user**-scoped and
  enables the plugin **project**-scoped, so a teammate's checkout installs nothing and says nothing.
- **S-14g** — the plugin cache's `npm ci` is capped at 60 seconds and, on a throttled network,
  **truncates the install while reporting success**.

**S-14f and S-19 were confirmed** — two plugins tag and validate cleanly at one commit, and
`claude plugin validate` runs headless on CI with no login, which is why the plugin-validate job
exists today. The channel is viable for *validation*; it is not yet viable for *distribution*.

So: monorepo and bootstrap for the first release, as decided. The plugin channel stays spiked rather
than closed — spike **S-14** answered "not yet", not "never", and ARC-05's contract work has already
made the move cheap: the tool prefix is one `engine.config.json` line and a regeneration
(`docs/ARCHITECTURE.md`, "The contract: who generates, who pins, what fails").
