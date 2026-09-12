# ARC-10 — Stories

Status: Draft (verified 2026-09-04 — cross-ARC story ids corrected, ARC-08 registry/detector wording aligned, T-19/T-20 added) · Decisions applied: D-01…D-06, Q-A, Q-B, R-1…R-3 · Source: README.md of this ARC · Last updated: 2026-09-04

## Decisions applied to this ARC

- **R-1** — the first unified release is `v2.0.0`, not `v1.0.0`. Every acceptance criterion inherited from the README now reads `v2.0.0`; the import tags are ARC-01's `import/engine-v2.8.0-worktree` and `import/snow-mcp-1.0.0`.
- **D-01** — the product is `farstic/ai-servicenow-architect`, CLI `snowarch`, MCP key `servicenow` (tools `mcp__servicenow__snow_*`), package `@farstic/snowarch` in `packages/snowarch`. The old names (`claude-servicenow-live`, `snow-mcp`, `servicenow-mcp`, `nowaikit`, `NowAIKit`) appear in this ARC **only** as the things being removed, deprecated or linked as history — `docs/MIGRATION.md`, `docs/ARCHITECTURE.md` "History", the old repositories' notices. The npm record `@farstic/snow-mcp@1.0.0` is never touched: no `npm deprecate`, no publish, no README push to npm (a GitHub README edit does not republish to npm, so the deprecation notice on the `farstic/snow-mcp` repository is compatible with D-01).
- **D-03** — context-mode is not part of the product; removing the user's own context-mode hooks and user-scope server is an explicitly optional step in `docs/MIGRATION.md`, never performed by the doctor or the bootstrap.
- **D-04** — the only credential store is `<checkout>/.local/instances.json`; the migration path moves credentials from the legacy `~/.config/servicenow-mcp/instances.json` and from `~/.claude.json` project entries into it and then deletes the sources; the wizard/doctor cloud-sync WARN is quoted in the migration steps.
- **D-05 / principle 10** — `./snowarch instance import --from-legacy` (ARC-07-S08; ARC-07-S07 is the `--global` store and cloud-sync WARN) is Propose → Review → Apply; `docs/MIGRATION.md` shows the review screen the user will see and never tells the user to accept blindly.
- **R-2** — `/snowarch status`, `/snowarch setup-instance`, `/snowarch doctor`; the README's `/status` and `/setup-instance` are read accordingly.
- **R-3** — the clean-machine validation includes one run on a proxied laptop (ARC-04-S11 "manual verification on a real proxied laptop before 1.0 (ARC-10 checklist)" — read "1.0" there as the first unified release `v2.0.0`, per R-1), and `docs/MIGRATION.md` carries the `HTTPS_PROXY` / `NODE_EXTRA_CA_CERTS` pointer.
- **Q-B** — the Windows validation record states which Windows path was proven: *native* (ARC-00 S-03 / S-04 / S-08 all CONFIRMED) or the pre-recorded fallback *"Git Bash required"* (`03` §A, `01` §13). Either outcome is a pass for this ARC; the record and the install page must agree.
- **Q-A** — the persona throughout is the individual practitioner on their own PDI; team-instance migration is out of scope (roadmap ARC).
- **Phase split (correction to the README's dependency line).** Stories S01–S05 and S07 are *in-tree* deliverables (`docs/MIGRATION.md`, `docs/CONTRIBUTING.md` sections, the standing rule, the "History" section, the validation-record tooling); they must be **merged before** ARC-09 runs `node scripts/release.mjs 2.0.0`, because the README of `v2.0.0` links to `docs/MIGRATION.md` (README acceptance criterion 3). Stories S06, S08, S09 and S10 run **after** the `v2.0.0` tag exists — with one exception: the proxied-laptop run inside S08 may be executed on the release candidate *before* the tag, because ARC-04-S11's test strategy expects "manual verification on a real proxied laptop before the `v2.0.0` tag"; its record then names the RC commit instead of the tag. The old repositories are not edited before the tag (README "Out").
- **Story-number references.** Other ARCs are cited by their `ARC-NN-SXX` ids as they stand in each ARC's STORIES.md on 2026-09-04: `instance import --from-legacy` = ARC-07-S08; reachability probe with DNS / TLS-CA / proxy diagnosis = ARC-07-S02; install page = ARC-06-S13 (ARC-06-S14 is the CI job); doctor registry = ARC-08-S01, leftover detectors E-23…E-26 = ARC-08-S03, T-19/T-20 = ARC-08-S10; release script = ARC-09-S01, release workflow = ARC-09-S03, upgrade + banner nudge = ARC-09-S07, CI-matrix completion = ARC-09-S08, `docs/CHANGELOG.md` = ARC-09-S02.

## Story map

| ID | Title | Size | Depends on | Delivers |
|---|---|---|---|---|
| ARC-10-S01 | `docs/MIGRATION.md`: existing-user step list and the cleanup command list derived from the ARC-08 detectors | M | ARC-07-S08, ARC-08-S01/S03/S10, ARC-06-S13, ARC-01-S10 (exempt list) | The one migration page; a test that every doctor leftover has a documented remedy; README link |
| ARC-10-S02 | Engagement-state carry-over: `clients/` per checkout, `memory/MEMORY.md` retired in favour of Claude Code auto memory | S | ARC-01-S07, ARC-02-S08, S01 | `docs/CONTRIBUTING.md` "Engagements and memory" section; MIGRATION step with checksum listing |
| ARC-10-S03 | Retire the legacy scaffolding: `scripts/legacy/`, obsolete `.gitignore` lines, empty legacy-name allow-list | S | ARC-02-S12, ARC-04-S01/S14, ARC-09-S02 | A tree with no parked legacy scripts; ratchet test passes with an empty allow-list |
| ARC-10-S04 | Rewrite the standing rule and the field-notes policy (DR-16) in `CLAUDE.md` and `docs/CONTRIBUTING.md` | S | ARC-02-S08, ARC-02-S10, ARC-04-S14 | The three-way "where a finding goes" rule; the 2026-06-08 exclusion lapses |
| ARC-10-S05 | `docs/ARCHITECTURE.md` "History" section: import tags, ADR links, scope-cut ledger pointer, old-repository links | S | ARC-01-S12, ARC-00-S03 | The only product page that names the past, with resolvable tags and links |
| ARC-10-S06 | Author's machine cutover on `v2.0.0`: doctor 0 FAIL, stale entries removed, legacy store gone, engagements untracked | M | S01–S05, ARC-09-S01 (`v2.0.0` tag), ARC-07-S08, ARC-08-S03 | README acceptance criterion 1 met; MIGRATION.md corrected from the dogfood run |
| ARC-10-S07 | Validation-record template, redaction lint and the cutover test list (T-01…T-18 + `AUTHENTICATION_FAILED` + design-only) | M | ARC-02-S13, ARC-08-S10 (T-19/T-20), ARC-01-S11 | `docs/validation/TEMPLATE.md`; `tests/validation-records.test.mjs`; the exact list of tests each machine runs |
| ARC-10-S08 | Clean-machine validation runs: macOS, Ubuntu, Windows in `design-only`; one `live` (`pdi-developer`); one proxied laptop | L | S06, S07, ARC-09-S03 (release assets) & S08 (CI matrix), ARC-07-S02, ARC-04-S11 | Committed records under `docs/validation/`; README acceptance criterion 2 met; Q-B outcome recorded |
| ARC-10-S09 | Deprecation notices in `farstic/claude-servicenow-live` and `farstic/snow-mcp`; archive checklist for the owner | S | S08, ARC-09-S01, ARC-04-S14 (CHANGELOG 2.0.0 section the notice links) | Notices live on GitHub; owner checklist with the two-week archive date; npm record untouched |
| ARC-10-S10 | Two-week post-release review: telemetry-free feedback loop (issue template with the doctor JSON) and the archive trigger | M | S09, ARC-08-S01 (`--json` schema) | `.github/ISSUE_TEMPLATE/install-problem.yml`; review record; archive executed or deferred with reason |

Merges/splits against the README titles-only list: README story 1 → S01; 2 → S06; 3 → S02; 4 → S07 + S08 (tooling split from execution so the records lint runs in CI before any machine is touched); 5 → S04; 6 → S05; 7 → S09; 8 → S10. S03 is new — it discharges the two obligations ARC-01 handed to ARC-10 (`scripts/legacy/` deletion; re-run of ARC-01-S10 criterion 6) and the `.gitignore` legacy lines ARC-01-S07 marked "removed by ARC-10".

---

## Stories

### ARC-10-S01 — `docs/MIGRATION.md`: existing-user step list and the cleanup command list derived from the ARC-08 detectors

**As** an individual practitioner who installed the old two-repository setup **I want** one page that takes me from that setup to a working `v2.0.0` checkout without losing engagement content or leaving a credential behind **so that** I can cut over in one sitting and the doctor afterwards reports nothing stale.

**Context.** P-34 (six credential copies in `~/.claude.json`, argv exposure, `.bak-*` files retain secrets — `00` §5), P-15 (old names still reachable), P-13 (residue and the `memory/` convention), `03` R-07 (stale `servicenow-mcp` / `nowaikit` entries with plaintext secrets). README deliverable 1 and acceptance criteria 3 and 6. D-04 (single store), D-03 (context-mode optional), principle 10 (the import step is Propose → Review → Apply), R-3 (proxy pointer).

**Scope.** In: `docs/MIGRATION.md`; a machine-checked link between the page and the doctor's leftover detectors (`tests/migration-doc.test.mjs`); the README "Upgrading from the old repositories" link; the `docs/MIGRATION.md` exemption in `tests/legacy-names.allowlist.json` / the always-exempt list of `tests/no-legacy-names.test.mjs` (ARC-01-S10 — the page must name the things being removed). Out: any change to the detectors or the import command themselves (ARC-08-S03, ARC-07-S08); the engagement/memory guidance text (S02 supplies that section); any edit to the old repositories (S09).

**Design notes.**

File: `docs/MIGRATION.md`. Audience: a user of `farstic/claude-servicenow-live` + `farstic/snow-mcp` (or of the npm `@farstic/snow-mcp@1.0.0` server registered by hand). Structure and the exact steps:

```
# Migrating from claude-servicenow-live and snow-mcp

Who this is for · What changes (one table: old → new) · Before you start · Steps 1–9 · Verify · Optional cleanup · Rollback
```

"What changes" table (old → new): two clones → one repository (`farstic/ai-servicenow-architect`); `claude mcp add servicenow-mcp …` with 12 env keys → committed `.mcp.json`, key `servicenow`; credentials in `~/.claude.json` and `~/.config/servicenow-mcp/instances.json` → `<checkout>/.local/instances.json` (0600); Tier 0/1/2 → Mode `design-only` | `live`, Preset `read-only` | `pdi-developer` | `full` | `custom`; `bash scripts/setup.sh` + `bash scripts/doctor.sh` → `./bootstrap.sh` + `./snowarch doctor`; `/status` → `/snowarch status`; `docs/nowaikit-field-notes.md` → `docs/PLATFORM-NOTES.md` (platform facts) + server changelog/tests (server behaviours); `memory/MEMORY.md` → Claude Code auto memory (S02); engine v2.8.0 / server 1.0.0 → product `2.0.0`.

Steps (each with macOS/Linux and Windows PowerShell forms; every command copy-pasteable):

1. **Preserve engagement content first** (README risk 1). In the old engine checkout: `find clients -type f -print0 | sort -z | xargs -0 shasum -a 256 > ~/clients-before.sha256` (Windows: `Get-ChildItem clients -Recurse -File | Get-FileHash -Algorithm SHA256 | Sort-Object Path | Export-Csv ~\clients-before.csv`). Also list `memory/MEMORY.md`, `scratchpad/`, `deliverables/` if present — they are untracked and will not travel by themselves.
2. **Clone and bootstrap the new repository** — the install page's one line: `git clone https://github.com/farstic/ai-servicenow-architect.git && cd ai-servicenow-architect && ./bootstrap.sh` (Windows: `bootstrap.cmd`). Choose `live` (`[2]`) at B03 if you had a working instance; B06 then runs the wizard (`snowarch instance add`, `01` §4.2/§6) and the bootstrap continues to the B09 summary — or choose `design-only` now and run `./snowarch mode live` later (`01` §9). Do **not** run `claude mcp add` — the registration is the committed `.mcp.json` (`01` §5, DR-3).
3. **Bring your instance across.** If `~/.config/servicenow-mcp/instances.json` exists (Windows: `%USERPROFILE%\.config\servicenow-mcp\instances.json` — the legacy store used `homedir()/.config` on every OS, `snow-mcp/src/cli/config-store.ts:98-102`): run `./snowarch instance import --from-legacy`. The page shows the review screen the command prints (label, URL, environment *asked, never guessed*; the six flags each with its proposed value; the `prod` cap notice) and says "Enter accepts the proposal; edit any line first if you want". Otherwise `./snowarch instance add` (or `/snowarch setup-instance` from inside Claude, which prints the exact terminal command and waits — D-06 hedge text). Credentials are typed in your own terminal, never pasted into Claude.
4. **Copy engagement folders** into the new checkout: `cp -R <old-checkout>/clients/ ./clients/` (Windows `Copy-Item -Recurse`); re-run the listing from step 1 into `~/clients-after.sha256` and `diff` the two (Windows `Compare-Object`). `clients/` is gitignored in the new repository (ARC-01-S07). S02 adds the `memory/MEMORY.md` disposition here.
5. **Run the doctor:** `./snowarch doctor`. Expect 0 FAIL and, in the `legacy` section, WARN lines `E-23` (stale `~/.claude.json` registrations) and `E-24` (legacy store), each with its exact command (ARC-08-S03 — the page quotes the doctor's lines verbatim, e.g. `→ claude mcp remove servicenow-mcp -s local        (run from this folder)` and the info line `also registered under: <folder> (<name>) — run the same command from that folder`). Copy the commands; they are the next two steps.
6. **Remove stale registrations** — per old project folder, because local-scope entries are keyed on the absolute folder path (`00` §5): the page wraps the doctor's command in the folder change it tells you to make — `cd <old-engine-checkout> && claude mcp remove servicenow-mcp -s local`; `cd <other-old-folder> && claude mcp remove nowaikit -s local`. For an entry whose folder no longer exists: `mkdir -p <path> && cd <path> && claude mcp remove <name> -s local && cd - && rmdir <path>` — the page explains that this avoids hand-editing `~/.claude.json` (behaviour not covered by `00`/`01`/`03` or a spike; verified in task 2 — see risk (a)). Then re-check: `jq '.projects | to_entries[] | select((.value.mcpServers // {}) | length > 0) | .key' ~/.claude.json` — the new checkout must not be listed (its server lives in `.mcp.json`); the README's shorter form `select(.value.mcpServers != null)` is quoted too with the note that it also lists projects whose block is empty.
7. **Delete backup files that retain secrets:** `ls -la ~/.claude.json.bak-*` — review, then `rm ~/.claude.json.bak-*` (`00` §5 cites `SETUP.md:110-118`: every backup retains historical secrets). Windows: `Get-ChildItem $env:USERPROFILE\.claude.json.bak-*`.
8. **Delete the legacy store** once the import is done or not needed — the same command the import's closing advice prints (ARC-07-S08): `rm -r ~/.config/servicenow-mcp` (it holds `instances.json` and `tokens.json` with plaintext secrets; Windows: `Remove-Item -Recurse $env:USERPROFILE\.config\servicenow-mcp`). After this, `E-24` reports ok.
9. **Recommended:** rotate the password of any instance whose credential sat in `~/.claude.json`, its backups or shell history; then `./snowarch instance set-credentials <label>`.

"Verify": `./snowarch doctor` → 0 FAIL, `E-23` and `E-24` ok (no stale entry, no legacy store); `claude` → trust dialog once, banner `Mode: live — instance=<label> (<env>) preset=<preset> — doctor <date> N ok` (or `Mode: design-only …`); `/mcp` shows `servicenow ✔ connected` (`01` §4.2). Closing sentence: "From now on, upgrades are `./snowarch upgrade` — see `docs/INSTALL.md#upgrading`" (ARC-09-S11).

"Optional cleanup" (explicitly the user's choice — D-03): context-mode: `claude mcp remove context-mode -s user` and delete the `hooks` block from `~/.claude/settings.json` and the context-mode rules from `~/.claude/CLAUDE.md`; the old checkouts: `git -C <old> status` to confirm nothing uncommitted, then delete or keep (both old repositories remain readable after archiving); `core.hooksPath` needs no action (it was set inside the old checkout only).

"Environment notes": corporate proxy / TLS-intercepting gateway → `HTTPS_PROXY` / `NO_PROXY` honoured by the server (ARC-04-S11) and `NODE_EXTRA_CA_CERTS=<path-to-corp-root.pem>` for a private CA, with the pointer to `docs/TROUBLESHOOTING.md` entries for DNS / TLS-CA / proxy (R-3). Cloud-sync folders: the page repeats the wizard/doctor WARN verbatim — "This checkout is under OneDrive/Dropbox/iCloud Drive/Google Drive; `.local/instances.json` (0600) will still be synced. Move the checkout or accept." (D-04).

"Rollback": nothing in the old setup was modified until step 6; to revert, re-run the old `claude mcp add` from the old `SETUP.md` (link to the archived repository) — the page states plainly that this re-creates the plaintext copy. To remove the new checkout instead, follow `docs/INSTALL.md#uninstall` (ARC-06-S13; its definition of done requires this link).

Machine check: `tests/migration-doc.test.mjs` (Node `node:test`, no deps) runs `./snowarch doctor --section legacy --json --no-cache` with `HOME` (Windows: `USERPROFILE`) pointed at the ARC-08-S03 fixture directory (stale `servicenow-mcp` + `nowaikit` entries for the checkout root, one under `/old/path`, a `.claude.json.bak-*`, and a legacy `instances.json`) and asserts that every `command` string in `stale.claudeJsonEntries[]` (after replacing the fixture root with `<old-engine-checkout>` and `/old/path` with `<other-old-folder>`) and the E-24 command `./snowarch instance import --from-legacy` appear as substrings of `docs/MIGRATION.md`; it also asserts that every registered check whose `section === 'legacy'` (ARC-08-S01 registry field; E-23/E-24 today) has its `id` named in the page. No `category` tag is needed — the registry's `section` field is the key. The test further asserts that the page contains no `service-now.com` hostname other than the `dev\d+` placeholder pattern, no `@`-mail, no 32-hex string.

README: add under "Install" a line "Coming from `claude-servicenow-live` / `snow-mcp`? Follow [docs/MIGRATION.md](docs/MIGRATION.md)." — `README.md` is the only product page besides `docs/ARCHITECTURE.md`, `docs/MIGRATION.md`, ADRs and `NOTICE` allowed to spell those two names (ARC-01-S10 exempt list gains `docs/MIGRATION.md` and this one README line via the allow-list with owner ARC-10).

**Acceptance criteria.**
1. `docs/MIGRATION.md` exists with the nine numbered steps, "Verify", "Optional cleanup", "Environment notes" and "Rollback" sections; every command block has a macOS/Linux and a Windows PowerShell form.
2. `node --test tests/migration-doc.test.mjs` passes on the three CI OSes: every `command` the doctor emits for the ARC-08-S03 fixture (`stale.claudeJsonEntries[].command`, E-24's `./snowarch instance import --from-legacy`) is a substring of the page after the two placeholder substitutions; every `section: 'legacy'` check id (E-23, E-24) is named in the page; the page contains no instance hostname, e-mail or sys_id. A fixture page with the `nowaikit` command line deleted makes the test fail with `migration-doc: doctor command "claude mcp remove nowaikit -s local" not found in docs/MIGRATION.md`.
3. Given the ARC-08-S03 fixture `HOME` (stale `servicenow-mcp` and `nowaikit` entries, a `.bak-*` file, a legacy `instances.json` with two entries), `./snowarch doctor --section legacy` prints exactly the two `claude mcp remove … -s local` lines, the `also registered under` line, the `.bak-*` reminder and the E-24 import line, and each of those command strings appears in steps 6, 7 and 8 of the page (README acceptance criterion 6).
4. The page's step 3 shows the `import --from-legacy` review screen text as ARC-07-S08 prints it for its fixture (`Legacy store: ~/.config/servicenow-mcp/instances.json (2 instances)` header, the per-entry plan, the S04 per-flag review screen, the closing advice naming `rm -r ~/.config/servicenow-mcp` and `tokens.json`) and states that Enter accepts and any line is editable (principle 10); a snapshot test compares the page's block with the ARC-07-S11 fixture output.
5. `README.md` contains the migration link; `tests/no-legacy-names.test.mjs` passes with `docs/MIGRATION.md` on the always-exempt list and the README line allow-listed with owner ARC-10.
6. Negative: `grep -nE 'claude mcp add|-e SERVICENOW_|Tier [012]|/status|/setup-instance|\.env' docs/MIGRATION.md` matches only lines that begin with `|` inside the "What changes" table (old → new rename rows), never a line inside a fenced code block or a numbered step; the ARC-02-S06 vocabulary test encodes this as a per-file exception for `docs/MIGRATION.md` (matches allowed only in the table's line range, which the test locates by its `| Old | New |` header).
7. The "Environment notes" section names `HTTPS_PROXY`, `NO_PROXY`, `NODE_EXTRA_CA_CERTS` and links the three `docs/TROUBLESHOOTING.md` anchors (`#DNS_FAILURE`, `#TLS_CA_UNTRUSTED`, `#PROXY_UNREACHABLE` — ARC-04-S11 classifier codes rendered by ARC-05-S06); a link-check step in the test resolves each anchor to a `### <CODE>` heading in `docs/TROUBLESHOOTING.md`.
8. The Windows form of step 3 and step 8 uses `%USERPROFILE%\.config\servicenow-mcp\instances.json` (the legacy store's real location on every OS — `snow-mcp/src/cli/config-store.ts:97-103`, `join(homedir(), '.config', 'servicenow-mcp')`), not `%APPDATA%`.

**Tasks.**
1. Collect the `section: 'legacy'` check ids, titles and command strings from ARC-08-S03 (run the doctor on its fixture; ARC-08-S03's definition of done says the page "can quote the command strings by id").
2. Draft the page; run every command on macOS and on Windows PowerShell 5.1 against the fixtures — including the `mkdir`/`rmdir` workaround of step 6 and the `%USERPROFILE%\.claude.json` location (risk (a) and (c)).
3. Snapshot the `import --from-legacy` review screen from ARC-07-S08's fixture run (ARC-07-S11 harness) and paste it.
4. Write `tests/migration-doc.test.mjs`; wire into `npm test`.
5. Add the README line; update the ARC-01 exempt/allow-list; run the ratchet test.
6. Have someone who did not write the page walk it on a copy of the ARC-08 fixture home directory (a temporary `HOME`).

**Test strategy.** Unit: `tests/migration-doc.test.mjs` in CI on three OSes. Integration: doctor output vs page text on the fixtures (macOS + Windows). Manual: the walk-through in task 6; repeated for real in S06.

**Dependencies.** ARC-07-S08 (`import --from-legacy`) and ARC-07-S11 (fixture harness for the snapshot), ARC-08-S01 (check registry, `section` field, `--json` shape) and ARC-08-S03 (detectors E-23/E-24 and their fixture), ARC-05-S06 / ARC-04-S11 (`docs/TROUBLESHOOTING.md` anchors and classifier codes), ARC-06-S13 (install-page wording the page quotes; its Uninstall section), ARC-09-S11 (`docs/INSTALL.md#upgrading`), ARC-01-S10 (exempt-list mechanism).

**Size.** M — the page is long and every command is executed twice (two OS families); the test is small.

**Risks / open points.** (a) `claude mcp remove -s local` for a folder that no longer exists — the `mkdir`/`rmdir` workaround relies on local scope being folder-keyed (`00` §5: "Local scope is keyed on the absolute checkout path"), but no spike or `01`/`03` row covers *removal* from a re-created folder; verified in task 2; if it fails, the fallback is the documented manual edit of `~/.claude.json`, clearly labelled as the only hand-edit in the whole product. (b) ARC-08-S03 prints the removal command without a `cd` prefix and annotates it "(run from this folder)" / "run the same command from that folder" — the page therefore wraps the doctor's exact string rather than expecting the doctor to print `cd`; the test checks substrings, not whole lines. (c) Windows `.claude.json` location is `%USERPROFILE%\.claude.json` (same file name) — not stated in `00`/`01`/`03`; ARC-08-S03's Windows fixture also assumes `USERPROFILE`; confirmed in task 2. (d) ARC-08-S03's E-24 looks for the legacy store at `%APPDATA%\servicenow-mcp\instances.json` on Windows, but the legacy store was always written to `homedir()/.config/servicenow-mcp` (`snow-mcp/src/cli/config-store.ts:97-103`); raised as a cross-ARC obligation on ARC-08-S03 (and ARC-07-S08's default `--path`) so that the doctor, the import and this page agree on `%USERPROFILE%\.config\servicenow-mcp`.

**Definition of done.** Merged before the `v2.0.0` tag; CI green; `README.md` linked; `tests/no-legacy-names.test.mjs` updated; `docs/ARCHITECTURE.md` audience table lists `docs/MIGRATION.md` (existing users).

---

### ARC-10-S02 — Engagement-state carry-over: `clients/` per checkout, `memory/MEMORY.md` retired in favour of Claude Code auto memory

**As** an individual practitioner with one or more client engagements in the old checkout **I want** a clear rule for where engagement content and instance-specific notes live in the new product **so that** nothing client-specific is ever committed and nothing is lost when I move.

**Context.** P-13 (`memory/` convention neither present nor ignored — `00` §3.11; `CLAUDE.md:413` designates `memory/MEMORY.md`), the engine's confidentiality firewall (one engagement = one checkout = one store — D-04 rationale), README deliverable 2. Q-A: single practitioner; no shared store.

**Scope.** In: `docs/CONTRIBUTING.md` section "Engagements and memory"; MIGRATION step 4's `memory/MEMORY.md` disposition (added to S01's page); confirmation that `CLAUDE.md` (ARC-02-S08) no longer mentions `memory/MEMORY.md`. Out: any engagement-management tooling (`snowarch client …` does not exist and is not proposed); the auto-memory feature itself (Claude Code's).

**Design notes.**

`docs/CONTRIBUTING.md` — new section:

```
## Engagements and memory

- One checkout per engagement: `git clone https://github.com/farstic/ai-servicenow-architect.git acme-architect`. Each checkout has its own `.local/instances.json` and its own `clients/acme/` — the confidentiality firewall is the directory boundary (D-04 rationale in ADR-0004).
- `clients/<name>/` is gitignored (never `git add -f`). Move an engagement by copying the folder; verify with a checksum listing (docs/MIGRATION.md step 1/4).
- Instance-specific values (URLs, sys_ids, usernames) are never committed. Two homes:
  · the product's own state: `.local/` (store, config, doctor cache, audit log) — written only by `snowarch` and the server;
  · your working notes across sessions: Claude Code auto memory — the per-project memory directory Claude Code maintains outside the checkout (see the Claude Code memory documentation for the exact location on your platform; the doctor's E-check "auto memory present" is informational only).
- `memory/MEMORY.md` (old engine convention) is retired. If you have one, move it to `clients/<name>/memory.md` (gitignored with the folder) and ask Claude to read it when needed; `memory/` stays in `.gitignore` as a safety net.
- Never put engagement content in `docs/`, `templates/`, `governance/` or a skill — those are product files visible to every checkout.
```

MIGRATION step 4 addition (S01's page): "If `<old-checkout>/memory/MEMORY.md` exists, copy it to `clients/<name>/memory.md`. If `scratchpad/`, `deliverables/` or `diagram-preview/` hold engagement artefacts, move them under `clients/<name>/` — those directories have no meaning in the new repository."

Evidence discipline: the auto-memory location is **not** asserted as a fixed path in the product text (no spike covers it; `00`/`01`/`03` do not state it). The CONTRIBUTING text points to Claude Code's own documentation and the implementer records the docs page and date in the PR. If, at the Claude Code floor 2.1.214 (`01` §12), the feature is found absent, the fallback text is "keep session notes in `clients/<name>/memory.md`" — no product code depends on either.

**Acceptance criteria.**
1. `docs/CONTRIBUTING.md` contains the section with the five bullets above; `grep -rn "memory/MEMORY.md" CLAUDE.md docs .claude` returns only the CONTRIBUTING sentence that retires it and the MIGRATION.md step.
2. `git check-ignore -v clients/acme/x.md memory/MEMORY.md` reports both as ignored by `.gitignore` rules (ARC-01-S07), on macOS and Windows.
3. `docs/MIGRATION.md` step 4 names `memory/MEMORY.md`, `scratchpad/`, `deliverables/`, `diagram-preview/` with their destinations.
4. The PR description records the Claude Code documentation page (URL + fetch date) used for the auto-memory statement; the text contains no absolute path claim for it.
5. `tests/never-commit.test.mjs` (ARC-01-S07) still passes with a fixture `clients/acme/memory.md` present in the working tree.

**Tasks.** 1. Write the section. 2. Add the MIGRATION.md sentences. 3. Verify ignore rules on both OS families. 4. Check the Claude Code memory docs; record page/date. 5. Grep for leftover `memory/MEMORY.md` references.

**Test strategy.** Unit: existing `never-commit` test with the fixture. Manual: `git check-ignore` on both OS families; one read-through by a second person.

**Dependencies.** ARC-01-S07 (ignore rules), ARC-02-S08 (`CLAUDE.md` rewrite), S01 (page to extend).

**Size.** S — documentation plus verification.

**Risks / open points.** The auto-memory feature's behaviour may change across Claude Code versions; the text is deliberately non-specific and the fallback is recorded. Deferred: any team/shared engagement store (roadmap ARC per Q-A).

**Definition of done.** Merged before the tag; CONTRIBUTING and MIGRATION updated; CI green.

**Amended 2026-09-12 (S02 build).** The text above is left as it was written; what follows is what
the build found and what shipped instead. Source for all of it: the Claude Code memory documentation,
<https://docs.claude.com/en/docs/claude-code/memory>, fetched 2026-09-12.

- **Bullet 3's parenthetical is wrong on both halves and is not in the product text.** It says "see
  the Claude Code memory documentation for the exact location on your platform" — the page states
  ONE location and describes no platform variance, so the promise cannot be kept. It also cites
  `the doctor's E-check "auto memory present"`: **there is no such check** (`git grep -i "auto
  memory" -- tools/snowarch/lib/doctor` is empty). A check is a story, not a sentence in a document,
  so the clause was dropped rather than the check invented. The shipped text stays path-free for the
  reason the evidence discipline gives — the location is Claude Code's to change — and points a
  reader at `/memory`, which the page documents and which cannot go stale.
- **Two paragraphs were ADDED that the story did not ask for**, both forced by the same page.
  *Auto memory is per repository and shared by every worktree of it*, so "one checkout per
  engagement" means a separate CLONE; two `git worktree` siblings would share their notes, which is
  the arrangement this rule exists to prevent, and a rule about a boundary has to say where the
  boundary is not. *Claude Code's auto memory keeps its index in a file also called `MEMORY.md`*, so
  retiring ours "in favour of auto memory" reads as though the file simply moved — the section says
  they are different files with different owners.
- **AC 1's scope, as tested.** The literal grep (`CLAUDE.md docs .claude`) also returns
  `docs/plans/**`, where this story's own text names the file; the test uses ARC-02-S06's `IN_SCOPE`
  (product documents, excluding plans, spikes, decisions and `RELICENSING.md`) and allows the two
  files that retire it — **plus any line that says "retired"**, in any file. That allowance was added
  when the first version caught this story's own changelog entry, which was right to name the file:
  a release note naming what it retires is the opposite of teaching it. A control asserts a line
  that merely mentions the path is still a finding.
- **The fallback recorded in the evidence discipline was not needed:** the feature is present and
  documented at the 2.1.214 floor, so no product text depends on it being absent.

---

### ARC-10-S03 — Retire the legacy scaffolding: `scripts/legacy/`, obsolete `.gitignore` lines, empty legacy-name allow-list

**As** a maintainer **I want** the parked legacy scripts and the transitional ignore rules removed once nothing writes to them **so that** the `v2.0.0` tree carries no dead engine-era tooling and the legacy-name ratchet is at zero.

**Context.** ARC-01-S10 handed ARC-10 two obligations ("delete `scripts/legacy/`; the cutover checklist re-runs S10 criterion 6"); ARC-01-S07 marked four `.gitignore` lines "legacy scratch locations from the engine era (removed by ARC-10 once nothing writes them)". P-15 (old names reachable), P-13 (residue).

**Scope.** In: delete `scripts/legacy/` (the parked `setup.sh`, `doctor.sh`, `verify-structure.sh`, `verify-citations.sh`, `sync-agents-skills.sh`, `.githooks/pre-commit` copies); remove `.backups/`, `scratchpad/`, `diagram-preview/`, `node-compile-cache/` from `.gitignore`; confirm `tests/legacy-names.allowlist.json` has no remaining rows except the S01 README line; update `docs/ARCHITECTURE.md` scope-cut ledger ("scripts/legacy removed in ARC-10, history at `import/engine-v2.8.0-worktree`"). Out: anything the allow-list still attributes to ARC-02/ARC-04/ARC-09 — those rows are emptied by their owners; this story blocks until they are.

**Design notes.** The only reference to `scripts/legacy/` in the product must be the ARCHITECTURE history line. Check with `git grep -n "scripts/legacy"`. The ARC-08 old→new doctor mapping table (ARC-08-S07) cites old check ids `D00–D37` by id, not by file path, so it does not depend on the directory. The `.gitignore` removal is safe because ARC-01-S07's `never-commit` test scans literals, not those paths; a leftover `scratchpad/` from a user's old checkout is never inside the new checkout (they are different directories).

**Acceptance criteria.**
1. `git ls-files scripts/legacy` is empty; `git grep -n "scripts/legacy"` returns only `docs/ARCHITECTURE.md`.
2. `.gitignore` no longer contains `.backups/`, `scratchpad/`, `diagram-preview/`, `node-compile-cache/`; `tests/never-commit.test.mjs` passes.
3. `tests/legacy-names.allowlist.json` contains at most the ARC-10-owned README line; `node --test tests/no-legacy-names.test.mjs` passes; the ARC-01-S10 criterion-6 grep (`grep -rn "cvetomirgrigorov/servicenow-mcp\|claude-servicenow-live\|NowAIKit\|nowaikit" --include=*.md --include=*.json --include=*.ts .`) returns only `docs/ARCHITECTURE.md`, `docs/MIGRATION.md`, `docs/decisions/ADR-*.md`, `NOTICE`, the test files and the README line.
4. `npm run lint && npm test` green on the three CI OSes after the deletion.

**Tasks.** 1. Verify the ARC-02/ARC-04/ARC-09 allow-list rows are empty (else stop and raise). 2. `git rm -r scripts/legacy`. 3. Edit `.gitignore`; update the ARCHITECTURE ledger. 4. Run the ratchet and the criterion-6 grep; attach output to the PR.

**Test strategy.** Unit (ratchet, never-commit) in CI; the grep output pasted into the PR.

**Dependencies.** ARC-02-S12, ARC-04-S01/S14, ARC-09-S02 (the last allow-list owners per ARC-01-S10's initial list: ARC-02 engine docs, ARC-04 `packages/snowarch/README.md`, `docs/INSTALLATION.md`, `docs/SERVICENOW_OAUTH_SETUP.md`, `src/cli/index.ts`, ARC-09 `docs/CHANGELOG.md`).

**Size.** S.

**Risks / open points.** A later ARC still referencing a legacy script by path — caught by criterion 1. If ARC-08's mapping work needs to read the old `doctor.sh`, it reads it from the import tag, not from the tree.

**Definition of done.** Merged before the tag; `docs/ARCHITECTURE.md` ledger updated; CI green.

**Amended 2026-09-12 (S03 build).** Measured on `c317810` before ruling; the story's text is left as
written and this records what the tree said.

- **The allow-list held THIRTEEN entries, not the seven the brief measured on 2026-09-11** — S01 had
  added `README.md` and `docs/INSTALL.md` (one pointer line, in the install page and the README it is
  composed into) and ARC-09-S10 had added four publish-guard entries. Reduced to **three**, all
  ARC-10: those two plus `docs/CONTRIBUTING.md`. The story's precondition ("ARC-02/ARC-04/ARC-09 rows
  empty, else stop") was pre-ruled by the brief and is recorded as met that way, not by measurement.
- **Ten entries moved to `EXEMPT_FILES` rather than being rewritten**, each a permanent carrier: the
  two `packages/contract/retired-*.json` and the two tests that assert them (a detector cannot detect
  a name it may not spell), the four D-01 publish-guard files (a guard that refuses
  `@farstic/snow-mcp` has to spell it), and `docs/CHANGELOG.md` + `tests/fixtures/changelog-before-2.0.0.md`
  (history, and a fixture that exists to BE that history). All twelve CHANGELOG matches were read
  before ruling: the R-03 supersedes sentence, the two migration notes about the untouched npm
  record, and the frozen imported entries. None was a stale sentence to rewrite.
- **The end state is three entries, not the two the brief predicted** — S01's line lives in two files
  because `README.md` is composed from `docs/INSTALL.md`, so the pointer is allow-listed twice.
- **Reducing the allow-list removed `docs/CHANGELOG.md` from the retired-SURFACE sweep too**, which
  reads the same owner map. It is exempt there now for its own stated reason rather than as a debt:
  naming a surface while recording its removal is the opposite of describing an installable one.
- **Four `scripts/legacy` citations became dead paths** (L05) when the directory went —
  `tests/doctor/mapping.test.mjs`, `tools/snowarch/lib/doctor/mapping.mjs` ×2 and
  `.../checks/legacy.mjs`. Rewritten to name the import tag, which is where the originals are read
  from now. `docs/ARCHITECTURE.md` keeps its mentions: L05 skips below a `## History` heading.
- **The ledger's read command is `git show import/engine-v2.8.0-worktree:scripts/legacy/doctor.sh`**
  — the brief wrote `:scripts/doctor.sh`; the import placed them under `scripts/legacy/`. Verified:
  1,141 lines, matching the figure the doctor-mapping section already quotes.

---

### ARC-10-S04 — Rewrite the standing rule and the field-notes policy (DR-16) in `CLAUDE.md` and `docs/CONTRIBUTING.md`

**As** the engine (Claude) and its maintainer **I want** one short rule that says where a solved problem is recorded in the merged repository **so that** platform findings, server behaviours and instance-specific values each land in exactly one correct place and the 2026-06-08 "MCP findings excluded" rule — meaningless now that the server is in the same repository — lapses.

**Context.** `01` DR-16 and §15 (field notes split: platform facts → `docs/PLATFORM-NOTES.md`; server behaviours → server changelog + tests); README deliverable 5 and acceptance criterion 5; the current rule in the engine's `CLAUDE.md` ("Standing Rule — Document Every Solved Problem", with the exclusion paragraph) and `docs/nowaikit-field-notes.md` header (`00` §3.11). ARC-02-S10 already produced `docs/PLATFORM-NOTES.md` (PN-01…PN-07) and handed server-behaviour sections to ARC-04 as regression-test titles; ARC-02-S08 owns the `CLAUDE.md` line budget.

**Scope.** In: the rule text in `CLAUDE.md` (≤ 8 lines, within ARC-02-S08's budget table) and the fuller "Where a finding goes" table in `docs/CONTRIBUTING.md`; the `docs/PLATFORM-NOTES.md` header sentence pointing back to the rule; a CI grep. Out: moving any existing finding (done by ARC-02-S10 / ARC-04-S09); adding the auto-memory text (S02).

**Design notes.**

`CLAUDE.md` replacement block:

```
## Standing rule — where a finding goes
When a ServiceNow behaviour is confirmed, a server tool misbehaves, or a working pattern is proven:
- Platform/API behaviour → `docs/PLATFORM-NOTES.md` (new PN-xx section; ground it in `vendor/ServiceNowDocs` or mark "observed behaviour"; no instance URL, username, sys_id or credential).
- Server (MCP tool) behaviour → `packages/snowarch/CHANGELOG.md` entry + a regression test under `packages/snowarch/tests/`.
- Instance-specific values → never committed: `.local/` (product state), `clients/<name>/` (engagement), Claude Code auto memory (your notes).
Record it in the same PR as the fix or test; there is no separate "field notes" file and no excluded category.
```

`docs/CONTRIBUTING.md` — "Where a finding goes" table with columns *Kind of finding · Destination · Format · Example*; four rows (platform behaviour; server tool behaviour; installation/Claude Code behaviour → `docs/TROUBLESHOOTING.md` source entry in ARC-05's error registry; instance-specific value → not committed). A paragraph "History: until 2026-09 the engine kept `docs/nowaikit-field-notes.md` and excluded MCP-tool findings (2026-06-08 rule); with the server in this repository that split is replaced by the table above" — this is the "migration note" README acceptance criterion 5 allows.

`docs/PLATFORM-NOTES.md` header gains: "New findings: see the standing rule in `CLAUDE.md` / CONTRIBUTING."

CI: `tests/vocabulary.test.mjs` (ARC-02-S06's grep set) gains the pattern `nowaikit-field-notes|Standing Rule — Document Every Solved Problem|MCP findings are EXCLUDED` with the allowed files `docs/CONTRIBUTING.md` (history paragraph) and `docs/MIGRATION.md` (rename table).

**Acceptance criteria.**
1. `grep -rn "Standing Rule\|Standing rule\|nowaikit-field-notes" CLAUDE.md docs` returns exactly: the `CLAUDE.md` rule heading, the CONTRIBUTING table heading/history paragraph, and the one MIGRATION.md rename row (README acceptance criterion 5).
2. `CLAUDE.md` stays ≤ 200 lines after the block is inserted (ARC-02-S08 test).
3. The CONTRIBUTING table has the four rows with a real example each (e.g. PN-xx for `sys_script_fix.name` 40-char truncation; a `packages/snowarch/tests/` file for `ORDERBYDESC`).
4. `grep -rn "EXCLUDED\|excluded from this repo" CLAUDE.md docs governance` returns only the CONTRIBUTING history paragraph.
5. The vocabulary test fails on a fixture file containing `docs/nowaikit-field-notes.md` outside the two allowed files.

**Tasks.** 1. Write the block and the table. 2. Coordinate the `CLAUDE.md` insertion with the ARC-02-S08 budget table. 3. Add the PLATFORM-NOTES header line. 4. Extend the vocabulary test. 5. Run the greps; paste into the PR.

**Test strategy.** Unit (line budget, vocabulary) in CI; manual grep.

**Dependencies.** ARC-02-S08, ARC-02-S10, ARC-04-S14 (`packages/snowarch/CHANGELOG.md` exists), ARC-05-S06 (error registry for the third row).

**Size.** S.

**Risks / open points.** The `CLAUDE.md` budget is tight; if the eight lines do not fit, the rule collapses to three lines plus a pointer to CONTRIBUTING — the pointer form is acceptable, the table is the authority.

**Definition of done.** Merged before the tag; `CLAUDE.md`, `docs/CONTRIBUTING.md`, `docs/PLATFORM-NOTES.md` updated; CI green.

---

### ARC-10-S05 — `docs/ARCHITECTURE.md` "History" section: import tags, ADR links, scope-cut ledger pointer, old-repository links

**As** a future reader of the new repository **I want** one section that explains where the code came from, which tags hold the imported histories and which decisions shaped the merge **so that** the two-repository past is discoverable without the old repositories (`03` R-08).

**Context.** README deliverable 6 and acceptance criterion 4; `03` R-08; ARC-01-S12 created `docs/ARCHITECTURE.md` with a history *stub* and declared it "the only product file allowed to spell the retired names"; ARC-00-S03 produced ADR-0001…ADR-0007 under `docs/decisions/`.

**Scope.** In: the final "History" section text; a test that the tags and links resolve. Out: the roster table (generated, ARC-02-S07), the doctor mapping appendix (ARC-08-S07), the input-hash table (ARC-09-S05).

**Design notes.**

Section text (final, replaces the stub):

```
## History

This repository unifies two predecessors, imported from their working trees on 2026-09-xx (ARC-01):

| Predecessor | Last version | Imported as | Tag in this repository | Archived at |
|---|---|---|---|---|
| farstic/claude-servicenow-live (the "engine", local folder AI-Architect-Claude) | v2.8.0 | repository root | `import/engine-v2.8.0-worktree` | https://github.com/farstic/claude-servicenow-live (archived <date>) |
| farstic/snow-mcp (the MCP server, npm `@farstic/snow-mcp@1.0.0`, earlier "NowAIKit" / `servicenow-mcp`) | 1.0.0 | `packages/snowarch/` via `git subtree add` | `import/snow-mcp-1.0.0` | https://github.com/farstic/snow-mcp (archived <date>) |

`git log --oneline import/engine-v2.8.0-worktree..v2.0.0` and `git log --follow packages/snowarch/src/server.ts` cross the import boundary (the engine was merged at the root with `--allow-unrelated-histories`, so its paths need no `--follow`; the server came in by `git subtree add --prefix=packages/snowarch`, and ARC-01-S03 acceptance criterion 2 verifies that `--follow` reaches the original first commit, with a filter-repo fallback if it does not). The relicensing statement (Apache-2.0, D-02) is the root commit message.

Decisions that shaped the merge: ADR-0001 names · ADR-0002 licence · ADR-0003 scope cut (ledger below) · ADR-0004 credential policy · ADR-0005 permission posture and principle 10 · ADR-0006 distribution channel (+ ADR-0008 if the S-14 hedge re-opened it) · ADR-0007 post-decision rulings (Q-A, Q-B, R-1, R-2, R-3).

Not carried (D-03): desktop app; other-client installers; BYOK direct mode; PDF/PPTX reports; A2A; HTTP/SSE transport, dashboard, Dockerfile; server prompts and Copilot personas; the claude.ai surface; context-mode. They remain in the predecessors' history under the tags above.

The npm record `@farstic/snow-mcp@1.0.0` is unchanged and unmaintained; this product publishes as `@farstic/snowarch` from 2.0.0.
```

Test: `tests/architecture-history.test.mjs` — runs `git tag -l 'import/*'` and asserts both tags exist; runs `git rev-list --count import/engine-v2.8.0-worktree..HEAD` > 0; parses the History section and asserts every relative link (`docs/decisions/ADR-000N-*.md`) exists; the two GitHub URLs are checked syntactically only (no network in unit tests). The "archived <date>" cells are filled by S09/S10 — until then they read "pending".

**Acceptance criteria.**
1. `git tag -l 'import/*'` lists exactly the two tags; `git log --oneline import/engine-v2.8.0-worktree..v2.0.0 | wc -l` > 0 on the tagged tree (README acceptance criterion 4; evaluated again in S06).
2. Every ADR link in the section resolves to a file in `docs/decisions/`; the test fails on a fixture with a broken link.
3. The section spells the old names only inside this section (the ratchet test's exemption is file-level; a second grep in the test asserts no old name appears in `docs/ARCHITECTURE.md` outside the `## History` heading range).
4. The D-03 "Not carried" list matches ADR-0003's nine items one for one.

**Tasks.** 1. Write the section. 2. Write the test; wire into `npm test`. 3. Cross-check the ADR file names with ARC-00-S03's output.

**Test strategy.** Unit in CI (git commands run inside the checkout; CI must fetch tags — `fetch-depth: 0` or `git fetch --tags` in the job, coordinated with ARC-01-S11).

**Dependencies.** ARC-01-S12 (stub), ARC-01-S02/S03 (tags), ARC-00-S03 (ADRs).

**Size.** S.

**Risks / open points.** Shallow CI clones lack tags — the test skips with an explicit "tags unavailable (shallow clone)" message rather than failing, and the release workflow (ARC-09-S03, full clone) runs it strictly.

**Definition of done.** Merged before the tag; test in CI; "archived" cells updated later by S10.

---

### ARC-10-S06 — Author's machine cutover on `v2.0.0`: doctor 0 FAIL, stale entries removed, legacy store gone, engagements untracked

**As** the author (first user) **I want** to follow `docs/MIGRATION.md` literally on my own machine, from the real old setup to the tagged product **so that** the page is proven on the one machine that has every leftover the plan describes, and the acceptance criterion for an existing user's machine is met before anyone else is asked to migrate.

**Context.** README acceptance criterion 1; P-34 (`00` §5: one `servicenow-mcp` local-scope entry for the engine checkout, four stale `nowaikit` entries under other folders, one more `servicenow-mcp` entry, context-mode at user scope); P-13; README risk 1 (engagement content).

**Scope.** In: the run itself on the tag; a private checklist ticked step by step; corrections to `docs/MIGRATION.md` arising from the run (a follow-up PR, still ARC-10); the decision on context-mode (D-03: the author's own choice, recorded); the author's engagement folders copied and checksum-verified. Out: any edit to the old repositories (S09); anything that changes product code (raise an issue for the owning ARC).

**Design notes.**

Pre-state capture (kept out of the repository; paths and counts only, never values):

```
jq '.projects | to_entries[] | select((.value.mcpServers // {}) | length > 0) | {key, servers: (.value.mcpServers | keys)}' ~/.claude.json
ls -la ~/.claude.json.bak-* 2>/dev/null | wc -l
test -d ~/.config/servicenow-mcp && echo legacy-store-present
git -C <old-engine-checkout> status --porcelain | wc -l
```

Rehearsal: run the page once on the release-candidate `main` (before ARC-09 tags), in a copy of the home directory (`HOME=$(mktemp -d)` with `~/.claude.json` and `~/.config/servicenow-mcp` copied in) so that mistakes in the page are found without touching the real state; then the real run on `git checkout v2.0.0`.

Real run: steps 1–9 of `docs/MIGRATION.md` exactly as written, no deviation; each deviation needed is a defect in the page (fix in the follow-up PR). The `instance import --from-legacy` review screen is inspected: environment proposed `pdi` for the `dev\d+` URL, six flags with the `full` proposal (D-05) — the author may toggle flags but records what the *proposal* was.

Post-state checks (README acceptance criterion 1, verbatim plus the refined `jq`):

```
./snowarch doctor            # 0 FAIL; E-23 and E-24 ok; stale.claudeJsonEntries == [] in --json
jq '.projects | to_entries[] | select(.value.mcpServers != null) | .key' ~/.claude.json   # no entry for the new checkout; chosen old entries gone
test ! -e ~/.config/servicenow-mcp && echo legacy-store-absent
git -C <new-checkout> status --porcelain clients/   # empty (ignored), while ls clients/ shows the folders
./snowarch version           # 2.0.0, tag v2.0.0, contract sha, docs pin
git log --oneline import/engine-v2.8.0-worktree..v2.0.0 | wc -l   # > 0
```

Context-mode: the author decides; either outcome is recorded in the run log as "context-mode: kept at user scope (outside the product)" or "removed". If kept, `./snowarch doctor` must not mention it (it is not a leftover of *this* product — ARC-08-S03's stale predicate matches only names `servicenow-mcp` / `nowaikit` or a `server.js` path under a `snow-mcp` directory, plus the legacy store; `context-mode` is a user-scope server and matches none of these).

Run log: `docs/validation/<date>-author-cutover.md` using the S07 template, section "Existing-user cutover" — counts and check outcomes only; no path under the home directory, no hostname, no username.

**Acceptance criteria.**
1. Given the author's machine in its pre-state, when `docs/MIGRATION.md` is followed on `v2.0.0`, then `./snowarch doctor` exits 0 with `0 fail` in the `DOCTOR:` line, E-23 and E-24 report ok, and `./snowarch doctor --json | jq '.stale'` shows `claudeJsonEntries: []` and `legacyStore: null`.
2. `jq '.projects | to_entries[] | select(.value.mcpServers != null) | .key' ~/.claude.json` lists no entry for the new checkout, and every old entry the author chose to remove is absent (the run log states how many were removed and how many, if any, were deliberately kept).
3. `~/.config/servicenow-mcp/` is absent; `~/.claude.json.bak-*` count is 0.
4. Engagement folders are present under `clients/` (`ls clients/` non-empty), `git status --porcelain clients/` prints nothing and `git status --porcelain --ignored clients/` prints exactly `!! clients/`; `diff ~/clients-before.sha256 ~/clients-after.sha256` (Windows: `Compare-Object` on the two CSVs) prints nothing.
5. `git log --oneline import/engine-v2.8.0-worktree..v2.0.0 | wc -l` > 0 in the author's checkout (README acceptance criterion 4).
6. Every deviation from the page needed during the run is either fixed in `docs/MIGRATION.md` (follow-up PR merged) or filed as an issue against the owning ARC; the run log lists them.
7. The run log passes `tests/validation-records.test.mjs` (S07 redaction lint).

**Tasks.** 1. Rehearse in a temporary `HOME` on the RC. 2. Fix the page. 3. Tag lands (ARC-09). 4. Real run; tick the checklist. 5. Post-state checks; write the run log. 6. Follow-up PR for page corrections.

**Test strategy.** Manual end-to-end on macOS (the author's machine); the run log is the evidence; the redaction lint runs in CI on the log.

**Dependencies.** S01–S05 merged; ARC-09-S01 (`v2.0.0` tag); ARC-07-S08; ARC-08-S03.

**Size.** M — rehearsal + real run + corrections; the run itself is < 1 hour.

**Risks / open points.** The author's machine also carries the context-mode hooks in `~/.claude/settings.json` with absolute `~/.npm-global` paths (`00` §3.12); if kept, the PreToolUse/PostToolUse hooks fire in the new checkout too — acceptable (the product does not depend on them) but the run log notes whether the SessionStart banner still appears within the ARC-08-S11 banner-timing gate alongside them (`01` §8 budgets the hook itself at < 300 ms). Deferred: rotating the PDI password (step 9) is recommended, not verified.

**Definition of done.** Run log committed; page corrections merged; README acceptance criterion 1 ticked with date.

---

### ARC-10-S07 — Validation-record template, redaction lint and the cutover test list (T-01…T-18 + `AUTHENTICATION_FAILED` + design-only)

**As** a maintainer **I want** a fixed record format, a lint that keeps instance identifiers out of committed records, and the exact list of tests each clean machine runs **so that** the three-OS validation (S08) produces comparable, publishable evidence.

**Context.** README deliverable 3 ("results stored under `docs/validation/<date>-<os>.md` without instance identifiers"); ARC-02-S13 (T-01…T-18 rewritten to Mode/Preset, T-07 replaced by a Mode-reporting `/snowarch` test, run history stripped, one design-only execution recorded); ARC-08-S10 (T-19 `AUTHENTICATION_FAILED` and T-20 `*_NOT_ENABLED` added to `tests/VALIDATION-TESTS.md`, test count 20, with design-only dormant variants); ARC-08-S01 acceptance ("doctor `--json` contains no secret and no clear-text username"); ARC-07-S11's live-E2E run record (its definition says "ARC-10 validation records follow the same format" — this template is that format). Q-B (Windows path statement), R-3 (proxy run).

**Scope.** In: `docs/validation/TEMPLATE.md`; `tests/validation-records.test.mjs`; the "Cutover test list" section appended to `tests/VALIDATION-TESTS.md` (which tests run in which mode on which machine); `docs/CONTRIBUTING.md` "Recording a validation run". Out: executing the runs (S08); changing any test's content (ARC-02-S13 / ARC-08-S10).

**Design notes.**

`docs/validation/TEMPLATE.md`:

```
# Validation run — <YYYY-MM-DD> — <macos|ubuntu|windows>

| Field | Value |
|---|---|
| OS / version / arch | macOS 14.6 arm64 · Ubuntu 24.04 x86_64 · Windows 11 23H2 x86_64 |
| Machine state | clean (fresh VM/user) · existing-user cutover |
| Claude Code | 2.1.x |
| git | 2.x |
| Node | 22.x · absent |
| Windows shell path | native (S-03/S-04/S-08 CONFIRMED) · Git Bash required (fallback) · n/a |
| Network | direct · corporate proxy (HTTPS_PROXY set) · private CA (NODE_EXTRA_CA_CERTS set) |
| Install path | A (terminal first) · B (Claude first) |
| Mode / preset | design-only · live / pdi-developer |
| Executor | initials (not the author for S08 rows 1–3) |
| Product version | 2.0.0 (`./snowarch version` output: tag, contract sha, docs pin) |

## Install timeline
| Step | Wall time | Dialogs seen | Notes |   ← B00…B09 lines as printed; trust dialog count; MCP approval count (S-01)

## Doctor summary
`./snowarch doctor --json` → ok / warn / fail counts; list of WARN ids (no values)

## Tests
| Test | Result | Notes |   ← one row per test in the cutover list; PASS / FAIL / SKIP(reason)

## Observer notes
Where the executor hesitated or re-read the install page; exact wording that confused.

## Defects raised
Issue links.
```

Redaction lint `tests/validation-records.test.mjs`: for every `docs/validation/*.md`, fail on: `[a-z0-9-]+\.service-now\.com` (any hostname; the template's field table does not need one), an e-mail pattern, a 32-hex string (sys_id), `password|secret|token` followed by `[:=]`, an absolute home-directory path (`/Users/`, `/home/`, `C:\Users\`), and any of the retired names; also require the field table rows above to be present.

Cutover test list (appended to `tests/VALIDATION-TESTS.md`):

| Machine / mode | Tests |
|---|---|
| Every clean machine, `design-only` | T-01…T-06, T-08…T-18 (as rewritten by ARC-02-S13); the ARC-02-S13/ARC-08-S09 T-07 (Mode-reporting `/snowarch status`, seven-line template verbatim); T-19 and T-20 in their design-only dormant variants (assistant states `Mode: design-only — no live instance; nothing to authenticate`, no MCP call — ARC-08-S10); design-only checks: banner reads `Mode: design-only`, `/mcp` shows the server disabled with no prompt (`03` S-01), no specialist attempts an MCP call during T-05/T-06's design-only variant (the generated rule file says the write rules are dormant, `01` §9); `/snowarch setup-instance` prints the terminal hand-off text and stops (D-06 hedge, ARC-07-S09) |
| One machine, `live` (`pdi-developer`) | T-05, T-06 in live form (write gate + §2.2 capture against a PDI, `RUN_LIVE_E2E`-style opt-in); T-19 `AUTHENTICATION_FAILED` (ARC-08-S10 setup: edit the stored password in `.local/instances.json`, expect one failed call, the verbatim remedy, no retry, then `set-credentials`); T-20 `*_NOT_ENABLED` (`set-preset pdi read-only`, a write prompt after "write approved", expect the `set-preset` remedy); `/mcp` shows `servicenow ✔ connected` |
| Proxied laptop (R-3) | B00 preflight and the wizard reachability probe (ARC-07-S02) with `HTTPS_PROXY` set and unset; `NODE_EXTRA_CA_CERTS` with the corporate root; doctor E-26 (proxy/CA environment) and SV-04's classified network code (ARC-08-S03/S04) |
| Existing-user cutover (S06) | steps of `docs/MIGRATION.md`; post-state checks |

`docs/CONTRIBUTING.md` "Recording a validation run": copy the template, fill, run `node --test tests/validation-records.test.mjs`, commit under `docs/validation/<date>-<os>.md`.

**Acceptance criteria.**
1. `docs/validation/TEMPLATE.md` exists with the field table, timeline, doctor summary, tests, observer notes and defects sections.
2. `tests/validation-records.test.mjs` fails on fixture records containing each forbidden pattern (six fixtures, one per pattern) and passes on the template.
3. `tests/VALIDATION-TESTS.md` contains the cutover test list with every T-id (T-01…T-20) resolvable to a `### T-NN` section in the same file (the lint parses both and fails on an unresolved id), plus the design-only checks listed by name.
4. The lint is wired into `npm test` and runs on the three CI OSes.
5. The template's field table and section headings are a superset of ARC-07-S11's run-record fields, so ARC-07's record passes the lint unchanged.

**Tasks.** 1. Write the template. 2. Write the lint and its fixtures. 3. Append the test list; cross-check ids with ARC-02-S13's and ARC-08-S10's file state. 4. CONTRIBUTING section.

**Test strategy.** Unit (lint + fixtures) in CI.

**Dependencies.** ARC-02-S13 (T-01…T-18 ids, new T-07), ARC-08-S10 (T-19/T-20), ARC-07-S11 (record format parity), ARC-01-S11 (CI runner).

**Size.** M — template, lint, fixtures and the cross-referenced list.

**Risks / open points.** ARC-08-S10's definition of done says "ARC-10-S04 inherits the two tests" — the inheriting story is this one (S07), not S04; noted under cross-ARC obligations. The design-only checks are listed by name until ARC-02-S13 assigns ids.

**Definition of done.** Merged before the tag; CI green; CONTRIBUTING updated.

---

### ARC-10-S08 — Clean-machine validation runs: macOS, Ubuntu, Windows in `design-only`; one `live` (`pdi-developer`); one proxied laptop

**As** the maintainer **I want** three people who are not the author to install `v2.0.0` from the install page alone on clean machines, and one of them to reach live mode against a PDI, **so that** the product's central claim — installable and configurable in one sitting — is proven and recorded.

**Context.** README acceptance criterion 2 and deliverable 3; ARC-06 acceptance criteria (clean macOS without Node reaches `Mode: design-only`; clean Windows without Git Bash via `bootstrap.cmd`); ARC-09-S08 (CI matrix completion — automated proof; this story is the human proof); Q-B; R-3 (ARC-04-S11 manual proxied-laptop check, which its test strategy wants "before the `v2.0.0` tag" — the proxy run is therefore allowed on the release candidate, see Decisions block); D-05 (the live executor reviews the per-flag screen).

**Scope.** In: five runs — macOS design-only (Path A, Node absent), Ubuntu design-only (Path B, Claude first), Windows design-only (`bootstrap.cmd`, Git Bash state per Q-B outcome), one of the three upgraded to live with `pdi-developer` against the executor's own PDI (`./snowarch mode live`, `01` §9), one proxied corporate laptop (any OS) for the R-3 probes; the five records; defects filed. Out: fixing defects (owning ARC); team/shared instance (Q-A); non-PDI instances.

**Design notes.**

Machine preparation (recorded in each record's field table): fresh OS user or VM image; Claude Code at the floor **or** current (state which); git ≥ 2.25; Node absent on the macOS run, present on Ubuntu and Windows; on Windows, Git for Windows installed but Git Bash removed from PATH if S-03/S-04/S-08 are CONFIRMED (native path), otherwise Git Bash on PATH and the record says "Git Bash required (fallback)". The executor receives only the repository URL — no chat with the author until the run is over; observer notes capture every hesitation.

Expected observable outcomes (from `01` §4.2/§4.3 and §9): typed actions 2 pastes on Path A (4 if typed line by line), 3 on Path B (`claude`, one sentence, `claude` again); dialogs: trust once, MCP approval 0 (S-01 CONFIRMED) or 1 (S-01 fallback); `[B0x/09] … ok` lines; B09 prints `DOCTOR: … 0 fail` and `Mode: design-only`; on the Node-less macOS run the summary says "doctor unavailable until Node 20+ is installed" and `/snowarch status` prints `Mode: design-only — from bootstrap state; doctor unavailable until Node 20+ is installed` from `.local/bootstrap-state.json` (ARC-02-S11 / ARC-08-S09); banner appears in the first session context (ARC-08-S11 timing gate).

Live upgrade on one machine: `./snowarch mode live` → B04–B08; wizard: environment proposed `pdi` for the `dev\d+` URL; preset proposal `full` with the per-flag review screen (D-05) — the executor selects `pdi-developer` (the validation target) and records that the proposal was `full`; `.claude/settings.local.json` flips to `enabledMcpjsonServers`; next `claude` shows `servicenow ✔ connected`; T-05/T-06 live; T-19 (ARC-08-S10 setup: the executor appends one character to the stored password in `.local/instances.json`, prompts a live read, expects one failed call, the verbatim `AUTHENTICATION_FAILED` remedy, no retry, then repairs with `./snowarch instance set-credentials <label>`); T-20 (`set-preset <label> read-only`, a write after "write approved", expects the `set-preset` remedy).

Proxied laptop: with `HTTPS_PROXY` unset behind the proxy, B00 must fail with the DNS/proxy diagnosis and the exact remedy (ARC-07-S02 wording); with it set, pass; with a private CA and no `NODE_EXTRA_CA_CERTS`, the TLS-CA diagnosis; with it set, pass; the doctor's two checks report both.

Records: `docs/validation/2026-MM-DD-macos.md`, `-ubuntu.md`, `-windows.md`, `-live.md` (or a "Live upgrade" section in the host OS record), `-proxy.md`. Each passes the S07 lint. Timing numbers (bootstrap wall time, docs checkout size) are recorded for the install page's "what you will see" table (ARC-06-S13; ARC-09-S03's `install-metrics.md` release asset is the automated counterpart that `docs/INSTALL.md` links).

**Acceptance criteria.**
1. Three records (macOS, Ubuntu, Windows) show `Mode: design-only` reached from the install page alone, executor ≠ author, with the dialog count and typed-action count recorded: Path A ≤ 4 typed actions (2 when pasted as the page shows), Path B = 3, trust dialogs = 1, MCP approval dialogs = 0 (or 1 if `03` S-01 fell back — the record cites the S-01 verdict) — `01` §4.2/§4.3.
2. The Windows record states the Q-B outcome ("native — S-03/S-04/S-08 CONFIRMED" or "Git Bash required — fallback") and matches the install page's Windows prerequisites paragraph.
3. One record shows `Mode: live — instance=<label> (pdi) preset=pdi-developer`, T-05/T-06 live PASS, T-19 and T-20 PASS, and notes that the wizard proposed `full` and showed the per-flag review (D-05).
4. The proxy record shows the four probe outcomes (proxy unset/set; CA unset/set) with the exact ARC-07-S02 codes and remedy strings printed (`HOST_DNS_FAILED` / proxy / `TLS_CA_UNTRUSTED` families), the doctor's E-26 line with the masked `HTTPS_PROXY` value, and SV-04's classified code; the record names the commit it ran on (RC or `v2.0.0`).
5. All records pass `tests/validation-records.test.mjs`; none contains a hostname, username, sys_id or home path.
6. Every FAIL in any record has an issue filed against the owning ARC and is linked; a FAIL in a design-only T-01…T-18 run blocks S09 (deprecation notices) until fixed and re-run.
7. The macOS run was performed with Node absent and still reached design-only (ARC-06 acceptance re-proven on the tag).

**Tasks.** 1. Recruit three executors; prepare machines; brief only with the URL. 2. Run the three design-only installs; collect records. 3. Live upgrade on one; T-19 and T-20. 4. Proxied laptop run (on the RC if that is when the laptop is available). 5. Lint, commit records; file defects. 6. Feed timings to the install page owner.

**Test strategy.** Manual end-to-end on three OSes (not CI); records linted in CI; the CI matrix (ARC-09-S08) is the automated counterpart and must already be green on the tag.

**Dependencies.** S06 (page proven), S07 (template/lint), ARC-09-S03 (tag assets) & ARC-09-S08 (matrix green), ARC-07-S02 (probe codes and wording), ARC-04-S11 (proxy agent), ARC-08-S03/S04 (E-26, SV-04), ARC-08-S10 (T-19/T-20 text).

**Size.** L — five runs on separate machines with different people, plus defect triage; calendar-bound rather than effort-bound.

**Risks / open points.** Availability of a proxied corporate laptop — if none is available by the tag, the proxy run is recorded as "not performed" with a date commitment and S09 is not blocked by it (R-3 checks are unit/integration-tested in ARC-04/07/08). Executors' Claude Code version may exceed the floor; the record states it. Deferred: a second Windows record on a GPO-locked machine (ARC-09 risk) if S-08 was proven on a VM only.

**Definition of done.** Five records committed (or four plus a dated "not performed" note for the proxy run); defects filed; README acceptance criterion 2 ticked.

---

### ARC-10-S09 — Deprecation notices in `farstic/claude-servicenow-live` and `farstic/snow-mcp`; archive checklist for the owner

**As** the owner **I want** both old repositories to say, at the top of their READMEs, that they are superseded and where to go, and a checklist for archiving them two weeks later **so that** nobody clones or forks the old setup by accident and no clone breaks abruptly (README risk 2).

**Context.** README deliverable 4 and acceptance criterion 3; README risk 2 ("notices first, archive two weeks after the tag"); D-01 (the npm record `@farstic/snow-mcp@1.0.0` untouched); P-15 (old names still reachable).

**Scope.** In: one PR per old repository adding the notice; the owner's archive checklist (a section in `docs/CONTRIBUTING.md` "Retiring the predecessors", executed by the owner in S10); the two `docs/ARCHITECTURE.md` "archived" cells (filled in S10). Out: `npm deprecate` / any npm action (D-01); deleting anything from the old repositories; archiving itself before the two-week date.

**Design notes.**

Notice text, inserted as the first block of each README (identical wording, one variable):

```
> **Superseded — <YYYY-MM-DD>.** This repository is no longer maintained. Its successor is
> **[farstic/ai-servicenow-architect](https://github.com/farstic/ai-servicenow-architect)** — the
> ServiceNow architecture engine and the MCP server in one repository, installed with two commands
> (`git clone … && ./bootstrap.sh`, then `claude`). This repository's full history is preserved there
> under the tag `import/engine-v2.8.0-worktree` ⟨resp. `import/snow-mcp-1.0.0`⟩. Existing users:
> follow [docs/MIGRATION.md](https://github.com/farstic/ai-servicenow-architect/blob/v2.0.0/docs/MIGRATION.md).
> This repository will be archived (read-only) on <YYYY-MM-DD + 14>.
```

`farstic/snow-mcp` gets one extra sentence: "The npm package `@farstic/snow-mcp@1.0.0` remains published as-is and is not updated; the successor server is `@farstic/snowarch` (2.0.0+) — behaviour changes are listed in [packages/snowarch/CHANGELOG.md § 2.0.0](https://github.com/farstic/ai-servicenow-architect/blob/v2.0.0/packages/snowarch/CHANGELOG.md) (ARC-04-S14's migration notes; its definition of done expects this link)." — the npm registry serves the README captured from the published tarball, so a GitHub README edit does not change the npm record (npm behaviour outside `00`/`01`/`03`; made observable by acceptance criterion 3's `npm view … readme` hash check), and the sentence complies with D-01.

The rest of each README is left untouched (history value); no other file in the old repositories is edited. The PR titles are `docs: superseded by farstic/ai-servicenow-architect`. The old repositories' `git status` must be clean before the PR — the engine checkout carries uncommitted `scripts/setup.sh` / `scripts/doctor.sh` (`00` §3.9) and, on 2026-09-04, modified `CLAUDE.md`, `README.md`, `SETUP.md`, `docs/*.md`, `scripts/README.md` and an untracked `node-compile-cache/`; they are committed or stashed as the owner prefers, since ARC-01 imported the working tree already — and the notice PR is created from a scratch clone (see risks).

Archive checklist (`docs/CONTRIBUTING.md` "Retiring the predecessors"; owner-only actions, GitHub UI):
1. Notices merged and visible on the default branch of both repositories (screenshot in the S10 review record).
2. Repository description set to "Superseded by farstic/ai-servicenow-architect" and homepage URL pointed at the new repository.
3. Open issues and PRs closed with a comment pointing at the new repository (or migrated).
4. Wait until `<tag date> + 14 days`; check the S10 issue list for a migration blocker; if none, Settings → Danger zone → Archive this repository (both).
5. Fill the "archived" cells in `docs/ARCHITECTURE.md` History and note the date in `docs/CHANGELOG.md` (2.0.x patch or the next release's notes).
6. Never: `npm deprecate`, `npm unpublish`, force-push, tag deletion, or editing anything on npm.

**Acceptance criteria.**
1. After `v2.0.0` exists (verified by `git ls-remote --tags https://github.com/farstic/ai-servicenow-architect v2.0.0`), both old repositories' README default-branch views begin with the notice; the migration link resolves (HTTP 200) to `docs/MIGRATION.md` at the `v2.0.0` tag.
2. `git log -1 --format=%s` on each old repository's default branch is the notice commit; `git diff HEAD~1 --stat` shows only `README.md`.
3. `npm view @farstic/snow-mcp version deprecated` still prints `1.0.0` and no deprecation message after the PRs, and `npm view @farstic/snow-mcp readme | shasum -a 256` prints the same digest before and after the `farstic/snow-mcp` README PR is merged (D-01 compliance; both outputs pasted into the S10 review record).
4. The archive checklist exists in `docs/CONTRIBUTING.md` with the six items and the "+14 days" rule.
5. Negative: no notice is pushed before the tag exists (the PRs are opened as drafts and marked ready only after criterion 1's tag check).

**Tasks.** 1. Prepare both PRs as drafts. 2. After the tag: verify, un-draft, merge. 3. Update description/homepage. 4. Write the checklist section. 5. Verify the npm record is untouched.

**Test strategy.** Manual (GitHub UI + the three shell checks above); the checks and their outputs are pasted into the S10 review record.

**Dependencies.** ARC-09-S01 (tag), ARC-04-S14 (`packages/snowarch/CHANGELOG.md` 2.0.0 section), S08 (no blocking design-only FAIL), S05 (History section cells to fill).

**Size.** S.

**Risks / open points.** Someone forks the old repository between notice and archive — acceptable; the notice is in the fork. The engine repository is also the current `origin` of the author's working checkout — the notice PR is created from a scratch clone to avoid disturbing S06's post-state.

**Definition of done.** Both notices live; checklist merged; npm record verified untouched; README acceptance criterion 3 (notice half) ticked.

---

### ARC-10-S10 — Two-week post-release review: telemetry-free feedback loop (issue template with the doctor JSON) and the archive trigger

**As** the maintainer **I want** a way for users to report an install or migration problem with the doctor's redacted JSON and nothing else, and a dated review that decides whether to archive the predecessors **so that** the product improves from real installs without any telemetry and the programme closes on evidence.

**Context.** README story 8 ("doctor telemetry-free feedback loop (issues template with the doctor JSON)"), README risk 2 (archive timing), ARC-08 acceptance ("`--json` output pasted into a chat contains no secret and no clear-text username"), the ARC-08 `--json` schema (story 1). The product never phones home: the doctor's only network calls are the ServiceNow probes and the reads of github.com the user starts (`01` §8; the banner's "behind origin" nudge reads a cached fetch, ARC-09-S07).

**Scope.** In: `.github/ISSUE_TEMPLATE/install-problem.yml` and `migration-problem.yml`; `.github/ISSUE_TEMPLATE/config.yml` (blank issues off, link to `docs/TROUBLESHOOTING.md`); `docs/CONTRIBUTING.md` "Reporting an install problem" and "Post-release review"; the review itself at tag + 14 days with its record `docs/validation/<date>-post-release-review.md`; the archive decision executed per the S09 checklist. Out: any analytics, crash reporting, or opt-in telemetry (explicitly rejected; the doctor JSON is pasted by a human); fixing the reported defects (owning ARC or the 2.0.x patch stream).

**Design notes.**

`install-problem.yml` (GitHub issue form): fields — OS and version (dropdown: macOS / Ubuntu-Debian / other Linux / Windows 10 / Windows 11); Windows shell (native `bootstrap.cmd` / Git Bash / n/a); install path (A terminal-first / B Claude-first / migration from the old repositories); mode (`design-only` / `live`); `./snowarch version` output (textarea); `./snowarch doctor --json` output (textarea, required, with the note "this output is redacted by design: usernames masked, secrets shown as `set (len n)`; check it before pasting"); what you expected; what happened; network (direct / proxy / private CA). `migration-problem.yml` adds: which step of `docs/MIGRATION.md`; the doctor's "Leftovers" block (paste).

A `tests/issue-templates.test.mjs` asserts the forms parse as YAML, the doctor-JSON field is required, and the text never asks for a password, URL or username.

Post-release review (`docs/CONTRIBUTING.md` "Post-release review", run at `v2.0.0` date + 14 days): 1. list issues with the `install` / `migration` labels; classify (page defect → ARC-10 follow-up; product defect → owning ARC / 2.0.x); 2. check whether every doctor JSON pasted was sufficient to diagnose (if a field was missing, ARC-08 gets a schema request); 3. confirm no report contained a secret (if one did, it is a redaction defect in ARC-08 — highest priority); 4. decide archive: no open migration blocker → execute S09 checklist item 4; otherwise set a new date and say why; 5. write the review record (S07 template's field table is replaced by: date, tag, issues opened/closed by class, archive decision, next actions); 6. update the `docs/ARCHITECTURE.md` History "archived" cells and the changelog.

**Acceptance criteria.**
1. Opening a new issue on the repository offers "Install problem" and "Migration problem" forms and no blank issue; the doctor-JSON field is required; `node --test tests/issue-templates.test.mjs` passes.
2. `grep -rinE "telemetry|analytics|phone.?home|posthog|sentry|segment\.io|mixpanel" tools packages/snowarch/src hooks` prints zero lines; `grep -rnE "fetch\(|https?://" tools/snowarch hooks --include=*.mjs | grep -vE "github\.com|service-now\.com|test|fixture"` prints zero lines (the only outbound hosts are GitHub and the user's instance, `01` §8); `docs/CONTRIBUTING.md` contains the sentence "the product sends nothing; reports are pasted by people".
3. At tag + 14 days a review record exists under `docs/validation/`, passes the redaction lint, and records the archive decision with its reason.
4. If the decision is "archive", both old repositories show "archived" on GitHub within two working days and the History cells carry the date (README acceptance criterion 3, archive half); if "defer", the new date is in the record and the S09 notices' "will be archived on" line is updated in a follow-up commit to each old repository.
5. Every issue classified "page defect" has a merged `docs/MIGRATION.md` or install-page fix or an open PR linked from the record.

**Tasks.** 1. Write the two forms and `config.yml`; the test. 2. CONTRIBUTING sections. 3. Calendar the review. 4. Run the review; write the record. 5. Execute or defer the archive; update History and changelog.

**Test strategy.** Unit (template test) in CI; the review is a manual, dated procedure with a committed record.

**Dependencies.** S09 (notices and checklist), ARC-08-S01 (`--json` schema and redaction), ARC-05-S06 (`docs/TROUBLESHOOTING.md` link target).

**Size.** M — the forms and test are ½ day; the review is ½–1 day; the calendar wait is not effort.

**Risks / open points.** Zero reports in two weeks is not evidence of zero problems — the review record must say how many installs are known (the S08 executors, the author, any announced users) so the decision is honest. Deferred to a later release: an optional `./snowarch doctor --report` that writes the JSON to a file for attaching (small, but it is new CLI surface and belongs to ARC-08's owner).

**Definition of done.** Forms merged and tested; review record committed; archive executed or deferred with reason; the programme's last README acceptance criterion ticked.

---

## Sizing summary

| Story | Size | Days |
|---|---|---|
| S01 | M | 1.5–2 |
| S02 | S | 0.5 |
| S03 | S | 0.5 |
| S04 | S | 0.5 |
| S05 | S | 0.5 |
| S06 | M | 1–1.5 |
| S07 | M | 1–1.5 |
| S08 | L | 3–5 (calendar-bound; five runs by different people) |
| S09 | S | 0.5 |
| S10 | M | 1–1.5 |
| **Total** | | **≈ 10.5–14 engineer-days** plus a fixed 14-calendar-day wait between S09 and S10 |

Under six weeks for one engineer. The critical path is calendar, not effort: S01–S05 and S07 must merge before ARC-09 tags `v2.0.0`; S06 and S08 follow the tag; S09 follows S08; S10 is dated tag + 14 days.

## Cross-ARC obligations created by these stories

- **ARC-01-S10:** add `docs/MIGRATION.md` to the always-exempt list of `tests/no-legacy-names.test.mjs` (today the list is `docs/ARCHITECTURE.md`, ADRs, `NOTICE`, the test and allow-list files, `scripts/legacy/**`); the README migration line is allow-listed with owner ARC-10 (S01).
- **ARC-08-S03:** no registry change is needed — S01's test keys on the existing `section: 'legacy'` field and on the doctor's `command` strings as substrings, so the "(run from this folder)" annotation stays as ARC-08 prints it. Two things ARC-08-S03 must honour: (i) the stale predicate stays name/path based so `context-mode` (user scope) is never listed (S01, S06); (ii) **E-24's Windows path is wrong** — it looks under `%APPDATA%\servicenow-mcp\`, but the legacy store was written to `homedir()/.config/servicenow-mcp/instances.json` on every OS (`snow-mcp/src/cli/config-store.ts:97-103`), i.e. `%USERPROFILE%\.config\servicenow-mcp\` on Windows; ARC-07-S08's default `--path` must use the same location (S01 acceptance criterion 8).
- **ARC-08-S01:** the `--json` schema (`stale.claudeJsonEntries[].command`, `stale.legacyStore`) is both S01's test input and the issue-form payload; redaction is load-bearing for S10 (S01, S07, S10).
- **ARC-08-S10:** its definition of done says "ARC-10-S04 inherits the two tests" — the inheriting story is ARC-10-S07 (cutover test list, T-19/T-20); the ARC-08 text should be corrected when next edited (S07).
- **ARC-07-S08 / ARC-07-S11:** the `import --from-legacy` review screen and closing advice are snapshotted into `docs/MIGRATION.md` from the S11 fixture run; wording changes after S01 require a page update (S01). ARC-08-S03's scope line names the import command as "ARC-07-S07" — it is ARC-07-S08.
- **ARC-09-S01/S03:** the release workflow runs `tests/architecture-history.test.mjs` on a full clone; `install-metrics.md` is the automated counterpart of S08's timing numbers (S05, S08).
- **ARC-04-S11:** its "manual verification on a real proxied laptop before the `v2.0.0` tag" is S08's proxy run, which may execute on the RC before the tag (Decisions block).
- **ARC-04-S14:** the `farstic/snow-mcp` notice links `packages/snowarch/CHANGELOG.md` § 2.0.0 (S09).
- **ARC-02-S13 / ARC-08-S10:** the cutover test list references T-01…T-20 as they stand in `tests/VALIDATION-TESTS.md` (S07).
- **ARC-06-S13:** the Windows prerequisites paragraph must match the Q-B outcome recorded in S08's Windows record; `docs/MIGRATION.md` links its Uninstall section (S01, S08). **ARC-09-S11:** `docs/MIGRATION.md` links `docs/INSTALL.md#upgrading` (S01).
