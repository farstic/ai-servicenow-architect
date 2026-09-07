# NowAIKit MCP — Known Limitations & Patterns

**Purpose:** Operational field notes for the NowAIKit MCP connection to a live ServiceNow instance — confirmed tool behaviours, bugs, and the workarounds that make them safe to rely on. This is the cross-laptop knowledge base: a `git clone` plus this file restores full operational knowledge.
**Audience:** Architects and developers operating the engine against a live PDI; anyone debugging an MCP write that did not behave as expected.
**Scope:** Generic patterns only — no instance URLs, credentials, emails, or sys_ids. Instance-specific values live in local memory (`memory/MEMORY.md`), never committed.
**Related:** `MCP-OPERATIONS-GUIDE.md` (the playbook these notes support) · `TECHNICAL-ARCHITECTURE.md` (§2.1 write gate, §2.2 Update Set capture).
**Last updated:** 2026-06-25

---

## 1. Update Set Capture — WORKING Pattern (confirmed 2026-05-27)

ServiceNow honors `sys_user_preference` with `name=sys_update_set` for REST API calls.
Setting this preference BEFORE write operations causes automatic capture.

**Step-by-step:**
1. Create Update Set: `create_update_set`
2. Resolve user sys_id: `query_records(sys_user, user_name=<username>)`
3. Check preference: `query_records(sys_user_preference, user=<sys_id>^name=sys_update_set)`
4. Set preference: `update_record(sys_user_preference, <pref_sys_id>, {value: <update_set_sys_id>})`
   - Create if missing: `create_record(sys_user_preference, {user, name:'sys_update_set', value:<sys_id>})`
5. Execute writes — captured automatically
6. Verify: `query_records(sys_update_xml, update_set=<sys_id>)`

**Instance-specific values** (user sys_id, sys_user_preference sys_id) are stored in MEMORY.md — local only, never committed.

**What does NOT work:**
- `switch_update_set` — only sets `is_default:true`, does NOT switch session context
- `sys_update_xml` direct POST — INSUFFICIENT_PRIVILEGES
- `delete_record` on `sys_update_xml` — NOT_FOUND (ACL blocks)

---

## 2. Background Script / Script Execution — BROKEN on PDI

- `execute_background_script` → 404 (endpoint does not exist on PDI)
- `execute_script` → 400 INVALID_REQUEST

**Workaround:** Manual UI — `System Definition > Scripts - Background`

---

## 3. Email Generation on PDI — Working Pattern (confirmed 2026-05-28)

**None of these create a visible sys_email record on PDI:**
- `gs.sendEmail()` in Script Action → direct SMTP, bypasses sys_email
- `GlideEmailOutbound` + `.save()` → doesn't persist on PDI
- `sysevent_email_action` (event-driven notification) with `force_delivery=true` + `mandatory=true` + correct `event_name` → event processes but no sys_email row created

**Working solution — direct GlideRecord insert:**
```javascript
var emailGR = new GlideRecord('sys_email');
emailGR.initialize();
emailGR.setValue('type', 'send-ready');
emailGR.setValue('recipients', agentEmail);
emailGR.setValue('subject', 'Your subject here');
emailGR.setValue('body', '<p>HTML body here</p>');
emailGR.setValue('state', 'ready');
emailGR.insert();
```
This creates a visible, queryable record in `sys_email` with `state=ready`.
`glide.smtp.mock=true` is NOT required for this approach.

**Result on PDI:** record appears with `state=ignored` — PDI suppresses actual sending but the record is created and queryable. This is the expected and correct behaviour for testing.

**Standing rule — always use GlideRecord insert for email in Script Actions and event handlers:**
- `gs.sendEmail()` bypasses `sys_email` on PDI (direct SMTP, not queryable, cannot be verified)
- GlideRecord insert on `sys_email` works on both PDI and production
- Use `recipients` field for the To address; `body` should be HTML (`<p>...</p>`)
- Whenever a Script Action or any server-side handler needs to send an email, default to this pattern — do NOT use `gs.sendEmail()`

---

## 4. register_event MCP Tool — Bug: event_name Left Empty

`register_event` creates the `sysevent_register` record but leaves `event_name` and `sys_name` blank.
Without `event_name`, the notification engine cannot match the event and Script Actions won't fire.

**Workaround — immediately patch after creation:**
```
update_record(sysevent_register, <sys_id>, {
  event_name: 'your.event.name',
  suffix: 'the.suffix.part'    // everything after first dot segment
})
```
Example for `duplicate.incident.detected`:
- `event_name` = `duplicate.incident.detected`
- `suffix` = `incident.detected`

---

## 5. create_business_rule — action_insert / action_update Not Set

`create_business_rule` creates the record but `action_insert` and `action_update` default to `false`.
The BR will never fire until patched.

**Workaround — immediately after creation:**
```
update_record(sys_script, <sys_id>, {
  action_insert: true,   // if BR should fire on insert
  action_update: true    // if BR should fire on update
})
```

---

## 6. Flow Designer — create_flow / create_flow_action Create Empty Shells

`create_flow` and `create_flow_action` create database records but with no internal step structures.
The flow opens as a white screen in the UI — steps cannot be added via MCP.

**Workaround:** Delete the shells and build the flow entirely from the Flow Designer UI.
MCP cannot wire Flow Designer steps — UI only.

---

## 7. sys_update_xml Cleanup — DELETE Records Are Normal

When objects are deleted from the environment while an Update Set is active, ServiceNow captures
`action=DELETE` entries in `sys_update_xml`. These cannot be removed via `delete_record` (ACL blocks).

This is **acceptable behavior** — DELETE records tell the target environment to also remove those objects
on promote. They do not affect the functioning of the INSERT_OR_UPDATE records in the same Update Set.

---

## 10. Assignment Rules — Correct Table Name: sysrule_assignment (confirmed 2026-06-01)

`create_record(assignment_rule, ...)` → `INVALID_REQUEST`. The correct REST-accessible table is `sysrule_assignment`.

**Working pattern:**
```
create_record(sysrule_assignment, {
  name: "...",
  document: "incident",       // NOT "table" — field is called "document"
  order: "900",
  active: "true",
  condition: "priority=1^assignment_groupISEMPTY",
  group: "<assignment_group_sys_id>"
})
```

Key field differences vs what you might expect:
- `document` = the target table (not `table` or `collection`)
- `group` = assignment_group sys_id (not `assignment_group`)
- `condition` = encoded query string (standard)

The record is captured in the active Update Set automatically.

---

## 9. Deleting Scripting Objects via MCP — Full Behaviour (confirmed 2026-06-01)

This section documents the complete, verified deletion behaviour for scripting tables. The earlier
version of this note contained two significant errors — both corrected here based on direct
empirical testing during a demo-cleanup operation on 2026-06-01.

---

### 9a. delete_record on scripting tables — returns NOT_FOUND but SUCCEEDS

**Critical pattern:** `delete_record` returns `Error: No Record found (Code: NOT_FOUND)` on
scripting tables, which looks like a failure. **It is not a failure — the record IS deleted.**

The MCP tool interprets the HTTP response code from ServiceNow's REST API as an error, but the
underlying DELETE call completes successfully. This was confirmed by:
1. Calling `delete_record` on 6 objects across 3 scripting tables → all returned NOT_FOUND
2. Immediately calling `query_records` on the same tables → all returned count: 0
3. Inspecting `sys_update_xml` for the active Update Set → 6 `action=DELETE` entries present,
   one per deleted object — confirming ServiceNow captured the deletions correctly

**Affected tables (confirmed on PDI):**
- `sys_script` (Business Rules)
- `sys_script_include` (Script Includes)
- `sysevent_script_action` (Script Actions)
- `sys_properties` (System Properties)

**Mandatory protocol — always verify after deletion:**

```
# Step 1 — call delete_record (will return NOT_FOUND — ignore the error)
delete_record(table, sys_id)

# Step 2 — verify the object is actually gone
query_records(table, query="name=<object_name>", fields="sys_id,name")
# Expected: count: 0 — deletion confirmed

# Step 3 — verify captured in Update Set
query_records(sys_update_xml, query="update_set=<update_set_sys_id>", fields="name,action,type")
# Expected: action=DELETE row for the object
```

**Do NOT:**
- Retry the delete because NOT_FOUND appeared — the record is already gone
- Conclude the deletion failed without running `query_records` to verify
- Fall back to the UI assuming MCP cannot delete — MCP CAN delete these tables

**update_record on scripting tables:** Also returns NOT_FOUND. Whether this similarly succeeds
despite the error code has NOT been verified — treat updates on scripting tables as uncertain
and verify with `query_records` after every `update_record` call on these tables.

**Root cause (inferred):** ServiceNow's REST Table API on PDI returns a non-standard HTTP response
code on DELETE for scripting tables (likely due to ACL or audit hook behaviour), which the MCP
tool surface reports as NOT_FOUND. The database operation itself completes. This is a PDI-specific
quirk — behaviour on production instances may differ.

---

### 9b. sysevent_register (Event Registry) — CAN be deleted from UI; MCP not verified

**Correction from the earlier version of this note:** The earlier §9b stated that
`sysevent_register` records "cannot be deleted anywhere". This was incorrect.

**What is confirmed:**
- `sysevent_register` records **CAN be deleted from the ServiceNow UI** by an admin user
  while a custom Update Set is active. The deletion is captured as `action=DELETE` in
  `sys_update_xml`. Confirmed during the Cleanup — P1AutoAssign operation (2026-06-01).
- `delete_record` via MCP on `sysevent_register` has **not been tested**. Given §9a above
  (MCP deletes on scripting tables return NOT_FOUND but succeed), it may also work — but
  treat as unconfirmed until tested.

**UI navigation:** System Policy → Events → Event Registry (`sysevent_register.list`)

**When to delete vs leave inert:**
- If the event was created as part of a custom demo/implementation and must be fully cleaned
  up → delete from UI with the cleanup Update Set active.
- If the event cannot be deleted or leaving it is acceptable → remove the Script Action and
  Business Rule that reference it. Without handlers, the event fires but is harmlessly
  consumed with no side effects.

**Implication for implementations:** do not assume event registrations are permanent. They can
be removed from the UI. Plan cleanup Update Sets to include the event registration deletion
alongside the handler (Script Action) and trigger (Business Rule) deletions.

---

## 8. MCP Config Reference

Required env vars in `claude_desktop_config.json` (instance URL stored locally in MEMORY.md):

```
SERVICENOW_INSTANCE_URL: <your-instance>.service-now.com
WRITE_ENABLED: true
SCRIPTING_ENABLED: true   (correct even on PDI — script endpoints are unavailable at PDI level)
CMDB_WRITE_ENABLED: false
ATF_ENABLED: false
MCP_TOOL_PACKAGE: full
```

## 13. Outbound REST — Basic-Auth `Authorization` header leaks into `sys_outbound_http_log` at verbose log levels (confirmed 2026-06-08)

**Symptom / risk:** when an outbound REST call uses Basic Authentication, the `Authorization` header (base64 username:password) can be written **in clear** into the outbound HTTP log table `sys_outbound_http_log` — i.e. credentials end up queryable in a platform table, defeating "no hard-coded / securely-stored credentials" requirements.

**Trigger condition:** verbose request logging is on — the system property `glide.outbound_http_log.override = true` **and** the log level is `all` or `elevated` (instance-wide, or raised per call). At the default/`basic` level the request headers (including `Authorization`) are not logged.

**Working pattern (keep credentials out of the log):**
- In `RESTMessageV2` / `RESTMessageV2` scripted calls, set the per-message level explicitly: `r.setLogLevel('basic');` — never `'all'`/`'elevated'` for a call that carries an auth header.
- Leave `glide.outbound_http_log.override` **off** (default) instance-wide; only raise it transiently for a specific non-auth debugging session, then revert.
- Hold credentials in a **Connection & Credential Alias** (referenced by the REST Message), not in the script, a system property, a log line, or a work note.
- This applies to ANY outbound auth scheme whose secret rides in a header (Basic, Bearer/OAuth token, API key header).

**Doc grounding (Australia branch):** `markdown/platform-security/instance-security-hardening-settings/sc-prevent-verbose-http-request-logging.md` (the override + level behaviour) and `markdown/api-reference/web-services/outbound-logging-configure.md` (per-call log level).

**General principle:** for outbound integrations, treat the HTTP log level as a security control, not just a debugging knob. Default to `basic`, gate any `all`/`elevated` raise behind a change, and verify post-deploy that no `Authorization`/token value appears in `sys_outbound_http_log`.

## 14. Styled Word `.docx` on macOS/Linux + diagrams must be rendered draw.io, not Mermaid (confirmed 2026-06-09)

**Problem:** the house Word converter `scripts/md-to-docx.ps1` is Windows/PowerShell-only — on a Mac there was no way to produce the styled `.docx`. Separately, embedding a diagram as a ` ```mermaid ` block makes it render as raw monospace **text** in Word, not as a diagram.

**Working pattern (cross-platform, no Pandoc / Word / python-docx):**
- **`.md` → styled `.docx` on Mac/Linux:** `scripts/md-to-docx.py` — a faithful pure-Python-stdlib port of the PowerShell converter (builds the Open XML parts and zips them). Identical house style (navy title banner, blue-header zebra tables, inline code, shaded callouts, embedded PNGs, page-numbered footer). Run: `python3 scripts/md-to-docx.py --src X.md --out X.docx --footer-text "<Client> | Commercial in confidence"`. Nothing to pip-install beyond Python 3.
- **Diagrams in a `.docx` = rendered draw.io PNG, never Mermaid:** author the figure as `.drawio` (Diagramming Specialist), rasterise **locally** with `scripts/render-drawio.sh` (needs draw.io Desktop — `brew install --cask drawio`; CLI at `/Applications/draw.io.app/Contents/MacOS/draw.io -x -f png -s 3 -o out.png in.drawio`), then reference the PNG `![](diagrams/figure-N.png)`. `md-to-docx.py` now also refuses to dump a `mermaid`/`mmd` fence as code (it emits a muted placeholder), so Mermaid source can never leak into Word.
- **Visual QA on Mac:** `scripts/render-pdf.sh file.docx` → PDF via LibreOffice headless (`brew install --cask libreoffice`). `soffice --headless --convert-to png` renders page 1 to an image for a quick eyeball.
- **Confidentiality:** draw.io Desktop and the Mermaid CLI render **locally** — never an online service.

**Gotchas:**
- macOS has no `timeout` (use `gtimeout` from coreutils, or omit).
- `.drawio` XML emitted by an LLM may contain `&nbsp;` — not a predefined XML entity, so strict parsers reject it. Replace with `&#160;` to make it well-formed before a VSDX/Lucid export.
- draw.io PNG at `-s 3` gives crisp text; `md-to-docx` caps embedded image width at ~6.2 in, so very wide diagrams shrink — use a landscape appendix if a client needs them larger.

**Prerequisites by OS + the full pipeline:** `scripts/README.md`. Rule also recorded in `CLAUDE.md` Artefact standards (Diagrams + Word/PDF export rows).

---

## 11. Incident state → 6 (Resolved) — `close_code` must be a valid instance choice (confirmed 2026-06-26)

**Symptom:** `update_incident({state: "6", close_code: "Solved (Permanently)", ...})` returns `INSUFFICIENT_PRIVILEGES`. The same call with a valid `close_code` value succeeds immediately.

**Root cause:** `close_code` is a mandatory field for state=6 on this instance. When the supplied value is not in the instance's `sys_choice` list for `incident.close_code`, ServiceNow rejects the update. The MCP tool maps this validation failure to `INSUFFICIENT_PRIVILEGES` instead of a meaningful validation error — making it look like an ACL or role problem when it is actually a bad field value.

**The standard OOB value `"Solved (Permanently)"` does NOT exist on this instance.** This instance has a custom choice list. Always query `sys_choice` before resolving:

```
query_records(sys_choice, name=incident^element=close_code^language=en^inactive=false)
```

**Working pattern — resolve an incident via REST:**
1. Query valid `close_code` choices (above)
2. Send in a single call:
```
update_incident(sys_id, {
  state: "6",
  close_code: "<valid choice value from sys_choice>",
  close_notes: "..."
})
```
`resolved_by` and `resolved_at` are auto-populated by the `mark_resolved` Business Rule.

**What does NOT work:**
- `resolve_incident` MCP tool — parameter mismatch (`incident_id` vs `sys_id`)
- `natural_language_update` — not implemented on this instance
- Any `close_code` value not present in `sys_choice` for this instance

**Lesson:** `INSUFFICIENT_PRIVILEGES` from the MCP tool does not always mean an ACL failure. It can mask validation errors (invalid choice value, missing mandatory field). When a field update fails with this code, first verify field values are valid for the instance before investigating ACLs.

---

## 15. `sys_script_fix.name` truncates silently at 40 characters (confirmed 2026-08-28)

**Symptom:** A Fix Script created via the REST Table API with a 44-character `name` was stored as
40 characters, with the tail cut off mid-word. The API returned HTTP success and echoed the
truncated value in the response — no error, no warning.

```
sent:      "UserManagerUtils - Manager Lookup Smoke Test"   (44 chars)
stored:    "UserManagerUtils - Manager Lookup Smoke "       (40 chars, trailing space)
```

`sys_name` is truncated identically, so the record's display value is wrong everywhere it appears
(list view, update-set preview, the `sys_update_xml.target_name` of the captured update).

**Why it matters:** the truncated name is what travels through the update set. On the target
instance the artefact arrives under a mangled name, and a name-based lookup or a promotion
checklist that greps for the intended name will not match.

**Working pattern:** keep `sys_script_fix.name` at **40 characters or fewer**, and read the
`name` field back from the create response rather than assuming the sent value was stored.
The same check is worth applying to any short platform label field written over REST — the API
does not reject over-length input, it silently trims it.

**Detection:** compare sent vs returned `name` in the create response, or query
`sys_update_xml.target_name` after capture. A trailing space in the stored value is the tell.
