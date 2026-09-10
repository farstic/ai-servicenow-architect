/**
 * Fixture trees for the engine checks — composed from the real checkout at test time.
 *
 * A committed copy of `.mcp.json` or `.claude/settings.json` under `tests/fixtures/` would be a
 * second copy of the product's wiring, and the day somebody edits the real file the fixture keeps
 * asserting the old shape: the test passes, the install is broken. So the green tree is BUILT from
 * whatever those files say today, and every negative case is a mutation applied to a copy of it.
 * What the test then proves is the check, not the fixture.
 */
import { execFileSync } from 'node:child_process';
import { cpSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { hookEntry } from '../../../tools/snowarch/lib/settings-local.mjs';
import { emptyState } from '../../../tools/snowarch/lib/state.mjs';
import { tempDir } from '../../../tools/snowarch/tests/helpers/temp.mjs';

export const REAL_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

/** The committed files every repo check reads. Copied, never retyped. */
export const WIRING = Object.freeze([
  'engine.config.json',
  // The version of record. A checkout without it is not a checkout, and the doctor reports the
  // version it finds — so a fixture without one would be asserting an absence nobody ships.
  'package.json',
  'CLAUDE.md',
  '.mcp.json',
  '.claude/settings.json',
  'packages/snowarch/package.json',
  'tools/snowarch/hooks/session-start.mjs',
]);

const git = (dir, args) => execFileSync('git', args, { cwd: dir, encoding: 'utf8', stdio: 'pipe' });

export const readJson = (root, rel) => JSON.parse(readFileSync(join(root, rel), 'utf8'));
export const writeJson = (root, rel, value) => {
  mkdirSync(dirname(join(root, rel)), { recursive: true });
  writeFileSync(join(root, rel), `${JSON.stringify(value, null, 2)}\n`);
};

/**
 * A checkout that passes E-05…E-11: the real wiring, committed, bootstrapped in `mode`.
 *
 * `git init` + one commit is what makes `git diff --quiet HEAD` answerable — half these checks ask
 * git whether a file is as committed, and a directory that is not a repository has no answer.
 */
export function greenTree(t, { mode = 'design', extra = {} } = {}) {
  const root = tempDir('snowarch-doctor-', t);
  for (const rel of WIRING) {
    mkdirSync(dirname(join(root, rel)), { recursive: true });
    cpSync(join(REAL_ROOT, rel), join(root, rel));
  }
  for (const [rel, value] of Object.entries(extra)) writeJson(root, rel, value);

  git(root, ['init', '-q']);
  git(root, ['config', 'user.email', 'fixture@example.com']);
  git(root, ['config', 'user.name', 'fixture']);
  git(root, ['add', '-A']);
  git(root, ['commit', '-qm', 'fixture']);

  bootstrap(root, { mode });
  return root;
}

/** What `./bootstrap.sh` leaves behind: `.local/`, the state file, and the local toggles. */
export function bootstrap(root, { mode = 'design', hooks = true, state: over = {} } = {}) {
  mkdirSync(join(root, '.local', 'logs'), { recursive: true, mode: 0o700 });
  // 0700 is asserted by E-11, and `mkdir -p` honours the process umask rather than the mode
  // argument for intermediate directories — so it is set explicitly, on the directory itself.
  execFileSync('chmod', ['700', join(root, '.local')]);
  const serverKey = readJson(root, 'engine.config.json').mcp.serverKey;
  const state = { ...emptyState({ engineVersion: '0.0.0-test' }), mode, docs: { mode: 'sparse', pin: null },
    ...over };
  writeJson(root, '.local/bootstrap-state.json', state);
  writeJson(root, '.claude/settings.local.json', {
    ...(mode === 'live' ? { enabledMcpjsonServers: [serverKey] }
      : { disabledMcpjsonServers: [serverKey] }),
    ...(hooks ? { hooks: hookEntry() } : {}),
  });
  return root;
}

/** A copy of a tree, for one mutation. The original stays green for the next case. */
export function copyTree(t, from) {
  const to = tempDir('snowarch-doctor-', t);
  cpSync(from, to, { recursive: true });
  return to;
}

/** The context a check receives, with the run's memo fields empty. */
export function contextFor(root, over = {}) {
  return {
    root,
    config: readJson(root, 'engine.config.json'),
    contract: null,
    flags: {},
    platform: process.platform,
    env: process.env,
    home: '',
    now: () => Date.now(),
    ...over,
  };
}

/** Run one check by id from a list, and return its result. */
export const runById = (checks, id, ctx) => checks.find((c) => c.id === id).run(ctx);
