# ARC-09-C268 — a lookup before an absence claim (phases A and B)

**Status:** phase A built (the lookup and its offline check). Phase B built on top of it: the two sentences the owner approved in the six gateways' Part 2 that make the Architect call it, the generated permission entry that lets it run without a prompt, and the validation case T-48. The measurement of phase B (R7, fresh hidden tasks) is the architect's and is not claimed here.

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

## Where the Architect calls it (phase B, built)

Only before an absence claim or an unverified claim. The instruction is two sentences at the end of the `[Completing Part 2: …]` line of each of the six gateways. That line is one identical line (326 bytes before, 639 after: +253 and +60 bytes, +1,878 over the six files); `CLAUDE.md` is not changed.

> Before calling a construct not documented, unverified or left to the instance, run `./snowarch docs lookup <name or words>…` (many names, one call): only ABSENT grounds "not documented in the bundled corpus"; open a page it shows before you say more. Cite only a page you Read that prints the construct's name.

`PRINTED` or `NOT PRINTED as typed` with names: the page is opened and cited. `ABSENT`: the marker is grounded. `UNKNOWN` or `NO MATCH` is not ABSENT, so it grounds nothing: the search did not find it and the OPEN QUESTION stays. It is not run for every name; it is the check on the claim that costs the answer most when it is false.

**The permission.** In `design-only` mode the corpus is read through the shell, and a prompt on every lookup would sit in the middle of grounding. So `.claude/settings.json` allows this command and nothing else of the launcher: `Bash(./snowarch docs lookup *)` and, for the PowerShell tool on Windows (a `Bash` rule does not cover that tool), `PowerShell(.\snowarch.cmd docs lookup *)`. `packages/contract/gen/permissions.mjs` writes both from the launcher spelling, after a user's own entries and once, and `gen:check` finds a hand edit. The trailing ` *` is the form Claude Code's permissions page documents: it also matches the bare command and does not match `docs lookupx`.

What the tests hold is the agreement of three things that live apart: the command the gateways name, the generated entries, and the launcher each shell types (`tests/contract/gen-governance.test.mjs`, `tests/grounding-completion.test.mjs`, with a reader of that one rule shape in `tests/helpers/permission-rule.mjs`). **What they do not hold:** Claude Code's own matcher was not run, and neither was the Windows PowerShell spelling in particular: the permissions page does not say how the PowerShell tool matches a command named by a path (`.\snowarch.cmd`). S-16 (2026-09-07, Claude Code 2.1.258) found that a command wrapped in a second statement (`… 2>&1; echo "EXIT: $?"`) is judged part by part and the wrapper part prompts; that was not measured again, so a session may still be asked about a wrapper and not about the lookup.

**T-48** (`tests/VALIDATION-TESTS.md`) is the case: a prompt that names two tables by their labels ("requested item", "catalog task"), and a pass that needs a lookup call, a page it showed that the session read, and the construct cited from that page. No run of it is part of this change.

## How phase B is measured (the architect's)

- **A prompt class where the user's words differ from the corpus's:** a label for a table (`requested item`, `catalog task`), a synonym (`RITM`, `CI`), a part of a title, a guessed field. Built from the corpus the way the offline cases below are, with the key page named beforehand from the index.
- **Primary:** the key page is read and cited.
- **Guards:** no new dead paths (`turn-report.mjs`: cited pages missing, 0); no invented names (names printed that no page read and no request gives); no more false absences (a "not documented" about a name the index says the corpus prints: `markedAbsent` over the answer, with the index); the §1.1 verdict letters unchanged, prompt by prompt.
- **Arms:** the current text, and the current text with the instruction. No sitting is part of phase A, and none was run for the build of phase B.

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
