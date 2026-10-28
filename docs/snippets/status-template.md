<!-- ONE SOURCE. This fragment is the `./snowarch status` panel: the skill quotes the fenced block
     below byte-for-byte (`tests/snowarch-skill.test.mjs` fails if the two drift), ARC-08-S10's T-07
     record quotes the same file rather than a copy of it, and since ARC-08-C18 the block itself is
     `renderPanel()`'s output for `tests/fixtures/doctor/status-live.json` — asserted, not
     transcribed, by `tests/doctor/status-template.test.mjs`. Four copies, one definition, and the
     product is the definition.

     It used to be a RENDERER WRITTEN IN PROSE: seven lines with a JSON key in brackets after each,
     a null rule, a failure branch and three fallback causes, executed by a language model once per
     session. `./snowarch status` renders it now, so a terminal user and a session read the same
     bytes and the rules below are statements about a program rather than instructions to one. -->

# The `./snowarch status` panel

```
Mode: live — pdi (pdi) · preset custom · WRITE=on CMDB_WRITE=on SCRIPTING=on ATF=on NOW_ASSIST=on FLUENT=off · 399 tools (contract)
Licence: missing
Engine: snowarch 9.9.9 · contract deadbeefdead
Docs: vendor/ServiceNowDocs @ aa447ce4ea80 (australia) · full
Roster: 29 skills / 9 agents
Instances: pdi (pdi, custom)
Doctor: 15 ok, 0 warn, 1 fail (E-31) — quick run 2026-09-20 09:00 UTC · full report: ./snowarch doctor
E-31 FAIL the licence for this checkout: Licence: missing — Run ./snowarch licence check to see why, then install a valid licence as .local/licence.json. A running Claude Code session keeps what it read at start, so restart it afterwards
Capability packs, citation counts and the corpus branch are not probed on a quick run — ./snowarch doctor reports them.
Instances are the store's own records; nothing was probed.
```

Rendered from the quick doctor's own report. Line 1 is `modeLineDetailed` **verbatim** —
`doctor/mode.mjs` has the only definition of that sentence, and the panel quotes it rather than
re-deriving it, so no two surfaces can disagree about whether the checkout is live.

Line 2 is the session-start banner's `Licence:` line, in every state, `ok` included (ARC-11-C1). It is
rendered from E-31's data by the banner's own `bannerLine` (`tools/snowarch/lib/licence/line.mjs`),
so the banner and the panel cannot word it differently. From 2.0.13 the line names the state alone:
enforcement has no switch, so it has no word.

Line 3 is E-32's `Integrity:` line (ARC-11-C7): this release's files against the manifest its owner signed,
in every state E-32 reports — verified, modified, no signed manifest, or not checked on a development tree.
The block above has none, because the fixtures it is rendered from leave E-32 out: what E-32 says depends on
the commit's version and on that release's signed manifest, and a committed fixture carries no fact that differs
between two correct commits (ARC-08-C27). The session-start banner prints the same line, from the verdict the
last `status` or `doctor` cached, and only when E-32 failed.

Where each line comes from, all of it schema-v1 JSON (`./snowarch status --json` prints that report
unchanged — it is the same object `doctor --quick --json` prints, not a shape of its own):

| line | report key |
|---|---|
| `Mode:` | `modeLineDetailed` |
| `Licence:` | `checks` — E-31's data, worded by the session-start banner's own function |
| `Integrity:` | `checks` — E-32's detail, when E-32 ran |
| `Engine:` | `engine.version`, `engine.tag`, `engine.contractSha` |
| `Docs:` | `engine.docs` |
| `Roster:` | `engine.roster` |
| `Capabilities:` | `engine.capabilities` |
| `Instances:` | `instances` |
| `Doctor:` | `summary`, `ranAt`, `options.quick` |

A line whose key is `null` is **omitted**, not guessed — which is why the block above has no
`Capabilities:` line. Three things are routinely null on the quick run the panel makes, because the
checks that fill them spawn a process or walk the corpus and are therefore outside the quick subset:
`engine.capabilities` (E-04), the citation half of `engine.docs` (E-16), and the corpus branch
(E-14). The closing sentence names whichever of them is actually missing, rather than a remembered
list:

```
Capability packs, citation counts and the corpus branch are not probed on a quick run — ./snowarch doctor reports them.
```

Both shas are shortened to twelve characters — the prefix `./snowarch version`, the install summary
and the doctor cache all print, so a reader comparing two of them never has to notice that one is
shorter. Times are the report's own `ranAt`, in **UTC**: two people comparing pasted panels in two
timezones is the only reason "verbatim" is worth anything.

`Instances:` comes from `instances`, which carries its own `source`. On a quick run the server
section does not run at all (ARC-09-C8), so the entries are the STORE's — label, environment and
preset, read without probing anything — and the panel says so in a line of its own rather than
printing a list that looks identical to one a handshake produced. `server.instances` still means
"the server answered". In design-only there are none and the line is omitted.
`./snowarch instance list` is the full list.

`Docs:` survives a quick run for the same reason: the pin and the family are two reads of
`engine.config.json`, and one bounded `git rev-parse` in the submodule compares the corpus HEAD
against the pin. When they disagree the line says so — `corpus is on <sha>, NOT the pin
— ./snowarch docs sync` — because a line naming a pin the corpus has drifted off would be asserting
what it did not measure. Agreement is silent: a line that announces it on every healthy run is a
line readers learn to skip.

When `summary.fail > 0`, one line per failing check follows the seven, and then the fix sentence
when there is anything to fix:

```
E-16 FAIL citations: 2 dead — maintainer: fix the citation; users: ./snowarch docs sync
Run ./snowarch doctor --fix for the fixable ones (2).
```

WARNs are never listed one by one — that is `./snowarch doctor`. On a quick run 25 of 39 checks are
`skip`, so a panel that listed every non-ok check would print 27 lines instead of one.

**Exit code.** `0` when no check failed, `1` when one did: the panel is printed either way, so a `1` is not a failure
to render. It is also `1` when the doctor itself failed; then the one line printed is a Mode line that says
`doctor unavailable`.
