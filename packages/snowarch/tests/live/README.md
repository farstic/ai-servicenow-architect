# Live E2E — the owner's sitting

**Not run by the agent.** These cases need real credentials on a real PDI; the agent never holds
instance credentials. Everything here is exact so it can be executed without invention.

Run with `RUN_LIVE_E2E=1`; without it the live suite skips. Nothing in CI touches the network.

## ARC-04-S07 criterion 4 — the §2.2 capture chain end to end

**Build under test:** `arc-04/server` @ `8ff81ba`.

**What the unit tests already prove** (`tests/tools/update-set-capture.test.ts`, 16 cases): the exact
request sequence of both tools, the refusals, the absence of `is_default`, and that no username reaches
a response. **What only a live run can prove** is the platform fact underneath: that a REST write, made
after the preference is set, actually lands in that update set.

### Setup

A PDI, an instance in the store at preset `pdi-developer`, and nothing else open in the UI (so a stray
default update set cannot mask the result).

### The run

```
1  snow_us_active_update_set_ensure { "name": "[LIVE E2E] capture" }
   → action: "created" | "existing_found", update_set.sys_id = <SET>
   → next:   snow_us_capture_target_set { update_set_sys_id }

2  snow_us_capture_target_set { "update_set_sys_id": "<SET>" }
   → action: "created" | "updated", preference_sys_id, user_sys_id
   → NO username anywhere in the response

3  snow_scr_script_include_add { "name": "LiveE2ECaptureProbe", "script": "// probe" }
   → sys_id = <SI>

4  snow_us_update_set_preview { "sys_id": "<SET>" }
```

### The evidence to record

Step 4 must show a **`sys_update_xml` row whose `name` contains `LiveE2ECaptureProbe`**. That row is
the whole point: it is what proves REST capture followed the preference rather than the UI default.

Record, redacted per the ARC-00 rules (no instance URL, user name, password or token — key names only,
values as `set (len n)`; record counts, table names and tool names are not secrets):

- the four responses, with the `sys_update_xml` row's `name` and `action` fields;
- whether step 2 reported `created` or `updated` (both are correct — it depends on whether the account
  had a preference already);
- **the negative control:** before step 2, create a second Script Include and confirm it does *not*
  appear in `<SET>`. Without that, a run where the UI default happened to be `<SET>` looks identical
  to a working one.

### Teardown

Delete the Script Include(s) and complete the update set. `sys_update_xml` DELETE rows are expected and
normal — see the platform field notes, section 7.

### Verdict

Append to this file:

- `ARC-04-S07 criterion 4: CONFIRMED — the probe appears in <SET> after capture_target_set and not before`, or
- `ARC-04-S07 criterion 4: REFUTED — <what happened>`.

If refuted, the likely cause is that the instance does not honour `sys_user_preference` for this
account's REST session. That contradicts the platform field notes, section 1, and would need that note
note revisited before the tool's description is trusted.
