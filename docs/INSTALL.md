<!-- This page IS the README's body: `README.md` = `docs/README-head.md` + everything from the
     first `## ` below, composed by `scripts/gen-readme.mjs` and checked in CI. Edit this file, never
     README.md. The four `<!-- generated:… -->` regions are written from the code that prints those
     sentences, so the page cannot describe an install the tool does not perform. -->

## Install

Two ways in. **Path A** starts in a terminal and is shorter; **Path B** starts inside Claude Code,
for people who would rather ask than type. Both end in the same place: a checkout running
design-only, with live mode one command away.

### Prerequisites

Checked by the bootstrap, never installed by it.

| For | Requirement | Why this floor |
|---|---|---|
| Everything | Claude Code ≥ **2.1.214**, logged in | 2.1.196 settled the `.mcp.json` approval semantics, 2.1.198 the hook placeholders, and 2.1.214 keeps the previous tool list when a refresh fails |
| Everything | git ≥ **2.25** | cone-mode `sparse-checkout`, which is how the documentation corpus arrives |
| Live mode only | Node.js ≥ **20** (22 LTS recommended, 24 tested) with npm on PATH | the MCP server's own floor |
| Windows | PowerShell 5.1 (built in) and **Git for Windows** | the launchers need no Git Bash — but Claude Code's Bash tool does, and the in-session skills (`/snowarch status`, `/snowarch setup-instance`) run through it |

**Node.js is needed only for live mode.** Without it the install completes design-only and says so —
the doctor, the live wizard and the MCP server are what wait for Node.

### Path A — terminal first

```sh
git clone https://github.com/farstic/ai-servicenow-architect.git && cd ai-servicenow-architect && ./bootstrap.sh
```

On Windows, three lines instead — or double-click `bootstrap.cmd` in the folder:

```bat
git clone https://github.com/farstic/ai-servicenow-architect.git
cd ai-servicenow-architect
.\bootstrap.cmd
```

Then `claude` in the same folder.

### What you will see

The bootstrap shows its plan before it does anything, and every step prints one line. A real
design-only run, start to finish:

Six preflight checks print a line each (git, Claude Code, disk, network, Node, platform), and then:

```
[B00/09] preflight … ok (0.7 s)
Plan — Enter runs it as shown · type a number to change that line · q quits
  1  Mode   design-only          live needs a ServiceNow instance (wizard runs in this terminal); Node 24.16.0 found
  2  Docs   sparse (19 areas)    full = whole corpus · skip = none (the doctor will report FAIL)
  Steps  B01 workspace · B02 docs · B05 contract · B07 toggles · B09 summary
[B01/09] workspace … ok (0.1 s)
[docs] 31.5 s · pin 11b39be · sparse · complete
[B02/09] docs … ok (32 s)
[B03/09] mode … ok (0.0 s)
[B04/09] deps … skipped (design-only)
[B05/09] contract … ok (0.0 s)
[B06/09] instance … skipped (design-only)
[B07/09] toggles … ok (0.0 s)
[B08/09] verify … skipped (design-only)
[B09/09] summary … ok (0.0 s)
```

Enter accepts; a number changes that line; `q` quits and writes nothing at all. It ends with the
block below — the tool's own text, inserted here from its source:

<!-- generated:closing-block -->
```
DOCTOR: unavailable until Node 20+ is installed (design-only is complete)
Mode: design-only
Next: run `claude` here. You will see one workspace-trust dialog — answer Yes.
      (If you are already inside Claude Code in this folder: exit it and start `claude` again.)
      Add a live instance later with ./snowarch mode live, or /snowarch setup-instance inside Claude.
```
<!-- /generated:closing-block -->

`--yes` skips the plan screen. Interrupting with Ctrl-C is safe: the run records where it stopped,
and re-running resumes from that step rather than starting again.

### The dialogs

<!-- generated:dialogs -->
Starting `claude` in the checkout shows **one dialog**: workspace trust. Answer Yes.

Measured on Claude Code 2.1.258. The engine's floor is 2.1.214, where a second approval for the MCP server may still appear — the bootstrap prints how many to expect before you start, so the summary is the authority and this page is the expectation.
<!-- /generated:dialogs -->

### Path B — Claude first

```sh
mkdir my-engagement && cd my-engagement && claude
```

Accept the workspace-trust dialog, then paste exactly this:

> Install the AI ServiceNow Architect from https://github.com/farstic/ai-servicenow-architect into
> this folder.

Claude runs two commands — `git clone https://github.com/farstic/ai-servicenow-architect.git .` and
`./bootstrap.sh --mode design --yes --skip-claude-check` — asking your permission for each unless the
session already allows them. They are written out here for a reason: if Claude proposes anything else
— cloning into a *subfolder* is the common variation — paste them yourself and you are back on the
path.

**A folder that already has files in it.** `git clone` refuses a non-empty directory, so the same
result is reached the long way:

```sh
git init
git remote add origin https://github.com/farstic/ai-servicenow-architect.git
git fetch --depth 1 origin main
git checkout -b main --track origin/main
```

This fails safely: if one of your files collides with one of the repository's, git refuses to
overwrite it. Move that file and run the checkout again.

**Then exit Claude and start it again.** `CLAUDE.md`, `.mcp.json` and `.claude/settings.json` are
read at session start, so the session that installed them has not read them — and it has not been
asked to trust the folder either, which is why it may say it is *ignoring* the settings it just
cloned. The restart is what fixes both.

### Team variant

One person runs Path A and commits nothing extra — the checkout is the repository everyone else
clones. `.local/` (state, credentials, logs) and `.claude/settings.local.json` (the per-machine
toggles) are gitignored. Everyone runs their own `./bootstrap.sh`, and live mode is per-person.

### Adding live mode later

```sh
./snowarch mode live            # Windows: snowarch.cmd mode live
```

That turns a design-only checkout into a live one — no re-clone, no re-registration — and
`./snowarch mode design` turns it back, keeping the instance; `./snowarch mode` says which you are
in. From inside Claude, `/snowarch setup-instance` walks you there and hands off to your own
terminal, because a credential must never pass through a chat transcript:

<!-- generated:terminal-handoff -->
```
Next step happens in YOUR terminal (credentials never pass through this chat).
1. Open a terminal at this checkout: <absolute path>
2. Run:   ./snowarch instance add <label> --url <url> --default
   (Windows PowerShell/cmd:  snowarch.cmd instance add <label> --url <url> --default)
3. The wizard proposes the environment and preset and shows a per-flag review — press Enter to accept, or edit any line.
4. Type your username and password when prompted (masked; nothing is echoed).
5. When it prints "Saved instance …", come back here and type:  /snowarch setup-instance --resume
I will wait. Nothing is written until you confirm in the terminal.
```
<!-- /generated:terminal-handoff -->

### Operators and CI — a live install with no keyboard

`./snowarch bootstrap --mode live --yes --instance-file <path>` reads its connection details from a
file instead of prompting, so a credential never passes through a command line, a transcript, an
environment dump or a shared config file. It is a **store document** — the same shape as
`.local/instances.json`, so `cp` from another checkout works:

```json
{ "version": 1,
  "instances": {
    "pdi": { "url": "https://dev123456.service-now.com",
             "auth": { "method": "basic", "username": "<user>", "password": "<password>" } } } }
```

It must be **mode 0600 or stricter** (checked before it is read) and somewhere git could not commit
it — outside the checkout, or gitignored inside it. `environment` and `preset` may be omitted: a
`dev*.service-now.com` URL proposes `pdi`, a sandbox the most permissive preset and production the
most restrictive, and every proposal is printed with `accepted: --yes` so nothing is decided
silently. Production above the read-only preset additionally needs `"prodWriteAck": true`. The
credential is authenticated **once** — a retry is the same wrong password sent again — and nothing
is saved unless it succeeds. The file is never copied, moved or deleted, and the run reminds you it
still holds your credentials; on Windows the mode cannot be checked and the run says so.

### Design-only without Node

When Node is absent the launcher finishes the whole design-only install in `sh` — on Windows under
`bootstrap.cmd`, with no Git Bash involved — and says what is waiting: `DOCTOR: unavailable until
Node 20+ is installed (design-only is complete)`. Nothing is half-done, and installing Node later
needs no re-clone. If `disableAllHooks` is set in your `.claude/settings.local.json` the session
banner will not run; the bootstrap neither sets nor removes that key, it says so and leaves it.

### Start `claude` at the checkout root

Claude Code reads `.claude/settings.json` and `.mcp.json` from the session's primary working
directory, so a session started inside `clients/<name>/` loads neither and the specialists are simply
absent. Engagement folders are paths *within* the checkout — or one checkout per engagement, which
is also how the confidentiality boundary is kept.

### If your organisation blocks project MCP servers

Some managed machines reject servers declared in a repository's `.mcp.json`. The same secret-free
entry can be registered for this checkout alone:

```sh
./snowarch mode live --register local
```

`--register user` is the last resort: it attaches the server to every project on the machine, which
the engagement boundary argues against, and refuses to run without `--ack-user-scope`. Both go
through the `claude mcp` CLI — this project never edits Claude Code's own configuration file.

### What to do if

Every preflight failure prints its own remedy. These are those sentences:

<!-- generated:remedies -->
| If | macOS / Linux | Windows |
|---|---|---|
| You are not at the checkout root | `cd "{root}" && ./bootstrap.sh` | `cd /d "{root}" && .\bootstrap.cmd` |
| git is missing or too old | `xcode-select --install (or: brew install git)` | `winget install Git.Git` |
| Claude Code is missing or too old | `install Claude Code from https://code.claude.com/docs/en/setup, then re-run` | `install Claude Code from https://code.claude.com/docs/en/setup, then re-run` |
| Not enough disk space | `free up {needed} on {mount}` | `free up {needed} on {mount}` |
| github.com is unreachable | `check your network, or set HTTPS_PROXY / NO_PROXY for your environment, and re-run` | `check your network, or set HTTPS_PROXY / NO_PROXY for your environment, and re-run` |
| Node.js is missing or too old (live mode only) | `brew install node@22` | `winget install OpenJS.NodeJS.LTS` |
| A 32-bit Node.js build | `a 64-bit build of Node.js is recommended` | `a 64-bit build of Node.js is recommended` |
<!-- /generated:remedies -->

The full catalogue is `docs/TROUBLESHOOTING.md`. Whatever went wrong, re-run the bootstrap — it
resumes at the step that failed rather than starting over.

### What the corpus costs

**The corpus costs about 302 MB on disk and about 30 seconds to fetch** — a sparse, blobless
checkout of 19 areas out of 49,000 tracked paths. Two measurements, because they count different
things: the **working tree** is 179 MB on Linux and macOS, 183 MB on Windows, 34,360 files
(measured 2026-09-09 by `docs-real.yml` on all three runners: 25.3 s Ubuntu · 27.5 s macOS · 35.1 s Windows),
and **tree plus `.git`** is 302 MB macOS / 305 MB Ubuntu / 315 MB Windows
(measured 2026-09-06, ARC-00 S-07). The first is what you read, the second is what the disk loses.
`--docs full` takes the whole corpus instead: **447 MB and 48,997 files**
(measured 2026-09-09 on the reference macOS machine — ARC-00 S-07 did not measure full mode).

### Uninstall

Delete the checkout: it holds the only copy of anything you configured, in `.local/` — credentials
included. If you used the CLI's own config directory (`~/.config/snowarch/`, `%APPDATA%\snowarch\` on
Windows), delete that too. Nothing was written to Claude Code's own configuration unless you chose
the fallback registration above; if you did:

```sh
claude mcp remove servicenow -s local     # or -s user, whichever you chose
```

Claude Code keeps its own record that you trusted the folder. It is harmless and refers to a path
that no longer exists.
