<!-- ARC-10-S10. Copy to `docs/validation/<date>-post-release-review.md` and fill it in at tag + 14
     days. The procedure is `docs/CONTRIBUTING.md` § *Post-release review*; this is where its answer
     is written down.

     THE SAME REDACTION RULES AS A VALIDATION RECORD. No URL, account name, sys_id, e-mail or home
     path — `tests/validation-records.test.mjs` refuses this directory on all of those, and it
     refuses this file's shape too if a section below is missing. Quoting an issue is quoting
     somebody else's paste: read it before you copy it in. -->

# Post-release review — <date>

| Field | Value |
|---|---|
| **Date** | `<YYYY-MM-DD>` |
| **Tag** | `<v2.0.0>` at `<sha>` |
| **Tag date** | `<YYYY-MM-DD>` — this review is that date + 14 days or later |
| **Reviewer** | `<role, never a name>` |
| **Known installs** | `<n>` — see *Denominator* below |

## Denominator

How many installs are known to have happened: the S08 executors, the author, anyone who announced
one. **Zero reports is not evidence of zero problems**, and this number is what tells the two apart
— a clean fortnight across one install says almost nothing; across a dozen it is a result.

| Source | Installs | Mode |
|---|---|---|
| ARC-10-S08 validation runs | | |
| The author's own machines | | |
| Announced / observed elsewhere | | |

## Issues

One row per issue opened on the `install` or `migration` labels since the tag. **Class** is one of
*page defect* (a document said the wrong thing — ARC-10 follow-up), *product defect* (the code did —
owning ARC or the 2.0.x stream), or *not a defect*.

| # | Label | Class | Owner | State | One line |
|---|---|---|---|---|---|
| | | | | | |

**Every *page defect* row needs a merged fix or an open pull request, linked here.** That is
acceptance criterion 5, and a row without one is the review's own open action.

## Was the doctor JSON enough?

For each report: could it be diagnosed from what the form asked for, or did it take another
exchange? A missing field is a schema request to ARC-08, not a note.

| # | Diagnosed from the paste alone? | What was missing |
|---|---|---|
| | | |

## Did any report carry a secret?

The redaction is a promise the form makes to the person pasting. If a report carried a password, a
token, an account name or an instance address, that is **a redaction defect in ARC-08 and the
highest-priority item in this review** — record it here with the field it came through, and open it
before anything else in this document is acted on.

- **Answer:** `<no — checked all N reports | yes — see below>`

## Archive decision

The condition is a **migration blocker**, defined in `docs/CONTRIBUTING.md` § *Post-release review*.
State the decision and the reason, not just the decision.

- **Decision:** `<archive | defer>`
- **Reason:** `<no open migration blocker | the blocker, and what it blocks>`
- **If archive:** S09 checklist item 4 executed on `<date>`, both repositories — `docs/ARCHITECTURE.md`
  History *archived* cells filled, changelog noted.
- **If defer:** new date `<YYYY-MM-DD>`, and the *will be archived on* line updated in the notice on
  both old repositories.

## Next actions

| What | Where it goes | Owner |
|---|---|---|
| | | |
