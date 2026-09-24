# `nonOkLines` and the JSON boundary's mask — measurement and options

Raised in ARC-09-C53 while fixing U7's Mode line, and deliberately not fixed there. This is the
measurement the architect asked for, with one recommendation. **No product change is proposed by
this note**; it exists to carry the numbers.

## The defect, restated from evidence

`maskForJson` masks **by value**, not by field — that is its own ruling (ARC-08-C1 / ARC-10-S10):
*"the eighth field arrives without anyone remembering the ruling that created this file."* So every
string in the report carrying the instance label is masked, including check `detail` **and check
`remedy`**.

U7 prints non-ok checks through `doctorLines` → `nonOkLines`, reading the report it parsed from the
doctor's **`--json` stdout** — the masked copy. On a live instance that produces:

| | line |
|---|---|
| **today** | `SV-03 WARN store entries: instances: <label>: flags explicit, preset custom — ./snowarch instance test <label>` |
| **the truth for this terminal** | `SV-03 WARN store entries: instances: pdi: flags explicit, preset custom — ./snowarch instance test pdi` |

**The remedy is the sharper half, and I under-reported it in C53.** I raised this as a masked
*detail*; the measurement shows the **remedy** is masked too, and a remedy is text the reader is
meant to *type*. `./snowarch instance test <label>` is not a command — it is a command-shaped string
that fails when pasted, in the one place the product is telling somebody what to do next.

**Sizing.** The exposure needs a report with `server.instances[].label` populated, because that is
the only thing `labelsIn()` collects from. On this design-only tree the mask changes **0** checks;
the owner's 2026-09-23 sitting is the evidence that it bites on a live one.

## Why the title is involved at all

The unmasked copy is already on disk — `doctor/index.mjs` caches the report **before** masking, and
U7 already reads it for the Mode line under C53's four-condition binding. But `writeReportCache`
stores `{id, status, detail, remedy?}` and **drops `title`**, which `nonOkLines` prints. So reading
non-ok lines from the cache costs the title unless something supplies it.

## The three options, measured

| | line produced | cost |
|---|---|---|
| **(a)** store `title` in the cache | `SV-03 WARN store entries: instances: pdi: … — ./snowarch instance test pdi` ✅ | a cache-shape change, and the title duplicated where the registry owns it |
| **(a) as the cache is today** | `SV-03 WARN undefined: instances: pdi: …` ❌ | — |
| **(b)** resolve title by id from the registry | `SV-03 WARN instances: instances: pdi: … — ./snowarch instance test pdi` ✅ | a lookup, and an unknown id has no title |
| **(c)** keep the mask, say so on the line | `… instances: <label>: … (labels masked)` | honest, but leaves an unrunnable remedy on screen |

### What the numbers say about (b)'s risk

My C53 caveat was that an old cache might carry an id today's registry cannot resolve. Measured:

- registry size today: **40** checks.
- Real report vs registry, by id: **0** titles differ, **0** ids absent.
- `v2.0.0` → `HEAD` (one release apart): **0** ids retired, **0** added.
- `registry.mjs` refuses reuse — *"duplicate check id — ids are never reused"* — so an unresolvable
  id can only ever mean a **retired** check. It can never mean the *wrong* title.

So the risk is real but bounded and currently zero, and the mitigation is one line: fall back to the
id alone when the registry has no title.

### The argument that decides it

**(a) needs the same fallback (b) does.** A cache written before (a) shipped still has no `title`, so
(a) must handle a missing title anyway — and then additionally changes a cache shape that
`assertCacheStorable` and `COMPATIBILITY_KEYS` pin. (a) therefore buys nothing over (b) and costs a
schema change.

## Recommendation — (b), with three conditions

1. Read the non-ok lines from the cache **under C53's existing four-condition binding** (doctor
   exited 0, report parsed, no `cacheError`, cache stamped at or after `startedAt`). Same read, same
   guard, one definition — not a second freshness rule.
2. Title by id from the registry, **falling back to the id alone** when unknown. A retired check
   should read `SV-99 WARN: <detail>`, never `undefined`.
3. Keep `--json` masked exactly as it is. The boundary is right; only the local consumer was wrong.

This is the same split B09 already gets right and U7 got wrong twice: **the tally and the words come
from different places, and the copy meant to travel is not the copy meant for this terminal.**

## What I have not done

No product change, no test, no row id claimed — the architect asked for the measurement first. If
(b) is approved the row should also state the remedy finding above, because that is the part a user
actually loses, and it is not what C53 recorded.
