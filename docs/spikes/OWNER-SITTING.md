# The owner's sitting — every ARC-00 step that needs a human

> ## ✅ THE SITTING IS COMPLETE on 2.1.258 (owner, 2026-09-07) — Parts A, B, C and D
>
> **Nothing on this list needs running again for 2.1.258, and every Answer line below is filled.**
> Cleanup is verified and `migrationVersion` is **14** (one binary throughout). What remains of ARC-00's
> human-gated work is only (a) the **2.1.214 floor repeat — OPTIONAL**, and (b) the **Windows VM rows**,
> `DEFERRED — owner input #2`.
>
> **One thing was not captured and is recorded as such:** the interactive `CLAUDE_PROJECT_DIR` probe was
> not run before cleanup, so that row stays *observed once, unreproduced — not a blocker*. It is a
> two-minute step if the plugin channel is ever revisited.
>
> Closed here: **S-01, S-16, S-17, S-06, S-12, S-18, S-05, S-14a–e**. Part D's result is recorded in
> `spikes/S-05-hook-without-node/README.md` — variant **B** (npm-installed `claude`), notice **shown**
> and non-blocking.
>
> ---
>
> ## ✅ Part A is COMPLETE on 2.1.258 (owner, 2026-09-07) — do not re-run it
>
> **S-01, S-16, S-17 and S-06 are CONFIRMED on 2.1.258** and their records are written. What is left of
> Part A is only the **2.1.214 floor row**, and only if the floor is still worth a second sitting.
>
> **Parts B, C and D are complete too (2026-09-07).** Nothing remains for this version.
>
> **Path B cannot be measured from this account (ARC-06-S13, 2026-09-10).** Criterion 2 asks
> whether the pasted sentence leads Claude to the two documented commands. Two headless runs were
> made with ONLY those two commands permitted (`--allowedTools "Bash(git clone:*)"
> "Bash(./bootstrap.sh:*)"`, no skip-permissions). Run 1, default profile: the clone happened, the
> session then reached for a user-level MCP tool that a new user does not have, cloned into
> SUBDIRECTORIES rather than `.`, and never ran the bootstrap (31 turns, ~$0.57). Run 2, with an
> isolated `CLAUDE_CONFIG_DIR` to model a new user: `Not logged in · Please run /login`.
> The obstacle is structural, not incidental — every session on this machine inherits a user-level
> `CLAUDE.md` instructing the model to route work through other tools, so the run measures the
> maintainer's environment rather than the page. **Run it on a profile without a user-level
> `CLAUDE.md` and without user-scope MCP servers**, empty folder and a folder containing
> `notes.md`, and record whether the two commands are the ones chosen. Run 1 is already useful:
> the story's own risk ("Claude may deviate") was observed, which is why the page prints the exact
> commands and now names the subfolder variation.
>
> **The two network diagnoses that need a real network (ARC-07-S02, 2026-09-10).** Both paths are
> unit-proven against injected failures; what no injection can prove is that the REAL stack
> produces the error shape the classifier expects. **(1) `PROXY_UNREACHABLE`** — on the Windows
> snapshot, `set HTTPS_PROXY=http://127.0.0.1:9` (nothing listens there), run the wizard's probe
> against any host, and confirm the code is `PROXY_UNREACHABLE`, that the printed proxy is masked
> (`http://***@…` when the URL carries credentials) and that the remedy names `NO_PROXY`.
> **(2) `CONNECTION_REFUSED` vs `CONNECTION_TIMEOUT` on a hibernated PDI** — S11 records which of
> the two a sleeping instance actually produces, and the remedy for both already mentions waking it
> at developer.servicenow.com. Record the code, the `cause`, and how long it took to arrive.
> Nothing about a real instance goes into the repository: the record is the CODE and the timing.
>
> **The password managers, and one read-through (ARC-07-S10, 2026-09-10).** Two things this page
> claims that a test can only half-check. **(1) The three examples in "Typing secrets safely" are
> asserted to PARSE — `bash -n` for the two shell lines, PowerShell's own parser for the third on
> windows-latest — and nothing more: running one would reach a real vault. On a machine where you
> have them, run each once against a PDI and record whether the value arrived (the wizard prints
> `Saved instance …`) and whether anything appeared in the shell history. If `op` or `pass` needs a
> flag this page does not show, that is the finding. **(2) One read-through by somebody who did not
> write the stories** — the story asks for it by name, and the reader is you. What to look for is
> not typos: it is the question a new user would ask that the page does not answer, and the sentence
> that assumes something only the author knows. Record both in `docs/spikes/validation-runs/`;
> never paste a secret, and the page itself carries none.
>
> **T-20 and T-21, the four manual passes (ARC-07-S09, 2026-09-10).** Everything a file can prove
> about the skill is proven — the grant is exactly eight entries, the hand-off block is byte-equal
> to the fragment the install page shows, the command rendered from that template is byte-identical
> to the story's line, `claude plugin validate` passes. What no test can run is the SKILL ITSELF:
> it needs a session, a model, and `AskUserQuestion`. Four passes: **macOS and the Windows `gitbash`
> snapshot, each on the floor CLI (2.1.214) and on current.** In each, run T-20 with the answers it
> names, then T-21 after running the printed command against a real PDI. What to record: (1) that
> the transcript contains **no** `Password` prompt — search it, do not skim; (2) the printed command
> line, verbatim, so it can be compared to the story's; (3) whether the Mode line appeared on
> `--resume` **without restarting** (that is S-02 CONFIRMED in practice, and the fallback text is
> what appears if not); (4) on Windows, which spelling the block used and whether the doctor's
> `shell` guess was right — until ARC-08-S01 ships there is no `--section prereqs`, so the skill
> prints BOTH spellings, and seeing that fallback behave is half the value of the Windows pass.
> Record in `docs/spikes/validation-runs/`; never paste a credential, and the plan output is safe
> by construction.
>
> **A REAL legacy store (ARC-07-S08, 2026-09-10).** The tolerant reader has only ever met files
> this repository wrote: the committed fixture and the ones the tests generate. What no fixture can
> produce is a store an actual 1.x install left behind — a version of the shape nobody here
> remembers, a field written by the Electron app, a half-finished entry from an interrupted wizard.
> If you still have a `~/.config/servicenow-mcp/instances.json` from the old tool (or a colleague
> does), run `./snowarch instance import --from-legacy --dry-run` against it and record THE PLAN
> ONLY — the plan is redacted by construction: it prints labels, URLs, environments, presets and
> notes, and no secret value of any kind, which is the same property the every-byte sweep asserts
> in CI. What matters in the answer: whether any entry was skipped for a reason the notes do not
> explain, and whether the "Unrecognised legacy keys" line appeared (it names fields this reader
> has never seen — each one is either a mapping this story missed or a field that genuinely goes).
> Do not paste the legacy file itself anywhere, and delete nothing until the import has run for
> real.
>
> **Known Folder Move, on a real managed Windows machine (ARC-07-S07, 2026-09-10).** The one claim
> in the cloud-sync detector that no test can make: that an enterprise-managed OneDrive client
> actually sets `%OneDrive%` (or `%OneDriveCommercial%`) to the redirected root when policy moves
> `Documents` or `Desktop` into the synced folder. The unit tests prove the DETECTOR reads those
> variables — with a stubbed environment, from the shared fixture — and nothing more; the fixture's
> `env` rows are written as if the client behaves that way. On a machine where the policy is in
> force: `echo %OneDrive%`, then run `./snowarch instance add` from a checkout under the redirected
> `Documents` and record whether the WARN appears and which folder it names. If the variable is
> empty or points elsewhere, the KFM case is undetectable on Windows too, and the documented
> limitation in the story grows by one sentence. Record the variable's value and the WARN line;
> never the store's contents.
>
> **The OAuth ROPC token endpoint (ARC-07-S06, 2026-09-10).** One thing in this story cannot be
> proven without an instance that HAS the grant enabled. `instance add --auth oauth_ropc` and
> `instance set-credentials --auth oauth_ropc` now work — S05 could not succeed at all, see
> amendment (4) — but they prove the grant through the first REQUEST rather than through a separate
> token call, so the four-way ROPC error table (`invalid_grant`, `invalid_client`, the disabled
> grant, the unrecognised error) is exercised only by unit tests with an injected probe. With a PDI
> that has the password grant enabled: add an instance with a WRONG client secret, then with a
> wrong user password, then with the grant switched off in the instance, and record which sentence
> each one produced. If any of the three reads as a plain wrong-password message where the table
> has a better one, the remedy is a real token probe in `probeOptionsFor()` — the seam is already
> there, and it is one function. Record the three sentences verbatim; never the secrets.
>
> **The wizard against a real instance (ARC-07-S05, 2026-09-10).** Everything that can be proven
> without an instance is proven — every exit path, the store bytes, the argv. Three things need a
> real one and a terminal. **(1) AC 1** — on a clean machine, run the README command against a PDI,
> type a valid username and password, press Enter: the summary must read `Saved instance "pdi"
> (pdi · basic · preset pdi-developer · default).` with the probe line, `stat -f %Lp
> .local/instances.json` must print `600` and `.local` `700`, and the JSON must carry six flags as
> strings, `toolPackage: "full"`, `maxRecords: 100`, `prodWriteAck: false`. **(2) AC 2** — during
> that run, `ps -o args` in another terminal shows the command WITHOUT a password, and `history |
> tail -1` afterwards contains none either; the terminal transcript shows no password characters.
> **(3) AC 9's spawned form and AC 10** — `printf 'p\n' | … --password-stdin --yes` against a real
> instance, and the same on Windows to see `file modes: ACL-inherited (Windows)` with the store
> under `.local\`. Record the summary line verbatim, the two `stat` numbers, and — for AC 2 — that
> the `ps` line is what you expected, never its contents.
>
> **S-04, the masked-input matrix (ARC-07-S01, 2026-09-10).** Criterion 6 is eight cells: Windows
> Terminal and conhost × PowerShell 5.1 and cmd × with and without Git Bash on PATH. In each, run
> the built CLI's masked prompt, type `abcd`, Backspace, `e`, Enter, and check three things — the
> value has four characters, NOTHING was echoed, and the shell still echoes normally afterwards
> (raw mode restored). Record each cell CONFIRMED or FAILED in `docs/validation/`. **A FAILED cell
> is one entry in `WINDOWS_KNOWN_BAD` in `packages/snowarch/src/cli/tty.ts`** — the table ships
> empty, the fallback branch behind it is written and tested against a planted entry, so the change
> is data rather than code. Until the matrix runs, native Windows masked input is unproven and the
> `--password-stdin` line is what the page promises.
>
> **The install page's second reader (ARC-06-S13, 2026-09-10).** Criterion 1 asks for two people
> who did not write the page to follow Path A and reach `Mode: design-only` without opening any
> other file. Reader one is the architect, on a fresh clone with Node hidden. **Reader two is the
> owner**, on the Windows `clean` snapshot: open `docs/INSTALL.md`, follow it top to bottom, and
> note every place you had to guess, look elsewhere, or scroll back. The page passes only if the
> answer is "nowhere" — a page that needs its author present is not the page this story asked for.
>
> **A robustness CANDIDATE, not a change (ruling 3, ARC-06-S12, 2026-09-10).** `bootstrap.cmd`
> invokes `powershell` by NAME, so a machine whose PATH has been rewritten (a GPO, a shell started
> with a scrubbed environment) gets cmd's own `'powershell' is not recognized` instead of our
> sentence. `%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe` removes the dependency
> in one line. AC 3 fixes the `.cmd` text byte for byte and a test asserts it, so this is recorded
> here to be tried during the sitting's mangled-PATH check rather than changed on my own judgement.
>
> **The registration sitting (added by ARC-06-S12, 2026-09-10).** Everything `--register` does goes
> through `claude mcp`, which writes `~/.claude.json` — a file this agent is not permitted to touch,
> so the CLI halves below were never run here. The flag spellings WERE verified read-only on
> 2.1.258 (`claude mcp add-json --help`: `-s, --scope <scope>`, default `local`; `claude mcp remove
> --help`: `-s` optional, and **without it the CLI removes from whichever scope it finds** — which
> is why every call this tool makes passes `-s`). For the sitting, in a trusted checkout:
> **(1) AC 4** — `./snowarch mode live --register local`, then `claude mcp get servicenow` shows a
> local entry whose args still read `${CLAUDE_PROJECT_DIR:-.}/…/server.js` UNEXPANDED, and a Claude
> session in the folder shows the server connected exactly once (no duplicate — the project entry
> must be rejected by `disabledMcpjsonServers`). **(2) AC 5** — `--register project` afterwards, and
> `claude mcp get` shows the project entry again. **(3) AC 6** — `--register user --ack-user-scope`,
> then `./snowarch mode` prints the user-scope line. **(4) AC 1/2** — `/mcp` after `mode live` and
> after `mode design`. **(5)** the same-key coexistence question the story's task 1 asks: with a
> local AND a project entry both named `servicenow`, which one loads — recorded with the CLI
> version. `~/.claude.json` should be fingerprinted by KEY NAME before and after (never contents);
> for `--register local` the one key that may change is that project's `mcpServers` entry.
>
> **The Windows sitting, four rows (added by ARC-06-S11, 2026-09-09).** The Windows launchers ship
> verified by CI for everything CI can reach; four things need a Windows console with a human:
> **(1) AC 1** — double-click `bootstrap.cmd` on the `clean` snapshot: the plan appears, Enter runs
> it, and `Press any key to continue` holds the window open (the `%CMDCMDLINE%` detection is a cmd
> convention, not a documented contract; if it misfires the fallback is an unconditional `pause`
> when `%~1` is empty). **(2) Ctrl-C** propagation through `bootstrap.cmd` → `powershell.exe` →
> `node` — PowerShell has no `exec`, so the parent waits, and only a console can show whether the
> signal reaches the child. **(3) S-03** — whether Claude Code expands `${CLAUDE_PROJECT_DIR}` in
> `.mcp.json` on native Windows; if it does NOT, the fallback (`claude mcp add-json … -s local` with
> a resolved absolute path, recorded as `mcpJsonOverrideSha`) gets built then. It is deliberately
> not built now. **(4) S-04** — conhost raw-mode masked input, which ARC-07's wizard needs.
> **(5) AC 4** — a GPO-locked `MachinePolicy`, which no runner can apply.
>
> **The floor row, and what turns on it (added by ARC-06-S09, 2026-09-09).** The dialog count is
> measured on 2.1.258: `live` = 1, `design` = 1, `control` = 2. The engine's floor is **2.1.214**,
> whose row is still pending, and the bootstrap's closing block promises the measured number.
> **If the floor repeat shows 2, `EXPECTED_DIALOGS` in `tools/snowarch/lib/text.mjs` becomes 2 and
> the block grows its second sentence by itself** — no other change, because the sentence per dialog
> is generated from that constant. Until then the install text states the measurement and names the
> floor as where a second approval may still appear: a stated measurement, not a promise.
> **Several steps were answered without you since this file was written and are struck out below** — do
> not spend time on them.

**Estimated duration: now ~45 minutes** (Part B ~30 · Part C ~5 · Part D ~10), down from 70–85. Four
spikes still want a human: **S-14a/b/c/d** (Part B), **S-18** (Part C) and **S-05** (Part D). Everything
else in ARC-00 that could be measured without you has been measured — and since this file was written,
quite a lot more was.

Why these steps and no others: each one needs a **modal dialog counted by eye**, a **permission decision
at a TTY**, or a **workspace-trust acceptance**. Accepting the trust dialog is what makes Claude Code
write `hasTrustDialogAccepted` into your `~/.claude.json` — the file these spikes are forbidden to touch,
and the one `03` §D says the design deliberately never writes. None of it was simulated or driven through
a pseudo-terminal.

---

## Before you start

**Use ONE Claude Code binary per sitting.** Alternating versions flips `migrationVersion` in
`~/.claude.json` on every switch (`03` §F **S-21**). Do Part A twice if you want both versions — once
end to end on each — rather than interleaving.

```sh
# the two binaries on this machine
~/.local/bin/claude            # 2.1.258, the current release
~/.local/bin/claude-2.1.214    # the floor
```

Paste answers straight into the **Answer:** lines below and hand the file back; each one names the record
it lands in.

---

# Part A — the monorepo path (~25 min, or ~45 for both versions)

## A0. Prepare three fresh checkouts

```sh
cd ~/work/snowarch-spikes
sh spikes/S-01-preseeded-approval/run.sh live
sh spikes/S-01-preseeded-approval/run.sh design
sh spikes/S-01-preseeded-approval/run.sh control
```

Each run prints the path it prepared and a checklist. It creates a **brand-new clone path** every time —
the only reliable reset, because `claude mcp reset-project-choices` clears the MCP approval but not the
folder's trust record. It also refuses to continue unless `grep -c "<path>" ~/.claude.json` returns `0`.

To run Part A on the floor binary instead:
`CLAUDE_BIN=~/.local/bin/claude-2.1.214 sh spikes/S-01-preseeded-approval/run.sh live`

## A1. S-01 — the dialog count *(the number ARC-06 promises users)*

In each prepared path, start the binary and **count every modal until the prompt is usable**.

| Variant | Expected | Meaning |
|---|---|---|
| `live` (`enabledMcpjsonServers`) | **1** — workspace trust only | 2 means S-01 **FAILED** and the README must say "answer Yes to the servicenow approval" |
| `design` (`disabledMcpjsonServers`) | **1** — trust only, no MCP approval | |
| `control` (no toggle file) | **2** — trust + the per-server approval | proves the prompt exists at all; without this the other two prove nothing |

Screenshot each modal, cropped to the dialog.

> **ANSWERED 2026-09-07 (2.1.258):** live = **1** · design = **1** · control = **2** ·
> binary `~/.local/bin/claude`. S-01 is **CONFIRMED** on this version; recorded with the verbatim
> `control` dialog. *(in `spikes/S-01-preseeded-approval/README.md`)*
> **Only the 2.1.214 row is outstanding.**

Already known without a dialog, so you do not need to re-check it: `disabledMcpjsonServers` **is**
honoured before trust (`claude mcp get servicenow` → `✘ Rejected (see disabledMcpjsonServers in
settings)`, and the server is absent from `claude mcp list`), while `enabledMcpjsonServers` is **not** —
the live variant reads byte-identically to having no toggle file.

## A2. S-01 continued — `/mcp` in each session

- **live** → is `servicenow` listed, and does it show **connected** with **5 tools**?
- **design** → is it shown **disabled**, with no prompt?

> **ANSWERED 2026-09-07 (2.1.258):** live/control → `servicenow · ✔ connected · 5 tools` under a
> **Project MCPs** section with the `.mcp.json` path · design → **absent from the panel entirely**
> (10 servers, no Project MCPs section) — **"absent", not "disabled"; this step's wording was wrong.**

## A3. S-16 — is `permissions.allow` honoured immediately after trust? *(stay in the live session)*

1. Ask Claude to run `./snowarch doctor --json` — allow-listed as `Bash(./snowarch doctor*)`.
   **Expect 0 permission prompts.**
2. Ask Claude to run `./snowarch version` — not allow-listed. **Expect 1 prompt.**
3. Note especially whether the **very first** Bash call after trust prompts. That is the actual question
   and it is the one no script can answer.

> **ANSWERED 2026-09-07 (2.1.258).** In **manual mode** the first Bash call after trust **did prompt**.
> The bigger result: Claude **wraps** the command, and **wraps it differently each time** —
> `./snowarch version 2>&1; echo "EXIT: $?"` in one session, `./snowarch doctor --json > f 2> g;
> echo "exit=$?"; wc -c f g` in another — so the allow rule matched the product command and every wrapper
> segment was a separate gate. **Consequence (architect ruling): Bash allow rules are unreliable for the
> product's own commands; the in-session status/doctor path becomes an MCP tool call.**
> Also recorded: the trust modal **reads the committed `permissions.allow` aloud** before you accept it.
> ⚠ **Do not read this step from an auto-mode session** — auto mode auto-approved both commands with no
> prompt, so a "0 prompts" reading there means nothing.
> *(in `spikes/S-16-project-permissions-allow/README.md`)*

## A4. S-17 — is an unconfigured server accepted as connected? *(same session)*

1. `/mcp` → confirm `servicenow` is **connected** and lists **exactly five** tools.
2. ~~Ask Claude to call `snow_core_capabilities_read` — allow-listed, so **expect no prompt**.~~
   **RETIRED — answered twice already:** headlessly (an allow-listed MCP tool runs under
   `claude -p --settings`, S-24) and by the owner in manual mode on 2.1.258
   (`stub: snow_core_capabilities_read ok`, no prompt). Skip it.
3. **The negative control**, in a *new* prepared path: `export STUB_EXIT_ON_START=1` before starting the
   binary, then `/mcp` → the panel **must show servicenow failing**. Without this a green panel proves
   nothing.

> **ANSWERED 2026-09-07 (2.1.258):** 5 tools · no prompt · control panel = `servicenow · ✘ failed`,
> footer *"※ Run `claude --debug` to see error logs"*, detail view showing Command/Args/Config location
> and **no error text at all**. S-17 **CONFIRMED**. *(in `spikes/S-17-unconfigured-server/README.md`)*
>
> **One 2-minute follow-up worth doing next time you are in a session:** run `claude --debug`
> interactively against the crashing stub and record whether the error is actually there. Headlessly
> `claude -p --debug` showed **nothing**, so the panel's own advice is unverified — and it is the only
> remedy the UI offers a stuck user.

## A5. ~~S-06 — does `env.MCP_TIMEOUT` govern startup?~~ **DONE — and the answer changed the product design**

In a fresh prepared path (`live`), edit `.claude/settings.json` and set `env.MCP_TIMEOUT` to `2000`, and
export `STUB_STARTUP_DELAY_MS=5000` before starting the binary.

1. Start it → `/mcp` should show a **startup failure**. **Record the failure text verbatim.**
2. Set `MCP_TIMEOUT` back to `120000`, restart → should show **connected**.

> **ANSWERED 2026-09-07 (2.1.258):** at 2000 → `servicenow · ✘ failed`, and the detail view is
> **byte-identical to the crash case** — **no "timed out" wording anywhere in the panel.** Confirmed
> independently headlessly by a 2×2 (2000+slow fails; 15000+slow and 2000+fast both connect), so the
> settings `env` block **does** govern startup. S-06 **CONFIRMED**.
>
> **The finding that came out of it.** The failure is **not** on stderr, the exit code is **0**, and the
> `/mcp` panel cannot distinguish timeout from crash — **but a typed notice does reach the session
> context**: `(CONNECT_TIMEOUT) "…timed out after 2000ms"`, `(CONNECTION_CLOSED) "Connection closed"`,
> `(ENOENT) "Executable not found in $PATH: node"`. So `snowarch doctor` must classify the failure itself
> and never trust the exit code. *(in `spikes/S-06-mcp-timeout-cold-start/README.md`)*

The cold start itself is already measured and is not in question: 394 tools everywhere, worst complete
handshake 750 ms over 27 runs on nine CI cells, so 120 000 ms keeps ~160× headroom. This step is only
about whether the **settings `env` block** is the thing that applies at startup.

---

# Part B — the plugin channel (~30 min) *(D-06 hedge; S-14)*

## B0. Setup

```sh
claude plugin marketplace add git@github.com:farstic/snowarch-spikes-marketplace.git
mkdir -p ~/spike-runs/s12 && cd ~/spike-runs/s12 && git init
```

## B1. S-14a — is the `sensitive` field masked?

```sh
claude plugin install servicenow-server@snowarch-spikes --scope project
```

Answer the prompts **interactively** — do not pass `--config`. For each of the four fields record whether
input is echoed or masked, and what the prompt says. `SNOW_PASSWORD` is the one declared
`sensitive: true`.

> **Do the in-session `/plugin install` comparison LAST, after B2–B4.** Running it here would consume the
> very first session of this folder, and B2's whole purpose is to count the modals a *first* session
> shows. Once trust has been accepted the trust modal never reappears and the S-14b count would be low by
> at least one — which is exactly the number that has to be comparable with A1's `live` count.

Then the keychain budget: repeat once with a **~3 KB** value for `SNOW_PASSWORD` and record whether it is
accepted, truncated or rejected.

> **ANSWERED *(owner, 2026-09-07, 2.1.258, relayed by the architect)* — and the answer is the one that matters for D-06.** `/plugin configure` shows the four
> fields, `*` on the three required. **The `sensitive` Password field is only PARTIALLY masked: asterisks
> with the last six characters visible in clear.** The 3 KB value was not exercised. *(Recorded in
> `spikes/S-14a-user-config-masked-dialog/README.md`. No real value appears in any record — the owner
> cancelled before Save and re-entered fixtures.)*
> *(in-session masking is B5, below)*
> *(lands in `spikes/S-14a-user-config-masked-dialog/README.md`)*

Already answered without a dialog: the **sensitive** value goes to the macOS keychain item
`Claude Code-credentials` and to no file; the **non-sensitive** options go to `~/.claude/settings.json` at
**user** scope, mode **0644**, even for a `--scope project` install.

## B2. S-14b — dialogs, and the tool prefix

Start `claude` in `~/spike-runs/s12` for the first time. **Count every modal**, and compare with your
A1 `live` number. Then `/mcp`: does `servicenow` appear, and **with what tool prefix**? Record it
**verbatim** — `01` §16 expects `mcp__plugin_servicenow-server_servicenow__…`, and that prefix is a
contract value every generated permission rule depends on.

> **ANSWERED *(owner, 2026-09-07, 2.1.258, relayed by the architect)*:** `claude plugin install --scope project` installs **without prompting**; after
> `/plugin configure` + `/reload-plugins` the server appears as
> **`plugin:servicenow-server:servicenow · ✔ connected · 5 tools` under "Built-in MCPs"** — **no approval
> dialog at all**, where a `.mcp.json` project server needs one unless pre-seeded (A1 `control` = 2).
> **Tool prefix, read from the model's own tool list:**
> `mcp__plugin_servicenow-server_servicenow__snow_probe_env_read` — i.e.
> `mcp__plugin_<plugin>_<server>__<tool>`. The **permission dialog never shows that identifier**, only
> the display name. *(`spikes/S-14b-plugin-server-approval/README.md`)*
> *(lands in `spikes/S-14b-plugin-server-approval/README.md`)*

Already known: a plugin-bundled server is **invisible** to `claude mcp get` / `claude mcp list`, so
`/mcp` inside a session is the only place this can be seen.

## B3. S-14c — what does a blank optional field become?

**Two steps, in this order.** On the plugin path the server starts in **set A (five tools)**, because the
plugin's `.mcp.json` supplies only the four `SNOW_*` userConfig values and no `STUB_CONFIGURED` — so
`snow_probe_env_read` **does not exist yet** and asking for it first returns *"Unknown tool"*.

1. Ask Claude to call **`snow_core_instances_reload`** — it is in set A, and it flips the process to
   **set B** for the rest of its life, emitting `notifications/tools/list_changed` (that is S-02's
   mechanism, exercised here over the plugin channel for free).
2. *Then* ask Claude to call **`snow_probe_env_read`**. It prints variable **names and lengths only,
   never values**. Record the `SNOW_OPTIONAL` line — it will be one of exactly three:

- `SNOW_OPTIONAL: unset`
- `SNOW_OPTIONAL: (set, empty string)`
- `SNOW_OPTIONAL: LITERAL PLACEHOLDER — not substituted: …`

> **ANSWERED *(owner, 2026-09-07, 2.1.258, relayed by the architect)*: `SNOW_OPTIONAL: set but empty`** — a blank optional field arrives as an **empty
> string**, not unset and not the literal `${user_config.KEY}`. Independently reproduced on the Ubuntu VM.
> **Code rule for ARC-04: `process.env.X ?? default` will not apply the default** — the test must be
> `if (!process.env.X)`. *(`spikes/S-14c-empty-user-config-substitution/README.md`)*
> *(lands in `spikes/S-14c-empty-user-config-substitution/README.md`)*

## B4. S-14d — does a 12 KB `additionalContext` survive?

```sh
claude plugin install architect-engine@snowarch-spikes --scope project
claude --debug
```

Search the debug output for `S14D-BEGIN` and `S14D-END`; both carry a byte count. Record it **at
startup**, then after `/compact`, then on `claude --resume`. If `S14D-END` is missing, the last `S14D`
line number that arrived tells you exactly where it truncated.

> **ANSWERED *(owner, 2026-09-07, 2.1.258, relayed by the architect)*: 12,299 bytes at startup · survives `/compact` · survives `exit` + `claude --resume`.**
> The hook log recorded `S14D-END bytes=12299 lines=205` and the model quoted that terminal line verbatim
> at all three points — a truncated injection would have lost it. *(`spikes/S-14d-…/README.md`)*
> *(lands in `spikes/S-14d-session-start-additional-context/README.md`)*

---

## B5. S-14a, the second half — the in-session install *(do this only now)*

In the session you already have open, run `/plugin install servicenow-server@snowarch-spikes` and record
whether the masked-input behaviour differs from the terminal install in B1. This is deliberately last:
it needs a session, and B2 needed that session to be the folder's first.

> **MOOT — not needed.** B1's `/plugin configure` already answered the masking question, and B5's
> separate in-session install added nothing beyond it. Recorded as moot rather than skipped.

---

# Part C — ✅ **COMPLETE on 2.1.258 (owner, 2026-09-07)** *(ARC-00-S05: S-18 and S-12)*

> **S-18 is CONFIRMED with its control** and C3/C4 were retired as answered headlessly, so nothing in
> Part C remains for 2.1.258. Recorded: with the `ask` rule, `snow_core_record_add` **prompted** in both
> auto and manual mode — *"Permission rule `mcp__servicenow__snow_core_record_add` requires confirmation
> for this tool"* — and in the **`no-ask` control** the same mutating call **executed with no prompt**.
> The trust modal listed only the four `allow` entries and **never the `ask` rule**.

Auto mode is a **flag**, not a key sequence — this was the open question and it is answered:

```sh
claude --permission-mode auto     # choices: acceptEdits | auto | bypassPermissions | manual | dontAsk | plan
```

## C0. Prepare

```sh
cd ~/work/snowarch-spikes
sh spikes/S-18-permissions-ask-auto-mode/run.sh default
sh spikes/S-18-permissions-ask-auto-mode/run.sh no-ask
sh spikes/S-18-permissions-ask-auto-mode/run.sh trailing
```

Each prepared path pre-seeds the MCP approval and sets `env.STUB_CONFIGURED=1`, so the stub advertises
**eight** tools and `snow_core_record_add` exists to be called.

## C1. S-18 — does the `ask` rule prompt? *(variant `default`, once per mode)*

In `auto`, then `default`, then `plan`:

1. Ask Claude to create a record with `snow_core_record_add` on table `incident`.
   **Expect a permission prompt naming `mcp__servicenow__snow_core_record_add`.** Screenshot it, then
   **decline**. The stub replies `stub: would create record` if it ran, so there is no ambiguity about
   whether the call went through.
2. Ask Claude to call `snow_core_capabilities_read` — **expect no prompt**.

> **ANSWERED *(owner, 2026-09-07, 2.1.258, relayed by the architect)*: auto = PROMPTED · manual = PROMPTED, identical wording · declined in both.**
> Verbatim: *"Permission rule `mcp__servicenow__snow_core_record_add` requires confirmation for this
> tool. `/permissions` to update rules"*. `capabilities_read` was unprompted (allow-listed).
> **The dialog names the rule**, which the plugin channel's dialog does not.
> *(`spikes/S-18-permissions-ask-auto-mode/README.md`)*
> **Your account plan:** ____________ *(auto mode is plan-dependent)*
> *(lands in `spikes/S-18-permissions-ask-auto-mode/README.md`)*

## C2. S-18 control — no `ask` rule *(variant `no-ask`, auto mode only)*

Repeat C1 step 1. **If no prompt appears, that is the hazard the `ask` block exists for** — the expected
demonstration of the risk, not a failure of the spike.

> **ANSWERED *(owner, 2026-09-07, 2.1.258, relayed by the architect)*: NO prompt, and the call EXECUTED** → `stub: would create record`. **This is the
> control that earns S-18 its verdict**: without the `ask` rule a mutating call runs silently in auto
> mode, so the rule is the only thing between an agentic session and a write to the instance.

## C3. ~~S-12 — the middle-wildcard glob~~ **RETIRED — answered headlessly, both directions**

With `allow: ["mcp__servicenow__snow_*_read"]` as the only rule, under
`claude -p --mcp-config --settings --strict-mcp-config`: `snow_core_capabilities_read` **ran**,
`snow_core_records_query` was **blocked**. The control that makes it evidence: with **no** allow rule the
same route blocks a plain Bash command, so `-p` is not auto-approving. **The middle wildcard is honoured
on 2.1.258.** *(in `spikes/S-12-middle-wildcard-globs/README.md`)*

Optional one-minute confirmation if you are already in a session: headless *blocked* is not interactive
*prompted*. The matching semantics — the thing ARC-05 needed — are settled either way.

## C4. ~~S-12 control — trailing wildcard~~ **RETIRED — runnable the same headless way**

The negative control it was pairing with (a non-matching tool being blocked) is already measured, and the
trailing-wildcard case runs by the same route without a session.

---

# Part D — S-05, the missing-`node` hook (~10 min)

**One question only, and it is narrow.** Everything else about S-05 is now measured on the Ubuntu VM:
with `node` stripped from `PATH`, the session **starts and works normally**, the `SessionStart` hook
**does not run** (proved by a marker file it fails to write), and **nothing anywhere reports that** — no
notice in context, nothing on stderr, exit `0`. Meanwhile the `.mcp.json` server in the same session
announces itself precisely as `servicenow (ENOENT): "Executable not found in $PATH: node"`.

**So the only thing left is whether the interactive TTY shows a notice that the headless path does not.**

```sh
cd ~/spike-runs                       # any fresh path is fine
sh ~/work/snowarch-spikes/spikes/S-05-hook-without-node/run.sh   # if present; otherwise the fixture below
```

If you prefer to build it by hand — three files in an empty folder:

```sh
mkdir -p /tmp/s05/.claude && cd /tmp/s05 && git init -q .
printf '#!/usr/bin/env node\nconsole.log("hook ran");\n' > session-start.mjs
```

> ### ⚠ Pick the variant that matches how **your** `claude` was installed — check first
>
> ```sh
> command -v claude && head -c 4 "$(command -v claude)" | od -c | head -1
> ```
>
> `\177 E L F` (or a Mach-O binary) → **native install**, use variant A.
> `# ! / u` → an `#!/usr/bin/env node` launcher → **npm install**, use **variant B**.
>
> **On this Mac `claude` is npm-installed** (`~/.npm-global`), so **hiding `node` from `PATH` would stop
> Claude Code itself** and the test would measure nothing. The original recipe below was written against
> the Ubuntu VM's native binary. **Variant B produces the identical spawn failure (`ENOENT`) for the hook
> while the session runs normally**, which is the condition under test. *(Amended 2026-09-07 on the
> architect's instruction, after the difference was spotted.)*
>
> **Record which variant you used** — the two are not interchangeable evidence.

**Variant A — native `claude` (the Ubuntu VM):** hide `node` from `PATH`.

```sh
cat > .claude/settings.json <<'EOF'
{ "hooks": { "SessionStart": [ { "hooks": [ { "type": "command",
  "command": "node ${CLAUDE_PROJECT_DIR:-.}/session-start.mjs" } ] } ] } }
EOF
env PATH="$(printf '%s' "$PATH" | tr ':' '\n' | grep -vxF "$(dirname "$(which node)")" | paste -sd: -)" claude
```

**Variant B — npm-installed `claude` (this Mac):** leave `PATH` alone and point the hook at an
interpreter that does not exist. Same `ENOENT`, and Claude Code still starts.

```sh
cat > .claude/settings.json <<'EOF'
{ "hooks": { "SessionStart": [ { "hooks": [ { "type": "command",
  "command": "/nonexistent/node ${CLAUDE_PROJECT_DIR:-.}/session-start.mjs" } ] } ] } }
EOF
claude
```

1. Does the session start at all? *(headlessly it does — Claude Code is a native binary, not a Node
   script, so hiding `node` does not disable it.)*
2. **Is any hook-failure notice shown on screen?** If yes, **quote it verbatim** — that is the whole step.
3. Does it **block**, or is the prompt usable immediately?

> **ANSWERED *(owner, 2026-09-07, 2.1.258, relayed by the architect)*: variant B** (npm-installed `claude`) · session **starts normally** · notice **shown** ·
> non-blocking, prompt usable immediately. Verbatim:
> *"SessionStart:startup hook error / Failed with non-blocking status code: `/bin/sh: /nonexistent/node:
> No such file or directory`"*. The trust dialog listed **no** hook warning.
> **Contrast recorded:** headlessly (`claude -p`, Ubuntu VM, variant A) there is **no notice at all** —
> so the platform's report of a hook failure is best-effort and human-only.
> *(`spikes/S-05-hook-without-node/README.md`)*
> *(lands in `spikes/S-05-hook-without-node/README.md`)*

**Why it matters, in one line:** if the interactive UI is as silent as the headless path, then a
`node`-invoked `SessionStart` hook on a machine without Node is indistinguishable from a hook that ran and
did nothing — which rules the hook out for anything the product needs to know failed.

---

## Cleanup (please run this — it leaves no residue on your machine)

```sh
cd ~/spike-runs/s12
claude plugin disable servicenow-server@snowarch-spikes --scope local
rm -f .claude/settings.json
claude plugin uninstall servicenow-server@snowarch-spikes
claude plugin uninstall architect-engine@snowarch-spikes
claude plugin marketplace remove snowarch-spikes
rm -rf ~/.claude/plugins/cache/snowarch-spikes ~/spike-runs/s12 ~/spike-runs/S-01-* ~/spike-runs/S-05-*
```

Then confirm, so the sitting can be closed cleanly:

```sh
claude plugin list --json                 # expect []
claude plugin marketplace list            # expect only claude-plugins-official
python3 -c "import json,os;print(json.load(open(os.path.expanduser('~/.claude.json'))).get('migrationVersion'))"
```

> **ANSWERED *(owner, 2026-09-07, 2.1.258, relayed by the architect)*: `migrationVersion` = 14, unchanged** — one binary throughout, as instructed.
> Cleanup verified: `plugin list` `[]`, only `claude-plugins-official` in the marketplace list,
> `~/.claude/plugins/cache/snowarch-spikes` gone, `~/spike-runs` empty, `/tmp/s05` removed.
> *(if it changed, two binaries were used in one sitting — note which)*

---

## Still not on this list, and why

| Item | Why it is not here |
|---|---|
| **S-03, S-04, S-08** and the Windows halves of S-01 / S-07 / S-15 / S-20 | `DEFERRED — Windows VM pending (owner input #2)`. A machine without Git Bash on `PATH` is needed. |
| **ARC-02-S11 criterion 9** — `/snowarch status` through `./snowarch` or the `node tools/snowarch/bin/snowarch.mjs` fallback, on Windows | `DEFERRED — Windows VM pending (owner input #2)`, same machine as the row above. The half that a file can prove is done and permanent: `snowarch.cmd instance add …` is in the hand-off text and `tests/snowarch-skill.test.mjs` fails if it leaves. What needs the VM is whether a Windows shell reaches the launcher at all — and before ARC-06 there is no launcher to reach, so this cannot be closed until ARC-06 ships either way. |
| **ARC-02-S13 criterion 6** — the routing subset (T-01, T-02, T-03, T-04, T-10, T-14, T-15) re-run on Windows | `DEFERRED — Windows VM pending (owner input #2)`, same machine as the rows above. The full eighteen ran in design-only on macOS (`docs/spikes/validation-runs/`); the Windows subset is a cross-platform check of the same loaded texts, not of any Windows-only code path. ARC-02 is not held open for it by standing decision. |
| **The Ubuntu VM rows** | ✅ **No longer blocked.** `arc00-ubuntu` is logged in and running Claude Code **2.1.263**; `claude -p` works there. **S-07 and S-05 have been run on it since** — see those records, and note S-07's Ubuntu row changed the spike's conclusion (recipe B does not exist on Ubuntu 22.04's stock git 2.34.1, and that git silently omits the corpus's five root files including `LICENSE`). |
| **S-14e** second machine | Now runnable without you — no longer waiting on a login. |
| **S-14g** throttled network | Day 4 of the time-box, on the VM (`tc qdisc … rate 2mbit`). Unthrottled it already installs in **1.9 s** against a 60-second cap. |
