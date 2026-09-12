/**
 * The upgrade harness: a bare origin at v9.0.0, two fixture releases, and a user's clone.
 *
 * ARC-09-S07. An upgrade cannot be tested against a mock: the thing under test is what happens to
 * a real git tree — a fetch, a checkout, a second bootstrap run, a store migration — and every
 * interesting failure is one where the tree ends up somewhere the user did not expect. So the
 * harness builds the real thing, small, in a temp directory:
 *
 *   ORIGIN    a bare repository holding THIS checkout's tree with its versions rewritten to 9.x,
 *             tagged `v9.0.0` with a real annotated release message (S01's `buildTagMessage`).
 *   v9.1.0    changes ONE declared input — `vendor/docs-areas.txt` — so exactly one bootstrap step
 *             is stale and AC 1 can say which.
 *   v9.2.0    changes the STORE's schema: a 1→2 migration through S06's `migrations` seam, with
 *             `storeSchemaVersion: 2` in the contract the tag ships.
 *   USER      a clone of the origin at v9.0.0, bootstrapped design-only, carrying a fixture store.
 *
 * 9.x rather than 2.x because a fixture release must never be mistaken for a real one — not in a
 * developer's tag list, and not by `sortTags` if one ever leaked into the real repository.
 *
 * No network: the origin is a path, the clone is `file://`, and nothing here resolves a hostname.
 */
import { execFileSync, spawnSync } from 'node:child_process';
import {
  chmodSync, cpSync, existsSync, mkdirSync, readFileSync, symlinkSync, writeFileSync, writeSync,
} from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { tempDir } from '../../tools/snowarch/tests/helpers/temp.mjs';
import { writeHead, writeMarker } from '../../scripts/lib/release/writers.mjs';
import { AREAS, buildUpstream } from '../helpers/docs-fixture.mjs';

export const REAL_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

/** Assembled, never spelled. */
export const FIXTURE_PASSWORD = `${'Fix'}-${'ture'}-${'8821'}`;

const IDENTITY = ['-c', 'user.email=f@example.com', '-c', 'user.name=f'];

/**
 * `core.longpaths` on Windows, on EVERY call this suite makes (ARC-09-C27b).
 *
 * The corpus's longest page is 197 characters and these fixtures live under a temp prefix roughly
 * 103 characters long, so the total passes 260 and a git that has not been told about long paths
 * cannot read it. `tools/snowarch/lib/docs/sync.mjs` carries the same flag on every corpus call
 * for the same reason; this is the fixture doing what the product does.
 *
 * **A `-c` is not enough on its own, and that is the whole lesson of C27b.** It lives for one
 * process and its children. C27 put it on `submodule update --init` alone: the checkout worked and
 * every later reader saw nothing — including the git that the PARENT's `status` spawns INSIDE the
 * submodule, which reads the submodule's config and not the parent's command line. The Windows
 * cell stayed red with `longpaths: "<unset>"` printed beside the modified file. So the flag is on
 * every call here AND written into each fixture repository by `persistLongPaths` below: the
 * wrapper covers the calls this suite makes, the config covers the ones it does not — `git status`
 * descending into a submodule, `scripts/release.mjs` and `verify-tag.mjs` running inside the
 * fixture, `node --test` running the tree-scanning tests there. Neither alone is sufficient: the
 * config cannot be written into a repository that does not exist yet, which is the moment the
 * first clone needs the flag.
 */
export const LONGPATHS = process.platform === 'win32' ? ['-c', 'core.longpaths=true'] : [];

/**
 * Write it into a fixture repository, so every git that ever runs there reads it.
 *
 * The read-back is not ceremony. C27 shipped a fix that looked applied and was not, and the only
 * reason anybody found out was a CI cell going red twenty-five minutes later; a helper that
 * silently does nothing is exactly that failure again. This throws where it happens instead.
 */
export function persistLongPaths(cwd) {
  if (process.platform !== 'win32') return;
  execFileSync('git', [...LONGPATHS, 'config', 'core.longpaths', 'true'],   // scan-exempt: this IS the entry point
    { cwd, encoding: 'utf8', stdio: 'pipe' });
  const back = String(execFileSync('git', ['config', '--get', 'core.longpaths'],   // scan-exempt: reads back what the line above wrote
    { cwd, encoding: 'utf8', stdio: 'pipe' })).trim();
  if (back !== 'true') throw new Error(`core.longpaths did not persist in ${cwd} (read back "${back}")`);
}

/** Every git call in this suite goes through here or through `gitRaw`. The scan test says so. */
export function git(cwd, args, { allowFail = false } = {}) {
  try {
    return String(execFileSync('git', [...LONGPATHS, ...IDENTITY, ...args],   // scan-exempt: this IS the entry point
      { cwd, encoding: 'utf8', stdio: 'pipe' })).trim();
  } catch (e) {
    if (allowFail) return null;
    throw new Error(`git ${args.join(' ')} in ${cwd}: ${String(e.stderr ?? e.message)}`);
  }
}

/** No fixture identity — for calls against a REAL checkout, or a clone that has no author. */
export function gitRaw(args, opts = {}) {
  return execFileSync('git', [...LONGPATHS, ...args],   // scan-exempt: this IS the entry point
    { encoding: 'utf8', stdio: 'pipe', ...opts });
}

/**
 * The files a fixture release needs to be a believable checkout of this product.
 *
 * Copied, not linked: the whole point is that `git checkout <tag>` MOVES them, and a symlink
 * would move nothing. `vendor/ServiceNowDocs` is deliberately absent — a fixture release that
 * carried 35,000 files would make every one of these tests a minute longer, and the corpus's own
 * movement is B02's business, which AC 1 exercises through the areas file instead.
 */
/**
 * What the fixture tree carries: EVERY TRACKED FILE, minus the corpus.
 *
 * ARC-09-C13. This was a curated list, and curating it was the defect. A fixture that stands in for
 * this repository has to satisfy the checks this repository runs on itself, and two of them are
 * about the tree AS A WHOLE: `gen-all --check` fails when a generator's target or input is absent
 * ("could not run", not "skipped"), and lint rule L05 asserts that every path a tracked file CITES
 * exists — so any file left out is reported as a dead citation by whatever cites it. Chasing that
 * one directory at a time went 79 dead paths → 46 → the next one, because the list was never the
 * answer; the subset was.
 *
 * ARC-09-S11's AC 3 walkthrough is what needed it: a release cut INSIDE the fixture runs the real
 * lint gate, which is the whole point of running it there.
 *
 * WHAT A FIXTURE CANNOT BE, and why the ARC-09-C13 guard is a SUBSET of the suite rather than all
 * of it: `engine.config.json validates against its schema` requires `docs.upstream` to match
 * `^https://…\.git$`, and this world points at a local bare repository because it must work with no
 * network. The schema is right about a real checkout and the fixture is right about a test; they
 * cannot both hold, and no amount of copying fixes it. So the guard runs the tests whose subject is
 * WHAT A TREE LOOKS LIKE — changelog, version literals, version tag, validation shape, docs links,
 * legacy names, never-commit — and not the ones asserting properties a fixture legitimately lacks.
 *
 * `vendor/` is the exception and the only one: the corpus is a submodule, the fixture builds its own
 * three-area upstream for it, and copying 35,000 documentation files per fixture would make this
 * harness unusable. `node_modules` is not tracked and is handled by `placeModules`.
 */
/**
 * The ONE thing the fixture does not carry, as a list, so adding a second is a conversation.
 *
 * ARC-09-C13. A curated `COPIED` list was three fixture-completeness chores in disguise; the cure
 * is that the fixture IS the repository. Naming the single exclusion here — rather than inlining
 * the filter — means the next "just exclude X" arrives as an edit to a list with a reason beside
 * it, and `tests/upgrade/harness-shape.test.mjs` asserts there is exactly one.
 */
export const NOT_COPIED = Object.freeze({
  'vendor/ServiceNowDocs': 'the corpus submodule: a gitlink with nothing to copy, and the fixture '
    + 'builds its own three-area upstream for it. Copying 35,000 documentation files per fixture '
    + 'would make this harness unusable.',
});

function trackedFiles() {
  return gitRaw(['ls-files', '-z'], { cwd: REAL_ROOT,
    maxBuffer: 1 << 28 })
    .split('\0')
    .filter(Boolean)
    // The CORPUS, not the whole of `vendor/`: `vendor/docs-areas.txt` lives there too and is a
    // real tracked file the fixture needs (B02 reads it, and the first version of this filter
    // dropped it and died on ENOENT). `vendor/ServiceNowDocs` is the submodule — a gitlink entry
    // with nothing to copy, and the fixture builds its own three-area upstream for it.
    .filter((rel) => !Object.keys(NOT_COPIED)
      .some((skip) => rel === skip || rel.startsWith(`${skip}/`)));
}

/**
 * Stage everything, RE-ASSERT the gitlink, commit.
 *
 * The re-assertion is not belt and braces. `git add -A` walks the working tree, finds no
 * `vendor/ServiceNowDocs` on disk — the corpus is a submodule and this tree has never checked one
 * out — and stages its DELETION. The first version of this harness lost the gitlink on the second
 * release, so the upgraded checkout had no submodule entry at all and B02 failed its completeness
 * check for a reason no user could ever meet.
 */
function commit(root, message, pin) {
  git(root, ['add', '-A']);
  git(root, ['update-index', '--add', '--cacheinfo', '160000', pin, 'vendor/ServiceNowDocs']);
  git(root, ['commit', '-qm', message]);
}

/** A version everywhere it is written, so `./snowarch version` in the clone says 9.x. */
function rewriteVersion(root, version) {
  // THE RELEASE'S OWN WRITERS (ARC-09-C13). This used to edit two manifests by hand — and there are
  // three, plus `CLAUDE.md`'s marker line and the README head, so a fixture release left the tree
  // inconsistent in exactly the way `version-consistency.test.mjs` exists to catch. That test is in
  // the guard this harness now runs INSIDE the fixture, so the fixture has to be written by the
  // same code that writes a real release rather than by a second, poorer imitation of it.
  //
  // `npm version --workspaces --include-workspace-root` is the one that moves all three manifests
  // AND `package-lock.json` in a single call: a lock file edited by anything but npm is a lock file
  // npm rewrites differently on the next install.
  execFileSync('npm', ['version', version, '--no-git-tag-version', '--workspaces',
    '--include-workspace-root'], { cwd: root, stdio: 'pipe', shell: process.platform === 'win32' });

  // ...and the two prose files, through the release's own writers rather than a regex here.
  for (const [rel, write] of [['CLAUDE.md', writeMarker], ['docs/README-head.md', writeHead]]) {
    const file = join(root, rel);
    if (!existsSync(file)) continue;
    const result = write(readFileSync(file, 'utf8'), version);
    if (!result.ok) throw new Error(`harness: ${rel} — ${result.message}`);
    writeFileSync(file, result.text);
  }

  // Several generated blocks embed the version, so regenerating is part of moving it — the same
  // ordering the release itself keeps (ARC-09-C12b). Without this the fixture's own lint gate
  // reports stale targets, which is what stopped ARC-09-S11's AC 3 walkthrough.
  regenerate(root);
}

/**
 * `gen-all`, inside a fixture. One call rather than a list of generators, for the same reason
 * `gen-all` exists: a list here would be the copy that goes stale when somebody adds the next one.
 */
function regenerate(root) {
  execFileSync(process.execPath, [join(root, 'scripts/gen-all.mjs')], { cwd: root, stdio: 'pipe' });
}

/** The tag message S01 writes, with THIS tree's real contract sha and gitlink. */
async function tagRelease(root, version, { claudeFloor = null } = {}) {
  const { buildTagMessage } = await import('../../scripts/lib/release/tag.mjs');
  const { createHash } = await import('node:crypto');
  const contract = createHash('sha256')
    .update(readFileSync(join(root, 'packages/snowarch/dist/contract.json'))).digest('hex');
  const config = JSON.parse(readFileSync(join(root, 'engine.config.json'), 'utf8'));
  const floors = { ...config.floors, ...(claudeFloor ? { claudeCode: claudeFloor } : {}) };
  const message = buildTagMessage({
    version, contract, docsPin: config.docs.pin, floors,
  });
  git(root, ['tag', '-a', `v${version}`, '-m', message]);
  return message;
}

/**
 * Build the whole world.
 *
 * `t` is not optional in spirit: this makes three git trees and a node_modules link, and an
 * untracked one per run is how a TMPDIR reaches five figures (ARC-08-S06's lesson, and C1's).
 */
/**
 * `node_modules` into a fixture tree: linked by default, copied on request.
 *
 * ARC-09-C11. A LINK is the fast path and what every test here wants — 400 MB per fixture would
 * make the harness unusable, and a test that only reads its dependencies cannot tell the
 * difference. But `npm ci` and `npm install` DELETE and recreate the directory, and they do it
 * through the link: the ARC-09-S11 release walkthrough ran the install gate inside a fixture and
 * emptied the developer's real checkout, 215 packages to 0. Nothing tracked was lost and `npm ci`
 * put it back, but nothing warned either.
 *
 * So: if the fixture will run `release.mjs`, `npm ci`/`npm install` or `build-dist.mjs`, ask for
 * `'copy'`. `cpSync` gets a copy-on-write clone where the filesystem offers one (APFS, btrfs, XFS
 * with reflink) and a real copy everywhere else — that cost is the reason the default stays
 * `'link'`, and it is also the reason `release.mjs` now REFUSES to install into a linked tree
 * rather than trusting everyone to have read this.
 */
function placeModules(target, modules) {
  const from = join(REAL_ROOT, 'node_modules');
  if (modules === 'copy') {
    cpSync(from, join(target, 'node_modules'), { recursive: true, dereference: false });
    return;
  }
  symlinkSync(from, join(target, 'node_modules'), process.platform === 'win32' ? 'junction' : 'dir');
}

/**
 * TEMPORARY INSTRUMENT — ARC-09-C28, removed in the last commit of that chore.
 *
 * The Windows `upgrade-e2e` job runs 26 minutes against a `timeout-minutes: 30`, with fourteen
 * fixture-building tests at 130–270 s each where Ubuntu takes 10–20 s. The fix is not guessed: this
 * prints where each world's time goes, on all three OSes, so the dominant term is named with a
 * number. One line per world, `hrtime`-based, stdout only.
 */
const phase = (label, marks, fn) => {
  const t0 = process.hrtime.bigint();
  const r = fn();
  marks.push(`${label}=${Math.round(Number(process.hrtime.bigint() - t0) / 1e6)}ms`);
  return r;
};

export async function buildWorld(t, { claudeFloor = null, modules = 'link', schemaBump = true } = {}) {
  const marks = [];
  const worldStart = process.hrtime.bigint();
  const scratch = tempDir('snowarch-upgrade-', t);
  const work = join(scratch, 'work');
  mkdirSync(work, { recursive: true });

  phase('tree-copy', marks, () => {
    let n = 0;
    for (const rel of trackedFiles()) {
      const from = join(REAL_ROOT, rel);
      if (!existsSync(from)) continue;          // a file staged for deletion, say
      mkdirSync(dirname(join(work, rel)), { recursive: true });
      cpSync(from, join(work, rel), { dereference: true });
      n += 1;
    }
    marks.push(`files=${n}`);
  });
  // A REAL corpus upstream, three areas big.
  //
  // Not the product's: cloning 35,000 files per test would make this harness unusable, and not a
  // dead path either — AC 1's whole claim is that the docs step RE-RUNS when the areas file moves,
  // and a step that cannot sync is a step that skips. `buildUpstream` is the docs suite's own
  // fixture builder, so what B02 does here is what B02 does everywhere.
  const upstream = phase('corpus-upstream', marks, () => buildUpstream(join(scratch, 'corpus')));
  const config = JSON.parse(readFileSync(join(work, 'engine.config.json'), 'utf8'));
  writeFileSync(join(work, 'engine.config.json'), `${JSON.stringify({
    ...config,
    docs: { ...config.docs, upstream: pathToFileURL(upstream.bare).href, pin: upstream.pin,
      family: 'australia' },
  }, null, 2)}\n`);
  writeFileSync(join(work, 'vendor/docs-areas.txt'), `${AREAS.join('\n')}\n`);
  // The corpus REGISTERED, exactly as a cloned engine checkout carries it: a `.gitmodules` entry
  // plus a 160000 index entry and nothing on disk. Without it `git submodule status` reports the
  // corpus uninitialised for ever and B02 fails its completeness check after a perfectly good
  // sync — which is what the first run of this harness did.
  writeFileSync(join(work, '.gitmodules'),
    `[submodule "vendor/ServiceNowDocs"]\n\tpath = vendor/ServiceNowDocs\n`
    + `\turl = ${pathToFileURL(upstream.bare).href}\n\tbranch = australia\n\tshallow = true\n`);

  // `node_modules` — see `placeModules`. Linked by default because fixture release B rebuilds
  // `dist/`, which needs TypeScript, and copying 400 MB per run would make this harness unusable.
  // It is gitignored, so it never reaches a commit or a tag: the tree the releases carry is the
  // same either way. A caller that will INSTALL must pass `{ modules: 'copy' }`.
  phase(`modules-${modules}`, marks, () => placeModules(work, modules));

  phase('rewrite-version', marks, () => rewriteVersion(work, '9.0.0'));

  // ARC-09-C13 — REGENERATE WHAT THE REWRITTEN CONFIG IMPLIES. The lines above deliberately give
  // the fixture a different corpus upstream and pin from the real checkout, and several generated
  // files embed one or both — so the COPIED versions are stale BY CONSTRUCTION, not by drift, and
  // `gen-all --check` says so from inside the release's own lint gate. Copying more files cannot
  // fix that: the fixture has to regenerate, exactly as a maintainer would after editing
  // `engine.config.json`. One call rather than a list of generators, for the same reason `gen-all`
  // Placed LAST, after the version rewrite and the `.gitmodules` write: the generated blocks
  // embed the version and the corpus registration too, so regenerating before those lines ran
  // left three targets stale — which the release's lint gate then reported, correctly.
  // exists — a list here would be the copy that goes stale when somebody adds the next generator.
  phase('gen-all', marks, () => execFileSync(process.execPath,
    [join(work, 'scripts/gen-all.mjs')], { cwd: work, stdio: 'pipe' }));
  phase('git-init', marks, () => git(work, ['init', '-q', '-b', 'main']));
  // Written into the fixture repository the moment it exists, so every git that ever runs here —
  // including ones this suite does not spawn — reads it. See `persistLongPaths`.
  persistLongPaths(work);
  commit(work, 'v9.0.0', upstream.pin);
  await tagRelease(work, '9.0.0', { claudeFloor });
  marks.push(`release-A-base=${Math.round(Number(process.hrtime.bigint() - worldStart) / 1e6)}ms`);

  // ── A: v9.1.0 — one declared input moves, so exactly one step goes stale ──────────────────
  const areas = join(work, 'vendor/docs-areas.txt');
  // One area REMOVED rather than added: every area the file names must exist upstream, and a
  // release that asks for one that does not is a broken release rather than a test.
  writeFileSync(areas, `${AREAS.slice(0, -1).join('\n')}\n`);
  phase('rewrite-version-A', marks, () => rewriteVersion(work, '9.1.0'));
  commit(work, 'feat(docs): one fewer area', upstream.pin);
  const tA = process.hrtime.bigint();
  await tagRelease(work, '9.1.0', { claudeFloor });
  marks.push(`tag-A=${Math.round(Number(process.hrtime.bigint() - tA) / 1e6)}ms`);

  // ── B: v9.2.0 — the store's schema moves, so B06 migrates rather than re-wizards ──────────
  //
  // `schemaBump: false` (ARC-09-C13) leaves the schema alone. The upgrade suite needs the bump —
  // it is the whole point of release B — but it EDITS THE SOURCE, so the fixture's own test suite
  // then disagrees with it: `tests` asserts `schema v1 is current — nothing to do` and the fixture
  // says `v1 → v2 · 1 migration`. That matters because ARC-09-S11's AC 3 cuts a REAL release
  // inside this world, and a release runs the suite as a gate. A caller that wants to exercise the
  // release path rather than the migration path asks for the tree to stay as the repository has it.
  if (schemaBump) {
  const migrations = join(work, 'packages/snowarch/src/store/migrations/index.ts');
  const src = readFileSync(migrations, 'utf8');
  writeFileSync(migrations, src.replace('export const MIGRATIONS: Migration[] = [];',
    `export const MIGRATIONS: Migration[] = [{
  from: 1,
  to: 2,
  describe: 'add notes to every instance',
  up: (store) => ({
    ...store,
    instances: Object.fromEntries(Object.entries(
      store.instances as Record<string, Record<string, unknown>>)
      .map(([label, inst]) => [label, { ...inst, notes: '' }])),
  }),
}];`));
  const schema = join(work, 'packages/snowarch/src/store/schema.ts');
  writeFileSync(schema, readFileSync(schema, 'utf8')
    .replace('export const STORE_VERSION = 1;', 'export const STORE_VERSION = 2;'));
  }

  // The contract the tag SHIPS has to say 2, which means a real build — `upgrade` reads
  // `storeSchemaVersion` out of the tag before it checks anything out.
  //
  // AFTER the version rewrite, not before (ARC-09-C13). The contract EMBEDS the package version,
  // so building first left the head release carrying a contract that named the previous one — the
  // fixture's own version of the defect ARC-09-C12b fixed in the release script, and the reason a
  // release cut inside this world failed its `dist` gate with a sha nobody had touched.
  phase('rewrite-version-B', marks, () => rewriteVersion(work, '9.2.0'));
  execFileSync(process.execPath, [join(work, 'scripts/build-dist.mjs')],
    { cwd: work, stdio: 'pipe', encoding: 'utf8' });
  execFileSync(process.execPath, [join(work, 'packages/contract/pin.mjs'), '--yes'],
    { cwd: work, stdio: 'pipe', encoding: 'utf8' });
  // AND REGENERATE AGAIN, because three generated files carry the CONTRACT SHA in their header
  // (`gen-governance`'s rule file, protocols and troubleshooting). `rewriteVersion` regenerated for
  // the version; the rebuild above moved the sha afterwards, so the headers would name the previous
  // contract and the release's own lint gate would report them stale — which is ARC-09-C12b's
  // ordering lesson (rebuild first, then generate, because the generated files quote the artefact)
  // arriving in the harness.
  regenerate(work);
  commit(work, 'feat(server): store schema v2', upstream.pin);
  const tB = process.hrtime.bigint();
  await tagRelease(work, '9.2.0', { claudeFloor });
  marks.push(`tag-B=${Math.round(Number(process.hrtime.bigint() - tB) / 1e6)}ms`);

  // ── the bare origin, and the user's clone at v9.0.0 ───────────────────────────────────────
  const origin = join(scratch, 'origin.git');
  phase('clone-bare', marks, () => gitRaw(['clone', '--quiet', '--bare', work, origin]));

  const user = join(scratch, 'user');
  phase('clone-user', marks, () => gitRaw(['clone', '--quiet', pathToFileURL(origin).href, user]));
  // The user's clone gets the same treatment: B06's migration runs the BUILT CLI, which imports
  // commander, and a design-only bootstrap never installs dependencies.
  phase(`modules-user-${modules}`, marks, () => placeModules(user, modules));
  git(user, ['checkout', '--quiet', 'v9.0.0']);
  git(user, ['config', 'user.email', 'f@example.com']);
  git(user, ['config', 'user.name', 'f']);

  // A `claude` on PATH, because the bootstrap's preflight requires one and a CI runner has none —
  // the upgrade's U6 is a real bootstrap and refuses to run without it, exactly as it would on a
  // user's machine. The FIXTURE supplies the prerequisite; the product does not skip the check.
  // AC 8 overrides this with a version below a release's floor.
  const bin = fakeClaude(join(scratch, 'bin'), '2.1.258 (Claude Code)');

  // ARC-09-C28 instrument, removed when the chore closes. One line per world, stdout only.
  marks.push(`TOTAL=${Math.round(Number(process.hrtime.bigint() - worldStart) / 1e6)}ms`);
  writeSync(1, `    world[${process.platform}] ${marks.join(' ')}\n`);
  return { scratch, work, origin, user, bin };
}

/** The user's clone, bootstrapped design-only, with a v1 store beside it. */
export function bootstrapUser(user, { store = true } = {}) {
  // `spawnSync` and an explicit throw, not `execFileSync`: its error message names the COMMAND and
  // swallows the child's output, so a failure on a runner arrives as an unreadable command line
  // and no reason at all. The whole transcript goes into the error instead.
  const r = spawnSync(process.execPath,
    [join(user, 'tools/snowarch/bin/snowarch.mjs'), 'bootstrap',
      '--mode', 'design', '--yes', '--skip-claude-check', '--docs', 'sparse'],
    { cwd: user, encoding: 'utf8', env: { ...process.env, CLAUDE_PROJECT_DIR: user } });
  if (r.status !== 0) {
    throw new Error(`the fixture bootstrap exited ${r.status ?? r.signal ?? 'abnormally'}:\n`
      + `${r.stdout ?? ''}${r.stderr ?? ''}`);
  }
  if (store) writeStore(user);
  return r.stdout ?? '';
}

/** Two instances, fixture credentials, schema v1 — the file the upgrade must not touch. */
export function writeStore(user) {
  const dir = join(user, '.local');
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  const path = join(dir, 'instances.json');
  writeFileSync(path, `${JSON.stringify({
    version: 1,
    defaultInstance: 'pdi',
    instances: {
      pdi: {
        url: 'https://dev12345.service-now.com', environment: 'pdi',
        auth: { method: 'basic', username: 'fixture.user', password: FIXTURE_PASSWORD },
        preset: 'pdi-developer', toolPackage: 'full', maxRecords: 100, prodWriteAck: false,
      },
      other: {
        url: 'https://dev67890.service-now.com', environment: 'dev',
        auth: { method: 'basic', username: 'fixture.two', password: FIXTURE_PASSWORD },
        preset: 'read-only', toolPackage: 'full', maxRecords: 100, prodWriteAck: false,
      },
    },
  }, null, 2)}\n`, { mode: 0o600 });
  if (process.platform !== 'win32') chmodSync(path, 0o600);
  return path;
}

/**
 * `./snowarch <args>` in the user's clone, as a user would type it.
 *
 * Spawned, never imported: the command spawns `bootstrap` and `doctor` of its own, and a test that
 * called the function in-process would be exercising a different program from the one a user runs.
 */
export function snowarch(user, args, { env = {}, input = '', bin = null } = {}) {
  // The shim goes FIRST on PATH unless the caller brought its own environment: U6 runs a real
  // bootstrap, whose preflight wants Claude Code, and a hosted runner has none.
  const path = bin && !env.PATH
    ? { PATH: `${bin}${process.platform === 'win32' ? ';' : ':'}${process.env.PATH}` }
    : {};
  const r = spawnSync(process.execPath,
    [join(user, 'tools/snowarch/bin/snowarch.mjs'), ...args], {
      cwd: user, encoding: 'utf8', input,
      env: { ...process.env, CLAUDE_PROJECT_DIR: user, ...path, ...env },
    });
  return { status: r.status, stdout: r.stdout ?? '', stderr: r.stderr ?? '',
    text: `${r.stdout ?? ''}${r.stderr ?? ''}` };
}

/** A PATH shim that makes `claude --version` answer whatever a test needs (AC 8). */
export function fakeClaude(dir, version) {
  mkdirSync(dir, { recursive: true });
  if (process.platform === 'win32') {
    writeFileSync(join(dir, 'claude.cmd'), `@echo off\r\necho ${version}\r\n`);
  } else {
    const p = join(dir, 'claude');
    writeFileSync(p, `#!/bin/sh\necho "${version}"\n`);
    chmodSync(p, 0o755);
  }
  return dir;
}
