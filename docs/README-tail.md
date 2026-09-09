<!-- The README's third part: the two sections that are the README's rather than the install page's.
     `README.md` = `docs/README-head.md` + the body of `docs/INSTALL.md` + this file, composed by
     `scripts/gen-readme.mjs`. Split out by ARC-06-S13's review so the install page's 250-line
     criterion measures the install page, and not two sections that live there by accident of
     composition. Budget: 40 lines, asserted. -->

## What is here

| Path | What |
|---|---|
| `.claude/skills/`, `.claude/agents/` | the specialists — one skill each, nine of them also sub-agents |
| `governance/` | the rules the architect reads at routing time |
| `packages/snowarch/` | the MCP server that talks to a ServiceNow instance |
| `docs/ARCHITECTURE.md` | how the repository is laid out and how the engine works |
| `docs/PLATFORM-NOTES.md` | platform behaviour learned on real instances, and the Windows notes |
| `docs/CONTRIBUTING.md` | how to change it |

## Licence and attribution

Licensed under **Apache-2.0** — see `LICENSE` and `NOTICE`.

ServiceNow platform documentation is vendored from **ServiceNowDocs**
(<https://github.com/ServiceNow/ServiceNowDocs>) at a pinned commit and is the property of ServiceNow,
Inc., used under its own licence. This project is not affiliated with or endorsed by ServiceNow.
Every `docs sync` ends with the line
`docs: ServiceNow product documentation © 2026 ServiceNow, Apache-2.0 — vendor/ServiceNowDocs/LICENSE`,
and the corpus's own `LICENSE` and `legal/` are present in every checkout, sparse or full.
