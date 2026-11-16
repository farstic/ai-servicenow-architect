# ARC-09-C267 — the Stop hook asks once about a cited page the session never opened (lever 2)

**Status:** built in a draft pull request (#600), for the architect's measurement. It ships only if that measurement says so; until then the hook's grounding part asks nothing, and the one switch is `blocking` in `tools/snowarch/lib/docs/grounding-classes.json` (`[]` or the file absent is the arm without the ask, `["citedUnread"]` the arm with it). No change to `CLAUDE.md`, a skill, an agent, a governance page or the corpus.

## Why

An answer can cite a page that the session never opened: the path came from a lookup's list, from a link in another page, from a skill, from the model's memory. A citation is the reader's way to check a claim, and a page that was never opened cannot have been checked. The grounding check of #567 had a class for this, `citedUnread`. Its phase 0 judged it right 39 times in 40 (0.975, against a registered bar of 0.90); the registered pilot at the final notice text judged it warranted on 22 of 25 flags (0.88, under the bar), so nothing blocked in #567, which was closed unmerged on 2026-11-15. Lever 2 is the same class with the reads it could not see added, the files a turn writes added to what it reads, and a different ask.

## What the hook does

At the end of a turn, once, it lists the corpus pages that the final answer **or a file written in that turn** cites and that reached the session by **no read route**, and it asks the model to open each of them. It never asks twice: on the continuation (`stop_hook_active`) it does not block; it says to the user, in a `systemMessage`, only what stayed open.

### What reaches the session (a read route)

Each of these counts, on the main thread or in a sub-agent, and a call that came back with an error does not:

- a `Read` of the page;
- Bash `cat`, `sed`, `head`, `tail`, `awk`, `nl`, `less`, `more`, `bat` that names it, and `grep`, `egrep`, `fgrep`, `rg` that names it, unless the flags only count or list (`-c`, `-l`, `-L`, `-q`, `--files-with-matches`, `--count`, `--files`); in PowerShell `Get-Content`, `gc`, `type` and `Select-String`, `sls` (not `-Quiet`). A page path may be relative: the shell's folder is the one a `cd`, `pushd` or `Set-Location` set, which the next call of the thread keeps, and the folder the session file records for the row is tried too. A `cd` inside `( … )` or on either side of a `|` does not move it;
- the lines a search printed over a folder or several files, each of which begins with its page's path (`path:12:text`, `path-12-context`), from Bash or PowerShell as from the Grep tool in content mode (the Grep tool's `files_with_matches` and `count` modes show no line);
- an MCP file read that names the page by `path`, `file_path` or `paths`, and the shell lines of an MCP batch or shell call;
- a sub-agent's read of any of these: its rows are in `<session>/subagents/agent-<id>.jsonl`, and a workflow's agents' one folder deeper. They are read only when a page is still unread without them;
- a read before a compaction: the rows before the last `compact_boundary` count, though the turn starts after it.

A here-document is text the model wrote, so a page named in its body is not read. A heredoc that redirects to a file (`> f`, `>> f`, `tee`) is a file written in the turn.

### What is not a claim

A citation is skipped when its line says right after the path that the page was not read (the answer saying what it did not do); when its sentence is a pointer (`see also` or `start with` before it, or `read` before it and `first` after it, a sentence ending at a full stop, `!` or `?` followed by a space, never at a `;`); or when the user typed the path in a prompt. A file name alone, a directory and a glob are not citations of a page. A path that the corpus does not hold is C254's when the answer cites it, and this check leaves it; in a written file it is asked about like any other, and opening it tells the model that the path is wrong. A fenced code block, in the answer or in a file, is not read for citations.

### The ask

The registered opening and closing words of the grounding notice are unchanged; the clause between them is new (the architect to review this wording):

> Cited pages that nothing in this session showed: `<paths>`. Open each page and correct what it contradicts in your answer; where a citation only points to where to look, say on its Correction line that it is a pointer.

A page is closed on the continuation when it was read after the ask, or when a `Correction:` line that names its path says it is a pointer.

### The data

`grounding-classes.json` is read on every Stop. A missing, unreadable or malformed file switches every grounding ask off (before this row it meant all seven classes). The hook also checks a turn whose answer cites nothing when `citedUnread` is listed and the session's file holds `markdown/` at all, since a file the turn wrote may cite.

## Where it is

- `tools/snowarch/lib/docs/read-routes.mjs`, new and pure: the shell's words and here-documents, the folder, which command shows a page, what a search printed, one thread of rows. Its tests are `tests/read-routes.test.mjs`.
- `tools/snowarch/lib/docs/turn-sources.mjs`: `reached` (every page that reached the main thread, whenever), `written` (the files of the current turn), `typed` (what the user typed), and `readSubagentRows`. `pagesRead`, which sources the names a page prints, keeps its earlier meaning: a search shows lines of a page, not the page.
- `tools/snowarch/lib/docs/grounding-check.mjs` and `tools/snowarch/hooks/stop-citations.mjs`: the check, the clause and the gate.
- `tests/hook/stop-lever2.test.mjs`: one fixture transcript for each read route and each skip rule, through the hook itself; the C268 case, `cd <folder> && sed -n 1,60p <page>.md`, is one of them. Thirty-three mutations of the code, each breaking one rule on a copy, are all caught by these tests and the unit tests.

## Cost

On the test of a 5.3 MB transcript with an 8.8 MB names index, `report()` takes 312 ms before and 323 ms after (median of three runs, interleaved, a Mac). On 6,000 shell calls in 18.5 MB of rows, `turnSources` takes 250 ms before and 577 ms after; most of the difference is the names that a page read through a `cd` and a relative path now sources, which used to go unseen.

## Limits

- A read the call does not name cannot be seen: a glob, a brace list, a variable, `xargs`, a `for` loop, a command substitution. The page is asked about once, and opening it is one `Read`.
- A script in another language that opens a page is not a read, and a heredoc given to an interpreter that writes a file is not a file written in the turn.
- Sub-agent files are found by Claude Code's present layout; if it changes, sub-agent reads are missed and the hook asks about more pages than it should.
