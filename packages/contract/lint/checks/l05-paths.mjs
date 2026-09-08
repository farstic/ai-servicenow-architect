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
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { isHistory, readLines } from '../lib/scan.mjs';

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
    || p.includes('.local/') || /\.local\.json$/.test(p)   // per-checkout, absent from a clone
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
          if (!existsSync(join(ctx.root, path))) {
            findings.push({ file, line: i + 1, message: `dead path ${path}` });
          }
        }
      }
    });
  }
  return findings;
}
