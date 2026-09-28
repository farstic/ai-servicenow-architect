import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join, resolve, sep } from 'node:path';
import { root, stateRoot } from '../lib/config.mjs';
import { INPUT_FILES, cachePath, collectInputs, inputsPath } from '../lib/doctor-cache.mjs';
import { doctorCachePath, statePath } from '../lib/state.mjs';
import { storePath } from '../lib/mode.mjs';
import { cachePath as upgradeCachePath } from '../lib/upgrade-check.mjs';
import { createLogger } from '../lib/log.mjs';
import { tempDir } from './helpers/temp.mjs';

/**
 * ARC-07-C43, HEAD 1 — the state-root seam, and the two properties that make it safe to ship alone.
 *
 * The defect the seam exists for is measured in C43's row: `root` comes from `config.mjs`'s own
 * location, so a spawned CLI given a temp `cwd` still writes `.local/` into the checkout, and five
 * suites do exactly that on every `npm test`. Head 2 routes the twenty sites that still hand-build
 * those paths and only then sets the variable.
 *
 * So what is asserted here is not "the redirect works" alone. It is:
 *
 *   INERT     with the variable unset — which is every run today — every builder returns the path it
 *             returned before. This is what lets head 1 land before head 2 without a half-moved state
 *             root, and it is the claim that would rot silently if nobody pinned it.
 *   BOUNDED   a caller that passes a fixture root of its own keeps it. Every existing case that writes
 *             into a temp tree relies on that, and an exported variable that captured them would be a
 *             seam that reaches further than the thing it was added for.
 *
 * The builders are listed once, by name, and the same list drives all three cases: a seventh builder
 * added to the product and not to this list is a builder nobody proved either way.
 */
const BUILDERS = [
  ['state.statePath', statePath, join('.local', 'bootstrap-state.json')],
  ['state.doctorCachePath', doctorCachePath, join('.local', 'doctor-last.json')],
  ['doctor-cache.cachePath', cachePath, join('.local', 'doctor-last.json')],
  ['doctor-cache.inputsPath', inputsPath, join('.local', 'doctor-last.inputs.json')],
  ['upgrade-check.cachePath', upgradeCachePath, join('.local', 'upgrade-check.json')],
  ['mode.storePath', storePath, join('.local', 'instances.json')],
];

/** The logger is the seventh site and not a path function, so it is measured by where it WRITES. */
const logDirFor = (from, t) => {
  const log = createLogger({ command: 'probe', quiet: true, logRoot: from,
    out: { write: () => {} }, err: { write: () => {} } });
  log.step('one line, to open the file');
  const file = log.logFile;
  assert.ok(file, 'the logger wrote nothing, so this case is measuring the wrong thing');
  t.diagnostic(`log file: ${file}`);
  return file;
};

test('C43 head 1 — with the variable unset, every builder is exactly what it was', (t) => {
  const fixture = tempDir('state-root-inert-', t);
  for (const [name, build, tail] of BUILDERS) {
    assert.equal(build(fixture), join(fixture, tail), `${name} moved with no variable set`);
    assert.equal(build(root), join(root, tail), `${name} moved the REAL root with no variable set`);
  }
  assert.equal(stateRoot(root, {}), root);
  assert.equal(stateRoot(fixture, {}), fixture);
  // The logger too: unset, it opens under the root it was given.
  assert.equal(logDirFor(fixture, t).startsWith(join(fixture, '.local', 'logs') + sep), true,
    'the logger did not write under the root it was given');
});

test('C43 head 1 — set, it redirects THIS checkout\'s state and nothing else', (t) => {
  const target = tempDir('state-root-target-', t);
  const env = { SNOWARCH_STATE_ROOT: target };

  assert.equal(stateRoot(root, env), resolve(target));
  // A relative value is resolved, so a caller cannot make the path depend on the cwd it was run from.
  assert.equal(resolve(stateRoot(root, { SNOWARCH_STATE_ROOT: '.' })), resolve('.'));
  // Empty is not a redirect: it is the absence of one, and must not send `.local/` to `/`.
  assert.equal(stateRoot(root, { SNOWARCH_STATE_ROOT: '' }), root);
});

test('C43 head 1 — every builder redirects when it is set, the logger included', (t) => {
  /*
   * THE LOGGER NEEDED ITS OWN CASE, and a control is what said so. Control HD un-seamed `log.mjs` and
   * the suite still passed: the inertness case above asserts the logger writes under the root it was
   * GIVEN, which is true whether or not the seam is there, and nothing asserted the redirect. So this
   * is the direction that fails when the builder is un-seamed.
   *
   * `process.env` rather than an injected `env`, because `createLogger` takes a `logRoot` and not an
   * environment — the seam it reaches is `stateRoot`'s default. `logRoot` is the REAL root here, which
   * is the only configuration that proves anything: unset, this would open a log inside the checkout.
   */
  const target = tempDir('state-root-writes-', t);
  const saved = process.env.SNOWARCH_STATE_ROOT;
  process.env.SNOWARCH_STATE_ROOT = target;
  try {
    for (const [name, build, tail] of BUILDERS) {
      assert.equal(build(root), join(resolve(target), tail), `${name} did not follow the state root`);
    }
    const file = logDirFor(root, t);
    assert.equal(file.startsWith(join(resolve(target), '.local', 'logs') + sep), true,
      `the logger wrote to ${file} — with the variable set it must not open a log in the checkout`);
    assert.equal(file.startsWith(join(root, '.local') + sep), false,
      'the logger opened a log inside the checkout while the state root pointed elsewhere');
  } finally {
    if (saved === undefined) delete process.env.SNOWARCH_STATE_ROOT;
    else process.env.SNOWARCH_STATE_ROOT = saved;
  }
});

test('C43 head 1 — a caller that passes its own root keeps it, set or not', (t) => {
  const fixture = tempDir('state-root-fixture-', t);
  const target = tempDir('state-root-other-', t);
  const env = { SNOWARCH_STATE_ROOT: target };

  assert.equal(stateRoot(fixture, env), fixture,
    'the variable captured a fixture root — every case that writes into a temp tree would move');
  // The guard is about identity with the real root, not about the string's shape: a path INSIDE the
  // checkout is still somebody else's root and is left alone.
  const inside = join(root, 'tests', 'fixtures');
  assert.equal(stateRoot(inside, env), inside);
});

test('C43 head 1 — the doctor\'s repository inputs do not move with `.local/`', (t) => {
  const target = tempDir('state-root-inputs-', t);
  const saved = process.env.SNOWARCH_STATE_ROOT;
  process.env.SNOWARCH_STATE_ROOT = target;
  try {
    const seen = [];
    collectInputs(root, { exists: (p) => { seen.push(p); return false; }, stat: () => ({ mtimeMs: 0 }) });
    const under = (p) => p.startsWith(resolve(target) + sep);
    for (const [key, parts] of Object.entries(INPUT_FILES)) {
      const p = seen.find((q) => q.endsWith(join(...parts)));
      assert.ok(p, `${key} was not looked for at all`);
      // `.local/` state follows the redirect; `.mcp.json`, the settings files and `engine.config.json`
      // are the CHECKOUT's, and a redirected run that looked for them in the temp directory would
      // find nothing, call every input changed and re-run the doctor for ever.
      assert.equal(under(p), parts[0] === '.local',
        `${key} resolved to ${under(p) ? 'the state root' : 'the checkout'}, which is the wrong one`);
    }
  } finally {
    if (saved === undefined) delete process.env.SNOWARCH_STATE_ROOT;
    else process.env.SNOWARCH_STATE_ROOT = saved;
  }
});

test('C43 head 1 — the variable is not documented, defaulted or advertised yet', async () => {
  /*
   * Head 1 is INERT, and this is the assertion that keeps it that way. A reader who finds the
   * variable in a page and exports it before head 2 lands gets the half-moved state root C43's row
   * describes: the doctor reads the real `bootstrap-state.json` and writes its cache to the temp
   * directory. It becomes a supported, documented seam in head 2 — with the twenty remaining sites
   * routed — and not one commit earlier.
   */
  const { readFileSync, readdirSync, statSync } = await import('node:fs');
  const pages = [];
  const walk = (dir) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      if (e.name === 'node_modules' || e.name === '.git' || e.name === 'vendor') continue;
      const p = join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (/\.(md|json|ya?ml|sh|ps1)$/.test(e.name) && statSync(p).size < 2_000_000) pages.push(p);
    }
  };
  walk(root);
  /*
   * ONE EXEMPTION, NAMED WITH ITS REASON: `docs/plans/` is the engineering record, and C43's row is
   * where the commission, the two heads and this very bound are written down. A plan row is not a
   * page anyone reads to configure the product, and this one tells a reader the variable is inert and
   * must not be exported — so it is the one place naming it makes the situation clearer rather than
   * more dangerous. Everything a user actually reads — INSTALL, README, TROUBLESHOOTING,
   * MODES-AND-PRESETS, the settings files, the launchers, the workflows — stays clean.
   */
  const PLANS = `docs${sep}plans${sep}`;
  const named = pages.filter((p) => readFileSync(p, 'utf8').includes('SNOWARCH_STATE_ROOT'))
    .map((p) => p.slice(root.length + 1))
    .filter((p) => !p.startsWith(PLANS));
  assert.deepEqual(named, [],
    'SNOWARCH_STATE_ROOT is named in a page, script or workflow — head 1 must stay undocumented');
});
