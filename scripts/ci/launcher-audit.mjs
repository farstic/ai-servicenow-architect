// ARC-07-C35 — the launcher audit: every asserted launcher, resolved to the product line that prints
// it, checked for agreement, and failing in the gate instead of on three Windows cells.
//
// WHAT IT IS FOR. A test that asserts a launcher must derive it when the product line DERIVES, and pin
// POSIX when the product line is pinned. Nothing at the assertion says which, so the classification is
// made from memory — and across ARC-07-C31's slices 1 and 2 that cost four Windows rounds of roughly
// twenty-five minutes each. Two of them were the same pair got wrong in OPPOSITE directions in one
// push. This turns that into a local second.
//
// WHAT IT CAN AND CANNOT DO, measured rather than hoped, because the first three designs each failed a
// different way:
//   1. Probing with the words ADJACENT to the launcher is unusable: "docs sync" matches 29 product
//      lines spanning both kinds, and "doctor" and "upgrade" are worse.
//   2. Treating "the line mentions a spelling constant" as "the line asserts a launcher" produced 106
//      false targets — `formatResult(r, SPELL)` threads a spelling, it asserts nothing.
//   3. A TARGET is a line where the spelling is interpolated INTO A STRING, or a launcher literal
//      appears, on a line that also asserts. That detector is right: 45 real targets, no false ones.
//   4. Joining `+` continuations, which looked like the fix for the unresolved residue, changed
//      nothing. The residue is a KEY problem, not a line problem.
//
// AND THE NUMBERS, stated plainly because I first reported them ambiguously: of 45 targets, **3
// RESOLVE** and 42 do not. Two corrections got it there. Stripping trailing `));` from the key was
// right but made keys shorter and so more ambiguous; and the assertion's FIRST ARGUMENT was still
// in the key, so `assert.equal(r.text, 'corpus missing — run …')` looked for `r.text, corpus
// missing …` in the product, which nothing can carry. With both fixed the resolved set is small but
// real, and every resolved site agrees.
//
// So what this instrument actually buys today is the THIRD failure mode, and it is worth the file: a
// NEW asserted launcher in any test fails the gate locally, because it is an unresolved site the
// baseline does not list — which forces whoever wrote it to classify it deliberately instead of
// finding out from three Windows cells. The MISMATCH path is real and controlled by planting a product
// line and a test line that assert against it, but the repository has no resolvable site for it to fire
// on until ARC-07-C35b's extractor lands. That is a capability with no current occurrence, not a claim.
//
// So the resolvable set is checked exactly, and THE UNRESOLVED SET IS FROZEN PER FILE with exact
// counts asserted EQUAL — the discipline `tests/windows-spellings.test.mjs` uses for the sweep
// remainder, and for the same reason: a new unresolved site fails as loudly as a mismatch, and the
// baseline can only shrink. Resolving the residue needs a real extractor for template literals with
// interpolations, regex literals and concatenation, plus tracing which command a case runs; that is
// ARC-07-C35b, and these counts are its measurement.
//
// Usage: node scripts/ci/launcher-audit.mjs [--json]
// Exit 0 when every resolved target agrees and the baseline matches · 1 on any of the three failures.
import { readFileSync, writeSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

const ls = (...paths) => execFileSync('git', ['ls-files', ...paths],
  { cwd: ROOT, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 }).split('\n').filter(Boolean);

const read = (rel) => readFileSync(resolve(ROOT, rel), 'utf8');

/** Comments blanked, line count preserved — the same rule the launcher sweep uses, for the same reason. */
const codeOf = (text) => text
  .replace(/\/\*[\s\S]*?\*\//g, (block) => '\n'.repeat((block.match(/\n/g) ?? []).length))
  .split('\n')
  .map((line) => line.replace(/(^|[^:])\/\/.*$/, '$1'))
  .join('\n');

const LAUNCHER = /\.\/snowarch|\.\/bootstrap\.sh|\.\\\\snowarch\.cmd|\.\\\\bootstrap\.cmd|\.\\snowarch\.cmd/;
const hasLauncher = (text) => new RegExp(LAUNCHER.source).test(text);

/** A spelling read from the process renders whatever machine is running; one with a pinned platform does not. */
const DERIVED_CALL = /\b(spellings|cliSpelling|bootstrapSpelling)\(\s*\)/;

/** An interpolation that carries a launcher: `${cli}`, `${SPELL.cli}`, `${esc(FRAME_CLI)}`, … */
const INTERPOLATED = /\$\{[^}]*(cli|bootstrap|spell|CLI|POSIX|Spelling|SPELL)[^}]*\}/;

// A sentinel no source line contains, written as an ESCAPE rather than a raw byte: the first version
// held the literal control character, which is invisible in a diff and in review.
const MARK = '\u0001';

/**
 * A line reduced to the SENTENCE it carries, so both sides can be compared as prose.
 *
 * The launcher and every interpolation become one marker, a regex is unescaped, quoting and assertion
 * scaffolding go, whitespace collapses. BOTH SIDES go through this, which is the point: one definition
 * of what "the same sentence" means.
 */
const sentence = (line) => line
  .replace(new RegExp(LAUNCHER.source, 'g'), MARK)
  .replace(/\$\{[^}]*\}/g, MARK)
  .replace(/\\([.\/\\()[\]{}^$*+?|-])/g, '$1')
  .replace(/new RegExp\(|assert\.\w+\(|expect\(|\.(toContain|toBe|toMatch|toEqual|not)\(/g, ' ')
  // THE ASSERTION'S FIRST ARGUMENT IS AN EXPRESSION, NOT PROSE, and leaving it in was why nothing
  // resolved. `assert.equal(r.text, 'corpus missing — run …')` normalised to `r.text, corpus missing …`,
  // and no product line can carry `r.text,`. Stripping a leading identifier chain followed by a comma
  // is narrow enough to be safe: prose does not begin with `foo.bar[0]?.baz,`.
  .replace(/^\s*[A-Za-z_$][\w$.?[\]()]*\s*,\s*/, ' ')
  .replace(/['"`]/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();

/**
 * The distinctive run of prose beside the launcher: the longest stretch between markers.
 *
 * TRAILING SCAFFOLDING IS STRIPPED, and measuring is how I know to: the key for the store-root-entry
 * pair came out as `store <command> ));`, which no product line can contain, so a resolvable site was
 * reported unresolved for a reason that had nothing to do with the launcher.
 */
const keyOf = (text) => text.split(MARK)
  .map((part) => part.replace(/[\s,;)(]+$/, '').replace(/^[\s,;)(]+/, '').trim())
  .filter((part) => part.length >= 12)
  .sort((a, b) => b.length - a.length)[0] ?? null;

const PRODUCT_PATHS = ['tools/snowarch/lib', 'tools/snowarch/bin', 'packages/snowarch/src', 'scripts'];
// THREE TEST TREES, and the third was found by three red Windows cells rather than by this file.
// ARC-07-C31 slice 3 made the SERVER's sentences derive, and seventeen expectations in
// `packages/snowarch/tests` still held the POSIX spelling — a tree neither my hand sweep nor this
// audit's original scope looked at. The lesson is the audit's own: a scope I choose is not a scope
// that is complete, so the list is the trees that EXIST rather than the ones I remembered.
const TEST_PATHS = ['tests', 'tools/snowarch/tests', 'packages/snowarch/tests'];

/**
 * THE UNRESOLVED BASELINE — ARC-07-C35, measured 2026-09-27, target for C35b.
 *
 * Exact per file, asserted EQUAL and never `<=`: a new unresolved site fails exactly as loudly as a
 * mismatch, and a count that has come DOWN fails too, so the list shrinks as C35b resolves it instead
 * of quietly outliving the work.
 *
 * `tests/launcher-audit.test.mjs` IS IN ITS OWN BASELINE, and that is deliberate rather than awkward.
 * Its launcher literals are PLANTED FIXTURES — a product line and a test line written to be audited —
 * so they are not assertions about the product and cannot resolve. Excluding the file by name would be
 * an allow-list, which is the mistake this whole row exists to stop making; listing its count means a
 * change to those fixtures fails here and gets looked at, which is what should happen.
 */
const UNRESOLVED_BASELINE = Object.freeze(new Map([
  ['packages/snowarch/tests/cli/import-legacy.test.ts', 2],
  ['packages/snowarch/tests/cli/store-command.test.ts', 1],
  ['packages/snowarch/tests/cli/tty.test.ts', 1],
  ['packages/snowarch/tests/doctor/doctor.test.ts', 1],
  ['packages/snowarch/tests/server/store-schema.test.ts', 3],
  ['packages/snowarch/tests/servicenow/prod-ack.test.ts', 1],
  ['packages/snowarch/tests/store/migrations.test.ts', 1],
  ['packages/snowarch/tests/store/schema.test.ts', 1],
  ['packages/snowarch/tests/tools/gate-split.test.ts', 1],
  ['packages/snowarch/tests/tools/permissions.test.ts', 2],
  ['tests/cli-help.test.mjs', 1],
  ['tests/doctor/bootstrap-finished.test.mjs', 2],
  ['tests/doctor/engine-docs.test.mjs', 3],
  ['tests/doctor/framework.test.mjs', 1],
  ['tests/doctor/host.test.mjs', 3],
  ['tests/doctor/panel.test.mjs', 1],
  ['tests/doctor/release-currency.test.mjs', 3],
  ['tests/doctor/status-command.test.mjs', 2],
  ['tests/doctor/status-template.test.mjs', 1],
  ['tests/doctor/win32-remedies.test.mjs', 3],
  ['tests/handoff-command.test.mjs', 1],
  ['tests/hook/session-start.test.mjs', 1],
  ['tests/launcher-audit.test.mjs', 3],
  ['tests/upgrade/upgrade-unit.test.mjs', 1],
  ['tests/upgrade/upgrade.e2e.test.mjs', 1],
  ['tests/windows-spellings.test.mjs', 5],
  ['tools/snowarch/tests/b00-checks.test.mjs', 1],
  ['tools/snowarch/tests/b02-docs.test.mjs', 2],
  ['tools/snowarch/tests/b06-migration.test.mjs', 2],
  ['tools/snowarch/tests/bootstrap-plan.test.mjs', 1],
  ['tools/snowarch/tests/cli.test.mjs', 2],
  ['tools/snowarch/tests/store-root-entry.test.mjs', 2],
  ['tools/snowarch/tests/text.test.mjs', 2],
]));

/** The tracked files, as `{ file, text }` — the default sources for both halves. */
export const productSources = (paths = PRODUCT_PATHS) => ls(...paths)
  .filter((f) => /\.(mjs|ts|js)$/.test(f) && !/\.test\./.test(f) && !/\.d\.ts$/.test(f))
  .map((file) => ({ file, text: read(file) }));

export const testSources = (paths = TEST_PATHS) => ls(...paths)
  // `.ts` AS WELL AS `.mjs`, and this was the THIRD layer of the same fake widening: I added the
  // server's test path, then taught the detector to see `expect(` as well as `assert`, and the file
  // filter still said `.test.mjs` — so the audit reported success over a tree it was not reading. Each
  // layer looked like the fix and the measurement is what said otherwise.
  .filter((f) => /\.test\.(mjs|ts)$/.test(f))
  .map((file) => ({ file, text: read(file) }));

/**
 * Every product line that spells or derives a launcher, as a sentence with its kind.
 *
 * SOURCES RATHER THAN PATHS, so a control can plant a product line and a test line that assert against
 * it and audit the pair without adding files to the repository — which matters because the repository
 * has NO resolvable site today, so the mismatch path would otherwise be untestable.
 */
export function productIndex(sources = productSources()) {
  const index = [];
  for (const { file: rel, text } of sources) {
    codeOf(text).split('\n').forEach((line, i) => {
      const literal = hasLauncher(line);
      const derived = INTERPOLATED.test(line);
      if (!literal && !derived) return;
      index.push({ file: rel, line: i + 1, sentence: sentence(line), kind: literal ? 'PINNED' : 'DERIVED' });
    });
  }
  return index;
}

/**
 * Every asserted launcher in the tests, with what the EXPECTATION is and what the product does.
 *
 * `extraTestPaths` and `extraProductPaths` exist for the control: a planted file under a temp root has
 * to be auditable without moving it into the repository.
 */
export function audit({ tests = testSources(), product: productFiles = productSources(),
  baseline = UNRESOLVED_BASELINE } = {}) {
  const product = productIndex(productFiles);
  const mismatches = [];
  const unresolved = [];
  let agreed = 0;

  for (const { file: rel, text } of tests) {
    const src = codeOf(text);
    // A constant assigned from a spelling carries that spelling's kind to every line that uses it.
    const kinds = new Map();
    src.split('\n').forEach((line) => {
      const m = /^const (\w+) = (?:esc\()?\s*(spellings|cliSpelling|bootstrapSpelling)\(([^)]*)\)/.exec(line);
      if (m) kinds.set(m[1], m[3].trim() === '' ? 'DERIVED' : 'PINNED');
    });

    src.split('\n').forEach((line, i) => {
      // `assert` OR `expect`: the engine's suites use `node:assert`, the server's use vitest. Adding
      // `packages/snowarch/tests` to the paths without this matched almost nothing there — 1 target
      // in 18 literals — which would have been a widening in name only, and the baseline would have
      // recorded the blindness as success.
      if (!/\bassert\b|\bexpect\s*\(/.test(line)) return;
      const literal = hasLauncher(line);
      const named = [...kinds.keys()].find((k) => new RegExp(`\\$\\{[^}]*\\b${k}\\b`).test(line));
      if (!literal && !named) return;

      const site = `${rel}:${i + 1}`;
      const expectation = literal ? 'PINNED' : kinds.get(named);
      const key = keyOf(sentence(line));
      if (!key) { unresolved.push({ site, file: rel, why: 'no distinctive sentence beside the launcher' }); return; }

      const hits = product.filter((p) => p.sentence.includes(key));
      const found = [...new Set(hits.map((h) => h.kind))];
      if (hits.length === 0) {
        unresolved.push({ site, file: rel, why: `no product line carries "${key.slice(0, 48)}"` });
      } else if (found.length > 1) {
        unresolved.push({ site, file: rel,
          why: `"${key.slice(0, 48)}" matches both a PINNED and a DERIVED product line` });
      } else if (found[0] !== expectation) {
        mismatches.push({ site, expectation, product: `${hits[0].file}:${hits[0].line}`, kind: found[0],
          why: expectation === 'PINNED'
            ? 'a pinned expectation against a product line that DERIVES — red on every Windows cell'
            : 'a derived expectation against a product line that is PINNED — red on every Windows cell' });
      } else agreed += 1;
    });
  }

  // The baseline, both directions.
  const counted = new Map();
  for (const u of unresolved) counted.set(u.file, (counted.get(u.file) ?? 0) + 1);
  const drift = [];
  for (const [file, expected] of baseline) {
    const actual = counted.get(file) ?? 0;
    if (actual !== expected) drift.push(`${file}: ${actual} unresolved, the baseline says ${expected}`);
  }
  for (const [file, actual] of counted) {
    if (!baseline.has(file)) drift.push(`${file}: ${actual} unresolved site(s), and the file is not in the baseline`);
  }

  return { agreed, mismatches, unresolved, drift,
    ok: mismatches.length === 0 && drift.length === 0 };
}

const INVOKED_DIRECTLY = process.argv[1]
  && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));

if (INVOKED_DIRECTLY) {
  const r = audit();
  if (process.argv.includes('--json')) {
    writeSync(1, `${JSON.stringify(r, null, 2)}\n`);
  } else {
    for (const m of r.mismatches) {
      writeSync(2, `launcher-audit: MISMATCH ${m.site} — ${m.expectation} expectation, `
        + `${m.kind} product at ${m.product}\n  ${m.why}\n`);
    }
    for (const d of r.drift) writeSync(2, `launcher-audit: BASELINE ${d}\n`);
    writeSync(1, `launcher-audit: ${r.agreed} asserted launcher(s) agree with the product line that `
      + `prints them; ${r.unresolved.length} unresolved (ARC-07-C35b)\n`);
  }
  if (!r.ok) process.exitCode = 1;
}
