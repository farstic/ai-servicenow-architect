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
