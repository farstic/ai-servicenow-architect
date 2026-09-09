import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { CORPUS_DIR, ROOT_FILES } from '../../tools/snowarch/lib/docs/sync.mjs';

/**
 * One fixture corpus, two consumers.
 *
 * ARC-03-S05 built this to exercise the sync recipe without a network; ARC-03-S06 needs the same
 * checkout to diverge in specific ways and be described. Written once here rather than twice: a
 * second fixture would drift, and the divergences S06 tests are only meaningful against the shape
 * S05 produces.
 *
 * Two states it goes out of its way to produce, because they are what break the recipe when they
 * are absent: a **pin that is not the branch tip** (a side-branch commit, so a `--depth 1` clone
 * genuinely lacks it and fetch-by-hash is real), and a superproject whose gitlink is registered but
 * UNINITIALISED, which is how a cloned engine repository actually arrives.
 */
const AREAS = ['markdown/alpha', 'markdown/beta', 'markdown/gamma'];
// 197 characters, the longest path in the real corpus — the Windows long-path case, on the matrix.
const LONG_NAME = `${'l'.repeat(197 - 'markdown/alpha/'.length - '.md'.length)}.md`;



/**
 * The fixture's own git, carrying `-c core.longpaths=true` on Windows exactly as the module does.
 *
 * Not defensive dressing — without it this fixture cannot be BUILT on `windows-latest`:
 * `git add -A` fails with `unable to index file` on the 197-character path, because a temp
 * directory prefix (`D:\a\…\Temp\snowarch-docs-sync-XXXXXX\src\`) is far longer than a normal
 * checkout prefix and the total passes 260. Worth recording against ARC-00 S-07 acceptance
 * criterion 2, which was refuted on the grounds that today's corpus fits: it fits under a SHORT
 * prefix. The margin is the prefix, and a temp directory eats it.
 */
const git = (args, cwd) => execFileSync(
  'git', process.platform === 'win32' ? ['-c', 'core.longpaths=true', ...args] : args,
  { cwd, encoding: 'utf8', stdio: 'pipe' },
);

function buildUpstream(dir) {
  const src = join(dir, 'src');
  mkdirSync(src, { recursive: true });
  git(['init', '-q', '-b', 'australia'], src);
  git(['config', 'user.email', 'fixture@example.invalid'], src);
  git(['config', 'user.name', 'fixture'], src);

  // Content, not the filename: a `.gitignore` whose body is `.gitignore` ignores itself, so
  // `git add -A` silently skips it and the completeness check then reports it missing — which it
  // did, on the first run of this fixture. The checker was right; the fixture was wrong.
  for (const f of ROOT_FILES) writeFileSync(join(src, f), `# fixture ${f}\n`);
  for (const a of AREAS) {
    mkdirSync(join(src, ...a.split('/')), { recursive: true });
    writeFileSync(join(src, ...a.split('/'), 'index.md'), `# ${a}\n`);
  }
  // `legal/` mirrors the real corpus: a root-level DIRECTORY that cone mode would not materialise,
  // which is why the recipe names it and the completeness check enforces it (ARC-03-S10).
  mkdirSync(join(src, 'legal'), { recursive: true });
  writeFileSync(join(src, 'legal', 'README.md'), '# Legal Information\n');
  writeFileSync(join(src, 'markdown/alpha', LONG_NAME), '# long\n');
  git(['add', '-A'], src);
  git(['commit', '-qm', 'first'], src);

  // The pin is NOT the branch tip: it sits on a side branch, so a `--depth 1` clone of `australia`
  // cannot have it and the fetch-by-hash step is genuinely exercised rather than skipped.
  git(['checkout', '-q', '-b', 'side'], src);
  writeFileSync(join(src, 'markdown/beta/extra.md'), '# extra\n');
  git(['add', '-A'], src);
  git(['commit', '-qm', 'the pinned commit'], src);
  const pin = git(['rev-parse', 'HEAD'], src).trim();

  // ARC-03-S07 needs the FAMILY TIP ahead of the pin, so `australia` fast-forwards onto the pinned
  // commit and then moves on. S05's property survives untouched: a `--depth 1` clone of `australia`
  // still lands on the tip and still does not have the pin, so fetch-by-hash is exercised there.
  git(['checkout', '-q', 'australia'], src);
  git(['merge', '-q', '--ff-only', 'side'], src);
  writeFileSync(join(src, 'markdown/gamma/added-upstream.md'), '# added upstream\n');
  git(['add', '-A'], src);
  git(['commit', '-qm', 'the upstream tip, one ahead of the pin'], src);
  const tip = git(['rev-parse', 'HEAD'], src).trim();

  // A tip that DELETES a cited file — the AC 2 shape. Its own branch, so one upstream serves both.
  git(['checkout', '-q', '-b', 'deletes-cited', pin], src);
  git(['rm', '-q', join('markdown', 'beta', 'extra.md')], src);
  git(['commit', '-qm', 'upstream removed a cited page'], src);
  const deletesCited = git(['rev-parse', 'HEAD'], src).trim();

  // ARC-03-S08 switches families, so the fixture upstream carries a second release family. Its own
  // commit, so a switch genuinely moves the pin rather than landing on the same tree.
  git(['checkout', '-q', '-b', 'zurich', 'australia'], src);
  writeFileSync(join(src, 'markdown/alpha/zurich-only.md'), '# zurich\n');
  git(['add', '-A'], src);
  git(['commit', '-qm', 'the zurich family tip'], src);
  const zurichTip = git(['rev-parse', 'HEAD'], src).trim();
  git(['checkout', '-q', 'australia'], src);

  // A branch BEHIND the pin — an upstream history rewrite. The ruling (2026-09-09) is to move to it
  // anyway and say so on the pin line, rather than silently refusing to go backwards.
  git(['branch', 'behind', `${pin}~1`], src);
  const behind = git(['rev-parse', 'behind'], src).trim();

  git(['checkout', '-q', 'australia'], src);

  const bare = join(dir, 'upstream.git');
  git(['clone', '-q', '--bare', src, bare], dir);
  return { bare, pin, tip, deletesCited, behind, zurichTip };
}

/** The path the fixture's citing skill points at, and which `deletes-cited` removes. */
const CITED_PAGE = 'markdown/beta/extra.md';

/**
 * A citation the corpus can satisfy or fail to satisfy.
 *
 * `verifyCitations` scans `.claude/skills` among its roots, so a workspace needs one to have any
 * citations at all — without it every before/after diff is empty and the S07 tests prove nothing.
 */
function writeCitingSkill(root, page = CITED_PAGE) {
  const dir = join(root, '.claude', 'skills', 'fixture');
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'SKILL.md'),
    `---\nname: fixture\ndescription: a fixture skill that cites the corpus\n---\n\n`
    + `# fixture\n\nGrounded in the corpus (citation: \`${page}\`).\n`);
  return join('.claude', 'skills', 'fixture', 'SKILL.md');
}

function makeWorkspace({ scratch, pin, upstreamUrl }) {
  const w = mkdtempSync(join(scratch, 'work-'));
  git(['init', '-q'], w);
  // The engine repository pins line endings (`* text=auto eol=lf`), so a fixture standing in for it
  // must too. Without this the workspace inherits the machine's `core.autocrlf`, and on the Windows
  // runner a file written LF, committed, and restored comes back CRLF — which is git behaving
  // correctly and a fixture that no longer resembles the repository it models. A dry-run restore
  // test comparing bytes across that round trip fails on line endings alone, which is what happened.
  writeFileSync(join(w, '.gitattributes'), '* text=auto eol=lf\n');
  mkdirSync(join(w, 'vendor'), { recursive: true });
  writeFileSync(join(w, 'vendor/docs-areas.txt'), `${AREAS.join('\n')}\n`);
  // The engine repository registers the corpus in `.gitmodules`, and recipe C's step 5
  // (`submodule init`) is what clears the superproject's leading `-`. A fixture without the entry
  // would exercise a path production never takes.
  writeFileSync(join(w, '.gitmodules'),
    `[submodule "${CORPUS_DIR}"]\n\tpath = ${CORPUS_DIR}\n\turl = ${upstreamUrl}\n\tbranch = australia\n\tshallow = true\n`);
  git(['add', '.gitattributes', '.gitmodules', 'vendor/docs-areas.txt'], w);
  // ...and the gitlink itself, unpopulated. A cloned engine repository arrives exactly like this:
  // `.gitmodules` plus a 160000 index entry and no checkout, which is what makes `git submodule
  // status` print a leading `-` until recipe C's step 5 runs. `update-index --cacheinfo` is how to
  // produce that state without a corpus on disk yet.
  git(['update-index', '--add', '--cacheinfo', '160000', pin, CORPUS_DIR], w);
  git(['-c', 'user.email=f@example.invalid', '-c', 'user.name=f', 'commit', '-qm', 'fixture'], w);
  if (!/^-/.test(git(['submodule', 'status', CORPUS_DIR], w))) {
    throw new Error('the fixture gitlink is not uninitialised');
  }
  return {
    root: w,
    config: {
      docs: { family: 'australia', pin, areasFile: 'vendor/docs-areas.txt', upstream: upstreamUrl },
    },
  };
}


export { AREAS, CITED_PAGE, LONG_NAME, git, buildUpstream, makeWorkspace, writeCitingSkill };
