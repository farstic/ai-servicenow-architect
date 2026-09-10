# Changelog

All notable changes to the Claude ServiceNow Architecture Engine are documented in this file.

**Repository:** [`farstic/claude-servicenow-live`](https://github.com/farstic/claude-servicenow-live)
**Last updated:** 3 June 2026

The engine follows a minor-version cadence where the **first digit** signals a major architectural shift, and the **second digit** signals an additive or corrective patch within that architecture.

---

## Unreleased

### Added

- **`./snowarch bootstrap` — one amendable plan, then ten numbered steps that remember where they
  got to.** The plan screen is the only interactive moment of an installation (principle 10): it is
  shown once, before anything is written, and quitting it leaves no `.local/` at all — not even a
  log, which is why the logger learned to defer opening its file until a run is accepted. After
  that the steps run uninterrupted, each recording its status, duration and an input hash, so a
  second run prints `ok (cached)` and a failure, a Ctrl-C or an upgrade never means starting over.
  `--from BNN` forces a re-run from a step; `--reset` clears the state and the doctor cache and
  nothing else — the credential store and `.local/config.json` are named in the sentence it prints.
  `--mode live --yes` without `--instance-file` is refused before anything is written, because
  credentials cannot be typed non-interactively.
- **`.local/bootstrap-state.json` v1** — atomic (temp file + `rename`), `0600` on POSIX, and
  **guarded at write time**: `saveState` walks the whole object and refuses a key that names a
  secret (the redactor's own rule, imported rather than restated) or a value that looks like a URL
  or an address. Grepping the file afterwards proves today's steps are clean; the guard is what
  keeps a step written three stories from now clean too. `docs.mode` and `mode` sit exactly where
  `docsStatus()` and the `/snowarch status` skill already read them.
- **`instance add`, end to end — and every way it ends without saving.** One command asks for a
  username and password, proves the instance, shows the review screen and writes one 0600 file —
  or writes nothing at all. **There is no "save anyway"**: P-23's wizard offered exactly that, and
  an instance saved that way failed later inside a tool call with no memory of the moment somebody
  clicked past a warning. Three credential attempts, ONE request each, and the counter is shared
  between a wrong password and a role that cannot read `sys_user` — both mean "this account, as
  given, cannot be used", and a fourth try of either is an account closer to a lockout on an
  instance whose policy nobody here knows. With `--password-stdin` there is no re-entry at all:
  nobody is there to correct it, and the same wrong credential sent again is noise in the
  instance's audit log. A duplicate label is refused before anything is asked, so it costs nobody a
  password; `--replace` overwrites, and a test asserts the OLD password is gone from the file
  bytes. A policy refusal the arguments already decide now happens FIRST — `--env prod --preset
  full --yes` cannot end any way but exit 3, so spending a password prompt and a login attempt at
  a production instance on the way there was two costs for nothing.
- **`./snowarch instance` forwards, and does nothing else.** It checks three preconditions (Node's
  floor from `engine.config.json`, the built CLI, the server's dependencies), prints one sentence
  if any fails, and otherwise hands the terminal over with `stdio: 'inherit'` so the masked prompt
  works — pinning `CLAUDE_PROJECT_DIR` to this checkout, never an inherited session's. The argv it
  builds is exactly what the user typed: a test greps the whole of `tools/snowarch/` for a
  `--password` construction, because a secret cannot reach `ps` through a process that never
  invents an argument.
- **One page now answers "what will this be allowed to do, and where does my password go".**
  `docs/MODES-AND-PRESETS.md` is eleven sections: Mode, the presets, the six flags, the review
  screen, production rules, where credentials live, typing secrets safely, corporate networks, the
  maintenance commands, migrating from the old tool, and what this release does not do. Four of its
  blocks are **included** rather than retyped — both review screens, the migration plan and the
  terminal hand-off — so what the page shows and what the commands print cannot drift apart; a
  generator fills them and CI fails when they disagree. The line budget that moved three times is
  retired for a structural one: eleven sections, none over sixty lines.
- **The runtime rule now tells a session what to do when a login fails.** `AUTHENTICATION_FAILED`,
  `INSUFFICIENT_PRIVILEGES` and `PROD_WRITE_NOT_ACKNOWLEDGED` carry their instructions in the error
  registry, and the always-loaded rule file renders them: stop on a failed login and do not retry —
  repeated attempts lock the account — report a missing role rather than working around it with
  another tool, and never suggest editing the store to get past a production cap. One registry, one
  wording, three places it appears.
- **Two platform notes.** ROPC can be switched off instance-wide, and then no client id is the
  problem (cited); and a hibernating PDI refuses connections in a way that looks nothing like a bad
  password (observed, marked as such).

- **`/snowarch setup-instance` now walks the whole hand-off from inside Claude.** It checks the
  prerequisites first and stops with the one remedy that fits — Node missing, a design-only
  checkout (which sends you to `./snowarch mode live` and a restart, and asks nothing, because the
  wizard asks the same questions in the terminal), or dependencies to install. Then three
  questions — instance kind, authentication, preset — and three more in chat: the URL, a label, and
  whether it becomes the default. It prints **one command**, in the spelling your shell can
  actually run, and stops: no polling, no "did that work?". `--resume` reloads the store, reads the
  capabilities and runs the full doctor, then prints the authoritative `Mode: live — …` line
  **without a session restart**, with the `/mcp` reconnect line as the fallback and the write-gate
  reminder to close.
  **It cannot ask for your password even if it wanted to** — `./snowarch instance …` is not in its
  `allowed-tools`, and the grant is now asserted as exactly eight entries rather than as a handful
  of substrings, so a tool added by accident fails the test rather than passing unnoticed. The
  command it prints is rendered from the SAME template the install page shows, so what it hands you
  and what a reader types by hand cannot drift apart.

- **One command migrates a snow-mcp 1.x store — and shows you the plan first.** `instance import
  --from-legacy` reads `~/.config/servicenow-mcp/instances.json` (the same path on every operating
  system, Windows included — the old tool used it there too), maps every entry, and prints what it
  would create: the label, the URL with the old `/api` suffix removed, the environment, the auth
  method, the preset it lands on, and every note that explains a difference. `--dry-run` stops
  there. Nothing is written before that plan has been shown and accepted, because the legacy files
  the old desktop app wrote default `writeEnabled` to `true`, and an import that saved silently
  would hand somebody an all-write installation they never chose — so a non-production entry goes
  through the review screen unless `--yes`, and **production is capped at read-only whatever the
  legacy file said** (D-05). Every entry is probed once before it is saved; one whose credentials
  no longer work is skipped with the command that adds it by hand, and the run says `Imported 1 of
  2` rather than pretending. `FLUENT_ENABLED` is written explicitly off — the old wizard never had
  it — and `aiApiKey` is listed as dropped **by name**: 2.0.0 has nowhere to put it, and its value
  never reaches an output byte. **It deletes nothing.** The closing advice names
  `~/.config/servicenow-mcp` and the `tokens.json` beside the store, tells you they hold plaintext
  secrets, and leaves the deleting to you; a test greps the command's own source to prove there is
  no removal call in it at all.

- **A per-user store, and a plain answer to "which one wins".** `instance add --global` writes
  `~/.config/snowarch/instances.json` — `$XDG_CONFIG_HOME` honoured, because a machine that sets it
  does not keep configuration in `~/.config` — or `%APPDATA%\snowarch\instances.json` on Windows,
  through the SAME resolver the server uses rather than a second path calculation. The two stores
  are **never merged** (`01` §7): `list --all` shows both with a `STORE` column, a label that is in
  both appears twice, and one note says which of the two the server reads for this checkout.
  Plain `list` shows the store the server would use and a footer naming what is in the other one,
  so nobody concludes an instance is gone when it has merely moved house.
- **A warning before the credential store lands in somebody else's cloud.** `0600` is a LOCAL
  permission — the sync client runs as the same user — so `add` and `set-credentials` now detect a
  checkout inside OneDrive, Dropbox, iCloud Drive or Google Drive and say so **before** anything is
  written, naming the provider and the exact folder to move out of, and asking a question whose
  default is No. `--yes` writes and keeps the warning in the output and in `--json`'s `warnings[]`;
  the sentence comes from the error registry, filled with the provider and the folder, so there is
  no second copy of it anywhere. Enterprise "Known Folder Move" — `Documents` redirected into
  OneDrive with the word OneDrive nowhere in the path — is caught by the `%OneDrive%` variables,
  which are the only detector that exists for it. The provider list is DATA, and the three
  implementations that must agree about it (the server's, the bootstrap's stdlib one, and the
  doctor's) answer to one fixture file rather than to three tables that look alike. Two of them
  disagreed about `~/Library/CloudStorage/OneDrive-Corp` on the day the fixture was written.

- **Seven maintenance commands, and what each of them may touch.** `instance list · test ·
  set-credentials · set-preset · set-flags · set-default · remove` — every one resolving the store
  exactly as the server does, because a second resolver is how a wizard writes one file while the
  server reads another. What a command may write is deliberately narrower than the store, and the
  tests compare the other fields byte for byte: `test` writes `lastProbe` and nothing else — a
  `401` leaves the credentials and the preset exactly as they were — `set-credentials` writes the
  credentials only after the instance said `ok` (three attempts, one request each, S05's loop
  rather than a second one), and the permission commands never touch a credential at all. Masking
  happens once, in a serializer (`src/cli/format.ts`): a secret becomes `set (len 12)` in the
  shape, so no printer can leak one, and a test scans every byte every command in the suite wrote.
  Production is raised only through `--ack-prod` with the label TYPED BACK — `--confirm-label` is
  the CI form and the audit line records which of the two it was — and dropping back to
  `read-only` clears the acknowledgement, so the next raise has to be made again rather than
  inherited from a decision taken weeks ago. Every change from a terminal appends a line to the
  same `audit.jsonl` a tool call writes to, with `actor: "cli"` and `tool: null`. The bootstrap's
  `.local/config.json` is refreshed as a MIRROR — that one key, when the file already exists,
  every other key byte for byte.
- **`instance add --auth oauth_ropc` never worked, and does now.** The capability probe refuses an
  OAuth run with no token probe, and nothing supplied one: the error was neither `ok` nor
  `unreachable`, so it fell through to the wrong-password branch and spent three attempts proving
  it. The request that follows IS the token exchange for this client — it acquires the ROPC token
  inside its first request — so a separate token call would be a second login attempt against the
  one-request-per-probe rule. Found by the new `set-credentials --auth oauth_ropc` test.
- **`L05` — "every repository path cited in prose resolves" — now asks git, not this disk.**
  Citations resolve against TRACKED files (`git ls-files`, the index, so a file resolves as soon
  as it is staged) plus an explicit allow-list of runtime prefixes; the status line says how many
  citations were checked and which rule answered. The defect it closes shipped in the previous
  release: two comments citing a `node_modules` path that npm hoists away passed on the author's
  machine, where the directory happened to exist, and failed on all nine CI cells. Tracked mode
  needs the lint ROOT to be the git toplevel, not merely to sit inside one: a fixture tree under a
  `TMPDIR` that happens to be inside an unrelated checkout would otherwise be measured against
  that repository's index, and every real path in it reported dead — the same
  works-here-fails-there shape, arriving through the door the rewrite opened.
- **One condition, one text — `URL_REQUIRED`.** There were three: the registry's remedy, the
  wizard's `--yes` sentence, and a third in the URL module for an empty answer at the prompt. The
  registry's is now the only one, rendered through the same path every other code uses.

- **The forwarder now actually forwards — and `LABEL_EXISTS` is a code with a remedy.** Two
  defects the gates could not see, found in review. The engine frame parsed the arguments of a
  command whose arguments belong to another program, so `./snowarch instance add … --env prod
  --preset full --yes` answered `--yes needs a value` from the wrong parser and `instance add
  --help` printed the wrong usage: the README's own command could not run through the launcher.
  `instance` is a RAW command now — not parsed, not rejected, not answered by the frame, with only
  a bare `instance --help` left to it — and root-entry tests spawn the real launchers (the engine
  entry, `./snowarch`, `snowarch.cmd` through `cmd.exe` on Windows) with real options, asserting
  whose answer arrived. The six existing tests were unit tests on the argv builder; a pass-through
  cannot be proved by a test that never passes anything through. Separately, the wizard printed
  `LABEL_EXISTS — …` for a code the registry never held, so `docs/TROUBLESHOOTING.md` documented
  every other failure of `instance add` and not that one: it is registered, the sentence renders
  the registry's remedy rather than a second copy, and the completeness scan — which read THROWN
  codes only, and nothing throws this one — now also reads codes PRINTED in the house `CODE — …`
  shape.

- **Propose, review, apply — and a probe never decides.** The wizard proposes a preset from the
  ENVIRONMENT ALONE (`full` for pdi/dev/test, `read-only` for prod), shows the six flags with what
  the probes found, and applies exactly what the screen showed. A probe that came back
  `not licensed` changes the RECOMMENDATION on that line and never the toggle — the box stays
  `[x]` beside text advising the opposite, because a wizard that quietly turned a flag off on the
  strength of one reading would produce an installation the user did not choose and cannot
  explain. **Production is capped at read-only with no override in the wizard at all**: `--preset
  full --env prod --yes` exits 3 with the D-05 refusal and writes nothing, and interactively the
  wizard offers to save it read-only instead. Raising production is a separate named step in a
  different command, which is the point — the moment you can raise production inside a wizard,
  raising production becomes something that happens while you are doing something else. The
  dependency rule is a conversation rather than a correction: turning WRITE off with dependents on
  asks, and "no" keeps WRITE on rather than saving a contradiction. `--flags` needs all six or it
  names the missing one — filling in the sixth would be the wizard choosing while claiming the
  caller did. Both screens are rendered to `docs/snippets/` so the page S10 writes and the wizard
  a user sees cannot drift, and every line fits 100 columns: a long hint WRAPS, because the part a
  truncation removes is the part that says what to do about it.
- **One probe library, and it can never lock an account out.** `probes.ts` proves the credentials
  and reports, per flag, whether the account can reach the table family that flag unlocks — the
  same answer for the wizard, `instance test` and the doctor, because three implementations of one
  question disagree about the same instance on the same day. **One HTTP request per probe, ever:**
  the client is constructed with `maxRetries: 0` even though it already excludes authentication
  failures from its retry policy, since "excluded today" is a property of code somebody may change
  and "no retries configured" is a property of this call. A retried 401 is an account three
  attempts closer to a lockout on an instance whose policy nobody here knows — so the test that
  proves it plants a fixture that WOULD succeed on the second call and asserts the second call is
  never made. A 403 is its own status rather than a failure: on a hardened instance the login is
  right and the REST ACL is not, and telling that user their password is wrong sends them to
  change one that works. A failed login is followed by six `skipped` capability results and zero
  capability requests. `sn_generative_ai` properties are reported as "properties found", never as
  "Now Assist works" — a plugin can be installed without a licence. The ROPC error mapping is
  DATA, carrying RFC 6749's names until ARC-07-S11 records what a real instance actually returns;
  an unrecognised body falls through with the raw value rather than a guess dressed as a
  diagnosis. And the record written to the store is statuses ONLY — no account name, no role list,
  no hint text — because it is read by the banner, the doctor and `/snowarch status` alike.
- **One condition, one remedy.** The network classifier carried its own remedy strings while the
  error registry carried others, so the server said one thing and the wizard another about the
  same failure — and the contract published the second. The classifier renders the registry now,
  with the host substituted in, and a parenthetical whose subject is absent (`(a proxy is
  configured — …)`, `(issuer: …)`) is removed with it rather than printed empty.
- **"Unreachable" is not a diagnosis — the probe names which of DNS, TLS or a proxy is in the way.**
  `normalizeInstanceUrl` accepts an address in any reasonable form and REFUSES what it cannot fix
  with the reason: `/api` gets its own sentence (P-23's wizard silently turned that into a base URL
  and every REST path afterwards was `/api/api/now/table/…`), a URL carrying credentials is refused
  outright and never echoed back, a bare word is PROPOSED rather than assumed, and a trailing slash
  is removed with a note. The environment is proposed only for a real PDI: `dev12345.service-now
  .com.evil.example` contains the pattern and belongs to somebody else, so the regex is anchored at
  both ends — and with `--yes` on a non-PDI host, `ENV_REQUIRED` refuses rather than defaulting,
  because the environment decides which preset a write is checked against. `probeReachability`
  sends one `HEAD` through the existing HTTP layer — no new call site, so the proxy agent and
  `NODE_EXTRA_CA_CERTS` apply — and any status but 407 counts as reached, a login redirect
  included. The six failures are classified by the layer that already knows how, and the REMEDY
  comes from the one error registry with `<host>`, the masked proxy and the certificate issuer
  substituted in; `docs/TROUBLESHOOTING.md` prints the same template. The `network:` line is
  printed whether the probe succeeds or not, because "it worked" and "it worked through a proxy
  with a corporate CA" are different facts and only one explains why the same command fails for a
  colleague. **No "continue anyway"**: P-23's wizard offered it, and an instance saved that way
  failed later inside a tool call with no memory of this moment.
- **A timeout of our own making was being reported as "run the doctor".** `AbortSignal.timeout`
  rejects with a `TimeoutError` that carries no `code`, so the classifier fell through to
  `NETWORK_ERROR` for the one failure whose remedy is the most specific of the six. It recognises
  an abort now — every caller that passes a signal gets it.
- **The credential boundary is one module.** `packages/snowarch/src/cli/tty.ts` is the only place a
  password can be typed: an interactive terminal with echo off, or `--password-stdin`, and no third
  way. `--password`, `--client-secret` and `--secret` are refused **before commander parses
  anything** — commander echoes an unknown option back, so a value that reached the parser would be
  printed to stderr by the code rejecting it (P-34). A non-terminal stdin is refused rather than
  read, because a password read from an unexpected stdin is a password in a CI log, and the refusal
  names the way through (`--password-stdin`, with the password-manager form spelled out, since the
  command a user invents unaided is `echo`, which lands in shell history). Nothing is echoed — not
  characters, not asterisks, which reveal the length; `SNOWARCH_MASK=asterisk` exists for users who
  need feedback and is off. Raw mode is restored on every exit path including a thrown error and a
  stdin that dies mid-prompt, because a terminal left raw stops echoing what the user types into
  their own shell afterwards. No prompt library: `@inquirer/prompts` is what ARC-04-S01 removed, and
  re-adding one would put the credential boundary inside somebody else's package. Twenty-four tests
  drive a fake terminal on all three operating systems — CI has no TTY, and the one file where a
  password is typed is the wrong file to leave unproven on two platforms out of three.
- **A Node-free Windows install was silently losing a corpus file — found by the new job, on its
  third run.** The recipe set `core.longpaths` as its second-to-last line, so the clone, the
  sparse-checkout and the CHECKOUT all ran with the default `false`; one documentation file whose
  path exceeds 260 characters never reached the working tree, and the only outward sign was the
  submodule reading "modified" with an unmoved pointer. Every Windows git command in the recipe
  carries `-c core.longpaths=true` now — the Node path never had the bug, because `withLongPaths`
  has always wrapped every call there. The test that asserted the Windows form differed by exactly
  one line was asserting the bug, and says so.
- **The `bootstrap` job — the install promise, executed on every commit.** Thirteen cells: nine
  install through the Node CLI (three operating systems × Node 20/22/24), three rebuild PATH from
  the system directories and let the launcher finish design-only ITSELF with no Node to hand over
  to, and one does the whole Windows path on a machine with Git Bash stripped. Each cell installs
  twice — the second run must report `ok (cached)` for B01/B02/B07, enter no docs phase and finish
  under 30 seconds — and then ten assertions run from ONE script for every OS: nothing tracked
  modified, the state says `design-only` with the expected *writer*, the toggles equal what S05
  computes (hook present iff Node is, `disableAllHooks` never written), no credential-shaped key in
  five files, the corpus really present at the pin, `.local` at 0700, and the committed
  `dist/server.js` answering a real handshake. The corpus is fetched for real: this is the only job
  that proves an end-to-end design-only install. **When it is red, the install is broken, not the
  test** — and three fixture pull requests were opened red once, to prove each negative fails the
  way it claims. One story assertion could not be implemented as written and says so in the story
  text: B00 probes github.com on every run by design, so the "unreachable proxy on the second run"
  check would have measured B00 failing rather than the cache working.
- **One install page, and the README is a copy of it.** `docs/INSTALL.md` is the page —
  prerequisites, both paths, what you will see, live mode, operators, uninstall — and `README.md` is
  `docs/README-head.md` + that page's body + `docs/README-tail.md`, composed by
  `scripts/gen-readme.mjs` and checked in CI. Three parts rather than two because the page has a
  250-line criterion and "What is here" and the licence are the README's sections, not install
  steps: folding them in made the criterion measure 34 lines that were never instructions. Each part
  has its own budget, so moving them out of one cap did not put them beyond any.
  P-02 is why: the package this replaces shipped a README naming an unpublished npm package and
  telling the reader to edit `claude_desktop_config.json`, every sentence true of an intention. So
  the parts of the page that are facts about the build are WRITTEN by the build — the closing block
  from `text.json`, the dialog count from `EXPECTED_DIALOGS` with the version it was measured on,
  the preflight remedies from `remedies.json`, and the terminal hand-off from the same fragment the
  `/snowarch setup-instance` skill carries. A test asserts the skill and the page still agree word
  for word: a stale copy of THAT text is not a documentation defect, it is a user typing a password
  somewhere it was not meant to go. Four words are forbidden on the page by test — `Tier N`,
  `claude_desktop_config`, `1.0.0`, and `claude mcp add` (this project never runs it) — and
  `claude mcp remove` is allowed exactly once, in Uninstall. `docs/USER-GUIDE.md` pointed at two
  install guides that do not exist; it points at this one now.
- **`docs/PLATFORM-NOTES.md` gained a Windows section** that separates what CI verifies every run
  from what waits for the owner's sitting, rather than letting the two read alike.
- **`snowarch mode live` / `mode design` — the switch, and the `--register local|user` fallback.**
  `mode live` runs B00 then the registry (B01–B03 cached); `mode design` runs B07 and B09 only and
  does NOT touch the credential store — the closing note names the instance it kept and the two
  commands that undo it either way. `mode` on its own prints the S09 Mode line and the registration
  kind, where the kind's consequence is the message: `local (~/.claude.json, this checkout only)`
  against `user (~/.claude.json, every project — not recommended)`. User scope is refused outright
  without `--ack-user-scope`, because attaching the server to every project on a machine is an
  engagement-firewall decision and not a convenience. **`~/.claude.json` is never opened by this
  project**: every read and write goes through `claude mcp add-json|get|remove` in one module, a
  test fails the build if any module under `lib/` builds a path to that file or calls `homedir()`,
  and every call passes `-s <scope>` — without it `claude mcp remove` deletes from whichever scope
  it finds, which for our key is the committed project entry. An entry this tool did not create is
  never removed, only reported. The registration is saved to the state the moment it happens rather
  than at the end of the run: `~/.claude.json` has already changed by then, and a later failure
  that left the state saying `project` would orphan an entry the undo refuses to touch.
- **`bootstrap.sh` now recognises Git Bash.** `platform()` answered `linux` for MINGW/MSYS, so a
  Windows user running the POSIX launcher was told to `apt install git`. It answers `win32` and gets
  the `winget` remedies — which S11's derivation rule put back into the generated region on its own,
  no edit, because the file started referencing them again.
- **`bootstrap.cmd`, `bootstrap.ps1` and `snowarch.cmd` — native Windows, without Git Bash.** The
  `.cmd` runs PowerShell with `-ExecutionPolicy Bypass`, which is what makes a double-click work
  under the default Restricted policy, and pauses only when double-clicked with no arguments. The
  `.ps1` mirrors `bootstrap.sh` step for step and shares its sentences through the same generated
  region — in PowerShell syntax, with the **Windows spellings** — and is 5.1-clean (no `??`, no
  ternary, no `-AsHashtable`, never `pwsh`), with a test that greps for each and proves the grep is
  not vacuous. It records `writer: "powershell"` and `fileModes: "acl-inherited"`, because there is
  no `chmod` to apply and implying one would be a lie in a file the doctor reads. **Written on a Mac
  with no PowerShell to run them**, so a new Windows CI job proves what CI can reach — Bypass under
  a Restricted process policy, the Node-free path with Node *and* Git Bash removed by rebuilding
  PATH rather than filtering it, exit codes 0/2/3 from both cmd and `powershell.exe`, and Node
  reading the state PowerShell wrote — and the double-click, Ctrl-C, GPO and Claude-Code-on-Windows
  cases are recorded in `OWNER-SITTING.md` as deferred rather than quietly skipped. Two things that
  job caught on its first run, both invisible from a Mac: the shared text region wrote every
  sentence into both launchers, so each declared remedies for a platform it can never print — six
  linter findings, one cause, fixed by deriving the region from each file's own references, which
  is also why it can no longer drift; and PowerShell 5.1 decodes a BOM-less file as the ANSI code
  page, so the `—` and `·` in the shared sentences would have arrived as mojibake before a line
  ran. The `.ps1` now carries a UTF-8 BOM, `.editorconfig` declares it, and a test asserts both the
  BOM and the non-ASCII that makes it necessary. Three more the job found once it could run: on
  5.1 `Set-Content -Encoding UTF8` writes a BOM too, so every JSON file the launcher wrote came
  back as `not valid JSON` from Node — one `Write-Json` helper now writes them all without one,
  and `loadState` strips a leading BOM on read, since Notepad adds one to anything it saves;
  PowerShell rewrites native-command arguments cmd-style, so `node -p '…split(".")[0]'` reached
  node as `split(.)[0]` and the launcher concluded a machine with Node 24 had no usable Node; and
  `git ls-remote --exit-code -h <url> HEAD` matches no head ref, so git exits 2 in silence — which
  `bootstrap.sh` (reading stderr) called reachable and the port (reading the exit code) called
  unreachable. `-h` is gone from both, and the rule is now the same on both sides: the exit code
  decides, stderr chooses the sentence.
- **`./bootstrap.sh` — the launcher, and the Node-free design-only path.** With Node ≥ 20 it
  `exec`s the Node CLI, forwarding every flag and exporting `CLAUDE_PROJECT_DIR` (the launcher's
  spawn is our spawn). Without Node it finishes design-only itself in bash 3.2 — the version macOS
  ships — with a test that greps for every forbidden 4.0+ construct and proves the grep is not
  vacuous. **Nothing is written twice:** the recipe is *sourced* from the generated
  `docs-recipe.sh`, and the sentences are generated into a marked region from `remedies.json`,
  `net-sentences.mjs` and `text.json`, with a parity test comparing each against its source. This is
  the file that runs on machines with no Node to check it, so a drifted copy would go unnoticed for
  a release. **B07 without Node never merges**: it writes the disable toggle when the file is
  absent, says `ok (already set)` when the toggle is there, and otherwise fails with the exact key
  to add by hand — merging JSON in bash is how someone's settings get destroyed. The state and the
  cache are written by heredoc in S03's and S08's schemas and the Node readers accept them, checked
  against a fixture captured from a real bash-3.2 run.
- **B09 — one verdict, one Mode line, and the exact next thing to type.** The `Mode:` line now has
  **one definition** (`lib/text.mjs`), quoted verbatim by four programs; the doctor's detailed
  variant appends its findings rather than being a second Mode line, and the ARC-02-S11 stub and the
  user guide are reconciled to that split. The dialog count is one sentence per dialog and never a
  hedge — `EXPECTED_DIALOGS` is 1 from the owner's 2.1.258 sitting, and a test reads the
  `03-RISKS-AND-UNKNOWNS.md` §F row rather than another copy of the number. Command spellings follow
  the **shell**, not only the platform: Git Bash on Windows runs `./bootstrap.sh` perfectly well.
  `text.json` is generated from the same module for the Node-free launchers, and `--json`'s `next`
  carries the very string the human run printed.
- **Every child the bootstrap spawns is now TOLD which checkout it serves.** `CLAUDE_PROJECT_DIR`
  is the project root of the session that spawned a process, so when our tools spawn something they
  *are* that session and an inherited value is somebody else's answer. Read from the environment, it
  made B08 start a server from whichever repository the surrounding Claude Code session was in
  (`Cannot find module`, exit 1) and would have made the server CLI read and write **that**
  repository's `.local/instances.json`. Invisible in a plain terminal and in CI, where the variable
  is unset — found by a reviewer running the tests inside a session, which is the context ARC-07 and
  ARC-08 will live in. One helper (`childEnv`) now serves every spawn, npm included, and a test
  plants a bogus value.
- **B08 — the server started the way Claude Code will start it.** `lib/mcp-handshake.mjs` speaks
  newline-delimited JSON-RPC over a real child's stdio, stdlib only, with cursor pagination, one
  retry on an EPIPE at spawn, and every exit through one settle under one deadline. B08 **spawns
  rather than imports**: the server package has an in-process doctor, and reusing it would prove a
  library works when imported, which is not the thing that fails. Three comparisons catch opposite
  mistakes — a tool the contract does not know means `dist/` is ahead of the pin; a *pinned* tool
  the server does not advertise names its `used_by`, because those are the files that will break.
- **`.local/doctor-last.json` v1 — the banner's contract.** ARC-08 may add keys, never rename
  `version`, `at`, `writer`, `mode`, `checks` or `summary`. 0600 and atomic, with the mode applied
  to the temp file **before** the rename so the finished file is never briefly world-readable, and
  through the same write-time secret guard as the bootstrap state.
- **A refused instance file now costs nothing.** Its mode and path are checked at parse time as
  well as in B06: both answers need no read and no network, and B06 is reached only after B04 has
  installed 72 MB. Checked twice on purpose — the file can change in between, and B06 is also
  reachable from a resume that never passed through the parser.
- **B03, B04, B05 and the B06 slot — live mode becomes one uninterrupted run.** B03 writes down the
  mode the plan already collected and asks nothing; because the mode is a hashed input of B06, B07
  and B08, changing it re-runs exactly those three as a property of the inputs rather than a rule.
  B04 runs `npm ci --omit=dev --ignore-scripts` at the root as a script under the running Node —
  `child_process` refuses a `.cmd` without a shell, and `--ignore-scripts` is the difference between
  installing packages and running whatever their authors put in `postinstall` on a freshly cloned
  machine. Its post-check asks whether every dependency the server *declares* resolves *from
  `dist/server.js`*, so it is hoisting-safe and cannot go stale; it treats
  `ERR_PACKAGE_PATH_NOT_EXPORTED` as present, because only an installed package can refuse a
  subpath — the obvious probe reported `commander` as missing in this very repository. B05 checks
  the contract's sha, the pinned tools and the registration key, in **both** modes.
- **`--instance-file` — a live install with no keyboard.** A store-shaped document, mode 0600
  checked **before it is read** (a file the group can read has already leaked), refused if git could
  commit it, and never copied, moved or deleted. **The D-05 proposals are applied before
  validation**, an order that is forced rather than chosen: the store schema is strict and requires
  `environment` and `preset`, so a file that omits them — exactly the file D-05 says to accept —
  cannot be parsed until they are filled in. Presets are chosen by **shape** rather than by name,
  since "most permissive" and "most restrictive" are roles the contract expresses as flag counts.
  The password is registered with the redactor the moment it is parsed, and the credential is
  authenticated **exactly once**: a non-interactive path has nobody to ask for a correction, so a
  retry is the same wrong password sent again — noise in the instance's audit log and, on some
  configurations, a lockout.
- **B02 — the documentation corpus, as one step over ARC-03's recipe.** `--docs sparse|full` pass
  the plan's mode through; `--docs skip` never reaches the step, so no code path can make a network
  call the operator declined. The step maps the docs family's exit codes onto remedies and keeps
  ARC-03's own sentences for the network and dirty-tree cases, because a second phrasing gives one
  situation two descriptions. **A dead citation is a WARN, never a failure**: the corpus is present,
  the fix belongs to a maintainer, and refusing to install over it would punish the wrong person.
- **One recipe, four readers.** The git-only recipe is now generated into THREE files — the block in
  `docs/ARCHITECTURE.md` and the two launcher files under `tools/snowarch/launcher/` that the
  Node-free `bootstrap.sh` and `bootstrap.ps1` will source — from the one module `docs sync
  --print-recipe` also renders from. The parity test diffs every target with a unified diff naming
  the file and the line, and a pin bump stages five paths when the pin moves and two when it does
  not. Each target declares the platform it is written for, and the generator writes with the
  file's **own line endings**: `.gitattributes` stores `*.ps1` as `eol=crlf`, so a generator that
  spliced LF would have reported STALE for ever on a clean checkout.
- **B01 and B07 — the workspace, and two toggles merged into a file that is not ours.**
  `.claude/settings.local.json` belongs to the operator: B07 reads it, applies the server's entry to
  `disabledMcpjsonServers` (design) or `enabledMcpjsonServers` (live), and writes the same object
  back — other keys untouched, other array members preserved, key order kept, new keys appended.
  **Invalid JSON is the only failure mode and it changes nothing**, because a stray comma must not
  cost someone their permission grants. The file must be gitignored before anything is written, or
  Claude Code will not apply its approvals. `applyToggles()` is exported, so ARC-08's `--fix` and
  `snowarch mode` write it the same way rather than each having an opinion.
- **The SessionStart hook is S-05 variant B.** The committed `settings.json` stays hook-free and B07
  writes the hook into the *local* file only when Node ≥ 20 is present, removing it otherwise — a
  hook that runs `node` on a machine without Node is an error on every session start. No
  `disableAllHooks` branch: it would have silenced the operator's personal and plugin hooks too.
  `tools/snowarch/hooks/session-start.mjs` ships as a stub (ARC-08-S08 gives it a body), because a
  hook entry naming a file that does not exist is worse than one that says "unknown".
- **B01 verifies the registration files two ways.** `git diff --quiet HEAD` sees an uncommitted
  edit; ARC-06-S01's rules — lifted into `lib/registration.mjs` and now imported by both B01 and the
  S01 test — see one that was committed. One definition, so a rule tightened in the test is a rule
  the bootstrap enforces.
- **`.local/config.json` v1**, whose `defaultInstance` is a mirror and never a second source. It is
  read through `readDefaultLabel` — a new zod-free store module that returns exactly one key — so no
  URL, username or credential can reach a file that, unlike the store, is not 0600. Zod-free because
  a design-only checkout never runs `npm ci`.
- **The cloud-sync warning names the provider.** The committed server build already answered
  *whether* a path is inside a synced folder; `lib/cloud-sync.mjs` adds *which*, and a test asserts
  the two never disagree. WARN and not FAIL: 0600 is a local permission and the sync client runs as
  the same user, but where someone keeps their code is their decision.
- **B00 preflight — seven checks, one named remedy each, before anything is installed.** Root
  (compared through `realpath`, because `/tmp` and `/var` are symlinks on macOS and a checkout
  reached through a link used to be told to `cd` to where it already was), git, Claude Code, disk,
  network, Node and the machine. **Every check runs even after one has failed**: an operator
  missing git *and* behind a TLS-intercepting proxy learns both in one pass. Any FAIL is exit 3 —
  a missing prerequisite is not the same event as a failed step — and it happens before the plan
  screen, so nothing is written and no question is asked that the machine has already answered.
  Floors come from `engine.config.json`, and a test strips comments from every module under
  `lib/` to prove none of them spells one.
- **One network vocabulary, now shared.** ARC-03-S05's DNS / proxy / TLS / disk sentences moved to
  `lib/net-sentences.mjs`; `classifyGitFailure` and the new `lib/probe-net.mjs` both import them, so
  an operator behind a corporate proxy does not learn two vocabularies for one problem depending on
  which half of the tool noticed first. The one parameterised difference is the CA sentence, which
  names the failing tool's knob first and the other second. The probe speaks CONNECT to an
  `HTTPS_PROXY` over `node:net` + `node:tls` — stdlib only — honours `NO_PROXY`, and **never puts a
  credential on the CONNECT line**: a proxy that needs authentication is a case it reports rather
  than solves.
- **`lib/remedies.json`** — `{ checkId: { darwin, win32, linux, default } }`, held as data because
  the Node-free launchers print the same sentences with no Node to read them and the doctor quotes
  the same table. An unfilled `{placeholder}` throws rather than being shown to a user.
- **The step registry** (`lib/steps/B00…B09.mjs` + `lib/steps/index.mjs`), with the step bodies
  still to come in ARC-06-S04…S09. Their `inputs()` are real now, so the cache, resume, `--from`,
  `--reset` and interrupt semantics are all exercised today rather than after the last body lands.
  Inputs are tagged `file:` or `text:` and an untagged one throws — read as a path, a literal like
  `design-only` would hash as `<absent>` and two different modes would share a digest. B02 hashes
  the corpus **gitlink** rather than 35,000 files; B06 hashes only whether the credential store
  exists and its schema version, so no hash input ever reads a credential.

### Fixed

- **A fresh install whose pin equals the branch tip produced an EMPTY corpus that called itself
  complete.** Two defects, both mine, found by the first real bump:
  - `syncCorpus` only ran `checkout --detach` when HEAD differed from the pin. A
    `git clone --no-checkout` leaves an empty index and an empty working tree, so when the pin *is*
    the branch tip its HEAD is already correct — "at the pin" was true and "there are files" was
    false. Every run for seven weeks had a pin behind the tip, so the fetch-by-hash path always ran
    and hid it. **Populated is now its own question**, checked from the index, and an unpopulated
    checkout is *repaired* rather than refused as dirty: an empty index reads as staged deletions,
    and telling someone they have local changes they never made is the wrong answer.
  - `docs sync` printed `INCOMPLETE` in its summary and then `docs sync: complete`, exit 0. The gate
    that stops that was deleted by accident at ARC-03-S06, when replacing the `--json` object
    swallowed the block beside it. Restored, with the three tests that would have caught it.
- **The recipe block in `docs/ARCHITECTURE.md` is now GENERATED.** It embeds the docs pin, so the
  byte-for-byte parity test failed on every bump pull request by construction. `gen-docs-recipe.mjs`
  joins the generator list and `--check` is the same guarantee without the built-in failure — *a
  documentation block that embeds a moving value must be generated, not asserted.*
- **...and the bump now regenerates it, because generating it was only half the fix.** Making the
  block generated stopped the parity test failing by construction; it did not stop the block going
  stale. `syncUpstream` writes the pin, so the instant it does, the document embedding that pin
  contradicts it — and the pull request would have shipped a recipe naming the commit it was
  moving away from, with a red `gen-docs-recipe --check` in its own CI. The refresh now runs the
  generator after the pin write and stages `docs/ARCHITECTURE.md` as a third path when the block
  actually changed. The rendering and the splice moved to one module both callers import, so
  "what the block looks like" is not defined twice. Two things fell out of writing it: the
  refresh has to re-read the config it just wrote (the in-memory copy still held the old pin, and
  rendering from it would have reported "current" and staged nothing — a fix that looks like it
  works), and the dry run's restore had to stop naming one file and start following the staged
  list, or it left the regenerated document modified in the tree.
- **`docs-bump.yml` builds from the pull request's base**, not the ref it was dispatched on. The
  first real run was dispatched from `main` and computed its "from" pin against main's tree — right
  only while the two branches share a pin. One value, used by the checkout and by `--base`, asserted
  equal by test. The two repository settings the workflow depends on and cannot assert are named in
  its header, in `CONTRIBUTING.md` and as an ARC-08 doctor candidate.

### Added

- **The MCP registration travels with the clone.** `.mcp.json` and the non-permissions half of
  `.claude/settings.json` are committed, secret-free and asserted — the first story of M3.
  - `.mcp.json`: `stdio` · `node` · `${CLAUDE_PROJECT_DIR:-.}/packages/snowarch/dist/server.js`,
    forward slashes only, every `${…}` carrying a `:-` default because an unset variable without one
    is passed through as literal text. The `env` block is **`SNOW_STORE` and `SNOW_LOG_LEVEL` only**:
    ARC-00 S-20 confirmed the spawned server inherits the launching shell's environment, so proxy
    and CA variables need no repeating.
  - `settings.json` gains `env.MCP_TIMEOUT: "120000"` — S-06's measurement, about 160× the worst
    handshake over 27 runs on nine CI cells — beside the **generated** `permissions`. It stays
    **hook-free** per S-05: a `SessionStart` hook in the committed file would run before Node is
    known to exist.
  - `tests/registration-files.test.mjs` asserts the server key against `engine.config.json` rather
    than a literal, every placeholder's default, the S-20 key set, the absence of a `hooks` key, that
    neither file carries a credential-shaped key or value, that both are tracked while
    `settings.local.json` and `.local/` are ignored, and that a regeneration leaves `env` intact.
  - **Engine lint L02 and L07 no longer SKIP.** Both `.mcp.json` legs run: eleven checks, no notes.
  - **`~/.claude.json` is written by nothing here** — P-01's file. Measured: starting a session
    changes exactly one top-level key, `cachedGrowthBookFeaturesAt`, the CLI's feature-flag cache.

### Added

- **The recipe, proved against the real corpus on three operating systems — and ARC-03 is complete.**
  `.github/workflows/docs-real.yml` fetches the actual 300 MB corpus on Ubuntu, macOS and Windows,
  weekly and whenever the code that decides the checkout changes. Measured on its first green run:
  **179 MB tree / 34,360 files** (183 MB on Windows), **25.3 s Ubuntu · 27.5 s macOS · 35.1 s
  Windows**, `dead: 0` everywhere, `core.longpaths true` on Windows.
  - **The longest path is 197 characters inside the corpus and 272–286 on disk.** Both are printed,
    because they answer different questions — and the second is already over `MAX_PATH`, which is
    the S-07 margin argument as a measurement rather than a prediction.
  - A second Windows cell keeps Git Bash on PATH. **Acceptance criterion 5 was vacuous until this
    story's fourth fixup**: every step said `shell: bash`, which on Windows *is* Git Bash, so the
    cell meant to prove independence from bash was running under it. The job is now one Node entry
    point under the platform's default shell, and the log distinguishes "bash reachable" (True — the
    image carries one in System32) from "git bash reachable" (False after the strip).
  - `E12_ABSENT(mode)` in `status.mjs` is the doctor's absent-corpus line, printed by `docs status`
    and imported by ARC-08 rather than retyped: **FAIL, never WARN or SKIP.** With no corpus and no
    state file the mode is `skip` — an absent checkout has no shape to infer from — while a recorded
    mode still wins, because an operator who asked for `sparse` and has none has a broken install.
  - The recipe-parity negative now changes **one character** (`--depth 1` → `--depth 2`): a lost line
    is the easy case, and a single byte is what ships a different checkout while looking identical.

- **Attribution, the measured figures, and one corpus section instead of six.**
  - Every successful `docs sync` now ends with
    `docs: ServiceNow product documentation © 2026 ServiceNow, Apache-2.0 — vendor/ServiceNowDocs/LICENSE`
    — suppressed by `--quiet`, never inside `--json`, and the same constant closes the launcher
    recipe and appears in `README.md`. Three copies of a licence line is three chances for one to be
    wrong, so a test compares them.
  - `NOTICE` gains the corpus paragraph. Its claim that the corpus's `LICENSE` **and `legal/`** are
    "preserved in every checkout, sparse or full" was **not true when written**: `legal/` is a root
    DIRECTORY and cone mode materialises root files only. The recipe now carries it by name and the
    completeness check fails without it — the claim is enforced rather than softened.
  - `README.md` carries the install figures: **302 MB and about 35 s** sparse (measured 2026-09-06,
    ARC-00 S-07), and **447 MB / 48,997 files** for `--mode full` (measured 2026-09-09 — S-07 never
    measured full mode, and the README says so rather than borrowing a number).
  - `docs/ARCHITECTURE.md`: the six corpus sections S05–S09 each added are folded into one —
    "Docs corpus: how the pin, the areas file and the gate relate" — three artefacts, who writes and
    reads each, four invariants, then the commands, the exit table and the recipe block.

### Fixed

- **`sync` reported "up to date" over a checkout missing a directory it required.** Adding `legal/`
  to the cone changed what the recipe WRITES but not what `inspect` COMPARED, so the two disagreed
  and the comparison won. One definition of the cone now, used by both.
- **The `ai-gateway-overview.md` citation, remapped in three places.** Upstream withdrew the AI
  Gateway surface between `ba513f2` and `11b39be` — at the tip there is no `ai-gateway*` page and no
  MCP page in `ai-control-tower/` at all, so this was a withdrawal, not a rename. The rows now cite
  `configure-third-party-llms-using-ai-control-tower.md` and `ai-model-providers.md`, which resolve
  at **both** pins. The bump report named one dead path; there were **three citation sites**, because
  the report groups by path, and a remap has to fix every site.

- **The weekly docs bump, as a schedule rather than an intention.** P-11 records a monthly refresh
  ritual that was never executed; `.github/workflows/docs-bump.yml` runs it on Mondays at 05:17 UTC
  and opens one pull request. **It never merges.**
  - `scripts/docs-bump.mjs` is a thin wrapper. Everything that decides anything stays in the
    upstream refresh; this renders the pull-request body — a three-item checklist, then S07's report
    **verbatim inside a fence**, so a reviewer comparing it against a local run finds the same bytes.
  - One bump at a time: the branch is named for the target SHA, so a re-run updates the PR instead
    of opening a second, and a newer tip closes the older one as `superseded by #<n>`.
  - A **dry run** exits 0 with the body in the log and a `::warning::` annotation for newly dead
    citations — reporting is its job, and the red build belongs on the pull request where someone
    can act on it. Exit 6 fails the job loudly; exit 4 cannot happen on a fresh checkout and is
    treated as a bug in the recipe if it ever does.
  - `actionlint` joins CI. The workflows are code, this one has a multi-line shell step with `gh`
    calls and expression interpolation, and nothing else was checking them.
  - Tests stub `gh` with a script on PATH that records its argv — never the real one. A test that
    could open a pull request would defeat the point of a workflow that never merges.

- **`docs family <name>` — the release-family switch, proposed before it is applied.** The dry run
  is the proposal and `--yes` applies exactly what it printed; no line is edited that was not shown.
  - **EDIT only when the matched phrase is the line's ONLY family mention.** Anything else —
    "NOT available in the Australia release family, unlike Vancouver" — is listed under REVIEW
    whole, because half a sentence about the new family and half about the old is worse than a line
    nobody touched. On the real tree that is **53 EDIT and 69 REVIEW** lines, every gateway skill
    carrying at least one of each.
  - **The pin moves first, while the tree is still clean**, so S07's dirty-tree refusal guards the
    whole operation instead of tripping on this command's own edits. A tree dirtied between the dry
    run and the apply is refused before anything is written.
  - A failing lint exits 1 with everything staged — the maintainer needs the edits to fix what the
    lint caught — and the output ends with how to finish and how to abandon.
  - History (`docs/plans`, `docs/spikes`, `docs/decisions`, the changelog, RELICENSING) is never
    scanned, listed or edited: it records what was true when it was written.
  - The stored transcript is `docs/validation/ARC-03-S08-family-dry-run.md`.

- **`docs sync --upstream` — the maintainer refresh.** Fetches the family tip (or a named SHA),
  moves the pin and the gitlink, re-runs the citation gate and prints which citations *became* dead.
  It stages both paths and **commits nothing**: a human reads the diff and decides.
  - The baseline verify runs **before** the move, because "newly dead" is a difference between two
    states and the first stops existing the moment the corpus moves.
  - The pin write replaces one 40-hex string rather than reparsing the file, so the reviewer's diff
    is one token and not a reformat; it refuses outright if the file does not hold the pin it was
    told to replace.
  - Exit **1** means the pin moved *and* citations broke — both true, and the pin is staged because
    you need the new corpus to repair the citations against it. Exit **6** is new: the upstream does
    not have what was asked for (renamed family branch, unreachable SHA), and nothing moved.
  - An upstream history rewrite that leaves the tip *behind* the pin is followed, not refused, and
    the report says `(older than the current pin)` — staying put would hide the rewrite.
  - `docs status` now reads the gitlink from the **index**, so a staged bump reads as `ok` with
    `(staged)` rather than as a mismatch against a pin the maintainer just moved.
  - `docs/CONTRIBUTING.md` gains "Refreshing the corpus"; `docs/ARCHITECTURE.md` gains the sequence
    and one exit-code table for every `docs` sub-command.

- **`docs status`, `docs verify --json`, and one description of the corpus.**
  `tools/snowarch/lib/docs/status.mjs` computes what the doctor and `/snowarch status` will both
  quote — present, pinned, right family, correctly sparse, fully cited — instead of each re-deriving
  it. Twenty keys, `schema: 1`, never a network call.
  - Two distinctions the shape is built around. `mode` is what was **asked for** (ARC-06's state
    file) and `sparse` is what is **on disk**; they can disagree, both are reported, and the
    disagreement is the finding. `citations` is `null` under `verify: false` but **the key is always
    present**, so a consumer can tell "not asked" from "asked and empty" — the doctor's `--quick`
    path and the SessionStart banner depend on that difference.
  - `familyMatches` comes from the tracked branch, not from HEAD: recipe C leaves a detached HEAD at
    the pin, so HEAD says nothing about the family.
  - `sync --json` now prints this object; S05's placeholder and its "replaced by S06" comment are
    gone.
  - `LEGACY_ROOTS` and `scanRepo`'s `legacy` flag are retired — ARC-02 deleted the root mirrors, and
    a flag whose only value pointed at directories that no longer exist is a way to scan nothing and
    report success.

- **`docs sync` completed: modes, reconcile, refusal, failure mapping and a printable recipe.** S03
  delivered the checkout; this is the rest of it, in the same module rather than a second one.
  - `--mode sparse|full`, defaulting to `docs.mode` in `.local/bootstrap-state.json` when ARC-06 has
    written one. `skip` is a bootstrap flag, not a mode: it means *do not call sync*, so it is
    refused rather than quietly treated as sparse. Switching either way is a config change on the
    existing checkout — no re-clone, `.git` unchanged.
  - **Reconcile**, each step idempotent and in order: dirty tree refused first, then clone, mode,
    pin (fetch by hash only when the object is absent), gitlink, and ADR-0008's root-file repair. A
    second run on a clean checkout issues no git write at all and says `[docs] up to date (…)`.
  - A dirty working tree inside the submodule exits **4** with one sentence and touches nothing;
    `--force` is never reached for. Every other git failure exits **5** with the sentence the
    operator needs — DNS, proxy (address printed, credentials masked), TLS interception, an
    unfetchable pin, no disk space, or git's own first stderr line, never swallowed. The classifier
    is unit-tested against canned stderr because a `file://` fixture cannot produce any of it.
  - `--print-recipe` prints the git commands for the caller's actual state, and
    `docs/ARCHITECTURE.md` gains the git-only launcher recipe that ARC-06 executes when Node is
    absent. `tests/docs-recipe.test.mjs` asserts the two are byte-identical, so the block cannot
    drift from the module.
  - `--json` prints a minimal `{ pin, mode, areas, files, bytes, complete }` object. **Temporary:**
    ARC-03-S06's `docsStatus()` replaces this shape; nothing should be built on these keys.
  - `tests/docs-sync.test.mjs` builds a fixture corpus and serves it over `file://` — no network.
    Two states it goes out of its way to produce, because they are the ones that break the recipe:
    a pin that is not the branch tip (so fetch-by-hash is genuinely exercised) and a submodule whose
    `.git` is a file rather than a directory.

- **The eighteen behavioural tests move to `tests/VALIDATION-TESTS.md`, and describe the product as
  it now is.** They still described a two-surface product that D-03 cut, carried a per-test line
  naming those surfaces, cited tool names retired at S12, and reserved T-07 for a pre-commit sync
  hook deleted at S01. (The retired words are not quoted here: `tests/no-legacy-surfaces.test.mjs`
  scans this file, and quoting them to explain their removal is how they come back.)
  - `**Modes:**` replaces `**Tiers:**` on every test. T-05 and T-06 declare a **dormant** design-only
    variant — the engine states that no live instance is configured and makes no tool call — and say
    what a dormant PASS proves: that the gate holds when there is nothing to write to.
  - T-05's expected behaviour is keyed on "a tool marked `mutates: true`" rather than a tool name.
    The always-loaded rule file owns the names; a test that spelled one would need editing at every
    rename, which is how the old names survived there in the first place.
  - **New T-07 — Mode reporting and `/snowarch` in design-only**, in numeric position.
  - T-06 and T-13 gain a runnable `### Prompt`. Both described their scenario in `### Setup` and left
    the tester to invent the wording, which is not a repeatable test.
  - The dated regression baseline and the pointers to the removed run-history tables are gone;
    results belong in the pull request or under `docs/spikes/validation-runs/`.
  - `tests/validation-tests-shape.test.mjs` makes criteria 1–4 permanent, with four fixture-negatives.
    It reads the forbidden-name list out of the story's own grep expression rather than spelling it —
    written inline, the list made the test file fail the engine lint on itself.
  - `docs/CONTRIBUTING.md` gains "When to run the validation tests".
  - **Executed once, in design-only, on a clean clone — 18 of 18.** The first pass was 16 of 18, and
    both failures were real:
    - The CSM Specialist skill claimed in five places that the baseline case-escalation tables are
      absent from this release family. Ten corpus files name them. The published markdown escapes
      the underscores, so the grep that would have caught it returned nothing — the skill now says
      so, in its citation-discipline section, as a rule rather than a footnote. T-02's example rested
      on that claim and is replaced by one verified against the corpus first; its pass criteria, fail
      signals and bypass block are unchanged, because those are the test.
    - The Operational Documentation consult did not survive a refused deployment. `CLAUDE.md` §8 now
      says the go-live proposal fires even when the deployment is declined or deferred — a refusal is
      exactly when the runbook is still outstanding. Line count unchanged at 125.
    Both fixes were re-run twice each; the run record keeps the first tally and its analysis beneath
    the final one.

- **`/snowarch` — the first utility skill** (`.claude/skills/snowarch/SKILL.md`): `status` (and the
  plain word `Status`, which `CLAUDE.md` §2 routes here), `setup-instance` with its `--resume` half,
  and `doctor`. One skill with three branches, because `$ARGUMENTS` substitution is confirmed on CLI
  2.1.258 — the three-skill fallback was not needed. It reports and configures; it never designs,
  never calls an MCP tool, and never asks for a credential: `setup-instance` collects a label and a
  URL in chat and hands the rest to the user's own terminal.
  - `engine.config.json` gains `roster.utility`, the single source that keeps a utility skill out of
    the persona count in the roster generator, the skills lint, `tests/engine-config.test.mjs` and
    `tests/skill-listing.test.mjs`. A name there that has no directory now fails.
  - `tests/snowarch-skill.test.mjs` holds the shapes that carry the guarantee — the tool grant, the
    Mode-line shapes, the five-step hand-off with its Windows line, and the count of sentences
    mentioning a password — each proved against a deliberately broken copy.
  - `tests/fixtures/snowarch-doctor-stub.sh` stands in for the doctor until ARC-06/ARC-08 build it.
  - Two defects found by running it rather than reading it, both in the file and both fixed: the
    Mode line was being decorated, and the "doctor unavailable" fallback named a cause it had not
    checked. Evidence: `docs/spikes/validation-runs/ARC-02-S11-snowarch-skill.md`.
- `docs/USER-GUIDE.md` gains a "`/snowarch` commands" section — the three sub-commands, how to read
  the four `Mode:` shapes, and why setup hands off to the terminal.

### Fixed

- **Preconditions in tests are now asserted, and one guard could never have worked.** A sweep of all
  75 test files after ARC-03-S06 found a vacuous test — a `git config` the worktree config outranked,
  so the state it "broke" was never broken and the repair it claimed to exercise never ran. Three
  fixes and a standing check:
  - `tests/docs-status.test.mjs` — the HEAD-off-the-pin and narrowed-sparse-set cases assert the
    fixture actually moved before asking the subject about it, so a fixture failure no longer reads
    as a module failure.
  - `packages/snowarch/tests/tools/parity.test.ts` — its `beforeEach`/`afterEach` deleted and
    restored `MCP_TOOL_PACKAGE`, **which cannot work**: `src/tools/index.ts` builds the catalogue at
    module scope, so the variable was read at import, long before either hook ran. Replaced by an
    import-time assertion that names the variable and says a different package needs a different
    process. No change to the code under test.
  - `tests/precondition-asserts.test.mjs` — the rule as a test. Mutating state that already exists
    (git config, checkout, sparse set, index) must be followed within two lines by an assertion that
    it took. Building a fixture from nothing is deliberately not covered: there the write is the
    input, and a failed write fails the test on its own.

### Changed

- `CLAUDE.md` rewritten to a line budget: **425 lines → 125**, 57,688 bytes → 10,997, against a cap
  of 200 and 20,000. It is loaded before every turn, so its length is a cost paid on every request.
  Nothing was deleted without a home: the repo map and the roster registry are now the generated
  sections of `docs/ARCHITECTURE.md`, the write gate and capture protocol are the generated rule
  file and `governance/mcp-protocols.md`, the worked example and the two embedded validation tests
  are `tests/VALIDATION-TESTS.md` T-01/T-02/T-03, and the two engine-version footers (v2.7.7–v2.8.0) are
  the two newest entries under "Before 2.0.0" below, verbatim. The
  five-row gateway table and the Code Reviewer proposal sentence are copied byte-for-byte, because
  they are what the behavioural tests assert.

### Fixed

- **A spawned child is reaped before its temp directory is removed.** Three suites drive the built
  server over stdio into a `mkdtemp` directory and remove it in `afterEach`. `client.close()` is a
  graceful shutdown, not a join — the SDK transport races the child's exit against a 2 s timer and
  returns either way — so on a loaded runner the removal walked a directory the child was still
  writing into and threw `ENOTEMPTY`, failing the build on the teardown of a test that had passed
  (`macos-latest` / node 24, one job of 25). `tests/helpers/server-child.ts` now tracks each child by
  the pid captured at spawn time, waits for it to be gone (`SIGKILL` after 500 ms, since a child that
  ignores `SIGTERM` cannot be waited out) and only then removes the directory, with `maxRetries` to
  absorb a write already in flight. Proved against a fixture child that ignores `SIGTERM` and writes
  every 2 ms: the old teardown gives `ENOTEMPTY`, the new one removes the directory.
- **CI ran twice per commit on a work branch.** `on.push.branches` included `arc-*/**` and `chore/**`
  as well as the branches a merge lands on, so a push to a branch with an open pull request started
  two full 25-job matrices for the same SHA. They shared a runner pool, and that contention is what
  surfaced the teardown race above. Push now triggers on `main` and `develop` only; work branches
  reach CI through `pull_request`, which is where their result is read. `docs/CONTRIBUTING.md` carries
  the process rule that makes this reliable — a story branch gets its draft pull request at first push.
- `snow_us_active_update_set_ensure` advertised the input shape it had *before* the update-set
  capture rework: `default_name`, and nothing required. The handler has required `name` since that
  rework, so a caller following the published schema passed `default_name` and got
  `INVALID_REQUEST` for a field it had been told was optional. The schema now says what the handler
  enforces — `name` required, `description` optional, `default_name` gone — and the tool's own
  description no longer promises to "create one automatically if none is in progress", which was
  the same stale behaviour. `dist/contract.json` is unchanged (it carries no schemas), so the
  engine pin and its sha are untouched.

---

## Before 2.0.0

Everything below is the imported engine's history, kept as written. **The term "Tier" below is
historical** — it is the retired permission and surface vocabulary that ARC-02-S06 replaced with
Mode (`design-only` | `live`) and Preset (`read-only` | `pdi-developer` | `full` | `custom`), and the
file paths are the ones those entries were written against. Rewriting them would falsify the record
of what was decided and when. ARC-09-S02 regenerates this file from conventional commits.

The two entries that follow (v2.8.0 and v2.7.7–v2.7.8) are the engine's version footers, moved here
verbatim from the imported `CLAUDE.md` by ARC-02-S08; the imported changelog itself ended at v2.7.6.

## v2.8.0 — Phase 2.8 (Delivery Governance) opens

*v2.8.0 — Phase 2.8 (Delivery Governance) opens. Two skill-only cross-cutting advisory consults added, taking the roster to 27 (corrected from "25" — see the authoritative roster-count note): **Licensing & Entitlement Specialist** (`skills/licensing-specialist/`) — what a design costs to license (subscription/fulfiller, SKU/tier, App Engine units, Now Assist Assists, third-party SaaS), §3.1 consult + post-build review; and **Estimation & Sizing Specialist** (`skills/estimation-specialist/`) — the sizing methodology and the number (ranges, ServiceNow complexity rubric, contingency, baseline-vs-custom §1.1 delta), recorded into baseline SPM. New governance family **§4 Delivery Artefact Governance** in `governance/governance-rules.md` — ADR (§4.1), Requirements Traceability / RTM (§4.2), RAID & NFR (§4.3) — seeded from new engine-level `templates/` (adr / traceability-matrix / raid-log / nfr-checklist). Wiring: taxonomy v1.5 (roster 25, §3.1 consults, §2.4 boundaries, §4.5 triggers), prompt-patterns v1.2 (PP-20 estimation, PP-21 licensing, PP-22 ADR, PP-23 RTM, PP-24 RAID/NFR), CLAUDE.md repo map + roster + §3.1 table + Artefact standards + Phase delivery-governance touchpoints. Carries forward v2.6: docs/ knowledge base, Standing Rule, repo map.*

## v2.7.7 – v2.7.8 — Diagramming Specialist; the document-gateway rule

*CLAUDE.md v2.7.8 — Phase 2.7 arc: CMDB & CSDM Specialist promoted to 5th v2.0 Domain Expert gateway with Phase 1 Step 5 wiring + multi-gateway co-fire rule (v2.7); Security & GRC consult/review skill (v2.7.1); repo-wide ServiceNowDocs citation-path audit, ~50 dead paths remapped (v2.7.2); ATF Author skill + batch sub-agent (v2.7.3); Operational Documentation skill, completing the §6.2 consult chain (v2.7.4); Discovery Specialist + UI/UX Specialist skills (v2.7.5); the final six specialist skills — Performance & Scale, SPM, App Engine, Migration, Reporting & Analytics, DevOps / Release Manager (v2.7.6), completing the 22-specialist roster (every specialist now has a SKILL.md). Diagramming Specialist added as the 23rd specialist and 9th sub-agent — skill + batch diagram-pack sub-agent, wired as a §6.2 post-build consult plus HLD/LLD Writer and Technical Designer downstream handoff; depicts architecture (Mermaid/draw.io/PlantUML/SVG), never decides it, and flags unapproved custom objects PENDING per §1.1 (v2.7.7). Merged with the RobertBH17 line (field notes, F-0xx fixes, T-11/12/13; this session's tests renumbered T-14/15/16). Document-gateway rule — Domain Expert gateways now also fire before finalizing a domain-scoped document deliverable (proposal / scoping doc / HLD / LLD / PDD), not only before builder dispatch; Phase 1 Step 5 intro + new "Document deliverables fire the gateway too" note, and taxonomy §6.1 Step 7, updated accordingly (v2.7.8).*

## v2.7.6 — Final six specialist skills — roster is now 100% skill-backed

**Released:** June 2026
**Trigger:** Six roster specialists were still persona-only (no SKILL.md), so "all specialists available for any engagement" wasn't literally true. This closes them.

### Added (skills/, mirrored in .claude/skills/)

- **performance-scale-specialist** — §3.1 consult + post-build scale audit. Query design (GlideAggregate/index/no-nested-loops), async/batch, data growth & archival, transaction limits, reporting-at-volume. §1.1: a shadow/summary table is the wrong reflex — use a PA indicator/index.
- **spm-specialist** — Strategic Portfolio Management: demand→idea→project/program→portfolio, investment funding, resource management, agile/SAFe. Grounded in `it-business-management/`.
- **app-engine-specialist** — custom low-code app architecture (scope strategy, App Engine Studio, decision tables, document templates, AEMC). **§1.1-critical** — proceeds only on an explicit Chief-Architect-approved custom app, and stays baseline-first inside it.
- **migration-specialist** — one-time data migration (data sources → import sets → transform maps → coalesce → reconcile → cutover/rollback). Bounded against Integration (ongoing sync). §1.1: map to the baseline target, no custom "legacy data" table, no custom dedup (coalesce/IRE).
- **reporting-analytics-specialist** — reports, dashboards, Performance Analytics; makes the explicit **report-vs-PA** call. §1.1: a PA indicator, never a custom rollup/data-mart table.
- **devops-release-manager** — §3.1 consult: update-set strategy, App Repository/AEMC, DevOps Change Velocity, CI/CD APIs, environment/clone strategy, backout. Bounded against Integration (the CI-tool wire). §1.1: baseline release mechanics, no custom deployment framework.

All grounded in verified ServiceNowDocs paths (0 missing citations); skill-only (no sub-agents).

### Changed / fixed
- taxonomy §1: the six rows marked ✅ — **every one of the 22 specialists now has a SKILL.md**. Also fixed a merge-residual: ATF Author's batch sub-agent was wrongly shown as "planned / 7 sub-agent files" — corrected to ✅ batch sub-agent / **8 sub-agent files** (it was built in v2.7.3).
- CLAUDE.md: registries updated, §3.1 consult rows point at the Performance & Scale and DevOps/Release skills, persona-only line retired. TECHNICAL-ARCHITECTURE roster count 19 → **25 skills**. Engine version-of-record → v2.7.6.

### Roster state
**8 sub-agents, 25 skill directories, 22 specialists — all skill-backed.** No persona-only gaps and no referenced-but-missing files remain.

### Depth pass (skill v1.1)
The six v2.7.6 specialist skills were deepened to the rigour of the ITSM/CSM/HRSD gateways — each gained explicit **citation discipline**, **rigorous process/mechanics coverage** (e.g. Migration's transform-script lifecycle + data-type pattern table; Performance's six scale checklists; SPM's full demand→portfolio→agile map; DevOps's release-mechanics detail), a **domain anti-pattern table** (anti-pattern · baseline alternative · citation), **§1.1 hot-spots**, a **post-build review mode**, **termination conditions**, and a **hand-offs table** — while keeping each skill's correct output shape (a design/consult deliverable, not a forced 5-Part Envelope). All citations verified (0 dead). EXAMPLES for Migration/Performance/SPM expanded to multi-example.

---

## v2.7.5 — Discovery Specialist + UI/UX Specialist skills

**Released:** June 2026
**Trigger:** Pre-engagement hardening before a CSM ↔ ITSM ↔ CSDM build. Two persona-only specialists most relevant to that engagement were missing SKILL.md files: Discovery (the upstream requirements work a blueprint demands) and UI/UX (CSM lives in a configurable Workspace + a Service Portal).

### Added

- **`skills/discovery-specialist/SKILL.md` + `EXAMPLES.md`** — upstream requirements consultant (skill-only, sits *above* the routing protocol). Turns a blueprint/workshop/transcript into the structured **Discovery Output** — process scope, current-state, target-state requirements (MoSCoW), volume, sensitivity, personas/roles, gap analysis, §1.1 implications (flagged, not ruled), routing recommendation, OPEN QUESTIONS — shaped to match the **Input Contract** every Domain Expert gateway and the Story Writer already expect. Divergent/elicitation only; does not design, build, or rule §1.1. Example walks a CSM blueprint excerpt → full Discovery Output.
- **`skills/ui-ux-specialist/SKILL.md` + `EXAMPLES.md`** — designs the three UI surfaces: **configurable Workspaces** (Next Experience / UI Builder — UX pages, configurable lists/forms, contextual side panels, agent assist, declarative actions, unified nav), **Service Portal** (pages, widgets, theme), and **classic UI** (form layout, lists, UI policies, UI actions). Produces design specs, not code (Developer) or the data model (Technical Designer). Grounded in `platform-user-interface/` + `application-development/ui-builder/` (citations verified). §1.1: configuring baseline workspaces/portals/forms is configuration; new UX scopes / custom UIB components / custom widgets where baseline serves need approval.

### Changed

- taxonomy §1 roster: #20 UI/UX and #23 Discovery marked ✅. CLAUDE.md registries updated (Discovery noted as upstream-of-protocol; UI/UX pulled from the persona-only line). docs/TECHNICAL-ARCHITECTURE roster count 16 → 18 skills.

### Notes

Both are skill-only (no sub-agent); the 22-specialist count is unchanged (these were already in the roster as planned personas). All skill citations across the repo still resolve (0 missing). First commits authored under the RobertBH17 identity.

### Fixed (post-release QA review)

A thorough audit of all skills + agents + governing docs (structure was clean: frontmatter names match dirs, all internal refs + citations resolve, §1.1 in every skill, mirrors synced, no conflict markers). Fixed:

- **Engine version drift** — CLAUDE.md version-of-record was v2.7.4 while the CHANGELOG was v2.7.5; bumped title + record line + footer to v2.7.5.
- **Roster/count stamps** — README diagram "7 with sub-agents" → 8; INSTALLATION-GUIDE sample Status "v2.6" → v2.7.5; prompt-patterns "For: …v2.6" → v2.7.5; CLAUDE.md "PP-01 through PP-18" → PP-19.
- **Dangling reference closed** — the Now Assist Specialist referenced a `now-assist-genai` reference-knowledge skill that did not exist (same drift class as the earlier ATF/Op-Docs gaps). **Added `skills/now-assist-genai/SKILL.md` + `EXAMPLES.md`** — reference knowledge on Now Assist (OOB skill catalogue, Now LLM / AI-native SKU, Skill Kit, AI Control Tower governance), grounded in `intelligent-experiences/` (citations verified); the builder↔reference handoffs now resolve. Roster: 19 skill directories.
- **Cosmetic** — CSM gateway's "identical section headings" cross-reference updated to list all five Domain Experts.

---

## v2.7.4 — Operational Documentation skill (completes the §6.2 consult chain)

**Released:** June 2026
**Trigger:** The artefact standards and the §6.2 go-live consult referenced `skills/operational-documentation/SKILL.md`, but the file didn't exist — the last referenced-but-missing skill. The §6.2 hook proposed runbook + KBA authoring at go-live with nothing to adopt.

### Added

- **`skills/operational-documentation/SKILL.md` + `EXAMPLES.md`** (mirrored in `.claude/skills/`) — skill-only (no sub-agent), main-thread, fires post-build per §6.2 on a go-live signal (`ready for prod` / `sign-off` / `release` / `go-live` / `cutover` / `deploy`). Produces **runbooks** (operator/on-call: indicators, procedures, alert response, rollback, escalation), **KBAs** (baseline `kb_knowledge` / `kb_knowledge_base` / article templates / versioning / validity / review→publish / KCS create-from-incident), **training material**, and **user guides**. Audience is operators/support/end-users — explicitly bounded against the HLD/LLD Writer (architect audience) per taxonomy §2.4. Grounded in `servicenow-platform/knowledge-management/` (all citations verified). §1.1: KBAs are baseline configuration; a custom documentation/runbook table or custom publish workflow is a halt.

### Fixed / completed

- taxonomy §1 roster #24 marked ✅; CLAUDE.md "Consultants and documentation" entry now points at the skill.
- **The §6.2 post-build consult chain is now fully real:** Code Reviewer ✓, Domain Experts ✓ (5 gateways), ATF Author ✓ (v2.7.3), Operational Documentation ✓. No §6.2 consult proposes a capability the engine can't deliver.
- **No referenced-but-missing skill/agent files remain.** Every skill cited anywhere in the engine now exists with resolving doc citations.

---

## v2.7.3 — ATF Author skill + sub-agent (closes the ATF drift)

**Released:** June 2026
**Trigger:** CLAUDE.md, taxonomy, the artefact standards, and the §6.2 post-build hook all referenced an ATF Author **skill** (`skills/atf-author/SKILL.md`) and **batch sub-agent** (`agents/atf-author.md`) — but neither file existed. The engine *proposed* ATF coverage at sign-off and had nothing to adopt.

### Added

- **`skills/atf-author/SKILL.md` + `EXAMPLES.md`** (mirrored in `.claude/skills/`) — the ATF Author persona. Two modes: inline single-component (skill, fires post-build §6.2) and full-app batch (sub-agent). Covers the ATF data model (`sys_atf_test` / `_test_suite` / `_step` / `_step_config` / `_test_template` / result tables), the baseline step categories (Server / Form / Catalog / REST / Email / Application Navigation), test-design discipline (one behaviour per test, self-contained created-and-rolled-back data, explicit assertions, reuse via Test Templates, negative paths, spec coverage matrix), and **mandatory deployment notes** (runner placement, sub-prod enablement, scope/update set, `atf_test_designer`/`atf_test_admin` roles, data strategy). Grounded in `application-development/automated-test-framework-atf/` (all citations verified).
- **`agents/atf-author.md`** (mirrored in `.claude/agents/`) — the batch sub-agent: enumerates a scoped app's components, designs a suite (child suites split by runner type), returns a coverage matrix + deployment notes + a §6.2 manifest for any custom step config scripts.

### Fixed

- The "8 sub-agents" roster claim in CLAUDE.md is now **true** (7 + ATF Author). taxonomy §1 ATF Author ✅✅ is now accurate. The §6.2 ATF proposal now has a real skill/sub-agent to adopt.

### §1.1 discipline encoded

ATF tests are baseline configuration; a custom **step type** (`sys_atf_step_config` + config script) is a flagged extension whose script routes to Code Reviewer; a custom **table for test data/results** or a custom **test runner** is a §1.1 halt (use Create-a-Record-and-rollback + baseline result tables).

---

## v2.7.2 — Repo-wide citation-path audit and remediation

**Released:** June 2026
**Trigger:** While grounding the Security & GRC skill, the older skills were found to cite `ServiceNowDocs/` paths that don't exist in the current (Australia) tree — they assumed a `now-platform/` + flat `servicenow-platform/` layout that the docs don't use.

### Fixed

- **Audited every `markdown/…md` citation across all 13 skills (SKILL.md + EXAMPLES.md) — 70 distinct paths.** Found ~50 dead across **Developer (7/7), Code Reviewer (9/9), Integration Specialist (6/6), Flow Designer (7/7), ITSM (~14), ITOM/Discovery (6), CSM (4)**. HRSD, CMDB & CSDM, and Security & GRC were already clean. Agents carry no citations.
- **Remapped every dead path to a verified-existing target**, by real tree:
  - scripting/coding → `application-development/` + `api-reference/`
  - ACLs → `platform-security/access-control/`
  - ITSM processes → `it-service-management/<process>/` subdirs (the flat `…/incident-management.md` etc. never existed; real docs are in the subdirectories)
  - notifications/system-properties → `platform-administration/`; system-events → `build-workflows/system-events/`
  - Flow Designer → `build-workflows/workflow-studio/`
  - CMDB/IRE → `servicenow-platform/configuration-management-database-cmdb/`
  - IntegrationHub/MID/credentials → `integrate-applications/` + `it-operations-management/`; OAuth/mTLS → `platform-security/authentication/`
- **Verification gate:** after remediation, re-extracted and existence-tested all 70 citations → **0 missing**. Source/mirror sync confirmed.

### Known residual (cosmetic, non-blocking)

A few grounding-path *lists* in Developer/Code Reviewer/Integration/Flow now point multiple distinct concepts at the same correct file (the docs don't split those concepts into separate pages), so a description may not perfectly match its target. Paths resolve and are on-topic; tightening the prose/dedup is optional polish, tracked for a later pass.

---

## v2.7.1 — Security & GRC Specialist skill (consult + architectural-security review)

**Released:** June 2026
**Trigger:** Security & GRC was a §3.1 routing-time consult with an active persona but no SKILL.md — so the consult fired with nothing to adopt. The upcoming CSM ↔ ITSM ↔ CSDM work will hit it immediately (PII/ACL across the CSM boundary).

### Added

- **`skills/security-grc-specialist/SKILL.md` + `EXAMPLES.md`** (mirrored in `.claude/skills/`) — skill-only, **not a gateway** (deliberate: security is cross-cutting, not a single domain; its analog is Code Reviewer, not the Domain Expert gateways). Two modes: a **routing-time Constraint Note** (§3.1) that sets ACL/RBAC/data-classification/audit constraints *before* builders run, and a **post-build architectural-security review** (verdict block / fix-before-prod / consider). Seven checklists: ACL strategy & evaluation order, RBAC/SoD, field-level security, PII/sensitive-data handling, audit & logging, secure integration, GRC control mapping. Grounded in the real Australia paths (`platform-security/access-control/`, `platform-security/`, `governance-risk-compliance/`) — note the baseline Code Reviewer skill cites a stale `servicenow-platform/security/` path; the new skill uses the correct tree. §1.1 nuance encoded: ACLs/roles/security-attributes are baseline configuration (not a §1.1 trigger), but new security tables/scopes/group-structures are.

### Changed

- **`CLAUDE.md`** — added to the Phase 2.1 skills registry; removed from the persona-only "planned" line; §3.1 consult row now points at the skill and notes the two modes.
- **`taxonomy.md`** — roster #16 marked ✅ (consult/review skill). Existing §2.2 boundary (vs Code Reviewer), §4.4 trigger map, and §5 anti-route already described it correctly — unchanged.

### Notes

Distinct from a Domain Expert gateway: it does **not** auto-fire at Phase 1 Step 5 or produce a 5-Part Constraint Envelope. The five gateways remain ITSM / CSM / HRSD / ITOM / CMDB & CSDM. The §3.1 consult firing is already covered by validation test T-03; a dedicated test for the review mode is a candidate follow-up.

---

## v2.7 — CMDB & CSDM promoted to 5th Domain Expert gateway

**Released:** June 2026
**Trigger:** CMDB & CSDM was a planned routing-time consult with no SKILL.md. For CMDB/CSDM-central work (notably CSM ↔ ITSM ↔ CSDM integrations), it needed to be a first-class auto-firing gateway with its own 5-Part Constraint Envelope and §1.1 enforcement.

### Added

- **`skills/cmdb-csdm-specialist/SKILL.md` + `EXAMPLES.md`** (mirrored in `.claude/skills/`) — new v2.0 Domain Expert gateway. Grounded in the Australia branch **CSDM v5** corpus (`servicenow-platform/common-service-data-model-csdm/`, `.../configuration-management-database-cmdb/`, plus the CSM install-base and ITSM-incident CSDM touchpoints). Uses v5 table names (`cmdb_ci_service_technical`, `cmdb_ci_service_auto`, `cmdb_ci_service_business`, `cmdb_ci_business_app`) and flags pre-v5 names as a self-violation. EXAMPLES Example 1 is the canonical CSM ↔ ITSM ↔ CSDM shared-service-layer pattern.
- **`VALIDATION-TESTS.md`** — T-11 (CMDB & CSDM gateway fires for a data-model request) and T-12 (CSM ↔ ITSM ↔ CSDM multi-gateway co-fire, bridging-table blocked). Marked PENDING re-run.

### Changed

- **`CLAUDE.md` → v2.7** — added CMDB & CSDM to the Phase 1 Step 5 gateway-trigger table, the gateway registry, the Domain Expert v2.0 list, and the Status roster; added a multi-gateway **co-fire** rule with the ITOM (population) ↔ CMDB & CSDM (model) boundary; removed CMDB & CSDM from the §3.1 routing-time consult list and Step 7 (it now fires at Step 5).
- **`taxonomy.md` → v1.2** — roster marked ✅ (v2.0 gateway); §3.1 consult row retired with a promotion note; §3.2 post-build Domain Expert row and §6.1 Step 7 gateway list updated; ITOM↔CMDB&CSDM co-fire boundary documented.
- **`skills/itom-discovery-specialist/`** — "when v2.0 exists" conditionals replaced with the live population-vs-model boundary now that the gateway exists.
- **`docs/ADVANCED-WEB-SETUP.md`** — Tier 1 upload loop and verification steps updated from four skills to five.
- **`docs/TECHNICAL-ARCHITECTURE.md`, `docs/BUSINESS-OVERVIEW.md`, `README.md`** — Domain Expert roster updated from four to five.

### Notes

Per the maintenance rule, the full validation suite (T-01–T-12) must be re-run in both Claude Code and Claude.ai, and the five gateway skills re-uploaded to Tier 1, before v2.7 is considered fully landed.

---

## v2.6.1 — Documentation Suite refresh (MCP era)

**Released:** May 2026
**Trigger:** The `docs/` suite still described the pre-MCP, design-only engine (stamped v2.3). It needed to be brought in line with the live-instance architecture.

### Added

- **`docs/MCP-OPERATIONS-GUIDE.md`** — the live-instance playbook: connection, permission tiers, the §2.1 write-approval gate, the §2.2 Update Set capture protocol, read/write tool patterns, and the operator checklist.
- **`docs/LIVE-ARTEFACTS-CATALOGUE.md`** — register of the three deployed artefacts (SLABreachRiskCalculator, DuplicateIncidentDetector, P1AutoAssign), each Verdict A / baseline-only.

### Changed

- **`docs/TECHNICAL-ARCHITECTURE.md`** — rewritten: added the live-instance execution layer (§5), gate ordering, the 10-test validation suite (§8), and the pre-commit auto-sync hook (§9).
- **`docs/USER-GUIDE-AND-EXAMPLES.md`** — rewritten: added Scenario 4 (live deployment through both write gates).
- **`docs/BUSINESS-OVERVIEW.md`** — added the design-to-delivery value section and the two write gates in plain English.
- **`docs/INSTALLATION-GUIDE.md`** — added the optional NowAIKit MCP connection step.
- **`docs/ADVANCED-WEB-SETUP.md`** — clarified the web Master Project is design-only; live deployment is CLI-only.
- **`docs/nowaikit-field-notes.md`** — purpose/audience header added; existing content untouched.
- All docs: repository renamed `claude-servicenow-engine` → `claude-servicenow-live`; example scoped-app prefix neutralised to `x_acme_*`; version stamps updated to v2.6.

### Notes

Documentation-only release. No change to `CLAUDE.md`, governance rules, taxonomy, or specialist skills.

---

## v2.6 — docs/ knowledge base + auto-sync hook

**Released:** May 2026
**Trigger:** Operational knowledge about the MCP connection (confirmed behaviours, bugs, workarounds) was being lost between sessions and laptops; agent/skill mirrors were drifting from their `.claude/` copies.

### Added

- **`docs/nowaikit-field-notes.md`** — committed, cross-laptop knowledge base of confirmed NowAIKit MCP behaviours and workarounds (Update Set capture, broken script endpoints, email-via-GlideRecord pattern, `register_event` and `create_business_rule` patch-after-create gotchas, Flow Designer shells).
- **Standing Rule** — every solved MCP problem is recorded in the field notes (generic only) and pushed; instance-specific values stay in local memory.
- **Pre-commit auto-sync hook** (`.githooks/pre-commit` → `scripts/sync-agents-skills.sh`) — keeps the root `agents/`/`skills/` folders and the `.claude/` mirror aligned automatically, staging both sides on commit.
- **Three live artefacts deployed** to the connected instance — SLABreachRiskCalculator, DuplicateIncidentDetector, P1AutoAssign — all Verdict A.
- Validation suite expanded to **10 tests**, adding **T-05** (write gate), **T-06** (Update Set capture), and **T-07** (agents/skills auto-sync).

### Files updated

- `CLAUDE.md` → v2.6 (docs/ knowledge base, artefact standards paths, field-notes Standing Rule, repo map).

---

## v2.5 — Live write governance (§2.1 + §2.2)

**Released:** May 2026
**Trigger:** With the MCP connection able to mutate a live instance, writes needed hard human-control and change-tracking guarantees.

### Added

- **§2.1 — MCP Write Approval Gate.** Every write requires an explicit, specific "write approved" in the current conversation. A tier upgrade, a prior read-only "yes", a general go-ahead, or the original task description do not count. Self-approval is prohibited. Halt protocol defined.
- **§2.2 — Update Set Capture Protocol.** Before any config write, the authenticated user's `sys_update_set` preference must point at the target Update Set, so ServiceNow captures the object automatically. Documented the confirmed-non-functional alternatives (`switch_update_set`, direct `sys_update_xml` POST, the script-execution endpoints).

### Files updated

- `CLAUDE.md` → v2.5 (§2.1 Write Gate + §2.2 Update Set Capture).

---

## v2.4 — NowAIKit MCP integration

**Released:** May 2026
**Trigger:** The engine could reason about ServiceNow but not touch it. A live MCP connection turned it from a design engine into a design-and-delivery engine.

### Added

- **NowAIKit MCP connection** to a live ServiceNow instance, at a declared permission tier (read-only / read-write).
- **Live §1.1 validation** — Baseline-First verdicts are now confirmed against the live schema, not only `ServiceNowDocs/`.
- Live read tooling (schema discovery, record queries, config audit) and live write tooling (Script Includes, Business Rules, Script Actions, Update Sets, Reports).

### Notes

Write governance arrived in v2.5; v2.4 established the connection and read-side validation.

---

## v2.3.1 — Documentation Suite

**Released:** May 2026
**Trigger:** Adoption readiness — the engine needed a complete, audience-segmented documentation suite before broader team rollout.

### Added

- **Root `README.md`** — repository landing page with badges, hero diagram, 3-step quick install, and links into `docs/`.
- **`docs/README.md`** — documentation hub indexing the five sibling files and the editable diagrams folder.
- **`docs/INSTALLATION-GUIDE.md`** — radically simplified plug-and-play install. Three steps, two minutes. The `.claude/` folder ships pre-synced in the repository.
- **`docs/ADVANCED-WEB-SETUP.md`** — separate optional guide for the Claude.ai Master Project setup (skill ZIP uploads, Project Instructions paste). Isolated from the core install path.
- **`docs/BUSINESS-OVERVIEW.md`** — non-technical view of the engine as a virtual implementation team, with the §1.1 rule explained in plain English.
- **`docs/USER-GUIDE-AND-EXAMPLES.md`** — three worked scenarios (BA stories, integration design, §1.1 halt) with verbatim prompts and expected behaviour.
- **`docs/TECHNICAL-ARCHITECTURE.md`** — developer reference for the §1.1 rule, the 5-Part Constraint Envelope, the Phase 1 / Phase 2 protocol, and the agent input/output contracts.
- **`docs/CHANGELOG.md`** — this file.
- **`docs/diagrams/`** — five native `.drawio` files (engine overview, virtual team org chart, full request lifecycle, §1.1 halt protocol, architecture wall diagram) plus Lucidchart import notes.

### Notes

This is a documentation-only release. No changes to `CLAUDE.md`, the orchestrator protocol, governance rules, or specialist skills.

---

## v2.3 — Self-Authorization Prohibition

**Released:** May 2026
**Trigger:** CSM-C validation revealed the model producing a complete table model in the same turn as the §1.1 OPEN QUESTION, rationalising that the user's specific request constituted authorization.

### Changed

- **§1.1 Baseline-First rule** — added explicit prohibition language. The user's original request does not constitute Chief Architect approval of a custom object. Approval must arrive as an explicit, separate user message responding to the OPEN QUESTION.
- **Phase 1 Step 5 (Domain Expert gateway), Verdict C clause** — rewritten as a hard stop. *"Surface the blocking OPEN QUESTION and stop. Do not produce any design artefact, table model, code, or specification in the same turn."*
- **§1.1 Validation Test, wrong-behaviour signals** — converted to enumerated list with the self-authorization bypass as a fourth named failure mode.

### Files updated

- `CLAUDE.md` → v2.3
- the planned claude.ai project-instruction templates (never shipped; see the retired-name glossary in `docs/ARCHITECTURE.md`) → v2.3

### Validation

- CSM-C validation re-run in both Claude Code and Claude.ai Master Project. Both environments now produce the OPEN QUESTION and halt, with no table model emitted in the same turn.

---

## v2.2 — Domain Expert Gateway

**Released:** May 2026
**Trigger:** v2.1 introduced the orchestrator delta in concept; v2.2 wired it into `CLAUDE.md` against the actual file structure.

### Added

- **Phase 1 Step 5** in `CLAUDE.md` — mandatory Domain Expert gateway with trigger-keyword table (ITSM / CSM / HRSD / ITOM) and Verdict A/B/C routing logic.
- **Phase 2 Step 4** in `CLAUDE.md` — Domain Expert re-fires in review mode post-build, validating builder artefacts against the original 5-Part Constraint Envelope.
- Multi-builder example rewritten to show the two-phase Domain Expert pattern.
- §6.2 and §1.1 Validation Tests updated to include the gateway routing chain.

### Changed

- `CLAUDE.md` Phase 1 step numbering: 11 → 12 steps.
- `CLAUDE.md` Phase 2 step numbering: 8 → 9 steps.
- Exception clause strengthened — Domain Expert gateway fires even on explicit `@<builder-name>` invocation.

### Files updated

- `CLAUDE.md` → v2.2
- `master-project-instructions-v2.2.md`

---

## v2.1 — Orchestrator Delta (definition phase)

**Released:** May 2026
**Trigger:** v2.0 installed the Domain Expert skills but they only fired on explicit invocation. v2.1 defined the orchestrator-level changes needed to wire them into Phase 1 routing.

### Added

- `ORCHESTRATOR-DELTA.md` — six annotated replacement blocks for `CLAUDE.md` and the Master Project Instructions.
- `VALIDATION-TESTS.md` — 12 canonical test scenarios exercising Verdict A, B, and C paths.

---

## v2.0 — Domain Expert Skills

**Released:** May 2026
**Trigger:** v1.0 Domain Expert skills lacked the structured Constraint Envelope output, citation discipline, and §1.1 halt protocol needed to enforce baseline-first design at scale.

### Added

- **`itsm-specialist` v2.0** — mandatory upstream gateway skill for ITSM.
- **`csm-specialist` v2.0** — mandatory upstream gateway skill for CSM. Includes explicit Australia-release flag on `sn_customerservice_escalation`.
- **`hrsd-specialist` v2.0** — mandatory upstream gateway skill for HRSD.
- **`itom-discovery-specialist` v2.0** — mandatory upstream gateway skill for ITOM and Discovery.
- Each skill paired with an EXAMPLES.md demonstrating canonical Verdict A, B, and C scenarios.
- All four skills enforce §1.1 with citation discipline against `ServiceNowDocs/markdown/` Australia branch.

### Replaced

- v1.0 Domain Expert skills — superseded but kept in `.backups/` as rollback safety.

### Distribution

- `domain-experts-v2.0.zip` (76 KB, 8 files, 3,505 lines).

---

## Earlier — Phase 2.1 Code Reviewer hook

- Added Code Reviewer skill (skill-only, no sub-agent).
- Added §6.2 post-build hook — automatic Code Reviewer proposal on any JavaScript artefact.
- Added Developer, Flow Designer Specialist, Integration Specialist as paired skill + sub-agent specialists.

---

## Earlier — Initial release

- Chief Architect persona defined.
- Four functional groups: Builders, Reviewers and Quality, Domain Experts, Consultants and Documentation.
- `governance-rules.md` §1.1 Baseline-First rule established as authoritative.
- `taxonomy.md` two-phase resolution algorithm defined.
- `prompt-patterns.md` PP-01 through PP-18 templates published.

---

## Pending — next batch

| Item | Notes |
|---|---|
| **`atf-author` v2.0** | Agent + skill pair. Adds batch-mode test-suite generation across a whole scoped app. The current roster references `agents/atf-author.md` but the file does not yet exist on disk — this is the known gap. |
| **`security-grc-specialist`** | Clean create — skill only, no v1.0 predecessor. Will be invoked as a routing-time consult per taxonomy §3.1. |

---

## Versioning policy

- **First digit (v2.x → v3.x):** major architectural shift. Examples: new tier of specialists, breaking change to the routing protocol.
- **Second digit (v2.2 → v2.3):** additive or corrective patch within the current architecture.
- **Patch suffix (v2.3.1):** documentation or maintenance change with no functional impact on the engine.

---

*Maintained by the Enterprise Architecture Team. Repository: [`farstic/claude-servicenow-live`](https://github.com/farstic/claude-servicenow-live).*
