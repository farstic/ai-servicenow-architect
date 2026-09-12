> **Redaction rules (ARC-00 STORIES.md conventions).** No instance URLs, usernames, passwords, tokens or
> `~/.claude.json` contents appear in a spike record — **key names only, values as `set (len n)`**.
> Paths are `~`-relative. Screenshots are cropped to the dialog.
> A spike that runs on several operating systems carries **one *Observed* block per OS and one verdict line**.

# S-18 — `permissions.ask` in auto mode

**Run by:** ARC-00-S05 · **Verdict consumed by:** ARC-05-S07, ARC-05-S11

**Status: CONFIRMED on 2.1.258, with its control.** An `ask` rule prompts in **both** auto and manual
mode and the dialog names the rule; in the `no-ask` control the same mutating call **executes with no
prompt**. Two non-interactive findings alongside it change what ARC-05 has to generate, and one is a hole
in the §2.1 write gate as currently specified.

## Assumption

> Generated `permissions.ask` rules for every `mutates:true` tool in the committed `.claude/settings.json` produce a user prompt in **auto mode** — the built-in starting mode on Pro, Max and Team plans — so the §2.1 "write approved" gate cannot be bypassed by the classifier

**Impact if false:** H (a write without user consent) · **Evidence so far (from `03`):** `docs:permission-modes` "How the classifier evaluates actions": actions matching allow, ask or deny rules resolve immediately, before the classifier; `dontAsk` mode denies ask-rule matches rather than prompting; `bypassPermissions` skips checks

## Environment

| Field | Value |
|---|---|
| macOS | **26.5.2** build **25F84**, arm64 · Node v24.16.0 |
| Claude Code | **2.1.258** only for this sitting (S-21: alternating versions flips `migrationVersion`). `~/.claude.json` verified unchanged at 14. |
| Fixture | `snowarch-spikes` committed `.claude/settings.json` — `allow` `["Bash(./snowarch doctor*)", "mcp__servicenow__snow_core_capabilities_read", "mcp__servicenow__snow_core_instances_reload", "mcp__servicenow__snow_*_read"]`, `ask` `["mcp__servicenow__snow_core_record_add"]` |
| Tool set | the **real** 394-tool `dist/server.js` from the ARC-00-S08 fixture, enumerated over a live handshake |
| Date | 2026-09-06 |

## Procedure

**Check that retires it (from `03`):** Start a session in auto mode in a live checkout; call `snow_core_record_add` and confirm a prompt appears; call a `mutates:false` tool and confirm none does; repeat in `default` and `plan` modes.

`run.sh` next to this file prepares each variant (`default`, `no-ask`, `trailing`) as a fresh
never-trusted clone with `enabledMcpjsonServers` pre-seeded and `env.STUB_CONFIGURED=1` so set B is
advertised and `snow_core_record_add` exists to be called.

## Observed

### Auto mode is selected by a FLAG, not a key sequence — the story asked, and this is the answer

```
$ claude --help
  --permission-mode <mode>   Permission mode to use for the session
                             (choices: "acceptEdits", "auto", "bypassPermissions",
                              "manual", "dontAsk", "plan")
```

So the sitting runs `claude --permission-mode auto`, and no key-sequence hunting is needed. The choice
list also confirms two things `01` §5 relies on: **`auto` exists as a first-class mode**, and so does
**`dontAsk`**, the mode `03` records as *denying* ask-rule matches rather than prompting.

### Finding 1 — the committed glob covers a third of the read tools

Enumerated over a live handshake against the real server (394 tools), classified by the mutating-suffix
list the engine's own §2.1 publishes (`_add` `_modify` `_remove` `_exec` `_close` `_resolve` `_publish`
`_import` `_set` `_assign` `_trigger` `_reconcile`):

| | count |
|---|---|
| tools advertised | **394** |
| mutating by the §2.1 suffix list | **125** |
| non-mutating by that list | **269** |
| of those, matched by the committed `mcp__servicenow__snow_*_read` | **92 (34%)** |
| left needing another rule | **177** — dominated by `_index` (99) and `_query` (14) |

The glob catches **nothing** mutating by accident, which is the safe direction. But **one glob is nowhere
near enough**: even if S-12 confirms that middle-wildcard globs work, ARC-05 needs at least three
(`snow_*_read`, `snow_*_index`, `snow_*_query`) to reach 205 of 269. `03`'s "~250 explicit entries"
estimate for the no-glob fallback is close: the real number is **269**.

### Finding 2 — 64 tools fall outside *both* lists, and 34 of them plainly change state

Neither the §2.1 mutating suffixes nor `_read`/`_index`/`_query` decides these:

```
_validate 4  _export 3  _generate 3  _train 3  _switch 2  _annotate 2  _schedule 2  _complete 2
_retire 2  _categorize 2  _test 2  _send 2  _bulk 2  _track 2  _configure 2  … and 19 singletons
```

**34 of the 64 plainly change instance state by ordinary meaning** — among them
`snow_cat_request_approve`, `snow_cat_request_reject`, `snow_deploy_deployment_rollback`,
`snow_kb_knowledge_article_retire`, `snow_itam_asset_retire`, `snow_tsk_task_complete`,
`snow_scr_changeset_commit`, `snow_ntf_attachment_upload`, `snow_ntf_emergency_broadcast_send`,
`snow_intg_event_fire`, `snow_core_instance_switch`, `snow_usr_user_group_unassign`,
`snow_inc_work_note_annotate`, `snow_cfg_set_properties_bulk`.

**This is a hole in the write gate as currently specified.** CLAUDE.md §2.1's prose is already right —
*"A suffix that is not on the list does not exempt the call"* — but a generated `ask` block built from
the suffix list would **miss all 34**, and S-18's whole purpose is to make §2.1 mechanical rather than
prose. The `mutates` flag ARC-04 adds to the contract has to be set per tool from the tool's own
behaviour, **not derived from its name**; the suffix list is a starting heuristic and this record is the
measurement of how far it falls short. (No `mutates` field exists in the server today — verified: `git
grep mutates` in the source tree returns nothing — so ARC-04 is authoring it from scratch and can do
this correctly first time.)

### Headless: an `ask` rule is **enforced**, not ignored — half of what S-18 exists to show

On 2.1.258, `claude -p` with `ask: ["mcp__servicenow__snow_core_record_add"]`:

```
Claude requested permissions to use mcp__servicenow__snow_core_record_add,
but you haven't granted it yet.                                    -> the call did NOT run
```

Headless there is no one to prompt, so an `ask` rule resolves to a **denial**. That is not the same
observation as "a prompt appears in auto mode" — but it does establish the load-bearing half: **the rule
is evaluated and it blocks the mutating call.** It is not silently ignored, and the classifier does not
wave it through. Controls in the same run: an `allow`-matched tool ran, and a tool with no rule blocked,
so all three states are distinguishable and `-p` is not auto-approving.

### From the owner's sitting, 2026-09-07 *(source: owner sitting 2026-09-07, relayed by the architect)*

- **The session started in `auto mode` on 2.1.258**, and in that mode two `Bash` commands ran with **no
  prompt at all**.
- The banner on **2.1.263** (Ubuntu VM) reads: *"Auto mode is now Claude Code's default permission mode …
  Claude checks each tool call for risky actions and prompt injection before executing, runs the ones it
  assesses as lower-risk, and blocks the rest."*

**Consequence, and it changes the spike's shape:** the **default permission mode differs between the
floor 2.1.214 and 2.1.263**, so S-18's `default` variant means different things per version, and ARC-06's
"what you will see" text is version-dependent. The sitting must record **which mode the session actually
started in**, not assume it.

### Owner sitting Part C, 2026-09-07, Claude Code 2.1.258 — CONFIRMED with its control *(source: owner sitting 2026-09-07, relayed by the architect)*

| Variant | Mode | Tool | Result |
|---|---|---|---|
| `default` (with the `ask` rule) | **auto** | `snow_core_record_add` | **PROMPTED** — declined |
| `default` | **auto** | `snow_core_capabilities_read` | unprompted (allow-listed) |
| `default` | **manual** | `snow_core_record_add` | **PROMPTED**, same wording — declined |
| **`no-ask` control** | **auto** | `snow_core_record_add` | **EXECUTED WITH NO PROMPT** → `stub: would create record` |

The dialog, verbatim:

> **Permission rule `mcp__servicenow__snow_core_record_add` requires confirmation for this tool.**
> `/permissions` to update rules

**The control is what makes this a confirmation.** Without the `ask` rule the same mutating call runs
**silently** in auto mode — so the rule is not decoration, it is the only thing standing between an
agentic session and a write to the instance. That is the §2.1 write-gate's platform-level counterpart and
it belongs in ARC-05's generated rules for every mutating tool.

**Three details worth carrying into ARC-06.**

1. **The dialog names the rule, not just the tool** — `mcp__servicenow__snow_core_record_add` — so on the
   **monorepo path** a user can read the exact allow-rule identifier off the screen. Contrast S-14b: on
   the **plugin path** the dialog shows only the display name `plugin:<plugin>:<server>` and never the
   identifier. The monorepo channel is the more legible one here.
2. **Auto and manual mode produce the same dialog and the same wording** for an `ask`-matched MCP tool.
   The mode difference that matters is elsewhere — auto mode auto-approves *Bash* commands that manual
   mode prompts for (S-16), which is why S-16 must not be read from an auto-mode session.
3. **The trust modal listed only the four `allow` entries and never the `ask` rule.** A user accepting
   trust is shown what will happen *without asking* and not what will *stop and ask*. For ARC-06 that is
   a documentation gap to fill deliberately: the generated `ask` list is the safety story, and the
   platform does not tell the user it exists.

*(A model narration in this run again named the operator's real instance hostname unprompted. No hostname
appears in this record. It is the same failure mode recorded in S-06: asked to explain, the model
furnishes real ambient details it was not given for the task.)*

### INTERACTIVE-PENDING — resolved by the row above

The observation itself: whether the `ask` rule prompts in `auto`, `default` and `plan`, whether the
no-`ask` control lets a mutating call through, the prompt text, and the account plan (auto mode is
plan-dependent). Six short sessions × two binaries. Steps are in `spikes/OWNER-SITTING.md` Part C.

## Verdict

`S-18: CONFIRMED **on 2.1.258** — an `ask` rule prompts in auto mode and in manual mode alike, with its allow-listed control going unprompted in both. But the blocks ARC-05 generates cannot be derived from tool-name suffixes: of 394 tools, 125 mutate by the §2.1 suffix list, 269 do not, and **64 fall outside both lists — 34 of those plainly change state**, so a suffix-derived ask block would leave 34 write tools ungated`

Nothing here retires or fails the assumption. What it does is change the *input* ARC-05 works from: the
`mutates` flag must be per-tool and authored, and the allow side needs three globs plus a per-tool ruling
on a 64-tool tail — not one glob and not a name heuristic.

## Evidence

- `spikes/S-18-permissions-ask-auto-mode/run.sh` — prepares any of the three variants and prints the checklist.
- `spikes/OWNER-SITTING.md` Part C — the interactive steps.
- The 394-tool list was enumerated from `spikes/S-15-npm-ci/fixture/packages/snowarch/dist/server.js`.
