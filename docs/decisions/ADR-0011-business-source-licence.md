# ADR-0011 — The Business Source License 1.1 from 2.1.0

> **What this is:** an Architecture Decision Record for the *product*, not for a client engagement. It
> supersedes ADR-0002 for 2.1.0 and later. ADR-0002 is not edited: it stays the record for 2.0.x and earlier.

---

| Field | Value |
|---|---|
| **ADR ID** | ADR-0011 |
| **Title** | The Business Source License 1.1 from 2.1.0 |
| **Status** | **Accepted** (2026-10-14): the owner set the four parameters in `LICENSE` that day |
| **Date** | 2026-10-14 (recorded) · decision taken 2026-10-11 |
| **Decision owner** | Cvetomir Grigorov (owner), ruled 2026-10-11, relayed by the architect; ratified by the owner's approval of this text and the four parameters set in `LICENSE` (the date is the Status row's) |
| **Engagement** | AI ServiceNow Architect — product |
| **Release family** | n/a (licence) |
| **§1.1 relevance** | None |
| **Related** | Supersedes ADR-0002 for 2.1.0 and later · ARC-11-C5 (this change) · ARC-11-C3, which ships in the same release · `LICENSING.md` · `tests/licence-text.test.mjs` · `tests/source-headers.test.mjs` |

## Context

ADR-0002 put the whole repository under the Apache License, Version 2.0, on the owner's ruling of
2026-09-04. ARC-11 then added a licence from the author: checked on every build from 2.0.13 (ARC-11-C6),
and enforced, with a signed build-integrity manifest, in 2.1.0 (ARC-11-C3).

## Decision

The owner's ruling of 2026-10-11, as `docs/plans/ARC-11-licensing-and-access-control/README.md` records it:

> ARC-11-C3 and the move to BSL both go ahead, and ship together in 2.1.0, never one without the other.

The same file's ARC-11-C5 row records the terms:

> From v2.1.0 the `LICENSE` file becomes the Business Source License 1.1. The Licensor is the owner, and
> the Licensed Work is snowarch 2.1.0 and later. The Additional Use Grant allows internal use, and
> consulting delivery to the licensee's own clients. Offering the Licensed Work to third parties as a
> product, as a hosted or managed service, or as a substantial part of one, requires a commercial licence.
> The Change Date is four years after each version's release, and the Change License is Apache-2.0.
> […] Versions 2.0.x and earlier stay Apache-2.0.

What that means in this repository:

- From 2.1.0, `LICENSE` is the Business Source License 1.1 (SPDX `BUSL-1.1`). Its four parameters are the
  owner's: the Licensor, the Licensed Work, the Additional Use Grant and the Change Date.
- Its terms are the licence's own, word for word. They were taken from MariaDB's own plain-text copy
  (https://github.com/mariadb-corporation/MaxScale/blob/develop/licenses/LICENSE2408.TXT) and checked against
  SPDX's (https://github.com/spdx/license-list-data/blob/main/text/BUSL-1.1.txt): the two are identical word
  for word. From the separator above the terms to the fourth covenant, the bytes have the sha256
  `8b5ba7713c0d226337aa775edff3809689a937a2d64a621d74c827e98f6f1918`.
- Versions 2.0.x and earlier stay under the Apache License, Version 2.0. A version's licence is the
  `LICENSE` in its release tag.
- Every source file's header names the Business Source License 1.1, and `dist/` follows by the build.
- The npm package declares `BUSL-1.1`, and the publish step refuses any other value.
- The ServiceNowDocs corpus is ServiceNow's, under its own Apache-2.0 licence, and is untouched.

## Consequences

- `LICENSING.md`, `TRADEMARKS.md`, `NOTICE`, the README and `docs/CONTRIBUTING.md` move with `LICENSE`.
- The terms cannot drift: `tests/licence-text.test.mjs` holds them to the hash of the published text, and
  fails while a parameter is still a placeholder.
- There is one header form: `tests/source-headers.test.mjs` holds every tracked file that carries the
  copyright line to the current one, whatever its extension, `dist/` included.
- On a version's Change Date, or four years after that version is first published if that comes first,
  the version is also available under the Apache License, Version 2.0.

---

*ADR — AI ServiceNow Architect. One decision per file; never edit a decision's history — supersede it with a new ADR.*
