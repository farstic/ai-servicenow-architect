# Modes and presets

What `design-only` and `live` mean, what each preset turns on, what each flag does, and how production is protected.
ARC-07-S10 replaces the probe wording with what the wizard prints; every server behaviour here is current and tested.

## 1. Mode

**`design-only`** — no instance is configured. Everything works from `vendor/ServiceNowDocs`, the MCP write rules are
dormant, and `/mcp` shows `servicenow` disabled for this project. **`live`** — one or more instances in
`.local/instances.json`, each with its own preset. See which with `/snowarch status` or `./snowarch doctor --quick`:
the doctor's `Mode:` line is the statement of record, because a disabled family is still advertised in the tool list.
Switch with `./snowarch mode live` / `./snowarch mode design`; the first instance arrives through `/snowarch
setup-instance` or `./snowarch instance add`.

Flags belong to the **instance you are addressing**, not to the server process: one server can hold a PDI and a
production instance at once, and `snow_core_instance_switch prod` makes the next write refuse while the same call on
the PDI still succeeds.

## 2. Presets

<!-- PRESETS:BEGIN (generated from the contract by scripts/gen-governance.mjs — ARC-05) -->
| Preset | WRITE | CMDB_WRITE | SCRIPTING | ATF | NOW_ASSIST | FLUENT | Use it when… |
|---|---|---|---|---|---|---|---|
| `read-only` | false | false | false | false | false | false | Auditing, reviewing, designing against a real instance; **the only preset a `prod` instance may hold without `--ack-prod`** |
| `pdi-developer` | true | true | true | true | false | false | Building on a PDI / dev / test instance when Now Assist or Fluent are not wanted |
| `full` | true | true | true | true | true | true | Everything on; **the system's proposal for every `pdi` / `dev` / `test` instance (D-05)**; NOW_ASSIST needs a licence, FLUENT needs `@servicenow/sdk` — both are probed and annotated before the user confirms |
| `custom` | six explicit toggles | | | | | | Anything else; dependency rule enforced |
<!-- PRESETS:END -->

Every preset writes **all six** flags as the byte-exact strings the server compares against (`"true"` / `"false"`),
plus `toolPackage: "full"` and `maxRecords: 100`. Stored `flags` disagreeing with the table are reported as
`PRESET_FLAGS_MISMATCH` and **the preset wins**; omitting `flags` is not a disagreement — it takes the preset.

## 3. What the system proposes

The wizard never silently applies a preset. For a `pdi` / `dev` / `test` instance it *proposes* `full` —
non-production environments start with every capability available (D-05) — then shows a per-flag review screen, each
flag pre-set ON and annotated with its live probe result:

```
Proposed preset for "pdi" (pdi): full  — non-production: everything on
  [x] WRITE        probe: ok
  [x] CMDB_WRITE   probe: ok
  [x] SCRIPTING    probe: ok
  [x] ATF          probe: ok
  [x] NOW_ASSIST   probe: no Now Assist licence detected — tools will fail until licensed; keep on? (recommend: off)
  [x] FLUENT       probe: @servicenow/sdk not on PATH — keep on? (recommend: off)
Enter = accept as shown · type a flag name to toggle · "preset <name>" to switch preset
```

A probe that fails downgrades the recommendation shown on that line; it never flips the toggle by itself.

For a `prod` instance the proposal is `read-only`, with the write flags greyed out and the `--ack-prod` instruction
shown. **Environment detection:** a URL matching `^https://dev\d+\.service-now\.com` is proposed as `pdi`; any other
host is *asked* — "What is this instance? pdi / dev / test / prod" — never guessed. All of it is re-editable later:
`./snowarch instance set-preset <label> <preset>`, `set-flags`, or `/snowarch setup-instance`.

## 4. The six flags in plain language (in brackets, the key as written in the store and the environment)

- **WRITE** (`WRITE_ENABLED`) — create, update and delete records (incidents, catalog items, users, agile work, update
  sets). Without it everything is read-only.
- **CMDB_WRITE** (`CMDB_WRITE_ENABLED`) — additionally, CI and relationship reconciliation writes into the CMDB.
- **SCRIPTING** (`SCRIPTING_ENABLED`) — unlocks *writing* Script Includes, Business Rules, Client Scripts, ACLs, UI
  Actions and update-set changes. ***Reading* them is always allowed.**
- **ATF** (`ATF_ENABLED`) — *execute* ATF tests and suites; authoring and reading are always allowed.
- **NOW_ASSIST** (`NOW_ASSIST_ENABLED`) — the Now Assist / generative-AI tools; needs a Now Assist licence on the
  instance.
- **FLUENT** (`FLUENT_ENABLED`) — the ServiceNow SDK (Fluent) build and deploy tools; needs `@servicenow/sdk`, and
  deploys also need WRITE.

**The dependency rule**, enforced in the wizard and again in the server: `SCRIPTING_ENABLED` and `CMDB_WRITE_ENABLED`
are writes, so declaring either without `WRITE_ENABLED` is a contradiction, resolved towards *less* access — the
dependent flag is treated as `false`, `FLAG_DEPENDENCY_VIOLATION` says so, and the file on disk is never modified by
the server.

Upgrading from the 1.0.0 server: SCRIPTING used to gate *reads* too, so listing a Script Include needed a write flag.
It no longer does. If you relied on that to keep script bodies out of a session, the control you want is a
role-restricted ServiceNow account — the flag was never a confidentiality boundary, and treating it as one hid that.

## 5. Production safeguards

An instance tagged `environment: prod` is capped at `read-only` unless the store carries `prodWriteAck: true`. The
threshold is **any** flag raised, not just `WRITE_ENABLED` — a `custom` prod instance with only `ATF_ENABLED` still
runs tests against production, and the acknowledgement is about having chosen that. Raising it requires `./snowarch
instance set-preset <label> <preset> --ack-prod`, with the label typed.

Without it the instance is **not loaded**, but still appears in the listing with its reason — "it is not there" is a
worse answer than "here is why it is not usable". Every refusal names the instance for the same reason: with several
configured, "writes are disabled" is not actionable on its own. Both carry the command that changes it:

```
[WARN] instance "prod": environment=prod with preset full but prodWriteAck is not true — not loaded.
       Raise it deliberately with: ./snowarch instance set-preset prod full --ack-prod
       (code PROD_WRITE_NOT_ACKNOWLEDGED)

Write operations are disabled for instance "prod" (preset read-only).
Instance "prod" is tagged prod and capped at read-only.
Raising it requires: ./snowarch instance set-preset prod <preset> --ack-prod
```

Every mutating call is recorded in the audit log, `.local/audit.jsonl`.

## 6. Propose, don't impose

Design principle 10. The system proposes at every step; the user reviews and can change any single value at any level;
only then is anything applied. Enter accepts as shown, so the common path costs one keystroke and nothing is written
that the user has not seen. `--yes` accepts every proposal without the review screen — for CI, where nobody is there
to review.

## 7. Where the values live

One store. The first path that exists wins, and they are **never merged** — a merge makes "which file set this value"
unanswerable.

| Order | Source | Path |
|---|---|---|
| 1 | `SNOW_STORE` | the path it names. An **empty string counts as unset** — `.mcp.json` passes `${SNOW_STORE:-}` |
| 2 | per-checkout | `<CLAUDE_PROJECT_DIR or cwd>/.local/instances.json` (0600, gitignored, one per checkout) |
| 3 | global | `~/.config/snowarch/instances.json`, or `%APPDATA%\snowarch\instances.json` on Windows |

`SNOW_STORE` pointing at a missing file is an **error, not a fallback**: silently loading an instance other than the
one named is the failure an explicit override has to avoid. **Env-defined instances win over all three** — with
`SERVICENOW_INSTANCE_URL` or any `SN_INSTANCE_<NAME>_URL` set, those are the instances, no store is read, and the six
`*_ENABLED` variables in the server's environment apply to them and to nothing from the store. That is the CI path:

```
[INFO] instance source: env (SERVICENOW_*/SN_INSTANCE_*); store ignored: <checkout>/.local/instances.json
```

**What protects the file.** It holds a password, so on macOS and Linux the *file* is refused — not warned about — if
it carries any group or world bit, and the message names the exact remedy:

```
Refusing to load <checkout>/.local/instances.json: file mode 0644 is group/world-readable.
Run, from the checkout: chmod 600 .local/instances.json
```

That remedy never carries an absolute path: checkout-relative inside the checkout, `~` under your home directory, and
anywhere else — a path you named with `SNOW_STORE` — exactly as you typed it, because rewriting it would point the
command somewhere you did not choose. The *directory* is a different risk: a 0600 file is unreadable by others
wherever it sits, so 0755 is no reason to refuse a protected store, and what a directory bit actually buys an attacker
is group or world **write** — replacing the file, or planting a symlink where it was.

| Directory | Result |
|---|---|
| group/world writable, **no sticky bit** (e.g. 0777) | **refused** — the file can be replaced |
| group/world writable **with** the sticky bit (1777, as `/tmp` is) | loads, with a warning |
| any other group/world bit (e.g. 0755) | loads, with a warning |
| 0700 | silent |

On Windows the check is skipped and the log says `file modes: ACL-inherited (Windows)`: permissions there are
ACL-inherited and the POSIX bits Node reports are synthetic, so asserting on them would fail for a protected file.

Writes are atomic — temp file in the same directory, `fsync`, `rename` over the target — so a reader never sees a
half-written store. Paths in logs are masked, home to `~` and the checkout to `<checkout>`: a log line reaches screen
shares, bug reports and support tickets, and an absolute path carries the account name.

A store inside a cloud-sync folder (OneDrive, Dropbox, Google Drive, iCloud Drive) is flagged: `0600` is a *local*
permission and the sync client runs as the same user, so the mode does not stop the file leaving the machine (D-04).

## 8. Where a password may be typed

One place: an interactive terminal, where `snowarch instance add` reads it with echo off and it
never reaches argv, the environment or a transcript. When stdin is not a terminal the command
**refuses** rather than reading the pipe — a password read from an unexpected stdin is a password
in a CI log — and prints the `NO_TTY:` line, which names `--password-stdin` and shows the password
manager form (`op read "op://vault/item/password" | ./snowarch instance add …`). `--password`,
`--client-secret` and `--secret` are rejected before the arguments are parsed at all. Should a
Windows console turn out not to support masked input (spike S-04), that console gets the same
`--password-stdin` line instead of a prompt that cannot work.
