/**
 * ARC-09-C31 — the doctor has one clock, and it returns a number.
 *
 * `ctx.now()` is EPOCH MILLISECONDS. The runner does arithmetic on it (`now() - started`, for every
 * check's `durationMs`), the report wraps it where it needs a `Date` (`new Date(now())`, three
 * places in `doctor/index.mjs`), and `Date.now()` is what any caller reaches for.
 *
 * E-28 took the other reading. It wrote `const now = ctx.now ?? (() => new Date())` — which looks
 * like a careful fallback and is the defect: the fallback returns a `Date` and the real `ctx.now`
 * returns a number, so the check behaved one way in its own tests and another in production. It
 * crashed the first time there was a release tag to compare against, in two different places,
 * measured on isolated fixtures before the fix:
 *
 *   no cache · release tag   → THREW  now(...).toISOString is not a function   (writeUpgradeCheck)
 *   WITH cache · any tags    → THREW  now(...).getTime is not a function       (isFresh)
 *
 * The second is the one worth pausing on: it needs no release tag at all. Any machine that had ever
 * completed one successful check carried a cache, and every networked doctor run after that would
 * have crashed on it. The rc.1 tag exposed the first path; the second was waiting for anyone.
 *
 * So the rule is mechanical now rather than remembered.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const posix = (p) => p.split(sep).join('/');
const CHECKS = 'tools/snowarch/lib/doctor/checks';

/** Every source scan strips comments (CONTRIBUTING) — a clock in prose is not a clock. */
const strip = (src) => src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/.*$/gm, '$1');

const checkFiles = () => readdirSync(join(root, CHECKS), { withFileTypes: true })
  .filter((e) => e.isFile() && e.name.endsWith('.mjs'))
  .map((e) => posix(join(CHECKS, e.name)));

/**
 * Uses of `ctx.now` that are not wrapped — the rule is `new Date(ctx.now`, not `new Date(`.
 *
 * THE FIRST VERSION OF THIS SCAN ACCEPTED THE LINE THAT CRASHED. It asked whether the line
 * contained `new Date(` anywhere, and the defect was
 *
 *     const now = ctx.now ?? (() => new Date());
 *
 * which contains it — in the FALLBACK, for the case where `ctx.now` is absent. The two halves of
 * that expression return different types, which is the whole bug, and a scan looking for the words
 * rather than the relationship waved it through. Caught by its own control, which is what the
 * control is for.
 *
 * So the wrap has to be around THIS clock: the line must contain `new Date(ctx.now`. That accepts
 * both shapes the tree actually uses — `new Date(ctx.now())` at the call site, and the guarded
 * thunk `() => new Date(ctx.now ? ctx.now() : Date.now())` — and refuses aliasing it, passing it to
 * a helper, or calling it for a `Date` method.
 */
export function unwrappedClockUses(text) {
  const src = strip(text);
  const out = [];
  src.split('\n').forEach((line, i) => {
    if (!/\bctx\.now\b/.test(line)) return;
    if (/new Date\s*\(\s*ctx\.now\b/.test(line)) return;
    out.push(`${i + 1}: ${line.trim().slice(0, 78)}`);
  });
  return out;
}

test('C31 — no check hands `ctx.now` to anything that wants a Date', () => {
  const files = checkFiles();
  assert.ok(files.length > 3, `only ${files.length} check file(s) scanned — the walk is wrong`);

  const findings = [];
  for (const rel of files) {
    for (const hit of unwrappedClockUses(readFileSync(join(root, rel), 'utf8'))) {
      findings.push(`${rel}:${hit}`);
    }
  }
  assert.deepEqual(findings, [], `${findings.length} unwrapped ctx.now use(s):\n  ${findings.join('\n  ')}`);

  // Not vacuous: at least one check really does use the clock, so this is scanning something.
  const users = files.filter((rel) => /\bctx\.now\b/.test(strip(readFileSync(join(root, rel), 'utf8'))));
  assert.ok(users.length > 0, 'no check uses ctx.now at all — the scan proves nothing');
});

test('C31 — the scan reports the shape that crashed, and accepts the shape that works', () => {
  // Both directions, on the two real spellings. Without the first half this passes on a scan that
  // matches nothing; without the second it passes on a scan that matches everything.
  // THE EXACT LINE THAT CRASHED must be a finding. It was not, under the first rule.
  assert.deepEqual(unwrappedClockUses('const now = ctx.now ?? (() => new Date());'),
    ['1: const now = ctx.now ?? (() => new Date());']);
  // ...and the two shapes the tree uses are accepted.
  assert.deepEqual(unwrappedClockUses('const now = () => new Date(ctx.now ? ctx.now() : Date.now());'), []);
  assert.deepEqual(unwrappedClockUses('const at = new Date(ctx.now());'), []);

  assert.deepEqual(unwrappedClockUses('writeUpgradeCheck(root, { now: ctx.now });'),
    ['1: writeUpgradeCheck(root, { now: ctx.now });']);
  assert.deepEqual(unwrappedClockUses('const now = ctx.now;'), ['1: const now = ctx.now;']);
  assert.deepEqual(unwrappedClockUses('const stamp = ctx.now().toISOString();'),
    ['1: const stamp = ctx.now().toISOString();']);

  // Prose is not code — the rule this repository states, and ARC-06-C1 is why it is asserted.
  assert.deepEqual(unwrappedClockUses('// never pass ctx.now to something expecting a Date'), []);
});
