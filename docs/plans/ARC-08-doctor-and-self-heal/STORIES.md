# ARC-08 — Stories

Status: Draft · Decisions applied: D-01…D-06, Q-A, Q-B, R-1…R-3 · Source: README.md of this ARC · Last updated: 2026-09-04

Conventions used below (per `02-DECISIONS-NEEDED.md`): repository `farstic/ai-servicenow-architect`; root launcher `./snowarch` (`snowarch.cmd` on Windows) → `tools/snowarch/bin/snowarch.mjs` (zero-dependency Node ESM); server package `packages/snowarch` (`@farstic/snowarch`, first release `2.0.0`); MCP key `servicenow` → tools `mcp__servicenow__snow_*`; project skill `/snowarch` with sub-commands `status` · `setup-instance` · `doctor`; vocabulary Mode `design-only` | `live`, Preset `read-only` | `pdi-developer` | `full` | `custom`. Every reference to `/status` in older text reads `/snowarch status`. Engine checks are `E-xx`; server checks are `SV-xx` (`01` §8 wrote `S-xx`, which collides with the spike ids of `03`; ARC-04-S12 already ships the server ids as `SV-00…SV-07` from its first commit, so no rename happens in this ARC — see S01). All state read or written by this ARC lives in `.local/` (gitignored) or `.claude/settings.local.json`; the doctor never writes anything else and never touches `~/.claude*`.

## Story map
| ID | Title | Size | Depends on | Delivers |
|---|---|---|---|---|
| ARC-08-S01 | Doctor framework: check registry, sections, severities, remedies from the contract, JSON schema, exit codes, redaction | L | ARC-04-S12 (registry contract), ARC-05-S06 (error-code registry), ARC-05-S10 (contract loader), ARC-06-S02 (CLI skeleton) | `tools/snowarch/lib/doctor/` runner, `--json` schema v1, redaction library, `docs/ARCHITECTURE.md` "Doctor" section |
| ARC-08-S02 | Engine checks E-00…E-22: prerequisites, repo wiring, docs corpus, roster, contract | L | S01; ARC-01-S04 (`engine.config.json`), ARC-03-S06 (`docsStatus()`), ARC-05-S03/S04 (lint library), ARC-06-S01/S05 (committed files, toggles) | The 23 engine checks that make the old doctor's four failures impossible by construction |
| ARC-08-S03 | Stale-registration, legacy-store, cloud-sync, proxy/CA and registration-status detectors (E-23…E-27) with exact commands | M | S01; ARC-04-S02 (`isUnderCloudSyncFolder`), ARC-04-S11 (network classifier codes), ARC-00-S04 (S-01 `claude mcp get` status strings), ARC-06-S05/S12 (toggle semantics, `--register local`) | Every leftover of the old install named with its removal command; R-3 host-side proxy/CA state; R-13 `claude mcp get servicenow` status re-check |
| ARC-08-S04 | Server checks SV-00…SV-07 integrated: module import, probe wiring (basic + ROPC), FLUENT SDK, capabilities equality, section `server` | M | S01; ARC-04-S12 (module), ARC-07-S03 (probes), ARC-04-S04 (`snow_core_capabilities_read`) | One import path for the server checks; live checks reuse the wizard's probes; `SV-` ids final |
| ARC-08-S05 | Merged report, the authoritative `Mode:` line, `--quick` / `--no-network` / `--section`, capability packs, `.local/doctor-last.json` | M | S01, S02, S04 | `./snowarch doctor` as one command with one report and one Mode line; the cache the banner and the skill read |
| ARC-08-S06 | `--fix` whitelist with per-fix reporting and refusal rules | L | S02, S03, S04, S05; ARC-06-S05/S06/S07 (steps B02/B04/B07 callable as functions), ARC-03-S05 (`docs sync`) | Safe self-heal for seven classes of drift; exact commands for everything else |
| ARC-08-S07 | Old→new check mapping table (`D00–D37` → `E-xx` / `SV-xx` / retired) in `docs/ARCHITECTURE.md` | S | S02, S03, S04 | Every old check intent accounted for (README acceptance criterion 2) |
| ARC-08-S08 | `hooks/session-start.mjs` banner: cache, staleness re-run, nudges, hook timeout, S-05 handling | M | S05; ARC-06-S01 (hook entry in `.claude/settings.json`), ARC-06-S05 (S-05 toggle), ARC-00 S-05 verdict | The `Mode:` line in every session within 1 s; never blocks; never prints a secret; fixes the `.local/upgrade-check.json` shape ARC-09-S07 writes later (optional input) |
| ARC-08-S09 | `/snowarch status` skill body: doctor-JSON rendering and the no-Node fallback | M | S05, S08; ARC-02-S11 (skill file), ARC-07-S09 (setup-instance body — merge order) | The in-session status screen that quotes, never guesses |
| ARC-08-S10 | Runtime error mapping in the generated rule file; VALIDATION-TESTS T-19 (`AUTHENTICATION_FAILED`) and T-20 (`*_NOT_ENABLED`) | M | S05; ARC-05-S05 (rule renderer), ARC-05-S06 (registry), ARC-07-S10 (per-code `ruleText` for the wizard's codes), ARC-02-S13 (`tests/VALIDATION-TESTS.md`) | The engine stops on runtime errors and names the remedy; two new behavioural tests |
| ARC-08-S11 | CI: doctor after bootstrap on three OSes, JSON snapshot test, fixture-driven detector tests, banner timing | M | S02–S10; ARC-06-S14 (bootstrap CI job), ARC-00-S13 (Windows recipe) | README acceptance criteria 1, 3, 5, 6 proven on every commit |

README titles → stories: README 1 → S01 · 2 → S02 · 3 → S03 · 4 → S04 · 5 → S05 · 6 → S06 · 7 → S07 · 8 → S08 · 9 → S09 · 10 → S10 · 11 → S11 (one-to-one; the R-3 proxy/CA doctor check, the D-04 cloud-sync WARN — both post-README rulings — and the `03` R-13 obligation "the doctor checks `claude mcp get servicenow` status text" (also expected by ARC-06-S01/S05) are folded into S03 rather than adding a twelfth story, because they are detectors of host state with a printed remedy, exactly like the stale-registration detector).

## Stories

### ARC-08-S01 — Doctor framework: check registry, sections, severities, remedies from the contract, JSON schema, exit codes, redaction
**As** a maintainer and as CI **I want** one doctor runner in `tools/snowarch/lib/doctor/` with a typed check registry, stable ids, a documented JSON shape, fixed exit codes and a redaction pass that every output string goes through **so that** every later story only adds checks, and the banner, the `/snowarch` skill and CI consume one shape that can never contain a secret.
**Context.** README deliverable "Output redaction: usernames masked, secrets as `set (len n)`; `--json` schema documented for the skill and CI" and acceptance criterion 3 (JSON pasted into a chat contains no secret and no clear-text username). `00` P-16 (`scripts/doctor.sh:617` prints the basic-auth username in clear). `01` §8 (one merged report from two owners), §11 ("Tooling reads flag names, presets, error codes and tool names from the contract; nothing hard-codes a list"). ARC-04-S12 defines the server-side registry contract (`Check`, `CheckResult`, runner shape) and asks ARC-08 to own the final id prefix. ARC-05-S10 supplies `loadContract`, `remedyFor`, `flagNames`, `prefix`; ARC-05-S06 supplies the error-code registry the remedies come from.
**Scope.** In: `tools/snowarch/lib/doctor/registry.mjs` (types, `defineCheck`, sections, severities), `runner.mjs` (ordering, timing, skip semantics, exit codes), `redact.mjs`, `report-text.mjs` (human renderer), `report-json.mjs` (schema v1 + validator used by tests), the `snowarch doctor` sub-command wiring in `tools/snowarch/bin/snowarch.mjs` (argument parsing for `--json --quick --no-network --fix --section <name> --write-cache/--no-cache`), the `docs/ARCHITECTURE.md` "Doctor" section (ids, sections, JSON shape). Out: any check body (S02–S04), the merged Mode line and cache (S05), fixers (S06 — this story only reserves the `fixable`/`fix` fields), the banner (S08).
**Design notes.**
- **Id prefixes.** Engine checks `E-00…E-nn`; server checks `SV-00…SV-nn`. ARC-04-S12 already ships `SV-00…SV-07` as one exported constant in `packages/snowarch/src/doctor/index.ts` (its "Risks" note records that `01` §8's `S-xx` collides with the spike ids and adopts this ARC's prefix), so this story performs no rename. Ids are never reused: a retired check keeps its number in the mapping table (S07).
- **Registry-contract extension (PR against ARC-04's tree).** ARC-04-S12's `CheckResult` is `{ id, title, status, detail, remedy?, fixable: false }` and its `Check` has no `quick`/`spawns`/`fixable` flags. This story extends both in `packages/snowarch/src/doctor/index.ts` in the same PR, keeping every new field optional so ARC-04-S12's tests stay green: `fixable` becomes a boolean (SV-01/SV-02/SV-03 are fixable in S04/S06), and `command`, `code`, `data`, `durationMs`, `quick`, `spawns` are added. The engine-side JSDoc types below are the superset; the server exports the same shape so S04 adopts server results without conversion.
- **Registry types** (`registry.mjs`, JSDoc-typed, stdlib only):
  ```js
  /** @typedef {{ id:string, section:'prereqs'|'repo'|'docs'|'roster'|'contract'|'legacy'|'host'|'server',
   *   title:string, severity:'fail'|'warn'|'info', quick:boolean, network:boolean, spawns:boolean,
   *   fixable:boolean, run:(ctx)=>Promise<CheckResult> }} Check */
  /** @typedef {{ id, status:'ok'|'warn'|'fail'|'skip', detail:string, remedy?:string, command?:string,
   *   code?:string, data?:object, durationMs:number }} CheckResult */
  ```
  `severity` is the status a failing condition produces (`fail` → FAIL, `warn` → WARN, `info` → the check reports `ok` with a detail and can never fail — used for capability packs). `quick` marks membership in the `--quick` subset; `network` marks checks skipped by `--no-network`; `spawns` marks checks that spawn a child process other than `git` (excluded from `--quick`). `code` is an error code from the contract registry when one applies (`remedy`/`command` are then taken from `remedyFor(contract, code)` and may not be hand-written — a runner assertion throws in tests if a check sets `code` and a hand-written `remedy` at once).
- **Context** passed to every check (`ctx`): `{ root, config /* engine.config.json */, contract /* loadContract({root, verifyPin:false}) or null with the load error */, flags: { quick, noNetwork, fix, section }, platform: process.platform, env: process.env, homedir, git: (args)=>string /* execFileSync('git', …, {cwd:root}) */, now }`. `loadContract` is called with `verifyPin: false` so a stale pin becomes a check result (E-22) instead of a crash (ARC-05-S10 criterion 2).
- **Runner.** Filters by `--section` (comma-separated; `server` = every `SV-` check; unknown name → exit 2 with the list of names), by `--quick` (`quick && !spawns && !network`), by `--no-network` (`!network`). Runs sections in registry order, checks sequentially within a section (deterministic output), each with a per-check timeout (default 15 s; `network` checks 20 s) that yields `status: 'fail', detail: 'timed out after 15 s'`. A check that throws yields `status: 'fail', detail: 'check crashed: <message>'` — the doctor never aborts on a single check. Collects `summary: { ok, warn, fail, skip, fixable }`.
- **Exit codes** (same as the old doctor, `00` §3.9): `0` no FAIL (WARN allowed) · `1` at least one FAIL · `3` the doctor could not run at all (not at the repository root — no `engine.config.json` in cwd or any parent up to the git top level; `engine.config.json` unparsable; Node below `floors.node` — reported before anything else). `2` for usage errors. Exit codes apply with `--json` too (CI relies on them; the JSON always carries `summary`).
- **JSON schema v1** (`report-json.mjs` documents it; `tests/doctor/schema.test.mjs` validates fixtures against it with a hand-written validator — no Ajv at runtime, `tools/snowarch` stays dependency-free):
  ```json
  { "schema": 1, "product": "snowarch", "version": "2.0.0", "ranAt": "2026-09-04T10:00:12Z", "durationMs": 1830,
    "options": { "quick": false, "noNetwork": false, "fix": false, "section": null },
    "mode": "design-only", "modeLine": "Mode: design-only — …", "modeLineDetailed": "Mode: design-only — …",
    "engine": { "version": "2.0.0", "tag": "v2.0.0", "contractSha": "…", "docs": { "…docsStatus() object…" },
                "roster": { "skills": 28, "agents": 9 }, "capabilities": { "docx": "yes (python3)", "pdfQa": "no", "drawio": "yes", "mermaid": "no" } },
    "server": { "available": true, "mode": "configured", "instances": [ { "label": "pdi", "environment": "pdi", "preset": "pdi-developer", "status": "loaded", "username": "a***n", "lastProbe": { "…" } } ] },
    "checks": [ { "id": "E-00", "section": "prereqs", "title": "Claude Code CLI", "status": "ok", "severity": "fail", "detail": "2.1.258 ≥ 2.1.214, logged in", "remedy": null, "command": null, "code": null, "fixable": false, "quick": false, "durationMs": 412 } ],
    "fixes": [], "stale": { "claudeJsonEntries": [], "legacyStore": false },
    "summary": { "ok": 41, "warn": 0, "fail": 0, "skip": 0, "fixable": 0 } }
  ```
  `mode`, `modeLine`, `modeLineDetailed`, `engine`, `server`, `stale` are filled by S05/S03/S04; this story emits them as `null` with the keys present so the schema is stable from day one (ARC-02-S11's fixture stub already assumes `modeLine`).
- **Redaction** (`redact.mjs`, applied by the runner to every `detail`, `remedy`, `command` and to every string leaf of `data` before rendering — the checks never redact themselves, so a forgotten mask cannot leak): usernames → first character + `***` + domain when present (`someone@corp.example.com` → `s***@corp.example.com`, `admin` → `a***`); any value whose key matches `/PASSWORD|SECRET|TOKEN|_KEY$/i` → `set (len n)`; proxy URLs → `http://***@host:port`; absolute paths under `homedir` → `~/…`; the store path → `maskPath` semantics of ARC-04-S02 (`~/…/.local/instances.json`). The mask functions mirror `packages/snowarch/src/store/paths.ts` (`maskUsername`, `maskPath`) — `tests/doctor/redact.test.mjs` runs the same fixture table against both implementations so they cannot drift.
- **Human renderer** (exact layout; the doctor prints the Mode line last so it is the final line of any transcript):
  ```
  snowarch doctor 2.0.0 — 2026-09-04 10:00:12 (quick: no · network: yes · section: all)

  prereqs
    E-00 ok    Claude Code CLI: 2.1.258 ≥ 2.1.214, logged in
    E-01 ok    git: 2.45.2 ≥ 2.25.0
  docs
    E-12 docs corpus: FAIL — corpus absent (docs mode "skip"); grounding and citations are unverified — run ./snowarch docs sync
    (amended at ARC-03-S11: quoted verbatim from E12_ABSENT() in tools/snowarch/lib/docs/status.mjs, which ARC-08 imports rather than retypes)
               → run ./snowarch docs sync            [fixable: ./snowarch doctor --fix]
  server
    SV-03 warn instance "pdi": 4/6 flags explicit — NOW_ASSIST_ENABLED, FLUENT_ENABLED absent (treated as "false")
               → ./snowarch doctor --fix writes them as "false"   [fixable: ./snowarch doctor --fix]

  DOCTOR: 41 ok, 1 warn, 1 fail (2 fixable — run ./snowarch doctor --fix)
  Mode: design-only — no ServiceNow instance configured; run ./snowarch instance add or /snowarch setup-instance to add one
  ```
  Statuses are printed as `ok`, `warn`, `FAIL`, `skip` (FAIL upper-case so `grep FAIL` works, as with the old doctor). Colour only when stdout is a TTY and `NO_COLOR` is unset.
- **CLI** in `bin/snowarch.mjs`: `doctor [--json] [--quick] [--no-network] [--fix] [--section <a,b>] [--no-cache]`; `--quick` implies `--no-network`; `--fix` with `--json` is allowed (fix entries land in `fixes[]`). `--write-cache` is the default (S05 writes `.local/doctor-last.json`); `--no-cache` disables it (used by tests).
- **The `prereqs` section has a CONSUMER, and its fields are fixed.** `/snowarch setup-instance`
  (ARC-07-S09) is the only reader of `--json --section prereqs` and branches on it, so the shape is
  agreed here rather than discovered later — **fixed 2026-09-10**:

  | field | values | why the skill needs it |
  |---|---|---|
  | `os` | `darwin` \| `linux` \| `win32` | picks `./snowarch` or `snowarch.cmd` in the hand-off |
  | `shell` | `bash` \| `zsh` \| `powershell` \| `cmd` \| `unknown` | the parent process; `unknown` makes the skill print BOTH spellings |
  | `node.ok` / `node.version` | boolean / e.g. `22.14.0` | the "Node 20+ is required" stop |
  | `deps.ok` | boolean | the "run `./snowarch doctor --fix`" stop |
  | `mode.toggle` | `enabled` \| `disabled` \| `absent` | the design-only stop, which asks nothing |
  | `store.exists` | boolean | whether to propose "make it the default" |

  `shell` is the one field the doctor does not have today — S01 adds the parent-process guess, and
  `unknown` is a first-class answer rather than a failure. Until this section exists the skill
  degrades honestly (it reads `.local/bootstrap-state.json` and prints both command spellings);
  ARC-07-S09's body carries that fallback and names this story as the thing that removes it.
- **No literal names.** Flag names, preset names, tool names and error codes come from the ARC-05-S10 loader; `tests/contract/no-literals.test.mjs` scans `tools/snowarch/**` and fails on any literal (ARC-05 README criterion 7). Design notes in S02–S06 that show a literal (e.g. `WRITE_ENABLED`) describe output, not source.
**Acceptance criteria.**
1. Given a checkout with `engine.config.json` present, running `./snowarch doctor --json --no-cache` with an empty registry (test harness) prints a JSON object validating against schema v1 with `summary.ok == 0` and exits 0; the same with a registered check whose `run` returns `fail` exits 1; with a check that throws, the report shows `status: "fail"` with `detail` starting `check crashed:` and the process still exits 1 (not a stack trace).
2. Running `./snowarch doctor` from `clients/acme/` (a sub-directory) prints `DOCTOR: not at the repository root — run: cd <root>` and exits 3; running it with `NODE_VERSION` below `floors.node` (test spawns with a shimmed `process.versions.node`) exits 3 with the per-OS Node install command from `01` §6.2 step 1.
3. A check that sets `code: 'AUTHENTICATION_FAILED'` renders exactly the registry's remedy and command (character-identical to `docs/TROUBLESHOOTING.md`'s `### AUTHENTICATION_FAILED` section — the test reads both); a check setting both `code` and a hand-written `remedy` fails the registry self-test.
4. `--section docs,server` runs only those sections; `--section bogus` exits 2 printing `unknown section "bogus"; valid: prereqs, repo, docs, roster, contract, legacy, host, server`.
5. Given a check whose `detail` contains the fixture username `someone@corp.example.com` (neutral and assembled — see the amendment), a fixture password value and an absolute home path, the JSON and text outputs contain `s***@corp.example.com`, `set (len 12)` and `~/`, and `grep -c "someone@corp.example.com\|<fixture password>"` on both outputs returns 0.
6. `node --test tests/doctor/` passes on ubuntu, macOS and Windows before `npm ci` has been run (stdlib only; the contract loader is imported by relative path).
7. `docs/ARCHITECTURE.md` "Doctor" section lists the sections, the id rule, the exit codes and the JSON shape above verbatim; `scripts/gen-roster.mjs --check`-style staleness is not required (hand-maintained section; S07 appends the mapping table).
**Tasks.**
1. Write `registry.mjs`, `runner.mjs` with timeouts, crash isolation and exit codes.
2. Write `redact.mjs` and the parity fixture table shared with the server package.
3. Write `report-text.mjs` and `report-json.mjs` (+ validator) and the CLI wiring; extend ARC-04-S12's `Check`/`CheckResult` types in `packages/snowarch/src/doctor/index.ts` (optional fields only) with ARC-04-S12's owner.
4. Tests: schema, exit codes, crash isolation, section filter, redaction, no-literals guard passes.
5. `docs/ARCHITECTURE.md` "Doctor" section.
**Test strategy.** Unit (`node:test`) on the nine CI cells; a harness that registers synthetic checks so the framework is tested without any real check. No network, no spawn.
**Dependencies.** ARC-04-S12 (types, module), ARC-05-S06 (registry with remedies in `contract.errorCodes[]`), ARC-05-S10 (loader), ARC-06-S02 (`bin/snowarch.mjs` argument parsing and exit-code conventions — this story adds a sub-command, it does not create the CLI).
**Size.** L — the runner, two renderers, redaction with parity tests and the schema documentation are ~4 days; every later story is smaller because of it.
**Risks / open points.** The registry-contract extension touches ARC-04's tree — schedule immediately after ARC-04-S12 merges and before ARC-07-S03 binds its probes to the `Probes` interface; a test on the server side asserts that a result without the new fields still validates (backwards compatibility). The hand-written JSON validator must stay small (≤ 150 lines); if it grows, move validation to a dev-only Ajv test (root devDependency already exists per ARC-01-S04).
**Definition of done.** Merged; tests green on nine cells; `docs/ARCHITECTURE.md` "Doctor" section committed; ARC-02-S11's fixture stub updated to emit schema v1 keys.

---

> **Amendment 2026-09-10 (ARC-08-S01).** Five departures and findings.
>
> **(1) AC 5's fixture username is NEUTRAL.** The criterion spells a real person's address. The rule
> of record is that no real name, email or account appears in this repository, its tests or its
> transcripts — so the fixture is assembled from parts as `someone@corp.example.com`, and the
> assertions are the same three: the masked form, `set (len n)`, and `~/`. A test about redaction is
> the last place to make an exception to the rule it is testing.
>
> **(2) `homedir` is passed IN, never read under `lib/`.** `tools/snowarch/tests/mode-register.test.mjs`
> forbids `homedir`/`USERPROFILE` anywhere in the engine's library — the rule that keeps the CLI out
> of `~/.claude.json`. The doctor needs the home directory only to shorten a path to `~` in a report,
> so `bin/snowarch.mjs` reads it and `main()` threads it through. Without one the rule simply does
> not apply and a path prints as it is, rather than being half-masked against a guess.
>
> **(3) "Not at the repository root" means the ROOT, not "inside it".** The first implementation
> walked up, found the checkout and ran — which is how the launcher behaves, and wrong here: every
> path in the report resolves relative to the root, so a run from `clients/acme/` would describe a
> directory the reader is not in. `realpath`-compared, because `/var` is a symlink to `/private/var`
> on macOS and a temp checkout is reached through both names.
>
> **(4) The engine's registry REQUIRES the three booleans; the server's leaves them optional.** A
> check written against the engine must declare `quick`, `network` and `spawns` — the failure mode
> of an undeclared `network` is a doctor that touched the network on a machine that has none. The
> server's `Check` keeps them optional so ARC-04-S12's own checks compile unchanged, and ARC-08-S04
> supplies the defaults it knows when it adopts them.
>
> **(5) The ARCHITECTURE section's two blocks are GENERATED** (`scripts/gen-doctor-docs.mjs`, from
> the real modules with a fixture registry) — the JSON shape and the renderer sample. A documentation
> block that embeds a moving value goes stale the first time it moves, and nobody re-reads a section
> they already believe. `gen-all` is **10 generators** now.

### ARC-08-S02 — Engine checks E-00…E-22: prerequisites, repo wiring, docs corpus, roster, contract

> **Amendment 2026-09-08 (from the ARC-02-S07 delivery).** **The roster check calls `node scripts/gen-roster.mjs --json`** — it does not re-read `.claude/skills` and `.claude/agents` itself. That output carries `skills` (with `firesAs` and `version`), `agents` (with `skills` preloads), `utility`, and a `problems` array that is the same list `--check` prints: count mismatches against `engine.config.json.roster`, an agent preloading a skill that does not exist, and an agent that does not preload its own persona. Exit is 1 when `problems` is non-empty. A second implementation would be a second definition of the roster, which is the defect ARC-02-S07 exists to close (P-12).
**As** an individual practitioner **I want** the doctor to verify every piece of committed wiring, the docs corpus, the roster and the contract pin against their generators and `engine.config.json` **so that** a passing report proves the install is correct, and the four failures the old reference install produced (dead citations, absent NOW_ASSIST/FLUENT flags, retired names — `00` P-17) cannot recur silently.
**Context.** README deliverable "Engine checks E-00 …" and acceptance criterion 1 (0 FAIL on the reference machine; the old four failures impossible by construction). `01` §8 engine-check list; §5 (every `${…}` placeholder carries `:-`, credential-shaped keys forbidden); §10 (absent corpus = FAIL, never SKIP); §12 (floors from `engine.config.json`). `00` §3.9 (D08 parses `CLAUDE.md` prose for roster counts; D15 SKIP when the submodule is missing). ARC-03-S06 (`docsStatus()`), ARC-03-S11 (`E-12` text is owned there), ARC-05-S03/S04 (lint library functions), ARC-06-S01 (committed files), ARC-06-S05 (toggle writer and `disableAllHooks`).
**Scope.** In: check bodies `E-00…E-22` in `tools/snowarch/lib/doctor/checks/engine-*.mjs` (one file per section), their fixtures and tests. Out: detectors of host leftovers (S03: E-23…E-26), server checks (S04), the Mode line and cache (S05), fixers (S06 — checks only declare `fixable` and put a machine-readable `data.fix` hint in their result).
**Design notes.** Check table (id · section · title · condition → status · remedy · quick/spawns/fixable). Version comparisons use a stdlib semver-compare helper; floors are read from `engine.config.json.floors` (never literals).

| id | section | title | ok when / else | remedy (text or `code`) | q/s/f |
|---|---|---|---|---|---|
| E-00 | prereqs | Claude Code CLI | `claude --version` ≥ `floors.claudeCode` and `claude auth status` (or the documented equivalent from ARC-06-S04's B00) reports logged in; else FAIL | "install/upgrade Claude Code (`npm i -g @anthropic-ai/claude-code`) and run `claude` once to log in" | –/s/– |
| E-01 | prereqs | git | `git --version` ≥ `floors.git`; else FAIL | per-OS install line | q/–/– |
| E-02 | prereqs | Node.js | `process.versions.node` ≥ `floors.node` → ok (the doctor is running, so this is the floor check, not presence); else FAIL (the runner already exits 3 — this row exists for the mapping table) | `01` §6.2 step 1 install commands | q/–/– |
| E-03 | prereqs | npm | `npm --version` resolves; absent → WARN in design-only ("needed only for live mode"), FAIL in live mode | "install Node.js from nodejs.org (bundles npm)" | –/s/– |
| E-04 | prereqs | capability packs | `severity: info` — reports docx (`python3` or PowerShell 5.1+), PDF QA (LibreOffice `soffice` / Word via `render-pdf-pages.ps1` on Windows), draw.io (same candidate list as the engine's `scripts/render-drawio.sh:24-25` on POSIX — `/Applications/draw.io.app/Contents/MacOS/draw.io`, `/Applications/drawio.app/Contents/MacOS/drawio`, … — and `scripts/render-diagrams.ps1` on Windows; note the real Windows file is `render-diagrams.ps1`, not the `render-drawio.ps1` that `01` §13 names), Mermaid (`@mermaid-js/mermaid-cli` resolvable or `mmdc` on PATH) as `yes (<how>)`/`no` per OS; never WARN/FAIL | `brew install --cask drawio libreoffice` / `winget …` lines as hints only | –/s/– |
| E-05 | repo | repository root | cwd is the root (`engine.config.json`, `CLAUDE.md`, `.mcp.json`, `packages/snowarch/package.json` present) and `git rev-parse --show-toplevel` equals it; else exit 3 via the runner | `cd <root>` | q/–/– |
| E-06 | repo | engine.config.json | parses and passes the same structural checks as `tests/engine-config.test.mjs` (keys present, patterns); `mcp.package == "@farstic/snowarch"`, `mcp.packageDir` exists; else FAIL | "restore with `git checkout -- engine.config.json`" | q/–/– |
| E-07 | repo | `.mcp.json` committed and secret-free | `git diff --quiet HEAD -- .mcp.json` — always, on every platform (the S-03 fallback in ARC-06-S12/S05 never edits `.mcp.json`: it adds a *local-scope* `servicenow` entry via `claude mcp add-json … -s local` plus `env.SNOWARCH_ROOT` in `settings.local.json`, which E-23/E-27 report as `registration: local (S-03 fallback)`); exactly one server key equal to `config.mcp.serverKey`; `command == "node"`; every `${…}` placeholder contains `:-`; else FAIL. Never fixable | `git checkout -- .mcp.json` (printed verbatim; S06 refuses to run it) | q/–/– |
| E-08 | repo | `.claude/settings.json` committed | `git diff --quiet HEAD -- .claude/settings.json`; `env.MCP_TIMEOUT` present; SessionStart hook present in exec form (`command: "node"`, first arg ends with `tools/snowarch/hooks/session-start.mjs`, `timeout` ≤ 10) and the script exists on disk; else FAIL | `git checkout -- .claude/settings.json` (never fixable) | q/–/– |
| E-09 | repo | no credential-shaped keys | none of `.mcp.json`, `.claude/settings.json`, `.claude/settings.local.json` has a key (at any depth) matching `/PASSWORD|SECRET|TOKEN|_KEY$/i`, and no tracked file matches a credential-shaped literal (`git grep -lE '(PASSWORD|SECRET|TOKEN)\s*[:=]\s*"[^"$]{6,}'` — file:line only, never the line); else FAIL | "remove the key; credentials live only in `.local/instances.json` (`./snowarch instance set-credentials <label>`)" | q/–/– |
| E-10 | repo | settings.local toggles match the recorded mode | reads `.local/bootstrap-state.json.mode` and `.claude/settings.local.json`: design-only ⇒ `disabledMcpjsonServers` contains the key and `enabledMcpjsonServers` does not; live ⇒ the reverse; both or neither ⇒ FAIL; `disableAllHooks: true` while Node ≥ floor is present and `bootstrap-state.hooksDisabledByBootstrap === true` ⇒ WARN "hooks were disabled when Node was absent; Node is present now" (fixable: remove the key); `disableAllHooks` set by the user (flag absent in state) ⇒ info only. `hooksDisabledByBootstrap` is a state-schema-v1 key **this story requires of ARC-06-S03/S05** (the S-05 branch-A writer sets it; ARC-06's state schema does not yet name it) — until it exists every `disableAllHooks` is treated as user-set (info) | fixable → S06 toggle rewrite; text: `./snowarch mode design` / `./snowarch mode live` | q/–/f |
| E-11 | repo | `.local/` state | `.local/` exists, mode 0700 on POSIX (Windows: `skip`-style ok with detail "file modes: ACL-inherited"), `bootstrap-state.json` parses and its `schema` is current, `logs/` writable; missing state ⇒ FAIL "not bootstrapped" | `./bootstrap.sh` (`bootstrap.cmd`) / `chmod 700 .local` (fixable) | q/–/f |
| E-12 | docs | docs corpus present | `docsStatus().present && mode !== 'skip'`; else FAIL with the ARC-03-S11 text: `E-12 docs corpus: FAIL — corpus absent (docs mode "skip"); grounding and citations are unverified — run ./snowarch docs sync` (never WARN/SKIP) | fixable → B02 | q/–/f |
| E-13 | docs | docs pin | `pinMatchesGitlink && headMatchesPin`; HEAD ≠ pin ⇒ FAIL (fixable: `./snowarch docs sync` — the ARC-03-S05 local reconcile, which runs `git submodule update --checkout vendor/ServiceNowDocs`); pin ≠ gitlink ⇒ FAIL, not fixable: `maintainer: node scripts/docs-bump.mjs --to <gitlink>` (same text as ARC-03-S01's lint) | as stated | q/–/f |
| E-14 | docs | docs family | `familyMatches` (branch == `config.docs.family`); else FAIL | `./snowarch docs sync` | q/–/– |
| E-15 | docs | sparse set | `sparse ∈ {cone, full}` and `areasMissing.length == 0`; `pattern`/missing areas ⇒ FAIL listing the areas (fixable → B02 / `docs sync`) | `./snowarch docs sync` | q/–/f |
| E-16 | docs | citations | `docsStatus({verify:true}).citations.dead.length == 0` ⇒ ok with `checked: n \| dead: 0`; dead ⇒ FAIL listing up to 10 `file:line → path` entries; corpus absent ⇒ FAIL "citations unverifiable — corpus absent (see E-12)" (never SKIP) | "maintainer: fix the citation; users: `./snowarch docs sync`" | –/–/– (excluded from `--quick`: ~0.5–1 s walk) |
| E-17 | roster | roster from directory listing | via ARC-02-S07's `scripts/gen-roster.mjs --json` (the one directory-listing implementation — never re-implemented here, as ARC-02-S07 asks): count of `.claude/skills/*/SKILL.md` == `config.roster.skills` (28) and `.claude/agents/*.md` == `config.roster.agents` (9), every skill directory has a `SKILL.md`, utility skills (`config.roster.utility`, e.g. `snowarch`) present; no prose parsing; else FAIL naming the extra/missing entries | "restore with `git checkout -- .claude/` or update `engine.config.json.roster` if the change is intended" | q/–/– |
| E-18 | roster | skill descriptions | via the ARC-05-S04 lint function (which wraps ARC-02-S02's skills/agents lint): every `SKILL.md` frontmatter parses, `description` ≤ 500 chars, `metadata.version` present (not top-level `version:`), no `": "` hazard in agent descriptions; else FAIL per file, quoting the lint's rule id (`SK-01…SK-10`, `AG-01…AG-06`) and message verbatim | "run `npm run lint:skills` for the full report" | q/–/– |
| E-19 | contract | no retired tool names | ARC-05-S03 lint function `L03` over `CLAUDE.md`, `.claude/`, `governance/`, `docs/`, `tools/`: no key of `retired-names.json` as a bare word; else FAIL with file:line and the replacement | "replace with the `snow_*` name shown" | q/–/– |
| E-20 | contract | prefix consistency | `prefix(config)` (`mcp__servicenow__`) equals the only `mcp__…__` prefix used in `.claude/rules/00-mode-and-mcp-gate.md`, `governance/mcp-protocols.md`, `.claude/settings.json` permissions, and `.mcp.json`'s key; else FAIL naming each divergent file (closes P-05) | "maintainer: `npm run gen:governance`" | q/–/– |
| E-21 | contract | generated files fresh | ARC-05-S04's byte-identical check for `.claude/rules/00-mode-and-mcp-gate.md`, `governance/mcp-protocols.md`, `docs/TROUBLESHOOTING.md`, the permission blocks, `vendor/docs-areas.txt`; else FAIL listing files | "maintainer: `npm run gen:governance && node scripts/gen-docs-areas.mjs`" | –/–/– (runs the generators; excluded from `--quick`) |
| E-22 | contract | contract pin | sha256(`packages/snowarch/dist/contract.json`) == `packages/contract/required-tools.json.contractSha256`, every `required-tools.json` name exists in the contract; else FAIL (this is B05's check re-run) | "maintainer: `node packages/contract/lint/pin.mjs --update` after reviewing the diff; users: `./snowarch upgrade`" | q/–/– |

  Each check's `data` carries the raw facts (versions, counts, lists) so S09 can render them without re-deriving. Checks that wrap another module's function (E-12…E-16 → `docsStatus`, E-18…E-21 → lint library) must not re-implement its logic — the test asserts the call.
**Acceptance criteria.**
1. On the reference machine after ARC-06/ARC-07 (`./bootstrap.sh` live path completed), `./snowarch doctor --section prereqs,repo,docs,roster,contract` prints `0 fail` and exits 0 (README criterion 1, engine half).
2. Given the three conditions that failed the old doctor: (a) a skill citing a path absent from the corpus → E-16 FAIL listing it; (b) a `.local/instances.json` entry with four flags → not an engine concern (SV-03, S04) — E-checks stay green; (c) `cmdb_health_dashboard` inserted into a skill body → E-19 FAIL with `file:line` and `snow_core_health_dashboard_read` as the replacement. Removing each condition returns the check to ok without any cache.
3. With `.mcp.json` edited to change the server key to `servicenow-mcp`, E-07 FAILs, prints `git checkout -- .mcp.json`, and E-20 FAILs naming `.mcp.json`; with a placeholder edited to `${SNOW_STORE}` (no `:-`), E-07 FAILs naming the placeholder.
4. With `.claude/settings.local.json` containing both `enabledMcpjsonServers: ["servicenow"]` and `disabledMcpjsonServers: ["servicenow"]`, E-10 FAILs and reports `fixable: true`.
5. With `vendor/ServiceNowDocs` absent, E-12 is `fail` (never `skip`) with the ARC-03-S11 text, and E-16 is `fail` with "citations unverifiable — corpus absent"; with `bootstrap-state.docs.mode == "skip"` and the corpus absent the same two results appear.
6. With `HEAD` of the submodule moved one commit off the pin, E-13 FAILs with `fixable: true` and the `./snowarch docs sync` command; with `engine.config.json.docs.pin` changed to another SHA, E-13 FAILs with `fixable: false` and the `docs-bump.mjs --to` text.
7. Renaming one skill directory so that 27 remain makes E-17 FAIL naming the missing skill; adding a `version:` top-level key to a skill's frontmatter makes E-18 FAIL naming the file and `metadata.version`.
8. `--quick` runs E-01, E-02, E-05…E-15, E-17…E-20, E-22 only (asserted by the test from the registry flags), and the whole engine subset completes in ≤ 1.5 s on the reference machine and ≤ 3 s on CI runners.
9. On Windows, E-11 reports `ok` with detail `file modes: ACL-inherited` and never runs `chmod`.
**Tasks.**
1. Implement `engine-prereqs.mjs` (E-00…E-04) with a `which`-style resolver and the capability-pack candidate lists ported from the engine's `scripts/render-drawio.sh`, `scripts/render-diagrams.ps1`, `scripts/render-pdf.sh` and `scripts/render-pdf-pages.ps1`.
2. Implement `engine-repo.mjs` (E-05…E-11) with the JSON key walker and the toggle-consistency matrix.
3. Implement `engine-docs.mjs` (E-12…E-16) over `docsStatus()`.
4. Implement `engine-roster.mjs` (E-17, E-18) and `engine-contract.mjs` (E-19…E-22) over the lint library and the loader.
5. Fixture checkouts under `tests/fixtures/doctor/` (green tree; each negative case as a mutation applied in a temp copy).
6. Tests per check; the `--quick` membership test; timing test.
**Test strategy.** Unit per check on temp-dir fixtures (nine CI cells). Integration: the green fixture must yield 0 FAIL on each OS. Manual: reference-machine run pasted into the PR.
**Dependencies.** S01. ARC-01-S04, ARC-03-S06/S11, ARC-05-S03/S04/S10, ARC-06-S01/S04/S05 (B00's `claude` login probe is reused by E-00 — one implementation).
**Size.** L — 23 checks, each with fixtures and negatives; ~4–5 days.
**Risks / open points.** E-00's "logged in" probe depends on what `claude` exposes non-interactively (ARC-06-S04 owns that finding; if nothing reliable exists, E-00 reports the version only and says "login not verifiable — run `claude` once"). E-21 runs the generators, which import the contract; on a design-only checkout before `npm ci` this is still fine because the generators are stdlib (ARC-05-S05). Two state-file keys are requirements this story places on ARC-06-S03's state schema v1: `hooksDisabledByBootstrap` (set by the S-05 branch-A writer in ARC-06-S05, read by E-10) and `registration` (`"project"` | `"local (S-03 fallback)"`, set by ARC-06-S12's `--register local` / the S-03 fallback, read by E-23/E-27) — both must land before this story's E-10/E-07 negatives are enabled in CI; until then the checks degrade to info as stated in the rows.
**Definition of done.** Merged; tests green on nine cells; reference-machine output attached; `docs/ARCHITECTURE.md` "Doctor" section lists E-00…E-22 with one line each.

---

### ARC-08-S03 — Stale-registration, legacy-store, cloud-sync, proxy/CA and registration-status detectors (E-23…E-27) with exact commands

> **Amendment 2026-09-10 (from the delivery).** Five departures, each because the tree said
> otherwise. (1) The stale NAMES live in `tools/snowarch/lib/doctor/checks/stale-registrations.json`
> rather than in `retired-names.json`: only one of the two is retired there, and the other is a
> public repository identifier the provenance record names on purpose. That one path is listed in
> the lint's `POLICY_FILES` and in `tests/no-legacy-names.test.mjs`, on the existing "being the list
> is what the file is for" ground. (2) E-24's command is a literal in the check with a test
> asserting it appears verbatim in `docs/snippets/import-from-legacy.md` — the L07 idiom of several
> declarations that must agree — rather than a runtime read of a document that may not sit beside
> the code. (3) ARC-06-S12's rule "nothing under `lib/` opens `~/.claude.json`" gains its one argued
> exception: E-23 is a detector, and a detector that may not read what it detects cannot exist. The
> ownership half of that rule is asserted MORE strictly for it — no write verb anywhere in the file.
> (4) E-27 treats `⏸ Pending approval` in design-only as a WARN, not only `not rejected`: the S-01
> record found `enabledMcpjsonServers` is not honoured before trust, so pending in design-only means
> the disable toggle is not in force. (5) The recorded mode is `design`/`live` (`state.mjs`), not the
> `design-only` this story's text quotes; anything that is not `live` is read as design-only.
>
> **Amendment 2026-09-10 (b), from the review.** Acceptance criterion 2 — "`sha256sum` of the
> fixture `.claude.json` is identical before and after the run" — is a promise about THIS product,
> and it holds for `--section legacy` and for `--quick` (which excludes E-27). It does not hold for
> a full run against an INSTALLED Claude Code: `claude mcp get` makes Claude Code itself maintain
> `~/.claude.json` while answering, measured on a redirected HOME. E-27's detail says so, and the
> owner-sitting commands bracket `--section legacy`.

**As** an individual practitioner migrating from the old install **I want** the doctor to find every leftover of the previous setup — stale `~/.claude.json` registrations that still hold plaintext secrets, the legacy wizard store, a checkout under a cloud-sync folder, proxy/CA variables that are set wrongly, and a Claude Code registration status that contradicts the recorded mode — and to print the exact command for each **so that** nothing with a credential in it is forgotten and the doctor never edits a file it does not own.
**Context.** README deliverables "stale `~/.claude.json` entries for this folder … → prints `claude mcp remove <name> -s local` and the `.bak-*` reminder; legacy `~/.config/servicenow-mcp/` present → prints `./snowarch instance import --from-legacy`" and acceptance criterion 6 (a copied `~/.claude.json` fixture with stale `servicenow-mcp` and `nowaikit` entries produces the exact removal commands). `00` P-34 (six credential copies; `.bak-*` retain secrets), §5 (local scope keyed on the absolute path), `scripts/doctor.sh:405-466` (the read-only inspection this story ports to Node, minus the username print). `03` R-07. D-04 (WARN under OneDrive/Dropbox/iCloud/Google Drive — obligation shared by wizard and doctor). R-3 (doctor check for proxy and CA). ARC-04-S02 (`isUnderCloudSyncFolder`), ARC-04-S11 (`classifyNetworkError` codes and `NODE_EXTRA_CA_CERTS` semantics), ARC-10-S01 (`docs/MIGRATION.md` reuses these commands).
**Scope.** In: `tools/snowarch/lib/doctor/checks/legacy.mjs` (E-23, E-24), `host.mjs` (E-25, E-26, E-27), the `stale` block of the JSON, fixtures. Out: performing any removal (never; not even under `--fix`), the network probe itself (SV-04 in S04 surfaces the classifier result), `import --from-legacy` (ARC-07-S08), the toggle writer (ARC-06-S05 / F6 in S06).
**Design notes.**
- **E-23 stale `~/.claude.json` registrations** (section `legacy`, severity `warn`, quick, never fixable). Reads `~/.claude.json` read-only (`fs.readFileSync`; never `require`, never write). Outcomes: absent → ok "no `~/.claude.json` — nothing to clean"; present but unparsable → WARN "`~/.claude.json` is not valid JSON — Claude Code cannot read its own configuration" with the old D17 hint (`node -e 'JSON.parse(…)'`), never FAIL (the doctor does not own the file); parsable → inspect `projects[<this root>].mcpServers` and every other project. A server entry is *stale* when its name matches `/^(servicenow-mcp|nowaikit)$/` or its `args` contain a path ending in `server.js` under a directory named `snow-mcp`. For each stale entry under this root print exactly:
  ```
  E-23 warn  stale MCP registration "servicenow-mcp" in ~/.claude.json for this folder (holds 6 env keys, 1 credential-shaped — set (len 12))
             → claude mcp remove servicenow-mcp -s local        (run from this folder)
             → then review and delete ~/.claude.json.bak-* files — they retain the same secrets (ls -la ~/.claude.json.bak-* )
  ```
  Stale entries under *other* project paths are listed as info: `also registered under: ~/old/AI-Architect-Claude (servicenow-mcp) — run the same command from that folder`. Any entry named `servicenow` under this root (a `mode live --register local` registration or the S-03 fallback, both ARC-06-S12) is reported as info `registration: local (S-03 fallback)` / `registration: local (--register local)` per `bootstrap-state.registration`, not stale. The old `doctor.sh:405-466` helper matched `/servicenow|nowaikit|snow/i` on the entry name — that regex would flag the new `servicenow` key itself, which is why the stale predicate here is the exact-name pair plus the `snow-mcp` path segment. The `.bak-*` reminder is printed once when any `~/.claude.json.bak-*` or `.backup*` file exists (count and newest mtime; never contents). File mode of `~/.claude.json` ≠ 0600 while a stale entry exists → the same WARN carries "and it is group/world-readable — `chmod 600 ~/.claude.json`". JSON: `stale.claudeJsonEntries: [{ scope: 'this-folder'|'other', project: '~/…', name, command }]`.
- **E-24 legacy store** (section `legacy`, severity `warn`, quick, never fixable). `~/.config/servicenow-mcp/instances.json` (Windows: `%USERPROFILE%\.config\servicenow-mcp\instances.json` — the legacy store used `homedir()/.config` on every OS, `snow-mcp/src/cli/config-store.ts:97-103`; never `%APPDATA%`) present → WARN:
  ```
  E-24 warn  legacy wizard store ~/.config/servicenow-mcp/instances.json present (2 instances; never read by this product)
             → ./snowarch instance import --from-legacy      (migrates entries, then advises deleting the directory)
  ```
  Reads the file only to count entries (never prints labels' credentials; labels are safe). JSON: `stale.legacyStore: { path: '~/.config/servicenow-mcp/instances.json', instances: 2 }`.
- **E-25 cloud-sync folder** (section `host`, severity `warn`, quick). `isUnderCloudSyncFolder(root)` (same function as the server's — re-implemented in stdlib, parity-tested against `packages/snowarch/tests/fixtures/cloud-sync-paths.json`, which ARC-07-S07 created as THE list all three implementations answer to; it also returns the PROVIDER, so E-25 names it) → WARN: `checkout is under a cloud-sync folder (OneDrive) — .local/instances.json (0600) will still be synced; move the checkout outside the synced tree or keep this instance read-only`. Reported in design-only too (engagement content under `clients/` is equally affected).
- **E-26 proxy and CA environment** (section `host`, severity `warn`, quick). Inspects `HTTP_PROXY`, `HTTPS_PROXY`, `NO_PROXY`, `NODE_EXTRA_CA_CERTS` and lowercase forms in the doctor's own environment (the same environment Claude Code inherits when started from that shell — S-20 pending, see risks): each set variable is reported masked (`HTTPS_PROXY=http://***@proxy.corp:8080`); an empty-string value → WARN "set to an empty string — treated as unset by the server; unset it to silence this"; `NODE_EXTRA_CA_CERTS` pointing to a missing file or a file without a `-----BEGIN CERTIFICATE-----` block → WARN with the ARC-04-S11 README "Corporate networks" pointer; both unset → ok "no proxy configured". When a live probe (SV-04) has classified a network failure, its `code` (`DNS_FAILURE`, `TLS_CA_UNTRUSTED`, `PROXY_UNREACHABLE`, `PROXY_AUTH_REQUIRED`, `CONNECTION_REFUSED`, `NETWORK_TIMEOUT`) is echoed here with the registry remedy so the host section and the server section agree (E-26 reads SV-04's `data.networkCode` from the same run).
- **E-27 Claude Code registration status** (section `host`, severity `warn`, `spawns: true` — excluded from `--quick`; skipped when `claude` is not on PATH with detail `claude CLI not found (see E-00)`). Runs `claude mcp get <config.mcp.serverKey>` (`execFileSync`, no shell, 10 s timeout, `cwd: root`) and records its status text verbatim in `data.statusLine`. This is the `03` R-13 mitigation ("the doctor checks `claude mcp get servicenow` status text") that ARC-06-S01/S05 hand to this ARC; the expected strings come from the S-01 spike (ARC-00-S04) and ARC-06-S05 criterion 6: `✘ Rejected (see disabledMcpjsonServers in settings)` after a design-only bootstrap, an approved project-scope entry after a live one. Rules: recorded mode `design-only` and status *not* rejected/disabled → WARN `server is not disabled in Claude Code although the recorded mode is design-only — run ./snowarch mode design`; recorded mode `live` and status rejected or "needs approval" → WARN `server is rejected/unapproved in Claude Code although the recorded mode is live — run ./snowarch mode live, then answer Yes once in claude (S-01)`; scope reported as `local` → info with the `bootstrap-state.registration` value; command exits non-zero or output unrecognised → WARN `could not read registration status: <first line>` (never FAIL — the status format is Claude Code's, not ours; `R-13` says a format change is handled by a floor bump). Never fixable (the toggle is F6's job via E-10; the approval click is the user's). JSON: `data: { statusLine, scope, approved: true|false|null }`.
**Acceptance criteria.**
1. Given `HOME` (Windows: `USERPROFILE`) pointed at a fixture directory containing `.claude.json` with `projects["<root>"].mcpServers` = `{ "servicenow-mcp": {…env with SERVICENOW_PASSWORD…}, "nowaikit": {…} }` and `projects["/old/path"].mcpServers["servicenow-mcp"]`, plus `.claude.json.bak-20260601`, when `./snowarch doctor --section legacy --json` runs, then `stale.claudeJsonEntries` has three entries, the text output contains exactly the lines `claude mcp remove servicenow-mcp -s local` and `claude mcp remove nowaikit -s local` for this folder, the `also registered under` info line, and the `.bak-*` reminder once; the output contains neither the fixture password nor the fixture username (README criterion 6 and 3).
2. `sha256sum` of the fixture `.claude.json` is identical before and after the run, including under `--fix`.
3. Given an unparsable `.claude.json`, E-23 is `warn` (exit code 0 when nothing else fails) with the parse hint.
4. Given `~/.config/servicenow-mcp/instances.json` with two entries, E-24 prints `./snowarch instance import --from-legacy` and `stale.legacyStore.instances == 2`; on Windows the `%USERPROFILE%\.config\servicenow-mcp` path is used.
5. Given a checkout at `<tmp>/OneDrive/repo`, E-25 WARNs naming `OneDrive`; at `<tmp>/work/repo` it is ok.
6. Given `HTTPS_PROXY=http://user:pw@proxy.corp:8080` and `NODE_EXTRA_CA_CERTS=/nonexistent.pem`, E-26 prints `HTTPS_PROXY=http://***@proxy.corp:8080` and WARNs about the missing PEM; the output contains neither `user` nor `pw`. Given `HTTPS_PROXY=""`, E-26 WARNs "empty string".
7. `grep -rn "writeFile\|unlink\|rename" tools/snowarch/lib/doctor/checks/legacy.mjs tools/snowarch/lib/doctor/checks/host.mjs` returns nothing.
8. Given a fake `claude` executable on PATH (test fixture script) that prints `✘ Rejected (see disabledMcpjsonServers in settings)` and `bootstrap-state.mode == "design-only"`, E-27 is `ok` with `data.approved == false`; with `bootstrap-state.mode == "live"` and the same output, E-27 WARNs with the `run ./snowarch mode live` remedy; with the fake printing an approved project-scope entry and mode `design-only`, E-27 WARNs with `run ./snowarch mode design`; with `claude` absent from PATH, E-27 is `skip` with `claude CLI not found (see E-00)`; `./snowarch doctor --quick --json` never lists E-27. On the real reference machine after `./bootstrap.sh --mode design`, E-27 reports `ok` and `data.statusLine` contains `Rejected` (manual, pasted into the PR; S11 repeats it in CI where `claude` is installable).
**Tasks.**
1. Port the `~/.claude.json` inspection to `legacy.mjs` (read-only; stale predicate; command builder; `.bak-*` scan).
2. Implement E-24 with the POSIX/Windows path pair.
3. Implement E-25 with the parity fixture; E-26 with masking and the PEM sanity check.
4. Implement E-27 with the fake-`claude` fixture (POSIX shell script and `.cmd` twin) and the status-string table from ARC-00-S04's S-01 record.
5. Fixtures and tests (temp `HOME`/`USERPROFILE`/`APPDATA`); the "file unchanged" sha test.
**Test strategy.** Unit on fixtures, nine cells. Manual: the author's machine before ARC-10 cutover (real stale entries) — output pasted into ARC-10-S01's migration draft; E-27 against a real `claude` on macOS and Windows.
**Dependencies.** S01. ARC-04-S02 (fixture list for cloud-sync parity), ARC-04-S11 (codes registered in the contract for E-26's echo), ARC-00-S04 (S-01 record: exact `claude mcp get` status strings), ARC-06-S05 (design/live toggle semantics; `bootstrap-state.registration` key — see S02 risks), ARC-06-S12 (`--register local` and the S-03 fallback).
**Size.** M — five detectors with fixtures; ~2.5 days.
**Risks / open points.** Whether the environment the doctor sees equals the environment Claude Code's spawned server sees is spike S-20 — defined and run in ARC-00-S06 (raised by ARC-04-S11's risk note; `03` §A carries the S-20 row since the integration pass of 2026-09-04); until it is answered E-26 says "as seen by this shell". E-27 depends on the wording of `claude mcp get` output, which is Claude Code's (`03` R-13): the parser recognises the S-01-recorded strings and reports "could not read registration status" for anything else, so a wording change degrades to a WARN, never a false FAIL. Detecting stale entries by the `snow-mcp` path segment may miss a renamed checkout — the name match covers the two names the old scripts ever wrote (`setup.sh:91`, committed `CLAUDE.md`), which is the ARC-10 scenario.
**Definition of done.** Merged; fixtures green on nine cells; `docs/MIGRATION.md` (ARC-10) can quote the command strings by id; R-07 row in `03` references E-23 and R-13 references E-27.

---

### ARC-08-S04 — Server checks SV-00…SV-07 integrated: module import, probe wiring (basic + ROPC), FLUENT SDK, capabilities equality, section `server`

> **Amendment 2026-09-10 (from the delivery).** Six departures. (1) **ARC-07-S03 landed first**, so
> the stub is gone for the configured case and the risk note ("the stub remains until then") is
> moot: `src/doctor/probes-binding.ts` adapts `runAll(label)` to `probeAll(client, options)`, and
> `stubProbes` stays as the answer to "no instance configured", which is a state rather than an
> absence. (2) The engine registers **SV-00…SV-08**, not SV-00…SV-07: the server module has grown
> SV-08 (ancestor skill directories), and dropping a check the server produces would be a silent
> loss. (3) **SV-05/SV-06 are adopted, not re-run.** The story asks the engine to spawn the server
> through `lib/mcp-handshake.mjs`; the server module already spawns it for those two checks, and it
> cannot import engine code because it ships to npm on its own. Two handshake implementations exist
> by packaging necessity — a third, in `server.mjs`, would be the one that drifts, and it would
> cost a second cold start per run. (4) **FLAGS_INCOMPLETE is judged against the FILE**, through
> `src/doctor/store-entry.ts`: `completeFlags` fills every absent flag from the preset, so the
> loaded runtime always has six and "which did the user state?" has no answer there. (5) Two codes
> were **added to the registry** (`FLAGS_INCOMPLETE`, `FLAG_DEPENDENCY_VIOLATION`, both
> `showInRule: false`), which moved the contract sha — the pin was bumped deliberately with the
> outputs quoted in the PR. (6) The probe client and `probeOptionsFor` moved from `cli/instance.ts`
> to `servicenow/probe-client.ts`: the doctor needs both and must not import a CLI to ask a question
> about credentials. `cli/instance.ts` re-exports `probeOptionsFor` for its existing callers.

**As** the doctor **I want** to import the server package's doctor module and run its checks inside the merged report, with the live probes coming from the wizard's probe functions **so that** flag semantics, store rules and probes are implemented once in the server (never re-derived in engine code — `00` P-16, D25–D27) and a design-only checkout without server dependencies still gets a truthful report.
**Context.** README deliverable "Server checks SV-00 … (from `packages/snowarch` `doctor`): Node floor; `dist/server.js` and module resolution; store presence, schema, modes; per instance: URL shape, auth probe (basic and ROPC), per-preset probes, six flags explicit and dependency-consistent, `toolPackage == full`, `@servicenow/sdk` when FLUENT; MCP stdio handshake …; `snow_core_capabilities_read` == store; audit log present and writable". ARC-04-S12 implements SV-00…SV-07 with a probe *stub*; ARC-07-S03 implements the probes (`sys_user` auth probe with 401/403 mapping, ROPC variant, per-preset probes on `sys_update_set`, `sys_script_include`, `cmdb_ci`, `sys_atf_test`, `sys_properties` `sn_generative_ai*`); this story replaces the stub, adds what ARC-04-S12 left out, and defines the engine-side import.
**Scope.** In: `tools/snowarch/lib/doctor/checks/server.mjs` (import, availability handling, result adoption), the probe wiring in `packages/snowarch/src/doctor/` (`Probes` interface bound to ARC-07's implementation), SV-03's `@servicenow/sdk` sub-check and ROPC handling in SV-04, SV-06 equality semantics, the `server` block of the JSON. Out: the probes themselves (ARC-07), the handshake implementation (ARC-04-S12/ARC-06-S08 `lib/mcp-handshake.mjs` — SV-05 calls it), fixers (S06).
**Design notes.**
- **Import.** `server.mjs` does `await import(pathToFileURL(join(root, config.mcp.packageDir, 'dist/doctor/index.js')))` inside try/catch — the file path, not the bare specifier `@farstic/snowarch/doctor` that ARC-04-S12 criterion 7 exposes through the package `exports` map, because `tools/snowarch` has no `node_modules` of its own and the workspace symlink in the root `node_modules` exists only after `npm ci` (design-only checkouts never run it); the `exports` entry stays the public API for other consumers and a test asserts both resolve to the same module when `node_modules` is present. The imported module's `runServerDoctor` is called with the same `Probes` binding S04 wires. On `ERR_MODULE_NOT_FOUND` for a dependency (e.g. `undici`, `@modelcontextprotocol/sdk`) → every SV check is `skip` with detail `server dependencies not installed` and, in live mode, SV-01 is additionally `fail` with `fixable: true` (fix = B04); in design-only mode the skips are expected and the section header reads `server (skipped — design-only)`. On `dist/doctor/index.js` missing entirely → SV-01 `fail`: "prebuilt server missing — `git checkout -- packages/snowarch/dist` or `./snowarch upgrade`". The engine passes `{ root, storePath: resolved by the server module itself, noNetwork, quick, contract }` and receives `CheckResult[]` already in the shared shape; the engine runner applies its redaction pass on top (double masking is idempotent by construction — tested).
- **Ids.** `SV-00` Node floor · `SV-01` dist + deps + `contract.json` (sha printed) · `SV-02` store resolution/schema/modes/cloud-sync (the server's own `isUnderCloudSyncFolder` — E-25 and SV-02 both fire; S05 de-duplicates the WARN text in the summary) · `SV-03` per instance static: URL shape, six flags explicit (`FLAGS_INCOMPLETE`, fixable), dependency rule (`FLAG_DEPENDENCY_VIOLATION`), `toolPackage == "full"`, `maxRecords` numeric, prod posture (`PROD_WRITE_NOT_ACKNOWLEDGED` → FAIL with `./snowarch instance set-preset <label> <preset> --ack-prod`), **`@servicenow/sdk` resolvable (`npx --no-install @servicenow/sdk --version` or global bin) when `FLUENT_ENABLED == "true"`** → else WARN with `FLUENT_NOT_INSTALLED` remedy (`npm i -g @servicenow/sdk`) · `SV-04` (network) per instance: reachability + auth probe (basic → `GET /api/now/table/sys_user?sysparm_limit=1`; `oauth_ropc` → token request then the same GET; `OAUTH_ROPC_DISABLED` detected per ARC-07 risk note) and per-preset probes for every flag that is `"true"`; each probe result `ok` / `role missing (<role>)` / `<network code>`; a 401 is **one** attempt, never retried (lockout risk — ARC-07 rationale); the result is written into the store's `lastProbe` **only** by the wizard, never by the doctor (read-only) · `SV-05` stdio handshake against `dist/server.js` (`initialize` + `tools/list`), tool names == `contract.tools[].name` (unconfigured: the five core tools), duration recorded (feeds S-06 evidence: WARN when > 60 % of `MCP_TIMEOUT`) · `SV-06` `snow_core_capabilities_read` over that session equals the store entry for the default instance (`environment`, `preset`, six `flags`, `effectiveFlags`, `toolPackage`, `maxRecords`, `prodWriteAck`); any difference → FAIL listing the field · `SV-07` audit log: `<store dir>/audit.jsonl` writable (create-then-truncate a temp file in the directory; never write to the log itself); last line parses; WARN if not writable.
- **Quick flags.** SV-00, SV-02, SV-03, SV-07 are `quick`; SV-01 spawns nothing but reads `dist/` (quick); SV-04 `network`; SV-05/SV-06 `spawns` (cold start ~1–2 s per S-06 measurement).
- **Design-only semantics.** With the server disabled by `disabledMcpjsonServers` (E-10) and an empty store, SV-02 is `ok` "unconfigured — design-only" (not WARN; a passing doctor with the server disabled is a complete install — `01` principle 1); with the server *enabled* and an empty store, SV-02 is WARN with remedy `/snowarch setup-instance` (ARC-04-S12 criterion 2).
- **Windows.** SV-02 reports `file modes: ACL-inherited` and never runs `chmod` (`01` §13); SV-03's SDK probe uses `where`/`npx.cmd` resolution through `node:child_process` `execFileSync` with `shell: false`.
**Acceptance criteria.**
1. On a live checkout with a valid `pdi` store entry (`pdi-developer`), `./snowarch doctor --section server --no-network --json` returns SV-00…SV-07 with SV-04 `skip` and `summary.fail == 0`; with `RUN_LIVE_E2E=1` against a PDI, SV-04 reports `auth ok · write ok · scripting ok · cmdb ok · atf ok` and exits 0.
2. On a design-only checkout before `npm ci`, `./snowarch doctor --json` shows every SV check `skip` with `server dependencies not installed`, `summary.fail == 0`, exit 0; the text header reads `server (skipped — design-only)`.
3. On a live checkout with `node_modules` removed, SV-01 is `fail` with `fixable: true` and remedy `./snowarch doctor --fix` (runs B04) — the other SV checks `skip`.
4. Given a store entry with four flags, SV-03 is `warn` `FLAGS_INCOMPLETE` naming the two absent flags, `fixable: true`; given `SCRIPTING_ENABLED: "true"` with `WRITE_ENABLED: "false"`, SV-03 WARNs `FLAG_DEPENDENCY_VIOLATION` (not fixable — the user must choose); given `environment: prod, preset: full, prodWriteAck: false`, SV-03 FAILs with the `--ack-prod` command containing the label.
5. Given `FLUENT_ENABLED: "true"` and no `@servicenow/sdk` resolvable, SV-03 WARNs with `npm i -g @servicenow/sdk`; with the SDK present it is ok and prints its version.
6. Given `auth: oauth_ropc` and a fixture token endpoint returning the instance's "grant type disabled" error text (from ARC-07's fixture), SV-04 reports `OAUTH_ROPC_DISABLED` with the registry remedy.
7. Editing `dist/contract.json` to drop one tool makes SV-05 FAIL naming it; editing the store's `maxRecords` to 50 after the server was started (test controls the spawn) makes SV-06 FAIL naming `maxRecords`.
8. The doctor never writes `lastProbe`: `sha256 .local/instances.json` unchanged after a live run (`RUN_LIVE_E2E=1`).
9. Every SV detail line in the JSON passes the redaction grep (fixture username/password absent).
**Tasks.**
1. Bind `Probes` to ARC-07-S03's implementation (ARC-04-S12 declares `probes.runAll(instance)`; ARC-07-S03 exports `probeAll(client, ctx)` from `packages/snowarch/src/servicenow/probes.ts` — the binding adapts the two signatures in one place, `src/doctor/probes-binding.ts`, never in the checks); add the SDK sub-check and ROPC branch; add SV-05 timing and the S-06 headroom WARN.
2. Implement `server.mjs` import/availability logic and result adoption.
3. Tests: server side (vitest fixtures for SV-03/SV-04 branches), engine side (`node:test` with a dist fixture; `node_modules` present/absent).
4. Live E2E behind `RUN_LIVE_E2E=1` (reuses ARC-07-S11's harness and its lockout check).
**Test strategy.** Unit on both sides; integration for SV-05/SV-06 (real spawn); live E2E manual/opt-in; nine cells for the availability matrix.
**Dependencies.** S01. ARC-04-S12 (module and `exports`), ARC-04-S04 (`snow_core_capabilities_read`), ARC-07-S03 (probes), ARC-06-S08 (`lib/mcp-handshake.mjs` shared with B08).
**Size.** M — 2 days plus the live run.
**Risks / open points.** ARC-07-S03 may land after this story; the stub remains until then and SV-04 reports `skip: probes not available (ARC-07 pending)` — CI never depends on SV-04. Cold-start time on slow laptops (S-06) sets SV-05's timeout — read `MCP_TIMEOUT` from `.claude/settings.json` and use it, never a literal.
**Definition of done.** Merged on both sides; `docs/ARCHITECTURE.md` lists SV-00…SV-07; ARC-07-S09's `--resume` step can call `./snowarch doctor --json` and read `server.instances[]`.

---

### ARC-08-S05 — Merged report, the authoritative `Mode:` line, `--quick` / `--no-network` / `--section`, capability packs, `.local/doctor-last.json`
**As** an individual practitioner and as the engine (Claude) **I want** one command that prints one report and ends with one `Mode:` line derived from the store and the settings toggles — never from `~/.claude.json` or memory — and caches the result **so that** the banner, the `/snowarch` skill and the rule file all quote the same line.
**Context.** README goal ("one command, one merged report, one authoritative `Mode:` line"), deliverable 5 (merged report, `--section`, capability packs), the P-05/P-21 mode-detection half ("the engine no longer parses `~/.claude.json`; it asks the server"). `01` §8 (Mode line texts), §6.2 step 8 (detailed line with flags and tool count), §9 (design-only definition), `03` R-14 (stale cache misreports the mode — banner re-runs, `/snowarch status` always re-runs `--quick`). ARC-05-S05 rule file: "The authoritative mode is the `Mode:` line printed at session start … never infer mode from any other file". ARC-06-S08 writes `.local/doctor-last.json` at B08 — this story owns its content (it is the doctor JSON).
**Scope.** In: `tools/snowarch/lib/doctor/mode.mjs` (derivation), `cache.mjs` (read/write/staleness inputs), the merge of E- and SV- results into one report, section ordering and de-duplication rules, the `engine`/`server`/`mode*` blocks of the JSON, `--quick` definition, capability-pack summary line. Out: the banner process (S08), the skill rendering (S09), fixers (S06).
**Design notes.**
- **Mode derivation** (`mode.mjs`, pure function of `{ toggles, store, serverAvailable, bootstrapState }`):
  - `serverEnabled` = key not in `disabledMcpjsonServers` (settings.local.json); `storeLoaded` = SV-02/SV-03 report ≥ 1 instance with `status: 'loaded'`; `defaultInstance` from the store.
  - `live` ⇔ `serverEnabled && storeLoaded`. Otherwise `design-only` with a qualifier:
    - no store, server disabled (normal design-only): `Mode: design-only — no ServiceNow instance configured; run ./snowarch instance add or /snowarch setup-instance to add one`
    - store has instances but the server is disabled: `Mode: design-only — server disabled in .claude/settings.local.json although instance "pdi" is configured; run ./snowarch mode live`
    - server enabled, no loaded instance: `Mode: design-only — server enabled but no instance is loaded (see SV-02/SV-03); run /snowarch setup-instance`
    - no `bootstrap-state.json`: `Mode: unknown — this checkout has not been bootstrapped; run ./bootstrap.sh (Windows: bootstrap.cmd)`
  - `modeLine` (banner form): `Mode: live — instance=pdi (pdi) preset=pdi-developer — doctor 2026-09-04 41 ok` (`01` §8 wording; the trailing doctor stamp is `<date> <ok> ok` or `<date> <fail> FAIL` when any FAIL exists).
  - `modeLineDetailed` (skill form): `Mode: live — pdi (pdi) · preset pdi-developer · WRITE=on CMDB_WRITE=on SCRIPTING=on ATF=on NOW_ASSIST=off FLUENT=off · 398 tools` where labels derive from `flagNames(contract).map(n => n.replace(/_ENABLED$/, ''))` (ARC-05-S10), values from `effectiveFlags`, and the tool count from SV-05's `tools/list` length (or `contract.tools.length` with `(contract)` appended when SV-05 did not run). A second instance appends ` · +1 instance (uat)`; a `not_loaded` prod instance appends ` · prod: not loaded (PROD_WRITE_NOT_ACKNOWLEDGED)`.
- **Merged report.** Section order: prereqs, repo, docs, roster, contract, legacy, host, server. Within `server`, SV checks in id order. De-duplication: when E-25 and SV-02 both raise the cloud-sync WARN, the summary counts it once (the SV-02 detail keeps the store path, E-25 the checkout path) — implemented as a `dedupeKey` on results. The `engine` block is assembled from E-check `data` (E-00 version, E-04 capabilities, E-12…E-16 → `docs` = the `docsStatus()` object, E-17 roster, E-22 contract sha) and `./snowarch version --json` data (ARC-09-S04: `engine.tag` = its `tag.name`, e.g. `v2.0.0`, or `v2.0.0+3` when `tag.distance > 0`; until ARC-09-S04 exists, `tag: null`). The `server` block from SV results.
- **Capability packs** appear twice: E-04's line in `prereqs` and a one-line summary above the `DOCTOR:` line: `Capabilities: docx yes (python3) · PDF QA no · draw.io yes · Mermaid no` (per OS: on Windows docx via PowerShell, PDF QA via Word).
- **`--quick`.** Definition fixed here (S01 defined the flags; this story fixes the membership and the budget): E-01, E-02, E-05…E-15, E-17…E-20, E-22, E-23…E-26, SV-00…SV-03, SV-07 (E-00, E-03, E-04, E-16, E-21, E-27, SV-04…SV-06 are out: they spawn, walk the corpus or use the network). Budget: ≤ 1.5 s on the reference machine, ≤ 3 s on CI (measured by S11). `--quick` output ends with the same Mode line; `modeLineDetailed`'s tool count uses the contract fallback.
- **Cache** (`cache.mjs`): after every run that was not `--section`-filtered and not `--no-cache`, write the JSON atomically to `.local/doctor-last.json` (mode 0600 — it contains masked usernames only, but it is state) plus `.local/doctor-last.inputs.json` = `{ mcpJsonMtime, settingsMtime, settingsLocalMtime, storeMtime, engineConfigMtime, bootstrapStateMtime }` so the banner can compare without hashing. A `--section` run never overwrites the cache (partial report). A `--quick` run writes the cache with `options.quick: true` so consumers can tell.
**Acceptance criteria.**
1. Given the live reference checkout, `./snowarch doctor` prints sections in the fixed order, ends with `Mode: live — instance=pdi (pdi) preset=pdi-developer — doctor <today> <n> ok` as the last line, and `--json`'s `modeLineDetailed` matches `^Mode: live — pdi \(pdi\) · preset pdi-developer · WRITE=on CMDB_WRITE=on SCRIPTING=on ATF=on NOW_ASSIST=off FLUENT=off · \d+ tools$`.
2. Given a design-only checkout (`disabledMcpjsonServers` set, empty store), the last line is exactly `Mode: design-only — no ServiceNow instance configured; run ./snowarch instance add or /snowarch setup-instance to add one` and `summary.fail == 0` (README criterion 1, design half; `01` principle 1).
3. Given a store with one instance and `disabledMcpjsonServers: ["servicenow"]`, the Mode line is the "server disabled … run ./snowarch mode live" variant; given `enabledMcpjsonServers` and an empty store, the "server enabled but no instance is loaded" variant; with no `bootstrap-state.json`, the `Mode: unknown` variant.
4. The Mode line is computed without reading `~/.claude.json` (test: `HOME` pointed at an empty directory yields the same line as with the stale fixture from S03).
5. `./snowarch doctor --quick` completes within the budget on CI (S11 measures) and runs exactly the listed subset (asserted from the JSON `checks[].id`).
6. After a full run, `.local/doctor-last.json` validates against schema v1 and `.local/doctor-last.inputs.json` lists the six mtimes; after `--section docs`, neither file's mtime changes; after `--no-cache`, neither exists on a fresh checkout.
7. The cloud-sync WARN raised by both E-25 and SV-02 is counted once in `summary.warn`.
8. `Capabilities:` summary line appears on all three OSes with the OS-appropriate provider names: on the ubuntu/macOS CI runners it matches `^Capabilities: docx (yes \(python3\)|no) · PDF QA (yes \(soffice\)|no) · draw\.io (yes \([^)]+\)|no) · Mermaid (yes \([^)]+\)|no)$`; on `windows-latest` the docx provider is `powershell` and the PDF QA provider is `word` (or `no`).
**Tasks.**
1. Implement `mode.mjs` with the variant table and its unit tests (pure function).
2. Implement the merge, ordering, de-duplication and the `engine`/`server` blocks.
3. Implement `cache.mjs` (atomic write via temp + rename; 0600 on POSIX).
4. Fix the `--quick` membership in the registry and add the membership test.
5. Update the human renderer footer (capabilities line, Mode line last).
**Test strategy.** Unit (mode variants, cache), integration on the fixture checkouts (nine cells), manual on the reference machine in both modes.
**Dependencies.** S01, S02, S04. ARC-06-S05 (toggle file semantics), ARC-06-S08 (B08 calls `runDoctor({ quick:false })` and relies on the cache being written — coordinate the function signature), ARC-09-S04 (`tag` field; optional).
**Size.** M — 2 days.
**Risks / open points.** ARC-06's B09 summary line `DOCTOR: 41 ok, 0 warn, 0 fail` and this story's footer must be one renderer (export `renderSummaryLine`). The tool count in `modeLineDetailed` depends on SV-05 having run; the `(contract)` suffix makes the difference visible instead of guessing.
**Definition of done.** Merged; tests green; `01` §8 wording matches the implementation (deviations recorded in `docs/ARCHITECTURE.md`); ARC-02-S11's stub replaced by the real command in `tests/VALIDATION-TESTS.md` T-07 instructions.

---

### ARC-08-S06 — `--fix` whitelist with per-fix reporting and refusal rules
**As** an individual practitioner **I want** `./snowarch doctor --fix` to repair the seven classes of drift that are safe to repair, report each repair, and print the exact command for everything it refuses to touch **so that** an install that drifted after an upgrade, a moved checkout or a hand edit returns to 0 FAIL in one run without ever risking credentials or committed files.
**Context.** README deliverable "`--fix` whitelist (idempotent, reported): deps → B04; docs missing/unsparse → B02; pin drift → `git submodule update --checkout`; flags < 6 → explicit `"false"`; store modes → chmod; toggles → rewrite for recorded mode; stale `doctor-last.json` → re-run. Never: credentials, `.mcp.json`, `~/.claude*`" and acceptance criterion 4 (repairs a four-flag store entry, a wrong sparse set and a missing settings.local toggle in one run; refuses `.mcp.json` and prints `git checkout -- .mcp.json`). `01` §8. Principle 10 applies in spirit: `--fix` shows its plan before applying unless `--yes`.
**Scope.** In: `tools/snowarch/lib/doctor/fix.mjs` (whitelist registry, plan, apply, report), the `fixes[]` JSON block, `--fix [--yes]`, re-run after fixing. Out: any fixer not in the whitelist (adding one is a deliberate change to this file and its tests), edits to credentials, `.mcp.json`, `.claude/settings.json`, anything under `~/.claude*`, `engine.config.json`, the docs pin in `engine.config.json`.
**Design notes.**
- **Whitelist** (`FIXERS`, keyed by the check id and `data.fix.kind` the check emitted):
  | # | trigger | action | implemented by |
  |---|---|---|---|
  | F1 | SV-01 `deps-missing` (live mode only) | run step B04 (`npm ci --omit=dev --ignore-scripts` at root) | `lib/steps/B04.mjs` exported `run({root})` (ARC-06-S07) |
  | F2 | E-12 `corpus-missing`, E-15 `sparse-mismatch` | run step B02 = `docs sync` with the recorded docs mode (`sparse` unless state says `full`; `skip` is rewritten to `sparse` and reported) | `lib/steps/B02.mjs` / `lib/docs/sync.mjs` (ARC-03-S05, ARC-06-S06) |
  | F3 | E-13 `head-off-pin` (only when pin == gitlink) | `./snowarch docs sync` = `syncDocs()` from ARC-03-S05 (it runs `git submodule update --checkout vendor/ServiceNowDocs` via `execFileSync`, no shell) | this story (calls ARC-03-S05) |
  | F4 | SV-03 `flags-incomplete` | for the named instance, write each absent flag as the string `"false"` through the server store module's `updateInstance(label, { flags })` (atomic 0600 write; credentials fields untouched by construction — the API takes a flags patch only) | `packages/snowarch` store module (ARC-04-S02) via `dist/store` export |
  | F5 | SV-02 `store-mode` | `chmod 700 .local` / `chmod 600 .local/instances.json` (POSIX only; Windows: reported `noop — ACL-inherited`) | this story |
  | F6 | E-10 `toggles-mismatch` / `hooks-disabled-by-bootstrap` | rewrite `.claude/settings.local.json` for the recorded mode with the ARC-06-S05 merge writer (never overwrites user keys; removes `disableAllHooks` only when `bootstrapState.hooksDisabledByBootstrap === true` and Node ≥ floor) | `lib/steps/B07.mjs` writer |
  | F7 | stale cache — no check id: `cache.mjs` (S05) reports `cache-stale` when `.local/doctor-last.json` is older than 24 h or any recorded input mtime differs (the same rule the banner in S08 applies) | delete the cache; the post-fix re-run writes a fresh one | this story |
  Anything else marked `fixable: false` with a `command` is listed under **REFUSED** with the command. Explicit refusals (always printed when the corresponding check failed, even if the user did not expect a fix): E-07 → `git checkout -- .mcp.json`; E-08 → `git checkout -- .claude/settings.json`; E-13 pin≠gitlink → the maintainer command; E-23 → the `claude mcp remove …` commands; SV-03 `PROD_WRITE_NOT_ACKNOWLEDGED` → the `--ack-prod` command; SV-04 auth failure → `./snowarch instance set-credentials <label>`.
- **Flow.** `--fix` runs the full doctor (respecting `--no-network`), builds the plan from `fixable` results, prints it:
  ```
  FIX PLAN (3 actions)
    F4  SV-03  instance "pdi": write NOW_ASSIST_ENABLED="false", FLUENT_ENABLED="false"   (.local/instances.json)
    F2  E-15   docs sparse set: 18/19 areas → run ./snowarch docs sync (sparse)
    F6  E-10   .claude/settings.local.json: add enabledMcpjsonServers ["servicenow"] (recorded mode: live)
  REFUSED (1)
    E-07  .mcp.json differs from the committed file — never edited by --fix; run: git checkout -- .mcp.json
  Apply? [Y/n]
  ```
  Enter applies (principle 10: propose → review → apply); `--yes` skips the prompt (CI); `n` exits 0 with the plan only. Each fixer runs in the listed order (F1 before F2… so later checks see earlier repairs), is idempotent (a second run yields `noop`), and reports `applied | noop | refused | failed: <reason>`; a `failed` fixer never aborts the others. After applying, the doctor re-runs (same options) and prints the final report; the exit code is the re-run's. JSON: `fixes: [{ id: 'F4', check: 'SV-03', target: '~/…/.local/instances.json', action: '…', result: 'applied' }]`.
- **Safety rails.** `fix.mjs` imports no function that can write to `.mcp.json`, `.claude/settings.json`, `engine.config.json` or `~/…`; a test greps the module for `homedir`, `.mcp.json`, `settings.json` (without `.local`) and fails on any occurrence outside the refusal-message table. F4 calls a store API that cannot accept `password`/`clientSecret` keys (the server module rejects them in `updateInstance` — asserted by a test on the server side). Every fixer logs the file it touched to `.local/logs/doctor-fix-<ts>.log` (paths only).
**Acceptance criteria.**
1. Given a checkout with (a) a store entry holding four flags, (b) a sparse set missing one area, (c) `.claude/settings.local.json` lacking the `enabledMcpjsonServers` toggle while `bootstrap-state.mode == "live"`, and (d) `.mcp.json` edited, running `./snowarch doctor --fix --yes --no-network` applies F4, F2, F6, reports each as `applied`, lists E-07 under REFUSED with `git checkout -- .mcp.json`, and the final report shows SV-03, E-15, E-10 `ok` and E-07 `FAIL`; exit code 1 (because E-07 still fails) — README criterion 4.
2. Running the same command again yields three `noop` results and no file mtime change on the store, the corpus or `settings.local.json`.
3. `sha256` of every credential field in `.local/instances.json` (read via the store module in the test) is unchanged after F4; the file mode is 0600 after the write.
4. Without `--yes`, the plan is printed and nothing is applied until Enter; `n` leaves every file unchanged and exits 0.
5. `--fix` never touches `~/.claude.json` (sha unchanged) even when E-23 lists stale entries; the REFUSED block shows the `claude mcp remove` commands.
6. On Windows, F5 reports `noop — file modes: ACL-inherited` and F6/F4/F2 apply; the `git submodule update --checkout` command in F3 runs through `execFileSync('git', …)` with no shell.
7. Given E-13 with pin ≠ gitlink, `--fix` lists it under REFUSED with the `docs-bump.mjs --to` text and never runs `git submodule update`.
8. The safety-rail grep test passes; the server-side test proves `updateInstance` rejects a patch containing `password`.
**Tasks.**
1. Define `FIXERS` and the `data.fix` hint contract with S02/S04 (kinds listed above).
2. Implement plan rendering, the prompt, `--yes`, ordering, idempotence and the re-run.
3. Implement F3, F5, F7 here; wire F1/F2/F6 to the exported step functions; F4 to the store module.
4. Fixture matrix for criterion 1 (one composite fixture), idempotence, refusal, Windows variants.
5. `docs/TROUBLESHOOTING.md` preamble sentence "what `--fix` will and will not do" (static text in the ARC-05-S06 renderer's preamble; PR to the generator).
**Test strategy.** Integration on the composite fixture (nine cells; F1 exercised only where `npm` is present — CI has it); unit for plan/ordering/idempotence; manual on the reference machine after a deliberate drift.
**Dependencies.** S02, S03, S04, S05. ARC-06-S05/S06/S07 (steps exported as functions), ARC-03-S05 (`docs sync`), ARC-04-S02 (store `updateInstance`).
**Size.** L — seven fixers, a composite fixture, the prompt flow and the safety tests; ~3–4 days.
**Risks / open points.** Step functions from ARC-06 must be callable outside the bootstrap state machine (no implicit state writes) — record as a requirement on ARC-06-S03/S07 ("steps are pure `run(ctx)` functions; the state file is updated by the bootstrap driver, not the step"). If a step insists on updating `bootstrap-state.json`, `--fix` runs it through the same driver with `--resume`-style bookkeeping.
**Definition of done.** Merged; composite fixture green on nine cells; `docs/TROUBLESHOOTING.md` preamble regenerated; README criterion 4 checked.

---

### ARC-08-S07 — Old→new check mapping table (`D00–D37` → `E-xx` / `SV-xx` / retired) in `docs/ARCHITECTURE.md`
**As** a maintainer **I want** a table that accounts for every one of the 39 checks in the old `scripts/doctor.sh` — its new id, or the reason it is retired — **so that** no intent of the most precise existing install specification (`00` §3.9) is lost, and reviewers can audit the doctor by reading one table.
**Context.** README deliverable "`docs/ARCHITECTURE.md` appendix: mapping table old `D00–D37` → new `E-xx`/`SV-xx` (every old intent accounted for; D19/D20 path checks and D36 prefix check re-targeted; D32/D33 probes moved to the server module)" and acceptance criterion 2. Source: `scripts/doctor.sh` (1,141 lines; 39 `CHECK_ID="D…"` assignments — `D00` at line 53, `D37` at line 1100, `D17` assigned twice; D16 at line 342 has four commented sub-checks (a)–(d); D31 at line 846 has three parts: `~/.claude.json` mode, other projects with credentials, tracked-file leak scan).
**Scope.** In: the appendix table, a `tests/doctor/mapping.test.mjs` that asserts every `D00…D37` appears exactly once and every referenced new id exists in the registry, and a short "retired" rationale per retired row. Out: any check body.
**Design notes.** The table as it will be committed (columns: old id · old intent · new id(s) · note):

| Old | Intent (from `doctor.sh`) | New | Note |
|---|---|---|---|
| D00 | required host tooling missing → exit 3 | runner exit 3 (S01) | same semantics; bash aggregator retired |
| D01 | `claude` CLI present | E-00 | plus floor and login |
| D02 | node ≥ 20 | E-02 / SV-00 | floor from `engine.config.json` |
| D03 | npm | E-03 | WARN in design-only |
| D04 | git | E-01 | floor 2.25 |
| D05 | python3 | E-04 | capability "docx" |
| D06 | draw.io / LibreOffice | E-04 | capability "draw.io", "PDF QA"; Mermaid added |
| D07 | engine repo root | E-05 | exit 3 when not at root |
| D08 | roster counts (parsed from `CLAUDE.md` prose) | E-17 | expected counts from `engine.config.json.roster` |
| D09 | every skill dir has `SKILL.md` | E-17 | merged |
| D10 | `verify-structure.sh` audit | retired | structure gate deleted in ARC-02-S01; the skills/agents lint runs in CI (ARC-02-S02); E-18 keeps the description and frontmatter part |
| D11 | `core.hooksPath=.githooks` | retired | pre-commit chain deleted; CI replaces (P-37, ARC-09) |
| D12 | submodule populated | E-12 | FAIL never SKIP |
| D13 | pinned release branch | E-14 | family from `engine.config.json` |
| D14 | checkout == pinned commit | E-13 | pin == gitlink == HEAD |
| D15 | citation gate | E-16 | absent corpus is FAIL |
| D16 a–d | `settings.json` present / valid / placeholder / hook targets resolve | E-08 (+E-07 placeholders) | committed-hash comparison; context-mode hooks gone (D-03) |
| D17 | `~/.claude.json` registration for this project | retired as a positive check; E-23 | registration is the committed `.mcp.json` (E-07); `~/.claude.json` is inspected only for stale entries |
| D18 | `disabledMcpjsonServers` / trust accepted | E-10 / E-27 | toggles are ours (E-10); the status Claude Code reports for the server is read by E-27 (`claude mcp get`, S03); the trust dialog itself is not checkable (`hasTrustDialogAccepted` deliberately unused — `03` §D) |
| D19 | server entrypoint resolves | SV-01 | re-targeted to `packages/snowarch/dist/server.js` |
| D20 | server `node_modules` | SV-01 | fixable → B04 |
| D21 | `dist/` older than `src/` | retired | `dist/` committed; CI rebuild-and-diff (ARC-04-S13) |
| D22 | tools manifest readable | SV-01 / SV-05 | contract.json + handshake |
| D23 | instance URL absent | SV-02 / SV-03 | unconfigured is a supported mode |
| D24 | URL bare https origin | SV-03 | |
| D25 | flag absent | SV-03 `FLAGS_INCOMPLETE` | fixable |
| D26 | flag not a string | SV-02 `STORE_SCHEMA_INVALID` | |
| D27 | SCRIPTING without WRITE | SV-03 `FLAG_DEPENDENCY_VIOLATION` | |
| D28 | `MCP_TOOL_PACKAGE` | SV-03 `toolPackage == full` | |
| D29 | `MAX_RECORDS` unset | SV-03 `maxRecords` | default 100 pinned |
| D30 | wizard store overrides env | E-24 | the override itself removed in ARC-04-S02 |
| D31 | `~/.claude.json` mode; other projects with credentials; tracked-file leak scan | E-23 (mode, other projects) / E-09 (leak scan) | |
| D32 | live instance probes | SV-04 | server module, ARC-07 probes |
| D33 | per-preset role probes | SV-04 | |
| D34 | update-set readiness (§2.2) | SV-04 write probe | `sys_update_set` probe; capture is `snow_us_capture_target_set` (ARC-04-S07) |
| D35 | descending-sort self-test | retired | `ORDERBYDESC` fixed with a regression test (ARC-04-S09) |
| D36 | `CLAUDE.md` gates on `mcp__<key>__` | E-20 | re-targeted to the generated rule file and permission block |
| D37 | tool-name currency vs rename map | E-19 | `retired-names.json` |

New checks with no old counterpart (listed under the table): E-06, E-09 (key scan), E-11, E-15, E-18, E-21, E-22, E-25, E-26, SV-05, SV-06, SV-07 (E-10 and E-27 are mapped from D18).
**Acceptance criteria.**
1. `docs/ARCHITECTURE.md` contains the table with 38 old-id rows (D16 as one row noting a–d, D31 as one row noting its parts); `tests/doctor/mapping.test.mjs` parses it and asserts every `D00…D37` appears once and every `E-`/`SV-` id named exists in the registry (README criterion 2).
2. Every "retired" row names the ARC/story that made it unnecessary.
3. The "new checks without old counterpart" list equals the registry ids minus the mapped ones (asserted by the same test).
**Tasks.** 1. Write the table and the new-checks list. 2. Write the parser test. 3. Cross-link from the "Doctor" section (S01).
**Test strategy.** Unit (the table parser) on one cell is enough; run everywhere anyway.
**Dependencies.** S02, S03, S04 (final ids).
**Size.** S — half a day.
**Risks / open points.** None beyond id churn before S04 merges; the test catches it.
**Definition of done.** Merged; test green; README criterion 2 checked.

---

### ARC-08-S08 — `hooks/session-start.mjs` banner: cache, staleness re-run, nudges, hook timeout, S-05 handling
**As** the engine (Claude) **I want** every session to begin with one truthful `Mode:` line produced from the doctor cache — refreshed when the cache is stale or the inputs changed — plus at most three one-line nudges, within the hook budget and without ever blocking or printing a secret **so that** the rule file's "quote the banner" instruction is always satisfiable and the engine never infers its mode.
**Context.** README deliverable "`hooks/session-start.mjs` (exec form, `timeout` 10 s, < 300 ms typical): reads `.local/doctor-last.json`, re-runs the offline `--quick` subset when older than 24 h or when `.mcp.json`/store mtime changed; prints one line (`Mode: …`), plus first-run nudge, upgrade nudge, stale-registration nudge; never prints secrets; never blocks" and acceptance criterion 5 (banner within 1 s on CI; with Node absent the launcher's `disableAllHooks` fallback leaves the session clean — S-05). `01` §5 (hook entry: `matcher: "startup|resume"`, exec form `command: "node"`, `args: ["${CLAUDE_PROJECT_DIR}/tools/snowarch/hooks/session-start.mjs"]`, `timeout: 10`), §8, §13 (exec form on Windows — S-03), `03` R-14, S-05, S-14d (SessionStart `additionalContext` is the documented channel). ARC-00-S06 delivers the S-05 verdict; ARC-06-S05 implements the toggle it chose; ARC-09-S07 (`./snowarch upgrade --check`) writes the upgrade-check input `.local/upgrade-check.json` and lists this story as its dependency for the nudge line — the dependency is one-way (this hook only reads the file; absent file = no nudge).
**Scope.** In: `tools/snowarch/hooks/session-start.mjs` (stdlib only; imports `lib/doctor/cache.mjs` and, for re-runs, the doctor runner in-process), the staleness rule, the three nudges, the watchdog, output format, `tests/hook/session-start.test.mjs` with timing. Out: the hook entry in `.claude/settings.json` (ARC-06-S01 — this story only specifies what it must say), the `disableAllHooks` writer (ARC-06-S05), the fetch that decides "behind origin" (ARC-09-S07 — this hook only reads `.local/upgrade-check.json`).
**Design notes.**
- **Input/output.** The hook reads the JSON Claude Code passes on stdin (`session_id`, `cwd`, `hook_event_name`, `source`) but does not depend on it (it resolves the root from its own file location: `dirname(import.meta.url)/../..`, so `CLAUDE_PROJECT_DIR` substitution failing on some platform — S-03 — cannot break it). It prints to stdout plain text lines, which `01` §8 assumes Claude Code adds to the session context for SessionStart hooks — an assumption `01`/`03` do not back with a docs citation, so it is **unverified until task 5** (the `claude --debug` session check); the `additionalContext` JSON form (`03` S-14d is the only documented channel in the plan set) is the alternative, switchable by one constant. It always exits 0.
- **Algorithm.**
  1. Read `.local/doctor-last.json` and `.local/doctor-last.inputs.json`. If both exist and `ranAt` is < 24 h old and none of the six recorded mtimes differs from the current mtime of its file → print the cached `modeLine` (fast path; target < 300 ms including Node start-up).
  2. Else if `.local/bootstrap-state.json` exists → run the doctor in-process with `{ quick: true, noNetwork: true, writeCache: true }` under a 5 s watchdog (`AbortController` + `setTimeout`); print the fresh `modeLine`. On watchdog expiry print the cached line (if any) suffixed ` (cache stale — run ./snowarch doctor)` or, without a cache, `Mode: unknown — doctor timed out; run ./snowarch doctor`.
  3. Else (never bootstrapped) print `Mode: unknown — this checkout has not been bootstrapped; run ./bootstrap.sh (Windows: bootstrap.cmd)`.
  4. Nudges (each one line, printed only when its condition holds, in this order):
     - first-run: when the cache was created by this invocation (no prior cache) and the mode is design-only with an empty store → `No ServiceNow instance configured — /snowarch setup-instance adds one (design-only works without it).`
     - upgrade: when `.local/upgrade-check.json` (written by ARC-09-S07's `upgrade --check` / U7 step; never fetched here) says `behind: true` → `A newer release is available (v2.1.0) — run ./snowarch upgrade.`
     - stale registration: when the cached report's `stale.claudeJsonEntries` has an entry with `scope: 'this-folder'` → `Stale MCP registrations from the old setup found in ~/.claude.json — run ./snowarch doctor --section legacy for the removal commands.`
     - doctor FAIL: when `summary.fail > 0` → `Doctor: <n> FAIL — run ./snowarch doctor for remedies.`
  5. Any exception anywhere → print `Mode: unknown — session banner failed (<error class>); run ./snowarch doctor` and exit 0. Nothing is ever written to stderr, and the exit code is always 0 — so whatever Claude Code does with a hook's stderr or a non-zero exit (not cited in `01`/`03`) can never surface here.
- **Output example** (live, all nudges off): a single line `Mode: live — instance=pdi (pdi) preset=pdi-developer — doctor 2026-09-04 41 ok`.
- **Redaction.** The hook prints only `modeLine` and the fixed nudge strings; `modeLine` is produced by the redacting runner. A test greps the hook output for the fixture username/password.
- **Hook entry requirements** (asserted by E-08): exec form, `timeout: 10`, matcher `startup|resume` (not `clear`/`compact` — the cached line is re-injected by Claude Code on resume per S-14d evidence; if S-14d's finding differs for plain stdout, the matcher gains `compact`).
- **S-05 handling.** With Node absent the hook cannot run at all; the bootstrap writes `disableAllHooks: true` (or the S-05 alternative: the hook lives in `settings.local.json` only when Node is present — ARC-00-S06 verdict decides; ARC-06-S05 implements). This story's E-10 rule (S02) reports the leftover key once Node is present, and F6 (S06) removes it. `/snowarch status` (S09) covers the no-Node reporting path.
- **Windows.** `node` is the command; the script path is forward-slash; the test runs the hook under `cmd.exe` and PowerShell on `windows-latest` with Git Bash removed from PATH (ARC-00-S13 recipe).
**Acceptance criteria.**
1. With a fresh cache (< 24 h, inputs unchanged), `echo '{"hook_event_name":"SessionStart","source":"startup"}' | node tools/snowarch/hooks/session-start.mjs` prints exactly one line beginning `Mode: ` and finishes in < 300 ms on the reference machine and < 1 s on each CI OS (README criterion 5; measured by S11 with `process.hrtime` around a child spawn, 5 runs, median).
2. Touching `.mcp.json` (or the store, or `settings.local.json`) makes the next invocation re-run `--quick`, rewrite the cache and print the fresh line; the invocation finishes in < 3 s on CI.
3. With `.local/doctor-last.json` deleted and `bootstrap-state.json` present, the hook re-runs and additionally prints the first-run nudge when the store is empty; a second invocation prints no nudge.
4. With the stale-registration fixture from S03 in the cache, the third nudge is printed verbatim; with `.local/upgrade-check.json` = `{"behind":true,"latestTag":"v2.1.0"}`, the upgrade nudge is printed with `v2.1.0`; the hook performs no network call (test runs with `HTTPS_PROXY=http://127.0.0.1:1` and a spy on `https`).
5. With the doctor runner made to throw (fixture), the hook prints the `session banner failed` line and exits 0 within 1 s; with a runner made to hang, the watchdog prints the `(cache stale — run ./snowarch doctor)` variant and exits 0 within 6 s (inside the 10 s hook timeout).
6. In a real `claude` session on the live reference checkout, the first assistant turn can quote the `Mode:` line verbatim when asked "what mode are you in?" (manual; recorded in `tests/VALIDATION-TESTS.md` T-07 by S10's edit); on a design-only checkout the line is the design-only variant.
7. Node absent (S-05 snapshot): with the ARC-06-S05 fallback applied, starting `claude` shows no hook error (manual, recorded once per OS by ARC-06's CI/spike record; this story adds the check that the key is reported by E-10 once Node returns).
8. The hook's stdout never contains the fixture username or password (grep across all test invocations).
**Tasks.**
1. Implement the hook with the fast path, the in-process re-run, the watchdog and the nudges.
2. Write the timing harness and the fixture matrix (fresh cache / stale by age / stale by mtime / no cache / no state / throw / hang / nudges).
3. Windows job: run under cmd and PowerShell without Git Bash.
4. Confirm the `.claude/settings.json` hook entry text with ARC-06-S01 (matcher, timeout, args).
5. Manual: verify plain-stdout injection vs `additionalContext` in a real session (`claude --debug`); record which form is used and why.
**Test strategy.** Unit + timing on nine cells; Windows no-Git-Bash job; manual session check on macOS and Windows.
**Dependencies.** S05 (cache and mode line). ARC-06-S01 (hook entry), ARC-06-S05 (S-05 fallback), ARC-00-S06 (S-05 verdict), Consumer, not prerequisite: ARC-09-S07 writes `upgrade-check.json` to the shape fixed here (absent file = no nudge) and adopts this story's nudge wording.
**Size.** M — 2 days including the timing harness and the manual session checks.
**Risks / open points.** Node start-up alone is ~40–80 ms; the in-process re-run must not import the full doctor tree on the fast path (lazy `import()` after the cache decision). If plain stdout is not injected as context on some CLI version, switch to the `additionalContext` JSON form (one constant). Banner cost on slow disks (README risk) is bounded by the watchdog and the `--quick` membership fixed in S05.
**Definition of done.** Merged; timing test green on nine cells; manual session records for macOS and Windows attached; `docs/ARCHITECTURE.md` "Doctor" section gains a "Session banner" paragraph (fast path, staleness inputs, nudges, watchdog).

---

### ARC-08-S09 — `/snowarch status` skill body: doctor-JSON rendering and the no-Node fallback
**As** an individual practitioner **I want** `/snowarch status` (or typing `Status`) to show the Mode line, engine version, docs pin and citation state, roster, capability packs and the doctor summary — from the doctor's JSON, or from the bootstrap state when the doctor cannot run **so that** the in-session view is the same truth as the terminal's, formatted for reading.
**Context.** README deliverable "`/snowarch status` skill: runs `./snowarch doctor --quick --json` and prints Mode line, engine version, docs pin, roster, capability packs. When `node` is not on PATH (design-only install without Node) it reads `.local/bootstrap-state.json` instead and reports the mode with 'doctor unavailable until Node 20+ is installed'". R-2 (the skill is `/snowarch`, sub-command `status`). ARC-02-S11 created `.claude/skills/snowarch/SKILL.md` with the `status` branch printing `report.modeLine` plus "whatever keys exist" and named this story as the owner of the final layout; ARC-07-S09 edits the `setup-instance` branch (and owns the frontmatter's `allowed-tools` / `metadata.version` — its scope statement says the `status` section belongs to this story) — merge order ARC-07-S09 then this story; this story keeps the frontmatter and the hand-off block byte-identical. `01` §4.1 (the skill runs `./snowarch …` through Claude's Bash tool; on Windows that needs Git for Windows), `03` R-14 (`/snowarch status` always re-runs `--quick`).
**Scope.** In: the `status` branch of `.claude/skills/snowarch/SKILL.md` (rendering instructions, fallbacks, the exact output template), a fixture JSON for the manual test, the T-07 update in `tests/VALIDATION-TESTS.md`. Out: the frontmatter, the `setup-instance` and `doctor` branches (ARC-07-S09 / ARC-02-S11), any new skill file (there is exactly one), any computation in the skill (it renders; it never derives).
**Design notes.**
- **Command.** `./snowarch doctor --quick --json` (Windows Git Bash: same; if `./snowarch` is not executable: `node tools/snowarch/bin/snowarch.mjs doctor --quick --json`). Both are in `permissions.allow` (`01` §5) and in the skill's `allowed-tools`. `--quick` is mandated by R-14 (never trust the cache alone from inside a session).
- **Rendering template** (the skill instructs the model to print these lines, in this order, filling from the JSON keys named in brackets; nothing else about mode may be added):
  ```
  Mode: live — pdi (pdi) · preset pdi-developer · WRITE=on CMDB_WRITE=on SCRIPTING=on ATF=on NOW_ASSIST=off FLUENT=off · 398 tools (contract)     [modeLineDetailed]
  Engine: snowarch 2.0.0 · tag v2.0.0 · contract a1b2c3d…                                                                                   [engine.version, engine.tag, engine.contractSha (first 7)]
  Docs: vendor/ServiceNowDocs @ ba513f2 (australia) · sparse 19/19 areas · citations checked: 181 | dead: 0                                  [engine.docs.*]
  Roster: 28 skills / 9 agents                                                                                                             [engine.roster]
  Capabilities: docx yes (python3) · PDF QA no · draw.io yes · Mermaid no                                                                    [engine.capabilities]
  Instances: pdi (pdi, pdi-developer, default) · uat (test, read-only)                                                                       [server.instances[]; omitted in design-only]
  Doctor: 41 ok, 1 warn, 0 fail — quick run 2026-09-04 10:00 · full report: ./snowarch doctor                                                [summary, ranAt, options.quick]
  ```
  When `summary.fail > 0` the skill appends one line per FAIL check: `  E-16 FAIL citations: 2 dead — remedy: …` (id, title, remedy) and ends with `Run ./snowarch doctor --fix for the fixable ones (n).` when `summary.fixable > 0`. The skill never lists WARNs individually (that is `/snowarch doctor`).
- **Fallbacks** (ordered): (1) command exits 3 with "not at the repository root" → print the `cd` remedy from its output; (2) `node`/`./snowarch` not found → read `.local/bootstrap-state.json` with `cat` (allowed) and print `Mode: <mode> — from bootstrap state (<at>); doctor unavailable until Node 20+ is installed` followed by `Docs: pin <docsPin>` and `Roster: <from directory listing via the Read tool count of .claude/skills/*/SKILL.md>` (the roster is the one fact the skill may derive, and only by listing directories — `01` §3 "roster from directory listing"); (3) neither → `Mode: unknown — this checkout has not been bootstrapped; run ./bootstrap.sh (Windows: bootstrap.cmd)`; (4) JSON unparsable → `Mode: unknown — doctor output unreadable; run ./snowarch doctor in a terminal`. In no case does the skill read `~/.claude.json`, `/mcp` output or prior conversation to state the mode (rule file, ARC-05-S05).
- **Plain `Status` trigger.** `CLAUDE.md` (ARC-02-S08) routes the word to this skill; the skill body states that `Status` and `/snowarch status` are the same branch.
- **Windows without Git for Windows.** The Bash tool is unavailable, so the skill cannot run the doctor; the skill's text says: `On Windows without Git for Windows I cannot run ./snowarch from here — run snowarch.cmd doctor in PowerShell and paste the Mode line.` (`01` §4.1 caveat, recorded in `docs/PLATFORM-NOTES.md` by ARC-02-S10).
**Acceptance criteria.**
1. In a fresh session on the live reference checkout, `/snowarch status` prints the seven template lines with real values; line 1 equals `modeLineDetailed` of `./snowarch doctor --quick --json` run in a terminal within the same minute (manual; recorded in T-07).
2. Typing `Status` produces the same output as `/snowarch status`.
3. On a design-only checkout, the output has no `Instances:` line and line 1 is the design-only variant; with the fixture cache containing two FAIL checks, exactly two `FAIL` lines follow and the `--fix` sentence appears with the fixable count.
4. With `node` removed from PATH (S-05 `no-node` snapshot from ARC-00-S01) and `.local/bootstrap-state.json` = `{"mode":"design-only","docsPin":"ba513f2…","at":"…"}`, the output is `Mode: design-only — from bootstrap state (…); doctor unavailable until Node 20+ is installed`, then `Docs: pin ba513f2`, then `Roster: 28 skills / 9 agents` (README deliverable, second sentence).
5. With neither the doctor nor the state file, the `Mode: unknown — … run ./bootstrap.sh` line is printed and nothing else about mode.
6. The transcript of criteria 1–5 contains no username in clear and no secret (the JSON already masks; the skill adds nothing).
7. `node --test tests/` (skills lint) passes; the frontmatter and the `setup-instance` hand-off block are byte-identical to ARC-07-S09's version (diff in the PR restricted to the `status` section).
**Tasks.**
1. Write the `status` section with the template, key mapping and fallbacks.
2. Produce `tests/fixtures/doctor/status-live.json` and `status-design.json` (schema v1) for the manual checklist.
3. Update T-07 in `tests/VALIDATION-TESTS.md` (S10 owns the file edit; this story supplies the text).
4. Manual runs: macOS live, macOS design-only, Windows (Git Bash present), `no-node` snapshot.
**Test strategy.** Lint (CI); manual session checklist (T-07) on macOS and Windows; the no-Node case on the ARC-00 snapshot.
**Dependencies.** S05 (JSON keys), S08 (banner wording consistency). ARC-02-S11 (file), ARC-07-S09 (merge order), ARC-02-S10 (platform note).
**Size.** M — the text is short but the four fallbacks and the manual matrix take ~1.5 days.
**Risks / open points.** The model may paraphrase the Mode line; the skill instructs "print `modeLineDetailed` verbatim as the first line" and T-07 checks it character-for-character. Reading directories for the roster in the no-Node fallback relies on the `Read`/`Glob` tools being in `allowed-tools` — ARC-02-S11 lists `Read`; add `Glob` if needed (frontmatter change coordinated with ARC-07-S09's owner, who holds `allowed-tools` after ARC-02-S11 — the frontmatter is otherwise frozen).
**Definition of done.** Merged; lint green; T-07 updated; manual records attached; `docs/USER-GUIDE.md` "`/snowarch` commands" section shows the status template.

---

### ARC-08-S10 — Runtime error mapping in the generated rule file; VALIDATION-TESTS T-19 (`AUTHENTICATION_FAILED`) and T-20 (`*_NOT_ENABLED`)
**As** the engine (Claude) **I want** the always-loaded rule file to tell me, for every runtime error code the server can return, to stop and print the exact remedy — never retry, never edit flags from inside a session — and I want two behavioural tests that prove it **so that** a wrong password or a disabled flag becomes a one-line hand-off to the terminal instead of a retry loop or an improvised fix (README acceptance criterion 7; `00` P-03 at runtime).
**Context.** README deliverable 10 ("Runtime error mapping in the generated rule file; VALIDATION-TESTS addition for `AUTHENTICATION_FAILED`") and acceptance criterion 7. `01` §6.2 ("Wrong password at runtime: the server returns `AUTHENTICATION_FAILED`; the rule file tells the engine to stop (no retries) and point to `./snowarch instance set-credentials <label>`"). ARC-05-S05 renders the rule file's "Runtime errors" section from `contract.errorCodes[]` filtered to `showInRule: true`; ARC-05-S06 owns the registry and seeds `showInRule` for the six `*_NOT_ENABLED` codes, `AUTHENTICATION_FAILED`, `INSUFFICIENT_PRIVILEGES`, `NO_INSTANCE_CONFIGURED`, `PROD_WRITE_NOT_ACKNOWLEDGED`, `UNKNOWN_TOOL`, `FLUENT_NOT_INSTALLED`; ARC-04-S11 registers the network codes (`showInRule: false` by default). ARC-02-S13 moved the tests to `tests/VALIDATION-TESTS.md` (T-01…T-18) and added T-07 for Mode reporting.
**Scope.** In: the registry review (which codes carry `showInRule` — a PR against `packages/snowarch/src/utils/error-codes.ts`, the registry file ARC-05-S06 creates in the unified repo; it has no counterpart in the old `snow-mcp/src/utils/`), the per-code `ruleText` for the codes ARC-07-S10 does not own (`*_NOT_ENABLED`, `NO_INSTANCE_CONFIGURED`, `UNKNOWN_TOOL`, `FLUENT_NOT_INSTALLED`, `INSTANCE_NOT_LOADED`, the five network codes), the rule-file section's header and three behavioural sentences (stop / no retry / remedy verbatim / suggest `./snowarch doctor` after two different errors in one session), the `docs/TROUBLESHOOTING.md` cross-reference sentence, T-19 and T-20 in `tests/VALIDATION-TESTS.md`, the T-07 wording update from S09. Out: the renderer (ARC-05-S05), the registry mechanism (ARC-05-S06), the `ruleText` of `AUTHENTICATION_FAILED` / `INSUFFICIENT_PRIVILEGES` / `PROD_WRITE_NOT_ACKNOWLEDGED` and the wizard's own remedies (ARC-07-S10 owns those strings; this story consumes them verbatim and tests them).
**Design notes.**
- **Registry changes** (coordinated with ARC-05-S06's owner): set `showInRule: true` on `DNS_FAILURE`, `TLS_CA_UNTRUSTED`, `PROXY_UNREACHABLE`, `PROXY_AUTH_REQUIRED`, `NETWORK_TIMEOUT` (the engine must stop on these too, and their remedies are terminal actions); confirm `AUTHENTICATION_FAILED.command == "./snowarch instance set-credentials <label>"` and `*_NOT_ENABLED.command == "./snowarch instance set-preset <label> <preset>"` (with the `prod` `--ack-prod` clause); `INSTANCE_NOT_LOADED` (ARC-04-S03) added with remedy "the instance is `prod` with a write preset and no acknowledgement — `./snowarch instance set-preset <label> read-only` or `… --ack-prod`". No other code becomes rule-visible.
- **Rule-file section** (rendered by ARC-05-S05; the literals below are the prose this story supplies to the renderer):
  ```
  ## Runtime errors — stop and give the remedy, never retry, never propose editing flags from inside Claude
  When a tool result contains `(Code: <CODE>)` for one of the codes below: stop the current step, print the remedy line verbatim, and wait. Do not call the tool again with the same or different credentials. Do not suggest editing `.local/instances.json`, `.mcp.json` or any settings file by hand. After the user reports the remedy done, continue from the interrupted step (for `AUTHENTICATION_FAILED` and `NO_INSTANCE_CONFIGURED`, call `snow_core_capabilities_read` first to confirm the new state).
  - `AUTHENTICATION_FAILED` → ./snowarch instance set-credentials <label> (user's terminal)
  - `<FLAG>_NOT_ENABLED` (WRITE, CMDB_WRITE, SCRIPTING, ATF, NOW_ASSIST, FLUENT) → ./snowarch instance set-preset <label> <preset> — prod requires --ack-prod
  - … (one line per showInRule code, rendered)
  If two different runtime errors occur in one session, also say: run ./snowarch doctor in a terminal and paste the FAIL lines.
  ```
  `<label>` is substituted by the engine from `snow_core_capabilities_read.instance` when known; otherwise printed literally.
- **T-19 — `AUTHENTICATION_FAILED` at runtime (Modes: live).** Setup (documented as test-only): on a live checkout with a PDI, open `.local/instances.json` in an editor and append one character to the stored password for `pdi` (the wizard cannot save a wrong password — there is no "save anyway" — so the test edits the store directly; restore afterwards with `./snowarch instance set-credentials pdi`). Start `claude`. Prompt: "Read incident INC0010001 from the pdi instance." Expected: exactly one tool call (`mcp__servicenow__snow_inc_incident_read`) whose result contains `(Code: AUTHENTICATION_FAILED)`; the assistant stops, prints `./snowarch instance set-credentials pdi` verbatim, makes no second MCP call in the turn, does not propose editing any file, and waits. Follow-up prompt after restoring the credentials in the terminal: "done". Expected: one `snow_core_capabilities_read` call, then the read succeeds. Pass criterion includes `grep -c AUTHENTICATION_FAILED` over the transcript = the error occurrences, not retries. One 401 per run — matching ARC-07's bounded-attempt rationale (lockout risk); the PDI user's lockout state is checked afterwards as in ARC-07-S11's live suite.
- **T-20 — `*_NOT_ENABLED` maps to `set-preset` (Modes: live).** Setup: `./snowarch instance set-preset pdi read-only`. Prompt: "Create a Script Include named `X_TEST_Probe` on pdi." (after "write approved" per §2.1 — the test also exercises the gate). Expected: the call returns `(Code: SCRIPTING_NOT_ENABLED)`; the assistant prints `./snowarch instance set-preset pdi <preset>` and stops; it does not suggest `custom` flags by hand or editing the store. Cleanup: `set-preset pdi pdi-developer`.
- **T-07 update** (from S09): the exact seven-line template and the no-Node fallback text.
- **Design-only dormant variants** for T-19/T-20 (ARC-02-S13 convention): the assistant states `Mode: design-only — no live instance; nothing to authenticate` and makes no MCP call.
**Acceptance criteria.**
1. `packages/snowarch/dist/contract.json` lists `showInRule: true` for exactly the codes named above (asserted by a server test in ARC-05-S08's file, extended here); the regenerated `.claude/rules/00-mode-and-mcp-gate.md` contains the "Runtime errors" section with one line per such code and the three behavioural sentences; `gen:check` is green.
2. The `AUTHENTICATION_FAILED` remedy string is character-identical across the rule file, `docs/TROUBLESHOOTING.md`, `governance/mcp-protocols.md` and the wizard's 401 message (ARC-05-S06 criterion 3 extended by one consumer: `./snowarch doctor` SV-04 detail).
3. T-19 executed on the reference machine against a PDI: PASS with the transcript attached to the PR (instance identifiers removed), showing one failed call, the verbatim remedy, no retry, and the successful continuation after "done" (README acceptance criterion 7).
4. T-20 executed: PASS with the transcript.
5. Both tests are listed in `tests/VALIDATION-TESTS.md` with `**Modes:** live ✅ · design-only: dormant variant`, and the dormant variants pass on a design-only checkout.
6. `tests/VALIDATION-TESTS.md` T-07 reflects S09's template; the file's test count is 20.
**Tasks.**
1. Registry PR (`showInRule` set; `INSTANCE_NOT_LOADED`); regenerate; pin update per ARC-05 workflow.
2. Supply the runtime-section prose to `gen-governance.mjs`; regenerate; `gen:check`.
3. Write T-19, T-20; update T-07.
4. Execute T-19/T-20 live and the dormant variants; attach transcripts.
**Test strategy.** Server unit (registry); engine snapshot (`gen:check`); manual behavioural tests (live and design-only) recorded per ARC-02-S13's format; ARC-10 repeats them on clean machines.
**Dependencies.** S05 (Mode line used in the dormant variants). ARC-05-S05/S06/S08, ARC-04-S03/S11, ARC-02-S13, ARC-07-S03 (wizard message parity), ARC-07-S10 (`ruleText` for `AUTHENTICATION_FAILED` / `INSUFFICIENT_PRIVILEGES` / `PROD_WRITE_NOT_ACKNOWLEDGED` — merges before this story; ARC-07-S10 names this story as the consumer that adds the VALIDATION test).
**Size.** M — small code change, two live test executions with cleanup; ~1.5 days.
**Risks / open points.** The model might call `snow_core_capabilities_read` *before* stopping; the rule text permits it only after the user's "done". T-19 requires a deliberate store edit — the test text says so explicitly to prevent anyone adding a "save anyway" path to the wizard for testing's sake.
**Definition of done.** Merged; `gen:check` green; T-19/T-20 PASS recorded; README criterion 7 checked; ARC-10-S07 inherits the two tests.

---

### ARC-08-S11 — CI: doctor after bootstrap on three OSes, JSON snapshot test, fixture-driven detector tests, banner timing
**As** CI **I want** the doctor to run after the design-only bootstrap on ubuntu, macOS and Windows on every commit, its JSON compared against a normalised snapshot, the stale-registration and redaction fixtures exercised, and the banner timed **so that** ARC-08's acceptance criteria are proven continuously and every other ARC can name a doctor check as its proof (README risk "doctor drift").
**Context.** README deliverable 11 and acceptance criteria 1, 3, 5, 6; README risk mitigation "CI runs the doctor after the bootstrap". ARC-06-S14 (bootstrap CI job on three OSes; Windows without Git Bash), ARC-09-S08 (matrix completion — this story adds the doctor steps to the jobs ARC-06 created; ARC-09-S08 later places the `doctor` job on its final cells and names this story as its source), ARC-00-S13 (Windows PATH-stripping recipe), `01` §13 (CI runs bootstrap, lints, tests on three OSes).
**Scope.** In: `.github/workflows/ci.yml` steps `doctor` (after `bootstrap --mode design --yes`): `./snowarch doctor --json --no-cache > doctor.json`, exit-code assertion, snapshot comparison, artifact upload of `doctor.json`; `tests/doctor/snapshot.test.mjs` (normaliser + per-OS expected status map); `tests/doctor/fixtures/claude-json-stale/` (S03 criterion 1 in CI with `HOME` redirected); `tests/doctor/redaction-e2e.test.mjs` (README criterion 3 against a fixture store with known credentials — `RUN_LIVE_E2E` not needed; the store is read, probes are skipped); banner timing job step (S08 criterion 1). Out: the live-mode CI job (needs a PDI secret — remains the opt-in `RUN_LIVE_E2E` job owned by ARC-07-S11/ARC-09), the Node-version matrix (ARC-09-S08).
**Design notes.**
- **Snapshot normaliser.** Strips `ranAt`, `durationMs`, `version`/`tag`/`contractSha` values, paths, and counts (`fileCount`, `sizeBytes`), keeps `checks[].{id,status,fixable}` and `summary` minus timing; expected files `tests/doctor/snapshots/design-only.<os>.json` (Windows differs: E-11 and SV-02 mode details, E-04 providers). Any new check id must be added to all three snapshots — that is the "doctor drift" guard.
- **Assertions per OS** after the design bootstrap: exit code 0; `summary.fail == 0`; `mode == "design-only"`; `modeLine` equals the design-only text; every SV check `skip` (deps not installed in the design job); E-27 `skip` on runners without `claude` and `ok` with `data.approved == false` where the job installs Claude Code (ARC-06-S14's optional `claude`-present variant — the snapshot stores both statuses as allowed); E-12…E-16 `ok` (the corpus is checked out sparse by B02 — ARC-03-S11's real-corpus job proves size; here the fixture corpus from ARC-03-S05 is used when `CI_DOCS=fixture` to keep the job under 3 minutes).
- **Windows job** (Git Bash removed from PATH per ARC-00-S13): `snowarch.cmd doctor --json --no-cache` from PowerShell and from cmd; the hook timing step runs `node tools/snowarch/hooks/session-start.mjs` under both shells.
- **Redaction e2e.** A fixture `.local/instances.json` (created by the test with mode 0600, `username: "someone.fixture@corp.example"`, a random 24-char password) → `./snowarch doctor --json --no-network`; assert neither string appears; assert `s***@corp.example` appears in `server.instances[0].username`; repeat for the text output and for `--fix --yes --no-network` output (README criterion 3).
- **Stale-registration fixture.** `HOME`/`USERPROFILE` → temp dir with the S03 fixture; assert the two exact `claude mcp remove` lines (README criterion 6) and the unchanged sha.
- **Banner timing.** Five spawns with a fresh cache; assert median < 1 s (README criterion 5) and record the number in the job summary; on the reference machine the S08 test asserts < 300 ms (not enforced on shared runners).
- **Job summary.** The workflow writes the `DOCTOR:` line, the Mode line and the banner median into `$GITHUB_STEP_SUMMARY`; `doctor.json` is uploaded as an artifact (ARC-09's release workflow attaches the same file to releases).
**Acceptance criteria.**
1. On every push/PR, the three OS jobs run the doctor after the design bootstrap and fail the job when `summary.fail > 0` or the exit code ≠ 0 (README criterion 1 in CI).
2. Adding a new check id without updating the snapshots fails `snapshot.test.mjs` with the id named; the Windows snapshot differs from the POSIX ones only in the documented rows (E-04, E-11, SV-02).
3. The redaction e2e test passes on three OSes for text, `--json` and `--fix` outputs (README criterion 3).
4. The stale-registration fixture test passes on three OSes with the exact commands (README criterion 6).
5. The banner median is < 1 s on each OS job and is visible in the step summary (README criterion 5); the Windows steps run without Git Bash on PATH.
6. `doctor.json` is downloadable as an artifact from every run.
**Tasks.**
1. Add the doctor, snapshot, redaction, stale-fixture and banner steps to `ci.yml` (after ARC-06-S14's bootstrap step).
2. Write the normaliser and generate the three snapshots from a green run.
3. Write the two e2e tests; wire `CI_DOCS=fixture`.
4. Job summary and artifact upload.
**Test strategy.** The story *is* CI; verified by a deliberately failing PR (new check id, un-redacted string) that must go red, then green after the fix.
**Dependencies.** S02–S10. ARC-06-S14 (bootstrap job), ARC-00-S13 (Windows recipe), ARC-03-S05 (fixture corpus).
**Size.** M — 2 days including the deliberate red/green PRs.
**Risks / open points.** Shared runners are noisy for timing; the 1 s bound has headroom over the 300 ms target. The snapshot must not encode counts that change with the roster (it stores statuses, not numbers).
**Definition of done.** Merged; matrix green; the red/green proof PRs linked; `docs/CONTRIBUTING.md` gains "adding a doctor check: registry → snapshots → mapping table".

---

## Sizing summary

| Size | Stories | Days (range) |
|---|---|---|
| L | S01, S02, S06 | 11–14 |
| M | S03, S04, S05, S08, S09, S10, S11 | 11–15 |
| S | S07 | 0.5 |

**Total: 22–30 engineer-days (≈ 4.5–6 weeks for one engineer)** — within the six-week bound, with no slack for the live E2E runs if a PDI is unavailable. Critical path: S01 → S02/S04 → S05 → S06/S08 → S11. S03, S07, S09, S10 can run in parallel with S06/S08 once S05 has merged. Entry condition: ARC-04-S12 and ARC-05-S06/S10 merged; ARC-06-S01/S02/S05/S08 merged (S05/S06/S08 cannot be finished without them); ARC-07-S03 may land later (SV-04 stays a stub until it does).
