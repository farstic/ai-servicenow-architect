# Diagram Import Notes

**Repository:** [`farstic/claude-servicenow-live`](https://github.com/farstic/claude-servicenow-live)
**Purpose:** Conventions for the editable architecture diagrams — how to open and import them, the shared colour palette, and the editing rules that keep the visual language coherent.
**Audience:** Anyone editing the architecture diagrams for presentations or stakeholder review.
**Last updated:** 29 May 2026

> **Status (May 2026):** the `.drawio` source files described below are **not yet committed** to `docs/diagrams/`. Until they are, the canonical visuals live as **Mermaid blocks inside the markdown docs** — `README.md`, `BUSINESS-OVERVIEW.md`, `TECHNICAL-ARCHITECTURE.md`, and `USER-GUIDE-AND-EXAMPLES.md` — and render directly on GitHub. This document stands as the convention spec for when the editable `.drawio` sources are added, and as the palette/editing standard for any diagram produced for the engine. Note that the diagrams predate the MCP era and do not yet show the §2.1 / §2.2 write gates.

When present, this folder holds editable architecture diagrams as native `.drawio` files, designed to open cleanly in draw.io and import cleanly into Lucidchart for stakeholder editing.

---

## The diagrams

| File | Used in | Best opened in |
|---|---|---|
| `01-engine-overview.drawio` | Root `README.md`, `docs/README.md` | draw.io or Lucidchart |
| `02-virtual-team-org-chart.drawio` | `BUSINESS-OVERVIEW.md` | draw.io or Lucidchart |
| `03-full-request-lifecycle.drawio` | `TECHNICAL-ARCHITECTURE.md` | draw.io or Lucidchart |
| `04-section-11-halt-protocol.drawio` | `USER-GUIDE-AND-EXAMPLES.md` | draw.io or Lucidchart |
| `05-architecture-wall-diagram.drawio` | Stakeholder presentations | Lucidchart (wide canvas) |

---

## Opening in draw.io

The simplest path:

1. Go to [app.diagrams.net](https://app.diagrams.net).
2. **File → Open from → Device**.
3. Select the `.drawio` file.

Or download the [draw.io Desktop app](https://github.com/jgraph/drawio-desktop/releases) for offline use.

---

## Importing into Lucidchart

Lucidchart natively supports draw.io files. The import path:

1. Open Lucidchart in your browser.
2. From any document or the My Documents view: **File → Import Diagrams**.
3. Select **draw.io** as the source.
4. Upload the `.drawio` file.
5. Lucidchart will convert and open the diagram for editing.

### What imports cleanly

- **Shapes and colours** — the colour palette translates directly.
- **Flowchart arrows and connectors** — preserved with their routing.
- **Swimlanes** — present in diagrams 03 and 04. Lucidchart treats them as containers, which is the same model draw.io uses.
- **Text labels and styling** — bold, italic, and size are preserved.

### Known quirks of the import

- **Edge labels** may need a slight nudge after import — Lucidchart sometimes places them at the midpoint regardless of source position.
- **Custom font choices** revert to Lucidchart defaults. The diagrams use standard sans-serif, so this is rarely noticeable.
- **Wide canvases** (diagram 05 is 2200px wide) may need the canvas size increased in Lucidchart's page settings before the import finishes rendering.
- **Mermaid sequence diagrams** were not used as the `.drawio` source format — they round-trip badly through Lucidchart's importer. The §1.1 halt protocol (diagram 04) and the full lifecycle (diagram 03) are therefore presented as **swimlane flowcharts** rather than sequence diagrams. They convey the same temporal information and import without loss.

If you want the Mermaid sequence-diagram view, it lives directly in `TECHNICAL-ARCHITECTURE.md` and `USER-GUIDE-AND-EXAMPLES.md` — render it from the markdown file rather than trying to convert from draw.io.

---

## Colour palette

The diagrams use a consistent palette so colour reading is meaningful — the same colour means the same thing across all five files.

| Colour | Hex | Used for |
|---|---|---|
| **Red** | `#DC2626` | Governance and gate-keeping — §1.1, Domain Expert gateways, halt states |
| **Blue (dark)** | `#1E40AF` | Chief Architect and orchestration |
| **Blue (mid)** | `#2563EB` | Domain Expert envelope and routing context |
| **Green** | `#16A34A` | Builders — the specialists that produce deliverables |
| **Yellow / Amber** | `#CA8A04` | Quality, review, and documentation specialists |
| **Slate Grey** | `#475569` | Department headers and other specialists |
| **Anthropic Orange** | `#D97757` | Anthropic Claude in foundation layer |
| **Black** | `#191919` | GitHub repository in foundation layer |
| **Light Grey** | `#E5E7EB` | Users and external touchpoints |

To keep the palette consistent across edits, hold to these hex codes when adding new elements.

---

## Editing conventions

When extending or modifying the diagrams, follow these conventions so the visual language stays coherent:

- **Shape semantics** — ellipses are start/end states or human touchpoints. Rounded rectangles are agents, specialists, or processing steps. Diamonds are decision points. Plain rectangles are layer or grouping containers.
- **Arrow weight** — primary flow uses 2px solid arrows. Secondary or optional flows use 1px solid. Conditional or rejected paths use dashed lines.
- **Label placement** — keep labels above or inside shapes, never below. This stays consistent through Lucidchart's import.
- **Lane order** — in swimlanes, the user lane is always first (top for horizontal, left for vertical). The Chief Architect is always second. Specialists follow in order of involvement.

---

## Where to save your edits

If you edit the diagrams for a client engagement or presentation, save them under `clients/<client>/diagrams/` rather than overwriting these source files. The source files in `docs/diagrams/` are the canonical engine documentation and should evolve only when the engine itself changes.

For changes that *should* update the canonical documentation:

1. Edit the `.drawio` file in `docs/diagrams/`.
2. Update the corresponding Mermaid block in the relevant `.md` file (so the markdown rendering stays in sync).
3. Update `CHANGELOG.md` if the change affects how the engine works (not just how it's drawn).
4. Open a PR per the contribution workflow in the root `README.md`.

---

*Documents the editable architecture diagram conventions for the [Claude ServiceNow Architecture Engine](https://github.com/farstic/claude-servicenow-live) v2.6.*
