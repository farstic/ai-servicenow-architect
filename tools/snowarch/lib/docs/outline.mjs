// Copyright 2026 Cvetomir Grigorov. Licensed under the Business Source License 1.1 (see LICENSE).
// snowarch — AI ServiceNow Architect. Not affiliated with or endorsed by ServiceNow, Inc.
// ARC-09-C284 — `docs outline`: the corpus's own hierarchy, browsed a level at a time.
//
// Every area's index.md lists the whole area as a nested list — `- [Title](url) -- description`, two spaces a level — and the
// larger files are 0.4 to 2.3 MB (at the 96d3212 pin 17 of the 53 are over 0.4 MB, the median is 199 KB): too big to read, and the
// pages a question needs sit three to five levels down. This prints the
// hierarchy below a start node, a few levels at a time, one line per node, bounded, so the reader goes down level by level.
//
// Read-only and deterministic: it reads index.md files and prints; nothing is written, and the same corpus gives the same lines.
// A path is a corpus path (`markdown/<area>/<page>.md`, forward slashes, as a citation writes it), so the lines are the same
// on every platform.
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { CORPUS_DIR } from './sync.mjs';
import { needSpell } from '../launcher-spelling.mjs';
import { mapAreas } from './banner-line.mjs';

/** The most lines one call prints at its depth before it falls back to the first level. */
export const OUTLINE_LINES = 120;
/** The levels below the start node that a call prints unless it is told otherwise. */
export const OUTLINE_DEPTH = 2;
/** The most lines a first level may print: a node with hundreds of children is cut here, and the cut is said. */
export const OUTLINE_FIRST_LEVEL_MAX = 200;
const MAX_DEPTH = 8;

/**
 * A list line of an index.md: the indent, the title, the page's URL, and the description if there is one.
 *
 * The title is read lazily up to the first `](http`, so a title that holds brackets ("Case Admin [sn_x.admin]") is whole, and the
 * description is read with `s` because a description can hold U+2028, which `.` does not match: the first pattern written for this
 * missed five bullets of the real corpus that way.
 */
const ITEM = /^( *)- \[(.*?)\]\((https?:\/\/\S+?)\)(?: -- (.*))?$/s;
const ZERO_WIDTH = /[\u200B-\u200D\u2060\uFEFF]/g;
const tidy = (s) => s.replace(ZERO_WIDTH, '').replace(/\s+/g, ' ').trim();
const pathOf = (url) => { const i = url.indexOf('/markdown/'); return i >= 0 ? url.slice(i + 1) : url; };

/** Counts below each node, and a parent link, over a finished forest. Returns how many nodes there are in all. */
function annotate(parent) {
  let n = 0;
  for (const child of parent.children) {
    child.parent = parent;
    child.below = annotate(child);
    n += 1 + child.below;
  }
  parent.below = n;
  return n;
}

/**
 * One index.md's nested list as a forest of `{ title, path, children }`. Anything that is not a list line — the frontmatter, the
 * heading — is ignored; a line indented two or more levels past its parent hangs from the deepest node there is.
 */
export function parseIndex(text) {
  const roots = [];
  const stack = [];
  for (const raw of String(text).split('\n')) {
    const m = ITEM.exec(raw.replace(/\r$/, ''));
    if (!m) continue;
    const depth = Math.min(Math.floor(m[1].length / 2), stack.length);
    const node = { title: tidy(m[2]), path: pathOf(m[3]), children: [] };
    (depth === 0 ? roots : stack[depth - 1].children).push(node);
    stack.length = depth;
    stack.push(node);
  }
  return roots;
}

/**
 * An area's whole hierarchy: its index.md, with the index.md of a sub-folder read into the node that links to it (so a page that only
 * that folder's index lists is below that folder's node). `read(rel)` answers the text of `markdown/<rel>` or `null`.
 */
export function loadArea({ read, area }) {
  const own = `${area}/index.md`;
  const text = read(own);
  if (text === null) return null;
  const root = { title: area, path: `markdown/${own}`, children: parseIndex(text), parent: null };
  const seen = new Set([own]);
  const merge = (nodes) => {
    for (const node of nodes) {
      const rel = /^markdown\/(.+\/index\.md)$/.exec(node.path)?.[1];
      if (rel && !seen.has(rel)) {
        seen.add(rel);
        const sub = read(rel);
        if (sub !== null) {
          const listed = new Set(node.children.map((c) => c.path));
          node.children.push(...parseIndex(sub).filter((c) => !listed.has(c.path)));
        }
      }
      merge(node.children);
    }
  };
  merge(root.children);
  annotate(root);
  return { area, root };
}

/** Every node of a tree below `start`, in the order the index lists them. */
export function* nodesOf(start) {
  for (const child of start.children) {
    yield child;
    yield* nodesOf(child);
  }
}

/** The nodes that carry a page path, in listing order: a page can be listed more than once, and `path#2` is the second. */
export const occurrences = (tree, path) => [...nodesOf(tree.root)].filter((n) => n.path === path);

const lineOf = (node, level) => `${'  '.repeat(level)}${node.title} — ${node.path}${node.below > 0 ? ` (+${node.below} below)` : ''}`;

/**
 * What one call prints for a start node: its own line, then its descendants to `depth` levels, as `{ lines, shown }` (`shown` are
 * the nodes that have a line). A call that would print more than the bound prints the first level only, and says so; a first level
 * that is itself too long is cut, and says so.
 */
export function renderOutline(start, depth = OUTLINE_DEPTH) {
  const levels = (limit) => {
    const lines = [lineOf(start, 0)];
    const shown = [start];
    const go = (node, level) => {
      if (level > limit) return;
      for (const child of node.children) { lines.push(lineOf(child, level)); shown.push(child); go(child, level + 1); }
    };
    go(start, 1);
    return { lines, shown };
  };
  const full = levels(depth);
  if (full.lines.length <= OUTLINE_LINES) return full;
  let first = depth > 1 ? levels(1) : full;
  const notes = [];
  if (depth > 1) {
    notes.push(`(depth ${depth} would print ${full.lines.length} lines, over the bound of ${OUTLINE_LINES}: this is the first level only; go down with --under <path or title>)`);
  }
  if (first.lines.length > OUTLINE_FIRST_LEVEL_MAX) {
    const hidden = first.lines.length - OUTLINE_FIRST_LEVEL_MAX;
    first = { lines: first.lines.slice(0, OUTLINE_FIRST_LEVEL_MAX), shown: first.shown.slice(0, OUTLINE_FIRST_LEVEL_MAX) };
    notes.push(`(${hidden} more nodes at this level are not printed; name one of the listed nodes with --under to go down)`);
  }
  return { lines: [...first.lines, ...notes], shown: first.shown };
}

const normalise = (arg) => String(arg).replaceAll('\\', '/').replace(/^(?:vendor\/)?(?:ServiceNowDocs\/)?/, '').replace(/\/+$/, '');

/** The areas on this checkout (a folder of `markdown/` with an index.md), sorted. */
function areasOn(corpus) {
  try {
    return readdirSync(join(corpus, 'markdown'), { withFileTypes: true })
      .filter((e) => e.isDirectory() && existsSync(join(corpus, 'markdown', e.name, 'index.md'))).map((e) => e.name).sort();
  } catch { return []; }
}

/**
 * `docs outline <area | page path> [--under <page path | title>] [--depth N]`. Returns the exit code, 0 printed, 2 refused (a bad
 * argument, an area or node that is not there), 3 no corpus; every printed line goes through `out`, every refusal through `err`.
 */
export function runOutline({ argv, root, spell, out = console.log, err = console.error }) {
  needSpell(spell, 'runOutline');
  const usage = `usage: ${spell.cli} docs outline <area | page path> [--under <page path | title>] [--depth <1-${MAX_DEPTH}>]`;
  const refuse = (...lines) => { for (const l of lines) err(l); return 2; };

  let target = null, under = null, depth = OUTLINE_DEPTH;
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--under') { under = argv[i + 1]; i += 1; if (under === undefined) return refuse(usage); }
    else if (a === '--depth') {
      const n = Number(argv[i + 1]);
      i += 1;
      if (!Number.isInteger(n) || n < 1 || n > MAX_DEPTH) return refuse(`docs outline: --depth wants a whole number from 1 to ${MAX_DEPTH}`, usage);
      depth = n;
    } else if (a.startsWith('--')) return refuse(`docs outline: no flag ${a}`, usage);
    else if (target === null) target = a;
    else return refuse(usage);
  }
  if (target === null) return refuse(usage);

  const corpus = join(root, CORPUS_DIR);
  if (!existsSync(join(corpus, 'markdown'))) {
    err(`docs outline: corpus missing — run ${spell.bootstrap} (or ${spell.cli} docs sync)`);
    return 3;
  }

  // The target is an area (`order-management`, `markdown/order-management`, or the area's own index.md that every call prints first) or a
  // page (`markdown/<area>/….md`, with or without its `markdown/` folder): what follows the area is never dropped.
  const arg = normalise(target);
  const parts = arg.replace(/^markdown\//, '').split('/');
  const area = parts[0];
  const pagePath = parts.length > 1 ? `markdown/${parts.join('/')}` : null;
  const isPage = pagePath !== null && pagePath !== `markdown/${area}/index.md`;
  const read = (rel) => {
    // Nothing above markdown/ is a corpus page: a `..` in a path is refused here, where every read goes through.
    if (rel.split('/').includes('..')) return null;
    try { return readFileSync(join(corpus, 'markdown', ...rel.split('/')), 'utf8'); } catch { return null; }
  };
  const tree = loadArea({ read, area });
  if (tree === null) {
    // An area of the corpus map that this checkout does not hold is a sparse corpus, not an area the corpus lacks: it is said that way,
    // as the banner's `Docs on disk:` line says it, so that it is never reported as not documented.
    let mapped = false;
    try { mapped = mapAreas(root).some((a) => a.area === area); } catch { /* no map: the area is simply not one */ }
    if (mapped && !existsSync(join(corpus, 'markdown', area))) {
      return refuse(`docs outline: "${area}" is an area of the corpus map that this checkout does not hold (a sparse corpus holds some areas only): `
        + `${spell.cli} docs sync --mode full brings the whole corpus`);
    }
    const near = areasOn(corpus).filter((a) => a.includes(area) || area.includes(a) || a.slice(0, 3) === area.slice(0, 3)).slice(0, 8);
    return refuse(`docs outline: no area named "${area}" with an index.md under vendor/ServiceNowDocs/markdown`
      + (near.length ? ` (nearest: ${near.join(', ')})` : ''));
  }

  let start = tree.root;
  const pick = (scope, wanted, where) => {
    // `wanted` is a page path, `path#N` for the Nth time it is listed, or a title.
    const numbered = /^(.+)#(\d+)$/.exec(wanted);
    const key = normalise(numbered ? numbered[1] : wanted);
    if (key.startsWith('markdown/') || key.endsWith('.md')) {
      const found = [...nodesOf(scope)].filter((n) => n.path === key);
      const at = numbered ? Number(numbered[2]) : 1;
      if (found.length < at) { refuse(`docs outline: ${key}${numbered ? `#${at}` : ''} is not in ${where}'s index`); return null; }
      return { node: found[at - 1], others: found.map((n, i) => (i === at - 1 ? null : `${key}#${i + 1}`)).filter(Boolean) };
    }
    const found = [...nodesOf(scope)].filter((n) => n.title.toLowerCase() === tidy(wanted).toLowerCase());
    if (found.length === 0) { refuse(`docs outline: no node titled "${wanted}" in ${where}`); return null; }
    if (found.length > 1) {
      refuse(`docs outline: ${found.length} nodes are titled "${tidy(wanted)}": ${found.slice(0, 10).map((n) => n.path).join(', ')} — pass the path`
        + ' (add #2 for the second time a page is listed)');
      return null;
    }
    const same = [...nodesOf(tree.root)].filter((n) => n.path === found[0].path);
    return { node: found[0], others: same.length > 1 ? same.map((n, i) => (n === found[0] ? null : `${n.path}#${i + 1}`)).filter(Boolean) : [] };
  };

  let others = [];
  if (isPage) {
    const hit = pick(tree.root, pagePath, area);
    if (hit === null) return 2;
    ({ node: start, others } = hit);
  }
  if (under !== null) {
    const hit = pick(start, under, area);
    if (hit === null) return 2;
    ({ node: start, others } = hit);
  }

  const { lines } = renderOutline(start, depth);
  for (const line of lines) out(line);
  if (others.length > 0) {
    out(`(the page also appears at ${others.length} other place${others.length === 1 ? '' : 's'}: ${others.join(', ')})`);
  }
  return 0;
}
