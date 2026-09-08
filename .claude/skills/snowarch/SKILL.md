---
name: snowarch
description: Status, instance setup and health check for the AI ServiceNow Architect. Use `/snowarch status` (or when the user types Status) to report the authoritative Mode line from the doctor; `/snowarch setup-instance` to add a ServiceNow instance, which hands off to the user's terminal because credentials never pass through chat; `/snowarch doctor` to run the full health check and relay its failures with their remedies.
argument-hint: "status | setup-instance [--resume] | doctor"
allowed-tools: Bash(./snowarch doctor*), Bash(node tools/snowarch/bin/snowarch.mjs doctor*), Bash(cat .local/bootstrap-state.json), Read
metadata:
  version: 2.0.0
---

# /snowarch

## Triggers

**Keywords:** snowarch, status, mode, doctor, setup instance, add instance, health check, bootstrap
state, capability flags, which instance.

**Fires:** On demand, when the user types `/snowarch <sub-command>` — and, model-invoked, when the
user types the plain word `Status`, which `CLAUDE.md` §2 routes here.

**Not this skill:** it configures and reports; it does not design. A ServiceNow design question goes
to the roster. It never calls an MCP tool and never asks for a credential.

The first word of the arguments selects the sub-command (`status` when none is given): `status`,
`setup-instance` or `doctor`. `setup-instance` also accepts `--resume`.

## status

Also runs when the user simply types `Status`.

1. Run `./snowarch doctor --quick --json`. On Windows in Git Bash the command is the same; if
   `./snowarch` is not executable, run `node tools/snowarch/bin/snowarch.mjs doctor --quick --json`.
2. **If it succeeds:** print `report.modeLine` **verbatim as the very first line of the reply** —
   on its own, with nothing before it and no decoration of any kind: no bold, no heading, no code
   fence, no "Mode line:" label. It is quoted, not presented. Then the engine
   version, the docs pin, the roster (`28 skills / 9 agents`) and the capability flags in force.
   After that, report the loaded engagement, the release family from `vendor/ServiceNowDocs`, and
   any drift between recent work and the configured specialists.
3. **If the doctor cannot run:** read `.local/bootstrap-state.json` and print
   `Mode: <mode> — from bootstrap state; doctor unavailable, <cause>`, naming the cause you
   actually observed and no other:
   - Node is absent or below 20 → `until Node 20+ is installed`
   - Node is fine but `./snowarch` is not there → `the launcher is not installed — run ./bootstrap.sh (Windows: bootstrap.cmd)`
   - it ran and failed → `the doctor exited <code>`
   Never state a cause you did not check. A remedy for the wrong problem costs the user the time
   they spend following it.
4. **If neither exists:** print
   `Mode: unknown — this checkout has not been bootstrapped; run ./bootstrap.sh (Windows: bootstrap.cmd)`.
5. **Never infer the mode** from `~/.claude.json`, from `/mcp`, from memory, or from which tools
   appear in the tool list. A disabled family is still advertised, so the tool list says nothing
   about mode. The doctor's line is the only answer; if it cannot run, say the mode is unverified
   rather than guessing.

## setup-instance

1. **Prerequisite gate.** Run `./snowarch doctor --json --section prereqs`. If Node is below 20 or
   the server dependencies are missing, print exactly:

   > Node.js 20+ is required for live mode — install it (macOS `brew install node@22`; Windows
   > `winget install OpenJS.NodeJS.LTS`; Linux distro package or nvm), then `/snowarch setup-instance`
   > again.

   and stop.
2. Ask the user, in plain chat, for **the label and the instance URL only**. The instance kind, the
   authentication method and the preset are proposed by the terminal wizard, which shows them for
   review before anything is written.

   <!-- ARC-07-S09: AskUserQuestion ×3 (instance kind; auth method; preset), URL + label in chat -->
3. **This skill never asks for a password, token or client secret; if you are asked for one here,
   stop.** Secrets are typed into the terminal, masked, and never echoed.
4. Print the hand-off exactly in this shape, with the label, the URL and the checkout path
   substituted:

   ```
   Next step happens in YOUR terminal (credentials never pass through this chat).
   1. Open a terminal at this checkout: <absolute path>
   2. Run:   ./snowarch instance add <label> --url <url> --default
      (Windows PowerShell/cmd:  snowarch.cmd instance add <label> --url <url> --default)
   3. The wizard proposes the environment and preset and shows a per-flag review — press Enter to accept, or edit any line.
   4. Type your username and password when prompted (masked; nothing is echoed).
   5. When it prints "Saved instance …", come back here and type:  /snowarch setup-instance --resume
   I will wait. Nothing is written until you confirm in the terminal.
   ```

5. **`--resume`.** Run `./snowarch doctor --quick --json` and print the Mode line, then confirm what
   is now configured.

   <!-- ARC-07-S09: snow_core_instances_reload, snow_core_capabilities_read, S-02 fallback text -->

6. Close with the reminder: writes need an explicit "write approved" message (§2.1), and §2.2 sets
   the update-set capture target before any configuration write. Both are stated in full in
   `.claude/rules/00-mode-and-mcp-gate.md`, which is always loaded.

## doctor

Run `./snowarch doctor` — the full check, text output. Relay the summary line
`DOCTOR: n ok, n warn, n fail`, then every FAIL line with its remedy, unchanged. Suggest
`./snowarch doctor --fix` only for the items the report marks fixable; never propose editing a
configuration file by hand instead.

<!-- ARC-08-S09: the doctor's own check ids, --fix semantics and the self-heal report shape extend
     THIS file in place. Never a second skill. -->
