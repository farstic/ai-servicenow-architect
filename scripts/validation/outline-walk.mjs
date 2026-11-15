#!/usr/bin/env node
// Copyright 2026 Cvetomir Grigorov. Licensed under the Business Source License 1.1 (see LICENSE).
// snowarch — AI ServiceNow Architect. Not affiliated with or endorsed by ServiceNow, Inc.
// ARC-09-C284 — an offline walk of `docs outline`: how many calls, and how many printed lines, it takes to reach a page from its
// area's top by following the page's own branch.
//
// For each page: call 1 is `docs outline <area>` (two levels, the bound of 120 lines). If the page is not among the lines it printed,
// the next call is `docs outline <area> --under <the deepest ancestor of the page that was printed>`, and so on until a call prints the
// page. It uses the command's own renderer (tools/snowarch/lib/docs/outline.mjs), so the lines counted are the lines the command
// prints, notes included. It reads the corpus's index.md files from the working tree, or from the git objects of a pin
// (`--pin <rev>`), so one checkout answers for both c10276e and 96d3212. A page that is not at its path at the pin is looked for by its
// file name, in its area and then in the others, and said to have moved; one that is nowhere is absent, and is left out of the figures.
//
//   node scripts/validation/outline-walk.mjs [--corpus <dir>] [--pin <rev>] [--pages <file>] [-v] [<page path>...]
//   node scripts/validation/outline-walk.mjs [--corpus <dir>] [--pin <rev>] --areas
//
// Two readers are counted for each page. The ORACLE follows the page's own branch, so its calls are a floor. The LISTING-ORDER reader
// takes nothing from the titles: after a call that does not print the page it goes down the printed nodes that still have more below,
// in listing order and each to its end (depth first), and pays for every call and every line. It is one deterministic blind reader, not
// the worst case (where the page sits in the listing decides what it costs); a reader that uses the titles lies between the two.
//
// With no page it reads scripts/validation/outline-walk-pages.txt. `--areas` prints, for every area, the lines of its first level (what
// `docs outline <area> --depth 1` prints), of its first call (what `docs outline <area>` prints) and of the largest single call over
// every node of its index, and the median and the maximum of each over the areas. The target the architect set: at most 4 calls and
// 300 printed lines a page.
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, writeSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadArea, nodesOf, renderOutline } from '../../tools/snowarch/lib/docs/outline.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
export const TARGET = Object.freeze({ calls: 4, lines: 300 });
const MAX_CALLS = 12;

/** `read(rel)` for `markdown/<rel>` from the working tree of a corpus, or from the git objects of `pin` in it. */
export function readerFor({ corpus, pin = null }) {
  if (pin === null) {
    return (rel) => { try { return readFileSync(join(corpus, 'markdown', ...rel.split('/')), 'utf8'); } catch { return null; } };
  }
  return (rel) => {
    try {
      return execFileSync('git', ['-C', corpus, 'show', `${pin}:markdown/${rel}`], { encoding: 'utf8', maxBuffer: 1 << 28, stdio: ['ignore', 'pipe', 'ignore'] });
    } catch { return null; }
  };
}

/** The areas that have an index.md, at the working tree or at a pin, sorted. */
export function areasOf({ corpus, pin = null }) {
  const names = pin === null
    ? readdirSync(join(corpus, 'markdown'), { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name)
    : execFileSync('git', ['-C', corpus, 'ls-tree', '-d', '--name-only', pin, 'markdown/'], { encoding: 'utf8' }).split('\n').filter(Boolean).map((p) => p.replace(/^markdown\//, ''));
  return names.sort();
}

/** The nodes from the area's root down to `target`, the target last and the root left out. */
const chainTo = (target) => { const chain = []; for (let n = target; n && n.parent; n = n.parent) chain.unshift(n); return chain; };

/**
 * The calls a reader makes to reach `target` in `tree`: `[{ under, lines }]`, ending with the call whose lines include the page, or
 * with `reached: false` when the branch is not in what a call printed (a cut first level) and there is no deeper step to take.
 */
export function walkTo(tree, target) {
  const chain = chainTo(target);
  const calls = [];
  let start = tree.root;
  for (let step = 0; step < MAX_CALLS; step += 1) {
    const { lines, shown } = renderOutline(start);
    calls.push({ under: start === tree.root ? null : start.path, lines: lines.length });
    if (shown.some((n) => n.path === target.path)) return { calls, reached: true };
    const next = chain.filter((n) => shown.includes(n)).at(-1);
    if (!next || next === start) return { calls, reached: false };
    start = next;
  }
  return { calls, reached: false };
}

/**
 * The listing-order reader: it does not know the page's branch, so after a call that does not print the page it goes down the printed
 * nodes that still have more below (a node with children, none of which the call printed), in listing order and each to its end, before
 * the next. A node that a cut hid is never printed, so a page under it is not reached. The calls and lines are what it pays.
 */
export function walkBlind(tree, target) {
  const calls = [];
  let reached = false;
  const go = (start) => {
    const { lines, shown } = renderOutline(start);
    calls.push({ under: start === tree.root ? null : start.path, lines: lines.length });
    if (shown.some((n) => n.path === target.path)) { reached = true; return; }
    const inView = new Set(shown);
    for (const n of shown) {
      if (n !== start && n.children.length > 0 && !n.children.some((c) => inView.has(c))) {
        go(n);
        if (reached) return;
      }
    }
  };
  go(tree.root);
  return { calls, reached };
}

/** Finds a page's node at a pin: by its path, else by its file name in its area, else in any other area. */
export function locate({ area, path, load, areas }) {
  const tree = load(area);
  const here = tree ? [...nodesOf(tree.root)].filter((n) => n.path === path) : [];
  if (here.length > 0) return { tree, node: here[0], moved: null };
  const name = path.split('/').at(-1);
  const sameArea = tree ? [...nodesOf(tree.root)].filter((n) => n.path.split('/').at(-1) === name) : [];
  if (sameArea.length > 0) return { tree, node: sameArea[0], moved: sameArea[0].path };
  for (const other of areas.filter((a) => a !== area)) {
    const t = load(other);
    const found = t ? [...nodesOf(t.root)].filter((n) => n.path.split('/').at(-1) === name) : [];
    if (found.length > 0) return { tree: t, node: found[0], moved: found[0].path, candidates: found.length };
  }
  return { tree, node: null, moved: null };
}

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
const median = (xs) => { const s = [...xs].sort((a, b) => a - b); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };

/** The figures over the pages that were reached: median and maximum of the calls and of the lines, and how many are within the target. */
export function summarise(results) {
  const got = results.filter((r) => r.reached);
  const calls = got.map((r) => r.calls.length);
  const lines = got.map((r) => r.calls.reduce((n, c) => n + c.lines, 0));
  return {
    pages: results.length, reached: got.length,
    calls: got.length ? { median: median(calls), max: Math.max(...calls) } : null,
    lines: got.length ? { median: median(lines), max: Math.max(...lines) } : null,
    withinTarget: got.filter((r, i) => calls[i] <= TARGET.calls && lines[i] <= TARGET.lines).length,
  };
}

export function main(argv, { out = (l) => writeSync(1, `${l}\n`), err = (l) => writeSync(2, `${l}\n`) } = {}) {
  const value = (name) => { const i = argv.indexOf(name); return i === -1 ? null : argv[i + 1]; };
  const corpus = resolve(value('--corpus') ?? join(ROOT, 'vendor', 'ServiceNowDocs'));
  const pin = value('--pin');
  const verbose = argv.includes('-v');
  const flagValues = new Set(['--corpus', '--pin', '--pages']);
  const positional = argv.filter((a, i) => !a.startsWith('-') && !flagValues.has(argv[i - 1]));
  if (!existsSync(join(corpus, 'markdown'))) { err(`outline-walk: no corpus at ${corpus}`); return 3; }
  const read = readerFor({ corpus, pin });
  const cache = new Map();
  const load = (area) => { if (!cache.has(area)) cache.set(area, loadArea({ read, area })); return cache.get(area); };
  const areas = areasOf({ corpus, pin });
  out(`outline-walk: ${pin ? `pin ${pin}` : 'the working tree'} of ${corpus}, ${areas.length} areas`);

  if (argv.includes('--areas')) {
    out('area · nodes · first level (lines) · first call (lines) · largest single call (lines, at which node)');
    const figures = { level: [], first: [], largest: [] };
    for (const area of areas) {
      const tree = load(area);
      if (!tree) { out(`${area} · no index.md`); continue; }
      const level = renderOutline(tree.root, 1).lines.length;
      const first = renderOutline(tree.root).lines.length;
      let worst = { lines: first, at: '(the top)' };
      for (const n of nodesOf(tree.root)) {
        const lines = renderOutline(n).lines.length;
        if (lines > worst.lines) worst = { lines, at: n.path };
      }
      figures.level.push(level);
      figures.first.push(first);
      figures.largest.push(worst.lines);
      out(`${area} · ${tree.root.below} · ${level} · ${first} · ${worst.lines} (${worst.at})`);
    }
    const spread = (xs) => `median ${median(xs)}, max ${Math.max(...xs)}`;
    if (figures.first.length > 0) {
      out(`areas ${figures.first.length} · first level: ${spread(figures.level)} · first call: ${spread(figures.first)} · largest call: ${spread(figures.largest)}`);
    }
    return 0;
  }

  const file = value('--pages') ?? join(ROOT, 'scripts', 'validation', 'outline-walk-pages.txt');
  const pages = positional.length > 0 ? positional : readFileSync(file, 'utf8').split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#'));
  const results = [];
  const blindResults = [];
  let absent = 0;
  for (const page of pages) {
    const area = page.replace(/^markdown\//, '').split('/')[0];
    const found = locate({ area, path: page, load, areas });
    if (!found.node) { absent += 1; out(`${page} · absent at this pin`); continue; }
    const walk = walkTo(found.tree, found.node);
    const blind = walkBlind(found.tree, found.node);
    results.push(walk);
    blindResults.push(blind);
    const per = walk.calls.map((c) => c.lines);
    const where = found.moved ? ` · moved to ${found.moved}${found.candidates > 1 ? ` (${found.candidates} files of that name; the first)` : ''}` : '';
    const paid = `${plural(blind.calls.length, 'call')}, ${plural(blind.calls.reduce((n, c) => n + c.lines, 0), 'line')}`;
    out(`${page} · ${walk.reached ? 'reached' : 'NOT reached'} in ${plural(walk.calls.length, 'call')}, lines per call ${per.join(' + ')} = ${per.reduce((a, b) => a + b, 0)}`
      + ` · listing-order reader: ${blind.reached ? '' : 'NOT reached after '}${paid}${where}`);
    if (verbose) walk.calls.forEach((c, i) => out(`    call ${i + 1}: ${c.under ? `--under ${c.under}` : 'the area'} · ${c.lines} lines`));
  }
  const s = summarise(results);
  const unreached = s.pages - s.reached;
  out(`pages ${s.pages + absent}, reached ${s.reached}`
    + (absent + unreached > 0 ? ` (${[absent && `${absent} absent at this pin`, unreached && `${unreached} not reachable`].filter(Boolean).join(', ')})` : ''));
  const figures = (label, f) => `${label} — calls: median ${f.calls.median}, max ${f.calls.max} · lines: median ${f.lines.median}, max ${f.lines.max}`
    + ` · within ${TARGET.calls} calls and ${TARGET.lines} lines: ${f.withinTarget} of ${f.reached}`;
  if (s.calls) out(figures('oracle (the right branch every time)', s));
  const b = summarise(blindResults);
  if (b.calls) out(figures('listing-order reader (no title signal, depth first)', b));
  return 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exitCode = main(process.argv.slice(2));
