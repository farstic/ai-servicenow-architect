> **Redaction rules (ARC-00 STORIES.md conventions).** No instance URLs, usernames, passwords, tokens or
> `~/.claude.json` contents appear in a spike record — **key names only, values as `set (len n)`**.
> Paths are `~`-relative. Screenshots are cropped to the dialog.
> A spike that runs on several operating systems carries **one *Observed* block per OS and one verdict line**.

# S-14c — Blank optional `${user_config.KEY}` substitution

**Run by:** ARC-00-S12 · **Verdict consumed by:** ADR-0006/0008 → entry gate of ARC-06-S01

**Status: ANSWERED on 2.1.258 — an optional `userConfig` field left blank arrives at the server as an
**empty string**, not as unset and not as the literal `${user_config.KEY}`.**

## Assumption

> `${user_config.KEY}` for an optional field left blank substitutes an empty string into `env` (not the literal placeholder, not a load failure)

**Impact if false:** §B (roadmap channel) · **Evidence so far (from `03`):** (none recorded in `03` §B)

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

**Check that retires it (from `03`):** Dummy server that echoes its env.

## Observed

### You cannot set an optional field blank from the CLI — it stays *unset*

```
$ claude plugin install … --config SNOW_OPTIONAL=
⚠ Installed, but --config not applied: --config SNOW_OPTIONAL: value is empty.
  Omit the flag to leave "SNOW_OPTIONAL" unset.
```

So the spike's premise — "an optional field **left blank**" — has three possible readings, and the CLI
collapses one of them: *blank* and *absent* are the same state as far as `--config` is concerned. The
remaining question is what `${user_config.SNOW_OPTIONAL}` expands to in the server's `env` when the
option is unset: an empty string, the literal placeholder text, or a load failure.

### Owner sitting, 2026-09-07 — the substitution observed, Claude Code 2.1.258 *(source: owner sitting 2026-09-07, relayed by the architect)*

`snow_core_instances_reload` → tool set B; `snow_probe_env_read` reports:

```
SNOW_OPTIONAL: set but empty
```

**So a blank optional field becomes an empty string in the server's environment.** The two failure modes
this spike was built to distinguish are both excluded: the variable is **not** absent, and it does **not**
carry the un-substituted literal `${user_config.SNOW_OPTIONAL}`.

**Consequence for any server built on this channel:** `process.env.X ?? default` will **not** apply the
default, because the key exists. The test has to be `if (!process.env.X)`, i.e. treat empty as unset — and
that is a code rule for ARC-04, not a documentation note. It is exactly the kind of defect that passes
every local test where the value happens to be set.

### The probe is built and proven; only the substitution is unobserved

The bundled server carries an env-echo tool that reports **names and lengths only, never values**, and
distinguishes exactly the three states this spike needs. Proven against the fixture directly:

```
SNOW_URL: set (len 32)
SNOW_USER: set (len 5)
SNOW_PASSWORD: set (len 14)
SNOW_OPTIONAL: (set, empty string)
```

and it reports `LITERAL PLACEHOLDER — not substituted: …` if the value still contains
`${user_config.`. Reading it through Claude Code needs a session, because `claude mcp` cannot reach a
plugin-bundled server at all (S-14b).

## Verdict

`S-14c: PARTIAL — `--config KEY=` is rejected ("value is empty… leave unset"), so blank and absent are one state at the CLI; what `${user_config.KEY}` expands to for an unset option is INTERACTIVE-PENDING (the echo tool is built and proven)`

## Evidence

- `farstic/snowarch-spikes-marketplace` @ `fdfb49f` — the fixture.
- Command transcripts are quoted inline above; every exit code was measured **without a pipe**
  (a piped `$?` reports the last command in the pipeline, not `claude` — that mistake was made twice
  during this sitting and corrected both times).
