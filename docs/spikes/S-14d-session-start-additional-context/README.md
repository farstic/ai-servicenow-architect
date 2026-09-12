> **Redaction rules (ARC-00 STORIES.md conventions).** No instance URLs, usernames, passwords, tokens or
> `~/.claude.json` contents appear in a spike record — **key names only, values as `set (len n)`**.
> Paths are `~`-relative. Screenshots are cropped to the dialog.
> A spike that runs on several operating systems carries **one *Observed* block per OS and one verdict line**.

# S-14d — 12 KB SessionStart `additionalContext` from a plugin

**Run by:** ARC-00-S12 · **Verdict consumed by:** ADR-0006/0008 → entry gate of ARC-06-S01

**Status: CONFIRMED on 2.1.258 — all three halves. A 12,299-byte `additionalContext` from a plugin's
`SessionStart` hook reaches the model at startup, **survives `/compact`**, and **survives `exit` +
`claude --resume`**.**

## Assumption

> SessionStart `additionalContext` of ~12 KB is accepted without truncation and re-injected on `resume` / `compact`

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

**Check that retires it (from `03`):** `claude --debug` with a hook printing a 12 KB payload.

## Observed

### Built and verified standalone

`plugins/architect-engine/hooks/hooks.json` registers a `SessionStart` hook on
`startup|resume|compact` running `node ${CLAUDE_PLUGIN_ROOT}/hooks/inject.mjs`. The payload is
deliberately self-describing so truncation can be **measured**, not guessed: 205 fixed-width lines, each
carrying its own index, wrapped in `S14D-BEGIN bytes=… lines=…` / `S14D-END …` markers. Run directly:

```
$ node plugins/architect-engine/hooks/inject.mjs | head -1
S14D-BEGIN bytes=12299 lines=205
$ node plugins/architect-engine/hooks/inject.mjs | wc -c
12364
```

If the injection truncates, the last `S14D` line that arrives says exactly where it stopped, and the
absence of `S14D-END` is the signal.

### Owner sitting, 2026-09-07 — CONFIRMED on all three *(source: owner sitting 2026-09-07, relayed by the architect)*

| Stage | Evidence |
|---|---|
| **Startup** | hook log `S14D-BEGIN` / `S14D-END bytes=12299 lines=205`, and the model **quoted the `END` line verbatim from its context** |
| **After `/compact`** | the model quoted `S14D-END bytes=12299 lines=205` again |
| **After `exit` + `claude --resume`** | the same line, verbatim |

**Both directions are evidenced, which is what makes this a confirmation rather than an assumption.** The
hook's own log proves it *emitted* 12,299 bytes; the model quoting the terminal line proves the payload
*arrived* and **arrived complete** — a truncated injection would have lost the `END` marker, which is the
last thing in the payload. The marker was designed for exactly this and it earned its place.

**Consequence for the plugin channel.** A `SessionStart` hook is a viable delivery mechanism for a
protocol document of this size: ~12 KB survives the two events that would most plausibly drop it. **This
is a point in the plugin channel's favour** and should sit in the D-06 comparison beside S-14b's
no-approval-dialog finding — and against S-14a's partial masking.

**The contrast with S-05 is worth stating, because both are `SessionStart` hooks.** Here the hook *ran*
and its output was carried faithfully through compaction and resume. In S-05, with `node` absent, the
same class of hook **failed to run and said nothing at all**. The mechanism is dependable when it works
and silent when it does not — so what it delivers must be non-essential, or its failure must be detected
some other way.

### Owner sitting, 2026-09-07 — and an unrelated finding that outranks this spike *(source: owner sitting 2026-09-07, relayed by the architect)*

From `snow_probe_env_read` inside the **plugin-bundled** server, installed at `--scope project`, with the
session's `cwd` at `~/spike-runs/s12`:

| Variable | Value |
|---|---|
| **`CLAUDE_PROJECT_DIR`** | **the user's HOME directory** — *not* the project |
| `CLAUDE_PLUGIN_ROOT` | the plugin cache path |
| `argv[1]` | the cache's `server/server.mjs` |

**If this holds, a plugin-bundled server cannot locate a per-checkout credential store from
`CLAUDE_PROJECT_DIR`** — it would resolve every checkout to the same HOME path, which is precisely the
"one 0600 store per checkout" that **ADR-0004 (D-04)** fixes. That is a hard constraint on the plugin
channel, not a nuisance: two checkouts against two different instances would collide.

**The VM reproduction did NOT reproduce it — and the test is not equivalent, which is the point.**
Ubuntu VM, plugin channel, `--scope project`, session `cwd` = `/home/ubuntu/s14g-project`, `HOME` =
`/home/ubuntu`:

```
snow_probe_env_read (stub)
cwd: /home/ubuntu/s14g-project
argv: ["/snap/node/…/node","/home/ubuntu/marketplace/plugins/servicenow-server/server/server.mjs"]
env:
CLAUDE_PROJECT_DIR: /home/ubuntu/s14g-project      <-- the PROJECT, correctly
CLAUDE_PLUGIN_ROOT: /home/ubuntu/marketplace/plugins/servicenow-server
```

**But look at `argv[1]` and `CLAUDE_PLUGIN_ROOT`: the server ran from the marketplace *source directory*,
not from the plugin cache** — because the VM's marketplace is a `directory` source (a local clone; no
GitHub credential was placed on the VM). The owner's machine used an SSH `git` source, where the server
runs **from the cache**. **Those are two different execution contexts**, so this run does not falsify the
owner's reading; it measures a different configuration.

**Then run on the owner's own Mac, with the confound removed — and it still does not reproduce.**
On the architect's ruling, the probe was repeated on this machine with the **SSH `git`** marketplace
source (`{"source":"git","url":"git@github.com:…"}`), which installs into the cache and **launches the
server from it** — `argv[1]` and `CLAUDE_PLUGIN_ROOT` both under
`~/.claude/plugins/cache/snowarch-spikes/servicenow-server/0.0.1`, exactly the owner's execution context.
Work was done in a scratch folder, never the owner's `~/spike-runs`.

| Install scope | folder is a git repo | `cwd` | **`CLAUDE_PROJECT_DIR`** |
|---|---|---|---|
| `--scope project` | yes | scratch project | **= `cwd`** ✓ |
| `--scope user` | yes | scratch project | **= `cwd`** ✓ |
| `--scope user` | **no** | scratch non-git | **= `cwd`** ✓ |

**Four candidate explanations tested and eliminated:** the marketplace source type (`directory` vs `git`),
where the server executes (source dir vs cache), the install scope (project vs user — user scope was the
strongest hypothesis, since ADR-0006 already records that the plugin channel attaches at user scope by
default), and whether the folder is a git repository. `CLAUDE_PROJECT_DIR` tracked `cwd` in every one.

**What is left, stated without inference.** The owner's session was **interactive and in auto mode**;
every run here is `claude -p`. That is the only difference still standing, and it is not one this session
can test. **The cheap decisive check is one line from the owner:** in an interactive session, call
`snow_probe_env_read` and paste the `cwd:` and `CLAUDE_PROJECT_DIR:` lines verbatim. Until then the
reading stands as **recorded but unreproduced** — not as a finding, and explicitly not as an error on
anyone's part.

**Where that leaves the D-06 input.** If `CLAUDE_PROJECT_DIR` is reliable — as it was in all four
configurations here — then ADR-0004's per-checkout store *is* reachable from a plugin-bundled server, and
this is not a blocker for the plugin channel. The evidence in hand points that way; one interactive
reading would settle it.

*(Attempts to construct a cache-executed install on the VM without credentials are recorded rather than
retried: `file://` is rejected outright — "Invalid marketplace source format. Try: owner/repo,
https://..., or ./path" — and a dumb-HTTP git server is rejected because Claude Code clones shallowly:
"dumb http transport does not support shallow capabilities".)*

### A separate finding this test produced: `installPath` and the running process disagree

With the same `directory`-source marketplace:

```
claude plugin list --json  ->  installPath: ~/.claude/plugins/cache/snowarch-spikes/servicenow-server/0.0.1
cache contents             ->  node_modules  package-lock.json  package.json  server
the running server         ->  argv[1] = ~/marketplace/plugins/servicenow-server/server/server.mjs
```

**The cache entry is populated — including a full `npm ci` — and then not used.** The process is launched
from the source directory, which has no `node_modules` at all. For the dependency-free fixture that is
harmless; **for any plugin with dependencies, a `directory`-source install would fail at runtime while
`claude plugin list` reports a correctly installed plugin.** That also means S-14g's entire `npm ci`
measurement describes a tree the running server never loads, on this source type.

**Consequence for the D-06 hedge:** a local-path marketplace is not a faithful stand-in for a git one.
Anyone testing the plugin channel from a local checkout — the obvious way to develop it — is exercising a
different code path than the users will.

*(Contrast with the monorepo path, where S-20 measured `CLAUDE_PROJECT_DIR` **set correctly** in the
spawned server's environment. The variable is not broken in general — the question is what a **plugin**
server gets.)*

### Why nothing more is recorded

Everything this spike asks — the byte count received at startup, after `/compact`, and on
`claude --resume` — is only observable from inside a session with `--debug`. Steps for the owner are in
`INTERACTIVE.md`.

## Verdict

`S-14d: INTERACTIVE-PENDING — a self-describing 12,299-byte payload and its plugin hook are built and verified standalone; **startup, compact and resume injection each need a session**`

## Evidence

- `farstic/snowarch-spikes-marketplace` @ `fdfb49f` — the fixture.
- Command transcripts are quoted inline above; every exit code was measured **without a pipe**
  (a piped `$?` reports the last command in the pipeline, not `claude` — that mistake was made twice
  during this sitting and corrected both times).
