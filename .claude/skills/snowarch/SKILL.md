---
name: snowarch
description: Status, instance setup and health check for the AI ServiceNow Architect. Use `/snowarch status` (or when the user types Status) to report the authoritative Mode line from the doctor; `/snowarch setup-instance` to add a ServiceNow instance, which hands off to the user's terminal because credentials never pass through chat; `/snowarch doctor` to run the full health check and relay its failures with their remedies.
argument-hint: "status | setup-instance [--resume] | doctor"
allowed-tools: Bash(./snowarch doctor*), Bash(node tools/snowarch/bin/snowarch.mjs doctor*), Bash(cat .local/bootstrap-state.json), Read, mcp__servicenow__snow_core_instances_reload, mcp__servicenow__snow_core_capabilities_read, mcp__servicenow__snow_core_instances_index, mcp__servicenow__snow_core_current_instance_read
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

Also runs when the user simply types `Status` — the same branch, the same output.

1. Run `./snowarch doctor --quick --json`. On Windows in Git Bash the command is the same; if
   `./snowarch` is not executable, run `node tools/snowarch/bin/snowarch.mjs doctor --quick --json`.
   `--quick` every time: a session must never answer from the cache alone.
2. **If it succeeds:** print these lines, in this order, filling each from the JSON key named in
   brackets. Line 1 is `modeLineDetailed` **verbatim, as the very first line of the reply** — on
   its own, with nothing before it and no decoration of any kind: no bold, no heading, no code
   fence, no "Mode line:" label. It is quoted, not presented.

```
Mode: live — pdi (pdi) · preset pdi-developer · WRITE=on CMDB_WRITE=on SCRIPTING=on ATF=on NOW_ASSIST=off FLUENT=off · 398 tools (contract)   [modeLineDetailed]
Engine: snowarch 2.0.0 · tag v2.0.0 · contract a1b2c3d                                       [engine.version, engine.tag, engine.contractSha]
Docs: vendor/ServiceNowDocs @ ba513f2 (australia) · sparse · citations checked: 181 | dead: 0 [engine.docs]
Roster: 28 skills / 9 agents                                                                 [engine.roster]
Capabilities: docx yes (python3) · PDF QA no · draw.io yes · Mermaid no                       [engine.capabilities]
Instances: pdi (pdi, custom, default) · uat (test, read-only)                                 [server.instances]
Doctor: 41 ok, 1 warn, 0 fail — quick run 2026-09-10 10:00 · full report: ./snowarch doctor   [summary, ranAt, options.quick]
```

   A line whose key is `null` is **omitted**, never guessed. Two are routinely null on a quick run,
   because the checks that fill them spawn a process or walk the corpus and are outside the quick
   subset: `engine.capabilities` and the citation counts in `engine.docs`. When either is missing,
   say so once, at the end:

   `Capability packs and citation counts are not probed on a quick run — ./snowarch doctor reports them.`

   `Instances:` is omitted entirely in design-only.
3. **When `summary.fail > 0`,** add one line per failing check after the seven — id, title and its
   remedy — and then, when `summary.fixable > 0`:
   `Run ./snowarch doctor --fix for the fixable ones (<summary.fixable>).`
   Never list WARNs one by one; that is `/snowarch doctor`.
4. **If the command exits 3** ("not at the repository root"), print the `cd` remedy from its own
   output and nothing else about mode.
5. **If the doctor cannot run at all,** read `.local/bootstrap-state.json` and print
   `Mode: <mode> — from bootstrap state (<updatedAt>); doctor unavailable, <cause>`, naming the
   cause you actually observed and no other:
   - Node is absent or below 20 → `until Node 20+ is installed`
   - Node is fine but `./snowarch` is not there → `the launcher is not installed — run ./bootstrap.sh (Windows: bootstrap.cmd)`
   - it ran and failed → `the doctor exited <code>`

   Never state a cause you did not check. A remedy for the wrong problem costs the user the time
   they spend following it.

   Then print `Docs: pin <docs.pin>` and `Roster: <n> skills / <n> agents`, counted by listing
   `.claude/skills/*/SKILL.md` and `.claude/agents/*.md`. The roster is the ONE fact this skill may
   derive, and only by listing directories.
6. **If there is no state file either:** print
   `Mode: unknown — this checkout has not been bootstrapped; run ./bootstrap.sh (Windows: bootstrap.cmd)`.
7. **If the JSON does not parse:** print
   `Mode: unknown — doctor output unreadable; run ./snowarch doctor in a terminal`.
8. **On Windows without Git for Windows** the Bash tool is unavailable, so say:
   `On Windows without Git for Windows I cannot run ./snowarch from here — run snowarch.cmd doctor in PowerShell and paste the Mode line.`
9. **Never infer the mode** from `~/.claude.json`, from `/mcp`, from memory, or from which tools
   appear in the tool list. A disabled family is still advertised, so the tool list says nothing
   about mode. The doctor's line is the only answer; if it cannot run, say the mode is unverified
   rather than guessing.

## setup-instance

Collects every NON-SECRET choice here, hands you one command to run in your own terminal, and
picks the session back up with `--resume`. The credential never enters this conversation, and this
skill cannot type it for you: `./snowarch instance …` is deliberately absent from `allowed-tools`,
because the wizard needs a real terminal to mask what you type.

1. **Prerequisite gate.** Run `./snowarch doctor --json --section prereqs` and read four fields.

   <!-- The field contract, agreed with ARC-08-S01 and fixed 2026-09-10. The doctor produces it;
        this skill is its only consumer today:
          os          "darwin" | "linux" | "win32"
          shell       "bash" | "zsh" | "powershell" | "cmd" | "unknown"   (the parent process)
          node.ok     boolean          node.version  string, e.g. "22.14.0"
          deps.ok     boolean          — the server's runtime dependencies are installed
          mode.toggle "enabled" | "disabled" | "absent"   (from .claude/settings.local.json)
          store.exists boolean         — this checkout already has an instance store
        UNTIL ARC-08-S01 SHIPS the section does not exist. If the command exits non-zero, or its
        output is not JSON, do not guess: read `.local/bootstrap-state.json` (granted for exactly
        this), take the mode from it, and print BOTH command spellings at step 6 rather than
        choosing one from a shell you could not detect. ARC-08-S01 removes this paragraph. -->

   - `node.ok: false` → print, and stop:

     > Node.js 20+ is required for live mode — install it (macOS: brew install node@22 · Windows:
     > winget install OpenJS.NodeJS.LTS · Linux: your distribution's package or nvm), then run
     > /snowarch setup-instance again.

   - `mode.toggle: disabled` — a design-only checkout → print, and stop. **Ask nothing**: the
     wizard asks these same questions in the terminal, and asking them twice is how somebody
     answers carefully and then finds their answers were never used.

     > This checkout is in design-only mode. In your terminal run  ./snowarch mode live  — it
     > installs the server dependencies and starts the instance wizard (same questions as below).
     > Then restart claude: the MCP toggle is read at session start. If you skipped the wizard, run
     > /snowarch setup-instance again after the restart.

   - `deps.ok: false` with `mode.toggle: enabled` → print, and stop:

     > Server dependencies are missing — run ./snowarch doctor --fix in your terminal, then
     > /snowarch setup-instance.

2. **`AskUserQuestion` #1 — Which kind of instance is this?**
   - `PDI (personal developer instance, devNNNNN.service-now.com)`
   - `Development`
   - `Test / UAT`
   - `Production (capped at read-only; raising it is a separate terminal step)`

3. **`AskUserQuestion` #2 — How will it authenticate?**
   - `Basic — username + password (recommended for PDI; nothing to configure on the instance)`
   - `OAuth password grant — legacy ROPC; needs an OAuth API endpoint, client id + secret AND a user password; Security Center hardening can disable it`
   - `Client-credentials grant — not available yet (roadmap); choose Basic`

4. **`AskUserQuestion` #3 — Permission preset?** For PDI / Development / Test:
   - `full — proposed: everything on; you will review each flag with its probe result in the terminal`
   - `pdi-developer — write, CMDB, scripting, ATF; no Now Assist, no Fluent`
   - `read-only`
   - `custom — set the six flags on the review screen`

   For **Production** do not ask: state `read-only (the only wizard option; see set-preset --ack-prod)`
   and move on. A question with one answer is a question that teaches the reader nothing and costs
   them a turn.

5. **In chat, ask for three things.**
   - The **instance URL**: `https://<host>` only — no `/api`, no path, no trailing slash. A bare
     `devNNNNN` is fine; the CLI expands it.
   - A short **label**, matching `^[a-z][a-z0-9_-]{0,31}$`. Propose `pdi`, `dev`, `test` or `prod`
     from the answer to question 1.
   - Whether it becomes this checkout's **default** instance. Propose Yes when `store.exists` is
     false — the first instance in a checkout has nothing to compete with.

6. **Print the hand-off, filling the placeholders from the answers.** The command is the one a user
   would type by hand; nothing here invents an option the CLI does not have.

   ```
   Next step happens in YOUR terminal (credentials never pass through this chat).
   1. Open a terminal at this checkout: <absolute path>
   2. Run:   ./snowarch instance add <label> --url <url> --env <env> --auth <auth> --preset <preset> --default
      (Windows PowerShell/cmd:  snowarch.cmd instance add <label> --url <url> --env <env> --auth <auth> --preset <preset> --default)
   3. The wizard proposes the environment and preset and shows a per-flag review — press Enter to accept, or edit any line.
   4. Type your username and password when prompted (masked; nothing is echoed).
   5. When it prints "Saved instance …", come back here and type:  /snowarch setup-instance --resume
   I will wait. Nothing is written until you confirm in the terminal.
   ```

   Choose the spelling from the prereqs report: `./snowarch …` for `os` `darwin`/`linux`, and on
   `win32` for `shell` `bash`/`zsh` (Git Bash); `snowarch.cmd …` for `powershell`/`cmd`. When the
   shell is `unknown`, print **both**, labelled `Git Bash:` and `PowerShell / cmd:` — a reader can
   tell which shell they are in, and a wrong guess hands them a line that does not run.

7. **Stop.** Do not poll, do not re-run the doctor, do not ask whether it worked. The user comes
   back with `/snowarch setup-instance --resume` or by saying "done".

## setup-instance --resume

Also runs when the user says "done" after the hand-off.

1. Call `mcp__servicenow__snow_core_instances_reload`. If the server is not connected in this
   session, print and stop:

   > The servicenow server is not connected in this session. Run /mcp → servicenow → reconnect (or
   > restart claude), then /snowarch setup-instance --resume.

2. Call `mcp__servicenow__snow_core_capabilities_read`. The unconfigured shape
   (`{ instance: null, mode: "unconfigured", … }`) means the wizard saved nothing — it saves only
   after the probes pass. Print and stop:

   > The wizard did not save an instance (it saves only after the probes pass). Re-run the printed
   > command; the terminal shows why it stopped.

3. Run `./snowarch doctor --json` — the full check, not `--quick` — and print one line built from
   the capabilities result and the doctor's tool count:

   `Mode: live — pdi (pdi) · preset pdi-developer · WRITE=on CMDB_WRITE=on SCRIPTING=on ATF=on NOW_ASSIST=off FLUENT=off · 398 tools`

   The count is whatever the doctor reports. List any doctor FAIL under it with its remedy, and any
   `configWarnings[]` entry (`PRESET_FLAGS_MISMATCH`, `FLAG_DEPENDENCY_VIOLATION`) the capabilities
   call returned.

4. **The S-02 fallback.** The reload result carries `listChangedSent` and `toolsAdvertised`. If it
   says the list was refreshed but this session still cannot call a tool outside the always-present
   five, print:

   > The tool list did not refresh in this session — run /mcp → servicenow → reconnect, then ask
   > again.

5. Close with:

   > Reminder: any write to this instance needs an explicit "write approved" from you in this
   > conversation (§2.1). Before any configuration write I set the update-set capture target
   > (§2.2).

**Prohibitions.** This skill never asks for a password, a client secret or any other credential —
if you find yourself about to, stop and print the hand-off instead. It never runs
`./snowarch instance …` itself: that needs an interactive terminal, and the grant does not include
it. It never suggests `claude mcp add`, and never edits `~/.claude.json` or `.mcp.json`.

## doctor

Run `./snowarch doctor` — the full check, text output. Relay the summary line
`DOCTOR: n ok, n warn, n fail`, then every FAIL line with its remedy, unchanged. Suggest
`./snowarch doctor --fix` only for the items the report marks fixable; never propose editing a
configuration file by hand instead.

<!-- ARC-08-S09: the doctor's own check ids, --fix semantics and the self-heal report shape extend
     THIS file in place. Never a second skill. -->
