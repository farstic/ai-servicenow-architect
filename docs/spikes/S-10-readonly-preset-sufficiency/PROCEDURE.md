# S-10 — runnable procedure for the owner's live sitting

**Status: not run.** The agent never holds instance credentials, so this is written to be executed
by the owner against a PDI. Everything below is exact; nothing needs to be invented at the keyboard.

**Build under test:** `arc-04/server` @ `7a91986` (the commit that split the SCRIPTING gate).

## The question

After ARC-04-S05, is the `read-only` preset sufficient for the Code Reviewer and Developer *read*
workflows — listing and reading Script Includes, Business Rules, Client Scripts, ACLs, UI Policies,
UI Actions and update sets — with no write flag at all?

The unit half is already answered and is CI-enforced: `tests/tools/gate-split.test.ts` derives the
two families from the registered catalogue (35 tools) and asserts, per tool, that reads pass and
writes refuse under three flag states. What this sitting adds is the only thing a unit test cannot:
that a real instance returns real records through those paths.

## Fixture

Write this to `<checkout>/.local/instances.json`, mode 0600, replacing the two credential values
and the instance host. Nothing else changes between the two runs — only `preset`.

```json
{
  "version": 1,
  "defaultInstance": "pdi",
  "instances": {
    "pdi": {
      "url": "https://devXXXXX.service-now.com",
      "environment": "pdi",
      "auth": { "method": "basic", "username": "<user>", "password": "<password>" },
      "preset": "read-only",
      "toolPackage": "full",
      "maxRecords": 100,
      "prodWriteAck": false
    }
  }
}
```

```bash
chmod 600 .local/instances.json && chmod 700 .local
```

## Run A — `preset: "read-only"`

Start Claude Code in the checkout and confirm the startup line reads
`store: project (<checkout>/.local/instances.json) — instances: pdi (pdi, read-only, default)`.

Expected per tool — **every read returns records; every write refuses**:

| Tool | Expected |
|---|---|
| `snow_scr_script_includes_index` | records |
| `snow_scr_script_include_read` | one record, script body included |
| `snow_scr_business_rules_index` · `snow_scr_business_rule_read` | records |
| `snow_scr_client_scripts_index` · `snow_scr_client_script_read` | records |
| `snow_scr_acls_index` · `snow_scr_acl_read` | records |
| `snow_scr_ui_policies_index` · `snow_scr_ui_policy_read` | records |
| `snow_scr_ui_actions_index` · `snow_scr_ui_action_read` | records |
| `snow_scr_changesets_index` · `snow_scr_changeset_read` | records |
| `snow_us_update_sets_index` · `snow_us_current_update_set_read` | records |
| `snow_us_update_set_preview` · **`snow_us_update_set_export`** | a summary — this one used to need SCRIPTING |
| `snow_scr_script_include_add` | `Error: Write operations are disabled for instance "pdi" (preset read-only). Run: ./snowarch instance set-preset pdi pdi-developer (Code: WRITE_NOT_ENABLED)` |
| `snow_us_update_set_add` | same refusal |

Then the validation suite: **T-01 … T-18** from `VALIDATION-TESTS.md`, in order. Record for each
whether it completed without needing a write flag, and where one was needed, which tool asked.

## Run B — `preset: "pdi-developer"`

Change only `"preset"` in the fixture, call `snow_core_instances_reload` (no restart), and re-run
T-01 … T-18. Every write above should now succeed.

## What to record

Append to `README.md` in this folder, with a verdict line in the ARC-00 format:

- `S-10: CONFIRMED — read-only is sufficient for the read workflows`, or
- `S-10: REFUTED — <tool> required <flag> for a read workflow`, naming each case.

Per the ARC-00 redaction rules: no instance URL, username, password or token in the record — key
names only, values as `set (len n)`. Record counts and tool names are not secrets.

## If it is refuted

The failure mode to expect is a read tool that reaches a *write* endpoint internally. The remedy is
to move that tool from the read set to the write set in both `tests/tools/gate-split.test.ts` and the
dispatcher — the test's completeness check means the classification cannot be changed in only one
place without failing.
