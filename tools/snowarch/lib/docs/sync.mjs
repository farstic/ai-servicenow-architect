// ARC-03-S03 — recipe C: materialise the corpus, sparse, at the pin, and prove it is complete.
//
// Five steps plus a sixth that ADR-0008 made mandatory. On git 2.34.1 — stock Ubuntu 22.04 LTS,
// which floors.git still supports — `sparse-checkout set --cone <dirs>` stores `--cone` as a
// PATTERN, cone mode never engages, and the checkout silently omits the corpus's five root files,
// LICENSE among them. Every check the recipe otherwise performs passes: exit 0, correct HEAD, empty
// status. Only a completeness check catches it.
import { existsSync, readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';

export const ROOT_FILES = ['.gitignore', 'LICENSE', 'README.md', 'llms.txt', 'llms_template.txt'];

// maxBuffer matters here and the default is not enough: `git ls-files -v -z` over this corpus emits
// ~1.1 MB (48,997 index entries), and execFileSync's 1 MB default throws ENOBUFS mid-recipe. Found
// by running it — the crash dumps the whole listing into the exception, which is its own lesson
// about scanning a 300 MB corpus with a 1 MB pipe.
const run = (args, cwd, quiet = false) =>
  execFileSync('git', args, {
    cwd, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024,
    stdio: quiet ? 'pipe' : ['pipe', 'pipe', 'inherit'],
  });

export function readAreas(root, areasFile) {
  const p = join(root, areasFile);
  if (!existsSync(p)) throw new Error(`${areasFile} is missing — run: node scripts/gen-docs-areas.mjs --write`);
  return readFileSync(p, 'utf8').split('\n').map((l) => l.trim()).filter(Boolean);
}

// The repair step, NUL-safe and self-verifying — the corrected form from the S-07 record, NOT the
// defective snippet in ADR-0008 (awk's $2 truncates a path at the first space; without -z,
// `ls-files -v` C-quotes non-ASCII paths; and the original announced success without checking).
export function repairRootFiles(corpusPath) {
  const listSkippedRoot = () => run(['ls-files', '-v', '-z'], corpusPath, true)
    .split('\0').filter(Boolean)
    .filter((e) => e.startsWith('S '))
    .map((e) => e.slice(2))
    .filter((p) => !p.includes('/'));
  const skipped = listSkippedRoot();
  if (skipped.length === 0) return { repaired: 0 };
  run(['update-index', '--no-skip-worktree', '--', ...skipped], corpusPath, true);
  run(['checkout', '--', '.'], corpusPath, true);
  const left = listSkippedRoot();
  if (left.length) throw new Error(`repair failed: ${left.length} root path(s) still skipped`);
  return { repaired: skipped.length };
}

export function checkCompleteness(root, corpusDir, areas, pin) {
  const corpus = join(root, corpusDir);
  const missingRoot = ROOT_FILES.filter((f) => !existsSync(join(corpus, f)));
  const missingAreas = areas.filter((a) => !existsSync(join(corpus, ...a.split('/'))));
  let head = null, submodule = null;
  try { head = run(['rev-parse', 'HEAD'], corpus, true).trim(); } catch { /* not a repo */ }
  try { submodule = run(['submodule', 'status', corpusDir], root, true).trim(); } catch { /* none */ }
  // `ok` deliberately EXCLUDES missingAreas, and the distinction is the whole point of splitting
  // sync from verify. An area the sparse checkout could not materialise because UPSTREAM DOES NOT
  // HAVE IT is a citation defect, not a checkout defect — the checkout did everything it could.
  // markdown/now-assist is exactly that today (an agent cites it; it is not a directory at the pin),
  // and failing `sync` on it would block every corpus operation until ARC-03-S04 repairs the
  // citation. It is reported as a WARNING naming the repair, and `verify` is where it becomes an
  // error. What DOES fail a sync is a broken checkout: a missing root file (ADR-0008's silent
  // omission), the wrong pin, or a superproject that still calls the submodule uninitialised.
  return {
    ok: missingRoot.length === 0 && head === pin
        && submodule !== null && !submodule.startsWith('-'),
    missingRoot, missingAreas, head, pin,
    // A leading '-' from `git submodule status` means the superproject considers it UNINITIALISED,
    // which a clean `git status` inside the submodule does not reveal. Recipe C's fifth step
    // (`git submodule init`) is what clears it.
    initialised: submodule !== null && !submodule.startsWith('-'), submodule,
  };
}

export function syncCorpus({ root = process.cwd(), config, log = console.log } = {}) {
  const { docs } = config;
  const corpusDir = 'vendor/ServiceNowDocs';
  const corpus = join(root, corpusDir);
  const areas = readAreas(root, docs.areasFile);
  const t0 = Date.now();

  if (!existsSync(join(corpus, '.git'))) {
    log(`docs sync: cloning ${docs.upstream} (${areas.length} areas, shallow, sparse)`);
    run(['clone', '--filter=blob:none', '--no-checkout', '--depth', '1', '--sparse',
         '--branch', docs.family, docs.upstream, corpusDir], root);
  }
  run(['sparse-checkout', 'set', '--cone', ...areas], corpus);
  run(['fetch', '--depth', '1', 'origin', docs.pin], corpus);
  run(['checkout', docs.pin], corpus);
  try { run(['submodule', 'absorbgitdirs'], root, true); } catch { /* no gitlink yet is fine */ }
  run(['submodule', 'init'], root, true);            // step 5: without it the superproject says '-'

  const { repaired } = repairRootFiles(corpus);      // step 6: ADR-0008
  if (repaired) log(`docs sync: repaired ${repaired} root path(s) left skip-worktree by this git`);

  const completeness = checkCompleteness(root, corpusDir, areas, docs.pin);
  log(`docs sync: ${((Date.now() - t0) / 1000).toFixed(1)}s · pin ${docs.pin.slice(0, 7)} · `
    + `${completeness.ok ? 'complete' : 'INCOMPLETE'}`);
  return { completeness, repaired, areas };
}
