// Copyright 2026 Cvetomir Grigorov. Licensed under the Business Source License 1.1 (see LICENSE).
// snowarch — AI ServiceNow Architect. Not affiliated with or endorsed by ServiceNow, Inc.
/**
 * ARC-09-C185a — what ships, the export of it, and the guard that nothing the runtime reaches is left out.
 *
 * WHAT SHIPS is `COVERAGE`, the signed manifest's coverage (packages/snowarch/src/licence/integrity.ts): the files
 * tracked at HEAD that it covers. There is no second list. The signer reads the same definition, and the verifier
 * reads the copy each manifest stores.
 *
 * THE GUARD reads what the runtime reaches, by scanning, never from a hand list:
 *   1. imports — the import graph from the runtime's entry points: static imports, `export … from`, and literal
 *      dynamic imports;
 *   2. literal repo paths in runtime code — a script it spawns, a file it reads, a page it names in a printed line;
 *   3. paths a shipped document cites, by L05's own extraction (`citedPaths`).
 * A path any of them reaches that `COVERAGE` leaves out is a finding, unless it is a named exception with its reason:
 * a maintainers' module reached only behind `isEngineeringCheckout`, or a pointer for whoever works in the engineering
 * checkout.
 */
import { execFileSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, posix } from 'node:path';
import { COVERAGE, isCovered, tarEntries } from '../../tools/snowarch/lib/licence/manifest.mjs';
import { citedPaths } from '../../packages/contract/lint/lib/cited-paths.mjs';
import { isHistory } from '../../packages/contract/lint/lib/scan.mjs';

/** The runtime's entry points: the launcher's CLI, the session-start hook, and the MCP server `.mcp.json` starts. */
export const RUNTIME_ENTRIES = Object.freeze([
  'tools/snowarch/bin/snowarch.mjs',
  'tools/snowarch/hooks/session-start.mjs',
  'packages/snowarch/dist/server.js',
]);

/**
 * Named exceptions: a path the runtime reaches that does not ship, and why that is right. Each is one reference,
 * `from` the file that reaches it `to` the path it reaches. Nothing else is excused.
 */
export const EXCEPTIONS = Object.freeze([
  { from: 'tools/snowarch/lib/docs/family.mjs', to: 'tests/skills-lint.test.mjs',
    reason: '`docs family` refuses outside the engineering checkout, where the skills lint runs (isEngineeringCheckout)' },
  { from: 'tools/snowarch/lib/doctor/checks/engine-contract.mjs',
    to: 'packages/contract/lint/checks/l06-generated.mjs',
    reason: 'E-21 imports L06 only behind isEngineeringCheckout: it runs the generators, maintainers\' tools' },
]);

/** Paths a user's install creates at run time: never in the repository, so never shipped. */
const RUNTIME_LOCAL = Object.freeze(['.local/', '.claude/settings.local.json', 'clients/']);

const git = (root, args) => execFileSync('git', ['-C', root, ...args],
  { encoding: 'utf8', maxBuffer: 1 << 28, stdio: ['ignore', 'pipe', 'ignore'] });

/** Every file tracked at HEAD, sorted. */
export function trackedFiles(root) {
  return git(root, ['ls-tree', '-r', '-z', '--name-only', 'HEAD']).split('\0').filter(Boolean).sort();
}

/** The files that ship: tracked at HEAD and covered. */
export function shippedFiles(root, coverage = COVERAGE) {
  return trackedFiles(root).filter((p) => isCovered(p, coverage));
}

/**
 * Write the shipped files into `dir`, byte for byte as HEAD has them (from `git archive`, the signer's own source),
 * with the executable bit where git records it. No `.git`, no history. Returns how many files were written.
 */
export function exportTree(root, dir, coverage = COVERAGE) {
  const shipped = new Set(shippedFiles(root, coverage));
  const modes = new Map(git(root, ['ls-tree', '-r', '-z', 'HEAD']).split('\0').filter(Boolean)
    .map((line) => { const [meta, path] = line.split('\t'); return [path, meta.split(' ')[0]]; }));
  const archive = execFileSync('git', ['-C', root, 'archive', '--format=tar', 'HEAD'],
    { maxBuffer: 1 << 30, stdio: ['ignore', 'pipe', 'ignore'] });
  let written = 0;
  for (const entry of tarEntries(archive)) {
    if (entry.type !== '0' || !shipped.has(entry.path)) continue;
    const to = join(dir, entry.path);
    mkdirSync(dirname(to), { recursive: true });
    writeFileSync(to, entry.data);
    if (modes.get(entry.path) === '100755' && process.platform !== 'win32') chmodSync(to, 0o755);
    written += 1;
  }
  return written;
}

/** A relative import specifier, or a literal dynamic one, per line. */
const IMPORT = /(?:\bfrom\s*|\bimport\s*\(\s*|^\s*import\s+)['"](\.{1,2}\/[^'"]+)['"]/g;
/** A file read relative to the module itself: `new URL('../fixtures/x.json', import.meta.url)`. */
const URL_READ = /new URL\(\s*['"](\.{1,2}\/[^'"]+)['"]\s*,\s*import\.meta\.url\s*\)/g;
/** A repository path written as a string literal in code. */
const LITERAL = /['"`]((?:\.claude|scripts|tests|docs|templates|governance|packages|tools|vendor)\/[A-Za-z0-9_.\/-]*[A-Za-z0-9_\/-])['"`]/g;
const CODE = /\.(mjs|cjs|js)$/;

/** Lines of code, with the comment lines blanked: a path a comment names is not a reference. */
function codeLines(text) {
  let block = false;
  return text.split('\n').map((line) => {
    const t = line.trim();
    if (block) { if (t.includes('*/')) block = false; return ''; }
    if (t.startsWith('/*')) { if (!t.includes('*/')) block = true; return ''; }
    if (t.startsWith('//') || t.startsWith('*')) return '';
    return line;
  });
}

/** Does `path` ship — a file covered, or a directory with a covered file under it? */
function ships(path, coverage, shipped) {
  if (isCovered(path, coverage)) return true;
  // A directory, written with or without its slash: it ships when a file under it does.
  const dir = path.endsWith('/') ? path : `${path}/`;
  return shipped.some((p) => p.startsWith(dir));
}

const excepted = (exceptions, from, to) => exceptions.some((e) => e.from === from && e.to === to);

/**
 * Every reference the runtime makes to a path that does not ship: `{ path, from, line, kind }`, one per reference,
 * sorted. `surfaces` are the shipped documents to read citations from (directory prefixes or files); by default,
 * every shipped Markdown file.
 */
export function unlistedReferences(root, { coverage = COVERAGE, entries = RUNTIME_ENTRIES, surfaces = null,
  exceptions = EXCEPTIONS } = {}) {
  const shipped = shippedFiles(root, coverage);
  const findings = [];
  const report = (path, from, line, kind) => {
    if (path.startsWith('vendor/ServiceNowDocs')) return;          // the corpus: fetched by the docs pin, not shipped
    if (RUNTIME_LOCAL.some((x) => path === x || path.startsWith(x))) return;   // the user's own files, made at run time
    if (ships(path, coverage, shipped) || excepted(exceptions, from, path)) return;
    findings.push({ path, from, line, kind });
  };

  // 1 and 2: the import graph from the entries, and every literal repo path in the code it reaches.
  const seen = new Set();
  const queue = [...entries];
  while (queue.length > 0) {
    const file = queue.shift();
    if (seen.has(file) || !existsSync(join(root, file))) continue;
    seen.add(file);
    codeLines(readFileSync(join(root, file), 'utf8')).forEach((line, i) => {
      for (const m of line.matchAll(IMPORT)) {
        const to = posix.normalize(posix.join(posix.dirname(file), m[1]));
        if (excepted(exceptions, file, to)) continue;
        report(to, file, i + 1, 'import');
        if (CODE.test(to) || to.endsWith('.json')) queue.push(to);
      }
      for (const m of line.matchAll(URL_READ)) {
        report(posix.normalize(posix.join(posix.dirname(file), m[1])), file, i + 1, 'read');
      }
      for (const m of line.matchAll(LITERAL)) {
        const to = m[1];
        report(to, file, i + 1, 'literal');
        if (CODE.test(to) && ships(to, coverage, shipped)) queue.push(to);   // a script it runs: walk it too
      }
    });
  }

  // 3: what the shipped documents cite.
  const docs = shipped.filter((p) => p.endsWith('.md') && !isHistory(p)
    && (surfaces === null || surfaces.some((s) => p === s || p.startsWith(s))));
  for (const doc of docs) {
    // An HTML comment is not rendered: a generated file's header naming its generator points nobody anywhere.
    const rendered = readFileSync(join(root, doc), 'utf8').replace(/<!--[\s\S]*?-->/g, (c) => c.replace(/[^\n]/g, ' '));
    for (const { path, line } of citedPaths(rendered.split('\n'))) {
      report(path, doc, line, 'doc');
    }
  }
  return findings.sort((a, b) => a.path.localeCompare(b.path) || a.from.localeCompare(b.from) || a.line - b.line);
}
