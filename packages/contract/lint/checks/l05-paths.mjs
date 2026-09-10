/**
 * L05 — a repository path cited in prose that does not exist.
 *
 * A dead path in a document is worse than no path: it reads as checkable, so nobody checks it. The
 * failure mode is always the same shape — a file moves or is renamed, and the twenty documents that
 * cite it keep their old spelling because nothing reads them.
 *
 * What is NOT checked, and why: corpus citations (`vendor/ServiceNowDocs/…`) belong to ARC-03's
 * citation gate and are checked against the corpus, not the repository; `.local/…` is a per-checkout
 * path that does not exist in a clone; anything with a glob or a `<placeholder>` is a shape rather
 * than a path; and fenced code is a transcript, where a path that does not exist is often the point.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, realpathSync } from 'node:fs';
import { join } from 'node:path';

import { isHistory, readLines } from '../lib/scan.mjs';

/**
 * Paths that are real when the tool RUNS and are never in the repository.
 *
 * The list is explicit because the resolver below is otherwise absolute: anything not tracked is
 * a dead citation. `~/` and the two Windows variables are here for completeness rather than
 * effect — no scanned prefix begins with them today, so they cannot reach the resolver — and
 * naming them means adding such a prefix later cannot quietly turn a correct citation red.
 */
const RUNTIME_PREFIXES = ['.local/', '~/', '%APPDATA%', '%USERPROFILE%'];

/**
 * What the repository CONTAINS, asked of git rather than of this machine's disk.
 *
 * ARC-07-S05 shipped two comments citing the nested `node_modules` tree under the server package
 * while explaining that npm hoists it away — a dead citation that passed here (this working copy
 * had that directory: two packages npm nested for a version conflict) and failed on all nine CI
 * cells. `existsSync` answers with the state of one machine, so a check meant to say "a reader
 * can follow this" said "the author could". Tracked files are the same set on every clone.
 *
 * A submodule gitlink is one entry with mode 160000; it is a DIRECTORY to anyone citing it, so it
 * is registered with a trailing slash as well. Every parent directory of every tracked file is
 * registered too — `docs/` is real, though nothing is tracked under that name alone.
 *
 * The index is what is read, not HEAD: a file created by the story in hand resolves as soon as it
 * is `git add`ed, which is the point at which this repository's gates are run.
 */
function trackedPaths(root) {
  const out = execFileSync('git', ['-C', root, 'ls-files', '-sz'],
    { encoding: 'utf8', maxBuffer: 1 << 28, stdio: ['ignore', 'pipe', 'ignore'] });
  const tracked = new Set();
  for (const record of out.split('\0')) {
    if (!record) continue;
    const tab = record.indexOf('\t');
    const path = record.slice(tab + 1);
    tracked.add(path);
    if (record.slice(0, 6) === '160000') tracked.add(`${path}/`);
    let parent = path;
    let cut = parent.lastIndexOf('/');
    while (cut !== -1) {
      parent = parent.slice(0, cut);
      tracked.add(parent);
      tracked.add(`${parent}/`);
      cut = parent.lastIndexOf('/');
    }
  }
  return tracked;
}

/**
 * Is the lint root ITSELF a git repository — not merely somewhere inside one?
 *
 * "Is there an enclosing git tree?" was the first answer and it is the wrong question. A fixture
 * tree created under a `TMPDIR` that happens to sit inside an unrelated checkout is inside a work
 * tree, so the check would switch to tracked mode and then ask THAT repository about paths it has
 * never heard of — reporting every real path in the fixture as dead. It fails on the reviewer's
 * machine and passes in CI, which is precisely the environment-dependence this rule was written to
 * remove, arriving through the door the rewrite opened. (Found in review, one commit later.)
 *
 * `--show-toplevel` is run with the root as the working directory and compared against the root
 * itself through `realpathSync.native`: `/var` is a symlink to `/private/var` on macOS, git answers
 * with forward slashes on Windows, and a string compare of either pair says "different" about one
 * directory. Anything but an exact match — no git, a foreign toplevel, an error — is the disk.
 */
function isGitToplevel(root) {
  try {
    const toplevel = execFileSync('git', ['-C', root, 'rev-parse', '--show-toplevel'],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    if (!toplevel) return false;
    return realpathSync.native(toplevel) === realpathSync.native(root);
  } catch {
    return false;
  }
}

/**
 * The resolver, and the two cases that still read the disk.
 *
 * A fixture tree is not a repository — the lint's own suite builds one per case in a temp
 * directory — and "tracked" has no meaning there: the tree contains exactly what the test wrote,
 * with nothing ignored, so the disk IS the answer. A tree that merely SITS inside someone else's
 * repository is the same case for a different reason: that repository's index describes a
 * different project. The summary line says which rule ran and why, because a check that silently
 * changed its mind about what it was checking is how the original defect survived a green local
 * run in the first place.
 */
function resolver(root) {
  if (!isGitToplevel(root)) {
    return { how: 'filesystem: the root is not a git toplevel', has: (p) => existsSync(join(root, p)) };
  }
  try {
    const tracked = trackedPaths(root);
    return { how: 'tracked', has: (p) => tracked.has(p) || tracked.has(p.replace(/\/$/, '')) };
  } catch {
    return { how: 'filesystem: git could not list the index', has: (p) => existsSync(join(root, p)) };
  }
}

/**
 * A path a document names because it is COMING, not because it exists.
 *
 * `tests/fixtures/forthcoming-paths.json` already carries these for ARC-02-S02's SK-10, each entry
 * naming the story that creates the path. L05 reads the same file rather than keeping a second
 * list: two allow-lists for one idea is two places to forget.
 */
function forthcoming(root) {
  try {
    const raw = readFileSync(join(root, 'tests/fixtures/forthcoming-paths.json'), 'utf8');
    return new Set(JSON.parse(raw).allow.map((a) => `${a.file}\u0000${a.path}`));
  } catch {
    return new Set();     // the fixture is ARC-02's; its absence is not this check's failure
  }
}

export const id = 'L05';
export const title = 'every repository path cited in prose resolves';

const PREFIXES = ['CLAUDE.md', 'README.md', '.claude/', 'governance/', 'docs/', 'templates/',
  'tools/', 'packages/', 'scripts/', 'tests/', 'engine.config.json', 'vendor/docs-areas.txt'];

// Backticked paths and markdown link targets. Both are how a path is written to be followed.
const BACKTICK = /`([^`\n]+)`/g;
const LINK = /\]\(([^)\s]+)\)/g;

const isCandidate = (p) => PREFIXES.some((x) => p === x || p.startsWith(x));

function skip(p) {
  return p.startsWith('vendor/ServiceNowDocs')      // ARC-03's gate checks these against the corpus
    || RUNTIME_PREFIXES.some((x) => p.startsWith(x) || p.includes(x))   // real at run time, never here
    || /\.local\.json$/.test(p)
    || /[*?{}]/.test(p)                             // a glob is a shape, not a path
    || /[<>]/.test(p)                               // `<label>`, `docs/<name>.md`
    || p.endsWith('/**')
    || p.includes('…')
    // A path is cited as a file (it has an extension) or as a directory (trailing slash). Anything
    // else under a scanned prefix is a name that merely looks like one: `tools/list` is an MCP
    // method, a bare `packages/<name>` is a package. Requiring the shape is what tells them apart.
    || !(p.endsWith('/') || /\.[A-Za-z0-9]+$/.test(p));
}

/**
 * Files whose subject is paths that do not exist.
 *
 * `docs/decisions/**` only. An ADR records what was decided, including the paths a decision
 * removed, and is immutable once accepted — correcting its spelling would falsify it.
 *
 * `docs/ARCHITECTURE.md` was here and should not have been. It describes the CURRENT architecture:
 * its target tree is a fenced block, which this check already skips, and its History section names
 * removed files through the historical marker. Excluding it hid two genuinely wrong paths that this
 * very story then found by hand — which is the argument for checking it, not for exempting it.
 */
const ABOUT_ABSENT_PATHS = ['docs/decisions/'];

/**
 * A row that names the ARC which creates the path.
 *
 * `docs/ARCHITECTURE.md`'s owner table is one row per directory with its owning story beside it —
 * the same declaration `forthcoming-paths.json` carries, written where the reader sees it rather
 * than in a fixture they will not open. Treating it as a citation would demand that a document
 * about who builds what may only name things already built.
 */
const DECLARES_OWNER = /\*\*ARC-\d\d\*\*/;

/** True once a line is at or below a heading whose subject is what used to be here. */
const HISTORY_HEADING = /^#{2,3} (History|The D-03 cut ledger|Before \d)/;

export function run(ctx) {
  const findings = [];
  const planned = forthcoming(ctx.root);
  const resolve = resolver(ctx.root);
  let checked = 0;
  for (const file of ctx.files) {
    // History is excluded, for the same reason the name checks exclude it: a plan that cites the
    // file it is about to create, and a changelog that names a file deleted two releases ago, are
    // both correct about the moment they describe. `isHistory` is the one predicate — L01, L03 and
    // now L05 cannot drift apart about what counts as a record.
    if (isHistory(file) || ABOUT_ABSENT_PATHS.some((p) => file === p || file.startsWith(p))) continue;
    let fenced = false;
    let historical = false;
    readLines(ctx.root, file).forEach((line, i) => {
      if (line.trimStart().startsWith('```')) { fenced = !fenced; return; }
      if (fenced) return;
      // A document may be current above its history section and historical below it — the same
      // boundary `docs/CHANGELOG.md` uses. Below it, a path that no longer exists is the subject.
      if (HISTORY_HEADING.test(line)) historical = true;
      if (historical || DECLARES_OWNER.test(line)) return;
      const seen = new Set();
      for (const re of [BACKTICK, LINK]) {
        re.lastIndex = 0;
        let m;
        while ((m = re.exec(line)) !== null) {
          // Trim what prose puts next to a path: a trailing full stop, comma or bracket.
          const raw = m[1].trim().replace(/[).,;:]+$/, '');
          // `docs/README.md:157-159` cites a line range; the path is the part before it.
          const path = raw.replace(/^\.\//, '').split('#')[0].replace(/:\d+(-\d+)?$/, '');
          if (!path || seen.has(path) || !isCandidate(path) || skip(path)) continue;
          seen.add(path);
          if (planned.has(`${file}\u0000${path}`)) continue;
          checked += 1;
          if (!resolve.has(path)) {
            findings.push({ file, line: i + 1, message: `dead path ${path}` });
          }
        }
      }
    });
  }
  // What was CHECKED, on the status line: "L05 ok" alone cannot be told from "L05 read nothing",
  // and this check's scope is a filter over a filter over a regex.
  ctx.notes?.set(id, `${checked} citations, ${resolve.how}`);
  return findings;
}
