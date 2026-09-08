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

---

# ARC-04-S09 — the three defect fixes, criteria 2, 3 and 4

Same standing reason as S07: the agent that wrote these fixes never holds instance credentials, so the
live half is a procedure for the owner's sitting rather than something CI can run. The unit halves are
the gate and are already green — each asserts the **request** the tool built (captured URL, captured
POST body), which is where all three defects lived. What the live run adds is that the platform accepts
those requests and behaves as the grammar predicts.

Run all three inside one `[LIVE E2E]` update set, per S07: `snow_us_active_update_set_ensure { "name":
"[LIVE E2E] ARC-04-S09" }` → `snow_us_capture_target_set { update_set_sys_id }` before any write.

## Criterion 2 — descending sort really sorts descending

```
snow_core_records_query { "table": "incident", "orderBy": "-sys_created_on", "limit": 5 }
```

**Expected.** Five records whose `sys_created_on` values are **non-increasing**.

**Record.** The five `sys_created_on` values in the order returned. Not "it looked sorted" — the whole
defect was that the old grammar returned a plausible-looking list in the wrong order.

**The negative control, and it matters more here than anywhere else.** Also run:

```
snow_core_records_query { "table": "incident", "orderBy": "sys_created_on", "limit": 5 }
```

The two lists must **differ**. On an instance where the five oldest and five newest incidents happen to
be the same rows — a fresh PDI with under five incidents — both queries return the same thing and a
passing result proves nothing. If the table has fewer than ~10 incidents, create enough first (or pick a
busier table) and say so in the verdict.

No teardown: both are reads.

## Criterion 3 — `event_name` is written and reads back non-empty

```
1  snow_intg_event_register { "name": "arc04s09.live.probe", "table": "incident",
                              "description": "ARC-04-S09 live check" }
   → sys_id = <EV>

2  snow_core_record_read { "table": "sysevent_register", "sys_id": "<EV>" }
```

**Expected.** Step 2 returns `event_name = "arc04s09.live.probe"` — **non-empty**. That is the entire
claim: the row used to come back with an empty `event_name` because the tool wrote `name` instead, and
nothing errored either way.

**Record.** `event_name` and `suffix` as read back. `suffix` should be `live.probe`. If the platform
rewrites or ignores `suffix`, say so — the unit test asserts what we send, not what the platform keeps.

**Teardown.** `snow_core_record_remove { "table": "sysevent_register", "sys_id": "<EV>" }`.

## Criterion 4 — a created business rule actually fires on insert

```
1  snow_scr_business_rule_add { "name": "ARC04S09 Live Probe", "table": "incident",
                                "when": "before", "script": "// probe, no side effects" }
   → sys_id = <BR>

2  snow_core_record_read { "table": "sys_script", "sys_id": "<BR>" }
```

**Expected.** Step 2 returns `action_insert == "true"` (the REST layer returns booleans as strings —
compare against the string, not the boolean, or the check fails for the wrong reason) and
`action_update == "true"`, with `action_delete` and `action_query` false.

**Record.** All four `action_*` values as read back. The old payload omitted them; a row with all four
false is a rule that fires on nothing while looking correct in the UI list.

**Teardown.** `snow_core_record_remove { "table": "sys_script", "sys_id": "<BR>" }`, then complete the
update set. `sys_update_xml` DELETE rows are expected — platform field notes, section 7.

## ARC-02-S10 item 6 — `record_remove` on a scripting table: does the refusal mean anything?

Carried from the 1.0.0 journal and never resolved: deleting a Script Include reported `NOT_FOUND`
while the row was, in fact, gone. No fixture can settle it — the claim is about what the instance
does *after* the call returns, so it needs a real one.

```
1  snow_scr_script_include_add { "name": "Arc02S10Probe",
                                 "script": "var Arc02S10Probe = Class.create();" }
   → sys_id = <SI>

2  snow_core_records_query { "table": "sys_script_include", "query": "name=Arc02S10Probe" }
   → expect count = 1

3  snow_core_record_remove { "table": "sys_script_include", "sys_id": "<SI>" }
   → record the exact code and message, whatever they are

4  snow_core_records_query { "table": "sys_script_include", "query": "name=Arc02S10Probe" }
   → count = 0 means the delete happened; count = 1 means it did not
```

**Expected.** Unknown — that is the point. Step 3 returning success and step 4 returning 0 closes the
item as fixed. Step 3 returning `NOT_FOUND` with step 4 returning 0 reproduces the 1.0.0 behaviour: the
delete works and the response lies, which is worse than a plain failure because a caller that trusts
the code will retry or report a problem that does not exist.

**Record.** Step 3's code and message verbatim, and step 4's count. Both halves — a code without the
count says nothing.

**Teardown.** None if step 4 is 0. If it is 1, delete the record in Studio and say so in the result.

## Redaction

As S07: no instance URL, user name, password or token in anything recorded — key names only, values as
`set (len n)`. Record counts, table names, tool names, `sys_created_on` values and the `action_*` values
are not secrets.

## Verdict

Append one line per criterion:

- `ARC-04-S09 criterion 2: CONFIRMED — five sys_created_on values non-increasing, and the ascending control returned a different list`, or `REFUTED — <the two lists>`.
- `ARC-04-S09 criterion 3: CONFIRMED — event_name read back as "arc04s09.live.probe"`, or `REFUTED — <what came back>`.
- `ARC-04-S09 criterion 4: CONFIRMED — action_insert "true" on read-back`, or `REFUTED — <the four values>`.

A refuted criterion 2 would mean the platform's encoded sort grammar is not what
`ServiceNowDocs/markdown/api-reference/GlideListClientAPINEx.md` states, which is a documentation
finding, not a code one — record it and stop rather than changing the client to match one instance.
