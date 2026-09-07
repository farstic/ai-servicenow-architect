# ARC-00-S12 — the interactive half, for the owner's sitting

Everything below needs a terminal, a workspace-trust decision, or a Claude Code session. None of it was
simulated. Roughly 30–40 minutes. **Use one Claude Code binary for the whole sitting** — alternating
2.1.214 and 2.1.258 flips `migrationVersion` in `~/.claude.json` on every switch (`03` §F S-21).

## Setup (once)

```sh
claude plugin marketplace add git@github.com:farstic/snowarch-spikes-marketplace.git
mkdir -p ~/spike-runs/s12 && cd ~/spike-runs/s12 && git init
```

## S-14a — is the `sensitive` field masked?

```sh
claude plugin install servicenow-server@snowarch-spikes --scope project
```
Answer the prompts interactively (do **not** pass `--config`). Record, for each of the four fields:
whether the input is echoed or masked, and what the prompt says. `SNOW_PASSWORD` is the one declared
`sensitive: true`. Then repeat the same install from **inside a session** with `/plugin install` and
record whether the dialog differs.

**Keychain budget:** repeat once with a ~3 KB value for `SNOW_PASSWORD` and record whether it is
accepted, truncated, or rejected.

*(Already answered without a dialog: the non-sensitive options land in `~/.claude/settings.json` at user
scope, mode 0644; the sensitive one goes to the macOS keychain item `Claude Code-credentials`.)*

## S-14b — how many dialogs on the first session?

Start `claude` in `~/spike-runs/s12` for the first time. **Count every modal** until the prompt is
usable, and compare with the S-01 count for the monorepo path. Then `/mcp` — does `servicenow` appear,
and with what tool prefix? Record the prefix **verbatim** (`01` §16 expects
`mcp__plugin_servicenow-server_servicenow__…`).

## S-14c — what does a blank optional field become?

Two steps, in this order. The plugin path starts the server in **set A (five tools)** — the plugin's
`.mcp.json` passes no `STUB_CONFIGURED` — so `snow_probe_env_read` does not exist yet and asking for it
first returns "Unknown tool".

1. Ask Claude to call **`snow_core_instances_reload`** (set A). It flips the process to set B for life.
2. Then ask Claude to call **`snow_probe_env_read`**. It prints names and lengths only. Record the
   `SNOW_OPTIONAL` line: `unset`, `(set, empty string)`, or `LITERAL PLACEHOLDER — not substituted: …`.

## S-14d — does a 12 KB `additionalContext` survive?

```sh
claude plugin install architect-engine@snowarch-spikes --scope project
claude --debug
```
Search the debug output for `S14D-BEGIN` and `S14D-END`. Record the byte count on both markers **at
startup**, then after `/compact`, then on `claude --resume`. If `S14D-END` is missing, the last `S14D`
line number that arrived is where it truncated.

## S-14e — the teammate path

On a second machine (the Ubuntu VM once it is logged in), clone a project whose `.claude/settings.json`
carries `extraKnownMarketplaces` + `enabledPlugins`, start `claude`, and record whether both plugins
install and whether the `userConfig` dialog appears.

## Cleanup

```sh
claude plugin disable servicenow-server@snowarch-spikes --scope local
rm -f .claude/settings.json
claude plugin uninstall servicenow-server@snowarch-spikes
claude plugin uninstall architect-engine@snowarch-spikes
claude plugin marketplace remove snowarch-spikes
rm -rf ~/.claude/plugins/cache/snowarch-spikes ~/spike-runs/s12
```
