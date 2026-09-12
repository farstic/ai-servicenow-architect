> **Redaction rules (ARC-00 STORIES.md conventions).** No instance URLs, usernames, passwords, tokens or
> `~/.claude.json` contents appear in a spike record — **key names only, values as `set (len n)`**.
> Paths are `~`-relative. Screenshots are cropped to the dialog.
> A spike that runs on several operating systems carries **one *Observed* block per OS and one verdict line**.

# S-14a — Masked `userConfig` dialog and its backing store

**Run by:** ARC-00-S12 · **Verdict consumed by:** ADR-0006/0008 → entry gate of ARC-06-S01 (D-06 hedge)

**Status: ANSWERED — and the answer is bad. The `sensitive` field is only *partially* masked: the dialog
renders asterisks with the **last six characters in clear**. The storage question was already answered and
remains the other half.**

## Assumption

> `userConfig` fields with `sensitive: true` produce a masked dialog for both `claude plugin install` in a terminal and `/plugin install` in a session, on macOS, Windows and Linux; which store backs "secure storage" on Windows/Linux; the ~2 KB Keychain budget behaviour

**Impact if false:** §B (roadmap channel) · **Evidence so far (from `03`):** (none recorded in `03` §B — the §B table carries Assumption and Check only)

## Environment

| Field | Value |
|---|---|
| macOS | **26.5.2** build **25F84**, arm64 · Node v24.16.0 · git 2.39.5 |
| Claude Code | **2.1.258** only. One binary for the whole sitting, deliberately: `03` §F **S-21** records that alternating 2.1.214 and 2.1.258 flips `migrationVersion` in `~/.claude.json` on every switch. Verified unchanged at **14** before and after every step here. |
| Fixture | `farstic/snowarch-spikes-marketplace` (private, throwaway) — marketplace `snowarch-spikes` with plugins `architect-engine` and `servicenow-server`, commit `fdfb49f` |
| Runners | `ubuntu-22.04`, `macos-latest`, `windows-latest` (S-19 only), Claude Code **2.1.263** installed from npm, **not logged in**, no TTY |
| Ubuntu VM · Windows VM | `NOT RUN — awaiting the owner's claude login in arc00-ubuntu` · `DEFERRED — Windows VM pending (owner input #2)` |
| Date | 2026-09-06 (day 1 of the five-working-day time-box) |

**What was written to this machine and what was cleaned up.** `claude plugin marketplace add` registered
the marketplace in `~/.claude/plugins/known_marketplaces.json` and cloned it to
`~/.claude/plugins/marketplaces/snowarch-spikes`; `claude plugin install --scope project` wrote
`enabledPlugins` into the scratch project's `.claude/settings.json`, an entry in
`~/.claude/plugins/installed_plugins.json`, a cache copy under `~/.claude/plugins/cache/`, and the
non-sensitive `userConfig` values into `~/.claude/settings.json`. All of it was removed afterwards:
`plugin uninstall`, `marketplace remove`, the cache directory deleted by hand, the scratch project
deleted. What remains are two **empty** objects the CLI created and then emptied —
`pluginConfigs {}` and `extraKnownMarketplaces {}` in `~/.claude/settings.json` — left in place because
they are Claude Code's own bookkeeping. `~/.claude.json` `migrationVersion` unchanged at 14 throughout.

## Procedure

**Check that retires it (from `03`):** Install a test plugin from a local marketplace on all three OSes; inspect `~/.claude/.credentials.json` vs Keychain.

## Observed

### The schema, discovered by validating rather than assumed

Every `userConfig` entry **requires a `title` string**. Without it:

```
$ claude plugin validate plugins/servicenow-server
✘ Found 4 errors:
  ❯ userConfig.SNOW_URL.title: Invalid input: expected string, received undefined
  ...
✘ Validation failed
$ echo $?
1
```

With `title` added, the manifest validates clean (`--strict`, exit 0). This is the first thing ARC-06
would have hit had the channel decision gone the other way.

### `userConfig` can be supplied entirely non-interactively

`claude plugin install --help` documents `--config <key=value>` (repeatable): *"Values are validated
against the schema and stored via **the same path as the interactive `/plugin configure` flow**."* So the
storage question can be answered without a dialog, and it was:

```
$ claude plugin install servicenow-server@snowarch-spikes --scope project -y \
    --config SNOW_URL=… --config SNOW_USER=… --config SNOW_PASSWORD=… --config SNOW_OPTIONAL=
✔ Successfully installed plugin: servicenow-server@snowarch-spikes (scope: project)
⚠ Installed, but --config not applied: --config SNOW_OPTIONAL: value is empty.
  Omit the flag to leave "SNOW_OPTIONAL" unset.
```

The warning names only the offending flag; the other three **were** applied (a later install reported
"**1** userConfig option not yet set", the optional one). An earlier reading of this record said the whole
config set was discarded — that was wrong and is corrected here.

### Where the values actually go — the answer that matters for D-06

| Field | `sensitive` | Stored where | Mode |
|---|---|---|---|
| `SNOW_URL` | no | **`~/.claude/settings.json`** → `pluginConfigs/<plugin>/options/` | **`-rw-r--r--` (0644)** |
| `SNOW_USER` | no | same | same |
| `SNOW_PASSWORD` | **yes** | **not in any file** — the macOS keychain item `Claude Code-credentials` (account = the OS user) was modified at `20260906172434Z`, the moment of the install | keychain |

Verified without reading any value: a scan of `~/.claude/settings.json` shows `pluginConfigs` containing
**only** `SNOW_URL` and `SNOW_USER`, and no string anywhere in that file equals the supplied password
fixture. `~/.claude/.credentials.json` does not exist on this machine; the keychain service
`Claude Code-credentials` is the same item that holds the login token.

**Two consequences for the D-06 comparison, and they cut opposite ways.**

0. **The Linux backing store is now MEASURED, and it is the plaintext fallback.** On `arc00-ubuntu`
   (Ubuntu 22.04, Claude Code 2.1.263, logged in 2026-09-07) there is **no OS keyring at all** —
   `secret-tool` absent, `gnome-keyring` absent, no `~/.local/share/keyrings` — and the login credential
   lives in **`~/.claude/.credentials.json`, mode `600`**, 509 bytes, owner `ubuntu`, holding
   `claudeAiOauth.{accessToken, refreshToken, expiresAt, refreshTokenExpiresAt, scopes,
   subscriptionType, rateLimitTier}` (key names only; no value was read).

   That is the plaintext fallback the secure-storage layer falls back to, observed rather than inferred.

   **The outstanding half is now MEASURED — a `sensitive` plugin `userConfig` value lands in that same
   plaintext file** (`arc00-ubuntu`, 2026-09-07, Claude Code 2.1.263). A plugin was installed with a
   distinctive non-secret fixture password and every candidate file searched with `grep -c`, so no value
   was printed:

   | File | fixture password present | mode |
   |---|---|---|
   | `~/.claude/settings.json` | **0** — `pluginConfigs` holds only `SNOW_URL`, `SNOW_USER` | **664** |
   | **`~/.claude/.credentials.json`** | **1** | **600** |
   | `~/.claude.json` | 0 | 600 |
   | `~/.claude/plugins/installed_plugins.json` | 0 | 664 |
   | the project's `.claude/settings.json` | 0 | 664 |

   A recursive search of `~/.claude` returns **`.credentials.json` and nothing else**, and the file grew
   from **509 to 609 bytes at the moment of the install**. There is no keyring on the machine at all
   (`secret-tool` absent, no `~/.local/share/keyrings`).

   **So on Linux the plugin channel's "secure storage" for a sensitive value is a plaintext 0600 JSON
   file** — exactly D-04's `.local/instances.json`, with none of the advantage the macOS keychain reading
   suggested. The Linux row is closed; only Windows remains open.

   **And note the mode of the file that holds the non-sensitive values: `664`.** On this machine
   `~/.claude/settings.json` — carrying the instance URL and the user name — is **group-writable and
   world-readable**, where the credential file beside it is `600`.

1. **In favour of the plugin channel — but only as observed, on macOS, and now contradicted on Linux.** Here the `sensitive` value never
   reached a plaintext file; it went to the keychain. **That is a macOS observation, not a property of
   the channel.** The assumption this spike quotes asks precisely the unanswered half — *"which store
   backs 'secure storage' on Windows/Linux"* — and both of those rows are outstanding (Ubuntu awaits the
   login, Windows is owner input #2). Claude Code's own secure-storage layer is keychain **with a
   plaintext fallback**: where no keychain is available it writes `~/.claude/.credentials.json` at 0600
   and logs a plaintext-fallback warning. On such a machine the sensitive value would be at **parity**
   with D-04's `.local/instances.json`, not better — and point 0 above shows this is not hypothetical:
   the Ubuntu VM **is** such a machine, and its credential is a 0600 JSON file. **On the evidence now in
   hand this consequence is not an argument for the channel on Linux at all**, and the Windows row is
   still open.
2. **Against it, and it is the sharper point:** the **non-sensitive** options — for this product, the
   *instance URL and the user name* — are written to **`~/.claude/settings.json` at USER scope, mode
   0644, world-readable**, even though the plugin was installed at **project** scope. D-04 chose a
   per-checkout store precisely so that one engagement is one checkout; a user-scope 0644 file holding
   the instance URL and user name of whichever engagement was configured last works against that
   firewall. Any move to the plugin channel would need `SNOW_URL` and `SNOW_USER` marked
   `sensitive: true` as well, or the confidentiality argument in D-04 weakens.

### Owner sitting, 2026-09-07 — `/plugin configure`, Claude Code 2.1.258 *(source: owner sitting 2026-09-07, relayed by the architect)*

`/plugin configure` presents the four `userConfig` fields, the three required ones marked `*`. The
`SNOW_PASSWORD` field is declared `"sensitive": true`.

**Observed: the field is not fully masked. It renders as asterisks with the last six characters visible in
clear.**

**This is the assumption's load-bearing claim, and it does not hold.** The whole argument for the plugin
channel over the monorepo path (D-06, ADR-0006) was that a **masked** `userConfig` dialog keeps the
credential out of the terminal — replacing interruption (3), "credentials typed in the user's own
terminal". A field that shows its last six characters **is** a credential rendered in the terminal, just
a shorter one. For a short password it may be most of it; for any password it is enough to shoulder-surf,
and it will sit in a screen recording or a screen-share.

**Consequence for the D-06 hedge, stated plainly:** the plugin channel's principal advantage over the
monorepo path is materially weakened. It does not vanish — the value is still not in `argv`, not in the
transcript, and not in a file the user hand-edits (see the storage answer above) — but "masked dialog" can
no longer be written in a comparison table without this qualification.

**Handling note.** The owner initially typed real values, cancelled before Save on the architect's
instruction, and re-entered fixtures. **No real value appears in this record, and none was transmitted to
me.** Only the rendering behaviour is recorded.

### INTERACTIVE-PENDING (superseded by the row above; retained for the procedure)

Not observed, and not simulated: whether the `sensitive: true` field is **masked on input** in the
terminal `claude plugin install` prompt and in the in-session `/plugin install` flow, and the ~2 KB
keychain budget behaviour with a 3 KB value. Exact steps for the owner's sitting are in
`spikes/S-14a-user-config-masked-dialog/INTERACTIVE.md`.

## Verdict

`S-14a: PARTIAL — storage answered **on macOS only**: sensitive → the macOS keychain, non-sensitive → ~/.claude/settings.json at USER scope, 0644, even for a project-scope install; `title` is a required userConfig field. **Masking of the dialog itself is interactive-pending, and the Windows and Linux stores are not run**`

## Evidence

- `farstic/snowarch-spikes-marketplace` @ `fdfb49f` — the fixture.
- Command transcripts are quoted inline above; every exit code was measured **without a pipe**
  (a piped `$?` reports the last command in the pipeline, not `claude` — that mistake was made twice
  during this sitting and corrected both times).
