# Modes and presets

> **Draft — ARC-07 owns the final text.** This file exists now because ARC-04-S02 needs a home
> for the store precedence. Everything about Modes, Presets and the wizard's review screen is
> written by ARC-07; only the precedence section below is settled.

## Where the configuration comes from

One store. The first path that exists wins, and they are **never merged** — a merge makes
"which file set this value" unanswerable.

| Order | Source | Path |
|---|---|---|
| 1 | `SNOW_STORE` | the path it names. An **empty string counts as unset** — `.mcp.json` passes `${SNOW_STORE:-}` |
| 2 | per-checkout | `<CLAUDE_PROJECT_DIR or cwd>/.local/instances.json` |
| 3 | global | `~/.config/snowarch/instances.json`, or `%APPDATA%\snowarch\instances.json` on Windows |

**`SNOW_STORE` pointing at a missing file is an error, not a fallback.** It is an explicit
override; silently loading a different instance than the one named is the failure this avoids.

**Env-defined instances win over all three.** If `SERVICENOW_INSTANCE_URL` or any
`SN_INSTANCE_<NAME>_URL` is set, those are the instances and no store is read. This is the CI
and automation path, not a user path, and the startup line says so:

```
[INFO] instance source: env (SERVICENOW_*/SN_INSTANCE_*); store ignored: <checkout>/.local/instances.json
```

## What protects the file

The store holds a password, so on macOS and Linux the **file** is refused — not warned about — if
it carries any group or world bit, and the message names the exact remedy:

```
Refusing to load <checkout>/.local/instances.json: file mode 0644 is group/world-readable.
Run, from the checkout: chmod 600 .local/instances.json
```

The remedy is phrased for where the file actually is, and never carries an absolute path: inside the
checkout it is checkout-relative and says so; under your home directory it uses `~`, which a shell
expands; anywhere else — a path you named yourself with `SNOW_STORE` — it is left exactly as you
typed it, because rewriting it would point the command somewhere you did not choose.

The **directory** is a different risk and is treated differently. A 0600 file is unreadable by
anyone else whatever folder it sits in, so an ordinary 0755 directory is not a reason to refuse a
correctly protected store. What a directory bit actually buys an attacker is group or world
**write**: the ability to replace the file or plant a symlink where it was. So:

| Directory | Result |
|---|---|
| group/world writable, **no sticky bit** (e.g. 0777) | **refused** — the file can be replaced |
| group/world writable **with** the sticky bit (1777, as `/tmp` is) | loads, with a warning — sticky means only the owner can unlink or rename their own entry |
| any other group/world bit (e.g. 0755) | loads, with a warning |
| 0700 | silent |

On Windows the check is skipped — permissions there are ACL-inherited and the POSIX mode bits
Node reports are synthetic, so asserting on them would fail for a correctly protected file. The
log says `file modes: ACL-inherited (Windows)`.

Writes are atomic: a temp file in the same directory, `fsync`, then `rename` over the target. A
reader never sees a half-written store.

A store inside a cloud-sync folder (OneDrive, Dropbox, Google Drive, iCloud) is flagged: `0600`
is a *local* permission, and the sync client runs as the same user, so the mode does not stop
the file leaving the machine.

## Paths in logs are masked

The home directory becomes `~` and the checkout becomes `<checkout>`. A log line reaches screen
shares, bug reports and support tickets, and an absolute path carries the account name.

## How the server applies flags

> Draft — ARC-07 owns the final wording.

Six flags decide what a session may do, and they belong to the **instance you are addressing**, not to
the server process. One server can hold a PDI and a customer's production instance at once;
`snow_core_instance_switch prod` makes the next write refuse while the same call on the PDI still
succeeds.

### The presets

| Preset | WRITE | CMDB_WRITE | SCRIPTING | ATF | NOW_ASSIST | FLUENT |
|---|---|---|---|---|---|---|
| `read-only` | false | false | false | false | false | false |
| `pdi-developer` | true | true | true | true | false | false |
| `full` | true | true | true | true | true | true |
| `custom` | whatever the store declares; an omitted flag reads as `false` | | | | | |

A named preset whose stored `flags` disagree with the table is reported as `PRESET_FLAGS_MISMATCH` and
**the preset wins**. Omitting `flags` entirely is not a disagreement — it simply takes the preset.

### The dependency rule

`SCRIPTING_ENABLED` and `CMDB_WRITE_ENABLED` are writes. Declaring either without `WRITE_ENABLED` is a
contradiction, and it is resolved towards *less* access: the dependent flag is treated as `false`, and
`FLAG_DEPENDENCY_VIOLATION` says so. The file on disk is never modified by the server.

### The production rule

An instance tagged `environment: prod` is capped at `read-only` unless the store carries
`prodWriteAck: true`. The threshold is **any** flag raised, not just `WRITE_ENABLED` — a `custom` prod
instance with only `ATF_ENABLED` still runs tests against production, and the acknowledgement is about
having chosen that deliberately.

Without the acknowledgement the instance is **not loaded** — it still appears in the listing, with its
reason, because "it is not there" is a worse answer than "it is there and here is why it is not usable":

```
[WARN] instance "prod": environment=prod with preset full but prodWriteAck is not true — not loaded.
       Raise it deliberately with: ./snowarch instance set-preset prod full --ack-prod
       (code PROD_WRITE_NOT_ACKNOWLEDGED)
```

### What a refusal looks like

Every refusal names the instance — with several configured, "writes are disabled" is not actionable on
its own — and carries the command that changes it:

```
Write operations are disabled for instance "prod" (preset read-only).
Instance "prod" is tagged prod and capped at read-only.
Raising it requires: ./snowarch instance set-preset prod <preset> --ack-prod
```

### Environment variables

`WRITE_ENABLED` and its five siblings in the server's environment apply **only to env-defined
instances** (`SERVICENOW_*`, `SN_INSTANCE_*`), which is the CI and automation path. They have no effect
on an instance that came from the store.

