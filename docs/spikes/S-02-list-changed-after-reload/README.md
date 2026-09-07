> **Redaction rules (ARC-00 STORIES.md conventions).** No instance URLs, usernames, passwords, tokens or
> `~/.claude.json` contents appear in a spike record — **key names only, values as `set (len n)`**.
> Paths are not secrets and may be printed verbatim. Screenshots are cropped to the dialog.
> A spike that runs on several operating systems carries **one *Observed* block per OS and one verdict line**.

# S-02 — notifications/tools/list_changed after an instance reload

**Run by:** ARC-00-S10 · **Verdict consumed by:** ARC-04-S04, ARC-07-S09 (`list_changed` fallback text)

**Status: CONFIRMED on 2.1.258, macOS, non-interactively — with a negative control.** After
`snow_core_instances_reload` the newly advertised tools are callable **in the same session**, with no
restart and no `/mcp` reconnect. One operational detail the assumption does not mention is recorded
below. The **2.1.214 floor row is deliberately not run yet** — see Environment.

## Assumption

> After `snow_core_instances_reload` the server's `notifications/tools/list_changed` makes the newly advertised tools callable in the same session (stdio server, default v1 runtime)

**Impact if false:** M · **Evidence so far (from `03`):** `docs:mcp` "Dynamic tool updates": supported; refresh failures keep the previous list (>= 2.1.214); runtime notes mention v2 streams for HTTP servers

## Environment

| Field | Value |
|---|---|
| Machine / snapshot | macOS **26.5.2** build **25F84**, arm64 (the owner's machine) |
| Claude Code | **2.1.258** (`~/.npm-global/bin/claude`, an npm install). **The floor binary `~/.local/bin/claude-2.1.214` was deliberately NOT run**: `03` §F **S-21** records that alternating the two binaries flips `migrationVersion` in `~/.claude.json`, and the owner was reading that value during the sitting's cleanup at the time of this run. The floor row is queued, not skipped. |
| Node | **v24.16.0** · npm 11.13.0 · git 2.39.5 |
| git | _`git --version`_ |
| Shell | _zsh 5.9 / PowerShell 5.1 / cmd_ |
| Date | _YYYY-MM-DD_ |

## Procedure

**Check that retires it (from `03`):** Implement reload in ARC-04; in a session, add an instance from the terminal, call the reload tool, then call `snow_core_capabilities_read` and a read tool without `/mcp` reconnect

Three `claude -p --mcp-config <f> --settings <f> --strict-mcp-config` sessions against the stub, which
advertises **set A (5 tools)** until `snow_core_instances_reload` flips it to **set B (8)** and emits
`notifications/tools/list_changed`. `STUB_CONFIGURED` is left unset so every session starts in set A.
The `allow` list names all three tools, so nothing here is measuring a permission prompt.

**A — the baseline**, ask for the tool list before any reload.
**B — the negative control**, call a set-B tool *without* reloading.
**C — the test**, reload and then call the set-B tool in the same session.

## Observed

### A — before the reload: five tools, and the set-B tool is not among them

```
Count: 5
  mcp__servicenow__snow_core_capabilities_read
  mcp__servicenow__snow_core_current_instance_read
  mcp__servicenow__snow_core_instances_index
  mcp__servicenow__snow_core_instances_reload
  mcp__servicenow__snow_core_status_read
mcp__servicenow__snow_probe_env_read: ABSENT
```

Five is set A exactly, matching S-17's unconfigured advertisement.

### B — the negative control: without a reload it is not callable

```
NOT-AVAILABLE
```

**This is what makes C evidence.** Without it, a successful call after the reload could simply mean the
tool had been available all along.

### C — after the reload, in the same session, with no restart

```
reload result : stub: reloaded (tool set B now advertised)
second call   : succeeded
first line    : snow_probe_env_read (stub)
```

**`notifications/tools/list_changed` works: the new tools are usable immediately, in the same session, with
no restart and no `/mcp` reconnect.** That is the assumption, and it holds.

### The detail the assumption does not mention — and ARC-04 needs it

The session reported that after the reload the tool **appeared but its schema did not**: it arrives as a
**deferred** tool, and the model had to load the schema through `ToolSearch` before it could invoke it.
The call still succeeded within the same turn, so this is a step rather than a barrier — **but it means a
freshly reloaded tool is not instantly *invocable*; it is instantly *discoverable*.**

**Consequence for ARC-04's reload UX:** after `snow_core_instances_reload` the user should be told the new
tools are available rather than expecting them to be silently in hand, and any scripted flow that reloads
and immediately invokes a new tool must tolerate a discovery step. It also means a reload's effect is
invisible to a caller that only inspects the previously loaded tool list.

## Observed

_One block per OS. Paste real output, redacted per the rules above._

## Verdict

`S-02: NOT RUN` — to be replaced by `S-02: CONFIRMED` or `S-02: FAILED → fallback The `/snowarch setup-instance` skill prints "run `/mcp` → servicenow → reconnect"`

## Evidence

- _`logs/<file>` — what it is_
