> **Redaction rules (ARC-00 STORIES.md conventions).** No instance URLs, usernames, passwords, tokens or
> `~/.claude.json` contents appear in a spike record — **key names only, values as `set (len n)`**.
> Paths are `~`-relative. Screenshots are cropped to the dialog.
> A spike that runs on several operating systems carries **one *Observed* block per OS and one verdict line**.

# S-12 — Middle-wildcard permission globs

**Run by:** ARC-00-S05 · **Verdict consumed by:** ARC-05-S07 (globs vs explicit list), ARC-05-S11

**Status: CONFIRMED on 2.1.258, answered non-interactively. The sizing below still matters more than the yes/no answer.**

## Assumption

> Permission allow rules with a middle wildcard (`mcp__servicenow__snow_*_read`) are honoured

**Impact if false:** L · **Evidence so far (from `03`):** `docs:permissions`: globs accepted after the literal `mcp__<server>__` prefix (examples show trailing `*`)

## Environment

| Field | Value |
|---|---|
| macOS | **26.5.2** build **25F84**, arm64 · Node v24.16.0 |
| Claude Code | **2.1.258** only for this sitting (S-21: alternating versions flips `migrationVersion`). `~/.claude.json` verified unchanged at 14. |
| Fixture | `snowarch-spikes` committed `.claude/settings.json` — `allow` `["Bash(./snowarch doctor*)", "mcp__servicenow__snow_core_capabilities_read", "mcp__servicenow__snow_core_instances_reload", "mcp__servicenow__snow_*_read"]`, `ask` `["mcp__servicenow__snow_core_record_add"]` |
| Tool set | the **real** 394-tool `dist/server.js` from the ARC-00-S08 fixture, enumerated over a live handshake |
| Date | 2026-09-06 |

## Procedure

**Check that retires it (from `03`):** Add the rule; call a read tool; observe whether a prompt appears.

Three sessions from `run.sh`: the committed settings (glob present), and the `trailing` control in which
`mcp__servicenow__snow_*_read` is replaced by `mcp__servicenow__snow_core_*`. The control isolates the
*middle*-wildcard question from "do globs work at all".

## Observed

### Non-interactively: the sizing, which decides ARC-05's answer either way

Against the real 394-tool server (full working in the S-18 record):

- `mcp__servicenow__snow_*_read` would match **92** tools — **34%** of the 269 non-mutating ones.
- Adding `snow_*_index` and `snow_*_query` reaches **205 of 269**.
- **64 tools match none of the three**, and 34 of those plainly change state.
- The glob matches **nothing** mutating, so it fails safe.

**So the yes/no answer to this spike does not settle ARC-05's design.** If middle wildcards work, ARC-05
still needs three of them *plus* explicit entries for a 64-tool tail. If they do not, the fallback is
**269** explicit allow entries — close to `03`'s "~250" estimate, and now measured rather than guessed.

### Answered without a session, both directions

`claude -p --mcp-config <file> --settings <rules> --strict-mcp-config` reaches a project stdio server
with no trust dialog and no per-server approval, and — proven by control below — it **honours permission
rules rather than auto-approving**. With `allow: ["mcp__servicenow__snow_*_read"]` as the only rule:

```
snow_core_capabilities_read   -> RAN       "stub: snow_core_capabilities_read ok"
snow_core_records_query       -> BLOCKED   "permission … hasn't been granted in this session"
```

**The middle wildcard is honoured on 2.1.258.** The control that makes this evidence rather than
coincidence: with **no** allow rule at all, the same route blocks a plain `Bash` command
(*"This command requires approval"*, nothing executed), so `-p` is not silently approving everything.
Three states are distinguishable — `allow` runs, `ask` blocks, absent blocks.

**The caveat, stated rather than glossed:** headless *blocked* is not interactive *prompted*. What is
proven is the **matching** semantics, which is what this spike asks. Confirming that a non-match produces
a visible prompt rather than a silent denial is one minute of an interactive session and stays in the
sitting — but **ARC-05's design decision no longer depends on it**.

## Verdict

`S-12: CONFIRMED **on 2.1.258** — a middle-wildcard glob works: `mcp__servicenow__snow_*_read` allows `snow_core_capabilities_read` and does not allow `snow_core_records_query`, proven headlessly with a no-rule control showing `-p` does not auto-approve. But **one glob covers only 92 of 269 non-mutating tools (34%)**, three globs reach 205, and **64 need explicit per-tool rulings**, so ARC-05 needs a hybrid rather than a single glob`

## Evidence

- `spikes/S-18-permissions-ask-auto-mode/run.sh` — prepares any of the three variants and prints the checklist.
- `spikes/OWNER-SITTING.md` Part C — the interactive steps.
- The 394-tool list was enumerated from `spikes/S-15-npm-ci/fixture/packages/snowarch/dist/server.js`.
