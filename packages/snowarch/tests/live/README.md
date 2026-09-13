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

## ARC-02-S10 open question — does an invalid `close_code` still surface as a privilege error?

Not a limitation claim: an unsettled question about this server, recorded here because it cannot be
settled anywhere else. The 1.0.0 journal reported that setting `state=6` with a `close_code` that is
not in the instance's choice list came back as `INSUFFICIENT_PRIVILEGES` — a validation failure
wearing an ACL failure's code, which sends the reader to look at roles. Whether 2.0.0 does the same
is unknown; the tool it was observed on no longer exists in that form, so nothing is asserted about
it in `CHANGELOG.md` and PN-04 states only the platform half (a valid choice is required).

```
1  snow_core_records_query { "table": "sys_choice",
                             "query": "name=incident^element=close_code^inactive=false" }
   → note the values that actually exist here

2  snow_inc_incident_modify { "sys_id": "<INC>", "state": "6",
                              "close_code": "Definitely Not A Choice On This Instance",
                              "close_notes": "ARC-02-S10 probe" }
   → record the code and the message verbatim

3  repeat step 2 with a value from step 1
   → expect success
```

**Expected.** Step 3 succeeding and step 2 failing is the platform behaviour PN-04 already states.
The question is only what step 2's **code** is. `INSUFFICIENT_PRIVILEGES` reproduces the old
mapping and is worth a server fix; a validation-shaped code means it was the old tool and there is
nothing to fix.

**Record.** Step 2's code and message, and one value from step 1 so the reader can see the choice
list was consulted rather than guessed. No sys_id, no instance host.

**Teardown.** None — step 3 leaves the incident resolved, which is the state the probe was aiming
for. Use an incident opened for the sitting, never a real one.

## ARC-05-S07 criterion 5 — the `ask` block actually prompts (after ARC-06)

Not verifiable from a fixture: the claim is about what Claude Code does with the committed
`.claude/settings.json`, not about what the generator wrote into it. S-18 confirmed the mechanism
with a control; this is the re-run against the real file, once ARC-06 registers the server.

```
1  start a session in auto mode in the checkout
2  call snow_core_records_query   → expect NO prompt   (it is in permissions.allow)
3  call snow_core_record_add      → expect a prompt    (it is in permissions.ask)
4  repeat both in default mode, and once in plan mode
```

**Expected.** Step 2 silent, step 3 prompting, in every mode. Step 3 prompting is the mechanical
half of §2.1 — the half that works whether or not the session remembers the rule.

**Record.** Which modes were tried and what each did. A mode where step 3 does NOT prompt is the
finding, and it changes `askStyle` rather than the rule.

**Teardown.** Decline the prompt at step 3. Nothing is written.

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

## ARC-04-S03 criterion 1 — a refusal that is about the INSTANCE, not about the flags

**Build under test:** `develop` @ the sha on the PR that adds this section.

**What the unit tests already prove** (`tests/tools/gates.test.ts`, and the S03 gate-ordering cases):
that a `prod` preset refuses `snow_core_record_add` with `PROD_WRITE_NOT_ACKNOWLEDGED`, and that the
gate order puts the production cap ahead of the write flag. **What only a live run can prove** is the
other half of the same criterion — that switching back to a PDI makes the *same call with the same
arguments* succeed. A refusal that would also refuse on a PDI proves nothing about production.

### Setup

Two instances in the store: one at preset `prod` (label `acme`), one at preset `pdi-developer`
(label `dev12345`). Both may point at the SAME PDI — the preset is what is under test, not the host.
`SNOW_STORE` redirected to a temp file, so the sitting cannot touch the machine's own store.

### The run

```
1  snow_core_instance_switch { "label": "acme" }          → active instance = acme, preset prod
2  snow_core_record_add { "table": "incident", "fields": { "short_description": "[LIVE] S03 c1" } }
   → REFUSED: code PROD_WRITE_NOT_ACKNOWLEDGED, no record created
3  snow_core_instance_switch { "label": "dev12345" }      → active instance = dev12345
4  snow_core_record_add { "table": "incident", "fields": { "short_description": "[LIVE] S03 c1" } }
   → sys_id returned, number INCxxxxxxx
```

### Pass condition — the exact state to see

Step 2's response `code` is **`PROD_WRITE_NOT_ACKNOWLEDGED`** and no `sys_id` field is present.
Step 4's response carries a **`sys_id` (32 hex)** and a **`number` matching `^INC\d+$`**.
**A failure looks like:** step 4 refused as well (then the refusal is about the flags, not the
instance, and the criterion is NOT met), or step 2 succeeded (the production cap did not hold).

### The evidence to record

Redacted per the ARC-00 rules — no instance URL, user name, password or token; key names only,
values as `set (len n)`. Record counts, table names, tool names and error codes are not secrets.

- steps 2 and 4's response objects, redacted, with the `code` and the presence/absence of `sys_id`;
- **the negative control:** step 4 must be the same call as step 2, argument for argument. Paste both
  requests. If they differ, the run measured two different calls and says nothing about the switch.

### Teardown

Delete the incident created at step 4. Restore `SNOW_STORE`.

### Verdict

Record in `docs/validation/` under the sitting's file, as **ARC-04-S03 c1: CONFIRMED / FAILED**.

## ARC-04-S08 criterion 3 — discovering a table does not change the catalogue

**Build under test:** `develop` @ the sha on the PR that adds this section.

**What the unit tests already prove** (`tests/tools/discovery.test.ts`, *"the catalogue does not
change when a table is discovered"*): that the in-process tool list is identical either side of a
discover call. **What only a live run can prove** is that the same holds over the WIRE — that no
`notifications/tools/list_changed` is emitted and no client-visible catalogue moves — and that a real
`incident` table answers with the three columns the criterion names.

### Setup

A PDI, an instance at preset `pdi-developer`, the server started over stdio by the client under test.
Nothing else calling the server during the run.

### The run

```
1  tools/list                                    → capture the full response to a file, A
2  snow_disco_table_discover { "table": "incident" }
3  tools/list                                    → capture the full response to a file, B
4  diff A B
```

### Pass condition — the exact state to see

**`diff A B` produces no output** (byte-identical, including tool order), and step 2's response names
at least the columns **`number`**, **`short_description`** and **`state`**.
**A failure looks like:** any diff at all — even a reordering — or a `list_changed` notification
arriving between steps 1 and 3; either means a discover call moved the catalogue.

### The evidence to record

Redacted per the ARC-00 rules. Record:

- the byte counts of A and B and the `diff` exit status;
- the three column names from step 2's response (column names are not secrets);
- **the negative control:** capture a third `tools/list` after a call that IS expected to change the
  catalogue — `snow_core_instances_reload` after adding an instance — and show that diff is NOT
  empty. Without it, a capture that always produced identical bytes (a cached response, a truncated
  file) looks exactly like a passing run.

### Teardown

None — nothing is written to the instance.

### Verdict

Record in `docs/validation/` under the sitting's file, as **ARC-04-S08 c3: CONFIRMED / FAILED**.

## ARC-04-S10 criterion 1 — the audit line says `result: "ok"`, and says it about the right call

**Build under test:** `develop` @ the sha on the PR that adds this section.

**What the unit tests already prove** (`tests/audit/no-secrets.test.ts`, *"criterion 1 — a mutating
call writes one line, and the payload is not in it"*): that one line is appended and the payload does
not appear in it. **What only a live run can prove** is the `result` field over a real call — a fake
REST layer returns what the fake was told to return, so `ok` in a unit test is the fixture's word.

**This is run as the last step of the ARC-04-S07 criterion 4 procedure above**, not separately: that
procedure already makes a real mutating call through the capture chain, and adding a second one would
be a second chance to get a different answer.

### The run

```
5  (after S07 c4 step 3, the snow_scr_script_include_add)
   tail -1 .local/audit.jsonl
```

### Pass condition — the exact state to see

The line **parses as JSON** and carries **`"result": "ok"`** and **`"tool": "snow_scr_script_include_add"`**.
**A failure looks like:** `result` absent, `result` anything other than `ok` after a call that
returned a `sys_id`, or the line naming a different tool — which would mean the audit trail is one
call behind and every line in it is attributed to the wrong call.

### The evidence to record

Redacted per the ARC-00 rules — **the audit line itself must be pasted redacted**, key names only,
values as `set (len n)` for anything that could carry an instance, a user or a token.

- the redacted line, with `result` and `tool` shown in full (neither is a secret);
- **the negative control:** make one call that FAILS (e.g. `snow_scr_script_include_add` with a name
  that already exists) and show the next line's `result` is NOT `ok`. A trail that writes `ok`
  unconditionally passes the positive half every time.

### Teardown

Covered by the S07 c4 teardown; no extra objects are created.

### Verdict

Record in `docs/validation/` under the sitting's file, as **ARC-04-S10 c1: CONFIRMED / FAILED**.
