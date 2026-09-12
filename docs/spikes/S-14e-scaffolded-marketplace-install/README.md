> **Redaction rules (ARC-00 STORIES.md conventions).** No instance URLs, usernames, passwords, tokens or
> `~/.claude.json` contents appear in a spike record — **key names only, values as `set (len n)`**.
> Paths are `~`-relative. Screenshots are cropped to the dialog.
> A spike that runs on several operating systems carries **one *Observed* block per OS and one verdict line**.

# S-14e — Scaffolded `extraKnownMarketplaces` + `enabledPlugins` for a teammate

**Run by:** ARC-00-S12 · **Verdict consumed by:** ADR-0006/0008 → entry gate of ARC-06-S01

**Status: REFUTED, on both the headless and the interactive path.** A scaffolded `.claude/settings.json`
does not install anything, and says nothing about it. The `extraKnownMarketplaces` half **is** honoured —
the marketplace gets registered — so the file is demonstrably read; it is `enabledPlugins` that does not
install. The install mechanism itself works fine when invoked explicitly.

## Assumption

> `extraKnownMarketplaces` + `enabledPlugins` in a scaffolded `.claude/settings.json` installs both plugins for a teammate and still prompts the `userConfig` dialog

**Impact if false:** §B (roadmap channel) · **Evidence so far (from `03`):** (none recorded in `03` §B)

## Environment

| Field | Value |
|---|---|
| macOS | **26.5.2** build **25F84**, arm64 · Node v24.16.0 · git 2.39.5 |
| Claude Code | **2.1.258** only. One binary for the whole sitting, deliberately: `03` §F **S-21** records that alternating 2.1.214 and 2.1.258 flips `migrationVersion` in `~/.claude.json` on every switch. Verified unchanged at **14** before and after every step here. |
| Fixture | `farstic/snowarch-spikes-marketplace` (private, throwaway) — marketplace `snowarch-spikes` with plugins `architect-engine` and `servicenow-server`, commit `fdfb49f` |
| Runners | `ubuntu-22.04`, `macos-latest`, `windows-latest` (S-19 only), Claude Code **2.1.263** installed from npm, **not logged in**, no TTY |
| Ubuntu VM · Windows VM | **RUN 2026-09-07** — `arc00-ubuntu`, Ubuntu 22.04.5 LTS aarch64, Claude Code **2.1.263**, `migrationVersion` **14 before and after** (one binary). Marketplace delivered as a `git bundle` over `multipass transfer` and cloned locally, so **no GitHub credential was placed on the VM** · `DEFERRED — Windows VM pending (owner input #2)` |
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

**Check that retires it (from `03`):** Second machine, fresh trust.

## Observed

### Second machine, 2026-09-07 — a scaffolded `settings.json` installs **nothing**, and says nothing

`arc00-ubuntu` is a genuine second machine: a different OS, a different Claude Code build (2.1.263), and
no prior knowledge of the marketplace. The fixture repo was transferred as a git bundle and cloned to
`/home/ubuntu/marketplace`, so the marketplace source here is `{"source":"directory"}` rather than the
`git@github.com:` SSH source used on the first machine — **stated as a deviation**, and it is the reason
no credential had to be put on the VM.

Three sessions, each `claude -p` in the scaffolded project, each asked to report any plugin/marketplace
notice in its context.

| # | Where the marketplace was declared | `enabledPlugins` | plugins installed | cache | notice |
|---|---|---|---|---|---|
| 1 | **project** `.claude/settings.json` | project | **`[]`** | empty | **NONE** |
| 2 | **user** `~/.claude/settings.json` *(where the CLI itself writes it)* | project | **`[]`** | empty | **NONE** |
| 3 | user — **plus an explicit `claude plugin install`** | project | **installed** | `snowarch-spikes` | — |

**Session 2 is the discriminator.** In it the marketplace *was* known — `claude plugin marketplace list`
found `snowarch-spikes` — so the settings files were demonstrably being read. What did not happen is the
**install**. `enabledPlugins` looks like an instruction and behaves like a *record*: it is what
`claude plugin install --scope project` writes down afterwards, not a request to install.

**Session 3 is the positive control that makes the two negatives mean something.** An explicit install on
this machine works end to end:

```
$ claude plugin install architect-engine@snowarch-spikes --scope project -y
✔ Successfully installed plugin: architect-engine@snowarch-spikes (scope: project)
$ claude plugin list --json
[ { "id": "architect-engine@snowarch-spikes", "version": "0.0.2", "scope": "project",
    "enabled": true, "installPath": "~/.claude/plugins/cache/snowarch-spikes/architect-engine/0.0.2", … } ]
```

and in the very next session the plugin's contents are live — *"From the `architect-engine` plugin: skills
`csm-sample`, `devops-sample`, `itsm-sample`, and agent `sample-builder`."* Note that the project's
`.claude/settings.json` was **already** carrying `enabledPlugins` for both plugins before this install and
was **unchanged** by it. **The cache is what makes a plugin real; `enabledPlugins` is bookkeeping.**

**Against the assumption** — *"`extraKnownMarketplaces` + `enabledPlugins` in a scaffolded
`.claude/settings.json` installs both plugins for a teammate"* — **the first clause is refuted.** And it
fails the way the worst failures do: **silently.** The teammate's session starts normally, the plugin's
skills and MCP server are simply absent, and nothing anywhere says why.

**Scope, stated rather than glossed.** These are `claude -p` sessions, so there is no workspace-trust
acceptance. S-01 established that `enabledMcpjsonServers` is applied *at trust time and not before*, so it
is entirely possible that an **interactive first run in a freshly trusted checkout** installs where these
did not. That is now the precise remaining question — and it is what the procedure's "second machine,
fresh trust" was always asking. What is settled is narrower and still decisive for ARC-06: **the settings
keys alone, read and honoured, do not populate the cache.**

**Consequence for the D-06 hedge.** If the plugin channel is chosen, the bootstrap cannot hand a teammate
a checkout and rely on scaffolded settings — it must run `claude plugin marketplace add` and
`claude plugin install` itself, which is a command the teammate executes, not a file they receive. That is
the same class of interruption the plugin channel was supposed to remove.

**Residue.** Removed afterwards: plugin uninstalled, marketplace removed, `~/.claude/plugins/cache/snowarch-spikes`
deleted, `extraKnownMarketplaces` emptied. Verified: `plugin list` → `[]`, no `snowarch-spikes` marketplace,
empty cache, `~/.claude.json` `migrationVersion` **14** unchanged throughout.

### Both keys are real and the CLI writes them itself

```
$ claude plugin marketplace add git@github.com:farstic/snowarch-spikes-marketplace.git
Cloning repository (timeout: 120s): git@github.com:…
Clone complete, validating marketplace…
✔ Successfully added marketplace: snowarch-spikes (declared in user settings)
$ echo $?
0
```

A **private** repository over SSH is accepted; the marketplace is cloned to
`~/.claude/plugins/marketplaces/<name>` and registered in `~/.claude/plugins/known_marketplaces.json`
with `installLocation`, `lastUpdated` and `source {source: git, url}`. The CLI's own phrase is
*"declared in **user settings**"*, and it creates an `extraKnownMarketplaces` key in
`~/.claude/settings.json`.

`claude plugin install --scope project` then writes exactly the other half into the **project**:

```json
{ "enabledPlugins": { "servicenow-server@snowarch-spikes": true } }
```

So a scaffolded `.claude/settings.json` carrying both keys is describing something the CLI itself
produces — the mechanism is real. Note the split, which the assumption does not mention: the
marketplace registration is **user**-scoped and the enable is **project**-scoped, so a teammate's
checkout supplies only half of it.

### One asymmetry worth recording

`claude plugin uninstall` refuses while the plugin is enabled at project scope:

> *Plugin "…" is enabled at project scope (.claude/settings.json, shared with your team). To disable
> just for you: `claude plugin disable … --scope local`.*

A teammate who receives a scaffolded project therefore cannot simply uninstall; they must disable at
local scope. Worth knowing before promising "one command to opt out".

**And the message points at the wrong file.** The owner hit the same refusal **after deleting
`.claude/settings.json`** — the message still named it, *"enabled at project scope (.claude/settings.json,
shared with your team)"*, for a file that no longer existed; `--scope project` on the uninstall was what
actually worked *(source: owner sitting 2026-09-07, relayed by the architect)*. I reproduced the same class of refusal on the VM: a bare
`claude plugin uninstall <id>` failed and only succeeded with `--scope project`.

**This corroborates the second-machine finding below from the opposite direction.** The enablement state
that Claude Code actually consults lives in **`~/.claude/plugins/installed_plugins.json`**, not in the
project's `settings.json` — which is why deleting `settings.json` does not disable the plugin, and why
writing `enabledPlugins` into `settings.json` does not enable one. **`enabledPlugins` is a mirror of the
real state, in both directions**, and the error message treats the mirror as the source.

**Consequence for a teammate, which is the audience this spike is about:** the documented escape hatch
does not work as written. "Delete the file" leaves the plugin enabled, and the error message sends the
user to look at a file that may not exist. The instruction has to be
`claude plugin uninstall <id> --scope project`, and ARC-06 should say exactly that.

### The interactive half — owner sitting B6, 2.1.258 *(source: owner sitting 2026-09-07, relayed by the architect)*

A never-trusted folder scaffolded with **both** keys, the marketplace removed beforehand
(`marketplace list` showed only `claude-plugins-official`), and `grep -c "<path>" ~/.claude.json` = 0.
The `extraKnownMarketplaces` value was **generated by the CLI and copied**, not hand-written — the
scaffold deliberately avoided a hand-written key, because a shape Claude Code silently ignores would have
produced a false negative identical to the true result. The SSH shape it produced:

```json
{"snowarch-spikes": {"source": {"source": "git", "url": "git@github.com:farstic/snowarch-spikes-marketplace.git"}}}
```

First interactive session after accepting trust:

| Check | Result |
|---|---|
| `/plugin list` | **"No plugins installed. Use /plugin install to install a plugin."** |
| `/mcp` | 10 servers, **no plugin server** |
| Any notice explaining it | **none of any kind** |
| `claude plugin marketplace list` **afterwards** | **`snowarch-spikes · Source: Git (git@github.com:…)`** |
| Trust-modal wording for this run | **not observed** — the owner did not note it. Recorded as not observed; no inference drawn. |

**The last row is what makes this decisive rather than merely negative.** The session **read the
scaffolded key and acted on it** — it registered the marketplace at user scope, which it could only have
learned from the project file. So the file was found, parsed and honoured. **`enabledPlugins` sat right
beside the key that worked, and installed nothing.** The two keys are not equivalent: one is an
instruction the session executes, the other is a record it ignores.

This matches the headless result exactly, so the trust-gating hypothesis — reasonable, given S-01 showed
`enabledMcpjsonServers` applies at trust time — **is excluded**. The behaviour is the same on both paths.

**Four `extraKnownMarketplaces` source shapes are now on record**, which is why the scaffold generates the
key rather than writing it: `{"source":"github","repo":"owner/repo"}` (the official marketplace),
`{"source":"git","url":"git@github.com:…"}` (SSH, above), `{"source":"directory","path":"…"}` (a local
clone, measured on the VM), and a `file://` URL which the CLI **rejects outright** —
*"Invalid marketplace source format. Try: owner/repo, https://..., or ./path"*.

### The fourth silent failure

Recorded plainly because the pattern is now the finding rather than the incident. In this spike set,
Claude Code has been observed to do work, fail, and say nothing four times: `claude -p` exits **0** on a
dead or timed-out MCP server (S-06); a `SessionStart` hook that cannot spawn produces **no notice at all**
while an MCP server in the same session reports `ENOENT` (S-05); `claude plugin install` prints
**"✔ Successfully installed"** while the `npm ci` beneath it is SIGTERM'd and exits **1** (S-14g); and a
teammate's scaffolded checkout **silently has no plugins** (here). **ARC-06 cannot rely on the platform to
surface any of these; `snowarch doctor` has to detect each one itself.**

### INTERACTIVE-PENDING — resolved

The second-machine *install* question is answered below (it does not install). What remains is the
**interactive first run in a freshly trusted checkout**, which the owner is running as sitting step B6,
and whether the `userConfig` dialog appears there.

## Verdict

`S-14e: PARTIAL — marketplace add from a private git URL over SSH works (exit 0, user-scope registration); `--scope project` writes enabledPlugins into the project, so the marketplace and enable split is user+project, not project alone. **The second-machine run and the dialog are interactive-pending**`

## Evidence

- `farstic/snowarch-spikes-marketplace` @ `fdfb49f` — the fixture.
- Command transcripts are quoted inline above; every exit code was measured **without a pipe**
  (a piped `$?` reports the last command in the pipeline, not `claude` — that mistake was made twice
  during this sitting and corrected both times).
