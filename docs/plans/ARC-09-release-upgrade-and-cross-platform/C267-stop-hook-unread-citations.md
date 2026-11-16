# ARC-09-C267 — the Stop hook asks once about a cited page the session never opened (lever 2)

**Status:** built in a draft pull request (#600), for the architect's measurement, with his rulings of 2026-11-16 on the words of the ask, on what the notice lists after the continuation and on reads the call does not name, and his review of the same day (findings A1 to D: the glob and brace words of an unresolved call, a folder reset before each call of a sub-agent, an input cut short, a budget for each glob pattern, a notice that closes a page by the rules of the ask, the cost, and a bare file name as a citation). It ships only if that measurement says so; until then the hook's grounding part asks nothing, and the one switch is `blocking` in `tools/snowarch/lib/docs/grounding-classes.json` (`[]` or the file absent is the arm without the ask, `["citedUnread"]` the arm with it). No change to `CLAUDE.md`, a skill, an agent, a governance page or the corpus.

## Why

An answer can cite a page that the session never opened: the path came from a lookup's list, from a link in another page, from a skill, from the model's memory. A citation is the reader's way to check a claim, and a page that was never opened cannot have been checked. The grounding check of #567 had a class for this, `citedUnread`. Its phase 0 judged it right 39 times in 40 (0.975, against a registered bar of 0.90); the registered pilot at the final notice text judged it warranted on 22 of 25 flags (0.88, under the bar), so nothing blocked in #567, which was closed unmerged on 2026-11-15. Lever 2 is the same class with the reads it could not see added, the files a turn writes added to what it reads, and a different ask.

## What the hook does

At the end of a turn, once, it lists the corpus pages that the final answer **or a file written in that turn** cites and that reached the session by **no read route**, and it asks the model to open each of them. It never asks twice: on the continuation (`stop_hook_active`) it does not block; it says to the user, in a `systemMessage`, only what stayed open.

The guard of the pre-registration is **0 false "unread" claims**. Telling the model it did not open a page it read is the failure that costs; a missed unread citation costs less. So wherever the transcript cannot say, the hook counts the page as shown.

### What reaches the session (a read route)

Each of these counts, on the main thread or in a sub-agent. A call that came back with an error does not, except a Bash or PowerShell call with a viewer verb (see the names rule):

- a `Read` of the page;
- Bash `cat`, `sed`, `head`, `tail`, `awk` (and `gawk`, `mawk`, `nawk`), `nl`, `less`, `more`, `bat`, and the filters that print a file again, cut or ordered (`cut`, `fold`, `tac`, `rev`, `fmt`, `column`, `expand`, `sort`, `uniq`, `paste`), and `grep`, `egrep`, `fgrep`, `rg`, that name it, unless the flags only count or list (`-c`, `-l`, `-L`, `-q`, `--files-with-matches`, `--count`, `--files`); in PowerShell `Get-Content`, `gc`, `type` and `Select-String`, `sls` (not `-Quiet`). A wrapper (`nice -n 10`, `timeout 5`, `env A=b`, `sudo`, `nohup`, `command`) or a reserved word (`then`, `do`, `!`, `{`) in front of the verb is stepped over. A page path may be relative: the shell's folder is the one a `cd`, `pushd` or `Set-Location` set, which the next call of the thread keeps, and the folder the session file records for the row is tried too. A `cd` inside `( … )` or on either side of a `|` does not move it. **A thread whose folder Claude Code resets before every Bash call does not keep it:** a sub-agent's (its rows are in `<session>/subagents/…`), and the main thread's when `CLAUDE_BASH_MAINTAIN_PROJECT_WORKING_DIR` is `1`, `true`, `yes` or `on` in the hook's environment. Each call of such a thread starts at the folder its row records, and a `cd` of one call is not the next call's;
- **a brace list or a glob in those commands' arguments.** `sed -n 1,40p {a,b}.md` and `cat dir/c_{Esc,Other}.md` are the pages the shell would try, whether or not each is there; `cat dir/*.md`, `c_?lpha.md`, `c_[AB]*.md` and `**/` are expanded against the file system (`lib/docs/glob-fs.mjs`), from the folder the shell was in, only under the corpus and only for an absolute pattern, with a budget of 300 folder reads, 50,000 entries and 1.5 s for a hook run and one answer kept for each pattern; over the budget it answers nothing, and the pattern's own words are matched against the page (below). The budget is one for each pattern, not one for the run. PowerShell has no braces, and its patterns are not case-sensitive;
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

**Its output.** When an unresolved call has a viewer verb (a viewer or a search that prints lines, or a runner given one: `xargs head`, `bash -c "cat x.md"`, `find -exec cat`), the pages named in its output count as shown too, by the same whole-name rule: the first 500,000 characters of it. A loop over `$(ls dir)` that heads every file is read through the names its output prints. A call with no viewer verb (`python3` printing a listing, a loop that only echoes, `ls | xargs echo`) is not read for names.

**A call that failed** (a non-zero exit) may have printed part of what it was asked for: `cat a.md missing.md` prints `a.md`. When the call has a viewer verb, the pages it names that are on disk (in the corpus folder of the install) count as shown, and so do its unresolved text and its output for a cited page that is on disk. A failed call with no viewer shows nothing, and no failed call moves the shell's folder or writes a file.

**The glob and brace words of an unresolved call.** A pattern is not a name, so `for f in dir/c_Esc*.md; do sed -n 1,60p "$f"; done`, `find . -name 'c_Esc*.md' | xargs cat` and `cd ~/x && cat c_Esc*.md` hold no page's bare file name. Every word of such a call that has a wildcard (`* ? [`) or a brace list is tested against each cited page, with no file system (`wordNamesPage` in `lib/docs/read-routes.mjs`): the brace lists are expanded, then the word's segments are matched from the last against the page's `markdown/<area>/…/<name>.md`, a wildcard meaning what the shell gives it, until one of them is used up. A relative word whose folder the call knows is joined to it first (`cd <area> && for f in *.md` covers that area's pages and no other's), and is taken as written when the folder is lost by a `cd` with `~` or a variable, or is not known, or is a `find -name` pattern, which matches base names wherever the shell stands. `**`, `..` and a segment that is an expansion cover the folders above them. The same goes for a viewer's pattern the file system did not answer (over its budget), for the glob tokens inside the code of another language or a quoted script (`python3 -c "glob.glob('…/c_Esc*.md')"`), and for a call that failed with a viewer when the page is on disk, and for the sub-agents' rows.

The text is the call without the here-documents that a command writes; a heredoc that feeds an interpreter (`python3 - <<'PY'`) is a script and its body is part of the text. A command that cannot show a page is not unresolved for having a variable: `ls $DIR/c_Alpha.md`, `echo $HOME c_Alpha.md`, `cp`, `wc`, `find` without `-exec`, `git status`.

### What is not a claim

A citation is skipped when its line says right after the path that the page was not read (the answer saying what it did not do); when its sentence is a pointer (`see also` or `start with` before it, or `read` before it and `first` after it, a sentence ending at a full stop, `!` or `?` followed by a space, never at a `;`); or when the user typed the path in a prompt. A file name alone, a directory and a glob are not citations of a page. A path that the corpus does not hold is C254's when the answer cites it, and this check leaves it; in a written file it is asked about like any other, and opening it tells the model that the path is wrong. A page that the corpus holds but this install has not got on disk cannot be opened: when the answer cites it, it is C254's and the grounding ask leaves it, in the first ask and in the notice alike (both read the same disk). A fenced code block, in the answer or in a file, is not read for citations.

**A bare file name is a citation.** A `<name>.md` in the answer, or in a file the turn wrote, that is the file name of a corpus page (`c_CaseRouting.md`, "(citation: `x.md`)") is a citation of every page of that name: shown if any of those pages reached the session, else asked under the name as written. The same skips apply (a declared-unread, a pointer sentence, a name the user typed). Never citations: a name that is no page of the corpus (`SKILL.md`, `CLAUDE.md`, `README.md`, `notes.md`), `index.md`, a name that more than five pages carry, a name that is part of a longer path (`docs/c_Beta.md`), a name of which no page is on disk, and a name when the answer also cites one of its pages by its path. The corpus tree is read once, and only when such a name is there to look up.

### The ask

The registered opening and closing words of the grounding notice are unchanged; the clause between them is the architect's (2026-11-16):

> You cited pages that this session never opened: `<paths>`. Open each one now. Where a page contradicts your answer, correct the answer. Where a citation only tells the reader where to look, mark it as a pointer on its Correction line.

### What stays open after the ask

The user still sees the first answer, so the notice takes its citations as a second input (the architect's ruling a, 2026-11-16). A citation of the first answer or of the continuation stays open until a page is shown before the turn ends, **by any route the ask counted** (a read, the names of a call, a pattern, a sub-agent, a folder set before the answer: the notice walks all the rows with the rules of the ask), or a `Correction:` line that names the page says it is a pointer, withdrawn, retracted, removed or dropped. The notice never lists an item the ask did not name: a dead path is in neither, and a page the continuation adds is not listed when the ask itself named it (C254 names the right path of a dead one, and asks for it). A restated answer that silently drops a citation does not close it, and neither does a withdrawal that names no page: "Understood." leaves every unread citation of the first answer in the notice. A page that first appears in the continuation and stays unread is open, unless a line marks it. A file the turn wrote follows the same rule (left alone, rewritten with no page named: open; the removal said on a line that names the pages: closed).

The registered tail says "do not write a withdrawn name or path again", so a model that withdraws a citation and obeys it names no page, and the item stays open: the rule asks for the path on the line.

### The data

`grounding-classes.json` is read on every Stop. A missing, unreadable or malformed file switches every grounding ask off (before this row it meant all seven classes); C254's dead-path line does not read the file and works without it. The hook also checks a turn whose answer cites nothing when `citedUnread` is listed and the session's file holds `markdown/` at all, since a file the turn wrote may cite.

## Where it is

- `tools/snowarch/lib/docs/read-routes.mjs`, pure: the shell's words, expansions and here-documents, the folder, brace expansion, which command shows a page, what a search printed, the names rule, the pattern words and `wordNamesPage`, one thread of rows. Its tests are `tests/read-routes.test.mjs` and `tests/lever2-review.test.mjs`.
- `tools/snowarch/lib/docs/glob-fs.mjs`: the one place that touches the disk, behind a seam, for patterns; a budget for each pattern, `null` over it. Its tests are `tests/glob-fs.test.mjs`, over an in-memory file system.
- `tools/snowarch/lib/docs/turn-sources.mjs`: `reached` (every page that reached the main thread, whenever), `written` (the files of the current turn, or of the continuation), `typed` (what the user typed), `opaque` (the texts of the names rule) and `readSubagentRows`. `pagesRead`, which sources the names a page prints, keeps its earlier meaning: a search shows lines of a page, not the page.
- `tools/snowarch/lib/docs/grounding-check.mjs` and `tools/snowarch/hooks/stop-citations.mjs`: the check, the clause, the notice and the gate.
- `tests/hook/stop-lever2.test.mjs` and `tests/hook/stop-lever2-review.test.mjs` (their fixtures are `tests/helpers/lever2.mjs`): one fixture transcript for each read route, each skip rule and each finding of the review, through the hook itself, over a real file system; the C268 case, `cd <folder> && sed -n 1,60p <page>.md`, and the architect's four, `cat dir/*.md`, `sed -n 1,40p {a,b}.md`, `for f in a.md b.md; do head -20 "$f"; done` and `find . -name x.md | xargs cat`, are among them.

## Cost

The names that a session's pages print (for the classes that are measured and do not ask) were nearly all of the walk's time: on a synthetic session file of 63 MB (2,700 Reads of 12 KB pages, 2,700 `sed` calls with 6 KB outputs, 450 Grep results) `turnSources` took 2.1 s and the walk of the read routes 46 ms. The hook now asks the check for the classes that block only (`askedOnly`), so a Stop on that file takes 0.5 to 0.9 s and the continuation 1.1 s, against 2.4 to 3.9 s and 10 s (past the old deadline, so silent) for the first build, on a Mac; a replay or a grader still computes every class. The session file is read once for a Stop, the sub-agents' files once for a run, and the whole run has a 3 s deadline (`DEADLINE_MS`), past which nothing is asked and a debug line says so. A pattern costs one folder read the first time and nothing after, within its own budget of 300 folders, 50,000 entries and 1.5 s.

## Limits

- A call that failed with no viewer verb shows nothing, whatever it printed; and an MCP call that failed shows nothing.
- A glob over a folder its budget does not cover answers nothing, and the call is then its pattern's words, tested against the page by path and file name.
- An input cut short asks nothing: more than 200 sub-agent files or 64 MB of them, a sub-agent file that cannot be read or has a line that does not parse in the middle of it, or a line of the session file that does not parse before its last (a write in progress tears the last one). The debug line says which, when `SNOWARCH_HOOK_DEBUG` is set.
- The pattern rule over-counts, the side the ruling chose: a bare `*.md` in a folder the call does not know covers every page, a `find -name` pattern every area's page of that name, and `-regex` is read as a glob.
- A thread's folder is taken as kept unless the thread is a sub-agent's or `CLAUDE_BASH_MAINTAIN_PROJECT_WORKING_DIR` says it is reset; a `cd` in a call that then failed, or `popd`, is not followed.
- A name that the shell builds (`$(echo c_Esc).md`) is not in the text, and appears in the output only if the call prints it; neither is a page named in a file a script reads from a list. The output is read for an unresolved call that has a viewer verb, and only its first 500,000 characters.
- The names rule counts a page whose file name is in an unresolved call even when the call only mentioned it: `python3 -c 'print(1)  # c_Esc.md'`. This is the side the ruling chose.
- A file rewritten after the ask with no `Correction:` line naming its pages keeps its citations open: the notice does not read the file's earlier text apart from the new.
- Sub-agent files are found by Claude Code's present layout; if it changes, sub-agent reads are missed and the hook asks about more pages than it should.
