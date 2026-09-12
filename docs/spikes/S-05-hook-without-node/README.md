> **Redaction rules (ARC-00 STORIES.md conventions).** No instance URLs, usernames, passwords, tokens or
> `~/.claude.json` contents appear in a spike record — **key names only, values as `set (len n)`**.
> Paths are `~`-relative. Screenshots are cropped to the dialog.
> A spike that runs on several operating systems carries **one *Observed* block per OS and one verdict line**.

# S-05 — SessionStart hook when Node is absent

**Run by:** ARC-00-S06 · **Verdict consumed by:** ARC-06-S01/S05 and ARC-08-S08

**Status: CONFIRMED on 2.1.258 — with a split that matters. Interactively the failure **is** reported,
verbatim and non-blockingly, and the session is usable immediately; **headlessly (`claude -p`) there is no
notice at all.** The assumption holds on the path a human uses and fails on the path automation uses.**

## Assumption

> When `node` is absent, an exec-form SessionStart hook fails with a non-blocking notice and the session continues

**Impact if false:** M · **Evidence so far (from `03`):** not stated in `docs:hooks`

## Environment

| Field | Value |
|---|---|
| macOS | **26.5.2** build **25F84**, arm64 · Node v24.16.0 |
| Claude Code | **2.1.258** only for this sitting (S-21) · `migrationVersion` unchanged at 14 |
| "no-node" | the ARC-00-S01 recipe `spikes/recipes/no-node.sh` — strips every `PATH` entry containing a `node` executable and `exec`s, so descendants inherit it |
| Ubuntu VM · Windows VM | `NOT RUN — awaiting the owner's claude login` · `DEFERRED — Windows VM pending (owner input #2)` |
| Date | 2026-09-07 |

## Procedure

**Check that retires it (from `03`):** Remove Node from PATH; start `claude` in a design-only checkout; observe.

## Observed

### Ubuntu VM, 2026-09-07 — the hook fails silently; the MCP server does not

`arc00-ubuntu`, Claude Code **2.1.263** (a native ELF binary, not a Node script, so hiding `node` does not
disable Claude Code itself), `node` at `/snap/bin/node` removed from `PATH` by stripping that one
directory. Fixture: an exec-form `SessionStart` hook running `node <dir>/session-start.mjs`, and a
`.mcp.json` server with `command: "node"`.

**The control that makes the negative meaningful.** The hook script was given a filesystem side effect —
it writes `~/s05-marker.txt` — so "the hook did not run" is observed rather than inferred. Each run also
asked the session: *"Is there ANY SessionStart hook output, hook error, or hook failure notice anywhere in
your context? If yes quote it verbatim; if no say NO-HOOK-NOTICE."*

| | marker file | hook notice in context | session | exit | stderr |
|---|---|---|---|---|---|
| **`node` present** | **PRESENT** | `SessionStart:startup hook success: Mode: spike -- hook ran; CLAUDE_PROJECT_DIR=/home/ubuntu/s05-probe` | ran, answered | 0 | 157 B (harness warning only) |
| **`node` absent** | **absent** | **`NO-HOOK-NOTICE`** | ran, answered | 0 | 157 B (harness warning only) |

So the hook genuinely fired in the control and genuinely did not fire in the test case — and in the test
case **nothing anywhere reported it**. The session started normally and answered normally.

**Against the assumption as written** — *"fails with a non-blocking notice and the session continues"* —
the second clause holds and **the first does not**: there is no notice in this path. Scope stated
honestly: this is `claude -p`, not an interactive TTY, so a notice may still render in the UI. That is now
the *only* open question, and it is what Part D should ask.

### Owner sitting Part D, 2026-09-07 — the interactive TTY *does* report it *(source: owner sitting 2026-09-07, relayed by the architect)*

macOS, Claude Code **2.1.258**, **npm-installed** `claude` (an `#!/usr/bin/env node` launcher), so
**variant B** was used: the hook's `command` points at `/nonexistent/node` rather than `node` being hidden
from `PATH` — hiding `node` would have stopped Claude Code itself on that machine. Same spawn failure
class (`ENOENT`), different route to it, and the variant is recorded because the two are not
interchangeable evidence.

After the trust dialog — which **listed no hook warning** — the startup screen showed, verbatim:

> **SessionStart:startup hook error**
> Failed with non-blocking status code: `/bin/sh: /nonexistent/node: No such file or directory`

**The session started normally, the prompt was usable immediately, and nothing blocked.**

**So the assumption is confirmed for the interactive path**, and my earlier reading — that the
"non-blocking notice" half was refuted — was **refuted only for `claude -p`**, which is the scope I had
attached to it. Both readings stand; they describe different paths:

| Path | Hook fails to spawn | Notice |
|---|---|---|
| **Interactive TTY** (2.1.258, macOS, variant B) | yes | **shown**, names the failing command and `/bin/sh`'s error, **non-blocking** |
| **`claude -p`** (2.1.263, Ubuntu VM, variant A) | yes | **none anywhere** — not in context, not on stderr, exit 0 |

**The conclusion does not change, and it is worth saying why.** A notice that appears once on a startup
screen, above the prompt, in a session the user is about to start typing into, is **easily missed** — and
it is **absent entirely** from every automated path. Anything the product needs to know failed cannot
depend on it. The recommendation of the hook-free committed-settings fallback stands, and this
measurement sharpens rather than weakens it: **the platform's own report of a hook failure is
best-effort and human-only.**

### The asymmetry — and it is the finding

In the **same session**, with the same missing interpreter, the MCP server failure **was** reported into
context, precisely:

```
servicenow (ENOENT): "Executable not found in $PATH: node"
```

A `.mcp.json` server that cannot be spawned announces itself with a typed, actionable message. A
`SessionStart` hook that cannot be spawned says nothing at all. **Two mechanisms, the same root cause, and
opposite observability.**

**Consequence for ARC-06/ARC-08, and it is a design constraint rather than a note.** The product must not
place anything load-bearing in a `SessionStart` hook whose failure it needs to know about — a
`node`-invoked hook on a machine without Node is indistinguishable from a hook that ran and did nothing.
This independently supports the record's existing recommendation of the **hook-free committed-settings
fallback**, and adds a reason the record did not have: the alternative does not merely disable the user's
own hooks, it fails **invisibly**.

*(Fixture note, recorded because it produced a real observation: the `.mcp.json` written for this probe
carried an unexpanded `$F` in `args`, so in the `node`-present control the server failed as
`CONNECTION_CLOSED: "Connection closed"` rather than starting. That was a mistake in my fixture, not a
platform behaviour — and it is why the control's row reports the hook, not the server. The `ENOENT` line
above is from the `node`-absent run, where the failure is the one under test.)*

### The substrate, non-interactively

Under the `no-node` recipe, both things Claude Code would try to spawn fail the same way, and the failure
is the ordinary shell one:

```
$ ./spikes/recipes/no-node.sh sh -c 'sh -c "command -v node || echo NOT FOUND"'
NOT FOUND

$ ./spikes/recipes/no-node.sh sh -c 'node spikes/hooks/session-start.mjs'
sh: node: command not found          # exit 127

$ ./spikes/recipes/no-node.sh sh -c 'node spikes/stub-server/server.mjs'
sh: node: command not found          # exit 127
```

So in a design-only checkout with no Node, **both** the exec-form SessionStart hook and the `.mcp.json`
server (`command: "node"`) are unspawnable, and the OS-level result is exit **127**. That is the input
Claude Code has to turn into a notice — the spike's real question is what it *does* with it, and that is
only visible in a session.

### What could not be established without a session, and why

Whether the session starts, the exact notice text, whether the notice blocks or is dismissable, whether
`/mcp` shows the server failed, and whether `{"disableAllHooks": true}` in `.claude/settings.local.json`
silences it. The `claude -p --mcp-config` technique that answered S-20 does **not** help here: `-p` is
non-interactive by construction, so "does the notice block the user" has no meaning in it, and the notice
is a TUI affordance. Recorded as sitting **Part D**, ~10 minutes.

### The fallback choice this spike has to make (acceptance criterion 5)

`03` and `01` §4.2 offer two, and the evidence so far already favours one:

1. **The launcher writes `"disableAllHooks": true` into `.claude/settings.local.json` when Node is absent.**
   Cheap, but in a non-managed settings file that key also disables the user's **personal and plugin**
   hooks for this project (`docs:settings-reference`) — a side effect on the user's own configuration
   that the product would be causing silently.
2. **The committed `.claude/settings.json` ships hook-free, and the bootstrap writes the SessionStart
   hook into `settings.local.json` only when Node ≥ 20 is present.** No side effect on anything the user
   owns, and the design-only path never has a hook to fail.

**Option 2 is the one this record recommends**, and the reason is stronger than "it is cleaner": option 1
reaches into settings the user may have authored, to fix a problem the product created. Option 2 also
composes with what ARC-00-S20 established — the same `settings.local.json` is already where the bootstrap
writes `enabledMcpjsonServers`, so it is one file and one write, not two mechanisms. The sitting still
has to confirm that option 1's key *works* (`03` names it as the fallback), but the choice does not
depend on that.

## Verdict

`S-05: CONFIRMED **on 2.1.258** — with a split that matters: interactively an exec-form SessionStart hook whose interpreter is absent reports its failure verbatim and non-blockingly and the session is usable immediately, while **headlessly there is no notice at all**. The assumption holds on the path a human uses and fails on the path automation uses; proven with a filesystem marker, so "the hook did not run" is observed rather than inferred`

## Evidence

- `spikes/recipes/no-node.sh` — the recipe, with its own post-condition assert.
- `spikes/hooks/session-start.mjs`, `.claude/settings.json` — the hook under test.
