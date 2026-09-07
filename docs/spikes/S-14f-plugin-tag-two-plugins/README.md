> **Redaction rules (ARC-00 STORIES.md conventions).** No instance URLs, usernames, passwords, tokens or
> `~/.claude.json` contents appear in a spike record — **key names only, values as `set (len n)`**.
> Paths are `~`-relative. Screenshots are cropped to the dialog.
> A spike that runs on several operating systems carries **one *Observed* block per OS and one verdict line**.

# S-14f — `claude plugin tag` with two plugins in one repository, and `plugin-dependencies`

**Run by:** ARC-00-S12 · **Verdict consumed by:** ADR-0006/0008 → entry gate of ARC-06-S01

**Status: CONFIRMED — real tags created, pushed, and every guard exercised. The dependencies question had a WRONG answer in the first version of this record and is corrected below.**

## Assumption

> `claude plugin tag` (`<name>--v<version>`) works with two plugins in one repository tagged on the same commit; `plugin-dependencies` field shape

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

**Check that retires it (from `03`):** `claude plugin tag --help`; `docs:plugin-dependencies`.

## Observed

### Two plugins, one repository, one commit — both tag cleanly

```
$ claude plugin tag --dry-run plugins/architect-engine        # exit 0
Plugin:  architect-engine
Version: 0.0.1 (from plugin.json)
Marketplace entry: plugins[0] in …/.claude-plugin/marketplace.json
Tag:     architect-engine--v0.0.1
✔ Dry run — would create tag architect-engine--v0.0.1 at HEAD

$ claude plugin tag --dry-run plugins/servicenow-server       # exit 0
Marketplace entry: plugins[1] in …/.claude-plugin/marketplace.json
Tag:     servicenow-server--v0.0.1
```

Distinct tags at the same HEAD, and the command **cross-checks the plugin manifest against its
marketplace entry** (it names `plugins[0]` / `plugins[1]`), which is exactly the drift a two-plugin
repository invites. `--push`, `--remote`, `-m/--message` (with `%s` for the version) and `--force` exist.

### The dependency field exists — it is spelled `dependencies`, and the first version of this record said the opposite

**Correction.** This record originally concluded "there is no such field". That was wrong: it probed only
the two spellings `03` §B guesses at, not the plain one. Re-probed, `--strict`, exit codes without a pipe:

```
dependencies = ["servicenow-server@snowarch-spikes"]   -> exit 0   ✔ Validation passed
dependencies = ["other-plugin"]                        -> exit 0   ✔ Validation passed
dependencies = {"other":"^1.0.0"}                      -> exit 1   ❯ dependencies: Invalid input: expected array, received object
```

So **`dependencies` is a recognised `plugin.json` field on 2.1.258 and it is array-valued**; an object
gets a *typed schema error*, not "unknown field", which is how a real field announces itself. Entries are
accepted both bare (`"other-plugin"`) and marketplace-qualified (`"plugin@marketplace"`). That is the
shape `03` §B asks for, and it is what `claude plugin prune|autoremove` — "remove auto-installed
dependencies that are no longer needed" — operates on.

### What genuinely does not exist: the two spellings `03` §B guesses

Probed both, `--strict`, exit code measured without a pipe:

```
$ claude plugin validate --strict plugins/architect-engine      # after adding pluginDependencies
⚠ ❯ pluginDependencies: Unknown field 'pluginDependencies'. Claude Code ignores it at load time.
✘ Validation failed (--strict treats warnings as errors)        # exit 1

$ …                                                             # after adding plugin-dependencies
⚠ ❯ plugin-dependencies: Unknown field 'plugin-dependencies'. Claude Code ignores it at load time.
✘ Validation failed (--strict treats warnings as errors)        # exit 1
```

So `plugin-dependencies` and `pluginDependencies` are unknown fields that the runtime *silently ignores*
and `--strict` rejects — but the mechanism **is** a manifest key, just not either of the two `03` §B
guesses at. `03` §B's row should be corrected to name `dependencies` (array).

### Real tags, and every guard exercised (architect-approved, 2026-09-06)

The dry run was closed out with real tags in the throwaway fixture. Exit codes measured without a pipe.

```
$ claude plugin tag plugins/architect-engine            # exit 0
✔ Created tag architect-engine--v0.0.1
$ claude plugin tag plugins/servicenow-server           # exit 0
✔ Created tag servicenow-server--v0.0.1

$ git tag --points-at HEAD
architect-engine--v0.0.1 servicenow-server--v0.0.1      # both at a5924e5
$ git cat-file -t architect-engine--v0.0.1
tag                                                     # ANNOTATED, not lightweight
```

Distinct tag objects (`0a664e2`, `b16eac8`) peeling to the same commit, each with the message
`<name> <version>`.

**The guards, one at a time:**

```
# tag already exists
$ claude plugin tag plugins/architect-engine            # exit 1
✘ Tag "architect-engine--v0.0.1" already exists locally. Bump the version in plugin.json,
  or re-run with --force to move the tag.

# dirty working tree — isolated by bumping to 0.0.2 first, because the "exists" check fires first
$ claude plugin tag plugins/architect-engine            # exit 1, tree dirty
✘ Uncommitted changes affecting this release — commit them first so the tag points at the
  version you intend to release (or use --force):   plugins/architect-engine/.claude-plugin/plugin.json

# after committing the bump
$ claude plugin tag plugins/architect-engine            # exit 0 -> architect-engine--v0.0.2

# --force moves an existing tag, and the printed push hint switches to `push --force`
$ claude plugin tag --force plugins/architect-engine    # exit 0

# --push
$ claude plugin tag --force --push plugins/servicenow-server   # exit 0
✔ Pushed to origin
```

On the remote, both tags are present and annotated — the peeled `^{}` refs both resolve to `a5924e5`:

```
$ git ls-remote --tags origin
595359f…  refs/tags/architect-engine--v0.0.1
a5924e5…  refs/tags/architect-engine--v0.0.1^{}
7273cc7…  refs/tags/servicenow-server--v0.0.1
a5924e5…  refs/tags/servicenow-server--v0.0.1^{}
```

**The dirty-tree guard is version-scoped, not repository-scoped**, and the "exists" check runs first —
worth knowing for a release script: a stale tag masks a dirty tree until the version is bumped. Note
also that the marketplace entry carries **no** `version` field; the version comes from `plugin.json` and
the cross-check is that a marketplace *entry* exists for the plugin.

## Verdict

`S-14f: CONFIRMED — two plugins in one repository produce distinct ANNOTATED `<name>--v<version>` tags at the same HEAD and push cleanly; the exists, dirty-tree and --force guards all behave (exists fires before dirty-tree, and the dirty-tree guard is version-scoped); the dependency field DOES exist on 2.1.258, spelled `dependencies` and array-valued — `plugin-dependencies` and `pluginDependencies` are the unknown spellings 03 §B guesses`

## Evidence

- `farstic/snowarch-spikes-marketplace` @ `fdfb49f` — the fixture.
- Command transcripts are quoted inline above; every exit code was measured **without a pipe**
  (a piped `$?` reports the last command in the pipeline, not `claude` — that mistake was made twice
  during this sitting and corrected both times).
