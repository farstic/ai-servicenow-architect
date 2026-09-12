> **Redaction rules (ARC-00 STORIES.md conventions).** No instance URLs, usernames, passwords, tokens or
> `~/.claude.json` contents appear in a spike record — **key names only, values as `set (len n)`**.
> Paths are `~`-relative. Screenshots are cropped to the dialog.
> A spike that runs on several operating systems carries **one *Observed* block per OS and one verdict line**.

# S-14b — Plugin-bundled stdio server and the approval prompt

**Run by:** ARC-00-S12 · **Verdict consumed by:** ADR-0006/0008 → entry gate of ARC-06-S01

**Status: ANSWERED on 2.1.258 — the plugin server appears under **Built-in MCPs** with **no approval
dialog at all**, and the per-tool permission dialog shows a **display name**, never the `mcp__…`
identifier that permission rules are written against.**

## Assumption

> A plugin-bundled stdio MCP server starts without an additional per-server approval prompt (the docs say it starts automatically when the plugin is enabled; the coupling lens said "same approval as project .mcp.json")

**Impact if false:** §B (roadmap channel) · **Evidence so far (from `03`):** (none recorded in `03` §B)

## Environment

| Field | Value |
|---|---|
| macOS | **26.5.2** build **25F84**, arm64 · Node v24.16.0 · git 2.39.5 |
| Claude Code | **2.1.258** only. One binary for the whole sitting, deliberately: `03` §F **S-21** records that alternating 2.1.214 and 2.1.258 flips `migrationVersion` in `~/.claude.json` on every switch. Verified unchanged at **14** before and after every step here. |
| Fixture | `farstic/snowarch-spikes-marketplace` (private, throwaway) — marketplace `snowarch-spikes` with plugins `architect-engine` and `servicenow-server`, commit `fdfb49f` |
| Runners | `ubuntu-22.04`, `macos-latest`, `windows-latest` (S-19 only), Claude Code **2.1.263** installed from npm, **not logged in**, no TTY |
| Ubuntu VM · Windows VM | `NOT RUN — awaiting the owner's claude login in arc00-ubuntu` · `DEFERRED — Windows VM pending (owner input #2)` |
| Date | 2026-09-06 (day 1 of the five-working-day time-box) |

**What was written to this machine and what was cleaned up.** `claude plugin marketplace add` registered
the marketplace in `~/.claude/plugins/known_marketplaces.json` and cloned it to
`~/.claude/plugins/marketplaces/snowarch-spikes`; `claude plugin install --scope project` wrote
`enabledPlugins` into the scratch project's `.claude/settings.json`, an entry in
`~/.claude/plugins/installed_plugins.json`, a cache copy under `~/.claude/plugins/cache/`, and the
non-sensitive `userConfig` values into `~/.claude/settings.json`. All of it was removed afterwards:
`plugin uninstall`, `marketplace remove`, the cache directory deleted by hand, the scratch project
deleted. What remains are two **empty** objects the CLI created and then emptied —
`pluginConfigs {}` and `extraKnownMarketplaces {}` in `~/.claude/settings.json` — left in place because
they are Claude Code's own bookkeeping. `~/.claude.json` `migrationVersion` unchanged at 14 throughout.

## Procedure

**Check that retires it (from `03`):** Count dialogs on the first session after `/plugin install`.

## Observed

### `claude mcp` does not see a plugin-bundled server at all

With the plugin installed and enabled at project scope, from **inside** the project:

```
$ claude mcp get servicenow
No MCP server named "servicenow". Configured servers: claude.ai Glovo, claude.ai Gmail,
claude.ai Google Calendar, claude.ai Google Drive, claude.ai Notion, claude.ai Postman,
claude.ai SlidesGPT, context-mode
$ echo $?
1
```

`claude mcp list` likewise shows **no** `servicenow` row. The server is real — `claude plugin list --json`
prints its full `mcpServers` block, `${CLAUDE_PLUGIN_ROOT}` and `${user_config.*}` placeholders intact —
but it lives in the plugin registry, not the MCP registry the `claude mcp` subcommands read.

**Why that matters beyond this spike.** ARC-08's doctor was told (architect ruling, 2026-09-06) never to
shell out to `claude mcp …` for reads. If the channel were ever re-opened, that ruling becomes
*load-bearing rather than merely tidy*: a doctor built on `claude mcp get` would report a healthy
plugin-channel install as "server not configured".

### Owner sitting, 2026-09-07 — Claude Code 2.1.258 *(source: owner sitting 2026-09-07, relayed by the architect)*

After `/plugin configure` and `/reload-plugins`:

> `Reloaded: 1 plugin · 0 skills · 6 agents · 0 hooks · **1 plugin MCP server** · 0 plugin LSP servers`
>
> `/mcp` → **`plugin:servicenow-server:servicenow` · ✔ connected · 5 tools`** — under the
> **"Built-in MCPs"** section. **No approval dialog.**

**Two findings, and the second is the one that bites.**

1. **A plugin-bundled server is not approved like a project server.** It is filed under *Built-in* MCPs
   and connects with no per-server prompt — where a `.mcp.json` project server on the same version does
   prompt unless pre-seeded (S-01 `control` = 2 dialogs). The plugin channel therefore removes a dialog
   the monorepo channel has to pre-seed away. **That is a genuine point in the plugin channel's favour**,
   and it should be recorded as such alongside S-14a's finding against it.

2. **The permission dialog never shows the rule identifier.** In manual mode, a mutating tool produced:

   > Tool use · `plugin:servicenow-server:servicenow — Snow Core…  Tool: (MCP)` · About …: *Stub: create a
   > record (mutates).* · Do you want to proceed? 1. Yes 2. No

   The **display name** and a truncated tool title — and **never** the `mcp__…` identifier. A user who
   wants to write an `allow` rule for what they just approved cannot read it off the dialog, and neither
   can the person writing the documentation.

**The identifier itself, read from the model's own tool list rather than inferred** *(source: owner sitting 2026-09-07, relayed by the architect)*:

```
mcp__plugin_servicenow-server_servicenow__snow_probe_env_read
```

**Format: `mcp__plugin_<plugin>_<server>__<tool>`** — exactly what `01` §16 predicted. **CONFIRMED.** So
the contract value ARC-05 generates rules against is known, and the two surfaces disagree by design: the
**rule** is written against `mcp__plugin_servicenow-server_servicenow__*`, while the **dialog** shows
`plugin:servicenow-server:servicenow`. Documentation that tells a user "approve the tool named X" cannot
use the identifier, and documentation that tells them "write a rule for what you approved" cannot use the
dialog. Both strings have to appear, side by side, in ARC-06's text.

**And every generated permission rule differs between the two channels.** On the monorepo path the same
tool is `mcp__servicenow__snow_probe_env_read`; on the plugin path it carries the `plugin_<plugin>_`
infix. A rule file generated for one channel matches nothing on the other — which is a migration cost the
D-06 hedge has to carry if the channel is ever switched after release.

### INTERACTIVE-PENDING (superseded by the row above; retained for the procedure)

The dialog count on the first session after install, and the comparison with S-01's count, need a TTY
and the workspace-trust decision — the same constraint recorded in ARC-00-S04, and the same reason:
accepting trust writes `hasTrustDialogAccepted` into `~/.claude.json`, which these spikes must not do.
Steps for the owner are in `INTERACTIVE.md`.

## Verdict

`S-14b: PARTIAL — a plugin-bundled server is invisible to `claude mcp get` and `claude mcp list` (exit 1, "No MCP server named servicenow") although `claude plugin list --json` shows it fully. **The dialog count is interactive-pending**`

## Evidence

- `farstic/snowarch-spikes-marketplace` @ `fdfb49f` — the fixture.
- Command transcripts are quoted inline above; every exit code was measured **without a pipe**
  (a piped `$?` reports the last command in the pipeline, not `claude` — that mistake was made twice
  during this sitting and corrected both times).
