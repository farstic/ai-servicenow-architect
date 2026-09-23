# ADR-0010 — Capabilities are read before a mutating call, not discovered by making one

> **What this is:** an Architecture Decision Record for the *product*, not for a client engagement.

---

| Field | Value |
|---|---|
| **ADR ID** | ADR-0010 |
| **Title** | Capabilities are read before a mutating call, not discovered by making one |
| **Status** | **Accepted (2026-09-23)** |
| **Date** | 2026-09-23 |
| **Decision owner** | Cvetomir Grigorov (owner) — decided 2026-09-23, ratified by merging ARC-05-S12 |
| **Engagement** | AI ServiceNow Architect — product |
| **Release family** | n/a (session protocol) |
| **§1.1 relevance** | None |
| **Related** | ARC-05-S05 (the rule file) · ARC-05-S12 (this change) · ADR-0005 (permission posture) · ADR-0009 (the contract) · T-22, T-22b |

## Context

A session learns that a capability flag is off **by making the call and reading the error code**.
T-22 encodes exactly that sequence: ask the §2.1 write question, wait for **write approved**, make
the call, receive `(Code: SCRIPTING_NOT_ENABLED)`, print the preset remedy.

Every step of that is correct except the order. Three things follow from it:

**The user is asked to approve a write that cannot happen.** §2.1 exists to make approval
deliberate and specific — one approval, one action. Spending it on an action the instance was
always going to refuse devalues the question at exactly the point where its weight is the product's
only safeguard. The tester in T-22 types "write approved" for a Script Include that no flag permits.

**A mutating call is attempted against an instance whose capability state the session never
checked.** On a PDI with `SCRIPTING` off the refusal is clean and nothing happens. The shape is the
objection, not this instance's outcome: the session's knowledge of what it may do arrives as a
failure rather than as a reading.

**The information was already available, and free.** The contract carries the gate on every tool —
`snow_scr_script_include_add` declares `"gate": "scripting"` — and `gates.scripting` expands to
`["WRITE_ENABLED", "SCRIPTING_ENABLED"]`. `snow_core_capabilities_read` reports which flags are in
force on the current instance. Tool → gate → flags → state is mechanical, needs no judgement, and
is a read.

This is the programme's recurring defect class seen from the other side. Elsewhere it has been *a
check that cannot tell failure from absence*; here it is a session that **uses failure as its
instrument of discovery**. Reading state and failing to change it are not the same operation, and
only one of them is safe to perform speculatively.

## Decision

**Before a mutating MCP call, the session reads the capability state and grounds its next sentence
in what it read.**

1. Before **each** mutating call — and **before** asking the §2.1 write question — call
   `snow_core_capabilities_read`. It is a read; it needs no approval. **The answer is not carried
   past that call.**
2. Resolve the tool's `gate` **from the contract the session advertises** — the same file the
   server loads — to its flag list, and compare against what the capabilities read returned. A tool
   with **no `gate`** is a read and needs no pre-flight. A tool whose gate the contract **does not
   define** is a stop: `unknown gate \`<name>\` — contract and rule disagree`, never a
   pass-through. A gate the rule cannot resolve is a disagreement between two things that must
   agree, and the only safe reading of a disagreement about permission is the restrictive one.
3. **If a required flag is off:** stop — no mutating call, and **no write question**; there is
   nothing to approve. **The stop prints what was read**: the instance label, the preset, every
   flag's state, the tool's gate and the flag list it resolved to, then the registry's preset
   remedy. A stop that shows its working is refutable with `./snowarch instance list` in one
   glance, so a mis-resolved gate is visible to the reader rather than silently costing them a
   capability they have. A false stop is loud and cheap; a spent approval on a no-op is the defect
   this ADR exists for.
4. **If every required flag is on:** proceed to §2.1 as today. The write question is asked, and it
   is asked for an action that can actually happen.
5. There is no cache to invalidate, which is the reason for per-call rather than per-session: a
   preset change, an instance switch or a remedy the user applied mid-session are all events a
   cached answer would have to notice, and a rule with no cache cannot fail to notice them.

**The server remains the authority.** A pre-flight that reports a flag on and a server that refuses
the call anyway is the server's answer, and the session handles it exactly as T-22 does today: the
code, the remedy, no retry, no flag edit. The pre-flight removes the *predictable* refusal; it does
not promise there will never be one. That path is **T-22b**.

## Consequences

**The write question is only ever asked for writes that can happen.** This is the point of the
decision.

**A refusal becomes an exception rather than the discovery mechanism.** After this, a
`*_NOT_ENABLED` reaching a session is news — a state that changed under it, or a gate the contract
and the server disagree about — and worth reporting rather than routine.

**One read per mutating call.** Inside a §2.2 chain that is **three reads for one approved
action** — ensure, capture, write — and that is the price, stated rather than discovered. It buys
the absence of invalidation logic: the owner's words were *before every MCP request*, a read costs
a couple of seconds against an instance where a write costs an approval, and per-call has no state
to get subtly wrong.

**T-22 is rewritten** to assert the pre-flight sequence: capabilities read → flag off → remedy → no
mutating call and no write question. Its former sequence becomes **T-22b**, the server-refusal
path, which stays valuable precisely because it is now the exception.

**What this does NOT change:**

- **An enabled flag is not approval.** `CLAUDE.md` §2.1 already says an instance flag never
  substitutes for the user's "write approved", and nothing here weakens that. The pre-flight can
  only *prevent* a write question, never satisfy one.
- **Design-only sessions are unaffected** — they make no MCP call at all, so there is nothing to
  pre-flight.
- **§2.2 update-set capture is unaffected** and still runs before a configuration write. The
  pre-flight answers *may this happen*; §2.2 answers *is it captured*. Both, in that order.

## Alternatives considered

**Cache the capabilities for the session.** Rejected. The remedy T-22 prints is
`./snowarch instance set-preset <label> <preset>` — a command the user runs **in the terminal, during
the session**. A cached "off" would outlive its own remedy, and a cached "on" would outlive a
preset tightened for a reason. This is the stale-claim shape the programme has already paid for
elsewhere; re-reading is cheaper than being wrong.

**Pre-flight every call, mutating or not.** Rejected as scope without benefit: a read that is
refused costs nothing and teaches the same lesson immediately.

**Infer capability state from `./snowarch instance list` or the store.** Rejected. It is the
session reading a local file to predict a remote answer — the model this product replaced. The
server declares capabilities; the server is asked.

## Controls

The clause removed from `packages/contract/gen/rule-file.mjs` must fail a named test. Stated here
because an ADR whose ruling no test enforces is a ruling that will drift back, and the drift will
be silent.
