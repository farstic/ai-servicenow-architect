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

The store holds a password, so on macOS and Linux a mode with any group or world bit set is
**refused**, not warned about, and the message carries the exact remedy:

```
Refusing to load <path>: file mode 0644 is group/world-readable. Run: chmod 600 <path>
```

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
