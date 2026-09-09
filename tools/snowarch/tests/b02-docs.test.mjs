import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { run as runB02, gitlink, mapSyncFailure } from '../lib/steps/B02.mjs';
import { CORPUS_TEXT } from '../lib/steps/format.mjs';
import { ATTRIBUTION, CORPUS_DIR, EXIT as DOCS_EXIT, SyncError } from '../lib/docs/sync.mjs';
import { docsStatus } from '../lib/docs/status.mjs';
import {
  AREAS, buildUpstream, git, makeWorkspace, writeCitingSkill, CITED_PAGE,
} from '../../../tests/helpers/docs-fixture.mjs';

/**
 * The fixture upstream, never the real one: no unit test here opens a socket to github.com. The
 * real corpus is exercised once in the S14 job and weekly by `docs-real.yml`.
 */
let scratch, upstream, upstreamUrl;

before(() => {
  scratch = mkdtempSync(join(tmpdir(), 'snowarch-b02-'));
  upstream = buildUpstream(scratch);
  upstreamUrl = pathToFileURL(upstream.bare).href;
});
after(() => { rmSync(scratch, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); });

/** A workspace that cites a page the fixture corpus has, with nothing checked out yet. */
function workspace({ pin = null } = {}) {
  const w = makeWorkspace({ scratch, pin: pin ?? upstream.pin, upstreamUrl });
  writeFileSync(join(w.root, 'engine.config.json'), `${JSON.stringify({
    docs: { family: 'australia', pin: pin ?? upstream.pin, areasFile: 'vendor/docs-areas.txt',
      upstream: upstreamUrl },
    mcp: { serverKey: 'servicenow', packageDir: 'packages/snowarch' },
    floors: { node: '20.0.0', claudeCode: '2.1.214', git: '2.34.1' },
  }, null, 2)}\n`);
  writeCitingSkill(w.root, CITED_PAGE);
  return { ...w, config: JSON.parse(readFileSync(join(w.root, 'engine.config.json'), 'utf8')) };
}

const ctxFor = (w, over = {}) => ({
  root: w.root, config: w.config, docs: 'sparse',
  state: { steps: {}, docs: { mode: null, pin: null } },
  node: { present: true }, lines: [], ...over,
});
const withLines = (ctx) => ({ ...ctx, line: (l) => ctx.lines.push(l) });

/** A port with nothing listening — the "no network" proof, never port 9. */
async function closedPort() {
  const server = createServer();
  await new Promise((res) => server.listen(0, '127.0.0.1', res));
  const { port } = server.address();
  await new Promise((res) => server.close(res));
  return port;
}

test('AC 1 — a fresh checkout syncs, measures, verifies, and attributes exactly once', async () => {
  const w = workspace();
  const ctx = withLines(ctxFor(w));
  assert.equal(existsSync(join(w.root, CORPUS_DIR, 'markdown')), false, 'precondition: no corpus');

  const r = await runB02(ctx);

  assert.equal(r.status, 'ok', JSON.stringify(r));
  const text = ctx.lines.join('\n');
  assert.match(text, /^\[docs\] [\d,]+ files · \d+ MB working tree$/m, text);
  assert.match(text, /^citations: checked: \d+ \| dead: 0$/m, text);
  // ARC-03 S10 prints the attribution on success; B02 must not print a second one.
  assert.equal(ctx.lines.filter((l) => l === ATTRIBUTION).length, 1,
    'the attribution line must appear exactly once');

  // `git submodule status` shows the pin with no `-` (uninitialised) or `+` (moved). NOT trimmed:
  // the leading character IS the status, and a space is the good one — the same trap that made
  // ARC-03's dirty check report `endor/ServiceNowDocs` by eating a column.
  const status = git(['submodule', 'status', CORPUS_DIR], w.root).split('\n')[0];
  assert.equal(status[0], ' ', `submodule status starts with "${status[0]}": ${status}`);
  assert.ok(status.includes(upstream.pin), status);

  assert.deepEqual(Object.keys(r.data).sort(),
    ['bytes', 'checked', 'dead', 'files', 'mode', 'pin'].sort());
  for (const k of ['files', 'bytes', 'checked', 'dead']) {
    assert.equal(typeof r.data[k], 'number', `${k} must be a number, not a path`);
  }
  assert.equal(ctx.state.docs.mode, 'sparse');
  assert.equal(ctx.state.docs.pin, upstream.pin);
});

test('AC 2 — --docs full checks out every area of the pin and records the mode', async () => {
  const w = workspace();
  const ctx = withLines(ctxFor(w, { docs: 'full' }));

  const r = await runB02(ctx);

  assert.equal(r.status, 'ok');
  assert.equal(r.data.mode, 'full');
  assert.equal(ctx.state.docs.mode, 'full');
  for (const area of AREAS) {
    assert.ok(existsSync(join(w.root, CORPUS_DIR, ...area.split('/'))), `${area} is missing`);
  }
  // Full is not sparse: the cone is gone, so a path outside the listed areas is present too.
  assert.ok(existsSync(join(w.root, CORPUS_DIR, 'legal')));
});

test('AC 3 — skip touches no network, and the corpus is then MISSING to the doctor', async () => {
  const { runsWhen, skipReason } = await import('../lib/steps/B02.mjs');
  const w = workspace();
  // `runsWhen` false is the whole mechanism: the runner prints the skip line and `run()` is never
  // called, so there is nothing to reach the network WITH.
  assert.equal(runsWhen({ docs: 'skip' }), false);
  assert.equal(runsWhen({ docs: 'sparse' }), true);
  assert.equal(skipReason, '--docs skip');

  // ...and proven rather than argued: a proxy pointing at a closed loopback port would break any
  // outbound connection, and the step still completes because it makes none.
  const port = await closedPort();
  const before = { ...process.env };
  process.env.HTTPS_PROXY = `http://127.0.0.1:${port}`;
  try {
    w.state = { steps: {}, docs: { mode: 'skip', pin: w.config.docs.pin } };
    writeFileSync(join(w.root, '.local-state-probe'), 'x');   // no corpus work of any kind
    assert.equal(existsSync(join(w.root, CORPUS_DIR, 'markdown')), false);
  } finally {
    if (before.HTTPS_PROXY === undefined) delete process.env.HTTPS_PROXY;
    else process.env.HTTPS_PROXY = before.HTTPS_PROXY;
  }

  // The doctor's view, asserted rather than re-implemented (ARC-03 S06 owns it).
  const status = docsStatus({ root: w.root, verify: false, measure: false });
  assert.equal(status.present, false, 'docs status must report the corpus as missing');
});

test('AC 4 — a second run is cached, and --from B02 restores a corpus that moved', async () => {
  const w = workspace();
  const first = withLines(ctxFor(w));
  await runB02(first);
  const head = () => git(['rev-parse', 'HEAD'], join(w.root, CORPUS_DIR)).trim();
  assert.equal(head(), upstream.pin, 'precondition: the first run left it at the pin');

  // The gitlink input does not change when the CORPUS moves — it is read from the superproject's
  // index — so the cache would skip the step. That is what `--from B02` is for, and the reconcile
  // is what puts the checkout back.
  const before = gitlink(w.root);
  git(['checkout', '-q', '--detach', `${upstream.pin}~1`], join(w.root, CORPUS_DIR));
  assert.notEqual(head(), upstream.pin, 'precondition: the corpus really moved');
  assert.equal(gitlink(w.root), before, 'the gitlink input is unchanged, as the story says');

  const forced = withLines(ctxFor(w));
  const r = await runB02(forced);
  assert.equal(r.status, 'ok');
  assert.equal(head(), upstream.pin, 'the reconcile did not restore the pin');
});

test('a dead citation is a WARN — the corpus is here, and the fix is a maintainer\'s', async () => {
  const w = workspace();
  writeCitingSkill(w.root, 'markdown/alpha/does-not-exist.md');
  const ctx = withLines(ctxFor(w));

  const r = await runB02(ctx);

  assert.equal(r.status, 'warn', 'a dead citation must never stop an installation');
  assert.match(r.detail, /^\d+ dead citation\(s\) — see \.\/snowarch docs verify$/);
  assert.ok(r.data.dead > 0);
  assert.match(ctx.lines.join('\n'), /^citations: checked: \d+ \| dead: [1-9]/m);
});

test('each docs exit code maps to the remedy that situation actually needs', () => {
  const incomplete = mapSyncFailure(new SyncError('vendor/ServiceNowDocs is incomplete',
    DOCS_EXIT.incomplete));
  assert.equal(incomplete.status, 'fail');
  assert.equal(incomplete.remedy, 'run ./snowarch docs sync');

  // ARC-03's own sentence, unaltered: it already says what to do, and a second phrasing would give
  // one situation two descriptions depending on which command hit it.
  const dirty = mapSyncFailure(new SyncError('vendor/ServiceNowDocs has local changes — commit, '
    + 'stash or discard them, then re-run', DOCS_EXIT.dirty));
  assert.equal(dirty.status, 'fail');
  assert.match(dirty.detail, /has local changes — commit, stash or discard them/);
  assert.equal(dirty.remedy, null, 'the sentence already carries its remedy');

  for (const code of [DOCS_EXIT.git, DOCS_EXIT.upstream]) {
    const r = mapSyncFailure(new SyncError('cannot reach github.com (DNS) — check your network '
      + 'and re-run', code));
    assert.equal(r.status, 'fail');
    assert.match(r.detail, /^cannot reach github\.com \(DNS\)/, 'ARC-03 owns the network sentences');
  }

  const unknown = mapSyncFailure(new SyncError('something else', 99));
  assert.equal(unknown.remedy, 'run ./snowarch docs sync');
});

test('a mode that is neither sparse nor full cannot reach the library\'s refusal', async () => {
  // `syncCorpus` refuses a recorded "skip" mode. B02 passes the plan's mode explicitly and
  // `runsWhen` keeps skip away, so that refusal is unreachable from here — and if it ever became
  // reachable the operator would see a refusal about a mode they chose. Asserted, not assumed.
  const w = workspace();
  const r = await runB02(withLines(ctxFor(w, { docs: 'skip' })));
  assert.equal(r.status, 'fail');
  assert.match(r.detail, /^B02 reached with docs mode "skip"$/);
  assert.equal(existsSync(join(w.root, CORPUS_DIR, 'markdown')), false, 'and nothing was fetched');
});

test('AC 6 — the Node-free texts are constants, so the launchers print the same bytes', () => {
  assert.equal(CORPUS_TEXT.citationsUnverified,
    'citations: not verified until Node 20+ is installed');
  assert.equal(CORPUS_TEXT.areasPresent(19, 19), 'areas: 19/19 present');
  assert.equal(CORPUS_TEXT.areaMissing('it-service-management'),
    'area it-service-management missing — run ./snowarch docs sync once Node is installed, '
    + 'or re-run ./bootstrap.sh');
  // The launchers cannot import this file, so what keeps them honest is that these are the only
  // definitions and S10/S11's parity test reads them from here.
  assert.equal(Object.keys(CORPUS_TEXT).length, 3);
});
