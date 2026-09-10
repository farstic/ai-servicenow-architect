# ARC-07 — Stories

Status: Draft · Decisions applied: D-01…D-06, Q-A, Q-B, R-1…R-3 · Source: README.md of this ARC · Last updated: 2026-09-04

Conventions used throughout this file:

- **Names (D-01, R-1, R-2).** Repository `farstic/ai-servicenow-architect`; server + CLI package `packages/snowarch` (npm `@farstic/snowarch`, version `2.0.0` == root); post-install launcher `./snowarch` (`snowarch.cmd` on Windows) → `tools/snowarch/bin/snowarch.mjs`; MCP server key `servicenow` → tools `mcp__servicenow__snow_*`; project skill `/snowarch` with sub-commands `status` · `setup-instance` · `doctor`. Where `01` still prints `packages/snow-mcp`, `/setup-instance`, `/status` or `1.0.0`, read the decided names.
- **Vocabulary.** Mode `design-only` | `live`; Preset `read-only` | `pdi-developer` | `full` | `custom`; the six flags `WRITE_ENABLED`, `CMDB_WRITE_ENABLED`, `SCRIPTING_ENABLED`, `ATF_ENABLED`, `NOW_ASSIST_ENABLED`, `FLUENT_ENABLED`, always stored as the byte-exact strings `"true"` / `"false"` (the server compares `=== 'true'`, `snow-mcp/src/utils/permissions.ts:14-68`). In user-facing text the flags are shown without the `_ENABLED` suffix (`WRITE`, `CMDB_WRITE`, …), exactly as `01` §6.3 does.
- **Where the code lives.** The wizard is the server package's CLI (`01` §6.1 DR-4): `packages/snowarch/src/cli/instance.ts` and siblings, built to `packages/snowarch/dist/cli/index.js` (the path ARC-04-S12 and ARC-06-S07 already use). `tools/snowarch` (zero-dependency, ARC-06) only *forwards* `instance …` to `node packages/snowarch/dist/cli/index.js instance …` with inherited stdio; it never prompts for a secret. The modules these stories build on, by their names in the other ARCs' `STORIES.md` (2026-09-04): **store module** ARC-04-S02 — `src/store/paths.ts` (`resolveStorePath()`: `SNOW_STORE` → project `.local/instances.json` → global; `isUnderCloudSyncFolder()`, `maskPath()`, `maskUsername()`), `src/store/schema.ts` (zod schema v1; labels `^[a-z][a-z0-9_-]{0,31}$`), `src/store/index.ts` (`loadStore()`, `saveStore()` — dir 0700, temp + `fsync` + rename, chmod 0600 —, `checkFileModes()`, `readDefaultLabel()`); **preset module** ARC-04-S03 — `src/utils/permissions.ts` (`FLAG_NAMES`, `PRESETS`, `expandPreset()`, `applyDependencyRule()`, `checkProdPosture()`); **HTTP layer** ARC-04-S11 — `src/servicenow/http.ts` (`snFetch()` through the `EnvHttpProxyAgent`) and `src/servicenow/net-errors.ts` (`classifyNetworkError()`, six network codes); **core tools** ARC-04-S04 (`snow_core_instances_reload` + `list_changed`, `snow_core_capabilities_read`, `snow_core_status_read`); **audit writer** ARC-04-S10 — `src/audit/writer.ts` (`<store dir>/audit.jsonl`); **error-code registry** ARC-05-S06 — `src/utils/error-codes.ts` (`ERROR_CODES`, the single remedy table rendered into `docs/TROUBLESHOOTING.md` and the rule file by ARC-05-S05/S06); **server doctor** ARC-04-S12 — `src/doctor/` with the `Probes` interface S03 binds. Where an ARC-07 story needs a function these modules do not yet export (`matchPreset()`, `detectCloudSync()`, the audit append function), the story adds it to that module in a PR against it — never a second copy. `commander` survives ARC-04-S01's dependency prune and remains the option parser; `@inquirer/prompts`, `chalk`, `ora` do not.
- **Store schema v1** (`01` §7), the shape every story reads and writes (values elided — never a real secret in this plan):

  ```json
  { "version": 1, "defaultInstance": "pdi",
    "instances": { "pdi": {
      "url": "https://dev12345.service-now.com", "environment": "pdi",
      "auth": { "method": "basic", "username": "…", "password": "…" },
      "preset": "pdi-developer",
      "flags": { "WRITE_ENABLED": "true", "CMDB_WRITE_ENABLED": "true", "SCRIPTING_ENABLED": "true",
                 "ATF_ENABLED": "true", "NOW_ASSIST_ENABLED": "false", "FLUENT_ENABLED": "false" },
      "toolPackage": "full", "maxRecords": 100, "prodWriteAck": false,
      "lastProbe": { "at": "2026-09-04T10:12:00Z", "auth": "ok", "write": "ok", "scripting": "ok",
                     "cmdb": "ok", "atf": "ok", "nowAssist": "skipped", "fluent": "skipped" } } } }
  ```
  `auth.method` is `basic` or `oauth_ropc` (the latter adds `clientId`, `clientSecret`). `lastProbe.fluent` is not in the `01` §7 list but is already in ARC-04-S02's schema example (schema version stays 1). The value enum of every `lastProbe.*` field is the probe vocabulary below, owned by S03 — ARC-04-S02's example values `no-licence` / `sdk-missing` are to be aligned to `not licensed` / `not installed` when S03 lands (cross-ARC note; no schema change).
- **Probe result vocabulary** (one word per line, used by the wizard, `instance list|test`, the store and the ARC-08 doctor): `ok` · `role missing` · `auth failed` · `not licensed` · `not installed` · `unreachable` · `skipped` · `error`.
- **Masking rule** for anything printed or exported: username → first character + `***` (+ `@domain` when the username is an e-mail; usernames of ≤ 2 characters → `***`); secrets → `set (len n)`; proxy URLs with userinfo → `http://***@host:port`. Nothing under this rule is ever relaxed by a `--verbose` or `--json` flag.
- **Exit codes** of every `snowarch instance …` command: `0` success · `1` failure (auth, probe, network — nothing saved) · `2` usage or validation error (bad argument, bad URL, no TTY without `--password-stdin`, missing `--env`) · `3` policy refusal (prod cap, `--ack-prod` missing or label mismatch, unsafe store mode) · `130` interrupted (Ctrl-C).
- **Principle 10 — Propose, don't impose** (`01` §2, D-05) is an acceptance criterion of this ARC: every value the wizard needs is *proposed* with a one-line reason, accepted with Enter, editable in place, and re-editable later with `./snowarch instance …` or `/snowarch setup-instance`. `--yes` accepts every proposal for CI. Any story below that prompts must follow that shape.
- **Facts from the old code relied on** (read-only sources): today's wizard `snow-mcp/src/cli/setup.ts:361-1131` (HEAD reachability with an 8 s timeout at 156–166; the `/api` "auto-fix" at 441–449 and 597–608 that yields an invalid base URL; "Save config anyway" at 584/595; `npm link` at 238–269); the legacy store `snow-mcp/src/cli/config-store.ts` (field list 13–51; `writeFileSync` with default mode 129–132; path `~/.config/servicenow-mcp/instances.json` 97–103); the client's ROPC token request (`grant_type: 'password'` to `/oauth_token.do`, `snow-mcp/src/servicenow/client.ts:134-141`), its 401 → `AUTHENTICATION_FAILED` / 403 → `INSUFFICIENT_PRIVILEGES` mapping (276–279), its refusal to retry `AUTHENTICATION_FAILED` (313–316) and its default `maxRetries` of 3 (80); the per-user token file `~/.config/servicenow-mcp/tokens.json` (`snow-mcp/src/cli/auth.ts:29-33`, removed by D-03); the ROPC hardening property `glide.oauth.inbound.ropc.grant_type.disabled` (`vendor/ServiceNowDocs/markdown/platform-security/instance-security-hardening-settings/sc-disable-resource-owner-password-credentials-ropc-in-oauth-2-token-grants.md:19-21`).

## Story map

| ID | Title | Size | Depends on | Delivers |
|---|---|---|---|---|
| ARC-07-S01 | Masked-input module (`process.stdin.setRawMode`), `--password-stdin`, the no-TTY rule | M | ARC-04-S01 (prompt/colour libraries removed; `commander` kept); ARC-00-S07 (S-04 verdict) | `packages/snowarch/src/cli/tty.ts` — the only place a secret is ever typed |
| ARC-07-S02 | URL normalisation and validation; environment proposal; reachability probe with DNS / TLS-CA / proxy diagnosis (R-3) | M | ARC-04-S11 (R-3: `snFetch`, `classifyNetworkError`); ARC-05-S06 (registry) | `url.ts`, `reachability.ts`, the `URL_*` / `ENV_REQUIRED` codes; wizard-grade remedies for ARC-04-S11's six network codes |
| ARC-07-S03 | Probe library: auth probe (basic, ROPC), 401/403 mapping, `OAUTH_ROPC_DISABLED`, role hints, per-flag capability probes, `lastProbe` record | M | S02; ARC-04-S02 (schema), S03 (`FLAG_NAMES`), S12 (`Probes` interface) | `packages/snowarch/src/servicenow/probes.ts` bound to `Probes.runAll`, reused by ARC-08 |
| ARC-07-S04 | Preset proposal and the per-flag review screen (Propose → Review → Apply); prod cap in the wizard; `--yes` / `--preset` / `--flags` | M | S03; ARC-04-S03 (preset module), S06 (`dist/contract.json`) | `preset-ui.ts` + `matchPreset()`; the D-05 screen as `01` §6.3 |
| ARC-07-S05 | `instance add` end to end: bounded credential re-entry, atomic 0600 save, secret-free summary, the `./snowarch instance` forwarder, exit codes | L | S01–S04; ARC-04-S02, S10; ARC-06-S02 (skeleton), S07 (B06 slot, `--instance-file`) | The README's first acceptance criterion |
| ARC-07-S06 | `instance list · test (incl. --all --json) · set-credentials · set-preset (--ack-prod) · set-flags · set-default · remove` | M | S05; ARC-04-S03 (prod rule), S10 (audit writer) | Maintenance commands; the D-05 raise-to-write path; `test --all --json` consumed by ARC-06-S08 |
| ARC-07-S07 | `--global` store, project-wins precedence messaging, cloud-sync-folder warning (D-04) | M | S05, S06; ARC-04-S02 (`paths.ts`); ARC-06-S05 and ARC-08-S03 (parity fixture) | `detectCloudSync()` in `src/store/paths.ts` + the shared cloud-sync fixture; `--global`; `list --all` |
| ARC-07-S08 | `instance import --from-legacy`: dry-run plan, field and flag mapping, explicit `FLUENT_ENABLED`, prod cap, deletion advice | M | S04, S05, S07; ARC-04-S02 | The one-time migration ARC-10-S01 documents |
| ARC-07-S09 | `/snowarch setup-instance` skill body: prerequisite check, three `AskUserQuestion`s, printed command per OS, `--resume` with reload + doctor, S-02 fallback | M | S05, S06; ARC-02-S11 (skill skeleton); ARC-04-S04 (reload, capabilities); ARC-08-S01 (doctor JSON); ARC-00-S10 (S-02), S04 (S-16), S12 (S-19) | The in-Claude front-end and the D-06 terminal hand-off |
| ARC-07-S10 | `docs/MODES-AND-PRESETS.md` final text; error-registry entries; runtime rule text for `AUTHENTICATION_FAILED` / `INSUFFICIENT_PRIVILEGES` / `PROD_WRITE_NOT_ACKNOWLEDGED` | M | S02–S08; ARC-02-S09 (page skeleton); ARC-05-S05/S06 (generators, registry) | User docs and the generated rule fragment; consumed by ARC-08-S10 (`showInRule` review, T-19) |
| ARC-07-S11 | Live E2E suite behind `RUN_LIVE_E2E=1`: wizard end to end, three-failure exit with lockout check, prod cap, ROPC-disabled fixture, import | M | S05–S08; ARC-06-S08 (`lib/mcp-handshake.mjs`); a PDI with CI secrets | Proof on a real instance; nightly workflow |

Mapping to the README's original titles-only list: 1 → S01 · 2 → S02 (R-3 folded in) · 3 → S03 + S05 (split: the probe library is reused by `instance test` and the ARC-08 doctor, the flow is not) · 4 → S04 · 5 → S06 · 6 → S07 (the D-04 cloud-sync warning folded in) · 7 → S08 · 8 → S09 · 9 → S10 · 10 → S11. Total 20–25 engineer-days (see the Sizing summary).

## Stories

### ARC-07-S01 — Masked-input module (`process.stdin.setRawMode`), `--password-stdin`, the no-TTY rule

**As** an individual practitioner **I want** to type my instance password once, in my own terminal, with nothing echoed and nothing landing in argv, environment, shell history or a transcript **so that** the credential boundary of `01` principle 3 holds on macOS, Linux and native Windows.

**Context.** P-23 (today's wizard masks with `@inquirer/prompts`, a dependency ARC-04-S01 removes together with the whole of `src/cli/setup.ts`; `snow-mcp/src/cli/setup.ts:17,546`), P-34 (argv exposure). `01` §6.1: the terminal CLI is "the only place a secret can be typed without transcript, argv or file exposure"; `01` §13: "masked input via `process.stdin.setRawMode` (S-04)"; `01` §7: captured "only by `snowarch instance add|set-credentials` … or `--password-stdin` for automation". README acceptance: "nothing echoed; `ps` during the run shows no secret; the shell history contains no secret" and the Windows criterion "the masked prompt works (S-04) or `--password-stdin` is documented as the fallback in the same output". Q-B makes native Windows first-class conditional on S-04.

**Scope.** In: `packages/snowarch/src/cli/tty.ts` with `promptSecret`, `promptLine`, `promptChoice`, `readSecretFromStdin`; key handling; the no-TTY error; the rejection of any `--password` / `--client-secret` argv flag; unit tests with a fake TTY stream. Out: the `--web` localhost form (roadmap `01` §17 item 5); any prompt library; any colour/spinner dependency (`chalk`, `ora` are removed by ARC-04-S01 — plain text with optional ANSI bold when `stdout.isTTY`).

**Design notes.**
- API (all functions take `{ stdin = process.stdin, stdout = process.stdout }` for testing):
  - `promptSecret(label: string): Promise<string>` — writes `label + ' '`; requires `stdin.isTTY`; `setRawMode(true)`; reads chunks byte by byte: `\r` / `\n` → submit; `\x7f` / `\x08` → delete one character; `\x15` (Ctrl-U) → clear; `\x03` (Ctrl-C) → restore mode, write `\n`, exit 130 with `Cancelled — nothing saved.`; `\x04` (Ctrl-D) on an empty buffer → same as Ctrl-C; `\x1b[…` escape sequences (arrows, function keys) → ignored; any other byte → appended. Pasted text arrives as one multi-byte chunk and is processed byte by byte, so a trailing newline in the paste submits. Echoes **nothing** (the S-04 default; `S-04` also tested an asterisk mode — kept behind `SNOWARCH_MASK=asterisk` for users who need feedback, never the default). Always restores the previous raw-mode state and writes `\n` on exit, including on thrown errors (`try/finally`).
  - `promptLine(label, { default?, validate? })` — line-based (`node:readline`), used for non-secret values; shows `[default]`, Enter accepts; `validate` returns a message that is printed and the prompt repeated.
  - `promptChoice(label, choices: {key, text}[], { default? })` — numbered list; Enter accepts the default; invalid entry repeats.
  - `readSecretFromStdin(): Promise<string[]>` — reads all of stdin (non-TTY), splits on `\n`, strips a trailing `\r` per line; line 1 = password; line 2 (only for `--auth oauth_ropc`) = client secret. Used by `--password-stdin`.
- No-TTY rule: when a secret is needed, `stdin.isTTY` is false and `--password-stdin` is absent, print exactly
  `NO_TTY: stdin is not a terminal, so the password cannot be typed with masking. Pipe it with --password-stdin (for example from a password manager: op read "op://vault/item/password" | ./snowarch instance add …) or run the command in an interactive terminal.` and exit 2. On Windows the same message adds `On PowerShell/cmd use: snowarch.cmd instance add … --password-stdin`.
- Argv rule: the option parser rejects `--password`, `--client-secret`, `--secret` and `--password=` with `Secrets are never accepted on the command line (they would appear in ps output and shell history). Use the prompt or --password-stdin.` exit 2.
- Secret handling in memory: kept in a `string` only for the duration of the probe and the store write; not logged; not included in any thrown error's `message`; the `ServiceNowClient` is constructed with the value and dropped afterwards.
- Platform evidence: Node's TTY raw mode on Windows consoles (`03` S-04 evidence); the S-04 spike record (ARC-00-S07) fixes the 8-cell Windows matrix result. If S-04 recorded `FAILED` for a combination, `tty.ts` detects that combination (`process.platform === 'win32'` and the recorded condition) and prints the `--password-stdin` fallback instead of attempting raw mode.

**Acceptance criteria.**
1. Given an interactive terminal on macOS 14, when `promptSecret('Password:')` runs and the user types `abcd`, Backspace, `e`, Enter, then the returned string has length 4 and the terminal shows only `Password: ` followed by a newline — no characters, no asterisks.
2. Given the same, when the user presses Ctrl-C mid-entry, then the process exits 130, the terminal is not left in raw mode (the next shell prompt is intact) and `Cancelled — nothing saved.` was printed.
3. Given `echo secret | node packages/snowarch/dist/cli/index.js instance add x --url https://dev1.service-now.com --env pdi --auth basic` (no `--password-stdin`), then the exact `NO_TTY:` message is printed and the exit code is 2.
4. Given `printf 'p\n' | … --password-stdin --yes`, then no prompt is shown and the password is the string `p` (trailing newline stripped); given `printf 'p\r\n' | …` the result is identical (CRLF stripped) — Windows CI proves this.
5. Given `… instance add x --password hunter2`, then the "Secrets are never accepted on the command line" message is printed, exit 2, and no network call is made.
6. On Windows 10/11 without Git Bash, in Windows Terminal and conhost, under PowerShell 5.1 and cmd (the S-04 matrix), criterion 1 holds; where the S-04 record says `FAILED` for a combination, the module prints the `--password-stdin` fallback line instead of hanging or echoing.
7. A pasted password containing a trailing newline is submitted without a second Enter; a pasted password without one waits for Enter.

**Tasks.**
1. Write `tty.ts` with the four functions and the key table above; no dependencies beyond `node:tty`, `node:readline`, `node:process`.
2. Add the argv rejection as a pre-parse scan of `process.argv` in `packages/snowarch/src/cli/index.ts`, run before `commander` (kept by ARC-04-S01) parses anything — `commander` must never receive a `--password` value it could echo in an "unknown option" error.
3. Unit tests (`packages/snowarch/tests/cli/tty.test.ts`) with a fake stream implementing `isTTY`, `setRawMode`, `on('data')`, pushing the byte sequences of criteria 1, 2, 7 and the CRLF case.
4. Wire the S-04 record into `tty.ts` (a constant table of known-bad Windows combinations, empty if S-04 is `CONFIRMED` 8/8).
5. Document the fallback text in `docs/MODES-AND-PRESETS.md` (S10 owns the final page; this story adds the paragraph).

**Test strategy.** Unit tests on the fake stream in the three-OS CI matrix (no real TTY needed). Manual: the S-04 matrix re-run on the built CLI on the ARC-00 Windows snapshot, recorded in `docs/validation/`. The `ps` / shell-history checks are E2E (S11).

**Dependencies.** ARC-04-S01 (the prompt/colour libraries are gone, so nothing else may be used; `commander` stays); ARC-00-S07 (S-04 verdict) for the Windows table.

**Size.** M — 1.5–2 days: the byte table is small, but paste, CRLF and raw-mode restoration on every exit path need care.

**Risks / open points.** Terminals that translate Backspace to `\x08` vs `\x7f` (both handled). `SNOWARCH_MASK=asterisk` reveals the password *length*; documented, off by default. JavaScript strings cannot be zeroed; accepted (same class as today's `~/.claude.json` env values, and the value never leaves the process).

**Definition of done.** Merged; unit tests green on ubuntu/macos/windows × Node 20/22/24; `docs/MODES-AND-PRESETS.md` paragraph present; the S-04 manual record linked from the story's PR.

---

### ARC-07-S02 — URL normalisation and validation; environment proposal; reachability probe with DNS / TLS-CA / proxy diagnosis (R-3)

> **Amendment 2026-09-08 (from ARC-05-S06).** **`PROXY_CONNECT_FAILED` is not a registry key —
> the condition is `PROXY_UNREACHABLE`** (ARC-04-S11 emits it, and the registry carries its meaning
> and remedy). `ServiceNowError` now takes the registry's union as its code type, so the old literal
> will not compile. The wizard's own codes — `URL_REQUIRED`, `URL_INVALID`, `URL_NOT_HTTPS`,
> `URL_HAS_PATH`, `URL_HAS_CREDENTIALS`, `OAUTH_ROPC_DISABLED`, `OAUTH_CLIENT_INVALID`,
> `TLS_CERT_INVALID` — are registered with `showInRule: false` and already have their meanings and
> remedies in `docs/TROUBLESHOOTING.md`; render them, do not restate them.

> **Amendment 2026-09-10 (ARC-07-S02, from the tree).** Three corrections, all of the same kind
> as the `PROXY_CONNECT_FAILED` one above — the registry and the classifier are the source of
> truth and the story text defers to them.
> **(1) `NETWORK_TIMEOUT` is not a registry key; the condition is `CONNECTION_TIMEOUT`** (that is
> what `classifyNetworkError` emits and what `ERROR_CODES` carries), so a timeout is reported and
> documented under that name.
> **(2) `PROXY_AUTH_REQUIRED` did not exist** — 407 is a RESPONSE, so the network classifier never
> sees it. This story registers it (`showInRule: false`, `httpStatus: 407`) and `probeReachability`
> maps 407 whether it arrives as a response or as a throw.
> **(3) `ENV_REQUIRED` was likewise unregistered** and is added with the story's message.
> Two more notes for whoever reads this next. The registry now also carries `<host>`, `<proxy>` and
> `<issuer>` placeholders in the six network remedies: the wizard substitutes them, and
> `docs/TROUBLESHOOTING.md` prints the template, which is the same one table ARC-05-S06 requires.
> And an ABORTED request — our own 10 s deadline, which arrives as a `TimeoutError` carrying no
> `code` at all — was falling through to `NETWORK_ERROR` ("run the doctor") for the one failure
> whose remedy is the most specific of the six; `classifyNetworkError` recognises it now, which
> every caller that passes a signal gets as well.
>
> **Task 4 (integration into the `instance add` / `instance test` step order) belongs to S05/S06**,
> which is where those commands exist. This story ships the functions and proves AC 3, AC 5 and
> AC 6 at FUNCTION level — `resolveEnvironment` (the `--yes` + non-PDI + no `--env` → `ENV_REQUIRED`
> result the command maps to exit 2, and the interactive path), `describeNetworkEnv` (one line per
> call; "once per run" is the command's) and `reachabilityMenu` (three options, no "continue
> anyway", `abort` saving nothing). S05/S06 re-prove all three end to end.

**As** an individual practitioner **I want** the wizard to accept my instance address in any reasonable form, correct what can be corrected with my consent, refuse what cannot, and — when the host is unreachable — tell me *which* of DNS, a TLS-intercepting gateway or a proxy is in the way and what to set **so that** a corporate laptop is not stuck at "unreachable".

**Context.** P-23 (the `/api` auto-fix at `setup.ts:441-449,597-608` builds `https://host/api` and saves it as the base URL, which then breaks every REST path; "continue anyway" at 437–439). `01` §6.2 step 5: "validated as a bare `https://` origin — vanity hostnames allowed, trailing slash stripped, `/api` rejected with the reason"; step 7: "10 s HEAD reachability first, with DNS / TLS / proxy diagnosis". D-05: "`^https://dev\d+\.service-now\.com` → proposed `pdi`; everything else is asked, never guessed". R-3 (`02` post-decision rulings; `03` R-15): "the ARC-07 wizard reachability probe distinguishes DNS / TLS-CA / proxy failures and prints the exact remedy"; the server's HTTP layer honours `HTTPS_PROXY` / `NO_PROXY` / `NODE_EXTRA_CA_CERTS` per ARC-04-S11 (`src/servicenow/http.ts` `snFetch()` with an `EnvHttpProxyAgent`; `src/servicenow/net-errors.ts` `classifyNetworkError()`) — this story consumes both, it adds neither a proxy agent nor a second error classifier.

**Scope.** In: `packages/snowarch/src/cli/url.ts` (`normalizeInstanceUrl`, `proposeEnvironment`), `packages/snowarch/src/servicenow/reachability.ts` (`probeReachability`, `describeNetworkEnv`), error codes and remedies, unit tests with injected `fetch` failures. Out: HTTP (non-TLS) instances (rejected); auto-discovery of proxies from OS settings (documented as manual).

**Design notes.**
- `normalizeInstanceUrl(input) → { ok: true, url, proposed: boolean, notes: string[] } | { ok: false, code, message }`:
  - trim; lowercase the host; `^[a-z0-9-]+$` (a bare subdomain) → **proposal** `https://<x>.service-now.com` (`proposed: true`; the caller shows `Proposed URL: https://dev12345.service-now.com — Enter to accept, or type the full URL` per principle 10);
  - `http://…` → `URL_NOT_HTTPS` — `ServiceNow instances are served over https only; use https://<host>`;
  - parse with `new URL()`; a parse failure → `URL_INVALID`;
  - userinfo present → `URL_HAS_CREDENTIALS` — `Never put a username or password in the URL; the wizard will ask for them separately.`;
  - pathname `/api` or `/api/…` → `URL_HAS_PATH` — `"/api" is the REST base the server adds itself — enter the bare origin (https://<host>)`; any other pathname (other than `/`), search or hash → `URL_HAS_PATH` — `Enter the instance origin only (https://<host>), without a path`;
  - trailing slash stripped (note added); explicit port kept (on-prem / vanity hosts); result is `origin` from `URL`.
- `proposeEnvironment(url) → 'pdi' | null`: regex `^https://dev\d+\.service-now\.com$` → `pdi`; otherwise `null`, and the caller asks `What is this instance?  [1] pdi  [2] dev  [3] test  [4] prod` with **no default** (a bare Enter repeats the question). Non-interactive (`--yes`) without `--env` and with `null` → `ENV_REQUIRED` exit 2: `--env is required for <host> (only devNNNNN.service-now.com hosts are recognised as PDI).`
- `probeReachability(url, { timeoutMs = 10000 })`: one `HEAD <origin>/` through ARC-04-S11's `snFetch()` (so the `EnvHttpProxyAgent` and `NODE_EXTRA_CA_CERTS` apply; this story adds no `fetch(` call of its own — ARC-04-S11 AC 7 confines `fetch(` to `http.ts`). Any HTTP status other than 407 (including 302 to the login page, 401, 403) → `{ ok: true, status, latencyMs }`. On a thrown error (undici wraps the socket error as `TypeError: fetch failed` with `cause` — the chain today's `extractFetchError` walks at `setup.ts:133-150`) or on a 407, the result is ARC-04-S11's `classifyNetworkError(err)` → `{ code, cause, remedy }`. The six codes and their triggers are ARC-04-S11's, not this story's: `DNS_FAILURE` (`ENOTFOUND` / `EAI_AGAIN`), `TLS_CA_UNTRUSTED` (`UNABLE_TO_VERIFY_LEAF_SIGNATURE`, `SELF_SIGNED_CERT_IN_CHAIN`, `DEPTH_ZERO_SELF_SIGNED_CERT`, `UNABLE_TO_GET_ISSUER_CERT_LOCALLY`, `CERT_HAS_EXPIRED`), `PROXY_UNREACHABLE` (`ECONNREFUSED` / `ECONNRESET` / `EHOSTUNREACH` with a proxy variable set), `CONNECTION_REFUSED` (the same codes without a proxy), `NETWORK_TIMEOUT` (`UND_ERR_CONNECT_TIMEOUT` / `ETIMEDOUT` / abort), `PROXY_AUTH_REQUIRED` (HTTP 407). ARC-05-S06 allows exactly one remedy table, so what this story contributes is the *wizard-grade remedy text* for those six registry entries — a PR against `src/utils/error-codes.ts`, merged by whichever of ARC-04-S11 / this story lands second:

  | code (ARC-04-S11) | registry `remedy` (this story's text) |
  |---|---|
  | `DNS_FAILURE` | `The name <host> does not resolve. Check the instance name; on a corporate network the name may resolve only over VPN or through the proxy (set HTTPS_PROXY).` |
  | `TLS_CA_UNTRUSTED` | `The certificate presented for <host> is not trusted by Node (issuer: <CN if available>) — typically a TLS-intercepting gateway, or an expired certificate. Export the gateway's root CA as PEM and set NODE_EXTRA_CA_CERTS=/path/ca.pem for the shell that runs ./snowarch and in .claude/settings.local.json → "env" so the server gets it too. Never set NODE_TLS_REJECT_UNAUTHORIZED=0.` |
  | `PROXY_UNREACHABLE` | `The proxy <scheme://***@host:port> (from HTTPS_PROXY) did not connect to <host>. Check the proxy address and credentials, and that <host> is not excluded by NO_PROXY.` |
  | `PROXY_AUTH_REQUIRED` | `The proxy answered 407 — it wants credentials. Put them in the proxy URL (HTTPS_PROXY=http://user:pass@proxy:port); NTLM/Kerberos proxies are not supported.` |
  | `NETWORK_TIMEOUT` | `No answer from <host> in 10 s. If this network needs a proxy, set HTTPS_PROXY=http://proxy:port (and NO_PROXY for internal hosts) and run again. An idle PDI may be hibernating — wake it at developer.servicenow.com.` |
  | `CONNECTION_REFUSED` | `<host> refused the connection — the instance may be hibernated (PDIs sleep after inactivity: wake it at developer.servicenow.com) or blocked by a firewall.` |

  `<host>` and the masked proxy URL are substituted by the wizard from the registry template; the same registry text is what `docs/TROUBLESHOOTING.md` and the ARC-08 doctor (E-26 / SV-04) print.
- `describeNetworkEnv()` prints one line before the probe, always: `network: HTTPS_PROXY=<set (http://***@proxy:8080) | unset> · NO_PROXY=<value | unset> · NODE_EXTRA_CA_CERTS=<path | unset>` — so a support reader sees the state even when the probe succeeds.
- Output format on failure: `reachability: FAIL <CODE> — <detail>` then `  remedy: <line>`; the wizard then offers `[1] re-enter the URL  [2] retry  [3] abort` — no "continue anyway" (P-23).
- The URL/environment codes this story introduces (`URL_NOT_HTTPS`, `URL_INVALID`, `URL_HAS_CREDENTIALS`, `URL_HAS_PATH`, `ENV_REQUIRED`) are registered in ARC-05-S06's `ERROR_CODES` with the messages above as `meaning` and one-line remedies (S10 lists them), so `docs/TROUBLESHOOTING.md` and the ARC-08 doctor print the same text.

**Acceptance criteria.**
1. `normalizeInstanceUrl('DEV12345')` → `{ ok: true, url: 'https://dev12345.service-now.com', proposed: true }`; `'https://dev12345.service-now.com/'` → same URL, `proposed: false`, note `trailing slash removed`; `'https://acme.service-now.com/api'` → `URL_HAS_PATH` with the `/api` sentence; `'http://dev1.service-now.com'` → `URL_NOT_HTTPS`; `'https://u:p@dev1.service-now.com'` → `URL_HAS_CREDENTIALS`; `'https://snow.acme.internal:8443'` → ok, port kept.
2. `proposeEnvironment` returns `pdi` for `https://dev12345.service-now.com` and `null` for `https://dev12345.service-now.com.evil.example`, `https://acme.service-now.com`, `https://snow.acme.internal`.
3. Given `--yes` and a non-PDI URL without `--env`, the command exits 2 with the `ENV_REQUIRED` text; interactively, Enter on the environment question repeats it and never selects a value.
4. For each of the six ARC-04-S11 codes, a unit test injects an `snFetch` that throws `Object.assign(new TypeError('fetch failed'), { cause: { code } })` (with and without `HTTPS_PROXY` in the injected env) or returns a 407, and asserts the code from `classifyNetworkError` and the remedy text from `ERROR_CODES` with `<host>` substituted; an HTTP 302 and an HTTP 401 response both yield `ok: true`.
5. The `network:` line masks proxy userinfo and appears exactly once per `instance add` / `instance test` run.
6. The wizard's failure menu has no "continue anyway" option; choosing `abort` exits 1 with nothing saved.

**Tasks.**
1. Implement `url.ts` with the rule list and unit tests (`tests/cli/url.test.ts`, ≥ 12 cases).
2. Implement `reachability.ts` over ARC-04-S11's `snFetch()` and `classifyNetworkError()`; substitute `<host>` and the masked proxy URL into the registry remedy.
3. Register the five URL/ENV codes and refine the six network remedies in `src/utils/error-codes.ts` (ARC-05-S06's registry); unit test that every code printed by `url.ts` / `reachability.ts` is a key of `ERROR_CODES`.
4. Integrate into the `instance add` and `instance test` step order (S05, S06).

**Test strategy.** Unit only (injected `fetch`); no network in CI. Manual on the ARC-00 Windows snapshot with a bogus `HTTPS_PROXY` to see the `PROXY_UNREACHABLE` path; manual against a PDI that is hibernated for `CONNECTION_REFUSED`/`NETWORK_TIMEOUT` (which of the two a sleeping PDI produces is recorded in S11).

**Dependencies.** ARC-04-S11 (`snFetch`, `classifyNetworkError` — the probe must go through the proxy agent for the diagnosis to be truthful); ARC-05-S06 (`ERROR_CODES` — if it lands later, the codes go into ARC-04-S11's interim entries). Store-independent: no dependency on ARC-04-S02.

**Size.** M — 1.5–2 days.

**Risks / open points.** undici error-code names can differ between Node 20/22/24 (`UND_ERR_*` vs socket codes) — ARC-04-S11's classifier matches both and the CI matrix proves it. Whether a `407` surfaces as a response or a thrown error depends on the proxy agent chosen in ARC-04-S11; both are handled. Corporate proxies that require NTLM/Kerberos are out of scope (documented in S10). Two stories write the same six registry entries (ARC-04-S11 first, this story's richer text second) — the second PR is a text-only change with the S10 coverage test as the guard.

**Definition of done.** Merged; unit tests green on the three OSes; registry entries present; regenerated `docs/TROUBLESHOOTING.md` shows the five URL/ENV codes and the six network codes with the wizard-grade remedies.

---

### ARC-07-S03 — Probe library: auth probe (basic, ROPC), 401/403 mapping, `OAUTH_ROPC_DISABLED`, role hints, per-flag capability probes, `lastProbe` record

**As** the server (and the ARC-08 doctor) **I want** one library that proves an instance's credentials and reports, per flag, whether the account can reach the table family that flag unlocks, without ever retrying a failed login **so that** the wizard, `instance test` and the doctor tell the same truth and no probe can lock an account out.

**Context.** `01` §6.2 step 7: `GET /api/now/table/sys_user?sysparm_limit=1`; "on 401 … a bounded loop, never a silent retry (account-lockout risk); on 403 explains missing roles"; "per-preset capability probes (`sys_update_set`, `sys_script_include`, `cmdb_ci`, `sys_atf_test`, `sys_properties` `sn_generative_ai*` when NOW_ASSIST) and reports each `ok` / `role missing`". `01` §8 server checks reuse them; ARC-08 README depends on ARC-07-S02/S03 (probes). README risk: "OAuth ROPC disabled by instance hardening → the probe fails with a clear `OAUTH_ROPC_DISABLED` hint". P-38 (ROPC is legacy, D-04 keeps it labelled). Today's client retries up to 3 times by default (`client.ts:80`) but excludes `AUTHENTICATION_FAILED` (313–316); the probe must construct the client with `maxRetries: 0` anyway so that *no* status can cause a second login attempt.

**Scope.** In: `packages/snowarch/src/servicenow/probes.ts` (`probeAuth`, `probeCapability`, `probeAll`, `toLastProbe`), the ROPC error-text table, the local `@servicenow/sdk` check, unit tests with a fake REST layer. Out: any write to the instance (all probes are `GET` with `sysparm_limit=1`); the wizard's re-entry loop (S05); the doctor's rendering (ARC-08).

**Design notes.**
- Client construction: `new ServiceNowClient({ instanceUrl, authMethod, basic|oauth, maxRetries: 0, requestTimeoutMs: 15000 })` — one HTTP request per probe, ever.
- `probeAuth(client, { username }) → { status: 'ok'|'auth failed'|'role missing'|'unreachable'|'error', code?: string, httpStatus?: number, roles?: string[], hint?: string }`:
  - basic: `GET /api/now/table/sys_user?sysparm_limit=1&sysparm_fields=sys_id`. 200 → `ok`; 401 → `auth failed` (`AUTHENTICATION_FAILED`); 403 → `role missing` (`INSUFFICIENT_PRIVILEGES`, hint `The credentials are valid but the account cannot read sys_user over REST. On a PDI use the admin account; elsewhere ask for a role that grants sys_user read (itil or admin).`); network error → `unreachable` with the S02 code.
  - after `ok`, best-effort roles: `GET /api/now/table/sys_user_has_role?sysparm_query=user.user_name=<username>&sysparm_fields=role.name&sysparm_limit=200&sysparm_display_value=true`; a 403 here is tolerated (`roles: undefined`, hint `could not read roles`). Roles feed the review-screen annotations (S04): `admin` absent → WRITE/SCRIPTING lines get `account has no admin role — script and update-set writes may be refused by ACL`.
  - `oauth_ropc`: the token request (`POST /oauth_token.do`, `grant_type=password`) is the auth probe. Mapping of the JSON body's `error` field: `unsupported_grant_type` → `OAUTH_ROPC_DISABLED` (hint: `This instance has disabled the OAuth password grant (system property glide.oauth.inbound.ropc.grant_type.disabled = true — Security Center hardening). Use basic authentication, or ask the instance admin; the client-credentials grant is on the roadmap.`); `invalid_client` → `OAUTH_CLIENT_INVALID` (`Client ID or client secret rejected; the user password was not checked.`); `invalid_grant` / `access_denied` → `auth failed` (wrong username/password). The body-to-code table lives in `probes.ts` as data (`ROPC_ERROR_TABLE`) because ServiceNow's exact texts are captured, not assumed — S11 records them from a PDI with the property toggled and adds them to the fixture; until then the table carries the OAuth 2 RFC 6749 §5.2 error names above and a fallback `auth failed` with the raw `error` value in `detail`.
- `probeCapability(client, flag) → { flag, status, detail }` — read-only GETs, `sysparm_limit=1&sysparm_fields=sys_id`:

  | flag | request | `ok` when | other statuses |
  |---|---|---|---|
  | `WRITE_ENABLED` | `sys_update_set` | 200 | 403 → `role missing` |
  | `SCRIPTING_ENABLED` | `sys_script_include` | 200 | 403 → `role missing` |
  | `CMDB_WRITE_ENABLED` | `cmdb_ci` | 200 | 403 → `role missing` |
  | `ATF_ENABLED` | `sys_atf_test` | 200 | 403 → `role missing` |
  | `NOW_ASSIST_ENABLED` | `sys_properties?sysparm_query=nameSTARTSWITHsn_generative_ai` | 200 with ≥ 1 row | 200 with 0 rows → `not licensed` (`no Now Assist properties found — plugin absent or not licensed`); 403 → `role missing` |
  | `FLUENT_ENABLED` | local: resolve `@servicenow/sdk/package.json` from the checkout, then from `npm root -g` (spawn, 5 s timeout) | resolved | `not installed` (`@servicenow/sdk not found — npm i -g @servicenow/sdk`) |

  Each line the wizard prints carries the honesty note once, above the table: `Probes confirm the account can reach each table family; write ACLs are still evaluated per call.`
- `probeAll(client, ctx) → LastProbe` runs auth first; if auth is not `ok` the capability probes are `skipped`; otherwise all six run in parallel (five GETs + one local check). `toLastProbe()` maps to the store shape `{ at, auth, write, scripting, cmdb, atf, nowAssist, fluent }`. `probeAll` is the implementation of the `Probes.runAll(instance)` interface ARC-04-S12 declares in `src/doctor/` (stubbed there until this story lands); ARC-08-S04 task 1 binds it.
- Logging: the library never logs request headers; `REDACT_SENSITIVE_DATA` (ARC-04-S10) is on.

**Acceptance criteria.**
1. With a fake REST layer returning 200 for `sys_user`, `probeAuth` returns `ok` after exactly one request; with 401 it returns `auth failed` after exactly one request (assert the fake's call count — no retry); with 403, `role missing` with the hint text above.
2. With the fake returning 401 for `sys_user_has_role` after a 200 on `sys_user`, `probeAuth` still returns `ok` with `roles: undefined`.
3. For `oauth_ropc`, a token response `{"error":"unsupported_grant_type"}` yields `OAUTH_ROPC_DISABLED` with the property name in the hint; `{"error":"invalid_client"}` yields `OAUTH_CLIENT_INVALID`; `{"error":"invalid_grant"}` yields `auth failed`; a body with an unknown `error` yields `auth failed` and the raw value in `detail`.
4. `probeCapability` produces the table's statuses for 200 / 403 / (`sys_properties`) 200-empty; the FLUENT check returns `not installed` in a temp directory with no `@servicenow/sdk` and `ok` when a fixture package is placed on the resolution path.
5. `probeAll` with a failing auth returns six `skipped` capability results and makes no capability request.
6. `toLastProbe()` output validates against the store schema (ARC-04-S02's schema test) and contains no username or secret.
7. `probes.ts` satisfies ARC-04-S12's `Probes` interface (`runAll` = `probeAll`; a type-level test imports both), has no import from `src/cli/`, and `src/doctor/` can bind it without CLI code (ARC-08-S04 task 1).

**Tasks.**
1. Implement `probes.ts` with the request table and `ROPC_ERROR_TABLE` as data.
2. Fake REST layer for tests (`tests/helpers/fake-rest.ts`: route → status/body, call counter) — shared with S05/S06 tests.
3. Unit tests for criteria 1–6.
4. Bind `probeAll` to ARC-04-S12's `Probes.runAll` and export it through the package's `exports` map for ARC-08-S04.
5. Add the ROPC fixture placeholder `tests/fixtures/oauth-ropc-errors.json` (filled by S11).

**Test strategy.** Unit with the fake layer on all OSes; live behaviour in S11 (`RUN_LIVE_E2E=1`).

**Dependencies.** S02 (network classification for `unreachable`); ARC-04-S02 (schema), ARC-04-S03 (`FLAG_NAMES` — no literal flag names outside the preset module), ARC-04-S12 (`Probes` interface).

**Size.** M — 2 days.

**Risks / open points.** The NOW_ASSIST detection via `sn_generative_ai*` properties may show `ok` on an instance with the plugin but no licence — the line says "properties found" and the tools themselves report the licence error; recorded as a limitation in S10. Whether a 403 on `sys_user` can precede a valid login on hardened instances (REST ACL) is why the 403 path does not count toward the re-entry limit (S05).

**Definition of done.** Merged; tests green; ARC-08 can import; fixture placeholder present; probe vocabulary listed in `docs/MODES-AND-PRESETS.md` (S10).

---

### ARC-07-S04 — Preset proposal and the per-flag review screen (Propose → Review → Apply); prod cap in the wizard; `--yes` / `--preset` / `--flags`

> **Amendment 2026-09-10 (ARC-07-S04).** **Task 4 — wiring into the step order after `probeAll`
> and before the save — belongs to S05**, where `instance add` exists. This story ships the
> functions and proves AC 5, AC 7 and AC 8 at FUNCTION level: `resolveFlags()` returns the apply
> decision or the refusal with its exit code and text, and "writes nothing" is proven by a store
> spy whose emptiness is asserted as a precondition and again afterwards — S05 re-proves all three
> end to end. AC 8's defaults live in one exported constant (`ENTRY_DEFAULTS`) that S05 consumes,
> with a test that it matches ARC-04-S02's schema defaults rather than restating them.
>
> **The footer wraps.** The story's last screen line is 111 characters and the terminal budget is
> 100, so it wraps like a long probe hint — same rule, same reason: a terminal that folds a line
> mid-word is harder to read than one continuation. The two screens are rendered to
> `docs/snippets/review-screen-nonprod.txt` and `review-screen-prod.txt` for S10 to include
> byte-equal; the snapshot tests read those files, so the page and the wizard cannot drift.

**As** an individual practitioner **I want** the wizard to *propose* a preset for my instance, show me the six flags with what the probes found, let me toggle any of them or switch preset, and apply exactly what I see **so that** nothing is imposed (D-05, principle 10) and production stays read-only unless I take a separate, explicit step.

**Context.** D-05 as decided: for `pdi`/`dev`/`test` the proposal is `full`; "the user reviews a per-flag screen where each flag is pre-set ON and annotated with its live probe result, and may toggle any flag or switch preset before anything is saved. A failing probe changes only the recommendation text on that line, never the toggle. `read-only` remains the proposal for `prod`." `01` §6.3 gives the screen verbatim and the flag meanings; "for a `prod` instance the proposal is `read-only` and the review screen shows the write flags greyed out with the `--ack-prod` instruction". P-03 (all six flags always written), P-06 (one vocabulary), P-25 (`toolPackage` pinned `full`, `maxRecords` 100). README acceptance: "`--env prod --preset full` in the wizard is rejected with the D-05 explanation".

**Scope.** In: `packages/snowarch/src/cli/preset-ui.ts` (`proposePreset`, `renderReviewScreen`, `runReviewScreen`, `parseFlagsArg`); the interaction grammar; the dependency-rule dialogue; `--preset`, `--flags`, `--yes` semantics; unit tests driving the screen with scripted input. Out: preset expansion and the dependency rule themselves (ARC-04-S03 — this story calls `expandPreset()` and `applyDependencyRule()`, and adds `matchPreset(flags): 'read-only' | 'pdi-developer' | 'full' | 'custom'` to the same module, a pure comparison against `PRESETS`); the `set-preset --ack-prod` command (S06); the preset table text in docs (S10).

**Design notes.**
- `proposePreset(environment)`: `prod` → `read-only`; `pdi` | `dev` | `test` → `full`. `--preset <name>` on the command line replaces the proposal (still reviewed unless `--yes`); `--preset full` on `prod` is a policy refusal (below).
- Screen (non-prod): the `01` §6.3 block with one addition to its last line (` · "?" explains the flags`) and the probe annotations from S03:

  ```
  Proposed preset for "pdi" (pdi): full  — non-production: everything on
    [x] WRITE        probe: ok
    [x] CMDB_WRITE   probe: ok
    [x] SCRIPTING    probe: ok
    [x] ATF          probe: ok
    [x] NOW_ASSIST   probe: no Now Assist licence detected — tools will fail until licensed; keep on? (recommend: off)
    [x] FLUENT       probe: @servicenow/sdk not on PATH — keep on? (recommend: off)
  Enter = accept as shown · type a flag name to toggle · "preset <name>" to switch preset · "?" explains the flags
  >
  ```
  Annotation rules: `ok` → `probe: ok`; `role missing` → `probe: role missing — <hint>; keep on? (recommend: off)`; `not licensed` / `not installed` → the two lines above; `skipped` (only when `--no-probes` is passed by S08's import) → `probe: skipped`. The toggle is never changed by a probe result.
- Screen (prod):

  ```
  Proposed preset for "prod-acme" (prod): read-only  — production is capped at read-only (D-05)
    [ ] WRITE        locked on production
    [ ] CMDB_WRITE   locked on production
    [ ] SCRIPTING    locked on production
    [ ] ATF          locked on production
    [ ] NOW_ASSIST   locked on production
    [ ] FLUENT       locked on production
  Enter = accept · to raise this instance later: ./snowarch instance set-preset prod-acme <preset> --ack-prod
  >
  ```
  Typing a flag name here prints `WRITE is locked on production — raise it later with: ./snowarch instance set-preset prod-acme <preset> --ack-prod` and re-prompts.
- Grammar (line-based via `promptLine`, case-insensitive): Enter → accept; `<FLAG>` → toggle; `preset <name>` → re-render with that preset's flags (unknown name → list the four); `?` / `help` → the six flag meanings from `01` §6.3; `q` / Ctrl-C → `Cancelled — nothing saved.` exit 130.
- Dependency dialogue (rule enforced in the UI and again in the server, `01` §6.3): toggling `WRITE` off while `CMDB_WRITE` or `SCRIPTING` is on → `CMDB_WRITE and SCRIPTING require WRITE — turn them off as well? [Y/n]`; `n` keeps WRITE on. Toggling `CMDB_WRITE` or `SCRIPTING` on while WRITE is off → `SCRIPTING requires WRITE — turn WRITE on too? [Y/n]`; `n` leaves both off.
- Apply: the six toggles become six strings; `preset` is the matching named preset (`matchPreset`) or `custom`; the wizard prints `Applying: preset custom — WRITE=on CMDB_WRITE=on SCRIPTING=on ATF=on NOW_ASSIST=off FLUENT=off` before saving. `toolPackage: "full"` and `maxRecords: 100` are always written (P-25).
- Non-interactive: `--yes` skips the screen and applies the proposal (or `--preset`/`--flags`) verbatim, printing the same `Applying:` line; `--flags WRITE=on,CMDB_WRITE=on,SCRIPTING=off,ATF=on,NOW_ASSIST=off,FLUENT=off` (all six required, `on|off|true|false`) implies `--preset custom`; a dependency violation in `--flags` is exit 2 with the rule text; `--flags` without `--yes` still shows the screen seeded with those values.
- Policy refusal: `--env prod` with `--preset` ≠ `read-only` or with any `on` in `--flags` → exit 3:
  `PROD_WRITE_NOT_ACKNOWLEDGED — "prod-acme" is a production instance; the wizard caps production at read-only (D-05). Save it read-only now and raise it later with: ./snowarch instance set-preset prod-acme full --ack-prod`. Interactively the wizard then asks `Save "prod-acme" as read-only instead? [Y/n]`; with `--yes` it exits 3 without saving (CI must be explicit).

**Acceptance criteria.**
1. Given `environment: pdi`, `renderReviewScreen` output equals the non-prod block above for the given probe results (snapshot test), with all six boxes `[x]` even when NOW_ASSIST is `not licensed` and FLUENT is `not installed`.
2. Given scripted input `NOW_ASSIST`, `FLUENT`, Enter, the result is preset `pdi-developer` (matched), and the `Applying:` line reads `preset pdi-developer — WRITE=on CMDB_WRITE=on SCRIPTING=on ATF=on NOW_ASSIST=off FLUENT=off`.
3. Given input `WRITE`, `y`, Enter on the `full` proposal, the result has WRITE, CMDB_WRITE and SCRIPTING off (dialogue answered yes) and preset `custom`; given `WRITE`, `n`, Enter, all six stay on.
4. Given `environment: prod`, the screen shows six `[ ]` lines with `locked on production`, typing `WRITE` prints the locked message, and Enter yields `read-only` with all six `"false"`.
5. `instance add prod-acme --env prod --preset full --yes` exits 3 with the `PROD_WRITE_NOT_ACKNOWLEDGED` text and writes nothing; interactively the same command offers the read-only save and, on Enter, saves `read-only`.
6. `--flags WRITE=off,SCRIPTING=on,…` exits 2 with `SCRIPTING requires WRITE`; `--flags` with five entries exits 2 listing the missing flag.
7. `--yes` on a `pdi` instance with no `--preset` applies `full` (all six `"true"`) and prints `Applying: preset full — …` — a failing probe does not alter this (D-05).
8. Every written entry carries `toolPackage: "full"` and `maxRecords: 100`.

**Tasks.**
1. Implement `preset-ui.ts` on top of ARC-04-S03's module (`PRESETS`, `expandPreset`, `applyDependencyRule`, plus the new `matchPreset`); the six plain-language meanings printed by `?` are a constant in `preset-ui.ts`, and a test asserts they equal the six bullets of `docs/MODES-AND-PRESETS.md` §3 (hand-maintained from `01` §6.3 by ARC-02-S09). The snapshot test also asserts the three named expansions equal the `presets{}` block of `dist/contract.json` (ARC-04-S06).
2. Scripted-input test harness (`tests/helpers/scripted-tty.ts`) reusing S01's fake stream.
3. Unit tests for criteria 1–8 (snapshot for 1 and 4).
4. Wire into S05's step order (after `probeAll`, before save).

**Test strategy.** Unit with scripted input; snapshot of the two screens; no network.

**Dependencies.** S03 (probe results); ARC-04-S03 (`PRESETS`, `expandPreset`, `applyDependencyRule`, `checkProdPosture`); ARC-04-S06 (`dist/contract.json` `presets{}` for the cross-check).

**Size.** M — 2 days: the grammar is small, the dialogue cases and the snapshot fidelity are the work.

**Risks / open points.** Terminal width: lines are ≤ 100 characters; long probe hints wrap rather than truncate. The owner may later want NOW_ASSIST (read-side AI tools) allowed on `prod` — today D-05 caps all six; recorded as a future ruling, not implemented.

**Definition of done.** Merged; tests green; the two screens appear in `docs/MODES-AND-PRESETS.md` (S10) copied from the snapshot files, not retyped.

---

### ARC-07-S05 — `instance add` end to end: bounded credential re-entry, atomic 0600 save, secret-free summary, the `./snowarch instance` forwarder, exit codes

> **Amendment 2026-09-08 (from ARC-05-S06).** **`STORE_MODE_UNSAFE` is not a registry key — the
> condition is `STORE_PERMISSIONS_TOO_OPEN`** (ARC-04-S02's name, already carrying the exact `chmod`
> in its message). `STORE_IN_CLOUD_SYNC_FOLDER` is registered for the D-04 warning. Both are typed,
> so a literal that is not a registry key will not compile.

> **Amendment 2026-09-10 (ARC-07-S05).** Four departures, each with its reason.
>
> **(1) A policy refusal that the ARGUMENTS already decide happens FIRST.** `--env prod --preset
> full --yes` cannot end any way but exit 3, so asking for a password and spending a network round
> trip on the way there costs the user both for nothing — and sends one login attempt at a
> production instance that was never going to be saved. The interactive path keeps the refusal at
> the flags step, where there is somebody to offer the read-only save to.
>
> **(2) The server-dependency precondition RESOLVES the module rather than testing a fixed path.**
> `npm ci` hoists `@modelcontextprotocol/sdk` to the repository root in this workspace, so
> `packages/snowarch/node_modules/@modelcontextprotocol/sdk/package.json` does not exist on a
> correctly installed checkout — the forwarder refused to run on a machine where everything was
> fine. `createRequire(<package.json>).resolve(...)` asks the question Node will ask when the CLI
> starts, and answers correctly for hoisted and nested trees alike.
>
> **(5) The frame was parsing the pass-through's arguments** — found by the reviewer, not by
> the suite. The six forwarder tests are unit tests on the argv builder; none started a process,
> so the engine's own option parser ate `--yes` before the builder was ever called. The rework
> marks `instance` a RAW command in `tools/snowarch/lib/cli.mjs` and adds root-entry tests that
> spawn the launchers with real options (AC 11). A pass-through cannot be proved by a test that
> never passes anything through.
>
> **(3) B06's `--instance-file` path does NOT call `addInstance()`.** There is no interface comment
> naming it: ARC-06-S07 implemented that path directly (`probeAuth` + `completeFlags` +
> `saveStore`), and it is merged, tested and working. `addInstance()` exists here with the story's
> signature and is ready for it; rewiring a merged story's step is that story's change to make, not
> this one's, and doing it silently would alter behaviour nobody asked to alter. No B06 test was
> `todo` — none needed flipping.
>
> **(4) The spawned-CLI integration tests cannot reach a fake ServiceNow.** The URL rule is
> https-only (correctly), and a TLS fixture would mean either a committed private key — which this
> repository's own secret sweep would flag, rightly — or generating a certificate at test time on
> three operating systems. So the composition is proven IN-PROCESS with injected dependencies
> (24 tests, including every exit path and the store bytes), and the spawned CLI proves what only a
> process can: commander handing the sub-command its arguments intact, `--help` being the
> sub-command's, a secret on the command line refused before either parser sees it, and the policy
> exit taking neither the network nor the store. AC 1, AC 2 and AC 9's spawned form are the owner's
> sitting, beside AC 10.

**As** an individual practitioner with a PDI **I want** `./snowarch instance add pdi --url https://devNNNNN.service-now.com --env pdi --auth basic --preset pdi-developer --default` to ask for my username and password, prove the instance, let me review the flags, and save one 0600 file — or save nothing at all **so that** the instance is usable "with the right permissions" after one command (README goal; `01` §6.2 steps 6–7).

**Context.** README acceptance criteria 1, 2 and 5 (this story delivers 1 and 2 and the argv/history half of 5). P-23 ("Save anyway", default file mode, `npm link`), P-34 (no secret in argv/`~/.claude.json`), P-03 (six flags), D-04 (store location and modes), D-05 (proposal flow). `01` §6.2 step 7's exact strings: `AUTHENTICATION_FAILED — wrong username or password. Re-enter? (attempt 2 of 3)`; summary `Saved instance "pdi" (pdi · basic · preset pdi-developer · default). Probes: auth ok · write ok · scripting ok · cmdb ok · atf ok.` `01` §4.2 B06: the bootstrap invokes this command as its wizard step.

**Scope.** In: `packages/snowarch/src/cli/instance.ts` `add` sub-command (argument parsing, step order, re-entry loop, save, summary, exit codes), the programmatic entry `addInstance(opts, io)` used by ARC-06-S07's `--instance-file` path (its interactive B06 slot spawns the CLI instead), the `instance` forwarder in `tools/snowarch/bin/snowarch.mjs`. Out: maintenance commands (S06), `--global` (S07 adds the flag), the skill (S09), any client registration (`01` §5 — `.mcp.json` is committed; the wizard never runs `claude mcp add`).

**Design notes.**
- Synopsis: `./snowarch instance add <label> [--url <origin>] [--env pdi|dev|test|prod] [--auth basic|oauth_ropc] [--preset <name> | --flags <list>] [--default] [--global] [--password-stdin] [--no-probes] [--yes] [--replace]`. `--no-probes` (accepted here at ARC-09-S08's request, for CI fixtures): the S03 probes are skipped, `lastProbe` is written as `null`, the S04 review screen annotates every flag `probe: skipped (--no-probes)` and the summary line reads `Probes: skipped (--no-probes)`; never the default. Every missing non-secret value is *proposed and asked* (principle 10); with `--yes` a missing value that has no proposal is exit 2 (`ENV_REQUIRED`, `URL_REQUIRED`).
- Label: `^[a-z][a-z0-9_-]{0,31}$`; existing label → exit 2 `LABEL_EXISTS — "pdi" already exists. Use instance set-credentials / set-preset to change it, instance remove to delete it, or --replace.`
- Step order, printed as `[n/6]` headers:
  1. `[1/6] Instance URL` — S02 normalisation (proposal shown for bare subdomains); `[2/6] Environment` — S02 proposal or question; the `network:` line; reachability probe with the S02 failure menu.
  2. `[3/6] Authentication` — `Authentication?  [1] basic — username + password (recommended for PDI; no instance-side setup)  [2] oauth_ropc — OAuth password grant (legacy; needs client id + secret AND a user password; instances can disable it)` — `[1]` proposed. The label "legacy" is mandatory (D-04, P-38).
  3. `[4/6] Credentials` — `Username:` (`promptLine`), `Password:` (`promptSecret`); for `oauth_ropc` additionally `Client ID:` (echoed — it is an identifier) and `Client secret:` (masked). `--password-stdin` replaces the secret prompts (line 1 password, line 2 client secret); `Username:` is still asked unless `--username <u>` is given (a username is not a secret; allowed on argv).
  4. `[5/6] Probing` — S03 `probeAll`. Re-entry loop on `auth failed`: attempt counter starts at 1; message `AUTHENTICATION_FAILED — wrong username or password. Re-enter? (attempt 2 of 3) [Y/n]`; `n` → exit 1 `Nothing saved.`; after the third `auth failed`: `AUTHENTICATION_FAILED after 3 attempts — nothing saved. Check the account in the instance (System Security › Users) and run the command again.` exit 1. Exactly one login request per attempt (S03 guarantees `maxRetries: 0`). `role missing` on auth → the hint from S03, then `Try a different account? [y/N]` (counts toward the same limit of 3; default `N` → exit 1). `OAUTH_ROPC_DISABLED` / `OAUTH_CLIENT_INVALID` → the hint, then `Switch to basic authentication? [Y/n]` (Y restarts step 3 with `basic`, keeping the URL); `n` → exit 1. `unreachable` mid-probe → the S02 remedy, exit 1. With `--password-stdin` there is no re-entry: the first `auth failed` is exit 1. There is **no** "save anyway" anywhere.
  5. `[6/6] Permissions` — S04 review screen → `Applying:` line.
  6. Save through ARC-04-S02's `saveStore()`: `.local/` created 0700 if absent, temp file + `fsync` + rename, `chmod 0600` (skipped on Windows with the note `file modes: ACL-inherited (Windows)`); `--default` (or the first instance ever, proposed with `Make "pdi" the default instance for this checkout? [Y/n]`) sets `defaultInstance`; `lastProbe` written from S03. The S07 cloud-sync warning runs before the write.
  7. Summary (secret-free): `Saved instance "pdi" (pdi · basic · preset pdi-developer · default). Probes: auth ok · write ok · scripting ok · cmdb ok · atf ok · NOW_ASSIST off · FLUENT off.` then `Store: .local/instances.json (mode 0600, dir 0700)` and, unless `--from-bootstrap`, `Next: in Claude Code run  /snowarch setup-instance --resume  (or restart claude).` The probe list names the enabled flags' results and prints `off` for disabled ones.
- Programmatic entry: `addInstance({ label, url, environment, auth: { method, username, password, clientId?, clientSecret? }, preset|flags, makeDefault, global, yes: true }, io)` returns `{ saved: boolean, entry (masked), lastProbe, exitCode }` — ARC-06-S07's `--instance-file` path reads its 0600 store-shaped JSON and calls this (the exact call is already written in ARC-06-S07's B06 interface comment); the same story's interactive B06 slot spawns `dist/cli/index.js instance add --from-bootstrap` with `spawnSync(process.execPath, …, { stdio: 'inherit' })` and afterwards reads label/environment/preset back through the store module (`readDefaultLabel()` / `loadStore()`), never url/username/secret.
- Forwarder in `tools/snowarch/bin/snowarch.mjs` (`instance` → server package): preconditions — Node ≥ floor from `engine.config.json`; `packages/snowarch/dist/cli/index.js` present; server dependencies installed (`existsSync(join(pkgDir, 'node_modules/@modelcontextprotocol/sdk/package.json'))` — `tools/snowarch` is ESM, so no bare `require`). If not: `Live mode is not installed yet — run ./snowarch mode live (installs the server dependencies and starts the instance wizard).` exit 3. Then `spawnSync(process.execPath, [cliPath, 'instance', ...args], { stdio: 'inherit' })` (inherited stdio keeps the TTY so S01 raw mode works; `process.execPath` avoids Windows `.cmd` shims) and propagates the exit code. The forwarder never reads or writes the store. **Everything after `instance` is the server CLI's, unparsed**: the engine frame must not read those arguments, reject a flag it has no table for, or answer `--help` once a sub-command is named — only a bare `./snowarch instance --help` is the frame's own. (Added in rework: the frame parsed them, so `--yes` at the end of the line became `--yes needs a value` and the README command could not run through the launcher at all.)
- The argv the forwarder builds contains only what the user typed; a unit test asserts the builder has no code path that adds a secret.

**Acceptance criteria.**
1. On a clean macOS 14 machine after `./bootstrap.sh --mode live` up to B05, running the README command, typing a valid username and password, and pressing Enter on the review screen prints `Saved instance "pdi" (pdi · basic · preset pdi-developer · default). Probes: auth ok · write ok · scripting ok · cmdb ok · atf ok · NOW_ASSIST off · FLUENT off.`; `stat -f %Lp .local/instances.json` prints `600` and `.local` is `700`; the JSON has six flags as strings, `toolPackage: "full"`, `maxRecords: 100`, `prodWriteAck: false`, `defaultInstance: "pdi"`.
2. During that run, `ps -o args` (macOS/Linux) shows `node …/dist/cli/index.js instance add pdi --url … --env pdi --auth basic --preset pdi-developer --default` and nothing else; `history | tail -1` contains no password; the transcript of the terminal contains no password characters.
3. A wrong password produces exactly `AUTHENTICATION_FAILED — wrong username or password. Re-enter? (attempt 2 of 3) [Y/n]`, then `(attempt 3 of 3)`, then the "after 3 attempts — nothing saved" line, exit 1, and `.local/instances.json` does not exist (or is unchanged if it did); the fake REST layer counted exactly three login requests.
4. `--password-stdin` with a wrong password exits 1 after one request with no re-entry prompt.
5. `--env prod --preset full` behaves as S04 criterion 5 (exit 3 with `--yes`; read-only offer interactively).
6. An unreachable host exits 1 after the S02 menu's `abort`, with nothing saved; a `403` on `sys_user` prints the role hint and, on `N`, exits 1.
7. `LABEL_EXISTS` on a duplicate label without `--replace` (exit 2); with `--replace` the entry is overwritten and the old credentials are gone.
8. `./snowarch instance add …` without `node_modules` prints the "Live mode is not installed yet" line and exits 3 without spawning the server CLI; the same on Windows via `snowarch.cmd`.
9. Given `printf 'p\n' | node packages/snowarch/dist/cli/index.js instance add pdi --url https://dev1.service-now.com --env pdi --auth basic --preset pdi-developer --default --username u --password-stdin --yes` against the fake REST layer (200 everywhere), the process exits 0, stdout contains the `Saved instance` line and none of `Username:`, `Password:`, `> ` (no prompt was shown), and `addInstance()` called with the same values returns `{ saved: true, exitCode: 0 }` whose `entry.auth.username` is `u***` and whose `entry` has no `password` key.
10. On Windows the summary shows `file modes: ACL-inherited (Windows)` and the store is written under `.local\`.
11. Every option after `instance` reaches the server CLI unchanged **through each launcher on its OS** — the engine entry, `./snowarch`, and `snowarch.cmd` on Windows: `instance add <label> --url … --env prod --preset full --yes` exits 3 with the server's `PROD_WRITE_NOT_ACKNOWLEDGED` (not the frame's `needs a value`, not the forwarder's not-installed sentence) and writes no store; `instance add --help` prints the server's exit table (not the frame's one-line usage); `instance list` is the server's ARC-07-S06 refusal; a bare `instance --help` is the frame's. *(Added in rework. AC 8 covers the not-installed half only, which is why six green unit tests on the argv builder never noticed that no argument survived the trip.)*

**Tasks.**
1. Argument parsing and validation (label, options, mutual exclusions `--preset`/`--flags`).
2. Step functions 1–7 composed in `runAdd()`; `addInstance()` programmatic wrapper.
3. Re-entry loop with the exact strings; attempt accounting shared between `auth failed` and `role missing`.
4. Store write via ARC-04's module; Windows branch; `--from-bootstrap` flag.
5. Forwarder in `tools/snowarch/bin/snowarch.mjs` with preconditions and `stdio: 'inherit'`.
6. Unit/integration tests with the fake REST layer and scripted TTY: criteria 3, 4, 5, 6, 7, 9; argv-builder test for criterion 2.
7. Hand the `addInstance()` signature to ARC-06-S07 (its B06 slot and `--instance-file` path both live there).

**Test strategy.** Integration tests spawn the built CLI against the fake REST layer (an in-process HTTP server on `127.0.0.1` bound to a random port; `SNOW_STORE` pointing at a temp dir) on all three OSes; TTY behaviour scripted through S01's fake stream in-process. Criteria 1, 2 and 10 are E2E/manual (S11 and the ARC-00 Windows snapshot).

**Dependencies.** S01–S04; ARC-04-S02 (store), ARC-04-S03 (presets), ARC-04-S10 (redaction); ARC-06-S02 (`snowarch.mjs` skeleton with the `instance` placeholder) and ARC-06-S07 (B06 slot and `--instance-file`). ARC-06-S07 is interface-first — it ships the slot with a stub until this story lands and takes the `addInstance()` signature from task 7 — so the two stories are not circular.

**Size.** L — 3–4 days: composition plus the many exit paths, each with a test.

**Risks / open points.** `.local/config.json` (ARC-06-S05) carries `defaultInstance` as a **mirror only** — B07 copies it from the store through `readDefaultLabel()`; the store is authoritative (decided in ARC-06-S05; S06 `set-default` and `remove` refresh the mirror when the file exists). A PDI in hibernation looks like `CONNECTION_REFUSED`/`NETWORK_TIMEOUT` — the remedy names the wake-up.

**Definition of done.** Merged; integration tests green on the CI matrix; `docs/MODES-AND-PRESETS.md` walkthrough (S10) uses this story's real output; ARC-06 B06 wired; the ARC-08 doctor's "store entry has six flags" check passes on the produced file.

---

### ARC-07-S06 — `instance list · test · set-credentials · set-preset (--ack-prod) · set-flags · set-default · remove`

**As** an individual practitioner **I want** to see my instances without ever seeing a secret, re-test one, change its credentials or its permissions later, pick the default and remove one **so that** everything the wizard decided remains re-editable (principle 10) and production can be raised to write access only through the explicit D-05 path.

**Context.** `01` §6.2 "Maintenance: `./snowarch instance list` (label, environment, preset, last probe — never secrets), `test <label>`, `set-preset <label> <preset>`, `set-credentials <label>`, `remove <label>`"; `01` §6.3 also names `set-flags`. D-05: "raising it requires `./snowarch instance set-preset <label> <preset> --ack-prod` with the label typed, and the server refuses a `prod` instance with a write preset unless `prodWriteAck: true` is in the store" (server side: ARC-04-S03's `checkProdPosture`). README acceptance: "`set-preset prod full --ack-prod` asks for the label and then succeeds; the server loads it only then"; "`./snowarch instance list` output pasted into a chat contains no secret and a masked username". `01` §7 audit trail makes §2.1 provable — a preset raise is worth an audit line.

**Scope.** In: the seven sub-commands in `packages/snowarch/src/cli/instance.ts`; `--json` for `list` and `test`; `test --all --json` (the form ARC-06-S08's B08 invokes); the `--ack-prod` confirmation; audit lines for `set-preset`/`set-flags`/`set-credentials`/`remove`; tests. Out: `--global`/`--all` (S07 extends `list`); `import` (S08); switching the *active* instance at runtime (`snow_core_instance_switch`, ARC-04).

**Design notes.**
- `list [--json]` — table, one row per instance in the resolved store (S07 adds the store column):

  ```
  LABEL  ENV   AUTH        PRESET         DEFAULT  USER     LAST PROBE (2026-09-04 10:12 UTC)
  pdi    pdi   basic       pdi-developer  *        a***    auth ok · write ok · scripting ok · cmdb ok · atf ok
  uat    test  oauth_ropc  read-only               c***@corp.com   auth ok
  ```
  `--json`: `{ store: ".local/instances.json", defaultInstance, instances: [{ label, url, environment, auth: { method, username: "a***", secret: "set (len 12)" }, preset, flags, prodWriteAck, lastProbe }] }` — the masking rule is applied in the serializer, not the printer, so no code path can print a secret. Empty store → `No instances configured. Add one with: ./snowarch instance add <label> --url https://<host>` exit 0.
- `test <label> [--json]` — re-runs `network:` line, reachability, `probeAll`; rewrites `lastProbe`; prints the S05 probe line; exit 1 if auth is not `ok` (store otherwise untouched — credentials are never modified by `test`). `test --all --json` runs every instance of the resolved store sequentially and prints one object `{ store: <masked path>, instances: { "<label>": { auth, write, scripting, cmdb, atf, nowAssist, fluent, at } } }` — the shape ARC-06-S08 (B08) merges into `.local/doctor-last.json`; exit 1 if any instance's auth is not `ok`; `--all` without `--json` is exit 2.
- `set-credentials <label> [--auth basic|oauth_ropc] [--username <u>] [--password-stdin]` — `Username [a***]:` (Enter keeps the current), then the secret prompts; the S05 re-entry loop applies; saved only on `auth ok`; on success re-runs the capability probes and prints `Credentials updated for "pdi". Probes: …`. Changing `--auth` re-prompts for the fields that method needs and drops the others from the entry.
- `set-preset <label> <preset> [--ack-prod] [--confirm-label <label>] [--yes]`:
  - non-prod: shows the S04 review screen seeded with the preset (Enter applies; `--yes` skips the screen); prints `Applying:`; saves; audit line `{"ts":"…","instance":"pdi","environment":"pdi","tool":null,"actor":"cli","action":"set-preset","preset":"full","result":"ok"}` through ARC-04-S10's writer — same file (`<store dir>/audit.jsonl`), same `ts` / `instance` / `environment` / `result` keys and rotation; `actor` and `action` are CLI-only additions and `tool` is `null`. The writer's append function is exported from `src/audit/writer.ts` for this (a PR against ARC-04-S10 if it exposes only `readAuditTail`).
  - prod, preset ≠ `read-only`, no `--ack-prod` → exit 3: `PROD_WRITE_NOT_ACKNOWLEDGED — "prod-acme" is a production instance. To raise it: ./snowarch instance set-preset prod-acme full --ack-prod`.
  - prod with `--ack-prod`: prints `You are enabling WRITE (and CMDB_WRITE, SCRIPTING, ATF, NOW_ASSIST, FLUENT) on a PRODUCTION instance. Every write still needs an explicit "write approved" in Claude and is recorded in .local/audit.jsonl.` then `Type the instance label to confirm: `; mismatch → `Label mismatch — nothing changed.` exit 3; match → review screen (flags unlocked, all pre-set per the preset), `Applying:`, save with `prodWriteAck: true`, audit line with `"prodWriteAck":true`. Non-interactive: `--confirm-label prod-acme --yes` replaces the typed confirmation (the label is still typed — on the command line; documented for CI only).
  - prod back to `read-only` → `prodWriteAck` reset to `false`, audit line.
- `set-flags <label> FLAG=on|off […]` — partial updates allowed; dependency rule dialogue as S04; prod cap and `--ack-prod` exactly as `set-preset`; resulting `preset` = `matchPreset` or `custom`.
- `set-default <label>` — writes `defaultInstance`; mirrors it into `.local/config.json` when that file exists (ARC-06 B07); prints `Default instance is now "uat". The running server picks it up after snow_core_instances_reload (or /snowarch setup-instance --resume).`
- `remove <label> [--yes]` — `Remove instance "pdi"? This deletes its stored credentials from .local/instances.json. [y/N]`; if it was the default: `"pdi" was the default instance; the server will start unconfigured until you run set-default.`; audit line; `--yes` skips the question.
- All commands resolve the store exactly as the server does (ARC-04-S02's `resolveStorePath()`: `SNOW_STORE` → project → global) and print `store: <path>` when `--verbose`.

**Acceptance criteria.**
1. `list` on a store fixture with a basic and an ROPC instance prints the table above with masked usernames and no field of `password`/`clientSecret`; `list --json | grep -c <fixture password>` is 0 (the test greps for every secret in the fixture).
2. `test pdi` against the fake REST layer updates `lastProbe.at` and exits 0; with the fake returning 401 it exits 1 and the entry's credentials and `preset` are byte-identical before and after.
3. `set-credentials pdi` with a wrong password three times leaves the old credentials in place (`auth failed` never saves) and exits 1; with a right password it saves and re-probes.
4. `set-preset prod-acme full` exits 3 with the `PROD_WRITE_NOT_ACKNOWLEDGED` text; `set-preset prod-acme full --ack-prod` with typed `prod-acme` writes `preset: "full"`, six `"true"`, `prodWriteAck: true`, and appends one audit line; typed `prod` (mismatch) changes nothing and exits 3.
5. After criterion 4, starting `node packages/snowarch/dist/server.js` with that store loads `prod-acme` (ARC-04-S03's `checkProdPosture` rule); with `prodWriteAck` edited back to `false` the server logs `PROD_WRITE_NOT_ACKNOWLEDGED` and `snow_core_instances_index` lists it with `status: "not_loaded"` (this half is ARC-04-S03's test; this story adds the store fixture it needs).
6. `set-preset prod-acme read-only` resets `prodWriteAck` to `false`.
7. `set-flags pdi SCRIPTING=on` on an entry with WRITE off shows the dependency question; `set-flags pdi WRITE=on SCRIPTING=on` applies both and yields `preset: "custom"` unless the result equals a named preset.
8. `remove pdi --yes` deletes the entry; `list` then shows the "No instances configured" line; the audit line exists; a subsequent `add pdi` succeeds without `--replace`.
9. `set-default uat` updates `defaultInstance` and, when `.local/config.json` exists, its `defaultInstance` too.
10. `test --all --json` on a two-instance store against the fake REST layer prints exactly one JSON object keyed by both labels with the eight fields each, no `username`, no secret (grep), exits 0; with the fake returning 401 for one label it exits 1 and still reports both; `test --all` without `--json` exits 2.

**Tasks.**
1. Serializer (`packages/snowarch/src/cli/format.ts`) built on ARC-04-S02's `maskUsername()` / `maskPath()`, used by `list --json`, `test --json` and S07/S08.
2. Implement the seven commands; share the S05 credential loop and the S04 screen.
3. Audit-line emission through ARC-04's writer (`actor: "cli"`).
4. Tests: fixture store (with fake secrets that are grep-checked), fake REST layer, scripted input; criteria 1–4, 6–10; the fixture for criterion 5 handed to ARC-04-S03.
5. `--verbose` store path line; help text.

**Test strategy.** Integration tests against the fake REST layer and a temp `SNOW_STORE` on all three OSes; the secret-grep test scans every byte of stdout/stderr/JSON of every command in the suite.

**Dependencies.** S05 (loop, save, screen); ARC-04-S03 (`checkProdPosture` in the server), ARC-04-S10 (audit writer). Consumer: ARC-06-S08 invokes `instance test --all --json` (its text attributes the sub-command to "ARC-07 S05" — it is this story).

**Size.** M — 2 days.

**Risks / open points.** `--confirm-label` weakens the "typed" intent for automation; it is documented as CI-only and the audit line records `"confirmedVia":"flag"` vs `"prompt"`. `.local/config.json.defaultInstance` is a mirror of the store (decided in ARC-06-S05); this story refreshes it on `set-default` and `remove`.

**Definition of done.** Merged; tests green; `docs/MODES-AND-PRESETS.md` "Maintenance" section (S10) lists the seven commands with their exact prompts; ARC-08-S06's `--fix` for "fewer than six flags" reuses `set-flags` internals or the store module — agreed in ARC-08-S06.

---

> **Amendment 2026-09-10 (ARC-07-S06).** Eight departures and findings, each with its reason.
>
> **(1) `test --json` prints the SAME envelope as `test --all --json`** — `{ store, instances: {
> "<label>": { … } } }` with one key. The story specifies the shape for `--all` only; giving the
> single form a different one would make ARC-06-S08's merge (`probes[label] = JSON.parse(stdout)`)
> depend on which flag produced the output, and a consumer that must ask "how many did I request?"
> before reading a result is one that will get it wrong once.
>
> **(2) `test` records `lastProbe` even when the probe FAILED.** A failed probe is the fact the
> doctor needs, and a store that only remembered good news would report a broken instance as
> healthy for as long as it stayed broken. AC 2's requirement is met exactly as written: the
> credentials and the preset are byte-identical after a 401, and the test asserts that field by
> field rather than on the file as a whole.
>
> **(3) `test` requires a label or `--all`** — it does not fall back to `defaultInstance`. Every
> other sub-command here names its instance, and a `test` that silently probed a different one
> would be the only command in the set whose subject you cannot read off the command line.
>
> **(4) ROPC was unusable and is fixed here.** `probeAuth` refuses an `oauth_ropc` run with no
> `tokenProbe`, and ARC-07-S05 never passed one — so with probes on, `instance add --auth
> oauth_ropc` could not succeed AT ALL: the error was neither `ok` nor `unreachable`, so it fell
> through to the wrong-password branch and exhausted three attempts. Found by this story's
> `set-credentials --auth oauth_ropc` test. `probeOptionsFor()` now supplies a probe that says
> "the request that follows IS the token exchange", which is the truth of this client — it
> acquires the ROPC token inside its first request, so a separate token call would be a SECOND
> login attempt against S03's one-request-per-probe rule. What is lost is the four-way ROPC error
> table's extra specificity, which needs a real token endpoint to distinguish; it is on the
> owner-sitting list.
>
> **(5) The production cap gained ONE door.** The S04 screen locks every box on a `prod` instance,
> so "review screen (flags unlocked, all pre-set per the preset)" needed a way in:
> `prodAcknowledged` on `ScreenInput`/`ResolveInput`, set by exactly one caller — the branch that
> has already printed the warning and read the label back. The wizard never sets it and no flag
> reaches it from `instance add`.
>
> **(6) The dependency dialogue is S04's, exported rather than copied.** `toggle` became
> `toggleFlag` so `set-flags` asks the same question the review screen asks, in the same words.
>
> **(7) There were two username maskers, and now there is one.** ARC-04-S02's keeps the domain
> (`c***@corp.com`); the copy S05 wrote in `instance.ts` dropped it. The store's own is
> re-exported, so the wizard's summary and `list` cannot mask the same account two ways. The
> visible change: an email-shaped username now keeps its domain in the wizard's summary too.
>
> **(8) ARC-06-S08 invokes `instance test <label> --json` per label**, not `--all --json` as the
> brief describes; both forms work and both are tested. The `--all` form remains the one the story
> specifies for the doctor cache.

### ARC-07-S07 — `--global` store, project-wins precedence messaging, cloud-sync-folder warning (D-04)

**As** an individual practitioner with one personal PDI and several engagement checkouts **I want** to keep that PDI in a per-user store while engagement instances stay per checkout, be told plainly which store wins when both hold a label, and be warned when a checkout sits inside OneDrive/Dropbox/iCloud/Google Drive **so that** the D-04 at-rest policy and the confidentiality firewall are both respected.

**Context.** D-04: per-checkout store is deliberate ("one engagement = one checkout = one store"); "the wizard and the doctor must WARN when the checkout path lies under a known cloud-sync folder (OneDrive, Dropbox, iCloud Drive, Google Drive), because 0600 does not prevent sync". `01` §7: optional global store `~/.config/snowarch/instances.json` (`%APPDATA%\snowarch\instances.json` on Windows) via `instance add --global`; "the project store wins when both exist; they are never merged". ARC-04-S02 implements the precedence in the server (`resolveStorePath()`) and already exports a boolean `isUnderCloudSyncFolder(p)`; ARC-06-S05 has a stdlib `lib/cloud-sync.mjs` for the bootstrap's B01 WARN and ARC-08-S03's E-25 re-implements the same regex — this story makes the CLI say the precedence out loud and turns the three detectors into one provider list.

**Scope.** In: `--global` on `add`, `set-*`, `remove`, `import`; `list --all` with a `STORE` column; the precedence note; `detectCloudSync(path)` added to ARC-04-S02's `src/store/paths.ts` next to `isUnderCloudSyncFolder()` (which becomes `detectCloudSync(p) !== null`) — not a new CLI module; the shared fixture `packages/snowarch/tests/fixtures/cloud-sync-paths.json` that ARC-06-S05's `lib/cloud-sync.mjs` and ARC-08-S03's E-25 parity-test against; the WARN text and confirmation; tests with synthetic paths. Out: merging stores (never); moving entries between stores (`instance move` is not in 2.0.0 — remove + add).

**Design notes.**
- Global path: `process.platform === 'win32'` → `%APPDATA%\snowarch\instances.json` (ARC-04-S02's `APPDATA` fallback rule applies); otherwise `${XDG_CONFIG_HOME:-~/.config}/snowarch/instances.json` (XDG honoured as a small addition to `01` §7, implemented by this story's PR inside ARC-04-S02's `resolveStorePath()` — not in CLI code). Directory 0700, file 0600, same schema, same `saveStore()`.
- Precedence note (printed by `add --global`, `list --all`, and `instance test` when relevant): `Note: "pdi" exists in both the project store (.local/instances.json) and the global store (~/.config/snowarch/instances.json). The server uses the project store for this checkout; the global entry is ignored here.`
- `list` without `--all` shows the store the server would use (project if it exists, else global) and a footer `(+ 1 instance in the global store — ./snowarch instance list --all)` when the other store is non-empty.
- `detectCloudSync(absPath) → { provider: 'OneDrive'|'Dropbox'|'iCloud Drive'|'Google Drive', root } | null`: checks the path's ancestors against (a) Windows environment roots `OneDrive`, `OneDriveCommercial`, `OneDriveConsumer` when set; (b) directory-name patterns anywhere in the ancestry: `OneDrive`, `OneDrive - *`, `Dropbox`, `Google Drive`, `GoogleDrive`, `My Drive`, `iCloud Drive`, `iCloudDrive`; (c) macOS mounts `~/Library/Mobile Documents/com~apple~CloudDocs` (iCloud) and `~/Library/CloudStorage/<Provider>-*` (where macOS mounts OneDrive/Dropbox/Google Drive — no `01`/`03` citation; confirmed on the macOS test machine in task 5). Symlinks resolved with `fs.realpathSync` before matching. This extends ARC-04-S02's regex (`/^(OneDrive|Dropbox|Google Drive|GoogleDrive|iCloud Drive|Mobile Documents)$/i`) — the fixture file is the single list all three implementations must satisfy.
- WARN text (before any store write, and in `add`, `set-credentials`, `import`):
  `WARN STORE_IN_CLOUD_SYNC_FOLDER: this checkout is under OneDrive (C:\Users\me\OneDrive - Corp\work\ai-servicenow-architect). File mode 0600 does not stop synchronisation — the credential store would be uploaded to that service. Options: move the checkout outside the synced folder, or keep credentials in the global store with --global (…\AppData\Roaming\snowarch is not synced by default).` then `Continue and write the store here anyway? [y/N]` (default No; `--yes` continues and keeps the WARN in the output and in the `--json` `warnings[]`). The global store path is itself checked; if it is also synced (custom `XDG_CONFIG_HOME`), the WARN says so and offers nothing else.
- The server's SV-02 (ARC-04-S12) calls the same function; the engine's E-25 (ARC-08-S03) and the bootstrap's B01 (ARC-06-S05) are stdlib re-implementations that pass the same fixture file — so the doctor, the bootstrap and the wizard agree on the provider list.

**Acceptance criteria.**
1. `instance add pdi --global … --yes --password-stdin` writes `~/.config/snowarch/instances.json` (Linux/macOS; `$XDG_CONFIG_HOME` honoured when set) or `%APPDATA%\snowarch\instances.json` (Windows) with mode 0600 (POSIX) and does not create `.local/instances.json`.
2. With `pdi` in both stores, `list --all` shows two rows with `STORE` = `project` and `global` and prints the precedence note; `list` shows only the project row plus the footer; `snow_core_status_read` of a server started in that checkout reports `store.source: "project"` and `instances.loaded: ["pdi"]`.
3. `detectCloudSync` returns the provider for `/Users/me/Library/CloudStorage/OneDrive-Corp/work/x`, `/Users/me/Library/Mobile Documents/com~apple~CloudDocs/x`, `C:\Users\me\OneDrive - Corp\x`, `/home/me/Dropbox/x`, `/home/me/Google Drive/My Drive/x`, and `null` for `/home/me/work/x` and `C:\Users\me\AppData\Roaming\snowarch` — unit-tested with synthetic paths and a stubbed `realpath`/env; these cases are the rows of `tests/fixtures/cloud-sync-paths.json`, and ARC-06-S05's and ARC-08-S03's parity tests read that file.
4. Given a checkout under a synced folder, `instance add … ` (interactive) prints the WARN and, on Enter (default No), exits 3 with nothing written; with `y` it writes and the summary still carries the WARN line; with `--yes` it writes and `--json` output carries `warnings: ["STORE_IN_CLOUD_SYNC_FOLDER"]`.
5. Stores are never merged: removing `pdi` from the project store makes the global `pdi` the one the server uses (ARC-04 precedence), and `list` explains the change with the footer.

**Tasks.**
1. Global path resolution shared with the server's store module (one function, ARC-04-S02's `resolveStorePath()` — do not duplicate).
2. `detectCloudSync()` in `src/store/paths.ts` with the pattern list as data; the fixture file; used by ARC-04-S12's SV-02 and parity-tested by ARC-06-S05 / ARC-08-S03.
3. `--global` flag plumbing on the commands; `list --all` column; precedence note; footer.
4. WARN + confirmation in the write path of `add`, `set-credentials`, `import`.
5. Unit tests for criterion 3; integration tests for 1, 2, 4, 5 with `HOME`/`APPDATA`/`XDG_CONFIG_HOME` pointed at temp dirs.

**Test strategy.** Unit + integration on the three OSes with redirected home/appdata variables; no real cloud folders needed.

**Dependencies.** S05, S06; ARC-04-S02 (`paths.ts` — precedence, `isUnderCloudSyncFolder`); consumers: ARC-04-S12 (SV-02), ARC-06-S05 (`lib/cloud-sync.mjs`) and ARC-08-S03 (E-25) through the fixture file.

**Size.** M — 1–1.5 days.

**Risks / open points.** Enterprise "Known Folder Move" redirects `Desktop`/`Documents` into OneDrive without the word `OneDrive` in the path shown to the user — the `OneDrive*` environment roots catch it on Windows; on macOS a redirected `~/Documents` is not detected (documented limitation in S10). Q-A: a shared/team store is a roadmap ARC; `--global` is per user, not per team.

**Definition of done.** Merged; tests green; ARC-06-S05's and ARC-08-S03's parity tests pass against `cloud-sync-paths.json`; `docs/MODES-AND-PRESETS.md` "Where credentials live" section (S10) written from this story.

---

> **Amendment 2026-09-10 (ARC-07-S07).** Eight departures and findings.
>
> **(1) A FIFTH provider value.** The story names four; `detectCloudSync` also returns
> `CloudStorage (unknown provider)`. macOS mounts every vendor under
> `~/Library/CloudStorage/<Provider>-<tenant>`, so a vendor the table does not name is still a
> synced folder — and ARC-04-S02's boolean already answered `true` for exactly those paths.
> Dropping the case would have made the rewrite less truthful than the function it replaced;
> saying "synced, and I cannot tell you by whom" is more use than saying nothing.
>
> **(2) The engine and the server shared an ordering bug, found by the fixture's first row.**
> `~/Library/CloudStorage/OneDrive-Corp/…` is both a CloudStorage mount and a OneDrive one, and
> both implementations answered with the mount because `CloudStorage` sat above `OneDrive` in the
> table and `Library` comes first in the path. Named vendors are matched across the whole path
> FIRST in both now. ARC-06-S05's parity test reads
> `packages/snowarch/tests/fixtures/cloud-sync-paths.json` and its six inline rows are gone into
> it; it asserts WHETHER exactly and WHICH wherever a vendor is named, because the engine keeps
> its own longer wording for an unnamed mount.
>
> **(3) `add --json` had no shape, so it has this one:** `{ saved, label, store, default,
> instance, lastProbe, warnings }` — the same envelope discipline as `list --json` and `test
> --json`, with the masked entry and never the stored one.
>
> **(4) `--json` suppresses the step lines.** `[1/6] Instance URL` printed above an object makes
> the object unparseable, and `test --json` already promised a caller one object on stdout.
>
> **(5) `warnings[]` carries the CODE**, not the sentence: a caller matching on prose is a caller
> that breaks when the prose improves. The sentence is on screen in the human form, before the
> save AND after it.
>
> **(6) The WARN is the REGISTRY's text now.** `STORE_IN_CLOUD_SYNC_FOLDER`'s `meaning` and
> `remedy` carry `<provider>`, `<root>` and `<global>`, and `fillMeaning()` joins `fillRemedy()` so
> both halves of one entry are filled by one substitution. When the global store is itself synced,
> or `--global` is already in use, the remedy's `--global` clause is dropped — offering somebody a
> place with the same problem is advice that cannot be taken.
>
> **(7) The `.env.example` allow-list ceiling moved 20 → 24**, deliberately: `XDG_CONFIG_HOME` and
> the three `OneDrive*` roots are operating-system variables this package reads and must not tell
> a reader to set in a project `.env`. Each is spelled out with its reason, which is what the test
> actually enforces; the ceiling is a brake, not a budget.
>
> **(8) A vitest worker does not run the pool's exit handler.** ARC-07-S06's fixture sweep covers
> the engine's `node --test` processes; on the server side a file's fixtures must be removed in
> its own `afterEach`, or they survive the run. Thirteen `instance-global-*` directories in a
> private `TMPDIR` is how that was found.
>
> **On the documented limit:** a macOS `~/Documents` redirected into a sync client is still
> undetectable — there is no environment variable to read, and the path says nothing. The story
> already records it; nothing here improves it.

### ARC-07-S08 — `instance import --from-legacy`: dry-run plan, field and flag mapping, explicit `FLUENT_ENABLED`, prod cap, deletion advice

**As** an existing snow-mcp user **I want** one command that reads my old `~/.config/servicenow-mcp/instances.json`, shows me what it will create, migrates the entries with their flags into the new store, and tells me what to delete **so that** the cutover (ARC-10) does not leave a plaintext copy behind or re-type anything.

**Context.** README deliverable "`import --from-legacy` (reads `~/.config/servicenow-mcp/instances.json`, migrates, advises deletion — used by ARC-10)"; acceptance "migrates a legacy wizard store entry (fixture) including its flags and adds explicit `FLUENT_ENABLED: "false"`". P-23 (FLUENT never written by the old wizard), P-34/R-07 (legacy copies), P-25 (`toolPackage` values other than `full`). The legacy shape is `snow-mcp/src/cli/config-store.ts:13-51` (`name`, `instanceUrl`, `authMethod: 'basic'|'oauth'`, `username`, `password`, `clientId`, `clientSecret`, `authMode`, `writeEnabled`, `scriptingEnabled`, `cmdbWriteEnabled`, `atfEnabled`, `toolPackage`, `nowAssistEnabled`, `integrationMode`, `mcpEnabled`, `sdkEnabled`, `apexEnabled`, `aiProvider`, `aiModel`, `aiApiKey`, `aiBaseUrl`, `group`, `environment`, `addedAt`; file `{ version, defaultInstance, instances }`). Environment values written by the old wizard: `production`, `development`, `test`, `staging`, `pdi` (`setup.ts:479-488`). The old per-user token file `tokens.json` (`auth.ts:29-33`) is also in that directory. The server itself never reads the legacy path any more (ARC-04-S02); the ARC-08 doctor (E-24, ARC-08-S03) prints this command when it finds the directory.

**Scope.** In: `instance import --from-legacy [--path <file>] [--dry-run] [--yes] [--global] [--only <label,…>]`; mapping rules; probing of imported entries; the plan output; the deletion advice; a fixture-based test. Out: importing `~/.claude.json` env blocks (the ARC-08 detector prints `claude mcp remove` commands; the credentials there are re-entered with `instance add` — importing them would mean parsing a file `01` §7 says the product never reads); importing `tokens.json` (advised for deletion only); deleting anything (the user does it).

**Design notes.**
- Mapping per legacy entry:
  - `name` → label (lowercased, normalised to `^[a-z][a-z0-9_-]{0,31}$` — ARC-04-S02's schema; a name starting with a digit gets the prefix `i-` with a note; collisions with existing labels → `skipped: label exists (use --only and remove first, or rename manually)`);
  - `instanceUrl` → S02 `normalizeInstanceUrl`; a `/api` suffix (the old auto-fix) is stripped with the note `"/api" removed from URL`; an invalid URL → skipped with the reason;
  - `authMethod` `basic` → `basic`; `oauth` → `oauth_ropc` (requires `clientId`, `clientSecret`, `username`, `password` all present, else skipped: `oauth entry incomplete`); `authMode` other than `service-account` → note `per-user/impersonation mode is not carried (removed in 2.0.0)`;
  - `environment`: `production` → `prod`; `development` → `dev`; `test` → `test`; `staging` → `test` (note `staging mapped to test`); `pdi` → `pdi`; absent → S02 proposal from the URL, else *asked* (`--yes` → `skipped: environment unknown — add it with instance add --env …`);
  - flags: `writeEnabled` → `WRITE_ENABLED`, `cmdbWriteEnabled` → `CMDB_WRITE_ENABLED`, `scriptingEnabled` → `SCRIPTING_ENABLED`, `atfEnabled` → `ATF_ENABLED`, `nowAssistEnabled` → `NOW_ASSIST_ENABLED`, each `true` → `"true"`, anything else → `"false"`; `FLUENT_ENABLED: "false"` always (never present in legacy); ARC-04-S03's `applyDependencyRule` applied (`CMDB_WRITE`/`SCRIPTING` on with WRITE off → forced off with a note); `preset` = S04's `matchPreset(flags)`;
  - `prod` with any write flag → imported as `read-only`, `prodWriteAck: false`, note `production capped at read-only (D-05) — raise with: ./snowarch instance set-preset <label> <preset> --ack-prod`;
  - `toolPackage` → always `"full"` (note when the legacy value differed: `tool package "<x>" not carried — 2.0.0 uses full (P-25)`); `maxRecords: 100`;
  - dropped silently-but-listed: `group`, `integrationMode`, `mcpEnabled`, `sdkEnabled`, `apexEnabled`, `aiProvider`, `aiModel`, `aiBaseUrl`, `addedAt`; **`aiApiKey`** listed as `dropped: aiApiKey (a secret — not carried; delete the legacy file)` — its value is never printed;
  - `defaultInstance` → carried if that label was imported and the target store has no default.
- Legacy store location (default `--path`): `join(homedir(), '.config', 'servicenow-mcp', 'instances.json')` on **every** OS — the old code used `homedir()/.config` on Windows too (`snow-mcp/src/cli/config-store.ts:97-103`), so the Windows default is `%USERPROFILE%\.config\servicenow-mcp\instances.json`, never `%APPDATA%`; ARC-08 E-24 checks the same path and prints this command.
- Plan output (always printed; `--dry-run` stops here; otherwise `Proceed? [Y/n]` unless `--yes`):

  ```
  Legacy store: ~/.config/servicenow-mcp/instances.json (2 instances)
  Target store: .local/instances.json
    pdi    https://dev12345.service-now.com  pdi   basic       → preset pdi-developer   notes: FLUENT set to off
    prod   https://acme.service-now.com      prod  oauth_ropc  → preset read-only       notes: production capped at read-only (D-05); staging→test n/a; dropped: group, aiApiKey (secret)
  Each imported instance is probed before it is saved; an entry whose credentials fail is not saved.
  ```
- Probing: S03 `probeAll` per entry; `auth failed` / `unreachable` → `skipped: <reason> — add it fresh with: ./snowarch instance add <label> --url <url> --env <env>`; `ok` → saved (S07 cloud-sync WARN applies once for the run). Imported entries go through the S04 review screen unless `--yes` (principle 10 — the migrated flags are the *proposal*).
- Closing advice (always): `Imported 1 of 2. The legacy files were left in place. When you are satisfied, delete them: rm -r ~/.config/servicenow-mcp   (contains instances.json and tokens.json with plaintext secrets). Then remove stale Claude Code registrations: ./snowarch doctor lists the exact claude mcp remove commands.` (Windows: `Remove-Item -Recurse $HOME\.config\servicenow-mcp`).

**Acceptance criteria.**
1. With the fixture `tests/fixtures/legacy-instances.json` (two entries as in the plan above, fake secrets), `import --from-legacy --path <fixture> --dry-run` prints the plan exactly and writes nothing.
2. `… --yes` against the fake REST layer (200 for both) writes both entries: the PDI one with `preset: "pdi-developer"`, six flags including `FLUENT_ENABLED: "false"`, `toolPackage: "full"`, `maxRecords: 100`; the prod one with `preset: "read-only"`, six `"false"`, `prodWriteAck: false`; `defaultInstance` carried; no `aiApiKey`, `group` or `authMode` key anywhere in the new store; stdout contains none of the fixture's secret values (grep).
3. With the fake returning 401 for the prod entry, only the PDI entry is saved and the summary says `Imported 1 of 2` with the `skipped: auth failed` line and the `instance add` suggestion.
4. A legacy `instanceUrl` ending in `/api` is imported with the origin and the `"/api" removed` note; an `environment: staging` maps to `test` with the note; a `production` entry with `writeEnabled: true` is capped with the D-05 note.
5. Re-running the import reports both labels as `skipped: label exists` and changes nothing.
6. The closing advice names `~/.config/servicenow-mcp` and `tokens.json` and never executes a delete.

**Tasks.**
1. Legacy reader with a tolerant schema (unknown keys listed, not fatal); the mapping table as data.
2. Plan renderer; `--dry-run`; `Proceed?`; `--only`.
3. Probe-then-save loop reusing S04/S05; the WARN hook from S07.
4. Fixture + tests for criteria 1–6.
5. Text for `docs/MIGRATION.md` handed to ARC-10-S01 (the command, the plan sample, the deletion step).

**Test strategy.** Integration with the fixture and the fake REST layer on all OSes (Windows path form of the advice included). Live: S11 runs the import against the real PDI with a generated legacy file.

**Dependencies.** S04, S05, S07; ARC-04-S02 (the server no longer reads the legacy path — otherwise the import would be redundant); ARC-08-S03 (E-24) prints this command — its text cites ARC-07-S08 correctly today, so the correction this line called for was already made; ARC-10-S01 documents it.

**Size.** M — 1.5 days.

**Risks / open points.** Legacy files written by the Electron app (`desktop/main/config-store.ts`, D-03 cut) use the same JSON shape with `writeEnabled` defaulted to `true` — imported entries therefore often arrive all-write; the review screen shows exactly that and the prod cap protects production. Users who only ever registered through `claude mcp add -e …` have no legacy file — the doctor's other detector covers them.

**Definition of done.** Merged; tests green; ARC-10's `docs/MIGRATION.md` step references the command; the ARC-08 legacy-store detector prints it verbatim.

---

> **Amendment 2026-09-10 (ARC-07-S08).** Nine departures and findings.
>
> **(1) One `notes:` clause per entry, WRAPPED.** The story's plan sample joins an entry's notes
> into a single clause, and the production entry's notes come to three hundred characters. They are
> joined as written and wrapped at the review screen's own 100-column budget (S04's `wrapText`,
> reused not retyped): the notes are the part a reader has to act on, and a terminal folding them
> mid-word is where they stop reading.
>
> **(2) The committed fixture has TWO entries** — AC 2 and AC 3 count them ("writes both",
> "Imported 1 of 2"). The `staging → test` case of AC 4 gets its own legacy file, written in the
> test, rather than a third row that would change both those numbers.
>
> **(3) The reader accepts both container shapes.** The story documents an array of entries each
> carrying `name`; some 1.x files hold a record keyed by label instead. Rejecting one of them would
> send a user to a hand-edit for a difference the reader can absorb in three lines.
>
> **(4) The legacy field names are DERIVED, not listed.** `WRITE_ENABLED` → `writeEnabled`,
> `NOW_ASSIST_ENABLED` → `nowAssistEnabled` — the old wizard's names are the lower-camel form of
> the same words. Listing the five would have put flag literals in `src/cli/`, which the sweep
> ARC-07-S04 left behind forbids; it caught exactly that, in this file, on the first run.
>
> **(5) Two registry codes, not three.** `LEGACY_STORE_NOT_FOUND` and `LEGACY_STORE_UNREADABLE`
> are registered because the command prints them. `IMPORT_NOTHING_TO_DO` is not: nothing prints it
> — a run with nothing to import prints the plan and `Imported 0 of N`, which says the same thing
> in words the reader already has.
>
> **(6) `targetStore()` is now shared.** S06's `openStore` computed the path and the source
> privately; `import` asks the same question, so the resolution moved out to one exported function
> rather than being repeated. That is the same defect S07's review found, prevented rather than
> repaired.
>
> **(7) The citation this story asked to correct was already correct.** ARC-08-S03's E-24 text
> cites ARC-07-S08 today. What IS corrected in that story instead is E-25's pointer: it named
> "ARC-04-S02's fixture list", which does not exist — the list is
> `packages/snowarch/tests/fixtures/cloud-sync-paths.json`, created by ARC-07-S07, and it carries
> the provider as well as the boolean.
>
> **(8) The snippet names ARC-10's migration document by its STORY, not by a path.**
> `docs/MIGRATION.md` does not exist yet, and `tests/fixtures/forthcoming-paths.json` — the
> allow-list for exactly that — records an empty list as its intended resting state and its SK-10
> test requires an entry to suppress a hit in that check's own scan, which a `docs/snippets/` file
> does not produce. Naming the story is both accurate and free.
>
> **(9) The "not available in this build" example is now `move`.** It was `list` until S06, then
> `import` until this story. `move` is the one the story says is NOT in 2.0.0 — remove and add
> instead — so the example cannot be overtaken by the next story.

### ARC-07-S09 — `/snowarch setup-instance` skill body: prerequisite check, three `AskUserQuestion`s, printed command per OS, `--resume` with reload + doctor, S-02 fallback

**As** an individual practitioner inside Claude Code **I want** `/snowarch setup-instance` to collect every non-secret choice in chat, hand me one exact command to run in my own terminal, and — after I type "done" or `/snowarch setup-instance --resume` — make the new instance live in the same session with the authoritative `Mode:` line and the write-gate reminder **so that** the only interruption is the credential hand-off, and it never leaves me without a next step (D-06 hedge).

**Context.** `01` §6.2 steps 1–9 (the skill flow) and §6.1 (secrets never through `AskUserQuestion`, elicitation or Bash); D-06: "the `/snowarch setup-instance` skill must guide the user through the terminal hand-off for credentials from inside Claude (say exactly what to type, wait, resume)"; R-2 (`/snowarch` with sub-commands; the ARC-02-S11 skeleton is a single `.claude/skills/snowarch/SKILL.md` that branches on `$ARGUMENTS`); the minor fold `version:` under `metadata.version`. README acceptance: "never asks for a password, prints a command identical to the one a user would type by hand, and `--resume` ends with `Mode: live — pdi (pdi) · preset pdi-developer · …` **without** restarting the session (S-02; fallback text otherwise)"; "`allowed-tools` limited to the doctor command and the four core MCP tools"; the command is printed "in the OS-appropriate form (`./snowarch …` on macOS/Linux/Git Bash, `snowarch.cmd …` in PowerShell/cmd)". Platform facts: `01` §4.1 — the skill's shell commands run through Claude's Bash tool, which needs Git Bash on Windows; `01` §4.3/S-09 — `.mcp.json` and settings are read at session start, so a checkout still in design-only mode needs `./snowarch mode live` and a restart; S-16 — `Bash(./snowarch doctor*)` in the committed `permissions.allow` runs without prompts after trust (fallback: `allowed-tools`); S-02 — `list_changed` after `snow_core_instances_reload` (fallback: `/mcp` reconnect).

**Scope.** In: the `setup-instance` section of `.claude/skills/snowarch/SKILL.md` (the `status` and `doctor` sections belong to ARC-08-S09 / ARC-02-S11); the four MCP entries appended to the frontmatter's `allowed-tools`; two VALIDATION-TESTS entries; the `--json --section prereqs` fields this skill needs from the doctor (agreed with ARC-08-S01). Out: any secret input; any Bash beyond `./snowarch doctor*`; running `instance add` from Claude (forbidden by design and by the permission rules).

**Design notes.**
- Frontmatter — `name`, `description` (quoted, so the ARC-02-S02 `": "` check passes) and the first four `allowed-tools` entries are ARC-02-S11's and are kept unchanged: the `status` sub-command's no-Node fallback needs `Bash(cat .local/bootstrap-state.json)` and `Read` (`01` §8). This story appends the four MCP tools:

  ```yaml
  ---
  name: snowarch
  description: "Status, instance setup and health check for the AI ServiceNow Architect. Use `/snowarch status` (or when the user types Status) to report the authoritative Mode line from the doctor; `/snowarch setup-instance` to add a live ServiceNow instance via a guided terminal hand-off; `/snowarch doctor` to run the full health check. Never asks for credentials in chat."
  allowed-tools: Bash(./snowarch doctor*), Bash(node tools/snowarch/bin/snowarch.mjs doctor*), Bash(cat .local/bootstrap-state.json), Read, mcp__servicenow__snow_core_instances_reload, mcp__servicenow__snow_core_capabilities_read, mcp__servicenow__snow_core_instances_index, mcp__servicenow__snow_core_current_instance_read
  metadata:
    version: 2.0.0
  ---
  ```
  Dispatch is ARC-02-S11's: the first word of the arguments selects the sub-command, `status` when none is given; an unknown word prints the three sub-commands. (`$ARGUMENTS` substitution is not in the `00` §9 substrate table — ARC-02-S11 task 1 verifies it in a ten-minute `claude --debug` check; this story inherits that verdict and adds no further platform assumption.)
- `setup-instance` (no `--resume`):
  1. Run `./snowarch doctor --json --section prereqs`. Fields consumed: `os` (`darwin|linux|win32`), `shell` (`bash|zsh|powershell|cmd|unknown`, the doctor's best guess from the parent process), `node.ok`, `node.version`, `deps.ok`, `mode.toggle` (`enabled|disabled|absent` from `.claude/settings.local.json`), `store.exists`. Branches:
     - `node.ok: false` → print `Node.js 20+ is required for live mode — install it (macOS: brew install node@22 · Windows: winget install OpenJS.NodeJS.LTS · Linux: your distribution's package or nvm), then run /snowarch setup-instance again.` and stop.
     - `mode.toggle: disabled` (design-only checkout) → print `This checkout is in design-only mode. In your terminal run  ./snowarch mode live  — it installs the server dependencies and starts the instance wizard (same questions as below). Then restart claude: the MCP toggle is read at session start. If you skipped the wizard, run /snowarch setup-instance again after the restart.` and stop (no questions — `mode live` asks them in the terminal).
     - `deps.ok: false` with `mode.toggle: enabled` → `Server dependencies are missing — run ./snowarch doctor --fix in your terminal, then /snowarch setup-instance.` and stop.
  2. `AskUserQuestion` #1 — *Which kind of instance is this?* options `PDI (personal developer instance, devNNNNN.service-now.com)` · `Development` · `Test / UAT` · `Production (capped at read-only; raising it is a separate terminal step)`.
  3. `AskUserQuestion` #2 — *How will it authenticate?* `Basic — username + password (recommended for PDI; nothing to configure on the instance)` · `OAuth password grant — legacy ROPC; needs an OAuth API endpoint, client id + secret AND a user password; Security Center hardening can disable it` · `Client-credentials grant — not available yet (roadmap); choose Basic`.
  4. `AskUserQuestion` #3 — *Permission preset?* For PDI/Development/Test: `full — proposed: everything on; you will review each flag with its probe result in the terminal` · `pdi-developer — write, CMDB, scripting, ATF; no Now Assist, no Fluent` · `read-only` · `custom — set the six flags on the review screen`. For Production: `read-only (the only wizard option; see set-preset --ack-prod)`.
  5. In chat: ask for the instance URL (rules restated: `https://<host>` only, no `/api`, no path; a bare `devNNNNN` is expanded by the CLI), a short label (`^[a-z][a-z0-9_-]{0,31}$`, propose `pdi` / `dev` / `test` / `prod`), and whether it becomes the checkout's default (propose Yes when `store.exists` is false).
  6. Print the hand-off block. macOS/Linux, or Windows with `shell` ∈ {`bash`, `zsh`, `unknown`}:

     ```
     Run this in your own terminal — not here: Claude's shell cannot read masked input, and the password must never enter this conversation.

         ./snowarch instance add pdi --url https://dev12345.service-now.com --env pdi --auth basic --preset full --default

     It asks for Username and Password (nothing is echoed), tests the instance, then shows the six permission flags with their probe results — press Enter to accept the proposal or type a flag name to toggle it.
     When it prints "Saved instance …", come back here and run:  /snowarch setup-instance --resume
     ```
     Windows with `shell` ∈ {`powershell`, `cmd`}: the same block with `snowarch.cmd instance add …`; when `os` is `win32` and the shell is unknown, both forms are printed, labelled `Git Bash:` and `PowerShell / cmd:`. The command is built from the same option grammar as S05 — the skill text carries the template `./snowarch instance add <label> --url <url> --env <env> --auth <basic|oauth_ropc> --preset <preset> [--default]` and nothing else, so it is identical to what a user types by hand.
  7. Stop. The skill does not poll; the user returns with `--resume` or "done".
- `setup-instance --resume` (or the user saying "done" after the hand-off):
  1. Call `mcp__servicenow__snow_core_instances_reload`. If the call fails because the server is not connected → `The servicenow server is not connected in this session. Run /mcp → servicenow → reconnect (or restart claude), then /snowarch setup-instance --resume.` and stop.
  2. Call `mcp__servicenow__snow_core_capabilities_read`. ARC-04-S04's unconfigured shape (`{ instance: null, mode: "unconfigured", remedy: "/snowarch setup-instance" }`) → `The wizard did not save an instance (it saves only after the probes pass). Re-run the printed command; the terminal shows why it stopped.` and stop. A `configWarnings[]` entry (`PRESET_FLAGS_MISMATCH`, `FLAG_DEPENDENCY_VIOLATION`) is printed under the Mode line in step 3.
  3. Run `./snowarch doctor --json` (full — replacing the skeleton's `--quick` call from ARC-02-S11) and print the authoritative line built from the capabilities result and the doctor's tool count: `Mode: live — pdi (pdi) · preset pdi-developer · WRITE=on CMDB_WRITE=on SCRIPTING=on ATF=on NOW_ASSIST=off FLUENT=off · 398 tools` (the count is whatever the doctor reports; `01` §6.2 shows 398 as an example). Any doctor FAIL is listed with its remedy under the line.
  4. S-02 fallback: the reload result (ARC-04-S04) carries `listChangedSent` and `toolsAdvertised`. If `listChangedSent: true` and `toolsAdvertised` > 5 but the session still cannot call a non-core tool (the skill's own call to `mcp__servicenow__snow_core_table_schema_read` for `sys_user` — a read tool outside the always-advertised five — is rejected as unknown), print `The tool list did not refresh in this session — run /mcp → servicenow → reconnect, then ask again.` The ARC-00-S10 record decides whether this line is the normal last step or the exception.
  5. Close with: `Reminder: any write to this instance needs an explicit "write approved" from you in this conversation (§2.1). Before any configuration write I set the update-set capture target with snow_us_capture_target_set (§2.2).`
- Prohibitions stated in the skill body: never ask for a password, client secret or any credential; never run `./snowarch instance …` yourself (needs an interactive terminal; not in `allowed-tools`); never suggest `claude mcp add`, editing `~/.claude.json` or `.mcp.json`.

**Acceptance criteria.**
1. In a trusted live checkout, `/snowarch setup-instance` with answers PDI / Basic / full and URL `https://dev12345.service-now.com`, label `pdi`, default Yes prints exactly the macOS/Linux hand-off block above (byte-identical command line) and asks nothing about a password at any point; the transcript contains no `Password` prompt.
2. `./snowarch doctor --json --section prereqs` runs with zero permission prompts in that session (S-16) — or, if S-16 failed, with one prompt covered by `allowed-tools`.
3. In a design-only checkout, the skill prints the `mode live` + restart text and asks no questions.
4. After running the printed command in a terminal, `/snowarch setup-instance --resume` prints `Mode: live — pdi (pdi) · preset full · WRITE=on CMDB_WRITE=on SCRIPTING=on ATF=on NOW_ASSIST=on FLUENT=on · <n> tools` (flags as saved) **without** a session restart (S-02 `CONFIRMED`), followed by the §2.1/§2.2 reminder; with S-02 `FAILED` the `/mcp` reconnect line appears instead and the Mode line follows the reconnect.
5. `--resume` before the wizard saved anything prints the "did not save an instance" text and no Mode line.
6. On Windows (Git for Windows present, per `01` §4.1) the block shows `snowarch.cmd …` when the doctor reports a PowerShell/cmd parent, `./snowarch …` under Git Bash, both when unknown.
7. `tests/skills-lint.test.mjs` (ARC-02-S02) passes: description ≤ 500 chars, no unquoted `": "`, `metadata.version` present, `allowed-tools` equal to the eight entries above and nothing else (a lint assertion this story adds); `claude plugin validate` passes on CI per the ARC-00-S12 S-19 verdict (if S-19 recorded that it needs a login or a TTY, the check runs on the reference machine instead and the story records that).

**Tasks.**
1. Agree the `--section prereqs` JSON fields with ARC-08-S01 (add `shell` detection to the doctor if absent).
2. Write the `setup-instance` and `--resume` sections in `.claude/skills/snowarch/SKILL.md` (replacing ARC-02-S11's `<!-- ARC-07-S09: … -->` placeholders); leave the `status`/`doctor` sections to their owners. The terminal hand-off paragraph is `docs/snippets/terminal-handoff.md` pasted **verbatim** (ARC-06-S13 owns the fragment and its inclusion test).
3. Add VALIDATION-TESTS entries (numbers assigned in `VALIDATION-TESTS.md`; ARC-08-S10 adds T-19 `AUTHENTICATION_FAILED`): "setup-instance never asks for a secret and prints the by-hand command" and "`--resume` prints the live Mode line without restart".
4. Run the two tests on macOS and on the Windows `gitbash` snapshot; record in `docs/validation/`.
5. Update `docs/MODES-AND-PRESETS.md` (S10) with the skill walkthrough.

**Test strategy.** Manual VALIDATION-TESTS in both Claude Code versions (floor 2.1.214 and current), macOS + Windows `gitbash`; the skills lint in CI; the doctor JSON contract covered by ARC-08's snapshot test.

**Dependencies.** S05, S06 (the command grammar and the `mode live` path — ARC-06-S12); ARC-02-S11 (skeleton file, frontmatter, the `$ARGUMENTS` check); ARC-04-S04 (`snow_core_instances_reload`, `snow_core_capabilities_read`); ARC-08-S01 (`--json --section prereqs`); ARC-00-S10 (S-02), ARC-00-S04 (S-16), ARC-00-S12 (S-19) verdicts.

**Size.** M — 1.5–2 days (mostly text, but two manual test passes on two OSes and two CLI versions).

**Risks / open points.** The skill cannot verify the user's shell — the doctor's parent-process guess can be wrong under nested shells; printing both forms when unsure is the mitigation. If ARC-00-S12 re-opens the channel decision (plugin `userConfig`), this skill's hand-off text is what changes; the CLI is unaffected.

**Definition of done.** Merged; lint green; both VALIDATION-TESTS recorded as passed on two OSes; `docs/MODES-AND-PRESETS.md` walkthrough present; ADR-0006's hand-off requirement (D-06) marked satisfied.

---

> **Amendment 2026-09-10 (ARC-07-S09).** Six departures and findings.
>
> **(1) The hand-off block is the FRAGMENT's, not the story's prose.** The story writes its own
> wording around the command ("Run this in your own terminal — not here: …"); the skill includes
> `docs/snippets/terminal-handoff.md` verbatim instead, because ARC-06-S13 made that fragment the
> one definition and `tests/terminal-handoff.test.mjs` asserts the skill and the install page carry
> it byte-for-byte. Two wordings of the credential procedure is precisely what that test exists to
> prevent — so the fragment's command line was amended to the story's FULL form (`--env`, `--auth`,
> `--preset`), and the install page changed with it. `docs/INSTALL.md` is **249 lines**, unchanged
> (the budget is 250).
>
> **(2) The command shape has one definition and a renderer.**
> `scripts/handoff-command.mjs` reads the template out of the fragment and fills it; the skill
> quotes the template, and `tests/handoff-command.test.mjs` asserts that rendering AC 1's answers
> produces the story's line byte for byte. The story's line is a literal in that test on purpose —
> it is the acceptance criterion, and a test that derived it from the template it checks would
> agree with itself about anything.
>
> **(3) The eight-entry assertion lives in `tests/snowarch-skill.test.mjs`, not in the tree-wide
> skills lint.** `skills-lint.test.mjs` is the rule set every skill answers to; "these exact eight
> tools" is true of one skill only, and putting it there would make the lint carry a per-skill
> table. It sits beside the other frontmatter assertions for this file, and it is now an EQUALITY
> rather than a set of `match` calls — a grant is a security surface, and an entry added by
> accident is invisible to a handful of substring checks.
>
> **(4) The password-line count moved from two to four, deliberately.** The authentication question
> has to say what each method needs ("username + password"; ROPC's "client id + secret AND a user
> password"), or the choice is made blind. The test's own comment invited the number to move with a
> reason; the reason is recorded there, and it still catches a fifth line — the softening
> qualifier it was written to stop.
>
> **(5) VALIDATION-TESTS gained a "Reserved numbers" section, and the shape rule changed with it.**
> T-19 belongs to ARC-08-S10, so this file jumps 18 → **T-20, T-21**. Contiguity could not express
> a reservation, so the rule is now: ascending, unique, and every gap named with the story that
> will fill it. That catches strictly more than counting did — an undeclared gap is still a
> renumbering that lost a test.
>
> **(6) `--section prereqs` does not exist yet, and the skill says so.** The field contract is
> written into the skill body as a comment AND into ARC-08-S01's story text (fixed 2026-09-10), so
> the story that builds it has something to build to. Until then the skill reads
> `.local/bootstrap-state.json` for the mode and prints BOTH command spellings rather than guessing
> a shell it could not detect — stated in the body, in T-20's pass criteria and in the sitting row.
> `claude plugin validate` passes locally (`✔ Validation passed`) as well as in CI.

### ARC-07-S10 — `docs/MODES-AND-PRESETS.md` final text; error-registry entries; runtime rule text for `AUTHENTICATION_FAILED` / `INSUFFICIENT_PRIVILEGES` / `PROD_WRITE_NOT_ACKNOWLEDGED`

> **Amendment 2026-09-08 (from ARC-05-S07). First item of this story's list: the permission-modes
> paragraph, which did not fit ARC-02-S09's 160-line budget** (the page is at 159). Drafted, to be
> placed after section 3:
>
> > **Permission modes.** `disabledMcpjsonServers` removes the server, so no tool exists and the
> > generated `allow`/`ask` lists are inert. `dontAsk` denies what `ask` would have prompted for,
> > which is safe. `bypassPermissions` skips both — never with a live write preset.
>
> Adding it means the budget moves again, or something else in the page goes; say which.

> **Amendment 2026-09-08 (from the ARC-02-S09 delivery).** **`docs/MODES-AND-PRESETS.md` exists with
> the v1 text; this story replaces the probe wording, not the page.** Section 3 carries a review
> screen with placeholder probe strings (`probe: ok`, `probe: no Now Assist licence detected …`,
> `probe: @servicenow/sdk not on PATH …`) — replace those with what the wizard actually prints. Two
> things in that section are load-bearing and asserted by `tests/no-legacy-surfaces.test.mjs`: the
> line `Enter = accept as shown · type a flag name to toggle · "preset <name>" to switch preset`, and
> the D-05 sentence *"A probe that fails downgrades the recommendation shown on that line; it never
> flips the toggle by itself"*, which must survive verbatim — a paraphrase is how that guarantee gets
> softened. The preset table between the `PRESETS:` markers belongs to ARC-05-S05, not to this story.

**As** an individual practitioner (and the engine reading the generated rule file) **I want** one page that explains Mode, the four presets, the six flags, the review screen, production rules, where credentials live and how to use a password manager, plus a troubleshooting entry for every error the wizard can print, and a runtime rule that makes the engine stop on `AUTHENTICATION_FAILED` **so that** nobody has to read source code or a transcript to recover.

**Context.** README deliverables "`docs/MODES-AND-PRESETS.md` final; `docs/TROUBLESHOOTING.md` entries for `AUTHENTICATION_FAILED`, `INSUFFICIENT_PRIVILEGES`, `PROD_WRITE_NOT_ACKNOWLEDGED`, URL-shape errors" and "`AUTHENTICATION_FAILED` runtime rule in the generated rule file". ARC-02-S09 creates the page (the `01` §6.3 table between `<!-- PRESETS:BEGIN … -->` / `<!-- PRESETS:END -->`); ARC-05-S05 generates the rule file and the PRESETS block, ARC-05-S06 owns the error-code registry (`packages/snowarch/src/utils/error-codes.ts`, `ERROR_CODES: Record<string, { meaning, remedy, command?, showInRule, httpStatus? }>`) and generates `docs/TROUBLESHOOTING.md` from it ("the doctor and the wizard import the same table" — ARC-05 acceptance criterion 6); ARC-08-S10 reviews the `showInRule` set and wires T-19. `01` §8 runtime error mapping: `AUTHENTICATION_FAILED` → stop, no retry, `./snowarch instance test|set-credentials <label>`; `INSUFFICIENT_PRIVILEGES` → role list per preset. P-06 (one vocabulary), R-04 (password-manager path documented meanwhile).

**Scope.** In: the final `docs/MODES-AND-PRESETS.md`; registry entries (`meaning`, `remedy`, `command?`, `showInRule`) for every code S02–S08 introduce and remedy refinements for the codes ARC-04 already registers; the runtime rule text; `docs/PLATFORM-NOTES.md` additions for the two ServiceNow facts used (ROPC property; PDI hibernation). Out: the generators themselves (ARC-05); the doctor's rendering (ARC-08); `docs/MIGRATION.md` (ARC-10, receives S08's text).

**Design notes.**
- `docs/MODES-AND-PRESETS.md` structure: 1 Mode (`design-only` | `live`; how the SessionStart banner and `/snowarch status` report it) · 2 Presets — the generated table between `<!-- PRESETS:BEGIN … -->` and `<!-- PRESETS:END -->` (ARC-05-S05's `presets.mjs` writes it; ARC-05-S04's byte check covers it) · 3 The six flags in plain language (the `01` §6.3 bullets, hand-maintained per ARC-02-S09; S04's `?` text is tested against them) · 4 The review screen (both S04 snapshots pasted from the test snapshot files; the grammar; the dependency rule) · 5 Production rules (cap, `set-preset --ack-prod`, `prodWriteAck`, audit line) · 6 Where credentials live (project store, `--global`, precedence, cloud-sync warning, Windows ACL note, what is never done: `~/.claude.json`, argv, transcripts) · 7 Typing secrets safely (masked prompt, `--password-stdin` with `op read "op://Vault/PDI/password" | ./snowarch instance add pdi … --password-stdin`, `pass show snow/pdi | …`, PowerShell `Get-Secret -Name snow-pdi -AsPlainText | snowarch.cmd instance add … --password-stdin`; the `SNOWARCH_MASK=asterisk` option; the no-TTY rule) · 8 Corporate networks (`HTTPS_PROXY`/`NO_PROXY`/`NODE_EXTRA_CA_CERTS`, the `network:` line, NTLM/Kerberos proxies out of scope) · 9 Maintenance commands (S06, exact prompts) · 10 Migrating from snow-mcp (S08 summary, link to `docs/MIGRATION.md`) · 11 Known limitations (NOW_ASSIST probe ≠ licence check; macOS redirected `~/Documents`; team stores are roadmap).
- Registry entries (ARC-05-S06's `ERROR_CODES`; each `{ meaning, remedy, command?, showInRule, httpStatus? }`). **Added by ARC-07:** `OAUTH_ROPC_DISABLED`, `OAUTH_CLIENT_INVALID`, `URL_NOT_HTTPS`, `URL_HAS_PATH`, `URL_HAS_CREDENTIALS`, `URL_INVALID`, `ENV_REQUIRED`, `LABEL_EXISTS`, `NO_TTY`, `STORE_IN_CLOUD_SYNC_FOLDER` (a WARN; `showInRule: false`). **Already registered by ARC-04, remedy text refined here:** `AUTHENTICATION_FAILED`, `INSUFFICIENT_PRIVILEGES`, `PROD_WRITE_NOT_ACKNOWLEDGED` (ARC-04-S03); the six network codes `DNS_FAILURE`, `TLS_CA_UNTRUSTED`, `PROXY_UNREACHABLE`, `PROXY_AUTH_REQUIRED`, `NETWORK_TIMEOUT`, `CONNECTION_REFUSED` (ARC-04-S11, text from S02); `STORE_PERMISSIONS_TOO_OPEN` (ARC-04-S02; remedy `chmod 600 .local/instances.json && chmod 700 .local`, Windows note per `01` §13). Messages and remedies are the exact strings of S02–S08 (single source: the stories' strings move into the registry and the code imports them).
- Runtime rule text — the registry has no `ruleText` field: an entry with `showInRule: true` is rendered by ARC-05-S05's `rule-file.mjs` into the "Runtime errors" section of `.claude/rules/00-mode-and-mcp-gate.md` as its `meaning` + `remedy`. The three entries below carry `showInRule: true` with this text (ARC-08-S10 owns the final review of the `showInRule` set):
  - `AUTHENTICATION_FAILED`: `If any mcp__servicenow__ tool returns AUTHENTICATION_FAILED: stop immediately. Do not retry that call or make any other call to the same instance — repeated failed logins can lock the account. Tell the user to run ./snowarch instance test <label> and, if it fails, ./snowarch instance set-credentials <label>. Continue only after the user says the credentials were fixed.`
  - `INSUFFICIENT_PRIVILEGES`: `The credentials are valid but the account lacks a role for this table. Report the tool, the table and the roles the preset needs (see docs/TROUBLESHOOTING.md); do not switch instances or retry with another tool to work around it.`
  - `PROD_WRITE_NOT_ACKNOWLEDGED`: `A production instance is capped at read-only. Do not suggest editing the store; the user raises it with ./snowarch instance set-preset <label> <preset> --ack-prod in their terminal.`
- `docs/PLATFORM-NOTES.md` additions (with citations): ROPC can be disabled instance-wide by `glide.oauth.inbound.ropc.grant_type.disabled` (`vendor/ServiceNowDocs/markdown/platform-security/instance-security-hardening-settings/sc-disable-resource-owner-password-credentials-ropc-in-oauth-2-token-grants.md`); PDIs hibernate after inactivity and refuse connections until woken (observed in S11; no corpus citation — marked "observed").

**Acceptance criteria.**
1. `docs/MODES-AND-PRESETS.md` contains the eleven sections; the generated blocks are byte-identical to the generator output (engine lint); the two review screens equal the S04 snapshot files (test compares them).
2. `grep -n "Tier [0-9]" docs/MODES-AND-PRESETS.md` returns nothing; every flag, preset and tool name in the page passes `engine-lint.mjs`.
3. `docs/TROUBLESHOOTING.md` (regenerated) has one `### <CODE>` entry per code listed above, each with a remedy; a unit test asserts every code thrown or printed by `packages/snowarch/src/cli/**` and `src/servicenow/{probes,reachability}.ts` is a key of `ERROR_CODES` (extends ARC-05-S08's multi-line `new ServiceNowError(` scan to the CLI's printed codes).
4. `.claude/rules/00-mode-and-mcp-gate.md` (regenerated) contains the three runtime paragraphs verbatim, rendered from the `showInRule: true` entries.
5. The password-manager examples run as written on macOS (`op`, `pass`) and Windows PowerShell (`Get-Secret`) — checked manually once; the doc marks each tool as optional.

**Tasks.**
1. Write the page; paste snapshots; mark generated blocks.
2. Add the registry entries; refactor S02–S08 to import their strings from `ERROR_CODES` (one source).
3. Set `showInRule: true` with the runtime text on the three entries; regenerate; run the engine lint.
4. `docs/PLATFORM-NOTES.md` additions.
5. Code-to-registry coverage test.

**Test strategy.** Engine lint + generator byte checks in CI; the coverage test in the server package; one manual read-through by someone who did not write the stories.

**Dependencies.** S02–S08 (strings); ARC-02-S09 (page skeleton); ARC-05-S05 (rule file and PRESETS block renderers), ARC-05-S06 (registry file, TROUBLESHOOTING renderer). Consumer, not prerequisite: ARC-08-S10 (`showInRule` review; T-19) merges after this story.

**Size.** M — 1.5 days.

**Risks / open points.** Ownership of `error-codes.ts` is ARC-05-S06's; if it lands late, S02–S08 keep their codes in a temporary `packages/snowarch/src/utils/wizard-error-codes.ts` merged into the registry on arrival — never a second remedy table in the product. `docs/TROUBLESHOOTING.md` is generated — never hand-edited (ARC-05-S04 byte check).

**Definition of done.** Merged; lint and generators green; TROUBLESHOOTING regenerated; the rule file regenerated; ARC-08-S10's T-19 references the rule text.

---

### ARC-07-S11 — Live E2E suite behind `RUN_LIVE_E2E=1`: wizard end to end, three-failure exit with lockout check, prod cap, ROPC-disabled fixture, import

**As** a maintainer **I want** a nightly suite that runs the real CLI against a real PDI and proves the promises the unit tests can only simulate — no echo, no secret in `ps`, no lockout after three failures, 0600/0700, prod cap, the exact ROPC-disabled error text **so that** a regression in the credential boundary is caught before a release, and never on a pull-request runner without secrets.

**Context.** README acceptance criteria 1, 2 (lockout), 3 (prod), 5 (`list` pasted into chat), 8 ("no test performs real network calls without `RUN_LIVE_E2E=1`"); README risk "OAuth ROPC disabled … detect the instance's error text" (the fixture S03 left empty); ARC-04 uses the same `RUN_LIVE_E2E=1` convention; ARC-09 CI matrix runs the `--password-stdin` path on Windows. Q-A: the target is the author's own PDI (an individual practitioner instance) — no shared instance is required.

**Scope.** In: `packages/snowarch/tests/e2e/instance-wizard.e2e.test.ts` (vitest, skipped unless `RUN_LIVE_E2E=1`); helpers for a pseudo-terminal on macOS/Linux; the nightly workflow `.github/workflows/e2e-live.yml`; the ROPC fixture capture; a redacted run record. Out: Windows raw-mode TTY automation (manual, from the S-04 matrix; the Windows job runs the `--password-stdin` path only); any write to the PDI other than the optional ROPC property toggle guarded by `SNOW_E2E_ALLOW_WRITES=1`.

**Design notes.**
- Inputs (never printed): `SNOW_E2E_URL`, `SNOW_E2E_USERNAME`, `SNOW_E2E_PASSWORD`; optional `SNOW_E2E_OAUTH_CLIENT_ID`, `SNOW_E2E_OAUTH_CLIENT_SECRET`, `SNOW_E2E_ALLOW_WRITES=1`. Locally they come from a 0600 file loaded through `SNOW_ENV_FILE` (ARC-04 — no cwd `dotenv`); in CI from repository secrets. Every test uses a temp directory as `SNOW_STORE` and `HOME`/`APPDATA` so the runner's real stores are untouched.
- Pseudo-terminal without native dependencies: macOS `script -q /dev/null node dist/cli/index.js instance add …`, Linux `script -qec "node dist/cli/index.js instance add …" /dev/null`; the test writes `username\n`, waits for `Password: `, writes `password\n`, waits for the review screen, writes `\n`. It records the full pty output.
- Cases:
  1. **Happy path (TTY)** — asserts: exit 0; output contains the exact `Saved instance "e2e" (pdi · basic · preset full · default). Probes: auth ok · write ok · scripting ok · cmdb ok · atf ok · nowAssist <ok|not licensed> · fluent <ok|not installed>.` line (the two variable results are read from the store and matched); the pty output contains **no** character sequence of the password; while the child runs, `ps -o args= -p <pid>` (macOS) / `/proc/<pid>/cmdline` (Linux) contains no password; the store file mode is `0600` and `.local` (temp equivalent) `0700`; the JSON has six string flags, `toolPackage: "full"`, `maxRecords: 100`.
  2. **Happy path (stdin)** — `printf '%s\n' "$SNOW_E2E_PASSWORD" | node dist/cli/index.js instance add e2e … --username … --password-stdin --yes`; runs on all three OSes including Windows (PowerShell pipe with `\r\n`).
  3. **Three failures** — TTY run with a wrong password three times; asserts exit 1, no store file, exactly the three `AUTHENTICATION_FAILED` lines; then, with the right credentials, `GET /api/now/table/sys_user?sysparm_query=user_name=<u>&sysparm_fields=locked_out` → `locked_out` is `false`; the record notes the instance's lockout policy as observed (the wizard's own guarantee is one request per attempt — S03's counter is re-asserted here through the instance's `syslog` only if `SNOW_E2E_ALLOW_WRITES` is set, otherwise skipped).
  4. **Prod cap** — `add e2e-prod --env prod --preset full --yes --password-stdin` → exit 3, nothing saved; `add e2e-prod --env prod --yes --password-stdin` → saved read-only; `set-preset e2e-prod full --ack-prod --confirm-label e2e-prod --yes` → `prodWriteAck: true`; `node dist/server.js` started with that store answers `snow_core_capabilities_read` with `e2e-prod` loaded (through ARC-06-S08's `tools/snowarch/lib/mcp-handshake.mjs`), and with `prodWriteAck` flipped to `false` in the file the server logs `PROD_WRITE_NOT_ACKNOWLEDGED`.
  5. **ROPC** (only with the OAuth variables) — `--auth oauth_ropc` happy path; then, with `SNOW_E2E_ALLOW_WRITES=1` and an admin account: set `glide.oauth.inbound.ropc.grant_type.disabled=true` through `sys_properties`, run the wizard, assert `OAUTH_ROPC_DISABLED` and the property name in the output, capture the raw token-endpoint body into `tests/fixtures/oauth-ropc-errors.json` (committed by the maintainer after review), restore the property in `finally`.
  6. **Maintenance** — `test`, `set-credentials` (wrong then right), `set-default`, `remove`; `list` and `list --json` output grepped for the password and the unmasked username.
  7. **Import** — write a legacy-shaped file from the E2E credentials into the temp `HOME`, run `import --from-legacy --yes`, assert the S08 mapping and the deletion advice.
  8. **Sleeping PDI** (manual, documented) — record which S02 code a hibernated PDI produces; not automated.
- Workflow `e2e-live.yml`: `schedule` nightly + `workflow_dispatch`; jobs on `macos-latest`, `ubuntu-latest` (cases 1–7) and `windows-latest` (cases 2, 4, 6, 7); secrets only available on the default branch; the job uploads a redacted log (the test's own redactor replaces the secret values with `***` before writing artefacts). Pull-request CI never sets `RUN_LIVE_E2E`.
- Run record: `docs/validation/<date>-e2e-live-<os>.md` without the instance URL (Q-A persona: the author's PDI is not a product fact).

**Acceptance criteria.**
1. `npm test` without `RUN_LIVE_E2E=1` skips the suite (reported as skipped, not passed) and makes no network call (asserted by a test that stubs `fetch` to throw during the unit run).
2. With `RUN_LIVE_E2E=1` and valid secrets, cases 1–4, 6, 7 pass on macOS and Ubuntu, and cases 2, 4, 6, 7 pass on Windows; case 5 passes when the OAuth variables are present and is skipped otherwise.
3. The pty transcript of case 1 and the `ps`/`cmdline` snapshot contain no password (the assertion searches for the raw value and for its base64 `user:pass` form).
4. After case 3 the E2E user's `locked_out` is `false`.
5. `tests/fixtures/oauth-ropc-errors.json` contains the captured `error` / `error_description` values from the instance and S03's table maps them to `OAUTH_ROPC_DISABLED` (unit test re-run against the fixture).
6. Uploaded logs contain `***` where the secrets were and never the raw values (a post-step greps the artefact).

**Tasks.**
1. Pty helper (`tests/helpers/pty.ts`) using `script(1)`; stdin helper for Windows.
2. The seven automated cases; the redactor; the `SNOW_STORE`/`HOME` isolation.
3. `e2e-live.yml`; repository secrets documented in `docs/CONTRIBUTING.md` (names only).
4. Capture the ROPC fixture on the author's PDI; commit it; re-run S03's unit test.
5. Write the run record; link it from the README (ARC-10 validation records follow the same format).

**Test strategy.** This story *is* the test strategy for the ARC's live claims; it runs nightly, not on PRs. Manual: the Windows TTY path from the S-04 matrix once per release (ARC-09 checklist).

**Dependencies.** S05–S08; ARC-04-S02 (`SNOW_ENV_FILE`), ARC-04-S03 (`prodWriteAck` rule); ARC-06-S08 (`lib/mcp-handshake.mjs`); a PDI and CI secrets (owner action).

**Size.** M — 2 days, plus the owner's time to provision secrets.

**Risks / open points.** `script(1)` differs between macOS (BSD) and Linux (util-linux) — two invocation forms, both in the helper; its presence on `macos-latest` and `ubuntu-latest` is an assumption with no `01`/`03` citation, verified by task 1 on both runners before anything else is built on it. PDI hibernation can fail a nightly run — the workflow retries once after a wake-up request is not possible unattended, so the failure message names hibernation as the first thing to check. Case 5's property toggle is a real write on a PDI — guarded, restored in `finally`, and never run on PR CI.

**Definition of done.** Merged; nightly green on three OSes at least twice; fixture committed; run record in `docs/validation/`; README acceptance criteria 1, 2, 3, 5, 8 ticked with the run record as evidence.

---

## Sizing summary

| Story | Size | Days (range) |
|---|---|---|
| S01 | M | 1.5–2 |
| S02 | M | 1.5–2 |
| S03 | M | 2 |
| S04 | M | 2 |
| S05 | L | 3–4 |
| S06 | M | 2 |
| S07 | M | 1–1.5 |
| S08 | M | 1.5 |
| S09 | M | 1.5–2 |
| S10 | M | 1.5 |
| S11 | M | 2 |
| **Total** | | **20–25 engineer-days** (≈ 4–5 weeks for one engineer; under the 6-week threshold) |

Critical path: S01 → S02 → S03 → S04 → S05 → S06 → S09; S07 and S08 hang off S05/S06; S10 gathers strings from S02–S08 and can start as soon as S05 merges; S11 needs S05–S08 and the owner's secrets. External gates: ARC-04-S02 (store), S03 (presets), S04 (reload), S10 (audit) and S11 (R-3 proxy) must merge before S02/S03/S05, ARC-04-S12 (`Probes` interface) before S03, ARC-05-S06 (registry) before S10; ARC-00 S-04 (Windows masked input), S-02 (`list_changed`), S-16 (`permissions.allow` after trust) and S-19 (`claude plugin validate` on CI) must have verdicts before S01, S09 and the skill lint respectively; per D-06, none of this ARC's stories start before ARC-00-S12 has moved ADR-0006 to Accepted, because ARC-06's B06 slot (which S05 fills) does not exist until ARC-06 starts.
