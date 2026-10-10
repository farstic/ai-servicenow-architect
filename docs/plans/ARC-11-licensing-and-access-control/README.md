# ARC-11 — Licensing and access control

Status: **In progress — C1 started 2026-10-10** · Depends on: ARC-04 (the server's router and audit trail), ARC-08 (doctor checks and the SessionStart banner), ARC-09 (`upgrade` and its fetch)

## Goal

A licence that says who may use the product, checked by the product itself:
- **2.0.12:** warn only by default, and enforceable for the owner's own test.
- **2.1:** enforced by default.

## The owner's directive (2026-10-10)

The owner set four requirements, relayed by the architect:
- **"Everything must keep working exactly as now."** This is the first requirement. Without a licence and without
  enforcement, the product behaves as it did, apart from one warning.
- **"No licence = no access at all,"** under enforcement.
- **"Revoke → it stops at the next start."**
- **"The creator always has access."**

No lawyer is involved in this arc. The licence texts are ARC-11-C2's, and they come from the architect.

## Why it exists

Until 2.0.12, anyone with a checkout could run every part of the product, and nothing recorded whose licence a
deliverable was produced under.

## Scope

**In scope:**
- a signed licence file, and its commands;
- a revocation list;
- the start-up check, and its warning;
- an enforcement switch;
- the licence id in the audit trail;
- the licensing documents.

**Out of scope for 2.0.12, and in ARC-11-C3:**
- enforcement on by default;
- a signed build-integrity manifest;
- the check in a compiled module;
- key rotation;
- BSL.

## Dependencies

ARC-04, ARC-08 and ARC-09, as built. No new runtime dependency: the signature is Ed25519 from `node:crypto`, and the list is fetched with the git the product already requires.

## Acceptance criteria

1. With no licence file and enforcement off, the only changes anyone sees are three:
   - one doctor warning (E-31);
   - one licence line in the session banner;
   - one extra content block on the server's first answer of a session, whose first block is byte-identical.

   Tests, e2e cases, validation cases and the upgrade path behave as before. The tool count is unchanged.
2. A licence is valid only when signed by a key the product ships, primary or recovery.
3. Revoking a licence and pushing the list makes it `revoked` at the product's next start, when the list can be
   reached. The product never pushes.
4. Under `SNOW_LICENCE_ENFORCE="true"`, a missing, invalid, expired or revoked licence refuses every MCP tool, and
   every CLI command except the ones needed to repair the state.

## Rows

| ID | What | Status |
|---|---|---|
| ARC-11-C1 | **A licence gate, soft, for 2.0.12 (formerly C124a).** The owner's directive (2026-10-10): licensing and access control, where "everything must keep working exactly as now" is the first requirement. | **OPEN (2.0.12): built test-first on `fix/arc11-c1-licence-gate` (2026-10-10). It waits for two things from the owner: the keygen, whose two public keys are committed as C1's last code commit, and the four lines below.** The design was approved by the architect, with the owner's rulings (2026-10-10). The licence is `.local/licence.json` (id LIC-YYYY-NNNN, licensee, org, scope design-only or live, issued, valid_until, issuer, notes), with a detached Ed25519 signature over canonical JSON from node:crypto, so no new dependency. A missing `valid_until` means perpetual, which only a product key may sign. Two public keys ship, primary and recovery, by fingerprint, in the CLI and the server, held equal by a parity test. `./snowarch licence` has keygen, issue, show, verify, check [--refresh], init-list and revoke. keygen writes two key pairs, only outside the checkout, with the recovery key at its own path, and issues the creator's perpetual live licence LIC-<year>-0001 beside the keys. revoke takes a reason from an enum (ended, breach, lost, other), with no names and no free text. The revocation list is signed and carries a version that only goes up. It lives in the public repo `farstic/snowarch-licences`, on `main`, as `revocations.json`, under the config key `licence.revocations`. It is fetched by git over HTTPS from that URL in `upgrade`, `upgrade --check` and `licence check --refresh`. At a live server start with the cache missing or older than 24 h it refreshes in the background, within 3 s, never blocking or failing, and applies from the next call. Offline, the cached list is used, or none; a repo with no `main` or no file yet counts as no list, silently. A list whose version is lower than the cache's is ignored. States: ok, missing, invalid, expired, revoked, expiring (30 days or fewer). The default is WARN ONLY: doctor check E-31 at warn, the SessionStart banner's licence line, and one extra content block on the server's first answer. `SNOW_LICENCE_ENFORCE="true"` is an env var; measured on rc.4's live server, it arrives from the launching shell and from the settings `env`. When set, it refuses EVERY MCP tool at the router entry, beside C121's argument check, with the new `LICENCE_NOT_VALID`, and every CLI command except licence, doctor, status, version and upgrade. A design-only licence does not cover live. Design-only work is guarded only by a rule, not a lock: one owner-approved CLAUDE.md sentence says that, under enforcement and without a valid licence, the Architect produces no deliverable and says so. That sentence binds only a session that obeys CLAUDE.md, and a user can edit it out. The audit line carries `licence` only when the licence's signature is valid. The §4 artefact-footer sentence in governance needs the owner's sitting. With no file and enforce off, a class case shows the only changes are three: the E-31 warn, the banner's licence line, and one extra block on the first answer, with content[0] byte-identical. There is no audit key, and the tool count stays 399. The contract sha moves once, for the new code (cec25753cade to 4c2127f4fff4). Four lines go to the owner with a preview: the CLAUDE.md sentence; the rules file's generated header line; the `/snowarch` skill's quoted `Doctor:` line, which now names E-31; and the engine's contract pin. The public keys are the owner's own: the branch ships an empty key list until the owner runs keygen and relays the two public keys. |
| ARC-11-C2 | **The licensing documents.** `LICENSING.md`, `TRADEMARKS.md`, `CONTRIBUTING.md`, `CLA.md`, a header in every source file, and a guard test that keeps the headers there. | **OPEN (2.0.12), after C1.** The texts come from the architect. |
| ARC-11-C3 | **The enforced gate, for 2.1 (formerly C124b).** | **OPEN (2.1).** In scope: enforcement on by default, a signed build-integrity manifest, the check in a compiled module, key rotation, and BSL. |
| ARC-11-C4 | **The owner's two-machine test, as a `tests/VALIDATION-TESTS.md` entry run by hand.** The owner issues and revokes on one machine; a colleague installs the licence on the other. | **OPEN (2.0.12), after C1.** The steps are in the live README's ARC-11-C1 section. |
