/**
 * ARC-07-C35b — the launcher audit's two missing pieces: a real string extractor, and command tracing.
 *
 * ARC-07-C35 shipped the audit with a key built by NORMALISING A LINE with regexes, and measured that it
 * resolved 12 of 70 asserted launchers. The row named both reasons, and both are visible in the failures:
 *
 *   - `expect(sv09.command).toBe(`${SERVER_CLI} upgrade`)` keyed as `sv09.command`, because the
 *     normaliser strips `expect(` and `.toBe(` but not the EXPRESSION between them. The key was assertion
 *     scaffolding, and no product line can carry it.
 *   - `store <command>` matches a pinned `store.mjs` and a deriving `store-command.ts`, so the
 *     architect's own named control pair — `store --help` reaches the engine, `store migrate --help`
 *     reaches the server, two commands apart in one file — could not be told apart at all.
 *
 * SO THIS PARSES INSTEAD OF NORMALISING, with `typescript`, which is already a pinned dependency here and
 * reads both `.mjs` and `.ts`. That is not gold-plating: the first reason above is not a regex that needs
 * one more case, it is a regex being asked to know where an expression ends. The extractor takes the
 * ARGUMENTS of the assertion call and nothing else, so `r.text`, `sv09.command` and
 * `status.configErrors[0]?.message` are excluded by construction rather than by another pattern.
 *
 * WHAT `sentence` MEANS HERE, and it is one definition for both sides: the prose a literal carries, with
 * every non-literal — an interpolation, a spelling constant, the launcher itself — replaced by one MARK.
 * A template literal contributes its cooked text with MARKs at its spans; `+` concatenation is joined; a
 * regex contributes its source with the escaping undone. TypeScript hands back cooked string values, so
 * `'a\\nb'` does not have to be unescaped by hand.
 *
 * COMMAND TRACING IS RULE 6 MECHANISED, and it reads the product's own route table rather than a list
 * written here: `COMMANDS` in `tools/snowarch/lib/cli.mjs` says which commands are `raw`, and the frame's
 * documented rule is that for a raw command everything after it belongs to the SERVER — including
 * `--help` once a sub-command is named — while a bare `--help` is the frame's own. So a case that spawns
 * `['store', '--help']` is answered by the engine and one that spawns `['store', 'migrate', '--help']` by
 * the server, which is exactly the pair the row asks to be told apart, decided by the argv the case runs.
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import ts from 'typescript';

import { COMMANDS } from '../../tools/snowarch/lib/cli.mjs';

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

/** A sentinel no source contains, written as an escape so it is visible in a diff. */
export const MARK = '\u0001';

/** Both spellings of both launchers. `.\snowarch.cmd` appears in source as `.\\snowarch.cmd`. */
export const LAUNCHER = /\.\/snowarch|\.\/bootstrap\.sh|\.\\snowarch\.cmd|\.\\bootstrap\.cmd/;

/** A spelling read from the process renders whatever machine runs it; one given a platform does not. */
const READS_THE_PROCESS = new Set(['spellings', 'cliSpelling', 'bootstrapSpelling']);

/**
 * ARC-07-C35's TARGET RULE, kept exactly: a launcher LITERAL, or a spelling INTERPOLATED INTO A STRING.
 *
 * A bare spelling argument is NOT a target, and that is measured rather than stylistic: C35's second
 * design treated `formatResult(r, SPELL)` — a line that THREADS a spelling and asserts nothing about a
 * launcher — as a target and produced 106 false ones, which would have made the baseline meaningless.
 * My first version of this extractor accepted any identifier that looked like a spelling and took the
 * count from 58 unresolved to 195, which is that same mistake arriving through a parser instead of a
 * regex. A parser is only better at what it is asked; this is what it is asked.
 */
const scriptKind = (file) => (/\.tsx?$/.test(file) ? ts.ScriptKind.TS : ts.ScriptKind.JS);

export const parse = (file, text) =>
  ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, scriptKind(file));

const lineOf = (sf, node) => sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;

/**
 * A launcher SPELLED OUT becomes the same MARK an interpolation does.
 *
 * Without this, a pinned product line keeps `./snowarch` in its prose while a test that interpolates a
 * spelling has a MARK there, and the two can never match — which is exactly how the architect's control
 * pair failed its FIRST direction while passing its second: `tools/snowarch/lib/store.mjs` spells the
 * launcher (it is generated, and still on ARC-07-C31's exemption list), so `usage: MARK store <command>`
 * found nothing in the engine. Marking both sides is what makes "the same sentence" mean the same thing on
 * both sides of the comparison, which is the property this audit is built on.
 */
const markLaunchers = (text) => text.replace(new RegExp(LAUNCHER.source, 'g'), MARK);

/** `/usage: x/` → `usage: x` — the source without its slashes, flags, or escaping. */
const regexProse = (raw) => raw
  .replace(/^\/|\/[a-z]*$/g, '')
  .replace(/\\([.\/\\()[\]{}^$*+?|\-])/g, '$1');

/**
 * Does this literal SPELL a launcher? A regex is unescaped first, and that is not a detail.
 *
 * `/run \.\/snowarch doctor/` contains `\.\/snowarch`, not `./snowarch`, so a detector that tested the
 * raw text saw no launcher and skipped the assertion entirely — my own case caught it. ARC-07-C35's
 * line-based `sentence()` unescaped before matching; the parser has to do the same or it is worse than
 * what it replaced at exactly the shape this repository writes most.
 */
const spellsLauncher = (node) => {
  // `node.text`, THE COOKED VALUE — never `getText()`, which is the SOURCE. A Windows launcher is written
  // `'.\\snowarch.cmd'` in a source file and IS `.\snowarch.cmd` once cooked, and `LAUNCHER` describes the
  // cooked form. Testing the source meant every Windows-spelled literal in the repository was invisible to
  // this audit: 24 lines across 11 test files, including the seven engine literals ARC-07-C31 slice 2 fixed
  // and the seventeen server ones slice 3 fixed — so `EXPECTED_RENDERING`, whose whole purpose is the
  // win32 cell, had only ever seen POSIX. Measured: the fixture
  // `assert.equal(out, '.\\snowarch.cmd doctor')` yielded 0 sites and `'./snowarch doctor'` yielded 1.
  if (ts.isStringLiteralLike(node)) return LAUNCHER.test(node.text);
  // A REGEX IS NOT READ HERE, and that is a scope decision with a measurement behind it rather than an
  // oversight. `/run \.\/snowarch doctor/` holds `\.\/snowarch`, so unescaping it first — which
  // `regexProse` below does, and which ARC-07-C35's line-based version did — detects 45 more asserted
  // launchers. Turning that on produced THIRTEEN reported mismatches, every one of them correct code, and
  // chasing them down needs three separate pieces this row does not have: a product-side kind that knows
  // `${spellings({ platform: 'linux' }).cli}` is PINNED though it is an interpolation; the committed
  // generated pages indexed as product artefacts, because a page asserted by `install-page.test.mjs` is
  // POSIX by rule 3 and its runtime twin derives; and a way to tell a GENERATOR's sentence from the runtime
  // sentence it writes, since `scripts/gen-doctor-docs.mjs` carries the same words as the check it renders.
  // Shipping the widening without those would mean an audit that cries wolf on correct tests, which is how
  // a gate gets switched off. It is ARC-07-C35c, with those three pieces and this measurement as its start.
  return false;
};

/**
 * The prose a node carries, with MARK wherever something is not a literal.
 *
 * This is the whole of piece (a). It walks the expression rather than the text, so what comes back is
 * the sentence the test asserts — never the expression it asserts it about.
 */
export function proseOf(node) {
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return markLaunchers(node.text);
  if (ts.isRegularExpressionLiteral(node)) return markLaunchers(regexProse(node.getText()));

  if (ts.isTemplateExpression(node)) {
    // The head, then every span: the interpolation becomes one MARK and the literal text after it stays.
    return markLaunchers(node.head.text
      + node.templateSpans.map((span) => MARK + span.literal.text).join(''));
  }

  // `'a' + b + 'c'` — the literals are prose and everything else is a MARK.
  if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.PlusToken) {
    return proseOf(node.left) + proseOf(node.right);
  }

  if (ts.isParenthesizedExpression(node)) return proseOf(node.expression);

  // `new RegExp(`usage: ${CLI} …`)` and `esc(FRAME_CLI)`: the prose is in the arguments.
  if (ts.isNewExpression(node) || ts.isCallExpression(node)) {
    return (node.arguments ?? []).map((a) => proseOf(a)).join(' ');
  }

  // Everything else — an identifier, a property access, a call result — is not prose.
  return MARK;
}

/**
 * True when this node ASSERTS a launcher: a literal that spells one, or a string that interpolates one.
 *
 * `interpolatesSpelling` is what keeps a threaded spelling out: `${SPELL.cli}` inside a template is a
 * launcher rendered into prose, while `formatResult(r, SPELL)` is a spelling being passed to a function.
 */
function carriesLauncher(node, spellings) {
  let found = false;
  const walk = (n) => {
    if (found) return;
    if (spellsLauncher(n)) { found = true; return; }
    // A spelling interpolated INTO a string: a template span, or `'prose' + CLI`.
    if (ts.isTemplateExpression(n)
      && n.templateSpans.some((span) => mentionsSpelling(span.expression, spellings))) {
      found = true; return;
    }
    if (ts.isBinaryExpression(n) && n.operatorToken.kind === ts.SyntaxKind.PlusToken) {
      const sides = [n.left, n.right];
      const prose = sides.some((side) => ts.isStringLiteralLike(side));
      const spelling = sides.some((side) => mentionsSpelling(side, spellings));
      if (prose && spelling) { found = true; return; }
    }
    ts.forEachChild(n, walk);
  };
  walk(node);
  return found;
}

/** A named spelling constant, or a spelling call, appearing in this expression. */
function mentionsSpelling(node, spellings) {
  let hit = false;
  const walk = (n) => {
    if (hit) return;
    if (ts.isIdentifier(n) && spellings.has(n.text)) { hit = true; return; }
    if (ts.isCallExpression(n)) {
      const name = ts.isIdentifier(n.expression) ? n.expression.text
        : (ts.isPropertyAccessExpression(n.expression) ? n.expression.name.text : null);
      if (name && READS_THE_PROCESS.has(name)) { hit = true; return; }
    }
    ts.forEachChild(n, walk);
  };
  walk(node);
  return hit;
}

/** A launcher written out in a literal — the expectation is PINNED rather than derived. */
function hasLauncherLiteral(node) {
  let found = false;
  const walk = (n) => {
    if (found) return;
    if (spellsLauncher(n)) { found = true; return; }
    ts.forEachChild(n, walk);
  };
  walk(node);
  return found;
}

/**
 * Every `const X = <spelling call>` in a file, and whether that spelling READS THE PROCESS.
 *
 * `const SERVER_CLI = esc(cliSpelling())` is DERIVED — it renders the machine running the test, which is
 * the property rule 1 is about. `cliSpelling('win32', {})` is PINNED: a fixture that names its platform.
 */
export function spellingConstants(sf) {
  const kinds = new Map();
  const walk = (node) => {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer) {
      const call = findSpellingCall(node.initializer);
      if (call) kinds.set(node.name.text, call.arguments.length === 0 ? 'DERIVED' : 'PINNED');
    }
    ts.forEachChild(node, walk);
  };
  walk(sf);
  return kinds;
}

function findSpellingCall(node) {
  let hit = null;
  const walk = (n) => {
    if (hit) return;
    if (ts.isCallExpression(n)) {
      const name = ts.isIdentifier(n.expression) ? n.expression.text
        : (ts.isPropertyAccessExpression(n.expression) ? n.expression.name.text : null);
      if (name && READS_THE_PROCESS.has(name)) { hit = n; return; }
    }
    ts.forEachChild(n, walk);
  };
  walk(node);
  return hit;
}

/**
 * The VALUE an assertion is about — and whether the case pinned the shell that produced it.
 *
 * WITHOUT THIS THE AUDIT CRIES WOLF. Once launchers inside regexes were detected, thirteen sites were
 * reported as "a pinned expectation against a product line that DERIVES", and every one of them was
 * CORRECT code: `assert.match(MODE_VARIANTS.unconfigured(win), /\.\\snowarch\.cmd mode live/)` supplies a
 * win32 spelling to the product and asserts the win32 rendering, which is precisely the pattern ARC-07-C31
 * established — drive both platforms by argument, assert each spelling. The product line derives, the
 * literal is the expected OUTPUT, and the two agree.
 *
 * So a launcher literal is a PINNED EXPECTATION only when nothing pinned the shell behind the value. When
 * the subject carries a pinned spelling, the literal is an expected rendering and a deriving product line
 * is what should be there.
 *
 * ONE HOP THROUGH A LOCAL VARIABLE, because that is what the cases actually write:
 * `const vWin = renderVersion(info, win).join('\n')` on one line and the assertion on the next. One hop is
 * bounded and enough; a second would be dataflow analysis, and an audit that needs that is the wrong shape.
 */
function subjectOf(node) {
  const { expression } = node;
  // `expect(subject).toContain(…)` — the subject is the argument of the `expect` call in the chain.
  if (ts.isPropertyAccessExpression(expression)) {
    let inner = expression.expression;
    while (inner && !ts.isCallExpression(inner)) {
      inner = ts.isPropertyAccessExpression(inner) || ts.isNonNullExpression(inner) ? inner.expression : null;
    }
    if (inner && ts.isIdentifier(inner.expression) && inner.expression.text === 'expect') {
      return inner.arguments[0] ?? null;
    }
  }
  // `assert.equal(subject, expected)` and friends.
  return node.arguments[0] ?? null;
}

/** Does the subject carry a spelling whose platform was NAMED — a pinned shell driven into the product? */
function subjectPinsShell(sf, assertion, subject, pinned) {
  if (subject && mentionsPinned(subject, pinned)) return true;

  /*
   * THE ENCLOSING CASE, not one hop, and measuring is what moved this line.
   *
   * One hop covered the cases that read `const vWin = renderVersion(info, win)` on the line above the
   * assertion, and left eight more where the pinned shell is three or four statements away — `said` is
   * collected from a run, `finished` joins it, the assertion matches `finished`. Following that properly is
   * dataflow analysis, and an audit that needs dataflow is the wrong shape; the question it actually has to
   * answer is simpler: DID THIS CASE DRIVE A PINNED SHELL? If it did, a launcher literal in it is an
   * expected rendering, because that is the only reason to pin one.
   *
   * THE LIMIT, written down rather than discovered: a case that drives a pinned shell for one assertion and
   * wrongly hard-codes a launcher in another is not caught here. That is a false NEGATIVE, which for an
   * advisory audit is the safer direction — `tests/windows-spellings.test.mjs` still holds the hard rule
   * that no source line outside the definitions spells a launcher at all.
   */
  let scope = assertion.parent;
  while (scope && !ts.isFunctionLike(scope)) scope = scope.parent;
  return Boolean(scope && mentionsPinned(scope, pinned));
}

/**
 * A spelling that NAMED its platform: a pinned constant, `cliSpelling('win32', {})`, or a PLATFORM LITERAL.
 *
 * `DOCTOR_USAGE({ platform: 'win32', env: {} })` pins the shell without naming a spelling at all, and it is
 * how most of this repository drives the other platform — ARC-07 measured that forcing `process.platform`
 * is unusable locally, so every case since drives by argument. Without this arm, `cli-help.test.mjs:134`
 * asserted `.\snowarch.cmd doctor` against a deriving product line and was reported as a defect.
 */
function mentionsPinned(node, pinned) {
  let hit = false;
  const walk = (n) => {
    if (hit) return;
    if (ts.isIdentifier(n) && pinned.has(n.text)) { hit = true; return; }
    if (ts.isPropertyAssignment(n) && ts.isIdentifier(n.name) && n.name.text === 'platform'
      && ts.isStringLiteralLike(n.initializer)) {
      hit = true; return;
    }
    if (ts.isCallExpression(n)) {
      const name = ts.isIdentifier(n.expression) ? n.expression.text
        : (ts.isPropertyAccessExpression(n.expression) ? n.expression.name.text : null);
      if (name && READS_THE_PROCESS.has(name) && n.arguments.length > 0) { hit = true; return; }
    }
    ts.forEachChild(n, walk);
  };
  walk(node);
  return hit;
}

/**
 * Assertions whose FIRST argument is the value under test rather than the expectation.
 *
 * `assert.equal(bare('run .\\snowarch.cmd doctor'), false)` in `tests/windows-spellings.test.mjs` feeds a
 * launcher to the instrument it is testing: the launcher is INPUT, and the expectation is `false`. Treating
 * argument 0 as an expectation reported that case as a pinned expectation against a deriving product line —
 * a defect in a case whose whole subject is launcher spellings.
 *
 * `assert.ok(text.includes(`${CLI} doctor`))` is the other shape and must keep working: there is no separate
 * expected value, so argument 0 IS the expectation. The split is by assertion name, which is the only place
 * the difference is stated.
 */
const SUBJECT_FIRST = new Set(['equal', 'notEqual', 'strictEqual', 'notStrictEqual', 'deepEqual',
  'notDeepEqual', 'deepStrictEqual', 'match', 'doesNotMatch', 'include', 'notInclude']);

/** The arguments that carry what the assertion EXPECTS, with the subject dropped where there is one. */
function expectationArgs(node) {
  const { expression } = node;
  if (ts.isPropertyAccessExpression(expression)) {
    const root = rootIdentifier(expression);
    // `expect(subject).toContain(expected)` — the outer call's arguments are already the expectation.
    if (root === 'expect') return node.arguments;
    if (root === 'assert' && SUBJECT_FIRST.has(expression.name.text)) return node.arguments.slice(1);
  }
  return node.arguments;
}

/** An assertion: `assert.*(…)`, `expect(…).*(…)`, or a bare `assert(…)`. */
function assertionArgs(node) {
  if (!ts.isCallExpression(node)) return null;
  const { expression } = node;
  if (ts.isIdentifier(expression) && expression.text === 'assert') return node.arguments;
  if (ts.isPropertyAccessExpression(expression)) {
    const root = rootIdentifier(expression);
    if (root === 'assert' || root === 'expect') return node.arguments;
  }
  return null;
}

function rootIdentifier(node) {
  let n = node;
  while (n && !ts.isIdentifier(n)) {
    if (ts.isPropertyAccessExpression(n) || ts.isCallExpression(n)) n = n.expression;
    else if (ts.isNonNullExpression(n) || ts.isParenthesizedExpression(n)) n = n.expression;
    else return null;
  }
  return n?.text ?? null;
}

/** The string-literal argv of a call like `run(entry, ['store', '--help'])` or `cli(['--json'])`. */
function argvOf(node) {
  for (const arg of node.arguments ?? []) {
    if (!ts.isArrayLiteralExpression(arg)) continue;
    const words = arg.elements.map((e) => (ts.isStringLiteral(e) ? e.text : null));
    // A single non-literal element makes the argv unknowable rather than partially known: a partially
    // known argv would route by a prefix the case may not actually run.
    if (words.length > 0 && words.every((w) => w !== null)) return words;
  }
  return null;
}

/**
 * The argv the enclosing case runs — the LAST spawn-shaped call before the assertion in the same body.
 *
 * Scoped to the enclosing function so a spawn in a neighbouring case cannot be borrowed, and LAST rather
 * than first because a case that runs two commands asserts about the most recent one.
 */
function argvInScope(sf, assertion) {
  let best = null;
  const within = (node) => {
    ts.forEachChild(node, (child) => {
      if (child.getStart(sf) >= assertion.getStart(sf)) return;
      if (ts.isCallExpression(child)) {
        const name = ts.isIdentifier(child.expression) ? child.expression.text
          : (ts.isPropertyAccessExpression(child.expression) ? child.expression.name.text : null);
        if (name && /^(run|cli|spawnSync|execFileSync|runAt|lintAt|snowarch)$/.test(name)) {
          const argv = argvOf(child);
          if (argv) best = argv;
        }
      }
      within(child);
    });
  };
  // Walk out to the enclosing function body, then scan it forwards to the assertion.
  let scope = assertion.parent;
  while (scope && !ts.isFunctionLike(scope) && !ts.isSourceFile(scope)) scope = scope.parent;
  if (scope) within(scope);
  return best;
}

/**
 * Which package ANSWERS this argv — piece (b), read from the frame's own table.
 *
 * `COMMANDS[name].raw` is the frame saying "everything after this is the server CLI's, unparsed"; the
 * comment beside it adds that only a BARE `--help` is the frame's own. So a raw command with a further
 * positional is the server's, and everything else is the engine's. `null` when the argv names no command
 * this frame knows — an unknown route is not a guess.
 */
export function answeredBy(argv) {
  if (!Array.isArray(argv)) return null;
  const words = argv.filter((w) => typeof w === 'string');
  const at = words.findIndex((w) => Object.hasOwn(COMMANDS, w));
  if (at === -1) return null;
  const command = COMMANDS[words[at]];
  if (!command?.raw) return 'engine';
  const rest = words.slice(at + 1).filter((w) => !w.startsWith('-'));
  return rest.length > 0 ? 'server' : 'engine';
}

/**
 * Every asserted launcher in one test file: what it expects, the sentence it asserts, and what it ran.
 *
 * `sentence` is the prose of the assertion's ARGUMENTS only. `argv`/`answeredBy` are the route when the
 * case spawns something, and null when it calls a function directly — in which case the audit resolves by
 * sentence alone, exactly as before.
 */
export function assertedLaunchers(file, text) {
  const sf = parse(file, text);
  const spellings = spellingConstants(sf);
  const pinned = new Set([...spellings].filter(([, kind]) => kind === 'PINNED').map(([name]) => name));
  const sites = [];

  const walk = (node) => {
    const args = assertionArgs(node);
    if (args && args.length > 0) {
      const bearing = expectationArgs(node).filter((a) => carriesLauncher(a, spellings));
      if (bearing.length > 0) {
        const literal = bearing.some((a) => hasLauncherLiteral(a));
        const named = bearing.map((a) => namedSpelling(a, spellings)).find(Boolean) ?? null;
        const argv = argvInScope(sf, node);
        const pinnedSubject = subjectPinsShell(sf, node, subjectOf(node), pinned);
        sites.push({
          file,
          line: lineOf(sf, node),
          // A launcher literal is a PINNED expectation only when nothing pinned the shell behind the
          // value. `EXPECTED_RENDERING` is the third answer, and it is what stopped thirteen correct
          // assertions being reported as defects.
          expectation: literal
            ? (pinnedSubject ? 'EXPECTED_RENDERING' : 'PINNED')
            : (spellings.get(named) ?? 'DERIVED'),
          pinnedSubject,
          sentence: bearing.map((a) => proseOf(a)).join(' '),
          argv,
          answeredBy: answeredBy(argv),
        });
        // An assertion nested inside an assertion is the same site; do not walk into it twice.
        return;
      }
    }
    ts.forEachChild(node, walk);
  };
  walk(sf);
  return sites;
}

function namedSpelling(node, spellings) {
  let hit = null;
  const walk = (n) => {
    if (hit) return;
    if (ts.isIdentifier(n) && spellings.has(n.text)) { hit = n.text; return; }
    ts.forEachChild(n, walk);
  };
  walk(node);
  return hit;
}

/**
 * Every product line that spells or derives a launcher, as a sentence with its kind and its package.
 *
 * The same extractor on the other side, which is what makes "the same sentence" one definition. The
 * package is what command tracing compares against: a site routed to the server cannot be answered by a
 * line in `tools/snowarch/lib`.
 */
export function productLines(file, text) {
  const sf = parse(file, text);
  const lines = [];
  const walk = (node) => {
    if (ts.isStringLiteralLike(node) || ts.isRegularExpressionLiteral(node) || ts.isTemplateExpression(node)) {
      const spelled = spellsLauncher(node);
      const interpolated = ts.isTemplateExpression(node)
        && node.templateSpans.some((s) => /cli|bootstrap|spell|CLI|POSIX|Spelling|SPELL/.test(s.expression.getText()));
      if (spelled || interpolated) {
        lines.push({ file, line: lineOf(sf, node), sentence: proseOf(node),
          kind: spelled ? 'PINNED' : 'DERIVED', package: packageOf(file) });
      }
    }
    ts.forEachChild(node, walk);
  };
  walk(sf);
  return lines;
}

/** `engine` · `server` · `scripts` — which tree a product file lives in. */
export function packageOf(file) {
  if (file.startsWith('packages/snowarch/')) return 'server';
  if (file.startsWith('tools/snowarch/')) return 'engine';
  return 'scripts';
}

export const readFile = (rel) => readFileSync(resolve(ROOT, rel), 'utf8');
