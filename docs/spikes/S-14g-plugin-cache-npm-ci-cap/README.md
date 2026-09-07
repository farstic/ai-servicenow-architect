> **Redaction rules (ARC-00 STORIES.md conventions).** No instance URLs, usernames, passwords, tokens or
> `~/.claude.json` contents appear in a spike record — **key names only, values as `set (len n)`**.
> Paths are `~`-relative. Screenshots are cropped to the dialog.
> A spike that runs on several operating systems carries **one *Observed* block per OS and one verdict line**.

# S-14g — Plugin cache install cap on a 72 MB tree over a throttled network

**Run by:** ARC-00-S12 · **Verdict consumed by:** ADR-0006/0008 → entry gate of ARC-06-S01

**Status: REFUTED on both halves (2026-09-07, Ubuntu VM, ingress-shaped with a throughput control).** The
60-second cap is **close, not comfortable** — 36.5 s on a 4 Mbit link — and crossing it **fails silently**:
`npm ci` is SIGTERM'd and exits 1 while `claude plugin install` prints success and exits 0.

## Assumption

> The plugin cache's 60-second `npm ci` cap is met for the 72 MB tree on a slow network; behaviour on failure

**Impact if false:** §B (roadmap channel) · **Evidence so far (from `03`):** (none recorded in `03` §B)

## Environment

| Field | Value |
|---|---|
| macOS | **26.5.2** build **25F84**, arm64 · Node v24.16.0 · git 2.39.5 |
| Claude Code | **2.1.258** only. One binary for the whole sitting, deliberately: `03` §F **S-21** records that alternating 2.1.214 and 2.1.258 flips `migrationVersion` in `~/.claude.json` on every switch. Verified unchanged at **14** before and after every step here. |
| Fixture | `farstic/snowarch-spikes-marketplace` (private, throwaway). **The measurements below are from `a5924e5`**, the commit that bundles the nine runtime dependencies; the one-dependency probe is `18d5834`. Commit `fdfb49f` — cited by the other S-14 records — carries **no** `package.json` at all, so it cannot reproduce these numbers. |
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

**Check that retires it (from `03`):** Throttled network test.

## Observed

### The prior question first: does the plugin cache run an install at all?

`03` §B assumes a 60-second `npm ci` cap. Before timing anything against that cap it is worth knowing
whether a bundled plugin's dependencies are installed at all. They are. Giving the server plugin a
`package.json` with a single dependency and installing it:

```
$ claude plugin install servicenow-server@snowarch-spikes --scope project -y --config …
✔ Successfully installed plugin: servicenow-server@snowarch-spikes (scope: project)
$ ls ~/.claude/plugins/cache/snowarch-spikes/servicenow-server/0.0.1
node_modules  package-lock.json  package.json  server
```

`node_modules` is created **inside the plugin cache entry**, so the cap is a real constraint and not a
hypothetical.

### The unthrottled number, with the real dependency set

The plugin then bundled the ARC-00-S08 fixture's actual nine runtime dependencies
(`@inquirer/prompts`, `@modelcontextprotocol/sdk`, `chalk`, `commander`, `dotenv`, `ora`, `pdfmake`,
`pptxgenjs`, `zod` — a 178-entry lockfile), with the cache cleared first:

```
install exit 0, wall 1914 ms
node_modules: 155 top-level entries, 70M
```

> ⚠ **Superseded by the throttled measurements below. Do not quote the "31× headroom" figure.** It was
> taken with a **warm npm cache on an unthrottled link**, and the paragraph that followed it projected
> from that baseline. Both are wrong. Kept here, struck through, because the *reasoning error* is the
> instructive part: a warm-cache timing measures unpacking, not downloading, and the cap constrains
> downloading.

~~**1.9 seconds against a 60-second cap — about 31× headroom** on an unthrottled home connection with a
warm npm cache.~~ The 155 entries and 70 MB differ slightly from ARC-00-S08's 156 / 72 MB because this is
a standalone package rather than a workspace root, so there are no workspace symlinks.

~~For scale: the cap would only bite if the link were roughly **thirty times slower** than this one — and
after the D-03 cut ARC-00-S08 measures the tree at ~17 MB of content rather than 57 MB, which widens the
margin again.~~ **Measured instead:** a cold-cache install is **5.2 s** unthrottled, **36.5 s** at 4 Mbit
(≈16× slower link, 7× longer install — the relationship is not linear), and **crosses the cap** at 1 Mbit.
The D-03 tree-size argument still applies and is the one part of this paragraph that survives.

### The throttled case, Ubuntu VM, 2026-09-07 — and the cap does not fail loudly

**Method, including the attempt that measured nothing.** The first run put `netem` on a `prio` band that
unmatched traffic never enters, and shaped **egress** when an `npm ci` download is **ingress**. Four rates
from unthrottled to 800 kbit produced 5.9 s – 5.4 s — near-identical, which is the tell. Those four rows
are discarded. The second run redirects ingress to an **IFB** device (`tc qdisc … ingress` +
`mirred egress redirect dev ifb0`, with the Multipass host subnet exempted so the control channel stays
usable) and **carries a throughput probe as its control**, so no install time is trusted before the
shaping is shown to bite. The npm cache is deleted before every case, so each install is a real download.

| Rate | probe measured | install wall | exit | message | `node_modules` |
|---|---|---|---|---|---|
| unthrottled | 51 609 kbit/s | 5 188 ms | 0 | ✔ Successfully installed | 155 entries, **74 M** |
| 4 mbit | 3 283 kbit/s | 36 487 ms | 0 | ✔ Successfully installed | 155 entries, **74 M** |
| **1 mbit** | 899 kbit/s | **61 426 ms** | **0** | **✔ Successfully installed** | 155 entries, **37 M** |
| 400 kbit | 353 kbit/s | *(recorded below)* | | | |

**The headroom claim in the section above is wrong and is corrected here.** "1.9 s against a 60-second cap
— about 31× headroom" was measured with a **warm npm cache on an unthrottled link**. With the cache
cleared, the same install is **5.2 s** unthrottled and **36.5 s on a 4 Mbit link** — an ordinary hotel or
mobile connection, not an extreme. That is **1.6× headroom, not 31×**, and 1 Mbit crosses the cap
outright. The cap is close, not comfortable.

**What happens past the cap: nothing visible.** At 1 Mbit the install ran **61.4 s**, past the 60-second
cap, and still printed `✔ Successfully installed plugin` and exited **0** — with a `node_modules` half
the size of the healthy runs. **The failure is silent**, which makes it the third instance in this spike
set of the same class: `claude -p` exits 0 on a dead MCP server (S-06), a `SessionStart` hook that cannot
spawn says nothing at all (S-05), and now the plugin cache reports a successful install of a
dependency tree that is not all there.

### Settled, from npm's own debug log: **npm is SIGTERM'd and exits 1, and Claude Code reports success**

The `du` figures alone could not distinguish a truncated tree from one still being written, so the
question was taken to `~/.npm/_logs`, which npm writes for every run. The throttled run at 1 Mbit ends:

```
557 error process terminated
558 error signal SIGTERM
565 verbose code 1
566 error A complete log of this run can be found in: …-debug-0.log
```

against a healthy run in the same series, which ends `736 verbose exit 0` / `737 info ok`.

**So the underlying `npm ci` genuinely fails — SIGTERM, exit code 1 — and `claude plugin install` prints
`✔ Successfully installed plugin` and exits 0.** This is not a smaller tree or a slower install; it is a
**failed dependency installation reported as a success**, and the exit code that would have caught it is
discarded one layer down.

**The timing is worth stating precisely, because it is not the obvious one.** The `install` command
returns at **~61 s** — but npm is not killed then. That run started at `19:55:44Z` and its log was still
being written at `19:57:34Z`: **npm kept downloading for about 110 seconds**, roughly 50 s after the user
got their prompt back. That is what produced the confusing intermediate reading recorded earlier in this
session — a tree observed at 17 M, then 73 M minutes later, then briefly **absent altogether** (npm rolls
back on failure). The end state in the controlled re-run is a **stable 17 M** tree, npm gone, and **0 of
8 direct dependencies importable** (`ERR_MODULE_NOT_FOUND` for all of `zod`, `chalk`, `commander`,
`dotenv`, `ora`, `pdfmake`, `pptxgenjs`, `@modelcontextprotocol/sdk`).

**Two measurement caveats, recorded rather than hidden.** The timeline's `npm_procs` column reads `0`
throughout and is **not trustworthy** — the `pgrep` pattern does not match npm, which runs as
`node …/npm-cli.js`. And the `importable` column in that same timeline failed to capture its value
(`?/8`); the 0-of-8 figure above comes from a separate clean measurement. **The npm debug log, not either
column, is the authoritative evidence here**, and it is unambiguous.

**What ARC-06/ARC-08 must therefore do.** Assert **completeness of the tree itself** — every non-dev
package directory in the lockfile present — because no signal from the install can be trusted: not the
exit code, not the message, and not a size check taken at the wrong moment. And the assertion needs a
*when*: on the monorepo path `npm ci` is synchronous and the check runs after it exits; on the plugin
path the check must not run while npm is still in flight, which the ~50-second overhang makes a real
possibility.

### What is still not run, and why

The throttled case, which is the half `03` §B actually asks about ("on a slow network; behaviour on
failure"). It needs a deliberately degraded link — macOS *Network Link Conditioner* (an Additional Tools
for Xcode install) or Linux `tc qdisc … rate 2mbit` — and neither is something to install or configure
on the owner's laptop for a spike. Scheduled for day 4 on the Ubuntu VM, where `tc` is safe. If the VM
login has not arrived by then, the architect's ruling of 2026-09-06 applies: run it on macOS with a
throttling equivalent and record that explicitly as a substitute.

## Verdict

`S-14g: REFUTED on both halves. The cap is close, not comfortable — a cold-cache install is 5.2 s unthrottled but 36.5 s on a 4 Mbit link (1.6x headroom, not the 31x claimed from a warm cache) and crosses 60 s at 1 Mbit. And it does not fail loudly: past the cap the underlying npm ci is SIGTERM'd and exits 1 (npm's own debug log: "error process terminated / error signal SIGTERM / verbose code 1") while claude plugin install prints "Successfully installed plugin" and exits 0, leaving a stable 17 MB tree with 0 of 8 direct dependencies importable. The command returns at ~61 s but npm keeps running ~50 s longer, so any completeness check must not run while npm is in flight.`

## Evidence

- `farstic/snowarch-spikes-marketplace` @ `a5924e5` — the fixture **with** the nine bundled dependencies (`18d5834` for the one-dependency probe). Note for the owner sitting: `origin/main` is now `a5924e5`, so `claude plugin marketplace add` installs the nine-dependency plugin, not the dependency-free `fdfb49f` the other S-14 records were taken against — the install will take ~2 s rather than ~0.5 s and will create a `node_modules` in the cache entry.
- Command transcripts are quoted inline above; every exit code was measured **without a pipe**
  (a piped `$?` reports the last command in the pipeline, not `claude` — that mistake was made twice
  during this sitting and corrected both times).
