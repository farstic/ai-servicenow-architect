# ARC-02-S05 → S10 handover — what `docs/MCP-OPERATIONS-GUIDE.md` held

S05 deletes `docs/MCP-OPERATIONS-GUIDE.md` (198 lines). Risk (c) in the S05 story warns that deleting it
before S10 harvests it would lose platform facts. **It does not — measured, not assumed.**

## The check

Every platform fact the guide stated was compared against `docs/nowaikit-field-notes.md`, which S10
owns and rewrites into `docs/PLATFORM-NOTES.md`:

| Fact / token | in the ops guide | in the field notes |
|---|---|---|
| `switch_update_set` only sets `is_default`, does not switch session context | 1 | 1 |
| Direct POST to `sys_update_xml` blocked by `INSUFFICIENT_PRIVILEGES` | 4 | 10 |
| `execute_script` / `execute_background_script` hit non-existent endpoints | 1 | 1 |
| `create_business_rule` leaves `action_insert` / `action_update` false | 1 | 3 |
| `register_event` leaves `event_name` blank | 1 | 2 |
| `create_flow` / `create_flow_action` create empty shells | 1 | 2 |
| `gs.sendEmail()` bypasses `sys_email` on a PDI | 1 | 3 |
| the `sys_user_preference` pre-write sequence | 4 | 5 |

The guide itself said so in two places — "documented in full in `nowaikit-field-notes.md`" — so it was
a **summary of the field notes, not a second source**. Nothing is lost by deleting it, and there is no
content for S10 to merge.

## What the rest of it was, and who owns it now

- §1 "design engine to delivery engine", §2 connection and permission tiers → **`docs/MODES-AND-PRESETS.md`** (S09).
  The tier table is retired vocabulary; S09 restates it as Modes.
- §3 the write-approval gate (§2.1), §4 the update-set capture protocol (§2.2), §5 the two gates in
  sequence, §7 the operator's checklist → **`governance/mcp-protocols.md`** (ARC-05).
- §6 read vs write tool patterns → **`governance/mcp-protocols.md`** (ARC-05) for the gate rules; the
  per-tool behaviours are already field notes.
- §8 "where to next" → obsolete (it pointed at the pre-v3 document set).

## For S10

**No action required from this handover.** S10 rewrites `docs/nowaikit-field-notes.md` into
`docs/PLATFORM-NOTES.md` from the field notes themselves. If S10 wants the guide's prose framing, it is
in git history at the commit before this story: `git show <S05^>:docs/MCP-OPERATIONS-GUIDE.md`.
