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
//     that are on disk (`pageExists`, the caller's) count as shown, and so do its unresolved text and output; a failed call with no viewer shows nothing;
//   - the glob and brace WORDS of a call that cannot be resolved, or of a viewer's pattern the file system did not answer, are returned as `patterns`, and
//     `wordNamesPage` says whether one could name a page, from the page's path and file name alone and with no disk (the architect's review of #600, A1):
//     `for f in dir/c_Esc*.md`, `find . -name 'c_Esc*.md' | xargs cat`, `cd ~/x && cat c_Esc*.md` hold no page's bare name, and a pattern is not a name;
//   - a thread whose folder Claude Code resets before every Bash call (a sub-agent's, and the main thread's when it is told to) starts each call at the
//     folder its row records (`carryFolder: false`); a `cd` of one call is then not the next call's (A2).
//
// The architect's second review of #600 (2026-11-16, eight agents), items 1 to 7, in the order of the code below:
//   - a name filter of a search is taken as WRITTEN, with the case its tool gives it, and matches below the search root, wherever the shell stands: `find -name`,
//     `-path`, `-iname`, `-ipath`, `rg -g`, `--glob`, `--iglob`, `grep --include`, `fd -g`, PowerShell `-Filter` and `-Include` (`nameFiltersOf`); a regex filter of find is no
//     glob and covers what the search covers, the folder it names or every page; a negated glob and `--exclude` narrow nothing of what is read (items 1 and 2);
//   - a folder a call names under the corpus, in a call that has a content viewer, is every page below it (`{ dir }`, `corpusFolder`): `rg -l X DIR | xargs cat`,
//     `find DIR -type f | xargs cat`, `for f in $(ls DIR); do head "DIR/$f"`, a viewer word with an expansion segment by its static folder (item 3);
//   - a pattern or a folder is kept only for a call that can show lines: it has a content viewer (`cat`, `head`, `sed`, `grep` that prints lines, `Get-Content`, also given
//     to `xargs`, `find -exec` or a shell), or a command that may read a page with no viewer verb (an interpreter, `eval`, `source`, a shell, `git show`, a verb the shell
//     builds). `find … | xargs grep -l`, `… | xargs wc -l | sort | tail`, a loop that only echoes show no page; a filter given no file and fed by a pipe is no viewer (item 7);
//   - a file the session wrote and then ran (an interpreter or shell given its path, `source`, `./file`) is a SCRIPT, not a document: what it names is not a citation, and
//     the pages it names are pages it may have shown (`ranFiles`, `walkThread`'s `script`); the files outside the corpus that the session read, wrote or edited are
//     its own, and a bare mention of one is not a citation of a page of the same name (`ownFiles`) (items 4 and 5).
//
// PURE: every function reads its arguments and nothing else (no file, no clock, no global); the file system is the caller's `glob`.
import { corpusRelative } from './resolve.mjs';
import { globToRegExp } from './glob-fs.mjs';

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

/** A word with a wildcard (`* ? [`) or a brace list (`{a,b}`, `{1..3}`): `{}` of `find -exec` and `${VAR}` are neither. */
const PATTERN_WORD = /[*?[]|(?<!\$)\{[^{}]*(?:,|\.\.)[^{}]*\}/;
/** A path segment that is, or starts with, an expansion (`~`, `$DIR`, `${DIR}`, a substitution): the folders above it are not known. */
const UNKNOWN_SEGMENT = /^(?:~|\$|`)/;
/** More wildcards than this in one path segment is no command's, and the match of such a pattern is not tried (`wordNamesPage`). */
const MAX_WILDCARDS = 8;
/** A word longer than this is not a path: it is not kept as a pattern (a blob in a command line, never a glob). */
const MAX_WORD = 4096;
/** The expansions inside a segment, each one standing for some run of characters. */
const EXPANSION = /\$\{[^}]*\}|\$\([^)]*\)|\$[A-Za-z_][A-Za-z0-9_]*|`[^`]*`/g;

/**
 * Could the glob or brace word `word` of a call name the corpus page `page` (`markdown/<area>/….md`)? Decided from the two spellings alone, with no file
 * system: the word's brace lists are expanded, then its segments are matched from the LAST against the page's, a wildcard meaning what the shell gives it
 * (glob-fs.mjs, `globToRegExp`), until one is used up. A word that is used up first is relative and its folder is not known here, so what is left of the
 * page may be that folder; a page that is used up first leaves the word's folders above the corpus, whatever they are. `**` and a segment that is an
 * expansion (`~`, `$DIR`) cover the folders above them. The root, a drive letter and a word that ends in `/` (a folder) do not fit a page. `ci` is PowerShell's case-blind
 * match. Over-counting is the side chosen: a pattern of another area's folder, joined or not, is the caller's to narrow (`commandReads` joins a relative
 * word to the folder it knows). Pure.
 */
export function wordNamesPage(word, page, { ci = false } = {}) {
  if (typeof word !== 'string' || typeof page !== 'string' || !word || !page) return false;
  const want = page.split('/');
  for (const w of expandBraces(posix(word))) {
    const segs = w.split('/');
    let i = segs.length - 1;
    let j = want.length - 1;
    let fits = null;
    while (i >= 0 && j >= 0) {
      const seg = segs[i];
      if (seg === '**' || seg === '..' || UNKNOWN_SEGMENT.test(seg)) { fits = true; break; }
      if (seg === '') { fits = false; break; }                                           // the root: the page's folders do not fit above it
      if (seg === '.') { i -= 1; continue; }
      // A segment with more wildcards than any real command has can take exponential time to refuse a name: it is taken to match (the side chosen).
      if ((seg.match(/[*?[]/g) ?? []).length <= MAX_WILDCARDS && !globToRegExp(seg.replace(EXPANSION, '*'), { ci }).test(want[j])) { fits = false; break; }
      i -= 1; j -= 1;
    }
    if (fits === true || (fits === null && (j < 0 || i < 0))) return true;
  }
  return false;
}

/**
 * The glob and brace tokens, with a literal `.md`, inside a text a word-by-word reading cannot see into: the code of another language, the script a
 * here-document feeds an interpreter, a quoted script (`python3 -c "glob.glob('…/c_Esc*.md')"`). As written, in order, without duplicates. Pure.
 */
export function patternsInText(text) {
  const out = new Set();
  for (const m of String(text ?? '').matchAll(/[A-Za-z0-9_.\-/\\~$@%+:{}[\]*?,!^]+/g)) {
    const token = m[0].replace(/^[,:]+|[,:]+$/g, '');
    if (token && token.length <= MAX_WORD && /\.md/i.test(token) && PATTERN_WORD.test(token)) out.add(token);
  }
  return [...out];
}

/**
 * A word with a character no path or glob holds (a space, a quote, a parenthesis, `=`, `;`, `<`, `>`, `|`, `&`): it is text, a script or a message, and not a path.
 * The characters are the ones `patternsInText` reads a token from; a word with one is read for the tokens in it and not as a pattern or a folder.
 */
const NOT_A_PATH = /[^A-Za-z0-9_.\-/\\~$@%+:{}[\]*?,!^]/;

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
  /** The file a command line writes by a redirect (`> f`, `>> f`, `>f`) or `tee [-a] f`, else null. */
  const targetOf = (ws) => {
    for (let k = 0; k < ws.length; k += 1) {
      const m = /^(?:1|&)?>>?(?![&|])(.*)$/.exec(ws[k]);
      if (m) return m[1] || ws[k + 1] || null;
      if (/(?:^|[\\/])tee$/.test(ws[k])) return ws.slice(k + 1).find((x) => !x.startsWith('-')) ?? null;
    }
    return null;
  };
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
      heredocs.push({ body: body.join('\n'), writes: /Set-Content|Add-Content|Out-File|\bsc\b|>>?\s*\S/i.test(s), owner: words.slice(), file: null });
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
        heredocs.push({ body: body.join('\n'), writes, owner: h.owner, file: writes ? targetOf(line) : null });
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
// ---- name filters: a pattern for the names of the files a search finds (the architect's second review of #600, items 1 and 2) ----------------------------
/**
 * A name filter matches the files below the search ROOT, wherever the shell stands, so its pattern is kept as written (never joined to the shell's folder) and with
 * the case the TOOL gives it: `find -name`, `-path` and `-wholename` are case-sensitive, `-iname`, `-ipath` and `-iwholename` are not, `rg -g`/`--glob` are
 * (`--iglob` is not), `grep --include` is, `fd -g` is smart-case (taken as blind: the side chosen), PowerShell's `-Filter` and `-Include` are not. A regex of find
 * (`-regex`, `-iregex`) is not a glob and its dialect is not JavaScript's: it is read as `any`, covering whatever the search covers. A negated glob (`!*.txt`) and the
 * `--exclude` family narrow nothing of what is read.
 */
const FIND_NAME_CS = new Set(['-name', '-path', '-wholename', '-lname']);
const FIND_NAME_CI = new Set(['-iname', '-ipath', '-iwholename', '-ilname']);
const GREP_VERBS = new Set(['grep', 'egrep', 'fgrep', 'rgrep']);
const FD_VERBS = new Set(['fd', 'fdfind']);
/** The flags of fd that take a value, so that the value is not taken for the pattern or a folder. */
const FD_VALUE_FLAGS = new Set(['-e', '--extension', '-t', '--type', '-d', '--max-depth', '--min-depth', '-E', '--exclude', '-S', '--size', '-c', '--color', '-j', '--threads', '-x', '--exec',
  '-X', '--exec-batch', '--max-results', '--changed-within', '--changed-before', '-o', '--owner', '--base-directory', '--search-path', '--path-separator']);

/** The words of an fd command that are neither a flag nor a flag's value: the pattern first, then the folders. */
function fdPositional(words) {
  const out = [];
  for (let n = 0; n < words.length; n += 1) {
    if (words[n].startsWith('-')) { if (FD_VALUE_FLAGS.has(words[n])) n += 1; continue; }
    out.push(words[n]);
  }
  return out;
}

/**
 * `{ filters, used, any }` for the words of one command: `filters` are `{ value, ci }` (a glob as written), `used` the indexes of the words that are flags or values of a
 * filter, `any` is `{ ci }` when the command filters by a regex (find). Pure.
 */
function nameFiltersOf(key, words, powershell) {
  const filters = [];
  const used = new Set();
  let any = null;
  const take = (value, ci, ...indexes) => {
    for (const k of indexes) used.add(k);
    if (typeof value === 'string' && value !== '' && !value.startsWith('!')) filters.push({ value, ci });
  };
  if (powershell) {
    for (let k = 0; k < words.length; k += 1) {
      const flag = words[k].toLowerCase();
      if (flag === '-filter' && words[k + 1] !== undefined) { take(words[k + 1], true, k, k + 1); k += 1; }
      else if (flag === '-include') {
        used.add(k);
        let j = k + 1;
        for (; j < words.length && !words[j].startsWith('-'); j += 1) take(words[j], true, j);
        k = j - 1;
      }
    }
    return { filters, used, any };
  }
  if (key === 'find') {
    for (let k = 0; k < words.length; k += 1) {
      const flag = words[k];
      if (FIND_NAME_CS.has(flag)) { take(words[k + 1], false, k, k + 1); k += 1; }
      else if (FIND_NAME_CI.has(flag)) { take(words[k + 1], true, k, k + 1); k += 1; }
      else if (flag === '-regex' || flag === '-iregex') { any = { ci: flag === '-iregex' }; used.add(k); used.add(k + 1); k += 1; }
    }
  } else if (key === 'rg' || key === 'ripgrep') {
    for (let k = 0; k < words.length; k += 1) {
      const w = words[k];
      if (w === '-g' || w === '--glob') { take(words[k + 1], false, k, k + 1); k += 1; }
      else if (w === '--iglob') { take(words[k + 1], true, k, k + 1); k += 1; }
      else if (w.startsWith('--glob=')) take(w.slice('--glob='.length), false, k);
      else if (w.startsWith('--iglob=')) take(w.slice('--iglob='.length), true, k);
      else if (/^-g[^-]/.test(w)) take(w.slice(2), false, k);
    }
  } else if (GREP_VERBS.has(key)) {
    for (let k = 0; k < words.length; k += 1) {
      const w = words[k];
      if (w === '--include') { take(words[k + 1], false, k, k + 1); k += 1; }
      else if (w.startsWith('--include=')) take(w.slice('--include='.length), false, k);
    }
  } else if (FD_VERBS.has(key) && words.some((w) => w === '-g' || w === '--glob')) {
    // fd -g PATTERN [PATH…]: the glob is the first word that is not a flag or a flag's value
    for (let k = 0; k < words.length; k += 1) {
      const w = words[k];
      if (w.startsWith('-')) { if (FD_VALUE_FLAGS.has(w)) k += 1; continue; }
      take(w, true, k);
      break;
    }
  }
  return { filters, used, any };
}

/** The corpus folder a path names (`markdown`, `markdown/<area>`, …), or null: a page, a folder of the corpus that is not `markdown/`, and a path outside it name none. */
function corpusFolder(path) {
  const m = /(?:^|\/)ServiceNowDocs(?:\/(markdown(?:\/.+)?))?$/.exec(posix(path).replace(/\/+$/, ''));
  if (!m) return null;
  const rel = m[1] ?? 'markdown';
  return /\.md$/i.test(rel) ? null : rel;
}

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
  const tokens = [];
  for (const w of rest.slice(1)) for (const token of w.split(/[\s;|&()]+/)) if (token) tokens.push(token);
  for (let k = 0; k < tokens.length; k += 1) {
    const key = powershell ? tokens[k].toLowerCase() : tokens[k];
    if (showing.has(key)) return true;
    // a search that only lists, counts or is quiet (`xargs grep -l`) prints no line of any page: its flags come right after it
    if (searching.has(key) && !silentSearch(tokens.slice(k + 1, k + 8), powershell)) return true;
  }
  return false;
}

/** The commands that take their first word for a script (`sed 1,5p f`, `awk 'NR<3' f`), so that it is not a file. */
const SCRIPTED = new Set(['sed', 'awk', 'gawk', 'mawk', 'nawk']);

/** The words that run another command, which a runner (xargs, find -exec) given only known commands (`wc`, `echo`, `ls`) does not. */
const runsAnything = (w) => w.split(/[\s;|&()]+/).some((t) => INTERPRETER.test(t) || (INDIRECT.has(t) && t !== 'xargs' && t !== 'parallel'));

/**
 * Is this opaque command one that can show nothing of its own? A loop (what it runs is the commands in its body, judged each by itself), and `xargs`, `parallel`
 * and `find -exec` given no shell and no interpreter: they run the commands they are given, and those that are known are judged by `givesViewer`. Everything else
 * (an interpreter, `eval`, `source`, a shell, `git show`, a verb the shell builds) may read a page without a viewer verb, and keeps its patterns.
 */
function benignRunner(key, rest, powershell) {
  if (powershell) return false;
  if (LOOPS.has(key)) return true;
  if (key === 'xargs' || key === 'parallel') return !rest.slice(1).some(runsAnything);
  if (key === 'find') return !rest.slice(1).some(runsAnything);
  return false;
}

/**
 * The words of a showing or searching command that name files: not a flag, not the value of `-e` or `-f`, and not the pattern of a search or the script of `sed`
 * and `awk` (their first word, unless a flag gave it). PowerShell has no such first word: every word that is not a flag is taken, as it may be a path.
 */
function fileWords(key, words, searchesFiles, powershell) {
  const out = [];
  let first = !powershell && (searchesFiles || SCRIPTED.has(key))
    && !words.some((w) => w === '-e' || w === '-f' || w.startsWith('--regexp') || w.startsWith('--expression') || w.startsWith('--file'));
  let value = false;
  for (const w of words) {
    if (w.startsWith('-')) { value = !powershell && (w === '-e' || w === '-f'); continue; }
    if (value) { value = false; continue; }
    if (first) { first = false; continue; }
    out.push(w);
  }
  return out;
}

/** The shells and the commands that run a file in this one: a file they are given is run. */
const SHELLS = new Set(['sh', 'bash', 'zsh', 'dash', 'ksh', 'fish', 'csh', 'tcsh', 'source', '.']);
/**
 * Is `w` a flag after which this interpreter or shell takes CODE and not a file: `python3 -c`, `python -m`, `bash -c` (`-lc`, `-ec`), `node -e`, `perl -ne`, `php -r`,
 * `pwsh -Command`? Not `bash -e`, which is errexit and is followed by the script.
 */
function isCodeFlag(key, w) {
  if (/^(?:pwsh|powershell)/i.test(key)) return /^-(?:c|command|encodedcommand|ec)$/i.test(w);
  if (SHELLS.has(key)) return /^-[A-Za-z]*c$/.test(w);
  return /^-(?:[A-Za-z]*[cemr]|p)$/.test(w) || /^--(?:eval|print|command)$/.test(w);
}

/**
 * The base names of the files a command line runs (the architect's second review of #600, item 4): the words an interpreter or a shell is given before any
 * `-c` code (`python3 -u x.py`, `bash x.sh`, `source x`, `. x`, `pwsh -File x.ps1`), and a file invoked by its path (`./x.sh`, `/tmp/x.py`). A `.md` word is
 * data. They are matched by base name to the files the session wrote, to tell a script it wrote and ran from a document it wrote. Pure.
 */
function ranFiles(key, rest, powershell) {
  const out = [];
  const take = (w) => { const name = basename(w); if (name && !/\.md$/i.test(name)) out.push(name); };
  if (INTERPRETER.test(key) || (!powershell && SHELLS.has(key))) {
    const words = rest.slice(1);
    for (let k = 0; k < words.length; k += 1) {
      const w = words[k];
      if (/^-(?:file|f)$/i.test(w) && /^(?:pwsh|powershell)/i.test(key) && words[k + 1] !== undefined) { take(words[k + 1]); break; }
      if (isCodeFlag(key, w)) break;
      if (!w.startsWith('-')) take(w);
    }
  } else if (/[\\/]/.test(rest[0])) take(rest[0]);
  return out;
}

/**
 * The part of a word before its first segment that is an expansion (`$f`, `${D}`, a back-tick, `~`, a `{}`): `DIR/$f` is under `DIR`, `$D/x` under no known
 * folder (the empty string). A word with none is returned whole. Pure.
 */
function staticFolder(word) {
  const out = [];
  for (const seg of posix(word).split('/')) {
    if (/[$`{}]/.test(seg) || seg.startsWith('~')) break;
    out.push(seg);
  }
  return out.join('/');
}

/**
 * Does this lister or searcher run on the folder the shell stands in, being given none: `ls`, `find -type f`, `rg -l X`, `grep -rl X`, `fd x`, `tree`, PowerShell's
 * `Get-ChildItem -Recurse`? A search that reads a pipe (`… | rg X`, `… | grep -l X`) reads its input and not a folder, and so does `grep X` without `-r`. Pure.
 */
function searchesCwd(info, named, searching, powershell) {
  const k = info.key;
  const operands = info.words.filter((w, n) => !w.startsWith('-') && !/^\d+$/.test(w) && !named.used.has(n));
  if (powershell) return ['get-childitem', 'gci', 'dir', 'ls'].includes(k) && operands.length === 0;
  if (k === 'ls' || k === 'dir' || k === 'tree' || k === 'du') return operands.length === 0;
  if (k === 'find') { const at = info.words.findIndex((w) => w.startsWith('-') || w === '(' || w === '!'); return (at < 0 ? info.words.length : at) === 0; }
  if (FD_VERBS.has(k)) return fdPositional(info.words).length < 2;                              // fd PATTERN [PATH…]
  if (searching.has(k)) {
    if (info.op === '|') return false;
    const recursive = k === 'rg' || info.words.some((w) => w === '--recursive' || /^-[A-Za-z]*[rR][A-Za-z]*$/.test(w));
    return recursive && fileWords(k, info.words, true, false).length === 0;
  }
  return false;
}

/** The commands that list the files of a folder. */
const LISTERS = new Set(['ls', 'dir', 'tree', 'du', 'find', 'fd', 'fdfind', 'get-childitem', 'gci']);

/** A redirect as a word of its own (`>`, `>>`, `2>`, `<`, `&>`): the word after it is a file. */
const REDIRECT = /^(?:\d|&)?[<>]{1,2}&?$/;

/**
 * The words of a segment that may name a folder to search or list: not the variable of a `for` (the words after its `in` are), nothing of a `while`, `until`,
 * `done`, `fi` or `esac` (what a loop runs is its own segments), not the pattern of a search or the script of `sed` and `awk`, and not a redirect or the file it names. Pure.
 */
function rootWords(info, showing, searching, powershell) {
  let words = info.words;
  if (info.key === 'for' || info.key === 'select') { const at = words.indexOf('in'); words = at < 0 ? [] : words.slice(at + 1); }
  else if (['while', 'until', 'done', 'fi', 'esac'].includes(info.key)) words = [];
  else if (!powershell && (searching.has(info.key) || SCRIPTED.has(info.key))) words = fileWords(info.key, words, searching.has(info.key), false);
  else if (!powershell && (info.key === 'xargs' || info.key === 'parallel')) {                                                        // the files the command it runs is given
    const at = words.findIndex((w) => showing.has(w) || searching.has(w));
    if (at >= 0) words = [...words.slice(0, at), ...fileWords(words[at], words.slice(at + 1), searching.has(words[at]), false)];
  } else if (!powershell && FD_VERBS.has(info.key)) words = fdPositional(words).slice(1);                                             // its folders: the first is the pattern
  else if (!powershell && info.key === 'find') { const at = words.findIndex((w) => w.startsWith('-') || w === '(' || w === '!'); if (at >= 0) words = words.slice(0, at); }     // its starting points
  return words.filter((w, k) => !REDIRECT.test(w) && !(k > 0 && REDIRECT.test(words[k - 1])));
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
 * (`null` when not known) and `lost` are where it stands then. `patterns` are the glob and brace words of a call that cannot be resolved (`{ w, ci }`: the
 * word as the folder it stood in makes it, or as written when that folder is not known), the name filters of its searches as written (`{ w, ci }`, the case the tool
 * gives them), a viewer's pattern that `glob` did not answer (`wordNamesPage` says which pages one could name), and the corpus folders it names (`{ dir }`: every
 * page below `markdown/<area>…`); they are kept only when the call has a viewer or a command that may read a page without one. `runs` are the base names of the
 * files the call runs (`ranFiles`). `searched` is the folder each search that prints lines (`grep`, `rg`, `Select-String`,
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
  let unknown = false;                                             // ... one that may read a page with no viewer verb: an interpreter, `eval`, `source`, a shell, `git show`
  let viewer = false;                                              // the call has a viewer or a search that prints lines, or a runner that is given one
  let flagged = false;                                             // a viewer or a search of the call has an expansion in its words
  const saved = [];
  const patterns = new Map();                                      // { w, ci } by spelling, or { dir }: what a glob, a brace word or a folder of the call could name
  const printing = new Map();                                      // the name filters of a search under the corpus that prints lines: `searchPatterns` (B3)
  const runs = new Set();                                          // the base names of the files the call runs (read-routes.mjs, `ranFiles`)
  const segInfo = [];                                              // the words of each segment and the folder it ran in, for the patterns of a call left unresolved
  const add = (page, verb) => { if (!reads.has(page)) reads.set(page, verb); };
  /** A pattern word as the shell would have seen it: joined to the folder it ran in (those it knows), or as written when no folder is known or it is lost. */
  const addPattern = (word, folder, folderGone, asWritten = false) => {
    if (patterns.size >= 64 || word.length > MAX_WORD) return;
    const w = posix(word);
    const bases = [];
    if (folder !== null) bases.push(folder);
    if (rowCwd !== null && rowCwd !== folder) bases.push(rowCwd);
    const spellings = asWritten || folderGone || ABSOLUTE.test(w) || bases.length === 0 ? [w] : bases.map((b) => joinPath(b, w));
    for (const spelling of spellings) patterns.set(`${powershell ? 'i' : 's'}\0${spelling}`, { w: spelling, ci: powershell });
  };
  /** A name filter's pattern as written, with the case its tool gives it: it matches the files below the search root, wherever the shell stands. */
  const addFilter = (value, ci) => {
    if (patterns.size >= 64 || value.length > MAX_WORD) return;
    const w = posix(value);
    patterns.set(`${ci ? 'i' : 's'}\0${w}`, { w, ci });
  };
  /** Every page under a corpus folder (`markdown/<area>`, or `markdown` for the whole corpus). */
  const addFolder = (dir) => { if (patterns.size < 64) patterns.set(`d\0${dir}`, { dir }); };
  /** The corpus folders a word of a command that ran in `folder` names, as the folders the call could have been run from make them (those it knows). */
  const foldersOf = (word, folder, folderGone) => {
    const stem = staticFolder(word);
    if (stem === '' || stem.length > MAX_WORD) return [];
    const full = [];
    if (ABSOLUTE.test(stem)) full.push(stem);
    else {
      if (folder !== null && !folderGone) full.push(joinPath(folder, stem));
      if (rowCwd !== null && rowCwd !== folder) full.push(joinPath(rowCwd, stem));
    }
    return full.map(corpusFolder).filter((dir) => dir !== null);
  };
  /** The corpus folders a segment names or runs on: its folder words, and the shell's own when it is given none. */
  const rootsOf = (info, named) => {
    const roots = new Set();
    const takesFolders = showing.has(info.key) || searching.has(info.key) || LISTERS.has(info.key) || ['xargs', 'parallel', 'for', 'select'].includes(info.key);       // not `echo x`
    for (const w of takesFolders ? rootWords(info, showing, searching, powershell) : []) {
      if (w.startsWith('-') || NOT_A_PATH.test(w) || PATTERN_WORD.test(w) || /^\d+$/.test(w)) continue;
      for (const dir of foldersOf(w, info.folder, info.gone)) roots.add(dir);
    }
    if (searchesCwd(info, named, searching, powershell)) for (const dir of foldersOf('.', info.folder, info.gone)) roots.add(dir);
    return roots;
  };
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
          for (const file of glob(posix(full), { ci: powershell }) ?? []) {          // null: the pattern went over its budget, and is the call's words
            const page = pageAt(file);
            if (page) { add(page, key); found = true; }
          }
        }
      }
      const typed = globby ? null : pageAt(arg);                  // `vendor/ServiceNowDocs/markdown/….md`, from wherever
      if (typed) { add(typed, key); found = true; }
      if (!found && (globby || (at === null && /\.md$/i.test(arg)))) unresolved.push(arg);
      if (!found && globby) addPattern(arg, at, folderLost);
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
    segInfo.push({ words: rest.slice(1), key, op: seg.op, folder: at, gone: folderLost });
    for (const name of ranFiles(key, rest, powershell)) runs.add(name);
    if (opaqueVerb(key, rest, powershell, seg.x)) {
      opaque = true;
      if (!benignRunner(key, rest, powershell)) unknown = true;
      if (givesViewer(rest, showing, searching, powershell)) viewer = true;
      return;
    }
    const showsLines = showing.has(key);
    const searchesFiles = searching.has(key);
    if (!showsLines && !searchesFiles) return;
    if (searchesFiles && silentSearch(rest.slice(1), powershell)) return;
    const files = fileWords(key, rest.slice(1), searchesFiles, powershell);
    // A filter that is given no file and is fed by a pipe (`ls | sort`, `xargs wc -l | tail -3`) prints the lines it was given, which are no page's. A search given
    // no file and not fed by a pipe searches the folder it is in. A command with an expansion (`cat `find …``) may be given its files by it.
    if (!powershell && !seg.x && !files.some((w) => !/^\d+$/.test(w)) && !(searchesFiles && seg.op !== '|')) return;
    viewer = true;
    if (seg.x) flagged = true;
    if (searchesFiles) searched.push(at);
    if (searchesFiles && !powershell) {
      const named = nameFiltersOf(key, rest.slice(1), false);
      if (named.filters.length && rootsOf({ key, words: rest.slice(1), op: seg.op, folder: at, gone: folderLost }, named).size > 0) {
        for (const f of named.filters) if (printing.size < 16 && f.value.length <= MAX_WORD) printing.set(`${f.ci ? 'i' : 's'}\0${f.value}`, { w: posix(f.value), ci: f.ci });
      }
    }
    if (powershell && showsLines && files.length === 0 && seg.op === '|') { opaque = true; return; }       // Get-Content reads what the pipe gives it
    for (const w of files) consider(powershell ? w : w.replace(/^<+/, ''), key);                          // cat <page.md
  });
  while (saved.length) [at, folderLost] = saved.pop();                // the line ended inside a subshell: its folder goes with it
  if (opaque || flagged) {
    const scripts = [];
    for (const h of heredocs) {
      const owner = unwrap(h.owner ?? [], powershell);
      if (owner.length && opaqueVerb(powershell ? basename(owner[0]).toLowerCase() : basename(owner[0]), owner, powershell, false)) scripts.push(h.body);
    }
    unresolved.push([bare, ...scripts].join('\n'));
    // What the call could have shown by a pattern or a folder is kept only when it can show lines at all (the architect's second review of #600, item 7): it has a
    // viewer (`cat`, `head`, `grep` that prints lines…), or a command that may read a page with no viewer verb. A call that only lists, counts or echoes
    // (`find … | xargs grep -l`, `… | xargs wc -l`, a loop that echoes) shows no page, whatever it names.
    if (viewer || unknown) {
      for (const info of segInfo) {
        // A name filter is taken as written, with the case its tool gives it, and matches below the search root (items 1 and 2).
        // A case-sensitive value with no wildcard is a name the call prints, which the names rule already counts (`mentionsPage`); a case-blind one may differ in case.
        const named = nameFiltersOf(info.key, info.words, powershell);
        for (const f of named.filters) if (f.ci || PATTERN_WORD.test(f.value)) addFilter(f.value, f.ci);
        // The glob and brace words of the call, each as the folder it ran in makes it; the scripts a word cannot be read inside (a quoted `python3 -c "…"`)
        // by the tokens in them, as written. The plain words of a segment that name a folder under the corpus are its roots (item 3).
        info.words.forEach((w, n) => {
          if (named.used.has(n) || w.startsWith('-')) return;
          if (NOT_A_PATH.test(w)) { for (const token of patternsInText(w)) addPattern(token, null, true, true); return; }
          if (PATTERN_WORD.test(w)) addPattern(w, info.folder, info.gone);
        });
        // Folders count when the call has a viewer to feed them to: `git -C <corpus> show HEAD:<page>` names the corpus and reads one page. A lister or searcher
        // given no folder runs on the one the shell stands in (`cd <area> && ls | xargs head`).
        const roots = viewer ? rootsOf(info, named) : new Set();
        // A regex filter of find (`-regex`, `-iregex`) is not a glob: it covers what the search covers, which is the folder it names, or every page when none.
        // A name filter narrows a folder's pages (its pattern is the match), so the folder is added only for a segment that has none.
        if (named.any) {
          if (roots.size === 0) addFilter('*', named.any.ci);
          else for (const dir of roots) addFolder(dir);
        } else if (named.filters.length === 0) for (const dir of roots) addFolder(dir);
      }
      for (const script of scripts) for (const token of patternsInText(script)) addPattern(token, null, true, true);
    }
  }
  return { reads, cwd: at, lost: folderLost, moved, heredocs, searched, unresolved, viewer, runs: [...runs], patterns: [...patterns.values()], searchPatterns: [...printing.values()] };
}

/**
 * The corpus pages an MCP call's input shows, and what it leaves unresolved: a file it names by `path`, `file_path` or `paths`, what the shell in it
 * shows (`command`, the `commands` of a batch, shell `code`), and the `code` of any other language as text, for the names rule, and the glob tokens in
 * it as `patterns`. `{ pages, unresolved, viewer, patterns }`.
 */
export function inputReads(input, { cwd = null, rowCwd = null, glob = null } = {}) {
  const pages = new Set();
  const unresolved = [];
  const patterns = [];
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
    else if (typeof input.language === 'string') { unresolved.push(input.code); for (const token of patternsInText(input.code)) patterns.push({ w: posix(token), ci: false }); }
  }
  for (const line of lines) {
    const done = commandReads(line, { cwd, rowCwd, glob });
    for (const page of done.reads.keys()) pages.add(page);
    unresolved.push(...done.unresolved);
    patterns.push(...done.patterns);
    if (done.viewer) viewer = true;
  }
  return { pages, unresolved, viewer, patterns };
}

/** The corpus pages an MCP call's input shows: a file it names by `path`, `file_path` or `paths`, and what the shell in it shows. */
export const pagesOfInput = (input, opts) => inputReads(input, opts).pages;

/**
 * The corpus pages whose lines a search printed: the lines that begin with a page's path and then `:` or `-` (`path:12:text`, `path-12-context`,
 * `path:text`; a drive letter may come first). A path that is relative to a folder (`c_Esc.md:12:text`, from a search run inside it) is joined to
 * the `bases` in order, and names the first page that exists: with `pageExists` (the disk) the first base under which the page is there, and never a page that
 * is not (the replay over the C268 sessions, B1: a doubled page, `markdown/a/markdown/a/x.md`, is a path of the right shape that no disk holds); without it
 * the first base that makes a page. A line that is only a path (a listing) or a count (`path:3` is read the same way, so the caller does not pass one) names a
 * page no more than the search it came from showed. Pure.
 */
export function pagesInLines(body, bases = [], { pageExists = null } = {}) {
  const pages = new Set();
  if (typeof body !== 'string' || !body.includes('.md')) return pages;
  for (const line of body.split(/\r?\n/)) {
    const m = /^((?:[A-Za-z]:)?[^:]*?\.md)(?::|-)/.exec(line);
    if (!m) continue;
    let page = pageAt(m[1]);                                    // a path that is absolute names its page: the tool printed it
    for (const base of bases) {
      if (page) break;
      if (typeof base !== 'string' || !base) continue;
      const found = pageAt(joinPath(base, m[1]));
      if (found && (typeof pageExists !== 'function' || pageExists(found))) page = found;
    }
    if (page) pages.add(page);
  }
  return pages;
}

/**
 * The corpus pages a Grep in content mode showed: the pages on the lines it returned, and the one page it searched when `path` names a file (its
 * lines carry no path). A Grep that only lists files or counts shows no line. A relative line is below the SESSION's folder (`rowCwd`), which is tried before
 * the search path (B1); `seams` is `{ pageExists }`.
 */
export function pagesOfGrep(input, body, rowCwd = null, seams = {}) {
  const pages = new Set();
  if (input?.output_mode !== 'content' || typeof body !== 'string' || !body.trim()) return pages;
  const one = pageAt(input.path);
  if (one) pages.add(one);
  for (const page of pagesInLines(body, [rowCwd, input.path], seams)) pages.add(page);
  return pages;
}

/** The most of an output kept as text for the names rule. */
const OUTPUT_CAP = 500_000;
/** The result of a call that RAN and failed starts so (Claude Code's text); a refusal's does not. */
const RAN = /^\s*Exit code\b/i;
/** A line of a page shorter than this is no evidence that a result holds the page (a heading, a rule). */
const MIN_EVIDENCE = 16;

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
 * `{ reached: Map(page → { route, at }), writes: [{ tool, text, at, file, script }], calls: Map(tool_use id → Map(page → route)), opaque: [{ text, at }], ownFiles }`, `at`
 * being the row of the call, `file` the path a write names (or the target of a heredoc that writes), `script` whether a later call ran the file (its text is then also
 * one of `opaque`, and its glob tokens `patterns`), `ownFiles` the lower-case base names of the files outside the corpus that the thread read, wrote or edited; `calls` says which pages each shell call showed, by the verb that showed it (`search` for the lines a search printed);
 * `opaque` is the text of each call that may have shown a page without naming it (`commandReads`' `unresolved`, and the code of another language in an
 * MCP call), for the names rule, and, for a call of those that has a viewer verb, the first 500,000 characters of its output. A call counts only when its
 * result came back without `is_error`; except that a Bash or PowerShell call with a viewer verb that FAILED may have printed part of what it was asked
 * for (`cat a.md missing.md`): the pages it names that `pageExists(page)` says are on disk are reached, and its unresolved text and its output are kept
 * apart in `failedOpaque`, for the caller to use only for a page that is on disk. A failed call with no viewer shows nothing, and no failed call moves the
 * shell's folder or writes a file. The folder is tracked across the calls of the thread: a `cd` that succeeded moves it, and one the call cannot tell
 * loses it until a `cd` it can. `glob` is the file system for patterns. `carryFolder: false` is a thread whose folder Claude Code resets before every Bash
 * call (a sub-agent's, and the main thread's when CLAUDE_BASH_MAINTAIN_PROJECT_WORKING_DIR is set): each call starts at the folder its row records, and
 * nothing a `cd` set is the next call's. `patterns` are the glob and brace words of the calls that could not be resolved (`commandReads`), those of a
 * failed viewer call apart in `failedPatterns`. `shouldStop()` is the run's deadline: the walk stops at the next row, `aborted` says so. Nothing is
 * cut at a compaction boundary: a page read before it was read. Pure.
 */
export function walkThread(rows, { glob = null, pageExists = null, pageText = null, carryFolder = true, shouldStop = null } = {}) {
  const uses = new Map();
  const reached = new Map();
  const writes = [];
  const calls = new Map();
  const opaque = [];
  const failedOpaque = [];
  const patterns = new Map();
  const failedPatterns = new Map();
  const ownFiles = new Set();                                      // lower-case base names of the files outside the corpus that the session read, wrote or edited
  const ranScripts = new Set();                                    // the writes that a later call ran
  let aborted = false;
  let cwd = null;
  let lost = false;
  // The disk is asked once for each page for the whole walk: a Grep result has thousands of lines that name a few pages.
  const asked = new Map();
  const known = typeof pageExists === 'function' ? (page) => { if (!asked.has(page)) asked.set(page, Boolean(pageExists(page))); return asked.get(page); } : null;
  const onDisk = known ?? (() => false);
  const seams = known ? { pageExists: known } : {};
  const evidence = new Map();                                       // page → its lines long enough to be evidence that a result holds them
  /** Does the text of a result hold a line of this page (B2)? Needs the page's text (`pageText`), which the hook reads from the corpus folder. */
  const holdsLineOf = (said, page) => {
    if (!evidence.has(page)) {
      const text = typeof pageText === 'function' ? pageText(page) : null;
      evidence.set(page, typeof text === 'string' ? text.split(/\r?\n/).map((l) => l.trim()).filter((l) => l.length >= MIN_EVIDENCE).slice(0, 300) : []);
    }
    return evidence.get(page).some((line) => said.includes(line));
  };
  const output = (b) => posix(textOfResult(b)).slice(0, OUTPUT_CAP);
  const reach = (page, route, at) => { if (!reached.has(page)) reached.set(page, { route, at }); };
  const keep = (into, list) => { for (const q of list) into.set(q.dir !== undefined ? `d\0${q.dir}` : `${q.ci}\0${q.w}`, q); };
  /** A file the session touched that is not a page of the corpus: a bare mention of its name is no citation of a page that has the same name (item 5). */
  const own = (file) => { if (typeof file === 'string' && file && !pageAt(file)) { const name = basename(file).toLowerCase(); if (name) ownFiles.add(name); } };
  /** A call ran the file with this base name: every write of it so far is a script, and the pages it names are pages it may have shown (item 4). */
  const ran = (name, at) => {
    for (const w of writes) {
      if (!w.file || basename(w.file) !== name) continue;
      w.script = true;
      if (ranScripts.has(w)) continue;
      ranScripts.add(w);
      opaque.push({ text: posix(w.text).slice(0, OUTPUT_CAP), at });
      keep(patterns, patternsInText(w.text).map((token) => ({ w: posix(token), ci: false })));
    }
  };
  const all = Array.isArray(rows) ? rows : [];
  for (let at = 0; at < all.length; at += 1) {
    if (shouldStop && at % 64 === 0 && shouldStop()) { aborted = true; break; }
    const r = all[at];
    if (!r || typeof r !== 'object') continue;
    if (r.type === 'assistant') {
      for (const b of blocksOf(r)) if (b.type === 'tool_use' && b.id) uses.set(b.id, { name: b.name, input: b.input ?? {}, rowCwd: typeof r.cwd === 'string' ? r.cwd : null, at });
      continue;
    }
    if (r.type !== 'user') continue;
    for (const b of blocksOf(r)) {
      if (b.type !== 'tool_result') continue;
      const failed = b.is_error === true;
      const use = uses.get(b.tool_use_id);
      if (!use) continue;
      const { name, input } = use;
      if (failed) {
        if (name !== 'Bash' && name !== 'PowerShell') continue;
        if (!carryFolder) { cwd = null; lost = false; }
        const done = commandReads(input.command, { powershell: name === 'PowerShell', cwd, rowCwd: use.rowCwd, lost, glob });
        if (!done.viewer) continue;
        // A REFUSED call (permission, parse) never ran and shows nothing (the replay over the C268 sessions, B2). One that ran and failed says "Exit code N", or its
        // result holds a line of a page it names: the prefix is not relied on alone, since a wording that changes would show every failed call as a refusal.
        const said = textOfResult(b);
        if (!RAN.test(said) && ![...done.reads.keys()].some((page) => holdsLineOf(said, page))) continue;
        for (const [page, verb] of done.reads) if (onDisk(page)) reach(page, verb, use.at);
        for (const text of done.unresolved) failedOpaque.push({ text: posix(text), at: use.at });
        if (done.unresolved.length) failedOpaque.push({ text: output(b), at: use.at });
        keep(failedPatterns, done.patterns);
        continue;
      }
      if (name === 'Read') { const page = pageAt(input.file_path); if (page) reach(page, 'Read', use.at); else own(input.file_path); continue; }
      if (name === 'Bash' || name === 'PowerShell') {
        if (!carryFolder) { cwd = null; lost = false; }
        const done = commandReads(input.command, { powershell: name === 'PowerShell', cwd, rowCwd: use.rowCwd, lost, glob });
        const shown = new Map(done.reads);
        const printed = done.searched.length ? pagesInLines(textOfResult(b), [...done.searched, use.rowCwd], seams) : new Set();
        for (const page of printed) if (!shown.has(page)) shown.set(page, 'search');
        for (const [page, verb] of shown) reach(page, verb, use.at);
        // A search that printed lines with no file name (`grep -rh`, `rg -I`) names no page: its name filter does (B3).
        if (done.searchPatterns.length && printed.size === 0 && textOfResult(b).trim() !== '') keep(patterns, done.searchPatterns);
        if (shown.size) calls.set(b.tool_use_id, shown);
        if (done.moved) { cwd = done.cwd; lost = done.lost; }
        for (const text of done.unresolved) opaque.push({ text: posix(text), at: use.at });
        if (done.viewer && done.unresolved.length) opaque.push({ text: output(b), at: use.at });
        keep(patterns, done.patterns);
        for (const h of done.heredocs) {
          if (!h.writes) continue;
          own(h.file);
          if (h.body) writes.push({ tool: name, text: h.body, at: use.at, file: h.file ?? null, script: false });
        }
        for (const file of done.runs) ran(file, use.at);
        continue;
      }
      if (name === 'Grep') { for (const page of pagesOfGrep(input, textOfResult(b), use.rowCwd, seams)) reach(page, 'Grep', use.at); continue; }
      if (typeof name === 'string' && name.startsWith('mcp__')) {
        const done = inputReads(input, { rowCwd: use.rowCwd, glob });
        for (const page of done.pages) reach(page, 'mcp', use.at);
        for (const text of done.unresolved) opaque.push({ text: posix(text), at: use.at });
        if (done.viewer && done.unresolved.length) opaque.push({ text: output(b), at: use.at });
        keep(patterns, done.patterns);
        continue;
      }
      if (Object.hasOwn(WRITERS, name)) {
        const file = typeof input.file_path === 'string' ? input.file_path : (typeof input.notebook_path === 'string' ? input.notebook_path : null);
        own(file);
        for (const text of WRITERS[name](input)) writes.push({ tool: name, text, at: use.at, file, script: false });
      }
    }
  }
  return { reached, writes, calls, opaque, failedOpaque, ownFiles, patterns: [...patterns.values()], failedPatterns: [...failedPatterns.values()], aborted };
}
