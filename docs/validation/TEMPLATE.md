<!-- ARC-10-S07. Copy to `docs/validation/<date>-<os>.md` and fill it in after a run.

     NOTHING FROM AN INSTANCE, AND NOTHING FROM A MACHINE. No URL, account name, sys_id, e-mail or
     home path — `tests/validation-records.test.mjs` refuses this directory on all of those, and the
     refusal names the pattern and the line. The redaction is the point of the format: a record
     nobody can publish is a record nobody writes. -->

# Validation run — <date> — <macos | ubuntu | windows>

| Field | Value |
|---|---|
| **Date** | `<YYYY-MM-DD>` |
| **Observer** | `<role, never a name — "the owner", "a second reader">` |
| **Machine** | `<macos 15 · arm64 | ubuntu 24.04 · x64 | windows 11 · x64>` |
| **Clean?** | `<yes — never had this product | no — what was left from before>` |
| **Product version** | `<v2.0.0>` at `<sha>` |
| **Claude Code** | `<claude --version>` |
| **Node** | `<node -v, or "absent — design-only">` |
| **Mode** | `<design-only | live>` |
| **Preset** | `<read-only | pdi-developer | full | custom | n/a in design-only>` |
| **Gate** | `<n/a | RUN_LIVE_E2E=1>` |
| **Writes allowed** | `<n/a | SNOW_E2E_ALLOW_WRITES set | unset>` |

## Install timeline

| Step | Started | Finished | Notes |
|---|---|---|---|
| `git clone` | | | |
| `./bootstrap.sh` (or `bootstrap.cmd`) | | | |
| first `claude` start | | | dialogs seen: `<n>` |
| `./snowarch doctor` | | | |

## Doctor summary

```
<paste the last line: "N ok, N warn, N fail" — and every FAIL line in full>
```

## Tests

One row per cutover-list id (`tests/VALIDATION-TESTS.md` § *Cutover test list*). `n/a` needs a
reason; a bare `n/a` is not a result.

| Id | Result | Evidence or why not run |
|---|---|---|
| `T-01` | `<pass | fail | n/a>` | |

**Probes** (live runs only): `<what the connectivity probe returned>` ·
`<what the permission probe returned>`.

**Transcript.** `script(1)` (or `Start-Transcript`) for the whole sitting, kept locally and NOT
committed — it contains the instance URL and the account name. Quote from it here only after
redacting both.

## Observer notes

Everything you had to guess, look up elsewhere, or scroll back for. A run where that list is empty
is the result the sittings exist to produce; a run where it is long is the more useful record.

## Defects raised

| What | Where it went | Id |
|---|---|---|
