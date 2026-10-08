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
`action_update == "true"`, with `action_delete` and `action_query` false, and `advanced == "true"` (the add
now sends it, and it is the field that decides whether the probe script is in effect).

**Record.** All four `action_*` values and `advanced` as read back. The old payload omitted them; a row with all four
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

**Answered for `sys_script`, not yet for a Script Include (2026-10-08).** The teardown of the C92/C93 sitting removed a `sys_script` row with `snow_core_record_remove`: `action: "deleted"`, a read-back `NOT_FOUND`, an update-set entry `DELETE` (`docs/validation/2.0.11-rc.1-live-sitting.md`). The procedure above, on `sys_script_include`, is still the one that settles the 1.0.0 report.

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

## ARC-09-C92 and C93 — a rule is one write, and a cut name is reported with its limit

**Build under test:** `develop` @ the sha on the PR that adds this section.

**What the unit tests already prove** (`tests/tools/script-business-rule-one-write.test.ts`,
`tests/tools/silent-truncation.test.ts`, `tests/servicenow/silent-truncation-http.test.ts`,
`tests/servicenow/stored-values.test.ts`): that `snow_scr_business_rule_add` puts `filter_condition`,
`advanced` and `active` in the one create, and that a response whose `name` is a shorter prefix of
what was sent comes back as a `VALUE_TRUNCATED` warning. **What only a live run can prove**, because a
fake returns what it was told to:

1. that the REAL response to a write on `sys_script` carries the STORED name — on a POST and on a PATCH.
   PN-07 observed it for a POST on `sys_script_fix.name` only. This is the premise of the whole design
   (PN-10); if it is false the check is silent exactly where it matters, and **that is the result to
   record**;
2. that `sys_script` has columns called `filter_condition` and `advanced`. The names are not printed in
   the bundled corpus; the add sends them and, if the response does not show them, reports
   `FIELD_NOT_STORED` — which on a correct platform must NOT appear;
3. that `sys_dictionary` states `sys_script.name`'s `max_length` to this account (reading the dictionary
   needs an elevated role).

### Setup

An instance on the `pdi-developer` preset, and the §2.2 chain (`snow_us_active_update_set_ensure`,
`snow_us_capture_target_set`) so the probe records land in a throwaway update set.

### The run

```
1  snow_scr_business_rule_add
   { name: "c93-live-probe-0123456789-0123456789-0123", table: "incident", when: "before",
     script: "// c93 probe", filter_condition: "number=INC0000000", advanced: true, active: false }
   (the name is 41 characters; the filter matches nothing; the rule is inactive — nothing can fire)
2  snow_scr_business_rule_read { sys_id: <from step 1> }
3  snow_scr_business_rule_add  the same call with name "c93-live-probe-short"
4  snow_scr_business_rule_modify
   { sys_id: <from step 3>, fields: { name: "c93-live-probe-0123456789-0123456789-0123" } }
5  snow_scr_business_rule_modify { sys_id: <from step 3>, fields: { name: "c93-live-probe-short" } },
   then snow_us_update_set_preview on the throwaway update set
6  snow_scr_business_rule_add  the step 1 call with name "c93-live-probe-trailing" and
   filter_condition "number=INC0000000^"
```

### Pass condition — the exact state to see

- **Step 1** is ONE call, and its result carries `warnings[0]` with `code: "VALUE_TRUNCATED"`,
  `operation: "create"`, `field: "name"`, `sent_length: 41`, `stored_length: 40`, `column_limit: 40` and
  `confirmed: true`, and carries NO `FIELD_NOT_STORED` entry. The result's `summary` names the 40-character
  stored name.
- **Step 2** shows `name` of 40 characters, `filter_condition` STARTING with `number=INC0000000` (the
  platform may append `^EQ` or item lines — record the exact stored form so a PN entry can be written),
  `advanced` true and `active` false: the whole rule from the one write.
- **Step 4** returns `warnings[0]` with `operation: "update"` and the same lengths. This is the PATCH half
  of the premise.
- **Step 5** shows, in the preview, one entry for the rule and whether its payload carries the corrected
  name (the platform's behaviour for REST-captured entries is not documented in the bundled corpus —
  record what it is).

**A failure looks like:** step 1 or 4 has no `warnings` while the read shows a 40-character name (the
response echoed what was SENT — the design's premise is false for that operation); `confirmed: false`
(the account cannot read `sys_dictionary`, or the limit is not on this table's row); a
`FIELD_NOT_STORED` entry (a column name is wrong, or the account cannot read the field back); or step 2
missing `filter_condition` or `advanced`.

### The evidence to record

- the `warnings` array from steps 1 and 4, and step 2's `name` (its length), `filter_condition`,
  `advanced` and `active` — none of these is a secret;
- **the negative control:** step 3 returns no `warnings` key, and the server's stderr log has no
  `Querying ServiceNow table: sys_dictionary` line for it (the server logs each query at info level). A
  check that warned on every write, or looked up the dictionary before every write, would pass the
  positive half every time. **Under Claude Code the log half is not observable:** the log it keeps for the
  server (`mcp-logs-servicenow`) carries no `Querying ServiceNow table` line for any call — info logging is
  not on there — so its absence after step 3 proves nothing. To see it, run the server on a terminal with
  info logging. The audit trail (`.local/audit.jsonl`) separates the two calls instead: step 1's line carries
  the `VALUE_TRUNCATED` warning and step 3's carries none (2.0.11-rc.1 sitting);
- **the false-alarm check:** step 6 — whether a trailing `^` that the platform trims produces a
  `VALUE_TRUNCATED` for `filter_condition`. If it does, that is a benign shape the detector flags
  today (`looksCut` exempts only a decimal's trailing zeros) and it becomes a PN entry.

### Teardown

Delete the probe rules in the UI (`record_remove` on a scripting table is the open question in the
ARC-02-S10 section above) and discard the update set.

### Verdict

Record in `docs/validation/` under the sitting's file, as **ARC-09-C92 live: CONFIRMED / FAILED** and
**ARC-09-C93 live: CONFIRMED / FAILED**, saying which of the failure shapes above it was, for the POST
and for the PATCH separately.

## ARC-09-C94 — running an ATF test by REST

**Build under test:** `develop` @ the sha on the PR that adds this section, or the release candidate the
owner has installed from it.

**The finding (the owner's R1):** `snow_atf_atf_test_exec` returned `INVALID_REQUEST` on the PDI, and the
instance said the URI is not a resource.

**What the tool sends** (measured at `eb84cb8`): `POST {instance}/api/now/atf/runner/run_test` with the JSON
body `{"sys_id": "<test sys_id>"}`, through `client.callNowAssist` (`src/tools/atf.ts`, the
`snow_atf_atf_test_exec` case; `src/servicenow/client.ts`, `callNowAssist`). `snow_atf_atf_suite_exec`
sends `POST /api/now/atf/runner/run_suite` the same way. The client maps an HTTP 400 to `INVALID_REQUEST`
(`client.ts`, the status mapping), so the owner's error was a 400 whose message said there is no such
resource.

**What the bundled corpus documents** (`68c0d11`):

- **No `atf/runner` path anywhere** — 0 files name it.
- **The CI/CD API runs a SUITE, not a test:** `POST /api/sn_cicd/testsuite/run` "starts a specified
  automated test suite. The test suite runs on the instance from which the endpoint was called." It takes
  `test_suite_sys_id` or `test_suite_name` as a query parameter, and needs the `sn_cicd.sys_ci_automation`
  or `admin` role. It answers asynchronously: poll `GET /api/sn_cicd/progress/{progress_id}` with
  `links.progress.id`, then read `GET /api/sn_cicd/testsuite/results/{result_id}`. A suite that contains UI
  tests needs a scheduled Client Test Runner open, or a headless runner *(citation:
  `markdown/api-reference/rest-apis/cicd-api.md`)*. The corpus documents no REST call that runs a single
  test.
- **The runner property:** `sn_atf.runner.enabled` — "If checked, enables running tests and test suites on
  this instance. This setting is unchecked by default to prevent users from unintentionally running tests
  on production instances" *(citation: `markdown/application-development/automated-test-framework-atf/atf-admin-properties.md`)*.
- **The tables:** Test [`sys_atf_test`], Test Suite [`sys_atf_test_suite`], `sys_atf_test_suite_result` and
  `sys_atf_test_result` are in the corpus. `sys_atf_result` and `sys_atf_failure_insight`, which
  `snow_atf_atf_test_results_index` and `snow_atf_atf_failure_insight_read` query, are not.

**So by the corpus, the tool calls a path the corpus does not document,** and no documented call runs one
test. No code changes until the live run says which of the shapes below this instance shows.

### Setup

An instance on the `pdi-developer` preset (`ATF_ENABLED` on), and an account with `admin` or
`sn_cicd.sys_ci_automation`. Before the run, in the UI: one test whose steps are all server-side (no UI
step, so no client runner is needed) and one suite that holds only that test. Record both sys_ids; neither
is written by a tool.

### The run

```
read-only — no approval needed
1  snow_core_capabilities_read                         the preset and ATF_ENABLED, as the server reads them
2  snow_core_records_query { table: "sys_properties",
     query: "name=sn_atf.runner.enabled^ORname=sn_atf.schedule.enabled", fields: "name,value" }
3  snow_core_records_query { table: "v_plugin",
     query: "idSTARTSWITHcom.glide.automated_testing", fields: "id,name,active" }
4  snow_atf_atf_test_read { sys_id: <test> }            the test exists and is active
5  snow_atf_atf_suite_read { sys_id_or_name: <suite> }  the suite exists and is active
6  in the REST API Explorer, GET /api/now/atf/runner/run_test
     — does this instance have a resource at the tool's path at all? (a GET, so nothing runs)
7  in the REST API Explorer, GET /api/sn_cicd/progress/<any 32-character hex>
     — is the documented API present? (an unknown progress id runs nothing)

the one write — its own "write approved"
8  snow_atf_atf_test_exec { sys_id: <test> }           About to start ATF test <test> on instance
                                                       "<label>" — write approved?
```

If step 2 shows `sn_atf.runner.enabled` false, stop before step 8 and ask the owner whether to check it for
the sitting. It is a setting he changes in the UI, and the default is off on purpose.

### Pass condition — the exact state to see

Step 8 returns without an error, and a `sys_atf_test_result` record for the test appears, created in the
minute of the call. That means the tool's path works on this instance although the corpus does not document
it. The tool keeps its path, and the run becomes a PN entry with `Grounding: observed behaviour`.

### The failure shapes, and what each means for the fix

- **A — the path is absent, and the documented API is present.** Steps 6 and 8 say there is no such
  resource, while step 7 answers as the CI/CD API (an error about the progress id, not about the URI). The
  corpus is right and the tool is wrong. The fix moves `snow_atf_atf_suite_exec` onto
  `POST /api/sn_cicd/testsuite/run` with progress and results. `snow_atf_atf_test_exec` either runs its test
  through a suite or refuses with a remedy that names the suite call, since no documented call runs one
  test.
- **B — both are absent.** Steps 6, 7 and 8 all say there is no such resource: the CI/CD API is not
  available on this instance either. The fix is shape A's, and the remedy also says the CI/CD API must be
  present.
- **C — a 403.** The path exists and the account lacks the role. The fix is a remedy line naming
  `sn_cicd.sys_ci_automation` or `admin`, under `INSUFFICIENT_PRIVILEGES`.
- **D — the runner is off.** Step 2 shows `sn_atf.runner.enabled` false, and step 8 returns an ATF refusal
  rather than a URI error. The fix is a remedy that names the property and its production default.
- **E — a 400 that is not about the URI.** The body shape is wrong. Record the message; the fix is the body.

### The evidence to record

- step 1's preset and flags line; step 2's two property values; step 3's plugin ids and `active` values;
  steps 4 and 5's `active`;
- steps 6 and 7: the HTTP status and the message of each answer, word for word;
- step 8: the error code, the HTTP status and the instance's message, word for word, and the server log
  line `Calling Now Assist endpoint: /api/now/atf/runner/run_test`, which proves the path the tool called;
- whether a `sys_atf_test_result` or `sys_atf_test_suite_result` record appeared — a
  `snow_core_records_query` on each, with `sys_created_on` in the minute of step 8;
- **the negative control:** step 4 again after step 8 — the test's record unchanged, so a refusal wrote
  nothing.

None of these is a secret, and none names the instance.

### Teardown

Delete the probe test and suite in the UI. If `sn_atf.runner.enabled` was checked for the sitting, uncheck
it again. Nothing else was written.

### Verdict

Record in `docs/validation/` under the sitting's file, as **ARC-09-C94 live: WORKS / PATH ABSENT /
API ABSENT / ROLE / RUNNER OFF / BODY**, with the step 6–8 answers and the fix the shape implies.

**Measured on `v2.0.11-rc.1`: shape A** (`docs/validation/2.0.11-rc.1-live-sitting.md`, § ARC-09-C94).

### After the fix — the confirmation run on `v2.0.11-rc.2`

**What changed** (`src/tools/atf-cicd.ts`): `snow_atf_atf_suite_exec` sends
`POST /api/sn_cicd/testsuite/run?test_suite_sys_id=<suite>` once, reads `GET /api/sn_cicd/progress/<id>` every
five seconds within `budget_seconds` (default 300), then reads `GET /api/sn_cicd/testsuite/results/<id>`. It
returns the outcome, the counts and the `sys_atf_test_suite_result` record. `snow_atf_atf_test_exec` reads
`sys_atf_test_suite_test` and runs the one suite that holds the test, or refuses and creates nothing.

**Setup:** the same instance and account. Choose a suite whose tests are all server-side: a suite with UI
tests needs a scheduled Client Test Runner or a headless runner *(citation:
`markdown/api-reference/rest-apis/cicd-api.md`)*. "Mixed Test Suite", read in the rc.1 sitting, may hold UI
tests, so pick or make one that does not, for example a suite holding only "Jasmine Successful Test". Record
its sys_id.

```
read-only — no approval needed
1  snow_core_capabilities_read                         ATF_ENABLED on
2  snow_core_records_query { table: "sys_atf_test_suite_test",
     query: "test_suite=<suite>", fields: "test,test_suite" }
                                                       the suite's tests. The column names test exec reads,
                                                       `test` and `test_suite`, are not in the corpus
the one write — its own "write approved"
3  snow_atf_atf_suite_exec { sys_id: <suite>, budget_seconds: 120 }
                                                       About to run ATF test suite <suite> on instance
                                                       "<label>" — write approved?
```

**Pass condition:**
- **Step 2:** every row carries `test` and `test_suite`, and `test_suite` is the suite's sys_id.
- **Step 3:** it returns without an error and within the budget, with `outcome: "success"` (or `"failure"`
  with the counts, if a test fails), counts that match the suite's tests, and
  `result_record: { table: "sys_atf_test_suite_result", … }`. That record exists in the UI with the same
  counts.

**A failure looks like:**
- `INSUFFICIENT_PRIVILEGES` naming `sn_cicd.sys_ci_automation`: the account lacks the role.
- `NOT_FOUND` saying the CI/CD API is not served: `/api/sn_cicd` is absent.
- `REQUEST_FAILED` carrying the platform's own error: the run was refused at the start.
- `outcome: "pending"` or `"running"` at the budget: the run did not finish in 120 s. A server-side suite
  stuck in Pending suggests it is waiting for a client runner.
- Rows in step 2 without `test` or `test_suite`: the column names are wrong, and test exec would refuse
  every test as in no suite.

**Evidence:** step 2's row count and field names, and step 3's `outcome`, `status_label`, `counts` and
`duration`, plus its audit line. None of these is a secret, and the ids stay out of the record.

**Teardown:** none. The run's own result records are the evidence.

**Verdict:** record **ARC-09-C94 after the fix: CONFIRMED / FAILED** in `docs/validation/`, under the rc.2
sitting's file, naming the failure shape.
