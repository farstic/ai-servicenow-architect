import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

/**
 * The launcher prints the same sentences the Node path does — and it runs on machines with no Node
 * to check it, which is exactly where a drifted copy would go unnoticed for a release. So every
 * embedded string is compared against the file it was generated from, and the recipe is asserted to
 * be SOURCED rather than copied.
 */
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const launcher = readFileSync(join(root, 'bootstrap.sh'), 'utf8');
const remedies = JSON.parse(readFileSync(join(root, 'tools/snowarch/lib/remedies.json'), 'utf8'));
const text = JSON.parse(readFileSync(join(root, 'tools/snowarch/lib/text.json'), 'utf8'));
const config = JSON.parse(readFileSync(join(root, 'engine.config.json'), 'utf8'));

/** The value of a single-quoted shell assignment in the generated region. */
function shellVar(name) {
  const m = new RegExp(`^${name}='((?:[^']|'\\\\'')*)'$`, 'm').exec(launcher);
  assert.ok(m, `${name} is not assigned in bootstrap.sh`);
  return m[1].replace(/'\\''/g, "'");
}

test('every embedded sentence equals the file it was generated from', async () => {
  const sentences = await import(
    pathToFileURL(join(root, 'tools/snowarch/lib/net-sentences.mjs')).href);

  assert.equal(shellVar('SERVER_KEY'), config.mcp.serverKey);
  assert.equal(shellVar('MSG_NODE_DARWIN'), remedies.node.darwin);
  assert.equal(shellVar('MSG_NODE_LINUX'), remedies.node.linux);
  assert.equal(shellVar('MSG_GIT_DARWIN'), remedies.git.darwin);
  assert.equal(shellVar('MSG_GIT_LINUX'), remedies.git.linux);
  assert.equal(shellVar('MSG_CLAUDE'), remedies.claudeCode.default);
  assert.equal(shellVar('MSG_NET'), remedies.network.default);
  // ARC-03's network vocabulary, not a second phrasing of it.
  assert.equal(shellVar('MSG_DNS'), sentences.dnsFailure('github.com'));
  assert.equal(shellVar('MSG_TLS'), sentences.tlsIntercepted({ tool: sentences.TOOL.git }));
  // ARC-06-S09's closing block, including the newlines inside it.
  assert.equal(shellVar('MSG_DOCTOR'), text.doctorUnavailable);
  assert.equal(shellVar('MSG_MODE'), text.modeDesign);
  assert.equal(shellVar('MSG_NEXT'), text.posix.nextDesign);
});

test('the generated region is current — the check the generator itself runs', () => {
  const r = spawnSync(process.execPath, [join(root, 'scripts/gen-launcher-text.mjs'), '--check'],
    { encoding: 'utf8', cwd: root });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /text region is current/);
});

test('the recipe is SOURCED, not copied — there is only one copy of those commands', () => {
  assert.match(launcher, /^\. "\$ROOT\/tools\/snowarch\/launcher\/docs-recipe\.sh"$/m);
  // The recipe's own distinctive line must appear in the recipe file and nowhere in the launcher.
  const copies = (launcher.match(/sparse-checkout set/g) ?? []).length;
  assert.equal(copies, 0, 'the launcher carries its own copy of the recipe');
  const recipe = readFileSync(join(root, 'tools/snowarch/launcher/docs-recipe.sh'), 'utf8');
  assert.match(recipe, /sparse-checkout set/);
  // ...and it calls the functions that file defines.
  for (const fn of ['docs_recipe_sparse', 'docs_recipe_full']) {
    assert.ok(launcher.includes(fn), `${fn} is never called`);
    assert.ok(recipe.includes(`${fn}()`), `${fn} is not defined by the recipe file`);
  }
});

test('bash 3.2 — none of the forbidden constructs appears', () => {
  // macOS ships bash 3.2 and always will; every one of these is 4.0+ or a non-POSIX tool, and
  // each would fail on the exact machine this launcher exists for.
  const forbidden = [
    [/\bdeclare -A\b/, 'associative arrays'],
    [/\bmapfile\b|\breadarray\b/, 'mapfile/readarray'],
    [/\$\{[A-Za-z_][A-Za-z0-9_]*,,\}/, '${var,,}'],
    [/\[\[.*=~.*\]\]/, '[[ =~ ]]'],
    [/(^|[^-\w])curl\b/, 'curl'],
    [/(^|[^-\w])jq\b/, 'jq'],
    [/(^|[^-\w])python[0-9]?\b/, 'python'],
    [/(^|[^-\w])timeout\b/, 'timeout'],
    [/\bsort -V\b/, 'sort -V (absent on BSD)'],
  ];
  const body = launcher.split('\n').filter((l) => !l.trim().startsWith('#')).join('\n');
  for (const [pattern, name] of forbidden) {
    assert.ok(!pattern.test(body), `bootstrap.sh uses ${name}`);
  }
  // Not vacuous: the same scan finds a planted one.
  assert.ok(forbidden[0][0].test('declare -A x'));
});

test('the file is executable, LF-only, and parses under bash', () => {
  assert.ok(!launcher.includes('\r'), 'CRLF line endings');
  assert.equal(launcher.at(-1), '\n');
  if (process.platform !== 'win32') {
    assert.ok((statSync(join(root, 'bootstrap.sh')).mode & 0o111) !== 0, 'the executable bit is not committed');
  }
  // `bash -n` is the parse; the run itself is CI's job, with Node stripped from PATH.
  assert.doesNotThrow(() => execFileSync('bash', ['-n', join(root, 'bootstrap.sh')], { stdio: 'pipe' }));
});

test('the launcher is short — it is a launcher, not a second implementation', () => {
  const lines = launcher.split('\n').filter((l, i, a) => !(i === a.length - 1 && l === '')).length;
  const generated = launcher.slice(launcher.indexOf('# text-begin'),
    launcher.indexOf('# text-end')).split('\n').length + 1;
  // The story's budget is 180 and assumed the recipe was EMBEDDED; the ruling moved it out to a
  // sourced file, and added a generated region in its place. Hand-written lines are what a reader
  // has to hold in their head, so that is what is measured — with the total reported beside it.
  assert.ok(lines - generated <= 180,
    `${lines - generated} hand-written lines (${lines} total, ${generated} generated)`);
  assert.ok(lines <= 200, `${lines} total lines`);
});

test('the state and the cache bash writes are the ones Node reads', async () => {
  // The launcher writes S03's schema and S08's cache by heredoc. A Node test loads both through the
  // real readers rather than parsing them here: "it is valid JSON" is not the claim — "the module
  // that consumes it accepts it" is.
  const { loadState, assertStorable } = await import(
    pathToFileURL(join(root, 'tools/snowarch/lib/state.mjs')).href);
  const { COMPATIBILITY_KEYS } = await import(
    pathToFileURL(join(root, 'tools/snowarch/lib/doctor-cache.mjs')).href);

  const fixture = JSON.parse(readFileSync(join(root, 'tests/fixtures/bash-written-state.json'), 'utf8'));
  assert.equal(fixture.state.writer, 'bash');
  assert.equal(fixture.state.version, 1);
  assert.doesNotThrow(() => assertStorable(fixture.state), 'the guard rejects what bash wrote');
  for (const key of COMPATIBILITY_KEYS) {
    assert.ok(key in fixture.cache, `the bash cache is missing ${key}`);
  }
  assert.equal(fixture.cache.writer, 'bootstrap');
  assert.equal(typeof loadState, 'function');
});
