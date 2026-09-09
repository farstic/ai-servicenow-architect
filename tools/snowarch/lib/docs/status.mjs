// ARC-03-S06 — one description of the corpus, computed here and wrapped everywhere else.
//
// The doctor (ARC-08) and the `/snowarch status` skill both need to say whether the corpus is
// present, pinned, on the right family, correctly sparse and fully cited. Before this file each
// would have re-derived it from git, and two derivations of the same fact are one that will
// disagree. This computes; ARC-08 assigns check ids, severities and `--fix` actions to what it
// returns. Nothing here ever touches the network — `--fetch` is S07's.
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { CORPUS_DIR, MODE, readAreas } from './sync.mjs';
import { verifyCitations } from './verify.mjs';

/** The object's version. Additions are non-breaking; a removal or a changed meaning is not. */
export const SCHEMA = 1;

/**
 * The four shapes a checkout can be in.
 *
 * `full` is `MODE.full` rather than a second spelling of the word: "the whole corpus is on disk" is
 * the same claim whether it arrives as a requested mode or as an observed shape, and writing it
 * twice would be two definitions of one fact — and two literals for the ARC-05-S10 scan to judge,
 * where the allow-list already carries exactly one argued row for this homograph.
 */
export const SPARSE = Object.freeze({ cone: 'cone', full: MODE.full, pattern: 'pattern', none: 'none' });

const git = (args, cwd) => {
  try {
    return {
      ok: true,
      out: execFileSync('git', args, { cwd, encoding: 'utf8', stdio: 'pipe', maxBuffer: 64 * 1024 * 1024 }).trim(),
    };
  } catch { return { ok: false, out: '' }; }
};

/** The gitlink the superproject records for the corpus, or null when it records none. */
function gitlinkOf(root) {
  const r = git(['ls-tree', 'HEAD', '--', CORPUS_DIR], root);
  if (!r.ok) return null;
  const m = /^160000 commit ([0-9a-f]{40})/.exec(r.out);
  return m ? m[1] : null;
}

/**
 * Which branch the checkout is on — the family it should be, not merely where HEAD points.
 *
 * Recipe C leaves a DETACHED HEAD at the pin, so `rev-parse --abbrev-ref HEAD` says `HEAD` and
 * tells us nothing about the family. The branch that actually matters is the remote branch the
 * clone tracks, so it is read from the clone's own config.
 */
function branchOf(corpus) {
  const head = git(['rev-parse', '--abbrev-ref', 'HEAD'], corpus).out;
  if (head && head !== 'HEAD') return head;
  const remote = git(['config', '--get', 'remote.origin.fetch'], corpus).out;
  const m = /refs\/heads\/([^:*]+)/.exec(remote);
  return m ? m[1] : null;
}

/**
 * `cone` | `full` | `pattern` | `none`.
 *
 * `pattern` is the ADR-0008 shape — sparse checkout on, cone mode off, which is what git 2.34.1
 * silently produces from `set --cone` and which omits the corpus's root files. It is reported as
 * its own value rather than folded into `cone`, because the remedy differs.
 */
function sparseOf(corpus) {
  if (!existsSync(join(corpus, '.git'))) return SPARSE.none;
  const on = git(['config', '--get', 'core.sparseCheckout'], corpus).out === 'true';
  if (!on) return SPARSE.full;
  return git(['config', '--get', 'core.sparseCheckoutCone'], corpus).out === 'true' ? SPARSE.cone : SPARSE.pattern;
}

/**
 * The recorded mode, and the checkout's shape, are two different questions.
 *
 * `mode` is what the operator ASKED for — ARC-06 writes it to `.local/bootstrap-state.json` — and
 * `sparse` is what is on disk. They can disagree (a state file saying `sparse` over a full
 * checkout), and reporting both is the point: the disagreement is the finding.
 */
function recordedMode(root) {
  const p = join(root, '.local', 'bootstrap-state.json');
  if (!existsSync(p)) return null;
  try {
    const m = JSON.parse(readFileSync(p, 'utf8'))?.docs?.mode;
    return (m === MODE.sparse || m === MODE.full || m === 'skip') ? m : null;
  } catch { return null; }
}

/** Files and bytes under the corpus, `.git` excluded. ~1 s over 35k files, so it is opt-in. */
function measure(corpus) {
  let fileCount = 0, sizeBytes = 0;
  const walk = (dir) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      if (e.name === '.git') continue;
      const p = join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.isFile()) { fileCount += 1; sizeBytes += statSync(p).size; }
    }
  };
  walk(corpus);
  return { fileCount, sizeBytes };
}

/**
 * Everything ARC-08 needs about the corpus, in one object.
 *
 * `verify` defaults to true. The doctor's `--quick` path and the SessionStart banner pass
 * `verify: false` and get `citations: null` — the KEY IS ALWAYS PRESENT, so a consumer distinguishes
 * "not asked" from "asked and empty" without knowing which caller it is. `measure` is opt-in for
 * the same reason: a 35k-file walk does not belong in a hook's budget.
 */
export function docsStatus({ root = process.cwd(), verify = true, measure: doMeasure = verify } = {}) {
  const config = JSON.parse(readFileSync(join(root, 'engine.config.json'), 'utf8'));
  const { docs } = config;
  const corpus = join(root, CORPUS_DIR);
  const present = existsSync(join(corpus, 'markdown'));

  let areasExpected = [];
  try { areasExpected = readAreas(root, docs.areasFile); } catch { /* generated file absent */ }

  const base = {
    present, path: CORPUS_DIR, pin: docs.pin, gitlink: gitlinkOf(root),
    head: null, pinMatchesGitlink: null, headMatchesPin: null,
    family: docs.family, branch: null, familyMatches: null,
    sparse: 'none', areasExpected, areasPresent: [], areasMissing: areasExpected,
    mode: recordedMode(root), fileCount: null, sizeBytes: null,
    citations: null,
    // Only meaningful on Windows: elsewhere the setting does not exist and `false` would read as
    // "off", which is a different claim from "not applicable".
    longpaths: null,
    schema: SCHEMA,
  };
  base.pinMatchesGitlink = base.gitlink === null ? null : base.gitlink === docs.pin;

  if (!present) {
    if (verify) base.citations = verifyCitations({ root });
    return base;
  }

  const head = git(['rev-parse', 'HEAD'], corpus).out || null;
  const branch = branchOf(corpus);
  const sparse = sparseOf(corpus);
  const areasPresent = areasExpected.filter((a) => existsSync(join(corpus, ...a.split('/'))));

  const out = {
    ...base,
    head,
    headMatchesPin: head === docs.pin,
    branch,
    familyMatches: branch === docs.family,
    sparse,
    areasPresent,
    areasMissing: areasExpected.filter((a) => !areasPresent.includes(a)),
    mode: base.mode ?? (sparse === SPARSE.full ? MODE.full : MODE.sparse),
    longpaths: process.platform === 'win32'
      ? git(['config', '--get', 'core.longpaths'], corpus).out === 'true'
      : null,
  };
  if (doMeasure) Object.assign(out, measure(corpus));
  if (verify) out.citations = verifyCitations({ root });
  return out;
}

const short = (sha) => (sha ? sha.slice(0, 7) : '—');
const commas = (n) => (n === null ? '—' : n.toLocaleString('en-US'));
const mb = (b) => (b === null ? '—' : `${Math.round(b / 1_000_000)} MB`);

/**
 * The human screen, and the exit code that goes with it.
 *
 * One line per fact with its verdict in the last column and, when it is not `ok`, the remedy on the
 * next line. The wording is reused verbatim by the doctor, so it is written once here.
 */
export function formatStatus(s) {
  if (!s.present) {
    return {
      text: `docs corpus: MISSING — run ./bootstrap.sh --docs sparse (or node scripts/docs.mjs sync)`,
      code: 3,
    };
  }

  const rows = [];
  const add = (label, body, ok, remedy) => rows.push({ label, body, ok, remedy });

  add('pin', `${short(s.pin)}  gitlink ${short(s.gitlink)}  HEAD ${short(s.head)}`,
    s.headMatchesPin && s.pinMatchesGitlink !== false,
    s.pinMatchesGitlink === false
      // S01's lint prints this sentence too; the two must not diverge. S07/S09 own the script.
      ? `maintainer: node scripts/docs-bump.mjs --to ${s.gitlink ?? '<gitlink>'}`
      : 'run node scripts/docs.mjs sync');

  add('family', `${s.family}  branch ${s.branch ?? '—'}`, s.familyMatches === true,
    'run node scripts/docs.mjs sync');

  const shape = s.sparse === SPARSE.cone ? 'sparse (cone)'
    : s.sparse === SPARSE.full ? SPARSE.full
      : s.sparse === SPARSE.pattern ? 'sparse (PATTERN mode — root files may be missing)' : SPARSE.none;
  const size = s.fileCount === null ? shape
    : `${shape}, ${s.areasPresent.length}/${s.areasExpected.length} areas, ${commas(s.fileCount)} files, ${mb(s.sizeBytes)}`;
  add('checkout', s.fileCount === null
    ? `${shape}, ${s.areasPresent.length}/${s.areasExpected.length} areas`
    : size,
  s.areasMissing.length === 0 && s.sparse !== SPARSE.pattern,
  s.areasMissing.length ? `missing: ${s.areasMissing.join(', ')} — run node scripts/docs.mjs sync`
    : 'run node scripts/docs.mjs sync');

  if (s.citations) {
    add('citations', `checked: ${s.citations.checked} | dead: ${s.citations.dead.length}`,
      s.citations.status === 'ok' && s.citations.dead.length === 0,
      'run node scripts/docs.mjs verify');
  }

  const width = Math.max(...rows.map((r) => r.body.length)) + 2;
  const lines = [`docs corpus: ${s.path}`];
  for (const r of rows) {
    lines.push(`  ${r.label.padEnd(10)} ${r.body.padEnd(width)}${r.ok ? 'ok' : 'MISMATCH'}`);
    if (!r.ok) lines.push(`             ${r.remedy}`);
  }
  return { text: lines.join('\n'), code: rows.every((r) => r.ok) ? 0 : 1 };
}
