// Copyright 2026 Cvetomir Grigorov. Licensed under the Business Source License 1.1 (see LICENSE).
// snowarch — AI ServiceNow Architect. Not affiliated with or endorsed by ServiceNow, Inc.
/**
 * ARC-11-C6 — how a test starts a process that trusts a fixture key, and finds a licence signed with it.
 *
 * `fixtureKeysHook(dir, keys)`, from the spike, writes two files into a test's own temp directory:
 * - `fixture-keys.mjs`, a fixture keys module in the shape of the shipped ones (`PRODUCT_KEYS` and nothing else);
 * - `register-hook.mjs`, which registers `hooks.mjs` with that module's URL baked in, so the hook reads no
 *   variable at all.
 *
 * It returns `nodeOptions`, the `--import` flag for `NODE_OPTIONS` (which reaches a node started through
 * a launcher), and `importArgs`, the same flag for a node started directly. URLs, never paths: on
 * Windows `--import` refuses an absolute path that is not a `file:` URL, and a URL carries no space.
 *
 * `licensedEnv(env, { root, licence })` is what a test calls when it starts the CLI, the server or a launcher
 * (C6 step 1; `licence-spawn-class.test.mjs` holds every such start to it). From 2.0.13 that process refuses
 * without a licence it trusts, so a test that started one bare would be testing the gate, not its subject.
 * It returns a copy of `env` with:
 * - the hook added to `NODE_OPTIONS`, after anything already there, so the child, and any node it starts,
 *   trusts this process's fixture key;
 * - a fixture licence signed with that key, at `.local/licence.json` under every root the child reads one
 *   from: `root` when given, and `SNOWARCH_STATE_ROOT` and `CLAUDE_PROJECT_DIR` when `env` sets them. With
 *   none of the three, a new temp directory becomes `SNOWARCH_STATE_ROOT`, which is where the CLI reads it;
 * - in that new temp directory, and only there, when the checkout is a release version, a signed manifest of it
 *   at `.local/release-manifest.json` (ARC-09-C146, below).
 *
 * `licence: false` writes none, for a test of a checkout without one; the child still runs under the fixture
 * keys. An object replaces fields of the licence (`{ scope: 'design-only' }`). The default is live and
 * perpetual, so no test starts failing on a date.
 *
 * It never writes inside this repository: the owner's own licence is in its `.local/`, and a test that wrote
 * there would replace it. A root inside the checkout throws.
 *
 * ARC-09-C146 — A RELEASE-VERSIONED TREE. A release writes its version before its post-write suite, and from C141 a
 * launcher on a release version restores against that release's signed manifest, which is signed only after the tag:
 * the rc.2 cut's suite refused 34 cases on a manifest no state root held. So the state root this helper makes holds
 * a `snowarch-manifest/1` of the checkout:
 * - over its working tree when the fixture is made, never `git archive` (a release's written tree is uncommitted):
 *   the checkout's bytes, the files the product's own walk finds, the coverage the signer uses (`COVERAGE`);
 * - tagged `v<version>`, naming the tag's commit when the tag is here and HEAD when it is not;
 * - signed with this process's fixture primary, and made once per process and checkout, so a tree changed after it
 *   reads as changed.
 * `checkout` (default this repository) changes only which tree is hashed, never which root is seeded:
 * - a root the caller passes (`root`, or `SNOWARCH_STATE_ROOT` or `CLAUDE_PROJECT_DIR` in `env`) is never seeded, so a
 *   case that asserts a missing, stale or changed manifest builds its own; with one, or with `licence: false`,
 *   `checkout` throws, as nothing would be seeded;
 * - a `checkout` that is not a release version throws: a case that asks for a release tree and is handed a
 *   development one would pass on the development exemption, not on its manifest.
 * Without `checkout`, a development version seeds nothing, exempt as it is on develop.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { PRODUCT_KEYS as SHIPPED_KEYS } from '../../../lib/licence/keys.mjs';
import {
  COVERAGE, checkTree, hashBytes, releaseTagOf, signManifest, tagCommit,
} from '../../../lib/licence/manifest.mjs';
import { keyPair, licenceText, productKeys } from '../licence.mjs';
import { remove, tempDir } from '../temp.mjs';

const HOOKS_URL = new URL('./hooks.mjs', import.meta.url).href;
const REPO = resolve(fileURLToPath(new URL('../../../../../', import.meta.url)));

/**
 * ARC-09-C138 — the module trusts the fixture keys AND the shipped ones. A test signs its licence with a key
 * made for the run, and a release's manifest is signed with the owner's primary; under the hook both must
 * verify. With the fixture keys alone, the first signed release failed E-32 in CI's evidence step (run
 * 38515024672: "not signed by a key this product ships") while every real install verified it.
 *
 * This widens nothing an install trusts: the hook is loaded only through `--import`, by tests and CI, never
 * by a product start, and `licence-keys-guard` holds the shipped modules to exactly their two keys.
 */
export function fixtureKeysHook(dir, keys) {
  const keysFile = join(dir, 'fixture-keys.mjs');
  const trusted = [...keys, ...SHIPPED_KEYS.filter((s) => !keys.some((k) => k.fingerprint === s.fingerprint))];
  writeFileSync(keysFile, `export const PRODUCT_KEYS = Object.freeze(${JSON.stringify(trusted, null, 2)}.map((k) => Object.freeze(k)));\n`);
  const keysUrl = pathToFileURL(keysFile).href;
  const registerFile = join(dir, 'register-hook.mjs');
  writeFileSync(registerFile, "import { register } from 'node:module';\n"
    + `register(${JSON.stringify(HOOKS_URL)}, { data: { keysUrl: ${JSON.stringify(keysUrl)} } });\n`);
  const registerUrl = pathToFileURL(registerFile).href;
  return { keysUrl, registerUrl, importArgs: [`--import=${registerUrl}`], nodeOptions: `--import=${registerUrl}` };
}

let fixture = null;
/** The state roots licensedEnv made for children with nowhere else to read a licence. */
const made = [];

/**
 * This process's fixture: a primary and a recovery pair made here, the product key list built from them, and
 * the hook that trusts that list. Made once per process, in a temp directory removed at exit.
 */
export function licenceFixture() {
  if (!fixture) {
    const primary = keyPair();
    const keys = productKeys(primary, keyPair());
    const dir = tempDir('snowarch-licence-hook-');
    fixture = { primary, keys, dir, hook: fixtureKeysHook(dir, keys), manifests: new Map() };
  }
  return fixture;
}

/** The fixture licence: live, perpetual (no `valid_until`), and an id no real licence has. */
export const FIXTURE_LICENCE = Object.freeze({
  id: 'LIC-2026-9000', licensee: 'Test Licensee', org: 'Test Org', scope: 'live', issued: '2026-01-15',
  issuer: 'Test Issuer', notes: '',
});

/** A licence file's text, signed with this process's fixture key; `over` replaces fields of the fixture's. */
export function fixtureLicenceText(over = {}) {
  const payload = { ...FIXTURE_LICENCE, ...over };
  for (const [k, v] of Object.entries(payload)) if (v === undefined) delete payload[k];
  return licenceText(payload, licenceFixture().primary);
}

const inRepo = (p) => {
  const rel = relative(REPO, resolve(p));
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel));
};

/**
 * Remove what this process made: the hook's directory and the state roots made for children, each with its owner
 * record. node:test's exit sweep does this anyway; a vitest worker does not reliably reach an exit handler (see
 * `packages/snowarch/tests/licence/fixtures.ts`), so the package's setup calls this after each file. The next
 * caller of licenceFixture gets a fresh fixture.
 */
export function releaseLicenceFixture() {
  for (const dir of [...(fixture ? [fixture.dir] : []), ...made.splice(0)]) {
    remove(dir);
    remove(`${dir}.owner`);
  }
  fixture = null;
}

/**
 * The manifest file a made state root holds for `checkout` (ARC-09-C146), or `null` for a development version the
 * caller did not name. Made at the first ask in this process, and the same text after.
 */
function fixtureManifestText(checkout, named) {
  const tag = releaseTagOf(checkout);
  if (!tag) {
    if (!named) return null;
    throw new Error(`licensedEnv: ${checkout} is not a release version — a checkout is named for a release tree, `
      + 'and a development one would pass on its exemption, not on the manifest');
  }
  const { primary, manifests } = licenceFixture();
  if (!manifests.has(checkout)) {
    const head = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: checkout, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
    const body = { tag, commit: tagCommit(checkout, tag) ?? head, covers: [...COVERAGE.covers],
      excludes: [...COVERAGE.excludes], ignores: [...COVERAGE.ignores], files: {} };
    // The product's own walk names the files: against an empty list, every covered file under a covered directory is
    // an extra. The single files it covers are added when present.
    const paths = [...checkTree(checkout, body).modified.map((d) => d.path),
      ...body.covers.filter((c) => !c.endsWith('/') && existsSync(join(checkout, c)))];
    for (const p of paths.sort()) body.files[p] = hashBytes(readFileSync(join(checkout, ...p.split('/'))));
    const doc = signManifest(body, primary.privateKey);
    manifests.set(checkout, `${JSON.stringify({ tag, checkedAt: new Date().toISOString(), source: 'licensedEnv (ARC-09-C146)', doc }, null, 2)}\n`);
  }
  return manifests.get(checkout);
}

export function licensedEnv(env = process.env, { root, licence = {}, checkout } = {}) {
  const { hook } = licenceFixture();
  const out = {};
  for (const [k, v] of Object.entries(env)) if (v !== undefined) out[k] = String(v);
  const flags = (out.NODE_OPTIONS ?? '').split(/\s+/).filter(Boolean);
  if (!flags.includes(hook.nodeOptions)) flags.push(hook.nodeOptions);
  out.NODE_OPTIONS = flags.join(' ');

  const roots = new Set([root, out.SNOWARCH_STATE_ROOT, out.CLAUDE_PROJECT_DIR].filter(Boolean).map((r) => resolve(r)));
  if (checkout !== undefined && (licence === false || roots.size > 0)) {
    throw new Error('licensedEnv: checkout names the tree hashed for a state root this helper makes, and '
      + `${licence === false ? 'licence: false makes none' : 'a root of the caller\'s is never seeded'} — drop one of the two`);
  }
  if (licence === false) return out;
  let seeded = null;
  if (roots.size === 0) {
    out.SNOWARCH_STATE_ROOT = tempDir('snowarch-licensed-state-');
    made.push(out.SNOWARCH_STATE_ROOT);
    roots.add(resolve(out.SNOWARCH_STATE_ROOT));
    seeded = resolve(out.SNOWARCH_STATE_ROOT);
  }
  // Every root is checked before any is written, so a refusal leaves nothing behind.
  const inside = [...roots].filter(inRepo);
  if (inside.length) {
    throw new Error(`licensedEnv: ${inside.join(', ')} is inside this repository — a fixture licence there would `
      + 'replace the one in its .local/; give the child a temp root (root, SNOWARCH_STATE_ROOT or CLAUDE_PROJECT_DIR)');
  }
  const text = fixtureLicenceText(licence);
  for (const r of roots) {
    const file = join(r, '.local', 'licence.json');
    // The same licence is not written again: a doctor's cache keys on its inputs' times, and a test that runs
    // the CLI twice must not see an input it did not change move.
    if (existsSync(file) && readFileSync(file, 'utf8') === text) continue;
    mkdirSync(join(r, '.local'), { recursive: true, mode: 0o700 });
    writeFileSync(file, text);
  }
  const manifest = seeded && fixtureManifestText(resolve(checkout ?? REPO), checkout !== undefined);
  if (manifest) writeFileSync(join(seeded, '.local', 'release-manifest.json'), manifest, { mode: 0o600 });
  return out;
}
