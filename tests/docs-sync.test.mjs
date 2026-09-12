import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  ALWAYS_DIRS, ATTRIBUTION, CORPUS_DIR, EXIT, MODE, SyncError, classifyGitFailure, coneArgs, inspect, maskProxy,
  planRecipe, resolveMode, ROOT_FILES, syncCorpus,
} from '../tools/snowarch/lib/docs/sync.mjs';
// One fixture, shared with tests/docs-status.test.mjs — see tests/helpers/docs-fixture.mjs.
import { AREAS, LONG_NAME, buildUpstream, git, makeWorkspace } from './helpers/docs-fixture.mjs';

let scratch, upstream, upstreamUrl;
const workspace = () => makeWorkspace({ scratch, pin: upstream.pin, upstreamUrl });

/**
 * The whole recipe, against a corpus we build ourselves.
 *
 * No network: the "upstream" is a bare repository in a temp directory reached over `file://`, which
 * is enough to exercise clone, sparse cone, pin-by-hash, mode switching and the dirty refusal in
 * about a second. What it CANNOT produce is any of the network failures — a `file://` clone never
 * emits "Could not resolve host" — so the classification is tested separately against canned
 * stderr, and the substrings themselves come from ARC-00 S-07's real-run transcripts.
 *
 * Two states the fixture goes out of its way to produce, because they are the ones that broke the
 * recipe in review: a **pin that is not the branch tip** (second commit on a side branch, so the
 * shallow clone genuinely does not have it and the fetch-by-hash path is real), and a submodule
 * whose `.git` is a **file** rather than a directory (what `absorbgitdirs` leaves behind), so the
 * "is there a checkout here" probe is tested both ways.
 */
const silent = () => {};
const corpusOf = (w) => join(w.root, CORPUS_DIR);

before(() => {
  scratch = mkdtempSync(join(tmpdir(), 'snowarch-docs-sync-'));
  upstream = buildUpstream(scratch);
  // `pathToFileURL`, never `file://${path}` — a Windows path is not a URL path, and a URL's
  // `pathname` is not a filesystem path.
  upstreamUrl = pathToFileURL(upstream.bare).href;
});

after(() => { rmSync(scratch, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); });

test('AC 1 — a fresh sync lands at the pin, sparse, complete, initialised', () => {
  const w = workspace();
  const r = syncCorpus({ ...w, log: silent });
  const s = inspect(w.root, w.config, r.areas);

  assert.equal(s.head, upstream.pin, 'HEAD is not the pin');
  assert.equal(s.sparseOn, true);
  assert.equal(s.coneOn, true);
  assert.deepEqual([...s.sparseList].sort(), [...coneArgs(AREAS)].sort());
  assert.equal(s.initialised, true, `superproject still reports uninitialised: ${s.submodule}`);
  assert.equal(r.completeness.ok, true);
  for (const f of ROOT_FILES) assert.ok(existsSync(join(corpusOf(w), f)), `missing root file ${f}`);
  // The NOTICE claim, enforced: cone mode would leave a root-level DIRECTORY out, so the recipe
  // names it and this is what stops the claim decaying into prose nobody checks.
  for (const d of ALWAYS_DIRS) assert.ok(existsSync(join(corpusOf(w), d)), `missing always-dir ${d}`);
  // The pin's own content, not just its hash — proof the checkout followed the fetch.
  assert.ok(existsSync(join(corpusOf(w), 'markdown/beta/extra.md')), 'the pinned commit is not checked out');
  assert.ok(existsSync(join(corpusOf(w), 'markdown/alpha', LONG_NAME)), 'the 197-char path is absent');
});

/** A phase line: `[docs] <label> … N.N s`. One is printed per unit of work `syncCorpus` does. */
const PHASE_LINE = / … \d+\.\d s$/;

test('AC 2 — a second run changes nothing and says so', () => {
  const w = workspace();
  syncCorpus({ ...w, log: silent });
  const lines = [];
  const r = syncCorpus({ ...w, log: (l) => lines.push(l) });

  // The substance is that NOTHING WAS DONE, and it is read off the log rather than off a clock
  // (ARC-09-C24). `syncCorpus` prints one `[docs] <phase> … N s` line per clone, sparse-set, fetch
  // and checkout it performs; zero of them IS the no-op. The story's "< 5 s" is a claim about the
  // reference machine, measured there and reported in the PR — asserted here it measured
  // contention, and it failed at 20.5 s in the full suite while passing alone, once S06 added two
  // more git-spawning files to the same parallel run.
  assert.equal(r.changed, false, 'the second run reported a change');
  const phases = lines.filter((l) => PHASE_LINE.test(l));
  assert.deepEqual(phases, [], `the second run did work: ${phases.join(' · ')}`);
  // Two lines now: the up-to-date line, then the attribution — printed on EVERY successful sync,
  // including a no-op one, because whose documentation this is does not depend on whether anything
  // changed. Asserted as a pair so a third line cannot appear unnoticed.
  assert.deepEqual(lines, [
    `[docs] up to date (pin ${upstream.pin.slice(0, 7)}, sparse, ${AREAS.length} areas)`,
    ATTRIBUTION,
  ]);
});

test('...and the no-work claim is not vacuous: a first run prints phase lines', () => {
  // The negative control for the case above. If `PHASE_LINE` stopped matching what `syncCorpus`
  // prints, "zero phase lines" would be true of every run and the assertion would guard nothing.
  const lines = [];
  syncCorpus({ ...workspace(), log: (l) => lines.push(l) });
  const phases = lines.filter((l) => PHASE_LINE.test(l));
  assert.ok(phases.length > 0, `a first run printed no phase line — the pattern is stale: ${lines.join(' · ')}`);
});

test('AC 3 — a checkout at the wrong commit is returned to the pin by hash', () => {
  const w = workspace();
  syncCorpus({ ...w, log: silent });
  const corpus = corpusOf(w);
  const parent = git(['rev-parse', 'HEAD~1'], corpus).trim();
  git(['checkout', '-q', '--detach', parent], corpus);
  assert.notEqual(git(['rev-parse', 'HEAD'], corpus).trim(), upstream.pin);

  syncCorpus({ ...w, log: silent });
  assert.equal(git(['rev-parse', 'HEAD'], corpus).trim(), upstream.pin);
});

test('AC 4 — a narrowed sparse set is restored and the files come back', () => {
  const w = workspace();
  syncCorpus({ ...w, log: silent });
  const corpus = corpusOf(w);
  git(['sparse-checkout', 'set', '--cone', AREAS[0]], corpus);
  assert.ok(!existsSync(join(corpus, ...AREAS[1].split('/'))), 'the fixture did not narrow');

  const r = syncCorpus({ ...w, log: silent });
  const s = inspect(w.root, w.config, r.areas);
  assert.deepEqual([...s.sparseList].sort(), [...coneArgs(AREAS)].sort());
  for (const a of AREAS) assert.ok(existsSync(join(corpus, ...a.split('/'))), `${a} did not come back`);
});

test('AC 5 — full and sparse switch on the existing checkout, no re-clone', () => {
  const w = workspace();
  syncCorpus({ ...w, log: silent });
  const corpus = corpusOf(w);
  // `du` is not on Windows. Walked instead — one definition that works on every matrix cell.
  const gitSize = () => {
    let kb = 0;
    const walk = (d) => {
      for (const e of readdirSync(d, { withFileTypes: true })) {
        const q = join(d, e.name);
        if (e.isDirectory()) walk(q);
        else if (e.isFile()) kb += statSync(q).size / 1024;
      }
    };
    // `absorbgitdirs` has already turned `<corpus>/.git` into a POINTER FILE; the objects live under
    // the superproject's `.git/modules/…`. Ask git where they are rather than assuming a directory.
    walk(git(['rev-parse', '--absolute-git-dir'], corpus).trim());
    return kb;
  };
  const before = gitSize();

  syncCorpus({ ...w, mode: 'full', log: silent });
  // `config --get`, never `sparse-checkout list`: on git 2.39.5 that exits 128 with "this worktree
  // is not sparse" once sparse checkout is disabled, so it cannot be used to ask the question.
  const off = execFileSync('git', ['config', '--get', 'core.sparseCheckout'], { cwd: corpus, encoding: 'utf8', stdio: 'pipe' })
    .trim().toLowerCase();
  assert.ok(off === '' || off === 'false', `core.sparseCheckout is "${off}" after --mode full`);

  syncCorpus({ ...w, mode: 'sparse', log: silent });
  assert.equal(execFileSync('git', ['config', '--get', 'core.sparseCheckout'], { cwd: corpus, encoding: 'utf8' }).trim(), 'true');
  assert.ok(Math.abs(gitSize() - before) < 1024, `.git moved by ${Math.abs(gitSize() - before)} KB across the switch`);
});

test('AC 6 — a dirty tree is refused with the exact sentence, and nothing is touched', () => {
  const w = workspace();
  syncCorpus({ ...w, log: silent });
  const corpus = corpusOf(w);
  writeFileSync(join(corpus, 'README.md'), 'edited by a human\n');
  const headBefore = git(['rev-parse', 'HEAD'], corpus).trim();

  assert.throws(() => syncCorpus({ ...w, log: silent }), (e) => {
    assert.ok(e instanceof SyncError);
    assert.equal(e.code, EXIT.dirty);
    assert.equal(e.message, `${CORPUS_DIR} has local changes — commit, stash or discard them, then re-run`);
    return true;
  });
  assert.equal(git(['rev-parse', 'HEAD'], corpus).trim(), headBefore);
  assert.equal(readFileSync(join(corpus, 'README.md'), 'utf8'), 'edited by a human\n');
});

test('a pattern-mode sparse config is repaired to cone mode', () => {
  // ADR-0008's defect on git 2.34.1 stores --cone as a pattern. Simulated here by turning cone off,
  // because the reconcile has to cope with whatever the last git left behind.
  const w = workspace();
  syncCorpus({ ...w, log: silent });
  const corpus = corpusOf(w);
  // `--worktree`, not a plain `config`: `sparse-checkout` turns on `extensions.worktreeConfig` and
  // stores cone mode in `config.worktree`, which OUTRANKS the repository config. Writing the plain
  // key leaves the effective value untouched — `git config --get` still answers `true` — so a test
  // that flips it the obvious way asserts nothing at all.
  //
  // Found at ARC-03-S06: written the plain way, this test PASSED WITHOUT EXERCISING THE REPAIR —
  // the checkout was never in pattern mode, so `coneOn` was true before the sync and true after.
  git(['config', '--worktree', 'core.sparseCheckoutCone', 'false'], corpus);
  assert.equal(inspect(w.root, w.config, AREAS).coneOn, false, 'the fixture did not leave cone mode');

  const r = syncCorpus({ ...w, log: silent });
  assert.equal(inspect(w.root, w.config, r.areas).coneOn, true);
});

test('the .git of the submodule is a file after absorbgitdirs, and inspect copes', () => {
  const w = workspace();
  syncCorpus({ ...w, log: silent });
  const dotGit = join(corpusOf(w), '.git');
  // absorbgitdirs replaces the directory with a `gitdir:` pointer file. Both shapes must read as
  // "there is a checkout here", or the next sync re-clones over a working corpus.
  assert.ok(existsSync(dotGit));
  const r = syncCorpus({ ...w, log: silent });
  assert.equal(r.changed, false);
});

test('resolveMode: explicit wins, state file is read, skip is refused both ways', () => {
  const w = workspace();
  assert.equal(resolveMode(w.root), 'sparse');
  assert.equal(resolveMode(w.root, 'full'), 'full');
  assert.throws(() => resolveMode(w.root, 'skip'), /bootstrap flag/);
  assert.throws(() => resolveMode(w.root, 'nonsense'), /unknown mode/);

  mkdirSync(join(w.root, '.local'), { recursive: true });
  writeFileSync(join(w.root, '.local/bootstrap-state.json'), JSON.stringify({ docs: { mode: 'full' } }));
  assert.equal(resolveMode(w.root), 'full');
  writeFileSync(join(w.root, '.local/bootstrap-state.json'), JSON.stringify({ docs: { mode: 'skip' } }));
  assert.throws(() => resolveMode(w.root), /skip means do not/);
  // An explicit mode still overrides a "skip" state file — that is the documented override.
  assert.equal(resolveMode(w.root, 'sparse'), 'sparse');
});

test('the recipe printed for an existing checkout is shorter than for a fresh one', () => {
  const w = workspace();
  // The PLATFORM is pinned, because this test is about the plan's SHAPE — what a recipe contains
  // when the corpus is already there — and not about how a command is spelled. Left to
  // `process.platform` it read `git clone` on POSIX and `git -c core.longpaths=true clone` on
  // Windows, so the assertions below passed on two runners and failed on the third the moment
  // ARC-06-S14 put the flag on every Windows command.
  const plan = (state) => planRecipe({ config: w.config, areas: AREAS, mode: 'sparse', state,
    platform: 'linux' });
  const fresh = plan({ present: false });
  syncCorpus({ ...w, log: silent });
  const existing = plan(inspect(w.root, w.config, AREAS));

  assert.ok(fresh.some((l) => l.startsWith('git clone')), 'the fresh recipe does not clone');
  assert.ok(!existing.some((l) => l.startsWith('git clone')), 'the existing recipe clones again');
  assert.ok(existing.length < fresh.length);
});

/**
 * The failure classification. Canned stderr, because a `file://` fixture cannot produce any of it —
 * the substrings are ARC-00 S-07's transcript deliverable and are matched case-insensitively.
 */
const UPSTREAM = 'https://github.com/ServiceNow/ServiceNowDocs.git';
const PIN = 'ba513f2c62d3698ef5bfdd8044110226b8419689';

test('failure mapping — every row, and the proxy password never appears', () => {
  const cases = [
    ['fatal: unable to access: Could not resolve host: github.com', {},
      'cannot reach github.com (DNS) — check your network and re-run'],
    ['fatal: unable to access: Could not resolve proxy: nope', { HTTPS_PROXY: 'http://user:pw@127.0.0.1:9' },
      'cannot reach proxy 127.0.0.1:9 (HTTPS_PROXY) — fix the proxy address, or unset HTTPS_PROXY / add github.com to NO_PROXY, and re-run'],
    ['fatal: unable to access: Failed to connect to 127.0.0.1 port 9', { https_proxy: 'http://127.0.0.1:9' },
      'cannot reach proxy 127.0.0.1:9 (HTTPS_PROXY) — fix the proxy address, or unset HTTPS_PROXY / add github.com to NO_PROXY, and re-run'],
    ['fatal: unable to access: SSL certificate problem: unable to get local issuer certificate', {},
      'TLS interception detected — set GIT_SSL_CAINFO (or git config http.sslCAInfo) to your corporate CA bundle and re-run; the MCP server needs the same bundle via NODE_EXTRA_CA_CERTS (docs/TROUBLESHOOTING.md)'],
    ["fatal: couldn't find remote ref ba513f2", {},
      'pin ba513f2 not fetchable from upstream (force-push or history rewrite?) — maintainer: run ./snowarch docs sync --upstream'],
    ['fatal: remote error: upload-pack: not our ref ba513f2', {},
      'pin ba513f2 not fetchable from upstream (force-push or history rewrite?) — maintainer: run ./snowarch docs sync --upstream'],
    ['fatal: write error: No space left on device', {},
      'insufficient disk space: need ~400 MB free (~700 MB for --mode full)'],
    ['fatal: something nobody predicted\nand a second line', {},
      'git failed: fatal: something nobody predicted'],
  ];
  for (const [stderr, env, expected] of cases) {
    assert.equal(classifyGitFailure(stderr, { upstream: UPSTREAM, pin: PIN, env }), expected, stderr.slice(0, 40));
  }
  assert.ok(!classifyGitFailure('Could not resolve proxy: x', { upstream: UPSTREAM, pin: PIN, env: { HTTPS_PROXY: 'http://user:pw@127.0.0.1:9' } }).includes('pw'));
});

test('failure mapping — the casing git happens to use does not matter', () => {
  assert.match(classifyGitFailure('FATAL: COULD NOT RESOLVE HOST: GITHUB.COM', { upstream: UPSTREAM, pin: PIN, env: {} }), /^cannot reach github\.com \(DNS\)/);
});

test('a proxy is not blamed when none is configured, and DNS is not blamed when one is', () => {
  // The two halves of the same mistake: sending someone to check their DNS when the proxy is the
  // problem, or to their proxy when they have none.
  const dnsWithProxy = classifyGitFailure('Could not resolve host: github.com',
    { upstream: UPSTREAM, pin: PIN, env: { HTTPS_PROXY: 'http://127.0.0.1:9' } });
  assert.ok(!dnsWithProxy.includes('(DNS)'), 'blamed DNS while a proxy was configured');
  const proxyWithout = classifyGitFailure('Could not resolve proxy: nope', { upstream: UPSTREAM, pin: PIN, env: {} });
  assert.ok(!proxyWithout.includes('HTTPS_PROXY'), 'blamed a proxy that is not configured');
});

test('maskProxy keeps the address and drops the credentials', () => {
  assert.equal(maskProxy('http://user:pw@proxy.corp:8080'), 'http://***@proxy.corp:8080');
  assert.equal(maskProxy('http://proxy.corp:8080'), 'http://proxy.corp:8080');
  assert.equal(maskProxy(null), null);
});

test('a fresh clone whose pin IS the branch tip is still checked out', () => {
  // THE SHAPE THE FIXTURE COULD NOT PRODUCE until now, and the production defect of 2026-09-09.
  // `git clone --no-checkout` leaves an empty index and an empty tree; when the pin happens to be
  // the branch tip, HEAD is already correct, so a reconcile keyed on "HEAD != pin" skips the
  // checkout and reports an EMPTY corpus as up to date. Every earlier run had a pin behind the tip.
  const w = makeWorkspace({ scratch, pin: upstream.tip, upstreamUrl });
  const config = { docs: { ...w.config.docs, pin: upstream.tip } };
  // Precondition: the pin really is the tip, or this test is the ordinary case again.
  assert.equal(upstream.tip, git(['rev-parse', 'australia'], upstream.bare).trim(),
    'the fixture pin is not the branch tip');

  const r = syncCorpus({ root: w.root, config, log: silent });
  const corpus = corpusOf(w);

  assert.ok(git(['ls-files'], corpus).trim().length > 0, 'the index is empty — no checkout ran');
  for (const a of AREAS) {
    assert.ok(existsSync(join(corpus, ...a.split('/'))), `${a} is not on disk`);
  }
  for (const f of ROOT_FILES) assert.ok(existsSync(join(corpus, f)), `${f} is not on disk`);
  assert.equal(r.completeness.ok, true, 'a fresh clone at the tip reported itself incomplete');
});

test('--mode full, fresh clone, pin at the tip: also populated', () => {
  const w = makeWorkspace({ scratch, pin: upstream.tip, upstreamUrl });
  const config = { docs: { ...w.config.docs, pin: upstream.tip } };
  const r = syncCorpus({ root: w.root, config, mode: MODE.full, log: silent });
  assert.ok(git(['ls-files'], corpusOf(w)).trim().length > 0, 'the index is empty');
  assert.equal(r.completeness.ok, true);
});

test('an interrupted clone — .git present, index empty — is repaired on the next run', () => {
  // The reachable version of the production shape: the clone landed and the checkout did not (the
  // process died, the disk filled, the run was cancelled). `git rm --cached` does NOT reproduce it —
  // that stages deletions, which is a different state and a different guard — so the fixture makes
  // the corpus the way the recipe does, with `--no-checkout`, and stops there.
  const w = workspace();
  const corpus = corpusOf(w);
  git(['clone', '--filter=blob:none', '--no-checkout', '--depth', '1', '--sparse',
    '--branch', 'australia', upstreamUrl, CORPUS_DIR], w.root);

  // Preconditions: a repository is there, the index is empty, and nothing is on disk.
  assert.ok(existsSync(join(corpus, '.git')), 'the fixture did not clone');
  assert.equal(git(['ls-files'], corpus).trim(), '', 'the fixture index is not empty');
  assert.equal(readdirSync(corpus).filter((e) => e !== '.git').length, 0, 'the fixture tree is not empty');

  const r = syncCorpus({ ...w, log: silent });

  assert.ok(git(['ls-files'], corpus).trim().length > 0, 'the index is still empty');
  for (const a of AREAS) assert.ok(existsSync(join(corpus, ...a.split('/'))), `${a} is not on disk`);
  assert.equal(r.completeness.ok, true, 'the repaired checkout reports itself incomplete');
});
