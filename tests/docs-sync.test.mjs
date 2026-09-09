import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  CORPUS_DIR, EXIT, SyncError, classifyGitFailure, inspect, maskProxy, planRecipe, resolveMode,
  ROOT_FILES, syncCorpus,
} from '../tools/snowarch/lib/docs/sync.mjs';

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
const AREAS = ['markdown/alpha', 'markdown/beta', 'markdown/gamma'];
// 197 characters, the longest path in the real corpus — the Windows long-path case, on the matrix.
const LONG_NAME = `${'l'.repeat(197 - 'markdown/alpha/'.length - '.md'.length)}.md`;

let scratch, upstream, upstreamUrl, work;

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
  git(['checkout', '-q', 'australia'], src);

  const bare = join(dir, 'upstream.git');
  git(['clone', '-q', '--bare', src, bare], dir);
  return { bare, pin };
}

function makeWorkspace(pin) {
  const w = mkdtempSync(join(scratch, 'work-'));
  git(['init', '-q'], w);
  mkdirSync(join(w, 'vendor'), { recursive: true });
  writeFileSync(join(w, 'vendor/docs-areas.txt'), `${AREAS.join('\n')}\n`);
  // The engine repository registers the corpus in `.gitmodules`, and recipe C's step 5
  // (`submodule init`) is what clears the superproject's leading `-`. A fixture without the entry
  // would exercise a path production never takes.
  writeFileSync(join(w, '.gitmodules'),
    `[submodule "${CORPUS_DIR}"]\n\tpath = ${CORPUS_DIR}\n\turl = ${upstreamUrl}\n\tbranch = australia\n\tshallow = true\n`);
  git(['add', '.gitmodules', 'vendor/docs-areas.txt'], w);
  // ...and the gitlink itself, unpopulated. A cloned engine repository arrives exactly like this:
  // `.gitmodules` plus a 160000 index entry and no checkout, which is what makes `git submodule
  // status` print a leading `-` until recipe C's step 5 runs. `update-index --cacheinfo` is how to
  // produce that state without a corpus on disk yet.
  git(['update-index', '--add', '--cacheinfo', '160000', pin, CORPUS_DIR], w);
  git(['-c', 'user.email=f@example.invalid', '-c', 'user.name=f', 'commit', '-qm', 'fixture'], w);
  assert.match(git(['submodule', 'status', CORPUS_DIR], w), /^-/, 'the fixture is not uninitialised');
  return {
    root: w,
    config: {
      docs: { family: 'australia', pin, areasFile: 'vendor/docs-areas.txt', upstream: upstreamUrl },
    },
  };
}

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
  const w = makeWorkspace(upstream.pin);
  const r = syncCorpus({ ...w, log: silent });
  const s = inspect(w.root, w.config, r.areas);

  assert.equal(s.head, upstream.pin, 'HEAD is not the pin');
  assert.equal(s.sparseOn, true);
  assert.equal(s.coneOn, true);
  assert.deepEqual([...s.sparseList].sort(), [...AREAS].sort());
  assert.equal(s.initialised, true, `superproject still reports uninitialised: ${s.submodule}`);
  assert.equal(r.completeness.ok, true);
  for (const f of ROOT_FILES) assert.ok(existsSync(join(corpusOf(w), f)), `missing root file ${f}`);
  // The pin's own content, not just its hash — proof the checkout followed the fetch.
  assert.ok(existsSync(join(corpusOf(w), 'markdown/beta/extra.md')), 'the pinned commit is not checked out');
  assert.ok(existsSync(join(corpusOf(w), 'markdown/alpha', LONG_NAME)), 'the 197-char path is absent');
});

test('AC 2 — a second run changes nothing, quickly, and says so', () => {
  const w = makeWorkspace(upstream.pin);
  syncCorpus({ ...w, log: silent });
  const lines = [];
  const t = Date.now();
  const r = syncCorpus({ ...w, log: (l) => lines.push(l) });
  const elapsed = (Date.now() - t) / 1000;

  assert.equal(r.changed, false, 'the second run reported a change');
  assert.ok(elapsed < 5, `second run took ${elapsed.toFixed(1)} s`);
  assert.deepEqual(lines, [`[docs] up to date (pin ${upstream.pin.slice(0, 7)}, sparse, ${AREAS.length} areas)`]);
});

test('AC 3 — a checkout at the wrong commit is returned to the pin by hash', () => {
  const w = makeWorkspace(upstream.pin);
  syncCorpus({ ...w, log: silent });
  const corpus = corpusOf(w);
  const parent = git(['rev-parse', 'HEAD~1'], corpus).trim();
  git(['checkout', '-q', '--detach', parent], corpus);
  assert.notEqual(git(['rev-parse', 'HEAD'], corpus).trim(), upstream.pin);

  syncCorpus({ ...w, log: silent });
  assert.equal(git(['rev-parse', 'HEAD'], corpus).trim(), upstream.pin);
});

test('AC 4 — a narrowed sparse set is restored and the files come back', () => {
  const w = makeWorkspace(upstream.pin);
  syncCorpus({ ...w, log: silent });
  const corpus = corpusOf(w);
  git(['sparse-checkout', 'set', '--cone', AREAS[0]], corpus);
  assert.ok(!existsSync(join(corpus, ...AREAS[1].split('/'))), 'the fixture did not narrow');

  const r = syncCorpus({ ...w, log: silent });
  const s = inspect(w.root, w.config, r.areas);
  assert.deepEqual([...s.sparseList].sort(), [...AREAS].sort());
  for (const a of AREAS) assert.ok(existsSync(join(corpus, ...a.split('/'))), `${a} did not come back`);
});

test('AC 5 — full and sparse switch on the existing checkout, no re-clone', () => {
  const w = makeWorkspace(upstream.pin);
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
  const w = makeWorkspace(upstream.pin);
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
  const w = makeWorkspace(upstream.pin);
  syncCorpus({ ...w, log: silent });
  const corpus = corpusOf(w);
  git(['config', 'core.sparseCheckoutCone', 'false'], corpus);

  const r = syncCorpus({ ...w, log: silent });
  assert.equal(inspect(w.root, w.config, r.areas).coneOn, true);
});

test('the .git of the submodule is a file after absorbgitdirs, and inspect copes', () => {
  const w = makeWorkspace(upstream.pin);
  syncCorpus({ ...w, log: silent });
  const dotGit = join(corpusOf(w), '.git');
  // absorbgitdirs replaces the directory with a `gitdir:` pointer file. Both shapes must read as
  // "there is a checkout here", or the next sync re-clones over a working corpus.
  assert.ok(existsSync(dotGit));
  const r = syncCorpus({ ...w, log: silent });
  assert.equal(r.changed, false);
});

test('resolveMode: explicit wins, state file is read, skip is refused both ways', () => {
  const w = makeWorkspace(upstream.pin);
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
  const w = makeWorkspace(upstream.pin);
  const fresh = planRecipe({ config: w.config, areas: AREAS, mode: 'sparse', state: { present: false } });
  syncCorpus({ ...w, log: silent });
  const state = inspect(w.root, w.config, AREAS);
  const existing = planRecipe({ config: w.config, areas: AREAS, mode: 'sparse', state });

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
