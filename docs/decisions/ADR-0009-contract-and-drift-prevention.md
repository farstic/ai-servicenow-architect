# ADR-0009 — The contract: the server generates it, the engine pins it, both test it

> **What this is:** an Architecture Decision Record for the *product*, not for a client engagement.

---

| Field | Value |
|---|---|
| **ADR ID** | ADR-0009 |
| **Title** | The contract: the server generates it, the engine pins it, both test it |
| **Status** | **Accepted (2026-09-08)** |
| **Date** | 2026-09-08 |
| **Decision owner** | Cvetomir Grigorov (owner) — ratified by merging ARC-05-S11 |
| **Engagement** | AI ServiceNow Architect — product |
| **Release family** | n/a (repository mechanism) |
| **§1.1 relevance** | None |
| **Related** | Closes P-04, P-05, P-33, P-36 · DR-10, DR-14 · ARC-05 S01–S11 · consumed by ARC-06, ARC-07, ARC-08, ARC-09 |

## Context

Four problems, one shape. **P-04**: engine texts named tools the server had renamed, and nothing
noticed — a skill could cite a name the server answers with `UNKNOWN_TOOL`. **P-05**: the write gate
was keyed on a tool-name prefix that had changed, so the rule matched nothing. **P-33**: the
update-set protocol was stated in four documents in two naming generations, and the copies
disagreed about which calls exist. **P-36**: nothing connected what the engine believed about the
server to what the server actually declared.

Each was a fact about the server, written by hand, somewhere else. Each was true when written.

Two things were considered and rejected. **A runtime alias layer** — the server accepting old names
and mapping them — would have made every text permanently correct and every reader permanently
unable to tell which name is real (DR-10). **A shared TypeScript package** imported by both sides
would have coupled the engine's tooling to a build, when the engine's bootstrap and doctor must run
in a checkout that has installed nothing (DR-14).

## Decision

**The server generates the contract; the engine pins it; both sides test it; the texts are
generated from it; there is no runtime alias.**

- `packages/snowarch/dist/contract.json` is emitted from the tool registrations, the flag table, the
  presets and the error registry. Descriptions and input schemas are deliberately outside it: they
  change for editorial reasons, and a sha that moved on every improved sentence would be pinned to
  nothing.
- `packages/contract/required-tools.json` records what the engine depends on, who depends on it, and
  the sha of the contract it was written against. `pin.mjs` proposes, names every re-gate, and
  applies only on confirmation.
- Both sides test the same facts from opposite directions. The server's `tests/contract.test.ts`
  holds fourteen invariants; the engine's `engine-lint.mjs` holds eleven checks. Neither is
  redundant: the server test fails in the package that changed, at the moment it changes; the lint
  fails in a clone with no `node_modules`, in the command everyone runs.
- Every text that states a fact about the server is generated from the contract — the always-loaded
  rule file, the long-form protocols, the troubleshooting page, the preset table and the permission
  blocks — and `--check` fails CI when a committed one is not what its generator produces.
- Engine tooling reads names through `packages/contract/lib/contract.mjs`, never from a list of its
  own, and a guard scans for the literals.

Two fields were ratified during the work because the first shape lost information a consumer needed.
**`alsoRequires`** carries the second gate six tools enforce after their first, so a generator
reading `gate` alone no longer under-reports them. **`sessionMutates`** marks the one tool that
changes no record and decides where every later write lands; the ask list is the union, because a
generator filtering on `mutates` alone would leave that action unprompted and then prompt every
write that followed it.

## Consequences

**Every change to a server tool is a two-side commit.** Declare and rebuild on the server side; pin
and regenerate on the engine side. The gate refuses the halfway state, which is the point — the
halfway state is what shipped before, silently. The drill in ARC-05-S11 is what that refusal looks
like: one rename turned 18 of 25 CI jobs red, and every failing line named the file and the command.

**The always-loaded rule file costs about 45 lines of every session's context.** That is the price
of the gate being obeyed rather than merely documented, and it is why the file is generated: it can
be short because the long form lives elsewhere and cannot drift from it.

**A prefix change is one line.** `engine.config.json`'s `mcp.serverKey`, then `npm run gen` — which
is what makes a plugin-channel move (spike S-14) a configuration change rather than a sweep.

**Two known limits.** The contract carries no input schemas, so a schema/handler disagreement is
caught by a source sweep rather than by the sha. And `main`'s required contexts must be updated by
hand when the job matrix changes — the gate protects the branch, but the list of gates is itself
hand-maintained.
