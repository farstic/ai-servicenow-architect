# Validation run — 2026-10-19 — macOS — the ITSM sweep, partial (ARC-09-C167b group 1)

The owner's live run of the ITSM sweep, the first group of ARC-09-C167b, on a development tree of develop
`23f85222` (2.2.1-dev), which carries ARC-09-C183's pre-write data-policy check. The owner ran steps 0 to 4 and stopped
there. Steps 5 to 10 were not run. The architect session transcribed the results from the owner's pastes.

The instance is cited by its label, `pditestdoit`: the same PDI as `tgdev`. No URL, account or sys_id appears here.
The engagement's name, which prefixed the update set, is written `<engagement>`.

| Field | Value |
|---|---|
| **Date** | `2026-10-19` |
| **Observer** | the owner, in Claude Code; transcribed by the architect session |
| **Machine** | macOS, the owner's |
| **Clean?** | no: a development tree |
| **Product version** | `2.2.1-dev`, develop `23f85222` |
| **Instance** | `pditestdoit`, Brazil patch 0 (the bundled corpus is Australia) |
| **Mode** | live |
| **Preset** | custom |
| **Writes allowed** | each write approved in the session, one question per call |

## Install timeline

A development tree at develop `23f85222` (2.2.1-dev), run live against `pditestdoit`. A development tree is exempt
from the integrity check, which is why E-32 was skipped, and the licence is enforced. The install's own steps were not
transcribed.

## Doctor summary

Status printed `Mode: live — instance=pditestdoit (pdi) preset=custom`, with the Engine at 2.2.1-dev and the roster
at 29 skills and 9 agents. The doctor reported 15 ok, 1 warn (E-23, hygiene) and 0 fail. E-32 was skipped, as it is for
a development tree, and the licence was ok.

## Tests

| Step | Result | Evidence |
|---|---|---|
| 0 — Status | pass | The lines above. |
| 0b — ARC-09-C183's tables | pass | `sys_data_policy2` (302 rows) has the columns the engine reads — `model_table`, `conditions`, `inherit`, `active` — among `short_description, description, model_id, enforce_ui, apply_import_set, apply_soap, reverse_if_false, sys_policy, sys_overrides`. `sys_data_policy_rule` (585 rows) has `sys_data_policy`, `field` and `mandatory`, among `table` and `disabled`. Active policies: incident 1 ("Make close info mandatory when resolved or closed", condition `stateIN6,7`, fields `close_code`, `close_notes`); problem 8, all conditional on state or resolution code, plus a `prb_model` clause; change_request 1, read-only rules on `chg_model` and `chg_model_template`, none mandatory. No inheriting policy on `task`. All are conditional, so ARC-09-C183 reports them as "may be required" and none blocks. |
| 1 — Incident read | pass | The 5 most recent incidents, with number, short description, state and assignment group; the state labels read from `sys_choice`; 10,125 incidents in total. No `INVALID_REQUEST`. |
| 2 — `snow_inc_incident_add` | pass | Before writing, the Architect resolved the caller, the group (an exact-name match among five "Network…" groups) and the category value. It said that an incident is a data record the update set does not capture (preview 0), and that the ensure and capture calls would move the capture preference. It then asked one enumerated question. After `write approved` the incident was created with impact and urgency 2/2, giving priority 3, state New, and "no warnings". Update set `<engagement>-itsm-sweep` was created, and the preview showed 0 changes, as predicted. |
| 3 — `snow_inc_incident_modify` | pass | "Service Desk" had no exact match, so three candidates were listed and "Global Service Desk" was assumed and stated. One modify call wrote the work note and the reassignment. The work note was verified by reading `sys_journal_field`: the modify's answer shows a journal field empty, which is the platform's behaviour. `reassignment_count` went from 0 to 1, with no warnings. |
| 4 — `snow_inc_incident_resolve` | pass, one defect | "Solved (Permanently)" is not a close code on this instance. The Architect read the 20 active `incident.close_code` choices, refused to guess and asked; the owner chose "Other". The resolve set state 6, close code Other, close notes "sweep test" and `resolved_by`, with no warnings; the close-info data policy was satisfied. **Defect:** `resolved_at` was stored as `2026-10-19 00:00:00` for a write at about 06:31 UTC. `calendar_stc` came out at −23217 and `calendar_duration` at 1970-01-01 17:33:03. This is ARC-09-C184. |
| 5–10 | not run | Problem, change, task query, update-set preview, restore and Status. The owner's capture preference was left on `<engagement>-itsm-sweep`; step 9, the restore, did not run. |

## Observer notes

- **Which tool read the incidents at step 1 is not named in the pastes.** Its answer — 5 records and a total of
  10,125 — is the shape of `snow_core_records_query`. That is the only tool that lists records with a total; the
  incident family's `snow_inc_incident_read` returns one record by number or sys_id. The ledger attributes the read to
  `snow_core_records_query` on that ground.
- **The Architect used ARC-09-C183's knowledge.** It sent `close_code` and `close_notes` with the resolve, the two
  fields the incident policy makes mandatory at state 6 or 7.
- **The close codes differ from the corpus.** This instance's list lacked "Solved (Permanently)" (PN-23).

## Defects raised

| What | Where it went | Id |
|---|---|---|
| `snow_inc_incident_resolve` sent `resolved_at` as an ISO string (`new Date().toISOString()`), and the instance stored the date alone, at midnight. `snow_prb_problem_resolve` did the same. | Fixed in the pull request that carries this record: both send `yyyy-MM-dd HH:mm:ss` in UTC through one helper. Red first in `packages/snowarch/tests/tools/date-stamps.test.ts`. The live re-check is one resolve on the next rc. | ARC-09-C184 |

## Verdict

- **ARC-09-C167b group 1: PARTIAL.** Four tools ran, with one defect (ARC-09-C184). Steps 5 to 10 remain for a later
  session.
- **ARC-09-C183 live: CONFIRMED** on its tables and columns. Every ITSM policy found was conditional, so no create was
  refused before writing. The live refusal path waits for an unconditional policy.
