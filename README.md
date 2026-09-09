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
**The corpus costs about 302 MB on disk and about 30 seconds to fetch** — a sparse, blobless
checkout of 19 documentation areas out of 49,000 tracked paths. Two measurements, because they count
different things: the **working tree** is 179 MB on Linux and macOS, 183 MB on Windows, 34,360 files
(measured 2026-09-09 by `docs-real.yml` on all three runners: 25.3 s Ubuntu · 27.5 s macOS · 35.1 s
Windows), and **tree plus `.git`** is 302 MB macOS / 305 MB Ubuntu / 315 MB Windows (measured
2026-09-06, ARC-00 S-07). The first is what you read; the second is what the disk loses. `--mode full`
takes the whole corpus instead: **447 MB and 48,997 files** (measured 2026-09-09 on the reference
macOS machine — ARC-00 S-07 did not measure full mode).

<!-- ARC-06-S13: move to docs/INSTALL.md -->
**Install.** `git clone https://github.com/farstic/ai-servicenow-architect.git && cd
ai-servicenow-architect && ./bootstrap.sh` — on Windows, `.\bootstrap.cmd` (double-click works too).
That is the whole thing. With Node.js 20+ present the
launcher hands over to the Node CLI; without it, design-only completes anyway, which is the mode
most people want. Starting `claude` afterwards shows **one dialog** (workspace trust), *measured on
Claude Code 2.1.258*; the engine's floor is 2.1.214, where a second approval for the MCP server may
still appear. The summary tells you which to expect before you start.

<!-- ARC-06-S13: move to docs/INSTALL.md "Adding live mode later" -->
**Getting an instance later.** `./snowarch mode live` (Windows: `snowarch.cmd mode live`) turns a
design-only checkout into a live one — no re-clone and no re-registration — and `./snowarch mode
design` turns it back, keeping the instance in the store. `./snowarch mode` on its own says which
you are in. If your organisation's policy blocks project MCP servers, `./snowarch mode live
--register local` registers the same secret-free entry for this checkout only.

<!-- ARC-06-S13: move to docs/INSTALL.md "Operators and CI" -->
**Operators and CI — a live install with no keyboard.** `./snowarch bootstrap --mode live --yes
--instance-file <path>` reads its connection details from a file instead of prompting, so a
credential never passes through a command line, a transcript, an environment dump or a shared
config file. The file is a **store document** — the same shape as `.local/instances.json`, so `cp`
from another checkout works:

```json
{ "version": 1,
  "instances": {
    "pdi": { "url": "https://dev123456.service-now.com",
             "auth": { "method": "basic", "username": "<user>", "password": "<password>" } } } }
```

It must be **mode 0600 or stricter** (checked before it is read) and **somewhere git could not
commit it** — outside the checkout, or gitignored inside it. `environment` and `preset` may be
omitted: a `dev*.service-now.com` URL proposes `pdi`, a sandbox proposes the most permissive preset
and production the most restrictive, and every proposal is printed with `accepted: --yes` so nothing
is decided silently. A production instance above the read-only preset additionally needs
`"prodWriteAck": true` in the file. The credential is authenticated **once** — there is no retry,
because a second attempt is the same wrong password sent again — and nothing is saved unless it
succeeds. The file is never copied, moved or deleted; the run reminds you it still holds your
credentials. On Windows the mode cannot be checked and the run says so: delete the file after use.

Every `docs sync` ends with the line
`docs: ServiceNow product documentation © 2026 ServiceNow, Apache-2.0 — vendor/ServiceNowDocs/LICENSE`,
and the corpus's own `LICENSE` and `legal/` are present in every checkout, sparse or full.
