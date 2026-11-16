# ARC-09-C268 — a lookup before an absence claim (phases A and B)

**Status:** phase A built and merged (#582: the lookup and its offline check). Phase B reworked on 2026-11-16 (#585): one sentence in `CLAUDE.md:12` makes the Architect call it before any absence claim, the generated permission entries let it run without a prompt, and the B01 fix that the entries made necessary is in. The six gateway clauses of the first build and validation case T-48 are dropped. The architect measured phase B in a sitting read on 2026-11-16 and ruled it ship: it ships in 2.2.7, and the numbers are in "What phase B measured" below.

## Why

The Architect searches the corpus with the words of the request, and the corpus uses other words. A table's label is not its name (`Requested Item` is `sc_req_item`); the corpus escapes every underscore (33,575 of its 51,657 pages hold a `\_`), so a search for `sc_req_item` that does not know the escape misses a page that prints it; a synonym is not the term it stands for. A search that finds nothing is then written as "not documented in the bundled corpus — verify on the instance", about a construct the corpus documents. The lookup answers, before such a claim, which pages print the name, or which name the corpus prints for the same words.

## The contract

`./snowarch docs lookup <name or phrase>… [--limit <pages per name>] [--names <names per term>] [--json]` (`.\snowarch.cmd` on Windows). Local, no network, stdlib only, a read: it never writes and never builds the index (E-33 and `doctor --fix` do).

- **Input:** one or more terms. A term is a name (`sc_req_item`, `sc\_req\_item`), a dotted name (`glide.ui.escape_text`, `incident.assigned_to`), one plain word (`incident`) or a phrase (`requested item`, `data policy`): a table, field, role, property, plugin or page title.
- **Resolution,** in this order, stopping at the first that has pages: the name in the names index; the words as a label the corpus prints beside a name (`Label \[name\]`, 13,930 pairs under 10,997 label keys at the pin); a synonym from the corpus's own synonym page; every content word among the words of a page title. A typed name that no page prints is also tried as the label its words make, and against the names that carry its segments (`req` starts `request`).
- **Output,** plain text, one line per term and per name and per page: `<term>: PRINTED`, `NOT PRINTED as typed; the corpus prints: <names>`, `ABSENT: …`, `UNKNOWN: …` or `NO MATCH: …`; then `  <name>: <n> pages (<how it was reached>)`; then `  <path>:<line>: <the line>`, grep's own shape, the corpus's escapes taken off the line. A name printed on very few pages while its words label a far better documented name says `PRINTED; see also <name>`. `--json` is the whole result.
- **`ABSENT` is the one state that grounds an absence claim:** no page of the corpus prints the name, and the index covers the whole corpus (`coverage: full`). On a sparse checkout the same finding is `UNKNOWN`. `NO MATCH` for a phrase never shows the corpus lacks the construct. A custom name (`u_`, `x_`) printed on a page is an example.
- **Exit codes:** 0 every term is printed; 1 some term is not (near, absent, unknown or no match); 2 usage; 3 no corpus, or no names index for the docs pin (the remedy is printed).

## Cost

The index loads in about 15 ms; titles and labels are read when asked for (about 10 ms); a page is read only to show its line, at most `--limit` pages for each name and 300 to rank one. Measured on this Mac, whole processes: one term 0.10 to 0.14 s, five names 0.19 to 0.47 s (cold). The index grows from 8.6 to 11.5 MB and its build from 14 to 15 s, 330 MB resident, in the child process the harvest already runs.

## Where the Architect calls it (phase B, reworked on 2026-11-16)

At the moment of an absence claim, for every claim and not only in the six gateways. The architect's ruling after his blind test and his diagnosis of the false absences (27 of 30 flagged "not documented" claims were at least partly documented, mostly in areas no gateway covers): the six gateway clauses of the first build (+313 bytes each, +1,878 over the six files) and validation case T-48 are dropped, and the rule goes once into `CLAUDE.md`, at the end of the grounding rule's first sentence (§1, line 12): +100 bytes, 20,861 to 20,961 of the 21,000 cap. The owner confirmed that edit to his own file in the terminal on 2026-11-16.

> If the corpus does not cover it, say so rather than recalling it, but only once `./snowarch docs lookup <names or words>` shows ABSENT; open any page it lists first.

`PRINTED` or `NOT PRINTED as typed` with names: the page is opened and cited. `ABSENT`: the marker is grounded. `UNKNOWN` or `NO MATCH` is not ABSENT, so it grounds nothing: the search did not find it and the OPEN QUESTION stays. It is not run for every name; it is the check on the claim that costs the answer most when it is false.

**The permission.** In `design-only` mode the corpus is read through the shell, and a prompt on every lookup would sit in the middle of grounding. So `.claude/settings.json` allows this command and nothing else of the launcher: `Bash(./snowarch docs lookup *)` and, for the PowerShell tool on Windows (a `Bash` rule does not cover that tool), `PowerShell(.\snowarch.cmd docs lookup *)`. `packages/contract/gen/permissions.mjs` writes both from the launcher spelling, after a user's own entries and once, and `gen:check` finds a hand edit. The trailing ` *` is the form Claude Code's permissions page documents: it also matches the bare command and does not match `docs lookupx`.

What the tests hold is the agreement of the generated entries with the launcher each shell types (`tests/contract/gen-governance.test.mjs`, with a reader of that one rule shape in `tests/helpers/permission-rule.mjs`), and that the grounding rule carries the sentence and names the lookup once (`tests/claude-md.test.mjs`, with the sentence on the guard's list of what works). **What they do not hold:** Claude Code's own matcher was not run, and neither was the Windows PowerShell spelling in particular: the permissions page does not say how the PowerShell tool matches a command named by a path (`.\snowarch.cmd`). S-16 (2026-09-07, Claude Code 2.1.258) found that a command wrapped in a second statement (`… 2>&1; echo "EXIT: $?"`) is judged part by part and the wrapper part prompts; that was not measured again, so a session may still be asked about a wrapper and not about the lookup.

**How it was measured** is the architect's, in a sitting he pre-registered; no run is part of this change, and its result is in "What phase B measured" below.

## How phase B is measured (the architect's)

- **A prompt class where the user's words differ from the corpus's:** a label for a table (`requested item`, `catalog task`), a synonym (`RITM`, `CI`), a part of a title, a guessed field. Built from the corpus the way the offline cases below are, with the key page named beforehand from the index.
- **Primary:** the key page is read and cited.
- **Guards:** no new dead paths (`turn-report.mjs`: cited pages missing, 0); no invented names (names printed that no page read and no request gives); no more false absences (a "not documented" about a name the index says the corpus prints: `markedAbsent` over the answer, with the index); the §1.1 verdict letters unchanged, prompt by prompt.
- **Arms:** the current text, and the current text with the instruction. No sitting is part of phase A, and none was run for the build of phase B.

## What phase B measured (the architect's sitting, read on 2026-11-16)

The two arms above, over a prompt class where the user's words differ from the corpus's: **54 answers in each arm.** The architect ruled it ship.

| Measure | The current text | With the sentence |
|---|---|---|
| Answers that read and cite the key page (the primary) | 52 of 54 | 52 of 54 |
| False "not documented" claims | 9 | 2 |
| Refused shell calls an answer | 0.15 | 0.33 |

- **The primary was flat at its ceiling:** 52 of 54 in each arm, so the sentence is not shown to raise the share of answers that read and cite the key page. What it changes is the claim of absence: nine false "not documented" claims fell to two.
- **How the claims were judged:** blind, in two passes of six readers each, over the 200 lines under test; the two passes agreed on 190 of the 200.
- **The guards held:** no cited page was missing (0), no name was invented (0), the section 1.1 verdict letters were the same prompt by prompt (by hand), and the median time of an answer did not move (74.0 s and 73.8 s).
- **Watched, and not ruled out:** refused shell calls rose from 0.15 to 0.33 an answer, and each one is a permission prompt for a user. Three were the lookup called as `cd … && ./../../snowarch docs lookup`, which the allow entry does not match; the rest were compound `sed` and `grep` reads. Nothing here changes it: a separate row will take it up.
- **Still not measured:** Claude Code's own matching of the allow entries, and the PowerShell spelling in particular (see "The permission" above).

## The offline retrieval check (phase A)

`node scripts/validation/lookup-retrieval.mjs` reads every page once and compares a plain grep over the request's words with the lookup. Seed 20261113, whole corpus at the pin `c10276e95345`, 300 cases for L and T, every case for N and S. "Found" for a grep is a page that documents the construct among the first 25 files it lists (path order; a reader cannot open more), and separately among all it lists; for the lookup it is a page that documents it among the pages the call prints.

| Class and the request | Plain grep, first 25 files | Plain grep, all files | Lookup |
|---|---|---|---|
| **N** a name as typed, 63,484 names: a grep that does not escape `_` | 55.0% (34,936) | 55.0% | 100% |
| **L** a label for a name, 300 of 12,666 pairs: the label as typed | 75.7% | 90.7% | name among its first 3 names 97.0%; a page that prints it shown 98.3% |
| **L** the same, the snake_case guess (`requested_item`); the guess is the name in 8.0% of cases | 46.3% | 52.7% | as above |
| **S** a synonym from the corpus's synonym page, 679 cases: `grep -w` | 34.2% | 54.1% | 80.1% |
| **T** a title with one content word dropped, 300 of 46,842 titles: the rest as a phrase | 13.0% | 21.0% | 97.7% |

For N, 28,548 names (45.0%) are printed only with escaped underscores. For T, a grep of every remaining word, files that hold all, finds the page in 26.7% (first 25).

**What these numbers are, and are not.** N is a property of the corpus; the lookup's 100% is its definition (the index uses the same escape-safe reading), so the figure to take is the 45.0% a plain grep cannot see. L is circular for the lookup: the pairs came from the corpus, so a page always exists; the figures to take are the precision (97.0%, the right name among the first three for its label) and that the label as typed beats the snake_case guess by 30 points. S is not circular (the target pages are chosen by title, the synonyms by another page) and is the cleanest comparison. T models a person who remembers part of a title, and its target is the page itself. None of it measures the Architect: whether it calls the lookup, reads the page and cites it is phase B.

## Not in phase A

No change to `CLAUDE.md`, a skill or an agent. No sitting. No model-visible text: the lookup's output is read only when someone runs it. All of that is phase B's, above.
