// Copyright 2026 Cvetomir Grigorov. Licensed under the Business Source License 1.1 (see LICENSE).
// snowarch — AI ServiceNow Architect. Not affiliated with or endorsed by ServiceNow, Inc.
// ARC-09-C267 (lever 2) — how a corpus page reaches a session, from the tool calls its transcript keeps, and nothing else.
//
// The Stop hook asks about a citation only when the page it names reached the session by NO read route (grounding-check.mjs, the
// class `citedUnread`). The routes, as the architect set them: a successful Read; a Bash `cat`, `sed`, `head`, `tail`, `awk`, `nl`,
// `grep` or `rg` that names the page, its path taken relative to the shell's folder, which a `cd` sets and the next call keeps; a Grep
// in content mode; an MCP file read (the context-mode server's file tool takes a `path`; its batch and shell calls carry shell lines);
// a sub-agent's reads (the caller walks each sub-agent's own rows); and the reads before a compaction (the caller does not stop at the
// boundary). Not routes: a heredoc, whose body is text the model wrote and which writes a file; a call that failed; a command that lists
// (`ls`, `find`, `wc`, `stat`) or only counts and names (`grep -c`, `-l`, `-L`, `-q`); a directory or a glob; a page that is not the
// one named.
//
// PURE: every function reads its arguments and nothing else (no file, no clock, no global).
import { corpusRelative } from './resolve.mjs';

const posix = (p) => String(p ?? '').replace(/\\/g, '/').replace(/\/{2,}/g, '/');
const blocksOf = (row) => {
  const c = row?.message?.content;
  if (typeof c === 'string') return [{ type: 'text', text: c }];
  return Array.isArray(c) ? c.filter((b) => b && typeof b === 'object') : [];
};
const textOfResult = (b) => {
  const c = b?.content;
  if (typeof c === 'string') return c;
  if (Array.isArray(c)) return c.filter((x) => x && x.type === 'text' && typeof x.text === 'string').map((x) => x.text).join('\n');
  return '';
};

/**
 * What a path to one corpus page looks like once `corpusRelative` has cut it at the corpus folder. The characters are the ones a citation holds;
 * none of the 51,657 pages of the corpus, measured on 2026-11-08, holds another, and each sits in the folder of an area. So a glob, a brace list, a
 * variable, a comma, a space or a directory is not one page, and which pages it stands for cannot be told from the call.
 */
const PAGE_PATH = /^markdown\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_./-]+\.md$/;

/** `markdown/<area>/….md` for a path that names exactly one corpus page, in any spelling a Read would be given; otherwise `null`. */
export const pageAt = (file) => {
  const rel = corpusRelative(file);
  return rel && PAGE_PATH.test(rel) ? rel : null;
};

// ---- the shell: words, operators, depth, and the here-documents that are text and not commands ------------------------------------------

/**
 * The simple commands of a command line, each `{ words, op, depth }`: its words with the quotes taken off, the operator that came before it
 * (`''` for the first, else `&&`, `||`, `;`, `|`, `&` or a new line, the parentheses left out) and how many `(` it is inside. The line is cut at an unquoted `|`, `;`,
 * `&`, `(`, `)` or newline, so a `;` inside `sed -n '1,40p;50,60p'` cuts nothing and `x=$(cat f)` has a `cat` in it; for sh a back-tick cuts too.
 * It is not a shell: nothing is expanded. A here-document is not read as commands: its body is returned in `heredocs`, `{ body, writes }`, where
 * `writes` says that the line redirects to a file (`> f`, `>> f`) or goes through `tee`. With `powershell` the line is read as PowerShell reads
 * it: a back-slash is a letter (it parts a Windows path), the back-tick escapes the next character, a quote is written twice to be itself, a
 * comma parts the items of a list, and a here-string (`@'` … `'@`) is a body like a here-document. Pure.
 */
export function shellSegments(command, { powershell = false } = {}) {
  const s = String(command ?? '');
  const escape = powershell ? '`' : '\\';
  const segments = [];
  const heredocs = [];
  let words = [];
  let word = '';
  let started = false;                                            // `""` is a word too
  let quote = '';
  let seps = '';                                                  // the separators seen since the last segment ended
  let depth = 0;
  let open = { op: '', depth: 0 };                                // how the segment being built began
  let pending = [];                                               // here-documents whose body starts on the next line
  let lineStart = 0;                                              // the first segment of the current line
  const endWord = () => {
    if (started) {
      if (words.length === 0) { open = { op: seps.replace(/[()]/g, ''), depth }; seps = ''; }
      words.push(word);
    }
    word = ''; started = false;
  };
  const endSegment = (sep = '') => { endWord(); if (words.length) segments.push({ words, op: open.op, depth: open.depth }); words = []; seps += sep; };
  const redirects = (ws) => ws.some((w) => /^(?:1|&)?>>?(?![&|])/.test(w)) || ws.some((w) => /(?:^|[\\/])tee$/.test(w));
  for (let i = 0; i < s.length; i += 1) {
    const c = s[i];
    const next = s[i + 1];
    if (quote) {
      if (c === quote) {
        if (powershell && next === quote) { word += c; i += 1; }                                   // '' and "" are one quote
        else quote = '';
      } else if (c === escape && next !== undefined && (powershell ? quote === '"' : quote === '"' && '"\\$`'.includes(next))) { word += next; i += 1; }
      else word += c;
    } else if (c === "'" || c === '"') { quote = c; started = true; }
    else if (c === escape) {
      if (next === '\n') i += 1;                                  // a line continuation joins the lines
      else if (next !== undefined) { word += next; started = true; i += 1; }
    } else if (powershell && c === '@' && (next === "'" || next === '"') && !started && /^[ \t]*\r?\n/.test(s.slice(i + 2))) {
      // A PowerShell here-string: the body runs to a line that starts with the closing quote and `@`.
      const close = `${next}@`;
      const from = s.indexOf('\n', i) + 1;
      let at = from;
      const body = [];
      while (at <= s.length) {
        let e = s.indexOf('\n', at); if (e < 0) e = s.length;
        const line = s.slice(at, e).replace(/\r$/, '');
        at = e + 1;
        if (line.startsWith(close)) break;
        body.push(line);
        if (e >= s.length) break;
      }
      heredocs.push({ body: body.join('\n'), writes: /Set-Content|Add-Content|Out-File|\bsc\b|>>?\s*\S/i.test(s) });
      word = '@'; started = true;                                 // the here-string stands for one word
      i = Math.max(at - 2, i);
    } else if (!powershell && c === '<' && next === '<' && s[i + 2] === '<') { word += '<<<'; started = true; i += 2; }          // a here-string feeds text, not a file
    else if (!powershell && c === '<' && next === '<') {
      let j = i + 2;
      let strip = false;
      if (s[j] === '-') { strip = true; j += 1; }
      while (s[j] === ' ' || s[j] === '\t') j += 1;
      let delimiter = '';
      if (s[j] === "'" || s[j] === '"') { const q = s[j]; j += 1; while (j < s.length && s[j] !== q) { delimiter += s[j]; j += 1; } j += 1; }
      else { while (j < s.length && !/[\s;|&()<>]/.test(s[j])) { if (s[j] === '\\') j += 1; delimiter += s[j] ?? ''; j += 1; } }
      if (delimiter) { pending.push({ delimiter, strip }); i = j - 1; }
      else { word += c; started = true; }
    } else if (c === '\n' && pending.length) {
      const line = segments.slice(lineStart).flatMap((g) => g.words).concat(words, started ? [word] : []);
      const writes = redirects(line);
      endSegment('\n');
      lineStart = segments.length;
      let pos = i + 1;
      for (const h of pending) {
        const body = [];
        while (pos <= s.length) {
          let e = s.indexOf('\n', pos); if (e < 0) e = s.length;
          const text = s.slice(pos, e).replace(/\r$/, '');
          pos = e + 1;
          if ((h.strip ? text.replace(/^\t+/, '') : text) === h.delimiter) break;
          body.push(text);
          if (e >= s.length) break;
        }
        heredocs.push({ body: body.join('\n'), writes });
      }
      pending = [];
      i = pos - 1;
    } else if (c === '&' && (s[i - 1] === '>' || s[i - 1] === '<' || next === '>')) { word += c; started = true; }                  // 2>&1, >&2, &>file
    else if (c === '|' || c === ';' || c === '&' || c === '\n' || c === '(' || c === ')' || (!powershell && c === '`')) {
      endSegment(c);
      if (c === '\n') lineStart = segments.length;
      if (c === '(') depth += 1;
      else if (c === ')') depth = Math.max(0, depth - 1);
    } else if (c === ' ' || c === '\t' || c === '\r' || (powershell && c === ',')) endWord();
    else { word += c; started = true; }
  }
  endSegment();
  return { segments, heredocs };
}

/** The words of each simple command, as `shellSegments` cuts them (the shape of ARC-09-C267's first readers). */
export const shellWords = (command, opts) => shellSegments(command, opts).segments.map((g) => g.words);

// ---- the shell's folder -----------------------------------------------------------------------------------------------------------------
const ABSOLUTE = /^(?:\/|[A-Za-z]:\/)/;

/**
 * `rel` joined to `base` (both read with either separator) and tidied of `.` and `..`. With no `base` a relative `rel` stays relative (a `..` that
 * leaves it is kept), so `cd vendor/ServiceNowDocs/markdown/x` then `sed … page.md` still names a corpus page when a row records no folder.
 */
export function joinPath(base, rel) {
  const r = posix(rel);
  const full = ABSOLUTE.test(r) || !base ? r : `${posix(base)}/${r}`;
  const drive = /^[A-Za-z]:\//.exec(full)?.[0].slice(0, 2) ?? '';
  const rooted = Boolean(drive) || full.startsWith('/');
  const out = [];
  for (const part of (drive ? full.slice(2) : full).split('/')) {
    if (part === '' || part === '.') continue;
    if (part === '..' && out.length && out[out.length - 1] !== '..') out.pop();
    else if (part === '..' && !rooted) out.push(part);
    else if (part !== '..') out.push(part);
  }
  return rooted ? `${drive}/${out.join('/')}` : out.join('/');
}

const CD = new Set(['cd', 'chdir', 'pushd']);
const POWERSHELL_CD = new Set(['cd', 'chdir', 'pushd', 'set-location', 'sl']);
const basename = (w) => String(w ?? '').replace(/^.*[\\/]/, '');

/**
 * `{ dir }` when the command is one that changes the shell's folder (`cd`, `pushd`, and in PowerShell `Set-Location` and `sl`), `dir` being its
 * target as written, or `null` when it cannot be told from the call (no target, `-`, `~`, a variable, a substitution, a glob); `null` when it is
 * not such a command.
 */
export function cdOf(words, { powershell = false } = {}) {
  const verb = basename(words[0]);
  if (!(powershell ? POWERSHELL_CD.has(verb.toLowerCase()) : CD.has(verb))) return null;
  const args = words.slice(1);
  let target = null;
  if (powershell) {
    const at = args.findIndex((a) => /^-(?:path|literalpath|lp|p)$/i.test(a));
    target = at >= 0 ? args[at + 1] : args.find((a) => !a.startsWith('-'));
  } else {
    const at = args.indexOf('--');
    target = (at >= 0 ? args.slice(at + 1) : args.filter((a) => !a.startsWith('-')))[0];
  }
  if (typeof target !== 'string' || target === '' || target === '-' || /^~|[$`*?{}]/.test(target)) return { dir: null };
  return { dir: target };
}

// ---- the commands that show a page ------------------------------------------------------------------------------------------------------
/** The commands that print the lines of the files they are given. `ls`, `find`, `wc` and `stat` list or count: they show no page. */
const SHOWING = new Set(['cat', 'head', 'tail', 'sed', 'nl', 'less', 'more', 'awk', 'bat']);
/** The commands that print the lines of a file that match: they show the page's lines that matter. */
const SEARCHING = new Set(['grep', 'egrep', 'fgrep', 'rg']);
const POWERSHELL_SHOWING = new Set([...SHOWING, 'get-content', 'gc', 'type']);
const POWERSHELL_SEARCHING = new Set(['select-string', 'sls']);
/** Whether `verb` (as `commandReads` reports it) is one of the searches, which show the lines that match and not the page. */
export const isSearchVerb = (verb) => verb === 'search' || SEARCHING.has(verb) || POWERSHELL_SEARCHING.has(verb);
/** A search that prints a count, the names of files, or nothing, shows no line of the page. */
const SILENT_LONG = new Set(['--count', '--files-with-matches', '--files-without-match', '--quiet', '--silent', '--files', '--count-matches']);
const silentSearch = (words, powershell) => words.some((w) => (powershell
  ? /^-quiet$/i.test(w)
  : SILENT_LONG.has(w) || (/^-[A-Za-z0-9]+$/.test(w) && /[clLq]/.test(w))));

/**
 * The corpus pages a command line shows, each with the verb that showed it, and where the shell's folder stands after it.
 * `cwd` is the folder the earlier calls left (`null` when none is known); `rowCwd` is the folder the session file records for the call. A
 * relative file argument is read from each of those, since a transcript may carry either; a `cd` in the line moves the folder for what
 * follows it, as the shell does, but not inside `( … )` or on either side of a `|`, which run in a subshell. `{ reads, cwd, moved, heredocs }`;
 * `moved` is true when the line changed the folder for the calls that follow, and `cwd` is then where it stands (or `null`, not known).
 * `searched` is the folder each search that prints lines (`grep`, `rg`, `Select-String`, without `-c`, `-l`, `-L` or `-q`) ran in: the lines such a
 * search prints over a folder or several files begin with the path of their page (`pagesInLines`). Pure.
 */
export function commandReads(command, { powershell = false, cwd = null, rowCwd = null } = {}) {
  const { segments, heredocs } = shellSegments(command, { powershell });
  const showing = powershell ? POWERSHELL_SHOWING : SHOWING;
  const searching = powershell ? POWERSHELL_SEARCHING : SEARCHING;
  const reads = new Map();
  const searched = [];                                              // the folder each search that prints lines ran in
  let at = cwd ?? rowCwd ?? null;
  let moved = false;
  const saved = [];
  segments.forEach((seg, k) => {
    while (saved.length > seg.depth) at = saved.pop();             // out of a subshell: the folder it had
    while (saved.length < seg.depth) saved.push(at);               // into one
    const words = seg.words;
    let first = 0;
    if (!powershell) while (first < words.length && /^[A-Za-z_][A-Za-z0-9_]*=/.test(words[first])) first += 1;      // FOO=1 cat page.md
    const rest = words.slice(first);
    const change = cdOf(rest, { powershell });
    if (change) {
      const piped = seg.op === '|' || segments[k + 1]?.op === '|';
      if (!piped && seg.depth === 0) { at = change.dir === null ? null : joinPath(at, change.dir); moved = true; }
      else if (!piped) at = change.dir === null ? null : joinPath(at, change.dir);
      return;
    }
    const verb = basename(rest[0]);
    const key = powershell ? verb.toLowerCase() : verb;
    const searchesFiles = searching.has(key);
    if (!showing.has(key) && !searchesFiles) return;
    if (searchesFiles && silentSearch(rest.slice(1), powershell)) return;
    if (searchesFiles) searched.push(at);
    let skipPattern = searchesFiles && !powershell && !rest.slice(1).some((w) => w === '-e' || w === '-f' || w.startsWith('--regexp'));
    let afterE = false;
    for (const w of rest.slice(1)) {
      if (w.startsWith('-')) { afterE = !powershell && (w === '-e' || w === '-f'); continue; }
      if (afterE) { afterE = false; continue; }                                                              // the value of -e: a pattern, not a file
      if (skipPattern) { skipPattern = false; continue; }                                                    // grep PATTERN FILE: the first word is the pattern
      const arg = powershell ? w : w.replace(/^<+/, '');                                                    // cat <page.md
      for (const base of [at, rowCwd === at ? null : rowCwd]) {
        const page = pageAt(base === null || ABSOLUTE.test(posix(arg)) ? arg : joinPath(base, arg));
        if (page && !reads.has(page)) reads.set(page, key);
      }
      const bare = pageAt(arg);                                                                              // `vendor/ServiceNowDocs/markdown/….md`, from wherever
      if (bare && !reads.has(bare)) reads.set(bare, key);
    }
  });
  while (saved.length) at = saved.pop();                           // the line ended inside a subshell: its folder goes with it
  return { reads, cwd: at, moved, heredocs, searched };
}

/** The corpus pages an MCP call's input shows: a file it names by `path`, `file_path` or `paths`, and what the shell in it shows. */
export function pagesOfInput(input) {
  const files = [];
  for (const key of ['path', 'file_path']) if (typeof input?.[key] === 'string') files.push(input[key]);
  if (Array.isArray(input?.paths)) for (const f of input.paths) if (typeof f === 'string') files.push(f);
  const pages = new Set();
  for (const f of files) { const page = pageAt(f); if (page) pages.add(page); }
  const lines = [];
  if (typeof input?.command === 'string') lines.push(input.command);
  if (Array.isArray(input?.commands)) for (const c of input.commands) if (typeof c?.command === 'string') lines.push(c.command);
  if (input?.language === 'shell' && typeof input?.code === 'string') lines.push(input.code);
  for (const line of lines) for (const page of commandReads(line).reads.keys()) pages.add(page);
  return pages;
}

/**
 * The corpus pages whose lines a search printed: the lines that begin with a page's path and then `:` or `-` (`path:12:text`, `path-12-context`,
 * `path:text`; a drive letter may come first). A path that is relative to a folder (`c_Esc.md:12:text`, from a search run inside it) is joined to
 * each of `bases`. A line that is only a path (a listing) or a count (`path:3` is read the same way, so the caller does not pass one) names a page
 * no more than the search it came from showed. Pure.
 */
export function pagesInLines(body, bases = []) {
  const pages = new Set();
  if (typeof body !== 'string' || !body.includes('.md')) return pages;
  for (const line of body.split(/\r?\n/)) {
    const m = /^((?:[A-Za-z]:)?[^:]*?\.md)(?::|-)/.exec(line);
    if (!m) continue;
    let page = pageAt(m[1]);
    for (const base of bases) if (!page && typeof base === 'string' && base) page = pageAt(joinPath(base, m[1]));
    if (page) pages.add(page);
  }
  return pages;
}

/**
 * The corpus pages a Grep in content mode showed: the pages on the lines it returned, and the one page it searched when `path` names a file (its
 * lines carry no path). A Grep that only lists files or counts shows no line.
 */
export function pagesOfGrep(input, body, rowCwd = null) {
  const pages = new Set();
  if (input?.output_mode !== 'content' || typeof body !== 'string' || !body.trim()) return pages;
  const one = pageAt(input.path);
  if (one) pages.add(one);
  for (const page of pagesInLines(body, [input.path, rowCwd])) pages.add(page);
  return pages;
}

// ---- one thread of rows -----------------------------------------------------------------------------------------------------------------
/** Tools that write a file, and the input fields that hold the text written. */
const WRITERS = Object.freeze({
  Write: (i) => (typeof i.content === 'string' ? [i.content] : []),
  Edit: (i) => (typeof i.new_string === 'string' ? [i.new_string] : []),
  MultiEdit: (i) => (Array.isArray(i.edits) ? i.edits.map((e) => e?.new_string).filter((x) => typeof x === 'string') : []),
  NotebookEdit: (i) => (typeof i.new_source === 'string' ? [i.new_source] : []),
});

/**
 * Walks the rows of ONE thread (the session's own, or one sub-agent's) in order and returns what reached it and what it wrote:
 * `{ reached: Map(page → { route, at }), writes: [{ tool, text, at }], calls: Map(tool_use id → Map(page → route)) }`, `at` being the row of the
 * call; `calls` says which pages each shell call showed, by the verb that showed it (`search` for the lines a search printed). A call counts only
 * when its result came back without `is_error`. The shell's folder is tracked across the calls of the thread: a `cd` that succeeded moves it. Nothing is cut at a
 * compaction boundary: a page read before it was read. Pure.
 */
export function walkThread(rows) {
  const uses = new Map();
  const reached = new Map();
  const writes = [];
  const calls = new Map();
  let cwd = null;
  const reach = (page, route, at) => { if (!reached.has(page)) reached.set(page, { route, at }); };
  (Array.isArray(rows) ? rows : []).forEach((r, at) => {
    if (!r || typeof r !== 'object') return;
    if (r.type === 'assistant') {
      for (const b of blocksOf(r)) if (b.type === 'tool_use' && b.id) uses.set(b.id, { name: b.name, input: b.input ?? {}, rowCwd: typeof r.cwd === 'string' ? r.cwd : null, at });
      return;
    }
    if (r.type !== 'user') return;
    for (const b of blocksOf(r)) {
      if (b.type !== 'tool_result' || b.is_error === true) continue;
      const use = uses.get(b.tool_use_id);
      if (!use) continue;
      const { name, input } = use;
      if (name === 'Read') { const page = pageAt(input.file_path); if (page) reach(page, 'Read', use.at); continue; }
      if (name === 'Bash' || name === 'PowerShell') {
        const done = commandReads(input.command, { powershell: name === 'PowerShell', cwd, rowCwd: use.rowCwd });
        const shown = new Map(done.reads);
        if (done.searched.length) for (const page of pagesInLines(textOfResult(b), [...done.searched, use.rowCwd])) if (!shown.has(page)) shown.set(page, 'search');
        for (const [page, verb] of shown) reach(page, verb, use.at);
        if (shown.size) calls.set(b.tool_use_id, shown);
        if (done.moved) cwd = done.cwd;
        for (const h of done.heredocs) if (h.writes && h.body) writes.push({ tool: name, text: h.body, at: use.at });
        continue;
      }
      if (name === 'Grep') { for (const page of pagesOfGrep(input, textOfResult(b), use.rowCwd)) reach(page, 'Grep', use.at); continue; }
      if (typeof name === 'string' && name.startsWith('mcp__')) { for (const page of pagesOfInput(input)) reach(page, 'mcp', use.at); continue; }
      if (Object.hasOwn(WRITERS, name)) for (const text of WRITERS[name](input)) writes.push({ tool: name, text, at: use.at });
    }
  });
  return { reached, writes, calls };
}
