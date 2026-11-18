# ARC-09-C291 — a cited page must print the name it is cited for

**Status:** shipped in #606, after the architect's replay of the hook over real pages (the C287 and C267 sessions: 76 names asked about, all ELSEWHERE, none false) and his sitting. The sitting (150 sessions, all successful, none cut off; the arm without the class on develop `5f5cebe4`, the arm with it on `665dc1df`): the unsupported citation lines left uncorrected fell from 44 to 3 (N minus O is −41, against a gain line of −12; the chance of a gain of 12 or more if the arms were equal is 0.040). Before the corrections the arms were alike (44 against 39), and the ask drove 36 corrections in N against none in O. Every guard held: no cut-off, at most one ask a turn, no false mechanical ask over 46 ELSEWHERE names and 1 ABSENT, no right answer made wrong over 60 Correction lines (57 cite a page that prints the name, the other 3 are hedged or honest), never-opened citations +12 against a line of +16, uncorrected dead paths 0 against 1, and no verdict changed by the ask. Watched: time 79.8 s against 75.8 s, answer length +2 %, refused Bash calls +15 (13 of them `mkdir`). The one switch is `blocking` in `tools/snowarch/lib/docs/grounding-classes.json`, which names `unsupportedName` beside `citedUnread`, and the arm without the class is that file without it. No change to `CLAUDE.md`, a skill, an agent, an allow entry or the corpus.

## Why

The architect measured on the C267 and C287 sittings (150 answers each) that in 27 to 36 % of the answers a reply line cites a corpus page for a snake_case name that the page does not print: 0.35 to 0.63 such lines an answer. Most of the names are printed on another page (`sysrule_assignment`, cited to the Financial Services Operations assignment-rules page). Some are printed nowhere in the corpus, which is R6's fabricated-presence class: 7 an arm, against a bar of 0. [C267](C267-stop-hook-unread-citations.md) does not catch it, because it asks only about pages that were never opened.

## What the check does

A class of the grounding check, `unsupportedName`, the eighth. The Stop hook runs it inside the same 3 s deadline and the same single ask of the turn. Its text rules are in `lib/docs/name-support.mjs`, the check in `lib/docs/grounding-check.mjs`.

**Which lines.** The lines of the final reply (the text after the turn's last tool result), outside code fences and finding copies. A line is checked when it cites at least one corpus page, by a path (`markdown/…`, written with slashes or with back-slashes) or by a bare file name that names exactly one page, and names at least one construct. It is not checked when it is hedged, or when it is an anti-pattern line.

**A construct** is a lower-case snake_case token with at least one underscore, outside the cited paths and the file names. It holds no `<`, `>`, `{` or `}` (a placeholder), and it does not start with `snow_`, `x_` or `u_`. A markdown escape (`sn\_x`) is dropped first. A token directly followed by a known file extension (`my_script.js`, a host name) is a file and not a construct.

**Hedged:** the line says "not documented", "undocumented", "does not", "doesn't", "do not" or "don't" before include, contain, say, print, define, name, mention, list, show, cover or document (up to two words between them), "not on / in the / this / that page", "is not / isn't listed", "no such", "unconfirmed", "unverified", "not opened", "haven't / have not / did not / didn't open" or "open question", in any case. **An anti-pattern line** starts, after bullets, numbers and bold markers, with Don't, Do not, Never or Avoid.

**Supported.** A construct is supported when any page the line cites prints it, compared with the markdown escapes dropped, case ignored and whitespace normalised, as a substring (a page that prints `sys_user_group` prints `sys_user`). It is also supported when the page prints its label, the underscores read as spaces (`assignment group`), or when the names index puts it on one of the cited pages.

**Two kinds.** An unsupported construct is ELSEWHERE when the names index has it on another page, and ABSENT when it has it on none. A sparse index (coverage "disk") cannot say that no page prints a name, so it never makes an ABSENT. Each name is listed once, with the first three pages of the first line that names it.

## The ask

There is still one ask a turn. The new clauses come after the others, before the registered tail. At most six names are listed in all, filled with ABSENT first and then ELSEWHERE, each in the order it appears; the rest are counted by the existing sentence "And N more of these". The ELSEWHERE clause is printed first, then the ABSENT clause, then "Do not repeat the answer." once. The words are the architect's of 2026-11-18:

> These names are not printed on the page you cite for them: `X` (P). For each platform name, add one line that starts "Correction:" and cites a page that prints it (docs lookup finds one). For a name of your own design, leave it and add no line for it.

> No corpus page prints `Y`, `Z`. For each platform name, say in a line that starts "Correction:" that the corpus does not document it. For a name of your own design, leave it and add no line for it.

(P) is every page that line cites, up to three, comma-separated; a bare file name is printed as the page's own path.

## What stays open after the ask

Nothing is checked or said afterwards. The continuation never asks again, and the notice to the user names no name: a name of the model's own design stays unsupported by definition, so a notice would name it every turn. A name first written in the continuation is not listed either.

## The data

`grounding-classes.json` names `unsupportedName` beside `citedUnread`. A reply that has a bare `.md` name and no backtick still reaches the check when the class is listed, since a bare file name is a citation.

## Where it is

`tools/snowarch/lib/docs/name-support.mjs` holds the text rules, pure. `lib/docs/grounding-check.mjs` has `supportFindings` and the clauses in `reasonOf`. `hooks/stop-citations.mjs` reads a page: the whole page, once for a Stop, up to 8 MB, normalised. The tests are `tests/name-support.test.mjs` (the text rules), `tests/citation-support.test.mjs` (the pure check, and the asks word for word) and `tests/hook/stop-citation-support.test.mjs` (through the hook, with the deadline, a Windows path and the shipped data).

## Cost

Measured on the author's Mac, the median of seven runs: normalising a page takes 1.5 ms at 200 KB, 5.6 ms at 1 MB and 117 ms at 8 MB (the cap), and looking a name up in it takes under 1 ms to 5 ms. The rules over 300 lines take 1 ms. A page is read only for a line that names a construct, once for a Stop, and the names index is read as before. A line of 100,000 characters is read in linear time by every rule: a pattern that was scanned from every position of a run cost 2.6 s on one word of 60,000 characters, which is fixed and has a case. The cost of a whole turn on a real session was not timed.

## Limits

- A line is judged by the constructs and the pages it cites, and not by what it claims: a name that a page cited for something else on the same line prints is supported.
- A substring is enough, and a label read as words can be a common phrase ("to do"). Both make the check ask less.
- Only lower-case snake_case is read. A camelCase name, a name with a digit first and a dotted name as a whole are not; a dotted name is read as its snake parts.
- Only the final reply is read: not an earlier block of the turn, and not a file the turn wrote.
- A partial path (`…/x.md`, `folder/x.md`) is not a citation for this class. C267 reads it as a bare name.
- A page that cannot be read (a dead path, or a page over 8 MB) leaves its line unjudged. With no names index, nothing is asked; with a sparse one, only ELSEWHERE is.
- A name of the model's own design that its line cites a page for is asked about, and the ask says to leave it. Nothing checks afterwards.
- Found beside it and not changed here: the early gate of C267 looks for `markdown/` with forward slashes, so a reply that cites a page only with back-slashes never reaches `citedUnread` (this class has its own trigger). That is the row ARC-09-C292. The loop of C267 that reads citations also rescans a line from each `markdown/` in it: one line of 40,000 of them takes 8 s, on develop too, which no reply is.
