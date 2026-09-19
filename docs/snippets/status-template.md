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
Mode: live — pdi (pdi) · preset custom · WRITE=off CMDB_WRITE=off SCRIPTING=off ATF=off NOW_ASSIST=off FLUENT=off · 397 tools (contract) · +1 instance (uat)
Engine: snowarch 2.0.0-dev · contract a96863b1104b
Docs: vendor/ServiceNowDocs @ 11b39be17307 (australia) · sparse
Roster: 28 skills / 9 agents
Instances: pdi (pdi, custom) · uat (test, read-only)
Doctor: 28 ok, 0 warn, 0 fail — quick run 2026-09-10 19:48 UTC · full report: ./snowarch doctor
Capability packs and citation counts are not probed on a quick run — ./snowarch doctor reports them.
```

Rendered from the quick doctor's own report. Line 1 is `modeLineDetailed` **verbatim** —
`doctor/mode.mjs` has the only definition of that sentence, and the panel quotes it rather than
re-deriving it, so no two surfaces can disagree about whether the checkout is live.

Where each line comes from, all of it schema-v1 JSON (`./snowarch status --json` prints that report
unchanged — it is the same object `doctor --quick --json` prints, not a shape of its own):

| line | report key |
|---|---|
| `Mode:` | `modeLineDetailed` |
| `Engine:` | `engine.version`, `engine.tag`, `engine.contractSha` |
| `Docs:` | `engine.docs` |
| `Roster:` | `engine.roster` |
| `Capabilities:` | `engine.capabilities` |
| `Instances:` | `server.instances` |
| `Doctor:` | `summary`, `ranAt`, `options.quick` |

A line whose key is `null` is **omitted**, not guessed — which is why the block above has no
`Capabilities:` line. Two keys are routinely null on the quick run the panel makes, because the
checks that fill them spawn a process or walk the corpus and are therefore outside the quick subset:
`engine.capabilities` (E-04) and the citation half of `engine.docs` (E-16). The closing sentence
names whichever of the two is actually missing, rather than a remembered pair:

```
Capability packs and citation counts are not probed on a quick run — ./snowarch doctor reports them.
```

Both shas are shortened to twelve characters — the prefix `./snowarch version`, the install summary
and the doctor cache all print, so a reader comparing two of them never has to notice that one is
shorter. Times are the report's own `ranAt`, in **UTC**: two people comparing pasted panels in two
timezones is the only reason "verbatim" is worth anything.

`Instances:` is omitted when the report carries none — in design-only there are none, and on a
`--quick` run the server section does not run at all (ARC-09-C8), so the Mode line's own
`+1 instance (uat)` is what names the rest. `./snowarch instance list` is the full list.

When `summary.fail > 0`, one line per failing check follows the seven, and then the fix sentence
when there is anything to fix:

```
E-16 FAIL citations: 2 dead — maintainer: fix the citation; users: ./snowarch docs sync
Run ./snowarch doctor --fix for the fixable ones (2).
```

WARNs are never listed one by one — that is `./snowarch doctor`. On a quick run 25 of 39 checks are
`skip`, so a panel that listed every non-ok check would print 27 lines instead of one.

**Exit code.** `0` when no check failed, `1` when one did. A `1` is a finding about the checkout,
not a failure to render: the panel is printed either way.
