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
// (`ls`, `find`, `wc`, `stat`) or only counts and names (`grep -c`, `-l`, `-L`, `-q`); a directory; a page that is not the one named.
//
// What the call does not name (the architect's ruling of 2026-11-16: the pre-registration has a guard of 0 false "unread" claims, and a missed
// unread citation costs less than telling the model it did not open a page it read):
//   - a glob or a brace list in a viewer's arguments is EXPANDED, against the file system the caller gives (`glob`, lib/docs/glob-fs.mjs), from the
//     folder the shell was in; `sed -n 1,40p {a,b}.md` is two pages whether or not either is there, since the shell would try both;
//   - what cannot be resolved (a variable or a substitution in a viewer's words, a `for` or `while` loop, `xargs`, `find -exec`, `eval`, another
//     shell, an interpreter of another language, `git show`, a PowerShell pipe into Get-Content, a folder lost by a `cd` the call cannot tell) is
//     returned as TEXT, `unresolved`, and the caller counts every page whose bare file name is in it as shown (`mentionsPage`); when the call has a
//     viewer verb the pages named in its OUTPUT count too (a loop over `$(ls dir)` that heads every file);
//   - a call that FAILED may still have printed part of what it was asked for (`cat a.md missing.md`): when it has a viewer verb, the pages it names
//     that are on disk (`pageExists`, the caller's) count as shown, and so do its unresolved text and output; a failed call with no viewer shows nothing.
//
// PURE: every function reads its arguments and nothing else (no file, no clock, no global); the file system is the caller's `glob`.
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

/**
 * Is `name` (a page's bare file name, `c_Esc.md`) in `text` as a whole name? Not inside a longer one: not after a letter, a digit, `_`, `.` or `-`, and
 * not before a letter, a digit, `_`, `-` or a `.` and a letter or a digit (`c_Esc.md.bak`). This is how an unresolved call (a loop, `xargs`, code of
 * another language) shows a page. Pure.
 */
export function mentionsPage(text, name) {
  if (typeof text !== 'string' || typeof name !== 'string' || !name) return false;
  for (let at = text.indexOf(name); at >= 0; at = text.indexOf(name, at + 1)) {
    const before = text[at - 1];
    const after = text[at + name.length];
    const next = text[at + name.length + 1];
    if (before !== undefined && /[A-Za-z0-9_.-]/.test(before)) continue;
    if (after !== undefined && (/[A-Za-z0-9_-]/.test(after) || (after === '.' && next !== undefined && /[A-Za-z0-9]/.test(next)))) continue;
    return true;
  }
  return false;
}

// ---- the shell: words, operators, depth, expansions, and the here-documents that are text and not commands --------------------------------

/** Does a `$` before this character begin an expansion the shell would make (`$F`, `${F}`, `$(…)`, `$1`, `$@`)? */
const isExpansionStart = (ch) => ch !== undefined && /[A-Za-z_{(0-9@*#?!$-]/.test(ch);

/**
 * The simple commands of a command line, each `{ words, op, depth, x }`: its words with the quotes taken off, the operator that came before it
 * (`''` for the first, else `&&`, `||`, `;`, `|`, `&` or a new line, the parentheses left out), how many `(` it is inside, and `x`, whether a word of it
 * has an expansion the shell would make (a `$name`, `${…}` or `$(…)` outside single quotes, or a back-tick: the outer command of a substitution has it).
 * The line is cut at an unquoted `|`, `;`, `&`, `(`, `)` or newline, so a `;` inside `sed -n '1,40p;50,60p'` cuts nothing and `x=$(cat f)` has a `cat`
 * in it; for sh a back-tick cuts too, and `2>&1`, `>&2` and `&>f` are not cuts. It is not a shell: nothing is expanded. A here-document is not read as
 * commands: its body is returned in `heredocs`, `{ body, writes, owner }`, where `writes` says that its line redirects to a file (`> f`, `>> f`) or goes
 * through `tee`, and `owner` is the words of the command it feeds. `bare` is the line with those bodies left out. With `powershell` the line is read as
 * PowerShell reads it: a back-slash is a letter (it parts a Windows path), the back-tick escapes the next character, a quote is written twice to be
 * itself, a comma parts the items of a list, and a here-string (`@'` … `'@`) is a body like a here-document. Pure.
 */
export function shellSegments(command, { powershell = false } = {}) {
  const s = String(command ?? '');
  const escape = powershell ? '`' : '\\';
  const segments = [];
  const heredocs = [];
  const cuts = [];                                                // [from, to) of each body, to give the line without them
  let words = [];
  let word = '';
  let started = false;                                            // `""` is a word too
  let wordX = false;                                              // this word has an expansion
  let segX = false;                                               // a word of this segment has one
  let quote = '';
  let seps = '';                                                  // the separators seen since the last segment ended
  let depth = 0;
  let open = { op: '', depth: 0 };                                // how the segment being built began
  let pending = [];                                               // here-documents whose body starts on the next line
  let lineStart = 0;                                              // the first segment of the current line
  let backtick = false;                                           // inside a `…` substitution (sh)
  const endWord = () => {
    if (started) {
      if (words.length === 0) { open = { op: seps.replace(/[()]/g, ''), depth }; seps = ''; }
      words.push(word);
      if (wordX) segX = true;
    }
    word = ''; started = false; wordX = false;
  };
  const endSegment = (sep = '') => {
    endWord();
    if (words.length) segments.push({ words, op: open.op, depth: open.depth, x: segX });
    words = []; segX = false; seps += sep;
  };
  const redirects = (ws) => ws.some((w) => /^(?:1|&)?>>?(?![&|])/.test(w)) || ws.some((w) => /(?:^|[\\/])tee$/.test(w));
  for (let i = 0; i < s.length; i += 1) {
    const c = s[i];
    const next = s[i + 1];
    if (quote) {
      if (c === quote) {
        if (powershell && next === quote) { word += c; i += 1; }                                   // '' and "" are one quote
        else quote = '';
      } else if (c === escape && next !== undefined && (powershell ? quote === '"' : quote === '"' && '"\\$`'.includes(next))) { word += next; i += 1; }
      else {
        if (quote === '"' && ((c === '$' && isExpansionStart(next)) || (!powershell && c === '`'))) wordX = true;
        word += c;
      }
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
      heredocs.push({ body: body.join('\n'), writes: /Set-Content|Add-Content|Out-File|\bsc\b|>>?\s*\S/i.test(s), owner: words.slice() });
      cuts.push([from, Math.min(at, s.length)]);
      word = '@'; started = true;                                 // the here-string stands for one word
      i = Math.max(at - 2, i);
    } else if (!powershell && c === '<' && next === '<' && s[i + 2] === '<') { word += '<<<'; started = true; i += 2; }      // a here-string feeds text, not a file
    else if (!powershell && c === '<' && next === '<') {
      let j = i + 2;
      let strip = false;
      if (s[j] === '-') { strip = true; j += 1; }
      while (s[j] === ' ' || s[j] === '\t') j += 1;
      let delimiter = '';
      if (s[j] === "'" || s[j] === '"') { const q = s[j]; j += 1; while (j < s.length && s[j] !== q) { delimiter += s[j]; j += 1; } j += 1; }
      else { while (j < s.length && !/[\s;|&()<>]/.test(s[j])) { if (s[j] === '\\') j += 1; delimiter += s[j] ?? ''; j += 1; } }
      if (delimiter) { pending.push({ delimiter, strip, owner: words.concat(started ? [word] : []) }); i = j - 1; }
      else { word += c; started = true; }
    } else if (c === '\n' && pending.length) {
      const line = segments.slice(lineStart).flatMap((g) => g.words).concat(words, started ? [word] : []);
      const writes = redirects(line);
      endSegment('\n');
      lineStart = segments.length;
      let pos = i + 1;
      const from = pos;
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
        heredocs.push({ body: body.join('\n'), writes, owner: h.owner });
      }
      cuts.push([from, Math.min(pos, s.length)]);
      pending = [];
      i = pos - 1;
    } else if (c === '&' && (s[i - 1] === '>' || s[i - 1] === '<' || next === '>')) { word += c; started = true; }                  // 2>&1, >&2, &>file
    else if (c === '|' || c === ';' || c === '&' || c === '\n' || c === '(' || c === ')' || (!powershell && c === '`')) {
      if (!powershell && c === '`') { if (!backtick) segX = true; backtick = !backtick; }          // the command that holds a substitution has an expansion
      endSegment(c);
      if (c === '\n') lineStart = segments.length;
      if (c === '(') depth += 1;
      else if (c === ')') depth = Math.max(0, depth - 1);
    } else if (c === ' ' || c === '\t' || c === '\r' || (powershell && c === ',')) endWord();
    else {
      if (c === '$' && isExpansionStart(next)) wordX = true;
      word += c; started = true;
    }
  }
  endSegment();
  let bare = s;
  if (cuts.length) {
    bare = '';
    let prev = 0;
    for (const [a, b] of cuts) { bare += s.slice(prev, a); prev = Math.max(prev, b); }
    bare += s.slice(prev);
  }
  return { segments, heredocs, bare };
}

/** The words of each simple command, as `shellSegments` cuts them (the shape of ARC-09-C267's first readers). */
export const shellWords = (command, opts) => shellSegments(command, opts).segments.map((g) => g.words);

/** Does any command of the line have an expansion the shell would make outside single quotes? Pure. */
export const hasExpansion = (command, opts) => shellSegments(command, opts).segments.some((g) => g.x);

/**
 * The words a brace expression stands for, in the order bash gives them: `c_{Esc,Other}.md`, nested lists, `{1..3}` and `{a..c}` (up or down). A
 * `${variable}`, a lone `{a}` and an unclosed brace are left as written. At most `limit` words: the rest are not made. Pure.
 */
export function expandBraces(word, limit = 256) {
  const out = [];
  const splitTop = (inner) => {
    const parts = [];
    let depthB = 0;
    let cur = '';
    for (let i = 0; i < inner.length; i += 1) {
      const c = inner[i];
      if (c === '\\') { cur += c + (inner[i + 1] ?? ''); i += 1; continue; }
      if (c === '{') depthB += 1;
      if (c === '}') depthB -= 1;
      if (c === ',' && depthB === 0) { parts.push(cur); cur = ''; } else cur += c;
    }
    parts.push(cur);
    return parts;
  };
  const range = (inner) => {
    let m = /^(-?\d+)\.\.(-?\d+)$/.exec(inner);
    if (m) {
      const a = Number(m[1]);
      const b = Number(m[2]);
      const step = a <= b ? 1 : -1;
      const items = [];
      for (let n = a; step > 0 ? n <= b : n >= b; n += step) { items.push(String(n)); if (items.length > limit) break; }
      return items;
    }
    m = /^([A-Za-z])\.\.([A-Za-z])$/.exec(inner);
    if (m) {
      const a = m[1].charCodeAt(0);
      const b = m[2].charCodeAt(0);
      const step = a <= b ? 1 : -1;
      const items = [];
      for (let n = a; step > 0 ? n <= b : n >= b; n += step) items.push(String.fromCharCode(n));
      return items;
    }
    return null;
  };
  const go = (w) => {
    if (out.length >= limit) return;
    let depthB = 0;
    let start = -1;
    for (let i = 0; i < w.length; i += 1) {
      const c = w[i];
      if (c === '\\') { i += 1; continue; }
      if (c === '$' && w[i + 1] === '{') {                          // ${variable}: not a list, skipped whole
        let d = 0;
        for (let j = i + 1; j < w.length; j += 1) {
          if (w[j] === '{') d += 1;
          else if (w[j] === '}') { d -= 1; if (d === 0) { i = j; break; } }
        }
        continue;
      }
      if (c === '{') { if (depthB === 0) start = i; depthB += 1; }
      else if (c === '}' && depthB > 0) {
        depthB -= 1;
        if (depthB === 0) {
          const inner = w.slice(start + 1, i);
          const alts = splitTop(inner);
          const items = alts.length > 1 ? alts : range(inner);
          if (items) { for (const item of items) go(`${w.slice(0, start)}${item}${w.slice(i + 1)}`); return; }
        }
      }
    }
    out.push(w);
  };
  go(String(word ?? ''));
  return out;
}

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
/**
 * The commands that print the lines of the files they are given, and the filters that print them again, cut or ordered. `ls`, `find`, `wc` and
 * `stat` list or count: they show no page.
 */
const SHOWING = new Set(['cat', 'head', 'tail', 'sed', 'nl', 'less', 'more', 'awk', 'gawk', 'mawk', 'nawk', 'bat', 'cut', 'fold', 'tac', 'rev', 'fmt', 'column', 'expand', 'sort', 'uniq', 'paste']);
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

// What cannot be resolved from the words of a call: the call is then returned as text (`unresolved`), for the names rule.
/** Loops, and the commands that run what they are given or read it from a pipe or a list. */
const LOOPS = new Set(['for', 'while', 'until', 'select']);
const INDIRECT = new Set(['xargs', 'parallel', 'eval', 'source', '.', 'sh', 'bash', 'zsh', 'dash', 'ksh', 'fish', 'csh', 'tcsh', 'busybox']);
/** Another language, and the other shells a command can start. */
const INTERPRETER = /^(?:python[\d.]*|pypy[\d.]*|py|node(?:js)?|deno|bun|perl[\d.]*|ruby|php[\d.]*|lua(?:jit)?|rscript|julia|swift|osascript|java|groovy|tclsh|expect|pwsh|powershell(?:\.exe)?|cmd(?:\.exe)?)$/i;
const FIND_EXEC = new Set(['-exec', '-execdir', '-ok', '-okdir']);
/** The git subcommands that print what is in a file. */
const GIT_SHOWS = new Set(['show', 'cat-file', 'diff', 'blame', 'annotate', 'log', 'whatchanged', 'grep', 'archive']);
const POWERSHELL_OPAQUE = new Set(['foreach-object', '%', 'foreach', 'where-object', '?', 'invoke-expression', 'iex', 'invoke-command', 'icm', 'start-process', 'saps', 'invoke-item', 'ii']);

/** The reserved words that come before a command, and the commands that start another with their own words in front. */
const KEYWORDS = new Set(['do', 'then', 'else', 'elif', '!', '{', 'time', 'coproc']);
const WRAPPERS = new Set(['command', 'builtin', 'exec', 'env', 'nice', 'nohup', 'sudo', 'doas', 'timeout', 'stdbuf', 'ionice', 'caffeinate', 'unbuffer']);
const ASSIGN = /^[A-Za-z_][A-Za-z0-9_]*=/;

/** The words of a command from its verb on: the reserved words, assignments and wrappers (`nice -n 10`, `timeout 5`, `env A=b`) in front are left out. */
function unwrap(words, powershell) {
  let i = 0;
  for (;;) {
    while (i < words.length && (KEYWORDS.has(words[i]) || (!powershell && ASSIGN.test(words[i])))) i += 1;
    if (i >= words.length || !WRAPPERS.has(basename(words[i]))) break;
    i += 1;
    while (i < words.length && (words[i].startsWith('-') || /^\d+(?:\.\d+)?[smhd]?$/.test(words[i]) || ASSIGN.test(words[i]))) i += 1;
  }
  return words.slice(i);
}

/** Does a word of this command hold a viewer or a search verb (`xargs head -2`, `bash -c "cat x.md"`, `find . -exec cat {} \;`)? A runner that is given one reads with it. */
function givesViewer(rest, showing, searching, powershell) {
  for (const w of rest.slice(1)) {
    for (const token of w.split(/[\s;|&()]+/)) {
      const key = powershell ? token.toLowerCase() : token;
      if (showing.has(key) || searching.has(key)) return true;
    }
  }
  return false;
}

/** Is this command one whose reading cannot be told from its words? `rest` are its words from the verb on, `x` whether the segment has an expansion. */
function opaqueVerb(key, rest, powershell, x) {
  if (x && /[$`]/.test(rest[0])) return true;                                        // a verb the shell builds could be anything
  if (INTERPRETER.test(key)) return true;
  if (powershell) return POWERSHELL_OPAQUE.has(key) || rest[0].startsWith('[') || rest[0].startsWith('$') || rest[0].includes('::');
  if (LOOPS.has(key) || INDIRECT.has(key)) return true;
  if (key === 'find' && rest.some((w) => FIND_EXEC.has(w))) return true;
  if (key === 'git' && rest.some((w) => GIT_SHOWS.has(w))) return true;
  return false;
}

/**
 * The corpus pages a command line shows, each with the verb that showed it, where the shell's folder stands after it, and what the call leaves
 * unresolved. `cwd` is the folder the earlier calls left (`null` when none is known), `lost` says that a `cd` the call could not tell took it away,
 * `rowCwd` is the folder the session file records for the call, `glob(pattern, { ci })` is the file system (a function of an absolute posix pattern to
 * the paths it expands to, or none). A relative file argument is read from each of those; a `cd` in the line moves the folder for what follows it, as the
 * shell does, but not inside `( … )` or on either side of a `|`, which run in a subshell. A brace list in a viewer's arguments is expanded (not in
 * PowerShell, which has none); a glob is asked of `glob`, only under the corpus and only when the pattern is absolute.
 * `{ reads, cwd, lost, moved, heredocs, searched, unresolved, viewer }`: `viewer` says that the call has a viewer or a search that prints lines, or a
 * runner that is given one (`xargs head`, `bash -c "cat x.md"`), so that what it printed may name pages; `moved` is true when the line changed the folder for the calls that follow, and `cwd`
 * (`null` when not known) and `lost` are where it stands then. `searched` is the folder each search that prints lines (`grep`, `rg`, `Select-String`,
 * without `-c`, `-l`, `-L` or `-q`) ran in: the lines such a search prints over a folder or several files begin with the path of their page
 * (`pagesInLines`). `unresolved` is a list of texts, each of which may show a page the call does not name: a relative `.md` name when the folder is not
 * known, a pattern nothing answered, and the whole call (without the here-documents that are text a command writes) when a loop, `xargs`, an
 * interpreter, `git show`, a pipe into Get-Content or an expansion in a viewer's words made it unreadable. Pure.
 */
export function commandReads(command, { powershell = false, cwd = null, rowCwd = null, lost = false, glob = null } = {}) {
  const { segments, heredocs, bare } = shellSegments(command, { powershell });
  const showing = powershell ? POWERSHELL_SHOWING : SHOWING;
  const searching = powershell ? POWERSHELL_SEARCHING : SEARCHING;
  const reads = new Map();
  const searched = [];
  const unresolved = [];
  let at = lost ? null : (cwd ?? rowCwd ?? null);
  let folderLost = Boolean(lost);
  let moved = false;
  let opaque = false;                                              // the call has a command whose reading cannot be told
  let viewer = false;                                              // the call has a viewer or a search that prints lines, or a runner that is given one
  let flagged = false;                                             // a viewer or a search of the call has an expansion in its words
  const saved = [];
  const add = (page, verb) => { if (!reads.has(page)) reads.set(page, verb); };
  const consider = (raw, key) => {
    for (const arg of powershell ? [raw] : expandBraces(raw)) {
      const globby = /[*?[]/.test(arg);
      const absolute = ABSOLUTE.test(posix(arg));
      const bases = [];
      if (!absolute) {
        if (at !== null) bases.push(at);
        if (rowCwd !== null && rowCwd !== at) bases.push(rowCwd);
        if (bases.length === 0) bases.push(null);
      }
      let found = false;
      for (const base of absolute ? [null] : bases) {
        const full = absolute || base === null ? arg : joinPath(base, arg);
        if (!globby) {
          const page = pageAt(full);
          if (page) { add(page, key); found = true; }
        } else if (glob && ABSOLUTE.test(posix(full)) && /ServiceNowDocs\/markdown(?:\/|$)/.test(posix(full))) {
          for (const file of glob(posix(full), { ci: powershell })) {
            const page = pageAt(file);
            if (page) { add(page, key); found = true; }
          }
        }
      }
      const typed = globby ? null : pageAt(arg);                  // `vendor/ServiceNowDocs/markdown/….md`, from wherever
      if (typed) { add(typed, key); found = true; }
      if (!found && (globby || (at === null && /\.md$/i.test(arg)))) unresolved.push(arg);
    }
  };
  segments.forEach((seg, k) => {
    while (saved.length > seg.depth) [at, folderLost] = saved.pop();         // out of a subshell: the folder it had
    while (saved.length < seg.depth) saved.push([at, folderLost]);           // into one
    const rest = unwrap(seg.words, powershell);
    if (rest.length === 0) return;
    const change = cdOf(rest, { powershell });
    if (change) {
      const piped = seg.op === '|' || segments[k + 1]?.op === '|';
      if (!piped) {
        const known = change.dir !== null && (ABSOLUTE.test(posix(change.dir)) || !folderLost);
        at = known ? joinPath(at, change.dir) : null;
        folderLost = !known;
        if (seg.depth === 0) moved = true;
      }
      return;
    }
    const key = powershell ? basename(rest[0]).toLowerCase() : basename(rest[0]);
    if (opaqueVerb(key, rest, powershell, seg.x)) { opaque = true; if (givesViewer(rest, showing, searching, powershell)) viewer = true; return; }
    const showsLines = showing.has(key);
    const searchesFiles = searching.has(key);
    if (!showsLines && !searchesFiles) return;
    if (searchesFiles && silentSearch(rest.slice(1), powershell)) return;
    viewer = true;
    if (seg.x) flagged = true;
    if (searchesFiles) searched.push(at);
    const operands = rest.slice(1).filter((w) => !w.startsWith('-'));
    if (powershell && showsLines && operands.length === 0 && seg.op === '|') { opaque = true; return; }    // Get-Content reads what the pipe gives it
    let skipPattern = searchesFiles && !powershell && !rest.slice(1).some((w) => w === '-e' || w === '-f' || w.startsWith('--regexp'));
    let afterE = false;
    for (const w of rest.slice(1)) {
      if (w.startsWith('-')) { afterE = !powershell && (w === '-e' || w === '-f'); continue; }
      if (afterE) { afterE = false; continue; }                                                              // the value of -e: a pattern, not a file
      if (skipPattern) { skipPattern = false; continue; }                                                    // grep PATTERN FILE: the first word is the pattern
      consider(powershell ? w : w.replace(/^<+/, ''), key);                                                 // cat <page.md
    }
  });
  while (saved.length) [at, folderLost] = saved.pop();                // the line ended inside a subshell: its folder goes with it
  if (opaque || flagged) {
    const scripts = [];
    for (const h of heredocs) {
      const owner = unwrap(h.owner ?? [], powershell);
      if (owner.length && opaqueVerb(powershell ? basename(owner[0]).toLowerCase() : basename(owner[0]), owner, powershell, false)) scripts.push(h.body);
    }
    unresolved.push([bare, ...scripts].join('\n'));
  }
  return { reads, cwd: at, lost: folderLost, moved, heredocs, searched, unresolved, viewer };
}

/**
 * The corpus pages an MCP call's input shows, and what it leaves unresolved: a file it names by `path`, `file_path` or `paths`, what the shell in it
 * shows (`command`, the `commands` of a batch, shell `code`), and the `code` of any other language as text, for the names rule. `{ pages, unresolved, viewer }`.
 */
export function inputReads(input, { cwd = null, rowCwd = null, glob = null } = {}) {
  const pages = new Set();
  const unresolved = [];
  let viewer = false;
  const files = [];
  for (const key of ['path', 'file_path']) if (typeof input?.[key] === 'string') files.push(input[key]);
  if (Array.isArray(input?.paths)) for (const f of input.paths) if (typeof f === 'string') files.push(f);
  for (const f of files) { const page = pageAt(f); if (page) pages.add(page); }
  const lines = [];
  if (typeof input?.command === 'string') lines.push(input.command);
  if (Array.isArray(input?.commands)) for (const c of input.commands) if (typeof c?.command === 'string') lines.push(c.command);
  if (typeof input?.code === 'string' && input.code) {
    if (input.language === 'shell') lines.push(input.code);
    else if (typeof input.language === 'string') unresolved.push(input.code);
  }
  for (const line of lines) {
    const done = commandReads(line, { cwd, rowCwd, glob });
    for (const page of done.reads.keys()) pages.add(page);
    unresolved.push(...done.unresolved);
    if (done.viewer) viewer = true;
  }
  return { pages, unresolved, viewer };
}

/** The corpus pages an MCP call's input shows: a file it names by `path`, `file_path` or `paths`, and what the shell in it shows. */
export const pagesOfInput = (input, opts) => inputReads(input, opts).pages;

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

/** The most of an output kept as text for the names rule. */
const OUTPUT_CAP = 500_000;

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
 * `{ reached: Map(page → { route, at }), writes: [{ tool, text, at }], calls: Map(tool_use id → Map(page → route)), opaque: [{ text, at }] }`, `at`
 * being the row of the call; `calls` says which pages each shell call showed, by the verb that showed it (`search` for the lines a search printed);
 * `opaque` is the text of each call that may have shown a page without naming it (`commandReads`' `unresolved`, and the code of another language in an
 * MCP call), for the names rule, and, for a call of those that has a viewer verb, the first 500,000 characters of its output. A call counts only when its
 * result came back without `is_error`; except that a Bash or PowerShell call with a viewer verb that FAILED may have printed part of what it was asked
 * for (`cat a.md missing.md`): the pages it names that `pageExists(page)` says are on disk are reached, and its unresolved text and its output are kept
 * apart in `failedOpaque`, for the caller to use only for a page that is on disk. A failed call with no viewer shows nothing, and no failed call moves the
 * shell's folder or writes a file. The folder is tracked across the calls of the thread: a `cd` that succeeded moves it, and one the call cannot tell
 * loses it until a `cd` it can. `glob` is the file system for patterns. Nothing is cut at a compaction boundary: a page read before it was read. Pure.
 */
export function walkThread(rows, { glob = null, pageExists = null } = {}) {
  const uses = new Map();
  const reached = new Map();
  const writes = [];
  const calls = new Map();
  const opaque = [];
  const failedOpaque = [];
  let cwd = null;
  let lost = false;
  const onDisk = typeof pageExists === 'function' ? pageExists : () => false;
  const output = (b) => posix(textOfResult(b)).slice(0, OUTPUT_CAP);
  const reach = (page, route, at) => { if (!reached.has(page)) reached.set(page, { route, at }); };
  (Array.isArray(rows) ? rows : []).forEach((r, at) => {
    if (!r || typeof r !== 'object') return;
    if (r.type === 'assistant') {
      for (const b of blocksOf(r)) if (b.type === 'tool_use' && b.id) uses.set(b.id, { name: b.name, input: b.input ?? {}, rowCwd: typeof r.cwd === 'string' ? r.cwd : null, at });
      return;
    }
    if (r.type !== 'user') return;
    for (const b of blocksOf(r)) {
      if (b.type !== 'tool_result') continue;
      const failed = b.is_error === true;
      const use = uses.get(b.tool_use_id);
      if (!use) continue;
      const { name, input } = use;
      if (failed) {
        if (name !== 'Bash' && name !== 'PowerShell') continue;
        const done = commandReads(input.command, { powershell: name === 'PowerShell', cwd, rowCwd: use.rowCwd, lost, glob });
        if (!done.viewer) continue;
        for (const [page, verb] of done.reads) if (onDisk(page)) reach(page, verb, use.at);
        for (const text of done.unresolved) failedOpaque.push({ text: posix(text), at: use.at });
        if (done.unresolved.length) failedOpaque.push({ text: output(b), at: use.at });
        continue;
      }
      if (name === 'Read') { const page = pageAt(input.file_path); if (page) reach(page, 'Read', use.at); continue; }
      if (name === 'Bash' || name === 'PowerShell') {
        const done = commandReads(input.command, { powershell: name === 'PowerShell', cwd, rowCwd: use.rowCwd, lost, glob });
        const shown = new Map(done.reads);
        if (done.searched.length) for (const page of pagesInLines(textOfResult(b), [...done.searched, use.rowCwd])) if (!shown.has(page)) shown.set(page, 'search');
        for (const [page, verb] of shown) reach(page, verb, use.at);
        if (shown.size) calls.set(b.tool_use_id, shown);
        if (done.moved) { cwd = done.cwd; lost = done.lost; }
        for (const text of done.unresolved) opaque.push({ text: posix(text), at: use.at });
        if (done.viewer && done.unresolved.length) opaque.push({ text: output(b), at: use.at });
        for (const h of done.heredocs) if (h.writes && h.body) writes.push({ tool: name, text: h.body, at: use.at });
        continue;
      }
      if (name === 'Grep') { for (const page of pagesOfGrep(input, textOfResult(b), use.rowCwd)) reach(page, 'Grep', use.at); continue; }
      if (typeof name === 'string' && name.startsWith('mcp__')) {
        const done = inputReads(input, { rowCwd: use.rowCwd, glob });
        for (const page of done.pages) reach(page, 'mcp', use.at);
        for (const text of done.unresolved) opaque.push({ text: posix(text), at: use.at });
        if (done.viewer && done.unresolved.length) opaque.push({ text: output(b), at: use.at });
        continue;
      }
      if (Object.hasOwn(WRITERS, name)) for (const text of WRITERS[name](input)) writes.push({ tool: name, text, at: use.at });
    }
  });
  return { reached, writes, calls, opaque, failedOpaque };
}
