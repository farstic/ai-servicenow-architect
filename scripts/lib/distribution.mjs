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
 *   2. literal repo paths in runtime code — a script it spawns, a file it reads, a page it names in a printed line —
 *      whole, or as literal segments after a root (`join(root, 'packages', 'contract', 'x.json')`);
 *   3. paths a shipped document cites, by L05's own extraction (`citedPaths`).
 * A path any of them reaches that `COVERAGE` leaves out is a finding, unless it is a named exception with its reason:
 * a maintainers' module reached only behind `isEngineeringCheckout`, or a pointer for whoever works in the engineering
 * checkout.
 */
import { execFileSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, posix } from 'node:path';
import { COVERAGE, isCovered } from '../../tools/snowarch/lib/licence/manifest.mjs';
import { citedPaths } from '../../packages/contract/lint/lib/cited-paths.mjs';
import { isHistory } from '../../packages/contract/lint/lib/scan.mjs';

/** The runtime's entry points: the launcher's CLI, the session-start hook, and the MCP server `.mcp.json` starts. */
export const RUNTIME_ENTRIES = Object.freeze([
  'tools/snowarch/bin/snowarch.mjs',
  'tools/snowarch/hooks/session-start.mjs',
  'packages/snowarch/dist/server.js',
]);

/** The reason a maintainer's command is excused: the code prints it only in the engineering checkout. */
const MAINTAINER = 'a maintainer\'s command, printed only where isEngineeringCheckout(root) holds; an install reads E-32\'s remedy';

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
  { from: 'packages/contract/lib/contract.mjs', to: 'packages/contract/pin.mjs', reason: MAINTAINER },
  { from: 'tools/snowarch/lib/doctor/checks/engine-contract.mjs', to: 'packages/contract/pin.mjs', reason: MAINTAINER },
  { from: 'packages/contract/lint/lib/context.mjs', to: 'scripts/build-dist.mjs', reason: MAINTAINER },
  { from: 'tools/snowarch/lib/doctor/checks/engine-contract.mjs', to: 'scripts/build-dist.mjs', reason: MAINTAINER },
  { from: 'tools/snowarch/lib/docs/status.mjs', to: 'scripts/docs-bump.mjs', reason: MAINTAINER },
  { from: 'tools/snowarch/lib/doctor/checks/engine-docs.mjs', to: 'scripts/docs-bump.mjs', reason: MAINTAINER },
  { from: 'tools/snowarch/lib/doctor/checks/engine-roster.mjs', to: 'tests/skills-lint.test.mjs', reason: MAINTAINER },
  { from: 'tools/snowarch/lib/doctor/checks/engine-roster.mjs', to: 'tests/agents-lint.test.mjs', reason: MAINTAINER },
  { from: 'tools/snowarch/lib/docs/recipe-block.mjs', to: 'scripts/gen-docs-recipe.mjs',
    reason: 'the marker that opens ARCHITECTURE.md\'s generated region: an HTML comment matched to find it, not a pointer' },
]);

/**
 * Documents the guard does not read for citations, each with its reason. One today: ARCHITECTURE.md maps the
 * engineering tree for whoever reads the design, and its preamble says those paths are in the engineering checkout.
 */
export const DOC_EXEMPTIONS = Object.freeze([
  { doc: 'docs/ARCHITECTURE.md', reason: 'it maps the engineering checkout, and its preamble says the paths it cites '
    + 'under tests/, scripts/, docs/plans, docs/spikes and docs/decisions exist there, not in an install' },
]);

/** Paths a user's install creates at run time: never in the repository, so never shipped. */
const RUNTIME_LOCAL = Object.freeze(['.local/', '.claude/settings.local.json', 'clients/']);
const madeAtRunTime = (path) => RUNTIME_LOCAL.some((x) => path === x || path.startsWith(x))
  || path.startsWith('node_modules/') || path.includes('/node_modules/');   // `npm ci` makes these

/** A Markdown link whose target is a path in the repository: not a URL, not an in-page anchor. */
const RELATIVE_LINK = /\]\((?!https?:|mailto:|#|[a-z][a-z0-9+.-]*:)([^)\s]+)\)/gi;

/** A doc line that says where the path lives names it for a maintainer; it does not send a user to it. */
const ENGINEERING_POINTER = /\bin the engineering checkout\b/i;

/**
 * The named marker for a path list a scan classifies by — `// distribution: path list — <reason>` above it. The
 * list's paths are names the scan compares against, not files it opens; an absent one is simply not scanned.
 */
const PATH_LIST_MARKER = /\/\/\s*distribution: path list\b/;

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

/** Every entry of `ref`'s tree, recursively: `{ mode, type, sha, path }`. */
function treeEntries(root, ref) {
  return git(root, ['ls-tree', '-r', '-z', ref]).split('\0').filter(Boolean).map((line) => {
    const [meta, path] = line.split('\t');
    const [mode, type, sha] = meta.split(' ');
    return { mode, type, sha, path };
  });
}

/**
 * Blobs' bytes as git stores them, in the order asked, from one `git cat-file --batch`: no conversion the machine's
 * configuration would make on the way out, and one process for the whole tree rather than one per file.
 */
function blobsOf(root, shas) {
  if (shas.length === 0) return [];
  const out = execFileSync('git', ['-C', root, 'cat-file', '--batch'], { input: `${shas.join('\n')}\n`, maxBuffer: 1 << 30 });
  const blobs = [];
  let at = 0;
  for (const sha of shas) {
    const eol = out.indexOf(0x0a, at);
    const [got, type, size] = out.subarray(at, eol).toString('utf8').split(' ');
    if (got !== sha || type !== 'blob') throw new Error(`git cat-file answered "${got} ${type}" for ${sha}`);
    blobs.push(out.subarray(eol + 1, eol + 1 + Number(size)));
    at = eol + 1 + Number(size) + 1;        // the record's own trailing newline
  }
  return blobs;
}

/**
 * Write the shipped files into `dir`, byte for byte as HEAD stores them: each blob copied, as `stage` copies it, never
 * through `git archive`, whose bytes follow the exporting machine's core.autocrlf (a Windows runner wrote CRLF where
 * the blob holds LF). The executable bit where git records it. No `.git`, no history. Returns how many were written.
 */
export function exportTree(root, dir, coverage = COVERAGE) {
  const entries = treeEntries(root, 'HEAD').filter((e) => e.type === 'blob' && isCovered(e.path, coverage));
  const link = entries.find((e) => e.mode === '120000');
  if (link) throw new Error(`${link.path} is a symlink: the export writes files, and a link is not one`);
  blobsOf(root, entries.map((e) => e.sha)).forEach((bytes, i) => {
    const to = join(dir, entries[i].path);
    mkdirSync(dirname(to), { recursive: true });
    writeFileSync(to, bytes);
    if (entries[i].mode === '100755' && process.platform !== 'win32') chmodSync(to, 0o755);
  });
  return entries.length;
}

/** The corpus submodule: a gitlink in the tree, not a file, so `git archive` and the export leave it out. */
export const CORPUS_GITLINK = 'vendor/ServiceNowDocs';

/**
 * Who the distribution commit and tag say made them: the owner, by the name and the contact address NOTICE gives (the
 * owner's ruling, 2026-10-19). Fixed here, never read from the runner's git configuration, so two stagings agree
 * wherever they run.
 */
export const RELEASE_IDENTITY = Object.freeze({ name: 'Cvetomir Grigorov', email: 'cvetomirgrigorov@yahoo.bg' });

const gitIn = (dir, args, { input, env } = {}) => execFileSync('git', ['-C', dir, ...args], {
  encoding: 'utf8', maxBuffer: 1 << 28, input, env: env ? { ...process.env, ...env } : process.env,
  stdio: [input === undefined ? 'ignore' : 'pipe', 'pipe', 'pipe'],
}).trim();
const tryGit = (dir, args) => { try { return gitIn(dir, args); } catch { return null; } };

/** An annotated tag's message, verbatim, without a signature block; `null` for a ref that is not an annotated tag. */
function tagOf(root, ref) {
  if (tryGit(root, ['cat-file', '-t', `refs/tags/${ref}`]) !== 'tag') return null;
  const raw = execFileSync('git', ['-C', root, 'cat-file', 'tag', `refs/tags/${ref}`], { encoding: 'utf8' });
  const split = raw.indexOf('\n\n');
  const tagger = /^tagger .* (\d+ [+-]\d{4})$/m.exec(raw.slice(0, split));
  const sig = raw.search(/^-----BEGIN (PGP|SSH) SIGNATURE-----$/m);
  return { message: raw.slice(split + 2, sig === -1 ? raw.length : sig), date: tagger?.[1] ?? null };
}

/**
 * ARC-09-C185a — stage `ref` of the engineering checkout `root` as one commit in the distribution clone `clone`:
 * the shipped files, byte for byte as git stores them (the blobs are copied, never re-encoded, so a file
 * `.gitattributes` gives CRLF in a checkout keeps the engineering repository's blob), the corpus gitlink at `ref`'s
 * own pin, and nothing else. It never pushes.
 *
 * REPRODUCIBLE by construction: the release identity, the date of `ref`'s tag (or of its commit, for a ref that is not
 * a tag), the message `ref`, and the parent named by `onto` (none in a fresh clone). Staging the same ref twice on the
 * same parent gives the same commit. With `tag`, an annotated tag `ref` carries the engineering tag's message verbatim.
 *
 * `clone` is created with `git init` when it does not exist; an existing one must be clean, on a branch that is at
 * `onto` (or unborn, with no `onto`). Returns `{ commit, tree, parent, files, pin, tag }`.
 */
export function stage(root, clone, ref, { onto = null, tag = false, coverage = COVERAGE } = {}) {
  const commit = tryGit(root, ['rev-parse', '--verify', '--quiet', `${ref}^{commit}`]);
  if (!commit) throw new Error(`${ref} is not a commit in ${root}`);
  const annotated = tagOf(root, ref);
  if (tag && !annotated) throw new Error(`--tag needs an annotated tag; ${ref} is not one`);

  const entries = treeEntries(root, commit);
  const link = entries.find((e) => e.type === 'commit' && e.path === CORPUS_GITLINK);
  if (!link) throw new Error(`${ref} has no ${CORPUS_GITLINK} gitlink: the install could not pin its corpus`);
  const pinned = annotated && /^docs-pin: ([0-9a-f]{40})$/m.exec(annotated.message)?.[1];
  if (annotated && pinned !== link.sha) {
    throw new Error(`${ref}'s message pins the corpus at ${pinned ?? '(no docs-pin line)'}, its tree at ${link.sha}`);
  }
  const blobs = entries.filter((e) => e.type === 'blob' && isCovered(e.path, coverage));

  // The clone: made here, or one that is clean and whose branch is where the new commit's parent says.
  if (!existsSync(clone)) { mkdirSync(dirname(clone), { recursive: true }); gitIn(dirname(clone), ['init', '-q', '-b', 'main', clone]); }
  if (tryGit(clone, ['rev-parse', '--is-inside-work-tree']) !== 'true') throw new Error(`${clone} is not a git work tree`);
  if (gitIn(clone, ['status', '--porcelain']) !== '') throw new Error(`${clone} has uncommitted changes: staging needs a clean clone`);
  const branch = tryGit(clone, ['symbolic-ref', '-q', 'HEAD']);
  if (!branch) throw new Error(`${clone} is not on a branch`);
  const head = tryGit(clone, ['rev-parse', '--verify', '--quiet', 'HEAD']);
  const parent = onto === null ? null : tryGit(clone, ['rev-parse', '--verify', '--quiet', `${onto}^{commit}`]);
  if (onto !== null && !parent) throw new Error(`--onto ${onto} is not a commit in ${clone}`);
  if (head !== parent) {
    throw new Error(onto === null ? `${clone} has history: name the new commit's parent with --onto`
      : `${branch} is at ${head ?? '(no commit)'}, not at --onto ${onto}`);
  }
  if (tag && tryGit(clone, ['rev-parse', '--verify', '--quiet', `refs/tags/${ref}`])) throw new Error(`${clone} already has ${ref}`);

  // The blobs, copied: read from the engineering repository as stored, written into the clone without filters.
  const tmp = mkdtempSync(join(tmpdir(), 'snowarch-stage-'));
  try {
    const bytes = blobsOf(root, blobs.map((b) => b.sha));
    const files = blobs.map((b, i) => {
      const file = join(tmp, String(i));
      writeFileSync(file, bytes[i]);
      return file;
    });
    const written = blobs.length === 0 ? [] : gitIn(clone, ['hash-object', '-w', '--no-filters', '--stdin-paths'],
      { input: `${files.join('\n')}\n` }).split('\n');
    blobs.forEach((b, i) => {
      if (written[i] !== b.sha) throw new Error(`${b.path} did not copy byte for byte (${written[i]} ≠ ${b.sha})`);
    });
    const index = join(tmp, 'index');
    const lines = [...blobs.map((b) => `${b.mode} ${b.sha}\t${b.path}`), `160000 ${link.sha}\t${link.path}`];
    gitIn(clone, ['update-index', '--add', '--index-info'], { input: `${lines.join('\n')}\n`, env: { GIT_INDEX_FILE: index } });
    const tree = gitIn(clone, ['write-tree'], { env: { GIT_INDEX_FILE: index } });

    const date = annotated?.date ?? gitIn(root, ['show', '-s', '--format=%ct %cz', commit]);
    const who = { GIT_AUTHOR_NAME: RELEASE_IDENTITY.name, GIT_AUTHOR_EMAIL: RELEASE_IDENTITY.email,
      GIT_COMMITTER_NAME: RELEASE_IDENTITY.name, GIT_COMMITTER_EMAIL: RELEASE_IDENTITY.email,
      GIT_AUTHOR_DATE: `@${date}`, GIT_COMMITTER_DATE: `@${date}` };
    const made = gitIn(clone, ['commit-tree', '--no-gpg-sign', tree, ...(parent ? ['-p', parent] : []), '-m', ref],
      { env: who });
    gitIn(clone, ['update-ref', branch, made, ...(head ? [head] : [])]);
    gitIn(clone, ['reset', '-q', '--hard']);
    if (tag) {
      const msg = join(tmp, 'tag-message');
      writeFileSync(msg, annotated.message);
      gitIn(clone, ['tag', '-a', '--no-sign', '--cleanup=verbatim', '-F', msg, ref, made], { env: who });
    }
    return { commit: made, tree, parent, files: blobs.length, pin: link.sha, tag: tag ? ref : null };
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

/**
 * ARC-09-C185c — the repositories a shipped file may link, each with its reason (the owner's ruling, 2026-10-19). The
 * engineering repository goes private, and its name must not be discoverable from an install at all.
 */
export const ALLOWED_REPOS = Object.freeze([
  { repo: 'snowarch', reason: 'the distribution repository: what a user installs, upgrades from, and reports issues on' },
  { repo: 'snowarch-licences', reason: 'the licence and manifest repository the product fetches the revocation list and manifests from' },
]);
/** The engineering repository's name, built so this file is not a hit of its own scan. */
const ENGINEERING_NAME = new RegExp(['ai', 'servicenow', 'architect'].join('-'), 'i');
const FARSTIC_LINK = /github\.com[/:]farstic\/([A-Za-z0-9_.-]+)/g;
// A sentence's full stop is not part of a name: `…/snowarch-licences.` names snowarch-licences.
const allowedRepo = (name) => ALLOWED_REPOS.some((a) => a.repo === name.replace(/\.+$/, '').replace(/\.git$/, ''));

/** Does `text` name the engineering repository, or link a farstic repository other than the allowed ones? */
export function namesEngineering(text) {
  return ENGINEERING_NAME.test(text) || [...text.matchAll(FARSTIC_LINK)].some((m) => !allowedRepo(m[1]));
}

/**
 * Every line of a shipped file that names the engineering repository or links another farstic repository:
 * `{ file, line, text }`. Read from HEAD's blobs, the bytes that ship; generator inputs are read through the outputs
 * they compose, which ship.
 */
export function engineeringNames(root, { coverage = COVERAGE } = {}) {
  const hits = [];
  const entries = treeEntries(root, 'HEAD').filter((e) => e.type === 'blob' && isCovered(e.path, coverage));
  blobsOf(root, entries.map((e) => e.sha)).forEach((bytes, i) => {
    bytes.toString('utf8').split('\n').forEach((text, n) => {
      if (namesEngineering(text)) hits.push({ file: entries[i].path, line: n + 1, text: text.trim().slice(0, 160) });
    });
  });
  return hits;
}

/** A relative import specifier, or a literal dynamic one, per line. */
const IMPORT = /(?:\bfrom\s*|\bimport\s*\(\s*|^\s*import\s+)['"](\.{1,2}\/[^'"]+)['"]/g;
/** A file read relative to the module itself: `new URL('../fixtures/x.json', import.meta.url)`. */
const URL_READ = /new URL\(\s*['"](\.{1,2}\/[^'"]+)['"]\s*,\s*import\.meta\.url\s*\)/g;
/**
 * A repository path anywhere in a line of code: a string that is the path, or one that carries it mid-sentence, as a
 * printed remedy does (`'run node scripts/build-dist.mjs, then …'`). Not after a `/`, `.`, letter or digit, so a
 * relative import's tail or a URL's path is not read as one; comments are blanked before this runs.
 */
const LITERAL = /(?<![\w./@$-])((?:\.claude|scripts|tests|docs|templates|governance|packages|tools|vendor)\/[A-Za-z0-9_.\/-]*[A-Za-z0-9_\/-])/g;
/** A repository path built from literal segments after a root: `join(root, 'packages', 'contract', 'x.json')`. */
const JOINED = /\b(?:join|resolve)\(\s*[^'"`,()]+,((?:\s*['"][^'"]+['"]\s*,)*\s*['"][^'"]+['"])\s*\)/g;
const TOP = /^(?:\.claude|scripts|tests|docs|templates|governance|packages|tools|vendor)$/;
const CODE = /\.(mjs|cjs|js)$/;

/**
 * Lines of code, with the comment lines blanked: a path a comment names is not a reference. A path list under the
 * named marker is blanked too, from its opening `[` to the bracket that closes it.
 */
function codeLines(text) {
  let block = false;
  let list = 0;          // 0 outside a marked list; otherwise the bracket depth inside it (-1: marker seen, no `[` yet)
  return text.split('\n').map((line) => {
    const t = line.trim();
    if (PATH_LIST_MARKER.test(line)) { list = -1; return ''; }
    if (list !== 0) {
      const code = t.startsWith('//') || t.startsWith('*') ? '' : line.replace(/\/\/.*$/, '');
      for (const ch of code) {
        if (ch === '[') list = list === -1 ? 1 : list + 1;
        else if (ch === ']' && list > 0) list -= 1;
      }
      return '';
    }
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
    if (madeAtRunTime(path)) return;                                // the user's own files and dependencies
    if (coverage.excludes.includes(path)) return;                   // the coverage naming what it leaves out
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
      for (const m of line.matchAll(JOINED)) {
        const segments = [...m[1].matchAll(/['"]([^'"]+)['"]/g)].map((x) => x[1]);
        // One segment is LITERAL's to read; a path that does not start at a top-level directory is not the repo's.
        if (segments.length < 2 || !TOP.test(segments[0].split('/')[0])) continue;
        report(segments.join('/'), file, i + 1, 'literal');
      }
      for (const m of line.matchAll(LITERAL)) {
        const to = m[1];
        report(to, file, i + 1, 'literal');
        if (CODE.test(to) && ships(to, coverage, shipped)) queue.push(to);   // a script it runs: walk it too
      }
    });
  }

  // 3: what the shipped documents cite.
  const docs = shipped.filter((p) => p.endsWith('.md') && !isHistory(p) && !DOC_EXEMPTIONS.some((e) => e.doc === p)
    && (surfaces === null || surfaces.some((s) => p === s || p.startsWith(s))));
  for (const doc of docs) {
    // An HTML comment is not rendered: a generated file's header naming its generator points nobody anywhere.
    const lines = readFileSync(join(root, doc), 'utf8').replace(/<!--[\s\S]*?-->/g, (c) => c.replace(/[^\n]/g, ' '))
      .split('\n');
    const seenHere = new Set();
    for (const { path, line } of citedPaths(lines)) {
      if (ENGINEERING_POINTER.test(lines[line - 1] ?? '')) continue;
      seenHere.add(`${path}:${line}`);
      report(path, doc, line, 'doc');
    }
    // 3b: a relative Markdown link, resolved against the page's own directory. L05's extractor reads only a path with
    // a known prefix, so `[guide](CONTRIBUTING.md#x)` beside it was invisible.
    let fence = false;
    lines.forEach((text, i) => {
      if (/^\s*(```|~~~)/.test(text)) { fence = !fence; return; }
      if (fence || ENGINEERING_POINTER.test(text)) return;
      // A link in inline code is an example of the syntax, not a link.
      for (const m of text.replace(/`[^`]*`/g, '').matchAll(RELATIVE_LINK)) {
        const target = m[1].split('#')[0].split('?')[0];
        if (target === '') continue;
        const path = posix.normalize(posix.join(posix.dirname(doc), decodeURI(target)));
        if (path.startsWith('../') || seenHere.has(`${path}:${i + 1}`)) continue;
        report(path, doc, i + 1, 'link');
      }
    });
  }
  return findings.sort((a, b) => a.path.localeCompare(b.path) || a.from.localeCompare(b.from) || a.line - b.line);
}
