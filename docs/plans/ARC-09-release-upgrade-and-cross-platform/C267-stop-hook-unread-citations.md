# ARC-09-C267 — the Stop hook asks once about a cited page the session never opened (lever 2)

**Status:** built in a draft pull request (#600), for the architect's measurement, with his rulings of 2026-11-16 on the words of the ask, on what the notice lists after the continuation and on reads the call does not name. It ships only if that measurement says so; until then the hook's grounding part asks nothing, and the one switch is `blocking` in `tools/snowarch/lib/docs/grounding-classes.json` (`[]` or the file absent is the arm without the ask, `["citedUnread"]` the arm with it). No change to `CLAUDE.md`, a skill, an agent, a governance page or the corpus.

## Why

An answer can cite a page that the session never opened: the path came from a lookup's list, from a link in another page, from a skill, from the model's memory. A citation is the reader's way to check a claim, and a page that was never opened cannot have been checked. The grounding check of #567 had a class for this, `citedUnread`. Its phase 0 judged it right 39 times in 40 (0.975, against a registered bar of 0.90); the registered pilot at the final notice text judged it warranted on 22 of 25 flags (0.88, under the bar), so nothing blocked in #567, which was closed unmerged on 2026-11-15. Lever 2 is the same class with the reads it could not see added, the files a turn writes added to what it reads, and a different ask.

## What the hook does

At the end of a turn, once, it lists the corpus pages that the final answer **or a file written in that turn** cites and that reached the session by **no read route**, and it asks the model to open each of them. It never asks twice: on the continuation (`stop_hook_active`) it does not block; it says to the user, in a `systemMessage`, only what stayed open.

The guard of the pre-registration is **0 false "unread" claims**. Telling the model it did not open a page it read is the failure that costs; a missed unread citation costs less. So wherever the transcript cannot say, the hook counts the page as shown.

### What reaches the session (a read route)

Each of these counts, on the main thread or in a sub-agent, and a call that came back with an error does not:

- a `Read` of the page;
- Bash `cat`, `sed`, `head`, `tail`, `awk` (and `gawk`, `mawk`, `nawk`), `nl`, `less`, `more`, `bat`, and the filters that print a file again, cut or ordered (`cut`, `fold`, `tac`, `rev`, `fmt`, `column`, `expand`, `sort`, `uniq`, `paste`), and `grep`, `egrep`, `fgrep`, `rg`, that name it, unless the flags only count or list (`-c`, `-l`, `-L`, `-q`, `--files-with-matches`, `--count`, `--files`); in PowerShell `Get-Content`, `gc`, `type` and `Select-String`, `sls` (not `-Quiet`). A wrapper (`nice -n 10`, `timeout 5`, `env A=b`, `sudo`, `nohup`, `command`) or a reserved word (`then`, `do`, `!`, `{`) in front of the verb is stepped over. A page path may be relative: the shell's folder is the one a `cd`, `pushd` or `Set-Location` set, which the next call of the thread keeps, and the folder the session file records for the row is tried too. A `cd` inside `( … )` or on either side of a `|` does not move it;
- **a brace list or a glob in those commands' arguments.** `sed -n 1,40p {a,b}.md` and `cat dir/c_{Esc,Other}.md` are the pages the shell would try, whether or not each is there; `cat dir/*.md`, `c_?lpha.md`, `c_[AB]*.md` and `**/` are expanded against the file system (`lib/docs/glob-fs.mjs`), from the folder the shell was in, only under the corpus and only for an absolute pattern, with a budget of 300 folder reads, 50,000 entries and 1.5 s for a hook run and one answer kept for each pattern; over the budget it answers nothing and the names rule below takes over. PowerShell has no braces, and its patterns are not case-sensitive;
- the lines a search printed over a folder or several files, each of which begins with its page's path (`path:12:text`, `path-12-context`), from Bash or PowerShell as from the Grep tool in content mode (the Grep tool's `files_with_matches` and `count` modes show no line);
- an MCP file read that names the page by `path`, `file_path` or `paths`, and the shell lines of an MCP batch or shell call;
- a sub-agent's read of any of these: its rows are in `<session>/subagents/agent-<id>.jsonl`, and a workflow's agents' one folder deeper. They are read only when a page is still unread without them;
- a read before a compaction: the rows before the last `compact_boundary` count, though the turn starts after it.

A here-document is text the model wrote, so a page named in its body is not read. A heredoc that redirects to a file (`> f`, `>> f`, `tee`) is a file written in the turn.

### What the call does not name: the names rule

What cannot be resolved is kept as the **text** of the call, and every page whose bare file name is in that text counts as shown, whether the cited path is the full one or not. The name must be a whole name: `c_Alpha.md` is in `cat ./c_Alpha.md` and in `/x/markdown/a/c_Alpha.md`, and not in `xc_Alpha.md`, `c_Alpha.md.bak` or `c_Alpha.mdx`. A call is unresolved when it has

- a `for`, `while`, `until` or `select` loop; `xargs`, `parallel`, `eval`, `source`, `find` with `-exec`, `-execdir`, `-ok` or `-okdir`; another shell (`bash -c`, `sh -c`, `zsh`, `pwsh`, `cmd`);
- an interpreter of another language: `python`, `node`, `deno`, `bun`, `perl`, `ruby`, `php`, `lua`, `Rscript`, `julia`, `osascript`, `java`, and the like, also in the code of an MCP execute tool whose `language` is not `shell`;
- `git show`, `cat-file`, `diff`, `blame`, `annotate`, `log`, `whatchanged`, `grep` or `archive`;
- a variable or a substitution (`$F`, `${F}`, `$(…)`, a back-tick) in the words of a viewer or a search, or a verb the shell builds;
- in PowerShell: `ForEach-Object`, `%`, `foreach`, `Invoke-Expression`, a `Get-Content` with nothing to name that a pipe feeds (`gci … | gc`), a command that begins with `[` or `$`, or one with `::`;
- a **folder the call cannot tell**: a `cd` whose target has a variable, `~`, a glob or a substitution loses the folder until a `cd` to an absolute folder; a relative `.md` name in a viewer's arguments in that time, or when no folder is known at all, is kept as text. A folder that is known and is not the corpus makes a relative name no page.

The text is the call without the here-documents that a command writes; a heredoc that feeds an interpreter (`python3 - <<'PY'`) is a script and its body is part of the text. A command that cannot show a page is not unresolved for having a variable: `ls $DIR/c_Alpha.md`, `echo $HOME c_Alpha.md`, `cp`, `wc`, `find` without `-exec`, `git status`.

### What is not a claim

A citation is skipped when its line says right after the path that the page was not read (the answer saying what it did not do); when its sentence is a pointer (`see also` or `start with` before it, or `read` before it and `first` after it, a sentence ending at a full stop, `!` or `?` followed by a space, never at a `;`); or when the user typed the path in a prompt. A file name alone, a directory and a glob are not citations of a page. A path that the corpus does not hold is C254's when the answer cites it, and this check leaves it; in a written file it is asked about like any other, and opening it tells the model that the path is wrong. A fenced code block, in the answer or in a file, is not read for citations.

### The ask

The registered opening and closing words of the grounding notice are unchanged; the clause between them is the architect's (2026-11-16):

> You cited pages that this session never opened: `<paths>`. Open each one now. Where a page contradicts your answer, correct the answer. Where a citation only tells the reader where to look, mark it as a pointer on its Correction line.

### What stays open after the ask

On the continuation the hook **recomputes the citations on the final answer**: the text the continuation wrote and the files it wrote, with every read of the session. A page is open only if that answer still cites it and no route showed it. So a citation the continuation withdrew is resolved, whether it left the text or a `Correction:` line that names the page says it is a pointer, withdrawn, retracted, removed or dropped; a page read after the ask is resolved; a page that first appears in the continuation and stays unread is open. A continuation that cites nothing leaves the notice empty: this is what the rule gives, and a test says so. A file the continuation left alone is not read again for the notice; one it rewrote is read as it now stands.

### The data

`grounding-classes.json` is read on every Stop. A missing, unreadable or malformed file switches every grounding ask off (before this row it meant all seven classes); C254's dead-path line does not read the file and works without it. The hook also checks a turn whose answer cites nothing when `citedUnread` is listed and the session's file holds `markdown/` at all, since a file the turn wrote may cite.

## Where it is

- `tools/snowarch/lib/docs/read-routes.mjs`, pure: the shell's words, expansions and here-documents, the folder, brace expansion, which command shows a page, what a search printed, the names rule, one thread of rows. Its tests are `tests/read-routes.test.mjs`.
- `tools/snowarch/lib/docs/glob-fs.mjs`: the one place that touches the disk, behind a seam, for patterns. Its tests are `tests/glob-fs.test.mjs`, over an in-memory file system.
- `tools/snowarch/lib/docs/turn-sources.mjs`: `reached` (every page that reached the main thread, whenever), `written` (the files of the current turn, or of the continuation), `typed` (what the user typed), `opaque` (the texts of the names rule) and `readSubagentRows`. `pagesRead`, which sources the names a page prints, keeps its earlier meaning: a search shows lines of a page, not the page.
- `tools/snowarch/lib/docs/grounding-check.mjs` and `tools/snowarch/hooks/stop-citations.mjs`: the check, the clause, the notice and the gate.
- `tests/hook/stop-lever2.test.mjs`: one fixture transcript for each read route and each skip rule, through the hook itself, over a real file system; the C268 case, `cd <folder> && sed -n 1,60p <page>.md`, and the architect's four, `cat dir/*.md`, `sed -n 1,40p {a,b}.md`, `for f in a.md b.md; do head -20 "$f"; done` and `find . -name x.md | xargs cat`, are among them.

## Cost

On the test of a 5.3 MB transcript with an 8.8 MB names index, `report()` takes the same time before and after (344, 294 and 209 ms before; 310, 214 and 210 ms after; three runs, interleaved, a Mac). On 6,000 shell calls in 18.5 MB of rows, `turnSources` takes 256 ms before and 574 ms after; most of the difference is the names that a page read through a `cd` and a relative path now sources, which used to go unseen. A pattern costs one folder read the first time and nothing after.

## Limits

- A call that failed (a non-zero exit) is ignored whole, though it may have printed part of what it was asked for.
- A glob over a folder the budget does not cover answers nothing, and the call is then only its names.
- A name that the shell builds (`$(echo c_Esc).md`) is not in the text; neither is a page named in a file a script reads from a list.
- The names rule counts a page whose file name is in an unresolved call even when the call only mentioned it: `python3 -c 'print(1)  # c_Esc.md'`. This is the side the ruling chose.
- Sub-agent files are found by Claude Code's present layout; if it changes, sub-agent reads are missed and the hook asks about more pages than it should.
