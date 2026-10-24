#!/usr/bin/env node
// Copyright 2026 Cvetomir Grigorov. Licensed under the Business Source License 1.1 (see LICENSE).
// snowarch — AI ServiceNow Architect. Not affiliated with or endorsed by ServiceNow, Inc.
// ARC-09-C250, P3 — generate vendor/docs-map.md, the corpus map: one row per `markdown/<area>/` folder with its title,
// its pages and its three most frequent `product:` values, under a header that says how to find a page.
//
// Folder names are not guessable — Virtual Agent is `conversational-interfaces`, Security Operations
// `security-management` — and an area's index.md is too large to read whole. So the map is generated from the WHOLE
// corpus at the pin and shipped: an install that is sparse by choice still reads every row, and the banner's
// `Docs on disk:` line says which of them this checkout has. A sparse or absent corpus cannot produce it, so `--check`
// says "not checked" there and `--write` refuses; a docs bump syncs the whole corpus and writes it with the pin.
//
// Exit 0 written, current or not checked · 1 stale · 2 cannot run.
import { execFileSync } from 'node:child_process';
import { closeSync, existsSync, openSync, readdirSync, readFileSync, readSync, writeFileSync, writeSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = 'vendor/docs-map.md';
const CORPUS = 'vendor/ServiceNowDocs';
const TOP = 3;
/** A page's frontmatter ends within this many bytes on the whole corpus (10,413 at most); a longer one is read whole. */
const HEAD_BYTES = 16 * 1024;

/** A table cell: one line, and never a `|`, which ends the cell on GitHub even inside backticks. */
const cell = (s) => String(s).replace(/\|/g, '/').replace(/\s+/g, ' ').trim();

/** Every `.md` file under a directory. */
function mdFiles(dir) {
  const out = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...mdFiles(p));
    else if (e.isFile() && e.name.endsWith('.md')) out.push(p);
  }
  return out;
}

/** A page's frontmatter block, read from its head; the whole page when the head does not close it. */
function frontmatter(path) {
  const buf = Buffer.alloc(HEAD_BYTES);
  const fd = openSync(path, 'r');
  let text;
  try { text = buf.toString('utf8', 0, readSync(fd, buf, 0, HEAD_BYTES, 0)); } finally { closeSync(fd); }
  if (!text.startsWith('---')) return '';
  let end = text.indexOf('\n---', 3);
  if (end < 0) {
    text = readFileSync(path, 'utf8');
    end = text.indexOf('\n---', 3);
  }
  return end < 0 ? '' : text.slice(3, end);
}

/** The value of one frontmatter key, unquoted, or null. */
function field(front, key) {
  const m = front.match(new RegExp(`^${key}:[ \\t]*(.*)$`, 'm'));
  const v = m?.[1].trim().replace(/^(['"])(.*)\1$/, '$2');
  return v || null;
}

/** llms.txt's titles by area: `- [Title](…/ServiceNowDocs/<family>/markdown/<area>/index.md)`. */
function llmsTitles(corpus) {
  const titles = new Map();
  const path = join(corpus, 'llms.txt');
  if (!existsSync(path)) return titles;
  for (const m of readFileSync(path, 'utf8').matchAll(/^- \[([^\]]+)\]\([^)]*\/markdown\/([a-z0-9][a-z0-9-]*)\/index\.md\)/gm)) {
    titles.set(m[2], m[1]);
  }
  return titles;
}

/** The release family the corpus's own links name (`…/ServiceNowDocs/<family>/markdown/…`), or null. */
function familyOf(corpus) {
  const path = join(corpus, 'llms.txt');
  const m = existsSync(path) && readFileSync(path, 'utf8').match(/\/ServiceNowDocs\/([a-z0-9-]+)\/markdown\//);
  return m ? m[1] : null;
}

/**
 * The corpus's areas: those of the checked-out commit (`inTree`), those of them not on disk (`missing`), and whether
 * the checkout is `whole`. Asked of git, because a cone leaves an area's folder off the disk and nothing on the disk
 * says the area exists.
 */
export function corpusShape(corpus) {
  let listing;
  try {
    listing = execFileSync('git', ['-c', 'core.quotepath=off', 'ls-tree', '-d', '--name-only', 'HEAD', 'markdown/'],
      { cwd: corpus, encoding: 'utf8', stdio: 'pipe' });
  } catch {
    return { whole: false, inTree: [], missing: [] };
  }
  const inTree = listing.split('\n').filter(Boolean).map((p) => p.replace(/^markdown\//, '')).sort();
  const missing = inTree.filter((a) => !existsSync(join(corpus, 'markdown', a)));
  return { whole: inTree.length > 0 && missing.length === 0, inTree, missing };
}

/** The map's text, from a whole corpus: the header, then one row per area folder. */
export function buildMap({ corpus, pin, family = familyOf(corpus) }) {
  const titles = llmsTitles(corpus);
  const areas = readdirSync(join(corpus, 'markdown'), { withFileTypes: true })
    .filter((e) => e.isDirectory()).map((e) => e.name).sort();
  const rows = areas.map((area) => {
    const dir = join(corpus, 'markdown', area);
    const index = join(dir, 'index.md');
    const pages = mdFiles(dir).filter((p) => p !== index);
    const counts = new Map();
    for (const p of pages) {
      const product = field(frontmatter(p), 'product');
      if (product) counts.set(product, (counts.get(product) ?? 0) + 1);
    }
    const top = [...counts].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0)).slice(0, TOP)
      .map(([name, n]) => `${cell(name)} (${n})`).join(' · ');
    const title = titles.get(area) ?? (existsSync(index) ? field(frontmatter(index), 'title') : null) ?? area;
    return `| \`markdown/${area}/\` | ${cell(title)} | ${pages.length} | ${top} |`;
  });
  return [
    `<!-- GENERATED by scripts/gen-docs-map.mjs from ${CORPUS} at ${pin} — do not edit; `
      + 'run node scripts/gen-docs-map.mjs --write on the whole corpus -->',
    '# The documentation corpus map',
    '',
    `One row per area folder of \`${CORPUS}/markdown/\`, made from the whole corpus at pin \`${pin}\`: the area's `
      + 'title, its pages, and its three most frequent `product:` values. Every row is here on any install; the '
      + 'banner\'s `Docs on disk:` line says which areas this checkout has.',
    '',
    'How to find a page:',
    '- Grep `markdown/*/index.md`: one line per page, with its title, its path and a summary.',
    `- Read a URL's \`/${family}/<area>/…\` as \`markdown/<area>/…\`.`,
    '- Grep `^product: <name>` in page frontmatter.',
    '- Prefer a product\'s own area to `delta-*` and release notes.',
    '',
    '| Area | Title | Pages | Top products |',
    '|---|---|---|---|',
    ...rows,
    '',
  ].join('\n');
}

/** The commit the corpus has checked out, or null. */
function headOf(corpus) {
  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], { cwd: corpus, encoding: 'utf8', stdio: 'pipe' }).trim();
  } catch { return null; }
}

function main(args) {
  const write = args.includes('--write');
  const check = args.includes('--check');
  const at = args.indexOf('--root');
  const root = at >= 0 && args[at + 1] ? resolve(args[at + 1]) : REPO;
  // Exactly one is required, as for gen-docs-areas.
  if (write === check) {
    writeSync(2, 'usage: node scripts/gen-docs-map.mjs (--check | --write) [--root <checkout>]\n');
    return 2;
  }
  let docs;
  try {
    docs = JSON.parse(readFileSync(join(root, 'engine.config.json'), 'utf8')).docs;
  } catch (e) {
    writeSync(2, `gen-docs-map: cannot read engine.config.json — ${e.message}\n`);
    return 2;
  }
  const corpus = join(root, CORPUS);
  const shape = corpusShape(corpus);
  const head = shape.whole ? headOf(corpus) : null;
  const why = !shape.whole
    ? (shape.inTree.length ? `${shape.missing.length} of ${shape.inTree.length} areas are not on disk`
      : 'there is no corpus checkout')
    : (head !== docs.pin ? `the corpus is on ${head ?? 'no commit'}, not the pin ${docs.pin}` : null);
  if (why) {
    if (check) {
      writeSync(1, `${OUT} not checked: ${why}\n`);
      return 0;
    }
    writeSync(2, `${OUT} not written: ${why}. The map is made from the whole corpus at the pin.\n`);
    return 2;
  }
  const body = buildMap({ corpus, pin: docs.pin, family: docs.family });
  const areas = body.split('\n').filter((l) => l.startsWith('| `markdown/')).length;
  if (write) {
    writeFileSync(join(root, OUT), body);
    writeSync(1, `${OUT} written (${areas} areas)\n`);
    return 0;
  }
  const current = existsSync(join(root, OUT)) ? readFileSync(join(root, OUT), 'utf8') : '';
  if (current === body) {
    writeSync(1, `${OUT} up to date (${areas} areas)\n`);
    return 0;
  }
  writeSync(2, `${OUT} is stale — run: node scripts/gen-docs-map.mjs --write\n`);
  return 1;
}

const isMain = process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));
if (isMain) process.exitCode = main(process.argv.slice(2));
