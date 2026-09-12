> **Redaction rules (ARC-00 STORIES.md conventions).** No instance URLs, usernames, passwords, tokens or
> `~/.claude.json` contents appear in a spike record — **key names only, values as `set (len n)`**.
> Paths are not secrets and may be printed verbatim. Screenshots are cropped to the dialog.
> A spike that runs on several operating systems carries **one *Observed* block per OS and one verdict line**.

# S-11 — Claude Code floor 2.1.214 sufficiency

**Run by:** ARC-00-S11 · **Verdict consumed by:** ARC-01-S04 (floors in `engine.config.json`), ARC-06-S04

**Status: CONFIRMED, non-interactively, on macOS — eight rows behave identically on the floor
binary 2.1.214 and on 2.1.258.** Rows are not mechanisms: six are mechanism rows and two are
controls, and row 1 covers two of the story's eleven mechanisms at once (the project `.mcp.json`
load and the unconfigured advertisement), so the eight rows measure **seven of eleven**. The four
that are not measured are named in the verdict, and a named one failing later reopens it. A
by-product of the run is a clean round-trip confirmation of `03` §F **S-21**.

## Assumption

> Claude Code floor 2.1.214 is sufficient for every mechanism used

**Impact if false:** L · **Evidence so far (from `03`):** Version notes collected: 2.1.196 approval semantics, 2.1.198 hook placeholders, 2.1.214 `list_changed` resilience

## Environment

| Field | Value |
|---|---|
| Machine / snapshot | macOS **26.5.2** build **25F84**, arm64 |
| Claude Code | **2.1.214** (`~/.local/bin/claude-2.1.214`, the floor) against **2.1.258** (`~/.npm-global/bin/claude`, current) |
| Node | **v24.16.0** · npm 11.13.0 · git 2.39.5 |
| Date | 2026-09-07, immediately after the owner's sitting closed and `migrationVersion` had been recorded |
| git | _`git --version`_ |
| Shell | _zsh 5.9 / PowerShell 5.1 / cmd_ |
| Date | _YYYY-MM-DD_ |

## Procedure

**Check that retires it (from `03`):** Install exactly 2.1.214 (native installer with a version argument) in a VM; run design-only and live flows

Eight `claude -p --mcp-config <f> --settings <f> --strict-mcp-config` sessions on the **floor** binary,
each re-running a mechanism already measured on 2.1.258, against the same stub server and the same
settings files. Every one is a mechanism the product depends on, and four of the eight carry their own
negative control so a pass cannot be a false positive.

**Timing was deliberate.** `03` §F **S-21** records that alternating the two binaries flips
`migrationVersion` in `~/.claude.json`. This run was held until the owner had closed their sitting and
recorded that value, so the flip could not corrupt their reading.

## Observed

| # | Mechanism | Spike | Result on **2.1.214** | Matches 2.1.258 |
|---|---|---|---|---|
| 1 | stdio server connects, unconfigured advertisement | S-17 | **5 tools** | ✓ |
| 2 | `list_changed` after reload — set-B tool callable in the same session | S-02 | **`OK snow_probe_env_read (stub)`** | ✓ |
| 3 | `permissions.allow` honours a `Bash(...)` rule | S-16 | ran → `doctor:stub ok:true` | ✓ |
| 4 | **control:** no allow rule | S-16 | **BLOCKED** | ✓ |
| 5 | middle-wildcard glob `snow_*_read` allows `capabilities_read` | S-12 | ran → `stub: snow_core_capabilities_read ok` | ✓ |
| 6 | **control:** the same glob and `snow_core_records_query` | S-12 | **BLOCKED** | ✓ |
| 7 | an `ask` rule is enforced on a mutating tool | S-18 | **BLOCKED** | ✓ |
| 8 | `env.MCP_TIMEOUT` = 2000 against a 5 000 ms server | S-06 | **UNAVAILABLE** — *"the `servicenow` MCP server never finished connecting"* | ✓ |

**Eight for eight.** The assumption — *"Claude Code floor 2.1.214 is sufficient for every mechanism
used"* — **holds**, including the one the version notes single out (`2.1.214 list_changed resilience`,
row 2), which is the mechanism ARC-04's instance reload is built on.

Also checked before the suite: **2.1.214 accepts every headless flag the harness needs** —
`--mcp-config`, `--settings`, `--strict-mcp-config`, `--permission-mode`. That is not incidental: if the
floor lacked them, none of ARC-00's non-interactive measurements would transfer to it.

### By-product: `03` §F **S-21** confirmed by a clean round trip

`migrationVersion` in `~/.claude.json`, read at each step:

```
14   (owner's closing value, one binary throughout their sitting)
14   after `claude-2.1.214 --version` and `--help`      <-- NOT flipped by version/help alone
13   after the eight 2.1.214 SESSIONS
14   after one 2.1.258 session                          <-- round trip closed
```

**Two things this pins down that the earlier note did not.** The flip is caused by **starting a session**,
not by merely invoking the older binary — `--version` and `--help` left it alone. And it is a **round
trip, not a ratchet**: the next session on the newer binary put it back. The owner's recorded value of
**14 is restored**, which is why the round trip was closed deliberately rather than left at 13.

**The operating rule stands unchanged**: one binary per sitting, because a value read mid-sitting after a
switch describes the switch and not the sitting.

## Observed

_One block per OS. Paste real output, redacted per the rules above._

### Pinning mechanism — established by ARC-00-S01 (not the floor verdict itself)

**Ubuntu (native installer).** The installer's own argument handling is documented in the script:

```
$ grep -n 'Usage' /tmp/install.sh
10:    echo "Usage: $0 [stable|latest|VERSION]" >&2
```

(line 6 of the same script: `TARGET="$1"  # Optional target parameter`; line 9 validates the target
against `^(stable|latest|[0-9]+\.[0-9]+\.[0-9]+(-[^[:space:]]+)?)$`.) So the floor is pinned with a
documented argument — no flag was invented:

```
$ bash /tmp/install.sh 2.1.214   &&  bash /tmp/install.sh latest
$ ls ~/.local/share/claude/versions/
2.1.214
2.1.263
$ claude-2.1.214 --version   # ~/.local/bin/claude-2.1.214 -> versions/2.1.214
2.1.214 (Claude Code)
$ claude --version           # ~/.local/bin/claude -> versions/2.1.263
2.1.263 (Claude Code)
```

Two versions live side by side under distinct paths; installing `latest` does not remove the pinned
version, it only repoints `~/.local/bin/claude`.

**macOS (npm, not native) — recorded gap.** The `claude` on the macOS machine is an **npm** install
(`~/.npm-global/lib/node_modules/@anthropic-ai/claude-code`, 2.1.258), and the floor there was pinned
with npm into a separate prefix
(`npm install -g --prefix ~/.local/claude-code-2.1.214 @anthropic-ai/claude-code@2.1.214`, linked as
`~/.local/bin/claude-2.1.214`). The **native installer was not run on macOS** and must not be, per the
architect's ruling of 2026-09-06. Consequence for this spike: any behaviour that differs between the
npm and native distributions — auto-update, Remote Control, the `claude --version` output format — is
**not proven on macOS** and has to be re-checked on the Ubuntu VM, where the native installer is in
use. Note also that the two channels were not at the same current version on the same day:
macOS/npm **2.1.258** vs Ubuntu/native **2.1.263** (2026-09-06).

## Verdict

`S-11: CONFIRMED **on the mechanisms measured** — floor 2.1.214 sufficient: eight rows (six mechanism rows, one of them covering two mechanisms, and two controls) measure seven of the story's eleven mechanisms identical on 2.1.214 and 2.1.258, including the `list_changed` resilience ARC-04's reload is built on; **four of the eleven are unmeasured: ${VAR:-default} expansion, enabled/disabledMcpjsonServers, exec-form hook + CLAUDE_PROJECT_DIR, skills/agents listing**`

## Evidence

- _`logs/<file>` — what it is_
