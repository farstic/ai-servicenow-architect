# ARC-12 — Local console (`snowarch ui`): a localhost page for the end-user commands

**Status: FUTURE PLAN — research only, not started.** Owner's idea, 2026-10-22. Recorded so the work can begin on the
owner's word, after 2.2.4. Nothing here is built, and nothing ships until the owner rules on the open decisions below.

## The idea, in the owner's words (summarised)

Today every end-user action — install, upgrade, version and licence checks, the doctor — is a command typed in a
terminal or PowerShell. The owner asks for a local HTML page (localhost, never published) where a user pastes the path
of an AI Architect install — a user can have several installs in different folders — and, per install, sees its
version, whether a newer release is published on github.com/farstic/snowarch, its licence and health, and runs the
main commands with buttons instead of the terminal.

## Feasibility (answered 2026-10-22)

Possible. A browser page cannot run commands by itself (the browser sandbox forbids it), so the console is two parts:
1. a small local server, Node only, no new dependencies (Node is already the live-mode prerequisite), bound to
   `127.0.0.1`, which runs the product's own commands in a chosen folder;
2. the page it serves: the list of installs, one card per install, buttons, results.
The console adds no logic of its own: every button runs a command that exists today, and most already print
machine-readable output (`doctor --json` with its schema-v1 validator, `status --json`, `licence check`, `upgrade
--check`, `upgrade --yes`).

## Recommended shape

**Inside the product, as a new command `snowarch ui`** (`.\snowarch.cmd ui` on Windows), shipped in the signed release
like every other file, so it installs and upgrades with the product and the licence gate stays intact.

**Each added folder is driven through ITS OWN launcher**, never through the code of the install the console runs from:
`<folder>/snowarch status --json`, `<folder>/snowarch doctor --json`, and so on. Each install answers in its own
version's terms; an older install that lacks a feature gets "upgrade this install", never a guess. (The lesson of
ARC-09-C195: ask the target's code, not the running one.)

## MVP scope — the end-user commands

Per install card:
- **Status:** version, mode (design-only / live), instances, signed-manifest integrity.
- **Licence:** in force or not, valid until; a "check again" button (`licence check --refresh`).
- **Doctor:** ok / warn / fail, and for every failure its remedy as the doctor prints it.
- **Update:** whether a newer final is published (`upgrade --check`).
- **Upgrade button:** a confirmation first, then the output streamed line by line (`upgrade --yes`).
- **Update the docs button:** `docs sync`.
- **Add / remove an install** by pasting its path; the path must be a verified AI Architect install.

**Out of the MVP (stay in the terminal):** the bootstrap and the instance wizard (they ask for passwords — no
password travels through a browser in the MVP); every owner licence command (`issue`, `revoke`, `sign-release`,
`keygen` — the private key never goes near a web server).

## Security model (non-negotiable)

- Listens on `127.0.0.1` only, on a random port, with a one-time token in the URL; requests whose Origin or Host is not
  the console's own are refused (other sites open in the same browser cannot press a button).
- An allowlist of product commands with fixed arguments; spawned with an argument array, never a shell; no free-form
  command, ever.
- A folder is accepted only if it is a verified AI Architect install.
- Output shown is the commands' own, already redacted (the doctor masks credentials); nothing new is logged.
- No telemetry: nothing is sent anywhere; the only network call is the same update check the CLI makes.
- The list of folders is stored in the launching install's `.local/` — the product's promise that it writes only
  inside its own folder holds.

## Relation to earlier decisions — owner rulings needed when this starts

- **D-03 (2026-09-04) cut nine surfaces, among them "HTTP/SSE + dashboard + Dockerfile"** — a network transport of the
  MCP server, cut as a dependency, a maintenance surface and a second config store. This console is NOT that: it never
  exposes the MCP server, has no second config store (each install's own CLI is the source), and binds to localhost
  only. It still adds a maintenance surface, so **starting it amends D-03** and needs the owner's explicit ruling,
  recorded as an ADR.
- **New command:** under the follow-the-current-implementation rule, a new command is the owner's decision; this plan
  is that discussion.
- **D-04 stays:** the console does not change the instance wizard's "propose full for pdi/dev/test" rule; the wizard is
  out of the MVP anyway.

## Where the code lives (checked 2026-10-22 against COVERAGE, `packages/snowarch/src/licence/integrity.ts:71-101`)

In the engineering repository, under `tools/snowarch/`, which COVERAGE already covers as one prefix — so no new
top-level prefix is added (ARC-09-C197 holds), and the console ships, is verified and upgrades with the product.
Development follows the usual flow: the developer's checkout, a feature branch per row, a PR to develop, the
architect's gate; it reaches github.com/farstic/snowarch with the next release like every other file.

```
tools/snowarch/
├── lib/
│   ├── cli.mjs              ← gains the `ui` verb
│   ├── commands/ui.mjs      ← NEW: `snowarch ui` — starts the console, prints its URL
│   └── ui/                  ← NEW: the local server
│       ├── server.mjs       — 127.0.0.1, random port, one-time token, Origin/Host checks
│       ├── actions.mjs      — the allowlist: status, doctor, licence check, upgrade --check / --yes, docs sync,
│       │                      each spawning the FOLDER'S OWN launcher with fixed arguments, no shell
│       └── folders.mjs      — the folder list in the launching install's .local/, and "is this an install?"
├── ui/                      ← NEW: the page itself, no CDN — index.html, app.js, style.css
└── tests/ui/                ← NEW: security cases and a two-version fixture e2e (tests/ is excluded from COVERAGE)
```
The launchers (`snowarch`, `snowarch.cmd`) need no change: they hand every verb to `cli.mjs`.

## Constraints to check before the first line of code

- **ARC-09-C197:** until its fix is in the installed base, COVERAGE must gain no NEW top-level directory prefix (a
  user file under a newly covered directory stops an upgrade after the move). The console's files go under a
  directory COVERAGE already covers; verify at design time.
- Cross-platform from the first PR: macOS, Linux and Windows (PowerShell, no Git Bash), Node 20/22/24.
- The console must keep working when an added install is older than the console's own (feature detection per folder).

## Delivery (estimate, our process: red-first tests, three-OS CI, architect gate)

| Row | Content | Estimate |
|---|---|---|
| 1 | Server core, security model (token, Origin/Host, allowlist, localhost), read-only cards: status, licence, doctor | 3–4 days |
| 2 | Update check, Upgrade with confirmation and streamed output | 2–3 days |
| 3 | Several installs (add/remove/validate), docs sync, USER-GUIDE + INSTALL pages | 2 days |
| 4 | End-to-end on all three OSs with fixture installs of two versions; security tests (foreign Origin, wrong token, non-allowlisted command, non-install folder) | within rows 1–3 |
| **MVP** | | **≈ 1.5–2 weeks** |

## Acceptance criteria (for the MVP)

1. `snowarch ui` starts on macOS, Linux and Windows, prints its URL, and serves only on 127.0.0.1.
2. A request without the token, or from a foreign Origin/Host, is refused; a command not on the allowlist is refused.
3. Two installs of different versions show correct, version-own status, licence, doctor and update state.
4. Upgrade from the console produces the same result as `upgrade --yes` in a terminal (same drill as the release's
   previous-release drill), and "nothing was changed" holds on every refusal.
5. No password, token or private key is ever accepted, shown or stored by the console.
6. The page works offline (no CDN), and the product still writes only inside its own folders.

## Later phases (not in the MVP)

- The instance wizard and the bootstrap in the browser (password handling designed and reviewed separately).
- A Windows double-click launcher for the console.
- Owner tools (licence issue/revoke) — only as a separate, owner-only tool, never in the end-user console.
