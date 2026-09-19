# Validation run — 2026-09-19 — macOS — Sitting C §A

Build: **v2.0.0-rc.5**, a lived-in checkout (not a fresh clone). Owner at a real terminal; the
wizard needs a TTY and no CI cell can reach it. Instance host, username and home directory are
redacted throughout as `<url>`, `<user>` and `<home>`; the store helper prints lengths, never
values.

---

## Install timeline

`./snowarch mode live --register local`. The registration line prints **before** the wizard asks
anything, which is the documented ordering: `mode.mjs` settles it first because B07 writes the
toggles from `state.registration`, and an entry made after B07 would leave the project entry
enabled so both would load.

```
registration: local — "servicenow" registered with claude mcp add-json -s local
[B00/09] preflight … ok (7 lines)   [B01] ok   [B02] cached   [B03] ok
[B04/09] deps … installing (npm ci, ~72 MB) → ok (2 s)
[B05] cached
Label for this instance [pdi]
```

The prompt rendered and waited for a keystroke. **That line is the whole of ARC-07-C2 and
ARC-06-C13**: the interactive install had never once asked a question, and no CI cell could see it.

Then, in order: `[1/6] Instance URL <url>` · `[2/6] Environment → 1 (pdi)` ·
`network: HTTPS_PROXY=unset · NO_PROXY=unset · NODE_EXTRA_CA_CERTS=unset` ·
`[3/6] Authentication → 1 basic` · `[4/6] Credentials`, taking `Username <user>` and then a
credential prompt that **echoed nothing to the screen** · `[5/6] Probing` · `[6/6] Permissions`.

`[6/6]` proposed `full — non-production: everything on`, with WRITE, CMDB_WRITE, SCRIPTING, ATF and
NOW_ASSIST each `probe: ok`, and `FLUENT probe: @servicenow/sdk not on PATH — keep on?
(recommend: off)`. The owner typed `FLUENT`, the preset became `custom`, and:

```
Applying: preset custom — WRITE=on CMDB_WRITE=on SCRIPTING=on ATF=on NOW_ASSIST=on FLUENT=off
Saved instance "pdi" (pdi · basic · preset custom · default).
Probes: auth ok · write ok · cmdb_write ok · scripting ok · atf ok · now_assist ok · FLUENT off.
Store: <home>/snowarch-sitting-a/ref/.local/instances.json (mode 0600, dir 0700)
[B06/09] instance … ok (8009 s)
[B07] ok   [B08] verify ok (6 s)   [B09]
```

### The store on disk

```
stat -f %Lp .local/instances.json → 600
stat -f %Lp .local               → 700
```

Contents, through the helper that prints lengths rather than values: version 1, default instance
`pdi`; the URL, the username and the credential each present only as `set (len n)`; `environment`
pdi; auth method basic; preset `custom`; `toolPackage` **full**; `maxRecords` **100**;
`prodWriteAck` **false**; and six flags as strings — `WRITE_ENABLED`, `CMDB_WRITE_ENABLED`,
`SCRIPTING_ENABLED`, `ATF_ENABLED`, `NOW_ASSIST_ENABLED` all `"true"`, `FLUENT_ENABLED` `"false"`.

Strings rather than booleans is the format, not a serialisation accident: the store's own type is
`Record<string, string>` and the flags mirror environment variables.

`lastProbe` carries **six `ok`** — `auth`, `write`, `scripting`, `cmdb`, `atf`, `nowAssist` — plus
`fluent: "not installed"`. R1's criterion "five probes ok" is the five **capability** probes at
`[6/6]`; `auth` is `[4/6]`'s separate check. Counting the JSON gives six, and the two numbers are
not in conflict.

The seven `[INFO] Querying ServiceNow table:` lines map onto it: `sys_user` and
`sys_user_has_role` for auth, `sys_update_set` for write, `cmdb_ci` for cmdb, `sys_script_include`
for scripting, `sys_atf_test` for atf, `sys_properties` for now_assist — seven queries, six
results.

## Doctor summary

`37 ok, 1 warn, 1 fail (1 fixable)`. E-00–E-09 ok; docs, roster and contract ok; SV-07, SV-08 ok.

| check | result |
|---|---|
| `E-10` | **FAIL** — see Defects raised; the state was correct |
| `E-11` | ok — `.local/ state: mode live` |
| `E-23` | warn — stale registrations from the owner's earlier product install, unchanged by this run |
| `E-27` | ok — `Claude Code registration status: ✔ Connected · scope local (local)` |
| `E-28` | ok — release currency, answered from the cache |
| `SV-02` | ok — `store: source project, <checkout>/.local/instances.json; mode 0600` |
| `SV-03` | ok — `instances: pdi: flags explicit, preset custom` |
| `SV-04` | ok — `auth ok · write ok · cmdb_write ok · scripting ok · atf ok · now_assist ok · fluent not installed` |
| `SV-05` | ok — `stdio handshake: 397 tools advertised, matching the contract` |
| `SV-06` | ok — `capabilities match the store: pdi: preset custom, pdi, maxRecords 100` |
| `SV-09` | ok — `store schema v1 (current)` |

The last line of the report read `Mode: design-only …`. See Defects raised.

## Tests

`/mcp`, inside a Claude session started from this checkout:

```
Local MCPs (<home>/.claude.json [project: <home>/snowarch-sitting-a/ref])
  servicenow · ✔ connected · 397 tools
```

…alongside the user-scope context-mode entry and the connectors.

| acceptance row | evidenced by | verdict |
|---|---|---|
| ARC-07 R1, ARC-07-S05 AC1, AC2 | the wizard above; the store's 600/700, six flags, `toolPackage full`, `maxRecords 100`; nothing echoed at `[4/6]` | **PASS**, except A3 — see below |
| ARC-06 R3 (B06/B08 against an instance) | B06 completed, B08 `verify ok`, and `/mcp` showing the server connected through the local entry with 397 tools, agreeing with `E-27` and `SV-05` | **PASS** |

### Not evidenced by this sitting

Stated rather than inferred, because a store written correctly says nothing about either:

- **A3's process-list check** — whether the credential was visible in `ps` arguments while it was
  being typed.
- **A3's shell-history check** — whether anything was left in history afterwards.

The owner did not run them. Nothing above substitutes: `[4/6]` echoing nothing is evidence about
the screen.

Also outstanding, untouched by this run: the live E2E suite (`RUN_LIVE_E2E=1`, five secrets), the
two real-network diagnoses, `import --from-legacy` against a real 1.x store, T-20 and T-21's four
manual passes, the `RUN_LIVE_E2E` server checks, the eight-cell masked-input matrix, and the
Windows dialog count.

## Observer notes

**`8009 s` for B06 is wall time with a person at the prompts for about two hours**, not work done.

**Deviation from the Sitting C script, recorded as a deviation:** the script says "preset full".
`custom` is the correct outcome of toggling FLUENT off on the tool's own recommendation — the
script's expectation was written before that path existed.

**`--fix` was deliberately not run.** It was offered by the tally and could not have helped; the
sitting records the state the wizard left.

Two presentation notes, filed and not fixed — both are output a user reads as ours:

- `(node:NNN) [UNDICI-EHPA] Warning: EnvHttpProxyAgent is experimental`, printed twice with the
  `--trace-warnings` hint. Node's own notice, from the runtime rather than from us.
- The seven `[INFO] Querying ServiceNow table:` lines reaching the terminal during probes, twice —
  the server's logger on stdout.

## Defects raised

Both were found by this run and **both are fixed on `develop` and absent from rc.5**. The lines
below are the evidence that found them, not defects that survived them.

**`E-10 FAIL settings.local toggles match the recorded mode: mode is live but servicenow is
disabled → ./snowarch mode live [fixable]`** — **ARC-08-C15**. The state was correct: with a local
registration the project entry stays disabled or both entries load, and the writer knew that while
the check did not. The remedy offered is the command just run, and `--fix` could not change
anything, because nothing was wrong.

**`Mode: design-only — server disabled in .claude/settings.local.json although instance "pdi" is
configured; run ./snowarch mode live`** — **ARC-08-C16**. The same report says `mode live`,
`✔ Connected · scope local` and `397 tools advertised`, and `/mcp` shows the server answering. It
is the line the SessionStart banner and `/snowarch status` quote, so it was the sentence seen most
often and the only one that was wrong.
