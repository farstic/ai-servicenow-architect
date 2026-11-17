// Copyright 2026 Cvetomir Grigorov. Licensed under the Business Source License 1.1 (see LICENSE).
// snowarch — AI ServiceNow Architect. Not affiliated with or endorsed by ServiceNow, Inc.
// ARC-09-C267 (lever 2) — the glob the Stop hook expands a viewer command's patterns with.
//
// A `cat dir/*.md` shows every page the shell expands the pattern to, and the transcript keeps the pattern and not the pages. The architect's ruling of
// 2026-11-16 (the pre-registration has a guard of 0 false "unread" claims): expand it against the file system, from the folder the shell was in. This is
// that expansion and nothing else. It is the one place in the Stop hook's reading of a transcript that touches the disk, so it takes its file system as a
// seam (the module is exercised over an in-memory one), and it is limited, for EACH PATTERN: a number of folder reads, a number of directory entries and
// a time (a budget that the whole session shared was spent by the patterns of its first turns, and every later one was then reported as "nothing";
// the architect's review of #600, A4), and the answer for a pattern is kept, so that a session of a hundred `cat` calls over the same folder reads that
// folder once. A run that is stopped (the hook's deadline) answers no more patterns.
//
// What a pattern means here is what bash and zsh give it: `*` any run of characters but `/`, `?` one, `[abc]` `[a-c]` `[!a]` `[^a]` a class, `**` as a whole
// folder name zero or more folders, a name that starts with a dot only by a pattern that starts with one. PowerShell's wildcards are the same four and not
// case-sensitive, which is the `ci` flag. Brace lists are not a file system's business: they are expanded before the pattern gets here
// (read-routes.mjs, `expandBraces`).
//
// An answer is `[]` when nothing matches or a folder cannot be read, and `null` when a limit was reached or the run was stopped: the pattern is then NOT
// answered, and the caller falls back to matching the pattern's own words against a page's path and file name (read-routes.mjs, `wordNamesPage`), which
// is the safe side: a page counted as shown that was not costs a missed ask; the other way costs a false claim to the model.
import { existsSync, readdirSync } from 'node:fs';

const META = /[*?[]/;

/** The regular expression of ONE path segment's pattern (`ci` for case-blind). Everything that is not a wildcard is literal. Pure. */
export function globToRegExp(part, { ci = false } = {}) {
  let re = '^';
  for (let i = 0; i < part.length; i += 1) {
    const c = part[i];
    if (c === '*') re += '[^/]*';
    else if (c === '?') re += '[^/]';
    else if (c === '[') {
      let j = i + 1;
      let negated = false;
      if (part[j] === '!' || part[j] === '^') { negated = true; j += 1; }
      let k = j;
      if (part[k] === ']') k += 1;                                  // a ] first is a member of the class
      while (k < part.length && part[k] !== ']') k += 1;
      if (k >= part.length) { re += '\\['; continue; }              // never closed: a bracket
      re += `[${negated ? '^' : ''}${part.slice(j, k).replace(/[\\^\]]/g, '\\$&')}]`;
      i = k;
    } else re += c.replace(/[.+^${}()|\\]/g, '\\$&');
  }
  return new RegExp(`${re}$`, ci ? 'i' : '');
}

const joinp = (dir, name) => (dir.endsWith('/') ? `${dir}${name}` : `${dir}/${name}`);

/**
 * `glob(pattern, { ci })` for an ABSOLUTE posix pattern (`/…` or `C:/…`): the files and folders it expands to, sorted, frozen, kept for the next call that
 * asks the same; `null` when the pattern went over its budget or the run was stopped, kept the same way. A relative pattern is not the caller's to expand
 * and gives `[]`. `readdir(dir)` gives Dirent-like entries (`name`, `isDirectory()`) or throws; `exists(path)` is a yes or no; `maxDirs` folder reads,
 * `maxEntries` entries listed and `maxMs` milliseconds (by `now`) are the budget OF ONE PATTERN: a slow disk must not spend the hook's deadline on a
 * pattern, and one pattern must not spend another's. `shouldStop()` is the run's own deadline.
 */
export function makeGlob({ readdir = (dir) => readdirSync(dir, { withFileTypes: true }), exists = existsSync, maxDirs = 300, maxEntries = 50_000, maxMs = 1500, now = Date.now, shouldStop = () => false } = {}) {
  const memo = new Map();
  const expand = (pattern, ci) => {
    const started = now();
    let dirs = 0;
    let entries = 0;
    const parts = pattern.split('/');
    let root;
    if (parts[0] === '') root = '/';
    else if (/^[A-Za-z]:$/.test(parts[0])) root = `${parts[0]}/`;
    else return [];
    const rest = parts.slice(1).filter((p) => p !== '');
    const results = [];
    let over = false;
    const list = (dir) => {
      if (dirs >= maxDirs || shouldStop()) { over = true; return []; }
      dirs += 1;
      let items;
      try { items = readdir(dir); } catch { return []; }
      entries += items.length;
      if (entries > maxEntries || now() - started > maxMs) { over = true; return []; }
      return items;
    };
    const walk = (dir, idx) => {
      if (over) return;
      if (idx === rest.length) { results.push(dir); return; }
      const part = rest[idx];
      const last = idx === rest.length - 1;
      if (part === '**') {
        walk(dir, idx + 1);                                          // zero folders
        if (last) return;
        for (const e of list(dir)) if (e.isDirectory() && !e.name.startsWith('.')) walk(joinp(dir, e.name), idx);
        return;
      }
      if (!META.test(part)) {
        const next = joinp(dir, part);
        if (!ci || exists(next)) {
          if (!last) walk(next, idx + 1);
          else if (exists(next)) results.push(next);
          return;
        }
        // case-blind and not there as written: look for it by name
      }
      const re = globToRegExp(part, { ci });
      for (const e of list(dir)) {
        if (e.name.startsWith('.') && !part.startsWith('.')) continue;
        if (!re.test(e.name)) continue;
        if (last) results.push(joinp(dir, e.name));
        else if (e.isDirectory()) walk(joinp(dir, e.name), idx + 1);
      }
    };
    walk(root, 0);
    return over ? null : results.sort();
  };
  return (pattern, { ci = false } = {}) => {
    const key = `${ci ? 'i' : 's'}:${pattern}`;
    if (memo.has(key)) return memo.get(key);
    const got = expand(String(pattern ?? ''), ci);
    const answer = got === null ? null : Object.freeze(got);
    memo.set(key, answer);
    return answer;
  };
}
