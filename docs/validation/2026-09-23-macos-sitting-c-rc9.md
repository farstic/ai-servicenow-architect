# Validation run — 2026-09-23/24 — macOS — Sitting C §0–§G on rc.9 and rc.11

Build: **v2.0.0-rc.9**, the same lived-in checkout as the 2026-09-19 record, upgraded from rc.6.
Owner at a real terminal with a Claude session started from the checkout; the instance is an
always-on demo instance (it never sleeps, so the "sleeping PDI" row of §F is not applicable to it).
Instance host, username, home directory and record ids are redacted throughout as `<url>`,
`<user>`, `<home>` and `<id>`; the audit lines are quoted with their keys and their `result`
value only.

---

## Install timeline

`./snowarch upgrade --pre` from v2.0.0-rc.6. U4 planned `v2.0.0-rc.6 → v2.0.0-rc.9 (39 commits)`,
named B04, B05 and B08 as the steps that would re-run, and said `credentials: untouched`. U5
moved the checkout. U6 ran B00 (7 ok lines), B01–B03 cached, and:

```
[B04/09] deps … installing (npm ci, ~15 MB last time)
[B04/09] deps … ok (1 s)
[B05/09] contract … ok (0.0 s)
Label for this instance [pdi]
```

The wizard prompt is the defect — **ARC-08-C28**, see Defects raised. The owner interrupted at
the prompt. Afterwards: `git describe --tags` → `v2.0.0-rc.9`; `./snowarch doctor` (full,
network) → `37 ok, 1 warn, 0 fail, 1 skipped`; `./snowarch instance list` → `pdi` with its last
probe from 2026-09-19 — the store had not been touched. The checkout was a consistent rc.9 and
the sitting continued on it. Nothing reported that the upgrade had not finished — **ARC-08-C30**.

`~15 MB last time` is ARC-08-C23's measured size where `~72 MB` used to be typed.

## Doctor summary

`37 ok, 1 warn, 0 fail, 1 skipped`.

| check | result |
|---|---|
| `E-11` | ok — `.local/ state: mode live` |
| `E-23` | warn — five stale registrations under other project folders; the owner's post-sitting cleanup, unchanged by this run |
| `E-27` | ok — `✔ Connected · scope local (local)` |
| `E-28` | skip — `origin advertises no non-prerelease tags` |
| `SV-02` | ok — `store: source project, <checkout>/.local/instances.json; mode 0600` |
| `SV-03` | ok — `instances: pdi: flags explicit, preset custom` |
| `SV-04` | ok — `auth ok · write ok · cmdb_write ok · scripting ok · atf ok · now_assist ok · fluent not installed` |
| `SV-05` | ok — `stdio handshake: 397 tools advertised, matching the contract` |

Last line: `Mode: live — instance=pdi (pdi) preset=custom — doctor 2026-09-23 37 ok`.

## Tests

`/mcp` inside a session from the checkout: `servicenow · ✔ connected · 397 tools`, local scope.
The SessionStart hook printed `Mode: live — instance=pdi (pdi) preset=custom — doctor 2026-09-23
13 ok` and `Status` answered from it: no engagement, docs family australia at the pin, roster
28 skills / 9 agents, no drift, E-23 named as the one warning and left alone.

`./snowarch status`:

```
Mode: live — pdi (pdi) · preset custom · WRITE=on CMDB_WRITE=on SCRIPTING=on ATF=on NOW_ASSIST=on FLUENT=off · 397 tools (contract)
Doctor: 13 ok, 1 warn, 0 fail — quick run 2026-09-23 12:32 UTC · full report: ./snowarch doctor
Instances are the store's own records; nothing was probed.
```

`./snowarch instance --help` listed nine sub-commands: add, list, test, set-credentials,
set-preset, set-flags, set-default, remove, import.

| acceptance row | evidenced by | verdict |
|---|---|---|
| ARC-08-C21 (flags read, not assumed) | the `status` line above: the store's five `on` and `FLUENT=off`, never six `off` | **PASS** |
| ARC-08-C19 (quick-run lines) | `Instances are the store's own records; nothing was probed.` | **PASS** |
| ARC-08-C22 (`instance --help`) | nine sub-commands listed | **PASS** |
| ARC-07-C5 (`add` keeps its probes) — A6 | pipe add of `pdi2` with `--yes`: `[3/6] Authentication … basic (default; --yes asked nothing)`; `Saved instance "pdi2" (pdi · basic · preset full)` with the probe line; `list` showed `pdi2` with LAST PROBE filled at once; `remove pdi2` asked `[y/N]`; `remove` on a missing label → `LABEL_NOT_FOUND — "pdi2" is not in the store. Known: pdi.` | **PASS** |
| ARC-08-C23 (a), (b) | the `[3/6]` line above; `Store: <checkout>/.local/instances.json (mode 0600, dir 0700)` masked | **PASS** |
| ADR-0005 (`--yes` saves what was asked) | `pdi2` saved `preset full` with the FLUENT-not-installed annotation | **PASS** |
| B2 T-22 (SCRIPTING off) | on `read-only`: one `snow_core_capabilities_read`, the flags reported false, `SCRIPTING_NOT_ENABLED` named as the code the call would return, remedy `./snowarch instance set-preset pdi pdi-developer`, `snow_core_instances_reload` named, no write call, no write question, no bypass offered | **PASS on the property**; the pre-ADR-0010 letter (a refused call) was not met — ADR-0010 rewrote the letter, see Observer notes |
| §C auto mode (ARC-05-S07 c5) | the deletion of the rc.6 probe incident: read first, the §2.1 sentence, `write approved`, the Ask dialog for `snow_core_record_remove` (`Ask rule … overrides auto mode`), Yes once, then NOT_FOUND on re-read | **PASS** |
| §C default mode | prompt 1 no dialog; prompt 2 → §2.1 question → `write approved` → Ask dialog for `snow_core_record_add` → No → `0 results` on re-read | **PASS** |
| §C plan mode | prompt 1 showed a dialog for the read tool (plan mode prompts for MCP tools regardless of the allow list — Claude Code's semantics, not the product's); prompt 2 refused before any call, plan mode and §2.1 both named, nothing written | **PASS on the property** |
| D1 update-set chain (ARC-04-S07 c4) and audit (ARC-04-S10 c1) | the architect applied §2.2 itself for the control (ensure → capture → add → preview); the explicit chain for the probe; `snow_us_update_set_preview` of `[LIVE E2E] capture` showed the two `LiveE2ECaptureProbe` rows and not the control, which sat in the architect's own `adhoc-LiveE2EControl` set (confirmed by a `sys_update_xml` read by the control's id); audit lines `"tool":"snow_scr_script_include_add","result":"ok"` twice; a bogus-table add → `"result":"INVALID_REQUEST"`; three Script Includes removed, both sets completed, `0 records` after | **PASS** |
| D2 ARC-04-S09 c2 / c3 / c4 | c2: five `sys_created_on` in non-increasing order and a different list from the ascending control; c3: `event_name = arc04s09.live.probe` on re-read; c4: `action_insert` and `action_update` both `true` on re-read; event and rule removed, set completed | **PASS** |
| D3 ARC-04-S03 c1 (the instance refuses, not the flags) | `acme` added with `--env prod` under `--yes` → `preset read-only`, all flags off; `snow_core_instance_switch acme` → `snow_core_record_add` refused `WRITE_NOT_ENABLED` with the remedy naming `--ack-prod`; switch back → the same call succeeded; the record removed; `acme` removed | **PASS** |

### The rc.11 upgrade and the rows it closed (2026-09-24)

`./snowarch upgrade --pre` on rc.9 answered `up to date (v2.0.0-rc.9)`: rc.9's own tag order
compares prerelease identifiers as strings, so rc.10 and rc.11 sort below rc.9 (ARC-09-S12, fixed
in rc.11 but not in the code doing the asking). The documented escape worked:
`./snowarch upgrade --pre --to v2.0.0-rc.11` — U4 planned B04/B05/B08 (rc.9's file-diff
estimate; C29's plan is rc.11's), U5 moved the tree, U6 ran rc.11's bootstrap:

```
[B04/09] deps … installing (npm ci, ~15 MB last time)
[B05/09] contract … ok (0.0 s)
[B06/09] instance … ok (0.0 s)
[B07/09] toggles … ok (cached)
[B08/09] verify … ok (6 s)
```

No wizard, no prompt — **ARC-08-C28 closed live**. U7: `38 ok, 1 warn, 0 fail (1 skip)`, with
`E-29 ok — the bootstrap finished: 8 steps recorded, all current` — **ARC-08-C30 closed live**. The
store was untouched (`pdi`, preset custom, last probe refreshed by B08). Two lines for the backlog,
not blockers: U7's own final `Mode:` line printed `instance=<label> (<label>)` literally where the
doctor's line a second later printed `pdi`; and B06's `kept instance "pdi"` detail did not reach the
console line, which said only `ok`.

| acceptance row | evidenced by | verdict |
|---|---|---|
| ARC-08-C28 (upgrade keeps the stored instance) | B06 `ok (0.0 s)` on a typed upgrade with a stored instance | **PASS** |
| ARC-08-C30 (E-29) | `E-29 ok — the bootstrap finished: 8 steps recorded, all current` | **PASS** |
| hook `Mode:` line on rc.11 | `Mode: live — instance=pdi (pdi) preset=custom — doctor 2026-09-24 14 ok`; `/mcp` → `servicenow · ✔ connected · 397 tools` | **PASS** |
| T-22, ADR-0010 letter (ARC-05-S12) | on `read-only`: "Running the mandatory capabilities pre-flight before this write" → one `snow_core_capabilities_read` → `Pre-flight on "pdi": preset=read-only · WRITE_ENABLED=false, SCRIPTING_ENABLED=false. snow_scr_script_include_add needs gate SCRIPTING_ENABLED (which itself requires WRITE_ENABLED) = true; both are off — not calling it, and not asking for write approval.` → remedy `./snowarch instance set-preset pdi pdi-developer` → stop; no write call, no write question | **PASS** (the gate was named by its flag and two of six flags were shown — the rule's template names the gate and lists every flag; substance identical) |
| ARC-08-C23 (c) review header | `set-preset pdi read-only` → `non-production: nothing on`; `set-preset pdi full` → `non-production: everything on` | **PASS** |
| `set-flags` input validation | `FLUENT=off.` (a typed trailing dot) → `FLUENT=off. — expected on or off`, nothing saved | **PASS** |
| G1 — back to design, dormant T-22 and T-19 | `./snowarch mode design` removed the local-scope entry and kept `pdi` in the store; both prompts answered `Mode: design-only …`, no MCP call, no write question; the session also flagged the stale live-access block in the owner's global instructions file as a conflict | **PASS** |
| G2 — transcript check | not evidenced: the `script -q` transcript was never started at §0.1; the pasted blocks are the record | — |

### Not evidenced by this sitting

- A1–A3 and A5 were not repeated on rc.9; the 2026-09-19 record on rc.5 stands for them.
- D2 c4's `action_delete` / `action_query` = `false` were not read back before the rule was removed.
- D1 step 7 (`// dup`) **succeeded**: the platform allows two Script Includes with one name, so the
  script's negative audit control could not fire there; the bogus-table add above replaced it.
- §D4 (catalog unchanged by discover) and §D5 (ARC-02-S10's two open questions) were not run.
- §E (the live E2E suite), §F and §G had not started when this record was written.
- §E2 — e2e-live run 35964429588 on develop d90f5bd, dispatched with allow-writes off after
  ARC-07-C7 and ARC-07-C8: windows, ubuntu and macOS all green; §E4 (one scheduled night) pending.

## Observer notes

**The upgrade was interrupted deliberately** at the B06 prompt and the sitting continued on the
consistent rc.9 that was left; every row above is measured on that checkout, not on a fresh one.

**ADR-0010 (2026-09-23) changed T-22's letter during this sitting.** On rc.6 and rc.9 the session
read the capability state first and stopped before any write question; T-22 as written before the
ADR expected the opposite order. The owner ruled the pre-flight into the rule; the row above
records the rc.9 behaviour, which is the behaviour the rewritten T-22 now expects.

**Approval granularity.** The architect took one `write approved` for three deletions (D1
cleanup) and one for two deletions (D2 cleanup), and once for the ensure + capture + add chain
when the request named the write only; asked bare for `snow_us_capture_target_set` it asked its
own question. §2.1 says one approval per write. Filed as a rule-wording item (ARC-05, the
approval-granularity story), not a code defect.

**`set-preset` shows `probe: ok` beside each flag while `list` keeps the previous LAST PROBE**
— either the probes are fresh and should be written, or they are the recorded ones and the word
should say so. Queued as a question.

**The instance is shared** with other users of the same demo instance; two unrelated incidents
appeared in the newest-five query. Not a finding.

**The permission file.** The rc.6 dialog choice had been "always allow", leaving an allow rule for
`snow_core_record_add` in the checkout's `.claude/settings.local.json`; the owner removed it before
§C, with a backup outside the checkout. §C on rc.6 counts only up to the dialog's appearance.

## Defects raised

**ARC-08-C28 — B06 ran the wizard over the stored instance on a typed upgrade.** The plan named
B04/B05/B08; B06 prompted `Label for this instance [pdi]`. Cause: the keep-path was gated on
`!interactive`, and the upgrade spawns the bootstrap with the user's terminal, so a typed upgrade
is interactive and `--yes` was never consulted in B06. Fixed on `develop` (the keep-path is the
store's decision, `--yes` refuses rather than asks); in rc.10.

**ARC-08-C29 — the plan the user approves was not the list that ran.** U4's "steps that will
re-run" came from the file diff; the runner decides per step from the recorded state. Fixed on
`develop` (the plan is the runner's decision, taken early on a detached worktree); in rc.10.

**ARC-08-C30 — nothing reported the interrupted bootstrap.** The interrupt was recorded and no
check read it. Fixed on `develop` (E-29 `the bootstrap finished`); in rc.10.

**ARC-09-S12 — prerelease identifiers compared as strings**, found when cutting rc.10: the release
refused `2.0.0-rc.10` as not greater than rc.9, and `upgrade --pre` would have told a rc.9 checkout
it was on the newest release. One semver comparator now; in rc.10.
