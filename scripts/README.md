# scripts/ — document & diagram generation toolchain

House tooling for turning Word-ready Markdown deliverables (proposals, HLD/LLD, design specs) into
styled `.docx`, and for rendering architecture diagrams. Cross-platform: **macOS / Linux** use the
`*.sh` + Python scripts; **Windows** uses the `*.ps1` scripts. Both paths emit the **same** house
style.

---

## 🟦 Golden rule — diagrams in a `.docx` must be rendered images, never Mermaid

A Mermaid code block (` ```mermaid `) renders as ugly monospace **text** in Word. For any document
exported to `.docx`/PDF (client proposals, HLDs):

1. The diagram is authored by the **Diagramming Specialist** as an editable **`.drawio`** figure
   (the polished, house-style format — *not* Mermaid).
2. It is rasterised to **PNG** with **`render-drawio.sh`** (local; draw.io Desktop CLI).
3. The Markdown references the PNG with standard image syntax — `![Figure N — …](diagrams/figure-N.png)`
   — **not** a Mermaid block.
4. `md-to-docx` embeds the PNG. As a safety net the converter **refuses to dump Mermaid source** into
   Word (it emits a muted placeholder instead), so a stray ` ```mermaid ` fence can never leak as code.

Mermaid is fine for **in-repo / GitHub preview** (`render-diagrams.sh` → SVG/PNG, `mermaid-theme.json`);
just never embed raw Mermaid in a client `.docx`.

---

## Prerequisites by OS

Install only what you need for the capability you use. **Generating a `.docx` needs nothing beyond
Python 3 (Mac/Linux) or PowerShell (Windows)** — no Pandoc, no Word, no `python-docx`, no pip packages.

| Capability | macOS | Windows | Linux |
|---|---|---|---|
| **Markdown → styled `.docx`** | Python 3.x (built-in / `brew install python`) → `md-to-docx.py` | PowerShell 5+ (built-in) → `md-to-docx.ps1` | Python 3.x → `md-to-docx.py` |
| **`.drawio` → PNG** (client-ready figures) | `brew install --cask drawio` → `render-drawio.sh` | draw.io Desktop (`winget install JGraph.Draw.io` / [drawio.com](https://www.drawio.com/)) → run `draw.io.exe` CLI, or `render-drawio.sh` via Git Bash/WSL | draw.io Desktop / AppImage → `render-drawio.sh` |
| **`.docx` → PDF** (visual QA) | `brew install --cask libreoffice` → `render-pdf.sh` | Microsoft Word → `render-pdf-pages.ps1` | `apt install libreoffice` → `render-pdf.sh` |
| **`.mmd` → SVG/PNG** (in-repo preview only) | Node.js 18+ (`brew install node`) → `render-diagrams.sh` | Node.js 18+ → `render-diagrams.ps1` | Node.js 18+ → `render-diagrams.sh` |

> **Confidentiality (non-negotiable):** every renderer runs **locally**. draw.io Desktop and the
> Mermaid CLI never POST a diagram to an external service (kroki.io / mermaid.ink / etc.) — a
> ServiceNow architecture diagram can carry client-identifying structure. Do not switch to an online
> renderer.

### One-time installs (macOS)

```bash
brew install --cask drawio        # .drawio -> PNG/SVG (render-drawio.sh)
brew install --cask libreoffice   # .docx -> PDF for visual QA (render-pdf.sh)
# Python 3 and Node.js are usually already present; if not: brew install python node
```

The Mermaid CLI (`mmdc`) is fetched on demand by `render-diagrams.sh` via `npx`; first run downloads
`chrome-headless-shell` (`npx puppeteer browsers install chrome-headless-shell`).

---

## The end-to-end pipeline (document with diagrams)

```
Diagramming Specialist          render-drawio.sh            (edit the .md)         md-to-docx        render-pdf.sh
   author figure.drawio  ─▶  figure.drawio → figure.png ─▶ ![..](figure.png) ─▶  .md → .docx   ─▶  .docx → .pdf (QA)
   (house style, NOT Mermaid)   (local draw.io CLI)         (no ```mermaid)        (embeds PNG)      (LibreOffice)
```

### Worked example (macOS)

```bash
# 1) render every .drawio in a folder to PNG (scale 3 = crisp text)
scripts/render-drawio.sh clients/<client>/designs/diagrams png 3

# 2) ensure the .md references the PNGs (![Figure N](diagrams/figure-N.png)), not ```mermaid blocks

# 3) build the styled .docx (client name goes in the footer, never in committed markdown)
python3 scripts/md-to-docx.py \
  --src clients/<client>/designs/MyDesign.md \
  --out clients/<client>/designs/MyDesign.docx \
  --footer-text "<Client> | Commercial in confidence"

# 4) visual QA — render to PDF and eyeball it
scripts/render-pdf.sh clients/<client>/designs/MyDesign.docx
```

On **Windows**, swap steps 3–4 for the PowerShell equivalents:

```powershell
pwsh scripts/md-to-docx.ps1 -Src clients\<client>\designs\MyDesign.md -Out clients\<client>\designs\MyDesign.docx -FooterText "<Client> | Commercial in confidence"
pwsh scripts/render-pdf-pages.ps1 clients\<client>\designs\MyDesign.docx
```

---

## First-run setup

Before any of the toolchain above matters, the engine itself has to be bootstrapped. Two commands
cover it, and they are the only two a new user needs — the full walkthrough lives in
[`SETUP.md`](../SETUP.md).

```bash
bash scripts/setup.sh     # fix  — bootstrap the engine (idempotent; safe to re-run)
bash scripts/doctor.sh    # check — "is my setup correct?" before work starts
```

`setup.sh` initialises the `ServiceNowDocs` submodule, arms the pre-commit guards, syncs the
`agents/` ↔ `skills/` mirrors and writes a working `.claude/settings.json`, then stops at a tier
gate. **Tier 0 (design-only) is a complete, supported end state** — the whole specialist roster and
every design deliverable work with no ServiceNow instance and no credentials. Answer *yes* at the
gate (or re-run later with `--mcp`) to also register the `servicenow-mcp` server against a live
instance: it prompts for the instance URL, the credential (`read -rs`, never echoed) and each of the
six capability flags, then registers via `claude mcp add` after taking a verified, mode-`600` backup
of `~/.claude.json`. A zero exit from the CLI is not trusted: the written config is re-read and the
entry, its entrypoint and every required env **key name** are checked, so an absent
`SCRIPTING_ENABLED` fails here rather than mid-task. No credential is ever written into this
repository, and no value is ever read back out of the config. Useful flags: `--yes`
(non-interactive, stops at Tier 0), `--tier0`, `--mcp`, `--creds-only`, `--snow-mcp <path>`.

---

## Script reference

| Script | OS | What it does |
|---|---|---|
| `md-to-docx.py` | Mac/Linux/Win | Markdown → styled `.docx` (navy title banner, blue-header zebra tables, inline code, shaded callouts, embedded PNGs, page-numbered footer). Pure Python stdlib — no deps. `--src --out --footer-text`. |
| `md-to-docx.ps1` | Windows | Identical output via .NET/PowerShell. `-Src -Out -FooterText`. |
| `render-drawio.sh` | Mac/Linux (Win via Git Bash/WSL) | Every `*.drawio` under a dir → PNG/SVG/PDF via draw.io Desktop CLI, **locally**. `[DIR] [FORMAT] [SCALE]`. |
| `render-pdf.sh` | Mac/Linux | `.docx` (or `.md`) → PDF via LibreOffice headless, for visual QA. |
| `render-pdf-pages.ps1` | Windows | `.docx` → PDF via Word, then rasterise pages. |
| `render-diagrams.sh` / `.ps1` | all | `*.mmd` (Mermaid) → SVG/PNG for **in-repo preview** (uses `mermaid-theme.json`). Not for client `.docx`. |
| `mermaid-theme.json` | — | House Mermaid palette/fonts (applied automatically by `render-diagrams.*`). |
| `verify-citations.sh`, `verify-structure.sh` | all | Pre-commit guards (ServiceNowDocs citation paths; agents/skills structural integrity). |
| `sync-agents-skills.sh` | all | Keeps `agents/` ↔ `skills/` registry in sync. |
| `doctor.sh` | Mac/Linux (Win via Git Bash/WSL) | **"Is my setup correct?"** — 30+ **read-only** checks across host toolchain, engine integrity (roster, structure audit, hooks, submodule, citations) and the MCP layer (registration, build, tier flags, live instance + per-tier role probes). Ends in a verdict plus a derived capability line (`Mode: design-only` / `Mode: live — WRITE=on …`). Prints remedies, **never applies them**. `--tier0 --no-network --json`. Exit 0/1/3. |
| `setup.sh` | Mac/Linux (Win via Git Bash/WSL) | First-run bootstrap — submodule, hooks, mirrors, `settings.json`, then a tier gate: stop at Tier 0 (design-only) or register the `servicenow-mcp` server via `claude mcp add`. Idempotent. `--yes --tier0 --mcp --creds-only --snow-mcp <path>`. Exit 0/1/3. |

---

## Notes

- **Pre-commit guards vs. the doctor.** `verify-citations.sh` and `verify-structure.sh` are wired into
  `.githooks/pre-commit` and block a commit. **`doctor.sh` is NOT a commit gate** — it is a user-run
  environment audit you invoke yourself before work starts. It *delegates* to the two guards (so a
  structural or citation break shows up in its report), but it never blocks anything and never writes:
  every remedy it prints is for you or `setup.sh` to apply. It also closes one hole the commit gate
  deliberately leaves open — `verify-citations.sh` exits 0 when the `ServiceNowDocs` submodule is
  missing, so it never blocks a fresh clone; the doctor reports that same state as a FAIL, because it
  means every citation in the repo is currently unverified.
- **No client names in committed Markdown.** Pass the client via `--footer-text` / `-FooterText` per
  engagement. The `clients/` tree is git-ignored; generated `.docx`/PNG stay local.
- **Images:** PNG only for `md-to-docx` (dimensions read from the PNG IHDR header, sized to fit the
  text width, max ~6.2 in). Put the PNG beside the `.md` or use an absolute path.
- **Very wide diagrams** (dense sequence diagrams) shrink to fit the 6.2 in text width on A4 portrait.
  If a client needs it larger, place it in a landscape appendix.
