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

export const CORPUS_DIR = 'vendor/ServiceNowDocs';

/**
 * The two checkout modes, defined once.
 *
 * `FULL` is a homograph of the `full` TOOL PACKAGE, which is a contract name that engine tooling is
 * forbidden to spell (ARC-05-S10). It is not that name: this is how much of the docs corpus is on
 * disk, and it has no relationship to which MCP tools a preset exposes. The word is written here,
 * once, so the module compares against a constant rather than scattering a literal that a reader —
 * or a scan — has to judge four times over.
 */
export const MODE = Object.freeze({ sparse: 'sparse', full: 'full' });

/**
 * Exit codes. 0/1 are S03's; 4 and 5 are this story's, and they are distinct on purpose: 4 means
 * the operator has work in the tree and nothing was touched, 5 means git could not do the job. A
 * caller that collapsed them would tell someone to check their network when the real answer is
 * "you have unsaved edits".
 */
export const EXIT = { ok: 0, incomplete: 1, dirty: 4, git: 5 };

/** Carries the exit code out of the library so the CLI does not have to guess from the message. */
export class SyncError extends Error {
  constructor(message, code) { super(message); this.name = 'SyncError'; this.code = code; }
}

/**
 * On Windows every git call carries `-c core.longpaths=true`.
 *
 * **This is deliberately kept even though S-07 acceptance criterion 2 was REFUTED** — every recipe
 * passed on `windows-latest` with `core.longpaths=false`, because today's longest corpus path (197
 * characters) plus a checkout prefix still fits inside 260. The setting stays for two reasons: the
 * corpus grows and the margin is 60-odd characters, and it costs nothing when it is not needed.
 * Anyone removing it should read the S-07 record first and be arguing with the growth, not with a
 * failure they cannot reproduce today.
 */
const isWindows = () => process.platform === 'win32';
const withLongPaths = (args) => (isWindows() ? ['-c', 'core.longpaths=true', ...args] : args);

/**
 * The proxy URL as it may be printed: credentials removed, host and port kept.
 *
 * `user:password@host` is the shape a corporate proxy is configured in, and the whole point of the
 * proxy message is to print the address back at the operator — so it has to be printed without the
 * password that is sitting in their environment variable.
 */
export function maskProxy(url) {
  if (!url) return null;
  return String(url).replace(/\/\/[^/@]*@/, '//***@');
}

/** `host:port` from a proxy URL, for the message. Falls back to the masked URL if it will not parse. */
function proxyAddress(url) {
  try {
    const u = new URL(/^[a-z]+:\/\//i.test(url) ? url : `http://${url}`);
    return u.port ? `${u.hostname}:${u.port}` : u.hostname;
  } catch { return maskProxy(url); }
}

/** The host an upstream URL points at, for the DNS message. `file://` fixtures have none. */
export function upstreamHost(upstream) {
  try { return new URL(upstream).hostname || null; } catch { return null; }
}

/**
 * git's stderr → the sentence the operator needs.
 *
 * The matched substrings are libcurl's as surfaced by git, taken from the ARC-00 S-07 transcripts
 * (`docs/spikes/S-07-docs-submodule/`); fixture tests use `file://` URLs and cannot produce a single
 * one of them, which is why the classification is unit-tested against canned stderr and the
 * substrings themselves are S-07's deliverable. Matched case-insensitively: git surfaces libcurl's
 * casing, and it has varied across versions.
 */
export function classifyGitFailure(stderr, { upstream, pin, env = process.env } = {}) {
  const text = String(stderr ?? '');
  const low = text.toLowerCase();
  const proxy = env.HTTPS_PROXY || env.https_proxy || null;
  const host = upstreamHost(upstream) ?? 'the upstream';

  // Proxy first: with a proxy configured, "could not resolve" is about the PROXY, not github.com,
  // and sending someone to check their DNS is sending them to the wrong problem. (S-07 record,
  // "proxy misconfiguration" transcript.)
  if (proxy && (low.includes('could not resolve proxy') || low.includes('failed to connect to'))) {
    return `cannot reach proxy ${proxyAddress(proxy)} (HTTPS_PROXY) — fix the proxy address, `
      + 'or unset HTTPS_PROXY / add github.com to NO_PROXY, and re-run';
  }
  if (!proxy && low.includes('could not resolve host')) {
    return `cannot reach ${host} (DNS) — check your network and re-run`;
  }
  if (low.includes('ssl certificate problem')) {
    return 'TLS interception detected — set GIT_SSL_CAINFO (or git config http.sslCAInfo) to your '
      + 'corporate CA bundle and re-run; the MCP server needs the same bundle via '
      + 'NODE_EXTRA_CA_CERTS (docs/TROUBLESHOOTING.md)';
  }
  if (low.includes('not our ref') || low.includes("couldn't find remote ref")
      || low.includes('could not find remote ref')) {
    return `pin ${String(pin ?? '').slice(0, 7)} not fetchable from upstream (force-push or history `
      + 'rewrite?) — maintainer: run ./snowarch docs sync --upstream';
  }
  if (low.includes('no space left on device')) {
    return 'insufficient disk space: need ~400 MB free (~700 MB for --mode full)';
  }
  const first = text.split('\n').map((l) => l.trim()).find(Boolean) ?? '(no stderr)';
  return `git failed: ${first}`;
}

// maxBuffer matters here and the default is not enough: `git ls-files -v -z` over this corpus emits
// ~1.1 MB (48,997 index entries), and execFileSync's 1 MB default throws ENOBUFS mid-recipe. Found
// by running it — the crash dumps the whole listing into the exception, which is its own lesson
// about scanning a 300 MB corpus with a 1 MB pipe.
const run = (args, cwd, quiet = false) =>
  execFileSync('git', withLongPaths(args), {
    cwd, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024,
    stdio: quiet ? 'pipe' : ['pipe', 'pipe', 'inherit'],
  });

/**
 * `run`, but a git failure becomes the operator's sentence rather than a stack trace.
 *
 * Every git call the recipe makes goes through this. `quiet` is forced on: the classifier needs
 * stderr as a string, and it cannot have it if git inherited the terminal.
 */
const runMapped = (args, cwd, ctx) => {
  try {
    return execFileSync('git', withLongPaths(args), {
      cwd, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, stdio: 'pipe',
    });
  } catch (e) {
    throw new SyncError(classifyGitFailure(e.stderr ?? e.message, ctx), EXIT.git);
  }
};

/** git that is allowed to fail — a probe, not a step. */
const probe = (args, cwd) => {
  try { return { ok: true, out: run(args, cwd, true).trim() }; }
  catch (e) { return { ok: false, out: '', stderr: String(e.stderr ?? '') }; }
};

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

/**
 * The mode to sync in, when the caller did not say.
 *
 * ARC-06 writes `.local/bootstrap-state.json`; this only ever READS it, and only this one field.
 * `skip` is a bootstrap flag — it means "do not call sync at all" — so a state file carrying it is
 * refused rather than silently treated as `sparse`, which would materialise a corpus the operator
 * deliberately declined.
 */
export function resolveMode(root, requested) {
  if (requested) {
    if (requested === 'skip') {
      throw new SyncError('--docs skip is a bootstrap flag, not a sync mode: skip means do not call '
        + 'sync. Run with --mode sparse or --mode full.', EXIT.git);
    }
    if (requested !== MODE.sparse && requested !== MODE.full) {
      throw new SyncError(`unknown mode "${requested}" — expected sparse or full`, EXIT.git);
    }
    return requested;
  }
  const statePath = join(root, '.local', 'bootstrap-state.json');
  if (existsSync(statePath)) {
    try {
      const recorded = JSON.parse(readFileSync(statePath, 'utf8'))?.docs?.mode;
      if (recorded === 'skip') {
        throw new SyncError('.local/bootstrap-state.json records docs.mode "skip": skip means do not '
          + 'call sync. Run with an explicit --mode sparse or --mode full to override.', EXIT.git);
      }
      if (recorded === MODE.sparse || recorded === MODE.full) return recorded;
    } catch (e) {
      if (e instanceof SyncError) throw e;
      // A corrupt state file is ARC-06's problem to report, not a reason to refuse to sync.
    }
  }
  return MODE.sparse;
}

/** What the checkout looks like right now — every question the reconcile needs, asked once. */
export function inspect(root, config, areas) {
  const corpus = join(root, CORPUS_DIR);
  if (!existsSync(join(corpus, '.git'))) return { present: false };

  const head = probe(['rev-parse', 'HEAD'], corpus).out;
  // `--get` rather than `list`: once sparse checkout is disabled, `sparse-checkout list` exits 128
  // on git 2.39.5 with "fatal: this worktree is not sparse", so asking it is not a way to find out
  // whether the worktree is sparse. The config value is.
  const sparseOn = probe(['config', '--get', 'core.sparseCheckout'], corpus).out === 'true';
  const coneOn = probe(['config', '--get', 'core.sparseCheckoutCone'], corpus).out === 'true';
  const list = sparseOn ? probe(['sparse-checkout', 'list'], corpus) : { ok: false, out: '' };
  const sparseList = list.ok ? list.out.split('\n').map((l) => l.trim()).filter(Boolean) : [];
  const dirty = probe(['status', '--porcelain'], corpus).out !== '';
  const submodule = probe(['submodule', 'status', CORPUS_DIR], root).out;
  const pinPresent = probe(['cat-file', '-e', `${config.docs.pin}^{commit}`], corpus).ok;

  const sameSet = sparseList.length === areas.length
    && [...sparseList].sort().join('\0') === [...areas].sort().join('\0');

  return {
    present: true, head, dirty, sparseOn, coneOn, sparseList, sameSet, pinPresent,
    submodule, initialised: submodule !== '' && !submodule.startsWith('-'),
    atPin: head === config.docs.pin,
  };
}

/**
 * The git commands this module would run, as strings — the single source `--print-recipe` prints
 * and `docs/ARCHITECTURE.md` embeds for the launchers to execute when Node is absent.
 *
 * Written from the repository root with `-C`, because that is where a launcher stands. `state`
 * defaults to "nothing on disk", which is the case the ARCHITECTURE block documents.
 */
export function planRecipe({ config, areas, mode = MODE.sparse, state = { present: false } } = {}) {
  const { docs } = config;
  const C = ['-C', CORPUS_DIR];
  const g = (...a) => `git ${a.join(' ')}`;
  const lines = [];

  if (!state.present) {
    lines.push(g('clone', '--filter=blob:none', '--no-checkout', '--depth', '1', '--sparse',
      '--branch', docs.family, docs.upstream, CORPUS_DIR));
  }
  if (mode === MODE.sparse) {
    if (state.present && state.sparseOn && !state.coneOn) lines.push(g(...C, 'sparse-checkout', 'init', '--cone'));
    lines.push(g(...C, 'sparse-checkout', 'set', '--cone', ...areas));
  } else {
    lines.push(g(...C, 'sparse-checkout', 'disable'));
  }
  if (!state.present || !state.pinPresent) lines.push(g(...C, 'fetch', '--depth', '1', 'origin', docs.pin));
  if (!state.present || !state.atPin) lines.push(g(...C, 'checkout', '--detach', docs.pin));
  lines.push(g('submodule', 'absorbgitdirs', CORPUS_DIR));
  if (!state.present || !state.initialised) lines.push(g('submodule', 'init', '--', CORPUS_DIR));
  if (isWindows()) lines.push(g(...C, 'config', 'core.longpaths', 'true'));
  return lines;
}

/**
 * Make `vendor/ServiceNowDocs` match the pin, the areas and the requested mode — from nothing, from
 * a stale checkout, or from a wrong sparse set — and do nothing at all when it already does.
 *
 * The reconcile order matters and each step is idempotent:
 *   1. dirty tree → refuse, touch nothing
 *   2. clone, if there is no checkout
 *   3. mode: full → `sparse-checkout disable`; sparse → `init --cone` when the config is pattern
 *      mode, then `set --cone` when the list disagrees with the areas file
 *   4. pin: fetch by hash only when the object is absent, then `checkout --detach`
 *   5. gitlink: `absorbgitdirs`, then `submodule init` when the superproject still says `-`
 *   6. ADR-0008's root-file repair
 *
 * A second run on a clean checkout reaches step 6 having issued no git WRITE at all — the probes in
 * `inspect` are reads — which is what makes "up to date" fast and safe to run from a hook.
 */
export function syncCorpus({ root = process.cwd(), config, mode: requestedMode, log = console.log,
  quiet = false } = {}) {
  const { docs } = config;
  const corpus = join(root, CORPUS_DIR);
  const areas = readAreas(root, docs.areasFile);
  const mode = resolveMode(root, requestedMode);
  const ctx = { upstream: docs.upstream, pin: docs.pin };
  const say = quiet ? () => {} : log;
  const t0 = Date.now();
  const phase = (label, fn) => {
    const t = Date.now();
    const r = fn();
    say(`[docs] ${label} … ${((Date.now() - t) / 1000).toFixed(1)} s`);
    return r;
  };

  let state = inspect(root, config, areas);

  // 1. The refusal comes first and is absolute. Someone edited a doc; sync's job is to say so, not
  //    to decide their edit was unimportant. `--force` is never reached for from here.
  if (state.present && state.dirty) {
    throw new SyncError(`${CORPUS_DIR} has local changes — commit, stash or discard them, `
      + 'then re-run', EXIT.dirty);
  }

  if (!state.present) {
    phase(`clone (depth 1, blobless, ${mode})`, () => runMapped(
      ['clone', '--filter=blob:none', '--no-checkout', '--depth', '1', '--sparse',
        '--branch', docs.family, docs.upstream, CORPUS_DIR], root, ctx));
    state = inspect(root, config, areas);
  }

  if (isWindows()) runMapped(['config', 'core.longpaths', 'true'], corpus, ctx);

  // 3. Mode. Sparse→full and full→sparse are config changes on the existing checkout; neither
  //    re-clones, which is what keeps `.git` the same size across a switch.
  if (mode === MODE.full) {
    if (state.sparseOn) phase('sparse disable (full mode)', () => runMapped(['sparse-checkout', 'disable'], corpus, ctx));
  } else {
    if (state.sparseOn && !state.coneOn) {
      phase('sparse init --cone (pattern-mode config found)', () => runMapped(['sparse-checkout', 'init', '--cone'], corpus, ctx));
    }
    if (!state.sparseOn || !state.coneOn || !state.sameSet) {
      phase(`sparse set (${areas.length} areas)`, () => runMapped(['sparse-checkout', 'set', '--cone', ...areas], corpus, ctx));
    }
  }

  // 4. The pin. `cat-file -e` decides whether the fetch is needed: GitHub serves reachable SHAs by
  //    hash (S-07), but a fetch we do not need is ~30 s we do not spend.
  if (!state.pinPresent) {
    phase(`fetch pin ${docs.pin.slice(0, 7)}`, () => runMapped(['fetch', '--depth', '1', 'origin', docs.pin], corpus, ctx));
  }
  if (!state.atPin) {
    phase(`checkout --detach ${docs.pin.slice(0, 7)}`, () => runMapped(['checkout', '--detach', docs.pin], corpus, ctx));
  }

  // 5. The gitlink. absorbgitdirs is allowed to fail — before the superproject knows about the
  //    path there is nothing to absorb, and that is not an error.
  try { run(['submodule', 'absorbgitdirs', CORPUS_DIR], root, true); } catch { /* no gitlink yet */ }
  if (!state.initialised) {
    // `submodule init` needs a `.gitmodules` entry for the path. The engine repository has one, so
    // in production this is recipe C's step 5 and its failure would matter — but a workspace that
    // has not registered the corpus as a submodule is a legitimate state (a plain directory
    // checkout), and refusing to finish there would be refusing over the superproject's bookkeeping
    // rather than over the corpus. Warn, and let `checkCompleteness` report `initialised: false`.
    const init = probe(['submodule', 'init', '--', CORPUS_DIR], root);
    if (!init.ok) {
      say(`[docs] note: ${CORPUS_DIR} is not registered in .gitmodules — the corpus is checked out, `
        + 'but the superproject will keep reporting it uninitialised');
    }
  }

  const { repaired } = repairRootFiles(corpus);      // 6. ADR-0008
  if (repaired) say(`[docs] repaired ${repaired} root path(s) left skip-worktree by this git`);

  const completeness = checkCompleteness(root, CORPUS_DIR, areas, docs.pin);
  const after = inspect(root, config, areas);
  const elapsed = (Date.now() - t0) / 1000;
  const changed = !state.present || !state.atPin || !state.sameSet || repaired > 0
    || (mode === MODE.full) !== !after.sparseOn;

  if (!changed) {
    say(`[docs] up to date (pin ${docs.pin.slice(0, 7)}, ${mode}, ${areas.length} areas)`);
  } else {
    say(`[docs] ${elapsed.toFixed(1)} s · pin ${docs.pin.slice(0, 7)} · ${mode} · `
      + `${completeness.ok ? 'complete' : 'INCOMPLETE'}`);
  }
  return { completeness, repaired, areas, mode, elapsed, changed, state: after };
}
