# Platform notes

Platform behaviour learned on real instances, each with the corpus page it is grounded in. These are
facts about **ServiceNow**, not about this repository's server — a bug in a tool is a failing test in
`packages/snowarch`, and `packages/snowarch/CHANGELOG.md` carries the ones not yet fixed.

Ids are stable and chronological. Where the corpus has no page stating the behaviour the `Grounding:`
line says so and names the nearest page for the baseline concept — never an invented path.

## PN-01 — REST capture follows the user preference, not the "current" update set

**Applies to:** `sys_user_preference`, `sys_update_set` · Australia family · confirmed on PDI 2026-05-27
**Behaviour:** Update-set capture over the REST API follows the authenticated user's
`sys_user_preference` row with `name=sys_update_set`; its `value` is the update set that subsequent
writes are captured into. The `is_default` flag on an update set is a UI concept and does not change
what REST captures — setting it looks like success and captures nothing. A direct POST to
`sys_update_xml` is refused with `INSUFFICIENT_PRIVILEGES`, admin included, so capture cannot be
applied retroactively.
**Grounding:** none in ServiceNowDocs (`markdown/application-development/system-update-sets/` for the
baseline concept); observed behaviour
**Evidence:** observed on PDI; regression test — none (platform, not server)
**Engine consequence:** governance §2.2 is this behaviour written as a four-call protocol — ensure the
set by name, point capture at it, write, then preview to confirm. The preview step exists because
capture cannot be verified any other way and cannot be repaired afterwards.

## PN-02 — On a PDI, an email is visible only if the row is inserted directly

**Applies to:** `sys_email` · Australia family · confirmed on PDI 2026-05-28
**Behaviour:** On a Personal Developer Instance, `gs.sendEmail()` goes to SMTP directly and leaves no
`sys_email` row; `GlideEmailOutbound` with `.save()` does not persist; and an event-driven
notification processes without creating one. Inserting a `sys_email` record with `type=send-ready`
and `state=ready` does create a visible, queryable row. The row then shows `state=ignored` — a PDI
suppresses delivery but keeps the record, which is the correct outcome for a test.
**Grounding:** none in ServiceNowDocs (`markdown/platform-administration/activate-email-service.md`
for the baseline concept); observed behaviour
**Evidence:** observed on PDI; regression test — none (platform, not server)
**Engine consequence:** designs keep baseline Notifications and events (§1.1). The Developer skill and
the ATF Author put the PDI limitation in the **test strategy**: on a PDI, neither `gs.sendEmail()` nor
an event-driven notification leaves a `sys_email` row, so a test plan that says "check `sys_email`" is
untestable there — verify on a non-PDI instance, or insert a `sys_email` row as an explicit test
fixture, never as the implementation.

## PN-03 — `action=DELETE` rows in an update set are normal and cannot be removed

**Applies to:** `sys_update_xml` · Australia family · observed on PDI
**Behaviour:** Deleting a tracked object while an update set is active captures an `action=DELETE`
entry in `sys_update_xml`. The entry cannot be deleted over REST (the ACL refuses), and it is not a
defect: it is the instruction that removes the same object on the target instance at promote time. It
does not affect the `INSERT_OR_UPDATE` entries in the same set.
**Grounding:** none in ServiceNowDocs
(`markdown/application-development/system-update-sets/customizations-tracked-update-sets.md` for what
is tracked); observed behaviour
**Evidence:** observed on PDI; regression test — none (platform, not server)
**Engine consequence:** the DevOps / Release Manager consult treats DELETE rows in an update-set
preview as expected content, and never proposes "cleaning" a set before promotion.

## PN-04 — Incident state 6 (Resolved) requires a `close_code` from the instance's own choice list

**Applies to:** `incident`, `sys_choice` · Australia family · confirmed on PDI 2026-06-26
**Behaviour:** Setting `state=6` over REST is rejected unless `close_code` holds a value that is an
active choice for `incident.close_code` **on that instance**. Instances carry customised choice
lists, so a value that is standard elsewhere — including `Solved (Permanently)` — may not exist on
the instance in front of you. Query the choices first:
`sys_choice` filtered by `name=incident`, `element=close_code`, `inactive=false`. On success
`resolved_by` and `resolved_at` are set by the baseline business rule.
**Grounding:**
`markdown/it-service-management/incident-management/resolve-and-close-an-incident.md`
**Evidence:** observed on PDI; regression test — none (platform, not server)
**Engine consequence:** the ITSM gateway's Data Model Alignment lists the instance's valid
`close_code` values before any resolve write is designed, rather than assuming the standard list.

## PN-05 — Assignment rules are `sysrule_assignment`, and the table field is `document`

**Applies to:** `sysrule_assignment` · Australia family · confirmed on PDI 2026-06-01
**Behaviour:** The REST-accessible table for assignment rules is `sysrule_assignment`; a create
against `assignment_rule` is refused with `INVALID_REQUEST`. Three field names differ from what the
form labels suggest: the target table is `document` (not `table` or `collection`), the group is
`group` (not `assignment_group`), and `condition` is an encoded query. The record is captured in the
active update set like any other configuration object.
**Grounding:** none in ServiceNowDocs (`markdown/core-business-suite/assignment-rules-cbs.md` for the
baseline concept); observed behaviour
**Evidence:** observed on PDI; regression test — none (platform, not server)
**Engine consequence:** Technical Designer and Developer name `sysrule_assignment` and its three
fields explicitly in any assignment-rule design, because the obvious names are all wrong and the
failure is an `INVALID_REQUEST` that says nothing about which name to use instead.

## PN-06 — Basic-auth credentials reach the outbound HTTP log at verbose levels

**Applies to:** outbound REST, `sys_outbound_http_log` · Australia family · confirmed on PDI 2026-06-08
**Behaviour:** With verbose request logging on — the system property
`glide.outbound_http_log.override` set true **and** the level at `all` or `elevated` — an outbound
call's request headers are written to the outbound HTTP log, `Authorization` included. For basic
auth that is the base64 of the user name and password, in clear, in a queryable platform table. At
the default `basic` level request headers are not logged. This is true of any scheme whose secret
rides in a header, bearer tokens and API keys included.
**Grounding:**
`markdown/platform-security/instance-security-hardening-settings/sc-prevent-verbose-http-request-logging.md`,
`markdown/api-reference/web-services/outbound-logging-configure.md`
**Evidence:** observed on PDI, and the two pages above state the override and the per-call level;
regression test — none (platform, not server)
**Engine consequence:** the Security and GRC consult treats the outbound log level as a security
control rather than a debugging knob — a design carrying an auth header sets `basic` explicitly on
the message, holds the secret in a Connection and Credential Alias, and any raise to `all` or
`elevated` goes through change with a post-deploy check that no header value was logged.

## PN-07 — `sys_script_fix.name` is truncated to 40 characters without an error

**Applies to:** `sys_script_fix` · Australia family · confirmed on PDI 2026-08-28
**Behaviour:** A Fix Script created over the REST Table API with a 44-character `name` was stored with
40, cut mid-word and with a trailing space. The call returned success and echoed the truncated value.
`sys_name` is truncated identically, so the display value is wrong everywhere it appears, including
`sys_update_xml.target_name` for the captured update — which is the name that travels to the target
instance. The API does not reject over-length input for a short label field; it trims it.
**Grounding:** none in ServiceNowDocs (`markdown/application-development/c_FixScripts.md` for the
baseline concept); observed behaviour
**Evidence:** observed on PDI; regression test — none (platform, not server)
**Engine consequence:** the Developer skill keeps `sys_script_fix.name` at 40 characters or fewer, and
reads the stored `name` back from the create response instead of assuming what was sent was kept —
the same check being worth applying to any short label field written over REST.
