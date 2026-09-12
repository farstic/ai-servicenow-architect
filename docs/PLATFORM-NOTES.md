# Platform notes

Platform behaviour learned on real instances, each with the corpus page it is grounded in. These are
facts about **ServiceNow**, not about this repository's server — a bug in a tool is a failing test in
`packages/snowarch`, and `packages/snowarch/CHANGELOG.md` carries the ones not yet fixed.

Ids are stable and chronological. Where the corpus has no page stating the behaviour the `Grounding:`
line says so and names the nearest page for the baseline concept — never an invented path.

**This file is one of four homes, not the home for everything.** A finding about this repository's
own server is a failing test under `packages/snowarch/tests/`; an install or Claude Code behaviour is
`docs/TROUBLESHOOTING.md` or a rule in `docs/CONTRIBUTING.md`; anything instance-specific is never
committed at all. The table in `docs/CONTRIBUTING.md` § *Where a finding goes* is the authority, and
`CLAUDE.md` § 11 is the short form a session reads.

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

---

## PN-08 — ROPC can be switched off instance-wide, and then no client id is the problem

**Applies to:** OAuth password grant (`oauth_token.do`), the wizard's `--auth oauth_ropc` · Australia family
**Behaviour:** The resource-owner password-credentials grant is disabled instance-wide by the
hardening property `glide.oauth.inbound.ropc.grant_type.disabled`. With it set, every ROPC token
request fails whatever the client id, client secret, user name and password are — the account and
the OAuth application are both fine, and there is nothing to fix on either. The wizard's own answer
is `OAUTH_ROPC_DISABLED`, offered beside "switch to basic authentication", because basic is the
path that still works on an instance hardened this way.
**Grounding:**
`markdown/platform-security/instance-security-hardening-settings/sc-disable-resource-owner-password-credentials-ropc-in-oauth-2-token-grants.md`
**Evidence:** the page above states the property and its effect; regression test — the wizard's
ROPC error table is unit-tested against `packages/snowarch/tests/fixtures/oauth-ropc-errors.json`
**Engine consequence:** an integration design that assumes ROPC checks the property before promising
it, and the fallback is named in the design rather than discovered during a cutover.

## PN-09 — A PDI hibernates, and a hibernating instance refuses connections

**Applies to:** personal developer instances (`devNNNNN.service-now.com`) · every family
**Behaviour:** A PDI that has been idle is put to sleep and has to be woken from the developer
portal before it answers. Until it is awake, a connection attempt fails at the network layer — the
name resolves, the TLS handshake may even complete, and the request then goes nowhere. It is not an
authentication failure, and re-entering a password will not fix it, which is exactly the confusion
worth naming: the wizard's reachability probe reports the network cause rather than blaming the
credentials, and the remedy is to wake the instance and run the command again.
**Grounding:** none in ServiceNowDocs (the developer-programme behaviour is not part of the product
documentation; the corpus documents instances a customer owns, e.g.
`markdown/platform-administration/configure-target-instance.md`, and says nothing about the
developer programme's sleep policy).
**Marked observed** rather than cited.
**Evidence:** observed while preparing ARC-07-S11's live suite
**Engine consequence:** a live test suite wakes the instance first and treats an unreachable PDI as
an environment problem, never as a failed assertion about the product.

## Windows notes — this repository, not ServiceNow

The notes above are ServiceNow behaviour. These are about the machine the engine runs on, and they
are here because a Windows reader looking for "why is it different on my machine" looks in one
place. Each says how it is known, because two of them are known differently.

**Git Bash is needed for the skills, not for the install.** `bootstrap.cmd` → `bootstrap.ps1` →
`node` uses no POSIX shell at all, and CI proves it by rebuilding PATH without Git Bash before every
Windows launcher run. But Claude Code's own Bash tool *is* Git Bash, and the in-session skills
(`/snowarch status`, `/snowarch setup-instance`) run `./snowarch …` through it — so **Git for
Windows is required for the skills** even though the installer never touches it. It also satisfies
the git ≥ 2.25 floor, which is why the prerequisites table asks for it once.

**PowerShell 5.1, never 7.** 5.1 is what every Windows 10/11 has; requiring 7 would mean requiring
an install before the installer runs. `bootstrap.ps1` is 5.1-clean (no `??`, no ternary, no
`-AsHashtable`) with a test that greps for each and proves the grep is not vacuous, and it carries a
**UTF-8 BOM** — 5.1 decodes a BOM-less file as the ANSI code page, which would turn every `—` and
`·` in the shared sentences into mojibake before a line ran. For the same reason the launcher writes
its JSON through .NET rather than `Set-Content -Encoding UTF8`, which on 5.1 means "UTF-8 *with* a
BOM" and produces files `JSON.parse` refuses.

**Line endings.** `.gitattributes` gives `*.ps1` and `*.cmd` `text eol=crlf`: the index keeps LF and
every checkout converts. A lone LF in a `.cmd` is a batch file that stops at the first line.

**Long paths.** The corpus checkout nests deeply. Windows' 260-character limit applies to the
`MAX_PATH` API, not to git's own operations, and `core.longpaths` is set by Git for Windows'
installer by default — no measured failure, and no action known to be needed. Recorded so that a
future long-path failure is not investigated from scratch.

**What is verified where.** Verified by CI on `windows-latest`, every run: `-ExecutionPolicy Bypass`
working under a Restricted *process* policy; the design-only path with Node **and** Git Bash removed
by rebuilding PATH; exit codes 0/2/3 from `cmd` and from `powershell.exe`; Node reading the state
PowerShell wrote; `snowarch.cmd` with and without Node; and the POSIX launcher under Git Bash
answering `MINGW64_NT` and printing the `winget` remedies rather than `apt`.

Pending the owner's Windows sitting, and recorded in `docs/spikes/OWNER-SITTING.md` rather than
assumed: the **double-click** experience (the `%CMDCMDLINE%` pause detection is a cmd convention,
not a documented contract), **Ctrl-C** propagation through `cmd` → `powershell` → `node`, a
**GPO-locked** `MachinePolicy` (which no runner can apply), and whether Claude Code expands
`${CLAUDE_PROJECT_DIR}` in `.mcp.json` on native Windows (S-03) — the fallback for which is
deliberately not built until that spike runs.
