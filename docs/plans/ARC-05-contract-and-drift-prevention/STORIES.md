# ARC-05 — Stories

Status: Draft · Decisions applied: D-01…D-06, Q-A, Q-B, R-1…R-3 · Source: README.md of this ARC · Last updated: 2026-09-04

Naming applied throughout (D-01, R-1, R-2): the server package lives in `packages/snowarch` (npm `@farstic/snowarch`, first release `2.0.0`); the MCP server key is `servicenow`, so every tool is `mcp__servicenow__snow_*`; the root launcher `./snowarch` runs `tools/snowarch/bin/snowarch.mjs`; the project skill is `/snowarch` with sub-commands `status` · `setup-instance` · `doctor`. Vocabulary: Mode `design-only` | `live`; Preset `read-only` | `pdi-developer` | `full` | `custom`. Wherever `01` still says `packages/snow-mcp`, `@farstic/snow-mcp`, `/status`, `/setup-instance` or `1.0.0`, read the values above.

Story-title mapping to the README's original list: README 1 → S01 + S02 (split: pin file and retired-name file have different generators and owners); README 2 → S03 + S04 (split: token/prefix/retired checks vs structural checks, because S04 depends on S05–S07's generators existing); README 3 → S05 + S06 + S07 (split per generated target; S07 depends on spike verdicts S-12/S-18, the others do not); README 4 → S08; README 5 → S09; README 6 → S10 (re-titled: `tools/snowarch` does not exist before ARC-06, so this story ships the loader and the no-literal guard that ARC-06/07/08 build on); README 7 → S11 (plus the `docs/ARCHITECTURE.md` section, which the README listed as a deliverable without a story).

## Story map
| ID | Title | Size | Depends on | Delivers |
|---|---|---|---|---|
| ARC-05-S01 | `required-tools.json`: engine pin with `used_by` and `contractSha256` | M | ARC-04 S06, S13; ARC-01 S04 | The engine's declaration of what it needs from the server, plus the pin-update tool |
| ARC-05-S02 | `retired-names.json` generated from the rename map | S | ARC-04 S01 (rename map retained) | The forbidden-word list with replacements, regenerable, flat for `jq` |
| ARC-05-S03 | `engine-lint.mjs` core: tokens, prefix, retired names, pin | M | S01, S02 | The engine-side half of drift prevention as one command |
| ARC-05-S04 | `engine-lint.mjs` structural checks: descriptions, path references, `used_by`, generated-file byte check, plugin validate | M | S03, S05, S06, S07; ARC-00 S-19 | The remaining lint checks and the shared check modules ARC-08's doctor imports |
| ARC-05-S05 | `gen-governance.mjs` framework, the rule file `.claude/rules/00-mode-and-mcp-gate.md` and the `PRESETS` block of `docs/MODES-AND-PRESETS.md` | M | S01; ARC-04 S03, S06, S07; ARC-02 S09 | The ~40-line always-loaded rule that replaces the §2.1/§2.2 prose |
| ARC-05-S06 | Error-code registry, `governance/mcp-protocols.md` and `docs/TROUBLESHOOTING.md` | M | S05; ARC-04 S02, S03, S04, S08, S11 (R-3) | One remedy table for the rule file, the wizard and the doctor |
| ARC-05-S07 | Generated `permissions.allow` / `permissions.ask` blocks in `.claude/settings.json` | M | S05; ARC-00 S-12, S-18; ARC-06 S01 | The mechanical half of §2.1 |
| ARC-05-S08 | Server `tests/contract.test.ts`: gates, presets, invariants, pin, dist parity | L | ARC-04 S01, S03, S05, S06, S13; S01, S06 | The server-side half of drift prevention |
| ARC-05-S09 | CI job `contract` and the release gate script | S | S03, S04, S08; ARC-01 S11 | Drift fails CI on both sides; ARC-09's release script has one gate to call |
| ARC-05-S10 | Contract loader for engine tooling and the no-literal-names guard | M | S01, S06 | `packages/contract/lib/contract.mjs` consumed by `tools/snowarch`, the doctor and the bootstrap; a test that proves no hard-coded names |
| ARC-05-S11 | Drift drill and contributor documentation | M | S01–S10 | Proven failure modes recorded in `docs/CONTRIBUTING.md`; `docs/ARCHITECTURE.md` "The contract" section |

## Stories

### ARC-05-S01 — `required-tools.json`: engine pin with `used_by` and `contractSha256`

> **Amendment 2026-09-08 (from the S01 delivery).**
> - **The first real pin raised TWO re-gates, and both were accepted after checking the source**
>   (not the contract — the contract is what is under suspicion):
>   `snow_intg_event_register` and `snow_flow_flow_action_add`, each `write/true` expected against
>   `scripting/true` declared, each verified at its `case` label calling `requireScripting()`. The
>   engine's expectations came from `00` §8, written before ARC-04 split the SCRIPTING gate. **Final
>   expectations: both `scripting/true`.**
> - **`snow_fluent_script_exec` did NOT re-gate.** The story predicted it would, and it is the tool
>   whose silent re-gate is the reason this file exists — but ARC-04-S08's F1 already corrected its
>   declaration to `scripting`, so engine and server now agree. Criterion 4 is therefore exercised
>   against a **fixture** contract, exactly as the story specifies, and not against the live one.
> - **`snow_flow_flow_add` stayed `write` while `snow_flow_flow_action_add` moved to `scripting`.**
>   Worth stating rather than smoothing over: adding a flow is a write, and adding an Action carries
>   a server-side script. The pair differing is the correct answer, not an inconsistency.
> - **`SNOW_PIN_PATH` was added alongside `SNOW_CONTRACT_PATH`, and it had to be.** With only the
>   contract overridable, a fixture run writes its conclusions into the COMMITTED pin: demonstrating
>   criterion 4 against a fixture that re-gates `snow_fluent_script_exec` to `write` left the real
>   file saying `write`, and the next honest run then refused because the real contract says
>   `scripting`. The tool was right both times; the harness was wrong. A fixture run must not be able
>   to edit the artefact it is pretending about.
> - **A closed stdin at the prompt is an abort, not a hang.** Ctrl-D — or any harness whose stdin
>   ends while the question is open — previously left the promise unsettled: Node printed *"Detected
>   unsettled top-level await"* and exited 13. `readline`'s `close` now resolves to `n`. Closing
>   stdin is not consent.
> - **`tests/run.mjs` now walks subdirectories.** It read only the top level, so
>   `tests/contract/required-tools.test.mjs` would have been written, committed, green by hand — and
>   never once run by `npm test`. The failure mode is silent: the file exists, so nobody asks why it
>   never fails. Root suite 114 → 128.
> - **`used_by` was derived from where each tool is actually used**, not from `00` §8 (which records
>   only that the 35 are cited, not by whom): the five core tools → the commands that call them, the
>   update-set chain → `§2.2`, every mutating tool → `§2.1`, and the domain tools → the skill or
>   agent directory that owns them. A test asserts every mutating tool carries a `§` citation, with
>   the two `[Unsupported]` stubs named as the deliberate exception.
> - **Amended by ARC-05-S02: the seed is 42, not 41.** `snow_core_instance_switch` was absent — it
>   changes no ServiceNow record, so nothing in the 35 + 5 + 1 derivation reached it — yet `03` S-23
>   names it among the 14 that must prompt, ARC-04 calls it the only way to change instance, and
>   ARC-05-S07's ask list must carry it. Added with `sessionMutates: true` and a `§2.1` citation.

> **Amendment 2026-09-08 (from ARC-04-S06, ratified). The ask-list generator must union `gates[gate]`
> with `alsoRequires`.** The contract gained an optional `alsoRequires` field: six tools sit behind a
> module-wide gate AND a case-level one (`now_assist` then `write`, `fluent` then `write`), and `gate`
> carries only the OUTER one — the gate that refuses first, which is what predicts the refusal a caller
> sees. A generator that reads `gate` alone will under-report what those six need. The six are
> `snow_ai_agentic_workflow_add`, `snow_ai_ai_agent_add`, `snow_fluent_build`, `snow_fluent_init`,
> `snow_nas_now_assist_skill_add`, `snow_orch_playbook_add`; the contract entry names the field, so the
> union needs no hard-coded list.
**As** the engine (Claude) **I want** a committed, machine-readable declaration of every server tool my governance texts and skills depend on — with the gate and mutating nature I expect for each — and a hash pin of the server contract I was written against **so that** a rename or a re-gate on the server side cannot merge without a conscious engine-side change.
**Context.** Closes P-36 (no machine-readable contract) and the `execute_script` → `snow_fluent_script_exec` rename-with-regate that nobody caught (`00` §8). `01` §11 fixes the shape: the 35 engine-cited tools (`00` §8) plus the five core tools, each `{ name, gate, mutates, used_by[] }`, and `contractSha256`. ARC README deliverable 1; acceptance criteria 1 and 5 (server-key agreement). Consumed by ARC-06 B05 (`01` §4.2), ARC-08 doctor, ARC-09 release tag message.
**Scope.** In: the file, its JSON schema, the pin-update command, a unit test on the engine side that the file is well-formed and internally consistent. Out: checking the file against the live server catalogue (S08 does that on the server side; S03 does the token side); any change to `packages/snowarch/src` (ARC-04 S06 owns the declarations); the permission blocks (S07).
**Design notes.**
- File: `packages/contract/required-tools.json`. Shape (keys sorted, 2-space indent, LF, trailing newline — the pin tool writes it, humans edit `tools[]` only):
  ```json
  {
    "$schema": "./required-tools.schema.json",
    "contractVersion": 1,
    "contractSha256": "<sha256 hex of packages/snowarch/dist/contract.json bytes>",
    "serverKey": "servicenow",
    "tools": [
      { "name": "snow_core_records_query", "gate": "none", "mutates": false, "used_by": ["§2.2", "VALIDATION-TESTS", "/snowarch doctor"] },
      { "name": "snow_us_capture_target_set", "gate": "write", "mutates": true, "used_by": ["§2.2"] }
    ]
  }
  ```
- `gate` enum: `none | write | scripting | cmdb_write | atf | now_assist | fluent` (the ARC-04 S06 enum, `01` §11). `mutates` means "changes state on the ServiceNow instance" (server-local state such as `snow_core_instance_switch` is `false`).
- `used_by` vocabulary (validated in S04): `§2.1`, `§2.2`, `/snowarch status`, `/snowarch setup-instance`, `/snowarch doctor`, `bootstrap`, `VALIDATION-TESTS`, or the directory name of an existing `.claude/skills/<name>` or `.claude/agents/<name>`.
- Seed content — 41 entries. The 35 from `00` §8: `snow_core_{records_query, record_add, record_modify, record_remove, record_read, table_schema_read, natural_language_modify, health_dashboard_read}`, `snow_us_{update_set_add, active_update_set_ensure, current_update_set_read, update_set_switch, update_sets_index}`, `snow_scr_{business_rule_add, business_rule_modify, business_rules_index, script_include_add, script_include_read, script_include_modify, script_includes_index}`, `snow_intg_event_register`, `snow_flow_{flow_add, flow_action_add}`, `snow_atf_atf_{test_exec, suite_exec}`, `snow_cmdb_reconcile`, `snow_inc_incident_{resolve, modify}`, `snow_deploy_background_script_exec`, `snow_fluent_script_exec`, `snow_perf_table_completeness_check`, `snow_rpt_{aggregate_query_exec, scheduled_job_add, report_add}`, `snow_disco_table_discover`; plus the five core tools `snow_core_capabilities_read`, `snow_core_instances_reload`, `snow_core_current_instance_read`, `snow_core_status_read`, `snow_us_capture_target_set` (`01` §11); plus `snow_us_update_set_preview` — the verify step of `contract.protocols.updateSetCapture[]` as ARC-04 S06/S07 define it (`["snow_us_active_update_set_ensure", "snow_us_capture_target_set", "<write>", "snow_us_update_set_preview"]`). The generated rule file cites it, and L09 (S04) requires every tool cited by `.claude/rules/**` to be declared here — hence 41, one more than `01` §11's "35 + 5" (recorded in the README).
- Seed expectations (the engine's *expectation*; S08 asserts the server agrees — a disagreement is the signal this file exists to raise): `*_index`, `*_read`, `records_query`, `table_schema_read`, `health_dashboard_read`, `table_completeness_check`, `aggregate_query_exec`, `table_discover`, `current_update_set_read`, `update_sets_index`, `update_set_preview`, the four `snow_core_*` core tools → `none / false`. `record_add|modify|remove`, `natural_language_modify`, `incident_resolve|modify`, `event_register`, `flow_add`, `flow_action_add`, `scheduled_job_add`, `report_add`, `capture_target_set` → `write / true` (`capture_target_set` per ARC-04 S06 acceptance 6 and S07). `update_set_add`, `active_update_set_ensure`, `update_set_switch`, `business_rule_add|modify`, `script_include_add|modify` → `scripting / true`. `atf_test_exec`, `atf_suite_exec` → `atf / true`. `cmdb_reconcile` → `cmdb_write / true`. `snow_deploy_background_script_exec` and `snow_fluent_script_exec` → `scripting / true`: ARC-04 S08 keeps both registered as `[Unsupported]` stubs with exactly that declaration (they return `UNSUPPORTED_ON_THIS_INSTANCE` under any preset that passes the gate), and both stay listed with `used_by: ["§2.2"]` because the generated §2.2 text names them as *not* substitutes. `snow_fluent_script_exec` is the tool whose gate changed silently once (`execute_script` → `fluent`, `00` §8); its history is the reason the REGATE path exists and is exercised by acceptance 4 against a fixture, not against the live declaration.
- `serverKey` duplicates `engine.config.json.mcp.serverKey` on purpose: a second, independently edited declaration that the lint (S03) cross-checks. `engine.config.json` remains the value of record (D-01); the generators read only `engine.config.json`.
- Pin tool: `node packages/contract/pin.mjs [--yes] [--accept-regate <tool>...]` (stdlib only). It hashes `packages/snowarch/dist/contract.json`, prints a *proposal* — new sha, tools added/removed from the contract, and for every required tool whose `gate`/`mutates` differ from the expectation a line `REGATE snow_fluent_script_exec: expected fluent/true, server declares write/true` — and applies it only after the maintainer confirms (Enter) or with `--yes` (principle 10 applied to maintainer tooling). It refuses (exit 1) while a required tool is missing from the contract or a REGATE line is not covered by `--accept-regate`; on acceptance it rewrites the expectation. It never edits `used_by`.
- Determinism: `dist/contract.json` must be byte-stable across OSes for the sha to be meaningful — ARC-04 S06 emits sorted keys, LF, trailing newline; `.gitattributes` (`*.json text eol=lf`, ARC-01 S07) keeps the working-tree bytes identical on Windows. S08 asserts the sha on all three CI OSes.
- Engine-side test: `tests/contract/required-tools.test.mjs` (node:test, stdlib): schema-valid; names unique and sorted; every name matches `^snow_[a-z0-9_]+$`; `used_by` non-empty; `serverKey` matches `^[A-Za-z0-9_-]+$` (`02` D-01 constraint on `add-json` keys).
**Acceptance criteria.**
1. `node -e "JSON.parse(require('fs').readFileSync('packages/contract/required-tools.json'))"` succeeds and the file validates against `packages/contract/required-tools.schema.json` in CI (`npm run lint:contract`).
2. The file lists exactly the 41 names above; each entry has `gate` from the enum, boolean `mutates`, non-empty `used_by`; entries are sorted by `name`.
3. Given `packages/snowarch/dist/contract.json` is committed, `node packages/contract/pin.mjs --yes` writes `contractSha256` equal to `shasum -a 256 packages/snowarch/dist/contract.json` (macOS/Linux) and `Get-FileHash -Algorithm SHA256` (Windows) — same value on all three OSes.
4. Given the server contract declares `snow_fluent_script_exec` with `gate: "write"` while the file expects `fluent`, `node packages/contract/pin.mjs --yes` exits 1 and prints exactly one line starting `REGATE snow_fluent_script_exec:`; with `--accept-regate snow_fluent_script_exec` it exits 0 and the entry now reads `"gate": "write"`.
5. Given a required tool is absent from the contract, `pin.mjs` exits 1 with `MISSING <name> — not in packages/snowarch/dist/contract.json` and leaves the file unchanged.
6. Changing `serverKey` in the file to `servicenow-mcp` makes `tests/contract/required-tools.test.mjs` pass (the file is self-consistent) but S03's lint fail with `L07` — recorded here so the split of responsibilities is explicit.
7. **Principle 10 (propose → review → apply).** Given a changed contract and a TTY stdin, `node packages/contract/pin.mjs` without `--yes` prints the proposal block (`Proposed pin: <new sha>` · `Tools added: …` · `Tools removed: …` · any `REGATE …` lines) followed by `Enter = apply · n = abort` and writes nothing until Enter; `n` exits 3 with the file unchanged. Given a non-TTY stdin and no `--yes`, it exits 2 with `pin.mjs: stdin is not a terminal — pass --yes to apply the proposal above` and writes nothing (so a CI job can never apply a pin by accident).
**Tasks.**
1. Write `required-tools.schema.json` (draft 2020-12; `additionalProperties: false`).
2. Author the 41 seed entries with the expectations above and `used_by` values derived from a grep of the current engine texts (`00` §8 table) mapped to their new locations.
3. Implement `pin.mjs` (propose → confirm → apply; `--yes`; `--accept-regate`; exit codes 0 applied / 1 refused (MISSING or uncovered REGATE) / 2 cannot run or non-TTY without `--yes` / 3 aborted by the maintainer).
4. Implement `tests/contract/required-tools.test.mjs`; add `npm run lint:contract` placeholder that runs it (S03 extends the script).
5. Run `pin.mjs --yes` against ARC-04's committed `dist/contract.json`; commit the sha.
**Test strategy.** Unit (node:test, all three CI OSes): schema, sorting, pin tool against fixture contracts (`tests/contract/fixtures/contract-*.json`: baseline, one tool renamed, one tool re-gated, one tool missing). Manual once: confirm the sha printed by `pin.mjs` equals the `snowarch contract --sha` output of the server CLI (ARC-04 acceptance).
**Dependencies.** ARC-04 S06 (declarations + `contract.json`), ARC-04 S07 (`snow_us_capture_target_set`, the `updateSetCapture` protocol), ARC-04 S08 (the two stubs stay registered), ARC-04 S13 (committed `dist/`), ARC-01 S04 (`engine.config.json` + schema with `mcp.serverKey: "servicenow"`, `mcp.package: "@farstic/snowarch"`, `mcp.packageDir: "packages/snowarch"` — D-01(d)).
**Size.** M — the file is small; the pin tool's diff/propose logic and fixtures are the work.
**Risks / open points.** The seed expectations for `snow_flow_*` and `snow_intg_event_register` (write vs scripting) may not match ARC-04 S06's seeding-script output; that is by design and resolved by `--accept-regate` with a commit message naming the change. If ARC-04 S08 later drops either stub from the catalogue entirely (rather than keeping the `[Unsupported]` registration), remove it here and from the §2.2 "not a substitute" line in S05.
**Definition of done.** Merged; `npm run lint:contract` green on ubuntu/macos/windows × Node 20/22/24; `docs/CONTRIBUTING.md` gains "Updating the contract pin" (finalised in S11); ARC-06 B05 and ARC-09 tag message can read `contractSha256`.

### ARC-05-S02 — `retired-names.json` generated from the rename map

> **Amendment 2026-09-08 (from the S02 delivery).**
> - **401 keys, not 400** — 394 renames + 6 identifiers + 1 removed tool, per the architect's ruling 1.
>   The test derives the count from the three sources; a literal would make every future rename a
>   two-file change and would say nothing about *why* the number moved.
> - **`snow_rpt_report_generate` comes from a shared file, not a third copy of the list.**
>   `packages/snowarch/retired-tools.json` is now the single source, read by `parity.test.ts`,
>   `contract.test.ts` and this generator. It carries the story and the reason beside each name, so a
>   reader of any of the three consumers can find out why.
> - **A rename whose destination was later REMOVED collapses to `(removed)`.** The first run refused
>   with `generate_report -> snow_rpt_report_generate (which is itself retired)`. The guard was right
>   that a chain existed and wrong to treat it as an error: this one is real history, and the honest
>   resolution is that the tool is *gone*, not moved. Left as a chain, the file would send a reader of
>   the old name to one that also does not exist — and the second hop is the one nobody checks. The
>   guard now fires only for a replacement that is retired-but-not-removed, which has no correct
>   reading: a second rename must be a new KEY in the map, never a changed value.
> - **Criterion 3 is stated as the property it was protecting.** "No key starts with `snow_`" was a
>   guard against a rename map whose keys had become new names; a removed tool is a `snow_` key *and*
>   a genuine retired name. The test now asserts: a `snow_` key must be in `retired-tools.json` AND
>   absent from `dist/contract.json`.
> - **`snow_core_instance_switch` added as the 42nd required tool** (architect's addition, folded in
>   here): `gate: none`, `mutates: false`, `sessionMutates: true`, `used_by: ["§2.1", "/snowarch
>   status"]`. S01's "41" amended below. The `§`-citation test gained the same assertion for
>   `sessionMutates`, so the field cannot carry a tool the approval rules were never told about.
> - **Four legacy-name allow-list rows, all owned by ARC-05, all the same principle:** a file whose
>   *subject* is the list of dead names cannot avoid containing them.
>   `packages/contract/retired-identifiers.json` and `retired-names.json` **are** the list;
>   `tests/contract/retired-names.test.mjs` asserts which words are and are not on it; and
>   `docs/CONTRIBUTING.md` explains the policy, which needs the words to be precise. Rewording to
>   shapes was the alternative and it makes the rule vaguer exactly where a reader needs it exact.
> - **And I broke the "run the suite after `git add`" rule while doing it.** The run that reported
>   141 passing happened before those files were staged, so the ratchet — which scans `git ls-files`
>   — could not see them, and nine CI cells went red on a tree that was green locally. That rule is
>   in CONTRIBUTING *because I broke it in ARC-02-S02*; writing it down was not enough. The fix in
>   both cases is the same and it is mechanical: stage first, then run.
> - **Criterion 4 run now, hits expected and NOT fixed here** (it is ARC-02-S12's sweep):
>   `CLAUDE.md` 14 · `.claude` 2 · `docs` 409 · `README.md` 0 · `tools` 0 — **425**. The `docs` figure
>   is dominated by files that are supposed to contain them: `docs/nowaikit-field-notes.md` (40), the
>   ARC plan documents that describe the migration (24 + 16 + 14), and 36 inside
>   `docs/spikes/S-15-npm-ci/fixture/`, which is a pre-relicensing build artefact kept as a fixture.
>   ARC-02-S12 will need an exclusion decision for the spike fixture, not a rewrite of it.
**As** a maintainer **I want** one flat, committed list of every retired tool name and every retired identifier with its replacement **so that** the lint, the doctor and a plain `grep` can all prove no governing text uses a name the server rejects with `UNKNOWN_TOOL`.
**Context.** Closes the file half of P-04 (118 retired occurrences) and P-05/P-15 (`mcp__nowaikit__`, `mcp__servicenow-mcp__`, NowAIKit). ARC README deliverable 2 and acceptance criterion 4 (`grep -rnw -f <(jq -r 'keys[]' …)`). ARC-02 S12 performs the sweep using this file; `01` §11 / DR-14 rules out any runtime alias layer, so the list is the only bridge from old to new names.
**Scope.** In: the generator, the file, the identifier list, a test that the committed file equals the generator output. Out: the sweep itself (ARC-02 S12); the lint that consumes it (S03).
**Design notes.**
- Source of truth for tools: `packages/snowarch/tool-rename-map.json` (394 keys → 394 unique values today, `mcp:tool-rename-map.json`; ARC-04 S01 keeps it in the package root for `tests/tools/parity.test.ts` only and `.npmignore`s it). Source for identifiers: `packages/contract/retired-identifiers.json`, hand-authored:
  ```json
  {
    "nowaikit": "servicenow",
    "NowAIKit": "AI ServiceNow Architect",
    "mcp__nowaikit__": "mcp__servicenow__",
    "mcp__servicenow-mcp__": "mcp__servicenow__",
    "mcp__snow-mcp__": "mcp__servicenow__",
    "packages/snow-mcp": "packages/snowarch"
  }
  ```
  `snow-mcp`, `servicenow-mcp` and `@farstic/snow-mcp` as bare words are deliberately **not** retired: they are legitimate in history sections (ARC-01 acceptance allows them in `docs/ARCHITECTURE.md` and ADRs), in ARC-10's legacy-store detector strings, and `@farstic/snow-mcp` is the npm record the owner forbids touching (D-01) — it must remain nameable in docs. The `mcp__…__` prefixes and the path are unambiguous and are retired.
- Generator: `node packages/contract/gen-retired-names.mjs [--check]` merges rename-map keys and identifiers into `packages/contract/retired-names.json` as one flat object `{ "<retired>": "<replacement>" }`, keys sorted, so that `jq -r 'keys[]'` yields exactly the forbidden words (the README's grep criterion). No metadata keys at top level — a `$schema` key would become a "retired name". `--check` exits 1 with a diff when the committed file is stale.
- Historical mentions: a line that must name a retired *identifier* (never a tool name) carries the marker `<!-- retired-name: historical -->` at its end; S03's lint honours the marker only in `docs/ARCHITECTURE.md`, `docs/decisions/*.md` and `docs/CHANGELOG.md`. The ARC README's grep criterion is amended to exclude marked lines (see README).
**Acceptance criteria.**
1. `node packages/contract/gen-retired-names.mjs --check` exits 0 on the committed tree; after adding a key to `retired-identifiers.json` it exits 1 and prints the missing key; after re-running without `--check` the file contains it.
2. `jq -r 'keys[]' packages/contract/retired-names.json | wc -l` equals 394 + the identifier count (400 with the six above); every value is a non-empty string; keys are sorted.
3. `jq -r 'keys[]' packages/contract/retired-names.json | grep -c '^snow_'` is 0 (no current name is ever listed as retired — a guard against a rename map whose keys became new names).
4. `grep -rnw -f <(jq -r 'keys[]' packages/contract/retired-names.json) CLAUDE.md .claude governance docs tools README.md | grep -v 'retired-name: historical'` returns nothing once ARC-02 S12 has run (recorded as the joint ARC-02/ARC-05 exit check).
**Tasks.**
1. Author `retired-identifiers.json`.
2. Implement `gen-retired-names.mjs` (stdlib; reads the rename map by relative path `../snowarch/tool-rename-map.json`).
3. Add `tests/contract/retired-names.test.mjs`: committed == generated; no key starts with `snow_`; no key equals a current contract tool name.
4. Wire into `npm run lint:contract`.
**Test strategy.** Unit on three OSes. The grep criterion is run manually at the end of ARC-02 S12 and automated by S03 (L03).
**Dependencies.** ARC-04 S01 (rename map location after the import).
**Size.** S — a merge of two JSON files and a check mode.
**Risks / open points.** If ARC-04 changes rename-map values (a tool renamed again after the 394-name migration), the old value must be *added* to the retired list, not replaced — the generator appends `history[]`? No: keep one file; ARC-04's parity test already forbids a value that is not in the catalogue, so a second rename is expressed as a new key in the map. Documented in S11.
**Definition of done.** Merged; test green on the CI matrix; `docs/CONTRIBUTING.md` says "never edit `retired-names.json` by hand".

### ARC-05-S03 — `engine-lint.mjs` core: tokens, prefix, retired names, pin

> **Amendment 2026-09-08 (from the S03 delivery).**
> - **One definition of clean, and it is `lib/scan.mjs`.** History is exempt from L01/L02/L03 per the
>   architect's ruling: `docs/plans/**`, `docs/spikes/**` (the S-14 records carry `mcp__plugin_…__`
>   prefixes as measured evidence) and `docs/CHANGELOG.md`. `docs/decisions/**` and
>   `docs/ARCHITECTURE.md` stay in scope behind the marker.
> - **`POLICY_FILES` had to exist, and the lint could not reach exit 0 without it.** A file whose
>   *subject* is the list of dead names must contain them: the ratchet and its allow-list, ARC-05-S02's
>   assertion about which words are retired, ARC-02-S02's negative fixtures, this lint's own suite, and
>   `docs/CONTRIBUTING.md`. Without the list, ARC-02-S12's "sweep until exit 0, then flip the constant"
>   plan has no reachable end state. Five entries, each named with its reason; the line to hold is that
>   naming the dead thing is what the file is *for*.
> - **L02 now honours the historical marker too**, not just L03. The real tree showed
>   `docs/decisions/ADR-0001-names.md` failing L02 for quoting the registration keys it *rejected* —
>   which is the decision that ADR records. A check that forbade it would make the record unwritable.
> - **L02 cannot be required today, and I have not forced it green.** The architect's ruling 2 put it
>   in the required set; the real tree has **5** L02 findings, three of them in `CLAUDE.md:295/299`
>   carrying the old prefixes, and two in that ADR pending its markers. Those are ARC-02-S12's to
>   sweep, and exempting `CLAUDE.md` to satisfy the ruling would be defeating the check rather than
>   passing it. **Required set is `L07,L11`; L01/L02/L03 are the reported SUMMARY**, and the named
>   constant in `scripts/ci/lint-name-summary.mjs` flips all three at once. **Architect decision
>   wanted** on the two ADR lines: adding `<!-- retired-name: historical -->` to them would clear
>   L02's ADR half now, but ADRs are immutable once Accepted, so I have not touched it.
> - **Criterion 2's hint is unreachable by Levenshtein alone.** `snow_core_query_records` and
>   `snow_core_records_query` are eight edits apart and one thought apart, so a distance-only
>   implementation gives no hint precisely where the hint matters most. L01 tries a **segment
>   reordering** first — same underscore-separated parts in a different order — then falls back to
>   distance ≤ 3. The criterion's exact expected line is asserted.
> - **A retired name is L03's finding, not L01's.** L01 skips tokens that appear in
>   `retired-names.json`, so one defect produces one message with one remedy rather than two.
> - **Findings must use forward slashes on every platform.** Three Windows cells went red on
>   `governance\mcp-protocols.md` versus `governance/mcp-protocols.md`. The fix is in the product,
>   not the test: a finding that cannot be diffed between cells, or pasted into a `grep` on another
>   platform, is worth less than one that can. The exemption lists are now `/` literals rather than
>   `join()` calls for the same reason — comparing a built path against a literal silently changes
>   *which files are checked*. Same class as ARC-04-S13's source scan; now a CONTRIBUTING rule.
> - **Current real-tree state, for ARC-02-S12:** `L01 0 · L02 5 · L03 72 · L07 ok · L11 ok`. L01 being
>   already clean is worth noting — every `snow_*` token in the engine's texts names a tool that
>   exists. The work is prefixes and identifiers, not tool names.
**As** a maintainer **I want** one command that fails when any engine text cites a tool the server does not have, uses a wrong MCP prefix, uses a retired name, or when the pin no longer matches the committed contract **so that** P-04 and P-05 cannot recur after ARC-02's sweep.
**Context.** ARC README deliverable 3 (first half) and acceptance criteria 1 (engine side), 4, 5 (prefix from `engine.config.json`). `01` §11 "Engine lint". ARC-02 S12 and ARC-02's acceptance criterion "engine-lint passes" depend on this story. ARC-08 E-checks "retired names" and "prefix consistency" import the check modules (S04 finalises the module boundary).
**Scope.** In: `packages/contract/lint/engine-lint.mjs` CLI, checks L01 (tool tokens), L02 (prefix), L03 (retired names), L07 (server-key agreement), L11 (sha pin), the scan set, output format, exit codes. Out: L04–L06, L08–L10 (S04); any auto-fix beyond `--fix-pin` delegation to `pin.mjs`.
**Design notes.**
- CLI: `node packages/contract/lint/engine-lint.mjs [--json] [--root <dir>] [--only L01,L03] [--require-claude]`. Stdlib only (`node:fs`, `node:path`, `node:crypto`). Exit 0 pass, 1 findings, 2 cannot run (missing `dist/contract.json`, unreadable config). Findings print one line each: `L01 FAIL governance/mcp-protocols.md:57 token snow_core_query_records not in contract (nearest: snow_core_records_query)`; `--json` emits `{ checks: [{ id, status, findings: [{ file, line, message }] }] }` with the same ids the doctor reuses.
- Scan set (fixed, from the README): `CLAUDE.md`, `README.md`, `.claude/**`, `governance/**`, `docs/**`, `tools/**`, `tests/**` — files `*.md *.json *.mjs *.js *.ts *.yml *.yaml *.txt`; never `vendor/**`, `node_modules/**`, `.local/**`, `packages/**` (the server has its own tests), `clients/**`, nor any `**/fixtures/**` directory (S01's `tests/contract/fixtures/contract-*.json` deliberately contain renamed and re-gated tools; S03's own fixture trees live under `packages/contract/lint/tests/fixtures/`). `docs/CHANGELOG.md` is exempt from L01 and L03 (it is history by nature) but not from L02.
- L01 tokens: every match of `/\bsnow_[a-z0-9_]+\b/g` must be a `tools[].name` in `packages/snowarch/dist/contract.json`. Also every `mcp__<key>__<tool>` token's `<tool>` part. Nearest-name hint by Levenshtein ≤ 3 over the catalogue.
- L02 prefix: every match of `/\bmcp__[a-z0-9-]+__/g` must equal `mcp__${engine.config.json.mcp.serverKey}__` — the value is read from `engine.config.json`, never hard-coded; the check also asserts `.mcp.json` has exactly one key under `mcpServers` and that it equals the same value (ARC README criterion 5, doctor E-check "prefix consistency").
- L03 retired: for each key of `retired-names.json`, a word-boundary match (`\b…\b` for `[A-Za-z0-9_]+` keys; literal match for keys containing `/` or `-`) is a finding, except lines ending with `<!-- retired-name: historical -->` in the three allowed files (S02) and except tool-name keys, which are never exempt. Finding text names the replacement: `L03 FAIL docs/USER-GUIDE.md:12 retired name "query_records" → use snow_core_records_query`.
- L07 server key: `required-tools.json.serverKey` == `engine.config.json.mcp.serverKey` == `dist/contract.json.server.suggestedName` == the single `.mcp.json` key.
- L11 pin: `sha256(packages/snowarch/dist/contract.json)` == `required-tools.json.contractSha256`; on mismatch the message is `L11 FAIL contract sha mismatch: pinned 0123… committed 89ab… — run node packages/contract/pin.mjs and review the REGATE/MISSING lines`.
- Windows: paths via `node:path`; files read as UTF-8; line numbers computed on `\n` after stripping `\r` (the `.gitattributes` LF rule makes this a no-op on a correct checkout).
**Acceptance criteria.**
1. On a tree where ARC-02 S12 has run, `node packages/contract/lint/engine-lint.mjs` exits 0 and prints `L01 ok · L02 ok · L03 ok · L07 ok · L11 ok` (one line per check).
2. Given a line `use snow_core_query_records` added to `governance/mcp-protocols.md`, the lint exits 1 with an `L01 FAIL` line naming the file, line and `nearest: snow_core_records_query`.
3. Given `mcp__servicenow-mcp__snow_core_records_query` in any scanned file, the lint reports both `L02 FAIL … prefix mcp__servicenow-mcp__ ≠ mcp__servicenow__` and `L03 FAIL … retired name "mcp__servicenow-mcp__"`.
4. Given `engine.config.json.mcp.serverKey` changed to `snow` (and `.mcp.json`, the rule file and the permission block regenerated), the lint passes L02 with the new prefix and fails L07 until `required-tools.json.serverKey` is updated — demonstrating that the prefix value comes from `engine.config.json`.
5. Given `docs/ARCHITECTURE.md` contains `formerly registered as nowaikit <!-- retired-name: historical -->`, L03 passes; the same line in `governance/governance-rules.md` fails (marker honoured only in the three allowed files).
6. Given `dist/contract.json` is rebuilt after any tool rename, the lint fails L11 with the sha-mismatch message until `pin.mjs` is run.
7. The command runs to completion in under 5 s on the full tree on `windows-latest` (no shelling out, no git).
**Tasks.**
1. Implement `lib/scan.mjs` (file walker with the fixed scan set and exemptions) and `lib/report.mjs` (text/JSON output).
2. Implement checks `checks/l01-tokens.mjs`, `l02-prefix.mjs`, `l03-retired.mjs`, `l07-serverkey.mjs`, `l11-pin.mjs` — each exports `run(ctx) → findings[]`.
3. Implement the CLI with `--only`, `--json`, exit codes.
4. Fixtures under `packages/contract/lint/tests/fixtures/tree-*/` (clean; token drift; prefix drift; retired name; historical marker).
5. Extend `npm run lint:contract` to run the lint; add it to ARC-01's CI `lint` job.
**Test strategy.** Unit (node:test) per check with fixture trees; one integration run over the real repository in CI on three OSes.
**Dependencies.** S01, S02; ARC-01 S04 (`engine.config.json`), ARC-06 S01 (`.mcp.json` committed — until then L07's `.mcp.json` leg is skipped with a `SKIP` line, never a pass).
**Size.** M — five checks plus a walker; the regexes are simple, the fixtures are the effort.
**Risks / open points.** `snow_` tokens in prose that are not tool names (e.g. a hypothetical table `snow_custom`) would false-positive; none exist today and the finding text makes the cause obvious. Middle-ground `mcp__plugin_…__` prefixes (S-14 hedge, D-06): if the plugin channel is re-opened, only `engine.config.json` changes and L02 follows.
**Definition of done.** Merged; green on the CI matrix; `docs/CONTRIBUTING.md` lists the check ids; ARC-02 S12 can use `--only L01,L03` as its exit test.

### ARC-05-S04 — `engine-lint.mjs` structural checks: descriptions, path references, `used_by`, generated-file byte check, plugin validate
**As** a maintainer **I want** the same lint to prove that skill descriptions fit the listing budget, that every internal path a document cites exists, that every `used_by` claim resolves, that every generated file is byte-identical to its generator's output, and that `claude plugin validate` passes where it can run **so that** a stale generated file or a broken governance citation is caught before merge.
**Context.** ARC README deliverable 3 (second half) and acceptance criterion 2 (byte diff of a generated file). `01` §11 lists description ≤ 500 and `claude plugin validate`; ARC-02's risk "governance relocation breaks citations — mitigation: ARC-05 lint checks internal path references". S-13 (description budget) and S-19 (`claude plugin validate` on headless CI) inform L04 and L10.
**Scope.** In: checks L04 (descriptions), L05 (path references), L06 (generated files), L08 (required-tools expectations vs contract — engine-side mirror of S08's assertion, so the engine lint alone detects a regate), L09 (`used_by` resolves), L10 (plugin validate); the check-module boundary ARC-08 imports. Out: ServiceNowDocs citation checking (ARC-03 `verify-citations.mjs`); skill frontmatter key rules beyond description length (ARC-02 S02's `tests/skills-lint.test.mjs` owns those and may import L04's module to avoid two implementations).
**Design notes.**
- L04: for every `.claude/skills/*/SKILL.md` and `.claude/agents/*.md`, YAML frontmatter `description` length ≤ 500 characters (counting code points); the frontmatter parser is a 40-line stdlib scanner (first `---` block, `key: value`, block scalars `|`/`>` supported) — no YAML dependency. Also asserts the `now-assist-specialist` hazard rule (an unquoted `description` containing `: ` colon-space; the same rule ARC-02 S02's agents lint enforces — L04 imports that module rather than re-implementing it).
- L05: in every scanned `.md`, each backticked or link-target path that starts with one of `CLAUDE.md`, `README.md`, `.claude/`, `governance/`, `docs/`, `templates/`, `tools/`, `packages/`, `scripts/`, `tests/`, `engine.config.json`, `.mcp.json` must exist relative to the repo root; `vendor/ServiceNowDocs/…` and `.local/…` are excluded (corpus may be absent; `.local` is runtime). Glob-looking paths (`*`, `<`, `{`) are skipped.
- L06: run every generator in `--check` mode in-process (`scripts/gen-governance.mjs --check`, `gen-retired-names.mjs --check`) and report a byte diff as `L06 FAIL .claude/rules/00-mode-and-mcp-gate.md differs from generator output (first difference at line 31) — run npm run gen`. Targets: `.claude/rules/00-mode-and-mcp-gate.md`, `governance/mcp-protocols.md`, `docs/TROUBLESHOOTING.md`, the `permissions.allow`/`permissions.ask` arrays of `.claude/settings.json`, the block between `<!-- PRESETS:BEGIN … -->` and `<!-- PRESETS:END -->` in `docs/MODES-AND-PRESETS.md` (S05; markers owned by ARC-02 S09), `packages/contract/retired-names.json`.
- L08: for each `required-tools.json.tools[]`, the `dist/contract.json` entry with the same name must exist and have equal `gate` and `mutates`; message `L08 FAIL snow_fluent_script_exec: expected fluent/true, contract declares write/true — run pin.mjs --accept-regate`.
- L09: every `used_by` value is in the fixed vocabulary or names an existing skill/agent directory (S01). Additionally, every tool token cited in `CLAUDE.md`, `.claude/rules/**`, `governance/**`, `.claude/skills/**`, `.claude/agents/**` must appear in `required-tools.json` (so a skill that starts citing a tool must declare the dependency); tokens in `docs/**`, `tests/**`, `tools/**` need only exist in the contract (L01).
- L10: if `claude` is on PATH, run `claude plugin validate .claude/skills` and `.claude/agents` (ARC-01 CI already does this "when the CLI is available"); if absent, print `L10 SKIP claude not on PATH` and exit 0 unless `--require-claude` is passed. ARC-00 S-19's verdict decides whether CI passes `--require-claude`; the lint does not assume the CLI can run headless.
- Module boundary for ARC-08: each check is `packages/contract/lint/checks/lNN-*.mjs` exporting `{ id, title, run(ctx) }` where `ctx = { root, config, contract, requiredTools, retiredNames, files }`; ARC-08's engine doctor wraps them as E-checks and maps ids in its table (ARC-08 S07).
**Acceptance criteria.**
1. Given a skill description of 501 characters, the lint fails `L04` naming the skill and the length; at 500 it passes.
2. Given `governance/governance-rules.md` cites `` `governance/mcp-protocol.md` `` (typo), the lint fails `L05` with the file, line and the missing path; the correct path passes.
3. Given `dist/contract.json` changes the gate of `snow_scr_script_include_add` from `scripting` to `write` and the maintainer runs `pin.mjs --accept-regate` but not `npm run gen`, the lint fails `L06` on `governance/mcp-protocols.md` (its required-tools table row changed) and on `.claude/rules/00-mode-and-mcp-gate.md` (its header carries the contract sha); after `npm run gen` both pass. (ARC README criterion 2.)
4. Given the contract and `required-tools.json` disagree on any `gate`/`mutates`, the lint fails `L08` — without running the server tests.
5. Given `.claude/skills/developer/SKILL.md` gains a sentence citing `snow_scr_client_script_add` and `required-tools.json` does not list it, the lint fails `L09` with `add it to packages/contract/required-tools.json with used_by ["developer"]`.
6. On a runner without `claude`, `L10` prints `SKIP` and the overall exit is 0; with `--require-claude` it is 2.
7. All checks run on `windows-latest` with identical findings to `ubuntu-latest` for the fixture trees (path separators normalised).
**Tasks.**
1. Implement the frontmatter scanner and L04.
2. Implement L05 with the prefix list and exclusions.
3. Implement L06 by importing the generators' `render()` functions (S05–S07) and comparing bytes.
4. Implement L08 and L09.
5. Implement L10 with `child_process.spawnSync('claude', …)` and the PATH probe.
6. Fixtures; documentation of ids in `docs/CONTRIBUTING.md`.
**Test strategy.** Unit per check with fixtures on the three OSes; integration over the real tree. L10 is exercised manually on a machine with the CLI and in CI according to S-19's verdict.
**Dependencies.** S03; S05, S06, S07 (generators for L06); ARC-02 S02/S03 (descriptions actually ≤ 500 — until then L04 is expected to fail and the CI job is `continue-on-error` only for L04, recorded in `ci.yml` with a comment naming ARC-02 S03); ARC-00 S-19.
**Size.** M — six small checks; the YAML scanner and path heuristics need care.
**Risks / open points.** L05 may flag paths mentioned as *examples* in docs (e.g. "create `docs/foo.md`"); mitigation: paths inside fenced code blocks are skipped. L10's headless behaviour is unknown until S-19.
**Definition of done.** Merged; CI matrix green (L04 exception as above until ARC-02 S03 merges); check ids table in `docs/CONTRIBUTING.md`; ARC-08 can import `packages/contract/lint/checks/*.mjs`.

### ARC-05-S05 — `gen-governance.mjs` framework, the rule file `.claude/rules/00-mode-and-mcp-gate.md` and the `PRESETS` block of `docs/MODES-AND-PRESETS.md`

> **Amendment 2026-09-08 (from ARC-04-S06, ratified). The ask-list generator must union `gates[gate]`
> with `alsoRequires`.** The contract gained an optional `alsoRequires` field: six tools sit behind a
> module-wide gate AND a case-level one (`now_assist` then `write`, `fluent` then `write`), and `gate`
> carries only the OUTER one — the gate that refuses first, which is what predicts the refusal a caller
> sees. A generator that reads `gate` alone will under-report what those six need. The six are
> `snow_ai_agentic_workflow_add`, `snow_ai_ai_agent_add`, `snow_fluent_build`, `snow_fluent_init`,
> `snow_nas_now_assist_skill_add`, `snow_orch_playbook_add`; the contract entry names the field, so the
> union needs no hard-coded list.
**As** the engine (Claude) **I want** the §2.1 write gate, the §2.2 capture sequence and the Mode semantics delivered as one short, always-loaded rule file generated from the contract **so that** the tool names, the prefix, the flag codes and the capture sequence I follow are the server's actual ones, in one place, and the 60-line §2.1/§2.2 prose leaves `CLAUDE.md`.
**Context.** Closes P-05 (gate keyed on the wrong prefix) and P-33 (§2.2 stated in four places with two naming generations — `CLAUDE.md`, `governance-rules.md`, `README.md`, `SETUP.md`). ARC README deliverable 4 (rule file) and acceptance criteria 2 and 5 (prefix exactly once, from `engine.config.json`). `01` §3 (`.claude/rules/00-mode-and-mcp-gate.md`, ~40 lines, always loaded — `00` §9: `.claude/rules/*.md` without `paths` frontmatter load at launch), §9 (design-only wording), §11 (§2.2 becomes `ensure → capture_target_set → write → verify`; ARC-04 S06/S07 fix the verify call as `snow_us_update_set_preview` in `contract.protocols.updateSetCapture[]`). ARC-02 S08 (`CLAUDE.md` ≤ 200 lines), ARC-02 S09 (`docs/MODES-AND-PRESETS.md` carries the preset table between `<!-- PRESETS:BEGIN … -->` / `<!-- PRESETS:END -->` markers "so ARC-05's generator can own it later") and ARC-08 S10 (runtime error mapping in the rule file) consume this.
**Scope.** In: `scripts/gen-governance.mjs` CLI and the generator module layout; the rule-file renderer; the `presets` block renderer for `docs/MODES-AND-PRESETS.md`; header convention; `npm run gen`. Out: the other three targets (S06, S07); editing `CLAUDE.md`/`governance-rules.md` to point at the rule file (ARC-02 S08/S06 — this story hands them the exact pointer text); the prose of `docs/MODES-AND-PRESETS.md` outside the markers (ARC-02 S09).
**Design notes.**
- CLI: `node scripts/gen-governance.mjs [--check] [--only rule|presets|protocols|permissions|troubleshooting]`. Stdlib only. Inputs: `packages/snowarch/dist/contract.json`, `packages/contract/required-tools.json`, `engine.config.json`. Renderers live in `packages/contract/gen/<target>.mjs`, each exporting `render(ctx) → string` (LF, trailing newline) and `target` (path). Hand-authored prose is a string literal inside the renderer module — the generated file's header says where to edit. `--check` renders in memory and exits 1 with a unified diff per differing target (L06 reuses this).
- Block-in-file targets: a renderer may also export `markers: { begin, end }`; the framework then replaces only the text between the first line matching `begin` and the first line matching `end` (both lines kept), leaving the rest of the file byte-identical. `presets.mjs` uses this on `docs/MODES-AND-PRESETS.md` with `begin = /^<!-- PRESETS:BEGIN/` and `end = /^<!-- PRESETS:END -->$/`, rendering the `01` §6.3 preset table (`Preset | WRITE | CMDB_WRITE | SCRIPTING | ATF | NOW_ASSIST | FLUENT | Use it when…`) from `contract.presets` plus a `custom` row; the "Use it when…" texts are literals keyed by preset name. Missing markers → exit 2 with `presets: markers not found in docs/MODES-AND-PRESETS.md — see ARC-02 S09`.
- Header (first line of every generated Markdown target): `<!-- GENERATED by scripts/gen-governance.mjs from packages/snowarch/dist/contract.json (sha256 <first 12 hex>) — do not edit; edit packages/contract/gen/rule-file.mjs and run npm run gen -->`. Including the sha makes *any* contract change a byte diff on every generated file, so ARC README criterion 2 holds unconditionally.
- Rule file target content (rendered; counts and names come from the contract, prefix from `engine.config.json`; ≤ 45 lines):
  ```markdown
  <!-- GENERATED … -->
  # Mode and MCP write gate

  ## Mode
  - The authoritative mode is the `Mode:` line printed at session start by the SessionStart hook. Quote it (`/snowarch status` does); never infer mode from any other file.
  - `Mode: design-only` — no ServiceNow instance. Every verdict is grounded in `vendor/ServiceNowDocs`; the rules below are dormant; never call an MCP tool.
  - `Mode: live` — the bundled server is registered as `servicenow`; its tools are named `mcp__servicenow__snow_*`. Current instance, preset and flags come from `snow_core_capabilities_read`, never from memory. Sub-agents never call MCP tools.

  ## §2.1 — Write gate
  - A mutating tool (`mutates: true` in the contract — <N> tools; the same set is the `permissions.ask` list in `.claude/settings.json`) is called only after an explicit "write approved" message from the user, in the current conversation, that names the specific action.
  - Not approval: the original task description; a "yes" to a routing or review proposal; an earlier general go-ahead; a preset or flag change made in the terminal.
  - Before any mutating call, ask exactly: `About to <action> on instance "<label>" — write approved?` and wait for the answer.
  - Self-approval is prohibited: approval is never inferred from context, urgency or logical flow.

  ## §2.2 — Update-set capture (before every configuration write: Script Include, Business Rule, Client Script, UI Policy, UI Action, ACL, Flow, table or field)
  1. `snow_us_active_update_set_ensure` `{ "name": "<engagement>-<topic>" }` — returns the in-progress update set created by the authenticated user, creating it if absent.
  2. `snow_us_capture_target_set` `{ "update_set_sys_id": "<sys_id from step 1>" }` — sets `sys_user_preference` `sys_update_set` for the authenticated user; REST writes are captured from now on.
  3. Perform the write (step 3 needs its own "write approved").
  4. Verify: `snow_us_update_set_preview` on the update set from step 1 — the written object appears as a `sys_update_xml` row.
  Not a substitute: `snow_us_update_set_switch` (sets `is_default` only); direct writes to `sys_update_xml` (`INSUFFICIENT_PRIVILEGES`); `snow_deploy_background_script_exec` and `snow_fluent_script_exec` (`UNSUPPORTED_ON_THIS_INSTANCE`). Retroactive capture is impossible — if steps 1–2 were skipped, stop and say so.

  ## Flags, presets, codes
  | Flag | Off → error code | Requires |
  |---|---|---|
  | `WRITE_ENABLED` | `WRITE_NOT_ENABLED` | — |
  | `CMDB_WRITE_ENABLED` | `CMDB_WRITE_NOT_ENABLED` | `WRITE_ENABLED` |
  | `SCRIPTING_ENABLED` | `SCRIPTING_NOT_ENABLED` | `WRITE_ENABLED` |
  | `ATF_ENABLED` | `ATF_NOT_ENABLED` | — |
  | `NOW_ASSIST_ENABLED` | `NOW_ASSIST_NOT_ENABLED` | — |
  | `FLUENT_ENABLED` | `FLUENT_NOT_ENABLED` | — |
  Presets: `read-only` (none) · `pdi-developer` (WRITE, CMDB_WRITE, SCRIPTING, ATF) · `full` (all six) · `custom` (explicit). A flag is on only when its value is the exact string `"true"`; absent means off. Reads are never gated by WRITE/SCRIPTING.

  ## Runtime errors — stop and give the remedy, never retry, never propose editing flags from inside Claude
  - `AUTHENTICATION_FAILED` → `./snowarch instance set-credentials <label>` (user's terminal).
  - `INSUFFICIENT_PRIVILEGES` → the account lacks a role for that table; name the table; do not try another tool.
  - `*_NOT_ENABLED` → `./snowarch instance set-preset <label> <preset>` (a `prod` instance additionally needs `--ack-prod`).
  - `NO_INSTANCE_CONFIGURED` → `/snowarch setup-instance`.
  - `PROD_WRITE_NOT_ACKNOWLEDGED` → the instance is `prod`; the user must run the `--ack-prod` command above.
  - `UNKNOWN_TOOL` → a retired name; use the `snow_*` name from `governance/mcp-protocols.md`.
  - `FLUENT_NOT_INSTALLED` → `npm i -g @servicenow/sdk`.
  Long form: `governance/mcp-protocols.md` · every code: `docs/TROUBLESHOOTING.md`
  ```
  The flag table rows (name, code and `Requires` from `contract.flags[]`), the preset lines, the `<N>` count, the §2.2 call names (steps 1, 2 and 4 are the first, second and last entries of `contract.protocols.updateSetCapture[]`; the `<write>` placeholder is step 3; the argument names for steps 1–2 are literals per ARC-04 S07) and the runtime-error lines (from `contract.errorCodes[]` filtered to `showInRule: true`, S06) are rendered from data; the prose sentences are literals. The prefix string appears exactly once (the `Mode: live` line) and is `mcp__${serverKey}__`.
- Hand-off text for ARC-02: `governance/governance-rules.md` §2 (ARC-02 S06) becomes: "§2.1 and §2.2 are generated from the server contract — read `.claude/rules/00-mode-and-mcp-gate.md` (always loaded) and `governance/mcp-protocols.md` (long form). Do not restate them elsewhere." `CLAUDE.md` (ARC-02 S08) keeps one line pointing at the rule file.
**Acceptance criteria.**
1. `node scripts/gen-governance.mjs --only rule` writes `.claude/rules/00-mode-and-mcp-gate.md`; `wc -l` ≤ 45; the file has no `paths:` frontmatter (so it loads at launch, `00` §9).
2. `grep -c "mcp__servicenow__" .claude/rules/00-mode-and-mcp-gate.md` prints `1`; after changing `engine.config.json.mcp.serverKey` to `snow` and regenerating, `grep -c "mcp__snow__"` prints `1` and `mcp__servicenow__` no longer appears. (ARC README criterion 5.)
3. The §2.2 section names exactly the calls in `contract.protocols.updateSetCapture[]` in order: `snow_us_active_update_set_ensure`, `snow_us_capture_target_set`, then the write, then `snow_us_update_set_preview` (ARC-04 S06/S07); none of `create_update_set`, `switch_update_set`, `query_records`, `updateSetSysId`, or a `sys_user_preference`-by-hand sequence appears. Test: render against a fixture whose protocol ends in `snow_core_records_query` and assert the fourth step names that tool instead — proving the step comes from the contract, not the literal.
4. The flag table has one row per `contract.flags[]` entry (six today); adding a seventh flag to the contract and regenerating adds a row — with no code change in the renderer.
4a. `node scripts/gen-governance.mjs --only presets` rewrites only the lines between the `PRESETS:BEGIN`/`PRESETS:END` markers of `docs/MODES-AND-PRESETS.md`; the bytes before the begin marker and after the end marker are identical before and after (test: split on the markers and compare); the rendered table matches `01` §6.3 row for row (`read-only` six `false`; `pdi-developer` WRITE/CMDB_WRITE/SCRIPTING/ATF `true`; `full` six `true`; `custom` "six explicit toggles"). With the markers removed the command exits 2 with the message above.
5. The `<N> tools` count equals the number of `mutates: true` entries in the contract (asserted by a test that renders against a fixture with 3 mutating tools and expects `3 tools`).
6. `node scripts/gen-governance.mjs --check` exits 0 immediately after generation; after editing one character in the target it exits 1 and prints a unified diff naming the line.
7. In a live session (manual, after ARC-06/07), `/snowarch status` and the rule file agree on the `Mode:` line wording; in design-only mode the rule file's dormant clause is present unchanged (the file is mode-independent; the mode is read from the banner).
**Tasks.**
1. Create `scripts/gen-governance.mjs` (target registry, `--check`, `--only`, diff printer).
2. Create `packages/contract/gen/ctx.mjs` (loads the three inputs; validates `serverKey` agreement; exposes `prefix`, `flags`, `presets`, `errorCodes`, `protocols`, `mutatingCount`).
3. Create `packages/contract/gen/rule-file.mjs` with the literal prose above and the data-driven sections; create `packages/contract/gen/presets.mjs` (block-in-file renderer) and the framework's marker-replacement path.
4. Add `npm run gen` (`node scripts/gen-governance.mjs`) and `npm run gen:check` to the root `package.json`.
5. Snapshot tests `tests/contract/gen-rule-file.test.mjs` and `tests/contract/gen-presets.test.mjs` against fixture contracts (baseline, seventh flag, different server key, different protocol tail).
6. Hand the pointer text to ARC-02 S08 (`CLAUDE.md`) and S06 (`governance-rules.md`) (recorded in the story's PR description and `docs/CONTRIBUTING.md`).
**Test strategy.** Unit snapshot tests on three OSes (LF enforced by the renderer, so snapshots are OS-independent). Manual: start `claude` in a checkout and confirm via `/memory` (or the context listing) that the rule file is loaded at launch (`00` §9: `.claude/rules/*.md` without `paths` frontmatter load at launch).
**Dependencies.** S01 (pin/expectations for the header sha); ARC-04 S03 (`PRESETS` and `flags[].requires` exported for the contract), S07 (`snow_us_capture_target_set` with `update_set_sys_id`, the named `active_update_set_ensure`), S06 (`protocols.updateSetCapture[]` in the contract — ARC-04 S06 already specifies the four-entry list; if its merged `extract-tools.mjs` leaves it empty, this story fills it and notes it in the ARC-04 PR); ARC-02 S09 (the `PRESETS:BEGIN/END` markers in `docs/MODES-AND-PRESETS.md` — until they exist the `presets` target is reported as `SKIP presets: docs/MODES-AND-PRESETS.md has no markers` by `--check`, never as a pass).
**Size.** M — the renderers are short; the wording is load-bearing and needs review against `governance-rules.md` §2.1/§2.2 to lose nothing.
**Risks / open points.** ~45 always-loaded lines in every session (ARC README risk) — offset by ARC-02 removing the ~60 lines of §2.1/§2.2 from `CLAUDE.md`; measured by ARC-02's `wc -l` criterion. The `About to … — write approved?` sentence is quoted by VALIDATION-TESTS (ARC-02 S13); changing it later means changing both.
**Definition of done.** Merged; snapshot tests green; `npm run gen:check` in CI; `docs/CONTRIBUTING.md` "Generated files" section lists the target and its renderer; ARC-02 has the pointer text.

### ARC-05-S06 — Error-code registry, `governance/mcp-protocols.md` and `docs/TROUBLESHOOTING.md`
**As** an individual practitioner **I want** every error code the server can return to have exactly one documented meaning and remedy, shown identically by the rule file, the wizard, the doctor and the troubleshooting page **so that** a failure always names the next command, and a new code cannot ship without a remedy.
**Context.** ARC README deliverables 4 (`governance/mcp-protocols.md`, `docs/TROUBLESHOOTING.md`) and acceptance criterion 6 (one entry per code; doctor and wizard import the same table). `01` §8 "Runtime error mapping". ARC-07 needs entries for `AUTHENTICATION_FAILED`, `INSUFFICIENT_PRIVILEGES`, `PROD_WRITE_NOT_ACKNOWLEDGED`, URL-shape errors, and — per R-3 — the wizard probe must distinguish DNS / TLS-CA / proxy failures with exact remedies; ARC-08 S10 maps runtime errors. `01` §11 leaves `errorCodes: []` in the contract shape for this story to fill.
**Scope.** In: the server-side error-code registry (single source, emitted into the contract), the two renderers, the contract test that every thrown code is registered. Out: the wizard and doctor UIs that display remedies (ARC-07, ARC-08); the proxy agent itself (ARC-04 R-3 story) — this story only requires that its codes are registered with remedies.
**Design notes.**
- Registry: `packages/snowarch/src/utils/error-codes.ts` exporting `ERROR_CODES: Record<string, { meaning: string; remedy: string; command?: string; showInRule: boolean; httpStatus?: number }>`. `ServiceNowError` (today `mcp:src/utils/errors.ts:1-10`, `constructor(message: string, public code: string, public details?: unknown)`) narrows `code` to `keyof typeof ERROR_CODES`, so an unregistered literal is a TypeScript error. `scripts/extract-tools.mjs` (ARC-04 S06) imports the registry and emits `contract.errorCodes: [{ code, meaning, remedy, command?, showInRule, httpStatus? }]`.
- Code names are ARC-04's, not this story's: the registry keys must equal the identifiers ARC-04's stories define — S03 (`PROD_WRITE_NOT_ACKNOWLEDGED`, `INSTANCE_NOT_LOADED`, `UNKNOWN_INSTANCE`, and the WARN codes `PRESET_FLAGS_MISMATCH`, `FLAG_DEPENDENCY_VIOLATION` if they are ever thrown), S02 (`STORE_NOT_FOUND`, `STORE_PERMISSIONS_TOO_OPEN`, `STORE_SCHEMA_INVALID`, `STORE_SCHEMA_UNSUPPORTED`), S04 (`NO_INSTANCE_CONFIGURED`), S07 (`INVALID_REQUEST`, `NOT_FOUND`), S08 (`UNSUPPORTED_ON_THIS_INSTANCE`), S11 (`DNS_FAILURE`, `TLS_CA_UNTRUSTED`, `PROXY_UNREACHABLE`, `PROXY_AUTH_REQUIRED`, `CONNECTION_REFUSED`, `NETWORK_TIMEOUT`). ARC-07's stories currently use `PROXY_CONNECT_FAILED` and `STORE_MODE_UNSAFE` for the same conditions; since the wizard is a thin wrapper over the server package's CLI module (ARC-07 README), those must be reconciled to ARC-04 S11/S02's names before ARC-07 S02/S05 merge — S08 test 11 fails on any literal that is not a registry key, so the disagreement cannot ship silently. ARC-07's own wizard-side codes (`URL_NOT_HTTPS`, `URL_HAS_PATH`, `URL_HAS_CREDENTIALS`, `URL_INVALID`, `URL_REQUIRED`, `OAUTH_ROPC_DISABLED`, `OAUTH_CLIENT_INVALID`, `STORE_IN_CLOUD_SYNC_FOLDER`, `TLS_CERT_INVALID`) are registered here too, with `showInRule: false`, so `docs/TROUBLESHOOTING.md` covers what the wizard prints.
- Seed codes and remedies (commands use the root launcher `./snowarch`; skills use `/snowarch …`):
  | Code | Meaning | Remedy / command | In rule file |
  |---|---|---|---|
  | `WRITE_NOT_ENABLED`, `CMDB_WRITE_NOT_ENABLED`, `SCRIPTING_NOT_ENABLED`, `ATF_NOT_ENABLED`, `NOW_ASSIST_NOT_ENABLED`, `FLUENT_NOT_ENABLED` | The instance's preset does not enable this flag | `./snowarch instance set-preset <label> <preset>` — `prod` requires `--ack-prod` | yes (one wildcard line) |
  | `AUTHENTICATION_FAILED` (401) | Wrong or expired credentials | Stop; no retry (lockout risk); `./snowarch instance set-credentials <label>` | yes |
  | `INSUFFICIENT_PRIVILEGES` (403) | Account lacks a role for the table/operation | Grant the role listed per preset in `docs/MODES-AND-PRESETS.md`, or use another account | yes |
  | `NO_INSTANCE_CONFIGURED` | Server started with an empty store | `/snowarch setup-instance` or `./snowarch instance add` | yes |
  | `PROD_WRITE_NOT_ACKNOWLEDGED` | `environment: prod` with a write preset and no `prodWriteAck` | `./snowarch instance set-preset <label> <preset> --ack-prod` (type the label) | yes |
  | `UNKNOWN_TOOL` | Retired or misspelled tool name | Use the `snow_*` name from `governance/mcp-protocols.md`; maintainers: `npm run lint:contract` | yes |
  | `FLUENT_NOT_INSTALLED` | `@servicenow/sdk` not on PATH | `npm i -g @servicenow/sdk` | yes |
  | `UNSUPPORTED_ON_THIS_INSTANCE` | Endpoint the instance does not expose (the two `[Unsupported]` script-execution stubs, ARC-04 S08) | Run the script in System Definition > Scripts - Background, or author a Fix Script via `snow_scr_*` inside an update set | no |
  | `INSTANCE_NOT_LOADED`, `UNKNOWN_INSTANCE` | Switch target not loaded (stored reason) / label not in the store | `./snowarch instance list`; for a `prod` reason see `PROD_WRITE_NOT_ACKNOWLEDGED` | no |
  | `STORE_PERMISSIONS_TOO_OPEN` | `.local/instances.json` readable by group/world (D-04) | `chmod 600 .local/instances.json` (POSIX); Windows: mode check skipped, doctor note (`01` §13) | no |
  | `STORE_NOT_FOUND`, `STORE_SCHEMA_INVALID`, `STORE_SCHEMA_UNSUPPORTED` | No store / store fails schema v1 / newer schema than this server | `/snowarch setup-instance`; `./snowarch doctor --fix` (rewrites absent flags) or `./snowarch instance list`; `./snowarch upgrade` | no |
  | `DNS_FAILURE` | Host does not resolve (`ENOTFOUND`/`EAI_AGAIN`) | Check the hostname; on VPN-only instances connect first; on a corporate network set `HTTPS_PROXY` | no |
  | `TLS_CA_UNTRUSTED` | Certificate chain not trusted (TLS-intercepting gateway) | Export the corporate root CA to a `.pem` and set `NODE_EXTRA_CA_CERTS=<path>` before `claude`/`./snowarch` (documented path per R-3, ARC-04 S11) | no |
  | `PROXY_UNREACHABLE`, `PROXY_AUTH_REQUIRED`, `CONNECTION_REFUSED`, `NETWORK_TIMEOUT` | Proxy set but not reachable / HTTP 407 / refused-reset without a proxy / timeout | Fix `HTTPS_PROXY` (and `NO_PROXY` for internal hosts) — the server honours both (ARC-04 S11); proxy credentials in the URL; check firewall; retry once | no |
  | `INVALID_REQUEST`, `NOT_FOUND` | Bad arguments / record absent (ARC-04 S07) | Check table/field names and sys_ids | no |
  The exact names are ARC-04's (S02/S03/S04/S07/S08/S11 as listed above); this story registers them and S08 test 11 forces agreement.
- `governance/mcp-protocols.md` renderer (`packages/contract/gen/protocols.mjs`): header; §2.1 long form (verbatim "what counts / does not count" from today's `governance-rules.md` §2.1, re-worded to Mode/Preset vocabulary); §2.2 long form with the platform rationale (REST honours `sys_user_preference` `sys_update_set` — cite the `docs/PLATFORM-NOTES.md` entry ARC-02 S10 derives from field-notes §1) and the four-step sequence; **Required tools** table rendered from `required-tools.json` joined with the contract (`name | gate | mutates | used_by`); **Presets** table and the six flag explanations rendered from the contract (plain-language texts of `01` §6.3 as literals keyed by flag name); **Error codes** summary linking to `docs/TROUBLESHOOTING.md`.
- `docs/TROUBLESHOOTING.md` renderer (`packages/contract/gen/troubleshooting.mjs`): static preamble ("what you will see and where": Claude session / `./snowarch instance` / `./snowarch doctor`), then one `### <CODE>` section per `contract.errorCodes[]` entry: *Meaning*, *Remedy* (command in a fenced block when present), *Also reported by* (wizard/doctor/session, derived from `httpStatus`/`showInRule`). Codes sorted alphabetically. Nothing hand-written per code — the registry is the only place.
- Shared consumption: ARC-07's wizard and ARC-08's doctor read `contract.errorCodes[].remedy` (server side: import the registry; engine side: `packages/contract/lib/contract.mjs` from S10 exposes `remedyFor(code)`). No second remedy table exists anywhere.
**Acceptance criteria.**
1. The set of second arguments of every `new ServiceNowError(` in `packages/snowarch/src/**` (388 call sites in 41 files today; the message and the code are on separate lines, so the check is a multi-line source scan `/new ServiceNowError\(\s*[^,]+,\s*'([A-Z_]+)'/gs` in S08 test 11, not a line-oriented `grep`) is a subset of `jq -r '.errorCodes[].code' packages/snowarch/dist/contract.json`; adding `throw new ServiceNowError('x', 'NEW_CODE')` without a registry entry fails `tsc` and test 11 with `NEW_CODE thrown at src/<file>:<line> but not registered in src/utils/error-codes.ts`.
2. `docs/TROUBLESHOOTING.md` contains exactly one `### <CODE>` heading per contract error code, each with a non-empty *Remedy*; `grep -c '^### ' docs/TROUBLESHOOTING.md` equals the code count. (ARC README criterion 6.)
3. The remedy text for `AUTHENTICATION_FAILED` in the rule file, `docs/TROUBLESHOOTING.md` and `governance/mcp-protocols.md` is character-identical (rendered from one string).
4. `governance/mcp-protocols.md` contains a table with one row per `required-tools.json` entry (41) and no tool name outside the contract (L01 passes on it).
5. `governance/mcp-protocols.md` contains no "Tier", `nowaikit`, `create_update_set`, `switch_update_set`, `query_records` or `sys_user_preference`-by-hand instructions (L03 passes; a targeted grep in the story's test).
6. Given ARC-04 S11's reachability codes, the wizard's printed remedy for a TLS failure (ARC-04 S11 acceptance 3's self-signed fixture, or manual behind a TLS-intercepting proxy) is the registry's `TLS_CA_UNTRUSTED` text naming `NODE_EXTRA_CA_CERTS` — not a hand-written string in the wizard (asserted by ARC-07 S02's test importing the registry).
**Tasks.**
1. Add `error-codes.ts`; make `ServiceNowError` code-typed; migrate every throw site's literal (388 sites / 41 files; mechanical; no behaviour change).
2. Extend `extract-tools.mjs` to emit `errorCodes[]` (coordinate with ARC-04 S06; rebuild `dist/`; re-run `pin.mjs`).
3. Write `protocols.mjs` and `troubleshooting.mjs` renderers; register them in `gen-governance.mjs`.
4. Snapshot tests against fixture contracts; the "identical remedy" test.
5. Regenerate; commit the three generated files; update `pin`.
**Test strategy.** Server: vitest (registry completeness; thrown-code subset). Engine: node:test snapshots on three OSes. Manual (ARC-07 time): one TLS-intercepted probe and one wrong-password probe to confirm the shown remedy strings.
**Dependencies.** S05 (framework); ARC-04 S02 (store codes), S03 (`PROD_WRITE_NOT_ACKNOWLEDGED`, instance-selection codes), S04 (`NO_INSTANCE_CONFIGURED`), S07 (`INVALID_REQUEST`, `NOT_FOUND`), S08 (`UNSUPPORTED_ON_THIS_INSTANCE`), S11 (R-3 reachability codes); ARC-02 S10 (`docs/PLATFORM-NOTES.md` entry to cite).
**Size.** M — two renderers, one registry, a mechanical migration of throw sites (388 sites in 41 files, `mcp:src`).
**Risks / open points.** Touching `packages/snowarch/src` overlaps ARC-04's tree; schedule after ARC-04 S06/S13 merge and before ARC-07 starts. ARC-07's stories name two codes differently from ARC-04 (`PROXY_CONNECT_FAILED` vs `PROXY_UNREACHABLE`, `STORE_MODE_UNSAFE` vs `STORE_PERMISSIONS_TOO_OPEN`); the registry follows ARC-04 and ARC-07 must be aligned before its S02/S05 merge (raised to the ARC-07 verifier).
**Definition of done.** Merged; server and engine tests green on the CI matrix; three generated files committed and `gen:check` green; ARC-07/ARC-08 can call `remedyFor(code)`; `docs/CONTRIBUTING.md` says "add a code: registry first".

### ARC-05-S07 — Generated `permissions.allow` / `permissions.ask` blocks in `.claude/settings.json`

> **Amendment 2026-09-08 (from ARC-04-S10 item 0, architect ruling).** The `ask` block is generated
> from **`mutates || sessionMutates`**, not `mutates` alone. `sessionMutates` is a new optional field
> on `ToolDefinition`, emitted in `contract.json`, and `snow_core_instance_switch` is the only tool
> that carries it: it changes no ServiceNow record — so `mutates: true` would fail the "a tool that
> mutates is never ungated" invariant unless it also gained a write gate, and gating it would stop a
> read-only session switching instances to *read* another one — but it redirects where every
> subsequent write lands, which `03` S-23 names as one of the 14 that must prompt. A generator reading
> `mutates` alone would leave that one action unprompted while prompting every write that follows it.
>
> `snow_core_instances_reload` stays out of the `ask` block: ARC-07's `--resume` depends on it not
> prompting. `tests/tools/mutates-audit.test.ts` asserts the union covers all 14 S-23 names, that
> `sessionMutates` is exactly one tool and never set alongside `mutates`, and that `instances_reload`
> is not in the ask list.
**As** an individual practitioner **I want** every non-mutating server tool pre-approved and every mutating tool to prompt me, generated from the contract into the committed `.claude/settings.json` **so that** reads never interrupt me and no write can run without my consent even when the session starts in auto mode.
**Context.** ARC README deliverable 4 (permission blocks) and acceptance criterion 8 (auto-mode prompt, S-18). `01` §5: the `ask` block is the mechanical half of §2.1 — on Pro/Max/Team plans a session starts in auto mode where a classifier approves calls, but an explicit `ask` rule resolves to a user prompt before the classifier (`docs:permission-modes`; `03` S-18). S-12 decides explicit names vs middle-wildcard globs; `03` fallback: explicit list (~250 entries). ARC-06 S01 commits `.claude/settings.json` (env, hook, static `Bash(...)` allows) — this story generates the MCP part of its `permissions`.
**Scope.** In: the renderer that rewrites only the MCP entries of `permissions.allow` and `permissions.ask`, preserving everything else byte-for-byte; the style switch driven by `engine.config.json`; the S-18 fallback design note. Out: the hook-based fallback implementation (a new story if S-18 fails — see Risks); the non-MCP content of the file (ARC-06 S01).
**Design notes.**
- `engine.config.json` gains (schema updated here, ARC-01 S04's `engine.config.schema.json`, `additionalProperties: false` — so the schema change is mandatory, not optional): `"mcp": { …, "permissions": { "allowStyle": "explicit" | "glob", "askStyle": "ask" | "deny-with-hook" } }`. ARC-00 S-12 sets `allowStyle` (default `explicit`); ARC-00 S-18 sets `askStyle` (default `ask`).
- Renderer `packages/contract/gen/permissions.mjs`: reads `.claude/settings.json` as text, parses, and rebuilds `permissions.allow` as: all existing entries that do **not** start with `mcp__` (kept in order) followed by the generated MCP entries; `permissions.ask` likewise. Generated entries: `allowStyle: explicit` → one `mcp__servicenow__<name>` per `mutates:false` tool, sorted; `glob` → the minimal glob set S-12 verified (e.g. `mcp__servicenow__snow_*_index`, `mcp__servicenow__snow_*_read`, `…_query`) plus explicit names for reads that match no glob. `ask` → one entry per `mutates:true` tool (explicit always — an `ask` glob that accidentally matched a read would only over-prompt, but an allow glob that matched a write would bypass §2.1, so writes are never globbed). Output: 2-space indent, LF, trailing newline (matches ARC-06's committed formatting so the byte check is stable).
- The tools the unconfigured server advertises (`01` §9: `snow_core_instances_index`, `snow_core_instances_reload`, `snow_core_current_instance_read`, `snow_core_capabilities_read`, `snow_core_status_read`) and `snow_core_instance_switch` (`none / false` per ARC-04 S06 acceptance 6 — session state, not instance state) are `mutates:false` and therefore in `allow` — the `/snowarch setup-instance --resume` flow (`01` §6.2 step 8) runs without prompts.
- A `deny` array is never generated in `askStyle: ask`. In `deny-with-hook` (S-18 fallback) the renderer emits `permissions.deny` for every mutating tool and ARC-06 adds a PreToolUse exec-form `node` hook that allows a call only while a per-session approval marker exists (`03` S-18 fallback) — designed, not built, here.
- Order of precedence reminder for the docs: `disabledMcpjsonServers` (design-only) means no server, hence no tool, hence the lists are inert; `dontAsk` mode denies `ask` matches instead of prompting (safe); `bypassPermissions` skips everything and is documented as "never use with a live write preset" in `docs/MODES-AND-PRESETS.md` (ARC-02 S09 owns that file; text handed over). All three behaviours are as recorded in `03` S-18's evidence column (`docs:permission-modes`).
**Acceptance criteria.**
1. After `node scripts/gen-governance.mjs --only permissions`, `.claude/settings.json` parses; `permissions.allow` contains every `mutates:false` tool name prefixed `mcp__servicenow__` (explicit style) and `permissions.ask` contains every `mutates:true` name; the intersection is empty; `jq '.permissions.allow | map(select(startswith("mcp__"))) | length'` equals the contract's `mutates:false` count.
2. Non-MCP entries (`Bash(./snowarch doctor*)`, `Bash(node tools/snowarch/bin/snowarch.mjs *)`), the `env` block and the `hooks` block are byte-identical before and after generation (test: strip MCP entries from both versions and compare).
3. `--check` exits 1 when a tool's `mutates` flips in the contract and the file was not regenerated, naming the entry that moved between `allow` and `ask`.
4. With `engine.config.json.mcp.serverKey` = `snow`, regeneration produces `mcp__snow__…` entries and no `mcp__servicenow__` entry remains (prefix from config, criterion 5 of the README).
5. **S-18 (manual, live checkout, ARC-06 done):** in a session started in auto mode, calling `snow_core_record_add` produces a permission prompt; calling `snow_core_records_query` does not; repeated in `default` and `plan` modes with the same outcome. Recorded in `03` S-18's verdict and in `docs/CONTRIBUTING.md` (drill, S11).
6. **S-12 (manual):** if `allowStyle: glob`, a read tool matched only by a middle-wildcard rule runs without a prompt; if the spike fails, the config stays `explicit` and the file holds one entry per read tool.
7. No entry in `allow` matches any `mutates:true` name (test computes glob matches against the full catalogue when `glob` style is used).
**Tasks.**
1. Extend `engine.config.schema.json` with `mcp.permissions`; set defaults from the ARC-00 verdicts.
2. Implement `permissions.mjs` (parse, partition, regenerate, serialise) and register it in `gen-governance.mjs`.
3. Tests: partition preservation; explicit vs glob outputs; no-write-in-allow; `--check` diff.
4. Regenerate and commit `.claude/settings.json` together with ARC-06 S01 (single PR or sequenced same day to avoid a stale byte check).
5. Hand `docs/MODES-AND-PRESETS.md` the permission-modes paragraph.
**Test strategy.** Unit on three OSes. Manual S-12/S-18 sessions on macOS and Windows (native) per ARC-00; results referenced, not repeated, here.
**Dependencies.** S05 (framework); ARC-00 S-12 and S-18 verdicts; ARC-06 S01 (the file to merge into — until it exists the renderer writes the full file from a minimal template `{ "permissions": {} }` and ARC-06 adds its blocks around the generated arrays).
**Size.** M — the renderer is ~150 lines; the partition/preservation tests and the ARC-06 coordination are the effort.
**Risks / open points.** S-18 failing means the `ask` mechanism cannot be trusted in auto mode; the fallback (deny + PreToolUse hook) is a new M story in ARC-06 plus a renderer switch here — decided by ARC-00, not silently. The file grows by ~400 lines (explicit style); neither `00` §9 nor `03` records a size limit for `.claude/settings.json` — **unverified**; ARC-00 S04 (S-16) is the first run that loads the committed file after trust and must record the entry count it loaded with, and S-18's session (ARC-00 S05) runs against the fully generated file, not a stub.
**Definition of done.** Merged; tests green; `.claude/settings.json` committed with generated arrays and `gen:check` green; `docs/MODES-AND-PRESETS.md` paragraph delivered to ARC-02; S-12/S-18 verdict lines in `03` reference this story.

### ARC-05-S08 — Server `tests/contract.test.ts`: gates, presets, invariants, pin, dist parity

> **Amendment 2026-09-08 (from the `fix/ensure-input-schema` PR).** **The final contract test must
> assert schema-vs-validation agreement across the catalogue, not just the gates.**
> `snow_us_active_update_set_ensure` shipped a handler that refused `name is required` behind an
> `inputSchema` that listed `name` nowhere and `required: []` — the published contract said a call
> was valid and the server refused it. That one tool is fixed in its own PR with a local regression
> test; the general property belongs here, because only this test sees every tool at once. The
> shape: for every tool, each `<x> is required` refusal the handler can raise names a property the
> schema marks required, and every property the schema advertises is one the handler reads. The
> second half is what caught it — `default_name` was advertised for a handler that never looked at
> it, so nothing failed until a caller trusted the schema.
**As** the server **I want** a test that proves every tool throws exactly its declared gate code when flags are off, that presets open exactly their families, that `mutates` and `gate` are consistent with each other and with tool names, that the committed `dist/contract.json` equals both the generator output and the engine's pin, and that every thrown error code is registered **so that** a server change that would break the engine fails on the server side before the engine ever sees it.
**Context.** ARC README deliverable 5 and acceptance criteria 1 (server side: sha mismatch on rename) and 3 (seventh flag). `01` §11 "Server test" — extends `tests/tools/parity.test.ts`' throwing-Proxy pattern (`mcp:tests/tools/parity.test.ts:14-18`: a client whose every method throws `MOCK_CLIENT_CALL`, so a recognised tool either permission-throws or reaches the client). ARC-04 S06 writes the first form of the file (its tests (a)–(g)); ARC-04 S01 scopes vitest to the package; this story completes the file.
**Scope.** In: `packages/snowarch/tests/contract.test.ts` (final form) and `tests/contract-exceptions.json`; the per-tool gate probe; preset probes; invariants; pin and generator parity; error-code registry test; rename-map subset test. Out: changing any gate or declaration (ARC-04); live tests (ARC-04's `RUN_LIVE_E2E`).
**Design notes.**
- Flag state: ARC-04 S03 evaluates flags per instance at call time through an `AsyncLocalStorage` carrier — `runWithInstance(rt, fn)` in `src/servicenow/context.ts`; `requireWrite()` and its siblings keep their zero-argument signatures and read `currentInstance().effectiveFlags`, so the dispatchers are unchanged (`routeToolInvocation(client, name, args)`, three arguments, `mcp:src/tools/index.ts:292-295`). The test builds an `InstanceRuntime` with explicit six-string `flags` and calls `runWithInstance(rt, () => routeToolInvocation(throwingClient, name, {}))`. The flag state under test is never taken from `process.env`; on the contrary, the test sets `process.env.WRITE_ENABLED = "true"` (and the other five) in `beforeAll` as a **canary**: a dispatcher that still reads `process.env` reaches the client instead of throwing and fails test 3.
- Gate → code map, dependency-first as ARC-04 S03 settles it (`evaluateGate`: `cmdb_write` → WRITE then CMDB_WRITE, `scripting` → WRITE then SCRIPTING, "today's order in `requireCmdbWrite`/`requireScripting`", `mcp:src/utils/permissions.ts:33-41`; `fluent` → FLUENT, plus WRITE when `mutates`; `atf`/`now_assist` → their own flag only). The test does **not** call `evaluateGate` to compute the expectation — that would be tautological — but derives it from the declared `gate` and `contract.flags[].requires` with a 15-line table of its own:
  | State | `write` | `scripting` | `cmdb_write` | `atf` | `now_assist` | `fluent` | `none` |
  |---|---|---|---|---|---|---|---|
  | all six `"false"` | `WRITE_NOT_ENABLED` | `WRITE_NOT_ENABLED` | `WRITE_NOT_ENABLED` | `ATF_NOT_ENABLED` | `NOW_ASSIST_NOT_ENABLED` | `FLUENT_NOT_ENABLED` | reaches client |
  | only `WRITE_ENABLED: "true"` | reaches client | `SCRIPTING_NOT_ENABLED` | `CMDB_WRITE_NOT_ENABLED` | `ATF_NOT_ENABLED` | `NOW_ASSIST_NOT_ENABLED` | `FLUENT_NOT_ENABLED` | reaches client |
  "Reaches client" means the thrown error is `MOCK_CLIENT_CALL` or an input-validation error, never a `*_NOT_ENABLED` code. If ARC-04 S03's merged order differs from this table, the table changes with a commit message naming ARC-04 S03 — never the assertion style.
- Tests (each one `it`, names stable for CI grep):
  1. *required ⊆ catalogue*: every `required-tools.json` name is in `collectToolCatalog()`.
  2. *required expectations*: for each required tool, catalogue `gate`/`mutates` equal the engine's expectation (mirror of L08 on the server side).
  3. *gate codes*: for every catalogue tool, under each of the two states above, the thrown code equals the table cell for its declared gate; the canary env is set for the whole test.
  4. *presets open families*: for each `contract.presets[<name>]`, apply its six flags; every tool whose gate's flag is `"true"` (and whose `requires` are satisfied) reaches the client; every other gated tool still throws its code.
  5. *flag set closure*: `contract.flags[].name` == the set of `*_ENABLED` names referenced in `src/utils/permissions.ts` (source scan) == the key set of every preset == exactly the rows the rule file renders (via `gen-governance --check` in S04). Adding a seventh flag to `permissions.ts` fails here until presets carry it (ARC README criterion 3).
  6. *requires satisfied*: no preset enables a flag whose `requires` are off.
  7. *mutates by suffix*: last name segment ∈ `MUTATING_SUFFIXES = {add, modify, remove, exec, publish, trigger, switch, resolve, annotate, schedule, complete, retire, send, import, configure, submit, order, approve, reject, assign, unassign, commit, register, fire, upload, set, ensure, clone, rollback, init, build, reconcile, train, close, categorize}` ⇒ `mutates: true`; segment ∈ `{index, read, query, validate, export, check, compare, preview, explain, trend, impact, suggest, predict, detect, forecast, evaluate, analyze, discover}` ⇒ `mutates: false`; every other segment (`test`, `scan`, `generate`, `bulk`, `track`, `batch`) and every deliberate contradiction must be listed in `tests/contract-exceptions.json` `{ "<tool>": { "mutates": true|false, "reason": "…" } }` — an unlisted ambiguous tool fails. Seed exception: `snow_core_instance_switch` (`switch` suffix, `mutates: false` — server session state, ARC-04 S03/S06).
  8. *gate ⇔ mutates*: `gate ∈ {write, scripting, cmdb_write, atf}` ⇒ `mutates: true`; `mutates: true` ⇒ `gate ≠ none`; exceptions only via the same file with a reason (e.g. `now_assist` reads).
  9. *manifest == contract names*: `dist/tools-manifest.json` and `dist/contract.json` list identical names (post-cut count, whatever ARC-04 settles; the parity `EXPECTED` constant moves to one place).
  10. *rename map*: every value of `tool-rename-map.json` is in the catalogue or in `contract-exceptions.json.removedTools` with a reason.
  11. *error codes*: every `'[A-Z_]+'` second argument to `new ServiceNowError(` in `src/**` is a key of the registry; every registry entry has non-empty `meaning` and `remedy`.
  12. *generator parity*: running `extract-tools.mjs`' `buildContract()` in-process yields JSON byte-identical to the committed `dist/contract.json`.
  13. *pin*: `sha256(dist/contract.json)` equals `../../contract/required-tools.json.contractSha256`; failure message: `contract sha changed — on the engine side run node packages/contract/pin.mjs`.
  14. *server key*: `contract.server.suggestedName` equals `../../engine.config.json.mcp.serverKey`.
- Coverage: the vitest config (ARC-04 S01 scoping; the 100 % threshold on `src/utils/permissions.ts` is ARC-04 S03's) — this test exercises every branch of `evaluateGate`.
**Acceptance criteria.**
1. `npm test -w packages/snowarch` runs `contract.test.ts` with the 14 tests above green on ubuntu/macos/windows × Node 20/22/24.
2. Renaming `snow_core_record_add` to `snow_core_record_create` in `src/tools/core.ts` and rebuilding `dist/` makes tests 1, 9 (if the manifest was not rebuilt), 10 and 13 fail — CI is red on the server side alone. (ARC README criterion 1, server half.)
3. Adding `AUDIT_ENABLED` to `permissions.ts` with a `requireAudit()` guard fails test 5 with `flag AUDIT_ENABLED referenced in permissions.ts but missing from contract.presets.read-only|pdi-developer|full` until the presets carry it; after the presets carry it and `dist/` is rebuilt, the engine side still fails `L06` until `npm run gen` adds the rule-file row (S04 acceptance 3 / S11 scenario 3). (ARC README criterion 3.)
4. Declaring a tool `gate: "write", mutates: false` fails test 8 naming the tool; adding it to `contract-exceptions.json` with a reason passes.
5. A new `throw new ServiceNowError('…', 'BRAND_NEW')` without a registry entry fails test 11 (and `tsc`).
6. Editing one byte of the committed `dist/contract.json` fails test 12 and test 13 with distinct messages.
7. Test 3 runs both states for every catalogue tool (398 per ARC-04 S06 acceptance 2; the exact count is what test 9 asserts) in under 30 s on the slowest CI runner (no network; Proxy client).
8. With `process.env.WRITE_ENABLED = "true"` set and an instance whose `flags.WRITE_ENABLED` is `"false"`, `snow_core_record_add` throws `WRITE_NOT_ENABLED` — the canary proves flags come from the instance, not the environment.
**Tasks.**
1. Write `tests/contract-exceptions.json` by running test 7/8 once in report mode and reviewing every ambiguous tool with ARC-04's author.
2. Implement tests 1–14 on top of ARC-04 S06's first form ((a)–(g) map onto 3, 4, 8, 7, 9, 10 and 5 respectively — extend, do not duplicate); hoist `EXPECTED` and `MUTATING_SUFFIXES` into `tests/helpers/contract.ts`.
3. Encode the dependency-first order settled by ARC-04 S03 in the expectation table and check it against `contract.flags[].requires` (the table is derived from `requires`, so a contract that changes the order changes the table).
4. Wire into `npm test` (already in CI via ARC-04 S01).
**Test strategy.** This story *is* tests; proven by the deliberate-breakage runs in acceptance 2–6, executed on a throwaway branch (S11 records the outputs).
**Dependencies.** ARC-04 S01 (vitest scoping, `npm test` in CI), S03 (per-instance flags, `runWithInstance`, presets, `evaluateGate` order), S05 (gate split — otherwise `snow_scr_*` reads fail test 3), S06 (declarations + generator + first-form test), S13 (committed `dist/`); S01 (pin), S06 of this ARC (registry).
**Size.** L — 14 tests over 398 tools × two flag states, and an exceptions review with ARC-04's author.
**Risks / open points.** Test 3 depends on every dispatcher honouring per-instance flags; the canary env (design note above, acceptance 8) turns an env-reading dispatcher into a failure rather than an accidental pass. The exceptions file is a governance surface: reviewers must reject "reason: TODO".
**Definition of done.** Merged; green on the CI matrix; `docs/CONTRIBUTING.md` "Adding a tool" checklist (declare gate/mutates → rebuild dist → run tests → engine pin → gen); `packages/snowarch/README.md` lists the invariants.

### ARC-05-S09 — CI job `contract` and the release gate script
**As** CI **I want** one job that runs the server contract test, the dist rebuild-and-diff, the engine lint and the generator check on every commit, and one script that a release refuses to proceed without **so that** drift is impossible to merge and impossible to tag.
**Context.** ARC README deliverable 6 ("CI job `contract` running both sides; release script refuses to tag on failure"). `01` §11 "A release cannot be tagged unless all three pass"; §13 CI matrix; ARC-09 S01 (`scripts/release.mjs` runs "contract, engine lint" among its gates) and ARC-09 S08 (matrix completion). ARC-01 S11 provides the CI skeleton.
**Scope.** In: `.github/workflows/ci.yml` job `contract`; root `package.json` scripts `contract` (the gate) and its parts; `scripts/contract-gate.mjs`. Out: the release script itself and tag message (ARC-09 S01); the doctor job (ARC-08 S11); the Windows-without-Git-Bash job (ARC-09 S08 / ARC-06 S14).
**Design notes.**
- Root scripts:
  ```json
  "lint:contract": "node packages/contract/lint/engine-lint.mjs",
  "gen": "node scripts/gen-governance.mjs && node packages/contract/gen-retired-names.mjs",
  "gen:check": "node scripts/gen-governance.mjs --check && node packages/contract/gen-retired-names.mjs --check",
  "test:contract": "npm test -w packages/snowarch -- tests/contract.test.ts",
  "contract": "node scripts/contract-gate.mjs"
  ```
- `scripts/contract-gate.mjs` (stdlib): runs in order (1) `npm run build:dist -w packages/snowarch` then `git diff --exit-code -- packages/snowarch/dist` (ARC-04 S13's rebuild-and-diff, reused not duplicated), (2) `npm run test:contract`, (3) `npm run lint:contract`, (4) `npm run gen:check`; prints `CONTRACT GATE: server ok · dist ok · engine ok · generated ok` or the first failing step with its output; exit codes 0 / 1; `--skip-build` for the release script when it has just rebuilt.
- CI job `contract` in the matrix `ubuntu-latest / macos-latest / windows-latest × Node 20/22/24` (Q-B: the Windows leg runs `contract` with Git Bash present as on any GitHub runner; the *no-Git-Bash* Windows job belongs to ARC-09 S08 and reuses this gate), `needs: [lint]`, steps: checkout with submodules disabled (the gate needs no corpus), `npm ci --ignore-scripts`, `npm run contract`. Required status check on `main` (branch protection from ARC-01 S01 gains `contract`).
- ARC-09's `release.mjs` calls `node scripts/contract-gate.mjs --skip-build` after its own rebuild and refuses on non-zero; this story only provides the script and documents the call.
**Acceptance criteria.**
1. A PR that renames a tool without touching the engine shows the `contract` job red on all nine matrix cells, and the job log contains both `contract sha changed` (server test 13) and `L11 FAIL` (engine lint) — the two sides fail independently. (ARC README criterion 1, both halves.)
2. A PR that edits `.claude/rules/00-mode-and-mcp-gate.md` by hand fails only at step (4) with the `gen:check` diff.
3. `npm run contract` on a clean green tree prints the single `CONTRACT GATE: … ok` line and exits 0 in under 3 minutes on `windows-latest` / Node 20.
4. `main` cannot be merged into while `contract` is failing (branch-protection screenshot or `gh api repos/…/branches/main/protection` output attached to the PR).
5. `node scripts/contract-gate.mjs --skip-build` skips step (1) and still runs (2)–(4).
**Tasks.**
1. Add the root scripts; implement `contract-gate.mjs`.
2. Add the `contract` job to `ci.yml`; mark it required in branch protection.
3. Document the call for ARC-09 S01 in `docs/CONTRIBUTING.md` (release section is ARC-09 S11's; leave a stub line).
**Test strategy.** CI itself: one deliberately failing PR per failure class (the S11 drill), then closed without merge.
**Dependencies.** S03, S04, S08; ARC-01 S11 (workflow skeleton; branch protection from ARC-01 S01), ARC-04 S13 (`build:dist`).
**Size.** S — wiring and a 60-line gate script.
**Risks / open points.** Runtime cost: `build:dist` on nine cells; if it exceeds budget, run the rebuild-and-diff on ubuntu only and the other steps everywhere (dist bytes are OS-independent by ARC-04's determinism rule).
**Definition of done.** Merged; `contract` required on `main`; `docs/CONTRIBUTING.md` "CI gates" table updated.

### ARC-05-S10 — Contract loader for engine tooling and the no-literal-names guard
**As** a maintainer **I want** every engine-side tool (`./snowarch` bootstrap, doctor, SessionStart hook, the lint and the generators) to obtain flag names, preset names, tool names, error codes and remedies from one loader that reads `dist/contract.json` **so that** nothing hard-codes a list that the server owns (ARC README criterion 7: `tools/snowarch` contains no literal flag, preset or tool name).
**Context.** The old `scripts/doctor.sh` re-implements the flag rules in bash (`TIER_FLAGS=…` at line 691, D25–D27) and `scripts/setup.sh` hard-codes `REQUIRED_KEYS` (line 908) — `00` §8 lists both as places the contract is "re-derived by hand". `01` §11 "Tooling reads flag names, presets, error codes and tool names from the contract; nothing hard-codes a list." ARC-06 S02 (CLI skeleton), ARC-06 S07 (B05), ARC-08 S02/S04 (doctor checks) and ARC-08 S08 (banner) are the consumers; ARC-08 S06 (`--fix` rewrites absent flags as `"false"`) needs the flag list. README story 6 said "refactor `tools/snowarch`"; since `tools/snowarch` is created by ARC-06 *after* this ARC, this story ships the loader and the guard test first, and ARC-06/07/08 are bound to use it (their READMEs' dependency lines already point here).
**Scope.** In: `packages/contract/lib/contract.mjs` (stdlib, ESM, no dependencies — importable by `tools/snowarch` before `npm ci`), its API, a verify-on-load behaviour, and `tests/contract/no-literals.test.mjs` scanning `tools/snowarch/**` and `packages/contract/gen/**`, `packages/contract/lint/**`. Out: the consumers' code (ARC-06/07/08); the server-side CLI (it imports the TypeScript registry directly).
**Design notes.**
- API (`packages/contract/lib/contract.mjs`):
  ```js
  export function loadContract({ root, verifyPin = true })  // reads packages/snowarch/dist/contract.json; if verifyPin, compares sha256 with required-tools.json and throws ContractPinMismatch { pinned, actual }
  export function flags(c)          // [{ name, exactString, absentMeans, requires }]
  export function flagNames(c)      // ['WRITE_ENABLED', …] in contract order
  export function presets(c)        // { 'read-only': {…six strings…}, 'pdi-developer': …, full: … }
  export function expandPreset(c, name, overrides)  // 'custom' + overrides → six strings; throws on a requires violation with the violating pair
  export function tools(c)          // [{ name, gate, mutates }]
  export function toolNames(c, { mutates })
  export function errorCodes(c)     // [{ code, meaning, remedy, command, showInRule, httpStatus }]
  export function remedyFor(c, code) // { meaning, remedy, command } or null
  export function prefix(config)    // `mcp__${config.mcp.serverKey}__` from engine.config.json
  export function updateSetCaptureSequence(c) // contract.protocols.updateSetCapture
  ```
  Pure functions over the parsed object; `loadContract` is the only I/O. `tools/snowarch` imports it by relative path (`../../packages/contract/lib/contract.mjs`), keeping `tools/snowarch` dependency-free (`01` §13).
- Banner/mode-line labels (`WRITE=on CMDB_WRITE=on …`, `01` §6.2 step 8) are derived as `name.replace(/_ENABLED$/, '')` from `flagNames()` — no literal.
- Guard test `tests/contract/no-literals.test.mjs`: scans `tools/snowarch/**/*.mjs`, `packages/contract/gen/**/*.mjs`, `packages/contract/lint/**/*.mjs` (excluding `**/tests/**` and `**/fixtures/**`) for `/\b[A-Z_]+_ENABLED\b/`, `/\b[A-Z_]+_NOT_ENABLED\b/`, `/\bsnow_[a-z0-9_]+\b/`, `/'(read-only|pdi-developer|full|custom)'|"(read-only|pdi-developer|full|custom)"/`, the literal `mcp__`, and — loaded from the contract at test time, not hard-coded — every `contract.errorCodes[].code` as a quoted string literal (`'AUTHENTICATION_FAILED'` / `"AUTHENTICATION_FAILED"`), so a doctor check that hand-writes a remedy for a named code fails. Any match fails with file:line. The only permitted literal is the `_ENABLED` suffix regex used to derive labels (allow-listed by the exact line content in the test).
- Equivalent to the README's grep criterion: `grep -rnE "WRITE_ENABLED|_NOT_ENABLED|pdi-developer|snow_[a-z0-9_]+|mcp__" tools/snowarch --include=*.mjs` returns nothing, and `grep -rnE -f <(jq -r '.errorCodes[].code | "\"" + . + "\"|'"'"'" + . + "'"'"'"' packages/snowarch/dist/contract.json) tools/snowarch --include=*.mjs` returns nothing.
**Acceptance criteria.**
1. `node -e "import('./packages/contract/lib/contract.mjs').then(m => console.log(m.flagNames(m.loadContract({root:'.'})).length))"` prints `6` on a green tree, on all three OSes, before `npm ci` has been run (stdlib only).
2. With the pin stale, `loadContract({root:'.'})` throws `ContractPinMismatch` whose message names both shas; `verifyPin: false` loads anyway (the doctor uses this to *report* the mismatch as a check instead of crashing).
3. `expandPreset(c, 'custom', { SCRIPTING_ENABLED: 'true' })` throws `SCRIPTING_ENABLED requires WRITE_ENABLED`; `expandPreset(c, 'pdi-developer')` returns six strings equal to the `01` §6.3 row.
4. `tests/contract/no-literals.test.mjs` passes on the tree after ARC-06/07/08 merge; introducing `const FLAGS = ['WRITE_ENABLED', …]` or `if (code === 'AUTHENTICATION_FAILED')` anywhere under `tools/snowarch/lib` fails it with the file and line. (ARC README criterion 7.)
5. `remedyFor(c, 'AUTHENTICATION_FAILED').command` equals the string ARC-07's wizard prints on a 401 (asserted in ARC-07's test by importing this loader — recorded here as the cross-ARC contract).
**Tasks.**
1. Implement the loader and `ContractPinMismatch`.
2. Unit tests against fixture contracts (baseline, stale pin, seventh flag, requires violation).
3. Implement the guard test with the scan set and allow-list.
4. Document the API in `docs/ARCHITECTURE.md` (S11) and the rule "engine tooling imports the loader; never a list" in `docs/CONTRIBUTING.md`.
**Test strategy.** Unit (node:test) on three OSes; the guard test runs in `lint:contract`. Consumers' integration is proven in ARC-06 (B05) and ARC-08 (E-checks).
**Dependencies.** S01 (pin), S06 (error codes in the contract).
**Size.** M — small API, but the preset expansion and error paths need exact strings and tests.
**Risks / open points.** ARC-06/07/08 authors may be tempted to inline names "temporarily"; the guard test is in `lint:contract`, which is required on `main`, so the temptation fails CI. If ARC-04 changes the contract field names (`presets` shape), only this loader changes.
**Definition of done.** Merged; tests green; the loader's API documented; ARC-06 S02 and ARC-08 S01 reference it in their design notes.

### ARC-05-S11 — Drift drill and contributor documentation
**As** a maintainer **I want** the four drift scenarios executed for real on a throwaway branch, their exact failure outputs captured, and the contract mechanism documented — who generates, who pins, what fails — **so that** the ARC's acceptance criteria are demonstrated rather than asserted and the next contributor knows what to run when a check goes red.
**Context.** ARC README deliverable 7 (`docs/ARCHITECTURE.md` section) and story 7 (drill; document the failure output in `docs/CONTRIBUTING.md`); acceptance criteria 1, 2, 3, 8 are "demonstrated by a deliberate change in a throwaway branch". ARC-01 S12 created the two docs as stubs.
**Scope.** In: the drill (four scenarios), captured outputs, `docs/CONTRIBUTING.md` sections, `docs/ARCHITECTURE.md` section, ADR for the contract mechanism (`docs/decisions/ADR-00xx-contract-and-drift-prevention.md`, template from `templates/`). Out: fixing anything the drill reveals (new stories in the owning ARC).
**Design notes.**
- Drill scenarios (branch `drill/arc-05-drift`, never merged, deleted after capture):
  1. **Rename**: `snow_core_record_add` → `snow_core_record_create` in `packages/snowarch/src/tools/core.ts`; `npm run build:dist`; `npm run contract` → expected: server test 1/10/13 red; engine `L01` (governance and rule file cite the old name), `L11` red; `pin.mjs --yes` refuses with `MISSING snow_core_record_add`.
  2. **Regate**: `snow_scr_script_include_add` from `scripting` to `write`; rebuild → expected: server test 2 red; engine `L08`, `L11` red; after `pin.mjs --accept-regate snow_scr_script_include_add --yes`: `L06` red on `governance/mcp-protocols.md`, the rule file (header sha), `docs/TROUBLESHOOTING.md` (header sha) and the `PRESETS` block header of `docs/MODES-AND-PRESETS.md`; after `npm run gen`: green.
  3. **Seventh flag**: add `AUDIT_ENABLED` + `requireAudit()` to `permissions.ts` → expected: server test 5 red until `presets` carry it; then `L06` red until `npm run gen` adds the table row.
  4. **Hand edit of a generated file**: change one word in `docs/TROUBLESHOOTING.md` → expected: only `gen:check` / `L06` red, with the diff line.
  5. **Retired name**: add `query_records` to `governance/mcp-protocols.md` prose → expected: `L03` red with `→ use snow_core_records_query`.
  6. **Auto-mode prompt (S-18 evidence)**: on a live checkout, the S07 acceptance 5 session; capture the prompt text as displayed.
- `docs/CONTRIBUTING.md` sections: "Generated files — never edit by hand" (table: target → renderer → command); "The contract gate" (what `npm run contract` runs, the check-id table L01–L11 and the server test names, one line each on what red means and the fix command); "Adding or renaming a tool" checklist; "Updating the contract pin" (`pin.mjs`, `--accept-regate`, what to write in the commit message); "Drill outputs" — the captured stderr/stdout of scenarios 1–5, trimmed to the failing lines, dated.
- `docs/ARCHITECTURE.md` section "The contract: who generates, who pins, what fails": one diagram (Mermaid) of `src declarations → extract-tools.mjs → dist/contract.json → {contract.test.ts, pin.mjs → required-tools.json → engine-lint.mjs, gen-governance.mjs → rule file / protocols / permissions / troubleshooting, contract.mjs loader → snowarch/doctor/hook}`; the invariants list (S08 tests 5–8); the failure matrix (change × which side fails); the S-14 note that a plugin-channel prefix (`mcp__plugin_…__`) would be a one-line `engine.config.json` change plus regeneration.
- ADR: context (P-04/P-05/P-33/P-36), decision (server generates, engine pins, both test, texts generated, no runtime alias — DR-10/DR-14), consequences (every server tool change is a two-repo-side commit; ~45 always-loaded lines).
**Acceptance criteria.**
1. `docs/CONTRIBUTING.md` contains a dated "Drill outputs" section with at least one verbatim failing line for each of scenarios 1–5, each line traceable to a check id or test name that exists in the tree.
2. Scenario 6's captured prompt (or the S-18 verdict pointer in `03`) is present; if S-18 failed, the section states the fallback in force.
3. `docs/ARCHITECTURE.md` has the section with the Mermaid diagram rendering on GitHub and a failure matrix with at least the five rows above; every path named in it exists (L05 passes on the file).
4. The drill branch is deleted; `main` contains no trace of the deliberate breakages (`git log --all --oneline | grep drill` shows only the merged docs commit referencing it).
5. `L05` and `L03` pass on both docs after the update. Decided here: the "Drill outputs" section replaces every retired *tool* name in a captured line with the placeholder `<old-name>` and every renamed-in-drill name with `<renamed>` (e.g. `L03 FAIL governance/mcp-protocols.md:57 retired name "<old-name>" → use snow_core_records_query`), because tool names are never marker-exempt (S02); `docs/CONTRIBUTING.md` is **not** added to the marker-allowed files. Test: `grep -c 'retired-name: historical' docs/CONTRIBUTING.md` is 0 and L03 reports no finding on the file.
**Tasks.**
1. Run scenarios 1–5 on the drill branch on macOS and once on `windows-latest` via the PR's CI; capture outputs.
2. Run scenario 6 when a live checkout exists (may trail the story; tracked as a follow-up checkbox in the PR).
3. Write the two docs sections and the ADR.
4. Delete the branch.
**Test strategy.** Manual drill with captured CI logs; lint (`L03`, `L05`) over the docs in CI.
**Dependencies.** S01–S10 merged; a live checkout (ARC-06/07) for scenario 6 only.
**Size.** M — half a day of drills, one day of writing and review.
**Risks / open points.** Scenario 6 cannot run until ARC-06/07; the story is done without it and the checkbox is closed in ARC-08's timeframe. Drill outputs go stale when messages change; the contributing section states the date and that the check ids, not the wording, are stable.
**Definition of done.** Merged; docs pass the lint; ADR accepted; ARC README acceptance boxes 1, 2, 3, 8 ticked with a link to the CONTRIBUTING section.

## Sizing summary

| Story | Size | Days (range) |
|---|---|---|
| S01 | M | 1–2 |
| S02 | S | 0.5 |
| S03 | M | 1.5–2 |
| S04 | M | 1.5–2 |
| S05 | M | 1.5–2 |
| S06 | M | 2 |
| S07 | M | 1–1.5 |
| S08 | L | 3–4 |
| S09 | S | 0.5–1 |
| S10 | M | 1–1.5 |
| S11 | M | 1–1.5 |
| **Total** | | **15–20 engineer-days** (≈ 3–4 weeks for one engineer; under the 6-week threshold) |

Critical path: ARC-04 S06/S13 → S01 → S03 → S05 → S06 → S08 → S09; S07 additionally waits for ARC-00 S-12/S-18 verdicts and can land last without blocking ARC-02's sweep (which needs only S02/S03) or ARC-06's B05 (which needs S01/S10).
