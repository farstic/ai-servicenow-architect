# AI ServiceNow Architect

A virtual ServiceNow consulting team that runs inside Claude Code. You describe what you need; a Chief
Architect routes the request to the right specialist, reviews what comes back, and hands you the
artefact — a design, a set of stories, a Script Include, a test suite. Up to twenty-eight specialists
may contribute to a single exchange. The rule that shapes every one of them is baseline-first: the
platform's out-of-the-box capability is evaluated before anything custom is agreed, and a custom table
or scoped application needs your explicit approval, never the model's own.

## Two modes

It runs **design-only** — no instance, no credentials, everything produced as documents and code you
review — or **live**, connected to a ServiceNow instance through the bundled MCP server, where every
write is gated on your explicit approval in the conversation and captured into an update set.

## Install

Installation page arrives with ARC-06 — `docs/INSTALL.md`.

*(That link does not resolve yet. It is listed here because the README becomes the installation page
when ARC-06-S13 lands; until then, this repository is under active construction and has no supported
install path.)*

## What is here

| Path | What |
|---|---|
| `.claude/skills/`, `.claude/agents/` | the specialists — one skill each, nine of them also sub-agents |
| `governance/` | the rules the architect reads at routing time |
| `packages/snowarch/` | the MCP server that talks to a ServiceNow instance |
| `docs/ARCHITECTURE.md` | how the repository is laid out and how the engine works |
| `docs/CONTRIBUTING.md` | how to change it |

## Licence and attribution

Licensed under **Apache-2.0** — see `LICENSE` and `NOTICE`.

ServiceNow platform documentation is vendored from **ServiceNowDocs**
(<https://github.com/ServiceNow/ServiceNowDocs>) at a pinned commit and is the property of ServiceNow,
Inc., used under its own licence. This project is not affiliated with or endorsed by ServiceNow.

<!-- ARC-06: move to docs/INSTALL.md under the B02 row -->
**The corpus costs about 302 MB on disk and about 35 seconds to fetch** — a sparse, blobless
checkout of 19 documentation areas out of 49,000 tracked paths (measured 2026-09-06, ARC-00 S-07:
302 MB macOS / 305 MB Ubuntu / 315 MB Windows; 23.6 s Ubuntu to 37.6 s macOS). `--mode full`
takes the whole corpus instead: **447 MB and 48,997 files** (measured 2026-09-09 on the reference
macOS machine — ARC-00 S-07 did not measure full mode).

Every `docs sync` ends with the line
`docs: ServiceNow product documentation © 2026 ServiceNow, Apache-2.0 — vendor/ServiceNowDocs/LICENSE`,
and the corpus's own `LICENSE` and `legal/` are present in every checkout, sparse or full.
